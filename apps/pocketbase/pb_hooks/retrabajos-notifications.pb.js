/// <reference path="../pb_data/types.d.ts" />

// Notifications for the retrabajo (rework) flow:
//  - assigned  → notify the operario (in-app + email)
//  - completed → notify all calidad users (rework ready for QC verification)
//  - rejected  → notify calidad users
//  - verified  → notify the operario who did the rework

function crearNotificacio(app, destinatariId, tipus, titol, missatge, linkId) {
  try {
    const col = app.findCollectionByNameOrId("notifications");
    const rec = new Record(col, {
      destinatari: destinatariId,
      tipus: tipus,
      titol: titol,
      missatge: missatge,
      link_id: linkId || "",
      llegida: false,
    });
    app.save(rec);
  } catch (err) {
    app.logger().error("crearNotificacio failed", "err", String(err));
  }
}

function enviarEmail(app, toEmail, subject, html) {
  if (!toEmail) return;
  try {
    const message = new MailerMessage({
      from: { name: "Control de Calidad" },
      to: [{ address: toEmail }],
      subject: subject,
      html: html,
    });
    app.newMailClient().send(message);
  } catch (err) {
    app.logger().error("retrabajo email failed", "to", toEmail, "err", String(err));
  }
}

function notificarRol(app, rol, tipus, titol, missatge, linkId) {
  try {
    const users = app.findRecordsByFilter("users", "rol = {:rol}", "", 100, 0, { rol: rol });
    for (const u of users) {
      crearNotificacio(app, u.id, tipus, titol, missatge, linkId);
      enviarEmail(app, u.getString("email"), titol, "<p>" + missatge + "</p>");
    }
  } catch (err) {
    app.logger().error("notificarRol failed", "rol", rol, "err", String(err));
  }
}

onRecordAfterCreateSuccess((e) => {
  const r = e.record;
  const opId = r.getString("operario_asignado");
  const exNom = "";
  const exclusiva = r.getString("exclusiva");
  const operacion = r.getString("operacion_original") || "—";
  const motivo = r.getString("motivo_rechazo") || "";
  const intento = r.getInt("numero_intento") || 1;

  // Stamp assignment date
  try {
    r.set("fecha_asignacion", new Date().toISOString());
    app.save(r);
  } catch (_) {}

  if (opId) {
    let opEmail = "";
    let opNom = "";
    try {
      const op = app.findRecordById("users", opId);
      opEmail = op.getString("email");
      opNom = op.getString("name") || op.getString("codi") || "operario";
    } catch (_) {}

    const titol = "Nuevo retrabajo asignado (#" + intento + ")";
    const missatge = "Operación: " + operacion + ". Motivo: " + motivo;
    crearNotificacio(app, opId, "retrabajo_asignado", titol, missatge, r.id);
    enviarEmail(
      app,
      opEmail,
      titol,
      "<p>Hola " + opNom + ",</p><p>Se te ha asignado un retrabajo.</p><p><strong>Operación:</strong> " +
        operacion + "<br><strong>Intento:</strong> #" + intento + "<br><strong>Motivo:</strong> " +
        motivo + "</p><p>Revisa tu cola de trabajo.</p>",
    );
  }

  e.next();
}, "retrabajos");

onRecordAfterUpdateSuccess((e) => {
  const r = e.record;
  const estado = r.getString("estado");
  const operacion = r.getString("operacion_original") || "—";
  const opId = r.getString("operario_asignado");
  const intento = r.getInt("numero_intento") || 1;

  if (estado === "completado") {
    const missatge = "Retrabajo completado por el operario y listo para verificar. Operación: " + operacion + " (intento #" + intento + ").";
    notificarRol(app, "qualitat", "retrabajo_completado", "Retrabajo completado — verificar QC", missatge, r.id);
    notificarRol(app, "admin", "retrabajo_completado", "Retrabajo completado — verificar QC", missatge, r.id);
  } else if (estado === "rechazado") {
    const missatge = "Un retrabajo ha sido rechazado de nuevo. Operación: " + operacion + " (intento #" + intento + ").";
    notificarRol(app, "qualitat", "retrabajo_rechazado", "Retrabajo rechazado de nuevo", missatge, r.id);
    notificarRol(app, "admin", "retrabajo_rechazado", "Retrabajo rechazado de nuevo", missatge, r.id);
  } else if (estado === "verificado") {
    let opEmail = "";
    try {
      const op = app.findRecordById("users", opId);
      opEmail = op.getString("email");
    } catch (_) {}
    const missatge = "Tu retrabajo ha sido verificado y aceptado por Calidad. Operación: " + operacion + ".";
    crearNotificacio(app, opId, "retrabajo_verificado", "Retrabajo verificado ✓", missatge, r.id);
    enviarEmail(app, opEmail, "Retrabajo verificado ✓", "<p>" + missatge + "</p>");
  }

  e.next();
}, "retrabajos");

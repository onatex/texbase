/// <reference path="../pb_data/types.d.ts" />

// Notificaciones del flujo de retrabajos:
//  - asignado   → notificación en la app (la lee RetrabajoPopup) + email al operario
//  - completado → email a calidad y admin
//  - rechazado  → email a calidad y admin
//  - verificado → email al operario
//
// Las notificaciones en la app de completado/rechazado/verificado ya las crea el
// frontend; aquí solo se envía el email para no duplicarlas.
//
// IMPORTANTE (JSVM): cada handler se ejecuta en un VM aislado, así que no puede
// usar funciones ni variables del nivel superior del archivo (ni existe una
// variable global `app`; se usa `e.app`). Antes este archivo dependía de ambas
// cosas y lanzaba "ReferenceError: app is not defined": la petición devolvía
// error 400 aunque el registro sí se guardaba.

onRecordAfterCreateSuccess((e) => {
  const app = e.app;
  const r = e.record;
  const opId = r.getString("operario_asignado");

  try {
    r.set("fecha_asignacion", new Date().toISOString());
    app.saveNoValidate(r);
  } catch (err) {
    app.logger().error("retrabajo fecha_asignacion", "err", String(err));
  }

  if (opId) {
    const operacion = r.getString("operacion_original") || "—";
    const motivo = r.getString("motivo_rechazo") || "";
    const intento = r.getInt("numero_intento") || 1;
    const titol = "Nuevo retrabajo asignado (#" + intento + ")";

    try {
      const col = app.findCollectionByNameOrId("notifications");
      const n = new Record(col);
      n.load({
        destinatari: opId,
        tipus: "retrabajo_asignado",
        titol: titol,
        missatge: "Operación: " + operacion + ". Motivo: " + motivo,
        link_id: r.id,
        llegida: false,
      });
      app.save(n);
    } catch (err) {
      app.logger().error("retrabajo notificación", "err", String(err));
    }

    try {
      const op = app.findRecordById("users", opId);
      const email = op.getString("email");
      if (email && app.settings().smtp.enabled) {
        const nom = op.getString("name") || op.getString("codi") || "operario";
        app.newMailClient().send(new MailerMessage({
          from: { address: app.settings().meta.senderAddress, name: "Control de Calidad" },
          to: [{ address: email }],
          subject: titol,
          html: "<p>Hola " + nom + ",</p><p>Se te ha asignado un retrabajo.</p><p><strong>Operación:</strong> " +
            operacion + "<br><strong>Intento:</strong> #" + intento + "<br><strong>Motivo:</strong> " +
            motivo + "</p><p>Revisa tu cola de trabajo.</p>",
        }));
      }
    } catch (err) {
      app.logger().error("retrabajo email asignado", "err", String(err));
    }
  }

  e.next();
}, "retrabajos");

onRecordAfterUpdateSuccess((e) => {
  const app = e.app;
  const r = e.record;
  const estado = r.getString("estado");
  const anterior = e.record.original().getString("estado");

  if (estado === anterior || !app.settings().smtp.enabled) {
    e.next();
    return;
  }

  const operacion = r.getString("operacion_original") || "—";
  const intento = r.getInt("numero_intento") || 1;
  let destinatarios = [];
  let asunto = "";
  let texto = "";

  try {
    if (estado === "completado" || estado === "rechazado") {
      asunto = estado === "completado" ? "Retrabajo completado — verificar QC" : "Retrabajo rechazado de nuevo";
      texto = (estado === "completado"
        ? "Retrabajo completado por el operario y listo para verificar."
        : "Un retrabajo ha sido rechazado de nuevo.") + " Operación: " + operacion + " (intento #" + intento + ").";
      destinatarios = app.findRecordsByFilter("users", "rol = 'qualitat' || rol = 'admin'", "", 100, 0);
    } else if (estado === "verificado" && r.getString("operario_asignado")) {
      asunto = "Retrabajo verificado ✓";
      texto = "Tu retrabajo ha sido verificado y aceptado por Calidad. Operación: " + operacion + ".";
      destinatarios = [app.findRecordById("users", r.getString("operario_asignado"))];
    }
  } catch (err) {
    app.logger().error("retrabajo destinatarios", "err", String(err));
  }

  for (const u of destinatarios) {
    const email = u.getString("email");
    if (!email) continue;
    try {
      app.newMailClient().send(new MailerMessage({
        from: { address: app.settings().meta.senderAddress, name: "Control de Calidad" },
        to: [{ address: email }],
        subject: asunto,
        html: "<p>" + texto + "</p>",
      }));
    } catch (err) {
      app.logger().error("retrabajo email", "to", email, "err", String(err));
    }
  }

  e.next();
}, "retrabajos");

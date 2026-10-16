/// <reference path="../pb_data/types.d.ts" />

// Adds time-tracking fields to `retrabajos` and `controles_qualitat` to support
// the paused/resumed QC + rework time-accounting flow.
// Also opens controles_qualitat.updateRule so Calidad can resume/complete a QC session.

migrate(
  (app) => {
    // ── retrabajos: rework timer fields ──
    const retr = app.findCollectionByNameOrId("retrabajos");

    if (!retr.fields.getByName("tiempo_retrabajo_seg")) {
      retr.fields.add(
        new NumberField({ name: "tiempo_retrabajo_seg", required: false }),
      );
    }
    if (!retr.fields.getByName("fecha_inicio_retrabajo")) {
      retr.fields.add(new DateField({ name: "fecha_inicio_retrabajo", required: false }));
    }
    if (!retr.fields.getByName("fecha_fin_retrabajo")) {
      retr.fields.add(new DateField({ name: "fecha_fin_retrabajo", required: false }));
    }
    app.save(retr);

    // ── controles_qualitat: QC session time + state ──
    const cq = app.findCollectionByNameOrId("controles_qualitat");

    if (!cq.fields.getByName("tiempo_qc_inicial_seg")) {
      cq.fields.add(new NumberField({ name: "tiempo_qc_inicial_seg", required: false }));
    }
    if (!cq.fields.getByName("tiempo_qc_adicional_seg")) {
      cq.fields.add(new NumberField({ name: "tiempo_qc_adicional_seg", required: false }));
    }
    if (!cq.fields.getByName("tiempo_qc_total_seg")) {
      cq.fields.add(new NumberField({ name: "tiempo_qc_total_seg", required: false }));
    }
    if (!cq.fields.getByName("tiempo_retrabajo_total_seg")) {
      cq.fields.add(new NumberField({ name: "tiempo_retrabajo_total_seg", required: false }));
    }
    if (!cq.fields.getByName("retrabajos_count")) {
      cq.fields.add(new NumberField({ name: "retrabajos_count", required: false, onlyInt: true }));
    }
    if (!cq.fields.getByName("estado_qc")) {
      cq.fields.add(
        new SelectField({
          name: "estado_qc",
          required: false,
          maxSelect: 1,
          values: ["en_proceso", "en_retrabajo", "completado", "rechazado"],
        }),
      );
    }
    if (!cq.fields.getByName("retrabajo_activo")) {
      cq.fields.add(
        new RelationField({
          name: "retrabajo_activo",
          required: false,
          maxSelect: 1,
          collectionId: retr.id,
          cascadeDelete: false,
        }),
      );
    }
    // Allow Calidad/Admin/Superadmin to update the QC session (resume/complete/verify)
    cq.updateRule = "@request.auth.rol = 'admin' || @request.auth.rol = 'qualitat' || @request.auth.rol = 'superadmin'";
    app.save(cq);
  },
  (app) => {
    try {
      const retr = app.findCollectionByNameOrId("retrabajos");
      ["tiempo_retrabajo_seg", "fecha_inicio_retrabajo", "fecha_fin_retrabajo"].forEach((n) => {
        if (retr.fields.getByName(n)) retr.fields.removeByName(n);
      });
      app.save(retr);
    } catch (e) { if (!e.message.includes("no rows")) throw e; }

    try {
      const cq = app.findCollectionByNameOrId("controles_qualitat");
      ["tiempo_qc_inicial_seg", "tiempo_qc_adicional_seg", "tiempo_qc_total_seg",
       "tiempo_retrabajo_total_seg", "retrabajos_count", "estado_qc", "retrabajo_activo"].forEach((n) => {
        if (cq.fields.getByName(n)) cq.fields.removeByName(n);
      });
      cq.updateRule = null;
      app.save(cq);
    } catch (e) { if (!e.message.includes("no rows")) throw e; }
  },
);

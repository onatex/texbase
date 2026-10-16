/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // ── retrabajos: add prioridad, unidad_numero; make operario_asignado optional ──
    const retrabajos = app.findCollectionByNameOrId("retrabajos");

    // Make operario_asignado optional so the simplified per-unit QC flow can create
    // a retrabajo without assigning an operario immediately (producción/admin assigns later).
    const opField = retrabajos.fields.getByName("operario_asignado");
    if (opField) {
      opField.required = false;
    }

    if (!retrabajos.fields.getByName("prioridad")) {
      retrabajos.fields.add(
        new SelectField({
          name: "prioridad",
          maxSelect: 1,
          values: ["baja", "media", "alta"],
        }),
      );
    }

    if (!retrabajos.fields.getByName("unidad_numero")) {
      retrabajos.fields.add(
        new NumberField({
          name: "unidad_numero",
          onlyInt: true,
        }),
      );
    }

    app.save(retrabajos);

    // ── no_conformitats: add unidad_numero to link NC to a specific unit ──
    const nc = app.findCollectionByNameOrId("no_conformitats");
    if (!nc.fields.getByName("unidad_numero")) {
      nc.fields.add(
        new NumberField({
          name: "unidad_numero",
          onlyInt: true,
        }),
      );
      app.save(nc);
    }
  },
  (app) => {
    try {
      const retrabajos = app.findCollectionByNameOrId("retrabajos");
      const opField = retrabajos.fields.getByName("operario_asignado");
      if (opField) opField.required = true;
      try { retrabajos.fields.removeByName("prioridad"); } catch (_) {}
      try { retrabajos.fields.removeByName("unidad_numero"); } catch (_) {}
      app.save(retrabajos);
    } catch (_) {}

    try {
      const nc = app.findCollectionByNameOrId("no_conformitats");
      try { nc.fields.removeByName("unidad_numero"); } catch (_) {}
      app.save(nc);
    } catch (_) {}
  },
);

/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const exclusives = app.findCollectionByNameOrId("exclusives");

    // ── control_calidad: per-unit quality control state ──
    let cc;
    try {
      cc = app.findCollectionByNameOrId("control_calidad");
    } catch (_) {
      cc = new Collection({
        type: "base",
        name: "control_calidad",
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'qualitat')",
        deleteRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        fields: [
          {
            name: "exclusiva_id",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: exclusives.id,
            cascadeDelete: true,
          },
          { name: "unidad_numero", type: "number", required: true, onlyInt: true },
          {
            name: "estado",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["pendiente", "conforme", "rechazada"],
          },
          { name: "observaciones", type: "text", max: 2000 },
          { name: "fecha_revision", type: "date" },
          {
            name: "usuario_id",
            type: "relation",
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: false,
          },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_cc_exclusiva ON control_calidad (exclusiva_id)",
          "CREATE UNIQUE INDEX idx_cc_exclusiva_unidad ON control_calidad (exclusiva_id, unidad_numero)",
        ],
      });
      app.save(cc);
    }

    // ── historial_control_calidad: audit trail of every unit revision ──
    let hc;
    try {
      hc = app.findCollectionByNameOrId("historial_control_calidad");
    } catch (_) {
      hc = new Collection({
        type: "base",
        name: "historial_control_calidad",
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        deleteRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        fields: [
          {
            name: "exclusiva_id",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: exclusives.id,
            cascadeDelete: true,
          },
          { name: "unidad_numero", type: "number", required: true, onlyInt: true },
          {
            name: "estado",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["pendiente", "conforme", "rechazada"],
          },
          { name: "observaciones", type: "text", max: 2000 },
          { name: "fecha", type: "date", required: true },
          {
            name: "usuario_id",
            type: "relation",
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: false,
          },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_hcc_exclusiva ON historial_control_calidad (exclusiva_id)",
        ],
      });
      app.save(hc);
    }
  },
  (app) => {
    try { app.delete(app.findCollectionByNameOrId("historial_control_calidad")); } catch (_) {}
    try { app.delete(app.findCollectionByNameOrId("control_calidad")); } catch (_) {}
  },
);

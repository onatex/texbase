/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const exclusives = app.findCollectionByNameOrId("exclusives");

    // ── proveedores (new, dedicated to fase externalization) ──────────────
    let prov;
    try { prov = app.findCollectionByNameOrId("proveedores"); } catch (_) {
      prov = new Collection({
        type: "base",
        name: "proveedores",
        listRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio' || @request.auth.rol = 'externalitzacio')",
        viewRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio' || @request.auth.rol = 'externalitzacio')",
        createRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        updateRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        deleteRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        fields: [
          { name: "nombre", type: "text", required: true, max: 200 },
          { name: "contacto", type: "text", max: 200 },
          { name: "email", type: "email" },
          { name: "telefono", type: "text", max: 50 },
          { name: "direccion", type: "text", max: 300 },
          { name: "especialidad", type: "json", maxSize: 10000 },
          { name: "precio_base", type: "number" },
          { name: "tiempo_entrega_dias", type: "number" },
          { name: "activo", type: "bool" },
          { name: "notas", type: "text", max: 2000 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      });
      app.save(prov);
    }

    // ── fases_articulo (default phase config per article code) ────────────
    let fa;
    try { fa = app.findCollectionByNameOrId("fases_articulo"); } catch (_) {
      fa = new Collection({
        type: "base",
        name: "fases_articulo",
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio'",
        updateRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio'",
        deleteRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        fields: [
          { name: "articulo", type: "text", required: true, max: 120 },
          { name: "numero_fase", type: "number", onlyInt: true },
          { name: "nombre_fase", type: "text", required: true, max: 200 },
          { name: "descripcion", type: "text", max: 2000 },
          { name: "tiempo_estimado_seg", type: "number" },
          { name: "precio_unitario", type: "number" },
          { name: "proveedor_id", type: "relation", maxSelect: 1, collectionId: prov.id },
          { name: "notas", type: "text", max: 2000 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_fases_articulo_art ON fases_articulo (articulo)",
        ],
      });
      app.save(fa);
    }

    // ── fases_externalizadas_exclusiva (per-exclusiva externalization) ────
    let fee;
    try { fee = app.findCollectionByNameOrId("fases_externalizadas_exclusiva"); } catch (_) {
      fee = new Collection({
        type: "base",
        name: "fases_externalizadas_exclusiva",
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio')",
        updateRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio')",
        deleteRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        fields: [
          { name: "exclusiva_id", type: "relation", required: true, maxSelect: 1, collectionId: exclusives.id, cascadeDelete: true },
          { name: "fase", type: "text", required: true, max: 200 },
          { name: "fase_articulo", type: "relation", maxSelect: 1, collectionId: fa.id },
          { name: "externalizada", type: "bool" },
          { name: "precio_unitario", type: "number" },
          { name: "proveedor_id", type: "relation", maxSelect: 1, collectionId: prov.id },
          { name: "fecha_externalizacion", type: "date" },
          { name: "usuario_id", type: "relation", maxSelect: 1, collectionId: users.id },
          { name: "notas", type: "text", max: 2000 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_fee_exclusiva ON fases_externalizadas_exclusiva (exclusiva_id)",
          "CREATE UNIQUE INDEX idx_fee_exclusiva_fase ON fases_externalizadas_exclusiva (exclusiva_id, fase)",
        ],
      });
      app.save(fee);
    }

    // ── historial_fases_externalizadas (audit trail) ──────────────────────
    let hf;
    try { hf = app.findCollectionByNameOrId("historial_fases_externalizadas"); } catch (_) {
      hf = new Collection({
        type: "base",
        name: "historial_fases_externalizadas",
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        deleteRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        fields: [
          { name: "exclusiva_id", type: "relation", required: true, maxSelect: 1, collectionId: exclusives.id, cascadeDelete: true },
          { name: "fase", type: "text", required: true, max: 200 },
          { name: "accion", type: "select", required: true, maxSelect: 1, values: ["externalizada", "internalizada", "precio_cambiado", "proveedor_cambiado", "notas_cambiado"] },
          { name: "fecha", type: "date" },
          { name: "usuario_id", type: "relation", maxSelect: 1, collectionId: users.id },
          { name: "precio_anterior", type: "number" },
          { name: "precio_nuevo", type: "number" },
          { name: "proveedor_anterior", type: "relation", maxSelect: 1, collectionId: prov.id },
          { name: "proveedor_nuevo", type: "relation", maxSelect: 1, collectionId: prov.id },
          { name: "notas", type: "text", max: 2000 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_hf_exclusiva ON historial_fases_externalizadas (exclusiva_id)",
        ],
      });
      app.save(hf);
    }

    // ── Add notification type 'fase_externalizada' ────────────────────────
    const notif = app.findCollectionByNameOrId("notifications");
    const tipusField = notif.fields.getByName("tipus");
    if (tipusField && tipusField.values && !tipusField.values.includes("fase_externalizada")) {
      tipusField.values = [...tipusField.values, "fase_externalizada"];
      app.save(notif);
    }
  },
  (app) => {
    try { app.delete(app.findCollectionByNameOrId("historial_fases_externalizadas")); } catch (_) {}
    try { app.delete(app.findCollectionByNameOrId("fases_externalizadas_exclusiva")); } catch (_) {}
    try { app.delete(app.findCollectionByNameOrId("fases_articulo")); } catch (_) {}
    try { app.delete(app.findCollectionByNameOrId("proveedores")); } catch (_) {}
    try {
      const notif = app.findCollectionByNameOrId("notifications");
      const tipusField = notif.fields.getByName("tipus");
      if (tipusField && tipusField.values) {
        tipusField.values = tipusField.values.filter((v) => v !== "fase_externalizada");
        app.save(notif);
      }
    } catch (_) {}
  },
);

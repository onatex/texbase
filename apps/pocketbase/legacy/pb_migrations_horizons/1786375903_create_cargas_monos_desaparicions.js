/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    // ── 1. Add "desapareguda" to exclusives.estat select values ──
    const exclusives = app.findCollectionByNameOrId("exclusives");
    const estatField = exclusives.fields.getByName("estat");
    if (estatField && Array.isArray(estatField.values) && !estatField.values.includes("desapareguda")) {
      estatField.values = [...estatField.values, "desapareguda"];
    }
    app.save(exclusives);

    // ── 2. Extend notifications.tipus with carga/desaparicion types ──
    let notif;
    try {
      notif = app.findCollectionByNameOrId("notifications");
    } catch (_) {
      // notifications collection missing — create it (safety net)
      notif = new Collection({
        type: "base",
        name: "notifications",
        listRule: "@request.auth.id != '' && @request.auth.id = destinatari",
        viewRule: "@request.auth.id != '' && @request.auth.id = destinatari",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != '' && @request.auth.id = destinatari",
        deleteRule: "@request.auth.id != '' && @request.auth.id = destinatari",
        fields: [
          { name: "destinatari", type: "relation", required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
          { name: "tipus", type: "select", maxSelect: 1, values: [] },
          { name: "titol", type: "text", max: 200 },
          { name: "missatge", type: "text", max: 1000 },
          { name: "link_id", type: "text", max: 60 },
          { name: "llegida", type: "bool" },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_notif_destinatari ON notifications (destinatari)",
          "CREATE INDEX idx_notif_llegida ON notifications (llegida)",
        ],
      });
      app.save(notif);
    }
    const tipusField = notif.fields.getByName("tipus");
    const extraTypes = ["desaparicion", "carga_completada", "carga_error"];
    if (tipusField && Array.isArray(tipusField.values)) {
      const merged = [...tipusField.values];
      for (const t of extraTypes) {
        if (!merged.includes(t)) merged.push(t);
      }
      tipusField.values = merged;
    }
    app.save(notif);

    // ── 3. Create cargas_monos collection (before desaparicions so the relation can point to it) ──
    let cargas;
    try {
      cargas = app.findCollectionByNameOrId("cargas_monos");
    } catch (_) {
      cargas = new Collection({
        type: "base",
        name: "cargas_monos",
        listRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio')",
        viewRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio')",
        createRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio')",
        updateRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        deleteRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        fields: [
          { name: "fecha_carga", type: "date", required: true },
          { name: "usuario_id", type: "relation", maxSelect: 1, collectionId: users.id },
          { name: "archivo_nombre", type: "text", max: 200 },
          { name: "nuevas_count", type: "number", onlyInt: true },
          { name: "actualizadas_count", type: "number", onlyInt: true },
          { name: "desaparecidas_count", type: "number", onlyInt: true },
          { name: "errores_count", type: "number", onlyInt: true },
          { name: "total_filas", type: "number", onlyInt: true },
          { name: "detalles", type: "json", maxSize: 500000 },
          { name: "notas", type: "text", max: 2000 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_cargas_fecha ON cargas_monos (fecha_carga)",
        ],
      });
      app.save(cargas);
    }

    // ── 4. Create desaparicions collection (carga_id → cargas_monos) ──
    let desap;
    try {
      desap = app.findCollectionByNameOrId("desaparicions");
    } catch (_) {
      desap = new Collection({
        type: "base",
        name: "desaparicions",
        listRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio')",
        viewRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio')",
        createRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio')",
        updateRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        deleteRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        fields: [
          { name: "numero_exclusiva", type: "text", required: true, max: 80 },
          { name: "exclusiva_id", type: "text", max: 60 },
          { name: "articulo", type: "text", max: 120 },
          { name: "unidades", type: "number", onlyInt: true },
          { name: "estado_anterior", type: "text", max: 40 },
          { name: "fecha_desaparicion", type: "date" },
          { name: "notificacion_enviada", type: "bool" },
          { name: "resuelta", type: "bool" },
          { name: "accion", type: "select", maxSelect: 1, values: ["pendent", "eliminada", "marcada"] },
          { name: "usuario_id", type: "relation", maxSelect: 1, collectionId: users.id },
          { name: "carga_id", type: "relation", maxSelect: 1, collectionId: cargas.id },
          { name: "notas", type: "text", max: 2000 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_desap_numero ON desaparicions (numero_exclusiva)",
          "CREATE INDEX idx_desap_resuelta ON desaparicions (resuelta)",
        ],
      });
      app.save(desap);
    }
  },
  (app) => {
    // Revert: remove added select values, drop new collections
    try {
      const exclusives = app.findCollectionByNameOrId("exclusives");
      const estatField = exclusives.fields.getByName("estat");
      if (estatField && Array.isArray(estatField.values)) {
        estatField.values = estatField.values.filter((v) => v !== "desapareguda");
      }
      app.save(exclusives);
    } catch (_) {}

    try {
      const notif = app.findCollectionByNameOrId("notifications");
      const tipusField = notif.fields.getByName("tipus");
      if (tipusField && Array.isArray(tipusField.values)) {
        tipusField.values = tipusField.values.filter(
          (v) => !["desaparicion", "carga_completada", "carga_error"].includes(v),
        );
      }
      app.save(notif);
    } catch (_) {}

    try { app.delete(app.findCollectionByNameOrId("desaparicions")); } catch (_) {}
    try { app.delete(app.findCollectionByNameOrId("cargas_monos")); } catch (_) {}
  },
);

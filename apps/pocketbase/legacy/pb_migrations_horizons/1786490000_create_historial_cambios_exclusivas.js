/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const exclusives = app.findCollectionByNameOrId("exclusives");
    const rutes = app.findCollectionByNameOrId("rutes");

    // ── 1. Create historial_cambios_exclusivas collection ──
    let hist;
    try {
      hist = app.findCollectionByNameOrId("historial_cambios_exclusivas");
    } catch (_) {
      hist = new Collection({
        type: "base",
        name: "historial_cambios_exclusivas",
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
          {
            name: "tipo_cambio",
            type: "select",
            maxSelect: 1,
            required: true,
            values: [
              "ruta_actualizada",
              "operacion_anadida",
              "operacion_modificada",
            ],
          },
          { name: "ruta_anterior", type: "text", max: 200 },
          { name: "ruta_nueva", type: "text", max: 200 },
          { name: "operacion_id", type: "text", max: 60 },
          { name: "operacion_nombre", type: "text", max: 200 },
          { name: "cambio_descripcion", type: "text", max: 2000 },
          { name: "minuts_anterior", type: "number" },
          { name: "minuts_nuevo", type: "number" },
          {
            name: "usuario_id",
            type: "relation",
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: false,
          },
          { name: "fecha_cambio", type: "date" },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_hist_cambios_exclusiva ON historial_cambios_exclusivas (exclusiva_id)",
          "CREATE INDEX idx_hist_cambios_fecha ON historial_cambios_exclusivas (fecha_cambio)",
        ],
      });
      app.save(hist);
    }

    // ── 2. Extend notifications.tipus with route/operation change types ──
    try {
      const notif = app.findCollectionByNameOrId("notifications");
      const tipusField = notif.fields.getByName("tipus");
      if (tipusField && Array.isArray(tipusField.values)) {
        const merged = [...tipusField.values];
        for (const v of [
          "ruta_actualizada",
          "operacion_anadida",
          "operacion_modificada",
        ]) {
          if (!merged.includes(v)) merged.push(v);
        }
        tipusField.values = merged;
        app.save(notif);
      }
    } catch (_) {
      /* notifications may not exist; skip */
    }
  },
  (app) => {
    try {
      const hist = app.findCollectionByNameOrId("historial_cambios_exclusivas");
      app.delete(hist);
    } catch (_) {}
    try {
      const notif = app.findCollectionByNameOrId("notifications");
      const tipusField = notif.fields.getByName("tipus");
      if (tipusField && Array.isArray(tipusField.values)) {
        tipusField.values = tipusField.values.filter(
          (v) =>
            v !== "ruta_actualizada" &&
            v !== "operacion_anadida" &&
            v !== "operacion_modificada",
        );
        app.save(notif);
      }
    } catch (_) {}
  },
);

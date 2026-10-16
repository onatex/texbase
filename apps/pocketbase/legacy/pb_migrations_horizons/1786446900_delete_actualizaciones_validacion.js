/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("actualizaciones_validacion");
      app.delete(collection);
    } catch (e) {
      if (e.message && e.message.includes("no rows in result set")) {
        console.log("actualizaciones_validacion already gone, skipping");
        return;
      }
      throw e;
    }
  },
  (app) => {
    // Recrear la estructura (sin datos). Los registros borrados no se recuperan.
    try {
      app.findCollectionByNameOrId("actualizaciones_validacion");
      return;
    } catch (_) {
      const users = app.findCollectionByNameOrId("users");
      const collection = new Collection({
        type: "base",
        name: "actualizaciones_validacion",
        listRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio')",
        viewRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio')",
        createRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio')",
        updateRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        deleteRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        fields: [
          { name: "fecha_actualizacion", type: "date", required: true },
          {
            name: "usuario",
            type: "relation",
            required: true,
            maxSelect: 1,
            minSelect: 0,
            collectionId: users.id,
          },
          { name: "exclusivas_rechazadas_count", type: "number", onlyInt: true },
          { name: "exclusivas_validadas_count", type: "number", onlyInt: true },
          { name: "exclusivas_no_validadas_count", type: "number", onlyInt: true },
          { name: "motivo", type: "text", max: 200, min: 0 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_act_val_fecha ON actualizaciones_validacion (fecha_actualizacion)",
        ],
      });
      app.save(collection);
    }
  },
);

/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const exclusives = app.findCollectionByNameOrId("exclusives");
    const monos = app.findCollectionByNameOrId("monos");
    const noConformitats = app.findCollectionByNameOrId("no_conformitats");

    let collection;
    try {
      collection = app.findCollectionByNameOrId("retrabajos");
    } catch (_) {
      collection = new Collection({
        type: "base",
        name: "retrabajos",
        // QC/admin/produccio see all; operari sees only retrabajos assigned to them
        listRule:
          "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'qualitat' || @request.auth.rol = 'produccio' || @request.auth.id = operario_asignado)",
        viewRule:
          "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'qualitat' || @request.auth.rol = 'produccio' || @request.auth.id = operario_asignado)",
        createRule:
          "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'qualitat')",
        updateRule:
          "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'qualitat' || @request.auth.id = operario_asignado)",
        deleteRule:
          "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        fields: [
          {
            name: "exclusiva",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: exclusives.id,
            cascadeDelete: false,
          },
          {
            name: "mono",
            type: "relation",
            maxSelect: 1,
            collectionId: monos.id,
            cascadeDelete: false,
          },
          { name: "operacion_original", type: "text", max: 200 },
          { name: "operacion_codi", type: "text", max: 40 },
          { name: "fase", type: "text", max: 120 },
          { name: "punt_checklist", type: "text", max: 120 },
          { name: "motivo_rechazo", type: "text", max: 2000 },
          {
            name: "operario_asignado",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: false,
          },
          {
            name: "estado",
            type: "select",
            maxSelect: 1,
            values: ["pendiente", "en_proceso", "completado", "verificado", "rechazado"],
          },
          { name: "fecha_completacion", type: "date" },
          {
            name: "incidencia_calidad",
            type: "relation",
            maxSelect: 1,
            collectionId: noConformitats.id,
            cascadeDelete: false,
          },
          { name: "numero_intento", type: "number", onlyInt: true },
          { name: "temps_estimat_min", type: "number" },
          { name: "notas", type: "text", max: 2000 },
          {
            name: "creado_por",
            type: "relation",
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: false,
          },
          { name: "registre_id", type: "text", max: 40 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_retrabajos_exclusiva ON retrabajos (exclusiva)",
          "CREATE INDEX idx_retrabajos_operario ON retrabajos (operario_asignado)",
          "CREATE INDEX idx_retrabajos_estado ON retrabajos (estado)",
        ],
      });
      app.save(collection);
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("retrabajos");
      app.delete(collection);
    } catch (e) {
      if (e.message.includes("no rows in result set")) {
        console.log("Collection not found, skipping revert");
        return;
      }
      throw e;
    }
  },
);

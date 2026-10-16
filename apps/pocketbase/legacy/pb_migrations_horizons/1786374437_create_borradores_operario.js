/// <reference path="../pb_data/types.d.ts" />

// Create borradores_operario collection for paused/draft cronómetro states.
// Lets an operario resume a timer after closing the browser/tablet.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const exclusives = app.findCollectionByNameOrId("exclusives");
    const monos = app.findCollectionByNameOrId("monos");

    let collection;
    try {
      collection = app.findCollectionByNameOrId("borradores_operario");
    } catch (_) {
      collection = new Collection({
        type: "base",
        name: "borradores_operario",
        // Owner-scoped: only the operario who owns the draft can see/change it.
        listRule: "@request.auth.id != '' && @request.auth.id = operario",
        viewRule: "@request.auth.id != '' && @request.auth.id = operario",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != '' && @request.auth.id = operario",
        deleteRule: "@request.auth.id != '' && @request.auth.id = operario",
        fields: [
          {
            name: "operario",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          {
            name: "exclusiva",
            type: "relation",
            maxSelect: 1,
            collectionId: exclusives.id,
          },
          {
            name: "mono",
            type: "relation",
            maxSelect: 1,
            collectionId: monos.id,
          },
          { name: "operacion", type: "text", max: 200 },
          { name: "operacion_codi", type: "text", max: 40 },
          { name: "fase", type: "text", max: 120 },
          { name: "tiempo_acumulado_seg", type: "number" },
          { name: "pauses", type: "json", maxSize: 200000 },
          { name: "incidencies", type: "json", maxSize: 200000 },
          { name: "retreball", type: "bool" },
          { name: "registre_id", type: "text", max: 40 },
          { name: "retrabajo_id", type: "text", max: 40 },
          {
            name: "tipus",
            type: "select",
            maxSelect: 1,
            values: ["normal", "reoperacio", "retrabajo"],
          },
          {
            name: "estado",
            type: "select",
            maxSelect: 1,
            values: ["pausado", "guardado"],
          },
          { name: "fecha_pausa", type: "date" },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_borrados_operario ON borradores_operario (operario)",
        ],
      });
      app.save(collection);
    }
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("borradores_operario");
      app.delete(collection);
    } catch (e) {
      if (e.message.includes("no rows in result set")) {
        console.log("borradores_operario not found, skipping revert");
        return;
      }
      throw e;
    }
  },
);

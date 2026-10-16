/// <reference path="../pb_data/types.d.ts" />

// Historial de pausas: registra cada pausa con su inicio, fin/reanudación,
// duración, causa, operario, exclusiva, mono y operación relacionados, para
// poder verificar el tiempo de parada sin contarlo como productivo.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const exclusives = app.findCollectionByNameOrId("exclusives");
    const monos = app.findCollectionByNameOrId("monos");

    const collection = new Collection({
      type: "base",
      name: "historial_pausas",
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
      deleteRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
      fields: [
        // id del registro (registres) al que pertenece la pausa (texto, sin
        // cascade para no perder el historial si se borra el registre).
        { name: "registre_id", type: "text", max: 30 },
        {
          name: "operari",
          type: "relation",
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: false,
        },
        {
          name: "exclusiva",
          type: "relation",
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
        { name: "operacio", type: "text", max: 200 },
        // tipus: "crono" (operación por ruta/reoperación) o "lliure" (trabajo libre)
        { name: "tipus", type: "text", max: 20 },
        { name: "inici", type: "date" },
        { name: "fi", type: "date" },
        { name: "durada_seg", type: "number" },
        { name: "causa", type: "text", max: 200 },
        { name: "inactivitat", type: "bool" },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE INDEX idx_hist_pausas_exclusiva ON historial_pausas (exclusiva)",
        "CREATE INDEX idx_hist_pausas_operari ON historial_pausas (operari)",
        "CREATE INDEX idx_hist_pausas_registre ON historial_pausas (registre_id)",
      ],
    });
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("historial_pausas");
    app.delete(collection);
  },
);

/// <reference path="../pb_data/types.d.ts" />

// Colección persistente para gestionar las recomendaciones de operaciones
// derivadas del trabajo libre. Permite editar los datos sugeridos, descartar
// (ocultar del listado principal sin borrar los registros originales) y
// restaurar recomendaciones, además de marcarlas como convertidas en operación
// de ruta. Registra un historial de acciones (edición, descarte, restauración,
// conversión) con usuario y fecha, sin tocar los registros de trabajo libre.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    let reco;
    try {
      reco = app.findCollectionByNameOrId("recomanacions_operacions");
    } catch (_) {
      reco = new Collection({
        type: "base",
        name: "recomanacions_operacions",
        listRule:
          "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio' || @request.auth.rol = 'qualitat')",
        viewRule:
          "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio' || @request.auth.rol = 'qualitat')",
        createRule:
          "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio')",
        updateRule:
          "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio')",
        deleteRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        fields: [
          { name: "clau", type: "text", required: true, max: 300 },
          { name: "descripcio", type: "text", max: 500 },
          { name: "nom", type: "text", max: 200 },
          { name: "codi", type: "text", max: 40 },
          { name: "temps_std_min", type: "number" },
          { name: "fase", type: "text", max: 100 },
          { name: "ordre", type: "number" },
          { name: "op_anterior", type: "text", max: 60 },
          { name: "articles_relacionats", type: "json", maxSize: 10000 },
          {
            name: "estat",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["activa", "descartada", "convertida"],
          },
          { name: "observacions", type: "text", max: 2000 },
          { name: "historial_accions", type: "json", maxSize: 100000 },
          {
            name: "usuario_id",
            type: "relation",
            maxSelect: 1,
            collectionId: users.id,
          },
          { name: "fecha_ultima_accion", type: "date" },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE UNIQUE INDEX idx_recomanacions_clau ON recomanacions_operacions (clau)",
        ],
      });
      app.save(reco);
    }
  },
  (app) => {
    try {
      const c = app.findCollectionByNameOrId("recomanacions_operacions");
      app.delete(c);
    } catch (_) {}
  },
);

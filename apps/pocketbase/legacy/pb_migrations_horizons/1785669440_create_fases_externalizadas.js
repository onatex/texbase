/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const exclusives = app.findCollectionByNameOrId("exclusives");
    const monos = app.findCollectionByNameOrId("monos");

    // proveedores_externos
    let prov;
    try { prov = app.findCollectionByNameOrId("proveedores_externos"); } catch (_) {
      prov = new Collection({
        type: "base",
        name: "proveedores_externos",
        listRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        viewRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        createRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        updateRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        deleteRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        fields: [
          { name: "nom", type: "text", required: true, max: 200 },
          { name: "contacte", type: "text", max: 200 },
          { name: "telefon", type: "text", max: 50 },
          { name: "email", type: "email" },
          { name: "especialitats", type: "json", maxSize: 10000 },
          { name: "preu_promig", type: "number" },
          { name: "temps_promig_entrega_dies", type: "number" },
          { name: "qualitat_promig", type: "number", min: 0, max: 10 },
          { name: "actiu", type: "bool" },
          { name: "notes", type: "text", max: 2000 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      });
      app.save(prov);
    }

    // fases_externalizadas
    let fe;
    try { fe = app.findCollectionByNameOrId("fases_externalizadas"); } catch (_) {
      fe = new Collection({
        type: "base",
        name: "fases_externalizadas",
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        updateRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        deleteRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        fields: [
          { name: "exclusiva", type: "relation", maxSelect: 1, collectionId: exclusives.id },
          { name: "mono", type: "relation", maxSelect: 1, collectionId: monos.id },
          { name: "fase", type: "text", max: 200 },
          { name: "operacio_codi", type: "text", max: 50 },
          { name: "proveidor", type: "relation", maxSelect: 1, collectionId: prov.id },
          { name: "data_enviament", type: "text", max: 20 },
          { name: "data_devolucion_esperada", type: "text", max: 20 },
          { name: "data_devolucion_real", type: "text", max: 20 },
          { name: "preu_cost", type: "number" },
          { name: "estat", type: "select", maxSelect: 1, values: ["enviada", "en_proces", "retornada", "amb_incidencies"] },
          { name: "descripcio_incidencia", type: "text", max: 2000 },
          { name: "fotos", type: "file", maxSelect: 10, maxSize: 10485760, mimeTypes: ["image/jpeg", "image/png", "image/webp"] },
          { name: "observacions", type: "text", max: 2000 },
          { name: "created_by", type: "relation", maxSelect: 1, collectionId: users.id },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_fe_exclusiva ON fases_externalizadas (exclusiva)",
          "CREATE INDEX idx_fe_estat ON fases_externalizadas (estat)",
        ],
      });
      app.save(fe);
    }
  },
  (app) => {
    try { app.delete(app.findCollectionByNameOrId("fases_externalizadas")); } catch (_) {}
    try { app.delete(app.findCollectionByNameOrId("proveedores_externos")); } catch (_) {}
  }
);

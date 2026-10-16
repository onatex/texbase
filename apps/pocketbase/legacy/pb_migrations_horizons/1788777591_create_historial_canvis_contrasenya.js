/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    const collection = new Collection({
      type: "base",
      name: "historial_canvis_contrasenya",
      listRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin')",
      viewRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin')",
      createRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin')",
      updateRule: null,
      deleteRule: "@request.auth.rol = 'superadmin'",
      fields: [
        {
          name: "usuari_desti",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: true,
        },
        {
          name: "usuari_desti_codi",
          type: "text",
          max: 60,
        },
        {
          name: "usuari_desti_nom",
          type: "text",
          max: 200,
        },
        {
          name: "usuari_origen",
          type: "relation",
          required: false,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: false,
        },
        {
          name: "usuari_origen_nom",
          type: "text",
          max: 200,
        },
        {
          name: "motiu",
          type: "text",
          max: 500,
        },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("historial_canvis_contrasenya");
    app.delete(collection);
  },
);

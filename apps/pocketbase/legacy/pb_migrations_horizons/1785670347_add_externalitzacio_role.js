/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 1. Add 'externalitzacio' to users rol select
    const users = app.findCollectionByNameOrId("users");
    const rolField = users.fields.getByName("rol");
    if (!rolField.values.includes("externalitzacio")) {
      rolField.values = ["operari", "admin", "produccio", "qualitat", "superadmin", "externalitzacio"];
      app.save(users);
    }

    // 2. Add new fields to fases_externalizadas
    const fasesCol = app.findCollectionByNameOrId("fases_externalizadas");

    if (!fasesCol.fields.getByName("hora_salida")) {
      fasesCol.fields.add(new TextField({ name: "hora_salida", max: 30 }));
    }
    if (!fasesCol.fields.getByName("hora_entrada")) {
      fasesCol.fields.add(new TextField({ name: "hora_entrada", max: 30 }));
    }
    if (!fasesCol.fields.getByName("operari_externalitzacio")) {
      fasesCol.fields.add(new RelationField({
        name: "operari_externalitzacio",
        maxSelect: 1,
        collectionId: users.id,
      }));
    }
    if (!fasesCol.fields.getByName("observacions_salida")) {
      fasesCol.fields.add(new TextField({ name: "observacions_salida", max: 2000 }));
    }
    if (!fasesCol.fields.getByName("observacions_entrada")) {
      fasesCol.fields.add(new TextField({ name: "observacions_entrada", max: 2000 }));
    }
    if (!fasesCol.fields.getByName("videos_incidencia")) {
      fasesCol.fields.add(new FileField({
        name: "videos_incidencia",
        maxSelect: 5,
        maxSize: 104857600,
        mimeTypes: ["video/mp4", "video/webm", "video/ogg", "video/quicktime"],
      }));
    }

    // 3. Update access rules to include externalitzacio role
    fasesCol.listRule = "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'externalitzacio')";
    fasesCol.viewRule = "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'externalitzacio')";
    fasesCol.createRule = "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'externalitzacio'";
    fasesCol.updateRule = "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'externalitzacio'";

    app.save(fasesCol);
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const rolField = users.fields.getByName("rol");
    rolField.values = ["operari", "admin", "produccio", "qualitat", "superadmin"];
    app.save(users);

    const fasesCol = app.findCollectionByNameOrId("fases_externalizadas");
    for (const name of ["hora_salida", "hora_entrada", "operari_externalitzacio", "observacions_salida", "observacions_entrada", "videos_incidencia"]) {
      if (fasesCol.fields.getByName(name)) fasesCol.fields.removeByName(name);
    }
    fasesCol.listRule = "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'";
    fasesCol.viewRule = "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'";
    fasesCol.createRule = "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'";
    fasesCol.updateRule = "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'";
    app.save(fasesCol);
  }
);

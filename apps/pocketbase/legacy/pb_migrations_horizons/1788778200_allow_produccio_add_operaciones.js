/// <reference path="../pb_data/types.d.ts" />

// Permite a Producción y Super Admin añadir operaciones/rutas y actualizar
// artículos desde el flujo "Añadir operación" del detalle de exclusiva.
// Antes solo 'admin' podía crear/editar operacions_def, rutes y articles.
migrate(
  (app) => {
    const PROD =
      "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio'";

    const opsDef = app.findCollectionByNameOrId("operacions_def");
    opsDef.createRule = PROD;
    opsDef.updateRule = PROD;
    app.save(opsDef);

    const rutes = app.findCollectionByNameOrId("rutes");
    rutes.createRule = PROD;
    rutes.updateRule = PROD;
    app.save(rutes);

    const articles = app.findCollectionByNameOrId("articles");
    articles.createRule = PROD;
    articles.updateRule = PROD;
    app.save(articles);
  },
  (app) => {
    const ADMIN = "@request.auth.rol = 'admin'";
    const opsDef = app.findCollectionByNameOrId("operacions_def");
    opsDef.createRule = ADMIN;
    opsDef.updateRule = ADMIN;
    app.save(opsDef);

    const rutes = app.findCollectionByNameOrId("rutes");
    rutes.createRule = ADMIN;
    rutes.updateRule = ADMIN;
    app.save(rutes);

    const articles = app.findCollectionByNameOrId("articles");
    articles.createRule = ADMIN;
    articles.updateRule = ADMIN;
    app.save(articles);
  },
);

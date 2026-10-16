/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // Fix articles access rules
    const articles = app.findCollectionByNameOrId("articles");
    articles.listRule = "@request.auth.id != ''";
    articles.viewRule = "@request.auth.id != ''";
    app.save(articles);

    // Fix controles_qualitat access rules
    const controles = app.findCollectionByNameOrId("controles_qualitat");
    controles.listRule = "@request.auth.id != ''";
    controles.viewRule = "@request.auth.id != ''";
    app.save(controles);
  },
  (app) => {
    const articles = app.findCollectionByNameOrId("articles");
    articles.listRule = null;
    articles.viewRule = null;
    app.save(articles);

    const controles = app.findCollectionByNameOrId("controles_qualitat");
    controles.listRule = null;
    controles.viewRule = null;
    app.save(controles);
  },
);

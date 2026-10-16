/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const rutes = app.findCollectionByNameOrId("rutes");
    const monos = app.findCollectionByNameOrId("monos");
    const exclusives = app.findCollectionByNameOrId("exclusives");
    const users = app.findCollectionByNameOrId("users");

    // --- articles: add missing fields ---
    const articles = app.findCollectionByNameOrId("articles");
    articles.fields.add(new TextField({ name: "referencia", required: true, max: 50 }));
    articles.fields.add(new TextField({ name: "nom", required: true, max: 200 }));
    articles.fields.add(new TextField({ name: "familia", max: 100 }));
    articles.fields.add(new RelationField({ name: "ruta", maxSelect: 1, collectionId: rutes.id }));
    articles.fields.add(new NumberField({ name: "temps_estandard_total_min" }));
    articles.fields.add(new TextField({ name: "observacions", max: 2000 }));
    articles.fields.add(new AutodateField({ name: "created", onCreate: true, onUpdate: false }));
    articles.fields.add(new AutodateField({ name: "updated", onCreate: true, onUpdate: true }));
    app.save(articles);

    // --- controles_qualitat: add missing fields ---
    const controls = app.findCollectionByNameOrId("controles_qualitat");
    controls.fields.add(new RelationField({ name: "mono", maxSelect: 1, collectionId: monos.id }));
    controls.fields.add(new RelationField({ name: "exclusiva", maxSelect: 1, collectionId: exclusives.id }));
    controls.fields.add(new RelationField({ name: "operari", maxSelect: 1, collectionId: users.id }));
    controls.fields.add(new TextField({ name: "operacio", max: 120 }));
    controls.fields.add(new SelectField({ name: "resultat", maxSelect: 1, values: ["ok", "ko", "pendent"] }));
    controls.fields.add(new TextField({ name: "notes", max: 2000 }));
    controls.fields.add(new AutodateField({ name: "created", onCreate: true, onUpdate: false }));
    controls.fields.add(new AutodateField({ name: "updated", onCreate: true, onUpdate: true }));
    app.save(controls);
  },
  (app) => {
    // additive only, no rollback needed
  },
);

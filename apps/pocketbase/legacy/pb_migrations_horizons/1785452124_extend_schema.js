/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 1. Add new roles to users
    const users = app.findCollectionByNameOrId("users");
    const rolField = users.fields.getByName("rol");
    if (rolField) {
      rolField.values = ["operari", "admin", "produccio", "qualitat"];
      app.save(users);
    }

    // 2. Extend exclusives with new fields
    const exclusives = app.findCollectionByNameOrId("exclusives");
    let exChanged = false;
    if (!exclusives.fields.getByName("referencia")) {
      exclusives.fields.add(new TextField({ name: "referencia", max: 100 }));
      exChanged = true;
    }
    if (!exclusives.fields.getByName("prioritat")) {
      exclusives.fields.add(new SelectField({
        name: "prioritat", maxSelect: 1, values: ["normal", "alta", "express"],
      }));
      exChanged = true;
    }
    if (!exclusives.fields.getByName("observacions")) {
      exclusives.fields.add(new TextField({ name: "observacions", max: 2000 }));
      exChanged = true;
    }
    if (!exclusives.fields.getByName("talla_info")) {
      exclusives.fields.add(new JSONField({ name: "talla_info", maxSize: 10000 }));
      exChanged = true;
    }
    if (!exclusives.fields.getByName("minuts_previstos")) {
      exclusives.fields.add(new NumberField({ name: "minuts_previstos" }));
      exChanged = true;
    }
    if (!exclusives.fields.getByName("risc")) {
      exclusives.fields.add(new SelectField({
        name: "risc", maxSelect: 1, values: ["viable", "en_risc", "no_viable"],
      }));
      exChanged = true;
    }
    if (exChanged) app.save(exclusives);

    // 3. Extend monos with talla and assigned operator
    const monos = app.findCollectionByNameOrId("monos");
    let monosChanged = false;
    if (!monos.fields.getByName("talla")) {
      monos.fields.add(new TextField({ name: "talla", max: 20 }));
      monosChanged = true;
    }
    if (!monos.fields.getByName("operari_assignat")) {
      monos.fields.add(new RelationField({
        name: "operari_assignat", maxSelect: 1, collectionId: users.id,
      }));
      monosChanged = true;
    }
    if (monosChanged) app.save(monos);

    // 4. Articles collection
    let rutes;
    try { rutes = app.findCollectionByNameOrId("rutes"); } catch (_) { rutes = null; }

    let articles;
    try {
      articles = app.findCollectionByNameOrId("articles");
    } catch (_) {
      const artFields = [
        new TextField({ name: "referencia", required: true, max: 50 }),
        new TextField({ name: "nom", required: true, max: 200 }),
        new TextField({ name: "familia", max: 100 }),
        new NumberField({ name: "temps_estandard_total_min" }),
        new TextField({ name: "observacions", max: 2000 }),
        new AutodateField({ name: "created", onCreate: true, onUpdate: false }),
        new AutodateField({ name: "updated", onCreate: true, onUpdate: true }),
      ];
      if (rutes) {
        artFields.splice(3, 0, new RelationField({
          name: "ruta", maxSelect: 1, collectionId: rutes.id,
        }));
      }
      articles = new Collection({
        type: "base",
        name: "articles",
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.rol = 'admin'",
        updateRule: "@request.auth.rol = 'admin'",
        deleteRule: "@request.auth.rol = 'admin'",
        fields: artFields,
        indexes: ["CREATE UNIQUE INDEX idx_articles_referencia ON articles (referencia)"],
      });
      app.save(articles);
    }

    // Seed predefined articles
    const defs = [
      { referencia: "R82-020", nom: "UNIC PLUS SUIT", familia: "UNIC PLUS" },
      { referencia: "R82-021", nom: "UNIC PLUS SUIT", familia: "UNIC PLUS" },
      { referencia: "R84-053", nom: "CIK FIA SUIT", familia: "CIK FIA" },
      { referencia: "R84-054", nom: "CIK FIA SUIT", familia: "CIK FIA" },
      { referencia: "R80-600", nom: "AIR PLUS", familia: "AIR PLUS" },
      { referencia: "R80-601", nom: "AIR PLUS", familia: "AIR PLUS" },
      { referencia: "R80-610", nom: "AIR PLUS DP", familia: "AIR PLUS" },
      { referencia: "R80-611", nom: "AIR PLUS DP", familia: "AIR PLUS" },
      { referencia: "R80-620", nom: "AIR PLUS MIX", familia: "AIR PLUS" },
      { referencia: "R80-621", nom: "AIR PLUS MIX", familia: "AIR PLUS" },
      { referencia: "R80-701", nom: "FACTORY SUIT", familia: "FACTORY" },
      { referencia: "R80-702", nom: "FACTORY SUIT", familia: "FACTORY" },
      { referencia: "R80-705", nom: "FACTORY SUIT DP", familia: "FACTORY" },
      { referencia: "R84-200", nom: "UNIK RENTAL", familia: "UNIK" },
      { referencia: "R84-210", nom: "UNIK RENTAL", familia: "UNIK" },
      { referencia: "R84-220", nom: "UNIK PLUJA", familia: "UNIK" },
      { referencia: "R82-026", nom: "UNIC PLUS BABY", familia: "UNIC PLUS" },
      { referencia: "R82-061", nom: "UNIC PLUS MEDIA", familia: "UNIC PLUS" },
      { referencia: "R54-100", nom: "MONO COMISARI", familia: "COMISARI" },
      { referencia: "R54-101", nom: "MONO COMISARI", familia: "COMISARI" },
      { referencia: "R54-102", nom: "MONO COMISARI", familia: "COMISARI" },
    ];
    const artCol = app.findCollectionByNameOrId("articles");
    for (const d of defs) {
      try {
        const rec = new Record(artCol);
        rec.set("referencia", d.referencia);
        rec.set("nom", d.nom);
        rec.set("familia", d.familia);
        app.save(rec);
      } catch (_) {
        // skip duplicates (unique index on referencia)
      }
    }

    // 5. controles_qualitat collection
    try {
      app.findCollectionByNameOrId("controles_qualitat");
    } catch (_) {
      const monosCol = app.findCollectionByNameOrId("monos");
      const exCol = app.findCollectionByNameOrId("exclusives");
      const usersCol = app.findCollectionByNameOrId("users");
      const cq = new Collection({
        type: "base",
        name: "controles_qualitat",
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.rol = 'admin'",
        fields: [
          new RelationField({ name: "mono", maxSelect: 1, collectionId: monosCol.id }),
          new RelationField({ name: "exclusiva", maxSelect: 1, collectionId: exCol.id }),
          new RelationField({ name: "operari", maxSelect: 1, collectionId: usersCol.id }),
          new TextField({ name: "operacio", max: 120 }),
          new SelectField({ name: "resultat", maxSelect: 1, values: ["aprovat", "rebutjat", "pendent"] }),
          new TextField({ name: "observacions", max: 2000 }),
          new AutodateField({ name: "created", onCreate: true, onUpdate: false }),
          new AutodateField({ name: "updated", onCreate: true, onUpdate: true }),
        ],
        indexes: [
          "CREATE INDEX idx_cq_mono ON controles_qualitat (mono)",
          "CREATE INDEX idx_cq_exclusiva ON controles_qualitat (exclusiva)",
        ],
      });
      app.save(cq);
    }
  },
  (app) => {
    try { app.delete(app.findCollectionByNameOrId("controles_qualitat")); } catch (_) {}
    try { app.delete(app.findCollectionByNameOrId("articles")); } catch (_) {}
  },
);

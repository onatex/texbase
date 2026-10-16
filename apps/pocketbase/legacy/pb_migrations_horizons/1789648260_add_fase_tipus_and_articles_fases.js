/// <reference path="../pb_data/types.d.ts" />

// 1) Añade "fase" a registres.tipus para trabajo agregado por Fase 1/2/3.
// 2) Añade articles.fases_config (JSON) para tiempos estándar por artículo
//    (con o sin ruta predefinida).

migrate(
  (app) => {
    const registres = app.findCollectionByNameOrId("registres");
    const tipusField = registres.fields.getByName("tipus");
    if (tipusField && Array.isArray(tipusField.values)) {
      const next = [...tipusField.values];
      if (!next.includes("fase")) next.push("fase");
      tipusField.values = next;
      app.save(registres);
    } else if (!tipusField) {
      registres.fields.add(
        new SelectField({
          name: "tipus",
          maxSelect: 1,
          values: ["normal", "reoperacio", "lliure", "fase"],
        }),
      );
      app.save(registres);
    }

    const articles = app.findCollectionByNameOrId("articles");
    if (!articles.fields.getByName("fases_config")) {
      articles.fields.add(new JSONField({ name: "fases_config", maxSize: 20000 }));
      app.save(articles);
    }
  },
  (app) => {
    try {
      const registres = app.findCollectionByNameOrId("registres");
      const tipusField = registres.fields.getByName("tipus");
      if (tipusField && Array.isArray(tipusField.values)) {
        tipusField.values = tipusField.values.filter((v) => v !== "fase");
        app.save(registres);
      }
    } catch (_) {}
    try {
      const articles = app.findCollectionByNameOrId("articles");
      if (articles.fields.getByName("fases_config")) {
        articles.fields.removeByName("fases_config");
        app.save(articles);
      }
    } catch (_) {}
  },
);

/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId("no_conformitats");

    // Add origen field
    col.fields.add(new SelectField({
      name: "origen",
      maxSelect: 1,
      values: ["onatex", "client"],
    }));

    // Add gravetat (severity with critica level)
    col.fields.add(new SelectField({
      name: "gravetat",
      maxSelect: 1,
      values: ["baixa", "media", "alta", "critica"],
    }));

    // Client contact fields
    col.fields.add(new TextField({ name: "contacte_nom", max: 200 }));
    col.fields.add(new TextField({ name: "contacte_telefon", max: 50 }));
    col.fields.add(new TextField({ name: "contacte_email", max: 200 }));

    // Multiple photos
    col.fields.add(new FileField({
      name: "fotos",
      maxSelect: 10,
      maxSize: 10485760,
      mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic"],
    }));

    // Update estat to include en_seguiment
    const estatField = col.fields.getByName("estat");
    if (estatField) {
      estatField.values = ["oberta", "tancada", "en_seguiment"];
    }

    app.save(col);
  },
  (app) => {
    const col = app.findCollectionByNameOrId("no_conformitats");
    col.fields.removeByName("origen");
    col.fields.removeByName("gravetat");
    col.fields.removeByName("contacte_nom");
    col.fields.removeByName("contacte_telefon");
    col.fields.removeByName("contacte_email");
    col.fields.removeByName("fotos");
    const estatField = col.fields.getByName("estat");
    if (estatField) {
      estatField.values = ["oberta", "tancada"];
    }
    app.save(col);
  },
);

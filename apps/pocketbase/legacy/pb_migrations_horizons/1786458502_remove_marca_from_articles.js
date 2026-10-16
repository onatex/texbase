/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("articles");
    // Remove the marca field from articles
    collection.fields.removeByName("marca");
    app.save(collection);
  },
  (app) => {
    // Re-add the marca field (data is lost)
    const collection = app.findCollectionByNameOrId("articles");
    if (!collection.fields.getByName("marca")) {
      collection.fields.add(
        new TextField({
          name: "marca",
          max: 100,
          min: 0,
          required: false,
        }),
      );
      app.save(collection);
    }
  },
);

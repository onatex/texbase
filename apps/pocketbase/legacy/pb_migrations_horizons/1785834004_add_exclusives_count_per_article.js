/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId("costes_mensuales");
    // Check if field already exists
    let exists = false;
    try { col.fields.getByName("exclusives_count_per_article"); exists = true; } catch (_) {}
    if (!exists) {
      col.fields.add(new JsonField({
        name: "exclusives_count_per_article",
        maxSize: 50000,
      }));
      app.save(col);
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId("costes_mensuales");
      col.fields.removeByName("exclusives_count_per_article");
      app.save(col);
    } catch (_) {}
  },
);

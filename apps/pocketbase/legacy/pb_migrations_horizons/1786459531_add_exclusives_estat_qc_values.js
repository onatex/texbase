/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId("exclusives");
    const field = col.fields.getByName("estat");
    if (field) {
      const current = Array.isArray(field.values) ? field.values : [];
      const set = new Set(current);
      set.add("parcialmente_conforme");
      set.add("rechazado");
      field.values = Array.from(set);
    }
    app.save(col);
  },
  (app) => {
    const col = app.findCollectionByNameOrId("exclusives");
    const field = col.fields.getByName("estat");
    if (field) {
      const current = Array.isArray(field.values) ? field.values : [];
      field.values = current.filter(
        (v) => v !== "parcialmente_conforme" && v !== "rechazado"
      );
    }
    app.save(col);
  },
);

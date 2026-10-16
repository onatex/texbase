/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId("exclusives");
    const field = col.fields.getByName("estat");
    if (field && !field.values.includes("recibida")) {
      field.values = ["recibida", ...field.values];
      app.save(col);
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId("exclusives");
    const field = col.fields.getByName("estat");
    if (field) {
      field.values = field.values.filter((v) => v !== "recibida");
      app.save(col);
    }
  },
);

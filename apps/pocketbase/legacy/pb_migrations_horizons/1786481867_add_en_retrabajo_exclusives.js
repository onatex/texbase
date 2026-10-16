/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId("exclusives");
    const estatField = col.fields.getByName("estat");
    if (!estatField.values.includes("en_retrabajo")) {
      estatField.values.push("en_retrabajo");
    }
    if (!estatField.values.includes("pendiente_calidad")) {
      estatField.values.push("pendiente_calidad");
    }
    app.save(col);
  },
  (app) => {
    const col = app.findCollectionByNameOrId("exclusives");
    const estatField = col.fields.getByName("estat");
    estatField.values = estatField.values.filter(
      (v) => v !== "en_retrabajo" && v !== "pendiente_calidad"
    );
    app.save(col);
  }
);

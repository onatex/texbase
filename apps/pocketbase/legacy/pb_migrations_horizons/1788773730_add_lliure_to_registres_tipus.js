/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const registres = app.findCollectionByNameOrId("registres");
    const tipusField = registres.fields.getByName("tipus");
    if (tipusField && Array.isArray(tipusField.values)) {
      if (!tipusField.values.includes("lliure")) {
        tipusField.values = [...tipusField.values, "lliure"];
      }
    } else if (!tipusField) {
      registres.fields.add(
        new SelectField({
          name: "tipus",
          maxSelect: 1,
          values: ["normal", "reoperacio", "lliure"],
        }),
      );
    }
    app.save(registres);
  },
  (app) => {
    const registres = app.findCollectionByNameOrId("registres");
    const tipusField = registres.fields.getByName("tipus");
    if (tipusField && Array.isArray(tipusField.values)) {
      tipusField.values = tipusField.values.filter((v) => v !== "lliure");
    }
    app.save(registres);
  },
);

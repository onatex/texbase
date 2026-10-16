/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("fases_externalizadas_exclusiva");

    // fecha_limite (date) — optional deadline for the externalized phase
    if (!collection.fields.getByName("fecha_limite")) {
      collection.fields.add(
        new DateField({
          name: "fecha_limite",
          required: false,
        }),
      );
    }

    // estado (select) — pendiente / en_proceso / completada
    if (!collection.fields.getByName("estado")) {
      collection.fields.add(
        new SelectField({
          name: "estado",
          required: false,
          maxSelect: 1,
          values: ["pendiente", "en_proceso", "completada"],
        }),
      );
    }

    // nombre_fase (text) — for manual fases without a route
    if (!collection.fields.getByName("nombre_fase")) {
      collection.fields.add(
        new TextField({
          name: "nombre_fase",
          required: false,
          max: 200,
        }),
      );
    }

    app.save(collection);
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId("fases_externalizadas_exclusiva");
      ["fecha_limite", "estado", "nombre_fase"].forEach((n) => {
        if (collection.fields.getByName(n)) collection.fields.removeByName(n);
      });
      app.save(collection);
    } catch (e) {
      if (e.message.includes("no rows in result set")) return;
      throw e;
    }
  },
);

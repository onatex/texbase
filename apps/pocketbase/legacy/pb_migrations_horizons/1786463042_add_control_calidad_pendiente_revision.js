/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("control_calidad");

    // Add "pendiente_revision" to the estado select values
    const estadoField = collection.fields.getByName("estado");
    if (estadoField && Array.isArray(estadoField.values)) {
      if (!estadoField.values.includes("pendiente_revision")) {
        estadoField.values = [...estadoField.values, "pendiente_revision"];
      }
    }

    // Add fecha_resolucion date field (when a rejected unit is marked as resolved)
    if (!collection.fields.getByName("fecha_resolucion")) {
      collection.fields.add(new DateField({ name: "fecha_resolucion" }));
    }

    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("control_calidad");

    const estadoField = collection.fields.getByName("estado");
    if (estadoField && Array.isArray(estadoField.values)) {
      estadoField.values = estadoField.values.filter(
        (v) => v !== "pendiente_revision",
      );
    }

    if (collection.fields.getByName("fecha_resolucion")) {
      collection.fields.removeByName("fecha_resolucion");
    }

    app.save(collection);
  },
);

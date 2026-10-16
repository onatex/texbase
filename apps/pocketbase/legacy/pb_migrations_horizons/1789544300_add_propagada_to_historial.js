/// <reference path="../pb_data/types.d.ts" />

// Add "operacion_propagada" to historial_cambios_exclusivas.tipo_cambio so
// propagation events (article template + scheduled exclusivas) are auditable
// distinctly from a single add. Also add "exclusiva_origen" text field to
// record which exclusiva the operation was propagated FROM.

migrate(
  (app) => {
    const hist = app.findCollectionByNameOrId("historial_cambios_exclusivas");

    // 1. Extend tipo_cambio select values
    const tipusField = hist.fields.getByName("tipo_cambio");
    if (tipusField && Array.isArray(tipusField.values)) {
      const merged = [...tipusField.values];
      if (!merged.includes("operacion_propagada")) {
        merged.push("operacion_propagada");
      }
      tipusField.values = merged;
    }

    // 2. Add exclusiva_origen text field (source exclusiva code, e.g. "EX-123")
    if (!hist.fields.getByName("exclusiva_origen")) {
      hist.fields.add(new TextField({ name: "exclusiva_origen", max: 80 }));
    }

    app.save(hist);
  },
  (app) => {
    try {
      const hist = app.findCollectionByNameOrId("historial_cambios_exclusivas");
      const tipusField = hist.fields.getByName("tipo_cambio");
      if (tipusField && Array.isArray(tipusField.values)) {
        tipusField.values = tipusField.values.filter(
          (v) => v !== "operacion_propagada",
        );
      }
      hist.fields.removeByName("exclusiva_origen");
      app.save(hist);
    } catch (_) {}
  },
);

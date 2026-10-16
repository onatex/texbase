/// <reference path="../pb_data/types.d.ts" />

// Añade el tipo de cambio "operacion_lliure_convertida" al historial para
// auditar la conversión de trabajos libres en operaciones de ruta, y amplía
// el campo "alcance" con la opción "ruta_compartida" (operación añadida a una
// ruta compartida aplicable a varios artículos).

migrate(
  (app) => {
    const hist = app.findCollectionByNameOrId("historial_cambios_exclusivas");

    // 1. Nuevo tipo de cambio
    const tipusField = hist.fields.getByName("tipo_cambio");
    if (tipusField && Array.isArray(tipusField.values)) {
      if (!tipusField.values.includes("operacion_lliure_convertida")) {
        tipusField.values = [...tipusField.values, "operacion_lliure_convertida"];
      }
    }

    // 2. Ampliar alcance con "ruta_compartida"
    const alcanceField = hist.fields.getByName("alcance");
    if (alcanceField && Array.isArray(alcanceField.values)) {
      if (!alcanceField.values.includes("ruta_compartida")) {
        alcanceField.values = [...alcanceField.values, "ruta_compartida"];
      }
    }

    app.save(hist);
  },
  (app) => {
    try {
      const hist = app.findCollectionByNameOrId("historial_cambios_exclusivas");
      const tipusField = hist.fields.getByName("tipo_cambio");
      if (tipusField && Array.isArray(tipusField.values)) {
        tipusField.values = tipusField.values.filter(
          (v) => v !== "operacion_lliure_convertida",
        );
      }
      const alcanceField = hist.fields.getByName("alcance");
      if (alcanceField && Array.isArray(alcanceField.values)) {
        alcanceField.values = alcanceField.values.filter(
          (v) => v !== "ruta_compartida",
        );
      }
      app.save(hist);
    } catch (_) {}
  },
);

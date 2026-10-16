/// <reference path="../pb_data/types.d.ts" />

// Añade "fase_tiempo_editado" a historial_cambios_exclusivas.tipo_cambio para
// auditar los cambios de tiempo estándar de una fase realizados desde la
// gestión de fases del detalle de exclusiva (Admin/Super Admin).
// No modifica datos existentes; solo extiende los valores permitidos del
// select tipo_cambio. No altera registros históricos de tiempos ni pausas.

migrate(
  (app) => {
    const hist = app.findCollectionByNameOrId("historial_cambios_exclusivas");
    const tipusField = hist.fields.getByName("tipo_cambio");
    if (tipusField && Array.isArray(tipusField.values)) {
      if (!tipusField.values.includes("fase_tiempo_editado")) {
        tipusField.values = [...tipusField.values, "fase_tiempo_editado"];
        app.save(hist);
      }
    }
  },
  (app) => {
    try {
      const hist = app.findCollectionByNameOrId("historial_cambios_exclusivas");
      const tipusField = hist.fields.getByName("tipo_cambio");
      if (tipusField && Array.isArray(tipusField.values)) {
        tipusField.values = tipusField.values.filter(
          (v) => v !== "fase_tiempo_editado",
        );
        app.save(hist);
      }
    } catch (_) {}
  },
);

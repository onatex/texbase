/// <reference path="../pb_data/types.d.ts" />

// Añade "fase_anadida" y "fase_reiniciada" a historial_cambios_exclusivas.tipo_cambio
// para auditar las acciones de administración desde el detalle de exclusiva:
//   - fase_anadida: el admin añade una fase a la exclusiva (fases_config).
//   - fase_reiniciada: el admin reinicia una fase (crea un nuevo ciclo de
//     retrabajo diferenciado, sin alterar registros históricos).
// No modifica datos existentes; solo extiende los valores permitidos del
// select tipo_cambio.

migrate(
  (app) => {
    const hist = app.findCollectionByNameOrId("historial_cambios_exclusivas");
    const tipusField = hist.fields.getByName("tipo_cambio");
    if (tipusField && Array.isArray(tipusField.values)) {
      const merged = [...tipusField.values];
      for (const v of ["fase_anadida", "fase_reiniciada"]) {
        if (!merged.includes(v)) merged.push(v);
      }
      tipusField.values = merged;
      app.save(hist);
    }
  },
  (app) => {
    try {
      const hist = app.findCollectionByNameOrId("historial_cambios_exclusivas");
      const tipusField = hist.fields.getByName("tipo_cambio");
      if (tipusField && Array.isArray(tipusField.values)) {
        tipusField.values = tipusField.values.filter(
          (v) => v !== "fase_anadida" && v !== "fase_reiniciada",
        );
        app.save(hist);
      }
    } catch (_) {}
  },
);

/// <reference path="../pb_data/types.d.ts" />

// Añade configuración de fases a la colección `rutes` para permitir definir
// rutas nuevas con únicamente Fase 1, Fase 2 y Fase 3 (sin necesidad de crear
// muchas operaciones detalladas para el operario). El operario trabaja por
// fase como una sola operación agregada.
//
// fases_config: JSON array de { fase, activa, temps_std_min }
//   - fase: "Fase 1" | "Fase 2" | "Fase 3" (u otro nombre)
//   - activa: bool (si la fase se utiliza en la ruta)
//   - temps_std_min: number (tiempo estándar de la fase en minutos)
//
// No modifica ni elimina las operaciones existentes (operacions_def). Las
// rutas antiguas con operaciones detalladas conservan su comportamiento.

migrate(
  (app) => {
    const rutes = app.findCollectionByNameOrId("rutes");
    if (!rutes.fields.getByName("fases_config")) {
      rutes.fields.add(new JSONField({ name: "fases_config", maxSize: 20000 }));
      app.save(rutes);
    }
  },
  (app) => {
    const rutes = app.findCollectionByNameOrId("rutes");
    const f = rutes.fields.getByName("fases_config");
    if (f) {
      rutes.fields.removeByName("fases_config");
      app.save(rutes);
    }
  },
);

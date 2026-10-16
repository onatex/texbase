/// <reference path="../pb_data/types.d.ts" />

// Añade campos para registrar la causa de pausa por inactividad (90 min sin
// actividad del operario). El operario debe elegir explícitamente si la
// exclusiva está terminada o si continúa pausada por una razón:
//   - "Incidencia"
//   - "Parado por encargado"
// La causa se guarda en el registro (registres) y se muestra en Producción,
// Dashboard en vivo, historial y detalle de la exclusiva.

migrate(
  (app) => {
    const registres = app.findCollectionByNameOrId("registres");

    if (!registres.fields.getByName("motiu_pausa_inactivitat")) {
      registres.fields.add(
        new TextField({
          name: "motiu_pausa_inactivitat",
          required: false,
          max: 60,
        }),
      );
    }

    if (!registres.fields.getByName("inactivitat_detectada")) {
      registres.fields.add(
        new BoolField({
          name: "inactivitat_detectada",
          required: false,
        }),
      );
    }

    app.save(registres);
  },
  (app) => {
    const registres = app.findCollectionByNameOrId("registres");
    try { registres.fields.removeByName("motiu_pausa_inactivitat"); } catch (_) {}
    try { registres.fields.removeByName("inactivitat_detectada"); } catch (_) {}
    app.save(registres);
  },
);

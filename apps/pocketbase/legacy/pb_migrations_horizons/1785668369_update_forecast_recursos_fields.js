/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId("forecast_recursos");

    const numFields = ["dias_totales", "dias_festivos", "horas_semana_anterior", "horas_mes_anterior", "horas_dia_anterior"];
    const txtFields = ["fecha_inicio", "fecha_fin"];
    const jsonFields = ["operaris_actius_setmana_anterior"];

    for (const name of numFields) {
      if (!col.fields.getByName(name)) {
        col.fields.add(new NumberField({ name }));
      }
    }
    for (const name of txtFields) {
      if (!col.fields.getByName(name)) {
        col.fields.add(new TextField({ name, max: 12 }));
      }
    }
    for (const name of jsonFields) {
      if (!col.fields.getByName(name)) {
        col.fields.add(new JSONField({ name, maxSize: 50000 }));
      }
    }

    app.save(col);
  },
  (app) => {
    // no-op
  },
);

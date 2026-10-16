/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId("nominas_mensuales");

    // Add cotizaciones_empresa_total
    col.fields.add(new NumberField({ name: "cotizaciones_empresa_total", type: "number" }));
    // Add coste_empresa_total
    col.fields.add(new NumberField({ name: "coste_empresa_total", type: "number" }));

    app.save(col);
  },
  (app) => {
    const col = app.findCollectionByNameOrId("nominas_mensuales");
    col.fields.removeByName("cotizaciones_empresa_total");
    col.fields.removeByName("coste_empresa_total");
    app.save(col);
  }
);

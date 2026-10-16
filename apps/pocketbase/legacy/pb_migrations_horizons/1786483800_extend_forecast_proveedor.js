/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId("forecast_proveedor");
    const users = app.findCollectionByNameOrId("users");

    if (!col.fields.getByName("periodo_mes")) {
      col.fields.add(new NumberField({ name: "periodo_mes", onlyInt: true }));
    }
    if (!col.fields.getByName("periodo_any")) {
      col.fields.add(new NumberField({ name: "periodo_any", onlyInt: true }));
    }
    if (!col.fields.getByName("eficiencia_promedio")) {
      col.fields.add(new NumberField({ name: "eficiencia_promedio" }));
    }
    if (!col.fields.getByName("tiempo_ajustado")) {
      col.fields.add(new NumberField({ name: "tiempo_ajustado" }));
    }
    if (!col.fields.getByName("usuario_id")) {
      col.fields.add(
        new RelationField({
          name: "usuario_id",
          maxSelect: 1,
          collectionId: users.id,
        }),
      );
    }
    app.save(col);
  },
  (app) => {
    const col = app.findCollectionByNameOrId("forecast_proveedor");
    for (const f of ["periodo_mes", "periodo_any", "eficiencia_promedio", "tiempo_ajustado", "usuario_id"]) {
      if (col.fields.getByName(f)) col.fields.removeByName(f);
    }
    app.save(col);
  },
);

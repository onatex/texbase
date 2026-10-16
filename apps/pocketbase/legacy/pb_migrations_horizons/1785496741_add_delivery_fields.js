/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId("exclusives");

    // Update estat select to include new values
    const estatField = col.fields.getByName("estat");
    estatField.values = ["recibida", "pendent", "en_curs", "finalitzada", "bloquejada", "lista_recollida", "entregada", "retrasada"];
    col.fields.add(new TextField({ name: "data_entrega_real", max: 40 }));
    col.fields.add(new TextField({ name: "nota_entrega", max: 500 }));

    const users = app.findCollectionByNameOrId("users");
    col.fields.add(new RelationField({
      name: "entregada_per",
      collectionId: users.id,
      maxSelect: 1,
    }));

    app.save(col);
  },
  (app) => {
    const col = app.findCollectionByNameOrId("exclusives");
    const estatField = col.fields.getByName("estat");
    estatField.values = ["recibida", "pendent", "en_curs", "finalitzada", "bloquejada"];
    col.fields.removeByName("data_entrega_real");
    col.fields.removeByName("nota_entrega");
    col.fields.removeByName("entregada_per");
    app.save(col);
  }
);

/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // Add timing fields to controles_qualitat
    const cq = app.findCollectionByNameOrId("controles_qualitat");
    if (!cq.fields.getByName("temps_inspeccio_seg")) {
      cq.fields.add(new NumberField({ name: "temps_inspeccio_seg" }));
    }
    if (!cq.fields.getByName("temps_std_seg")) {
      cq.fields.add(new NumberField({ name: "temps_std_seg" }));
    }
    app.save(cq);

    // Add motiu_bloqueig to exclusives
    const ex = app.findCollectionByNameOrId("exclusives");
    if (!ex.fields.getByName("motiu_bloqueig")) {
      ex.fields.add(new TextField({ name: "motiu_bloqueig", max: 500 }));
    }
    app.save(ex);
  },
  (app) => {
    const cq = app.findCollectionByNameOrId("controles_qualitat");
    cq.fields.removeByName("temps_inspeccio_seg");
    cq.fields.removeByName("temps_std_seg");
    app.save(cq);

    const ex = app.findCollectionByNameOrId("exclusives");
    ex.fields.removeByName("motiu_bloqueig");
    app.save(ex);
  }
);

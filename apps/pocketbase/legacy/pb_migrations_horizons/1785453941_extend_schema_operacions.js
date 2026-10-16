/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 1. Extend rutes with version/status fields
    const rutes = app.findCollectionByNameOrId("rutes");
    let rutesChanged = false;
    const rutesNewFields = [
      ["versio", new TextField({ name: "versio", max: 20 })],
      ["data_aplicacio", new TextField({ name: "data_aplicacio", max: 40 })],
      ["estat_ruta", new SelectField({ name: "estat_ruta", maxSelect: 1, values: ["activa", "inactiva", "arxivada"] })],
      ["notas", new TextField({ name: "notas", max: 2000 })],
      ["temps_total_std_min", new NumberField({ name: "temps_total_std_min" })],
    ];
    for (const [name, field] of rutesNewFields) {
      if (!rutes.fields.getByName(name)) { rutes.fields.add(field); rutesChanged = true; }
    }
    if (rutesChanged) app.save(rutes);

    // 2. Create operacions_def collection
    try { app.findCollectionByNameOrId("operacions_def"); } catch (_) {
      const rutesCol = app.findCollectionByNameOrId("rutes");
      const c = new Collection({
        type: "base",
        name: "operacions_def",
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.rol = 'admin'",
        updateRule: "@request.auth.rol = 'admin'",
        deleteRule: "@request.auth.rol = 'admin'",
        fields: [
          new TextField({ name: "codi", required: true, max: 20 }),
          new TextField({ name: "nom", required: true, max: 200 }),
          new TextField({ name: "fase", max: 120 }),
          new NumberField({ name: "fase_ordre" }),
          new NumberField({ name: "ordre" }),
          new TextField({ name: "descripcio", max: 2000 }),
          new TextField({ name: "instruccions", max: 5000 }),
          new TextField({ name: "peca_zona", max: 200 }),
          new TextField({ name: "maquina", max: 200 }),
          new TextField({ name: "especialitat", max: 200 }),
          new NumberField({ name: "temps_std_min" }),
          new NumberField({ name: "temps_prep_min" }),
          new NumberField({ name: "unitats_lot" }),
          new TextField({ name: "op_anterior", max: 200 }),
          new TextField({ name: "op_seguent", max: 200 }),
          new BoolField({ name: "paralel" }),
          new BoolField({ name: "te_control_qualitat" }),
          new TextField({ name: "defectes_frequents", max: 2000 }),
          new BoolField({ name: "actiu" }),
          new RelationField({ name: "ruta", maxSelect: 1, collectionId: rutesCol.id }),
          new AutodateField({ name: "created", onCreate: true, onUpdate: false }),
          new AutodateField({ name: "updated", onCreate: true, onUpdate: true }),
        ],
        indexes: [
          "CREATE UNIQUE INDEX idx_opdef_codi ON operacions_def (codi)",
          "CREATE INDEX idx_opdef_ruta ON operacions_def (ruta)",
          "CREATE INDEX idx_opdef_ordre ON operacions_def (ordre)",
        ],
      });
      app.save(c);
    }

    // 3. Create controles_qualitat_def collection
    try { app.findCollectionByNameOrId("controles_qualitat_def"); } catch (_) {
      const rutesCol = app.findCollectionByNameOrId("rutes");
      const c = new Collection({
        type: "base",
        name: "controles_qualitat_def",
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.rol = 'admin'",
        updateRule: "@request.auth.rol = 'admin'",
        deleteRule: "@request.auth.rol = 'admin'",
        fields: [
          new TextField({ name: "codi", max: 20 }),
          new TextField({ name: "nom", required: true, max: 200 }),
          new TextField({ name: "fase_operacio", max: 200 }),
          new TextField({ name: "descripcio", max: 2000 }),
          new TextField({ name: "criteris_acceptacio", max: 2000 }),
          new TextField({ name: "defectes_frequents", max: 2000 }),
          new BoolField({ name: "obligatori" }),
          new RelationField({ name: "ruta", maxSelect: 1, collectionId: rutesCol.id }),
          new AutodateField({ name: "created", onCreate: true, onUpdate: false }),
          new AutodateField({ name: "updated", onCreate: true, onUpdate: true }),
        ],
        indexes: [
          "CREATE INDEX idx_cqdef_ruta ON controles_qualitat_def (ruta)",
        ],
      });
      app.save(c);
    }

    // 4. Update controles_qualitat resultat with extended values
    const cq = app.findCollectionByNameOrId("controles_qualitat");
    const resField = cq.fields.getByName("resultat");
    if (resField) {
      resField.values = ["aprovat", "aprovat_obs", "retreball", "rebutjat", "bloquejat", "ok", "ko", "pendent"];
      app.save(cq);
    }

    // 5. Add observacions field to controles_qualitat if missing
    if (!cq.fields.getByName("observacions")) {
      cq.fields.add(new TextField({ name: "observacions", max: 2000 }));
      app.save(cq);
    }
  },
  (app) => {
    try { app.delete(app.findCollectionByNameOrId("controles_qualitat_def")); } catch (_) {}
    try { app.delete(app.findCollectionByNameOrId("operacions_def")); } catch (_) {}
  }
);

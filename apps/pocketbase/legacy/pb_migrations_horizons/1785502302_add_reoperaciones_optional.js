/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    // Add reoperations fields to registres
    const registres = app.findCollectionByNameOrId("registres");

    if (!registres.fields.getByName("tipus")) {
      registres.fields.add(new SelectField({
        name: "tipus",
        maxSelect: 1,
        values: ["normal", "reoperacio"],
      }));
    }

    if (!registres.fields.getByName("registre_original")) {
      registres.fields.add(new RelationField({
        name: "registre_original",
        maxSelect: 1,
        collectionId: registres.id,
        cascadeDelete: false,
      }));
    }

    app.save(registres);

    // Add optional flag to operacions_def and open updateRule for admin
    const opsDef = app.findCollectionByNameOrId("operacions_def");
    if (!opsDef.fields.getByName("es_opcional")) {
      opsDef.fields.add(new BoolField({ name: "es_opcional" }));
    }
    opsDef.updateRule = "@request.auth.rol = 'admin'";
    app.save(opsDef);
  },
  (app) => {
    const registres = app.findCollectionByNameOrId("registres");
    try { registres.fields.removeByName("tipus"); } catch (_) {}
    try { registres.fields.removeByName("registre_original"); } catch (_) {}
    app.save(registres);

    const opsDef = app.findCollectionByNameOrId("operacions_def");
    try { opsDef.fields.removeByName("es_opcional"); } catch (_) {}
    opsDef.updateRule = null;
    app.save(opsDef);
  }
);

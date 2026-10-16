/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // Fix operacions_def — allow any authenticated user to read
    const opsDef = app.findCollectionByNameOrId("operacions_def");
    opsDef.listRule = "@request.auth.id != ''";
    opsDef.viewRule = "@request.auth.id != ''";
    app.save(opsDef);

    // Fix controles_qualitat_def — allow any authenticated user to read
    const cqDef = app.findCollectionByNameOrId("controles_qualitat_def");
    cqDef.listRule = "@request.auth.id != ''";
    cqDef.viewRule = "@request.auth.id != ''";
    app.save(cqDef);
  },
  (app) => {
    const opsDef = app.findCollectionByNameOrId("operacions_def");
    opsDef.listRule = null;
    opsDef.viewRule = null;
    app.save(opsDef);

    const cqDef = app.findCollectionByNameOrId("controles_qualitat_def");
    cqDef.listRule = null;
    cqDef.viewRule = null;
    app.save(cqDef);
  }
);

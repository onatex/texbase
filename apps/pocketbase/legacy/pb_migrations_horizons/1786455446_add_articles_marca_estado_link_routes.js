/// <reference path="../pb_data/types.d.ts" />

// Adds marca + estado fields to articles and links articles to existing routes
// (R82-020, R82-021, R84-054). Existing articles keep empty estado; the frontend
// treats empty estado as 'activo', so no record backfill is needed.

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId("articles");

    // marca
    if (!col.fields.getByName("marca")) {
      col.fields.add(
        new TextField({ name: "marca", max: 100 }),
      );
    }

    // estado (activo / inactivo)
    if (!col.fields.getByName("estado")) {
      col.fields.add(
        new SelectField({
          name: "estado",
          maxSelect: 1,
          values: ["activo", "inactivo"],
        }),
      );
    }

    app.save(col);

    // Link articles to routes (only sets ruta, which is not required,
    // so saving won't trigger nom/referencia validation issues).
    const links = [
      { ref: "R82-020", routeFilter: "nom ~ 'R82-020'" },
      { ref: "R82-021", routeFilter: "nom ~ 'R82-021'" },
      { ref: "R84-054", routeFilter: "nom ~ 'R84-054'" },
    ];

    for (const { ref, routeFilter } of links) {
      let route = null;
      try {
        const found = app.findRecordsByFilter("rutes", routeFilter, "", 1, 0);
        if (found && found.length) route = found[0];
      } catch (_) {
        route = null;
      }
      if (!route) {
        console.log(`Route not found for ${ref}, skipping link`);
        continue;
      }

      let refArts = [];
      try {
        refArts = app.findRecordsByFilter(
          "articles",
          `referencia = '${ref}'`,
          "", 1, 0,
        );
      } catch (_) {
        refArts = [];
      }
      for (const a of refArts) {
        if (a.getString("ruta") !== route.id) {
          a.set("ruta", route.id);
          app.save(a);
          console.log(`Linked article ${ref} → route ${route.getString("nom")}`);
        }
      }
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId("articles");
      if (col.fields.getByName("marca")) col.fields.removeByName("marca");
      if (col.fields.getByName("estado")) col.fields.removeByName("estado");
      app.save(col);
    } catch (e) {
      if (e.message.includes("no rows in result set")) return;
      throw e;
    }
  },
);

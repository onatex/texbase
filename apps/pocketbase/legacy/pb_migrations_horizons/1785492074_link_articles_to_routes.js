/// <reference path="../pb_data/types.d.ts" />

// Links R82-020 and R82-021 articles to their routes,
// then backfills exclusivas that reference those articles but have no ruta.

migrate(
  (app) => {
    const routeMap = [
      { articleRef: "R82-020", routeNom: "Ruta R82-020 UNIC PLUS SUIT" },
      { articleRef: "R82-021", routeNom: "Ruta R82-021 UNIC PLUS SUIT" },
    ];

    for (const { articleRef, routeNom } of routeMap) {
      // Find the route
      let route;
      try {
        const found = app.findRecordsByFilter("rutes", `nom = '${routeNom}'`, "", 1, 0);
        if (!found || found.length === 0) {
          console.log(`Route not found: ${routeNom}`);
          continue;
        }
        route = found[0];
      } catch (e) {
        console.log(`Error finding route ${routeNom}: ${e.message}`);
        continue;
      }

      // Update all articles whose referencia contains this ref
      let articles;
      try {
        articles = app.findRecordsByFilter(
          "articles",
          `referencia ~ '${articleRef}'`,
          "", 100, 0
        );
      } catch (_) {
        articles = [];
      }

      for (const art of articles) {
        art.set("ruta", route.id);
        app.save(art);
        console.log(`Linked article ${art.getString("referencia")} → route ${routeNom}`);
      }

      // Backfill exclusivas: find those with matching referencia but missing ruta
      let exclusivas;
      try {
        exclusivas = app.findRecordsByFilter(
          "exclusives",
          `referencia ~ '${articleRef}' && ruta = ''`,
          "", 5000, 0
        );
      } catch (_) {
        exclusivas = [];
      }

      for (const ex of exclusivas) {
        ex.set("ruta", route.id);
        app.save(ex);
        console.log(`Backfilled exclusiva ${ex.getString("exclusiva")} with ruta ${routeNom}`);
      }

      // Also check exclusivas where article field contains the ref (fallback)
      let exclusivas2;
      try {
        exclusivas2 = app.findRecordsByFilter(
          "exclusives",
          `article ~ '${articleRef}' && ruta = ''`,
          "", 5000, 0
        );
      } catch (_) {
        exclusivas2 = [];
      }

      for (const ex of exclusivas2) {
        ex.set("ruta", route.id);
        app.save(ex);
        console.log(`Backfilled (via article) exclusiva ${ex.getString("exclusiva")} with ruta ${routeNom}`);
      }
    }
  },
  (app) => {
    // No destructive rollback — field updates are safe to leave
  }
);

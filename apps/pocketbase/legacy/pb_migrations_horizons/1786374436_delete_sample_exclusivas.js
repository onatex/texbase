/// <reference path="../pb_data/types.d.ts" />

// Delete all sample exclusivas (EXC-2024-*) and cascade-dependent data.
// Real exclusivas (any other code) are preserved.

migrate(
  (app) => {
    // Find all sample exclusivas matching the EXC-2024- pattern.
    let sampleExc;
    try {
      sampleExc = app.findRecordsByFilter("exclusives", "exclusiva ~ 'EXC-2024-'");
    } catch (e) {
      if (e.message.includes("no rows in result set")) {
        console.log("No sample exclusivas to delete");
        return;
      }
      throw e;
    }

    // Collections that reference exclusiva WITHOUT cascadeDelete must be
    // detached first, otherwise app.delete(exclusiva) fails.
    const detachCollections = [
      "no_conformitats",
      "fases_externalizadas",
      "retrabajos",
      "controles_qualitat",
    ];

    let deleted = 0;
    for (const exc of sampleExc) {
      const excId = exc.id;

      // Detach non-cascade references (set exclusiva to "").
      for (const colName of detachCollections) {
        let refs;
        try {
          refs = app.findRecordsByFilter(colName, `exclusiva = "${excId}"`);
        } catch (_) {
          refs = [];
        }
        for (const r of refs) {
          r.set("exclusiva", "");
          app.save(r);
        }
      }

      // monos and registres have cascadeDelete:true on exclusiva, so they are
      // removed automatically when the exclusiva is deleted.
      app.delete(exc);
      deleted++;
    }
    console.log(`Deleted ${deleted} sample exclusivas (EXC-2024-*)`);
  },
  (app) => {
    // Cannot recreate deleted sample data — original rows are gone.
  },
);

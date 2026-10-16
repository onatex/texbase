/// <reference path="../pb_data/types.d.ts" />

// 1. operacions_def.codi had a GLOBAL unique index, but the same codi
//    legitimately appears on multiple routes (e.g. UNIC-001 on R82-020 and
//    R82-021) and the "Añadir operación" / edit clone flow reuses codis on a
//    cloned route. Remove the global unique so cloning works; add a plain
//    (non-unique) index on (ruta, codi) for lookups.
// 2. Add orden_anterior / orden_nuevo / alcance to historial_cambios_exclusivas
//    so reordering and edit-reach are auditable.

migrate(
  (app) => {
    // ── 1. operacions_def indexes ────────────────────────────────────────
    // The original global UNIQUE index on codi is incompatible with the
    // existing data (the same codi legitimately appears on multiple routes,
    // and the "Añadir operación" / edit clone flow reuses codis on a cloned
    // route). Remove any global unique on codi so cloning works, and add a
    // plain (non-unique) index on (ruta, codi) for lookups.
    const opdef = app.findCollectionByNameOrId("operacions_def");
    opdef.indexes = (opdef.indexes || []).filter(
      (i) => !i.includes("idx_opdef_codi"),
    );
    if (!opdef.indexes.some((i) => i.includes("idx_opdef_ruta_codi"))) {
      opdef.indexes.push(
        "CREATE INDEX idx_opdef_ruta_codi ON operacions_def (ruta, codi)",
      );
    }
    app.save(opdef);

    // ── 2. historial_cambios_exclusivas fields ───────────────────────────
    const hist = app.findCollectionByNameOrId("historial_cambios_exclusivas");
    const addField = (name, field) => {
      if (!hist.fields.getByName(name)) {
        hist.fields.add(field);
        return true;
      }
      return false;
    };
    let changed = false;
    changed = addField("orden_anterior", new NumberField({ name: "orden_anterior" })) || changed;
    changed = addField("orden_nuevo", new NumberField({ name: "orden_nuevo" })) || changed;
    changed = addField(
      "alcance",
      new SelectField({
        name: "alcance",
        maxSelect: 1,
        values: ["exclusiva", "articulo", "ambos"],
      }),
    ) || changed;
    if (changed) app.save(hist);
  },
  (app) => {
    try {
      const opdef = app.findCollectionByNameOrId("operacions_def");
      opdef.indexes = (opdef.indexes || []).filter(
        (i) => !i.includes("idx_opdef_ruta_codi"),
      );
      app.save(opdef);
    } catch (_) {}

    try {
      const hist = app.findCollectionByNameOrId("historial_cambios_exclusivas");
      hist.fields.removeByName("orden_anterior");
      hist.fields.removeByName("orden_nuevo");
      hist.fields.removeByName("alcance");
      app.save(hist);
    } catch (_) {}
  },
);

/// <reference path="../pb_data/types.d.ts" />

// Habilita la gestión de rutas desde Producción:
//  1. Extiende historial_cambios_exclusivas.tipo_cambio con eventos de
//     gestión de rutas (ruta_creada, ruta_editada, ruta_asignada,
//     ruta_desasignada) y añade campos articulo_referencia y ruta_id para
//     auditar asignaciones/desasignaciones sin exclusiva concreta.
//  2. Hace exclusiva_id opcional (los eventos de ruta no siempre tienen
//     una exclusiva asociada).
//  3. Permite a Producción y Super Admin eliminar operacions_def y rutes
//     (quitar operaciones de una ruta, eliminar rutas gestionadas).

migrate(
  (app) => {
    const PROD =
      "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio'";

    // ── 1. historial_cambios_exclusivas ──────────────────────────────────
    const hist = app.findCollectionByNameOrId("historial_cambios_exclusivas");

    // 1a. Extender valores de tipo_cambio
    const tipusField = hist.fields.getByName("tipo_cambio");
    if (tipusField && Array.isArray(tipusField.values)) {
      const merged = [...tipusField.values];
      for (const v of [
        "ruta_creada",
        "ruta_editada",
        "ruta_asignada",
        "ruta_desasignada",
      ]) {
        if (!merged.includes(v)) merged.push(v);
      }
      tipusField.values = merged;
    }

    // 1b. exclusiva_id opcional (los eventos de ruta pueden no tener exclusiva)
    const excField = hist.fields.getByName("exclusiva_id");
    if (excField) {
      excField.required = false;
    }

    // 1c. Nuevos campos para auditar rutas sin exclusiva
    if (!hist.fields.getByName("articulo_referencia")) {
      hist.fields.add(new TextField({ name: "articulo_referencia", max: 100 }));
    }
    if (!hist.fields.getByName("ruta_id")) {
      hist.fields.add(new TextField({ name: "ruta_id", max: 60 }));
    }
    app.save(hist);

    // ── 2. Permisos de eliminación para Producción/Super Admin ───────────
    const opdef = app.findCollectionByNameOrId("operacions_def");
    opdef.deleteRule = PROD;
    app.save(opdef);

    const rutes = app.findCollectionByNameOrId("rutes");
    rutes.deleteRule = PROD;
    app.save(rutes);
  },
  (app) => {
    const ADMIN = "@request.auth.rol = 'admin'";

    try {
      const hist = app.findCollectionByNameOrId("historial_cambios_exclusivas");
      const tipusField = hist.fields.getByName("tipo_cambio");
      if (tipusField && Array.isArray(tipusField.values)) {
        tipusField.values = tipusField.values.filter(
          (v) =>
            v !== "ruta_creada" &&
            v !== "ruta_editada" &&
            v !== "ruta_asignada" &&
            v !== "ruta_desasignada",
        );
      }
      const excField = hist.fields.getByName("exclusiva_id");
      if (excField) excField.required = true;
      hist.fields.removeByName("articulo_referencia");
      hist.fields.removeByName("ruta_id");
      app.save(hist);
    } catch (_) {}

    try {
      const opdef = app.findCollectionByNameOrId("operacions_def");
      opdef.deleteRule = ADMIN;
      app.save(opdef);
    } catch (_) {}

    try {
      const rutes = app.findCollectionByNameOrId("rutes");
      rutes.deleteRule = ADMIN;
      app.save(rutes);
    } catch (_) {}
  },
);

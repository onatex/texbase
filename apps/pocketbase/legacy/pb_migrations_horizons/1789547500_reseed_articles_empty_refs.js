/// <reference path="../pb_data/types.d.ts" />

// Repara artículos con referencia/nom vacíos (datos perdidos al recrear campos)
// y re-siembra el catálogo estándar usado por rutas y carga masiva.

migrate(
  (app) => {
    const seed = [
      { referencia: "R82-020", nom: "UNIC PLUS SUIT", familia: "UNIC PLUS", routeHint: "R82-020" },
      { referencia: "R82-021", nom: "UNIC PLUS SUIT", familia: "UNIC PLUS", routeHint: "R82-021" },
      { referencia: "R84-053", nom: "CIK FIA SUIT", familia: "CIK FIA", routeHint: "" },
      { referencia: "R84-054", nom: "CIK FIA SUIT", familia: "CIK FIA", routeHint: "R84-054" },
      { referencia: "R80-600", nom: "AIR PLUS", familia: "AIR PLUS", routeHint: "" },
      { referencia: "R80-601", nom: "AIR PLUS", familia: "AIR PLUS", routeHint: "" },
      { referencia: "R80-610", nom: "AIR PLUS DP", familia: "AIR PLUS", routeHint: "" },
      { referencia: "R80-611", nom: "AIR PLUS DP", familia: "AIR PLUS", routeHint: "" },
      { referencia: "R80-620", nom: "AIR PLUS MIX", familia: "AIR PLUS", routeHint: "" },
      { referencia: "R80-621", nom: "AIR PLUS MIX", familia: "AIR PLUS", routeHint: "" },
      { referencia: "R80-701", nom: "FACTORY SUIT", familia: "FACTORY", routeHint: "" },
      { referencia: "R80-702", nom: "FACTORY SUIT", familia: "FACTORY", routeHint: "" },
      { referencia: "R80-705", nom: "FACTORY SUIT DP", familia: "FACTORY", routeHint: "" },
      { referencia: "R84-200", nom: "UNIK RENTAL", familia: "UNIK", routeHint: "" },
      { referencia: "R84-210", nom: "UNIK RENTAL", familia: "UNIK", routeHint: "" },
      { referencia: "R84-220", nom: "UNIK PLUJA", familia: "UNIK", routeHint: "" },
      { referencia: "R82-026", nom: "UNIC PLUS BABY", familia: "UNIC PLUS", routeHint: "" },
      { referencia: "R82-061", nom: "UNIC PLUS MEDIA", familia: "UNIC PLUS", routeHint: "" },
      { referencia: "R54-100", nom: "MONO COMISARI", familia: "COMISARI", routeHint: "" },
      { referencia: "R54-101", nom: "MONO COMISARI", familia: "COMISARI", routeHint: "" },
      { referencia: "R54-102", nom: "MONO COMISARI", familia: "COMISARI", routeHint: "" },
    ];

    const col = app.findCollectionByNameOrId("articles");

    // Borrar filas totalmente vacías (sin referencia ni nombre)
    let empties = [];
    try {
      empties = app.findRecordsByFilter("articles", "referencia = '' && nom = ''", "", 500, 0);
    } catch (_) {
      empties = [];
    }
    for (const rec of empties) {
      try {
        app.delete(rec);
      } catch (_) {
        /* ignore */
      }
    }

    const findRouteId = (hint) => {
      if (!hint) return "";
      try {
        const found = app.findRecordsByFilter("rutes", `nom ~ '${hint}'`, "", 1, 0);
        if (found && found.length) return found[0].id;
      } catch (_) {
        /* ignore */
      }
      return "";
    };

    for (const d of seed) {
      let existing = null;
      try {
        existing = app.findFirstRecordByFilter("articles", `referencia = '${d.referencia}'`);
      } catch (_) {
        existing = null;
      }

      if (existing) {
        // Completar nombre/familia si faltan; no pisar ruta ya asignada
        let dirty = false;
        if (!existing.getString("nom")) {
          existing.set("nom", d.nom);
          dirty = true;
        }
        if (!existing.getString("familia")) {
          existing.set("familia", d.familia);
          dirty = true;
        }
        if (!existing.getString("estado")) {
          existing.set("estado", "activo");
          dirty = true;
        }
        if (!existing.get("ruta") && d.routeHint) {
          const rid = findRouteId(d.routeHint);
          if (rid) {
            existing.set("ruta", rid);
            dirty = true;
          }
        }
        if (dirty) app.save(existing);
        continue;
      }

      const rec = new Record(col);
      rec.set("referencia", d.referencia);
      rec.set("nom", d.nom);
      rec.set("familia", d.familia);
      rec.set("estado", "activo");
      rec.set("temps_estandard_total_min", 0);
      rec.set("observacions", "");
      const rid = findRouteId(d.routeHint);
      if (rid) rec.set("ruta", rid);
      try {
        app.save(rec);
      } catch (_) {
        // unique index / race
      }
    }
  },
  (app) => {
    // No-op: no borramos el catálogo en rollback
  },
);

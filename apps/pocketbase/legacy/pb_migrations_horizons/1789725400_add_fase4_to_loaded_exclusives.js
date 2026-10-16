/// <reference path="../pb_data/types.d.ts" />

// Aplica Fase 4 a las exclusivas YA CARGADAS cuyos artículos sean R84-053 o
// R84-054, sin limitarlo a exclusivas futuras.
//
// - Añade el campo JSON `fases_config` a la colección `exclusives`.
// - Detecta las exclusivas existentes relacionadas con esos artículos (por
//   referencia exacta o porque el campo `article` contiene el código) y
//   siembra en su `fases_config` Fase 1, Fase 2, Fase 3 y Fase 4 activas,
//   copiando los tiempos estándar del artículo cuando existan.
// - No modifica ni reabre fases, operaciones, monos, estados, tiempos de
//   registros, pausas, calidad, retrabajos ni historial existentes.
// - No cambia rutas predefinidas ni operaciones detalladas.
// - El operario podrá seleccionar Fase 4 como unidad de trabajo en esas
//   exclusivas; el resto de artículos continúan con tres fases.

migrate(
  (app) => {
    // 1) Añadir fases_config a exclusives si no existe.
    const exclusives = app.findCollectionByNameOrId("exclusives");
    if (!exclusives.fields.getByName("fases_config")) {
      exclusives.fields.add(
        new JSONField({ name: "fases_config", maxSize: 20000 }),
      );
      app.save(exclusives);
    }

    const parseFases = (raw) => {
      let arr = [];
      if (Array.isArray(raw)) arr = raw;
      else if (typeof raw === "string" && raw.trim()) {
        try { arr = JSON.parse(raw); } catch { arr = []; }
      }
      return Array.isArray(arr) ? arr.filter((c) => c && c.fase) : [];
    };

    const ordreFase = (f) => {
      const m = String(f || "").match(/fase\s*(\d+)/i);
      return m ? Number(m[1]) : 99;
    };

    const norm = (s) => String(s || "").trim().toUpperCase();

    // 2) Cargar fases_config de los artículos R84-053 / R84-054 para copiar
    //    sus tiempos estándar a las exclusivas.
    let artRecords = [];
    try {
      artRecords = app.findRecordsByFilter(
        "articles",
        "referencia = 'R84-053' || referencia = 'R84-054'",
      );
    } catch (e) {
      if (e.message && e.message.includes("no rows in result set")) {
        artRecords = [];
      } else {
        throw e;
      }
    }
    const artCfgByRef = new Map();
    for (const a of artRecords) {
      artCfgByRef.set(norm(a.get("referencia")), parseFases(a.get("fases_config")));
    }

    // 3) Detectar exclusivas ya cargadas relacionadas con esos artículos.
    let exRecords = [];
    try {
      exRecords = app.findRecordsByFilter(
        "exclusives",
        "referencia = 'R84-053' || referencia = 'R84-054' || article ~ 'R84-053' || article ~ 'R84-054'",
      );
    } catch (e) {
      if (e.message && e.message.includes("no rows in result set")) {
        exRecords = [];
      } else {
        throw e;
      }
    }

    const defaults = [
      { fase: "Fase 1", activa: true, temps_std_min: 0 },
      { fase: "Fase 2", activa: true, temps_std_min: 0 },
      { fase: "Fase 3", activa: true, temps_std_min: 0 },
      { fase: "Fase 4", activa: true, temps_std_min: 0 },
    ];

    for (const rec of exRecords) {
      const ref = norm(rec.get("referencia"));
      const artTxt = norm(rec.get("article"));

      // Resolver la configuración del artículo correspondiente.
      let artCfg = artCfgByRef.get(ref) || null;
      if (!artCfg && artTxt) {
        for (const [r, c] of artCfgByRef) {
          if (r && artTxt.includes(r)) { artCfg = c; break; }
        }
      }

      // Conservar cualquier fase ya configurada manualmente en la exclusiva.
      const existing = parseFases(rec.get("fases_config"));
      const map = new Map();
      for (const c of existing) {
        map.set(c.fase, {
          fase: c.fase,
          activa: c.activa !== false,
          temps_std_min: Number(c.temps_std_min) || 0,
        });
      }

      // Construir Fase 1/2/3/4: respeta lo existente, si no usa tiempos del
      // artículo y por defecto 0 min.
      const base = defaults.map((d) => {
        const ex = map.get(d.fase);
        if (ex) return ex;
        const fromArt = artCfg
          ? artCfg.find((c) => c.fase === d.fase)
          : null;
        return {
          fase: d.fase,
          activa: true,
          temps_std_min: Number(fromArt?.temps_std_min) || 0,
        };
      });

      // Preservar fases extra que pudiera tener la exclusiva.
      for (const c of existing) {
        if (!base.some((b) => b.fase === c.fase)) {
          base.push({
            fase: c.fase,
            activa: c.activa !== false,
            temps_std_min: Number(c.temps_std_min) || 0,
          });
        }
      }

      base.sort((a, b) => ordreFase(a.fase) - ordreFase(b.fase));
      rec.set("fases_config", base);
      app.save(rec);
    }
  },
  (app) => {
    // Revertir: limpiar fases_config de las exclusivas afectadas y quitar el
    // campo de la colección.
    let exRecords = [];
    try {
      exRecords = app.findRecordsByFilter(
        "exclusives",
        "referencia = 'R84-053' || referencia = 'R84-054' || article ~ 'R84-053' || article ~ 'R84-054'",
      );
    } catch (e) {
      if (e.message && e.message.includes("no rows in result set")) {
        exRecords = [];
      } else {
        throw e;
      }
    }
    for (const rec of exRecords) {
      rec.set("fases_config", []);
      app.save(rec);
    }

    try {
      const exclusives = app.findCollectionByNameOrId("exclusives");
      if (exclusives.fields.getByName("fases_config")) {
        exclusives.fields.removeByName("fases_config");
        app.save(exclusives);
      }
    } catch (e) {
      // Si no se puede quitar el campo, no es crítico: ya está vacío.
    }
  },
);

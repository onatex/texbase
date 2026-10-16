/// <reference path="../pb_data/types.d.ts" />

// Añade Fase 4 (activa, tiempo 0) a la configuración de fases de los artículos
// R84-053 y R84-054, preservando las fases existentes (Fase 1/2/3 con sus
// tiempos). Producción podrá editar después el tiempo previsto de Fase 4.
// No modifica rutas, exclusivas, operaciones, registros ni historial.

migrate(
  (app) => {
    let records = [];
    try {
      records = app.findRecordsByFilter(
        "articles",
        "referencia = 'R84-053' || referencia = 'R84-054'",
      );
    } catch (e) {
      if (e.message && e.message.includes("no rows in result set")) {
        records = [];
      } else {
        throw e;
      }
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

    const defaults = [
      { fase: "Fase 1", activa: true, temps_std_min: 0 },
      { fase: "Fase 2", activa: true, temps_std_min: 0 },
      { fase: "Fase 3", activa: true, temps_std_min: 0 },
    ];

    for (const rec of records) {
      const existing = parseFases(rec.get("fases_config"));
      const map = new Map();
      for (const c of existing) {
        map.set(c.fase, {
          fase: c.fase,
          activa: c.activa !== false,
          temps_std_min: Number(c.temps_std_min) || 0,
        });
      }
      const base = defaults.map((d) => map.get(d.fase) || { ...d });
      // Añadir Fase 4 si no existe; preservar cualquier otra fase extra.
      base.push(
        map.get("Fase 4") || { fase: "Fase 4", activa: true, temps_std_min: 0 },
      );
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
    let records = [];
    try {
      records = app.findRecordsByFilter(
        "articles",
        "referencia = 'R84-053' || referencia = 'R84-054'",
      );
    } catch (e) {
      if (e.message && e.message.includes("no rows in result set")) {
        records = [];
      } else {
        throw e;
      }
    }
    const parseFases = (raw) => {
      let arr = [];
      if (Array.isArray(raw)) arr = raw;
      else if (typeof raw === "string" && raw.trim()) {
        try { arr = JSON.parse(raw); } catch { arr = []; }
      }
      return Array.isArray(arr) ? arr.filter((c) => c && c.fase) : [];
    };
    for (const rec of records) {
      const existing = parseFases(rec.get("fases_config"));
      const filtered = existing.filter((c) => c.fase !== "Fase 4");
      rec.set("fases_config", filtered);
      app.save(rec);
    }
  },
);

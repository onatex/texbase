/// <reference path="../pb_data/types.d.ts" />

// Corrige la configuración de fases de todos los artículos y exclusivas para
// que cumplan la regla canónica:
//   - Todos los artículos tienen siempre Fase 1, Fase 2 y Fase 3.
//   - Solo los artículos CIK (referencias R84-053 y R84-054) tienen además
//     Fase 4.
//
// Qué hace:
//   - Para cada artículo: reconstruye fases_config con las fases esperadas
//     (3 base, 4 si CIK), conservando los tiempos estándar ya configurados.
//     Elimina Fase 4 de artículos no CIK y añade las fases que falten con
//     tiempo 0 (editable por Administración/Producción).
//   - Para cada exclusiva: igual, resolviendo si es CIK por referencia,
//     campo article, marca o artículo relacionado (familia CIK).
//
// No modifica ni reabre fases, operaciones, monos, estados, tiempos de
// registros, pausas, calidad, retrabajos ni historial existentes. Solo
// completa/corrige la configuración de fases (fases_config) para que la
// disponibilidad futura sea correcta según el artículo.

migrate(
  (app) => {
    const norm = (s) => String(s || "").trim().toUpperCase();
    const CIK_REFS = ["R84-053", "R84-054"];

    const isCikRef = (ref) => CIK_REFS.includes(norm(ref));
    const isCikByArticleTxt = (txt) => {
      const t = norm(txt);
      return t.includes("R84-053") || t.includes("R84-054");
    };

    const parseFases = (raw) => {
      let arr = [];
      if (Array.isArray(raw)) arr = raw;
      else if (typeof raw === "string" && raw.trim()) {
        try { arr = JSON.parse(raw); } catch { arr = []; }
      }
      return Array.isArray(arr) ? arr.filter((c) => c && c.fase) : [];
    };

    const canonFase = (fase) => {
      const m = String(fase || "").match(/fase\s*(\d+)/i);
      const n = m ? Number(m[1]) : null;
      return n >= 1 && n <= 4 ? `Fase ${n}` : String(fase || "").trim();
    };

    const ordreFase = (f) => {
      const m = String(f || "").match(/fase\s*(\d+)/i);
      return m ? Number(m[1]) : 99;
    };

    // Construye la lista canónica de fases a partir de las existentes.
    // expected = ["Fase 1","Fase 2","Fase 3"] o ["Fase 1".."Fase 4"].
    const buildCanon = (existing, expected) => {
      const map = new Map();
      for (const c of existing) {
        const key = canonFase(c.fase);
        map.set(key, {
          fase: key,
          activa: c.activa !== false,
          temps_std_min: Number(c.temps_std_min) || 0,
        });
      }
      const result = expected.map((f) => {
        const ex = map.get(f);
        if (ex) return ex;
        // Fase que falta: activa, tiempo 0 (editable).
        return { fase: f, activa: true, temps_std_min: 0 };
      });
      result.sort((a, b) => ordreFase(a.fase) - ordreFase(b.fase));
      return result;
    };

    const sameFases = (a, b) => {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      return a.every((x, i) => {
        const y = b[i];
        return (
          x.fase === y.fase &&
          (x.activa !== false) === (y.activa !== false) &&
          (Number(x.temps_std_min) || 0) === (Number(y.temps_std_min) || 0)
        );
      });
    };

    // ── 1) Artículos ──────────────────────────────────────────────────────
    const articlesCol = app.findCollectionByNameOrId("articles");
    let artRecords = [];
    try {
      artRecords = app.findAllRecords(articlesCol);
    } catch (e) {
      artRecords = [];
    }

    // Mapa referencia → familia para resolver CIK en exclusivas.
    const artFamiliaByRef = new Map();

    for (const rec of artRecords) {
      const ref = norm(rec.get("referencia"));
      const familia = norm(rec.get("familia"));
      if (ref) artFamiliaByRef.set(ref, familia);

      const isCik =
        isCikRef(ref) ||
        familia.includes("CIK") ||
        isCikByArticleTxt(rec.get("nom")) ||
        isCikByArticleTxt(rec.get("article"));
      const expected = isCik
        ? ["Fase 1", "Fase 2", "Fase 3", "Fase 4"]
        : ["Fase 1", "Fase 2", "Fase 3"];

      const existing = parseFases(rec.get("fases_config"));
      const canon = buildCanon(existing, expected);
      if (!sameFases(existing, canon)) {
        rec.set("fases_config", canon);
        app.save(rec);
      }
    }

    // ── 2) Exclusivas ─────────────────────────────────────────────────────
    // fases_config ya existe en la colección exclusives (añadido en
    // 1789725400). Si por algún motivo no existiera, lo creamos.
    const exclusivesCol = app.findCollectionByNameOrId("exclusives");
    if (!exclusivesCol.fields.getByName("fases_config")) {
      exclusivesCol.fields.add(
        new JSONField({ name: "fases_config", maxSize: 20000 }),
      );
      app.save(exclusivesCol);
    }

    let exRecords = [];
    try {
      exRecords = app.findAllRecords(exclusivesCol);
    } catch (e) {
      exRecords = [];
    }

    for (const rec of exRecords) {
      const ref = norm(rec.get("referencia"));
      const artTxt = norm(rec.get("article"));
      const marca = norm(rec.get("marca"));
      const fam = ref ? artFamiliaByRef.get(ref) || "" : "";

      const isCik =
        isCikRef(ref) ||
        isCikByArticleTxt(artTxt) ||
        marca.includes("CIK") ||
        fam.includes("CIK");
      const expected = isCik
        ? ["Fase 1", "Fase 2", "Fase 3", "Fase 4"]
        : ["Fase 1", "Fase 2", "Fase 3"];

      const existing = parseFases(rec.get("fases_config"));
      const canon = buildCanon(existing, expected);
      if (!sameFases(existing, canon)) {
        rec.set("fases_config", canon);
        app.save(rec);
      }
    }
  },
  (app) => {
    // Revertir no es seguro ni necesario: la configuración canónica es la
    // deseada. No restauramos estados parciales previos.
  },
);

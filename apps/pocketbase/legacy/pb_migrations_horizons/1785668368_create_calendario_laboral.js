/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    let col;
    try {
      col = app.findCollectionByNameOrId("calendario_laboral");
    } catch (_) {
      col = new Collection({
        type: "base",
        name: "calendario_laboral",
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        updateRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        deleteRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        fields: [
          { name: "fecha", type: "text", required: true, max: 12 },
          { name: "tipo", type: "select", maxSelect: 1, values: ["laboral", "festivo", "vacaciones"], required: true },
          { name: "descripcio", type: "text", max: 200 },
          { name: "operaris_en_vacances", type: "json", maxSize: 10000 },
          { name: "created", type: "autodate", onCreate: true },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE UNIQUE INDEX idx_calendario_fecha ON calendario_laboral (fecha)"
        ],
      });
      app.save(col);
    }

    // Seed Spanish/Sabadell holidays for 2024 and 2025
    const holidays = [
      // 2024 festivos nacionales + Cataluña + Sabadell
      { fecha: "2024-01-01", tipo: "festivo", descripcio: "Cap d'Any / Año Nuevo" },
      { fecha: "2024-01-06", tipo: "festivo", descripcio: "Reis Mags / Epifanía del Señor" },
      { fecha: "2024-03-29", tipo: "festivo", descripcio: "Divendres Sant / Viernes Santo" },
      { fecha: "2024-04-01", tipo: "festivo", descripcio: "Dilluns de Pasqua / Lunes de Pascua" },
      { fecha: "2024-05-01", tipo: "festivo", descripcio: "Dia del Treball / Día del Trabajo" },
      { fecha: "2024-06-24", tipo: "festivo", descripcio: "Sant Joan" },
      { fecha: "2024-08-15", tipo: "festivo", descripcio: "Assumpció de la Mare de Déu / Asunción" },
      { fecha: "2024-09-11", tipo: "festivo", descripcio: "Diada Nacional de Catalunya" },
      { fecha: "2024-10-12", tipo: "festivo", descripcio: "Festa Nacional d'Espanya" },
      { fecha: "2024-11-01", tipo: "festivo", descripcio: "Tots Sants / Todos los Santos" },
      { fecha: "2024-12-06", tipo: "festivo", descripcio: "Dia de la Constitució" },
      { fecha: "2024-12-08", tipo: "festivo", descripcio: "Immaculada Concepció" },
      { fecha: "2024-12-25", tipo: "festivo", descripcio: "Nadal / Navidad" },
      { fecha: "2024-12-26", tipo: "festivo", descripcio: "Sant Esteve" },
      // Festivos locals Sabadell 2024
      { fecha: "2024-05-10", tipo: "festivo", descripcio: "Festa local Sabadell - Ascensió" },
      { fecha: "2024-09-24", tipo: "festivo", descripcio: "Festa local Sabadell - La Mercè" },

      // 2025 festivos nacionales + Cataluña + Sabadell
      { fecha: "2025-01-01", tipo: "festivo", descripcio: "Cap d'Any / Año Nuevo" },
      { fecha: "2025-01-06", tipo: "festivo", descripcio: "Reis Mags / Epifanía del Señor" },
      { fecha: "2025-04-18", tipo: "festivo", descripcio: "Divendres Sant / Viernes Santo" },
      { fecha: "2025-04-21", tipo: "festivo", descripcio: "Dilluns de Pasqua / Lunes de Pascua" },
      { fecha: "2025-05-01", tipo: "festivo", descripcio: "Dia del Treball / Día del Trabajo" },
      { fecha: "2025-06-09", tipo: "festivo", descripcio: "Dilluns de Pasqua Granada (Cataluña)" },
      { fecha: "2025-06-24", tipo: "festivo", descripcio: "Sant Joan" },
      { fecha: "2025-08-15", tipo: "festivo", descripcio: "Assumpció de la Mare de Déu / Asunción" },
      { fecha: "2025-09-11", tipo: "festivo", descripcio: "Diada Nacional de Catalunya" },
      { fecha: "2025-10-12", tipo: "festivo", descripcio: "Festa Nacional d'Espanya" },
      { fecha: "2025-11-01", tipo: "festivo", descripcio: "Tots Sants / Todos los Santos" },
      { fecha: "2025-12-06", tipo: "festivo", descripcio: "Dia de la Constitució" },
      { fecha: "2025-12-08", tipo: "festivo", descripcio: "Immaculada Concepció" },
      { fecha: "2025-12-25", tipo: "festivo", descripcio: "Nadal / Navidad" },
      { fecha: "2025-12-26", tipo: "festivo", descripcio: "Sant Esteve" },
      // Festivos locals Sabadell 2025
      { fecha: "2025-05-29", tipo: "festivo", descripcio: "Festa local Sabadell - Ascensió" },
      { fecha: "2025-09-24", tipo: "festivo", descripcio: "Festa local Sabadell - La Mercè" },

      // 2026 festivos nacionales + Cataluña + Sabadell
      { fecha: "2026-01-01", tipo: "festivo", descripcio: "Cap d'Any / Año Nuevo" },
      { fecha: "2026-01-06", tipo: "festivo", descripcio: "Reis Mags / Epifanía del Señor" },
      { fecha: "2026-04-03", tipo: "festivo", descripcio: "Divendres Sant / Viernes Santo" },
      { fecha: "2026-04-06", tipo: "festivo", descripcio: "Dilluns de Pasqua / Lunes de Pascua" },
      { fecha: "2026-05-01", tipo: "festivo", descripcio: "Dia del Treball / Día del Trabajo" },
      { fecha: "2026-06-24", tipo: "festivo", descripcio: "Sant Joan" },
      { fecha: "2026-08-15", tipo: "festivo", descripcio: "Assumpció de la Mare de Déu / Asunción" },
      { fecha: "2026-09-11", tipo: "festivo", descripcio: "Diada Nacional de Catalunya" },
      { fecha: "2026-10-12", tipo: "festivo", descripcio: "Festa Nacional d'Espanya" },
      { fecha: "2026-11-01", tipo: "festivo", descripcio: "Tots Sants / Todos los Santos" },
      { fecha: "2026-12-06", tipo: "festivo", descripcio: "Dia de la Constitució" },
      { fecha: "2026-12-08", tipo: "festivo", descripcio: "Immaculada Concepció" },
      { fecha: "2026-12-25", tipo: "festivo", descripcio: "Nadal / Navidad" },
      { fecha: "2026-12-26", tipo: "festivo", descripcio: "Sant Esteve" },
      { fecha: "2026-09-24", tipo: "festivo", descripcio: "Festa local Sabadell - La Mercè" },
    ];

    const calCol = app.findCollectionByNameOrId("calendario_laboral");
    for (const h of holidays) {
      try {
        const existing = app.findRecordsByFilter("calendario_laboral", `fecha = "${h.fecha}"`);
        if (existing && existing.length > 0) continue;
      } catch (_) {}
      try {
        const rec = new Record(calCol);
        rec.set("fecha", h.fecha);
        rec.set("tipo", h.tipo);
        rec.set("descripcio", h.descripcio);
        rec.set("operaris_en_vacances", []);
        app.save(rec);
      } catch (e) {
        // skip duplicates
      }
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId("calendario_laboral");
      app.delete(col);
    } catch (_) {}
  },
);

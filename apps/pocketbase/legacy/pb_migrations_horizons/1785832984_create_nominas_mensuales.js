/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    let col;
    try { col = app.findCollectionByNameOrId("nominas_mensuales"); } catch (_) {
      col = new Collection({
        type: "base",
        name: "nominas_mensuales",
        listRule: "@request.auth.rol = 'superadmin'",
        viewRule: "@request.auth.rol = 'superadmin'",
        createRule: "@request.auth.rol = 'superadmin'",
        updateRule: "@request.auth.rol = 'superadmin'",
        deleteRule: "@request.auth.rol = 'superadmin'",
        fields: [
          { name: "mes", type: "number", required: true, min: 1, max: 12, onlyInt: true },
          { name: "any", type: "number", required: true, min: 2020, onlyInt: true },
          { name: "operaris", type: "json", maxSize: 500000 },
          { name: "salari_total", type: "number" },
          { name: "descomptes_totals", type: "number" },
          { name: "net_total", type: "number" },
          { name: "num_operaris", type: "number", onlyInt: true },
          { name: "notes", type: "text", max: 2000 },
          { name: "data_carga", type: "text", max: 40 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: ["CREATE UNIQUE INDEX idx_nom_mes_any ON nominas_mensuales (mes, any)"],
      });
      app.save(col);
    }
  },
  (app) => {
    try { app.delete(app.findCollectionByNameOrId("nominas_mensuales")); } catch (_) {}
  }
);

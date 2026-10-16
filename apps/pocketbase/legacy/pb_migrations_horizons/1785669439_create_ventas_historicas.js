/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // ventas_historicas
    let vh;
    try { vh = app.findCollectionByNameOrId("ventas_historicas"); } catch (_) {
      vh = new Collection({
        type: "base",
        name: "ventas_historicas",
        listRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        viewRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        createRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        updateRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        deleteRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        fields: [
          { name: "mes", type: "number", required: true, min: 1, max: 12, onlyInt: true },
          { name: "any", type: "number", required: true, min: 2020, onlyInt: true },
          { name: "exclusives_totals", type: "number", onlyInt: true },
          { name: "exclusives_per_article", type: "json", maxSize: 50000 },
          { name: "ingressos_totals", type: "number" },
          { name: "ingressos_per_article", type: "json", maxSize: 50000 },
          { name: "dies_laborals", type: "number", onlyInt: true },
          { name: "operaris_promig", type: "number" },
          { name: "hores_totals", type: "number" },
          { name: "notes", type: "text", max: 2000 },
          { name: "font", type: "select", maxSelect: 1, values: ["manual", "csv", "auto"] },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: ["CREATE UNIQUE INDEX idx_vh_mes_any ON ventas_historicas (mes, any)"],
      });
      app.save(vh);
    }
  },
  (app) => {
    try { app.delete(app.findCollectionByNameOrId("ventas_historicas")); } catch (_) {}
  }
);

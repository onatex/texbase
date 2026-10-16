/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 1. Add 'superadmin' to users.rol select values
    const users = app.findCollectionByNameOrId("users");
    const rolField = users.fields.getByName("rol");
    rolField.values = ["operari", "admin", "produccio", "qualitat", "superadmin"];
    app.save(users);

    // 2. Create costes_mensuales collection (costs + revenues combined per month)
    const existing = (() => {
      try { return app.findCollectionByNameOrId("costes_mensuales"); } catch (_) { return null; }
    })();
    if (!existing) {
      const costesColl = new Collection({
        type: "base",
        name: "costes_mensuales",
        listRule: "@request.auth.rol = 'superadmin'",
        viewRule: "@request.auth.rol = 'superadmin'",
        createRule: "@request.auth.rol = 'superadmin'",
        updateRule: "@request.auth.rol = 'superadmin'",
        deleteRule: "@request.auth.rol = 'superadmin'",
        fields: [
          { name: "mes", type: "number", required: true, min: 1, max: 12, onlyInt: true },
          { name: "any", type: "number", required: true, min: 2020, onlyInt: true },
          // Costes
          { name: "nomines", type: "number" },
          { name: "costos_operacionals", type: "number" },
          { name: "altres_costos", type: "number" },
          { name: "total_costos", type: "number" },
          { name: "notes_costos", type: "text", max: 2000 },
          { name: "pdf_nomines", type: "file", maxSelect: 1, maxSize: 52428800 },
          // Vendes
          { name: "ingressos_totals", type: "number" },
          { name: "ingressos_per_article", type: "json", maxSize: 100000 },
          { name: "exclusives_vendes", type: "json", maxSize: 500000 },
          { name: "notes_vendes", type: "text", max: 2000 },
          { name: "pdf_vendes", type: "file", maxSelect: 1, maxSize: 52428800 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      });
      app.save(costesColl);
    }

    // 3. Seed superadmin user
    try {
      app.findAuthRecordByEmail("users", "superadmin@monos.local");
    } catch (_) {
      const sa = new Record(users);
      sa.setEmail("superadmin@monos.local");
      sa.setPassword("SuperAdmin123!");
      sa.set("name", "Super Admin");
      sa.set("rol", "superadmin");
      app.save(sa);
    }
  },
  (app) => {
    try {
      const coll = app.findCollectionByNameOrId("costes_mensuales");
      app.delete(coll);
    } catch (_) {}
    try {
      const sa = app.findAuthRecordByEmail("users", "superadmin@monos.local");
      app.delete(sa);
    } catch (_) {}
  }
);

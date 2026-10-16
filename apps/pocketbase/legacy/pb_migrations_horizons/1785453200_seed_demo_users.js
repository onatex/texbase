/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    // Allow login by email OR operator code.
    users.passwordAuth = { enabled: true, identityFields: ["email", "codi"] };
    app.save(users);

    const demo = [
      {
        email: "admin@monos.local",
        codi: "ADMIN",
        name: "Dirección",
        rol: "admin",
        password: "Admin123!",
      },
      {
        email: "op001@monos.local",
        codi: "OP001",
        name: "Marta Puig",
        rol: "operari",
        password: "Op001123!",
      },
      {
        email: "produccio@monos.local",
        codi: "PROD01",
        name: "Jefe de producción",
        rol: "produccio",
        password: "Prod123!",
      },
      {
        email: "qualitat@monos.local",
        codi: "QUA01",
        name: "Responsable de calidad",
        rol: "qualitat",
        password: "Qual123!",
      },
    ];

    for (const d of demo) {
      let rec = null;
      try {
        rec = app.findAuthRecordByEmail("users", d.email);
      } catch (_) {
        rec = null;
      }
      if (!rec) {
        try {
          rec = app.findFirstRecordByData("users", "codi", d.codi);
        } catch (_) {
          rec = null;
        }
      }
      if (!rec) rec = new Record(users);

      rec.setEmail(d.email);
      rec.setPassword(d.password);
      rec.set("verified", true);
      rec.set("name", d.name);
      rec.set("rol", d.rol);
      rec.set("codi", d.codi);
      app.save(rec);
    }
  },
  (app) => {
    for (const email of [
      "op001@monos.local",
      "produccio@monos.local",
      "qualitat@monos.local",
    ]) {
      try {
        app.delete(app.findAuthRecordByEmail("users", email));
      } catch (_) {
        /* noop */
      }
    }
  },
);

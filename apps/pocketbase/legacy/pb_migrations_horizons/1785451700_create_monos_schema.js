/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // ---- users (auth) -------------------------------------------------
    const users = app.findCollectionByNameOrId("users");
    if (!users.fields.getByName("rol")) {
      users.fields.add(
        new SelectField({
          name: "rol",
          maxSelect: 1,
          values: ["operari", "admin"],
        }),
      );
    }
    if (!users.fields.getByName("codi")) {
      users.fields.add(new TextField({ name: "codi", max: 30 }));
    }
    users.passwordAuth = { enabled: true, identityFields: ["email", "codi"] };
    users.listRule = "@request.auth.id != ''";
    users.viewRule = "@request.auth.id != ''";
    users.createRule = "@request.auth.rol = 'admin'";
    users.updateRule = "@request.auth.id = id || @request.auth.rol = 'admin'";
    users.deleteRule = "@request.auth.rol = 'admin'";
    users.indexes = (users.indexes || []).filter(
      (i) => !i.includes("idx_users_codi"),
    );
    users.indexes.push(
      "CREATE UNIQUE INDEX idx_users_codi ON users (codi) WHERE codi != ''",
    );
    app.save(users);

    const AUTH = "@request.auth.id != ''";
    const ADMIN = "@request.auth.rol = 'admin'";

    // ---- rutes --------------------------------------------------------
    const rutes = new Collection({
      type: "base",
      name: "rutes",
      listRule: AUTH,
      viewRule: AUTH,
      createRule: ADMIN,
      updateRule: ADMIN,
      deleteRule: ADMIN,
      fields: [
        { name: "nom", type: "text", required: true, max: 120 },
        { name: "article", type: "text", max: 120 },
        { name: "per_defecte", type: "bool" },
        { name: "operacions", type: "json", maxSize: 200000 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(rutes);

    // ---- exclusives ---------------------------------------------------
    const exclusives = new Collection({
      type: "base",
      name: "exclusives",
      listRule: AUTH,
      viewRule: AUTH,
      createRule: AUTH,
      updateRule: AUTH,
      deleteRule: ADMIN,
      fields: [
        { name: "exclusiva", type: "text", required: true, max: 80 },
        { name: "article", type: "text", max: 120 },
        { name: "marca", type: "text", max: 120 },
        { name: "unitats", type: "number", onlyInt: true },
        { name: "data_prevista_recepcio", type: "text", max: 40 },
        { name: "data_real_recepcio", type: "text", max: 40 },
        { name: "data_entrega", type: "text", max: 40 },
        { name: "data_estimada", type: "text", max: 40 },
        { name: "express", type: "bool" },
        {
          name: "estat",
          type: "select",
          maxSelect: 1,
          values: ["pendent", "en_curs", "finalitzada", "bloquejada"],
        },
        {
          name: "ruta",
          type: "relation",
          maxSelect: 1,
          collectionId: rutes.id,
          cascadeDelete: false,
        },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_exclusives_codi ON exclusives (exclusiva)",
      ],
    });
    app.save(exclusives);

    // ---- monos --------------------------------------------------------
    const monos = new Collection({
      type: "base",
      name: "monos",
      listRule: AUTH,
      viewRule: AUTH,
      createRule: AUTH,
      updateRule: AUTH,
      deleteRule: ADMIN,
      fields: [
        {
          name: "exclusiva",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: exclusives.id,
          cascadeDelete: true,
        },
        { name: "numero", type: "number", onlyInt: true },
        { name: "codi", type: "text", max: 80 },
        {
          name: "estat",
          type: "select",
          maxSelect: 1,
          values: ["pendent", "en_curs", "finalitzat", "retreball"],
        },
        { name: "operacio_actual", type: "text", max: 120 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE INDEX idx_monos_exclusiva ON monos (exclusiva)"],
    });
    app.save(monos);

    // ---- registres ----------------------------------------------------
    const registres = new Collection({
      type: "base",
      name: "registres",
      listRule: AUTH,
      viewRule: AUTH,
      createRule: AUTH,
      updateRule: AUTH,
      deleteRule: ADMIN,
      fields: [
        {
          name: "mono",
          type: "relation",
          maxSelect: 1,
          collectionId: monos.id,
          cascadeDelete: true,
        },
        {
          name: "exclusiva",
          type: "relation",
          maxSelect: 1,
          collectionId: exclusives.id,
          cascadeDelete: true,
        },
        {
          name: "operari",
          type: "relation",
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: false,
        },
        { name: "operacio", type: "text", max: 120 },
        { name: "inici", type: "date" },
        { name: "fi", type: "date" },
        { name: "temps_real_seg", type: "number" },
        { name: "temps_pausa_seg", type: "number" },
        { name: "temps_estandard_seg", type: "number" },
        { name: "pauses", type: "json", maxSize: 200000 },
        { name: "incidencies", type: "json", maxSize: 200000 },
        { name: "retreball", type: "bool" },
        {
          name: "control_qualitat",
          type: "select",
          maxSelect: 1,
          values: ["ok", "ko", "pendent"],
        },
        { name: "notes", type: "text", max: 2000 },
        {
          name: "estat",
          type: "select",
          maxSelect: 1,
          values: ["en_curs", "pausat", "finalitzat"],
        },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE INDEX idx_registres_operari ON registres (operari)",
        "CREATE INDEX idx_registres_mono ON registres (mono)",
      ],
    });
    app.save(registres);

    // ---- seed ---------------------------------------------------------
    const ruta = new Record(rutes);
    ruta.set("nom", "Ruta estàndard mono");
    ruta.set("article", "GENERAL");
    ruta.set("per_defecte", true);
    ruta.set("operacions", [
      { nom: "Tall", temps_estandard_min: 12 },
      { nom: "Confecció", temps_estandard_min: 45 },
      { nom: "Control qualitat", temps_estandard_min: 8 },
      { nom: "Empaquetat", temps_estandard_min: 5 },
    ]);
    app.save(ruta);

    try {
      app.findAuthRecordByEmail("users", "admin@monos.local");
    } catch (_) {
      const admin = new Record(users);
      admin.setEmail("admin@monos.local");
      admin.setPassword("admin12345");
      admin.set("verified", true);
      admin.set("name", "Direcció");
      admin.set("rol", "admin");
      admin.set("codi", "ADMIN");
      app.save(admin);
    }

    const operaris = [
      ["OP01", "Marta Puig"],
      ["OP02", "Jordi Serra"],
      ["OP03", "Núria Camps"],
    ];
    operaris.forEach(([codi, nom]) => {
      const rec = new Record(users);
      rec.setEmail(codi.toLowerCase() + "@monos.local");
      rec.setPassword("1234abcd");
      rec.set("verified", true);
      rec.set("name", nom);
      rec.set("rol", "operari");
      rec.set("codi", codi);
      app.save(rec);
    });
  },
  (app) => {
    ["registres", "monos", "exclusives", "rutes"].forEach((n) => {
      try {
        app.delete(app.findCollectionByNameOrId(n));
      } catch (_) {
        /* noop */
      }
    });
  },
);

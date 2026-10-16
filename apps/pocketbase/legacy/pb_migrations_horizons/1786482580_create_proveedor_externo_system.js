/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const proveedores = app.findCollectionByNameOrId("proveedores");

    // 1. Add 'proveedor' to users rol select
    const rolField = users.fields.getByName("rol");
    if (!rolField.values.includes("proveedor")) {
      rolField.values = [
        "operari", "admin", "produccio", "qualitat",
        "superadmin", "externalitzacio", "proveedor",
      ];
      app.save(users);
    }

    // 2. Add proveedor_id relation to users (links a login to a proveedor record)
    if (!users.fields.getByName("proveedor_id")) {
      users.fields.add(
        new RelationField({
          name: "proveedor_id",
          maxSelect: 1,
          collectionId: proveedores.id,
        }),
      );
      app.save(users);
    }

    // 3. albaranes_proveedores
    let albaranes;
    try {
      albaranes = app.findCollectionByNameOrId("albaranes_proveedores");
    } catch (_) {
      albaranes = new Collection({
        type: "base",
        name: "albaranes_proveedores",
        listRule:
          "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.proveedor_id = proveedor_id)",
        viewRule:
          "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.proveedor_id = proveedor_id)",
        createRule: "@request.auth.id != ''",
        updateRule:
          "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.proveedor_id = proveedor_id",
        deleteRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        fields: [
          {
            name: "proveedor_id",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: proveedores.id,
            cascadeDelete: true,
          },
          { name: "numero_albaran", type: "text", required: true, max: 40 },
          { name: "periodo_mes", type: "number", onlyInt: true, required: true },
          { name: "periodo_any", type: "number", onlyInt: true, required: true },
          { name: "fecha_cierre", type: "date", required: true },
          { name: "exclusivas", type: "json", maxSize: 500000 },
          { name: "total_exclusivas", type: "number", onlyInt: true },
          { name: "total_unidades", type: "number", onlyInt: true },
          { name: "total_ingresos", type: "number" },
          { name: "firmado", type: "bool" },
          { name: "fecha_firma", type: "date" },
          {
            name: "firmado_por",
            type: "relation",
            maxSelect: 1,
            collectionId: users.id,
          },
          { name: "notas", type: "text", max: 2000 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_alb_proveedor ON albaranes_proveedores (proveedor_id)",
          "CREATE UNIQUE INDEX idx_alb_periodo ON albaranes_proveedores (proveedor_id, periodo_mes, periodo_any)",
        ],
      });
      app.save(albaranes);
    }

    // 4. eficiencia_operarios
    let eficiencia;
    try {
      eficiencia = app.findCollectionByNameOrId("eficiencia_operarios");
    } catch (_) {
      eficiencia = new Collection({
        type: "base",
        name: "eficiencia_operarios",
        listRule:
          "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.proveedor_id = proveedor_id)",
        viewRule:
          "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.proveedor_id = proveedor_id)",
        createRule: "@request.auth.id != ''",
        updateRule:
          "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.proveedor_id = proveedor_id",
        deleteRule:
          "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.proveedor_id = proveedor_id",
        fields: [
          {
            name: "proveedor_id",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: proveedores.id,
            cascadeDelete: true,
          },
          { name: "operario_nombre", type: "text", required: true, max: 120 },
          {
            name: "operario_id",
            type: "relation",
            maxSelect: 1,
            collectionId: users.id,
          },
          { name: "eficiencia", type: "number" },
          { name: "tipo_articulo", type: "text", max: 120 },
          { name: "tiempo_promedio", type: "number" },
          { name: "notas", type: "text", max: 1000 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_efi_proveedor ON eficiencia_operarios (proveedor_id)",
        ],
      });
      app.save(eficiencia);
    }

    // 5. forecast_proveedor
    let forecast;
    try {
      forecast = app.findCollectionByNameOrId("forecast_proveedor");
    } catch (_) {
      forecast = new Collection({
        type: "base",
        name: "forecast_proveedor",
        listRule:
          "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.proveedor_id = proveedor_id)",
        viewRule:
          "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.proveedor_id = proveedor_id)",
        createRule: "@request.auth.id != ''",
        updateRule:
          "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.proveedor_id = proveedor_id",
        deleteRule:
          "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.proveedor_id = proveedor_id",
        fields: [
          {
            name: "proveedor_id",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: proveedores.id,
            cascadeDelete: true,
          },
          { name: "operarios_seleccionados", type: "json", maxSize: 50000 },
          { name: "fecha_forecast", type: "date" },
          { name: "tiempo_total", type: "number" },
          { name: "tiempo_por_operario", type: "number" },
          { name: "fecha_estimada_finalizacion", type: "date" },
          { name: "numero_operarios", type: "number", onlyInt: true },
          { name: "jornada_horas", type: "number" },
          { name: "detalle_exclusivas", type: "json", maxSize: 200000 },
          { name: "notas", type: "text", max: 2000 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_fc_proveedor ON forecast_proveedor (proveedor_id)",
        ],
      });
      app.save(forecast);
    }

    // 6. Open up propuestas_mejora + respuestas_propuestas + no_conformitats
    //    so the proveedor role can read incidencias of their phase and reply.
    const propuestas = app.findCollectionByNameOrId("propuestas_mejora");
    propuestas.listRule =
      "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio' || @request.auth.rol = 'qualitat' || @request.auth.rol = 'proveedor')";
    propuestas.viewRule =
      "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio' || @request.auth.rol = 'qualitat' || @request.auth.rol = 'proveedor')";
    propuestas.updateRule =
      "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio' || @request.auth.rol = 'proveedor')";
    app.save(propuestas);

    const respuestas = app.findCollectionByNameOrId("respuestas_propuestas");
    respuestas.listRule =
      "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio' || @request.auth.rol = 'qualitat' || @request.auth.rol = 'proveedor')";
    respuestas.viewRule =
      "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio' || @request.auth.rol = 'qualitat' || @request.auth.rol = 'proveedor')";
    respuestas.createRule =
      "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio' || @request.auth.rol = 'proveedor')";
    respuestas.updateRule =
      "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio' || @request.auth.rol = 'proveedor')";
    app.save(respuestas);

    // 7. Seed a demo proveedor record + linked login
    let prov;
    try {
      prov = app.findFirstRecordByData("proveedores", "nombre", "Confecciones Demo S.L.");
    } catch (_) {
      prov = null;
    }
    if (!prov) {
      prov = new Record(proveedores);
      prov.set("nombre", "Confecciones Demo S.L.");
      prov.set("contacto", "Jordi Roca");
      prov.set("telefono", "+34 600 123 456");
      prov.set("email", "jordi@confeccionesdemo.com");
      prov.set("direccion", "Pol. Industrial, 12 · Terrassa");
      prov.set("activo", true);
      app.save(prov);
    }

    let provUser = null;
    try {
      provUser = app.findAuthRecordByEmail("users", "proveedor@monos.local");
    } catch (_) {
      provUser = null;
    }
    if (!provUser) {
      provUser = new Record(users);
      provUser.setEmail("proveedor@monos.local");
      provUser.setPassword("Prov123!");
      provUser.set("verified", true);
      provUser.set("name", "Confecciones Demo");
      provUser.set("rol", "proveedor");
      provUser.set("codi", "PROV01");
      provUser.set("proveedor_id", prov.id);
      app.save(provUser);
    }
  },
  (app) => {
    // down — remove seeded user + proveedor, drop new collections, revert rules
    try {
      app.delete(app.findAuthRecordByEmail("users", "proveedor@monos.local"));
    } catch (_) {}
    try {
      app.delete(app.findFirstRecordByData("proveedores", "nombre", "Confecciones Demo S.L."));
    } catch (_) {}
    for (const name of ["forecast_proveedor", "eficiencia_operarios", "albaranes_proveedores"]) {
      try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) {}
    }
    try {
      const users = app.findCollectionByNameOrId("users");
      if (users.fields.getByName("proveedor_id")) users.fields.removeByName("proveedor_id");
      const rolField = users.fields.getByName("rol");
      rolField.values = ["operari", "admin", "produccio", "qualitat", "superadmin", "externalitzacio"];
      app.save(users);
    } catch (_) {}
  },
);

/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const noConformitats = app.findCollectionByNameOrId("no_conformitats");

    // ── configuracion_forecast ──────────────────────────────────────────────
    let configForecast;
    try {
      configForecast = app.findCollectionByNameOrId("configuracion_forecast");
    } catch (_) {
      configForecast = new Collection({
        type: "base",
        name: "configuracion_forecast",
        listRule:
          "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio')",
        viewRule:
          "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio')",
        createRule:
          "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio')",
        updateRule:
          "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio')",
        deleteRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        fields: [
          { name: "numero_operarios", type: "number", onlyInt: true },
          { name: "jornada_horas", type: "number", onlyInt: true },
          { name: "numero_turnos", type: "number", onlyInt: true },
          { name: "fecha_actualizacion", type: "date" },
          {
            name: "usuario_id",
            type: "relation",
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          { name: "notas", type: "text", max: 500 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [],
      });
      app.save(configForecast);
    }

    // ── incidencias_ocultas ─────────────────────────────────────────────────
    let incidenciasOcultas;
    try {
      incidenciasOcultas = app.findCollectionByNameOrId("incidencias_ocultas");
    } catch (_) {
      incidenciasOcultas = new Collection({
        type: "base",
        name: "incidencias_ocultas",
        listRule:
          "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'qualitat')",
        viewRule:
          "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'qualitat')",
        createRule:
          "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'qualitat')",
        updateRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        deleteRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        fields: [
          {
            name: "incidencia_id",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: noConformitats.id,
            cascadeDelete: true,
          },
          {
            name: "oculta_para",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["operarios", "calidad", "todos"],
          },
          { name: "fecha_ocultacion", type: "date" },
          {
            name: "usuario_id",
            type: "relation",
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          { name: "motivo", type: "text", max: 1000 },
          { name: "activa", type: "bool" },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_inc_ocultas_incidencia ON incidencias_ocultas (incidencia_id)",
          "CREATE INDEX idx_inc_ocultas_activa ON incidencias_ocultas (activa)",
        ],
      });
      app.save(incidenciasOcultas);
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("configuracion_forecast"));
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
    }
    try {
      app.delete(app.findCollectionByNameOrId("incidencias_ocultas"));
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
    }
  },
);

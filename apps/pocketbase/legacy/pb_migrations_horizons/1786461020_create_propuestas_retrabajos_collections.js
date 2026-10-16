/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const exclusives = app.findCollectionByNameOrId("exclusives");
    const monos = app.findCollectionByNameOrId("monos");
    const noConformitats = app.findCollectionByNameOrId("no_conformitats");

    // ── 1. propuestas_mejora ──────────────────────────────────────────────
    let propuestas;
    try {
      propuestas = app.findCollectionByNameOrId("propuestas_mejora");
    } catch (_) {
      propuestas = new Collection({
        type: "base",
        name: "propuestas_mejora",
        listRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio' || @request.auth.rol = 'qualitat')",
        viewRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio' || @request.auth.rol = 'qualitat')",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio')",
        deleteRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        fields: [
          { name: "numero_exclusiva", type: "text", max: 80 },
          { name: "referencia_articulo", type: "text", max: 120 },
          { name: "descripcion", type: "text", max: 3000, required: true },
          {
            name: "tipo",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["propuesta_mejora", "accion_preventiva"],
          },
          {
            name: "estado",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["pendiente_respuesta", "respondida", "en_progreso", "implementada"],
          },
          {
            name: "exclusiva_id",
            type: "relation",
            maxSelect: 1,
            collectionId: exclusives.id,
            cascadeDelete: true,
          },
          {
            name: "mono_id",
            type: "relation",
            maxSelect: 1,
            collectionId: monos.id,
          },
          { name: "punt_checklist", type: "text", max: 200 },
          {
            name: "nc_id",
            type: "relation",
            maxSelect: 1,
            collectionId: noConformitats.id,
          },
          {
            name: "usuario_reporto",
            type: "relation",
            maxSelect: 1,
            collectionId: users.id,
          },
          { name: "fecha_reporte", type: "date" },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_propuestas_exclusiva ON propuestas_mejora (exclusiva_id)",
          "CREATE INDEX idx_propuestas_estado ON propuestas_mejora (estado)",
        ],
      });
      app.save(propuestas);
    }

    // ── 2. respuestas_propuestas ──────────────────────────────────────────
    let respuestas;
    try {
      respuestas = app.findCollectionByNameOrId("respuestas_propuestas");
    } catch (_) {
      respuestas = new Collection({
        type: "base",
        name: "respuestas_propuestas",
        listRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio' || @request.auth.rol = 'qualitat')",
        viewRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio' || @request.auth.rol = 'qualitat')",
        createRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio')",
        updateRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio')",
        deleteRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        fields: [
          {
            name: "propuesta_id",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: propuestas.id,
            cascadeDelete: true,
          },
          { name: "respuesta", type: "text", max: 3000, required: true },
          {
            name: "responsable_id",
            type: "relation",
            maxSelect: 1,
            collectionId: users.id,
          },
          { name: "fecha_estimada", type: "date" },
          {
            name: "estado",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["pendiente", "en_progreso", "implementada"],
          },
          { name: "fecha_respuesta", type: "date" },
          {
            name: "usuario_id",
            type: "relation",
            maxSelect: 1,
            collectionId: users.id,
          },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_resp_propuesta ON respuestas_propuestas (propuesta_id)",
        ],
      });
      app.save(respuestas);
    }

    // ── 3. tiempos_exclusiva ──────────────────────────────────────────────
    let tiempos;
    try {
      tiempos = app.findCollectionByNameOrId("tiempos_exclusiva");
    } catch (_) {
      tiempos = new Collection({
        type: "base",
        name: "tiempos_exclusiva",
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio')",
        deleteRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        fields: [
          {
            name: "exclusiva_id",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: exclusives.id,
            cascadeDelete: true,
          },
          {
            name: "tipo",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["operacion", "calidad", "retrabajo"],
          },
          { name: "tiempo_minutos", type: "number" },
          { name: "tiempo_segundos", type: "number" },
          { name: "descripcion", type: "text", max: 500 },
          {
            name: "usuario_id",
            type: "relation",
            maxSelect: 1,
            collectionId: users.id,
          },
          { name: "fecha", type: "date" },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_tiempos_exclusiva ON tiempos_exclusiva (exclusiva_id)",
          "CREATE INDEX idx_tiempos_tipo ON tiempos_exclusiva (tipo)",
        ],
      });
      app.save(tiempos);
    }

    // ── 4. Add notification tipus values ──────────────────────────────────
    const notifs = app.findCollectionByNameOrId("notifications");
    const tipusField = notifs.fields.getByName("tipus");
    if (tipusField) {
      const vals = tipusField.values || [];
      const toAdd = ["propuesta_mejora", "retrabajo_creado"];
      let changed = false;
      for (const v of toAdd) {
        if (!vals.includes(v)) { vals.push(v); changed = true; }
      }
      if (changed) {
        tipusField.values = vals;
        app.save(notifs);
      }
    }
  },
  (app) => {
    // down — best effort
    try { app.delete(app.findCollectionByNameOrId("respuestas_propuestas")); } catch {}
    try { app.delete(app.findCollectionByNameOrId("propuestas_mejora")); } catch {}
    try { app.delete(app.findCollectionByNameOrId("tiempos_exclusiva")); } catch {}
  },
);

/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const exclusives = app.findCollectionByNameOrId("exclusives");
    const monos = app.findCollectionByNameOrId("monos");

    // ── 1. operaciones_libres ──────────────────────────────────────────────
    let opLibres;
    try {
      opLibres = app.findCollectionByNameOrId("operaciones_libres");
    } catch (_) {
      opLibres = new Collection({
        type: "base",
        name: "operaciones_libres",
        listRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio' || @request.auth.rol = 'qualitat' || @request.auth.id = operario)",
        viewRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio' || @request.auth.rol = 'qualitat' || @request.auth.id = operario)",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.id = operario)",
        deleteRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        fields: [
          { name: "exclusiva", type: "relation", required: true, maxSelect: 1, collectionId: exclusives.id, cascadeDelete: true },
          { name: "mono", type: "relation", maxSelect: 1, collectionId: monos.id },
          { name: "operario", type: "relation", required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
          { name: "descripcion", type: "text", max: 500 },
          { name: "tiempo_seg", type: "number" },
          { name: "fecha_inicio", type: "date" },
          { name: "fecha_fin", type: "date" },
          { name: "incidencias", type: "json", maxSize: 200000 },
          { name: "control_qualitat", type: "select", maxSelect: 1, values: ["ok", "ko", "pendent"] },
          { name: "notes", type: "text", max: 2000 },
          {
            name: "fotos", type: "file", maxSelect: 10, maxSize: 10485760,
            mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic"],
          },
          {
            name: "videos", type: "file", maxSelect: 5, maxSize: 104857600,
            mimeTypes: ["video/mp4", "video/webm", "video/ogg", "video/quicktime"],
          },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      });
      app.save(opLibres);
    }

    // ── 2. tiempos_exclusiva ───────────────────────────────────────────────
    let tempsEx;
    try {
      tempsEx = app.findCollectionByNameOrId("tiempos_exclusiva");
    } catch (_) {
      tempsEx = new Collection({
        type: "base",
        name: "tiempos_exclusiva",
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.id = operario)",
        deleteRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        fields: [
          { name: "exclusiva", type: "relation", required: true, maxSelect: 1, collectionId: exclusives.id, cascadeDelete: true },
          { name: "mono", type: "relation", maxSelect: 1, collectionId: monos.id },
          { name: "operario", type: "relation", maxSelect: 1, collectionId: users.id },
          { name: "operacion_id", type: "text", max: 60 },
          { name: "operacion_nom", type: "text", max: 200 },
          { name: "tiempo_seg", type: "number" },
          { name: "fecha_inicio", type: "date" },
          { name: "fecha_fin", type: "date" },
          { name: "tipo", type: "select", required: true, maxSelect: 1, values: ["operacion", "calidad", "retrabajo", "libre"] },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_tiempos_exclusiva ON tiempos_exclusiva (exclusiva)",
          "CREATE INDEX idx_tiempos_tipo ON tiempos_exclusiva (tipo)",
        ],
      });
      app.save(tempsEx);
    }

    // ── 3. mensajes_exclusiva ──────────────────────────────────────────────
    let miss;
    try {
      miss = app.findCollectionByNameOrId("mensajes_exclusiva");
    } catch (_) {
      miss = new Collection({
        type: "base",
        name: "mensajes_exclusiva",
        listRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio' || @request.auth.id = remitente || @request.auth.id = destinatario)",
        viewRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio' || @request.auth.id = remitente || @request.auth.id = destinatario)",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.id = destinatario)",
        deleteRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        fields: [
          { name: "exclusiva", type: "relation", required: true, maxSelect: 1, collectionId: exclusives.id, cascadeDelete: true },
          { name: "remitente", type: "relation", required: true, maxSelect: 1, collectionId: users.id },
          { name: "destinatario", type: "relation", maxSelect: 1, collectionId: users.id },
          { name: "tipo_destinatario", type: "select", required: true, maxSelect: 1, values: ["operacion", "calidad", "todos"] },
          { name: "operacion_ref", type: "text", max: 200 },
          { name: "mensaje", type: "text", required: true, max: 2000 },
          { name: "prioridad", type: "select", maxSelect: 1, values: ["normal", "urgente"] },
          { name: "leido", type: "bool" },
          { name: "fecha_envio", type: "date" },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_mensajes_exclusiva ON mensajes_exclusiva (exclusiva)",
          "CREATE INDEX idx_mensajes_destinatario ON mensajes_exclusiva (destinatario)",
        ],
      });
      app.save(miss);
    }

    // ── 4. Extend notifications.tipus with 'mensaje_exclusiva' ─────────────
    try {
      const notif = app.findCollectionByNameOrId("notifications");
      const tipusField = notif.fields.getByName("tipus");
      if (tipusField && Array.isArray(tipusField.values)) {
        if (!tipusField.values.includes("mensaje_exclusiva")) {
          tipusField.values = [...tipusField.values, "mensaje_exclusiva"];
        }
      }
      app.save(notif);
    } catch (e) {
      console.log("notifications tipus extend skipped:", String(e));
    }

    // ── 5. Add cliente field to exclusives + extend prioritat ──────────────
    try {
      if (!exclusives.fields.getByName("cliente")) {
        exclusives.fields.add(new TextField({ name: "cliente", max: 200 }));
      }
      const prioField = exclusives.fields.getByName("prioritat");
      if (prioField && Array.isArray(prioField.values)) {
        const desired = ["normal", "alta", "express", "baja", "media", "urgente"];
        const merged = Array.from(new Set([...prioField.values, ...desired]));
        prioField.values = merged;
      }
      app.save(exclusives);
    } catch (e) {
      console.log("exclusives extend skipped:", String(e));
    }
  },
  (app) => {
    for (const name of ["operaciones_libres", "tiempos_exclusiva", "mensajes_exclusiva"]) {
      try {
        const c = app.findCollectionByNameOrId(name);
        app.delete(c);
      } catch (_) {}
    }
    try {
      const ex = app.findCollectionByNameOrId("exclusives");
      if (ex.fields.getByName("cliente")) ex.fields.removeByName("cliente");
      app.save(ex);
    } catch (_) {}
  },
);

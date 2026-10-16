/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const exclusives = app.findCollectionByNameOrId("exclusives");
    const articles = app.findCollectionByNameOrId("articles");

    // ── 1. Add fields to control_calidad ─────────────────────────────────
    const cc = app.findCollectionByNameOrId("control_calidad");
    if (!cc.fields.getByName("puntos_revisados")) {
      cc.fields.add(
        new JSONField({ name: "puntos_revisados", maxSize: 200000 }),
      );
    }
    if (!cc.fields.getByName("tiempo_revision_seg")) {
      cc.fields.add(new NumberField({ name: "tiempo_revision_seg" }));
    }
    app.save(cc);

    // ── 2. checklist_calidad ─────────────────────────────────────────────
    let checklist;
    try {
      checklist = app.findCollectionByNameOrId("checklist_calidad");
    } catch (_) {
      checklist = new Collection({
        type: "base",
        name: "checklist_calidad",
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule:
          "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'qualitat'",
        updateRule:
          "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        deleteRule:
          "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        fields: [
          {
            name: "articulo_id",
            type: "relation",
            maxSelect: 1,
            collectionId: articles.id,
          },
          { name: "punto_numero", type: "number", onlyInt: true },
          { name: "descripcion", type: "text", required: true, max: 300 },
          { name: "obligatorio", type: "bool" },
          {
            name: "created",
            type: "autodate",
            onCreate: true,
            onUpdate: false,
          },
          {
            name: "updated",
            type: "autodate",
            onCreate: true,
            onUpdate: true,
          },
        ],
        indexes: [
          "CREATE INDEX idx_checklist_calidad_art ON checklist_calidad (articulo_id)",
        ],
      });
      app.save(checklist);
    }

    // ── 3. historial_calidad ─────────────────────────────────────────────
    let hist;
    try {
      hist = app.findCollectionByNameOrId("historial_calidad");
    } catch (_) {
      hist = new Collection({
        type: "base",
        name: "historial_calidad",
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule:
          "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        deleteRule:
          "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
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
            name: "unidad_numero",
            type: "number",
            onlyInt: true,
            required: true,
          },
          { name: "puntos_revisados", type: "json", maxSize: 200000 },
          { name: "puntos_fallidos", type: "json", maxSize: 200000 },
          { name: "observaciones", type: "text", max: 2000 },
          { name: "tiempo_revision", type: "number" },
          {
            name: "usuario_id",
            type: "relation",
            maxSelect: 1,
            collectionId: users.id,
          },
          { name: "fecha", type: "date" },
          {
            name: "created",
            type: "autodate",
            onCreate: true,
            onUpdate: false,
          },
          {
            name: "updated",
            type: "autodate",
            onCreate: true,
            onUpdate: true,
          },
        ],
        indexes: [
          "CREATE INDEX idx_hist_calidad_ex ON historial_calidad (exclusiva_id)",
        ],
      });
      app.save(hist);
    }
  },
  (app) => {
    // Remove added fields from control_calidad
    try {
      const cc = app.findCollectionByNameOrId("control_calidad");
      if (cc.fields.getByName("puntos_revisados")) {
        cc.fields.removeByName("puntos_revisados");
      }
      if (cc.fields.getByName("tiempo_revision_seg")) {
        cc.fields.removeByName("tiempo_revision_seg");
      }
      app.save(cc);
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
    }
    try {
      app.delete(app.findCollectionByNameOrId("historial_calidad"));
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
    }
    try {
      app.delete(app.findCollectionByNameOrId("checklist_calidad"));
    } catch (e) {
      if (!e.message.includes("no rows in result set")) throw e;
    }
  },
);

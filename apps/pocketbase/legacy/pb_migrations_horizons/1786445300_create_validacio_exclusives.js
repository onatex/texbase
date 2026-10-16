/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    // ── 1. Add validation fields to exclusives ──────────────────────────────
    const exclusives = app.findCollectionByNameOrId("exclusives");

    if (!exclusives.fields.getByName("estado_validacion")) {
      exclusives.fields.add(
        new SelectField({
          name: "estado_validacion",
          maxSelect: 1,
          values: ["no_validado", "validado", "rechazado"],
        }),
      );
    }
    if (!exclusives.fields.getByName("fecha_validacion")) {
      exclusives.fields.add(new DateField({ name: "fecha_validacion" }));
    }
    if (!exclusives.fields.getByName("usuario_validacion")) {
      exclusives.fields.add(
        new RelationField({
          name: "usuario_validacion",
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: false,
        }),
      );
    }
    if (!exclusives.fields.getByName("motivo_rechazo")) {
      exclusives.fields.add(new TextField({ name: "motivo_rechazo", max: 1000 }));
    }
    app.save(exclusives);

    // ── 2. Create validaciones_exclusivas collection ────────────────────────
    let valCol;
    try {
      valCol = app.findCollectionByNameOrId("validaciones_exclusivas");
    } catch (_) {
      valCol = new Collection({
        type: "base",
        name: "validaciones_exclusivas",
        listRule:
          "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio' || @request.auth.rol = 'qualitat')",
        viewRule:
          "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio' || @request.auth.rol = 'qualitat')",
        createRule:
          "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio')",
        updateRule:
          "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        deleteRule:
          "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        fields: [
          {
            name: "exclusiva",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: exclusives.id,
            cascadeDelete: true,
          },
          {
            name: "estado",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["validado", "rechazado"],
          },
          { name: "fecha_validacion", type: "date" },
          {
            name: "usuario",
            type: "relation",
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: false,
          },
          { name: "motivo", type: "text", max: 1000 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
      });
      app.save(valCol);
    }

    // ── 3. Extend notifications.tipus with validation types ─────────────────
    try {
      const notif = app.findCollectionByNameOrId("notifications");
      const tipusField = notif.fields.getByName("tipus");
      if (tipusField && Array.isArray(tipusField.values)) {
        const merged = [...tipusField.values];
        for (const v of ["exclusiva_rechazada", "exclusiva_validada"]) {
          if (!merged.includes(v)) merged.push(v);
        }
        tipusField.values = merged;
        app.save(notif);
      }
    } catch (_) {
      /* notifications may not exist; skip */
    }

    // ── 4. Backfill existing exclusivas to 'validado' so in-progress work is not blocked ──
    try {
      const existing = app.findRecordsByFilter(
        "exclusives",
        "estado_validacion = ''",
        "",
        1000,
      );
      for (const rec of existing) {
        rec.set("estado_validacion", "validado");
        app.save(rec);
      }
    } catch (_) {
      /* ignore backfill errors */
    }
  },
  (app) => {
    // Revert: remove fields, drop collection, remove notification types
    try {
      const exclusives = app.findCollectionByNameOrId("exclusives");
      for (const fname of [
        "estado_validacion",
        "fecha_validacion",
        "usuario_validacion",
        "motivo_rechazo",
      ]) {
        try {
          exclusives.fields.removeByName(fname);
        } catch (_) {}
      }
      app.save(exclusives);
    } catch (_) {}

    try {
      const valCol = app.findCollectionByNameOrId("validaciones_exclusivas");
      app.delete(valCol);
    } catch (_) {}

    try {
      const notif = app.findCollectionByNameOrId("notifications");
      const tipusField = notif.fields.getByName("tipus");
      if (tipusField && Array.isArray(tipusField.values)) {
        tipusField.values = tipusField.values.filter(
          (v) => v !== "exclusiva_rechazada" && v !== "exclusiva_validada",
        );
        app.save(notif);
      }
    } catch (_) {}
  },
);

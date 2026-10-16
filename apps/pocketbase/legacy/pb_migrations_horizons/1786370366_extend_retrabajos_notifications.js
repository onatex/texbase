/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // ── Extend retrabajos with media + assignment date fields ──
    const retrabajos = app.findCollectionByNameOrId("retrabajos");

    retrabajos.fields.add(
      new FileField({
        name: "fotos_antes",
        maxSelect: 10,
        maxSize: 10485760,
        mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic"],
      }),
    );
    retrabajos.fields.add(
      new FileField({
        name: "fotos_despues",
        maxSelect: 10,
        maxSize: 10485760,
        mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic"],
      }),
    );
    retrabajos.fields.add(
      new FileField({
        name: "videos",
        maxSelect: 5,
        maxSize: 104857600,
        mimeTypes: ["video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/x-msvideo"],
      }),
    );
    retrabajos.fields.add(
      new DateField({ name: "fecha_asignacion" }),
    );

    app.save(retrabajos);

    // ── Create notifications collection ──
    const users = app.findCollectionByNameOrId("users");

    let notif;
    try {
      notif = app.findCollectionByNameOrId("notifications");
    } catch (_) {
      notif = new Collection({
        type: "base",
        name: "notifications",
        listRule: "@request.auth.id != '' && @request.auth.id = destinatari",
        viewRule: "@request.auth.id != '' && @request.auth.id = destinatari",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != '' && @request.auth.id = destinatari",
        deleteRule: "@request.auth.id != '' && @request.auth.id = destinatari",
        fields: [
          {
            name: "destinatari",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          {
            name: "tipus",
            type: "select",
            maxSelect: 1,
            values: ["retrabajo_asignado", "retrabajo_completado", "retrabajo_rechazado", "retrabajo_verificado"],
          },
          { name: "titol", type: "text", max: 200 },
          { name: "missatge", type: "text", max: 1000 },
          { name: "link_id", type: "text", max: 60 },
          { name: "llegida", type: "bool" },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_notif_destinatari ON notifications (destinatari)",
          "CREATE INDEX idx_notif_llegida ON notifications (llegida)",
        ],
      });
      app.save(notif);
    }
  },
  (app) => {
    try {
      const retrabajos = app.findCollectionByNameOrId("retrabajos");
      ["fotos_antes", "fotos_despues", "videos", "fecha_asignacion"].forEach((n) => {
        try { retrabajos.fields.removeByName(n); } catch (_) {}
      });
      app.save(retrabajos);
    } catch (_) {}

    try {
      const notif = app.findCollectionByNameOrId("notifications");
      app.delete(notif);
    } catch (_) {}
  },
);

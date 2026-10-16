/// <reference path="../pb_data/types.d.ts" />

// ─────────────────────────────────────────────────────────────────────────────
// Chat interno Calidad ↔ Super Admin.
//
// Permite que los usuarios con rol `qualitat` reporten incidencias directamente
// a `superadmin` y que este responda en el mismo hilo. Las conversaciones SOLO
// son visibles para `qualitat` y `superadmin` (ningún otro rol puede leerlas).
//
// Colecciones:
//   - chat_calidad          → mensajes del hilo (autor, rol, texto, fecha)
//   - chat_calidad_lectura  → puntero "último leído" por usuario (no leídos)
// ─────────────────────────────────────────────────────────────────────────────
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    const accessRule =
      "@request.auth.rol = 'qualitat' || @request.auth.rol = 'superadmin'";

    // ── 1. chat_calidad ──────────────────────────────────────────────────
    let chat;
    try {
      chat = app.findCollectionByNameOrId("chat_calidad");
    } catch (_) {
      chat = new Collection({
        type: "base",
        name: "chat_calidad",
        listRule: accessRule,
        viewRule: accessRule,
        createRule: accessRule,
        // Solo superadmin puede editar/borrar mensajes (moderación).
        updateRule: "@request.auth.rol = 'superadmin'",
        deleteRule: "@request.auth.rol = 'superadmin'",
        fields: [
          {
            name: "autor",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          {
            name: "autor_rol",
            type: "select",
            required: true,
            maxSelect: 1,
            values: ["qualitat", "superadmin"],
          },
          { name: "missatge", type: "text", required: true, max: 5000 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: ["CREATE INDEX idx_chat_calidad_created ON chat_calidad (created)"],
      });
      app.save(chat);
    }

    // ── 2. chat_calidad_lectura ──────────────────────────────────────────
    let lect;
    try {
      lect = app.findCollectionByNameOrId("chat_calidad_lectura");
    } catch (_) {
      lect = new Collection({
        type: "base",
        name: "chat_calidad_lectura",
        listRule: accessRule,
        viewRule: accessRule,
        // Cada usuario crea su propio puntero (usuari = sí mismo).
        createRule:
          accessRule + " && @request.auth.id = @request.body.usuari",
        // Solo el propio usuario actualiza su puntero.
        updateRule:
          accessRule + " && @request.auth.id = usuari",
        deleteRule: "@request.auth.rol = 'superadmin'",
        fields: [
          {
            name: "usuari",
            type: "relation",
            required: true,
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: true,
          },
          { name: "ultim_llegit", type: "date" },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE UNIQUE INDEX idx_chat_calidad_lectura_usuari ON chat_calidad_lectura (usuari)",
        ],
      });
      app.save(lect);
    }
  },
  (app) => {
    for (const name of ["chat_calidad_lectura", "chat_calidad"]) {
      try {
        app.delete(app.findCollectionByNameOrId(name));
      } catch (_) {}
    }
  },
);

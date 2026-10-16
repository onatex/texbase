/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const collection = new Collection({
      type: "base",
      name: "registro_horario",
      listRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.id = operari)",
      viewRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.id = operari)",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.id = operari)",
      deleteRule: "@request.auth.rol = 'admin'",
      fields: [
        {
          name: "operari",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: true,
        },
        { name: "fecha", type: "text", max: 12 },
        { name: "hora_entrada", type: "text", max: 30 },
        { name: "hora_salida", type: "text", max: 30 },
        { name: "duracion_jornada_min", type: "number" },
        { name: "tiempo_productivo_min", type: "number" },
        { name: "tiempo_improductivo_min", type: "number" },
        { name: "numero_exclusivas_completadas", type: "number" },
        { name: "numero_operaciones_completadas", type: "number" },
        { name: "numero_reoperaciones", type: "number" },
        { name: "numero_incidencias_abiertas", type: "number" },
        { name: "incidencias_horario", type: "json" },
        {
          name: "estado",
          type: "select",
          maxSelect: 1,
          values: ["completo", "incompleto", "con_problemas"],
        },
        { name: "notas_admin", type: "text", max: 2000 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(collection);
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId("registro_horario");
      app.delete(col);
    } catch (_) {}
  },
);

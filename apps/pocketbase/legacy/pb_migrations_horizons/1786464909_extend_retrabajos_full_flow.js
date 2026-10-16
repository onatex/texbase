/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const retrabajos = app.findCollectionByNameOrId("retrabajos");

    // 1. Add "aprobado" to estado select values
    const estadoField = retrabajos.fields.getByName("estado");
    if (estadoField && Array.isArray(estadoField.values)) {
      const vals = estadoField.values.slice();
      if (!vals.includes("aprobado")) vals.push("aprobado");
      estadoField.values = vals;
    }

    // 2. fase_retrabajo — fase/operación concreta a retrabajar (OP-001, etc.)
    if (!retrabajos.fields.getByName("fase_retrabajo")) {
      retrabajos.fields.add(
        new TextField({
          name: "fase_retrabajo",
          max: 200,
        }),
      );
    }

    // 3. tiempo_real_seg — tiempo real empleado en el retrabajo (lo mide producción)
    if (!retrabajos.fields.getByName("tiempo_real_seg")) {
      retrabajos.fields.add(
        new NumberField({
          name: "tiempo_real_seg",
        }),
      );
    }

    // 4. fecha_inicio — cuando producción inicia el retrabajo
    if (!retrabajos.fields.getByName("fecha_inicio")) {
      retrabajos.fields.add(
        new DateField({
          name: "fecha_inicio",
        }),
      );
    }

    // 5. usuario_inicio — operario de producción que inicia
    if (!retrabajos.fields.getByName("usuario_inicio")) {
      retrabajos.fields.add(
        new RelationField({
          name: "usuario_inicio",
          maxSelect: 1,
          minSelect: 0,
          collectionId: users.id,
          cascadeDelete: false,
        }),
      );
    }

    // 6. usuario_completado — operario de producción que completa
    if (!retrabajos.fields.getByName("usuario_completado")) {
      retrabajos.fields.add(
        new RelationField({
          name: "usuario_completado",
          maxSelect: 1,
          minSelect: 0,
          collectionId: users.id,
          cascadeDelete: false,
        }),
      );
    }

    // 7. fecha_aprobacion — cuando calidad aprueba el retrabajo
    if (!retrabajos.fields.getByName("fecha_aprobacion")) {
      retrabajos.fields.add(
        new DateField({
          name: "fecha_aprobacion",
        }),
      );
    }

    // 8. usuario_aprobacion — operario de calidad que aprueba
    if (!retrabajos.fields.getByName("usuario_aprobacion")) {
      retrabajos.fields.add(
        new RelationField({
          name: "usuario_aprobacion",
          maxSelect: 1,
          minSelect: 0,
          collectionId: users.id,
          cascadeDelete: false,
        }),
      );
    }

    app.save(retrabajos);
  },
  (app) => {
    try {
      const retrabajos = app.findCollectionByNameOrId("retrabajos");

      const estadoField = retrabajos.fields.getByName("estado");
      if (estadoField && Array.isArray(estadoField.values)) {
        estadoField.values = estadoField.values.filter((v) => v !== "aprobado");
      }

      ["fase_retrabajo", "tiempo_real_seg", "fecha_inicio", "usuario_inicio", "usuario_completado", "fecha_aprobacion", "usuario_aprobacion"].forEach((n) => {
        try { retrabajos.fields.removeByName(n); } catch (_) {}
      });

      app.save(retrabajos);
    } catch (e) {
      if (e.message.includes("no rows in result set")) {
        console.log("Collection not found, skipping revert");
        return;
      }
      throw e;
    }
  },
);

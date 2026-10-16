/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("fases_externalizadas_exclusiva");

    // estado_fase: delivery status of the externalized phase
    if (!collection.fields.getByName("estado_fase")) {
      collection.fields.add(
        new SelectField({
          name: "estado_fase",
          maxSelect: 1,
          values: ["en_progreso", "listo_para_entregar", "entregado"],
        }),
      );
    }

    // fecha_listo_entregar: when the phase was marked ready to deliver
    if (!collection.fields.getByName("fecha_listo_entregar")) {
      collection.fields.add(
        new DateField({ name: "fecha_listo_entregar" }),
      );
    }

    // fecha_entregado: when the phase was actually delivered
    if (!collection.fields.getByName("fecha_entregado")) {
      collection.fields.add(
        new DateField({ name: "fecha_entregado" }),
      );
    }

    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("fases_externalizadas_exclusiva");
    collection.fields.removeByName("estado_fase");
    collection.fields.removeByName("fecha_listo_entregar");
    collection.fields.removeByName("fecha_entregado");
    app.save(collection);
  },
);

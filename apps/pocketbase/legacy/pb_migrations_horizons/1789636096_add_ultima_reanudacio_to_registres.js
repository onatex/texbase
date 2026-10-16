/// <reference path="../pb_data/types.d.ts" />

// Añade `ultima_reanudacio` (date) a `registres` para poder calcular el tiempo
// productivo en vivo sin contar los intervalos pausados:
//   - en_curs: productivo = temps_real_seg + (now - ultima_reanudacio)
//   - pausat : productivo = temps_real_seg (congelado, el tiempo de parada no
//              se cuenta como productivo).
// También añade `tiempo_parada_min` (number) a `registro_horario` para registrar
// el tiempo de parada acumulado (con su causa) en el registro horario.

migrate(
  (app) => {
    const registres = app.findCollectionByNameOrId("registres");
    registres.fields.add(
      new DateField({
        name: "ultima_reanudacio",
        required: false,
      }),
    );
    app.save(registres);

    const rh = app.findCollectionByNameOrId("registro_horario");
    rh.fields.add(
      new NumberField({
        name: "tiempo_parada_min",
        required: false,
        onlyInt: true,
      }),
    );
    app.save(rh);
  },
  (app) => {
    const registres = app.findCollectionByNameOrId("registres");
    registres.fields.removeByName("ultima_reanudacio");
    app.save(registres);

    const rh = app.findCollectionByNameOrId("registro_horario");
    rh.fields.removeByName("tiempo_parada_min");
    app.save(rh);
  },
);

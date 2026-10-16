/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const rutes = app.findCollectionByNameOrId("rutes");
    const opsDef = app.findCollectionByNameOrId("operacions_def");

    const ops = [
      // FASE 1
      { codi:"R84054-001", nom:"Pegar refuerzos de espalda con doble pegajoso y doble pespada", fase:"Fase 1", fase_ordre:1, ordre:1,  temps_std_min:4.0, maquina:"Puntada recta" },
      { codi:"R84054-002", nom:"Marcar las vías con pintura",                                    fase:"Fase 1", fase_ordre:1, ordre:2,  temps_std_min:2.0, maquina:"Plantilla / manual" },
      { codi:"R84054-003", nom:"Unir hombros y laterales del tejido principal",                  fase:"Fase 1", fase_ordre:1, ordre:3,  temps_std_min:3.0, maquina:"Puntada recta" },
      { codi:"R84054-004", nom:"Encajar forro y tejido de las partes en puntada recta",          fase:"Fase 1", fase_ordre:1, ordre:4,  temps_std_min:6.0, maquina:"Puntada recta" },
      { codi:"R84054-005", nom:"Marcar y bajar el cuello del tejido para sujetar el forro",      fase:"Fase 1", fase_ordre:1, ordre:5,  temps_std_min:5.0, maquina:"Overlock 5 hilos" },
      { codi:"R84054-006", nom:"Unir el ala trasero",                                            fase:"Fase 1", fase_ordre:1, ordre:6,  temps_std_min:5.0, maquina:"Puntada recta" },
      { codi:"R84054-007", nom:"Hacer doble pegajoso en el ala trasero",                         fase:"Fase 1", fase_ordre:1, ordre:7,  temps_std_min:1.0, maquina:"Puntada recta" },
      { codi:"R84054-008", nom:"Unir las costuras de las vías",                                  fase:"Fase 1", fase_ordre:1, ordre:8,  temps_std_min:4.0, maquina:"Overlock 4 hilos" },
      { codi:"R84054-009", nom:"Encajar las vías y pegar overlock al contorno",                  fase:"Fase 1", fase_ordre:1, ordre:9,  temps_std_min:2.0, maquina:"Overlock 3 hilos" },
      { codi:"R84054-010", nom:"Fijar el otro extremo de la vía",                                fase:"Fase 1", fase_ordre:1, ordre:10, temps_std_min:2.0, maquina:"Puntada recta" },
      { codi:"R84054-011", nom:"Pegar velcro hembra del contorno",                               fase:"Fase 1", fase_ordre:1, ordre:11, temps_std_min:1.0, maquina:"Puntada recta" },
      { codi:"R84054-012", nom:"Cerrar las costuras por el revés",                               fase:"Fase 1", fase_ordre:1, ordre:12, temps_std_min:2.0, maquina:"Puntada recta" },
      { codi:"R84054-013", nom:"Resortar y pegar las costuras",                                  fase:"Fase 1", fase_ordre:1, ordre:13, temps_std_min:4.0, maquina:"Manual" },
      { codi:"R84054-014", nom:"Hacer doble pegajoso de las costuras",                           fase:"Fase 1", fase_ordre:1, ordre:14, temps_std_min:3.0, maquina:"Puntada recta" },
      { codi:"R84054-015", nom:"Pegar los velcros macho",                                        fase:"Fase 1", fase_ordre:1, ordre:15, temps_std_min:1.0, maquina:"Puntada recta" },
      { codi:"R84054-016", nom:"Cerrar puerta de la pierna y costureador",                       fase:"Fase 1", fase_ordre:1, ordre:16, temps_std_min:1.0, maquina:"Overlock 3 hilos" },
      { codi:"R84054-017", nom:"Pegar las etiquetas de la pierna",                               fase:"Fase 1", fase_ordre:1, ordre:17, temps_std_min:3.0, maquina:"Puntada recta" },
      { codi:"R84054-018", nom:"Pegar velcro hembra de cuello",                                  fase:"Fase 1", fase_ordre:1, ordre:18, temps_std_min:1.0, maquina:"Puntada recta" },
      { codi:"R84054-019", nom:"Cerrar el cuello por el revés",                                  fase:"Fase 1", fase_ordre:1, ordre:19, temps_std_min:2.0, maquina:"Puntada recta" },
      { codi:"R84054-020", nom:"Encajar y pegar tierra de mangas",                               fase:"Fase 1", fase_ordre:1, ordre:20, temps_std_min:5.0, maquina:"Puntada recta" },
      { codi:"R84054-021", nom:"Cerrar primera costura de manga",                                fase:"Fase 1", fase_ordre:1, ordre:21, temps_std_min:2.0, maquina:"Máquina plana / recta" },
      { codi:"R84054-022", nom:"Hacer pegajoso de manga (primera)",                              fase:"Fase 1", fase_ordre:1, ordre:22, temps_std_min:1.0, maquina:"Puntada recta" },
      { codi:"R84054-023", nom:"Cerrar segunda costura de manga",                                fase:"Fase 1", fase_ordre:1, ordre:23, temps_std_min:2.0, maquina:"Máquina plana / recta" },
      { codi:"R84054-024", nom:"Hacer pegajoso de manga (segunda)",                              fase:"Fase 1", fase_ordre:1, ordre:24, temps_std_min:5.0, maquina:"Puntada recta" },
      { codi:"R84054-025", nom:"Pegar los puños",                                                fase:"Fase 1", fase_ordre:1, ordre:25, temps_std_min:2.0, maquina:"Overlock 5 hilos" },
      { codi:"R84054-026", nom:"Preparar canal del hombro",                                      fase:"Fase 1", fase_ordre:1, ordre:26, temps_std_min:2.0, maquina:"Preparación" },
      { codi:"R84054-027", nom:"Una vía de tejido principal en el forro",                        fase:"Fase 1", fase_ordre:1, ordre:27, temps_std_min:2.0, maquina:"Puntada recta" },
      // FASE 2
      { codi:"R84054-028", nom:"Hacer piquetes en las vías y pegajoso de vía",                   fase:"Fase 2", fase_ordre:2, ordre:1,  temps_std_min:3.0, maquina:"Manual + puntada recta" },
      { codi:"R84054-029", nom:"Unir las costuras internas del forro al tejido principal",        fase:"Fase 2", fase_ordre:2, ordre:2,  temps_std_min:1.0, maquina:"Puntada recta" },
      { codi:"R84054-030", nom:"Hacer pegajoso al canto de los laterales",                       fase:"Fase 2", fase_ordre:2, ordre:3,  temps_std_min:3.0, maquina:"Puntada recta" },
      { codi:"R84054-031", nom:"Hacer doble pegajoso de hombros",                                fase:"Fase 2", fase_ordre:2, ordre:4,  temps_std_min:2.0, maquina:"Puntada recta" },
      { codi:"R84054-032", nom:"Pegar canal de vías con doble pespada",                          fase:"Fase 2", fase_ordre:2, ordre:5,  temps_std_min:5.0, maquina:"Puntada recta" },
      { codi:"R84054-033", nom:"Fijar el forro en la cintura",                                   fase:"Fase 2", fase_ordre:2, ordre:6,  temps_std_min:1.0, maquina:"Puntada recta" },
      { codi:"R84054-034", nom:"Pegar el lombrar",                                               fase:"Fase 2", fase_ordre:2, ordre:7,  temps_std_min:1.0, maquina:"Máquina plana / recta" },
      { codi:"R84054-035", nom:"Hacer doble pegajoso del lombrar",                               fase:"Fase 2", fase_ordre:2, ordre:8,  temps_std_min:3.0, maquina:"Puntada recta" },
      { codi:"R84054-036", nom:"Unir cintura del pantalón a la parte superior",                  fase:"Fase 2", fase_ordre:2, ordre:9,  temps_std_min:2.0, maquina:"Overlock 5 hilos" },
      { codi:"R84054-037", nom:"Hacer doble pegajoso delantero grande la cintura interna hacia atrás", fase:"Fase 2", fase_ordre:2, ordre:10, temps_std_min:4.0, maquina:"Puntada recta" },
      { codi:"R84054-038", nom:"Hacer doble pegajoso en cintura trasera grande la cintura hacia atrás", fase:"Fase 2", fase_ordre:2, ordre:11, temps_std_min:3.0, maquina:"Puntada recta" },
      { codi:"R84054-039", nom:"Fijar el forro en el resordo del cuello",                        fase:"Fase 2", fase_ordre:2, ordre:12, temps_std_min:1.0, maquina:"Puntada recta" },
      // FASE 3
      { codi:"R84054-040", nom:"Overlock las fronteras",                                         fase:"Fase 3", fase_ordre:3, ordre:1,  temps_std_min:1.0, maquina:"Overlock 3 hilos" },
      { codi:"R84054-041", nom:"Marcar líneas de las fronteras para pespuntar la cremallera",    fase:"Fase 3", fase_ordre:3, ordre:2,  temps_std_min:3.0, maquina:"Plantilla / manual" },
      { codi:"R84054-042", nom:"Pegar el primer extremo de la cremallera",                       fase:"Fase 3", fase_ordre:3, ordre:3,  temps_std_min:1.0, maquina:"Puntada recta" },
      { codi:"R84054-043", nom:"Marcar alturas de los subliminales en la cremallera",            fase:"Fase 3", fase_ordre:3, ordre:4,  temps_std_min:2.0, maquina:"Manual" },
      { codi:"R84054-044", nom:"Pegar el segundo extremo de la cremallera",                      fase:"Fase 3", fase_ordre:3, ordre:5,  temps_std_min:1.0, maquina:"Puntada recta" },
      { codi:"R84054-045", nom:"Cerrar vía delantera",                                           fase:"Fase 3", fase_ordre:3, ordre:6,  temps_std_min:1.0, maquina:"Máquina plana / recta" },
      { codi:"R84054-046", nom:"Hacer primer pegajoso de cremallera, lado derecho",              fase:"Fase 3", fase_ordre:3, ordre:7,  temps_std_min:2.0, maquina:"Puntada recta" },
      { codi:"R84054-047", nom:"Hacer segundo línea y subliminales en puntos espinillas",        fase:"Fase 3", fase_ordre:3, ordre:8,  temps_std_min:1.0, maquina:"Manual" },
      { codi:"R84054-048", nom:"Hacer pegajoso de cremallera, lado izquierdo",                   fase:"Fase 3", fase_ordre:3, ordre:9,  temps_std_min:2.0, maquina:"Puntada recta" },
      { codi:"R84054-049", nom:"Pegar tapeta interna en el lado derecho",                        fase:"Fase 3", fase_ordre:3, ordre:10, temps_std_min:1.0, maquina:"Puntada recta" },
      { codi:"R84054-050", nom:"Hacer segundo pegajoso de cremallera",                           fase:"Fase 3", fase_ordre:3, ordre:11, temps_std_min:1.0, maquina:"Puntada recta" },
      { codi:"R84054-051", nom:"Pegar el cuello",                                                fase:"Fase 3", fase_ordre:3, ordre:12, temps_std_min:1.0, maquina:"Máquina plana / recta" },
      { codi:"R84054-052", nom:"Hacer pegajoso de cuello en la parte superior",                  fase:"Fase 3", fase_ordre:3, ordre:13, temps_std_min:1.0, maquina:"Puntada recta" },
      { codi:"R84054-053", nom:"Cerrar el cuello",                                               fase:"Fase 3", fase_ordre:3, ordre:14, temps_std_min:1.0, maquina:"Puntada recta" },
      { codi:"R84054-054", nom:"Marcar y pegar velcro macho de cuello",                          fase:"Fase 3", fase_ordre:3, ordre:15, temps_std_min:1.0, maquina:"Manual + puntada recta" },
      { codi:"R84054-055", nom:"Cerrar la entrepierna",                                          fase:"Fase 3", fase_ordre:3, ordre:16, temps_std_min:2.0, maquina:"Máquina plana / recta" },
      // FASE 4
      { codi:"R84054-056", nom:"Pegar puños y gomas de las piernas",                             fase:"Fase 4", fase_ordre:4, ordre:1,  temps_std_min:2.0, maquina:"Máquina plana / recta" },
      { codi:"R84054-057", nom:"Pegar las mangas en puntada recta con doble pespada",            fase:"Fase 4", fase_ordre:4, ordre:2,  temps_std_min:5.0, maquina:"Puntada recta" },
      { codi:"R84054-058", nom:"Hacer overlock en el pegajoso de manga",                         fase:"Fase 4", fase_ordre:4, ordre:3,  temps_std_min:2.0, maquina:"Overlock 3 hilos" },
      { codi:"R84054-059", nom:"Fijar overlock en el pegajoso de manga",                         fase:"Fase 4", fase_ordre:4, ordre:4,  temps_std_min:2.0, maquina:"Overlock 3 hilos" },
    ];

    // Create route
    const ruta = new Record(rutes);
    ruta.set("nom", "CIK FIA / UNIK PRO K - R84-054");
    ruta.set("article", "CIK R84-054");
    ruta.set("per_defecte", false);
    ruta.set("versio", "1.0");
    ruta.set("estat_ruta", "activa");
    ruta.set("notas", "Ruta artículo CIK R84-054 - 59 operaciones en 4 fases");
    const totalMin = ops.reduce((s, o) => s + o.temps_std_min, 0);
    ruta.set("temps_total_std_min", totalMin);

    // Build operacions JSON for ruta (same structure as R82-020)
    const operacionsJson = ops.map(o => ({
      codi: o.codi,
      nom: o.nom,
      fase: o.fase,
      ordre: o.ordre,
      temps_std_min: o.temps_std_min,
      maquina: o.maquina,
    }));
    ruta.set("operacions", operacionsJson);
    app.save(ruta);

    // Create operacions_def records
    for (const o of ops) {
      const rec = new Record(opsDef);
      rec.set("codi", o.codi);
      rec.set("nom", o.nom);
      rec.set("fase", o.fase);
      rec.set("fase_ordre", o.fase_ordre);
      rec.set("ordre", o.ordre);
      rec.set("temps_std_min", o.temps_std_min);
      rec.set("maquina", o.maquina);
      rec.set("actiu", true);
      rec.set("ruta", ruta.id);
      app.save(rec);
    }
  },
  (app) => {
    // Delete operacions_def for this route first
    const opsDef = app.findCollectionByNameOrId("operacions_def");
    const records = app.findRecordsByFilter(opsDef, 'codi ~ "R84054-"', "", 100, 0);
    for (const r of records) {
      app.delete(r);
    }
    // Delete the route
    const rutes = app.findCollectionByNameOrId("rutes");
    const ruteRecords = app.findRecordsByFilter(rutes, 'article = "CIK R84-054"', "", 1, 0);
    for (const r of ruteRecords) {
      app.delete(r);
    }
  }
);

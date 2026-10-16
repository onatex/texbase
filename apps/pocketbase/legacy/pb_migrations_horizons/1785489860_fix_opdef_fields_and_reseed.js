/// <reference path="../pb_data/types.d.ts" />

// Adds all missing fields to operacions_def and controles_qualitat_def,
// then re-seeds 60 UNIC PLUS operations for R82-020 and R82-021.

migrate(
  (app) => {
    const rutesCol = app.findCollectionByNameOrId("rutes");

    // ── 1. Add fields to operacions_def ──────────────────────────────────
    const opdef = app.findCollectionByNameOrId("operacions_def");
    const opFields = [
      ["codi",              new TextField({ name: "codi", max: 20 })],
      ["nom",               new TextField({ name: "nom", max: 200 })],
      ["fase",              new TextField({ name: "fase", max: 120 })],
      ["fase_ordre",        new NumberField({ name: "fase_ordre" })],
      ["ordre",             new NumberField({ name: "ordre" })],
      ["descripcio",        new TextField({ name: "descripcio", max: 2000 })],
      ["instruccions",      new TextField({ name: "instruccions", max: 5000 })],
      ["peca_zona",         new TextField({ name: "peca_zona", max: 200 })],
      ["maquina",           new TextField({ name: "maquina", max: 200 })],
      ["especialitat",      new TextField({ name: "especialitat", max: 200 })],
      ["temps_std_min",     new NumberField({ name: "temps_std_min" })],
      ["temps_prep_min",    new NumberField({ name: "temps_prep_min" })],
      ["unitats_lot",       new NumberField({ name: "unitats_lot" })],
      ["op_anterior",       new TextField({ name: "op_anterior", max: 200 })],
      ["op_seguent",        new TextField({ name: "op_seguent", max: 200 })],
      ["paralel",           new BoolField({ name: "paralel" })],
      ["te_control_qualitat", new BoolField({ name: "te_control_qualitat" })],
      ["defectes_frequents", new TextField({ name: "defectes_frequents", max: 2000 })],
      ["actiu",             new BoolField({ name: "actiu" })],
      ["ruta",              new RelationField({ name: "ruta", maxSelect: 1, collectionId: rutesCol.id })],
      ["created",           new AutodateField({ name: "created", onCreate: true, onUpdate: false })],
      ["updated",           new AutodateField({ name: "updated", onCreate: true, onUpdate: true })],
    ];
    let opChanged = false;
    for (const [name, field] of opFields) {
      if (!opdef.fields.getByName(name)) { opdef.fields.add(field); opChanged = true; }
    }
    if (opChanged) app.save(opdef);

    // ── 2. Add fields to controles_qualitat_def ──────────────────────────
    const cqdef = app.findCollectionByNameOrId("controles_qualitat_def");
    const cqFields = [
      ["codi",               new TextField({ name: "codi", max: 20 })],
      ["nom",                new TextField({ name: "nom", max: 200 })],
      ["fase_operacio",      new TextField({ name: "fase_operacio", max: 200 })],
      ["descripcio",         new TextField({ name: "descripcio", max: 2000 })],
      ["criteris_acceptacio", new TextField({ name: "criteris_acceptacio", max: 2000 })],
      ["defectes_frequents", new TextField({ name: "defectes_frequents", max: 2000 })],
      ["obligatori",         new BoolField({ name: "obligatori" })],
      ["ruta",               new RelationField({ name: "ruta", maxSelect: 1, collectionId: rutesCol.id })],
      ["created",            new AutodateField({ name: "created", onCreate: true, onUpdate: false })],
      ["updated",            new AutodateField({ name: "updated", onCreate: true, onUpdate: true })],
    ];
    let cqChanged = false;
    for (const [name, field] of cqFields) {
      if (!cqdef.fields.getByName(name)) { cqdef.fields.add(field); cqChanged = true; }
    }
    if (cqChanged) app.save(cqdef);

    // ── 3. Re-seed 60 UNIC PLUS ops ─────────────────────────────────────
    // [codi, nom, fase, fase_ordre, ordre, maquina, temps_std_min]
    const unicOps = [
      ["UNIC-001","Unir forro; hacer pinzas si es de mujer","Fase 1",1,1,"Plana / recta",5],
      ["UNIC-002","Hacer bolsillo/s","Fase 1",1,2,"Plana / recta",12],
      ["UNIC-003","Encarar forro y tejido a máquina","Fase 1",1,3,"Plana / recta",5],
      ["UNIC-004","Recortar el forro","Fase 1",1,4,"Manual / plantilla",3],
      ["UNIC-005","Marcar posición de la cremallera","Fase 1",1,5,"Manual / plantilla",1],
      ["UNIC-006","Pasar overlock donde va la cremallera","Fase 1",1,6,"Overlock 3 hilos",1],
      ["UNIC-007","Hacer pinzas y pespuntarlas, si es mujer","Fase 1",1,7,"Plana / recta",3],
      ["UNIC-008","Encarar el forro de espalda","Fase 1",1,8,"Plana / recta",2],
      ["UNIC-009","Encarar el forro de las piernas","Fase 1",1,9,"Plana / recta",5],
      ["UNIC-010","Pegar el canalé lumbar en plana","Fase 1",1,10,"Plana / recta",3],
      ["UNIC-011","Overlocar el canalé","Fase 1",1,11,"Overlock 3 hilos",1],
      ["UNIC-012","Hacer doble pespunte","Fase 1",1,12,"Plana / recta",3],
      ["UNIC-013","Unir tiro trasero","Fase 1",1,13,"Overlock 5 hilos",1],
      ["UNIC-014","Hacer doble pespunte en tiro trasero","Fase 1",1,14,"Plana / recta",2],
      ["UNIC-015","Unir pantalón con espalda","Fase 1",1,15,"Overlock 5 hilos",1],
      ["UNIC-016","Hacer doble pespunte en la unión","Fase 1",1,16,"Plana / recta",2],
      ["UNIC-017","Preparar el lumbar con la goma","Fase 1",1,17,"Pendiente de asignar",1],
      ["UNIC-018","Unir y pespuntar sisas de forro y canalé","Fase 1",1,18,"Plana / recta",5],
      ["UNIC-019","Encarar sisas con puntada recta","Fase 1",1,19,"Plana / recta",3],
      ["UNIC-020","Pegar velcro de cuello","Fase 1",1,20,"Plana / recta",1],
      ["UNIC-021","Encarar no tejido y canalé de cuello","Fase 1",1,21,"Plana / recta",1],
      ["UNIC-022","Unir canalé y tejido principal y girarlo","Fase 1",1,22,"Plana / recta",2],
      ["UNIC-023","Pegar velcros del cinturón izquierdo","Fase 1",1,23,"Plana / recta",2],
      ["UNIC-024","Cerrar cinturones y girarlos","Fase 1",1,24,"Plana / recta",5],
      ["UNIC-025","Hacer doble pespunte de cinturones","Fase 1",1,25,"Plana / recta",3],
      ["UNIC-026","Pegar velcros del lado derecho","Fase 1",1,26,"Plana / recta",2],
      ["UNIC-027","Coser hombreras por el revés y girarlas","Fase 1",1,27,"Plana / recta",6],
      ["UNIC-028","Pespuntear al canto las hombreras","Fase 1",1,28,"Plana / recta",3],
      ["UNIC-029","Encarar canalé y forro de entrepierna","Fase 1",1,29,"Plana / recta",1],
      ["UNIC-030","Unir forros de mangas al tejido","Fase 1",1,30,"Plana / recta",4],
      ["UNIC-031","Cerrar primera costura de bajos de manga","Fase 1",1,31,"Overlock 5 hilos",3],
      ["UNIC-032","Pasar primer pespunte de manga","Fase 1",1,32,"Plana / recta",2],
      ["UNIC-033","Cerrar segunda costura de manga","Fase 1",1,33,"Pendiente de asignar",3],
      ["UNIC-034","Hacer pespunte de manga","Fase 1",1,34,"Plana / recta",5],
      ["UNIC-035","Pegar los puños","Fase 1",1,35,"Pendiente de asignar",3],
      ["UNIC-036","Hacer dobladillos en ambos frentes","Fase 2",2,36,"Plana / recta",2],
      ["UNIC-037","Pegar las cinco etiquetas al frente derecho","Fase 2",2,37,"Plana / recta",5],
      ["UNIC-038","Pegar cremallera al frente derecho","Fase 2",2,38,"Plana / recta",1],
      ["UNIC-039","Hacer pespunte de cremallera","Fase 2",2,39,"Plana / recta",2],
      ["UNIC-040","Pespuntear al canto el frente izquierdo","Fase 2",2,40,"Plana / recta",3],
      ["UNIC-041","Marcar cremallera para casar sublimados","Fase 2",2,41,"Manual / plantilla",3],
      ["UNIC-042","Pegar cremallera al frente izquierdo con doble pasada","Fase 2",2,42,"Plana / recta",1],
      ["UNIC-043","Repunte de tapeta con doble pasada","Fase 2",2,43,"Plana / recta",3],
      ["UNIC-044","Cerrar parte baja del tiro delantero con doble pespunte","Fase 2",2,44,"Plana / recta",2],
      ["UNIC-045","Cerrar los hombros","Fase 2",2,45,"Pendiente de asignar",2],
      ["UNIC-046","Hacer doble pespunte de hombros","Fase 2",2,46,"Plana / recta",1],
      ["UNIC-047","Pegar el cuello","Fase 2",2,47,"Plana / recta",2],
      ["UNIC-048","Cerrar el cuello y pespuntear todo el contorno","Fase 2",2,48,"Plana / recta",5],
      ["UNIC-049","Marcar y pegar velcro de cuello","Fase 2",2,49,"Manual + recta",2],
      ["UNIC-050","Cerrar laterales","Fase 3",3,50,"Pendiente de asignar",4],
      ["UNIC-051","Hacer pespuntes laterales","Fase 3",3,51,"Plana / recta",5],
      ["UNIC-052","Pegar las sisas del tejido","Fase 3",3,52,"Plana / recta",4],
      ["UNIC-053","Pespuntear las sisas al canto","Fase 3",3,53,"Plana / recta",5],
      ["UNIC-054","Pegar canalé forrado al tejido de la sisa","Fase 3",3,54,"Plana / recta",2],
      ["UNIC-055","Pasar overlock","Fase 3",3,55,"Overlock 3 hilos",1],
      ["UNIC-056","Repunte de ambas sisas con doble pasada","Fase 3",3,56,"Plana / recta",8],
      ["UNIC-057","Pegar las mangas","Fase 3",3,57,"Pendiente de asignar",5],
      ["UNIC-058","Cerrar entrepierna","Fase 3",3,58,"Overlock 5 hilos",3],
      ["UNIC-059","Pegar puños del pantalón","Fase 3",3,59,"Pendiente de asignar",3],
      ["UNIC-060","Hacer carga a pata en la entrepierna","Fase 3",3,60,"Plana / recta",2],
    ];
    const totalMin = 181;

    function seedOpsForRuta(rutaId) {
      // Delete stale records first
      try {
        const stale = app.findRecordsByFilter("operacions_def", `ruta = '${rutaId}'`, "", 5000, 0);
        for (const r of stale) app.delete(r);
      } catch (_) {}

      const opdefNow = app.findCollectionByNameOrId("operacions_def");
      for (let i = 0; i < unicOps.length; i++) {
        const [codi, nom, fase, faseOrdre, ordre, maquina, temps] = unicOps[i];
        const opAnt = i > 0 ? unicOps[i - 1][0] : "";
        const opSeg = i < unicOps.length - 1 ? unicOps[i + 1][0] : "";
        const rec = new Record(opdefNow);
        rec.set("codi", codi);
        rec.set("nom", nom);
        rec.set("fase", fase);
        rec.set("fase_ordre", faseOrdre);
        rec.set("ordre", ordre);
        rec.set("maquina", maquina);
        rec.set("especialitat", "Confeccionista");
        rec.set("temps_std_min", temps);
        rec.set("paralel", false);
        rec.set("te_control_qualitat", false);
        rec.set("op_anterior", opAnt);
        rec.set("op_seguent", opSeg);
        rec.set("actiu", true);
        rec.set("ruta", rutaId);
        app.save(rec);
      }
    }

    // ── R82-020 ──────────────────────────────────────────────────────────
    let ruta020;
    try {
      const found = app.findRecordsByFilter("rutes", "nom = 'Ruta R82-020 UNIC PLUS SUIT'", "", 1, 0);
      if (found && found.length > 0) ruta020 = found[0];
    } catch (_) {}
    if (!ruta020) {
      ruta020 = new Record(rutesCol);
      ruta020.set("nom", "Ruta R82-020 UNIC PLUS SUIT");
      ruta020.set("article", "R82-020");
      ruta020.set("per_defecte", false);
      ruta020.set("operacions", []);
    }
    ruta020.set("versio", "v2");
    ruta020.set("estat_ruta", "activa");
    ruta020.set("notas", "UNIC PLUS SUIT — 3 fases, 60 operaciones, 181 min totales");
    ruta020.set("temps_total_std_min", totalMin);
    app.save(ruta020);
    seedOpsForRuta(ruta020.id);

    // ── R82-021 ──────────────────────────────────────────────────────────
    let ruta021;
    try {
      const found = app.findRecordsByFilter("rutes", "nom = 'Ruta R82-021 UNIC PLUS SUIT'", "", 1, 0);
      if (found && found.length > 0) ruta021 = found[0];
    } catch (_) {}
    if (!ruta021) {
      ruta021 = new Record(rutesCol);
      ruta021.set("nom", "Ruta R82-021 UNIC PLUS SUIT");
      ruta021.set("article", "R82-021");
      ruta021.set("per_defecte", false);
      ruta021.set("operacions", []);
    }
    ruta021.set("versio", "v2");
    ruta021.set("estat_ruta", "activa");
    ruta021.set("notas", "UNIC PLUS SUIT — 3 fases, 60 operaciones, 181 min totales");
    ruta021.set("temps_total_std_min", totalMin);
    app.save(ruta021);
    seedOpsForRuta(ruta021.id);
  },
  (app) => {
    // No destructive down — field additions and seed data are safe to leave
  }
);

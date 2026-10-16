/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const rutesCol = app.findCollectionByNameOrId("rutes");
    const opdefCol = app.findCollectionByNameOrId("operacions_def");
    const cqdefCol = app.findCollectionByNameOrId("controles_qualitat_def");

    // Skip if already seeded (check by name)
    let existingRuta = null;
    try {
      const found = app.findRecordsByFilter("rutes", "nom = 'Ruta R82-020 UNIC PLUS SUIT'", "", 1, 0);
      if (found && found.length > 0) { existingRuta = found[0]; }
    } catch (_) {}

    if (!existingRuta) {
      const ruta = new Record(rutesCol);
      ruta.set("nom", "Ruta R82-020 UNIC PLUS SUIT");
      ruta.set("article", "R82-020");
      ruta.set("versio", "v1");
      ruta.set("data_aplicacio", new Date().toISOString().slice(0, 10));
      ruta.set("estat_ruta", "activa");
      ruta.set("notas", "Ruta de producció per al mono UNIC PLUS SUIT R82-020. Temps provisionals pendents de validació.");
      ruta.set("per_defecte", false);
      ruta.set("operacions", []);
      app.save(ruta);
      existingRuta = ruta;
    }

    const rutaId = existingRuta.id;

    // Check if ops already seeded by trying to find any op with this ruta ID in codi
    let alreadySeeded = false;
    try {
      const existingOps = app.findRecordsByFilter("operacions_def", "codi = 'R82-P01'", "", 1, 0);
      if (existingOps && existingOps.length > 0) alreadySeeded = true;
    } catch (_) {}
    if (alreadySeeded) return;

    // Operations data: [codi, nom, fase, fase_ordre, ordre, maquina, especialitat, temps_std_min, paralel, te_qc, op_anterior, op_seguent, peca_zona]
    const ops = [
      // FASE 1: Recepció i preparació
      ["R82-P01","Recibir paquete de producción","Fase 1: Recepció i preparació",1,1,"","",5,false,false,"","R82-P02",""],
      ["R82-P02","Verificar exclusiva, referencia, talla y cantidad","Fase 1: Recepció i preparació",1,2,"","",8,false,false,"R82-P01","R82-P03",""],
      ["R82-P03","Contar todos los componentes","Fase 1: Recepció i preparació",1,3,"","",10,false,false,"R82-P02","R82-P04",""],
      ["R82-P04","Revisar corte","Fase 1: Recepció i preparació",1,4,"","Cortador",10,false,true,"R82-P03","R82-P05","Todas las piezas"],
      ["R82-P05","Revisar estampación o sublimación","Fase 1: Recepció i preparació",1,5,"","",8,false,true,"R82-P04","R82-P06","Piezas con estampado"],
      ["R82-P06","Separar piezas por unidad y talla","Fase 1: Recepció i preparació",1,6,"","",12,false,false,"R82-P05","R82-P07","Todas las piezas"],
      ["R82-P07","Preparar cremalleras, velcros, etiquetas y accesorios","Fase 1: Recepció i preparació",1,7,"","",10,false,false,"R82-P06","R82-P08","Accesorios"],
      ["R82-P08","Crear los lotes de producción","Fase 1: Recepció i preparació",1,8,"","",10,false,false,"R82-P07","R82-C01",""],

      // FASE 2: Preparació de components (en paralelo)
      ["R82-C01","Preparar piezas delanteras","Fase 2: Preparació de components",2,10,"","Confeccionista",12,true,false,"R82-P08","R82-D01","Delantero"],
      ["R82-C02","Preparar piezas de espalda","Fase 2: Preparació de components",2,11,"","Confeccionista",12,true,false,"R82-P08","R82-E01","Espalda"],
      ["R82-C03","Preparar paneles laterales","Fase 2: Preparació de components",2,12,"","Confeccionista",10,true,false,"R82-P08","","Laterals"],
      ["R82-C04","Preparar mangas","Fase 2: Preparació de components",2,13,"","Confeccionista",12,true,false,"R82-P08","R82-M01","Mangas"],
      ["R82-C05","Preparar piernas","Fase 2: Preparació de components",2,14,"","Confeccionista",12,true,false,"R82-P08","R82-L01","Piernas"],
      ["R82-C06","Preparar bolsillos","Fase 2: Preparació de components",2,15,"","Confeccionista",10,true,false,"R82-P08","R82-B01","Bolsillos"],
      ["R82-C07","Preparar cuello","Fase 2: Preparació de components",2,16,"","Confeccionista",8,true,false,"R82-P08","R82-N01","Cuello"],
      ["R82-C08","Preparar puños","Fase 2: Preparació de components",2,17,"","Confeccionista",8,true,false,"R82-P08","R82-M04","Puños"],
      ["R82-C09","Preparar cinturón","Fase 2: Preparació de components",2,18,"","Confeccionista",8,true,false,"R82-P08","R82-T01","Cinturón"],
      ["R82-C10","Preparar refuerzos","Fase 2: Preparació de components",2,19,"","Confeccionista",10,true,false,"R82-P08","","Refuerzos"],

      // FASE 3: Bolsillos
      ["R82-B01","Identificar piezas del bolsillo","Fase 3: Bolsillos",3,20,"","",3,false,false,"R82-C06","R82-B02","Bolsillos"],
      ["R82-B02","Marcar posición","Fase 3: Bolsillos",3,21,"","",5,false,false,"R82-B01","R82-B03","Bolsillos"],
      ["R82-B03","Preparar entrada","Fase 3: Bolsillos",3,22,"Máquina plana","Confeccionista",5,false,false,"R82-B02","R82-B04","Bolsillos"],
      ["R82-B04","Preparar cremallera","Fase 3: Bolsillos",3,23,"","",5,false,false,"R82-B03","R82-B05","Bolsillos"],
      ["R82-B05","Coser cremallera","Fase 3: Bolsillos",3,24,"Máquina plana","Confeccionista",10,false,false,"R82-B04","R82-B06","Bolsillos"],
      ["R82-B06","Montar fondo","Fase 3: Bolsillos",3,25,"Máquina plana","Confeccionista",8,false,false,"R82-B05","R82-B07","Bolsillos"],
      ["R82-B07","Cerrar laterales","Fase 3: Bolsillos",3,26,"Overlock 5 hilos","Confeccionista",8,false,false,"R82-B06","R82-B08","Bolsillos"],
      ["R82-B08","Girar y conformar","Fase 3: Bolsillos",3,27,"","",5,false,false,"R82-B07","R82-B09","Bolsillos"],
      ["R82-B09","Posicionar sobre el delantero","Fase 3: Bolsillos",3,28,"","",5,false,false,"R82-B08","R82-B10","Delantero"],
      ["R82-B10","Pespuntear","Fase 3: Bolsillos",3,29,"Máquina plana","Confeccionista",10,false,false,"R82-B09","R82-B11","Bolsillos"],
      ["R82-B11","Atacar extremos","Fase 3: Bolsillos",3,30,"Presilladora","Confeccionista",8,false,false,"R82-B10","R82-B12","Bolsillos"],
      ["R82-B12","Revisar posición, medida y funcionamiento","Fase 3: Bolsillos",3,31,"","Calidad",5,false,true,"R82-B11","R82-D01","Bolsillos"],

      // FASE 4: Muntatge del davanter
      ["R82-D01","Unir paneles delanteros","Fase 4: Muntatge del davanter",4,32,"Overlock 5 hilos","Confeccionista",12,false,false,"R82-C01","R82-D02","Delantero"],
      ["R82-D02","Montar refuerzos","Fase 4: Muntatge del davanter",4,33,"Máquina plana","Confeccionista",8,false,false,"R82-D01","R82-D03","Delantero"],
      ["R82-D03","Montar bolsillos","Fase 4: Muntatge del davanter",4,34,"Máquina plana","Confeccionista",10,false,false,"R82-D02","R82-D04","Delantero"],
      ["R82-D04","Preparar tapeta","Fase 4: Muntatge del davanter",4,35,"Máquina plana","Confeccionista",8,false,false,"R82-D03","R82-D05","Tapeta"],
      ["R82-D05","Preparar cremallera central","Fase 4: Muntatge del davanter",4,36,"","Confeccionista",8,false,false,"R82-D04","R82-D06","Cremallera central"],
      ["R82-D06","Coser primer lado de cremallera","Fase 4: Muntatge del davanter",4,37,"Máquina plana","Confeccionista",10,false,false,"R82-D05","R82-D07","Cremallera central"],
      ["R82-D07","Coser segundo lado","Fase 4: Muntatge del davanter",4,38,"Máquina plana","Confeccionista",10,false,false,"R82-D06","R82-D08","Cremallera central"],
      ["R82-D08","Realizar repunte","Fase 4: Muntatge del davanter",4,39,"Máquina plana","Confeccionista",8,false,false,"R82-D07","R82-D09","Cremallera central"],
      ["R82-D09","Montar velcros","Fase 4: Muntatge del davanter",4,40,"Máquina plana","Confeccionista",8,false,false,"R82-D08","R82-D10","Delantero"],
      ["R82-D10","Revisar simetría, logos y estampado","Fase 4: Muntatge del davanter",4,41,"","Calidad",5,false,true,"R82-D09","R82-E01","Delantero"],

      // FASE 5: Muntatge d'esquena
      ["R82-E01","Unir paneles de espalda","Fase 5: Muntatge d'esquena",5,42,"Overlock 5 hilos","Confeccionista",12,false,false,"R82-C02","R82-E02","Espalda"],
      ["R82-E02","Preparar rib o pieza elástica","Fase 5: Muntatge d'esquena",5,43,"Máquina plana","Confeccionista",8,false,false,"R82-E01","R82-E03","Rib espalda"],
      ["R82-E03","Montar rib de espalda","Fase 5: Muntatge d'esquena",5,44,"Recubridora","Confeccionista",12,false,true,"R82-E02","R82-E04","Rib espalda"],
      ["R82-E04","Montar refuerzos","Fase 5: Muntatge d'esquena",5,45,"Máquina plana","Confeccionista",8,false,false,"R82-E03","R82-E05","Espalda"],
      ["R82-E05","Realizar repuntes","Fase 5: Muntatge d'esquena",5,46,"Máquina plana","Confeccionista",8,false,false,"R82-E04","R82-E06","Espalda"],
      ["R82-E06","Unir paneles laterales","Fase 5: Muntatge d'esquena",5,47,"Overlock 5 hilos","Confeccionista",10,false,false,"R82-E05","R82-E07","Laterals"],
      ["R82-E07","Revisar el casado del estampado","Fase 5: Muntatge d'esquena",5,48,"","Calidad",5,false,true,"R82-E06","R82-E08","Espalda"],
      ["R82-E08","Comprobar medidas y movilidad","Fase 5: Muntatge d'esquena",5,49,"","Calidad",5,false,true,"R82-E07","R82-U01","Espalda"],

      // FASE 6: Mànigues i punys
      ["R82-M01","Unir paneles de manga","Fase 6: Mànigues i punys",6,50,"Overlock 5 hilos","Confeccionista",10,false,false,"R82-C04","R82-M02","Mangas"],
      ["R82-M02","Colocar refuerzos","Fase 6: Mànigues i punys",6,51,"Máquina plana","Confeccionista",8,false,false,"R82-M01","R82-M03","Mangas"],
      ["R82-M03","Cerrar manga","Fase 6: Mànigues i punys",6,52,"Overlock 5 hilos","Confeccionista",10,false,false,"R82-M02","R82-M04","Mangas"],
      ["R82-M04","Preparar puño","Fase 6: Mànigues i punys",6,53,"Máquina plana","Confeccionista",8,false,false,"R82-C08","R82-M05","Puños"],
      ["R82-M05","Montar puño","Fase 6: Mànigues i punys",6,54,"Máquina plana","Confeccionista",10,false,false,"R82-M04","R82-M06","Puños"],
      ["R82-M06","Coser puño con overlock","Fase 6: Mànigues i punys",6,55,"Overlock 5 hilos","Confeccionista",8,false,false,"R82-M05","R82-M07","Puños"],
      ["R82-M07","Atacar el inicio y final del overlock (CONTROL CRÍTICO)","Fase 6: Mànigues i punys",6,56,"Presilladora","Confeccionista",5,false,true,"R82-M06","R82-M08","Puños"],
      ["R82-M08","Montar manga en la sisa","Fase 6: Mànigues i punys",6,57,"Overlock 5 hilos","Confeccionista",15,false,false,"R82-M07","R82-M09","Sisa"],
      ["R82-M09","Cerrar sisa","Fase 6: Mànigues i punys",6,58,"Recubridora","Confeccionista",10,false,false,"R82-M08","R82-M10","Sisa"],
      ["R82-M10","Revisar puños, sisas y simetría","Fase 6: Mànigues i punys",6,59,"","Calidad",5,false,true,"R82-M09","R82-L01","Mangas"],

      // FASE 7: Cames (Piernas)
      ["R82-L01","Unir paneles de pierna","Fase 7: Cames",7,60,"Overlock 5 hilos","Confeccionista",10,false,false,"R82-C05","R82-L02","Piernas"],
      ["R82-L02","Preparar refuerzos de rodilla","Fase 7: Cames",7,61,"Máquina plana","Confeccionista",8,false,false,"R82-L01","R82-L03","Rodillas"],
      ["R82-L03","Montar refuerzos","Fase 7: Cames",7,62,"Máquina plana","Confeccionista",10,false,false,"R82-L02","R82-L04","Rodillas"],
      ["R82-L04","Cerrar costados","Fase 7: Cames",7,63,"Overlock 5 hilos","Confeccionista",10,false,false,"R82-L03","R82-L05","Piernas"],
      ["R82-L05","Cerrar entrepierna","Fase 7: Cames",7,64,"Overlock 5 hilos","Confeccionista",10,false,false,"R82-L04","R82-L06","Entrepierna"],
      ["R82-L06","Cerrar tiro","Fase 7: Cames",7,65,"Overlock 5 hilos","Confeccionista",8,false,false,"R82-L05","R82-L07","Tiro"],
      ["R82-L07","Preparar bajos","Fase 7: Cames",7,66,"Máquina plana","Confeccionista",8,false,false,"R82-L06","R82-L08","Bajos"],
      ["R82-L08","Montar ajustes o cremalleras de pierna","Fase 7: Cames",7,67,"Máquina plana","Confeccionista",12,false,false,"R82-L07","R82-L09","Piernas"],
      ["R82-L09","Realizar repuntes","Fase 7: Cames",7,68,"Máquina plana","Confeccionista",8,false,false,"R82-L08","R82-L10","Piernas"],
      ["R82-L10","Revisar largo y simetría","Fase 7: Cames",7,69,"","Calidad",5,false,true,"R82-L09","R82-U01","Piernas"],

      // FASE 8: Muntatge general
      ["R82-U01","Unir delantero y espalda","Fase 8: Muntatge general",8,70,"Overlock 5 hilos","Confeccionista",15,false,false,"R82-D10","R82-U02","Torso"],
      ["R82-U02","Cerrar hombros","Fase 8: Muntatge general",8,71,"Overlock 5 hilos","Confeccionista",10,false,false,"R82-U01","R82-U03","Hombros"],
      ["R82-U03","Cerrar costados","Fase 8: Muntatge general",8,72,"Overlock 5 hilos","Confeccionista",12,false,false,"R82-U02","R82-U04","Costados"],
      ["R82-U04","Unir torso y piernas","Fase 8: Muntatge general",8,73,"Overlock 5 hilos","Confeccionista",15,false,false,"R82-U03","R82-U05","Tiro"],
      ["R82-U05","Cerrar completamente el tiro","Fase 8: Muntatge general",8,74,"Overlock 5 hilos","Confeccionista",12,false,false,"R82-U04","R82-U06","Tiro"],
      ["R82-U06","Montar mangas","Fase 8: Muntatge general",8,75,"Overlock 5 hilos","Confeccionista",20,false,false,"R82-U05","R82-U07","Sisas"],
      ["R82-U07","Comprobar movilidad","Fase 8: Muntatge general",8,76,"","Calidad",5,false,true,"R82-U06","R82-U08","General"],
      ["R82-U08","Revisar costuras de seguridad","Fase 8: Muntatge general",8,77,"","Calidad",8,false,true,"R82-U07","R82-Z01","General"],

      // FASE 9: Cremallera central
      ["R82-Z01","Marcar la posición","Fase 9: Cremallera central",9,78,"","",3,false,false,"R82-U08","R82-Z02","Cremallera central"],
      ["R82-Z02","Colocar primer lado","Fase 9: Cremallera central",9,79,"Máquina plana","Confeccionista",8,false,false,"R82-Z01","R82-Z03","Cremallera central"],
      ["R82-Z03","Colocar segundo lado","Fase 9: Cremallera central",9,80,"Máquina plana","Confeccionista",8,false,false,"R82-Z02","R82-Z04","Cremallera central"],
      ["R82-Z04","Igualar alturas","Fase 9: Cremallera central",9,81,"","",3,false,false,"R82-Z03","R82-Z05","Cremallera central"],
      ["R82-Z05","Coser cremallera","Fase 9: Cremallera central",9,82,"Máquina plana","Confeccionista",12,false,false,"R82-Z04","R82-Z06","Cremallera central"],
      ["R82-Z06","Realizar repunte","Fase 9: Cremallera central",9,83,"Máquina plana","Confeccionista",8,false,false,"R82-Z05","R82-Z07","Cremallera central"],
      ["R82-Z07","Colocar tapeta","Fase 9: Cremallera central",9,84,"Máquina plana","Confeccionista",8,false,false,"R82-Z06","R82-Z08","Tapeta"],
      ["R82-Z08","Atacar extremos","Fase 9: Cremallera central",9,85,"Presilladora","Confeccionista",5,false,false,"R82-Z07","R82-Z09","Cremallera central"],
      ["R82-Z09","Probar apertura y cierre","Fase 9: Cremallera central",9,86,"","Calidad",3,false,true,"R82-Z08","R82-Z10","Cremallera central"],
      ["R82-Z10","Revisar ondas, arrugas y simetría","Fase 9: Cremallera central",9,87,"","Calidad",5,false,true,"R82-Z09","R82-N01","Cremallera central"],

      // FASE 10: Coll (Cuello)
      ["R82-N01","Preparar piezas","Fase 10: Coll",10,88,"","Confeccionista",5,false,false,"R82-C07","R82-N02","Cuello"],
      ["R82-N02","Aplicar refuerzo","Fase 10: Coll",10,89,"Máquina plana","Confeccionista",8,false,false,"R82-N01","R82-N03","Cuello"],
      ["R82-N03","Unir componentes","Fase 10: Coll",10,90,"Máquina plana","Confeccionista",10,false,false,"R82-N02","R82-N04","Cuello"],
      ["R82-N04","Conformar cuello","Fase 10: Coll",10,91,"","Confeccionista",5,false,false,"R82-N03","R82-N05","Cuello"],
      ["R82-N05","Unir cuello al escote","Fase 10: Coll",10,92,"Recubridora","Confeccionista",12,false,false,"R82-N04","R82-N06","Cuello/Escote"],
      ["R82-N06","Realizar repunte","Fase 10: Coll",10,93,"Máquina plana","Confeccionista",8,false,false,"R82-N05","R82-N07","Cuello"],
      ["R82-N07","Colocar velcro o cierre","Fase 10: Coll",10,94,"Máquina plana","Confeccionista",8,false,false,"R82-N06","R82-N08","Cuello"],
      ["R82-N08","Atacar extremos","Fase 10: Coll",10,95,"Presilladora","Confeccionista",5,false,false,"R82-N07","R82-N09","Cuello"],
      ["R82-N09","Comprobar forma y medida","Fase 10: Coll",10,96,"","Calidad",5,false,true,"R82-N08","R82-N10","Cuello"],
      ["R82-N10","Controlar hilos y repuntes incorrectos","Fase 10: Coll",10,97,"","Calidad",5,false,true,"R82-N09","R82-T01","Cuello"],

      // FASE 11: Cinturó
      ["R82-T01","Preparar piezas","Fase 11: Cinturó",11,98,"","Confeccionista",5,false,false,"R82-C09","R82-T02","Cinturón"],
      ["R82-T02","Doblar según ficha técnica","Fase 11: Cinturó",11,99,"","Confeccionista",5,false,false,"R82-T01","R82-T03","Cinturón"],
      ["R82-T03","Coser con pata compensada","Fase 11: Cinturó",11,100,"Pata compensada","Confeccionista",10,false,false,"R82-T02","R82-T04","Cinturón"],
      ["R82-T04","Controlar distancia de costura (7 mm)","Fase 11: Cinturó",11,101,"","Calidad",5,false,true,"R82-T03","R82-T05","Cinturón"],
      ["R82-T05","Comprobar ancho terminado (5,5 cm)","Fase 11: Cinturó",11,102,"","Calidad",3,false,true,"R82-T04","R82-T06","Cinturón"],
      ["R82-T06","Montar cinturón en el mono","Fase 11: Cinturó",11,103,"Máquina plana","Confeccionista",12,false,false,"R82-T05","R82-T07","Cinturón"],
      ["R82-T07","Cerrar extremos","Fase 11: Cinturó",11,104,"Máquina plana","Confeccionista",5,false,false,"R82-T06","R82-T08","Cinturón"],
      ["R82-T08","Colocar velcros","Fase 11: Cinturó",11,105,"Máquina plana","Confeccionista",8,false,false,"R82-T07","R82-T09","Cinturón"],
      ["R82-T09","Revisar posición y simetría","Fase 11: Cinturó",11,106,"","Calidad",5,false,true,"R82-T08","R82-A01","Cinturón"],

      // FASE 12: Acabats
      ["R82-A01","Colocar velcros","Fase 12: Acabats",12,107,"Máquina plana","Confeccionista",8,false,false,"R82-T09","R82-A02","General"],
      ["R82-A02","Colocar etiquetas","Fase 12: Acabats",12,108,"Máquina plana","Confeccionista",5,false,false,"R82-A01","R82-A03","General"],
      ["R82-A03","Colocar accesorios","Fase 12: Acabats",12,109,"","Confeccionista",5,false,false,"R82-A02","R82-A04","General"],
      ["R82-A04","Realizar atacados","Fase 12: Acabats",12,110,"Presilladora","Confeccionista",10,false,false,"R82-A03","R82-A05","General"],
      ["R82-A05","Limpiar hilos","Fase 12: Acabats",12,111,"","Acabados",12,false,false,"R82-A04","R82-A06","General"],
      ["R82-A06","Limpiar marcas","Fase 12: Acabats",12,112,"","Acabados",5,false,false,"R82-A05","R82-A07","General"],
      ["R82-A07","Planchar","Fase 12: Acabats",12,113,"Plancha","Acabados",15,false,false,"R82-A06","R82-A08","General"],
      ["R82-A08","Revisar manchas","Fase 12: Acabats",12,114,"","Calidad",5,false,true,"R82-A07","R82-A09","General"],
      ["R82-A09","Revisar logos","Fase 12: Acabats",12,115,"","Calidad",5,false,true,"R82-A08","R82-A10","General"],
      ["R82-A10","Realizar revisión visual completa","Fase 12: Acabats",12,116,"","Calidad",8,false,true,"R82-A09","R82-F01","General"],

      // FASE 14: Embolsat i entrega
      ["R82-F01","Confirmar aprobación de calidad","Fase 14: Embolsat i entrega",14,117,"","Calidad",3,false,true,"R82-A10","R82-F02","General"],
      ["R82-F02","Doblar","Fase 14: Embolsat i entrega",14,118,"","Acabados",5,false,false,"R82-F01","R82-F03","General"],
      ["R82-F03","Embolsar","Fase 14: Embolsat i entrega",14,119,"","Acabados",5,false,false,"R82-F02","R82-F04","General"],
      ["R82-F04","Etiquetar","Fase 14: Embolsat i entrega",14,120,"","Acabados",3,false,false,"R82-F03","R82-F05","General"],
      ["R82-F05","Agrupar por exclusiva y talla","Fase 14: Embolsat i entrega",14,121,"","Acabados",5,false,false,"R82-F04","R82-F06","General"],
      ["R82-F06","Realizar conteo final","Fase 14: Embolsat i entrega",14,122,"","",5,false,true,"R82-F05","R82-F07","General"],
      ["R82-F07","Registrar unidades terminadas","Fase 14: Embolsat i entrega",14,123,"","",3,false,false,"R82-F06","R82-F08","General"],
      ["R82-F08","Preparar la entrega","Fase 14: Embolsat i entrega",14,124,"","",5,false,false,"R82-F07","","General"],
    ];

    for (const [codi, nom, fase, foOrdre, ordre, maquina, especialitat, temps, paralel, teQc, opAnt, opSeg, pecaZona] of ops) {
      try {
        const rec = new Record(opdefCol);
        rec.set("codi", codi);
        rec.set("nom", nom);
        rec.set("fase", fase);
        rec.set("fase_ordre", foOrdre);
        rec.set("ordre", ordre);
        rec.set("maquina", maquina);
        rec.set("especialitat", especialitat);
        rec.set("temps_std_min", temps);
        rec.set("paralel", paralel);
        rec.set("te_control_qualitat", teQc);
        rec.set("op_anterior", opAnt);
        rec.set("op_seguent", opSeg);
        rec.set("peca_zona", pecaZona);
        rec.set("actiu", true);
        rec.set("ruta", rutaId);
        app.save(rec);
      } catch (_) { /* skip duplicates */ }
    }

    // QC Definitions (Phase 13)
    const qcDefs = [
      ["R82-Q01","Cuello","Fase 10: Coll","Verificar forma, medida y calidad del cuello","Sin ondas, medida correcta según ficha técnica","Ondas, medida incorrecta, repuntes sueltos",true],
      ["R82-Q02","Sisas","Fase 6: Mànigues i punys","Verificar que las sisas estén bien acabadas y sin tensión","Sin arrugas, costura uniforme","Arrugas, costura irregular, tensión excesiva",true],
      ["R82-Q03","Puños","Fase 6: Mànigues i punys","Verificar acabado y simetría de puños","Puños simétricos, sin hilos sueltos","Asimetría, hilos sueltos, overlock sin atacar",true],
      ["R82-Q04","Rib de espalda","Fase 5: Muntatge d'esquena","Verificar montaje del rib elástico","Bien cosido, sin pliegues, elástico correcto","Pliegues, tensión incorrecta, sin atacar extremos",true],
      ["R82-Q05","Cremalleras","Fase 9: Cremallera central","Verificar funcionamiento y acabado de cremalleras","Cremalleras funcionales, sin ondas","No cierra bien, ondas en la costura, tapeta desviada",true],
      ["R82-Q06","Bolsillos","Fase 3: Bolsillos","Verificar posición, medida y funcionamiento de bolsillos","Bolsillos simétricos, cremallera funcional","Posición incorrecta, cremallera atascada, costuras abiertas",true],
      ["R82-Q07","Velcros","Fase 12: Acabats","Verificar posición y adhesión de velcros","Velcros bien colocados y funcionales","Posición incorrecta, velcro despegado",true],
      ["R82-Q08","Cinturón","Fase 11: Cinturó","Verificar medidas y montaje del cinturón","Ancho 5,5 cm, distancia costura 7 mm, simétrico","Ancho incorrecto, asimetría, mal montado",true],
      ["R82-Q09","Costuras","Fase 8: Muntatge general","Verificar todas las costuras principales","Costuras uniformes, sin saltos, tensión correcta","Costuras irregulares, saltos, tensión incorrecta",true],
      ["R82-Q10","Repuntes","Fase 4: Muntatge del davanter","Verificar repuntes decorativos y funcionales","Repuntes rectos, distancia uniforme","Repuntes torcidos, distancia variable",false],
      ["R82-Q11","Casado del estampado","Fase 5: Muntatge d'esquena","Verificar que el estampado case correctamente","Estampado casado sin desviaciones visibles","Estampado descasado, diferencias de tono",true],
      ["R82-Q12","Ataques de overlock","Fase 6: Mànigues i punys","Verificar todos los ataques de inicio y final de overlock","Ataques presentes en todos los extremos","Ataques ausentes, hilos sueltos en extremos",true],
      ["R82-Q13","Medidas","Fase 12: Acabats","Verificar medidas generales del mono","Medidas dentro de tolerancia ±5mm","Medidas fuera de tolerancia",true],
      ["R82-Q14","Talla","Fase 14: Embolsat i entrega","Verificar que la talla corresponde a la etiqueta y la exclusiva","Talla correcta","Talla incorrecta",true],
      ["R82-Q15","Etiquetas","Fase 12: Acabats","Verificar presencia y posición de todas las etiquetas","Todas las etiquetas presentes y bien colocadas","Etiquetas ausentes, mal posicionadas o torcidas",true],
      ["R82-Q16","Limpieza final","Fase 12: Acabats","Verificar limpieza general del mono","Sin hilos, manchas, marcas ni residuos","Hilos sueltos, manchas, marcas de marcador",true],
    ];

    for (const [codi, nom, faseOp, desc, criteris, defectes, obligatori] of qcDefs) {
      try {
        const rec = new Record(cqdefCol);
        rec.set("codi", codi);
        rec.set("nom", nom);
        rec.set("fase_operacio", faseOp);
        rec.set("descripcio", desc);
        rec.set("criteris_acceptacio", criteris);
        rec.set("defectes_frequents", defectes);
        rec.set("obligatori", obligatori);
        rec.set("ruta", rutaId);
        app.save(rec);
      } catch (_) { /* skip duplicates */ }
    }

    // Update total time on the route
    const totalMin = ops.reduce((sum, op) => sum + op[7], 0);
    existingRuta.set("temps_total_std_min", totalMin);
    app.save(existingRuta);
  },
  (app) => {
    try {
      const found = app.findRecordsByFilter("rutes", "nom = 'Ruta R82-020 UNIC PLUS SUIT'", "", 1, 0);
      if (found && found.length > 0) app.delete(found[0]);
    } catch (_) {}
  }
);

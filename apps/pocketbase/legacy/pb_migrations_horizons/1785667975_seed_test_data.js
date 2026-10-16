/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    // ─── 1. Operarios OP001-OP008 ──────────────────────────────────────────
    const operarioMeta = [
      { codi: "OP001", name: "María García López",        email: "op001@monos.local", password: "Op001123!" },
      { codi: "OP002", name: "Juan Martínez Ruiz",        email: "op002@monos.local", password: "Op002123!" },
      { codi: "OP003", name: "Ana Fernández Gómez",       email: "op003@monos.local", password: "Op003123!" },
      { codi: "OP004", name: "Carlos Sánchez Pérez",      email: "op004@monos.local", password: "Op004123!" },
      { codi: "OP005", name: "Laura Torres Jiménez",      email: "op005@monos.local", password: "Op005123!" },
      { codi: "OP006", name: "Miguel Rodríguez Díaz",     email: "op006@monos.local", password: "Op006123!" },
      { codi: "OP007", name: "Sofía López Moreno",        email: "op007@monos.local", password: "Op007123!" },
      { codi: "OP008", name: "David González Álvarez",    email: "op008@monos.local", password: "Op008123!" },
    ];

    const operarios = [];
    for (const m of operarioMeta) {
      let u;
      try {
        u = app.findAuthRecordByEmail("users", m.email);
      } catch (_) {
        u = new Record(users);
        u.setEmail(m.email);
        u.setPassword(m.password);
        u.set("name", m.name);
        u.set("codi", m.codi);
        u.set("rol", "operari");
        app.save(u);
      }
      operarios.push(u);
    }

    // ─── 2. Find routes ────────────────────────────────────────────────────
    let ruta020 = null, ruta021 = null;
    try { ruta020 = app.findFirstRecordByFilter("rutes", "nom ~ 'R82-020'"); } catch (_) {}
    try { ruta021 = app.findFirstRecordByFilter("rutes", "nom ~ 'R82-021'"); } catch (_) {}
    // fallback: use any active route
    let defaultRuta = ruta020 || ruta021;
    if (!defaultRuta) {
      try { defaultRuta = app.findFirstRecordByFilter("rutes", "actiu = true || estat_ruta = 'activa'"); } catch (_) {}
    }

    const exclusivesCol = app.findCollectionByNameOrId("exclusives");
    const monosCol      = app.findCollectionByNameOrId("monos");
    const registresCol  = app.findCollectionByNameOrId("registres");

    // ─── 3. Exclusivas ─────────────────────────────────────────────────────
    // Check if seed data already exists
    let alreadySeeded = false;
    try {
      app.findFirstRecordByFilter("exclusives", "exclusiva = 'EXC-2024-001'");
      alreadySeeded = true;
    } catch (_) {}

    if (alreadySeeded) {
      return; // idempotent: skip if already seeded
    }

    const articlesRuta020 = ["R82-020", "R82-020", "R82-020"];
    const articlesRuta021 = ["R82-021", "R82-021"];
    const marcas = ["Speedo", "Arena", "TYR", "Adidas", "Nike", "Mizuno", "Turbo"];
    const tallas = ["XS", "S", "M", "L", "XL"];

    // Helpers
    const fmt = (d) => {
      const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,"0"), dd = String(d.getDate()).padStart(2,"0");
      return `${y}-${m}-${dd}`;
    };
    const today = new Date();
    const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate()-n); return d; };
    const daysAhead = (n) => { const d = new Date(today); d.setDate(d.getDate()+n); return d; };

    // 50 completed + 20 pending exclusivas
    const exclusivaRecords = [];
    let excNum = 1;

    // 50 completed (past dates)
    for (let i = 0; i < 50; i++) {
      const isR020 = i % 2 === 0;
      const ruta = isR020 ? ruta020 : ruta021;
      const article = isR020 ? "R82-020" : "R82-021";
      const marca = marcas[i % marcas.length];
      const daysBack = 5 + Math.floor(i * 0.5);
      const recDate = daysAgo(daysBack);
      const delivDate = daysAgo(Math.max(1, daysBack - 5));
      const talla = tallas[i % tallas.length];
      const unitats = 1 + (i % 3);

      const exc = new Record(exclusivesCol);
      exc.set("exclusiva", `EXC-2024-${String(excNum).padStart(3,"0")}`);
      exc.set("referencia", `REF-${String(1000+excNum).padStart(4,"0")}`);
      exc.set("article", article);
      exc.set("marca", marca);
      exc.set("unitats", unitats);
      exc.set("talla_info", JSON.stringify({ talla, unitats }));
      exc.set("estat", "finalitzada");
      exc.set("prioritat", i < 10 ? "alta" : (i < 30 ? "normal" : "normal"));
      exc.set("express", i < 5);
      exc.set("data_prevista_recepcio", fmt(daysAgo(daysBack + 10)));
      exc.set("data_real_recepcio", fmt(daysAgo(daysBack + 2)));
      exc.set("data_entrega", fmt(delivDate));
      exc.set("data_entrega_real", fmt(daysAgo(Math.max(1, daysBack - 3))));
      exc.set("minuts_previstos", isR020 ? 181 : 181);
      exc.set("risc", "viable");
      if (ruta) exc.set("ruta", ruta.id);
      app.save(exc);
      exclusivaRecords.push({ exc, isR020, completed: true });
      excNum++;
    }

    // 20 pending
    const pendingStates = ["pendent","pendent","en_curs","en_curs","pendent","recibida","en_curs","pendent","en_curs","pendent",
                           "pendent","en_curs","recibida","pendent","en_curs","pendent","pendent","en_curs","pendent","pendent"];
    for (let i = 0; i < 20; i++) {
      const isR020 = i % 2 === 0;
      const ruta = isR020 ? ruta020 : ruta021;
      const article = isR020 ? "R82-020" : "R82-021";
      const marca = marcas[(i+3) % marcas.length];
      const daysAhd = 1 + i;
      const talla = tallas[(i+1) % tallas.length];
      const unitats = 1 + (i % 2);
      const estat = pendingStates[i];

      const exc = new Record(exclusivesCol);
      exc.set("exclusiva", `EXC-2024-${String(excNum).padStart(3,"0")}`);
      exc.set("referencia", `REF-${String(1000+excNum).padStart(4,"0")}`);
      exc.set("article", article);
      exc.set("marca", marca);
      exc.set("unitats", unitats);
      exc.set("talla_info", JSON.stringify({ talla, unitats }));
      exc.set("estat", estat);
      exc.set("prioritat", i < 5 ? "alta" : "normal");
      exc.set("express", i < 2);
      exc.set("data_prevista_recepcio", fmt(daysAgo(3)));
      exc.set("data_real_recepcio", fmt(daysAgo(1)));
      exc.set("data_entrega", fmt(daysAhead(daysAhd)));
      exc.set("minuts_previstos", isR020 ? 181 : 181);
      exc.set("risc", i < 3 ? "en_risc" : "viable");
      if (ruta) exc.set("ruta", ruta.id);
      app.save(exc);
      exclusivaRecords.push({ exc, isR020, completed: false });
      excNum++;
    }

    // ─── 4. Monos (2 per exclusiva) ────────────────────────────────────────
    const monoRecords = [];
    for (const { exc, completed } of exclusivaRecords) {
      const count = 2;
      for (let n = 1; n <= count; n++) {
        const mono = new Record(monosCol);
        mono.set("exclusiva", exc.id);
        mono.set("numero", n);
        mono.set("codi", `${exc.getString("exclusiva")}-M${n}`);
        mono.set("estat", completed ? "finalitzat" : (n === 1 ? "en_curs" : "pendent"));
        const opIdx = Math.floor(Math.random() * operarios.length);
        mono.set("operari_assignat", operarios[opIdx].id);
        app.save(mono);
        monoRecords.push({ mono, exc, completed });
      }
    }

    // ─── 5. Registres (for completed exclusivas) ──────────────────────────
    const ops = ["UNIC-001","UNIC-002","UNIC-003","UNIC-004","UNIC-005","UNIC-010","UNIC-020","UNIC-035","UNIC-049"];
    for (const { mono, exc, completed } of monoRecords) {
      if (!completed) continue;
      const opIdx = Math.floor(Math.random() * operarios.length);
      const op = operarios[opIdx];
      const opName = ops[opIdx % ops.length];
      const durMin = 15 + Math.floor(Math.random() * 25);
      const durSeg = durMin * 60;

      const reg = new Record(registresCol);
      reg.set("mono", mono.id);
      reg.set("exclusiva", exc.id);
      reg.set("operari", op.id);
      reg.set("operacio", opName);
      reg.set("temps_real_seg", durSeg);
      reg.set("temps_estandard_seg", 20 * 60);
      reg.set("estat", "finalitzat");
      reg.set("control_qualitat", "ok");
      reg.set("tipus", "normal");
      app.save(reg);
    }

    // ─── 6. Reoperaciones (5) ─────────────────────────────────────────────
    for (let i = 0; i < 5; i++) {
      const opOrigIdx = i % operarios.length;
      const opReOpIdx = (i + 2) % operarios.length;
      const monoRef = monoRecords[i * 10];
      if (!monoRef) continue;

      const reg = new Record(registresCol);
      reg.set("mono", monoRef.mono.id);
      reg.set("exclusiva", monoRef.exc.id);
      reg.set("operari", operarios[opReOpIdx].id);
      reg.set("operacio", ops[i % ops.length]);
      reg.set("temps_real_seg", 25 * 60);
      reg.set("temps_estandard_seg", 20 * 60);
      reg.set("estat", "finalitzat");
      reg.set("tipus", "reoperacio");
      reg.set("retreball", true);
      app.save(reg);
    }

    // ─── 7. Registro Horario (15 days × 8 operarios) ──────────────────────
    const regHorCol = app.findCollectionByNameOrId("registro_horario");
    // productivity config per operario (to make top5/worst5 visible)
    const opConfig = [
      { prodMin: 420, tardeLate: false, exitEarly: false, incidents: 0 },  // OP001 - best
      { prodMin: 410, tardeLate: false, exitEarly: false, incidents: 0 },  // OP002 - best
      { prodMin: 400, tardeLate: false, exitEarly: false, incidents: 1 },  // OP003 - good
      { prodMin: 380, tardeLate: false, exitEarly: false, incidents: 1 },  // OP004 - good
      { prodMin: 340, tardeLate: true,  exitEarly: false, incidents: 2 },  // OP005 - avg
      { prodMin: 300, tardeLate: true,  exitEarly: true,  incidents: 3 },  // OP006 - below
      { prodMin: 250, tardeLate: true,  exitEarly: true,  incidents: 4 },  // OP007 - poor
      { prodMin: 180, tardeLate: true,  exitEarly: true,  incidents: 5 },  // OP008 - worst
    ];

    for (let opIdx = 0; opIdx < operarios.length; opIdx++) {
      const op = operarios[opIdx];
      const cfg = opConfig[opIdx];
      for (let d = 1; d <= 15; d++) {
        const day = daysAgo(d);
        // skip weekends
        const dow = day.getDay();
        if (dow === 0 || dow === 6) continue;

        const entryHour = cfg.tardeLate && (d % 3 === 0) ? "08:30" : "08:10";
        const exitHour  = cfg.exitEarly && (d % 4 === 0) ? "16:45" : "17:05";
        const duracion  = 8 * 60 + (cfg.exitEarly && d % 4 === 0 ? -15 : 5);
        const productivo = cfg.prodMin + Math.floor(Math.random() * 20 - 10);
        const improductivo = duracion - productivo;
        const excCompleted = 1 + Math.floor(productivo / 180);
        const opsCompleted = excCompleted * 3 + Math.floor(Math.random() * 5);

        const incidencias = [];
        if (cfg.tardeLate && d % 3 === 0) incidencias.push("entrada_tarde");
        if (cfg.exitEarly && d % 4 === 0) incidencias.push("salida_antes");
        if (improductivo > duracion * 0.3) incidencias.push("mucho_tiempo_improductivo");
        if (cfg.incidents >= 3) incidencias.push("muchas_incidencias");

        const estado = incidencias.length === 0 ? "completo" :
                       incidencias.includes("entrada_tarde") || incidencias.includes("mucho_tiempo_improductivo") ? "con_problemas" :
                       "incompleto";

        const rh = new Record(regHorCol);
        rh.set("operari", op.id);
        rh.set("fecha", fmt(day));
        rh.set("hora_entrada", entryHour);
        rh.set("hora_salida", exitHour);
        rh.set("duracion_jornada_min", duracion);
        rh.set("tiempo_productivo_min", productivo);
        rh.set("tiempo_improductivo_min", improductivo);
        rh.set("numero_exclusivas_completadas", excCompleted);
        rh.set("numero_operaciones_completadas", opsCompleted);
        rh.set("numero_reoperaciones", opIdx < 4 ? 0 : Math.floor(Math.random() * 2));
        rh.set("numero_incidencias_abiertas", cfg.incidents > 0 && d % 5 === 0 ? 1 : 0);
        rh.set("incidencias_horario", JSON.stringify(incidencias));
        rh.set("estado", estado);
        app.save(rh);
      }
    }

    // ─── 8. No Conformitats (30 incidents) ────────────────────────────────
    const ncCol = app.findCollectionByNameOrId("no_conformitats");
    const ncDefs = [
      // 15 quality incidents
      { codi:"INC-101", area:"confeccio",       descripcio:"Costura desalineada en costado derecho",          gravetat:"media",  origen:"onatex", estat:"tancada",      solucio:"Recosido y ajuste de guía de costura",             accio_preventiva:"Calibración semanal de máquina overlock" },
      { codi:"INC-102", area:"confeccio",       descripcio:"Hilo de overlock suelto en zona de axila",        gravetat:"alta",   origen:"onatex", estat:"en_seguiment", solucio:"Retreball zona afectada",                           accio_preventiva:"Revisión tensión hilo al inicio jornada" },
      { codi:"INC-103", area:"estampacion",     descripcio:"Estampado descentrado 3mm hacia la derecha",      gravetat:"baixa",  origen:"onatex", estat:"tancada",      solucio:"Ajuste de plantilla de posicionamiento",            accio_preventiva:"Marcar punto de referencia en mesa" },
      { codi:"INC-104", area:"acabats",         descripcio:"Cantonera mal adherida en escote trasero",        gravetat:"alta",   origen:"onatex", estat:"oberta",       solucio:"Pendiente retreball completo",                      accio_preventiva:"Verificar temperatura plancha antes de aplicar" },
      { codi:"INC-105", area:"confeccio",       descripcio:"Pespunte decorativo omitido en manga izquierda",  gravetat:"media",  origen:"onatex", estat:"tancada",      solucio:"Añadido pespunte faltante",                         accio_preventiva:"Checklist de operaciones obligatorias" },
      { codi:"INC-106", area:"estampacion",     descripcio:"Tinta corrida en número de dorsal",               gravetat:"critica",origen:"onatex", estat:"tancada",      solucio:"Pieza descartada y rehecha",                        accio_preventiva:"Control de temperatura y presión de prensa" },
      { codi:"INC-107", area:"confeccio",       descripcio:"Goma elástica con tensión insuficiente en cintura",gravetat:"alta",  origen:"onatex", estat:"en_seguiment", solucio:"Reemplazo de goma por lote correcto",               accio_preventiva:"Test de elasticidad por lote de gomas" },
      { codi:"INC-108", area:"acabats",         descripcio:"Etiqueta de talla mal posicionada",               gravetat:"baixa",  origen:"onatex", estat:"tancada",      solucio:"Reposición etiqueta en posición correcta",          accio_preventiva:"Jig de posicionamiento de etiquetas" },
      { codi:"INC-109", area:"confeccio",       descripcio:"Hombrera caída 5mm respecto a patron",            gravetat:"media",  origen:"onatex", estat:"tancada",      solucio:"Corrección de posición y recosido",                 accio_preventiva:"Plantilla de posición para hombreras" },
      { codi:"INC-110", area:"confeccio",       descripcio:"Pespunte doble faltante en entrepierna",          gravetat:"alta",   origen:"onatex", estat:"oberta",       solucio:"En proceso de retreball",                           accio_preventiva:"Verificación obligatoria en checklist QC" },
      { codi:"INC-111", area:"acabats",         descripcio:"Cremallera con deslizamiento duro",               gravetat:"media",  origen:"onatex", estat:"tancada",      solucio:"Lubricación y ajuste de cursor",                    accio_preventiva:"Test de cremallera antes de montaje" },
      { codi:"INC-112", area:"estampacion",     descripcio:"Sublimación con baja saturación en zona lateral",  gravetat:"media",  origen:"onatex", estat:"tancada",      solucio:"Reestampado de pieza",                              accio_preventiva:"Calibración cromática mensual" },
      { codi:"INC-113", area:"confeccio",       descripcio:"Descosido en unión lateral después de prueba",    gravetat:"alta",   origen:"onatex", estat:"en_seguiment", solucio:"Refuerzo de costura con segunda pasada",            accio_preventiva:"Prueba de tracción en costuras críticas" },
      { codi:"INC-114", area:"acabats",         descripcio:"Forro interior mal adherido en zona pectoral",    gravetat:"media",  origen:"onatex", estat:"tancada",      solucio:"Readhesión con prensa a temperatura correcta",      accio_preventiva:"Control diario de temperatura de prensa" },
      { codi:"INC-115", area:"confeccio",       descripcio:"Longitud de manga izquierda 8mm menor que patron",gravetat:"alta",   origen:"onatex", estat:"oberta",       solucio:"Requiere análisis de patron",                       accio_preventiva:"Medición de piezas antes de montaje" },
      // 10 production incidents
      { codi:"INC-201", area:"logistica",       descripcio:"Exclusiva sin hoja de ruta asignada",             gravetat:"alta",   origen:"onatex", estat:"tancada",      solucio:"Asignación manual de ruta R82-020",                 accio_preventiva:"Verificación automática al crear exclusiva" },
      { codi:"INC-202", area:"oficina_tecnica", descripcio:"Patron con error en medidas de escote",           gravetat:"critica",origen:"onatex", estat:"tancada",      solucio:"Corrección de patron y reimpresión",                accio_preventiva:"Validación de patron por responsable técnico" },
      { codi:"INC-203", area:"logistica",       descripcio:"Material llegado sin etiqueta de referencia",     gravetat:"baixa",  origen:"onatex", estat:"tancada",      solucio:"Identificación manual por albarán",                 accio_preventiva:"Protocolo de recepción con verificación" },
      { codi:"INC-204", area:"confeccio",       descripcio:"Operario sin formación para operación especial",  gravetat:"media",  origen:"onatex", estat:"tancada",      solucio:"Reasignación a operario cualificado",               accio_preventiva:"Matriz de competencias actualizada" },
      { codi:"INC-205", area:"estampacion",     descripcio:"Fallo de prensa de sublimación parada 2 horas",  gravetat:"critica",origen:"onatex", estat:"tancada",      solucio:"Reparación y replanificación de lotes",             accio_preventiva:"Mantenimiento preventivo mensual de prensas" },
      { codi:"INC-206", area:"logistica",       descripcio:"Entrega retrasada por falta de stock de gomas",  gravetat:"alta",   origen:"onatex", estat:"en_seguiment", solucio:"Pedido urgente a proveedor alternativo",            accio_preventiva:"Stock mínimo de 500u de goma estándar" },
      { codi:"INC-207", area:"oficina_tecnica", descripcio:"Ficha técnica con instrucciones incorrectas",     gravetat:"alta",   origen:"onatex", estat:"tancada",      solucio:"Corrección y redistribución de ficha",              accio_preventiva:"Revisión de fichas antes de inicio de lote" },
      { codi:"INC-208", area:"logistica",       descripcio:"Exclusiva asignada a ruta incorrecta",           gravetat:"media",  origen:"onatex", estat:"tancada",      solucio:"Reasignación manual a ruta correcta",               accio_preventiva:"Verificación de ruta al crear exclusiva" },
      { codi:"INC-209", area:"confeccio",       descripcio:"Máquina overlock sin mantenimiento 3 semanas",   gravetat:"media",  origen:"onatex", estat:"tancada",      solucio:"Mantenimiento correctivo realizado",                accio_preventiva:"Plan de mantenimiento semanal" },
      { codi:"INC-210", area:"acabats",         descripcio:"Plancha de vapor sin presión suficiente",        gravetat:"baixa",  origen:"onatex", estat:"tancada",      solucio:"Ajuste de presión y test",                          accio_preventiva:"Verificación de presión al inicio jornada" },
      // 5 client incidents
      { codi:"INC-301", area:"acabats",         descripcio:"Cliente reporta rasgado en costura lateral tras primer uso", gravetat:"critica",origen:"client", estat:"en_seguiment", solucio:"Pieza reemplazada, análisis de causa raíz iniciado", accio_preventiva:"Refuerzo obligatorio en costuras laterales de entrepierna" },
      { codi:"INC-302", area:"estampacion",     descripcio:"Estampado del dorsal se desprende tras primer lavado",      gravetat:"alta",   origen:"client", estat:"tancada",      solucio:"Pieza substituida, revisión de proceso de sublimación", accio_preventiva:"Test de lavado en muestras de cada lote" },
      { codi:"INC-303", area:"confeccio",       descripcio:"Talla entregada no coincide con talla solicitada",         gravetat:"alta",   origen:"client", estat:"tancada",      solucio:"Entrega de pieza correcta",                         accio_preventiva:"Verificación de talla en checklist final" },
      { codi:"INC-304", area:"acabats",         descripcio:"Cremallera se abre sola durante competición",              gravetat:"critica",origen:"client", estat:"en_seguiment", solucio:"Análisis de modelo de cremallera, reemplazo preventivo", accio_preventiva:"Cambio a cremallera con seguro de cursor" },
      { codi:"INC-305", area:"confeccio",       descripcio:"Costuras con picor excesivo en zona de cuello",            gravetat:"media",  origen:"client", estat:"tancada",      solucio:"Retreball de acabado interior de cuello",           accio_preventiva:"Material de forro hipoalergénico en zona cuello" },
    ];

    const excIdsCompleted = exclusivaRecords.filter(r => r.completed).map(r => r.exc.id);
    for (let i = 0; i < ncDefs.length; i++) {
      const nc = ncDefs[i];
      const excId = excIdsCompleted[i % excIdsCompleted.length];
      const opIdx = i % operarios.length;
      const daysBack = 1 + (i % 28);

      const rec = new Record(ncCol);
      rec.set("codi", nc.codi);
      rec.set("data_nc", fmt(daysAgo(daysBack)) + " 00:00:00.000Z");
      rec.set("exclusiva", excId);
      rec.set("area", nc.area);
      rec.set("descripcio", nc.descripcio);
      rec.set("proposta_millora", nc.accio_preventiva);
      rec.set("solucio_implantada", nc.solucio);
      rec.set("accio_preventiva", nc.accio_preventiva);
      rec.set("gravetat", nc.gravetat);
      rec.set("prioritat", nc.gravetat === "critica" ? "alta" : (nc.gravetat === "alta" ? "alta" : (nc.gravetat === "media" ? "media" : "baixa")));
      rec.set("estat", nc.estat);
      rec.set("origen", nc.origen);
      rec.set("operari_que_detecto", operarios[opIdx].id);
      if (nc.origen === "client") {
        rec.set("contacte_nom", ["Jordi Puig", "Marc Vidal", "Laura Font", "Anna Mas", "Pere Soler"][i % 5]);
        rec.set("contacte_telefon", `+34 6${String(10000000 + i * 13).slice(0,8)}`);
        rec.set("contacte_email", `client${i+1}@atletisme.cat`);
      }
      app.save(rec);
    }

    // ─── 9. Costes Mensuales (Agosto 2024) ────────────────────────────────
    const costesCol = app.findCollectionByNameOrId("costes_mensuales");
    let alreadyCostes = false;
    try {
      app.findFirstRecordByFilter("costes_mensuales", "mes = 8 && any = 2024");
      alreadyCostes = true;
    } catch (_) {}

    if (!alreadyCostes) {
      const costes = new Record(costesCol);
      costes.set("mes", 8);
      costes.set("any", 2024);
      costes.set("nomines", 12000);
      costes.set("costos_operacionals", 3000);
      costes.set("altres_costos", 1500);
      costes.set("total_costos", 16500);
      costes.set("ingressos_totals", 25000);
      costes.set("ingressos_per_article", JSON.stringify({
        "R82-020": { ingressos: 15000, exclusives: 30 },
        "R82-021": { ingressos: 10000, exclusives: 20 },
      }));
      costes.set("exclusives_vendes", JSON.stringify(
        Array.from({ length: 30 }, (_, i) => ({
          codi: `EXC-2024-${String(i+1).padStart(3,"0")}`,
          article: "R82-020",
          import: 500,
        })).concat(
          Array.from({ length: 20 }, (_, i) => ({
            codi: `EXC-2024-${String(i+31).padStart(3,"0")}`,
            article: "R82-021",
            import: 500,
          }))
        )
      ));
      costes.set("notes_costos", "Mes de agosto 2024. Incluye nóminas de 8 operarios + personal admin.");
      costes.set("notes_vendes", "30 exclusivas R82-020 y 20 exclusivas R82-021 entregadas en agosto.");
      app.save(costes);
    }

    // ─── 10. Forecast Recursos ────────────────────────────────────────────
    const forecastCol = app.findCollectionByNameOrId("forecast_recursos");
    let alreadyForecast = false;
    try {
      app.findFirstRecordByFilter("forecast_recursos", "exclusivas_pendientes = 20");
      alreadyForecast = true;
    } catch (_) {}

    if (!alreadyForecast) {
      const fc = new Record(forecastCol);
      fc.set("fecha_analisis", fmt(today));
      fc.set("rango_fechas", `${fmt(daysAhead(1))} — ${fmt(daysAhead(14))}`);
      fc.set("exclusivas_pendientes", 20);
      fc.set("minutos_totales_necesarios", 2400);
      fc.set("horas_totales_necesarias", 40);
      fc.set("operarios_disponibles", 5);
      fc.set("horas_dia", 8);
      fc.set("dias_laborables", 10);
      fc.set("capacidad_actual_horas", 400);
      fc.set("diferencia_horas", 360);
      fc.set("propuesta_seleccionada", "Capacidad actual suficiente. Margen de 360 horas disponibles.");
      fc.set("coste_estimado", 0);
      fc.set("estado", "a_tiempo");
      fc.set("notas", "20 exclusivas pendientes para las próximas 2 semanas. Con 5 operarios × 8h × 10 días = 400 horas disponibles vs 40 horas necesarias. Se puede cumplir sin problemas.");
      app.save(fc);
    }
  },
  (app) => {
    // Clean up seed data
    for (let i = 1; i <= 70; i++) {
      try {
        const exc = app.findFirstRecordByFilter("exclusives", `exclusiva = 'EXC-2024-${String(i).padStart(3,"0")}'`);
        app.delete(exc);
      } catch (_) {}
    }
    for (const codi of ["INC-101","INC-102","INC-103","INC-104","INC-105","INC-106","INC-107","INC-108","INC-109","INC-110",
                         "INC-111","INC-112","INC-113","INC-114","INC-115","INC-201","INC-202","INC-203","INC-204","INC-205",
                         "INC-206","INC-207","INC-208","INC-209","INC-210","INC-301","INC-302","INC-303","INC-304","INC-305"]) {
      try {
        const nc = app.findFirstRecordByFilter("no_conformitats", `codi = '${codi}'`);
        app.delete(nc);
      } catch (_) {}
    }
    try {
      const costes = app.findFirstRecordByFilter("costes_mensuales", "mes = 8 && any = 2024");
      app.delete(costes);
    } catch (_) {}
    try {
      const fc = app.findFirstRecordByFilter("forecast_recursos", "exclusivas_pendientes = 20");
      app.delete(fc);
    } catch (_) {}
  },
);

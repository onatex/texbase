/// <reference path="../pb_data/types.d.ts" />

// Fix UNIC-001 to UNIC-060 dependencies:
// - Fase 1: parallel preparation groups, each group starts available (op_anterior="")
// - Fase 2: sequential assembly, UNIC-036 depends on UNIC-035 (end of Fase 1)
// - Fase 3: sequential final assembly, UNIC-050 depends on UNIC-049 (end of Fase 2)

migrate(
  (app) => {
    // op_anterior for each UNIC operation
    // "" = no dependency (available from start)
    const depMap = {
      // ── Fase 1: Preparación paralela de componentes ──────────────────────
      // Group A: forro + cremallera line
      "UNIC-001": "",          // Unir forro — AVAILABLE
      "UNIC-003": "UNIC-001",  // Encarar forro y tejido
      "UNIC-004": "UNIC-003",  // Recortar forro
      "UNIC-005": "UNIC-004",  // Marcar posición cremallera
      "UNIC-006": "UNIC-005",  // Overlock donde va la cremallera
      // Group B: bolsillos (independent)
      "UNIC-002": "",          // Hacer bolsillos — AVAILABLE
      // Group C: espalda / tiro trasero line
      "UNIC-007": "",          // Hacer pinzas espalda — AVAILABLE
      "UNIC-008": "UNIC-007",  // Encarar forro espalda
      "UNIC-013": "UNIC-008",  // Unir tiro trasero
      "UNIC-014": "UNIC-013",  // Doble pespunte tiro trasero
      "UNIC-015": "UNIC-014",  // Unir pantalón con espalda
      "UNIC-016": "UNIC-015",  // Doble pespunte unión
      // Group D: piernas (independent)
      "UNIC-009": "",          // Encarar forro piernas — AVAILABLE
      // Group E: lumbar/canalé line (independent start)
      "UNIC-010": "",          // Pegar canalé lumbar — AVAILABLE
      "UNIC-011": "UNIC-010",  // Overlocar canalé
      "UNIC-012": "UNIC-011",  // Doble pespunte canalé
      // Group F: lumbar goma (independent)
      "UNIC-017": "",          // Preparar lumbar con goma — AVAILABLE
      // Group G: sisas forro line (independent)
      "UNIC-018": "",          // Unir y pespuntar sisas — AVAILABLE
      "UNIC-019": "UNIC-018",  // Encarar sisas
      // Group H: cuello velcro line (independent)
      "UNIC-020": "",          // Pegar velcro cuello — AVAILABLE
      "UNIC-021": "UNIC-020",  // Encarar no tejido y canalé cuello
      "UNIC-022": "UNIC-021",  // Unir canalé y tejido cuello
      // Group I: cinturón izquierdo line (independent)
      "UNIC-023": "",          // Pegar velcros cinturón izquierdo — AVAILABLE
      "UNIC-024": "UNIC-023",  // Cerrar cinturones y girarlos
      "UNIC-025": "UNIC-024",  // Doble pespunte cinturones
      // Group J: cinturón derecho (independent)
      "UNIC-026": "",          // Pegar velcros lado derecho — AVAILABLE
      // Group K: hombreras line (independent)
      "UNIC-027": "",          // Coser hombreras — AVAILABLE
      "UNIC-028": "UNIC-027",  // Pespuntear hombreras al canto
      // Group L: entrepierna (independent)
      "UNIC-029": "",          // Encarar canalé y forro entrepierna — AVAILABLE
      // Group M: mangas line (independent)
      "UNIC-030": "",          // Unir forros mangas al tejido — AVAILABLE
      "UNIC-031": "UNIC-030",  // Cerrar primera costura bajos manga
      "UNIC-032": "UNIC-031",  // Primer pespunte manga
      "UNIC-033": "UNIC-032",  // Cerrar segunda costura manga
      "UNIC-034": "UNIC-033",  // Pespunte manga
      "UNIC-035": "UNIC-034",  // Pegar puños ← END OF FASE 1

      // ── Fase 2: Ensamblaje principal (sequential) ──────────────────────
      "UNIC-036": "UNIC-035",  // Hacer dobladillos frentes ← depends on last of Fase 1
      "UNIC-037": "UNIC-036",  // Pegar etiquetas frente derecho
      "UNIC-038": "UNIC-037",  // Pegar cremallera frente derecho
      "UNIC-039": "UNIC-038",  // Pespunte cremallera
      "UNIC-040": "UNIC-039",  // Pespuntar al canto frente izquierdo
      "UNIC-041": "UNIC-040",  // Marcar cremallera para casar sublimados
      "UNIC-042": "UNIC-041",  // Pegar cremallera frente izquierdo
      "UNIC-043": "UNIC-042",  // Repunte de tapeta
      "UNIC-044": "UNIC-043",  // Cerrar tiro delantero
      "UNIC-045": "UNIC-044",  // Cerrar hombros
      "UNIC-046": "UNIC-045",  // Doble pespunte hombros
      "UNIC-047": "UNIC-046",  // Pegar el cuello
      "UNIC-048": "UNIC-047",  // Cerrar cuello y pespuntar contorno
      "UNIC-049": "UNIC-048",  // Marcar y pegar velcro cuello ← END OF FASE 2

      // ── Fase 3: Acabados finales (sequential) ──────────────────────────
      "UNIC-050": "UNIC-049",  // Cerrar laterales ← depends on last of Fase 2
      "UNIC-051": "UNIC-050",  // Pespuntes laterales
      "UNIC-052": "UNIC-051",  // Pegar sisas del tejido
      "UNIC-053": "UNIC-052",  // Pespuntear sisas al canto
      "UNIC-054": "UNIC-053",  // Pegar canalé forrado a sisa
      "UNIC-055": "UNIC-054",  // Overlock
      "UNIC-056": "UNIC-055",  // Repunte sisas doble pasada
      "UNIC-057": "UNIC-056",  // Pegar mangas
      "UNIC-058": "UNIC-057",  // Cerrar entrepierna
      "UNIC-059": "UNIC-058",  // Pegar puños pantalón
      "UNIC-060": "UNIC-059",  // Carga a pata entrepierna
    };

    // Operations that are "parallel" entry points (no predecessor = available at start of their phase group)
    const parallelOps = new Set([
      "UNIC-001", "UNIC-002", "UNIC-007", "UNIC-009", "UNIC-010",
      "UNIC-017", "UNIC-018", "UNIC-020", "UNIC-023", "UNIC-026",
      "UNIC-027", "UNIC-029", "UNIC-030",
    ]);

    for (const rutaNom of ["Ruta R82-020 UNIC PLUS SUIT", "Ruta R82-021 UNIC PLUS SUIT"]) {
      let rutes;
      try {
        rutes = app.findRecordsByFilter("rutes", `nom = '${rutaNom}'`, "", 1, 0);
      } catch (_) { continue; }
      if (!rutes || rutes.length === 0) continue;
      const rutaId = rutes[0].id;

      let ops;
      try {
        ops = app.findRecordsByFilter("operacions_def", `ruta = '${rutaId}'`, "", 500, 0);
      } catch (_) { continue; }

      for (const op of ops) {
        const codi = op.getString("codi");
        if (!(codi in depMap)) continue;
        op.set("op_anterior", depMap[codi]);
        op.set("paralel", parallelOps.has(codi));
        app.save(op);
      }
    }
  },
  (app) => {
    // Restore all ops to linear sequential (previous behavior)
    for (const rutaNom of ["Ruta R82-020 UNIC PLUS SUIT", "Ruta R82-021 UNIC PLUS SUIT"]) {
      let rutes;
      try {
        rutes = app.findRecordsByFilter("rutes", `nom = '${rutaNom}'`, "", 1, 0);
      } catch (_) { continue; }
      if (!rutes || rutes.length === 0) continue;
      const rutaId = rutes[0].id;

      let ops;
      try {
        ops = app.findRecordsByFilter("operacions_def", `ruta = '${rutaId}'`, "", 500, 0);
      } catch (_) { continue; }

      // Sort by ordre and restore linear deps
      ops.sort((a, b) => a.getInt("ordre") - b.getInt("ordre"));
      for (let i = 0; i < ops.length; i++) {
        const prev = i > 0 ? ops[i - 1].getString("codi") : "";
        ops[i].set("op_anterior", prev);
        ops[i].set("paralel", false);
        app.save(ops[i]);
      }
    }
  }
);

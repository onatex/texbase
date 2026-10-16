/// <reference path="../pb_data/types.d.ts" />

// Public endpoint: GET /api/cliente/stats
// No authentication required — returns only non-sensitive production metrics
routerAdd("GET", "/api/cliente/stats", (e) => {
  // newQuery().all() necesita un destino tipado; sin él falla con
  // "Invalid variable type: must be a pointer" y el panel quedaba a cero.
  const query = (sql, shape) => {
    const rows = arrayOf(new DynamicModel(shape));
    $app.db().newQuery(sql).all(rows);
    return rows;
  };
  try {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    // Week start (Monday)
    const dow = now.getDay();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
    const weekStartStr = weekStart.toISOString().slice(0, 10);

    // Month start
    const monthStartStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    // ── Exclusives counts ──────────────────────────────────────────────────
    let totalExclusives = 0, inProcess = 0, pending = 0, readyToDeliver = 0;
    let completedToday = 0, completedWeek = 0, completedMonth = 0;
    let articlesMap = {};

    try {
      const rows = query(`
        SELECT estat, article, date(updated) as upd
        FROM exclusives
      `, { estat: "", article: "", upd: "" });

      for (const r of rows) {
        const estat = r.rawColumnValue ? r.rawColumnValue("estat") : (r["estat"] || "");
        const article = r.rawColumnValue ? r.rawColumnValue("article") : (r["article"] || "Desconegut");
        const upd = r.rawColumnValue ? r.rawColumnValue("upd") : (r["upd"] || "");

        totalExclusives++;

        if (estat === "en_curs") inProcess++;
        if (estat === "pendent" || estat === "recibida") pending++;
        if (estat === "lista_recollida") readyToDeliver++;

        if (estat === "finalitzada" || estat === "entregada") {
          if (upd >= todayStr) completedToday++;
          if (upd >= weekStartStr) completedWeek++;
          if (upd >= monthStartStr) completedMonth++;
        }

        if (estat === "en_curs" && article) {
          articlesMap[article] = (articlesMap[article] || 0) + 1;
        }
      }
    } catch (err) {
      $app.logger().warn("cliente-stats exclusives query failed", "err", String(err));
    }

    // ── Non-conformities ──────────────────────────────────────────────────
    let ncOpen = 0, ncClosed = 0;
    try {
      const ncRows = query(`
        SELECT estat FROM no_conformitats
      `, { estat: "" });
      for (const r of ncRows) {
        const estat = r.rawColumnValue ? r.rawColumnValue("estat") : (r["estat"] || "");
        if (estat === "tancada") ncClosed++;
        else ncOpen++;
      }
    } catch (_) {}

    // ── Avg production time (minutes) ─────────────────────────────────────
    let avgMinutes = 0;
    try {
      const tRows = query(`
        SELECT IFNULL(AVG(temps_real_seg), 0) as avg_seg FROM registres WHERE estat = 'finalitzat' AND temps_real_seg > 0
      `, { avg_seg: -0 });
      if (tRows.length > 0) {
        const v = tRows[0].rawColumnValue ? tRows[0].rawColumnValue("avg_seg") : (tRows[0]["avg_seg"] || 0);
        avgMinutes = Math.round((parseFloat(v) || 0) / 60);
      }
    } catch (_) {}

    // ── Upcoming deliveries with hours remaining & phase ──────────────────
    const next7 = new Date(now);
    next7.setDate(now.getDate() + 7);
    const next7Str = next7.toISOString().slice(0, 10);

    let upcoming = [];
    try {
      const upRows = query(`
        SELECT id, exclusiva, article, data_entrega, estat, prioritat, ruta
        FROM exclusives
        WHERE data_entrega != '' AND data_entrega >= '${todayStr}' AND data_entrega <= '${next7Str}'
          AND estat NOT IN ('entregada','finalitzada')
        ORDER BY data_entrega ASC
        LIMIT 20
      `, { id: "", exclusiva: "", article: "", data_entrega: "", estat: "", prioritat: "", ruta: "" });

      for (const r of upRows) {
        const excId = r.rawColumnValue ? r.rawColumnValue("id") : (r["id"] || "");
        const exclCode = r.rawColumnValue ? r.rawColumnValue("exclusiva") : (r["exclusiva"] || "");
        const article = r.rawColumnValue ? r.rawColumnValue("article") : (r["article"] || "");
        const dataEntrega = r.rawColumnValue ? r.rawColumnValue("data_entrega") : (r["data_entrega"] || "");
        const estat = r.rawColumnValue ? r.rawColumnValue("estat") : (r["estat"] || "");
        const prioritat = r.rawColumnValue ? r.rawColumnValue("prioritat") : (r["prioritat"] || "");
        const rutaId = r.rawColumnValue ? r.rawColumnValue("ruta") : (r["ruta"] || "");

        // Get all operations for this ruta with standard times and phases
        let totalOps = 0;
        let completedOps = 0;
        let totalStdMin = 0;
        let pendingStdMin = 0;
        let currentPhase = "";
        let totalPhases = 0;
        let currentOp = "";

        try {
          // Get all monos for this exclusiva
          const monoRows = query(`
            SELECT id FROM monos WHERE exclusiva = '${excId}'
          `, { id: "" });
          const monoIds = monoRows.map(m => m.rawColumnValue ? m.rawColumnValue("id") : (m["id"] || ""));

          if (rutaId) {
            // Get operation definitions for this ruta
            const opRows = query(`
              SELECT codi, nom, fase, ordre, temps_std_min, fase_ordre
              FROM operacions_def
              WHERE ruta = '${rutaId}' AND actiu = 1
              ORDER BY ordre ASC
            `, { codi: "", nom: "", fase: "", ordre: -0, temps_std_min: -0, fase_ordre: -0 });

            totalOps = opRows.length;

            // Count distinct phases
            const phases = new Set();
            for (const op of opRows) {
              const f = op.rawColumnValue ? op.rawColumnValue("fase") : (op["fase"] || "");
              if (f) phases.add(f);
              const t = parseFloat(op.rawColumnValue ? op.rawColumnValue("temps_std_min") : (op["temps_std_min"] || 0)) || 0;
              totalStdMin += t;
            }
            totalPhases = phases.size || 1;

            // Get completed operations (finalitzat + ok) for any mono of this exclusiva
            let completedNoms = new Set();
            let enCursNoms = new Set();
            if (monoIds.length > 0) {
              const monoIdList = monoIds.map(id => `'${id}'`).join(",");
              const regRows = query(`
                SELECT operacio, estat, control_qualitat FROM registres
                WHERE mono IN (${monoIdList})
              `, { operacio: "", estat: "", control_qualitat: "" });
              for (const reg of regRows) {
                const regEstat = reg.rawColumnValue ? reg.rawColumnValue("estat") : (reg["estat"] || "");
                const regCQ = reg.rawColumnValue ? reg.rawColumnValue("control_qualitat") : (reg["control_qualitat"] || "");
                const regOp = reg.rawColumnValue ? reg.rawColumnValue("operacio") : (reg["operacio"] || "");
                if (regEstat === "finalitzat" && regCQ === "ok") completedNoms.add(regOp);
                if (regEstat === "en_curs" || regEstat === "pausat") {
                  enCursNoms.add(regOp);
                  currentOp = regOp;
                }
              }
            }

            completedOps = completedNoms.size;

            // Calculate pending time
            for (const op of opRows) {
              const nom = op.rawColumnValue ? op.rawColumnValue("nom") : (op["nom"] || "");
              const t = parseFloat(op.rawColumnValue ? op.rawColumnValue("temps_std_min") : (op["temps_std_min"] || 0)) || 0;
              if (!completedNoms.has(nom)) {
                pendingStdMin += t;
              }
            }

            // Determine current phase
            let lastCompletedPhase = "";
            for (const op of opRows) {
              const nom = op.rawColumnValue ? op.rawColumnValue("nom") : (op["nom"] || "");
              const fase = op.rawColumnValue ? op.rawColumnValue("fase") : (op["fase"] || "");
              if (completedNoms.has(nom)) lastCompletedPhase = fase;
            }

            // Find current active phase (first incomplete op's phase)
            for (const op of opRows) {
              const nom = op.rawColumnValue ? op.rawColumnValue("nom") : (op["nom"] || "");
              const fase = op.rawColumnValue ? op.rawColumnValue("fase") : (op["fase"] || "");
              if (!completedNoms.has(nom)) {
                currentPhase = fase || "Fase 1";
                break;
              }
            }
            if (!currentPhase) currentPhase = lastCompletedPhase || "Fase 1";
          }
        } catch (opErr) {
          $app.logger().warn("cliente-stats op calc failed", "err", String(opErr));
        }

        // Apply 20% buffer
        const hoursRemaining = (pendingStdMin * 1.20) / 60;

        // Delivery prediction
        // Work hours: 7:00–15:30 = 8.5h, cutoff for same-day = 14:45
        const nowHour = now.getHours() + now.getMinutes() / 60;
        const WORK_START = 7.0;
        const WORK_END = 15.5;
        const CUTOFF = 14.75; // 14:45
        const WORK_HOURS_PER_DAY = WORK_END - WORK_START; // 8.5

        let effectiveHoursRemaining = hoursRemaining;
        let hoursAvailableToday = 0;
        let deliveryDays = 0;

        if (nowHour < WORK_START) {
          // Before work hours — full day available
          hoursAvailableToday = WORK_HOURS_PER_DAY;
        } else if (nowHour >= WORK_END || nowHour >= CUTOFF) {
          // After cutoff — cannot deliver today
          hoursAvailableToday = 0;
        } else {
          hoursAvailableToday = CUTOFF - nowHour; // hours until cutoff
        }

        let deliveryStatus = "on_time";
        if (totalOps > 0 && completedOps >= totalOps) {
          deliveryStatus = "ready";
          deliveryDays = 0;
        } else if (hoursAvailableToday >= effectiveHoursRemaining && effectiveHoursRemaining > 0) {
          deliveryStatus = "today";
          deliveryDays = 0;
        } else {
          // Calculate how many additional days needed
          effectiveHoursRemaining -= hoursAvailableToday;
          deliveryDays = Math.ceil(effectiveHoursRemaining / WORK_HOURS_PER_DAY);
          if (deliveryDays <= 1) {
            deliveryStatus = "tomorrow";
          } else if (deliveryDays <= 3) {
            deliveryStatus = "days";
          } else {
            deliveryStatus = "critical";
          }
        }

        // Check if original delivery date is exceeded
        if (dataEntrega && dataEntrega < todayStr) {
          deliveryStatus = "critical";
        }

        // Phase number from phase name (extract number if "Fase X")
        let phaseNum = 1;
        const phaseMatch = (currentPhase || "").match(/(\d+)/);
        if (phaseMatch) phaseNum = parseInt(phaseMatch[1]);

        // NC count for this exclusiva
        let ncCount = 0;
        try {
          const ncRow = query(`
            SELECT COUNT(*) as cnt FROM no_conformitats WHERE exclusiva = '${excId}' AND estat != 'tancada'
          `, { cnt: 0 });
          if (ncRow.length > 0) {
            const v = ncRow[0].rawColumnValue ? ncRow[0].rawColumnValue("cnt") : (ncRow[0]["cnt"] || 0);
            ncCount = parseInt(v) || 0;
          }
        } catch (_) {}

        upcoming.push({
          exclusiva: exclCode,
          article: article,
          data_entrega: dataEntrega,
          estat: estat,
          prioritat: prioritat,
          currentPhase: currentPhase || "Fase 1",
          phaseNum: phaseNum,
          totalPhases: totalPhases || 1,
          completedOps: completedOps,
          totalOps: totalOps,
          hoursRemaining: Math.round(hoursRemaining * 100) / 100,
          pendingMinutes: Math.round(pendingStdMin * 1.20),
          deliveryStatus: deliveryStatus,
          deliveryDays: deliveryDays,
          currentOp: currentOp,
          ncCount: ncCount,
        });
      }
    } catch (err) {
      $app.logger().warn("cliente-stats upcoming failed", "err", String(err));
    }

    // ── 7-day completion history ──────────────────────────────────────────
    let history = [];
    try {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const dStr = d.toISOString().slice(0, 10);
        const rows = query(`
          SELECT COUNT(*) as cnt FROM exclusives
          WHERE (estat = 'finalitzada' OR estat = 'entregada') AND date(updated) = '${dStr}'
        `, { cnt: 0 });
        let cnt = 0;
        if (rows.length > 0) {
          const v = rows[0].rawColumnValue ? rows[0].rawColumnValue("cnt") : (rows[0]["cnt"] || 0);
          cnt = parseInt(v) || 0;
        }
        history.push({ date: dStr, completed: cnt });
      }
    } catch (_) {}

    e.json(200, {
      timestamp: now.toISOString(),
      totalExclusives,
      inProcess,
      pending,
      readyToDeliver,
      completedToday,
      completedWeek,
      completedMonth,
      ncOpen,
      ncClosed,
      avgMinutes,
      articlesInProduction: articlesMap,
      upcomingDeliveries: upcoming,
      history,
    });
  } catch (err) {
    $app.logger().error("cliente-stats error", "err", String(err));
    e.json(500, { error: "Internal error" });
  }
});

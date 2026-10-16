/// <reference path="../pb_data/types.d.ts" />

// Auto-transición a Calidad:
// Cuando todas las unidades (monos) de una exclusiva tienen terminadas todas
// sus fases de confección y no hay retrabajos pendientes/en proceso, la
// exclusiva pasa automáticamente a "pendiente_calidad" para que el operario
// de Calidad sepa que está lista para iniciar su control.
//
// - Cuenta correctamente el total de monos/unidades configurados y el progreso
//   real por mono y fase. Una unidad se considera terminada si:
//     • mono.estat = "finalitzat", O
//     • tiene registros finalitzats (con QC ok/aprovat/pendent o sin QC) que
//       cubren TODAS las fases esperadas del artículo (Fase 1/2/3, o también
//       Fase 4 solo para CIK R84-053/R84-054).
// - Solo transita desde estados de confección (recibida, pendent, en_curs,
//   retrasada). Nunca toca estados gestionados por Calidad.
// - Si se reabre una unidad o queda un retrabajo pendiente, retira la
//   exclusiva de "pendiente_calidad" y la devuelve a "en_curs".
// - No marca como aprobada ni como lista para recoger: eso lo hace Calidad.
// - No borra ni modifica operaciones, monos, tiempos, pausas, calidad,
//   retrabajos ni historial.
//
// IMPORTANTE (JSVM): PocketBase recompila cada handler de hook en un VM
// aislado, por lo que las funciones/constantes declaradas en el nivel superior
// del archivo NO son visibles dentro de los callbacks. Por eso cada callback
// lleva su propia copia autocontenida de los helpers (mismo patrón que
// auto-close-paused-delivered.pb.js). Antes estaban en el top-level y lanzaban
// "ReferenceError: syncExclusivaCalidad is not defined" al crear/actualizar
// monos, lo que rompía la transición a Calidad y la actualización de
// mono.estat (y por tanto el apartado de Calidad del Dashboard en vivo).

// 1) Al actualizar un mono: reevalúa su exclusiva.
onRecordAfterUpdateSuccess(function (e) {
  var CONFECTION_ESTATS = ["recibida", "pendent", "en_curs", "retrasada"];
  var CIK_REFS = ["R84-053", "R84-054"];
  var FASES_BASE = ["Fase 1", "Fase 2", "Fase 3"];
  var FASES_CIK = ["Fase 1", "Fase 2", "Fase 3", "Fase 4"];

  function norm(s) { return String(s || "").trim().toUpperCase(); }

  function canonFase(f) {
    var m = String(f || "").match(/fase\s*(\d+)/i);
    var n = m ? Number(m[1]) : null;
    return (n >= 1 && n <= 4) ? "Fase " + n : (f || "Sin fase");
  }

  function isCikExclusiva(exclusiva) {
    if (CIK_REFS.indexOf(norm(exclusiva.get("referencia"))) !== -1) return true;
    if (norm(exclusiva.get("marca")).indexOf("CIK") !== -1) return true;
    var art = norm(exclusiva.get("article"));
    if (art.indexOf("R84-053") !== -1 || art.indexOf("R84-054") !== -1) return true;
    return false;
  }

  function monoFasesCompletades(monoId, expectedFases) {
    try {
      var regs = $app.findRecordsByFilter("registres", 'mono = "' + monoId + '"');
      var done = {};
      for (var j = 0; j < regs.length; j++) {
        var r = regs[j];
        if (String(r.get("estat") || "") !== "finalitzat") continue;
        var qc = r.get("control_qualitat");
        if (qc && qc !== "ok" && qc !== "aprovat" && qc !== "pendent") continue;
        var f = canonFase(r.get("operacio"));
        if (f && f.indexOf("Fase ") === 0) done[f] = true;
      }
      for (var k = 0; k < expectedFases.length; k++) {
        if (!done[expectedFases[k]]) return false;
      }
      return true;
    } catch (err) {
      return false;
    }
  }

  function monoDone(mono, expectedFases) {
    if (String(mono.get("estat") || "") === "finalitzat") return true;
    return monoFasesCompletades(mono.id, expectedFases);
  }

  function syncByEx(exId) {
    try {
      if (!exId) return;
      var exclusiva = $app.findRecordById("exclusives", exId);
      var unitats = Number(exclusiva.get("unitats")) || 0;
      var estat = String(exclusiva.get("estat") || "");
      var expected = isCikExclusiva(exclusiva) ? FASES_CIK : FASES_BASE;
      var monos = $app.findRecordsByFilter("monos", 'exclusiva = "' + exId + '"');
      var doneCount = 0;
      for (var i = 0; i < monos.length; i++) {
        if (monoDone(monos[i], expected)) doneCount++;
      }
      var retrPendents = 0;
      try {
        var retrs = $app.findRecordsByFilter(
          "retrabajos",
          'exclusiva = "' + exId + '" && (estado = "pendiente" || estado = "en_proceso")',
        );
        retrPendents = retrs.length;
      } catch (err2) {}

      var allDone = monos.length > 0
        && doneCount === monos.length
        && (unitats <= 0 || doneCount >= unitats)
        && retrPendents === 0;

      if (allDone && CONFECTION_ESTATS.indexOf(estat) !== -1) {
        exclusiva.set("estat", "pendiente_calidad");
        $app.save(exclusiva);
      } else if (!allDone && estat === "pendiente_calidad") {
        exclusiva.set("estat", "en_curs");
        $app.save(exclusiva);
      }
    } catch (err) {
      $app.logger().error("auto-pendiente-calidad", "err", String(err));
    }
  }

  try {
    var mono = e.record;
    if (!mono) { e.next(); return; }
    var rawEx = mono.get("exclusiva");
    if (!rawEx) { e.next(); return; }
    var exId = "";
    if (typeof rawEx === "string") exId = rawEx;
    else if (rawEx && rawEx.id) exId = rawEx.id;
    else exId = String(rawEx);
    syncByEx(exId);
  } catch (err) {
    $app.logger().error("auto-pendiente-calidad-mono", "err", String(err));
  }
  e.next();
}, "monos");

// 2) Al crear un mono: reevalúa su exclusiva.
onRecordAfterCreateSuccess(function (e) {
  var CONFECTION_ESTATS = ["recibida", "pendent", "en_curs", "retrasada"];
  var CIK_REFS = ["R84-053", "R84-054"];
  var FASES_BASE = ["Fase 1", "Fase 2", "Fase 3"];
  var FASES_CIK = ["Fase 1", "Fase 2", "Fase 3", "Fase 4"];

  function norm(s) { return String(s || "").trim().toUpperCase(); }

  function canonFase(f) {
    var m = String(f || "").match(/fase\s*(\d+)/i);
    var n = m ? Number(m[1]) : null;
    return (n >= 1 && n <= 4) ? "Fase " + n : (f || "Sin fase");
  }

  function isCikExclusiva(exclusiva) {
    if (CIK_REFS.indexOf(norm(exclusiva.get("referencia"))) !== -1) return true;
    if (norm(exclusiva.get("marca")).indexOf("CIK") !== -1) return true;
    var art = norm(exclusiva.get("article"));
    if (art.indexOf("R84-053") !== -1 || art.indexOf("R84-054") !== -1) return true;
    return false;
  }

  function monoFasesCompletades(monoId, expectedFases) {
    try {
      var regs = $app.findRecordsByFilter("registres", 'mono = "' + monoId + '"');
      var done = {};
      for (var j = 0; j < regs.length; j++) {
        var r = regs[j];
        if (String(r.get("estat") || "") !== "finalitzat") continue;
        var qc = r.get("control_qualitat");
        if (qc && qc !== "ok" && qc !== "aprovat" && qc !== "pendent") continue;
        var f = canonFase(r.get("operacio"));
        if (f && f.indexOf("Fase ") === 0) done[f] = true;
      }
      for (var k = 0; k < expectedFases.length; k++) {
        if (!done[expectedFases[k]]) return false;
      }
      return true;
    } catch (err) {
      return false;
    }
  }

  function monoDone(mono, expectedFases) {
    if (String(mono.get("estat") || "") === "finalitzat") return true;
    return monoFasesCompletades(mono.id, expectedFases);
  }

  function syncByEx(exId) {
    try {
      if (!exId) return;
      var exclusiva = $app.findRecordById("exclusives", exId);
      var unitats = Number(exclusiva.get("unitats")) || 0;
      var estat = String(exclusiva.get("estat") || "");
      var expected = isCikExclusiva(exclusiva) ? FASES_CIK : FASES_BASE;
      var monos = $app.findRecordsByFilter("monos", 'exclusiva = "' + exId + '"');
      var doneCount = 0;
      for (var i = 0; i < monos.length; i++) {
        if (monoDone(monos[i], expected)) doneCount++;
      }
      var retrPendents = 0;
      try {
        var retrs = $app.findRecordsByFilter(
          "retrabajos",
          'exclusiva = "' + exId + '" && (estado = "pendiente" || estado = "en_proceso")',
        );
        retrPendents = retrs.length;
      } catch (err2) {}

      var allDone = monos.length > 0
        && doneCount === monos.length
        && (unitats <= 0 || doneCount >= unitats)
        && retrPendents === 0;

      if (allDone && CONFECTION_ESTATS.indexOf(estat) !== -1) {
        exclusiva.set("estat", "pendiente_calidad");
        $app.save(exclusiva);
      } else if (!allDone && estat === "pendiente_calidad") {
        exclusiva.set("estat", "en_curs");
        $app.save(exclusiva);
      }
    } catch (err) {
      $app.logger().error("auto-pendiente-calidad", "err", String(err));
    }
  }

  try {
    var mono = e.record;
    if (!mono) { e.next(); return; }
    var rawEx = mono.get("exclusiva");
    if (!rawEx) { e.next(); return; }
    var exId = "";
    if (typeof rawEx === "string") exId = rawEx;
    else if (rawEx && rawEx.id) exId = rawEx.id;
    else exId = String(rawEx);
    syncByEx(exId);
  } catch (err) {
    $app.logger().error("auto-pendiente-calidad-mono", "err", String(err));
  }
  e.next();
}, "monos");

// 3) Al finalizar un registro de fase: reevalúa la exclusiva aunque el mono
//    no se haya actualizado, para que pueda transitar a pendiente_calidad.
onRecordAfterUpdateSuccess(function (e) {
  var CONFECTION_ESTATS = ["recibida", "pendent", "en_curs", "retrasada"];
  var CIK_REFS = ["R84-053", "R84-054"];
  var FASES_BASE = ["Fase 1", "Fase 2", "Fase 3"];
  var FASES_CIK = ["Fase 1", "Fase 2", "Fase 3", "Fase 4"];

  function norm(s) { return String(s || "").trim().toUpperCase(); }

  function canonFase(f) {
    var m = String(f || "").match(/fase\s*(\d+)/i);
    var n = m ? Number(m[1]) : null;
    return (n >= 1 && n <= 4) ? "Fase " + n : (f || "Sin fase");
  }

  function isCikExclusiva(exclusiva) {
    if (CIK_REFS.indexOf(norm(exclusiva.get("referencia"))) !== -1) return true;
    if (norm(exclusiva.get("marca")).indexOf("CIK") !== -1) return true;
    var art = norm(exclusiva.get("article"));
    if (art.indexOf("R84-053") !== -1 || art.indexOf("R84-054") !== -1) return true;
    return false;
  }

  function monoFasesCompletades(monoId, expectedFases) {
    try {
      var regs = $app.findRecordsByFilter("registres", 'mono = "' + monoId + '"');
      var done = {};
      for (var j = 0; j < regs.length; j++) {
        var r = regs[j];
        if (String(r.get("estat") || "") !== "finalitzat") continue;
        var qc = r.get("control_qualitat");
        if (qc && qc !== "ok" && qc !== "aprovat" && qc !== "pendent") continue;
        var f = canonFase(r.get("operacio"));
        if (f && f.indexOf("Fase ") === 0) done[f] = true;
      }
      for (var k = 0; k < expectedFases.length; k++) {
        if (!done[expectedFases[k]]) return false;
      }
      return true;
    } catch (err) {
      return false;
    }
  }

  function monoDone(mono, expectedFases) {
    if (String(mono.get("estat") || "") === "finalitzat") return true;
    return monoFasesCompletades(mono.id, expectedFases);
  }

  function syncByEx(exId) {
    try {
      if (!exId) return;
      var exclusiva = $app.findRecordById("exclusives", exId);
      var unitats = Number(exclusiva.get("unitats")) || 0;
      var estat = String(exclusiva.get("estat") || "");
      var expected = isCikExclusiva(exclusiva) ? FASES_CIK : FASES_BASE;
      var monos = $app.findRecordsByFilter("monos", 'exclusiva = "' + exId + '"');
      var doneCount = 0;
      for (var i = 0; i < monos.length; i++) {
        if (monoDone(monos[i], expected)) doneCount++;
      }
      var retrPendents = 0;
      try {
        var retrs = $app.findRecordsByFilter(
          "retrabajos",
          'exclusiva = "' + exId + '" && (estado = "pendiente" || estado = "en_proceso")',
        );
        retrPendents = retrs.length;
      } catch (err2) {}

      var allDone = monos.length > 0
        && doneCount === monos.length
        && (unitats <= 0 || doneCount >= unitats)
        && retrPendents === 0;

      if (allDone && CONFECTION_ESTATS.indexOf(estat) !== -1) {
        exclusiva.set("estat", "pendiente_calidad");
        $app.save(exclusiva);
      } else if (!allDone && estat === "pendiente_calidad") {
        exclusiva.set("estat", "en_curs");
        $app.save(exclusiva);
      }
    } catch (err) {
      $app.logger().error("auto-pendiente-calidad", "err", String(err));
    }
  }

  try {
    var r = e.record;
    if (String(r.get("estat") || "") === "finalitzat") {
      var exId = r.get("exclusiva");
      if (!exId) {
        var monoId = r.get("mono");
        if (monoId) {
          try {
            if (typeof monoId === "object" && monoId.id) monoId = monoId.id;
            var mono = $app.findRecordById("monos", String(monoId));
            exId = mono.get("exclusiva");
          } catch (_) {}
        }
      }
      if (exId) {
        if (typeof exId === "object" && exId.id) exId = exId.id;
        syncByEx(String(exId));
      }
    }
  } catch (err) {
    $app.logger().error("auto-pendiente-calidad-registre", "err", String(err));
  }
  e.next();
}, "registres");

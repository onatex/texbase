/// <reference path="../pb_data/types.d.ts" />

// Revisión automática de operaciones pausadas cuando la exclusiva ya está
// entregada.
//
// PocketBase no permite consultar la base de datos durante onBootstrap (el
// DB aún no está inicializado y provoca un panic del proceso Go), por lo que
// esta revisión se ejecuta de forma reactiva, segura y trazable, en dos
// momentos:
//
//  1. Cuando una exclusiva pasa a "entregada" (onRecordAfterUpdateSuccess
//     sobre "exclusives"): se cierran de inmediato todos sus registros
//     pausados, sin esperar a un barrido nocturno.
//  2. Cuando un registro (registre) se crea o actualiza y está pausado
//     (estat = "pausat"): se comprueba su exclusiva y, si ya está entregada,
//     se cierra automáticamente. Esto cubre el caso de operaciones que se
//     pausan después de que la exclusiva ya se hubiera entregado.
//
// Estos eventos se disparan durante el funcionamiento normal y también al
// reanudar la actividad tras un reinicio nocturno de la plataforma, por lo
// que la revisión actúa de forma equivalente al barrido nocturno solicitado
// sin arriesgar la estabilidad del servicio.
//
// Reglas de seguridad:
//  - Solo se cierran registros pausados cuya exclusiva esté entregada.
//  - No se alteran operaciones de exclusivas no entregadas.
//  - No se borran tiempos, pausas, historial, incidencias, retrabajos ni
//    controles de calidad. El tiempo productivo acumulado (temps_real_seg)
//    se conserva tal cual; solo se congela el estado y se añade la nota de
//    cierre automático.
//  - No se aprueba Calidad ni se marca nada como listo para recoger: eso
//    sigue siendo manual.
//  - Cada actuación automática se registra en `notes` del registro y en el
//    log de PocketBase para mantener la trazabilidad.
//
// NOTA: PocketBase ejecuta cada callback de hook en un scope JSVM aislado,
// por eso toda la lógica y constantes van definidas DENTRO de cada callback.
//
// 4) Revisión DIARIA programada (cron a las 03:00): barrido de TODOS los
//    registros pausados. Si la exclusiva correspondiente ya está entregada,
//    el registro se cierra como terminado de forma automática y trazable.
//    Es la red de seguridad de los triggers reactivos: cubre cualquier caso
//    que se haya podido escapar (hook fallido, registro pausado sin evento
//    posterior, etc.). Mismas reglas de seguridad: no se borran tiempos,
//    pausas ni historial; no se aprueba Calidad; cada cierre se anota en
//    `notes` y se registra en el log.

cronAdd("auto-close-paused-delivered", "0 3 * * *", function () {
  var NOTE_PREFIX = "[Cierre automático] ";
  function nowISO() {
    return new Date().toISOString().replace("T", " ").substring(0, 19);
  }
  function resolveExclusivaId(r) {
    try {
      var rawEx = r.get("exclusiva");
      if (rawEx) {
        if (typeof rawEx === "string") return rawEx;
        if (rawEx && rawEx.id) return rawEx.id;
        return String(rawEx);
      }
      var monoId = r.get("mono");
      if (monoId) {
        if (typeof monoId === "object" && monoId.id) monoId = monoId.id;
        var mono = $app.findRecordById("monos", String(monoId));
        var mEx = mono.get("exclusiva");
        if (mEx) {
          if (typeof mEx === "string") return mEx;
          if (mEx && mEx.id) return mEx.id;
          return String(mEx);
        }
      }
    } catch (_) {}
    return "";
  }
  try {
    var regs = $app.findRecordsByFilter("registres", 'estat = "pausat"');
    var tancats = 0;
    for (var i = 0; i < regs.length; i++) {
      var r = regs[i];
      var exId = resolveExclusivaId(r);
      if (!exId) continue;
      var ex;
      try {
        ex = $app.findRecordById("exclusives", exId);
      } catch (_) {
        continue;
      }
      var estat = String(ex.get("estat") || "").toLowerCase().trim();
      if (estat !== "entregada") continue;
      var notesActuals = String(r.get("notes") || "");
      if (notesActuals.indexOf(NOTE_PREFIX) !== -1) continue;
      var notaAuto = NOTE_PREFIX +
        "Revisión diaria: exclusiva entregada — cierre automático de operación pausada (" +
        nowISO() + ").";
      r.set("estat", "finalitzat");
      if (!r.get("fi")) r.set("fi", new Date());
      r.set("notes", notesActuals ? notesActuals + "\n" + notaAuto : notaAuto);
      $app.save(r);
      tancats++;
      $app.logger().info(
        "auto-close-paused-delivered",
        "exclusiva", String(ex.get("exclusiva") || exId),
        "registre", r.id,
        "operacio", String(r.get("operacio") || ""),
        "motiu", "cron-diari",
      );
    }
    $app.logger().info(
      "auto-close-paused-delivered",
      "motiu", "cron-diari",
      "revisats", regs.length,
      "tancats", tancats,
    );
  } catch (err) {
    $app.logger().error("auto-close-paused-delivered", "cron-diari", String(err));
  }
});

// 1) Cuando una exclusiva pasa a "entregada", cierra sus registros pausados.
onRecordAfterUpdateSuccess(function (e) {
  var NOTE_PREFIX = "[Cierre automático] ";
  function nowISO() {
    return new Date().toISOString().replace("T", " ").substring(0, 19);
  }
  try {
    var ex = e.record;
    var estat = String(ex.get("estat") || "").toLowerCase().trim();
    if (estat !== "entregada") {
      e.next();
      return;
    }
    var exId = ex.id;
    var exCodi = String(ex.get("exclusiva") || "");
    var regs = $app.findRecordsByFilter(
      "registres",
      'exclusiva = "' + exId + '" && estat = "pausat"',
    );
    var tancats = 0;
    for (var i = 0; i < regs.length; i++) {
      var r = regs[i];
      var notaAuto = NOTE_PREFIX +
        "Exclusiva marcada como entregada — cierre automático de operaciones pausadas (" +
        nowISO() + ").";
      var notesActuals = String(r.get("notes") || "");
      if (notesActuals.indexOf(NOTE_PREFIX) !== -1) continue;
      r.set("estat", "finalitzat");
      if (!r.get("fi")) r.set("fi", new Date());
      r.set("notes", notesActuals ? notesActuals + "\n" + notaAuto : notaAuto);
      $app.save(r);
      tancats++;
      $app.logger().info(
        "auto-close-paused-delivered",
        "exclusiva", exCodi || exId,
        "registre", r.id,
        "operacio", String(r.get("operacio") || ""),
        "motiu", "entregada-reactivo",
      );
    }
    if (tancats > 0) {
      $app.logger().info(
        "auto-close-paused-delivered",
        "exclusiva", exCodi || exId,
        "tancats", tancats,
      );
    }
  } catch (err) {
    $app.logger().error("auto-close-paused-delivered", "reactiu", String(err));
  }
  e.next();
}, "exclusives");

// 2) Cuando un registro pausado se actualiza, comprueba su exclusiva y la
//    cierra si la exclusiva ya está entregada.
onRecordAfterUpdateSuccess(function (e) {
  var NOTE_PREFIX = "[Cierre automático] ";
  function nowISO() {
    return new Date().toISOString().replace("T", " ").substring(0, 19);
  }
  try {
    var r = e.record;
    if (String(r.get("estat") || "") !== "pausat") {
      e.next();
      return;
    }
    // Resolver id de exclusiva (directo o vía mono).
    var exId = "";
    try {
      var rawEx = r.get("exclusiva");
      if (rawEx) {
        if (typeof rawEx === "string") exId = rawEx;
        else if (rawEx && rawEx.id) exId = rawEx.id;
        else exId = String(rawEx);
      }
      if (!exId) {
        var monoId = r.get("mono");
        if (monoId) {
          if (typeof monoId === "object" && monoId.id) monoId = monoId.id;
          var mono = $app.findRecordById("monos", String(monoId));
          var mEx = mono.get("exclusiva");
          if (mEx) {
            if (typeof mEx === "string") exId = mEx;
            else if (mEx && mEx.id) exId = mEx.id;
            else exId = String(mEx);
          }
        }
      }
    } catch (_) {
      exId = "";
    }
    if (!exId) {
      e.next();
      return;
    }
    var ex = $app.findRecordById("exclusives", exId);
    var estat = String(ex.get("estat") || "").toLowerCase().trim();
    if (estat !== "entregada") {
      e.next();
      return;
    }
    var notaAuto = NOTE_PREFIX +
      "Exclusiva entregada — cierre automático de operación pausada (" +
      nowISO() + ").";
    var notesActuals = String(r.get("notes") || "");
    if (notesActuals.indexOf(NOTE_PREFIX) !== -1) {
      e.next();
      return;
    }
    r.set("estat", "finalitzat");
    if (!r.get("fi")) r.set("fi", new Date());
    r.set("notes", notesActuals ? notesActuals + "\n" + notaAuto : notaAuto);
    $app.save(r);
    $app.logger().info(
      "auto-close-paused-delivered",
      "exclusiva", String(ex.get("exclusiva") || exId),
      "registre", r.id,
      "operacio", String(r.get("operacio") || ""),
      "motiu", "registre-pausat-entregada",
    );
  } catch (err) {
    $app.logger().error("auto-close-paused-delivered", "registre", String(err));
  }
  e.next();
}, "registres");

// 3) Cuando un registro pausado se crea, comprueba su exclusiva y la cierra
//    si la exclusiva ya está entregada.
onRecordAfterCreateSuccess(function (e) {
  var NOTE_PREFIX = "[Cierre automático] ";
  function nowISO() {
    return new Date().toISOString().replace("T", " ").substring(0, 19);
  }
  try {
    var r = e.record;
    if (String(r.get("estat") || "") !== "pausat") {
      e.next();
      return;
    }
    var exId = "";
    try {
      var rawEx = r.get("exclusiva");
      if (rawEx) {
        if (typeof rawEx === "string") exId = rawEx;
        else if (rawEx && rawEx.id) exId = rawEx.id;
        else exId = String(rawEx);
      }
      if (!exId) {
        var monoId = r.get("mono");
        if (monoId) {
          if (typeof monoId === "object" && monoId.id) monoId = monoId.id;
          var mono = $app.findRecordById("monos", String(monoId));
          var mEx = mono.get("exclusiva");
          if (mEx) {
            if (typeof mEx === "string") exId = mEx;
            else if (mEx && mEx.id) exId = mEx.id;
            else exId = String(mEx);
          }
        }
      }
    } catch (_) {
      exId = "";
    }
    if (!exId) {
      e.next();
      return;
    }
    var ex = $app.findRecordById("exclusives", exId);
    var estat = String(ex.get("estat") || "").toLowerCase().trim();
    if (estat !== "entregada") {
      e.next();
      return;
    }
    var notaAuto = NOTE_PREFIX +
      "Exclusiva entregada — cierre automático de operación pausada (" +
      nowISO() + ").";
    var notesActuals = String(r.get("notes") || "");
    if (notesActuals.indexOf(NOTE_PREFIX) !== -1) {
      e.next();
      return;
    }
    r.set("estat", "finalitzat");
    if (!r.get("fi")) r.set("fi", new Date());
    r.set("notes", notesActuals ? notesActuals + "\n" + notaAuto : notaAuto);
    $app.save(r);
    $app.logger().info(
      "auto-close-paused-delivered",
      "exclusiva", String(ex.get("exclusiva") || exId),
      "registre", r.id,
      "operacio", String(r.get("operacio") || ""),
      "motiu", "registre-creat-entregada",
    );
  } catch (err) {
    $app.logger().error("auto-close-paused-delivered", "registre-create", String(err));
  }
  e.next();
}, "registres");

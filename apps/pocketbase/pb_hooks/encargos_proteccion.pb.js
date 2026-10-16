/// <reference path="../pb_data/types.d.ts" />

// ── Impedir asignaciones activas incompatibles (misma fase + unidad) ─────────
// Al crear un encargo, si ya existe otro encargo ACTIVO (no validado/cerrado)
// para el mismo proveedor + exclusiva cuyas fases y unidades se solapan, se
// rechaza. Las reparaciones (es_reparacion=true) se permiten.
onRecordCreateRequest((e) => {
  // Los campos JSON llegan como JSONRaw (texto); algunos registros antiguos
  // guardan el JSON doblemente codificado (una cadena con el array dentro).
  const jsonArray = (raw) => {
    try {
      let v = JSON.parse(String(raw || "[]"));
      if (typeof v === "string") v = JSON.parse(v);
      return Array.isArray(v) ? v : [];
    } catch (_) {
      return [];
    }
  };
  const rec = e.record;
  if (!rec) { e.next(); return; }
  if (rec.get("es_reparacion")) { e.next(); return; }

  const provId = rec.getString("proveedor_id");
  const excId = rec.getString("exclusiva_id");
  if (!provId || !excId) { e.next(); return; }

  const nuevasFases = jsonArray(rec.getString("fases"));
  const nuevasFaseSet = new Set((nuevasFases || []).map((f) => (f.fase || f.nombre_fase || "").toString().trim().toLowerCase()).filter(Boolean));

  const nuevosMonosSet = new Set(rec.getStringSlice("monos"));

  const ACTIVOS = "estado != 'validado' && estado != 'parcialmente_validado' && estado != 'cerrado'";
  let existentes = [];
  try {
    existentes = e.app.findRecordsByFilter(
      "encargos_externos",
      "proveedor_id = {:prov} && exclusiva_id = {:exc} && (" + ACTIVOS + ")",
      "", 0, 0,
      { prov: provId, exc: excId },
    );
  } catch (_) { e.next(); return; }

  for (const ex of existentes) {
    if (ex.get("es_reparacion")) continue;
    const fasesEx = jsonArray(ex.getString("fases"));
    const fasesExSet = new Set((fasesEx || []).map((f) => (f.fase || f.nombre_fase || "").toString().trim().toLowerCase()).filter(Boolean));
    let solapaFase = false;
    for (const f of nuevasFaseSet) { if (fasesExSet.has(f)) { solapaFase = true; break; } }
    if (!solapaFase) continue;

    const monosExSet = new Set(ex.getStringSlice("monos"));
    let solapaMono = false;
    for (const m of nuevosMonosSet) { if (monosExSet.has(m)) { solapaMono = true; break; } }
    if (solapaMono) {
      throw new BadRequestError(
        "Ya existe un encargo activo para esta fase y unidad con este proveedor. " +
        "Cierra o valida el encargo existente antes de crear uno nuevo, o márcalo como reparación.",
      );
    }
  }
  e.next();
}, "encargos_externos");

// ── Sincronizar importe_validado y estado al validar ─────────────────────────
// Se ejecuta en cada actualización. Recalcula importe_validado a partir de las
// unidades aceptadas (sin IVA, redondeo a céntimos). Solo promueve el estado a
// validado/parcialmente_validado cuando hay unidades aceptadas y el estado
// actual no es ya cerrado (no degrada un encargo ya cerrado).
onRecordUpdateRequest((e) => {
  // Los campos JSON llegan como JSONRaw (texto); algunos registros antiguos
  // guardan el JSON doblemente codificado (una cadena con el array dentro).
  const jsonArray = (raw) => {
    try {
      let v = JSON.parse(String(raw || "[]"));
      if (typeof v === "string") v = JSON.parse(v);
      return Array.isArray(v) ? v : [];
    } catch (_) {
      return [];
    }
  };
  const rec = e.record;
  if (!rec) { e.next(); return; }

  const tipo = rec.getString("tipo_precio") || "por_fase";
  const precio = Number(rec.get("precio_unitario") || 0);
  const numFases = Math.max(1, jsonArray(rec.getString("fases")).length);
  const nAceptadas = jsonArray(rec.getString("unidades_aceptadas")).length;

  let importe = 0;
  if (tipo === "paquete") {
    importe = nAceptadas * precio;
  } else {
    importe = nAceptadas * numFases * precio;
  }
  importe = Math.round(importe * 100) / 100;
  rec.set("importe_validado", importe);

  const rechazadas = jsonArray(rec.getString("unidades_rechazadas"));
  const totalUnidades = rec.getStringSlice("monos").length;
  const est = rec.getString("estado");

  if (nAceptadas > 0 && rechazadas.length === 0 && nAceptadas >= totalUnidades && totalUnidades > 0) {
    if (est !== "cerrado") {
      rec.set("estado", "validado");
      if (!rec.getString("fecha_validacion")) rec.set("fecha_validacion", new Date().toISOString().slice(0, 10));
    }
  } else if (nAceptadas > 0) {
    if (est !== "validado" && est !== "cerrado") {
      rec.set("estado", "parcialmente_validado");
      if (!rec.getString("fecha_validacion")) rec.set("fecha_validacion", new Date().toISOString().slice(0, 10));
    }
  }
  e.next();
}, "encargos_externos");

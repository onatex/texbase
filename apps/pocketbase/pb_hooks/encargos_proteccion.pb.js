/// <reference path="../pb_data/types.d.ts" />

// ── Impedir asignaciones activas incompatibles (misma fase + unidad) ─────────
// Al crear un encargo, si ya existe otro encargo ACTIVO (no validado/cerrado)
// para el mismo proveedor + exclusiva cuyas fases y unidades se solapan, se
// rechaza. Las reparaciones (es_reparacion=true) se permiten.
onRecordCreateRequest((e) => {
  const rec = e.record;
  if (!rec) { e.next(); return; }
  if (rec.get("es_reparacion")) { e.next(); return; }

  const provId = rec.get("proveedor_id");
  const excId = rec.get("exclusiva_id");
  if (!provId || !excId) { e.next(); return; }

  let nuevasFases = [];
  try { nuevasFases = JSON.parse(rec.get("fases") || "[]"); } catch (_) {}
  const nuevasFaseSet = new Set((nuevasFases || []).map((f) => (f.fase || f.nombre_fase || "").toString().trim().toLowerCase()).filter(Boolean));

  const nuevosMonos = rec.get("monos");
  const nuevosMonosSet = new Set(Array.isArray(nuevosMonos) ? nuevosMonos : []);

  const ACTIVOS = "estado != 'validado' && estado != 'parcialmente_validado' && estado != 'cerrado'";
  let existentes = [];
  try {
    existentes = $app.findRecordsByFilter(
      "encargos_externos",
      'proveedor_id = "' + provId + '" && exclusiva_id = "' + excId + '" && (' + ACTIVOS + ")",
    );
  } catch (_) { e.next(); return; }

  for (const ex of existentes) {
    if (ex.get("es_reparacion")) continue;
    let fasesEx = [];
    try { fasesEx = JSON.parse(ex.get("fases") || "[]"); } catch (_) {}
    const fasesExSet = new Set((fasesEx || []).map((f) => (f.fase || f.nombre_fase || "").toString().trim().toLowerCase()).filter(Boolean));
    let solapaFase = false;
    for (const f of nuevasFaseSet) { if (fasesExSet.has(f)) { solapaFase = true; break; } }
    if (!solapaFase) continue;

    const monosEx = ex.get("monos");
    const monosExSet = new Set(Array.isArray(monosEx) ? monosEx : []);
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
  const rec = e.record;
  if (!rec) { e.next(); return; }

  const tipo = rec.get("tipo_precio") || "por_fase";
  const precio = Number(rec.get("precio_unitario") || 0);
  let fases = [];
  try { fases = JSON.parse(rec.get("fases") || "[]"); } catch (_) {}
  const numFases = Math.max(1, (fases || []).length);
  let aceptadas = [];
  try { aceptadas = JSON.parse(rec.get("unidades_aceptadas") || "[]"); } catch (_) {}
  const nAceptadas = (aceptadas || []).length;

  let importe = 0;
  if (tipo === "paquete") {
    importe = nAceptadas * precio;
  } else {
    importe = nAceptadas * numFases * precio;
  }
  importe = Math.round(importe * 100) / 100;
  rec.set("importe_validado", importe);

  let rechazadas = [];
  try { rechazadas = JSON.parse(rec.get("unidades_rechazadas") || "[]"); } catch (_) {}
  const totalUnidades = (rec.get("monos") || []).length;
  const est = rec.get("estado");

  if (nAceptadas > 0 && rechazadas.length === 0 && nAceptadas >= totalUnidades && totalUnidades > 0) {
    if (est !== "cerrado") {
      rec.set("estado", "validado");
      if (!rec.get("fecha_validacion")) rec.set("fecha_validacion", new Date().toISOString().slice(0, 10));
    }
  } else if (nAceptadas > 0) {
    if (est !== "validado" && est !== "cerrado") {
      rec.set("estado", "parcialmente_validado");
      if (!rec.get("fecha_validacion")) rec.set("fecha_validacion", new Date().toISOString().slice(0, 10));
    }
  }
  e.next();
}, "encargos_externos");

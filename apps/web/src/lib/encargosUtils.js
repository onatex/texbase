// ── Utilidades del módulo unificado de encargos externos ─────────────────────
// Fuente única de verdad para etiquetas de estado, flujo operativo, cálculo de
// importes y métricas mensuales (Europe/Madrid). Usado por el panel interno y
// por el portal del proveedor.
import { expectedFasesForExclusiva } from './fasesUtils';

// Los campos JSON (fases, unidades_aceptadas...) llegan de PocketBase ya como
// arrays; los registros antiguos pueden traer el JSON como texto.
export function jsonArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v !== 'string' || !v) return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : jsonArray(typeof parsed === 'string' ? parsed : null);
  } catch (_) {
    return [];
  }
}

export const ESTADO_LABEL = {
  preparado: 'Preparado',
  enviado: 'Enviado',
  recibido: 'Recibido por proveedor',
  en_confeccion: 'En confección',
  listo_recoger: 'Listo para recoger',
  recogido: 'Recogido por Onatex',
  llegada_onatex: 'Llegada a Onatex',
  validado: 'Validado',
  parcialmente_validado: 'Parcialmente validado',
  con_incidencias: 'Con incidencias',
  reparacion: 'En reparación',
  cerrado: 'Cerrado',
};

export const ESTADO_COLOR = {
  preparado: 'bg-secondary text-secondary-foreground',
  enviado: 'bg-blue-100 text-blue-800',
  recibido: 'bg-indigo-100 text-indigo-800',
  en_confeccion: 'bg-[hsl(var(--warn))]/20 text-[hsl(var(--warn))]',
  listo_recoger: 'bg-amber-100 text-amber-800',
  recogido: 'bg-cyan-100 text-cyan-800',
  llegada_onatex: 'bg-teal-100 text-teal-800',
  validado: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]',
  parcialmente_validado: 'bg-[hsl(var(--accent))]/15 text-[hsl(var(--accent))]',
  con_incidencias: 'bg-destructive/10 text-destructive',
  reparacion: 'bg-orange-100 text-orange-800',
  cerrado: 'bg-secondary text-muted-foreground',
};

// Bandejas del proveedor (agrupación lógica de estados).
export const BANDEJA = {
  recepcion: ['enviado'],
  confeccion: ['recibido', 'en_confeccion'],
  listo: ['listo_recoger'],
  validacion: ['recogido', 'llegada_onatex', 'parcialmente_validado'],
  // incidencias e historial se calculan aparte
};

// Estados que el proveedor puede aplicar (transiciones permitidas).
export const PROVIDER_NEXT = {
  enviado: ['recibido'],
  recibido: ['en_confeccion', 'listo_recoger'],
  en_confeccion: ['listo_recoger'],
  listo_recoger: [], // espera a Onatex
};

// Estados que producción/internos pueden aplicar.
export const INTERNAL_NEXT = {
  preparado: ['enviado'],
  enviado: ['recibido', 'en_confeccion', 'listo_recoger', 'recogido'],
  recibido: ['en_confeccion', 'listo_recoger', 'recogido'],
  en_confeccion: ['listo_recoger', 'recogido'],
  listo_recoger: ['recogido'],
  recogido: ['llegada_onatex', 'validado', 'parcialmente_validado', 'con_incidencias'],
  llegada_onatex: ['validado', 'parcialmente_validado', 'con_incidencias'],
  parcialmente_validado: ['validado', 'con_incidencias', 'reparacion'],
  con_incidencias: ['reparacion', 'validado', 'cerrado'],
  reparacion: ['enviado', 'validado', 'cerrado'],
  validado: ['cerrado'],
  cerrado: [],
};

export const ESTADOS_ACTIVOS = new Set([
  'preparado', 'enviado', 'recibido', 'en_confeccion', 'listo_recoger',
  'recogido', 'llegada_onatex', 'parcialmente_validado', 'con_incidencias', 'reparacion',
]);
export const ESTADOS_CERRADOS = new Set(['validado', 'cerrado']);

/** Fases canónicas disponibles para una exclusiva (Fase 1/2/3, +4 si CIK). */
export function fasesDisponibles(exclusiva, articles = []) {
  return expectedFasesForExclusiva(exclusiva, articles);
}

/** Importe encargado (snapshot al crear). Sin IVA. */
export function calcularImporteEncargado(tipoPrecio, precioUnitario, numUnidades, numFases) {
  const u = Math.max(0, numUnidades || 0);
  const f = Math.max(1, numFases || 1);
  const p = Number(precioUnitario) || 0;
  const imp = tipoPrecio === 'paquete' ? u * p : u * f * p;
  return Math.round(imp * 100) / 100;
}

/** Importe validado según unidades aceptadas. Sin IVA. */
export function calcularImporteValidado(tipoPrecio, precioUnitario, numAceptadas, numFases) {
  const u = Math.max(0, numAceptadas || 0);
  const f = Math.max(1, numFases || 1);
  const p = Number(precioUnitario) || 0;
  const imp = tipoPrecio === 'paquete' ? u * p : u * f * p;
  return Math.round(imp * 100) / 100;
}

/** Importe pendiente de validar: trabajo terminado/recibido sin aceptar.
 *  Excluye lo pendiente de reparar. */
export function esPendienteValidar(enc) {
  return ['listo_recoger', 'recogido', 'llegada_onatex', 'parcialmente_validado'].includes(enc.estado);
}

/** ¿Importe generado (aceptado por Onatex)? Según fecha de validación. */
export function esGenerado(enc) {
  return enc.estado === 'validado' || enc.estado === 'cerrado' || enc.estado === 'parcialmente_validado';
}

// ── Fechas mensuales en Europe/Madrid ────────────────────────────────────────
// Madrid = UTC+1 (invierno) / UTC+2 (verano). Aproximamos con offset fijo +60min
// en invierno y +120 en verano (DST último domingo de marzo a último de octubre).
function madridOffsetMinutes(date) {
  const d = new Date(date);
  const year = d.getUTCFullYear();
  // Último domingo de marzo y de octubre (inicio/fin DST EU).
  const lastSunday = (y, m) => { const x = new Date(Date.UTC(y, m + 1, 0)); x.setUTCDate(x.getUTCDate() - x.getUTCDay()); return x; };
  const start = lastSunday(year, 2); // marzo
  const end = lastSunday(year, 9);  // octubre
  const t = d.getTime();
  const inDST = t >= start.getTime() && t < end.getTime();
  return inDST ? 120 : 60;
}

/** Convierte una fecha (ISO/date-only/datetime) a {y, m} en hora de Madrid. */
export function ymMadrid(dateVal) {
  if (!dateVal) return null;
  const d = new Date(dateVal);
  if (Number.isNaN(d.getTime())) return null;
  const mad = new Date(d.getTime() + madridOffsetMinutes(d) * 60000);
  return { y: mad.getUTCFullYear(), m: mad.getUTCMonth() + 1 };
}

/** ¿La fecha cae en el mes/año indicado (hora Madrid)? */
export function enMesMadrid(dateVal, mes, any) {
  const ym = ymMadrid(dateVal);
  if (!ym) return false;
  return ym.m === mes && ym.y === any;
}

/** "YYYY-MM" actual en Madrid. */
export function mesActualMadrid() {
  const ym = ymMadrid(new Date());
  return `${ym.y}-${String(ym.m).padStart(2, '0')}`;
}

export function euro(n) {
  const v = Number(n || 0);
  return v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDate(d) {
  if (!d) return '—';
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split('-');
  if (!y || !m || !day) return s;
  return `${day}/${m}/${y}`;
}

/** Métricas mensuales del proveedor a partir de su lista de encargos.
 *  - importeGenerado: suma del trabajo aceptado, según fecha de validación.
 *  - pendienteValidar: terminado/recibido sin aceptar (excluye reparación).
 *  - exclusivasRealizadas: exclusivas con TODO el alcance aceptado (sin duplicar).
 *  - unidadesRealizadas: unidades distintas con trabajo validado (sin duplicar).
 *  - pendientesConfeccion: exclusivas/unidades aún no terminadas.
 *  - listasRecoger: unidades en listo_recoger.
 *  - retrasos: encargos con fecha_devolucion_comprometida < hoy y no validados.
 */
export function metricasMensuales(encargos, mes, any) {
  const enMes = encargos.filter((e) => {
    const f = e.fecha_validacion || e.fecha_listo || e.fecha_recepcion || e.fecha_envio_real || e.created;
    return enMesMadrid(f, mes, any);
  });

  let importeGenerado = 0;
  let pendienteValidar = 0;
  const excRealizadas = new Set();
  const udsRealizadas = new Set();
  const excPendientes = new Set();
  const udsPendientes = new Set();
  let udsListas = 0;
  let retrasos = 0;
  const hoy = new Date().toISOString().slice(0, 10);

  for (const e of encargos) {
    const uds = (e.monos || []).length;
    const aceptadas = (e.unidades_aceptadas || []).length;
    // Importe generado: validado en este mes.
    if ((e.estado === 'validado' || e.estado === 'cerrado') && enMesMadrid(e.fecha_validacion, mes, any)) {
      importeGenerado += Number(e.importe_validado || 0);
      excRealizadas.add(e.exclusiva_id);
      (e.unidades_aceptadas || []).forEach((u) => udsRealizadas.add(`${e.exclusiva_id}:${u}`));
    }
    // Parcialmente validado: cuenta lo aceptado como generado.
    if (e.estado === 'parcialmente_validado' && enMesMadrid(e.fecha_validacion, mes, any)) {
      importeGenerado += Number(e.importe_validado || 0);
      (e.unidades_aceptadas || []).forEach((u) => udsRealizadas.add(`${e.exclusiva_id}:${u}`));
    }
    // Pendiente de validar: terminado/recibido sin aceptar, excluye reparación.
    if (esPendienteValidar(e) && e.estado !== 'reparacion') {
      const f = e.fecha_listo || e.fecha_recepcion || e.fecha_envio_real || e.created;
      if (enMesMadrid(f, mes, any)) {
        const tipo = e.tipo_precio || 'por_fase';
        const fases = jsonArray(e.fases);
        pendienteValidar += calcularImporteValidado(tipo, e.precio_unitario, uds, fases.length);
      }
    }
    // Pendientes de confección (activos, no listos).
    if (['preparado', 'enviado', 'recibido', 'en_confeccion'].includes(e.estado)) {
      excPendientes.add(e.exclusiva_id);
      (e.monos || []).forEach((u) => udsPendientes.add(`${e.exclusiva_id}:${u}`));
    }
    // Listas para recoger.
    if (e.estado === 'listo_recoger') udsListas += uds;
    // Retrasos.
    if (e.fecha_devolucion_comprometida && e.fecha_devolucion_comprometida < hoy && !['validado', 'cerrado'].includes(e.estado)) {
      retrasos += 1;
    }
  }

  return {
    importeGenerado: Math.round(importeGenerado * 100) / 100,
    pendienteValidar: Math.round(pendienteValidar * 100) / 100,
    exclusivasRealizadas: excRealizadas.size,
    unidadesRealizadas: udsRealizadas.size,
    exclusivasPendientes: excPendientes.size,
    unidadesPendientes: udsPendientes.size,
    unidadesListas: udsListas,
    retrasos,
  };
}

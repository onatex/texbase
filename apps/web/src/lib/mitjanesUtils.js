/**
 * Utilidades canónicas para las medias por operario/fase/marca y por marca.
 *
 * Reglas de cálculo (compartidas por Informe de tiempos, Dashboard en vivo
 * y cronómetro del operario):
 *  - Tiempo productivo: segonsProductiusRegistre (sin pausas).
 *  - Pausas excluidas del tiempo productivo.
 *  - Registros con tiempo total (productivo + parada) > 8 horas excluidos.
 *    8 horas exactas (28800 s) SÍ se incluyen.
 *  - Solo registros finalitzat / en_curs / pausat.
 *  - Periodo: por defecto los últimos 7 días (media "semanal" rodante), que
 *    se actualiza sola a medida que entran nuevos registros. No se borra
 *    histórico ni se alteran tiempos originales: todo se calcula a partir de
 *    los registros existentes.
 */

import { canonFase, faseOrdre } from '@/lib/fasesUtils';
import { segonsProductiusRegistre, segonsParadaRegistre } from '@/lib/operacionsUtils';

export const UMBRAL_HORAS_EXCLUSIO = 8;
export const UMBRAL_SEGONS_EXCLUSIO = UMBRAL_HORAS_EXCLUSIO * 3600;

/** Ventana por defecto para la media semanal rodante (7 días). */
export const DIES_SETMANA = 7;

/** Construye un mapa nom -> operació_def para resolución de fase. */
export function buildOpsByNom(opsDef) {
    const m = {};
    (opsDef || []).forEach((op) => { if (op.nom) m[op.nom] = op; });
    return m;
}

/** Resuelve la fase canónica de un registro ("Fase 1".."Fase 4", "Trabajo libre", "Sin fase"). */
export function resoldreFaseReg(r, opsByNom = {}) {
    if (!r) return 'Sin fase';
    if (r.tipus === 'lliure') return 'Trabajo libre';
    if (/^fase\s*\d+$/i.test(r.operacio || '')) return canonFase(r.operacio);
    const op = opsByNom[r.operacio];
    return canonFase(op?.fase || 'Sin fase');
}

/** Resuelve la marca de un registro a partir de su exclusiva expandida. */
export function resoldreMarcaReg(r) {
    if (!r) return '';
    const ex = r.expand?.exclusiva || (typeof r.exclusiva === 'object' ? r.exclusiva : null);
    return ex?.marca ? String(ex.marca).trim() : '';
}

/** Devuelve el id de operario de un registro. */
export function operariIdReg(r) {
    if (!r) return '';
    return r.expand?.operari?.id || r.operari || '';
}

/** Devuelve el id de exclusiva de un registro (string). */
export function exclusivaIdReg(r) {
    if (!r) return '';
    const raw = r.exclusiva || r.expand?.exclusiva?.id;
    if (!raw) return '';
    return typeof raw === 'string' ? raw : raw?.id || '';
}

/**
 * Filtra los registros válidos para calcular medias dentro de un periodo.
 * Aplica las reglas de exclusión (>8h, estados válidos, rango por inici).
 */
export function registresValids(registres, { startMs = null, endMs = null, nowMs = Date.now() } = {}) {
    return (registres || []).filter((r) => {
        if (!r || !r.inici) return false;
        const t = new Date(r.inici).getTime();
        if (Number.isNaN(t)) return false;
        if (startMs != null && t < startMs) return false;
        if (endMs != null && t > endMs) return false;
        if (r.estat !== 'finalitzat' && r.estat !== 'en_curs' && r.estat !== 'pausat') return false;
        const prod = segonsProductiusRegistre(r, nowMs);
        const parada = segonsParadaRegistre(r);
        const total = (prod || 0) + (parada || 0);
        if (total > UMBRAL_SEGONS_EXCLUSIO) return false;
        return true;
    });
}

/**
 * Enriquece los registros válidos con { _fase, _marca, _productiu, _operariId, _exclusivaId }
 * para que las funciones de media no tengan que recalcularlos.
 */
export function enriquirRegistres(valids, opsByNom = {}, nowMs = Date.now()) {
    return (valids || []).map((r) => ({
        ...r,
        _fase: resoldreFaseReg(r, opsByNom),
        _marca: resoldreMarcaReg(r),
        _productiu: segonsProductiusRegistre(r, nowMs),
        _operariId: operariIdReg(r),
        _exclusivaId: exclusivaIdReg(r),
    }));
}

/**
 * Media de tiempo productivo de un operario para una fase + marca.
 * Prioriza la combinación operario+fase+marca; si no hay registros
 * suficientes para esa marca, cae a operario+fase (cualquier marca).
 *
 * @returns {{ mitjana: number, n: number, marca: string } | null}
 *   null cuando no hay ningún registro calculable ("Sin datos").
 */
export function mitjanaOperariFaseMarca(enriched, operariId, fase, marca) {
    if (!operariId || !fase) return null;
    const faseCanon = canonFase(fase);
    let rows = (enriched || []).filter(
        (r) => r._operariId === operariId && r._fase === faseCanon && marca && r._marca === marca,
    );
    let usedMarca = marca;
    if (rows.length === 0) {
        rows = (enriched || []).filter(
            (r) => r._operariId === operariId && r._fase === faseCanon,
        );
        usedMarca = rows.length ? (rows[0]._marca || marca) : marca;
    }
    if (rows.length === 0) return null;
    const sum = rows.reduce((a, r) => a + (Number(r._productiu) || 0), 0);
    return { mitjana: Math.round(sum / rows.length), n: rows.length, marca: usedMarca };
}

/**
 * Medias por marca: para cada marca, la media de tiempo productivo por fase,
 * el sumatorio total (suma del productivo de todas las fases de la marca en
 * el periodo), la media total, el número de registros utilizados y el número
 * de exclusivas distintas.
 *
 * El "Sumatorio total" y las medias se calculan SOBRE los registros válidos
 * incluidos en el periodo/filtros pasados a `registresValids`+`enriquirRegistres`.
 */
export function mitjanesPerMarca(enriched) {
    const map = new Map();
    for (const r of (enriched || [])) {
        const marca = r._marca || 'Sin marca';
        if (!map.has(marca)) {
            map.set(marca, { marca, fases: new Map(), productiuTotal: 0, nTotal: 0, exclusives: new Set() });
        }
        const m = map.get(marca);
        const f = m.fases.get(r._fase) || { fase: r._fase, productiu: 0, n: 0 };
        f.productiu += Number(r._productiu) || 0;
        f.n += 1;
        m.fases.set(r._fase, f);
        m.productiuTotal += Number(r._productiu) || 0;
        m.nTotal += 1;
        if (r._exclusivaId) m.exclusives.add(r._exclusivaId);
    }
    return Array.from(map.values())
        .map((m) => ({
            marca: m.marca,
            fases: Array.from(m.fases.values())
                .map((f) => ({ fase: f.fase, productiu: f.productiu, n: f.n, mitjana: f.n ? Math.round(f.productiu / f.n) : 0 }))
                .sort((a, b) => faseOrdre(a.fase) - faseOrdre(b.fase)),
            productiuTotal: m.productiuTotal,
            nTotal: m.nTotal,
            mitjanaTotal: m.nTotal ? Math.round(m.productiuTotal / m.nTotal) : 0,
            exclusivesCount: m.exclusives.size,
        }))
        .sort((a, b) => a.marca.localeCompare(b.marca, 'es'));
}

/** Lista ordenada de fases presentes en el desglose por marca. */
export function fasesPresentats(perMarca) {
    const set = new Set();
    (perMarca || []).forEach((m) => m.fases.forEach((f) => set.add(f.fase)));
    return Array.from(set).sort((a, b) => faseOrdre(a) - faseOrdre(b));
}

/**
 * Cuenta incidencias (no_conformitats) por marca dentro del periodo.
 * Resuelve la marca vía nc.expand.exclusiva.marca (o exclusivesById).
 * @returns {Map<string, number>} marca -> número de incidencias
 */
export function incidenciesPerMarca(noConformitats, exclusivesById = {}) {
    const map = new Map();
    for (const nc of (noConformitats || [])) {
        const exId = typeof nc.exclusiva === 'string'
            ? nc.exclusiva
            : nc.exclusiva?.id || nc.expand?.exclusiva?.id || '';
        const ex = exclusivesById[exId] || nc.expand?.exclusiva || null;
        const marca = ex?.marca ? String(ex.marca).trim() || 'Sin marca' : 'Sin marca';
        map.set(marca, (map.get(marca) || 0) + 1);
    }
    return map;
}

/**
 * Media de incidencias por exclusiva para una marca.
 * @param {number} incidenciesCount - nº de incidencias de la marca en el periodo
 * @param {number} exclusivesCount - nº de exclusivas distintas de la marca en el periodo
 * @returns {string} "1.3" o "—" si no hay exclusivas
 */
export function mitjanaIncidenciesText(incidenciesCount, exclusivesCount) {
    if (!exclusivesCount || exclusivesCount === 0) return '—';
    const mitj = incidenciesCount / exclusivesCount;
    return mitj.toFixed(1).replace('.', ',');
}

/** Devuelve el rango temporal (startMs, endMs) de los últimos N días hasta ahora. */
export function rangUltimsDies(dies = DIES_SETMANA) {
    const end = Date.now();
    const start = end - dies * 24 * 60 * 60 * 1000;
    return { startMs: start, endMs: end };
}

/**
 * Clasifica si un operario está dentro o fuera de su media.
 * - sin media → 'sin_datos'
 * - dentro de la banda ±tolerancia (por defecto 20%) → 'dentro'
 * - por encima (más lento) → 'fuera_encima'
 * - por debajo (más rápido) → 'fuera_debajo'
 */
export function classificaMitjana(secActual, mitjanaSec, tolerancia = 0.2) {
    if (!mitjanaSec || mitjanaSec <= 0) return 'sin_datos';
    if (secActual <= mitjanaSec * (1 + tolerancia) && secActual >= mitjanaSec * (1 - tolerancia)) {
        return 'dentro';
    }
    return secActual > mitjanaSec ? 'fuera_encima' : 'fuera_debajo';
}

/**
 * Utilidad canónica para la resolución de fases de artículos y exclusivas.
 *
 * Regla de negocio:
 *  - Todos los artículos tienen siempre disponibles Fase 1, Fase 2 y Fase 3.
 *  - Solo los artículos de la marca CIK (referencias R84-053 y R84-054)
 *    tienen además Fase 4.
 *
 * Esta utilidad es la fuente única de verdad: todos los puntos que muestren
 * o resuelvan fases (cola de operarios, detalle de exclusiva, rutas,
 * Administración, Producción, Dashboard en vivo, Kanban, Calidad, Forecast,
 * informe de tiempos) deben usar estas funciones para garantizar que la
 * disponibilidad de fases sea correcta según el artículo, sin borrar datos
 * ni duplicar fases, respetando los tiempos estándar ya configurados.
 */

const CIK_REFS = ['R84-053', 'R84-054'];
const FASES_BASE = ['Fase 1', 'Fase 2', 'Fase 3'];
const FASES_CIK = ['Fase 1', 'Fase 2', 'Fase 3', 'Fase 4'];

const norm = (s) => String(s || '').trim().toUpperCase();

/** ¿La referencia corresponde a un artículo CIK (R84-053 / R84-054)? */
export function isCikReferencia(referencia) {
    return CIK_REFS.includes(norm(referencia));
}

/** ¿El artículo es CIK? Por referencia, familia o texto del artículo. */
export function isCikArticle(article) {
    if (!article) return false;
    if (isCikReferencia(article.referencia)) return true;
    if (norm(article.familia).includes('CIK')) return true;
    const txt = norm(article.article || article.nom || '');
    if (txt.includes('R84-053') || txt.includes('R84-054')) return true;
    return false;
}

/** ¿La exclusiva es CIK? Por referencia, article, marca o artículo resuelto. */
export function isCikExclusiva(ex, articles = []) {
    if (!ex) return false;
    if (isCikReferencia(ex.referencia)) return true;
    const artTxt = norm(ex.article);
    if (artTxt.includes('R84-053') || artTxt.includes('R84-054')) return true;
    if (norm(ex.marca).includes('CIK')) return true;
    const ref = norm(ex.referencia);
    if (ref && Array.isArray(articles) && articles.length) {
        const art = articles.find((a) => norm(a.referencia) === ref);
        if (art && isCikArticle(art)) return true;
    }
    return false;
}

/** Fases esperadas para un artículo: 3 base, 4 si es CIK. */
export function expectedFasesForArticle(article) {
    return isCikArticle(article) ? FASES_CIK : FASES_BASE;
}

/** Fases esperadas para una exclusiva: 3 base, 4 si es CIK. */
export function expectedFasesForExclusiva(ex, articles = []) {
    return isCikExclusiva(ex, articles) ? FASES_CIK : FASES_BASE;
}

/** Convierte "Fase 4", "fase4", "FASE 3" → "Fase 4" (canónico 1-4). */
export function canonFase(fase) {
    const m = String(fase || '').match(/fase\s*(\d+)/i);
    const n = m ? Number(m[1]) : null;
    return n >= 1 && n <= 4 ? `Fase ${n}` : (fase || 'Sin fase');
}

/** Orden numérico de una fase (Fase 2 → 2). */
export function faseOrdre(fase) {
    const m = String(fase || '').match(/fase\s*(\d+)/i);
    return m ? Number(m[1]) : 99;
}

/** Parsea un campo fases_config (array o string JSON) a lista de objetos. */
export function parseFasesConfig(raw) {
    let arr = [];
    if (Array.isArray(raw)) arr = raw;
    else if (typeof raw === 'string' && raw.trim()) {
        try { arr = JSON.parse(raw); } catch { arr = []; }
    }
    return Array.isArray(arr) ? arr.filter((c) => c && c.fase) : [];
}

/**
 * Resuelve la lista canónica de fases para una exclusiva o artículo.
 * Siempre incluye Fase 1, 2, 3; añade Fase 4 solo para CIK (R84-053/R84-054).
 * Fusiona los tiempos estándar ya configurados (ruta → artículo → exclusiva,
 * este último solo añade fases que falten), respetando los valores existentes.
 * Las fases que falten se añaden activas con tiempo 0 (editable por
 * Administración/Producción). Nunca incluye Fase 4 para artículos no CIK.
 *
 * @param {object} [opts] - { article, ruta, exclusiva, articles }
 * @returns {Array<{fase, activa, temps_std_min}>}
 */
export function resolveFases({ article = null, ruta = null, exclusiva = null, articles = [] } = {}) {
    const expected = exclusiva
        ? expectedFasesForExclusiva(exclusiva, articles)
        : expectedFasesForArticle(article);
    const expectedSet = new Set(expected);

    const map = new Map();
    // ruta (base) → artículo (sobrescribe) → exclusiva (solo añade fases que falten)
    for (const c of parseFasesConfig(ruta?.fases_config)) {
        const key = canonFase(c.fase);
        if (expectedSet.has(key)) {
            map.set(key, { fase: key, activa: c.activa !== false, temps_std_min: Number(c.temps_std_min) || 0 });
        }
    }
    for (const c of parseFasesConfig(article?.fases_config)) {
        const key = canonFase(c.fase);
        if (expectedSet.has(key)) {
            map.set(key, { fase: key, activa: c.activa !== false, temps_std_min: Number(c.temps_std_min) || 0 });
        }
    }
    for (const c of parseFasesConfig(exclusiva?.fases_config)) {
        const key = canonFase(c.fase);
        if (expectedSet.has(key) && !map.has(key)) {
            map.set(key, { fase: key, activa: c.activa !== false, temps_std_min: Number(c.temps_std_min) || 0 });
        }
    }

    return expected
        .map((f) => map.get(f) || { fase: f, activa: true, temps_std_min: 0 })
        .sort((a, b) => faseOrdre(a.fase) - faseOrdre(b.fase));
}

/** Etiqueta compacta de fases: "Fase 1-2-3" o "Fase 1-2-3-4". */
export function fasesLabel(fases) {
    const nums = (Array.isArray(fases) ? fases : [])
        .filter((c) => c && c.activa !== false)
        .map((c) => { const m = String(c.fase || '').match(/fase\s*(\d+)/i); return m ? Number(m[1]) : null; })
        .filter((n) => n != null)
        .sort((a, b) => a - b);
    if (nums.length) return `Fase ${nums.join('-')}`;
    return 'Fase 1-2-3';
}

export { FASES_BASE, FASES_CIK, CIK_REFS };

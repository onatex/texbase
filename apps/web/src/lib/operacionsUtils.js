/**
 * Utilities for route resolution and per-mono operation status.
 *
 * Status values:
 *   "completada"  — registered with estat=finalitzat and control_qualitat=ok
 *   "en_curs"     — active registre (en_curs or pausat)
 *   "disponible"  — accessible to work (no artificial blocking by dependency or phase)
 */

const norm = (s) => String(s || '').trim().toUpperCase();

/**
 * Tiempo productivo (en segundos) de un registro en vivo, SIN contar los
 * intervalos pausados como tiempo productivo.
 *
 *   - finalitzat: temps_real_seg (valor definitivo guardado).
 *   - pausat:     temps_real_seg congelado (el tiempo de parada no es productivo).
 *   - en_curs:    temps_real_seg + (now - ultima_reanudacio) — solo acumula
 *                 desde la última reanudación, sin duplicar ni incluir pausas.
 *
 * `ultima_reanudacio` se establece al iniciar/reanudar la operación. Si no
 * existe (registros antiguos), se usa `inici` como referencia de inicio.
 */
// Safety cap: ningún registro en_curs legítimo acumula más de 8h de tiempo
// vivo sin pausar/finalizar. Si el live time supera este umbral, el registro
// es casi con seguridad huérfano (el operario cerró el navegador/perdió
// conexión sin pausar). Se cap para evitar que el tiempo crezca indefinidamente
// en las vistas en vivo hasta que la limpieza lo congele a 'pausat'.
const MAX_LIVE_SEC = 8 * 60 * 60; // 8 horas

export function segonsProductiusRegistre(r, nowMs = Date.now()) {
    if (!r) return 0;
    const stored = Number(r.temps_real_seg);
    const base = Number.isFinite(stored) && stored > 0 ? stored : 0;
    if (r.estat === 'pausat') return base;
    if (r.estat === 'en_curs') {
        const ref = r.ultima_reanudacio || r.inici;
        if (!ref) return base;
        const refMs = new Date(ref).getTime();
        if (Number.isNaN(refMs)) return base;
        const live = Math.max(0, Math.floor((nowMs - refMs) / 1000));
        return base + Math.min(live, MAX_LIVE_SEC);
    }
    return base;
}

/** Umbral a partir del cual un registro en_curs se considera huérfano. */
export const ORPHAN_THRESHOLD_SEC = MAX_LIVE_SEC;

/**
 * Calcula el tiempo vivo (now - ultima_reanudacio) de un registro en_curs,
 * sin cap. Se usa para detectar huérfanos (> ORPHAN_THRESHOLD_SEC).
 */
export function liveSegonsRegistre(r, nowMs = Date.now()) {
    if (!r || r.estat !== 'en_curs') return 0;
    const ref = r.ultima_reanudacio || r.inici;
    if (!ref) return 0;
    const refMs = new Date(ref).getTime();
    if (Number.isNaN(refMs)) return 0;
    return Math.max(0, Math.floor((nowMs - refMs) / 1000));
}

/** Tiempo de parada acumulado (en segundos) de un registro a partir de sus pausas. */
export function segonsParadaRegistre(r) {
    if (!r) return 0;
    const pauses = Array.isArray(r.pauses) ? r.pauses : [];
    let total = 0;
    for (const p of pauses) {
        const dur = Number(p?.durada_seg);
        if (Number.isFinite(dur) && dur > 0) { total += dur; continue; }
        const a = p?.inici || p?.start || p?.from || p?.hora;
        const b = p?.fi || p?.end || p?.to;
        if (a && b) {
            const d = new Date(b).getTime() - new Date(a).getTime();
            if (Number.isFinite(d) && d > 0) total += Math.floor(d / 1000);
        }
    }
    return total;
}

/**
 * Resolve route for an exclusiva (same multi-path logic as OperarioPage).
 * Tries: direct relation, expand, article by referencia, article by name,
 * route name containing referencia. Also accepts article.expand.ruta.
 */
export function resolveRutaExclusiva(ex, rutes = [], articles = []) {
    if (!ex) return { rutaId: null, rutaNom: '', via: 'cap', motiu: 'Sin exclusiva' };

    const ref = (ex.referencia || '').trim();
    const artTxt = (ex.article || '').trim();
    const rutesList = rutes || [];
    const arts = articles || [];

    const nomRuta = (r) => (r?.nom || r?.descripcion || r?.name || 'Ruta');

    const idFromArt = (art) => {
        if (!art) return null;
        if (art.ruta) return typeof art.ruta === 'string' ? art.ruta : art.ruta?.id || null;
        if (art.expand?.ruta?.id) return art.expand.ruta.id;
        return null;
    };

    // 1. Direct relation id
    if (ex.ruta) {
        const id = typeof ex.ruta === 'string' ? ex.ruta : ex.ruta?.id;
        if (id) {
            const r = rutesList.find((x) => x.id === id) || (typeof ex.ruta === 'object' ? ex.ruta : null);
            return { rutaId: id, rutaNom: nomRuta(r), via: 'directa', motiu: 'ex.ruta' };
        }
    }

    // 2. Expanded relation
    const expRuta = ex.expand?.ruta;
    if (expRuta?.id) {
        return { rutaId: expRuta.id, rutaNom: nomRuta(expRuta), via: 'expandida', motiu: 'ex.expand.ruta' };
    }

    // 3. Article by exact referencia
    if (ref) {
        const art = arts.find((a) => norm(a.referencia) === norm(ref));
        const rid = idFromArt(art);
        if (rid) {
            const r = rutesList.find((x) => x.id === rid) || art.expand?.ruta;
            return { rutaId: rid, rutaNom: nomRuta(r), via: 'article-ref', motiu: `artículo ${art.referencia}` };
        }
    }

    // 4. Article by article field (referencia or nom)
    if (artTxt) {
        let art = arts.find((a) => norm(a.referencia) === norm(artTxt) || norm(a.nom) === norm(artTxt));
        let rid = idFromArt(art);
        if (rid) {
            const r = rutesList.find((x) => x.id === rid) || art?.expand?.ruta;
            return { rutaId: rid, rutaNom: nomRuta(r), via: 'article-nom', motiu: `artículo ${art.referencia || art.nom}` };
        }
        // 4b. referencia contained in article text
        art = arts.find((a) => a.referencia && norm(artTxt).includes(norm(a.referencia)) && idFromArt(a));
        rid = idFromArt(art);
        if (rid) {
            const r = rutesList.find((x) => x.id === rid) || art?.expand?.ruta;
            return { rutaId: rid, rutaNom: nomRuta(r), via: 'article-contingut', motiu: `artículo ${art.referencia}` };
        }
        // 4c. article text contained in route name (e.g. "UNIC PLUS SUIT" vs "Ruta R82-020 UNIC PLUS")
        const rByArt = rutesList.find((x) => {
            const n = norm(x.nom || x.descripcion);
            return n && (n.includes(norm(artTxt)) || norm(artTxt).includes(n));
        });
        if (rByArt) {
            return { rutaId: rByArt.id, rutaNom: nomRuta(rByArt), via: 'ruta-article-txt', motiu: `ruta ${rByArt.nom}` };
        }
    }

    // 5. Route name contains referencia
    if (ref) {
        const r = rutesList.find((x) => norm(x.nom || x.descripcion).includes(norm(ref)));
        if (r) return { rutaId: r.id, rutaNom: nomRuta(r), via: 'ruta-nom', motiu: `ruta ${r.nom}` };
    }

    // 6. Match article field tokens against route names (e.g. R82-020 in "Ruta R82-020 …")
    const tokens = `${ref} ${artTxt}`.match(/[A-Z0-9][A-Z0-9\-_/]{3,}/gi) || [];
    for (const tok of tokens) {
        const r = rutesList.find((x) => norm(x.nom || x.descripcion).includes(norm(tok)));
        if (r) return { rutaId: r.id, rutaNom: nomRuta(r), via: 'ruta-token', motiu: `token ${tok}` };
    }

    return {
        rutaId: null,
        rutaNom: '',
        via: 'cap',
        motiu: 'No se pudo resolver la ruta (sin relación directa, artículo ni coincidencia por nombre)',
    };
}

/**
 * Returns ops for a given route sorted by ordre.
 * Accepts actiu / activa flags (either may be used in data).
 */
export function getOpsByRuta(opsDef, rutaId) {
    if (!rutaId) return [];
    return (opsDef || [])
        .filter((op) => {
            const opRuta = typeof op.ruta === 'string' ? op.ruta : op.ruta?.id;
            if (opRuta !== rutaId) return false;
            if (op.actiu === false || op.activa === false) return false;
            return true;
        })
        .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
}

function computeStatus(op, rutaOps, completadesNoms, enCursNoms) {
    if (completadesNoms.has(op.nom)) return 'completada';
    if (enCursNoms.has(op.nom)) return 'en_curs';
    // Todas las fases/operaciones pendientes son accesibles (sin bloqueo por dependencia).
    return 'disponible';
}

/**
 * Returns all operations for a mono with their status.
 * @param {object} mono
 * @param {object[]} opsDef
 * @param {object[]} allRegistres
 * @param {object} [opts] - { rutaId, rutes, articles, exclusiva }
 */
export function computeMonoOps(mono, opsDef, allRegistres, opts = {}) {
    const ex = opts.exclusiva || mono?.expand?.exclusiva || null;
    let rutaId = opts.rutaId || null;
    if (!rutaId) {
        const resolved = resolveRutaExclusiva(ex, opts.rutes || [], opts.articles || []);
        rutaId = resolved.rutaId;
    }
    if (!rutaId) return [];

    const rutaOps = getOpsByRuta(opsDef, rutaId);
    if (!rutaOps.length) return [];

    const monoRegs = (allRegistres || []).filter((r) => r.mono === mono.id);

    const completadesNoms = new Set(
        monoRegs
            .filter((r) => {
                if (r.estat !== 'finalitzat') return false;
                if (r.tipus === 'lliure') return true;
                // Completada si QC ok/aprovat, o sin QC (ops sin control)
                const qc = r.control_qualitat;
                return !qc || qc === 'ok' || qc === 'aprovat' || qc === 'pendent';
            })
            .map((r) => r.operacio),
    );
    const enCursNoms = new Set(
        monoRegs
            .filter((r) => r.estat === 'en_curs' || r.estat === 'pausat')
            .map((r) => r.operacio),
    );

    return rutaOps.map((op) => ({
        ...op,
        status: computeStatus(op, rutaOps, completadesNoms, enCursNoms),
    }));
}

export function opsSummary(opsWithStatus) {
    const counts = { completada: 0, en_curs: 0, disponible: 0, total: opsWithStatus.length };
    for (const op of opsWithStatus) {
        counts[op.status] = (counts[op.status] || 0) + 1;
    }
    return counts;
}

function exclusivaIdFromRegistre(r) {
    const raw = r.exclusiva || r.expand?.exclusiva?.id || r.expand?.mono?.exclusiva || r.expand?.mono?.expand?.exclusiva?.id;
    if (!raw) return null;
    return typeof raw === 'string' ? raw : raw?.id || null;
}

/** Net productive seconds invested on an exclusiva from registres.
 *  Excludes paused intervals (tiempo de parada) and adds live time for en_curs
 *  records using ultima_reanudacio. No double-counting of pauses/resumes. */
export function tempsInvertitExclusiva(exclusivaId, registres = [], monoIds = null) {
    if (!exclusivaId) return 0;
    const monoSet = monoIds instanceof Set ? monoIds : (Array.isArray(monoIds) ? new Set(monoIds) : null);
    const nowMs = Date.now();
    let total = 0;
    for (const r of registres) {
        const exId = exclusivaIdFromRegistre(r);
        const matchEx = exId === exclusivaId;
        const matchMono = monoSet && r.mono && monoSet.has(r.mono);
        if (!matchEx && !matchMono) continue;
        total += segonsProductiusRegistre(r, nowMs);
    }
    return total;
}

/** Active operators currently working on exclusiva (en_curs or pausat).
 *  Accepta un mapa opcional d'usuaris (usersById) per resoldre el nom de
 *  l'operari quan l'expand de la relació falla (p.ej. compte esborrat o
 *  identitat migrada), evitant que es mostri com a 'Operario' genèric. */
export function operarisActiusExclusiva(exclusivaId, registres = [], monoIds = null, usersById = null) {
    if (!exclusivaId) return [];
    const monoSet = monoIds instanceof Set ? monoIds : (Array.isArray(monoIds) ? new Set(monoIds) : null);
    const resolveNom = (r) => {
        if (r.expand?.operari?.name) return r.expand.operari.name;
        if (r.expand?.operari?.codi) return r.expand.operari.codi;
        if (r.expand?.operari?.email) return r.expand.operari.email;
        const opId = r.operari || r.expand?.operari?.id || '';
        const u = usersById && opId ? usersById.get(opId) : null;
        if (u?.name) return u.name;
        if (u?.codi) return u.codi;
        if (u?.email) return u.email;
        if (opId) return `Operario ${String(opId).slice(-4)}`;
        return 'Operario';
    };
    const byOp = new Map();
    for (const r of registres) {
        if (r.estat !== 'en_curs' && r.estat !== 'pausat') continue;
        const exId = exclusivaIdFromRegistre(r);
        const matchEx = exId === exclusivaId;
        const matchMono = monoSet && r.mono && monoSet.has(r.mono);
        if (!matchEx && !matchMono) continue;
        const opId = r.operari || r.expand?.operari?.id || `anon-${r.id}`;
        if (byOp.has(opId)) continue;
        const nom = resolveNom(r);
        byOp.set(opId, {
            id: opId,
            nom,
            operacio: r.operacio || (r.tipus === 'lliure' ? 'Trabajo libre' : '—'),
            estat: r.estat,
            causa: r.motiu_pausa_inactivitat || '',
            inactivitat: !!r.inactivitat_detectada,
        });
    }
    return [...byOp.values()];
}

/**
 * Parse delivery/scheduling dates in ISO, DD/MM/YYYY, DD-MM-YYYY, Date.
 * Returns { key: 'YYYY-MM-DD'| 'sin-fecha', date: Date|null, label: string }
 */
export function parseDataExclusiva(raw) {
    if (raw == null || raw === '') {
        return { key: 'sin-fecha', date: null, label: 'Sin fecha de entrega' };
    }
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
        const y = raw.getFullYear();
        const m = String(raw.getMonth() + 1).padStart(2, '0');
        const d = String(raw.getDate()).padStart(2, '0');
        return { key: `${y}-${m}-${d}`, date: raw, label: `${d}/${m}/${y}` };
    }
    const s = String(raw).trim();
    // ISO or YYYY-MM-DD
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
        const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        return { key: `${m[1]}-${m[2]}-${m[3]}`, date, label: `${m[3]}/${m[2]}/${m[1]}` };
    }
    // DD/MM/YYYY or DD-MM-YYYY
    m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
    if (m) {
        const dd = m[1].padStart(2, '0');
        const mm = m[2].padStart(2, '0');
        const yyyy = m[3];
        const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
        return { key: `${yyyy}-${mm}-${dd}`, date, label: `${dd}/${mm}/${yyyy}` };
    }
    // Fallback Date parse
    const d2 = new Date(s);
    if (!Number.isNaN(d2.getTime())) {
        const y = d2.getFullYear();
        const mo = String(d2.getMonth() + 1).padStart(2, '0');
        const da = String(d2.getDate()).padStart(2, '0');
        return { key: `${y}-${mo}-${da}`, date: d2, label: `${da}/${mo}/${y}` };
    }
    return { key: 'sin-fecha', date: null, label: 'Sin fecha de entrega' };
}

/** Planned minutes for exclusiva (field or sum of route ops). */
export function minutsPrevistosExclusiva(ex, opsDef = [], rutaId = null) {
    if (ex?.minuts_previstos != null && Number(ex.minuts_previstos) > 0) {
        return Number(ex.minuts_previstos);
    }
    if (!rutaId) return 0;
    return getOpsByRuta(opsDef, rutaId).reduce((a, op) => a + (Number(op.temps_std_min) || 0), 0);
}

export const STATUS_LABEL = {
    completada: 'Completada',
    en_curs: 'En curso',
    disponible: 'Disponible',
};

export const STATUS_COLOR = {
    completada: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]',
    en_curs: 'bg-[hsl(var(--warn))]/20 text-[hsl(var(--warn))]',
    disponible: 'bg-primary/10 text-primary',
};

export const STATUS_DOT = {
    completada: 'bg-[hsl(var(--ok))]',
    en_curs: 'bg-[hsl(var(--warn))]',
    disponible: 'bg-primary',
};

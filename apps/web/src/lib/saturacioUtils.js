/**
 * Saturación del día a partir de la actividad vigente de confección y de las
 * medias productivas válidas (7 días) por fase y tipo de artículo.
 *
 * No modifica registros. Las pausas no cuentan como tiempo productivo: las
 * medias salen de mitjanesUtils (registresValids + segonsProductiusRegistre).
 */

import { canonFase, resolveFases } from '@/lib/fasesUtils';
import { enriquirRegistres, registresValids } from '@/lib/mitjanesUtils';
import { segonsProductiusRegistre } from '@/lib/operacionsUtils';

const TERMINALS = new Set(['entregada', 'finalitzada', 'desapareguda', 'lista_recollida']);

function parseData(v) {
    if (!v) return null;
    const s = String(v).trim();
    const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m1) return new Date(Number(m1[3]), Number(m1[2]) - 1, Number(m1[1]));
    const m2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m2) return new Date(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3]));
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function mismoDia(a, b) {
    return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function tipoArticulo(ex) {
    const ref = String(ex?.referencia || '').trim();
    const art = String(ex?.article || '').trim();
    return ref || art || 'Sin tipo';
}

function faseValida(f) {
    return /^Fase [1-4]$/.test(f);
}

/**
 * Operarios de confección con un registro realmente en curso.
 * No cuenta Calidad, pausados, finalizados, duplicados ni actividad histórica.
 */
export function operarisConfeccioActius(registres, usersById = new Map()) {
    const map = new Map();
    for (const r of registres || []) {
        if (!r || r.estat !== 'en_curs') continue;
        const expand = r.expand?.operari || null;
        const id = expand?.id || r.operari || '';
        if (!id || map.has(id)) continue;
        const u = usersById.get(id);
        const rol = expand?.rol || u?.rol || '';
        if (rol === 'qualitat') continue;
        const nom = expand?.name || expand?.codi || u?.name || u?.codi || u?.email || 'Operario';
        map.set(id, { id, nom });
    }
    return Array.from(map.values());
}

function mediasDesde(enriched, exclusivesById) {
    const porTipo = new Map();
    const porMarca = new Map();
    const porFase = new Map();
    const add = (map, key, sec) => {
        if (!key || !(sec > 0)) return;
        const o = map.get(key) || { sum: 0, n: 0 };
        o.sum += sec;
        o.n += 1;
        map.set(key, o);
    };
    let n = 0;
    for (const r of enriched || []) {
        if (!faseValida(r._fase)) continue;
        const sec = Number(r._productiu) || 0;
        if (sec <= 0) continue;
        n += 1;
        const ex = exclusivesById.get(r._exclusivaId) || r.expand?.exclusiva || null;
        const tipo = tipoArticulo(ex);
        add(porTipo, `${r._fase}|${tipo}`, sec);
        if (r._marca) add(porMarca, `${r._fase}|${r._marca}`, sec);
        add(porFase, r._fase, sec);
    }
    const pick = (map, key) => {
        const o = map.get(key);
        if (!o || !o.n) return null;
        return { seg: Math.round(o.sum / o.n), n: o.n };
    };
    return { porTipo, porMarca, porFase, n, pick };
}

/**
 * @returns análisis listo para pintar. Los segundos sin media válida no se
 * inventan: se marcan y, si hay tiempo estándar de la fase, se usan como
 * respaldo etiquetado.
 */
export function calcularSaturacion({
    exclusives = [],
    monos = [],
    registresFase = [],
    enriched = [],
    articles = [],
    fasesExt = [],
    operarisActius = [],
    now = new Date(),
    dataSel = null,
    iniciJornada = '08:00',
    fiJornada = '17:00',
    pctQualitat = 10,
} = {}) {
    const hoy = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dia = dataSel || hoy;
    const exclusivesById = new Map((exclusives || []).map((e) => [e.id, e]));
    const medias = mediasDesde(enriched, exclusivesById);

    const vivo = new Map();
    const nowMs = now instanceof Date ? now.getTime() : Date.now();
    for (const r of registresFase || []) {
        if (!r || r.estat !== 'en_curs' || !r.mono) continue;
        const f = canonFase(r.operacio);
        if (!faseValida(f)) continue;
        const key = `${r.mono}|${f}`;
        const sec = segonsProductiusRegistre(r, nowMs);
        vivo.set(key, Math.max(vivo.get(key) || 0, sec));
    }

    const done = new Map();
    for (const r of registresFase || []) {
        if (!r || r.estat !== 'finalitzat' || !r.mono) continue;
        const cq = String(r.control_qualitat || '').toLowerCase();
        if (cq === 'ko' || cq === 'nok') continue;
        const f = canonFase(r.operacio);
        if (!faseValida(f)) continue;
        if (!done.has(r.mono)) done.set(r.mono, new Set());
        done.get(r.mono).add(f);
    }

    const extPend = new Set();
    const extFet = new Set();
    for (const f of fasesExt || []) {
        const fase = canonFase(f.fase);
        if (!f.exclusiva || !faseValida(fase)) continue;
        const key = `${f.exclusiva}|${fase}`;
        if (f.estat === 'retornada') extFet.add(key);
        else if (f.estat === 'enviada' || f.estat === 'en_proces' || f.estat === 'amb_incidencies') extPend.add(key);
    }

    const pendents = [];
    const vistos = new Set();
    for (const ex of exclusives || []) {
        const estat = String(ex.estat || '').toLowerCase().trim();
        if (TERMINALS.has(estat) || estat === 'desapareguda') continue;
        const d = parseData(ex.data_entrega);
        if (!d) continue;
        const esHoy = mismoDia(d, dia);
        const retras = d.getTime() < dia.getTime();
        if (!esHoy && !retras) continue;
        if (vistos.has(ex.id)) continue;
        vistos.add(ex.id);
        pendents.push(ex);
    }

    let tempsProdSeg = 0;
    let fasesConMedia = 0;
    let fasesEstandar = 0;
    let fasesSinDato = 0;
    let fasesExtPend = 0;
    // Unidades (monos) pendientes de confección, sin contar dos veces la misma
    // unidad aunque tenga varias fases u operaciones. Se separan las unidades
    // retrasadas (fecha de entrega < día) de las previstas para entregar en
    // fecha (entrega == día). No se cuentan unidades ya entregadas/finalizadas.
    let unitatsPendentsRetras = 0;
    let unitatsPendentsAvui = 0;
    let exclusivesRetras = 0;
    let exclusivesAvui = 0;
    const avisos = [];
    const perEx = [];

    for (const ex of pendents) {
        const fases = resolveFases({ exclusiva: ex, articles }).filter((c) => c && c.activa !== false && faseValida(canonFase(c.fase)));
        const tipo = tipoArticulo(ex);
        const marca = ex.marca ? String(ex.marca).trim() : '';
        const seus = (monos || []).filter((m) => m.exclusiva === ex.id);
        const unidades = seus.length > 0 ? seus : Array.from({ length: Math.max(1, Number(ex.unitats) || 1) }, (_, i) => ({ id: null, estat: 'pendent', _sint: i }));
        let restantSeg = 0;
        let sinDatoEx = 0;

        // Clasificación de la exclusiva: retrasada (fecha < día) o en fecha (hoy).
        const exDate = parseData(ex.data_entrega);
        const esRetras = exDate && exDate.getTime() < dia.getTime();

        // Contar unidades (monos) pendientes: una unidad = un mono no finalitzat.
        // Si no hay monos creados, se cuentan las unidades previstas (ex.unitats)
        // como pendientes (todavía sin iniciar).
        let unitatsPendentsEx = 0;
        for (const mono of unidades) {
            if (String(mono.estat || '') === 'finalitzat') continue;
            unitatsPendentsEx += 1;
        }
        if (esRetras) {
            unitatsPendentsRetras += unitatsPendentsEx;
            if (unitatsPendentsEx > 0) exclusivesRetras += 1;
        } else {
            unitatsPendentsAvui += unitatsPendentsEx;
            if (unitatsPendentsEx > 0) exclusivesAvui += 1;
        }

        for (const mono of unidades) {
            if (String(mono.estat || '') === 'finalitzat') continue;
            const fet = mono.id ? (done.get(mono.id) || new Set()) : new Set();
            for (const cfg of fases) {
                const fase = canonFase(cfg.fase);
                if (fet.has(fase)) continue;
                const extKey = `${ex.id}|${fase}`;
                if (extFet.has(extKey)) continue;
                if (extPend.has(extKey)) {
                    fasesExtPend += 1;
                    continue;
                }
                const mediaTipo = medias.pick(medias.porTipo, `${fase}|${tipo}`);
                const mediaMarca = !mediaTipo && marca ? medias.pick(medias.porMarca, `${fase}|${marca}`) : null;
                const mediaFase = !mediaTipo && !mediaMarca ? medias.pick(medias.porFase, fase) : null;
                const stdSeg = (Number(cfg.temps_std_min) || 0) * 60;
                let seg = 0;
                let fuente = 'sin_dato';
                if (mediaTipo) {
                    seg = mediaTipo.seg;
                    fuente = 'media_tipo';
                    fasesConMedia += 1;
                } else if (mediaMarca) {
                    seg = mediaMarca.seg;
                    fuente = 'media_marca';
                    fasesConMedia += 1;
                } else if (mediaFase) {
                    seg = mediaFase.seg;
                    fuente = 'media_fase';
                    fasesConMedia += 1;
                } else if (stdSeg > 0) {
                    seg = stdSeg;
                    fuente = 'estandar';
                    fasesEstandar += 1;
                } else {
                    fasesSinDato += 1;
                    sinDatoEx += 1;
                }
                const ya = mono.id ? (vivo.get(`${mono.id}|${fase}`) || 0) : 0;
                restantSeg += Math.max(0, seg - ya);
                if (fuente !== 'media_tipo' && avisos.length < 8) {
                    const etiqueta = fuente === 'sin_dato'
                        ? `${tipo} · ${fase}: sin media ni estándar`
                        : fuente === 'estandar'
                            ? `${tipo} · ${fase}: estándar (sin media de 7 días)`
                            : fuente === 'media_marca'
                                ? `${tipo} · ${fase}: media de la marca (sin media del tipo)`
                                : `${tipo} · ${fase}: media de la fase (sin media del tipo)`;
                    if (!avisos.includes(etiqueta)) avisos.push(etiqueta);
                }
            }
        }
        tempsProdSeg += restantSeg;
        perEx.push({
            id: ex.id,
            exclusiva: ex.exclusiva,
            article: ex.article || tipo,
            restant: restantSeg / 60,
            sinDato: sinDatoEx,
        });
    }

    const tempsProdMin = tempsProdSeg / 60;
    const tempsQualitatMin = tempsProdMin * (Number(pctQualitat) || 0) / 100;
    const tempsNecessariMin = tempsProdMin + tempsQualitatMin;

    const [hi, mi] = String(iniciJornada || '08:00').split(':').map(Number);
    const [hf, mf] = String(fiJornada || '17:00').split(':').map(Number);
    const jornadaHores = Math.max(0, ((hf * 60 + mf) - (hi * 60 + mi)) / 60);
    const esAvui = mismoDia(dia, hoy);
    let horesTreballades = 0;
    let horesDisponibles = 0;
    if (esAvui) {
        const minAra = now.getHours() * 60 + now.getMinutes();
        const minInici = hi * 60 + mi;
        const minFi = hf * 60 + mf;
        horesTreballades = Math.max(0, Math.min(minAra, minFi) - minInici) / 60;
        horesDisponibles = Math.max(0, minFi - Math.max(minAra, minInici)) / 60;
    } else if (dia.getTime() > hoy.getTime()) {
        horesDisponibles = jornadaHores;
    }

    const numOperaris = (operarisActius || []).length;
    const capacitatHores = numOperaris * horesDisponibles;
    const capacitatMin = capacitatHores * 60;
    const pct = capacitatMin > 0 ? (tempsNecessariMin / capacitatMin) * 100 : (tempsNecessariMin > 0 ? null : 0);
    const baseHores = horesDisponibles > 0 ? horesDisponibles : jornadaHores;
    const operarisNecessaris = baseHores > 0 && tempsNecessariMin > 0
        ? Math.ceil(tempsNecessariMin / (baseHores * 60))
        : 0;

    let estat = 'ok';
    if (pct == null || pct > 100) estat = 'no';
    else if (pct > 80) estat = 'risc';

    return {
        perEx,
        tempsProdMin,
        tempsQualitatMin,
        tempsExtPend: fasesExtPend,
        tempsNecessariMin,
        horesTreballades,
        horesDisponibles,
        numOperaris,
        nomsOperaris: (operarisActius || []).map((o) => o.nom),
        capacitatHores,
        pct,
        operarisNecessaris,
        estat,
        esAvui,
        unitatsPendentsRetras,
        unitatsPendentsAvui,
        unitatsPendentsTotal: unitatsPendentsRetras + unitatsPendentsAvui,
        exclusivesRetras,
        exclusivesAvui,
        jornadaHores,
        fasesConMedia,
        fasesEstandar,
        fasesSinDato,
        registrosMedia: medias.n,
        avisos,
        periodo: 'últimos 7 días',
    };
}

export function prepararMedias(registres, opsByNom = {}) {
    return enriquirRegistres(registresValids(registres || []), opsByNom);
}

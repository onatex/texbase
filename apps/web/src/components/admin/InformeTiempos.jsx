import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { Clock, Calendar, TrendingUp, Users, Layers, RefreshCcw, AlertCircle, Package, ArrowUpDown, Tag } from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { segonsProductiusRegistre, segonsParadaRegistre } from '@/lib/operacionsUtils';
import { incidenciesPerMarca, mitjanaIncidenciesText } from '@/lib/mitjanesUtils';

const formatSegons = (s) => {
    const n = Math.max(0, Math.floor(Number(s) || 0));
    const h = Math.floor(n / 3600);
    const m = Math.floor((n % 3600) / 60);
    const seg = n % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${seg}s`;
    return `${seg}s`;
};

const PERIODES = [
    { id: 'dia', label: '1 día', dies: 1 },
    { id: 'setmana', label: '1 semana', dies: 7 },
    { id: 'mes', label: '1 mes', dies: 30 },
    { id: 'any', label: '1 año', dies: 365 },
];

// Umbral de exclusión: registros cuyo tiempo total supera 8 horas
// (se considera que el cronómetro se dejó activo por error).
// 8 horas exactas (28800 s) SÍ se mantienen.
const UMBRAL_HORAS_EXCLUSIO = 8;
const UMBRAL_SEGONS_EXCLUSIO = UMBRAL_HORAS_EXCLUSIO * 3600;

const FASE_COLORS = {
    'Fase 1': '#1e3a5f',
    'Fase 2': '#f97316',
    'Fase 3': '#10b981',
    'Fase 4': '#6366f1',
    'Trabajo libre': '#f59e0b',
    'Sin fase': '#94a3b8',
};

const ordreFase = (f) => {
    const m = String(f || '').match(/fase\s*(\d+)/i);
    return m ? Number(m[1]) : 99;
};

const canonFase = (f) => {
    const n = ordreFase(f);
    return n >= 1 && n <= 4 ? `Fase ${n}` : (f || 'Sin fase');
};

const fmtRang = (start, end) => {
    const f = (d) => new Date(d).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
    return `${f(start)} → ${f(end)}`;
};

export default function InformeTiempos() {
    const [periode, setPeriode] = useState('setmana');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [registres, setRegistres] = useState([]);
    const [opsDef, setOpsDef] = useState([]);
    const [noConformitats, setNoConformitats] = useState([]);
    const [carregant, setCarregant] = useState(true);
    const [error, setError] = useState('');
    const [now, setNow] = useState(Date.now());
    const [sortEx, setSortEx] = useState({ key: 'productiu', dir: 'desc' });

    const rang = useMemo(() => {
        if (periode === 'custom' && customStart && customEnd) {
            const start = new Date(`${customStart}T00:00:00`);
            const end = new Date(`${customEnd}T23:59:59.999`);
            if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start <= end) {
                return { start, end };
            }
        }
        const p = PERIODES.find((x) => x.id === periode) || PERIODES[1];
        const end = new Date();
        const start = new Date(end.getTime() - p.dies * 24 * 60 * 60 * 1000);
        return { start, end };
    }, [periode, customStart, customEnd]);

    const carrega = useCallback(async () => {
        setCarregant(true);
        setError('');
        try {
            const startIso = rang.start.toISOString();
            const filter = pb.filter('inici >= {:s}', { s: startIso });
            const [rs, ops, ncs] = await Promise.all([
                pb.collection('registres').getFullList({
                    filter,
                    sort: '-created',
                    expand: 'operari,exclusiva,mono',
                    requestKey: 'informe-temps',
                }),
                pb.collection('operacions_def').getFullList({ requestKey: 'informe-ops' }).catch(() => []),
                pb.collection('no_conformitats').getFullList({
                    filter: pb.filter('created >= {:s}', { s: startIso }),
                    expand: 'exclusiva',
                    requestKey: 'informe-nc',
                }).catch(() => []),
            ]);
            setRegistres(rs);
            setOpsDef(ops);
            setNoConformitats(ncs || []);
        } catch (e) {
            setError('No se han podido cargar los registros de tiempo.');
        } finally {
            setCarregant(false);
            setNow(Date.now());
        }
    }, [rang.start]);

    useEffect(() => { carrega(); }, [carrega]);

    // Realtime: refrescar cuando cambian los registros
    useEffect(() => {
        const refresca = () => { setNow(Date.now()); carrega(); };
        void pb.collection('registres').subscribe('*', refresca).catch(() => {});
        return () => { void pb.collection('registres').unsubscribe('*').catch(() => {}); };
    }, [carrega]);

    // Tick para registros en curso
    useEffect(() => {
        const hasLive = registres.some((r) => r.estat === 'en_curs');
        if (!hasLive) return undefined;
        const id = setInterval(() => setNow(Date.now()), 5000);
        return () => clearInterval(id);
    }, [registres]);

    const opsByNom = useMemo(() => {
        const m = {};
        opsDef.forEach((op) => { if (op.nom) m[op.nom] = op; });
        return m;
    }, [opsDef]);

    // Filtrar registros dentro del rango (por inici) y con tiempo relevante
    const regsValids = useMemo(() => {
        const startMs = rang.start.getTime();
        const endMs = rang.end.getTime();
        return registres.filter((r) => {
            if (!r.inici) return false;
            const t = new Date(r.inici).getTime();
            if (Number.isNaN(t)) return false;
            if (t < startMs || t > endMs) return false;
            return r.estat === 'finalitzat' || r.estat === 'en_curs' || r.estat === 'pausat';
        });
    }, [registres, rang.start, rang.end]);

    // Resolver fase de cada registro y excluir los que superan 8 horas
    // (cronómetro dejado activo por error). 8 horas exactas se mantienen.
    const { regsAmbFase, exclosos } = useMemo(() => {
        const ambFase = regsValids.map((r) => {
            let fase;
            if (r.tipus === 'lliure') fase = 'Trabajo libre';
            else if (/^fase\s*\d+$/i.test(r.operacio || '')) fase = canonFase(r.operacio);
            else fase = canonFase(opsByNom[r.operacio]?.fase || 'Sin fase');
            const productiu = segonsProductiusRegistre(r, now);
            const parada = segonsParadaRegistre(r);
            const operariId = r.operari || r.expand?.operari?.id || '';
            const operariNom = r.expand?.operari?.name || r.expand?.operari?.codi || '—';
            const exclusivaId = typeof r.exclusiva === 'string' ? r.exclusiva : (r.exclusiva?.id || r.expand?.exclusiva?.id || '');
            const ex = r.expand?.exclusiva || (typeof r.exclusiva === 'object' ? r.exclusiva : null);
            const exclusivaCodi = ex?.exclusiva || ex?.numero_exclusiva || '';
            const exclusivaArticle = ex?.article || ex?.referencia || '';
            const exclusivaRef = ex?.referencia || '';
            const marca = ex?.marca ? String(ex.marca).trim() : '';
            return {
                ...r, fase, productiu, parada, operariId, operariNom,
                exclusivaId, exclusivaCodi, exclusivaArticle, exclusivaRef, marca,
            };
        });
        const valids = [];
        let exc = 0;
        ambFase.forEach((r) => {
            const total = (r.productiu || 0) + (r.parada || 0);
            if (total > UMBRAL_SEGONS_EXCLUSIO) {
                exc += 1;
                return;
            }
            valids.push(r);
        });
        return { regsAmbFase: valids, exclosos: exc };
    }, [regsValids, opsByNom, now]);

    // Tiempo por fase (productivo, parada, total, registros)
    const perFase = useMemo(() => {
        const map = new Map();
        regsAmbFase.forEach((r) => {
            const e = map.get(r.fase) || { fase: r.fase, productiu: 0, parada: 0, total: 0, n: 0, monos: new Set() };
            e.productiu += r.productiu;
            e.parada += r.parada;
            e.total += r.productiu + r.parada;
            e.n += 1;
            if (r.mono) e.monos.add(r.mono);
            map.set(r.fase, e);
        });
        return Array.from(map.values())
            .map((e) => ({
                ...e,
                monos: e.monos.size,
                mitjana: e.n ? Math.round(e.productiu / e.n) : 0,
                mitjanaTotal: e.n ? Math.round(e.total / e.n) : 0,
            }))
            .sort((a, b) => ordreFase(a.fase) - ordreFase(b.fase));
    }, [regsAmbFase]);

    // Ranking por operario y fase
    const rankingOpFase = useMemo(() => {
        const map = new Map();
        regsAmbFase.forEach((r) => {
            const key = `${r.operariId}||${r.fase}`;
            const e = map.get(key) || {
                operariId: r.operariId, operari: r.operariNom, fase: r.fase,
                productiu: 0, parada: 0, total: 0, n: 0, exclusives: new Set(),
            };
            e.productiu += r.productiu;
            e.parada += r.parada;
            e.total += r.productiu + r.parada;
            e.n += 1;
            if (r.exclusivaId) e.exclusives.add(r.exclusivaId);
            map.set(key, e);
        });
        return Array.from(map.values())
            .map((e) => ({ ...e, exclusives: e.exclusives.size, mitjana: e.n ? Math.round(e.productiu / e.n) : 0 }))
            .sort((a, b) => b.productiu - a.productiu);
    }, [regsAmbFase]);

    // Resumen por operario (tiempo total, productivo, parada, registros, exclusivas distintas)
    const perOperari = useMemo(() => {
        const map = new Map();
        regsAmbFase.forEach((r) => {
            const e = map.get(r.operariId) || {
                operariId: r.operariId, operari: r.operariNom,
                productiu: 0, parada: 0, total: 0, n: 0, exclusives: new Set(), fases: new Set(),
            };
            e.productiu += r.productiu;
            e.parada += r.parada;
            e.total += r.productiu + r.parada;
            e.n += 1;
            if (r.exclusivaId) e.exclusives.add(r.exclusivaId);
            e.fases.add(r.fase);
            map.set(r.operariId, e);
        });
        return Array.from(map.values())
            .map((e) => ({ ...e, exclusives: e.exclusives.size, nFases: e.fases.size }))
            .sort((a, b) => b.productiu - a.productiu);
    }, [regsAmbFase]);

    // Incidencias (no conformidades) por marca dentro del periodo seleccionado.
    // Se usa para la columna "Incidencias medias" del desglose por marca.
    const incidenciesMap = useMemo(() => incidenciesPerMarca(noConformitats), [noConformitats]);

    // Medias por marca (de la exclusiva asociada al mono/artículo).
    // Agrupa por exclusiva.marca; sin marca → "Sin marca" (no se oculta).
    // Muestra la media de tiempo productivo por marca y por fase, el
    // sumatorio de todas las fases por marca, el nº de registros utilizados
    // y la media de incidencias por exclusiva. Respeta los mismos filtros
    // de periodo y la exclusión de >8h.
    const perMarca = useMemo(() => {
        const map = new Map(); // marca -> { fases, productiuTotal, nTotal, exclusives }
        regsAmbFase.forEach((r) => {
            const marca = r.marca || 'Sin marca';
            if (!map.has(marca)) map.set(marca, { marca, fases: new Map(), productiuTotal: 0, nTotal: 0, exclusives: new Set() });
            const m = map.get(marca);
            const f = m.fases.get(r.fase) || { fase: r.fase, productiu: 0, n: 0 };
            f.productiu += r.productiu;
            f.n += 1;
            m.fases.set(r.fase, f);
            m.productiuTotal += r.productiu;
            m.nTotal += 1;
            if (r.exclusivaId) m.exclusives.add(r.exclusivaId);
        });
        return Array.from(map.values())
            .map((m) => {
                const incidenciesCount = incidenciesMap.get(m.marca) || 0;
                return {
                    ...m,
                    fases: Array.from(m.fases.values())
                        .map((f) => ({ ...f, mitjana: f.n ? Math.round(f.productiu / f.n) : 0 }))
                        .sort((a, b) => ordreFase(a.fase) - ordreFase(b.fase)),
                    mitjanaTotal: m.nTotal ? Math.round(m.productiuTotal / m.nTotal) : 0,
                    exclusivesCount: m.exclusives.size,
                    incidenciesCount,
                    mitjanaIncidencies: mitjanaIncidenciesText(incidenciesCount, m.exclusives.size),
                };
            })
            .sort((a, b) => a.marca.localeCompare(b.marca, 'es'));
    }, [regsAmbFase, incidenciesMap]);

    // Lista ordenada de todas las fases presentes en el desglose por marca
    const marquesFases = useMemo(() => {
        const set = new Set();
        perMarca.forEach((m) => m.fases.forEach((f) => set.add(f.fase)));
        return Array.from(set).sort((a, b) => ordreFase(a) - ordreFase(b));
    }, [perMarca]);

    // Operario(s) más rápido(s) por fase: menor media de tiempo productivo
    // válida (pausas excluidas, >8h excluidas, 8h exactas incluidas).
    // En caso de empate se muestran todos los operarios empatados.
    const mesRapidPerFase = useMemo(() => {
        const perFaseMap = new Map(); // fase -> Map(operariId -> { operari, productiu, n })
        regsAmbFase.forEach((r) => {
            if (!r.operariId) return;
            if (!perFaseMap.has(r.fase)) perFaseMap.set(r.fase, new Map());
            const ops = perFaseMap.get(r.fase);
            const e = ops.get(r.operariId) || { operari: r.operariNom, productiu: 0, n: 0 };
            e.productiu += r.productiu;
            e.n += 1;
            ops.set(r.operariId, e);
        });
        return Array.from(perFaseMap.entries())
            .map(([fase, ops]) => {
                const llista = Array.from(ops.entries()).map(([id, v]) => ({
                    operariId: id,
                    operari: v.operari,
                    productiu: v.productiu,
                    n: v.n,
                    mitjana: v.n ? Math.round(v.productiu / v.n) : 0,
                }));
                const ordenats = llista.slice().sort((a, b) => {
                    if (a.mitjana !== b.mitjana) return a.mitjana - b.mitjana;
                    return String(a.operari).localeCompare(String(b.operari), 'es');
                });
                const minMitjana = ordenats.length ? ordenats[0].mitjana : Infinity;
                const raptors = minMitjana === Infinity
                    ? []
                    : ordenats.filter((o) => o.mitjana === minMitjana);
                return {
                    fase,
                    operaris: ordenats,
                    raptors,
                    mitjana: minMitjana === Infinity ? null : minMitjana,
                    nOperaris: ordenats.length,
                };
            })
            .sort((a, b) => ordreFase(a.fase) - ordreFase(b.fase));
    }, [regsAmbFase]);

    // Tiempo medio / total por exclusiva (sin duplicar por pausas/reanudaciones: cada registre cuenta una vez)
    const perExclusiva = useMemo(() => {
        const map = new Map();
        let lliure = null;
        regsAmbFase.forEach((r) => {
            const isLliureSenseEx = (r.tipus === 'lliure' || r.fase === 'Trabajo libre') && !r.exclusivaId;
            if (isLliureSenseEx) {
                if (!lliure) {
                    lliure = {
                        id: '__lliure__',
                        codi: 'Trabajo libre',
                        article: 'Sin exclusiva asociada',
                        referencia: '',
                        productiu: 0, parada: 0, total: 0, n: 0,
                        fases: new Set(), fasesList: [],
                        senseExclusiva: true,
                    };
                }
                lliure.productiu += r.productiu;
                lliure.parada += r.parada;
                lliure.total += r.productiu + r.parada;
                lliure.n += 1;
                lliure.fases.add(r.fase);
                return;
            }
            if (!r.exclusivaId) return;
            const e = map.get(r.exclusivaId) || {
                id: r.exclusivaId,
                codi: r.exclusivaCodi || r.exclusivaId,
                article: r.exclusivaArticle || '',
                referencia: r.exclusivaRef || '',
                productiu: 0, parada: 0, total: 0, n: 0,
                fases: new Set(),
                senseExclusiva: false,
            };
            if (r.exclusivaCodi && (!e.codi || e.codi === r.exclusivaId)) e.codi = r.exclusivaCodi;
            if (r.exclusivaArticle) e.article = r.exclusivaArticle;
            if (r.exclusivaRef) e.referencia = r.exclusivaRef;
            e.productiu += r.productiu;
            e.parada += r.parada;
            e.total += r.productiu + r.parada;
            e.n += 1;
            // Solo fases canónicas 1-4 (no Trabajo libre como fase de exclusiva)
            if (/^Fase\s*[1-4]$/i.test(r.fase) || /^fase\s*[1-4]$/i.test(r.fase)) {
                e.fases.add(canonFase(r.fase));
            } else if (r.fase && r.fase !== 'Trabajo libre') {
                e.fases.add(r.fase);
            }
            map.set(r.exclusivaId, e);
        });
        const rows = Array.from(map.values()).map((e) => {
            const nFases = e.fases.size;
            return {
                ...e,
                nFases,
                fasesLabel: Array.from(e.fases).sort((a, b) => ordreFase(a) - ordreFase(b)).join(', ') || '—',
                // Media por registro de la exclusiva (tiempo medio por ciclo/fase registrada)
                mitjanaProd: e.n ? Math.round(e.productiu / e.n) : 0,
                mitjanaTotal: e.n ? Math.round(e.total / e.n) : 0,
                // Media por fase distinta tocada
                mitjanaPerFase: nFases ? Math.round(e.productiu / nFases) : 0,
            };
        });
        if (lliure) {
            rows.push({
                ...lliure,
                nFases: lliure.fases.size,
                fasesLabel: 'Trabajo libre',
                mitjanaProd: lliure.n ? Math.round(lliure.productiu / lliure.n) : 0,
                mitjanaTotal: lliure.n ? Math.round(lliure.total / lliure.n) : 0,
                mitjanaPerFase: lliure.n ? Math.round(lliure.productiu / lliure.n) : 0,
            });
        }
        return rows;
    }, [regsAmbFase]);

    const perExclusivaSorted = useMemo(() => {
        const { key, dir } = sortEx;
        const mul = dir === 'asc' ? 1 : -1;
        return [...perExclusiva].sort((a, b) => {
            // Trabajo libre al final
            if (a.senseExclusiva && !b.senseExclusiva) return 1;
            if (!a.senseExclusiva && b.senseExclusiva) return -1;
            const va = a[key];
            const vb = b[key];
            if (typeof va === 'string' || typeof vb === 'string') {
                return mul * String(va || '').localeCompare(String(vb || ''), 'es', { numeric: true });
            }
            return mul * ((Number(va) || 0) - (Number(vb) || 0));
        });
    }, [perExclusiva, sortEx]);

    const mitjanaExclusives = useMemo(() => {
        const reals = perExclusiva.filter((e) => !e.senseExclusiva);
        if (!reals.length) return { productiu: 0, total: 0, n: 0 };
        const sumP = reals.reduce((a, e) => a + e.productiu, 0);
        const sumT = reals.reduce((a, e) => a + e.total, 0);
        return {
            productiu: Math.round(sumP / reals.length),
            total: Math.round(sumT / reals.length),
            n: reals.length,
        };
    }, [perExclusiva]);

    const toggleSortEx = (key) => {
        setSortEx((prev) => (
            prev.key === key
                ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
                : { key, dir: key === 'codi' || key === 'article' ? 'asc' : 'desc' }
        ));
    };

    const totals = useMemo(() => ({
        productiu: perFase.reduce((a, f) => a + f.productiu, 0),
        parada: perFase.reduce((a, f) => a + f.parada, 0),
        n: regsAmbFase.length,
        exclusives: new Set(regsAmbFase.map((r) => r.exclusivaId).filter(Boolean)).size,
        operaris: perOperari.length,
    }), [perFase, regsAmbFase, perOperari]);

    const chartFases = perFase.map((f) => ({
        fase: f.fase,
        Productivo: Math.round(f.productiu / 60),
        Parada: Math.round(f.parada / 60),
    }));

    return (
        <div className="grid gap-5">
            <Helmet>
                <title>Informe de tiempos por fase | Control de producción</title>
                <meta name="description" content="Informe de tiempos de confección por fase, media por fase y ranking por operario con filtros de periodo." />
            </Helmet>

            {/* Header + filtros */}
            <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                    <div>
                        <h2 className="font-display text-2xl uppercase leading-none flex items-center gap-2">
                            <Clock className="h-6 w-6" /> Informe de tiempos por fase
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Tiempo productivo y de parada por fase, media y ranking por operario.
                        </p>
                    </div>
                    <button onClick={carrega} className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3 h-9 text-sm font-semibold hover:bg-secondary active:scale-95">
                        <RefreshCcw className="h-4 w-4" /> Actualizar
                    </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 rounded-lg bg-secondary p-1">
                        {PERIODES.map((p) => (
                            <button
                                key={p.id}
                                onClick={() => setPeriode(p.id)}
                                className={`rounded-md px-3 h-8 text-sm font-semibold transition ${
                                    periode === p.id ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                {p.label}
                            </button>
                        ))}
                        <button
                            onClick={() => setPeriode('custom')}
                            className={`rounded-md px-3 h-8 text-sm font-semibold transition ${
                                periode === 'custom' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            Personalizado
                        </button>
                    </div>
                    {periode === 'custom' && (
                        <div className="flex flex-wrap items-center gap-2">
                            <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                                Desde
                                <input
                                    type="date"
                                    value={customStart}
                                    onChange={(e) => setCustomStart(e.target.value)}
                                    className="rounded-md border border-border bg-background px-2 h-8 text-sm"
                                />
                            </label>
                            <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                                Hasta
                                <input
                                    type="date"
                                    value={customEnd}
                                    onChange={(e) => setCustomEnd(e.target.value)}
                                    className="rounded-md border border-border bg-background px-2 h-8 text-sm"
                                />
                            </label>
                        </div>
                    )}
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" /> {fmtRang(rang.start, rang.end)}
                    </span>
                </div>
            </div>

            {error && (
                <div className="rounded-md bg-destructive/10 px-4 py-3 text-destructive text-sm flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" /> {error}
                </div>
            )}

            <div className="rounded-md bg-[hsl(var(--warn))]/10 border border-[hsl(var(--warn))]/30 px-4 py-2.5 text-sm text-[hsl(var(--warn))] flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>
                    Se excluyen del informe los registros cuyo tiempo total supera las {UMBRAL_HORAS_EXCLUSIO} horas
                    {' '}({UMBRAL_SEGONS_EXCLUSIO.toLocaleString('es-ES')} s) por posible cronómetro dejado activo.
                    {' '}Los registros de exactamente {UMBRAL_HORAS_EXCLUSIO} horas sí se mantienen.
                    {exclosos > 0 && !carregant && (
                        <span className="font-semibold"> · {exclosos} registro{exclosos === 1 ? '' : 's'} excluido{exclosos === 1 ? '' : 's'} en este periodo.</span>
                    )}
                </span>
            </div>

            {carregant ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-secondary" />)}</div>
            ) : (
                <>
                    {/* KPIs */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                        <div className="rounded-lg bg-primary/10 px-3 py-3 text-center">
                            <p className="text-xs text-muted-foreground">Tiempo productivo</p>
                            <p className="font-display text-xl text-primary">{formatSegons(totals.productiu)}</p>
                        </div>
                        <div className="rounded-lg bg-[hsl(var(--warn))]/10 px-3 py-3 text-center">
                            <p className="text-xs text-muted-foreground">Tiempo parada</p>
                            <p className="font-display text-xl text-[hsl(var(--warn))]">{formatSegons(totals.parada)}</p>
                        </div>
                        <div className="rounded-lg bg-[hsl(var(--ok))]/10 px-3 py-3 text-center">
                            <p className="text-xs text-muted-foreground">Registros</p>
                            <p className="font-display text-xl text-[hsl(var(--ok))]">{totals.n}</p>
                        </div>
                        <div className="rounded-lg bg-secondary px-3 py-3 text-center">
                            <p className="text-xs text-muted-foreground">Exclusivas</p>
                            <p className="font-display text-xl text-foreground">{totals.exclusives}</p>
                        </div>
                        <div className="rounded-lg bg-secondary px-3 py-3 text-center">
                            <p className="text-xs text-muted-foreground">Operarios</p>
                            <p className="font-display text-xl text-foreground">{totals.operaris}</p>
                        </div>
                        <div className="rounded-lg bg-secondary px-3 py-3 text-center">
                            <p className="text-xs text-muted-foreground">Fases</p>
                            <p className="font-display text-xl text-foreground">{perFase.length}</p>
                        </div>
                    </div>

                    {/* Tiempo por fase + media */}
                    <section className="rounded-xl border border-border bg-card p-5">
                        <h3 className="font-display text-xl uppercase mb-4 flex items-center gap-2"><Layers className="h-5 w-5" /> Tiempo por fase</h3>
                        {perFase.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-8 text-center">Sin datos para el periodo seleccionado.</p>
                        ) : (
                            <div className="grid gap-5 lg:grid-cols-2">
                                <div className="overflow-auto rounded-lg border border-border">
                                    <table className="w-full min-w-[520px] text-sm">
                                        <thead className="bg-secondary text-left text-xs uppercase">
                                            <tr>
                                                {['Fase', 'Registros', 'T. productivo', 'T. parada', 'T. total', 'Media prod.', 'Media total'].map((h) => (
                                                    <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {perFase.map((f) => (
                                                <tr key={f.fase}>
                                                    <td className="px-3 py-2 font-semibold">
                                                        <span className="inline-flex items-center gap-1.5">
                                                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: FASE_COLORS[f.fase] || '#94a3b8' }} />
                                                            {f.fase}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2 text-right tabular-nums">{f.n}</td>
                                                    <td className="px-3 py-2 text-right tabular-nums text-[hsl(var(--ok))]">{formatSegons(f.productiu)}</td>
                                                    <td className="px-3 py-2 text-right tabular-nums text-[hsl(var(--warn))]">{formatSegons(f.parada)}</td>
                                                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatSegons(f.total)}</td>
                                                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatSegons(f.mitjana)}</td>
                                                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatSegons(f.mitjanaTotal)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-secondary/60 font-semibold">
                                            <tr>
                                                <td className="px-3 py-2">Total</td>
                                                <td className="px-3 py-2 text-right tabular-nums">{totals.n}</td>
                                                <td className="px-3 py-2 text-right tabular-nums text-[hsl(var(--ok))]">{formatSegons(totals.productiu)}</td>
                                                <td className="px-3 py-2 text-right tabular-nums text-[hsl(var(--warn))]">{formatSegons(totals.parada)}</td>
                                                <td className="px-3 py-2 text-right tabular-nums">{formatSegons(totals.productiu + totals.parada)}</td>
                                                <td colSpan={2} />
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                                <div>
                                    <p className="text-sm font-semibold mb-2">Productivo vs parada por fase (min)</p>
                                    <ResponsiveContainer width="100%" height={300}>
                                        <BarChart data={chartFases} margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                                            <XAxis dataKey="fase" tick={{ fontSize: 11 }} />
                                            <YAxis tick={{ fontSize: 11 }} />
                                            <Tooltip formatter={(v) => [`${v} min`, '']} />
                                            <Legend />
                                            <Bar dataKey="Productivo" stackId="a" fill="#10b981" name="Productivo" />
                                            <Bar dataKey="Parada" stackId="a" fill="#f59e0b" name="Parada" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}
                    </section>

                    {/* Operario más rápido por fase */}
                    <section className="rounded-xl border-2 border-[hsl(var(--ok))]/40 bg-card p-5">
                        <div className="mb-4">
                            <h3 className="font-display text-xl uppercase flex items-center gap-2">
                                <TrendingUp className="h-5 w-5" /> Operario más rápido por fase
                            </h3>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Para cada fase se muestra la media de tiempo productivo válida de cada operario que participa, ordenada de menor a mayor
                                {' '}(pausas excluidas, registros superiores a 8 horas excluidos, 8 horas exactas incluidas), dentro del periodo y filtros seleccionados.
                                {' '}El operario más rápido queda destacado; en caso de empate se destacan todos. Si no hay datos válidos, «Sin datos».
                            </p>
                        </div>
                        {mesRapidPerFase.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-8 text-center">Sin datos para el periodo seleccionado.</p>
                        ) : (
                            <div className="overflow-auto rounded-lg border border-border table-wrap">
                                <table className="w-full min-w-[720px] text-sm">
                                    <thead className="bg-secondary text-left text-xs uppercase">
                                        <tr>
                                            <th className="px-3 py-2 font-semibold">Fase</th>
                                            <th className="px-3 py-2 font-semibold">Operario</th>
                                            <th className="px-3 py-2 font-semibold text-right">Tiempo medio</th>
                                            <th className="px-3 py-2 font-semibold text-right">Registros</th>
                                            <th className="px-3 py-2 font-semibold text-right">Operarios en la fase</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {mesRapidPerFase.map((f) => {
                                            const files = f.operaris.length ? f.operaris : [null];
                                            return files.map((o, i) => {
                                                const esRapid = o && f.raptors.some((r) => r.operariId === o.operariId);
                                                return (
                                                    <tr key={`${f.fase}-${o?.operariId || 'buit'}`} className={esRapid ? 'bg-[hsl(var(--ok)/0.08)]' : 'hover:bg-secondary/30'}>
                                                        {i === 0 && (
                                                            <td className="px-3 py-2 font-semibold align-top border-r border-border" rowSpan={files.length}>
                                                                <span className="inline-flex items-center gap-1.5">
                                                                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: FASE_COLORS[f.fase] || '#94a3b8' }} />
                                                                    {f.fase}
                                                                </span>
                                                            </td>
                                                        )}
                                                        <td className="px-3 py-2">
                                                            {!o ? (
                                                                <span className="text-muted-foreground">Sin datos</span>
                                                            ) : (
                                                                <span className={esRapid ? 'font-semibold text-[hsl(var(--ok))]' : 'font-medium'}>
                                                                    {o.operari}
                                                                    {esRapid && (
                                                                        <span className="ml-2 text-[10px] uppercase tracking-wide font-semibold">Más rápido</span>
                                                                    )}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className={`px-3 py-2 text-right tabular-nums ${esRapid ? 'text-primary font-semibold' : ''}`}>
                                                            {!o || o.n === 0 ? 'Sin datos' : formatSegons(o.mitjana)}
                                                        </td>
                                                        <td className="px-3 py-2 text-right tabular-nums">
                                                            {!o ? '—' : o.n}
                                                        </td>
                                                        {i === 0 && (
                                                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground align-top" rowSpan={files.length}>
                                                                {f.nOperaris}
                                                            </td>
                                                        )}
                                                    </tr>
                                                );
                                            });
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <p className="mt-3 text-xs text-muted-foreground">
                            «Tiempo medio» es la media de tiempo productivo (sin pausas) de cada operario en esa fase dentro del periodo, ordenada de menor a mayor.
                            {' '}«Registros» es el número de registros válidos que sustentan esa media. «Operarios en la fase» es el total de operarios con al menos un registro válido en esa fase durante el periodo.
                            {' '}«Más rápido» marca la media más baja; si hay empate, se marcan todos.
                        </p>
                    </section>

                    {/* Medias por marca de cada mono (encima de tiempo medio por exclusiva) */}
                    <section className="rounded-xl border-2 border-primary/30 bg-card p-5">
                        <div className="mb-4">
                            <h3 className="font-display text-xl uppercase flex items-center gap-2"><Tag className="h-5 w-5" /> Medias por marca de cada mono</h3>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Media de tiempo productivo por marca y por fase, sumatorio total y media de incidencias por exclusiva.
                                {' '}El <span className="font-semibold">Sumatorio total</span> y todas las medias se calculan sobre los registros válidos incluidos en el periodo y filtros seleccionados (exclusivas y registros que entran en este informe); no se inventa ni oculta el alcance.
                                {' '}La marca se toma de la exclusiva asociada al mono. Los registros sin marca se muestran como «Sin marca».
                            </p>
                        </div>
                        {perMarca.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-8 text-center">Sin datos para el periodo seleccionado.</p>
                        ) : (
                            <div className="overflow-auto rounded-lg border border-border table-wrap">
                                <table className="w-full min-w-[860px] text-sm">
                                    <thead className="bg-secondary text-left text-xs uppercase">
                                        <tr>
                                            <th className="px-3 py-2 font-semibold sticky left-0 bg-secondary">Marca</th>
                                            {marquesFases.map((f) => (
                                                <th key={f} className="px-3 py-2 font-semibold text-right">
                                                    <span className="inline-flex items-center gap-1.5 justify-end">
                                                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: FASE_COLORS[f] || '#94a3b8' }} />
                                                        {f}
                                                    </span>
                                                </th>
                                            ))}
                                            <th className="px-3 py-2 font-semibold text-right">Sumatorio total</th>
                                            <th className="px-3 py-2 font-semibold text-right">Media total</th>
                                            <th className="px-3 py-2 font-semibold text-right">Registros</th>
                                            <th className="px-3 py-2 font-semibold text-right">Incidencias medias</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {perMarca.map((m) => {
                                            const byFase = new Map(m.fases.map((f) => [f.fase, f]));
                                            return (
                                                <tr key={m.marca} className={`hover:bg-secondary/30 ${m.marca === 'Sin marca' ? 'bg-[hsl(var(--warn))]/5' : ''}`}>
                                                    <td className="px-3 py-2 font-semibold sticky left-0 bg-card">
                                                        {m.marca === 'Sin marca' ? (
                                                            <span className="text-[hsl(var(--warn))]">Sin marca</span>
                                                        ) : m.marca}
                                                    </td>
                                                    {marquesFases.map((f) => {
                                                        const fd = byFase.get(f);
                                                        return (
                                                            <td key={f} className="px-3 py-2 text-right tabular-nums text-primary">
                                                                {fd ? formatSegons(fd.mitjana) : <span className="text-muted-foreground/40">—</span>}
                                                            </td>
                                                        );
                                                    })}
                                                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-[hsl(var(--ok))]">{formatSegons(m.productiuTotal)}</td>
                                                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatSegons(m.mitjanaTotal)}</td>
                                                    <td className="px-3 py-2 text-right tabular-nums">{m.nTotal}</td>
                                                    <td className="px-3 py-2 text-right tabular-nums text-destructive">{m.mitjanaIncidencies}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <p className="mt-3 text-xs text-muted-foreground">
                            Cada celda de fase muestra la <span className="font-semibold">media</span> de tiempo productivo (sin pausas) de los registros de esa marca y fase en el periodo.
                            {' '}«Registros» es el número de registros realmente utilizados para calcular la media total de la marca.
                            {' '}«Incidencias medias» es el número de incidencias (no conformidades) de la marca dividido entre el número de exclusivas distintas de esa marca en el periodo; «—» cuando no hay exclusivas.
                            {' '}Se excluyen los registros con tiempo total superior a 8 horas; las pausas no cuentan como tiempo productivo.
                        </p>
                    </section>

                    {/* Tiempo medio por exclusiva */}
                    <section className="rounded-xl border border-border bg-card p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                            <div>
                                <h3 className="font-display text-xl uppercase flex items-center gap-2">
                                    <Package className="h-5 w-5" /> Tiempo medio por exclusiva
                                </h3>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Tiempo real dedicado a cada exclusiva en el periodo (productivo sin pausas).
                                </p>
                            </div>
                            {mitjanaExclusives.n > 0 && (
                                <div className="rounded-lg bg-primary/10 px-4 py-2 text-center min-w-[140px]">
                                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Media entre exclusivas</p>
                                    <p className="font-display text-lg text-primary">{formatSegons(mitjanaExclusives.productiu)}</p>
                                    <p className="text-[10px] text-muted-foreground">{mitjanaExclusives.n} exclusiva{mitjanaExclusives.n === 1 ? '' : 's'}</p>
                                </div>
                            )}
                        </div>
                        {perExclusivaSorted.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-8 text-center">Sin exclusivas con tiempo en el periodo seleccionado.</p>
                        ) : (
                            <div className="overflow-auto rounded-lg border border-border table-wrap">
                                <table className="w-full min-w-[820px] text-sm">
                                    <thead className="bg-secondary text-left text-xs uppercase">
                                        <tr>
                                            {[
                                                { key: 'codi', label: 'Exclusiva' },
                                                { key: 'article', label: 'Artículo / ref.' },
                                                { key: 'nFases', label: 'Fases' },
                                                { key: 'n', label: 'Registros' },
                                                { key: 'productiu', label: 'T. productivo' },
                                                { key: 'parada', label: 'T. parada' },
                                                { key: 'total', label: 'T. total' },
                                                { key: 'mitjanaProd', label: 'Media / reg.' },
                                                { key: 'mitjanaPerFase', label: 'Media / fase' },
                                            ].map((h) => (
                                                <th key={h.key} className="px-3 py-2 font-semibold">
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleSortEx(h.key)}
                                                        className="inline-flex items-center gap-1 hover:text-primary min-h-0"
                                                    >
                                                        {h.label}
                                                        <ArrowUpDown className={`h-3 w-3 ${sortEx.key === h.key ? 'text-primary' : 'opacity-40'}`} />
                                                    </button>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {perExclusivaSorted.map((ex) => (
                                            <tr
                                                key={ex.id}
                                                className={`hover:bg-secondary/30 ${ex.senseExclusiva ? 'bg-[hsl(var(--warn))]/5' : ''}`}
                                            >
                                                <td className="px-3 py-2 font-semibold">
                                                    {ex.codi || '—'}
                                                    {ex.senseExclusiva && (
                                                        <span className="ml-2 text-[10px] uppercase tracking-wide text-[hsl(var(--warn))]">Separado</span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-muted-foreground">
                                                    <span className="block text-foreground">{ex.article || '—'}</span>
                                                    {ex.referencia && ex.referencia !== ex.article && (
                                                        <span className="text-xs">{ex.referencia}</span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2">
                                                    <span className="text-xs">{ex.fasesLabel}</span>
                                                    <span className="ml-1 tabular-nums text-muted-foreground">({ex.nFases})</span>
                                                </td>
                                                <td className="px-3 py-2 text-right tabular-nums">{ex.n}</td>
                                                <td className="px-3 py-2 text-right tabular-nums text-[hsl(var(--ok))] font-semibold">{formatSegons(ex.productiu)}</td>
                                                <td className="px-3 py-2 text-right tabular-nums text-[hsl(var(--warn))]">{formatSegons(ex.parada)}</td>
                                                <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatSegons(ex.total)}</td>
                                                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatSegons(ex.mitjanaProd)}</td>
                                                <td className="px-3 py-2 text-right tabular-nums text-primary font-semibold">{formatSegons(ex.mitjanaPerFase)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    {mitjanaExclusives.n > 0 && (
                                        <tfoot className="bg-secondary/60 font-semibold">
                                            <tr>
                                                <td className="px-3 py-2" colSpan={4}>Media entre exclusivas ({mitjanaExclusives.n})</td>
                                                <td className="px-3 py-2 text-right tabular-nums text-[hsl(var(--ok))]">{formatSegons(mitjanaExclusives.productiu)}</td>
                                                <td className="px-3 py-2" />
                                                <td className="px-3 py-2 text-right tabular-nums">{formatSegons(mitjanaExclusives.total)}</td>
                                                <td colSpan={2} />
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            </div>
                        )}
                        <p className="mt-3 text-xs text-muted-foreground">
                            Cada registro cuenta una sola vez: el tiempo productivo excluye pausas. «Media / fase» es el productivo total de la exclusiva dividido por el número de fases distintas tocadas. El trabajo libre sin exclusiva asociada se muestra aparte y no entra en la media entre exclusivas.
                        </p>
                    </section>

                    {/* Ranking por operario y fase */}
                    <section className="rounded-xl border border-border bg-card p-5">
                        <h3 className="font-display text-xl uppercase mb-4 flex items-center gap-2"><TrendingUp className="h-5 w-5" /> Ranking por operario y fase</h3>
                        {rankingOpFase.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-8 text-center">Sin datos para el periodo seleccionado.</p>
                        ) : (
                            <div className="overflow-auto rounded-lg border border-border">
                                <table className="w-full min-w-[760px] text-sm">
                                    <thead className="bg-secondary text-left text-xs uppercase">
                                        <tr>
                                            {['#', 'Operario', 'Fase', 'T. productivo', 'Media prod.', 'T. parada', 'T. total', 'Registros', 'Exclusivas'].map((h) => (
                                                <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {rankingOpFase.map((r, i) => (
                                            <tr key={`${r.operariId}-${r.fase}`} className="hover:bg-secondary/30">
                                                <td className="px-3 py-2 tabular-nums font-semibold text-muted-foreground">{i + 1}</td>
                                                <td className="px-3 py-2 font-semibold">{r.operari}</td>
                                                <td className="px-3 py-2">
                                                    <span className="inline-flex items-center gap-1.5">
                                                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: FASE_COLORS[r.fase] || '#94a3b8' }} />
                                                        {r.fase}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2 text-right tabular-nums text-[hsl(var(--ok))]">{formatSegons(r.productiu)}</td>
                                                <td className="px-3 py-2 text-right tabular-nums text-primary font-semibold">{formatSegons(r.mitjana)}</td>
                                                <td className="px-3 py-2 text-right tabular-nums text-[hsl(var(--warn))]">{formatSegons(r.parada)}</td>
                                                <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatSegons(r.total)}</td>
                                                <td className="px-3 py-2 text-right tabular-nums">{r.n}</td>
                                                <td className="px-3 py-2 text-right tabular-nums">{r.exclusives}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>

                    {/* Resumen por operario (exclusivas distintas) */}
                    <section className="rounded-xl border border-border bg-card p-5">
                        <h3 className="font-display text-xl uppercase mb-4 flex items-center gap-2"><Users className="h-5 w-5" /> Resumen por operario</h3>
                        {perOperari.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-8 text-center">Sin datos para el periodo seleccionado.</p>
                        ) : (
                            <div className="overflow-auto rounded-lg border border-border">
                                <table className="w-full min-w-[640px] text-sm">
                                    <thead className="bg-secondary text-left text-xs uppercase">
                                        <tr>
                                            {['#', 'Operario', 'T. productivo', 'T. parada', 'T. total', 'Registros', 'Fases', 'Exclusivas distintas'].map((h) => (
                                                <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {perOperari.map((o, i) => (
                                            <tr key={o.operariId} className="hover:bg-secondary/30">
                                                <td className="px-3 py-2 tabular-nums font-semibold text-muted-foreground">{i + 1}</td>
                                                <td className="px-3 py-2 font-semibold">{o.operari}</td>
                                                <td className="px-3 py-2 text-right tabular-nums text-[hsl(var(--ok))]">{formatSegons(o.productiu)}</td>
                                                <td className="px-3 py-2 text-right tabular-nums text-[hsl(var(--warn))]">{formatSegons(o.parada)}</td>
                                                <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatSegons(o.total)}</td>
                                                <td className="px-3 py-2 text-right tabular-nums">{o.n}</td>
                                                <td className="px-3 py-2 text-right tabular-nums">{o.nFases}</td>
                                                <td className="px-3 py-2 text-right tabular-nums font-semibold">{o.exclusives}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <p className="mt-3 text-xs text-muted-foreground">
                            «Exclusivas distintas» cuenta cada exclusiva una sola vez por operario, sin duplicar por pausas, reanudaciones, recargas ni varios registros de la misma exclusiva.
                        </p>
                    </section>

                </>
            )}
        </div>
    );
}

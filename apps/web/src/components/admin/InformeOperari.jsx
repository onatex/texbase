import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
    Clock, Calendar, TrendingUp, Users, Layers, RefreshCcw, AlertCircle,
    User, LogIn, LogOut, History, AlertTriangle, Wrench, Search, ChevronDown,
    ChevronLeft, ChevronRight,
} from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { segonsProductiusRegistre, segonsParadaRegistre } from '@/lib/operacionsUtils';
import { canonFase, faseOrdre } from '@/lib/fasesUtils';
import { UMBRAL_SEGONS_EXCLUSIO, UMBRAL_HORAS_EXCLUSIO } from '@/lib/mitjanesUtils';

const formatSegons = (s) => {
    const n = Math.max(0, Math.floor(Number(s) || 0));
    const h = Math.floor(n / 3600);
    const m = Math.floor((n % 3600) / 60);
    const seg = n % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${seg}s`;
    return `${seg}s`;
};

const fmtHora = (d) => {
    if (!d) return '—';
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return '—';
    return dt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
};

const fmtDia = (d) => {
    if (!d) return '—';
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return '—';
    return dt.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit' });
};

const fmtDateTime = (d) => {
    if (!d) return '—';
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return '—';
    return dt.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const PERIODES = [
    { id: 'dia', label: '1 día', dies: 1 },
    { id: 'setmana', label: '1 semana', dies: 7 },
    { id: 'mes', label: '1 mes', dies: 30 },
    { id: 'any', label: '1 año', dies: 365 },
];

const FASE_COLORS = {
    'Fase 1': '#1e3a5f',
    'Fase 2': '#f97316',
    'Fase 3': '#10b981',
    'Fase 4': '#6366f1',
    'Trabajo libre': '#f59e0b',
    'Sin fase': '#94a3b8',
};

const ESTAT_BADGE = {
    en_curs: 'bg-[hsl(var(--warn))]/20 text-[hsl(var(--warn))]',
    pausat: 'bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))]',
    finalitzat: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]',
};

const NC_ESTAT_BADGE = {
    oberta: 'bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))]',
    en_seguiment: 'bg-primary/10 text-primary',
    tancada: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]',
};

const RETR_ESTAT_BADGE = {
    pendiente: 'bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))]',
    en_proceso: 'bg-primary/10 text-primary',
    completado: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]',
    verificado: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]',
    rechazado: 'bg-destructive/10 text-destructive',
};

const JORNADA_SEGONS = 8 * 3600;

const pctColor = (pct) => {
    if (pct >= 75) return 'text-[hsl(var(--ok))]';
    if (pct >= 50) return 'text-primary';
    if (pct >= 25) return 'text-[hsl(var(--warn))]';
    return 'text-destructive';
};

const pctBarColor = (pct) => {
    if (pct >= 75) return 'bg-[hsl(var(--ok))]';
    if (pct >= 50) return 'bg-primary';
    if (pct >= 25) return 'bg-[hsl(var(--warn))]';
    return 'bg-destructive';
};

/**
 * Calcula la hora del último evento de un registre:
 *  - finalitzat: hora de finalización (fi, fallback updated).
 *  - pausat: hora de inicio de la última pausa abierta (o fi de la última cerrada).
 *  - en_curs: ahora (sigue trabajando).
 */
function horaUltimEvent(r, nowMs = Date.now()) {
    if (!r) return null;
    if (r.estat === 'finalitzat') {
        return r.fi || r.updated || null;
    }
    if (r.estat === 'pausat') {
        const pauses = Array.isArray(r.pauses) ? r.pauses : [];
        // Última pausa abierta (sin fi) → su inici es el momento de pausa.
        const oberta = pauses.find((p) => p && p.inici && !p.fi);
        if (oberta?.inici) return oberta.inici;
        // Si todas cerradas, la última pausa cerrada (fi).
        let ultima = null;
        pauses.forEach((p) => {
            if (p?.fi) {
                const t = new Date(p.fi).getTime();
                if (!Number.isNaN(t) && (!ultima || t > ultima.t)) ultima = { t, raw: p.fi };
            }
        });
        if (ultima) return ultima.raw;
        return r.updated || null;
    }
    if (r.estat === 'en_curs') {
        return new Date(nowMs).toISOString();
    }
    return r.fi || r.updated || null;
}

function diaKey(iso) {
    if (!iso) return null;
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return null;
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export default function InformeOperari() {
    const [operariId, setOperariId] = useState('');
    const [operaris, setOperaris] = useState([]);
    const [operarisCarregant, setOperarisCarregant] = useState(true);
    const [countsByOp, setCountsByOp] = useState({});
    const [q, setQ] = useState('');

    const [periode, setPeriode] = useState('mes');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [faseFil, setFaseFil] = useState('totes');
    const [exclusivaFil, setExclusivaFil] = useState('totes');
    const [estatFil, setEstatFil] = useState('totes');

    const [registres, setRegistres] = useState([]);
    const [opsDef, setOpsDef] = useState([]);
    const [exclusives, setExclusives] = useState([]);
    const [monos, setMonos] = useState([]);
    const [noConformitats, setNoConformitats] = useState([]);
    const [retrabajos, setRetrabajos] = useState([]);
    const [carregant, setCarregant] = useState(false);
    const [error, setError] = useState('');
    const [now, setNow] = useState(Date.now());
    const [mesVista, setMesVista] = useState(() => {
        const d = new Date();
        return { y: d.getFullYear(), m: d.getMonth() };
    });
    const [diaSeleccionat, setDiaSeleccionat] = useState(null);

    // Cargar lista de operarios (confección + calidad) + cualquier usuario que
    // tenga registros asociados, para distinguir duplicados por nombre (p.ej.
    // un "Amin" real con datos frente a un duplicado sin actividad). Los datos
    // del informe siempre se trazan por la relación real operari = user.id,
    // nunca por coincidencia de código OP.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [users, regs, ncs, rts] = await Promise.all([
                    pb.collection('users').getFullList({
                        sort: 'codi',
                        filter: "rol = 'operari' || rol = 'qualitat'",
                        requestKey: 'inf-op-users',
                    }),
                    pb.collection('registres').getFullList({ fields: 'operari', perPage: 1000, requestKey: 'inf-op-regs-all' }).catch(() => []),
                    pb.collection('no_conformitats').getFullList({ fields: 'operari_que_detecto', perPage: 1000, requestKey: 'inf-op-nc-all' }).catch(() => []),
                    pb.collection('retrabajos').getFullList({ fields: 'operario_asignado', perPage: 1000, requestKey: 'inf-op-rt-all' }).catch(() => []),
                ]);
                if (cancelled) return;
                const counts = {};
                const bump = (id, k) => {
                    if (!id) return;
                    if (!counts[id]) counts[id] = { registres: 0, nc: 0, rt: 0 };
                    counts[id][k] += 1;
                };
                regs.forEach((r) => bump(r.operari, 'registres'));
                ncs.forEach((n) => bump(n.operari_que_detecto, 'nc'));
                rts.forEach((r) => bump(r.operario_asignado, 'rt'));

                // Incluir usuarios con registros aunque su rol no sea operari/qualitat
                // (identidad real por relación, no por código OP ni por nombre).
                const known = new Set(users.map((u) => u.id));
                const missing = Object.keys(counts).filter((id) => !known.has(id));
                let extra = [];
                if (missing.length) {
                    const f = missing.map((id) => `id = "${id}"`).join(' || ');
                    extra = await pb.collection('users').getFullList({ filter: f, requestKey: 'inf-op-extra' }).catch(() => []);
                }
                const all = [...users, ...extra];

                // Operarios huérfanos: tienen registros/incidencias/retrabajos pero
                // su user.id ya no existe como cuenta (p.ej. cuenta borrada o
                // identidad migrada). Sin esto, sus datos quedan inaccesibles en el
                // selector. Se añade una entrada sintética para poder consultarlos.
                const resolvedIds = new Set(all.map((u) => u.id));
                for (const id of Object.keys(counts)) {
                    if (resolvedIds.has(id)) continue;
                    all.push({
                        id,
                        codi: '',
                        name: `Operario (sin cuenta)`,
                        email: id,
                        rol: 'operari',
                        _orfe: true,
                    });
                }

                all.sort((a, b) => {
                    const ca = (counts[a.id]?.registres || 0) + (counts[a.id]?.nc || 0) + (counts[a.id]?.rt || 0);
                    const cb = (counts[b.id]?.registres || 0) + (counts[b.id]?.nc || 0) + (counts[b.id]?.rt || 0);
                    if (ca !== cb) return cb - ca;
                    return (a.codi || a.name || '').localeCompare(b.codi || b.name || '', 'es');
                });
                if (cancelled) return;
                setOperaris(all);
                setCountsByOp(counts);
            } catch {
                if (!cancelled) setOperaris([]);
            } finally {
                if (!cancelled) setOperarisCarregant(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const rang = useMemo(() => {
        if (periode === 'custom' && customStart && customEnd) {
            const start = new Date(`${customStart}T00:00:00`);
            const end = new Date(`${customEnd}T23:59:59.999`);
            if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start <= end) {
                return { start, end };
            }
        }
        const p = PERIODES.find((x) => x.id === periode) || PERIODES[2];
        const end = new Date();
        const start = new Date(end.getTime() - p.dies * 24 * 60 * 60 * 1000);
        return { start, end };
    }, [periode, customStart, customEnd]);

    // Sincroniza el mes del calendario con el periodo seleccionado
    useEffect(() => {
        setMesVista({ y: rang.end.getFullYear(), m: rang.end.getMonth() });
    }, [rang.start, rang.end]);

    const carrega = useCallback(async () => {
        if (!operariId) return;
        setCarregant(true);
        setError('');
        try {
            const startIso = rang.start.toISOString();
            const endIso = rang.end.toISOString();
            const filterReg = pb.filter('operari = {:op} && inici >= {:s} && inici <= {:e}', {
                op: operariId, s: startIso, e: endIso,
            });
            const [rs, ops, exs, mos, ncs, rts] = await Promise.all([
                pb.collection('registres').getFullList({
                    filter: filterReg,
                    sort: '-inici',
                    expand: 'operari,exclusiva,mono',
                    requestKey: 'inf-op-regs',
                }),
                pb.collection('operacions_def').getFullList({ requestKey: 'inf-op-ops' }).catch(() => []),
                pb.collection('exclusives').getFullList({ requestKey: 'inf-op-ex' }).catch(() => []),
                pb.collection('monos').getFullList({ requestKey: 'inf-op-mo' }).catch(() => []),
                pb.collection('no_conformitats').getFullList({
                    filter: pb.filter('operari_que_detecto = {:op} && created >= {:s} && created <= {:e}', {
                        op: operariId, s: startIso, e: endIso,
                    }),
                    expand: 'exclusiva,mono',
                    requestKey: 'inf-op-nc',
                }).catch(() => []),
                pb.collection('retrabajos').getFullList({
                    filter: pb.filter('operario_asignado = {:op} && created >= {:s} && created <= {:e}', {
                        op: operariId, s: startIso, e: endIso,
                    }),
                    expand: 'exclusiva,mono',
                    requestKey: 'inf-op-rt',
                }).catch(() => []),
            ]);
            setRegistres(rs);
            setOpsDef(ops);
            setExclusives(exs);
            setMonos(mos);
            setNoConformitats(ncs || []);
            setRetrabajos(rts || []);
        } catch (e) {
            setError('No se han podido cargar los datos del operario.');
        } finally {
            setCarregant(false);
            setNow(Date.now());
        }
    }, [operariId, rang.start, rang.end]);

    useEffect(() => {
        if (operariId) carrega();
        else { setRegistres([]); setNoConformitats([]); setRetrabajos([]); }
    }, [carrega, operariId]);

    // Realtime
    useEffect(() => {
        if (!operariId) return undefined;
        const refresca = () => carrega();
        const cols = ['registres', 'no_conformitats', 'retrabajos'];
        cols.forEach((c) => { void pb.collection(c).subscribe('*', refresca).catch(() => {}); });
        return () => { cols.forEach((c) => { void pb.collection(c).unsubscribe('*').catch(() => {}); }); };
    }, [operariId, carrega]);

    // Tick para registros en curso
    useEffect(() => {
        const hasLive = registres.some((r) => r.estat === 'en_curs');
        if (!hasLive) return undefined;
        const id = setInterval(() => setNow(Date.now()), 5000);
        return () => clearInterval(id);
    }, [registres]);

    const operariSel = useMemo(() => operaris.find((o) => o.id === operariId) || null, [operaris, operariId]);

    const opsByNom = useMemo(() => {
        const m = {};
        opsDef.forEach((op) => { if (op.nom) m[op.nom] = op; });
        return m;
    }, [opsDef]);

    const exclusivesById = useMemo(() => {
        const m = {};
        exclusives.forEach((e) => { m[e.id] = e; });
        return m;
    }, [exclusives]);

    const monosById = useMemo(() => {
        const m = {};
        monos.forEach((mo) => { m[mo.id] = mo; });
        return m;
    }, [monos]);

    // Enriquecer registros con fase, marca, tiempos, exclusiva info
    const regsEnriquits = useMemo(() => {
        return registres.map((r) => {
            let fase;
            if (r.tipus === 'lliure') fase = 'Trabajo libre';
            else if (/^fase\s*\d+$/i.test(r.operacio || '')) fase = canonFase(r.operacio);
            else fase = canonFase(opsByNom[r.operacio]?.fase || 'Sin fase');
            const ex = r.expand?.exclusiva || (typeof r.exclusiva === 'string' ? exclusivesById[r.exclusiva] : null);
            const mono = r.expand?.mono || (typeof r.mono === 'string' ? monosById[r.mono] : null);
            const productiu = segonsProductiusRegistre(r, now);
            const parada = segonsParadaRegistre(r, now);
            return {
                ...r,
                fase,
                marca: ex?.marca ? String(ex.marca).trim() : '',
                productiu,
                parada,
                exclusivaObj: ex,
                monoObj: mono,
                exclusivaCodi: ex?.exclusiva || ex?.numero_exclusiva || '',
                exclusivaArticle: ex?.article || '',
                exclusivaRef: ex?.referencia || '',
                monoCodi: mono?.codi || '',
            };
        });
    }, [registres, opsByNom, exclusivesById, monosById, now]);

    // Filtrar por fase/exclusiva/estado (sin excluir por relaciones incompletas)
    const regsFiltrats = useMemo(() => {
        return regsEnriquits.filter((r) => {
            if (faseFil !== 'totes' && r.fase !== faseFil) return false;
            if (exclusivaFil !== 'totes' && (r.exclusiva || '') !== exclusivaFil) return false;
            if (estatFil !== 'totes' && r.estat !== estatFil) return false;
            return true;
        });
    }, [regsEnriquits, faseFil, exclusivaFil, estatFil]);

    // Registros válidos para medias (excluye >8h, incluye 8h exactas)
    const regsValids = useMemo(() => {
        return regsFiltrats.filter((r) => {
            const total = (r.productiu || 0) + (r.parada || 0);
            return total <= UMBRAL_SEGONS_EXCLUSIO;
        });
    }, [regsFiltrats]);

    const exclosos = regsFiltrats.length - regsValids.length;

    // Tiempos por fase
    const perFase = useMemo(() => {
        const map = new Map();
        regsValids.forEach((r) => {
            const e = map.get(r.fase) || { fase: r.fase, productiu: 0, parada: 0, total: 0, n: 0 };
            e.productiu += r.productiu;
            e.parada += r.parada;
            e.total += r.productiu + r.parada;
            e.n += 1;
            map.set(r.fase, e);
        });
        return Array.from(map.values())
            .map((e) => ({ ...e, mitjana: e.n ? Math.round(e.productiu / e.n) : 0 }))
            .sort((a, b) => faseOrdre(a.fase) - faseOrdre(b.fase));
    }, [regsValids]);

    // Días trabajados + entrada/salida por día
    const perDia = useMemo(() => {
        const map = new Map();
        regsFiltrats.forEach((r) => {
            const key = diaKey(r.inici);
            if (!key) return;
            const e = map.get(key) || { dia: key, entrada: null, salida: null, productiu: 0, parada: 0, n: 0, registres: [], exclusives: new Set() };
            const iniciMs = new Date(r.inici).getTime();
            if (!Number.isNaN(iniciMs)) {
                if (!e.entrada || iniciMs < new Date(e.entrada).getTime()) e.entrada = r.inici;
            }
            const ultim = horaUltimEvent(r, now);
            if (ultim) {
                const um = new Date(ultim).getTime();
                if (!Number.isNaN(um)) {
                    if (!e.salida || um > new Date(e.salida).getTime()) e.salida = ultim;
                }
            }
            // Solo contar tiempo productivo válido (sin >8h)
            const total = (r.productiu || 0) + (r.parada || 0);
            if (total <= UMBRAL_SEGONS_EXCLUSIO) {
                e.productiu += r.productiu;
                e.parada += r.parada;
                if (r.exclusiva) e.exclusives.add(r.exclusiva);
            }
            e.n += 1;
            e.registres.push(r);
            map.set(key, e);
        });
        return Array.from(map.values())
            .map((e) => {
                const entMs = new Date(e.entrada).getTime();
                const salMs = new Date(e.salida).getTime();
                const presenciaSeg = (Number.isFinite(entMs) && Number.isFinite(salMs) && salMs >= entMs)
                    ? Math.floor((salMs - entMs) / 1000) : 0;
                const nExclusives = e.exclusives.size;
                const pctProductiu = e.productiu > 0 ? Math.round((e.productiu / JORNADA_SEGONS) * 100) : 0;
                const pctVisual = Math.min(100, pctProductiu);
                return { ...e, presenciaSeg, nExclusives, pctProductiu, pctVisual };
            })
            .sort((a, b) => b.dia.localeCompare(a.dia));
    }, [regsFiltrats, now]);

    const perDiaMap = useMemo(() => {
        const m = {};
        perDia.forEach((d) => { m[d.dia] = d; });
        return m;
    }, [perDia]);

    const mesLabel = useMemo(() => {
        const dt = new Date(mesVista.y, mesVista.m, 1);
        return dt.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    }, [mesVista]);

    const diesCalendari = useMemo(() => {
        const { y, m } = mesVista;
        const first = new Date(y, m, 1);
        const offset = (first.getDay() + 6) % 7; // lunes primero
        const daysInMonth = new Date(y, m + 1, 0).getDate();
        const cells = [];
        for (let i = 0; i < offset; i++) cells.push(null);
        for (let d = 1; d <= daysInMonth; d++) {
            const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            cells.push({ d, key, dt: new Date(y, m, d) });
        }
        while (cells.length % 7 !== 0) cells.push(null);
        return cells;
    }, [mesVista]);

    const canviMes = (delta) => {
        setMesVista((prev) => {
            const nm = prev.m + delta;
            const y = prev.y + Math.floor(nm / 12);
            const m = ((nm % 12) + 12) % 12;
            return { y, m };
        });
    };

    const diesTreballats = perDia.length;

    // Totales
    const totals = useMemo(() => ({
        productiu: regsValids.reduce((a, r) => a + r.productiu, 0),
        parada: regsValids.reduce((a, r) => a + r.parada, 0),
        n: regsValids.length,
        nTotal: regsFiltrats.length,
        exclusives: new Set(regsValids.map((r) => r.exclusiva).filter(Boolean)).size,
        mitjanaDia: diesTreballats ? Math.round(regsValids.reduce((a, r) => a + r.productiu, 0) / diesTreballats) : 0,
    }), [regsValids, regsFiltrats, diesTreballats]);

    const fasesDisponibles = useMemo(() => {
        const set = new Set();
        regsEnriquits.forEach((r) => set.add(r.fase));
        return Array.from(set).sort((a, b) => faseOrdre(a) - faseOrdre(b));
    }, [regsEnriquits]);

    const exclusivesDisponibles = useMemo(() => {
        const set = new Set();
        regsEnriquits.forEach((r) => { if (r.exclusiva) set.add(r.exclusiva); });
        return Array.from(set);
    }, [regsEnriquits]);

    const chartFases = perFase.map((f) => ({
        fase: f.fase,
        Productivo: Math.round(f.productiu / 60),
        Parada: Math.round(f.parada / 60),
    }));

    const chartDies = perDia.slice().reverse().map((d) => ({
        dia: d.dia.slice(5),
        Productivo: Math.round(d.productiu / 60),
        Presencia: Math.round(d.presenciaSeg / 60),
    }));

    // Historial de tiempos: flatten de eventos (inicios, pausas, reanudaciones, finalizaciones)
    const historial = useMemo(() => {
        const events = [];
        regsFiltrats.forEach((r) => {
            const ex = r.exclusivaObj;
            events.push({
                id: `${r.id}-inici`,
                moment: r.inici,
                tipus: 'inici',
                label: 'Inicio',
                registre: r,
                exclusivaCodi: r.exclusivaCodi,
                monoCodi: r.monoCodi,
                fase: r.fase,
                operacio: r.operacio,
            });
            const pauses = Array.isArray(r.pauses) ? r.pauses : [];
            pauses.forEach((p, i) => {
                if (p?.inici) {
                    events.push({
                        id: `${r.id}-p${i}-inici`,
                        moment: p.inici,
                        tipus: 'pausa',
                        label: 'Pausa',
                        registre: r,
                        exclusivaCodi: r.exclusivaCodi,
                        monoCodi: r.monoCodi,
                        fase: r.fase,
                        operacio: r.operacio,
                        causa: p.causa || p.motiu || '',
                    });
                }
                if (p?.fi) {
                    events.push({
                        id: `${r.id}-p${i}-fi`,
                        moment: p.fi,
                        tipus: 'reanudacio',
                        label: 'Reanudación',
                        registre: r,
                        exclusivaCodi: r.exclusivaCodi,
                        monoCodi: r.monoCodi,
                        fase: r.fase,
                        operacio: r.operacio,
                    });
                }
            });
            if (r.estat === 'finalitzat' && r.fi) {
                events.push({
                    id: `${r.id}-fi`,
                    moment: r.fi,
                    tipus: 'finalitzacio',
                    label: 'Finalización',
                    registre: r,
                    exclusivaCodi: r.exclusivaCodi,
                    monoCodi: r.monoCodi,
                    fase: r.fase,
                    operacio: r.operacio,
                });
            }
            if (r.retreball) {
                events.push({
                    id: `${r.id}-retreball`,
                    moment: r.inici,
                    tipus: 'retreball',
                    label: 'Retrabajo',
                    registre: r,
                    exclusivaCodi: r.exclusivaCodi,
                    monoCodi: r.monoCodi,
                    fase: r.fase,
                    operacio: r.operacio,
                });
            }
        });
        return events
            .filter((e) => e.moment)
            .sort((a, b) => new Date(b.moment).getTime() - new Date(a.moment).getTime());
    }, [regsFiltrats]);

    const eventIcon = (tipus) => {
        switch (tipus) {
            case 'inici': return <LogIn className="h-3.5 w-3.5 text-primary" />;
            case 'pausa': return <Clock className="h-3.5 w-3.5 text-[hsl(var(--warn))]" />;
            case 'reanudacio': return <RefreshCcw className="h-3.5 w-3.5 text-primary" />;
            case 'finalitzacio': return <Clock className="h-3.5 w-3.5 text-[hsl(var(--ok))]" />;
            case 'retreball': return <Wrench className="h-3.5 w-3.5 text-destructive" />;
            default: return <History className="h-3.5 w-3.5" />;
        }
    };

    const operarisFiltrats = useMemo(() => {
        const text = q.trim().toLowerCase();
        if (!text) return operaris;
        return operaris.filter((o) => `${o.codi || ''} ${o.name || ''} ${o.email || ''}`.toLowerCase().includes(text));
    }, [operaris, q]);

    return (
        <div className="grid gap-5">
            <Helmet>
                <title>Informe por operario | Control de producción</title>
                <meta name="description" content="Informe individual de resultados de un operario: tiempos, incidencias, historial, horas de entrada/salida y productividad media por día." />
            </Helmet>

            {/* Header + selector */}
            <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                    <div>
                        <h2 className="font-display text-2xl uppercase leading-none flex items-center gap-2">
                            <User className="h-6 w-6" /> Informe por operario
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Tiempos, incidencias, historial, horas de entrada/salida y productividad de un operario.
                        </p>
                    </div>
                    {operariId && (
                        <button onClick={carrega} className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3 h-9 text-sm font-semibold hover:bg-secondary active:scale-95">
                            <RefreshCcw className="h-4 w-4" /> Actualizar
                        </button>
                    )}
                </div>

                {/* Selector de operario */}
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                    <div>
                        <label className="text-xs font-semibold uppercase text-muted-foreground">Operario</label>
                        <div className="relative mt-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <input
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="Buscar por código, nombre o email…"
                                className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm"
                            />
                        </div>
                        {operarisCarregant ? (
                            <p className="mt-2 text-xs text-muted-foreground">Cargando operarios…</p>
                        ) : operarisFiltrats.length === 0 ? (
                            <p className="mt-2 text-xs text-muted-foreground">Sin operarios.</p>
                        ) : (
                            <div className="mt-2 max-h-56 overflow-auto rounded-md border border-border divide-y divide-border">
                                {operarisFiltrats.slice(0, 60).map((o) => {
                                    const c = countsByOp[o.id];
                                    const n = (c?.registres || 0) + (c?.nc || 0) + (c?.rt || 0);
                                    return (
                                    <button
                                        key={o.id}
                                        onClick={() => setOperariId(o.id)}
                                        className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition hover:bg-secondary/50 ${operariId === o.id ? 'bg-primary/10' : ''}`}
                                    >
                                        <span className="flex flex-col min-w-0 gap-0.5">
                                            <span className="flex items-center gap-2 min-w-0">
                                                <span className="font-semibold tabular-nums shrink-0">{o.codi || '—'}</span>
                                                <span className="truncate">{o.name || o.email || '—'}</span>
                                            </span>
                                            {o.email && o.email !== o.name && (
                                                <span className="text-[10px] text-muted-foreground truncate">{o.email}</span>
                                            )}
                                        </span>
                                        <span className="flex items-center gap-1 shrink-0">
                                            <span
                                                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${n > 0 ? 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]' : 'bg-secondary text-muted-foreground'}`}
                                                title="Registros asociados (tiempos, incidencias, retrabajos)"
                                            >
                                                {n}
                                            </span>
                                            <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${o.rol === 'qualitat' ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'}`}>
                                                {o.rol === 'qualitat' ? 'Calidad' : 'Confección'}
                                            </span>
                                        </span>
                                    </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    {operariSel && (
                        <div className="rounded-lg bg-secondary px-4 py-3 min-w-[200px]">
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Seleccionado</p>
                            <p className="font-display text-lg leading-tight">{operariSel.codi || '—'}</p>
                            <p className="text-sm truncate">{operariSel.name || operariSel.email}</p>
                            {operariSel.email && operariSel.email !== operariSel.name && (
                                <p className="text-[11px] text-muted-foreground truncate">{operariSel.email}</p>
                            )}
                            <span className={`mt-1 inline-block rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${operariSel.rol === 'qualitat' ? 'bg-primary/10 text-primary' : 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]'}`}>
                                {operariSel.rol === 'qualitat' ? 'Calidad' : 'Confección'}
                            </span>
                        </div>
                    )}
                </div>

                {/* Filtros */}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 rounded-lg bg-secondary p-1">
                        {PERIODES.map((p) => (
                            <button
                                key={p.id}
                                onClick={() => setPeriode(p.id)}
                                className={`rounded-md px-3 h-8 text-sm font-semibold transition ${periode === p.id ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                {p.label}
                            </button>
                        ))}
                        <button
                            onClick={() => setPeriode('custom')}
                            className={`rounded-md px-3 h-8 text-sm font-semibold transition ${periode === 'custom' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            Personalizado
                        </button>
                    </div>
                    {periode === 'custom' && (
                        <div className="flex flex-wrap items-center gap-2">
                            <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                                Desde
                                <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="rounded-md border border-border bg-background px-2 h-8 text-sm" />
                            </label>
                            <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                                Hasta
                                <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="rounded-md border border-border bg-background px-2 h-8 text-sm" />
                            </label>
                        </div>
                    )}
                    <select value={faseFil} onChange={(e) => setFaseFil(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                        <option value="totes">Todas las fases</option>
                        {fasesDisponibles.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <select value={exclusivaFil} onChange={(e) => setExclusivaFil(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm max-w-[200px]">
                        <option value="totes">Todas las exclusivas</option>
                        {exclusivesDisponibles.map((id) => {
                            const ex = exclusivesById[id];
                            return <option key={id} value={id}>{ex?.exclusiva || id}</option>;
                        })}
                    </select>
                    <select value={estatFil} onChange={(e) => setEstatFil(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                        <option value="totes">Todos los estados</option>
                        <option value="en_curs">En curso</option>
                        <option value="pausat">Pausado</option>
                        <option value="finalitzat">Finalizado</option>
                    </select>
                </div>
            </div>

            {!operariId ? (
                <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
                    <User className="mx-auto h-10 w-10 opacity-40" />
                    <p className="mt-3">Selecciona un operario para ver su informe.</p>
                </div>
            ) : error ? (
                <div className="rounded-md bg-destructive/10 px-4 py-3 text-destructive text-sm flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" /> {error}
                </div>
            ) : carregant ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-secondary" />)}</div>
            ) : (
                <>
                    {/* Aviso de exclusión >8h */}
                    <div className="rounded-md bg-[hsl(var(--warn))]/10 border border-[hsl(var(--warn))]/30 px-4 py-2.5 text-sm text-[hsl(var(--warn))] flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>
                            Se excluyen de medias y productividad los registros cuyo tiempo total supera {UMBRAL_HORAS_EXCLUSIO} horas (cronómetro dejado activo). Las pausas no cuentan como tiempo productivo.
                            {exclosos > 0 && <span className="font-semibold"> · {exclosos} registro{exclosos === 1 ? '' : 's'} excluido{exclosos === 1 ? '' : 's'}.</span>}
                        </span>
                    </div>

                    {/* KPIs */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                        <div className="rounded-lg bg-primary/10 px-3 py-3 text-center">
                            <p className="text-xs text-muted-foreground">T. productivo</p>
                            <p className="font-display text-xl text-primary">{formatSegons(totals.productiu)}</p>
                        </div>
                        <div className="rounded-lg bg-[hsl(var(--warn))]/10 px-3 py-3 text-center">
                            <p className="text-xs text-muted-foreground">T. parada</p>
                            <p className="font-display text-xl text-[hsl(var(--warn))]">{formatSegons(totals.parada)}</p>
                        </div>
                        <div className="rounded-lg bg-[hsl(var(--ok))]/10 px-3 py-3 text-center">
                            <p className="text-xs text-muted-foreground">Registros válidos</p>
                            <p className="font-display text-xl text-[hsl(var(--ok))]">{totals.n}</p>
                        </div>
                        <div className="rounded-lg bg-secondary px-3 py-3 text-center">
                            <p className="text-xs text-muted-foreground">Días trabajados</p>
                            <p className="font-display text-xl text-foreground">{diesTreballats}</p>
                        </div>
                        <div className="rounded-lg bg-secondary px-3 py-3 text-center">
                            <p className="text-xs text-muted-foreground">Exclusivas</p>
                            <p className="font-display text-xl text-foreground">{totals.exclusives}</p>
                        </div>
                        <div className="rounded-lg bg-primary/10 px-3 py-3 text-center">
                            <p className="text-xs text-muted-foreground">Prod. media/día</p>
                            <p className="font-display text-xl text-primary">{formatSegons(totals.mitjanaDia)}</p>
                        </div>
                    </div>

                    {regsValids.length === 0 && noConformitats.length === 0 && retrabajos.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
                            <AlertCircle className="mx-auto h-10 w-10 opacity-40" />
                            <p className="mt-3">Sin datos para el operario y periodo seleccionados.</p>
                        </div>
                    ) : (
                        <>
                            {/* Tiempos por fase */}
                            <section className="rounded-xl border border-border bg-card p-5">
                                <h3 className="font-display text-xl uppercase mb-4 flex items-center gap-2"><Layers className="h-5 w-5" /> Tiempos por fase</h3>
                                {perFase.length === 0 ? (
                                    <p className="text-sm text-muted-foreground py-8 text-center">Sin datos para el periodo seleccionado.</p>
                                ) : (
                                    <div className="grid gap-5 lg:grid-cols-2">
                                        <div className="overflow-auto rounded-lg border border-border table-wrap">
                                            <table className="w-full min-w-[520px] text-sm">
                                                <thead className="bg-secondary text-left text-xs uppercase">
                                                    <tr>
                                                        {['Fase', 'Registros', 'T. productivo', 'T. parada', 'T. total', 'Media prod.'].map((h) => (
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
                                                            <td className="px-3 py-2 text-right tabular-nums text-primary font-semibold">{formatSegons(f.mitjana)}</td>
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
                                                        <td className="px-3 py-2 text-right tabular-nums text-primary">{formatSegons(totals.mitjanaDia)}</td>
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

                            {/* Calendario de jornadas */}
                            <section className="rounded-xl border border-border bg-card p-5">
                                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <h3 className="font-display text-xl uppercase flex items-center gap-2"><Calendar className="h-5 w-5" /> Calendario de jornadas</h3>
                                        <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
                                            La <span className="font-semibold">entrada</span> se calcula desde el inicio de la primera fase del día;
                                            la <span className="font-semibold">salida</span> desde la pausa o finalización de la última fase.
                                            El <span className="font-semibold">tiempo de parada</span> suma las pausas y no cuenta como productivo.
                                            El <span className="font-semibold">% productivo</span> compara el tiempo productivo válido con una jornada de 8 h
                                            (limitado a 100 % en la barra; el tiempo real se muestra aparte).
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-1">
                                        <button onClick={() => canviMes(-1)} className="h-8 w-8 rounded-md hover:bg-secondary flex items-center justify-center active:scale-95" aria-label="Mes anterior"><ChevronLeft className="h-4 w-4" /></button>
                                        <span className="px-2 text-sm font-semibold capitalize min-w-[150px] text-center">{mesLabel}</span>
                                        <button onClick={() => canviMes(1)} className="h-8 w-8 rounded-md hover:bg-secondary flex items-center justify-center active:scale-95" aria-label="Mes siguiente"><ChevronRight className="h-4 w-4" /></button>
                                    </div>
                                </div>

                                {perDia.length === 0 ? (
                                    <p className="text-sm text-muted-foreground py-8 text-center">Sin datos para el periodo seleccionado.</p>
                                ) : (
                                    <>
                                        {/* Cuadrícula tipo calendario */}
                                        <div className="overflow-x-auto table-wrap">
                                            <div className="grid grid-cols-7 min-w-[820px] gap-1.5">
                                                {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => (
                                                    <div key={d} className="text-center text-[10px] font-semibold uppercase text-muted-foreground pb-1">{d}</div>
                                                ))}
                                                {diesCalendari.map((cell, i) => {
                                                    if (!cell) return <div key={`b-${i}`} className="min-h-[124px] rounded-lg bg-secondary/20" />;
                                                    const dia = perDiaMap[cell.key];
                                                    const teDades = dia && dia.n > 0;
                                                    const esFutur = cell.dt.getTime() > now;
                                                    return (
                                                        <div
                                                            key={cell.key}
                                                            onClick={teDades ? () => setDiaSeleccionat(dia) : undefined}
                                                            className={`min-h-[124px] rounded-lg border p-2 flex flex-col gap-1 ${teDades ? 'border-border bg-background shadow-sm cursor-pointer hover:border-primary hover:ring-1 hover:ring-primary/30 transition' : esFutur ? 'border-transparent bg-transparent' : 'border-dashed border-border bg-secondary/20'}`}
                                                        >
                                                            <div className="flex items-center justify-between">
                                                                <span className={`text-xs font-bold ${teDades ? 'text-foreground' : 'text-muted-foreground'}`}>{cell.d}</span>
                                                                {teDades && (
                                                                    <span className={`text-[10px] font-bold ${pctColor(dia.pctProductiu)}`}>{dia.pctProductiu}%</span>
                                                                )}
                                                            </div>
                                                            {teDades ? (
                                                                <div className="flex flex-col gap-0.5 text-[11px] leading-tight">
                                                                    <div className="flex items-center gap-1 text-primary"><LogIn className="h-3 w-3" /><span className="tabular-nums">{fmtHora(dia.entrada)}</span></div>
                                                                    <div className="flex items-center gap-1 text-[hsl(var(--ok))]"><LogOut className="h-3 w-3" /><span className="tabular-nums">{fmtHora(dia.salida)}</span></div>
                                                                    <div className="mt-0.5 flex items-center gap-1 text-[hsl(var(--ok))]"><Clock className="h-3 w-3" /><span className="tabular-nums font-semibold">{formatSegons(dia.productiu)}</span></div>
                                                                    <div className="flex items-center gap-1 text-[hsl(var(--warn))]"><Clock className="h-3 w-3" /><span className="tabular-nums">{formatSegons(dia.parada)}</span></div>
                                                                    <div className="flex items-center gap-1 text-muted-foreground"><Layers className="h-3 w-3" /><span>{dia.nExclusives} excl.</span></div>
                                                                    <div className="mt-1 h-1.5 w-full rounded-full bg-secondary overflow-hidden" title={`${dia.pctProductiu}% de 8 h productivo`}>
                                                                        <div className={`h-full rounded-full ${pctBarColor(dia.pctProductiu)}`} style={{ width: `${dia.pctVisual}%` }} />
                                                                    </div>
                                                                </div>
                                                            ) : esFutur ? null : (
                                                                <span className="text-[10px] text-muted-foreground italic mt-1">Sin datos</span>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Detalle tabular por día */}
                                        <div className="mt-5 overflow-auto rounded-lg border border-border table-wrap mb-5">
                                            <table className="w-full min-w-[820px] text-sm">
                                                <thead className="bg-secondary text-left text-xs uppercase">
                                                    <tr>
                                                        {['Día', 'Entrada', 'Salida', 'T. productivo', 'T. parada', 'Exclusivas', '% Prod. (8h)', 'Registros'].map((h) => (
                                                            <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-border">
                                                    {perDia.map((d) => (
                                                        <tr key={d.dia} className="hover:bg-secondary/30">
                                                            <td className="px-3 py-2 font-semibold capitalize">{fmtDia(d.dia)}</td>
                                                            <td className="px-3 py-2 tabular-nums text-primary font-semibold">{fmtHora(d.entrada)}</td>
                                                            <td className="px-3 py-2 tabular-nums text-[hsl(var(--ok))] font-semibold">{fmtHora(d.salida)}</td>
                                                            <td className="px-3 py-2 text-right tabular-nums text-[hsl(var(--ok))]">{formatSegons(d.productiu)}</td>
                                                            <td className="px-3 py-2 text-right tabular-nums text-[hsl(var(--warn))]">{formatSegons(d.parada)}</td>
                                                            <td className="px-3 py-2 text-right tabular-nums">{d.nExclusives}</td>
                                                            <td className={`px-3 py-2 text-right tabular-nums font-semibold ${pctColor(d.pctProductiu)}`}>{d.pctProductiu}%</td>
                                                            <td className="px-3 py-2 text-right tabular-nums">{d.n}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot className="bg-secondary/60 font-semibold">
                                                    <tr>
                                                        <td className="px-3 py-2">{diesTreballats} día{diesTreballats === 1 ? '' : 's'}</td>
                                                        <td colSpan={2} />
                                                        <td className="px-3 py-2 text-right tabular-nums text-[hsl(var(--ok))]">{formatSegons(totals.productiu)}</td>
                                                        <td className="px-3 py-2 text-right tabular-nums text-[hsl(var(--warn))]">{formatSegons(totals.parada)}</td>
                                                        <td className="px-3 py-2 text-right tabular-nums">{totals.exclusives}</td>
                                                        <td className="px-3 py-2 text-right tabular-nums text-primary">{diesTreballats ? Math.min(100, Math.round((totals.productiu / (diesTreballats * JORNADA_SEGONS)) * 100)) : 0}%</td>
                                                        <td className="px-3 py-2 text-right tabular-nums">{totals.nTotal}</td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold mb-2">Productivo vs presencia por día (min)</p>
                                            <ResponsiveContainer width="100%" height={260}>
                                                <BarChart data={chartDies} margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                                                    <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                                                    <YAxis tick={{ fontSize: 11 }} />
                                                    <Tooltip formatter={(v) => [`${v} min`, '']} />
                                                    <Legend />
                                                    <Bar dataKey="Productivo" fill="#10b981" name="Productivo" />
                                                    <Bar dataKey="Presencia" fill="#1e3a5f" name="Presencia" />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                        <p className="mt-3 text-xs text-muted-foreground">
                                            «% Prod. (8h)» = tiempo productivo válido del día ÷ 8 h, limitado a 100 % en la barra visual; el porcentaje real se muestra en la celda.
                                            El tiempo productivo excluye pausas y registros superiores a {UMBRAL_HORAS_EXCLUSIO} horas (exactamente 8 h incluido).
                                            «Exclusivas» cuenta, sin duplicados, las exclusivas con actividad válida del operario ese día.
                                            «Presencia» es el tiempo entre la entrada y la salida calculadas (orientativo, no fichaje).
                                        </p>
                                    </>
                                )}
                            </section>

                            {/* Historial de tiempos */}
                            <section className="rounded-xl border border-border bg-card p-5">
                                <div className="mb-4">
                                    <h3 className="font-display text-xl uppercase flex items-center gap-2"><History className="h-5 w-5" /> Historial de tiempos</h3>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        Inicios, pausas, reanudaciones, finalizaciones y retrabajos del operario en el periodo, respetando la trazabilidad existente.
                                    </p>
                                </div>
                                {historial.length === 0 ? (
                                    <p className="text-sm text-muted-foreground py-8 text-center">Sin datos para el periodo seleccionado.</p>
                                ) : (
                                    <div className="overflow-auto rounded-lg border border-border table-wrap max-h-[480px]">
                                        <table className="w-full min-w-[760px] text-sm">
                                            <thead className="bg-secondary text-left text-xs uppercase sticky top-0">
                                                <tr>
                                                    {['Moment', 'Evento', 'Exclusiva', 'Mono', 'Fase', 'Operación', 'Estado', 'T. prod.', 'Detalle'].map((h) => (
                                                        <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border">
                                                {historial.slice(0, 300).map((ev) => {
                                                    const r = ev.registre;
                                                    return (
                                                        <tr key={ev.id} className="hover:bg-secondary/30">
                                                            <td className="px-3 py-2 tabular-nums whitespace-nowrap">{fmtDateTime(ev.moment)}</td>
                                                            <td className="px-3 py-2">
                                                                <span className="inline-flex items-center gap-1.5 font-semibold">
                                                                    {eventIcon(ev.tipus)} {ev.label}
                                                                </span>
                                                            </td>
                                                            <td className="px-3 py-2">{ev.exclusivaCodi || '—'}</td>
                                                            <td className="px-3 py-2 tabular-nums">{ev.monoCodi || '—'}</td>
                                                            <td className="px-3 py-2">
                                                                <span className="inline-flex items-center gap-1.5">
                                                                    <span className="h-2 w-2 rounded-full" style={{ background: FASE_COLORS[ev.fase] || '#94a3b8' }} />
                                                                    {ev.fase}
                                                                </span>
                                                            </td>
                                                            <td className="px-3 py-2 text-muted-foreground">{ev.operacio || (r.tipus === 'lliure' ? 'Trabajo libre' : '—')}</td>
                                                            <td className="px-3 py-2">
                                                                <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${ESTAT_BADGE[r.estat] || 'bg-secondary'}`}>{r.estat || '—'}</span>
                                                            </td>
                                                            <td className="px-3 py-2 text-right tabular-nums text-[hsl(var(--ok))]">{formatSegons(r.productiu)}</td>
                                                            <td className="px-3 py-2 text-xs text-muted-foreground">
                                                                {ev.causa ? `Causa: ${ev.causa}` : (r.retreball ? 'Retrabajo' : '')}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                        {historial.length > 300 && (
                                            <p className="px-3 py-2 text-xs text-muted-foreground bg-secondary/40">Mostrando los 300 eventos más recientes de {historial.length}.</p>
                                        )}
                                    </div>
                                )}
                            </section>

                            {/* Incidencias */}
                            <section className="rounded-xl border border-border bg-card p-5">
                                <div className="mb-4">
                                    <h3 className="font-display text-xl uppercase flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Incidencias detectadas</h3>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        No conformidades detectadas por el operario en el periodo.
                                    </p>
                                </div>
                                {noConformitats.length === 0 ? (
                                    <p className="text-sm text-muted-foreground py-8 text-center">Sin incidencias en el periodo seleccionado.</p>
                                ) : (
                                    <div className="overflow-auto rounded-lg border border-border table-wrap">
                                        <table className="w-full min-w-[820px] text-sm">
                                            <thead className="bg-secondary text-left text-xs uppercase">
                                                <tr>
                                                    {['Código', 'Fecha', 'Exclusiva', 'Artículo', 'Área', 'Gravedad', 'Estado', 'Descripción'].map((h) => (
                                                        <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border">
                                                {noConformitats.map((nc) => {
                                                    const ex = nc.expand?.exclusiva || (typeof nc.exclusiva === 'string' ? exclusivesById[nc.exclusiva] : null);
                                                    return (
                                                        <tr key={nc.id} className="hover:bg-secondary/30">
                                                            <td className="px-3 py-2 font-mono font-semibold">{nc.codi || '—'}</td>
                                                            <td className="px-3 py-2 tabular-nums whitespace-nowrap">{fmtDia(nc.data_nc || nc.created)}</td>
                                                            <td className="px-3 py-2">{ex?.exclusiva || '—'}</td>
                                                            <td className="px-3 py-2 text-muted-foreground">{ex?.article || '—'}</td>
                                                            <td className="px-3 py-2 capitalize">{nc.area || '—'}</td>
                                                            <td className="px-3 py-2 capitalize">{nc.gravetat || nc.prioritat || '—'}</td>
                                                            <td className="px-3 py-2">
                                                                <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${NC_ESTAT_BADGE[nc.estat] || 'bg-secondary'}`}>{nc.estat || '—'}</span>
                                                            </td>
                                                            <td className="px-3 py-2 text-muted-foreground max-w-[320px] truncate" title={nc.descripcio}>{nc.descripcio || '—'}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </section>

                            {/* Retrabajos asignados */}
                            <section className="rounded-xl border border-border bg-card p-5">
                                <div className="mb-4">
                                    <h3 className="font-display text-xl uppercase flex items-center gap-2"><Wrench className="h-5 w-5" /> Retrabajos asignados</h3>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        Retrabajos asignados al operario en el periodo, con su estado y fase.
                                    </p>
                                </div>
                                {retrabajos.length === 0 ? (
                                    <p className="text-sm text-muted-foreground py-8 text-center">Sin retrabajos en el periodo seleccionado.</p>
                                ) : (
                                    <div className="overflow-auto rounded-lg border border-border table-wrap">
                                        <table className="w-full min-w-[820px] text-sm">
                                            <thead className="bg-secondary text-left text-xs uppercase">
                                                <tr>
                                                    {['Fecha', 'Exclusiva', 'Mono', 'Fase', 'Operación', 'Estado', 'Intento', 'Motivo'].map((h) => (
                                                        <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border">
                                                {retrabajos.map((rt) => {
                                                    const ex = rt.expand?.exclusiva || (typeof rt.exclusiva === 'string' ? exclusivesById[rt.exclusiva] : null);
                                                    const mo = rt.expand?.mono || (typeof rt.mono === 'string' ? monosById[rt.mono] : null);
                                                    return (
                                                        <tr key={rt.id} className="hover:bg-secondary/30">
                                                            <td className="px-3 py-2 tabular-nums whitespace-nowrap">{fmtDia(rt.created)}</td>
                                                            <td className="px-3 py-2">{ex?.exclusiva || '—'}</td>
                                                            <td className="px-3 py-2 tabular-nums">{mo?.codi || '—'}</td>
                                                            <td className="px-3 py-2">{rt.fase || '—'}</td>
                                                            <td className="px-3 py-2 text-muted-foreground">{rt.operacion_original || rt.operacion_codi || '—'}</td>
                                                            <td className="px-3 py-2">
                                                                <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${RETR_ESTAT_BADGE[rt.estado] || 'bg-secondary'}`}>{rt.estado || '—'}</span>
                                                            </td>
                                                            <td className="px-3 py-2 text-right tabular-nums">{rt.numero_intento || '—'}</td>
                                                            <td className="px-3 py-2 text-muted-foreground max-w-[300px] truncate" title={rt.motivo_rechazo}>{rt.motivo_rechazo || '—'}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </section>
                        </>
                    )}
                </>
            )}

            {/* Modal resumen del día seleccionado */}
            {diaSeleccionat && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6"
                    onClick={() => setDiaSeleccionat(null)}
                >
                    <div
                        className="modal-card relative w-full max-w-2xl max-h-[90dvh] overflow-auto rounded-xl border border-border bg-card shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-border bg-card px-5 py-3">
                            <div>
                                <h3 className="font-display text-xl uppercase capitalize leading-none">{fmtDia(diaSeleccionat.dia)}</h3>
                                <p className="mt-0.5 text-xs text-muted-foreground">Resumen de jornada del operario</p>
                            </div>
                            <button
                                onClick={() => setDiaSeleccionat(null)}
                                className="h-8 w-8 rounded-md hover:bg-secondary flex items-center justify-center active:scale-95"
                                aria-label="Cerrar"
                            >✕</button>
                        </div>

                        <div className="p-5 grid gap-4">
                            {/* KPIs del día */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="rounded-lg bg-primary/10 px-3 py-2.5 text-center">
                                    <p className="text-[10px] uppercase text-muted-foreground">Entrada</p>
                                    <p className="font-display text-lg text-primary tabular-nums">{fmtHora(diaSeleccionat.entrada)}</p>
                                </div>
                                <div className="rounded-lg bg-[hsl(var(--ok))]/10 px-3 py-2.5 text-center">
                                    <p className="text-[10px] uppercase text-muted-foreground">Salida</p>
                                    <p className="font-display text-lg text-[hsl(var(--ok))] tabular-nums">{fmtHora(diaSeleccionat.salida)}</p>
                                </div>
                                <div className="rounded-lg bg-[hsl(var(--ok))]/10 px-3 py-2.5 text-center">
                                    <p className="text-[10px] uppercase text-muted-foreground">T. productivo</p>
                                    <p className="font-display text-lg text-[hsl(var(--ok))] tabular-nums">{formatSegons(diaSeleccionat.productiu)}</p>
                                </div>
                                <div className="rounded-lg bg-[hsl(var(--warn))]/10 px-3 py-2.5 text-center">
                                    <p className="text-[10px] uppercase text-muted-foreground">T. parada</p>
                                    <p className="font-display text-lg text-[hsl(var(--warn))] tabular-nums">{formatSegons(diaSeleccionat.parada)}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-3 text-center text-sm">
                                <div className="rounded-lg bg-secondary px-3 py-2">
                                    <p className="text-[10px] uppercase text-muted-foreground">Exclusivas</p>
                                    <p className="font-display text-lg text-foreground tabular-nums">{diaSeleccionat.nExclusives}</p>
                                </div>
                                <div className="rounded-lg bg-secondary px-3 py-2">
                                    <p className="text-[10px] uppercase text-muted-foreground">Registros</p>
                                    <p className="font-display text-lg text-foreground tabular-nums">{diaSeleccionat.n}</p>
                                </div>
                                <div className="rounded-lg bg-secondary px-3 py-2">
                                    <p className="text-[10px] uppercase text-muted-foreground">% Prod. (8h)</p>
                                    <p className={`font-display text-lg tabular-nums ${pctColor(diaSeleccionat.pctProductiu)}`}>{diaSeleccionat.pctProductiu}%</p>
                                </div>
                            </div>

                            {/* Detalle de registros del día */}
                            <div>
                                <p className="text-sm font-semibold mb-2">Registros del día</p>
                                <div className="overflow-auto rounded-lg border border-border table-wrap">
                                    <table className="w-full min-w-[640px] text-sm">
                                        <thead className="bg-secondary text-left text-xs uppercase">
                                            <tr>
                                                {['Exclusiva', 'Mono', 'Fase', 'Operación', 'Estado', 'T. prod.', 'T. parada'].map((h) => (
                                                    <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {diaSeleccionat.registres.map((r) => (
                                                <tr key={r.id} className="hover:bg-secondary/30">
                                                    <td className="px-3 py-2">{r.exclusivaCodi || '—'}</td>
                                                    <td className="px-3 py-2 tabular-nums">{r.monoCodi || '—'}</td>
                                                    <td className="px-3 py-2">
                                                        <span className="inline-flex items-center gap-1.5">
                                                            <span className="h-2 w-2 rounded-full" style={{ background: FASE_COLORS[r.fase] || '#94a3b8' }} />
                                                            {r.fase}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2 text-muted-foreground">{r.operacio || (r.tipus === 'lliure' ? 'Trabajo libre' : '—')}</td>
                                                    <td className="px-3 py-2">
                                                        <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${ESTAT_BADGE[r.estat] || 'bg-secondary'}`}>{r.estat || '—'}</span>
                                                    </td>
                                                    <td className="px-3 py-2 text-right tabular-nums text-[hsl(var(--ok))]">{formatSegons(r.productiu)}</td>
                                                    <td className="px-3 py-2 text-right tabular-nums text-[hsl(var(--warn))]">{formatSegons(r.parada)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

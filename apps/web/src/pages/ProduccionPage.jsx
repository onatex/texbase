import React, { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import {
    AlertTriangle, CheckCircle, ChevronDown, ChevronRight, Edit2, Layers, LogOut,
    Play, RefreshCcw, Route, TrendingDown, Users, Wifi, X, Plus, Clock, UserRound,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import useProduccio from '@/hooks/useProduccio';
import Logo from '@/components/Logo';
import DashboardEnViu from '@/components/admin/DashboardEnViu';
import AnadirOperacionModal from '@/components/admin/AnadirOperacionModal';
import EditarOperacionesExclusiva from '@/components/produccio/EditarOperacionesExclusiva';
import PropagarOperacionModal from '@/components/produccio/PropagarOperacionModal';
import pb from '@/lib/pocketbaseClient';
import {
    computeMonoOps, opsSummary, STATUS_DOT,
    resolveRutaExclusiva, tempsInvertitExclusiva, operarisActiusExclusiva,
    parseDataExclusiva, minutsPrevistosExclusiva, getOpsByRuta,
} from '@/lib/operacionsUtils';
import { formatSegons } from '@/lib/csv';
import ValidacioExclusives from '@/components/admin/ValidacioExclusives';
import ColaRetrabajos from '@/components/produccio/ColaRetrabajos';
import GestioRutes from '@/components/produccio/GestioRutes';
import KanbanExclusives from '@/components/admin/KanbanExclusives';

const TABS = [
    { id: 'live', label: 'En vivo' },
    { id: 'kanban', label: 'Kanban' },
    { id: 'exclusives', label: 'Exclusivas' },
    { id: 'anteriors', label: 'Exclusivas anteriores' },
    { id: 'rutes', label: 'Rutas' },
    { id: 'validacio', label: 'Validación' },
    { id: 'asignacion', label: 'Asignación' },
    { id: 'retrabajos', label: 'Retrabajos' },
    { id: 'cuello', label: 'Cuellos de botella' },
];

const resoldreRuta = resolveRutaExclusiva;

// ── Clasificación de exclusivas anteriores ───────────────────────────────────
// Pasan a "Exclusivas anteriores" las entregadas o con retraso > 7 días sobre la
// fecha de entrega relevante. No borra datos: solo cambia visibilidad/clasificación.
const ESTATS_ENTREGADA = new Set(['entregada', 'entregadas', 'entregado', 'entregados']);

function esExclusivaAnterior(ex) {
    const est = String(ex?.estat || '').toLowerCase().trim();
    if (ESTATS_ENTREGADA.has(est)) return { anterior: true, motiu: 'entregada' };
    const raw = ex?.data_entrega || ex?.data_estimada || ex?.data_prevista_recepcio || '';
    const parsed = parseDataExclusiva(raw);
    if (parsed.date) {
        const diffDies = (Date.now() - parsed.date.getTime()) / 86400000;
        if (diffDies > 7) return { anterior: true, motiu: 'retraso' };
    }
    return { anterior: false, motiu: null };
}

function agruparPerDia(items) {
    const groups = new Map();
    for (const e of items) {
        const raw = e.data_entrega || e.data_estimada || e.data_prevista_recepcio || '';
        const parsed = parseDataExclusiva(raw);
        if (!groups.has(parsed.key)) {
            groups.set(parsed.key, { key: parsed.key, label: parsed.label, date: parsed.date, items: [] });
        }
        groups.get(parsed.key).items.push(e);
    }
    const list = [...groups.values()];
    list.sort((a, b) => {
        if (a.key === 'sin-fecha') return 1;
        if (b.key === 'sin-fecha') return -1;
        return (a.date?.getTime() || 0) - (b.date?.getTime() || 0);
    });
    return list;
}

// ── Risk helpers ─────────────────────────────────────────────────────────────
// Estados de recogida/entrega: una exclusiva lista para recoger (o ya
// entregada/finalizada) deja de estar "en riesgo" aunque conserve su campo
// `risc` almacenado. Se comprueba por estado real, no por texto aproximado.
const ESTATS_RECOGIDA = new Set([
    'lista_recollida', 'entregada', 'entregadas', 'entregado', 'entregados', 'finalitzada',
]);
const riscoColor = {
    viable: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]',
    en_risc: 'bg-[hsl(var(--warn))]/20 text-[hsl(var(--warn))]',
    no_viable: 'bg-destructive/10 text-destructive',
};
const riscoLabel = { viable: 'Viable', en_risc: 'En riesgo', no_viable: 'No viable' };

function calcRisc(ex) {
    // Lista para recoger / entregada / finalizada → fuera de riesgo.
    if (ESTATS_RECOGIDA.has(ex.estat)) return 'viable';
    if (!ex.data_entrega) return null;
    const dies = Math.max(0, Math.ceil((new Date(ex.data_entrega) - new Date()) / 86400000));
    const ratio = (ex.minuts_previstos || 0) / Math.max(dies * 8 * 60, 1);
    if (ratio < 0.8) return 'viable';
    if (ratio < 1.1) return 'en_risc';
    return 'no_viable';
}

const Risc = ({ valor }) => valor ? (
    <span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${riscoColor[valor] || 'bg-secondary'}`}>
        {riscoLabel[valor] || valor}
    </span>
) : null;

const MotiuAnterior = ({ motiu }) => motiu === 'entregada' ? (
    <span className="inline-flex items-center gap-1 rounded-md bg-[hsl(var(--ok))]/15 px-2 py-0.5 text-xs font-semibold text-[hsl(var(--ok))]">
        <CheckCircle className="h-3.5 w-3.5" /> Entregada
    </span>
) : (
    <span className="inline-flex items-center gap-1 rounded-md bg-[hsl(var(--warn))]/20 px-2 py-0.5 text-xs font-semibold text-[hsl(var(--warn))]">
        <AlertTriangle className="h-3.5 w-3.5" /> Retraso &gt; 7 días
    </span>
);

const estatBadge = {
    pendent: 'bg-secondary text-secondary-foreground',
    en_curs: 'bg-[hsl(var(--warn))]/20 text-[hsl(var(--warn))]',
    finalitzada: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]',
    finalitzat: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]',
    bloquejada: 'bg-destructive/10 text-destructive',
    retreball: 'bg-destructive/10 text-destructive',
    recibida: 'bg-secondary text-secondary-foreground',
};
const Estat = ({ v }) => (
    <span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${estatBadge[v] || 'bg-secondary'}`}>{v || '—'}</span>
);

// Badge de ruta asignada: muestra nombre o motivo claro si no se resuelve.
const RutaBadge = ({ ruta, opsCount }) => {
    if (!ruta || !ruta.rutaId) {
        return (
            <span
                className="text-xs italic text-muted-foreground"
                title={ruta?.motiu || 'Sin ruta asignada'}
            >
                Sin ruta asignada
            </span>
        );
    }
    return (
        <span
            className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2 py-0.5 text-xs font-semibold text-primary"
            title={`${ruta.rutaNom}${ruta.via ? ` · vía: ${ruta.via}` : ''}${opsCount != null ? ` · ${opsCount} ops` : ''}`}
        >
            <Route className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate max-w-[160px]">{ruta.rutaNom}</span>
            {opsCount != null && (
                <span className="tabular-nums text-[10px] font-normal text-muted-foreground">({opsCount})</span>
            )}
        </span>
    );
};

const TempsBadge = ({ segons, previstosMin }) => {
    const min = Math.round((segons || 0) / 60);
    const pct = previstosMin > 0 ? Math.round((min / previstosMin) * 100) : null;
    return (
        <div className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1 tabular-nums font-semibold text-sm">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                {formatSegons(segons || 0)}
            </span>
            {pct != null && (
                <span className={`text-[10px] tabular-nums ${pct > 110 ? 'text-destructive' : pct > 90 ? 'text-[hsl(var(--warn))]' : 'text-muted-foreground'}`}>
                    {pct}% de {previstosMin} min prev.
                </span>
            )}
        </div>
    );
};

const OperarisActiusBadge = ({ actius }) => {
    if (!actius || actius.length === 0) {
        return <span className="text-xs italic text-muted-foreground">Sin operario activo</span>;
    }
    const title = actius.map((a) => `${a.nom}${a.operacio ? ` · ${a.operacio}` : ''}${a.causa ? ` · Pausado: ${a.causa}` : ''}`).join('\n');
    const pausatsInactivitat = actius.filter((a) => a.estat === 'pausat' && a.causa);
    return (
        <div className="flex flex-col gap-1">
            <span
                className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--ok))]/15 px-2 py-1 text-xs font-semibold text-[hsl(var(--ok))]"
                title={title}
            >
                <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[hsl(var(--ok))] opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[hsl(var(--ok))]" />
                </span>
                <UserRound className="h-3.5 w-3.5" />
                {actius.length === 1
                    ? (actius[0].nom || '1 activo')
                    : `${actius.length} operarios activos`}
            </span>
            {pausatsInactivitat.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-md bg-[hsl(var(--warn))]/15 px-2 py-0.5 text-[11px] font-semibold text-[hsl(var(--warn))]" title={pausatsInactivitat.map((a) => `${a.nom}: ${a.causa}`).join(', ')}>
                    <AlertTriangle className="h-3 w-3" /> Pausado por inactividad: {pausatsInactivitat.map((a) => a.causa).join(', ')}
                </span>
            )}
        </div>
    );
};

// ── Mini progress bar ─────────────────────────────────────────────────────────
const Progres = ({ value }) => (
    <div className="flex items-center gap-2">
        <div className="h-1.5 w-20 rounded-full bg-secondary">
            <div className="h-1.5 rounded-full bg-[hsl(var(--accent))]" style={{ width: `${value}%` }} />
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">{value}%</span>
    </div>
);

// ── Operations detail panel ───────────────────────────────────────────────────
function OpsPanel({ mono, opsDef, registres, onClose, onEditarOps, onAnadirOp, rutaId, rutes, articles, exclusiva, soloLectura }) {
    const opsWithStatus = useMemo(
        () => computeMonoOps(mono, opsDef, registres, { rutaId, rutes, articles, exclusiva }),
        [mono, opsDef, registres, rutaId, rutes, articles, exclusiva],
    );
    const exFull = exclusiva || mono?.expand?.exclusiva || null;
    const sinRuta = !rutaId && !resolveRutaExclusiva(exFull, rutes, articles).rutaId;
    const summary = opsSummary(opsWithStatus);
    const grupos = [
        { key: 'en_curs', label: 'En curso' },
        { key: 'disponible', label: 'Disponibles' },
        { key: 'completada', label: 'Completadas' },
    ];

    return (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-end bg-black/40 p-0" onClick={onClose}>
            <div
                className="h-full w-full sm:w-[480px] bg-card overflow-y-auto shadow-2xl"
                onClick={(ev) => ev.stopPropagation()}
            >
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-5 py-4">
                    <div>
                        <p className="font-display text-2xl uppercase">{mono.codi}</p>
                        <p className="text-xs text-muted-foreground">
                            {exFull?.article || mono.expand?.exclusiva?.article || '—'} · Talla {mono.talla || '—'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                        {!soloLectura && onAnadirOp && exFull && (
                            <button
                                type="button"
                                onClick={(ev) => { ev.stopPropagation(); onAnadirOp(exFull); }}
                                className="flex items-center gap-1.5 rounded-md bg-[hsl(var(--accent))] px-3 h-9 text-xs font-semibold text-[hsl(var(--accent-foreground))] active:scale-95"
                            >
                                <Plus className="h-3.5 w-3.5" /> Añadir
                            </button>
                        )}
                        {!soloLectura && onEditarOps && exFull && (
                            <button
                                type="button"
                                onClick={(ev) => { ev.stopPropagation(); onEditarOps(exFull); }}
                                className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3 h-9 text-xs font-semibold hover:bg-secondary active:scale-95"
                            >
                                <Edit2 className="h-3.5 w-3.5" /> Editar / reordenar
                            </button>
                        )}
                        <button type="button" onClick={onClose} className="rounded-md border border-border p-2 hover:bg-secondary">
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                {/* Summary strip */}
                <div className="grid grid-cols-3 border-b border-border">
                    {[
                        { k: 'completada', label: 'Hechas', color: 'text-[hsl(var(--ok))]' },
                        { k: 'en_curs', label: 'En curso', color: 'text-[hsl(var(--warn))]' },
                        { k: 'disponible', label: 'Disponibles', color: 'text-primary' },
                    ].map(({ k, label, color }) => (
                        <div key={k} className="p-3 text-center border-r last:border-r-0 border-border">
                            <p className={`font-display text-3xl ${color}`}>{summary[k] || 0}</p>
                            <p className="text-xs text-muted-foreground">{label}</p>
                        </div>
                    ))}
                </div>

                {/* Operations grouped */}
                <div className="p-4 space-y-5">
                    {grupos.map(({ key, label }) => {
                        const ops = opsWithStatus.filter((o) => o.status === key);
                        if (!ops.length) return null;
                        return (
                            <div key={key}>
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                                    <span className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT[key]}`} />
                                    {label} ({ops.length})
                                </p>
                                <div className="space-y-1.5">
                                    {ops.map((op) => (
                                        <div key={op.id}
                                            className="flex items-start gap-3 rounded-lg border px-3 py-2 text-sm border-border">
                                            <span className={`mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[key]}`} />
                                            <div className="min-w-0 flex-1">
                                                <span className="font-mono text-xs text-muted-foreground mr-2">{op.codi}</span>
                                                <span className="font-semibold">{op.nom}</span>
                                                {op.maquina && (
                                                    <span className="ml-2 text-xs text-muted-foreground">{op.maquina}</span>
                                                )}
                                            </div>
                                            <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                                                {op.temps_std_min ?? 0} min
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                    {opsWithStatus.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-8 px-4">
                            {sinRuta
                                ? 'No se pudo resolver la ruta de esta exclusiva. Comprueba la relación de ruta o el artículo/referencia.'
                                : 'La ruta está resuelta pero no hay operaciones definidas (o están activas) para ella.'}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ProduccionPage() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [tab, setTab] = useState('live');
    const { exclusives, monos, registres, rutes, operaris, articles, opsDef, carregant, error, recarrega } = useProduccio();

    // Global filters
    const [filtre, setFiltre] = useState('');
    const [filtreAnt, setFiltreAnt] = useState('');

    // Monos tab filters
    const [filtreEx, setFiltreEx] = useState('');
    const [filtreOp, setFiltreOp] = useState('');
    const [filtreEstat, setFiltreEstat] = useState('');

    // Expandable exclusiva rows
    const [expandedEx, setExpandedEx] = useState(new Set());

    // Vista dentro de Exclusivas: 'agrupada' (por exclusiva) | 'monos' (tabla plana)
    const [vistaEx, setVistaEx] = useState('agrupada');

    // Assignment state
    const [assignant, setAssignant] = useState(null);
    const [operariSel, setOperariSel] = useState('');

    // Ops detail panel
    const [opsMono, setOpsMono] = useState(null);

    // Añadir operación rápida a una exclusiva concreta
    const [anadirOpEx, setAnadirOpEx] = useState(null);

    // Editar / reordenar operaciones de una exclusiva concreta
    const [editarOpsEx, setEditarOpsEx] = useState(null);

    // Propagar una operación de una exclusiva a artículo + exclusivas programadas
    const [propagarOpEx, setPropagarOpEx] = useState(null);

    // ── Derived data ─────────────────────────────────────────────────────────
    // La validación de Onatex es solo un inventario/confirmación: no oculta exclusivas del panel de producción.
    const exclusivesVisibles = useMemo(
        () => exclusives.filter((e) => e.estat !== 'desapareguda'),
        [exclusives],
    );

    // Clasificación: exclusivas anteriores (entregadas o con retraso > 7 días).
    // Las desaparecidas y otros estados protegidos no entran aquí: solo se
    // archivan entregadas y retrasos > 7 días. No se borra nada.
    const classificacio = useMemo(() => {
        const map = new Map();
        for (const e of exclusivesVisibles) map.set(e.id, esExclusivaAnterior(e));
        return map;
    }, [exclusivesVisibles]);

    const exclusivesActives = useMemo(
        () => exclusivesVisibles.filter((e) => !classificacio.get(e.id)?.anterior),
        [exclusivesVisibles, classificacio],
    );

    const exclusivesAnteriors = useMemo(
        () => exclusivesVisibles.filter((e) => classificacio.get(e.id)?.anterior),
        [exclusivesVisibles, classificacio],
    );

    const exAmbRisc = useMemo(() =>
        exclusivesActives.map((e) => ({ ...e, _risc: ESTATS_RECOGIDA.has(e.estat) ? 'viable' : (e.risc || calcRisc(e)) })),
        [exclusivesActives],
    );

    const antAmbRisc = useMemo(() =>
        exclusivesAnteriors.map((e) => ({ ...e, _risc: ESTATS_RECOGIDA.has(e.estat) ? 'viable' : (e.risc || calcRisc(e)) })),
        [exclusivesAnteriors],
    );

    const exFiltrades = useMemo(() => {
        const q = filtre.trim().toLowerCase();
        return exAmbRisc.filter((e) => !q || `${e.exclusiva} ${e.article} ${e.marca} ${e.referencia}`.toLowerCase().includes(q));
    }, [exAmbRisc, filtre]);

    const antFiltrades = useMemo(() => {
        const q = filtreAnt.trim().toLowerCase();
        return antAmbRisc.filter((e) => !q || `${e.exclusiva} ${e.article} ${e.marca} ${e.referencia}`.toLowerCase().includes(q));
    }, [antAmbRisc, filtreAnt]);

    // Ruta resolta per cada exclusiva (mateixa resolució que OperarioPage).
    const rutaPerExclusiva = useMemo(() => {
        const map = new Map();
        for (const e of exclusivesVisibles) {
            map.set(e.id, resoldreRuta(e, rutes, articles));
        }
        return map;
    }, [exclusivesVisibles, rutes, articles]);

    // Ops count + minutos previstos por exclusiva
    const metaPerExclusiva = useMemo(() => {
        const map = new Map();
        const monosByExId = new Map();
        for (const m of monos) {
            const eid = m.exclusiva || m.expand?.exclusiva?.id;
            if (!eid) continue;
            if (!monosByExId.has(eid)) monosByExId.set(eid, []);
            monosByExId.get(eid).push(m.id);
        }
        const usersById = new Map();
        for (const u of operaris || []) { if (u.id) usersById.set(u.id, u); }
        for (const e of exclusivesVisibles) {
            const ruta = rutaPerExclusiva.get(e.id);
            const rutaId = ruta?.rutaId || null;
            const ops = getOpsByRuta(opsDef, rutaId);
            const previstos = minutsPrevistosExclusiva(e, opsDef, rutaId);
            const monoIds = monosByExId.get(e.id) || [];
            const invertitSeg = tempsInvertitExclusiva(e.id, registres, monoIds);
            const actius = operarisActiusExclusiva(e.id, registres, monoIds, usersById);
            map.set(e.id, {
                opsCount: ops.length,
                previstosMin: previstos,
                invertitSeg,
                actius,
                rutaId,
            });
        }
        return map;
    }, [exclusivesVisibles, rutaPerExclusiva, opsDef, registres, monos, operaris]);

    // Agrupación por día de entrega (data_entrega / data_estimada)
    const exPerDia = useMemo(() => agruparPerDia(exFiltrades), [exFiltrades]);

    const antPerDia = useMemo(() => agruparPerDia(antFiltrades), [antFiltrades]);

    // Per-exclusiva mono summary (soporta id string o expand)
    const monosByEx = useMemo(() => {
        const map = new Map();
        monos.forEach((m) => {
            const eid = m.exclusiva || m.expand?.exclusiva?.id;
            if (!eid) return;
            if (!map.has(eid)) map.set(eid, []);
            map.get(eid).push(m);
        });
        return map;
    }, [monos]);

    // Monos filtrados por operario/estado (usado tanto en vista agrupada como en tabla plana)
    const monosFiltrats = useMemo(() => {
        return monos.filter((m) => {
            const ex = m.expand?.exclusiva;
            if (ex?.estat === 'desapareguda') return false;
            if (classificacio.get(ex?.id)?.anterior) return false;
            if (filtreEx && m.exclusiva !== filtreEx) return false;
            if (filtreOp && m.operari_assignat !== filtreOp) return false;
            if (filtreEstat && m.estat !== filtreEstat) return false;
            return true;
        });
    }, [monos, filtreEx, filtreOp, filtreEstat, classificacio]);

    // Monos filtrados solo por operario/estado (sin filtreEx) para mostrar dentro de cada exclusiva
    const monosFiltratsPerEx = useMemo(() => {
        const map = new Map();
        for (const m of monosFiltrats) {
            const eid = m.exclusiva || m.expand?.exclusiva?.id;
            if (!eid) continue;
            if (!map.has(eid)) map.set(eid, []);
            map.get(eid).push(m);
        }
        return map;
    }, [monosFiltrats]);

    // KPI counts
    const kpis = useMemo(() => ({
        enRisc: exAmbRisc.filter((e) => e._risc === 'en_risc').length,
        noViable: exAmbRisc.filter((e) => e._risc === 'no_viable').length,
        viable: exAmbRisc.filter((e) => e._risc === 'viable').length,
        sensAssignar: monos.filter((m) => m.estat !== 'finalitzat' && !m.operari_assignat && m.expand?.exclusiva?.estat !== 'desapareguda' && !classificacio.get(m.expand?.exclusiva?.id)?.anterior).length,
    }), [exAmbRisc, monos, classificacio]);

    // Per-mono op summary (memoized) — usa ruta resuelta multi-vía
    const monoOpSummary = useMemo(() => {
        const result = new Map();
        const exById = new Map(exclusivesVisibles.map((e) => [e.id, e]));
        for (const m of monos) {
            const exId = m.exclusiva || m.expand?.exclusiva?.id;
            const ex = exById.get(exId) || m.expand?.exclusiva || null;
            const ruta = exId ? rutaPerExclusiva.get(exId) : null;
            const ops = computeMonoOps(m, opsDef, registres, {
                rutaId: ruta?.rutaId || null,
                rutes,
                articles,
                exclusiva: ex,
            });
            result.set(m.id, opsSummary(ops));
        }
        return result;
    }, [monos, opsDef, registres, exclusivesVisibles, rutaPerExclusiva, rutes, articles]);

    // Bottleneck data
    const perOperacio = useMemo(() => {
        const map = new Map();
        registres.filter((r) => r.estat === 'finalitzat').forEach((r) => {
            const k = r.operacio || 'Sin operación';
            const e = map.get(k) || { operacio: k, real: 0, estandard: 0, n: 0 };
            e.real += Number(r.temps_real_seg || 0);
            e.estandard += Number(r.temps_estandard_seg || 0);
            e.n += 1;
            map.set(k, e);
        });
        return [...map.values()]
            .map((e) => ({
                operacio: e.operacio,
                avgReal: Math.round(e.real / e.n),
                avgEstandard: Math.round(e.estandard / e.n),
                desviacioPC: e.estandard ? Math.round(((e.real - e.estandard) / e.estandard) * 100) : 0,
                n: e.n,
            }))
            .sort((a, b) => b.desviacioPC - a.desviacioPC);
    }, [registres]);

    // ── Assignment handlers ───────────────────────────────────────────────────
    const assignar = async (monoId) => {
        if (!operariSel) return;
        await pb.collection('monos').update(monoId, { operari_assignat: operariSel });
        setAssignant(null);
        setOperariSel('');
        recarrega();
    };

    const toggleEx = (id) => {
        setExpandedEx((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    return (
        <div className="min-h-[100dvh]">
            <Helmet>
                <title>Producción | Control de monos</title>
                <meta name="description" content="Panel de producción: exclusivas, monos, operaciones y cuellos de botella." />
            </Helmet>

            <header className="bg-primary text-primary-foreground">
                <div className="stripe-top h-1.5" />
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                    <div className="flex items-center gap-4">
                        <Logo size="sm" />
                        <div>
                            <p className="font-display text-2xl sm:text-3xl uppercase leading-none">Panel de producción</p>
                            <p className="text-xs text-white/70">Producción · {user?.name || user?.email}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 rounded-md bg-white/15 px-2 py-1 text-xs font-semibold">
                            <Wifi className="h-4 w-4" /> Tiempo real
                        </span>
                        <button onClick={recarrega} className="rounded-md bg-white/15 p-2 active:scale-95" aria-label="Actualizar">
                            <RefreshCcw className="h-5 w-5" />
                        </button>
                        <button onClick={() => { logout(); navigate('/'); }} className="rounded-md bg-white/15 p-2 active:scale-95" aria-label="Salir">
                            <LogOut className="h-5 w-5" />
                        </button>
                    </div>
                </div>
                <nav className="flex gap-1 overflow-x-auto px-5">
                    {TABS.map((t) => (
                        <button key={t.id} onClick={() => setTab(t.id)}
                            className={`whitespace-nowrap rounded-t-md px-4 py-3 font-display text-lg uppercase transition ${tab === t.id ? 'bg-background text-foreground' : 'text-white/70 hover:text-white'}`}>
                            {t.label}
                        </button>
                    ))}
                </nav>
            </header>

            <main className="p-5">
                {error && <p className="mb-4 rounded-md bg-destructive/10 px-4 py-3 text-destructive">{error}</p>}

                {carregant ? (
                    <div className="grid gap-3 sm:grid-cols-4">
                        {[0,1,2,3].map((i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-secondary" />)}
                    </div>
                ) : (
                    <>
                        {/* KPI strip */}
                        <div className="mb-6 grid gap-3 sm:grid-cols-4">
                            {[
                                { icon: AlertTriangle, label: 'En riesgo', valor: kpis.enRisc, color: 'text-[hsl(var(--warn))]' },
                                { icon: TrendingDown, label: 'No viables', valor: kpis.noViable, color: 'text-destructive' },
                                { icon: CheckCircle, label: 'Viables', valor: kpis.viable, color: 'text-[hsl(var(--ok))]' },
                                { icon: Users, label: 'Sin asignar', valor: kpis.sensAssignar, color: 'text-muted-foreground' },
                            ].map(({ icon: Icon, label, valor, color }) => (
                                <div key={label} className="rounded-lg border border-border bg-card p-4">
                                    <div className={`flex items-center gap-2 text-xs uppercase tracking-wide ${color}`}>
                                        <Icon className="h-4 w-4" /> {label}
                                    </div>
                                    <p className="font-display text-4xl mt-2 tabular-nums">{valor}</p>
                                </div>
                            ))}
                        </div>

                        {tab === 'live' && <DashboardEnViu monos={monos} exclusives={exclusivesVisibles} opsDef={opsDef} />}

                        {tab === 'kanban' && <KanbanExclusives />}

                        {tab === 'validacio' && <ValidacioExclusives />}

                        {tab === 'retrabajos' && <ColaRetrabajos />}

                        {/* ── TAB: RUTAS (gestión de rutas y asignación a artículos) ─── */}
                        {tab === 'rutes' && (
                            <GestioRutes
                                rutes={rutes}
                                articles={articles}
                                opsDef={opsDef}
                                recarrega={recarrega}
                            />
                        )}

                        {/* ── TAB: EXCLUSIVAS (fusionada con Monos) ─────────────────────── */}
                        {tab === 'exclusives' && (
                            <section className="rounded-lg border border-border bg-card">
                                <div className="flex flex-wrap items-center gap-3 p-4 border-b border-border">
                                    <h3 className="font-display text-2xl uppercase">Exclusivas</h3>
                                    {/* Conmutador de vista */}
                                    <div className="flex rounded-md border border-border overflow-hidden">
                                        <button onClick={() => setVistaEx('agrupada')}
                                            className={`px-3 h-9 text-xs font-semibold transition ${vistaEx === 'agrupada' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-secondary'}`}>
                                            Por exclusiva
                                        </button>
                                        <button onClick={() => setVistaEx('monos')}
                                            className={`px-3 h-9 text-xs font-semibold transition ${vistaEx === 'monos' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-secondary'}`}>
                                            Tabla de monos
                                        </button>
                                    </div>
                                    <div className="ml-auto flex flex-wrap items-center gap-2">
                                        {vistaEx === 'monos' && (
                                            <select value={filtreEx} onChange={(e) => setFiltreEx(e.target.value)}
                                                className="h-9 rounded-md border border-input bg-background px-2 text-xs">
                                                <option value="">Todas las exclusivas</option>
                                                {exclusives.map((e) => (
                                                    <option key={e.id} value={e.id}>{e.exclusiva}</option>
                                                ))}
                                            </select>
                                        )}
                                        <select value={filtreOp} onChange={(e) => setFiltreOp(e.target.value)}
                                            className="h-9 rounded-md border border-input bg-background px-2 text-xs">
                                            <option value="">Todos los operarios</option>
                                            {operaris.filter((o) => o.rol === 'operari').map((o) => (
                                                <option key={o.id} value={o.id}>{o.name || o.codi}</option>
                                            ))}
                                        </select>
                                        <select value={filtreEstat} onChange={(e) => setFiltreEstat(e.target.value)}
                                            className="h-9 rounded-md border border-input bg-background px-2 text-xs">
                                            <option value="">Todos los estados</option>
                                            {['pendent', 'en_curs', 'finalitzat', 'retreball'].map((s) => (
                                                <option key={s} value={s}>{s}</option>
                                            ))}
                                        </select>
                                        <input value={filtre} onChange={(e) => setFiltre(e.target.value)}
                                            placeholder="Buscar exclusiva, artículo, marca..."
                                            className="h-9 w-56 rounded-md border border-input bg-background px-3 text-sm" />
                                        {(filtreOp || filtreEstat || (vistaEx === 'monos' && filtreEx)) && (
                                            <button onClick={() => { setFiltreEx(''); setFiltreOp(''); setFiltreEstat(''); }}
                                                className="h-9 rounded-md border border-border px-3 text-xs font-semibold flex items-center gap-1">
                                                <X className="h-3.5 w-3.5" /> Limpiar
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Vista agrupada por exclusiva */}
                                {vistaEx === 'agrupada' && (
                                <div className="overflow-auto">
                                    <table className="w-full min-w-[1180px] text-sm">
                                        <thead className="bg-secondary text-left text-xs uppercase sticky top-0 z-[1]">
                                            <tr>
                                                {['', 'Exclusiva', 'Referencia', 'Artículo', 'Ruta', 'Uds', 'Entrega', 'Estado', 'Tiempo inv.', 'Operario activo', 'Monos', 'Progreso', 'Riesgo'].map((h) => (
                                                    <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {exFiltrades.length === 0 ? (
                                                <tr><td colSpan={13} className="p-8 text-center text-muted-foreground">Sin exclusivas.</td></tr>
                                            ) : exPerDia.map((dia) => (
                                                <React.Fragment key={dia.key}>
                                                    <tr className="bg-primary/10 border-y border-primary/20">
                                                        <td colSpan={13} className="px-3 py-2">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <span className="font-display text-base uppercase tracking-wide text-primary">
                                                                    {dia.key === 'sin-fecha' ? 'Sin fecha de entrega' : dia.label}
                                                                </span>
                                                                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary tabular-nums">
                                                                    {dia.items.length} exclusiva{dia.items.length === 1 ? '' : 's'}
                                                                </span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                    {dia.items.map((e) => {
                                                const seus = monosByEx.get(e.id) || [];
                                                const seusFiltrats = monosFiltratsPerEx.get(e.id) || [];
                                                const fets = seus.filter((m) => m.estat === 'finalitzat').length;
                                                const progres = seus.length ? Math.round((fets / seus.length) * 100) : 0;
                                                const isExpanded = expandedEx.has(e.id);
                                                const hayFiltreMono = filtreOp || filtreEstat;
                                                const rutaEx = rutaPerExclusiva.get(e.id);
                                                const meta = metaPerExclusiva.get(e.id) || {};
                                                return (
                                                    <React.Fragment key={e.id}>
                                                        <tr
                                                            className={`cursor-pointer border-b border-border hover:bg-secondary/40 transition ${
                                                                e._risc === 'no_viable' ? 'bg-destructive/5' : e._risc === 'en_risc' ? 'bg-[hsl(var(--warn))]/5' : ''
                                                            }`}
                                                            onClick={() => toggleEx(e.id)}
                                                        >
                                                            <td className="px-3 py-2">
                                                                {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                                            </td>
                                                            <td className="px-3 py-2 font-semibold">{e.exclusiva}</td>
                                                            <td className="px-3 py-2 text-muted-foreground">{e.referencia || '—'}</td>
                                                            <td className="px-3 py-2">{e.article}</td>
                                                            <td className="px-3 py-2"><RutaBadge ruta={rutaEx} opsCount={meta.opsCount} /></td>
                                                            <td className="px-3 py-2 tabular-nums">{e.unitats}</td>
                                                            <td className="px-3 py-2">{e.data_entrega || e.data_estimada || '—'}</td>
                                                            <td className="px-3 py-2"><Estat v={e.estat} /></td>
                                                            <td className="px-3 py-2"><TempsBadge segons={meta.invertitSeg} previstosMin={meta.previstosMin} /></td>
                                                            <td className="px-3 py-2"><OperarisActiusBadge actius={meta.actius} /></td>
                                                            <td className="px-3 py-2 tabular-nums text-muted-foreground">
                                                                {hayFiltreMono ? `${seusFiltrats.length}/${seus.length}` : seus.length}
                                                            </td>
                                                            <td className="px-3 py-2"><Progres value={progres} /></td>
                                                            <td className="px-3 py-2"><Risc valor={e._risc} /></td>
                                                        </tr>
                                                        {isExpanded && (
                                                            <tr className="border-b border-border">
                                                                <td colSpan={13} className="px-6 pb-3 pt-0">
                                                                    <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                                                                        <div className="flex flex-wrap items-center gap-3">
                                                                            <p className="text-xs font-semibold uppercase text-muted-foreground">
                                                                                Monos ({hayFiltreMono ? `${seusFiltrats.length} de ${seus.length}` : seus.length})
                                                                            </p>
                                                                            <RutaBadge ruta={rutaEx} opsCount={meta.opsCount} />
                                                                            {!rutaEx?.rutaId && (
                                                                                <span className="text-[11px] text-muted-foreground max-w-md">{rutaEx?.motiu}</span>
                                                                            )}
                                                                            {rutaEx?.rutaId && meta.opsCount === 0 && (
                                                                                <span className="text-[11px] text-[hsl(var(--warn))]">Ruta sin operaciones activas</span>
                                                                            )}
                                                                            <TempsBadge segons={meta.invertitSeg} previstosMin={meta.previstosMin} />
                                                                            <OperarisActiusBadge actius={meta.actius} />
                                                                        </div>
                                                                        <div className="relative z-10 flex items-center gap-1.5" onClick={(ev) => ev.stopPropagation()}>
                                                                            <button
                                                                                type="button"
                                                                                onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); setEditarOpsEx(e); }}
                                                                                className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3 h-8 text-xs font-semibold hover:bg-secondary active:scale-95"
                                                                            >
                                                                                <Edit2 className="h-3.5 w-3.5" /> Editar / reordenar
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); setPropagarOpEx(e); }}
                                                                                className="flex items-center gap-1.5 rounded-md border-2 border-[hsl(var(--accent))]/60 text-[hsl(var(--accent))] bg-background px-3 h-8 text-xs font-semibold hover:bg-[hsl(var(--accent))]/10 active:scale-95"
                                                                            >
                                                                                <Layers className="h-3.5 w-3.5" /> Propagar operación
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); setAnadirOpEx(e); }}
                                                                                className="flex items-center gap-1.5 rounded-md bg-[hsl(var(--accent))] px-3 h-8 text-xs font-semibold text-[hsl(var(--accent-foreground))] active:scale-95"
                                                                            >
                                                                                <Plus className="h-3.5 w-3.5" /> Añadir operación
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                    {seus.length > 0 && (
                                                                    <div className="rounded-md border border-border overflow-hidden mt-1">
                                                                        <table className="w-full text-xs">
                                                                            <thead className="bg-secondary text-left">
                                                                                <tr>
                                                                                    {['Mono', 'Talla', 'Estado', 'Op. actual', 'Ops completadas', 'Operario'].map((h) => (
                                                                                        <th key={h} className="px-3 py-1.5 font-semibold">{h}</th>
                                                                                    ))}
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody className="divide-y divide-border">
                                                                                {(hayFiltreMono ? seusFiltrats : seus).map((m) => {
                                                                                    const sum = monoOpSummary.get(m.id) || {};
                                                                                    return (
                                                                                        <tr key={m.id}
                                                                                            className="cursor-pointer hover:bg-secondary/30"
                                                                                            onClick={(ev) => { ev.stopPropagation(); setOpsMono(m); }}>
                                                                                            <td className="px-3 py-1.5 font-mono font-semibold">{m.codi}</td>
                                                                                            <td className="px-3 py-1.5">{m.talla || '—'}</td>
                                                                                            <td className="px-3 py-1.5"><Estat v={m.estat} /></td>
                                                                                            <td className="px-3 py-1.5 max-w-[180px] truncate">{m.operacio_actual || '—'}</td>
                                                                                            <td className="px-3 py-1.5">
                                                                                                <span className="text-[hsl(var(--ok))] font-semibold">{sum.completada || 0}</span>
                                                                                                <span className="text-muted-foreground">/{sum.total || 0}</span>
                                                                                                {sum.en_curs > 0 && <span className="ml-2 text-[hsl(var(--warn))]">{sum.en_curs} en curso</span>}
                                                                                            </td>
                                                                                            <td className="px-3 py-1.5">
                                                                                                {m.expand?.operari_assignat?.name || m.expand?.operari_assignat?.codi || <span className="italic text-muted-foreground">Sin asignar</span>}
                                                                                            </td>
                                                                                        </tr>
                                                                                    );
                                                                                })}
                                                                                {hayFiltreMono && seusFiltrats.length === 0 && (
                                                                                    <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Ningún mono cumple los filtros de operario/estado.</td></tr>
                                                                                )}
                                                                            </tbody>
                                                                        </table>
                                                                    </div>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </React.Fragment>
                                                );
                                                    })}
                                                </React.Fragment>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                )}

                                {/* Vista tabla de monos (antes pestaña Monos) */}
                                {vistaEx === 'monos' && (
                                <div className="overflow-auto">
                                    <table className="w-full min-w-[900px] text-sm">
                                        <thead className="bg-secondary text-left text-xs uppercase">
                                            <tr>
                                                {['Mono', 'Exclusiva', 'Talla', 'Artículo', 'Ruta', 'Estado', 'Operación actual', 'Operaciones', 'Operario', 'Detalle'].map((h) => (
                                                    <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {monosFiltrats.length === 0 ? (
                                                <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">Sin monos con los filtros actuales.</td></tr>
                                            ) : monosFiltrats.map((m) => {
                                                const sum = monoOpSummary.get(m.id) || {};
                                                const exId = m.exclusiva || m.expand?.exclusiva?.id;
                                                const ex = exclusivesVisibles.find((x) => x.id === exId) || m.expand?.exclusiva;
                                                const rutaEx = exId ? rutaPerExclusiva.get(exId) : null;
                                                const meta = exId ? metaPerExclusiva.get(exId) : null;
                                                return (
                                                    <tr key={m.id} className="hover:bg-secondary/30">
                                                        <td className="px-3 py-2 font-mono font-semibold">{m.codi}</td>
                                                        <td className="px-3 py-2">{ex?.exclusiva || '—'}</td>
                                                        <td className="px-3 py-2">{m.talla || '—'}</td>
                                                        <td className="px-3 py-2 max-w-[160px] truncate">{ex?.article || '—'}</td>
                                                        <td className="px-3 py-2"><RutaBadge ruta={rutaEx} opsCount={meta?.opsCount} /></td>
                                                        <td className="px-3 py-2"><Estat v={m.estat} /></td>
                                                        <td className="px-3 py-2 max-w-[200px] truncate text-muted-foreground">{m.operacio_actual || '—'}</td>
                                                        <td className="px-3 py-2">
                                                            <div className="flex items-center gap-1 text-xs">
                                                                <span className="text-[hsl(var(--ok))] font-semibold">{sum.completada || 0}</span>
                                                                <span className="text-muted-foreground">/{sum.total || 0}</span>
                                                                {sum.en_curs > 0 && (
                                                                    <span className="ml-1 rounded bg-[hsl(var(--warn))]/20 px-1 text-[hsl(var(--warn))]">{sum.en_curs} cur.</span>
                                                                )}
                                                                {sum.disponible > 0 && (
                                                                    <span className="ml-1 rounded bg-primary/10 px-1 text-primary">{sum.disponible} disp.</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            {m.expand?.operari_assignat
                                                                ? <span className="font-semibold">{m.expand.operari_assignat.name || m.expand.operari_assignat.codi}</span>
                                                                : <span className="italic text-muted-foreground text-xs">Sin asignar</span>
                                                            }
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            <button
                                                                onClick={() => setOpsMono(m)}
                                                                className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs font-semibold hover:bg-secondary">
                                                                <Play className="h-3 w-3" /> Ver ops
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                )}
                            </section>
                        )}

                        {/* ── TAB: EXCLUSIVAS ANTERIORES ─────────────────────── */}
                        {tab === 'anteriors' && (
                            <section className="rounded-lg border border-border bg-card">
                                <div className="flex flex-wrap items-center gap-3 p-4 border-b border-border">
                                    <h3 className="font-display text-2xl uppercase">Exclusivas anteriores</h3>
                                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold tabular-nums">
                                        {exclusivesAnteriors.length} archivada{exclusivesAnteriors.length === 1 ? '' : 's'}
                                    </span>
                                    <div className="ml-auto flex flex-wrap items-center gap-2">
                                        <input value={filtreAnt} onChange={(e) => setFiltreAnt(e.target.value)}
                                            placeholder="Buscar exclusiva, artículo, marca..."
                                            className="h-9 w-56 rounded-md border border-input bg-background px-3 text-sm" />
                                        {filtreAnt && (
                                            <button onClick={() => setFiltreAnt('')}
                                                className="h-9 rounded-md border border-border px-3 text-xs font-semibold flex items-center gap-1">
                                                <X className="h-3.5 w-3.5" /> Limpiar
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="p-3 border-b border-border bg-secondary/40 text-xs text-muted-foreground">
                                    Listado histórico de solo lectura: exclusivas entregadas o con retraso superior a 7 días.
                                    Se conserva el acceso al detalle, historial, operaciones, tiempos invertidos, incidencias, calidad y trazabilidad sin permitir cambios accidentales sobre el histórico.
                                </div>

                                <div className="overflow-auto">
                                    <table className="w-full min-w-[1240px] text-sm">
                                        <thead className="bg-secondary text-left text-xs uppercase sticky top-0 z-[1]">
                                            <tr>
                                                {['', 'Exclusiva', 'Referencia', 'Artículo', 'Ruta', 'Uds', 'Entrega', 'Estado', 'Motivo', 'Tiempo inv.', 'Operario activo', 'Monos', 'Progreso', 'Detalle'].map((h) => (
                                                    <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {antFiltrades.length === 0 ? (
                                                <tr><td colSpan={14} className="p-8 text-center text-muted-foreground">Sin exclusivas anteriores.</td></tr>
                                            ) : antPerDia.map((dia) => (
                                                <React.Fragment key={dia.key}>
                                                    <tr className="bg-primary/10 border-y border-primary/20">
                                                        <td colSpan={14} className="px-3 py-2">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <span className="font-display text-base uppercase tracking-wide text-primary">
                                                                    {dia.key === 'sin-fecha' ? 'Sin fecha de entrega' : dia.label}
                                                                </span>
                                                                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary tabular-nums">
                                                                    {dia.items.length} exclusiva{dia.items.length === 1 ? '' : 's'}
                                                                </span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                    {dia.items.map((e) => {
                                                const seus = monosByEx.get(e.id) || [];
                                                const fets = seus.filter((m) => m.estat === 'finalitzat').length;
                                                const progres = seus.length ? Math.round((fets / seus.length) * 100) : 0;
                                                const isExpanded = expandedEx.has(e.id);
                                                const rutaEx = rutaPerExclusiva.get(e.id);
                                                const meta = metaPerExclusiva.get(e.id) || {};
                                                const cls = classificacio.get(e.id) || {};
                                                return (
                                                    <React.Fragment key={e.id}>
                                                        <tr
                                                            className="cursor-pointer border-b border-border hover:bg-secondary/40 transition"
                                                            onClick={() => toggleEx(e.id)}
                                                        >
                                                            <td className="px-3 py-2">
                                                                {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                                            </td>
                                                            <td className="px-3 py-2 font-semibold">{e.exclusiva}</td>
                                                            <td className="px-3 py-2 text-muted-foreground">{e.referencia || '—'}</td>
                                                            <td className="px-3 py-2">{e.article}</td>
                                                            <td className="px-3 py-2"><RutaBadge ruta={rutaEx} opsCount={meta.opsCount} /></td>
                                                            <td className="px-3 py-2 tabular-nums">{e.unitats}</td>
                                                            <td className="px-3 py-2">{e.data_entrega || e.data_estimada || '—'}</td>
                                                            <td className="px-3 py-2"><Estat v={e.estat} /></td>
                                                            <td className="px-3 py-2"><MotiuAnterior motiu={cls.motiu} /></td>
                                                            <td className="px-3 py-2"><TempsBadge segons={meta.invertitSeg} previstosMin={meta.previstosMin} /></td>
                                                            <td className="px-3 py-2"><OperarisActiusBadge actius={meta.actius} /></td>
                                                            <td className="px-3 py-2 tabular-nums text-muted-foreground">{seus.length}</td>
                                                            <td className="px-3 py-2"><Progres value={progres} /></td>
                                                            <td className="px-3 py-2">
                                                                <button
                                                                    onClick={(ev) => { ev.stopPropagation(); navigate(`/exclusiva/${e.id}`); }}
                                                                    className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs font-semibold hover:bg-secondary">
                                                                    <Play className="h-3 w-3" /> Ver
                                                                </button>
                                                            </td>
                                                        </tr>
                                                        {isExpanded && (
                                                            <tr className="border-b border-border">
                                                                <td colSpan={14} className="px-6 pb-3 pt-0">
                                                                    <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                                                                        <div className="flex flex-wrap items-center gap-3">
                                                                            <p className="text-xs font-semibold uppercase text-muted-foreground">
                                                                                Monos ({seus.length})
                                                                            </p>
                                                                            <RutaBadge ruta={rutaEx} opsCount={meta.opsCount} />
                                                                            <TempsBadge segons={meta.invertitSeg} previstosMin={meta.previstosMin} />
                                                                            <OperarisActiusBadge actius={meta.actius} />
                                                                        </div>
                                                                        <button
                                                                            onClick={(ev) => { ev.stopPropagation(); navigate(`/exclusiva/${e.id}`); }}
                                                                            className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3 h-8 text-xs font-semibold hover:bg-secondary active:scale-95"
                                                                        >
                                                                            <Play className="h-3.5 w-3.5" /> Abrir detalle completo
                                                                        </button>
                                                                    </div>
                                                                    {seus.length > 0 && (
                                                                    <div className="rounded-md border border-border overflow-hidden mt-1">
                                                                        <table className="w-full text-xs">
                                                                            <thead className="bg-secondary text-left">
                                                                                <tr>
                                                                                    {['Mono', 'Talla', 'Estado', 'Op. actual', 'Ops completadas', 'Operario'].map((h) => (
                                                                                        <th key={h} className="px-3 py-1.5 font-semibold">{h}</th>
                                                                                    ))}
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody className="divide-y divide-border">
                                                                                {seus.map((m) => {
                                                                                    const sum = monoOpSummary.get(m.id) || {};
                                                                                    return (
                                                                                        <tr key={m.id}
                                                                                            className="cursor-pointer hover:bg-secondary/30"
                                                                                            onClick={(ev) => { ev.stopPropagation(); setOpsMono(m); }}>
                                                                                            <td className="px-3 py-1.5 font-mono font-semibold">{m.codi}</td>
                                                                                            <td className="px-3 py-1.5">{m.talla || '—'}</td>
                                                                                            <td className="px-3 py-1.5"><Estat v={m.estat} /></td>
                                                                                            <td className="px-3 py-1.5 max-w-[180px] truncate">{m.operacio_actual || '—'}</td>
                                                                                            <td className="px-3 py-1.5">
                                                                                                <span className="text-[hsl(var(--ok))] font-semibold">{sum.completada || 0}</span>
                                                                                                <span className="text-muted-foreground">/{sum.total || 0}</span>
                                                                                            </td>
                                                                                            <td className="px-3 py-1.5">
                                                                                                {m.expand?.operari_assignat?.name || m.expand?.operari_assignat?.codi || <span className="italic text-muted-foreground">Sin asignar</span>}
                                                                                            </td>
                                                                                        </tr>
                                                                                    );
                                                                                })}
                                                                            </tbody>
                                                                        </table>
                                                                    </div>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </React.Fragment>
                                                );
                                                    })}
                                                </React.Fragment>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        )}

                        {/* ── TAB: ASIGNACIÓN ───────────────────────────────── */}
                        {tab === 'asignacion' && (
                            <section className="rounded-lg border border-border bg-card">
                                <div className="p-4 border-b border-border">
                                    <h3 className="font-display text-2xl uppercase">Asignar operarios a monos</h3>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        {monos.filter((m) => m.estat !== 'finalitzat' && m.expand?.exclusiva?.estat !== 'desapareguda' && !m.operari_assignat).length} monos sin operario asignado.
                                    </p>
                                </div>
                                <div className="overflow-auto">
                                    <table className="w-full min-w-[700px] text-sm">
                                        <thead className="bg-secondary text-left text-xs uppercase">
                                            <tr>
                                                {['Mono', 'Exclusiva', 'Artículo', 'Operación actual', 'Estado', 'Operario asignado', 'Acción'].map((h) => (
                                                    <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {monos.filter((m) => m.estat !== 'finalitzat' && m.expand?.exclusiva?.estat !== 'desapareguda').length === 0 ? (
                                                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No hay monos activos.</td></tr>
                                            ) : monos.filter((m) => m.estat !== 'finalitzat' && m.expand?.exclusiva?.estat !== 'desapareguda').map((m) => (
                                                <tr key={m.id}>
                                                    <td className="px-3 py-2 font-semibold">{m.codi}</td>
                                                    <td className="px-3 py-2">{m.expand?.exclusiva?.exclusiva}</td>
                                                    <td className="px-3 py-2">{m.expand?.exclusiva?.article}</td>
                                                    <td className="px-3 py-2">{m.operacio_actual || '—'}</td>
                                                    <td className="px-3 py-2"><Estat v={m.estat} /></td>
                                                    <td className="px-3 py-2">
                                                        {m.expand?.operari_assignat
                                                            ? <span className="font-semibold">{m.expand.operari_assignat.name || m.expand.operari_assignat.codi}</span>
                                                            : <span className="text-muted-foreground italic">Sin asignar</span>
                                                        }
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        {assignant === m.id ? (
                                                            <div className="flex gap-2">
                                                                <select value={operariSel} onChange={(e) => setOperariSel(e.target.value)}
                                                                    className="h-9 rounded border border-input bg-background px-2 text-xs">
                                                                    <option value="">Seleccionar...</option>
                                                                    {operaris.filter((o) => o.rol === 'operari').map((o) => (
                                                                        <option key={o.id} value={o.id}>{o.name || o.codi}</option>
                                                                    ))}
                                                                </select>
                                                                <button onClick={() => assignar(m.id)} className="rounded bg-primary px-2 text-xs text-primary-foreground">OK</button>
                                                                <button onClick={() => setAssignant(null)} className="rounded bg-secondary px-2 text-xs">X</button>
                                                            </div>
                                                        ) : (
                                                            <button onClick={() => { setAssignant(m.id); setOperariSel(m.operari_assignat || ''); }}
                                                                className="rounded border border-border px-3 py-1 text-xs font-semibold">
                                                                Asignar
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        )}

                        {/* ── TAB: CUELLOS DE BOTELLA ───────────────────────── */}
                        {tab === 'cuello' && (
                            <section className="rounded-lg border border-border bg-card p-5">
                                <h3 className="font-display text-2xl uppercase">Desviaciones por operación</h3>
                                <p className="text-sm text-muted-foreground mt-1">Ordenadas de mayor a menor desviación respecto al tiempo estándar.</p>
                                <div className="mt-4 overflow-auto">
                                    <table className="w-full min-w-[600px] text-sm">
                                        <thead className="bg-secondary text-left text-xs uppercase">
                                            <tr>
                                                {['Operación', 'Registros', 'Tiempo real medio', 'Tiempo estándar', 'Desviación'].map((h) => (
                                                    <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {perOperacio.length === 0 ? (
                                                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Sin datos todavía.</td></tr>
                                            ) : perOperacio.map((op) => (
                                                <tr key={op.operacio} className={op.desviacioPC > 20 ? 'bg-destructive/5' : op.desviacioPC > 5 ? 'bg-[hsl(var(--warn))]/5' : ''}>
                                                    <td className="px-3 py-2 font-semibold">{op.operacio}</td>
                                                    <td className="px-3 py-2 tabular-nums">{op.n}</td>
                                                    <td className="px-3 py-2 tabular-nums">{formatSegons(op.avgReal)}</td>
                                                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{formatSegons(op.avgEstandard)}</td>
                                                    <td className={`px-3 py-2 font-semibold tabular-nums ${op.desviacioPC > 0 ? 'text-destructive' : 'text-[hsl(var(--ok))]'}`}>
                                                        {op.desviacioPC > 0 ? '+' : ''}{op.desviacioPC}%
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        )}
                    </>
                )}
            </main>

            {/* Operations detail panel */}
            {opsMono && (() => {
                const exId = opsMono.exclusiva || opsMono.expand?.exclusiva?.id;
                const exFull = exclusivesVisibles.find((x) => x.id === exId) || opsMono.expand?.exclusiva || null;
                const ruta = exId ? rutaPerExclusiva.get(exId) : null;
                const esAnterior = !!classificacio.get(exId)?.anterior;
                return (
                <OpsPanel
                    mono={opsMono}
                    opsDef={opsDef}
                    registres={registres}
                    onClose={() => setOpsMono(null)}
                    soloLectura={esAnterior}
                    onEditarOps={esAnterior ? null : (ex) => { setOpsMono(null); setEditarOpsEx(ex); }}
                    onAnadirOp={esAnterior ? null : (ex) => { setOpsMono(null); setAnadirOpEx(ex); }}
                    rutaId={ruta?.rutaId || null}
                    rutes={rutes}
                    articles={articles}
                    exclusiva={exFull}
                />
                );
            })()}

            {/* Añadir operación rápida a una exclusiva concreta */}
            {anadirOpEx && (
                <AnadirOperacionModal
                    exclusiva={anadirOpEx}
                    onClose={() => setAnadirOpEx(null)}
                    onSaved={recarrega}
                />
            )}

            {/* Editar / reordenar operaciones de una exclusiva concreta */}
            {editarOpsEx && (
                <EditarOperacionesExclusiva
                    exclusiva={editarOpsEx}
                    onClose={() => setEditarOpsEx(null)}
                    onSaved={recarrega}
                />
            )}

            {/* Propagar operación de una exclusiva a artículo + exclusivas programadas */}
            {propagarOpEx && (
                <PropagarOperacionModal
                    exclusiva={propagarOpEx}
                    onClose={() => setPropagarOpEx(null)}
                    onSaved={recarrega}
                />
            )}
        </div>
    );
}

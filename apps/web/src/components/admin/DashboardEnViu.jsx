import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Activity, AlertTriangle, CheckCircle, Clock, ExternalLink, PackageCheck, Pause, Play, Route as RouteIcon, Shield, Tag, TrendingUp, Truck, Users, Wrench, X, Zap } from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { registresValids, enriquirRegistres, mitjanesPerMarca, fasesPresentats, mitjanaOperariFaseMarca, incidenciesPerMarca, mitjanaIncidenciesText, rangUltimsDies, classificaMitjana } from '@/lib/mitjanesUtils';
import { calcularSaturacion } from '@/lib/saturacioUtils';
import AnalisisSaturacion from '@/components/admin/AnalisisSaturacion';

const POLL_MS = 8000;

const FASE_COLORS_LIVE = {
    'Fase 1': '#1e3a5f',
    'Fase 2': '#f97316',
    'Fase 3': '#10b981',
    'Fase 4': '#6366f1',
    'Trabajo libre': '#f59e0b',
    'Sin fase': '#94a3b8',
};

function useTick(ms = 1000) {
    const [tick, setTick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setTick((t) => t + 1), ms);
        return () => clearInterval(id);
    }, [ms]);
    return tick;
}

function elapsed(inici) {
    if (!inici) return 0;
    return Math.floor((Date.now() - new Date(inici).getTime()) / 1000);
}

/**
 * Tiempo productivo en vivo de un registro, SIN contar el tiempo pausado.
 *   - pausat: temps_real_seg congelado (el tiempo de parada no es productivo).
 *   - en_curs: temps_real_seg + (now - ultima_reanudacio).
 *   - finalitzat: temps_real_seg.
 */
function productiuSec(r) {
    if (!r) return 0;
    const stored = Number(r.temps_real_seg);
    const base = Number.isFinite(stored) && stored > 0 ? stored : 0;
    if (r.estat === 'pausat') return base;
    if (r.estat === 'en_curs') {
        const ref = r.ultima_reanudacio || r.inici;
        if (!ref) return base;
        // Cap a 8h: un en_curs con más de 8h de tiempo vivo es huérfano.
        return base + Math.min(elapsed(ref), 8 * 60 * 60);
    }
    return base;
}

function fmtSeg(s) {
    s = Math.max(0, Math.floor(s || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2,'0')}m`;
    return `${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
}

function fmtDateTime(d) {
    if (!d) return '—';
    return new Date(d).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function getToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function parseDate(str) {
    if (!str) return null;
    // Try YYYY-MM-DD or DD/MM/YYYY
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10);
    const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return null;
}

/** Número de fase desde "Fase 1", "FASE 2", "fase3", etc. */
function numFase(valor) {
    if (!valor) return null;
    const m = String(valor).match(/fase\s*([1-4])/i);
    return m ? Number(m[1]) : null;
}

/** Etiqueta canónica "Fase N" o null. */
function labelFase(valor) {
    const n = numFase(valor);
    return n ? `Fase ${n}` : null;
}

/**
 * Resuelve la fase de un registro activo:
 *  - tipus='fase' / operacio="Fase X"
 *  - operación detallada con campo fase en operacions_def
 *  - mono.operacio_actual
 */
function resolveFaseRegistre(r, opsDef = [], mono = null) {
    const fromOperacio = labelFase(r?.operacio);
    if (fromOperacio) return fromOperacio;
    if (r?.tipus === 'fase') {
        const n = numFase(r.operacio);
        if (n) return `Fase ${n}`;
    }
    const op = (opsDef || []).find((o) => o.nom === r?.operacio || o.codi === r?.operacio);
    if (op?.fase) return labelFase(op.fase) || String(op.fase);
    const fromMono = labelFase(mono?.operacio_actual);
    if (fromMono) return fromMono;
    return '';
}

/**
 * Una sola actividad por operario + mono (o exclusiva/libre si no hay mono).
 * Si hay varios registres en_curs/pausat del mismo trabajo (reintentos, reanudaciones
 * mal cerradas, etc.), se elige el representativo: coincide con mono.operacio_actual,
 * si no el más reciente por ultima_reanudacio/inici. No suma tiempos.
 */
function activityDedupeKey(op) {
    if (op.operariId && op.monoId) return `op:${op.operariId}|mono:${op.monoId}`;
    if (op.operariId && op.exclusivaId) return `op:${op.operariId}|ex:${op.exclusivaId}|t:${op.tipus || 'x'}`;
    if (op.operariId) return `op:${op.operariId}|reg:${op.id}`;
    return `reg:${op.id}`;
}

function activityRecency(op) {
    const t = Date.parse(op.ultimaReanudacio || op.inici || 0);
    return Number.isFinite(t) ? t : 0;
}

function pickBetterActivity(a, b) {
    const aMatch = a.monoOperacioActual && a.operacioNom
        && (a.monoOperacioActual === a.operacioNom || labelFase(a.monoOperacioActual) === labelFase(a.operacioNom));
    const bMatch = b.monoOperacioActual && b.operacioNom
        && (b.monoOperacioActual === b.operacioNom || labelFase(b.monoOperacioActual) === labelFase(b.operacioNom));
    if (aMatch !== bMatch) return aMatch ? a : b;
    // Preferir en_curs sobre pausat si empatan en frescura (±2s)
    const ta = activityRecency(a);
    const tb = activityRecency(b);
    if (Math.abs(ta - tb) < 2000) {
        if (a.pausat !== b.pausat) return a.pausat ? b : a;
    }
    return tb >= ta ? b : a;
}

function dedupeOperarisActius(list) {
    const map = new Map();
    for (const op of list) {
        const key = activityDedupeKey(op);
        const prev = map.get(key);
        if (!prev) map.set(key, op);
        else map.set(key, pickBetterActivity(prev, op));
    }
    return Array.from(map.values()).sort((a, b) => activityRecency(b) - activityRecency(a));
}

function PulseBar({ pct, color = 'bg-[hsl(var(--ok))]' }) {
    return (
        <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
            <div className={`h-2 rounded-full transition-all duration-700 ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
    );
}

/**
 * Línea de tiempo de una operación activa frente a la media del operario
 * para esa fase + marca (7 días). Muestra visualmente si el operario está al
 * inicio, dentro de la media o por encima/por debajo. Si no hay media válida
 * muestra "Sin datos". El tiempo productivo excluye pausas.
 */
function MediaTimeline({ sec, mediaSec, pausat }) {
    if (!mediaSec || mediaSec <= 0) {
        return (
            <div className="mt-2">
                <div className="h-1.5 w-full rounded-full bg-secondary" />
                <p className="mt-1 text-[11px] text-muted-foreground italic">Línea de tiempo: Sin datos de media</p>
            </div>
        );
    }
    // Escala: la media ocupa el 100% de la barra. Si sec > media, la barra se
    // satura en rojo y se indica cuánto por encima.
    const pct = Math.min(100, Math.round((sec / mediaSec) * 100));
    const ratio = sec / mediaSec;
    const color = pausat
        ? 'bg-[hsl(var(--warn))]'
        : ratio > 1.2 ? 'bg-destructive'
        : ratio > 1 ? 'bg-[hsl(var(--warn))]'
        : 'bg-[hsl(var(--ok))]';
    const etiqueta = pausat
        ? 'Pausado (tiempo congelado)'
        : ratio > 1.2 ? `Por encima de la media (${Math.round(ratio * 100)}%)`
        : ratio > 1 ? 'Al final de la media'
        : ratio > 0.5 ? 'Dentro de la media'
        : 'Al inicio de la fase';
    // Marcador de la media en la escala (si sec supera la media, el marcador
    // queda visible al 100%).
    return (
        <div className="mt-2">
            <div className="relative h-2 w-full rounded-full bg-secondary overflow-hidden">
                <div className={`h-2 rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
                {/* Marcador media (tick) — solo visible cuando sec < media */}
                {ratio < 1 && (
                    <div className="absolute top-0 h-2 w-0.5 bg-primary/70" style={{ left: '100%', transform: 'translateX(-100%)' }} title="Media" />
                )}
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                <span className={pausat ? 'text-[hsl(var(--warn))] font-semibold' : ratio > 1 ? 'text-destructive font-semibold' : 'text-[hsl(var(--ok))] font-semibold'}>{etiqueta}</span>
                <span className="tabular-nums">{fmtSeg(sec)} / {fmtSeg(mediaSec)} media</span>
            </div>
        </div>
    );
}

/* ─── Operario activity slide-over panel ─────────────────────────────────── */
function ActivityRow({ op, active, onClick }) {
    const isLliure = op.tipus === 'lliure';
    return (
        <button
            onClick={onClick}
            className={`w-full text-left rounded-lg border px-3 py-2 transition flex items-center gap-2 ${
                active ? 'border-primary bg-primary/10' : 'border-border hover:bg-secondary/40'
            }`}
        >
            <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${op.pausat ? 'bg-[hsl(var(--warn))]' : 'bg-[hsl(var(--ok))]'}`} />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                {isLliure ? 'Trabajo libre' : op.operacioNom}
            </span>
            <span className="shrink-0 font-display text-lg tabular-nums">{fmtSeg(op.sec)}</span>
        </button>
    );
}

function OperariActivityPanel({ selected, siblings, onSelectSibling, onClose }) {
    if (!selected) return null;
    const isLliure = selected.tipus === 'lliure';
    const isReop = selected.tipus === 'reoperacio';
    const exclusivaResolta = !!selected.exclusivaId;

    // Compact exclusiva evolution from already-loaded data
    const exMonos = selected._exclusivaMonos || [];
    const fets = exMonos.filter((m) => m.estat === 'finalitzat').length;
    const progres = exMonos.length ? Math.round((fets / exMonos.length) * 100) : 0;

    return (
        <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/50" onClick={onClose}>
            <div
                className="h-full w-full sm:max-w-md bg-card overflow-y-auto shadow-2xl flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="sticky top-0 z-10 border-b border-border bg-card px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Operario activo</p>
                            <p className="font-display text-3xl uppercase leading-none truncate">{selected.operariNom}</p>
                        </div>
                        <button onClick={onClose} className="rounded-md border border-border p-2 hover:bg-secondary shrink-0" aria-label="Cerrar">
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    {/* Multiple activities switcher */}
                    {siblings.length > 1 && (
                        <div>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Actividades activas ({siblings.length})
                            </p>
                            <div className="space-y-1.5">
                                {siblings.map((s) => (
                                    <ActivityRow key={s.id} op={s} active={s.id === selected.id} onClick={() => onSelectSibling(s.id)} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Work type + state badges */}
                    <div className="flex flex-wrap gap-2">
                        <span className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold uppercase ${isLliure ? 'bg-[hsl(var(--accent))]/15 text-[hsl(var(--accent))]' : selected.tipus === 'fase' ? 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]' : 'bg-primary/10 text-primary'}`}>
                            {isLliure ? <Wrench className="h-3.5 w-3.5" /> : selected.tipus === 'fase' ? <TrendingUp className="h-3.5 w-3.5" /> : <RouteIcon className="h-3.5 w-3.5" />}
                            {isLliure ? 'Trabajo libre' : selected.tipus === 'fase' ? 'Por fase' : 'Por ruta'}
                        </span>
                        <span className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold uppercase ${selected.pausat ? 'bg-[hsl(var(--warn))]/20 text-[hsl(var(--warn))]' : 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]'}`}>
                            {selected.pausat ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                            {selected.pausat ? 'Pausada' : 'En curso'}
                        </span>
                        {isReop && (
                            <span className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1 text-xs font-semibold uppercase text-destructive">
                                <Wrench className="h-3.5 w-3.5" /> Reoperación
                            </span>
                        )}
                    </div>

                    {selected.pausat && (
                        <div className="flex items-center justify-center gap-3 rounded-2xl border-2 border-[hsl(var(--warn))] bg-[hsl(var(--warn))]/15 px-5 py-4 animate-pulse">
                            <Pause className="h-9 w-9 text-[hsl(var(--warn))] shrink-0" />
                            <p className="font-display text-3xl sm:text-4xl uppercase tracking-wide leading-none text-[hsl(var(--warn))]">Pausado</p>
                        </div>
                    )}

                    {selected.pausat && selected.motiuInactivitat && (
                        <div className="flex items-center gap-2 rounded-lg border border-[hsl(var(--warn))]/40 bg-[hsl(var(--warn))]/10 px-3 py-2.5 text-sm font-semibold text-[hsl(var(--warn))]">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            Pausado por inactividad (90 min): {selected.motiuInactivitat}
                        </div>
                    )}

                    {/* Current operation */}
                    <section className="rounded-xl border border-border p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Operación actual</p>
                        <p className="font-display text-2xl uppercase leading-none">{isLliure ? 'Trabajo libre' : (selected.operacioNom || '—')}</p>
                        {selected.operacioCodi && !isLliure && (
                            <p className="mt-1 font-mono text-xs text-muted-foreground">{selected.operacioCodi}</p>
                        )}
                        {isLliure && selected.descripcio && (
                            <p className="mt-2 text-sm text-muted-foreground">{selected.descripcio}</p>
                        )}
                        {!isLliure && selected.fase && (
                            <p className="mt-2 text-xs text-muted-foreground">Fase: <span className="font-semibold text-foreground">{selected.fase}</span></p>
                        )}
                    </section>

                    {/* Times */}
                    <section className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-border p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Tiempo transcurrido</p>
                            <p className={`font-display text-3xl tabular-nums ${selected.pausat ? 'text-[hsl(var(--warn))]' : 'text-[hsl(var(--ok))]'}`}>{fmtSeg(selected.sec)}</p>
                            <p className="mt-1 text-xs text-muted-foreground">Desde el inicio</p>
                        </div>
                        <div className="rounded-xl border border-border p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Tiempo real acum.</p>
                            <p className="font-display text-3xl tabular-nums text-primary">{fmtSeg(selected.tempsRealSeg)}</p>
                            {selected.std > 0 && (
                                <p className="mt-1 text-xs text-muted-foreground">Estándar: {fmtSeg(selected.std)}</p>
                            )}
                        </div>
                    </section>

                    {/* Start time */}
                    <section className="rounded-xl border border-border p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Hora de inicio</p>
                                <p className="font-semibold tabular-nums">{fmtDateTime(selected.inici)}</p>
                            </div>
                            {selected.pct !== null && (
                                <div className="text-right">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Progreso op.</p>
                                    <p className="font-display text-2xl tabular-nums">{selected.pct}%</p>
                                </div>
                            )}
                        </div>
                        {selected.pct !== null && (
                            <div className="mt-2">
                                <PulseBar pct={selected.pct} color={selected.pct > 100 ? 'bg-destructive' : 'bg-[hsl(var(--ok))]'} />
                            </div>
                        )}
                    </section>

                    {/* Route + phase */}
                    {!isLliure && (
                        <section className="rounded-xl border border-border p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Ruta y fase</p>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <p className="text-xs text-muted-foreground">Ruta</p>
                                    <p className="font-semibold truncate">{selected.rutaNom || '—'}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Fase</p>
                                    <p className="font-semibold">{selected.fase || '—'}</p>
                                </div>
                            </div>
                        </section>
                    )}

                    {/* Exclusiva + article */}
                    {exclusivaResolta ? (
                        <section className="rounded-xl border border-border p-4 space-y-3">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Exclusiva</p>
                                <p className="font-display text-2xl uppercase leading-none">{selected.exclusivaNom}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <p className="text-xs text-muted-foreground">Artículo</p>
                                    <p className="font-semibold truncate">{selected.article || '—'}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Referencia</p>
                                    <p className="font-semibold truncate">{selected.referencia || '—'}</p>
                                </div>
                            </div>
                            {selected.monoCodi && (
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div>
                                        <p className="text-xs text-muted-foreground">Mono</p>
                                        <p className="font-mono font-semibold">{selected.monoCodi}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground">Talla</p>
                                        <p className="font-semibold">{selected.monoTalla || '—'}</p>
                                    </div>
                                </div>
                            )}

                            {/* Compact evolution */}
                            <div className="border-t border-border pt-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Evolución de la exclusiva</p>
                                <div className="grid grid-cols-3 gap-2 text-center">
                                    <div className="rounded-lg bg-secondary/60 py-2">
                                        <p className="font-display text-2xl">{exMonos.length}</p>
                                        <p className="text-xs text-muted-foreground">Monos</p>
                                    </div>
                                    <div className="rounded-lg bg-[hsl(var(--ok))]/10 py-2">
                                        <p className="font-display text-2xl text-[hsl(var(--ok))]">{fets}</p>
                                        <p className="text-xs text-muted-foreground">Completados</p>
                                    </div>
                                    <div className="rounded-lg bg-primary/10 py-2">
                                        <p className="font-display text-2xl text-primary">{progres}%</p>
                                        <p className="text-xs text-muted-foreground">Progreso</p>
                                    </div>
                                </div>
                                <div className="mt-2">
                                    <PulseBar pct={progres} color={progres === 100 ? 'bg-[hsl(var(--ok))]' : 'bg-[hsl(var(--accent))]'} />
                                </div>
                            </div>

                            {/* Action: open exclusiva detail (existing route, new tab preserves dashboard) */}
                            <a
                                href={`/exclusiva/${selected.exclusivaId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-1 flex items-center justify-center gap-2 rounded-md bg-primary px-4 h-11 text-sm font-semibold text-primary-foreground active:scale-[0.98] hover:bg-primary/90"
                            >
                                <ExternalLink className="h-4 w-4" /> Abrir detalle de exclusiva
                            </a>
                            <p className="text-center text-xs text-muted-foreground">Se abre en una pestaña nueva para mantener el dashboard en vivo.</p>
                        </section>
                    ) : (
                        /* Empty state: operario activo pero no se puede resolver la exclusiva */
                        <section className="rounded-xl border border-dashed border-border p-6 text-center">
                            <AlertTriangle className="mx-auto h-8 w-8 text-[hsl(var(--warn))] opacity-70" />
                            <p className="mt-2 font-semibold">No se pudo resolver la exclusiva</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                                El operario aparece activo pero su registro no tiene una exclusiva asociada o no es accesible con tus permisos.
                            </p>
                        </section>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function DashboardEnViu({ monos: extMonos, exclusives: extExclusives, opsDef: extOpsDef }) {
    useTick(1000);
    const pollTick = useTick(POLL_MS);

    // Live data layer — refresh every POLL_MS via polling + realtime
    const [registresActius, setRegistresActius] = useState([]);
    const [monos, setMonos] = useState(extMonos || []);
    const [exclusives, setExclusives] = useState(extExclusives || []);
    const [opsDef, setOpsDef] = useState(extOpsDef || []);
    const [rutes, setRutes] = useState([]);
    const [historialPausas, setHistorialPausas] = useState([]);
    const [controles, setControles] = useState([]);
    const [actividadCalidad, setActividadCalidad] = useState([]); // sesiones activas de Calidad (heartbeat)
    const [recentRegistres, setRecentRegistres] = useState([]); // últimos 7 días (medias por marca y por operario)
    const [users, setUsers] = useState([]); // operarios: respaldo de nombres si el expand falla
    const [attrRegistres, setAttrRegistres] = useState([]); // todos los registros: atribución de monos en curso sin asignar
    const [noConformitats, setNoConformitats] = useState([]); // incidencias de los últimos 7 días
    const [articles, setArticles] = useState([]);
    const [fasesExt, setFasesExt] = useState([]);
    const [lastUpdate, setLastUpdate] = useState(new Date());
    const [loading, setLoading] = useState(true);

    // Selected activity (registre id) for the slide-over panel
    const [selectedRegId, setSelectedRegId] = useState(null);
    const dedupeCloseSigRef = React.useRef('');

    const fetchData = useCallback(async () => {
        try {
            const [regs, ms, exs, ops, ruts, hp, qc, actCal, recent, ncs, usrs, attrRegs, arts, fext] = await Promise.all([
                pb.collection('registres').getFullList({
                    filter: 'estat = "en_curs" || estat = "pausat"',
                    expand: 'operari,mono,exclusiva',
                    sort: '-inici',
                    requestKey: 'live-regs',
                }),
                pb.collection('monos').getFullList({ expand: 'exclusiva,operari_assignat', requestKey: 'live-monos' }).catch(() => []),
                pb.collection('exclusives').getFullList({ expand: 'ruta,entregada_per', requestKey: 'live-exclusives' }).catch(() => []),
                pb.collection('operacions_def').getFullList({ requestKey: 'live-opsdef' }).catch(() => []),
                pb.collection('rutes').getFullList({ requestKey: 'live-rutes' }).catch(() => []),
                pb.collection('historial_pausas').getFullList({
                    sort: '-created', perPage: 30, expand: 'operari,exclusiva,mono', requestKey: 'live-histpauses',
                }).catch(() => []),
                pb.collection('controles_qualitat').getFullList({
                    filter: 'estado_qc = "en_proceso" || estado_qc = "en_retrabajo"',
                    expand: 'operari,exclusiva,mono,retrabajo_activo',
                    sort: '-updated',
                    requestKey: 'live-qc',
                }).catch(() => []),
                pb.collection('actividad_calidad').getFullList({
                    expand: 'operari,exclusiva,mono',
                    sort: '-updated',
                    requestKey: 'live-actcal',
                }).catch(() => []),
                pb.collection('registres').getFullList({
                    filter: pb.filter('inici >= {:s}', { s: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() }),
                    expand: 'operari,exclusiva',
                    requestKey: 'live-recent-regs',
                }).catch(() => []),
                pb.collection('no_conformitats').getFullList({
                    filter: pb.filter('created >= {:s}', { s: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() }),
                    expand: 'exclusiva',
                    requestKey: 'live-recent-nc',
                }).catch(() => []),
                pb.collection('users').getFullList({
                    fields: 'id,codi,name,rol,email',
                    requestKey: 'live-users',
                }).catch(() => []),
                // Registros ligeros de TODOS los registros (sin expand) para
                // atribuir monos en curso sin operari_assignat sellado.
                pb.collection('registres').getFullList({
                    fields: 'id,mono,operari,exclusiva,operacio,estat,inici,updated,control_qualitat,temps_real_seg,ultima_reanudacio',
                    sort: '-updated',
                    requestKey: 'live-regs-attr',
                }).catch(() => []),
                pb.collection('articles').getFullList({ requestKey: 'live-articles' }).catch(() => []),
                pb.collection('fases_externalizadas').getFullList({ requestKey: 'live-fext' }).catch(() => []),
            ]);

            // Cierre best-effort de registres huérfanos:
            //  1) Duplicados (mismo operari+mono): se congelan a 'pausat' (NO
            //     'finalitzat') para no marcar fases como completadas. Cap 8h.
            //  2) en_curs con >8h de tiempo vivo: huérfanos (browser cerrado,
            //     pérdida de conexión). Se congelan a 'pausat' con tiempo capado.
            // No borra historial. Guard en ref para no reintentar el mismo set.
            let cleanedRegs = regs;
            try {
                const now = Date.now();
                const MAX_EXTRA = 8 * 60 * 60; // 8h cap
                const freezeOne = (r, i, keyPrefix) => {
                    const stored = Number(r.temps_real_seg);
                    let base = Number.isFinite(stored) && stored > 0 ? stored : 0;
                    // Solo sumar tiempo vivo si es reciente (<=8h). Si es huérfano
                    // (>8h), el operario no estaba trabajando: no inflar el tiempo.
                    if (r.estat === 'en_curs') {
                        const ref = r.ultima_reanudacio || r.inici;
                        if (ref) {
                            const live = Math.max(0, Math.floor((now - new Date(ref).getTime()) / 1000));
                            if (live <= MAX_EXTRA) base += live;
                        }
                    }
                    return pb.collection('registres').update(
                        r.id,
                        { estat: 'pausat', temps_real_seg: base },
                        { requestKey: `${keyPrefix}-${r.id}-${i}` },
                    ).catch(() => {});
                };

                // 1) Dedup: mismo operari+mono, quedarse con el representativo.
                const groups = new Map();
                for (const r of regs) {
                    const opId = r.expand?.operari?.id || r.operari || '';
                    const monoId = r.mono || '';
                    if (!opId || !monoId) continue;
                    const key = `${opId}|${monoId}`;
                    if (!groups.has(key)) groups.set(key, []);
                    groups.get(key).push(r);
                }
                const toClose = [];
                const closeIds = new Set();
                for (const list of groups.values()) {
                    if (list.length < 2) continue;
                    const mono = list[0].expand?.mono || ms.find((m) => m.id === list[0].mono);
                    const monoOp = mono?.operacio_actual || '';
                    list.sort((a, b) => {
                        const aMatch = monoOp && (a.operacio === monoOp || labelFase(a.operacio) === labelFase(monoOp));
                        const bMatch = monoOp && (b.operacio === monoOp || labelFase(b.operacio) === labelFase(monoOp));
                        if (aMatch !== bMatch) return aMatch ? -1 : 1;
                        const ta = Date.parse(a.ultima_reanudacio || a.inici || 0) || 0;
                        const tb = Date.parse(b.ultima_reanudacio || b.inici || 0) || 0;
                        return tb - ta;
                    });
                    for (let i = 1; i < list.length; i += 1) {
                        toClose.push(list[i]);
                        closeIds.add(list[i].id);
                    }
                }

                // 2) Huérfanos: en_curs con >8h de tiempo vivo.
                const orphans = regs.filter((r) => {
                    if (r.estat !== 'en_curs') return false;
                    const ref = r.ultima_reanudacio || r.inici;
                    if (!ref) return false;
                    const live = Math.max(0, Math.floor((now - new Date(ref).getTime()) / 1000));
                    return live > MAX_EXTRA;
                });

                const allToFreeze = [...toClose, ...orphans.filter((r) => !closeIds.has(r.id))];
                const allIds = new Set(allToFreeze.map((r) => r.id));

                if (allToFreeze.length) {
                    // NO eliminar los registros del listado visible: se congelan
                    // en local (estat pausat, tiempo capado a 8h) para que el
                    // operario SIGA visible como pausado con el tiempo congelado
                    // mientras la actualización del servidor se aplica — y también
                    // si esta falla (permisos, red, carrera con el cliente del
                    // operario). Antes se filtraban del listado y el operario
                    // desaparecía por completo del dashboard en vivo.
                    const cappedBase = (r) => {
                        const stored = Number(r.temps_real_seg);
                        let base = Number.isFinite(stored) && stored > 0 ? stored : 0;
                        if (r.estat === 'en_curs') {
                            const ref = r.ultima_reanudacio || r.inici;
                            if (ref) {
                                const live = Math.max(0, Math.floor((now - new Date(ref).getTime()) / 1000));
                                if (live <= MAX_EXTRA) base += live;
                            }
                        }
                        return base;
                    };
                    cleanedRegs = regs.map((r) => (allIds.has(r.id)
                        ? { ...r, estat: 'pausat', temps_real_seg: cappedBase(r) }
                        : r));
                    const sig = [...allIds].sort().join(',');
                    if (dedupeCloseSigRef.current !== sig) {
                        dedupeCloseSigRef.current = sig;
                        void Promise.all(
                            allToFreeze.map((r, i) => freezeOne(r, i, 'live-freeze')),
                        );
                    }
                }
            } catch {
                cleanedRegs = regs;
            }

            setRegistresActius(cleanedRegs);
            setMonos(ms);
            setExclusives(exs);
            setOpsDef(ops);
            setRutes(ruts);
            setHistorialPausas(hp || []);
            setControles(qc || []);
            setActividadCalidad(actCal || []);
            setRecentRegistres(recent || []);
            setNoConformitats(ncs || []);
            setUsers(usrs || []);
            setAttrRegistres(attrRegs || []);
            setArticles(arts || []);
            setFasesExt(fext || []);
            setLastUpdate(new Date());
        } catch (e) {
            // Silently continue with stale data
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData, pollTick]);

    // Realtime subscription: registres, monos, exclusives, controles,
    // retrabajos e historial_pausas. Cubre confección (fases/unidades),
    // calidad y retrabajos sin duplicados (la recarga usa requestKey fijos).
    useEffect(() => {
        const cols = ['registres', 'monos', 'exclusives', 'controles_qualitat', 'actividad_calidad', 'retrabajos', 'historial_pausas'];
        // Debounce: los bursts de eventos realtime (p.ej. al iniciar/pausar
        // varias operaciones a la vez) disparaban fetchData en cascada. Como
        // todas las peticiones comparten requestKey fijo, el SDK auto-cancelaba
        // las en vuelo, y al no tener .catch en la petición de registres el
        // Promise.all entero rechazaba y el dashboard se quedaba sin datos
        // (Amin desaparecía aunque estuviera activo). El debounce agrupa los
        // eventos en una sola recarga y evita peticiones solapadas.
        let timer = null;
        const schedule = () => {
            clearTimeout(timer);
            timer = setTimeout(() => { timer = null; fetchData(); }, 600);
        };
        cols.forEach((c) => { void pb.collection(c).subscribe('*', schedule).catch(() => {}); });
        return () => {
            clearTimeout(timer);
            cols.forEach((c) => { void pb.collection(c).unsubscribe('*').catch(() => {}); });
        };
    }, [fetchData]);

    // ── Medias semanales (7 días) para marca y para operario/fase/marca ──
    const opsByNomLive = useMemo(() => {
        const m = {};
        (opsDef || []).forEach((op) => { if (op.nom) m[op.nom] = op; });
        return m;
    }, [opsDef]);
    // Mapa de usuarios: resolver el nombre del operario aunque el expand de
    // la relación falle (evita filas anónimas "—" que parecen operarios
    // ausentes, como le ocurría a Amin).
    const usersById = useMemo(() => {
        const m = new Map();
        (users || []).forEach((u) => { if (u.id) m.set(u.id, u); });
        return m;
    }, [users]);
    const nomOperari = useCallback((id, expand) => {
        // Resolución robusta del nombre visible del operario:
        //  1. expand (relación operari del registre/mono)
        //  2. listado de usuarios cargado por el dashboard
        //  3. email como último recurso (cuenta sin name/codi)
        // Así un operario cuya cuenta tenga name vacío (p.ej. "Amin" creado
        // en runtime sin rellenar el nombre) sigue mostrando un identificador
        // legible en vez de "—", y no desaparece del dashboard.
        if (expand?.name) return expand.name;
        if (expand?.codi) return expand.codi;
        const u = usersById.get(id);
        if (u?.name) return u.name;
        if (u?.codi) return u.codi;
        if (u?.email) return u.email;
        if (expand?.email) return expand.email;
        // Si el id no resuelve a ningún usuario (cuenta borrada o identidad
        // migrada), mostrar una etiqueta reconocible en vez de "—" para que
        // el operario siga visible en el dashboard y no parezca ausente.
        if (id) return `Operario ${String(id).slice(-4)}`;
        return null;
    }, [usersById]);
    const enrichedRecent = useMemo(
        () => enriquirRegistres(registresValids(recentRegistres, rangUltimsDies(7)), opsByNomLive),
        [recentRegistres, opsByNomLive],
    );
    const mitjanesMarca = useMemo(() => mitjanesPerMarca(enrichedRecent), [enrichedRecent]);
    const marquesFasesLive = useMemo(() => fasesPresentats(mitjanesMarca), [mitjanesMarca]);
    const incidenciesMapLive = useMemo(() => incidenciesPerMarca(noConformitats), [noConformitats]);
    const mitjanesMarcaFinal = useMemo(
        () => mitjanesMarca.map((m) => {
            const count = incidenciesMapLive.get(m.marca) || 0;
            return { ...m, incidenciesCount: count, mitjanaIncidencies: mitjanaIncidenciesText(count, m.exclusivesCount) };
        }),
        [mitjanesMarca, incidenciesMapLive],
    );

    // ── Derived: active operators (1 fila por operario+mono/trabajo) ──────
    // Recalcula cada segundo (useTick) para el cronómetro en vivo; dedupe evita
    // filas repetidas del mismo operario+mono por registres huérfanos en_curs.
    const operarisActius = (() => {
        const mapped = registresActius.map((r) => {
            const mono = r.expand?.mono || monos.find((m) => m.id === r.mono) || null;
            const ex = r.expand?.exclusiva || exclusives.find((e) => e.id === r.exclusiva);
            const op = opsDef.find((o) => o.nom === r.operacio || o.codi === r.operacio);
            const sec = productiuSec(r);
            const operariId = r.expand?.operari?.id || r.operari
                || mono?.expand?.operari_assignat?.id || mono?.operari_assignat || null;
            const std = r.temps_estandard_seg || (op?.temps_std_min || 0) * 60;
            const pct = std > 0 ? Math.min(100, Math.round((sec / std) * 100)) : null;
            const rutaNom = ex?.ruta ? (rutes.find((rt) => rt.id === ex.ruta)?.nom || null) : null;
            const fase = resolveFaseRegistre(r, opsDef, mono);
            let tipus = 'ruta';
            if (r.tipus === 'lliure') tipus = 'lliure';
            else if (r.tipus === 'reoperacio') tipus = 'reoperacio';
            else if (r.tipus === 'fase' || numFase(r.operacio)) tipus = 'fase';
            return {
                id: r.id,
                operariId,
                operariNom: nomOperari(operariId, r.expand?.operari) || '—',
                operacioCodi: op?.codi || (tipus === 'fase' ? 'FASE' : ''),
                operacioNom: r.operacio || '—',
                descripcio: r.notes || '',
                exclusivaId: r.exclusiva || ex?.id || null,
                exclusivaNom: ex?.exclusiva || '—',
                article: ex?.article || '',
                referencia: ex?.referencia || '',
                marca: ex?.marca ? String(ex.marca).trim() : '',
                rutaNom,
                fase,
                monoCodi: mono?.codi || '—',
                monoTalla: mono?.talla || '',
                monoId: mono?.id || r.mono || null,
                monoOperacioActual: mono?.operacio_actual || '',
                inici: r.inici,
                ultimaReanudacio: r.ultima_reanudacio || r.inici || null,
                pausat: r.estat === 'pausat',
                sec,
                pct,
                std,
                tipus,
                tempsRealSeg: sec,
                motiuInactivitat: r.motiu_pausa_inactivitat || '',
                inactivitatDetectada: !!r.inactivitat_detectada,
                _exclusivaMonos: ex ? monos.filter((m) => m.exclusiva === ex.id) : [],
            };
        });
        const deduped = dedupeOperarisActius(mapped);

        // Respaldo solo con operación vigente (registre en_curs o pausat) del
        // operario sellado, si esa fila no llegó a la lista principal.
        // No se atribuye por el último registro histórico: eso creaba filas
        // fantasma "En curso" sin cronómetro. Si está pausada, se muestra pausada.
        const ESTATS_TERMINALS = new Set(['entregada', 'finalitzada', 'desapareguda']);
        const operarisAmbFila = new Set(deduped.map((o) => o.operariId).filter(Boolean));
        const monosAmbFila = new Set(deduped.map((o) => o.monoId).filter(Boolean));
        const openByMono = new Map();
        for (const r of (attrRegistres || [])) {
            if (!r.mono) continue;
            const est = String(r.estat || '');
            if (est !== 'en_curs' && est !== 'pausat') continue;
            if (!openByMono.has(r.mono)) openByMono.set(r.mono, []);
            openByMono.get(r.mono).push(r);
        }
        const fallbacks = [];
        for (const m of monos) {
            const mEstat = String(m.estat || '');
            if (mEstat !== 'en_curs' && mEstat !== 'retreball' && mEstat !== 'pausat') continue;
            const opId = m.expand?.operari_assignat?.id || m.operari_assignat || null;
            if (!opId || operarisAmbFila.has(opId) || monosAmbFila.has(m.id)) continue;
            const ex = m.expand?.exclusiva || exclusives.find((e) => e.id === m.exclusiva) || null;
            const exEstat = String(ex?.estat || '').toLowerCase().trim();
            if (ESTATS_TERMINALS.has(exEstat)) continue;
            const open = (openByMono.get(m.id) || []).filter((r) => !r.operari || r.operari === opId);
            if (!open.length) continue;
            const pausat = !open.some((r) => r.estat === 'en_curs');
            const fase = labelFase(m.operacio_actual) || '';
            fallbacks.push({
                id: `mono-fb-${m.id}`,
                operariId: opId,
                operariNom: nomOperari(opId, m.expand?.operari_assignat) || 'Operario',
                operacioCodi: '',
                operacioNom: m.operacio_actual || '—',
                descripcio: '',
                exclusivaId: ex?.id || null,
                exclusivaNom: ex?.exclusiva || '—',
                article: ex?.article || '',
                referencia: ex?.referencia || '',
                marca: ex?.marca ? String(ex.marca).trim() : '',
                rutaNom: null,
                fase,
                monoCodi: m.codi || '—',
                monoTalla: m.talla || '',
                monoId: m.id,
                monoOperacioActual: m.operacio_actual || '',
                inici: null,
                ultimaReanudacio: null,
                pausat,
                sec: 0,
                pct: null,
                std: 0,
                tipus: fase ? 'fase' : 'ruta',
                tempsRealSeg: 0,
                motiuInactivitat: '',
                inactivitatDetectada: false,
                fallback: true,
                viaUltimRegistre: false,
                monoEnRetreball: mEstat === 'retreball',
                _exclusivaMonos: ex ? monos.filter((mm) => mm.exclusiva === ex.id) : [],
            });
        }
        return [...deduped, ...fallbacks];
    })();

    // Selected activity + siblings (otros trabajos del mismo operario, ya deduplicados)
    const selectedOp = useMemo(
        () => operarisActius.find((o) => o.id === selectedRegId) || null,
        [operarisActius, selectedRegId],
    );
    const siblings = useMemo(
        () => selectedOp ? operarisActius.filter((o) => o.operariId && o.operariId === selectedOp.operariId) : [],
        [operarisActius, selectedOp],
    );

    // Si el registro seleccionado desaparece por dedupe, saltar al representativo del mismo trabajo
    useEffect(() => {
        if (!selectedRegId) return;
        if (operarisActius.some((o) => o.id === selectedRegId)) return;
        const raw = registresActius.find((r) => r.id === selectedRegId);
        if (!raw) {
            setSelectedRegId(null);
            return;
        }
        const operariId = raw.expand?.operari?.id || raw.operari || null;
        const monoId = raw.mono || null;
        const exclusivaId = raw.exclusiva || null;
        const alt = operarisActius.find((o) =>
            o.operariId && o.operariId === operariId
            && ((monoId && o.monoId === monoId) || (!monoId && o.exclusivaId === exclusivaId)),
        );
        setSelectedRegId(alt?.id || null);
    }, [selectedRegId, operarisActius, registresActius]);

    // ── Derived: today's exclusivas ───────────────────────────────────────
    const today = getToday();
    const exclusivesAvui = exclusives
        .filter((e) => {
            const d = parseDate(e.data_entrega || e.data_estimada);
            return d === today;
        })
        .map((e) => {
            const seus = monos.filter((m) => m.exclusiva === e.id);
            const fets = seus.filter((m) => m.estat === 'finalitzat').length;
            const pct = seus.length ? Math.round((fets / seus.length) * 100) : 0;
            const retras = e.estat !== 'finalitzada' && pct < 90;
            return { ...e, totalMonos: seus.length, fets, pct, retras };
        })
        .sort((a, b) => (a.pct - b.pct)); // most behind first

    // ── Derived: phase breakdown (Fase 1/2/3 canónicas) ───────────────────
    const faseList = ['Fase 1', 'Fase 2', 'Fase 3', 'Fase 4'];
    const faseData = faseList.map((fase) => {
        const fasOps = opsDef.filter((o) => labelFase(o.fase) === fase || o.fase === fase);
        const exclusivesEnFase = new Set();
        const monosEnFaseSet = new Set();
        const operarisEnFaseSet = new Set();

        for (const op of operarisActius) {
            if (op.fase !== fase) continue;
            // Solo contar como activos en la fase los que están en curso
            // (los pausados se muestran en su propia sección, no aquí).
            if (op.pausat) continue;
            if (op.operariId) operarisEnFaseSet.add(op.operariId);
            if (op.monoId) monosEnFaseSet.add(op.monoId);
            if (op.exclusivaId) exclusivesEnFase.add(op.exclusivaId);
        }

        // Fallback: monos con operacio_actual de fase aunque el expand falle
        for (const m of monos) {
            if (labelFase(m.operacio_actual) !== fase) continue;
            const mActive = registresActius.find((r) => r.mono === m.id || r.mono === m.id);
            if (!mActive && m.estat !== 'en_curs' && m.estat !== 'pausat') continue;
            monosEnFaseSet.add(m.id);
            if (m.exclusiva) exclusivesEnFase.add(m.exclusiva);
        }

        return {
            fase,
            monosEnFase: monosEnFaseSet.size,
            exclusivesCount: exclusivesEnFase.size,
            fasopsCount: fasOps.length,
            operarisActius: operarisEnFaseSet.size || operarisActius.filter((op) => op.fase === fase && !op.pausat).length,
            tempsTotalSec: operarisActius.filter((op) => op.fase === fase && !op.pausat).reduce((s, op) => s + (op.sec || 0), 0),
        };
    });

    // ── KPIs ──────────────────────────────────────────────────────────────
    // El informe en vivo solo muestra como "activos" a los operarios con
    // operaciones realmente en curso (en_curs). Los pausados quedan fuera del
    // contador de activos y se muestran en su propia sección "Pausados", con
    // el tiempo congelado (sin seguir acumulando). El historial y los informes
    // históricos no se ven afectados.
    const operarisFallback = operarisActius.filter((o) => o.fallback && !o.pausat);
    const operarisEnCurs = operarisActius.filter((o) => !o.pausat && !o.fallback);
    const operarisPausats = operarisActius.filter((o) => o.pausat);
    const totalActius = operarisEnCurs.length + operarisFallback.length;
    const totalPausats = operarisPausats.length;
    const totalAvui = exclusivesAvui.length;
    const totalRetras = exclusivesAvui.filter((e) => e.retras).length;

    // ── Operarios de Calidad en vivo ─────────────────────────────────────
    // Los operarios de Calidad trabajan sobre `actividad_calidad` (sesión
    // activa efímera creada por el Control de calidad simplificado al abrir
    // una unidad pendiente) y, como respaldo, sobre `controles_qualitat` en
    // retrabajo (creados por el checklist QC detallado). Así aparecen en vivo
    // tanto los inspectores revisando como los que tienen retrabajos abiertos.
    // Una fila por operario+unidad/mono, sin duplicados. El tiempo de
    // inspección es en vivo (now - updated, cap 8h); congelado en retrabajo.
    const operarisQualitat = (() => {
        const now = Date.now();
        const MAX = 8 * 60 * 60;
        const map = new Map();
        // Un operario con una operación de confección activa (registre
        // en_curs/pausat) se muestra como confección, NUNCA como Calidad:
        // evita que un operario de confección (p.ej. con un retrabajo abierto)
        // aparezca duplicado o mal clasificado en la sección de Calidad.
        const confeccioActiveIds = new Set(
            operarisActius.map((o) => o.operariId).filter(Boolean),
        );
        // Sesión de Calidad huérfana: el heartbeat de actividad_calidad no se
        // actualiza periódicamente, solo al crearla. Una sesión sin actualizar
        // desde hace >8h es casi con seguridad huérfana (browser cerrado,
        // pérdida de conexión) y no debe contar como Calidad activa.
        const STALE_MS = 8 * 60 * 60 * 1000;
        const addRec = (rec) => {
            const prev = map.get(rec.key);
            if (!prev || new Date(rec.updated || 0).getTime() > new Date(prev.updated || 0).getTime()) {
                map.set(rec.key, rec);
            }
        };
        // 1) Sesiones activas del Control de calidad simplificado (heartbeat)
        for (const a of actividadCalidad) {
            const opId = a.expand?.operari?.id || a.operari || null;
            if (!opId) continue;
            // Si el operario está haciendo confección ahora mismo, se muestra
            // como confección: no duplicar en Calidad.
            if (confeccioActiveIds.has(opId)) continue;
            // Descartar sesiones huérfanas (sin heartbeat >8h).
            const aUpdated = Date.parse(a.updated || a.created || 0);
            if (Number.isFinite(aUpdated) && (now - aUpdated) > STALE_MS) continue;
            const ex = a.expand?.exclusiva || exclusives.find((e) => e.id === a.exclusiva) || null;
            const mono = a.expand?.mono || monos.find((m) => m.id === a.mono) || null;
            const enRetrabajo = String(a.estado || '') === 'en_retrabajo';
            const ref = a.updated || a.created;
            let sec = 0;
            if (!enRetrabajo && ref) {
                const refMs = new Date(ref).getTime();
                if (Number.isFinite(refMs)) sec = Math.min(Math.max(0, Math.floor((now - refMs) / 1000)), MAX);
            }
            const unidad = a.unidad_numero != null ? Number(a.unidad_numero) : null;
            addRec({
                id: a.id,
                key: `${opId}|${a.mono || ''}|${unidad != null ? `u${unidad}` : ''}`,
                operariId: opId,
                operariNom: a.expand?.operari?.name || a.expand?.operari?.codi || 'Calidad',
                exclusivaId: a.exclusiva || ex?.id || null,
                exclusivaNom: ex?.exclusiva || '—',
                article: ex?.article || '',
                referencia: ex?.referencia || '',
                monoCodi: mono?.codi || (unidad != null ? `Ud. ${unidad}` : '—'),
                monoId: a.mono || mono?.id || null,
                unidadNumero: unidad,
                enRetrabajo,
                sec,
                inici: a.created,
                updated: a.updated,
                origen: 'actividad',
            });
        }
        // 2) Respaldo: controles_qualitat en retrabajo (checklist QC detallado)
        for (const c of controles) {
            const opId = c.expand?.operari?.id || c.operari || null;
            if (!opId) continue;
            if (String(c.estado_qc || '') !== 'en_retrabajo') continue;
            // Si el operario está haciendo confección ahora mismo, se muestra
            // como confección (el retrabajo es trabajo de confección, no de
            // inspección de Calidad): no duplicar en Calidad.
            if (confeccioActiveIds.has(opId)) continue;
            const ex = c.expand?.exclusiva || exclusives.find((e) => e.id === c.exclusiva) || null;
            const mono = c.expand?.mono || monos.find((m) => m.id === c.mono) || null;
            const base = (Number(c.tiempo_qc_inicial_seg) || 0) + (Number(c.tiempo_qc_adicional_seg) || 0);
            addRec({
                id: c.id,
                key: `${opId}|${c.mono || ''}|cq`,
                operariId: opId,
                operariNom: c.expand?.operari?.name || c.expand?.operari?.codi || 'Calidad',
                exclusivaId: c.exclusiva || ex?.id || null,
                exclusivaNom: ex?.exclusiva || '—',
                article: ex?.article || '',
                referencia: ex?.referencia || '',
                monoCodi: mono?.codi || '—',
                monoId: c.mono || mono?.id || null,
                unidadNumero: null,
                enRetrabajo: true,
                sec: base,
                inici: c.created,
                updated: c.updated,
                origen: 'controles',
            });
        }
        return Array.from(map.values()).sort(
            (a, b) => new Date(b.updated || 0).getTime() - new Date(a.updated || 0).getTime(),
        );
    })();
    const totalQualitat = operarisQualitat.length;

    const saturacio = (() => {
        const map = new Map();
        for (const o of [...operarisEnCurs, ...operarisFallback]) {
            if (!o.operariId || o.pausat || map.has(o.operariId)) continue;
            map.set(o.operariId, { id: o.operariId, nom: o.operariNom });
        }
        return calcularSaturacion({
            exclusives,
            monos,
            registresFase: attrRegistres,
            enriched: enrichedRecent,
            articles,
            fasesExt,
            operarisActius: Array.from(map.values()),
            now: new Date(),
        });
    })();

    // ── Fase de Calidad: exclusivas con confección terminada ───────────
    // Se muestran:
    //  - Exclusivas ya en un estado gestionado por Calidad (pendiente_calidad,
    //    en_retrabajo, parcialmente_conforme).
    //  - Exclusivas con un control de calidad activo (en_proceso/en_retrabajo).
    //  - Exclusivas en confección (en_curs, retrasada, recibida, pendent) cuyos
    //    TODOS los monos están finalitzats → "Preparada para Calidad" aunque
    //    el hook de auto-transición aún no haya movido el estat. Respeta Fase
    //    1/2/3 (y Fase 4 solo CIK R84-053/R84-054) porque mono.estat='finalitzat'
    //    solo se marca cuando todas las fases esperadas están terminadas.
    // Nunca mezcla con exclusivas ya aprobadas/entregadas/finalizadas.
    const CALIDAD_ESTATS = new Set(['pendiente_calidad', 'pendiente_revision', 'en_retrabajo', 'parcialmente_conforme']);
    const CONFECTION_ESTATS = new Set(['recibida', 'pendent', 'en_curs', 'retrasada']);
    const activeQCIds = new Set(controles.map((c) => c.exclusiva).filter(Boolean));
    const retrabajoQCIds = new Set(
        controles.filter((c) => String(c.estado_qc || '') === 'en_retrabajo').map((c) => c.exclusiva).filter(Boolean),
    );
    const calidadExclusives = exclusives
        .filter((ex) => {
            const e = String(ex.estat || '').toLowerCase().trim();
            if (e === 'lista_recollida' || e === 'entregada' || e === 'finalitzada') return false;
            if (CALIDAD_ESTATS.has(e) || activeQCIds.has(ex.id)) return true;
            // Detección computada: todos los monos finalitzats → preparada para Calidad
            if (CONFECTION_ESTATS.has(e)) {
                const exMonos = monos.filter((m) => m.exclusiva === ex.id);
                if (exMonos.length > 0 && exMonos.every((m) => String(m.estat || '') === 'finalitzat')) return true;
            }
            return false;
        })
        .map((ex) => {
            const e = String(ex.estat || '').toLowerCase().trim();
            const exMonos = monos.filter((m) => m.exclusiva === ex.id);
            const allDone = exMonos.length > 0 && exMonos.every((m) => String(m.estat || '') === 'finalitzat');
            const enRetrabajo = retrabajoQCIds.has(ex.id) || e === 'en_retrabajo';
            const enControl = !enRetrabajo && (activeQCIds.has(ex.id) || e === 'parcialmente_conforme' || e === 'pendiente_revision');
            const pendiente = !enRetrabajo && !enControl && (e === 'pendiente_calidad' || (CONFECTION_ESTATS.has(e) && allDone));
            return {
                ...ex,
                enControl,
                enRetrabajo,
                pendiente,
                allDone,
                totalMonos: exMonos.length,
                fets: exMonos.filter((m) => m.estat === 'finalitzat').length,
            };
        })
        .sort((a, b) => {
            const rank = (x) => (x.pendiente ? 0 : x.enControl ? 1 : 2);
            const r = rank(a) - rank(b);
            if (r !== 0) return r;
            return String(a.exclusiva).localeCompare(String(b.exclusiva));
        });
    const listasRecoger = exclusives.filter((ex) => String(ex.estat || '').toLowerCase().trim() === 'lista_recollida').length;
    const totalPreparadesCalitat = calidadExclusives.filter((e) => e.pendiente).length;

    // ── Unidades/monos entregados hoy ───────────────────────────────────
    // Solo exclusivas con estat='entregada' y data_entrega_real = hoy.
    // Se cuenta el número de monos (unidades) de esas exclusivas, no las
    // exclusivas completas pero no entregadas (lista_recollida / finalitzada).
    // Se actualiza en directo: el realtime ya cubre 'exclusives'.
    const entregadesAvui = (() => {
        const today = getToday();
        const exList = exclusives.filter((ex) => {
            if (String(ex.estat || '').toLowerCase().trim() !== 'entregada') return false;
            const d = ex.data_entrega_real;
            if (!d) return false;
            return parseDate(d) === today;
        });
        const exIds = new Set(exList.map((ex) => ex.id));
        const monosCount = monos.filter((m) => exIds.has(m.exclusiva)).length;
        return { monosCount, exclusivesCount: exList.length, list: exList };
    })();

    if (loading) {
        return (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 animate-pulse">
                {[0,1,2,3].map((i) => <div key={i} className="h-28 rounded-xl bg-secondary" />)}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header strip */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <span className="flex h-3 w-3 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[hsl(var(--ok))] opacity-75" />
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-[hsl(var(--ok))]" />
                    </span>
                    <span className="font-display text-2xl uppercase">En vivo</span>
                </div>
                <p className="text-xs text-muted-foreground">
                    Última actualización: {lastUpdate.toLocaleTimeString('es-ES')} · Actualización automática cada {POLL_MS/1000}s
                </p>
            </div>

            {/* KPI cards */}
            <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
                {[
                    { icon: Activity, label: 'Operarios activos', value: totalActius, color: 'text-[hsl(var(--ok))]', bg: 'bg-[hsl(var(--ok))]/10' },
                    { icon: Pause, label: 'Pausados', value: totalPausats, color: 'text-[hsl(var(--warn))]', bg: 'bg-[hsl(var(--warn))]/10' },
                    { icon: Shield, label: 'Operarios Calidad', value: totalQualitat, color: 'text-blue-600', bg: 'bg-blue-100' },
                    { icon: Clock, label: 'Entregas hoy', value: totalAvui, color: 'text-primary', bg: 'bg-primary/10' },
                    { icon: AlertTriangle, label: 'En riesgo hoy', value: totalRetras, color: 'text-destructive', bg: 'bg-destructive/10' },
                    { icon: CheckCircle, label: 'Preparadas Calidad', value: totalPreparadesCalitat, color: 'text-[hsl(var(--ok))]', bg: 'bg-[hsl(var(--ok))]/10' },
                    { icon: PackageCheck, label: 'Listas para recoger', value: listasRecoger, color: 'text-[hsl(var(--ok))]', bg: 'bg-[hsl(var(--ok))]/10' },
                    { icon: Truck, label: 'Unidades entregadas hoy', value: entregadesAvui.monosCount, color: 'text-primary', bg: 'bg-primary/10' },
                ].map(({ icon: Icon, label, value, color, bg }) => (
                    <div key={label} className={`rounded-xl border border-border bg-card p-5 flex items-center gap-4`}>
                        <div className={`rounded-xl p-3 ${bg}`}>
                            <Icon className={`h-6 w-6 ${color}`} />
                        </div>
                        <div>
                            <p className={`font-display text-5xl tabular-nums leading-none ${color}`}>{value}</p>
                            <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wide">{label}</p>
                        </div>
                    </div>
                ))}
            </div>

            <AnalisisSaturacion saturacio={saturacio} />

            {/* Main grid */}
            <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">

                {/* ── Operarios activos ─────────────────────────────────── */}
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
                        <Users className="h-5 w-5 text-[hsl(var(--ok))]" />
                        <h3 className="font-display text-2xl uppercase">Operarios activos ({operarisEnCurs.length + operarisFallback.length + operarisQualitat.length})</h3>
                        <span className="ml-auto text-xs text-muted-foreground hidden sm:block">Confección y Calidad · haz clic para ver el detalle</span>
                    </div>

                    {operarisEnCurs.length === 0 && operarisFallback.length === 0 && operarisQualitat.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                            <Users className="h-10 w-10 opacity-30" />
                            <p className="text-sm">Ningún operario con operación activa en este momento.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-border">
                            {operarisEnCurs.map((op) => {
                                const over = op.std > 0 && op.sec > op.std;
                                return (
                                    <button
                                        key={op.id}
                                        type="button"
                                        onClick={() => setSelectedRegId(op.id)}
                                        className={`w-full text-left px-5 py-4 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                                            op.pausat ? 'bg-[hsl(var(--warn))]/5' : 'hover:bg-secondary/30'
                                        } ${selectedRegId === op.id ? 'ring-2 ring-inset ring-primary' : ''}`}
                                    >
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="flex items-center gap-3">
                                                <div className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold uppercase ${
                                                    op.pausat ? 'bg-[hsl(var(--warn))]/20 text-[hsl(var(--warn))]' : 'bg-[hsl(var(--ok))]/20 text-[hsl(var(--ok))]'
                                                }`}>
                                                    {op.operariNom.substring(0, 2)}
                                                    {!op.pausat && (
                                                        <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-[hsl(var(--ok))] border-2 border-card" />
                                                    )}
                                                    {op.pausat && (
                                                        <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-[hsl(var(--warn))] border-2 border-card" />
                                                    )}
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-base">{op.operariNom}
                                                        {op.pausat && <span className="ml-2 text-xs rounded bg-[hsl(var(--warn))]/20 text-[hsl(var(--warn))] px-2 py-0.5 font-normal">Pausado</span>}
                                                        {op.tipus === 'lliure' && <span className="ml-2 text-xs rounded bg-[hsl(var(--accent))]/15 text-[hsl(var(--accent))] px-2 py-0.5 font-normal">Libre</span>}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {op.operacioCodi && op.tipus !== 'lliure' && <span className="font-mono mr-1">{op.operacioCodi}</span>}
                                                        {op.tipus === 'lliure' ? 'Trabajo libre' : op.operacioNom}
                                                    </p>
                                                    {op.tipus === 'lliure' && op.descripcio && (
                                                        <p className="text-xs text-muted-foreground/80 italic truncate max-w-[260px]" title={op.descripcio}>“{op.descripcio}”</p>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="text-right">
                                                <p className={`font-display text-3xl tabular-nums ${over ? 'text-destructive' : op.pausat ? 'text-[hsl(var(--warn))]' : 'text-[hsl(var(--ok))]'}`}>
                                                    {fmtSeg(op.sec)}
                                                </p>
                                                {op.std > 0 && (
                                                    <p className="text-xs text-muted-foreground">de {fmtSeg(op.std)} est.</p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                            <span>Exclusiva: <span className="font-semibold text-foreground">{op.exclusivaNom}</span></span>
                                            <span>Mono: <span className="font-semibold text-foreground font-mono">{op.monoCodi}</span></span>
                                            {op.fase && <span>Fase: <span className="font-semibold text-foreground">{op.fase}</span></span>}
                                        </div>
                                        {op.fase && op.operariId && (() => {
                                            const mitj = mitjanaOperariFaseMarca(enrichedRecent, op.operariId, op.fase, op.marca);
                                            const cls = mitj ? classificaMitjana(op.sec, mitj.mitjana) : 'sin_datos';
                                            const badge = cls === 'dentro' ? 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]' : cls === 'sin_datos' ? 'bg-secondary text-muted-foreground' : 'bg-[hsl(var(--warn))]/20 text-[hsl(var(--warn))]';
                                            const txt = cls === 'dentro' ? 'Dentro de la media' : cls === 'sin_datos' ? 'Sin datos de media' : cls === 'fuera_encima' ? 'Fuera de la media (más lento)' : 'Fuera de la media (más rápido)';
                                            return (
                                                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                                    <span className="text-muted-foreground">Tu media (7d): {mitj ? <span className="font-semibold text-primary">{fmtSeg(mitj.mitjana)}</span> : <span className="italic">Sin datos</span>}</span>
                                                    <span className={`rounded px-2 py-0.5 font-semibold ${badge}`}>{txt}</span>
                                                </div>
                                            );
                                        })()}

                                        {op.fase && op.operariId && (() => {
                                            const mitj = mitjanaOperariFaseMarca(enrichedRecent, op.operariId, op.fase, op.marca);
                                            return <MediaTimeline sec={op.sec} mediaSec={mitj ? mitj.mitjana : 0} pausat={op.pausat} />;
                                        })()}

                                        {op.pausat && op.motiuInactivitat && (
                                            <div className="mt-2 flex items-center gap-1.5 rounded-md bg-[hsl(var(--warn))]/15 px-2.5 py-1.5 text-xs font-semibold text-[hsl(var(--warn))]">
                                                <AlertTriangle className="h-3.5 w-3.5" />
                                                Pausado por inactividad: {op.motiuInactivitat}
                                            </div>
                                        )}

                                        {op.pct !== null && (
                                            <div className="mt-2 space-y-1">
                                                <PulseBar pct={op.pct} color={over ? 'bg-destructive' : op.pausat ? 'bg-[hsl(var(--warn))]' : 'bg-[hsl(var(--ok))]'} />
                                                <p className="text-xs text-muted-foreground text-right">{op.pct}% completado</p>
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                            {operarisFallback.map((op) => (
                                <a
                                    key={`fb-${op.id}`}
                                    href={op.exclusivaId ? `/exclusiva/${op.exclusivaId}` : '#'}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full text-left px-5 py-4 transition-colors hover:bg-secondary/30 flex flex-wrap items-start justify-between gap-3"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold uppercase bg-[hsl(var(--ok))]/20 text-[hsl(var(--ok))]">
                                            {op.operariNom.substring(0, 2)}
                                            <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-[hsl(var(--ok))] border-2 border-card" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-base">{op.operariNom}
                                                <span className="ml-2 text-xs rounded bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))] px-2 py-0.5 font-normal">En curso</span>
                                                <span className="ml-1 text-xs rounded bg-secondary text-muted-foreground px-2 py-0.5 font-normal">Sin registro de tiempo</span>
                                                {op.monoEnRetreball && <span className="ml-1 text-xs rounded bg-destructive/10 text-destructive px-2 py-0.5 font-normal">Mono en retrabajo</span>}
                                            </p>
                                            <p className="text-xs text-muted-foreground">{op.operacioNom || 'Operación en curso'}</p>
                                            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                                <span>Exclusiva: <span className="font-semibold text-foreground">{op.exclusivaNom}</span></span>
                                                <span>Mono: <span className="font-semibold text-foreground font-mono">{op.monoCodi}</span></span>
                                                {op.fase && <span>Fase: <span className="font-semibold text-foreground">{op.fase}</span></span>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-display text-3xl tabular-nums text-muted-foreground">—</p>
                                        <p className="text-xs text-muted-foreground">Tiempo no disponible</p>
                                    </div>
                                </a>
                            ))}
                            {operarisQualitat.map((op) => (
                                <a
                                    key={`qc-${op.id}`}
                                    href={op.exclusivaId ? `/exclusiva/${op.exclusivaId}` : '#'}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full text-left px-5 py-4 transition-colors hover:bg-blue-50 flex flex-wrap items-start justify-between gap-3"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold uppercase ${op.enRetrabajo ? 'bg-[hsl(var(--warn))]/20 text-[hsl(var(--warn))]' : 'bg-blue-100 text-blue-700'}`}>
                                            {op.operariNom.substring(0, 2)}
                                            <span className={`absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${op.enRetrabajo ? 'bg-[hsl(var(--warn))]' : 'bg-blue-600'}`} />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-base">{op.operariNom}
                                                <span className="ml-2 text-xs rounded bg-blue-100 text-blue-700 px-2 py-0.5 font-normal">Calidad</span>
                                                {op.enRetrabajo
                                                    ? <span className="ml-1 text-xs rounded bg-[hsl(var(--warn))]/20 text-[hsl(var(--warn))] px-2 py-0.5 font-normal">En retrabajo</span>
                                                    : <span className="ml-1 text-xs rounded bg-blue-50 text-blue-600 px-2 py-0.5 font-normal">En control</span>}
                                            </p>
                                            <p className="text-xs text-muted-foreground">Control de calidad</p>
                                            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                                <span>Exclusiva: <span className="font-semibold text-foreground">{op.exclusivaNom}</span></span>
                                                <span>Mono: <span className="font-semibold text-foreground font-mono">{op.monoCodi}</span></span>
                                                {op.referencia && <span>Ref: <span className="font-semibold text-foreground">{op.referencia}</span></span>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className={`font-display text-3xl tabular-nums ${op.enRetrabajo ? 'text-[hsl(var(--warn))]' : 'text-blue-700'}`}>{fmtSeg(op.sec)}</p>
                                        <p className="text-xs text-muted-foreground">{op.enRetrabajo ? 'Tiempo congelado' : 'Tiempo de inspección'}</p>
                                    </div>
                                </a>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── Right column ─────────────────────────────────────── */}
                <div className="space-y-6">

                    {/* Fases */}
                    <div className="rounded-xl border border-border bg-card overflow-hidden">
                        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
                            <TrendingUp className="h-5 w-5 text-primary" />
                            <h3 className="font-display text-2xl uppercase">Fases en curso</h3>
                        </div>
                        <div className="divide-y divide-border">
                            {faseData.map((f) => (
                                <div key={f.fase} className="px-5 py-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="font-display text-xl uppercase">{f.fase}</p>
                                        <div className="flex gap-3 text-sm">
                                            <span className={`tabular-nums font-bold text-2xl ${f.operarisActius > 0 ? 'text-[hsl(var(--ok))]' : 'text-muted-foreground'}`}>
                                                {f.operarisActius}
                                            </span>
                                            <span className="text-muted-foreground self-end text-xs">operarios</span>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                                        <span>Monos activos: <span className="font-semibold text-foreground">{f.monosEnFase}</span></span>
                                        <span>Exclusivas: <span className="font-semibold text-foreground">{f.exclusivesCount}</span></span>
                                    </div>
                                    {f.tempsTotalSec > 0 && (
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            Tiempo productivo: <span className="font-semibold tabular-nums text-foreground">{fmtSeg(f.tempsTotalSec)}</span>
                                        </p>
                                    )}
                                    <div className="mt-2">
                                        <PulseBar
                                            pct={f.monosEnFase > 0 ? 100 : 0}
                                            color={f.operarisActius > 2 ? 'bg-destructive' : f.operarisActius > 0 ? 'bg-[hsl(var(--ok))]' : 'bg-secondary'}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Eficiencia media */}
                    <div className="rounded-xl border border-border bg-card px-5 py-4">
                        <div className="flex items-center gap-3 mb-3">
                            <Zap className="h-5 w-5 text-[hsl(var(--warn))]" />
                            <h3 className="font-display text-xl uppercase">Eficiencia media</h3>
                        </div>
                        {operarisActius.filter((o) => o.std > 0).length === 0 ? (
                            <p className="text-sm text-muted-foreground">Sin datos suficientes.</p>
                        ) : (() => {
                            const withStd = operarisActius.filter((o) => o.std > 0 && !o.pausat);
                            const efPct = withStd.length > 0
                                ? Math.round(withStd.reduce((a, o) => a + (o.pct || 0), 0) / withStd.length)
                                : null;
                            return efPct !== null ? (
                                <div>
                                    <p className={`font-display text-5xl tabular-nums ${efPct > 100 ? 'text-destructive' : 'text-[hsl(var(--ok))]'}`}>
                                        {efPct}%
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">Media progreso operaciones activas</p>
                                    <PulseBar pct={efPct} color={efPct > 100 ? 'bg-destructive' : 'bg-[hsl(var(--ok))]'} />
                                </div>
                            ) : <p className="text-sm text-muted-foreground">Sin operaciones con tiempo estándar.</p>;
                        })()}
                    </div>
                </div>
            </div>

            {/* ── Medias por marca (últimos 7 días) ─────────────────── */}
            <div className="rounded-xl border-2 border-primary/30 bg-card overflow-hidden">
                <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-primary/30">
                    <Tag className="h-5 w-5 text-primary" />
                    <h3 className="font-display text-2xl uppercase text-primary">Medias por marca (últimos 7 días)</h3>
                    <span className="ml-auto text-xs text-muted-foreground hidden sm:block">Media semanal rodante · tiempo productivo sin pausas · excluye &gt;8h</span>
                </div>
                <div className="px-5 py-3 bg-primary/5 text-xs text-primary">
                    Resumen del informe de medias por marca: media de tiempo productivo por marca y fase, sumatorio total, media total, registros utilizados e incidencias medias por exclusiva. Calculado sobre los registros válidos de los últimos 7 días (excluyendo registros &gt;8h y pausas).
                </div>
                {mitjanesMarcaFinal.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-3">
                        <Tag className="h-8 w-8 opacity-30" />
                        <p className="text-sm">Sin datos suficientes para las medias de los últimos 7 días.</p>
                    </div>
                ) : (
                    <div className="overflow-auto">
                        <table className="w-full min-w-[820px] text-sm">
                            <thead className="bg-secondary text-left text-xs uppercase">
                                <tr>
                                    <th className="px-4 py-3 font-semibold sticky left-0 bg-secondary">Marca</th>
                                    {marquesFasesLive.map((f) => (
                                        <th key={f} className="px-4 py-3 font-semibold text-right">
                                            <span className="inline-flex items-center gap-1.5 justify-end">
                                                <span className="h-2.5 w-2.5 rounded-full" style={{ background: FASE_COLORS_LIVE[f] || '#94a3b8' }} />
                                                {f}
                                            </span>
                                        </th>
                                    ))}
                                    <th className="px-4 py-3 font-semibold text-right">Sumatorio total</th>
                                    <th className="px-4 py-3 font-semibold text-right">Media total</th>
                                    <th className="px-4 py-3 font-semibold text-right">Registros</th>
                                    <th className="px-4 py-3 font-semibold text-right">Incidencias medias</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {mitjanesMarcaFinal.map((m) => {
                                    const byFase = new Map(m.fases.map((f) => [f.fase, f]));
                                    return (
                                        <tr key={m.marca} className={`hover:bg-secondary/30 ${m.marca === 'Sin marca' ? 'bg-[hsl(var(--warn))]/5' : ''}`}>
                                            <td className="px-4 py-3 font-semibold sticky left-0 bg-card">
                                                {m.marca === 'Sin marca' ? <span className="text-[hsl(var(--warn))]">Sin marca</span> : m.marca}
                                            </td>
                                            {marquesFasesLive.map((f) => {
                                                const fd = byFase.get(f);
                                                return (
                                                    <td key={f} className="px-4 py-3 text-right tabular-nums text-primary">
                                                        {fd ? fmtSeg(fd.mitjana) : <span className="text-muted-foreground/40">—</span>}
                                                    </td>
                                                );
                                            })}
                                            <td className="px-4 py-3 text-right tabular-nums font-semibold text-[hsl(var(--ok))]">{fmtSeg(m.productiuTotal)}</td>
                                            <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{fmtSeg(m.mitjanaTotal)}</td>
                                            <td className="px-4 py-3 text-right tabular-nums">{m.nTotal}</td>
                                            <td className="px-4 py-3 text-right tabular-nums text-destructive">{m.mitjanaIncidencies}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ── Operarios pausados (tiempo congelado, no cuenta como activo) ── */}
            <div className="rounded-xl border border-[hsl(var(--warn))]/30 bg-[hsl(var(--warn))]/5 overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-[hsl(var(--warn))]/30">
                    <Pause className="h-5 w-5 text-[hsl(var(--warn))]" />
                    <h3 className="font-display text-2xl uppercase text-[hsl(var(--warn))]">Pausados ({operarisPausats.length})</h3>
                    <span className="ml-auto text-xs text-muted-foreground hidden sm:block">Tiempo congelado · no acumula · haz clic para ver el detalle</span>
                </div>

                {operarisPausats.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-3">
                        <Pause className="h-8 w-8 opacity-30" />
                        <p className="text-sm">Ningún operario pausado.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-[hsl(var(--warn))]/20">
                        {operarisPausats.map((op) => (
                            <button
                                key={op.id}
                                type="button"
                                onClick={() => setSelectedRegId(op.id)}
                                className={`w-full text-left px-5 py-4 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--warn))] hover:bg-[hsl(var(--warn))]/10 ${selectedRegId === op.id ? 'ring-2 ring-inset ring-[hsl(var(--warn))]' : ''}`}
                            >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold uppercase bg-[hsl(var(--warn))]/20 text-[hsl(var(--warn))]">
                                            {op.operariNom.substring(0, 2)}
                                            <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-[hsl(var(--warn))] border-2 border-card" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-base">{op.operariNom}
                                                <span className="ml-2 text-xs rounded bg-[hsl(var(--warn))]/20 text-[hsl(var(--warn))] px-2 py-0.5 font-normal">Pausado</span>
                                                {op.tipus === 'lliure' && <span className="ml-2 text-xs rounded bg-[hsl(var(--accent))]/15 text-[hsl(var(--accent))] px-2 py-0.5 font-normal">Libre</span>}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {op.operacioCodi && op.tipus !== 'lliure' && <span className="font-mono mr-1">{op.operacioCodi}</span>}
                                                {op.tipus === 'lliure' ? 'Trabajo libre' : op.operacioNom}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-display text-3xl tabular-nums text-[hsl(var(--warn))]">{fmtSeg(op.sec)}</p>
                                        {op.std > 0 && (
                                            <p className="text-xs text-muted-foreground">de {fmtSeg(op.std)} est.</p>
                                        )}
                                    </div>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                    <span>Exclusiva: <span className="font-semibold text-foreground">{op.exclusivaNom}</span></span>
                                    <span>Mono: <span className="font-semibold text-foreground font-mono">{op.monoCodi}</span></span>
                                    {op.fase && <span>Fase: <span className="font-semibold text-foreground">{op.fase}</span></span>}
                                </div>
                                {op.motiuInactivitat && (
                                    <div className="mt-2 flex items-center gap-1.5 rounded-md bg-[hsl(var(--warn))]/15 px-2.5 py-1.5 text-xs font-semibold text-[hsl(var(--warn))]">
                                        <AlertTriangle className="h-3.5 w-3.5" />
                                        Pausado por inactividad: {op.motiuInactivitat}
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Calidad ───────────────────────────────────────────── */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
                    <Shield className="h-5 w-5 text-blue-600" />
                    <h3 className="font-display text-2xl uppercase">Calidad ({calidadExclusives.length})</h3>
                    <span className="ml-auto text-xs text-muted-foreground hidden sm:block">
                        Preparadas: {totalPreparadesCalitat} · En control: {calidadExclusives.filter((e) => e.enControl).length} · En retrabajo: {calidadExclusives.filter((e) => e.enRetrabajo).length}
                    </span>
                </div>

                {calidadExclusives.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
                        <Shield className="h-10 w-10 opacity-30" />
                        <p className="text-sm">No hay exclusivas en fase de calidad.</p>
                    </div>
                ) : (
                    <div className="overflow-auto">
                        <table className="w-full min-w-[720px] text-sm">
                            <thead className="bg-secondary text-left text-xs uppercase">
                                <tr>
                                    {['Exclusiva', 'Artículo', 'Monos', 'Estado', 'Fase calidad', ''].map((h) => (
                                        <th key={h} className="px-4 py-3 font-semibold">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {calidadExclusives.map((ex) => (
                                    <tr key={ex.id}>
                                        <td className="px-4 py-3 font-semibold">{ex.exclusiva}</td>
                                        <td className="px-4 py-3 text-muted-foreground">{ex.article || '—'}</td>
                                        <td className="px-4 py-3 tabular-nums">
                                            <span className="text-[hsl(var(--ok))] font-bold text-xl">{ex.fets}</span>
                                            <span className="text-muted-foreground text-sm"> / {ex.totalMonos}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="rounded px-2 py-1 text-xs font-semibold uppercase bg-secondary text-muted-foreground">{ex.estat || '—'}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            {ex.enRetrabajo ? (
                                                <span className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold uppercase bg-destructive/10 text-destructive"><Wrench className="h-3 w-3" /> En retrabajo</span>
                                            ) : ex.enControl ? (
                                                <span className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold uppercase bg-blue-100 text-blue-700"><Shield className="h-3 w-3" /> En control</span>
                                            ) : ex.allDone ? (
                                                <span className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold uppercase bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]"><CheckCircle className="h-3 w-3" /> Preparada para Calidad</span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold uppercase bg-[hsl(var(--accent))]/15 text-[hsl(var(--accent))]"><Clock className="h-3 w-3" /> Pendiente QC</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <a href={`/exclusiva/${ex.id}`} target="_blank" rel="noopener noreferrer" className="text-primary font-semibold text-xs inline-flex items-center gap-1">Detalle <ExternalLink className="h-3 w-3" /></a>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ── Exclusivas para hoy ───────────────────────────────────── */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
                    <Clock className="h-5 w-5 text-primary" />
                    <h3 className="font-display text-2xl uppercase">Exclusivas con entrega hoy ({exclusivesAvui.length})</h3>
                </div>

                {exclusivesAvui.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
                        <CheckCircle className="h-10 w-10 opacity-30" />
                        <p className="text-sm">No hay exclusivas con entrega para hoy.</p>
                    </div>
                ) : (
                    <div className="overflow-auto">
                        <table className="w-full min-w-[700px] text-sm">
                            <thead className="bg-secondary text-left text-xs uppercase">
                                <tr>
                                    {['Exclusiva', 'Artículo', 'Monos completados', 'Progreso', 'Estado'].map((h) => (
                                        <th key={h} className="px-4 py-3 font-semibold">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {exclusivesAvui.map((e) => (
                                    <tr key={e.id} className={e.retras ? 'bg-destructive/5' : e.pct === 100 ? 'bg-[hsl(var(--ok))]/5' : ''}>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                {e.retras && <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />}
                                                {e.pct === 100 && <CheckCircle className="h-4 w-4 text-[hsl(var(--ok))] shrink-0" />}
                                                <span className="font-semibold">{e.exclusiva}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">{e.article || '—'}</td>
                                        <td className="px-4 py-3 tabular-nums">
                                            <span className="text-[hsl(var(--ok))] font-bold text-xl">{e.fets}</span>
                                            <span className="text-muted-foreground text-sm"> / {e.totalMonos}</span>
                                        </td>
                                        <td className="px-4 py-3 w-48">
                                            <PulseBar pct={e.pct} color={e.pct === 100 ? 'bg-[hsl(var(--ok))]' : e.retras ? 'bg-destructive' : 'bg-[hsl(var(--accent))]'} />
                                            <span className="text-xs text-muted-foreground">{e.pct}%</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`rounded px-2 py-1 text-xs font-semibold uppercase ${
                                                e.pct === 100 ? 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]' :
                                                e.retras ? 'bg-destructive/10 text-destructive' :
                                                'bg-[hsl(var(--warn))]/20 text-[hsl(var(--warn))]'
                                            }`}>
                                                {e.pct === 100 ? 'Completada' : e.retras ? 'En riesgo' : 'En producción'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ── Unidades entregadas hoy ─────────────────────────────── */}
            <div className="rounded-xl border-2 border-primary/40 bg-primary/5 overflow-hidden">
                <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-primary/30">
                    <Truck className="h-5 w-5 text-primary" />
                    <h3 className="font-display text-2xl uppercase text-primary">Unidades entregadas hoy ({entregadesAvui.monosCount})</h3>
                    <span className="ml-auto text-xs text-muted-foreground hidden sm:block">
                        Total de monos entregados al cliente durante el día actual · no incluye exclusivas completas pero no entregadas
                    </span>
                </div>

                <div className="px-5 py-3 bg-primary/10 text-xs text-primary font-semibold flex items-center gap-2">
                    <Truck className="h-3.5 w-3.5" />
                    {entregadesAvui.monosCount} mono{entregadesAvui.monosCount === 1 ? '' : 's'} entregado{entregadesAvui.monosCount === 1 ? '' : 's'} hoy
                    {' · '}{entregadesAvui.exclusivesCount} exclusiva{entregadesAvui.exclusivesCount === 1 ? '' : 's'} marcada{entregadesAvui.exclusivesCount === 1 ? '' : 's'} como entregada{entregadesAvui.exclusivesCount === 1 ? '' : 's'} (estat = entregada, con fecha de entrega real de hoy).
                    {' '}Las exclusivas listas para recoger o finalizadas pero sin entregar no se cuentan aquí.
                </div>

                {entregadesAvui.list.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
                        <Truck className="h-10 w-10 opacity-30" />
                        <p className="text-sm">Aún no se ha entregado ninguna unidad hoy.</p>
                    </div>
                ) : (
                    <div className="overflow-auto">
                        <table className="w-full min-w-[640px] text-sm">
                            <thead className="bg-secondary/70 text-left text-xs uppercase">
                                <tr>
                                    {['Exclusiva', 'Artículo', 'Marca', 'Monos entregados', 'Entregada por', 'Hora de entrega'].map((h) => (
                                        <th key={h} className="px-4 py-3 font-semibold">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {entregadesAvui.list.map((ex) => {
                                    const exMonos = monos.filter((m) => m.exclusiva === ex.id).length;
                                    const who = ex.expand?.entregada_per?.name || ex.expand?.entregada_per?.codi || '—';
                                    const hora = ex.data_entrega_real
                                        ? new Date(ex.data_entrega_real).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
                                        : '—';
                                    return (
                                        <tr key={ex.id} className="hover:bg-secondary/30">
                                            <td className="px-4 py-3 font-semibold">{ex.exclusiva}</td>
                                            <td className="px-4 py-3 text-muted-foreground">{ex.article || '—'}</td>
                                            <td className="px-4 py-3 text-muted-foreground">{ex.marca || '—'}</td>
                                            <td className="px-4 py-3 tabular-nums">
                                                <span className="text-primary font-bold text-xl">{exMonos}</span>
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground">{who}</td>
                                            <td className="px-4 py-3 tabular-nums text-muted-foreground">{hora}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="bg-secondary/70 font-semibold">
                                <tr>
                                    <td className="px-4 py-3" colSpan={3}>Total entregado hoy</td>
                                    <td className="px-4 py-3 tabular-nums text-primary text-xl">{entregadesAvui.monosCount}</td>
                                    <td colSpan={2} />
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>

            {/* ── Historial de pausas ─────────────────────────────────── */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
                    <Pause className="h-5 w-5 text-[hsl(var(--warn))]" />
                    <h3 className="font-display text-2xl uppercase">Historial de pausas ({historialPausas.length})</h3>
                    <span className="ml-auto text-xs text-muted-foreground hidden sm:block">Inicio, reanudación, duración y causa</span>
                </div>

                {historialPausas.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
                        <Pause className="h-10 w-10 opacity-30" />
                        <p className="text-sm">No hay pausas registradas.</p>
                    </div>
                ) : (
                    <div className="overflow-auto">
                        <table className="w-full min-w-[760px] text-sm">
                            <thead className="bg-secondary text-left text-xs uppercase">
                                <tr>
                                    {['Operario', 'Exclusiva', 'Operación', 'Inicio', 'Reanudación', 'Duración', 'Causa'].map((h) => (
                                        <th key={h} className="px-4 py-3 font-semibold">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {historialPausas.map((p) => (
                                    <tr key={p.id} className={p.inactivitat ? 'bg-[hsl(var(--warn))]/5' : ''}>
                                        <td className="px-4 py-3 font-semibold">{p.expand?.operari?.name || p.expand?.operari?.codi || '—'}</td>
                                        <td className="px-4 py-3">{p.expand?.exclusiva?.exclusiva || '—'}</td>
                                        <td className="px-4 py-3 text-xs">{p.operacio || '—'}</td>
                                        <td className="px-4 py-3 text-xs tabular-nums">{fmtDateTime(p.inici)}</td>
                                        <td className="px-4 py-3 text-xs tabular-nums">{fmtDateTime(p.fi)}</td>
                                        <td className="px-4 py-3 tabular-nums font-semibold text-[hsl(var(--warn))]">{fmtSeg(p.durada_seg)}</td>
                                        <td className="px-4 py-3 text-xs">
                                            {p.causa ? (
                                                <span className={`rounded px-2 py-0.5 font-semibold ${p.inactivitat ? 'bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))]' : 'bg-secondary text-muted-foreground'}`}>{p.causa}</span>
                                            ) : <span className="text-muted-foreground">—</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Operario activity slide-over */}
            {selectedOp && (
                <OperariActivityPanel
                    selected={selectedOp}
                    siblings={siblings}
                    onSelectSibling={setSelectedRegId}
                    onClose={() => setSelectedRegId(null)}
                />
            )}
        </div>
    );
}

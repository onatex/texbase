import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import {
    Search, Filter, X, RefreshCcw, Wrench, Clock, AlertTriangle,
    Package, User, BarChart2, ExternalLink,
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
    PieChart, Pie,
} from 'recharts';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/lib/auth';

const ESTADO_LABEL = {
    pendiente: 'Pendiente',
    en_proceso: 'En progreso',
    completado: 'Completado',
    verificado: 'Verificado',
    aprobado: 'Aprobado',
    rechazado: 'Rechazado',
};
const ESTADO_BADGE = {
    pendiente: 'bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))]',
    en_proceso: 'bg-blue-100 text-blue-700',
    completado: 'bg-purple-100 text-purple-700',
    verificado: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]',
    aprobado: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]',
    rechazado: 'bg-destructive/15 text-destructive',
};
const PRIORIDAD_BADGE = {
    alta: 'bg-destructive/15 text-destructive',
    media: 'bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))]',
    baja: 'bg-secondary text-muted-foreground',
};

function fmtMin(s) {
    if (!s) return '0m';
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m`;
    return `${m}m`;
}
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('es-ES') : '—';

const COLORS = ['#1e3a5f', '#f97316', '#10b981', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function RetrabajosDashboard() {
    const { user } = useAuth();
    const [retrabajos, setRetrabajos] = useState([]);
    const [exclusives, setExclusives] = useState([]);
    const [operaris, setOperaris] = useState([]);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState('');
    const [qDebounced, setQDebounced] = useState('');
    const [fEstado, setFEstado] = useState('all');
    const [fArticulo, setFArticulo] = useState('all');
    const [fOperario, setFOperario] = useState('all');
    const [fFechaDesde, setFFechaDesde] = useState('');
    const [fFechaHasta, setFFechaHasta] = useState('');

    useEffect(() => {
        const t = setTimeout(() => setQDebounced(q.trim()), 250);
        return () => clearTimeout(t);
    }, [q]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [rt, ex, ops] = await Promise.all([
                pb.collection('retrabajos').getFullList({
                    sort: '-created',
                    expand: 'exclusiva,operario_asignado,creado_por,usuario_inicio,usuario_completado,usuario_aprobacion',
                    requestKey: 'retr-dash-list',
                }).catch(() => []),
                pb.collection('exclusives').getFullList({ fields: 'id,exclusiva,article,referencia', requestKey: 'retr-dash-ex' }).catch(() => []),
                pb.collection('users').getFullList({ requestKey: 'retr-dash-ops' }).catch(() => []),
            ]);
            setRetrabajos(rt);
            setExclusives(ex);
            setOperaris(ops);
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        void pb.collection('retrabajos').subscribe('*', () => load()).catch(() => {});
        return () => { void pb.collection('retrabajos').unsubscribe('*').catch(() => {}); };
    }, [load]);

    const exMap = useMemo(() => { const m = {}; exclusives.forEach(e => { m[e.id] = e; }); return m; }, [exclusives]);

    // Enrich retrabajos with article reference
    const enriched = useMemo(() => retrabajos.map(r => {
        const ex = exMap[r.exclusiva];
        return { ...r, _exclusivaNum: ex?.exclusiva || r.expand?.exclusiva?.exclusiva || '—', _articulo: ex?.article || ex?.referencia || r.expand?.exclusiva?.article || '—' };
    }), [retrabajos, exMap]);

    const articulos = useMemo(() => [...new Set(enriched.map(r => r._articulo).filter(a => a && a !== '—'))].sort(), [enriched]);

    const filtered = useMemo(() => {
        const t = qDebounced.toLowerCase();
        return enriched.filter(r => {
            if (fEstado !== 'all' && r.estado !== fEstado) return false;
            if (fArticulo !== 'all' && r._articulo !== fArticulo) return false;
            if (fOperario !== 'all' && r.operario_asignado !== fOperario) return false;
            if (fFechaDesde && r.created && new Date(r.created) < new Date(fFechaDesde)) return false;
            if (fFechaHasta && r.created && new Date(r.created) > new Date(fFechaHasta + 'T23:59:59')) return false;
            if (t) {
                const hay = `${r._exclusivaNum} ${r._articulo} ${r.operacion_original || ''} ${r.motivo_rechazo || ''}`.toLowerCase();
                if (!hay.includes(t)) return false;
            }
            return true;
        });
    }, [enriched, qDebounced, fEstado, fArticulo, fOperario, fFechaDesde, fFechaHasta]);

    // Stats
    const totalRetrabajos = filtered.length;
    const tiempoTotalSeg = filtered.reduce((a, r) => a + Number(r.tiempo_real_seg || r.tiempo_retrabajo_seg || 0), 0);
    const tiempoEstimadoTotal = filtered.reduce((a, r) => a + Number(r.temps_estimat_min || 0), 0);
    const tiempoEstimadoSeg = tiempoEstimadoTotal * 60;
    const diffSeg = tiempoTotalSeg - tiempoEstimadoSeg;

    const porEstado = useMemo(() => {
        const counts = { pendiente: 0, en_proceso: 0, completado: 0, aprobado: 0, rechazado: 0, verificado: 0 };
        filtered.forEach(r => { if (counts[r.estado] != null) counts[r.estado]++; });
        return [
            { name: 'Pendiente', value: counts.pendiente, fill: '#f59e0b' },
            { name: 'En progreso', value: counts.en_proceso, fill: '#3b82f6' },
            { name: 'Completado', value: counts.completado, fill: '#8b5cf6' },
            { name: 'Aprobado', value: counts.aprobado, fill: '#10b981' },
            { name: 'Rechazado', value: counts.rechazado, fill: '#ef4444' },
        ].filter(e => e.value > 0);
    }, [filtered]);

    // By article
    const porArticulo = useMemo(() => {
        const m = new Map();
        filtered.forEach(r => {
            const k = r._articulo || '—';
            const e = m.get(k) || { articulo: k, count: 0, tiempo: 0 };
            e.count++; e.tiempo += Number(r.tiempo_real_seg || r.tiempo_retrabajo_seg || 0);
            m.set(k, e);
        });
        return Array.from(m.values()).sort((a, b) => b.count - a.count);
    }, [filtered]);

    // By operario
    const porOperario = useMemo(() => {
        const m = new Map();
        filtered.forEach(r => {
            const id = r.operario_asignado || 'none';
            const nom = r.expand?.operario_asignado?.name || r.expand?.operario_asignado?.codi || 'Sin asignar';
            const e = m.get(id) || { id, nom, count: 0, tiempo: 0 };
            e.count++; e.tiempo += Number(r.tiempo_real_seg || r.tiempo_retrabajo_seg || 0);
            m.set(id, e);
        });
        return Array.from(m.values()).sort((a, b) => b.count - a.count);
    }, [filtered]);

    // By tipo incidencia (punt_checklist)
    const porTipo = useMemo(() => {
        const m = new Map();
        filtered.forEach(r => {
            const k = r.punt_checklist || r.operacion_original || 'Otros';
            const e = m.get(k) || { tipo: k, count: 0, tiempo: 0 };
            e.count++; e.tiempo += Number(r.tiempo_real_seg || r.tiempo_retrabajo_seg || 0);
            m.set(k, e);
        });
        return Array.from(m.values()).sort((a, b) => b.count - a.count).slice(0, 8);
    }, [filtered]);

    // Retrabajo vs producción time (from tiempos_exclusiva)
    const [tiemposData, setTiemposData] = useState({ retrabajo: 0, produccion: 0, calidad: 0 });
    useEffect(() => {
        pb.collection('tiempos_exclusiva').getFullList({ requestKey: 'retr-tiempos' })
            .then((all) => {
                const r = all.filter(t => t.tipo === 'retrabajo').reduce((a, t) => a + Number(t.tiempo_segundos || (Number(t.tiempo_minutos) || 0) * 60), 0);
                const p = all.filter(t => t.tipo === 'operacion').reduce((a, t) => a + Number(t.tiempo_segundos || (Number(t.tiempo_minutos) || 0) * 60), 0);
                const c = all.filter(t => t.tipo === 'calidad').reduce((a, t) => a + Number(t.tiempo_segundos || (Number(t.tiempo_minutos) || 0) * 60), 0);
                setTiemposData({ retrabajo: r, produccion: p, calidad: c });
            }).catch(() => {});
    }, [retrabajos]);

    const comparativaChart = [
        { name: 'Producción', segundos: tiemposData.produccion, fill: '#1e3a5f' },
        { name: 'Calidad', segundos: tiemposData.calidad, fill: '#f59e0b' },
        { name: 'Retrabajo', segundos: tiemposData.retrabajo, fill: '#ef4444' },
    ];

    const hayFiltros = q || fEstado !== 'all' || fArticulo !== 'all' || fOperario !== 'all' || fFechaDesde || fFechaHasta;
    const limpiar = () => { setQ(''); setFEstado('all'); setFArticulo('all'); setFOperario('all'); setFFechaDesde(''); setFFechaHasta(''); };

    return (
        <div className="space-y-5">
            <Helmet>
                <title>Retrabajos | Control de producción</title>
                <meta name="description" content="Dashboard de retrabajos: totales, tiempos, por artículo, por operario y comparativa con tiempo de producción." />
            </Helmet>

            <div className="flex items-center gap-2">
                <Wrench className="h-6 w-6 text-destructive" />
                <h2 className="font-display text-2xl sm:text-3xl uppercase">Retrabajos</h2>
            </div>

            {/* KPI band */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <KpiBox label="Total" value={totalRetrabajos} icon={Wrench} color="red" />
                <KpiBox label="Pendientes" value={porEstado.reduce((a, e) => a + (e.name === 'Pendiente' ? e.value : 0), 0)} icon={Clock} color="warn" />
                <KpiBox label="En progreso" value={porEstado.reduce((a, e) => a + (e.name === 'En progreso' ? e.value : 0), 0)} icon={RefreshCcw} color="blue" />
                <KpiBox label="Completados" value={porEstado.reduce((a, e) => a + (e.name === 'Completado' ? e.value : 0), 0)} icon={Package} color="purple" />
                <KpiBox label="Aprobados" value={porEstado.reduce((a, e) => a + (e.name === 'Aprobado' ? e.value : 0), 0)} icon={BarChart2} color="green" />
                <KpiBox label="Rechazados" value={porEstado.reduce((a, e) => a + (e.name === 'Rechazado' ? e.value : 0), 0)} icon={AlertTriangle} color="red" />
            </div>

            {/* Tiempo estimado vs real */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <KpiBox label="Tiempo estimado" value={fmtMin(tiempoEstimadoSeg)} icon={Clock} color="blue" />
                <KpiBox label="Tiempo real" value={fmtMin(tiempoTotalSeg)} icon={Clock} color="warn" />
                <KpiBox label="Diferencia" value={`${diffSeg >= 0 ? '+' : ''}${fmtMin(Math.abs(diffSeg))}`} icon={AlertTriangle} color={diffSeg > 0 ? 'red' : 'green'} />
            </div>

            {/* Charts row */}
            <div className="grid lg:grid-cols-2 gap-4">
                {/* Estado de retrabajos */}
                <div className="rounded-xl border border-border bg-card p-5">
                    <h3 className="font-display text-lg uppercase mb-4">Estado de retrabajos</h3>
                    {porEstado.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-12">Sin datos.</p>
                    ) : (
                        <ResponsiveContainer width="100%" height={240}>
                            <PieChart>
                                <Pie data={porEstado} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(e) => `${e.name}: ${e.value}`}>
                                    {porEstado.map((e, i) => <Cell key={i} fill={e.fill} />)}
                                </Pie>
                                <Tooltip />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* Retrabajo vs producción */}
                <div className="rounded-xl border border-border bg-card p-5">
                    <h3 className="font-display text-lg uppercase mb-4">Tiempo retrabajo vs producción</h3>
                    <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={comparativaChart}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmtMin(v)} />
                            <Tooltip formatter={v => fmtMin(v)} />
                            <Bar dataKey="segundos" name="Tiempo" radius={[4, 4, 0, 0]}>
                                {comparativaChart.map((e, i) => <Cell key={i} fill={e.fill} />)}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* By article + by operario */}
            <div className="grid lg:grid-cols-2 gap-4">
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="px-4 py-3 border-b border-border"><h3 className="font-display text-lg uppercase flex items-center gap-2"><Package className="h-4 w-4" /> Por artículo</h3></div>
                    {porArticulo.length === 0 ? <p className="p-6 text-sm text-muted-foreground text-center">Sin datos.</p> : (
                        <div className="overflow-auto max-h-64">
                            <table className="w-full text-sm">
                                <thead className="bg-secondary text-left text-xs uppercase sticky top-0"><tr><th className="px-3 py-2 font-semibold">Artículo</th><th className="px-3 py-2 font-semibold text-right">Retrabajos</th><th className="px-3 py-2 font-semibold text-right">Tiempo</th></tr></thead>
                                <tbody className="divide-y divide-border">
                                    {porArticulo.map(a => <tr key={a.articulo}><td className="px-3 py-2 font-medium">{a.articulo}</td><td className="px-3 py-2 text-right tabular-nums">{a.count}</td><td className="px-3 py-2 text-right tabular-nums">{fmtMin(a.tiempo)}</td></tr>)}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="px-4 py-3 border-b border-border"><h3 className="font-display text-lg uppercase flex items-center gap-2"><User className="h-4 w-4" /> Por operario</h3></div>
                    {porOperario.length === 0 ? <p className="p-6 text-sm text-muted-foreground text-center">Sin datos.</p> : (
                        <div className="overflow-auto max-h-64">
                            <table className="w-full text-sm">
                                <thead className="bg-secondary text-left text-xs uppercase sticky top-0"><tr><th className="px-3 py-2 font-semibold">Operario</th><th className="px-3 py-2 font-semibold text-right">Retrabajos</th><th className="px-3 py-2 font-semibold text-right">Tiempo</th></tr></thead>
                                <tbody className="divide-y divide-border">
                                    {porOperario.map(o => <tr key={o.id}><td className="px-3 py-2 font-medium">{o.nom}</td><td className="px-3 py-2 text-right tabular-nums">{o.count}</td><td className="px-3 py-2 text-right tabular-nums">{fmtMin(o.tiempo)}</td></tr>)}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Filters */}
            <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-[200px] max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar exclusiva, referencia, descripción..."
                            className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm" />
                    </div>
                    <select value={fEstado} onChange={e => setFEstado(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
                        <option value="all">Todos estados</option>
                        {Object.entries(ESTADO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <select value={fArticulo} onChange={e => setFArticulo(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
                        <option value="all">Todos artículos</option>
                        {articulos.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                    <select value={fOperario} onChange={e => setFOperario(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
                        <option value="all">Todos operarios</option>
                        {operaris.map(op => <option key={op.id} value={op.id}>{op.name || op.codi}</option>)}
                    </select>
                    <input type="date" value={fFechaDesde} onChange={e => setFFechaDesde(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm" title="Desde" />
                    <input type="date" value={fFechaHasta} onChange={e => setFFechaHasta(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm" title="Hasta" />
                    {hayFiltros && <button onClick={limpiar} className="flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-secondary"><X className="h-4 w-4" /> Limpiar</button>}
                    <button onClick={load} className="ml-auto flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-secondary"><RefreshCcw className="h-4 w-4" /> Actualizar</button>
                </div>
            </div>

            {/* Table */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
                {loading ? (
                    <div className="p-10 text-center text-muted-foreground">Cargando...</div>
                ) : filtered.length === 0 ? (
                    <div className="p-10 text-center text-muted-foreground">
                        <Wrench className="mx-auto h-10 w-10 text-muted-foreground/30 mb-3" />
                        {hayFiltros ? 'Sin resultados con los filtros aplicados.' : 'No hay retrabajos registrados.'}
                    </div>
                ) : (
                    <div className="overflow-auto">
                        <table className="w-full min-w-[1000px] text-sm">
                            <thead className="bg-secondary text-left text-xs uppercase">
                                <tr>{['Exclusiva', 'Ud.', 'Referencia', 'Descripción', 'Fase', 'T. estimado', 'T. real', 'Prioridad', 'Estado', 'Fecha', ''].map(h => <th key={h} className="px-3 py-2.5 font-semibold">{h}</th>)}</tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {filtered.map(r => (
                                    <tr key={r.id} className="hover:bg-secondary/30">
                                        <td className="px-3 py-3 font-mono font-semibold">{r._exclusivaNum}</td>
                                        <td className="px-3 py-3 tabular-nums font-semibold">{r.unidad_numero || '—'}</td>
                                        <td className="px-3 py-3 text-xs">{r._articulo}</td>
                                        <td className="px-3 py-3 max-w-xs truncate" title={r.motivo_rechazo || r.operacion_original}>{r.motivo_rechazo || r.operacion_original || '—'}</td>
                                        <td className="px-3 py-3 text-xs">{r.fase_retrabajo || r.fase || '—'}</td>
                                        <td className="px-3 py-3 tabular-nums text-xs">{r.temps_estimat_min ? `${r.temps_estimat_min}m` : '—'}</td>
                                        <td className="px-3 py-3 tabular-nums text-xs">{(r.tiempo_real_seg || r.tiempo_retrabajo_seg) ? fmtMin(r.tiempo_real_seg || r.tiempo_retrabajo_seg) : <span className="text-muted-foreground">—</span>}</td>
                                        <td className="px-3 py-3"><span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${PRIORIDAD_BADGE[r.prioridad] || 'bg-secondary'}`}>{r.prioridad || '—'}</span></td>
                                        <td className="px-3 py-3"><span className={`rounded px-2 py-0.5 text-xs font-semibold ${ESTADO_BADGE[r.estado] || 'bg-secondary'}`}>{ESTADO_LABEL[r.estado] || r.estado}</span></td>
                                        <td className="px-3 py-3 text-xs tabular-nums">{fmtDate(r.created)}</td>
                                        <td className="px-3 py-3">
                                            {r.exclusiva && <a href={`/exclusiva/${r.exclusiva}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded border border-border px-2 h-8 text-xs font-semibold hover:bg-secondary"><ExternalLink className="h-3.5 w-3.5" /> Ver</a>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

function KpiBox({ label, value, icon: Icon, color }) {
    const cls = {
        primary: 'text-primary',
        warn: 'text-[hsl(var(--warn))]',
        blue: 'text-blue-600',
        red: 'text-destructive',
        purple: 'text-purple-600',
        green: 'text-[hsl(var(--ok))]',
    }[color] || 'text-foreground';
    return (
        <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                <Icon className={`h-5 w-5 ${cls}`} />
            </div>
            <p className="font-display text-3xl mt-2 tabular-nums">{value}</p>
        </div>
    );
}

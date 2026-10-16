import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { RefreshCcw, CheckCircle2, AlertTriangle, Wrench } from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/lib/auth';

const ESTAT_CLS = {
    pendiente: 'bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))]',
    en_proceso: 'bg-blue-100 text-blue-700',
    completado: 'bg-purple-100 text-purple-700',
    verificado: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]',
    rechazado: 'bg-destructive/15 text-destructive',
};

const ESTAT_LABEL = {
    pendiente: 'Pendiente',
    en_proceso: 'En proceso',
    completado: 'Completado (esperando QC)',
    verificado: 'Verificado',
    rechazado: 'Rechazado de nuevo',
};

function fmtSegons(s) {
    if (s == null) return '—';
    const m = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function RetrabajosPanel() {
    const { user } = useAuth();
    const [retrabajos, setRetrabajos] = useState([]);
    const [operaris, setOperaris] = useState([]);
    const [qcSessions, setQcSessions] = useState([]);
    const [carregant, setCarregant] = useState(true);
    const [filtreEstat, setFiltreEstat] = useState('tots');
    const [accioId, setAccioId] = useState(null);
    const [rechazoModal, setRechazoModal] = useState(null); // { retrabajo, operario, notas }

    const carrega = useCallback(async () => {
        setCarregant(true);
        try {
            const [rs, ops, qcs] = await Promise.all([
                pb.collection('retrabajos').getFullList({
                    sort: '-created',
                    expand: 'exclusiva,mono,operario_asignado,incidencia_calidad',
                    requestKey: 'retr-panel',
                }),
                pb.collection('users').getFullList({ filter: 'rol = "operari"', sort: 'name', requestKey: 'retr-panel-ops' }).catch(() => []),
                pb.collection('controles_qualitat').getFullList({
                    filter: 'estado_qc != ""',
                    sort: '-created',
                    expand: 'exclusiva,mono',
                    requestKey: 'retr-panel-qc',
                }).catch(() => []),
            ]);
            setRetrabajos(rs);
            setOperaris(ops);
            setQcSessions(qcs);
        } catch (e) { console.error(e); }
        finally { setCarregant(false); }
    }, []);

    useEffect(() => { carrega(); }, [carrega]);

    const filtrats = useMemo(() =>
        filtreEstat === 'tots' ? retrabajos : retrabajos.filter(r => r.estado === filtreEstat),
        [retrabajos, filtreEstat]
    );

    /* ── Statistics ── */
    const stats = useMemo(() => {
        const total = retrabajos.length;
        const perOperari = {};
        const perExclusiva = {};
        const perOperacio = {};
        for (const r of retrabajos) {
            const opNom = r.expand?.operario_asignado?.name || r.expand?.operario_asignado?.codi || '—';
            if (!perOperari[opNom]) perOperari[opNom] = { nom: opNom, total: 0, rechazados: 0, verificados: 0 };
            perOperari[opNom].total++;
            if (r.estado === 'rechazado') perOperari[opNom].rechazados++;
            if (r.estado === 'verificado') perOperari[opNom].verificados++;

            const exNom = r.expand?.exclusiva?.exclusiva || '—';
            perExclusiva[exNom] = (perExclusiva[exNom] || 0) + 1;

            const opeNom = r.operacion_original || '—';
            if (!perOperacio[opeNom]) perOperacio[opeNom] = { nom: opeNom, total: 0, rechazados: 0 };
            perOperacio[opeNom].total++;
            if (r.estado === 'rechazado') perOperacio[opeNom].rechazados++;
        }
        const opStats = Object.values(perOperari)
            .map(o => ({ ...o, tasaRechazo: o.total ? Math.round((o.rechazados / o.total) * 100) : 0 }))
            .sort((a, b) => b.total - a.total);
        const exStats = Object.entries(perExclusiva)
            .map(([nom, count]) => ({ nom, count }))
            .sort((a, b) => b.count - a.count).slice(0, 12);
        const opeStats = Object.values(perOperacio)
            .map(o => ({ ...o, tasaRechazo: o.total ? Math.round((o.rechazados / o.total) * 100) : 0 }))
            .sort((a, b) => b.total - a.total).slice(0, 12);

        // Per punto de checklist
        const perPunt = {};
        for (const r of retrabajos) {
            const p = r.punt_checklist || '—';
            if (!perPunt[p]) perPunt[p] = { punt: p, total: 0, rechazados: 0, verificados: 0 };
            perPunt[p].total++;
            if (r.estado === 'rechazado') perPunt[p].rechazados++;
            if (r.estado === 'verificado') perPunt[p].verificados++;
        }
        const puntStats = Object.values(perPunt)
            .map(p => ({ ...p, tasaRechazo: p.total ? Math.round((p.rechazados / p.total) * 100) : 0 }))
            .sort((a, b) => b.total - a.total);

        // Tiempo promedio de retrabajo — prefer tiempo_retrabajo_seg; fallback to created→fecha_completacion
        let tiempoPromedioMin = null;
        const tiempos = [];
        for (const r of retrabajos) {
            if (r.estado === 'completado' || r.estado === 'verificado') {
                if (r.tiempo_retrabajo_seg && r.tiempo_retrabajo_seg > 0) {
                    tiempos.push(r.tiempo_retrabajo_seg / 60);
                } else if (r.fecha_completacion && r.created) {
                    const mins = (new Date(r.fecha_completacion) - new Date(r.created)) / 60000;
                    if (mins >= 0 && mins < 10080) tiempos.push(mins);
                }
            }
        }
        if (tiempos.length > 0) {
            tiempoPromedioMin = Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length);
        }

        // ── Per-exclusiva time report (QC + retrabajo + total) ──
        const tiempoPorExclusiva = {};
        // aggregate rework time per exclusiva
        for (const r of retrabajos) {
            const exId = r.exclusiva || '';
            const exNom = r.expand?.exclusiva?.exclusiva || '—';
            if (!exId) continue;
            if (!tiempoPorExclusiva[exId]) tiempoPorExclusiva[exId] = { exNom, retrabajos: 0, tiempoRetrabajo: 0, tiempoQc: 0, estadoQc: '—' };
            tiempoPorExclusiva[exId].retrabajos += 1;
            tiempoPorExclusiva[exId].tiempoRetrabajo += (r.tiempo_retrabajo_seg || 0);
        }
        // aggregate QC time per exclusiva from controles_qualitat sessions
        for (const cq of qcSessions) {
            const exId = cq.exclusiva || '';
            if (!exId) continue;
            const exNom = cq.expand?.exclusiva?.exclusiva || '—';
            if (!tiempoPorExclusiva[exId]) tiempoPorExclusiva[exId] = { exNom, retrabajos: 0, tiempoRetrabajo: 0, tiempoQc: 0, estadoQc: '—' };
            tiempoPorExclusiva[exId].tiempoQc += (cq.tiempo_qc_total_seg || cq.temps_inspeccio_seg || 0);
            if (cq.estado_qc && cq.estado_qc !== 'completado') tiempoPorExclusiva[exId].estadoQc = cq.estado_qc;
            else if (cq.estado_qc === 'completado' && tiempoPorExclusiva[exId].estadoQc === '—') tiempoPorExclusiva[exId].estadoQc = 'completado';
        }
        const tiempoExStats = Object.values(tiempoPorExclusiva)
            .map(e => ({ ...e, tiempoTotal: e.tiempoQc + e.tiempoRetrabajo }))
            .sort((a, b) => b.tiempoTotal - a.tiempoTotal);

        return {
            total,
            pendientes: retrabajos.filter(r => r.estado === 'pendiente').length,
            enProceso: retrabajos.filter(r => r.estado === 'en_proceso').length,
            completados: retrabajos.filter(r => r.estado === 'completado').length,
            verificados: retrabajos.filter(r => r.estado === 'verificado').length,
            rechazados: retrabajos.filter(r => r.estado === 'rechazado').length,
            opStats, exStats, opeStats, puntStats, tiempoPromedioMin, tiemposCount: tiempos.length,
            tiempoExStats,
        };
    }, [retrabajos, qcSessions]);

    const acceptar = async (r) => {
        setAccioId(r.id);
        try {
            await pb.collection('retrabajos').update(r.id, { estado: 'verificado' });
            if (r.incidencia_calidad) {
                await pb.collection('no_conformitats').update(r.incidencia_calidad, { estat: 'tancada' }).catch(() => {});
            }
            await carrega();
        } finally { setAccioId(null); }
    };

    const rechazarDeNuevo = async () => {
        if (!rechazoModal) return;
        const { retrabajo: r, operario, notas } = rechazoModal;
        if (!operario) return;
        setAccioId(r.id);
        try {
            await pb.collection('retrabajos').update(r.id, { estado: 'rechazado' });
            await pb.collection('retrabajos').create({
                exclusiva: r.exclusiva,
                mono: r.mono || undefined,
                operacion_original: r.operacion_original,
                operacion_codi: r.operacion_codi || '',
                fase: r.fase || '',
                punt_checklist: r.punt_checklist || '',
                motivo_rechazo: notas || r.motivo_rechazo,
                operario_asignado: operario,
                estado: 'pendiente',
                incidencia_calidad: r.incidencia_calidad || undefined,
                numero_intento: (r.numero_intento || 1) + 1,
                temps_estimat_min: r.temps_estimat_min || 0,
                notas: notas || '',
                creado_por: user.id,
            }, { requestKey: `retr-again-${Date.now()}` });
            setRechazoModal(null);
            await carrega();
        } catch (e) { console.error(e); }
        finally { setAccioId(null); }
    };

    if (carregant) return <div className="h-40 animate-pulse rounded-xl bg-secondary" />;

    return (
        <section className="grid gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="font-display text-3xl uppercase leading-none">Retrabajos</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{stats.total} retrabajos registrados</p>
                </div>
                <div className="flex items-center gap-2">
                    <select value={filtreEstat} onChange={e => setFiltreEstat(e.target.value)}
                        className="h-10 rounded-lg border border-input bg-card px-3 text-sm">
                        <option value="tots">Todos los estados</option>
                        <option value="pendiente">Pendientes</option>
                        <option value="en_proceso">En proceso</option>
                        <option value="completado">Completados (esperando QC)</option>
                        <option value="verificado">Verificados</option>
                        <option value="rechazado">Rechazados de nuevo</option>
                    </select>
                    <button onClick={carrega} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-secondary active:scale-95">
                        <RefreshCcw className="h-4 w-4" /> Actualizar
                    </button>
                </div>
            </div>

            {/* KPI band */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                    ['Total', stats.total, 'border-border bg-card', ''],
                    ['Pendientes', stats.pendientes, 'border-[hsl(var(--warn))]/30 bg-[hsl(var(--warn))]/5', 'text-[hsl(var(--warn))]'],
                    ['En proceso', stats.enProceso, 'border-blue-200 bg-blue-50', 'text-blue-700'],
                    ['Esperando QC', stats.completados, 'border-purple-200 bg-purple-50', 'text-purple-700'],
                    ['Verificados', stats.verificados, 'border-[hsl(var(--ok))]/30 bg-[hsl(var(--ok))]/5', 'text-[hsl(var(--ok))]'],
                    ['Re-rechazados', stats.rechazados, 'border-destructive/30 bg-destructive/5', 'text-destructive'],
                ].map(([label, val, brd, cls]) => (
                    <div key={label} className={`rounded-xl border p-4 text-center ${brd}`}>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                        <p className={`font-display text-4xl mt-1 ${cls}`}>{val}</p>
                    </div>
                ))}
            </div>

            {/* Table */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="p-4 border-b border-border">
                    <p className="font-semibold">Listado de retrabajos ({filtrats.length})</p>
                </div>
                {filtrats.length === 0 ? (
                    <p className="p-8 text-center text-sm text-muted-foreground">Sin retrabajos con este filtro.</p>
                ) : (
                    <div className="overflow-auto">
                        <table className="w-full min-w-[1000px] text-sm">
                            <thead className="bg-secondary text-left text-xs uppercase">
                                <tr>
                                    {['Fecha', 'Exclusiva', 'Mono', 'Operación', 'Fase', 'Punto', 'Operario', 'Intento', 'Estado', 'Motivo', 'Acciones'].map(h => (
                                        <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {filtrats.map(r => (
                                    <tr key={r.id} className="hover:bg-secondary/20">
                                        <td className="px-3 py-2 whitespace-nowrap">{r.created ? new Date(r.created).toLocaleDateString('es-ES') : '—'}</td>
                                        <td className="px-3 py-2 font-semibold">{r.expand?.exclusiva?.exclusiva || '—'}</td>
                                        <td className="px-3 py-2">{r.expand?.mono?.codi || '—'}</td>
                                        <td className="px-3 py-2">{r.operacion_original || '—'}</td>
                                        <td className="px-3 py-2 text-xs">{r.fase || '—'}</td>
                                        <td className="px-3 py-2 text-xs">{r.punt_checklist || '—'}</td>
                                        <td className="px-3 py-2">{r.expand?.operario_asignado?.name || r.expand?.operario_asignado?.codi || '—'}</td>
                                        <td className="px-3 py-2 font-bold tabular-nums">#{r.numero_intento || 1}</td>
                                        <td className="px-3 py-2">
                                            <span className={`rounded px-2 py-0.5 text-xs font-semibold ${ESTAT_CLS[r.estado] || 'bg-secondary'}`}>
                                                {ESTAT_LABEL[r.estado] || r.estado}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 max-w-[220px] truncate text-muted-foreground" title={r.motivo_rechazo}>{r.motivo_rechazo || '—'}</td>
                                        <td className="px-3 py-2">
                                            {r.estado === 'completado' ? (
                                                <div className="flex gap-1.5">
                                                    <button onClick={() => acceptar(r)} disabled={accioId === r.id}
                                                        className="flex items-center gap-1 rounded-lg bg-[hsl(var(--ok))] px-2.5 py-1.5 text-xs font-bold text-white active:scale-95 disabled:opacity-60">
                                                        <CheckCircle2 className="h-3.5 w-3.5" /> Aceptar
                                                    </button>
                                                    <button onClick={() => setRechazoModal({ retrabajo: r, operario: r.operario_asignado, notas: '' })} disabled={accioId === r.id}
                                                        className="flex items-center gap-1 rounded-lg bg-destructive px-2.5 py-1.5 text-xs font-bold text-white active:scale-95 disabled:opacity-60">
                                                        <AlertTriangle className="h-3.5 w-3.5" /> Rechazar
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">—</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Stats: per operario */}
            {stats.opStats.length > 0 && (
                <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-xl border border-border bg-card overflow-hidden">
                        <div className="p-4 border-b border-border"><p className="font-semibold">Retrabajos por operario · tasa de rechazo</p></div>
                        <table className="w-full text-sm">
                            <thead className="bg-secondary text-left text-xs uppercase">
                                <tr>{['Operario', 'Retrabajos', 'Verificados', 'Re-rechazados', 'Tasa rechazo'].map(h => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {stats.opStats.map(o => (
                                    <tr key={o.nom}>
                                        <td className="px-3 py-2 font-semibold">{o.nom}</td>
                                        <td className="px-3 py-2 tabular-nums">{o.total}</td>
                                        <td className="px-3 py-2 tabular-nums text-[hsl(var(--ok))]">{o.verificados}</td>
                                        <td className="px-3 py-2 tabular-nums text-destructive">{o.rechazados}</td>
                                        <td className="px-3 py-2">
                                            <span className={`font-semibold ${o.tasaRechazo > 25 ? 'text-destructive' : o.tasaRechazo > 10 ? 'text-[hsl(var(--warn))]' : 'text-[hsl(var(--ok))]'}`}>{o.tasaRechazo}%</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="rounded-xl border border-border bg-card overflow-hidden">
                        <div className="p-4 border-b border-border"><p className="font-semibold">Retrabajos por operación · tasa de rechazo</p></div>
                        <table className="w-full text-sm">
                            <thead className="bg-secondary text-left text-xs uppercase">
                                <tr>{['Operación', 'Retrabajos', 'Re-rechazados', 'Tasa rechazo'].map(h => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {stats.opeStats.map(o => (
                                    <tr key={o.nom}>
                                        <td className="px-3 py-2 font-semibold">{o.nom}</td>
                                        <td className="px-3 py-2 tabular-nums">{o.total}</td>
                                        <td className="px-3 py-2 tabular-nums text-destructive">{o.rechazados}</td>
                                        <td className="px-3 py-2">
                                            <span className={`font-semibold ${o.tasaRechazo > 25 ? 'text-destructive' : o.tasaRechazo > 10 ? 'text-[hsl(var(--warn))]' : 'text-[hsl(var(--ok))]'}`}>{o.tasaRechazo}%</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Tiempo promedio + per punto */}
            {stats.puntStats.length > 0 && (
                <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-xl border border-border bg-card p-5 flex flex-col justify-center">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Tiempo promedio de retrabajo</p>
                        <p className="font-display text-5xl mt-2 text-primary">
                            {stats.tiempoPromedioMin !== null ? `${stats.tiempoPromedioMin} min` : '—'}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {stats.tiemposCount} retrabajo{stats.tiemposCount !== 1 ? 's' : ''} completado{stats.tiemposCount !== 1 ? 's' : ''} con tiempo medido
                        </p>
                    </div>
                    <div className="rounded-xl border border-border bg-card overflow-hidden">
                        <div className="p-4 border-b border-border"><p className="font-semibold">Tasa de rechazo por punto de checklist</p></div>
                        <div className="overflow-auto max-h-72">
                            <table className="w-full text-sm">
                                <thead className="bg-secondary text-left text-xs uppercase sticky top-0">
                                    <tr>{['Punto', 'Retrabajos', 'Verificados', 'Re-rechazados', 'Tasa rechazo'].map(h => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {stats.puntStats.map(p => (
                                        <tr key={p.punt}>
                                            <td className="px-3 py-2 font-semibold">{p.punt}</td>
                                            <td className="px-3 py-2 tabular-nums">{p.total}</td>
                                            <td className="px-3 py-2 tabular-nums text-[hsl(var(--ok))]">{p.verificados}</td>
                                            <td className="px-3 py-2 tabular-nums text-destructive">{p.rechazados}</td>
                                            <td className="px-3 py-2">
                                                <span className={`font-semibold ${p.tasaRechazo > 25 ? 'text-destructive' : p.tasaRechazo > 10 ? 'text-[hsl(var(--warn))]' : 'text-[hsl(var(--ok))]'}`}>{p.tasaRechazo}%</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Per-exclusiva time report (QC + retrabajo + total) ── */}
            {stats.tiempoExStats && stats.tiempoExStats.length > 0 && (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="p-4 border-b border-border">
                        <p className="font-semibold">Tiempos por exclusiva — QC + retrabajo</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Tiempo de control de calidad, tiempo de retrabajo y total del proceso.</p>
                    </div>
                    <div className="overflow-auto max-h-96">
                        <table className="w-full min-w-[640px] text-sm">
                            <thead className="bg-secondary text-left text-xs uppercase sticky top-0">
                                <tr>{['Exclusiva', 'Retrabajos', 'T. QC', 'T. retrabajo', 'T. total', 'Estado QC'].map(h => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {stats.tiempoExStats.map((e, i) => (
                                    <tr key={i}>
                                        <td className="px-3 py-2 font-semibold">{e.exNom}</td>
                                        <td className="px-3 py-2 tabular-nums">{e.retrabajos}</td>
                                        <td className="px-3 py-2 tabular-nums text-primary">{fmtSegons(e.tiempoQc)}</td>
                                        <td className="px-3 py-2 tabular-nums text-destructive">{fmtSegons(e.tiempoRetrabajo)}</td>
                                        <td className="px-3 py-2 tabular-nums font-bold">{fmtSegons(e.tiempoTotal)}</td>
                                        <td className="px-3 py-2">
                                            <span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${e.estadoQc === 'completado' ? 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]' : e.estadoQc === 'en_retrabajo' ? 'bg-destructive/15 text-destructive' : e.estadoQc === 'en_proceso' ? 'bg-blue-100 text-blue-700' : 'bg-secondary text-muted-foreground'}`}>
                                                {e.estadoQc}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Chart: per exclusiva */}
            {stats.exStats.length > 1 && (
                <div className="rounded-xl border border-border bg-card p-5">
                    <p className="text-sm font-semibold mb-4">Retrabajos por exclusiva</p>
                    <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={stats.exStats}>
                            <XAxis dataKey="nom" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                            <Tooltip />
                            <Bar dataKey="count" name="Retrabajos" fill="hsl(0,72%,46%)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Reject-again modal */}
            {rechazoModal && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={() => setRechazoModal(null)}>
                    <div className="w-full max-w-md rounded-2xl bg-card p-5" onClick={e => e.stopPropagation()}>
                        <h3 className="font-display text-2xl uppercase mb-1 flex items-center gap-2">
                            <Wrench className="h-6 w-6 text-destructive" /> Rechazar y crear nuevo retrabajo
                        </h3>
                        <p className="text-sm text-muted-foreground mb-4">
                            {rechazoModal.retrabajo.expand?.exclusiva?.exclusiva} — {rechazoModal.retrabajo.operacion_original} (intento #{(rechazoModal.retrabajo.numero_intento || 1) + 1})
                        </p>
                        <div className="grid gap-3">
                            <div>
                                <label className="text-xs font-semibold uppercase text-muted-foreground">Operario asignado *</label>
                                <select value={rechazoModal.operario} onChange={e => setRechazoModal({ ...rechazoModal, operario: e.target.value })}
                                    className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
                                    <option value="">Seleccionar operario...</option>
                                    {operaris.map(op => <option key={op.id} value={op.id}>{op.name || op.codi}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-semibold uppercase text-muted-foreground">Motivo / notas del nuevo rechazo</label>
                                <textarea value={rechazoModal.notas} onChange={e => setRechazoModal({ ...rechazoModal, notas: e.target.value })}
                                    rows={3} placeholder="Qué sigue mal y qué debe corregirse..."
                                    className="mt-1 w-full rounded-lg border border-input bg-background p-3 text-sm resize-none" />
                            </div>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3">
                            <button onClick={() => setRechazoModal(null)} className="h-12 rounded-xl bg-secondary font-semibold">Cancelar</button>
                            <button onClick={rechazarDeNuevo} disabled={!rechazoModal.operario || accioId}
                                className="h-12 rounded-xl bg-destructive font-semibold text-white disabled:opacity-60">
                                Crear retrabajo
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}

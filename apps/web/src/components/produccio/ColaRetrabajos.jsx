import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Wrench, Play, Pause, Square, RefreshCcw, Search, X, Clock,
    AlertTriangle, CheckCircle2, ArrowLeft, ExternalLink,
} from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/lib/auth';
import { formatSegons } from '@/lib/csv';

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
const fmtDate = (d) => d ? new Date(d).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—';

export default function ColaRetrabajos() {
    const { user } = useAuth();
    const [retrabajos, setRetrabajos] = useState([]);
    const [exclusives, setExclusives] = useState([]);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState('');
    const [qDebounced, setQDebounced] = useState('');
    const [fEstado, setFEstado] = useState('all');
    const [fPrioridad, setFPrioridad] = useState('all');
    const [fArticulo, setFArticulo] = useState('all');
    const [selRetr, setSelRetr] = useState(null); // retrabajo en vista cronómetro

    // Cronómetro
    const cronoRef = useRef(null);
    const cronoStartRef = useRef(0);
    const [cronoSegons, setCronoSegons] = useState(0);
    const [cronoRunning, setCronoRunning] = useState(false);
    const [desant, setDesant] = useState(false);

    const stopCrono = useCallback(() => {
        if (cronoRef.current) { clearInterval(cronoRef.current); cronoRef.current = null; }
        setCronoRunning(false);
    }, []);

    const startCrono = useCallback((fromSegs) => {
        if (cronoRef.current) clearInterval(cronoRef.current);
        cronoStartRef.current = Date.now() - (fromSegs || 0) * 1000;
        setCronoRunning(true);
        cronoRef.current = setInterval(() => {
            setCronoSegons(Math.floor((Date.now() - cronoStartRef.current) / 1000));
        }, 500);
    }, []);

    const pauseCrono = useCallback(() => {
        if (cronoRef.current) { clearInterval(cronoRef.current); cronoRef.current = null; }
        setCronoRunning(false);
    }, []);

    useEffect(() => () => stopCrono(), [stopCrono]);

    useEffect(() => {
        const t = setTimeout(() => setQDebounced(q.trim()), 250);
        return () => clearTimeout(t);
    }, [q]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [rt, ex] = await Promise.all([
                pb.collection('retrabajos').getFullList({
                    sort: '-created',
                    expand: 'exclusiva,creado_por,operario_asignado,usuario_inicio,usuario_completado,usuario_aprobacion',
                    requestKey: 'cola-retr-list',
                }).catch(() => []),
                pb.collection('exclusives').getFullList({ fields: 'id,exclusiva,article,referencia', requestKey: 'cola-retr-ex' }).catch(() => []),
            ]);
            setRetrabajos(rt);
            setExclusives(ex);
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    // Realtime
    useEffect(() => {
        void pb.collection('retrabajos').subscribe('*', () => load()).catch(() => {});
        return () => { void pb.collection('retrabajos').unsubscribe('*').catch(() => {}); };
    }, [load]);

    const exMap = useMemo(() => { const m = {}; exclusives.forEach(e => { m[e.id] = e; }); return m; }, [exclusives]);

    const enriched = useMemo(() => retrabajos.map(r => {
        const ex = exMap[r.exclusiva] || r.expand?.exclusiva;
        return {
            ...r,
            _exclusivaNum: ex?.exclusiva || '—',
            _articulo: ex?.article || ex?.referencia || '—',
            _referencia: ex?.referencia || '—',
        };
    }), [retrabajos, exMap]);

    const articulos = useMemo(() => [...new Set(enriched.map(r => r._articulo).filter(a => a && a !== '—'))].sort(), [enriched]);

    const filtered = useMemo(() => {
        const t = qDebounced.toLowerCase();
        return enriched.filter(r => {
            if (fEstado !== 'all' && r.estado !== fEstado) return false;
            if (fPrioridad !== 'all' && r.prioridad !== fPrioridad) return false;
            if (fArticulo !== 'all' && r._articulo !== fArticulo) return false;
            if (t) {
                const hay = `${r._exclusivaNum} ${r._articulo} ${r._referencia} ${r.motivo_rechazo || ''} ${r.fase_retrabajo || ''} ${r.unidad_numero || ''}`;
                if (!hay.toLowerCase().includes(t)) return false;
            }
            return true;
        });
    }, [enriched, qDebounced, fEstado, fPrioridad, fArticulo]);

    // KPIs
    const kpis = useMemo(() => ({
        total: filtered.length,
        pendientes: filtered.filter(r => r.estado === 'pendiente').length,
        enProgreso: filtered.filter(r => r.estado === 'en_proceso').length,
        completados: filtered.filter(r => r.estado === 'completado').length,
        aprobados: filtered.filter(r => r.estado === 'aprobado').length,
        rechazados: filtered.filter(r => r.estado === 'rechazado').length,
    }), [filtered]);

    const hayFiltros = q || fEstado !== 'all' || fPrioridad !== 'all' || fArticulo !== 'all';
    const limpiar = () => { setQ(''); setFEstado('all'); setFPrioridad('all'); setFArticulo('all'); };

    // ── Iniciar retrabajo ──
    const iniciarRetrabajo = async (r) => {
        const now = new Date().toISOString();
        try {
            const updated = await pb.collection('retrabajos').update(r.id, {
                estado: 'en_proceso',
                fecha_inicio: now,
                usuario_inicio: user?.id || undefined,
            }, { requestKey: `cola-iniciar-${r.id}` });
            setSelRetr({ ...updated, ...r, estado: 'en_proceso', fecha_inicio: now, usuario_inicio: user?.id });
            setCronoSegons(0);
            startCrono(0);
            load();
        } catch (e) { console.error('Error iniciando retrabajo', e); }
    };

    // ── Reanudar un retrabajo en proceso (volver a la vista cronómetro) ──
    const reanudarVista = (r) => {
        setSelRetr(r);
        const prev = Number(r.tiempo_real_seg) || 0;
        setCronoSegons(prev);
        // Si sigue en_proceso, arrancar el cronómetro desde el tiempo acumulado
        if (r.estado === 'en_proceso') startCrono(prev);
    };

    // ── Marcar como completado ──
    const completarRetrabajo = async () => {
        if (!selRetr) return;
        setDesant(true);
        const tiempoReal = cronoSegons;
        try {
            stopCrono();
            const now = new Date().toISOString();
            await pb.collection('retrabajos').update(selRetr.id, {
                estado: 'completado',
                fecha_completacion: now,
                tiempo_real_seg: tiempoReal,
                usuario_completado: user?.id || undefined,
            }, { requestKey: `cola-complet-${selRetr.id}` });

            // Cambiar estado de exclusiva a en_curs (pendiente de revisión calidad)
            if (selRetr.exclusiva) {
                try {
                    await pb.collection('exclusives').update(selRetr.exclusiva, { estat: 'en_curs' }, { requestKey: `cola-ex-curs-${selRetr.exclusiva}` });
                } catch (e) { console.error('Error actualizando exclusiva', e); }
            }

            // Poner la unidad en pendiente_revision para que Calidad re-revise
            if (selRetr.unidad_numero && selRetr.exclusiva) {
                try {
                    const cc = await pb.collection('control_calidad').getFirstListItem(
                        pb.filter('exclusiva_id = {:ex} && unidad_numero = {:u}', { ex: selRetr.exclusiva, u: selRetr.unidad_numero }),
                        { requestKey: `cola-cc-${selRetr.id}` }
                    ).catch(() => null);
                    if (cc) {
                        await pb.collection('control_calidad').update(cc.id, {
                            estado: 'pendiente_revision',
                            fecha_resolucion: now,
                        }, { requestKey: `cola-cc-up-${cc.id}` });
                    } else {
                        await pb.collection('control_calidad').create({
                            exclusiva_id: selRetr.exclusiva,
                            unidad_numero: selRetr.unidad_numero,
                            estado: 'pendiente_revision',
                            fecha_resolucion: now,
                        }, { requestKey: `cola-cc-new-${selRetr.id}` });
                    }
                } catch (e) { console.error('Error actualizando control_calidad', e); }

                // Registrar tiempo de retrabajo
                try {
                    await pb.collection('tiempos_exclusiva').create({
                        exclusiva_id: selRetr.exclusiva,
                        tipo: 'retrabajo',
                        tiempo_minutos: Math.round((tiempoReal / 60) * 100) / 100,
                        tiempo_segundos: tiempoReal,
                        unidad_numero: selRetr.unidad_numero,
                        descripcion: `Retrabajo completado: ${selRetr.motivo_rechazo || selRetr.operacion_original || ''}`,
                        usuario_id: user?.id || '',
                        fecha: now,
                    }, { requestKey: `cola-tex-${selRetr.id}` });
                } catch (e) { console.error('Error registrando tiempo', e); }
            }

            // Notificar a Calidad
            try {
                const calidad = await pb.collection('users').getFullList({
                    filter: "rol = 'qualitat' || rol = 'admin' || rol = 'superadmin'",
                    requestKey: `cola-notify-${Date.now()}`,
                });
                const titol = `Retrabajo completado en ${selRetr._exclusivaNum || selRetr.expand?.exclusiva?.exclusiva} (unidad ${selRetr.unidad_numero || '—'})`;
                const missatge = `Producción completó el retrabajo. Pendiente revisión de calidad.${selRetr._articulo ? ' · ' + selRetr._articulo : ''}`;
                await Promise.all(calidad.map((a, i) =>
                    pb.collection('notifications').create({
                        destinatari: a.id, tipus: 'retrabajo_completado', titol, missatge,
                        link_id: selRetr.exclusiva, llegida: false,
                    }, { requestKey: `cola-notif-${i}-${Date.now()}` }).catch(() => {})
                ));
            } catch (e) { console.error('Error notificando', e); }

            setSelRetr(null);
            load();
        } catch (e) {
            console.error('Error completando retrabajo', e);
        } finally { setDesant(false); }
    };

    // ── Vista cronómetro ──
    if (selRetr) {
        const ex = selRetr.expand?.exclusiva || exMap[selRetr.exclusiva];
        return (
            <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
                <section className="rounded-2xl border border-border bg-card p-6 text-center">
                    <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
                        <button onClick={() => { stopCrono(); setSelRetr(null); }}
                            className="flex items-center gap-1.5 rounded-xl border border-border px-4 h-11 text-sm font-semibold hover:bg-secondary active:scale-95">
                            <ArrowLeft className="h-4 w-4" /> Volver a la cola
                        </button>
                        <span className={`rounded-lg px-3 py-1.5 text-sm font-bold uppercase ${ESTADO_BADGE[selRetr.estado] || 'bg-secondary'}`}>
                            {ESTADO_LABEL[selRetr.estado] || selRetr.estado}
                        </span>
                    </div>
                    <p className="font-display text-3xl uppercase">{selRetr._exclusivaNum || ex?.exclusiva}</p>
                    {ex?.article && <p className="text-sm font-semibold mt-1">{ex.article}</p>}
                    <p className="text-xs text-muted-foreground mt-1">Unidad <strong className="text-foreground">{selRetr.unidad_numero || '—'}</strong></p>

                    <div className="mt-4 rounded-xl bg-secondary/50 p-4 text-left">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">Descripción del retrabajo</p>
                        <p className="text-sm mt-1">{selRetr.motivo_rechazo || selRetr.operacion_original || '—'}</p>
                        {selRetr.fase_retrabajo && (
                            <p className="mt-2 text-xs"><span className="font-semibold uppercase text-muted-foreground">Fase: </span>{selRetr.fase_retrabajo}</p>
                        )}
                        {selRetr.punt_checklist && (
                            <p className="mt-1 text-xs"><span className="font-semibold uppercase text-muted-foreground">Punto: </span>{selRetr.punt_checklist}</p>
                        )}
                    </div>

                    <p className="font-display leading-none mt-6 tabular-nums text-[clamp(3rem,12vw,7rem)]">{formatSegons(cronoSegons)}</p>
                    {selRetr.temps_estimat_min > 0 && (
                        <p className="mt-2 text-sm text-muted-foreground">Tiempo estimado: <strong className="text-foreground">{selRetr.temps_estimat_min} min</strong></p>
                    )}
                    {cronoRunning && <p className="mt-1 rounded-lg bg-blue-100 text-blue-700 px-4 py-2 text-sm font-semibold inline-block">EN PROGRESO</p>}

                    <div className="mt-6 grid grid-cols-2 gap-3">
                        {cronoRunning ? (
                            <button onClick={pauseCrono} className="h-24 rounded-2xl bg-[hsl(var(--warn))] text-white text-xl font-semibold flex items-center justify-center gap-2 active:scale-[0.98]">
                                <Pause className="h-7 w-7" /> Pausar
                            </button>
                        ) : (
                            <button onClick={() => startCrono(cronoSegons)} className="h-24 rounded-2xl bg-[hsl(var(--ok))] text-white text-xl font-semibold flex items-center justify-center gap-2 active:scale-[0.98]">
                                <Play className="h-7 w-7" /> {cronoSegons > 0 ? 'Reanudar' : 'Iniciar'}
                            </button>
                        )}
                        <button onClick={completarRetrabajo} disabled={desant || cronoSegons === 0}
                            className="h-24 rounded-2xl bg-primary text-primary-foreground text-xl font-semibold flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-60">
                            <Square className="h-7 w-7" /> {desant ? 'Guardando...' : 'Completar'}
                        </button>
                    </div>
                </section>

                <aside className="rounded-2xl border border-border bg-card p-5">
                    <h2 className="font-display text-2xl uppercase">Detalle</h2>
                    <dl className="mt-3 text-sm divide-y divide-border">
                        <div className="flex justify-between py-2"><dt className="text-muted-foreground">Prioridad</dt><dd><span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${PRIORIDAD_BADGE[selRetr.prioridad] || 'bg-secondary'}`}>{selRetr.prioridad || '—'}</span></dd></div>
                        <div className="flex justify-between py-2"><dt className="text-muted-foreground">Creado por</dt><dd className="font-semibold">{selRetr.expand?.creado_por?.name || selRetr.expand?.creado_por?.codi || '—'}</dd></div>
                        <div className="flex justify-between py-2"><dt className="text-muted-foreground">Fecha creación</dt><dd className="text-xs">{fmtDate(selRetr.created)}</dd></div>
                        {selRetr.fecha_inicio && <div className="flex justify-between py-2"><dt className="text-muted-foreground">Iniciado</dt><dd className="text-xs">{fmtDate(selRetr.fecha_inicio)}</dd></div>}
                        {selRetr.expand?.usuario_inicio && <div className="flex justify-between py-2"><dt className="text-muted-foreground">Iniciado por</dt><dd className="font-semibold">{selRetr.expand.usuario_inicio.name || selRetr.expand.usuario_inicio.codi}</dd></div>}
                    </dl>
                    {selRetr.exclusiva && (
                        <a href={`/exclusiva/${selRetr.exclusiva}`} target="_blank" rel="noopener noreferrer"
                            className="mt-4 flex items-center justify-center gap-1.5 rounded-xl border border-border px-3 h-11 text-sm font-semibold hover:bg-secondary">
                            <ExternalLink className="h-4 w-4" /> Ver exclusiva
                        </a>
                    )}
                </aside>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div className="flex items-center gap-2">
                <Wrench className="h-6 w-6 text-destructive" />
                <h2 className="font-display text-2xl sm:text-3xl uppercase">Cola de retrabajos</h2>
            </div>

            {/* KPI band */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <KpiBox label="Total" value={kpis.total} color="primary" />
                <KpiBox label="Pendientes" value={kpis.pendientes} color="warn" />
                <KpiBox label="En progreso" value={kpis.enProgreso} color="blue" />
                <KpiBox label="Completados" value={kpis.completados} color="purple" />
                <KpiBox label="Aprobados" value={kpis.aprobados} color="green" />
                <KpiBox label="Rechazados" value={kpis.rechazados} color="red" />
            </div>

            {/* Filters */}
            <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-[200px] max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar exclusiva, referencia, unidad..."
                            className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm" />
                    </div>
                    <select value={fEstado} onChange={e => setFEstado(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
                        <option value="all">Todos estados</option>
                        {Object.entries(ESTADO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <select value={fPrioridad} onChange={e => setFPrioridad(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
                        <option value="all">Todas prioridades</option>
                        <option value="alta">Alta</option>
                        <option value="media">Media</option>
                        <option value="baja">Baja</option>
                    </select>
                    <select value={fArticulo} onChange={e => setFArticulo(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
                        <option value="all">Todos artículos</option>
                        {articulos.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
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
                        {hayFiltros ? 'Sin resultados con los filtros aplicados.' : 'No hay retrabajos en la cola.'}
                    </div>
                ) : (
                    <div className="overflow-auto">
                        <table className="w-full min-w-[1000px] text-sm">
                            <thead className="bg-secondary text-left text-xs uppercase">
                                <tr>
                                    {['Exclusiva', 'Referencia', 'Ud.', 'Descripción', 'Fase', 'T. estimado', 'Prioridad', 'Estado', 'Acción'].map(h => (
                                        <th key={h} className="px-3 py-2.5 font-semibold">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {filtered.map(r => {
                                    const canIniciar = r.estado === 'pendiente';
                                    const canContinuar = r.estado === 'en_proceso';
                                    return (
                                        <tr key={r.id} className={`hover:bg-secondary/30 ${r.estado === 'pendiente' ? 'bg-[hsl(var(--warn))]/5' : r.estado === 'en_proceso' ? 'bg-blue-50/40' : ''}`}>
                                            <td className="px-3 py-3 font-mono font-semibold">{r._exclusivaNum}</td>
                                            <td className="px-3 py-3 text-xs">{r._articulo}</td>
                                            <td className="px-3 py-3 tabular-nums font-semibold">{r.unidad_numero || '—'}</td>
                                            <td className="px-3 py-3 max-w-xs truncate" title={r.motivo_rechazo || r.operacion_original}>{r.motivo_rechazo || r.operacion_original || '—'}</td>
                                            <td className="px-3 py-3 text-xs">{r.fase_retrabajo || r.fase || '—'}</td>
                                            <td className="px-3 py-3 tabular-nums text-xs">{r.temps_estimat_min ? `${r.temps_estimat_min}m` : '—'}</td>
                                            <td className="px-3 py-3"><span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${PRIORIDAD_BADGE[r.prioridad] || 'bg-secondary'}`}>{r.prioridad || '—'}</span></td>
                                            <td className="px-3 py-3"><span className={`rounded px-2 py-0.5 text-xs font-semibold ${ESTADO_BADGE[r.estado] || 'bg-secondary'}`}>{ESTADO_LABEL[r.estado] || r.estado}</span></td>
                                            <td className="px-3 py-3">
                                                {canIniciar && (
                                                    <button onClick={() => iniciarRetrabajo(r)}
                                                        className="flex items-center gap-1.5 rounded-lg bg-primary px-3 h-9 text-xs font-bold text-primary-foreground active:scale-95">
                                                        <Play className="h-4 w-4" /> Iniciar
                                                    </button>
                                                )}
                                                {canContinuar && (
                                                    <button onClick={() => reanudarVista(r)}
                                                        className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 h-9 text-xs font-bold text-white active:scale-95">
                                                        <Play className="h-4 w-4" /> Continuar
                                                    </button>
                                                )}
                                                {(r.estado === 'completado' || r.estado === 'aprobado' || r.estado === 'rechazado') && (
                                                    <span className="text-xs text-muted-foreground">
                                                        {r.tiempo_real_seg ? formatSegons(r.tiempo_real_seg) : '—'}
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

function KpiBox({ label, value, color }) {
    const cls = {
        primary: 'text-primary',
        warn: 'text-[hsl(var(--warn))]',
        blue: 'text-blue-600',
        purple: 'text-purple-600',
        green: 'text-[hsl(var(--ok))]',
        red: 'text-destructive',
    }[color] || 'text-foreground';
    return (
        <div className="rounded-xl border border-border bg-card p-3 text-center">
            <p className={`font-display text-3xl tabular-nums ${cls}`}>{value}</p>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mt-1">{label}</p>
        </div>
    );
}

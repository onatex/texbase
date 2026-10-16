import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import {
    Search, Filter, Eye, MessageSquareReply, X, Lightbulb, ShieldCheck,
    CheckCircle2, Clock, AlertCircle, RefreshCcw, Calendar, User,
} from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/lib/auth';

const TIPO_LABEL = {
    propuesta_mejora: 'Propuesta de mejora',
    accion_preventiva: 'Acción preventiva',
};
const TIPO_BADGE = {
    propuesta_mejora: 'bg-primary/10 text-primary',
    accion_preventiva: 'bg-[hsl(var(--accent))]/15 text-[hsl(var(--accent))]',
};
const ESTADO_LABEL = {
    pendiente_respuesta: 'Pendiente respuesta',
    respondida: 'Respondida',
    en_progreso: 'En progreso',
    implementada: 'Implementada',
};
const ESTADO_BADGE = {
    pendiente_respuesta: 'bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))]',
    respondida: 'bg-blue-100 text-blue-700',
    en_progreso: 'bg-[hsl(var(--accent))]/15 text-[hsl(var(--accent))]',
    implementada: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]',
};
const RESP_ESTADO_LABEL = {
    pendiente: 'Pendiente',
    en_progreso: 'En progreso',
    implementada: 'Implementada',
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('es-ES') : '—';
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

export default function PropuestasMejora() {
    const { user } = useAuth();
    const [propuestas, setPropuestas] = useState([]);
    const [operaris, setOperaris] = useState([]);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState('');
    const [qDebounced, setQDebounced] = useState('');
    const [fEstado, setFEstado] = useState('all');
    const [fTipo, setFTipo] = useState('all');
    const [fFechaDesde, setFFechaDesde] = useState('');
    const [fFechaHasta, setFFechaHasta] = useState('');
    const [detalle, setDetalle] = useState(null);   // propuesta being viewed
    const [responder, setResponder] = useState(null); // propuesta being responded

    useEffect(() => {
        const t = setTimeout(() => setQDebounced(q.trim()), 250);
        return () => clearTimeout(t);
    }, [q]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [props, users] = await Promise.all([
                pb.collection('propuestas_mejora').getFullList({
                    sort: '-created',
                    expand: 'usuario_reporto,exclusiva_id,mono_id,nc_id',
                    requestKey: 'prop-list',
                }).catch(() => []),
                pb.collection('users').getFullList({ requestKey: 'prop-users' }).catch(() => []),
            ]);
            setPropuestas(props);
            setOperaris(users);
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    // Realtime
    useEffect(() => {
        void pb.collection('propuestas_mejora').subscribe('*', () => load()).catch(() => {});
        void pb.collection('respuestas_propuestas').subscribe('*', () => load()).catch(() => {});
        return () => {
            void pb.collection('propuestas_mejora').unsubscribe('*').catch(() => {});
            void pb.collection('respuestas_propuestas').unsubscribe('*').catch(() => {});
        };
    }, [load]);

    // Load responses for each propuesta
    const [respuestasMap, setRespuestasMap] = useState({});
    useEffect(() => {
        if (propuestas.length === 0) { setRespuestasMap({}); return; }
        pb.collection('respuestas_propuestas').getFullList({
            sort: '-created',
            expand: 'responsable_id,usuario_id',
            requestKey: 'prop-resp',
        }).then((all) => {
            const m = {};
            all.forEach((r) => {
                if (!m[r.propuesta_id]) m[r.propuesta_id] = [];
                m[r.propuesta_id].push(r);
            });
            setRespuestasMap(m);
        }).catch(() => setRespuestasMap({}));
    }, [propuestas]);

    const filtered = useMemo(() => {
        const t = qDebounced.toLowerCase();
        return propuestas.filter((p) => {
            if (fEstado !== 'all' && p.estado !== fEstado) return false;
            if (fTipo !== 'all' && p.tipo !== fTipo) return false;
            if (fFechaDesde && p.fecha_reporte && new Date(p.fecha_reporte) < new Date(fFechaDesde)) return false;
            if (fFechaHasta && p.fecha_reporte && new Date(p.fecha_reporte) > new Date(fFechaHasta + 'T23:59:59')) return false;
            if (t) {
                const hay = `${p.numero_exclusiva || ''} ${p.referencia_articulo || ''} ${p.descripcion || ''} ${p.punt_checklist || ''}`.toLowerCase();
                if (!hay.includes(t)) return false;
            }
            return true;
        });
    }, [propuestas, qDebounced, fEstado, fTipo, fFechaDesde, fFechaHasta]);

    const stats = useMemo(() => ({
        total: propuestas.length,
        pendientes: propuestas.filter(p => p.estado === 'pendiente_respuesta').length,
        respondidas: propuestas.filter(p => p.estado === 'respondida' || p.estado === 'en_progreso').length,
        implementadas: propuestas.filter(p => p.estado === 'implementada').length,
    }), [propuestas]);

    const limpiarFiltros = () => {
        setQ(''); setFEstado('all'); setFTipo('all'); setFFechaDesde(''); setFFechaHasta('');
    };

    const hayFiltros = q || fEstado !== 'all' || fTipo !== 'all' || fFechaDesde || fFechaHasta;

    return (
        <div className="space-y-5">
            <Helmet>
                <title>Propuestas de mejora | Control de producción</title>
                <meta name="description" content="Gestión de propuestas de mejora y acciones preventivas reportadas desde control de calidad." />
            </Helmet>

            <div className="flex items-center gap-2">
                <Lightbulb className="h-6 w-6 text-[hsl(var(--accent))]" />
                <h2 className="font-display text-2xl sm:text-3xl uppercase">Propuestas de mejora</h2>
            </div>

            {/* KPI band */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KpiBox label="Total" value={stats.total} icon={Lightbulb} color="primary" />
                <KpiBox label="Pendientes" value={stats.pendientes} icon={Clock} color="warn" />
                <KpiBox label="Respondidas" value={stats.respondidas} icon={MessageSquareReply} color="blue" />
                <KpiBox label="Implementadas" value={stats.implementadas} icon={CheckCircle2} color="ok" />
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
                    <select value={fTipo} onChange={e => setFTipo(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
                        <option value="all">Todos tipos</option>
                        {Object.entries(TIPO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <input type="date" value={fFechaDesde} onChange={e => setFFechaDesde(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm" title="Desde" />
                    <input type="date" value={fFechaHasta} onChange={e => setFFechaHasta(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm" title="Hasta" />
                    {hayFiltros && (
                        <button onClick={limpiarFiltros} className="flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-secondary active:scale-95">
                            <X className="h-4 w-4" /> Limpiar
                        </button>
                    )}
                    <button onClick={load} className="ml-auto flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-secondary active:scale-95">
                        <RefreshCcw className="h-4 w-4" /> Actualizar
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
                {loading ? (
                    <div className="p-10 text-center text-muted-foreground">Cargando...</div>
                ) : filtered.length === 0 ? (
                    <div className="p-10 text-center text-muted-foreground">
                        <Lightbulb className="mx-auto h-10 w-10 text-muted-foreground/30 mb-3" />
                        {hayFiltros ? 'Sin resultados con los filtros aplicados.' : 'No hay propuestas de mejora registradas.'}
                    </div>
                ) : (
                    <div className="overflow-auto">
                        <table className="w-full min-w-[900px] text-sm">
                            <thead className="bg-secondary text-left text-xs uppercase">
                                <tr>
                                    {['Exclusiva', 'Referencia', 'Descripción', 'Tipo', 'Estado', 'Reportado por', 'Fecha', 'Acciones'].map(h => (
                                        <th key={h} className="px-3 py-2.5 font-semibold">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {filtered.map(p => {
                                    const resps = respuestasMap[p.id] || [];
                                    const tieneResp = resps.length > 0;
                                    return (
                                        <tr key={p.id} className="hover:bg-secondary/30">
                                            <td className="px-3 py-3 font-mono font-semibold">{p.numero_exclusiva || '—'}</td>
                                            <td className="px-3 py-3 text-xs">{p.referencia_articulo || '—'}</td>
                                            <td className="px-3 py-3 max-w-xs truncate" title={p.descripcion}>{p.descripcion}</td>
                                            <td className="px-3 py-3"><span className={`rounded px-2 py-0.5 text-xs font-semibold ${TIPO_BADGE[p.tipo] || 'bg-secondary'}`}>{TIPO_LABEL[p.tipo] || p.tipo}</span></td>
                                            <td className="px-3 py-3"><span className={`rounded px-2 py-0.5 text-xs font-semibold ${ESTADO_BADGE[p.estado] || 'bg-secondary'}`}>{ESTADO_LABEL[p.estado] || p.estado}</span></td>
                                            <td className="px-3 py-3 text-xs">{p.expand?.usuario_reporto?.name || p.expand?.usuario_reporto?.codi || '—'}</td>
                                            <td className="px-3 py-3 text-xs tabular-nums">{fmtDate(p.fecha_reporte || p.created)}</td>
                                            <td className="px-3 py-3">
                                                <div className="flex gap-1.5">
                                                    <button onClick={() => setDetalle(p)} title="Ver detalles"
                                                        className="flex items-center gap-1 rounded border border-border px-2.5 h-8 text-xs font-semibold hover:bg-secondary active:scale-95">
                                                        <Eye className="h-3.5 w-3.5" /> Detalles
                                                    </button>
                                                    <button onClick={() => setResponder(p)} title="Responder"
                                                        className="flex items-center gap-1 rounded border border-primary/50 text-primary px-2.5 h-8 text-xs font-semibold hover:bg-primary/10 active:scale-95">
                                                        <MessageSquareReply className="h-3.5 w-3.5" /> {tieneResp ? 'Editar' : 'Responder'}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Detail modal */}
            {detalle && (
                <DetalleModal
                    propuesta={detalle}
                    respuestas={respuestasMap[detalle.id] || []}
                    onClose={() => setDetalle(null)}
                    onResponder={() => { setDetalle(null); setResponder(detalle); }}
                />
            )}

            {/* Response modal */}
            {responder && (
                <ResponderModal
                    propuesta={responder}
                    operaris={operaris}
                    respuestaExistente={(respuestasMap[responder.id] || [])[0]}
                    userId={user?.id}
                    onClose={() => setResponder(null)}
                    onSaved={() => { setResponder(null); load(); }}
                />
            )}
        </div>
    );
}

function KpiBox({ label, value, icon: Icon, color }) {
    const cls = {
        primary: 'bg-primary/10 text-primary',
        warn: 'bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))]',
        blue: 'bg-blue-100 text-blue-700',
        ok: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]',
    }[color] || 'bg-secondary';
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

function DetalleModal({ propuesta, respuestas, onClose, onResponder }) {
    return (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-2xl bg-card p-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                        <h3 className="font-display text-2xl uppercase flex items-center gap-2"><Lightbulb className="h-6 w-6 text-[hsl(var(--accent))]" /> Detalle de propuesta</h3>
                        <p className="text-sm text-muted-foreground mt-1">{propuesta.numero_exclusiva} · {propuesta.referencia_articulo || '—'}</p>
                    </div>
                    <button onClick={onClose} className="rounded-lg p-2 hover:bg-secondary"><X className="h-5 w-5" /></button>
                </div>

                <div className="grid gap-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <InfoChip label="Tipo" value={TIPO_LABEL[propuesta.tipo]} badge={TIPO_BADGE[propuesta.tipo]} />
                        <InfoChip label="Estado" value={ESTADO_LABEL[propuesta.estado]} badge={ESTADO_BADGE[propuesta.estado]} />
                        <InfoChip label="Punto checklist" value={propuesta.punt_checklist || '—'} />
                        <InfoChip label="Reportado por" value={propuesta.expand?.usuario_reporto?.name || propuesta.expand?.usuario_reporto?.codi || '—'} />
                        <InfoChip label="Fecha reporte" value={fmtDateTime(propuesta.fecha_reporte || propuesta.created)} />
                        <InfoChip label="Exclusiva" value={propuesta.numero_exclusiva || '—'} />
                    </div>

                    <div>
                        <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Descripción de la propuesta</p>
                        <div className="rounded-lg border border-border bg-secondary/40 p-3 text-sm">{propuesta.descripcion}</div>
                    </div>

                    {/* Responses history */}
                    <div>
                        <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Respuestas / acciones ({respuestas.length})</p>
                        {respuestas.length === 0 ? (
                            <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Sin respuestas todavía.</p>
                        ) : (
                            <div className="space-y-2">
                                {respuestas.map(r => (
                                    <div key={r.id} className="rounded-lg border border-border p-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                                            <span className="text-xs font-semibold">{r.expand?.usuario_id?.name || r.expand?.usuario_id?.codi || '—'}</span>
                                            <span className="text-xs text-muted-foreground">{fmtDateTime(r.fecha_respuesta || r.created)}</span>
                                        </div>
                                        <p className="text-sm">{r.respuesta}</p>
                                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                                            <span>Responsable: <strong className="text-foreground">{r.expand?.responsable_id?.name || r.expand?.responsable_id?.codi || '—'}</strong></span>
                                            <span>Estado: <strong className="text-foreground">{RESP_ESTADO_LABEL[r.estado] || r.estado}</strong></span>
                                            {r.fecha_estimada && <span>Fecha estimada: <strong className="text-foreground">{fmtDate(r.fecha_estimada)}</strong></span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <button onClick={onResponder} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-semibold active:scale-95">
                        <MessageSquareReply className="h-5 w-5" /> {respuestas.length > 0 ? 'Añadir / editar respuesta' : 'Responder propuesta'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function InfoChip({ label, value, badge }) {
    return (
        <div className="rounded-lg bg-secondary/40 px-3 py-2">
            <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
            {badge ? <span className={`rounded px-2 py-0.5 text-xs font-semibold ${badge}`}>{value}</span> : <p className="font-semibold text-sm truncate">{value}</p>}
        </div>
    );
}

function ResponderModal({ propuesta, operaris, respuestaExistente, userId, onClose, onSaved }) {
    const [respuesta, setRespuesta] = useState(respuestaExistente?.respuesta || '');
    const [responsable, setResponsable] = useState(respuestaExistente?.responsable_id || '');
    const [fechaEstimada, setFechaEstimada] = useState(respuestaExistente?.fecha_estimada || '');
    const [estado, setEstado] = useState(respuestaExistente?.estado || 'pendiente');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const guardar = async () => {
        if (!respuesta.trim()) { setError('La respuesta es obligatoria.'); return; }
        setSaving(true); setError('');
        try {
            const now = new Date().toISOString();
            if (respuestaExistente?.id) {
                await pb.collection('respuestas_propuestas').update(respuestaExistente.id, {
                    respuesta, responsable_id: responsable || undefined,
                    fecha_estimada: fechaEstimada || undefined, estado,
                    usuario_id: userId,
                }, { requestKey: `resp-up-${respuestaExistente.id}` });
            } else {
                await pb.collection('respuestas_propuestas').create({
                    propuesta_id: propuesta.id,
                    respuesta,
                    responsable_id: responsable || undefined,
                    fecha_estimada: fechaEstimada || undefined,
                    estado,
                    fecha_respuesta: now,
                    usuario_id: userId,
                }, { requestKey: `resp-new-${propuesta.id}` });
            }
            // Update propuesta estado
            const nuevoEstado = estado === 'implementada' ? 'implementada' : estado === 'en_progreso' ? 'en_progreso' : 'respondida';
            await pb.collection('propuestas_mejora').update(propuesta.id, { estado: nuevoEstado }, { requestKey: `prop-est-${propuesta.id}` });
            onSaved();
        } catch (e) {
            setError('No se pudo guardar la respuesta.');
            console.error(e);
        } finally { setSaving(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div className="w-full max-w-lg rounded-2xl bg-card p-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 mb-4">
                    <h3 className="font-display text-2xl uppercase flex items-center gap-2"><MessageSquareReply className="h-6 w-6 text-primary" /> Responder propuesta</h3>
                    <button onClick={onClose} className="rounded-lg p-2 hover:bg-secondary"><X className="h-5 w-5" /></button>
                </div>

                {/* Read-only propuesta description */}
                <div className="mb-4 rounded-lg border border-border bg-secondary/40 p-3">
                    <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Propuesta (solo lectura)</p>
                    <p className="text-sm">{propuesta.descripcion}</p>
                    <p className="text-xs text-muted-foreground mt-1">{propuesta.numero_exclusiva} · {propuesta.referencia_articulo || '—'} · {TIPO_LABEL[propuesta.tipo]}</p>
                </div>

                <div className="grid gap-3">
                    <div>
                        <label className="text-xs font-semibold uppercase text-muted-foreground">Respuesta / Acción preventiva *</label>
                        <textarea value={respuesta} onChange={e => setRespuesta(e.target.value)} rows={3}
                            placeholder="Describe la respuesta o acción preventiva a implementar..."
                            className="mt-1 w-full rounded-lg border border-input bg-background p-3 text-sm resize-none" />
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-semibold uppercase text-muted-foreground">Responsable de implementación</label>
                            <select value={responsable} onChange={e => setResponsable(e.target.value)}
                                className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
                                <option value="">Seleccionar...</option>
                                {operaris.map(op => <option key={op.id} value={op.id}>{op.name || op.codi}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-semibold uppercase text-muted-foreground">Fecha estimada implementación</label>
                            <input type="date" value={fechaEstimada} onChange={e => setFechaEstimada(e.target.value)}
                                className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-semibold uppercase text-muted-foreground">Estado</label>
                        <select value={estado} onChange={e => setEstado(e.target.value)}
                            className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
                            <option value="pendiente">Pendiente</option>
                            <option value="en_progreso">En progreso</option>
                            <option value="implementada">Implementada</option>
                        </select>
                    </div>
                </div>

                {error && <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

                <div className="mt-5 grid grid-cols-2 gap-3">
                    <button onClick={onClose} className="h-12 rounded-xl bg-secondary font-semibold">Cancelar</button>
                    <button onClick={guardar} disabled={saving}
                        className="h-12 rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-60 active:scale-95">
                        {saving ? 'Guardando...' : 'Guardar respuesta'}
                    </button>
                </div>
            </div>
        </div>
    );
}

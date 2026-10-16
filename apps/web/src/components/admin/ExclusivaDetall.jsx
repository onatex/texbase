import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowLeft, ChevronRight, Clock, Download, Search, User,
    AlertTriangle, CheckCircle2, RefreshCcw, BarChart2, X, Save, Send, Edit2, Edit3, MessageSquare,
    ExternalLink, Building2, Truck, History, Plus, Trash2, Lightbulb, Wrench, Camera, AlertCircle, Layers, Pause, RotateCcw,
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
    PieChart, Pie, Cell,
} from 'recharts';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/lib/auth';
import { descarregaCSV, formatSegons } from '@/lib/csv';
import { computeMonoOps, resolveRutaExclusiva } from '@/lib/operacionsUtils';
import { expectedFasesForExclusiva, canonFase as canonFaseUtil, isCikExclusiva } from '@/lib/fasesUtils';
import ControlCalidadUnidades from '@/components/qualitat/ControlCalidadUnidades';
import AnadirOperacionModal from '@/components/admin/AnadirOperacionModal';
import PropagarOperacionModal from '@/components/produccio/PropagarOperacionModal';

/** Net productive seconds for a registre without counting paused intervals.
 *  - pausat: temps_real_seg congelado (el tiempo de parada no es productivo).
 *  - en_curs: temps_real_seg + (now - ultima_reanudacio) — solo desde la última
 *    reanudación, sin duplicar ni incluir pausas.
 *  - finalitzat: temps_real_seg. */
function segonsRegistre(r, nowMs = Date.now()) {
    if (!r) return 0;
    const stored = Number(r?.temps_real_seg);
    const base = Number.isFinite(stored) && stored > 0 ? stored : 0;
    if (r?.estat === 'pausat') return base;
    if (r?.estat === 'en_curs') {
        const ref = r.ultima_reanudacio || r.inici;
        if (!ref) return base;
        const refMs = new Date(ref).getTime();
        if (Number.isNaN(refMs)) return base;
        const live = Math.max(0, Math.floor((nowMs - refMs) / 1000));
        // Cap a 8h: un en_curs con más de 8h de tiempo vivo es huérfano.
        return base + Math.min(live, 8 * 60 * 60);
    }
    return base;
}

/** Segundos de parada (no productivos) de un registre, sin duplicar por
 *  recargas/realtime/pausas/reanudaciones. Suma las pausas cerradas
 *  (pauses[].durada_seg) y, si está pausado ahora, el intervalo abierto. */
function segonsParadaRegistre(r, nowMs = Date.now()) {
    if (!r) return 0;
    let total = 0;
    const pauses = Array.isArray(r?.pauses) ? r.pauses : [];
    pauses.forEach((p) => {
        const d = Number(p?.durada_seg);
        if (Number.isFinite(d) && d > 0) total += d;
        else if (p?.inici && !p?.fi) {
            // Pausa abierta sin duración cerrada: contar hasta ahora.
            const iMs = new Date(p.inici).getTime();
            if (!Number.isNaN(iMs)) total += Math.max(0, Math.floor((nowMs - iMs) / 1000));
        }
    });
    return total;
}

function upsertById(list, record) {
    const i = list.findIndex((x) => x.id === record.id);
    if (i < 0) return [record, ...list];
    const next = list.slice();
    next[i] = { ...list[i], ...record, expand: record.expand || list[i].expand };
    return next;
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
const badge = {
    pendent: 'bg-secondary text-secondary-foreground',
    en_curs: 'bg-[hsl(var(--warn))]/20 text-[hsl(var(--warn))]',
    finalitzada: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]',
    finalitzat: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]',
    bloquejada: 'bg-destructive/10 text-destructive',
    retreball: 'bg-destructive/10 text-destructive',
    pausat: 'bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))]',
    completada: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]',
    disponible: 'bg-primary/10 text-primary',
    ok: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]',
    ko: 'bg-destructive/10 text-destructive',
    aprovat: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]',
    rebutjat: 'bg-destructive/10 text-destructive',
    pendent_qc: 'bg-secondary text-muted-foreground',
};
const Estat = ({ v }) => (
    <span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${badge[v] || 'bg-secondary'}`}>{v || '—'}</span>
);
const fmtDate = (d) => d ? new Date(d).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtDay = (d) => d ? new Date(d).toLocaleDateString('es-ES') : '—';
// Formatea segundos a mm:ss (o h m) para los tiempos de Calidad.
const fmtSegQC = (s) => {
    s = Math.max(0, Math.floor(Number(s) || 0));
    if (!s) return '—';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
    return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
};
const desvPct = (real, std) => { if (!std) return null; return Math.round(((real - std) / std) * 100); };
const COLORS = ['#1e3a5f', '#f97316', '#10b981', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6'];

const PRIORITAT_OPTS = ['baja', 'normal', 'media', 'alta', 'urgente', 'express'];

/* ─── Screen 1: Exclusiva list ────────────────────────────────────────────── */
function LlistaExclusives({ onSelect }) {
    const [exclusives, setExclusives] = useState([]);
    const [monos, setMonos] = useState([]);
    const [carregant, setCarregant] = useState(true);
    const [q, setQ] = useState('');
    const [estatFil, setEstatFil] = useState('totes');

    useEffect(() => {
        Promise.all([
            pb.collection('exclusives').getFullList({ sort: '-created', requestKey: 'detall-ex-list' }),
            pb.collection('monos').getFullList({ sort: 'created', requestKey: 'detall-mo-list' }),
        ]).then(([ex, mo]) => { setExclusives(ex); setMonos(mo); }).finally(() => setCarregant(false));
    }, []);

    const files = useMemo(() => {
        const text = q.trim().toLowerCase();
        return exclusives
            .filter((e) => !text || `${e.exclusiva} ${e.article || ''} ${e.marca || ''} ${e.referencia || ''} ${e.cliente || ''}`.toLowerCase().includes(text))
            .filter((e) => estatFil === 'totes' || e.estat === estatFil)
            .map((e) => {
                const seus = monos.filter((m) => m.exclusiva === e.id);
                const fets = seus.filter((m) => m.estat === 'finalitzat').length;
                return { ...e, totalMonos: seus.length, fetsMonos: fets, progres: seus.length ? Math.round((fets / seus.length) * 100) : 0 };
            });
    }, [exclusives, monos, q, estatFil]);

    if (carregant) return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[0,1,2,3,4,5].map(i=><div key={i} className="h-28 animate-pulse rounded-lg bg-secondary"/>)}</div>;

    return (
        <div>
            <div className="mb-4 flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar exclusiva, artículo, marca, cliente..."
                        className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm" />
                </div>
                <select value={estatFil} onChange={e => setEstatFil(e.target.value)}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                    <option value="totes">Todos los estados</option>
                    {['recibida','pendent','en_curs','finalitzada','bloquejada','lista_recollida','entregada'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>
            {files.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">Sin exclusivas encontradas.</p>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {files.map(e => (
                        <button key={e.id} onClick={() => onSelect(e)}
                            className="rounded-xl border-2 border-border bg-card p-4 text-left hover:border-primary/50 active:scale-[0.98] transition">
                            <div className="flex items-start justify-between gap-2 mb-2">
                                <p className="font-display text-3xl uppercase leading-none">{e.exclusiva}</p>
                                <div className="flex flex-col gap-1 items-end">
                                    <Estat v={e.estat} />
                                    {e.prioritat === 'express' && <span className="rounded px-2 py-0.5 text-xs font-bold bg-destructive text-white uppercase">Express</span>}
                                </div>
                            </div>
                            {e.article && <p className="text-sm font-semibold">{e.article}</p>}
                            {(e.marca || e.cliente) && <p className="text-xs text-muted-foreground">{e.cliente || e.marca}</p>}
                            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                                <span>{e.totalMonos} monos · {e.progres}% completado</span>
                                <ChevronRight className="h-4 w-4"/>
                            </div>
                            <div className="mt-1.5 h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                                <div className="h-full bg-[hsl(var(--ok))] rounded-full" style={{width:`${e.progres}%`}}/>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ─── Edit form (Admin/Super Admin) ───────────────────────────────────────── */
function EditForm({ exclusiva, rutes, onSaved }) {
    const [form, setForm] = useState({
        data_entrega: exclusiva.data_entrega || '',
        prioritat: exclusiva.prioritat || 'normal',
        article: exclusiva.article || '',
        unitats: exclusiva.unitats ?? '',
        marca: exclusiva.marca || '',
        cliente: exclusiva.cliente || '',
        observacions: exclusiva.observacions || '',
        ruta: exclusiva.ruta || '',
    });
    const [saving, setSaving] = useState(false);
    const [canvis, setCanvis] = useState(null);
    const [error, setError] = useState('');

    const labels = {
        data_entrega: 'Fecha de entrega', prioritat: 'Prioridad', article: 'Artículo',
        unitats: 'Unidades', marca: 'Marca', cliente: 'Cliente',
        observacions: 'Notas', ruta: 'Ruta',
    };

    const guardar = async () => {
        setSaving(true); setError(''); setCanvis(null);
        const changes = {};
        Object.keys(form).forEach(k => {
            if (String(form[k] ?? '') !== String(exclusiva[k] ?? '')) {
                changes[k] = form[k] === '' ? null : form[k];
            }
        });
        if (Object.keys(changes).length === 0) { setSaving(false); return; }
        try {
            await pb.collection('exclusives').update(exclusiva.id, changes, { requestKey: `edit-ex-${exclusiva.id}` });
            const resum = Object.keys(changes).map(k => `${labels[k]}: "${exclusiva[k] ?? '—'}" → "${form[k] ?? '—'}"`);
            setCanvis(resum);
            onSaved && onSaved();
        } catch (e) { setError('No se han podido guardar los cambios.'); }
        finally { setSaving(false); }
    };

    return (
        <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-display text-xl uppercase mb-4 flex items-center gap-2"><Edit3 className="h-5 w-5" /> Editar exclusiva</h3>
            <div className="grid gap-4 sm:grid-cols-2">
                <div>
                    <label className="text-xs font-semibold uppercase text-muted-foreground">Fecha de entrega</label>
                    <input type="date" value={form.data_entrega} onChange={e => setForm({...form, data_entrega: e.target.value})}
                        className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
                </div>
                <div>
                    <label className="text-xs font-semibold uppercase text-muted-foreground">Prioridad</label>
                    <select value={form.prioritat} onChange={e => setForm({...form, prioritat: e.target.value})}
                        className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                        {PRIORITAT_OPTS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>
                <div>
                    <label className="text-xs font-semibold uppercase text-muted-foreground">Artículo</label>
                    <input value={form.article} onChange={e => setForm({...form, article: e.target.value})}
                        className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
                </div>
                <div>
                    <label className="text-xs font-semibold uppercase text-muted-foreground">Unidades</label>
                    <input type="number" value={form.unitats} onChange={e => setForm({...form, unitats: e.target.value === '' ? '' : Number(e.target.value)})}
                        className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
                </div>
                <div>
                    <label className="text-xs font-semibold uppercase text-muted-foreground">Marca</label>
                    <input value={form.marca} onChange={e => setForm({...form, marca: e.target.value})}
                        className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
                </div>
                <div>
                    <label className="text-xs font-semibold uppercase text-muted-foreground">Cliente</label>
                    <input value={form.cliente} onChange={e => setForm({...form, cliente: e.target.value})}
                        className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
                </div>
                <div className="sm:col-span-2">
                    <label className="text-xs font-semibold uppercase text-muted-foreground">Ruta</label>
                    <select value={form.ruta} onChange={e => setForm({...form, ruta: e.target.value || ''})}
                        className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                        <option value="">Sin ruta</option>
                        {rutes.map(r => <option key={r.id} value={r.id}>{r.nom}</option>)}
                    </select>
                </div>
                <div className="sm:col-span-2">
                    <label className="text-xs font-semibold uppercase text-muted-foreground">Notas</label>
                    <textarea value={form.observacions} onChange={e => setForm({...form, observacions: e.target.value})} rows={3}
                        className="mt-1 w-full rounded-md border border-input bg-background p-3 text-sm" />
                </div>
            </div>

            {error && <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            {canvis && (
                <div className="mt-3 rounded-md bg-[hsl(var(--ok))]/10 px-4 py-3">
                    <p className="text-sm font-semibold text-[hsl(var(--ok))] flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Cambios guardados:</p>
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                        {canvis.map((c, i) => <li key={i}>• {c}</li>)}
                    </ul>
                </div>
            )}
            <button onClick={guardar} disabled={saving}
                className="mt-4 flex items-center gap-2 rounded-md bg-primary px-5 h-11 text-sm font-semibold text-primary-foreground active:scale-95 disabled:opacity-50">
                <Save className="h-4 w-4" /> {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
        </div>
    );
}

/* ─── Send message modal ──────────────────────────────────────────────────── */
function MessageModal({ exclusiva, operaris, opsDef, onClose }) {
    const { user } = useAuth();
    const [tipoDest, setTipoDest] = useState('todos');
    const [operacionRef, setOperacionRef] = useState('');
    const [destinatari, setDestinatari] = useState('');
    const [mensaje, setMensaje] = useState('');
    const [prioridad, setPrioridad] = useState('normal');
    const [sending, setSending] = useState(false);
    const [enviat, setEnviat] = useState(false);
    const [error, setError] = useState('');

    const rutaOps = useMemo(() => opsDef.filter(o => o.ruta === exclusiva.ruta), [opsDef, exclusiva.ruta]);

    const enviar = async () => {
        if (!mensaje.trim()) return;
        setSending(true); setError('');
        try {
            // Determine recipients
            let destinataris = [];
            if (tipoDest === 'calidad') {
                destinataris = operaris.filter(o => o.rol === 'qualitat').map(o => o.id);
            } else if (tipoDest === 'todos') {
                destinataris = operaris.filter(o => o.rol === 'operari' || o.rol === 'qualitat').map(o => o.id);
            } else if (destinatari) {
                destinataris = [destinatari];
            } else {
                // operacion: all operaris who worked on this exclusiva
                destinataris = operaris.filter(o => o.rol === 'operari').map(o => o.id);
            }

            // Create mensajes_exclusiva record (one per destinatari, or one general if todos)
            const base = {
                exclusiva: exclusiva.id,
                remitente: user?.id,
                tipo_destinatario: tipoDest,
                operacion_ref: operacionRef || '',
                mensaje: mensaje.trim(),
                prioridad,
                leido: false,
                fecha_envio: new Date().toISOString(),
            };

            if (destinataris.length === 0) {
                // still save a general record
                await pb.collection('mensajes_exclusiva').create({ ...base, destinatario: null }, { requestKey: 'msg-gen' });
            } else {
                await Promise.all(destinataris.map((dId, i) =>
                    pb.collection('mensajes_exclusiva').create({ ...base, destinatario: dId }, { requestKey: `msg-${i}` })
                ));
                // Create notifications for each destinatari
                const titol = `Mensaje sobre ${exclusiva.exclusiva}${prioridad === 'urgente' ? ' (URGENTE)' : ''}`;
                const missatge = mensaje.trim().slice(0, 200);
                await Promise.all(destinataris.map((dId, i) =>
                    pb.collection('notifications').create({
                        destinatari: dId, tipus: 'mensaje_exclusiva', titol, missatge,
                        link_id: exclusiva.id, llegida: false,
                    }, { requestKey: `msg-notif-${i}` }).catch(() => {})
                ));
            }
            setEnviat(true);
        } catch (e) { setError('No se pudo enviar el mensaje.'); console.error(e); }
        finally { setSending(false); }
    };

    if (enviat) return (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div className="w-full max-w-md rounded-2xl bg-card p-6 text-center" onClick={e => e.stopPropagation()}>
                <CheckCircle2 className="mx-auto h-12 w-12 text-[hsl(var(--ok))]" />
                <p className="mt-3 font-display text-2xl uppercase">Mensaje enviado</p>
                <button onClick={onClose} className="mt-4 h-11 w-full rounded-xl bg-secondary font-semibold">Cerrar</button>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div className="w-full max-w-lg rounded-2xl bg-card p-5" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-display text-2xl uppercase flex items-center gap-2"><MessageSquare className="h-6 w-6" /> Enviar mensaje</h3>
                    <button onClick={onClose} className="rounded-md bg-secondary p-2"><X className="h-5 w-5"/></button>
                </div>
                <p className="text-sm text-muted-foreground mb-3">Exclusiva {exclusiva.exclusiva} · {exclusiva.article || '—'}</p>

                <div className="space-y-3">
                    <div>
                        <label className="text-xs font-semibold uppercase text-muted-foreground">Tipo de destinatario</label>
                        <div className="mt-1 grid grid-cols-3 gap-2">
                            {[{id:'todos',l:'Todos'},{id:'operacion',l:'Operario de op.'},{id:'calidad',l:'Control calidad'}].map(t => (
                                <button key={t.id} onClick={() => { setTipoDest(t.id); setDestinatari(''); }}
                                    className={`h-11 rounded-lg border text-sm font-semibold ${tipoDest === t.id ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`}>{t.l}</button>
                            ))}
                        </div>
                    </div>

                    {tipoDest === 'operacion' && (
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-xs font-semibold uppercase text-muted-foreground">Operación</label>
                                <select value={operacionRef} onChange={e => setOperacionRef(e.target.value)}
                                    className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
                                    <option value="">Cualquiera</option>
                                    {rutaOps.map(o => <option key={o.id} value={o.nom}>{o.codi} · {o.nom}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-semibold uppercase text-muted-foreground">Operario específico</label>
                                <select value={destinatari} onChange={e => setDestinatari(e.target.value)}
                                    className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
                                    <option value="">Todos los operarios</option>
                                    {operaris.filter(o => o.rol === 'operari').map(o => <option key={o.id} value={o.id}>{o.name || o.codi}</option>)}
                                </select>
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="text-xs font-semibold uppercase text-muted-foreground">Mensaje</label>
                        <textarea value={mensaje} onChange={e => setMensaje(e.target.value)} rows={4}
                            className="mt-1 w-full rounded-md border border-input bg-background p-3 text-sm" placeholder="Escribe el mensaje para los operarios..." />
                    </div>

                    <div>
                        <label className="text-xs font-semibold uppercase text-muted-foreground">Prioridad</label>
                        <div className="mt-1 grid grid-cols-2 gap-2">
                            {[{id:'normal',l:'Normal'},{id:'urgente',l:'Urgente'}].map(p => (
                                <button key={p.id} onClick={() => setPrioridad(p.id)}
                                    className={`h-11 rounded-lg border text-sm font-semibold ${prioridad === p.id ? (p.id === 'urgente' ? 'border-destructive bg-destructive/10 text-destructive' : 'border-primary bg-primary/10 text-primary') : 'border-border'}`}>{p.l}</button>
                            ))}
                        </div>
                    </div>

                    {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
                    <button onClick={enviar} disabled={sending || !mensaje.trim()}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary h-12 font-semibold text-primary-foreground active:scale-95 disabled:opacity-50">
                        <Send className="h-5 w-5" /> {sending ? 'Enviando...' : 'Enviar mensaje'}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ─── Fases externalizades section ────────────────────────────────────────── */
function FasesExternalizadesSection({ exclusiva, fases, proveedores, historial, onSaved }) {
    const { user } = useAuth();
    const [rows, setRows] = useState(() => fases.map(f => ({ ...f })));
    const [saving, setSaving] = useState(false);
    const [savedMsg, setSavedMsg] = useState('');
    const [error, setError] = useState('');
    const [deletedIds, setDeletedIds] = useState([]);

    useEffect(() => { setRows(fases.map(f => ({ ...f }))); setSavedMsg(''); setDeletedIds([]); }, [fases]);

    const addFase = () => {
        setRows(prev => [...prev, {
            fase: '', numero: prev.length + 1, descripcion: '', tiempoEstimadoSeg: 0,
            externalizada: false, precio: 0, proveedor: '', notas: '', fecha_limite: '',
            estado: 'pendiente', estado_fase: 'en_progreso', fecha_listo_entregar: '', fecha_entregado: '',
            id: null, manual: true, _new: true,
        }]);
    };

    const removeFase = (idx) => {
        setRows(prev => {
            const row = prev[idx];
            if (row?.id) setDeletedIds(d => [...d, row.id]);
            return prev.filter((_, i) => i !== idx);
        });
    };

    const updateRow = (idx, patch) => setRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

    // When estado_fase changes, auto-stamp the corresponding date.
    const changeEstadoFase = (idx, nuevo) => {
        const now = new Date().toISOString();
        setRows(prev => prev.map((r, i) => {
            if (i !== idx) return r;
            const patch = { estado_fase: nuevo };
            if (nuevo === 'listo_para_entregar' && !r.fecha_listo_entregar) patch.fecha_listo_entregar = now;
            if (nuevo === 'entregado') {
                if (!r.fecha_listo_entregar) patch.fecha_listo_entregar = r.fecha_listo_entregar || now;
                if (!r.fecha_entregado) patch.fecha_entregado = now;
            }
            return { ...r, ...patch };
        }));
    };

    const provById = useMemo(() => { const m = new Map(); proveedores.forEach(p => m.set(p.id, p)); return m; }, [proveedores]);
    const unitats = Number(exclusiva.unitats) || 0;
    const costPerFase = (r) => (r.externalizada ? (Number(r.precio) || 0) * unitats : 0);
    const costTotal = rows.reduce((a, r) => a + costPerFase(r), 0);
    const extCount = rows.filter(r => r.externalizada).length;

    const guardar = async () => {
        setSaving(true); setError(''); setSavedMsg('');
        try {
            const existing = await pb.collection('fases_externalizadas_exclusiva').getFullList({ filter: `exclusiva_id = "${exclusiva.id}"`, requestKey: 'fee-list' });
            const existingByFase = new Map(existing.map(e => [e.fase, e]));
            const historialEntries = [];

            // Delete removed fases
            for (const id of deletedIds) {
                await pb.collection('fases_externalizadas_exclusiva').delete(id, { requestKey: `fee-del-${id}` }).catch(() => {});
            }

            for (const r of rows) {
                if (!r.fase || !r.fase.trim()) continue;
                const faseNom = r.fase.trim();
                const prev = existingByFase.get(faseNom);
                const wasExt = !!prev?.externalizada;
                const prevPrecio = prev?.precio_unitario ?? 0;
                const prevProv = prev?.proveedor_id || '';
                const payload = {
                    exclusiva_id: exclusiva.id,
                    fase: faseNom,
                    nombre_fase: r.manual ? faseNom : (prev?.nombre_fase || faseNom),
                    externalizada: r.externalizada,
                    precio_unitario: Number(r.precio) || 0,
                    proveedor_id: r.proveedor || null,
                    fecha_externalizacion: r.externalizada ? (prev?.fecha_externalizacion || new Date().toISOString()) : null,
                    usuario_id: user?.id || null,
                    notas: r.notas || '',
                    fecha_limite: r.fecha_limite || null,
                    estado: r.estado || 'pendiente',
                    estado_fase: r.estado_fase || 'en_progreso',
                    fecha_listo_entregar: r.fecha_listo_entregar || null,
                    fecha_entregado: r.fecha_entregado || null,
                };
                if (prev) {
                    if (wasExt !== r.externalizada) {
                        historialEntries.push({ fase: faseNom, accion: r.externalizada ? 'externalizada' : 'internalizada', precio_anterior: prevPrecio, precio_nuevo: payload.precio_unitario, proveedor_anterior: prevProv || null, proveedor_nuevo: payload.proveedor_id });
                    }
                    if (r.externalizada && Number(prevPrecio) !== Number(payload.precio_unitario)) {
                        historialEntries.push({ fase: faseNom, accion: 'precio_cambiado', precio_anterior: prevPrecio, precio_nuevo: payload.precio_unitario });
                    }
                    if (r.externalizada && prevProv !== (payload.proveedor_id || '')) {
                        historialEntries.push({ fase: faseNom, accion: 'proveedor_cambiado', proveedor_anterior: prevProv || null, proveedor_nuevo: payload.proveedor_id });
                    }
                    await pb.collection('fases_externalizadas_exclusiva').update(prev.id, payload, { requestKey: `fee-up-${faseNom}` });
                } else {
                    await pb.collection('fases_externalizadas_exclusiva').create(payload, { requestKey: `fee-cr-${faseNom}` });
                    if (r.externalizada) {
                        historialEntries.push({ fase: faseNom, accion: 'externalizada', precio_anterior: 0, precio_nuevo: payload.precio_unitario, proveedor_anterior: null, proveedor_nuevo: payload.proveedor_id });
                    }
                }
            }

            for (let i = 0; i < historialEntries.length; i++) {
                const h = historialEntries[i];
                await pb.collection('historial_fases_externalizadas').create({
                    exclusiva_id: exclusiva.id,
                    fase: h.fase,
                    accion: h.accion,
                    fecha: new Date().toISOString(),
                    usuario_id: user?.id || null,
                    precio_anterior: h.precio_anterior ?? null,
                    precio_nuevo: h.precio_nuevo ?? null,
                    proveedor_anterior: h.proveedor_anterior ?? null,
                    proveedor_nuevo: h.proveedor_nuevo ?? null,
                    notas: '',
                }, { requestKey: `hf-${i}-${h.fase}` }).catch(() => {});
            }

            const newExt = historialEntries.filter(h => h.accion === 'externalizada');
            if (newExt.length > 0) {
                const admins = await pb.collection('users').getFullList({ filter: "rol = 'admin' || rol = 'superadmin' || rol = 'produccio'", requestKey: 'fee-admins' }).catch(() => []);
                const titol = `Fase externalizada en ${exclusiva.exclusiva}`;
                const missatge = `${newExt.map(h => h.fase).join(', ')}${exclusiva.article ? ' · ' + exclusiva.article : ''}`;
                await Promise.all(admins.map((a, i) => pb.collection('notifications').create({
                    destinatari: a.id, tipus: 'fase_externalizada', titol, missatge, link_id: exclusiva.id, llegida: false,
                }, { requestKey: `fee-notif-${i}` }).catch(() => {})));
            }

            setDeletedIds([]);
            setSavedMsg(`${extCount} fase(s) externalizada(s) · Coste total: ${costTotal.toFixed(2)} €`);
            onSaved && onSaved();
        } catch (e) { console.error(e); setError('No se pudieron guardar las fases externalizadas.'); }
        finally { setSaving(false); }
    };

    return (
        <div className="grid gap-4">
            <div className="overflow-auto rounded-lg border border-border">
                <table className="w-full min-w-[1100px] text-sm">
                    <thead className="bg-secondary text-left text-xs uppercase">
                        <tr>
                            <th className="px-3 py-2 font-semibold text-center">Externalizar</th>
                            <th className="px-3 py-2 font-semibold">Nº</th>
                            <th className="px-3 py-2 font-semibold">Fase</th>
                            <th className="px-3 py-2 font-semibold text-right">Precio unit.</th>
                            <th className="px-3 py-2 font-semibold">Proveedor</th>
                            <th className="px-3 py-2 font-semibold">Fecha límite</th>
                            <th className="px-3 py-2 font-semibold">Estado</th>
                            <th className="px-3 py-2 font-semibold">Estado de fase</th>
                            <th className="px-3 py-2 font-semibold">Notas</th>
                            <th className="px-3 py-2 font-semibold text-right">Coste fase</th>
                            <th className="px-3 py-2 font-semibold"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {rows.length === 0 ? (
                            <tr><td colSpan={11} className="p-6 text-center text-muted-foreground">Sin fases. Usa "Agregar fase" para crear una manual.</td></tr>
                        ) : rows.map((r, idx) => (
                            <tr key={r.id || `new-${idx}`} className={r.externalizada ? 'bg-[hsl(var(--accent))]/5' : ''}>
                                <td className="px-3 py-2 text-center">
                                    <input type="checkbox" checked={r.externalizada}
                                        onChange={e => updateRow(idx, { externalizada: e.target.checked })}
                                        className="h-5 w-5 rounded border-input accent-[hsl(var(--accent))]" />
                                </td>
                                <td className="px-3 py-2 tabular-nums text-muted-foreground">{r.numero}</td>
                                <td className="px-3 py-2 font-semibold">
                                    {r.manual || r._new ? (
                                        <input type="text" value={r.fase} onChange={e => updateRow(idx, { fase: e.target.value })}
                                            placeholder="Nombre de fase"
                                            className="h-8 w-full min-w-[140px] rounded-md border border-input bg-background px-2 text-sm font-semibold" />
                                    ) : r.fase}
                                    {r.manual && <span className="ml-1 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">manual</span>}
                                </td>
                                <td className="px-3 py-2 text-right">
                                    <input type="number" step="0.01" value={r.precio} disabled={!r.externalizada}
                                        onChange={e => updateRow(idx, { precio: e.target.value })}
                                        className="h-8 w-24 rounded-md border border-input bg-background px-2 text-right text-sm disabled:bg-secondary/50 disabled:text-muted-foreground" />
                                </td>
                                <td className="px-3 py-2">
                                    <select value={r.proveedor} disabled={!r.externalizada}
                                        onChange={e => updateRow(idx, { proveedor: e.target.value })}
                                        className="h-8 w-full min-w-[140px] rounded-md border border-input bg-background px-2 text-sm disabled:bg-secondary/50 disabled:text-muted-foreground">
                                        <option value="">— Sin proveedor —</option>
                                        {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                                    </select>
                                </td>
                                <td className="px-3 py-2">
                                    <input type="date" value={r.fecha_limite || ''} disabled={!r.externalizada}
                                        onChange={e => updateRow(idx, { fecha_limite: e.target.value })}
                                        className="h-8 w-full min-w-[120px] rounded-md border border-input bg-background px-2 text-sm disabled:bg-secondary/50 disabled:text-muted-foreground" />
                                </td>
                                <td className="px-3 py-2">
                                    <select value={r.estado || 'pendiente'} disabled={!r.externalizada}
                                        onChange={e => updateRow(idx, { estado: e.target.value })}
                                        className="h-8 w-full min-w-[110px] rounded-md border border-input bg-background px-2 text-sm disabled:bg-secondary/50 disabled:text-muted-foreground">
                                        <option value="pendiente">Pendiente</option>
                                        <option value="en_proceso">En proceso</option>
                                        <option value="completada">Completada</option>
                                    </select>
                                </td>
                                <td className="px-3 py-2">
                                    <select value={r.estado_fase || 'en_progreso'} disabled={!r.externalizada}
                                        onChange={e => changeEstadoFase(idx, e.target.value)}
                                        className={`h-8 w-full min-w-[130px] rounded-md border px-2 text-sm font-semibold disabled:bg-secondary/50 disabled:text-muted-foreground ${r.estado_fase === 'entregado' ? 'border-[hsl(var(--ok))]/50 text-[hsl(var(--ok))]' : r.estado_fase === 'listo_para_entregar' ? 'border-[hsl(var(--accent))]/50 text-[hsl(var(--accent))]' : 'border-input'}`}>
                                        <option value="en_progreso">En progreso</option>
                                        <option value="listo_para_entregar">Listo para entregar</option>
                                        <option value="entregado">Entregado</option>
                                    </select>
                                    {r.estado_fase === 'listo_para_entregar' && r.fecha_listo_entregar && (
                                        <p className="mt-0.5 text-[10px] text-muted-foreground">Listo: {fmtDay(r.fecha_listo_entregar)}</p>
                                    )}
                                    {r.estado_fase === 'entregado' && r.fecha_entregado && (
                                        <p className="mt-0.5 text-[10px] text-[hsl(var(--ok))]">Entregado: {fmtDay(r.fecha_entregado)}</p>
                                    )}
                                </td>
                                <td className="px-3 py-2">
                                    <input type="text" value={r.notas} disabled={!r.externalizada}
                                        onChange={e => updateRow(idx, { notas: e.target.value })}
                                        placeholder="—"
                                        className="h-8 w-full min-w-[120px] rounded-md border border-input bg-background px-2 text-sm disabled:bg-secondary/50 disabled:text-muted-foreground" />
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.externalizada ? `${costPerFase(r).toFixed(2)} €` : '—'}</td>
                                <td className="px-3 py-2 text-center">
                                    {(r.manual || r._new) && (
                                        <button onClick={() => removeFase(idx)} className="rounded-md border border-destructive/40 p-1.5 text-destructive hover:bg-destructive/10" aria-label="Eliminar fase">
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <button onClick={addFase}
                className="flex items-center gap-2 self-start rounded-md border border-dashed border-border px-4 h-10 text-sm font-semibold hover:bg-secondary/40">
                <Plus className="h-4 w-4" /> Agregar fase
            </button>

            {/* Cost summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg bg-primary/10 px-3 py-2"><p className="text-xs text-muted-foreground">Fases externalizadas</p><p className="font-display text-xl text-primary">{extCount} / {rows.length}</p></div>
                <div className="rounded-lg bg-[hsl(var(--accent))]/10 px-3 py-2"><p className="text-xs text-muted-foreground">Coste total extern.</p><p className="font-display text-xl text-[hsl(var(--accent))]">{costTotal.toFixed(2)} €</p></div>
                <div className="rounded-lg bg-secondary px-3 py-2"><p className="text-xs text-muted-foreground">Unidades</p><p className="font-display text-xl">{unitats}</p></div>
                <div className="rounded-lg bg-secondary px-3 py-2"><p className="text-xs text-muted-foreground">Coste unit. extern.</p><p className="font-display text-xl">{unitats ? (costTotal / unitats).toFixed(2) : '0.00'} €</p></div>
            </div>

            {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            {savedMsg && (
                <div className="rounded-md bg-[hsl(var(--ok))]/10 px-4 py-3">
                    <p className="text-sm font-semibold text-[hsl(var(--ok))] flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> {savedMsg}</p>
                </div>
            )}

            <div className="flex flex-wrap gap-2">
                <button onClick={guardar} disabled={saving}
                    className="flex items-center gap-2 rounded-md bg-primary px-5 h-11 text-sm font-semibold text-primary-foreground active:scale-95 disabled:opacity-50">
                    <Save className="h-4 w-4" /> {saving ? 'Guardando...' : 'Guardar cambios'}
                </button>
            </div>

            {/* Historial de fases */}
            {historial.length > 0 && (
                <div>
                    <p className="text-sm font-semibold mb-2 flex items-center gap-1.5"><History className="h-4 w-4" /> Historial de cambios</p>
                    <div className="overflow-auto rounded-lg border border-border max-h-[260px]">
                        <table className="w-full min-w-[700px] text-sm">
                            <thead className="bg-secondary text-left text-xs uppercase sticky top-0">
                                <tr>{['Fase', 'Acción', 'Precio ant.', 'Precio nuevo', 'Proveedor ant.', 'Proveedor nuevo', 'Usuario', 'Fecha'].map(h => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {historial.map(h => (
                                    <tr key={h.id}>
                                        <td className="px-3 py-2 font-semibold">{h.fase}</td>
                                        <td className="px-3 py-2"><span className="rounded bg-secondary px-2 py-0.5 text-xs font-semibold uppercase">{(h.accion || '').replace(/_/g, ' ')}</span></td>
                                        <td className="px-3 py-2 tabular-nums text-muted-foreground">{h.precio_anterior != null ? `${Number(h.precio_anterior).toFixed(2)} €` : '—'}</td>
                                        <td className="px-3 py-2 tabular-nums">{h.precio_nuevo != null ? `${Number(h.precio_nuevo).toFixed(2)} €` : '—'}</td>
                                        <td className="px-3 py-2 text-xs text-muted-foreground">{h.expand?.proveedor_anterior?.nombre || '—'}</td>
                                        <td className="px-3 py-2 text-xs">{h.expand?.proveedor_nuevo?.nombre || '—'}</td>
                                        <td className="px-3 py-2 text-xs">{h.expand?.usuario_id?.name || h.expand?.usuario_id?.codi || '—'}</td>
                                        <td className="px-3 py-2 text-xs tabular-nums">{fmtDate(h.fecha)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ─── Screen 2: Exclusiva detail (single view) ────────────────────────────── */
/* ─── Modal: Gestión de fases (admin) ─────────────────────────────────────── */
function GestioFasesModal({ exclusiva, fasesDisponibles, onAdd, onReiniciar, onEditTemps, msg, onClose }) {
    const [faseNom, setFaseNom] = useState('Fase 4');
    const [tempsStd, setTempsStd] = useState('0');
    const [motiu, setMotiu] = useState('');
    const [confirmAdd, setConfirmAdd] = useState(false);
    const [editantFase, setEditantFase] = useState(null); // { fase, tempsStd, motiu, confirm }

    // Fase 4 solo aplica a exclusivas CIK (R84-053 / R84-054). Para el resto,
    // las fases canónicas son Fase 1, 2, 3 y no se ofrece Fase 4.
    const teFase4 = isCikExclusiva(exclusiva);
    const existents = new Set(fasesDisponibles.map((f) => f.fase));
    const suggerides = (teFase4 ? ['Fase 1', 'Fase 2', 'Fase 3', 'Fase 4'] : ['Fase 1', 'Fase 2', 'Fase 3']).filter((f) => !existents.has(f));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3" onClick={onClose}>
            <div className="modal-card w-full max-w-2xl rounded-xl border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="mb-4 flex items-center justify-between gap-2">
                    <h3 className="font-display text-xl uppercase flex items-center gap-2"><Layers className="h-5 w-5" /> Gestión de fases</h3>
                    <button onClick={onClose} className="rounded-md p-1 hover:bg-secondary"><X className="h-5 w-5" /></button>
                </div>

                {msg && (
                    <div className={`mb-3 rounded-md px-3 py-2 text-sm ${msg.startsWith('✓') ? 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]' : 'bg-destructive/10 text-destructive'}`}>{msg}</div>
                )}

                {/* Fases actuales */}
                <div className="mb-5">
                    <p className="text-sm font-semibold mb-2">Fases de la exclusiva ({fasesDisponibles.length})</p>
                    {fasesDisponibles.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-3 text-center">Sin fases configuradas.</p>
                    ) : (
                        <div className="overflow-auto rounded-lg border border-border max-h-48">
                            <table className="w-full text-sm">
                                <thead className="bg-secondary text-left text-xs uppercase"><tr>{['Fase', 'Activa', 'T. estándar (min)', ''].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
                                <tbody className="divide-y divide-border">
                                    {fasesDisponibles.map((f) => {
                                        const isEditant = editantFase?.fase === f.fase;
                                        return (
                                        <tr key={f.fase}>
                                            <td className="px-3 py-2 font-semibold">{f.fase}</td>
                                            <td className="px-3 py-2">{f.activa ? <span className="rounded bg-[hsl(var(--ok))]/15 px-2 py-0.5 text-xs font-semibold text-[hsl(var(--ok))]">Sí</span> : <span className="rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground">No</span>}</td>
                                            <td className="px-3 py-2 tabular-nums">
                                                {isEditant ? (
                                                    <input type="number" min="0" step="0.5" value={editantFase.tempsStd}
                                                        onChange={(e) => setEditantFase((s) => ({ ...s, tempsStd: e.target.value }))}
                                                        className="h-8 w-24 rounded-md border border-input bg-background px-2 text-sm tabular-nums" />
                                                ) : (f.temps_std_min || 0)}
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                {isEditant ? (
                                                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                                                        {!editantFase.confirm ? (
                                                            <>
                                                                <button onClick={() => setEditantFase((s) => ({ ...s, confirm: true }))}
                                                                    className="rounded bg-[hsl(var(--ok))] px-3 h-8 text-xs font-semibold text-white active:scale-95">Guardar</button>
                                                                <button onClick={() => setEditantFase(null)}
                                                                    className="rounded border border-border px-3 h-8 text-xs font-semibold hover:bg-secondary">Cancelar</button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <span className="text-xs text-muted-foreground">¿Confirmar?</span>
                                                                <button onClick={() => { onEditTemps && onEditTemps(editantFase.fase, editantFase.tempsStd, editantFase.motiu); setEditantFase(null); }}
                                                                    className="rounded bg-[hsl(var(--ok))] px-3 h-8 text-xs font-semibold text-white active:scale-95">Sí</button>
                                                                <button onClick={() => setEditantFase((s) => ({ ...s, confirm: false }))}
                                                                    className="rounded border border-border px-3 h-8 text-xs font-semibold hover:bg-secondary">No</button>
                                                            </>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                                                        <button onClick={() => setEditantFase({ fase: f.fase, tempsStd: String(f.temps_std_min || 0), motiu: '', confirm: false })}
                                                            className="rounded border border-primary/50 text-primary px-3 h-8 text-xs font-semibold hover:bg-primary/10">
                                                            <Edit2 className="inline h-3.5 w-3.5 mr-1" /> Tiempo
                                                        </button>
                                                        <button onClick={() => onReiniciar(f.fase)} className="rounded border border-[hsl(var(--warn))]/50 text-[hsl(var(--warn))] px-3 h-8 text-xs font-semibold hover:bg-[hsl(var(--warn))]/10">
                                                            <RefreshCcw className="inline h-3.5 w-3.5 mr-1" /> Reiniciar
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">
                        Reiniciar crea un nuevo ciclo de retrabajo sin borrar los registros, tiempos, pausas, calidad ni retrabajos anteriores. No aprueba la fase ni la deja lista para recoger.
                    </p>
                    {editantFase && (
                        <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-3">
                            <label className="text-xs font-semibold text-muted-foreground">Motivo del cambio de tiempo de {editantFase.fase} (trazabilidad)</label>
                            <input value={editantFase.motiu} onChange={(e) => setEditantFase((s) => ({ ...s, motiu: e.target.value }))}
                                placeholder="Razón para modificar el tiempo estándar…"
                                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
                            <p className="mt-1 text-xs text-muted-foreground">El cambio no altera los tiempos ya registrados en historial, pausas ni retrabajos.</p>
                        </div>
                    )}
                </div>

                {/* Añadir fase */}
                <div className="rounded-lg border border-border p-4">
                    <p className="text-sm font-semibold mb-3 flex items-center gap-1.5"><Plus className="h-4 w-4" /> Añadir una fase</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <label className="text-xs font-semibold text-muted-foreground">Nombre de la fase</label>
                            <input value={faseNom} onChange={(e) => setFaseNom(e.target.value)} placeholder="Fase 4"
                                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
                            {suggerides.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                    {suggerides.map((s) => (
                                        <button key={s} onClick={() => setFaseNom(s)} className="rounded bg-secondary px-2 py-0.5 text-xs font-semibold hover:bg-secondary/70">{s}</button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-muted-foreground">Tiempo estándar (min)</label>
                            <input type="number" min="0" value={tempsStd} onChange={(e) => setTempsStd(e.target.value)}
                                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
                        </div>
                    </div>
                    <div className="mt-3">
                        <label className="text-xs font-semibold text-muted-foreground">Motivo (trazabilidad)</label>
                        <textarea value={motiu} onChange={(e) => setMotiu(e.target.value)} rows={2} placeholder="Razón para añadir esta fase…"
                            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                    </div>
                    {!confirmAdd ? (
                        <button onClick={() => setConfirmAdd(true)} className="mt-3 flex items-center gap-1.5 rounded-md bg-[hsl(var(--accent))] px-4 h-9 text-sm font-semibold text-[hsl(var(--accent-foreground))] active:scale-95">
                            <Plus className="h-4 w-4" /> Añadir fase
                        </button>
                    ) : (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span className="text-sm text-muted-foreground">¿Confirmar añadir <strong>{faseNom}</strong>?</span>
                            <button onClick={() => onAdd(faseNom, tempsStd, motiu)} className="rounded-md bg-[hsl(var(--ok))] px-4 h-9 text-sm font-semibold text-white active:scale-95">Sí, añadir</button>
                            <button onClick={() => setConfirmAdd(false)} className="rounded-md border border-border px-4 h-9 text-sm font-semibold hover:bg-secondary">Cancelar</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ─── Modal: Reiniciar fase (admin) ───────────────────────────────────────── */
function ReiniciarFaseModal({ faseNom, operaris, onConfirm, msg, onClose }) {
    const [operariId, setOperariId] = useState('');
    const [motiu, setMotiu] = useState('');
    const operarisLlista = (operaris || []).filter((o) => o.rol === 'operari' || !o.rol || o.rol === 'produccio');

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3" onClick={onClose}>
            <div className="modal-card w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="mb-4 flex items-center justify-between gap-2">
                    <h3 className="font-display text-xl uppercase flex items-center gap-2"><RefreshCcw className="h-5 w-5 text-[hsl(var(--warn))]" /> Reiniciar {faseNom}</h3>
                    <button onClick={onClose} className="rounded-md p-1 hover:bg-secondary"><X className="h-5 w-5" /></button>
                </div>

                {msg && (
                    <div className={`mb-3 rounded-md px-3 py-2 text-sm ${msg.startsWith('✓') ? 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]' : 'bg-destructive/10 text-destructive'}`}>{msg}</div>
                )}

                <div className="rounded-md bg-[hsl(var(--warn))]/10 px-3 py-2 text-sm text-[hsl(var(--warn))] mb-4">
                    Se creará un nuevo ciclo de retrabajo para <strong>{faseNom}</strong>. Los registros, tiempos, pausas, incidencias, calidad y retrabajos anteriores no se modifican ni se borran. La fase no se aprueba automáticamente ni queda lista para recoger.
                </div>

                <div className="grid gap-3">
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground">Operario asignado al retrabajo</label>
                        <select value={operariId} onChange={(e) => setOperariId(e.target.value)}
                            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                            <option value="">Selecciona un operario…</option>
                            {operarisLlista.map((o) => (
                                <option key={o.id} value={o.id}>{o.name || o.codi || o.id}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground">Motivo del reinicio (trazabilidad)</label>
                        <textarea value={motiu} onChange={(e) => setMotiu(e.target.value)} rows={3} placeholder="Razón para reiniciar esta fase…"
                            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                    </div>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                    <button onClick={onClose} className="rounded-md border border-border px-4 h-9 text-sm font-semibold hover:bg-secondary">Cancelar</button>
                    <button onClick={() => onConfirm(faseNom, operariId, motiu)} className="rounded-md bg-[hsl(var(--warn))] px-4 h-9 text-sm font-semibold text-white active:scale-95">
                        <RefreshCcw className="inline h-4 w-4 mr-1" /> Confirmar reinicio
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ─── Modal: Reactivar fase / Poner a 0 tiempo (admin) ────────────────────── */
/* Crea un nuevo ciclo diferenciado (tipus='reoperacio') sin reabrir silenciosamente
 * el ciclo finalizado. No borra registros históricos ni modifica otras fases.
 * Mantiene separadas las aprobaciones del operario (control_qualitat) y de Calidad. */
function ReactivarFaseModal({ mode, faseNom, monoCodi, operaris, operariInicial, onConfirm, msg, onClose }) {
    const [operariId, setOperariId] = useState(operariInicial || '');
    const [motiu, setMotiu] = useState('');
    const esReset = mode === 'reset';
    const operarisLlista = (operaris || []).filter((o) => o.rol === 'operari' || !o.rol || o.rol === 'produccio');
    const titol = esReset ? `Poner a 0 el tiempo de ${faseNom}` : `Reactivar ${faseNom}`;
    const descripcio = esReset
        ? `Se pondrá a cero el tiempo de trabajo de la unidad ${monoCodi} en ${faseNom} y quedará disponible para empezar de nuevo. El ciclo anterior se congela y se conserva en el historial con sus tiempos, pausas, incidencias y aprobaciones.`
        : `Se reactivará ${faseNom} para la unidad ${monoCodi} creando un nuevo ciclo de trabajo. El ciclo anterior no se borra ni se modifica: queda en el historial. La fase no se aprueba automáticamente ni queda lista para recoger.`;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3" onClick={onClose}>
            <div className="modal-card w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="mb-4 flex items-center justify-between gap-2">
                    <h3 className="font-display text-xl uppercase flex items-center gap-2">
                        {esReset ? <RefreshCcw className="h-5 w-5 text-destructive" /> : <RotateCcw className="h-5 w-5 text-[hsl(var(--warn))]" />}
                        {titol}
                    </h3>
                    <button onClick={onClose} className="rounded-md p-1 hover:bg-secondary"><X className="h-5 w-5" /></button>
                </div>

                {msg && (
                    <div className={`mb-3 rounded-md px-3 py-2 text-sm ${msg.startsWith('✓') ? 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]' : 'bg-destructive/10 text-destructive'}`}>{msg}</div>
                )}

                <div className={`rounded-md px-3 py-2 text-sm mb-4 ${esReset ? 'bg-destructive/10 text-destructive' : 'bg-[hsl(var(--warn))]/10 text-[hsl(var(--warn))]'}`}>
                    {descripcio}
                </div>

                <div className="grid gap-3">
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground">Operario que retomará la fase</label>
                        <select value={operariId} onChange={(e) => setOperariId(e.target.value)}
                            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                            <option value="">Selecciona un operario…</option>
                            {operarisLlista.map((o) => (
                                <option key={o.id} value={o.id}>{o.name || o.codi || o.id}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-muted-foreground">Motivo (trazabilidad) *</label>
                        <textarea value={motiu} onChange={(e) => setMotiu(e.target.value)} rows={3}
                            placeholder={esReset ? 'Razón para resetear el tiempo a cero…' : 'Razón para reactivar la fase…'}
                            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                    </div>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                    <button onClick={onClose} className="rounded-md border border-border px-4 h-9 text-sm font-semibold hover:bg-secondary">Cancelar</button>
                    <button onClick={() => onConfirm(faseNom, operariId, motiu)} disabled={!operariId || !motiu.trim()}
                        className={`rounded-md px-4 h-9 text-sm font-semibold text-white active:scale-95 disabled:opacity-50 ${esReset ? 'bg-destructive' : 'bg-[hsl(var(--warn))]'}`}>
                        {esReset ? <><RefreshCcw className="inline h-4 w-4 mr-1" /> Confirmar reset</> : <><RotateCcw className="inline h-4 w-4 mr-1" /> Confirmar reactivación</>}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ─── Sección: Progreso de fases y operaciones por unidad ─────────────────── */
/* Muestra cada fase configurada con su estado real por unidad (pendiente, en
 * marcha, pausada, terminada o en retrabajo), el operario relacionado, y los
 * tiempos productivo / parada / total (sin contar pausas como productivo ni
 * duplicar por recargas/realtime/pausas/reanudaciones). Permite a roles
 * autorizados reactivar una fase terminada/pausada o poner a 0 el tiempo de un
 * operario para esa fase, creando un nuevo ciclo diferenciado. */
const FASE_ESTAT = {
    pendiente: { label: 'Pendiente', cls: 'bg-secondary text-muted-foreground' },
    en_marxa: { label: 'En marcha', cls: 'bg-[hsl(var(--warn))]/20 text-[hsl(var(--warn))]' },
    pausada: { label: 'Pausada', cls: 'bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))]' },
    terminada: { label: 'Terminada', cls: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]' },
    retrabajo: { label: 'En retrabajo', cls: 'bg-destructive/15 text-destructive' },
};

function ProgresoFasesOperaciones({ monos, registres, fasesDisponibles, operaris, nowTick, canEdit, onReactivar, onResetTemps }) {
    // Map operari id → nombre para mostrar
    const operariNom = useCallback((id) => {
        if (!id) return '—';
        const o = operaris.find((x) => x.id === id);
        return o?.name || o?.codi || id;
    }, [operaris]);

    // Para cada fase, agrupar registres por mono y tomar el más reciente.
    const files = useMemo(() => {
        const rows = [];
        fasesDisponibles.forEach((f) => {
            const faseNom = f.fase;
            monos.forEach((m) => {
                const regs = registres
                    .filter((r) => r.operacio === faseNom && r.mono === m.id)
                    .sort((a, b) => new Date(a.created || a.inici) - new Date(b.created || b.inici));
                const latest = regs[regs.length - 1] || null;
                let estatKey = 'pendiente';
                if (latest) {
                    if (latest.retreball) estatKey = 'retrabajo';
                    else if (latest.estat === 'en_curs') estatKey = 'en_marxa';
                    else if (latest.estat === 'pausat') estatKey = 'pausada';
                    else if (latest.estat === 'finalitzat') estatKey = 'terminada';
                }
                const prod = latest ? segonsRegistre(latest, nowTick) : 0;
                const parada = latest ? segonsParadaRegistre(latest, nowTick) : 0;
                const total = prod + parada;
                rows.push({
                    faseNom, mono: m, latest, estatKey,
                    operariId: latest?.operari || null,
                    operari: latest?.expand?.operari?.name || latest?.expand?.operari?.codi || (latest?.operari ? operariNom(latest.operari) : '—'),
                    prod, parada, total,
                    teTemps: prod > 0 || parada > 0,
                    ciclos: regs.length,
                });
            });
        });
        return rows;
    }, [fasesDisponibles, monos, registres, nowTick, operariNom]);

    // Resumen por fase (estado agregado)
    const resumPerFase = useMemo(() => {
        const map = new Map();
        fasesDisponibles.forEach((f) => map.set(f.fase, { fase: f.fase, temps_std_min: f.temps_std_min, en_marxa: 0, pausades: 0, terminades: 0, pendents: 0, retrabajo: 0, prod: 0, parada: 0 }));
        files.forEach((r) => {
            const e = map.get(r.faseNom);
            if (!e) return;
            e[r.estatKey === 'en_marxa' ? 'en_marxa' : r.estatKey === 'pausada' ? 'pausades' : r.estatKey === 'terminada' ? 'terminades' : r.estatKey === 'retrabajo' ? 'retrabajo' : 'pendents'] += 1;
            e.prod += r.prod; e.parada += r.parada;
        });
        return Array.from(map.values());
    }, [fasesDisponibles, files]);

    if (monos.length === 0) {
        return (
            <section className="rounded-xl border border-border bg-card p-5">
                <h3 className="font-display text-xl uppercase mb-4 flex items-center gap-2"><Layers className="h-5 w-5" /> Progreso de fases y operaciones</h3>
                <p className="text-sm text-muted-foreground py-4 text-center">Esta exclusiva no tiene unidades generadas.</p>
            </section>
        );
    }

    return (
        <section className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-display text-xl uppercase mb-2 flex items-center gap-2"><Layers className="h-5 w-5" /> Progreso de fases y operaciones</h3>
            <p className="text-xs text-muted-foreground mb-4">
                Estado real de cada fase por unidad, con tiempos productivo (sin pausas), parada y total. Reactivar o poner a 0 crea un nuevo ciclo sin borrar el historial.
            </p>

            {/* Resumen por fase */}
            <div className="grid gap-3 mb-5">
                {resumPerFase.map((f) => (
                    <div key={f.fase} className="rounded-lg border border-border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <p className="font-display text-lg uppercase">{f.fase}</p>
                            <span className="text-xs text-muted-foreground">T. estándar: {f.temps_std_min || 0} min</span>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                            <span className="rounded bg-secondary px-2 py-1 font-semibold">{f.pendents} pend.</span>
                            <span className="rounded bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))] px-2 py-1 font-semibold">{f.en_marxa} en marcha</span>
                            <span className="rounded bg-[hsl(var(--warn))]/10 text-[hsl(var(--warn))] px-2 py-1 font-semibold">{f.pausades} paus.</span>
                            <span className="rounded bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))] px-2 py-1 font-semibold">{f.terminades} term.</span>
                            {f.retrabajo > 0 && <span className="rounded bg-destructive/15 text-destructive px-2 py-1 font-semibold">{f.retrabajo} retrab.</span>}
                            <span className="ml-auto rounded bg-primary/10 text-primary px-2 py-1 font-semibold tabular-nums">Prod: {formatSegons(f.prod)} · Parada: {formatSegons(f.parada)}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Tabla detallada por unidad */}
            <div className="overflow-auto rounded-lg border border-border">
                <table className="w-full min-w-[820px] text-sm">
                    <thead className="bg-secondary text-left text-xs uppercase">
                        <tr>{['Fase','Unidad','Operario','Estado','T. productivo','T. parada','T. total','Ciclos','Acciones'].map(h => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {files.map((r, i) => {
                            const est = FASE_ESTAT[r.estatKey] || FASE_ESTAT.pendiente;
                            const potReactivar = canEdit && (r.estatKey === 'terminada' || r.estatKey === 'pausada');
                            const potReset = canEdit && r.teTemps;
                            return (
                                <tr key={`${r.faseNom}-${r.mono.id}-${i}`} className={r.estatKey === 'en_marxa' ? 'bg-[hsl(var(--warn))]/5' : r.estatKey === 'terminada' ? 'bg-[hsl(var(--ok))]/3' : ''}>
                                    <td className="px-3 py-2 font-semibold">{r.faseNom}</td>
                                    <td className="px-3 py-2 font-mono text-xs">{r.mono.codi || `#${r.mono.numero}`}</td>
                                    <td className="px-3 py-2 text-xs">{r.operari}</td>
                                    <td className="px-3 py-2"><span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${est.cls}`}>{est.label}</span></td>
                                    <td className="px-3 py-2 tabular-nums">{formatSegons(r.prod)}</td>
                                    <td className="px-3 py-2 tabular-nums text-[hsl(var(--warn))]">{formatSegons(r.parada)}</td>
                                    <td className="px-3 py-2 tabular-nums font-semibold">{formatSegons(r.total)}</td>
                                    <td className="px-3 py-2 tabular-nums text-xs text-muted-foreground">{r.ciclos}</td>
                                    <td className="px-3 py-2">
                                        <div className="flex flex-wrap gap-1.5">
                                            <button onClick={() => onReactivar(r.faseNom, r.mono, r.operariId)}
                                                disabled={!potReactivar}
                                                className="rounded border border-[hsl(var(--warn))]/50 text-[hsl(var(--warn))] px-2.5 h-8 text-xs font-semibold hover:bg-[hsl(var(--warn))]/10 active:scale-95 disabled:opacity-30 disabled:hover:bg-transparent">
                                                <RotateCcw className="inline h-3.5 w-3.5 mr-1" /> Reactivar
                                            </button>
                                            <button onClick={() => onResetTemps(r.faseNom, r.mono, r.operariId)}
                                                disabled={!potReset}
                                                className="rounded border border-destructive/50 text-destructive px-2.5 h-8 text-xs font-semibold hover:bg-destructive/10 active:scale-95 disabled:opacity-30 disabled:hover:bg-transparent">
                                                <RefreshCcw className="inline h-3.5 w-3.5 mr-1" /> Poner a 0
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

export function DetallExclusiva({ exclusiva, onBack, onSelectMono, soloLectura = false }) {
    const { user, rol } = useAuth();
    const canEdit = !soloLectura && (rol === 'admin' || rol === 'superadmin' || rol === 'produccio');
    const [monos, setMonos] = useState([]);
    const [registres, setRegistres] = useState([]);
    const [opsDef, setOpsDef] = useState([]);
    const [controls, setControls] = useState([]);
    const [retrabajos, setRetrabajos] = useState([]);
    const [rutes, setRutes] = useState([]);
    const [operaris, setOperaris] = useState([]);
    const [fasesExt, setFasesExt] = useState([]);
    const [mensajes, setMensajes] = useState([]);
    const [proveedores, setProveedores] = useState([]);
    const [fasesArt, setFasesArt] = useState([]);
    const [fasesExtExcl, setFasesExtExcl] = useState([]);
    const [historialFases, setHistorialFases] = useState([]);
    const [propuestas, setPropuestas] = useState([]);
    const [respuestasProp, setRespuestasProp] = useState([]);
    const [tiemposEx, setTiemposEx] = useState([]);
    const [noConformitats, setNoConformitats] = useState([]);
    const [historialCambios, setHistorialCambios] = useState([]);
    const [historialPausas, setHistorialPausas] = useState([]);
    const [carregant, setCarregant] = useState(true);
    const [showMsg, setShowMsg] = useState(false);
    const [showAnadirOp, setShowAnadirOp] = useState(false);
    const [showPropagarOp, setShowPropagarOp] = useState(false);
    const [showGestioFases, setShowGestioFases] = useState(false);
    const [showReiniciarFase, setShowReiniciarFase] = useState(null); // faseNom | null
    const [showReactivarFase, setShowReactivarFase] = useState(null); // { mode, faseNom, mono, operariId } | null
    const [faseAccioMsg, setFaseAccioMsg] = useState('');
    const [estatFil, setEstatFil] = useState('tots');
    const [faseFil, setFaseFil] = useState('totes');
    const [nowTick, setNowTick] = useState(() => Date.now());
    const monoIdsRef = useRef(new Set());
    const exId = exclusiva.id;

    const carrega = useCallback(async (opts = {}) => {
        const silent = !!opts.silent;
        if (!silent) setCarregant(true);
        try {
            const [ms, ru, arts] = await Promise.all([
                pb.collection('monos').getFullList({ filter: `exclusiva = "${exId}"`, sort: 'numero', requestKey: `detall-monos-${exId}` }),
                pb.collection('rutes').getFullList({ requestKey: `detall-rutes-${exId}` }),
                pb.collection('articles').getFullList({ expand: 'ruta', requestKey: `detall-arts-${exId}` }).catch(() => []),
            ]);
            const monoIds = ms.map((m) => m.id);
            monoIdsRef.current = new Set(monoIds);

            let regsFilter = `exclusiva = "${exId}"`;
            if (monoIds.length > 0) {
                const monoOr = monoIds.map((id) => `mono = "${id}"`).join(' || ');
                regsFilter = `(exclusiva = "${exId}" || ${monoOr})`;
            }

            const resolved = resolveRutaExclusiva(exclusiva, ru, arts);
            const rutaId = resolved.rutaId
                || (typeof exclusiva.ruta === 'string' ? exclusiva.ruta : exclusiva.ruta?.id)
                || exclusiva.expand?.ruta?.id
                || null;

            const [
                rs, us, cq, rt, fe, msg, prov, fa, fee, hf, props, tiempos, ncs, ops, hp,
            ] = await Promise.all([
                pb.collection('registres').getFullList({ filter: regsFilter, sort: '-created', expand: 'operari,mono', requestKey: `detall-regs-${exId}` }),
                pb.collection('users').getFullList({ requestKey: `detall-us-${exId}` }),
                pb.collection('controles_qualitat').getFullList({ filter: `exclusiva = "${exId}"`, expand: 'operari,mono', requestKey: `detall-cq-${exId}` }).catch(() => []),
                pb.collection('retrabajos').getFullList({ filter: `exclusiva = "${exId}"`, expand: 'operario_asignado,creado_por,usuario_inicio,usuario_completado,usuario_aprobacion', requestKey: `detall-rt-${exId}` }).catch(() => []),
                pb.collection('fases_externalizadas').getFullList({ filter: `exclusiva = "${exId}"`, requestKey: `detall-fe-${exId}` }).catch(() => []),
                pb.collection('mensajes_exclusiva').getFullList({ filter: `exclusiva = "${exId}"`, sort: '-created', expand: 'remitente,destinatario', requestKey: `detall-msg-${exId}` }).catch(() => []),
                pb.collection('proveedores').getFullList({ requestKey: `detall-prov-${exId}` }).catch(() => []),
                pb.collection('fases_articulo').getFullList({ requestKey: `detall-fa-${exId}` }).catch(() => []),
                pb.collection('fases_externalizadas_exclusiva').getFullList({ filter: `exclusiva_id = "${exId}"`, requestKey: `detall-fee-${exId}` }).catch(() => []),
                pb.collection('historial_fases_externalizadas').getFullList({ filter: `exclusiva_id = "${exId}"`, sort: '-created', expand: 'usuario_id,proveedor_anterior,proveedor_nuevo', requestKey: `detall-hf-${exId}` }).catch(() => []),
                pb.collection('propuestas_mejora').getFullList({ filter: `exclusiva_id = "${exId}"`, sort: '-created', expand: 'usuario_reporto', requestKey: `detall-prop-${exId}` }).catch(() => []),
                pb.collection('tiempos_exclusiva').getFullList({
                    filter: `exclusiva_id = "${exId}" || exclusiva = "${exId}"`,
                    sort: '-created', expand: 'usuario_id', requestKey: `detall-tiempo-${exId}`,
                }).catch(() => []),
                pb.collection('no_conformitats').getFullList({ filter: `exclusiva = "${exId}"`, sort: '-created', expand: 'operari_que_detecto', requestKey: `detall-nc-${exId}` }).catch(() => []),
                rutaId
                    ? pb.collection('operacions_def').getFullList({ filter: `ruta = "${rutaId}"`, sort: 'ordre', requestKey: `detall-opsdef-${exId}` }).catch(() => [])
                    : Promise.resolve([]),
                pb.collection('historial_pausas').getFullList({ filter: `exclusiva = "${exId}"`, sort: '-created', expand: 'operari,mono', requestKey: `detall-hp-${exId}` }).catch(() => []),
            ]);

            pb.collection('historial_cambios_exclusivas').getFullList({
                filter: `exclusiva_id = "${exId}"`, sort: '-created', expand: 'usuario_id', requestKey: `detall-hce-${exId}`,
            }).then(setHistorialCambios).catch(() => setHistorialCambios([]));

            setMonos(ms); setRegistres(rs); setRutes(ru); setOperaris(us);
            setControls(cq || []); setRetrabajos(rt || []); setFasesExt(fe || []);
            setMensajes(msg || []); setOpsDef(ops || []);
            setProveedores(prov || []); setFasesArt(fa || []);
            setFasesExtExcl(fee || []); setHistorialFases(hf || []);
            setPropuestas(props || []); setTiemposEx(tiempos || []);
            setNoConformitats(ncs || []);
            setHistorialPausas(hp || []);
            setNowTick(Date.now());

            if (props && props.length > 0) {
                const propIds = props.map((p) => `"${p.id}"`).join(' || ');
                pb.collection('respuestas_propuestas').getFullList({
                    filter: `propuesta_id = (${propIds})`,
                    sort: '-created', expand: 'responsable_id,usuario_id',
                    requestKey: `detall-resp-${exId}`,
                }).then(setRespuestasProp).catch(() => setRespuestasProp([]));
            } else { setRespuestasProp([]); }
        } finally { if (!silent) setCarregant(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- exclusiva fields used via resolveRutaExclusiva
    }, [exId, exclusiva?.ruta, exclusiva?.referencia, exclusiva?.article]);

    useEffect(() => { carrega(); }, [carrega]);

    // Live tick while there are active operations (en_curs)
    useEffect(() => {
        const hasLive = registres.some((r) => r.estat === 'en_curs');
        if (!hasLive) return undefined;
        const id = setInterval(() => setNowTick(Date.now()), 1000);
        return () => clearInterval(id);
    }, [registres]);

    // Realtime: keep times / states fresh without full page reload
    useEffect(() => {
        const belongs = (rec) => {
            if (!rec) return false;
            const exRaw = rec.exclusiva || rec.exclusiva_id || rec.expand?.exclusiva?.id;
            const ex = typeof exRaw === 'string' ? exRaw : exRaw?.id;
            if (ex === exId) return true;
            const monoRaw = rec.mono || rec.expand?.mono?.id;
            const mono = typeof monoRaw === 'string' ? monoRaw : monoRaw?.id;
            return !!(mono && monoIdsRef.current.has(mono));
        };

        const onReg = (e) => {
            const rec = e.record;
            if (!belongs(rec) && e.action !== 'delete') return;
            setRegistres((prev) => {
                if (e.action === 'delete') return prev.filter((x) => x.id !== rec.id);
                if (!belongs(rec)) return prev;
                return upsertById(prev, rec);
            });
            setNowTick(Date.now());
        };
        const onMono = (e) => {
            const rec = e.record;
            const ex = typeof rec.exclusiva === 'string' ? rec.exclusiva : rec.exclusiva?.id;
            if (ex !== exId && e.action !== 'delete') return;
            setMonos((prev) => {
                if (e.action === 'delete') {
                    monoIdsRef.current.delete(rec.id);
                    return prev.filter((x) => x.id !== rec.id);
                }
                monoIdsRef.current.add(rec.id);
                return upsertById(prev, rec).sort((a, b) => (a.numero || 0) - (b.numero || 0));
            });
        };
        const onCq = (e) => {
            const rec = e.record;
            if (!belongs(rec) && e.action !== 'delete') return;
            setControls((prev) => {
                if (e.action === 'delete') return prev.filter((x) => x.id !== rec.id);
                return upsertById(prev, rec);
            });
        };
        const onRt = (e) => {
            const rec = e.record;
            if (!belongs(rec) && e.action !== 'delete') return;
            setRetrabajos((prev) => {
                if (e.action === 'delete') return prev.filter((x) => x.id !== rec.id);
                return upsertById(prev, rec);
            });
        };
        const onTiempo = (e) => {
            const rec = e.record;
            if (!belongs(rec) && e.action !== 'delete') return;
            setTiemposEx((prev) => {
                if (e.action === 'delete') return prev.filter((x) => x.id !== rec.id);
                return upsertById(prev, rec);
            });
        };

        void pb.collection('registres').subscribe('*', onReg).catch(() => {});
        void pb.collection('monos').subscribe('*', onMono).catch(() => {});
        void pb.collection('controles_qualitat').subscribe('*', onCq).catch(() => {});
        void pb.collection('retrabajos').subscribe('*', onRt).catch(() => {});
        void pb.collection('tiempos_exclusiva').subscribe('*', onTiempo).catch(() => {});

        return () => {
            void pb.collection('registres').unsubscribe('*').catch(() => {});
            void pb.collection('monos').unsubscribe('*').catch(() => {});
            void pb.collection('controles_qualitat').unsubscribe('*').catch(() => {});
            void pb.collection('retrabajos').unsubscribe('*').catch(() => {});
            void pb.collection('tiempos_exclusiva').unsubscribe('*').catch(() => {});
        };
    }, [exId]);

    // ── Derived data ──
    const opsByNom = useMemo(() => { const m = {}; opsDef.forEach(op => { if (op.nom) m[op.nom] = op; }); return m; }, [opsDef]);
    const fases = useMemo(() => Array.from(new Set(opsDef.map(op => op.fase).filter(Boolean))).sort(), [opsDef]);

    // Tiempos netos (en_curs se actualiza con nowTick; sin duplicar pausas/reanudaciones)
    const tempsOperacio = useMemo(() => registres
        .filter((r) => !r.retreball && (r.estat === 'finalitzat' || r.estat === 'en_curs' || r.estat === 'pausat'))
        .reduce((a, r) => a + segonsRegistre(r, nowTick), 0), [registres, nowTick]);
    const tempsQualitat = useMemo(() => {
        const fromControls = controls.reduce((a, c) => a + Number(c.temps_inspeccio_seg || c.tiempo_qc_total_seg || 0), 0);
        const fromTiempos = tiemposEx
            .filter((t) => t.tipo === 'calidad')
            .reduce((a, t) => a + Number(t.tiempo_segundos || t.tiempo_seg || (Number(t.tiempo_minutos) || 0) * 60 || 0), 0);
        return Math.max(fromControls, fromTiempos);
    }, [controls, tiemposEx]);
    const tempsRetrabajo = useMemo(() => {
        const fromRt = retrabajos.reduce((a, r) => a + Number(r.tiempo_retrabajo_seg || r.tiempo_real_seg || 0), 0);
        const fromRegs = registres
            .filter((r) => r.retreball && (r.estat === 'finalitzat' || r.estat === 'en_curs' || r.estat === 'pausat'))
            .reduce((a, r) => a + segonsRegistre(r, nowTick), 0);
        const fromTiempos = tiemposEx
            .filter((t) => t.tipo === 'retrabajo')
            .reduce((a, t) => a + Number(t.tiempo_segundos || t.tiempo_seg || (Number(t.tiempo_minutos) || 0) * 60 || 0), 0);
        return Math.max(fromRt, fromRegs, fromTiempos);
    }, [retrabajos, registres, tiemposEx, nowTick]);
    const tempsTotal = tempsOperacio + tempsQualitat + tempsRetrabajo;

    // Tiempos por fase (todas las fases de la ruta + datos reales)
    const tempsPerFase = useMemo(() => {
        const map = new Map();
        // Seed all route phases so none stay hidden/blocked in the detail view
        fases.forEach((f) => map.set(f, { fase: f, temps: 0, n: 0 }));
        registres
            .filter((r) => r.estat === 'finalitzat' || r.estat === 'en_curs' || r.estat === 'pausat')
            .forEach((r) => {
                const fase = opsByNom[r.operacio]?.fase || (r.tipus === 'lliure' ? 'Trabajo libre' : 'Sin fase');
                const e = map.get(fase) || { fase, temps: 0, n: 0 };
                e.temps += segonsRegistre(r, nowTick);
                e.n += 1;
                map.set(fase, e);
            });
        return Array.from(map.values()).map((e) => ({ ...e, min: Math.round(e.temps / 60) }));
    }, [registres, opsByNom, fases, nowTick]);

    // Tiempos por operación (chart)
    const tempsPerOpChart = useMemo(() => {
        const map = new Map();
        registres
            .filter((r) => r.estat === 'finalitzat' || r.estat === 'en_curs' || r.estat === 'pausat')
            .forEach((r) => {
                const k = r.operacio || (r.tipus === 'lliure' ? 'Trabajo libre' : '—');
                const e = map.get(k) || { op: k.length > 14 ? `${k.slice(0, 12)}…` : k, temps: 0, n: 0 };
                e.temps += segonsRegistre(r, nowTick);
                e.n += 1;
                map.set(k, e);
            });
        return Array.from(map.values()).map((e) => ({ op: e.op, min: Math.round(e.temps / 60), n: e.n })).sort((a, b) => b.min - a.min).slice(0, 15);
    }, [registres, nowTick]);

    // Incidencias
    const incidencies = useMemo(() => {
        const list = [];
        registres.forEach(r => (r.incidencies || []).forEach(i => list.push({ ...i, operacio: r.operacio, operari: r.expand?.operari?.name || r.expand?.operari?.codi || '—', data: r.inici, origen: 'operacion' })));
        return list;
    }, [registres]);

    const incidenciesTipus = useMemo(() => {
        const map = new Map();
        incidencies.forEach(i => { const k = i.tipus || 'Otra'; map.set(k, (map.get(k) || 0) + 1); });
        return Array.from(map.entries()).map(([tipus, count]) => ({ tipus, count })).sort((a,b) => b.count - a.count);
    }, [incidencies]);

    // Historial: who worked, when, how long
    const historial = useMemo(() => registres
        .filter((r) => r.estat === 'finalitzat' || r.estat === 'en_curs' || r.estat === 'pausat')
        .map((r) => ({
            operari: r.expand?.operari?.name || r.expand?.operari?.codi || '—',
            operacio: r.operacio || '—',
            fase: opsByNom[r.operacio]?.fase || (r.tipus === 'lliure' ? 'Trabajo libre' : '—'),
            inici: r.inici, fi: r.fi,
            temps: segonsRegistre(r, nowTick),
            incidencies: (r.incidencies || []).length,
            qc: r.control_qualitat || 'pendent',
            retreball: !!r.retreball,
            tipus: r.tipus || 'ruta',
            descripcio: r.notes || '',
            estat: r.estat,
            causaInactivitat: r.motiu_pausa_inactivitat || '',
            inactivitat: !!r.inactivitat_detectada,
        }))
        .sort((a, b) => new Date(b.inici) - new Date(a.inici)), [registres, opsByNom, nowTick]);

    // Operarios que trabajaron
    const operarisTreball = useMemo(() => {
        const map = new Map();
        historial.forEach(h => {
            const e = map.get(h.operari) || { nom: h.operari, ops: 0, temps: 0, incidencies: 0 };
            e.ops += 1; e.temps += h.temps; e.incidencies += h.incidencies;
            map.set(h.operari, e);
        });
        return Array.from(map.values()).sort((a,b) => b.temps - a.temps);
    }, [historial]);

    // Estado derivado
    const estatDerivat = useMemo(() => {
        if (exclusiva.estat === 'entregada') return 'Entregada';
        if (exclusiva.estat === 'finalitzada') return 'Completada';
        if (controls.some(c => c.resultat && !['ok','aprovat','pendent'].includes(c.resultat))) return 'En control de calidad';
        if (registres.some(r => r.estat === 'en_curs' || r.estat === 'pausat')) return 'En proceso';
        if (monos.length > 0) return 'En cola';
        return 'Pendiente';
    }, [exclusiva, controls, registres, monos]);

    const monosAmbProgres = useMemo(() => monos.map(m => {
        const mRegs = registres.filter(r => r.mono === m.id);
        const completades = mRegs.filter(r => r.estat === 'finalitzat' && r.control_qualitat === 'ok').length;
        const inc = mRegs.reduce((a, r) => a + (r.incidencies?.length || 0), 0);
        const retreball = mRegs.filter(r => r.retreball).length;
        const faseActual = m.operacio_actual ? (opsByNom[m.operacio_actual]?.fase || null) : null;
        return { ...m, completades, incidencies: inc, retreball, faseActual };
    }), [monos, registres, opsByNom]);

    const monosFiltrats = useMemo(() => monosAmbProgres.filter(m => {
        if (estatFil === 'amb_incidencies') { if (m.incidencies === 0) return false; }
        else if (estatFil !== 'tots' && m.estat !== estatFil) return false;
        if (faseFil !== 'totes' && m.faseActual !== faseFil) return false;
        return true;
    }), [monosAmbProgres, estatFil, faseFil]);

    const info = [
        ['Número exclusiva', exclusiva.exclusiva],
        ['Referencia', exclusiva.referencia || '—'],
        ['Artículo', exclusiva.article || '—'],
        ['Marca', exclusiva.marca || '—'],
        ['Cliente', exclusiva.cliente || '—'],
        ['Unidades', exclusiva.unitats || '—'],
        ['Fecha recepción', exclusiva.data_real_recepcio || exclusiva.data_prevista_recepcio || '—'],
        ['Fecha entrega', exclusiva.data_entrega || '—'],
        ['Prioridad', exclusiva.prioritat || 'normal'],
        ['Estado', exclusiva.estat || '—'],
        ['Min. previstos', exclusiva.minuts_previstos ? `${exclusiva.minuts_previstos} min` : '—'],
        ['Ruta', rutes.find(r => r.id === exclusiva.ruta)?.nom || 'Sin ruta'],
        ['Fases externalizadas', fasesExtExcl.filter(f => f.externalizada).length > 0 ? `${fasesExtExcl.filter(f => f.externalizada).length} fase(s)` : 'No'],
        ['Observaciones', exclusiva.observacions || '—'],
    ];

    // Fases externalizadas: derived from route ops grouped by fase + article defaults + per-exclusiva overrides
    const fasesArticleDefaults = useMemo(() => {
        const byNom = new Map();
        fasesArt.filter(fa => fa.articulo === exclusiva.article).forEach(fa => byNom.set(fa.nombre_fase, fa));
        return byNom;
    }, [fasesArt, exclusiva.article]);

    const fasesLlista = useMemo(() => {
        const seen = new Map();
        opsDef.forEach(op => {
            if (!op.fase) return;
            const e = seen.get(op.fase) || { fase: op.fase, ops: [], tempsSeg: 0, ordre: op.fase_ordre ?? 99 };
            e.ops.push(op);
            e.tempsSeg += Number(op.temps_std_min || 0) * 60;
            if (op.fase_ordre != null) e.ordre = Math.min(e.ordre, op.fase_ordre);
            seen.set(op.fase, e);
        });
        const routeFases = [...seen.entries()].sort((a, b) => a[1].ordre - b[1].ordre).map(([fase, e], i) => {
            const def = fasesArticleDefaults.get(fase);
            const ext = fasesExtExcl.find(fe => fe.fase === fase);
            return {
                fase,
                numero: i + 1,
                descripcion: def?.descripcion || e.ops.map(o => o.descripcio).filter(Boolean).join(' · ').slice(0, 200),
                tiempoEstimadoSeg: def?.tiempo_estimado_seg || e.tempsSeg,
                externalizada: ext?.externalizada || false,
                precio: ext?.precio_unitario ?? def?.precio_unitario ?? 0,
                proveedor: ext?.proveedor_id || def?.proveedor_id || '',
                notas: ext?.notas || '',
                fecha_limite: ext?.fecha_limite || '',
                estado: ext?.estado || 'pendiente',
                estado_fase: ext?.estado_fase || 'en_progreso',
                fecha_listo_entregar: ext?.fecha_listo_entregar || '',
                fecha_entregado: ext?.fecha_entregado || '',
                id: ext?.id || null,
                manual: false,
            };
        });
        // Append manual fases (stored records whose fase doesn't match any route fase)
        const routeFaseNoms = new Set(routeFases.map(f => f.fase));
        const manuals = fasesExtExcl
            .filter(fe => !routeFaseNoms.has(fe.fase))
            .map((fe, i) => ({
                fase: fe.nombre_fase || fe.fase,
                numero: routeFases.length + i + 1,
                descripcion: '',
                tiempoEstimadoSeg: 0,
                externalizada: fe.externalizada || false,
                precio: fe.precio_unitario ?? 0,
                proveedor: fe.proveedor_id || '',
                notas: fe.notas || '',
                fecha_limite: fe.fecha_limite || '',
                estado: fe.estado || 'pendiente',
                estado_fase: fe.estado_fase || 'en_progreso',
                fecha_listo_entregar: fe.fecha_listo_entregar || '',
                fecha_entregado: fe.fecha_entregado || '',
                id: fe.id,
                manual: true,
            }));
        return [...routeFases, ...manuals];
    }, [opsDef, fasesArticleDefaults, fasesExtExcl]);

    const costExtTotal = useMemo(() => {
        const u = Number(exclusiva.unitats) || 0;
        return fasesLlista.filter(f => f.externalizada).reduce((a, f) => a + (Number(f.precio) || 0) * u, 0);
    }, [fasesLlista, exclusiva.unitats]);

    // ── Fases disponibles para la exclusiva (ruta + artículo + exclusiva) ──
    const parseFasesConfig = (raw) => {
        let arr = [];
        if (Array.isArray(raw)) arr = raw;
        else if (typeof raw === 'string' && raw.trim()) {
            try { arr = JSON.parse(raw); } catch { arr = []; }
        }
        return Array.isArray(arr) ? arr.filter((c) => c && c.fase) : [];
    };
    const fasesConfigExclusiva = useMemo(() => parseFasesConfig(exclusiva.fases_config), [exclusiva.fases_config]);
    const fasesDisponibles = useMemo(() => {
        // Fases canónicas según el artículo: 3 base, 4 solo para CIK
        // (R84-053 / R84-054). Siempre disponibles Fase 1, 2, 3.
        const expected = expectedFasesForExclusiva(exclusiva);
        const expectedSet = new Set(expected);
        const seen = new Map();
        const canon = (f) => canonFaseUtil(f);
        for (const c of fasesConfigExclusiva) {
            const key = canon(c.fase);
            if (expectedSet.has(key)) seen.set(key, { fase: key, activa: c.activa !== false, temps_std_min: Number(c.temps_std_min) || 0 });
        }
        for (const f of fasesLlista) {
            const key = canon(f.fase);
            if (expectedSet.has(key) && !seen.has(key)) seen.set(key, { fase: key, activa: true, temps_std_min: Math.round((f.tiempoEstimadoSeg || 0) / 60) });
        }
        return expected
            .map((f) => seen.get(f) || { fase: f, activa: true, temps_std_min: 0 })
            .sort((a, b) => {
                const ma = String(a.fase).match(/fase\s*(\d+)/i); const mb = String(b.fase).match(/fase\s*(\d+)/i);
                return (ma ? Number(ma[1]) : 99) - (mb ? Number(mb[1]) : 99);
            });
    }, [fasesConfigExclusiva, fasesLlista, exclusiva]);

    // ── Añadir fase a la exclusiva (fases_config) ──
    const afegirFase = async (faseNom, tempsStdMin, motiu) => {
        const canon = (f) => {
            const m = String(f || '').match(/fase\s*(\d+)/i);
            const n = m ? Number(m[1]) : null;
            return n >= 1 && n <= 4 ? `Fase ${n}` : String(f || '').trim();
        };
        const nom = canon(faseNom);
        if (!nom) { setFaseAccioMsg('Indica un nombre de fase válido.'); return false; }
        const actuals = parseFasesConfig(exclusiva.fases_config);
        if (actuals.some((c) => canon(c.fase) === nom)) {
            setFaseAccioMsg(`La ${nom} ya existe en esta exclusiva.`);
            return false;
        }
        const nous = [...actuals, { fase: nom, activa: true, temps_std_min: Number(tempsStdMin) || 0 }];
        try {
            // Si la exclusiva estaba pendiente de control de Calidad, añadir una
            // fase nueva la retira de la cola de Calidad hasta que vuelvan a
            // terminar todas las fases (incluida la nueva).
            const updatePayload = { fases_config: nous };
            if (exclusiva.estat === 'pendiente_calidad') updatePayload.estat = 'en_curs';
            await pb.collection('exclusives').update(exId, updatePayload);
            await pb.collection('historial_cambios_exclusivas').create({
                exclusiva_id: exId,
                tipo_cambio: 'fase_anadida',
                operacion_nombre: nom,
                cambio_descripcion: `Fase añadida por admin. Tiempo estándar: ${Number(tempsStdMin) || 0} min. Motivo: ${motiu || '—'}`,
                usuario_id: user?.id || '',
                fecha_cambio: new Date().toISOString(),
            }, { requestKey: `hist-fase-add-${exId}-${Date.now()}` });
            setFaseAccioMsg(`✓ ${nom} añadida correctamente.`);
            setShowGestioFases(false);
            await carrega();
            return true;
        } catch (e) {
            setFaseAccioMsg('No se ha podido añadir la fase.');
            return false;
        }
    };

    // ── Editar el tiempo estándar de una fase (con trazabilidad) ──
    // No altera registros históricos ni tiempos productivos; solo actualiza
    // el tiempo estándar configurado para futuros trabajos y lo deja auditado.
    const editarTempsFase = async (faseNom, nouTempsStd, motiu) => {
        const canon = (f) => {
            const m = String(f || '').match(/fase\s*(\d+)/i);
            const n = m ? Number(m[1]) : null;
            return n >= 1 && n <= 4 ? `Fase ${n}` : String(f || '').trim();
        };
        const nom = canon(faseNom);
        if (!nom) { setFaseAccioMsg('Indica una fase válida.'); return false; }
        const actuals = parseFasesConfig(exclusiva.fases_config);
        const idx = actuals.findIndex((c) => canon(c.fase) === nom);
        if (idx === -1) { setFaseAccioMsg(`La ${nom} no existe en esta exclusiva.`); return false; }
        const tempsAnterior = Number(actuals[idx].temps_std_min) || 0;
        const tempsNou = Number(nouTempsStd) || 0;
        const nous = actuals.map((c, i) => i === idx ? { ...c, temps_std_min: tempsNou } : c);
        try {
            const updatePayload = { fases_config: nous };
            if (exclusiva.estat === 'pendiente_calidad') updatePayload.estat = 'en_curs';
            await pb.collection('exclusives').update(exId, updatePayload, { requestKey: `edit-temps-${exId}-${Date.now()}` });
            await pb.collection('historial_cambios_exclusivas').create({
                exclusiva_id: exId,
                tipo_cambio: 'fase_tiempo_editado',
                operacion_nombre: nom,
                minuts_anterior: tempsAnterior,
                minuts_nuevo: tempsNou,
                cambio_descripcion: `Tiempo estándar de ${nom} editado: ${tempsAnterior} → ${tempsNou} min. Motivo: ${motiu || '—'}`,
                usuario_id: user?.id || '',
                fecha_cambio: new Date().toISOString(),
            }, { requestKey: `hist-temps-${exId}-${Date.now()}` });
            setFaseAccioMsg(`✓ Tiempo de ${nom} actualizado a ${tempsNou} min.`);
            await carrega();
            return true;
        } catch (e) {
            setFaseAccioMsg('No se ha podido editar el tiempo de la fase.');
            return false;
        }
    };

    // ── Reiniciar una fase: crea un nuevo ciclo de retrabajo diferenciado ──
    // No borra ni altera los registros históricos, tiempos, pausas, calidad ni
    // retrabajos anteriores. Crea un retrabajo pendiente asignado a un operario.
    const reiniciarFase = async (faseNom, operariId, motiu) => {
        if (!operariId) { setFaseAccioMsg('Selecciona un operario para asignar el retrabajo.'); return false; }
        try {
            const intentPrev = retrabajos.filter((r) => (r.fase_retrabajo || r.fase || '') === faseNom).length;
            await pb.collection('retrabajos').create({
                exclusiva: exId,
                operacion_original: faseNom,
                fase_retrabajo: faseNom,
                fase: faseNom,
                motivo_rechazo: `Reinicio de fase por admin. Motivo: ${motiu || '—'}`,
                operario_asignado: operariId,
                estado: 'pendiente',
                numero_intento: intentPrev + 1,
                creado_por: user?.id || '',
                notas: `Reinicio de ${faseNom} solicitado por admin desde el detalle de la exclusiva.`,
            }, { requestKey: `rt-reiniciar-${exId}-${Date.now()}` });
            // Reiniciar una fase retira la exclusiva de la cola de Calidad
            // (pendiente de control) hasta que vuelva a terminar todas las
            // fases. No toca estados gestionados por Calidad (en_retrabajo,
            // lista_recollida, etc.).
            if (exclusiva.estat === 'pendiente_calidad') {
                await pb.collection('exclusives').update(exId, { estat: 'en_curs' }, { requestKey: `rt-revert-${exId}-${Date.now()}` });
            }
            await pb.collection('historial_cambios_exclusivas').create({
                exclusiva_id: exId,
                tipo_cambio: 'fase_reiniciada',
                operacion_nombre: faseNom,
                cambio_descripcion: `Fase reiniciada por admin. Nuevo ciclo de retrabajo creado (intento ${intentPrev + 1}) asignado a ${operaris.find((o) => o.id === operariId)?.name || operaris.find((o) => o.id === operariId)?.codi || '—'}. Motivo: ${motiu || '—'}`,
                usuario_id: user?.id || '',
                fecha_cambio: new Date().toISOString(),
            }, { requestKey: `hist-fase-rein-${exId}-${Date.now()}` });
            setFaseAccioMsg(`✓ ${faseNom} reiniciada. Se ha creado un nuevo retrabajo sin alterar el historial.`);
            setShowReiniciarFase(null);
            await carrega();
            return true;
        } catch (e) {
            setFaseAccioMsg('No se ha podido reiniciar la fase.');
            return false;
        }
    };

    // ── Reactivar una fase terminada/pausada o poner a 0 el tiempo de un
    // operario para una fase concreta de una unidad. Crea un nuevo ciclo
    // diferenciado (tipus='reoperacio') sin reabrir silenciosamente el ciclo
    // finalizado: congela el ciclo activo/pausado (lo deja finalitzat con su
    // tiempo) y crea un registre nuevo en_curs a 0. No borra historial ni
    // modifica otras fases. Mantiene separadas las aprobaciones del operario
    // (control_qualitat) y de Calidad (control_calidad/controles_qualitat).
    // Recalcula el estado de confección: pone el mono en_curs y retira la
    // exclusiva de la cola de Calidad si estaba pendiente_calidad.
    const reactivarOResetFase = async (mode, faseNom, monoId, operariId, motiu) => {
        if (!operariId) { setFaseAccioMsg('Selecciona un operario.'); return false; }
        if (!motiu || !motiu.trim()) { setFaseAccioMsg('Indica el motivo (trazabilidad).'); return false; }
        const mono = monos.find((m) => m.id === monoId);
        if (!mono) { setFaseAccioMsg('Unidad no encontrada.'); return false; }
        const stdMin = fasesDisponibles.find((f) => f.fase === faseNom)?.temps_std_min || 0;
        const araIso = new Date().toISOString();
        try {
            // 1) Congelar ciclos activos/pausados de esta unidad+fase (no borrar).
            const actius = registres.filter(
                (r) => r.operacio === faseNom && r.mono === monoId && (r.estat === 'en_curs' || r.estat === 'pausat'),
            );
            for (const r of actius) {
                await pb.collection('registres').update(r.id, {
                    estat: 'finalitzat',
                    fi: araIso,
                    temps_real_seg: segonsRegistre(r, Date.now()),
                }, { requestKey: `freeze-${r.id}-${Date.now()}` }).catch(() => {});
            }

            // 2) Crear nuevo ciclo diferenciado a 0, disponible para trabajar.
            await pb.collection('registres').create({
                mono: monoId,
                exclusiva: exId,
                operari: operariId,
                operacio: faseNom,
                inici: araIso,
                ultima_reanudacio: araIso,
                temps_estandard_seg: stdMin * 60,
                temps_real_seg: 0,
                estat: 'en_curs',
                control_qualitat: 'pendent',
                tipus: 'reoperacio',
            }, { requestKey: `react-${monoId}-${faseNom}-${Date.now()}` });

            // 3) Mono vuelve a en_curs con esta fase como operación actual.
            await pb.collection('monos').update(monoId, {
                estat: 'en_curs',
                operacio_actual: faseNom,
            }, { requestKey: `react-mono-${monoId}-${Date.now()}` });

            // 4) Retirar la exclusiva de la cola de Calidad si estaba pendiente.
            // El hook auto-pendiente-calidad la mantendrá coherente al detectar
            // el mono no finalitzat.
            if (exclusiva.estat === 'pendiente_calidad') {
                await pb.collection('exclusives').update(exId, { estat: 'en_curs' }, { requestKey: `react-ex-${exId}-${Date.now()}` });
            }

            // 5) Trazabilidad en el historial de cambios.
            const nomOperari = operaris.find((o) => o.id === operariId)?.name || operaris.find((o) => o.id === operariId)?.codi || '—';
            await pb.collection('historial_cambios_exclusivas').create({
                exclusiva_id: exId,
                tipo_cambio: mode === 'reset' ? 'fase_tiempo_reseteado' : 'fase_reactivada',
                operacion_nombre: `${faseNom} · ${mono.codi || `#${mono.numero}`}`,
                cambio_descripcion: `${mode === 'reset' ? 'Tiempo reseteado a 0' : 'Fase reactivada'} para la unidad ${mono.codi || mono.numero} en ${faseNom}. Nuevo ciclo de trabajo creado (ciclos previos congelados en historial). Operario: ${nomOperari}. Motivo: ${motiu.trim()}`,
                usuario_id: user?.id || '',
                fecha_cambio: araIso,
            }, { requestKey: `hist-react-${exId}-${Date.now()}` });

            setFaseAccioMsg(`✓ ${faseNom} ${mode === 'reset' ? 'reseteada a 0' : 'reactivada'} para ${mono.codi || mono.numero}. Nuevo ciclo creado sin alterar el historial.`);
            setShowReactivarFase(null);
            await carrega();
            return true;
        } catch (e) {
            setFaseAccioMsg('No se ha podido completar la acción.');
            return false;
        }
    };

    const obrirReactivarFase = (faseNom, mono, operariId) => {
        setFaseAccioMsg('');
        setShowReactivarFase({ mode: 'reactivar', faseNom, mono, operariId });
    };
    const obrirResetTempsFase = (faseNom, mono, operariId) => {
        setFaseAccioMsg('');
        setShowReactivarFase({ mode: 'reset', faseNom, mono, operariId });
    };

    return (
        <div className="grid gap-5">
            {/* Header card */}
            <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                    <div>
                        <p className="font-display text-4xl uppercase leading-none">{exclusiva.exclusiva}</p>
                        {exclusiva.article && <p className="mt-1 text-lg font-semibold">{exclusiva.article}</p>}
                        {(exclusiva.cliente || exclusiva.marca) && <p className="text-sm text-muted-foreground">{exclusiva.cliente || exclusiva.marca}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                        <Estat v={exclusiva.estat} />
                        {exclusiva.prioritat === 'express' && <span className="rounded px-2 py-0.5 text-xs font-bold bg-destructive text-white uppercase">Express</span>}
                        <a
                            href={`/exclusiva/${exclusiva.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3 h-9 text-sm font-semibold hover:bg-secondary active:scale-95"
                        >
                            <ExternalLink className="h-4 w-4" /> Abrir en nueva pestaña
                        </a>
                        {canEdit && (
                            <button onClick={() => setShowAnadirOp(true)} className="flex items-center gap-1.5 rounded-md bg-[hsl(var(--accent))] px-3 h-9 text-sm font-semibold text-[hsl(var(--accent-foreground))] active:scale-95">
                                <Plus className="h-4 w-4" /> Añadir operación
                            </button>
                        )}
                        {canEdit && (rol === 'admin' || rol === 'superadmin') && (
                            <button onClick={() => { setShowGestioFases(true); setFaseAccioMsg(''); }} className="flex items-center gap-1.5 rounded-md bg-primary px-3 h-9 text-sm font-semibold text-primary-foreground active:scale-95">
                                <Layers className="h-4 w-4" /> Gestionar fases
                            </button>
                        )}
                        {canEdit && (
                            <button onClick={() => setShowPropagarOp(true)} className="flex items-center gap-1.5 rounded-md border-2 border-[hsl(var(--accent))]/60 text-[hsl(var(--accent))] bg-background px-3 h-9 text-sm font-semibold hover:bg-[hsl(var(--accent))]/10 active:scale-95">
                                <Layers className="h-4 w-4" /> Propagar operación
                            </button>
                        )}
                        {canEdit && (
                            <button onClick={() => setShowMsg(true)} className="flex items-center gap-1.5 rounded-md bg-primary px-3 h-9 text-sm font-semibold text-primary-foreground active:scale-95">
                                <MessageSquare className="h-4 w-4" /> Enviar mensaje
                            </button>
                        )}
                    </div>
                </div>

                {/* Quick stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-lg bg-primary/10 px-3 py-2"><p className="text-xs text-muted-foreground">Tiempo total</p><p className="font-display text-xl text-primary">{formatSegons(tempsTotal)}</p></div>
                    <div className="rounded-lg bg-[hsl(var(--ok))]/10 px-3 py-2"><p className="text-xs text-muted-foreground">Operación</p><p className="font-display text-xl text-[hsl(var(--ok))]">{formatSegons(tempsOperacio)}</p></div>
                    <div className="rounded-lg bg-[hsl(var(--warn))]/10 px-3 py-2"><p className="text-xs text-muted-foreground">Calidad</p><p className="font-display text-xl text-[hsl(var(--warn))]">{formatSegons(tempsQualitat)}</p></div>
                    <div className="rounded-lg bg-destructive/10 px-3 py-2"><p className="text-xs text-muted-foreground">Retrabajo</p><p className="font-display text-xl text-destructive">{formatSegons(tempsRetrabajo)}</p></div>
                </div>
            </div>

            {carregant ? (
                <div className="p-6 grid gap-2">{[0,1,2,3].map(i=><div key={i} className="h-12 animate-pulse rounded bg-secondary"/>)}</div>
            ) : (
                <div className="grid gap-5">
                        {/* SECCIÓN 1: INFORMACIÓN GENERAL */}
                        <section className="rounded-xl border border-border bg-card p-5">
                        <h3 className="font-display text-xl uppercase mb-4 flex items-center gap-2"><BarChart2 className="h-5 w-5" /> Información general</h3>
                        <div className="grid gap-5">
                                <div>
                                    <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Datos de la exclusiva</p>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-sm">
                                        {info.map(([k, v]) => (
                                            <div key={k} className="rounded-lg bg-secondary/60 px-3 py-2">
                                                <p className="text-xs text-muted-foreground mb-0.5">{k}</p>
                                                <p className="font-semibold truncate">{v}</p>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-3 rounded-lg bg-primary/5 px-3 py-2 text-sm">
                                        <span className="text-muted-foreground">Estado actual: </span>
                                        <span className="font-semibold text-primary">{estatDerivat}</span>
                                    </div>
                                </div>

                                {/* Mono list */}
                                <div>
                                    <div className="flex flex-wrap items-center gap-2 mb-3">
                                        <h4 className="font-display text-lg uppercase">Monos ({monosFiltrats.length}{monosFiltrats.length !== monos.length ? ` de ${monos.length}` : ''})</h4>
                                        <div className="ml-auto flex flex-wrap gap-1.5">
                                            <select value={estatFil} onChange={e => setEstatFil(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
                                                <option value="tots">Todos estados</option>
                                                {['pendent','en_curs','finalitzat','retreball'].map(s => <option key={s} value={s}>{s}</option>)}
                                                <option value="amb_incidencies">Con incidencias</option>
                                            </select>
                                            {fases.length > 0 && (
                                                <select value={faseFil} onChange={e => setFaseFil(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
                                                    <option value="totes">Todas fases</option>
                                                    {fases.map(f => <option key={f} value={f}>{f}</option>)}
                                                </select>
                                            )}
                                        </div>
                                    </div>
                                    <div className="overflow-auto rounded-lg border border-border">
                                        <table className="w-full min-w-[600px] text-sm">
                                            <thead className="bg-secondary text-left text-xs uppercase">
                                                <tr>{['Nº','Código','Talla','Estado','Fase actual','Op. actual','Incid.','Retrab.',''].map(h=><th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
                                            </thead>
                                            <tbody className="divide-y divide-border">
                                                {monosFiltrats.length === 0 ? (
                                                    <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">{monos.length === 0 ? 'Sin monos generados.' : 'Ningún mono cumple los filtros.'}</td></tr>
                                                ) : monosFiltrats.map(m => (
                                                    <tr key={m.id} className="hover:bg-secondary/30">
                                                        <td className="px-3 py-2 font-semibold tabular-nums">{m.numero}</td>
                                                        <td className="px-3 py-2 font-mono text-xs">{m.codi}</td>
                                                        <td className="px-3 py-2">{m.talla || '—'}</td>
                                                        <td className="px-3 py-2"><Estat v={m.estat}/></td>
                                                        <td className="px-3 py-2 text-xs text-muted-foreground">{m.faseActual || '—'}</td>
                                                        <td className="px-3 py-2 text-muted-foreground text-xs">{m.operacio_actual || '—'}</td>
                                                        <td className="px-3 py-2 tabular-nums">{m.incidencies > 0 ? <span className="text-destructive font-semibold">{m.incidencies}</span> : 0}</td>
                                                        <td className="px-3 py-2 tabular-nums">{m.retreball > 0 ? <span className="text-[hsl(var(--warn))] font-semibold">{m.retreball}</span> : 0}</td>
                                                        <td className="px-3 py-2">
                                                            <button onClick={() => onSelectMono(m)} className="flex items-center gap-1 rounded border border-primary/50 text-primary px-3 h-8 text-xs font-semibold hover:bg-primary/10">
                                                                Ver detalle <ChevronRight className="h-3.5 w-3.5"/>
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* SECCIÓN 2: TIEMPOS */}
                        <section className="rounded-xl border border-border bg-card p-5">
                        <h3 className="font-display text-xl uppercase mb-4 flex items-center gap-2"><Clock className="h-5 w-5" /> Tiempos</h3>
                        <div className="grid gap-5">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <div className="rounded-lg bg-primary/10 px-3 py-3 text-center"><p className="text-xs text-muted-foreground">Total dedicado</p><p className="font-display text-2xl text-primary">{formatSegons(tempsTotal)}</p></div>
                                    <div className="rounded-lg bg-[hsl(var(--ok))]/10 px-3 py-3 text-center"><p className="text-xs text-muted-foreground">Operaciones</p><p className="font-display text-2xl text-[hsl(var(--ok))]">{formatSegons(tempsOperacio)}</p></div>
                                    <div className="rounded-lg bg-[hsl(var(--warn))]/10 px-3 py-3 text-center"><p className="text-xs text-muted-foreground">Control calidad</p><p className="font-display text-2xl text-[hsl(var(--warn))]">{formatSegons(tempsQualitat)}</p></div>
                                    <div className="rounded-lg bg-destructive/10 px-3 py-3 text-center"><p className="text-xs text-muted-foreground">Retrabajo</p><p className="font-display text-2xl text-destructive">{formatSegons(tempsRetrabajo)}</p></div>
                                </div>

                                <div className="grid lg:grid-cols-2 gap-5">
                                    <div>
                                        <p className="text-sm font-semibold mb-2">Tiempo por operación (min)</p>
                                        {tempsPerOpChart.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">Sin datos.</p> : (
                                            <ResponsiveContainer width="100%" height={300}>
                                                <BarChart data={tempsPerOpChart} margin={{ top: 5, right: 10, bottom: 60, left: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                                                    <XAxis dataKey="op" angle={-45} textAnchor="end" tick={{ fontSize: 10 }} interval={0} />
                                                    <YAxis tick={{ fontSize: 11 }} />
                                                    <Tooltip formatter={v => [`${v} min`, 'Tiempo']} />
                                                    <Bar dataKey="min" fill="#1e3a5f" />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold mb-2">Tiempo por fase</p>
                                        {tempsPerFase.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">Sin datos.</p> : (
                                            <table className="w-full text-sm">
                                                <thead className="bg-secondary text-left text-xs uppercase"><tr><th className="px-3 py-2 font-semibold">Fase</th><th className="px-3 py-2 font-semibold text-right">Ops</th><th className="px-3 py-2 font-semibold text-right">Tiempo</th></tr></thead>
                                                <tbody className="divide-y divide-border">
                                                    {tempsPerFase.map(f => (
                                                        <tr key={f.fase}><td className="px-3 py-2 font-semibold">{f.fase}</td><td className="px-3 py-2 text-right tabular-nums">{f.n}</td><td className="px-3 py-2 text-right tabular-nums">{formatSegons(f.temps)}</td></tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                </div>

                                {/* Historial de pausas */}
                                <div>
                                    <p className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Pause className="h-4 w-4 text-[hsl(var(--warn))]" /> Historial de pausas ({historialPausas.length})</p>
                                    {historialPausas.length === 0 ? <p className="text-sm text-muted-foreground py-4 text-center">Sin pausas registradas.</p> : (
                                        <div className="overflow-auto rounded-lg border border-border">
                                            <table className="w-full min-w-[640px] text-sm">
                                                <thead className="bg-secondary text-left text-xs uppercase"><tr>{['Operario','Operación','Inicio','Reanudación','Duración','Causa'].map(h=><th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
                                                <tbody className="divide-y divide-border">
                                                    {historialPausas.map(p => (
                                                        <tr key={p.id} className={p.inactivitat ? 'bg-[hsl(var(--warn))]/5' : ''}>
                                                            <td className="px-3 py-2 font-semibold">{p.expand?.operari?.name || p.expand?.operari?.codi || '—'}</td>
                                                            <td className="px-3 py-2 text-xs">{p.operacio || '—'}</td>
                                                            <td className="px-3 py-2 text-xs tabular-nums">{fmtDate(p.inici)}</td>
                                                            <td className="px-3 py-2 text-xs tabular-nums">{fmtDate(p.fi)}</td>
                                                            <td className="px-3 py-2 tabular-nums font-semibold text-[hsl(var(--warn))]">{formatSegons(Number(p.durada_seg) || 0)}</td>
                                                            <td className="px-3 py-2 text-xs">{p.causa ? <span className={`rounded px-2 py-0.5 font-semibold ${p.inactivitat ? 'bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))]' : 'bg-secondary text-muted-foreground'}`}>{p.causa}</span> : <span className="text-muted-foreground">—</span>}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>

                        {/* SECCIÓN: PROGRESO DE FASES Y OPERACIONES POR UNIDAD */}
                        <ProgresoFasesOperaciones
                            exclusiva={exclusiva}
                            monos={monos}
                            registres={registres}
                            fasesDisponibles={fasesDisponibles}
                            operaris={operaris}
                            nowTick={nowTick}
                            canEdit={canEdit}
                            onReactivar={obrirReactivarFase}
                            onResetTemps={obrirResetTempsFase}
                        />

                        {/* SECCIÓN 3: INCIDENCIAS */}
                        <section className="rounded-xl border border-border bg-card p-5">
                        <h3 className="font-display text-xl uppercase mb-4 flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Incidencias</h3>
                        <div className="grid gap-5">
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                    <div className="rounded-lg bg-destructive/10 px-3 py-3"><p className="text-xs text-muted-foreground">Total incidencias</p><p className="font-display text-2xl text-destructive">{incidencies.length}</p></div>
                                    <div className="rounded-lg bg-[hsl(var(--warn))]/10 px-3 py-3"><p className="text-xs text-muted-foreground">Retrabajos</p><p className="font-display text-2xl text-[hsl(var(--warn))]">{retrabajos.length}</p></div>
                                    <div className="rounded-lg bg-secondary px-3 py-3"><p className="text-xs text-muted-foreground">Resueltas</p><p className="font-display text-2xl">{retrabajos.filter(r => r.estado === 'completado' || r.estado === 'verificado').length}</p></div>
                                </div>

                                {incidenciesTipus.length > 0 && (
                                    <div>
                                        <p className="text-sm font-semibold mb-2">Incidencias por tipo</p>
                                        <ResponsiveContainer width="100%" height={220}>
                                            <PieChart>
                                                <Pie data={incidenciesTipus} dataKey="count" nameKey="tipus" cx="50%" cy="50%" outerRadius={80} label={(e) => e.tipus}>
                                                    {incidenciesTipus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                                </Pie>
                                                <Tooltip />
                                                <Legend wrapperStyle={{ fontSize: 11 }} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                )}

                                <div className="overflow-auto rounded-lg border border-border">
                                    <table className="w-full min-w-[700px] text-sm">
                                        <thead className="bg-secondary text-left text-xs uppercase"><tr>{['Operación','Tipo','Descripción','Operario','Fecha'].map(h=><th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
                                        <tbody className="divide-y divide-border">
                                            {incidencies.length === 0 ? <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Sin incidencias registradas.</td></tr> : incidencies.map((inc, i) => (
                                                <tr key={i}>
                                                    <td className="px-3 py-2 text-xs">{inc.operacio}</td>
                                                    <td className="px-3 py-2"><span className="rounded bg-destructive/10 text-destructive px-2 py-0.5 text-xs font-semibold">{inc.tipus || '—'}</span></td>
                                                    <td className="px-3 py-2">{inc.descripcio || '—'}</td>
                                                    <td className="px-3 py-2 text-muted-foreground">{inc.operari}</td>
                                                    <td className="px-3 py-2 text-xs tabular-nums">{fmtDate(inc.data)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </section>

                        {/* SECCIÓN 4: CONTROL DE CALIDAD POR UNIDAD */}
                        <section className="rounded-xl border border-border bg-card p-5">
                        <h3 className="font-display text-xl uppercase mb-4 flex items-center gap-2"><CheckCircle2 className="h-5 w-5" /> Control de calidad por unidad</h3>
                        <ControlCalidadUnidades exclusiva={exclusiva} onStatusChange={carrega} />
                        </section>

                        {/* SECCIÓN 5: HISTORIAL */}
                        <section className="rounded-xl border border-border bg-card p-5">
                        <h3 className="font-display text-xl uppercase mb-4 flex items-center gap-2"><History className="h-5 w-5" /> Historial</h3>
                        <div className="grid gap-5">
                                <div>
                                    <p className="text-sm font-semibold mb-2">Operarios que trabajaron</p>
                                    {operarisTreball.length === 0 ? <p className="text-sm text-muted-foreground py-4 text-center">Sin registros.</p> : (
                                        <table className="w-full text-sm">
                                            <thead className="bg-secondary text-left text-xs uppercase"><tr><th className="px-3 py-2 font-semibold">Operario</th><th className="px-3 py-2 font-semibold text-right">Operaciones</th><th className="px-3 py-2 font-semibold text-right">Tiempo total</th><th className="px-3 py-2 font-semibold text-right">Incidencias</th></tr></thead>
                                            <tbody className="divide-y divide-border">
                                                {operarisTreball.map(o => (
                                                    <tr key={o.nom}><td className="px-3 py-2 font-semibold">{o.nom}</td><td className="px-3 py-2 text-right tabular-nums">{o.ops}</td><td className="px-3 py-2 text-right tabular-nums">{formatSegons(o.temps)}</td><td className="px-3 py-2 text-right tabular-nums">{o.incidencies}</td></tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>

                                <div className="overflow-auto rounded-lg border border-border max-h-[400px]">
                                    <table className="w-full min-w-[800px] text-sm">
                                        <thead className="bg-secondary text-left text-xs uppercase sticky top-0"><tr>{['Operario','Operación','Fase','Inicio','Fin','Tiempo','Incid.','OK confección','Retrab.'].map(h=><th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
                                        <tbody className="divide-y divide-border">
                                            {historial.length === 0 ? <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Sin historial.</td></tr> : historial.map((h, i) => (
                                                <tr key={i} className={h.tipus === 'lliure' ? 'bg-[hsl(var(--accent))]/5' : h.inactivitat ? 'bg-[hsl(var(--warn))]/5' : ''}>
                                                    <td className="px-3 py-2 font-semibold">{h.operari}</td>
                                                    <td className="px-3 py-2 text-xs">
                                                        {h.tipus === 'lliure' ? (
                                                            <span className="flex items-center gap-1 text-[hsl(var(--accent))] font-semibold"><Wrench className="h-3 w-3" /> Trabajo libre</span>
                                                        ) : h.operacio}
                                                        {h.tipus === 'lliure' && h.descripcio && (
                                                            <p className="mt-0.5 text-muted-foreground italic max-w-[260px] truncate" title={h.descripcio}>“{h.descripcio}”</p>
                                                        )}
                                                        {h.inactivitat && h.causaInactivitat && (
                                                            <span className="mt-0.5 flex items-center gap-1 text-[hsl(var(--warn))] font-semibold"><AlertTriangle className="h-3 w-3" /> Pausado por inactividad: {h.causaInactivitat}</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2 text-xs text-muted-foreground">{h.fase}</td>
                                                    <td className="px-3 py-2 text-xs tabular-nums">{fmtDate(h.inici)}</td>
                                                    <td className="px-3 py-2 text-xs tabular-nums">{fmtDate(h.fi)}</td>
                                                    <td className="px-3 py-2 tabular-nums">{formatSegons(h.temps)}</td>
                                                    <td className="px-3 py-2 tabular-nums">{h.incidencies > 0 ? <span className="text-destructive font-semibold">{h.incidencies}</span> : 0}</td>
                                                    <td className="px-3 py-2" title="OK del operario de confección al cerrar la fase (no es OK de Calidad)">
                                                        {h.qc === 'ok' ? <span className="rounded px-2 py-0.5 text-xs font-semibold uppercase bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]">OK fase</span>
                                                            : h.qc === 'ko' ? <span className="rounded px-2 py-0.5 text-xs font-semibold uppercase bg-destructive/10 text-destructive">No OK</span>
                                                            : <span className="rounded px-2 py-0.5 text-xs font-semibold uppercase bg-secondary text-muted-foreground">—</span>}
                                                    </td>
                                                    <td className="px-3 py-2">{h.retreball ? <span className="text-[hsl(var(--warn))]">✓</span> : '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Mensajes enviados */}
                                {mensajes.length > 0 && (
                                    <div>
                                        <p className="text-sm font-semibold mb-2">Mensajes enviados ({mensajes.length})</p>
                                        <div className="space-y-2">
                                            {mensajes.map(m => (
                                                <div key={m.id} className="rounded-lg border border-border p-3">
                                                    <div className="flex items-center justify-between gap-2 mb-1">
                                                        <span className="text-xs font-semibold">{m.expand?.remitente?.name || '—'} → {m.expand?.destinatario?.name || (m.tipo_destinatario === 'todos' ? 'Todos' : m.tipo_destinatario)}</span>
                                                        <div className="flex items-center gap-2">
                                                            {m.prioridad === 'urgente' && <span className="rounded bg-destructive px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Urgente</span>}
                                                            <span className="text-[10px] text-muted-foreground">{fmtDate(m.created)}</span>
                                                        </div>
                                                    </div>
                                                    <p className="text-sm">{m.mensaje}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* SECCIÓN 5: FASES EXTERNALIZADAS */}
                        <section className="rounded-xl border border-border bg-card p-5">
                        <h3 className="font-display text-xl uppercase mb-4 flex items-center gap-2"><ExternalLink className="h-5 w-5" /> Fases externalizadas</h3>
                        <FasesExternalizadesSection exclusiva={exclusiva} fases={fasesLlista} proveedores={proveedores} historial={historialFases} onSaved={carrega} />
                        </section>

                        {/* SECCIÓN: PROPUESTAS DE MEJORA */}
                        <section className="rounded-xl border border-border bg-card p-5">
                        <h3 className="font-display text-xl uppercase mb-4 flex items-center gap-2"><Lightbulb className="h-5 w-5 text-[hsl(var(--accent))]" /> Propuestas de mejora ({propuestas.length})</h3>
                        {propuestas.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-4 text-center">Sin propuestas de mejora para esta exclusiva.</p>
                        ) : (
                            <div className="space-y-3">
                                {propuestas.map(p => {
                                    const resps = respuestasProp.filter(r => r.propuesta_id === p.id);
                                    return (
                                        <div key={p.id} className="rounded-lg border border-border p-3">
                                            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                                                <span className="text-xs font-semibold">{p.expand?.usuario_reporto?.name || p.expand?.usuario_reporto?.codi || '—'}</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="rounded bg-[hsl(var(--accent))]/15 text-[hsl(var(--accent))] px-2 py-0.5 text-xs font-semibold">{p.tipo === 'accion_preventiva' ? 'Acción preventiva' : 'Propuesta'}</span>
                                                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${p.estado === 'implementada' ? 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]' : p.estado === 'respondida' || p.estado === 'en_progreso' ? 'bg-blue-100 text-blue-700' : 'bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))]'}`}>{p.estado}</span>
                                                    <span className="text-xs text-muted-foreground">{fmtDate(p.fecha_reporte || p.created)}</span>
                                                </div>
                                            </div>
                                            <p className="text-sm">{p.descripcion}</p>
                                            {p.punt_checklist && <p className="text-xs text-muted-foreground mt-1">Punto: {p.punt_checklist}</p>}
                                            {resps.length > 0 && (
                                                <div className="mt-2 rounded-lg bg-secondary/40 p-2">
                                                    {resps.map(r => (
                                                        <div key={r.id} className="text-xs">
                                                            <p><strong>Respuesta:</strong> {r.respuesta}</p>
                                                            <p className="text-muted-foreground mt-0.5">Por: {r.expand?.usuario_id?.name || r.expand?.usuario_id?.codi || '—'} · Responsable: {r.expand?.responsable_id?.name || r.expand?.responsable_id?.codi || '—'} · Estado: {r.estado}{r.fecha_estimada ? ` · Estimada: ${fmtDate(r.fecha_estimada)}` : ''}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        </section>

                        {/* SECCIÓN: HISTORIAL DE RETRABAJOS */}
                        <section className="rounded-xl border border-border bg-card p-5">
                        <h3 className="font-display text-xl uppercase mb-4 flex items-center gap-2"><Wrench className="h-5 w-5 text-destructive" /> Historial de retrabajos ({retrabajos.length})</h3>
                        {retrabajos.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-4 text-center">Sin retrabajos para esta exclusiva.</p>
                        ) : (
                            <div className="overflow-auto rounded-lg border border-border">
                                <table className="w-full min-w-[1500px] text-sm">
                                    <thead className="bg-secondary text-left text-xs uppercase">
                                        <tr>{['Intent', 'Ud.', 'Descripción', 'Fase', 'Prioridad', 'Estado', 'Creado por', 'F. creación', 'T. est.', 'Iniciado por', 'F. inicio', 'Completado por', 'F. completación', 'T. real', 'Aprobado por', 'F. aprobación'].map(h => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {retrabajos.sort((a, b) => new Date(b.created) - new Date(a.created)).map(r => (
                                            <tr key={r.id}>
                                                <td className="px-3 py-2 font-bold tabular-nums">#{r.numero_intento || 1}</td>
                                                <td className="px-3 py-2 tabular-nums font-semibold">{r.unidad_numero || '—'}</td>
                                                <td className="px-3 py-2 max-w-[240px] text-xs">
                                                    <p className="truncate" title={r.motivo_rechazo || r.operacion_original}>{r.motivo_rechazo || r.operacion_original || '—'}</p>
                                                    {r.notas && (
                                                        <p className="mt-0.5 flex items-start gap-1 text-muted-foreground italic" title={r.notas}>
                                                            <MessageSquare className="h-3 w-3 shrink-0 mt-0.5" />
                                                            <span className="line-clamp-2">{r.notas}</span>
                                                        </p>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-xs">{r.fase_retrabajo || r.punt_checklist || '—'}</td>
                                                <td className="px-3 py-2"><span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${r.prioridad === 'alta' ? 'bg-destructive/15 text-destructive' : r.prioridad === 'media' ? 'bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))]' : 'bg-secondary text-muted-foreground'}`}>{r.prioridad || '—'}</span></td>
                                                <td className="px-3 py-2"><Estat v={r.estado} /></td>
                                                <td className="px-3 py-2 text-xs">{r.expand?.creado_por?.name || r.expand?.creado_por?.codi || '—'}</td>
                                                <td className="px-3 py-2 text-xs tabular-nums">{fmtDate(r.created)}</td>
                                                <td className="px-3 py-2 tabular-nums text-xs">{r.temps_estimat_min ? `${r.temps_estimat_min}m` : '—'}</td>
                                                <td className="px-3 py-2 text-xs">{r.expand?.usuario_inicio?.name || r.expand?.usuario_inicio?.codi || '—'}</td>
                                                <td className="px-3 py-2 text-xs tabular-nums">{r.fecha_inicio ? fmtDate(r.fecha_inicio) : '—'}</td>
                                                <td className="px-3 py-2 text-xs">{r.expand?.usuario_completado?.name || r.expand?.usuario_completado?.codi || '—'}</td>
                                                <td className="px-3 py-2 text-xs tabular-nums">{r.fecha_completacion ? fmtDate(r.fecha_completacion) : '—'}</td>
                                                <td className="px-3 py-2 tabular-nums text-xs font-semibold">{(r.tiempo_real_seg || r.tiempo_retrabajo_seg) ? formatSegons(r.tiempo_real_seg || r.tiempo_retrabajo_seg) : '—'}</td>
                                                <td className="px-3 py-2 text-xs">{r.expand?.usuario_aprobacion?.name || r.expand?.usuario_aprobacion?.codi || '—'}</td>
                                                <td className="px-3 py-2 text-xs tabular-nums">{r.fecha_aprobacion ? fmtDate(r.fecha_aprobacion) : '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {/* Tiempos por tipo */}
                        {tiemposEx.length > 0 && (
                            <div className="mt-4 grid grid-cols-3 gap-3">
                                {['operacion', 'calidad', 'retrabajo'].map(t => {
                                    const total = tiemposEx.filter(x => x.tipo === t).reduce((a, x) => a + Number(x.tiempo_segundos || (Number(x.tiempo_minutos) || 0) * 60), 0);
                                    const label = { operacion: 'Operación', calidad: 'Calidad', retrabajo: 'Retrabajo' }[t];
                                    const cls = { operacion: 'text-[hsl(var(--ok))]', calidad: 'text-[hsl(var(--warn))]', retrabajo: 'text-destructive' }[t];
                                    return (
                                        <div key={t} className="rounded-lg bg-secondary/40 px-3 py-2 text-center">
                                            <p className="text-xs text-muted-foreground">{label}</p>
                                            <p className={`font-display text-xl ${cls}`}>{formatSegons(total)}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        </section>

                        {/* SECCIÓN: INCIDENCIAS DE CALIDAD (no conformitats) */}
                        <section className="rounded-xl border border-border bg-card p-5">
                        <h3 className="font-display text-xl uppercase mb-4 flex items-center gap-2"><AlertCircle className="h-5 w-5 text-destructive" /> Incidencias de calidad ({noConformitats.length})</h3>
                        {noConformitats.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-4 text-center">Sin incidencias de calidad registradas.</p>
                        ) : (
                            <div className="grid gap-3">
                                {noConformitats.sort((a, b) => new Date(b.created) - new Date(a.created)).map(nc => {
                                    const fotos = Array.isArray(nc.fotos) ? nc.fotos : (nc.fotos ? [nc.fotos] : []);
                                    const prioCls = { alta: 'bg-destructive/15 text-destructive', media: 'bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))]', baixa: 'bg-secondary text-muted-foreground' }[nc.prioritat] || 'bg-secondary text-muted-foreground';
                                    return (
                                        <div key={nc.id} className="rounded-xl border border-border p-4">
                                            <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono font-bold text-sm">{nc.codi || '—'}</span>
                                                    {nc.unidad_numero != null && <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">Ud. {nc.unidad_numero}</span>}
                                                    <span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${prioCls}`}>{nc.prioritat || '—'}</span>
                                                    <span className="rounded bg-destructive/10 px-2 py-0.5 text-xs font-semibold uppercase text-destructive">{nc.resultat_checklist || '—'}</span>
                                                    <span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${nc.estat === 'tancada' ? 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]' : nc.estat === 'en_seguiment' ? 'bg-blue-100 text-blue-700' : 'bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))]'}`}>{nc.estat || 'oberta'}</span>
                                                </div>
                                                <span className="text-xs text-muted-foreground tabular-nums">{fmtDate(nc.created)}</span>
                                            </div>
                                            <p className="text-sm">{nc.descripcio || '—'}</p>
                                            {nc.punt_checklist && <p className="mt-1 text-xs text-muted-foreground">Punto: {nc.punt_checklist}</p>}
                                            {(nc.proposta_millora || nc.solucio_implantada || nc.accio_preventiva) && (
                                                <div className="mt-2 grid gap-1.5 text-xs">
                                                    {nc.proposta_millora && (
                                                        <p className="flex items-start gap-1.5 text-muted-foreground"><Lightbulb className="h-3.5 w-3.5 shrink-0 mt-0.5 text-[hsl(var(--accent))]" /><span><strong className="text-foreground">Propuesta de mejora:</strong> {nc.proposta_millora}</span></p>
                                                    )}
                                                    {nc.solucio_implantada && (
                                                        <p className="flex items-start gap-1.5 text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5 text-[hsl(var(--ok))]" /><span><strong className="text-foreground">Solución aplicada:</strong> {nc.solucio_implantada}</span></p>
                                                    )}
                                                    {nc.accio_preventiva && (
                                                        <p className="flex items-start gap-1.5 text-muted-foreground"><AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" /><span><strong className="text-foreground">Acción preventiva:</strong> {nc.accio_preventiva}</span></p>
                                                    )}
                                                </div>
                                            )}
                                            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                                                <User className="h-3.5 w-3.5" />
                                                {nc.expand?.operari_que_detecto?.name || nc.expand?.operari_que_detecto?.codi || '—'}
                                            </div>
                                            {fotos.length > 0 && (
                                                <div className="mt-3 flex flex-wrap gap-2">
                                                    {fotos.map((f, i) => (
                                                        <a key={i} href={pb.files.getURL({ collectionId: nc.collectionId, id: nc.id }, f)} target="_blank" rel="noopener noreferrer" className="block">
                                                            <img src={pb.files.getURL({ collectionId: nc.collectionId, id: nc.id }, f, { thumb: '200x200' })} alt={`Foto ${i+1}`} className="h-20 w-20 rounded-lg border border-border object-cover" loading="lazy" />
                                                        </a>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        </section>

                        {/* SECCIÓN: HISTORIAL DE CAMBIOS DE RUTA / OPERACIONES */}
                        <section className="rounded-xl border border-border bg-card p-5">
                        <h3 className="font-display text-xl uppercase mb-4 flex items-center gap-2"><History className="h-5 w-5" /> Historial de cambios ({historialCambios.length})</h3>
                        {historialCambios.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-4 text-center">Sin cambios de ruta u operaciones registrados.</p>
                        ) : (
                            <div className="overflow-auto rounded-lg border border-border">
                                <table className="w-full min-w-[860px] text-sm">
                                    <thead className="bg-secondary text-left text-xs uppercase">
                                        <tr>{['Tipo','Ruta anterior','Ruta nueva','Operación','Descripción','Min. antes','Min. después','Usuario','Fecha'].map(h => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {historialCambios.map(h => {
                                            const tipoLabel = {
                                                ruta_actualizada: 'Ruta actualizada',
                                                operacion_anadida: 'Operación añadida',
                                                operacion_modificada: 'Operación modificada',
                                            }[h.tipo_cambio] || h.tipo_cambio;
                                            const tipoCls = {
                                                ruta_actualizada: 'bg-primary/10 text-primary',
                                                operacion_anadida: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]',
                                                operacion_modificada: 'bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))]',
                                            }[h.tipo_cambio] || 'bg-secondary';
                                            const diff = (Number(h.minuts_nuevo) || 0) - (Number(h.minuts_anterior) || 0);
                                            return (
                                                <tr key={h.id} className="hover:bg-secondary/20">
                                                    <td className="px-3 py-2"><span className={`rounded px-2 py-0.5 text-xs font-semibold ${tipoCls}`}>{tipoLabel}</span></td>
                                                    <td className="px-3 py-2 text-xs text-muted-foreground">{h.ruta_anterior || '—'}</td>
                                                    <td className="px-3 py-2 text-xs font-semibold">{h.ruta_nueva || '—'}</td>
                                                    <td className="px-3 py-2 text-xs">{h.operacion_nombre || '—'}</td>
                                                    <td className="px-3 py-2 text-xs max-w-[240px]">{h.cambio_descripcion || '—'}</td>
                                                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{h.minuts_anterior ?? '—'}</td>
                                                    <td className="px-3 py-2 tabular-nums font-semibold">
                                                        {h.minuts_nuevo ?? '—'}
                                                        {diff !== 0 && <span className={`ml-1 text-xs ${diff > 0 ? 'text-destructive' : 'text-[hsl(var(--ok))]'}`}>({diff > 0 ? '+' : ''}{diff})</span>}
                                                    </td>
                                                    <td className="px-3 py-2 text-xs">{h.expand?.usuario_id?.name || h.expand?.usuario_id?.codi || '—'}</td>
                                                    <td className="px-3 py-2 text-xs tabular-nums">{fmtDate(h.fecha_cambio || h.created)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        </section>

                        {/* SECCIÓN 6: EDITAR */}
                        {canEdit && (
                            <EditForm exclusiva={exclusiva} rutes={rutes} onSaved={carrega} />
                        )}
                    </div>
                )}

            {showMsg && (
                <MessageModal exclusiva={exclusiva} operaris={operaris} opsDef={opsDef} onClose={() => setShowMsg(false)} />
            )}

            {showAnadirOp && (
                <AnadirOperacionModal
                    exclusiva={exclusiva}
                    onClose={() => setShowAnadirOp(false)}
                    onSaved={carrega}
                />
            )}

            {showPropagarOp && (
                <PropagarOperacionModal
                    exclusiva={exclusiva}
                    onClose={() => setShowPropagarOp(false)}
                    onSaved={carrega}
                />
            )}

            {showGestioFases && (rol === 'admin' || rol === 'superadmin') && (
                <GestioFasesModal
                    exclusiva={exclusiva}
                    fasesDisponibles={fasesDisponibles}
                    onAdd={afegirFase}
                    onReiniciar={(faseNom) => { setShowGestioFases(false); setShowReiniciarFase(faseNom); setFaseAccioMsg(''); }}
                    onEditTemps={editarTempsFase}
                    msg={faseAccioMsg}
                    onClose={() => setShowGestioFases(false)}
                />
            )}

            {showReiniciarFase && (rol === 'admin' || rol === 'superadmin') && (
                <ReiniciarFaseModal
                    faseNom={showReiniciarFase}
                    operaris={operaris}
                    onConfirm={reiniciarFase}
                    msg={faseAccioMsg}
                    onClose={() => setShowReiniciarFase(null)}
                />
            )}

            {showReactivarFase && canEdit && (
                <ReactivarFaseModal
                    mode={showReactivarFase.mode}
                    faseNom={showReactivarFase.faseNom}
                    monoCodi={showReactivarFase.mono?.codi || `#${showReactivarFase.mono?.numero}`}
                    operaris={operaris}
                    operariInicial={showReactivarFase.operariId}
                    onConfirm={(faseNom, operariId, motiu) =>
                        reactivarOResetFase(showReactivarFase.mode, faseNom, showReactivarFase.mono?.id, operariId, motiu)
                    }
                    msg={faseAccioMsg}
                    onClose={() => setShowReactivarFase(null)}
                />
            )}
        </div>
    );
}

/* ─── Screen 3: Mono detail ───────────────────────────────────────────────── */
export function DetallMono({ mono, exclusiva, onBack }) {
    const [registres, setRegistres] = useState([]);
    const [opsDef, setOpsDef] = useState([]);
    const [controlsQC, setControlsQC] = useState([]);
    const [controlUnidad, setControlUnidad] = useState(null);
    const [rutaId, setRutaId] = useState(
        typeof exclusiva?.ruta === 'string'
            ? exclusiva.ruta
            : (exclusiva?.ruta?.id || exclusiva?.expand?.ruta?.id || null),
    );
    const [carregant, setCarregant] = useState(true);
    const [activeTab, setActiveTab] = useState('operacions');

    const carrega = useCallback(async () => {
        setCarregant(true);
        try {
            const monoNum = mono.numero != null ? Number(mono.numero) : null;
            const [rs, ops, arts, rutes, cq, cu] = await Promise.all([
                pb.collection('registres').getFullList({ filter: `mono = "${mono.id}"`, sort: 'inici', expand: 'operari', requestKey: 'detall-regs-mono' }),
                pb.collection('operacions_def').getFullList({ sort: 'ordre', requestKey: 'detall-ops-mono' }).catch(() => []),
                pb.collection('articles').getFullList({ expand: 'ruta', requestKey: 'detall-arts-mono' }).catch(() => []),
                pb.collection('rutes').getFullList({ requestKey: 'detall-rutes-mono' }).catch(() => []),
                pb.collection('controles_qualitat').getFullList({
                    filter: `mono = "${mono.id}"`,
                    sort: '-created',
                    expand: 'operari',
                    requestKey: 'detall-cq-mono',
                }).catch(() => []),
                (async () => {
                    try {
                        const exId = exclusiva?.id;
                        if (!exId) return null;
                        let list = [];
                        if (monoNum != null && !Number.isNaN(monoNum)) {
                            list = await pb.collection('control_calidad').getFullList({
                                filter: `exclusiva_id = "${exId}" && unidad_numero = ${monoNum}`,
                                expand: 'usuario_id',
                                sort: '-updated',
                                requestKey: 'detall-cc-mono',
                            });
                        }
                        if (!list.length) {
                            list = await pb.collection('control_calidad').getFullList({
                                filter: `exclusiva_id = "${exId}"`,
                                expand: 'usuario_id',
                                sort: '-updated',
                                requestKey: 'detall-cc-mono-all',
                            });
                            // Prefer match by mono code in observaciones if any
                            const byCode = list.filter((c) => String(c.observaciones || '').includes(mono.codi || ''));
                            if (byCode.length) list = byCode;
                            else if (monoNum != null) list = list.filter((c) => Number(c.unidad_numero) === monoNum);
                        }
                        return list[0] || null;
                    } catch {
                        return null;
                    }
                })(),
            ]);
            setRegistres(rs);
            setOpsDef(ops);
            setControlsQC(cq || []);
            setControlUnidad(cu);
            const resolved = resolveRutaExclusiva(exclusiva, rutes, arts);
            setRutaId(
                resolved.rutaId
                || (typeof exclusiva?.ruta === 'string' ? exclusiva.ruta : exclusiva?.ruta?.id)
                || exclusiva?.expand?.ruta?.id
                || null,
            );
        } finally { setCarregant(false); }
    }, [mono.id, mono.numero, mono.codi, exclusiva]);

    useEffect(() => { carrega(); }, [carrega]);

    useEffect(() => {
        const refresca = () => carrega();
        void pb.collection('controles_qualitat').subscribe('*', refresca).catch(() => {});
        void pb.collection('control_calidad').subscribe('*', refresca).catch(() => {});
        void pb.collection('registres').subscribe('*', refresca).catch(() => {});
        return () => {
            void pb.collection('controles_qualitat').unsubscribe('*').catch(() => {});
            void pb.collection('control_calidad').unsubscribe('*').catch(() => {});
            void pb.collection('registres').unsubscribe('*').catch(() => {});
        };
    }, [carrega]);

    const operacionsAmbEstat = useMemo(() => {
        if (!rutaId) return [];
        const rutaOps = opsDef.filter(op => op.ruta === rutaId).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
        // Completada = fase finalizada con OK de confección del operario (no OK de Calidad)
        const completadesNoms = new Set(registres.filter(r => r.estat === 'finalitzat' && r.control_qualitat === 'ok').map(r => r.operacio));
        const enCursNoms = new Set(registres.filter(r => r.estat === 'en_curs' || r.estat === 'pausat').map(r => r.operacio));
        return rutaOps.map(op => {
            const regs = registres.filter(r => r.operacio === op.nom).sort((a, b) => new Date(a.inici) - new Date(b.inici));
            const lastReg = regs[regs.length - 1];
            const reoperaciones = regs.filter(r => r.tipus === 'reoperacio').length;
            let status = 'disponible';
            if (completadesNoms.has(op.nom)) status = 'completada';
            else if (enCursNoms.has(op.nom)) status = 'en_curs';
            return { ...op, status, regs, lastReg, reoperaciones, okConfeccio: lastReg?.control_qualitat || null };
        });
    }, [opsDef, registres, rutaId]);

    // Registros de fase/trabajo libre con OK confección (para pestaña Operaciones y contexto)
    const oksConfeccio = useMemo(() => registres
        .filter((r) => r.estat === 'finalitzat' && r.control_qualitat && r.control_qualitat !== 'pendent')
        .map((r) => ({
            id: r.id,
            operacio: r.operacio || (r.tipus === 'lliure' ? 'Trabajo libre' : '—'),
            resultat: r.control_qualitat,
            notes: r.notes || '',
            operari: r.expand?.operari?.name || r.expand?.operari?.codi || '—',
            data: r.fi || r.inici,
            tipus: 'confeccion',
        })), [registres]);

    // Controles reales de Calidad (inspector de calidad) — independientes del OK de confección
    const totalControls = useMemo(() => {
        const fromCq = (controlsQC || []).map((c) => ({
            id: c.id,
            origen: 'controles_qualitat',
            operacio: c.operacio || 'Control de calidad',
            resultat: c.resultat || c.estado_qc || 'pendent',
            notes: c.observacions || c.notes || '',
            operari: c.expand?.operari?.name || c.expand?.operari?.codi || '—',
            data: c.created,
            updated: c.updated,
            estado_qc: c.estado_qc || '',
            temps: c.tiempo_qc_total_seg || c.temps_inspeccio_seg || null,
            tempsInicial: Number(c.tiempo_qc_inicial_seg) || null,
            tempsAdicional: Number(c.tiempo_qc_adicional_seg) || null,
            tempsRetrabajo: Number(c.tiempo_retrabajo_total_seg) || null,
            retrabajosCount: Number(c.retrabajos_count) || 0,
        }));
        const rows = [...fromCq];
        if (controlUnidad) {
            rows.unshift({
                id: controlUnidad.id,
                origen: 'control_calidad',
                operacio: `Unidad ${controlUnidad.unidad_numero ?? mono.numero ?? '—'}`,
                resultat: controlUnidad.estado || 'pendiente',
                notes: controlUnidad.observaciones || '',
                operari: controlUnidad.expand?.usuario_id?.name || controlUnidad.expand?.usuario_id?.codi || '—',
                data: controlUnidad.fecha_revision || controlUnidad.fecha_resolucion || controlUnidad.updated || controlUnidad.created,
                updated: controlUnidad.updated || controlUnidad.created,
                estado_qc: controlUnidad.estado || '',
                temps: controlUnidad.tiempo_revision_seg || null,
                tempsInicial: null,
                tempsAdicional: null,
                tempsRetrabajo: null,
                retrabajosCount: 0,
            });
        }
        return rows.sort((a, b) => new Date(b.data || 0) - new Date(a.data || 0));
    }, [controlsQC, controlUnidad, mono.numero]);

    const okCalidadMono = useMemo(() => {
        if (controlUnidad?.estado === 'conforme') return true;
        return (controlsQC || []).some((c) => {
            const r = String(c.resultat || '').toLowerCase();
            const e = String(c.estado_qc || '').toLowerCase();
            return r === 'ok' || r === 'aprovat' || e === 'completado';
        });
    }, [controlUnidad, controlsQC]);

    const totalIncidencies = useMemo(() => registres.flatMap(r => (r.incidencies || []).map(i => ({ ...i, operacio: r.operacio, operari: r.expand?.operari?.name || r.expand?.operari?.codi || '—', data: r.inici }))), [registres]);
    const totalRetreball = useMemo(() => registres.filter(r => r.retreball).map(r => ({ operacio: r.operacio, operari: r.expand?.operari?.name || '—', temps: r.temps_real_seg, data: r.inici })), [registres]);
    const chartData = useMemo(() => operacionsAmbEstat.filter(op => op.lastReg && op.temps_std_min > 0).map(op => ({ nom: op.codi || op.nom.substring(0, 10), estandar: op.temps_std_min, real: op.lastReg ? Math.round((op.lastReg.temps_real_seg || 0) / 60) : 0 })), [operacionsAmbEstat]);

    const completades = operacionsAmbEstat.filter(o => o.status === 'completada').length;
    const total = operacionsAmbEstat.length;
    const progres = total ? Math.round((completades / total) * 100) : 0;

    const TABS = [
        { id: 'operacions', label: `Operaciones (${operacionsAmbEstat.length || oksConfeccio.length})` },
        { id: 'incidencies', label: `Incidencias (${totalIncidencies.length})` },
        { id: 'qualitat', label: `Calidad (${totalControls.length})` },
        { id: 'retreball', label: `Retrabajo (${totalRetreball.length})` },
        { id: 'grafic', label: 'Gráfico' },
    ];

    return (
        <div className="grid gap-5">
            <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-1">Mono</p>
                        <p className="font-display text-4xl uppercase leading-none">{mono.codi}</p>
                        <div className="mt-2 flex flex-wrap gap-3">
                            {mono.talla && <span className="rounded-lg border-2 border-primary px-3 py-1 font-bold text-primary text-sm">Talla {mono.talla}</span>}
                            <Estat v={mono.estat}/>
                            {okCalidadMono ? (
                                <span className="rounded-lg bg-[hsl(var(--ok))]/15 px-3 py-1 text-xs font-bold uppercase text-[hsl(var(--ok))]">OK Calidad</span>
                            ) : (
                                <span className="rounded-lg bg-secondary px-3 py-1 text-xs font-bold uppercase text-muted-foreground">Sin OK Calidad</span>
                            )}
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-sm text-muted-foreground mb-1">Progreso confección</p>
                        <p className="font-display text-3xl">{progres}%</p>
                        <p className="text-xs text-muted-foreground">{completades}/{total} operaciones</p>
                        <p className={`mt-1 text-xs font-semibold ${okCalidadMono ? 'text-[hsl(var(--ok))]' : 'text-[hsl(var(--warn))]'}`}>
                            {okCalidadMono ? 'Aprobado por Calidad' : 'Pendiente de OK de Calidad'}
                        </p>
                    </div>
                </div>
                <div className="mt-3 h-2 w-full rounded-full bg-secondary overflow-hidden"><div className="h-full bg-[hsl(var(--ok))] rounded-full transition-all" style={{width:`${progres}%`}}/></div>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                    <div className="rounded-lg bg-[hsl(var(--ok))]/10 py-2"><p className="font-display text-2xl text-[hsl(var(--ok))]">{completades}</p><p className="text-xs text-muted-foreground">Fases OK conf.</p></div>
                    <div className="rounded-lg bg-[hsl(var(--warn))]/10 py-2"><p className="font-display text-2xl text-[hsl(var(--warn))]">{registres.length}</p><p className="text-xs text-muted-foreground">Registros</p></div>
                    <div className="rounded-lg bg-destructive/10 py-2"><p className="font-display text-2xl text-destructive">{totalIncidencies.length}</p><p className="text-xs text-muted-foreground">Incidencias</p></div>
                    <div className="rounded-lg bg-primary/10 py-2"><p className="font-display text-2xl text-primary">{totalRetreball.length}</p><p className="text-xs text-muted-foreground">Retrabajos</p></div>
                    <div className={`rounded-lg py-2 ${okCalidadMono ? 'bg-[hsl(var(--ok))]/10' : 'bg-secondary'}`}>
                        <p className={`font-display text-2xl ${okCalidadMono ? 'text-[hsl(var(--ok))]' : 'text-muted-foreground'}`}>{okCalidadMono ? 'Sí' : 'No'}</p>
                        <p className="text-xs text-muted-foreground">OK Calidad</p>
                    </div>
                </div>
            </div>

            <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="flex overflow-x-auto border-b border-border bg-secondary/30">
                    {TABS.map(t => (
                        <button key={t.id} onClick={() => setActiveTab(t.id)}
                            className={`whitespace-nowrap px-5 py-3 font-semibold text-sm transition ${activeTab === t.id ? 'border-b-2 border-primary text-primary bg-card' : 'text-muted-foreground hover:text-foreground'}`}>{t.label}</button>
                    ))}
                </div>
                {carregant ? (
                    <div className="p-6 grid gap-2">{[0,1,2,3].map(i=><div key={i} className="h-12 animate-pulse rounded bg-secondary"/>)}</div>
                ) : (
                    <div className="overflow-auto">
                        {activeTab === 'operacions' && (
                            <div>
                                <p className="px-4 pt-3 text-xs text-muted-foreground">OK confección = confirmación del operario de confección al cerrar la fase. No es el OK de Calidad del mono.</p>
                                <table className="w-full min-w-[980px] text-sm">
                                    <thead className="bg-secondary text-left text-xs uppercase"><tr>{['Codi','Operació','Fase','Màquina','Operari','Inici','Fi','Std (min)','Real (min)','Desv.','Estat','OK confección'].map(h=><th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
                                    <tbody className="divide-y divide-border">
                                        {operacionsAmbEstat.length === 0 && oksConfeccio.length === 0 ? (
                                            <tr><td colSpan={12} className="p-6 text-center text-muted-foreground">Sin operaciones en la ruta ni registros de confección.</td></tr>
                                        ) : (
                                            <>
                                                {operacionsAmbEstat.map(op => {
                                                    const r = op.lastReg; const realMin = r ? Math.round((r.temps_real_seg || 0) / 60) : null;
                                                    const desv = r && op.temps_std_min ? desvPct(r.temps_real_seg, op.temps_std_min * 60) : null;
                                                    const okC = r?.control_qualitat;
                                                    return (
                                                        <tr key={op.id} className={op.status === 'completada' ? 'bg-[hsl(var(--ok))]/3' : ''}>
                                                            <td className="px-3 py-2 font-mono text-xs">{op.codi}</td>
                                                            <td className="px-3 py-2 font-medium">{op.nom}</td>
                                                            <td className="px-3 py-2 text-muted-foreground text-xs">{op.fase || '—'}</td>
                                                            <td className="px-3 py-2 text-xs">{op.maquina || '—'}</td>
                                                            <td className="px-3 py-2 text-xs">{r?.expand?.operari?.name || r?.expand?.operari?.codi || '—'}</td>
                                                            <td className="px-3 py-2 text-xs tabular-nums">{r?.inici ? fmtDate(r.inici) : '—'}</td>
                                                            <td className="px-3 py-2 text-xs tabular-nums">{r?.fi ? fmtDate(r.fi) : '—'}</td>
                                                            <td className="px-3 py-2 tabular-nums text-muted-foreground">{op.temps_std_min || '—'}</td>
                                                            <td className="px-3 py-2 tabular-nums">{realMin ?? '—'}</td>
                                                            <td className="px-3 py-2 tabular-nums">{desv !== null ? <span className={desv > 10 ? 'text-destructive font-semibold' : desv > 0 ? 'text-[hsl(var(--warn))]' : 'text-[hsl(var(--ok))]'}>{desv > 0 ? '+' : ''}{desv}%</span> : '—'}</td>
                                                            <td className="px-3 py-2"><div className="flex items-center gap-1.5 flex-wrap"><Estat v={op.status}/>{op.reoperaciones > 0 && <span className="rounded bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))] px-1.5 py-0.5 text-xs font-semibold">{op.reoperaciones} reop.</span>}{op.es_opcional && <span className="rounded bg-secondary text-muted-foreground px-1.5 py-0.5 text-xs">Opc.</span>}</div></td>
                                                            <td className="px-3 py-2">
                                                                {okC === 'ok' ? <span className="rounded px-2 py-0.5 text-xs font-semibold uppercase bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]">OK fase</span>
                                                                    : okC === 'ko' ? <span className="rounded px-2 py-0.5 text-xs font-semibold uppercase bg-destructive/10 text-destructive">No OK</span>
                                                                    : <span className="text-xs text-muted-foreground">—</span>}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                                {operacionsAmbEstat.length === 0 && oksConfeccio.map((c) => (
                                                    <tr key={c.id}>
                                                        <td className="px-3 py-2 font-mono text-xs">—</td>
                                                        <td className="px-3 py-2 font-medium">{c.operacio}</td>
                                                        <td className="px-3 py-2 text-xs text-muted-foreground">—</td>
                                                        <td className="px-3 py-2 text-xs">—</td>
                                                        <td className="px-3 py-2 text-xs">{c.operari}</td>
                                                        <td className="px-3 py-2 text-xs">—</td>
                                                        <td className="px-3 py-2 text-xs tabular-nums">{fmtDate(c.data)}</td>
                                                        <td className="px-3 py-2">—</td>
                                                        <td className="px-3 py-2">—</td>
                                                        <td className="px-3 py-2">—</td>
                                                        <td className="px-3 py-2"><Estat v="completada"/></td>
                                                        <td className="px-3 py-2">
                                                            {c.resultat === 'ok' ? <span className="rounded px-2 py-0.5 text-xs font-semibold uppercase bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]">OK fase</span>
                                                                : <span className="rounded px-2 py-0.5 text-xs font-semibold uppercase bg-destructive/10 text-destructive">No OK</span>}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {activeTab === 'incidencies' && (totalIncidencies.length === 0 ? <p className="p-8 text-center text-muted-foreground">Sin incidencias registradas.</p> : (
                            <table className="w-full min-w-[700px] text-sm"><thead className="bg-secondary text-left text-xs uppercase"><tr>{['Operació','Tipus','Descripció','Operari','Fecha'].map(h=><th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead><tbody className="divide-y divide-border">{totalIncidencies.map((inc, i) => <tr key={i}><td className="px-3 py-2 text-xs">{inc.operacio}</td><td className="px-3 py-2"><span className="rounded bg-destructive/10 text-destructive px-2 py-0.5 text-xs font-semibold">{inc.tipus || '—'}</span></td><td className="px-3 py-2">{inc.descripcio || '—'}</td><td className="px-3 py-2 text-muted-foreground">{inc.operari}</td><td className="px-3 py-2 text-xs tabular-nums">{fmtDate(inc.data)}</td></tr>)}</tbody></table>
                        ))}
                        {activeTab === 'qualitat' && (() => {
                            const totalQcSeg = (controlsQC || []).reduce((a, c) => a + (Number(c.tiempo_qc_total_seg) || Number(c.temps_inspeccio_seg) || 0), 0);
                            const totalRetrSeg = (controlsQC || []).reduce((a, c) => a + (Number(c.tiempo_retrabajo_total_seg) || 0), 0);
                            return (
                            <div>
                                <div className={`mx-4 mt-3 rounded-xl border px-4 py-3 text-sm ${okCalidadMono ? 'border-[hsl(var(--ok))]/40 bg-[hsl(var(--ok))]/10 text-[hsl(var(--ok))]' : 'border-[hsl(var(--warn))]/40 bg-[hsl(var(--warn))]/10 text-[hsl(var(--warn))]'}`}>
                                    {okCalidadMono
                                        ? 'Este mono tiene OK de Calidad. Solo con este OK se considera aprobado para recoger (no basta el OK de confección).'
                                        : 'Sin OK de Calidad todavía. Los OK de confección de las fases no aprueban el mono: debe validarlo Calidad.'}
                                </div>
                                <div className="mx-4 mt-2 flex flex-wrap gap-2 text-xs">
                                    <span className="rounded-lg border border-border bg-card px-3 py-1.5">Tiempo de Calidad total: <strong className="tabular-nums text-blue-700">{fmtSegQC(totalQcSeg)}</strong></span>
                                    <span className="rounded-lg border border-border bg-card px-3 py-1.5">Tiempo de retrabajo: <strong className="tabular-nums text-[hsl(var(--warn))]">{fmtSegQC(totalRetrSeg)}</strong></span>
                                    <span className="rounded-lg border border-border bg-card px-3 py-1.5">Controles: <strong className="tabular-nums">{totalControls.length}</strong></span>
                                </div>
                                {totalControls.length === 0 ? (
                                    <p className="p-8 text-center text-muted-foreground">Sin controles de calidad registrados por el equipo de Calidad.</p>
                                ) : (
                                    <table className="w-full min-w-[900px] text-sm mt-2">
                                        <thead className="bg-secondary text-left text-xs uppercase">
                                            <tr>{['Tipo','Detalle','Resultado','Inspector','Inicio','Tiempo QC','Retrabajo','Estado','Finalización','Notas'].map(h=><th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {totalControls.map((c) => {
                                                const tieneTiempos = c.tempsInicial != null || c.tempsAdicional != null || c.temps != null;
                                                return (
                                                <tr key={c.id}>
                                                    <td className="px-3 py-2 text-xs">
                                                        <span className="rounded bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                                                            {c.origen === 'control_calidad' ? 'Por unidad' : 'Checklist QC'}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2 text-xs font-medium">{c.operacio}</td>
                                                    <td className="px-3 py-2"><Estat v={c.resultat}/></td>
                                                    <td className="px-3 py-2 font-semibold">{c.operari}</td>
                                                    <td className="px-3 py-2 text-xs tabular-nums">{fmtDate(c.data)}</td>
                                                    <td className="px-3 py-2 tabular-nums">
                                                        {tieneTiempos ? (
                                                            <div className="text-xs leading-tight">
                                                                <span className="font-semibold text-foreground">{fmtSegQC(c.temps)}</span>
                                                                {c.tempsInicial != null && <div className="text-muted-foreground">Inicial: {fmtSegQC(c.tempsInicial)}</div>}
                                                                {c.tempsAdicional != null && c.tempsAdicional > 0 && <div className="text-muted-foreground">Adicional: {fmtSegQC(c.tempsAdicional)}</div>}
                                                            </div>
                                                        ) : <span className="text-muted-foreground">—</span>}
                                                    </td>
                                                    <td className="px-3 py-2 tabular-nums text-xs">
                                                        {c.tempsRetrabajo != null && c.tempsRetrabajo > 0 ? (
                                                            <div className="leading-tight">
                                                                <span className="font-semibold text-[hsl(var(--warn))]">{fmtSegQC(c.tempsRetrabajo)}</span>
                                                                {c.retrabajosCount > 0 && <div className="text-muted-foreground">{c.retrabajosCount} retrabajo{c.retrabajosCount !== 1 ? 's' : ''}</div>}
                                                            </div>
                                                        ) : <span className="text-muted-foreground">—</span>}
                                                    </td>
                                                    <td className="px-3 py-2 text-xs">
                                                        {c.estado_qc ? <span className={`rounded px-2 py-0.5 font-semibold uppercase ${c.estado_qc === 'completado' ? 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]' : c.estado_qc === 'en_retrabajo' ? 'bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))]' : 'bg-blue-100 text-blue-700'}`}>{c.estado_qc}</span> : <span className="text-muted-foreground">—</span>}
                                                    </td>
                                                    <td className="px-3 py-2 text-xs tabular-nums">{c.updated ? fmtDate(c.updated) : '—'}</td>
                                                    <td className="px-3 py-2 text-muted-foreground max-w-xs truncate" title={c.notes}>{c.notes || '—'}</td>
                                                </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        );
                        })()}
                        {activeTab === 'retreball' && (totalRetreball.length === 0 ? <p className="p-8 text-center text-muted-foreground">Sin retrabajos registrados.</p> : (
                            <table className="w-full min-w-[600px] text-sm"><thead className="bg-secondary text-left text-xs uppercase"><tr>{['Operació','Operari','Temps real (min)','Fecha'].map(h=><th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead><tbody className="divide-y divide-border">{totalRetreball.map((r, i) => <tr key={i}><td className="px-3 py-2">{r.operacio}</td><td className="px-3 py-2">{r.operari}</td><td className="px-3 py-2 tabular-nums">{r.temps ? Math.round(r.temps / 60) : '—'}</td><td className="px-3 py-2 text-xs tabular-nums">{fmtDate(r.data)}</td></tr>)}</tbody></table>
                        ))}
                        {activeTab === 'grafic' && (
                            <div className="p-5">
                                {chartData.length === 0 ? <p className="text-center text-muted-foreground py-10">No hay datos suficientes.</p> : (
                                    <><p className="text-sm font-semibold mb-4">Tiempo estándar vs real por operación (min)</p>
                                    <ResponsiveContainer width="100%" height={320}>
                                        <BarChart data={chartData} margin={{top:5,right:20,bottom:40,left:0}}>
                                            <XAxis dataKey="nom" angle={-45} textAnchor="end" tick={{fontSize:10}} interval={0}/>
                                            <YAxis tick={{fontSize:11}}/>
                                            <Tooltip formatter={(v, name) => [`${v} min`, name === 'estandar' ? 'Estándar' : 'Real']}/>
                                            <Legend formatter={v => v === 'estandar' ? 'Estándar' : 'Real'}/>
                                            <Bar dataKey="estandar" fill="hsl(220,60%,50%)" opacity={0.6} name="estandar"/>
                                            <Bar dataKey="real" fill="hsl(22,92%,52%)" name="real"/>
                                        </BarChart>
                                    </ResponsiveContainer></>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

/* ─── Main exported component ─────────────────────────────────────────────── */
export default function ExclusivaDetall() {
    const [screen, setScreen] = useState('list');
    const [selectedExclusiva, setSelectedExclusiva] = useState(null);
    const [selectedMono, setSelectedMono] = useState(null);

    const handleSelectExclusiva = (ex) => { setSelectedExclusiva(ex); setSelectedMono(null); setScreen('exclusiva'); };
    const handleSelectMono = (mono) => { setSelectedMono(mono); setScreen('mono'); };
    const handleBack = () => {
        if (screen === 'mono') { setSelectedMono(null); setScreen('exclusiva'); }
        else if (screen === 'exclusiva') { setSelectedExclusiva(null); setScreen('list'); }
    };

    const breadcrumb = [
        { label: 'Exclusivas', active: screen === 'list', onClick: screen !== 'list' ? () => { setSelectedExclusiva(null); setSelectedMono(null); setScreen('list'); } : null },
        ...(selectedExclusiva ? [{ label: selectedExclusiva.exclusiva, active: screen === 'exclusiva', onClick: screen === 'mono' ? () => { setSelectedMono(null); setScreen('exclusiva'); } : null }] : []),
        ...(selectedMono ? [{ label: selectedMono.codi, active: true, onClick: null }] : []),
    ];

    return (
        <div>
            <nav className="mb-4 flex items-center gap-2 text-sm">
                {breadcrumb.map((b, i) => (
                    <React.Fragment key={b.label}>
                        {i > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground"/>}
                        {b.onClick ? <button onClick={b.onClick} className="text-primary hover:underline font-semibold">{b.label}</button> : <span className={b.active ? 'font-semibold text-foreground' : 'text-muted-foreground'}>{b.label}</span>}
                    </React.Fragment>
                ))}
            </nav>
            {screen === 'list' && <LlistaExclusives onSelect={handleSelectExclusiva}/>}
            {screen === 'exclusiva' && selectedExclusiva && <DetallExclusiva exclusiva={selectedExclusiva} onBack={handleBack} onSelectMono={handleSelectMono}/>}
            {screen === 'mono' && selectedMono && selectedExclusiva && <DetallMono mono={selectedMono} exclusiva={selectedExclusiva} onBack={handleBack}/>}
        </div>
    );
}

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, RefreshCcw, History, PackageCheck, Clock } from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/lib/auth';

const ESTADO_BADGE = {
    pendiente: 'bg-secondary text-secondary-foreground',
    conforme: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]',
    rechazada: 'bg-destructive/15 text-destructive',
};

/**
 * Per-unit quality control component.
 * Props:
 *  - exclusiva: the exclusiva record (must have id, unitats, exclusiva, article)
 *  - compact: optional, render a more compact variant
 *  - onStatusChange: optional callback(exclusivaId, newEstat) after updates
 */
export default function ControlCalidadUnidades({ exclusiva, compact = false, onStatusChange }) {
    const { user } = useAuth();
    const totalUnidades = Math.max(1, Number(exclusiva.unitats) || 0);
    const [unidades, setUnidades] = useState([]); // control_calidad records
    const [historial, setHistorial] = useState([]);
    const [carregant, setCarregant] = useState(true);
    const [desant, setDesant] = useState(null); // unidad_numero being saved
    const [showHistorial, setShowHistorial] = useState(false);
    const [obsEdit, setObsEdit] = useState({}); // { [unidad_numero]: text }

    const carrega = useCallback(async () => {
        setCarregant(true);
        try {
            const [cc, hc] = await Promise.all([
                pb.collection('control_calidad').getFullList({
                    filter: `exclusiva_id = "${exclusiva.id}"`,
                    sort: 'unidad_numero',
                    requestKey: `cc-unidades-${exclusiva.id}`,
                }).catch(() => []),
                pb.collection('historial_control_calidad').getFullList({
                    filter: `exclusiva_id = "${exclusiva.id}"`,
                    sort: '-created',
                    expand: 'usuario_id',
                    requestKey: `cc-historial-${exclusiva.id}`,
                }).catch(() => []),
            ]);
            setUnidades(cc);
            setHistorial(hc);
        } finally {
            setCarregant(false);
        }
    }, [exclusiva.id]);

    useEffect(() => { carrega(); }, [carrega]);

    // Build the full unit list (1..totalUnidades), merging stored records
    const unidadesMap = useMemo(() => {
        const m = {};
        unidades.forEach(u => { m[u.unidad_numero] = u; });
        return m;
    }, [unidades]);

    const listaUnidades = useMemo(() => {
        const arr = [];
        for (let i = 1; i <= totalUnidades; i++) {
            arr.push(unidadesMap[i] || { unidad_numero: i, estado: 'pendiente', observaciones: '', id: null });
        }
        return arr;
    }, [unidadesMap, totalUnidades]);

    const conformes = listaUnidades.filter(u => u.estado === 'conforme').length;
    const rechazadas = listaUnidades.filter(u => u.estado === 'rechazada').length;
    const pendientes = totalUnidades - conformes - rechazadas;
    const progreso = totalUnidades > 0 ? Math.round((conformes / totalUnidades) * 100) : 0;

    // Ensure records exist for all units (lazy creation on first interaction)
    const ensureRecord = async (unidadNumero) => {
        const existing = unidadesMap[unidadNumero];
        if (existing?.id) return existing;
        const rec = await pb.collection('control_calidad').create({
            exclusiva_id: exclusiva.id,
            unidad_numero: unidadNumero,
            estado: 'pendiente',
        }, { requestKey: `cc-create-${exclusiva.id}-${unidadNumero}` });
        setUnidades(prev => [...prev.filter(u => u.unidad_numero !== unidadNumero), rec]);
        return rec;
    };

    const computeExclusivaEstat = (lista) => {
        const conf = lista.filter(u => u.estado === 'conforme').length;
        const rej = lista.filter(u => u.estado === 'rechazada').length;
        if (rej > 0) return 'rechazado';
        if (conf === totalUnidades) return 'lista_recollida';
        if (conf > 0) return 'parcialmente_conforme';
        return exclusiva.estat; // leave as-is if nothing reviewed
    };

    const registrarHistorial = async (unidadNumero, estado, observaciones) => {
        try {
            await pb.collection('historial_control_calidad').create({
                exclusiva_id: exclusiva.id,
                unidad_numero: unidadNumero,
                estado,
                observaciones: observaciones || '',
                fecha: new Date().toISOString(),
                usuario_id: user?.id || undefined,
            }, { requestKey: `cc-hist-${exclusiva.id}-${unidadNumero}-${Date.now()}` });
        } catch (e) { console.error('historial cc failed', e); }
    };

    const actualizarUnidad = async (unidadNumero, nuevoEstado) => {
        setDesant(unidadNumero);
        try {
            const obs = obsEdit[unidadNumero] ?? unidadesMap[unidadNumero]?.observaciones ?? '';
            const rec = await ensureRecord(unidadNumero);
            const updated = await pb.collection('control_calidad').update(rec.id, {
                estado: nuevoEstado,
                observaciones: obs,
                fecha_revision: new Date().toISOString(),
                usuario_id: user?.id || undefined,
            }, { requestKey: `cc-update-${rec.id}` });

            setUnidades(prev => prev.map(u => u.id === rec.id ? updated : u));

            // Register history
            await registrarHistorial(unidadNumero, nuevoEstado, obs);

            // Recompute exclusiva estat
            const nuevaLista = listaUnidades.map(u =>
                u.unidad_numero === unidadNumero ? { ...u, estado: nuevoEstado, observaciones: obs } : u
            );
            const nuevoEstat = computeExclusivaEstat(nuevaLista);
            if (nuevoEstat !== exclusiva.estat && nuevoEstat !== 'parcialmente_conforme') {
                // Only auto-update to lista_recollida or rechazado; leave parcialmente_conforme handling to caller
                try {
                    await pb.collection('exclusives').update(exclusiva.id, { estat: nuevoEstat }, { requestKey: `cc-exestat-${exclusiva.id}` });
                    if (onStatusChange) onStatusChange(exclusiva.id, nuevoEstat);
                } catch (e) { console.error('update exclusiva estat failed', e); }
            } else if (nuevoEstat === 'parcialmente_conforme' && exclusiva.estat !== 'parcialmente_conforme') {
                try {
                    await pb.collection('exclusives').update(exclusiva.id, { estat: nuevoEstat }, { requestKey: `cc-exestat-${exclusiva.id}` });
                    if (onStatusChange) onStatusChange(exclusiva.id, nuevoEstat);
                } catch (e) { console.error('update exclusiva estat failed', e); }
            }

            // Refresh historial
            const hc = await pb.collection('historial_control_calidad').getFullList({
                filter: `exclusiva_id = "${exclusiva.id}"`,
                sort: '-created',
                expand: 'usuario_id',
                requestKey: `cc-historial-refresh-${exclusiva.id}`,
            }).catch(() => []);
            setHistorial(hc);
        } finally {
            setDesant(null);
        }
    };

    const guardarObs = async (unidadNumero) => {
        const obs = obsEdit[unidadNumero];
        if (obs === undefined) return;
        setDesant(unidadNumero);
        try {
            const rec = await ensureRecord(unidadNumero);
            const updated = await pb.collection('control_calidad').update(rec.id, { observaciones: obs }, { requestKey: `cc-obs-${rec.id}` });
            setUnidades(prev => prev.map(u => u.id === rec.id ? updated : u));
            setObsEdit(prev => { const n = { ...prev }; delete n[unidadNumero]; return n; });
        } finally { setDesant(null); }
    };

    if (carregant) {
        return <div className="p-4 grid gap-2">{[0,1,2].map(i => <div key={i} className="h-10 animate-pulse rounded bg-secondary" />)}</div>;
    }

    const todasConformes = conformes === totalUnidades;

    return (
        <div className="grid gap-4">
            {/* Summary header */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg bg-primary/10 px-3 py-2">
                    <p className="text-xs text-muted-foreground">Total unidades</p>
                    <p className="font-display text-2xl text-primary tabular-nums">{totalUnidades}</p>
                </div>
                <div className="rounded-lg bg-[hsl(var(--ok))]/10 px-3 py-2">
                    <p className="text-xs text-muted-foreground">Conformes</p>
                    <p className="font-display text-2xl text-[hsl(var(--ok))] tabular-nums">{conformes}</p>
                </div>
                <div className="rounded-lg bg-destructive/10 px-3 py-2">
                    <p className="text-xs text-muted-foreground">Rechazadas</p>
                    <p className="font-display text-2xl text-destructive tabular-nums">{rechazadas}</p>
                </div>
                <div className="rounded-lg bg-secondary px-3 py-2">
                    <p className="text-xs text-muted-foreground">Pendientes</p>
                    <p className="font-display text-2xl tabular-nums">{pendientes}</p>
                </div>
            </div>

            {/* Progress bar */}
            <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between text-sm mb-2">
                    <span className="font-semibold">Progreso control de calidad</span>
                    <span className={todasConformes ? 'text-[hsl(var(--ok))] font-bold' : 'text-muted-foreground'}>
                        {conformes}/{totalUnidades} conformes
                    </span>
                </div>
                <div className="h-3 w-full rounded-full bg-secondary overflow-hidden flex">
                    <div className="h-full bg-[hsl(var(--ok))] transition-all" style={{ width: `${(conformes / totalUnidades) * 100}%` }} />
                    <div className="h-full bg-destructive transition-all" style={{ width: `${(rechazadas / totalUnidades) * 100}%` }} />
                </div>
                {todasConformes ? (
                    <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-[hsl(var(--ok))]">
                        <PackageCheck className="h-4 w-4" /> Todas las unidades conformes — exclusiva lista para recoger
                    </p>
                ) : rechazadas > 0 ? (
                    <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-destructive">
                        <AlertTriangle className="h-4 w-4" /> {rechazadas} unidad{rechazadas !== 1 ? 'es' : ''} rechazada{rechazadas !== 1 ? 's' : ''} — requiere retrabajo
                    </p>
                ) : (
                    <p className="mt-2 text-sm text-muted-foreground">Marca cada unidad individualmente como conforme.</p>
                )}
            </div>

            {/* Units list — table on desktop, cards on mobile */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="hidden md:block overflow-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-secondary text-left text-xs uppercase">
                            <tr>
                                <th className="px-3 py-2 font-semibold">Unidad</th>
                                <th className="px-3 py-2 font-semibold">Estado</th>
                                <th className="px-3 py-2 font-semibold">Observaciones</th>
                                <th className="px-3 py-2 font-semibold">Revisado</th>
                                <th className="px-3 py-2 font-semibold text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {listaUnidades.map(u => {
                                const rec = unidadesMap[u.unidad_numero];
                                const isDesant = desant === u.unidad_numero;
                                return (
                                    <tr key={u.unidad_numero} className={u.estado === 'rechazada' ? 'bg-destructive/5' : u.estado === 'conforme' ? 'bg-[hsl(var(--ok))]/5' : ''}>
                                        <td className="px-3 py-2.5 font-display text-lg tabular-nums">#{u.unidad_numero}</td>
                                        <td className="px-3 py-2.5">
                                            <span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${ESTADO_BADGE[u.estado]}`}>{u.estado}</span>
                                        </td>
                                        <td className="px-3 py-2.5 max-w-xs">
                                            <input
                                                value={obsEdit[u.unidad_numero] ?? u.observaciones ?? ''}
                                                onChange={e => setObsEdit(prev => ({ ...prev, [u.unidad_numero]: e.target.value }))}
                                                onBlur={() => guardarObs(u.unidad_numero)}
                                                placeholder="Observaciones..."
                                                className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                                            />
                                        </td>
                                        <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums">
                                            {rec?.fecha_revision ? new Date(rec.fecha_revision).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <div className="flex justify-end gap-1.5">
                                                <button
                                                    onClick={() => actualizarUnidad(u.unidad_numero, 'conforme')}
                                                    disabled={isDesant || u.estado === 'conforme'}
                                                    className="flex items-center gap-1 rounded-lg border-2 border-[hsl(var(--ok))]/50 bg-[hsl(var(--ok))]/10 px-3 h-9 text-xs font-semibold text-[hsl(var(--ok))] hover:bg-[hsl(var(--ok))]/20 active:scale-95 disabled:opacity-40">
                                                    <CheckCircle2 className="h-4 w-4" /> Conforme
                                                </button>
                                                <button
                                                    onClick={() => actualizarUnidad(u.unidad_numero, 'rechazada')}
                                                    disabled={isDesant || u.estado === 'rechazada'}
                                                    className="flex items-center gap-1 rounded-lg border-2 border-destructive/50 bg-destructive/10 px-3 h-9 text-xs font-semibold text-destructive hover:bg-destructive/20 active:scale-95 disabled:opacity-40">
                                                    <XCircle className="h-4 w-4" /> Rechazar
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden divide-y divide-border">
                    {listaUnidades.map(u => {
                        const rec = unidadesMap[u.unidad_numero];
                        const isDesant = desant === u.unidad_numero;
                        return (
                            <div key={u.unidad_numero} className={`p-4 ${u.estado === 'rechazada' ? 'bg-destructive/5' : u.estado === 'conforme' ? 'bg-[hsl(var(--ok))]/5' : ''}`}>
                                <div className="flex items-center justify-between gap-2 mb-3">
                                    <span className="font-display text-2xl tabular-nums">Unidad #{u.unidad_numero}</span>
                                    <span className={`rounded px-2 py-1 text-xs font-semibold uppercase ${ESTADO_BADGE[u.estado]}`}>{u.estado}</span>
                                </div>
                                <input
                                    value={obsEdit[u.unidad_numero] ?? u.observaciones ?? ''}
                                    onChange={e => setObsEdit(prev => ({ ...prev, [u.unidad_numero]: e.target.value }))}
                                    onBlur={() => guardarObs(u.unidad_numero)}
                                    placeholder="Observaciones..."
                                    className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm mb-3"
                                />
                                {rec?.fecha_revision && (
                                    <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
                                        <Clock className="h-3 w-3" /> Revisado: {new Date(rec.fecha_revision).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                )}
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => actualizarUnidad(u.unidad_numero, 'conforme')}
                                        disabled={isDesant || u.estado === 'conforme'}
                                        className="flex items-center justify-center gap-1.5 rounded-xl border-2 border-[hsl(var(--ok))]/50 bg-[hsl(var(--ok))]/10 px-3 h-12 text-sm font-semibold text-[hsl(var(--ok))] active:scale-95 disabled:opacity-40">
                                        <CheckCircle2 className="h-5 w-5" /> Conforme
                                    </button>
                                    <button
                                        onClick={() => actualizarUnidad(u.unidad_numero, 'rechazada')}
                                        disabled={isDesant || u.estado === 'rechazada'}
                                        className="flex items-center justify-center gap-1.5 rounded-xl border-2 border-destructive/50 bg-destructive/10 px-3 h-12 text-sm font-semibold text-destructive active:scale-95 disabled:opacity-40">
                                        <XCircle className="h-5 w-5" /> Rechazar
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Historial toggle */}
            {!compact && (
                <div className="rounded-xl border border-border bg-card p-4">
                    <button onClick={() => setShowHistorial(v => !v)} className="flex items-center gap-2 text-sm font-semibold w-full justify-between">
                        <span className="flex items-center gap-2"><History className="h-4 w-4" /> Historial de revisiones ({historial.length})</span>
                        <RefreshCcw className="h-4 w-4 text-muted-foreground" />
                    </button>
                    {showHistorial && (
                        <div className="mt-3 overflow-auto max-h-80">
                            {historial.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-4 text-center">Sin revisiones registradas.</p>
                            ) : (
                                <table className="w-full min-w-[500px] text-sm">
                                    <thead className="bg-secondary text-left text-xs uppercase sticky top-0">
                                        <tr>
                                            <th className="px-3 py-2 font-semibold">Unidad</th>
                                            <th className="px-3 py-2 font-semibold">Estado</th>
                                            <th className="px-3 py-2 font-semibold">Observaciones</th>
                                            <th className="px-3 py-2 font-semibold">Usuario</th>
                                            <th className="px-3 py-2 font-semibold">Fecha</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {historial.map(h => (
                                            <tr key={h.id}>
                                                <td className="px-3 py-2 font-semibold tabular-nums">#{h.unidad_numero}</td>
                                                <td className="px-3 py-2"><span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${ESTADO_BADGE[h.estado]}`}>{h.estado}</span></td>
                                                <td className="px-3 py-2 text-xs max-w-xs truncate">{h.observaciones || '—'}</td>
                                                <td className="px-3 py-2 text-xs">{h.expand?.usuario_id?.name || '—'}</td>
                                                <td className="px-3 py-2 text-xs tabular-nums">{h.fecha ? new Date(h.fecha).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

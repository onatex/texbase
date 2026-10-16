import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, History, Loader2, X } from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/lib/auth';

const ESTAT_BADGE = {
    pendent: 'bg-secondary text-muted-foreground',
    recibida: 'bg-secondary text-muted-foreground',
    en_curs: 'bg-[hsl(var(--warn))]/20 text-[hsl(var(--warn))]',
    en_progreso: 'bg-[hsl(var(--warn))]/20 text-[hsl(var(--warn))]',
    pendent_produccio: 'bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))]',
    finalitzada: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]',
    entregada: 'bg-primary/10 text-primary',
    lista_recollida: 'bg-[hsl(var(--ok))]/20 text-[hsl(var(--ok))]',
    listo_para_entregar: 'bg-[hsl(var(--ok))]/20 text-[hsl(var(--ok))]',
    bloquejada: 'bg-destructive/10 text-destructive',
    retrasada: 'bg-destructive/15 text-destructive',
    en_retrabajo: 'bg-destructive/10 text-destructive',
    pendiente_calidad: 'bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))]',
    pendiente_revision: 'bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))]',
    rechazada: 'bg-destructive/10 text-destructive',
    parcialmente_conforme: 'bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))]',
};

// Estados que NO deben actualizarse automáticamente (requieren aprobación explícita)
const BLOQUEADOS = ['finalitzada', 'entregada', 'lista_recollida', 'listo_para_entregar', 'rechazada'];
const CALIDAD = ['pendiente_calidad', 'pendiente_revision', 'en_retrabajo', 'parcialmente_conforme'];

/**
 * Modal para aplicar cambios de ruta/operación a exclusivas existentes.
 *
 * Props:
 * - open: boolean
 * - onClose: () => void
 * - titulo: string
 * - descripcion: string (descripción del cambio aplicado)
 * - tipoCambio: "ruta_actualizada" | "operacion_anadida" | "operacion_modificada"
 * - rutaId: string (id de la ruta nueva/afectada)
 * - rutaNombre: string
 * - operacionNombre?: string (para cambios de operación)
 * - operacionId?: string
 * - exclusivas: array de records de exclusives ya cargados (los candidatos)
 * - onCompletado?: (resumen) => void
 */
export default function ActualizarExclusivasModal({
    open, onClose, titulo, descripcion, tipoCambio,
    rutaId, rutaNombre, operacionNombre, operacionId,
    exclusivas = [], onCompletado,
}) {
    const { user } = useAuth();
    const [seleccionadas, setSeleccionadas] = useState(new Set());
    const [aplicando, setAplicando] = useState(false);
    const [resumen, setResumen] = useState(null);
    const [error, setError] = useState('');

    // Reset al abrir
    useEffect(() => {
        if (open) {
            // Pre-seleccionar solo las actualizables (no bloqueadas)
            const pre = new Set(
                exclusivas
                    .filter((e) => !BLOQUEADOS.includes(e.estat))
                    .map((e) => e.id),
            );
            setSeleccionadas(pre);
            setResumen(null);
            setError('');
        }
    }, [open, exclusivas]);

    const { actualizables, bloqueadas, calidad, sinRuta } = useMemo(() => {
        const act = [], bloq = [], cal = [], sinR = [];
        for (const e of exclusivas) {
            if (BLOQUEADOS.includes(e.estat)) bloq.push(e);
            else if (CALIDAD.includes(e.estat)) cal.push(e);
            else act.push(e);
            if (!e.ruta) sinR.push(e);
        }
        return { actualizables: act, bloqueadas: bloq, calidad: cal, sinRuta: sinR };
    }, [exclusivas]);

    if (!open) return null;

    const toggle = (id) => {
        setSeleccionadas((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const seleccionarTodas = () => {
        setSeleccionadas(new Set(exclusivas.filter((e) => !BLOQUEADOS.includes(e.estat)).map((e) => e.id)));
    };
    const deseleccionarTodas = () => setSeleccionadas(new Set());

    // Calcular minuts_previstos para una exclusiva según la ruta
    const calcularMinuts = async (exclusiva) => {
        try {
            const ops = await pb.collection('operacions_def').getFullList({
                filter: `ruta = "${rutaId}"`,
                requestKey: `calc-ops-${rutaId}-${exclusiva.id}`,
            }).catch(() => []);
            const minPerUnit = ops.reduce((a, o) => a + (Number(o.temps_std_min) || 0), 0);
            // Si no hay operacions_def, intentar desde rutes.operacions JSON
            if (minPerUnit === 0) {
                const ruta = await pb.collection('rutes').getOne(rutaId, { requestKey: `calc-ruta-${rutaId}-${exclusiva.id}` }).catch(() => null);
                const jsonOps = ruta?.operacions || [];
                const jsonMin = jsonOps.reduce((a, o) => a + (Number(o.temps_estandard_min || o.temps_std_min) || 0), 0);
                return Math.round(jsonMin * (Number(exclusiva.unitats) || 1));
            }
            return Math.round(minPerUnit * (Number(exclusiva.unitats) || 1));
        } catch (_) {
            return Number(exclusiva.minuts_previstos) || 0;
        }
    };

    const aplicar = async () => {
        if (seleccionadas.size === 0) {
            setError('Selecciona al menos una exclusiva para actualizar.');
            return;
        }
        setAplicando(true);
        setError('');
        const ahora = new Date().toISOString();
        let ok = 0, fallidas = 0;
        const notificarUsuarios = new Set();

        for (const id of seleccionadas) {
            const excl = exclusivas.find((e) => e.id === id);
            if (!excl) continue;
            try {
                const minutsNuevo = await calcularMinuts(excl);
                const minutsAnterior = Number(excl.minuts_previstos) || 0;
                const rutaAnteriorNom = excl.ruta || '';
                const updateData = { minuts_previstos: minutsNuevo };
                // Si es cambio de ruta, actualizar el campo ruta
                if (tipoCambio === 'ruta_actualizada' && rutaId) {
                    updateData.ruta = rutaId;
                }
                await pb.collection('exclusives').update(id, updateData, { requestKey: `upd-excl-${id}` });

                // Guardar historial
                await pb.collection('historial_cambios_exclusivas').create({
                    exclusiva_id: id,
                    tipo_cambio: tipoCambio,
                    ruta_anterior: rutaAnteriorNom,
                    ruta_nueva: rutaNombre || rutaId || '',
                    operacion_id: operacionId || '',
                    operacion_nombre: operacionNombre || '',
                    cambio_descripcion: descripcion,
                    minuts_anterior: minutsAnterior,
                    minuts_nuevo: minutsNuevo,
                    usuario_id: user?.id || null,
                    fecha_cambio: ahora,
                }, { requestKey: `hist-${id}` }).catch(() => {});

                ok += 1;
            } catch (e) {
                console.error('Error actualizando exclusiva', id, e);
                fallidas += 1;
            }
        }

        // Notificar a Producción + Admin/Super Admin
        try {
            const dest = await pb.collection('users').getFullList({
                filter: "rol = 'produccio' || rol = 'admin' || rol = 'superadmin'",
                requestKey: 'notif-dest-ruta',
            }).catch(() => []);
            const titol = tipoCambio === 'ruta_actualizada'
                ? `Ruta actualizada en ${ok} exclusiva(s)`
                : tipoCambio === 'operacion_anadida'
                    ? `Operación añadida en ${ok} exclusiva(s)`
                    : `Operación modificada en ${ok} exclusiva(s)`;
            const missatge = `${rutaNombre || ''}${operacionNombre ? ' · ' + operacionNombre : ''} — ${descripcion}`;
            await Promise.all(dest.map((a, i) =>
                pb.collection('notifications').create({
                    destinatari: a.id,
                    tipus: tipoCambio,
                    titol,
                    missatge,
                    link_id: rutaId || '',
                    llegida: false,
                }, { requestKey: `notif-ruta-${i}` }).catch(() => {}),
            ));
        } catch (e) { console.error('Error notificando', e); }

        setResumen({ ok, fallidas, total: seleccionadas.size });
        setAplicando(false);
        onCompletado && onCompletado({ ok, fallidas, total: seleccionadas.size });
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div className="modal-card w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-card px-5 py-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <History className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <p className="font-display text-xl uppercase truncate">{titulo || 'Actualizar exclusivas'}</p>
                            <p className="text-xs text-muted-foreground truncate">{descripcion}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="rounded-md p-2 hover:bg-secondary shrink-0"><X className="h-5 w-5" /></button>
                </div>

                <div className="p-5 space-y-4">
                    {resumen ? (
                        /* ── Resumen final ── */
                        <div className="text-center py-8">
                            <CheckCircle2 className="mx-auto h-12 w-12 text-[hsl(var(--ok))] mb-3" />
                            <p className="font-display text-2xl uppercase">{resumen.ok} exclusiva(s) actualizada(s)</p>
                            {resumen.fallidas > 0 && (
                                <p className="mt-1 text-sm text-destructive">{resumen.fallidas} fallida(s)</p>
                            )}
                            <p className="mt-2 text-sm text-muted-foreground">
                                Tiempos recalculados y historial registrado. Producción y dirección han sido notificadas.
                            </p>
                            <button onClick={onClose} className="mt-5 h-11 rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground">
                                Cerrar
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* Advertencias */}
                            {bloqueadas.length > 0 && (
                                <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                    <span><strong>{bloqueadas.length}</strong> exclusiva(s) completada(s)/entregada(s) no se actualizarán automáticamente.</span>
                                </div>
                            )}
                            {calidad.length > 0 && (
                                <div className="flex items-start gap-2 rounded-lg bg-[hsl(var(--warn))]/10 p-3 text-sm text-[hsl(var(--warn))]">
                                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                    <span><strong>{calidad.length}</strong> exclusiva(s) en calidad/retrabajo — revisa antes de confirmar.</span>
                                </div>
                            )}

                            {/* Controles */}
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-semibold">
                                    {exclusivas.length} exclusiva(s) afectada(s) · {seleccionadas.size} seleccionada(s)
                                </p>
                                <div className="flex gap-2">
                                    <button onClick={seleccionarTodas} className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-secondary">
                                        Seleccionar todas
                                    </button>
                                    <button onClick={deseleccionarTodas} className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-secondary">
                                        Deseleccionar todas
                                    </button>
                                </div>
                            </div>

                            {/* Tabla */}
                            <div className="overflow-auto rounded-lg border border-border max-h-[40vh]">
                                <table className="w-full min-w-[640px] text-sm">
                                    <thead className="bg-secondary text-left text-xs uppercase sticky top-0">
                                        <tr>
                                            <th className="px-3 py-2 w-10"></th>
                                            <th className="px-3 py-2 font-semibold">Exclusiva</th>
                                            <th className="px-3 py-2 font-semibold">Referencia</th>
                                            <th className="px-3 py-2 font-semibold">Estado</th>
                                            <th className="px-3 py-2 font-semibold">Ruta actual</th>
                                            <th className="px-3 py-2 font-semibold text-right">Min. previstos</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {exclusivas.length === 0 ? (
                                            <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No hay exclusivas que coincidan.</td></tr>
                                        ) : exclusivas.map((e) => {
                                            const bloqueada = BLOQUEADOS.includes(e.estat);
                                            const sel = seleccionadas.has(e.id);
                                            return (
                                                <tr key={e.id} className={bloqueada ? 'opacity-50' : sel ? 'bg-primary/5' : 'hover:bg-secondary/30'}>
                                                    <td className="px-3 py-2 text-center">
                                                        <input
                                                            type="checkbox"
                                                            checked={sel}
                                                            disabled={bloqueada}
                                                            onChange={() => toggle(e.id)}
                                                            className="h-4 w-4 rounded"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2 font-mono font-semibold">{e.exclusiva}</td>
                                                    <td className="px-3 py-2 text-xs">{e.referencia || e.article || '—'}</td>
                                                    <td className="px-3 py-2">
                                                        <span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${ESTAT_BADGE[e.estat] || 'bg-secondary'}`}>
                                                            {e.estat || '—'}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2 text-xs text-muted-foreground">{e.ruta ? (e.ruta === rutaId ? rutaNombre : 'otra') : '—'}</td>
                                                    <td className="px-3 py-2 text-right tabular-nums">{e.minuts_previstos || 0}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

                            {/* Botones */}
                            <div className="flex gap-3 pt-2">
                                <button onClick={aplicar} disabled={aplicando || seleccionadas.size === 0}
                                    className="flex h-12 flex-1 items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground font-semibold disabled:opacity-50">
                                    {aplicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                    {aplicando ? 'Actualizando...' : `Actualizar ${seleccionadas.size} exclusiva(s) seleccionada(s)`}
                                </button>
                                <button onClick={onClose} disabled={aplicando}
                                    className="h-12 rounded-md bg-secondary px-5 font-semibold disabled:opacity-50">Cancelar</button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

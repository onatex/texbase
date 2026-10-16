import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, RefreshCcw, X, ChevronRight, ChevronLeft, Volume2, VolumeX } from 'lucide-react';
import pb from '@/lib/pocketbaseClient';

/**
 * Popup automático que aparece cuando se asigna un retrabajo al operario.
 * - Escucha en tiempo real + polling cada 8s la colección `notifications`
 *   (tipus = "retrabajo_asignado", no llegida, destinatari = usuario actual).
 * - Para cada notificación no vista, carga el retrabajo (link_id) con expand
 *   de exclusiva y mono, y muestra un modal con los detalles.
 * - "Ver retrabajo" → marca la notificación como leída y llama onVerRetrabajo.
 * - "Cerrar" → marca como leída y descarta el popup.
 * - Reproduce un sonido de aviso al aparecer (mutable).
 * - Si hay varios retrabajos pendientes, se navega uno a uno.
 */
export default function RetrabajoPopup({ userId, onVerRetrabajo }) {
    const [pendents, setPendents] = useState([]); // [{ notif, retrabajo }]
    const [idx, setIdx] = useState(0);
    const [soActiu, setSoActiu] = useState(true);
    const soRef = useRef(true);
    const vistosRef = useRef(new Set()); // ids ya cargados en esta sesión

    soRef.current = soActiu;

    const tocarSo = useCallback(() => {
        if (!soRef.current) return;
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const tocarNota = (freq, start, dur) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq;
                osc.connect(gain);
                gain.connect(ctx.destination);
                const t0 = ctx.currentTime + start;
                gain.gain.setValueAtTime(0.0001, t0);
                gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
                osc.start(t0);
                osc.stop(t0 + dur + 0.05);
            };
            // Dos tonos ascendentes tipo "aviso"
            tocarNota(660, 0, 0.18);
            tocarNota(990, 0.22, 0.28);
            setTimeout(() => { try { ctx.close(); } catch { /* silent */ } }, 800);
        } catch { /* silent */ }
    }, []);

    const carregaNotifs = useCallback(async () => {
        if (!userId) return;
        try {
            const list = await pb.collection('notifications').getFullList({
                filter: `destinatari = "${userId}" && tipus = "retrabajo_asignado" && llegida = false`,
                sort: '-created',
                requestKey: 'retr-popup-notifs',
            });
            // Cargar detalles de retrabajo para los que aún no tenemos
            const noves = [];
            for (const n of list) {
                if (vistosRef.current.has(n.id)) continue;
                vistosRef.current.add(n.id);
                if (n.link_id) {
                    try {
                        const retr = await pb.collection('retrabajos').getOne(n.link_id, {
                            expand: 'exclusiva,mono',
                            requestKey: `retr-popup-${n.link_id}`,
                        });
                        noves.push({ notif: n, retrabajo: retr });
                    } catch {
                        // retrabajo no encontrado → marcar leída para no reintentar
                        try {
                            await pb.collection('notifications').update(n.id, { llegida: true }, { requestKey: `retr-popup-clean-${n.id}` });
                        } catch { /* silent */ }
                    }
                } else {
                    noves.push({ notif: n, retrabajo: null });
                }
            }
            if (noves.length > 0) {
                setPendents((prev) => [...prev, ...noves]);
                tocarSo();
            }
        } catch { /* silent */ }
    }, [userId, tocarSo]);

    // Carga inicial + polling cada 8s
    useEffect(() => {
        carregaNotifs();
        const t = setInterval(carregaNotifs, 8000);
        return () => clearInterval(t);
    }, [carregaNotifs]);

    // Realtime: refrescar al instante cuando llega una notificación nueva
    useEffect(() => {
        if (!userId) return undefined;
        const refresca = () => carregaNotifs();
        void pb.collection('notifications').subscribe('*', refresca).catch(() => {});
        return () => { void pb.collection('notifications').unsubscribe('*').catch(() => {}); };
    }, [userId, carregaNotifs]);

    const actual = pendents[idx] || null;

    const marcarLlegida = useCallback(async (notifId) => {
        try {
            await pb.collection('notifications').update(notifId, { llegida: true }, { requestKey: `retr-popup-read-${notifId}` });
        } catch { /* silent */ }
    }, []);

    const treureActual = () => {
        setPendents((prev) => {
            const next = prev.filter((_, i) => i !== idx);
            setIdx((cur) => (cur >= next.length ? Math.max(0, next.length - 1) : cur));
            return next;
        });
    };

    const tancar = async () => {
        if (!actual) return;
        const notifId = actual.notif.id;
        treureActual();
        await marcarLlegida(notifId);
    };

    const verRetrabajo = async () => {
        if (!actual) return;
        const notifId = actual.notif.id;
        const retr = actual.retrabajo;
        treureActual();
        await marcarLlegida(notifId);
        if (onVerRetrabajo) onVerRetrabajo(retr);
    };

    const seguent = () => setIdx((i) => Math.min(i + 1, pendents.length - 1));
    const anterior = () => setIdx((i) => Math.max(i - 1, 0));

    if (!actual) return null;

    const r = actual.retrabajo;
    const ex = r?.expand?.exclusiva;
    const mono = r?.expand?.mono;
    const exclusivaNom = ex?.exclusiva || '—';
    const article = ex?.article || ex?.referencia || '';
    const operacion = r?.operacion_original || '—';
    const fase = r?.fase || '';
    const motivo = r?.motivo_rechazo || '';
    const notas = r?.notas || '';
    const intento = r?.numero_intento || 1;
    const fotos = Array.isArray(r?.fotos_antes) ? r.fotos_antes : [];
    const total = pendents.length;

    return (
        <>
            {/* Botón mute flotante (solo cuando hay popup) */}
            <button
                onClick={() => setSoActiu((s) => !s)}
                className="fixed bottom-4 right-4 z-[60] flex h-10 w-10 items-center justify-center rounded-full bg-card border border-border shadow-lg active:scale-95"
                aria-label={soActiu ? 'Silenciar sonido' : 'Activar sonido'}
                title={soActiu ? 'Silenciar sonido' : 'Activar sonido'}
            >
                {soActiu ? <Volume2 className="h-5 w-5 text-primary" /> : <VolumeX className="h-5 w-5 text-muted-foreground" />}
            </button>

            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
                <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-card shadow-2xl">
                    {/* Cabecera */}
                    <div className="stripe-top h-2" />
                    <div className="flex items-center justify-between gap-3 bg-destructive px-5 py-4 text-white">
                        <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/20">
                                <RefreshCcw className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="font-display text-2xl uppercase leading-none">Retrabajo asignado</p>
                                <p className="text-xs text-white/80">Tienes un nuevo retrabajo prioritario</p>
                            </div>
                        </div>
                        <button onClick={tancar} className="rounded-md bg-white/15 p-2 hover:bg-white/25 active:scale-95" aria-label="Cerrar">
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    {/* Cuerpo */}
                    <div className="max-h-[60vh] overflow-y-auto p-5">
                        {/* Contador si hay varios */}
                        {total > 1 && (
                            <div className="mb-3 flex items-center justify-between rounded-lg bg-secondary px-3 py-2">
                                <button onClick={anterior} disabled={idx === 0}
                                    className="rounded-md bg-card p-1.5 disabled:opacity-40 active:scale-95">
                                    <ChevronLeft className="h-4 w-4" />
                                </button>
                                <span className="text-sm font-bold tabular-nums">{idx + 1} / {total} retrabajos</span>
                                <button onClick={seguent} disabled={idx === total - 1}
                                    className="rounded-md bg-card p-1.5 disabled:opacity-40 active:scale-95">
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>
                        )}

                        {/* Exclusiva + artículo */}
                        <div className="rounded-xl border-2 border-destructive/30 bg-destructive/5 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-destructive">Exclusiva</p>
                            <p className="font-display text-4xl uppercase leading-none text-foreground">{exclusivaNom}</p>
                            {article && (
                                <p className="mt-1 text-base font-bold text-primary">{article}</p>
                            )}
                            {mono?.codi && (
                                <p className="text-sm font-semibold text-muted-foreground">Mono {mono.codi}{mono.talla ? ` · Talla ${mono.talla}` : ''}</p>
                            )}
                            <span className="mt-2 inline-flex rounded-md bg-destructive px-2.5 py-1 text-xs font-bold uppercase text-white">
                                Intento #{intento}
                            </span>
                        </div>

                        {/* Operación / fase */}
                        <div className="mt-3 rounded-xl bg-secondary/60 p-4">
                            <p className="text-xs font-semibold uppercase text-muted-foreground">Operación a retrabajar</p>
                            <p className="text-lg font-bold">{operacion}</p>
                            {fase && <p className="text-sm text-muted-foreground">{fase}</p>}
                        </div>

                        {/* Motivo del rechazo */}
                        {motivo && (
                            <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase text-destructive">
                                    <AlertTriangle className="h-3.5 w-3.5" /> Motivo del rechazo
                                </p>
                                <p className="mt-1 text-sm">{motivo}</p>
                            </div>
                        )}

                        {/* Notas de Calidad */}
                        {notas && (
                            <div className="mt-3 rounded-xl bg-primary/10 p-4">
                                <p className="text-xs font-semibold uppercase text-primary">Notas de Calidad</p>
                                <p className="mt-1 text-sm italic">{notas}</p>
                            </div>
                        )}

                        {/* Fotos del rechazo */}
                        {fotos.length > 0 && (
                            <div className="mt-3">
                                <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Fotos del rechazo</p>
                                <div className="flex flex-wrap gap-2">
                                    {fotos.map((f, i) => (
                                        <a key={i}
                                            href={pb.files.getURL({ collectionId: r.collectionId, id: r.id }, f)}
                                            target="_blank" rel="noreferrer">
                                            <img
                                                src={pb.files.getURL({ collectionId: r.collectionId, id: r.id }, f, { thumb: '200x200' })}
                                                alt={`rechazo ${i + 1}`}
                                                className="h-20 w-20 rounded-lg object-cover border-2 border-destructive/30"
                                            />
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Botones */}
                    <div className="grid grid-cols-2 gap-3 border-t border-border p-4">
                        <button onClick={tancar}
                            className="h-14 rounded-xl bg-secondary font-semibold active:scale-[0.98] transition">
                            Cerrar
                        </button>
                        <button onClick={verRetrabajo}
                            className="flex h-14 items-center justify-center gap-2 rounded-xl bg-destructive text-lg font-bold text-white active:scale-[0.98] transition">
                            <RefreshCcw className="h-5 w-5" /> Ver retrabajo
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}

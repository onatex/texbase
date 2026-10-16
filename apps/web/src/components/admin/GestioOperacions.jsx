import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Lock, Pause, RefreshCcw, Unlock } from 'lucide-react';
import pb from '@/lib/pocketbaseClient';

function elapsed(inici) {
    if (!inici) return '—';
    const segs = Math.floor((Date.now() - new Date(inici).getTime()) / 1000);
    const m = Math.floor(segs / 60);
    const s = segs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function GestioOperacions() {
    const [registres, setRegistres] = useState([]);
    const [exclusives, setExclusives] = useState([]);
    const [carregant, setCarregant] = useState(true);
    const [tick, setTick] = useState(0);
    const [actionMsg, setActionMsg] = useState(null);
    const [dialeg, setDialeg] = useState(null);
    const [motiuBloqueig, setMotiuBloqueig] = useState('');
    const [doing, setDoing] = useState(false);

    const carrega = useCallback(async () => {
        try {
            const [regs, exs] = await Promise.all([
                pb.collection('registres').getFullList({
                    filter: 'estat = "en_curs" || estat = "pausat"',
                    sort: '-inici',
                    expand: 'operari,mono,exclusiva',
                    requestKey: 'gestio-ops-regs',
                }),
                pb.collection('exclusives').getFullList({
                    sort: 'exclusiva',
                    requestKey: 'gestio-ops-exs',
                }),
            ]);
            setRegistres(regs);
            setExclusives(exs);
        } catch (e) { console.error(e); }
        finally { setCarregant(false); }
    }, []);

    useEffect(() => { carrega(); }, [carrega]);

    useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 1000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        const id = setInterval(carrega, 15000);
        return () => clearInterval(id);
    }, [carrega]);

    const showMsg = (msg, ok = true) => {
        setActionMsg({ msg, ok });
        setTimeout(() => setActionMsg(null), 4000);
    };

    const handlePausar = async (reg) => {
        setDoing(true);
        try {
            await pb.collection('registres').update(reg.id, { estat: 'pausat' }, { requestKey: `pause-${reg.id}` });
            showMsg(`Operación pausada: ${reg.operacio}`);
            carrega();
        } catch { showMsg('Error al pausar', false); }
        finally { setDoing(false); setDialeg(null); }
    };

    const handleReanudar = async (reg) => {
        setDoing(true);
        try {
            await pb.collection('registres').update(reg.id, { estat: 'en_curs' }, { requestKey: `resume-${reg.id}` });
            showMsg(`Operación reanudada: ${reg.operacio}`);
            carrega();
        } catch { showMsg('Error al reanudar', false); }
        finally { setDoing(false); }
    };

    const handleTerminar = async (reg) => {
        setDoing(true);
        try {
            const segs = Math.floor((Date.now() - new Date(reg.inici).getTime()) / 1000);
            await pb.collection('registres').update(reg.id, {
                fi: new Date().toISOString(),
                estat: 'finalitzat',
                control_qualitat: 'ok',
                temps_real_seg: segs,
            }, { requestKey: `finish-${reg.id}` });
            // Update mono state
            if (reg.expand?.mono?.id) {
                await pb.collection('monos').update(reg.expand.mono.id, {
                    estat: 'en_curs',
                    operacio_actual: reg.operacio,
                }, { requestKey: `finish-mono-${reg.id}` });
            }
            showMsg(`Operación terminada: ${reg.operacio}`);
            carrega();
        } catch { showMsg('Error al terminar', false); }
        finally { setDoing(false); setDialeg(null); }
    };

    const handleBloquear = async (exId) => {
        setDoing(true);
        try {
            const activos = registres.filter(r => r.exclusiva === exId && r.estat === 'en_curs');
            await Promise.all(activos.map((r, i) =>
                pb.collection('registres').update(r.id, { estat: 'pausat' }, { requestKey: `blk-reg-${i}` })
            ));
            await pb.collection('exclusives').update(exId, {
                estat: 'bloquejada',
                motiu_bloqueig: motiuBloqueig || 'Bloqueada por administración',
            }, { requestKey: `blk-ex-${exId}` });
            showMsg('Exclusiva bloqueada y operaciones pausadas');
            setMotiuBloqueig('');
            carrega();
        } catch { showMsg('Error al bloquear', false); }
        finally { setDoing(false); setDialeg(null); }
    };

    const handleDesbloquear = async (exId) => {
        setDoing(true);
        try {
            await pb.collection('exclusives').update(exId, {
                estat: 'en_curs',
                motiu_bloqueig: '',
            }, { requestKey: `unblk-ex-${exId}` });
            showMsg('Exclusiva desbloqueada');
            carrega();
        } catch { showMsg('Error al desbloquear', false); }
        finally { setDoing(false); }
    };

    const perExclusiva = useMemo(() => {
        const map = new Map();
        for (const r of registres) {
            const exId = r.exclusiva;
            if (!map.has(exId)) {
                const ex = exclusives.find(e => e.id === exId) || r.expand?.exclusiva || { id: exId, exclusiva: exId };
                map.set(exId, { ex, regs: [] });
            }
            map.get(exId).regs.push(r);
        }
        // Also show blocked exclusives even if no active regs
        for (const ex of exclusives.filter(e => e.estat === 'bloquejada')) {
            if (!map.has(ex.id)) map.set(ex.id, { ex, regs: [] });
        }
        return [...map.values()];
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [registres, exclusives, tick]);

    if (carregant) return (
        <div className="grid gap-3">{[0,1,2].map(i => <div key={i} className="h-24 animate-pulse rounded-xl bg-secondary" />)}</div>
    );

    return (
        <section>
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h2 className="font-display text-3xl uppercase leading-none">Gestión de operaciones</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        {registres.length} operaciones activas · {perExclusiva.length} exclusivas
                    </p>
                </div>
                <button onClick={carrega} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-secondary active:scale-95">
                    <RefreshCcw className="h-4 w-4" /> Actualizar
                </button>
            </div>

            {actionMsg && (
                <div className={`mb-4 flex items-center gap-3 rounded-xl px-5 py-3 font-semibold text-sm ${actionMsg.ok ? 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))] border border-[hsl(var(--ok))]/30' : 'bg-destructive/15 text-destructive border border-destructive/30'}`}>
                    {actionMsg.ok ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <AlertTriangle className="h-5 w-5 shrink-0" />}
                    {actionMsg.msg}
                </div>
            )}

            {perExclusiva.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
                    <Clock className="mx-auto mb-3 h-12 w-12 text-muted-foreground/30" />
                    <p className="font-display text-2xl uppercase text-muted-foreground">Sin operaciones activas</p>
                    <p className="mt-1 text-sm text-muted-foreground">No hay operaciones en curso o pausadas ahora mismo.</p>
                </div>
            ) : (
                <div className="grid gap-5">
                    {perExclusiva.map(({ ex, regs }) => {
                        const isBlocked = ex.estat === 'bloquejada';
                        return (
                            <div key={ex.id} className={`rounded-2xl border-2 bg-card overflow-hidden ${isBlocked ? 'border-destructive/50' : 'border-border'}`}>
                                {/* Header */}
                                <div className={`flex flex-wrap items-center justify-between gap-3 px-5 py-4 ${isBlocked ? 'bg-destructive/10' : 'bg-secondary/30'}`}>
                                    <div>
                                        <p className="font-display text-3xl uppercase leading-none">{ex.exclusiva}</p>
                                        {ex.article && <p className="text-sm font-semibold mt-0.5">{ex.article}</p>}
                                        {isBlocked && ex.motiu_bloqueig && (
                                            <p className="text-xs text-destructive mt-1 font-semibold">Motivo: {ex.motiu_bloqueig}</p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${isBlocked ? 'bg-destructive text-white' : 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]'}`}>
                                            {isBlocked ? 'Bloqueada' : `${regs.length} activa${regs.length !== 1 ? 's' : ''}`}
                                        </span>
                                        {isBlocked ? (
                                            <button onClick={() => handleDesbloquear(ex.id)} disabled={doing}
                                                className="flex items-center gap-1.5 rounded-lg bg-[hsl(var(--ok))] px-3 py-1.5 text-sm font-semibold text-white active:scale-95 disabled:opacity-60">
                                                <Unlock className="h-4 w-4" /> Desbloquear
                                            </button>
                                        ) : (
                                            <button onClick={() => setDialeg({ type: 'bloquear', exId: ex.id, exNom: ex.exclusiva })}
                                                className="flex items-center gap-1.5 rounded-lg border-2 border-destructive/50 text-destructive px-3 py-1.5 text-sm font-semibold active:scale-95 hover:bg-destructive/10">
                                                <Lock className="h-4 w-4" /> Bloquear exclusiva
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Operations table */}
                                {regs.length > 0 && (
                                    <div className="overflow-auto">
                                        <table className="w-full min-w-[700px] text-sm">
                                            <thead className="bg-secondary/50 text-left text-xs uppercase">
                                                <tr>
                                                    {['Operación','Mono','Operario','Tiempo','Estado','Acciones'].map(h => (
                                                        <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border">
                                                {regs.map(r => (
                                                    <tr key={r.id} className="hover:bg-secondary/20">
                                                        <td className="px-4 py-3">
                                                            <p className="font-semibold text-sm">{r.operacio}</p>
                                                        </td>
                                                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                                                            {r.expand?.mono?.codi || '—'}
                                                        </td>
                                                        <td className="px-4 py-3 text-sm">
                                                            {r.expand?.operari?.name || r.expand?.operari?.codi || '—'}
                                                        </td>
                                                        <td className="px-4 py-3 tabular-nums font-mono text-sm">
                                                            {r.estat === 'en_curs'
                                                                ? <span className="text-[hsl(var(--ok))] font-semibold">{elapsed(r.inici)}</span>
                                                                : <span className="text-[hsl(var(--warn))]">Pausada</span>}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${r.estat === 'en_curs' ? 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]' : 'bg-[hsl(var(--warn))]/20 text-[hsl(var(--warn))]'}`}>
                                                                {r.estat === 'en_curs' ? 'En curso' : 'Pausada'}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="flex gap-2 flex-wrap">
                                                                {r.estat === 'en_curs' ? (
                                                                    <button onClick={() => handlePausar(r)} disabled={doing}
                                                                        className="flex items-center gap-1 rounded-lg border border-[hsl(var(--warn))]/50 bg-[hsl(var(--warn))]/10 text-[hsl(var(--warn))] px-2.5 py-1.5 text-xs font-semibold hover:bg-[hsl(var(--warn))]/20 active:scale-95 disabled:opacity-60">
                                                                        <Pause className="h-3.5 w-3.5" /> Pausar
                                                                    </button>
                                                                ) : (
                                                                    <button onClick={() => handleReanudar(r)} disabled={doing}
                                                                        className="flex items-center gap-1 rounded-lg border border-[hsl(var(--ok))]/50 bg-[hsl(var(--ok))]/10 text-[hsl(var(--ok))] px-2.5 py-1.5 text-xs font-semibold hover:bg-[hsl(var(--ok))]/20 active:scale-95 disabled:opacity-60">
                                                                        <CheckCircle2 className="h-3.5 w-3.5" /> Reanudar
                                                                    </button>
                                                                )}
                                                                <button onClick={() => setDialeg({ type: 'terminar', registre: r })} disabled={doing}
                                                                    className="flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 text-primary px-2.5 py-1.5 text-xs font-semibold hover:bg-primary/20 active:scale-95 disabled:opacity-60">
                                                                    <CheckCircle2 className="h-3.5 w-3.5" /> Terminar
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                                {regs.length === 0 && !isBlocked && (
                                    <p className="px-5 py-4 text-sm text-muted-foreground">Sin operaciones activas para esta exclusiva.</p>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Confirm: Terminar */}
            {dialeg?.type === 'terminar' && (
                <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4">
                    <div className="w-full max-w-md rounded-2xl bg-card p-6">
                        <h3 className="font-display text-2xl uppercase mb-2">Terminar operación</h3>
                        <p className="text-sm text-muted-foreground mb-1">
                            Operación: <strong>{dialeg.registre?.operacio}</strong>
                        </p>
                        <p className="text-sm text-muted-foreground mb-5">
                            Operario: <strong>{dialeg.registre?.expand?.operari?.name || dialeg.registre?.expand?.operari?.codi || '—'}</strong>
                        </p>
                        <p className="mb-5 text-sm rounded-lg bg-[hsl(var(--warn))]/10 text-[hsl(var(--warn))] px-3 py-2">
                            Esta acción marcará la operación como completada (OK). ¿Confirmar?
                        </p>
                        <div className="flex gap-3">
                            <button onClick={() => handleTerminar(dialeg.registre)} disabled={doing}
                                className="flex-1 h-12 rounded-xl bg-[hsl(var(--ok))] text-white font-semibold disabled:opacity-60 text-sm">
                                {doing ? 'Guardando...' : 'Confirmar'}
                            </button>
                            <button onClick={() => setDialeg(null)} className="h-12 px-5 rounded-xl bg-secondary font-semibold text-sm">
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirm: Bloquear */}
            {dialeg?.type === 'bloquear' && (
                <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4">
                    <div className="w-full max-w-md rounded-2xl bg-card p-6">
                        <h3 className="font-display text-2xl uppercase mb-2">Bloquear exclusiva</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                            Exclusiva: <strong>{dialeg.exNom}</strong>
                        </p>
                        <p className="mb-3 text-sm text-muted-foreground">
                            Todas las operaciones en curso se pausarán. El operario verá una notificación.
                        </p>
                        <label className="text-xs font-semibold uppercase text-muted-foreground">Motivo del bloqueo</label>
                        <textarea value={motiuBloqueig} onChange={e => setMotiuBloqueig(e.target.value)}
                            rows={3} placeholder="Ej: Falta de material, Revisión de diseño..."
                            className="mt-1 w-full rounded-xl border border-input bg-background p-3 text-sm mb-4" />
                        <div className="flex gap-3">
                            <button onClick={() => handleBloquear(dialeg.exId)} disabled={doing}
                                className="flex-1 h-12 rounded-xl bg-destructive text-white font-semibold disabled:opacity-60 text-sm">
                                {doing ? 'Bloqueando...' : 'Bloquear exclusiva'}
                            </button>
                            <button onClick={() => { setDialeg(null); setMotiuBloqueig(''); }}
                                className="h-12 px-5 rounded-xl bg-secondary font-semibold text-sm">
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}

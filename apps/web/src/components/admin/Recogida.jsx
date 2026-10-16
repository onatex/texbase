import React, { useCallback, useEffect, useState } from 'react';
import { PackageCheck, Truck, RefreshCcw } from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/lib/auth';

export default function Recogida() {
    const { user } = useAuth();
    const [exclusives, setExclusives] = useState([]);
    const [monos, setMonos] = useState([]);
    const [controlCalidad, setControlCalidad] = useState([]);
    const [carregant, setCarregant] = useState(true);
    const [marcant, setMarcant] = useState({});

    const carrega = useCallback(async () => {
        setCarregant(true);
        try {
            const [ex, mo, cc] = await Promise.all([
                pb.collection('exclusives').getFullList({
                    filter: 'estat = "lista_recollida" || estat = "parcialmente_conforme"',
                    sort: '-created',
                    requestKey: 'recogida-ex',
                }),
                pb.collection('monos').getFullList({
                    requestKey: 'recogida-mo',
                }),
                pb.collection('control_calidad').getFullList({
                    requestKey: 'recogida-cc',
                }).catch(() => []),
            ]);
            setExclusives(ex);
            setMonos(mo);
            setControlCalidad(cc);
        } finally {
            setCarregant(false);
        }
    }, []);

    useEffect(() => { carrega(); }, [carrega]);

    // Auto-refresh every 15 seconds
    useEffect(() => {
        const t = setInterval(carrega, 15000);
        return () => clearInterval(t);
    }, [carrega]);

    const handleEntregada = async (ex) => {
        setMarcant(prev => ({ ...prev, [ex.id]: true }));
        try {
            const now = new Date().toISOString();
            await pb.collection('exclusives').update(ex.id, {
                estat: 'entregada',
                data_entrega_real: now,
                entregada_per: user?.id || undefined,
            });
            setExclusives(prev => prev.filter(e => e.id !== ex.id));
        } finally {
            setMarcant(prev => ({ ...prev, [ex.id]: false }));
        }
    };

    const totalMonos = (exId) => monos.filter(m => m.exclusiva === exId).length;
    const progresoUnidades = (ex) => {
        const total = Math.max(1, Number(ex.unitats) || 0);
        const recs = controlCalidad.filter(c => c.exclusiva_id === ex.id);
        const conformes = recs.filter(c => c.estado === 'conforme').length;
        const rechazadas = recs.filter(c => c.estado === 'rechazada').length;
        return { total, conformes, rechazadas, pct: Math.round((conformes / total) * 100) };
    };

    return (
        <section>
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h2 className="font-display text-3xl uppercase leading-none">Listas para recoger</h2>
                    <p className="text-sm text-muted-foreground mt-1">Exclusivas que han pasado el control de calidad y están listas</p>
                </div>
                <button onClick={carrega} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-secondary active:scale-95">
                    <RefreshCcw className="h-4 w-4" /> Actualizar
                </button>
            </div>

            {carregant ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {[0,1,2].map(i => <div key={i} className="h-48 animate-pulse rounded-xl bg-secondary" />)}
                </div>
            ) : exclusives.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-card py-16 text-center">
                    <PackageCheck className="h-14 w-14 text-muted-foreground/30 mb-4" />
                    <p className="font-display text-2xl uppercase text-muted-foreground">Sin exclusivas listas para recoger</p>
                    <p className="text-sm text-muted-foreground mt-1">Cuando control de calidad marque una exclusiva como terminada, aparecerá aquí.</p>
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {exclusives.map(ex => (
                        <div key={ex.id} className="rounded-2xl border-2 border-[hsl(var(--ok))]/40 bg-card shadow-sm overflow-hidden">
                            <div className="bg-[hsl(var(--ok))]/10 px-5 pt-5 pb-3">
                                <div className="flex items-start justify-between gap-2">
                                    <p className="font-display text-4xl uppercase leading-none">{ex.exclusiva}</p>
                                    <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${ex.estat === 'parcialmente_conforme' ? 'bg-[hsl(var(--warn))]/20 text-[hsl(var(--warn))]' : 'bg-[hsl(var(--ok))]/20 text-[hsl(var(--ok))]'}`}>
                                        {ex.estat === 'parcialmente_conforme' ? 'Parcial' : 'Lista'}
                                    </span>
                                </div>
                                {ex.article && <p className="mt-1 font-semibold text-sm">{ex.article}</p>}
                                {ex.marca && <p className="text-xs text-muted-foreground">{ex.marca}</p>}
                            </div>
                            <div className="p-5">
                                {(() => {
                                    const p = progresoUnidades(ex);
                                    const listaCompleta = ex.estat === 'lista_recollida';
                                    return (
                                        <>
                                            <div className="mb-3">
                                                <div className="flex items-center justify-between text-xs mb-1.5">
                                                    <span className="font-semibold uppercase text-muted-foreground">Unidades conformes</span>
                                                    <span className={listaCompleta ? 'text-[hsl(var(--ok))] font-bold' : 'text-muted-foreground'}>
                                                        {p.conformes}/{p.total}
                                                    </span>
                                                </div>
                                                <div className="h-2.5 w-full rounded-full bg-secondary overflow-hidden flex">
                                                    <div className="h-full bg-[hsl(var(--ok))] transition-all" style={{ width: `${(p.conformes / p.total) * 100}%` }} />
                                                    <div className="h-full bg-destructive transition-all" style={{ width: `${(p.rechazadas / p.total) * 100}%` }} />
                                                </div>
                                                {!listaCompleta && (
                                                    <p className="mt-1.5 text-xs text-[hsl(var(--warn))] font-semibold">
                                                        {p.rechazadas > 0 ? `${p.rechazadas} rechazada(s)` : 'Parcialmente conforme — faltan unidades'}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 text-sm mb-4">
                                                <div className="rounded-lg bg-secondary/60 px-3 py-2">
                                                    <p className="text-xs text-muted-foreground">Monos</p>
                                                    <p className="font-bold text-lg tabular-nums">{totalMonos(ex.id)}</p>
                                                </div>
                                                <div className="rounded-lg bg-secondary/60 px-3 py-2">
                                                    <p className="text-xs text-muted-foreground">Entrega</p>
                                                    <p className="font-bold">{ex.data_entrega || '—'}</p>
                                                </div>
                                                {ex.observacions && (
                                                    <div className="col-span-2 rounded-lg bg-secondary/60 px-3 py-2">
                                                        <p className="text-xs text-muted-foreground">Observaciones</p>
                                                        <p className="text-sm">{ex.observacions}</p>
                                                    </div>
                                                )}
                                            </div>
                                            {listaCompleta ? (
                                                <button
                                                    onClick={() => handleEntregada(ex)}
                                                    disabled={marcant[ex.id]}
                                                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground h-12 font-bold text-sm shadow hover:bg-primary/90 active:scale-[0.98] disabled:opacity-60 transition">
                                                    <Truck className="h-5 w-5" />
                                                    {marcant[ex.id] ? 'Guardando...' : 'Marcar como recogida'}
                                                </button>
                                            ) : (
                                                <a href={`/exclusiva/${ex.id}`} target="_blank" rel="noopener noreferrer"
                                                    className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-primary/50 text-primary h-12 font-bold text-sm hover:bg-primary/10 active:scale-[0.98] transition">
                                                    Ver detalles — completar control de calidad
                                                </a>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}

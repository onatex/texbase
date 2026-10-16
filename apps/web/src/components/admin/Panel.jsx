import React, { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, CheckCircle, Clock, Layers, PackageCheck, TrendingDown } from 'lucide-react';
import { formatSegons } from '@/lib/csv';

const KPI = ({ icon: Icon, label, valor, to, accent }) => (
    <div className="rounded-lg border border-border bg-card p-4">
        <div className={`flex items-center gap-2 text-xs uppercase tracking-wide ${accent || 'text-muted-foreground'}`}>
            <Icon className="h-4 w-4" strokeWidth={2} /> {label}
        </div>
        <p className="font-display text-4xl mt-2 tabular-nums">{valor}</p>
        {to ? <p className="text-xs text-muted-foreground">{to}</p> : null}
    </div>
);

const Panel = ({ exclusives, monos, registres }) => {
    const avui = new Date();

    const retards = useMemo(
        () => exclusives.filter((e) => {
            if (!e.data_entrega || e.estat === 'finalitzada') return false;
            const d = new Date(e.data_entrega);
            return !Number.isNaN(d.getTime()) && d < avui;
        }),
        [exclusives],
    );

    const enRisc = useMemo(() =>
        exclusives.filter((e) =>
            (e.risc === 'en_risc' || e.risc === 'no_viable')
            // Lista para recoger / entregada / finalizada → fuera de riesgo.
            && !['lista_recollida', 'entregada', 'entregadas', 'entregado', 'entregados', 'finalitzada'].includes(e.estat),
        ),
        [exclusives],
    );

    const perOperacio = useMemo(() => {
        const map = new Map();
        registres.filter((r) => r.estat === 'finalitzat').forEach((r) => {
            const k = r.operacio || 'Sin operación';
            const e = map.get(k) || { operacio: k, real: 0, estandard: 0, n: 0 };
            e.real += Number(r.temps_real_seg || 0);
            e.estandard += Number(r.temps_estandard_seg || 0);
            e.n += 1;
            map.set(k, e);
        });
        return [...map.values()].map((e) => ({
            operacio: e.operacio,
            'Real (min)': Math.round(e.real / e.n / 60),
            'Estándar (min)': Math.round(e.estandard / e.n / 60),
        }));
    }, [registres]);

    const perOperari = useMemo(() => {
        const map = new Map();
        registres.filter((r) => r.estat === 'finalitzat').forEach((r) => {
            const k = r.expand?.operari?.name || r.expand?.operari?.codi || 'Sin operario';
            const e = map.get(k) || { operari: k, real: 0, estandard: 0, n: 0 };
            e.real += Number(r.temps_real_seg || 0);
            e.estandard += Number(r.temps_estandard_seg || 0);
            e.n += 1;
            map.set(k, e);
        });
        return [...map.values()].map((e) => ({
            operari: e.operari,
            'Real (min)': Math.round(e.real / e.n / 60),
            'Estándar (min)': Math.round(e.estandard / e.n / 60),
        }));
    }, [registres]);

    const incidencies = useMemo(
        () => registres.flatMap((r) =>
            (Array.isArray(r.incidencies) ? r.incidencies : []).map((i) => ({
                ...i,
                operacio: r.operacio,
                operari: r.expand?.operari?.name,
                mono: r.expand?.mono?.codi,
            })),
        ),
        [registres],
    );

    const tempsTotal = registres.reduce((acc, r) => acc + Number(r.temps_real_seg || 0), 0);

    return (
        <div className="grid gap-6">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <KPI icon={Layers} label="Exclusivas activas" valor={exclusives.filter((e) => e.estat !== 'finalitzada').length} to={`${exclusives.length} totales`} />
                <KPI icon={PackageCheck} label="Monos finalizados" valor={monos.filter((m) => m.estat === 'finalitzat').length} to={`${monos.length} en sistema`} />
                <KPI icon={AlertTriangle} label="Entregas con retraso" valor={retards.length} to={`${enRisc.length} en riesgo o no viable`} accent="text-destructive" />
                <KPI icon={Clock} label="Tiempo productivo" valor={formatSegons(tempsTotal)} to={`${registres.length} registros`} />
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
                <section className="rounded-lg border border-border bg-card p-5">
                    <h3 className="font-display text-2xl uppercase">Real vs estándar por operación</h3>
                    {perOperacio.length === 0 ? (
                        <p className="mt-6 text-sm text-muted-foreground">Sin operaciones finalizadas todavía.</p>
                    ) : (
                        <div className="h-72 mt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={perOperacio}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="operacio" fontSize={12} />
                                    <YAxis fontSize={12} />
                                    <Tooltip />
                                    <Legend />
                                    <Bar dataKey="Estándar (min)" fill="hsl(220 60% 20%)" />
                                    <Bar dataKey="Real (min)" fill="hsl(22 92% 52%)" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </section>

                <section className="rounded-lg border border-border bg-card p-5">
                    <h3 className="font-display text-2xl uppercase">Rendimiento por operario</h3>
                    {perOperari.length === 0 ? (
                        <p className="mt-6 text-sm text-muted-foreground">Sin datos de operarios todavía.</p>
                    ) : (
                        <div className="h-72 mt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={perOperari}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="operari" fontSize={12} />
                                    <YAxis fontSize={12} />
                                    <Tooltip />
                                    <Legend />
                                    <Bar dataKey="Estándar (min)" fill="hsl(220 60% 20%)" />
                                    <Bar dataKey="Real (min)" fill="hsl(22 92% 52%)" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </section>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
                <section className="rounded-lg border border-border bg-card p-5">
                    <h3 className="font-display text-2xl uppercase">Cuellos de botella y retrasos</h3>
                    {retards.length === 0 ? (
                        <p className="mt-4 text-sm text-muted-foreground">Ninguna exclusiva por encima de su fecha de entrega.</p>
                    ) : (
                        <ul className="mt-4 divide-y divide-border text-sm">
                            {retards.map((e) => (
                                <li key={e.id} className="flex items-center justify-between py-2">
                                    <span className="font-semibold">{e.exclusiva} · {e.article}</span>
                                    <span className="text-destructive">entrega {e.data_entrega}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <section className="rounded-lg border border-border bg-card p-5">
                    <h3 className="font-display text-2xl uppercase">Historial de incidencias</h3>
                    {incidencies.length === 0 ? (
                        <p className="mt-4 text-sm text-muted-foreground">Sin incidencias registradas.</p>
                    ) : (
                        <ul className="mt-4 divide-y divide-border text-sm max-h-72 overflow-auto">
                            {incidencies.map((i, idx) => (
                                <li key={idx} className="py-2">
                                    <p className="font-semibold">{i.descripcio}</p>
                                    <p className="text-muted-foreground text-xs">
                                        {i.tipus ? `[${i.tipus}] ` : ''}{i.mono} · {i.operacio} · {i.operari}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>
        </div>
    );
};

export default Panel;

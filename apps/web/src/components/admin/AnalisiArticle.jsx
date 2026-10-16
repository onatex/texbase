import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    LineChart, Line, PieChart, Pie, Cell,
} from 'recharts';
import { Award, AlertTriangle, TrendingUp, Clock, Users, Target } from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { formatSegons } from '@/lib/csv';

const COLORS = ['#1e3a5f', '#f97316', '#10b981', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6'];

const RANGOS = [
    { id: 'setmana', label: 'Esta semana', days: 7 },
    { id: 'mes', label: 'Este mes', days: 30 },
    { id: 'any', label: 'Este año', days: 365 },
];

function startOfRange(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString();
}

export default function AnalisiArticle() {
    const [rango, setRango] = useState('mes');
    const [carregant, setCarregant] = useState(true);
    const [exclusives, setExclusives] = useState([]);
    const [registres, setRegistres] = useState([]);
    const [controls, setControls] = useState([]);
    const [retrabajos, setRetrabajos] = useState([]);
    const [operaris, setOperaris] = useState([]);
    const [opsDef, setOpsDef] = useState([]);
    const [ncs, setNcs] = useState([]);

    const carrega = useCallback(async () => {
        setCarregant(true);
        try {
            const since = startOfRange(RANGOS.find(r => r.id === rango).days);
            const [ex, reg, cq, rt, us, od, nc] = await Promise.all([
                pb.collection('exclusives').getFullList({ requestKey: 'anart-ex' }),
                pb.collection('registres').getFullList({ filter: `created >= "${since}"`, expand: 'operari,mono,exclusiva', requestKey: 'anart-reg' }),
                pb.collection('controles_qualitat').getFullList({ filter: `created >= "${since}"`, expand: 'operari,exclusiva,mono', requestKey: 'anart-cq' }).catch(() => []),
                pb.collection('retrabajos').getFullList({ filter: `created >= "${since}"`, expand: 'operario_asignado,exclusiva', requestKey: 'anart-rt' }).catch(() => []),
                pb.collection('users').getFullList({ requestKey: 'anart-us' }),
                pb.collection('operacions_def').getFullList({ requestKey: 'anart-od' }).catch(() => []),
                pb.collection('no_conformitats').getFullList({ filter: `created >= "${since}"`, requestKey: 'anart-nc' }).catch(() => []),
            ]);
            setExclusives(ex);
            setRegistres(reg);
            setControls(cq);
            setRetrabajos(rt);
            setOperaris(us);
            setOpsDef(od);
            setNcs(nc);
        } catch (e) {
            console.error('AnalisiArticle load', e);
        } finally {
            setCarregant(false);
        }
    }, [rango]);

    useEffect(() => { carrega(); }, [carrega]);

    const articles = useMemo(() => {
        const set = new Set();
        exclusives.forEach(e => { if (e.article) set.add(e.article); });
        return Array.from(set).sort();
    }, [exclusives]);

    const [articleSel, setArticleSel] = useState('');
    useEffect(() => { if (!articleSel && articles.length) setArticleSel(articles[0]); }, [articles, articleSel]);

    const exIds = useMemo(() => new Set(exclusives.filter(e => e.article === articleSel).map(e => e.id)), [exclusives, articleSel]);

    const regArt = useMemo(() => registres.filter(r => exIds.has(r.exclusiva)), [registres, exIds]);
    const cqArt = useMemo(() => controls.filter(c => exIds.has(c.exclusiva)), [controls, exIds]);
    const rtArt = useMemo(() => retrabajos.filter(r => exIds.has(r.exclusiva)), [retrabajos, exIds]);

    // Exclusivas completadas (todos monos finalitzats)
    const exclusivesCompletadas = useMemo(() => {
        return exclusives.filter(e => e.article === articleSel && e.estat === 'finalitzada').length;
    }, [exclusives, articleSel]);

    // Tiempo promedio por exclusiva
    const tempsPerEx = useMemo(() => {
        const map = new Map();
        regArt.forEach(r => {
            if (r.estat !== 'finalitzat') return;
            const k = r.exclusiva;
            map.set(k, (map.get(k) || 0) + Number(r.temps_real_seg || 0));
        });
        const vals = Array.from(map.values());
        return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
    }, [regArt]);

    // Tiempo promedio por operación
    const tempsPerOp = useMemo(() => {
        const map = new Map();
        regArt.filter(r => r.estat === 'finalitzat').forEach(r => {
            const k = r.operacio || '—';
            const e = map.get(k) || { suma: 0, n: 0 };
            e.suma += Number(r.temps_real_seg || 0);
            e.n += 1;
            map.set(k, e);
        });
        return Array.from(map.entries()).map(([op, v]) => ({ op, avg: Math.round(v.suma / v.n), n: v.n })).sort((a, b) => b.avg - a.avg);
    }, [regArt]);

    // Operarios: tiempo total e incidencias
    const operariStats = useMemo(() => {
        const map = new Map();
        const nomOp = (id) => {
            const u = operaris.find(o => o.id === id);
            return u ? (u.name || u.codi || u.email) : '—';
        };
        regArt.filter(r => r.estat === 'finalitzat').forEach(r => {
            const id = r.operari;
            if (!id) return;
            const e = map.get(id) || { id, nom: nomOp(id), temps: 0, incidencies: 0, ops: 0 };
            e.temps += Number(r.temps_real_seg || 0);
            e.incidencies += (r.incidencies?.length || 0);
            e.ops += 1;
            map.set(id, e);
        });
        return Array.from(map.values());
    }, [regArt, operaris]);

    const millorsOperaris = useMemo(() => [...operariStats].sort((a, b) => (a.temps / Math.max(a.ops, 1)) - (b.temps / Math.max(b.ops, 1))).slice(0, 5), [operariStats]);
    const operarisIncidencies = useMemo(() => [...operariStats].sort((a, b) => b.incidencies - a.incidencies).slice(0, 5), [operariStats]);

    // Incidencias comunes de calidad (por punto checklist / tipo)
    const incidenciesTipus = useMemo(() => {
        const map = new Map();
        regArt.forEach(r => (r.incidencies || []).forEach(i => {
            const k = i.tipus || 'Otra';
            map.set(k, (map.get(k) || 0) + 1);
        }));
        ncs.filter(n => exIds.has(n.exclusiva)).forEach(n => {
            const k = n.area || n.descripcio?.substring(0, 30) || 'NC';
            map.set(k, (map.get(k) || 0) + 1);
        });
        return Array.from(map.entries()).map(([tipus, count]) => ({ tipus, count })).sort((a, b) => b.count - a.count).slice(0, 8);
    }, [regArt, ncs, exIds]);

    // Tasa de rechazo por punto de checklist (controles_qualitat)
    const rechazoPunto = useMemo(() => {
        const map = new Map();
        cqArt.forEach(c => {
            const k = c.operacio || '—';
            const e = map.get(k) || { punto: k, total: 0, rechazados: 0 };
            e.total += 1;
            if (['rebutjat', 'retreball', 'bloquejat', 'ko'].includes(c.resultat)) e.rechazados += 1;
            map.set(k, e);
        });
        return Array.from(map.values()).map(e => ({ ...e, tasa: e.total ? Math.round((e.rechazados / e.total) * 100) : 0 })).sort((a, b) => b.tasa - a.tasa);
    }, [cqArt]);

    // Evolución de tiempos (por día)
    const evolucio = useMemo(() => {
        const map = new Map();
        regArt.filter(r => r.estat === 'finalitzat' && r.fi).forEach(r => {
            const day = String(r.fi).slice(0, 10);
            const e = map.get(day) || { dia: day, temps: 0, n: 0 };
            e.temps += Number(r.temps_real_seg || 0);
            e.n += 1;
            map.set(day, e);
        });
        return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([_, v]) => ({ dia: v.dia.slice(5), tempsMin: Math.round(v.temps / 60 / v.n), n: v.n }));
    }, [regArt]);

    const tempsTotalArt = useMemo(() => regArt.filter(r => r.estat === 'finalitzat').reduce((a, r) => a + Number(r.temps_real_seg || 0), 0), [regArt]);
    const retrabajosCount = rtArt.length;
    const tasaRechazoGlobal = cqArt.length ? Math.round((cqArt.filter(c => ['rebutjat', 'retreball', 'bloquejat', 'ko'].includes(c.resultat)).length / cqArt.length) * 100) : 0;

    if (carregant) return <div className="grid gap-3 sm:grid-cols-3">{[0,1,2].map(i => <div key={i} className="h-28 animate-pulse rounded-lg bg-secondary" />)}</div>;

    return (
        <div>
            <Helmet>
                <title>Análisis por artículo | Control de producción</title>
                <meta name="description" content="Estadísticas y gráficos por artículo: tiempos, operarios, incidencias y tasa de rechazo." />
            </Helmet>

            <div className="mb-5 flex flex-wrap items-center gap-3">
                <h2 className="font-display text-3xl uppercase">Análisis por artículo</h2>
                <select value={articleSel} onChange={e => setArticleSel(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm font-semibold">
                    {articles.length === 0 && <option value="">—</option>}
                    {articles.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <div className="flex gap-1.5">
                    {RANGOS.map(r => (
                        <button key={r.id} onClick={() => setRango(r.id)}
                            className={`rounded-full px-4 h-9 text-xs font-semibold transition ${rango === r.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}>
                            {r.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* KPI cards */}
            <div className="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {[
                    { icon: Target, label: 'Exclusivas completadas', valor: exclusivesCompletadas, color: 'text-[hsl(var(--ok))]' },
                    { icon: Clock, label: 'Tiempo medio/exclusiva', valor: formatSegons(tempsPerEx), color: 'text-primary' },
                    { icon: Clock, label: 'Tiempo total', valor: formatSegons(tempsTotalArt), color: 'text-primary' },
                    { icon: AlertTriangle, label: 'Incidencias', valor: incidenciesTipus.reduce((a, i) => a + i.count, 0), color: 'text-destructive' },
                    { icon: TrendingUp, label: 'Retrabajos', valor: retrabajosCount, color: 'text-[hsl(var(--warn))]' },
                    { icon: Target, label: 'Tasa rechazo', valor: `${tasaRechazoGlobal}%`, color: tasaRechazoGlobal > 10 ? 'text-destructive' : 'text-[hsl(var(--ok))]' },
                ].map(({ icon: Icon, label, valor, color }) => (
                    <div key={label} className="rounded-lg border border-border bg-card p-4">
                        <div className={`flex items-center gap-2 text-xs uppercase tracking-wide ${color}`}><Icon className="h-4 w-4" /> {label}</div>
                        <p className="font-display text-2xl mt-2 tabular-nums">{valor}</p>
                    </div>
                ))}
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
                {/* Tiempo por operación */}
                <div className="rounded-xl border border-border bg-card p-5">
                    <h3 className="font-display text-xl uppercase mb-3">Tiempo medio por operación</h3>
                    {tempsPerOp.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">Sin datos.</p> : (
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={tempsPerOp.slice(0, 12).map(o => ({ op: o.op.length > 14 ? o.op.slice(0, 12) + '…' : o.op, min: Math.round(o.avg / 60) }))} margin={{ top: 5, right: 10, bottom: 60, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                                <XAxis dataKey="op" angle={-45} textAnchor="end" tick={{ fontSize: 10 }} interval={0} />
                                <YAxis tick={{ fontSize: 11 }} />
                                <Tooltip formatter={v => [`${v} min`, 'Tiempo medio']} />
                                <Bar dataKey="min" fill="#1e3a5f" name="min" />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* Evolución de tiempos */}
                <div className="rounded-xl border border-border bg-card p-5">
                    <h3 className="font-display text-xl uppercase mb-3">Evolución de tiempos (min/día)</h3>
                    {evolucio.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">Sin datos.</p> : (
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={evolucio} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                                <XAxis dataKey="dia" tick={{ fontSize: 10 }} />
                                <YAxis tick={{ fontSize: 11 }} />
                                <Tooltip />
                                <Line type="monotone" dataKey="tempsMin" stroke="#f97316" strokeWidth={2} name="min medio" dot={{ r: 3 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* Incidencias por tipo */}
                <div className="rounded-xl border border-border bg-card p-5">
                    <h3 className="font-display text-xl uppercase mb-3">Incidencias comunes de calidad</h3>
                    {incidenciesTipus.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">Sin incidencias.</p> : (
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie data={incidenciesTipus} dataKey="count" nameKey="tipus" cx="50%" cy="50%" outerRadius={100} label={(e) => e.tipus}>
                                    {incidenciesTipus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                </Pie>
                                <Tooltip />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* Tasa de rechazo por punto */}
                <div className="rounded-xl border border-border bg-card p-5">
                    <h3 className="font-display text-xl uppercase mb-3">Tasa de rechazo por punto de checklist</h3>
                    {rechazoPunto.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">Sin controles de calidad.</p> : (
                        <div className="overflow-auto max-h-[300px]">
                            <table className="w-full text-sm">
                                <thead className="bg-secondary text-left text-xs uppercase sticky top-0">
                                    <tr><th className="px-3 py-2 font-semibold">Punto</th><th className="px-3 py-2 font-semibold text-right">Total</th><th className="px-3 py-2 font-semibold text-right">Rechazados</th><th className="px-3 py-2 font-semibold text-right">Tasa</th></tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {rechazoPunto.map(r => (
                                        <tr key={r.punto}>
                                            <td className="px-3 py-2 max-w-[200px] truncate">{r.punto}</td>
                                            <td className="px-3 py-2 text-right tabular-nums">{r.total}</td>
                                            <td className="px-3 py-2 text-right tabular-nums text-destructive">{r.rechazados}</td>
                                            <td className={`px-3 py-2 text-right tabular-nums font-semibold ${r.tasa > 15 ? 'text-destructive' : r.tasa > 5 ? 'text-[hsl(var(--warn))]' : 'text-[hsl(var(--ok))]'}`}>{r.tasa}%</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Mejores operarios */}
                <div className="rounded-xl border border-border bg-card p-5">
                    <h3 className="font-display text-xl uppercase mb-3 flex items-center gap-2"><Award className="h-5 w-5 text-[hsl(var(--ok))]" /> Operarios con mejor rendimiento</h3>
                    {millorsOperaris.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">Sin datos.</p> : (
                        <table className="w-full text-sm">
                            <thead className="bg-secondary text-left text-xs uppercase"><tr><th className="px-3 py-2 font-semibold">Operario</th><th className="px-3 py-2 font-semibold text-right">Ops</th><th className="px-3 py-2 font-semibold text-right">Tiempo/op</th><th className="px-3 py-2 font-semibold text-right">Incid.</th></tr></thead>
                            <tbody className="divide-y divide-border">
                                {millorsOperaris.map((o, i) => (
                                    <tr key={o.id}>
                                        <td className="px-3 py-2 font-semibold">{i === 0 && '🥇 '}{i === 1 && '🥈 '}{i === 2 && '🥉 '}{o.nom}</td>
                                        <td className="px-3 py-2 text-right tabular-nums">{o.ops}</td>
                                        <td className="px-3 py-2 text-right tabular-nums">{formatSegons(Math.round(o.temps / Math.max(o.ops, 1)))}</td>
                                        <td className="px-3 py-2 text-right tabular-nums">{o.incidencies}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Operarios con más incidencias */}
                <div className="rounded-xl border border-border bg-card p-5">
                    <h3 className="font-display text-xl uppercase mb-3 flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-destructive" /> Operarios con más incidencias</h3>
                    {operarisIncidencies.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">Sin datos.</p> : (
                        <table className="w-full text-sm">
                            <thead className="bg-secondary text-left text-xs uppercase"><tr><th className="px-3 py-2 font-semibold">Operario</th><th className="px-3 py-2 font-semibold text-right">Ops</th><th className="px-3 py-2 font-semibold text-right">Incid.</th><th className="px-3 py-2 font-semibold text-right">Tiempo total</th></tr></thead>
                            <tbody className="divide-y divide-border">
                                {operarisIncidencies.map(o => (
                                    <tr key={o.id}>
                                        <td className="px-3 py-2 font-semibold">{o.nom}</td>
                                        <td className="px-3 py-2 text-right tabular-nums">{o.ops}</td>
                                        <td className="px-3 py-2 text-right tabular-nums text-destructive font-semibold">{o.incidencies}</td>
                                        <td className="px-3 py-2 text-right tabular-nums">{formatSegons(o.temps)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}

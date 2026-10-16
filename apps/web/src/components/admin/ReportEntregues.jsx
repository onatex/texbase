import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, RefreshCcw, AlertTriangle } from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
    PieChart, Pie, Cell, LineChart, Line, CartesianGrid,
} from 'recharts';
import pb from '@/lib/pocketbaseClient';
import { descarregaCSV } from '@/lib/csv';

const COLORS = ['hsl(152,60%,34%)', 'hsl(0,72%,46%)', 'hsl(40,92%,45%)', 'hsl(220,60%,40%)', 'hsl(22,92%,52%)'];

function diffDies(dataEntrega, dataReal) {
    if (!dataEntrega || !dataReal) return null;
    try {
        // Parse entrega (DD/MM/YYYY or ISO)
        let d1;
        if (dataEntrega.includes('/')) {
            const [dd, mm, yy] = dataEntrega.split('/');
            d1 = new Date(`20${yy}-${mm}-${dd}`);
        } else {
            d1 = new Date(dataEntrega);
        }
        const d2 = new Date(dataReal);
        if (isNaN(d1) || isNaN(d2)) return null;
        return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
    } catch { return null; }
}

function puntualitat(diff) {
    if (diff === null) return 'sense_data';
    if (diff <= 0) return 'a_temps';
    return 'retrasada';
}

function fmtMin(seg) {
    if (!seg) return '—';
    const m = Math.floor(seg / 60);
    const s = seg % 60;
    return `${m}m ${String(s).padStart(2,'0')}s`;
}

export default function ReportEntregues() {
    const [exclusives, setExclusives] = useState([]);
    const [monos, setMonos] = useState([]);
    const [controlsQC, setControlsQC] = useState([]);
    const [carregant, setCarregant] = useState(true);
    const [tab, setTab] = useState('general');
    const [q, setQ] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [clientFil, setClientFil] = useState('');
    const [estatFil, setEstatFil] = useState('totes');

    const carrega = useCallback(async () => {
        setCarregant(true);
        try {
            const [ex, mo, cqs] = await Promise.all([
                pb.collection('exclusives').getFullList({
                    filter: 'estat = "entregada"',
                    sort: '-data_entrega_real',
                    requestKey: 'report-ex',
                }),
                pb.collection('monos').getFullList({ requestKey: 'report-mo' }),
                pb.collection('controles_qualitat').getFullList({
                    filter: 'operacio = "Checklist QC Final" && temps_inspeccio_seg > 0',
                    sort: '-created',
                    expand: 'operari,exclusiva,mono',
                    requestKey: 'report-cqs',
                }).catch(() => []),
            ]);
            setExclusives(ex);
            setMonos(mo);
            setControlsQC(cqs);
        } finally {
            setCarregant(false);
        }
    }, []);

    useEffect(() => { carrega(); }, [carrega]);

    const exAmbMetrics = useMemo(() => exclusives.map(ex => {
        const exMonos = monos.filter(m => m.exclusiva === ex.id).length;
        const diff = diffDies(ex.data_entrega, ex.data_entrega_real);
        return { ...ex, totalMonos: exMonos, diff, puntualitat: puntualitat(diff) };
    }), [exclusives, monos]);

    const filtrades = useMemo(() => {
        let list = exAmbMetrics;
        if (q.trim()) {
            const t = q.trim().toLowerCase();
            list = list.filter(e => `${e.exclusiva} ${e.article || ''} ${e.marca || ''}`.toLowerCase().includes(t));
        }
        if (clientFil.trim()) {
            const t = clientFil.trim().toLowerCase();
            list = list.filter(e => (e.marca || '').toLowerCase().includes(t));
        }
        if (estatFil !== 'totes') {
            list = list.filter(e => e.puntualitat === estatFil);
        }
        if (dateFrom) list = list.filter(e => e.data_entrega_real && e.data_entrega_real >= dateFrom);
        if (dateTo) list = list.filter(e => e.data_entrega_real && e.data_entrega_real <= dateTo + 'T23:59:59');
        return list;
    }, [exAmbMetrics, q, clientFil, estatFil, dateFrom, dateTo]);

    // Group by day
    const perDia = useMemo(() => {
        const map = {};
        filtrades.forEach(ex => {
            const d = ex.data_entrega_real ? ex.data_entrega_real.substring(0, 10) : '—';
            if (!map[d]) map[d] = { data: d, exclusives: 0, monos: 0, clients: new Set() };
            map[d].exclusives++;
            map[d].monos += ex.totalMonos;
            if (ex.marca) map[d].clients.add(ex.marca);
        });
        return Object.values(map).sort((a, b) => b.data.localeCompare(a.data)).map(r => ({ ...r, clients: [...r.clients].join(', ') }));
    }, [filtrades]);

    // Group by week
    const perSetmana = useMemo(() => {
        const map = {};
        filtrades.forEach(ex => {
            if (!ex.data_entrega_real) return;
            const d = new Date(ex.data_entrega_real);
            const yr = d.getFullYear();
            const wk = getWeekNumber(d);
            const key = `${yr}-S${String(wk).padStart(2, '0')}`;
            if (!map[key]) map[key] = { key, label: `Semana ${wk} (${yr})`, exclusives: 0, monos: 0, clients: new Set() };
            map[key].exclusives++;
            map[key].monos += ex.totalMonos;
            if (ex.marca) map[key].clients.add(ex.marca);
        });
        return Object.values(map).sort((a, b) => b.key.localeCompare(a.key)).map(r => ({ ...r, clients: [...r.clients].join(', ') }));
    }, [filtrades]);

    // Group by month
    const perMes = useMemo(() => {
        const map = {};
        filtrades.forEach(ex => {
            if (!ex.data_entrega_real) return;
            const d = new Date(ex.data_entrega_real);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const label = d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
            if (!map[key]) map[key] = { key, label, exclusives: 0, monos: 0, clients: new Set() };
            map[key].exclusives++;
            map[key].monos += ex.totalMonos;
            if (ex.marca) map[key].clients.add(ex.marca);
        });
        return Object.values(map).sort((a, b) => b.key.localeCompare(a.key)).map(r => ({ ...r, clients: [...r.clients].join(', ') }));
    }, [filtrades]);

    // Puntuality analysis
    const puntAnalysis = useMemo(() => {
        const aTemps = filtrades.filter(e => e.puntualitat === 'a_temps').length;
        const retrasades = filtrades.filter(e => e.puntualitat === 'retrasada').length;
        const senseDades = filtrades.filter(e => e.puntualitat === 'sense_data').length;
        const total = filtrades.length;
        const pct = total ? Math.round((aTemps / total) * 100) : 0;
        const avgRetard = retrasades > 0
            ? Math.round(filtrades.filter(e => e.puntualitat === 'retrasada').reduce((s, e) => s + (e.diff || 0), 0) / retrasades)
            : 0;
        return { aTemps, retrasades, senseDades, total, pct, avgRetard };
    }, [filtrades]);

    const pieData = [
        { name: 'A tiempo', value: puntAnalysis.aTemps, color: 'hsl(152,60%,34%)' },
        { name: 'Retrasadas', value: puntAnalysis.retrasades, color: 'hsl(0,72%,46%)' },
        { name: 'Sin fecha', value: puntAnalysis.senseDades, color: 'hsl(220,14%,70%)' },
    ].filter(d => d.value > 0);

    // Per client
    const perClient = useMemo(() => {
        const map = {};
        filtrades.forEach(ex => {
            const cl = ex.marca || 'Sin cliente';
            if (!map[cl]) map[cl] = { client: cl, exclusives: 0, monos: 0, aTemps: 0 };
            map[cl].exclusives++;
            map[cl].monos += ex.totalMonos;
            if (ex.puntualitat === 'a_temps') map[cl].aTemps++;
        });
        return Object.values(map)
            .map(r => ({ ...r, pct: filtrades.length ? Math.round((r.exclusives / filtrades.length) * 100) : 0, pctPunt: r.exclusives ? Math.round((r.aTemps / r.exclusives) * 100) : 0 }))
            .sort((a, b) => b.exclusives - a.exclusives);
    }, [filtrades]);

    // Per article
    const perArticle = useMemo(() => {
        const map = {};
        filtrades.forEach(ex => {
            const art = ex.article || 'Sin artículo';
            if (!map[art]) map[art] = { article: art, exclusives: 0, monos: 0 };
            map[art].exclusives++;
            map[art].monos += ex.totalMonos;
        });
        return Object.values(map)
            .map(r => ({ ...r, pct: filtrades.length ? Math.round((r.exclusives / filtrades.length) * 100) : 0 }))
            .sort((a, b) => b.exclusives - a.exclusives);
    }, [filtrades]);

    const exportaGeneral = () => descarregaCSV('entregas.csv', filtrades.map(e => ({
        Exclusiva: e.exclusiva, Artículo: e.article || '', Monos: e.totalMonos,
        Cliente: e.marca || '', 'F. Entrega planificada': e.data_entrega || '',
        'F. Entrega real': e.data_entrega_real ? e.data_entrega_real.substring(0, 10) : '',
        'Diferencia (días)': e.diff ?? '', Puntualidad: e.puntualitat, Observaciones: e.observacions || '',
    })));

    // QC time metrics
    const qcPerDia = useMemo(() => {
        const map = {};
        controlsQC.forEach(c => {
            const d = c.created ? c.created.substring(0, 10) : '—';
            if (!map[d]) map[d] = { data: d, count: 0, totalSeg: 0 };
            map[d].count++;
            map[d].totalSeg += c.temps_inspeccio_seg || 0;
        });
        return Object.values(map).sort((a, b) => b.data.localeCompare(a.data))
            .map(r => ({ ...r, avgMin: r.count ? Math.round(r.totalSeg / r.count / 60 * 10) / 10 : 0 }));
    }, [controlsQC]);

    const qcPerOperari = useMemo(() => {
        const map = {};
        controlsQC.forEach(c => {
            const nom = c.expand?.operari?.name || c.expand?.operari?.codi || c.operari || '—';
            if (!map[nom]) map[nom] = { operari: nom, count: 0, totalSeg: 0 };
            map[nom].count++;
            map[nom].totalSeg += c.temps_inspeccio_seg || 0;
        });
        return Object.values(map)
            .map(r => ({ ...r, avgMin: r.count ? Math.round(r.totalSeg / r.count / 60 * 10) / 10 : 0 }))
            .sort((a, b) => a.avgMin - b.avgMin);
    }, [controlsQC]);

    const qcLineData = useMemo(() => {
        return controlsQC.slice(0, 30).reverse().map((c, i) => ({
            idx: i + 1,
            min: Math.round((c.temps_inspeccio_seg || 0) / 60 * 10) / 10,
            std: Math.round((c.temps_std_seg || 600) / 60 * 10) / 10,
        }));
    }, [controlsQC]);

    const TABS = [
        { id: 'general', label: 'General' },
        { id: 'dia', label: 'Por día' },
        { id: 'setmana', label: 'Por semana' },
        { id: 'mes', label: 'Por mes' },
        { id: 'puntualitat', label: 'Puntualidad' },
        { id: 'article', label: 'Por artículo' },
        { id: 'qc_temps', label: 'Tiempos QC' },
    ];

    return (
        <section>
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h2 className="font-display text-3xl uppercase leading-none">Reporte de entregas</h2>
                    <p className="text-sm text-muted-foreground mt-1">{filtrades.length} exclusivas entregadas</p>
                </div>
                <button onClick={carrega} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-secondary active:scale-95">
                    <RefreshCcw className="h-4 w-4" /> Actualizar
                </button>
            </div>

            {/* Global filters */}
            <div className="mb-4 flex flex-wrap gap-2">
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar exclusiva, artículo..."
                    className="h-9 rounded-md border border-input bg-card px-3 text-sm w-52" />
                <input value={clientFil} onChange={e => setClientFil(e.target.value)} placeholder="Filtrar por cliente..."
                    className="h-9 rounded-md border border-input bg-card px-3 text-sm w-40" />
                <select value={estatFil} onChange={e => setEstatFil(e.target.value)}
                    className="h-9 rounded-md border border-input bg-card px-3 text-sm">
                    <option value="totes">Todas</option>
                    <option value="a_temps">A tiempo</option>
                    <option value="retrasada">Retrasadas</option>
                    <option value="sense_data">Sin fecha</option>
                </select>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    className="h-9 rounded-md border border-input bg-card px-3 text-sm" />
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                    className="h-9 rounded-md border border-input bg-card px-3 text-sm" />
            </div>

            {/* KPI band */}
            <div className="mb-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-border bg-card p-4 text-center">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Entregas totales</p>
                    <p className="font-display text-4xl mt-1">{filtrades.length}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4 text-center">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Monos entregados</p>
                    <p className="font-display text-4xl mt-1">{filtrades.reduce((s, e) => s + e.totalMonos, 0)}</p>
                </div>
                <div className="rounded-xl border border-[hsl(var(--ok))]/30 bg-[hsl(var(--ok))]/5 p-4 text-center">
                    <p className="text-xs uppercase tracking-wide text-[hsl(var(--ok))]">Puntualidad</p>
                    <p className="font-display text-4xl mt-1 text-[hsl(var(--ok))]">{puntAnalysis.pct}%</p>
                </div>
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center">
                    <p className="text-xs uppercase tracking-wide text-destructive">Retrasadas</p>
                    <p className="font-display text-4xl mt-1 text-destructive">{puntAnalysis.retrasades}</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex overflow-x-auto gap-1 mb-5 border-b border-border">
                {TABS.map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                        className={`whitespace-nowrap px-4 py-2.5 text-sm font-semibold transition ${tab === t.id ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
                        {t.label}
                    </button>
                ))}
            </div>

            {carregant ? (
                <div className="h-40 animate-pulse rounded-xl bg-secondary" />
            ) : (
                <>
                    {/* GENERAL */}
                    {tab === 'general' && (
                        <div>
                            <div className="mb-3 flex justify-end">
                                <button onClick={exportaGeneral} className="flex items-center gap-2 rounded-lg bg-primary px-3 h-9 text-sm font-semibold text-primary-foreground active:scale-95">
                                    <Download className="h-4 w-4" /> Exportar CSV
                                </button>
                            </div>
                            <div className="rounded-xl border border-border bg-card overflow-auto">
                                <table className="w-full min-w-[900px] text-sm">
                                    <thead className="bg-secondary text-left text-xs uppercase">
                                        <tr>
                                            {['Exclusiva','Artículo','Monos','Cliente','F. Planificada','F. Real','Diff (días)','Estado'].map(h => (
                                                <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {filtrades.length === 0 ? (
                                            <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Sin entregas registradas.</td></tr>
                                        ) : filtrades.map(ex => (
                                            <tr key={ex.id}>
                                                <td className="px-3 py-2 font-semibold">{ex.exclusiva}</td>
                                                <td className="px-3 py-2">{ex.article || '—'}</td>
                                                <td className="px-3 py-2 tabular-nums">{ex.totalMonos}</td>
                                                <td className="px-3 py-2">{ex.marca || '—'}</td>
                                                <td className="px-3 py-2">{ex.data_entrega || '—'}</td>
                                                <td className="px-3 py-2">{ex.data_entrega_real ? ex.data_entrega_real.substring(0, 10) : '—'}</td>
                                                <td className="px-3 py-2 tabular-nums">
                                                    {ex.diff !== null ? (
                                                        <span className={ex.diff <= 0 ? 'text-[hsl(var(--ok))] font-semibold' : 'text-destructive font-semibold'}>
                                                            {ex.diff > 0 ? `+${ex.diff}` : ex.diff}d
                                                        </span>
                                                    ) : '—'}
                                                </td>
                                                <td className="px-3 py-2">
                                                    {ex.puntualitat === 'a_temps' ? (
                                                        <span className="rounded px-2 py-0.5 text-xs font-semibold bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]">A tiempo</span>
                                                    ) : ex.puntualitat === 'retrasada' ? (
                                                        <span className="rounded px-2 py-0.5 text-xs font-semibold bg-destructive/10 text-destructive">Retrasada</span>
                                                    ) : (
                                                        <span className="rounded px-2 py-0.5 text-xs font-semibold bg-secondary text-muted-foreground">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* POR DIA */}
                    {tab === 'dia' && (
                        <div className="grid gap-5">
                            <div className="rounded-xl border border-border bg-card p-5">
                                <p className="text-sm font-semibold mb-4">Exclusivas entregadas por día</p>
                                <ResponsiveContainer width="100%" height={280}>
                                    <BarChart data={perDia.slice(0, 14).reverse()}>
                                        <XAxis dataKey="data" tick={{ fontSize: 10 }} />
                                        <YAxis tick={{ fontSize: 11 }} />
                                        <Tooltip />
                                        <Bar dataKey="exclusives" name="Exclusivas" fill="hsl(220,60%,40%)" radius={[4,4,0,0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <TableView data={perDia} cols={[['data','Fecha'],['exclusives','Exclusivas'],['monos','Monos'],['clients','Clientes']]} />
                        </div>
                    )}

                    {/* POR SETMANA */}
                    {tab === 'setmana' && (
                        <div className="grid gap-5">
                            <div className="rounded-xl border border-border bg-card p-5">
                                <p className="text-sm font-semibold mb-4">Exclusivas entregadas por semana</p>
                                <ResponsiveContainer width="100%" height={280}>
                                    <BarChart data={perSetmana.slice(0, 12).reverse()}>
                                        <XAxis dataKey="label" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" height={50} />
                                        <YAxis tick={{ fontSize: 11 }} />
                                        <Tooltip />
                                        <Bar dataKey="exclusives" name="Exclusivas" fill="hsl(22,92%,52%)" radius={[4,4,0,0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <TableView data={perSetmana} cols={[['label','Semana'],['exclusives','Exclusivas'],['monos','Monos'],['clients','Clientes']]} />
                        </div>
                    )}

                    {/* POR MES */}
                    {tab === 'mes' && (
                        <div className="grid gap-5">
                            <div className="rounded-xl border border-border bg-card p-5">
                                <p className="text-sm font-semibold mb-4">Exclusivas entregadas por mes</p>
                                <ResponsiveContainer width="100%" height={280}>
                                    <BarChart data={perMes.slice(0, 12).reverse()}>
                                        <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                                        <YAxis tick={{ fontSize: 11 }} />
                                        <Tooltip />
                                        <Bar dataKey="exclusives" name="Exclusivas" fill="hsl(152,60%,34%)" radius={[4,4,0,0]} />
                                        <Bar dataKey="monos" name="Monos" fill="hsl(220,60%,40%)" radius={[4,4,0,0]} />
                                        <Legend />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <TableView data={perMes} cols={[['label','Mes'],['exclusives','Exclusivas'],['monos','Monos'],['clients','Clientes']]} />
                        </div>
                    )}

                    {/* PUNTUALIDAD */}
                    {tab === 'puntualitat' && (
                        <div className="grid gap-5 md:grid-cols-2">
                            <div className="rounded-xl border border-border bg-card p-5">
                                <p className="text-sm font-semibold mb-4">Distribución de puntualidad</p>
                                <ResponsiveContainer width="100%" height={260}>
                                    <PieChart>
                                        <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name}: ${value}`}>
                                            {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                                        </Pie>
                                        <Tooltip />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="rounded-xl border border-border bg-card p-5 grid content-start gap-4">
                                <div className="grid grid-cols-2 gap-3">
                                    {[
                                        ['A tiempo', puntAnalysis.aTemps, 'text-[hsl(var(--ok))]'],
                                        ['Retrasadas', puntAnalysis.retrasades, 'text-destructive'],
                                        ['Sin datos', puntAnalysis.senseDades, 'text-muted-foreground'],
                                        ['% Puntualidad', `${puntAnalysis.pct}%`, 'text-primary font-bold'],
                                        ['Retraso medio', `${puntAnalysis.avgRetard}d`, 'text-[hsl(var(--warn))]'],
                                    ].map(([label, val, cls]) => (
                                        <div key={label} className="rounded-lg bg-secondary/60 px-3 py-3">
                                            <p className="text-xs text-muted-foreground">{label}</p>
                                            <p className={`font-display text-3xl mt-1 ${cls}`}>{val}</p>
                                        </div>
                                    ))}
                                </div>
                                {puntAnalysis.retrasades > 0 && (
                                    <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-destructive text-sm">
                                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                        <span>{puntAnalysis.retrasades} exclusiva{puntAnalysis.retrasades > 1 ? 's' : ''} entregada{puntAnalysis.retrasades > 1 ? 's' : ''} fuera de plazo.</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* PER ARTICLE */}
                    {tab === 'article' && (
                        <div className="grid gap-5">
                            <div className="rounded-xl border border-border bg-card p-5">
                                <p className="text-sm font-semibold mb-4">Entregas por artículo</p>
                                <ResponsiveContainer width="100%" height={280}>
                                    <BarChart data={perArticle.slice(0, 10).reverse()} layout="vertical">
                                        <XAxis type="number" tick={{ fontSize: 11 }} />
                                        <YAxis type="category" dataKey="article" tick={{ fontSize: 11 }} width={120} />
                                        <Tooltip />
                                        <Bar dataKey="exclusives" name="Exclusivas" fill="hsl(22,92%,52%)" radius={[0,4,4,0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="rounded-xl border border-border bg-card overflow-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-secondary text-left text-xs uppercase">
                                        <tr>{['Artículo','Exclusivas','Monos','% Total'].map(h=><th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {perArticle.map(r => (
                                            <tr key={r.article}>
                                                <td className="px-3 py-2 font-semibold">{r.article}</td>
                                                <td className="px-3 py-2 tabular-nums">{r.exclusives}</td>
                                                <td className="px-3 py-2 tabular-nums">{r.monos}</td>
                                                <td className="px-3 py-2 tabular-nums">{r.pct}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                    {/* TIEMPOS QC */}
                    {tab === 'qc_temps' && (
                        <div className="grid gap-5">
                            {/* KPI band */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="rounded-xl border border-border bg-card p-4 text-center">
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Inspecciones</p>
                                    <p className="font-display text-4xl mt-1">{controlsQC.length}</p>
                                </div>
                                <div className="rounded-xl border border-border bg-card p-4 text-center">
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Tiempo medio</p>
                                    <p className="font-display text-4xl mt-1">{controlsQC.length ? Math.round(controlsQC.reduce((s,c) => s + (c.temps_inspeccio_seg||0), 0) / controlsQC.length / 60 * 10) / 10 : '—'}m</p>
                                </div>
                                <div className="rounded-xl border border-border bg-card p-4 text-center">
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Más rápido</p>
                                    <p className="font-display text-2xl mt-1 truncate">{qcPerOperari[0]?.operari || '—'}</p>
                                    <p className="text-xs text-muted-foreground">{qcPerOperari[0] ? `${qcPerOperari[0].avgMin}m avg` : ''}</p>
                                </div>
                                <div className="rounded-xl border border-border bg-card p-4 text-center">
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Inspec. hoy</p>
                                    <p className="font-display text-4xl mt-1">{controlsQC.filter(c => c.created?.startsWith(new Date().toISOString().substring(0,10))).length}</p>
                                </div>
                            </div>

                            {/* Line chart */}
                            {qcLineData.length > 0 && (
                                <div className="rounded-xl border border-border bg-card p-5">
                                    <p className="text-sm font-semibold mb-4">Evolución del tiempo de inspección (últimas {qcLineData.length} inspecciones)</p>
                                    <ResponsiveContainer width="100%" height={260}>
                                        <LineChart data={qcLineData}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="idx" tick={{ fontSize: 10 }} label={{ value: 'Inspección', position: 'insideBottom', offset: -5, style: { fontSize: 11 } }} />
                                            <YAxis tick={{ fontSize: 11 }} label={{ value: 'min', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} />
                                            <Tooltip formatter={(v, n) => [`${v} min`, n === 'min' ? 'Tiempo real' : 'Estándar']} />
                                            <Legend formatter={v => v === 'min' ? 'Tiempo real' : 'Estándar'} />
                                            <Line type="monotone" dataKey="min" stroke="hsl(22,92%,52%)" strokeWidth={2} dot={{ r: 3 }} name="min" />
                                            <Line type="monotone" dataKey="std" stroke="hsl(220,60%,50%)" strokeWidth={1} strokeDasharray="4 4" dot={false} name="std" />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            )}

                            {/* Per operator ranking */}
                            {qcPerOperari.length > 0 && (
                                <div className="rounded-xl border border-border bg-card p-5">
                                    <p className="text-sm font-semibold mb-4">Ranking por operario (tiempo medio)</p>
                                    <ResponsiveContainer width="100%" height={200}>
                                        <BarChart data={qcPerOperari} layout="vertical">
                                            <XAxis type="number" tick={{ fontSize: 11 }} unit=" min" />
                                            <YAxis type="category" dataKey="operari" tick={{ fontSize: 11 }} width={100} />
                                            <Tooltip formatter={v => [`${v} min`, 'Tiempo medio']} />
                                            <Bar dataKey="avgMin" fill="hsl(220,60%,40%)" radius={[0,4,4,0]} name="avgMin" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}

                            {/* Per day table */}
                            {qcPerDia.length > 0 && (
                                <div className="rounded-xl border border-border bg-card overflow-auto">
                                    <div className="p-4 border-b border-border font-semibold text-sm">Tiempo medio por día</div>
                                    <table className="w-full text-sm">
                                        <thead className="bg-secondary text-left text-xs uppercase">
                                            <tr>
                                                {['Fecha', 'Inspecciones', 'Tiempo medio'].map(h => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {qcPerDia.map(r => (
                                                <tr key={r.data}>
                                                    <td className="px-3 py-2">{r.data}</td>
                                                    <td className="px-3 py-2 tabular-nums">{r.count}</td>
                                                    <td className="px-3 py-2 tabular-nums">{r.avgMin} min</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Historial */}
                            <div className="rounded-xl border border-border bg-card overflow-auto">
                                <div className="p-4 border-b border-border font-semibold text-sm">Historial de inspecciones</div>
                                <table className="w-full min-w-[700px] text-sm">
                                    <thead className="bg-secondary text-left text-xs uppercase">
                                        <tr>
                                            {['Fecha', 'Operario QC', 'Exclusiva', 'Mono', 'Tiempo', 'NC detectadas', 'Resultado'].map(h => (
                                                <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {controlsQC.length === 0 ? (
                                            <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Sin inspecciones registradas.</td></tr>
                                        ) : controlsQC.map(c => {
                                            const notesMatch = (c.notes || '').match(/(\d+) NC/);
                                            const ncCount = notesMatch ? parseInt(notesMatch[1], 10) : 0;
                                            const resBadge = { aprovat: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]', aprovat_obs: 'bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))]', retreball: 'bg-orange-100 text-orange-700', rebutjat: 'bg-destructive/10 text-destructive' };
                                            return (
                                                <tr key={c.id}>
                                                    <td className="px-3 py-2 whitespace-nowrap">{c.created ? new Date(c.created).toLocaleString('es-ES', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—'}</td>
                                                    <td className="px-3 py-2">{c.expand?.operari?.name || c.expand?.operari?.codi || '—'}</td>
                                                    <td className="px-3 py-2 font-semibold">{c.expand?.exclusiva?.exclusiva || '—'}</td>
                                                    <td className="px-3 py-2">{c.expand?.mono?.codi || '—'}</td>
                                                    <td className="px-3 py-2 tabular-nums font-mono">{fmtMin(c.temps_inspeccio_seg)}</td>
                                                    <td className="px-3 py-2 tabular-nums">{ncCount > 0 ? <span className="text-destructive font-semibold">{ncCount}</span> : 0}</td>
                                                    <td className="px-3 py-2"><span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${resBadge[c.resultat] || 'bg-secondary'}`}>{c.resultat || '—'}</span></td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}
        </section>
    );
}

function TableView({ data, cols }) {
    return (
        <div className="rounded-xl border border-border bg-card overflow-auto">
            <table className="w-full text-sm">
                <thead className="bg-secondary text-left text-xs uppercase">
                    <tr>{cols.map(([k,l]) => <th key={k} className="px-3 py-2 font-semibold">{l}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-border">
                    {data.length === 0 ? (
                        <tr><td colSpan={cols.length} className="p-8 text-center text-muted-foreground">Sin datos.</td></tr>
                    ) : data.map((row, i) => (
                        <tr key={i}>
                            {cols.map(([k]) => <td key={k} className="px-3 py-2">{row[k] ?? '—'}</td>)}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function getWeekNumber(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

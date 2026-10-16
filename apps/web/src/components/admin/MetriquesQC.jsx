import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { RefreshCcw } from 'lucide-react';
import pb from '@/lib/pocketbaseClient';

export default function MetriquesQC() {
    const [controls, setControls] = useState([]);
    const [noConformitats, setNoConformitats] = useState([]);
    const [carregant, setCarregant] = useState(true);

    const carrega = useCallback(async () => {
        setCarregant(true);
        try {
            const [cqs, ncs] = await Promise.all([
                pb.collection('controles_qualitat').getFullList({
                    sort: '-created',
                    expand: 'operari,exclusiva,mono',
                    requestKey: 'metriques-qc-controls',
                }),
                pb.collection('no_conformitats').getFullList({
                    sort: '-created',
                    expand: 'categoria',
                    requestKey: 'metriques-qc-ncs',
                }),
            ]);
            setControls(cqs);
            setNoConformitats(ncs);
        } catch (e) { console.error(e); }
        finally { setCarregant(false); }
    }, []);

    useEffect(() => { carrega(); }, [carrega]);

    // Checklist inspections (created by ChecklistQC with operacio = 'Checklist QC Final')
    const checklistControls = useMemo(() =>
        controls.filter(c => c.operacio === 'Checklist QC Final'),
        [controls]
    );

    const metrics = useMemo(() => {
        const total = checklistControls.length;

        // Per result
        const byResult = {};
        for (const c of checklistControls) {
            const r = c.resultat || 'pendent';
            byResult[r] = (byResult[r] || 0) + 1;
        }
        const aprovats = (byResult['aprovat'] || 0) + (byResult['ok'] || 0);
        const ambObs = byResult['aprovat_obs'] || 0;
        const retreball = byResult['retreball'] || 0;
        const rebutjats = (byResult['rebutjat'] || 0) + (byResult['ko'] || 0);

        // Time metrics
        const withTime = checklistControls.filter(c => c.temps_inspeccio_seg > 0);
        const avgTime = withTime.length
            ? Math.round(withTime.reduce((s, c) => s + c.temps_inspeccio_seg, 0) / withTime.length)
            : null;

        // Per operator
        const byOp = {};
        for (const c of checklistControls) {
            const opId = c.operari || 'unknown';
            const opName = c.expand?.operari?.name || c.expand?.operari?.codi || opId;
            if (!byOp[opId]) byOp[opId] = { nom: opName, total: 0, aprovats: 0, temps: [] };
            byOp[opId].total++;
            if (c.resultat === 'aprovat' || c.resultat === 'ok') byOp[opId].aprovats++;
            if (c.temps_inspeccio_seg > 0) byOp[opId].temps.push(c.temps_inspeccio_seg);
        }
        const opStats = Object.values(byOp).map(op => ({
            ...op,
            pctAprovat: op.total ? Math.round((op.aprovats / op.total) * 100) : 0,
            avgTemps: op.temps.length
                ? Math.round(op.temps.reduce((s, t) => s + t, 0) / op.temps.length)
                : null,
        })).sort((a, b) => b.total - a.total);

        const fastest = opStats.filter(op => op.avgTemps).sort((a, b) => a.avgTemps - b.avgTemps)[0] || null;

        // By day (last 14 days)
        const byDay = {};
        for (const c of checklistControls) {
            const d = c.created?.substring(0, 10) || '—';
            if (!byDay[d]) byDay[d] = { data: d, total: 0, aprovats: 0, retreball: 0 };
            byDay[d].total++;
            if (c.resultat === 'aprovat' || c.resultat === 'ok') byDay[d].aprovats++;
            if (c.resultat === 'retreball' || c.resultat === 'rebutjat') byDay[d].retreball++;
        }
        const chartData = Object.values(byDay)
            .sort((a, b) => a.data.localeCompare(b.data))
            .slice(-14);

        return {
            total, aprovats, ambObs, retreball, rebutjats,
            pctAprovat: total ? Math.round((aprovats / total) * 100) : 0,
            pctRetreball: total ? Math.round((retreball / total) * 100) : 0,
            pctRebutjat: total ? Math.round((rebutjats / total) * 100) : 0,
            avgTime, opStats, fastest, chartData,
        };
    }, [checklistControls]);

    // NC analysis
    const ncMetrics = useMemo(() => {
        const total = noConformitats.length;
        const byArea = {};
        const byCat = {};
        for (const nc of noConformitats) {
            const area = nc.area || 'Sin área';
            byArea[area] = (byArea[area] || 0) + 1;
            const cat = nc.expand?.categoria?.nom || 'Sin categoría';
            byCat[cat] = (byCat[cat] || 0) + 1;
        }
        const areaData = Object.entries(byArea)
            .map(([area, count]) => ({ area, count, pct: total ? Math.round((count / total) * 100) : 0 }))
            .sort((a, b) => b.count - a.count);
        const catData = Object.entries(byCat)
            .map(([cat, count]) => ({ cat, count, pct: total ? Math.round((count / total) * 100) : 0 }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 8);
        return { total, areaData, catData };
    }, [noConformitats]);

    if (carregant) return <div className="h-40 animate-pulse rounded-xl bg-secondary" />;

    return (
        <section>
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h2 className="font-display text-3xl uppercase leading-none">Métricas de calidad</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        {metrics.total} inspecciones QC · {ncMetrics.total} no conformidades
                    </p>
                </div>
                <button onClick={carrega} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-secondary active:scale-95">
                    <RefreshCcw className="h-4 w-4" /> Actualizar
                </button>
            </div>

            {metrics.total === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
                    <p className="font-display text-2xl uppercase">Sin inspecciones QC registradas</p>
                    <p className="text-sm mt-1">Las métricas aparecerán cuando se completen checklists de calidad.</p>
                </div>
            ) : (
                <div className="grid gap-5">
                    {/* KPI band */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                            ['Inspecciones', metrics.total, '', ''],
                            ['Aprobadas 1ª', `${metrics.pctAprovat}%`, 'border-[hsl(var(--ok))]/30 bg-[hsl(var(--ok))]/5', 'text-[hsl(var(--ok))]'],
                            ['Retrabajo', `${metrics.pctRetreball}%`, 'border-[hsl(var(--warn))]/30 bg-[hsl(var(--warn))]/5', 'text-[hsl(var(--warn))]'],
                            ['T. medio insp.', metrics.avgTime ? `${Math.round(metrics.avgTime / 60)} min` : '—', '', ''],
                        ].map(([label, val, brd, cls]) => (
                            <div key={label} className={`rounded-xl border p-4 text-center ${brd || 'border-border bg-card'}`}>
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                                <p className={`font-display text-4xl mt-1 ${cls}`}>{val}</p>
                            </div>
                        ))}
                    </div>

                    {/* Results breakdown */}
                    <div className="rounded-xl border border-border bg-card p-5">
                        <p className="text-sm font-semibold mb-4">Distribución de resultados de inspección</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {[
                                ['Aprobadas', metrics.aprovats, 'text-[hsl(var(--ok))] bg-[hsl(var(--ok))]/10'],
                                ['Con obs.', metrics.ambObs, 'text-[hsl(var(--warn))] bg-[hsl(var(--warn))]/10'],
                                ['Retrabajo', metrics.retreball, 'text-orange-700 bg-orange-50'],
                                ['Rechazadas', metrics.rebutjats, 'text-destructive bg-destructive/10'],
                            ].map(([label, count, cls]) => (
                                <div key={label} className={`rounded-lg p-4 text-center ${cls}`}>
                                    <p className="text-2xl font-bold">{count}</p>
                                    <p className="text-xs font-semibold mt-0.5">{label}</p>
                                    <p className="text-xs opacity-70">{metrics.total ? Math.round((count / metrics.total) * 100) : 0}%</p>
                                </div>
                            ))}
                        </div>
                        {metrics.fastest && (
                            <div className="mt-4 rounded-lg bg-[hsl(var(--ok))]/5 border border-[hsl(var(--ok))]/20 px-4 py-3 text-sm">
                                <span className="font-semibold text-[hsl(var(--ok))]">Inspector más rápido:</span>{' '}
                                {metrics.fastest.nom} — {Math.round(metrics.fastest.avgTemps / 60)} min promedio
                            </div>
                        )}
                    </div>

                    {/* Chart */}
                    {metrics.chartData.length > 1 && (
                        <div className="rounded-xl border border-border bg-card p-5">
                            <p className="text-sm font-semibold mb-4">Inspecciones por día (últimos 14 días)</p>
                            <ResponsiveContainer width="100%" height={240}>
                                <BarChart data={metrics.chartData}>
                                    <XAxis dataKey="data" tick={{ fontSize: 10 }} />
                                    <YAxis tick={{ fontSize: 11 }} />
                                    <Tooltip />
                                    <Bar dataKey="total" name="Total" fill="hsl(220,60%,40%)" radius={[4,4,0,0]} />
                                    <Bar dataKey="aprovats" name="Aprobadas" fill="hsl(152,60%,34%)" radius={[4,4,0,0]} />
                                    <Bar dataKey="retreball" name="Retrabajo" fill="hsl(0,72%,46%)" radius={[4,4,0,0]} />
                                    <Legend />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    {/* Operator stats */}
                    {metrics.opStats.length > 0 && (
                        <div className="rounded-xl border border-border bg-card overflow-hidden">
                            <div className="p-4 border-b border-border">
                                <p className="font-semibold">Rendimiento por inspector QC</p>
                            </div>
                            <table className="w-full text-sm">
                                <thead className="bg-secondary text-left text-xs uppercase">
                                    <tr>
                                        {['Inspector','Inspecciones','% Aprobadas','Tiempo medio'].map(h => (
                                            <th key={h} className="px-4 py-2 font-semibold">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {metrics.opStats.map((op, i) => (
                                        <tr key={i} className="hover:bg-secondary/20">
                                            <td className="px-4 py-2.5 font-semibold">{op.nom}</td>
                                            <td className="px-4 py-2.5 tabular-nums">{op.total}</td>
                                            <td className="px-4 py-2.5">
                                                <span className={`font-semibold ${op.pctAprovat >= 80 ? 'text-[hsl(var(--ok))]' : op.pctAprovat >= 60 ? 'text-[hsl(var(--warn))]' : 'text-destructive'}`}>
                                                    {op.pctAprovat}%
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5 tabular-nums">
                                                {op.avgTemps ? `${Math.round(op.avgTemps / 60)} min` : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* NC analysis */}
                    {ncMetrics.total > 0 && (
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="rounded-xl border border-border bg-card overflow-hidden">
                                <div className="p-4 border-b border-border">
                                    <p className="font-semibold">No conformidades por área ({ncMetrics.total} total)</p>
                                </div>
                                <div className="p-4 space-y-2">
                                    {ncMetrics.areaData.map(row => (
                                        <div key={row.area} className="flex items-center gap-3">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold truncate capitalize">{row.area.replace(/_/g, ' ')}</p>
                                            </div>
                                            <div className="w-24 h-1.5 rounded-full bg-secondary overflow-hidden flex-shrink-0">
                                                <div className="h-full rounded-full bg-destructive" style={{ width: `${row.pct}%` }} />
                                            </div>
                                            <span className="text-xs font-mono text-muted-foreground w-16 text-right flex-shrink-0">
                                                {row.count} ({row.pct}%)
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="rounded-xl border border-border bg-card overflow-hidden">
                                <div className="p-4 border-b border-border">
                                    <p className="font-semibold">Top 8 categorías de NC</p>
                                </div>
                                <div className="p-4 space-y-2">
                                    {ncMetrics.catData.map(row => (
                                        <div key={row.cat} className="flex items-center gap-3">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold truncate">{row.cat}</p>
                                            </div>
                                            <div className="w-24 h-1.5 rounded-full bg-secondary overflow-hidden flex-shrink-0">
                                                <div className="h-full rounded-full bg-[hsl(var(--warn))]" style={{ width: `${row.pct}%` }} />
                                            </div>
                                            <span className="text-xs font-mono text-muted-foreground w-16 text-right flex-shrink-0">
                                                {row.count} ({row.pct}%)
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}

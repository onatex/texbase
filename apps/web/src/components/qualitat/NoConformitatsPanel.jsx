import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, RefreshCcw, Edit2, X, Check, Download, BarChart2, List } from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { descarregaCSV } from '@/lib/csv';

const AREA_LABEL = {
    estampacion: 'Estampación', confeccio: 'Confección',
    acabats: 'Acabados', oficina_tecnica: 'Oficina Técnica', logistica: 'Logística',
};
const PRIO_LABEL = { alta: 'Alta', media: 'Media', baixa: 'Baja' };
const ESTAT_LABEL = { oberta: 'Abierta', tancada: 'Cerrada' };

export default function NoConformitatsPanel() {
    const [ncs, setNcs] = useState([]);
    const [categories, setCategories] = useState([]);
    const [carregant, setCarregant] = useState(true);
    const [q, setQ] = useState('');
    const [estatFil, setEstatFil] = useState('totes');
    const [areaFil, setAreaFil] = useState('totes');
    const [view, setView] = useState('list');
    const [editing, setEditing] = useState(null);
    const [editFields, setEditFields] = useState({});
    const [saving, setSaving] = useState(false);

    const carrega = useCallback(async () => {
        setCarregant(true);
        try {
            const [ncsData, catsData] = await Promise.all([
                pb.collection('no_conformitats').getFullList({
                    sort: '-created', expand: 'categoria,exclusiva,mono,operari_que_detecto',
                    requestKey: 'nc-panel-list',
                }),
                pb.collection('categories_nc').getFullList({ sort: 'nom', requestKey: 'cats-panel' }),
            ]);
            setNcs(ncsData);
            setCategories(catsData);
        } catch (err) {
            console.error('Error loading NCs', err);
        } finally {
            setCarregant(false);
        }
    }, []);

    useEffect(() => { carrega(); }, [carrega]);

    const ncsFiltrats = useMemo(() => {
        const t = q.trim().toLowerCase();
        return ncs.filter(nc => {
            if (estatFil !== 'totes' && nc.estat !== estatFil) return false;
            if (areaFil !== 'totes' && nc.area !== areaFil) return false;
            if (t && !`${nc.codi} ${nc.client} ${nc.descripcio} ${nc.expand?.exclusiva?.exclusiva || ''}`.toLowerCase().includes(t)) return false;
            return true;
        });
    }, [ncs, q, estatFil, areaFil]);

    const byCategory = useMemo(() => {
        const map = new Map();
        for (const nc of ncs) {
            const catId = nc.categoria || '__none__';
            const catNom = nc.expand?.categoria?.nom || 'Sin categoría';
            const catColor = nc.expand?.categoria?.color || '#94a3b8';
            if (!map.has(catId)) map.set(catId, { nom: catNom, color: catColor, ncs: [] });
            map.get(catId).ncs.push(nc);
        }
        return [...map.values()].sort((a, b) => b.ncs.length - a.ncs.length);
    }, [ncs]);

    const byPunt = useMemo(() => {
        const counts = {};
        for (const nc of ncs) {
            if (!nc.punt_checklist) continue;
            counts[nc.punt_checklist] = (counts[nc.punt_checklist] || 0) + 1;
        }
        return Object.entries(counts).sort((a, b) => b[1] - a[1]);
    }, [ncs]);

    const total = ncs.length;

    const handleEdit = (nc) => {
        setEditing(nc.id);
        setEditFields({ estat: nc.estat || 'oberta', solucio_implantada: nc.solucio_implantada || '', accio_preventiva: nc.accio_preventiva || '' });
    };
    const handleSaveEdit = async (ncId) => {
        setSaving(true);
        try {
            await pb.collection('no_conformitats').update(ncId, editFields, { requestKey: `nc-upd-${ncId}` });
            setNcs(prev => prev.map(n => n.id === ncId ? { ...n, ...editFields } : n));
            setEditing(null);
        } finally { setSaving(false); }
    };

    const exportCSV = () => descarregaCSV('no_conformitats.csv', ncs.map(nc => ({
        ID: nc.codi,
        Fecha: nc.data_nc ? new Date(nc.data_nc).toLocaleDateString('es-ES') : '',
        Cliente: nc.client,
        Exclusiva: nc.expand?.exclusiva?.exclusiva || '',
        Área: AREA_LABEL[nc.area] || nc.area,
        'Punto checklist': nc.punt_checklist,
        Descripción: nc.descripcio,
        Prioridad: PRIO_LABEL[nc.prioritat] || nc.prioritat,
        Estado: ESTAT_LABEL[nc.estat] || nc.estat,
        Categoría: nc.expand?.categoria?.nom || '',
        'Solución': nc.solucio_implantada,
        'Acción preventiva': nc.accio_preventiva,
    })));

    return (
        <div>
            {/* Toolbar */}
            <div className="mb-5 flex flex-wrap items-center gap-3">
                <div className="flex rounded-xl border border-border overflow-hidden">
                    <button onClick={() => setView('list')} className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold transition ${view === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'}`}>
                        <List className="h-4 w-4" /> Lista
                    </button>
                    <button onClick={() => setView('analisi')} className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold transition ${view === 'analisi' ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'}`}>
                        <BarChart2 className="h-4 w-4" /> Análisis
                    </button>
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar ID, cliente, descripción..."
                        className="h-10 w-64 rounded-lg border border-input bg-background pl-10 pr-3 text-sm" />
                </div>
                <select value={estatFil} onChange={e => setEstatFil(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
                    <option value="totes">Todos los estados</option>
                    <option value="oberta">Abierta</option>
                    <option value="tancada">Cerrada</option>
                </select>
                <select value={areaFil} onChange={e => setAreaFil(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
                    <option value="totes">Todas las áreas</option>
                    {Object.entries(AREA_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <button onClick={carrega} className="h-10 rounded-lg border border-border px-3 hover:bg-secondary active:scale-95">
                    <RefreshCcw className="h-4 w-4" />
                </button>
                <button onClick={exportCSV} className="flex items-center gap-1.5 h-10 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-secondary active:scale-95">
                    <Download className="h-4 w-4" /> CSV
                </button>
            </div>

            {carregant ? (
                <div className="h-40 animate-pulse rounded-xl bg-secondary" />
            ) : view === 'list' ? (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1000px] text-sm">
                            <thead className="bg-secondary text-left text-xs uppercase">
                                <tr>
                                    {['ID', 'Fecha', 'Cliente', 'Exclusiva', 'Área', 'Punto', 'Descripción', 'Prioridad', 'Estado', 'Acciones'].map(h => (
                                        <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {ncsFiltrats.length === 0 ? (
                                    <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">Sin no conformidades.</td></tr>
                                ) : ncsFiltrats.map(nc => (
                                    <React.Fragment key={nc.id}>
                                        <tr className={editing === nc.id ? 'bg-primary/5' : 'hover:bg-secondary/20'}>
                                            <td className="px-3 py-2 font-mono font-bold text-xs">{nc.codi || '—'}</td>
                                            <td className="px-3 py-2 text-xs tabular-nums whitespace-nowrap">
                                                {nc.data_nc ? new Date(nc.data_nc).toLocaleDateString('es-ES') : '—'}
                                            </td>
                                            <td className="px-3 py-2">{nc.client || '—'}</td>
                                            <td className="px-3 py-2 font-semibold">{nc.expand?.exclusiva?.exclusiva || '—'}</td>
                                            <td className="px-3 py-2">
                                                <span className="rounded bg-secondary px-2 py-0.5 text-xs whitespace-nowrap">{AREA_LABEL[nc.area] || nc.area || '—'}</span>
                                            </td>
                                            <td className="px-3 py-2 text-xs">{nc.punt_checklist || '—'}</td>
                                            <td className="px-3 py-2 max-w-[180px]">
                                                <p className="truncate" title={nc.descripcio}>{nc.descripcio || '—'}</p>
                                            </td>
                                            <td className="px-3 py-2">
                                                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${nc.prioritat === 'alta' ? 'bg-destructive/10 text-destructive' : nc.prioritat === 'media' ? 'bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))]' : 'bg-secondary text-muted-foreground'}`}>
                                                    {PRIO_LABEL[nc.prioritat] || '—'}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2">
                                                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${nc.estat === 'oberta' ? 'bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))]' : 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]'}`}>
                                                    {ESTAT_LABEL[nc.estat] || nc.estat}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2">
                                                {editing === nc.id ? (
                                                    <div className="flex gap-1">
                                                        <button onClick={() => handleSaveEdit(nc.id)} disabled={saving}
                                                            className="rounded bg-[hsl(var(--ok))]/20 p-1.5 text-[hsl(var(--ok))] hover:bg-[hsl(var(--ok))]/30 active:scale-95">
                                                            <Check className="h-3.5 w-3.5" />
                                                        </button>
                                                        <button onClick={() => setEditing(null)}
                                                            className="rounded bg-secondary p-1.5 hover:bg-border active:scale-95">
                                                            <X className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button onClick={() => handleEdit(nc)}
                                                        className="rounded border border-border p-1.5 hover:bg-secondary active:scale-95">
                                                        <Edit2 className="h-3.5 w-3.5" />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                        {editing === nc.id && (
                                            <tr className="bg-primary/5">
                                                <td colSpan={10} className="px-4 py-3 border-b border-primary/20">
                                                    <div className="grid sm:grid-cols-3 gap-3">
                                                        <div>
                                                            <label className="text-xs font-semibold text-muted-foreground uppercase">Estado</label>
                                                            <select value={editFields.estat} onChange={e => setEditFields(f => ({ ...f, estat: e.target.value }))}
                                                                className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
                                                                <option value="oberta">Abierta</option>
                                                                <option value="tancada">Cerrada</option>
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label className="text-xs font-semibold text-muted-foreground uppercase">Solución implantada</label>
                                                            <input value={editFields.solucio_implantada} onChange={e => setEditFields(f => ({ ...f, solucio_implantada: e.target.value }))}
                                                                className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" />
                                                        </div>
                                                        <div>
                                                            <label className="text-xs font-semibold text-muted-foreground uppercase">Acción preventiva</label>
                                                            <input value={editFields.accio_preventiva} onChange={e => setEditFields(f => ({ ...f, accio_preventiva: e.target.value }))}
                                                                className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" />
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                /* ── ANALYSIS VIEW ── */
                <div className="grid gap-5">
                    {/* KPIs */}
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                            { label: 'Total NCs', val: total, cls: '' },
                            { label: 'Abiertas', val: ncs.filter(n => n.estat === 'oberta').length, cls: 'text-[hsl(var(--warn))]' },
                            { label: 'Cerradas', val: ncs.filter(n => n.estat === 'tancada').length, cls: 'text-[hsl(var(--ok))]' },
                            { label: 'Prioridad Alta', val: ncs.filter(n => n.prioritat === 'alta').length, cls: 'text-destructive' },
                        ].map(k => (
                            <div key={k.label} className="rounded-xl border border-border bg-card p-4 text-center">
                                <p className={`text-xs uppercase tracking-wide mb-1 font-semibold ${k.cls || 'text-muted-foreground'}`}>{k.label}</p>
                                <p className="font-display text-4xl">{k.val}</p>
                            </div>
                        ))}
                    </div>

                    {/* By category */}
                    <div className="rounded-xl border border-border bg-card p-5">
                        <h3 className="font-display text-2xl uppercase mb-4">Por categoría (frecuencia)</h3>
                        {byCategory.length === 0 ? (
                            <p className="text-muted-foreground text-sm">Sin datos.</p>
                        ) : (
                            <div className="grid gap-3">
                                {byCategory.map(cat => {
                                    const pct = total ? Math.round((cat.ncs.length / total) * 100) : 0;
                                    return (
                                        <div key={cat.nom} className="rounded-lg bg-secondary/40 p-3">
                                            <div className="flex items-center justify-between gap-3 mb-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                                                    <p className="font-semibold text-sm">{cat.nom}</p>
                                                </div>
                                                <span className="font-mono text-sm font-bold">{cat.ncs.length} ({pct}%)</span>
                                            </div>
                                            <div className="h-2 w-full rounded-full bg-background overflow-hidden mb-2">
                                                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: cat.color }} />
                                            </div>
                                            <div className="flex flex-wrap gap-1">
                                                {cat.ncs.map(nc => (
                                                    <span key={nc.id} className="rounded bg-background border border-border px-2 py-0.5 text-xs font-mono">{nc.codi}</span>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* By checklist point */}
                    <div className="rounded-xl border border-border bg-card p-5">
                        <h3 className="font-display text-2xl uppercase mb-4">Puntos de checklist más problemáticos</h3>
                        {byPunt.length === 0 ? (
                            <p className="text-muted-foreground text-sm">Sin datos de checklist todavía.</p>
                        ) : (
                            <div className="grid gap-2">
                                {byPunt.map(([punt, count]) => {
                                    const pct = total ? Math.round((count / total) * 100) : 0;
                                    return (
                                        <div key={punt} className="flex items-center gap-3">
                                            <div className="w-40 text-sm font-medium truncate flex-shrink-0">{punt}</div>
                                            <div className="flex-1 h-2.5 rounded-full bg-secondary overflow-hidden">
                                                <div className="h-full rounded-full bg-destructive/60" style={{ width: `${Math.max(pct, 3)}%` }} />
                                            </div>
                                            <span className="text-xs font-mono w-20 text-right text-muted-foreground">{count} ({pct}%)</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* By area */}
                    <div className="rounded-xl border border-border bg-card p-5">
                        <h3 className="font-display text-2xl uppercase mb-4">Por área</h3>
                        <div className="grid gap-2">
                            {Object.entries(AREA_LABEL).map(([areaKey, areaLabel]) => {
                                const count = ncs.filter(n => n.area === areaKey).length;
                                if (!count) return null;
                                const pct = total ? Math.round((count / total) * 100) : 0;
                                return (
                                    <div key={areaKey} className="flex items-center gap-3">
                                        <div className="w-36 text-sm font-medium flex-shrink-0">{areaLabel}</div>
                                        <div className="flex-1 h-2.5 rounded-full bg-secondary overflow-hidden">
                                            <div className="h-full rounded-full bg-primary/60" style={{ width: `${Math.max(pct, 3)}%` }} />
                                        </div>
                                        <span className="text-xs font-mono w-20 text-right text-muted-foreground">{count} ({pct}%)</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

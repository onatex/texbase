import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart2, ChevronDown, ChevronRight, Clock, Edit2, GitBranch, TrendingDown, TrendingUp, X, Zap } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import pb from '@/lib/pocketbaseClient';
import ActualizarExclusivasModal from './ActualizarExclusivasModal';

const TABS = [
    { id: 'vista', label: 'Vista de ruta' },
    { id: 'editar', label: 'Editar operaciones' },
    { id: 'diagrama', label: 'Diagrama de flujo' },
    { id: 'qualitat', label: 'Controles QC' },
    { id: 'metriques', label: 'Métricas' },
];

const ESTAT_COLORS = {
    activa: 'text-[hsl(var(--ok))]',
    inactiva: 'text-muted-foreground',
    arxivada: 'text-[hsl(var(--warn))]',
};

function EditModal({ op, onSave, onClose }) {
    const [form, setForm] = useState({
        temps_std_min: op.temps_std_min ?? 0,
        temps_prep_min: op.temps_prep_min ?? 0,
        maquina: op.maquina ?? '',
        especialitat: op.especialitat ?? '',
        instruccions: op.instruccions ?? '',
        descripcio: op.descripcio ?? '',
        defectes_frequents: op.defectes_frequents ?? '',
        paralel: op.paralel ?? false,
        te_control_qualitat: op.te_control_qualitat ?? false,
        actiu: op.actiu ?? true,
        es_opcional: op.es_opcional ?? false,
    });
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        try {
            await pb.collection('operacions_def').update(op.id, form);
            onSave();
        } catch (e) {
            console.error('Error saving', e);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-lg rounded-lg bg-card max-h-[90vh] overflow-y-auto">
                <div className="sticky top-0 bg-card px-5 pt-5 pb-3 border-b border-border flex items-center justify-between">
                    <div>
                        <p className="font-display text-xl uppercase">{op.codi}</p>
                        <p className="text-sm text-muted-foreground">{op.nom}</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-md hover:bg-secondary"><X className="h-5 w-5" /></button>
                </div>
                <div className="p-5 grid gap-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-semibold uppercase text-muted-foreground">Tiempo estándar (min)</label>
                            <input type="number" min="0" step="0.5" value={form.temps_std_min}
                                onChange={(e) => setForm(f => ({ ...f, temps_std_min: parseFloat(e.target.value) || 0 }))}
                                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold uppercase text-muted-foreground">Tiempo preparación (min)</label>
                            <input type="number" min="0" step="0.5" value={form.temps_prep_min}
                                onChange={(e) => setForm(f => ({ ...f, temps_prep_min: parseFloat(e.target.value) || 0 }))}
                                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-semibold uppercase text-muted-foreground">Máquina</label>
                            <input value={form.maquina}
                                onChange={(e) => setForm(f => ({ ...f, maquina: e.target.value }))}
                                placeholder="Ej: Overlock 5 hilos"
                                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold uppercase text-muted-foreground">Especialidad</label>
                            <input value={form.especialitat}
                                onChange={(e) => setForm(f => ({ ...f, especialitat: e.target.value }))}
                                placeholder="Ej: Confeccionista"
                                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-semibold uppercase text-muted-foreground">Descripción</label>
                        <textarea value={form.descripcio} onChange={(e) => setForm(f => ({ ...f, descripcio: e.target.value }))}
                            rows={2} className="mt-1 w-full rounded-md border border-input bg-background p-3 text-sm" />
                    </div>
                    <div>
                        <label className="text-xs font-semibold uppercase text-muted-foreground">Instrucciones para el operario</label>
                        <textarea value={form.instruccions} onChange={(e) => setForm(f => ({ ...f, instruccions: e.target.value }))}
                            rows={3} className="mt-1 w-full rounded-md border border-input bg-background p-3 text-sm" />
                    </div>
                    <div>
                        <label className="text-xs font-semibold uppercase text-muted-foreground">Defectos frecuentes</label>
                        <textarea value={form.defectes_frequents} onChange={(e) => setForm(f => ({ ...f, defectes_frequents: e.target.value }))}
                            rows={2} className="mt-1 w-full rounded-md border border-input bg-background p-3 text-sm" />
                    </div>
                    <div className="flex flex-wrap gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={form.paralel} onChange={(e) => setForm(f => ({ ...f, paralel: e.target.checked }))}
                                className="h-4 w-4 rounded" />
                            <span className="text-sm font-semibold">Puede ejecutarse en paralelo</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={form.te_control_qualitat} onChange={(e) => setForm(f => ({ ...f, te_control_qualitat: e.target.checked }))}
                                className="h-4 w-4 rounded" />
                            <span className="text-sm font-semibold">Requiere control de calidad</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={form.actiu} onChange={(e) => setForm(f => ({ ...f, actiu: e.target.checked }))}
                                className="h-4 w-4 rounded" />
                            <span className="text-sm font-semibold">Activa</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={form.es_opcional} onChange={(e) => setForm(f => ({ ...f, es_opcional: e.target.checked }))}
                                className="h-4 w-4 rounded" />
                            <span className="text-sm font-semibold">Operación opcional / extra</span>
                        </label>
                    </div>
                </div>
                <div className="sticky bottom-0 bg-card px-5 pb-5 pt-3 border-t border-border flex gap-3">
                    <button onClick={handleSave} disabled={saving}
                        className="flex-1 h-11 rounded-md bg-primary text-primary-foreground font-semibold disabled:opacity-60 text-sm">
                        {saving ? 'Guardando...' : 'Guardar cambios'}
                    </button>
                    <button onClick={onClose} className="h-11 px-4 rounded-md bg-secondary font-semibold text-sm">Cancelar</button>
                </div>
            </div>
        </div>
    );
}

function EditQcModal({ qc, onSave, onClose }) {
    const [form, setForm] = useState({
        nom: qc.nom ?? '',
        descripcio: qc.descripcio ?? '',
        criteris_acceptacio: qc.criteris_acceptacio ?? '',
        defectes_frequents: qc.defectes_frequents ?? '',
        obligatori: qc.obligatori ?? true,
    });
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        try {
            await pb.collection('controles_qualitat_def').update(qc.id, form);
            onSave();
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-lg rounded-lg bg-card max-h-[90vh] overflow-y-auto p-5">
                <div className="flex items-center justify-between mb-4">
                    <p className="font-display text-xl uppercase">{qc.codi} · {qc.nom}</p>
                    <button onClick={onClose} className="p-2 rounded-md hover:bg-secondary"><X className="h-5 w-5" /></button>
                </div>
                <div className="grid gap-3">
                    <div>
                        <label className="text-xs font-semibold uppercase text-muted-foreground">Descripción</label>
                        <textarea value={form.descripcio} onChange={(e) => setForm(f => ({ ...f, descripcio: e.target.value }))}
                            rows={2} className="mt-1 w-full rounded-md border border-input bg-background p-3 text-sm" />
                    </div>
                    <div>
                        <label className="text-xs font-semibold uppercase text-muted-foreground">Criterios de aceptación</label>
                        <textarea value={form.criteris_acceptacio} onChange={(e) => setForm(f => ({ ...f, criteris_acceptacio: e.target.value }))}
                            rows={2} className="mt-1 w-full rounded-md border border-input bg-background p-3 text-sm" />
                    </div>
                    <div>
                        <label className="text-xs font-semibold uppercase text-muted-foreground">Defectos frecuentes</label>
                        <textarea value={form.defectes_frequents} onChange={(e) => setForm(f => ({ ...f, defectes_frequents: e.target.value }))}
                            rows={2} className="mt-1 w-full rounded-md border border-input bg-background p-3 text-sm" />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={form.obligatori} onChange={(e) => setForm(f => ({ ...f, obligatori: e.target.checked }))}
                            className="h-4 w-4 rounded" />
                        <span className="text-sm font-semibold">Obligatorio</span>
                    </label>
                </div>
                <div className="mt-4 flex gap-3">
                    <button onClick={handleSave} disabled={saving}
                        className="flex-1 h-11 rounded-md bg-primary text-primary-foreground font-semibold disabled:opacity-60 text-sm">
                        {saving ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button onClick={onClose} className="h-11 px-4 rounded-md bg-secondary font-semibold text-sm">Cancelar</button>
                </div>
            </div>
        </div>
    );
}

export default function RutaDetall({ rutaId, rutaNom, onClose }) {
    const [ruta, setRuta] = useState(null);
    const [ops, setOps] = useState([]);
    const [qcDefs, setQcDefs] = useState([]);
    const [carregant, setCarregant] = useState(true);
    const [tab, setTab] = useState('vista');
    const [faseObert, setFaseObert] = useState({});
    const [editOp, setEditOp] = useState(null);
    const [editQc, setEditQc] = useState(null);
    const [filtre, setFiltre] = useState('');
    const [metricsLoading, setMetricsLoading] = useState(false);
    const [metricsRegs, setMetricsRegs] = useState([]);
    const [expandedMetricOp, setExpandedMetricOp] = useState(null);
    const [aplicarOp, setAplicarOp] = useState(null);

    // Busca exclusivas que usan esta ruta y no han completado la operación dada
    const buscarExclusivasAfectadas = useCallback(async (opNom) => {
        const [exclusives, registres] = await Promise.all([
            pb.collection('exclusives').getFullList({
                filter: `ruta = "${rutaId}"`, sort: '-created', requestKey: `afect-excl-${rutaId}`,
            }).catch(() => []),
            opNom
                ? pb.collection('registres').getFullList({
                    filter: `estat = "finalitzat"`, fields: 'exclusiva,operacio', requestKey: `afect-regs-${rutaId}`,
                }).catch(() => [])
                : Promise.resolve([]),
        ]);
        if (!opNom) return exclusives;
        // Excluir las que ya completaron esa operación
        const completadas = new Set(
            registres.filter((r) => r.operacio === opNom).map((r) => r.exclusiva),
        );
        return exclusives.filter((e) => !completadas.has(e.id));
    }, [rutaId]);

    const preguntarAplicar = useCallback(async (op, tipoCambio, descripcion) => {
        const candidatas = await buscarExclusivasAfectadas(op?.nom);
        setAplicarOp({
            fase: 'confirmar',
            op, tipoCambio, descripcion,
            candidatas,
        });
    }, [buscarExclusivasAfectadas]);

    const carrega = useCallback(async () => {
        setCarregant(true);
        try {
            const [rutaRec, opsList, qcList] = await Promise.all([
                pb.collection('rutes').getOne(rutaId, { requestKey: `ruta-${rutaId}` }),
                pb.collection('operacions_def').getFullList({
                    filter: `ruta = "${rutaId}"`,
                    sort: 'ordre',
                    requestKey: `ops-${rutaId}`,
                }),
                pb.collection('controles_qualitat_def').getFullList({
                    filter: `ruta = "${rutaId}"`,
                    sort: 'codi',
                    requestKey: `qcdefs-${rutaId}`,
                }),
            ]);
            setRuta(rutaRec);
            setOps(opsList);
            setQcDefs(qcList);
            // Open first phase by default
            if (opsList.length > 0) {
                const firstFase = opsList[0].fase;
                setFaseObert({ [firstFase]: true });
            }
        } catch (e) {
            console.error('Error loading ruta detall', e);
        } finally {
            setCarregant(false);
        }
    }, [rutaId]);

    useEffect(() => { carrega(); }, [carrega]);

    const loadMetrics = useCallback(async (opsList) => {
        if (!opsList || opsList.length === 0) return;
        setMetricsLoading(true);
        try {
            const regs = await pb.collection('registres').getFullList({
                filter: `estat = "finalitzat"`,
                sort: '-created',
                expand: 'operari,exclusiva,mono',
                requestKey: `metrics-${rutaId}`,
            });
            setMetricsRegs(regs);
        } catch (e) {
            console.error('Error loading metrics', e);
        } finally {
            setMetricsLoading(false);
        }
    }, [rutaId]);

    const handleTabChange = useCallback((newTab) => {
        setTab(newTab);
        if (newTab === 'metriques' && metricsRegs.length === 0 && !metricsLoading) {
            loadMetrics(ops);
        }
    }, [ops, metricsRegs.length, metricsLoading, loadMetrics]);

    // Build metrics per operation name
    const opMetrics = useMemo(() => {
        if (!metricsRegs.length || !ops.length) return {};
        const map = {};
        for (const op of ops) {
            const opRegs = metricsRegs.filter(r => r.operacio === op.nom && r.temps_real_seg > 0);
            if (opRegs.length === 0) {
                map[op.nom] = null;
                continue;
            }
            const avgSeg = opRegs.reduce((s, r) => s + r.temps_real_seg, 0) / opRegs.length;
            const avgMin = avgSeg / 60;
            const stdMin = op.temps_std_min || 0;
            const diffMin = avgMin - stdMin;
            const diffPct = stdMin > 0 ? (diffMin / stdMin) * 100 : null;

            // Fastest operator
            const byOp = {};
            for (const r of opRegs) {
                const opId = r.operari;
                const opName = r.expand?.operari?.name || r.expand?.operari?.codi || opId || '—';
                if (!byOp[opId] || r.temps_real_seg < byOp[opId].temps) {
                    byOp[opId] = { id: opId, nom: opName, temps: r.temps_real_seg };
                }
            }
            const fastest = Object.values(byOp).sort((a, b) => a.temps - b.temps)[0];

            // Last 10 records
            const last10 = opRegs.slice(0, 10).map(r => ({
                id: r.id,
                data: r.created ? new Date(r.created).toLocaleDateString('es-ES') : '—',
                operari: r.expand?.operari?.name || r.expand?.operari?.codi || '—',
                tempsMin: Math.round((r.temps_real_seg / 60) * 10) / 10,
                diffMin: stdMin > 0 ? Math.round(((r.temps_real_seg / 60) - stdMin) * 10) / 10 : null,
                exclusiva: r.expand?.exclusiva?.exclusiva || r.exclusiva || '—',
                mono: r.expand?.mono?.codi || r.mono || '—',
            }));

            // Chart data (last 10 ordered chronologically)
            const chartData = [...last10].reverse().map((r, idx) => ({
                idx: idx + 1,
                data: r.data,
                real: r.tempsMin,
                estandard: stdMin,
            }));

            map[op.nom] = { avgMin, stdMin, diffMin, diffPct, count: opRegs.length, fastest, last10, chartData };
        }
        return map;
    }, [metricsRegs, ops]);

    const fases = useMemo(() => {
        const map = new Map();
        for (const op of ops) {
            const key = op.fase || 'Sin fase';
            if (!map.has(key)) map.set(key, { fase: key, ordre: op.fase_ordre || 0, ops: [] });
            map.get(key).ops.push(op);
        }
        return [...map.values()].sort((a, b) => a.ordre - b.ordre);
    }, [ops]);

    const totalMin = useMemo(() => ops.reduce((s, op) => s + (op.temps_std_min || 0), 0), [ops]);
    const opsActives = useMemo(() => ops.filter(op => op.actiu !== false), [ops]);
    const opsFiltrades = useMemo(() => {
        const q = filtre.trim().toLowerCase();
        if (!q) return ops;
        return ops.filter(op =>
            `${op.codi} ${op.nom} ${op.fase} ${op.maquina} ${op.especialitat}`.toLowerCase().includes(q)
        );
    }, [ops, filtre]);

    if (carregant) {
        return (
            <div className="rounded-lg border border-border bg-card p-6">
                <div className="h-6 w-48 animate-pulse rounded bg-secondary mb-4" />
                <div className="grid gap-3">
                    {[0,1,2,3].map(i => <div key={i} className="h-16 animate-pulse rounded bg-secondary" />)}
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-lg border border-border bg-card">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-4 p-5 border-b border-border">
                <div>
                    <div className="flex items-center gap-3">
                        <p className="font-display text-3xl uppercase">{ruta?.nom || rutaNom}</p>
                        {ruta?.versio && (
                            <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{ruta.versio}</span>
                        )}
                        {ruta?.estat_ruta && (
                            <span className={`text-xs font-semibold uppercase ${ESTAT_COLORS[ruta.estat_ruta] || ''}`}>
                                {ruta.estat_ruta}
                            </span>
                        )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-4 text-sm text-muted-foreground">
                        <span><Clock className="inline h-3.5 w-3.5 mr-1" />{totalMin} min totales provisionales</span>
                        <span>{opsActives.length} / {ops.length} operaciones activas</span>
                        <span>{fases.length} fases</span>
                        <span>{qcDefs.length} controles QC</span>
                    </div>
                    {ruta?.notas && <p className="mt-1 text-xs text-muted-foreground italic">{ruta.notas}</p>}
                </div>
                {onClose && (
                    <button onClick={onClose} className="rounded-md bg-secondary px-3 py-2 text-sm font-semibold flex items-center gap-2">
                        <X className="h-4 w-4" /> Cerrar
                    </button>
                )}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 px-5 pt-3 border-b border-border overflow-x-auto">
                {TABS.map(t => (
                    <button key={t.id} onClick={() => handleTabChange(t.id)}
                        className={`whitespace-nowrap px-4 py-2 text-sm font-semibold rounded-t-md transition ${tab === t.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                        {t.label}
                    </button>
                ))}
            </div>

            <div className="p-5">
                {/* VISTA */}
                {tab === 'vista' && (
                    <div className="space-y-3">
                        {fases.map(({ fase, ops: faseOps }) => {
                            const isOpen = faseObert[fase];
                            const faseMin = faseOps.reduce((s, op) => s + (op.temps_std_min || 0), 0);
                            const hasQc = faseOps.some(op => op.te_control_qualitat);
                            const hasParallel = faseOps.some(op => op.paralel);
                            return (
                                <div key={fase} className="rounded-lg border border-border overflow-hidden">
                                    <button
                                        onClick={() => setFaseObert(f => ({ ...f, [fase]: !f[fase] }))}
                                        className="w-full flex items-center justify-between px-4 py-3 bg-secondary/50 hover:bg-secondary text-left"
                                    >
                                        <div className="flex items-center gap-3">
                                            {isOpen ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
                                            <span className="font-display text-lg uppercase">{fase}</span>
                                            <span className="text-sm text-muted-foreground">{faseOps.length} ops · {faseMin} min</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {hasParallel && <span className="rounded bg-[hsl(var(--accent))]/15 px-2 py-0.5 text-xs font-semibold text-[hsl(var(--accent))]">Paralelo</span>}
                                            {hasQc && <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">QC</span>}
                                        </div>
                                    </button>
                                    {isOpen && (
                                        <div className="divide-y divide-border">
                                            {faseOps.map(op => (
                                                <div key={op.id} className={`flex items-start gap-3 px-4 py-3 ${op.actiu === false ? 'opacity-50' : ''}`}>
                                                    <div className="min-w-[90px]">
                                                        <span className="font-mono text-xs font-bold bg-secondary rounded px-2 py-1">{op.codi}</span>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-semibold text-sm">{op.nom}</p>
                                                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                                            {op.maquina && <span className="bg-secondary rounded px-1.5 py-0.5">{op.maquina}</span>}
                                                            {op.especialitat && <span className="bg-secondary rounded px-1.5 py-0.5">{op.especialitat}</span>}
                                                            {op.peca_zona && <span className="text-muted-foreground">{op.peca_zona}</span>}
                                                        </div>
                                                        {op.op_anterior && (
                                                            <p className="mt-1 text-xs text-muted-foreground">Req. anterior: <span className="font-mono">{op.op_anterior}</span></p>
                                                        )}
                                                        {op.instruccions && (
                                                            <p className="mt-1 text-xs text-muted-foreground italic line-clamp-2">{op.instruccions}</p>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-col items-end gap-1 shrink-0">
                                                        <span className="tabular-nums text-sm font-bold">{op.temps_std_min || 0} min</span>
                                                        <div className="flex gap-1">
                                                            {op.paralel && <Zap className="h-3.5 w-3.5 text-[hsl(var(--accent))]" title="Paralelo" />}
                                                            {op.te_control_qualitat && <AlertTriangle className="h-3.5 w-3.5 text-primary" title="Control QC" />}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* EDITAR */}
                {tab === 'editar' && (
                    <div>
                        <div className="mb-4 flex flex-wrap items-center gap-3">
                            <input value={filtre} onChange={e => setFiltre(e.target.value)}
                                placeholder="Buscar por código, nombre, máquina..."
                                className="h-10 w-72 rounded-md border border-input bg-background px-3 text-sm" />
                            <p className="text-sm text-muted-foreground">{opsFiltrades.length} operaciones · {totalMin} min totales (provisionales)</p>
                        </div>
                        <div className="overflow-auto rounded-lg border border-border">
                            <table className="w-full min-w-[900px] text-sm">
                                <thead className="bg-secondary text-left text-xs uppercase">
                                    <tr>
                                        {['Código','Operación','Fase','Máquina','Especialidad','T.Std (min)','T.Prep','Paralelo','QC','Ant.','Activa','Opc.','Editar'].map(h => (
                                            <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {opsFiltrades.length === 0 ? (
                                        <tr><td colSpan={12} className="p-6 text-center text-muted-foreground">Sin resultados.</td></tr>
                                    ) : opsFiltrades.map(op => (
                                        <tr key={op.id} className={op.actiu === false ? 'opacity-50 bg-secondary/30' : 'hover:bg-secondary/20'}>
                                            <td className="px-3 py-2 font-mono font-bold text-xs">{op.codi}</td>
                                            <td className="px-3 py-2 max-w-[200px]">
                                                <p className="font-medium truncate">{op.nom}</p>
                                                {op.instruccions && <p className="text-xs text-muted-foreground truncate">{op.instruccions}</p>}
                                            </td>
                                            <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{op.fase?.replace(/^Fase \d+: /, '') || '—'}</td>
                                            <td className="px-3 py-2 text-xs">{op.maquina || '—'}</td>
                                            <td className="px-3 py-2 text-xs">{op.especialitat || '—'}</td>
                                            <td className="px-3 py-2 tabular-nums font-semibold">{op.temps_std_min || '?'}</td>
                                            <td className="px-3 py-2 tabular-nums text-muted-foreground">{op.temps_prep_min || '—'}</td>
                                            <td className="px-3 py-2 text-center">{op.paralel ? '✓' : ''}</td>
                                            <td className="px-3 py-2 text-center">{op.te_control_qualitat ? '✓' : ''}</td>
                                            <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{op.op_anterior || '—'}</td>
                                            <td className="px-3 py-2 text-center">{op.actiu !== false ? '✓' : '✗'}</td>
                                            <td className="px-3 py-2 text-center">{op.es_opcional ? <span className="rounded bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))] px-1.5 py-0.5 text-xs font-semibold">Opc.</span> : ''}</td>
                                            <td className="px-3 py-2">
                                                <button onClick={() => setEditOp(op)}
                                                    className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-semibold hover:bg-secondary">
                                                    <Edit2 className="h-3 w-3" /> Editar
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className="mt-3 text-xs text-muted-foreground">Nota: los tiempos son provisionales y deben validarse en producción real. Edita cada operación para ajustar tiempos, máquinas e instrucciones.</p>
                    </div>
                )}

                {/* DIAGRAMA */}
                {tab === 'diagrama' && (
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">Flujo de fases en orden de producción. Las fases marcadas con <Zap className="inline h-3.5 w-3.5 text-[hsl(var(--accent))]" /> contienen operaciones en paralelo.</p>
                        <div className="space-y-2">
                            {fases.map(({ fase, ops: faseOps }, idx) => {
                                const faseMin = faseOps.reduce((s, op) => s + (op.temps_std_min || 0), 0);
                                const hasParallel = faseOps.some(op => op.paralel);
                                const hasQc = faseOps.some(op => op.te_control_qualitat);
                                return (
                                    <React.Fragment key={fase}>
                                        <div className={`rounded-lg border-2 p-4 ${hasQc ? 'border-primary/40' : 'border-border'} bg-card`}>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">{idx + 1}</span>
                                                    <div>
                                                        <p className="font-display text-lg uppercase">{fase.replace(/^Fase \d+: /, '')}</p>
                                                        <p className="text-xs text-muted-foreground">{faseOps.length} operaciones · {faseMin} min</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {hasParallel && (
                                                        <span className="flex items-center gap-1 rounded bg-[hsl(var(--accent))]/15 px-2 py-1 text-xs font-semibold text-[hsl(var(--accent))]">
                                                            <Zap className="h-3 w-3" /> Paralelo
                                                        </span>
                                                    )}
                                                    {hasQc && (
                                                        <span className="flex items-center gap-1 rounded bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                                                            <AlertTriangle className="h-3 w-3" /> QC
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="mt-3 grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-4">
                                                {faseOps.map(op => (
                                                    <div key={op.id} className={`rounded border px-2 py-1.5 text-xs ${op.actiu === false ? 'opacity-40' : ''} ${op.te_control_qualitat ? 'border-primary/40 bg-primary/5' : 'border-border bg-secondary/50'}`}>
                                                        <p className="font-mono font-bold text-[10px] text-muted-foreground">{op.codi}</p>
                                                        <p className="font-medium leading-tight mt-0.5 line-clamp-2">{op.nom}</p>
                                                        <p className="mt-0.5 text-muted-foreground">{op.temps_std_min || '?'} min</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        {idx < fases.length - 1 && (
                                            <div className="flex justify-center">
                                                <div className="flex flex-col items-center gap-0.5">
                                                    <div className="h-4 w-0.5 bg-border" />
                                                    <GitBranch className="h-4 w-4 text-muted-foreground rotate-180" />
                                                </div>
                                            </div>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </div>
                        <div className="mt-4 rounded-lg border border-border bg-secondary/30 p-4">
                            <p className="text-sm font-semibold">Resumen de tiempos</p>
                            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                                {fases.map(({ fase, ops: faseOps }) => (
                                    <div key={fase} className="flex items-center justify-between rounded border border-border bg-card px-3 py-2 text-sm">
                                        <span className="text-muted-foreground truncate">{fase.replace(/^Fase \d+: /, '')}</span>
                                        <span className="font-semibold tabular-nums shrink-0 ml-2">{faseOps.reduce((s, op) => s + (op.temps_std_min || 0), 0)} min</span>
                                    </div>
                                ))}
                            </div>
                            <p className="mt-3 text-sm text-muted-foreground">
                                Total estimado (secuencial): <strong>{totalMin} min ({Math.round(totalMin / 60 * 10) / 10} h)</strong> por unidad.
                                Con operaciones en paralelo (Fase 2), el tiempo real puede reducirse significativamente.
                            </p>
                        </div>
                    </div>
                )}

                {/* QUALITAT */}
                {tab === 'qualitat' && (
                    <div>
                        <div className="mb-4 flex items-center justify-between">
                            <p className="text-sm text-muted-foreground">{qcDefs.length} controles de calidad definidos · {qcDefs.filter(q => q.obligatori).length} obligatorios</p>
                        </div>
                        <div className="overflow-auto rounded-lg border border-border">
                            <table className="w-full min-w-[800px] text-sm">
                                <thead className="bg-secondary text-left text-xs uppercase">
                                    <tr>
                                        {['Código','Control','Fase/Operación','Criterios de aceptación','Defectos frecuentes','Obligatorio','Editar'].map(h => (
                                            <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {qcDefs.length === 0 ? (
                                        <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Sin controles QC definidos.</td></tr>
                                    ) : qcDefs.map(qc => (
                                        <tr key={qc.id} className="hover:bg-secondary/20">
                                            <td className="px-3 py-2 font-mono font-bold text-xs">{qc.codi || '—'}</td>
                                            <td className="px-3 py-2 font-medium">{qc.nom}</td>
                                            <td className="px-3 py-2 text-xs text-muted-foreground">{qc.fase_operacio?.replace(/^Fase \d+: /, '') || '—'}</td>
                                            <td className="px-3 py-2 text-xs max-w-[200px]">{qc.criteris_acceptacio || '—'}</td>
                                            <td className="px-3 py-2 text-xs text-destructive max-w-[200px]">{qc.defectes_frequents || '—'}</td>
                                            <td className="px-3 py-2 text-center">
                                                {qc.obligatori
                                                    ? <span className="rounded bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">Sí</span>
                                                    : <span className="rounded bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">No</span>
                                                }
                                            </td>
                                            <td className="px-3 py-2">
                                                <button onClick={() => setEditQc(qc)}
                                                    className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-semibold hover:bg-secondary">
                                                    <Edit2 className="h-3 w-3" /> Editar
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* MÉTRIQUES */}
                {tab === 'metriques' && (
                    <div>
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="font-semibold">Métricas de tiempos por operación</p>
                                <p className="text-xs text-muted-foreground">Calculado a partir de todos los registros completados</p>
                            </div>
                            <button
                                onClick={() => { setMetricsRegs([]); loadMetrics(ops); }}
                                disabled={metricsLoading}
                                className="rounded-md bg-secondary px-3 py-2 text-sm font-semibold disabled:opacity-60"
                            >
                                {metricsLoading ? 'Cargando...' : 'Actualizar datos'}
                            </button>
                        </div>

                        {metricsLoading ? (
                            <div className="grid gap-3">
                                {[0,1,2,3,4].map(i => <div key={i} className="h-16 animate-pulse rounded-lg bg-secondary" />)}
                            </div>
                        ) : metricsRegs.length === 0 ? (
                            <div className="rounded-lg border border-border bg-secondary/30 p-10 text-center text-muted-foreground">
                                <BarChart2 className="mx-auto mb-3 h-10 w-10 opacity-30" />
                                <p className="font-semibold">No hay datos de registros todavía</p>
                                <p className="mt-1 text-sm">Las métricas aparecerán aquí cuando los operarios completen operaciones.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {ops.map(op => {
                                    const m = opMetrics[op.nom];
                                    const isExpanded = expandedMetricOp === op.id;
                                    const slower = m && m.diffMin > 0;
                                    const faster = m && m.diffMin < 0;
                                    return (
                                        <div key={op.id} className="rounded-lg border border-border overflow-hidden">
                                            <div
                                                className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-secondary/30 cursor-pointer"
                                                onClick={() => setExpandedMetricOp(isExpanded ? null : op.id)}
                                            >
                                                {/* Code */}
                                                <span className="font-mono text-xs font-bold bg-secondary rounded px-2 py-1 shrink-0">{op.codi}</span>
                                                {/* Name */}
                                                <div className="flex-1 min-w-[140px]">
                                                    <p className="font-semibold text-sm leading-tight">{op.nom}</p>
                                                    <p className="text-xs text-muted-foreground">{op.fase?.replace(/^Fase \d+: /, '') || '—'}{op.maquina ? ` · ${op.maquina}` : ''}</p>
                                                </div>
                                                {/* Standard time */}
                                                <div className="text-center min-w-[72px]">
                                                    <p className="text-xs text-muted-foreground">Estándar</p>
                                                    <p className="font-semibold tabular-nums text-sm">{op.temps_std_min || '—'} min</p>
                                                </div>
                                                {/* Avg real */}
                                                <div className="text-center min-w-[72px]">
                                                    <p className="text-xs text-muted-foreground">Medio real</p>
                                                    <p className="font-semibold tabular-nums text-sm">{m ? `${Math.round(m.avgMin * 10) / 10} min` : '—'}</p>
                                                </div>
                                                {/* Diff */}
                                                <div className="text-center min-w-[90px]">
                                                    <p className="text-xs text-muted-foreground">Diferencia</p>
                                                    {m ? (
                                                        <p className={`font-bold tabular-nums text-sm flex items-center justify-center gap-1 ${slower ? 'text-destructive' : faster ? 'text-[hsl(var(--ok))]' : 'text-muted-foreground'}`}>
                                                            {slower ? <TrendingUp className="h-3.5 w-3.5" /> : faster ? <TrendingDown className="h-3.5 w-3.5" /> : null}
                                                            {m.diffMin > 0 ? '+' : ''}{Math.round(m.diffMin * 10) / 10} min
                                                            {m.diffPct != null && (
                                                                <span className="text-xs font-normal">({m.diffPct > 0 ? '+' : ''}{Math.round(m.diffPct)}%)</span>
                                                            )}
                                                        </p>
                                                    ) : <p className="text-sm text-muted-foreground">—</p>}
                                                </div>
                                                {/* Count */}
                                                <div className="text-center min-w-[56px]">
                                                    <p className="text-xs text-muted-foreground">Registros</p>
                                                    <p className="font-semibold tabular-nums text-sm">{m ? m.count : 0}</p>
                                                </div>
                                                {/* Expand arrow */}
                                                <div className="ml-auto">
                                                    {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                                </div>
                                            </div>

                                            {isExpanded && m && (
                                                <div className="border-t border-border bg-secondary/10 p-4 space-y-5">
                                                    {/* Summary stats */}
                                                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                                        <div className="rounded-lg border border-border bg-card p-3 text-center">
                                                            <p className="text-xs text-muted-foreground">Registros totales</p>
                                                            <p className="mt-1 text-2xl font-bold tabular-nums">{m.count}</p>
                                                        </div>
                                                        <div className={`rounded-lg border p-3 text-center ${slower ? 'border-destructive/30 bg-destructive/5' : faster ? 'border-[hsl(var(--ok))]/30 bg-[hsl(var(--ok))]/5' : 'border-border bg-card'}`}>
                                                            <p className="text-xs text-muted-foreground">Desviación media</p>
                                                            <p className={`mt-1 text-2xl font-bold tabular-nums ${slower ? 'text-destructive' : faster ? 'text-[hsl(var(--ok))]' : ''}`}>
                                                                {m.diffMin > 0 ? '+' : ''}{Math.round(m.diffMin * 10) / 10} min
                                                            </p>
                                                            {m.diffPct != null && <p className="text-xs text-muted-foreground">{m.diffPct > 0 ? '+' : ''}{Math.round(m.diffPct)}%</p>}
                                                        </div>
                                                        <div className="rounded-lg border border-border bg-card p-3 text-center">
                                                            <p className="text-xs text-muted-foreground">Tiempo estándar</p>
                                                            <p className="mt-1 text-2xl font-bold tabular-nums">{op.temps_std_min || '—'} min</p>
                                                        </div>
                                                        <div className="rounded-lg border border-[hsl(var(--ok))]/30 bg-[hsl(var(--ok))]/5 p-3 text-center">
                                                            <p className="text-xs text-muted-foreground">Operario más rápido</p>
                                                            <p className="mt-1 text-sm font-bold leading-tight">{m.fastest?.nom || '—'}</p>
                                                            {m.fastest && <p className="text-xs text-muted-foreground">{Math.round(m.fastest.temps / 60 * 10) / 10} min</p>}
                                                        </div>
                                                    </div>

                                                    {/* Line chart */}
                                                    {m.chartData.length > 1 && (
                                                        <div>
                                                            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Evolución de tiempos (últimos {m.chartData.length} registros)</p>
                                                            <ResponsiveContainer width="100%" height={180}>
                                                                <LineChart data={m.chartData} margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
                                                                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                                                    <XAxis dataKey="data" tick={{ fontSize: 10 }} />
                                                                    <YAxis tick={{ fontSize: 10 }} unit=" min" width={48} />
                                                                    <Tooltip formatter={(v, n) => [`${v} min`, n === 'real' ? 'Tiempo real' : 'Tiempo estándar']} />
                                                                    <Line type="monotone" dataKey="real" stroke="hsl(var(--accent))" strokeWidth={2} dot={{ r: 3 }} name="real" />
                                                                    <Line type="monotone" dataKey="estandard" stroke="hsl(var(--primary))" strokeWidth={1.5} strokeDasharray="5 5" dot={false} name="estandard" />
                                                                </LineChart>
                                                            </ResponsiveContainer>
                                                        </div>
                                                    )}

                                                    {/* Last 10 table */}
                                                    <div>
                                                        <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Últimos {m.last10.length} registros</p>
                                                        <div className="overflow-auto rounded-lg border border-border">
                                                            <table className="w-full min-w-[600px] text-sm">
                                                                <thead className="bg-secondary text-left text-xs uppercase">
                                                                    <tr>
                                                                        {['Fecha','Operario','Tiempo real','Dif. estándar','Exclusiva','Mono'].map(h => (
                                                                            <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                                                                        ))}
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-border">
                                                                    {m.last10.map(r => (
                                                                        <tr key={r.id} className="hover:bg-secondary/20">
                                                                            <td className="px-3 py-2 tabular-nums text-xs">{r.data}</td>
                                                                            <td className="px-3 py-2 font-semibold text-xs">{r.operari}</td>
                                                                            <td className="px-3 py-2 tabular-nums font-semibold">{r.tempsMin} min</td>
                                                                            <td className={`px-3 py-2 tabular-nums font-semibold ${r.diffMin > 0 ? 'text-destructive' : r.diffMin < 0 ? 'text-[hsl(var(--ok))]' : ''}`}>
                                                                                {r.diffMin != null ? `${r.diffMin > 0 ? '+' : ''}${r.diffMin} min` : '—'}
                                                                            </td>
                                                                            <td className="px-3 py-2 text-xs text-muted-foreground">{r.exclusiva}</td>
                                                                            <td className="px-3 py-2 text-xs text-muted-foreground">{r.mono}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {isExpanded && !m && (
                                                <div className="border-t border-border bg-secondary/10 px-4 py-6 text-center text-sm text-muted-foreground">
                                                    Sin registros completados para esta operación.
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Edit modals */}
            {editOp && (
                <EditModal
                    op={editOp}
                    onClose={() => setEditOp(null)}
                    onSave={() => {
                        const savedOp = editOp;
                        setEditOp(null);
                        carrega();
                        preguntarAplicar(
                            savedOp,
                            'operacion_modificada',
                            `Operación "${savedOp.codi} · ${savedOp.nom}" modificada en la ruta ${ruta?.nom || rutaNom}`,
                        );
                    }}
                />
            )}

            {/* Paso 1: ¿Aplicar a exclusivas existentes? */}
            {aplicarOp?.fase === 'confirmar' && (
                <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60 p-4" onClick={() => setAplicarOp(null)}>
                    <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <h3 className="font-display text-2xl uppercase">¿Actualizar exclusivas existentes?</h3>
                        <p className="mt-2 text-sm text-muted-foreground">{aplicarOp.descripcion}</p>
                        <p className="mt-2 text-sm">
                            <strong>{aplicarOp.candidatas.length}</strong> exclusiva(s) usan esta ruta y todavía no han completado esta operación.
                        </p>
                        <div className="mt-5 grid grid-cols-2 gap-3">
                            <button onClick={() => setAplicarOp(null)} className="h-11 rounded-md bg-secondary font-semibold">No, gracias</button>
                            <button
                                onClick={() => setAplicarOp((m) => ({ ...m, fase: 'seleccionar' }))}
                                disabled={aplicarOp.candidatas.length === 0}
                                className="h-11 rounded-md bg-primary text-primary-foreground font-semibold disabled:opacity-50">
                                Sí, ver exclusivas
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Paso 2: seleccionar y actualizar */}
            <ActualizarExclusivasModal
                open={aplicarOp?.fase === 'seleccionar'}
                onClose={() => setAplicarOp(null)}
                titulo="Actualizar exclusivas"
                descripcion={aplicarOp?.descripcion || ''}
                tipoCambio={aplicarOp?.tipoCambio || 'operacion_modificada'}
                rutaId={rutaId}
                rutaNombre={ruta?.nom || rutaNom}
                operacionId={aplicarOp?.op?.id}
                operacionNombre={aplicarOp?.op ? `${aplicarOp.op.codi} · ${aplicarOp.op.nom}` : ''}
                exclusivas={aplicarOp?.candidatas || []}
            />
            {editQc && (
                <EditQcModal qc={editQc} onClose={() => setEditQc(null)} onSave={() => { setEditQc(null); carrega(); }} />
            )}
        </div>
    );
}

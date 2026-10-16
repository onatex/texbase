import React, { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, LogOut, RefreshCcw } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import useProduccio from '@/hooks/useProduccio';
import Logo from '@/components/Logo';
import pb from '@/lib/pocketbaseClient';
import ChecklistQC from '@/components/qualitat/ChecklistQC';
import CalidadSimplificada from '@/components/qualitat/CalidadSimplificada';
import ControlCalidadUnidades from '@/components/qualitat/ControlCalidadUnidades';
import NoConformitatsPanel from '@/components/qualitat/NoConformitatsPanel';
import Recogida from '@/components/admin/Recogida';
import MetriquesQC from '@/components/admin/MetriquesQC';
import RetrabajosPanel from '@/components/qualitat/RetrabajosPanel';
import OperarisCalitatActius from '@/components/qualitat/OperarisCalitatActius';
import NotificationsBell from '@/components/common/NotificationsBell';
import ChatCalidad from '@/components/common/ChatCalidad';
import { useChatCalidadNoLlegits } from '@/hooks/useChatCalidad';

const TABS = [
    { id: 'checklist', label: 'Control de calidad' },
    { id: 'simplificado', label: 'Control simplificado' },
    { id: 'unidades', label: 'Control por unidad' },
    { id: 'entregas', label: 'Entregas' },
    { id: 'metriques', label: 'Métricas QC' },
    { id: 'nc', label: 'No Conformidades' },
    { id: 'controls', label: 'Controles QC' },
    { id: 'incidencies', label: 'Incidencias' },
    { id: 'retreball', label: 'Retrabajo' },
    { id: 'retrabajos', label: 'Gestión retrabajos' },
    { id: 'chat', label: 'Chat Super Admin' },
];

const badge = {
    aprovat: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]',
    aprovat_obs: 'bg-[hsl(var(--warn))]/20 text-[hsl(var(--warn))]',
    retreball: 'bg-[hsl(var(--warn))]/20 text-[hsl(var(--warn))]',
    rebutjat: 'bg-destructive/10 text-destructive',
    bloquejat: 'bg-destructive/15 text-destructive',
    pendent: 'bg-secondary text-secondary-foreground',
    ok: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]',
    ko: 'bg-destructive/10 text-destructive',
};

const Estat = ({ v }) => (
    <span className={`rounded px-2 py-1 text-xs font-semibold uppercase ${badge[v] || 'bg-secondary'}`}>{v || '—'}</span>
);

export default function QualitatPage({ hideUnidadesTab = false }) {
    const { user, logout, rol } = useAuth();
    const navigate = useNavigate();
    const [tab, setTab] = useState('checklist');
    const { noLlegits: chatNoLlegits } = useChatCalidadNoLlegits();
    const esQualitat = rol === 'qualitat';
    const { exclusives, monos, registres, controls, carregant, error, recarrega } = useProduccio();

    const tabs = useMemo(() => TABS.filter(t =>
        !(hideUnidadesTab && t.id === 'unidades') &&
        (t.id !== 'chat' || esQualitat)
    ), [hideUnidadesTab, esQualitat]);

    const [nouControl, setNouControl] = useState(null);
    const [desant, setDesant] = useState(false);
    const [q, setQ] = useState('');
    const [exSelUnidades, setExSelUnidades] = useState(null);

    const incidencies = useMemo(() =>
        registres.flatMap((r) =>
            (Array.isArray(r.incidencies) ? r.incidencies : []).map((i) => ({
                ...i,
                operacio: r.operacio,
                operari: r.expand?.operari?.name || r.expand?.operari?.codi,
                mono: r.expand?.mono?.codi,
                exclusiva: r.expand?.exclusiva?.exclusiva,
                registre_id: r.id,
                hora_str: i.hora ? new Date(i.hora).toLocaleString('es-ES') : '—',
            })),
        ).filter((i) => {
            const text = q.trim().toLowerCase();
            return !text || `${i.mono} ${i.exclusiva} ${i.operari} ${i.descripcio}`.toLowerCase().includes(text);
        }),
        [registres, q],
    );

    const retreballos = useMemo(() => monos.filter((m) => m.estat === 'retreball'), [monos]);

    const controlsFiltrats = useMemo(() => {
        const text = q.trim().toLowerCase();
        return controls.filter((c) =>
            !text || `${c.expand?.mono?.codi} ${c.expand?.exclusiva?.exclusiva} ${c.operacio} ${c.expand?.operari?.name}`.toLowerCase().includes(text),
        );
    }, [controls, q]);

    const desarControl = async () => {
        if (!nouControl) return;
        setDesant(true);
        try {
            await pb.collection('controles_qualitat').create({
                mono: nouControl.mono,
                exclusiva: nouControl.exclusiva,
                operari: user.id,
                operacio: nouControl.operacio,
                resultat: nouControl.resultat,
                observacions: nouControl.observacions,
            });
            setNouControl(null);
            recarrega();
        } finally {
            setDesant(false);
        }
    };

    return (
        <div className="min-h-[100dvh]">
            <Helmet>
                <title>Calidad | Control de monos</title>
                <meta name="description" content="Panel de calidad: checklist QC, no conformidades, controles, incidencias y retrabajo de monos de competición." />
            </Helmet>

            <header className="bg-primary text-primary-foreground">
                <div className="stripe-top h-1.5" />
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                    <div className="flex items-center gap-4">
                        <Logo size="sm" />
                        <div>
                            <p className="font-display text-2xl sm:text-3xl uppercase leading-none">Panel de calidad</p>
                            <p className="text-xs text-white/70">Calidad · {user?.name || user?.email}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <NotificationsBell />
                        <button onClick={recarrega} className="rounded-md bg-white/15 p-2 active:scale-95" aria-label="Actualizar">
                            <RefreshCcw className="h-5 w-5" />
                        </button>
                        <button onClick={() => { logout(); navigate('/'); }} className="rounded-md bg-white/15 p-2 active:scale-95" aria-label="Salir">
                            <LogOut className="h-5 w-5" />
                        </button>
                    </div>
                </div>
                <nav className="flex gap-1 overflow-x-auto px-5">
                    {tabs.map((t) => (
                        <button key={t.id} onClick={() => setTab(t.id)}
                            className={`relative whitespace-nowrap rounded-t-md px-4 py-3 font-display text-lg uppercase transition ${tab === t.id ? 'bg-background text-foreground' : 'text-white/70 hover:text-white'}`}>
                            {t.label}
                            {t.id === 'chat' && chatNoLlegits > 0 && (
                                <span className="absolute right-1 top-2 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[hsl(var(--accent))] px-1 text-[10px] font-bold text-white">{chatNoLlegits}</span>
                            )}
                        </button>
                    ))}
                </nav>
            </header>

            <main className="p-5">
                {error && <p className="mb-4 rounded-md bg-destructive/10 px-4 py-3 text-destructive">{error}</p>}

                {/* ── Operarios de Calidad activos (visible en todas las pestañas) ── */}
                <div className="mb-6">
                    <OperarisCalitatActius />
                </div>

                {/* KPI band — only on non-checklist/nc tabs */}
                {(tab === 'controls' || tab === 'incidencies' || tab === 'retreball') && (
                    <div className="mb-6 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-lg border border-border bg-card p-4">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Controles registrados</p>
                            <p className="font-display text-4xl mt-2">{controls.length}</p>
                        </div>
                        <div className="rounded-lg border border-border bg-card p-4">
                            <p className="text-xs uppercase tracking-wide text-[hsl(var(--ok))]">Aprobados</p>
                            <p className="font-display text-4xl mt-2">{controls.filter((c) => c.resultat === 'aprovat').length}</p>
                        </div>
                        <div className="rounded-lg border border-border bg-card p-4">
                            <p className="text-xs uppercase tracking-wide text-destructive">Retrabajo activo</p>
                            <p className="font-display text-4xl mt-2">{retreballos.length}</p>
                        </div>
                    </div>
                )}

                {/* Search bar for legacy tabs */}
                {(tab === 'controls' || tab === 'incidencies') && (
                    <div className="mb-4 flex gap-3">
                        <input value={q} onChange={(e) => setQ(e.target.value)}
                            placeholder="Buscar mono, exclusiva, operario..."
                            className="h-10 w-72 rounded-md border border-input bg-card px-3 text-sm" />
                        {tab === 'controls' && (
                            <button onClick={() => setNouControl({ mono: '', exclusiva: '', operacio: '', resultat: 'pendent', observacions: '' })}
                                className="h-10 rounded-md bg-[hsl(var(--accent))] px-4 text-sm font-semibold text-[hsl(var(--accent-foreground))]">
                                + Nuevo control
                            </button>
                        )}
                    </div>
                )}

                {carregant && (tab === 'controls' || tab === 'incidencies' || tab === 'retreball') ? (
                    <div className="h-40 animate-pulse rounded-lg bg-secondary" />
                ) : (
                    <>
                        {/* ── CONTROL DE CALIDAD (interfaz completa) ── */}
                        {tab === 'checklist' && (
                            <ChecklistQC exclusives={exclusives} monos={monos} />
                        )}

                        {/* ── CONTROL SIMPLIFICADO POR UNIDAD (alternativa) ── */}
                        {tab === 'simplificado' && (
                            <CalidadSimplificada exclusives={exclusives} monos={monos} recarrega={recarrega} />
                        )}

                        {/* ── CONTROL POR UNIDAD ── */}
                        {tab === 'unidades' && (
                            exSelUnidades ? (
                                <div>
                                    <div className="mb-4 flex items-center gap-3">
                                        <button onClick={() => setExSelUnidades(null)} className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-secondary active:scale-95">
                                            ← Cambiar exclusiva
                                        </button>
                                        <div>
                                            <p className="font-display text-2xl uppercase leading-none">{exSelUnidades.exclusiva}</p>
                                            {exSelUnidades.article && <p className="text-xs text-muted-foreground">{exSelUnidades.article} · {exSelUnidades.unitats || 0} unidades</p>}
                                        </div>
                                    </div>
                                    <ControlCalidadUnidades exclusiva={exSelUnidades} onStatusChange={() => recarrega()} />
                                </div>
                            ) : (
                                <div>
                                    <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Seleccionar exclusiva para control por unidad — ordenadas por fecha (Express primero dentro de cada día)</p>
                                    {(() => {
                                        const today = new Date(); today.setHours(0, 0, 0, 0);
                                        const isExpress = (ex) => ex?.express === true || ex?.prioritat === 'express';
                                        const withMeta = exclusives
                                            .filter(e => (Number(e.unitats) || 0) > 0)
                                            .map(e => {
                                                const dies = e.data_entrega ? Math.ceil((new Date(e.data_entrega + 'T00:00:00') - today) / 86400000) : null;
                                                return { ...e, _diesEntrega: dies, _retrasat: dies !== null && dies < 0 };
                                            })
                                            .sort((a, b) => {
                                                if (a._retrasat && !b._retrasat) return -1;
                                                if (!a._retrasat && b._retrasat) return 1;
                                                const aD = a._diesEntrega === null ? Infinity : a._diesEntrega;
                                                const bD = b._diesEntrega === null ? Infinity : b._diesEntrega;
                                                if (aD !== bD) return aD - bD;
                                                const aEx = isExpress(a), bEx = isExpress(b);
                                                if (aEx && !bEx) return -1;
                                                if (!aEx && bEx) return 1;
                                                return 0;
                                            });
                                        if (withMeta.length === 0) {
                                            return <p className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">No hay exclusivas con unidades.</p>;
                                        }
                                        const groups = new Map();
                                        withMeta.forEach(ex => {
                                            const key = ex.data_entrega || '__sense_data__';
                                            if (!groups.has(key)) groups.set(key, { key, items: [] });
                                            groups.get(key).items.push(ex);
                                        });
                                        const labelFor = (g) => {
                                            if (g.key === '__sense_data__') return 'Sin fecha de entrega';
                                            const dies = g.items[0]?._diesEntrega;
                                            const retrasat = g.items[0]?._retrasat;
                                            let s = g.key;
                                            try {
                                                const d = new Date(g.key + 'T00:00:00');
                                                if (!isNaN(d.getTime())) {
                                                    s = d.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
                                                    s = s.charAt(0).toUpperCase() + s.slice(1);
                                                }
                                            } catch { /* raw */ }
                                            if (retrasat) return `Retrasadas · ${s}`;
                                            if (dies === 0) return `Hoy · ${s}`;
                                            if (dies === 1) return `Mañana · ${s}`;
                                            return s;
                                        };
                                        return (
                                            <div className="space-y-6">
                                                {Array.from(groups.values()).map(g => {
                                                    const retrasat = g.items[0]?._retrasat;
                                                    const expressCount = g.items.filter(isExpress).length;
                                                    return (
                                                        <section key={g.key}>
                                                            <div className={`mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-2.5 ${retrasat ? 'bg-destructive/10 border border-destructive/30' : 'bg-secondary/70 border border-border'}`}>
                                                                <p className={`font-display text-xl uppercase tracking-wide ${retrasat ? 'text-destructive' : 'text-foreground'}`}>{labelFor(g)}</p>
                                                                <div className="flex items-center gap-2 text-xs font-semibold">
                                                                    <span className="rounded-md bg-background/80 px-2 py-1 text-muted-foreground">{g.items.length} exclusiva{g.items.length !== 1 ? 's' : ''}</span>
                                                                    {expressCount > 0 && <span className="rounded-md bg-[hsl(var(--accent))]/15 px-2 py-1 text-[hsl(var(--accent))]">{expressCount} Express</span>}
                                                                </div>
                                                            </div>
                                                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                                                {g.items.map(ex => {
                                                                    const express = isExpress(ex);
                                                                    return (
                                                                        <button key={ex.id} onClick={() => setExSelUnidades(ex)}
                                                                            className={`relative overflow-hidden rounded-xl border-2 bg-card p-4 text-left hover:border-primary/50 active:scale-[0.98] transition ${ex._retrasat ? 'border-destructive/60 bg-destructive/5' : express ? 'border-[hsl(var(--accent))]/60' : 'border-border'}`}>
                                                                            {express && <div className="stripe-top absolute inset-x-0 top-0 h-1.5" />}
                                                                            <div className="flex items-start justify-between gap-2">
                                                                                <p className="font-display text-2xl uppercase leading-none">{ex.exclusiva}</p>
                                                                                {express && <span className="rounded-md bg-[hsl(var(--accent))] px-2 py-1 text-xs font-bold text-white">EXPRESS</span>}
                                                                            </div>
                                                                            {ex.article && <p className="mt-1 text-sm font-semibold">{ex.article}</p>}
                                                                            <div className="mt-2 flex items-center gap-2">
                                                                                <span className="rounded bg-secondary px-2 py-0.5 text-xs font-semibold">{ex.unitats} unidades</span>
                                                                                <Estat v={ex.estat} />
                                                                            </div>
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </section>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })()}
                                </div>
                            )
                        )}

                        {/* ── ENTREGAS ── */}
                        {tab === 'entregas' && <Recogida />}

                        {/* ── MÉTRICAS QC ── */}
                        {tab === 'metriques' && <MetriquesQC />}

                        {/* ── GESTIÓN DE RETRABAJOS ── */}
                        {tab === 'retrabajos' && <RetrabajosPanel />}

                        {/* ── CHAT SUPER ADMIN (solo Calidad) ── */}
                        {tab === 'chat' && esQualitat && <ChatCalidad />}

                        {/* ── NO CONFORMIDADES ── */}
                        {tab === 'nc' && (
                            <NoConformitatsPanel />
                        )}

                        {/* ── CONTROLES QC ── */}
                        {tab === 'controls' && (
                            <section className="rounded-lg border border-border bg-card">
                                <div className="overflow-auto">
                                    <table className="w-full min-w-[800px] text-sm">
                                        <thead className="bg-secondary text-left text-xs uppercase">
                                            <tr>
                                                {['Fecha', 'Mono', 'Exclusiva', 'Operación', 'Inspector', 'Resultado', 'Observaciones'].map((h) => (
                                                    <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {controlsFiltrats.length === 0 ? (
                                                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Sin controles registrados.</td></tr>
                                            ) : controlsFiltrats.map((c) => (
                                                <tr key={c.id}>
                                                    <td className="px-3 py-2">{new Date(c.created).toLocaleDateString('es-ES')}</td>
                                                    <td className="px-3 py-2 font-semibold">{c.expand?.mono?.codi || '—'}</td>
                                                    <td className="px-3 py-2">{c.expand?.exclusiva?.exclusiva || '—'}</td>
                                                    <td className="px-3 py-2">{c.operacio || '—'}</td>
                                                    <td className="px-3 py-2">{c.expand?.operari?.name || '—'}</td>
                                                    <td className="px-3 py-2"><Estat v={c.resultat} /></td>
                                                    <td className="px-3 py-2 max-w-xs truncate">{c.observacions || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        )}

                        {/* ── INCIDENCIAS ── */}
                        {tab === 'incidencies' && (
                            <section className="rounded-lg border border-border bg-card">
                                <div className="overflow-auto">
                                    <table className="w-full min-w-[700px] text-sm">
                                        <thead className="bg-secondary text-left text-xs uppercase">
                                            <tr>
                                                {['Fecha/Hora', 'Mono', 'Exclusiva', 'Operario', 'Operación', 'Descripción'].map((h) => (
                                                    <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {incidencies.length === 0 ? (
                                                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Sin incidencias registradas.</td></tr>
                                            ) : incidencies.map((i, idx) => (
                                                <tr key={idx}>
                                                    <td className="px-3 py-2 whitespace-nowrap">{i.hora_str}</td>
                                                    <td className="px-3 py-2 font-semibold">{i.mono || '—'}</td>
                                                    <td className="px-3 py-2">{i.exclusiva || '—'}</td>
                                                    <td className="px-3 py-2">{i.operari || '—'}</td>
                                                    <td className="px-3 py-2">{i.operacio || '—'}</td>
                                                    <td className="px-3 py-2 max-w-xs">{i.descripcio}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        )}

                        {/* ── RETRABAJO ── */}
                        {tab === 'retreball' && (
                            <section className="rounded-lg border border-border bg-card">
                                <div className="p-4 border-b border-border">
                                    <h3 className="font-display text-2xl uppercase">Monos en retrabajo</h3>
                                </div>
                                {retreballos.length === 0 ? (
                                    <p className="p-6 text-sm text-muted-foreground">Ningún mono en retrabajo actualmente.</p>
                                ) : (
                                    <div className="overflow-auto">
                                        <table className="w-full min-w-[600px] text-sm">
                                            <thead className="bg-secondary text-left text-xs uppercase">
                                                <tr>
                                                    {['Mono', 'Exclusiva', 'Artículo', 'Operación', 'OK confección'].map((h) => (
                                                        <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border">
                                                {retreballos.map((m) => {
                                                    const ultReg = registres.find((r) => r.mono === m.id);
                                                    return (
                                                        <tr key={m.id}>
                                                            <td className="px-3 py-2 font-semibold">{m.codi}</td>
                                                            <td className="px-3 py-2">{m.expand?.exclusiva?.exclusiva || '—'}</td>
                                                            <td className="px-3 py-2">{m.expand?.exclusiva?.article || '—'}</td>
                                                            <td className="px-3 py-2">{m.operacio_actual || '—'}</td>
                                                            <td className="px-3 py-2">
                                                                <span className="text-xs text-muted-foreground" title="OK confección de fase, no OK de Calidad">
                                                                    {ultReg?.control_qualitat === 'ok' ? 'OK confección' : ultReg?.control_qualitat === 'ko' ? 'No OK conf.' : '—'}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </section>
                        )}
                    </>
                )}
            </main>

            {/* New control dialog */}
            {nouControl !== null && (
                <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4">
                    <div className="w-full max-w-md rounded-lg bg-card p-6">
                        <h3 className="font-display text-2xl uppercase">Nuevo control de calidad</h3>
                        <div className="mt-4 grid gap-3">
                            <div>
                                <label className="text-sm font-semibold">Mono</label>
                                <select value={nouControl.mono} onChange={(e) => {
                                    const m = monos.find((mo) => mo.id === e.target.value);
                                    setNouControl({ ...nouControl, mono: e.target.value, exclusiva: m?.exclusiva || '' });
                                }} className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
                                    <option value="">Seleccionar mono...</option>
                                    {monos.filter((m) => m.estat !== 'finalitzat').map((m) => (
                                        <option key={m.id} value={m.id}>{m.codi}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-sm font-semibold">Operación</label>
                                <input value={nouControl.operacio} onChange={(e) => setNouControl({ ...nouControl, operacio: e.target.value })}
                                    placeholder="Nombre de la operación" className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm" />
                            </div>
                            <div>
                                <label className="text-sm font-semibold">Resultado</label>
                                <select value={nouControl.resultat} onChange={(e) => setNouControl({ ...nouControl, resultat: e.target.value })}
                                    className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
                                    <option value="pendent">Pendiente</option>
                                    <option value="aprovat">Aprobado</option>
                                    <option value="aprovat_obs">Aprobado con observación</option>
                                    <option value="retreball">Requiere retrabajo</option>
                                    <option value="rebutjat">Rechazado</option>
                                    <option value="bloquejat">Bloqueado</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-sm font-semibold">Observaciones</label>
                                <textarea value={nouControl.observacions} onChange={(e) => setNouControl({ ...nouControl, observacions: e.target.value })}
                                    rows={3} className="mt-1 w-full rounded-md border border-input bg-background p-3 text-sm" />
                            </div>
                        </div>
                        <div className="mt-4 flex gap-3">
                            <button onClick={desarControl} disabled={desant || !nouControl.mono}
                                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground font-semibold disabled:opacity-60">
                                <CheckCircle2 className="h-4 w-4" /> Guardar
                            </button>
                            <button onClick={() => setNouControl(null)} className="h-12 rounded-md bg-secondary px-4 font-semibold">
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

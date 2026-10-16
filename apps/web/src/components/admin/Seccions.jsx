import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, ChevronRight, Download, Edit2, Eye, ExternalLink, FileDown, Package, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/lib/auth';
import { descarregaCSV, formatSegons } from '@/lib/csv';
import RutaDetall from './RutaDetall';
import ActualizarExclusivasModal from './ActualizarExclusivasModal';
import { DetallExclusiva, DetallMono } from './ExclusivaDetall';
import {
    resolveRutaExclusiva,
    tempsInvertitExclusiva,
    operarisActiusExclusiva,
    parseDataExclusiva,
    minutsPrevistosExclusiva,
} from '@/lib/operacionsUtils';

const badge = {
    pendent: 'bg-secondary text-secondary-foreground',
    en_curs: 'bg-[hsl(var(--warn))]/20 text-[hsl(var(--warn))]',
    finalitzada: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]',
    finalitzat: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]',
    bloquejada: 'bg-destructive/10 text-destructive',
    retreball: 'bg-destructive/10 text-destructive',
    viable: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]',
    en_risc: 'bg-[hsl(var(--warn))]/20 text-[hsl(var(--warn))]',
    no_viable: 'bg-destructive/10 text-destructive',
    lista_recollida: 'bg-[hsl(var(--ok))]/20 text-[hsl(var(--ok))] font-bold',
    entregada: 'bg-primary/10 text-primary',
    retrasada: 'bg-destructive/15 text-destructive',
};

const Estat = ({ v }) => (
    <span className={`rounded px-2 py-1 text-xs font-semibold uppercase ${badge[v] || 'bg-secondary'}`}>{v || '—'}</span>
);

/* ─── Exclusiva side panel (wraps DetallExclusiva) ──────────────────────── */
function ExclusivaPanel({ exclusiva, onClose, onRecarrega, soloLectura = false }) {
    const [selectedMono, setSelectedMono] = useState(null);
    return (
        <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/50" onClick={onClose}>
            <div className="relative flex h-full w-full max-w-4xl flex-col overflow-y-auto bg-background shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-background px-5 py-3">
                    <div className="flex items-center gap-3">
                        {selectedMono && (
                            <button onClick={() => setSelectedMono(null)} className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm font-semibold hover:bg-secondary">
                                <ArrowLeft className="h-4 w-4" /> Volver
                            </button>
                        )}
                        <p className="font-display text-xl sm:text-2xl uppercase truncate">
                            {selectedMono ? selectedMono.codi : exclusiva.exclusiva}
                        </p>
                        {!selectedMono && (
                            <a
                                href={`/exclusiva/${exclusiva.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3 h-8 text-xs font-semibold hover:bg-secondary"
                            >
                                <ExternalLink className="h-3.5 w-3.5" /> Abrir en nueva pestaña
                            </a>
                        )}
                    </div>
                    <button onClick={onClose} className="rounded-md p-2 hover:bg-secondary"><X className="h-5 w-5" /></button>
                </div>
                <div className="p-5 overflow-y-auto">
                    {selectedMono ? (
                        <DetallMono mono={selectedMono} exclusiva={exclusiva} onBack={() => setSelectedMono(null)} />
                    ) : (
                        <DetallExclusiva exclusiva={exclusiva} onBack={onClose} onSelectMono={setSelectedMono} soloLectura={soloLectura} />
                    )}
                </div>
            </div>
        </div>
    );
}

/* ─── Old ExclusivaModalDetall (kept for reference, now replaced) ────────── */
function ExclusivaModalDetall({ exclusiva, onClose, onRecarrega }) {
    const [monos, setMonos] = useState([]);
    const [registres, setRegistres] = useState([]);
    const [carregant, setCarregant] = useState(true);
    const [editData, setEditData] = useState({ data_entrega: exclusiva.data_entrega || '', observacions: exclusiva.observacions || '' });
    const [saving, setSaving] = useState(false);
    const [savedMsg, setSavedMsg] = useState(false);
    const [monoDetall, setMonoDetall] = useState(null);

    const carrega = useCallback(async () => {
        setCarregant(true);
        try {
            const [ms, rs] = await Promise.all([
                pb.collection('monos').getFullList({ filter: `exclusiva = "${exclusiva.id}"`, sort: 'numero', requestKey: 'mod-monos' }),
                pb.collection('registres').getFullList({ filter: `exclusiva = "${exclusiva.id}"`, sort: '-created', expand: 'operari,mono', requestKey: 'mod-regs' }),
            ]);
            setMonos(ms);
            setRegistres(rs);
        } finally { setCarregant(false); }
    }, [exclusiva.id]);

    useEffect(() => { carrega(); }, [carrega]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await pb.collection('exclusives').update(exclusiva.id, { data_entrega: editData.data_entrega, observacions: editData.observacions });
            setSavedMsg(true);
            onRecarrega && onRecarrega();
            setTimeout(() => setSavedMsg(false), 3000);
        } finally { setSaving(false); }
    };

    const monosAmbInfo = useMemo(() => monos.map(m => {
        const mRegs = registres.filter(r => r.mono === m.id);
        const incidencies = mRegs.reduce((a, r) => a + (r.incidencies?.length || 0), 0);
        const retreball = mRegs.filter(r => r.retreball).length;
        return { ...m, incidencies, retreball };
    }), [monos, registres]);

    if (monoDetall) {
        const mRegs = registres.filter(r => r.mono === monoDetall.id);
        return (
            <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/50">
                <div className="relative flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-background shadow-2xl">
                    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-background px-5 py-4">
                        <div className="flex items-center gap-3">
                            <button onClick={() => setMonoDetall(null)} className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold hover:bg-secondary active:scale-95">
                                <ArrowLeft className="h-4 w-4" /> Volver
                            </button>
                            <p className="font-display text-2xl uppercase">{monoDetall.codi}</p>
                        </div>
                        <button onClick={onClose} className="rounded-lg p-2 hover:bg-secondary"><X className="h-5 w-5" /></button>
                    </div>
                    <div className="p-5">
                        <div className="grid grid-cols-2 gap-3 text-sm mb-5">
                            {[['Talla', monoDetall.talla || '—'], ['Estado', monoDetall.estat || '—'], ['Op. actual', monoDetall.operacio_actual || '—'], ['Registros', mRegs.length]].map(([k,v]) => (
                                <div key={k} className="rounded-lg bg-secondary/60 px-3 py-2">
                                    <p className="text-xs text-muted-foreground mb-0.5">{k}</p>
                                    <p className="font-semibold">{String(v)}</p>
                                </div>
                            ))}
                        </div>
                        <h4 className="font-display text-xl uppercase mb-3">Historial de operaciones</h4>
                        {mRegs.length === 0 ? <p className="text-sm text-muted-foreground">Sin operaciones registradas.</p> : (
                            <div className="overflow-auto rounded-lg border border-border">
                                <table className="w-full min-w-[600px] text-xs">
                                    <thead className="bg-secondary text-left uppercase">
                                        <tr>{['Operación','Operario','Inicio','Tiempo real','Estado'].map(h=><th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {mRegs.map(r => (
                                            <tr key={r.id}>
                                                <td className="px-3 py-2">{r.operacio}</td>
                                                <td className="px-3 py-2">{r.expand?.operari?.name || '—'}</td>
                                                <td className="px-3 py-2">{r.inici ? new Date(r.inici).toLocaleString('es-ES') : '—'}</td>
                                                <td className="px-3 py-2 tabular-nums">{r.temps_real_seg ? `${Math.round(r.temps_real_seg/60)} min` : '—'}</td>
                                                <td className="px-3 py-2"><Estat v={r.estat} /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/50">
            <div className="relative flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-background shadow-2xl">
                <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-background px-5 py-4">
                    <p className="font-display text-3xl uppercase leading-none">{exclusiva.exclusiva}</p>
                    <button onClick={onClose} className="rounded-lg p-2 hover:bg-secondary active:scale-95"><X className="h-5 w-5" /></button>
                </div>
                <div className="p-5 flex flex-col gap-5">
                    {/* Info grid */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        {[['Artículo', exclusiva.article || '—'], ['Marca', exclusiva.marca || '—'],
                          ['Unidades', exclusiva.unitats || '—'], ['Referencia', exclusiva.referencia || '—'],
                          ['Estado', exclusiva.estat || '—'], ['Prioridad', exclusiva.prioritat || 'normal'],
                          ['Express', exclusiva.express ? 'Sí' : 'No'], ['Min. previstos', exclusiva.minuts_previstos ? `${exclusiva.minuts_previstos} min` : '—'],
                          ['F. recepción', exclusiva.data_real_recepcio || exclusiva.data_prevista_recepcio || '—'],
                          ['Riesgo', exclusiva.risc || '—'],
                        ].map(([k,v]) => (
                            <div key={k} className="rounded-lg bg-secondary/60 px-3 py-2">
                                <p className="text-xs text-muted-foreground mb-0.5">{k}</p>
                                <p className="font-semibold truncate">{v}</p>
                            </div>
                        ))}
                    </div>
                    {/* Editable fields */}
                    <div className="rounded-xl border border-border bg-card p-4">
                        <h4 className="font-semibold mb-3 text-sm uppercase tracking-wide">Editar datos</h4>
                        <div className="grid gap-3">
                            <div>
                                <label className="text-xs font-semibold text-muted-foreground uppercase">Fecha de entrega</label>
                                <input type="text" value={editData.data_entrega} onChange={e => setEditData(d => ({ ...d, data_entrega: e.target.value }))}
                                    placeholder="DD/MM/YYYY" className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-muted-foreground uppercase">Observaciones</label>
                                <textarea value={editData.observacions} onChange={e => setEditData(d => ({ ...d, observacions: e.target.value }))}
                                    rows={3} className="mt-1 w-full rounded-lg border border-input bg-background p-3 text-sm resize-none" />
                            </div>
                            <div className="flex items-center gap-3">
                                <button onClick={handleSave} disabled={saving}
                                    className="flex items-center gap-2 h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60 active:scale-95">
                                    <Save className="h-4 w-4" /> Guardar cambios
                                </button>
                                {savedMsg && <span className="text-sm text-[hsl(var(--ok))] font-semibold">Guardado correctamente</span>}
                            </div>
                        </div>
                    </div>
                    {/* Mono list */}
                    <div className="rounded-xl border border-border bg-card">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                            <h4 className="font-display text-xl uppercase">Monos ({monos.length})</h4>
                        </div>
                        {carregant ? <div className="h-20 animate-pulse m-4 rounded-lg bg-secondary" /> : (
                            <div className="overflow-auto">
                                <table className="w-full min-w-[500px] text-sm">
                                    <thead className="bg-secondary text-left text-xs uppercase">
                                        <tr>{['Nº','Código','Talla','Estado','Op. actual','Incid.','Retrab.',''].map(h=><th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {monosAmbInfo.length === 0 ? (
                                            <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Sin monos generados.</td></tr>
                                        ) : monosAmbInfo.map(m => (
                                            <tr key={m.id} className="hover:bg-secondary/20">
                                                <td className="px-3 py-2 tabular-nums font-semibold">{m.numero}</td>
                                                <td className="px-3 py-2 font-mono text-xs">{m.codi}</td>
                                                <td className="px-3 py-2">{m.talla || '—'}</td>
                                                <td className="px-3 py-2"><Estat v={m.estat} /></td>
                                                <td className="px-3 py-2 text-xs text-muted-foreground max-w-[120px] truncate">{m.operacio_actual || '—'}</td>
                                                <td className="px-3 py-2">{m.incidencies > 0 ? <span className="text-destructive font-semibold">{m.incidencies}</span> : 0}</td>
                                                <td className="px-3 py-2">{m.retreball > 0 ? <span className="text-[hsl(var(--warn))] font-semibold">{m.retreball}</span> : 0}</td>
                                                <td className="px-3 py-2">
                                                    <button onClick={() => setMonoDetall(m)} className="flex items-center gap-1 rounded border border-primary/50 text-primary px-2 h-7 text-xs font-semibold hover:bg-primary/10 active:scale-95">
                                                        Detalle <ChevronRight className="h-3 w-3" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------- Exclusives
export const Exclusives = ({ exclusives, monos, registres, rutes, recarrega, articles = [], opsDef = [], operaris = [] }) => {
    const [filtre, setFiltre] = useState('');
    const [filtreEstat, setFiltreEstat] = useState('');
    const [filtreClient, setFiltreClient] = useState('');
    const [filtreArticle, setFiltreArticle] = useState('');
    const [filtreDes, setFiltreDes] = useState('');
    const [filtreFinsa, setFiltreFinsa] = useState('');
    const [detallEx, setDetallEx] = useState(null);
    const [detallSoloLectura, setDetallSoloLectura] = useState(false);
    const [fasesExtMap, setFasesExtMap] = useState({});
    const [reprocesoIds, setReprocesoIds] = useState(new Set()); // exclusivas con incidencia o retrabajo
    const [vista, setVista] = useState('activas'); // 'activas' | 'entregadas'

    useEffect(() => {
        pb.collection('fases_externalizadas_exclusiva')
            .getFullList({ filter: 'externalizada = true', requestKey: 'excl-list-fext' })
            .then((rows) => {
                const map = {};
                rows.forEach((r) => {
                    const key = r.exclusiva_id;
                    map[key] = (map[key] || 0) + 1;
                });
                setFasesExtMap(map);
            })
            .catch(() => {});
    }, [exclusives]);

    // Marcador de reproceso: exclusivas que han tenido alguna incidencia
    // (no_conformitats) o retrabajo. Se usa para mostrar un icono de aviso
    // en el listado. No inventa datos: se basa en los registros existentes.
    // Se combinan dos fuentes para mayor robustez:
    //   1) retrabajos + no_conformitats (fuente principal)
    //   2) registres ya cargados con retreball=true o incidencies (fuente
    //      complementaria, garantiza el icono aunque la petición anterior falle)
    useEffect(() => {
        // Fuente complementaria inmediata a partir de los registres en memoria
        const desdeRegistres = new Set();
        for (const r of registres) {
            if (!r.exclusiva) continue;
            if (r.retreball || (Array.isArray(r.incidencies) && r.incidencies.length > 0)) {
                desdeRegistres.add(r.exclusiva);
            }
        }
        setReprocesoIds((prev) => {
            const merged = new Set(prev);
            desdeRegistres.forEach((id) => merged.add(id));
            return merged;
        });

        Promise.all([
            pb.collection('retrabajos').getFullList({ fields: 'id,exclusiva', requestKey: 'excl-retr' }).catch(() => []),
            pb.collection('no_conformitats').getFullList({ fields: 'id,exclusiva', requestKey: 'excl-nc' }).catch(() => []),
        ]).then(([retrs, ncs]) => {
            const set = new Set();
            // Conservar lo detectado vía registres
            desdeRegistres.forEach((id) => set.add(id));
            retrs.forEach((r) => {
                const id = typeof r.exclusiva === 'string' ? r.exclusiva : (r.exclusiva && r.exclusiva.id);
                if (id) set.add(id);
            });
            ncs.forEach((n) => {
                const id = typeof n.exclusiva === 'string' ? n.exclusiva : (n.exclusiva && n.exclusiva.id);
                if (id) set.add(id);
            });
            setReprocesoIds(set);
        }).catch(() => {});
    }, [exclusives, recarrega, registres]);

    const clients = useMemo(() => [...new Set(exclusives.map(e => e.marca).filter(Boolean))].sort(), [exclusives]);
    const articlesUnics = useMemo(() => [...new Set(exclusives.map(e => e.article).filter(Boolean))].sort(), [exclusives]);

    // Mapa d'usuaris per resoldre el nom de l'operari actiu quan l'expand de
    // la relació operari falla (compte esborrat o identitat migrada), evitant
    // que es mostri com a 'Operario' genèric a la columna d'operari actiu.
    const usersById = useMemo(() => {
        const m = new Map();
        for (const u of operaris || []) { if (u.id) m.set(u.id, u); }
        return m;
    }, [operaris]);

    // Monos agrupados por exclusiva (mismo origen que Producción)
    const monosByEx = useMemo(() => {
        const map = new Map();
        for (const m of monos) {
            if (!map.has(m.exclusiva)) map.set(m.exclusiva, []);
            map.get(m.exclusiva).push(m);
        }
        return map;
    }, [monos]);

    const neteja = () => { setFiltre(''); setFiltreEstat(''); setFiltreClient(''); setFiltreArticle(''); setFiltreDes(''); setFiltreFinsa(''); };
    const tesFiltres = filtre || filtreEstat || filtreClient || filtreArticle || filtreDes || filtreFinsa;

    const files = useMemo(() => {
        const q = filtre.trim().toLowerCase();
        const avui = new Date(); avui.setHours(0, 0, 0, 0);
        return exclusives
            .filter((e) => {
                if (q && !`${e.exclusiva} ${e.article} ${e.marca} ${e.referencia || ''}`.toLowerCase().includes(q)) return false;
                if (filtreEstat && e.estat !== filtreEstat) return false;
                if (filtreClient && e.marca !== filtreClient) return false;
                if (filtreArticle && e.article !== filtreArticle) return false;
                if (filtreDes && e.data_entrega) {
                    const d = e.data_entrega.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1');
                    if (d < filtreDes) return false;
                }
                if (filtreFinsa && e.data_entrega) {
                    const d = e.data_entrega.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1');
                    if (d > filtreFinsa) return false;
                }
                return true;
            })
            .map((e) => {
                const seus = monosByEx.get(e.id) || [];
                const fets = seus.filter((m) => m.estat === 'finalitzat').length;
                // Misma resolución de ruta que Producción/Operarios
                const rutaRes = resolveRutaExclusiva(e, rutes, articles);
                const rutaNom = rutaRes.rutaNom || 'Sin ruta';
                const previstosMin = minutsPrevistosExclusiva(e, opsDef, rutaRes.rutaId);
                const carregaMin = previstosMin * (e.unitats || 0);
                // Tiempo invertido real (sin duplicar pausas/reanudaciones)
                const monoIds = seus.map((m) => m.id);
                const tempsInv = tempsInvertitExclusiva(e.id, registres, monoIds);
                // Operarios activos ahora mismo (en_curs / pausat)
                const actius = operarisActiusExclusiva(e.id, registres, monoIds, usersById);
                const ultim = registres.find((r) => r.exclusiva === e.id);
                const dataInfo = parseDataExclusiva(e.data_entrega || e.data_estimada);
                const entregada = e.estat === 'entregada' || e.estat === 'finalitzada';
                let diesRetras = null;
                let retrasada = false;
                if (dataInfo.date && !entregada) {
                    const diff = Math.round((dataInfo.date - avui) / 86400000);
                    diesRetras = diff;
                    retrasada = diff < 0;
                }
                return {
                    ...e,
                    progres: seus.length ? Math.round((fets / seus.length) * 100) : 0,
                    monos: seus.length,
                    rutaNom,
                    rutaId: rutaRes.rutaId,
                    carregaMin,
                    previstosMin,
                    tempsInv,
                    actius,
                    operariActual: ultim?.expand?.operari?.name || '—',
                    operacioActual: ultim?.operacio || '—',
                    _dataInfo: dataInfo,
                    _diesRetras: diesRetras,
                    _retrasada: retrasada,
                    _entregada: entregada,
                };
            })
            .sort((a, b) => {
                // Retrasadas primero, luego próximas a entregar, luego futuras, sin fecha al final
                const aRank = a._entregada ? 4 : a._retrasada ? 0 : a._dataInfo.date ? 1 : 3;
                const bRank = b._entregada ? 4 : b._retrasada ? 0 : b._dataInfo.date ? 1 : 3;
                if (aRank !== bRank) return aRank - bRank;
                if (a._retrasada && b._retrasada) return (a._diesRetras || 0) - (b._diesRetras || 0);
                if (a._dataInfo.date && b._dataInfo.date) return a._dataInfo.date - b._dataInfo.date;
                return 0;
            });
    }, [exclusives, monos, monosByEx, registres, rutes, articles, opsDef, filtre, filtreEstat, filtreClient, filtreArticle, filtreDes, filtreFinsa]);

    const activasFiles = useMemo(() => files.filter((f) => !f._entregada), [files]);
    const entregadesFiles = useMemo(() => files.filter((f) => f._entregada), [files]);

    // Agrupación por día de entrega (mismo parseo que Producción)
    const grupPerDia = useCallback((llista) => {
        const map = new Map();
        for (const f of llista) {
            const k = f._dataInfo.key;
            if (!map.has(k)) map.set(k, { key: k, label: f._dataInfo.label, date: f._dataInfo.date, items: [] });
            map.get(k).items.push(f);
        }
        return [...map.values()].sort((a, b) => {
            if (a.key === 'sin-fecha') return 1;
            if (b.key === 'sin-fecha') return -1;
            return a.date - b.date;
        });
    }, []);

    const activasPerDia = useMemo(() => grupPerDia(activasFiles), [activasFiles, grupPerDia]);
    const entregadesPerDia = useMemo(() => grupPerDia(entregadesFiles), [entregadesFiles, grupPerDia]);

    const exporta = () =>
        descarregaCSV('exclusivas.csv', files.map((f) => ({
            Exclusiva: f.exclusiva, Referencia: f.referencia || '', Articulo: f.article,
            Marca: f.marca, Unidades: f.unitats, Entrega: f.data_entrega,
            Estimada: f.data_estimada, Express: f.express ? 'Sí' : 'No',
            Estado: f.estat, Progreso: `${f.progres}%`, Ruta: f.rutaNom,
            'Carga (min)': f.carregaMin, 'Min previstos': f.minuts_previstos || f.previstosMin || '',
            'Tiempo invertido (seg)': f.tempsInv,
            'Operarios activos': f.actius.map((a) => a.nom).join(' | '),
            Riesgo: f.risc || '', Prioridad: f.prioritat || '', Operario: f.operariActual,
        })));

    const canviaRuta = async (id, rutaId) => {
        await pb.collection('exclusives').update(id, { ruta: rutaId });
        recarrega();
    };
    const canviaEstat = async (id, estat) => {
        await pb.collection('exclusives').update(id, { estat });
        recarrega();
    };

    const obrirDetall = (f, soloLectura = false) => {
        setDetallEx(f);
        setDetallSoloLectura(soloLectura);
    };

    // ── Badges de tiempo y operario activo (coherentes con Producción) ──
    const TempsBadge = ({ segons, previstosMin }) => {
        const min = Math.round((segons || 0) / 60);
        const pct = previstosMin > 0 ? Math.round((min / previstosMin) * 100) : null;
        return (
            <div className="flex flex-col leading-tight">
                <span className="tabular-nums font-semibold">{min > 0 ? `${min} min` : '—'}</span>
                {pct != null && (
                    <span className={`text-[10px] ${pct > 110 ? 'text-destructive' : pct > 90 ? 'text-[hsl(var(--warn))]' : 'text-muted-foreground'}`}>
                        {pct}% previst
                    </span>
                )}
            </div>
        );
    };

    const OperarisActiusBadge = ({ actius }) => {
        if (!actius || actius.length === 0) {
            return <span className="text-xs italic text-muted-foreground">Sin operario activo</span>;
        }
        const pausatsInactivitat = actius.filter((a) => a.estat === 'pausat' && a.causa);
        return (
            <div className="flex flex-col leading-tight">
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-[hsl(var(--ok))]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--ok))] animate-pulse" />
                    {actius.length} activo{actius.length === 1 ? '' : 's'}
                </span>
                <span className="text-[11px] text-muted-foreground truncate max-w-[160px]" title={actius.map((a) => a.nom).join(', ')}>
                    {actius.map((a) => a.nom).join(', ')}
                </span>
                {pausatsInactivitat.length > 0 && (
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[hsl(var(--warn))]" title={pausatsInactivitat.map((a) => `${a.nom}: ${a.causa}`).join(', ')}>
                        <AlertTriangle className="h-3 w-3" /> Pausado: {pausatsInactivitat.map((a) => a.causa).join(', ')}
                    </span>
                )}
            </div>
        );
    };

    const capcaleraActivas = ['Exclusiva', 'Ref.', 'Artículo', 'Marca', 'Uds', 'Entrega', 'Estado', 'Riesgo', 'Progreso', 'Ruta', 'Tiempo inv.', 'Operario activo', ''];
    const capcaleraEntregades = ['Exclusiva', 'Ref.', 'Artículo', 'Marca', 'Uds', 'Entrega', 'Estado', 'Progreso', 'Ruta', 'Tiempo inv.', 'Operario activo', 'Carga', ''];

    const renderGrup = (grup, columnes, entregada = false) => (
        <React.Fragment key={grup.key}>
            <tr className="bg-primary/10 border-y border-primary/20">
                <td colSpan={columnes.length} className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-base uppercase tracking-wide text-primary">
                            {grup.label}
                        </span>
                        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary tabular-nums">
                            {grup.items.length} exclusiva{grup.items.length === 1 ? '' : 's'}
                        </span>
                    </div>
                </td>
            </tr>
            {grup.items.map((f) => (
                <tr key={f.id} className={f._retrasada ? 'bg-destructive/5' : ''}>
                    <td className="px-3 py-2 font-semibold">
                        <div className="flex items-center gap-1.5">
                            {f.exclusiva}
                            {reprocesoIds.has(f.id) && (
                                <button type="button" title="Esta exclusiva ha pasado por algún reproceso (incidencia o retrabajo)" aria-label="Esta exclusiva ha pasado por algún reproceso (incidencia o retrabajo)" className="inline-flex items-center text-[hsl(var(--warn))] hover:scale-110 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--warn))] rounded">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                </button>
                            )}
                            {(fasesExtMap[f.id] || 0) > 0 && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-[hsl(var(--accent))]/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-[hsl(var(--accent))]" title={`${fasesExtMap[f.id]} fase(s) externalizada(s)`}>
                                    <ExternalLink className="h-3 w-3" /> {fasesExtMap[f.id]}
                                </span>
                            )}
                        </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{f.referencia || '—'}</td>
                    <td className="px-3 py-2">{f.article}</td>
                    <td className="px-3 py-2">{f.marca}</td>
                    <td className="px-3 py-2 tabular-nums">{f.unitats}</td>
                    <td className="px-3 py-2">
                        <span className={f._retrasada ? 'text-destructive font-semibold' : ''}>{f.data_entrega || f.data_estimada || '—'}</span>
                        {f._retrasada && <span className="ml-1 text-xs font-bold text-destructive">({Math.abs(f._diesRetras)}d retraso)</span>}
                        {f._diesRetras != null && !f._retrasada && f._diesRetras <= 3 && !f._entregada && <span className="ml-1 text-xs font-semibold text-[hsl(var(--warn))]">({f._diesRetras}d)</span>}
                    </td>
                    <td className="px-3 py-2">
                        {entregada ? (
                            <Estat v={f.estat} />
                        ) : (
                            <select value={f.estat || ''} onChange={(e) => canviaEstat(f.id, e.target.value)}
                                className="h-8 rounded border border-input bg-background px-2 text-xs">
                                {['pendent', 'en_curs', 'finalitzada', 'bloquejada', 'lista_recollida', 'entregada', 'retrasada'].map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        )}
                    </td>
                    {!entregada && <td className="px-3 py-2"><Estat v={f.risc} /></td>}
                    <td className="px-3 py-2 w-40">
                        <div className="h-2 w-full rounded bg-secondary">
                            <div className="h-2 rounded bg-[hsl(var(--accent))]" style={{ width: `${f.progres}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">{f.progres}% · {f.monos} monos</span>
                    </td>
                    <td className="px-3 py-2">
                        {entregada ? (
                            <span className="text-xs">{f.rutaNom}</span>
                        ) : (
                            <select value={f.ruta || ''} onChange={(e) => canviaRuta(f.id, e.target.value)}
                                className="h-9 rounded border border-input bg-background px-2 text-xs">
                                <option value="">Sin ruta</option>
                                {rutes.map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}
                            </select>
                        )}
                    </td>
                    <td className="px-3 py-2"><TempsBadge segons={f.tempsInv} previstosMin={f.previstosMin} /></td>
                    <td className="px-3 py-2"><OperarisActiusBadge actius={f.actius} /></td>
                    {entregada && (
                        <td className="px-3 py-2 tabular-nums text-muted-foreground text-xs">{Math.round(f.carregaMin / 60)} h</td>
                    )}
                    <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                            <button onClick={() => obrirDetall(f, entregada)} className="flex items-center gap-1 rounded border border-primary/50 text-primary px-2 h-8 text-xs font-semibold hover:bg-primary/10 active:scale-95 whitespace-nowrap">
                                <Eye className="h-3.5 w-3.5" /> Detalle
                            </button>
                            <a
                                href={`/exclusiva/${f.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 rounded border border-border bg-background px-2 h-8 text-xs font-semibold hover:bg-secondary active:scale-95 whitespace-nowrap"
                                title="Abrir en nueva pestaña"
                            >
                                <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                        </div>
                    </td>
                </tr>
            ))}
        </React.Fragment>
    );

    return (
    <>
        <section className="rounded-lg border border-border bg-card">
            <div className="border-b border-border p-4">
                <div className="flex flex-wrap items-center gap-3 justify-between mb-3">
                    <div className="flex items-center gap-3">
                        <h3 className="font-display text-2xl uppercase">Exclusivas</h3>
                        {/* Conmutador de listado */}
                        <div className="flex rounded-md border border-border overflow-hidden">
                            <button onClick={() => setVista('activas')}
                                className={`px-3 h-9 text-xs font-semibold transition ${vista === 'activas' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-secondary'}`}>
                                Activas ({activasFiles.length})
                            </button>
                            <button onClick={() => setVista('entregadas')}
                                className={`px-3 h-9 text-xs font-semibold transition ${vista === 'entregadas' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-secondary'}`}>
                                Entregadas ({entregadesFiles.length})
                            </button>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {tesFiltres && (
                            <button onClick={neteja} className="flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold hover:bg-secondary active:scale-95">
                                <X className="h-4 w-4" /> Limpiar filtros
                            </button>
                        )}
                        <button onClick={exporta} className="flex h-10 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground active:scale-95">
                            <Download className="h-4 w-4" /> Exportar
                        </button>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <input value={filtre} onChange={(e) => setFiltre(e.target.value)}
                        placeholder="Buscar exclusiva, referencia, cliente..."
                        className="h-9 w-56 rounded-md border border-input bg-background px-3 text-sm" />
                    <select value={filtreEstat} onChange={(e) => setFiltreEstat(e.target.value)}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                        <option value="">Todos los estados</option>
                        {[['pendent','Pendiente'],['en_curs','En producción'],['lista_recollida','Lista para recoger'],['entregada','Entregada'],['retrasada','Retrasada'],['finalitzada','Finalizada'],['bloquejada','Bloqueada']].map(([v,l]) => (
                            <option key={v} value={v}>{l}</option>
                        ))}
                    </select>
                    <select value={filtreClient} onChange={(e) => setFiltreClient(e.target.value)}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                        <option value="">Todos los clientes</option>
                        {clients.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select value={filtreArticle} onChange={(e) => setFiltreArticle(e.target.value)}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                        <option value="">Todos los artículos</option>
                        {articlesUnics.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                    <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">Entrega desde</span>
                        <input type="date" value={filtreDes} onChange={(e) => setFiltreDes(e.target.value)}
                            className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
                    </div>
                    <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">hasta</span>
                        <input type="date" value={filtreFinsa} onChange={(e) => setFiltreFinsa(e.target.value)}
                            className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
                    </div>
                </div>
            </div>

            {/* Listado de activas (no entregadas), agrupado por día */}
            {vista === 'activas' && (
                <div className="overflow-auto">
                    <table className="w-full min-w-[1240px] text-sm">
                        <thead className="bg-secondary text-left uppercase text-xs sticky top-0 z-[1]">
                            <tr>
                                {capcaleraActivas.map((h) => (
                                    <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {activasFiles.length === 0 ? (
                                <tr><td colSpan={capcaleraActivas.length} className="p-8 text-center text-muted-foreground">Sin exclusivas activas con los filtros actuales.</td></tr>
                            ) : activasPerDia.map((grup) => renderGrup(grup, capcaleraActivas, false))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Listado de entregadas (solo lectura), agrupado por día */}
            {vista === 'entregadas' && (
                <div className="overflow-auto">
                    <div className="p-3 border-b border-border bg-secondary/40 text-xs text-muted-foreground">
                        Listado histórico de solo lectura: exclusivas marcadas como finalizadas o entregadas.
                        Se conserva el acceso al detalle, monos, rutas, operaciones, tiempos, historial, calidad, incidencias y trazabilidad sin permitir cambios accidentales sobre el histórico.
                    </div>
                    <table className="w-full min-w-[1180px] text-sm">
                        <thead className="bg-secondary text-left uppercase text-xs sticky top-0 z-[1]">
                            <tr>
                                {capcaleraEntregades.map((h) => (
                                    <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {entregadesFiles.length === 0 ? (
                                <tr><td colSpan={capcaleraEntregades.length} className="p-8 text-center text-muted-foreground">Sin exclusivas finalizadas ni entregadas.</td></tr>
                            ) : entregadesPerDia.map((grup) => renderGrup(grup, capcaleraEntregades, true))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
        {detallEx && (
            <ExclusivaPanel
                exclusiva={detallEx}
                onClose={() => { setDetallEx(null); setDetallSoloLectura(false); }}
                onRecarrega={recarrega}
                soloLectura={detallSoloLectura}
            />
        )}
    </>
    );
};

// --------------------------------------------------------------------- Rutes
export const Rutes = ({ rutes, articles = [], recarrega }) => {
    const [edicio, setEdicio] = useState(null);
    const [desant, setDesant] = useState(false);
    const [detallRuta, setDetallRuta] = useState(null);
    const [aplicarModal, setAplicarModal] = useState(null);
    const [buscandoExcl, setBuscandoExcl] = useState(false);

    const nova = () => setEdicio({ nom: '', article: '', per_defecte: false, operacions: [{ nom: '', temps_estandard_min: 10 }] });

    // Artículos asociados a una ruta vía relación real articles.ruta
    const articlesPerRuta = useMemo(() => {
        const map = new Map();
        for (const a of articles) {
            if (!a.ruta) continue;
            if (!map.has(a.ruta)) map.set(a.ruta, []);
            map.get(a.ruta).push(a);
        }
        return map;
    }, [articles]);

    // Busca exclusivas candidatas para una ruta: las de artículos que usan esa ruta
    // y que todavía no la tienen asignada.
    const buscarExclusivasParaRuta = async (ruta) => {
        setBuscandoExcl(true);
        try {
            const [articles, exclusives] = await Promise.all([
                pb.collection('articles').getFullList({ requestKey: 'aplicar-arts' }).catch(() => []),
                pb.collection('exclusives').getFullList({ sort: '-created', requestKey: 'aplicar-excl' }).catch(() => []),
            ]);
            // Referencias de artículos vinculados a esta ruta (por relación o por campo article de la ruta)
            const refs = new Set(
                articles
                    .filter((a) => a.ruta === ruta.id || (ruta.article && (a.referencia || '').toUpperCase() === ruta.article.toUpperCase()))
                    .map((a) => (a.referencia || '').toUpperCase())
                    .filter(Boolean),
            );
            const candidatas = exclusives.filter((e) => {
                const ref = (e.referencia || e.article || '').toUpperCase();
                const perteneceAlArticulo = refs.size > 0 ? refs.has(ref) : false;
                const yaTieneLaRuta = e.ruta === ruta.id;
                return perteneceAlArticulo && !yaTieneLaRuta;
            });
            return { candidatas, articulos: articles.filter((a) => refs.has((a.referencia || '').toUpperCase())) };
        } finally {
            setBuscandoExcl(false);
        }
    };

    const desa = async () => {
        if (!edicio?.nom.trim()) return;
        setDesant(true);
        const esNova = !edicio.id;
        const dades = {
            nom: edicio.nom.trim(),
            article: edicio.article.trim(),
            per_defecte: !!edicio.per_defecte,
            operacions: (edicio.operacions || []).filter((o) => o.nom.trim()).map((o) => ({
                nom: o.nom.trim(), temps_estandard_min: Number(o.temps_estandard_min) || 0,
            })),
        };
        try {
            let rutaRec;
            if (edicio.id) rutaRec = await pb.collection('rutes').update(edicio.id, dades);
            else rutaRec = await pb.collection('rutes').create(dades);
            setEdicio(null);
            recarrega();
            // Preguntar si se aplica a exclusivas existentes
            const { candidatas, articulos } = await buscarExclusivasParaRuta(rutaRec);
            setAplicarModal({
                fase: 'confirmar',
                ruta: rutaRec,
                esNova,
                candidatas,
                articulos,
            });
        } finally {
            setDesant(false);
        }
    };

    const elimina = async (id) => {
        await pb.collection('rutes').delete(id);
        recarrega();
    };

    return (
        <>
        <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <div className="rounded-lg border border-border bg-card p-5">
                <div className="flex items-center justify-between">
                    <h3 className="font-display text-2xl uppercase">Rutas de operaciones</h3>
                    <button onClick={nova} className="flex h-10 items-center gap-2 rounded-md bg-[hsl(var(--accent))] px-3 text-sm font-semibold text-[hsl(var(--accent-foreground))] active:scale-95">
                        <Plus className="h-4 w-4" /> Nueva ruta
                    </button>
                </div>
                {rutes.length === 0 ? (
                    <p className="mt-4 text-sm text-muted-foreground">Todavía no hay rutas definidas.</p>
                ) : (
                    <ul className="mt-4 divide-y divide-border">
                        {rutes.map((r) => {
                            const artsRuta = articlesPerRuta.get(r.id) || [];
                            return (
                            <li key={r.id} className="py-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="font-semibold">{r.nom} {r.per_defecte ? <span className="ml-1 rounded bg-secondary px-2 py-0.5 text-xs">por defecto</span> : null}</p>
                                        <p className="text-xs text-muted-foreground">Etiqueta artículo: {r.article || 'todos'}</p>
                                        <p className="text-sm mt-1">{(r.operacions || []).map((o) => `${o.nom} (${o.temps_estandard_min}′)`).join(' → ') || 'sin operaciones'}</p>
                                        <p className="text-xs mt-1">
                                            <strong className="text-foreground">{artsRuta.length}</strong> artículo(s) asociado(s)
                                            {artsRuta.length > 0 && (
                                                <span className="ml-2 text-muted-foreground">
                                                    {artsRuta.slice(0, 6).map((a) => a.referencia).join(', ')}{artsRuta.length > 6 ? ` +${artsRuta.length - 6}` : ''}
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => setDetallRuta(r)} className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs font-semibold"><Eye className="h-3.5 w-3.5" /> Detalle</button>
                                        <button onClick={() => setEdicio({ ...r, operacions: r.operacions || [] })} className="rounded border border-border px-2 py-1 text-xs font-semibold">Editar</button>
                                        <button onClick={() => elimina(r.id)} className="rounded border border-destructive px-2 py-1 text-xs font-semibold text-destructive" aria-label="Eliminar ruta">
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
                <h3 className="font-display text-2xl uppercase">{edicio?.id ? 'Editar ruta' : 'Detalle de ruta'}</h3>
                {!edicio ? (
                    <p className="mt-4 text-sm text-muted-foreground">Selecciona una ruta o crea una nueva para editar su secuencia de operaciones.</p>
                ) : (
                    <div className="mt-4 grid gap-3">
                        <div className="grid gap-2">
                            <label className="text-sm font-semibold">Nombre</label>
                            <input value={edicio.nom} onChange={(e) => setEdicio({ ...edicio, nom: e.target.value })} className="h-11 rounded-md border border-input bg-background px-3" />
                        </div>
                        <div className="grid gap-2">
                            <label className="text-sm font-semibold">Etiqueta de artículo (opcional)</label>
                            <input value={edicio.article || ''} onChange={(e) => setEdicio({ ...edicio, article: e.target.value })} className="h-11 rounded-md border border-input bg-background px-3" />
                            <p className="text-xs text-muted-foreground">Etiqueta informativa. La asociación real de artículos se gestiona desde Producción › Rutas › Asignar artículos (un mismo ruta puede tener varios artículos).</p>
                            {edicio.id && (() => {
                                const arts = articlesPerRuta.get(edicio.id) || [];
                                return arts.length > 0 ? (
                                    <div className="flex flex-wrap gap-1.5 mt-1">
                                        {arts.map((a) => (
                                            <span key={a.id} className="rounded bg-secondary px-2 py-0.5 text-xs font-mono">{a.referencia}</span>
                                        ))}
                                    </div>
                                ) : <p className="text-xs italic text-muted-foreground mt-1">Sin artículos asociados vía relación.</p>;
                            })()}
                        </div>
                        <label className="flex items-center gap-2 text-sm font-semibold">
                            <input type="checkbox" checked={!!edicio.per_defecte} onChange={(e) => setEdicio({ ...edicio, per_defecte: e.target.checked })} />
                            Ruta por defecto
                        </label>
                        <p className="text-sm font-semibold mt-2">Secuencia de operaciones</p>
                        {(edicio.operacions || []).map((op, i) => (
                            <div key={i} className="flex gap-2">
                                <input value={op.nom}
                                    onChange={(e) => { const ops = [...edicio.operacions]; ops[i] = { ...ops[i], nom: e.target.value }; setEdicio({ ...edicio, operacions: ops }); }}
                                    placeholder={`Operación ${i + 1}`} className="h-11 flex-1 rounded-md border border-input bg-background px-3" />
                                <input type="number" min="0" value={op.temps_estandard_min}
                                    onChange={(e) => { const ops = [...edicio.operacions]; ops[i] = { ...ops[i], temps_estandard_min: e.target.value }; setEdicio({ ...edicio, operacions: ops }); }}
                                    className="h-11 w-24 rounded-md border border-input bg-background px-3" />
                                <button onClick={() => setEdicio({ ...edicio, operacions: edicio.operacions.filter((_, j) => j !== i) })}
                                    className="rounded-md border border-border px-3" aria-label="Quitar operación">
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        ))}
                        <button onClick={() => setEdicio({ ...edicio, operacions: [...(edicio.operacions || []), { nom: '', temps_estandard_min: 10 }] })}
                            className="h-11 rounded-md border border-dashed border-border text-sm font-semibold">
                            + Añadir operación
                        </button>
                        <div className="mt-2 flex gap-2">
                            <button onClick={desa} disabled={desant} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground font-semibold disabled:opacity-60">
                                <Save className="h-4 w-4" /> Guardar ruta
                            </button>
                            <button onClick={() => setEdicio(null)} className="h-12 rounded-md bg-secondary px-4 font-semibold">Cancelar</button>
                        </div>
                    </div>
                )}
            </div>
        </section>
        {detallRuta && (
            <div className="mt-6">
                <RutaDetall rutaId={detallRuta.id} rutaNom={detallRuta.nom} onClose={() => setDetallRuta(null)} />
            </div>
        )}

        {/* Paso 1: preguntar si se aplica a exclusivas existentes */}
        {aplicarModal?.fase === 'confirmar' && (
            <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60 p-4" onClick={() => setAplicarModal(null)}>
                <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                    <h3 className="font-display text-2xl uppercase">
                        {aplicarModal.esNova ? '¿Aplicar esta ruta a exclusivas existentes?' : '¿Actualizar exclusivas existentes?'}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Ruta <strong>{aplicarModal.ruta.nom}</strong>.
                        {' '}Se han encontrado <strong>{aplicarModal.articulos.length}</strong> artículo(s) que usan esta ruta
                        y <strong>{aplicarModal.candidatas.length}</strong> exclusiva(s) que todavía no la tienen asignada.
                    </p>
                    {aplicarModal.articulos.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                            {aplicarModal.articulos.slice(0, 12).map((a) => (
                                <span key={a.id} className="rounded bg-secondary px-2 py-0.5 text-xs font-mono">{a.referencia}</span>
                            ))}
                        </div>
                    )}
                    <div className="mt-5 grid grid-cols-2 gap-3">
                        <button onClick={() => setAplicarModal(null)}
                            className="h-11 rounded-md bg-secondary font-semibold">No, gracias</button>
                        <button
                            onClick={() => setAplicarModal((m) => ({ ...m, fase: 'seleccionar' }))}
                            disabled={aplicarModal.candidatas.length === 0}
                            className="h-11 rounded-md bg-primary text-primary-foreground font-semibold disabled:opacity-50">
                            Sí, ver exclusivas
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Paso 2: seleccionar y actualizar */}
        <ActualizarExclusivasModal
            open={aplicarModal?.fase === 'seleccionar'}
            onClose={() => { setAplicarModal(null); recarrega(); }}
            titulo="Actualizar exclusivas"
            descripcion={`Ruta "${aplicarModal?.ruta?.nom || ''}" aplicada a las exclusivas seleccionadas`}
            tipoCambio="ruta_actualizada"
            rutaId={aplicarModal?.ruta?.id}
            rutaNombre={aplicarModal?.ruta?.nom}
            exclusivas={aplicarModal?.candidatas || []}
            onCompletado={recarrega}
        />

        {buscandoExcl && (
            <div className="fixed inset-0 z-[54] flex items-center justify-center bg-black/40">
                <div className="rounded-lg bg-card px-5 py-3 text-sm font-semibold">Buscando exclusivas afectadas...</div>
            </div>
        )}
    </>
    );
};

// ------------------------------------------------------------------- Articles
const ESTAT_ARTICLE = {
    activo: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]',
    inactivo: 'bg-secondary text-muted-foreground',
};

export const Articles = ({ articles, rutes, exclusives = [], recarrega }) => {
    const [edicio, setEdicio] = useState(null);
    const [desant, setDesant] = useState(false);
    const [detall, setDetall] = useState(null);
    const [important, setImportant] = useState(false);
    const [resumImport, setResumImport] = useState(null);

    const rutaNom = (a) => a.expand?.ruta?.nom || rutes.find((r) => r.id === a.ruta)?.nom || '—';

    const desa = async () => {
        if (!edicio?.referencia?.trim() || !edicio?.nom?.trim()) return;
        setDesant(true);
        const dades = {
            referencia: edicio.referencia.trim().toUpperCase(),
            nom: edicio.nom.trim().toUpperCase(),
            familia: edicio.familia?.trim() || '',
            ruta: edicio.ruta || '',
            estado: edicio.estado || 'activo',
            temps_estandard_total_min: Number(edicio.temps_estandard_total_min) || 0,
            observacions: edicio.observacions?.trim() || '',
        };
        try {
            if (edicio.id) await pb.collection('articles').update(edicio.id, dades);
            else await pb.collection('articles').create(dades);
            setEdicio(null);
            recarrega();
        } catch (err) {
            // silently ignore duplicate reference errors
        } finally {
            setDesant(false);
        }
    };

    const elimina = async (id) => {
        if (!confirm('¿Eliminar este artículo?')) return;
        await pb.collection('articles').delete(id);
        if (detall?.id === id) setDetall(null);
        recarrega();
    };

    // Importar referencias detectadas en carga masiva (exclusivas) que aún no tienen artículo
    const importarCargaMasiva = async () => {
        setImportant(true);
        setResumImport(null);
        const refsExistentes = new Set(articles.map((a) => (a.referencia || '').toUpperCase()));
        const refsUnicas = [...new Set(
            exclusives
                .map((e) => (e.referencia || e.article || '').toUpperCase())
                .filter(Boolean)
        )].sort();

        const noves = [];
        const jaExistents = [];
        for (const ref of refsUnicas) {
            if (refsExistentes.has(ref)) {
                jaExistents.push(ref);
            } else {
                noves.push({ ref, nom: ref });
            }
        }

        let creades = 0;
        let senseRuta = 0;
        for (const n of noves) {
            try {
                await pb.collection('articles').create({
                    referencia: n.ref,
                    nom: n.nom,
                    familia: '',
                    ruta: '',
                    estado: 'activo',
                    temps_estandard_total_min: 0,
                    observacions: '',
                }, { requestKey: `imp-art-${n.ref}` });
                creades += 1;
                senseRuta += 1;
            } catch (_) {
                // skip duplicates / errors
            }
        }

        setResumImport({
            creades,
            jaExistents: jaExistents.length,
            senseRuta,
            total: refsUnicas.length,
        });
        setImportant(false);
        recarrega();
    };

    // Estadísticas para el detalle
    const statsArticle = (a) => {
        const ref = (a.referencia || '').toUpperCase();
        const excs = exclusives.filter((e) => (e.referencia || e.article || '').toUpperCase() === ref);
        const total = excs.length;
        const completades = excs.filter((e) => e.estat === 'finalitzada' || e.estat === 'entregada').length;
        const enCurs = excs.filter((e) => e.estat === 'en_curs').length;
        const pendents = excs.filter((e) => e.estat === 'pendent' || e.estat === 'recibida').length;
        const retrasades = excs.filter((e) => e.estat === 'retrasada').length;
        return { total, completades, enCurs, pendents, retrasades, excs };
    };

    return (
        <section className="grid gap-6">
            <div className="rounded-lg border border-border bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h3 className="font-display text-2xl uppercase">Artículos</h3>
                    <div className="flex gap-2">
                        <button onClick={importarCargaMasiva} disabled={important}
                            className="flex h-10 items-center gap-2 rounded-md border border-border bg-secondary px-3 text-sm font-semibold disabled:opacity-60 active:scale-95">
                            <FileDown className="h-4 w-4" /> Importar de carga masiva
                        </button>
                        <button onClick={() => setEdicio({ referencia: '', nom: '', familia: '', ruta: '', estado: 'activo', temps_estandard_total_min: 0, observacions: '' })}
                            className="flex h-10 items-center gap-2 rounded-md bg-[hsl(var(--accent))] px-3 text-sm font-semibold text-[hsl(var(--accent-foreground))] active:scale-95">
                            <Plus className="h-4 w-4" /> Crear artículo
                        </button>
                    </div>
                </div>

                {resumImport && (
                    <div className="mb-4 rounded-md border border-border bg-secondary/50 p-3 text-sm">
                        <p className="font-semibold">Resumen de importación</p>
                        <p className="mt-1 text-muted-foreground">
                            {resumImport.creades} artículos creados · {resumImport.jaExistents} ya existentes · {resumImport.senseRuta} sin ruta asignada · {resumImport.total} referencias detectadas en carga masiva.
                        </p>
                        <button onClick={() => setResumImport(null)} className="mt-2 text-xs underline">Cerrar</button>
                    </div>
                )}

                <div className="overflow-auto max-h-[520px]">
                    <table className="w-full text-sm">
                        <thead className="bg-secondary text-left text-xs uppercase sticky top-0">
                            <tr>
                                {['Referencia', 'Nombre', 'Ruta asignada', 'Estado', ''].map((h) => (
                                    <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {articles.length === 0 ? (
                                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Sin artículos definidos.</td></tr>
                            ) : articles.map((a) => (
                                <tr key={a.id} className={a.estado === 'inactivo' ? 'opacity-60' : ''}>
                                    <td className="px-3 py-2 font-semibold font-mono text-sm">{a.referencia}</td>
                                    <td className="px-3 py-2">{a.nom}</td>
                                    <td className="px-3 py-2">{rutaNom(a)}</td>
                                    <td className="px-3 py-2">
                                        <span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${ESTAT_ARTICLE[a.estado] || ESTAT_ARTICLE.activo}`}>{a.estado || 'activo'}</span>
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="flex gap-2">
                                            <button onClick={() => setEdicio({ ...a })} className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs"><Edit2 className="h-3 w-3" /> Editar</button>
                                            <button onClick={() => setDetall(a)} className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs"><Eye className="h-3 w-3" /> Detalles</button>
                                            <button onClick={() => elimina(a.id)} className="rounded border border-destructive px-2 py-1 text-xs text-destructive">
                                                <Trash2 className="h-3 w-3" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {(edicio || detall) && (
                <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                    {edicio && (
                        <div className="rounded-lg border border-border bg-card p-5">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="font-display text-2xl uppercase">{edicio.id ? 'Editar artículo' : 'Nuevo artículo'}</h3>
                                <button onClick={() => setEdicio(null)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
                            </div>
                            <div className="grid gap-3">
                                <div className="grid gap-2">
                                    <label className="text-sm font-semibold">Referencia *</label>
                                    <input value={edicio.referencia} onChange={(e) => setEdicio({ ...edicio, referencia: e.target.value })}
                                        placeholder="R82-020" className="h-11 rounded-md border border-input bg-background px-3 font-mono" />
                                </div>
                                <div className="grid gap-2">
                                    <label className="text-sm font-semibold">Nombre *</label>
                                    <input value={edicio.nom} onChange={(e) => setEdicio({ ...edicio, nom: e.target.value })}
                                        placeholder="UNIC PLUS SUIT" className="h-11 rounded-md border border-input bg-background px-3" />
                                </div>
                                <div className="grid gap-2">
                                    <label className="text-sm font-semibold">Familia</label>
                                    <input value={edicio.familia || ''} onChange={(e) => setEdicio({ ...edicio, familia: e.target.value })}
                                        placeholder="UNIC PLUS" className="h-11 rounded-md border border-input bg-background px-3" />
                                </div>
                                <div className="grid gap-2">
                                    <label className="text-sm font-semibold">Ruta de operaciones</label>
                                    <select value={edicio.ruta || ''} onChange={(e) => setEdicio({ ...edicio, ruta: e.target.value })}
                                        className="h-11 rounded-md border border-input bg-background px-3 text-sm">
                                        <option value="">Sin ruta asignada</option>
                                        {rutes.map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}
                                    </select>
                                </div>
                                <div className="grid gap-2">
                                    <label className="text-sm font-semibold">Estado</label>
                                    <select value={edicio.estado || 'activo'} onChange={(e) => setEdicio({ ...edicio, estado: e.target.value })}
                                        className="h-11 rounded-md border border-input bg-background px-3 text-sm">
                                        <option value="activo">Activo</option>
                                        <option value="inactivo">Inactivo</option>
                                    </select>
                                </div>
                                <div className="grid gap-2">
                                    <label className="text-sm font-semibold">Minutos estándar totales</label>
                                    <input type="number" min="0" value={edicio.temps_estandard_total_min || ''}
                                        onChange={(e) => setEdicio({ ...edicio, temps_estandard_total_min: e.target.value })}
                                        placeholder="350" className="h-11 rounded-md border border-input bg-background px-3" />
                                </div>
                                <div className="grid gap-2">
                                    <label className="text-sm font-semibold">Descripción</label>
                                    <textarea value={edicio.observacions || ''} onChange={(e) => setEdicio({ ...edicio, observacions: e.target.value })}
                                        rows={2} className="rounded-md border border-input bg-background p-3 text-sm" />
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={desa} disabled={desant}
                                        className="flex h-12 flex-1 items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground font-semibold disabled:opacity-60">
                                        <Save className="h-4 w-4" /> Guardar cambios
                                    </button>
                                    <button onClick={() => setEdicio(null)} className="h-12 rounded-md bg-secondary px-4 font-semibold">Cancelar</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {detall && (
                        <DetallArticle
                            article={detall}
                            rutes={rutes}
                            rutaNom={rutaNom(detall)}
                            stats={statsArticle(detall)}
                            onClose={() => setDetall(null)}
                            onEdit={() => { setEdicio({ ...detall }); setDetall(null); }}
                        />
                    )}
                </div>
            )}
        </section>
    );
};

const DetallArticle = ({ article, rutes, rutaNom, stats, onClose, onEdit }) => {
    const rutaObj = rutes.find((r) => r.id === article.ruta);
    const operacions = Array.isArray(rutaObj?.operacions) ? rutaObj.operacions : [];
    const tempsTotal = operacions.reduce((s, o) => s + (Number(o.temps_std_min) || 0), 0);
    const fases = [...new Set(operacions.map((o) => o.fase).filter(Boolean))];

    return (
        <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-2xl uppercase">Detalles del artículo</h3>
                <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>

            <div className="grid gap-4">
                <div className="rounded-md border border-border bg-secondary/40 p-4">
                    <h4 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">Información general</h4>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        <dt className="text-muted-foreground">Referencia</dt><dd className="font-mono font-semibold">{article.referencia}</dd>
                        <dt className="text-muted-foreground">Nombre</dt><dd>{article.nom}</dd>
                        <dt className="text-muted-foreground">Familia</dt><dd>{article.familia || '—'}</dd>
                        <dt className="text-muted-foreground">Estado</dt><dd><span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${ESTAT_ARTICLE[article.estado] || ESTAT_ARTICLE.activo}`}>{article.estado || 'activo'}</span></dd>
                        <dt className="text-muted-foreground">Min. estándar</dt><dd className="tabular-nums">{article.temps_estandard_total_min || '—'}</dd>
                    </dl>
                    {article.observacions && <p className="mt-3 text-sm text-muted-foreground">{article.observacions}</p>}
                </div>

                <div className="rounded-md border border-border bg-secondary/40 p-4">
                    <h4 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">Ruta asignada</h4>
                    {rutaObj ? (
                        <div className="text-sm">
                            <p className="font-semibold">{rutaObj.nom}</p>
                            <p className="mt-1 text-muted-foreground">{operacions.length} operaciones · {fases.length} fases · {tempsTotal.toFixed(0)} min totales</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {fases.map((f) => (
                                    <span key={f} className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{f}</span>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">Sin ruta asignada.</p>
                    )}
                </div>

                <div className="rounded-md border border-border bg-secondary/40 p-4">
                    <h4 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">Exclusivas de este artículo</h4>
                    <div className="grid grid-cols-4 gap-3 text-center">
                        <div className="rounded-md bg-card p-2">
                            <p className="font-display text-2xl tabular-nums">{stats.total}</p>
                            <p className="text-xs text-muted-foreground">Total</p>
                        </div>
                        <div className="rounded-md bg-card p-2">
                            <p className="font-display text-2xl tabular-nums text-[hsl(var(--ok))]">{stats.completades}</p>
                            <p className="text-xs text-muted-foreground">Completadas</p>
                        </div>
                        <div className="rounded-md bg-card p-2">
                            <p className="font-display text-2xl tabular-nums text-[hsl(var(--warn))]">{stats.enCurs}</p>
                            <p className="text-xs text-muted-foreground">En curso</p>
                        </div>
                        <div className="rounded-md bg-card p-2">
                            <p className="font-display text-2xl tabular-nums text-destructive">{stats.retrasades}</p>
                            <p className="text-xs text-muted-foreground">Retrasadas</p>
                        </div>
                    </div>
                </div>

                <FasesArticuloExternalizadas articleId={article.id} ruta={rutaObj} />

                <button onClick={onEdit}
                    className="flex h-11 items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground font-semibold active:scale-95">
                    <Edit2 className="h-4 w-4" /> Editar artículo
                </button>
            </div>
        </div>
    );
};

// -------- Fases externalizadas por artículo --------------------------------
const FASE_EMPTY = { nombre_fase: '', descripcion: '', proveedor_id: '', precio_unitario: '', tiempo_estimado_seg: '', notas: '' };

const FasesArticuloExternalizadas = ({ articleId, ruta }) => {
    const [fases, setFases] = useState([]);
    const [proveedores, setProveedores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(null);
    const [form, setForm] = useState(FASE_EMPTY);
    const [saving, setSaving] = useState(false);

    const operacionesRuta = Array.isArray(ruta?.operaciones) ? ruta.operaciones : [];

    useEffect(() => {
        Promise.all([
            pb.collection('fases_articulo').getFullList({ filter: pb.filter('articulo = {:id}', { id: articleId }), sort: 'numero_fase', expand: 'proveedor_id', requestKey: `fa-list-${articleId}` }).catch(() => []),
            pb.collection('proveedores').getFullList({ filter: 'activo = true', sort: 'nombre', requestKey: 'fa-provs' }).catch(() => []),
        ]).then(([f, p]) => { setFases(f); setProveedores(p); setLoading(false); });
    }, [articleId]);

    const openCreate = () => { setForm({ ...FASE_EMPTY }); setModal({ mode: 'create' }); };
    const openEdit = (f) => { setForm({ ...f, precio_unitario: f.precio_unitario || '', tiempo_estimado_seg: f.tiempo_estimado_seg || '' }); setModal({ mode: 'edit', id: f.id }); };
    const close = () => setModal(null);

    const save = async () => {
        if (!form.nombre_fase?.trim()) return;
        setSaving(true);
        try {
            const data = { articulo: articleId, nombre_fase: form.nombre_fase.trim(), descripcion: form.descripcion || '', proveedor_id: form.proveedor_id || '', precio_unitario: Number(form.precio_unitario) || 0, tiempo_estimado_seg: Number(form.tiempo_estimado_seg) || 0, notas: form.notas || '', numero_fase: Number(form.numero_fase) || 0 };
            if (modal.mode === 'create') await pb.collection('fases_articulo').create(data, { requestKey: `fa-c-${Date.now()}` });
            else await pb.collection('fases_articulo').update(modal.id, data, { requestKey: `fa-u-${modal.id}` });
            const updated = await pb.collection('fases_articulo').getFullList({ filter: pb.filter('articulo = {:id}', { id: articleId }), sort: 'numero_fase', expand: 'proveedor_id', requestKey: `fa-rel-${Date.now()}` }).catch(() => fases);
            setFases(updated); close();
        } catch (e) { console.error(e); }
        finally { setSaving(false); }
    };

    const del = async (id) => {
        if (!confirm('¿Eliminar esta fase?')) return;
        await pb.collection('fases_articulo').delete(id, { requestKey: `fa-d-${id}` }).catch(() => {});
        setFases(f => f.filter(x => x.id !== id));
    };

    return (
        <div className="rounded-md border border-border bg-secondary/40 p-4">
            <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold uppercase text-muted-foreground">Fases externalizadas</h4>
                <button onClick={openCreate} className="flex items-center gap-1 rounded-md bg-primary px-2.5 h-8 text-xs font-bold text-primary-foreground active:scale-95"><Plus className="h-3.5 w-3.5" /> Añadir</button>
            </div>
            {loading ? <div className="h-10 animate-pulse rounded bg-secondary" /> : fases.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin fases externalizadas. Configura aquí las fases que se enviarán a proveedores.</p>
            ) : (
                <div className="overflow-auto">
                    <table className="w-full text-xs">
                        <thead className="bg-card text-left uppercase">
                            <tr>{['Fase', 'Nombre', 'Proveedor', 'Precio', 'Tiempo (min)', ''].map(h => <th key={h} className="px-2 py-1.5 font-semibold">{h}</th>)}</tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {fases.map(f => (
                                <tr key={f.id}>
                                    <td className="px-2 py-1.5 tabular-nums font-semibold">{f.numero_fase || '—'}</td>
                                    <td className="px-2 py-1.5">{f.nombre_fase}</td>
                                    <td className="px-2 py-1.5">{f.expand?.proveedor_id?.nombre || '—'}</td>
                                    <td className="px-2 py-1.5 tabular-nums">{f.precio_unitario ? `${f.precio_unitario}€` : '—'}</td>
                                    <td className="px-2 py-1.5 tabular-nums">{f.tiempo_estimado_seg ? Math.round(f.tiempo_estimado_seg / 60) : '—'}</td>
                                    <td className="px-2 py-1.5">
                                        <div className="flex gap-1">
                                            <button onClick={() => openEdit(f)} className="rounded border border-border px-1.5 h-6 hover:bg-background"><Pencil className="h-3 w-3" /></button>
                                            <button onClick={() => del(f.id)} className="rounded border border-destructive/40 px-1.5 h-6 text-destructive hover:bg-destructive/10"><Trash2 className="h-3 w-3" /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {modal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={close}>
                    <div className="modal-card w-full max-w-md rounded-2xl bg-card p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-display text-xl uppercase">{modal.mode === 'create' ? 'Añadir fase' : 'Editar fase'}</h3>
                            <button onClick={close} className="rounded-lg p-1.5 hover:bg-secondary"><X className="h-4 w-4" /></button>
                        </div>
                        <div className="grid gap-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-semibold uppercase text-muted-foreground">Número de fase</label>
                                    <input type="number" min="1" value={form.numero_fase || ''} onChange={e => setForm(f => ({ ...f, numero_fase: e.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold uppercase text-muted-foreground">Nombre *</label>
                                    <input value={form.nombre_fase || ''} onChange={e => setForm(f => ({ ...f, nombre_fase: e.target.value }))} placeholder="Ej. Estampación" className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-semibold uppercase text-muted-foreground">Proveedor</label>
                                <select value={form.proveedor_id || ''} onChange={e => setForm(f => ({ ...f, proveedor_id: e.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
                                    <option value="">Sin proveedor asignado</option>
                                    {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-semibold uppercase text-muted-foreground">Precio (€)</label>
                                    <input type="number" min="0" step="0.01" value={form.precio_unitario || ''} onChange={e => setForm(f => ({ ...f, precio_unitario: e.target.value }))} placeholder="0.00" className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold uppercase text-muted-foreground">Tiempo estimado (min)</label>
                                    <input type="number" min="0" value={form.tiempo_estimado_seg ? Math.round(Number(form.tiempo_estimado_seg)/60) : ''} onChange={e => setForm(f => ({ ...f, tiempo_estimado_seg: Number(e.target.value) * 60 }))} placeholder="30" className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-semibold uppercase text-muted-foreground">Descripción / Notas</label>
                                <textarea value={form.notas || ''} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} rows={2} className="mt-1 w-full rounded-lg border border-input bg-background p-2 text-sm resize-none" />
                            </div>
                            <div className="grid grid-cols-2 gap-3 mt-1">
                                <button onClick={close} disabled={saving} className="h-11 rounded-xl bg-secondary font-semibold disabled:opacity-50">Cancelar</button>
                                <button onClick={save} disabled={saving || !form.nombre_fase?.trim()} className="h-11 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar'}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// -------------------------------------------------------------------- Usuaris
const ROLS_ALL = {
    operari: 'Operario',
    produccio: 'Producción',
    qualitat: 'Calidad',
    externalitzacio: 'Externalización',
    admin: 'Admin',
    superadmin: 'Super Admin',
};
const ROL_BADGE = {
    operari: 'bg-secondary',
    produccio: 'bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))]',
    qualitat: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]',
    externalitzacio: 'bg-primary/10 text-primary',
    admin: 'bg-primary/15 text-primary',
    superadmin: 'bg-[hsl(var(--accent))]/15 text-[hsl(var(--accent))]',
};

export const Usuaris = ({ operaris, recarrega }) => {
    const { rol: rolActual } = useAuth();
    const esSuperAdmin = rolActual === 'superadmin';
    const [edicio, setEdicio] = useState(null);
    const [desant, setDesant] = useState(false);
    const [pass, setPass] = useState('');
    const [errMsg, setErrMsg] = useState('');
    const [okMsg, setOkMsg] = useState('');

    // Roles disponibles para asignar: Super Admin solo lo puede asignar un Super Admin.
    const rolsDisponibles = useMemo(() => {
        const entries = Object.entries(ROLS_ALL);
        return esSuperAdmin ? entries : entries.filter(([v]) => v !== 'superadmin');
    }, [esSuperAdmin]);

    const nou = () => {
        setEdicio({ name: '', cognom: '', email: '', codi: '', rol: 'operari', especialitats: [], maquines: [], disponibilitat: '' });
        setPass('');
        setErrMsg('');
        setOkMsg('');
    };

    const desa = async () => {
        setErrMsg('');
        setOkMsg('');
        if (!edicio?.name?.trim() || !edicio?.codi?.trim()) {
            setErrMsg('Faltan campos obligatorios: Nombre y Código son obligatorios.');
            return;
        }
        const rolTriat = edicio.rol || 'operari';
        if (!ROLS_ALL[rolTriat]) {
            setErrMsg('El rol seleccionado no es válido.');
            return;
        }
        if (rolTriat === 'superadmin' && !esSuperAdmin) {
            setErrMsg('Solo Super Admin puede asignar el rol de Super Admin.');
            return;
        }
        if (!edicio.id) {
            if (!pass || pass.length < 8) {
                setErrMsg('La contraseña debe tener al menos 8 caracteres.');
                return;
            }
        }
        setDesant(true);
        const codiNet = edicio.codi.trim().toUpperCase();
        const autoEmail = edicio.email?.trim()
            ? edicio.email.trim()
            : `${codiNet.toLowerCase().replace(/[^a-z0-9]/g, '')}@intern.onatex.local`;
        const dades = {
            name: edicio.name.trim(),
            cognom: (edicio.cognom || '').trim(),
            email: edicio.id ? edicio.email : autoEmail,
            codi: codiNet,
            rol: rolTriat,
            emailVisibility: false,
        };
        if (rolTriat === 'operari') {
            dades.especialitats = edicio.especialitats || [];
            dades.maquines = edicio.maquines || [];
            dades.disponibilitat = edicio.disponibilitat || '';
        }
        if (!edicio.id) {
            dades.password = pass;
            dades.passwordConfirm = pass;
        }
        try {
            if (edicio.id) {
                await pb.collection('users').update(edicio.id, dades);
                setOkMsg('Usuario actualizado correctamente.');
            } else {
                await pb.collection('users').create(dades);
                setOkMsg('Usuario creado correctamente.');
            }
            setEdicio(null);
            setPass('');
            recarrega();
        } catch (err) {
            const data = err?.response?.data || {};
            const camp = Object.values(data)[0];
            const msg = camp?.message || err?.message || '';
            if (err?.status === 403) {
                setErrMsg('No tienes permisos para realizar esta acción en la base de datos.');
            } else if (err?.status === 400) {
                setErrMsg(`Error de validación: ${msg || 'revisa los datos introducidos.'}`);
            } else {
                setErrMsg(`Error en la base de datos: ${msg || 'no se pudo guardar el usuario.'}`);
            }
        } finally {
            setDesant(false);
        }
    };

    const elimina = async (id) => {
        if (!confirm('¿Seguro que quieres eliminar este usuario?')) return;
        try {
            await pb.collection('users').delete(id);
            recarrega();
        } catch (err) {
            setErrMsg(err?.status === 403
                ? 'No tienes permisos para eliminar usuarios.'
                : 'Error al eliminar el usuario.');
        }
    };

    const toggleArr = (camp, valor) => {
        const actual = edicio[camp] || [];
        const seguent = actual.includes(valor)
            ? actual.filter((v) => v !== valor)
            : [...actual, valor];
        setEdicio({ ...edicio, [camp]: seguent });
    };

    return (
        <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <div className="rounded-lg border border-border bg-card p-5">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-display text-2xl uppercase">Usuarios del sistema</h3>
                    <button onClick={nou}
                        className="flex h-10 items-center gap-2 rounded-md bg-[hsl(var(--accent))] px-3 text-sm font-semibold text-[hsl(var(--accent-foreground))] active:scale-95">
                        <Plus className="h-4 w-4" /> Nuevo usuario
                    </button>
                </div>
                <div className="overflow-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-secondary text-left text-xs uppercase">
                            <tr>
                                {['Nombre', 'Código', 'Rol', ''].map((h) => (
                                    <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {operaris.length === 0 ? (
                                <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Sin usuarios.</td></tr>
                            ) : operaris.map((u) => (
                                <tr key={u.id}>
                                    <td className="px-3 py-2 font-semibold">{u.name || '—'}{u.cognom ? ` ${u.cognom}` : ''}</td>
                                    <td className="px-3 py-2 font-mono">{u.codi || '—'}</td>
                                    <td className="px-3 py-2">
                                        <span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${ROL_BADGE[u.rol] || 'bg-secondary'}`}>
                                            {ROLS_ALL[u.rol] || u.rol}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="flex gap-2">
                                            <button onClick={() => { setEdicio({ ...u, especialitats: u.especialitats || [], maquines: u.maquines || [], disponibilitat: u.disponibilitat || '' }); setPass(''); setErrMsg(''); setOkMsg(''); }} className="rounded border border-border px-2 py-1 text-xs">Editar</button>
                                            <button onClick={() => elimina(u.id)} className="rounded border border-destructive px-2 py-1 text-xs text-destructive">
                                                <Trash2 className="h-3 w-3" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {okMsg && <p className="mt-3 rounded-md bg-[hsl(var(--ok))]/10 px-3 py-2 text-sm text-[hsl(var(--ok))]">{okMsg}</p>}
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
                <h3 className="font-display text-2xl uppercase">{edicio?.id ? 'Editar usuario' : 'Nuevo usuario'}</h3>
                {!edicio ? (
                    <p className="mt-4 text-sm text-muted-foreground">Selecciona un usuario o crea uno nuevo.</p>
                ) : (
                    <div className="mt-4 grid gap-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="grid gap-2">
                                <label className="text-sm font-semibold">Nombre *</label>
                                <input value={edicio.name} onChange={(e) => setEdicio({ ...edicio, name: e.target.value })}
                                    placeholder="Ana" className="h-11 rounded-md border border-input bg-background px-3" />
                            </div>
                            <div className="grid gap-2">
                                <label className="text-sm font-semibold">Apellido</label>
                                <input value={edicio.cognom || ''} onChange={(e) => setEdicio({ ...edicio, cognom: e.target.value })}
                                    placeholder="García" className="h-11 rounded-md border border-input bg-background px-3" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="grid gap-2">
                                <label className="text-sm font-semibold">Código * (inicio de sesión)</label>
                                <input value={edicio.codi || ''} onChange={(e) => setEdicio({ ...edicio, codi: e.target.value })}
                                    placeholder="OP01" className="h-11 rounded-md border border-input bg-background px-3 font-mono" />
                            </div>
                            <div className="grid gap-2">
                                <label className="text-sm font-semibold">Email</label>
                                <input value={edicio.email || ''} onChange={(e) => setEdicio({ ...edicio, email: e.target.value })}
                                    placeholder="(auto si vacío)" className="h-11 rounded-md border border-input bg-background px-3" />
                            </div>
                        </div>
                        <div className="grid gap-2">
                            <label className="text-sm font-semibold">Rol *</label>
                            <select value={edicio.rol || 'operari'} onChange={(e) => setEdicio({ ...edicio, rol: e.target.value })}
                                className="h-11 rounded-md border border-input bg-background px-3 text-sm">
                                {rolsDisponibles.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                            {!esSuperAdmin && (
                                <p className="text-xs text-muted-foreground">Solo Super Admin puede asignar el rol de Super Admin.</p>
                            )}
                        </div>
                        {!edicio.id && (
                            <div className="grid gap-2">
                                <label className="text-sm font-semibold">Contraseña * (mín. 8 caracteres)</label>
                                <input type="password" value={pass} onChange={(e) => setPass(e.target.value)}
                                    className="h-11 rounded-md border border-input bg-background px-3" />
                            </div>
                        )}
                        {(edicio.rol || 'operari') === 'operari' && (
                            <div className="grid gap-3 rounded-md border border-border p-3">
                                <p className="text-xs font-semibold uppercase text-muted-foreground">Perfil de operario</p>
                                <div className="grid gap-2">
                                    <label className="text-sm font-semibold">Especialidades</label>
                                    <div className="flex flex-wrap gap-2">
                                        {['Estampación', 'Confección', 'Acabados', 'Logística', 'Oficina técnica'].map((esp) => {
                                            const actiu = (edicio.especialitats || []).includes(esp);
                                            return (
                                                <button key={esp} type="button" onClick={() => toggleArr('especialitats', esp)}
                                                    className={`rounded-full border px-3 py-1 text-xs font-medium ${actiu ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background'}`}>
                                                    {esp}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="grid gap-2">
                                    <label className="text-sm font-semibold">Máquinas</label>
                                    <div className="flex flex-wrap gap-2">
                                        {['Corta', 'Fileteadora', 'Recta', 'Bordadora', 'Prensa', 'Plancha'].map((m) => {
                                            const actiu = (edicio.maquines || []).includes(m);
                                            return (
                                                <button key={m} type="button" onClick={() => toggleArr('maquines', m)}
                                                    className={`rounded-full border px-3 py-1 text-xs font-medium ${actiu ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background'}`}>
                                                    {m}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="grid gap-2">
                                    <label className="text-sm font-semibold">Disponibilidad</label>
                                    <input value={edicio.disponibilitat || ''} onChange={(e) => setEdicio({ ...edicio, disponibilitat: e.target.value })}
                                        placeholder="L-V 08:00-16:00" className="h-11 rounded-md border border-input bg-background px-3" />
                                </div>
                            </div>
                        )}
                        {errMsg && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{errMsg}</p>}
                        <div className="flex gap-2">
                            <button onClick={desa} disabled={desant}
                                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground font-semibold disabled:opacity-60">
                                <Save className="h-4 w-4" /> {edicio.id ? 'Guardar cambios' : 'Crear usuario'}
                            </button>
                            <button onClick={() => setEdicio(null)} className="h-12 rounded-md bg-secondary px-4 font-semibold">Cancelar</button>
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
};

// -------------------------------------------------------------- Trazabilidad
export const Trazabilitat = ({ registres, monos }) => {
    const [q, setQ] = useState('');
    const [operacio, setOperacio] = useState('todas');

    const operacions = useMemo(() => [...new Set(registres.map((r) => r.operacio).filter(Boolean))], [registres]);

    const files = useMemo(() => {
        const text = q.trim().toLowerCase();
        return registres.filter((r) => {
            const coincideix = !text ||
                `${r.expand?.mono?.codi} ${r.expand?.exclusiva?.exclusiva} ${r.expand?.operari?.name} ${r.expand?.operari?.codi} ${r.operacio} ${r.created}`
                    .toLowerCase().includes(text);
            return coincideix && (operacio === 'todas' || r.operacio === operacio);
        });
    }, [registres, q, operacio]);

    const exporta = () =>
        descarregaCSV('trazabilidad.csv', files.map((r) => ({
            Mono: r.expand?.mono?.codi || '', Exclusiva: r.expand?.exclusiva?.exclusiva || '',
            Operario: r.expand?.operari?.name || '', Operacion: r.operacio,
            Inicio: r.inici, Fin: r.fi, 'Tiempo real': formatSegons(r.temps_real_seg),
            'Tiempo estandar': formatSegons(r.temps_estandard_seg),
            Pausas: (r.pauses || []).map((p) => p.motiu).join(' | '),
            Incidencias: (r.incidencies || []).map((i) => i.descripcio).join(' | '),
            Retrabajo: r.retreball ? 'Sí' : 'No', 'OK confección': r.control_qualitat, Estado: r.estat,
        })));

    return (
        <section className="grid gap-6">
            <div className="rounded-lg border border-border bg-card">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
                    <h3 className="font-display text-2xl uppercase">Trazabilidad de monos</h3>
                    <div className="flex flex-wrap gap-2">
                        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mono, exclusiva, operario, fecha"
                            className="h-10 w-72 rounded-md border border-input bg-background px-3 text-sm" />
                        <select value={operacio} onChange={(e) => setOperacio(e.target.value)}
                            className="h-10 rounded-md border border-input bg-background px-2 text-sm">
                            <option value="todas">Todas las operaciones</option>
                            {operacions.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                        <button onClick={exporta} className="flex h-10 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground active:scale-95">
                            <Download className="h-4 w-4" /> Exportar
                        </button>
                    </div>
                </div>
                <div className="overflow-auto">
                    <table className="w-full min-w-[1100px] text-sm">
                        <thead className="bg-secondary text-left text-xs uppercase">
                            <tr>
                                {['Mono', 'Exclusiva', 'Operario', 'Operación', 'Inicio', 'Real', 'Estándar', 'Pausas', 'Incid.', 'Retrab.', 'OK confección'].map((h) => (
                                    <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {files.length === 0 ? (
                                <tr><td colSpan={11} className="p-8 text-center text-muted-foreground">Sin registros de actividad.</td></tr>
                            ) : files.map((r) => (
                                <tr key={r.id}>
                                    <td className="px-3 py-2 font-semibold">{r.expand?.mono?.codi}</td>
                                    <td className="px-3 py-2">{r.expand?.exclusiva?.exclusiva}</td>
                                    <td className="px-3 py-2">{r.expand?.operari?.name}</td>
                                    <td className="px-3 py-2">{r.operacio}</td>
                                    <td className="px-3 py-2">{r.inici ? new Date(r.inici).toLocaleString('es-ES') : '—'}</td>
                                    <td className="px-3 py-2 tabular-nums">{formatSegons(r.temps_real_seg)}</td>
                                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{formatSegons(r.temps_estandard_seg)}</td>
                                    <td className="px-3 py-2">{(r.pauses || []).length}</td>
                                    <td className="px-3 py-2">{(r.incidencies || []).length}</td>
                                    <td className="px-3 py-2">{r.retreball ? 'Sí' : 'No'}</td>
                                    <td className="px-3 py-2" title="OK del operario de confección (no es aprobación de Calidad)">
                                        {r.control_qualitat === 'ok'
                                            ? <span className="rounded px-2 py-0.5 text-xs font-semibold uppercase bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]">OK fase</span>
                                            : r.control_qualitat === 'ko'
                                                ? <span className="rounded px-2 py-0.5 text-xs font-semibold uppercase bg-destructive/10 text-destructive">No OK</span>
                                                : <span className="rounded px-2 py-0.5 text-xs font-semibold uppercase bg-secondary text-muted-foreground">—</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
                <h3 className="font-display text-2xl uppercase">Monos en sistema</h3>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {monos.slice(0, 60).map((m) => (
                        <div key={m.id} className="rounded border border-border p-3 text-sm">
                            <p className="font-semibold">{m.codi}</p>
                            <p className="text-xs text-muted-foreground">{m.operacio_actual || 'sin operación'}</p>
                            <div className="mt-1"><Estat v={m.estat} /></div>
                        </div>
                    ))}
                    {monos.length === 0 && <p className="text-sm text-muted-foreground">Sin monos generados.</p>}
                </div>
            </div>
        </section>
    );
};

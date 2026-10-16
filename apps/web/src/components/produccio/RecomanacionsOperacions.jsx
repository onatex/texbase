import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle, CheckCircle2, ChevronRight, Clock, Edit2, Filter, Layers, Lightbulb,
    Link2, Loader2, Plus, RotateCcw, Route as RouteIcon, Save, Search, Sparkles,
    Trash2, Wrench, X, Eye, History,
} from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/lib/auth';

/**
 * RecomanacionsOperacions — subapartado de Producción > Rutas.
 *
 * Analiza los trabajos libres registrados por los operarios (colección
 * `operaciones_libres` y, como respaldo, `registres` con tipus='lliure') y
 * agrupa posibles operaciones a partir de sus descripciones.
 *
 * Gestión completa de recomendaciones:
 *   - Abrir el detalle de cada recomendación y editar sus datos antes de
 *     convertirla en operación (descripción, nombre, código, tiempo, fase,
 *     orden, dependencia, artículos relacionados).
 *   - Guardar los cambios de la recomendación sin crear todavía una operación.
 *   - Descartar una recomendación (con confirmación): no aparece en el listado
 *     principal ni se vuelve a proponer automáticamente desde los mismos
 *     registros, pero se conserva en el apartado "Descartadas" para consultarla
 *     y restaurarla.
 *   - Restaurar una recomendación descartada (con confirmación).
 *   - Marcar como convertida al crear la operación de ruta.
 *   - Registro de edición, descarte, restauración y conversión con usuario y
 *     fecha (historial_accions), sin borrar los registros originales de trabajo
 *     libre ni la trazabilidad.
 *
 * Mantiene los filtros por artículo, referencia, periodo y texto, el recuento
 * de observaciones, el tiempo medio, la conversión a operación de ruta, la
 * advertencia de duplicados, la selección del alcance y el historial existente.
 */
export default function RecomanacionsOperacions({ rutes = [], articles = [], opsDef = [], recarrega }) {
    const { user, rol } = useAuth();
    const canEdit = ['admin', 'superadmin', 'produccio'].includes(rol);

    const [carregant, setCarregant] = useState(true);
    const [error, setError] = useState('');
    const [llibres, setLlibres] = useState([]);          // registros de trabajo libre
    const [exclusivesMap, setExclusivesMap] = useState(new Map());
    const [storeMap, setStoreMap] = useState(new Map()); // estado persistido por clave

    // Filtros
    const [filtreArticle, setFiltreArticle] = useState('');
    const [filtreReferencia, setFiltreReferencia] = useState('');
    const [filtrePeriode, setFiltrePeriode] = useState('');
    const [buscador, setBuscador] = useState('');

    // Vista: activas | descartadas | convertidas
    const [vista, setVista] = useState('activas');

    // Modales
    const [editant, setEditant] = useState(null);       // recomendación en detalle/edición
    const [convertint, setConvertint] = useState(null); // recomendación en conversión

    // ── Carga de trabajos libres ─────────────────────────────────────────────
    useEffect(() => {
        let cancelat = false;
        const carregar = async () => {
            setCarregant(true);
            setError('');
            try {
                let regs = [];
                try {
                    regs = await pb.collection('operaciones_libres').getFullList({
                        sort: '-created',
                        expand: 'exclusiva,operario',
                        requestKey: 'reco-oplibres',
                    });
                } catch (e) {
                    regs = [];
                }

                if (regs.length === 0) {
                    try {
                        regs = await pb.collection('registres').getFullList({
                            filter: 'tipus = "lliure" && estat = "finalitzat"',
                            sort: '-created',
                            expand: 'exclusiva,operari,mono',
                            requestKey: 'reco-reglliure',
                        });
                        regs = regs.map((r) => ({
                            id: r.id,
                            exclusiva: r.exclusiva,
                            descripcion: r.notes || r.operacio || '',
                            tiempo_seg: Number(r.temps_real_seg || 0),
                            fecha_inicio: r.inici,
                            fecha_fin: r.fi,
                            created: r.created,
                            _expand: r.expand,
                        }));
                    } catch (e) {
                        regs = [];
                    }
                }

                if (cancelat) return;

                const exIds = Array.from(new Set(regs.map((r) => r.exclusiva).filter(Boolean)));
                const exMap = new Map();
                regs.forEach((r) => {
                    const ex = r.expand?.exclusiva || r._expand?.exclusiva;
                    if (ex && ex.id) exMap.set(ex.id, ex);
                });
                const falten = exIds.filter((id) => !exMap.has(id));
                if (falten.length) {
                    try {
                        const exs = await pb.collection('exclusives').getFullList({
                            filter: pb.filter('id ?= {:ids}', { ids: falten }),
                            requestKey: 'reco-exclusives',
                        });
                        exs.forEach((e) => exMap.set(e.id, e));
                    } catch (e) { /* silent */ }
                }

                if (cancelat) return;
                setExclusivesMap(exMap);
                setLlibres(regs);
            } catch (e) {
                if (!cancelat) setError('No se han podido cargar los trabajos libres.');
            } finally {
                if (!cancelat) setCarregant(false);
            }
        };
        carregar();
        return () => { cancelat = true; };
    }, []);

    // ── Carga del estado persistido de recomendaciones ───────────────────────
    const carregarStore = async () => {
        try {
            const list = await pb.collection('recomanacions_operacions').getFullList({
                requestKey: 'reco-store',
            });
            const map = new Map();
            for (const r of list || []) {
                map.set(r.clau, r);
            }
            setStoreMap(map);
        } catch (e) {
            // Si la colección aún no existe (migración pendiente), silencioso
            setStoreMap(new Map());
        }
    };

    useEffect(() => { void carregarStore(); }, []);

    // ── Normalización de descripciones ──────────────────────────────────────
    const normDesc = (s) => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');

    const refPerExclusiva = useMemo(() => {
        const map = new Map();
        for (const r of llibres) {
            if (!r.exclusiva) continue;
            const ex = exclusivesMap.get(r.exclusiva);
            const ref = (ex?.referencia || '').toString().trim().toUpperCase();
            const art = (ex?.article || '').toString().trim();
            if (ref) map.set(r.exclusiva, { ref, art });
            else if (art) map.set(r.exclusiva, { ref: art, art });
        }
        return map;
    }, [llibres, exclusivesMap]);

    const regsFiltrats = useMemo(() => {
        return llibres.filter((r) => {
            const info = refPerExclusiva.get(r.exclusiva) || { ref: '', art: '' };
            if (filtreArticle && info.ref !== filtreArticle) return false;
            if (filtreReferencia) {
                const q = filtreReferencia.toLowerCase();
                if (!`${info.ref} ${info.art}`.toLowerCase().includes(q)) return false;
            }
            if (filtrePeriode) {
                const d = r.fecha_inicio || r.created || '';
                const mes = String(d).substring(0, 7);
                if (mes !== filtrePeriode) return false;
            }
            return true;
        });
    }, [llibres, refPerExclusiva, filtreArticle, filtreReferencia, filtrePeriode]);

    // ── Agrupación por descripción normalizada ───────────────────────────────
    const suggeriments = useMemo(() => {
        const map = new Map();
        for (const r of regsFiltrats) {
            const desc = (r.descripcion || '').trim();
            if (!desc) continue;
            const key = normDesc(desc);
            const info = refPerExclusiva.get(r.exclusiva) || { ref: '', art: '' };
            const e = map.get(key) || {
                key,
                descripcio: desc,
                mostres: [],
                refs: new Set(),
                arts: new Set(),
                temps: [],
            };
            e.mostres.push(r);
            if (info.ref) e.refs.add(info.ref);
            if (info.art) e.arts.add(info.art);
            e.temps.push(Number(r.tiempo_seg || 0));
            map.set(key, e);
        }
        return Array.from(map.values())
            .map((e) => ({
                ...e,
                count: e.mostres.length,
                refs: Array.from(e.refs),
                arts: Array.from(e.arts),
                tempsMitja: e.temps.length
                    ? Math.round(e.temps.reduce((a, b) => a + b, 0) / e.temps.length)
                    : 0,
                tempsMin: e.temps.length
                    ? Math.round(e.temps.reduce((a, b) => a + b, 0) / e.temps.length / 60 * 10) / 10
                    : 0,
            }))
            .sort((a, b) => b.count - a.count);
    }, [regsFiltrats, refPerExclusiva]);

    // ── Campos editados desde el store ───────────────────────────────────────
    const editedFields = (st) => {
        if (!st) return {};
        const o = {};
        if (st.descripcio) o.descripcio = st.descripcio;
        if (st.nom) o.nom = st.nom;
        if (st.codi) o.codi = st.codi;
        if (st.temps_std_min != null && st.temps_std_min !== '') o.temps_std_min = Number(st.temps_std_min);
        if (st.fase) o.fase = st.fase;
        if (st.ordre != null && st.ordre !== '') o.ordre = Number(st.ordre);
        if (st.op_anterior) o.op_anterior = st.op_anterior;
        if (Array.isArray(st.articles_relacionats) && st.articles_relacionats.length) o.refs = st.articles_relacionats;
        return o;
    };

    // ── Merge: activas / descartadas / convertidas ───────────────────────────
    const merged = useMemo(() => {
        const activas = [];
        const descartades = [];
        const convertides = [];
        const seen = new Set();

        for (const s of suggeriments) {
            seen.add(s.key);
            const st = storeMap.get(s.key);
            if (st && st.estat === 'descartada') {
                descartades.push({ ...s, ...editedFields(st), storeId: st.id, estat: 'descartada', store: st });
            } else if (st && st.estat === 'convertida') {
                convertides.push({ ...s, ...editedFields(st), storeId: st.id, estat: 'convertida', store: st });
            } else {
                activas.push({ ...s, ...editedFields(st), storeId: st?.id, estat: 'activa', store: st || null });
            }
        }

        // Recomendaciones persistidas sin registros actuales (registros borrados)
        for (const st of storeMap.values()) {
            if (seen.has(st.clau)) continue;
            const obj = {
                key: st.clau,
                descripcio: st.descripcio || st.clau,
                nom: st.nom || '',
                codi: st.codi || '',
                temps_std_min: st.temps_std_min != null ? Number(st.temps_std_min) : 0,
                fase: st.fase || '',
                ordre: st.ordre != null ? Number(st.ordre) : 0,
                op_anterior: st.op_anterior || '',
                refs: Array.isArray(st.articles_relacionats) ? st.articles_relacionats : [],
                arts: [],
                count: 0,
                tempsMitja: 0,
                tempsMin: 0,
                storeId: st.id,
                estat: st.estat,
                store: st,
                _storeOnly: true,
            };
            if (st.estat === 'descartada') descartades.push(obj);
            else if (st.estat === 'convertida') convertides.push(obj);
            else activas.push(obj);
        }

        return { activas, descartades, convertides };
    }, [suggeriments, storeMap]);

    // ── Filtro final por texto y artículo (aplica a todas las vistas) ────────
    const filtrarLlista = (llista) => {
        const q = buscador.trim().toLowerCase();
        return llista.filter((s) => {
            if (filtreArticle) {
                const refs = s.refs || [];
                if (!refs.includes(filtreArticle)) return false;
            }
            if (q) {
                const txt = `${s.descripcio || ''} ${s.nom || ''} ${s.codi || ''} ${(s.refs || []).join(' ')} ${(s.arts || []).join(' ')}`.toLowerCase();
                if (!txt.includes(q)) return false;
            }
            return true;
        });
    };

    const llistaVista = useMemo(() => {
        if (vista === 'descartadas') return filtrarLlista(merged.descartades);
        if (vista === 'convertidas') return filtrarLlista(merged.convertides);
        return filtrarLlista(merged.activas);
    }, [vista, merged, buscador, filtreArticle]);

    const refsDisponibles = useMemo(() => {
        const set = new Set();
        for (const r of llibres) {
            const info = refPerExclusiva.get(r.exclusiva);
            if (info?.ref) set.add(info.ref);
        }
        for (const st of storeMap.values()) {
            if (Array.isArray(st.articles_relacionats)) st.articles_relacionats.forEach((x) => set.add(x));
        }
        return Array.from(set).sort();
    }, [llibres, refPerExclusiva, storeMap]);

    const periodesDisponibles = useMemo(() => {
        const set = new Set();
        for (const r of llibres) {
            const d = r.fecha_inicio || r.created || '';
            const mes = String(d).substring(0, 7);
            if (/^\d{4}-\d{2}$/.test(mes)) set.add(mes);
        }
        return Array.from(set).sort().reverse();
    }, [llibres]);

    const netejarFiltres = () => {
        setFiltreArticle(''); setFiltreReferencia(''); setFiltrePeriode(''); setBuscador('');
    };

    const hiHaFiltres = filtreArticle || filtreReferencia || filtrePeriode || buscador;

    // ── Acciones persistentes ─────────────────────────────────────────────────
    const upsertRecomanacio = async (clau, canvis, accio) => {
        const existing = storeMap.get(clau);
        let historial = [];
        if (existing) {
            const raw = existing.historial_accions;
            historial = Array.isArray(raw) ? JSON.parse(JSON.stringify(raw)) : [];
        }
        historial.push({
            accio,
            usuario_id: user?.id || null,
            usuario_nom: user?.name || user?.email || '',
            data: new Date().toISOString(),
        });
        const payload = {
            ...canvis,
            clau,
            historial_accions: historial,
            usuario_id: user?.id || null,
            fecha_ultima_accion: new Date().toISOString(),
        };
        if (existing) {
            await pb.collection('recomanacions_operacions').update(existing.id, payload, { requestKey: `reco-upd-${existing.id}` });
        } else {
            await pb.collection('recomanacions_operacions').create({ estat: 'activa', ...payload }, { requestKey: `reco-new-${clau.slice(0, 20)}` });
        }
        await carregarStore();
    };

    const guardarCanvis = async (s, formData) => {
        await upsertRecomanacio(s.key, {
            descripcio: formData.descripcio.trim(),
            nom: formData.nom.trim(),
            codi: (formData.codi || '').trim().toUpperCase(),
            temps_std_min: Number(formData.temps_std_min) || 0,
            fase: (formData.fase || '').trim(),
            ordre: Number(formData.ordre) || 0,
            op_anterior: formData.op_anterior || '',
            articles_relacionats: formData.articles_relacionats || [],
            estat: s.estat === 'descartada' ? 'descartada' : 'activa',
        }, 'editada');
    };

    const descartar = async (s) => {
        await upsertRecomanacio(s.key, {
            descripcio: s.descripcio,
            nom: s.nom || '',
            codi: s.codi || '',
            temps_std_min: s.temps_std_min ?? 0,
            fase: s.fase || '',
            ordre: s.ordre ?? 0,
            op_anterior: s.op_anterior || '',
            articles_relacionats: s.refs || [],
            estat: 'descartada',
        }, 'descartada');
    };

    const restaurar = async (s) => {
        await upsertRecomanacio(s.key, {
            descripcio: s.descripcio,
            nom: s.nom || '',
            codi: s.codi || '',
            temps_std_min: s.temps_std_min ?? 0,
            fase: s.fase || '',
            ordre: s.ordre ?? 0,
            op_anterior: s.op_anterior || '',
            articles_relacionats: s.refs || [],
            estat: 'activa',
        }, 'restaurada');
    };

    const marcarConvertida = async (s) => {
        await upsertRecomanacio(s.key, {
            descripcio: s.descripcio,
            nom: s.nom || '',
            codi: s.codi || '',
            temps_std_min: s.temps_std_min ?? 0,
            fase: s.fase || '',
            ordre: s.ordre ?? 0,
            op_anterior: s.op_anterior || '',
            articles_relacionats: s.refs || [],
            estat: 'convertida',
        }, 'convertida');
    };

    const comptes = {
        activas: merged.activas.length,
        descartadas: merged.descartades.length,
        convertidas: merged.convertides.length,
    };

    return (
        <section className="rounded-lg border border-border bg-card">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
                <div className="flex items-center gap-2">
                    <Lightbulb className="h-5 w-5 text-[hsl(var(--accent))]" />
                    <h3 className="font-display text-2xl uppercase">Recomendaciones de operaciones</h3>
                </div>
                <span className="text-xs text-muted-foreground">
                    {comptes.activas} activa(s) · {comptes.descartadas} descartada(s) · {comptes.convertidas} convertida(s)
                </span>
            </div>

            {/* Conmutador de vista */}
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-secondary/30 p-3">
                <div className="flex rounded-md border border-border overflow-hidden">
                    {[
                        { id: 'activas', label: 'Activas', n: comptes.activas },
                        { id: 'descartadas', label: 'Descartadas', n: comptes.descartadas },
                        { id: 'convertidas', label: 'Convertidas', n: comptes.convertidas },
                    ].map((v) => (
                        <button key={v.id} onClick={() => setVista(v.id)}
                            className={`flex items-center gap-1.5 px-3 h-9 text-xs font-semibold transition ${vista === v.id ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-secondary'}`}>
                            {v.label} <span className={`rounded px-1 ${vista === v.id ? 'bg-white/20' : 'bg-secondary'}`}>{v.n}</span>
                        </button>
                    ))}
                </div>

                {/* Filtros */}
                <div className="flex flex-wrap items-center gap-2 ml-auto">
                    <div className="flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground">
                        <Filter className="h-4 w-4" />
                    </div>
                    <select value={filtreArticle} onChange={(e) => setFiltreArticle(e.target.value)}
                        className="h-9 rounded-md border border-input bg-background px-2 text-xs">
                        <option value="">Todos los artículos</option>
                        {refsDisponibles.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <input value={filtreReferencia} onChange={(e) => setFiltreReferencia(e.target.value)}
                        placeholder="Referencia o artículo..."
                        className="h-9 w-40 rounded-md border border-input bg-background px-3 text-xs" />
                    <select value={filtrePeriode} onChange={(e) => setFiltrePeriode(e.target.value)}
                        className="h-9 rounded-md border border-input bg-background px-2 text-xs">
                        <option value="">Todos los periodos</option>
                        {periodesDisponibles.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <input value={buscador} onChange={(e) => setBuscador(e.target.value)}
                            placeholder="Buscar..."
                            className="h-9 w-44 rounded-md border border-input bg-background pl-8 pr-3 text-xs" />
                    </div>
                    {hiHaFiltres && (
                        <button onClick={netejarFiltres}
                            className="flex h-9 items-center gap-1 rounded-md border border-border px-3 text-xs font-semibold hover:bg-secondary">
                            <X className="h-3.5 w-3.5" /> Limpiar
                        </button>
                    )}
                </div>
            </div>

            {error && <p className="mx-4 mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

            {/* Contenido */}
            {carregant ? (
                <div className="p-8 text-center">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                    <p className="mt-3 text-sm text-muted-foreground">Analizando trabajos libres…</p>
                </div>
            ) : llistaVista.length === 0 ? (
                <div className="p-10 text-center">
                    {vista === 'activas' ? <Sparkles className="mx-auto h-10 w-10 text-muted-foreground opacity-40" />
                        : vista === 'descartadas' ? <Trash2 className="mx-auto h-10 w-10 text-muted-foreground opacity-40" />
                        : <CheckCircle2 className="mx-auto h-10 w-10 text-muted-foreground opacity-40" />}
                    <p className="mt-3 font-display text-xl uppercase text-muted-foreground">
                        {vista === 'activas'
                            ? (llibres.length === 0 ? 'Aún no hay trabajos libres registrados' : 'Sin recomendaciones con los filtros actuales')
                            : vista === 'descartadas' ? 'No hay recomendaciones descartadas' : 'No hay recomendaciones convertidas'}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {vista === 'activas' && llibres.length === 0
                            ? 'Cuando los operarios registren trabajo libre con descripción, aparecerán aquí posibles operaciones.'
                            : vista === 'descartadas'
                                ? 'Las recomendaciones que descartes se conservarán aquí para poder restaurarlas.'
                                : 'Las recomendaciones convertidas en operación de ruta se listan aquí.'}
                    </p>
                </div>
            ) : (
                <div className="divide-y divide-border">
                    {llistaVista.map((s) => (
                        <SuggerimentRow
                            key={s.key + (s.storeId || '')}
                            suggeriment={s}
                            opsDef={opsDef}
                            vista={vista}
                            canEdit={canEdit}
                            onDetall={() => setEditant(s)}
                            onConvertir={() => setConvertint(s)}
                            onDescartar={() => {
                                if (!confirm(`¿Descartar la recomendación «${s.descripcio}»?\n\nDejará de aparecer en el listado principal y no se volverá a proponer automáticamente. Podrás consultarla y restaurarla en el apartado «Descartadas».`)) return;
                                void descartar(s);
                            }}
                            onRestaurar={() => {
                                if (!confirm(`¿Restaurar la recomendación «${s.descripcio}»?\n\nVolverá a aparecer en el listado principal.`)) return;
                                void restaurar(s);
                            }}
                        />
                    ))}
                </div>
            )}

            {/* Modal de detalle / edición */}
            {editant && (
                <EditarRecomanacioModal
                    suggeriment={editant}
                    canEdit={canEdit}
                    vista={vista}
                    onClose={() => setEditant(null)}
                    onGuardar={async (formData) => { await guardarCanvis(editant, formData); setEditant(null); }}
                    onDescartar={async () => { await descartar(editant); setEditant(null); }}
                    onRestaurar={async () => { await restaurar(editant); setEditant(null); }}
                    onConvertir={() => { setEditant(null); setConvertint(editant); }}
                />
            )}

            {/* Modal de conversión */}
            {convertint && (
                <ConvertirOperacioModal
                    suggeriment={convertint}
                    rutes={rutes}
                    articles={articles}
                    opsDef={opsDef}
                    user={user}
                    onClose={() => setConvertint(null)}
                    onSaved={() => { setConvertint(null); recarrega && recarrega(); }}
                    onConverted={() => { void marcarConvertida(convertint); }}
                />
            )}
        </section>
    );
}

// ── Fila de sugerencia ──────────────────────────────────────────────────────
function SuggerimentRow({ suggeriment, opsDef, vista, canEdit, onDetall, onConvertir, onDescartar, onRestaurar }) {
    const { descripcio, count, refs, arts, tempsMitja, tempsMin, nom, codi, estat, _storeOnly } = suggeriment;

    const norm = (s) => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');
    const coincidencia = useMemo(() => {
        const d = norm(descripcio);
        if (!d) return null;
        return opsDef.find((o) =>
            norm(o.nom) === d || norm(o.descripcio) === d ||
            norm(o.nom).includes(d) || d.includes(norm(o.nom))
        ) || null;
    }, [descripcio, opsDef]);

    const editat = !!(nom || codi);

    return (
        <div className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <Sparkles className="h-4 w-4 text-[hsl(var(--accent))] shrink-0" />
                        <p className="font-semibold text-base">{descripcio}</p>
                        {editat && (
                            <span className="flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">
                                <Edit2 className="h-3 w-3" /> editada
                            </span>
                        )}
                        {coincidencia && (
                            <span className="flex items-center gap-1 rounded bg-[hsl(var(--warn))]/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-[hsl(var(--warn))]">
                                <AlertTriangle className="h-3 w-3" /> coincide con «{coincidencia.codi || coincidencia.nom}»
                            </span>
                        )}
                        {estat === 'convertida' && (
                            <span className="flex items-center gap-1 rounded bg-[hsl(var(--ok))]/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-[hsl(var(--ok))]">
                                <CheckCircle2 className="h-3 w-3" /> convertida
                            </span>
                        )}
                        {_storeOnly && (
                            <span className="rounded bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">sin registros</span>
                        )}
                    </div>

                    {(nom || codi) && (
                        <p className="mt-1 text-xs text-muted-foreground">
                            {codi && <span className="font-mono font-semibold text-foreground">{codi}</span>}
                            {codi && nom && ' · '}
                            {nom && <span>{nom}</span>}
                        </p>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            <strong className="text-foreground">{count}×</strong> observada
                        </span>
                        {tempsMitja > 0 && (
                            <span className="flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5" />
                                tiempo medio <strong className="text-foreground">{formatSegons(tempsMitja)}</strong>
                                {tempsMin > 0 && <span className="text-muted-foreground">(~{tempsMin} min)</span>}
                            </span>
                        )}
                    </div>
                    {(refs.length > 0 || arts.length > 0) && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {refs.map((r) => (
                                <span key={r} className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 py-0.5 text-xs font-mono text-primary">
                                    <Link2 className="h-3 w-3" />{r}
                                </span>
                            ))}
                            {arts.filter((a) => !refs.includes(a)).slice(0, 4).map((a) => (
                                <span key={a} className="rounded-md bg-secondary px-2 py-0.5 text-xs text-muted-foreground">{a}</span>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                    <button onClick={onDetall}
                        className="flex items-center gap-1.5 rounded-md border border-border px-3 h-9 text-xs font-semibold hover:bg-secondary active:scale-95">
                        <Eye className="h-3.5 w-3.5" /> Detalle
                    </button>
                    {vista === 'activas' && canEdit && (
                        <button onClick={onConvertir}
                            className="flex items-center gap-1.5 rounded-md bg-[hsl(var(--accent))] px-3 h-9 text-xs font-semibold text-[hsl(var(--accent-foreground))] active:scale-95">
                            <Plus className="h-3.5 w-3.5" /> Convertir
                        </button>
                    )}
                    {vista === 'activas' && canEdit && (
                        <button onClick={onDescartar}
                            className="flex items-center gap-1.5 rounded-md border border-destructive px-3 h-9 text-xs font-semibold text-destructive hover:bg-destructive/10 active:scale-95">
                            <Trash2 className="h-3.5 w-3.5" /> Descartar
                        </button>
                    )}
                    {vista === 'descartadas' && canEdit && (
                        <button onClick={onRestaurar}
                            className="flex items-center gap-1.5 rounded-md border border-primary px-3 h-9 text-xs font-semibold text-primary hover:bg-primary/10 active:scale-95">
                            <RotateCcw className="h-3.5 w-3.5" /> Restaurar
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Modal de detalle / edición de una recomendación ─────────────────────────
function EditarRecomanacioModal({ suggeriment, canEdit, vista, onClose, onGuardar, onDescartar, onRestaurar, onConvertir }) {
    const { descripcio, nom, codi, temps_std_min, fase, ordre, op_anterior, refs, arts, count, tempsMitja, tempsMin, estat, store } = suggeriment;

    const [form, setForm] = useState({
        descripcio: descripcio || '',
        nom: nom || (descripcio || '').slice(0, 120),
        codi: codi || '',
        temps_std_min: temps_std_min != null ? temps_std_min : (tempsMin > 0 ? tempsMin : 0),
        fase: fase || '',
        ordre: ordre || '',
        op_anterior: op_anterior || '',
        articles_relacionats: (refs || []).join(', '),
    });
    const [aplicant, setAplicant] = useState(false);
    const [error, setError] = useState('');

    const setCampo = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    const historial = useMemo(() => {
        const raw = store?.historial_accions;
        if (!Array.isArray(raw) || !raw.length) return [];
        return raw.slice().reverse();
    }, [store]);

    const guardar = async () => {
        setError('');
        if (!form.descripcio.trim()) { setError('La descripción no puede quedar vacía.'); return; }
        setAplicant(true);
        try {
            const artsArr = form.articles_relacionats
                .split(',').map((x) => x.trim()).filter(Boolean);
            await onGuardar({
                descripcio: form.descripcio,
                nom: form.nom,
                codi: form.codi,
                temps_std_min: form.temps_std_min,
                fase: form.fase,
                ordre: form.ordre,
                op_anterior: form.op_anterior,
                articles_relacionats: artsArr,
            });
        } catch (e) {
            console.error('Error guardando recomendación', e);
            setError('No se han podido guardar los cambios. Revisa los permisos.');
            setAplicant(false);
        }
    };

    const descartar = async () => {
        if (!confirm(`¿Descartar la recomendación «${form.descripcio}»?\n\nDejará de aparecer en el listado principal y no se volverá a proponer automáticamente. Podrás consultarla y restaurarla en «Descartadas».`)) return;
        setAplicant(true);
        try { await onDescartar(); } catch (e) { setError('No se ha podido descartar.'); setAplicant(false); }
    };

    const restaurar = async () => {
        if (!confirm(`¿Restaurar la recomendación «${form.descripcio}»?\n\nVolverá a aparecer en el listado principal.`)) return;
        setAplicant(true);
        try { await onRestaurar(); } catch (e) { setError('No se ha podido restaurar.'); setAplicant(false); }
    };

    const readOnly = !canEdit || estat === 'convertida';

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div className="modal-card w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-card px-5 py-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--accent))]/15 text-[hsl(var(--accent))]">
                            <Lightbulb className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <p className="font-display text-xl uppercase truncate">Detalle de recomendación</p>
                            <p className="text-xs text-muted-foreground truncate">
                                {count}× observada · tiempo medio {formatSegons(tempsMitja)}{tempsMin > 0 ? ` (~${tempsMin} min)` : ''}
                                {estat === 'descartada' && ' · descartada'}
                                {estat === 'convertida' && ' · convertida'}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="rounded-md p-2 hover:bg-secondary shrink-0" aria-label="Cerrar">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {/* Datos observados (solo lectura) */}
                    <div className="rounded-lg bg-secondary/40 p-3 text-xs text-muted-foreground">
                        <p className="font-semibold text-foreground mb-1">Datos observados</p>
                        <p>{count} registros de trabajo libre · tiempo medio {formatSegons(tempsMitja)}{tempsMin > 0 ? ` (~${tempsMin} min)` : ''}</p>
                        {(refs.length > 0 || arts.length > 0) && (
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {refs.map((r) => (
                                    <span key={r} className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 py-0.5 text-xs font-mono text-primary">
                                        <Link2 className="h-3 w-3" />{r}
                                    </span>
                                ))}
                                {arts.filter((a) => !refs.includes(a)).slice(0, 4).map((a) => (
                                    <span key={a} className="rounded-md bg-background px-2 py-0.5 text-xs">{a}</span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Campos editables */}
                    <div>
                        <label className="text-xs font-semibold uppercase text-muted-foreground">Descripción *</label>
                        <textarea value={form.descripcio} onChange={(e) => setCampo('descripcio', e.target.value)} rows={2} disabled={readOnly}
                            className="mt-1 w-full rounded-md border border-input bg-background p-3 text-sm disabled:opacity-60" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-semibold uppercase text-muted-foreground">Código sugerido</label>
                            <input value={form.codi} onChange={(e) => setCampo('codi', e.target.value.toUpperCase())} disabled={readOnly}
                                placeholder="Ej. OP-99"
                                className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm font-mono disabled:opacity-60" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold uppercase text-muted-foreground">Tiempo estándar (min)</label>
                            <input type="number" min="0" step="0.5" value={form.temps_std_min}
                                onChange={(e) => setCampo('temps_std_min', parseFloat(e.target.value) || 0)} disabled={readOnly}
                                className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm tabular-nums disabled:opacity-60" />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-semibold uppercase text-muted-foreground">Nombre sugerido</label>
                        <input value={form.nom} onChange={(e) => setCampo('nom', e.target.value)} disabled={readOnly}
                            className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-semibold uppercase text-muted-foreground">Fase</label>
                            <input value={form.fase} onChange={(e) => setCampo('fase', e.target.value)} disabled={readOnly}
                                placeholder="Fase 1, …"
                                className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60" />
                        </div>
                        <div>
                            <label className="text-xs font-semibold uppercase text-muted-foreground">Posición (orden)</label>
                            <input type="number" min="1" value={form.ordre}
                                onChange={(e) => setCampo('ordre', e.target.value)} disabled={readOnly}
                                className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm tabular-nums disabled:opacity-60" />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-semibold uppercase text-muted-foreground">Artículos relacionados (separados por comas)</label>
                        <input value={form.articles_relacionats} onChange={(e) => setCampo('articles_relacionats', e.target.value)} disabled={readOnly}
                            placeholder="Ej. R82-020, R84-054"
                            className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm font-mono disabled:opacity-60" />
                    </div>

                    {/* Historial de acciones */}
                    {historial.length > 0 && (
                        <div className="rounded-lg border border-border p-3">
                            <p className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5 mb-2">
                                <History className="h-3.5 w-3.5" /> Historial de acciones
                            </p>
                            <ul className="space-y-1 max-h-32 overflow-y-auto">
                                {historial.map((h, i) => (
                                    <li key={i} className="text-xs text-muted-foreground flex items-center gap-2">
                                        <span className={`rounded px-1.5 py-0.5 font-semibold uppercase ${accioColor(h.accio)}`}>{h.accio}</span>
                                        <span className="text-foreground">{h.usuario_nom || '—'}</span>
                                        <span>· {formatData(h.data)}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

                    {/* Acciones */}
                    <div className="flex flex-wrap gap-2 pt-1">
                        {canEdit && estat !== 'convertida' && (
                            <button onClick={guardar} disabled={aplicant}
                                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60 active:scale-95">
                                {aplicant ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                Guardar cambios
                            </button>
                        )}
                        {canEdit && estat === 'activa' && (
                            <button onClick={descartar} disabled={aplicant}
                                className="flex h-12 items-center justify-center gap-2 rounded-md border border-destructive px-4 text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-60 active:scale-95">
                                <Trash2 className="h-4 w-4" /> Descartar
                            </button>
                        )}
                        {canEdit && estat === 'descartada' && (
                            <button onClick={restaurar} disabled={aplicant}
                                className="flex h-12 items-center justify-center gap-2 rounded-md border border-primary px-4 text-sm font-semibold text-primary hover:bg-primary/10 disabled:opacity-60 active:scale-95">
                                <RotateCcw className="h-4 w-4" /> Restaurar
                            </button>
                        )}
                        {canEdit && estat === 'activa' && (
                            <button onClick={onConvertir} disabled={aplicant}
                                className="flex h-12 items-center justify-center gap-2 rounded-md bg-[hsl(var(--accent))] px-4 text-sm font-semibold text-[hsl(var(--accent-foreground))] disabled:opacity-60 active:scale-95">
                                <Plus className="h-4 w-4" /> Convertir en operación
                            </button>
                        )}
                        <button onClick={onClose} disabled={aplicant}
                            className="h-12 rounded-md bg-secondary px-5 text-sm font-semibold disabled:opacity-60">Cerrar</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function accioColor(accio) {
    switch (accio) {
        case 'editada': return 'bg-primary/10 text-primary';
        case 'descartada': return 'bg-destructive/10 text-destructive';
        case 'restaurada': return 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]';
        case 'convertida': return 'bg-[hsl(var(--accent))]/15 text-[hsl(var(--accent))]';
        default: return 'bg-secondary text-muted-foreground';
    }
}

// ── Modal de conversión a operación de ruta ─────────────────────────────────
function ConvertirOperacioModal({ suggeriment, rutes, articles, opsDef, user, onClose, onSaved, onConverted }) {
    const { descripcio, tempsMin, refs, arts, nom, codi, fase, ordre, op_anterior, temps_std_min } = suggeriment;

    const [form, setForm] = useState({
        codi: codi || '',
        nom: nom || descripcio.slice(0, 120),
        descripcio: descripcio,
        temps_std_min: temps_std_min != null ? temps_std_min : (tempsMin > 0 ? tempsMin : 0),
        fase: fase || '',
        ordre: ordre || '',
        op_anterior: op_anterior || '',
    });

    const [alcance, setAlcance] = useState('articulo');
    const [rutaCompartidaId, setRutaCompartidaId] = useState('');
    const [novaRutaNom, setNovaRutaNom] = useState('');
    const [exclusivaSelId, setExclusivaSelId] = useState('');
    const [exclusivesCarregant, setExclusivesCarregant] = useState(false);
    const [exclusivesLlista, setExclusivesLlista] = useState([]);

    const [aplicant, setAplicant] = useState(false);
    const [error, setError] = useState('');
    const [resumen, setResumen] = useState(null);

    const articleDetectat = useMemo(() => {
        const ref = (refs[0] || '').toUpperCase().trim();
        if (!ref) return null;
        return articles.find((a) => (a.referencia || '').toString().toUpperCase().trim() === ref) || null;
    }, [refs, articles]);

    const rutaArticle = useMemo(() => {
        if (!articleDetectat?.ruta) return null;
        return rutes.find((r) => r.id === articleDetectat.ruta) || null;
    }, [articleDetectat, rutes]);

    const rutaDestiId = useMemo(() => {
        if (alcance === 'articulo') return rutaArticle?.id || '';
        if (alcance === 'ruta_compartida') return rutaCompartidaId || '';
        return '';
    }, [alcance, rutaArticle, rutaCompartidaId]);

    const opsRutaDesti = useMemo(() => {
        if (!rutaDestiId) return [];
        return opsDef.filter((o) => o.ruta === rutaDestiId)
            .slice().sort((a, b) => (Number(a.ordre) || 0) - (Number(b.ordre) || 0));
    }, [opsDef, rutaDestiId]);

    const fasesConocidas = useMemo(
        () => Array.from(new Set(opsRutaDesti.map((o) => o.fase).filter(Boolean))).sort(),
        [opsRutaDesti]
    );

    const ordreSugerit = useMemo(() => {
        if (!opsRutaDesti.length) return 1;
        return Math.max(...opsRutaDesti.map((o) => Number(o.ordre) || 0)) + 1;
    }, [opsRutaDesti]);

    const duplicat = useMemo(() => {
        const codi = form.codi.trim().toUpperCase();
        const nom = form.nom.trim().toLowerCase();
        if (!codi && !nom) return null;
        return opsRutaDesti.find((o) =>
            (codi && (o.codi || '').toUpperCase() === codi) ||
            (nom && (o.nom || '').trim().toLowerCase() === nom)
        ) || null;
    }, [form.codi, form.nom, opsRutaDesti]);

    useEffect(() => {
        if (alcance !== 'exclusiva') return;
        let cancelat = false;
        setExclusivesCarregant(true);
        const ref = (refs[0] || '').toUpperCase().trim();
        const filter = ref
            ? pb.filter('referencia = {:ref} || article = {:art}', { ref, art: arts[0] || ref })
            : '';
        pb.collection('exclusives').getFullList({
            filter: filter || '',
            sort: '-created',
            requestKey: 'reco-excl-conv',
        }).then((list) => {
            if (!cancelat) setExclusivesLlista(list || []);
        }).catch(() => {
            if (!cancelat) setExclusivesLlista([]);
        }).finally(() => {
            if (!cancelat) setExclusivesCarregant(false);
        });
        return () => { cancelat = true; };
    }, [alcance, refs, arts]);

    const setCampo = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    const crearOperacio = async () => {
        setError('');
        const codi = form.codi.trim().toUpperCase();
        const nom = form.nom.trim();
        if (!codi) { setError('Indica un código de operación.'); return; }
        if (!nom) { setError('Indica un nombre de operación.'); return; }

        const confirmMsg = duplicat
            ? `Ya existe una operación parecida («${duplicat.codi || duplicat.nom}») en el destino.\n\n¿Crear de todas formas?`
            : '¿Crear la operación y aplicarla según el alcance seleccionado?';
        if (!confirm(confirmMsg)) return;

        setAplicant(true);
        try {
            const ahora = new Date().toISOString();
            const payload = {
                codi, nom,
                fase: form.fase.trim() || '',
                fase_ordre: 0,
                ordre: Number(form.ordre) || ordreSugerit,
                descripcio: form.descripcio.trim(),
                instruccions: '',
                peca_zona: '',
                maquina: '',
                especialitat: '',
                temps_std_min: Number(form.temps_std_min) || 0,
                temps_prep_min: 0,
                unitats_lot: 0,
                op_anterior: form.op_anterior || '',
                op_seguent: '',
                paralel: false,
                te_control_qualitat: false,
                defectes_frequents: '',
                actiu: true,
            };

            let rutaFinalId = '';
            let rutaFinalNom = '';
            let exclusivaFinalId = null;
            let descripcioAlcance = '';

            if (alcance === 'articulo') {
                if (!articleDetectat) {
                    setError('No se ha podido identificar el artículo. Usa otra opción de alcance.');
                    setAplicant(false);
                    return;
                }
                if (rutaArticle) {
                    rutaFinalId = rutaArticle.id;
                    rutaFinalNom = rutaArticle.nom;
                    payload.ruta = rutaFinalId;
                    await pb.collection('operacions_def').create(payload, { requestKey: 'reco-op-art' });
                    const opsJson = (rutaArticle.operacions || []).map((o) => ({
                        nom: o.nom, temps_estandard_min: Number(o.temps_estandard_min || 0) || 0,
                    })).concat([{ nom, temps_estandard_min: Number(form.temps_std_min) || 0 }]);
                    await pb.collection('rutes').update(rutaFinalId, { operacions: opsJson }, { requestKey: 'reco-ruta-json' }).catch(() => {});
                    const totalMin = opsRutaDesti.reduce((a, o) => a + (Number(o.temps_std_min) || 0), 0) + (Number(form.temps_std_min) || 0);
                    await pb.collection('articles').update(articleDetectat.id, { temps_estandard_total_min: totalMin }, { requestKey: 'reco-art-total' }).catch(() => {});
                } else {
                    rutaFinalNom = `Ruta ${articleDetectat.referencia || articleDetectat.nom || 'artículo'}`;
                    const novaRuta = await pb.collection('rutes').create({
                        nom: rutaFinalNom,
                        article: articleDetectat.referencia || articleDetectat.nom || '',
                        per_defecte: false,
                        operacions: [{ nom, temps_estandard_min: Number(form.temps_std_min) || 0 }],
                        estat_ruta: 'activa',
                    }, { requestKey: 'reco-ruta-new' });
                    rutaFinalId = novaRuta.id;
                    payload.ruta = rutaFinalId;
                    await pb.collection('operacions_def').create(payload, { requestKey: 'reco-op-art-new' });
                    await pb.collection('articles').update(articleDetectat.id, {
                        ruta: rutaFinalId,
                        temps_estandard_total_min: Number(form.temps_std_min) || 0,
                    }, { requestKey: 'reco-art-asig' }).catch(() => {});
                }
                descripcioAlcance = `Operación convertida de trabajo libre y añadida a la ruta del artículo ${articleDetectat.referencia || articleDetectat.nom} para futuras exclusivas. No se modifican exclusivas existentes.`;
            } else if (alcance === 'ruta_compartida') {
                if (rutaCompartidaId) {
                    const ruta = rutes.find((r) => r.id === rutaCompartidaId);
                    rutaFinalId = rutaCompartidaId;
                    rutaFinalNom = ruta?.nom || 'Ruta compartida';
                    payload.ruta = rutaFinalId;
                    await pb.collection('operacions_def').create(payload, { requestKey: 'reco-op-comp' });
                    const opsJson = (ruta?.operacions || []).map((o) => ({
                        nom: o.nom, temps_estandard_min: Number(o.temps_estandard_min || 0) || 0,
                    })).concat([{ nom, temps_estandard_min: Number(form.temps_std_min) || 0 }]);
                    await pb.collection('rutes').update(rutaFinalId, { operacions: opsJson }, { requestKey: 'reco-comp-json' }).catch(() => {});
                } else {
                    const nomRuta = novaRutaNom.trim() || `Ruta compartida · ${codi}`;
                    if (!nomRuta) { setError('Indica un nombre para la nueva ruta compartida.'); setAplicant(false); return; }
                    const novaRuta = await pb.collection('rutes').create({
                        nom: nomRuta, article: '', per_defecte: false,
                        operacions: [{ nom, temps_estandard_min: Number(form.temps_std_min) || 0 }],
                        estat_ruta: 'activa',
                        notas: 'Ruta compartida creada desde recomendaciones de trabajo libre.',
                    }, { requestKey: 'reco-ruta-comp-new' });
                    rutaFinalId = novaRuta.id;
                    rutaFinalNom = nomRuta;
                    payload.ruta = rutaFinalId;
                    await pb.collection('operacions_def').create(payload, { requestKey: 'reco-op-comp-new' });
                }
                descripcioAlcance = `Operación convertida de trabajo libre y añadida a una ruta compartida «${rutaFinalNom}» aplicable a varios artículos. Asigna la ruta a los artículos desde la gestión de rutas.`;
            } else if (alcance === 'exclusiva') {
                if (!exclusivaSelId) { setError('Selecciona una exclusiva concreta.'); setAplicant(false); return; }
                exclusivaFinalId = exclusivaSelId;
                const excl = exclusivesLlista.find((e) => e.id === exclusivaSelId);
                const rutaExclId = excl?.ruta || '';
                let rutaExcl = null;
                let opsExcl = [];
                if (rutaExclId) {
                    rutaExcl = await pb.collection('rutes').getOne(rutaExclId, { requestKey: 'reco-excl-ruta' }).catch(() => null);
                    opsExcl = await pb.collection('operacions_def').getFullList({
                        filter: `ruta = "${rutaExclId}"`, sort: 'ordre', requestKey: 'reco-excl-ops',
                    }).catch(() => []);
                }
                const otrasExcl = rutaExclId
                    ? await pb.collection('exclusives').getFullList({
                        filter: `ruta = "${rutaExclId}" && id != "${exclusivaSelId}"`,
                        requestKey: 'reco-excl-otras',
                    }).catch(() => [])
                    : [];
                const esRutaArticulo = !!articleDetectat && articleDetectat.ruta === rutaExclId;
                const compartida = otrasExcl.length > 0 || esRutaArticulo;

                if (!rutaExclId) {
                    const nomRuta = `Ruta ${excl?.exclusiva || ''}${excl?.article ? ' · ' + excl.article : ''}`;
                    const novaRuta = await pb.collection('rutes').create({
                        nom: nomRuta, article: excl?.article || '', per_defecte: false,
                        operacions: [{ nom, temps_estandard_min: Number(form.temps_std_min) || 0 }],
                        estat_ruta: 'activa',
                    }, { requestKey: 'reco-excl-ruta-new' });
                    rutaFinalId = novaRuta.id;
                    rutaFinalNom = nomRuta;
                    payload.ruta = rutaFinalId;
                    await pb.collection('operacions_def').create(payload, { requestKey: 'reco-excl-op-new' });
                } else if (compartida) {
                    const nomClon = `${rutaExcl?.nom || 'Ruta'} · ${excl?.exclusiva || ''}`;
                    const rutaClon = await pb.collection('rutes').create({
                        nom: nomClon, article: rutaExcl?.article || excl?.article || '',
                        per_defecte: false,
                        operacions: (rutaExcl?.operacions || []).map((o) => ({
                            nom: o.nom, temps_estandard_min: Number(o.temps_estandard_min || 0) || 0,
                        })).concat([{ nom, temps_estandard_min: Number(form.temps_std_min) || 0 }]),
                        estat_ruta: rutaExcl?.estat_ruta || 'activa',
                        notas: `Ruta clonada para exclusiva ${excl?.exclusiva} desde recomendación de trabajo libre.`,
                    }, { requestKey: 'reco-excl-clon' });
                    rutaFinalId = rutaClon.id;
                    rutaFinalNom = nomClon;
                    for (let i = 0; i < opsExcl.length; i++) {
                        const o = opsExcl[i];
                        await pb.collection('operacions_def').create({
                            codi: o.codi || '', nom: o.nom || '', fase: o.fase || '', fase_ordre: Number(o.fase_ordre) || 0,
                            ordre: Number(o.ordre) || 0, descripcio: o.descripcio || '', instruccions: o.instruccions || '',
                            peca_zona: o.peca_zona || '', maquina: o.maquina || '', especialitat: o.especialitat || '',
                            temps_std_min: Number(o.temps_std_min) || 0, temps_prep_min: Number(o.temps_prep_min) || 0,
                            unitats_lot: Number(o.unitats_lot) || 0, op_anterior: o.op_anterior || '', op_seguent: o.op_seguent || '',
                            paralel: !!o.paralel, te_control_qualitat: !!o.te_control_qualitat,
                            defectes_frequents: o.defectes_frequents || '', actiu: o.actiu !== false, ruta: rutaFinalId,
                        }, { requestKey: `reco-excl-dup-${i}` });
                    }
                    payload.ruta = rutaFinalId;
                    await pb.collection('operacions_def').create(payload, { requestKey: 'reco-excl-op-clon' });
                    await pb.collection('exclusives').update(exclusivaSelId, { ruta: rutaFinalId }, { requestKey: 'reco-excl-upd' }).catch(() => {});
                } else {
                    rutaFinalId = rutaExclId;
                    rutaFinalNom = rutaExcl?.nom || 'Ruta';
                    payload.ruta = rutaFinalId;
                    await pb.collection('operacions_def').create(payload, { requestKey: 'reco-excl-op-direct' });
                    const opsJson = (rutaExcl?.operacions || []).map((o) => ({
                        nom: o.nom, temps_estandard_min: Number(o.temps_estandard_min || 0) || 0,
                    })).concat([{ nom, temps_estandard_min: Number(form.temps_std_min) || 0 }]);
                    await pb.collection('rutes').update(rutaFinalId, { operacions: opsJson }, { requestKey: 'reco-excl-json' }).catch(() => {});
                }
                const opsFinal = await pb.collection('operacions_def').getFullList({
                    filter: `ruta = "${rutaFinalId}"`, requestKey: 'reco-excl-opsfinal',
                }).catch(() => []);
                const minPerUnit = opsFinal.reduce((a, o) => a + (Number(o.temps_std_min) || 0), 0);
                const minuts = Math.round(minPerUnit * (Number(excl?.unitats) || 1));
                await pb.collection('exclusives').update(exclusivaSelId, { minuts_previstos: minuts }, { requestKey: 'reco-excl-minuts' }).catch(() => {});
                descripcioAlcance = `Operación convertida de trabajo libre y añadida solo a la exclusiva ${excl?.exclusiva || ''}. No afecta a otras exclusivas ni al artículo.`;
            }

            await pb.collection('historial_cambios_exclusivas').create({
                exclusiva_id: exclusivaFinalId,
                tipo_cambio: 'operacion_lliure_convertida',
                ruta_nueva: rutaFinalNom,
                operacion_id: codi,
                operacion_nombre: `${codi} · ${nom}`,
                cambio_descripcion: `Operación "${codi} · ${nom}" convertida desde trabajo libre («${descripcio.slice(0, 80)}»). ${descripcioAlcance}`,
                usuario_id: user?.id || null,
                fecha_cambio: ahora,
                articulo_referencia: articleDetectat?.referencia || refs[0] || '',
                ruta_id: rutaFinalId || '',
                alcance,
            }, { requestKey: 'reco-hist' }).catch(() => {});

            // Marcar la recomendación como convertida en el store propio
            try { onConverted && onConverted(); } catch (e) { /* silent */ }

            setResumen({ codi, nom, rutaNom: rutaFinalNom, alcance, alcanceTxt: descripcioAlcance });
        } catch (e) {
            console.error('Error convirtiendo trabajo libre a operación', e);
            setError('No se ha podido crear la operación. Revisa los permisos y los datos.');
        } finally {
            setAplicant(false);
        }
    };

    const tancar = () => { onSaved && onSaved(); };

    const alcanceOptions = [
        { id: 'articulo', label: 'Ruta del artículo (futuras exclusivas)', desc: 'Se añade a la ruta del artículo para que la hereden las próximas exclusivas. No modifica exclusivas existentes.', disabled: !articleDetectat },
        { id: 'ruta_compartida', label: 'Ruta compartida (varios artículos)', desc: 'Se añade a una ruta compartida existente o se crea una nueva. Asígnala después a los artículos que corresponda.' },
        { id: 'exclusiva', label: 'Solo una exclusiva concreta', desc: 'Se añade solo a una exclusiva elegida (clonando la ruta si es compartida). No afecta al resto.' },
    ];

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div className="modal-card w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-card px-5 py-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--accent))]/15 text-[hsl(var(--accent))]">
                            <Lightbulb className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <p className="font-display text-xl uppercase truncate">Convertir en operación</p>
                            <p className="text-xs text-muted-foreground truncate">Desde trabajo libre · {suggeriment.count}× observada</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="rounded-md p-2 hover:bg-secondary shrink-0" aria-label="Cerrar">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {resumen ? (
                        <div className="text-center py-2">
                            <CheckCircle2 className="mx-auto h-12 w-12 text-[hsl(var(--ok))] mb-3" />
                            <p className="font-display text-2xl uppercase">Operación creada</p>
                            <p className="mt-2 text-sm text-muted-foreground">
                                «{resumen.codi} · {resumen.nom}» añadida a <strong>{resumen.rutaNom}</strong>.
                            </p>
                            <p className="mt-2 text-xs text-muted-foreground text-left rounded-lg bg-secondary/40 p-3">{resumen.alcanceTxt}</p>
                            <p className="mt-2 text-xs text-muted-foreground">Recomendación marcada como convertida. Historial registrado.</p>
                            <button onClick={tancar} className="mt-4 h-11 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground">Cerrar</button>
                        </div>
                    ) : (
                        <>
                            <div className="rounded-lg bg-[hsl(var(--accent))]/5 p-3 text-xs text-muted-foreground">
                                <p className="font-semibold text-foreground mb-0.5">Trabajo libre detectado</p>
                                <p>«{descripcio}»</p>
                                <p className="mt-1">{suggeriment.count}× observada · tiempo medio {formatSegons(suggeriment.tempsMitja)}{tempsMin > 0 ? ` (~${tempsMin} min)` : ''}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-semibold uppercase text-muted-foreground">Código *</label>
                                    <input value={form.codi} onChange={(e) => setCampo('codi', e.target.value.toUpperCase())}
                                        placeholder="Ej. OP-99"
                                        className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm font-mono" />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold uppercase text-muted-foreground">Tiempo estándar (min)</label>
                                    <input type="number" min="0" step="0.5" value={form.temps_std_min}
                                        onChange={(e) => setCampo('temps_std_min', parseFloat(e.target.value) || 0)}
                                        className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm tabular-nums" />
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-semibold uppercase text-muted-foreground">Nombre *</label>
                                <input value={form.nom} onChange={(e) => setCampo('nom', e.target.value)}
                                    className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm" />
                            </div>

                            <div>
                                <label className="text-xs font-semibold uppercase text-muted-foreground">Descripción / instrucciones</label>
                                <textarea value={form.descripcio} onChange={(e) => setCampo('descripcio', e.target.value)} rows={2}
                                    className="mt-1 w-full rounded-md border border-input bg-background p-3 text-sm" />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-semibold uppercase text-muted-foreground">Fase</label>
                                    {fasesConocidas.length > 0 ? (
                                        <input list="reco-fases" value={form.fase} onChange={(e) => setCampo('fase', e.target.value)}
                                            placeholder="Fase 1, …"
                                            className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm" />
                                    ) : (
                                        <input value={form.fase} onChange={(e) => setCampo('fase', e.target.value)}
                                            placeholder="Fase (opcional)"
                                            className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm" />
                                    )}
                                    {fasesConocidas.length > 0 && (
                                        <datalist id="reco-fases">
                                            {fasesConocidas.map((f) => <option key={f} value={f} />)}
                                        </datalist>
                                    )}
                                </div>
                                <div>
                                    <label className="text-xs font-semibold uppercase text-muted-foreground">Posición (orden)</label>
                                    <input type="number" min="1" value={form.ordre || ordreSugerit}
                                        onChange={(e) => setCampo('ordre', e.target.value)}
                                        className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm tabular-nums" />
                                </div>
                            </div>

                            {opsRutaDesti.length > 0 && (
                                <div>
                                    <label className="text-xs font-semibold uppercase text-muted-foreground">Depende de (op. anterior)</label>
                                    <select value={form.op_anterior} onChange={(e) => setCampo('op_anterior', e.target.value)}
                                        className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
                                        <option value="">Sin dependencia (disponible ya)</option>
                                        {opsRutaDesti.map((o) => (
                                            <option key={o.id} value={o.codi}>{o.codi} · {o.nom}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {duplicat && (
                                <div className="flex items-start gap-2 rounded-lg bg-[hsl(var(--warn))]/10 p-3 text-sm text-[hsl(var(--warn))]">
                                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                    <span>Ya existe una operación parecida («{duplicat.codi || duplicat.nom}») en el destino. Puedes crearla de todas formas o ajustar el código/nombre.</span>
                                </div>
                            )}

                            <div className="border-t border-border pt-4">
                                <p className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Layers className="h-4 w-4" /> Alcance</p>
                                <div className="grid gap-2">
                                    {alcanceOptions.map((opt) => (
                                        <button key={opt.id} onClick={() => !opt.disabled && setAlcance(opt.id)}
                                            disabled={opt.disabled}
                                            className={`text-left rounded-lg border p-3 transition ${alcance === opt.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-secondary/40'} ${opt.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                            <p className="text-sm font-semibold flex items-center gap-1.5">
                                                {opt.id === 'articulo' && <Link2 className="h-3.5 w-3.5" />}
                                                {opt.id === 'ruta_compartida' && <RouteIcon className="h-3.5 w-3.5" />}
                                                {opt.id === 'exclusiva' && <Wrench className="h-3.5 w-3.5" />}
                                                {opt.label}
                                                {opt.disabled && <span className="text-[10px] font-normal text-muted-foreground">(sin artículo detectado)</span>}
                                            </p>
                                            <p className="mt-0.5 text-xs text-muted-foreground">{opt.desc}</p>
                                        </button>
                                    ))}
                                </div>

                                {alcance === 'articulo' && articleDetectat && (
                                    <div className="mt-2 rounded-md bg-secondary/40 p-3 text-xs">
                                        <p>Artículo: <strong>{articleDetectat.referencia}</strong> · {articleDetectat.nom}</p>
                                        <p className="mt-0.5">Ruta: {rutaArticle ? <strong>{rutaArticle.nom}</strong> : <span className="text-[hsl(var(--warn))]">sin ruta (se creará una nueva)</span>}</p>
                                    </div>
                                )}

                                {alcance === 'ruta_compartida' && (
                                    <div className="mt-2 grid gap-2">
                                        <label className="text-xs font-semibold uppercase text-muted-foreground">Ruta compartida existente</label>
                                        <select value={rutaCompartidaId} onChange={(e) => setRutaCompartidaId(e.target.value)}
                                            className="h-11 rounded-md border border-input bg-background px-3 text-sm">
                                            <option value="">— Crear nueva ruta compartida —</option>
                                            {rutes.map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}
                                        </select>
                                        {!rutaCompartidaId && (
                                            <div>
                                                <label className="text-xs font-semibold uppercase text-muted-foreground">Nombre de la nueva ruta</label>
                                                <input value={novaRutaNom} onChange={(e) => setNovaRutaNom(e.target.value)}
                                                    placeholder={`Ej. Ruta compartida · ${form.codi || 'OP'}`}
                                                    className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm" />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {alcance === 'exclusiva' && (
                                    <div className="mt-2 grid gap-2">
                                        <label className="text-xs font-semibold uppercase text-muted-foreground">Exclusiva concreta</label>
                                        {exclusivesCarregant ? (
                                            <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando exclusivas…</p>
                                        ) : exclusivesLlista.length === 0 ? (
                                            <p className="text-xs text-muted-foreground">No hay exclusivas para el artículo/referencia de esta sugerencia.</p>
                                        ) : (
                                            <select value={exclusivaSelId} onChange={(e) => setExclusivaSelId(e.target.value)}
                                                className="h-11 rounded-md border border-input bg-background px-3 text-sm">
                                                <option value="">— Selecciona —</option>
                                                {exclusivesLlista.map((e) => (
                                                    <option key={e.id} value={e.id}>{e.exclusiva} · {e.article || '—'}{e.estat ? ` (${e.estat})` : ''}</option>
                                                ))}
                                            </select>
                                        )}
                                    </div>
                                )}
                            </div>

                            {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

                            <div className="flex gap-3 pt-1">
                                <button onClick={crearOperacio} disabled={aplicant}
                                    className="flex h-12 flex-1 items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground active:scale-95 disabled:opacity-50">
                                    {aplicant ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                                    {aplicant ? 'Creando…' : 'Crear operación'}
                                </button>
                                <button onClick={onClose} disabled={aplicant}
                                    className="h-12 rounded-md bg-secondary px-5 text-sm font-semibold disabled:opacity-50">Cancelar</button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function formatSegons(s) {
    s = Math.max(0, Math.floor(s || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
    return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function formatData(iso) {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        return d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
    } catch (e) {
        return String(iso).substring(0, 16);
    }
}

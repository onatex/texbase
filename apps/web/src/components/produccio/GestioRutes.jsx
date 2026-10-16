import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, ChevronDown, ChevronRight,
    Edit2, Eye, GripVertical, Layers, Lightbulb, Loader2, Plus, Route, Save, Trash2, X, Link2,
} from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/lib/auth';
import {
    expectedFasesForArticle, isCikArticle, parseFasesConfig,
    canonFase as canonFaseUtil, faseOrdre as faseOrdreUtil,
} from '@/lib/fasesUtils';
import RecomanacionsOperacions from '@/components/produccio/RecomanacionsOperacions';

/**
 * Gestión de rutas para Producción (y roles superiores).
 *
 * Permite:
 *  - Crear rutas nuevas y editar rutas existentes (nombre, estado, defecto, notas).
 *  - Configurar las fases de la ruta (Fase 1, Fase 2, Fase 3): el operario
 *    trabaja por fase como una sola operación agregada, sin necesidad de
 *    crear muchas operaciones detalladas. Las rutas antiguas con operaciones
 *    detalladas conservan su comportamiento y trazabilidad.
 *  - Gestionar operaciones de cada ruta: añadir, editar, reordenar y quitar.
 *  - Asignar una ruta a uno o varios artículos (relación articles.ruta).
 *  - Desasignar una ruta de un artículo sin borrar la ruta ni afectar a otros.
 *  - Ver qué artículos utilizan cada ruta.
 *  - Registrar en historial quién creó/editó/asignó/desasignó una ruta y cuándo.
 *
 * La asociación ruta ↔ artículos usa la relación real `articles.ruta`
 * (maxSelect 1): varios artículos pueden apuntar a la misma ruta. Las
 * exclusivas futuras heredan la ruta automáticamente desde el artículo en
 * la carga masiva. Las exclusivas ya cargadas no se modifican aquí; para
 * eso existe la función de propagación/actualización de Exclusivas.
 */

const FASES_DEFAULT = [
    { fase: 'Fase 1', activa: true, temps_std_min: 0 },
    { fase: 'Fase 2', activa: true, temps_std_min: 0 },
    { fase: 'Fase 3', activa: true, temps_std_min: 0 },
];
function normalizeFases(raw) {
    let arr = [];
    if (Array.isArray(raw)) arr = raw;
    else if (typeof raw === 'string' && raw.trim()) {
        try { arr = JSON.parse(raw); } catch { arr = []; }
    }
    if (!Array.isArray(arr)) arr = [];
    const map = new Map();
    for (const c of arr) {
        if (c && c.fase) map.set(c.fase, { fase: c.fase, activa: c.activa !== false, temps_std_min: Number(c.temps_std_min) || 0 });
    }
    const base = FASES_DEFAULT.map((d) => map.get(d.fase) || { ...d });
    // Preservar fases adicionales (p.ej. Fase 4) definidas en el artículo/ruta.
    const extra = arr
        .filter((c) => c && c.fase && !FASES_DEFAULT.some((d) => d.fase === c.fase))
        .map((c) => ({ fase: c.fase, activa: c.activa !== false, temps_std_min: Number(c.temps_std_min) || 0 }));
    const ordreFase = (f) => { const m = String(f || '').match(/fase\s*(\d+)/i); return m ? Number(m[1]) : 99; };
    return [...base, ...extra].sort((a, b) => ordreFase(a.fase) - ordreFase(b.fase));
}
export default function GestioRutes({ rutes = [], articles = [], opsDef = [], recarrega }) {
    const { user } = useAuth();

    const [edicio, setEdicio] = useState(null);        // ruta en edición/creación
    const [desant, setDesant] = useState(false);
    const [error, setError] = useState('');
    const [detallRuta, setDetallRuta] = useState(null); // id de ruta con panel de operaciones abierto
    const [assignant, setAssignant] = useState(null);   // ruta para modal de asignación de artículos
    const [buscador, setBuscador] = useState('');
    const [vista, setVista] = useState('rutes'); // 'rutes' | 'articles' | 'recomanacions'
    const [editArticleFases, setEditArticleFases] = useState(null); // { id, referencia, nom, fases }
    const [desantArt, setDesantArt] = useState(false);

    // ── Helpers de asociación articles.ruta ────────────────────────────────
    const articlesPerRuta = useMemo(() => {
        const map = new Map();
        for (const a of articles) {
            if (!a.ruta) continue;
            if (!map.has(a.ruta)) map.set(a.ruta, []);
            map.get(a.ruta).push(a);
        }
        return map;
    }, [articles]);

    const opsPerRuta = useMemo(() => {
        const map = new Map();
        for (const o of opsDef) {
            if (!o.ruta) continue;
            if (!map.has(o.ruta)) map.set(o.ruta, []);
            map.get(o.ruta).push(o);
        }
        return map;
    }, [opsDef]);

    const rutesFiltrades = useMemo(() => {
        const q = buscador.trim().toLowerCase();
        if (!q) return rutes;
        return rutes.filter((r) => {
            const arts = (articlesPerRuta.get(r.id) || []).map((a) => `${a.referencia} ${a.nom}`).join(' ');
            return `${r.nom} ${r.article || ''} ${r.notas || ''} ${arts}`.toLowerCase().includes(q);
        });
    }, [rutes, buscador, articlesPerRuta]);

    // ── Historial helper ───────────────────────────────────────────────────
    const logHistorial = async (tipo, descripcion, extra = {}) => {
        try {
            await pb.collection('historial_cambios_exclusivas').create({
                tipo_cambio: tipo,
                cambio_descripcion: descripcion,
                usuario_id: user?.id || null,
                fecha_cambio: new Date().toISOString(),
                exclusiva_id: null,
                ...extra,
            }, { requestKey: `grutes-hist-${tipo}-${Date.now()}` });
        } catch (e) {
            console.error('historial log failed', e);
        }
    };

    // ── Crear / editar ruta ────────────────────────────────────────────────
    const nova = () => {
        setError('');
        setEdicio({ nom: '', estat_ruta: 'activa', per_defecte: false, notas: '', fases: FASES_DEFAULT.map((d) => ({ ...d })) });
    };

    const editar = (r) => {
        setError('');
        setEdicio({ id: r.id, nom: r.nom, estat_ruta: r.estat_ruta || 'activa', per_defecte: !!r.per_defecte, notas: r.notas || '', fases: normalizeFases(r.fases_config) });
    };

    const desaRuta = async () => {
        if (!edicio?.nom?.trim()) { setError('Indica un nombre para la ruta.'); return; }
        setDesant(true);
        setError('');
        try {
            const dades = {
                nom: edicio.nom.trim(),
                estat_ruta: edicio.estat_ruta || 'activa',
                per_defecte: !!edicio.per_defecte,
                notas: (edicio.notas || '').trim(),
                fases_config: Array.isArray(edicio.fases) ? edicio.fases : FASES_DEFAULT,
            };
            let rec;
            if (edicio.id) {
                rec = await pb.collection('rutes').update(edicio.id, dades, { requestKey: 'grutes-upd' });
                await logHistorial('ruta_editada',
                    `Ruta "${rec.nom}" editada (estado: ${dades.estat_ruta}).`,
                    { ruta_anterior: rec.nom, ruta_nueva: rec.nom, ruta_id: rec.id });
            } else {
                rec = await pb.collection('rutes').create({
                    ...dades,
                    article: '',
                    operacions: [],
                }, { requestKey: 'grutes-new' });
                await logHistorial('ruta_creada',
                    `Ruta "${rec.nom}" creada (estado: ${dades.estat_ruta}).`,
                    { ruta_nueva: rec.nom, ruta_id: rec.id });
            }
            setEdicio(null);
            recarrega && recarrega();
        } catch (e) {
            console.error('Error guardando ruta', e);
            setError('No se ha podido guardar la ruta. Revisa los permisos.');
        } finally {
            setDesant(false);
        }
    };

    const eliminaRuta = async (r) => {
        const arts = articlesPerRuta.get(r.id) || [];
        const ops = opsPerRuta.get(r.id) || [];
        const msg = `¿Eliminar la ruta "${r.nom}"?\n\n` +
            `Artículos asociados: ${arts.length}\n` +
            `Operaciones: ${ops.length}\n\n` +
            `Los artículos quedarán sin ruta asignada. Las exclusivas ya cargadas conservan su ruta hasta que se reasignen.`;
        if (!confirm(msg)) return;
        try {
            // Desasignar artículos primero (dejar articles.ruta = '')
            for (let i = 0; i < arts.length; i++) {
                await pb.collection('articles').update(arts[i].id, { ruta: '' }, { requestKey: `grutes-unlink-${i}` }).catch(() => {});
            }
            // Eliminar operaciones de la ruta
            for (let i = 0; i < ops.length; i++) {
                await pb.collection('operacions_def').delete(ops[i].id, { requestKey: `grutes-delop-${i}` }).catch(() => {});
            }
            await pb.collection('rutes').delete(r.id, { requestKey: 'grutes-del' });
            await logHistorial('ruta_editada',
                `Ruta "${r.nom}" eliminada. ${arts.length} artículo(s) desasignados, ${ops.length} operación(es) eliminadas.`,
                { ruta_anterior: r.nom, ruta_id: r.id });
            recarrega && recarrega();
        } catch (e) {
            console.error('Error eliminando ruta', e);
            setError('No se ha podido eliminar la ruta.');
        }
    };

    return (
        <div className="space-y-4">
            {/* Conmutador de subapartado: Rutas / Artículos (fases) / Recomendaciones */}
            <div className="flex flex-wrap rounded-lg border border-border overflow-hidden w-fit">
                <button type="button" onClick={() => setVista('rutes')}
                    className={`flex items-center gap-1.5 px-4 h-10 text-sm font-semibold transition ${vista === 'rutes' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-secondary'}`}>
                    <Route className="h-4 w-4" /> Rutas
                </button>
                <button type="button" onClick={() => setVista('articles')}
                    className={`flex items-center gap-1.5 px-4 h-10 text-sm font-semibold transition ${vista === 'articles' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-secondary'}`}>
                    <Layers className="h-4 w-4" /> Tiempos por fase
                </button>
                <button type="button" onClick={() => setVista('recomanacions')}
                    className={`flex items-center gap-1.5 px-4 h-10 text-sm font-semibold transition ${vista === 'recomanacions' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-secondary'}`}>
                    <Lightbulb className="h-4 w-4" /> Recomendaciones
                </button>
            </div>

            {vista === 'recomanacions' ? (
                <RecomanacionsOperacions
                    rutes={rutes}
                    articles={articles}
                    opsDef={opsDef}
                    recarrega={recarrega}
                />
            ) : vista === 'articles' ? (
                <ArticlesFasesPanel
                    articles={articles}
                    rutes={rutes}
                    buscador={buscador}
                    setBuscador={setBuscador}
                    editArticleFases={editArticleFases}
                    setEditArticleFases={setEditArticleFases}
                    desantArt={desantArt}
                    setDesantArt={setDesantArt}
                    setError={setError}
                    error={error}
                    recarrega={recarrega}
                    logHistorial={logHistorial}
                    normalizeFases={normalizeFases}
                />
            ) : (
        <section className="rounded-lg border border-border bg-card">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
                <div className="flex items-center gap-2">
                    <Route className="h-5 w-5 text-primary" />
                    <h3 className="font-display text-2xl uppercase">Rutas de operaciones</h3>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <input value={buscador} onChange={(e) => setBuscador(e.target.value)}
                        placeholder="Buscar ruta o artículo..."
                        className="h-9 w-56 rounded-md border border-input bg-background px-3 text-sm" />
                    <button onClick={nova}
                        className="flex h-9 items-center gap-2 rounded-md bg-[hsl(var(--accent))] px-3 text-sm font-semibold text-[hsl(var(--accent-foreground))] active:scale-95">
                        <Plus className="h-4 w-4" /> Nueva ruta
                    </button>
                </div>
            </div>

            {error && <p className="mx-4 mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

            {/* Lista de rutas */}
            <div className="divide-y divide-border">
                {rutesFiltrades.length === 0 ? (
                    <p className="p-8 text-center text-sm text-muted-foreground">
                        {rutes.length === 0 ? 'Todavía no hay rutas definidas. Crea la primera con «Nueva ruta».' : 'Ninguna ruta coincide con la búsqueda.'}
                    </p>
                ) : rutesFiltrades.map((r) => {
                    const arts = articlesPerRuta.get(r.id) || [];
                    const ops = (opsPerRuta.get(r.id) || []).slice().sort((a, b) => (Number(a.ordre) || 0) - (Number(b.ordre) || 0));
                    const totalMin = ops.reduce((s, o) => s + (Number(o.temps_std_min) || 0), 0);
                    const isDetall = detallRuta === r.id;
                    return (
                        <div key={r.id} className="p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="font-semibold text-base">{r.nom}</p>
                                        {r.per_defecte && <span className="rounded bg-secondary px-2 py-0.5 text-xs">por defecto</span>}
                                        <span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${r.estat_ruta === 'activa' ? 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]' : r.estat_ruta === 'arxivada' ? 'bg-[hsl(var(--warn))]/20 text-[hsl(var(--warn))]' : 'bg-secondary text-muted-foreground'}`}>
                                            {r.estat_ruta || 'activa'}
                                        </span>
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                        <span><strong className="text-foreground">{ops.length}</strong> operaciones</span>
                                        <span><strong className="text-foreground">{totalMin}</strong> min totales</span>
                                        <span><strong className="text-foreground">{arts.length}</strong> artículo(s) asociado(s)</span>
                                    </div>
                                    {arts.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            {arts.slice(0, 8).map((a) => (
                                                <span key={a.id} className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 py-0.5 text-xs font-mono text-primary">
                                                    <Link2 className="h-3 w-3" />{a.referencia}
                                                </span>
                                            ))}
                                            {arts.length > 8 && <span className="text-xs text-muted-foreground">+{arts.length - 8} más</span>}
                                        </div>
                                    )}
                                    {arts.length === 0 && (
                                        <p className="mt-2 text-xs italic text-muted-foreground">Sin artículos asociados — asígnala desde «Asignar artículos».</p>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <button onClick={() => setDetallRuta(isDetall ? null : r.id)}
                                        className="flex items-center gap-1.5 rounded-md border border-border px-3 h-9 text-xs font-semibold hover:bg-secondary active:scale-95">
                                        <Eye className="h-3.5 w-3.5" /> {isDetall ? 'Ocultar ops' : 'Operaciones'}
                                    </button>
                                    <button onClick={() => setAssignant(r)}
                                        className="flex items-center gap-1.5 rounded-md border border-border px-3 h-9 text-xs font-semibold hover:bg-secondary active:scale-95">
                                        <Link2 className="h-3.5 w-3.5" /> Asignar artículos
                                    </button>
                                    <button onClick={() => editar(r)}
                                        className="flex items-center gap-1.5 rounded-md border border-border px-3 h-9 text-xs font-semibold hover:bg-secondary active:scale-95">
                                        <Edit2 className="h-3.5 w-3.5" /> Editar
                                    </button>
                                    <button onClick={() => eliminaRuta(r)}
                                        className="flex items-center gap-1.5 rounded-md border border-destructive px-3 h-9 text-xs font-semibold text-destructive hover:bg-destructive/10 active:scale-95">
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>

                            {/* Panel de operaciones */}
                            {isDetall && (
                                <GestioOperacionsRuta
                                    ruta={r}
                                    ops={ops}
                                    recarrega={recarrega}
                                    logHistorial={logHistorial}
                                />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Modal crear / editar ruta */}
            {edicio && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={() => setEdicio(null)}>
                    <div className="modal-card w-full max-w-lg rounded-2xl bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between border-b border-border px-5 py-4">
                            <p className="font-display text-xl uppercase">{edicio.id ? 'Editar ruta' : 'Nueva ruta'}</p>
                            <button onClick={() => setEdicio(null)} className="rounded-md p-2 hover:bg-secondary"><X className="h-5 w-5" /></button>
                        </div>
                        <div className="p-5 grid gap-3">
                            <div className="grid gap-2">
                                <label className="text-sm font-semibold">Nombre *</label>
                                <input value={edicio.nom} onChange={(e) => setEdicio({ ...edicio, nom: e.target.value })}
                                    placeholder="Ej. Ruta UNIC PLUS SUIT"
                                    className="h-11 rounded-md border border-input bg-background px-3 text-sm" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="grid gap-2">
                                    <label className="text-sm font-semibold">Estado</label>
                                    <select value={edicio.estat_ruta} onChange={(e) => setEdicio({ ...edicio, estat_ruta: e.target.value })}
                                        className="h-11 rounded-md border border-input bg-background px-3 text-sm">
                                        <option value="activa">Activa</option>
                                        <option value="inactiva">Inactiva</option>
                                        <option value="arxivada">Archivada</option>
                                    </select>
                                </div>
                                <div className="flex items-end">
                                    <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                                        <input type="checkbox" checked={!!edicio.per_defecte} onChange={(e) => setEdicio({ ...edicio, per_defecte: e.target.checked })}
                                            className="h-4 w-4 rounded" />
                                        Ruta por defecto
                                    </label>
                                </div>
                            </div>
                            <div className="grid gap-2">
                                <label className="text-sm font-semibold">Notas</label>
                                <textarea value={edicio.notas || ''} onChange={(e) => setEdicio({ ...edicio, notas: e.target.value })} rows={2}
                                    className="rounded-md border border-input bg-background p-3 text-sm" />
                            </div>
                            <div className="grid gap-2">
                                <label className="text-sm font-semibold">Fases de la ruta</label>
                                <p className="text-xs text-muted-foreground">El operario trabaja por fase como una sola operación. Activa las fases que usa esta ruta e indica el tiempo estándar (min) de cada una. Las rutas con operaciones detalladas conservan sus operaciones para consulta en Admin/Producción.</p>
                                <div className="grid gap-2">
                                    {(edicio.fases || FASES_DEFAULT).map((f, idx) => {
                                        const isExtra = !FASES_DEFAULT.some((d) => d.fase === f.fase);
                                        return (
                                        <div key={f.fase} className="flex items-center gap-3 rounded-md border border-border p-2">
                                            <label className="flex items-center gap-2 text-sm font-semibold w-28 shrink-0">
                                                <input type="checkbox" checked={!!f.activa}
                                                    onChange={(e) => setEdicio({ ...edicio, fases: (edicio.fases || FASES_DEFAULT).map((x, i) => (i === idx ? { ...x, activa: e.target.checked } : x)) })}
                                                    className="h-4 w-4 rounded" />
                                                {f.fase}
                                            </label>
                                            <input type="number" min="0" step="0.5" value={f.temps_std_min ?? 0} disabled={!f.activa}
                                                onChange={(e) => setEdicio({ ...edicio, fases: (edicio.fases || FASES_DEFAULT).map((x, i) => (i === idx ? { ...x, temps_std_min: parseFloat(e.target.value) || 0 } : x)) })}
                                                className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm tabular-nums disabled:opacity-50" placeholder="Min estándar" />
                                            {isExtra && (
                                                <button type="button" onClick={() => setEdicio({ ...edicio, fases: (edicio.fases || FASES_DEFAULT).filter((x) => x.fase !== f.fase) })} className="rounded-md p-2 text-destructive hover:bg-destructive/10" aria-label="Quitar fase">
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>
                                        );
                                    })}
                                    {!(edicio.fases || FASES_DEFAULT).some((f) => f.fase === 'Fase 4') && (
                                        <button type="button"
                                            onClick={() => setEdicio({ ...edicio, fases: [...(edicio.fases || FASES_DEFAULT), { fase: 'Fase 4', activa: true, temps_std_min: 0 }] })}
                                            className="flex h-10 items-center justify-center gap-2 rounded-md border border-dashed border-primary/40 text-sm font-semibold text-primary hover:bg-primary/5">
                                            <Plus className="h-4 w-4" /> Añadir Fase 4
                                        </button>
                                    )}
                                </div>
                            </div>
                            {edicio.id && (
                                <div className="rounded-md bg-secondary/50 p-3 text-xs text-muted-foreground">
                                    <p className="font-semibold text-foreground mb-1">Artículos asociados ({(articlesPerRuta.get(edicio.id) || []).length})</p>
                                    {(articlesPerRuta.get(edicio.id) || []).length === 0
                                        ? <p>Sin artículos asignados. Usa «Asignar artículos» para vincularlos.</p>
                                        : <div className="flex flex-wrap gap-1.5">
                                            {(articlesPerRuta.get(edicio.id) || []).map((a) => {
                                                const et = etiquetaArticle(a);
                                                return (
                                                    <span key={a.id} className="rounded bg-background px-2 py-0.5 text-xs">
                                                        <span className="font-mono font-semibold">{et.ref}</span>
                                                        <span className="text-muted-foreground"> · {et.nom}</span>
                                                    </span>
                                                );
                                            })}
                                        </div>}
                                </div>
                            )}
                            {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
                            <div className="flex gap-3 pt-1">
                                <button onClick={desaRuta} disabled={desant}
                                    className="flex h-12 flex-1 items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60 active:scale-95">
                                    {desant ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar ruta
                                </button>
                                <button onClick={() => setEdicio(null)} className="h-12 rounded-md bg-secondary px-5 text-sm font-semibold">Cancelar</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal asignar artículos */}
            {assignant && (
                <AssignarArticles
                    ruta={assignant}
                    articles={articles}
                    recarrega={recarrega}
                    logHistorial={logHistorial}
                    onClose={() => setAssignant(null)}
                />
            )}
        </section>
            )}
        </div>
    );
}

// ── Gestión de operaciones de una ruta ──────────────────────────────────────
function GestioOperacionsRuta({ ruta, ops, recarrega, logHistorial }) {
    const [llista, setLlista] = useState([]);
    const [expandedId, setExpandedId] = useState(null);
    const [desant, setDesant] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        setLlista(ops.slice().sort((a, b) => (Number(a.ordre) || 0) - (Number(b.ordre) || 0)));
    }, [ops]);

    const reindexar = (arr) => arr.map((o, i) => ({ ...o, ordre: i + 1 }));
    const mover = (idx, dir) => {
        setLlista((prev) => {
            const next = prev.slice();
            const j = idx + dir;
            if (j < 0 || j >= next.length) return prev;
            [next[idx], next[j]] = [next[j], next[idx]];
            return reindexar(next);
        });
    };

    const setCampo = (id, campo, valor) => {
        setLlista((prev) => prev.map((o) => (o.id === id ? { ...o, [campo]: valor } : o)));
    };

    const afegirOp = () => {
        const ordre = (llista.length ? Math.max(...llista.map((o) => Number(o.ordre) || 0)) : 0) + 1;
        setLlista((prev) => [...prev, {
            id: `nova-${Date.now()}`, _nova: true,
            codi: '', nom: '', fase: '', ordre, descripcio: '', maquina: '', especialitat: '',
            temps_std_min: 0, temps_prep_min: 0, op_anterior: '', paralel: false, te_control_qualitat: false, actiu: true,
        }]);
        setExpandedId(`nova-${Date.now()}`);
    };

    const eliminarOp = async (op) => {
        if (!confirm(`¿Quitar la operación "${op.codi} · ${op.nom}" de la ruta "${ruta.nom}"?`)) return;
        setError('');
        try {
            if (!op._nova) {
                await pb.collection('operacions_def').delete(op.id, { requestKey: `grutes-elmop-${op.id}` });
                await logHistorial('operacion_modificada',
                    `Operación "${op.codi} · ${op.nom}" eliminada de la ruta "${ruta.nom}".`,
                    { ruta_nueva: ruta.nom, ruta_id: ruta.id, operacion_id: op.codi || '', operacion_nombre: `${op.codi || ''} · ${op.nom}` });
            }
            setLlista((prev) => prev.filter((o) => o.id !== op.id));
            recarrega && recarrega();
        } catch (e) {
            console.error('Error eliminando operación', e);
            setError('No se ha podido quitar la operación.');
        }
    };

    const guardarTot = async () => {
        setDesant(true);
        setError('');
        try {
            // Validar codis únicos y no vacíos
            const codis = llista.map((o) => (o.codi || '').trim().toUpperCase()).filter(Boolean);
            if (codis.length !== new Set(codis).size) {
                setError('Hay códigos de operación duplicados. Cada código debe ser único dentro de la ruta.');
                setDesant(false);
                return;
            }
            for (const o of llista) {
                if (!(o.nom || '').trim()) { setError('Toda operación necesita un nombre.'); setDesant(false); return; }
            }
            // Guardar cada operación (crear nuevas, actualizar existentes, reordenar)
            for (let i = 0; i < llista.length; i++) {
                const o = llista[i];
                const payload = {
                    codi: (o.codi || '').trim().toUpperCase(),
                    nom: o.nom.trim(),
                    fase: o.fase || '',
                    fase_ordre: Number(o.fase_ordre) || 0,
                    ordre: Number(o.ordre) || (i + 1),
                    descripcio: o.descripcio || '',
                    instruccions: o.instruccions || '',
                    peca_zona: o.peca_zona || '',
                    maquina: o.maquina || '',
                    especialitat: o.especialitat || '',
                    temps_std_min: Number(o.temps_std_min) || 0,
                    temps_prep_min: Number(o.temps_prep_min) || 0,
                    unitats_lot: Number(o.unitats_lot) || 0,
                    op_anterior: o.op_anterior || '',
                    op_seguent: o.op_seguent || '',
                    paralel: !!o.paralel,
                    te_control_qualitat: !!o.te_control_qualitat,
                    defectes_frequents: o.defectes_frequents || '',
                    actiu: o.actiu !== false,
                    ruta: ruta.id,
                };
                if (o._nova) {
                    await pb.collection('operacions_def').create(payload, { requestKey: `grutes-crop-${i}` });
                    await logHistorial('operacion_anadida',
                        `Operación "${payload.codi} · ${payload.nom}" añadida a la ruta "${ruta.nom}".`,
                        { ruta_nueva: ruta.nom, ruta_id: ruta.id, operacion_id: payload.codi, operacion_nombre: `${payload.codi} · ${payload.nom}` });
                } else {
                    await pb.collection('operacions_def').update(o.id, payload, { requestKey: `grutes-updop-${i}` });
                }
            }
            // Actualizar JSON operacions de la ruta (resumen)
            const opsJson = llista.map((o) => ({ nom: o.nom, temps_estandard_min: Number(o.temps_std_min) || 0 }));
            const totalMin = llista.reduce((s, o) => s + (Number(o.temps_std_min) || 0), 0);
            await pb.collection('rutes').update(ruta.id, { operacions: opsJson, temps_total_std_min: totalMin }, { requestKey: 'grutes-ruta-json' }).catch(() => {});
            await logHistorial('ruta_editada',
                `Operaciones de la ruta "${ruta.nom}" guardadas (${llista.length} operaciones, ${totalMin} min).`,
                { ruta_nueva: ruta.nom, ruta_id: ruta.id });
            setDesant(false);
            recarrega && recarrega();
        } catch (e) {
            console.error('Error guardando operaciones', e);
            setError('No se han podido guardar las operaciones.');
            setDesant(false);
        }
    };

    const totalMin = llista.reduce((s, o) => s + (Number(o.temps_std_min) || 0), 0);

    return (
        <div className="mt-4 rounded-lg border border-border bg-secondary/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <p className="text-sm font-semibold uppercase text-muted-foreground">
                    Operaciones ({llista.length}) · Tiempo total: <strong className="text-foreground">{totalMin} min</strong>
                </p>
                <div className="flex gap-2">
                    <button onClick={afegirOp}
                        className="flex items-center gap-1.5 rounded-md bg-[hsl(var(--accent))] px-3 h-9 text-xs font-semibold text-[hsl(var(--accent-foreground))] active:scale-95">
                        <Plus className="h-3.5 w-3.5" /> Añadir operación
                    </button>
                    <button onClick={guardarTot} disabled={desant}
                        className="flex items-center gap-1.5 rounded-md bg-primary px-3 h-9 text-xs font-semibold text-primary-foreground disabled:opacity-60 active:scale-95">
                        {desant ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Guardar cambios
                    </button>
                </div>
            </div>

            {error && <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}

            {llista.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Sin operaciones. Añade la primera con «Añadir operación».</p>
            ) : (
                <div className="space-y-1.5">
                    {llista.map((op, idx) => {
                        const isExpanded = expandedId === op.id;
                        return (
                            <div key={op.id} className="rounded-lg border border-border bg-card">
                                <div className="flex items-center gap-2 px-2 py-2">
                                    <div className="flex flex-col shrink-0">
                                        <button onClick={() => mover(idx, -1)} disabled={idx === 0}
                                            className="rounded p-1 text-muted-foreground hover:bg-secondary disabled:opacity-30" aria-label="Subir">
                                            <ArrowUp className="h-4 w-4" />
                                        </button>
                                        <button onClick={() => mover(idx, 1)} disabled={idx === llista.length - 1}
                                            className="rounded p-1 text-muted-foreground hover:bg-secondary disabled:opacity-30" aria-label="Bajar">
                                            <ArrowDown className="h-4 w-4" />
                                        </button>
                                    </div>
                                    <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0 hidden sm:block" />
                                    <span className="font-display text-lg tabular-nums text-muted-foreground shrink-0 min-w-[40px]">{op.ordre}</span>
                                    <button onClick={() => setExpandedId(isExpanded ? null : op.id)} className="flex-1 min-w-0 text-left">
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-xs font-bold bg-secondary rounded px-1.5 py-0.5">{op.codi || '—'}</span>
                                            <span className="font-semibold text-sm truncate">{op.nom || '(sin nombre)'}</span>
                                            {op._nova && <span className="rounded bg-[hsl(var(--accent))]/20 px-1.5 py-0.5 text-[10px] font-semibold text-[hsl(var(--accent))]">nueva</span>}
                                        </div>
                                        <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                            {op.fase && <span>{op.fase}</span>}
                                            {op.maquina && <span>· {op.maquina}</span>}
                                        </div>
                                    </button>
                                    <span className="shrink-0 tabular-nums text-sm font-bold">{Number(op.temps_std_min) || 0}m</span>
                                    <button onClick={() => setExpandedId(isExpanded ? null : op.id)} className="rounded p-1.5 hover:bg-secondary shrink-0">
                                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                    </button>
                                    <button onClick={() => eliminarOp(op)} className="rounded p-1.5 text-destructive hover:bg-destructive/10 shrink-0" aria-label="Quitar">
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>

                                {isExpanded && (
                                    <div className="border-t border-border p-3 space-y-3 bg-secondary/20">
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                            <div>
                                                <label className="text-xs font-semibold uppercase text-muted-foreground">Código</label>
                                                <input value={op.codi || ''} onChange={(e) => setCampo(op.id, 'codi', e.target.value.toUpperCase())}
                                                    className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-mono" />
                                            </div>
                                            <div className="sm:col-span-2">
                                                <label className="text-xs font-semibold uppercase text-muted-foreground">Nombre</label>
                                                <input value={op.nom || ''} onChange={(e) => setCampo(op.id, 'nom', e.target.value)}
                                                    className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                            <div>
                                                <label className="text-xs font-semibold uppercase text-muted-foreground">Tiempo (min)</label>
                                                <input type="number" min="0" step="0.5" value={op.temps_std_min ?? 0}
                                                    onChange={(e) => setCampo(op.id, 'temps_std_min', parseFloat(e.target.value) || 0)}
                                                    className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm tabular-nums" />
                                            </div>
                                            <div>
                                                <label className="text-xs font-semibold uppercase text-muted-foreground">Prep (min)</label>
                                                <input type="number" min="0" step="0.5" value={op.temps_prep_min ?? 0}
                                                    onChange={(e) => setCampo(op.id, 'temps_prep_min', parseFloat(e.target.value) || 0)}
                                                    className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm tabular-nums" />
                                            </div>
                                            <div>
                                                <label className="text-xs font-semibold uppercase text-muted-foreground">Orden</label>
                                                <input type="number" min="1" value={op.ordre ?? 0}
                                                    onChange={(e) => setCampo(op.id, 'ordre', parseInt(e.target.value, 10) || 0)}
                                                    className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm tabular-nums" />
                                            </div>
                                            <div>
                                                <label className="text-xs font-semibold uppercase text-muted-foreground">Fase</label>
                                                <input value={op.fase || ''} onChange={(e) => setCampo(op.id, 'fase', e.target.value)}
                                                    placeholder="Fase 1, …"
                                                    className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-xs font-semibold uppercase text-muted-foreground">Máquina</label>
                                                <input value={op.maquina || ''} onChange={(e) => setCampo(op.id, 'maquina', e.target.value)}
                                                    className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
                                            </div>
                                            <div>
                                                <label className="text-xs font-semibold uppercase text-muted-foreground">Especialidad</label>
                                                <input value={op.especialitat || ''} onChange={(e) => setCampo(op.id, 'especialitat', e.target.value)}
                                                    className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-xs font-semibold uppercase text-muted-foreground">Descripción / instrucciones</label>
                                            <textarea value={op.descripcio || ''} onChange={(e) => setCampo(op.id, 'descripcio', e.target.value)} rows={2}
                                                className="mt-1 w-full rounded-md border border-input bg-background p-3 text-sm" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-semibold uppercase text-muted-foreground">Depende de (op. anterior)</label>
                                            <select value={op.op_anterior || ''} onChange={(e) => setCampo(op.id, 'op_anterior', e.target.value)}
                                                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                                                <option value="">Sin dependencia</option>
                                                {llista.filter((o) => o.id !== op.id && o.codi).map((o) => (
                                                    <option key={o.id} value={o.codi}>{o.codi} · {o.nom}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="flex flex-wrap gap-4">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="checkbox" checked={!!op.paralel} onChange={(e) => setCampo(op.id, 'paralel', e.target.checked)} className="h-4 w-4 rounded" />
                                                <span className="text-sm font-semibold">Paralelo</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="checkbox" checked={!!op.te_control_qualitat} onChange={(e) => setCampo(op.id, 'te_control_qualitat', e.target.checked)} className="h-4 w-4 rounded" />
                                                <span className="text-sm font-semibold">Control calidad</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="checkbox" checked={op.actiu !== false} onChange={(e) => setCampo(op.id, 'actiu', e.target.checked)} className="h-4 w-4 rounded" />
                                                <span className="text-sm font-semibold">Activa</span>
                                            </label>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
                Los cambios se aplican a la ruta y a las exclusivas que la usen. Las exclusivas con ruta privada (clonada por edición individual) no se ven afectadas.
                Para aplicar cambios a exclusivas ya cargadas con rutas distintas, usa la función de propagación desde Exclusivas.
            </p>
        </div>
    );
}

// Etiqueta legible de un artículo (referencia + nombre) con fallbacks
function etiquetaArticle(a) {
    const ref = String(a?.referencia || a?.codi || a?.codigo || a?.article || '').trim();
    const nom = String(a?.nom || a?.nombre || a?.name || a?.descripcio || a?.descripcion || '').trim();
    const familia = String(a?.familia || '').trim();
    return {
        ref: ref || 'Sin referencia',
        nom: nom || familia || (ref ? `Artículo ${ref}` : 'Sin nombre'),
        familia,
        search: `${ref} ${nom} ${familia}`.toLowerCase(),
    };
}

// ── Asignar / desasignar artículos a una ruta ───────────────────────────────
function AssignarArticles({ ruta, articles: articlesProp = [], recarrega, logHistorial, onClose }) {
    const [seleccionats, setSeleccionats] = useState(new Set());
    const [desant, setDesant] = useState(false);
    const [error, setError] = useState('');
    const [buscador, setBuscador] = useState('');
    const [fet, setFet] = useState(null);
    const [articlesLocal, setArticlesLocal] = useState(articlesProp);
    const [carregantArts, setCarregantArts] = useState(false);

    // Cargar artículos frescos al abrir el modal (por si el listado padre está vacío o desfasado)
    useEffect(() => {
        let cancel = false;
        const needsReload = !articlesProp?.length
            || articlesProp.every((a) => !String(a?.referencia || '').trim() && !String(a?.nom || '').trim());
        if (!needsReload) {
            setArticlesLocal(articlesProp);
            return undefined;
        }
        setCarregantArts(true);
        pb.collection('articles')
            .getFullList({ sort: '+referencia', expand: 'ruta', requestKey: 'assign-arts-modal' })
            .then((list) => {
                if (!cancel) setArticlesLocal(list || []);
            })
            .catch(() => {
                if (!cancel) setArticlesLocal(articlesProp || []);
            })
            .finally(() => {
                if (!cancel) setCarregantArts(false);
            });
        return () => { cancel = true; };
    }, [articlesProp, ruta.id]);

    // Estado inicial: artículos que ya tienen esta ruta asignada
    useEffect(() => {
        setSeleccionats(new Set(
            articlesLocal
                .filter((a) => a.ruta === ruta.id || a.expand?.ruta?.id === ruta.id)
                .map((a) => a.id),
        ));
    }, [ruta.id, articlesLocal]);

    const artsFiltrats = useMemo(() => {
        const q = buscador.trim().toLowerCase();
        const sorted = [...articlesLocal].sort((a, b) => {
            const ra = etiquetaArticle(a).ref;
            const rb = etiquetaArticle(b).ref;
            return ra.localeCompare(rb, 'es', { numeric: true, sensitivity: 'base' });
        });
        if (!q) return sorted;
        return sorted.filter((a) => etiquetaArticle(a).search.includes(q));
    }, [articlesLocal, buscador]);

    const toggle = (id) => {
        setSeleccionats((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const seleccionarTots = () => setSeleccionats(new Set(artsFiltrats.map((a) => a.id)));
    const deseleccionarTots = () => setSeleccionats(new Set());

    const aplicar = async () => {
        setDesant(true);
        setError('');
        try {
            let assignats = 0;
            let desassignats = 0;
            // Recorrer todos los artículos: asignar los seleccionados, desasignar los que ya no lo estén
            for (let i = 0; i < articlesLocal.length; i++) {
                const a = articlesLocal[i];
                const et = etiquetaArticle(a);
                const volRuta = seleccionats.has(a.id);
                const teRuta = a.ruta === ruta.id || a.expand?.ruta?.id === ruta.id;
                if (volRuta && !teRuta) {
                    await pb.collection('articles').update(a.id, { ruta: ruta.id }, { requestKey: `grutes-asig-${i}` });
                    assignats += 1;
                    await logHistorial('ruta_asignada',
                        `Ruta "${ruta.nom}" asignada al artículo ${et.ref} (${et.nom}). Se aplicará a futuras exclusivas de este artículo.`,
                        { ruta_nueva: ruta.nom, ruta_id: ruta.id, articulo_referencia: et.ref });
                } else if (!volRuta && teRuta) {
                    await pb.collection('articles').update(a.id, { ruta: '' }, { requestKey: `grutes-unasig-${i}` });
                    desassignats += 1;
                    await logHistorial('ruta_desasignada',
                        `Ruta "${ruta.nom}" desasignada del artículo ${et.ref} (${et.nom}). La ruta no se borra. Las exclusivas ya cargadas conservan su ruta.`,
                        { ruta_anterior: ruta.nom, ruta_id: ruta.id, articulo_referencia: et.ref });
                }
            }
            setFet({ assignats, desassignats });
            recarrega && recarrega();
        } catch (e) {
            console.error('Error asignando artículos', e);
            setError('No se han podido aplicar los cambios. Revisa los permisos.');
        } finally {
            setDesant(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div className="modal-card w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-5 py-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Link2 className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <p className="font-display text-xl uppercase truncate">Asignar artículos</p>
                            <p className="text-xs text-muted-foreground truncate">Ruta «{ruta.nom}» — se aplica a exclusivas futuras de cada artículo</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-md p-2 hover:bg-secondary shrink-0" aria-label="Cerrar">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {fet ? (
                        <div className="text-center py-4">
                            <CheckCircle2 className="mx-auto h-12 w-12 text-[hsl(var(--ok))] mb-3" />
                            <p className="font-display text-2xl uppercase">Cambios aplicados</p>
                            <p className="mt-2 text-sm text-muted-foreground">
                                <strong className="text-foreground">{fet.assignats}</strong> artículo(s) asignado(s) ·
                                <strong className="text-foreground"> {fet.desassignats}</strong> desasignado(s).
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Las exclusivas ya cargadas no se modifican automáticamente. Usa la propagación desde Exclusivas si necesitas actualizarlas.
                            </p>
                            <button type="button" onClick={onClose} className="mt-5 h-11 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground">Cerrar</button>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-start gap-2 rounded-lg bg-primary/5 p-3 text-xs text-muted-foreground">
                                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                                <span>
                                    Selecciona los artículos que usarán esta ruta. Al asignar, las <strong>exclusivas futuras</strong> de cada artículo heredarán
                                    automáticamente la ruta en la carga masiva. Las exclusivas ya cargadas <strong>no se modifican</strong>; desasignar no borra la ruta
                                    ni afecta a otros artículos.
                                </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <input value={buscador} onChange={(e) => setBuscador(e.target.value)}
                                    placeholder="Buscar por referencia o nombre..."
                                    className="h-10 flex-1 min-w-[180px] rounded-md border border-input bg-background px-3 text-sm" />
                                <button type="button" onClick={seleccionarTots} className="h-10 rounded-md border border-border px-3 text-xs font-semibold hover:bg-secondary">Seleccionar todos</button>
                                <button type="button" onClick={deseleccionarTots} className="h-10 rounded-md border border-border px-3 text-xs font-semibold hover:bg-secondary">Deseleccionar todos</button>
                            </div>

                            <div className="rounded-md border border-border max-h-[40vh] overflow-y-auto divide-y divide-border">
                                {carregantArts ? (
                                    <p className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin" /> Cargando artículos…
                                    </p>
                                ) : artsFiltrats.length === 0 ? (
                                    <p className="p-6 text-center text-sm text-muted-foreground">Sin artículos disponibles. Créalos en Administración → Artículos.</p>
                                ) : artsFiltrats.map((a) => {
                                    const sel = seleccionats.has(a.id);
                                    const teAltraRuta = a.ruta && a.ruta !== ruta.id;
                                    const et = etiquetaArticle(a);
                                    return (
                                        <label key={a.id} className={`flex items-center gap-3 px-3 py-3 cursor-pointer hover:bg-secondary/40 min-h-[52px] ${sel ? 'bg-primary/5' : ''}`}>
                                            <input type="checkbox" checked={sel} onChange={() => toggle(a.id)} className="h-5 w-5 rounded shrink-0" />
                                            <div className="min-w-0 flex-1">
                                                <p className="font-mono text-sm font-semibold text-foreground leading-tight">
                                                    {et.ref}
                                                </p>
                                                <p className="text-sm text-muted-foreground truncate leading-snug mt-0.5">
                                                    {et.nom}
                                                    {et.familia && et.nom !== et.familia ? (
                                                        <span className="text-muted-foreground/80"> · {et.familia}</span>
                                                    ) : null}
                                                </p>
                                            </div>
                                            {teAltraRuta && !sel && (
                                                <span className="shrink-0 rounded bg-[hsl(var(--warn))]/15 px-2 py-0.5 text-[10px] font-semibold text-[hsl(var(--warn))]">tiene otra ruta</span>
                                            )}
                                            {sel && teAltraRuta && (
                                                <span className="shrink-0 rounded bg-[hsl(var(--warn))]/15 px-2 py-0.5 text-[10px] font-semibold text-[hsl(var(--warn))]">reemplaza ruta</span>
                                            )}
                                            {sel && !teAltraRuta && a.ruta === ruta.id && (
                                                <span className="shrink-0 rounded bg-[hsl(var(--ok))]/15 px-2 py-0.5 text-[10px] font-semibold text-[hsl(var(--ok))]">asignado</span>
                                            )}
                                        </label>
                                    );
                                })}
                            </div>

                            <p className="text-xs text-muted-foreground">
                                {seleccionats.size} artículo(s) seleccionado(s) para la ruta «{ruta.nom}».
                            </p>

                            {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

                            <div className="flex gap-3">
                                <button type="button" onClick={aplicar} disabled={desant}
                                    className="flex h-12 flex-1 items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60 active:scale-95">
                                    {desant ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                    {desant ? 'Aplicando…' : 'Aplicar asignación'}
                                </button>
                                <button type="button" onClick={onClose} disabled={desant} className="h-12 rounded-md bg-secondary px-5 text-sm font-semibold disabled:opacity-60">Cancelar</button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

/**
 * Panel de tiempos estándar Fase 1/2/3 por artículo (con o sin ruta).
 * Guarda en articles.fases_config sin modificar rutas ni operaciones históricas.
 */
function ArticlesFasesPanel({
    articles, rutes, buscador, setBuscador,
    editArticleFases, setEditArticleFases,
    desantArt, setDesantArt, setError, error,
    recarrega, logHistorial, normalizeFases,
}) {
    const lista = useMemo(() => {
        const q = (buscador || '').trim().toLowerCase();
        const sorted = [...articles].sort((a, b) => String(a.referencia || '').localeCompare(String(b.referencia || '')));
        if (!q) return sorted;
        return sorted.filter((a) => `${a.referencia || ''} ${a.nom || ''}`.toLowerCase().includes(q));
    }, [articles, buscador]);

    // Fase 4 solo aplica a artículos CIK (R84-053 / R84-054). Mostramos la
    // columna F4 cuando hay algún artículo CIK en el listado visible.
    const teFase4 = useMemo(
        () => lista.some((a) => isCikArticle(a)),
        [lista],
    );

    const rutaNom = (id) => {
        if (!id) return null;
        return rutes.find((r) => r.id === id)?.nom || null;
    };

    // Construye la lista canónica de fases para un artículo (3 base, 4 si CIK),
    // respetando los tiempos estándar ya configurados en el artículo o en su
    // ruta asignada. Las fases que falten se añaden activas con tiempo 0.
    const fasesCanoniques = (a) => {
        const expected = expectedFasesForArticle(a);
        const expectedSet = new Set(expected);
        const map = new Map();
        // ruta (base) → artículo (sobrescribe)
        const r = a?.ruta ? rutes.find((x) => x.id === a.ruta) : null;
        for (const c of parseFasesConfig(r?.fases_config)) {
            const key = canonFaseUtil(c.fase);
            if (expectedSet.has(key)) map.set(key, { fase: key, activa: c.activa !== false, temps_std_min: Number(c.temps_std_min) || 0 });
        }
        for (const c of parseFasesConfig(a?.fases_config)) {
            const key = canonFaseUtil(c.fase);
            if (expectedSet.has(key)) map.set(key, { fase: key, activa: c.activa !== false, temps_std_min: Number(c.temps_std_min) || 0 });
        }
        return expected
            .map((f) => map.get(f) || { fase: f, activa: true, temps_std_min: 0 })
            .sort((x, y) => faseOrdreUtil(x.fase) - faseOrdreUtil(y.fase));
    };

    const abrir = (a) => {
        setEditArticleFases({
            id: a.id,
            referencia: a.referencia || '',
            nom: a.nom || '',
            familia: a.familia || '',
            fases: fasesCanoniques(a),
        });
        setError('');
    };

    const desa = async () => {
        if (!editArticleFases?.id) return;
        setDesantArt(true);
        setError('');
        try {
            await pb.collection('articles').update(editArticleFases.id, {
                fases_config: editArticleFases.fases,
            }, { requestKey: `art-fases-${editArticleFases.id}` });
            await logHistorial('ruta_editada',
                `Tiempos de fase actualizados en artículo ${editArticleFases.referencia} (${editArticleFases.nom}).`,
                {
                    articulo_referencia: editArticleFases.referencia,
                    articulo_id: editArticleFases.id,
                });
            setEditArticleFases(null);
            recarrega && recarrega();
        } catch (e) {
            console.error(e);
            setError('No se han podido guardar los tiempos de fase del artículo.');
        } finally {
            setDesantArt(false);
        }
    };

    return (
        <section className="rounded-lg border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <Layers className="h-5 w-5 text-primary" />
                        <h3 className="font-display text-2xl uppercase">Tiempos por fase · Artículos</h3>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground max-w-2xl">
                        Define el tiempo estándar (min) de Fase 1, Fase 2 y Fase 3 por artículo. Los artículos CIK (R84-053 / R84-054) muestran además Fase 4.
                        Aplica a artículos con o sin ruta. El operario usa cada fase como una sola operación.
                    </p>
                </div>
                <input
                    value={buscador}
                    onChange={(e) => setBuscador(e.target.value)}
                    placeholder="Buscar referencia o nombre…"
                    className="h-9 w-56 rounded-md border border-input bg-background px-3 text-sm"
                />
            </div>

            {error && <p className="mx-4 mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

            <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                    <thead>
                        <tr className="border-b border-border bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                            <th className="px-4 py-3 font-semibold">Referencia</th>
                            <th className="px-4 py-3 font-semibold">Artículo</th>
                            <th className="px-4 py-3 font-semibold">Ruta</th>
                            <th className="px-4 py-3 font-semibold">F1</th>
                            <th className="px-4 py-3 font-semibold">F2</th>
                            <th className="px-4 py-3 font-semibold">F3</th>
                            {teFase4 && <th className="px-4 py-3 font-semibold">F4</th>}
                            <th className="px-4 py-3 font-semibold" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {lista.length === 0 ? (
                            <tr>
                                <td colSpan={teFase4 ? 8 : 7} className="px-4 py-10 text-center text-muted-foreground">
                                    No hay artículos que coincidan.
                                </td>
                            </tr>
                        ) : lista.map((a) => {
                            const fases = fasesCanoniques(a);
                            const rn = rutaNom(a.ruta);
                            const esCik = isCikArticle(a);
                            const fasesToShow = esCik
                                ? ['Fase 1', 'Fase 2', 'Fase 3', 'Fase 4']
                                : ['Fase 1', 'Fase 2', 'Fase 3'];
                            return (
                                <tr key={a.id} className="hover:bg-secondary/30">
                                    <td className="px-4 py-3 font-mono font-semibold">{a.referencia || '—'}</td>
                                    <td className="px-4 py-3">{a.nom || '—'}</td>
                                    <td className="px-4 py-3 text-muted-foreground">{rn || <span className="italic">Sin ruta</span>}</td>
                                    {['Fase 1', 'Fase 2', 'Fase 3', ...(teFase4 ? ['Fase 4'] : [])].map((nom) => {
                                        const f = fases.find((x) => x.fase === nom);
                                        const aplica = fasesToShow.includes(nom);
                                        return (
                                            <td key={nom} className="px-4 py-3 tabular-nums">
                                                {!aplica || !f || f.activa === false ? '—' : `${Number(f.temps_std_min) || 0} min`}
                                            </td>
                                        );
                                    })}
                                    <td className="px-4 py-3 text-right">
                                        <button
                                            type="button"
                                            onClick={() => abrir(a)}
                                            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-semibold hover:bg-secondary active:scale-95"
                                        >
                                            <Edit2 className="h-3.5 w-3.5" /> Editar fases
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {editArticleFases && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={() => !desantArt && setEditArticleFases(null)}>
                    <div className="modal-card w-full max-w-lg rounded-2xl bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between border-b border-border px-5 py-4">
                            <div>
                                <p className="font-display text-xl uppercase">Fases del artículo</p>
                                <p className="text-sm text-muted-foreground">
                                    <span className="font-mono font-semibold text-foreground">{editArticleFases.referencia}</span>
                                    {' · '}{editArticleFases.nom || 'Sin nombre'}
                                </p>
                            </div>
                            <button type="button" onClick={() => setEditArticleFases(null)} className="rounded-md p-2 hover:bg-secondary" disabled={desantArt}>
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="p-5 grid gap-3">
                            <p className="text-xs text-muted-foreground">
                                Define el tiempo estándar (min) de cada fase. Todos los artículos tienen Fase 1, 2 y 3; los artículos CIK (R84-053 / R84-054) tienen además Fase 4. El operario usa cada fase como una sola operación (también sin ruta predefinida).
                            </p>
                            {(editArticleFases.fases || FASES_DEFAULT).map((f, idx) => {
                                return (
                                <div key={f.fase} className="flex items-center gap-3 rounded-md border border-border p-2">
                                    <label className="flex items-center gap-2 text-sm font-semibold w-28 shrink-0">
                                        <input
                                            type="checkbox"
                                            checked={!!f.activa}
                                            onChange={(e) => setEditArticleFases({
                                                ...editArticleFases,
                                                fases: editArticleFases.fases.map((x, i) => (i === idx ? { ...x, activa: e.target.checked } : x)),
                                            })}
                                            className="h-4 w-4 rounded"
                                        />
                                        {f.fase}
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.5"
                                        value={f.temps_std_min ?? 0}
                                        disabled={!f.activa}
                                        onChange={(e) => setEditArticleFases({
                                            ...editArticleFases,
                                            fases: editArticleFases.fases.map((x, i) => (i === idx ? { ...x, temps_std_min: parseFloat(e.target.value) || 0 } : x)),
                                        })}
                                        className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm tabular-nums disabled:opacity-50"
                                        placeholder="Min estándar"
                                    />
                                </div>
                                );
                            })}
                            {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
                            <div className="flex gap-3 pt-1">
                                <button type="button" onClick={desa} disabled={desantArt}
                                    className="flex h-12 flex-1 items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60 active:scale-95">
                                    {desantArt ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                    {desantArt ? 'Guardando…' : 'Guardar tiempos'}
                                </button>
                                <button type="button" onClick={() => setEditArticleFases(null)} disabled={desantArt}
                                    className="h-12 rounded-md bg-secondary px-5 text-sm font-semibold disabled:opacity-60">
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    CheckCircle, Eye, History, Loader2, RotateCcw,
    Search, X,
} from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/lib/auth';

const ESTAT_LABEL = {
    no_validado: 'No validado',
    validado: 'Validado',
    rechazado: 'Rechazado',
};

const ESTAT_BADGE = {
    no_validado: 'bg-secondary text-secondary-foreground',
    validado: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]',
    rechazado: 'bg-destructive/15 text-destructive',
};

function fmtDate(d) {
    if (!d) return '—';
    try {
        return new Date(d).toLocaleString('es-ES', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    } catch { return String(d); }
}

function fmtDateShort(d) {
    if (!d) return '—';
    try {
        return new Date(d).toLocaleDateString('es-ES', {
            day: '2-digit', month: '2-digit', year: 'numeric',
        });
    } catch { return String(d); }
}

function todayISO() {
    const d = new Date();
    const off = d.getTimezoneOffset();
    const local = new Date(d.getTime() - off * 60000);
    return local.toISOString().slice(0, 10);
}

// Convierte una fecha de entrega (DD/MM/YYYY o YYYY-MM-DD) a YYYY-MM-DD
function normalitzaData(s) {
    if (!s) return '';
    const s2 = String(s).trim();
    const m = s2.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    const m2 = s2.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m2) return s2.slice(0, 10);
    return s2;
}

// ── Modal de detalles / historial de una exclusiva ──────────────────────────
function ModalDetalls({ exclusiva, historial, onClose }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl">
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                    <p className="font-display text-xl uppercase">Detalles de validación</p>
                    <button onClick={onClose} className="rounded-md p-1 hover:bg-secondary"><X className="h-5 w-5" /></button>
                </div>
                <div className="space-y-4 p-5">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <div><p className="text-xs text-muted-foreground">Exclusiva</p><p className="font-semibold">{exclusiva?.exclusiva}</p></div>
                        <div><p className="text-xs text-muted-foreground">Artículo</p><p className="font-semibold">{exclusiva?.article || '—'}</p></div>
                        <div><p className="text-xs text-muted-foreground">Unidades</p><p className="font-semibold tabular-nums">{exclusiva?.unitats || 0}</p></div>
                        <div><p className="text-xs text-muted-foreground">Estado actual</p>
                            <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${ESTAT_BADGE[exclusiva?.estado_validacion] || 'bg-secondary'}`}>
                                {ESTAT_LABEL[exclusiva?.estado_validacion] || '—'}
                            </span>
                        </div>
                        <div><p className="text-xs text-muted-foreground">Fecha validación</p><p className="font-semibold">{fmtDate(exclusiva?.fecha_validacion)}</p></div>
                        <div><p className="text-xs text-muted-foreground">Usuario validación</p><p className="font-semibold">{exclusiva?.expand?.usuario_validacion?.name || exclusiva?.expand?.usuario_validacion?.email || '—'}</p></div>
                    </div>
                    <div>
                        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            <History className="h-3.5 w-3.5" /> Historial de cambios
                        </p>
                        {historial.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Sin registros.</p>
                        ) : (
                            <div className="space-y-2">
                                {historial.map((h) => (
                                    <div key={h.id} className="flex items-start gap-3 rounded-md border border-border p-2.5 text-sm">
                                        <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${ESTAT_BADGE[h.estado] || 'bg-secondary'}`}>
                                            {h.estado}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs text-muted-foreground">{fmtDate(h.fecha_validacion || h.created)}</p>
                                            <p className="font-semibold">{h.expand?.usuario?.name || h.expand?.usuario?.email || '—'}</p>
                                            {h.motivo && <p className="mt-0.5 text-xs text-destructive">{h.motivo}</p>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex justify-end border-t border-border px-5 py-4">
                    <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary">Cerrar</button>
                </div>
            </div>
        </div>
    );
}

// ── Modal de resumen tras guardar ───────────────────────────────────────────
function ModalResum({ resum, onClose }) {
    if (!resum) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl">
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                    <div className="flex items-center gap-2 text-[hsl(var(--ok))]">
                        <CheckCircle className="h-5 w-5" />
                        <p className="font-display text-xl uppercase">Validación guardada</p>
                    </div>
                    <button onClick={onClose} className="rounded-md p-1 hover:bg-secondary"><X className="h-5 w-5" /></button>
                </div>
                <div className="space-y-4 p-5">
                    <div className="rounded-lg border border-[hsl(var(--ok))]/30 bg-[hsl(var(--ok))]/5 p-4 text-center">
                        <p className="font-display text-5xl tabular-nums text-[hsl(var(--ok))]">{resum.validades}</p>
                        <p className="mt-1 text-sm font-semibold">exclusivas validadas</p>
                    </div>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between border-b border-border pb-2">
                            <span className="text-muted-foreground">Sin validar (no marcadas)</span>
                            <span className="font-semibold tabular-nums">{resum.noValidades}</span>
                        </div>
                        <div className="flex justify-between border-b border-border pb-2">
                            <span className="text-muted-foreground">Fecha y hora</span>
                            <span className="font-semibold">{fmtDate(resum.fecha)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Validado por</span>
                            <span className="font-semibold">{resum.usuario}</span>
                        </div>
                    </div>
                </div>
                <div className="flex justify-end border-t border-border px-5 py-4">
                    <button onClick={onClose} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground active:scale-95">Cerrar</button>
                </div>
            </div>
        </div>
    );
}

// ── Modal de detalles de una validación del historial ───────────────────────
function ModalDetallsValidacio({ validacio, onClose }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl">
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                    <p className="font-display text-xl uppercase">Detalles de la validación</p>
                    <button onClick={onClose} className="rounded-md p-1 hover:bg-secondary"><X className="h-5 w-5" /></button>
                </div>
                <div className="space-y-4 p-5">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <div><p className="text-xs text-muted-foreground">Fecha</p><p className="font-semibold">{fmtDate(validacio.fecha)}</p></div>
                        <div><p className="text-xs text-muted-foreground">Usuario</p><p className="font-semibold">{validacio.usuario}</p></div>
                        <div><p className="text-xs text-muted-foreground">Validadas</p><p className="font-semibold tabular-nums text-[hsl(var(--ok))]">{validacio.validades}</p></div>
                        <div><p className="text-xs text-muted-foreground">No validadas</p><p className="font-semibold tabular-nums text-muted-foreground">{validacio.noValidades}</p></div>
                    </div>
                    <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Exclusivas validadas</p>
                        {validacio.exclusives.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Sin exclusivas.</p>
                        ) : (
                            <div className="max-h-64 overflow-auto rounded-md border border-border">
                                <table className="w-full text-sm">
                                    <thead className="bg-secondary text-left text-xs uppercase sticky top-0">
                                        <tr>
                                            <th className="px-3 py-2 font-semibold">Exclusiva</th>
                                            <th className="px-3 py-2 font-semibold">Artículo</th>
                                            <th className="px-3 py-2 font-semibold text-right">Uds</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {validacio.exclusives.map((e) => (
                                            <tr key={e.id}>
                                                <td className="px-3 py-1.5 font-semibold">{e.exclusiva}</td>
                                                <td className="px-3 py-1.5">{e.article || '—'}</td>
                                                <td className="px-3 py-1.5 text-right tabular-nums">{e.unitats || 0}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex justify-end border-t border-border px-5 py-4">
                    <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary">Cerrar</button>
                </div>
            </div>
        </div>
    );
}

// ── Component principal ──────────────────────────────────────────────────────
export default function ValidacioExclusives() {
    const { user } = useAuth();
    const [exclusives, setExclusives] = useState([]);
    const [carregant, setCarregant] = useState(true);
    const [detalls, setDetalls] = useState(null);
    const [detallsValidacio, setDetallsValidacio] = useState(null);
    const [desant, setDesant] = useState(false);
    const [resum, setResum] = useState(null);
    const [historial, setHistorial] = useState([]);
    const [carregantHistorial, setCarregantHistorial] = useState(true);

    // Filtros — por defecto mostrar TODAS las exclusivas sin validar (sin filtro de fecha)
    const [dataSel, setDataSel] = useState(todayISO());
    const [filtreData, setFiltreData] = useState(false);
    const [cerca, setCerca] = useState('');
    const [filtreArticle, setFiltreArticle] = useState('');
    const [filtreEstat, setFiltreEstat] = useState('no_validado');
    const [ordenar, setOrdenar] = useState('entrega');

    // Selección de checkboxes
    const [seleccio, setSeleccio] = useState(() => new Set());

    const carrega = useCallback(async () => {
        try {
            const list = await pb.collection('exclusives').getFullList({
                sort: '-created',
                expand: 'usuario_validacion,ruta',
                filter: "estat != 'desapareguda'",
                requestKey: 'val-ex-full',
            });
            setExclusives(list);
        } catch (err) {
            console.error('carrega validacio', err);
        } finally {
            setCarregant(false);
        }
    }, []);

    useEffect(() => { carrega(); }, [carrega]);

    const carregaHistorial = useCallback(async () => {
        try {
            const list = await pb.collection('validaciones_exclusivas').getFullList({
                sort: '-fecha_validacion',
                expand: 'usuario,exclusiva',
                requestKey: 'val-hist-full',
            });
            // Agrupar por fecha_validacion + usuario (mismo lote de guardado)
            const grups = new Map();
            for (const r of list) {
                if (r.estado !== 'validado') continue;
                const key = `${r.fecha_validacion}__${r.usuario}`;
                if (!grups.has(key)) {
                    grups.set(key, {
                        key,
                        fecha: r.fecha_validacion,
                        usuarioId: r.usuario,
                        usuario: r.expand?.usuario?.name || r.expand?.usuario?.email || '—',
                        validades: 0,
                        exclusives: [],
                    });
                }
                const g = grups.get(key);
                g.validades += 1;
                if (r.expand?.exclusiva) g.exclusives.push(r.expand.exclusiva);
            }
            // Ordenar por fecha desc
            const arr = [...grups.values()].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
            // Calcular "no validadas" en el momento: total exclusivas en sistema - validadas hasta esa fecha
            // Aproximación: total exclusivas (no desaparecidas) - validades del lote
            const totalExclusives = exclusives.length || 0;
            arr.forEach((g) => { g.noValidades = Math.max(0, totalExclusives - g.validades); });
            setHistorial(arr.slice(0, 20));
        } catch (err) {
            console.error('carrega historial', err);
        } finally {
            setCarregantHistorial(false);
        }
    }, [exclusives.length]);

    useEffect(() => { carregaHistorial(); }, [carregaHistorial]);

    useEffect(() => {
        void pb.collection('exclusives').subscribe('*', () => carrega()).catch(() => {});
        void pb.collection('validaciones_exclusivas').subscribe('*', () => carregaHistorial()).catch(() => {});
        return () => {
            void pb.collection('exclusives').unsubscribe('*').catch(() => {});
            void pb.collection('validaciones_exclusivas').unsubscribe('*').catch(() => {});
        };
    }, [carrega, carregaHistorial]);

    // ── Lista filtrada ──────────────────────────────────────────────────────
    const llistaFiltrada = useMemo(() => {
        const q = cerca.trim().toLowerCase();
        const dataNormalitzada = filtreData ? normalitzaData(dataSel) : '';
        let arr = exclusives.filter((e) => {
            if (filtreEstat && e.estado_validacion !== filtreEstat) {
                // "no_validado" también incluye las que no tienen estado
                if (!(filtreEstat === 'no_validado' && (!e.estado_validacion || e.estado_validacion === 'no_validado'))) return false;
            }
            if (filtreArticle && e.article !== filtreArticle) return false;
            if (q && !`${e.exclusiva} ${e.article} ${e.referencia}`.toLowerCase().includes(q)) return false;
            if (filtreData && dataNormalitzada) {
                const dEx = normalitzaData(e.data_entrega);
                if (dEx !== dataNormalitzada) return false;
            }
            return true;
        });
        // Ordenar
        arr = arr.sort((a, b) => {
            if (ordenar === 'entrega') {
                const da = normalitzaData(a.data_entrega) || '9999';
                const db = normalitzaData(b.data_entrega) || '9999';
                return da.localeCompare(db);
            }
            if (ordenar === 'exclusiva') return (a.exclusiva || '').localeCompare(b.exclusiva || '');
            return 0;
        });
        return arr;
    }, [exclusives, cerca, filtreArticle, filtreEstat, filtreData, dataSel, ordenar]);

    // ── Contadores ──────────────────────────────────────────────────────────
    const porValidar = useMemo(
        () => exclusives.filter((e) => !e.estado_validacion || e.estado_validacion === 'no_validado'),
        [exclusives],
    );
    const validades = useMemo(() => exclusives.filter((e) => e.estado_validacion === 'validado'), [exclusives]);
    const rebutjades = useMemo(() => exclusives.filter((e) => e.estado_validacion === 'rechazado'), [exclusives]);

    const marcadesCount = llistaFiltrada.filter((e) => seleccio.has(e.id)).length;
    const noMarcadesCount = llistaFiltrada.length - marcadesCount;

    // ── Acciones de selección ───────────────────────────────────────────────
    const toggle = (id) => {
        setSeleccio((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const marcarTots = () => {
        setSeleccio((prev) => {
            const next = new Set(prev);
            llistaFiltrada.forEach((e) => next.add(e.id));
            return next;
        });
    };

    const limpiar = () => setSeleccio(new Set());

    // ── Notificar ───────────────────────────────────────────────────────────
    const notificar = async (exclusiva) => {
        try {
            const destinataris = await pb.collection('users').getFullList({
                filter: "rol = 'admin' || rol = 'superadmin' || rol = 'produccio'",
                fields: 'id',
                requestKey: 'val-notif-users',
            });
            await Promise.all(destinataris.map((u, i) =>
                pb.collection('notifications').create({
                    destinatari: u.id,
                    tipus: 'exclusiva_validada',
                    titol: `Exclusiva validada: ${exclusiva.exclusiva}`,
                    missatge: `${exclusiva.article || ''} · ${exclusiva.unitats || 0} ud. — Confirmada en Onatex`,
                    link_id: exclusiva.id,
                    llegida: false,
                }, { requestKey: `val-notif-${i}-${exclusiva.id}` }).catch(() => {}),
            ));
        } catch (_) { /* non-blocking */ }
    };

    // ── Guardar validación ──────────────────────────────────────────────────
    const guardar = async () => {
        const aValidar = llistaFiltrada.filter((e) => seleccio.has(e.id));
        if (aValidar.length === 0) {
            alert('Marca al menos una exclusiva para validar.');
            return;
        }
        setDesant(true);
        const ara = new Date().toISOString();
        try {
            // 1. Actualizar cada exclusiva marcada → validado
            await Promise.all(aValidar.map((e, i) =>
                pb.collection('exclusives').update(e.id, {
                    estado_validacion: 'validado',
                    fecha_validacion: ara,
                    usuario_validacion: user?.id || '',
                    motivo_rechazo: '',
                }, { requestKey: `val-upd-${i}-${e.id}` }),
            ));
            // 2. Crear registro de auditoría por cada una
            await Promise.all(aValidar.map((e, i) =>
                pb.collection('validaciones_exclusivas').create({
                    exclusiva: e.id,
                    estado: 'validado',
                    fecha_validacion: ara,
                    usuario: user?.id || '',
                    motivo: '',
                }, { requestKey: `val-hist-${i}-${e.id}` }),
            ));
            // 3. Notificar
            aValidar.forEach((e) => { void notificar(e); });

            await Promise.all([carrega(), carregaHistorial()]);
            setResum({
                validades: aValidar.length,
                noValidades: llistaFiltrada.length - aValidar.length,
                fecha: ara,
                usuario: user?.name || user?.email || '—',
            });
            limpiar();
        } catch (err) {
            console.error('guardar validacio', err);
            alert('Error al guardar la validación. Revisa la consola.');
        } finally {
            setDesant(false);
        }
    };

    // ── Desvalidar (solo para validadas) ────────────────────────────────────
    const desvalidar = async (exclusiva) => {
        if (!confirm(`¿Desvalidar la exclusiva ${exclusiva.exclusiva}? Volverá a estado "no validado".`)) return;
        try {
            await pb.collection('exclusives').update(exclusiva.id, {
                estado_validacion: 'no_validado',
                fecha_validacion: null,
                usuario_validacion: '',
                motivo_rechazo: '',
            }, { requestKey: `val-desv-${exclusiva.id}` });
            await carrega();
        } catch (err) { console.error(err); }
    };

    const veureDetalls = async (exclusiva) => {
        try {
            const hist = await pb.collection('validaciones_exclusivas').getFullList({
                filter: `exclusiva = "${exclusiva.id}"`,
                sort: '-created',
                expand: 'usuario',
                requestKey: `val-hist-ex-${exclusiva.id}`,
            });
            setDetalls({ exclusiva, historial: hist });
        } catch (err) {
            setDetalls({ exclusiva, historial: [] });
        }
    };

    const articles = useMemo(() => {
        const set = new Set();
        exclusives.forEach((e) => { if (e.article) set.add(e.article); });
        return [...set].sort();
    }, [exclusives]);

    return (
        <div className="space-y-5">
            {/* Cabecera de validación de Onatex */}
            <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="font-display text-2xl uppercase">Validación de Onatex</p>
                        <p className="text-sm text-muted-foreground">
                            Marca las exclusivas que has visto en Onatex y guarda la validación.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Usuario:</span>
                        <span className="font-semibold text-foreground">{user?.name || user?.email}</span>
                    </div>
                </div>
            </div>

            {/* Resumen de conteos */}
            <div className="grid gap-3 sm:grid-cols-3">
                {[
                    { label: 'Por validar', valor: porValidar.length, color: 'text-muted-foreground' },
                    { label: 'Validadas', valor: validades.length, color: 'text-[hsl(var(--ok))]' },
                    { label: 'Rechazadas', valor: rebutjades.length, color: 'text-destructive' },
                ].map(({ label, valor, color }) => (
                    <div key={label} className="rounded-lg border border-border bg-card p-4">
                        <div className={`text-xs uppercase tracking-wide ${color}`}>{label}</div>
                        <p className="font-display text-4xl mt-2 tabular-nums">{valor}</p>
                    </div>
                ))}
            </div>

            {/* Filtros */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Fecha de entrega</label>
                        <div className="flex items-center gap-2">
                            <input
                                type="date"
                                value={dataSel}
                                onChange={(e) => setDataSel(e.target.value)}
                                disabled={!filtreData}
                                className="h-9 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50" />
                            <label className="flex items-center gap-1.5 text-xs">
                                <input type="checkbox" checked={filtreData} onChange={(e) => setFiltreData(e.target.checked)} className="accent-[hsl(var(--accent))]" />
                                Filtrar por fecha
                            </label>
                        </div>
                    </div>
                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Buscar</label>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                value={cerca}
                                onChange={(e) => setCerca(e.target.value)}
                                placeholder="Número de exclusiva..."
                                className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Artículo</label>
                        <select value={filtreArticle} onChange={(e) => setFiltreArticle(e.target.value)}
                            className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                            <option value="">Todos</option>
                            {articles.map((a) => <option key={a} value={a}>{a}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Estado</label>
                        <select value={filtreEstat} onChange={(e) => setFiltreEstat(e.target.value)}
                            className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                            <option value="">Todos</option>
                            <option value="no_validado">No validadas</option>
                            <option value="validado">Validadas</option>
                            <option value="rechazado">Rechazadas</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Ordenar por</label>
                        <select value={ordenar} onChange={(e) => setOrdenar(e.target.value)}
                            className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                            <option value="entrega">Fecha de entrega</option>
                            <option value="exclusiva">Número de exclusiva</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Tabla de exclusivas con checkboxes */}
            <div className="rounded-lg border border-border bg-card">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 bg-secondary/40">
                    <div className="flex items-center gap-3">
                        <p className="font-display text-lg uppercase">Lista de exclusivas</p>
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-bold tabular-nums">{llistaFiltrada.length}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={marcarTots}
                            className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-secondary">
                            Marcar todas
                        </button>
                        <button onClick={limpiar}
                            className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-secondary">
                            <RotateCcw className="h-3.5 w-3.5" /> Limpiar selección
                        </button>
                    </div>
                </div>

                {/* Resumen de selección antes de guardar */}
                {llistaFiltrada.length > 0 && (
                    <div className="flex flex-wrap items-center gap-4 border-b border-border px-4 py-2 text-xs">
                        <span className="flex items-center gap-1.5 text-[hsl(var(--ok))]">
                            <CheckCircle className="h-3.5 w-3.5" />
                            <span className="font-semibold tabular-nums">{marcadesCount}</span> a validar
                        </span>
                        <span className="text-muted-foreground">
                            <span className="font-semibold tabular-nums">{noMarcadesCount}</span> sin validar (no marcadas)
                        </span>
                    </div>
                )}

                <div className="overflow-auto">
                    <table className="w-full min-w-[760px] text-sm">
                        <thead className="bg-secondary text-left text-xs uppercase">
                            <tr>
                                <th className="px-3 py-2 font-semibold w-10">
                                    {filtreEstat === 'no_validado' || filtreEstat === '' ? (
                                        <input
                                            type="checkbox"
                                            checked={llistaFiltrada.length > 0 && llistaFiltrada.every((e) => seleccio.has(e.id))}
                                            onChange={(e) => e.target.checked ? marcarTots() : limpiar()}
                                            className="accent-[hsl(var(--ok))]" />
                                    ) : null}
                                </th>
                                {['Exclusiva', 'Artículo', 'Unidades', 'Entrega', 'Estado', 'Acciones'].map((h) => (
                                    <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {carregant ? (
                                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Cargando...</td></tr>
                            ) : llistaFiltrada.length === 0 ? (
                                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Sin exclusivas con los filtros actuales.</td></tr>
                            ) : llistaFiltrada.map((e) => {
                                const marcat = seleccio.has(e.id);
                                const jaValidada = e.estado_validacion === 'validado';
                                return (
                                    <tr key={e.id} className={`hover:bg-secondary/30 ${marcat ? 'bg-[hsl(var(--ok))]/5' : ''}`}>
                                        <td className="px-3 py-2">
                                            <input
                                                type="checkbox"
                                                checked={marcat}
                                                onChange={() => toggle(e.id)}
                                                className="h-4 w-4 accent-[hsl(var(--ok))]" />
                                        </td>
                                        <td className="px-3 py-2 font-semibold">{e.exclusiva}</td>
                                        <td className="px-3 py-2">{e.article || '—'}</td>
                                        <td className="px-3 py-2 tabular-nums">{e.unitats || 0}</td>
                                        <td className="px-3 py-2">{fmtDateShort(e.data_entrega)}</td>
                                        <td className="px-3 py-2">
                                            <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${ESTAT_BADGE[e.estado_validacion] || 'bg-secondary'}`}>
                                                {ESTAT_LABEL[e.estado_validacion] || 'No validado'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2">
                                            <div className="flex flex-wrap gap-1.5">
                                                {jaValidada && (
                                                    <button onClick={() => desvalidar(e)}
                                                        className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs font-semibold hover:bg-secondary">
                                                        <RotateCcw className="h-3 w-3" /> Desvalidar
                                                    </button>
                                                )}
                                                <button onClick={() => veureDetalls(e)}
                                                    className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs font-semibold hover:bg-secondary">
                                                    <Eye className="h-3 w-3" /> Detalles
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Botones de guardar */}
                {llistaFiltrada.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
                        <p className="text-sm text-muted-foreground">
                            {marcadesCount > 0
                                ? <>Se validaran <span className="font-semibold text-foreground tabular-nums">{marcadesCount}</span> exclusivas al guardar.</>
                                : 'Marca las exclusivas que has visto en Onatex.'}
                        </p>
                        <div className="flex gap-2">
                            <button onClick={limpiar}
                                disabled={seleccio.size === 0}
                                className="rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary disabled:opacity-50">
                                Limpiar selección
                            </button>
                            <button
                                onClick={guardar}
                                disabled={marcadesCount === 0 || desant}
                                className="flex items-center gap-2 rounded-md bg-[hsl(var(--ok))] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 active:scale-95">
                                {desant ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                                Guardar validación ({marcadesCount})
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Historial de validaciones */}
            <div className="rounded-lg border border-border bg-card">
                <div className="flex items-center gap-2 border-b border-border px-4 py-3 bg-secondary/40">
                    <History className="h-4 w-4 text-muted-foreground" />
                    <p className="font-display text-lg uppercase">Historial de validaciones</p>
                </div>
                <div className="overflow-auto">
                    <table className="w-full min-w-[640px] text-sm">
                        <thead className="bg-secondary text-left text-xs uppercase">
                            <tr>
                                {['Fecha', 'Usuario', 'Validadas', 'No validadas', 'Detalles'].map((h) => (
                                    <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {carregantHistorial ? (
                                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Cargando...</td></tr>
                            ) : historial.length === 0 ? (
                                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Sin validaciones registradas.</td></tr>
                            ) : historial.map((h) => (
                                <tr key={h.key} className="hover:bg-secondary/30">
                                    <td className="px-3 py-2">{fmtDate(h.fecha)}</td>
                                    <td className="px-3 py-2">{h.usuario}</td>
                                    <td className="px-3 py-2 tabular-nums text-[hsl(var(--ok))] font-semibold">{h.validades}</td>
                                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{h.noValidades}</td>
                                    <td className="px-3 py-2">
                                        <button onClick={() => setDetallsValidacio(h)}
                                            className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs font-semibold hover:bg-secondary">
                                            <Eye className="h-3 w-3" /> Ver
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modales */}
            {detalls && (
                <ModalDetalls
                    exclusiva={detalls.exclusiva}
                    historial={detalls.historial}
                    onClose={() => setDetalls(null)}
                />
            )}

            {detallsValidacio && (
                <ModalDetallsValidacio
                    validacio={detallsValidacio}
                    onClose={() => setDetallsValidacio(null)}
                />
            )}

            {resum && (
                <ModalResum
                    resum={resum}
                    onClose={() => setResum(null)}
                />
            )}
        </div>
    );
}

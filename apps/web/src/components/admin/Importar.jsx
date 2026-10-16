import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Plus, Trash2 } from 'lucide-react';
import pb from '@/lib/pocketbaseClient';

const MAX_MONOS_PER_EXCLUSIVA = 200;

const TALLA_OPCIONS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '46', '48', '50', '52', '54', '56', '58'];

const buit = () => ({
    exclusiva: '',
    referencia: '',
    article: '',
    marca: '',
    unitats: '',
    talla_info: [],
    data_real_recepcio: '',
    data_entrega: '',
    express: false,
    prioritat: 'normal',
    observacions: '',
    ruta: '',
    minuts_previstos: '',
});

const Importar = ({ rutes, exclusives, articles, recarrega }) => {
    const [form, setForm] = useState(buit());
    const [desant, setDesant] = useState(false);
    const [ok, setOk] = useState(null);
    const [errMsg, setErrMsg] = useState('');
    const [cercant, setCercant] = useState(false);
    const refTimer = useRef(null);

    // Auto-lookup article by referencia
    useEffect(() => {
        const ref = form.referencia.trim().toUpperCase();
        if (!ref) {
            setForm((f) => ({ ...f, article: '', ruta: '', minuts_previstos: '' }));
            return;
        }
        clearTimeout(refTimer.current);
        refTimer.current = setTimeout(async () => {
            setCercant(true);
            try {
                // Try from already-loaded articles first
                const art = articles.find(
                    (a) => a.referencia?.toUpperCase() === ref
                );
                if (art) {
                    const rutaObj = rutes.find((r) => r.id === art.ruta);
                    const ops = rutaObj?.operacions || [];
                    const minPerUnit = ops.reduce((a, o) => a + Number(o.temps_estandard_min || 0), 0);
                    const unitats = parseInt(form.unitats) || 0;
                    setForm((f) => ({
                        ...f,
                        article: art.nom || art.referencia,
                        ruta: art.ruta || '',
                        minuts_previstos: minPerUnit > 0 ? String(minPerUnit * (unitats || 1)) : String(art.temps_estandard_total_min || ''),
                    }));
                }
            } finally {
                setCercant(false);
            }
        }, 300);
        return () => clearTimeout(refTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form.referencia, articles, rutes]);

    // Recalculate minuts_previstos when unitats changes
    useEffect(() => {
        const ref = form.referencia.trim().toUpperCase();
        if (!ref || !form.ruta) return;
        const rutaObj = rutes.find((r) => r.id === form.ruta);
        const ops = rutaObj?.operacions || [];
        const minPerUnit = ops.reduce((a, o) => a + Number(o.temps_estandard_min || 0), 0);
        const unitats = parseInt(form.unitats) || 0;
        if (minPerUnit > 0 && unitats > 0) {
            setForm((f) => ({ ...f, minuts_previstos: String(minPerUnit * unitats) }));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form.unitats, form.ruta]);

    const toggleTalla = (t) => {
        setForm((f) => ({
            ...f,
            talla_info: f.talla_info.includes(t)
                ? f.talla_info.filter((x) => x !== t)
                : [...f.talla_info, t],
        }));
    };

    const desa = async () => {
        setErrMsg('');
        const codi = form.exclusiva.trim();
        const unitats = parseInt(form.unitats) || 0;
        if (!codi) { setErrMsg('El número de exclusiva es obligatorio.'); return; }
        if (!unitats || unitats < 1) { setErrMsg('La cantidad debe ser mayor que 0.'); return; }
        if (exclusives.find((e) => e.exclusiva === codi)) {
            setErrMsg(`La exclusiva "${codi}" ya existe. Edítala desde la pestaña Exclusivas.`);
            return;
        }

        setDesant(true);
        try {
            const rutaObj = rutes.find((r) => r.id === form.ruta);
            const record = await pb.collection('exclusives').create({
                exclusiva: codi,
                referencia: form.referencia.trim().toUpperCase(),
                article: form.article.trim(),
                marca: form.marca.trim(),
                unitats,
                talla_info: form.talla_info,
                data_real_recepcio: form.data_real_recepcio,
                data_entrega: form.data_entrega,
                express: form.express,
                prioritat: form.prioritat,
                observacions: form.observacions.trim(),
                ruta: form.ruta || '',
                minuts_previstos: Number(form.minuts_previstos) || 0,
                estat: 'pendent',
                estado_validacion: 'no_validado',
            });

            // Generate monos
            const total = Math.min(unitats, MAX_MONOS_PER_EXCLUSIVA);
            for (let n = 1; n <= total; n++) {
                await pb.collection('monos').create(
                    {
                        exclusiva: record.id,
                        numero: n,
                        codi: `${codi}-${String(n).padStart(3, '0')}`,
                        estat: 'pendent',
                        operacio_actual: rutaObj?.operacions?.[0]?.nom || '',
                    },
                    { requestKey: `mono-${codi}-${n}` },
                );
            }

            setOk({ codi, monos: total, unitats });
            setForm(buit());
            recarrega();
        } catch (err) {
            setErrMsg(err?.message || 'Error al crear la exclusiva.');
        } finally {
            setDesant(false);
        }
    };

    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    return (
        <div className="mx-auto max-w-2xl">
            <div className="rounded-lg border border-border bg-card p-6">
                <h3 className="font-display text-3xl uppercase">Nueva exclusiva</h3>
                <p className="text-sm text-muted-foreground mt-1">
                    Introduce los datos manualmente. Se generarán los monos automáticamente.
                </p>

                {ok && (
                    <div className="mt-4 flex items-start gap-3 rounded-md bg-[hsl(var(--ok))]/10 p-4">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--ok))]" />
                        <div className="text-sm">
                            <p className="font-semibold text-[hsl(var(--ok))]">Exclusiva creada correctamente</p>
                            <p>
                                {ok.codi} · {ok.monos} monos generados
                                {ok.monos < ok.unitats ? ` (límite ${MAX_MONOS_PER_EXCLUSIVA})` : ''}
                            </p>
                        </div>
                    </div>
                )}

                {errMsg && (
                    <p className="mt-4 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{errMsg}</p>
                )}

                <div className="mt-6 grid gap-5">
                    {/* Exclusiva + Referencia */}
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-2">
                            <label className="text-sm font-semibold">Número de exclusiva *</label>
                            <input
                                value={form.exclusiva}
                                onChange={(e) => set('exclusiva', e.target.value)}
                                placeholder="18815"
                                className="h-12 rounded-md border border-input bg-background px-3 font-mono text-base"
                            />
                        </div>
                        <div className="grid gap-2">
                            <label className="text-sm font-semibold">Referencia de artículo</label>
                            <div className="relative">
                                <input
                                    value={form.referencia}
                                    onChange={(e) => set('referencia', e.target.value)}
                                    placeholder="R82-020"
                                    className="h-12 w-full rounded-md border border-input bg-background px-3 font-mono text-base"
                                />
                                {cercant && (
                                    <Loader2 className="absolute right-3 top-3.5 h-5 w-5 animate-spin text-muted-foreground" />
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Article (auto-filled) */}
                    {form.article && (
                        <div className="rounded-md bg-secondary/60 px-4 py-3 text-sm">
                            <span className="font-semibold">Artículo detectado: </span>{form.article}
                            {form.ruta && (
                                <span className="ml-2 text-muted-foreground">
                                    · Ruta: {rutes.find((r) => r.id === form.ruta)?.nom || '—'}
                                </span>
                            )}
                        </div>
                    )}

                    {/* Marca + Cantidad */}
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-2">
                            <label className="text-sm font-semibold">Marca</label>
                            <input
                                value={form.marca}
                                onChange={(e) => set('marca', e.target.value)}
                                placeholder="Alpinestars"
                                className="h-12 rounded-md border border-input bg-background px-3"
                            />
                        </div>
                        <div className="grid gap-2">
                            <label className="text-sm font-semibold">Cantidad (unidades) *</label>
                            <input
                                type="number"
                                min="1"
                                value={form.unitats}
                                onChange={(e) => set('unitats', e.target.value)}
                                placeholder="5"
                                className="h-12 rounded-md border border-input bg-background px-3 tabular-nums"
                            />
                        </div>
                    </div>

                    {/* Tallas */}
                    <div className="grid gap-2">
                        <label className="text-sm font-semibold">Tallas</label>
                        <div className="flex flex-wrap gap-2">
                            {TALLA_OPCIONS.map((t) => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => toggleTalla(t)}
                                    className={`rounded-md border px-3 py-1.5 text-sm font-semibold transition active:scale-95 ${
                                        form.talla_info.includes(t)
                                            ? 'border-[hsl(var(--accent))] bg-[hsl(var(--accent))]/10 text-[hsl(var(--accent))]'
                                            : 'border-border bg-background text-foreground'
                                    }`}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Fechas */}
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-2">
                            <label className="text-sm font-semibold">Fecha de recepción</label>
                            <input
                                type="date"
                                value={form.data_real_recepcio}
                                onChange={(e) => set('data_real_recepcio', e.target.value)}
                                className="h-12 rounded-md border border-input bg-background px-3"
                            />
                        </div>
                        <div className="grid gap-2">
                            <label className="text-sm font-semibold">Fecha de entrega</label>
                            <input
                                type="date"
                                value={form.data_entrega}
                                onChange={(e) => set('data_entrega', e.target.value)}
                                className="h-12 rounded-md border border-input bg-background px-3"
                            />
                        </div>
                    </div>

                    {/* Express + Prioridad */}
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-2">
                            <label className="text-sm font-semibold">Prioridad</label>
                            <select
                                value={form.prioritat}
                                onChange={(e) => set('prioritat', e.target.value)}
                                className="h-12 rounded-md border border-input bg-background px-3 text-sm"
                            >
                                <option value="normal">Normal</option>
                                <option value="alta">Alta</option>
                                <option value="express">Express</option>
                            </select>
                        </div>
                        <div className="flex items-end pb-1">
                            <label className="flex cursor-pointer items-center gap-3 rounded-md border border-input bg-background px-4 h-12 w-full">
                                <input
                                    type="checkbox"
                                    checked={form.express}
                                    onChange={(e) => set('express', e.target.checked)}
                                    className="h-5 w-5 accent-[hsl(var(--accent))]"
                                />
                                <span className="text-sm font-semibold">Express</span>
                            </label>
                        </div>
                    </div>

                    {/* Minutos previstos (editable) */}
                    <div className="grid gap-2">
                        <label className="text-sm font-semibold">Minutos previstos</label>
                        <input
                            type="number"
                            min="0"
                            value={form.minuts_previstos}
                            onChange={(e) => set('minuts_previstos', e.target.value)}
                            placeholder="Auto-calculado por ruta"
                            className="h-12 rounded-md border border-input bg-background px-3 tabular-nums"
                        />
                        <p className="text-xs text-muted-foreground">Se calcula automáticamente al introducir la referencia. Puedes ajustarlo manualmente.</p>
                    </div>

                    {/* Observaciones */}
                    <div className="grid gap-2">
                        <label className="text-sm font-semibold">Observaciones</label>
                        <textarea
                            value={form.observacions}
                            onChange={(e) => set('observacions', e.target.value)}
                            rows={3}
                            placeholder="Notas adicionales sobre esta exclusiva..."
                            className="rounded-md border border-input bg-background p-3 text-sm resize-none"
                        />
                    </div>

                    {/* Vista previa de monos */}
                    {form.exclusiva.trim() && parseInt(form.unitats) > 0 && (
                        <div className="rounded-md bg-secondary/50 p-4 text-sm">
                            <p className="font-semibold mb-2">Monos que se generarán:</p>
                            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-auto">
                                {Array.from({ length: Math.min(parseInt(form.unitats) || 0, 20) }, (_, i) => (
                                    <span key={i} className="rounded bg-background border border-border px-2 py-0.5 font-mono text-xs">
                                        {form.exclusiva.trim()}-{String(i + 1).padStart(3, '0')}
                                    </span>
                                ))}
                                {parseInt(form.unitats) > 20 && (
                                    <span className="rounded bg-background border border-border px-2 py-0.5 font-mono text-xs text-muted-foreground">
                                        +{parseInt(form.unitats) - 20} más...
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Submit */}
                    <button
                        onClick={desa}
                        disabled={desant}
                        className="flex h-14 w-full items-center justify-center gap-3 rounded-lg bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] text-lg font-semibold active:scale-[0.99] disabled:opacity-60"
                    >
                        {desant ? <Loader2 className="h-6 w-6 animate-spin" /> : <Plus className="h-6 w-6" />}
                        {desant ? 'Creando exclusiva y monos...' : 'Crear exclusiva'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Importar;

import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle, CheckCircle2, ChevronRight, Layers, Loader2, Plus, Route, X,
} from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/lib/auth';
import PropagarOperacionModal from '@/components/produccio/PropagarOperacionModal';
import { resolveRutaExclusiva } from '@/lib/operacionsUtils';

/**
 * Modal rápido para añadir una operación a una exclusiva concreta desde
 * el detalle de exclusiva (rol Producción / Admin / Super Admin).
 *
 * Flujo:
 *  1. Formulario táctil: elegir operación existente de la ruta o crear una
 *     nueva (codi, nom, descripcio, temps_std_min, fase, posición/ordre,
 *     op_anterior opcional).
 *  2. "Añadir a esta exclusiva": añade la operación SOLO a esta exclusiva
 *     (clonando la ruta si es compartida / es la ruta del artículo) y
 *     recalcula minuts_previstos. Registra historial.
 *  3. Pregunta: ¿añadir también al artículo para futuras exclusivas?
 *     - Sí → actualiza la ruta/plantilla del artículo (sin tocar otras
 *       exclusivas existentes). Registra historial.
 *     - No → se conserva solo en la exclusiva concreta.
 *  4. Confirmación resumen de dónde se añadió.
 *
 * Reutiliza el sistema existente: operacions_def + rutes + historial_cambios_exclusivas.
 */
export default function AnadirOperacionModal({ exclusiva, onClose, onSaved }) {
    const { user } = useAuth();

    const [carregant, setCarregant] = useState(true);
    const [rutaOps, setRutaOps] = useState([]);        // operacions_def de la ruta actual
    const [rutaActual, setRutaActual] = useState(null); // record rutes
    const [articles, setArticles] = useState([]);
    const [todasOpsDef, setTodasOpsDef] = useState([]);

    // Formulario
    const [modo, setModo] = useState('nueva'); // 'nueva' | 'existente'
    const [opExistenteId, setOpExistenteId] = useState('');
    const [form, setForm] = useState({
        codi: '', nom: '', descripcio: '', temps_std_min: 0, fase: '', ordre: '', op_anterior: '',
    });

    // Fases conocidas de la ruta (para sugerir)
    const fasesConocidas = useMemo(
        () => Array.from(new Set(rutaOps.map((o) => o.fase).filter(Boolean))).sort(),
        [rutaOps],
    );

    const ordreSugerido = useMemo(() => {
        if (!rutaOps.length) return 1;
        return Math.max(...rutaOps.map((o) => Number(o.ordre) || 0)) + 1;
    }, [rutaOps]);

    // Estado del flujo
    const [fase, setFase] = useState('form'); // 'form' | 'pregunta-articulo' | 'resumen'
    const [aplicando, setAplicando] = useState(false);
    const [error, setError] = useState('');
    const [resumen, setResumen] = useState(null);

    // Resultado intermedio tras añadir a la exclusiva
    const [resultadoExclusiva, setResultadoExclusiva] = useState(null);

    // Propagación de la operación añadida (a artículo + exclusivas programadas)
    const [propagarActiu, setPropagarActiu] = useState(false);

    // Ruta efectiva: directa o resuelta por artículo/referencia (misma lógica que Producción/Operarios)
    const [rutaResueltaId, setRutaResueltaId] = useState(null);

    useEffect(() => {
        let cancelado = false;
        const cargar = async () => {
            setCarregant(true);
            try {
                const [arts, allOps, rutesList] = await Promise.all([
                    pb.collection('articles').getFullList({ expand: 'ruta', requestKey: 'anop-arts' }).catch(() => []),
                    pb.collection('operacions_def').getFullList({ sort: 'ordre', requestKey: 'anop-opsall' }).catch(() => []),
                    pb.collection('rutes').getFullList({ requestKey: 'anop-rutes' }).catch(() => []),
                ]);
                if (cancelado) return;
                setArticles(arts);
                setTodasOpsDef(allOps);

                const resolved = resolveRutaExclusiva(exclusiva, rutesList, arts);
                const rutaId = resolved.rutaId
                    || (typeof exclusiva.ruta === 'string' ? exclusiva.ruta : exclusiva.ruta?.id)
                    || exclusiva.expand?.ruta?.id
                    || null;
                setRutaResueltaId(rutaId);

                if (rutaId) {
                    const [ruta, ops] = await Promise.all([
                        pb.collection('rutes').getOne(rutaId, { requestKey: 'anop-ruta' }).catch(() => null),
                        pb.collection('operacions_def').getFullList({
                            filter: `ruta = "${rutaId}"`, sort: 'ordre', requestKey: 'anop-opsruta',
                        }).catch(() => []),
                    ]);
                    if (cancelado) return;
                    setRutaActual(ruta);
                    setRutaOps(ops);
                    setForm((f) => ({ ...f, ordre: String(Math.max(...ops.map((o) => Number(o.ordre) || 0), 0) + 1) }));
                } else {
                    setRutaActual(null);
                    setRutaOps([]);
                    setForm((f) => ({ ...f, ordre: '1' }));
                }
            } finally {
                if (!cancelado) setCarregant(false);
            }
        };
        cargar();
        return () => { cancelado = true; };
    }, [exclusiva.id, exclusiva.ruta, exclusiva.referencia, exclusiva.article]);

    // ── Helpers ──────────────────────────────────────────────────────────────
    const articleReferencia = useMemo(() => {
        return (exclusiva.referencia || exclusiva.article || '').toString().toUpperCase().trim();
    }, [exclusiva]);

    const articleActual = useMemo(() => {
        const ref = articleReferencia;
        if (!ref) return null;
        return articles.find((a) => (a.referencia || '').toString().toUpperCase().trim() === ref)
            || articles.find((a) => (a.nom || '').toString().toUpperCase().trim() === ref)
            || null;
    }, [articles, articleReferencia]);

    // Artículos que comparten la misma ruta que el artículo de esta exclusiva
    const articlesCompartintRuta = useMemo(() => {
        const rid = typeof articleActual?.ruta === 'string'
            ? articleActual.ruta
            : articleActual?.ruta?.id || articleActual?.expand?.ruta?.id || '';
        if (!rid) return [];
        return articles.filter((a) => {
            const aRid = typeof a.ruta === 'string' ? a.ruta : a.ruta?.id || a.expand?.ruta?.id || '';
            return aRid === rid;
        });
    }, [articles, articleActual]);

    const rutaArticleNom = useMemo(
        () => articleActual?.expand?.ruta?.nom || '',
        [articleActual],
    );

    const setCampo = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    const elegirExistente = (id) => {
        setOpExistenteId(id);
        const op = rutaOps.find((o) => o.id === id) || todasOpsDef.find((o) => o.id === id);
        if (op) {
            setForm({
                codi: op.codi || '',
                nom: op.nom || '',
                descripcio: op.descripcio || '',
                temps_std_min: Number(op.temps_std_min) || 0,
                fase: op.fase || '',
                ordre: String(Number(op.ordre) || ordreSugerido),
                op_anterior: op.op_anterior || '',
            });
        }
    };

    // Duplicar un record operacions_def hacia otra ruta
    const duplicarOp = async (op, rutaIdDestino, requestKey) => {
        const payload = {
            codi: op.codi || '',
            nom: op.nom || '',
            fase: op.fase || '',
            fase_ordre: Number(op.fase_ordre) || 0,
            ordre: Number(op.ordre) || 0,
            descripcio: op.descripcio || '',
            instruccions: op.instruccions || '',
            peca_zona: op.peca_zona || '',
            maquina: op.maquina || '',
            especialitat: op.especialitat || '',
            temps_std_min: Number(op.temps_std_min) || 0,
            temps_prep_min: Number(op.temps_prep_min) || 0,
            unitats_lot: Number(op.unitats_lot) || 0,
            op_anterior: op.op_anterior || '',
            op_seguent: op.op_seguent || '',
            paralel: !!op.paralel,
            te_control_qualitat: !!op.te_control_qualitat,
            defectes_frequents: op.defectes_frequents || '',
            actiu: op.actiu !== false,
            ruta: rutaIdDestino,
        };
        return pb.collection('operacions_def').create(payload, { requestKey });
    };

    const calcMinutsFromOps = (opsList, unitats) => {
        const minPerUnit = opsList.reduce((a, o) => a + (Number(o.temps_std_min) || 0), 0);
        return Math.round(minPerUnit * (Number(unitats) || 1));
    };

    // ── Paso 1: añadir a la exclusiva concreta ───────────────────────────────
    const anadirAExclusiva = async () => {
        setError('');
        const codi = form.codi.trim().toUpperCase();
        const nom = form.nom.trim();
        if (!codi) { setError('Indica un código de operación.'); return; }
        if (!nom) { setError('Indica un nombre de operación.'); return; }

        setAplicando(true);
        try {
            const ahora = new Date().toISOString();
            const minutsAnterior = Number(exclusiva.minuts_previstos) || 0;
            const unitats = Number(exclusiva.unitats) || 1;
            // Usar ruta resuelta (directa o vía artículo), no solo el campo directa
            const rutaAnteriorId = rutaResueltaId
                || (typeof exclusiva.ruta === 'string' ? exclusiva.ruta : exclusiva.ruta?.id)
                || '';
            const rutaAnteriorNom = rutaActual?.nom || '';

            // Construir payload de la nueva operación
            const nuevaOpPayload = {
                codi,
                nom,
                fase: form.fase.trim() || '',
                fase_ordre: 0,
                ordre: Number(form.ordre) || ordreSugerido,
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

            let rutaFinalId = rutaAnteriorId;
            let rutaFinalNom = rutaAnteriorNom;
            let opsParaCalcular = [...rutaOps];

            if (!rutaAnteriorId) {
                // Sin ruta: crear una ruta privada para esta exclusiva
                const nomRuta = `Ruta ${exclusiva.exclusiva}${exclusiva.article ? ' · ' + exclusiva.article : ''}`;
                const nuevaRuta = await pb.collection('rutes').create({
                    nom: nomRuta,
                    article: exclusiva.article || '',
                    per_defecte: false,
                    operacions: [{ nom, temps_estandard_min: Number(form.temps_std_min) || 0 }],
                    estat_ruta: 'activa',
                }, { requestKey: 'anop-ruta-new' });
                rutaFinalId = nuevaRuta.id;
                rutaFinalNom = nomRuta;
                nuevaOpPayload.ruta = rutaFinalId;
                await pb.collection('operacions_def').create(nuevaOpPayload, { requestKey: 'anop-op-new' });
                opsParaCalcular = [nuevaOpPayload];
            } else {
                // ¿La ruta es compartida o es la ruta del artículo?
                const otrasExcl = await pb.collection('exclusives').getFullList({
                    filter: `ruta = "${rutaAnteriorId}" && id != "${exclusiva.id}"`,
                    requestKey: 'anop-otras',
                }).catch(() => []);
                const esRutaArticulo = !!articleActual && articleActual.ruta === rutaAnteriorId;
                const compartida = otrasExcl.length > 0 || esRutaArticulo;

                if (compartida) {
                    // Clonar ruta → asignar clon solo a esta exclusiva
                    const nomClon = `${rutaAnteriorNom} · ${exclusiva.exclusiva}`;
                    const rutaClon = await pb.collection('rutes').create({
                        nom: nomClon,
                        article: rutaActual?.article || exclusiva.article || '',
                        per_defecte: false,
                        operacions: (rutaActual?.operacions || []).map((o) => ({
                            nom: o.nom, temps_estandard_min: Number(o.temps_estandard_min || 0) || 0,
                        })).concat([{ nom, temps_estandard_min: Number(form.temps_std_min) || 0 }]),
                        estat_ruta: rutaActual?.estat_ruta || 'activa',
                        notas: `Ruta clonada para exclusiva ${exclusiva.exclusiva}`,
                    }, { requestKey: 'anop-ruta-clon' });
                    rutaFinalId = rutaClon.id;
                    rutaFinalNom = nomClon;

                    // Duplicar todas las operaciones existentes hacia el clon
                    for (let i = 0; i < rutaOps.length; i++) {
                        await duplicarOp(rutaOps[i], rutaFinalId, `anop-dup-${i}`);
                    }
                    // Añadir la nueva operación al clon
                    nuevaOpPayload.ruta = rutaFinalId;
                    await pb.collection('operacions_def').create(nuevaOpPayload, { requestKey: 'anop-op-clon' });
                    opsParaCalcular = [...rutaOps, nuevaOpPayload];
                } else {
                    // Ruta ya privada de esta exclusiva → añadir directamente
                    nuevaOpPayload.ruta = rutaFinalId;
                    await pb.collection('operacions_def').create(nuevaOpPayload, { requestKey: 'anop-op-direct' });
                    opsParaCalcular = [...rutaOps, nuevaOpPayload];
                    // Actualizar también el JSON operacions de la ruta
                    const opsJson = (rutaActual?.operacions || []).map((o) => ({
                        nom: o.nom, temps_estandard_min: Number(o.temps_estandard_min || 0) || 0,
                    })).concat([{ nom, temps_estandard_min: Number(form.temps_std_min) || 0 }]);
                    await pb.collection('rutes').update(rutaFinalId, { operacions: opsJson }, { requestKey: 'anop-ruta-json' }).catch(() => {});
                }
            }

            // Recalcular minuts_previstos de la exclusiva
            const minutsNuevo = calcMinutsFromOps(opsParaCalcular, unitats);
            const updateData = { minuts_previstos: minutsNuevo };
            if (rutaFinalId !== rutaAnteriorId) updateData.ruta = rutaFinalId;
            await pb.collection('exclusives').update(exclusiva.id, updateData, { requestKey: 'anop-excl-upd' });

            // Historial: operación añadida a la exclusiva concreta
            await pb.collection('historial_cambios_exclusivas').create({
                exclusiva_id: exclusiva.id,
                tipo_cambio: 'operacion_anadida',
                ruta_anterior: rutaAnteriorNom,
                ruta_nueva: rutaFinalNom,
                operacion_id: codi,
                operacion_nombre: `${codi} · ${nom}`,
                cambio_descripcion: `Operación "${codi} · ${nom}" (${Number(form.temps_std_min) || 0} min) añadida a la exclusiva ${exclusiva.exclusiva}.`,
                minuts_anterior: minutsAnterior,
                minuts_nuevo: minutsNuevo,
                usuario_id: user?.id || null,
                fecha_cambio: ahora,
            }, { requestKey: 'anop-hist-excl' }).catch(() => {});

            setResultadoExclusiva({
                codi, nom, temps: Number(form.temps_std_min) || 0,
                minutsAnterior, minutsNuevo, rutaNom: rutaFinalNom, clonada: rutaFinalId !== rutaAnteriorId,
            });

            // ¿Hay artículo para preguntar?
            if (articleActual) {
                setFase('pregunta-articulo');
            } else {
                setResumen({
                    exclusiva: { ok: true, nom: exclusiva.exclusiva },
                    articulo: { ok: false, motivo: 'Sin artículo vinculado' },
                });
                setFase('resumen');
            }
        } catch (e) {
            console.error('Error añadiendo operación a exclusiva', e);
            setError('No se ha podido añadir la operación. Revisa los permisos y los datos.');
        } finally {
            setAplicando(false);
        }
    };

    // ── Paso 2: añadir al artículo para futuras exclusivas ───────────────────
    const anadirAArticulo = async () => {
        if (!articleActual || !resultadoExclusiva) return;
        setAplicando(true);
        setError('');
        try {
            const ahora = new Date().toISOString();
            const { codi, nom, temps } = resultadoExclusiva;
            let rutaArtId = articleActual.ruta || '';
            let rutaArtNom = '';
            let opsArt = [];

            if (rutaArtId) {
                const [rutaArt, ops] = await Promise.all([
                    pb.collection('rutes').getOne(rutaArtId, { requestKey: 'anop-art-ruta' }).catch(() => null),
                    pb.collection('operacions_def').getFullList({
                        filter: `ruta = "${rutaArtId}"`, sort: 'ordre', requestKey: 'anop-art-ops',
                    }).catch(() => []),
                ]);
                rutaArtNom = rutaArt?.nom || 'Ruta artículo';
                opsArt = ops;
                // Evitar duplicar si ya existe una op con mismo codi en la ruta del artículo
                const yaExiste = opsArt.some((o) => (o.codi || '').toUpperCase() === codi);
                if (!yaExiste) {
                    const ordreNuevo = Math.max(0, ...opsArt.map((o) => Number(o.ordre) || 0)) + 1;
                    await pb.collection('operacions_def').create({
                        codi, nom,
                        fase: form.fase.trim() || '',
                        fase_ordre: 0,
                        ordre: ordreNuevo,
                        descripcio: form.descripcio.trim(),
                        instruccions: '',
                        peca_zona: '',
                        maquina: '',
                        especialitat: '',
                        temps_std_min: temps,
                        temps_prep_min: 0,
                        unitats_lot: 0,
                        op_anterior: form.op_anterior || '',
                        op_seguent: '',
                        paralel: false,
                        te_control_qualitat: false,
                        defectes_frequents: '',
                        actiu: true,
                        ruta: rutaArtId,
                    }, { requestKey: 'anop-art-op' });
                    // Actualizar JSON operacions de la ruta del artículo
                    const opsJson = (rutaArt?.operacions || []).map((o) => ({
                        nom: o.nom, temps_estandard_min: Number(o.temps_estandard_min || 0) || 0,
                    })).concat([{ nom, temps_estandard_min: temps }]);
                    await pb.collection('rutes').update(rutaArtId, { operacions: opsJson }, { requestKey: 'anop-art-json' }).catch(() => {});
                    opsArt = [...opsArt, { temps_std_min: temps }];
                }
            } else {
                // El artículo no tiene ruta: crear una y asignarla
                rutaArtNom = `Ruta ${articleActual.referencia || articleActual.nom || 'artículo'}`;
                const nuevaRuta = await pb.collection('rutes').create({
                    nom: rutaArtNom,
                    article: articleActual.referencia || articleActual.nom || '',
                    per_defecte: false,
                    operacions: [{ nom, temps_estandard_min: temps }],
                    estat_ruta: 'activa',
                }, { requestKey: 'anop-art-ruta-new' });
                rutaArtId = nuevaRuta.id;
                await pb.collection('operacions_def').create({
                    codi, nom,
                    fase: form.fase.trim() || '',
                    fase_ordre: 0,
                    ordre: 1,
                    descripcio: form.descripcio.trim(),
                    instruccions: '',
                    peca_zona: '',
                    maquina: '',
                    especialitat: '',
                    temps_std_min: temps,
                    temps_prep_min: 0,
                    unitats_lot: 0,
                    op_anterior: '',
                    op_seguent: '',
                    paralel: false,
                    te_control_qualitat: false,
                    defectes_frequents: '',
                    actiu: true,
                    ruta: rutaArtId,
                }, { requestKey: 'anop-art-op-new' });
                // Asignar la ruta al artículo
                await pb.collection('articles').update(articleActual.id, { ruta: rutaArtId }, { requestKey: 'anop-art-asig' });
                opsArt = [{ temps_std_min: temps }];
            }

            // Recalcular temps_estandard_total_min del artículo
            const totalMinArt = opsArt.reduce((a, o) => a + (Number(o.temps_std_min) || 0), 0);
            await pb.collection('articles').update(articleActual.id, {
                temps_estandard_total_min: totalMinArt,
            }, { requestKey: 'anop-art-total' }).catch(() => {});

            // Historial: operación añadida al artículo (para futuras exclusivas)
            await pb.collection('historial_cambios_exclusivas').create({
                exclusiva_id: exclusiva.id,
                tipo_cambio: 'operacion_anadida',
                ruta_anterior: resultadoExclusiva.rutaNom,
                ruta_nueva: rutaArtNom,
                operacion_id: codi,
                operacion_nombre: `${codi} · ${nom}`,
                cambio_descripcion: `Operación "${codi} · ${nom}" (${temps} min) añadida al artículo ${articleActual.referencia || articleActual.nom} para futuras exclusivas. No se modifican otras exclusivas existentes.`,
                minuts_anterior: resultadoExclusiva.minutsAnterior,
                minuts_nuevo: resultadoExclusiva.minutsNuevo,
                usuario_id: user?.id || null,
                fecha_cambio: ahora,
            }, { requestKey: 'anop-hist-art' }).catch(() => {});

            setResumen({
                exclusiva: { ok: true, nom: exclusiva.exclusiva },
                articulo: { ok: true, nom: articleActual.referencia || articleActual.nom, ruta: rutaArtNom },
            });
            setFase('resumen');
        } catch (e) {
            console.error('Error añadiendo operación al artículo', e);
            setError('No se ha podido añadir la operación al artículo.');
        } finally {
            setAplicando(false);
        }
    };

    const soloExclusiva = () => {
        setResumen({
            exclusiva: { ok: true, nom: exclusiva.exclusiva },
            articulo: { ok: false, motivo: 'No añadida al artículo (solo esta exclusiva)' },
        });
        setFase('resumen');
    };

    const cerrarYRecargar = () => {
        onSaved && onSaved();
        onClose && onClose();
    };

    // ── Render ───────────────────────────────────────────────────────────────
    if (carregant) {
        return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
                <div className="modal-card w-full max-w-lg rounded-2xl bg-card p-8 text-center" onClick={(e) => e.stopPropagation()}>
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                    <p className="mt-3 text-sm text-muted-foreground">Cargando operaciones…</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div className="modal-card w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-card px-5 py-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--accent))]/15 text-[hsl(var(--accent))]">
                            <Plus className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <p className="font-display text-xl uppercase truncate">Añadir operación</p>
                            <p className="text-xs text-muted-foreground truncate">
                                Exclusiva {exclusiva.exclusiva}{exclusiva.article ? ` · ${exclusiva.article}` : ''}
                                {rutaActual ? ` · Ruta ${rutaActual.nom}` : ' · Sin ruta'}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="rounded-md p-2 hover:bg-secondary shrink-0" aria-label="Cerrar">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {/* ── Fase 1: formulario ── */}
                    {fase === 'form' && (
                        <>
                            {/* Selección de modo */}
                            {rutaOps.length > 0 && (
                                <div className="grid grid-cols-2 gap-2">
                                    <button onClick={() => setModo('nueva')}
                                        className={`h-11 rounded-lg border text-sm font-semibold ${modo === 'nueva' ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`}>
                                        Nueva operación
                                    </button>
                                    <button onClick={() => setModo('existente')}
                                        className={`h-11 rounded-lg border text-sm font-semibold ${modo === 'existente' ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`}>
                                        De la ruta actual
                                    </button>
                                </div>
                            )}

                            {modo === 'existente' && rutaOps.length > 0 && (
                                <div>
                                    <label className="text-xs font-semibold uppercase text-muted-foreground">Operación existente</label>
                                    <select value={opExistenteId} onChange={(e) => elegirExistente(e.target.value)}
                                        className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
                                        <option value="">— Selecciona —</option>
                                        {rutaOps.map((o) => (
                                            <option key={o.id} value={o.id}>{o.codi} · {o.nom}</option>
                                        ))}
                                    </select>
                                    <p className="mt-1 text-xs text-muted-foreground">Se añadirá una copia editable; ajusta los datos antes de confirmar.</p>
                                </div>
                            )}

                            {/* Campos */}
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
                                    placeholder="Descripción corta de la operación"
                                    className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm" />
                            </div>

                            <div>
                                <label className="text-xs font-semibold uppercase text-muted-foreground">Descripción / instrucciones</label>
                                <textarea value={form.descripcio} onChange={(e) => setCampo('descripcio', e.target.value)} rows={2}
                                    placeholder="Notas para el operario (opcional)"
                                    className="mt-1 w-full rounded-md border border-input bg-background p-3 text-sm" />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-semibold uppercase text-muted-foreground">Fase</label>
                                    {fasesConocidas.length > 0 ? (
                                        <input list="anop-fases" value={form.fase} onChange={(e) => setCampo('fase', e.target.value)}
                                            placeholder="Fase 1, …"
                                            className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm" />
                                    ) : (
                                        <input value={form.fase} onChange={(e) => setCampo('fase', e.target.value)}
                                            placeholder="Fase (opcional)"
                                            className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm" />
                                    )}
                                    {fasesConocidas.length > 0 && (
                                        <datalist id="anop-fases">
                                            {fasesConocidas.map((f) => <option key={f} value={f} />)}
                                        </datalist>
                                    )}
                                </div>
                                <div>
                                    <label className="text-xs font-semibold uppercase text-muted-foreground">Posición (orden)</label>
                                    <input type="number" min="1" value={form.ordre} onChange={(e) => setCampo('ordre', e.target.value)}
                                        className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm tabular-nums" />
                                </div>
                            </div>

                            {rutaOps.length > 0 && (
                                <div>
                                    <label className="text-xs font-semibold uppercase text-muted-foreground">Depende de (op. anterior)</label>
                                    <select value={form.op_anterior} onChange={(e) => setCampo('op_anterior', e.target.value)}
                                        className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
                                        <option value="">Sin dependencia (disponible ya)</option>
                                        {rutaOps.map((o) => (
                                            <option key={o.id} value={o.codi}>{o.codi} · {o.nom}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {!rutaActual && (
                                <div className="flex items-start gap-2 rounded-lg bg-[hsl(var(--warn))]/10 p-3 text-sm text-[hsl(var(--warn))]">
                                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                    <span>Esta exclusiva no tiene ruta. Se creará una ruta privada para ella con esta operación (no se convierte en trabajo libre).</span>
                                </div>
                            )}
                            {rutaActual && (
                                <div className="flex items-start gap-2 rounded-lg bg-primary/5 p-3 text-xs text-muted-foreground">
                                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                                    <span>Si la ruta es compartida o es la ruta del artículo, se creará una copia privada para esta exclusiva. Las demás exclusivas no se modifican.</span>
                                </div>
                            )}

                            {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

                            <div className="flex gap-3 pt-1">
                                <button onClick={anadirAExclusiva} disabled={aplicando}
                                    className="flex h-12 flex-1 items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground active:scale-95 disabled:opacity-50">
                                    {aplicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                    {aplicando ? 'Añadiendo…' : 'Añadir a esta exclusiva'}
                                </button>
                                <button onClick={onClose} disabled={aplicando}
                                    className="h-12 rounded-md bg-secondary px-5 text-sm font-semibold disabled:opacity-50">Cancelar</button>
                            </div>
                        </>
                    )}

                    {/* ── Fase 2: preguntar artículo ── */}
                    {fase === 'pregunta-articulo' && resultadoExclusiva && (
                        <div className="text-center py-2">
                            <CheckCircle2 className="mx-auto h-12 w-12 text-[hsl(var(--ok))] mb-3" />
                            <p className="font-display text-2xl uppercase">Operación añadida</p>
                            <p className="mt-2 text-sm text-muted-foreground">
                                «{resultadoExclusiva.codi} · {resultadoExclusiva.nom}» ({resultadoExclusiva.temps} min) añadida a la exclusiva <strong>{exclusiva.exclusiva}</strong>.
                                {resultadoExclusiva.clonada && ' Se creó una ruta privada para no afectar al resto.'}
                            </p>

                            <div className="mt-5 rounded-lg border border-border bg-secondary/40 p-4 text-left">
                                <p className="text-sm font-semibold flex items-center gap-2">
                                    <Route className="h-4 w-4 text-[hsl(var(--accent))]" />
                                    ¿Publicar en la ruta para futuras exclusivas?
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Artículo: <strong>{articleActual?.referencia || articleActual?.nom}</strong>
                                    {articleActual?.ruta ? ` · Ruta «${rutaArticleNom || 'artículo'}»` : ' (sin ruta; se creará una)'}.{' '}
                                    La operación se publicará en la ruta del artículo y la heredarán las futuras exclusivas que usen esa ruta.
                                    {articlesCompartintRuta.length > 1 && (
                                        <span className="block mt-1 text-[hsl(var(--accent))]"><strong>Ruta compartida por {articlesCompartintRuta.length} artículos:</strong> {articlesCompartintRuta.map((a) => a.referencia || a.nom).filter(Boolean).join(', ')}. La publicación afecta a futuras exclusivas de todos ellos.</span>
                                    )}
                                    {' '}Las exclusivas ya existentes no se modifican automáticamente.
                                </p>
                            </div>

                            {error && <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

                            <div className="mt-5 grid grid-cols-2 gap-3">
                                <button onClick={soloExclusiva} disabled={aplicando}
                                    className="h-11 rounded-md bg-secondary text-sm font-semibold disabled:opacity-50">
                                    No, solo esta exclusiva
                                </button>
                                <button onClick={anadirAArticulo} disabled={aplicando}
                                    className="flex h-11 items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50">
                                    {aplicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Route className="h-4 w-4" />}
                                    {aplicando ? 'Publicando…' : 'Sí, publicar en ruta'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── Fase 3: resumen ── */}
                    {fase === 'resumen' && resumen && (
                        <div className="text-center py-2">
                            <CheckCircle2 className="mx-auto h-12 w-12 text-[hsl(var(--ok))] mb-3" />
                            <p className="font-display text-2xl uppercase">Listo</p>
                            <div className="mt-4 space-y-2 text-left">
                                <div className={`rounded-lg p-3 text-sm ${resumen.exclusiva.ok ? 'bg-[hsl(var(--ok))]/10 text-[hsl(var(--ok))]' : 'bg-destructive/10 text-destructive'}`}>
                                    <p className="font-semibold flex items-center gap-2">
                                        <CheckCircle2 className="h-4 w-4" /> Exclusiva {resumen.exclusiva.nom}
                                    </p>
                                    <p className="text-xs mt-0.5 text-muted-foreground">Operación añadida a esta exclusiva y tiempos recalculados.</p>
                                </div>
                                <div className={`rounded-lg p-3 text-sm ${resumen.articulo.ok ? 'bg-[hsl(var(--ok))]/10 text-[hsl(var(--ok))]' : 'bg-secondary text-muted-foreground'}`}>
                                    <p className="font-semibold flex items-center gap-2">
                                        <CheckCircle2 className="h-4 w-4" /> Artículo {resumen.articulo.ok ? (resumen.articulo.nom || '—') : '—'}
                                    </p>
                                    <p className="text-xs mt-0.5">
                                        {resumen.articulo.ok
                                            ? `Añadida a la ruta «${resumen.articulo.ruta}» para futuras exclusivas.`
                                            : resumen.articulo.motivo}
                                    </p>
                                </div>
                            </div>
                            <p className="mt-3 text-xs text-muted-foreground">Historial registrado: quién, cuándo, operación, tiempos y alcance.</p>
                            <button onClick={cerrarYRecargar} className="mt-3 h-11 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground">
                                Cerrar
                            </button>
                            {!resumen.articulo.ok && articleActual && resultadoExclusiva && (
                                <button
                                    onClick={anadirAArticulo}
                                    disabled={aplicando}
                                    className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[hsl(var(--accent))] text-sm font-semibold text-[hsl(var(--accent-foreground))] active:scale-95 disabled:opacity-50"
                                >
                                    {aplicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Route className="h-4 w-4" />}
                                    {aplicando ? 'Publicando…' : 'Publicar en ruta (futuras exclusivas)'}
                                </button>
                            )}
                            <button
                                onClick={() => setPropagarActiu(true)}
                                className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-md border-2 border-[hsl(var(--accent))] text-[hsl(var(--accent))] text-sm font-semibold active:scale-95 hover:bg-[hsl(var(--accent))]/10 transition"
                            >
                                <Layers className="h-4 w-4" /> Propagar operación
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Propagar la operación añadida a artículo + exclusivas programadas */}
            {propagarActiu && resultadoExclusiva && (
                <PropagarOperacionModal
                    operacion={{
                        codi: resultadoExclusiva.codi,
                        nom: resultadoExclusiva.nom,
                        descripcio: form.descripcio,
                        temps_std_min: resultadoExclusiva.temps,
                        fase: form.fase,
                        ordre: Number(form.ordre) || 0,
                        op_anterior: form.op_anterior || '',
                    }}
                    exclusiva={exclusiva}
                    onClose={() => setPropagarActiu(false)}
                    onSaved={onSaved}
                />
            )}
        </div>
    );
}

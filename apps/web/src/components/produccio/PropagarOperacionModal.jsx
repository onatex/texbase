import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle, CheckCircle2, ChevronRight, Copy, Loader2, Layers, Route, X,
} from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/lib/auth';
import { resolveRutaExclusiva } from '@/lib/operacionsUtils';

/**
 * Modal para PROPAGAR una operación (ya añadida a una exclusiva concreta) a:
 *  - la ruta/plantilla del artículo (para futuras exclusivas), y/o
 *  - las exclusivas ya programadas de ese mismo artículo (selección clara),
 *    incluyendo propagación masiva (varias exclusivas a la vez).
 *
 * Flujo:
 *  1. Carga artículo (por referencia) + exclusivas del mismo artículo.
 *  2. Selección: checkbox «plantilla del artículo» + lista de exclusivas
 *     programadas con checkboxes (bulk: seleccionar todas / ninguna).
 *     Las exclusivas en estados protegidos (entregada, finalitzada,
 *     lista_recollida, desapareguda, rechazado, bloquejada) se muestran
 *     aparte y requieren confirmación adicional para incluirse.
 *  3. Resumen + confirmación: cuántas exclusivas y qué artículo/ruta se
 *     verán afectados.
 *  4. Ejecución: respeta operaciones ya iniciadas/completadas (no las
 *     toca), evita duplicados (por codi), mantiene orden/dependencias/
 *     fase/tiempo, recalcula minuts_previstos y registra historial
 *     (tipo_cambio = operacion_propagada) por cada destino.
 *  5. Confirmación final con el detalle de dónde se aplicó.
 *
 * Reutiliza el sistema existente: operacions_def + rutes + historial_cambios_exclusivas.
 */
export default function PropagarOperacionModal({ operacion: operacionProp, exclusiva, onClose, onSaved }) {
    const { user } = useAuth();

    const [carregant, setCarregant] = useState(true);
    const [articles, setArticles] = useState([]);
    const [todasExclusives, setTodasExclusives] = useState([]);
    const [rutaArticulo, setRutaArticulo] = useState(null); // record rutes del artículo
    const [opsRuta, setOpsRuta] = useState([]); // operaciones de la ruta de la exclusiva origen
    const [operacionSel, setOperacionSel] = useState(operacionProp || null);

    // Selección
    const [propagarArticulo, setPropagarArticulo] = useState(true);
    const [seleccionadas, setSeleccionadas] = useState(new Set()); // ids de exclusivas
    const [aceptarProtegidas, setAceptarProtegidas] = useState(false);

    // Flujo
    const [fase, setFase] = useState(operacionProp ? 'seleccion' : 'picker'); // 'picker' | 'seleccion' | 'confirmacion' | 'resumen'
    const [aplicando, setAplicando] = useState(false);
    const [error, setError] = useState('');
    const [resumen, setResumen] = useState(null);

    // Operación efectiva a propagar (la pasada por props o la seleccionada en el picker)
    const operacion = operacionProp || operacionSel;

    useEffect(() => {
        let cancelado = false;
        const cargar = async () => {
            setCarregant(true);
            try {
                const [arts, exs, rutesList] = await Promise.all([
                    pb.collection('articles').getFullList({ expand: 'ruta', requestKey: 'prop-arts' }).catch(() => []),
                    pb.collection('exclusives').getFullList({ filter: "estat != 'desapareguda'", requestKey: 'prop-exs' }).catch(() => []),
                    pb.collection('rutes').getFullList({ requestKey: 'prop-rutes' }).catch(() => []),
                ]);
                if (cancelado) return;
                setArticles(arts);
                setTodasExclusives(exs);
                // Si no se pasó una operación, cargar las ops de la ruta resuelta de la exclusiva origen
                if (!operacion && exclusiva) {
                    const resolved = resolveRutaExclusiva(exclusiva, rutesList, arts);
                    const rutaId = resolved.rutaId
                        || (typeof exclusiva.ruta === 'string' ? exclusiva.ruta : exclusiva.ruta?.id)
                        || exclusiva.expand?.ruta?.id
                        || null;
                    if (rutaId) {
                        const ops = await pb.collection('operacions_def').getFullList({
                            filter: `ruta = "${rutaId}"`, sort: 'ordre', requestKey: 'prop-ops-ruta',
                        }).catch(() => []);
                        if (!cancelado) setOpsRuta(ops || []);
                    } else if (!cancelado) {
                        setOpsRuta([]);
                    }
                }
            } finally {
                if (!cancelado) setCarregant(false);
            }
        };
        cargar();
        return () => { cancelado = true; };
    }, []);

    // ── Helpers ──────────────────────────────────────────────────────────────
    const articleReferencia = useMemo(
        () => (exclusiva?.referencia || exclusiva?.article || '').toString().toUpperCase().trim(),
        [exclusiva],
    );
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

    // Cargar la ruta del artículo cuando se resuelva
    useEffect(() => {
        let cancelado = false;
        const cargarRuta = async () => {
            const rid = articleActual?.ruta || articleActual?.expand?.ruta?.id || null;
            if (!rid) { setRutaArticulo(null); return; }
            try {
                const r = await pb.collection('rutes').getOne(rid, { requestKey: 'prop-ruta-art' });
                if (!cancelado) setRutaArticulo(r);
            } catch { if (!cancelado) setRutaArticulo(null); }
        };
        cargarRuta();
        return () => { cancelado = true; };
    }, [articleActual]);

    const PROTEGIDOS = useMemo(
        () => new Set(['entregada', 'finalitzada', 'lista_recollida', 'desapareguda', 'rechazado', 'bloquejada']),
        [],
    );

    // Exclusivas del mismo artículo (excluyendo la origen)
    const exclusivasArticulo = useMemo(() => {
        const ref = articleReferencia;
        if (!ref) return [];
        return todasExclusives.filter((e) => {
            if (e.id === exclusiva?.id) return false;
            const eRef = (e.referencia || '').toString().toUpperCase().trim();
            const eArt = (e.article || '').toString().toUpperCase().trim();
            return eRef === ref || eArt === ref;
        });
    }, [todasExclusives, articleReferencia, exclusiva?.id]);

    const programadas = useMemo(
        () => exclusivasArticulo.filter((e) => !PROTEGIDOS.has(e.estat)),
        [exclusivasArticulo, PROTEGIDOS],
    );
    const protegidas = useMemo(
        () => exclusivasArticulo.filter((e) => PROTEGIDOS.has(e.estat)),
        [exclusivasArticulo, PROTEGIDOS],
    );

    const seleccionadasValidas = useMemo(() => {
        const ids = new Set(seleccionadas);
        if (!aceptarProtegidas) {
            return programadas.filter((e) => ids.has(e.id));
        }
        return exclusivasArticulo.filter((e) => ids.has(e.id));
    }, [seleccionadas, aceptarProtegidas, programadas, exclusivasArticulo]);

    const toggleSel = (id) => {
        setSeleccionadas((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };
    const selTodas = () => setSeleccionadas(new Set(programadas.map((e) => e.id)));
    const selNinguna = () => setSeleccionadas(new Set());

    const haySeleccion = propagarArticulo || seleccionadasValidas.length > 0;

    // ── Construir payload de la operación a propagar ─────────────────────────
    const buildOpPayload = (ordreDestino, opAnteriorDestino) => ({
        codi: operacion.codi || '',
        nom: operacion.nom || '',
        fase: operacion.fase || '',
        fase_ordre: 0,
        ordre: ordreDestino,
        descripcio: operacion.descripcio || '',
        instruccions: '',
        peca_zona: '',
        maquina: '',
        especialitat: '',
        temps_std_min: Number(operacion.temps_std_min) || 0,
        temps_prep_min: 0,
        unitats_lot: 0,
        op_anterior: opAnteriorDestino || '',
        op_seguent: '',
        paralel: false,
        te_control_qualitat: false,
        defectes_frequents: '',
        actiu: true,
    });

    const calcMinutsFromOps = async (rutaId, unitats) => {
        try {
            const ops = await pb.collection('operacions_def').getFullList({
                filter: `ruta = "${rutaId}"`, requestKey: `prop-calc-${rutaId}`,
            }).catch(() => []);
            const minPerUnit = ops.reduce((a, o) => a + (Number(o.temps_std_min) || 0), 0);
            return Math.round(minPerUnit * (Number(unitats) || 1));
        } catch {
            return Math.round((Number(operacion.temps_std_min) || 0) * (Number(unitats) || 1));
        }
    };

    // ── Propagar a la plantilla del artículo ─────────────────────────────────
    const propagarAArticulo = async () => {
        if (!articleActual) return { ok: false, motivo: 'Sin artículo vinculado' };
        const codi = (operacion.codi || '').toUpperCase();
        let rutaArtId = articleActual.ruta || articleActual.expand?.ruta?.id || '';
        let rutaArtNom = '';

        if (rutaArtId) {
            const ruta = rutaArticulo || await pb.collection('rutes').getOne(rutaArtId, { requestKey: 'prop-art-ruta-get' }).catch(() => null);
            rutaArtNom = ruta?.nom || 'Ruta artículo';
            const opsArt = await pb.collection('operacions_def').getFullList({
                filter: `ruta = "${rutaArtId}"`, sort: 'ordre', requestKey: 'prop-art-ops',
            }).catch(() => []);
            const yaExiste = opsArt.some((o) => (o.codi || '').toUpperCase() === codi);
            if (yaExiste) {
                return { ok: true, ruta: rutaArtNom, duplicado: true };
            }
            const ordreNuevo = Math.max(0, ...opsArt.map((o) => Number(o.ordre) || 0)) + 1;
            // op_anterior válido dentro de la ruta del artículo
            const codisArt = new Set(opsArt.map((o) => (o.codi || '').toUpperCase()));
            const opAnt = operacion.op_anterior && codisArt.has(String(operacion.op_anterior).toUpperCase())
                ? operacion.op_anterior : '';
            await pb.collection('operacions_def').create(
                { ...buildOpPayload(ordreNuevo, opAnt), ruta: rutaArtId },
                { requestKey: 'prop-art-op' },
            );
            // Actualizar JSON operacions de la ruta del artículo
            const opsJson = (ruta?.operacions || []).map((o) => ({
                nom: o.nom, temps_estandard_min: Number(o.temps_estandard_min || 0) || 0,
            })).concat([{ nom: operacion.nom, temps_estandard_min: Number(operacion.temps_std_min) || 0 }]);
            await pb.collection('rutes').update(rutaArtId, { operacions: opsJson }, { requestKey: 'prop-art-json' }).catch(() => {});
        } else {
            // El artículo no tiene ruta: crear una y asignarla
            rutaArtNom = `Ruta ${articleActual.referencia || articleActual.nom || 'artículo'}`;
            const nuevaRuta = await pb.collection('rutes').create({
                nom: rutaArtNom,
                article: articleActual.referencia || articleActual.nom || '',
                per_defecte: false,
                operacions: [{ nom: operacion.nom, temps_estandard_min: Number(operacion.temps_std_min) || 0 }],
                estat_ruta: 'activa',
            }, { requestKey: 'prop-art-ruta-new' });
            rutaArtId = nuevaRuta.id;
            await pb.collection('operacions_def').create(
                { ...buildOpPayload(1, ''), ruta: rutaArtId },
                { requestKey: 'prop-art-op-new' },
            );
            await pb.collection('articles').update(articleActual.id, { ruta: rutaArtId }, { requestKey: 'prop-art-asig' });
        }

        // Recalcular temps_estandard_total_min del artículo
        try {
            const opsArt = await pb.collection('operacions_def').getFullList({
                filter: `ruta = "${rutaArtId}"`, requestKey: 'prop-art-total',
            }).catch(() => []);
            const totalMinArt = opsArt.reduce((a, o) => a + (Number(o.temps_std_min) || 0), 0);
            await pb.collection('articles').update(articleActual.id, {
                temps_estandard_total_min: totalMinArt,
            }, { requestKey: 'prop-art-total-upd' }).catch(() => {});
        } catch {}

        // Historial
        await pb.collection('historial_cambios_exclusivas').create({
            exclusiva_id: exclusiva?.id || '',
            tipo_cambio: 'operacion_propagada',
            ruta_anterior: '',
            ruta_nueva: rutaArtNom,
            operacion_id: codi,
            operacion_nombre: `${codi} · ${operacion.nom}`,
            cambio_descripcion: `Operación "${codi} · ${operacion.nom}" (${Number(operacion.temps_std_min) || 0} min) propagada a la plantilla del artículo ${articleActual.referencia || articleActual.nom} para futuras exclusivas.`,
            usuario_id: user?.id || null,
            fecha_cambio: new Date().toISOString(),
            alcance: 'articulo',
            exclusiva_origen: exclusiva?.exclusiva || '',
        }, { requestKey: 'prop-hist-art' }).catch(() => {});

        return { ok: true, ruta: rutaArtNom, duplicado: false };
    };

    // ── Propagar a una exclusiva concreta ────────────────────────────────────
    const propagarAExclusiva = async (ex) => {
        const codi = (operacion.codi || '').toUpperCase();
        const rutaAnteriorId = ex.ruta || '';
        const rutaArtId = articleActual?.ruta || articleActual?.expand?.ruta?.id || '';
        const minutsAnterior = Number(ex.minuts_previstos) || 0;
        const unitats = Number(ex.unitats) || 1;

        let rutaFinalId = rutaAnteriorId;
        let rutaFinalNom = '';
        let clonada = false;
        let duplicado = false;

        // Sin ruta → crear ruta privada con la operación
        if (!rutaAnteriorId) {
            const nomRuta = `Ruta ${ex.exclusiva}${ex.article ? ' · ' + ex.article : ''}`;
            const nuevaRuta = await pb.collection('rutes').create({
                nom: nomRuta,
                article: ex.article || '',
                per_defecte: false,
                operacions: [{ nom: operacion.nom, temps_estandard_min: Number(operacion.temps_std_min) || 0 }],
                estat_ruta: 'activa',
            }, { requestKey: `prop-ex-ruta-new-${ex.id}` });
            rutaFinalId = nuevaRuta.id;
            rutaFinalNom = nomRuta;
            clonada = true;
            await pb.collection('operacions_def').create(
                { ...buildOpPayload(1, ''), ruta: rutaFinalId },
                { requestKey: `prop-ex-op-new-${ex.id}` },
            );
        } else {
            const ruta = await pb.collection('rutes').getOne(rutaAnteriorId, { requestKey: `prop-ex-ruta-${ex.id}` }).catch(() => null);
            rutaFinalNom = ruta?.nom || 'Ruta';
            const ops = await pb.collection('operacions_def').getFullList({
                filter: `ruta = "${rutaAnteriorId}"`, sort: 'ordre', requestKey: `prop-ex-ops-${ex.id}`,
            }).catch(() => []);

            // Evitar duplicado por codi
            if (ops.some((o) => (o.codi || '').toUpperCase() === codi)) {
                duplicado = true;
            } else {
                // ¿La ruta es compartida (artículo u otras exclusivas)?
                const rutaEsArticulo = rutaAnteriorId === rutaArtId;
                const otrasExcl = await pb.collection('exclusives').getFullList({
                    filter: `ruta = "${rutaAnteriorId}" && id != "${ex.id}"`,
                    requestKey: `prop-ex-otras-${ex.id}`,
                }).catch(() => []);
                const compartida = rutaEsArticulo || otrasExcl.length > 0;

                const codisRuta = new Set(ops.map((o) => (o.codi || '').toUpperCase()));
                const opAnt = operacion.op_anterior && codisRuta.has(String(operacion.op_anterior).toUpperCase())
                    ? operacion.op_anterior : '';

                if (compartida) {
                    // Clonar ruta → asignar clon solo a esta exclusiva + añadir operación
                    const nomClon = `${rutaFinalNom} · ${ex.exclusiva}`;
                    const rutaClon = await pb.collection('rutes').create({
                        nom: nomClon,
                        article: ruta?.article || ex.article || '',
                        per_defecte: false,
                        operacions: (ruta?.operacions || []).map((o) => ({
                            nom: o.nom, temps_estandard_min: Number(o.temps_estandard_min || 0) || 0,
                        })).concat([{ nom: operacion.nom, temps_estandard_min: Number(operacion.temps_std_min) || 0 }]),
                        estat_ruta: ruta?.estat_ruta || 'activa',
                        notas: `Ruta clonada para propagar operación ${codi} a exclusiva ${ex.exclusiva}`,
                    }, { requestKey: `prop-ex-ruta-clon-${ex.id}` });
                    rutaFinalId = rutaClon.id;
                    rutaFinalNom = nomClon;
                    clonada = true;
                    // Duplicar todas las operaciones existentes hacia el clon
                    for (let i = 0; i < ops.length; i++) {
                        const o = ops[i];
                        await pb.collection('operacions_def').create({
                            codi: o.codi || '', nom: o.nom || '', fase: o.fase || '',
                            fase_ordre: Number(o.fase_ordre) || 0, ordre: Number(o.ordre) || 0,
                            descripcio: o.descripcio || '', instruccions: o.instruccions || '',
                            peca_zona: o.peca_zona || '', maquina: o.maquina || '',
                            especialitat: o.especialitat || '',
                            temps_std_min: Number(o.temps_std_min) || 0,
                            temps_prep_min: Number(o.temps_prep_min) || 0,
                            unitats_lot: Number(o.unitats_lot) || 0,
                            op_anterior: o.op_anterior || '', op_seguent: o.op_seguent || '',
                            paralel: !!o.paralel, te_control_qualitat: !!o.te_control_qualitat,
                            defectes_frequents: o.defectes_frequents || '',
                            actiu: o.actiu !== false, ruta: rutaFinalId,
                        }, { requestKey: `prop-ex-dup-${ex.id}-${i}` });
                    }
                    // Añadir la nueva operación al clon
                    const ordreNuevo = Math.max(0, ...ops.map((o) => Number(o.ordre) || 0)) + 1;
                    await pb.collection('operacions_def').create(
                        { ...buildOpPayload(ordreNuevo, opAnt), ruta: rutaFinalId },
                        { requestKey: `prop-ex-op-clon-${ex.id}` },
                    );
                } else {
                    // Ruta privada de esta exclusiva → añadir directamente
                    const ordreNuevo = Math.max(0, ...ops.map((o) => Number(o.ordre) || 0)) + 1;
                    await pb.collection('operacions_def').create(
                        { ...buildOpPayload(ordreNuevo, opAnt), ruta: rutaFinalId },
                        { requestKey: `prop-ex-op-direct-${ex.id}` },
                    );
                    const opsJson = (ruta?.operacions || []).map((o) => ({
                        nom: o.nom, temps_estandard_min: Number(o.temps_estandard_min || 0) || 0,
                    })).concat([{ nom: operacion.nom, temps_estandard_min: Number(operacion.temps_std_min) || 0 }]);
                    await pb.collection('rutes').update(rutaFinalId, { operacions: opsJson }, { requestKey: `prop-ex-json-${ex.id}` }).catch(() => {});
                }
            }
        }

        // Recalcular minuts_previstos y asignar ruta si cambió
        const minutsNuevo = await calcMinutsFromOps(rutaFinalId, unitats);
        const updateData = { minuts_previstos: minutsNuevo };
        if (rutaFinalId !== rutaAnteriorId) updateData.ruta = rutaFinalId;
        await pb.collection('exclusives').update(ex.id, updateData, { requestKey: `prop-ex-upd-${ex.id}` });

        // Historial
        await pb.collection('historial_cambios_exclusivas').create({
            exclusiva_id: ex.id,
            tipo_cambio: 'operacion_propagada',
            ruta_anterior: '',
            ruta_nueva: rutaFinalNom,
            operacion_id: codi,
            operacion_nombre: `${codi} · ${operacion.nom}`,
            cambio_descripcion: duplicado
                ? `Operación "${codi} · ${operacion.nom}" ya existía en la ruta de la exclusiva ${ex.exclusiva}. Sin cambios.`
                : `Operación "${codi} · ${operacion.nom}" (${Number(operacion.temps_std_min) || 0} min) propagada a la exclusiva ${ex.exclusiva}${clonada ? ' (ruta privada creada)' : ''}. Min. previstos: ${minutsAnterior} → ${minutsNuevo}.`,
            minuts_anterior: minutsAnterior,
            minuts_nuevo: minutsNuevo,
            usuario_id: user?.id || null,
            fecha_cambio: new Date().toISOString(),
            alcance: 'exclusiva',
            exclusiva_origen: exclusiva?.exclusiva || '',
        }, { requestKey: `prop-hist-ex-${ex.id}` }).catch(() => {});

        return { ex, ok: !duplicado, duplicado, ruta: rutaFinalNom, clonada, minutsAnterior, minutsNuevo };
    };

    // ── Ejecutar propagación ─────────────────────────────────────────────────
    const ejecutar = async () => {
        setAplicando(true);
        setError('');
        try {
            const resultado = { articulo: null, exclusivas: [] };

            if (propagarArticulo) {
                resultado.articulo = await propagarAArticulo();
            }

            for (const ex of seleccionadasValidas) {
                // Si la exclusiva comparte la ruta del artículo y también se
                // propaga al artículo, la operación ya le llega vía la
                // plantilla → no duplicar.
                const rutaArtId = articleActual?.ruta || articleActual?.expand?.ruta?.id || '';
                if (propagarArticulo && ex.ruta && ex.ruta === rutaArtId) {
                    resultado.exclusivas.push({ ex, ok: true, viaArticulo: true });
                    continue;
                }
                const r = await propagarAExclusiva(ex);
                resultado.exclusivas.push(r);
            }

            setResumen(resultado);
            setFase('resumen');
        } catch (e) {
            console.error('Error propagando operación', e);
            setError('No se ha podido completar la propagación. Revisa los permisos y los datos.');
        } finally {
            setAplicando(false);
        }
    };

    const irAConfirmacion = () => {
        setError('');
        if (!haySeleccion) { setError('Selecciona al menos un destino (plantilla o exclusivas).'); return; }
        setFase('confirmacion');
    };

    const cerrarYRecargar = () => { onSaved && onSaved(); onClose && onClose(); };

    // ── Render ───────────────────────────────────────────────────────────────
    if (carregant) {
        return (
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
                <div className="modal-card w-full max-w-lg rounded-2xl bg-card p-8 text-center" onClick={(e) => e.stopPropagation()}>
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                    <p className="mt-3 text-sm text-muted-foreground">Cargando exclusivas del artículo…</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div className="modal-card w-full max-w-2xl max-h-[94vh] overflow-y-auto rounded-2xl bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-card px-5 py-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Layers className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <p className="font-display text-xl uppercase truncate">Propagar operación</p>
                            <p className="text-xs text-muted-foreground truncate">
                                {operacion
                                    ? `${operacion.codi || ''} · ${operacion.nom || ''} · ${Number(operacion.temps_std_min) || 0} min`
                                    : 'Selecciona una operación para propagar'}
                                {exclusiva ? ` · desde ${exclusiva.exclusiva}` : ''}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="rounded-md p-2 hover:bg-secondary shrink-0" aria-label="Cerrar">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {/* ── Fase 0: picker de operación (cuando no se pasó por props) ── */}
                    {fase === 'picker' && (
                        <>
                            <p className="text-sm text-muted-foreground">
                                Selecciona la operación de la exclusiva <strong>{exclusiva?.exclusiva}</strong> que quieres propagar a otras exclusivas programadas y/o a la plantilla del artículo.
                            </p>
                            {opsRuta.length === 0 ? (
                                <p className="rounded-md bg-secondary p-4 text-center text-sm text-muted-foreground">
                                    Esta exclusiva no tiene operaciones definidas en su ruta. Añade primero una operación y luego propágala.
                                </p>
                            ) : (
                                <div className="divide-y divide-border rounded-lg border border-border">
                                    {opsRuta.map((op) => (
                                        <button key={op.id} onClick={() => { setOperacionSel(op); setFase('seleccion'); }}
                                            className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/40 transition">
                                            <span className="font-mono text-xs font-bold bg-secondary rounded px-1.5 py-0.5 shrink-0">{op.codi}</span>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-semibold truncate">{op.nom}</p>
                                                <p className="text-xs text-muted-foreground truncate">
                                                    {op.fase ? `${op.fase} · ` : ''}{Number(op.temps_std_min) || 0} min
                                                    {op.op_anterior ? ` · tras ${op.op_anterior}` : ''}
                                                </p>
                                            </div>
                                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div className="flex gap-3 pt-1">
                                <button onClick={onClose} className="h-12 rounded-md bg-secondary px-5 text-sm font-semibold">Cancelar</button>
                            </div>
                        </>
                    )}

                    {/* ── Fase 1: selección ── */}
                    {fase === 'seleccion' && (
                        <>
                            {!articleActual && (
                                <div className="flex items-start gap-2 rounded-lg bg-[hsl(var(--warn))]/10 p-3 text-sm text-[hsl(var(--warn))]">
                                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                    <span>No se ha podido vincular un artículo a esta exclusiva (referencia «{articleReferencia || '—'}»). Solo puedes propagar a exclusivas del mismo artículo; la opción de plantilla no estará disponible.</span>
                                </div>
                            )}

                            {/* Opción: publicar en la ruta del artículo */}
                            <button
                                onClick={() => setPropagarArticulo((v) => !v)}
                                disabled={!articleActual}
                                className={`w-full text-left rounded-lg border-2 p-4 transition disabled:opacity-50 ${propagarArticulo ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`flex h-6 w-6 items-center justify-center rounded-md border-2 ${propagarArticulo ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>
                                        {propagarArticulo && <CheckCircle2 className="h-4 w-4" />}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-semibold text-sm flex items-center gap-2">
                                            <Route className="h-4 w-4 text-[hsl(var(--accent))]" />
                                            Publicar en ruta (para futuras exclusivas)
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            Artículo: <strong>{articleActual?.referencia || articleActual?.nom || '—'}</strong>
                                            {rutaArticulo ? ` · Ruta «${rutaArticulo.nom}»` : ' · sin ruta (se creará)'}.{' '}
                                            La operación se publicará en la ruta del artículo y la heredarán las futuras exclusivas que usen esa ruta.
                                            {articlesCompartintRuta.length > 1 && (
                                                <span className="block mt-1 text-[hsl(var(--accent))]"><strong>Ruta compartida por {articlesCompartintRuta.length} artículos:</strong> {articlesCompartintRuta.map((a) => a.referencia || a.nom).filter(Boolean).join(', ')}.</span>
                                            )}
                                            {' '}Las exclusivas ya existentes no se modifican automáticamente.
                                        </p>
                                    </div>
                                </div>
                            </button>

                            {/* Lista de exclusivas programadas */}
                            <div className="rounded-lg border border-border">
                                <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                                    <p className="text-sm font-semibold">
                                        Exclusivas programadas del artículo
                                        <span className="ml-2 text-xs font-normal text-muted-foreground">({programadas.length})</span>
                                    </p>
                                    <div className="flex gap-2">
                                        <button onClick={selTodas} className="rounded border border-border px-2 py-1 text-xs font-semibold hover:bg-secondary">Seleccionar todas</button>
                                        <button onClick={selNinguna} className="rounded border border-border px-2 py-1 text-xs font-semibold hover:bg-secondary">Ninguna</button>
                                    </div>
                                </div>

                                {programadas.length === 0 ? (
                                    <p className="px-4 py-6 text-center text-sm text-muted-foreground">No hay otras exclusivas programadas de este artículo.</p>
                                ) : (
                                    <div className="max-h-[40vh] overflow-y-auto divide-y divide-border">
                                        {programadas.map((e) => {
                                            const sel = seleccionadas.has(e.id);
                                            return (
                                                <button key={e.id} onClick={() => toggleSel(e.id)}
                                                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${sel ? 'bg-primary/5' : 'hover:bg-secondary/40'}`}>
                                                    <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${sel ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>
                                                        {sel && <CheckCircle2 className="h-3.5 w-3.5" />}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-sm font-semibold truncate">{e.exclusiva}</p>
                                                        <p className="text-xs text-muted-foreground truncate">
                                                            {e.article || '—'} · {e.unitats || 0} uds · entrega {e.data_entrega || '—'}
                                                        </p>
                                                    </div>
                                                    <span className="shrink-0 rounded bg-secondary px-2 py-0.5 text-xs font-semibold uppercase">{e.estat}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Exclusivas en estados protegidos */}
                            {protegidas.length > 0 && (
                                <div className="rounded-lg border-2 border-[hsl(var(--warn))]/40 bg-[hsl(var(--warn))]/5">
                                    <div className="flex items-start gap-2 px-4 py-3 border-b border-[hsl(var(--warn))]/30">
                                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-[hsl(var(--warn))]" />
                                        <div className="flex-1">
                                            <p className="text-sm font-semibold text-[hsl(var(--warn))]">Exclusivas en estados protegidos ({protegidas.length})</p>
                                            <p className="text-xs text-muted-foreground mt-0.5">Entregadas, completadas, lista para recoger, bloqueadas, etc. No se modifican por defecto.</p>
                                        </div>
                                    </div>
                                    <label className="flex items-center gap-2 px-4 py-2 cursor-pointer">
                                        <input type="checkbox" checked={aceptarProtegidas} onChange={(e) => setAceptarProtegidas(e.target.checked)}
                                            className="h-4 w-4 rounded" />
                                        <span className="text-xs font-semibold">Mostrar y permitir seleccionar exclusivas protegidas (requiere confirmación adicional)</span>
                                    </label>
                                    {aceptarProtegidas && (
                                        <div className="max-h-[30vh] overflow-y-auto divide-y divide-border border-t border-[hsl(var(--warn))]/30">
                                            {protegidas.map((e) => {
                                                const sel = seleccionadas.has(e.id);
                                                return (
                                                    <button key={e.id} onClick={() => toggleSel(e.id)}
                                                        className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${sel ? 'bg-[hsl(var(--warn))]/10' : 'hover:bg-secondary/40'}`}>
                                                        <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${sel ? 'border-[hsl(var(--warn))] bg-[hsl(var(--warn))] text-white' : 'border-border'}`}>
                                                            {sel && <CheckCircle2 className="h-3.5 w-3.5" />}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-sm font-semibold truncate">{e.exclusiva}</p>
                                                            <p className="text-xs text-muted-foreground truncate">{e.article || '—'} · {e.unitats || 0} uds</p>
                                                        </div>
                                                        <span className="shrink-0 rounded bg-[hsl(var(--warn))]/20 px-2 py-0.5 text-xs font-semibold uppercase text-[hsl(var(--warn))]">{e.estat}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                            {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

                            <div className="flex gap-3 pt-1">
                                <button onClick={irAConfirmacion} disabled={!haySeleccion}
                                    className="flex h-12 flex-1 items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground active:scale-95 disabled:opacity-50">
                                    <ChevronRight className="h-4 w-4" /> Revisar y confirmar
                                </button>
                                <button onClick={onClose} className="h-12 rounded-md bg-secondary px-5 text-sm font-semibold">Cancelar</button>
                            </div>
                        </>
                    )}

                    {/* ── Fase 2: confirmación ── */}
                    {fase === 'confirmacion' && (
                        <div className="py-2">
                            <p className="font-display text-2xl uppercase">Resumen de propagación</p>
                            <p className="mt-2 text-sm text-muted-foreground">
                                Operación <strong>{operacion?.codi} · {operacion?.nom}</strong> ({Number(operacion?.temps_std_min) || 0} min)
                                {exclusiva ? ` desde la exclusiva ${exclusiva.exclusiva}` : ''}.
                            </p>

                            <div className="mt-4 space-y-2">
                                {propagarArticulo && (
                                    <div className="rounded-lg border border-border bg-secondary/40 p-3 text-sm">
                                        <p className="font-semibold flex items-center gap-2"><Copy className="h-4 w-4 text-primary" /> Plantilla del artículo</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {articleActual ? `Se añadirá a la ruta del artículo ${articleActual.referencia || articleActual.nom}${rutaArticulo ? ` («${rutaArticulo.nom}»)` : ''} para futuras exclusivas.` : 'Sin artículo vinculado.'}
                                        </p>
                                    </div>
                                )}
                                <div className="rounded-lg border border-border bg-secondary/40 p-3 text-sm">
                                    <p className="font-semibold flex items-center gap-2"><Layers className="h-4 w-4 text-primary" /> Exclusivas afectadas</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {seleccionadasValidas.length} exclusiva(s) seleccionada(s).
                                        {propagarArticulo && ' Las que comparten la ruta del artículo recibirán la operación vía la plantilla (sin duplicar).'}
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {seleccionadasValidas.map((e) => (
                                            <span key={e.id} className="rounded bg-background px-2 py-0.5 text-xs font-mono font-semibold border border-border">{e.exclusiva}</span>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 flex items-start gap-2 rounded-lg bg-primary/5 p-3 text-xs text-muted-foreground">
                                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                                <span>
                                    Se respetan las operaciones ya iniciadas o completadas (no se modifican).
                                    Se evitan duplicados por código de operación. Se mantiene el orden, las dependencias válidas, la fase y el tiempo estimado, y se recalculan los minutos previstos de cada exclusiva afectada.
                                </span>
                            </div>

                            {error && <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

                            <div className="mt-5 flex gap-3">
                                <button onClick={() => setFase('seleccion')} disabled={aplicando}
                                    className="h-11 rounded-md bg-secondary px-5 text-sm font-semibold disabled:opacity-50">Volver</button>
                                <button onClick={ejecutar} disabled={aplicando}
                                    className="flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50">
                                    {aplicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                    {aplicando ? 'Propagando…' : `Propagar a ${seleccionadasValidas.length} exclusiva(s)${propagarArticulo ? ' + artículo' : ''}`}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── Fase 3: resumen ── */}
                    {fase === 'resumen' && resumen && (
                        <div className="text-center py-2">
                            <CheckCircle2 className="mx-auto h-12 w-12 text-[hsl(var(--ok))] mb-3" />
                            <p className="font-display text-2xl uppercase">Propagación completada</p>
                            <div className="mt-4 space-y-2 text-left">
                                {resumen.articulo && (
                                    <div className={`rounded-lg p-3 text-sm ${resumen.articulo.ok ? 'bg-[hsl(var(--ok))]/10 text-[hsl(var(--ok))]' : 'bg-destructive/10 text-destructive'}`}>
                                        <p className="font-semibold flex items-center gap-2">
                                            <CheckCircle2 className="h-4 w-4" /> Artículo {articleActual?.referencia || articleActual?.nom || '—'}
                                        </p>
                                        <p className="text-xs mt-0.5 text-muted-foreground">
                                            {resumen.articulo.duplicado
                                                ? 'La operación ya existía en la plantilla. Sin cambios.'
                                                : resumen.articulo.ok
                                                    ? `Añadida a la ruta «${resumen.articulo.ruta}» para futuras exclusivas.`
                                                    : resumen.articulo.motivo}
                                        </p>
                                    </div>
                                )}
                                {resumen.exclusivas.map((r, i) => (
                                    <div key={r.ex.id} className={`rounded-lg p-3 text-sm ${r.viaArticulo ? 'bg-secondary text-muted-foreground' : r.duplicado ? 'bg-secondary text-muted-foreground' : 'bg-[hsl(var(--ok))]/10 text-[hsl(var(--ok))]'}`}>
                                        <p className="font-semibold flex items-center gap-2">
                                            <CheckCircle2 className="h-4 w-4" /> Exclusiva {r.ex.exclusiva}
                                        </p>
                                        <p className="text-xs mt-0.5 text-muted-foreground">
                                            {r.viaArticulo
                                                ? 'Cubierta vía la plantilla del artículo (comparte la ruta).'
                                                : r.duplicado
                                                    ? 'La operación ya existía en su ruta. Sin cambios.'
                                                    : `Añadida${r.clonada ? ' (ruta privada creada)' : ''}. Min. previstos: ${r.minutsAnterior} → ${r.minutsNuevo}.`}
                                        </p>
                                    </div>
                                ))}
                            </div>
                            <p className="mt-3 text-xs text-muted-foreground">
                                Historial registrado por usuario, fecha, operación, origen y cada destino (alcance artículo / exclusiva).
                                Los cambios se reflejan en directo en operarios, forecast, calidad, trazabilidad y panel en vivo.
                            </p>
                            <button onClick={cerrarYRecargar} className="mt-5 h-11 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground">
                                Cerrar
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

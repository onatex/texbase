import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, ChevronDown, ChevronRight,
    Edit2, GripVertical, Loader2, Lock, Route, X,
} from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/lib/auth';
import { resolveRutaExclusiva } from '@/lib/operacionsUtils';

/**
 * Modal para EDITAR y REORDENAR las operaciones de una exclusiva concreta
 * desde Producción > Monos.
 *
 * Flujo (reutiliza el sistema existente de rutes + operacions_def +
 * historial_cambios_exclusivas):
 *  1. Lista editable de operaciones con controles táctiles subir/bajar y
 *     formulario inline para editar: descripción, tiempo, fase, dependencia
 *     (op_anterior), orden, máquina, etc.
 *  2. Avisa antes de editar una operación ya iniciada o completada.
 *  3. Al guardar, pregunta el alcance:
 *     - Solo esta exclusiva (clona la ruta si es compartida).
 *     - También al artículo para futuras exclusivas.
 *  4. Recalcula orden, tiempo total y minuts_previstos.
 *  5. Registra historial (quién, cuándo, operación, orden anterior/nuevo,
 *     tiempos anteriores/nuevos, alcance).
 *  6. Confirmación final indicando dónde se aplicó.
 */
export default function EditarOperacionesExclusiva({ exclusiva, onClose, onSaved }) {
    const { user } = useAuth();

    const [carregant, setCarregant] = useState(true);
    const [rutaActual, setRutaActual] = useState(null);
    const [ops, setOps] = useState([]);          // lista editable (ordenada)
    const [opsOriginales, setOpsOriginales] = useState([]); // snapshot para diff
    const [articles, setArticles] = useState([]);
    const [registres, setRegistres] = useState([]); // registres de la exclusiva
    const [expandedId, setExpandedId] = useState(null);

    // Estado del flujo
    const [fase, setFase] = useState('editar'); // 'editar' | 'alcance' | 'resumen'
    const [aplicando, setAplicando] = useState(false);
    const [error, setError] = useState('');
    const [resumen, setResumen] = useState(null);
    const [infoAlcance, setInfoAlcance] = useState(null); // {compartida, articleActual, cambios}

    const [rutaResueltaId, setRutaResueltaId] = useState(null);

    useEffect(() => {
        let cancelado = false;
        const cargar = async () => {
            setCarregant(true);
            try {
                const [arts, regs, rutesList] = await Promise.all([
                    pb.collection('articles').getFullList({ expand: 'ruta', requestKey: 'edop-arts' }).catch(() => []),
                    exclusiva.id
                        ? pb.collection('registres').getFullList({
                            filter: `exclusiva = "${exclusiva.id}"`,
                            requestKey: 'edop-regs',
                        }).catch(() => [])
                        : Promise.resolve([]),
                    pb.collection('rutes').getFullList({ requestKey: 'edop-rutes' }).catch(() => []),
                ]);
                if (cancelado) return;
                setArticles(arts);
                setRegistres(regs);

                const resolved = resolveRutaExclusiva(exclusiva, rutesList, arts);
                const rutaId = resolved.rutaId
                    || (typeof exclusiva.ruta === 'string' ? exclusiva.ruta : exclusiva.ruta?.id)
                    || exclusiva.expand?.ruta?.id
                    || null;
                setRutaResueltaId(rutaId);

                if (rutaId) {
                    const [ruta, opsList] = await Promise.all([
                        pb.collection('rutes').getOne(rutaId, { requestKey: 'edop-ruta' }).catch(() => null),
                        pb.collection('operacions_def').getFullList({
                            filter: `ruta = "${rutaId}"`, sort: 'ordre', requestKey: 'edop-ops',
                        }).catch(() => []),
                    ]);
                    if (cancelado) return;
                    setRutaActual(ruta);
                    const ordenadas = opsList
                        .slice()
                        .sort((a, b) => (Number(a.ordre) || 0) - (Number(b.ordre) || 0))
                        .map((o) => ({ ...o }));
                    setOps(ordenadas);
                    setOpsOriginales(ordenadas.map((o) => ({ ...o })));
                } else {
                    setRutaActual(null);
                    setOps([]);
                    setOpsOriginales([]);
                }
            } finally {
                if (!cancelado) setCarregant(false);
            }
        };
        cargar();
        return () => { cancelado = true; };
    }, [exclusiva.id, exclusiva.ruta, exclusiva.referencia, exclusiva.article]);

    // ── Helpers ──────────────────────────────────────────────────────────
    const articleReferencia = useMemo(
        () => (exclusiva.referencia || exclusiva.article || '').toString().toUpperCase().trim(),
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

    // Operaciones iniciadas/completadas (aviso antes de editar)
    const estadoOp = useMemo(() => {
        const map = {};
        for (const r of registres) {
            const nom = r.operacio;
            if (!nom) continue;
            if (!map[nom]) map[nom] = { iniciada: false, completada: false };
            if (r.estat === 'finalitzat') map[nom].completada = true;
            if (r.estat === 'en_curs' || r.estat === 'pausat') map[nom].iniciada = true;
        }
        return map;
    }, [registres]);

    // ── Reordenar ────────────────────────────────────────────────────────
    const reindexar = (lista) => lista.map((o, i) => ({ ...o, ordre: i + 1 }));

    const mover = (idx, dir) => {
        setOps((prev) => {
            const next = prev.slice();
            const j = idx + dir;
            if (j < 0 || j >= next.length) return prev;
            [next[idx], next[j]] = [next[j], next[idx]];
            return reindexar(next);
        });
    };

    const setCampo = (id, campo, valor) => {
        setOps((prev) => prev.map((o) => (o.id === id ? { ...o, [campo]: valor } : o)));
    };

    // ── Diff: qué cambió ──────────────────────────────────────────────────
    const cambios = useMemo(() => {
        const origMap = new Map(opsOriginales.map((o) => [o.id, o]));
        const lista = [];
        for (const o of ops) {
            const orig = origMap.get(o.id);
            if (!orig) { lista.push({ op: o, orig: null, campos: [], reordenada: true }); continue; }
            const campos = [];
            const check = (c) => {
                const a = orig[c] ?? '';
                const b = o[c] ?? '';
                if (String(a) !== String(b)) campos.push(c);
            };
            ['codi', 'nom', 'descripcio', 'fase', 'op_anterior', 'ordre', 'maquina', 'especialitat', 'temps_std_min', 'temps_prep_min', 'paralel', 'te_control_qualitat', 'actiu'].forEach(check);
            lista.push({ op: o, orig, campos, reordenada: Number(orig.ordre) !== Number(o.ordre) });
        }
        return lista;
    }, [ops, opsOriginales]);

    const hayCambios = cambios.some((c) => c.campos.length > 0 || c.reordenada);
    const opsIniciadasOCompletadas = cambios
        .filter((c) => (c.campos.length > 0 || c.reordenada))
        .some((c) => {
            const st = estadoOp[c.orig?.nom || c.op.nom];
            return st && (st.iniciada || st.completada);
        });

    const totalMin = useMemo(
        () => ops.reduce((s, o) => s + (Number(o.temps_std_min) || 0), 0),
        [ops],
    );
    const totalMinOriginal = useMemo(
        () => opsOriginales.reduce((s, o) => s + (Number(o.temps_std_min) || 0), 0),
        [opsOriginales],
    );

    // ── Guardar: preparar alcance ─────────────────────────────────────────
    const prepararAlcance = async () => {
        setError('');
        if (!hayCambios) { setError('No hay cambios para guardar.'); return; }
        // Validar codi: permitir duplicados ya existentes, pero bloquear los
        // nuevos duplicados introducidos por esta edición.
        const origCodis = opsOriginales.map((o) => (o.codi || '').trim().toUpperCase()).filter(Boolean);
        const newCodis = ops.map((o) => (o.codi || '').trim().toUpperCase()).filter(Boolean);
        const dupsOrig = origCodis.length - new Set(origCodis).size;
        const dupsNew = newCodis.length - new Set(newCodis).size;
        if (dupsNew > dupsOrig) {
            setError('Has introducido códigos de operación duplicados. Cada código debe ser único dentro de la ruta.');
            return;
        }
        // Validar dependencias (op_anterior debe existir o estar vacío)
        for (const o of ops) {
            if (o.op_anterior && !newCodis.includes(String(o.op_anterior).trim().toUpperCase())) {
                setError(`La operación "${o.codi}" depende de "${o.op_anterior}" que no existe en la ruta.`);
                return;
            }
        }
        // Detectar ruta compartida (usando ruta resuelta, no solo el campo directo)
        let compartida = false;
        let otrasCount = 0;
        const rid = rutaResueltaId
            || (typeof exclusiva.ruta === 'string' ? exclusiva.ruta : exclusiva.ruta?.id)
            || '';
        if (rid) {
            const otras = await pb.collection('exclusives').getFullList({
                filter: `ruta = "${rid}" && id != "${exclusiva.id}"`,
                requestKey: 'edop-otras',
            }).catch(() => []);
            otrasCount = otras.length;
            const artRutaId = typeof articleActual?.ruta === 'string'
                ? articleActual.ruta
                : articleActual?.ruta?.id || articleActual?.expand?.ruta?.id || '';
            const esRutaArticulo = !!articleActual && artRutaId === rid;
            // Si la ruta viene del artículo (no está en exclusiva.ruta), siempre es compartida
            const viaArticulo = !exclusiva.ruta && !!rutaResueltaId;
            compartida = otrasCount > 0 || esRutaArticulo || viaArticulo;
        }
        setInfoAlcance({ compartida, otrasCount, articleActual, hayArticle: !!articleActual });
        setFase('alcance');
    };

    // ── Aplicar a la exclusiva (clonando si es compartida) ─────────────────
    const calcMinutsFromOps = (opsList, unitats) => {
        const minPerUnit = opsList.reduce((a, o) => a + (Number(o.temps_std_min) || 0), 0);
        return Math.round(minPerUnit * (Number(unitats) || 1));
    };

    const duplicarOp = async (op, rutaIdDestino, requestKey) => {
        return pb.collection('operacions_def').create({
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
        }, { requestKey });
    };

    const aplicarAExclusiva = async () => {
        const ahora = new Date().toISOString();
        const minutsAnterior = Number(exclusiva.minuts_previstos) || 0;
        const unitats = Number(exclusiva.unitats) || 1;
        const rutaAnteriorId = rutaResueltaId
            || (typeof exclusiva.ruta === 'string' ? exclusiva.ruta : exclusiva.ruta?.id)
            || '';
        const rutaAnteriorNom = rutaActual?.nom || '';

        let rutaFinalId = rutaAnteriorId;
        let rutaFinalNom = rutaAnteriorNom;
        let clonada = false;

        if (!rutaAnteriorId) {
            // Sin ruta: crear una privada con las operaciones editadas
            const nomRuta = `Ruta ${exclusiva.exclusiva}${exclusiva.article ? ' · ' + exclusiva.article : ''}`;
            const nuevaRuta = await pb.collection('rutes').create({
                nom: nomRuta,
                article: exclusiva.article || '',
                per_defecte: false,
                operacions: ops.map((o) => ({ nom: o.nom, temps_estandard_min: Number(o.temps_std_min) || 0 })),
                estat_ruta: 'activa',
            }, { requestKey: 'edop-ruta-new' });
            rutaFinalId = nuevaRuta.id;
            rutaFinalNom = nomRuta;
            clonada = true;
            for (let i = 0; i < ops.length; i++) {
                await duplicarOp(ops[i], rutaFinalId, `edop-op-new-${i}`);
            }
        } else if (infoAlcance.compartida) {
            // Ruta compartida: clonar y aplicar operaciones editadas al clon
            const nomClon = `${rutaAnteriorNom} · ${exclusiva.exclusiva}`;
            const rutaClon = await pb.collection('rutes').create({
                nom: nomClon,
                article: rutaActual?.article || exclusiva.article || '',
                per_defecte: false,
                operacions: ops.map((o) => ({ nom: o.nom, temps_estandard_min: Number(o.temps_std_min) || 0 })),
                estat_ruta: rutaActual?.estat_ruta || 'activa',
                notas: `Ruta clonada y editada para exclusiva ${exclusiva.exclusiva}`,
            }, { requestKey: 'edop-ruta-clon' });
            rutaFinalId = rutaClon.id;
            rutaFinalNom = nomClon;
            clonada = true;
            for (let i = 0; i < ops.length; i++) {
                await duplicarOp(ops[i], rutaFinalId, `edop-dup-${i}`);
            }
        } else {
            // Ruta privada de esta exclusiva: aplicar cambios in-place
            for (let i = 0; i < cambios.length; i++) {
                const c = cambios[i];
                if (c.campos.length === 0 && !c.reordenada) continue;
                await pb.collection('operacions_def').update(c.op.id, {
                    codi: c.op.codi || '',
                    nom: c.op.nom || '',
                    fase: c.op.fase || '',
                    ordre: Number(c.op.ordre) || 0,
                    descripcio: c.op.descripcio || '',
                    op_anterior: c.op.op_anterior || '',
                    maquina: c.op.maquina || '',
                    especialitat: c.op.especialitat || '',
                    temps_std_min: Number(c.op.temps_std_min) || 0,
                    temps_prep_min: Number(c.op.temps_prep_min) || 0,
                    paralel: !!c.op.paralel,
                    te_control_qualitat: !!c.op.te_control_qualitat,
                    actiu: c.op.actiu !== false,
                }, { requestKey: `edop-upd-${i}` }).catch((e) => console.error('upd op', e));
            }
            // Actualizar JSON operacions de la ruta
            await pb.collection('rutes').update(rutaFinalId, {
                operacions: ops.map((o) => ({ nom: o.nom, temps_estandard_min: Number(o.temps_std_min) || 0 })),
            }, { requestKey: 'edop-ruta-json' }).catch(() => {});
        }

        // Recalcular minuts_previstos de la exclusiva
        const minutsNuevo = calcMinutsFromOps(ops, unitats);
        const updateData = { minuts_previstos: minutsNuevo };
        if (rutaFinalId !== rutaAnteriorId) updateData.ruta = rutaFinalId;
        await pb.collection('exclusives').update(exclusiva.id, updateData, { requestKey: 'edop-excl-upd' });

        // Historial: registrar cada operación modificada/reordenada
        for (const c of cambios) {
            if (c.campos.length === 0 && !c.reordenada) continue;
            const opNom = c.orig?.nom || c.op.nom;
            const codi = c.op.codi || '';
            const descParts = [];
            if (c.reordenada) descParts.push(`orden ${c.orig?.ordre ?? '?'} → ${c.op.ordre}`);
            if (c.campos.includes('temps_std_min')) descParts.push(`tiempo ${c.orig?.temps_std_min ?? 0} → ${c.op.temps_std_min} min`);
            if (c.campos.includes('nom')) descParts.push(`nombre "${c.orig?.nom || ''}" → "${c.op.nom}"`);
            if (c.campos.includes('fase')) descParts.push(`fase "${c.orig?.fase || ''}" → "${c.op.fase}"`);
            if (c.campos.includes('op_anterior')) descParts.push(`dependencia "${c.orig?.op_anterior || ''}" → "${c.op.op_anterior}"`);
            if (c.campos.includes('descripcio')) descParts.push('descripción actualizada');
            const cambioDesc = `Operación "${codi} · ${opNom}" ${descParts.join(', ')}. Aplicado a exclusiva ${exclusiva.exclusiva}.`;
            await pb.collection('historial_cambios_exclusivas').create({
                exclusiva_id: exclusiva.id,
                tipo_cambio: 'operacion_modificada',
                ruta_anterior: rutaAnteriorNom,
                ruta_nueva: rutaFinalNom,
                operacion_id: codi,
                operacion_nombre: `${codi} · ${opNom}`,
                cambio_descripcion: cambioDesc,
                minuts_anterior: minutsAnterior,
                minuts_nuevo: minutsNuevo,
                orden_anterior: c.orig?.ordre ?? null,
                orden_nuevo: c.op.ordre,
                alcance: 'exclusiva',
                usuario_id: user?.id || null,
                fecha_cambio: ahora,
            }, { requestKey: `edop-hist-${c.op.id}` }).catch(() => {});
        }

        return { rutaFinalId, rutaFinalNom, clonada, minutsAnterior, minutsNuevo };
    };

    // ── Aplicar también al artículo (plantilla para futuras) ──────────────
    const aplicarAArticulo = async (resultadoExclusiva) => {
        if (!articleActual) return null;
        const ahora = new Date().toISOString();
        let rutaArtId = articleActual.ruta || '';
        let rutaArtNom = '';
        let opsArt = [];

        if (rutaArtId) {
            const [rutaArt, opsArtList] = await Promise.all([
                pb.collection('rutes').getOne(rutaArtId, { requestKey: 'edop-art-ruta' }).catch(() => null),
                pb.collection('operacions_def').getFullList({
                    filter: `ruta = "${rutaArtId}"`, sort: 'ordre', requestKey: 'edop-art-ops',
                }).catch(() => []),
            ]);
            rutaArtNom = rutaArt?.nom || 'Ruta artículo';
            opsArt = opsArtList;
            // Actualizar cada operación editada que coincida por codi; crear las nuevas
            const artOpsByCodi = new Map(opsArt.map((o) => [(o.codi || '').toUpperCase(), o]));
            for (let i = 0; i < ops.length; i++) {
                const ed = ops[i];
                const exist = artOpsByCodi.get((ed.codi || '').toUpperCase());
                if (exist) {
                    await pb.collection('operacions_def').update(exist.id, {
                        nom: ed.nom || '',
                        fase: ed.fase || '',
                        ordre: Number(ed.ordre) || 0,
                        descripcio: ed.descripcio || '',
                        op_anterior: ed.op_anterior || '',
                        maquina: ed.maquina || '',
                        especialitat: ed.especialitat || '',
                        temps_std_min: Number(ed.temps_std_min) || 0,
                        temps_prep_min: Number(ed.temps_prep_min) || 0,
                        paralel: !!ed.paralel,
                        te_control_qualitat: !!ed.te_control_qualitat,
                        actiu: ed.actiu !== false,
                    }, { requestKey: `edop-art-upd-${i}` }).catch((e) => console.error('art upd', e));
                } else {
                    await duplicarOp(ed, rutaArtId, `edop-art-new-${i}`);
                }
            }
            // Actualizar JSON operacions de la ruta del artículo
            await pb.collection('rutes').update(rutaArtId, {
                operacions: ops.map((o) => ({ nom: o.nom, temps_estandard_min: Number(o.temps_std_min) || 0 })),
            }, { requestKey: 'edop-art-json' }).catch(() => {});
        } else {
            // El artículo no tiene ruta: crear una y asignarla
            rutaArtNom = `Ruta ${articleActual.referencia || articleActual.nom || 'artículo'}`;
            const nuevaRuta = await pb.collection('rutes').create({
                nom: rutaArtNom,
                article: articleActual.referencia || articleActual.nom || '',
                per_defecte: false,
                operacions: ops.map((o) => ({ nom: o.nom, temps_estandard_min: Number(o.temps_std_min) || 0 })),
                estat_ruta: 'activa',
            }, { requestKey: 'edop-art-ruta-new' });
            rutaArtId = nuevaRuta.id;
            for (let i = 0; i < ops.length; i++) {
                await duplicarOp(ops[i], rutaArtId, `edop-art-op-new-${i}`);
            }
            await pb.collection('articles').update(articleActual.id, { ruta: rutaArtId }, { requestKey: 'edop-art-asig' });
        }

        // Recalcular temps_estandard_total_min del artículo
        const totalMinArt = ops.reduce((a, o) => a + (Number(o.temps_std_min) || 0), 0);
        await pb.collection('articles').update(articleActual.id, {
            temps_estandard_total_min: totalMinArt,
        }, { requestKey: 'edop-art-total' }).catch(() => {});

        // Historial: alcance artículo
        for (const c of cambios) {
            if (c.campos.length === 0 && !c.reordenada) continue;
            const codi = c.op.codi || '';
            const opNom = c.orig?.nom || c.op.nom;
            const cambioDesc = `Operación "${codi} · ${opNom}" actualizada en la plantilla del artículo ${articleActual.referencia || articleActual.nom} para futuras exclusivas. No se modifican automáticamente exclusivas ya existentes.`;
            await pb.collection('historial_cambios_exclusivas').create({
                exclusiva_id: exclusiva.id,
                tipo_cambio: 'operacion_modificada',
                ruta_anterior: resultadoExclusiva.rutaFinalNom,
                ruta_nueva: rutaArtNom,
                operacion_id: codi,
                operacion_nombre: `${codi} · ${opNom}`,
                cambio_descripcion: cambioDesc,
                minuts_anterior: resultadoExclusiva.minutsAnterior,
                minuts_nuevo: resultadoExclusiva.minutsNuevo,
                orden_anterior: c.orig?.ordre ?? null,
                orden_nuevo: c.op.ordre,
                alcance: 'articulo',
                usuario_id: user?.id || null,
                fecha_cambio: ahora,
            }, { requestKey: `edop-hist-art-${c.op.id}` }).catch(() => {});
        }

        return { rutaArtNom };
    };

    // ── Ejecutar según alcance ────────────────────────────────────────────
    const ejecutar = async (conArticulo) => {
        setAplicando(true);
        setError('');
        try {
            const resExcl = await aplicarAExclusiva();
            let resArt = null;
            if (conArticulo) resArt = await aplicarAArticulo(resExcl);

            setResumen({
                exclusiva: { ok: true, nom: exclusiva.exclusiva, ruta: resExcl.rutaFinalNom, clonada: resExcl.clonada },
                articulo: conArticulo && resArt
                    ? { ok: true, nom: articleActual?.referencia || articleActual?.nom, ruta: resArt.rutaArtNom }
                    : { ok: false, motivo: articleActual ? 'No aplicado al artículo' : 'Sin artículo vinculado' },
                minutsAnterior: resExcl.minutsAnterior,
                minutsNuevo: resExcl.minutsNuevo,
            });
            setFase('resumen');
        } catch (e) {
            console.error('Error aplicando cambios', e);
            setError('No se han podido aplicar los cambios. Revisa los permisos y los datos.');
        } finally {
            setAplicando(false);
        }
    };

    const cerrarYRecargar = () => { onSaved && onSaved(); onClose && onClose(); };

    // ── Render ───────────────────────────────────────────────────────────
    if (carregant) {
        return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
                <div className="modal-card w-full max-w-2xl rounded-2xl bg-card p-8 text-center" onClick={(e) => e.stopPropagation()}>
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                    <p className="mt-3 text-sm text-muted-foreground">Cargando operaciones…</p>
                </div>
            </div>
        );
    }

    if (!rutaResueltaId && !exclusiva.ruta && ops.length === 0) {
        return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
                <div className="modal-card w-full max-w-lg rounded-2xl bg-card p-6" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-3">
                        <p className="font-display text-xl uppercase">Sin ruta</p>
                        <button onClick={onClose} className="rounded-md p-2 hover:bg-secondary"><X className="h-5 w-5" /></button>
                    </div>
                    <p className="text-sm text-muted-foreground">Esta exclusiva no tiene ruta asignada. Usa «Añadir operación» para crear una ruta privada.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div className="modal-card w-full max-w-3xl max-h-[94vh] overflow-y-auto rounded-2xl bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-card px-5 py-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Edit2 className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <p className="font-display text-xl uppercase truncate">Editar / reordenar operaciones</p>
                            <p className="text-xs text-muted-foreground truncate">
                                Exclusiva {exclusiva.exclusiva}{exclusiva.article ? ` · ${exclusiva.article}` : ''}
                                {rutaActual ? ` · Ruta ${rutaActual.nom}` : ''}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="rounded-md p-2 hover:bg-secondary shrink-0" aria-label="Cerrar">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {/* ── Fase 1: editar / reordenar ── */}
                    {fase === 'editar' && (
                        <>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm text-muted-foreground">
                                    {ops.length} operaciones · Tiempo total: <strong className="text-foreground">{totalMin} min</strong>
                                    {totalMin !== totalMinOriginal && (
                                        <span className={`ml-2 text-xs font-semibold ${totalMin > totalMinOriginal ? 'text-destructive' : 'text-[hsl(var(--ok))]'}`}>
                                            ({totalMin > totalMinOriginal ? '+' : ''}{totalMin - totalMinOriginal} min)
                                        </span>
                                    )}
                                </p>
                                <span className="text-xs text-muted-foreground">Usa ↑ / ↓ para reordenar</span>
                            </div>

                            {opsIniciadasOCompletadas && (
                                <div className="flex items-start gap-2 rounded-lg bg-[hsl(var(--warn))]/10 p-3 text-sm text-[hsl(var(--warn))]">
                                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                    <span>Algunas operaciones modificadas ya están iniciadas o completadas en producción. Los cambios afectarán al orden/tiempo previsto, pero los registros ya existentes se conservan.</span>
                                </div>
                            )}

                            {/* Lista de operaciones */}
                            <div className="space-y-1.5">
                                {ops.map((op, idx) => {
                                    const st = estadoOp[op.nom];
                                    const iniciada = st && st.iniciada;
                                    const completada = st && st.completada;
                                    const isExpanded = expandedId === op.id;
                                    const c = cambios.find((c) => c.op.id === op.id);
                                    const modificado = c && (c.campos.length > 0 || c.reordenada);
                                    return (
                                        <div key={op.id} className={`rounded-lg border ${modificado ? 'border-primary/40 bg-primary/5' : 'border-border'}`}>
                                            {/* Fila */}
                                            <div className="flex items-center gap-2 px-2 py-2">
                                                {/* Reordenar */}
                                                <div className="flex flex-col shrink-0">
                                                    <button onClick={() => mover(idx, -1)} disabled={idx === 0}
                                                        className="rounded p-1 text-muted-foreground hover:bg-secondary disabled:opacity-30" aria-label="Subir">
                                                        <ArrowUp className="h-4 w-4" />
                                                    </button>
                                                    <button onClick={() => mover(idx, 1)} disabled={idx === ops.length - 1}
                                                        className="rounded p-1 text-muted-foreground hover:bg-secondary disabled:opacity-30" aria-label="Bajar">
                                                        <ArrowDown className="h-4 w-4" />
                                                    </button>
                                                </div>

                                                <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0 hidden sm:block" />

                                                {/* Orden + código */}
                                                <div className="flex items-center gap-2 shrink-0 min-w-[64px]">
                                                    <span className="font-display text-lg tabular-nums text-muted-foreground">{op.ordre}</span>
                                                </div>

                                                {/* Info */}
                                                <button onClick={() => setExpandedId(isExpanded ? null : op.id)}
                                                    className="flex-1 min-w-0 text-left">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono text-xs font-bold bg-secondary rounded px-1.5 py-0.5">{op.codi}</span>
                                                        <span className="font-semibold text-sm truncate">{op.nom}</span>
                                                        {completada && <Lock className="h-3.5 w-3.5 text-[hsl(var(--ok))] shrink-0" title="Completada" />}
                                                        {iniciada && <span className="rounded bg-[hsl(var(--warn))]/20 px-1.5 py-0.5 text-[10px] font-semibold text-[hsl(var(--warn))]">en curso</span>}
                                                        {modificado && <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">modificada</span>}
                                                    </div>
                                                    <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                                        {op.fase && <span>{op.fase}</span>}
                                                        {op.maquina && <span>· {op.maquina}</span>}
                                                        {op.op_anterior && <span>· tras {op.op_anterior}</span>}
                                                    </div>
                                                </button>

                                                {/* Tiempo */}
                                                <span className="shrink-0 tabular-nums text-sm font-bold">{Number(op.temps_std_min) || 0}m</span>

                                                {/* Expandir */}
                                                <button onClick={() => setExpandedId(isExpanded ? null : op.id)}
                                                    className="rounded p-1.5 hover:bg-secondary shrink-0" aria-label="Editar">
                                                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                </button>
                                            </div>

                                            {/* Formulario inline */}
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
                                                            {ops.filter((o) => o.id !== op.id).map((o) => (
                                                                <option key={o.id} value={o.codi}>{o.codi} · {o.nom}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div className="flex flex-wrap gap-4">
                                                        <label className="flex items-center gap-2 cursor-pointer">
                                                            <input type="checkbox" checked={!!op.paralel} onChange={(e) => setCampo(op.id, 'paralel', e.target.checked)}
                                                                className="h-4 w-4 rounded" />
                                                            <span className="text-sm font-semibold">Paralelo</span>
                                                        </label>
                                                        <label className="flex items-center gap-2 cursor-pointer">
                                                            <input type="checkbox" checked={!!op.te_control_qualitat} onChange={(e) => setCampo(op.id, 'te_control_qualitat', e.target.checked)}
                                                                className="h-4 w-4 rounded" />
                                                            <span className="text-sm font-semibold">Control calidad</span>
                                                        </label>
                                                        <label className="flex items-center gap-2 cursor-pointer">
                                                            <input type="checkbox" checked={op.actiu !== false} onChange={(e) => setCampo(op.id, 'actiu', e.target.checked)}
                                                                className="h-4 w-4 rounded" />
                                                            <span className="text-sm font-semibold">Activa</span>
                                                        </label>
                                                    </div>
                                                    {(iniciada || completada) && (
                                                        <div className="flex items-start gap-2 rounded-md bg-[hsl(var(--warn))]/10 p-2 text-xs text-[hsl(var(--warn))]">
                                                            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                                            <span>Esta operación {completada ? 'ya está completada' : 'está en curso'} en producción. Modifícala solo si es estrictamente necesario.</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

                            <div className="flex gap-3 pt-1">
                                <button onClick={prepararAlcance} disabled={!hayCambios}
                                    className="flex h-12 flex-1 items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground active:scale-95 disabled:opacity-50">
                                    <CheckCircle2 className="h-4 w-4" /> Guardar cambios
                                </button>
                                <button onClick={onClose} className="h-12 rounded-md bg-secondary px-5 text-sm font-semibold">Cancelar</button>
                            </div>
                        </>
                    )}

                    {/* ── Fase 2: elegir alcance ── */}
                    {fase === 'alcance' && infoAlcance && (
                        <div className="py-2">
                            <p className="font-display text-2xl uppercase">¿Dónde aplicar los cambios?</p>
                            <p className="mt-2 text-sm text-muted-foreground">
                                {cambios.filter((c) => c.campos.length > 0 || c.reordenada).length} operación(es) modificada(s) o reordenada(s).
                                Tiempo total: {totalMinOriginal} → <strong>{totalMin} min</strong>.
                            </p>

                            {infoAlcance.compartida && (
                                <div className="mt-3 flex items-start gap-2 rounded-lg bg-primary/5 p-3 text-xs text-muted-foreground">
                                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                                    <span>
                                        La ruta «{rutaActual?.nom}» es compartida
                                        {infoAlcance.otrasCount > 0 ? ` por ${infoAlcance.otrasCount} exclusiva(s) más` : ''}
                                        {infoAlcance.articleActual && infoAlcance.articleActual.ruta === exclusiva.ruta ? ' y es la plantilla del artículo' : ''}.
                                        Para aplicar cambios solo a esta exclusiva se creará una copia privada de la ruta.
                                    </span>
                                </div>
                            )}

                            <div className="mt-5 space-y-3">
                                {/* Opción 1: solo exclusiva */}
                                <button onClick={() => ejecutar(false)} disabled={aplicando}
                                    className="w-full text-left rounded-lg border-2 border-border p-4 hover:border-primary transition disabled:opacity-50">
                                    <p className="font-semibold text-sm flex items-center gap-2">
                                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">1</span>
                                        Solo a esta exclusiva
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {infoAlcance.compartida
                                            ? 'Se crea una copia privada de la ruta con los cambios. La plantilla del artículo y otras exclusivas no se modifican.'
                                            : 'Se aplican los cambios a la ruta de esta exclusiva. La plantilla del artículo no se modifica.'}
                                    </p>
                                </button>

                                {/* Opción 2: publicar en ruta (futuras) */}
                                {infoAlcance.hayArticle && (
                                    <button onClick={() => ejecutar(true)} disabled={aplicando}
                                        className="w-full text-left rounded-lg border-2 border-border p-4 hover:border-primary transition disabled:opacity-50">
                                        <p className="font-semibold text-sm flex items-center gap-2">
                                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[hsl(var(--accent))]/15 text-[hsl(var(--accent))] text-xs font-bold">2</span>
                                            <Route className="h-4 w-4 text-[hsl(var(--accent))]" />
                                            Esta exclusiva + publicar en ruta (futuras)
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            Se aplica a esta exclusiva {infoAlcance.compartida ? '(copia privada)' : ''} y también se publica en la ruta del artículo <strong>{articleActual?.referencia || articleActual?.nom}</strong> para futuras exclusivas. Las exclusivas ya existentes no se modifican automáticamente.
                                            {articlesCompartintRuta.length > 1 && (
                                                <span className="block mt-1 text-[hsl(var(--accent))]"><strong>Ruta compartida por {articlesCompartintRuta.length} artículos:</strong> {articlesCompartintRuta.map((a) => a.referencia || a.nom).filter(Boolean).join(', ')}.</span>
                                            )}
                                        </p>
                                    </button>
                                )}
                            </div>

                            {error && <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

                            <div className="mt-5 flex gap-3">
                                <button onClick={() => setFase('editar')} disabled={aplicando}
                                    className="h-11 rounded-md bg-secondary px-5 text-sm font-semibold disabled:opacity-50">Volver</button>
                                {aplicando && (
                                    <span className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Aplicando…</span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── Fase 3: resumen ── */}
                    {fase === 'resumen' && resumen && (
                        <div className="text-center py-2">
                            <CheckCircle2 className="mx-auto h-12 w-12 text-[hsl(var(--ok))] mb-3" />
                            <p className="font-display text-2xl uppercase">Cambios aplicados</p>
                            <div className="mt-4 space-y-2 text-left">
                                <div className={`rounded-lg p-3 text-sm ${resumen.exclusiva.ok ? 'bg-[hsl(var(--ok))]/10 text-[hsl(var(--ok))]' : 'bg-destructive/10 text-destructive'}`}>
                                    <p className="font-semibold flex items-center gap-2">
                                        <CheckCircle2 className="h-4 w-4" /> Exclusiva {resumen.exclusiva.nom}
                                    </p>
                                    <p className="text-xs mt-0.5 text-muted-foreground">
                                        Ruta: «{resumen.exclusiva.ruta}»{resumen.exclusiva.clonada ? ' (copia privada creada)' : ''}.
                                        Min. previstos: {resumen.minutsAnterior} → <strong>{resumen.minutsNuevo}</strong>.
                                    </p>
                                </div>
                                <div className={`rounded-lg p-3 text-sm ${resumen.articulo.ok ? 'bg-[hsl(var(--ok))]/10 text-[hsl(var(--ok))]' : 'bg-secondary text-muted-foreground'}`}>
                                    <p className="font-semibold flex items-center gap-2">
                                        <CheckCircle2 className="h-4 w-4" /> Artículo {resumen.articulo.ok ? (resumen.articulo.nom || '—') : '—'}
                                    </p>
                                    <p className="text-xs mt-0.5">
                                        {resumen.articulo.ok
                                            ? `Plantilla «${resumen.articulo.ruta}» actualizada para futuras exclusivas.`
                                            : resumen.articulo.motivo}
                                    </p>
                                </div>
                            </div>
                            <p className="mt-3 text-xs text-muted-foreground">
                                Historial registrado: usuario, fecha, operación, orden anterior/nuevo, tiempos y alcance.
                                El orden y los nuevos tiempos se reflejan en operarios, forecast, calidad, trazabilidad y paneles en vivo.
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

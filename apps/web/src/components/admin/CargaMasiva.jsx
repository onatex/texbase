import React, { useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Play, RotateCcw, RefreshCcw, ShieldCheck, Trash2, Upload, X, XCircle } from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/lib/auth';

const MAX_MONOS = 200;

// Estados que consideramos "futuras": exclusivas cargadas pero sin iniciar.
// Solo estas pueden eliminarse al desaparecer de una nueva carga.
const FUTURE_STATES = ['recibida', 'pendent'];

// Parse a pasted tab-separated table (with or without header)
function parsePaste(raw) {
    const lines = raw
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((l) => l.split('\t').map((c) => c.trim()))
        .filter((r) => r.some((c) => c));
    if (!lines.length) return [];

    // Detect if first line is a header (contains known header keywords)
    const HEADER_KEYWORDS = ['exclusiva', 'article', 'marca', 'unitat', 'data', 'express'];
    const firstNorm = lines[0].map((c) => c.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
    const isHeader = HEADER_KEYWORDS.some((k) => firstNorm.some((c) => c.includes(k)));

    const dataLines = isHeader ? lines.slice(1) : lines;

    // If header detected, map columns by name; otherwise use fixed order:
    // 0: Data prevista recepció
    // 1: Data real recepcio
    // 2: Exclusiva
    // 3: Article (referencia)
    // 4: Marca
    // 5: Unitats
    // 6: Data entrega
    // 7: Data estimada
    // 8: Express
    const colMap = { dprev: 0, dreal: 1, exclusiva: 2, article: 3, marca: 4, unitats: 5, dentrega: 6, destimada: 7, express: 8 };

    if (isHeader) {
        const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
        lines[0].forEach((h, i) => {
            const n = norm(h);
            if (n.includes('prevista') || n.includes('previst')) colMap.dprev = i;
            else if (n.includes('real') && n.includes('recepcio')) colMap.dreal = i;
            else if (n.includes('exclusiva')) colMap.exclusiva = i;
            else if (n.includes('article') || n.includes('referencia')) colMap.article = i;
            else if (n.includes('marca')) colMap.marca = i;
            else if (n.includes('unitat') || n.includes('quantitat') || n.includes('cantidad')) colMap.unitats = i;
            else if (n.includes('entrega')) colMap.dentrega = i;
            else if (n.includes('estimada') || n.includes('estimat')) colMap.destimada = i;
            else if (n.includes('express')) colMap.express = i;
        });
    }

    const g = (row, key) => (row[colMap[key]] ?? '').trim();

    return dataLines.map((row, idx) => ({
        _line: idx + (isHeader ? 2 : 1),
        data_prevista_recepcio: g(row, 'dprev'),
        data_real_recepcio: g(row, 'dreal'),
        exclusiva: g(row, 'exclusiva'),
        referencia: g(row, 'article'),
        marca: g(row, 'marca'),
        unitats: g(row, 'unitats'),
        data_entrega: g(row, 'dentrega'),
        data_estimada: g(row, 'destimada'),
        express: ['si', 'sí', 'yes', 's', 'y', '1', 'true', 'x'].includes(g(row, 'express').toLowerCase()),
    }));
}

function validateRow(row) {
    const errors = [];
    if (!row.exclusiva) errors.push('Falta número de exclusiva');
    if (!row.referencia) errors.push('Falta referencia de artículo');
    if (!row.marca) errors.push('Falta marca');
    const u = parseInt(row.unitats);
    if (!u || u < 1) errors.push('Cantidad inválida');
    if (!row.data_entrega) errors.push('Falta fecha de entrega');
    return errors;
}

// Comprueba si una exclusiva "futura" tiene datos protegidos que impiden
// su eliminación automática: monos iniciados, registros, controles de
// calidad, retrabajos o control de calidad por unidades.
async function checkProtected(exclusivaId) {
    const reasons = [];
    const safeList = async (col, filter, label) => {
        try {
            const items = await pb.collection(col).getList(1, 1, {
                filter,
                requestKey: `prot-${col}-${exclusivaId}`,
            });
            if (items && items.totalItems > 0) reasons.push(label);
        } catch (_) { /* ignorar errores de colección inexistente */ }
    };

    await Promise.all([
        safeList('monos', `exclusiva = "${exclusivaId}" && estat != "pendent"`, 'monos iniciados'),
        safeList('registres', `exclusiva = "${exclusivaId}"`, 'registros de tiempo'),
        safeList('controles_qualitat', `exclusiva = "${exclusivaId}"`, 'controles de calidad'),
        safeList('retrabajos', `exclusiva = "${exclusivaId}"`, 'retrabajos'),
        safeList('control_calidad', `exclusiva_id = "${exclusivaId}"`, 'control de calidad por unidades'),
    ]);

    return { protected: reasons.length > 0, reasons };
}

const CargaMasiva = ({ rutes, exclusives, articles, recarrega }) => {
    const { user } = useAuth();
    const [pastedText, setPastedText] = useState('');
    const [preview, setPreview] = useState(null); // parsed rows with validation
    const [disappeared, setDisappeared] = useState([]); // future exclusivas ausentes de la nueva carga
    const [processing, setProcessing] = useState(false);
    const [results, setResults] = useState(null);
    const [csvDragging, setCsvDragging] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(null); // { toDelete, conserved, validCount }
    // Origen de la carga actual: nombre del fichero CSV/TSV o 'Pegado manual'.
    const [origenFitxer, setOrigenFitxer] = useState('');
    const csvFileRef = useRef(null);

    // Registra en el historial de eliminaciones una exclusiva futura antes
    // de borrarla, para que quede trazabilidad consultable aunque el
    // registro activo desaparezca. No lanza error si falla la auditoría:
    // la eliminación prosigue, pero se informa en el resumen.
    const registrarEliminacio = async (ex, motiuDescripcio, monosCount) => {
        try {
            const rutaObj = ex.ruta ? rutes.find((r) => r.id === ex.ruta) : null;
            await pb.collection('historial_eliminacions_exclusivas').create({
                exclusiva_codi: ex.exclusiva || '',
                exclusiva_id: ex.id || '',
                referencia: ex.referencia || '',
                article: ex.article || '',
                marca: ex.marca || '',
                unitats: ex.unitats || 0,
                monos_count: monosCount ?? 0,
                ruta_nom: rutaObj?.nom || '',
                estat_anterior: ex.estat || '',
                motiu: 'desapareguda_carrega',
                motiu_descripcio: motiuDescripcio || 'Eliminada al no aparecer en la nueva carga masiva',
                origen_carrega: 'carga_masiva',
                origen_nom_fitxer: origenFitxer || 'Pegado manual',
                usuario_id: user?.id || '',
                usuario_email: user?.email || '',
                fecha_eliminacion: new Date().toISOString(),
            }, { requestKey: `hist-elim-${ex.id}` });
        } catch (err) {
            // Trazabilidad best-effort: no bloquear la eliminación.
            console.warn('No se pudo registrar historial de eliminación', ex?.exclusiva, err);
        }
    };

    const handleCsvFile = (file) => {
        if (!file) return;
        const ext = file.name.toLowerCase();
        if (!ext.match(/\.(csv|txt|tsv)$/)) {
            alert('Solo se admiten archivos CSV o TSV. Para Excel, copia y pega la tabla directamente.');
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target.result;
            // Convert CSV commas/semicolons to tabs for the parser
            const normalized = text.replace(/\r\n?/g, '\n').split('\n').map((line) => {
                if (line.includes('\t')) return line;
                if (line.includes(';')) return line.split(';').join('\t');
                return line.split(',').join('\t');
            }).join('\n');
            setPastedText(normalized);
            setOrigenFitxer(file.name);
            setPreview(null);
            setDisappeared([]);
            setResults(null);
        };
        reader.readAsText(file, 'UTF-8');
    };

    const handleParse = () => {
        const rows = parsePaste(pastedText);
        if (!rows.length) {
            setPreview([]);
            setDisappeared([]);
            return;
        }
        const annotated = rows.map((row) => {
            const errors = validateRow(row);
            const art = articles.find((a) => a.referencia?.toUpperCase() === row.referencia.toUpperCase());
            const ruta = art ? rutes.find((r) => r.id === art.ruta) : null;
            const ops = ruta?.operacions || [];
            const minPerUnit = ops.reduce((a, o) => a + Number(o.temps_estandard_min || 0), 0);
            const unitats = parseInt(row.unitats) || 0;
            const minuts = minPerUnit > 0 ? minPerUnit * unitats : Number(art?.temps_estandard_total_min || 0);
            const existing = exclusives.find((e) => e.exclusiva === row.exclusiva);
            const alreadyExists = !!existing;
            return {
                ...row,
                _errors: errors,
                _valid: errors.length === 0,
                _art: art,
                _ruta: ruta,
                _minuts: minuts,
                _exists: alreadyExists,
                _existing: existing || null,
                _prioritat: row.express ? 'express' : 'normal',
            };
        });
        setPreview(annotated);
        setResults(null);

        // Detectar exclusivas "futuras" (recibida/pendent) que ya no aparecen
        // en la nueva carga. Solo se muestran como candidatas a eliminación;
        // la comprobación de datos protegidos se hace al procesar.
        const newCodis = new Set(annotated.map((r) => r.exclusiva).filter(Boolean));
        const desap = exclusives
            .filter((e) => FUTURE_STATES.includes(e.estat) && !newCodis.has(e.exclusiva))
            .map((e) => {
                const rutaObj = e.ruta ? rutes.find((r) => r.id === e.ruta) : null;
                return {
                    id: e.id,
                    exclusiva: e.exclusiva,
                    referencia: e.referencia || '',
                    article: e.article || '',
                    marca: e.marca || '',
                    unitats: e.unitats || 0,
                    estat: e.estat,
                    ruta: e.ruta || '',
                    ruta_nom: rutaObj?.nom || '',
                };
            });
        setDisappeared(desap);
    };

    // Ejecuta la carga: elimina futuras ausentes (solo las no protegidas),
    // actualiza/crea exclusivas y monos, y devuelve el resumen.
    const executeProcess = async (deletions) => {
        if (!preview) return;
        const valid = preview.filter((r) => r._valid);
        if (!valid.length && deletions.toDelete.length === 0) return;

        setProcessing(true);
        const created = [];
        const updated = [];
        const failed = [];
        const deleted = [];
        const conserved = deletions.conserved || [];

        // 1) Eliminar exclusivas futuras ausentes no protegadas.
        //    monos/registres tienen cascadeDelete sobre exclusiva, así que
        //    los monos pendientes se borran automáticamente. Solo llegan
        //    aquí las que no tienen datos protegidos.
        //    ANTES de borrar, se registra cada eliminación en el historial
        //    consultable (historial_eliminacions_exclusivas) para mantener
        //    la trazabilidad aunque el registro activo desaparezca.
        for (const ex of deletions.toDelete) {
            try {
                // Contar monos pendientes afectados para el historial.
                let monosCount = 0;
                try {
                    const monosList = await pb.collection('monos').getList(1, 1, {
                        filter: `exclusiva = "${ex.id}"`,
                        requestKey: `count-monos-del-${ex.id}`,
                    });
                    monosCount = monosList?.totalItems || 0;
                } catch (_) { /* si no se puede contar, registrar 0 */ }

                await registrarEliminacio(
                    ex,
                    `Eliminada al no aparecer en la nueva carga masiva (origen: ${origenFitxer || 'Pegado manual'})`,
                    monosCount,
                );

                await pb.collection('exclusives').delete(ex.id, { requestKey: `del-future-${ex.id}` });
                deleted.push({
                    exclusiva: ex.exclusiva,
                    referencia: ex.referencia,
                    unitats: ex.unitats,
                    monos: monosCount,
                    marca: ex.marca || '',
                    ruta_nom: ex.ruta_nom || '',
                });
            } catch (err) {
                failed.push({ exclusiva: ex.exclusiva, error: `No se pudo eliminar: ${err?.message || 'Error desconocido'}` });
            }
        }

        // 2) Auto-marcar 'lista_recollida' como 'entregada' si no aparecen en la nueva carga
        try {
            const listaRecollida = await pb.collection('exclusives').getFullList({
                filter: 'estat = "lista_recollida"',
                requestKey: 'auto-entrega-check',
            });
            const newCodis = new Set(valid.map(r => r.exclusiva));
            for (const ex of listaRecollida) {
                if (!newCodis.has(ex.exclusiva)) {
                    await pb.collection('exclusives').update(ex.id, {
                        estat: 'entregada',
                        data_entrega_real: new Date().toISOString(),
                        nota_entrega: 'Entregada automáticamente al no aparecer en nueva carga',
                    }, { requestKey: `auto-entrega-${ex.id}` });
                }
            }
        } catch (_) { /* non-blocking */ }

        // 3) Crear / actualizar exclusivas y monos
        for (const row of valid) {
            try {
                const unitats = parseInt(row.unitats);
                const novaPrioritat = row.express ? 'express' : 'normal';

                // Existing exclusiva → update fecha_entrega / prioritat if changed
                if (row._exists && row._existing) {
                    const ex = row._existing;
                    const changes = {};
                    const canvis = [];
                    if (row.data_entrega && String(row.data_entrega) !== String(ex.data_entrega || '')) {
                        changes.data_entrega = row.data_entrega;
                        canvis.push(`Fecha entrega: "${ex.data_entrega || '—'}" → "${row.data_entrega}"`);
                    }
                    if (novaPrioritat && novaPrioritat !== (ex.prioritat || 'normal')) {
                        changes.prioritat = novaPrioritat;
                        changes.express = row.express;
                        canvis.push(`Prioridad: "${ex.prioritat || 'normal'}" → "${novaPrioritat}"`);
                    }
                    if (Object.keys(changes).length > 0) {
                        await pb.collection('exclusives').update(ex.id, changes, { requestKey: `upd-${row.exclusiva}` });
                        updated.push({ exclusiva: row.exclusiva, canvis });
                    }
                    continue;
                }

                const record = await pb.collection('exclusives').create({
                    exclusiva: row.exclusiva,
                    referencia: row.referencia.toUpperCase(),
                    article: row._art?.nom || row.referencia,
                    marca: row.marca,
                    unitats,
                    data_prevista_recepcio: row.data_prevista_recepcio,
                    data_real_recepcio: row.data_real_recepcio,
                    data_entrega: row.data_entrega,
                    data_estimada: row.data_estimada,
                    express: row.express,
                    prioritat: novaPrioritat,
                    ruta: row._ruta?.id || '',
                    minuts_previstos: row._minuts || 0,
                    estat: 'recibida',
                    estado_validacion: 'no_validado',
                });

                const total = Math.min(unitats, MAX_MONOS);
                for (let n = 1; n <= total; n++) {
                    await pb.collection('monos').create(
                        {
                            exclusiva: record.id,
                            numero: n,
                            codi: `${row.exclusiva}-${String(n).padStart(3, '0')}`,
                            estat: 'pendent',
                            operacio_actual: row._ruta?.operacions?.[0]?.nom || '',
                        },
                        { requestKey: `mono-batch-${row.exclusiva}-${n}` },
                    );
                }
                created.push({ exclusiva: row.exclusiva, monos: total, unitats });
            } catch (err) {
                failed.push({ exclusiva: row.exclusiva, error: err?.message || 'Error desconocido' });
            }
        }

        setResults({ created, updated, failed, deleted, conserved });
        setProcessing(false);
        setConfirmDelete(null);
        recarrega();
    };

    // Al pulsar "Procesar": comprueba qué futuras ausentes son seguras de
    // eliminar (sin datos protegidos) y pide confirmación si hay alguna.
    const handleProcessClick = async () => {
        if (!preview) return;
        const valid = preview.filter((r) => r._valid);

        if (disappeared.length === 0) {
            await executeProcess({ toDelete: [], conserved: [] });
            return;
        }

        setProcessing(true);
        const toDelete = [];
        const conserved = [];

        for (const ex of disappeared) {
            const { protected: isProtected, reasons } = await checkProtected(ex.id);
            if (isProtected) {
                conserved.push({ ...ex, reasons });
            } else {
                toDelete.push(ex);
            }
        }
        setProcessing(false);

        // Si hay eliminaciones que afectan datos visibles, pedir confirmación.
        if (toDelete.length > 0) {
            setConfirmDelete({ toDelete, conserved, validCount: valid.length });
        } else {
            // Nada que eliminar (todas protegidas); proceder directamente.
            await executeProcess({ toDelete: [], conserved });
        }
    };

    const handleReset = () => {
        setPastedText('');
        setPreview(null);
        setDisappeared([]);
        setResults(null);
        setConfirmDelete(null);
        setOrigenFitxer('');
    };

    const validCount = preview?.filter((r) => r._valid).length ?? 0;
    const invalidCount = preview?.filter((r) => !r._valid).length ?? 0;

    return (
        <div className="mx-auto max-w-4xl space-y-5">
            <div className="rounded-lg border border-border bg-card p-6">
                <h3 className="font-display text-3xl uppercase">Carga masiva de exclusivas</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                    Copia y pega la tabla desde Excel o cualquier hoja de cálculo. Columnas esperadas (en orden):
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {['Data prevista recepció', 'Data real recepció', 'Exclusiva', 'Article', 'Marca', 'Unitats', 'Data entrega', 'Data estimada', 'Express'].map((c) => (
                        <span key={c} className="rounded bg-secondary px-2 py-0.5 font-mono text-xs">{c}</span>
                    ))}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                    Si la primera fila contiene cabeceras, se detectarán automáticamente. Campos obligatorios: <strong>Exclusiva, Article, Marca, Unitats, Data entrega</strong>.
                </p>
                <p className="mt-2 rounded-md bg-[hsl(var(--warn))]/10 px-3 py-2 text-xs text-[hsl(var(--warn))]">
                    Las exclusivas <strong>futuras</strong> (recibidas/pendientes, sin actividad) que ya no aparezcan en esta carga se eliminarán del listado. Las exclusivas con actividad (iniciadas, en curso, pausadas, terminadas, en Calidad, entregadas, etc.) se conservan siempre.
                </p>
            </div>

            {/* CSV file drop zone */}
            <div
                onDragOver={(e) => { e.preventDefault(); setCsvDragging(true); }}
                onDragLeave={() => setCsvDragging(false)}
                onDrop={(e) => { e.preventDefault(); setCsvDragging(false); const f = e.dataTransfer.files[0]; if (f) handleCsvFile(f); }}
                onClick={() => csvFileRef.current?.click()}
                className={`flex cursor-pointer items-center gap-4 rounded-xl border-2 border-dashed p-5 transition-all
                    ${csvDragging ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-border hover:border-primary/50 hover:bg-muted/30'}`}
            >
                <input ref={csvFileRef} type="file" accept=".csv,.txt,.tsv" className="hidden"
                    onChange={(e) => { handleCsvFile(e.target.files?.[0]); e.target.value = ''; }} />
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-dashed transition-colors
                    ${csvDragging ? 'border-primary bg-primary/10' : 'border-border bg-muted/50'}`}>
                    <FileSpreadsheet className={`h-6 w-6 ${csvDragging ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                        <span className="text-primary">Arrastra un CSV/TSV aquí</span> o haz click para seleccionar
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        .csv · .tsv · .txt — Los datos se cargarán en el campo de abajo. Para Excel, copia y pega directamente.
                    </p>
                </div>
                <Upload className={`h-5 w-5 shrink-0 ${csvDragging ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>

            {/* Paste area */}
            <div className="rounded-lg border border-border bg-card p-6 space-y-4">
                <label className="text-sm font-semibold">O pega la tabla aquí</label>
                <textarea
                    value={pastedText}
                    onChange={(e) => { setPastedText(e.target.value); setOrigenFitxer(''); setPreview(null); setDisappeared([]); setResults(null); }}
                    placeholder={"Data prevista\tData real\tExclusiva\tArticle\tMarca\tUnitats\tData entrega\tData estimada\tExpress\n01/08/2026\t01/08/2026\t18815\tR82-020\tAlpinestars\t5\t15/09/2026\t10/09/2026\tNo"}
                    rows={8}
                    className="w-full rounded-md border border-input bg-background p-3 font-mono text-xs resize-y"
                    spellCheck={false}
                />
                <div className="flex gap-3">
                    <button
                        onClick={handleParse}
                        disabled={!pastedText.trim()}
                        className="flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground active:scale-[0.99] disabled:opacity-50"
                    >
                        <Play className="h-4 w-4" />
                        Procesar tabla
                    </button>
                    {(preview || results) && (
                        <button
                            onClick={handleReset}
                            className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm font-semibold active:scale-[0.99]"
                        >
                            <RotateCcw className="h-4 w-4" />
                            Limpiar
                        </button>
                    )}
                </div>
            </div>

            {/* Preview table */}
            {preview && preview.length > 0 && !results && (
                <div className="rounded-lg border border-border bg-card p-6 space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <h4 className="font-display text-xl uppercase">Vista previa — {preview.length} filas detectadas</h4>
                        <div className="flex gap-3 text-sm">
                            {validCount > 0 && (
                                <span className="flex items-center gap-1 text-[hsl(var(--ok))] font-semibold">
                                    <CheckCircle2 className="h-4 w-4" /> {validCount} válidas
                                </span>
                            )}
                            {invalidCount > 0 && (
                                <span className="flex items-center gap-1 text-destructive font-semibold">
                                    <XCircle className="h-4 w-4" /> {invalidCount} con errores
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-border text-left text-muted-foreground">
                                    <th className="pb-2 pr-3">Lín.</th>
                                    <th className="pb-2 pr-3">Exclusiva</th>
                                    <th className="pb-2 pr-3">Referencia</th>
                                    <th className="pb-2 pr-3">Marca</th>
                                    <th className="pb-2 pr-3">Uds</th>
                                    <th className="pb-2 pr-3">Entrega</th>
                                    <th className="pb-2 pr-3">Ruta detectada</th>
                                    <th className="pb-2 pr-3">Acción</th>
                                    <th className="pb-2">Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {preview.map((row, i) => (
                                    <tr key={i} className={`border-b border-border/50 ${row._valid ? '' : 'bg-destructive/5'}`}>
                                        <td className="py-2 pr-3 text-muted-foreground">{row._line}</td>
                                        <td className="py-2 pr-3 font-mono font-semibold">{row.exclusiva || '—'}</td>
                                        <td className="py-2 pr-3 font-mono">{row.referencia || '—'}</td>
                                        <td className="py-2 pr-3">{row.marca || '—'}</td>
                                        <td className="py-2 pr-3 tabular-nums">{row.unitats || '—'}</td>
                                        <td className="py-2 pr-3">{row.data_entrega || '—'}</td>
                                        <td className="py-2 pr-3">
                                            {row._ruta ? (
                                                <span className="text-[hsl(var(--ok))]">{row._ruta.nom}</span>
                                            ) : row.referencia ? (
                                                <span className="text-[hsl(var(--warn))]">No encontrada</span>
                                            ) : '—'}
                                        </td>
                                        <td className="py-2 pr-3">
                                            {row._exists
                                                ? <span className="rounded bg-[hsl(var(--accent))]/15 px-2 py-0.5 text-xs font-semibold text-[hsl(var(--accent))]">Actualizar</span>
                                                : <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">Nueva</span>}
                                        </td>
                                        <td className="py-2">
                                            {row._valid ? (
                                                <span className="flex items-center gap-1 text-[hsl(var(--ok))]">
                                                    <CheckCircle2 className="h-3.5 w-3.5" /> OK
                                                </span>
                                            ) : (
                                                <span className="flex items-start gap-1 text-destructive">
                                                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                                    <span>{row._errors.join(' · ')}</span>
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Exclusivas futuras que desaparecen */}
                    {disappeared.length > 0 && (
                        <div className="rounded-md border border-[hsl(var(--warn))]/40 bg-[hsl(var(--warn))]/10 p-4 space-y-2">
                            <p className="flex items-center gap-2 font-semibold text-[hsl(var(--warn))]">
                                <AlertTriangle className="h-5 w-5" />
                                {disappeared.length} exclusiva{disappeared.length !== 1 ? 's' : ''} futura{disappeared.length !== 1 ? 's' : ''} que ya no aparecen
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Se eliminarán del listado las que no tengan actividad (monos iniciados, registros, calidad, retrabajos…). Las que tengan datos protegidos se conservarán.
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {disappeared.map((d) => (
                                    <span key={d.id} className="rounded bg-[hsl(var(--warn))]/20 px-2 py-1 font-mono text-xs text-[hsl(var(--warn))]">
                                        {d.exclusiva} · {d.referencia || '—'} · {d.unitats} uds
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {validCount > 0 && (
                        <button
                            onClick={handleProcessClick}
                            disabled={processing}
                            className="flex h-14 w-full items-center justify-center gap-3 rounded-lg bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] text-lg font-semibold active:scale-[0.99] disabled:opacity-60"
                        >
                            {processing ? (
                                <><Loader2 className="h-6 w-6 animate-spin" /> Comprobando exclusivas...</>
                            ) : (
                                <>
                                    <Play className="h-6 w-6" />
                                    {disappeared.length > 0
                                        ? `Procesar carga (eliminar ${disappeared.length} futura${disappeared.length !== 1 ? 's' : ''})`
                                        : `Crear ${validCount} exclusiva${validCount !== 1 ? 's' : ''}`}
                                </>
                            )}
                        </button>
                    )}
                </div>
            )}

            {preview && preview.length === 0 && (
                <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
                    No se detectaron filas de datos. Asegúrate de pegar contenido con tabulaciones.
                </div>
            )}

            {/* Modal de confirmación de eliminación */}
            {confirmDelete && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
                    <div className="modal-card w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-xl space-y-4 max-h-[90dvh] overflow-y-auto">
                        <div className="flex items-start justify-between gap-3">
                            <h4 className="font-display text-2xl uppercase text-destructive flex items-center gap-2">
                                <AlertTriangle className="h-6 w-6" />
                                Confirmar eliminación
                            </h4>
                            <button
                                onClick={() => setConfirmDelete(null)}
                                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                                aria-label="Cerrar"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <p className="text-sm text-muted-foreground">
                            Las siguientes <strong>{confirmDelete.toDelete.length}</strong> exclusiva{confirmDelete.toDelete.length !== 1 ? 's' : ''} futura{confirmDelete.toDelete.length !== 1 ? 's' : ''} no aparecen en la nueva carga y se eliminarán del listado. No tienen actividad registrada.
                        </p>

                        <div className="rounded-md bg-destructive/10 p-3 space-y-1.5 max-h-48 overflow-y-auto">
                            {confirmDelete.toDelete.map((d) => (
                                <div key={d.id} className="flex items-center gap-2 text-sm">
                                    <Trash2 className="h-4 w-4 shrink-0 text-destructive" />
                                    <span className="font-mono font-semibold">{d.exclusiva}</span>
                                    <span className="text-muted-foreground">· {d.referencia || '—'} · {d.unitats} uds</span>
                                </div>
                            ))}
                        </div>

                        {confirmDelete.conserved.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-sm font-semibold flex items-center gap-2 text-[hsl(var(--ok))]">
                                    <ShieldCheck className="h-4 w-4" />
                                    {confirmDelete.conserved.length} exclusiva{confirmDelete.conserved.length !== 1 ? 's' : ''} conservada{confirmDelete.conserved.length !== 1 ? 's' : ''} (con actividad)
                                </p>
                                <div className="rounded-md bg-[hsl(var(--ok))]/10 p-3 space-y-1.5 max-h-40 overflow-y-auto">
                                    {confirmDelete.conserved.map((d) => (
                                        <div key={d.id} className="text-xs">
                                            <span className="font-mono font-semibold">{d.exclusiva}</span>
                                            <span className="text-muted-foreground"> · {d.referencia || '—'} — {d.reasons.join(', ')}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
                            <button
                                onClick={() => setConfirmDelete(null)}
                                className="flex-1 rounded-lg border border-border bg-background px-4 py-3 text-sm font-semibold active:scale-[0.99]"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => executeProcess(confirmDelete)}
                                disabled={processing}
                                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-destructive px-4 py-3 text-sm font-semibold text-destructive-foreground active:scale-[0.99] disabled:opacity-60"
                            >
                                {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                Confirmar y procesar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Results */}
            {results && (
                <div className="rounded-lg border border-border bg-card p-6 space-y-4">
                    <h4 className="font-display text-xl uppercase">Resumen de carga</h4>

                    {results.deleted.length > 0 && (
                        <div className="rounded-md bg-destructive/10 p-4 space-y-2">
                            <p className="flex items-center gap-2 font-semibold text-destructive">
                                <Trash2 className="h-5 w-5" />
                                {results.deleted.length} exclusiva{results.deleted.length !== 1 ? 's' : ''} futura{results.deleted.length !== 1 ? 's' : ''} eliminada{results.deleted.length !== 1 ? 's' : ''} del listado
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Cada eliminación queda registrada en el historial de eliminaciones (consultable) con referencia, unidades, monos, fecha/hora, usuario y origen de la carga.
                            </p>
                            <ul className="space-y-1 text-xs">
                                {results.deleted.map((r) => (
                                    <li key={r.exclusiva} className="font-mono text-destructive">
                                        <strong>{r.exclusiva}</strong> · {r.referencia || '—'} · {r.marca || '—'} · {r.unitats} uds · {r.monos} monos{r.ruta_nom ? ` · ${r.ruta_nom}` : ''}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {results.conserved.length > 0 && (
                        <div className="rounded-md bg-[hsl(var(--ok))]/10 p-4 space-y-2">
                            <p className="flex items-center gap-2 font-semibold text-[hsl(var(--ok))]">
                                <ShieldCheck className="h-5 w-5" />
                                {results.conserved.length} exclusiva{results.conserved.length !== 1 ? 's' : ''} conservada{results.conserved.length !== 1 ? 's' : ''} por tener actividad
                            </p>
                            <ul className="space-y-1 text-xs text-muted-foreground">
                                {results.conserved.map((r) => (
                                    <li key={r.exclusiva} className="font-mono">
                                        <strong>{r.exclusiva}</strong> · {r.referencia || '—'} — {r.reasons.join(', ')}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {results.created.length > 0 && (
                        <div className="rounded-md bg-[hsl(var(--ok))]/10 p-4 space-y-2">
                            <p className="flex items-center gap-2 font-semibold text-[hsl(var(--ok))]">
                                <CheckCircle2 className="h-5 w-5" />
                                {results.created.length} exclusiva{results.created.length !== 1 ? 's' : ''} creada{results.created.length !== 1 ? 's' : ''} correctamente
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {results.created.map((r) => (
                                    <span key={r.exclusiva} className="rounded bg-[hsl(var(--ok))]/20 px-2 py-1 font-mono text-xs text-[hsl(var(--ok))]">
                                        {r.exclusiva} · {r.monos} monos
                                        {r.monos < r.unitats ? ` (límite ${MAX_MONOS})` : ''}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {results.updated.length > 0 && (
                        <div className="rounded-md bg-[hsl(var(--accent))]/10 p-4 space-y-2">
                            <p className="flex items-center gap-2 font-semibold text-[hsl(var(--accent))]">
                                <RefreshCcw className="h-5 w-5" />
                                {results.updated.length} exclusiva{results.updated.length !== 1 ? 's' : ''} actualizada{results.updated.length !== 1 ? 's' : ''}
                            </p>
                            <ul className="space-y-1.5 text-sm">
                                {results.updated.map((r) => (
                                    <li key={r.exclusiva} className="font-mono">
                                        <strong>{r.exclusiva}</strong>
                                        <ul className="ml-4 list-disc text-xs text-muted-foreground">
                                            {r.canvis.map((c, i) => <li key={i}>{c}</li>)}
                                        </ul>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {results.failed.length > 0 && (
                        <div className="rounded-md bg-destructive/10 p-4 space-y-2">
                            <p className="flex items-center gap-2 font-semibold text-destructive">
                                <XCircle className="h-5 w-5" />
                                {results.failed.length} exclusiva{results.failed.length !== 1 ? 's' : ''} con error
                            </p>
                            <ul className="space-y-1 text-sm text-destructive">
                                {results.failed.map((r) => (
                                    <li key={r.exclusiva} className="font-mono">
                                        <strong>{r.exclusiva}</strong>: {r.error}
                                    </li>
                                ))}
                            </ul>
                            <p className="text-xs text-muted-foreground mt-2">
                                Corrige los errores en la tabla pegada, pulsa "Limpiar" y vuelve a intentarlo.
                            </p>
                        </div>
                    )}

                    <button
                        onClick={handleReset}
                        className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm font-semibold active:scale-[0.99]"
                    >
                        <RotateCcw className="h-4 w-4" />
                        Nueva carga
                    </button>
                </div>
            )}
        </div>
    );
};

export default CargaMasiva;

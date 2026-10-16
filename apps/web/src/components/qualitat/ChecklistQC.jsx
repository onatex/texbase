import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Search, CheckCircle2, AlertTriangle, ChevronRight, Save, ArrowLeft, Lightbulb, History, PackageCheck, Clock, Pause, Play, RefreshCcw, User, Wrench, Camera, LogOut, Calendar, ExternalLink, X, Filter, Zap } from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/lib/auth';
import { MultiFileDrop } from '@/components/common/DragDropUpload';
import PhotoPicker from '@/components/qualitat/PhotoPicker';

const PUNTS = [
    'Cuello', 'Sisas', 'Puños', 'Rib de espalda', 'Cremalleras',
    'Bolsillos', 'Velcros', 'Cinturón', 'Costuras', 'Repuntes',
    'Casado del estampado', 'Ataques de overlock', 'Medidas', 'Talla',
    'Etiquetas', 'Limpieza final',
];

const RESULTATS = [
    { val: 'aprovat', label: 'Aprobado', cls: 'border-[hsl(var(--ok))]/60 bg-[hsl(var(--ok))]/10 text-[hsl(var(--ok))]' },
    { val: 'aprovat_obs', label: 'Obs.', cls: 'border-[hsl(var(--warn))]/60 bg-[hsl(var(--warn))]/10 text-[hsl(var(--warn))]' },
    { val: 'rebutjat', label: 'Rechazado', cls: 'border-destructive/50 bg-destructive/10 text-destructive' },
    { val: 'bloquejat', label: 'Bloqueado', cls: 'border-destructive/70 bg-destructive/15 text-destructive' },
];

const AREAS = [
    { val: 'confeccio', label: 'Confección' },
    { val: 'estampacion', label: 'Estampación' },
    { val: 'acabats', label: 'Acabados' },
    { val: 'oficina_tecnica', label: 'Oficina Técnica' },
    { val: 'logistica', label: 'Logística' },
];

function initChecklist() {
    return Object.fromEntries(PUNTS.map(p => [p, { result: null, descripcio: '', area: 'confeccio', prioritat: 'media', proposta: '', similarNCs: null, loadingSimilar: false, fotos: [], crearRetrabajo: false, operarioAsignado: '', operacionRetrabajo: '', faseRetrabajo: '', notasRetrabajo: '', tiempoEstimadoRetrabajo: '' }]));
}

async function fetchSimilarNCs(punt) {
    try {
        const all = await pb.collection('no_conformitats').getFullList({
            filter: `punt_checklist = "${punt}"`,
            sort: '-created',
            expand: 'categoria',
            requestKey: `similar-nc-${Date.now()}`,
        });
        return all.slice(0, 5);
    } catch { return []; }
}

const QC_TEMPS_STD_SEG = 600; // 10 min default standard inspection time

function fmtSegons(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function ChecklistQC({ exclusives, monos }) {
    const { user, rol } = useAuth();
    // Propuestas de mejora / acciones preventivas solo visibles para admin, superadmin y producción
    const puedeVerPropuestas = rol === 'admin' || rol === 'superadmin' || rol === 'produccio';
    const [q, setQ] = useState('');
    const [qDebounced, setQDebounced] = useState('');
    const [mode, setMode] = useState('2dias'); // '2dias' | 'todas' | 'buscar'
    const [filtreRetras, setFiltreRetras] = useState('tots');
    const [exSel, setExSel] = useState(null);
    const [monoSel, setMonoSel] = useState(null);
    const [checklist, setChecklist] = useState(initChecklist);
    const [desant, setDesant] = useState(false);
    const [savedCount, setSavedCount] = useState(null);
    const [marcantTerminada, setMarcantTerminada] = useState(false);
    const [exTerminada, setExTerminada] = useState(false);
    const tempsInici = useRef(null);
    const tempsNetRef = useRef(0);
    const pausatRef = useRef(false);
    const [tempsSegons, setTempsSegons] = useState(0);
    const [pausat, setPausat] = useState(false);

    // Retrabajo support
    const [operaris, setOperaris] = useState([]);
    const [opsDef, setOpsDef] = useState([]);
    const [retrabajosEx, setRetrabajosEx] = useState([]);
    const [retrabajosCreados, setRetrabajosCreados] = useState(0);

    // ── QC session state (pause/resume rework flow) ──
    const [qcSession, setQcSession] = useState(null);       // controles_qualitat record
    const [qcEstado, setQcEstado] = useState(null);          // 'en_retrabajo' | 'en_proceso' | 'completado'
    const [retrabajoActivoSesion, setRetrabajoActivoSesion] = useState(null); // retrabajo record
    const [verificando, setVerificando] = useState(false);
    const [rechazoSesion, setRechazoSesion] = useState(null); // { operario, notas }
    const [dandoSalida, setDandoSalida] = useState(false);

    // Modal de rechazo: al marcar "Rechazado" se pregunta si crear retrabajo o incidencia
    const [rechazoModal, setRechazoModal] = useState(null); // { punt, mode: 'pregunta' | 'retrabajo' }

    // ── Sesión activa de calidad (heartbeat) ──────────────────────────
    // Mientras se inspecciona un mono (monoSel) y la sesión no está completada,
    // se mantiene un registro en `actividad_calidad` (estado='en_proceso' o
    // 'en_retrabajo') para que el Dashboard "En vivo", el Kanban y el panel de
    // Calidad puedan mostrar al operario de Calidad en curso. Se elimina al
    // cerrar/guardar la inspección. No guarda resultados: es solo un marcador
    // de presencia efímero. No cuenta pausas como tiempo activo (el tiempo
    // vivo se calcula en el dashboard desde `updated`, congelado en retrabajo).
    const activeQcSessionRef = useRef(null);
    useEffect(() => {
        let cancelled = false;
        const sid = activeQcSessionRef.current;
        const enInspeccion = !!monoSel && qcEstado !== 'completado';
        if (enInspeccion && exSel && user?.id) {
            const estado = qcEstado === 'en_retrabajo' ? 'en_retrabajo' : 'en_proceso';
            (async () => {
                try {
                    // Cerrar sesión previa (p. ej. en_proceso → en_retrabajo) para
                    // no dejar heartbeats huérfanos del mismo operario+mono.
                    if (sid) {
                        try { await pb.collection('actividad_calidad').delete(sid, { requestKey: `ck-act-prev-${sid}` }); } catch (e) {}
                        activeQcSessionRef.current = null;
                    }
                    const existing = await pb.collection('actividad_calidad').getFullList({
                        filter: `operari="${user.id}" && exclusiva="${exSel.id}" && mono="${monoSel.id}" && estado = "${estado}"`,
                        requestKey: `ck-act-find-${exSel.id}-${monoSel.id}`,
                    }).catch(() => []);
                    let rec;
                    if (existing && existing.length) {
                        rec = await pb.collection('actividad_calidad').update(existing[0].id, {
                            operacio: `Control de calidad · ${monoSel.codi || ''}`,
                            estado,
                        }, { requestKey: `ck-act-touch-${existing[0].id}` });
                    } else {
                        rec = await pb.collection('actividad_calidad').create({
                            operari: user.id,
                            exclusiva: exSel.id,
                            mono: monoSel.id,
                            operacio: `Control de calidad · ${monoSel.codi || ''}`,
                            estado,
                        }, { requestKey: `ck-act-create-${exSel.id}-${monoSel.id}-${Date.now()}` });
                    }
                    if (!cancelled) activeQcSessionRef.current = rec.id;
                } catch (e) { /* no bloquear la inspección */ }
            })();
        } else if (sid) {
            // Cerrar sesión activa al dejar de inspeccionar o al completar
            activeQcSessionRef.current = null;
            (async () => {
                try {
                    await pb.collection('actividad_calidad').delete(sid, { requestKey: `ck-act-stop-${sid}` });
                } catch (e) { /* ya eliminada o permiso */ }
            })();
        }
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [monoSel && monoSel.id, exSel && exSel.id, user && user.id, qcEstado]);

    // Al desmontar el componente, cerrar cualquier sesión activa pendiente.
    useEffect(() => {
        return () => {
            const sid = activeQcSessionRef.current;
            if (!sid) return;
            activeQcSessionRef.current = null;
            try { pb.collection('actividad_calidad').delete(sid, { requestKey: `ck-act-unmount-${sid}` }).catch(() => {}); } catch (e) {}
        };
    }, []);

    // Debounce search input
    useEffect(() => {
        const t = setTimeout(() => setQDebounced(q.trim()), 250);
        return () => clearTimeout(t);
    }, [q]);

    // Index monos by exclusiva id → codi list (for mono-number search)
    const monosPerEx = useMemo(() => {
        const map = {};
        monos.forEach((m) => {
            const k = m.exclusiva;
            if (!k) return;
            if (!map[k]) map[k] = [];
            map[k].push(m.codi || String(m.numero || ''));
        });
        return map;
    }, [monos]);

    const exFiltered = useMemo(() => {
        const t = qDebounced.toLowerCase();
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const list = exclusives
            .filter(e => {
                const dies = e.data_entrega ? Math.ceil((new Date(e.data_entrega + 'T00:00:00') - today) / 86400000) : null;
                const retrasat = dies !== null && dies < 0;

                // Mode filter
                if (mode === '2dias') {
                    // Próximos 2 días + retrasadas
                    if (dies === null) return false;
                    if (dies > 2 && !retrasat) return false;
                }
                // 'todas' and 'buscar' → no date filter

                // Retras filter (only relevant in 2dias/todas)
                if (mode !== 'buscar') {
                    if (filtreRetras === 'retrasats' && !retrasat) return false;
                    if (filtreRetras === 'a_temps' && retrasat) return false;
                }

                // Text search across exclusiva, article, marca, referencia, mono codis
                if (t) {
                    const monosCodis = (monosPerEx[e.id] || []).join(' ').toLowerCase();
                    const haystack = `${e.exclusiva} ${e.article || ''} ${e.marca || ''} ${e.referencia || ''} ${monosCodis}`;
                    if (!haystack.toLowerCase().includes(t)) return false;
                } else if (mode === 'buscar') {
                    // In buscar mode with no query → show nothing (prompt to type)
                    return false;
                }
                return true;
            })
            .map(e => {
                const dies = e.data_entrega ? Math.ceil((new Date(e.data_entrega + 'T00:00:00') - today) / 86400000) : null;
                return { ...e, _diesEntrega: dies, _retrasat: dies !== null && dies < 0, _monos: monosPerEx[e.id] || [] };
            })
            .sort((a, b) => {
                if (a._retrasat && !b._retrasat) return -1;
                if (!a._retrasat && b._retrasat) return 1;
                const aD = a._diesEntrega === null ? Infinity : a._diesEntrega;
                const bD = b._diesEntrega === null ? Infinity : b._diesEntrega;
                if (aD !== bD) return aD - bD;
                // Mismo día → Express primero
                const aEx = a.express === true || a.prioritat === 'express';
                const bEx = b.express === true || b.prioritat === 'express';
                if (aEx && !bEx) return -1;
                if (!aEx && bEx) return 1;
                return 0;
            });
        // In buscar mode show all matches; otherwise cap to 36
        return mode === 'buscar' ? list : list.slice(0, 36);
    }, [exclusives, qDebounced, filtreRetras, mode, monosPerEx]);

    // ¿Es una exclusiva Express? (campo bool `express` o prioritat='express')
    const isExpress = useCallback((ex) => ex?.express === true || ex?.prioritat === 'express', []);

    // Agrupar por fecha de entrega, manteniendo el orden (retrasadas primero, Express primero dentro de cada día)
    const exGroups = useMemo(() => {
        const groups = new Map();
        exFiltered.forEach((ex) => {
            const key = ex.data_entrega || '__sense_data__';
            if (!groups.has(key)) groups.set(key, { key, items: [] });
            groups.get(key).items.push(ex);
        });
        return Array.from(groups.values());
    }, [exFiltered]);

    // Etiqueta legible para un grupo de fecha
    const groupLabel = useCallback((g) => {
        if (g.key === '__sense_data__') return 'Sin fecha de entrega';
        const dies = g.items[0]?._diesEntrega;
        const retrasat = g.items[0]?._retrasat;
        let fechaStr = g.key;
        try {
            const d = new Date(g.key + 'T00:00:00');
            if (!isNaN(d.getTime())) {
                fechaStr = d.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
                fechaStr = fechaStr.charAt(0).toUpperCase() + fechaStr.slice(1);
            }
        } catch { /* keep raw */ }
        if (retrasat) return `Retrasadas · ${fechaStr}`;
        if (dies === 0) return `Hoy · ${fechaStr}`;
        if (dies === 1) return `Mañana · ${fechaStr}`;
        return fechaStr;
    }, []);

    const getNetSegons = useCallback(() => {
        const base = tempsNetRef.current;
        if (pausatRef.current || !tempsInici.current) return base;
        return base + Math.floor((Date.now() - tempsInici.current) / 1000);
    }, []);

    const handlePausaReprendre = useCallback(() => {
        if (!pausatRef.current) {
            if (tempsInici.current) {
                tempsNetRef.current += Math.floor((Date.now() - tempsInici.current) / 1000);
                tempsInici.current = null;
            }
            pausatRef.current = true;
            setPausat(true);
        } else {
            tempsInici.current = Date.now();
            pausatRef.current = false;
            setPausat(false);
        }
    }, []);

    // Start timer when mono is selected (fresh checklist)
    useEffect(() => {
        if (monoSel && !qcSession) {
            tempsInici.current = Date.now();
            tempsNetRef.current = 0;
            pausatRef.current = false;
            setPausat(false);
            setTempsSegons(0);
            const id = setInterval(() => {
                if (!pausatRef.current) setTempsSegons(getNetSegons());
            }, 1000);
            return () => clearInterval(id);
        }
        // If a session is restored, the session-loading effect handles the timer.
        return undefined;
    }, [monoSel, qcSession, getNetSegons]);

    const monosEx = useMemo(() => {
        if (!exSel) return [];
        return monos.filter(m => m.exclusiva === exSel.id).sort((a, b) => {
            const order = { finalitzat: 0, retreball: 1, en_curs: 2, pendent: 3 };
            return (order[a.estat] ?? 9) - (order[b.estat] ?? 9);
        });
    }, [exSel, monos]);

    // Load operaris + operacions_def once
    useEffect(() => {
        Promise.all([
            pb.collection('users').getFullList({ filter: 'rol = "operari"', sort: 'name', requestKey: 'qc-operaris' }).catch(() => []),
            pb.collection('operacions_def').getFullList({ sort: 'ordre', requestKey: 'qc-opsdef' }).catch(() => []),
        ]).then(([ops, ods]) => { setOperaris(ops); setOpsDef(ods); });
    }, []);

    // Load retrabajos for selected exclusiva
    const carregaRetrabajos = useCallback(() => {
        if (!exSel) { setRetrabajosEx([]); return; }
        pb.collection('retrabajos').getFullList({
            filter: `exclusiva = "${exSel.id}"`,
            sort: '-created',
            expand: 'operario_asignado,incidencia_calidad',
            requestKey: `qc-retr-${exSel.id}`,
        }).then(setRetrabajosEx).catch(() => setRetrabajosEx([]));
    }, [exSel]);

    useEffect(() => { carregaRetrabajos(); }, [carregaRetrabajos]);

    // ── Load active QC session for the selected mono ──
    const carregaSessio = useCallback(async (mono) => {
        if (!mono) { setQcSession(null); setQcEstado(null); setRetrabajoActivoSesion(null); return; }
        try {
            const sessions = await pb.collection('controles_qualitat').getFullList({
                filter: `mono = "${mono.id}" && (estado_qc = "en_retrabajo" || estado_qc = "en_proceso")`,
                sort: '-created',
                expand: 'retrabajo_activo',
                requestKey: `qc-session-${mono.id}`,
            }).catch(() => []);
            const sess = sessions[0] || null;
            if (sess) {
                setQcSession(sess);
                const est = sess.estado_qc || 'en_proceso';
                setQcEstado(est);
                const inicial = sess.tiempo_qc_inicial_seg || 0;
                tempsNetRef.current = inicial;
                if (est === 'en_retrabajo') {
                    pausatRef.current = true;
                    tempsInici.current = null;
                    setPausat(true);
                } else {
                    // en_proceso (resumed) — continue running additional time
                    pausatRef.current = false;
                    tempsInici.current = Date.now();
                    setPausat(false);
                }
                setTempsSegons(inicial);
                const act = sess.expand?.retrabajo_activo || null;
                setRetrabajoActivoSesion(act);
                // start ticking
                const id = setInterval(() => { if (!pausatRef.current) setTempsSegons(getNetSegons()); }, 1000);
                return () => clearInterval(id);
            } else {
                setQcSession(null); setQcEstado(null); setRetrabajoActivoSesion(null);
            }
        } catch { setQcSession(null); setQcEstado(null); }
        return undefined;
    }, [getNetSegons]);

    // When monoSel changes, load its session
    useEffect(() => {
        let cleanup = undefined;
        carregaSessio(monoSel).then((fn) => { cleanup = fn; });
        return () => { if (typeof cleanup === 'function') cleanup(); };
    }, [monoSel, carregaSessio]);

    // Realtime: watch retrabajos for the active session to detect completion
    useEffect(() => {
        if (!exSel) return undefined;
        const refresca = () => { carregaRetrabajos(); carregaSessio(monoSel); };
        void pb.collection('retrabajos').subscribe('*', refresca).catch(() => {});
        return () => { void pb.collection('retrabajos').unsubscribe('*').catch(() => {}); };
    }, [exSel, monoSel, carregaRetrabajos, carregaSessio]);

    // Operations available for retrabajo (from the exclusiva's ruta)
    const opsRuta = useMemo(() => {
        if (!exSel || !opsDef.length) return [];
        const rutaId = exSel.ruta;
        if (!rutaId) return [];
        return opsDef.filter(o => o.ruta === rutaId && o.actiu !== false).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
    }, [exSel, opsDef]);

    const fasesRuta = useMemo(() => {
        const seen = new Map();
        for (const op of opsRuta) {
            const f = op.fase || 'Sin fase';
            if (!seen.has(f)) seen.set(f, op.fase_ordre ?? 99);
        }
        return [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([f]) => f);
    }, [opsRuta]);

    const setResult = (punt, result) => {
        setChecklist(prev => ({ ...prev, [punt]: { ...prev[punt], result, similarNCs: null, loadingSimilar: result && result !== 'aprovat' } }));
        if (result === 'rebutjat') {
            // Al rechazar, abrir directamente el modal de decisión (retrabajo o incidencia)
            setRechazoModal({ punt, mode: 'pregunta' });
        }
        if (result && result !== 'aprovat') {
            fetchSimilarNCs(punt).then(similar => {
                setChecklist(prev => ({ ...prev, [punt]: { ...prev[punt], loadingSimilar: false, similarNCs: similar } }));
            });
        }
    };

    // ── Handlers del modal de rechazo ──
    const handleCancelarRechazo = (punt) => {
        // Revertir la selección de "Rechazado"
        setChecklist(prev => ({ ...prev, [punt]: { ...prev[punt], result: null, crearRetrabajo: false, operarioAsignado: '', operacionRetrabajo: '', faseRetrabajo: '', notasRetrabajo: '' } }));
        setRechazoModal(null);
    };
    const handleNoIncidencia = (punt) => {
        // Registrar como incidencia (NC) sin retrabajo
        setField(punt, 'crearRetrabajo', false);
        setRechazoModal(null);
    };
    const handleConfirmarRetrabajo = (punt) => {
        const item = checklist[punt];
        if (!item.operarioAsignado || !item.operacionRetrabajo) return;
        setField(punt, 'crearRetrabajo', true);
        setRechazoModal(null);
    };
    const setField = (punt, field, val) =>
        setChecklist(prev => ({ ...prev, [punt]: { ...prev[punt], [field]: val } }));

    const nonConforming = useMemo(() =>
        PUNTS.filter(p => checklist[p].result && checklist[p].result !== 'aprovat'),
        [checklist]
    );
    const answered = PUNTS.filter(p => checklist[p].result !== null).length;

    // Total rework time accumulated in the session
    const tiempoRetrabajoTotal = useMemo(() =>
        retrabajosEx.reduce((acc, r) => acc + (r.tiempo_retrabajo_seg || 0), 0),
        [retrabajosEx]
    );

    // ── SAVE: create NCs + retrabajos + controles_qualitat session ──
    const handleSave = async () => {
        if (!monoSel) return;
        setDesant(true);
        const tempsInspeccioSeg = getNetSegons();
        try {
            const existing = await pb.collection('no_conformitats').getFullList({
                requestKey: 'nc-count-cl', fields: 'codi',
            });
            let maxNum = existing.reduce((acc, nc) => {
                const m = (nc.codi || '').match(/INC-(\d+)/);
                return m ? Math.max(acc, parseInt(m[1], 10)) : acc;
            }, 0);

            let created = 0;
            let retrabajosCreated = 0;
            let primerRetrabajoId = null;
            const nonConformingPunts = PUNTS.filter(p => checklist[p].result && checklist[p].result !== 'aprovat');
            const hayRetrabajos = nonConformingPunts.some(p => checklist[p].result === 'rebutjat' && checklist[p].crearRetrabajo && checklist[p].operarioAsignado);

            for (const punt of nonConformingPunts) {
                const item = checklist[punt];
                maxNum++;
                const codi = `INC-${String(maxNum).padStart(3, '0')}`;
                const fd = new FormData();
                fd.append('codi', codi);
                fd.append('data_nc', new Date().toISOString());
                fd.append('client', exSel?.marca || '');
                if (exSel?.id) fd.append('exclusiva', exSel.id);
                fd.append('mono', monoSel.id);
                fd.append('area', item.area);
                fd.append('descripcio', item.descripcio || `No conformidad en ${punt}`);
                fd.append('proposta_millora', item.proposta || '');
                fd.append('prioritat', item.prioritat);
                fd.append('estat', 'oberta');
                fd.append('punt_checklist', punt);
                fd.append('resultat_checklist', item.result);
                fd.append('operari_que_detecto', user.id);
                for (const f of (item.fotos || [])) fd.append('fotos', f);
                const ncRec = await pb.collection('no_conformitats').create(fd, { requestKey: `nc-create-${punt}-${Date.now()}` });
                created++;

                // ── Create propuesta de mejora if proposta filled ──
                if (item.proposta && item.proposta.trim()) {
                    try {
                        await pb.collection('propuestas_mejora').create({
                            numero_exclusiva: exSel?.exclusiva || '',
                            referencia_articulo: exSel?.article || exSel?.referencia || '',
                            descripcion: item.proposta.trim(),
                            tipo: 'propuesta_mejora',
                            estado: 'pendiente_respuesta',
                            exclusiva_id: exSel?.id || undefined,
                            mono_id: monoSel.id,
                            punt_checklist: punt,
                            nc_id: ncRec.id,
                            usuario_reporto: user.id,
                            fecha_reporte: new Date().toISOString(),
                        }, { requestKey: `prop-${punt}-${Date.now()}` });
                    } catch (e) { console.error('Error creando propuesta', e); }
                }

                if (item.result === 'rebutjat' && item.crearRetrabajo && item.operarioAsignado) {
                    const prevIntentos = retrabajosEx.filter(r =>
                        (r.operacion_original || '') === (item.operacionRetrabajo || punt)
                    ).length;
                    const opDef = opsRuta.find(o => o.nom === item.operacionRetrabajo);
                    const tempsEstimat = Number(item.tiempoEstimadoRetrabajo) || opDef?.temps_std_min || 0;
                    try {
                        const retrFd = new FormData();
                        retrFd.append('exclusiva', exSel.id);
                        retrFd.append('mono', monoSel.id);
                        retrFd.append('operacion_original', item.operacionRetrabajo || punt);
                        retrFd.append('operacion_codi', opDef?.codi || '');
                        retrFd.append('fase', item.faseRetrabajo || opDef?.fase || '');
                        retrFd.append('punt_checklist', punt);
                        retrFd.append('motivo_rechazo', item.descripcio || `Rechazo en ${punt}`);
                        retrFd.append('operario_asignado', item.operarioAsignado);
                        retrFd.append('estado', 'pendiente');
                        retrFd.append('incidencia_calidad', ncRec.id);
                        retrFd.append('numero_intento', String(prevIntentos + 1));
                        retrFd.append('temps_estimat_min', String(tempsEstimat));
                        retrFd.append('notas', item.notasRetrabajo || '');
                        retrFd.append('creado_por', user.id);
                        for (const f of (item.fotos || [])) retrFd.append('fotos_antes', f);
                        const retrRec = await pb.collection('retrabajos').create(retrFd, { requestKey: `retr-create-${punt}-${Date.now()}` });
                        if (!primerRetrabajoId) primerRetrabajoId = retrRec.id;
                        retrabajosCreated++;

                        // ── Notify Producción / Admin / Super Admin ──
                        try {
                            const admins = await pb.collection('users').getFullList({
                                filter: "rol = 'admin' || rol = 'superadmin' || rol = 'produccio'",
                                requestKey: `retr-notify-${punt}`,
                            });
                            const titol = `Retrabajo en ${exSel?.exclusiva || 'exclusiva'}`;
                            const missatge = `${item.operacionRetrabajo || punt}${exSel?.article ? ' · ' + exSel.article : ''}${tempsEstimat ? ' · ~' + tempsEstimat + 'min' : ''}`;
                            await Promise.all(admins.map((a, i) => pb.collection('notifications').create({
                                destinatari: a.id, tipus: 'retrabajo_creado', titol, missatge,
                                link_id: exSel.id, llegida: false,
                            }, { requestKey: `retr-notif-${i}-${punt}` }).catch(() => {})));
                        } catch (e) { console.error('Error notificando retrabajo', e); }

                        // ── Register tiempo_exclusiva (retrabajo) ──
                        try {
                            await pb.collection('tiempos_exclusiva').create({
                                exclusiva_id: exSel.id,
                                tipo: 'retrabajo',
                                tiempo_minutos: tempsEstimat,
                                tiempo_segundos: tempsEstimat * 60,
                                descripcion: `Retrabajo: ${item.operacionRetrabajo || punt} (${punt})`,
                                usuario_id: user.id,
                                fecha: new Date().toISOString(),
                            }, { requestKey: `tiempo-retr-${punt}-${Date.now()}` });
                        } catch (e) { console.error('Error registrando tiempo retrabajo', e); }
                    } catch (e) { console.error('Error creando retrabajo', e); }
                }
            }

            const resultatGlobal = nonConformingPunts.length === 0
                ? 'aprovat'
                : nonConformingPunts.some(p => checklist[p].result === 'rebutjat' || checklist[p].result === 'bloquejat')
                    ? 'rebutjat'
                    : 'aprovat_obs';

            // Create / update the QC session record
            if (hayRetrabajos && primerRetrabajoId) {
                // PAUSE the QC timer — save partial time, state en_retrabajo
                const cqRec = await pb.collection('controles_qualitat').create({
                    mono: monoSel.id,
                    exclusiva: exSel?.id || undefined,
                    operari: user.id,
                    operacio: 'Checklist QC Final',
                    resultat: resultatGlobal,
                    notes: `${PUNTS.filter(p => checklist[p].result === 'aprovat').length} aprobados, ${nonConformingPunts.length} NC`,
                    temps_inspeccio_seg: tempsInspeccioSeg,
                    temps_std_seg: QC_TEMPS_STD_SEG,
                    tiempo_qc_inicial_seg: tempsInspeccioSeg,
                    tiempo_qc_adicional_seg: 0,
                    tiempo_qc_total_seg: 0,
                    tiempo_retrabajo_total_seg: 0,
                    estado_qc: 'en_retrabajo',
                    retrabajos_count: retrabajosCreated,
                    retrabajo_activo: primerRetrabajoId,
                }, { requestKey: `qc-session-${Date.now()}` });

                // Pause timer locally
                if (tempsInici.current) {
                    tempsNetRef.current += Math.floor((Date.now() - tempsInici.current) / 1000);
                    tempsInici.current = null;
                }
                pausatRef.current = true;
                setPausat(true);
                setTempsSegons(tempsNetRef.current);

                setQcSession(cqRec);
                setQcEstado('en_retrabajo');
                // Load the active retrabajo
                pb.collection('retrabajos').getOne(primerRetrabajoId, { expand: 'operario_asignado', requestKey: `qc-act-${primerRetrabajoId}` })
                    .then(setRetrabajoActivoSesion).catch(() => {});
            } else {
                // No rework — close the session as completado
                await pb.collection('controles_qualitat').create({
                    mono: monoSel.id,
                    exclusiva: exSel?.id || undefined,
                    operari: user.id,
                    operacio: 'Checklist QC Final',
                    resultat: resultatGlobal,
                    notes: `${PUNTS.filter(p => checklist[p].result === 'aprovat').length} aprobados, ${nonConformingPunts.length} NC`,
                    temps_inspeccio_seg: tempsInspeccioSeg,
                    temps_std_seg: QC_TEMPS_STD_SEG,
                    tiempo_qc_inicial_seg: tempsInspeccioSeg,
                    tiempo_qc_adicional_seg: 0,
                    tiempo_qc_total_seg: tempsInspeccioSeg,
                    tiempo_retrabajo_total_seg: 0,
                    estado_qc: 'completado',
                    retrabajos_count: 0,
                }, { requestKey: `qc-session-${Date.now()}` });
            }

            setSavedCount(created);
            setRetrabajosCreados(retrabajosCreated);
            if (!hayRetrabajos) {
                setChecklist(initChecklist());
                setMonoSel(null);
            } else {
                // Keep session open — don't reset, show "En retrabajo"
                setChecklist(initChecklist());
            }
            carregaRetrabajos();
            setTimeout(() => { setSavedCount(null); setRetrabajosCreados(0); }, 10000);
        } finally {
            setDesant(false);
        }
    };

    // ── Continuar control de calidad (retrabajo completed by operario) ──
    const handleContinuarQC = async () => {
        if (!qcSession) return;
        try {
            // Resume timer (additional time accumulates from current partial)
            pausatRef.current = false;
            tempsInici.current = Date.now();
            setPausat(false);
            await pb.collection('controles_qualitat').update(qcSession.id, {
                estado_qc: 'en_proceso',
            }, { requestKey: `qc-resume-${qcSession.id}` });
            setQcEstado('en_proceso');
            setQcSession({ ...qcSession, estado_qc: 'en_proceso' });
        } catch (e) { console.error(e); }
    };

    // ── Verificar retrabajo: aceptar ──
    const handleVerificarAceptar = async () => {
        if (!qcSession) return;
        setVerificando(true);
        try {
            const totalSeg = getNetSegons();
            const adicional = Math.max(0, totalSeg - (qcSession.tiempo_qc_inicial_seg || 0));
            const retrTotal = retrabajosEx.reduce((acc, r) => acc + (r.tiempo_retrabajo_seg || 0), 0);
            // Mark retrabajo verificado
            if (retrabajoActivoSesion) {
                await pb.collection('retrabajos').update(retrabajoActivoSesion.id, { estado: 'verificado' }, { requestKey: `qc-ver-${retrabajoActivoSesion.id}` });
                if (retrabajoActivoSesion.incidencia_calidad) {
                    await pb.collection('no_conformitats').update(retrabajoActivoSesion.incidencia_calidad, { estat: 'tancada' }).catch(() => {});
                }
            }
            await pb.collection('controles_qualitat').update(qcSession.id, {
                estado_qc: 'completado',
                tiempo_qc_adicional_seg: adicional,
                tiempo_qc_total_seg: totalSeg,
                tiempo_retrabajo_total_seg: retrTotal,
                resultat: 'aprovat',
                temps_inspeccio_seg: totalSeg,
                retrabajo_activo: null,
            }, { requestKey: `qc-done-${qcSession.id}` });
            setQcEstado('completado');
            setQcSession({ ...qcSession, estado_qc: 'completado', tiempo_qc_total_seg: totalSeg, tiempo_retrabajo_total_seg: retrTotal });
        } finally { setVerificando(false); }
    };

    // ── Verificar retrabajo: rechazar (create new rework) ──
    const handleVerificarRechazar = async () => {
        if (!qcSession || !rechazoSesion || !rechazoSesion.operario) return;
        setVerificando(true);
        try {
            const r = retrabajoActivoSesion;
            // Pause timer again
            if (tempsInici.current) {
                tempsNetRef.current += Math.floor((Date.now() - tempsInici.current) / 1000);
                tempsInici.current = null;
            }
            pausatRef.current = true;
            setPausat(true);
            setTempsSegons(tempsNetRef.current);

            // Mark current retrabajo rechazado
            await pb.collection('retrabajos').update(r.id, { estado: 'rechazado' }, { requestKey: `qc-rej-${r.id}` });
            // Create new retrabajo
            const nuevo = await pb.collection('retrabajos').create({
                exclusiva: r.exclusiva,
                mono: r.mono || undefined,
                operacion_original: r.operacion_original,
                operacion_codi: r.operacion_codi || '',
                fase: r.fase || '',
                punt_checklist: r.punt_checklist || '',
                motivo_rechazo: rechazoSesion.notas || r.motivo_rechazo,
                operario_asignado: rechazoSesion.operario,
                estado: 'pendiente',
                incidencia_calidad: r.incidencia_calidad || undefined,
                numero_intento: (r.numero_intento || 1) + 1,
                temps_estimat_min: r.temps_estimat_min || 0,
                notas: rechazoSesion.notas || '',
                creado_por: user.id,
            }, { requestKey: `qc-retr-again-${Date.now()}` });
            await pb.collection('controles_qualitat').update(qcSession.id, {
                estado_qc: 'en_retrabajo',
                retrabajo_activo: nuevo.id,
                retrabajos_count: (qcSession.retrabajos_count || 0) + 1,
            }, { requestKey: `qc-retrpause-${qcSession.id}` });
            setQcEstado('en_retrabajo');
            setQcSession({ ...qcSession, estado_qc: 'en_retrabajo', retrabajo_activo: nuevo.id, retrabajos_count: (qcSession.retrabajos_count || 0) + 1 });
            setRetrabajoActivoSesion(nuevo);
            setRechazoSesion(null);
            carregaRetrabajos();
        } finally { setVerificando(false); }
    };

    // ── Dar salida: release the exclusiva ──
    const handleDarSalida = async () => {
        if (!exSel) return;
        setDandoSalida(true);
        try {
            const exMonos = monos.filter(m => m.exclusiva === exSel.id);
            await Promise.all(exMonos.map((m, i) =>
                pb.collection('monos').update(m.id, { estat: 'finalitzat' }, { requestKey: `mono-salida-${i}` })
            ));
            await pb.collection('exclusives').update(exSel.id, { estat: 'lista_recollida' });
            setExTerminada(true);
            setTimeout(() => {
                setExTerminada(false);
                setExSel(null);
                setMonoSel(null);
                setQcSession(null); setQcEstado(null); setRetrabajoActivoSesion(null);
            }, 4000);
        } finally { setDandoSalida(false); }
    };

    const handleMarcarTerminada = async () => {
        if (!exSel) return;
        setMarcantTerminada(true);
        try {
            const exMonos = monos.filter(m => m.exclusiva === exSel.id);
            await Promise.all(exMonos.map((m, i) =>
                pb.collection('monos').update(m.id, { estat: 'finalitzat' }, { requestKey: `mono-fin-${i}` })
            ));
            await pb.collection('exclusives').update(exSel.id, { estat: 'lista_recollida' });
            setExTerminada(true);
            setTimeout(() => {
                setExTerminada(false);
                setExSel(null);
                setMonoSel(null);
                setQcSession(null); setQcEstado(null); setRetrabajoActivoSesion(null);
            }, 4000);
        } finally {
            setMarcantTerminada(false);
        }
    };

    // Is the active retrabajo completed (ready for QC to resume)?
    const retrabajoCompletado = retrabajoActivoSesion?.estado === 'completado';

    /* ── SCREEN: exclusiva search ── */
    if (!exSel) {
        const retrasadesCount = exFiltered.filter(e => e._retrasat).length;
        const estCls = (est) => ({
            recibida: 'bg-secondary text-secondary-foreground',
            pendent: 'bg-secondary text-secondary-foreground',
            en_curs: 'bg-blue-100 text-blue-700',
            finalitzada: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]',
            bloquejada: 'bg-destructive/15 text-destructive',
            lista_recollida: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]',
            entregada: 'bg-[hsl(var(--ok))]/20 text-[hsl(var(--ok))]',
            retrasada: 'bg-destructive/15 text-destructive',
            desapareguda: 'bg-destructive/10 text-destructive',
        }[est] || 'bg-secondary text-secondary-foreground');
        const prioCls = (p) => ({
            alta: 'bg-destructive/15 text-destructive',
            urgente: 'bg-destructive/20 text-destructive',
            express: 'bg-[hsl(var(--accent))]/15 text-[hsl(var(--accent))]',
            media: 'bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))]',
            normal: 'bg-secondary text-secondary-foreground',
            baja: 'bg-secondary text-muted-foreground',
        }[p] || 'bg-secondary text-muted-foreground');

        const limpiarBusqueda = () => { setQ(''); setQDebounced(''); setMode('2dias'); setFiltreRetras('tots'); };

        return (
            <div>
                <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Buscar exclusiva para inspeccionar — ordenadas por fecha de entrega (retrasadas primero)</p>

                {/* Mode selector */}
                <div className="mb-3 flex flex-wrap gap-2">
                    {[
                        { id: '2dias', label: 'Próximos 2 días' },
                        { id: 'todas', label: 'Mostrar todas las exclusivas' },
                        { id: 'buscar', label: 'Buscar exclusiva concreta' },
                    ].map(m => (
                        <button key={m.id} onClick={() => setMode(m.id)}
                            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition active:scale-95 ${mode === m.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/70'}`}>
                            <Filter className="h-3.5 w-3.5" /> {m.label}
                        </button>
                    ))}
                </div>

                {/* Search bar */}
                <div className="mb-4 flex flex-wrap gap-3 items-center">
                    <div className="relative flex-1 min-w-[220px] max-w-xl">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar exclusiva (número, referencia, mono)"
                            className="h-11 w-full rounded-xl border border-input bg-background pl-10 pr-9 text-sm" autoFocus={mode === 'buscar'} />
                        {q && (
                            <button onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-secondary" aria-label="Limpiar texto">
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                    {mode !== 'buscar' && (
                        <select value={filtreRetras} onChange={e => setFiltreRetras(e.target.value)}
                            className="h-11 rounded-xl border border-input bg-background px-3 text-sm">
                            <option value="tots">Todas (retrasadas primero)</option>
                            <option value="retrasats">Solo retrasadas</option>
                            <option value="a_temps">A tiempo</option>
                        </select>
                    )}
                    {(q || mode !== '2dias' || filtreRetras !== 'tots') && (
                        <button onClick={limpiarBusqueda}
                            className="flex h-11 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-sm font-semibold hover:bg-secondary active:scale-95">
                            <X className="h-4 w-4" /> Limpiar búsqueda
                        </button>
                    )}
                </div>

                {mode === 'buscar' && !qDebounced && (
                    <p className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
                        Escribe un número de exclusiva, referencia de artículo o número de mono para buscar.
                    </p>
                )}

                {retrasadesCount > 0 && mode !== 'buscar' && (
                    <div className="mb-4 flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/30 px-4 py-3 text-destructive text-sm font-semibold">
                        <AlertTriangle className="h-5 w-5" /> {retrasadesCount} exclusiva{retrasadesCount !== 1 ? 's' : ''} con retraso — priorizar inspección
                    </div>
                )}

                {((mode !== 'buscar') || qDebounced) && exFiltered.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
                        {mode === 'buscar' && qDebounced ? `No encontrada — sin resultados para "${qDebounced}".` : 'Sin exclusivas encontradas.'}
                    </p>
                ) : exFiltered.length > 0 ? (
                    <div className="space-y-6">
                        {exGroups.map(g => {
                            const retrasat = g.items[0]?._retrasat;
                            const expressCount = g.items.filter(isExpress).length;
                            return (
                                <section key={g.key}>
                                    <div className={`mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-2.5 ${retrasat ? 'bg-destructive/10 border border-destructive/30' : 'bg-secondary/70 border border-border'}`}>
                                        <p className={`font-display text-xl uppercase tracking-wide flex items-center gap-2 ${retrasat ? 'text-destructive' : 'text-foreground'}`}>
                                            <Calendar className="h-5 w-5" />
                                            {groupLabel(g)}
                                        </p>
                                        <div className="flex items-center gap-2 text-xs font-semibold">
                                            <span className="rounded-md bg-background/80 px-2 py-1 text-muted-foreground">{g.items.length} exclusiva{g.items.length !== 1 ? 's' : ''}</span>
                                            {expressCount > 0 && (
                                                <span className="flex items-center gap-1 rounded-md bg-[hsl(var(--accent))]/15 px-2 py-1 text-[hsl(var(--accent))]">
                                                    <Zap className="h-3.5 w-3.5" /> {expressCount} Express
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        {g.items.map(ex => {
                                            const exMonos = ex._monos;
                                            const retrasatEx = ex._retrasat;
                                            const dies = ex._diesEntrega;
                                            const express = isExpress(ex);
                                            return (
                                                <div key={ex.id}
                                                    className={`relative overflow-hidden rounded-xl border-2 bg-card p-4 text-left transition ${retrasatEx ? 'border-destructive/60 bg-destructive/5' : express ? 'border-[hsl(var(--accent))]/60' : 'border-border hover:border-primary/50'}`}>
                                                    {express && <div className="stripe-top absolute inset-x-0 top-0 h-1.5" />}
                                                    <div className="flex items-start justify-between gap-2">
                                                        <button onClick={() => { setExSel(ex); setMonoSel(null); setChecklist(initChecklist()); setQcSession(null); setQcEstado(null); }}
                                                            className="flex-1 text-left active:scale-[0.98]">
                                                            <p className="font-display text-3xl uppercase leading-none">{ex.exclusiva}</p>
                                                            {ex.article && <p className="mt-1 text-sm font-semibold">{ex.article}</p>}
                                                            {ex.referencia && ex.referencia !== ex.article && <p className="text-xs text-muted-foreground">Ref: {ex.referencia}</p>}
                                                            {ex.marca && <p className="text-xs text-muted-foreground">{ex.marca}</p>}
                                                        </button>
                                                        <div className="flex flex-col items-end gap-1">
                                                            {express && (
                                                                <span className="flex items-center gap-1 rounded-md bg-[hsl(var(--accent))] px-2 py-1 text-xs font-bold text-white">
                                                                    <Zap className="h-3 w-3" /> EXPRESS
                                                                </span>
                                                            )}
                                                            {retrasatEx && <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />}
                                                            <a href={`/exclusiva/${ex.id}`} target="_blank" rel="noopener noreferrer" title="Abrir en nueva pestaña"
                                                                className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Abrir detalle en nueva pestaña">
                                                                <ExternalLink className="h-4 w-4" />
                                                            </a>
                                                        </div>
                                                    </div>
                                                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                                        {ex.estat && <span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${estCls(ex.estat)}`}>{ex.estat}</span>}
                                                        {ex.prioritat && ex.prioritat !== 'express' && <span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${prioCls(ex.prioritat)}`}>{ex.prioritat}</span>}
                                                    </div>
                                                    {ex.data_entrega && (
                                                        <div className={`mt-2 flex items-center gap-1.5 text-xs font-semibold ${retrasatEx ? 'text-destructive' : dies <= 2 ? 'text-[hsl(var(--warn))]' : 'text-muted-foreground'}`}>
                                                            <Calendar className="h-3.5 w-3.5" />
                                                            Entrega: {ex.data_entrega}
                                                            {retrasatEx ? ` · ${Math.abs(dies)}d retraso` : dies === 0 ? ' · hoy' : ` · ${dies}d`}
                                                        </div>
                                                    )}
                                                    <div className="mt-2 flex items-center justify-between gap-2">
                                                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                                                            {exMonos.length} monos <ChevronRight className="h-3 w-3" />
                                                        </p>
                                                        <button onClick={() => { setExSel(ex); setMonoSel(null); setChecklist(initChecklist()); setQcSession(null); setQcEstado(null); }}
                                                            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground active:scale-95">
                                                            Inspeccionar
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </section>
                            );
                        })}
                    </div>
                ) : null}
            </div>
        );
    }

    /* ── SCREEN: mono selection ── */
    if (!monoSel) {
        return (
            <div>
                {exTerminada && (
                    <div className="mb-4 flex items-center gap-3 rounded-xl bg-[hsl(var(--ok))]/20 border border-[hsl(var(--ok))]/40 px-5 py-4 text-[hsl(var(--ok))] font-semibold text-lg">
                        <PackageCheck className="h-7 w-7" />
                        ¡Exclusiva <strong>{exSel?.exclusiva}</strong> marcada como lista para recoger!
                    </div>
                )}
                {savedCount !== null && !exTerminada && (
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[hsl(var(--ok))]/15 border border-[hsl(var(--ok))]/30 px-5 py-4">
                        <div className="flex items-center gap-2 text-[hsl(var(--ok))] font-semibold">
                            <CheckCircle2 className="h-5 w-5" />
                            Checklist guardado — {savedCount} no conformidades creadas{retrabajosCreados > 0 ? `, ${retrabajosCreados} retrabajo${retrabajosCreados !== 1 ? 's' : ''} asignado${retrabajosCreados !== 1 ? 's' : ''}` : ''}.
                        </div>
                        <button onClick={handleMarcarTerminada} disabled={marcantTerminada}
                            className="flex items-center gap-2 rounded-xl bg-[hsl(var(--ok))] px-5 py-2.5 font-bold text-white text-sm shadow hover:opacity-90 active:scale-95 disabled:opacity-60">
                            <PackageCheck className="h-5 w-5" />
                            {marcantTerminada ? 'Guardando...' : 'Marcar como terminada y lista para recoger'}
                        </button>
                    </div>
                )}
                <div className="mb-5 flex items-center gap-3">
                    <button onClick={() => setExSel(null)} className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-secondary active:scale-95">
                        <ArrowLeft className="h-4 w-4" /> Cambiar exclusiva
                    </button>
                    <div>
                        <p className="font-display text-2xl uppercase leading-none">{exSel.exclusiva}</p>
                        {exSel.article && <p className="text-xs text-muted-foreground">{exSel.article}</p>}
                    </div>
                </div>
                <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Seleccionar mono a inspeccionar</p>

                {/* Retrabajo history for this exclusiva */}
                {retrabajosEx.length > 0 && (
                    <div className="mb-5 rounded-xl border-2 border-destructive/30 bg-destructive/5 p-4">
                        <div className="mb-3 flex items-center justify-between gap-2">
                            <p className="flex items-center gap-2 font-semibold text-sm text-destructive">
                                <RefreshCcw className="h-4 w-4" /> Historial de retrabajos ({retrabajosEx.length})
                            </p>
                            <button onClick={carregaRetrabajos} className="text-xs text-muted-foreground hover:text-foreground">Actualizar</button>
                        </div>
                        <div className="overflow-auto">
                            <table className="w-full min-w-[760px] text-sm">
                                <thead className="text-left text-xs uppercase text-muted-foreground">
                                    <tr>
                                        {['Intent', 'Operación', 'Fase', 'Punto', 'Operario', 'Estado', 'T. retrabajo', 'Motivo'].map(h => (
                                            <th key={h} className="px-2 py-1 font-semibold">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {retrabajosEx.map(r => {
                                        const estCls = {
                                            pendiente: 'bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))]',
                                            en_proceso: 'bg-blue-100 text-blue-700',
                                            completado: 'bg-purple-100 text-purple-700',
                                            verificado: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]',
                                            rechazado: 'bg-destructive/15 text-destructive',
                                        }[r.estado] || 'bg-secondary';
                                        return (
                                            <tr key={r.id}>
                                                <td className="px-2 py-1.5 font-bold tabular-nums">#{r.numero_intento || 1}</td>
                                                <td className="px-2 py-1.5">{r.operacion_original || '—'}</td>
                                                <td className="px-2 py-1.5 text-xs">{r.fase || '—'}</td>
                                                <td className="px-2 py-1.5 text-xs">{r.punt_checklist || '—'}</td>
                                                <td className="px-2 py-1.5">{r.expand?.operario_asignado?.name || r.expand?.operario_asignado?.codi || '—'}</td>
                                                <td className="px-2 py-1.5"><span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${estCls}`}>{r.estado}</span></td>
                                                <td className="px-2 py-1.5 tabular-nums text-xs">{r.tiempo_retrabajo_seg ? fmtSegons(r.tiempo_retrabajo_seg) : '—'}</td>
                                                <td className="px-2 py-1.5 max-w-xs truncate text-muted-foreground">{r.motivo_rechazo || '—'}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {monosEx.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">No hay monos para esta exclusiva.</p>
                ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {monosEx.map(m => (
                            <button key={m.id} onClick={() => { setMonoSel(m); setChecklist(initChecklist()); }}
                                className="rounded-xl border-2 border-border bg-card p-4 text-left hover:border-primary/50 active:scale-[0.98] transition">
                                <p className="font-display text-2xl uppercase leading-none">{m.codi}</p>
                                <div className="mt-2 flex items-center gap-2 flex-wrap">
                                    {m.talla && <span className="rounded border border-primary/50 px-2 py-0.5 text-xs font-bold text-primary">T {m.talla}</span>}
                                    <span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${m.estat === 'finalitzat' ? 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]' : m.estat === 'retreball' ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-secondary-foreground'}`}>
                                        {m.estat}
                                    </span>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    /* ── SCREEN: checklist (with rework session overlay) ── */
    const aprobats = PUNTS.filter(p => checklist[p].result === 'aprovat').length;
    const enRetrabajo = qcEstado === 'en_retrabajo';
    const completado = qcEstado === 'completado';

    return (
        <div>
            {/* Header */}
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <button onClick={() => { setMonoSel(null); setQcSession(null); setQcEstado(null); }} className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-secondary active:scale-95">
                        <ArrowLeft className="h-4 w-4" /> Cambiar mono
                    </button>
                    <div>
                        <p className="font-display text-2xl uppercase leading-none">{monoSel.codi} — {exSel.exclusiva}</p>
                        {monoSel.talla && <p className="text-xs text-muted-foreground">Talla {monoSel.talla}</p>}
                    </div>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-mono tabular-nums ${enRetrabajo ? 'bg-destructive/15 text-destructive' : pausat ? 'bg-[hsl(var(--warn))]/15' : 'bg-secondary'}`}>
                        <Clock className={`h-4 w-4 ${enRetrabajo ? 'text-destructive' : pausat ? 'text-[hsl(var(--warn))]' : 'text-muted-foreground'}`} />
                        {fmtSegons(tempsSegons)}
                        {enRetrabajo && <span className="text-destructive text-xs font-semibold">EN RETRABAJO</span>}
                        {!enRetrabajo && pausat && <span className="text-[hsl(var(--warn))] text-xs font-semibold">PAUSADO</span>}
                        {!enRetrabajo && !pausat && tempsSegons > QC_TEMPS_STD_SEG && (
                            <span className="text-destructive text-xs font-semibold ml-1">+{Math.round((tempsSegons - QC_TEMPS_STD_SEG)/60)}m</span>
                        )}
                    </div>
                    {!enRetrabajo && !completado && (
                        <button onClick={handlePausaReprendre}
                            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition active:scale-95 ${pausat ? 'border-[hsl(var(--ok))]/50 bg-[hsl(var(--ok))]/10 text-[hsl(var(--ok))]' : 'border-[hsl(var(--warn))]/50 bg-[hsl(var(--warn))]/10 text-[hsl(var(--warn))]'}`}>
                            {pausat ? <><Play className="h-4 w-4"/> Reanudar</> : <><Pause className="h-4 w-4"/> Pausar</>}
                        </button>
                    )}
                    <div className="text-sm text-muted-foreground">
                        <span className="font-semibold text-foreground">{answered}</span>/{PUNTS.length} revisados
                        {nonConforming.length > 0 && (
                            <span className="ml-2 rounded-lg bg-destructive/10 text-destructive px-2 py-0.5 text-xs font-semibold">
                                {nonConforming.length} NC
                            </span>
                        )}
                    </div>
                    {!enRetrabajo && !completado && (
                        <button onClick={handleSave} disabled={desant || answered === 0}
                            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-semibold text-primary-foreground disabled:opacity-50 active:scale-[0.98] transition">
                            <Save className="h-4 w-4" />
                            {desant ? 'Guardando...' : 'Guardar no conformidades'}
                        </button>
                    )}
                </div>
            </div>

            {/* ── RETRABAJO SESSION BANNER ── */}
            {enRetrabajo && (
                <div className="mb-5 rounded-2xl border-2 border-destructive/50 bg-destructive/5 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="h-7 w-7 text-destructive shrink-0 mt-0.5" />
                            <div>
                                <p className="font-display text-2xl uppercase text-destructive">Control de calidad pausado — En retrabajo</p>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Tiempo parcial de QC: <strong className="text-foreground">{fmtSegons(qcSession?.tiempo_qc_inicial_seg || 0)}</strong>
                                    {tiempoRetrabajoTotal > 0 && <> · Tiempo de retrabajo acumulado: <strong className="text-foreground">{fmtSegons(tiempoRetrabajoTotal)}</strong></>}
                                </p>
                                {retrabajoActivoSesion && (
                                    <div className="mt-3 rounded-xl bg-background/80 p-3">
                                        <p className="text-xs font-semibold uppercase text-muted-foreground">Retrabajo activo (intento #{retrabajoActivoSesion.numero_intento || 1})</p>
                                        <p className="text-base font-bold">{retrabajoActivoSesion.operacion_original || '—'}</p>
                                        <p className="text-xs text-muted-foreground">Operario: {retrabajoActivoSesion.expand?.operario_asignado?.name || retrabajoActivoSesion.expand?.operario_asignado?.codi || '—'}</p>
                                        <p className="text-xs text-muted-foreground">Estado: <span className="font-semibold uppercase">{retrabajoActivoSesion.estado}</span></p>
                                        {retrabajoActivoSesion.motivo_rechazo && <p className="mt-1 text-xs text-destructive">Motivo: {retrabajoActivoSesion.motivo_rechazo}</p>}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex flex-col gap-2">
                            {retrabajoCompletado ? (
                                <button onClick={handleContinuarQC}
                                    className="flex items-center gap-2 rounded-xl bg-[hsl(var(--ok))] px-5 py-3 font-bold text-white text-sm shadow active:scale-95">
                                    <Play className="h-5 w-5" /> Continuar control de calidad
                                </button>
                            ) : (
                                <span className="rounded-xl bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))] px-4 py-3 text-sm font-semibold text-center">
                                    Esperando a que el operario complete el retrabajo...
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── VERIFY / DAR SALIDA (after resume) ── */}
            {qcEstado === 'en_proceso' && retrabajoActivoSesion && (
                <div className="mb-5 rounded-2xl border-2 border-[hsl(var(--accent))]/50 bg-[hsl(var(--accent))]/5 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                            <CheckCircle2 className="h-7 w-7 text-[hsl(var(--accent))] shrink-0 mt-0.5" />
                            <div>
                                <p className="font-display text-2xl uppercase">Verificar retrabajo</p>
                                <p className="text-sm text-muted-foreground mt-1">
                                    QC adicional: <strong className="text-foreground">{fmtSegons(Math.max(0, tempsSegons - (qcSession?.tiempo_qc_inicial_seg || 0)))}</strong>
                                    · Retrabajo: <strong className="text-foreground">{fmtSegons(retrabajoActivoSesion.tiempo_retrabajo_seg || 0)}</strong>
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">Revisa el retrabajo completado y decide.</p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={handleVerificarAceptar} disabled={verificando}
                                className="flex items-center gap-2 rounded-xl bg-[hsl(var(--ok))] px-5 py-3 font-bold text-white text-sm active:scale-95 disabled:opacity-60">
                                <CheckCircle2 className="h-5 w-5" /> Aprobar retrabajo
                            </button>
                            <button onClick={() => setRechazoSesion({ operario: retrabajoActivoSesion.operario_asignado, notas: '' })}
                                className="flex items-center gap-2 rounded-xl bg-destructive px-5 py-3 font-bold text-white text-sm active:scale-95">
                                <AlertTriangle className="h-5 w-5" /> Rechazar de nuevo
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {completado && (
                <div className="mb-5 rounded-2xl border-2 border-[hsl(var(--ok))]/50 bg-[hsl(var(--ok))]/5 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                            <PackageCheck className="h-7 w-7 text-[hsl(var(--ok))] shrink-0 mt-0.5" />
                            <div>
                                <p className="font-display text-2xl uppercase text-[hsl(var(--ok))]">Control de calidad completado</p>
                                <p className="text-sm text-muted-foreground mt-1">
                                    QC inicial: <strong className="text-foreground">{fmtSegons(qcSession?.tiempo_qc_inicial_seg || 0)}</strong>
                                    {' · '}QC adicional: <strong className="text-foreground">{fmtSegons(qcSession?.tiempo_qc_adicional_seg || 0)}</strong>
                                    {' · '}QC total: <strong className="text-foreground">{fmtSegons(qcSession?.tiempo_qc_total_seg || 0)}</strong>
                                    {' · '}Retrabajo: <strong className="text-foreground">{fmtSegons(qcSession?.tiempo_retrabajo_total_seg || 0)}</strong>
                                    {' · '}Retrabajos: <strong className="text-foreground">{qcSession?.retrabajos_count || 0}</strong>
                                </p>
                            </div>
                        </div>
                        <button onClick={handleDarSalida} disabled={dandoSalida}
                            className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground text-sm active:scale-95 disabled:opacity-60">
                            <LogOut className="h-5 w-5" /> {dandoSalida ? 'Dando salida...' : 'Dar salida'}
                        </button>
                    </div>
                </div>
            )}

            {/* Progress bar */}
            <div className="mb-5 rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between text-sm mb-2">
                    <span className="font-semibold">Progreso del checklist</span>
                    <span className="text-[hsl(var(--ok))] font-semibold">{aprobats} aprobados</span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-secondary overflow-hidden">
                    <div className="h-full bg-[hsl(var(--ok))] rounded-full transition-all" style={{ width: `${(answered / PUNTS.length) * 100}%` }} />
                </div>
            </div>

            {/* Checklist items — disabled while in rework/completed */}
            <div className={`grid gap-3 ${enRetrabajo || completado ? 'pointer-events-none opacity-60' : ''}`}>
                {PUNTS.map(punt => {
                    const item = checklist[punt];
                    const isNC = item.result && item.result !== 'aprovat';
                    return (
                        <div key={punt} className={`rounded-xl border-2 bg-card transition ${isNC ? 'border-destructive/40' : item.result === 'aprovat' ? 'border-[hsl(var(--ok))]/40 bg-[hsl(var(--ok))]/2' : 'border-border'}`}>
                            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                                <div className="flex items-center gap-3 min-w-0">
                                    {item.result === 'aprovat' ? (
                                        <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-[hsl(var(--ok))]" />
                                    ) : isNC ? (
                                        <AlertTriangle className="h-5 w-5 flex-shrink-0 text-destructive" />
                                    ) : (
                                        <div className="h-5 w-5 flex-shrink-0 rounded-full border-2 border-border" />
                                    )}
                                    <p className="font-semibold text-base">{punt}</p>
                                </div>
                                <div className="flex gap-2 flex-wrap">
                                    {RESULTATS.map(r => (
                                        <button key={r.val} onClick={() => setResult(punt, r.val)}
                                            className={`rounded-lg border-2 px-3 py-1.5 text-sm font-semibold transition active:scale-95 ${item.result === r.val ? r.cls : 'border-border text-muted-foreground hover:border-primary/30'}`}>
                                            {r.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {isNC && (
                                <div className="border-t border-border px-4 pb-4 pt-3">
                                    {item.loadingSimilar && (
                                        <div className="mb-3 rounded-lg bg-primary/5 px-4 py-2 text-sm text-muted-foreground">Buscando incidencias similares...</div>
                                    )}
                                    {!item.loadingSimilar && item.similarNCs && item.similarNCs.length > 0 && (
                                        <div className="mb-4 rounded-xl border-2 border-[hsl(var(--warn))]/40 bg-[hsl(var(--warn))]/5 p-3">
                                            <div className="flex items-center gap-2 mb-2 text-[hsl(var(--warn))] font-semibold text-sm">
                                                <History className="h-4 w-4" />
                                                Incidencia repetitiva: {item.similarNCs.length} vez{item.similarNCs.length !== 1 ? 'ces' : ''} en el historial
                                            </div>
                                            <div className="grid gap-2">
                                                {item.similarNCs.map(nc => (
                                                    <div key={nc.id} className="rounded-lg bg-background/80 px-3 py-2 text-xs">
                                                        <div className="flex items-center justify-between gap-2 mb-1">
                                                            <span className="font-mono font-bold">{nc.codi}</span>
                                                            <span className={`rounded px-1.5 py-0.5 font-semibold uppercase ${nc.prioritat === 'alta' ? 'bg-destructive/10 text-destructive' : nc.prioritat === 'media' ? 'bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))]' : 'bg-secondary text-muted-foreground'}`}>{nc.prioritat}</span>
                                                            {nc.expand?.categoria && <span className="rounded bg-secondary px-1.5 py-0.5">{nc.expand.categoria.nom}</span>}
                                                        </div>
                                                        <p className="text-muted-foreground">{nc.descripcio || '—'}</p>
                                                        {nc.solucio_implantada && <p className="mt-1 text-[hsl(var(--ok))] font-semibold">Solución aplicada: {nc.solucio_implantada}</p>}
                                                        {puedeVerPropuestas && nc.accio_preventiva && <p className="mt-0.5 text-primary">Acción preventiva: {nc.accio_preventiva}</p>}
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                                <Lightbulb className="h-4 w-4 text-[hsl(var(--warn))]" />
                                                <span className="text-xs text-muted-foreground">Sugerencias basadas en historial:</span>
                                                <button onClick={() => setField(punt, 'prioritat', item.similarNCs[0].prioritat)}
                                                    className="rounded bg-[hsl(var(--warn))]/20 text-[hsl(var(--warn))] px-2 py-0.5 text-xs font-semibold hover:bg-[hsl(var(--warn))]/30 active:scale-95">
                                                    Aplicar prioridad: {item.similarNCs[0].prioritat}
                                                </button>
                                                {puedeVerPropuestas && item.similarNCs[0]?.proposta_millora && (
                                                    <button onClick={() => setField(punt, 'proposta', item.similarNCs[0].proposta_millora)}
                                                        className="rounded bg-primary/10 text-primary px-2 py-0.5 text-xs font-semibold hover:bg-primary/20 active:scale-95">
                                                        Usar propuesta anterior
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    <div className="grid sm:grid-cols-2 gap-3 mb-3">
                                        <div>
                                            <label className="text-xs font-semibold uppercase text-muted-foreground">Área responsable</label>
                                            <select value={item.area} onChange={e => setField(punt, 'area', e.target.value)}
                                                className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
                                                {AREAS.map(a => <option key={a.val} value={a.val}>{a.label}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs font-semibold uppercase text-muted-foreground">Prioridad</label>
                                            <select value={item.prioritat} onChange={e => setField(punt, 'prioritat', e.target.value)}
                                                className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
                                                <option value="alta">Alta</option>
                                                <option value="media">Media</option>
                                                <option value="baixa">Baja</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="mb-3">
                                        <label className="text-xs font-semibold uppercase text-muted-foreground">Descripción del defecto *</label>
                                        <textarea value={item.descripcio} onChange={e => setField(punt, 'descripcio', e.target.value)}
                                            rows={2} placeholder={`Describir el defecto encontrado en ${punt}...`}
                                            className="mt-1 w-full rounded-lg border border-input bg-background p-3 text-sm resize-none" />
                                    </div>
                                    <div className="mb-3">
                                        <label className="text-xs font-semibold uppercase text-muted-foreground">Propuesta de mejora</label>
                                        <textarea value={item.proposta} onChange={e => setField(punt, 'proposta', e.target.value)}
                                            rows={2} placeholder="¿Cómo evitar este defecto en el futuro?"
                                            className="mt-1 w-full rounded-lg border border-input bg-background p-3 text-sm resize-none" />
                                    </div>
                                    <div className="mb-3">
                                        <PhotoPicker
                                            files={item.fotos || []}
                                            onAdd={(files) => setField(punt, 'fotos', [...(item.fotos || []), ...files].slice(0, 8))}
                                            onRemove={(i) => setField(punt, 'fotos', (item.fotos || []).filter((_, j) => j !== i))}
                                            exclusivaId={exSel?.id}
                                            maxFiles={8}
                                            maxSizeMB={10}
                                            label="Fotos del defecto"
                                            hint="Arrastra fotos del defecto"
                                            className="mt-1"
                                        />
                                    </div>

                                    {/* Resumen de retrabajo asignado (el formulario vive en el modal de rechazo) */}
                                    {item.result === 'rebutjat' && item.crearRetrabajo && item.operarioAsignado && (
                                        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-destructive/40 bg-destructive/5 p-3">
                                            <div className="flex items-center gap-2 text-sm text-destructive">
                                                <RefreshCcw className="h-4 w-4" />
                                                <span className="font-semibold">Retrabajo asignado</span>
                                                <span className="text-muted-foreground">— {operaris.find(op => op.id === item.operarioAsignado)?.name || operaris.find(op => op.id === item.operarioAsignado)?.codi || 'Operario'} · {item.operacionRetrabajo}{item.faseRetrabajo ? ` (${item.faseRetrabajo})` : ''}</span>
                                            </div>
                                            <button onClick={() => setRechazoModal({ punt, mode: 'retrabajo' })}
                                                className="rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10 active:scale-95">
                                                Editar retrabajo
                                            </button>
                                        </div>
                                    )}
                                    {item.result === 'rebutjat' && !item.crearRetrabajo && (
                                        <div className="mt-4 flex items-center gap-2 rounded-xl border-2 border-[hsl(var(--warn))]/40 bg-[hsl(var(--warn))]/5 p-3 text-sm text-[hsl(var(--warn))]">
                                            <AlertTriangle className="h-4 w-4" />
                                            <span className="font-semibold">Registrado como incidencia</span>
                                            <span className="text-muted-foreground">— sin retrabajo</span>
                                            <button onClick={() => setRechazoModal({ punt, mode: 'pregunta' })}
                                                className="ml-auto rounded-lg border border-[hsl(var(--warn))]/40 px-3 py-1.5 text-xs font-semibold hover:bg-[hsl(var(--warn))]/10 active:scale-95">
                                                Cambiar
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Bottom save button */}
            {!enRetrabajo && !completado && (
                <div className="mt-5 flex justify-end">
                    <button onClick={handleSave} disabled={desant || answered === 0}
                        className="flex items-center gap-2 rounded-xl bg-primary px-8 py-3 font-semibold text-primary-foreground disabled:opacity-50 active:scale-[0.98] transition">
                        <Save className="h-5 w-5" />
                        {desant ? 'Guardando...' : `Guardar ${nonConforming.length} no conformidades`}
                    </button>
                </div>
            )}

            {/* Reject-again modal (within session) */}
            {rechazoSesion && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={() => setRechazoSesion(null)}>
                    <div className="w-full max-w-md rounded-2xl bg-card p-5" onClick={e => e.stopPropagation()}>
                        <h3 className="font-display text-2xl uppercase mb-1 flex items-center gap-2">
                            <Wrench className="h-6 w-6 text-destructive" /> Rechazar y crear nuevo retrabajo
                        </h3>
                        <p className="text-sm text-muted-foreground mb-4">
                            {exSel.exclusiva} — {retrabajoActivoSesion?.operacion_original} (intento #{(retrabajoActivoSesion?.numero_intento || 1) + 1})
                        </p>
                        <div className="grid gap-3">
                            <div>
                                <label className="text-xs font-semibold uppercase text-muted-foreground">Operario asignado *</label>
                                <select value={rechazoSesion.operario} onChange={e => setRechazoSesion({ ...rechazoSesion, operario: e.target.value })}
                                    className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
                                    <option value="">Seleccionar operario...</option>
                                    {operaris.map(op => <option key={op.id} value={op.id}>{op.name || op.codi}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-semibold uppercase text-muted-foreground">Motivo / notas del nuevo rechazo</label>
                                <textarea value={rechazoSesion.notas} onChange={e => setRechazoSesion({ ...rechazoSesion, notas: e.target.value })}
                                    rows={3} placeholder="Qué sigue mal y qué debe corregirse..."
                                    className="mt-1 w-full rounded-lg border border-input bg-background p-3 text-sm resize-none" />
                            </div>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3">
                            <button onClick={() => setRechazoSesion(null)} className="h-12 rounded-xl bg-secondary font-semibold">Cancelar</button>
                            <button onClick={handleVerificarRechazar} disabled={!rechazoSesion.operario || verificando}
                                className="h-12 rounded-xl bg-destructive font-semibold text-white disabled:opacity-60">
                                {verificando ? 'Creando...' : 'Crear retrabajo'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* ── Modal de rechazo: ¿Crear retrabajo o incidencia? ── */}
            {rechazoModal && (() => {
                const punt = rechazoModal.punt;
                const item = checklist[punt] || {};
                const opNom = operaris.find(op => op.id === item.operarioAsignado)?.name || operaris.find(op => op.id === item.operarioAsignado)?.codi;
                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => handleCancelarRechazo(punt)}>
                        <div className="w-full max-w-md rounded-2xl bg-card p-5" onClick={e => e.stopPropagation()}>
                            {rechazoModal.mode === 'pregunta' ? (
                                <>
                                    <h3 className="font-display text-2xl uppercase mb-1 flex items-center gap-2">
                                        <AlertTriangle className="h-6 w-6 text-destructive" /> ¿Crear retrabajo?
                                    </h3>
                                    <p className="text-sm text-muted-foreground mb-1">Punto rechazado: <strong className="text-foreground">{punt}</strong></p>
                                    <p className="text-sm text-muted-foreground mb-5">Elige cómo gestionar este rechazo. Podrás cambiarlo más tarde.</p>
                                    <div className="grid gap-3">
                                        <button onClick={() => setRechazoModal({ punt, mode: 'retrabajo' })}
                                            className="flex items-center gap-3 rounded-xl border-2 border-destructive/40 bg-destructive/5 px-4 py-3.5 text-left hover:bg-destructive/10 active:scale-[0.98] transition">
                                            <RefreshCcw className="h-6 w-6 text-destructive" />
                                            <div>
                                                <p className="font-bold text-destructive">Sí, retrabajo</p>
                                                <p className="text-xs text-muted-foreground">Asignar a un operario para corregir el defecto</p>
                                            </div>
                                        </button>
                                        <button onClick={() => handleNoIncidencia(punt)}
                                            className="flex items-center gap-3 rounded-xl border-2 border-[hsl(var(--warn))]/40 bg-[hsl(var(--warn))]/5 px-4 py-3.5 text-left hover:bg-[hsl(var(--warn))]/10 active:scale-[0.98] transition">
                                            <AlertTriangle className="h-6 w-6 text-[hsl(var(--warn))]" />
                                            <div>
                                                <p className="font-bold text-[hsl(var(--warn))]">No, es incidencia</p>
                                                <p className="text-xs text-muted-foreground">Registrar como no conformidad sin retrabajo</p>
                                            </div>
                                        </button>
                                        <button onClick={() => handleCancelarRechazo(punt)}
                                            className="h-12 rounded-xl bg-secondary font-semibold active:scale-95">
                                            Cancelar
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <h3 className="font-display text-2xl uppercase mb-1 flex items-center gap-2">
                                        <RefreshCcw className="h-6 w-6 text-destructive" /> Crear retrabajo
                                    </h3>
                                    <p className="text-sm text-muted-foreground mb-4">Punto: <strong className="text-foreground">{punt}</strong> — {exSel?.exclusiva} · {monoSel?.codi}</p>
                                    <div className="grid gap-3">
                                        <div>
                                            <label className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" /> Operario asignado *</label>
                                            <select value={item.operarioAsignado} onChange={e => setField(punt, 'operarioAsignado', e.target.value)}
                                                className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
                                                <option value="">Seleccionar operario...</option>
                                                {operaris.map(op => (
                                                    <option key={op.id} value={op.id}>{op.name || op.codi}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1"><Wrench className="h-3 w-3" /> Fase de retrabajo</label>
                                            <select value={item.faseRetrabajo} onChange={e => {
                                                setField(punt, 'faseRetrabajo', e.target.value);
                                                if (!item.operacionRetrabajo) {
                                                    const first = opsRuta.find(o => (o.fase || 'Sin fase') === e.target.value);
                                                    if (first) setField(punt, 'operacionRetrabajo', first.nom);
                                                }
                                            }}
                                                className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
                                                <option value="">Sin fase</option>
                                                {fasesRuta.map(f => <option key={f} value={f}>{f}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs font-semibold uppercase text-muted-foreground">Operación / fase a retrabajar *</label>
                                            <select value={item.operacionRetrabajo} onChange={e => setField(punt, 'operacionRetrabajo', e.target.value)}
                                                className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
                                                <option value="">Seleccionar operación...</option>
                                                {opsRuta.filter(o => !item.faseRetrabajo || (o.fase || 'Sin fase') === item.faseRetrabajo).map(op => (
                                                    <option key={op.id} value={op.nom}>{op.codi ? `${op.codi} — ` : ''}{op.nom}{op.temps_std_min ? ` (${op.temps_std_min} min)` : ''}</option>
                                                ))}
                                                <option value={punt}>{punt} (punto de control)</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs font-semibold uppercase text-muted-foreground">Notas / motivo del retrabajo</label>
                                            <textarea value={item.notasRetrabajo} onChange={e => setField(punt, 'notasRetrabajo', e.target.value)}
                                                rows={2} placeholder="Instrucciones para el operario..."
                                                className="mt-1 w-full rounded-lg border border-input bg-background p-3 text-sm resize-none" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Tiempo estimado de retrabajo (minutos)</label>
                                            <input type="number" min="0" step="1" value={item.tiempoEstimadoRetrabajo} onChange={e => setField(punt, 'tiempoEstimadoRetrabajo', e.target.value)}
                                                placeholder="Ej. 15"
                                                className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" />
                                        </div>
                                        {item.operarioAsignado && item.operacionRetrabajo && (
                                            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive flex items-center gap-2">
                                                <RefreshCcw className="h-3.5 w-3.5" />
                                                Se creará el retrabajo al guardar — el cronómetro de QC se pausará hasta que el operario lo complete.
                                            </div>
                                        )}
                                    </div>
                                    <div className="mt-4 grid grid-cols-2 gap-3">
                                        <button onClick={() => setRechazoModal({ punt, mode: 'pregunta' })} className="h-12 rounded-xl bg-secondary font-semibold">Volver</button>
                                        <button onClick={() => handleConfirmarRetrabajo(punt)} disabled={!item.operarioAsignado || !item.operacionRetrabajo}
                                            className="h-12 rounded-xl bg-destructive font-semibold text-white disabled:opacity-60">
                                            Crear retrabajo
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}

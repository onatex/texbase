import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, CheckCircle2, XCircle, ArrowLeft, PackageCheck, AlertTriangle, X, RefreshCcw, ChevronRight, Calendar, Play, Pause, Clock, ChevronLeft, ListChecks, Wrench, Camera, AlertCircle, RotateCcw, CheckCheck, Image as ImageIcon, Eye, Zap } from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/lib/auth';
import PhotoPicker from './PhotoPicker';

// Control de calidad simplificado: muestra TODAS las exclusivas (cualquier
// estado) con su estado actual claramente diferenciado. Las entregadas,
// finalizadas y desaparecidas se muestran en modo consulta, sin incluirse en
// las acciones activas de control, para que puedan consultarse sin confundirse
// con las pendientes.
const QUALITY_STATE = {
    pendiente_control: { label: 'Pendiente de control', badge: 'bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))]' },
    en_control: { label: 'En control', badge: 'bg-blue-100 text-blue-700' },
    retrabajo: { label: 'Retrabajo', badge: 'bg-destructive/15 text-destructive' },
    rechazada: { label: 'Rechazada', badge: 'bg-destructive/20 text-destructive' },
    lista_recoger: { label: 'Lista para recoger', badge: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]' },
    en_confeccion: { label: 'En confección', badge: 'bg-secondary text-muted-foreground' },
    entregada: { label: 'Entregada', badge: 'bg-primary/15 text-primary' },
    finalitzada: { label: 'Finalizada', badge: 'bg-primary/15 text-primary' },
    desapareguda: { label: 'Desaparecida', badge: 'bg-destructive/15 text-destructive' },
};

// Estados cerrados: solo consulta, sin acciones activas de control.
const CLOSED_STATES = ['entregada', 'finalitzada', 'desapareguda'];

// Deriva el estado de calidad de una exclusiva a partir de su estat y sus monos.
// Si todas las unidades están finalizadas pero el estat no ha transitado a
// pendiente_calidad (p. ej. el hook automático no disparó), se trata como
// pendiente de control para que no quede oculta.
function deriveQualityState(ex, monosList) {
    const est = ex?.estat;
    if (est === 'entregada') return 'entregada';
    if (est === 'finalitzada') return 'finalitzada';
    if (est === 'desapareguda') return 'desapareguda';
    if (est === 'lista_recollida') return 'lista_recoger';
    if (est === 'en_retrabajo') return 'retrabajo';
    if (est === 'rechazado') return 'rechazada';
    if (est === 'parcialmente_conforme') return 'en_control';
    if (est === 'pendiente_calidad') return 'pendiente_control';
    const ms = monosList || [];
    if (ms.length > 0 && ms.every(m => m.estat === 'finalitzat')) return 'pendiente_control';
    return 'en_confeccion';
}

const ESTADO_BADGE = {
    pendiente: 'bg-secondary text-secondary-foreground',
    conforme: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]',
    rechazada: 'bg-destructive/15 text-destructive',
    pendiente_revision: 'bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))]',
};

const ESTADO_LABEL = {
    pendiente: 'Pendiente',
    conforme: 'Conforme',
    rechazada: 'Rechazada',
    pendiente_revision: 'Pendiente revisión',
};

// Puntos de revisión por defecto (fallback cuando la ruta no define controles)
const DEFAULT_PUNTOS = [
    'Costura correcta',
    'Velcro adherido',
    'Pegamento correcto',
    'Medidas correctas',
    'Acabado limpio',
    'Sin defectos visibles',
];

// Beep using WebAudio (no asset needed)
function playBeep(ok = true) {
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = 'sine';
        o.frequency.value = ok ? 880 : 220;
        g.gain.setValueAtTime(0.001, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        o.start();
        o.stop(ctx.currentTime + 0.42);
        setTimeout(() => ctx.close(), 600);
    } catch { /* ignore */ }
}

function fmtSegons(s) {
    s = Math.max(0, Math.floor(s || 0));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function CalidadSimplificada({ exclusives, monos, recarrega }) {
    const { user } = useAuth();
    const [q, setQ] = useState('');
    const [qDebounced, setQDebounced] = useState('');
    const [filtreQualitat, setFiltreQualitat] = useState('todas');
    const [exSel, setExSel] = useState(null);
    const [unidadSel, setUnidadSel] = useState(null); // número de unidad en detalle
    const [unidades, setUnidades] = useState([]);
    const [carregant, setCarregant] = useState(false);
    const [desant, setDesant] = useState(false);
    const [puntos, setPuntos] = useState([]); // checklist dinámico
    const [puntosEstado, setPuntosEstado] = useState([]); // 'pendiente' | 'revisado' | 'fallido'
    const [obsText, setObsText] = useState('');
    const [rechazadoFlag, setRechazadoFlag] = useState(false);
    const [notif, setNotif] = useState(null); // {tipo, unidad, tiempo}
    const beepedRef = useRef(false);

    // ── Resolución / re-revisión ──
    const [incidenciasMap, setIncidenciasMap] = useState({}); // { unidad_numero: [{tipo, descripcion, fotos, codi, prioritat, estat, fecha, ...}] }
    const [retrabajosMap, setRetrabajosMap] = useState({}); // { unidad_numero: [retrabajo records] }
    const [revisando, setRevisando] = useState(false); // true cuando el checklist está abierto activamente
    const [showIncidenciaModal, setShowIncidenciaModal] = useState(null); // unidad_numero
    const [desantResolucion, setDesantResolucion] = useState(false);
    const [marcandoListo, setMarcandoListo] = useState(false);
    const [showListoConfirm, setShowListoConfirm] = useState(false);

    // ── Modal de fallo: ¿Retrabajo o solo incidencia? ──
    const [falloModal, setFalloModal] = useState(null); // { idx, descripcion }
    const [falloMode, setFalloMode] = useState('pregunta'); // 'pregunta' | 'retrabajo' | 'incidencia'
    const [retrDesc, setRetrDesc] = useState('');
    const [retrTiempo, setRetrTiempo] = useState('');
    const [retrPrioridad, setRetrPrioridad] = useState('media');
    const [retrFase, setRetrFase] = useState('');
    const [opsRuta, setOpsRuta] = useState([]); // operaciones de la ruta de la exclusiva
    const [incDesc, setIncDesc] = useState('');
    const [incTipo, setIncTipo] = useState('Defecto');
    const [incObs, setIncObs] = useState('');
    const [incFotos, setIncFotos] = useState([]);
    const [desantFallo, setDesantFallo] = useState(false);

    // ── Sesión activa de calidad (heartbeat) ──────────────────────────
    // Mientras se revisa una unidad pendiente, se mantiene un registro en
    // `actividad_calidad` (estado='en_proceso') para que el Dashboard "En
    // vivo" y el Kanban puedan mostrar al operario de Calidad en curso.
    // Se elimina al cerrar/guardar la revisión. No guarda resultados: es
    // solo un marcador de presencia efímero.
    const activeQcSessionRef = useRef(null);
    const monosRef = useRef([]);
    monosRef.current = monos;
    useEffect(() => {
        let cancelled = false;
        const sid = activeQcSessionRef.current;
        if (revisando && unidadSel != null && exSel && user?.id) {
            // Iniciar (o reutilizar) sesión activa
            (async () => {
                try {
                    const monoRec = (monosByExId[exSel.id] || []).find(
                        (m) => Number(m.numero) === Number(unidadSel),
                    );
                    const existing = await pb.collection('actividad_calidad').getFullList({
                        filter: `operari="${user.id}" && exclusiva="${exSel.id}" && unidad_numero = ${Number(unidadSel)} && estado = "en_proceso"`,
                        requestKey: `cs-act-find-${exSel.id}-${unidadSel}`,
                    }).catch(() => []);
                    let rec;
                    if (existing && existing.length) {
                        rec = await pb.collection('actividad_calidad').update(existing[0].id, {
                            mono: monoRec?.id || existing[0].mono || undefined,
                            operacio: `Control de calidad · Ud. ${unidadSel}`,
                            estado: 'en_proceso',
                        }, { requestKey: `cs-act-touch-${existing[0].id}` });
                    } else {
                        rec = await pb.collection('actividad_calidad').create({
                            operari: user.id,
                            exclusiva: exSel.id,
                            mono: monoRec?.id || undefined,
                            unidad_numero: Number(unidadSel),
                            operacio: `Control de calidad · Ud. ${unidadSel}`,
                            estado: 'en_proceso',
                        }, { requestKey: `cs-act-create-${exSel.id}-${unidadSel}-${Date.now()}` });
                    }
                    if (!cancelled) activeQcSessionRef.current = rec.id;
                } catch (e) { /* no bloquear la revisión */ }
            })();
        } else if (sid) {
            // Cerrar sesión activa al dejar de revisar
            activeQcSessionRef.current = null;
            (async () => {
                try {
                    await pb.collection('actividad_calidad').delete(sid, { requestKey: `cs-act-stop-${sid}` });
                } catch (e) { /* ya eliminada o permiso */ }
            })();
        }
        return () => { cancelled = true; };
        // monosByExId se reconstruye con monos; usar exSel.id/unidadSel como disparadores
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [revisando, unidadSel, exSel && exSel.id, user && user.id]);

    // Al desmontar el componente, cerrar cualquier sesión activa pendiente.
    useEffect(() => {
        return () => {
            const sid = activeQcSessionRef.current;
            if (!sid) return;
            activeQcSessionRef.current = null;
            try { pb.collection('actividad_calidad').delete(sid, { requestKey: `cs-act-unmount-${sid}` }).catch(() => {}); } catch (e) {}
        };
    }, []);

    // ── Cronómetro ──
    const cronoRef = useRef(null);
    const cronoStartRef = useRef(0);
    const [cronoSegons, setCronoSegons] = useState(0);
    const [cronoRunning, setCronoRunning] = useState(false);

    const stopCrono = useCallback(() => {
        if (cronoRef.current) { clearInterval(cronoRef.current); cronoRef.current = null; }
        setCronoRunning(false);
    }, []);

    const tickCrono = useCallback((fromSegs) => {
        if (cronoRef.current) clearInterval(cronoRef.current);
        cronoStartRef.current = Date.now() - (fromSegs || 0) * 1000;
        setCronoRunning(true);
        cronoRef.current = setInterval(() => {
            setCronoSegons(Math.floor((Date.now() - cronoStartRef.current) / 1000));
        }, 500);
    }, []);

    const pauseCrono = useCallback(() => {
        if (cronoRef.current) { clearInterval(cronoRef.current); cronoRef.current = null; }
        setCronoRunning(false);
    }, []);

    const resumeCrono = useCallback(() => {
        if (cronoRef.current) return;
        cronoStartRef.current = Date.now() - cronoSegons * 1000;
        setCronoRunning(true);
        cronoRef.current = setInterval(() => {
            setCronoSegons(Math.floor((Date.now() - cronoStartRef.current) / 1000));
        }, 500);
    }, [cronoSegons]);

    // Cleanup al desmontar
    useEffect(() => () => stopCrono(), [stopCrono]);

    // Debounce búsqueda
    useEffect(() => {
        const t = setTimeout(() => setQDebounced(q.trim()), 200);
        return () => clearTimeout(t);
    }, [q]);

    // ── Puntos de revisión por exclusiva ──
    // Carga una sola vez (y al cambiar configuración/NCs) las definiciones de
    // control de calidad, operaciones con control, checklist de artículos,
    // artículos (para resolver referencia → ruta) y no conformidades (para
    // contar apariciones por punto). Con eso construye un mapa exId → puntos.
    const [puntsConfig, setPuntsConfig] = useState(null);

    const carregaConfig = useCallback(async () => {
        try {
            const [defs, ops, checklists, articles, ncs] = await Promise.all([
                pb.collection('controles_qualitat_def').getFullList({ requestKey: `cs-punts-defs-${Date.now()}` }).catch(() => []),
                pb.collection('operacions_def').getFullList({ filter: 'te_control_qualitat = true', requestKey: `cs-punts-ops-${Date.now()}` }).catch(() => []),
                pb.collection('checklist_calidad').getFullList({ sort: 'punto_numero', requestKey: `cs-punts-cl-${Date.now()}` }).catch(() => []),
                pb.collection('articles').getFullList({ requestKey: `cs-punts-art-${Date.now()}` }).catch(() => []),
                pb.collection('no_conformitats').getFullList({ requestKey: `cs-punts-nc-${Date.now()}` }).catch(() => []),
            ]);
            const defsByRuta = {};
            defs.forEach((d) => { const r = d.ruta; if (!r) return; (defsByRuta[r] ||= []).push(d); });
            const opsByRuta = {};
            ops.forEach((o) => { const r = o.ruta; if (!r) return; (opsByRuta[r] ||= []).push(o); });
            const clByArt = {};
            checklists.forEach((c) => { const a = c.articulo_id; if (!a) return; (clByArt[a] ||= []).push(c); });
            const artByRef = {};
            articles.forEach((a) => { if (a.referencia) artByRef[String(a.referencia).trim().toUpperCase()] = a; });
            const ncCountByExPunt = {};
            ncs.forEach((nc) => {
                const ex = nc.exclusiva; const p = (nc.punt_checklist || '').trim().toLowerCase();
                if (!ex || !p) return;
                (ncCountByExPunt[ex] ||= {})[p] = (ncCountByExPunt[ex][p] || 0) + 1;
            });
            setPuntsConfig({ defsByRuta, opsByRuta, clByArt, artByRef, ncCountByExPunt });
        } catch { /* ignore */ }
    }, []);

    useEffect(() => { carregaConfig(); }, [carregaConfig]);

    // Suscripción en tiempo real propia: refresca la lista de exclusivas cuando
    // cambian fases, monos, registres, retrabajos o controles de calidad, para
    // que la cola de Calidad se actualice al completar/pausar/reanudar/cambiar
    // fases sin necesidad de recargar. Usa la función de baja por suscripción
    // (no unsubscribe('*')) para no afectar a otros suscriptores del SDK.
    useEffect(() => {
        if (!recarrega) return;
        let timer = null;
        let cancelled = false;
        const unsubs = [];
        const trigger = () => { clearTimeout(timer); timer = setTimeout(recarrega, 300); };
        const triggerConfig = () => { clearTimeout(timer); timer = setTimeout(() => { recarrega(); carregaConfig(); }, 300); };
        const cols = ['exclusives', 'monos', 'registres', 'retrabajos', 'control_calidad'];
        const configCols = ['no_conformitats', 'controles_qualitat_def', 'operacions_def', 'checklist_calidad', 'articles'];
        cols.forEach((c) => {
            pb.collection(c).subscribe('*', trigger)
                .then((unsub) => { if (cancelled) { try { unsub(); } catch { /* noop */ } } else { unsubs.push(unsub); } })
                .catch(() => {});
        });
        configCols.forEach((c) => {
            pb.collection(c).subscribe('*', triggerConfig)
                .then((unsub) => { if (cancelled) { try { unsub(); } catch { /* noop */ } } else { unsubs.push(unsub); } })
                .catch(() => {});
        });
        return () => {
            cancelled = true;
            clearTimeout(timer);
            unsubs.forEach((u) => { try { u(); } catch { /* noop */ } });
        };
    }, [recarrega, carregaConfig]);

    // Index monos by exclusiva id → codi list
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

    // Monos completos agrupados por exclusiva (para derivar el estado de calidad)
    const monosByExId = useMemo(() => {
        const map = {};
        monos.forEach((m) => {
            const k = m.exclusiva;
            if (!k) return;
            if (!map[k]) map[k] = [];
            map[k].push(m);
        });
        return map;
    }, [monos]);

    // Puntos de revisión por exclusiva (resueltos desde la configuración cargada)
    const puntosByEx = useMemo(() => {
        if (!puntsConfig) return {};
        const { defsByRuta, opsByRuta, clByArt, artByRef, ncCountByExPunt } = puntsConfig;
        const map = {};
        exclusives.forEach((ex) => {
            let rutaId = ex.ruta;
            let artId = null;
            const ref = ex.referencia ? String(ex.referencia).trim().toUpperCase() : '';
            const art = ref ? artByRef[ref] : null;
            if (art) { if (!rutaId) rutaId = art.ruta; artId = art.id; }
            const pts = [];
            const seen = new Set();
            const addP = (desc, obligatorio = false, prioritat = '') => {
                const d = (desc || '').trim();
                if (!d || seen.has(d.toLowerCase())) return;
                seen.add(d.toLowerCase());
                const apariciones = (ncCountByExPunt[ex.id] || {})[d.toLowerCase()] || 0;
                pts.push({ descripcion: d, obligatorio: !!obligatorio, prioritat: prioritat || '', apariciones });
            };
            (defsByRuta[rutaId] || []).forEach((d) => addP(d.nom || d.codi || d.descripcio, d.obligatori, d.prioritat || ''));
            (opsByRuta[rutaId] || []).forEach((o) => addP(o.nom, false, ''));
            (clByArt[artId] || []).forEach((c) => addP(c.descripcion, c.obligatorio, c.prioritat || ''));
            map[ex.id] = pts;
        });
        return map;
    }, [puntsConfig, exclusives]);

    // Filtrado de exclusivas — se muestran TODAS las exclusivas (cualquier
    // estado), sin ocultar por estado, fecha, ruta o relaciones incompletas.
    // El filtro de cola solo acota qué estados se listan; "Todas" los muestra
    // todos. Las entregadas/finalizadas/desaparecidas se muestran en modo
    // consulta, diferenciadas, sin mezclarse con las pendientes activas.
    const exFiltered = useMemo(() => {
        const t = qDebounced.toLowerCase();
        const today = new Date(); today.setHours(0, 0, 0, 0);
        return exclusives
            .filter(e => {
                if (!t) return true;
                const monosCodis = (monosPerEx[e.id] || []).join(' ').toLowerCase();
                const haystack = `${e.exclusiva} ${e.article || ''} ${e.referencia || ''} ${monosCodis}`;
                return haystack.toLowerCase().includes(t);
            })
            .map(e => {
                const dies = e.data_entrega ? Math.ceil((new Date(e.data_entrega + 'T00:00:00') - today) / 86400000) : null;
                const qs = deriveQualityState(e, monosByExId[e.id] || []);
                return { ...e, _diesEntrega: dies, _retrasat: dies !== null && dies < 0, _qualityState: qs };
            })
            .filter(e => {
                if (filtreQualitat === 'todas') return true;
                if (filtreQualitat === 'calidad') return !['en_confeccion', 'entregada', 'finalitzada', 'desapareguda'].includes(e._qualityState);
                if (filtreQualitat === 'pendiente') return e._qualityState === 'pendiente_control';
                if (filtreQualitat === 'retrabajo') return e._qualityState === 'retrabajo';
                if (filtreQualitat === 'lista') return e._qualityState === 'lista_recoger';
                if (filtreQualitat === 'confeccion') return e._qualityState === 'en_confeccion';
                if (filtreQualitat === 'cerradas') return ['entregada', 'finalitzada', 'desapareguda'].includes(e._qualityState);
                return true;
            })
            .sort((a, b) => {
                // Cerradas al final (consulta), resto por fecha de entrega
                const aClosed = CLOSED_STATES.includes(a._qualityState);
                const bClosed = CLOSED_STATES.includes(b._qualityState);
                if (aClosed && !bClosed) return 1;
                if (!aClosed && bClosed) return -1;
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
    }, [exclusives, qDebounced, monosPerEx, monosByExId, filtreQualitat]);

    const isExpress = useCallback((ex) => ex?.express === true || ex?.prioritat === 'express', []);

    // Agrupar por fecha de entrega (retrasadas primero, Express primero dentro de cada día)
    const exGroups = useMemo(() => {
        const groups = new Map();
        exFiltered.forEach((ex) => {
            const key = ex.data_entrega || '__sense_data__';
            if (!groups.has(key)) groups.set(key, { key, items: [] });
            groups.get(key).items.push(ex);
        });
        return Array.from(groups.values());
    }, [exFiltered]);

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

    const totalUnidades = Math.max(0, Number(exSel?.unitats) || 0);

    const carregaUnidades = useCallback(async () => {
        if (!exSel) return;
        setCarregant(true);
        try {
            const [cc, ncs, retrs] = await Promise.all([
                pb.collection('control_calidad').getFullList({
                    filter: `exclusiva_id = "${exSel.id}"`,
                    sort: 'unidad_numero',
                    requestKey: `cs-cc-${exSel.id}-${Date.now()}`,
                }).catch(() => []),
                pb.collection('no_conformitats').getFullList({
                    filter: `exclusiva = "${exSel.id}"`,
                    requestKey: `cs-nc-${exSel.id}-${Date.now()}`,
                }).catch(() => []),
                pb.collection('retrabajos').getFullList({
                    filter: `exclusiva = "${exSel.id}"`,
                    requestKey: `cs-retr-${exSel.id}-${Date.now()}`,
                }).catch(() => []),
            ]);
            setUnidades(cc);
            // Agrupar incidencias y retrabajos por unidad_numero
            const incMap = {};
            ncs.forEach(nc => {
                const u = nc.unidad_numero;
                if (u == null || u === '') return;
                const key = Number(u);
                if (!incMap[key]) incMap[key] = [];
                incMap[key].push(nc);
            });
            setIncidenciasMap(incMap);
            const retrMap = {};
            retrs.forEach(r => {
                const u = r.unidad_numero;
                if (u == null || u === '') return;
                const key = Number(u);
                if (!retrMap[key]) retrMap[key] = [];
                retrMap[key].push(r);
            });
            setRetrabajosMap(retrMap);
            beepedRef.current = false;
        } finally { setCarregant(false); }
    }, [exSel]);

    // Cargar checklist dinámico al seleccionar exclusiva
    const carregaChecklist = useCallback(async () => {
        if (!exSel) return;
        let rutaId = exSel.ruta;
        // Si no hay ruta en la exclusiva, intentar obtenerla del artículo
        if (!rutaId && exSel.referencia) {
            try {
                const art = await pb.collection('articles').getFirstListItem(
                    pb.filter('referencia = {:ref}', { ref: exSel.referencia }),
                    { requestKey: `cs-art-${exSel.id}` }
                ).catch(() => null);
                if (art?.ruta) rutaId = art.ruta;
            } catch { /* ignore */ }
        }
        const pts = [];
        const seen = new Set();
        const addP = (desc, obligatorio = false) => {
            const d = (desc || '').trim();
            if (!d || seen.has(d.toLowerCase())) return;
            seen.add(d.toLowerCase());
            pts.push({ descripcion: d, obligatorio });
        };

        // 1. Definiciones de control de calidad de la ruta
        if (rutaId) {
            try {
                const defs = await pb.collection('controles_qualitat_def').getFullList({
                    filter: `ruta = "${rutaId}"`,
                    requestKey: `cs-cqdef-${rutaId}`,
                }).catch(() => []);
                defs.forEach(d => addP(d.nom || d.codi || d.descripcio, !!d.obligatori));
            } catch { /* ignore */ }

            // 2. Operaciones de la ruta que tienen control de calidad
            try {
                const ops = await pb.collection('operacions_def').getFullList({
                    filter: `ruta = "${rutaId}" && te_control_qualitat = true`,
                    requestKey: `cs-ops-${rutaId}`,
                }).catch(() => []);
                ops.forEach(o => addP(o.nom, false));
            } catch { /* ignore */ }
        }

        // 3. Checklist personalizado del artículo (checklist_calidad)
        if (exSel.referencia) {
            try {
                const art = await pb.collection('articles').getFirstListItem(
                    pb.filter('referencia = {:ref}', { ref: exSel.referencia }),
                    { requestKey: `cs-art2-${exSel.id}` }
                ).catch(() => null);
                if (art) {
                    const custom = await pb.collection('checklist_calidad').getFullList({
                        filter: `articulo_id = "${art.id}"`,
                        sort: 'punto_numero',
                        requestKey: `cs-cl-${art.id}`,
                    }).catch(() => []);
                    custom.forEach(c => addP(c.descripcion, !!c.obligatorio));
                }
            } catch { /* ignore */ }
        }

        // 4. Fallback: puntos por defecto
        if (pts.length === 0) {
            DEFAULT_PUNTOS.forEach(p => addP(p, false));
        }
        setPuntos(pts);
    }, [exSel]);

    useEffect(() => {
        if (exSel) {
            carregaUnidades();
            carregaChecklist();
            setUnidadSel(null);
            setObsText('');
            setRechazadoFlag(false);
            setNotif(null);
            stopCrono();
            setCronoSegons(0);
            // Cargar operaciones de la ruta para el select de fase a retrabajar
            if (exSel.ruta) {
                pb.collection('operacions_def').getFullList({
                    filter: `ruta = "${exSel.ruta}"`,
                    sort: 'ordre',
                    requestKey: `cs-opsruta-${exSel.ruta}`,
                }).then(setOpsRuta).catch(() => setOpsRuta([]));
            } else {
                setOpsRuta([]);
            }
        }
    }, [exSel, carregaUnidades, carregaChecklist, stopCrono]);

    const unidadesMap = useMemo(() => {
        const m = {};
        unidades.forEach(u => { m[u.unidad_numero] = u; });
        return m;
    }, [unidades]);

    const listaUnidades = useMemo(() => {
        const arr = [];
        for (let i = 1; i <= totalUnidades; i++) {
            arr.push(unidadesMap[i] || { unidad_numero: i, estado: 'pendiente', observaciones: '', id: null });
        }
        return arr;
    }, [unidadesMap, totalUnidades]);

    const conformes = listaUnidades.filter(u => u.estado === 'conforme').length;
    const rechazadas = listaUnidades.filter(u => u.estado === 'rechazada').length;
    const pendientesRevision = listaUnidades.filter(u => u.estado === 'pendiente_revision').length;
    const pendientes = totalUnidades - conformes - rechazadas - pendientesRevision;
    const todasConformes = totalUnidades > 0 && conformes === totalUnidades;

    // ── Abrir detalle de unidad ──
    const abrirUnidad = useCallback((unidadNumero) => {
        const rec = unidadesMap[unidadNumero];
        const est = rec?.estado || 'pendiente';
        setUnidadSel(unidadNumero);
        setObsText(rec?.observaciones || '');
        setRechazadoFlag(false);
        setNotif(null);
        setShowIncidenciaModal(null);
        // El checklist se abre automáticamente solo si la unidad está pendiente
        setRevisando(est === 'pendiente');
        // Restaurar checklist si ya existe
        const guardados = rec?.puntos_revisados;
        if (guardados && Array.isArray(guardados.estados)) {
            setPuntosEstado(guardados.estados);
        } else if (guardados && Array.isArray(guardados)) {
            setPuntosEstado(puntos.map(p => guardados.includes(p.descripcion) ? 'revisado' : 'pendiente'));
        } else {
            setPuntosEstado(puntos.map(() => 'pendiente'));
        }
        // Iniciar cronómetro desde tiempo acumulado o 0 (solo si estamos revisando)
        const prevSegs = Number(rec?.tiempo_revision_seg) || 0;
        setCronoSegons(prevSegs);
        if (est === 'pendiente') {
            tickCrono(prevSegs);
        } else {
            stopCrono();
        }
    }, [unidadesMap, puntos, tickCrono, stopCrono]);

    // Cuando cambian los puntos, reajustar estados si estamos en detalle
    useEffect(() => {
        if (unidadSel != null && puntosEstado.length !== puntos.length) {
            setPuntosEstado(puntos.map(() => 'pendiente'));
        }
    }, [puntos, unidadSel, puntosEstado.length]);

    const abrirModalFallo = (idx) => {
        setPuntosEstado(prev => { const n = [...prev]; n[idx] = 'fallido'; return n; });
        setFalloModal({ idx, descripcion: puntos[idx]?.descripcion || '' });
        setFalloMode('pregunta');
        setRetrDesc(''); setRetrTiempo(''); setRetrPrioridad('media'); setRetrFase('');
        setIncDesc(''); setIncTipo('Defecto'); setIncObs(''); setIncFotos([]);
    };

    const togglePunto = (idx) => {
        const cur = puntosEstado[idx] || 'pendiente';
        const next = cur === 'pendiente' ? 'revisado' : cur === 'revisado' ? 'fallido' : 'pendiente';
        if (next === 'fallido') { abrirModalFallo(idx); return; }
        setPuntosEstado(prev => { const n = [...prev]; n[idx] = next; return n; });
    };

    const setPuntoRevisado = (idx) => {
        setPuntosEstado(prev => { const n = [...prev]; n[idx] = 'revisado'; return n; });
    };
    const setPuntoFallido = (idx) => {
        abrirModalFallo(idx);
    };

    const cancelarFallo = () => {
        if (falloModal) {
            setPuntosEstado(prev => { const n = [...prev]; n[falloModal.idx] = 'pendiente'; return n; });
        }
        setFalloModal(null);
    };

    const siguienteNumNC = async () => {
        const existing = await pb.collection('no_conformitats').getFullList({
            fields: 'codi', requestKey: `cs-nc-max-${Date.now()}`,
        }).catch(() => []);
        const maxNum = existing.reduce((acc, nc) => {
            const m = (nc.codi || '').match(/INC-(\d+)/);
            return m ? Math.max(acc, parseInt(m[1], 10)) : acc;
        }, 0);
        return `INC-${String(maxNum + 1).padStart(3, '0')}`;
    };

    const marcarUnidadRechazada = async (tiempoSeg, obsText) => {
        const rec = await ensureRecord(unidadSel);
        const estadosChecklist = puntos.map((p, i) => puntosEstado[i] || 'pendiente');
        const updated = await pb.collection('control_calidad').update(rec.id, {
            estado: 'rechazada',
            observaciones: obsText,
            fecha_revision: new Date().toISOString(),
            usuario_id: user?.id || undefined,
            puntos_revisados: { estados: estadosChecklist, revisados: puntosRevisadosList, fallidos: puntosFallidosList },
            tiempo_revision_seg: tiempoSeg,
        }, { requestKey: `cs-up-rech-${rec.id}-${Date.now()}` });
        setUnidades(prev => prev.map(u => u.id === rec.id ? updated : u));

        pb.collection('historial_control_calidad').create({
            exclusiva_id: exSel.id, unidad_numero: unidadSel, estado: 'rechazada',
            observaciones: obsText, fecha: new Date().toISOString(), usuario_id: user?.id || undefined,
        }, { requestKey: `cs-hist-rech-${exSel.id}-${unidadSel}-${Date.now()}` }).catch(() => {});

        pb.collection('historial_calidad').create({
            exclusiva_id: exSel.id, unidad_numero: unidadSel,
            puntos_revisados: puntosRevisadosList, puntos_fallidos: puntosFallidosList,
            observaciones: obsText, tiempo_revision: tiempoSeg,
            usuario_id: user?.id || undefined, fecha: new Date().toISOString(),
        }, { requestKey: `cs-hcal-rech-${exSel.id}-${unidadSel}-${Date.now()}` }).catch(() => {});

        const nuevaLista = listaUnidades.map(u =>
            u.unidad_numero === unidadSel ? { ...u, estado: 'rechazada', observaciones: obsText } : u
        );
        const nuevoEstat = computeExclusivaEstat(nuevaLista);
        if (nuevoEstat !== exSel.estat) {
            await pb.collection('exclusives').update(exSel.id, { estat: nuevoEstat }, { requestKey: `cs-exestat-rech-${exSel.id}` });
        }
    };

    // ── Crear retrabajo ──
    const crearRetrabajo = async () => {
        if (!falloModal || unidadSel == null) return;
        setDesantFallo(true);
        const tiempoSeg = cronoSegons;
        try {
            pauseCrono();
            const puntoDesc = puntos[falloModal.idx]?.descripcion || '';
            const codi = await siguienteNumNC();
            const tempsEstimat = Number(retrTiempo) || 0;

            // 1. Incidencia tipo retrabajo
            const fd = new FormData();
            fd.append('codi', codi);
            fd.append('data_nc', new Date().toISOString());
            fd.append('exclusiva', exSel.id);
            fd.append('area', 'acabats');
            fd.append('descripcio', retrDesc || `Retrabajo en ${puntoDesc}`);
            fd.append('prioritat', retrPrioridad);
            fd.append('estat', 'oberta');
            fd.append('punt_checklist', puntoDesc);
            fd.append('resultat_checklist', 'retreball');
            fd.append('operari_que_detecto', user?.id || '');
            fd.append('unidad_numero', String(unidadSel));
            const ncRec = await pb.collection('no_conformitats').create(fd, { requestKey: `cs-nc-retr-${Date.now()}` });

            // 2. Retrabajo
            const retrFd = new FormData();
            retrFd.append('exclusiva', exSel.id);
            retrFd.append('operacion_original', puntoDesc);
            retrFd.append('punt_checklist', puntoDesc);
            retrFd.append('motivo_rechazo', retrDesc || `Fallo en ${puntoDesc}`);
            retrFd.append('estado', 'pendiente');
            retrFd.append('incidencia_calidad', ncRec.id);
            retrFd.append('numero_intento', '1');
            retrFd.append('temps_estimat_min', String(tempsEstimat));
            retrFd.append('prioridad', retrPrioridad);
            retrFd.append('notas', retrDesc || '');
            retrFd.append('creado_por', user?.id || '');
            retrFd.append('unidad_numero', String(unidadSel));
            if (retrFase) retrFd.append('fase_retrabajo', retrFase);
            await pb.collection('retrabajos').create(retrFd, { requestKey: `cs-retr-${Date.now()}` });

            // 3. Notificar a Producción / Admin / Super Admin
            try {
                const admins = await pb.collection('users').getFullList({
                    filter: "rol = 'admin' || rol = 'superadmin' || rol = 'produccio'",
                    requestKey: `cs-retr-notify-${Date.now()}`,
                });
                const titol = `Retrabajo en ${exSel.exclusiva} (unidad ${unidadSel})`;
                const missatge = `${puntoDesc}${exSel.article ? ' · ' + exSel.article : ''}${tempsEstimat ? ' · ~' + tempsEstimat + 'min' : ''}`;
                await Promise.all(admins.map((a, i) =>
                    pb.collection('notifications').create({
                        destinatari: a.id, tipus: 'retrabajo_creado', titol, missatge,
                        link_id: exSel.id, llegida: false,
                    }, { requestKey: `cs-retr-notif-${i}-${Date.now()}` }).catch(() => {})
                ));
            } catch (e) { console.error('Error notificando retrabajo', e); }

            // 4. Sumar tiempo de retrabajo al tiempo total
            try {
                await pb.collection('tiempos_exclusiva').create({
                    exclusiva_id: exSel.id, tipo: 'retrabajo',
                    tiempo_minutos: tempsEstimat, tiempo_segundos: tempsEstimat * 60,
                    descripcion: `Retrabajo unidad ${unidadSel}: ${puntoDesc}`,
                    usuario_id: user?.id || '', fecha: new Date().toISOString(),
                }, { requestKey: `cs-tex-retr-${Date.now()}` });
            } catch (e) { console.error('Error registrando tiempo retrabajo', e); }

            // 4b. Cambiar estado de exclusiva a en_retrabajo
            try {
                await pb.collection('exclusives').update(exSel.id, { estat: 'en_retrabajo' }, { requestKey: `cs-ex-retr-${exSel.id}` });
            } catch (e) { console.error('Error actualizando estado exclusiva', e); }

            // 5. Marcar unidad como rechazada
            await marcarUnidadRechazada(tiempoSeg, `Retrabajo: ${retrDesc || puntoDesc}`);

            playBeep(false);
            setFalloModal(null);
            setNotif({ tipo: 'rechazada', unidad: unidadSel, tiempo: tiempoSeg, msg: 'Retrabajo creado y notificado a producción' });
        } catch (e) {
            console.error('Error creando retrabajo', e);
            setNotif({ tipo: 'warn', unidad: unidadSel, msg: 'Error al crear retrabajo. Reintenta.' });
        } finally { setDesantFallo(false); }
    };

    // ── Guardar solo incidencia ──
    const guardarIncidencia = async () => {
        if (!falloModal || unidadSel == null) return;
        setDesantFallo(true);
        const tiempoSeg = cronoSegons;
        try {
            pauseCrono();
            const puntoDesc = puntos[falloModal.idx]?.descripcion || '';
            const codi = await siguienteNumNC();
            const descFull = incObs ? `${incDesc || `Incidencia en ${puntoDesc}`}\n\nObservaciones: ${incObs}` : (incDesc || `Incidencia en ${puntoDesc}`);

            const fd = new FormData();
            fd.append('codi', codi);
            fd.append('data_nc', new Date().toISOString());
            fd.append('exclusiva', exSel.id);
            fd.append('area', 'acabats');
            fd.append('descripcio', descFull);
            fd.append('prioritat', 'media');
            fd.append('estat', 'oberta');
            fd.append('punt_checklist', puntoDesc);
            fd.append('resultat_checklist', 'rebutjat');
            fd.append('operari_que_detecto', user?.id || '');
            fd.append('unidad_numero', String(unidadSel));
            if (incTipo === 'Propuesta de mejora') fd.append('proposta_millora', incDesc || incObs || '');
            if (incTipo === 'Acción preventiva') fd.append('accio_preventiva', incDesc || incObs || '');
            for (const f of incFotos) fd.append('fotos', f);
            const ncRec = await pb.collection('no_conformitats').create(fd, { requestKey: `cs-nc-inc-${Date.now()}` });

            // Crear propuesta de mejora si aplica
            if (incTipo === 'Propuesta de mejora' || incTipo === 'Acción preventiva') {
                try {
                    await pb.collection('propuestas_mejora').create({
                        numero_exclusiva: exSel.exclusiva || '',
                        referencia_articulo: exSel.article || exSel.referencia || '',
                        descripcion: incDesc || incObs || '',
                        tipo: incTipo === 'Acción preventiva' ? 'accion_preventiva' : 'propuesta_mejora',
                        estado: 'pendiente_respuesta',
                        exclusiva_id: exSel.id,
                        punt_checklist: puntoDesc,
                        nc_id: ncRec.id,
                        usuario_reporto: user?.id || '',
                        fecha_reporte: new Date().toISOString(),
                    }, { requestKey: `cs-prop-${Date.now()}` });
                } catch (e) { console.error('Error creando propuesta', e); }
            }

            // Marcar unidad como rechazada
            await marcarUnidadRechazada(tiempoSeg, `Incidencia: ${incDesc || puntoDesc}`);

            playBeep(false);
            setFalloModal(null);
            setNotif({ tipo: 'rechazada', unidad: unidadSel, tiempo: tiempoSeg, msg: 'Incidencia guardada' });
        } catch (e) {
            console.error('Error guardando incidencia', e);
            setNotif({ tipo: 'warn', unidad: unidadSel, msg: 'Error al guardar. Reintenta.' });
        } finally { setDesantFallo(false); }
    };

    const puntosRevisadosList = useMemo(
        () => puntos.filter((_, i) => puntosEstado[i] === 'revisado').map(p => p.descripcion),
        [puntos, puntosEstado]
    );
    const puntosFallidosList = useMemo(
        () => puntos.filter((_, i) => puntosEstado[i] === 'fallido').map(p => p.descripcion),
        [puntos, puntosEstado]
    );

    const obligatoriosPendientes = useMemo(
        () => puntos.filter((p, i) => p.obligatorio && puntosEstado[i] !== 'revisado').length,
        [puntos, puntosEstado]
    );

    const ensureRecord = async (unidadNumero) => {
        const existing = unidadesMap[unidadNumero];
        if (existing?.id) return existing;
        const rec = await pb.collection('control_calidad').create({
            exclusiva_id: exSel.id,
            unidad_numero: unidadNumero,
            estado: 'pendiente',
        }, { requestKey: `cs-create-${exSel.id}-${unidadNumero}` });
        setUnidades(prev => [...prev.filter(u => u.unidad_numero !== unidadNumero), rec]);
        return rec;
    };

    const computeExclusivaEstat = (lista) => {
        const conf = lista.filter(u => u.estado === 'conforme').length;
        const rej = lista.filter(u => u.estado === 'rechazada').length;
        if (rej > 0) return 'rechazado';
        if (conf === totalUnidades && totalUnidades > 0) return 'lista_recollida';
        if (conf > 0) return 'parcialmente_conforme';
        return exSel.estat;
    };

    // ── Guardar revisión (Conforme / Rechazar) ──
    const guardarRevision = async (nuevoEstado) => {
        if (unidadSel == null) return;
        // Validar obligatorios si conforme
        if (nuevoEstado === 'conforme' && obligatoriosPendientes > 0) {
            setNotif({ tipo: 'warn', unidad: unidadSel, msg: `Faltan ${obligatoriosPendientes} punto(s) obligatorio(s) por revisar` });
            return;
        }
        setDesant(true);
        const tiempoSeg = cronoSegons;
        try {
            // Pausar cronómetro
            pauseCrono();

            const rec = await ensureRecord(unidadSel);
            const estadosChecklist = puntos.map((p, i) => puntosEstado[i] || 'pendiente');
            const updated = await pb.collection('control_calidad').update(rec.id, {
                estado: nuevoEstado,
                observaciones: obsText,
                fecha_revision: new Date().toISOString(),
                usuario_id: user?.id || undefined,
                puntos_revisados: { estados: estadosChecklist, revisados: puntosRevisadosList, fallidos: puntosFallidosList },
                tiempo_revision_seg: tiempoSeg,
            }, { requestKey: `cs-up-${rec.id}` });

            setUnidades(prev => prev.map(u => u.id === rec.id ? updated : u));

            // historial_control_calidad (audit existente)
            pb.collection('historial_control_calidad').create({
                exclusiva_id: exSel.id,
                unidad_numero: unidadSel,
                estado: nuevoEstado,
                observaciones: obsText,
                fecha: new Date().toISOString(),
                usuario_id: user?.id || undefined,
            }, { requestKey: `cs-hist-${exSel.id}-${unidadSel}-${Date.now()}` }).catch(() => {});

            // historial_calidad (nuevo, detallado)
            pb.collection('historial_calidad').create({
                exclusiva_id: exSel.id,
                unidad_numero: unidadSel,
                puntos_revisados: puntosRevisadosList,
                puntos_fallidos: puntosFallidosList,
                observaciones: obsText,
                tiempo_revision: tiempoSeg,
                usuario_id: user?.id || undefined,
                fecha: new Date().toISOString(),
            }, { requestKey: `cs-hcal-${exSel.id}-${unidadSel}-${Date.now()}` }).catch(() => {});

            // tiempos_exclusiva (calidad, en minutos y segundos)
            const minutos = Math.round((tiempoSeg / 60) * 100) / 100;
            pb.collection('tiempos_exclusiva').create({
                exclusiva_id: exSel.id,
                tipo: 'calidad',
                tiempo_minutos: minutos,
                tiempo_segundos: tiempoSeg,
                descripcion: `Control de calidad unidad ${unidadSel}`,
                usuario_id: user?.id || undefined,
                fecha: new Date().toISOString(),
            }, { requestKey: `cs-tex-${exSel.id}-${unidadSel}-${Date.now()}` }).catch(() => {});

            // Recalcular estat exclusiva
            const nuevaLista = listaUnidades.map(u =>
                u.unidad_numero === unidadSel ? { ...u, estado: nuevoEstado, observaciones: obsText } : u
            );
            const nuevoEstat = computeExclusivaEstat(nuevaLista);
            if (nuevoEstat !== exSel.estat) {
                await pb.collection('exclusives').update(exSel.id, { estat: nuevoEstat }, { requestKey: `cs-exestat-${exSel.id}` });
            }

            // ── Actualizar retrabajos de esta unidad según el resultado ──
            const retrsUnidad = retrabajosMap[unidadSel] || [];
            const retrActivos = retrsUnidad.filter(r => ['pendiente', 'en_proceso', 'completado'].includes(r.estado));
            if (nuevoEstado === 'conforme' && retrActivos.length > 0) {
                // Aprobar retrabajos pendientes de revisión
                const now = new Date().toISOString();
                await Promise.all(retrActivos.map((r, i) =>
                    pb.collection('retrabajos').update(r.id, {
                        estado: 'aprobado',
                        fecha_aprobacion: now,
                        usuario_aprobacion: user?.id || undefined,
                    }, { requestKey: `cs-retr-aprob-${r.id}-${i}` }).catch(() => {})
                ));
                // Notificar a Admin / Super Admin
                try {
                    const admins = await pb.collection('users').getFullList({
                        filter: "rol = 'admin' || rol = 'superadmin'",
                        requestKey: `cs-aprob-notify-${Date.now()}`,
                    });
                    const titol = `Retrabajo aprobado en ${exSel.exclusiva} (unidad ${unidadSel})`;
                    const missatge = `Calidad aprobó el retrabajo${exSel.article ? ' · ' + exSel.article : ''}`;
                    await Promise.all(admins.map((a, i) =>
                        pb.collection('notifications').create({
                            destinatari: a.id, tipus: 'retrabajo_verificado', titol, missatge,
                            link_id: exSel.id, llegida: false,
                        }, { requestKey: `cs-aprob-notif-${i}-${Date.now()}` }).catch(() => {})
                    ));
                } catch (e) { console.error('Error notificando aprobación', e); }
            } else if (nuevoEstado === 'rechazada' && retrsUnidad.length > 0) {
                // Marcar retrabajos anteriores como rechazados
                await Promise.all(retrsUnidad.filter(r => r.estado !== 'rechazado').map((r, i) =>
                    pb.collection('retrabajos').update(r.id, { estado: 'rechazado' },
                        { requestKey: `cs-retr-rech-${r.id}-${i}` }).catch(() => {})
                ));
                // Notificar a Producción
                try {
                    const prods = await pb.collection('users').getFullList({
                        filter: "rol = 'produccio' || rol = 'admin' || rol = 'superadmin'",
                        requestKey: `cs-rech-notify-${Date.now()}`,
                    });
                    const titol = `Retrabajo rechazado en ${exSel.exclusiva} (unidad ${unidadSel})`;
                    const missatge = `Calidad rechazó nuevamente. Se requiere nuevo retrabajo${exSel.article ? ' · ' + exSel.article : ''}`;
                    await Promise.all(prods.map((a, i) =>
                        pb.collection('notifications').create({
                            destinatari: a.id, tipus: 'retrabajo_rechazado', titol, missatge,
                            link_id: exSel.id, llegida: false,
                        }, { requestKey: `cs-rech-notif-${i}-${Date.now()}` }).catch(() => {})
                    ));
                } catch (e) { console.error('Error notificando rechazo', e); }
            }

            // Notificación visual + beep
            playBeep(nuevoEstado === 'conforme');
            setNotif({ tipo: nuevoEstado, unidad: unidadSel, tiempo: tiempoSeg, msg: nuevoEstado === 'conforme' ? '¡Unidad conforme!' : 'Unidad rechazada' });

            // Si conforme, beep de completado cuando todas lo están
            if (nuevoEstado === 'conforme' && nuevaLista.every(u => u.estado === 'conforme') && !beepedRef.current) {
                beepedRef.current = true;
                setTimeout(() => playBeep(true), 500);
            }
        } catch (e) {
            console.error('Error guardando revisión', e);
            setNotif({ tipo: 'warn', unidad: unidadSel, msg: 'Error al guardar. Reintenta.' });
        } finally { setDesant(false); }
    };

    const siguienteUnidad = () => {
        if (unidadSel == null) return;
        // Buscar siguiente unidad pendiente o pendiente de revisión
        const siguiente = listaUnidades.find(u =>
            u.unidad_numero > unidadSel && (u.estado === 'pendiente' || u.estado === 'pendiente_revision')
        );
        if (siguiente) {
            abrirUnidad(siguiente.unidad_numero);
        } else {
            // Volver al listado
            cerrarDetalle();
        }
    };

    const cerrarDetalle = () => {
        stopCrono();
        setCronoSegons(0);
        setUnidadSel(null);
        setObsText('');
        setRechazadoFlag(false);
        setPuntosEstado(puntos.map(() => 'pendiente'));
        setNotif(null);
        setRevisando(false);
        setShowIncidenciaModal(null);
        carregaUnidades();
    };

    const volverBusqueda = () => {
        stopCrono();
        setCronoSegons(0);
        setExSel(null);
        setUnidadSel(null);
        setUnidades([]);
        setIncidenciasMap({});
        setRetrabajosMap({});
        setObsText('');
        setRechazadoFlag(false);
        setPuntosEstado([]);
        setNotif(null);
        setRevisando(false);
        setShowIncidenciaModal(null);
        setShowListoConfirm(false);
        beepedRef.current = false;
    };

    // ── Marcar unidad rechazada como resuelta → pendiente_revision ──
    const marcarResuelto = async () => {
        if (unidadSel == null) return;
        setDesantResolucion(true);
        try {
            const rec = await ensureRecord(unidadSel);
            const updated = await pb.collection('control_calidad').update(rec.id, {
                estado: 'pendiente_revision',
                fecha_resolucion: new Date().toISOString(),
                usuario_id: user?.id || undefined,
            }, { requestKey: `cs-res-${rec.id}-${Date.now()}` });
            setUnidades(prev => prev.map(u => u.id === rec.id ? updated : u));

            // Cerrar incidencias (no_conformitats) abiertas de esta unidad
            const incs = incidenciasMap[unidadSel] || [];
            for (const nc of incs) {
                if (nc.estat === 'oberta' || nc.estat === 'en_seguiment') {
                    pb.collection('no_conformitats').update(nc.id, { estat: 'tancada' },
                        { requestKey: `cs-nc-close-${nc.id}-${Date.now()}` }).catch(() => {});
                }
            }
            // Nota: los retrabajos los completa Producción desde su cola (estado → completado).
            // Aquí solo marcamos la unidad como pendiente de revisión para que Calidad re-revise.

            // Historial
            pb.collection('historial_control_calidad').create({
                exclusiva_id: exSel.id, unidad_numero: unidadSel, estado: 'pendiente_revision',
                observaciones: 'Incidencia/retrabajo marcado como resuelto',
                fecha: new Date().toISOString(), usuario_id: user?.id || undefined,
            }, { requestKey: `cs-hist-res-${exSel.id}-${unidadSel}-${Date.now()}` }).catch(() => {});

            // Recalcular estat exclusiva
            const nuevaLista = listaUnidades.map(u =>
                u.unidad_numero === unidadSel ? { ...u, estado: 'pendiente_revision' } : u
            );
            const nuevoEstat = computeExclusivaEstat(nuevaLista);
            if (nuevoEstat !== exSel.estat) {
                await pb.collection('exclusives').update(exSel.id, { estat: nuevoEstat }, { requestKey: `cs-exestat-res-${exSel.id}` });
            }

            setRevisando(false);
            stopCrono();
            playBeep(true);
            setNotif({ tipo: 'resuelto', unidad: unidadSel, msg: 'Marcado como resuelto. Listo para revisar nuevamente.' });
        } catch (e) {
            console.error('Error marcando resuelto', e);
            setNotif({ tipo: 'warn', unidad: unidadSel, msg: 'Error al marcar como resuelto. Reintenta.' });
        } finally { setDesantResolucion(false); }
    };

    // ── Revisar nuevamente: abre el checklist para re-revisión ──
    const revisarNuevamente = () => {
        if (unidadSel == null) return;
        setRevisando(true);
        setPuntosEstado(puntos.map(() => 'pendiente'));
        setObsText('');
        setRechazadoFlag(false);
        setNotif(null);
        const prevSegs = Number(unidadesMap[unidadSel]?.tiempo_revision_seg) || 0;
        setCronoSegons(prevSegs);
        tickCrono(prevSegs);
    };

    // ── Marcar exclusiva como listo para entregar ──
    const marcarListoParaEntregar = async () => {
        if (!exSel) return;
        setMarcandoListo(true);
        try {
            const now = new Date().toISOString();
            // 1. Actualizar estat de la exclusiva
            await pb.collection('exclusives').update(exSel.id, { estat: 'lista_recollida' },
                { requestKey: `cs-listo-${exSel.id}` });

            // 2. Actualizar fases externalizadas a listo_para_entregar
            try {
                const fases = await pb.collection('fases_externalizadas_exclusiva').getFullList({
                    filter: `exclusiva_id = "${exSel.id}"`,
                    requestKey: `cs-listo-fases-${exSel.id}`,
                }).catch(() => []);
                for (const f of fases) {
                    if (f.estado_fase !== 'entregado') {
                        pb.collection('fases_externalizadas_exclusiva').update(f.id, {
                            estado_fase: 'listo_para_entregar',
                            fecha_listo_entregar: now,
                        }, { requestKey: `cs-listo-fase-${f.id}-${Date.now()}` }).catch(() => {});
                    }
                }
            } catch (e) { console.error('Error actualizando fases', e); }

            // 3. Notificar a Admin / Super Admin
            try {
                const admins = await pb.collection('users').getFullList({
                    filter: "rol = 'admin' || rol = 'superadmin'",
                    requestKey: `cs-listo-notify-${exSel.id}`,
                });
                const titol = `Listo para entregar: ${exSel.exclusiva}`;
                const missatge = `${exSel.article || exSel.referencia || ''} · ${totalUnidades} unidades conformes`;
                await Promise.all(admins.map((a, i) =>
                    pb.collection('notifications').create({
                        destinatari: a.id, tipus: 'exclusiva_validada', titol, missatge,
                        link_id: exSel.id, llegida: false,
                    }, { requestKey: `cs-listo-notif-${i}-${Date.now()}` }).catch(() => {})
                ));
            } catch (e) { console.error('Error notificando', e); }

            playBeep(true);
            setShowListoConfirm(false);
            setNotif({ tipo: 'listo', msg: '¡Exclusiva marcada como listo para entregar!' });
            // Volver a búsqueda tras breve notificación
            setTimeout(() => volverBusqueda(), 1200);
        } catch (e) {
            console.error('Error marcando listo para entregar', e);
            setNotif({ tipo: 'warn', msg: 'Error al marcar como listo para entregar. Reintenta.' });
        } finally { setMarcandoListo(false); }
    };

    // ════════════════════════════════════════════════════════════════════
    // SCREEN 1: Búsqueda de exclusiva
    // ════════════════════════════════════════════════════════════════════
    if (!exSel) {
        return (
            <div>
                <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Buscar exclusiva para control de calidad</p>
                <div className="mb-5 relative max-w-2xl">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por número, referencia o mono..."
                        className="h-14 w-full rounded-2xl border-2 border-input bg-card pl-12 pr-10 text-lg" autoFocus />
                    {q && (
                        <button onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground hover:bg-secondary" aria-label="Limpiar">
                            <X className="h-5 w-5" />
                        </button>
                    )}
                </div>

                {/* Filtro por estado de calidad */}
                <div className="mb-5 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estado:</span>
                    {[
                        { id: 'todas', label: 'Todas' },
                        { id: 'calidad', label: 'Pendientes de calidad' },
                        { id: 'pendiente', label: 'Pendiente de control' },
                        { id: 'retrabajo', label: 'Retrabajo' },
                        { id: 'lista', label: 'Lista para recoger' },
                        { id: 'confeccion', label: 'En confección' },
                        { id: 'cerradas', label: 'Entregadas/Finalizadas' },
                    ].map(opt => (
                        <button key={opt.id} onClick={() => setFiltreQualitat(opt.id)}
                            className={`rounded-lg px-3 py-2 text-sm font-semibold transition active:scale-95 ${filtreQualitat === opt.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/70'}`}>
                            {opt.label}
                        </button>
                    ))}
                </div>

                {exFiltered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-card py-16 text-center">
                        <PackageCheck className="h-14 w-14 text-muted-foreground/30 mb-4" />
                        <p className="font-display text-2xl uppercase text-muted-foreground">{q ? 'Sin resultados' : 'Sin exclusivas para este filtro'}</p>
                        <p className="text-sm text-muted-foreground mt-1">{q ? `No hay coincidencias para "${q}".` : 'Cambia el filtro de estado o limpia la búsqueda para ver más exclusivas.'}</p>
                    </div>
                ) : (
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
                                            const retrasatEx = ex._retrasat;
                                            const dies = ex._diesEntrega;
                                            const express = isExpress(ex);
                                            const esCerrada = CLOSED_STATES.includes(ex._qualityState);
                                            const ptsEx = puntosByEx[ex.id] || [];
                                            const prioDot = (p) => p === 'alta' ? 'bg-destructive' : p === 'media' ? 'bg-[hsl(var(--warn))]' : p === 'baixa' ? 'bg-secondary' : 'bg-muted-foreground/40';
                                            return (
                                                <button key={ex.id} onClick={() => setExSel(ex)}
                                                    className={`relative overflow-hidden rounded-2xl border-2 bg-card p-5 text-left transition active:scale-[0.98] ${esCerrada ? 'border-primary/40 bg-primary/5' : retrasatEx ? 'border-destructive/60 bg-destructive/5' : express ? 'border-[hsl(var(--accent))]/60' : 'border-border hover:border-primary/50'}`}>
                                                    {express && !esCerrada && <div className="stripe-top absolute inset-x-0 top-0 h-1.5" />}
                                                    {esCerrada && <div className="absolute inset-x-0 top-0 h-1.5 bg-primary" />}
                                                    {esCerrada && (
                                                        <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-primary-foreground">
                                                            <PackageCheck className="h-3.5 w-3.5" /> {QUALITY_STATE[ex._qualityState]?.label || 'Cerrada'}
                                                        </div>
                                                    )}
                                                    <div className="flex items-start justify-between gap-2">
                                                        <p className={`font-display text-4xl uppercase leading-none ${esCerrada ? 'text-muted-foreground' : ''}`}>{ex.exclusiva}</p>
                                                        <div className="flex flex-col items-end gap-1">
                                                            {express && !esCerrada && (
                                                                <span className="flex items-center gap-1 rounded-md bg-[hsl(var(--accent))] px-2 py-1 text-xs font-bold text-white">
                                                                    <Zap className="h-3 w-3" /> EXPRESS
                                                                </span>
                                                            )}
                                                            {retrasatEx && !esCerrada && <AlertTriangle className="h-6 w-6 text-destructive shrink-0" />}
                                                        </div>
                                                    </div>
                                                    {ex.article && <p className={`mt-1.5 text-base font-semibold ${esCerrada ? 'text-muted-foreground' : ''}`}>{ex.article}</p>}
                                                    {ex.referencia && ex.referencia !== ex.article && <p className="text-xs text-muted-foreground">Ref: {ex.referencia}</p>}
                                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                                        <span className="rounded-lg bg-secondary px-2.5 py-1 text-sm font-bold tabular-nums">{ex.unitats || 0} unidades</span>
                                                        {ex._qualityState && (
                                                            <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold uppercase ${QUALITY_STATE[ex._qualityState]?.badge || ''}`} title={`Estado exclusiva: ${ex.estat || '—'}`}>
                                                                {QUALITY_STATE[ex._qualityState]?.label || ex.estat}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {ex.data_entrega && (
                                                        <div className={`mt-2 flex items-center gap-1.5 text-sm font-semibold ${retrasatEx ? 'text-destructive' : dies <= 2 ? 'text-[hsl(var(--warn))]' : 'text-muted-foreground'}`}>
                                                            <Calendar className="h-4 w-4" /> Entrega: {ex.data_entrega}
                                                            {retrasatEx ? ` · ${Math.abs(dies)}d retraso` : dies === 0 ? ' · hoy' : ` · ${dies}d`}
                                                        </div>
                                                    )}
                                                    {/* Puntos a revisar / incidencias frecuentes */}
                                                    <div className="mt-3 rounded-xl border border-border bg-background/60 p-3">
                                                        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                            <ListChecks className="h-3.5 w-3.5" /> Puntos a revisar
                                                        </p>
                                                        {ptsEx.length === 0 ? (
                                                            <p className="mt-1.5 text-xs text-muted-foreground">Sin puntos de revisión configurados.</p>
                                                        ) : (
                                                            <ul className="mt-1.5 space-y-1">
                                                                {ptsEx.slice(0, 4).map((p, i) => (
                                                                    <li key={i} className="flex items-center gap-2 text-xs">
                                                                        <span className={`h-2 w-2 shrink-0 rounded-full ${prioDot(p.prioritat)}`} title={`Prioridad: ${p.prioritat || '—'}`} />
                                                                        <span className="flex-1 truncate text-foreground">{p.descripcion}{p.obligatorio && <span className="ml-1 text-[10px] font-bold uppercase text-destructive">Oblig.</span>}</span>
                                                                        {p.apariciones > 0 && (
                                                                            <span className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold text-destructive" title={`${p.apariciones} aparición(es) en historial`}>×{p.apariciones}</span>
                                                                        )}
                                                                    </li>
                                                                ))}
                                                                {ptsEx.length > 4 && (
                                                                    <li className="text-[11px] font-semibold text-muted-foreground">+{ptsEx.length - 4} más…</li>
                                                                )}
                                                            </ul>
                                                        )}
                                                    </div>
                                                    <div className="mt-3 flex items-center justify-between">
                                                        <span className="text-xs text-muted-foreground">{(monosPerEx[ex.id] || []).length} monos</span>
                                                        <span className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-bold ${esCerrada ? 'bg-secondary text-secondary-foreground' : 'bg-primary text-primary-foreground'}`}>{esCerrada ? <>Ver detalle <Eye className="h-4 w-4" /></> : <>Inspeccionar <ChevronRight className="h-4 w-4" /></>}</span>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }

    // ════════════════════════════════════════════════════════════════════
    // SCREEN 3: Detalle de unidad (cronómetro + checklist)
    // ════════════════════════════════════════════════════════════════════
    if (unidadSel != null) {
        const rec = unidadesMap[unidadSel] || { estado: 'pendiente' };
        const progresoPct = totalUnidades > 0 ? Math.round((conformes / totalUnidades) * 100) : 0;
        const revisadosCount = puntosEstado.filter(e => e === 'revisado').length;
        const fallidosCount = puntosEstado.filter(e => e === 'fallido').length;

        return (
            <div className="grid gap-5">
                {/* Notificación resultado */}
                {notif && (
                    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={() => setNotif(null)}>
                        <div className="w-full max-w-md rounded-3xl bg-card p-8 text-center" onClick={e => e.stopPropagation()}>
                            {notif.tipo === 'conforme' || notif.tipo === 'listo' || notif.tipo === 'resuelto' ? (
                                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[hsl(var(--ok))]/15">
                                    {notif.tipo === 'listo' ? <PackageCheck className="h-12 w-12 text-[hsl(var(--ok))]" /> : notif.tipo === 'resuelto' ? <CheckCheck className="h-12 w-12 text-[hsl(var(--ok))]" /> : <CheckCircle2 className="h-12 w-12 text-[hsl(var(--ok))]" />}
                                </div>
                            ) : notif.tipo === 'rechazada' ? (
                                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-destructive/15">
                                    <XCircle className="h-12 w-12 text-destructive" />
                                </div>
                            ) : (
                                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[hsl(var(--warn))]/15">
                                    <AlertTriangle className="h-12 w-12 text-[hsl(var(--warn))]" />
                                </div>
                            )}
                            <p className={`mt-4 font-display text-3xl uppercase ${notif.tipo === 'conforme' || notif.tipo === 'listo' || notif.tipo === 'resuelto' ? 'text-[hsl(var(--ok))]' : notif.tipo === 'rechazada' ? 'text-destructive' : 'text-[hsl(var(--warn))]'}`}>
                                {notif.tipo === 'conforme' ? '✓ Conforme' : notif.tipo === 'listo' ? '✓ Listo para entregar' : notif.tipo === 'resuelto' ? '✓ Resuelto' : notif.tipo === 'rechazada' ? '✗ Rechazada' : 'Atención'}
                            </p>
                            <p className="mt-2 text-base text-muted-foreground">
                                {notif.unidad != null && <>Unidad <strong className="text-foreground">{notif.unidad}</strong>{notif.tiempo != null && <> · Tiempo: <strong className="text-foreground">{fmtSegons(notif.tiempo)}</strong></>}</>}
                            </p>
                            {notif.msg && <p className="mt-1 text-sm text-muted-foreground">{notif.msg}</p>}
                            <div className="mt-6 grid gap-3">
                                {notif.tipo === 'warn' ? (
                                    <button onClick={() => setNotif(null)} className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-primary text-lg font-bold text-primary-foreground active:scale-95">
                                        Revisar de nuevo
                                    </button>
                                ) : notif.tipo === 'resuelto' ? (
                                    <>
                                        <button onClick={revisarNuevamente} className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-primary text-lg font-bold text-primary-foreground active:scale-95">
                                            <RotateCcw className="h-6 w-6" /> Revisar nuevamente
                                        </button>
                                        <button onClick={cerrarDetalle} className="h-12 rounded-2xl bg-secondary font-semibold">Volver al listado</button>
                                    </>
                                ) : notif.tipo === 'listo' ? (
                                    <button onClick={() => setNotif(null)} className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-primary text-lg font-bold text-primary-foreground active:scale-95">
                                        Continuar
                                    </button>
                                ) : (
                                    <>
                                        <button onClick={siguienteUnidad} className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-primary text-lg font-bold text-primary-foreground active:scale-95">
                                            <ChevronRight className="h-6 w-6" /> Siguiente unidad
                                        </button>
                                        <button onClick={cerrarDetalle} className="h-12 rounded-2xl bg-secondary font-semibold">Volver al listado</button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Modal de fallo: ¿Retrabajo o solo incidencia? */}
                {falloModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={cancelarFallo}>
                        <div className="modal-card w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-3xl bg-card p-6" onClick={e => e.stopPropagation()}>
                            {falloMode === 'pregunta' && (
                                <>
                                    <div className="mb-4 flex items-center gap-3">
                                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/15">
                                            <AlertCircle className="h-8 w-8 text-destructive" />
                                        </div>
                                        <div>
                                            <p className="font-display text-2xl uppercase text-destructive">Punto fallido</p>
                                            <p className="text-sm text-muted-foreground">{falloModal.descripcion}</p>
                                        </div>
                                    </div>
                                    <p className="mb-5 text-base text-muted-foreground">¿Cómo quieres gestionar este fallo?</p>
                                    <div className="grid gap-3">
                                        <button onClick={() => setFalloMode('retrabajo')}
                                            className="flex h-20 items-center justify-center gap-3 rounded-2xl bg-destructive text-white text-lg font-bold active:scale-95 transition">
                                            <Wrench className="h-7 w-7" /> Retrabajo
                                        </button>
                                        <button onClick={() => setFalloMode('incidencia')}
                                            className="flex h-20 items-center justify-center gap-3 rounded-2xl bg-[hsl(var(--warn))] text-white text-lg font-bold active:scale-95 transition">
                                            <AlertTriangle className="h-7 w-7" /> Solo incidencia
                                        </button>
                                        <button onClick={cancelarFallo}
                                            className="flex h-14 items-center justify-center gap-2 rounded-2xl border-2 border-border bg-card text-base font-bold active:scale-95">
                                            Cancelar
                                        </button>
                                    </div>
                                </>
                            )}

                            {falloMode === 'retrabajo' && (
                                <>
                                    <h3 className="font-display text-2xl uppercase mb-1 flex items-center gap-2 text-destructive">
                                        <Wrench className="h-6 w-6" /> Crear retrabajo
                                    </h3>
                                    <p className="text-sm text-muted-foreground mb-4">Unidad <strong className="text-foreground">{unidadSel}</strong> · {falloModal.descripcion}</p>
                                    <div className="grid gap-4">
                                        <div>
                                            <label className="text-xs font-semibold uppercase text-muted-foreground">Descripción del retrabajo *</label>
                                            <textarea value={retrDesc} onChange={e => setRetrDesc(e.target.value)} rows={3} placeholder="Describe el defecto y qué hay que corregir..."
                                                className="mt-1 w-full rounded-xl border border-input bg-background p-3 text-base resize-none" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-xs font-semibold uppercase text-muted-foreground">Tiempo estimado (min)</label>
                                                <input type="number" min="0" step="1" value={retrTiempo} onChange={e => setRetrTiempo(e.target.value)} placeholder="Ej. 15"
                                                    className="mt-1 h-12 w-full rounded-xl border border-input bg-background px-3 text-base" />
                                            </div>
                                            <div>
                                                <label className="text-xs font-semibold uppercase text-muted-foreground">Prioridad</label>
                                                <select value={retrPrioridad} onChange={e => setRetrPrioridad(e.target.value)}
                                                    className="mt-1 h-12 w-full rounded-xl border border-input bg-background px-3 text-base">
                                                    <option value="baja">Baja</option>
                                                    <option value="media">Media</option>
                                                    <option value="alta">Alta</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-xs font-semibold uppercase text-muted-foreground">Fase a retrabajar</label>
                                            <select value={retrFase} onChange={e => setRetrFase(e.target.value)}
                                                className="mt-1 h-12 w-full rounded-xl border border-input bg-background px-3 text-base">
                                                <option value="">Sin fase concreta</option>
                                                {opsRuta.map(op => (
                                                    <option key={op.id} value={op.codi ? `${op.codi} — ${op.nom}` : op.nom}>
                                                        {op.codi ? `${op.codi} — ` : ''}{op.nom}{op.fase ? ` (${op.fase})` : ''}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center gap-2">
                                            <AlertCircle className="h-4 w-4 shrink-0" />
                                            Se creará incidencia + retrabajo, se notificará a producción y la unidad quedará rechazada.
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <button onClick={() => setFalloMode('pregunta')} disabled={desantFallo}
                                                className="h-14 rounded-2xl bg-secondary font-bold disabled:opacity-50">Cancelar</button>
                                            <button onClick={crearRetrabajo} disabled={desantFallo || !retrDesc.trim()}
                                                className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-destructive text-white font-bold active:scale-95 disabled:opacity-50">
                                                <Wrench className="h-5 w-5" /> {desantFallo ? 'Creando...' : 'Crear retrabajo'}
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}

                            {falloMode === 'incidencia' && (
                                <>
                                    <h3 className="font-display text-2xl uppercase mb-1 flex items-center gap-2 text-[hsl(var(--warn))]">
                                        <AlertTriangle className="h-6 w-6" /> Solo incidencia
                                    </h3>
                                    <p className="text-sm text-muted-foreground mb-4">Unidad <strong className="text-foreground">{unidadSel}</strong> · {falloModal.descripcion}</p>
                                    <div className="grid gap-4">
                                        <div>
                                            <label className="text-xs font-semibold uppercase text-muted-foreground">Tipo</label>
                                            <select value={incTipo} onChange={e => setIncTipo(e.target.value)}
                                                className="mt-1 h-12 w-full rounded-xl border border-input bg-background px-3 text-base">
                                                <option value="Defecto">Defecto</option>
                                                <option value="Propuesta de mejora">Propuesta de mejora</option>
                                                <option value="Acción preventiva">Acción preventiva</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs font-semibold uppercase text-muted-foreground">Descripción de incidencia *</label>
                                            <textarea value={incDesc} onChange={e => setIncDesc(e.target.value)} rows={2} placeholder="Describe la incidencia..."
                                                className="mt-1 w-full rounded-xl border border-input bg-background p-3 text-base resize-none" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-semibold uppercase text-muted-foreground">Observaciones</label>
                                            <textarea value={incObs} onChange={e => setIncObs(e.target.value)} rows={2} placeholder="Observaciones adicionales..."
                                                className="mt-1 w-full rounded-xl border border-input bg-background p-3 text-base resize-none" />
                                        </div>
                                        <PhotoPicker
                                            files={incFotos}
                                            onAdd={(fs) => setIncFotos(prev => [...prev, ...fs].slice(0, 8))}
                                            onRemove={(i) => setIncFotos(prev => prev.filter((_, j) => j !== i))}
                                            exclusivaId={exSel?.id}
                                            maxFiles={8}
                                            maxSizeMB={10}
                                            label="Hacer fotos"
                                            hint="Arrastra fotos o usa la cámara"
                                            className="mt-1"
                                        />
                                        <div className="grid grid-cols-2 gap-3">
                                            <button onClick={() => setFalloMode('pregunta')} disabled={desantFallo}
                                                className="h-14 rounded-2xl bg-secondary font-bold disabled:opacity-50">Cancelar</button>
                                            <button onClick={guardarIncidencia} disabled={desantFallo || !incDesc.trim()}
                                                className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-[hsl(var(--warn))] text-white font-bold active:scale-95 disabled:opacity-50">
                                                <AlertTriangle className="h-5 w-5" /> {desantFallo ? 'Guardando...' : 'Guardar incidencia'}
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* Header */}
                <div className="rounded-2xl border-2 border-border bg-card p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                        <div className="flex items-center gap-3">
                            <button onClick={cerrarDetalle} className="flex h-12 items-center gap-1.5 rounded-xl border border-border px-4 text-base font-semibold hover:bg-secondary active:scale-95">
                                <ArrowLeft className="h-5 w-5" /> Volver
                            </button>
                            <div>
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">{exSel.exclusiva} · Unidad</p>
                                <p className="font-display text-5xl sm:text-6xl uppercase leading-none tabular-nums">{unidadSel}</p>
                            </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                            <span className={`rounded-lg px-3 py-1.5 text-sm font-bold uppercase ${ESTADO_BADGE[rec.estado] || ESTADO_BADGE.pendiente}`}>{ESTADO_LABEL[rec.estado] || 'Pendiente'}</span>
                            <span className="text-xs text-muted-foreground">{conformes}/{totalUnidades} conformes · {progresoPct}%</span>
                        </div>
                    </div>

                    {/* Cronómetro grande (solo cuando se está revisando) */}
                    {revisando && (
                    <div className="rounded-2xl bg-primary/10 p-5 text-center">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Tiempo de revisión</p>
                        <p className={`font-display text-6xl sm:text-7xl tabular-nums leading-none ${cronoRunning ? 'text-primary' : 'text-muted-foreground'}`}>
                            {fmtSegons(cronoSegons)}
                        </p>
                        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                            {!cronoRunning && cronoSegons === 0 && (
                                <button onClick={() => tickCrono(0)} className="flex h-14 min-w-[140px] items-center justify-center gap-2 rounded-2xl bg-primary text-lg font-bold text-primary-foreground active:scale-95">
                                    <Play className="h-6 w-6" /> Iniciar
                                </button>
                            )}
                            {cronoRunning ? (
                                <button onClick={pauseCrono} className="flex h-14 min-w-[140px] items-center justify-center gap-2 rounded-2xl border-2 border-[hsl(var(--warn))] bg-[hsl(var(--warn))]/10 text-[hsl(var(--warn))] text-lg font-bold active:scale-95">
                                    <Pause className="h-6 w-6" /> Pausar
                                </button>
                            ) : cronoSegons > 0 && (
                                <button onClick={resumeCrono} className="flex h-14 min-w-[140px] items-center justify-center gap-2 rounded-2xl border-2 border-[hsl(var(--ok))] bg-[hsl(var(--ok))]/10 text-[hsl(var(--ok))] text-lg font-bold active:scale-95">
                                    <Play className="h-6 w-6" /> Reanudar
                                </button>
                            )}
                            <div className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                                <Clock className="h-4 w-4" />
                                {cronoRunning ? 'En curso' : cronoSegons > 0 ? 'Pausado' : 'Sin iniciar'}
                            </div>
                        </div>
                    </div>
                    )}
                </div>

                {/* ── Vista de revisión (checklist) — solo cuando se está revisando ── */}
                {revisando && (
                <>
                {/* Checklist de puntos */}
                <div className="rounded-2xl border-2 border-border bg-card p-5">
                    <div className="mb-4 flex items-center justify-between gap-2">
                        <p className="flex items-center gap-2 font-display text-2xl uppercase"><ListChecks className="h-6 w-6 text-primary" /> Puntos a revisar</p>
                        <div className="text-sm font-semibold">
                            <span className="text-[hsl(var(--ok))]">{revisadosCount} ✓</span>
                            {fallidosCount > 0 && <span className="ml-2 text-destructive">{fallidosCount} ✗</span>}
                            <span className="ml-2 text-muted-foreground">/ {puntos.length}</span>
                        </div>
                    </div>

                    {puntos.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground text-sm">No hay puntos definidos para este artículo.</p>
                    ) : (
                        <div className="grid gap-2.5">
                            {puntos.map((p, idx) => {
                                const est = puntosEstado[idx] || 'pendiente';
                                const bg = est === 'fallido' ? 'border-destructive/50 bg-destructive/5' : est === 'revisado' ? 'border-[hsl(var(--ok))]/50 bg-[hsl(var(--ok))]/5' : 'border-border bg-background';
                                return (
                                    <div key={idx} className={`rounded-xl border-2 p-3 ${bg}`}>
                                        <div className="flex flex-wrap items-center gap-3">
                                            <button
                                                onClick={() => togglePunto(idx)}
                                                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 transition active:scale-90 ${est === 'revisado' ? 'border-[hsl(var(--ok))] bg-[hsl(var(--ok))] text-white' : est === 'fallido' ? 'border-destructive bg-destructive text-white' : 'border-border text-transparent'}`}
                                                aria-label={p.descripcion}>
                                                {est === 'revisado' ? <CheckCircle2 className="h-6 w-6" /> : est === 'fallido' ? <XCircle className="h-6 w-6" /> : null}
                                            </button>
                                            <p className="flex-1 min-w-[140px] text-base font-semibold">
                                                {p.descripcion}
                                                {p.obligatorio && <span className="ml-2 rounded bg-destructive/15 px-1.5 py-0.5 text-xs font-bold uppercase text-destructive">Oblig.</span>}
                                            </p>
                                            <div className="flex gap-2">
                                                <button onClick={() => setPuntoRevisado(idx)} disabled={est === 'revisado'}
                                                    className="flex h-11 items-center gap-1.5 rounded-lg border-2 border-[hsl(var(--ok))] px-3 text-sm font-bold text-[hsl(var(--ok))] active:scale-95 disabled:opacity-40 disabled:bg-[hsl(var(--ok))]/10">
                                                    <CheckCircle2 className="h-5 w-5" /> OK
                                                </button>
                                                <button onClick={() => setPuntoFallido(idx)} disabled={est === 'fallido'}
                                                    className="flex h-11 items-center gap-1.5 rounded-lg border-2 border-destructive px-3 text-sm font-bold text-destructive active:scale-95 disabled:opacity-40 disabled:bg-destructive/10">
                                                    <XCircle className="h-5 w-5" /> Fallo
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Observaciones + rechazado */}
                    <div className="mt-4 grid gap-3">
                        <label className="flex items-center gap-3 rounded-xl border-2 border-border bg-background p-3 cursor-pointer">
                            <input type="checkbox" checked={rechazadoFlag} onChange={e => setRechazadoFlag(e.target.checked)} className="h-6 w-6 rounded border-border accent-destructive" />
                            <span className="text-base font-semibold text-destructive">Marcar como rechazado</span>
                        </label>
                        <div>
                            <label className="text-xs font-semibold uppercase text-muted-foreground">Observaciones</label>
                            <textarea value={obsText} onChange={e => setObsText(e.target.value)} rows={3} placeholder="Observaciones de la revisión..."
                                className="mt-1 w-full rounded-xl border border-input bg-background p-3 text-base resize-none" />
                        </div>
                    </div>
                </div>

                {/* Botones grandes Conforme / Rechazar */}
                <div className="sticky bottom-0 z-20 -mx-5 px-5 py-4 bg-background/95 backdrop-blur border-t border-border">
                    {obligatoriosPendientes > 0 && (
                        <p className="mb-2 text-center text-xs font-semibold text-[hsl(var(--warn))]">⚠ {obligatoriosPendientes} punto(s) obligatorio(s) sin revisar</p>
                    )}
                    <div className="flex flex-wrap gap-3">
                        <button onClick={cerrarDetalle} disabled={desant}
                            className="flex h-16 flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-border bg-card text-lg font-bold active:scale-95 disabled:opacity-50">
                            <ArrowLeft className="h-6 w-6" /> Volver
                        </button>
                        <button onClick={() => guardarRevision('rechazada')} disabled={desant}
                            className="flex h-16 flex-1 items-center justify-center gap-2 rounded-2xl bg-destructive text-white text-lg font-bold active:scale-95 disabled:opacity-50">
                            <XCircle className="h-7 w-7" /> {desant ? 'Guardando...' : 'Rechazar'}
                        </button>
                        <button onClick={() => guardarRevision('conforme')} disabled={desant}
                            className="flex h-16 flex-[2] items-center justify-center gap-2 rounded-2xl bg-[hsl(var(--ok))] text-white text-lg font-bold active:scale-95 disabled:opacity-50">
                            <CheckCircle2 className="h-7 w-7" /> {desant ? 'Guardando...' : 'Conforme'}
                        </button>
                    </div>
                </div>
                </>
                )}

                {/* ── Vista: Rechazada - Pendiente resolución ── */}
                {!revisando && rec.estado === 'rechazada' && (() => {
                    const incs = incidenciasMap[unidadSel] || [];
                    const retrs = retrabajosMap[unidadSel] || [];
                    const tieneFotos = incs.some(nc => Array.isArray(nc.fotos) && nc.fotos.length > 0);
                    return (
                        <div className="grid gap-4">
                            <div className="rounded-2xl border-2 border-destructive/50 bg-destructive/5 p-5">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/15">
                                        <XCircle className="h-8 w-8 text-destructive" />
                                    </div>
                                    <div>
                                        <p className="font-display text-2xl uppercase text-destructive">Rechazada</p>
                                        <p className="text-sm text-muted-foreground">Pendiente resolución</p>
                                    </div>
                                </div>
                                <p className="text-sm text-muted-foreground">Esta unidad tiene incidencias/retrabajos pendientes. Una vez resuelto, márcalo para volver a revisar.</p>
                            </div>

                            {/* Incidencias */}
                            {incs.length > 0 && (
                                <div className="rounded-2xl border-2 border-border bg-card p-5">
                                    <p className="font-display text-xl uppercase mb-3 flex items-center gap-2 text-destructive"><AlertTriangle className="h-5 w-5" /> Incidencias ({incs.length})</p>
                                    <div className="grid gap-3">
                                        {incs.map(nc => {
                                            const fotos = Array.isArray(nc.fotos) ? nc.fotos : (nc.fotos ? [nc.fotos] : []);
                                            return (
                                                <div key={nc.id} className="rounded-xl border border-border p-3">
                                                    <div className="flex flex-wrap items-center gap-2 mb-1">
                                                        <span className="font-mono font-bold text-sm">{nc.codi || '—'}</span>
                                                        <span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${nc.prioritat === 'alta' ? 'bg-destructive/15 text-destructive' : nc.prioritat === 'media' ? 'bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))]' : 'bg-secondary text-muted-foreground'}`}>{nc.prioritat || '—'}</span>
                                                        <span className="rounded bg-destructive/10 px-2 py-0.5 text-xs font-semibold uppercase text-destructive">{nc.resultat_checklist || '—'}</span>
                                                        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${nc.estat === 'tancada' ? 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]' : 'bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))]'}`}>{nc.estat || 'oberta'}</span>
                                                    </div>
                                                    <p className="text-sm">{nc.descripcio || '—'}</p>
                                                    {nc.punt_checklist && <p className="mt-1 text-xs text-muted-foreground">Punto: {nc.punt_checklist}</p>}
                                                    {fotos.length > 0 && (
                                                        <div className="mt-2 flex flex-wrap gap-2">
                                                            {fotos.slice(0, 4).map((f, i) => (
                                                                <img key={i} src={pb.files.getURL({ collectionId: nc.collectionId, id: nc.id }, f, { thumb: '120x120' })} alt={`Foto ${i+1}`} className="h-16 w-16 rounded-lg border border-border object-cover" loading="lazy" />
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Retrabajos */}
                            {retrs.length > 0 && (
                                <div className="rounded-2xl border-2 border-border bg-card p-5">
                                    <p className="font-display text-xl uppercase mb-3 flex items-center gap-2 text-[hsl(var(--warn))]"><Wrench className="h-5 w-5" /> Retrabajos ({retrs.length})</p>
                                    <div className="grid gap-3">
                                        {retrs.map(r => (
                                            <div key={r.id} className="rounded-xl border border-border p-3">
                                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                                    <span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${r.estado === 'completado' ? 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]' : r.estado === 'en_proceso' ? 'bg-blue-100 text-blue-700' : 'bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))]'}`}>{r.estado || 'pendiente'}</span>
                                                    {r.prioridad && <span className="rounded bg-secondary px-2 py-0.5 text-xs font-semibold uppercase">{r.prioridad}</span>}
                                                    {r.temps_estimat_min && <span className="text-xs text-muted-foreground">~{r.temps_estimat_min}min</span>}
                                                </div>
                                                <p className="text-sm">{r.motivo_rechazo || r.operacion_original || '—'}</p>
                                                {r.punt_checklist && <p className="mt-1 text-xs text-muted-foreground">Punto: {r.punt_checklist}</p>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Botones de acción */}
                                <div className="sticky bottom-0 z-20 -mx-5 px-5 py-4 bg-background/95 backdrop-blur border-t border-border">
                                    <div className="flex flex-wrap gap-3">
                                        <button onClick={cerrarDetalle}
                                            className="flex h-16 flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-border bg-card text-lg font-bold active:scale-95">
                                            <ArrowLeft className="h-6 w-6" /> Volver
                                        </button>
                                        {tieneFotos && (
                                            <button onClick={() => setShowIncidenciaModal(unidadSel)}
                                                className="flex h-16 flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-primary/50 text-primary text-lg font-bold active:scale-95">
                                                <Eye className="h-6 w-6" /> Ver fotos
                                            </button>
                                        )}
                                        <button onClick={marcarResuelto} disabled={desantResolucion}
                                            className="flex h-16 flex-[2] items-center justify-center gap-2 rounded-2xl bg-[hsl(var(--ok))] text-white text-lg font-bold active:scale-95 disabled:opacity-50">
                                            <CheckCheck className="h-7 w-7" /> {desantResolucion ? 'Guardando...' : 'Marcar como resuelto'}
                                        </button>
                                    </div>
                                </div>
                        </div>
                    );
                })()}

                {/* ── Vista: Pendiente revisión ── */}
                {!revisando && rec.estado === 'pendiente_revision' && (
                    <div className="grid gap-4">
                        <div className="rounded-2xl border-2 border-[hsl(var(--warn))]/50 bg-[hsl(var(--warn))]/5 p-5">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[hsl(var(--warn))]/15">
                                    <RotateCcw className="h-8 w-8 text-[hsl(var(--warn))]" />
                                </div>
                                <div>
                                    <p className="font-display text-2xl uppercase text-[hsl(var(--warn))]">Pendiente revisión</p>
                                    <p className="text-sm text-muted-foreground">Incidencia/retrabajo resuelto</p>
                                </div>
                            </div>
                            <p className="text-sm text-muted-foreground">La incidencia ha sido marcada como resuelta. Revisa nuevamente la unidad para confirmar que todo está correcto.</p>
                        </div>

                        <div className="sticky bottom-0 z-20 -mx-5 px-5 py-4 bg-background/95 backdrop-blur border-t border-border">
                            <div className="flex flex-wrap gap-3">
                                <button onClick={cerrarDetalle}
                                    className="flex h-16 flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-border bg-card text-lg font-bold active:scale-95">
                                    <ArrowLeft className="h-6 w-6" /> Volver
                                </button>
                                <button onClick={revisarNuevamente}
                                    className="flex h-16 flex-[2] items-center justify-center gap-2 rounded-2xl bg-primary text-white text-lg font-bold active:scale-95">
                                    <RotateCcw className="h-7 w-7" /> Revisar nuevamente
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Vista: Conforme ── */}
                {!revisando && rec.estado === 'conforme' && (
                    <div className="grid gap-4">
                        <div className="rounded-2xl border-2 border-[hsl(var(--ok))]/50 bg-[hsl(var(--ok))]/5 p-5 text-center">
                            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[hsl(var(--ok))]/15 mb-3">
                                <CheckCircle2 className="h-12 w-12 text-[hsl(var(--ok))]" />
                            </div>
                            <p className="font-display text-3xl uppercase text-[hsl(var(--ok))]">✓ Conforme</p>
                            {rec.tiempo_revision_seg != null && <p className="mt-2 text-sm text-muted-foreground">Tiempo de revisión: <strong className="text-foreground">{fmtSegons(rec.tiempo_revision_seg)}</strong></p>}
                            {rec.observaciones && <p className="mt-2 text-sm text-muted-foreground">{rec.observaciones}</p>}
                        </div>

                        <div className="sticky bottom-0 z-20 -mx-5 px-5 py-4 bg-background/95 backdrop-blur border-t border-border">
                            <div className="flex flex-wrap gap-3">
                                <button onClick={cerrarDetalle}
                                    className="flex h-16 flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-border bg-card text-lg font-bold active:scale-95">
                                    <ArrowLeft className="h-6 w-6" /> Volver al listado
                                </button>
                                <button onClick={siguienteUnidad}
                                    className="flex h-16 flex-[2] items-center justify-center gap-2 rounded-2xl bg-primary text-white text-lg font-bold active:scale-95">
                                    <ChevronRight className="h-7 w-7" /> Siguiente unidad
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Modal: Ver fotos de incidencia ── */}
                {showIncidenciaModal != null && (() => {
                    const incs = incidenciasMap[showIncidenciaModal] || [];
                    const allFotos = incs.flatMap(nc => (Array.isArray(nc.fotos) ? nc.fotos : (nc.fotos ? [nc.fotos] : [])).map(f => ({ f, nc })));
                    return (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setShowIncidenciaModal(null)}>
                            <div className="modal-card w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-3xl bg-card p-6" onClick={e => e.stopPropagation()}>
                                <div className="mb-4 flex items-center justify-between gap-2">
                                    <p className="font-display text-2xl uppercase flex items-center gap-2"><ImageIcon className="h-6 w-6" /> Fotos de incidencia · Unidad {showIncidenciaModal}</p>
                                    <button onClick={() => setShowIncidenciaModal(null)} className="rounded-lg p-2 hover:bg-secondary"><X className="h-5 w-5" /></button>
                                </div>
                                {allFotos.length === 0 ? (
                                    <p className="text-center text-muted-foreground py-8">Sin fotos.</p>
                                ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                        {allFotos.map(({ f, nc }, i) => (
                                            <a key={i} href={pb.files.getURL({ collectionId: nc.collectionId, id: nc.id }, f)} target="_blank" rel="noopener noreferrer" className="block">
                                                <img src={pb.files.getURL({ collectionId: nc.collectionId, id: nc.id }, f, { thumb: '400x400' })} alt={`Foto ${i+1}`} className="w-full aspect-square rounded-xl border border-border object-cover" loading="lazy" />
                                            </a>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })()}
            </div>
        );
    }

    // ════════════════════════════════════════════════════════════════════
    // SCREEN 2: Listado de unidades
    // ════════════════════════════════════════════════════════════════════
    const progresoPct = totalUnidades > 0 ? Math.round((conformes / totalUnidades) * 100) : 0;
    const esCerrada = CLOSED_STATES.includes(exSel?._qualityState) || CLOSED_STATES.includes(exSel?.estat);
    const cerradaLabel = QUALITY_STATE[exSel?._qualityState]?.label || (exSel?.estat === 'finalitzada' ? 'Finalizada' : exSel?.estat === 'desapareguda' ? 'Desaparecida' : 'Entregada');

    return (
        <div className="grid gap-5">
            {/* Banner consulta (entregada/finalizada/desaparecida) */}
            {esCerrada && (
                <div className="flex items-center gap-3 rounded-2xl border-2 border-primary/40 bg-primary/5 p-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15">
                        <PackageCheck className="h-7 w-7 text-primary" />
                    </div>
                    <div>
                        <p className="font-display text-2xl uppercase text-primary">{cerradaLabel}</p>
                        <p className="text-sm text-muted-foreground">Esta exclusiva está cerrada. Los datos se muestran en modo consulta, sin acciones activas de control.</p>
                    </div>
                </div>
            )}
            {/* Header */}
            <div className="rounded-2xl border-2 border-border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                        <button onClick={volverBusqueda} className="flex h-12 items-center gap-1.5 rounded-xl border border-border px-4 text-base font-semibold hover:bg-secondary active:scale-95">
                            <ArrowLeft className="h-5 w-5" /> Volver
                        </button>
                        <div>
                            <p className="font-display text-4xl sm:text-5xl uppercase leading-none">{exSel.exclusiva}</p>
                            {exSel.article && <p className="mt-1 text-base font-semibold">{exSel.article}</p>}
                            {exSel.referencia && exSel.referencia !== exSel.article && <p className="text-sm text-muted-foreground">Ref: {exSel.referencia}</p>}
                        </div>
                    </div>
                    <button onClick={carregaUnidades} className="flex h-11 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-secondary active:scale-95">
                        <RefreshCcw className="h-4 w-4" /> Actualizar
                    </button>
                </div>

                {/* Big progress display */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-2xl bg-primary/10 px-4 py-3 text-center">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
                        <p className="font-display text-4xl sm:text-5xl text-primary tabular-nums">{totalUnidades}</p>
                    </div>
                    <div className="rounded-2xl bg-[hsl(var(--ok))]/10 px-4 py-3 text-center">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Conformes</p>
                        <p className="font-display text-4xl sm:text-5xl text-[hsl(var(--ok))] tabular-nums">{conformes}</p>
                    </div>
                    <div className="rounded-2xl bg-destructive/10 px-4 py-3 text-center">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Rechazadas</p>
                        <p className="font-display text-4xl sm:text-5xl text-destructive tabular-nums">{rechazadas}</p>
                    </div>
                    <div className="rounded-2xl bg-[hsl(var(--warn))]/10 px-4 py-3 text-center">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Pend. revisión</p>
                        <p className="font-display text-4xl sm:text-5xl text-[hsl(var(--warn))] tabular-nums">{pendientesRevision}</p>
                    </div>
                </div>

                {/* Big progress bar */}
                <div className="mt-4">
                    <div className="flex items-center justify-between text-base font-semibold mb-2">
                        <span>{conformes} de {totalUnidades} conformes</span>
                        <span className={todasConformes ? 'text-[hsl(var(--ok))]' : 'text-muted-foreground'}>{progresoPct}%</span>
                    </div>
                    <div className="h-5 w-full rounded-full bg-secondary overflow-hidden flex">
                        <div className="h-full bg-[hsl(var(--ok))] transition-all" style={{ width: `${(conformes / Math.max(1, totalUnidades)) * 100}%` }} />
                        <div className="h-full bg-destructive transition-all" style={{ width: `${(rechazadas / Math.max(1, totalUnidades)) * 100}%` }} />
                        <div className="h-full bg-[hsl(var(--warn))] transition-all" style={{ width: `${(pendientesRevision / Math.max(1, totalUnidades)) * 100}%` }} />
                    </div>
                    {todasConformes ? (
                        <p className="mt-2 flex items-center gap-1.5 text-base font-bold text-[hsl(var(--ok))]"><PackageCheck className="h-5 w-5" /> Todas las unidades conformes — listo para entregar</p>
                    ) : rechazadas > 0 ? (
                        <p className="mt-2 flex items-center gap-1.5 text-base font-bold text-destructive"><AlertTriangle className="h-5 w-5" /> {rechazadas} rechazada(s) — pendiente resolución</p>
                    ) : pendientesRevision > 0 ? (
                        <p className="mt-2 flex items-center gap-1.5 text-base font-bold text-[hsl(var(--warn))]"><RotateCcw className="h-5 w-5" /> {pendientesRevision} unidad(es) pendiente(s) de re-revisión</p>
                    ) : (
                        <p className="mt-2 text-sm text-muted-foreground">Toca "Revisar" para inspeccionar cada unidad.</p>
                    )}
                </div>
            </div>

            {/* Units list — big touch cards with state-aware buttons */}
            {carregant ? (
                <div className="grid gap-3">{[0,1,2].map(i => <div key={i} className="h-28 animate-pulse rounded-2xl bg-secondary" />)}</div>
            ) : totalUnidades === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-border bg-card p-10 text-center text-muted-foreground">Esta exclusiva no tiene unidades.</div>
            ) : (
                <div className="grid gap-3">
                    {listaUnidades.map(u => {
                        const bg = u.estado === 'rechazada' ? 'border-destructive/50 bg-destructive/5' : u.estado === 'conforme' ? 'border-[hsl(var(--ok))]/50 bg-[hsl(var(--ok))]/5' : u.estado === 'pendiente_revision' ? 'border-[hsl(var(--warn))]/50 bg-[hsl(var(--warn))]/5' : 'border-border bg-card';
                        const tiempoRev = u.tiempo_revision_seg ? fmtSegons(u.tiempo_revision_seg) : null;
                        const incs = incidenciasMap[u.unidad_numero] || [];
                        const retrs = retrabajosMap[u.unidad_numero] || [];
                        const totalInc = incs.length + retrs.length;
                        const btnLabel = esCerrada ? 'Ver detalle' : u.estado === 'conforme' ? 'Ver detalle' : u.estado === 'rechazada' ? 'Resolver' : u.estado === 'pendiente_revision' ? 'Revisar' : 'Revisar';
                        const btnIcon = esCerrada || u.estado === 'conforme' ? <Eye className="h-6 w-6" /> : u.estado === 'rechazada' ? <Wrench className="h-6 w-6" /> : u.estado === 'pendiente_revision' ? <RotateCcw className="h-6 w-6" /> : <ListChecks className="h-6 w-6" />;
                        const btnCls = esCerrada || u.estado === 'conforme' ? 'bg-secondary text-secondary-foreground' : u.estado === 'rechazada' ? 'bg-destructive text-white' : u.estado === 'pendiente_revision' ? 'bg-[hsl(var(--warn))] text-white' : 'bg-primary text-white';
                        return (
                            <div key={u.unidad_numero} className={`rounded-2xl border-2 p-4 ${bg}`}>
                                <div className="flex flex-wrap items-center gap-4">
                                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-background border-2 border-border">
                                        <span className="font-display text-4xl tabular-nums">{u.unidad_numero}</span>
                                    </div>
                                    <div className="flex-1 min-w-[120px]">
                                        <span className={`rounded-lg px-3 py-1.5 text-sm font-bold uppercase ${ESTADO_BADGE[u.estado] || ESTADO_BADGE.pendiente}`}>{ESTADO_LABEL[u.estado] || 'Pendiente'}</span>
                                        {u.estado === 'conforme' && <CheckCircle2 className="inline-block ml-2 h-5 w-5 text-[hsl(var(--ok))]" />}
                                        {u.estado === 'rechazada' && <XCircle className="inline-block ml-2 h-5 w-5 text-destructive" />}
                                        {u.estado === 'pendiente_revision' && <RotateCcw className="inline-block ml-2 h-5 w-5 text-[hsl(var(--warn))]" />}
                                        {tiempoRev && <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" /> {tiempoRev}</span>}
                                        {totalInc > 0 && (
                                            <span className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-destructive">
                                                <AlertTriangle className="h-3.5 w-3.5" /> {totalInc} incidencia(s)
                                            </span>
                                        )}
                                        {u.observaciones && <p className="mt-1 text-xs text-muted-foreground truncate max-w-xs">{u.observaciones}</p>}
                                    </div>
                                    <button
                                        onClick={() => { abrirUnidad(u.unidad_numero); if (esCerrada) setRevisando(false); }}
                                        className={`flex h-[60px] min-w-[140px] items-center justify-center gap-2 rounded-2xl text-lg font-bold active:scale-95 transition ${btnCls}`}>
                                        {btnIcon} {btnLabel}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Bottom action: Listo para entregar when all conforme, else Volver */}
            <div className="sticky bottom-0 z-20 -mx-5 px-5 py-4 bg-background/95 backdrop-blur border-t border-border">
                {todasConformes && !esCerrada ? (
                    <div className="grid gap-3">
                        <button onClick={() => setShowListoConfirm(true)} disabled={marcandoListo}
                            className="flex h-16 w-full items-center justify-center gap-2 rounded-2xl bg-[hsl(var(--ok))] text-white text-lg font-bold active:scale-95 disabled:opacity-50">
                            <PackageCheck className="h-7 w-7" /> Marcar como listo para entregar
                        </button>
                        <button onClick={volverBusqueda} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-border bg-card font-semibold active:scale-95">
                            <ArrowLeft className="h-5 w-5" /> Volver a búsqueda
                        </button>
                    </div>
                ) : (
                    <button onClick={volverBusqueda} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-border bg-card text-lg font-bold active:scale-95">
                        <ArrowLeft className="h-6 w-6" /> Volver a búsqueda
                    </button>
                )}
            </div>

            {/* Modal confirmación: Listo para entregar */}
            {showListoConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => !marcandoListo && setShowListoConfirm(false)}>
                    <div className="modal-card w-full max-w-md rounded-3xl bg-card p-8 text-center" onClick={e => e.stopPropagation()}>
                        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[hsl(var(--ok))]/15 mb-3">
                            <PackageCheck className="h-12 w-12 text-[hsl(var(--ok))]" />
                        </div>
                        <p className="font-display text-3xl uppercase text-[hsl(var(--ok))]">¿Listo para entregar?</p>
                        <p className="mt-2 text-base text-muted-foreground">
                            Todas las <strong className="text-foreground">{totalUnidades}</strong> unidades están conformes.
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">Se notificará a Admin/Super Admin y la exclusiva quedará lista para recoger.</p>
                        <div className="mt-6 grid gap-3">
                            <button onClick={marcarListoParaEntregar} disabled={marcandoListo}
                                className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-[hsl(var(--ok))] text-white text-lg font-bold active:scale-95 disabled:opacity-50">
                                <PackageCheck className="h-6 w-6" /> {marcandoListo ? 'Marcando...' : 'Confirmar'}
                            </button>
                            <button onClick={() => setShowListoConfirm(false)} disabled={marcandoListo}
                                className="h-12 rounded-2xl bg-secondary font-semibold disabled:opacity-50">Cancelar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

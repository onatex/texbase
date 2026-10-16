import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import {
    AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock, Eye, FileText,
    LogOut, Pause, Play, RefreshCcw, Route, Search, Square, Wifi, WifiOff,
    Zap, X, Download, Camera, Video,
} from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/lib/auth';
import { formatSegons } from '@/lib/csv';
import Logo from '@/components/Logo';
import { computeMonoOps, parseDataExclusiva } from '@/lib/operacionsUtils';
import {
    expectedFasesForExclusiva, fasesLabel as fasesLabelUtil, canonFase, faseOrdre,
} from '@/lib/fasesUtils';
import { registresValids, enriquirRegistres, mitjanaOperariFaseMarca, rangUltimsDies } from '@/lib/mitjanesUtils';
import { MultiFileDrop } from '@/components/common/DragDropUpload';
import NotificationsBell from '@/components/common/NotificationsBell';
import RetrabajoPopup from '@/components/common/RetrabajoPopup';
import MensajeExclusivaPopup from '@/components/common/MensajeExclusivaPopup';

/* ─── Constants ──────────────────────────────────────────────────────────── */
const MOTIUS_PAUSA = ['Descanso', 'Falta de material', 'Avería máquina', 'Cambio de turno', 'Reunión', 'Otros'];
const TIPUS_INCIDENCIA = [
    'Material', 'Corte', 'Estampación', 'Máquina', 'Costura', 'Medida',
    'Descosido', 'Repunte', 'Cremallera', 'Cuello', 'Overlock', 'Puntadas',
    'Plancha', 'Bolsillo', 'Logo', 'Ficha', 'Otra',
];
const FITXES = {
    'R82-020': '/docs-R82-020.pdf',
    'R82-021': '/docs-R82-020.pdf',
};

/* ─── Session memory helpers ─────────────────────────────────────────────── */
function sessionKey(userId) {
    const d = new Date();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return `op-session-${userId}-${date}`;
}
function getSessionOps(userId) {
    try { return JSON.parse(localStorage.getItem(sessionKey(userId)) || '[]'); } catch { return []; }
}
function addSessionOp(userId, op) {
    const prev = getSessionOps(userId).filter((o) => o.codi !== op.codi);
    const next = [{ codi: op.codi, nom: op.nom, maquina: op.maquina, rutaId: op.ruta }, ...prev].slice(0, 10);
    localStorage.setItem(sessionKey(userId), JSON.stringify(next));
}

/* ─── Cron state persistence (auto-pause on browser close) ──────────────── */
function cronStorageKey(userId) { return `op-cron-${userId || ''}`; }
function pausarRegistreBeacon(registreId, segons, pauses, incidencies, retreball) {
    try {
        const token = pb.authStore.token;
        fetch(pb.buildURL(`/api/collections/registres/records/${registreId}`), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ estat: 'pausat', temps_real_seg: segons, pauses, incidencies, retreball }),
            keepalive: true,
        }).catch(() => {});
    } catch {}
}

/* ─── Trabajo libre cron persistence (auto-pause on browser close) ─────── */
function lliureStorageKey(userId) { return `op-lliure-${userId || ''}`; }
function pausarLliureBeacon(registreId, segons, incidencies, desc) {
    try {
        const token = pb.authStore.token;
        fetch(pb.buildURL(`/api/collections/registres/records/${registreId}`), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ estat: 'pausat', temps_real_seg: segons, pauses: [], incidencies, operacio: 'Trabajo libre', notes: (desc || '').slice(0, 2000) }),
            keepalive: true,
        }).catch(() => {});
    } catch {}
}

/**
 * Congela (pasa a 'pausat') TODOS los registres en_curs huérfanos del operario
 * antes de abrir uno nuevo. Un operario solo puede tener un cronómetro activo
 * a la vez. Antes esto solo cerraba registros del mismo mono y los marcaba
 * como 'finalitzat', lo que (a) dejaba huérfanos contando tiempo en otros
 * monos/exclusivas y (b) marcaba fases como completadas incorrectamente.
 *
 * Ahora:
 *  - Cierra TODOS los en_curs del operario (cualquier mono/exclusiva), no solo
 *    el mismo mono. Así no queda ningún cronómetro contando en segundo plano.
 *  - Los congela a 'pausat' (no 'finalitzat'): la fase NO se marca como
 *    completada, el operario puede reanudarla después, y el tiempo deja de
 *    contar. Solo se finaliza al confirmar explícitamente el OK de confección.
 *  - Los 'pausat' existentes se dejan como están (ya están congelados).
 *  - Cap del tiempo vivo a 8h: un en_curs huérfano no puede inflar
 *    temps_real_seg con tiempo no trabajado.
 */
async function closeOtherActiveRegistres({ operariId, monoId, exclusivaId, keepId = null }) {
    if (!operariId) return;
    try {
        // Cerrar TODOS los en_curs del operario, sin filtrar por mono/exclusiva.
        // Un operario solo puede tener un cronómetro activo a la vez.
        const filter = `operari = "${operariId}" && estat = "en_curs"`;
        const stale = await pb.collection('registres').getFullList({
            filter,
            requestKey: `close-stale-${operariId}-${Date.now()}`,
        });
        const now = Date.now();
        const MAX_EXTRA = 8 * 60 * 60; // 8h cap
        await Promise.all(
            stale
                .filter((r) => r.id !== keepId)
                .map((r, i) => {
                    const stored = Number(r.temps_real_seg);
                    let base = Number.isFinite(stored) && stored > 0 ? stored : 0;
                    // Solo sumar tiempo vivo si es reciente (<=8h). Si es huérfano
                    // (>8h), el operario no estaba trabajando: no inflar el tiempo.
                    const ref = r.ultima_reanudacio || r.inici;
                    if (ref) {
                        const live = Math.max(0, Math.floor((now - new Date(ref).getTime()) / 1000));
                        if (live <= MAX_EXTRA) base += live;
                    }
                    // Congelar a 'pausat' (NO 'finalitzat'): la fase no se marca
                    // como completada, el tiempo deja de contar, y el operario
                    // puede reanudarla después si lo necesita.
                    return pb.collection('registres').update(
                        r.id,
                        {
                            estat: 'pausat',
                            temps_real_seg: base,
                        },
                        { requestKey: `close-stale-u-${r.id}-${i}` },
                    ).catch(() => {});
                }),
        );
    } catch {
        // best-effort: no bloquear el inicio del trabajo
    }
}

/**
 * Congela registres en_curs huérfanos del operario al cargar la página.
 * Un registro en_curs con más de 8h de tiempo vivo es casi con seguridad
 * huérfano (el operario cerró el navegador/perdió conexión sin pausar).
 * Se congela a 'pausat' con el tiempo capado para que deje de contar.
 * No toca los 'pausat' (ya están congelados) ni borra historial.
 */
async function freezeOrphanedRegistres(operariId) {
    if (!operariId) return;
    try {
        const filter = `operari = "${operariId}" && estat = "en_curs"`;
        const actius = await pb.collection('registres').getFullList({
            filter,
            fields: 'id,estat,temps_real_seg,ultima_reanudacio,inici,operacio,mono,exclusiva',
            requestKey: `freeze-orphans-${operariId}-${Date.now()}`,
        });
        const now = Date.now();
        const MAX_EXTRA = 8 * 60 * 60; // 8h
        const toFreeze = actius.filter((r) => {
            const ref = r.ultima_reanudacio || r.inici;
            if (!ref) return false;
            const live = Math.max(0, Math.floor((now - new Date(ref).getTime()) / 1000));
            return live > MAX_EXTRA;
        });
        await Promise.all(
            toFreeze.map((r, i) => {
                const stored = Number(r.temps_real_seg);
                // Huérfano (>8h vivo): el operario no estaba trabajando. Usar
                // solo el tiempo productivo guardado, sin inflar con tiempo vivo.
                const base = Number.isFinite(stored) && stored > 0 ? stored : 0;
                return pb.collection('registres').update(
                    r.id,
                    { estat: 'pausat', temps_real_seg: base },
                    { requestKey: `freeze-orph-u-${r.id}-${i}` },
                ).catch(() => {});
            }),
        );
    } catch {
        // best-effort
    }
}

/* ─── Date helpers ───────────────────────────────────────────────────────── */
// Estados terminales: siempre se ocultan de la cola del operario.
// Nota: 'lista_recollida' (marcada por Calidad como lista para recoger) NO
// se incluye aquí. Si todavía quedan unidades/fases pendientes, la exclusiva
// debe seguir visible para el operario; si todo está finalizado, el filtro
// de tePendents/activa más abajo la oculta automáticamente.
// 'rechazado' y 'parcialmente_conforme' NO se ocultan aquí: son estados de
// Calidad que pueden coexistir con unidades/fases pendientes de confección.
// Si se ocultaran, el operario perdería acceso a exclusivas con trabajo
// pendiente. El filtro tePendents/activa las oculta solo cuando no queda
// nada por hacer.
const ESTATS_PROTEGITS = ['entregada', 'finalitzada', 'desapareguda'];

function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}
/** Fecha de entrega efectiva: data_entrega o, si falta, estimada / prevista. */
function dataEntregaExclusiva(ex) {
    if (!ex) return '';
    const candidates = [ex.data_entrega, ex.data_estimada, ex.data_prevista_recepcio, ex.data_real_recepcio];
    for (const c of candidates) {
        if (c == null || c === '') continue;
        const { date } = parseDataExclusiva(c);
        if (date) return c;
    }
    // Devolver el primer valor no vacío aunque no parseable (queda en sin-fecha)
    return candidates.find((c) => c != null && String(c).trim() !== '') || '';
}
// ¿La fecha de entrega cae entre hoy y los próximos 20 días?
function isInNext20Days(dateValue) {
    const { date } = parseDataExclusiva(dateValue);
    if (!date) return false;
    const today = startOfToday();
    const limit = new Date(today);
    limit.setDate(limit.getDate() + 20);
    return date >= today && date <= limit;
}
// ¿La fecha de entrega ya ha pasado (atrasada)?
function isOverdue(dateValue) {
    const { date } = parseDataExclusiva(dateValue);
    if (!date) return false;
    return date < startOfToday();
}
// Etiqueta legible para un grupo de fecha
function etiquetaGrupData(key, date) {
    if (!date) return 'Sin fecha de entrega';
    const today = startOfToday();
    const diff = Math.round((date - today) / 86400000);
    if (diff < 0) return 'Atrasadas';
    if (diff === 0) return 'Hoy';
    if (diff === 1) return 'Mañana';
    const dies = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    return `${dies[date.getDay()]} ${dd}/${mm}`;
}
function fitxaUrl(ex) {
    if (!ex) return null;
    const ref = (ex.referencia || ex.article || '').toUpperCase();
    for (const key of Object.keys(FITXES)) { if (ref.includes(key)) return FITXES[key]; }
    return null;
}

/* ─── Main component ─────────────────────────────────────────────────────── */
const OperarioPage = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);

    // Data
    const [monos, setMonos] = useState([]);
    const [exclusivesAll, setExclusivesAll] = useState([]);
    const [opsDef, setOpsDef] = useState([]);
    const [fasesExt, setFasesExt] = useState([]);
    const [rutes, setRutes] = useState([]);
    const [articles, setArticles] = useState([]);
    const [activesExIds, setActivesExIds] = useState(() => new Set()); // exclusivas con registre en_curs/pausat del operario
    const [recentRegistres, setRecentRegistres] = useState([]); // últimos 7 días del operario (para su media por fase/marca)
    const [carregant, setCarregant] = useState(true);
    const [error, setError] = useState('');

    // Navigation state
    // view: 'queue' | 'detail' | 'cronometro'
    const [view, setView] = useState('queue');
    const [exclusivaId, setExclusivaId] = useState(null); // selected exclusiva id
    const [faseSelec, setFaseSelec] = useState(null);
    const [operacio, setOperacio] = useState(null);

    // Registres for selected exclusiva's monos
    const [registresMono, setRegistresMono] = useState([]);

    // Cronómetro state
    const [registre, setRegistre] = useState(null);
    const [cronMono, setCronMono] = useState(null); // mono used in current registre
    const [segons, setSegons] = useState(0);
    const [pausat, setPausat] = useState(false);
    const [pauses, setPauses] = useState([]);
    const [incidencies, setIncidencies] = useState([]);
    const [retreball, setRetreball] = useState(false);
    const [dialeg, setDialeg] = useState(null);
    const [tipusIncidencia, setTipusIncidencia] = useState('');
    const [textIncidencia, setTextIncidencia] = useState('');
    const [fitxaTecnica, setFitxaTecnica] = useState(false);
    const [adminNotif, setAdminNotif] = useState(null); // { type, msg }
    const inici = useRef(null);
    const pausatByUs = useRef(false); // track if we triggered the pause
    const pauseStartRef = useRef(null); // timestamp (ms) of the current pause start
    const registroHorarioRef = useRef(null); // { id, hora_entrada, tiempoProductivoMin, tiempoParadaMin, operaciones, exclusivas, reoperaciones }

    // Session memory
    const [sessionOps, setSessionOps] = useState(() => getSessionOps(user?.id || ''));
    const [searchQ, setSearchQ] = useState('');
    const [ncAlerts, setNcAlerts] = useState([]);
    const [ncModal, setNcModal] = useState(null);
    const [saltades, setSaltades] = useState(new Set());

    // Retrabajos assigned to this operario
    const [retrabajos, setRetrabajos] = useState([]);
    const activeRetrabajoRef = useRef(null); // retrabajo id currently being worked
    // Media for retrabajo completion (fotos después + videos)
    const [retrFotosDespues, setRetrFotosDespues] = useState([]);
    const [retrVideos, setRetrVideos] = useState([]);
    const [retrabajoActiu, setRetrabajoActiu] = useState(false);
    const [retrabajoRec, setRetrabajoRec] = useState(null); // active retrabajo record (for fotos_antes + motivo)

    // Auto-pause / drafts state
    const cronStateRef = useRef(null); // mirror of active cron state for pagehide
    const [resumeModal, setResumeModal] = useState(null); // paused cron state awaiting user decision
    const [borradores, setBorradores] = useState([]);

    // ── Control de inactividad (90 min sin actividad) ──────────────────────
    // Si el operario deja una exclusiva abierta (cronómetro o trabajo libre en
    // curso) sin interactuar durante 90 minutos, se muestra un popup que le
    // pregunta si la exclusiva está terminada o continúa pausada por alguna
    // razón. Si continúa pausada, debe elegir obligatoriamente una causa:
    // "Incidencia" o "Parado por encargado".
    const INACTIVITAT_MS = 90 * 60 * 1000; // 90 minutos
    const lastActivityRef = useRef(Date.now());
    const [inactivitatPopup, setInactivitatPopup] = useState(null); // null | 'pregunta' | 'causa'
    const inactivitatShownRef = useRef(false); // evita reaparición repetida

    // Trabajo libre (exclusivas sin ruta)
    const [lliureDesc, setLliureDesc] = useState('');
    const [lliureSegons, setLliureSegons] = useState(0);
    const [lliureInici, setLliureInici] = useState(null);
    const [lliureIncidencies, setLliureIncidencies] = useState([]);
    const [lliurePausat, setLliurePausat] = useState(false);
    const [lliureMono, setLliureMono] = useState(null);
    const lliureTimerRef = useRef(null);
    const lliureIniciRef = useRef(null);
    // Trabajo libre registre (mismo mecanismo que operaciones por ruta)
    const [lliureRegistre, setLliureRegistre] = useState(null);
    const lliureRegistreRef = useRef(null);
    const [lliureExclusivaId, setLliureExclusivaId] = useState(null);
    const [lliureSnapshot, setLliureSnapshot] = useState(null); // { exclusiva, article } para render tras recarga
    const lliureSegonsRef = useRef(0);
    const lliurePausatRef = useRef(false);
    const lliureIncidenciesRef = useRef([]);
    const lliureDescRef = useRef('');
    const lliurePauseStartRef = useRef(null); // timestamp (ms) del inicio de la pausa actual de trabajo libre

    useEffect(() => {
        const on = () => setOnline(true);
        const off = () => setOnline(false);
        window.addEventListener('online', on);
        window.addEventListener('offline', off);
        return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
    }, []);

    /* ─── Control de inactividad: registro de actividad del operario ─────── */
    // Cualquier interacción (clic, toque, teclado, scroll) reinicia el contador
    // de inactividad. Así, si el operario vuelve a interactuar antes de los 90
    // minutos, el contador se reinicia correctamente.
    useEffect(() => {
        const marcaActivitat = () => {
            lastActivityRef.current = Date.now();
            // Si hay un popup abierto no lo cerramos: la respuesta es obligatoria.
            // Pero permitimos re-armar el aviso para una próxima vez si ya se cerró.
            if (!inactivitatPopup) inactivitatShownRef.current = false;
        };
        const evts = ['pointerdown', 'keydown', 'touchstart', 'mousedown', 'scroll', 'wheel'];
        evts.forEach((e) => window.addEventListener(e, marcaActivitat, { passive: true }));
        return () => {
            evts.forEach((e) => window.removeEventListener(e, marcaActivitat));
        };
    }, [inactivitatPopup]);

    /* ─── Control de inactividad: comprobación periódica ─────────────────── */
    // Comprueba cada 15 s si ha pasado el tiempo de inactividad mientras el
    // cronómetro (o trabajo libre) está en curso. Funciona aunque la pantalla
    // permanezca abierta en tablet, porque el intervalo sigue activo.
    useEffect(() => {
        const id = setInterval(() => {
            if (inactivitatPopup || inactivitatShownRef.current) return;
            const enCursCrono = view === 'cronometro' && registre && !pausat;
            const enCursLliure = view === 'libre' && lliureRegistreRef.current && !lliurePausatRef.current;
            if (!enCursCrono && !enCursLliure) return;
            if (Date.now() - lastActivityRef.current >= INACTIVITAT_MS) {
                inactivitatShownRef.current = true;
                setInactivitatPopup('pregunta');
            }
        }, 15000);
        return () => clearInterval(id);
    }, [view, registre, pausat, inactivitatPopup, INACTIVITAT_MS]);

    /* ─── Load data ────────────────────────────────────────────────────── */
    const carrega = useCallback(async () => {
        try {
            const uid = user?.id || pb.authStore?.record?.id || '';
            const [llistaMonos, llistaExclusives, llistaOpsDef, llistaRutes, llistaFasesExt, llistaArticles, llistaActius] = await Promise.all([
                pb.collection('monos').getFullList({
                    sort: 'created',
                    expand: 'exclusiva,exclusiva.ruta',
                    requestKey: 'monos-operari2',
                }).catch(() => []),
                pb.collection('exclusives').getFullList({
                    sort: 'data_entrega',
                    expand: 'ruta',
                    filter: "estat != 'desapareguda'",
                    requestKey: 'ex-operari-queue',
                }).catch(() => []),
                pb.collection('operacions_def').getFullList({ sort: 'ordre', requestKey: 'opsdefs-operari2' }).catch(() => []),
                pb.collection('rutes').getFullList({ sort: 'nom', requestKey: 'rutes-operari2' }).catch(() => []),
                pb.collection('fases_externalizadas').getFullList({ filter: 'estat != "retornada"', fields: 'id,mono,operacio_codi,fase,estat', requestKey: 'fext-operari' }).catch(() => []),
                pb.collection('articles').getFullList({ fields: 'id,referencia,nom,ruta,fases_config', requestKey: 'articles-operari' }).catch(() => []),
                uid
                    ? pb.collection('registres').getFullList({
                        filter: `operari = "${uid}" && (estat = "en_curs" || estat = "pausat")`,
                        fields: 'id,exclusiva,mono,estat,operacio',
                        requestKey: 'reg-actius-operari',
                    }).catch(() => [])
                    : Promise.resolve([]),
            ]);
            setMonos(llistaMonos || []);
            setExclusivesAll(llistaExclusives || []);
            setOpsDef(llistaOpsDef || []);
            setRutes(llistaRutes || []);
            setFasesExt(llistaFasesExt || []);
            setArticles(llistaArticles || []);
            const actIds = new Set();
            for (const r of llistaActius || []) {
                const exId = typeof r.exclusiva === 'string' ? r.exclusiva : r.exclusiva?.id;
                if (exId) actIds.add(exId);
            }
            setActivesExIds(actIds);
            setError('');
        } catch {
            setError('No se han podido cargar los datos.');
        } finally {
            setCarregant(false);
        }
    }, [user?.id]);

    // Carga los registros del operario de los últimos 7 días para calcular
    // su media semanal rodante por fase y marca (mostrada en el cronómetro).
    // No borra ni altera datos: solo lectura para la media.
    const carregaRecent = useCallback(async () => {
        const uid = user?.id || pb.authStore?.record?.id || '';
        if (!uid) return;
        try {
            const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            const list = await pb.collection('registres').getFullList({
                filter: pb.filter('operari = {:u} && inici >= {:s}', { u: uid, s: since }),
                expand: 'exclusiva',
                requestKey: 'recent-regs-operari',
            });
            setRecentRegistres(list || []);
        } catch { /* silent */ }
    }, [user?.id]);

    useEffect(() => { carregaRecent(); }, [carregaRecent]);

    const clearCronState = useCallback(() => {
        cronStateRef.current = null;
        try { localStorage.removeItem(cronStorageKey(user?.id)); } catch {}
    }, [user?.id]);

    const clearLliureState = useCallback(() => {
        try { localStorage.removeItem(lliureStorageKey(user?.id)); } catch {}
    }, [user?.id]);

    const carregaBorradores = useCallback(async () => {
        if (!user?.id) return;
        try {
            const list = await pb.collection('borradores_operario').getFullList({
                filter: `operario = "${user.id}"`,
                sort: '-created',
                expand: 'exclusiva,mono',
                requestKey: 'borradores-operari',
            });
            setBorradores(list);
        } catch { setBorradores([]); }
    }, [user?.id]);

    // Load retrabajos assigned to this operario (pendiente / en_proceso)
    const carregaRetrabajos = useCallback(async () => {
        if (!user?.id) return;
        try {
            const list = await pb.collection('retrabajos').getFullList({
                filter: `operario_asignado = "${user.id}" && (estado = "pendiente" || estado = "en_proceso")`,
                sort: '-created',
                expand: 'exclusiva,mono,incidencia_calidad',
                requestKey: 'retr-operari',
            });
            setRetrabajos(list);
        } catch { setRetrabajos([]); }
    }, [user?.id]);

    useEffect(() => { carrega(); }, [carrega]);

    // Al montar: congelar registres en_curs huérfanos (>8h) del operario para
    // que no sigan contando tiempo en segundo plano (browser cerrado, pérdida
    // de conexión, etc.). No borra historial; los pasa a 'pausat'.
    useEffect(() => {
        if (user?.id) void freezeOrphanedRegistres(user.id);
    }, [user?.id]);

    // Realtime: refrescar datos de ruta/operaciones/exclusivas cuando Producción
    // añade o propaga operaciones. No toca el cronómetro (registre/segons/operacio
    // viven en estado independiente), así que el operario no pierde el tiempo
    // acumulado y ve la nueva operación en cola/detalle/siguiente cuando toque.
    useEffect(() => {
        let timer = null;
        const refresca = () => { clearTimeout(timer); timer = setTimeout(carrega, 500); };
        const cols = ['operacions_def', 'monos', 'exclusives', 'rutes'];
        cols.forEach((c) => { void pb.collection(c).subscribe('*', refresca).catch(() => {}); });
        return () => {
            clearTimeout(timer);
            cols.forEach((c) => { void pb.collection(c).unsubscribe('*').catch(() => {}); });
        };
    }, [carrega]);
    useEffect(() => { carregaRetrabajos(); }, [carregaRetrabajos]);

    // Realtime: refresh retrabajos on changes
    useEffect(() => {
        if (!user?.id) return undefined;
        const refresca = () => carregaRetrabajos();
        void pb.collection('retrabajos').subscribe('*', refresca).catch(() => {});
        return () => { void pb.collection('retrabajos').unsubscribe('*').catch(() => {}); };
    }, [user?.id, carregaRetrabajos]);

    // Registro horario: create on mount, update on unmount
    useEffect(() => {
        if (!user?.id) return undefined;
        const ahora = new Date();
        pb.collection('registro_horario').create({
            operari: user.id,
            fecha: ahora.toISOString().split('T')[0],
            hora_entrada: ahora.toISOString(),
            estado: 'incompleto',
            tiempo_productivo_min: 0,
            numero_operaciones_completadas: 0,
            numero_exclusivas_completadas: 0,
            numero_reoperaciones: 0,
        }, { requestKey: 'rh-create' }).then((rec) => {
            registroHorarioRef.current = {
                id: rec.id,
                hora_entrada: ahora.toISOString(),
                tiempoProductivoMin: 0,
                tiempoParadaMin: 0,
                operaciones: 0,
                exclusivas: new Set(),
                reoperaciones: 0,
            };
        }).catch(() => {});
        return () => {
            const rh = registroHorarioRef.current;
            if (!rh) return;
            const salida = new Date();
            const durMin = Math.round((salida - new Date(rh.hora_entrada)) / 60000);
            const improductivo = Math.max(0, durMin - rh.tiempoProductivoMin);
            const incidencias = [];
            const eH = new Date(rh.hora_entrada);
            const eMin = eH.getHours() * 60 + eH.getMinutes();
            const sMin = salida.getHours() * 60 + salida.getMinutes();
            if (eMin > 8 * 60 + 15) incidencias.push('entrada_tarde');
            if (sMin < 17 * 60 - 15 && durMin > 30) incidencias.push('salida_antes');
            if (durMin < 8 * 60 - 30 && durMin > 30) incidencias.push('jornada_incompleta');
            if (durMin > 60 && improductivo / durMin > 0.3) incidencias.push('tiempo_improductivo_alto');
            const estado = incidencias.length > 0 ? 'con_problemas' : 'completo';
            pb.collection('registro_horario').update(rh.id, {
                hora_salida: salida.toISOString(),
                duracion_jornada_min: durMin,
                tiempo_productivo_min: rh.tiempoProductivoMin,
                tiempo_improductivo_min: improductivo,
                tiempo_parada_min: rh.tiempoParadaMin || 0,
                numero_operaciones_completadas: rh.operaciones,
                numero_exclusivas_completadas: rh.exclusivas.size,
                numero_reoperaciones: rh.reoperaciones,
                incidencias_horario: incidencias,
                estado,
            }).catch(() => {});
        };
    }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!registre || pausat) return undefined;
        const id = setInterval(() => setSegons((s) => s + 1), 1000);
        return () => clearInterval(id);
    }, [registre, pausat]);

    // Load borradores on mount + realtime refresh
    useEffect(() => { carregaBorradores(); }, [carregaBorradores]);
    useEffect(() => {
        if (!user?.id) return undefined;
        const refresca = () => carregaBorradores();
        void pb.collection('borradores_operario').subscribe('*', refresca).catch(() => {});
        return () => { void pb.collection('borradores_operario').unsubscribe('*').catch(() => {}); };
    }, [user?.id, carregaBorradores]);

    // On mount: detect a cronómetro paused by a previous browser close
    useEffect(() => {
        if (!user?.id) return;
        try {
            const raw = localStorage.getItem(cronStorageKey(user.id));
            if (raw) {
                const state = JSON.parse(raw);
                if (state && state.registreId) setResumeModal(state);
            }
        } catch {}
    }, [user?.id]);

    // On mount: recover trabajo libre en curso tras recarga / reentrada
    useEffect(() => {
        if (!user?.id) return;
        let cancelled = false;
        try {
            const raw = localStorage.getItem(lliureStorageKey(user.id));
            if (!raw) return;
            const state = JSON.parse(raw);
            if (!state?.registreId) return;
            pb.collection('registres').getOne(state.registreId, { requestKey: `rest-lliure-${state.registreId}` })
                .then((rec) => {
                    if (cancelled) return;
                    if (rec && (rec.estat === 'en_curs' || rec.estat === 'pausat')) {
                        // eslint-disable-next-line no-console
                        console.log('[OperarioPage] Recuperant trabajo libre', {
                            registreId: rec.id, exclusiva: rec.exclusiva, operari: rec.operari,
                            estat: rec.estat, inici: rec.inici, fi: rec.fi, segons: state.segons,
                        });
                        setLliureExclusivaId(state.exclusivaId || rec.exclusiva || null);
                        setLliureSnapshot(state.snapshot || { exclusiva: state.exclusivaCode || '—', article: '' });
                        setLliureRegistre(rec);
                        lliureRegistreRef.current = rec;
                        setLliureDesc(state.desc || rec.operacio || '');
                        setLliureSegons(state.segons || rec.temps_real_seg || 0);
                        setLliureIncidencies(state.incidencies || rec.incidencies || []);
                        setLliurePausat(rec.estat === 'pausat');
                        setLliureMono(state.monoId ? { id: state.monoId, exclusiva: state.exclusivaId } : null);
                        setView('libre');
                    } else {
                        clearLliureState();
                    }
                })
                .catch(() => { if (!cancelled) clearLliureState(); });
        } catch {}
        return () => { cancelled = true; };
    }, [user?.id, clearLliureState]);

    // Auto-pause: save cron state on page hide / tab hidden (browser/tablet close)
    useEffect(() => {
        const onHide = () => {
            const state = cronStateRef.current;
            if (state) {
                try { localStorage.setItem(cronStorageKey(user?.id), JSON.stringify(state)); } catch {}
                pausarRegistreBeacon(state.registreId, state.segons, state.pauses, state.incidencies, state.retreball);
            }
            // Trabajo libre: pausar el registre activo para que quede guardado y se pueda recuperar
            const lrec = lliureRegistreRef.current;
            if (lrec && !lliurePausatRef.current) {
                pausarLliureBeacon(lrec.id, lliureSegonsRef.current, lliureIncidenciesRef.current, lliureDescRef.current);
            }
        };
        const onVis = () => { if (document.visibilityState === 'hidden') onHide(); };
        window.addEventListener('pagehide', onHide);
        document.addEventListener('visibilitychange', onVis);
        return () => {
            window.removeEventListener('pagehide', onHide);
            document.removeEventListener('visibilitychange', onVis);
        };
    }, [user?.id]);

    // Realtime: detect admin pausing/finishing the active registre
    useEffect(() => {
        if (!registre?.id) return undefined;
        void pb.collection('registres').subscribe(registre.id, (e) => {
            if (e.action !== 'update') return;
            const rec = e.record;
            if (rec.estat === 'pausat' && !pausatByUs.current && !pausat) {
                setPausat(true);
                setAdminNotif({ type: 'pausa', msg: 'Tu operación ha sido pausada por el administrador.' });
            }
            if (rec.estat === 'finalitzat') {
                setAdminNotif({ type: 'final', msg: 'Tu operación ha sido marcada como completada por el administrador.' });
                setRegistre(null);
                setTimeout(() => {
                    setAdminNotif(null);
                    setView('detail');
                    setFaseSelec(null);
                    carrega();
                }, 3500);
            }
        }).catch(() => {});
        return () => { void pb.collection('registres').unsubscribe(registre.id).catch(() => {}); };
    }, [registre?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    /* ─── Derived: exclusives for queue ─────────────────────────────────── */
    // Fuente principal: colección exclusives + monos asociados.
    // Antes solo se usaban monos.expand.exclusiva: si el expand fallaba o no había
    // mono, la exclusiva desaparecía de la cola. También se ignoraban fechas en
    // data_estimada / sin fecha y trabajos pausados del operario.
    const exclusivesById = useMemo(() => {
        const map = new Map();
        for (const ex of exclusivesAll) {
            if (ex?.id) map.set(ex.id, ex);
        }
        // Completar con exclusivas expandidas desde monos (por si el listado falló parcialmente)
        for (const m of monos) {
            const ex = m.expand?.exclusiva;
            if (ex?.id && !map.has(ex.id)) map.set(ex.id, ex);
        }
        return map;
    }, [exclusivesAll, monos]);

    const monosByExclusiva = useMemo(() => {
        const map = new Map();
        for (const m of monos) {
            const exId = (typeof m.exclusiva === 'string' ? m.exclusiva : null)
                || m.expand?.exclusiva?.id
                || m.exclusiva?.id
                || null;
            if (!exId) continue;
            if (!map.has(exId)) map.set(exId, []);
            map.get(exId).push(m);
        }
        return map;
    }, [monos]);

    const exclusivesQueue = useMemo(() => {
        const borradoresExIds = new Set(borradores.map((b) => b.exclusiva).filter(Boolean));
        // Exclusivas con un retrabajo (reproceso) asignado a este operario y
        // aún pendiente/en_proceso. Aunque todos los monos estén finalitzats
        // (confección terminada), si Calidad rechazó una unidad y le asignó
        // el retrabajo, la exclusiva debe seguir visible para que el operario
        // pueda acceder al reproceso. Sin esto, una exclusiva con entrega
        // fuera de ventana y sin mono activo desaparecería de la cola.
        const retrabajoExIds = new Set(
            retrabajos.map((r) => r.exclusiva).filter(Boolean),
        );
        const items = [];
        for (const [exId, ex] of exclusivesById.entries()) {
            if (!ex) continue;
            if (ESTATS_PROTEGITS.includes(ex.estat)) continue;
            // 'lista_recollida' solo se oculta si no queda trabajo pendiente
            // ni actividad del operario; si aún hay unidades/fases por hacer,
            // la exclusiva sigue visible (resuelto más abajo con tePendents/activa).
            const ms = monosByExclusiva.get(exId) || [];
            // ¿Quedan unidades pendientes? Considera tanto monos no finalizados
            // como unidades totales (ex.unitats) aún sin mono creado/finalizado.
            // Antes solo se miraba si algún mono existente no estaba finalizado:
            // si todas las unidades creadas estaban finalizadas pero quedaban
            // más unidades por hacer (unitats > finalizados), la exclusiva
            // desaparecía de la cola aunque tuviera trabajo pendiente.
            const finalitzats = ms.filter((m) => m.estat === 'finalitzat').length;
            const unitats = Math.max(1, Number(ex.unitats) || 1);
            const tePendents = ms.length === 0 || ms.some((m) => m.estat !== 'finalitzat') || finalitzats < unitats;
            const monoActiu = ms.some((m) => m.estat === 'en_curs' || m.estat === 'retreball' || m.estat === 'pausat');
            const activa = monoActiu
                || borradoresExIds.has(exId)
                || activesExIds.has(exId)
                || retrabajoExIds.has(exId);
            if (!tePendents && !activa) continue;

            const dataRef = dataEntregaExclusiva(ex);
            const { date } = parseDataExclusiva(dataRef);
            const sinFecha = !date;
            // Ventana 20 días + atrasadas + sin fecha + activas (fuera de ventana)
            const enFinestra = isInNext20Days(dataRef) || isOverdue(dataRef) || sinFecha;
            if (!enFinestra && !activa) continue;

            items.push({ ex, monos: ms, dataRef });
        }
        return items.sort((a, b) => {
            const da = parseDataExclusiva(a.dataRef).key;
            const db = parseDataExclusiva(b.dataRef).key;
            if (da !== db) {
                if (da === 'sin-fecha') return 1;
                if (db === 'sin-fecha') return -1;
                return da < db ? -1 : 1;
            }
            const pa = (a.ex.prioritat === 'express' || a.ex.express) ? 0 : a.ex.prioritat === 'alta' ? 1 : 2;
            const pb2 = (b.ex.prioritat === 'express' || b.ex.express) ? 0 : b.ex.prioritat === 'alta' ? 1 : 2;
            return pa - pb2;
        });
    }, [exclusivesById, monosByExclusiva, borradores, activesExIds, retrabajos]);

    const selectedExclusiva = useMemo(() => {
        if (!exclusivaId) return null;
        const fromQueue = exclusivesQueue.find((e) => e.ex.id === exclusivaId);
        if (fromQueue) return fromQueue;
        // Mantener detalle/cronómetro aunque la exclusiva quede fuera del filtro de 20 días
        const ex = exclusivesById.get(exclusivaId);
        if (!ex) return null;
        return { ex, monos: monosByExclusiva.get(exclusivaId) || [], dataRef: dataEntregaExclusiva(ex) };
    }, [exclusivesQueue, exclusivaId, exclusivesById, monosByExclusiva]);

    // Persist active cronómetro state to localStorage on every tick (auto-pause)
    useEffect(() => {
        if (view !== 'cronometro' || !registre) return;
        const state = {
            registreId: registre.id,
            monoId: cronMono?.id || null,
            exclusivaId: cronMono?.exclusiva || selectedExclusiva?.ex?.id || null,
            exclusivaCode: selectedExclusiva?.ex?.exclusiva || cronMono?.codi || '',
            operacion: operacio?.nom || registre.operacio || '',
            operacionCodi: operacio?.codi || '',
            fase: operacio?.fase || '',
            segons,
            pauses,
            incidencies,
            retreball,
            tipus: registre.tipus || 'normal',
            retrabajoId: activeRetrabajoRef.current || null,
            savedAt: Date.now(),
        };
        cronStateRef.current = state;
        try { localStorage.setItem(cronStorageKey(user?.id), JSON.stringify(state)); } catch {}
    }, [view, registre, cronMono, selectedExclusiva, operacio, segons, pauses, incidencies, retreball, user?.id]);

    // Realtime: detect admin blocking the exclusiva
    useEffect(() => {
        const exId = selectedExclusiva?.ex?.id;
        if (!exId || view !== 'cronometro') return undefined;
        void pb.collection('exclusives').subscribe(exId, (e) => {
            if (e.action !== 'update') return;
            if (e.record.estat === 'bloquejada') {
                setPausat(true);
                setAdminNotif({
                    type: 'bloqueig',
                    msg: `La exclusiva ha sido bloqueada por el administrador.${e.record.motiu_bloqueig ? ` Motivo: ${e.record.motiu_bloqueig}` : ''}`,
                });
            } else if (e.record.estat !== 'bloquejada') {
                setAdminNotif((n) => (n?.type === 'bloqueig' ? null : n));
            }
        }).catch(() => {});
        return () => { void pb.collection('exclusives').unsubscribe(exId).catch(() => {}); };
    }, [selectedExclusiva?.ex?.id, view]); // eslint-disable-line react-hooks/exhaustive-deps

    /* ─── Load registres for selected exclusiva ─────────────────────────── */
    useEffect(() => {
        if (!selectedExclusiva) { setRegistresMono([]); return; }
        const monoIds = (selectedExclusiva.monos || []).map((m) => m.id).filter(Boolean);
        const exId = selectedExclusiva.ex?.id;
        let cancelled = false;
        const load = async () => {
            if (monoIds.length) {
                const results = await Promise.all(
                    monoIds.map((mid, i) =>
                        pb.collection('registres').getFullList({
                            filter: `mono = "${mid}"`,
                            sort: '-created',
                            requestKey: `regs-ex-mono-${i}`,
                        }).catch(() => [])
                    )
                );
                if (!cancelled) setRegistresMono(results.flat());
                return;
            }
            if (!exId) { if (!cancelled) setRegistresMono([]); return; }
            const byEx = await pb.collection('registres').getFullList({
                filter: `exclusiva = "${exId}"`,
                sort: '-created',
                requestKey: `regs-ex-${exId}`,
            }).catch(() => []);
            if (!cancelled) setRegistresMono(byEx);
        };
        load();
        return () => { cancelled = true; };
    }, [selectedExclusiva]);

    /* ─── Derived: ruta + ops for selected exclusiva ─────────────────────── */
    // Resol la ruta d'una exclusiva provant múltiples vies:
    //   1. relació directa ex.ruta
    //   2. relació expandida ex.expand.ruta
    //   3. article trobat per referencia exacta → article.ruta
    //   4. article trobat per camp article (match referencia o nom)
    //   5. ruta per nom que contingui la referencia
    const resoldreRuta = useCallback((ex) => {
        if (!ex) return { rutaId: null, rutaNom: '', via: 'cap', motiu: 'sense exclusiva' };
        const ref = (ex.referencia || '').trim();
        const artTxt = (ex.article || '').trim();
        const norm = (s) => String(s || '').trim().toUpperCase();

        // 1. relació directa
        if (ex.ruta) {
            const r = rutes.find((x) => x.id === ex.ruta);
            return { rutaId: ex.ruta, rutaNom: r?.nom || r?.descripcion || 'Ruta', via: 'directa', motiu: 'ex.ruta' };
        }
        // 2. expandida
        const expRuta = ex.expand?.ruta;
        if (expRuta && expRuta.id) {
            return { rutaId: expRuta.id, rutaNom: expRuta.nom || expRuta.descripcion || 'Ruta', via: 'expandida', motiu: 'ex.expand.ruta' };
        }
        // 3. article per referencia exacta
        if (ref) {
            const art = articles.find((a) => norm(a.referencia) === norm(ref));
            if (art && art.ruta) {
                const r = rutes.find((x) => x.id === art.ruta);
                return { rutaId: art.ruta, rutaNom: r?.nom || r?.descripcion || 'Ruta', via: 'article-ref', motiu: `article ${art.referencia}` };
            }
        }
        // 4. article per camp article (match referencia o nom)
        if (artTxt) {
            const art = articles.find((a) => norm(a.referencia) === norm(artTxt) || norm(a.nom) === norm(artTxt));
            if (art && art.ruta) {
                const r = rutes.find((x) => x.id === art.ruta);
                return { rutaId: art.ruta, rutaNom: r?.nom || r?.descripcion || 'Ruta', via: 'article-nom', motiu: `article ${art.referencia}` };
            }
            // 4b. article cuya referencia está contenida en el campo article
            const art2 = articles.find((a) => norm(artTxt).includes(norm(a.referencia)) && a.ruta);
            if (art2) {
                const r = rutes.find((x) => x.id === art2.ruta);
                return { rutaId: art2.ruta, rutaNom: r?.nom || r?.descripcion || 'Ruta', via: 'article-contingut', motiu: `article ${art2.referencia}` };
            }
        }
        // 5. ruta per nom que contingui la referencia
        if (ref) {
            const r = rutes.find((x) => norm(x.nom).includes(norm(ref)));
            if (r) return { rutaId: r.id, rutaNom: r.nom || 'Ruta', via: 'ruta-nom', motiu: `ruta ${r.nom}` };
        }
        return { rutaId: null, rutaNom: '', via: 'cap', motiu: 'cap ruta trobada (article sense ruta o sense coincidència)' };
    }, [rutes, articles]);

    const rutaResolta = useMemo(() => resoldreRuta(selectedExclusiva?.ex), [selectedExclusiva, resoldreRuta]);
    const rutaId = rutaResolta?.rutaId || null;

    // Diagnóstico por consola de la exclusiva seleccionada
    useEffect(() => {
        if (!selectedExclusiva) return;
        const ex = selectedExclusiva.ex;
        // eslint-disable-next-line no-console
        console.log('[OperarioPage] Ruta diagnòstic', {
            exclusiva: ex.exclusiva,
            referencia: ex.referencia,
            article: ex.article,
            exRuta: ex.ruta,
            expandRuta: ex.expand?.ruta?.id || null,
            rutaResolta,
            opsRuta: opsDef.filter((o) => o.ruta === (rutaResolta?.rutaId || '')).length,
        });
    }, [selectedExclusiva, rutaResolta, opsDef]);

    // Build set of externalized operation codis for selected mono
    const extCodisForMono = useMemo(() => {
        if (!selectedExclusiva) return new Set();
        const monoId = selectedExclusiva.mono?.id;
        if (!monoId) return new Set();
        const s = new Set();
        for (const f of fasesExt) {
            if (f.mono === monoId && f.operacio_codi) s.add(f.operacio_codi);
        }
        return s;
    }, [fasesExt, selectedExclusiva]);

    const rutaOps = useMemo(() => {
        if (!rutaId) return [];
        return opsDef
            .filter((op) => op.ruta === rutaId && op.actiu !== false && !extCodisForMono.has(op.codi))
            .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
    }, [rutaId, opsDef, extCodisForMono]);

    // Configuración de fases: artículo (prioridad) → ruta → ops detalladas.
    const rutaRecord = useMemo(() => rutes.find((r) => r.id === rutaId) || null, [rutes, rutaId]);

    const parseFasesConfig = (raw) => {
        let arr = [];
        if (Array.isArray(raw)) arr = raw;
        else if (typeof raw === 'string' && raw.trim()) {
            try { arr = JSON.parse(raw); } catch { arr = []; }
        }
        return Array.isArray(arr) ? arr.filter((c) => c && c.fase) : [];
    };

    const articleRecord = useMemo(() => {
        if (!selectedExclusiva) return null;
        const ex = selectedExclusiva.ex || selectedExclusiva;
        const norm = (s) => String(s || '').trim().toUpperCase();
        const ref = norm(ex.referencia || '');
        const artTxt = norm(ex.article || '');
        if (ref) {
            const byRef = articles.find((a) => norm(a.referencia) === ref);
            if (byRef) return byRef;
        }
        if (artTxt) {
            const byArt = articles.find((a) => norm(a.referencia) === artTxt || norm(a.nom) === artTxt);
            if (byArt) return byArt;
            const byIncl = articles.find((a) => artTxt.includes(norm(a.referencia)) && a.referencia);
            if (byIncl) return byIncl;
        }
        return null;
    }, [selectedExclusiva, articles]);

    const fasesConfigArticle = useMemo(
        () => parseFasesConfig(articleRecord?.fases_config),
        [articleRecord],
    );
    const fasesConfigRuta = useMemo(
        () => parseFasesConfig(rutaRecord?.fases_config),
        [rutaRecord],
    );
    // Configuración de fases propia de la exclusiva (sembrada para las
    // exclusivas ya cargadas de R84-053/R84-054 con Fase 4).
    const fasesConfigExclusiva = useMemo(
        () => parseFasesConfig(selectedExclusiva?.ex?.fases_config || selectedExclusiva?.fases_config),
        [selectedExclusiva],
    );
    // Fusión: ruta (base) → artículo (sobrescribe tiempos) → exclusiva
    // (añade fases que falten, p.ej. Fase 4 para R84-053/R84-054 ya cargadas).
    const fasesConfig = useMemo(() => {
        const canon = (fase) => {
            const m = String(fase || '').match(/fase\s*(\d+)/i);
            const n = m ? Number(m[1]) : null;
            return (n >= 1 && n <= 4) ? `Fase ${n}` : (fase || 'Sin fase');
        };
        const merged = new Map();
        for (const c of fasesConfigRuta) merged.set(canon(c.fase), { ...c });
        for (const c of fasesConfigArticle) merged.set(canon(c.fase), { ...c });
        for (const c of fasesConfigExclusiva) {
            const key = canon(c.fase);
            if (!merged.has(key)) merged.set(key, { ...c });
        }
        return [...merged.values()];
    }, [fasesConfigArticle, fasesConfigRuta, fasesConfigExclusiva]);

    // Etiqueta dinámica de fases para una exclusiva de la cola.
    // Regla canónica: 3 fases para todos los artículos; 4 solo para CIK
    // (R84-053 / R84-054). Usa la utilidad compartida para garantizar
    // coherencia con el resto de vistas.
    const fasesLabelEx = useCallback((ex) => {
        const expected = expectedFasesForExclusiva(ex, articles);
        return fasesLabelUtil(expected.map((f) => ({ fase: f, activa: true })));
    }, [articles]);

    // Phases: fases canónicas según el artículo (3 base, 4 si CIK).
    // Siempre disponibles Fase 1, 2, 3; Fase 4 únicamente para R84-053/R84-054.
    // Se respetan las fases de operaciones detalladas de la ruta que estén
    // dentro del conjunto esperado (sin filtrar Fase 4 para artículos no CIK).
    const fases = useMemo(() => {
        const ex = selectedExclusiva?.ex || selectedExclusiva;
        const expected = expectedFasesForExclusiva(ex, articles);
        const expectedSet = new Set(expected);
        const seen = new Map();
        for (const f of expected) seen.set(f, faseOrdre(f));
        for (const op of rutaOps) {
            const f = canonFase(op.fase || 'Sin fase');
            if (expectedSet.has(f) && !seen.has(f)) seen.set(f, op.fase_ordre ?? faseOrdre(f));
        }
        return [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([f]) => f);
    }, [fasesConfig, rutaOps, selectedExclusiva, articles]);

    // Fases esperadas de la exclusiva (3 base, 4 si CIK R84-053/R84-054).
    const expectedFasesEx = useMemo(
        () => expectedFasesForExclusiva(selectedExclusiva?.ex || selectedExclusiva, articles),
        [selectedExclusiva, articles],
    );

    /** ¿El mono tiene todas las fases esperadas terminadas (según registros)?
     *  Un registro cuenta como fase completada si está finalitzat y su QC es
     *  ok/aprovat/pendent o no tiene QC. */
    const monoFasesCompletades = useCallback((monoId) => {
        if (!monoId || !expectedFasesEx.length) return false;
        const regs = (registresMono || []).filter((r) => r.mono === monoId);
        return expectedFasesEx.every((f) => regs.some((r) =>
            r.estat === 'finalitzat'
            && (!r.control_qualitat || r.control_qualitat === 'ok' || r.control_qualitat === 'aprovat' || r.control_qualitat === 'pendent')
            && canonFase(r.operacio) === canonFase(f),
        ));
    }, [registresMono, expectedFasesEx]);

    /** ¿El mono está realmente terminado? Por estat='finalitzat' O porque
     *  todas sus fases esperadas están completadas en los registros. Esto
     *  cubre el caso de unidades de varias fases cuyo mono no quedó marcado
     *  como finalitzat pero sí tiene todas sus fases terminadas, para no
     *  bloquear el inicio de fases en exclusivas de varias unidades. */
    const isMonoDone = useCallback((m) =>
        m?.estat === 'finalitzat' || monoFasesCompletades(m?.id),
    [monoFasesCompletades]);

    // Mono de referencia: primer mono que NO esté realmente terminado (por
    // estat o por fases completadas). Antes solo miraba estat, lo que dejaba
    // bloqueada una exclusiva de varias unidades si un mono no quedó marcado
    // finalitzat pero sí tenía todas sus fases terminadas: el operario veía
    // todas las fases como completadas y no podía iniciar la siguiente unidad.
    const monoRef = useMemo(() => {
        if (!selectedExclusiva) return null;
        const list = selectedExclusiva.monos || [];
        return list.find((m) => !isMonoDone(m)) || list[0] || null;
    }, [selectedExclusiva, isMonoDone]);

    /** Prepara la unidad de trabajo (mono) sobre la que iniciar una fase.
     *  - Reutiliza el primer mono que NO esté realmente terminado.
     *  - Si todos los monos existentes están terminados pero quedan unidades
     *    por hacer (ex.unitats > terminados), crea un mono nuevo para la
     *    siguiente unidad.
     *  - Si no hay monos, crea el primero.
     *  - Si todo está terminado y no quedan unidades, devuelve el primero
     *    (caso de reoperación). */
    const ensureMonoForExclusiva = useCallback(async () => {
        const ex = selectedExclusiva?.ex;
        if (!ex?.id) return null;
        const list = selectedExclusiva?.monos || [];
        const pendent = list.find((m) => !isMonoDone(m));
        if (pendent) return pendent;
        const doneCount = list.filter((m) => isMonoDone(m)).length;
        const unitats = Math.max(1, Number(ex.unitats) || 1);
        if (list.length === 0 || doneCount < unitats) {
            const rec = await pb.collection('monos').create({
                exclusiva: ex.id,
                codi: String(ex.exclusiva || ex.id).slice(0, 80),
                numero: doneCount + 1,
                estat: 'pendent',
            }, { requestKey: `mono-auto-${ex.id}` });
            setMonos((prev) => (prev.some((m) => m.id === rec.id) ? prev : [...prev, rec]));
            return rec;
        }
        return list[0] || null;
    }, [selectedExclusiva, isMonoDone]);

    // Tiempo estándar de una fase: ops detalladas → artículo → ruta.
    const faseStdMin = useCallback((fase) => {
        const target = canonFase(fase);
        const fromOps = rutaOps
            .filter((op) => canonFase(op.fase || 'Sin fase') === target)
            .reduce((s, op) => s + (Number(op.temps_std_min) || 0), 0);
        if (fromOps > 0) return fromOps;
        const fromArt = fasesConfigArticle.find((c) => canonFase(c.fase) === target);
        if (fromArt && Number(fromArt.temps_std_min) > 0) return Number(fromArt.temps_std_min);
        const fromRuta = fasesConfigRuta.find((c) => canonFase(c.fase) === target);
        const fromEx = fasesConfigExclusiva.find((c) => canonFase(c.fase) === target);
        return Number(fromRuta?.temps_std_min) || Number(fromArt?.temps_std_min) || Number(fromEx?.temps_std_min) || 0;
    }, [rutaOps, fasesConfigArticle, fasesConfigRuta, fasesConfigExclusiva]);

    // Estado de cada fase como unidad de trabajo agregada. Una fase se cuenta
    // como una sola operación: su estado se deriva de los registros cuyo
    // `operacio` coincide con el nombre de la fase (registros con
    // tipus='fase' o 'reoperacio' sobre la fase).
    const fasesAmbEstat = useMemo(() => {
        // Sin mono aún: fases siguen disponibles (Fase 1/2/3) para poder iniciar
        const monoRegs = monoRef
            ? registresMono.filter((r) => r.mono === monoRef.id)
            : registresMono.filter((r) => r.exclusiva === (selectedExclusiva?.ex?.id || ''));
        const matchFase = (operacio, fase) => {
            if (operacio === fase) return true;
            return canonFase(operacio) === canonFase(fase);
        };
        const completades = monoRegs.filter((r) =>
            r.estat === 'finalitzat' && (!r.control_qualitat || r.control_qualitat === 'ok' || r.control_qualitat === 'pendent'),
        );
        const enCurs = monoRegs.filter((r) => r.estat === 'en_curs' || r.estat === 'pausat');
        return fases.map((fase) => {
            let status = 'disponible';
            if (completades.some((r) => matchFase(r.operacio, fase))) status = 'completada';
            else if (enCurs.some((r) => matchFase(r.operacio, fase))) status = 'en_curs';
            return { fase, status, stdMin: faseStdMin(fase) };
        });
    }, [fases, monoRef, registresMono, faseStdMin, selectedExclusiva]);

    // ¿El artículo tiene ruta asignada? → se trabaja por ruta, nunca como trabajo libre
    const teRuta = !!rutaId;
    const rutaNom = rutaResolta?.rutaNom || (rutaId ? (rutes.find((x) => x.id === rutaId)?.nom || 'Ruta') : '');
    // Siguiente fase disponible siguiendo el orden Fase 1, Fase 2, Fase 3.
    const següentFase = useMemo(() => {
        if (!fasesAmbEstat.length) return null;
        return fasesAmbEstat.find((f) => f.status === 'en_curs')
            || fasesAmbEstat.find((f) => f.status === 'disponible')
            || null;
    }, [fasesAmbEstat]);

    const exclusivesQueueFiltered = useMemo(() => {
        if (!searchQ.trim()) return exclusivesQueue;
        const t = searchQ.trim().toLowerCase();
        return exclusivesQueue.filter(({ ex, monos: ms }) => {
            const monoTxt = (ms || []).map((m) => `${m.codi || ''} ${m.talla || ''} ${m.numero || ''}`).join(' ');
            return `${ex.exclusiva || ''} ${ex.article || ''} ${ex.marca || ''} ${ex.referencia || ''} ${ex.cliente || ''} ${monoTxt}`
                .toLowerCase()
                .includes(t);
        });
    }, [exclusivesQueue, searchQ]);

    // Agrupar las exclusivas visibles por fecha de entrega (ordenadas por fecha)
    const exclusivesGrups = useMemo(() => {
        const grups = new Map();
        for (const item of exclusivesQueueFiltered) {
            const dataRef = item.dataRef || dataEntregaExclusiva(item.ex);
            const { key, date } = parseDataExclusiva(dataRef);
            if (!grups.has(key)) grups.set(key, { key, date, items: [] });
            grups.get(key).items.push(item);
        }
        return [...grups.values()].sort((a, b) => {
            if (!a.date && !b.date) return 0;
            if (!a.date) return 1;
            if (!b.date) return -1;
            return a.date - b.date;
        });
    }, [exclusivesQueueFiltered]);

    // Mapa de ruta resolta per cada exclusiva de la cua (diagnòstic + etiqueta Por ruta/Libre)
    const rutaPerExclusiva = useMemo(() => {
        const map = new Map();
        for (const { ex } of exclusivesQueue) {
            map.set(ex.id, resoldreRuta(ex));
        }
        // eslint-disable-next-line no-console
        console.log('[OperarioPage] Cua diagnòstic', exclusivesQueue.map(({ ex }) => ({
            exclusiva: ex.exclusiva,
            referencia: ex.referencia,
            article: ex.article,
            exRuta: ex.ruta || null,
            resolta: map.get(ex.id),
        })));
        return map;
    }, [exclusivesQueue, resoldreRuta]);

    useEffect(() => {
        pb.collection('no_conformitats').getFullList({
            requestKey: 'nc-alerts-operari',
            expand: 'exclusiva',
            sort: '-created',
        }).then(ncs => {
            const groups = {};
            for (const nc of ncs) {
                const key = nc.punt_checklist || (nc.descripcio || '').substring(0, 50) || nc.id;
                if (!groups[key]) groups[key] = { key, ncs: [] };
                groups[key].ncs.push(nc);
            }
            const sorted = Object.values(groups)
                .sort((a, b) => b.ncs.length - a.ncs.length)
                .slice(0, 5)
                .map(g => ({
                    key: g.key,
                    count: g.ncs.length,
                    sample: g.ncs[0],
                    exclusives: [...new Set(g.ncs.map(n => n.expand?.exclusiva?.exclusiva).filter(Boolean))].slice(0, 3),
                }));
            setNcAlerts(sorted);
        }).catch(() => {});
    }, []);

    /* ─── Actions ────────────────────────────────────────────────────────── */
    const restaurarCron = async (state) => {
        try {
            const rec = await pb.collection('registres').getOne(state.registreId, { requestKey: `restaurar-${state.registreId}` });
            let mono = null;
            if (state.monoId) {
                try { mono = await pb.collection('monos').getOne(state.monoId, { expand: 'exclusiva', requestKey: `rest-mono-${state.monoId}` }); } catch {}
            }
            const opDef = opsDef.find((o) => o.nom === (state.operacion || rec.operacio));
            const op = opDef || { nom: state.operacion || rec.operacio, codi: state.operacionCodi || '', fase: state.fase || '', temps_std_min: Math.round((rec.temps_estandard_seg || 0) / 60), maquina: '', instruccions: '' };
            if (state.exclusivaId) setExclusivaId(state.exclusivaId);
            setCronMono(mono);
            setRegistre(rec);
            setSegons(state.segons || 0);
            setPauses(state.pauses || []);
            setIncidencies(state.incidencies || []);
            setRetreball(!!state.retreball);
            setPausat(false);
            pauseStartRef.current = null;
            setOperacio(op);
            // Reanudar en servidor fijando ultima_reanudacio para que el tiempo
            // en vivo siga sumando solo desde la reanudación (sin contar el
            // intervalo pausado por el cierre del navegador).
            const araIso = new Date().toISOString();
            pb.collection('registres').update(rec.id, {
                estat: 'en_curs',
                ultima_reanudacio: araIso,
            }, { requestKey: `rest-reanudar-${rec.id}` }).catch(() => {});
            if (state.retrabajoId) {
                activeRetrabajoRef.current = state.retrabajoId;
                try {
                    const retr = await pb.collection('retrabajos').getOne(state.retrabajoId, { requestKey: `rest-retr-${state.retrabajoId}` });
                    setRetrabajoRec(retr);
                    setRetrabajoActiu(true);
                } catch {}
            }
            setResumeModal(null);
            clearCronState();
            setView('cronometro');
        } catch (e) {
            clearCronState();
            setResumeModal(null);
            setError('El cronómetro pausado ya no está disponible.');
        }
    };

    const descartarCron = async (state) => {
        try { await pb.collection('registres').delete(state.registreId, { requestKey: `desc-${state.registreId}` }); } catch {}
        clearCronState();
        setResumeModal(null);
    };

    const guardarBorrador = async (state) => {
        try {
            await pb.collection('registres').update(state.registreId, {
                estat: 'pausat', temps_real_seg: state.segons, pauses: state.pauses, incidencies: state.incidencies, retreball: !!state.retreball,
            }, { requestKey: `borrador-pausa-${state.registreId}` });
            await pb.collection('borradores_operario').create({
                operario: user.id, exclusiva: state.exclusivaId || null, mono: state.monoId || null,
                operacion: state.operacion || '', operacion_codi: state.operacionCodi || '', fase: state.fase || '',
                tiempo_acumulado_seg: state.segons || 0, pauses: state.pauses || [], incidencies: state.incidencies || [],
                retreball: !!state.retreball, registre_id: state.registreId, retrabajo_id: state.retrabajoId || '',
                tipus: state.tipus || 'normal', estado: 'guardado', fecha_pausa: new Date().toISOString(),
            }, { requestKey: `borrador-create-${state.registreId}` });
        } catch (e) { console.error('guardarBorrador', e); }
        clearCronState();
        setResumeModal(null);
        carregaBorradores();
    };

    const continuarBorrador = async (b) => {
        try {
            let rec = null;
            if (b.registre_id) {
                try { rec = await pb.collection('registres').getOne(b.registre_id, { requestKey: `cont-borr-${b.id}` }); } catch {}
            }
            let mono = null;
            if (b.mono) {
                try { mono = await pb.collection('monos').getOne(b.mono, { expand: 'exclusiva', requestKey: `cont-mono-${b.mono}` }); } catch {}
            }
            const opDef = opsDef.find((o) => o.nom === b.operacion);
            const op = opDef || { nom: b.operacion, codi: b.operacion_codi || '', fase: b.fase || '', temps_std_min: 0, maquina: '', instruccions: '' };
            // Cerrar otros cronómetros en_curs huérfanos y reanudar este en el
            // servidor para que el Dashboard en vivo muestre el tiempo en curso.
            await closeOtherActiveRegistres({ operariId: user.id, monoId: b.mono, exclusivaId: b.exclusiva, keepId: rec?.id });
            if (rec) {
                const araIso = new Date().toISOString();
                pb.collection('registres').update(rec.id, {
                    estat: 'en_curs',
                    ultima_reanudacio: araIso,
                }, { requestKey: `cont-borr-resume-${rec.id}` }).catch(() => {});
            }
            if (b.exclusiva) setExclusivaId(b.exclusiva);
            setCronMono(mono);
            if (rec) setRegistre(rec);
            setSegons(b.tiempo_acumulado_seg || 0);
            setPauses(b.pauses || []);
            setIncidencies(b.incidencies || []);
            setRetreball(!!b.retreball);
            setPausat(false);
            setOperacio(op);
            if (b.retrabajo_id) {
                activeRetrabajoRef.current = b.retrabajo_id;
                try { const retr = await pb.collection('retrabajos').getOne(b.retrabajo_id, { requestKey: `cont-retr-${b.retrabajo_id}` }); setRetrabajoRec(retr); setRetrabajoActiu(true); } catch {}
            }
            await pb.collection('borradores_operario').delete(b.id, { requestKey: `del-borr-${b.id}` }).catch(() => {});
            setBorradores((prev) => prev.filter((x) => x.id !== b.id));
            setView('cronometro');
        } catch (e) {
            setError('No se ha podido continuar el borrador.');
        }
    };

    const eliminarBorrador = async (b) => {
        try {
            if (b.registre_id) { await pb.collection('registres').delete(b.registre_id, { requestKey: `del-borr-reg-${b.id}` }).catch(() => {}); }
            await pb.collection('borradores_operario').delete(b.id, { requestKey: `del-borr2-${b.id}` });
            setBorradores((prev) => prev.filter((x) => x.id !== b.id));
        } catch (e) { setError('No se ha podido eliminar el borrador.'); }
    };

    const guardarITornar = useCallback(async () => {
        if (registre && cronMono) {
            try {
                await pb.collection('registres').update(registre.id, {
                    temps_real_seg: segons,
                    pauses,
                    incidencies,
                    retreball,
                    estat: 'pausat',
                }, { requestKey: `guardar-pausa-${registre.id}-${Date.now()}` });
            } catch (e) { console.error('[OperarioPage] guardarITornar', e); /* silent */ }
        }
        clearCronState();
        setRegistre(null);
        setDialeg(null);
        setView('detail');
        setFaseSelec(null);
        setRetrabajoActiu(false);
        await carrega();
    }, [registre, cronMono, segons, pauses, incidencies, retreball, carrega, clearCronState]);

    const backToQueue = useCallback(() => {
        setView('queue');
        setExclusivaId(null);
        setFaseSelec(null);
        setOperacio(null);
    }, []);

    const selectExclusiva = useCallback((id) => {
        setExclusivaId(id);
        setFaseSelec(null);
        setOperacio(null);
        setSaltades(new Set());
        setView('detail');
    }, []);

    const handleBack = useCallback(() => {
        if (view === 'cronometro') {
            if (!pausat) setPausat(true);
            guardarITornar();
        } else if (view === 'libre') {
            // Pausar trabajo libre y volver al detalle (sin finalizar)
            const rec = lliureRegistreRef.current;
            setLliurePausat(true);
            lliurePauseStartRef.current = Date.now();
            if (rec) {
                pb.collection('registres').update(rec.id, {
                    estat: 'pausat',
                    temps_real_seg: lliureSegonsRef.current,
                    pauses: [],
                    incidencies: lliureIncidenciesRef.current,
                    operacio: 'Trabajo libre',
                    notes: (lliureDescRef.current || '').slice(0, 2000),
                }).catch(() => {});
            }
            clearInterval(lliureTimerRef.current);
            setLliureRegistre(null);
            lliureRegistreRef.current = null;
            clearLliureState();
            setView('detail');
        } else if (view === 'detail') {
            backToQueue();
        }
    }, [view, pausat, faseSelec, guardarITornar, backToQueue, clearLliureState]);

    const iniciar = async (op) => {
        if (!monoRef) return;
        try {
            await closeOtherActiveRegistres({ operariId: user.id, monoId: monoRef.id, exclusivaId: monoRef.exclusiva });
            const rec = await pb.collection('registres').create({
                mono: monoRef.id,
                exclusiva: monoRef.exclusiva,
                operari: user.id,
                operacio: op.nom,
                inici: new Date().toISOString(),
                ultima_reanudacio: new Date().toISOString(),
                temps_estandard_seg: Number(op.temps_std_min ?? 0) * 60,
                estat: 'en_curs',
                control_qualitat: 'pendent',
                tipus: 'normal',
            });
            // Sellar el operario asignado en el mono: garantiza que el
            // dashboard en vivo pueda atribuir la unidad aunque el registro
            // de tiempo no sea visible (relación rota, registro cerrado, etc.).
            await pb.collection('monos').update(monoRef.id, { estat: 'en_curs', operacio_actual: op.nom, operari_assignat: user.id });
            inici.current = Date.now();
            pauseStartRef.current = null;
            setCronMono(monoRef);
            setRegistre(rec);
            setSegons(0);
            setPauses([]);
            setIncidencies([]);
            setRetreball(false);
            setPausat(false);
            setOperacio(op);
            setView('cronometro');
            addSessionOp(user.id, op);
            setSessionOps(getSessionOps(user.id));
        } catch {
            setError('No se ha podido iniciar la operación.');
        }
    };

    const iniciarReoperacio = async (op) => {
        if (!monoRef) return;
        const originalReg = registresMono.find(r =>
            r.mono === monoRef.id && r.operacio === op.nom && r.estat === 'finalitzat'
        ) || null;
        try {
            await closeOtherActiveRegistres({ operariId: user.id, monoId: monoRef.id, exclusivaId: monoRef.exclusiva });
            const rec = await pb.collection('registres').create({
                mono: monoRef.id,
                exclusiva: monoRef.exclusiva,
                operari: user.id,
                operacio: op.nom,
                inici: new Date().toISOString(),
                ultima_reanudacio: new Date().toISOString(),
                temps_estandard_seg: Number(op.temps_std_min ?? 0) * 60,
                estat: 'en_curs',
                control_qualitat: 'pendent',
                tipus: 'reoperacio',
                ...(originalReg ? { registre_original: originalReg.id } : {}),
            });
            await pb.collection('monos').update(monoRef.id, { estat: 'en_curs', operacio_actual: op.nom, operari_assignat: user.id });
            inici.current = Date.now();
            pauseStartRef.current = null;
            setCronMono(monoRef);
            setRegistre(rec);
            setSegons(0);
            setPauses([]);
            setIncidencies([]);
            setRetreball(false);
            setPausat(false);
            setOperacio(op);
            setView('cronometro');
            addSessionOp(user.id, op);
            setSessionOps(getSessionOps(user.id));
        } catch {
            setError('No se ha podido iniciar la reoperación.');
        }
    };

    // Iniciar o CONTINUAR una FASE como una sola operación agregada.
    // Si ya hay un registre en_curs/pausat del operario para esta fase+mono,
    // se reanuda (sin duplicar ni perder tiempo/historial). Si no, se crea uno nuevo.
    const iniciarFase = async (faseNom) => {
        const stdMin = faseStdMin(faseNom);
        const faseCanon = canonFase(faseNom);
        const op = { nom: faseNom, codi: 'FASE', fase: faseNom, temps_std_min: stdMin, maquina: '', instruccions: '' };
        const relId = (v) => {
            if (!v) return '';
            if (typeof v === 'string') return v;
            return v.id || '';
        };
        try {
            setError('');
            const mono = await ensureMonoForExclusiva();
            if (!mono) {
                setError('No se ha podido preparar la unidad de trabajo.');
                return;
            }
            const operariId = user?.id || pb.authStore?.record?.id || '';
            if (!operariId) {
                setError('No se ha podido iniciar la fase: sesión no válida.');
                return;
            }
            const exId = relId(mono.exclusiva) || selectedExclusiva?.ex?.id || '';
            const matchFaseReg = (r) => {
                const opNom = r.operacio || '';
                return opNom === faseNom || canonFase(opNom) === faseCanon;
            };

            // 1) Buscar ciclo activo/pausado del MISMO operario para esta fase
            //    (local + servidor). Preferir el más reciente.
            //    También acepta registros sin operari (huérfanos de sesiones previas)
            //    en el mismo mono+fase para no bloquear "Continuar fase".
            let existing = null;
            const sameWork = (r) =>
                (r.estat === 'en_curs' || r.estat === 'pausat')
                && (relId(r.mono) === mono.id || (!relId(r.mono) && exId && relId(r.exclusiva) === exId))
                && matchFaseReg(r);
            const mineOrOrphan = (r) => {
                const opId = relId(r.operari);
                return !opId || opId === operariId;
            };
            const localCandidates = (registresMono || [])
                .filter((r) => sameWork(r) && mineOrOrphan(r))
                .sort((a, b) => {
                    // Preferir los del operario actual sobre huérfanos
                    const aMine = relId(a.operari) === operariId ? 1 : 0;
                    const bMine = relId(b.operari) === operariId ? 1 : 0;
                    if (aMine !== bMine) return bMine - aMine;
                    return new Date(b.updated || b.inici || 0) - new Date(a.updated || a.inici || 0);
                });
            if (localCandidates.length) existing = localCandidates[0];

            if (!existing) {
                try {
                    const remote = await pb.collection('registres').getFullList({
                        filter: pb.filter(
                            '(estat = "en_curs" || estat = "pausat") && (mono = {:mono} || exclusiva = {:ex})',
                            { mono: mono.id, ex: exId || mono.id },
                        ),
                        sort: '-updated',
                        requestKey: `fase-find-${mono.id}-${faseCanon}-${Date.now()}`,
                    });
                    const remoteMine = (remote || []).filter((r) => sameWork(r) && mineOrOrphan(r));
                    remoteMine.sort((a, b) => {
                        const aMine = relId(a.operari) === operariId ? 1 : 0;
                        const bMine = relId(b.operari) === operariId ? 1 : 0;
                        if (aMine !== bMine) return bMine - aMine;
                        return 0;
                    });
                    existing = remoteMine[0] || null;
                } catch {
                    // best-effort: si falla la búsqueda, se intentará crear
                }
            }

            // 2) Cerrar otros cronómetros del operario, conservando el que vamos a continuar
            await closeOtherActiveRegistres({
                operariId,
                monoId: mono.id,
                exclusivaId: exId,
                keepId: existing?.id || null,
            });

            const openCron = (rec, baseSeg) => {
                const seg = Math.max(0, Number(baseSeg) || 0);
                inici.current = Date.now() - seg * 1000;
                pauseStartRef.current = null;
                setCronMono(mono);
                setRegistre(rec);
                setSegons(seg);
                setPauses(Array.isArray(rec.pauses) ? rec.pauses : []);
                setIncidencies(Array.isArray(rec.incidencies) ? rec.incidencies : []);
                setRetreball(!!rec.retreball);
                setPausat(false);
                setOperacio(op);
                setView('cronometro');
                setRegistresMono((prev) => {
                    const others = (prev || []).filter((r) => r.id !== rec.id);
                    return [{ ...rec, estat: 'en_curs', temps_real_seg: seg }, ...others];
                });
            };

            // 3) Reanudar ciclo existente (Continuar fase)
            if (existing?.id) {
                const araIso = new Date().toISOString();
                // Congelar tiempo productivo actual ANTES de resetear ultima_reanudacio:
                // si estaba en_curs, sumar el tramo vivo (cap 8h); si pausat, usar guardado.
                const MAX_LIVE = 8 * 60 * 60;
                const stored = Number(existing.temps_real_seg);
                let baseSeg = Number.isFinite(stored) && stored > 0 ? stored : 0;
                if (existing.estat === 'en_curs') {
                    const ref = existing.ultima_reanudacio || existing.inici;
                    if (ref) {
                        const live = Math.max(0, Math.floor((Date.now() - new Date(ref).getTime()) / 1000));
                        if (live <= MAX_LIVE) baseSeg += live;
                    }
                }
                let rec = existing;
                try {
                    rec = await pb.collection('registres').update(
                        existing.id,
                        {
                            estat: 'en_curs',
                            temps_real_seg: baseSeg,
                            ultima_reanudacio: araIso,
                            // Asegurar vínculos por si el registro quedó huérfano/incompleto
                            ...(exId && !relId(existing.exclusiva) ? { exclusiva: exId } : {}),
                            ...(mono.id && !relId(existing.mono) ? { mono: mono.id } : {}),
                            ...(!relId(existing.operari) ? { operari: operariId } : {}),
                            operacio: existing.operacio || faseNom,
                        },
                        { requestKey: `fase-resume-${existing.id}` },
                    );
                } catch {
                    // Si el update falla (p.ej. registro borrado), reintentar get+update
                    try {
                        const fresh = await pb.collection('registres').getOne(existing.id, { requestKey: `fase-get-${existing.id}` });
                        const st2 = Number(fresh.temps_real_seg);
                        baseSeg = Number.isFinite(st2) && st2 > 0 ? st2 : baseSeg;
                        rec = await pb.collection('registres').update(
                            fresh.id,
                            { estat: 'en_curs', temps_real_seg: baseSeg, ultima_reanudacio: araIso },
                            { requestKey: `fase-resume2-${fresh.id}` },
                        );
                    } catch {
                        rec = null;
                    }
                }
                if (rec?.id) {
                    pb.collection('monos').update(mono.id, { estat: 'en_curs', operacio_actual: faseNom, operari_assignat: operariId }).catch(() => {});
                    openCron(rec, baseSeg);
                    return;
                }
            }

            // 4) Crear ciclo nuevo (Iniciar fase)
            const payloadBase = {
                mono: mono.id,
                exclusiva: exId || undefined,
                operari: operariId,
                operacio: faseNom,
                inici: new Date().toISOString(),
                ultima_reanudacio: new Date().toISOString(),
                temps_estandard_seg: stdMin * 60,
                temps_real_seg: 0,
                estat: 'en_curs',
                control_qualitat: 'pendent',
            };
            let rec;
            try {
                rec = await pb.collection('registres').create(
                    { ...payloadBase, tipus: 'fase' },
                    { requestKey: `fase-create-${mono.id}-${Date.now()}` },
                );
            } catch (errFase) {
                // Compatibilidad si el select tipus aún no incluye "fase"
                try {
                    rec = await pb.collection('registres').create(
                        { ...payloadBase, tipus: 'normal' },
                        { requestKey: `fase-create-n-${mono.id}-${Date.now()}` },
                    );
                } catch (errNormal) {
                    // eslint-disable-next-line no-console
                    console.error('[OperarioPage] iniciarFase create failed', errFase, errNormal);
                    throw errNormal || errFase;
                }
            }
            pb.collection('monos').update(mono.id, { estat: 'en_curs', operacio_actual: faseNom, operari_assignat: operariId }).catch(() => {});
            openCron(rec, 0);
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('[OperarioPage] iniciarFase error', e?.status, e?.message, e?.response);
            setError('No se ha podido iniciar la fase.');
        }
    };

    // Reoperación de una fase ya completada (mismo mecanismo que iniciarFase
    // pero con tipus='reoperacio' para trazabilidad).
    const iniciarReoperacioFase = async (faseNom) => {
        const stdMin = faseStdMin(faseNom);
        const op = { nom: faseNom, codi: 'FASE', fase: faseNom, temps_std_min: stdMin, maquina: '', instruccions: '' };
        try {
            const mono = await ensureMonoForExclusiva();
            if (!mono) {
                setError('No se ha podido preparar la unidad de trabajo.');
                return;
            }
            await closeOtherActiveRegistres({
                operariId: user.id,
                monoId: mono.id,
                exclusivaId: mono.exclusiva || selectedExclusiva?.ex?.id,
            });
            const rec = await pb.collection('registres').create({
                mono: mono.id,
                exclusiva: mono.exclusiva || selectedExclusiva?.ex?.id,
                operari: user.id,
                operacio: faseNom,
                inici: new Date().toISOString(),
                ultima_reanudacio: new Date().toISOString(),
                temps_estandard_seg: stdMin * 60,
                estat: 'en_curs',
                control_qualitat: 'pendent',
                tipus: 'reoperacio',
            });
            await pb.collection('monos').update(mono.id, { estat: 'en_curs', operacio_actual: faseNom, operari_assignat: user.id });
            inici.current = Date.now();
            pauseStartRef.current = null;
            setCronMono(mono);
            setRegistre(rec);
            setSegons(0);
            setPauses([]);
            setIncidencies([]);
            setRetreball(false);
            setPausat(false);
            setOperacio(op);
            setView('cronometro');
        } catch {
            setError('No se ha podido iniciar la reoperación de la fase.');
        }
    };

    // Guarda una pausa cerrada en el historial de pausas para poder
    // verificar su inicio, fin/reanudación, duración y causa. Se llama al
    // reanudar (no al pausar), cuando la pausa ya tiene fin y duración.
    const guardarHistorialPausa = useCallback(async (pauseEntry, registreId, monoRec, exclusivaId, operacioNom, tipus) => {
        try {
            await pb.collection('historial_pausas').create({
                registre_id: registreId || '',
                operari: user?.id || '',
                exclusiva: exclusivaId || '',
                mono: monoRec?.id || '',
                operacio: operacioNom || '',
                tipus: tipus || 'crono',
                inici: pauseEntry?.inici || pauseEntry?.hora || '',
                fi: pauseEntry?.fi || '',
                durada_seg: Number(pauseEntry?.durada_seg) || 0,
                causa: pauseEntry?.motiu || '',
                inactivitat: !!(pauseEntry?.motiu && String(pauseEntry.motiu).includes('Inactividad')),
            }, { requestKey: `hist-pausa-${registreId}-${Date.now()}` });
        } catch (e) { console.error('[OperarioPage] guardarHistorialPausa', e); }
    }, [user?.id]);

    const afegirPausa = (motiu) => {
        pausatByUs.current = true;
        const ara = new Date();
        const araIso = ara.toISOString();
        const novesPauses = [...pauses, { motiu, inici: araIso, hora: araIso }];
        pauseStartRef.current = ara.getTime();
        setPauses(novesPauses);
        setPausat(true);
        setDialeg(null);
        // Sincronizar la pausa con el servidor: el tiempo pausado NO se cuenta
        // como productivo. Se guarda temps_real_seg (productivo hasta ahora) y
        // estat=pausat para que los paneles en vivo congelen el tiempo.
        if (registre) {
            pb.collection('registres').update(registre.id, {
                estat: 'pausat',
                temps_real_seg: segons,
                pauses: novesPauses,
                incidencies,
                retreball,
            }, { requestKey: `pausa-${registre.id}` }).catch(() => {});
        }
        setTimeout(() => { pausatByUs.current = false; }, 2000);
    };

    // Reanudar la operación pausada: vuelve a contar tiempo productivo solo
    // desde la reanudación, sin incluir el intervalo pausado. Registra el
    // tiempo de parada (con su causa) en el registro horario y en la pausa.
    const reanudar = () => {
        const ara = new Date();
        const araIso = ara.toISOString();
        const araMs = ara.getTime();
        const startMs = pauseStartRef.current;
        const duradaSeg = startMs ? Math.max(0, Math.floor((araMs - startMs) / 1000)) : 0;
        // Cerrar la pausa abierta con su fin y duración (trazabilidad del paro)
        let novesPauses = pauses;
        let pauseTancada = null;
        if (pauses.length > 0) {
            const last = pauses[pauses.length - 1];
            if (!last.fi) {
                pauseTancada = { ...last, fi: araIso, durada_seg: duradaSeg };
                novesPauses = [...pauses];
                novesPauses[novesPauses.length - 1] = pauseTancada;
                setPauses(novesPauses);
            }
        }
        // Acumular tiempo de parada en el registro horario
        if (registroHorarioRef.current && duradaSeg > 0) {
            registroHorarioRef.current.tiempoParadaMin =
                (registroHorarioRef.current.tiempoParadaMin || 0) + Math.round(duradaSeg / 60);
        }
        pauseStartRef.current = null;
        setPausat(false);
        // Actualizar el servidor: reanudar y fijar ultima_reanudacio para que
        // el tiempo en vivo siga sumando solo desde aquí.
        if (registre) {
            pb.collection('registres').update(registre.id, {
                estat: 'en_curs',
                ultima_reanudacio: araIso,
                pauses: novesPauses,
            }, { requestKey: `reanudar-${registre.id}` }).catch(() => {});
            // Guardar la pausa cerrada en el historial de pausas (verificación)
            if (pauseTancada) {
                const exId = cronMono?.exclusiva || selectedExclusiva?.ex?.id || registre.exclusiva || null;
                void guardarHistorialPausa(pauseTancada, registre.id, cronMono, exId, operacio?.nom || registre.operacio || '', registre.tipus === 'lliure' ? 'lliure' : 'crono');
            }
        }
    };

    // Reconcilia el estado del registro activo con el servidor al volver a
    // la pestaña visible. Corrige la discrepancia por la que una operación
    // activa (en_curs) para el operario aparecía como pausada en el Dashboard:
    // el beacon de auto-pausa (al ocultar la pestaña / bloquear pantalla)
    // marca el registro como 'pausat' en el servidor, pero el estado local del
    // operario sigue 'en_curs'. Al volver a ser visible, si el operario no
    // pausó intencionalmente, se reanuda en el servidor para que todas las
    // vistas (Operarios, Dashboard en vivo, Producción, Admin) usen la misma
    // fuente de verdad. También cierra la pausa abierta y la guarda en el
    // historial de pausas.
    const reconciliarRegistre = useCallback(async (registreId, esLliure) => {
        try {
            const rec = await pb.collection('registres').getOne(registreId, { requestKey: `recon-${registreId}` });
            // Solo reconciliar si el servidor dice pausat pero localmente estamos en curso
            if (rec.estat !== 'pausat') return;
            const ara = new Date();
            const araIso = ara.toISOString();
            const araMs = ara.getTime();
            let pauseTancada = null;
            let novesPauses = [];
            let duradaSeg = 0;
            let iniciIso = '';
            if (!esLliure) {
                novesPauses = Array.isArray(rec.pauses) ? rec.pauses : [];
                if (novesPauses.length > 0) {
                    const last = novesPauses[novesPauses.length - 1];
                    if (!last.fi) {
                        const startMs = pauseStartRef.current || (last.inici ? new Date(last.inici).getTime() : araMs);
                        duradaSeg = Math.max(0, Math.floor((araMs - startMs) / 1000));
                        pauseTancada = { ...last, fi: araIso, durada_seg: duradaSeg };
                        novesPauses = [...novesPauses.slice(0, -1), pauseTancada];
                        iniciIso = pauseTancada.inici || pauseTancada.hora || '';
                        setPauses(novesPauses);
                    }
                }
            } else {
                const startMs = lliurePauseStartRef.current;
                if (startMs) {
                    duradaSeg = Math.max(0, Math.floor((araMs - startMs) / 1000));
                    iniciIso = new Date(startMs).toISOString();
                    pauseTancada = { motiu: '', inici: iniciIso, fi: araIso, durada_seg: duradaSeg };
                }
            }
            // Acumular tiempo de parada en el registro horario
            if (registroHorarioRef.current && duradaSeg > 0) {
                registroHorarioRef.current.tiempoParadaMin =
                    (registroHorarioRef.current.tiempoParadaMin || 0) + Math.round(duradaSeg / 60);
            }
            pauseStartRef.current = null;
            lliurePauseStartRef.current = null;
            // Reanudar en el servidor: única fuente de verdad para todas las vistas
            await pb.collection('registres').update(registreId, {
                estat: 'en_curs',
                ultima_reanudacio: araIso,
                ...(esLliure ? {} : { pauses: novesPauses }),
            }, { requestKey: `recon-resume-${registreId}` });
            // Guardar la pausa cerrada en el historial de pausas
            if (pauseTancada && duradaSeg > 0) {
                const exId = esLliure ? lliureExclusivaId : (cronMono?.exclusiva || selectedExclusiva?.ex?.id || rec.exclusiva || null);
                const monoRec = esLliure ? lliureMono : cronMono;
                const opNom = esLliure ? 'Trabajo libre' : (operacio?.nom || rec.operacio || '');
                void guardarHistorialPausa(pauseTancada, registreId, monoRec, exId, opNom, esLliure ? 'lliure' : 'crono');
            }
        } catch (e) { /* silent: si no se puede reconciliar, el operario puede reanudar manualmente */ }
    }, [guardarHistorialPausa, cronMono, selectedExclusiva, operacio, lliureExclusivaId, lliureMono]);

    // Al volver a la pestaña visible, reconciliar el registro activo con el
    // servidor para que el Dashboard en vivo no muestre un estado pausado
    // obsoleto cuando el operario sigue trabajando.
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState !== 'visible') return;
            if (view === 'cronometro' && registre?.id && !pausat) {
                void reconciliarRegistre(registre.id, false);
            }
            if (view === 'libre' && lliureRegistreRef.current?.id && !lliurePausatRef.current) {
                void reconciliarRegistre(lliureRegistreRef.current.id, true);
            }
        };
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('pageshow', onVisible);
        return () => {
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('pageshow', onVisible);
        };
    }, [view, registre, pausat, reconciliarRegistre]);

    /* ─── Control de inactividad: manejadores del popup ─────────────────── */
    // El operario responde si la exclusiva está terminada o continúa pausada.
    // No se cierra ni modifica el estado automáticamente sin respuesta explícita.
    const inactivitatTerminada = () => {
        // Seguir el flujo existente: abrir el diálogo de control de calidad.
        // Así se completa/cierra el trabajo sin duplicar registros ni perder el
        // tiempo ya registrado (lo gestiona finalitzar / finalitzarLliure).
        setInactivitatPopup(null);
        inactivitatShownRef.current = false;
        lastActivityRef.current = Date.now();
        if (view === 'libre') {
            setDialeg('final_lliure');
        } else {
            setDialeg('final');
        }
    };

    const inactivitatContinuaPausada = () => {
        // Abrir el listado de selección obligatoria de causa.
        setInactivitatPopup('causa');
    };

    // Tras elegir la causa (Incidencia / Parado por encargado), se pausa el
    // registro guardando la causa junto con la exclusiva, el operario y la
    // actividad/registro correspondiente. No se crea un registro duplicado: se
    // actualiza el registro en curso a "pausat" con la causa.
    const inactivitatGuardarCausa = async (causa) => {
        const motiuPausa = `Inactividad: ${causa}`;
        if (view === 'libre') {
            const rec = lliureRegistreRef.current;
            if (rec) {
                try {
                    await pb.collection('registres').update(rec.id, {
                        estat: 'pausat',
                        temps_real_seg: lliureSegonsRef.current,
                        pauses: [{ motiu: motiuPausa, hora: new Date().toISOString() }],
                        incidencies: lliureIncidenciesRef.current,
                        operacio: 'Trabajo libre',
                        notes: (lliureDescRef.current || '').slice(0, 2000),
                        motiu_pausa_inactivitat: causa,
                        inactivitat_detectada: true,
                    });
                } catch (e) { console.error('[OperarioPage] inactivitat guardar causa (lliure)', e); }
            }
            setLliurePausat(true);
            lliurePausatRef.current = true;
            lliurePauseStartRef.current = Date.now();
        } else if (registre) {
            pausatByUs.current = true;
            const araIso = new Date().toISOString();
            const novesPauses = [...pauses, { motiu: motiuPausa, inici: araIso, hora: araIso }];
            setPauses(novesPauses);
            setPausat(true);
            pauseStartRef.current = Date.now();
            try {
                await pb.collection('registres').update(registre.id, {
                    estat: 'pausat',
                    temps_real_seg: segons,
                    pauses: novesPauses,
                    incidencies,
                    retreball,
                    motiu_pausa_inactivitat: causa,
                    inactivitat_detectada: true,
                });
            } catch (e) { console.error('[OperarioPage] inactivitat guardar causa (crono)', e); }
            setTimeout(() => { pausatByUs.current = false; }, 2000);
        }
        setInactivitatPopup(null);
        inactivitatShownRef.current = false;
        lastActivityRef.current = Date.now();
        setAdminNotif({
            type: 'pausa',
            msg: `Cronómetro pausado por inactividad. Causa: ${causa}. Puedes reanudar cuando continúes.`,
        });
    };

    const iniciarRetrabajo = async (retr) => {
        if (!retr) return;
        try {
            // Find the mono for this retrabajo
            const monoId = retr.mono || retr.expand?.mono?.id;
            let mono = retr.expand?.mono;
            if (!mono && monoId) {
                mono = await pb.collection('monos').getOne(monoId, { requestKey: `retr-mono-${retr.id}` });
            }
            if (!mono) { setError('No se encontró el mono del retrabajo.'); return; }
            // Cerrar cualquier cronómetro en_curs huérfano del operario antes de
            // iniciar el retrabajo (solo puede haber uno activo a la vez).
            await closeOtherActiveRegistres({ operariId: user.id, monoId: mono.id, exclusivaId: retr.exclusiva });
            const opDef = opsDef.find(o => o.nom === retr.operacion_original) || null;
            const opFake = {
                nom: retr.operacion_original,
                codi: retr.operacion_codi || '',
                fase: retr.fase || '',
                temps_std_min: retr.temps_estimat_min || opDef?.temps_std_min || 0,
                maquina: opDef?.maquina || '',
                instruccions: retr.notas || '',
            };
            const rec = await pb.collection('registres').create({
                mono: mono.id,
                exclusiva: retr.exclusiva,
                operari: user.id,
                operacio: retr.operacion_original,
                inici: new Date().toISOString(),
                ultima_reanudacio: new Date().toISOString(),
                temps_estandard_seg: Number(opFake.temps_std_min) * 60,
                estat: 'en_curs',
                control_qualitat: 'pendent',
                tipus: 'reoperacio',
            });
            // Mark retrabajo en_proceso, link registre, and stamp rework start time
            await pb.collection('retrabajos').update(retr.id, { estado: 'en_proceso', registre_id: rec.id, fecha_inicio_retrabajo: new Date().toISOString() }, { requestKey: `retr-start-${retr.id}` });
            setRetrabajoRec(retr);
            await pb.collection('monos').update(mono.id, { estat: 'en_curs', operacio_actual: retr.operacion_original, operari_assignat: user.id });
            activeRetrabajoRef.current = retr.id;
            inici.current = Date.now();
            pauseStartRef.current = null;
            setCronMono(mono);
            setRegistre(rec);
            setSegons(0);
            setPauses([]);
            setIncidencies([]);
            setRetreball(false);
            setPausat(false);
            setOperacio(opFake);
            setRetrFotosDespues([]);
            setRetrVideos([]);
            setRetrabajoActiu(true);
            setView('cronometro');
        } catch (e) {
            console.error(e);
            setError('No se ha podido iniciar el retrabajo.');
        }
    };

    const finalitzar = async (qualitat) => {
        if (!registre || !cronMono) return;
        const wasRetrabajo = !!activeRetrabajoRef.current;
        const fiIso = new Date().toISOString();
        // 1) Guardado crítico: el OK de confección se registra en el registre.
        //    Aislado del resto: si esto falla, el operario ve el error; si
        //    succeeds, los pasos secundarios (tiempos, mono, retrabajo) no
        //    deben impedir que el OK quede registrado. requestKey único para
        //    evitar auto-cancel del SDK con otras escrituras del mismo registre.
        try {
            await pb.collection('registres').update(registre.id, {
                fi: fiIso,
                temps_real_seg: segons,
                pauses,
                incidencies,
                retreball,
                control_qualitat: qualitat,
                estat: 'finalitzat',
            }, { requestKey: `finalitzar-${registre.id}-${Date.now()}` });
        } catch (e) {
            console.error('[OperarioPage] finalitzar registre', e?.status, e?.message, e?.response);
            setError('No se ha podido guardar el registro.');
            return;
        }
        // 2) Tiempo en tiempos_exclusiva (best-effort: no bloquea el OK)
        try {
            await pb.collection('tiempos_exclusiva').create({
                exclusiva: cronMono.exclusiva,
                mono: cronMono.id,
                operario: user?.id,
                operacion_id: operacio?.codi || '',
                operacion_nom: operacio?.nom || '',
                tiempo_seg: segons,
                fecha_inicio: registre.inici,
                fecha_fin: fiIso,
                tipo: wasRetrabajo ? 'retrabajo' : 'operacion',
            }, { requestKey: `temps-${registre.id}-${Date.now()}` });
        } catch (e) { console.error('[OperarioPage] finalitzar tiempos_exclusiva', e); }

        // 3) Actualizar estado del mono (best-effort: no bloquea el OK)
        // Una unidad se considera finalitzada cuando TODAS sus fases
        // esperadas están terminadas (no solo la última en orden). Esto es
        // robusto frente a fases terminadas en orden distinto, nombres
        // canónicos (Fase 3 vs FASE 3) o artículos CIK con Fase 4. La fase
        // que se acaba de finalizar (operacio.nom) cuenta como completada
        // aunque el registro local aún no refleje el cambio.
        const expectedNow = expectedFasesForExclusiva(selectedExclusiva?.ex, articles);
        const monoRegsNow = (registresMono || []).filter((r) => r.mono === cronMono.id);
        const allFasesDone = expectedNow.length > 0 && expectedNow.every((f) =>
            canonFase(f) === canonFase(operacio.nom)
            || monoRegsNow.some((r) =>
                r.estat === 'finalitzat'
                && (!r.control_qualitat || r.control_qualitat === 'ok' || r.control_qualitat === 'aprovat' || r.control_qualitat === 'pendent')
                && canonFase(r.operacio) === canonFase(f)),
        );
        // Fallback: si no hay fases esperadas, usar la última operación de la ruta.
        const esUltima = allFasesDone
            || (rutaOps.length > 0 && rutaOps[rutaOps.length - 1].nom === operacio.nom);
        try {
            await pb.collection('monos').update(cronMono.id, {
                estat: qualitat === 'ko' ? 'retreball' : esUltima ? 'finalitzat' : 'en_curs',
                operacio_actual: qualitat === 'ko' ? operacio.nom : esUltima ? 'Finalizado' : operacio.nom,
            }, { requestKey: `mono-fi-${cronMono.id}-${Date.now()}` });
        } catch (e) { console.error('[OperarioPage] finalitzar mono', e); }
        // If this was a retrabajo, mark it completado (goes back to QC verification)
        if (activeRetrabajoRef.current) {
            try {
                const retrId = activeRetrabajoRef.current;
                if (qualitat === 'ok') {
                    // Upload fotos_despues + videos if any, then mark completado
                    if (retrFotosDespues.length > 0 || retrVideos.length > 0) {
                        const fd = new FormData();
                        fd.append('estado', 'completado');
                        fd.append('fecha_completacion', fiIso);
                        fd.append('fecha_fin_retrabajo', fiIso);
                        fd.append('tiempo_retrabajo_seg', String(segons));
                        for (const f of retrFotosDespues) fd.append('fotos_despues', f);
                        for (const v of retrVideos) fd.append('videos', v);
                        await pb.collection('retrabajos').update(retrId, fd, { requestKey: `retr-upload-${retrId}-${Date.now()}` });
                    } else {
                        await pb.collection('retrabajos').update(retrId, {
                            estado: 'completado',
                            fecha_completacion: fiIso,
                            fecha_fin_retrabajo: fiIso,
                            tiempo_retrabajo_seg: segons,
                        }, { requestKey: `retr-fin-${retrId}-${Date.now()}` });
                    }
                } else {
                    // ko → operario could not fix it: mark rechazado so QC is notified
                    await pb.collection('retrabajos').update(retrId, {
                        estado: 'rechazado',
                        fecha_completacion: fiIso,
                    }, { requestKey: `retr-rej-${retrId}-${Date.now()}` });
                }
            } catch (e) { console.error('[OperarioPage] finalitzar retrabajo', e); }
            activeRetrabajoRef.current = null;
            setRetrFotosDespues([]);
            setRetrVideos([]);
            setRetrabajoActiu(false);
            setRetrabajoRec(null);
        }
        // Track productive time in registro horario
        if (registroHorarioRef.current) {
            registroHorarioRef.current.tiempoProductivoMin += Math.round(segons / 60);
            registroHorarioRef.current.operaciones += 1;
            if (cronMono?.exclusiva) registroHorarioRef.current.exclusivas.add(cronMono.exclusiva);
            if (registre?.tipus === 'reoperacio') registroHorarioRef.current.reoperaciones += 1;
        }
        clearCronState();
        setRegistre(null);
        setDialeg(null);
        await carrega();
        await carregaRetrabajos();
        // Back to queue after a retrabajo; detail view otherwise
        if (wasRetrabajo) {
            setView('queue');
            setExclusivaId(null);
            setFaseSelec(null);
        } else {
            setView('detail');
        }
    };

    /* ─── Trabajo libre (sin ruta) ─────────────────────────────────────── */
    // Usa el mismo mecanismo que las operaciones por ruta: un registro en `registres`
    // con tipus='lliure', estat en_curs/pausat/finalitzat. Así aparece en todos los
    // paneles en vivo (DashboardEnViu), en el historial de la exclusiva, trazabilidad,
    // y la exclusiva muestra "En proceso" aunque no tenga ruta ni operaciones definidas.
    const iniciarLliure = async () => {
        if (!selectedExclusiva) return;
        const mono = selectedExclusiva.monos?.[0] || null;
        const exId = selectedExclusiva.ex.id;
        // Cerrar cualquier cronómetro en_curs huérfano del operario antes de
        // iniciar/reanudar trabajo libre (solo puede haber uno activo a la vez).
        await closeOtherActiveRegistres({ operariId: user.id, monoId: mono?.id, exclusivaId: exId });
        // Reanudar trabajo libre existente (pausado o en curso) para esta exclusiva + operario
        try {
            const existing = await pb.collection('registres').getFirstListItem(
                pb.filter('exclusiva = {:ex} && operari = {:op} && tipus = "lliure" && (estat = "en_curs" || estat = "pausat")', { ex: exId, op: user.id }),
                { requestKey: `lliure-find-${exId}` },
            ).catch(() => null);
            if (existing) {
                const araIso = new Date().toISOString();
                await pb.collection('registres').update(existing.id, { estat: 'en_curs', ultima_reanudacio: araIso });
                lliurePauseStartRef.current = null;
                if (mono) {
                    await pb.collection('monos').update(mono.id, { estat: 'en_curs', operacio_actual: 'Trabajo libre', operari_assignat: user.id });
                }
                setLliureMono(mono);
                setLliureExclusivaId(exId);
                setLliureSnapshot({ exclusiva: selectedExclusiva.ex.exclusiva, article: selectedExclusiva.ex.article || '' });
                setLliureRegistre(existing);
                lliureRegistreRef.current = existing;
                setLliureDesc(existing.notes || '');
                setLliureSegons(existing.temps_real_seg || 0);
                setLliureIncidencies(existing.incidencies || []);
                setLliurePausat(false);
                const now = new Date();
                setLliureInici(now);
                lliureIniciRef.current = now;
                setView('libre');
                // eslint-disable-next-line no-console
                console.log('[OperarioPage] Reanudado trabajo libre existente', { registreId: existing.id, exclusiva: exId });
                return;
            }
        } catch (e) { console.error('[OperarioPage] iniciarLliure find existing', e); }
        // Crear nuevo registro de trabajo libre
        try {
            const rec = await pb.collection('registres').create({
                mono: mono?.id || null,
                exclusiva: exId,
                operari: user.id,
                operacio: 'Trabajo libre',
                notes: (lliureDesc || '').slice(0, 2000),
                inici: new Date().toISOString(),
                ultima_reanudacio: new Date().toISOString(),
                temps_estandard_seg: 0,
                estat: 'en_curs',
                control_qualitat: 'pendent',
                tipus: 'lliure',
            });
            if (mono) {
                await pb.collection('monos').update(mono.id, { estat: 'en_curs', operacio_actual: 'Trabajo libre', operari_assignat: user.id });
            }
            setLliureMono(mono);
            setLliureExclusivaId(exId);
            setLliureSnapshot({ exclusiva: selectedExclusiva.ex.exclusiva, article: selectedExclusiva.ex.article || '' });
            setLliureRegistre(rec);
            lliureRegistreRef.current = rec;
            setLliureSegons(0);
            setLliureIncidencies([]);
            setLliurePausat(false);
            lliurePauseStartRef.current = null;
            const now = new Date();
            setLliureInici(now);
            lliureIniciRef.current = now;
            setView('libre');
            // eslint-disable-next-line no-console
            console.log('[OperarioPage] Iniciado trabajo libre', {
                registreId: rec.id, exclusiva: exId, mono: mono?.id || null, operari: user.id,
            });
        } catch (e) {
            console.error('[OperarioPage] iniciarLliure error', e);
            setError('No se ha podido iniciar el trabajo libre.');
        }
    };

    // Persistir estado de trabajo libre en localStorage en cada cambio (para recuperación)
    useEffect(() => {
        lliureSegonsRef.current = lliureSegons;
        lliurePausatRef.current = lliurePausat;
        lliureIncidenciesRef.current = lliureIncidencies;
        lliureDescRef.current = lliureDesc;
        if (view !== 'libre' || !lliureRegistreRef.current) return;
        const state = {
            registreId: lliureRegistreRef.current.id,
            exclusivaId: lliureExclusivaId,
            exclusivaCode: lliureSnapshot?.exclusiva || '',
            monoId: lliureMono?.id || null,
            desc: lliureDesc,
            segons: lliureSegons,
            incidencies: lliureIncidencies,
            pausat: lliurePausat,
            snapshot: lliureSnapshot,
            savedAt: Date.now(),
        };
        try { localStorage.setItem(lliureStorageKey(user?.id), JSON.stringify(state)); } catch {}
    }, [view, lliureRegistre, lliureExclusivaId, lliureMono, lliureDesc, lliureSegons, lliureIncidencies, lliurePausat, lliureSnapshot, user?.id]);

    useEffect(() => {
        if (view !== 'libre' || lliurePausat) {
            clearInterval(lliureTimerRef.current);
            return;
        }
        lliureTimerRef.current = setInterval(() => {
            setLliureSegons((s) => s + 1);
        }, 1000);
        return () => clearInterval(lliureTimerRef.current);
    }, [view, lliurePausat]);

    const afegirIncidenciaLliure = (tipus, descripcio) => {
        setLliureIncidencies((l) => [...l, { tipus, descripcio, hora: new Date().toISOString() }]);
    };

    const pausarLliure = async () => {
        setLliurePausat(true);
        lliurePauseStartRef.current = Date.now();
        const rec = lliureRegistreRef.current;
        if (!rec) return;
        try {
            await pb.collection('registres').update(rec.id, {
                estat: 'pausat',
                temps_real_seg: lliureSegons,
                pauses: [],
                incidencies: lliureIncidencies,
                operacio: 'Trabajo libre',
                notes: (lliureDesc || '').slice(0, 2000),
            });
        } catch (e) { console.error('[OperarioPage] pausarLliure', e); }
    };

    const reanudarLliure = async () => {
        const ara = new Date();
        const araIso = ara.toISOString();
        const araMs = ara.getTime();
        const startMs = lliurePauseStartRef.current;
        const duradaSeg = startMs ? Math.max(0, Math.floor((araMs - startMs) / 1000)) : 0;
        const iniciIso = startMs ? new Date(startMs).toISOString() : '';
        // Acumular tiempo de parada en el registro horario
        if (registroHorarioRef.current && duradaSeg > 0) {
            registroHorarioRef.current.tiempoParadaMin =
                (registroHorarioRef.current.tiempoParadaMin || 0) + Math.round(duradaSeg / 60);
        }
        setLliurePausat(false);
        lliurePauseStartRef.current = null;
        const rec = lliureRegistreRef.current;
        if (!rec) return;
        try {
            await pb.collection('registres').update(rec.id, { estat: 'en_curs', ultima_reanudacio: araIso });
            // Guardar la pausa cerrada en el historial de pausas (verificación)
            if (duradaSeg > 0) {
                void guardarHistorialPausa(
                    { motiu: '', inici: iniciIso, fi: araIso, durada_seg: duradaSeg },
                    rec.id, lliureMono, lliureExclusivaId, 'Trabajo libre', 'lliure',
                );
            }
        } catch (e) { console.error('[OperarioPage] reanudarLliure', e); }
    };

    const finalitzarLliure = async (qualitat) => {
        if (!lliureExclusivaId) return;
        const rec = lliureRegistreRef.current;
        const fi = new Date();

        // 'pendent' = Guardar y salir: pausa el registro y permite continuar después
        if (qualitat === 'pendent') {
            if (rec) {
                try {
                    await pb.collection('registres').update(rec.id, {
                        estat: 'pausat',
                        temps_real_seg: lliureSegons,
                        pauses: [],
                        incidencies: lliureIncidencies,
                        operacio: 'Trabajo libre',
                        notes: (lliureDesc || '').slice(0, 2000),
                    }, { requestKey: `lliure-pendent-${rec.id}-${Date.now()}` });
                } catch (e) { console.error('[OperarioPage] finalitzarLliure pendent', e); }
            }
            clearInterval(lliureTimerRef.current);
            setLliureRegistre(null);
            lliureRegistreRef.current = null;
            clearLliureState();
            setView('detail');
            setLliureDesc('');
            await carrega();
            return;
        }

        // Finalizar ok/ko: marca el registro como finalitzat
        try {
            if (rec) {
                await pb.collection('registres').update(rec.id, {
                    fi: fi.toISOString(),
                    temps_real_seg: lliureSegons,
                    pauses: [],
                    incidencies: lliureIncidencies,
                    control_qualitat: qualitat,
                    estat: 'finalitzat',
                    operacio: 'Trabajo libre',
                    notes: (lliureDesc || '').slice(0, 2000),
                }, { requestKey: `lliure-fi-${rec.id}-${Date.now()}` });
            }
            // Registro histórico en operaciones_libres (compatibilidad)
            try {
                await pb.collection('operaciones_libres').create({
                    exclusiva: lliureExclusivaId,
                    mono: lliureMono?.id || null,
                    operario: user?.id,
                    descripcion: lliureDesc || 'Trabajo libre',
                    tiempo_seg: lliureSegons,
                    fecha_inicio: lliureIniciRef.current?.toISOString(),
                    fecha_fin: fi.toISOString(),
                    incidencias: lliureIncidencies,
                    control_qualitat: qualitat,
                }, { requestKey: 'oplibre-create' });
            } catch { /* silent */ }
            // Tiempo dedicado en tiempos_exclusiva
            try {
                await pb.collection('tiempos_exclusiva').create({
                    exclusiva: lliureExclusivaId,
                    mono: lliureMono?.id || null,
                    operario: user?.id,
                    operacion_id: 'libre',
                    operacion_nom: lliureDesc || 'Trabajo libre',
                    tiempo_seg: lliureSegons,
                    fecha_inicio: lliureIniciRef.current?.toISOString(),
                    fecha_fin: fi.toISOString(),
                    tipo: 'libre',
                }, { requestKey: 'oplibre-temps' });
            } catch { /* silent */ }
            // Actualizar mono: queda en producción (en_curs) o retreball si no conforme
            if (lliureMono?.id) {
                try {
                    await pb.collection('monos').update(lliureMono.id, {
                        estat: qualitat === 'ko' ? 'retreball' : 'en_curs',
                        operacio_actual: qualitat === 'ko' ? 'Trabajo libre' : 'Trabajo libre (finalizado)',
                    });
                } catch { /* silent */ }
            }
            // Tiempo productivo en registro horario
            if (registroHorarioRef.current) {
                registroHorarioRef.current.tiempoProductivoMin += Math.round(lliureSegons / 60);
                registroHorarioRef.current.operaciones += 1;
                if (lliureExclusivaId) registroHorarioRef.current.exclusivas.add(lliureExclusivaId);
            }
            // eslint-disable-next-line no-console
            console.log('[OperarioPage] Finalizado trabajo libre', {
                registreId: rec?.id, exclusiva: lliureExclusivaId, qualitat, segons: lliureSegons,
            });
        } catch (e) {
            console.error('[OperarioPage] finalitzarLliure', e);
            setError('No se ha podido guardar el trabajo libre.');
            return;
        }
        clearInterval(lliureTimerRef.current);
        clearLliureState();
        setLliureRegistre(null);
        lliureRegistreRef.current = null;
        setView('detail');
        setLliureSegons(0);
        setLliureIncidencies([]);
        setLliureDesc('');
        await carrega();
    };

    // Media semanal (7 días) del operario para la fase + marca actuales.
    // Se calcula a partir de sus registros válidos (sin pausas, sin >8h).
    // Devuelve null cuando no hay registros calculables → "Sin datos".
    const opsByNomOp = useMemo(() => {
        const m = {};
        (opsDef || []).forEach((op) => { if (op.nom) m[op.nom] = op; });
        return m;
    }, [opsDef]);

    const mitjanaOperari = useMemo(() => {
        if (view !== 'cronometro' || !operacio?.fase || !user?.id) return null;
        const valids = registresValids(recentRegistres, rangUltimsDies(7));
        const enriched = enriquirRegistres(valids, opsByNomOp);
        const marca = selectedExclusiva?.ex?.marca ? String(selectedExclusiva.ex.marca).trim() : '';
        return mitjanaOperariFaseMarca(enriched, user.id, canonFase(operacio.fase), marca);
    }, [view, operacio, user?.id, recentRegistres, opsByNomOp, selectedExclusiva]);

    const estandard = Number(operacio?.temps_std_min ?? 0) * 60;
    const desviacio = estandard ? Math.round(((segons - estandard) / estandard) * 100) : 0;

    /* ─── Status helpers ─────────────────────────────────────────────────── */
    const statusBadge = (s) => {
        if (s === 'completada') return 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))] border-[hsl(var(--ok))]/30';
        if (s === 'en_curs') return 'bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))] border-[hsl(var(--warn))]/40';
        if (s === 'disponible') return 'bg-primary/10 text-primary border-primary/30';
        return 'bg-secondary text-muted-foreground border-border opacity-50';
    };
    const statusLabel = { completada: 'Hecha', en_curs: 'En curso', disponible: 'Disponible' };

    /* ─── Render ─────────────────────────────────────────────────────────── */
    return (
        <div className="min-h-[100dvh] bg-[hsl(220,20%,95%)]">
            <Helmet>
                <title>Puesto de operario | Control de monos</title>
                <meta name="description" content="Pantalla táctil de taller para cronometrar operaciones, fases y controles de calidad." />
            </Helmet>

            {/* Header */}
            <header className="sticky top-0 z-20 bg-primary text-primary-foreground">
                <div className="stripe-top h-1.5" />
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex items-center gap-3">
                        {view !== 'queue' && (
                            <button onClick={handleBack}
                                className="rounded-md bg-white/15 p-2 active:scale-95"
                                aria-label="Volver">
                                <ChevronLeft className="h-5 w-5" />
                            </button>
                        )}
                        <Logo size="sm" />
                        <div>
                            <p className="font-display text-2xl uppercase leading-none">
                                {view === 'queue' && 'Cola de trabajo'}
                                {view === 'detail' && (faseSelec ? faseSelec : (selectedExclusiva?.ex.exclusiva || 'Exclusiva'))}
                                {view === 'cronometro' && 'Operación activa'}
                                {view === 'libre' && 'Trabajo libre'}
                            </p>
                            <p className="text-xs text-white/70">{user?.name || user?.codi}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`hidden sm:flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${online ? 'bg-white/15' : 'bg-destructive'}`}>
                            {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                        </span>
                        {view === 'queue' && (
                            <button onClick={carrega} className="rounded-md bg-white/15 p-2 active:scale-95" aria-label="Actualizar">
                                <RefreshCcw className="h-5 w-5" />
                            </button>
                        )}
                        <NotificationsBell />
                        <button onClick={async () => {
                            // Close jornada before logout
                            const rh = registroHorarioRef.current;
                            if (rh) {
                                const salida = new Date();
                                const durMin = Math.round((salida - new Date(rh.hora_entrada)) / 60000);
                                const improductivo = Math.max(0, durMin - rh.tiempoProductivoMin);
                                const incidencias = [];
                                const eH = new Date(rh.hora_entrada);
                                const eMin = eH.getHours() * 60 + eH.getMinutes();
                                const sMin = salida.getHours() * 60 + salida.getMinutes();
                                if (eMin > 8 * 60 + 15) incidencias.push('entrada_tarde');
                                if (sMin < 17 * 60 - 15 && durMin > 30) incidencias.push('salida_antes');
                                if (durMin < 8 * 60 - 30 && durMin > 30) incidencias.push('jornada_incompleta');
                                if (durMin > 60 && improductivo / durMin > 0.3) incidencias.push('tiempo_improductivo_alto');
                                const estado = incidencias.length > 0 ? 'con_problemas' : 'completo';
                                try {
                                    await pb.collection('registro_horario').update(rh.id, {
                                        hora_salida: salida.toISOString(),
                                        duracion_jornada_min: durMin,
                                        tiempo_productivo_min: rh.tiempoProductivoMin,
                                        tiempo_improductivo_min: improductivo,
                                        numero_operaciones_completadas: rh.operaciones,
                                        numero_exclusivas_completadas: rh.exclusivas.size,
                                        numero_reoperaciones: rh.reoperaciones,
                                        incidencias_horario: incidencias,
                                        estado,
                                    });
                                    registroHorarioRef.current = null;
                                } catch { /* silent */ }
                            }
                            logout(); navigate('/');
                        }} className="rounded-md bg-white/15 p-2 active:scale-95" aria-label="Salir">
                            <LogOut className="h-5 w-5" />
                        </button>
                    </div>
                </div>
            </header>

            {error && <p className="m-4 rounded-md bg-destructive/10 px-4 py-3 text-destructive">{error}</p>}

            {/* ── QUEUE VIEW ─────────────────────────────────────────────── */}
            {view === 'queue' && (
                <main className="p-4 sm:p-6">
                    <div className="mb-5 flex flex-wrap items-center gap-3">
                        <p className="text-sm text-muted-foreground font-semibold uppercase tracking-wide flex-1">
                            Entrega en los próximos 20 días
                        </p>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <input
                                value={searchQ}
                                onChange={e => setSearchQ(e.target.value)}
                                placeholder="Buscar exclusiva..."
                                className="h-10 w-56 rounded-xl border border-input bg-card pl-9 pr-3 text-sm"
                            />
                        </div>
                    </div>
                    {/* ── RETRABAJOS — priority section ── */}
                    {retrabajos.length > 0 && (
                        <div className="mb-6">
                            <p className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-destructive">
                                <RefreshCcw className="h-4 w-4" /> Retrabajos asignados — prioridad máxima ({retrabajos.length})
                            </p>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {retrabajos.map((r) => (
                                    <div key={r.id} className="relative overflow-hidden rounded-2xl border-4 border-destructive bg-destructive/5 p-5 shadow-sm">
                                        <div className="stripe-top absolute inset-x-0 top-0 h-1.5" />
                                        <div className="mt-1 flex items-start justify-between gap-2">
                                            <span className="rounded-md bg-destructive px-2.5 py-1 text-sm font-bold uppercase tracking-wide text-white">RETRABAJO</span>
                                            <span className="rounded-md bg-destructive/15 px-2 py-1 text-xs font-bold text-destructive">Intento #{r.numero_intento || 1}</span>
                                        </div>
                                        <p className="mt-3 font-display text-4xl uppercase leading-none">{r.expand?.exclusiva?.exclusiva || '—'}</p>
                                        {r.expand?.mono?.codi && <p className="text-sm font-semibold text-muted-foreground">Mono {r.expand.mono.codi}</p>}
                                        <div className="mt-3 rounded-lg bg-background/80 p-3">
                                            <p className="text-xs font-semibold uppercase text-muted-foreground">Operación a realizar</p>
                                            <p className="text-base font-bold">{r.operacion_original || '—'}</p>
                                            {r.fase && <p className="text-xs text-muted-foreground">{r.fase}</p>}
                                        </div>
                                        <div className="mt-2 rounded-lg bg-destructive/10 p-3">
                                            <p className="text-xs font-semibold uppercase text-destructive">Motivo del rechazo</p>
                                            <p className="text-sm">{r.motivo_rechazo || '—'}</p>
                                            {r.notas && <p className="mt-1 text-xs italic text-muted-foreground">{r.notas}</p>}
                                            {Array.isArray(r.fotos_antes) && r.fotos_antes.length > 0 && (
                                                <div className="mt-2">
                                                    <p className="text-xs font-semibold uppercase text-destructive mb-1">Fotos del rechazo</p>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {r.fotos_antes.slice(0, 6).map((f, i) => (
                                                            <img key={i}
                                                                src={pb.files.getURL({ collectionId: r.collectionId, id: r.id }, f, { thumb: '120x120' })}
                                                                alt={`rechazo ${i+1}`} className="h-14 w-14 rounded-md object-cover border border-destructive/30" />
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                                            {r.temps_estimat_min > 0 && (
                                                <span className="flex items-center gap-1 font-semibold"><Clock className="h-3.5 w-3.5" /> {r.temps_estimat_min} min estimados</span>
                                            )}
                                            <span className="rounded px-1.5 py-0.5 font-semibold uppercase bg-secondary">{r.estado}</span>
                                        </div>
                                        <button onClick={() => iniciarRetrabajo(r)}
                                            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-destructive py-3 text-lg font-bold text-white active:scale-[0.98] transition">
                                            <Play className="h-5 w-5" /> {r.estado === 'en_proceso' ? 'Continuar retrabajo' : 'Iniciar retrabajo'}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── BORRADORES — paused drafts ── */}
                    {borradores.length > 0 && (
                        <div className="mb-6">
                            <p className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-primary">
                                <Clock className="h-4 w-4" /> Borradores ({borradores.length})
                            </p>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {borradores.map((b) => (
                                    <div key={b.id} className="relative overflow-hidden rounded-2xl border-2 border-primary/30 bg-primary/5 p-5 shadow-sm">
                                        <div className="flex items-start justify-between gap-2">
                                            <span className="rounded-md bg-primary px-2.5 py-1 text-sm font-bold uppercase tracking-wide text-primary-foreground">BORRADOR</span>
                                            <span className="rounded-md bg-primary/15 px-2 py-1 text-xs font-bold text-primary tabular-nums">{formatSegons(b.tiempo_acumulado_seg || 0)}</span>
                                        </div>
                                        <p className="mt-3 font-display text-3xl uppercase leading-none">{b.expand?.exclusiva?.exclusiva || '—'}</p>
                                        {b.expand?.mono?.codi && <p className="text-sm font-semibold text-muted-foreground">Mono {b.expand.mono.codi}</p>}
                                        <div className="mt-3 rounded-lg bg-background/80 p-3">
                                            <p className="text-xs font-semibold uppercase text-muted-foreground">Operación</p>
                                            <p className="text-base font-bold">{b.operacion || '—'}</p>
                                            {b.fase && <p className="text-xs text-muted-foreground">{b.fase}</p>}
                                        </div>
                                        <div className="mt-3 flex gap-2">
                                            <button onClick={() => continuarBorrador(b)}
                                                className="flex-1 flex items-center justify-center gap-1 rounded-xl bg-[hsl(var(--ok))] py-2.5 text-sm font-bold text-white active:scale-95 transition">
                                                <Play className="h-4 w-4" /> Continuar
                                            </button>
                                            <button onClick={() => eliminarBorrador(b)}
                                                className="flex items-center justify-center gap-1 rounded-xl bg-destructive/10 text-destructive px-3 py-2.5 text-sm font-bold active:scale-95 transition">
                                                <X className="h-4 w-4" /> Eliminar
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {carregant ? (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {[0, 1, 2, 3].map((i) => <div key={i} className="h-36 animate-pulse rounded-2xl bg-secondary" />)}
                        </div>
                    ) : exclusivesQueueFiltered.length === 0 ? (
                        <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
                            <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-[hsl(var(--ok))]/50" />
                            {searchQ.trim() ? (
                                <>
                                    <p className="font-display text-2xl uppercase text-muted-foreground">Sin resultados</p>
                                    <p className="mt-1 text-sm text-muted-foreground">No hay exclusivas que coincidan con «{searchQ.trim()}» en la cola visible.</p>
                                    <button type="button" onClick={() => setSearchQ('')}
                                        className="mt-4 rounded-xl bg-secondary px-4 py-2 text-sm font-semibold">Limpiar búsqueda</button>
                                </>
                            ) : (
                                <>
                                    <p className="font-display text-2xl uppercase text-muted-foreground">Sin trabajo para los próximos 20 días</p>
                                    <p className="mt-1 text-sm text-muted-foreground">No hay exclusivas con entrega en los próximos 20 días ni trabajos en curso.</p>
                                    {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-8">
                            {exclusivesGrups.map((grup) => {
                                const today = startOfToday();
                                const isOverdueGrup = grup.date && grup.date < today;
                                const isToday = grup.date && grup.date.getTime() === today.getTime();
                                return (
                                    <div key={grup.key}>
                                        <div className="mb-3 flex items-center gap-2">
                                            <span className={`rounded-lg px-3 py-1 text-sm font-bold uppercase tracking-wide ${grup.key === 'sin-fecha' ? 'bg-secondary text-muted-foreground' : isOverdueGrup ? 'bg-destructive/10 text-destructive' : isToday ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'}`}>
                                                {etiquetaGrupData(grup.key, grup.date)}
                                            </span>
                                            <span className="text-xs font-semibold text-muted-foreground">{grup.items.length} exclusiva{grup.items.length !== 1 ? 's' : ''}</span>
                                        </div>
                                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                            {grup.items.map((item) => {
                                                const { ex, monos: ms } = item;
                                                const pendents = ms.filter((m) => m.estat !== 'finalitzat').length;
                                                const total = ms.length || Math.max(1, Number(ex.unitats) || 1);
                                                const progress = total > 0 ? Math.round(((total - (ms.length ? pendents : total)) / total) * 100) : 0;
                                                const isExpress = ex.prioritat === 'express' || !!ex.express;
                                                const isAlta = ex.prioritat === 'alta';
                                                const dataLabel = parseDataExclusiva(item.dataRef || dataEntregaExclusiva(ex)).label;
                                                const pendentsLabel = ms.length
                                                    ? `${pendents} / ${ms.length} pendientes`
                                                    : `${Number(ex.unitats) || 1} ud.`;
                                                return (
                                                    <button key={ex.id} onClick={() => selectExclusiva(ex.id)}
                                                        className={`relative overflow-hidden rounded-2xl bg-card border-2 p-5 text-left active:scale-[0.98] transition shadow-sm hover:shadow-md ${isExpress ? 'border-destructive' : isAlta ? 'border-[hsl(var(--warn))]' : 'border-border hover:border-primary/40'}`}>
                                                        {isExpress && <div className="stripe-top absolute inset-x-0 top-0 h-1.5" />}
                                                        <div className="flex items-start justify-between gap-2 mb-3">
                                                            <p className="font-display text-5xl uppercase leading-none text-foreground">{ex.exclusiva}</p>
                                                            <div className="flex flex-col items-end gap-1">
                                                                {isExpress && (
                                                                    <span className="flex items-center gap-1 rounded-md bg-destructive px-2 py-1 text-xs font-bold text-white">
                                                                        <Zap className="h-3 w-3" /> EXPRESS
                                                                    </span>
                                                                )}
                                                                {!isExpress && isAlta && (
                                                                    <span className="rounded-md bg-[hsl(var(--warn))] px-2 py-1 text-xs font-bold text-white">ALTA</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        {ex.article && <p className="font-semibold text-base leading-tight">{ex.article}</p>}
                                                        {ex.marca && <p className="text-sm text-muted-foreground">{ex.marca}</p>}
                                                        <div className="mt-3 flex flex-wrap gap-2">
                                                            {ms[0]?.talla && (
                                                                <span className="rounded-lg border border-border px-3 py-1 text-sm font-bold">T {ms[0].talla}</span>
                                                            )}
                                                            <span className="rounded-lg bg-primary/10 text-primary px-3 py-1 text-sm font-bold">{pendentsLabel}</span>
                                                            {ex.referencia && (
                                                                <span className="rounded-lg border border-border px-3 py-1 text-sm font-mono font-bold">{ex.referencia}</span>
                                                            )}
                                                            {(rutaPerExclusiva.get(ex.id)?.rutaId) ? (
                                                                <span className="flex items-center gap-1 rounded-lg border border-primary/40 text-primary px-3 py-1 text-sm font-bold"><Route className="h-3.5 w-3.5" /> Por ruta</span>
                                                            ) : (
                                                                <span className="rounded-lg border border-primary/30 text-primary px-3 py-1 text-sm font-bold">{fasesLabelEx(ex)}</span>
                                                            )}
                                                            <span className={`flex items-center gap-1 rounded-lg px-3 py-1 text-sm font-bold ${isOverdueGrup ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-muted-foreground'}`}><Clock className="h-3.5 w-3.5" /> {dataLabel}</span>
                                                        </div>
                                                        {/* Progress bar */}
                                                        <div className="mt-3 h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                                                            <div className="h-full bg-[hsl(var(--ok))] rounded-full transition-all" style={{ width: `${progress}%` }} />
                                                        </div>
                                                        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                                                            <span>{progress}% completado</span>
                                                            <ChevronRight className="h-4 w-4" />
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </main>
            )}

            {/* ── DETAIL VIEW ───────────────────────────────────────────── */}
            {view === 'detail' && selectedExclusiva && (
                <main className="p-4 sm:p-6">
                    {/* Exclusiva header */}
                    <div className="rounded-2xl bg-card border border-border p-5 mb-5">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div>
                                <p className="font-display text-5xl uppercase leading-none">{selectedExclusiva.ex.exclusiva}</p>
                                {selectedExclusiva.ex.article && <p className="mt-1 text-lg font-semibold">{selectedExclusiva.ex.article}</p>}
                                {selectedExclusiva.ex.marca && <p className="text-sm text-muted-foreground">{selectedExclusiva.ex.marca}</p>}
                            </div>
                            <div className="flex flex-col gap-2 items-end">
                                {monoRef?.talla && (
                                    <span className="rounded-xl border-2 border-primary px-4 py-1.5 text-lg font-bold text-primary">Talla {monoRef.talla}</span>
                                )}
                                <span className="rounded-xl bg-primary/10 px-4 py-1.5 text-sm font-bold text-primary">
                                    {selectedExclusiva.monos?.length
                                        ? `${selectedExclusiva.monos.filter((m) => m.estat !== 'finalitzat').length} / ${selectedExclusiva.monos.length} ud. pendientes`
                                        : `${Number(selectedExclusiva.ex.unitats) || 1} ud.`}
                                </span>
                            </div>
                        </div>
                        {fitxaUrl(selectedExclusiva.ex) && (
                            <button onClick={() => setFitxaTecnica(true)}
                                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-[hsl(var(--accent))] bg-[hsl(var(--accent))]/10 px-5 py-4 text-[hsl(var(--accent))] active:scale-[0.98] hover:bg-[hsl(var(--accent))]/20 transition">
                                <FileText className="h-6 w-6" />
                                <span className="font-display text-xl uppercase tracking-wide">Ficha Técnica</span>
                            </button>
                        )}
                    </div>

                    {/* Puntos a tener en cuenta */}
                    {ncAlerts.length > 0 && (
                        <div className="mb-5 rounded-2xl border-2 border-[hsl(var(--warn))]/40 bg-[hsl(var(--warn))]/5 p-4">
                            <p className="mb-3 flex items-center gap-2 font-semibold text-sm text-[hsl(var(--warn))]">
                                <AlertTriangle className="h-4 w-4" />
                                Puntos a tener en cuenta — incidencias más frecuentes
                            </p>
                            <div className="grid gap-2">
                                {ncAlerts.map(({ key, count, sample }) => {
                                    const grav = sample?.gravetat || sample?.prioritat || '';
                                    const gravColor = grav === 'critica' || grav === 'alta' ? 'text-destructive' : grav === 'media' ? 'text-[hsl(var(--warn))]' : 'text-muted-foreground';
                                    return (
                                        <button key={key} onClick={() => setNcModal({ key, count, sample })}
                                            className="flex items-center gap-3 rounded-xl bg-background/80 px-3 py-2.5 text-left hover:bg-background active:scale-[0.98] transition w-full">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold truncate">{key}</p>
                                                {sample?.descripcio && <p className="text-xs text-muted-foreground truncate">{sample.descripcio}</p>}
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                {grav && <span className={`text-xs font-bold uppercase ${gravColor}`}>{grav}</span>}
                                                <span className="rounded-lg bg-[hsl(var(--warn))]/20 text-[hsl(var(--warn))] px-2 py-0.5 text-xs font-bold tabular-nums">{count}×</span>
                                                <Eye className="h-4 w-4 text-muted-foreground" />
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Diagnóstico de ruta (visible) — muestra cómo se resolvió la ruta */}
                    {selectedExclusiva && (
                        <details className="mb-5 rounded-2xl border border-border bg-secondary/40 p-3 text-xs">
                            <summary className="cursor-pointer font-semibold text-muted-foreground select-none">Diagnóstico de ruta</summary>
                            <dl className="mt-2 grid gap-1 sm:grid-cols-2">
                                <div><dt className="inline text-muted-foreground">Exclusiva: </dt><dd className="inline font-mono font-bold">{selectedExclusiva.ex.exclusiva}</dd></div>
                                <div><dt className="inline text-muted-foreground">Referencia: </dt><dd className="inline font-mono">{selectedExclusiva.ex.referencia || '—'}</dd></div>
                                <div><dt className="inline text-muted-foreground">Artículo: </dt><dd className="inline">{selectedExclusiva.ex.article || '—'}</dd></div>
                                <div><dt className="inline text-muted-foreground">Campo ruta (ex.ruta): </dt><dd className="inline font-mono">{selectedExclusiva.ex.ruta || 'vacío'}</dd></div>
                                <div><dt className="inline text-muted-foreground">Ruta expandida: </dt><dd className="inline font-mono">{selectedExclusiva.ex.expand?.ruta?.id || '—'}</dd></div>
                                <div><dt className="inline text-muted-foreground">Ruta resuelta: </dt><dd className="inline font-mono font-bold">{rutaResolta?.rutaId || 'ninguna'}</dd></div>
                                <div><dt className="inline text-muted-foreground">Nombre ruta: </dt><dd className="inline">{rutaResolta?.rutaNom || '—'}</dd></div>
                                <div><dt className="inline text-muted-foreground">Vía: </dt><dd className="inline">{rutaResolta?.via || '—'}</dd></div>
                                <div className="sm:col-span-2"><dt className="inline text-muted-foreground">Motivo: </dt><dd className="inline">{rutaResolta?.motiu || '—'}</dd></div>
                                <div><dt className="inline text-muted-foreground">Operaciones en ruta: </dt><dd className="inline">{opsDef.filter((o) => o.ruta === (rutaResolta?.rutaId || '')).length}</dd></div>
                                <div><dt className="inline text-muted-foreground">Ops internas disponibles: </dt><dd className="inline">{rutaOps.length}</dd></div>
                            </dl>
                        </details>
                    )}

                    {/* Ruta indicator — trabajando por ruta (por fases) */}
                    {teRuta && (
                        <div className="mb-5 rounded-2xl border-2 border-primary/30 bg-primary/5 p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <Route className="h-5 w-5 text-primary" />
                                <p className="font-semibold text-sm">Trabajando por ruta: <span className="font-bold uppercase">{rutaNom}</span></p>
                            </div>
                            {següentFase ? (
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                    <div>
                                        <p className="text-xs font-semibold uppercase text-muted-foreground">Siguiente fase</p>
                                        <p className="font-display text-xl uppercase">{següentFase.fase}</p>
                                        {següentFase.stdMin > 0 && (
                                            <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> {següentFase.stdMin} min estándar</p>
                                        )}
                                    </div>
                                    <button onClick={() => iniciarFase(següentFase.fase)}
                                        className="shrink-0 flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground active:scale-[0.98]">
                                        <Play className="h-5 w-5" /> Iniciar fase
                                    </button>
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">No hay fases disponibles para ti en esta ruta (pueden estar todas completadas o sin configurar).</p>
                            )}
                        </div>
                    )}

                    {/* Ruta asignada pero sin fases disponibles */}
                    {teRuta && fases.length === 0 && (
                        <div className="mb-5 rounded-2xl border-2 border-primary/30 bg-primary/5 p-5">
                            <p className="font-display text-2xl uppercase text-primary">Ruta asignada</p>
                            <p className="mt-1 text-sm text-muted-foreground">Esta exclusiva tiene la ruta «{rutaNom}» asignada, pero no tiene fases configuradas para realizar. Solicita a Producción que configure las fases de la ruta.</p>
                        </div>
                    )}

                    {/* Fases — el operario trabaja por fase como una sola operación.
                        También para exclusivas sin ruta predefinida (Fase 1/2/3). */}
                    {fases.length > 0 && (
                        <>
                            <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Selecciona una fase para iniciar</p>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {fasesAmbEstat.map(({ fase, status, stdMin }) => {
                                    const canStart = status === 'disponible' || status === 'en_curs';
                                    const isCompletada = status === 'completada';
                                    return (
                                        <div key={fase}
                                            className={`rounded-2xl border-2 p-6 transition ${statusBadge(status)}`}>
                                            <div className="flex items-start justify-between gap-2 mb-2">
                                                <p className="font-display text-3xl uppercase leading-none">{fase}</p>
                                                <span className="text-xs font-bold uppercase">{statusLabel[status]}</span>
                                            </div>
                                            {stdMin > 0 && (
                                                <p className="mt-1 flex items-center gap-1 text-xs opacity-80">
                                                    <Clock className="h-3.5 w-3.5" /> {stdMin} min estándar
                                                </p>
                                            )}
                                            {canStart && (
                                                <button onClick={() => iniciarFase(fase)}
                                                    className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground py-4 text-lg font-bold active:scale-95 transition">
                                                    <Play className="h-5 w-5" /> {status === 'en_curs' ? 'Continuar fase' : 'Iniciar fase'}
                                                </button>
                                            )}
                                            {isCompletada && (
                                                <button onClick={() => iniciarReoperacioFase(fase)}
                                                    className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl border-2 border-[hsl(var(--warn))]/60 text-[hsl(var(--warn))] py-3 text-sm font-bold active:scale-95 hover:bg-[hsl(var(--warn))]/10 transition">
                                                    <RefreshCcw className="h-4 w-4" /> Reoperación
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            {següentFase && (
                                <p className="mt-4 text-sm text-muted-foreground">
                                    Siguiente fase sugerida: <span className="font-bold uppercase text-primary">{següentFase.fase}</span>
                                </p>
                            )}
                        </>
                    )}
                </main>
            )}

            {/* ── ADMIN NOTIFICATION BANNER ─────────────────────────────── */}
            {adminNotif && (
                <div className={`mx-4 mt-4 flex items-start gap-3 rounded-2xl px-5 py-4 text-base font-semibold shadow-lg ${adminNotif.type === 'bloqueig' ? 'bg-destructive text-white' : adminNotif.type === 'final' ? 'bg-[hsl(var(--ok))] text-white' : 'bg-[hsl(var(--warn))] text-white'}`}>
                    <AlertTriangle className="h-6 w-6 shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <p className="font-bold text-lg leading-tight">Notificación del administrador</p>
                        <p className="mt-0.5 font-medium opacity-90">{adminNotif.msg}</p>
                    </div>
                    {adminNotif.type !== 'final' && (
                        <button onClick={() => setAdminNotif(null)} className="shrink-0 rounded-lg bg-white/20 p-2 hover:bg-white/30 active:scale-95" aria-label="Cerrar">
                            <X className="h-5 w-5" />
                        </button>
                    )}
                </div>
            )}

            {/* ── CRONOMETRO VIEW ───────────────────────────────────────── */}
            {view === 'cronometro' && registre && operacio && (
                <main className="p-4 sm:p-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
                    <section className="rounded-2xl border border-border bg-card p-6 text-center">
                        {retrabajoActiu && (
                            <div className="mb-4 rounded-xl border-2 border-destructive/50 bg-destructive/5 p-4 text-left">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <p className="flex items-center gap-2 font-display text-2xl uppercase text-destructive">
                                        <RefreshCcw className="h-6 w-6" /> Retrabajo — Tiempo: {formatSegons(segons)}
                                    </p>
                                    <span className="rounded-md bg-destructive px-2.5 py-1 text-xs font-bold uppercase text-white">Intento #{retrabajoRec?.numero_intento || 1}</span>
                                </div>
                                <p className="mt-2 text-xs font-semibold uppercase text-muted-foreground">Motivo del rechazo</p>
                                <p className="text-sm text-destructive">{retrabajoRec?.motivo_rechazo || '—'}</p>
                                {retrabajoRec?.notas && <p className="mt-1 text-xs italic text-muted-foreground">{retrabajoRec.notas}</p>}
                                {Array.isArray(retrabajoRec?.fotos_antes) && retrabajoRec.fotos_antes.length > 0 && (
                                    <div className="mt-2">
                                        <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Fotos del rechazo (referencia)</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {retrabajoRec.fotos_antes.map((f, i) => (
                                                <a key={i} href={pb.files.getURL({ collectionId: retrabajoRec.collectionId, id: retrabajoRec.id }, f)} target="_blank" rel="noreferrer">
                                                    <img src={pb.files.getURL({ collectionId: retrabajoRec.collectionId, id: retrabajoRec.id }, f, { thumb: '150x150' })} alt={`rechazo ${i+1}`} className="h-16 w-16 rounded-md object-cover border border-destructive/30" />
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        <p className="font-display text-3xl uppercase">{cronMono?.codi}</p>
                        {operacio.codi && <p className="font-mono text-xs text-muted-foreground">{operacio.codi}</p>}
                        <p className="text-lg font-semibold mt-1">{operacio.nom}</p>
                        {operacio.fase && <p className="text-xs text-muted-foreground">{operacio.fase}</p>}
                        {operacio.maquina && <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--accent))]">{operacio.maquina}</p>}
                        {operacio.instruccions && (
                            <p className="mt-1 max-w-md mx-auto text-xs text-muted-foreground italic">{operacio.instruccions}</p>
                        )}
                        {fitxaUrl(selectedExclusiva?.ex) && (
                            <button onClick={() => setFitxaTecnica(true)}
                                className="mt-3 mx-auto flex items-center gap-2 rounded-xl border-2 border-[hsl(var(--accent))] bg-[hsl(var(--accent))]/10 px-6 py-3 text-[hsl(var(--accent))] font-semibold text-base active:scale-[0.98] hover:bg-[hsl(var(--accent))]/20 transition">
                                <FileText className="h-5 w-5" />
                                <span className="font-display text-lg uppercase tracking-wide">Ficha Técnica</span>
                            </button>
                        )}
                        {pausat && (
                            <div className="mt-4 flex items-center justify-center gap-3 rounded-2xl border-2 border-[hsl(var(--warn))] bg-[hsl(var(--warn))]/15 px-5 py-4 animate-pulse">
                                <Pause className="h-10 w-10 text-[hsl(var(--warn))] shrink-0" />
                                <p className="font-display text-4xl sm:text-5xl uppercase tracking-wide leading-none text-[hsl(var(--warn))]">Pausado</p>
                            </div>
                        )}
                        <p className={`font-display leading-none mt-4 tabular-nums text-[clamp(3rem,12vw,7rem)] ${pausat ? 'text-[hsl(var(--warn))]' : 'text-foreground'}`}>{formatSegons(segons)}</p>
                        <p className="mt-2 text-sm">
                            Estándar {formatSegons(estandard)} ·{' '}
                            <span className={desviacio > 0 ? 'text-destructive font-semibold' : 'text-[hsl(var(--ok))] font-semibold'}>
                                {desviacio > 0 ? '+' : ''}{desviacio}%
                            </span>
                        </p>
                        <p className="mt-1 text-sm">
                            <span className="text-muted-foreground">Tu media (7 días): </span>
                            {mitjanaOperari ? (
                                <>
                                    <span className="font-semibold text-primary">{formatSegons(mitjanaOperari.mitjana)}</span>
                                    <span className="text-muted-foreground"> ({mitjanaOperari.n} reg.)</span>
                                </>
                            ) : (
                                <span className="text-muted-foreground italic">Sin datos</span>
                            )}
                        </p>
                        {pausat && (() => {
                            const ultimMotiu = pauses.length ? pauses[pauses.length - 1]?.motiu : '';
                            const motiu = registre?.motiu_pausa_inactivitat || ultimMotiu;
                            return motiu ? (
                                <p className="mt-2 rounded-lg bg-[hsl(var(--warn))]/10 px-4 py-2 text-sm font-semibold text-[hsl(var(--warn))]">
                                    Motivo: {motiu}
                                </p>
                            ) : null;
                        })()}
                        <div className="mt-6 grid grid-cols-2 gap-3">
                            {pausat ? (
                                <button onClick={reanudar} className="h-24 rounded-2xl bg-[hsl(var(--ok))] text-white text-xl font-semibold flex items-center justify-center gap-2 active:scale-[0.98]">
                                    <Play className="h-7 w-7" /> Reanudar
                                </button>
                            ) : (
                                <button onClick={() => setDialeg('pausa')} className="h-24 rounded-2xl bg-[hsl(var(--warn))] text-white text-xl font-semibold flex items-center justify-center gap-2 active:scale-[0.98]">
                                    <Pause className="h-7 w-7" /> Pausar
                                </button>
                            )}
                            <button onClick={() => setDialeg('final')} className="h-24 rounded-2xl bg-primary text-primary-foreground text-xl font-semibold flex items-center justify-center gap-2 active:scale-[0.98]">
                                <Square className="h-7 w-7" /> Finalizar
                            </button>
                            <button onClick={() => setDialeg('incidencia')} className="h-20 rounded-2xl border-2 border-destructive text-destructive text-lg font-semibold flex items-center justify-center gap-2 active:scale-[0.98]">
                                <AlertTriangle className="h-6 w-6" /> Incidencia
                            </button>
                            <button onClick={() => setRetreball((r) => !r)}
                                className={`h-20 rounded-2xl border-2 text-lg font-semibold flex items-center justify-center gap-2 active:scale-[0.98] ${retreball ? 'bg-primary text-primary-foreground border-primary' : 'border-border'}`}>
                                <RefreshCcw className="h-6 w-6" /> Retrabajo {retreball ? 'sí' : 'no'}
                            </button>
                        </div>
                    </section>

                    <aside className="rounded-2xl border border-border bg-card p-5">
                        <h2 className="font-display text-2xl uppercase">Registro</h2>
                        <dl className="mt-3 text-sm divide-y divide-border">
                            <div className="flex justify-between py-2"><dt className="text-muted-foreground">Exclusiva</dt><dd className="font-semibold">{selectedExclusiva?.ex.exclusiva || cronMono?.codi}</dd></div>
                            <div className="flex justify-between py-2"><dt className="text-muted-foreground">Pausas</dt><dd>{pauses.length}</dd></div>
                            <div className="flex justify-between py-2"><dt className="text-muted-foreground">Incidencias</dt><dd>{incidencies.length}</dd></div>
                        </dl>
                        <ul className="mt-3 space-y-2 text-sm">
                            {pauses.map((p, i) => (
                                <li key={`p${i}`} className="rounded-lg bg-secondary px-3 py-2">Pausa: {p.motiu}</li>
                            ))}
                            {incidencies.map((inc, i) => (
                                <li key={`i${i}`} className="rounded-lg bg-destructive/10 px-3 py-2 text-destructive">[{inc.tipus}] {inc.descripcio}</li>
                            ))}
                        </ul>

                        {retrabajoActiu && (
                            <div className="mt-4 rounded-xl border-2 border-destructive/30 bg-destructive/5 p-3">
                                <p className="flex items-center gap-2 font-semibold text-sm text-destructive">
                                    <RefreshCcw className="h-4 w-4" /> Retrabajo — evidencia
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">Sube fotos/videos del resultado al finalizar.</p>
                                <div className="mt-3">
                                    <label className="flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground"><Camera className="h-3 w-3" /> Fotos después</label>
                                    <MultiFileDrop
                                        files={retrFotosDespues}
                                        onAdd={(files) => setRetrFotosDespues(prev => [...prev, ...files].slice(0, 10))}
                                        onRemove={(i) => setRetrFotosDespues(prev => prev.filter((_, j) => j !== i))}
                                        accept="image/*,image/heic"
                                        maxFiles={10}
                                        maxSizeMB={10}
                                        label="Arrastra fotos"
                                        hint="JPG, PNG, WebP · Máx. 10"
                                        className="mt-1"
                                    />
                                </div>
                                <div className="mt-3">
                                    <label className="flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground"><Video className="h-3 w-3" /> Vídeos</label>
                                    <MultiFileDrop
                                        files={retrVideos}
                                        onAdd={(files) => setRetrVideos(prev => [...prev, ...files].slice(0, 5))}
                                        onRemove={(i) => setRetrVideos(prev => prev.filter((_, j) => j !== i))}
                                        accept="video/*"
                                        maxFiles={5}
                                        maxSizeMB={100}
                                        label="Arrastra vídeos"
                                        hint="MP4, WebM · Máx. 5"
                                        className="mt-1"
                                    />
                                </div>
                            </div>
                        )}
                    </aside>
                </main>
            )}

            {/* ── DIALOGS ───────────────────────────────────────────────── */}
            {dialeg === 'pausa' && (
                <div className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-black/60 p-4">
                    <div className="w-full max-w-lg rounded-2xl bg-card p-5">
                        <h3 className="font-display text-2xl uppercase mb-4">Motivo de la pausa</h3>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {MOTIUS_PAUSA.map((m) => (
                                <button key={m} onClick={() => afegirPausa(m)} className="h-16 rounded-xl border-2 border-border text-lg font-semibold active:scale-[0.98] hover:border-primary">{m}</button>
                            ))}
                        </div>
                        <button onClick={() => setDialeg(null)} className="mt-4 h-12 w-full rounded-xl bg-secondary font-semibold">Cancelar</button>
                    </div>
                </div>
            )}

            {dialeg === 'incidencia' && (
                <div className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-black/60 p-4">
                    <div className="w-full max-w-lg rounded-2xl bg-card p-5 max-h-[90vh] overflow-y-auto">
                        <h3 className="font-display text-2xl uppercase mb-3">Registrar incidencia</h3>
                        <p className="text-sm font-semibold mb-2">Tipo</p>
                        <div className="grid grid-cols-3 gap-2 mb-3">
                            {TIPUS_INCIDENCIA.map((t) => (
                                <button key={t} onClick={() => setTipusIncidencia(t)}
                                    className={`h-12 rounded-xl border text-sm font-semibold active:scale-[0.98] ${tipusIncidencia === t ? 'border-destructive bg-destructive/10 text-destructive' : 'border-border'}`}>{t}</button>
                            ))}
                        </div>
                        <textarea value={textIncidencia} onChange={(e) => setTextIncidencia(e.target.value)} rows={3}
                            className="w-full rounded-xl border border-input bg-background p-3 text-lg" placeholder="Descripción..." />
                        <div className="mt-4 grid grid-cols-2 gap-3">
                            <button onClick={() => { setDialeg(null); setTextIncidencia(''); setTipusIncidencia(''); }}
                                className="h-14 rounded-xl bg-secondary font-semibold">Cancelar</button>
                            <button onClick={() => {
                                if (!textIncidencia.trim() && !tipusIncidencia) return;
                                setIncidencies((l) => [...l, { tipus: tipusIncidencia || 'Otra', descripcio: textIncidencia.trim() || tipusIncidencia, hora: new Date().toISOString() }]);
                                setTextIncidencia(''); setTipusIncidencia(''); setDialeg(null);
                            }} className="h-14 rounded-xl bg-destructive text-destructive-foreground font-semibold">Guardar</button>
                        </div>
                    </div>
                </div>
            )}

            {dialeg === 'final' && (
                <div className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-black/60 p-4">
                    <div className="w-full max-w-lg rounded-2xl bg-card p-5">
                        <h3 className="font-display text-2xl uppercase mb-1">OK de confección</h3>
                        <p className="text-sm text-muted-foreground mb-1">Confirma que la fase/operación que has realizado está correctamente terminada.</p>
                        <p className="text-xs text-muted-foreground mb-4">Esto no es la aprobación de Calidad del mono — Calidad dará su propio OK después.</p>
                        <p className="text-sm font-semibold mb-4">Tiempo registrado: {formatSegons(segons)}</p>
                        <div className="grid gap-3">
                            <button onClick={() => finalitzar('ok')} className="h-20 rounded-2xl bg-[hsl(var(--ok))] text-white text-xl font-semibold flex items-center justify-center gap-2">
                                <CheckCircle2 className="h-7 w-7" /> OK fase
                            </button>
                            <button onClick={() => finalitzar('ko')} className="h-20 rounded-2xl bg-destructive text-destructive-foreground text-xl font-semibold flex items-center justify-center gap-2">
                                <AlertTriangle className="h-7 w-7" /> No OK (retrabajo)
                            </button>
                            <button onClick={() => setDialeg(null)} className="h-14 rounded-xl bg-secondary font-semibold">Seguir trabajando</button>
                        </div>
                    </div>
                </div>
            )}



            {/* NC incidents modal */}
            {ncModal && (
                <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4" onClick={() => setNcModal(null)}>
                    <div className="w-full max-w-lg rounded-2xl bg-card p-5 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-display text-xl uppercase pr-4">{ncModal.key}</h3>
                            <button onClick={() => setNcModal(null)} className="rounded-lg bg-secondary p-2 shrink-0"><X className="h-5 w-5"/></button>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 mb-4">
                            <span className="rounded-lg bg-destructive/10 text-destructive px-3 py-1 font-bold text-lg">{ncModal.count}× detectada</span>
                            {(ncModal.sample?.gravetat || ncModal.sample?.prioritat) && (
                                <span className={`rounded-lg px-3 py-1 text-sm font-semibold uppercase ${(ncModal.sample.gravetat || ncModal.sample.prioritat) === 'critica' ? 'bg-destructive text-white' : (ncModal.sample.gravetat || ncModal.sample.prioritat) === 'alta' ? 'bg-[hsl(var(--warn))] text-white' : 'bg-secondary'}`}>
                                    {ncModal.sample.gravetat || ncModal.sample.prioritat}
                                </span>
                            )}
                        </div>
                        {ncModal.sample?.descripcio && (
                            <div className="mb-3 rounded-xl bg-secondary/60 p-3">
                                <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Descripción</p>
                                <p className="text-sm">{ncModal.sample.descripcio}</p>
                            </div>
                        )}
                        {ncModal.sample?.solucio_implantada && (
                            <div className="mb-3 rounded-xl bg-[hsl(var(--ok))]/10 p-3">
                                <p className="text-xs font-semibold uppercase text-[hsl(var(--ok))] mb-1">Solución aplicada</p>
                                <p className="text-sm">{ncModal.sample.solucio_implantada}</p>
                            </div>
                        )}
                        {ncModal.sample?.accio_preventiva && (
                            <div className="mb-3 rounded-xl bg-primary/10 p-3">
                                <p className="text-xs font-semibold uppercase text-primary mb-1">Acción preventiva</p>
                                <p className="text-sm">{ncModal.sample.accio_preventiva}</p>
                            </div>
                        )}
                        {ncModal.exclusives?.length > 0 && (
                            <div className="mb-3">
                                <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Últimas exclusivas afectadas</p>
                                <div className="flex flex-wrap gap-2">
                                    {ncModal.exclusives.map(ex => (
                                        <span key={ex} className="rounded-lg bg-secondary px-2 py-1 text-sm font-mono font-bold">{ex}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {ncModal.sample?.fotos?.length > 0 && (
                            <div className="mb-3">
                                <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Fotos</p>
                                <div className="flex flex-wrap gap-2">
                                    {ncModal.sample.fotos.map((f, i) => (
                                        <img key={i}
                                            src={pb.files.getURL({ collectionId: ncModal.sample.collectionId, id: ncModal.sample.id }, f, { thumb: '150x150' })}
                                            alt={`foto ${i+1}`} className="h-20 w-20 rounded-lg object-cover border border-border"/>
                                    ))}
                                </div>
                            </div>
                        )}
                        <button onClick={() => setNcModal(null)} className="mt-2 h-12 w-full rounded-xl bg-secondary font-semibold">Cerrar</button>
                    </div>
                </div>
            )}

            {/* Ficha técnica modal */}
            {fitxaTecnica && selectedExclusiva && fitxaUrl(selectedExclusiva.ex) && (
                <div className="fixed inset-0 z-40 flex flex-col bg-black/80">
                    <div className="flex items-center justify-between gap-3 bg-primary px-4 py-3 text-primary-foreground">
                        <div className="flex items-center gap-3">
                            <FileText className="h-6 w-6" />
                            <span className="font-display text-xl uppercase">Ficha Técnica — {selectedExclusiva.ex.article || 'UNIC PLUS FIA SUIT'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <a href={fitxaUrl(selectedExclusiva.ex)} download target="_blank" rel="noreferrer"
                                className="flex items-center gap-1.5 rounded-md bg-white/15 px-3 py-2 text-sm font-semibold hover:bg-white/25">
                                <Download className="h-4 w-4" /> Descargar
                            </a>
                            <button onClick={() => setFitxaTecnica(false)} className="rounded-md bg-white/15 p-2 hover:bg-white/25 active:scale-95" aria-label="Cerrar">
                                <X className="h-6 w-6" />
                            </button>
                        </div>
                    </div>
                    <iframe src={`${fitxaUrl(selectedExclusiva.ex)}#view=FitH`} title="Ficha técnica" className="flex-1 w-full border-0" />
                </div>
            )}

            {/* Modal: cronómetro pausado automáticamente */}
            {resumeModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
                    <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl">
                        <div className="mb-4 flex items-center gap-3">
                            <div className="rounded-xl bg-[hsl(var(--warn))]/15 p-3"><Clock className="h-7 w-7 text-[hsl(var(--warn))]" /></div>
                            <div>
                                <h3 className="font-display text-2xl uppercase leading-none">Tienes un cronómetro pausado</h3>
                                <p className="text-sm text-muted-foreground">Se pausó automáticamente al cerrar la sesión.</p>
                            </div>
                        </div>
                        <div className="mb-5 rounded-xl bg-secondary/60 p-4">
                            <p className="text-xs font-semibold uppercase text-muted-foreground">Exclusiva</p>
                            <p className="font-display text-2xl uppercase">{resumeModal.exclusivaCode || '—'}</p>
                            <p className="text-sm font-semibold">{resumeModal.operacion || '—'}</p>
                            <p className="mt-2 text-xs font-semibold uppercase text-muted-foreground">Tiempo acumulado</p>
                            <p className="font-display text-3xl tabular-nums text-primary">{formatSegons(resumeModal.segons || 0)}</p>
                        </div>
                        <div className="grid gap-3">
                            <button onClick={() => restaurarCron(resumeModal)}
                                className="h-16 rounded-2xl bg-[hsl(var(--ok))] text-white text-lg font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition">
                                <Play className="h-6 w-6" /> Continuar
                            </button>
                            <button onClick={() => guardarBorrador(resumeModal)}
                                className="h-14 rounded-2xl bg-secondary text-secondary-foreground text-base font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition">
                                <Clock className="h-5 w-5" /> Guardar como borrador
                            </button>
                            <button onClick={() => descartarCron(resumeModal)}
                                className="h-14 rounded-2xl bg-destructive text-white text-base font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition">
                                <X className="h-5 w-5" /> Descartar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── POPUP DE INACTIVIDAD (90 min sin actividad) ─────────────── */}
            {inactivitatPopup && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4">
                    <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl">
                        {inactivitatPopup === 'pregunta' && (
                            <>
                                <div className="mb-4 flex items-center gap-3">
                                    <div className="rounded-xl bg-[hsl(var(--warn))]/15 p-3">
                                        <Clock className="h-7 w-7 text-[hsl(var(--warn))]" />
                                    </div>
                                    <div>
                                        <h3 className="font-display text-2xl uppercase leading-none">Aviso de inactividad</h3>
                                        <p className="text-sm text-muted-foreground">Han pasado 90 minutos sin actividad.</p>
                                    </div>
                                </div>
                                <p className="mb-5 text-base font-semibold">
                                    ¿La exclusiva <span className="text-primary">{selectedExclusiva?.ex?.exclusiva || lliureSnapshot?.exclusiva || ''}</span> ya está terminada o continúa pausada por alguna razón?
                                </p>
                                <div className="grid gap-3">
                                    <button onClick={inactivitatTerminada}
                                        className="h-16 rounded-2xl bg-[hsl(var(--ok))] text-white text-lg font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition">
                                        <CheckCircle2 className="h-6 w-6" /> Terminada
                                    </button>
                                    <button onClick={inactivitatContinuaPausada}
                                        className="h-16 rounded-2xl bg-[hsl(var(--warn))] text-white text-lg font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition">
                                        <Pause className="h-6 w-6" /> Continúa pausada
                                    </button>
                                </div>
                            </>
                        )}

                        {inactivitatPopup === 'causa' && (
                            <>
                                <div className="mb-4 flex items-center gap-3">
                                    <div className="rounded-xl bg-[hsl(var(--warn))]/15 p-3">
                                        <AlertTriangle className="h-7 w-7 text-[hsl(var(--warn))]" />
                                    </div>
                                    <div>
                                        <h3 className="font-display text-2xl uppercase leading-none">Motivo de la pausa</h3>
                                        <p className="text-sm text-muted-foreground">Selecciona una opción obligatoria.</p>
                                    </div>
                                </div>
                                <p className="mb-4 text-sm font-semibold">¿Por qué continúa pausada la exclusiva?</p>
                                <div className="grid gap-3">
                                    <button onClick={() => inactivitatGuardarCausa('Incidencia')}
                                        className="h-16 rounded-2xl border-2 border-destructive text-destructive text-lg font-bold flex items-center justify-center gap-2 active:scale-[0.98] hover:bg-destructive/10 transition">
                                        <AlertTriangle className="h-6 w-6" /> Incidencia
                                    </button>
                                    <button onClick={() => inactivitatGuardarCausa('Parado por encargado')}
                                        className="h-16 rounded-2xl border-2 border-primary text-primary text-lg font-bold flex items-center justify-center gap-2 active:scale-[0.98] hover:bg-primary/10 transition">
                                        <Pause className="h-6 w-6" /> Parado por encargado
                                    </button>
                                </div>
                                <button onClick={() => setInactivitatPopup('pregunta')}
                                    className="mt-4 h-12 w-full rounded-xl bg-secondary font-semibold">Volver</button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* ── TRABAJO LIBRE VIEW ─────────────────────────────────────── */}
            {view === 'libre' && (selectedExclusiva || lliureSnapshot) && (
                <main className="p-4 sm:p-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
                    <section className="rounded-2xl border border-border bg-card p-6 text-center">
                        <p className="font-display text-3xl uppercase">{lliureSnapshot?.exclusiva || selectedExclusiva?.ex?.exclusiva}</p>
                        <p className="text-sm font-semibold mt-1">{lliureSnapshot?.article || selectedExclusiva?.ex?.article || 'Trabajo libre'}</p>
                        <div className="mt-4 text-left">
                            <label className="text-xs font-semibold uppercase text-muted-foreground">¿Qué estás haciendo?</label>
                            <textarea value={lliureDesc} onChange={(e) => setLliureDesc(e.target.value)} rows={2}
                                className="mt-1 w-full rounded-xl border border-input bg-background p-3 text-sm" placeholder="Descripción del trabajo..." />
                        </div>
                        {lliurePausat && (
                            <div className="mt-4 flex items-center justify-center gap-3 rounded-2xl border-2 border-[hsl(var(--warn))] bg-[hsl(var(--warn))]/15 px-5 py-4 animate-pulse">
                                <Pause className="h-10 w-10 text-[hsl(var(--warn))] shrink-0" />
                                <p className="font-display text-4xl sm:text-5xl uppercase tracking-wide leading-none text-[hsl(var(--warn))]">Pausado</p>
                            </div>
                        )}
                        <p className={`font-display leading-none mt-4 tabular-nums text-[clamp(3rem,12vw,7rem)] ${lliurePausat ? 'text-[hsl(var(--warn))]' : 'text-foreground'}`}>{formatSegons(lliureSegons)}</p>
                        <div className="mt-6 grid grid-cols-2 gap-3">
                            {lliurePausat ? (
                                <button onClick={reanudarLliure} className="h-24 rounded-2xl bg-[hsl(var(--ok))] text-white text-xl font-semibold flex items-center justify-center gap-2 active:scale-[0.98]">
                                    <Play className="h-7 w-7" /> Reanudar
                                </button>
                            ) : (
                                <button onClick={pausarLliure} className="h-24 rounded-2xl bg-[hsl(var(--warn))] text-white text-xl font-semibold flex items-center justify-center gap-2 active:scale-[0.98]">
                                    <Pause className="h-7 w-7" /> Pausar
                                </button>
                            )}
                            <button onClick={() => setDialeg('final_lliure')} className="h-24 rounded-2xl bg-primary text-primary-foreground text-xl font-semibold flex items-center justify-center gap-2 active:scale-[0.98]">
                                <Square className="h-7 w-7" /> Finalizar
                            </button>
                            <button onClick={() => setDialeg('incidencia_lliure')} className="h-20 rounded-2xl border-2 border-destructive text-destructive text-lg font-semibold flex items-center justify-center gap-2 active:scale-[0.98]">
                                <AlertTriangle className="h-6 w-6" /> Incidencia
                            </button>
                            <button onClick={() => finalitzarLliure('pendent')} className="h-20 rounded-2xl border-2 border-border text-lg font-semibold flex items-center justify-center gap-2 active:scale-[0.98]">
                                <Clock className="h-6 w-6" /> Guardar y salir
                            </button>
                        </div>
                    </section>
                    <aside className="rounded-2xl border border-border bg-card p-5">
                        <h2 className="font-display text-2xl uppercase">Registro</h2>
                        <dl className="mt-3 text-sm divide-y divide-border">
                            <div className="flex justify-between py-2"><dt className="text-muted-foreground">Exclusiva</dt><dd className="font-semibold">{lliureSnapshot?.exclusiva || selectedExclusiva?.ex?.exclusiva}</dd></div>
                            <div className="flex justify-between py-2"><dt className="text-muted-foreground">Tiempo</dt><dd className="tabular-nums font-semibold">{formatSegons(lliureSegons)}</dd></div>
                            <div className="flex justify-between py-2"><dt className="text-muted-foreground">Incidencias</dt><dd>{lliureIncidencies.length}</dd></div>
                            <div className="flex justify-between py-2"><dt className="text-muted-foreground">Estado</dt><dd className="font-semibold">{lliurePausat ? 'Pausado' : 'En curso'}</dd></div>
                        </dl>
                        <ul className="mt-3 space-y-2 text-sm">
                            {lliureIncidencies.map((inc, i) => (
                                <li key={i} className="rounded-lg bg-destructive/10 px-3 py-2 text-destructive">[{inc.tipus}] {inc.descripcio}</li>
                            ))}
                        </ul>
                        {/* Diagnóstico trabajo libre */}
                        <details className="mt-4 rounded-xl border border-border bg-secondary/40 p-3 text-xs">
                            <summary className="cursor-pointer font-semibold text-muted-foreground select-none">Diagnóstico trabajo libre</summary>
                            <dl className="mt-2 grid gap-1">
                                <div><dt className="inline text-muted-foreground">Exclusiva: </dt><dd className="inline font-mono font-bold">{lliureExclusivaId || '—'}</dd></div>
                                <div><dt className="inline text-muted-foreground">Operario: </dt><dd className="inline font-mono">{user?.id || '—'}</dd></div>
                                <div><dt className="inline text-muted-foreground">Registro: </dt><dd className="inline font-mono font-bold">{lliureRegistre?.id || '—'}</dd></div>
                                <div><dt className="inline text-muted-foreground">Estado: </dt><dd className="inline">{lliurePausat ? 'pausat' : 'en_curs'}</dd></div>
                                <div><dt className="inline text-muted-foreground">Inicio: </dt><dd className="inline">{lliureIniciRef.current?.toISOString() || '—'}</dd></div>
                                <div><dt className="inline text-muted-foreground">Tiempo (s): </dt><dd className="inline tabular-nums">{lliureSegons}</dd></div>
                                <div className="text-muted-foreground">Visible en: En vivo, Producción, Admin, Calidad (vía colección `registres`)</div>
                            </dl>
                        </details>
                    </aside>
                </main>
            )}

            {dialeg === 'final_lliure' && (
                <div className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-black/60 p-4">
                    <div className="w-full max-w-lg rounded-2xl bg-card p-5">
                        <h3 className="font-display text-2xl uppercase mb-1">OK de confección</h3>
                        <p className="text-sm text-muted-foreground mb-1">Confirma que el trabajo de confección está correctamente terminado.</p>
                        <p className="text-xs text-muted-foreground mb-4">No sustituye el OK de Calidad del mono.</p>
                        <p className="text-sm font-semibold mb-4">Tiempo registrado: {formatSegons(lliureSegons)}</p>
                        <div className="grid gap-3">
                            <button onClick={() => { setDialeg(null); finalitzarLliure('ok'); }} className="h-20 rounded-2xl bg-[hsl(var(--ok))] text-white text-xl font-semibold flex items-center justify-center gap-2">
                                <CheckCircle2 className="h-7 w-7" /> OK confección
                            </button>
                            <button onClick={() => { setDialeg(null); finalitzarLliure('ko'); }} className="h-20 rounded-2xl bg-destructive text-destructive-foreground text-xl font-semibold flex items-center justify-center gap-2">
                                <AlertTriangle className="h-7 w-7" /> No OK (retrabajo)
                            </button>
                            <button onClick={() => setDialeg(null)} className="h-14 rounded-xl bg-secondary font-semibold">Seguir trabajando</button>
                        </div>
                    </div>
                </div>
            )}

            {dialeg === 'incidencia_lliure' && (
                <div className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-black/60 p-4">
                    <div className="w-full max-w-lg rounded-2xl bg-card p-5 max-h-[90vh] overflow-y-auto">
                        <h3 className="font-display text-2xl uppercase mb-3">Registrar incidencia</h3>
                        <p className="text-sm font-semibold mb-2">Tipo</p>
                        <div className="grid grid-cols-3 gap-2 mb-3">
                            {TIPUS_INCIDENCIA.map((t) => (
                                <button key={t} onClick={() => setTipusIncidencia(t)}
                                    className={`h-12 rounded-xl border text-sm font-semibold active:scale-[0.98] ${tipusIncidencia === t ? 'border-destructive bg-destructive/10 text-destructive' : 'border-border'}`}>{t}</button>
                            ))}
                        </div>
                        <textarea value={textIncidencia} onChange={(e) => setTextIncidencia(e.target.value)} rows={3}
                            className="w-full rounded-xl border border-input bg-background p-3 text-lg" placeholder="Descripción..." />
                        <div className="mt-4 grid grid-cols-2 gap-3">
                            <button onClick={() => { setDialeg(null); setTextIncidencia(''); setTipusIncidencia(''); }}
                                className="h-14 rounded-xl bg-secondary font-semibold">Cancelar</button>
                            <button onClick={() => {
                                if (!textIncidencia.trim() && !tipusIncidencia) return;
                                afegirIncidenciaLliure(tipusIncidencia || 'Otra', textIncidencia.trim() || tipusIncidencia);
                                setTextIncidencia(''); setTipusIncidencia(''); setDialeg(null);
                            }} className="h-14 rounded-xl bg-destructive text-destructive-foreground font-semibold">Guardar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Popup automático de retrabajo asignado */}
            <RetrabajoPopup
                userId={user?.id}
                onVerRetrabajo={() => {
                    // Volver a la cola y refrescar retrabajos
                    setView('queue');
                    setExclusivaId(null);
                    setFaseSelec(null);
                    carregaRetrabajos();
                }}
            />

            <MensajeExclusivaPopup userId={user?.id} />
        </div>
    );
};

export default OperarioPage;

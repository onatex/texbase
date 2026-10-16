import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BarChart, Bar, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  Users, Clock, TrendingUp, AlertTriangle, CheckCircle,
  Calendar, Settings, RefreshCw, CalendarDays, Info,
  TrendingDown, Minus, ChevronDown, ChevronUp, Edit2, Save, X, History, Package,
} from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/lib/auth';

const COLORS = ['#1e3a5f', '#f97316', '#10b981', '#6366f1', '#f59e0b', '#ef4444'];

function fmt(n) {
  return new Intl.NumberFormat('ca-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);
}

function fmtDate(iso) {
  if (!iso) return '—';
  const norm = normalizeDate(iso);
  if (!norm) return '—';
  const [y, m, d] = norm.split('-');
  return `${d}/${m}/${y}`;
}

// Normalize any date format (ISO YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, Date objects,
// full ISO datetime) into a canonical YYYY-MM-DD string. Returns '' if unparseable.
function normalizeDate(v) {
  if (!v) return '';
  if (v instanceof Date && !isNaN(v)) {
    return v.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (!s) return '';
  // ISO datetime (2026-08-11T10:00:00Z) or ISO date (2026-08-11)
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (dmyMatch) {
    const dd = dmyMatch[1].padStart(2, '0');
    const mm = dmyMatch[2].padStart(2, '0');
    return `${dmyMatch[3]}-${mm}-${dd}`;
  }
  // YYYY/MM/DD
  const ymdMatch = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/);
  if (ymdMatch) {
    const mm = ymdMatch[2].padStart(2, '0');
    const dd = ymdMatch[3].padStart(2, '0');
    return `${ymdMatch[1]}-${mm}-${dd}`;
  }
  return '';
}

// Build a Set of date strings in range [from, to] that fall on Mon-Fri
function buildWorkingDays(from, to, nonWorkingSet) {
  if (!from || !to) return { total: 0, working: 0, nonWorking: 0 };
  const start = new Date(from);
  const end = new Date(to);
  let total = 0, nonWorking = 0;
  const cur = new Date(start);
  while (cur <= end) {
    total++;
    const iso = cur.toISOString().slice(0, 10);
    const dow = cur.getDay(); // 0=Sun,6=Sat
    if (dow === 0 || dow === 6 || nonWorkingSet.has(iso)) {
      nonWorking++;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return { total, working: total - nonWorking, nonWorking };
}

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

const ESTADO_LABEL = {
  pendent: 'Pendent',
  recibida: 'Recibida',
  en_curs: 'En curso',
  finalitzada: 'Finalitzada',
  bloquejada: 'Bloquejada',
  lista_recollida: 'Lista recoger',
  entregada: 'Entregada',
  retrasada: 'Retrasada',
  en_retrabajo: 'En retrabajo',
  pendiente_calidad: 'Pendiente calidad',
  listo_para_entregar: 'Listo entregar',
  en_produccion: 'En producción',
};

// ── Core: build enriched exclusiva rows with internal pending time ──────────
// tiempo pendiente (interno) = tiempo total ruta − tiempo completado − tiempo fases externas
function buildRows(exclusives, opsDef, fasesExt, registres) {
  // group operations by ruta
  const opsByRuta = {};
  for (const op of opsDef) {
    if (op.actiu === false) continue;
    (opsByRuta[op.ruta] = opsByRuta[op.ruta] || []).push(op);
  }
  // group externalized fases by exclusiva
  const fasesByExc = {};
  for (const f of fasesExt) {
    (fasesByExc[f.exclusiva_id] = fasesByExc[f.exclusiva_id] || []).push(f);
  }
  // group finalized registres by exclusiva → operation codi → set of mono ids
  const regsByExc = {};
  for (const r of registres) {
    if (r.estat !== 'finalitzat') continue;
    const codi = r.operacion_codi || r.operacio;
    if (!codi) continue;
    const byCodi = (regsByExc[r.exclusiva] = regsByExc[r.exclusiva] || {});
    (byCodi[codi] = byCodi[codi] || new Set()).add(r.mono || r.id);
  }

  return exclusives.map((exc) => {
    const uds = Math.max(1, Number(exc.unitats || 0));
    const routeOps = (opsByRuta[exc.ruta] || []).slice().sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));

    // per-unit totals per fase + total route per unit
    const fasePerUnit = {};
    let totalRoutePerUnit = 0;
    for (const op of routeOps) {
      const m = Number(op.temps_std_min || 0);
      totalRoutePerUnit += m;
      const fl = op.fase || '—';
      fasePerUnit[fl] = (fasePerUnit[fl] || 0) + m;
    }

    // externalized fase labels for this exclusiva (ALL externalized = not internal)
    const extFases = fasesByExc[exc.id] || [];
    const extFaseLabels = extFases
      .map((f) => f.fase)
      .filter((v, i, a) => v && a.indexOf(v) === i);

    // externalized time = sum of fase per-unit totals × units
    let externasPerUnit = 0;
    for (const fl of extFaseLabels) {
      externasPerUnit += fasePerUnit[fl] || 0;
    }

    // completed time = for each route op, count distinct monos finalized × per-unit time
    const excRegs = regsByExc[exc.id] || {};
    let completadoMin = 0;
    const completedOps = new Set();
    for (const op of routeOps) {
      const key = op.codi || op.nom;
      const monoSet = excRegs[key];
      if (monoSet && monoSet.size > 0) {
        completadoMin += monoSet.size * Number(op.temps_std_min || 0);
        // mark as fully completed only if every unit finished it
        if (monoSet.size >= uds) completedOps.add(key);
      }
    }

    const tiempoTotalRuta = totalRoutePerUnit * uds;
    const tiempoCompletado = completadoMin;
    const tiempoFasesExternas = externasPerUnit * uds;
    const tiempoPendiente = Math.max(0, tiempoTotalRuta - tiempoCompletado - tiempoFasesExternas);

    // fase actual = first pending internal operation's fase (skip externalized + completed)
    let faseActual = '—';
    for (const op of routeOps) {
      const fl = op.fase || '—';
      if (extFaseLabels.includes(fl)) continue;
      const key = op.codi || op.nom;
      if (completedOps.has(key)) continue;
      faseActual = fl;
      break;
    }
    if (!routeOps.length) faseActual = '—';
    if (faseActual === '—' && routeOps.length && completedOps.size >= routeOps.filter((o) => !extFaseLabels.includes(o.fase)).length) {
      faseActual = 'Finalitzada';
    }

    // operaciones pendientes internas = internal ops not fully completed
    const opsPendientes = routeOps.filter((op) => {
      const fl = op.fase || '—';
      if (extFaseLabels.includes(fl)) return false;
      const key = op.codi || op.nom;
      return !completedOps.has(key);
    }).length;

    return {
      id: exc.id,
      numero: exc.exclusiva || '—',
      referencia: exc.referencia || exc.article || '—',
      article: exc.article || '—',
      unitats: uds,
      faseActual,
      estado: exc.estat || '—',
      opsPendientes,
      tiempoTotalRuta: Math.round(tiempoTotalRuta),
      tiempoCompletado: Math.round(tiempoCompletado),
      tiempoFasesExternas: Math.round(tiempoFasesExternas),
      tiempoPendiente: Math.round(tiempoPendiente),
      entrega: normalizeDate(exc.data_entrega || exc.data_estimada || ''),
      tieneRuta: !!exc.ruta && routeOps.length > 0,
    };
  });
}

export default function ForecastRecursos() {
  const { user } = useAuth();
  const [salariHora, setSalariHora] = useState(12);
  // Operarios config (from configuracion_forecast collection)
  const [numeroOperaris, setNumeroOperaris] = useState(0);
  const [jornadaHores, setJornadaHores] = useState(8);
  const [numeroTurnos, setNumeroTurnos] = useState(1);
  const [configHistory, setConfigHistory] = useState([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showConfigHistory, setShowConfigHistory] = useState(false);
  // Edit modal form state
  const [editOperaris, setEditOperaris] = useState(0);
  const [editJornada, setEditJornada] = useState(8);
  const [editTurnos, setEditTurnos] = useState(1);
  const [editNotas, setEditNotas] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [dateFrom, setDateFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [selectedProposal, setSelectedProposal] = useState(null);
  const [exclusives, setExclusives] = useState([]);
  const [opsDef, setOpsDef] = useState([]);
  const [fasesExt, setFasesExt] = useState([]);
  const [registres, setRegistres] = useState([]);
  const [operaris, setOperaris] = useState([]);
  const [calendari, setCalendari] = useState([]);
  const [registresHistory, setRegistresHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCalendarDetail, setShowCalendarDetail] = useState(false);
  const [showHistoryDetail, setShowHistoryDetail] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date();
      const fourWeeksAgo = new Date(today); fourWeeksAgo.setDate(today.getDate() - 28);

      const [exs, ops, cal, rh, cfg] = await Promise.all([
        pb.collection('exclusives').getFullList({
          filter: 'estat != "entregada" && estat != "finalitzada"',
          requestKey: 'fc-ex',
        }).catch(() => []),
        pb.collection('operacions_def').getFullList({
          sort: 'ordre',
          requestKey: 'fc-ops',
        }).catch(() => []),
        pb.collection('calendario_laboral').getFullList({
          filter: 'tipo = "festivo" || tipo = "vacaciones"',
          fields: 'fecha,tipo,descripcio,operaris_en_vacances',
          requestKey: 'fc-cal',
        }).catch(() => []),
        pb.collection('registro_horario').getFullList({
          filter: `fecha >= "${fourWeeksAgo.toISOString().slice(0, 10)}"`,
          fields: 'operari,fecha,duracion_jornada_min,tiempo_productivo_min,numero_operaciones_completadas',
          requestKey: 'fc-rh',
          sort: '-fecha',
        }).catch(() => []),
        pb.collection('configuracion_forecast').getFullList({
          sort: '-created',
          expand: 'usuario_id',
          requestKey: 'fc-config',
        }).catch(() => []),
      ]);

      // operaris (internal production workers)
      let opsUsers = [];
      try {
        opsUsers = await pb.collection('users').getFullList({
          filter: 'rol = "operari"',
          fields: 'id,name,codi',
          requestKey: 'fc-users',
        });
      } catch (e) { console.error(e); }

      // externalized fases + finalized registres for these exclusives
      let fases = [];
      let regs = [];
      if (exs.length) {
        const excIds = exs.map((e) => e.id);
        // chunk to avoid huge filter strings
        const chunk = (arr, n) => arr.reduce((acc, x, i) => { (acc[Math.floor(i / n)] = acc[Math.floor(i / n)] || []).push(x); return acc; }, []);
        const excChunks = chunk(excIds, 40);
        const faseFilters = excChunks.map((c) => c.map((id) => `exclusiva_id = "${id}"`).join(' || '));
        const regFilters = excChunks.map((c) => c.map((id) => `exclusiva = "${id}"`).join(' || '));
        const [faseLists, regLists] = await Promise.all([
          Promise.all(faseFilters.map((f, i) =>
            pb.collection('fases_externalizadas_exclusiva').getFullList({
              filter: f,
              expand: 'fase_articulo',
              requestKey: `fc-fases-${i}`,
            }).catch(() => []))),
          Promise.all(regFilters.map((f, i) =>
            pb.collection('registres').getFullList({
              filter: `(${f}) && estat = "finalitzat"`,
              fields: 'id,exclusiva,mono,operacio,operacion_codi,estat',
              requestKey: `fc-regs-${i}`,
            }).catch(() => []))),
        ]);
        fases = faseLists.flat();
        regs = regLists.flat();
      }

      setExclusives(exs);
      setOpsDef(ops);
      setFasesExt(fases);
      setRegistres(regs);
      setOperaris(opsUsers);
      setCalendari(cal);
      setRegistresHistory(rh);

      // ── DEBUG: log raw loaded data ──────────────────────────────────────
      console.group('[ForecastRecursos] Datos cargados');
      console.log('Exclusivas cargadas (estat != entregada/finalitzada):', exs.length);
      console.log('Estados presentes:', exs.reduce((m, e) => (m[e.estat || '—'] = (m[e.estat || '—'] || 0) + 1, m), {}));
      console.log('Operaciones def (rutas):', ops.length);
      console.log('Fases externalizadas:', fases.length);
      console.log('Registres finalitzats:', regs.length);
      console.log('Operaris internos:', opsUsers.length);
      console.log('Calendari festius/vacances:', cal.length);
      console.log('Config forecast:', cfg?.length || 0, 'registres');
      console.log('Muestra exclusivas (5):', exs.slice(0, 5).map(e => ({ exclusiva: e.exclusiva, estat: e.estat, ruta: e.ruta, data_entrega: e.data_entrega, unitats: e.unitats })));
      console.groupEnd();
      if (cfg && cfg.length > 0) {
        const latest = cfg[0];
        setNumeroOperaris(Number(latest.numero_operarios) || opsUsers.length);
        setJornadaHores(Number(latest.jornada_horas) || 8);
        setNumeroTurnos(Number(latest.numero_turnos) || 1);
        setConfigHistory(cfg);
      } else {
        setNumeroOperaris(opsUsers.length);
        setJornadaHores(8);
        setNumeroTurnos(1);
        setConfigHistory([]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Enriched rows with internal pending time
  const rows = useMemo(
    () => buildRows(exclusives, opsDef, fasesExt, registres),
    [exclusives, opsDef, fasesExt, registres],
  );

  // Non-working days set (festivos + vacaciones)
  const nonWorkingSet = useMemo(() => {
    const s = new Set();
    for (const c of calendari) s.add(c.fecha);
    return s;
  }, [calendari]);

  // Calendar analysis for the selected range
  const calAnalysis = useMemo(() => {
    const { total, working, nonWorking } = buildWorkingDays(dateFrom, dateTo, nonWorkingSet);
    const festivosInRange = calendari.filter(c => c.tipo === 'festivo' && c.fecha >= dateFrom && c.fecha <= dateTo);
    const vacancesInRange = calendari.filter(c => c.tipo === 'vacaciones' && c.fecha >= dateFrom && c.fecha <= dateTo);
    const weekends = nonWorking - festivosInRange.length - vacancesInRange.length;
    return { total, working, nonWorking, festivos: festivosInRange, vacances: vacancesInRange, weekends: Math.max(0, weekends) };
  }, [dateFrom, dateTo, calendari, nonWorkingSet]);

  // Filter by delivery date range, sorted by entrega ascending
  const filtered = useMemo(() => {
    return rows
      .filter((r) => {
        if (dateFrom && r.entrega && r.entrega < dateFrom) return false;
        if (dateTo && r.entrega && r.entrega > dateTo) return false;
        return true;
      })
      .sort((a, b) => (a.entrega || '9999').localeCompare(b.entrega || '9999'));
  }, [rows, dateFrom, dateTo]);

  // History computations
  const history = useMemo(() => {
    if (!registresHistory.length) return { yesterday: 0, prevWeek: { total: 0, ops: [], perOperari: [] }, prevMonth: 0, trendWeeks: [] };

    const today = new Date();
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const yStr = yesterday.toISOString().slice(0, 10);

    const thisWeekStart = getWeekStart(today.toISOString().slice(0, 10));
    const prevWeekStart = new Date(thisWeekStart); prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const prevWeekEnd = new Date(thisWeekStart); prevWeekEnd.setDate(prevWeekEnd.getDate() - 1);
    const prevWeekStartStr = prevWeekStart.toISOString().slice(0, 10);
    const prevWeekEndStr = prevWeekEnd.toISOString().slice(0, 10);

    const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().slice(0, 10);
    const prevMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0).toISOString().slice(0, 10);

    const yday = registresHistory.filter(r => r.fecha === yStr)
      .reduce((s, r) => s + (Number(r.duracion_jornada_min) || 0), 0) / 60;

    const prevWeekRecs = registresHistory.filter(r => r.fecha >= prevWeekStartStr && r.fecha <= prevWeekEndStr);
    const prevWeekTotal = prevWeekRecs.reduce((s, r) => s + (Number(r.duracion_jornada_min) || 0), 0) / 60;

    const perOpMap = new Map();
    for (const r of prevWeekRecs) {
      const cur = perOpMap.get(r.operari) || { operari: r.operari, hores: 0, ops: 0, dies: new Set() };
      cur.hores += (Number(r.duracion_jornada_min) || 0) / 60;
      cur.ops += Number(r.numero_operaciones_completadas) || 0;
      cur.dies.add(r.fecha);
      perOpMap.set(r.operari, cur);
    }
    const perOperari = [...perOpMap.values()].sort((a, b) => b.hores - a.hores);

    const prevMonthTotal = registresHistory
      .filter(r => r.fecha >= prevMonthStart && r.fecha <= prevMonthEnd)
      .reduce((s, r) => s + (Number(r.duracion_jornada_min) || 0), 0) / 60;

    const trendWeeks = [];
    for (let i = 3; i >= 0; i--) {
      const wStart = new Date(thisWeekStart); wStart.setDate(wStart.getDate() - (i + 1) * 7);
      const wEnd = new Date(wStart); wEnd.setDate(wEnd.getDate() + 6);
      const wStartStr = wStart.toISOString().slice(0, 10);
      const wEndStr = wEnd.toISOString().slice(0, 10);
      const wHores = registresHistory
        .filter(r => r.fecha >= wStartStr && r.fecha <= wEndStr)
        .reduce((s, r) => s + (Number(r.duracion_jornada_min) || 0), 0) / 60;
      const label = `${wStartStr.slice(5).replace('-', '/')}`;
      trendWeeks.push({ semana: label, hores: Math.round(wHores * 10) / 10 });
    }

    return {
      yesterday: Math.round(yday * 10) / 10,
      prevWeek: { total: Math.round(prevWeekTotal * 10) / 10, perOperari },
      prevMonth: Math.round(prevMonthTotal * 10) / 10,
      trendWeeks,
    };
  }, [registresHistory]);

  // ── Forecast totals based on INTERNAL pending time ───────────────────────
  const totalMin = filtered.reduce((s, r) => s + r.tiempoPendiente, 0);
  const totalHores = totalMin / 60;
  const nOps = numeroOperaris || operaris.length;
  const horesDia = jornadaHores || 8;
  const nTurnos = numeroTurnos || 1;
  const diesLaborals = calAnalysis.working;
  const capacitat = nOps * horesDia * nTurnos * diesLaborals;
  const diferencia = capacitat - totalHores;
  const utilizacio = capacitat > 0 ? (totalHores / capacitat) * 100 : 0;
  const horasFalta = Math.max(0, totalHores - capacitat);
  const estat = utilizacio > 100 ? 'critic' : utilizacio > 85 ? 'risc' : 'ok';

  // ── DEBUG: log forecast calculations whenever inputs change ──────────────
  useEffect(() => {
    console.group('[ForecastRecursos] Cálculos de forecast');
    console.log('Período seleccionado:', { dateFrom, dateTo });
    console.log('Total exclusivas cargadas (rows):', rows.length);
    console.log('Total exclusivas en período (filtered):', filtered.length);
    console.log('Exclusivas sin fecha de entrega:', rows.filter(r => !r.entrega).length);
    console.log('Tiempo total pendiente (min):', totalMin, '→ horas:', totalHores.toFixed(1));
    console.log('Operarios seleccionados (nOps):', nOps, '| jornada:', horesDia, 'h | turnos:', nTurnos);
    console.log('Días laborales en rango:', diesLaborals, '| capacidad (h):', capacitat.toFixed(1));
    console.log('Utilización:', utilizacio.toFixed(1) + '%', '| estado:', estat);
    console.log('Filtered (muestra 10):', filtered.slice(0, 10).map(r => ({ numero: r.numero, entrega: r.entrega, pendiente: r.tiempoPendiente, ops: r.opsPendientes, tieneRuta: r.tieneRuta })));
    console.groupEnd();
  }, [rows, filtered, totalMin, totalHores, nOps, horesDia, nTurnos, diesLaborals, capacitat, utilizacio, estat, dateFrom, dateTo]);

  const opsExtra = Math.max(1, Math.ceil(horasFalta / (horesDia * Math.max(diesLaborals, 1))));
  const combinacioOps = Math.max(1, Math.ceil(opsExtra / 2));
  const combinacioHores = Math.max(0, horasFalta - combinacioOps * horesDia * diesLaborals);
  const dissabtes = nOps > 0 ? Math.ceil(horasFalta / (nOps * horesDia)) : 0;

  const costHoresExtres = horasFalta * salariHora * 1.5;
  const costOpsExtra = opsExtra * horesDia * diesLaborals * salariHora;
  const costDissabtes = dissabtes * nOps * horesDia * salariHora * 1.5;
  const costCombinacio = combinacioOps * horesDia * diesLaborals * salariHora + combinacioHores * salariHora * 1.5;

  const byArticle = useMemo(() => {
    const map = new Map();
    for (const r of filtered) {
      const art = r.article || 'Sense article';
      const cur = map.get(art) || { article: art, count: 0, minutes: 0 };
      cur.count++;
      cur.minutes += r.tiempoPendiente;
      map.set(art, cur);
    }
    return [...map.values()].sort((a, b) => b.minutes - a.minutes);
  }, [filtered]);

  const weeklyData = useMemo(() => {
    const map = new Map();
    const weekCap = nOps * horesDia * 5;
    for (const r of filtered) {
      const dateStr = r.entrega;
      const key = dateStr ? (() => {
        const d = new Date(dateStr);
        const monday = new Date(d);
        monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        return monday.toISOString().slice(0, 10);
      })() : 'Sense data';
      const label = key === 'Sense data' ? key : key.slice(5);
      const cur = map.get(key) || { semana: label, demanda: 0, capacitat: weekCap };
      cur.demanda += r.tiempoPendiente / 60;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => {
      if (a.semana === 'Sense data') return 1;
      if (b.semana === 'Sense data') return -1;
      return a.semana.localeCompare(b.semana);
    }).slice(0, 10);
  }, [filtered, nOps, horesDia]);

  const inp = 'border border-gray-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30';

  const summary = useMemo(() => {
    const totalEx = filtered.length;
    const totalUds = filtered.reduce((s, r) => s + r.unitats, 0);
    const perArticle = new Map();
    for (const r of filtered) {
      const art = r.article || 'Sense article';
      const cur = perArticle.get(art) || { article: art, exclusivas: 0, unidades: 0 };
      cur.exclusivas++;
      cur.unidades += r.unitats;
      perArticle.set(art, cur);
    }
    return {
      totalEx,
      totalUds,
      perArticle: [...perArticle.values()].sort((a, b) => b.exclusivas - a.exclusivas),
    };
  }, [filtered]);

  const DIES_SETMANA = ['Diumenge', 'Dilluns', 'Dimarts', 'Dimecres', 'Dijous', 'Divendres', 'Dissabte'];
  const perWeekday = useMemo(() => {
    const map = new Map();
    for (const r of filtered) {
      if (!r.entrega) continue;
      const iso = r.entrega;
      const d = new Date(iso + 'T00:00:00');
      const dow = d.getDay();
      const dayName = DIES_SETMANA[dow];
      const cur = map.get(iso) || { iso, dayName, dow, exclusivas: 0, unidades: 0, perArticle: new Map() };
      cur.exclusivas++;
      cur.unidades += r.unitats;
      const art = r.article || 'Sense article';
      const ac = cur.perArticle.get(art) || { article: art, exclusivas: 0, unidades: 0 };
      ac.exclusivas++;
      ac.unidades += r.unitats;
      cur.perArticle.set(art, ac);
      map.set(iso, cur);
    }
    const dailyCapHores = nOps * horesDia * nTurnos;
    return [...map.values()]
      .map((d) => {
        const minNeeded = filtered.filter((r) => r.entrega === d.iso).reduce((s, r) => s + r.tiempoPendiente, 0);
        const horesNeeded = minNeeded / 60;
        const saturacio = dailyCapHores > 0 ? (horesNeeded / dailyCapHores) * 100 : 0;
        return {
          ...d,
          perArticle: [...d.perArticle.values()].sort((a, b) => b.exclusivas - a.exclusivas),
          horesNeeded,
          dailyCapHores,
          saturacio,
        };
      })
      .sort((a, b) => a.iso.localeCompare(b.iso));
  }, [filtered, nOps, horesDia, nTurnos]);

  const openEditModal = () => {
    setEditOperaris(numeroOperaris || operaris.length);
    setEditJornada(jornadaHores || 8);
    setEditTurnos(numeroTurnos || 1);
    setEditNotas('');
    setShowEditModal(true);
  };

  const saveConfig = async () => {
    setSavingConfig(true);
    try {
      await pb.collection('configuracion_forecast').create({
        numero_operarios: Number(editOperaris) || 0,
        jornada_horas: Number(editJornada) || 8,
        numero_turnos: Number(editTurnos) || 1,
        fecha_actualizacion: new Date().toISOString(),
        usuario_id: user?.id || '',
        notas: editNotas || '',
      });
      setShowEditModal(false);
      await load();
    } catch (e) {
      console.error('Error guardant configuració:', e);
      alert('Error al guardar la configuración: ' + (e?.message || e));
    } finally {
      setSavingConfig(false);
    }
  };

  const estatConfig = {
    ok: { cls: 'bg-emerald-50 border-emerald-200 text-emerald-800', icon: <CheckCircle size={20} className="text-emerald-600 shrink-0" />, label: 'Capacitat suficient', sub: `Sobren ${Math.abs(diferencia).toFixed(0)} hores (${(100 - utilizacio).toFixed(0)}% disponible)` },
    risc: { cls: 'bg-amber-50 border-amber-200 text-amber-800', icon: <AlertTriangle size={20} className="text-amber-600 shrink-0" />, label: 'En risc de retard', sub: `Utilització al ${utilizacio.toFixed(0)}% — revisar planificació` },
    critic: { cls: 'bg-red-50 border-red-200 text-red-800', icon: <AlertTriangle size={20} className="text-red-600 shrink-0" />, label: 'Capacitat insuficient', sub: `Falten ${horasFalta.toFixed(0)} hores — cal acció immediata` },
  };

  const proposals = [
    { id: 'hores_extres', label: 'Hores extres', desc: `${horasFalta.toFixed(0)} h extres en total`, detail: nOps > 0 ? `~${(horasFalta / nOps).toFixed(1)}h per operari` : '—', cost: costHoresExtres, icon: <Clock size={20} />, cls: 'border-orange-200 bg-orange-50' },
    { id: 'operaris_extra', label: `${opsExtra} operaris més`, desc: `Contractar ${opsExtra} nous operaris`, detail: `${horesDia}h/dia × ${diesLaborals} dies`, cost: costOpsExtra, icon: <Users size={20} />, cls: 'border-blue-200 bg-blue-50' },
    { id: 'dissabtes', label: `${dissabtes} dissabtes`, desc: `Treballar ${dissabtes} dissabtes`, detail: `${nOps} op. × ${horesDia}h (×1.5)`, cost: costDissabtes, icon: <Calendar size={20} />, cls: 'border-purple-200 bg-purple-50' },
    { id: 'combinacio', label: 'Combinació', desc: `${combinacioOps} op. + ${combinacioHores.toFixed(0)}h extres`, detail: 'Opció mixta recomanada', cost: costCombinacio, icon: <TrendingUp size={20} />, cls: 'border-emerald-200 bg-emerald-50' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 gap-2">
        <RefreshCw size={18} className="animate-spin" /> Carregant dades...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with date range + operarios config */}
      <div className="bg-[#1e3a5f] rounded-xl p-5 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl uppercase tracking-wide">Forecast de recursos (operacions internes)</h2>
            <p className="text-white/70 text-sm mt-1">
              Del <strong>{fmtDate(dateFrom)}</strong> al <strong>{fmtDate(dateTo)}</strong>
              {' — '}{calAnalysis.total} dies totals, <strong className="text-white">{calAnalysis.working} laborals</strong>
              {calAnalysis.festivos.length > 0 && `, ${calAnalysis.festivos.length} festius`}
              {calAnalysis.vacances.length > 0 && `, ${calAnalysis.vacances.length} dies de vacances`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowConfigHistory(v => !v)} className="flex items-center gap-2 border border-white/30 rounded-lg px-3 py-2 text-sm hover:bg-white/10">
              <History size={14} /> Historial
            </button>
            <button onClick={load} className="flex items-center gap-2 border border-white/30 rounded-lg px-3 py-2 text-sm hover:bg-white/10">
              <RefreshCw size={14} /> Actualitzar
            </button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-white/60 block mb-1">Des de</label>
            <input type="date" className="border border-white/30 bg-white/10 text-white rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-white/30" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-white/60 block mb-1">Fins a</label>
            <input type="date" className="border border-white/30 bg-white/10 text-white rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-white/30" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <div className="sm:col-span-2 flex items-end">
            <div className="flex flex-wrap items-center gap-3 w-full bg-white/10 rounded-lg px-4 py-2.5">
              <div className="flex items-center gap-1.5">
                <Users size={16} className="text-[hsl(var(--accent))]" />
                <span className="text-sm"><strong>{nOps}</strong> operarios</span>
              </div>
              <span className="text-white/30">·</span>
              <span className="text-sm">Jornada: <strong>{horesDia}h</strong></span>
              <span className="text-white/30">·</span>
              <span className="text-sm">Turnos: <strong>{nTurnos}</strong></span>
              <button onClick={openEditModal} className="ml-auto flex items-center gap-1.5 rounded-md bg-[hsl(var(--accent))] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 active:scale-95 transition">
                <Edit2 size={13} /> Editar operarios
              </button>
            </div>
          </div>
        </div>

        <p className="mt-3 text-xs text-white/60">
          El temps pendient es calcula com <strong>temps total ruta − operacions completades − fases externalitzades</strong>.
          Només resta la feina interna que ha de fer l'equip de producció.
        </p>

        {showConfigHistory && (
          <div className="mt-4 border-t border-white/20 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/60 mb-2">Historial de cambios de operarios</p>
            {configHistory.length === 0 ? (
              <p className="text-xs text-white/50">Sin cambios registrados.</p>
            ) : (
              <div className="overflow-x-auto max-h-48 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="text-white/60 text-left">
                    <tr>
                      <th className="px-2 py-1 font-semibold">Fecha</th>
                      <th className="px-2 py-1 font-semibold">Operarios</th>
                      <th className="px-2 py-1 font-semibold">Jornada</th>
                      <th className="px-2 py-1 font-semibold">Turnos</th>
                      <th className="px-2 py-1 font-semibold">Usuario</th>
                      <th className="px-2 py-1 font-semibold">Notas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {configHistory.slice(0, 20).map((c) => (
                      <tr key={c.id} className="text-white/80">
                        <td className="px-2 py-1.5 whitespace-nowrap">{c.fecha_actualizacion ? new Date(c.fecha_actualizacion).toLocaleString('es-ES') : new Date(c.created).toLocaleString('es-ES')}</td>
                        <td className="px-2 py-1.5 font-semibold">{c.numero_operarios}</td>
                        <td className="px-2 py-1.5">{c.jornada_horas}h</td>
                        <td className="px-2 py-1.5">{c.numero_turnos}</td>
                        <td className="px-2 py-1.5">{c.expand?.usuario_id?.name || c.expand?.usuario_id?.codi || '—'}</td>
                        <td className="px-2 py-1.5 max-w-[200px] truncate">{c.notas || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Summary: total exclusivas, unidades, desglose por artículo */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2"><Package size={16} className="text-[#1e3a5f]"/>Resumen de exclusivas a entregar</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div className="bg-[#1e3a5f]/5 rounded-lg p-4 text-center border border-[#1e3a5f]/10">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total exclusivas</p>
            <p className="text-3xl font-bold text-[#1e3a5f] mt-1">{summary.totalEx}</p>
          </div>
          <div className="bg-orange-50 rounded-lg p-4 text-center border border-orange-100">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total unidades</p>
            <p className="text-3xl font-bold text-orange-600 mt-1">{summary.totalUds}</p>
          </div>
          <div className="bg-emerald-50 rounded-lg p-4 text-center border border-emerald-100">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Artículos distintos</p>
            <p className="text-3xl font-bold text-emerald-700 mt-1">{summary.perArticle.length}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 text-center border border-gray-100">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Hores pendents (internes)</p>
            <p className="text-3xl font-bold text-gray-700 mt-1">{totalHores.toFixed(0)}h</p>
          </div>
        </div>
        {summary.perArticle.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Artículo', 'Exclusivas', 'Unidades', '% del total'].map(h => (
                    <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {summary.perArticle.map((a, i) => {
                  const pct = summary.totalEx > 0 ? (a.exclusivas / summary.totalEx) * 100 : 0;
                  return (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-mono font-medium">{a.article}</td>
                      <td className="px-4 py-2.5 font-semibold">{a.exclusivas}</td>
                      <td className="px-4 py-2.5">{a.unidades}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-1.5 max-w-24">
                            <div className="bg-[#1e3a5f] h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs">{pct.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Per-weekday breakdown */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2"><CalendarDays size={16} className="text-[#1e3a5f]"/>Desglose por día de entrega</h3>
        {perWeekday.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Sin exclusivas con fecha de entrega en el rango seleccionado.</p>
        ) : (
          <div className="space-y-3">
            {perWeekday.map((d) => {
              const satCls = d.saturacio > 100 ? 'border-red-200 bg-red-50' : d.saturacio > 85 ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50';
              const satColor = d.saturacio > 100 ? 'text-red-600' : d.saturacio > 85 ? 'text-amber-600' : 'text-emerald-700';
              return (
                <div key={d.iso} className={`rounded-xl border p-4 ${satCls}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="text-center">
                        <p className="font-display text-lg uppercase leading-none text-gray-700">{d.dayName}</p>
                        <p className="text-xs text-gray-400">{fmtDate(d.iso)}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      <div><span className="text-gray-500">Exclusivas: </span><span className="font-bold text-gray-800">{d.exclusivas}</span></div>
                      <div><span className="text-gray-500">Unidades: </span><span className="font-bold text-gray-800">{d.unidades}</span></div>
                      <div><span className="text-gray-500">Horas: </span><span className="font-bold text-gray-800">{d.horesNeeded.toFixed(1)}h</span></div>
                      <div><span className="text-gray-500">Saturación: </span><span className={`font-bold ${satColor}`}>{d.saturacio.toFixed(0)}%</span></div>
                    </div>
                  </div>
                  <div className="mb-3">
                    <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                      <div className={`h-2 rounded-full ${d.saturacio > 100 ? 'bg-red-500' : d.saturacio > 85 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, d.saturacio)}%` }} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {d.perArticle.map((a, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5 rounded-md bg-white/80 border border-gray-200 px-2.5 py-1 text-xs">
                        <span className="font-mono font-semibold text-gray-700">{a.article}</span>
                        <span className="text-gray-400">·</span>
                        <span className="font-semibold text-[#1e3a5f]">{a.exclusivas} exc.</span>
                        <span className="text-gray-400">·</span>
                        <span className="text-gray-600">{a.unidades} uds.</span>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Calendar alerts */}
      {(calAnalysis.festivos.length > 0 || calAnalysis.vacances.length > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowCalendarDetail(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3 text-amber-800 hover:bg-amber-100 transition"
          >
            <div className="flex items-center gap-3">
              <CalendarDays size={18} className="text-amber-600" />
              <span className="font-semibold text-sm">
                {calAnalysis.festivos.length > 0 && `${calAnalysis.festivos.length} festiu${calAnalysis.festivos.length > 1 ? 's' : ''}`}
                {calAnalysis.festivos.length > 0 && calAnalysis.vacances.length > 0 && ' i '}
                {calAnalysis.vacances.length > 0 && `${calAnalysis.vacances.length} dia${calAnalysis.vacances.length > 1 ? 's' : ''} de vacances`}
                {' '}en el rang seleccionat — capacitat ajustada a {calAnalysis.working} dies laborals
              </span>
            </div>
            {showCalendarDetail ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {showCalendarDetail && (
            <div className="px-5 pb-4 border-t border-amber-200">
              <div className="grid sm:grid-cols-2 gap-4 mt-3">
                {calAnalysis.festivos.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-amber-700 uppercase mb-2">Festius ({calAnalysis.festivos.length})</p>
                    <ul className="space-y-1">
                      {calAnalysis.festivos.map(f => (
                        <li key={f.fecha} className="text-xs text-amber-800 flex gap-2">
                          <span className="font-mono font-medium">{fmtDate(f.fecha)}</span>
                          <span className="opacity-80">{f.descripcio}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {calAnalysis.vacances.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-amber-700 uppercase mb-2">Vacances ({calAnalysis.vacances.length})</p>
                    <ul className="space-y-1">
                      {calAnalysis.vacances.map(v => (
                        <li key={v.fecha} className="text-xs text-amber-800 flex gap-2">
                          <span className="font-mono font-medium">{fmtDate(v.fecha)}</span>
                          <span className="opacity-80">{v.descripcio}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* History section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <button
          onClick={() => setShowHistoryDetail(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition"
        >
          <h3 className="font-semibold text-gray-800 flex items-center gap-2"><TrendingUp size={16} />Historial d'hores treballades</h3>
          {showHistoryDetail ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </button>
        <div className="px-5 pb-4 grid grid-cols-3 gap-4 border-t border-gray-50">
          {[
            { label: 'Ahir', value: history.yesterday, unit: 'h' },
            { label: 'Setmana anterior', value: history.prevWeek.total, unit: 'h' },
            { label: 'Mes anterior', value: history.prevMonth, unit: 'h' },
          ].map(({ label, value, unit }) => (
            <div key={label} className="text-center pt-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{value}{unit}</p>
            </div>
          ))}
        </div>
        {showHistoryDetail && (
          <div className="px-5 pb-5 space-y-5 border-t border-gray-100">
            {history.trendWeeks.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-semibold text-gray-700 mb-3">Tendència últimes 4 setmanes</p>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={history.trendWeeks}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="semana" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}h`} />
                    <Tooltip formatter={v => [`${v}h`, 'Hores']} />
                    <Line type="monotone" dataKey="hores" stroke="#1e3a5f" strokeWidth={2} dot={{ r: 4 }} name="Hores treballades" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            {history.prevWeek.perOperari.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-3">Operaris actius setmana anterior</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-2 text-xs text-gray-500 font-semibold uppercase">Operari</th>
                        <th className="text-right py-2 text-xs text-gray-500 font-semibold uppercase">Hores</th>
                        <th className="text-right py-2 text-xs text-gray-500 font-semibold uppercase">Operacions</th>
                        <th className="text-right py-2 text-xs text-gray-500 font-semibold uppercase">Dies treballats</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.prevWeek.perOperari.map((op) => {
                        const operariInfo = operaris.find(o => o.id === op.operari);
                        return (
                          <tr key={op.operari} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="py-2 font-medium">{operariInfo ? operariInfo.name : op.operari.slice(0, 8) + '…'}</td>
                            <td className="py-2 text-right tabular-nums">{op.hores.toFixed(1)}h</td>
                            <td className="py-2 text-right tabular-nums">{op.ops}</td>
                            <td className="py-2 text-right tabular-nums">{op.dies.size}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200">
                        <td className="py-2 font-bold">Total</td>
                        <td className="py-2 text-right font-bold tabular-nums">{history.prevWeek.total}h</td>
                        <td className="py-2 text-right font-bold tabular-nums">{history.prevWeek.perOperari.reduce((s, o) => s + o.ops, 0)}</td>
                        <td className="py-2 text-right text-gray-400 text-xs">{history.prevWeek.perOperari.length} op.</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
            {history.prevWeek.perOperari.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">Sense dades de la setmana anterior</p>
            )}
          </div>
        )}
      </div>

      {/* Config + Alert */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2"><Settings size={16} />Configuració</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Hores de treball per dia</label>
              <div className="flex items-center gap-2">
                <input type="number" className={inp} value={horesDia} readOnly min={1} max={24} />
                <span className="text-xs text-gray-400 whitespace-nowrap">via config</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Salari base (€/hora)</label>
              <input type="number" className={inp} value={salariHora} onChange={e => setSalariHora(Number(e.target.value))} min={0} step={0.5} />
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Dies totals en rang</span>
              <span className="font-semibold">{calAnalysis.total}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Dies laborals</span>
              <span className="font-semibold text-emerald-700">{calAnalysis.working}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Caps de setmana</span>
              <span className="font-semibold text-gray-400">{calAnalysis.weekends}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Festius</span>
              <span className="font-semibold text-amber-600">{calAnalysis.festivos.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Vacances</span>
              <span className="font-semibold text-orange-600">{calAnalysis.vacances.length}</span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className={`rounded-xl border p-4 flex items-center gap-3 ${estatConfig[estat].cls}`}>
            {estatConfig[estat].icon}
            <div>
              <p className="font-semibold">{estatConfig[estat].label}</p>
              <p className="text-sm opacity-80">{estatConfig[estat].sub}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Exclusives pendents', value: filtered.length, sub: 'En el període' },
              { label: 'Hores pendents (internes)', value: `${totalHores.toFixed(0)}h`, sub: `${totalMin.toFixed(0)} minuts` },
              { label: 'Capacitat ajustada', value: `${capacitat.toFixed(0)}h`, sub: `${nOps} op. × ${horesDia}h × ${diesLaborals}d lab.`, info: true },
              { label: 'Diferència', value: `${diferencia >= 0 ? '+' : ''}${diferencia.toFixed(0)}h`, sub: diferencia >= 0 ? 'Hores de marge' : 'Hores que falten', red: diferencia < 0 },
              { label: 'Utilització', value: `${utilizacio.toFixed(0)}%`, sub: utilizacio > 100 ? 'Sobrecarregat' : 'De la capacitat', red: utilizacio > 100 },
              { label: 'Operaris actius', value: nOps, sub: 'Disponibles al sistema' },
            ].map(({ label, value, sub, red, info }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                <p className="text-xs text-gray-500 uppercase tracking-wide flex items-center gap-1">
                  {label}
                  {info && <Info size={10} className="text-gray-300" title="Capacitat calculada amb dies laborals reals (excloent festius i vacances)" />}
                </p>
                <p className={`font-bold text-2xl mt-0.5 ${red ? 'text-red-600' : 'text-gray-800'}`}>{value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Proposals */}
      {horasFalta > 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Propostes per cobrir el dèficit de {horasFalta.toFixed(0)} hores</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {proposals.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedProposal(p.id === selectedProposal ? null : p.id)}
                className={`text-left rounded-xl border-2 p-4 transition ${selectedProposal === p.id ? 'border-[#1e3a5f] bg-[#1e3a5f]/5 ring-2 ring-[#1e3a5f]/20' : `${p.cls} hover:border-[#1e3a5f]/40`}`}
              >
                <div className="flex items-center gap-2 mb-2 text-gray-700">{p.icon}<span className="font-semibold text-sm">{p.label}</span></div>
                <p className="text-xs text-gray-600">{p.desc}</p>
                <p className="text-xs text-gray-400 mt-0.5">{p.detail}</p>
                <p className="font-bold text-lg mt-3 text-gray-800">{fmt(p.cost)}</p>
                <p className="text-xs text-gray-400">Cost estimat</p>
                {selectedProposal === p.id && <div className="mt-2 text-xs font-semibold text-[#1e3a5f]">✓ Seleccionada</div>}
              </button>
            ))}
          </div>
          {selectedProposal && (
            <div className="mt-4 bg-[#1e3a5f]/5 border border-[#1e3a5f]/20 rounded-lg p-4 text-sm text-[#1e3a5f]">
              <p className="font-semibold mb-1">Proposta seleccionada: {proposals.find(p => p.id === selectedProposal)?.label}</p>
              <p className="text-sm opacity-80">Cost estimat: <strong>{fmt(proposals.find(p => p.id === selectedProposal)?.cost)}</strong> — Basat en salari base de {salariHora}€/hora (hores extres a ×1.5)</p>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3 text-emerald-800">
          <CheckCircle size={20} className="text-emerald-600 shrink-0" />
          <p className="font-medium">La capacitat actual és suficient. Sobren {Math.abs(diferencia).toFixed(0)} hores ({(100 - utilizacio).toFixed(0)}% de marge).</p>
        </div>
      )}

      {/* Daily operari proposals */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2"><Users size={16} className="text-[#1e3a5f]"/>Proposta d'operaris per dia (setmana actual)</h3>
        {(() => {
          const today = new Date();
          const monday = new Date(today);
          monday.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1));
          const DAYS = ['Dilluns','Dimarts','Dimecres','Dijous','Divendres','Dissabte'];
          const totalMinPerEx = filtered.length > 0 ? totalMin / filtered.length : 120;
          const exPerDay = filtered.length / Math.max(diesLaborals, 1);
          const dailyData = DAYS.slice(0, 6).map((dayName, i) => {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            const iso = d.toISOString().slice(0, 10);
            const isoDay = d.getDay();
            const isPast = d < today && d.toDateString() !== today.toDateString();
            const isWeekend = isoDay === 0 || isoDay === 6;
            const minNeeded = exPerDay * totalMinPerEx;
            const needed = isWeekend ? 0 : Math.ceil(minNeeded / (horesDia * 60));
            const available = isWeekend ? 0 : nOps;
            const diff = available - needed;
            return { dayName, iso, needed, available, diff, isWeekend, isPast };
          });
          const barData = dailyData.filter(d => !d.isWeekend).map(d => ({ dia: d.dayName.slice(0,3), Necessaris: d.needed, Disponibles: d.available }));
          return (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {dailyData.map(d => (
                  <div key={d.dayName} className={`rounded-xl border p-3 text-center ${d.isWeekend ? 'bg-gray-50 opacity-50' : d.diff < 0 ? 'bg-red-50 border-red-200' : d.diff === 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                    <p className="text-xs font-semibold text-gray-500 uppercase">{d.dayName.slice(0,3)}</p>
                    <p className="text-xs text-gray-400">{d.iso}</p>
                    {d.isWeekend ? <p className="text-xs text-gray-400 mt-2">Cap de setmana</p> : (
                      <>
                        <p className={`text-2xl font-bold mt-2 ${d.diff < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{d.needed}</p>
                        <p className="text-xs text-gray-500">necessaris</p>
                        <p className="text-sm font-semibold mt-1 text-[#1e3a5f]">{d.available} disponibles</p>
                        {d.diff < 0 && <p className="text-xs text-red-600 font-semibold mt-1">Falten {Math.abs(d.diff)}</p>}
                        {d.diff > 0 && <p className="text-xs text-emerald-600 font-semibold mt-1">Sobren {d.diff}</p>}
                        {d.diff === 0 && <p className="text-xs text-amber-600 font-semibold mt-1">Ajustat</p>}
                      </>
                    )}
                  </div>
                ))}
              </div>
              {barData.length > 0 && (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={barData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                    <XAxis dataKey="dia" tick={{ fontSize: 11 }}/>
                    <YAxis tick={{ fontSize: 11 }}/>
                    <Tooltip/>
                    <Legend/>
                    <Bar dataKey="Necessaris" fill="#ef4444" radius={[4,4,0,0]}/>
                    <Bar dataKey="Disponibles" fill="#1e3a5f" opacity={0.5} radius={[4,4,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              )}
              {dailyData.some(d => !d.isWeekend && d.diff < 0) && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm flex items-center gap-2">
                  <AlertTriangle size={16}/> Alerta: hi ha dies aquesta setmana on es necessiten més operaris dels disponibles.
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Demanda setmanal vs. Capacitat</h3>
          {weeklyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="semana" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v.toFixed(0)}h`} />
                <Tooltip formatter={v => [`${Number(v).toFixed(1)}h`]} />
                <Legend />
                <Bar dataKey="demanda" name="Demanda (h)" radius={[4, 4, 0, 0]}>
                  {weeklyData.map((d, i) => (
                    <Cell key={i} fill={d.demanda > d.capacitat ? '#ef4444' : d.demanda > d.capacitat * 0.85 ? '#f97316' : '#10b981'} />
                  ))}
                </Bar>
                <Bar dataKey="capacitat" name="Capacitat (h)" fill="#1e3a5f" opacity={0.25} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Sense dades per al rang seleccionat</div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Càrrega per article</h3>
          {byArticle.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byArticle} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 60).toFixed(0)}h`} />
                <YAxis type="category" dataKey="article" tick={{ fontSize: 10 }} width={90} />
                <Tooltip formatter={v => [`${(v / 60).toFixed(1)}h`, 'Hores']} />
                <Bar dataKey="minutes" name="Minuts" radius={[0, 4, 4, 0]}>
                  {byArticle.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Sense dades</div>
          )}
        </div>
      </div>

      {/* Exclusivas table — internal pending operations */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Exclusives al període ({filtered.length}) — operacions internes pendents</h3>
          {filtered.length > 60 && <p className="text-xs text-gray-400">Mostrant les primeres 60</p>}
        </div>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {['Exclusiva', 'Referencia', 'Fase actual', 'Estado', 'Ops pendents', 'T. ruta', 'T. completat', 'T. externes', 'T. pendent', 'Entrega'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.slice(0, 60).map(r => (
                <tr key={r.id} className={`hover:bg-gray-50 ${!r.tieneRuta ? 'bg-amber-50/40' : ''}`}>
                  <td className="px-3 py-2 font-mono font-medium">{r.numero}</td>
                  <td className="px-3 py-2 text-gray-600">{r.referencia}</td>
                  <td className="px-3 py-2">{r.faseActual}</td>
                  <td className="px-3 py-2"><span className="px-2 py-0.5 rounded text-xs bg-gray-100">{ESTADO_LABEL[r.estado] || r.estado}</span></td>
                  <td className="px-3 py-2 text-center font-semibold">{r.opsPendientes}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.tiempoTotalRuta} min</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{r.tiempoCompletado} min</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-400">−{r.tiempoFasesExternas} min</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-[#1e3a5f]">{r.tiempoPendiente} min</td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.entrega)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-8 text-center text-gray-400">No hay exclusivas en este período.</td></tr>
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="bg-gray-50 font-semibold">
                <tr>
                  <td className="px-3 py-2" colSpan={8}>Total temps pendent intern</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[#1e3a5f]">{totalMin} min</td>
                  <td className="px-3 py-2 text-gray-500">{(totalMin / 60).toFixed(1)}h</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {filtered.some(r => !r.tieneRuta) && (
          <p className="px-5 py-2 text-xs text-amber-700 bg-amber-50 border-t border-amber-100">
            Les exclusivas marcadas en ámbar no tienen ruta asignada o la ruta no tiene operaciones; su tiempo pendiente se estima en 0.
          </p>
        )}
      </div>

      {/* Debug panel */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <button
          onClick={() => setShowDebug(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition"
        >
          <h3 className="font-semibold text-gray-800 flex items-center gap-2 text-sm">
            <Info size={16} className="text-gray-400" /> Panel de debug
          </h3>
          {showDebug ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </button>
        {showDebug && (
          <div className="px-5 pb-5 border-t border-gray-100 space-y-3 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 pt-3">
              {[
                { label: 'Período (desde)', value: dateFrom },
                { label: 'Período (fins)', value: dateTo },
                { label: 'Exclusivas cargadas', value: rows.length },
                { label: 'Exclusivas en período', value: filtered.length },
                { label: 'Sin fecha entrega', value: rows.filter(r => !r.entrega).length },
                { label: 'Tiempo pendiente (min)', value: totalMin },
                { label: 'Tiempo pendiente (h)', value: totalHores.toFixed(1) },
                { label: 'Operarios (nOps)', value: nOps },
                { label: 'Jornada (h)', value: horesDia },
                { label: 'Turnos', value: nTurnos },
                { label: 'Días laborales', value: diesLaborals },
                { label: 'Capacidad (h)', value: capacitat.toFixed(1) },
                { label: 'Utilización', value: `${utilizacio.toFixed(1)}%` },
                { label: 'Estado', value: estat },
              ].map(({ label, value }) => (
                <div key={label} className="bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                  <p className="text-gray-400 uppercase tracking-wide text-[10px]">{label}</p>
                  <p className="font-semibold text-gray-700 mt-0.5 truncate">{String(value)}</p>
                </div>
              ))}
            </div>
            <div className="bg-gray-900 text-gray-100 rounded-lg p-3 font-mono text-[11px] overflow-x-auto max-h-64 overflow-y-auto">
              <p className="text-green-400">// Estados presentes en exclusivas cargadas</p>
              <pre className="whitespace-pre-wrap">{JSON.stringify(exclusives.reduce((m, e) => (m[e.estat || '—'] = (m[e.estat || '—'] || 0) + 1, m), {}), null, 2)}</pre>
              <p className="text-green-400 mt-2">// Muestra de exclusivas (5)</p>
              <pre className="whitespace-pre-wrap">{JSON.stringify(exclusives.slice(0, 5).map(e => ({ exclusiva: e.exclusiva, estat: e.estat, ruta: e.ruta, data_entrega: e.data_entrega, unitats: e.unitats })), null, 2)}</pre>
              <p className="text-green-400 mt-2">// Muestra de filas filtradas (10)</p>
              <pre className="whitespace-pre-wrap">{JSON.stringify(filtered.slice(0, 10).map(r => ({ numero: r.numero, entrega: r.entrega, estado: r.estado, opsPendientes: r.opsPendientes, tiempoPendiente: r.tiempoPendiente, tieneRuta: r.tieneRuta })), null, 2)}</pre>
            </div>
            <p className="text-gray-400 text-[11px]">Información detallada disponible en la consola del navegador (console.group "ForecastRecursos").</p>
          </div>
        )}
      </div>

      {/* Edit operarios modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowEditModal(false)}>
          <div className="w-full max-w-md rounded-xl bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h3 className="font-display text-2xl uppercase">Editar operarios</h3>
              <button onClick={() => setShowEditModal(false)} className="rounded-md p-1.5 hover:bg-secondary"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Operarios disponibles</label>
                <input type="number" min={0} max={200} value={editOperaris} onChange={(e) => setEditOperaris(Number(e.target.value))}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30" />
                <p className="text-xs text-gray-400 mt-1">Operarios activos en el sistema: {operaris.length}</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Jornada (horas por día)</label>
                <div className="flex gap-2">
                  {[8, 10, 12].map((h) => (
                    <button key={h} onClick={() => setEditJornada(h)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition ${editJornada === h ? 'border-[#1e3a5f] bg-[#1e3a5f]/10 text-[#1e3a5f] ring-2 ring-[#1e3a5f]/20' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                      {h}h
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Número de turnos</label>
                <div className="flex gap-2">
                  {[1, 2, 3].map((t) => (
                    <button key={t} onClick={() => setEditTurnos(t)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition ${editTurnos === t ? 'border-[#1e3a5f] bg-[#1e3a5f]/10 text-[#1e3a5f] ring-2 ring-[#1e3a5f]/20' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                      {t} {t === 1 ? 'turno' : 'turnos'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Notas (opcional)</label>
                <textarea value={editNotas} onChange={(e) => setEditNotas(e.target.value)} rows={2}
                  placeholder="Motivo del cambio..."
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30" />
              </div>
              <div className="bg-[#1e3a5f]/5 rounded-lg p-3 text-sm border border-[#1e3a5f]/10">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Capacidad diaria estimada</p>
                <p className="font-bold text-[#1e3a5f] text-lg">
                  {(Number(editOperaris) || 0) * (Number(editJornada) || 8) * (Number(editTurnos) || 1)}h/día
                </p>
                <p className="text-xs text-gray-400">{editOperaris} op. × {editJornada}h × {editTurnos} turnos</p>
              </div>
            </div>
            <div className="flex gap-2 border-t border-border px-5 py-4">
              <button onClick={() => setShowEditModal(false)}
                className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={saveConfig} disabled={savingConfig}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-[#1e3a5f] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#2d5a8e] disabled:opacity-50">
                {savingConfig ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                {savingConfig ? 'Guardant...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

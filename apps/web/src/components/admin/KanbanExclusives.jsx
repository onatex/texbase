import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import {
  AlertTriangle, CheckCircle, Clock, ExternalLink, PackageCheck, Pause, Play, RefreshCcw,
  Search, Shield, Truck, UserRound, X, Zap,
} from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { formatSegons } from '@/lib/csv';
import { segonsProductiusRegistre, parseDataExclusiva } from '@/lib/operacionsUtils';

const POLL_MS = 5000;

// Estados protegidos que no deben aparecer en la cola activa del Kanban.
const ESTATS_PROTEGITS = new Set([
  'entregada', 'entregadas', 'entregado', 'entregados',
  'finalitzada', 'finalitzat', 'finalizada', 'finalizado',
  'lista_recollida', 'recogida', 'recogido',
  'desapareguda', 'desaparecida',
  'rechazado', 'rechazada',
  'parcialmente_conforme',
]);

// Estados que indican que la exclusiva está en la fase de Calidad
// (confección terminada, pendiente de control o en control).
const CALIDAD_ESTATS = new Set([
  'pendiente_calidad',
  'pendiente_revision',
  'en_retrabajo',
  'parcialmente_conforme',
]);

// Columnas del Kanban: una por fase activa + Calidad + pendientes sin fase.
const COLUMNS = [
  { id: 'fase_1', label: 'Fase 1', color: 'bg-primary/10 text-primary', badge: 'bg-primary/15 text-primary' },
  { id: 'fase_2', label: 'Fase 2', color: 'bg-[hsl(var(--accent))]/15 text-[hsl(var(--accent))]', badge: 'bg-[hsl(var(--accent))]/20 text-[hsl(var(--accent))]' },
  { id: 'fase_3', label: 'Fase 3', color: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]', badge: 'bg-[hsl(var(--ok))]/20 text-[hsl(var(--ok))]' },
  { id: 'fase_4', label: 'Fase 4', color: 'bg-[hsl(var(--accent))]/10 text-[hsl(var(--accent))]', badge: 'bg-[hsl(var(--accent))]/15 text-[hsl(var(--accent))]' },
  { id: 'calidad', label: 'Calidad', color: 'bg-blue-100 text-blue-700', badge: 'bg-blue-200 text-blue-800' },
  { id: 'sense_fase', label: 'Sin fase / Pendientes', color: 'bg-secondary text-muted-foreground', badge: 'bg-secondary text-muted-foreground' },
];

const estatBadge = {
  pendent: 'bg-secondary text-secondary-foreground',
  en_curs: 'bg-[hsl(var(--warn))]/20 text-[hsl(var(--warn))]',
  bloquejada: 'bg-destructive/10 text-destructive',
  retrasada: 'bg-[hsl(var(--warn))]/20 text-[hsl(var(--warn))]',
  en_retrabajo: 'bg-destructive/10 text-destructive',
  pendiente_calidad: 'bg-[hsl(var(--accent))]/15 text-[hsl(var(--accent))]',
  recibida: 'bg-secondary text-secondary-foreground',
  finalitzat: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]',
  retreball: 'bg-destructive/10 text-destructive',
};

const Estat = ({ v }) => (
  <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${estatBadge[v] || 'bg-secondary text-muted-foreground'}`}>
    {v || '—'}
  </span>
);

/** Extrae el número de fase de un valor tipo "Fase 1", "FASE 2", "fase3"... */
function numFase(valor) {
  if (!valor) return null;
  const m = String(valor).match(/fase\s*([1-4])/i);
  return m ? Number(m[1]) : null;
}

function labelFase(valor) {
  const n = numFase(valor);
  return n ? `Fase ${n}` : null;
}

/**
 * Resuelve la fase de un registro activo:
 *  - operacio = "Fase X"
 *  - tipus='fase'
 *  - operación detallada con campo fase en operacions_def
 *  - mono.operacio_actual
 */
function resolveFaseRegistre(r, opsDef = [], mono = null) {
  const fromOperacio = labelFase(r?.operacio);
  if (fromOperacio) return fromOperacio;
  if (r?.tipus === 'fase') {
    const n = numFase(r.operacio);
    if (n) return `Fase ${n}`;
  }
  const op = (opsDef || []).find((o) => o.nom === r?.operacio || o.codi === r?.operacio);
  if (op?.fase) return labelFase(op.fase) || String(op.fase);
  const fromMono = labelFase(mono?.operacio_actual);
  if (fromMono) return fromMono;
  return '';
}

function priorityBorderClass(p) {
  if (p === 'express') return 'border-destructive/60';
  if (p === 'alta' || p === 'urgente') return 'border-[hsl(var(--warn))]/60';
  return 'border-border';
}

/** Tarjeta de un mono individual, colocada en la columna de su fase activa. */
function MonoCard({ card, onClick }) {
  const pausada = card.pausada;
  return (
    <button
      type="button"
      onClick={() => onClick(card)}
      className={`relative w-full text-left rounded-xl border-2 bg-card p-3 cursor-pointer hover:shadow-md transition-all active:scale-[0.98] ${priorityBorderClass(card.prioritat)} ${pausada ? 'ring-2 ring-[hsl(var(--warn))]/40' : ''}`}
    >
      {card.prioritat === 'express' && <div className="stripe-top absolute inset-x-0 top-0 h-1 rounded-t-xl" />}
      {pausada && (
        <div className="absolute inset-x-0 top-0 flex items-center justify-center gap-1.5 rounded-t-xl bg-[hsl(var(--warn))] py-1 text-white">
          <Pause className="h-3.5 w-3.5" />
          <span className="text-xs font-bold uppercase tracking-wide">Pausado</span>
        </div>
      )}

      {/* Exclusiva + mono */}
      <div className={`flex items-start justify-between gap-1 ${pausada ? 'mt-6' : 'mt-0.5'}`}>
        <div className="min-w-0">
          <p className="font-display text-base uppercase leading-none font-bold text-foreground truncate">{card.exclusiva}</p>
          <p className="font-mono text-xs text-muted-foreground mt-0.5 truncate">
            {card.codi}
            {card.talla && <span className="ml-1.5 rounded border border-primary/40 px-1 text-[10px] font-bold text-primary">T{card.talla}</span>}
            {card.numero != null && <span className="ml-1.5 text-muted-foreground">#{card.numero}</span>}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {card.prioritat === 'express' && <Zap size={13} className="text-destructive" />}
          {card.prioritat === 'alta' && <AlertTriangle size={13} className="text-[hsl(var(--warn))]" />}
        </div>
      </div>

      {card.article && <p className="text-xs text-muted-foreground mt-0.5 truncate">{card.article}</p>}

      {/* Fase + estado */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {card.faseLabel && (
          <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${card.faseNum ? COLUMNS[card.faseNum - 1].badge : 'bg-secondary text-muted-foreground'}`}>
            {card.faseLabel}
          </span>
        )}
        <Estat v={card.monoEstat} />
        {pausada ? (
          <span className="inline-flex items-center gap-1 rounded bg-[hsl(var(--warn))]/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-[hsl(var(--warn))]">
            <Pause className="h-3 w-3" /> Pausada
          </span>
        ) : card.teActiu ? (
          <span className="inline-flex items-center gap-1 rounded bg-[hsl(var(--ok))]/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-[hsl(var(--ok))]">
            <Play className="h-3 w-3" /> En curso
          </span>
        ) : null}
        {card.retrabajos > 0 && (
          <span className="inline-flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-destructive">
            <RefreshCcw className="h-3 w-3" /> Retrabajo{card.retrabajos > 1 ? ` ×${card.retrabajos}` : ''}
          </span>
        )}
      </div>

      {/* Operario activo */}
      {card.operariNom ? (
        <div className="mt-2 flex items-center gap-1.5 text-xs">
          <UserRound className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="font-semibold truncate">{card.operariNom}</span>
          {card.operariPausat && <Pause className="h-3 w-3 text-[hsl(var(--warn))]" />}
        </div>
      ) : (
        <p className="mt-2 text-xs italic text-muted-foreground">Sin operario activo</p>
      )}

      {/* Causa de pausa */}
      {pausada && card.causaPausa && (
        <div className="mt-2 flex items-start gap-1.5 rounded-md bg-[hsl(var(--warn))]/10 px-2 py-1.5 text-[11px] font-semibold text-[hsl(var(--warn))]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{card.causaPausa}</span>
        </div>
      )}

      {/* Tiempo productivo */}
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1 text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span className="font-semibold tabular-nums text-foreground">{formatSegons(card.tempsInvertit)}</span>
        </span>
        <span className="flex items-center gap-1 text-[11px] font-semibold text-primary">
          Detalle <ExternalLink className="h-3 w-3" />
        </span>
      </div>

      {/* Fecha de entrega */}
      {card.dataLabel && (
        <div className="mt-1.5 flex items-center justify-between">
          <span className={`text-[11px] tabular-nums ${card.overdue ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
            {card.overdue && <AlertTriangle className="inline h-3 w-3 mr-0.5" />}
            {card.dataLabel}
          </span>
        </div>
      )}
    </button>
  );
}

function ExclusivaCalidadCard({ card, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative w-full text-left rounded-xl border-2 bg-card p-3 cursor-pointer hover:shadow-md transition-all active:scale-[0.98] ${
        card.enRetrabajo ? 'border-destructive/60'
        : card.enControl ? 'border-blue-300'
        : card.preparada ? 'border-[hsl(var(--ok))]/50'
        : card.prioritat === 'express' ? 'border-destructive/60' : 'border-[hsl(var(--accent))]/50'
      }`}
    >
      {card.prioritat === 'express' && <div className="stripe-top absolute inset-x-0 top-0 h-1 rounded-t-xl" />}
      <div className="flex items-start justify-between gap-1 mt-0.5">
        <div className="min-w-0">
          <p className="font-display text-base uppercase leading-none font-bold text-foreground truncate">{card.exclusiva}</p>
          {card.article && <p className="text-xs text-muted-foreground mt-0.5 truncate">{card.article}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {card.prioritat === 'express' && <Zap size={13} className="text-destructive" />}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {card.enRetrabajo ? (
          <span className="inline-flex items-center gap-1 rounded bg-destructive/15 text-destructive px-1.5 py-0.5 text-[10px] font-bold uppercase">
            <RefreshCcw className="h-3 w-3" /> En retrabajo
          </span>
        ) : card.enControl ? (
          <span className="inline-flex items-center gap-1 rounded bg-blue-100 text-blue-700 px-1.5 py-0.5 text-[10px] font-bold uppercase">
            <Shield className="h-3 w-3" /> En control
          </span>
        ) : card.preparada ? (
          <span className="inline-flex items-center gap-1 rounded bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))] px-1.5 py-0.5 text-[10px] font-bold uppercase">
            <CheckCircle className="h-3 w-3" /> Preparada QC
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded bg-[hsl(var(--accent))]/15 text-[hsl(var(--accent))] px-1.5 py-0.5 text-[10px] font-bold uppercase">
            <Clock className="h-3 w-3" /> Pendiente QC
          </span>
        )}
        <Estat v={card.estat} />
        {card.retrabajosPendents > 0 && (
          <span className="inline-flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-destructive">
            <RefreshCcw className="h-3 w-3" /> Retrabajo{card.retrabajosPendents > 1 ? ` ×${card.retrabajosPendents}` : ''}
          </span>
        )}
      </div>
      {/* Operario de Calidad activo realizando el control */}
      {card.enControl && card.operariNom ? (
        <div className="mt-2 flex items-center gap-1.5 text-xs">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600" />
          </span>
          <Shield className="h-3.5 w-3.5 shrink-0 text-blue-600" />
          <span className="font-semibold truncate">{card.operariNom}</span>
          {card.monoCodi && <span className="text-muted-foreground font-mono">· {card.monoCodi}</span>}
        </div>
      ) : card.enRetrabajo && card.operariNom ? (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
          <Shield className="h-3.5 w-3.5 shrink-0" />
          <span className="font-semibold truncate">{card.operariNom}</span>
          {card.monoCodi && <span className="text-muted-foreground font-mono">· {card.monoCodi}</span>}
        </div>
      ) : null}
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>Monos: <span className="font-semibold text-foreground tabular-nums">{card.fets}/{card.totalMonos}</span></span>
        <span className="flex items-center gap-1 text-[11px] font-semibold text-primary">Detalle <ExternalLink className="h-3 w-3" /></span>
      </div>
      {card.dataLabel && (
        <div className="mt-1.5">
          <span className={`text-[11px] tabular-nums ${card.overdue ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
            {card.overdue && <AlertTriangle className="inline h-3 w-3 mr-0.5" />}
            {card.dataLabel}
          </span>
        </div>
      )}
    </button>
  );
}

function KanbanColumn({ col, cards }) {
  const isCalidad = col.id === 'calidad';
  const pausades = cards.filter((c) => c.pausada).length;
  return (
    <div className="min-w-[260px] flex-1 rounded-xl border border-border bg-secondary/30 flex flex-col">
      <div className={`rounded-t-xl px-3 py-2.5 ${col.color}`}>
        <div className="flex items-center justify-between">
          <p className="font-display text-lg uppercase tracking-wide font-bold">{col.label}</p>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${col.badge}`}>{cards.length}</span>
        </div>
        {pausades > 0 && (
          <p className="text-[11px] opacity-70 mt-0.5 flex items-center gap-1">
            <Pause className="h-3 w-3" /> {pausades} pausada{pausades === 1 ? '' : 's'}
          </p>
        )}
      </div>
      <div className="p-2 space-y-2 overflow-y-auto flex-1" style={{ minHeight: 120, maxHeight: 'calc(100dvh - 280px)' }}>
        {cards.length === 0 ? (
          <div className="flex h-20 items-center justify-center text-xs italic text-muted-foreground">{isCalidad ? 'Sin exclusivas' : 'Sin monos'}</div>
        ) : cards.map((card) => (
          card.kind === 'calidad'
            ? <ExclusivaCalidadCard key={card.id} card={card} onClick={card.onOpen} />
            : <MonoCard key={card.id} card={card} onClick={card.onOpen} />
        ))}
      </div>
    </div>
  );
}

export default function KanbanExclusives() {
  const navigate = useNavigate();
  const [exclusives, setExclusives] = useState([]);
  const [monos, setMonos] = useState([]);
  const [registres, setRegistres] = useState([]);
  const [opsDef, setOpsDef] = useState([]);
  const [retrabajos, setRetrabajos] = useState([]);
  const [controles, setControles] = useState([]);
  const [actividadCalidad, setActividadCalidad] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  const [search, setSearch] = useState('');
  const [filterOperari, setFilterOperari] = useState('');
  const [filterPausades, setFilterPausades] = useState(false);
  const [filterArticle, setFilterArticle] = useState('');

  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      const [exs, mns, regs, ops, retr, qc, actCal] = await Promise.all([
        pb.collection('exclusives').getFullList({
          sort: '-created',
          requestKey: 'kbk-ex',
        }),
        pb.collection('monos').getFullList({
          fields: 'id,exclusiva,estat,operari_assignat,operacio_actual,codi,talla,numero',
          requestKey: 'kbk-monos',
        }),
        pb.collection('registres').getFullList({
          filter: 'estat = "en_curs" || estat = "pausat"',
          expand: 'operari,mono,exclusiva',
          sort: '-inici',
          requestKey: 'kbk-regs',
        }),
        pb.collection('operacions_def').getFullList({
          fields: 'id,nom,codi,fase,ruta,ordre',
          requestKey: 'kbk-ops',
        }).catch(() => []),
        pb.collection('retrabajos').getFullList({
          filter: 'estado = "pendiente" || estado = "en_proceso" || estado = "completado"',
          fields: 'id,exclusiva,estado',
          requestKey: 'kbk-retr',
        }).catch(() => []),
        pb.collection('controles_qualitat').getFullList({
          filter: 'estado_qc = "en_proceso" || estado_qc = "en_retrabajo"',
          fields: 'id,exclusiva,mono,operari,estado_qc,operacio,resultat,tiempo_qc_inicial_seg,tiempo_qc_adicional_seg,updated,created',
          expand: 'operari,mono',
          requestKey: 'kbk-qc',
        }).catch(() => []),
        pb.collection('actividad_calidad').getFullList({
          expand: 'operari,exclusiva,mono',
          requestKey: 'kbk-actcal',
        }).catch(() => []),
      ]);
      setExclusives(exs);
      setMonos(mns);
      setRegistres(regs);
      setOpsDef(ops);
      setRetrabajos(retr);
      setControles(qc);
      setActividadCalidad(actCal || []);
      setLastUpdate(new Date());
    } catch (e) {
      // mantener datos en frío
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  // Realtime: refresca al detectar cambios en registros, monos o exclusivas.
  useEffect(() => {
    const refresca = () => load();
    void pb.collection('registres').subscribe('*', refresca).catch(() => {});
    void pb.collection('monos').subscribe('*', refresca).catch(() => {});
    void pb.collection('exclusives').subscribe('*', refresca).catch(() => {});
    void pb.collection('retrabajos').subscribe('*', refresca).catch(() => {});
    void pb.collection('operacions_def').subscribe('*', refresca).catch(() => {});
    void pb.collection('controles_qualitat').subscribe('*', refresca).catch(() => {});
    void pb.collection('actividad_calidad').subscribe('*', refresca).catch(() => {});
    return () => {
      void pb.collection('registres').unsubscribe('*').catch(() => {});
      void pb.collection('monos').unsubscribe('*').catch(() => {});
      void pb.collection('exclusives').unsubscribe('*').catch(() => {});
      void pb.collection('retrabajos').unsubscribe('*').catch(() => {});
      void pb.collection('operacions_def').unsubscribe('*').catch(() => {});
      void pb.collection('controles_qualitat').unsubscribe('*').catch(() => {});
      void pb.collection('actividad_calidad').unsubscribe('*').catch(() => {});
    };
  }, [load]);

  // Tick cada segundo para refrescar tiempos en vivo de registros en_curs.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Mapa de exclusivas válidas (no protegidas) para filtrar monos.
  const exclusivesMap = useMemo(() => {
    const m = new Map();
    for (const ex of exclusives) m.set(ex.id, ex);
    return m;
  }, [exclusives]);

  // Registros activos indexados por mono.id (un mono puede tener varios; nos
  // quedamos con el más reciente por inici). Sin duplicados.
  const registresByMono = useMemo(() => {
    const m = new Map();
    for (const r of registres) {
      const monoId = r.mono || r.expand?.mono?.id;
      if (!monoId) continue;
      const prev = m.get(monoId);
      if (!prev || (r.inici || '') > (prev.inici || '')) m.set(monoId, r);
    }
    return m;
  }, [registres]);

  // Todos los registros activos de un mono (para tiempo productivo total).
  const allRegsByMono = useMemo(() => {
    const m = new Map();
    for (const r of registres) {
      const monoId = r.mono || r.expand?.mono?.id;
      if (!monoId) continue;
      const list = m.get(monoId) || [];
      list.push(r);
      m.set(monoId, list);
    }
    return m;
  }, [registres]);

  const retrByExclusiva = useMemo(() => {
    const m = new Map();
    for (const r of retrabajos) {
      if (r.exclusiva) m.set(r.exclusiva, (m.get(r.exclusiva) || 0) + 1);
    }
    return m;
  }, [retrabajos]);

  const operarisUnics = useMemo(() => {
    const set = new Set();
    for (const r of registres) {
      const id = r.expand?.operari?.id || r.operari;
      if (id) set.add(id);
    }
    return [...set];
  }, [registres]);

  const articlesUnics = useMemo(() => {
    const set = new Set();
    for (const ex of exclusives) if (ex.article) set.add(ex.article);
    return [...set].sort();
  }, [exclusives]);

  // Exclusivas en fase de Calidad (pendientes de control o en control) +
  // métrica de listas para recoger. Se calcula antes que las tarjetas de
  // mono para poder excluir esas exclusivas de las columnas de fase.
  const calidadInfo = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Mapa de control activo por exclusiva (el más reciente) con operario y
    // estado de control (en_proceso / en_retrabajo) para mostrar quién está
    // realizando el control de calidad en el Kanban. Combina:
    //  - `actividad_calidad`: sesiones activas del Control de calidad
    //    simplificado (inspectores revisando unidades ahora).
    //  - `controles_qualitat`: sesiones de retrabajo del checklist QC detallado.
    const activeQCByEx = new Map();
    const activeQC = new Set();
    const consider = (rec) => {
      if (!rec.exclusiva) return;
      activeQC.add(rec.exclusiva);
      const prev = activeQCByEx.get(rec.exclusiva);
      if (!prev || new Date(rec.updated || rec.created || 0).getTime() > new Date(prev.updated || prev.created || 0).getTime()) {
        activeQCByEx.set(rec.exclusiva, rec);
      }
    };
    for (const c of controles) consider(c);
    for (const a of actividadCalidad) {
      consider({
        exclusiva: a.exclusiva,
        mono: a.mono,
        operari: a.operari,
        estado_qc: a.estado || 'en_proceso',
        updated: a.updated,
        created: a.created,
        expand: a.expand || {},
      });
    }
    const retrByEx = new Map();
    for (const r of retrabajos) {
      if (!r.exclusiva) continue;
      if (r.estado === 'pendiente' || r.estado === 'en_proceso') {
        retrByEx.set(r.exclusiva, (retrByEx.get(r.exclusiva) || 0) + 1);
      }
    }
    const calidadExclusivaIds = new Set();
    const calidadCards = [];
    for (const ex of exclusives) {
      const estat = String(ex.estat || '').toLowerCase().trim();
      if (ESTATS_PROTEGITS.has(estat)) continue;
      const hasActiveQC = activeQC.has(ex.id);
      const isCalidadEstat = CALIDAD_ESTATS.has(estat);
      // Incluir también exclusivas en confección con todos los monos
      // finalitzats (preparadas para Calidad) aunque el hook aún no haya
      // movido el estat a pendiente_calidad.
      const exMonos = monos.filter((m) => m.exclusiva === ex.id);
      const allDone = exMonos.length > 0 && exMonos.every((m) => String(m.estat || '') === 'finalitzat');
      const confectionEstat = ['recibida', 'pendent', 'en_curs', 'retrasada'].includes(estat);
      const preparada = !hasActiveQC && !isCalidadEstat && confectionEstat && allDone;
      if (!isCalidadEstat && !hasActiveQC && !preparada) continue;
      calidadExclusivaIds.add(ex.id);
      const ctrl = activeQCByEx.get(ex.id);
      const enRetrabajoQC = String(ctrl?.estado_qc || '') === 'en_retrabajo' || estat === 'en_retrabajo';
      const enControl = !!ctrl && !enRetrabajoQC;
      const pendiente = !enControl && !enRetrabajoQC && (estat === 'pendiente_calidad' || preparada);
      const parsed = parseDataExclusiva(ex.data_entrega || ex.data_estimada);
      const overdue = parsed.date && parsed.date < today && estat !== 'finalitzada';
      const fets = exMonos.filter((m) => m.estat === 'finalitzat').length;
      calidadCards.push({
        id: ex.id,
        kind: 'calidad',
        exclusiva: ex.exclusiva,
        article: ex.article || '',
        referencia: ex.referencia || '',
        prioritat: ex.prioritat || '',
        estat,
        enControl,
        enRetrabajo: enRetrabajoQC,
        pendiente,
        preparada,
        totalMonos: exMonos.length,
        fets,
        retrabajosPendents: retrByEx.get(ex.id) || 0,
        operariNom: ctrl?.expand?.operari?.name || ctrl?.expand?.operari?.codi || '',
        operariId: ctrl?.expand?.operari?.id || ctrl?.operari || '',
        monoCodi: ctrl?.expand?.mono?.codi || '',
        dataLabel: parsed.label === 'Sin fecha de entrega' ? (ex.data_entrega || '') : parsed.label,
        overdue,
        onOpen: () => navigate(`/exclusiva/${ex.id}`),
      });
    }
    const listasRecoger = exclusives.filter(
      (ex) => String(ex.estat || '').toLowerCase().trim() === 'lista_recollida',
    ).length;
    const entregades = exclusives.filter(
      (ex) => String(ex.estat || '').toLowerCase().trim() === 'entregada',
    ).length;
    return { calidadCards, calidadExclusivaIds, listasRecoger, entregades };
  }, [exclusives, controles, actividadCalidad, monos, retrabajos, navigate]);

  // Construcción de tarjetas: una por mono.
  const cards = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nowMs = Date.now();

    const out = [];
    for (const mono of monos) {
      const ex = exclusivesMap.get(mono.exclusiva);
      if (!ex) continue;
      // Excluir exclusivas en estados protegidos.
      if (ESTATS_PROTEGITS.has(String(ex.estat || '').toLowerCase().trim())) continue;
      // Excluir exclusivas que ya están en la fase de Calidad.
      if (calidadInfo.calidadExclusivaIds.has(ex.id)) continue;
      // Excluir monos finalitzados (ya terminados).
      if (mono.estat === 'finalitzat') continue;

      const regs = allRegsByMono.get(mono.id) || [];
      const activeReg = registresByMono.get(mono.id) || null;

      // Resolver fase activa real del mono.
      let faseLabel = '';
      let faseNum = null;
      if (activeReg) {
        faseLabel = resolveFaseRegistre(activeReg, opsDef, mono);
        faseNum = numFase(faseLabel);
      }
      if (!faseLabel) {
        // Fallback: operacio_actual del mono.
        faseLabel = labelFase(mono.operacio_actual) || '';
        faseNum = numFase(faseLabel);
      }

      // Operario activo y estado de pausa.
      let operariNom = '';
      let operariPausat = false;
      let pausada = false;
      let causaPausa = '';
      let teActiu = false;
      if (activeReg) {
        operariNom = activeReg.expand?.operari?.name || activeReg.expand?.operari?.codi || '';
        operariPausat = activeReg.estat === 'pausat';
        teActiu = activeReg.estat === 'en_curs';
        if (activeReg.estat === 'pausat') {
          pausada = true;
          causaPausa = activeReg.motiu_pausa_inactivitat || activeReg.motiu_pausa || '';
        }
      }

      // Tiempo productivo del mono (solo registros activos en_curs/pausat).
      const tempsInvertit = regs.reduce((acc, r) => acc + segonsProductiusRegistre(r, nowMs), 0);

      const retrabajosCount = retrByExclusiva.get(ex.id) || 0;

      const parsed = parseDataExclusiva(ex.data_entrega || ex.data_estimada);
      const overdue = parsed.date && parsed.date < today && ex.estat !== 'finalitzada';

      out.push({
        id: mono.id,
        exclusiva: ex.exclusiva,
        article: ex.article || '',
        referencia: ex.referencia || '',
        prioritat: ex.prioritat || '',
        codi: mono.codi || '—',
        talla: mono.talla || '',
        numero: mono.numero,
        monoEstat: mono.estat,
        faseLabel,
        faseNum,
        operariNom,
        operariPausat,
        teActiu,
        pausada,
        causaPausa,
        tempsInvertit,
        retrabajos: retrabajosCount,
        dataLabel: parsed.label === 'Sin fecha de entrega' ? (ex.data_entrega || '') : parsed.label,
        overdue,
        onOpen: () => navigate(`/exclusiva/${ex.id}`),
      });
    }
    return out;
  }, [monos, exclusivesMap, registresByMono, allRegsByMono, opsDef, retrByExclusiva, navigate, calidadInfo]);

  // Filtros.
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return cards.filter((c) => {
      if (s) {
        const hay = `${c.exclusiva} ${c.article || ''} ${c.referencia || ''} ${c.codi || ''}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (filterOperari && c.operariNom === '') return false;
      if (filterArticle && c.article !== filterArticle) return false;
      if (filterPausades && !c.pausada) return false;
      return true;
    });
  }, [cards, search, filterOperari, filterArticle, filterPausades]);

  // Aplicar los mismos filtros de búsqueda y artículo a las tarjetas de Calidad.
  const filteredCalidad = useMemo(() => {
    const s = search.trim().toLowerCase();
    return calidadInfo.calidadCards.filter((c) => {
      if (s) {
        const hay = `${c.exclusiva} ${c.article || ''} ${c.referencia || ''}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (filterArticle && c.article !== filterArticle) return false;
      return true;
    });
  }, [calidadInfo.calidadCards, search, filterArticle]);

  // Clasificación por columna según fase activa real del mono.
  const byColumn = useMemo(() => {
    const m = new Map();
    for (const col of COLUMNS) m.set(col.id, []);
    for (const card of filtered) {
      let colId = 'sense_fase';
      if (card.faseNum === 1) colId = 'fase_1';
      else if (card.faseNum === 2) colId = 'fase_2';
      else if (card.faseNum === 3) colId = 'fase_3';
      else if (card.faseNum === 4) colId = 'fase_4';
      m.get(colId)?.push(card);
    }
    // Tarjetas de Calidad (exclusivas pendientes de control o en control).
    for (const card of filteredCalidad) {
      m.get('calidad')?.push(card);
    }
    // Ordenar dentro de cada columna: pausadas primero, luego por fecha.
    for (const col of COLUMNS) {
      m.get(col.id).sort((a, b) => {
        if (a.pausada !== b.pausada) return a.pausada ? -1 : 1;
        const da = a.dataLabel || '';
        const db = b.dataLabel || '';
        if (da && db) return da.localeCompare(db);
        if (da) return -1;
        if (db) return 1;
        return 0;
      });
    }
    // En Calidad: pendientes de QC primero, luego en control, luego por fecha.
    m.get('calidad').sort((a, b) => {
      if (a.pendiente !== b.pendiente) return a.pendiente ? -1 : 1;
      const da = a.dataLabel || '';
      const db = b.dataLabel || '';
      if (da && db) return da.localeCompare(db);
      if (da) return -1;
      if (db) return 1;
      return 0;
    });
    return m;
  }, [filtered, filteredCalidad]);

  const totalActives = filtered.length;
  const totalPausades = filtered.filter((c) => c.pausada).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground gap-2">
        <RefreshCcw size={18} className="animate-spin" /> Cargando Kanban...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Helmet>
        <title>Kanban por fases | Control de producción</title>
        <meta name="description" content="Tablero Kanban en directo con los monos en cada fase de producción." />
      </Helmet>

      {/* Cabecera + KPIs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-3 w-3 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[hsl(var(--ok))] opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-[hsl(var(--ok))]" />
          </span>
          <h2 className="font-display text-2xl uppercase">Kanban por fases</h2>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5 text-[hsl(var(--ok))]" /> {totalActives} monos</span>
          <span className="flex items-center gap-1"><Shield className="h-3.5 w-3.5 text-blue-600" /> {filteredCalidad.length} en calidad</span>
          <span className="flex items-center gap-1"><PackageCheck className="h-3.5 w-3.5 text-[hsl(var(--ok))]" /> {calidadInfo.listasRecoger} listas para recoger</span>
          <span className="flex items-center gap-1"><Truck className="h-3.5 w-3.5 text-primary" /> {calidadInfo.entregades || 0} entregadas</span>
          <span className="flex items-center gap-1"><Pause className="h-3.5 w-3.5 text-[hsl(var(--warn))]" /> {totalPausades} pausados</span>
          <span>Actualizado: {lastUpdate.toLocaleTimeString('es-ES')}</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar exclusiva, artículo, referencia, mono..."
            className="pl-8 pr-3 h-9 text-sm border border-input bg-background rounded-md w-full focus:outline-none focus:ring-2 focus:ring-primary/30"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="h-9 text-sm border border-input bg-background rounded-md px-2"
          value={filterOperari}
          onChange={(e) => setFilterOperari(e.target.value)}
        >
          <option value="">Todos los operarios</option>
          {operarisUnics.map((id) => {
            const r = registres.find((x) => (x.expand?.operari?.id || x.operari) === id);
            const nom = r?.expand?.operari?.name || r?.expand?.operari?.codi || id;
            return <option key={id} value={id}>{nom}</option>;
          })}
        </select>
        <select
          className="h-9 text-sm border border-input bg-background rounded-md px-2"
          value={filterArticle}
          onChange={(e) => setFilterArticle(e.target.value)}
        >
          <option value="">Todos los artículos</option>
          {articlesUnics.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <button
          onClick={() => setFilterPausades((v) => !v)}
          className={`flex items-center gap-1.5 h-9 text-sm rounded-md px-3 font-semibold border transition ${filterPausades ? 'bg-[hsl(var(--warn))] text-white border-[hsl(var(--warn))]' : 'border-border bg-background text-muted-foreground hover:bg-secondary'}`}
        >
          <Pause className="h-3.5 w-3.5" /> Solo pausados
        </button>
        {(search || filterOperari || filterArticle || filterPausades) && (
          <button
            onClick={() => { setSearch(''); setFilterOperari(''); setFilterArticle(''); setFilterPausades(false); }}
            className="h-9 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 border border-border bg-background rounded-md px-3"
          >
            <X className="h-3.5 w-3.5" /> Limpiar
          </button>
        )}
        <button onClick={load} className="h-9 w-9 text-muted-foreground hover:text-foreground border border-border bg-background rounded-md flex items-center justify-center" aria-label="Actualizar">
          <RefreshCcw size={14} />
        </button>
      </div>

      {/* Tablero Kanban */}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {COLUMNS.map((col) => (
          <KanbanColumn key={col.id} col={col} cards={byColumn.get(col.id) || []} />
        ))}
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Zap size={12} className="text-destructive" /> Express</span>
        <span className="flex items-center gap-1"><AlertTriangle size={12} className="text-[hsl(var(--warn))]" /> Prioridad alta</span>
        <span className="flex items-center gap-1"><Pause size={12} className="text-[hsl(var(--warn))]" /> Pausado</span>
        <span className="flex items-center gap-1"><Play size={12} className="text-[hsl(var(--ok))]" /> En curso</span>
        <span className="flex items-center gap-1"><Shield size={12} className="text-blue-600" /> Calidad: preparada, pendiente QC, en control o en retrabajo</span>
        <span className="flex items-center gap-1"><RefreshCcw size={12} className="text-destructive" /> Retrabajo pendiente</span>
        <span>Cada tarjeta de fase es un mono; las de Calidad son exclusivas con el operario de Calidad activo. Haz clic para abrir el detalle.</span>
      </div>
    </div>
  );
}

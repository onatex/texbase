import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Award, BarChart2, Calendar, CheckCircle2,
  ChevronDown, ChevronUp, Clock, Download, RefreshCcw,
  Search, TrendingDown, TrendingUp, User, X,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import pb from '@/lib/pocketbaseClient';

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function minToHM(min) {
  if (!min && min !== 0) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}
function pct(a, b) {
  if (!b) return 0;
  return Math.round((a / b) * 100);
}
function fmtHora(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}
function incLabel(key) {
  const map = {
    entrada_tarde: 'Entrada tarde',
    salida_antes: 'Salida antes',
    jornada_incompleta: 'Jornada incompleta',
    tiempo_improductivo_alto: 'Baja productividad',
  };
  return map[key] || key;
}
function currentMonthRange() {
  const now = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const to = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
  return { from, to };
}

/* ─── Status badge ───────────────────────────────────────────────────────── */
function EstadoBadge({ estado, incidencias }) {
  const incs = incidencias || [];
  if (estado === 'completo' && !incs.length) {
    return (
      <span className="flex items-center gap-1 rounded-md bg-green-100 text-green-700 px-2 py-0.5 text-xs font-semibold">
        <CheckCircle2 className="h-3 w-3" /> OK
      </span>
    );
  }
  if (estado === 'incompleto') {
    return (
      <span className="flex items-center gap-1 rounded-md bg-gray-100 text-gray-600 px-2 py-0.5 text-xs font-semibold">
        <Clock className="h-3 w-3" /> En curso
      </span>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {incs.map((inc) => (
        <span key={inc} className="flex items-center gap-0.5 rounded-md bg-orange-100 text-orange-700 px-2 py-0.5 text-xs font-semibold">
          <AlertTriangle className="h-3 w-3" /> {incLabel(inc)}
        </span>
      ))}
      {!incs.length && (
        <span className="rounded-md bg-orange-100 text-orange-700 px-2 py-0.5 text-xs font-semibold">Con problemas</span>
      )}
    </div>
  );
}

/* ─── Operario detail modal ──────────────────────────────────────────────── */
function OperarioDetailModal({ operario, registros, onClose, onSaveNote }) {
  const [nota, setNota] = useState('');
  const [savingNota, setSavingNota] = useState(false);

  const history = registros
    .filter((r) => r.operari === operario.id)
    .sort((a, b) => (a.fecha > b.fecha ? -1 : 1))
    .slice(0, 30);

  const avgProd = useMemo(() => {
    const done = history.filter((r) => r.duracion_jornada_min > 0);
    if (!done.length) return 0;
    return Math.round(done.reduce((s, r) => s + pct(r.tiempo_productivo_min, r.duracion_jornada_min), 0) / done.length);
  }, [history]);

  const chartData = history.slice(0, 14).reverse().map((r) => ({
    fecha: r.fecha?.slice(5),
    productivo: r.tiempo_productivo_min || 0,
    jornada: r.duracion_jornada_min || 0,
    pct: pct(r.tiempo_productivo_min, r.duracion_jornada_min),
  }));

  const incCount = {};
  history.forEach((r) => {
    (r.incidencias_horario || []).forEach((inc) => {
      incCount[inc] = (incCount[inc] || 0) + 1;
    });
  });

  const saveNota = async (registroId) => {
    if (!nota.trim()) return;
    setSavingNota(true);
    try {
      await pb.collection('registro_horario').update(registroId, { notas_admin: nota });
      onSaveNote?.();
      setNota('');
    } catch { /* silent */ } finally {
      setSavingNota(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-2xl bg-card overflow-y-auto max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 bg-primary text-primary-foreground px-5 py-4">
          <div>
            <p className="font-display text-2xl uppercase">{operario.name || operario.codi}</p>
            <p className="text-xs text-white/70">Últimos 30 días · {history.length} registros</p>
          </div>
          <button onClick={onClose} className="rounded-lg bg-white/15 p-2 hover:bg-white/25"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-5 grid gap-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Días trabajados', value: history.length },
              { label: 'Productividad media', value: `${avgProd}%` },
              { label: 'Operaciones', value: history.reduce((s, r) => s + (r.numero_operaciones_completadas || 0), 0) },
              { label: 'Incidencias', value: Object.values(incCount).reduce((a, b) => a + b, 0) },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-border bg-secondary/40 p-3 text-center">
                <p className="text-2xl font-bold text-primary">{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Chart */}
          {chartData.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-semibold mb-3">Productividad (últimas 2 semanas)</p>
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 84%)" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Area type="monotone" dataKey="pct" stroke="hsl(220 60% 20%)" fill="hsl(220 60% 20% / 0.15)" name="% Productividad" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Incidencias por tipo */}
          {Object.keys(incCount).length > 0 && (
            <div className="rounded-xl border border-border p-4">
              <p className="text-sm font-semibold mb-2">Incidencias por tipo</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(incCount).map(([k, v]) => (
                  <span key={k} className="rounded-lg bg-orange-100 text-orange-700 px-3 py-1 text-sm font-semibold">
                    {incLabel(k)}: {v}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* History table */}
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-2 text-left">Fecha</th>
                  <th className="px-3 py-2 text-left">Entrada</th>
                  <th className="px-3 py-2 text-left">Salida</th>
                  <th className="px-3 py-2 text-left">Jornada</th>
                  <th className="px-3 py-2 text-left">Productivo</th>
                  <th className="px-3 py-2 text-left">%</th>
                  <th className="px-3 py-2 text-left">Estado</th>
                  <th className="px-3 py-2 text-left">Nota</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.map((r) => (
                  <tr key={r.id} className="hover:bg-secondary/30">
                    <td className="px-3 py-2 font-mono text-xs">{r.fecha}</td>
                    <td className="px-3 py-2">{fmtHora(r.hora_entrada)}</td>
                    <td className="px-3 py-2">{fmtHora(r.hora_salida)}</td>
                    <td className="px-3 py-2">{minToHM(r.duracion_jornada_min)}</td>
                    <td className="px-3 py-2">{minToHM(r.tiempo_productivo_min)}</td>
                    <td className={`px-3 py-2 font-bold ${pct(r.tiempo_productivo_min, r.duracion_jornada_min) >= 70 ? 'text-green-600' : 'text-orange-600'}`}>
                      {r.duracion_jornada_min ? `${pct(r.tiempo_productivo_min, r.duracion_jornada_min)}%` : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <EstadoBadge estado={r.estado} incidencias={r.incidencias_horario} />
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground max-w-[120px] truncate">{r.notas_admin || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add note to latest */}
          {history.length > 0 && (
            <div className="rounded-xl border border-border p-4">
              <p className="text-sm font-semibold mb-2">Añadir nota al registro más reciente</p>
              <div className="flex gap-2">
                <input
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  placeholder="Comentario del administrador..."
                  className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
                <button
                  onClick={() => saveNota(history[0].id)}
                  disabled={savingNota || !nota.trim()}
                  className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  Guardar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */
export default function RegistroHorario() {
  const { from: defaultFrom, to: defaultTo } = currentMonthRange();
  const [registros, setRegistros] = useState([]);
  const [operaris, setOperaris] = useState([]);
  const [carregant, setCarregant] = useState(true);
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(defaultTo);
  const [filtroOperari, setFiltroOperari] = useState('');
  const [filtroEstat, setFiltroEstat] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [sortCol, setSortCol] = useState('fecha');
  const [sortDesc, setSortDesc] = useState(true);
  const [detailOp, setDetailOp] = useState(null);

  const carrega = useCallback(async () => {
    setCarregant(true);
    try {
      const [recs, ops] = await Promise.all([
        pb.collection('registro_horario').getFullList({
          expand: 'operari',
          sort: '-fecha,-created',
          requestKey: 'rh-admin',
        }),
        pb.collection('users').getFullList({ sort: 'codi', requestKey: 'rh-users' }),
      ]);
      setRegistros(recs);
      setOperaris(ops.filter((u) => u.rol === 'operari' || u.rol === 'admin'));
    } catch { /* silent */ } finally {
      setCarregant(false);
    }
  }, []);

  useEffect(() => { carrega(); }, [carrega]);

  /* ─── Filtered rows ─────────────────────────────────────────────────────── */
  const rows = useMemo(() => {
    let list = registros;
    if (dateFrom) list = list.filter((r) => r.fecha >= dateFrom);
    if (dateTo) list = list.filter((r) => r.fecha <= dateTo);
    if (filtroOperari) list = list.filter((r) => r.operari === filtroOperari);
    if (filtroEstat === 'completo') list = list.filter((r) => r.estado === 'completo');
    if (filtroEstat === 'con_problemas') list = list.filter((r) => r.estado === 'con_problemas');
    if (filtroEstat === 'incompleto') list = list.filter((r) => r.estado === 'incompleto');
    if (searchQ.trim()) {
      const q = searchQ.trim().toLowerCase();
      list = list.filter((r) => {
        const op = r.expand?.operari;
        return `${op?.name || ''} ${op?.codi || ''}`.toLowerCase().includes(q);
      });
    }
    // Sort
    list = [...list].sort((a, b) => {
      let va = a[sortCol] ?? '';
      let vb = b[sortCol] ?? '';
      if (typeof va === 'number') return sortDesc ? vb - va : va - vb;
      return sortDesc ? String(vb).localeCompare(String(va)) : String(va).localeCompare(String(vb));
    });
    return list;
  }, [registros, dateFrom, dateTo, filtroOperari, filtroEstat, searchQ, sortCol, sortDesc]);

  const toggleSort = (col) => {
    if (sortCol === col) setSortDesc((d) => !d);
    else { setSortCol(col); setSortDesc(true); }
  };

  /* ─── Monthly summary per operari ────────────────────────────────────────── */
  const summary = useMemo(() => {
    const map = {};
    registros.forEach((r) => {
      if (r.fecha < dateFrom || r.fecha > dateTo) return;
      const id = r.operari;
      if (!map[id]) {
        map[id] = {
          id,
          op: r.expand?.operari,
          dias: 0,
          jornadaMin: 0,
          productivoMin: 0,
          operaciones: 0,
          exclusivas: 0,
          reoperaciones: 0,
          incTotal: 0,
          incDetalle: {},
        };
      }
      const s = map[id];
      s.dias++;
      s.jornadaMin += r.duracion_jornada_min || 0;
      s.productivoMin += r.tiempo_productivo_min || 0;
      s.operaciones += r.numero_operaciones_completadas || 0;
      s.exclusivas += r.numero_exclusivas_completadas || 0;
      s.reoperaciones += r.numero_reoperaciones || 0;
      (r.incidencias_horario || []).forEach((inc) => {
        s.incTotal++;
        s.incDetalle[inc] = (s.incDetalle[inc] || 0) + 1;
      });
    });
    return Object.values(map).map((s) => ({
      ...s,
      pctProd: pct(s.productivoMin, s.jornadaMin),
      score: Math.round(pct(s.productivoMin, s.jornadaMin) * 0.5 + (s.operaciones * 2) - (s.incTotal * 5)),
    })).sort((a, b) => b.score - a.score);
  }, [registros, dateFrom, dateTo]);

  const top5 = summary.slice(0, 5);
  const bottom5 = [...summary].sort((a, b) => a.score - b.score).slice(0, 5);

  /* ─── Chart data ─────────────────────────────────────────────────────────── */
  const chartData = useMemo(() => {
    const byDate = {};
    rows.forEach((r) => {
      if (!byDate[r.fecha]) byDate[r.fecha] = { fecha: r.fecha?.slice(5), totalProd: 0, totalJornada: 0, count: 0 };
      byDate[r.fecha].totalProd += r.tiempo_productivo_min || 0;
      byDate[r.fecha].totalJornada += r.duracion_jornada_min || 0;
      byDate[r.fecha].count++;
    });
    return Object.values(byDate)
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .map((d) => ({
        ...d,
        avgProd: d.count ? Math.round(pct(d.totalProd, d.totalJornada)) : 0,
      }));
  }, [rows]);

  /* ─── Export CSV ─────────────────────────────────────────────────────────── */
  const exportCSV = () => {
    const header = ['Operario', 'Código', 'Fecha', 'Entrada', 'Salida', 'Jornada (min)', 'Productivo (min)', 'Improductivo (min)', '% Productividad', 'Exclusivas', 'Operaciones', 'Reoperaciones', 'Estado', 'Incidencias'].join(',');
    const csvRows = rows.map((r) => {
      const op = r.expand?.operari;
      return [
        op?.name || '',
        op?.codi || '',
        r.fecha || '',
        fmtHora(r.hora_entrada),
        fmtHora(r.hora_salida),
        r.duracion_jornada_min || 0,
        r.tiempo_productivo_min || 0,
        r.tiempo_improductivo_min || 0,
        `${pct(r.tiempo_productivo_min, r.duracion_jornada_min)}%`,
        r.numero_exclusivas_completadas || 0,
        r.numero_operaciones_completadas || 0,
        r.numero_reoperaciones || 0,
        r.estado || '',
        (r.incidencias_horario || []).map(incLabel).join('; '),
      ].join(',');
    });
    const blob = new Blob([[header, ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `registro_horario_${dateFrom}_${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortIcon = ({ col }) => {
    if (sortCol !== col) return <ChevronDown className="h-3 w-3 opacity-30" />;
    return sortDesc ? <ChevronDown className="h-3 w-3 text-primary" /> : <ChevronUp className="h-3 w-3 text-primary" />;
  };

  const detailOperario = detailOp ? operaris.find((o) => o.id === detailOp) : null;

  /* ─── Render ─────────────────────────────────────────────────────────────── */
  return (
    <div className="grid gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl uppercase">Registro horario</h2>
          <p className="text-sm text-muted-foreground">{rows.length} registros encontrados</p>
        </div>
        <div className="flex gap-2">
          <button onClick={carrega} className="flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-sm font-semibold hover:bg-secondary/80">
            <RefreshCcw className="h-4 w-4" /> Actualizar
          </button>
          <button onClick={exportCSV} className="flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-semibold">
            <Download className="h-4 w-4" /> Exportar CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-border bg-card p-4 flex flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm" />
          <span className="text-muted-foreground text-sm">—</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm" />
        </div>
        <select value={filtroOperari} onChange={(e) => setFiltroOperari(e.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm">
          <option value="">Todos los operarios</option>
          {operaris.map((o) => (
            <option key={o.id} value={o.id}>{o.name || o.codi}</option>
          ))}
        </select>
        <select value={filtroEstat} onChange={(e) => setFiltroEstat(e.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-2 text-sm">
          <option value="">Todos los estados</option>
          <option value="completo">Completo</option>
          <option value="con_problemas">Con problemas</option>
          <option value="incompleto">Incompleto</option>
        </select>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Buscar operario..."
            className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-2 text-sm" />
        </div>
      </div>

      {/* Top 5 / Bottom 5 */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* TOP 5 */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Award className="h-5 w-5 text-yellow-500" />
            <h3 className="font-semibold">TOP 5 — Mejores del período</h3>
          </div>
          {top5.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin datos</p>
          ) : (
            <div className="space-y-2">
              {top5.map((s, i) => (
                <button key={s.id} onClick={() => setDetailOp(s.id)}
                  className="w-full flex items-center gap-3 rounded-lg bg-secondary/50 hover:bg-secondary px-3 py-2 text-left transition">
                  <span className={`font-display text-xl shrink-0 w-7 text-center ${i === 0 ? 'text-yellow-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{s.op?.name || s.op?.codi || '—'}</p>
                    <p className="text-xs text-muted-foreground">{s.dias} días · {s.operaciones} ops · {minToHM(s.jornadaMin)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-sm font-bold ${s.pctProd >= 70 ? 'text-green-600' : 'text-orange-500'}`}>{s.pctProd}%</p>
                    <p className="text-xs text-muted-foreground">productividad</p>
                  </div>
                  <TrendingUp className="h-4 w-4 text-green-500 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* BOTTOM 5 */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            <h3 className="font-semibold">Atención — Necesitan seguimiento</h3>
          </div>
          {bottom5.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin datos</p>
          ) : (
            <div className="space-y-2">
              {bottom5.map((s) => (
                <button key={s.id} onClick={() => setDetailOp(s.id)}
                  className="w-full flex items-center gap-3 rounded-lg bg-orange-50 hover:bg-orange-100 border border-orange-200 px-3 py-2 text-left transition">
                  <User className="h-5 w-5 text-orange-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{s.op?.name || s.op?.codi || '—'}</p>
                    <p className="text-xs text-muted-foreground">{s.incTotal} incidencias · {s.dias} días</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-orange-600">{s.pctProd}%</p>
                    <p className="text-xs text-muted-foreground">productividad</p>
                  </div>
                  <TrendingDown className="h-4 w-4 text-orange-500 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Charts */}
      {chartData.length > 1 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart2 className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">Productividad media del equipo</h3>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 84%)" />
              <XAxis dataKey="fecha" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
              <Tooltip formatter={(v) => `${v}%`} />
              <Area type="monotone" dataKey="avgProd" stroke="hsl(220 60% 20%)" fill="hsl(220 60% 20% / 0.1)" name="% Productividad" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Summary table by operario */}
      {summary.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="bg-secondary px-4 py-2.5 text-sm font-semibold">Resumen mensual por operario</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Operario</th>
                  <th className="px-3 py-2 text-center">Días</th>
                  <th className="px-3 py-2 text-center">Horas total</th>
                  <th className="px-3 py-2 text-center">Productividad</th>
                  <th className="px-3 py-2 text-center">Operaciones</th>
                  <th className="px-3 py-2 text-center">Exclusivas</th>
                  <th className="px-3 py-2 text-center">Reoperaciones</th>
                  <th className="px-3 py-2 text-center">Incidencias</th>
                  <th className="px-3 py-2 text-center">Ranking</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {summary.map((s, i) => (
                  <tr key={s.id} className="hover:bg-secondary/30 cursor-pointer" onClick={() => setDetailOp(s.id)}>
                    <td className="px-3 py-2 font-semibold">{s.op?.name || s.op?.codi || '—'}</td>
                    <td className="px-3 py-2 text-center">{s.dias}</td>
                    <td className="px-3 py-2 text-center">{minToHM(s.jornadaMin)}</td>
                    <td className={`px-3 py-2 text-center font-bold ${s.pctProd >= 70 ? 'text-green-600' : 'text-orange-500'}`}>{s.pctProd}%</td>
                    <td className="px-3 py-2 text-center">{s.operaciones}</td>
                    <td className="px-3 py-2 text-center">{s.exclusivas}</td>
                    <td className="px-3 py-2 text-center">{s.reoperaciones}</td>
                    <td className="px-3 py-2 text-center">
                      {s.incTotal > 0 ? (
                        <span className="rounded-md bg-orange-100 text-orange-700 px-2 py-0.5 text-xs font-semibold">{s.incTotal}</span>
                      ) : (
                        <span className="text-green-600">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`font-display text-lg ${i < 3 ? 'text-yellow-500' : ''}`}>#{i + 1}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Main table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="bg-secondary px-4 py-2.5 text-sm font-semibold">Registros detallados ({rows.length})</div>
        {carregant ? (
          <div className="p-6 text-center text-muted-foreground text-sm">Cargando...</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">No hay registros para el período seleccionado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  {[
                    { label: 'Operario', col: null },
                    { label: 'Fecha', col: 'fecha' },
                    { label: 'Entrada', col: 'hora_entrada' },
                    { label: 'Salida', col: 'hora_salida' },
                    { label: 'Jornada', col: 'duracion_jornada_min' },
                    { label: 'Productivo', col: 'tiempo_productivo_min' },
                    { label: 'Improductivo', col: 'tiempo_improductivo_min' },
                    { label: '% Prod.', col: null },
                    { label: 'Exclusivas', col: 'numero_exclusivas_completadas' },
                    { label: 'Ops', col: 'numero_operaciones_completadas' },
                    { label: 'Reops', col: 'numero_reoperaciones' },
                    { label: 'Estado', col: null },
                  ].map(({ label, col }) => (
                    <th key={label}
                      onClick={() => col && toggleSort(col)}
                      className={`px-3 py-2 text-left whitespace-nowrap ${col ? 'cursor-pointer select-none hover:text-foreground' : ''}`}>
                      <span className="flex items-center gap-1">
                        {label}
                        {col && <SortIcon col={col} />}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const op = r.expand?.operari;
                  const prodPct = pct(r.tiempo_productivo_min, r.duracion_jornada_min);
                  return (
                    <tr key={r.id} className="hover:bg-secondary/30">
                      <td className="px-3 py-2">
                        <button onClick={() => setDetailOp(r.operari)} className="font-semibold text-primary hover:underline text-left">
                          {op?.name || op?.codi || '—'}
                        </button>
                        {op?.codi && op?.name && <p className="text-xs text-muted-foreground font-mono">{op.codi}</p>}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{r.fecha}</td>
                      <td className="px-3 py-2">{fmtHora(r.hora_entrada)}</td>
                      <td className="px-3 py-2">{fmtHora(r.hora_salida)}</td>
                      <td className="px-3 py-2">{minToHM(r.duracion_jornada_min)}</td>
                      <td className="px-3 py-2 text-green-700">{minToHM(r.tiempo_productivo_min)}</td>
                      <td className="px-3 py-2 text-orange-600">{minToHM(r.tiempo_improductivo_min)}</td>
                      <td className={`px-3 py-2 font-bold ${prodPct >= 70 ? 'text-green-600' : 'text-orange-500'}`}>
                        {r.duracion_jornada_min ? `${prodPct}%` : '—'}
                      </td>
                      <td className="px-3 py-2 text-center">{r.numero_exclusivas_completadas || 0}</td>
                      <td className="px-3 py-2 text-center">{r.numero_operaciones_completadas || 0}</td>
                      <td className="px-3 py-2 text-center">{r.numero_reoperaciones || 0}</td>
                      <td className="px-3 py-2">
                        <EstadoBadge estado={r.estado} incidencias={r.incidencias_horario} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Operario detail modal */}
      {detailOp && detailOperario && (
        <OperarioDetailModal
          operario={detailOperario}
          registros={registros}
          onClose={() => setDetailOp(null)}
          onSaveNote={carrega}
        />
      )}
    </div>
  );
}

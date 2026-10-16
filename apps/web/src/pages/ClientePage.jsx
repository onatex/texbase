import React, { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import {
  AreaChart, Area, PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
  AlertCircle, CheckCircle2, Clock, Package,
  RefreshCw, Calendar, TrendingUp, AlertTriangle,
  CheckCheck, Layers, Activity,
} from 'lucide-react';
import Logo from '@/components/Logo';
import pb from '@/lib/pocketbaseClient';

const REFRESH_MS = 30_000;
const ARTICLE_COLORS = ['#1e3a5f', '#f97316', '#10b981', '#6366f1', '#f59e0b'];

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function dayLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ca-ES', { weekday: 'short', day: 'numeric' });
}

function fmtHoursRemaining(minutes) {
  if (!minutes || minutes <= 0) return '0 min';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// Delivery status config
const DELIVERY_STATUS = {
  ready:    { label: 'Llesta per entregar', color: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: CheckCheck },
  today:    { label: 'Entrega avui',         color: 'bg-emerald-400', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: CheckCircle2 },
  tomorrow: { label: 'Entrega demà',         color: 'bg-amber-400',   text: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200',   icon: Clock },
  days:     { label: 'En X dies',            color: 'bg-orange-400',  text: 'text-orange-700',  bg: 'bg-orange-50',  border: 'border-orange-200',  icon: Calendar },
  critical: { label: 'Crític - possible retard', color: 'bg-red-500', text: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200',     icon: AlertTriangle },
  on_time:  { label: 'En termini',           color: 'bg-blue-400',    text: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200',    icon: TrendingUp },
};

function DeliveryBadge({ status, deliveryDays }) {
  const cfg = DELIVERY_STATUS[status] || DELIVERY_STATUS.on_time;
  const Icon = cfg.icon;
  let label = cfg.label;
  if (status === 'days') label = `Entrega en ${deliveryDays} dies`;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <Icon size={12} />
      {label}
    </span>
  );
}

function PhaseBar({ completed, total, currentPhase, totalPhases, phaseNum }) {
  const pct = total > 0 ? Math.min(100, (completed / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1 min-w-[120px]">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-[#1e3a5f]">{currentPhase}</span>
        <span className="text-slate-400">{completed}/{total} op.</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-[#1e3a5f] transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-[10px] text-slate-400">{Math.round(pct)}% completat</div>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, tone = 'blue' }) {
  const tones = {
    blue: 'bg-[#1e3a5f] text-white',
    green: 'bg-emerald-600 text-white',
    amber: 'bg-amber-500 text-white',
    red: 'bg-red-500 text-white',
    slate: 'bg-slate-700 text-white',
  };
  return (
    <div className={`${tones[tone]} rounded-2xl p-5 flex flex-col gap-3 shadow-md`}>
      <div className="flex items-center justify-between">
        <span className="text-white/70 text-xs font-semibold uppercase tracking-wider">{label}</span>
        <div className="bg-white/15 rounded-xl p-2">
          <Icon size={18} />
        </div>
      </div>
      <p className="text-3xl font-bold leading-none">{value}</p>
      {sub && <p className="text-white/65 text-xs">{sub}</p>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ClientePage() {
  const [stats, setStats] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const res = await fetch(pb.buildURL('/api/cliente/stats'));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStats(data);
      setLastUpdate(new Date());
      setError('');
    } catch {
      setError('No s\'han pogut carregar les dades. Tornant a intentar...');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const id = setInterval(() => fetchStats(), REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchStats]);

  const qualityPct = stats
    ? (stats.ncOpen + stats.ncClosed > 0
      ? Math.round((stats.ncClosed / (stats.ncOpen + stats.ncClosed)) * 100)
      : 100)
    : 0;

  const articleData = stats
    ? Object.entries(stats.articlesInProduction || {}).map(([k, v]) => ({ name: k, value: v }))
    : [];

  const historyData = (stats?.history || []).map(h => ({
    ...h,
    label: dayLabel(h.date),
  }));

  // ── Today's situation ──────────────────────────────────────────────────
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayItems = (stats?.upcomingDeliveries || []).filter(
    (d) => d.data_entrega === todayStr,
  );
  const todayCritical = todayItems.filter((d) => d.deliveryStatus === 'critical').length;
  const todayHoursData = todayItems.map((d) => ({
    name: d.exclusiva,
    hores: Math.round(((d.pendingMinutes || 0) / 60) * 10) / 10,
  }));

  function estimatedTime(d) {
    if (d.completedOps >= d.totalOps && d.totalOps > 0) return 'Llesta';
    const mins = d.pendingMinutes || 0;
    if (mins <= 0) return '—';
    const t = new Date();
    t.setMinutes(t.getMinutes() + mins);
    const cutoff = new Date();
    cutoff.setHours(14, 45, 0, 0);
    if (t > cutoff) return 'Fora de termini';
    return t.toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <Helmet>
        <title>Estat de Producció | Onatex</title>
        <meta name="description" content="Dashboard en temps real de l'estat de producció d'Onatex." />
      </Helmet>

      {/* Header */}
      <header className="bg-[#1e3a5f] text-white shadow-lg">
        <div
          className="h-1.5"
          style={{ backgroundImage: 'repeating-linear-gradient(135deg,#f97316 0 14px,#1e3a5f 14px 28px)' }}
        />
        <div className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Logo size="sm" />
            <div>
              <p className="font-bold text-lg leading-none">Estat de producció en directe</p>
              <p className="text-white/60 text-xs mt-0.5">Actualització automàtica cada 30 s</p>
            </div>
          </div>
          <button
            onClick={() => fetchStats(true)}
            disabled={refreshing}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 rounded-xl px-3 py-2 text-sm transition"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Actualitzar</span>
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 flex flex-col gap-8">
        {loading && (
          <div className="flex items-center justify-center py-24 text-slate-400 gap-3">
            <Activity size={24} className="animate-pulse" />
            <span>Carregant dades...</span>
          </div>
        )}

        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 text-red-700">
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        {stats && !loading && (
          <>
            {/* ── Section 0: Situació de avui ───────────────────────────── */}
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
                <Clock size={14} /> Situació de avui
              </h2>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <StatCard icon={Calendar} label="A entregar avui" value={todayItems.length} tone="blue" />
                <StatCard icon={CheckCheck} label="Ja entregades avui" value={stats.completedToday} tone="green" />
                <StatCard
                  icon={AlertTriangle}
                  label="En risc / crítiques"
                  value={todayCritical}
                  tone={todayCritical > 0 ? 'red' : 'slate'}
                />
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                {todayItems.length > 0 ? (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100">
                            {['Exclusiva', 'Article', 'Fase actual', 'Hores restants', 'Hora estimada', 'Estat'].map((h) => (
                              <th key={h} className="text-left py-2.5 px-4 text-slate-500 font-medium text-xs uppercase tracking-wide">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {todayItems.map((d, i) => (
                            <tr key={i} className={`border-b border-slate-50 ${d.deliveryStatus === 'critical' ? 'bg-red-50/50' : ''}`}>
                              <td className="py-3 px-4 font-bold text-[#1e3a5f]">{d.exclusiva}</td>
                              <td className="py-3 px-4 text-slate-600">{d.article || '—'}</td>
                              <td className="py-3 px-4">
                                {d.totalOps > 0 ? (
                                  <PhaseBar completed={d.completedOps} total={d.totalOps} currentPhase={d.currentPhase} phaseNum={d.phaseNum} totalPhases={d.totalPhases} />
                                ) : <span className="text-slate-400 text-xs">{d.currentPhase || '—'}</span>}
                              </td>
                              <td className="py-3 px-4 font-semibold text-slate-800">{fmtHoursRemaining(d.pendingMinutes)}</td>
                              <td className="py-3 px-4 text-slate-700 font-medium">{estimatedTime(d)}</td>
                              <td className="py-3 px-4"><DeliveryBadge status={d.deliveryStatus} deliveryDays={d.deliveryDays} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {todayHoursData.length > 0 && (
                      <div className="border-t border-slate-100 p-5">
                        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">Hores restants per exclusiva</p>
                        <ResponsiveContainer width="100%" height={Math.max(120, todayHoursData.length * 34)}>
                          <BarChart data={todayHoursData} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                            <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                            <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                            <Tooltip formatter={(v) => [`${v} h`, 'Hores restants']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                            <Bar dataKey="hores" fill="#f97316" radius={[0, 4, 4, 0]} barSize={18} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-slate-400 text-sm text-center py-12">Cap exclusiva programada per entregar avui</p>
                )}
              </div>
            </section>

            {/* ── Section 1: KPI cards ──────────────────────────────────── */}
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">Resum de producció</h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  icon={CheckCircle2}
                  label="Completades avui"
                  value={stats.completedToday}
                  sub={`${stats.completedWeek} aquesta setmana`}
                  tone="green"
                />
                <StatCard
                  icon={Activity}
                  label="En producció"
                  value={stats.inProcess}
                  sub={`${stats.pending} pendents`}
                  tone="blue"
                />
                <StatCard
                  icon={Package}
                  label="Llestes per entregar"
                  value={stats.readyToDeliver}
                  sub="Control finalitzat"
                  tone="amber"
                />
                <StatCard
                  icon={TrendingUp}
                  label="Qualitat"
                  value={`${qualityPct}%`}
                  sub={stats.ncOpen > 0 ? `${stats.ncOpen} incidències obertes` : 'Sense incidències'}
                  tone={qualityPct >= 95 ? 'green' : qualityPct >= 80 ? 'amber' : 'red'}
                />
              </div>
            </section>

            {/* ── Section 2: Upcoming deliveries enhanced table ─────────── */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                <Calendar size={18} className="text-[#1e3a5f]" />
                <h2 className="font-semibold text-slate-800">Properes entregues (7 dies)</h2>
                {stats.upcomingDeliveries?.length > 0 && (
                  <span className="ml-auto bg-[#1e3a5f]/10 text-[#1e3a5f] text-xs font-semibold rounded-full px-2.5 py-0.5">
                    {stats.upcomingDeliveries.length}
                  </span>
                )}
              </div>

              {stats.upcomingDeliveries?.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="text-left py-2.5 px-4 text-slate-500 font-medium text-xs uppercase tracking-wide">Exclusiva</th>
                        <th className="text-left py-2.5 px-4 text-slate-500 font-medium text-xs uppercase tracking-wide hidden sm:table-cell">Article</th>
                        <th className="text-left py-2.5 px-4 text-slate-500 font-medium text-xs uppercase tracking-wide">Fase / Progrés</th>
                        <th className="text-left py-2.5 px-4 text-slate-500 font-medium text-xs uppercase tracking-wide">Hores rest.</th>
                        <th className="text-left py-2.5 px-4 text-slate-500 font-medium text-xs uppercase tracking-wide hidden md:table-cell">Entrega</th>
                        <th className="text-left py-2.5 px-4 text-slate-500 font-medium text-xs uppercase tracking-wide">Estat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.upcomingDeliveries.map((d, i) => {
                        const statusCfg = DELIVERY_STATUS[d.deliveryStatus] || DELIVERY_STATUS.on_time;
                        return (
                          <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/80 transition">
                            {/* Exclusiva */}
                            <td className="py-3 px-4">
                              <span className="font-bold text-[#1e3a5f]">{d.exclusiva}</span>
                              {d.ncCount > 0 && (
                                <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-semibold bg-red-100 text-red-600 rounded-full px-1.5 py-0.5">
                                  <AlertCircle size={10} /> {d.ncCount}
                                </span>
                              )}
                            </td>
                            {/* Article */}
                            <td className="py-3 px-4 text-slate-600 hidden sm:table-cell">{d.article || '—'}</td>
                            {/* Phase + progress */}
                            <td className="py-3 px-4">
                              {d.totalOps > 0 ? (
                                <PhaseBar
                                  completed={d.completedOps}
                                  total={d.totalOps}
                                  currentPhase={d.currentPhase}
                                  phaseNum={d.phaseNum}
                                  totalPhases={d.totalPhases}
                                />
                              ) : (
                                <span className="text-slate-400 text-xs">{d.currentPhase || '—'}</span>
                              )}
                            </td>
                            {/* Hours remaining */}
                            <td className="py-3 px-4">
                              {d.pendingMinutes > 0 ? (
                                <div className="flex flex-col">
                                  <span className="font-semibold text-slate-800 text-sm">
                                    {fmtHoursRemaining(d.pendingMinutes)}
                                  </span>
                                  <span className="text-[10px] text-slate-400">incl. 20% buffer</span>
                                </div>
                              ) : d.completedOps >= d.totalOps && d.totalOps > 0 ? (
                                <span className="text-emerald-600 font-semibold text-sm">Completada</span>
                              ) : (
                                <span className="text-slate-400 text-xs">—</span>
                              )}
                            </td>
                            {/* Delivery date */}
                            <td className="py-3 px-4 hidden md:table-cell">
                              <span className={`font-medium ${d.deliveryStatus === 'critical' ? 'text-red-600' : 'text-slate-700'}`}>
                                {fmtDate(d.data_entrega)}
                              </span>
                            </td>
                            {/* Status badge */}
                            <td className="py-3 px-4">
                              <DeliveryBadge status={d.deliveryStatus} deliveryDays={d.deliveryDays} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-slate-400 text-sm text-center py-12">Cap entrega programada els propers 7 dies</p>
              )}
            </section>

            {/* ── Section 3: Charts ─────────────────────────────────────── */}
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* 7-day history */}
              <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <TrendingUp size={18} className="text-[#1e3a5f]" />
                  Evolució últims 7 dies
                </h2>
                {historyData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={historyData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                      <defs>
                        <linearGradient id="histGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#1e3a5f" stopOpacity={0.18} />
                          <stop offset="95%" stopColor="#1e3a5f" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                      <Area type="monotone" dataKey="completed" name="Completades" stroke="#1e3a5f" strokeWidth={2} fill="url(#histGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-slate-400 text-sm text-center py-10">Sense dades</p>
                )}
              </div>

              {/* Article pie */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <Package size={18} className="text-[#1e3a5f]" />
                  Articles en producció
                </h2>
                {articleData.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    <ResponsiveContainer width="100%" height={130}>
                      <PieChart>
                        <Pie
                          data={articleData}
                          cx="50%"
                          cy="50%"
                          outerRadius={60}
                          dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          labelLine={false}
                        >
                          {articleData.map((_, i) => (
                            <Cell key={i} fill={ARTICLE_COLORS[i % ARTICLE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v, n) => [v, n]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {articleData.map((a, i) => (
                        <span key={a.name} className="flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-slate-50 rounded-full px-3 py-1 border border-slate-200">
                          <span className="w-2 h-2 rounded-full" style={{ background: ARTICLE_COLORS[i % ARTICLE_COLORS.length] }} />
                          {a.name}: {a.value}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-400 text-sm text-center py-10">Cap exclusiva en procés</p>
                )}
              </div>
            </section>

            {/* ── Section 4: General info ───────────────────────────────── */}
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
                <div className="bg-amber-50 rounded-xl p-3">
                  <Clock size={22} className="text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Temps mitjà per operació</p>
                  <p className="text-2xl font-bold text-slate-800">{stats.avgMinutes} min</p>
                  <p className="text-xs text-slate-400">Horari: 7:00 – 15:30 · Tall: 14:45</p>
                </div>
              </div>
              <div className={`rounded-2xl border shadow-sm p-5 flex items-center gap-4 ${
                stats.ncOpen > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-100'
              }`}>
                <div className={`rounded-xl p-3 ${stats.ncOpen > 0 ? 'bg-red-100' : 'bg-emerald-50'}`}>
                  {stats.ncOpen > 0
                    ? <AlertCircle size={22} className="text-red-500" />
                    : <CheckCircle2 size={22} className="text-emerald-600" />}
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Incidències obertes</p>
                  <p className={`text-2xl font-bold ${stats.ncOpen > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {stats.ncOpen}
                  </p>
                  {stats.ncOpen === 0 && <p className="text-xs text-emerald-600">Tot en ordre</p>}
                </div>
              </div>
            </section>

            {/* ── Legend ───────────────────────────────────────────────── */}
            <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
                <Layers size={14} /> Llegenda d'estats de lliurament
              </h3>
              <div className="flex flex-wrap gap-3">
                {Object.entries(DELIVERY_STATUS).map(([key, cfg]) => {
                  const Icon = cfg.icon;
                  return (
                    <span key={key} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                      <Icon size={12} /> {key === 'days' ? 'Entrega en X dies' : cfg.label}
                    </span>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-8 border-t border-slate-200 bg-white py-5 text-center">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <Logo size="sm" />
          <p className="text-slate-400 text-sm">
            {lastUpdate
              ? `Última actualització: ${lastUpdate.toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
              : 'Carregant dades...'}
          </p>
          <p className="text-slate-300 text-xs">© {new Date().getFullYear()} Onatex · Confidencial</p>
        </div>
      </footer>
    </div>
  );
}

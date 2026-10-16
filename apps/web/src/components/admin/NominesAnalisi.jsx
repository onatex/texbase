import React, { useState, useEffect, useCallback } from 'react';
import pb from '@/lib/pocketbaseClient';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell as PieCell,
} from 'recharts';
import { Users, TrendingUp, TrendingDown, DollarSign, RefreshCw, AlertCircle, Download } from 'lucide-react';

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function fmt(n) {
  if (n == null || isNaN(n)) return '0 €';
  return new Intl.NumberFormat('ca-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}
function monthLabel(mes, any) {
  return `${MONTHS[mes - 1].slice(0, 3)} ${any}`;
}

function KpiCard({ label, value, sub, color = 'primary', icon: Icon }) {
  const colors = {
    primary: 'from-[#1e3a5f] to-[#2d5a8e]',
    orange: 'from-orange-500 to-orange-600',
    green: 'from-emerald-600 to-emerald-700',
    red: 'from-red-500 to-red-600',
    purple: 'from-purple-600 to-purple-700',
    indigo: 'from-indigo-600 to-indigo-700',
  };
  return (
    <div className={`bg-gradient-to-br ${colors[color] || colors.primary} text-white rounded-xl p-5 flex items-start gap-4 shadow-md`}>
      {Icon && <div className="bg-white/15 rounded-lg p-2.5 mt-0.5"><Icon size={22} /></div>}
      <div className="min-w-0">
        <p className="text-white/70 text-xs font-medium uppercase tracking-wide">{label}</p>
        <p className="font-bold text-2xl mt-0.5 leading-none">{value}</p>
        {sub && <p className="text-white/60 text-xs mt-1">{sub}</p>}
      </div>
    </div>
  );
}

// Export to CSV
function exportCsv(operaris, mes, any) {
  const header = ['Nom', 'Cognom', 'Salari Brut', 'Cotitzacions Empresa', 'Cost Empresa', 'Descomptes', 'Salari Net'].join(';');
  const rows = operaris.map(op => [
    op.nom || '',
    op.cognom || '',
    op.salari_brut || 0,
    op.cotitzacions_empresa || 0,
    op.cost_empresa || (( (op.salari_brut || 0) + (op.cotitzacions_empresa || 0))),
    op.descomptes || 0,
    op.salari_net || 0,
  ].join(';'));
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nomines_${MONTHS[mes - 1]}_${any}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function NominesAnalisi({ selectedMes, selectedAny }) {
  const [nomines, setNomines] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const recs = await pb.collection('nominas_mensuales').getFullList({
        sort: '-any,-mes',
        requestKey: 'nomines-all',
      });
      setNomines(recs);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const current = nomines.find(r => r.mes === selectedMes && r.any === selectedAny);
  const prevMonth = selectedMes === 1
    ? nomines.find(r => r.mes === 12 && r.any === selectedAny - 1)
    : nomines.find(r => r.mes === selectedMes - 1 && r.any === selectedAny);

  const operaris = Array.isArray(current?.operaris) ? current.operaris : [];

  // Computed totals — prefer stored totals, fallback to derived
  const salariTotal = current?.salari_total || operaris.reduce((s, o) => s + (o.salari_brut || 0), 0);
  const descTotal = current?.descomptes_totals || operaris.reduce((s, o) => s + (o.descomptes || 0), 0);
  const netTotal = current?.net_total || operaris.reduce((s, o) => s + (o.salari_net || 0), 0);
  const cotEmpresaTotal = current?.cotizaciones_empresa_total || operaris.reduce((s, o) => s + (o.cotitzacions_empresa || 0), 0);
  const costEmpresaTotal = current?.coste_empresa_total || operaris.reduce((s, o) => s + (o.cost_empresa || ((o.salari_brut || 0) + (o.cotitzacions_empresa || 0))), 0);

  // Build 12-month trend
  const trend = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(selectedAny, selectedMes - 1 - i, 1);
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    const rec = nomines.find(r => r.mes === m && r.any === y);
    const rOps = Array.isArray(rec?.operaris) ? rec.operaris : [];
    const rCotEmpresa = rec?.cotizaciones_empresa_total || rOps.reduce((s, o) => s + (o.cotitzacions_empresa || 0), 0);
    const rCostEmpresa = rec?.coste_empresa_total || rOps.reduce((s, o) => s + (o.cost_empresa || ((o.salari_brut || 0) + (o.cotitzacions_empresa || 0))), 0);
    trend.push({
      label: monthLabel(m, y),
      'Salari Brut': rec?.salari_total || 0,
      'Net': rec?.net_total || 0,
      'Cotitz. Empresa': rCotEmpresa,
      'Cost Empresa': rCostEmpresa || rec?.salari_total || 0,
    });
  }

  // Pie data: cost breakdown for current month
  const pieData = [
    { name: 'Salari Net', value: netTotal },
    { name: 'Descomptes treballador', value: descTotal },
    { name: 'Cotitzacions empresa', value: cotEmpresaTotal },
  ].filter(d => d.value > 0);
  const PIE_COLORS = ['#1e3a5f', '#f97316', '#10b981'];

  const salariPromig = operaris.length > 0
    ? operaris.reduce((s, o) => s + (o.salari_brut || 0), 0) / operaris.length
    : 0;
  const costEmpresaPromig = operaris.length > 0
    ? operaris.reduce((s, o) => s + (o.cost_empresa || ((o.salari_brut || 0) + (o.cotitzacions_empresa || 0))), 0) / operaris.length
    : 0;
  const costMax = operaris.length > 0 ? Math.max(...operaris.map(o => o.cost_empresa || ((o.salari_brut || 0) + (o.cotitzacions_empresa || 0)))) : 0;
  const costMin = operaris.length > 0 ? Math.min(...operaris.map(o => o.cost_empresa || ((o.salari_brut || 0) + (o.cotitzacions_empresa || 0)))) : 0;

  const diffPrev = current && prevMonth
    ? (current.coste_empresa_total || salariTotal) - (prevMonth.coste_empresa_total || prevMonth.salari_total || 0)
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm gap-2">
        <RefreshCw size={18} className="animate-spin" /> Carregant nòmines...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!current && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center gap-3 text-amber-800 text-sm">
          <AlertCircle size={18} />
          No hi ha dades de nòmines per {MONTHS[selectedMes - 1]} {selectedAny}. Aneu a «Carga Mensual» i pugeu el PDF de nòmines.
        </div>
      )}

      {/* Notification banner when data loaded */}
      {current && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-3 text-blue-800 text-sm">
          <Users size={16} className="shrink-0" />
          Nòmines carregades: <strong>{operaris.length} operaris</strong> · Cost empresa total: <strong>{fmt(costEmpresaTotal)}</strong> · Període: {MONTHS[selectedMes - 1]} {selectedAny}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard label="Salari brut total" value={fmt(salariTotal)} sub={monthLabel(selectedMes, selectedAny)} color="primary" icon={DollarSign} />
        <KpiCard label="Salari net total" value={fmt(netTotal)} sub="A pagar" color="green" icon={TrendingUp} />
        <KpiCard label="Descomptes totals" value={fmt(descTotal)} sub="IRPF + SS treballador" color="orange" icon={TrendingDown} />
        <KpiCard label="Cotitz. empresa" value={fmt(cotEmpresaTotal)} sub="SS empresa" color="indigo" icon={TrendingUp} />
        <KpiCard label="Cost empresa total" value={fmt(costEmpresaTotal)} sub="Brut + cotitz. empresa" color="red" icon={DollarSign} />
        <KpiCard label="Operaris" value={current?.num_operaris || operaris.length || 0}
          sub={diffPrev !== null ? `${diffPrev >= 0 ? '+' : ''}${fmt(diffPrev)} vs ant.` : ''}
          color="purple" icon={Users} />
      </div>

      {/* Per-operari table */}
      {operaris.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">Nòmines per operari — {MONTHS[selectedMes - 1]} {selectedAny}</h3>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">{operaris.length} operaris</span>
              <button
                onClick={() => exportCsv(operaris, selectedMes, selectedAny)}
                className="flex items-center gap-1.5 text-xs text-[#1e3a5f] border border-[#1e3a5f]/30 rounded px-2.5 py-1.5 hover:bg-[#1e3a5f]/5 transition"
              >
                <Download size={12} /> Exportar CSV
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  {['Nom', 'Cognom', 'Salari Brut', 'Cotitz. Empresa', 'Cost Empresa', 'Descomptes', 'Salari Net'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {operaris.sort((a, b) => {
                  const ca = a.cost_empresa || ((a.salari_brut || 0) + (a.cotitzacions_empresa || 0));
                  const cb = b.cost_empresa || ((b.salari_brut || 0) + (b.cotitzacions_empresa || 0));
                  return cb - ca;
                }).map((op, i) => {
                  const costEmp = op.cost_empresa || ((op.salari_brut || 0) + (op.cotitzacions_empresa || 0));
                  return (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium">{op.nom || `Operari ${i + 1}`}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{op.cognom || '—'}</td>
                      <td className="px-4 py-3 text-sm">{fmt(op.salari_brut || 0)}</td>
                      <td className="px-4 py-3 text-sm text-indigo-600">{fmt(op.cotitzacions_empresa || 0)}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-red-600">{fmt(costEmp)}</td>
                      <td className="px-4 py-3 text-sm text-orange-600">{fmt(op.descomptes || 0)}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-emerald-700">{fmt(op.salari_net || 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td className="px-4 py-3 text-sm font-bold" colSpan={2}>TOTAL</td>
                  <td className="px-4 py-3 text-sm font-bold">{fmt(salariTotal)}</td>
                  <td className="px-4 py-3 text-sm font-bold text-indigo-600">{fmt(cotEmpresaTotal)}</td>
                  <td className="px-4 py-3 text-sm font-bold text-red-600">{fmt(costEmpresaTotal)}</td>
                  <td className="px-4 py-3 text-sm font-bold text-orange-600">{fmt(descTotal)}</td>
                  <td className="px-4 py-3 text-sm font-bold text-emerald-700">{fmt(netTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Stats cards */}
      {operaris.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Cost empresa promig', value: fmt(costEmpresaPromig) },
            { label: 'Cost empresa màxim', value: fmt(costMax) },
            { label: 'Cost empresa mínim', value: fmt(costMin) },
            { label: 'Salari brut promig', value: fmt(salariPromig) },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm text-center">
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className="text-xl font-bold text-[#1e3a5f]">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Cost breakdown pie + bar */}
      {current && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {pieData.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-800 mb-4">Desglossament cost empresa — {MONTHS[selectedMes - 1]} {selectedAny}</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {pieData.map((_, idx) => <PieCell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={v => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Per operari cost empresa bar */}
          {operaris.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-800 mb-4">Cost empresa per operari</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={[...operaris].sort((a, b) => {
                  const ca = a.cost_empresa || ((a.salari_brut || 0) + (a.cotitzacions_empresa || 0));
                  const cb = b.cost_empresa || ((b.salari_brut || 0) + (b.cotitzacions_empresa || 0));
                  return cb - ca;
                }).map(op => ({
                  name: `${op.nom || ''} ${(op.cognom || '').slice(0, 10)}`.trim() || 'Op',
                  'Cost Empresa': op.cost_empresa || ((op.salari_brut || 0) + (op.cotitzacions_empresa || 0)),
                  'Salari Net': op.salari_net || 0,
                }))} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                  <Tooltip formatter={v => fmt(v)} />
                  <Legend />
                  <Bar dataKey="Cost Empresa" fill="#ef4444" radius={[0, 3, 3, 0]} />
                  <Bar dataKey="Salari Net" fill="#10b981" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Comparison with previous month */}
      {current && prevMonth && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Comparativa vs mes anterior</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 text-sm">
            {[
              { label: 'Salari brut', curr: salariTotal, prev: prevMonth.salari_total || 0, higherIsBad: true },
              { label: 'Cotitz. empresa', curr: cotEmpresaTotal, prev: prevMonth.cotizaciones_empresa_total || 0, higherIsBad: true },
              { label: 'Cost empresa', curr: costEmpresaTotal, prev: prevMonth.coste_empresa_total || prevMonth.salari_total || 0, higherIsBad: true },
              { label: 'Descomptes', curr: descTotal, prev: prevMonth.descomptes_totals || 0, higherIsBad: false },
              { label: 'Salari net', curr: netTotal, prev: prevMonth.net_total || 0, higherIsBad: false },
            ].map(({ label, curr, prev, higherIsBad }) => {
              const diff = (curr || 0) - (prev || 0);
              const pct = prev > 0 ? (diff / prev) * 100 : 0;
              const isGood = higherIsBad ? diff <= 0 : diff >= 0;
              return (
                <div key={label} className="border border-gray-100 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">{label}</p>
                  <p className="font-semibold">{fmt(curr || 0)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Ant: {fmt(prev || 0)}</p>
                  <p className={`text-xs font-semibold mt-1 ${isGood ? 'text-emerald-600' : 'text-red-500'}`}>
                    {diff >= 0 ? '▲' : '▼'} {fmt(Math.abs(diff))} ({Math.abs(pct).toFixed(1)}%)
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 12-month trend */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-800 mb-4">Evolució cost empresa — últims 12 mesos</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={v => fmt(v)} />
            <Legend />
            <Bar dataKey="Salari Brut" fill="#1e3a5f" radius={[0, 0, 0, 0]} stackId="a" />
            <Bar dataKey="Cotitz. Empresa" fill="#6366f1" radius={[3, 3, 0, 0]} stackId="a" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* All months summary */}
      {nomines.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800">Historial de nòmines</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  {['Mes', 'Operaris', 'Salari Brut', 'Cotitz. Empresa', 'Cost Empresa', 'Descomptes', 'Net Total', 'Data Carga'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {nomines.slice(0, 24).map((r, i) => {
                  const rOps = Array.isArray(r.operaris) ? r.operaris : [];
                  const rCotEmp = r.cotizaciones_empresa_total || rOps.reduce((s, o) => s + (o.cotitzacions_empresa || 0), 0);
                  const rCostEmp = r.coste_empresa_total || rOps.reduce((s, o) => s + (o.cost_empresa || ((o.salari_brut || 0) + (o.cotitzacions_empresa || 0))), 0);
                  return (
                    <tr key={i} className={`hover:bg-gray-50 ${r.mes === selectedMes && r.any === selectedAny ? 'bg-blue-50/40' : ''}`}>
                      <td className="px-4 py-3 text-sm font-medium">{MONTHS[r.mes - 1]} {r.any}</td>
                      <td className="px-4 py-3 text-sm">{r.num_operaris || '—'}</td>
                      <td className="px-4 py-3 text-sm">{fmt(r.salari_total || 0)}</td>
                      <td className="px-4 py-3 text-sm text-indigo-600">{fmt(rCotEmp)}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-red-600">{fmt(rCostEmp)}</td>
                      <td className="px-4 py-3 text-sm text-orange-600">{fmt(r.descomptes_totals || 0)}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-emerald-700">{fmt(r.net_total || 0)}</td>
                      <td className="px-4 py-3 text-sm text-gray-400">{r.data_carga || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

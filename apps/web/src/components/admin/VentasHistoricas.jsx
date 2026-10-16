import React, { useState, useEffect, useCallback, useRef } from 'react';
import pb from '@/lib/pocketbaseClient';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Upload, Plus, Save, RefreshCw,
  X, ChevronUp, ChevronDown, Minus, FileText,
} from 'lucide-react';

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function fmt(n) {
  if (!n) return '0 €';
  return new Intl.NumberFormat('ca-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}
function fmtN(n) { return n != null ? Number(n).toLocaleString('ca-ES') : '0'; }

function trend(vals) {
  if (vals.length < 2) return 0;
  const last = vals[vals.length - 1];
  const prev = vals[vals.length - 2];
  if (!prev) return 0;
  return ((last - prev) / prev) * 100;
}

function TrendBadge({ pct }) {
  if (pct === 0) return <span className="flex items-center gap-1 text-xs text-gray-500"><Minus size={12}/>Estable</span>;
  const up = pct > 0;
  return (
    <span className={`flex items-center gap-1 text-xs font-semibold ${up ? 'text-emerald-600' : 'text-red-500'}`}>
      {up ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function KpiMini({ label, value, sub, trend: t }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-[#1e3a5f] mt-1">{value}</p>
      <div className="flex items-center gap-2 mt-1">
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
        {t != null && <TrendBadge pct={t} />}
      </div>
    </div>
  );
}

// ─── Manual entry modal ───────────────────────────────────────────────────────
function ManualModal({ onClose, onSaved, existing }) {
  const [form, setForm] = useState(existing || {
    mes: new Date().getMonth() + 1, any: new Date().getFullYear(),
    exclusives_totals: '', ingressos_totals: '', dies_laborals: '',
    operaris_promig: '', hores_totals: '', notes: '',
    exclusives_per_article: '{"R82-020":0,"R82-021":0}',
    ingressos_per_article: '{"R82-020":0,"R82-021":0}',
  });
  const [saving, setSaving] = useState(false);
  const inp = 'border border-gray-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30';

  const save = async () => {
    setSaving(true);
    try {
      let excArt = {}, ingArt = {};
      try { excArt = JSON.parse(form.exclusives_per_article); } catch(_) {}
      try { ingArt = JSON.parse(form.ingressos_per_article); } catch(_) {}
      const data = {
        mes: Number(form.mes), any: Number(form.any),
        exclusives_totals: Number(form.exclusives_totals) || 0,
        ingressos_totals: Number(form.ingressos_totals) || 0,
        dies_laborals: Number(form.dies_laborals) || 0,
        operaris_promig: Number(form.operaris_promig) || 0,
        hores_totals: Number(form.hores_totals) || 0,
        notes: form.notes,
        exclusives_per_article: excArt,
        ingressos_per_article: ingArt,
        font: 'manual',
      };
      if (existing?.id) await pb.collection('ventas_historicas').update(existing.id, data);
      else await pb.collection('ventas_historicas').create(data);
      onSaved();
    } catch(e) { alert('Error: ' + e.message); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">{existing ? 'Editar' : 'Nuevo'} mes de ventas</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Mes</label>
              <select className={inp} value={form.mes} onChange={e => setForm(f=>({...f,mes:Number(e.target.value)}))}>
                {MONTHS.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Año</label>
              <input type="number" className={inp} value={form.any} onChange={e => setForm(f=>({...f,any:e.target.value}))} min={2020} max={2030}/>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[['exclusives_totals','Exclusivas totales'],['ingressos_totals','Ingresos totales (€)'],['dies_laborals','Días laborales'],['operaris_promig','Operarios promedio'],['hores_totals','Horas totales']].map(([k,l]) => (
              <div key={k}>
                <label className="text-xs font-medium text-gray-500 block mb-1">{l}</label>
                <input type="number" className={inp} value={form[k]} onChange={e => setForm(f=>({...f,[k]:e.target.value}))} step="0.1" min="0"/>
              </div>
            ))}
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Exclusivas por artículo (JSON)</label>
            <textarea className={inp+' font-mono text-xs'} rows={2} value={form.exclusives_per_article} onChange={e => setForm(f=>({...f,exclusives_per_article:e.target.value}))}/>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Ingresos por artículo (JSON)</label>
            <textarea className={inp+' font-mono text-xs'} rows={2} value={form.ingressos_per_article} onChange={e => setForm(f=>({...f,ingressos_per_article:e.target.value}))}/>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Notas</label>
            <textarea className={inp} rows={2} value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))}/>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
          <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm bg-[#1e3a5f] text-white rounded-lg hover:bg-[#2d5a8e] disabled:opacity-50">
            {saving ? <RefreshCw size={14} className="animate-spin"/> : <Save size={14}/>}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CSV import ───────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(/[,;\t]/).map(h => h.trim().toLowerCase().replace(/\s+/g,'_'));
  return lines.slice(1).map(line => {
    const vals = line.split(/[,;\t]/);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });
    return obj;
  }).filter(r => r.mes || r.month);
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function VentasHistoricas() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const recs = await pb.collection('ventas_historicas').getFullList({ sort: '-any,-mes', requestKey: 'vh-all' });
      setRecords(recs);
    } catch(e) { console.error(e); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Build 12-month chart data
  const chartData = (() => {
    const now = new Date();
    const data = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const m = d.getMonth() + 1, y = d.getFullYear();
      const rec = records.find(r => r.mes === m && r.any === y);
      data.push({
        label: `${MONTHS[m-1].slice(0,3)} ${y}`,
        Exclusives: rec?.exclusives_totals || 0,
        Ingressos: rec?.ingressos_totals || 0,
        HoresTotal: rec?.hores_totals || 0,
      });
    }
    return data;
  })();

  const excVals = chartData.map(d => d.Exclusives);
  const ingVals = chartData.map(d => d.Ingressos);

  const stats = {
    avgExc: excVals.filter(Boolean).length ? Math.round(excVals.filter(Boolean).reduce((a,b)=>a+b,0) / excVals.filter(Boolean).length) : 0,
    maxExc: Math.max(...excVals),
    minExc: Math.min(...excVals.filter(Boolean)) || 0,
    avgIng: ingVals.filter(Boolean).length ? ingVals.filter(Boolean).reduce((a,b)=>a+b,0) / ingVals.filter(Boolean).length : 0,
    trendExc: trend(excVals.filter(Boolean)),
    trendIng: trend(ingVals.filter(Boolean)),
  };

  // Current vs previous month
  const thisM = new Date(), prevM = new Date(thisM.getFullYear(), thisM.getMonth()-1, 1);
  const sameLastY = new Date(thisM.getFullYear()-1, thisM.getMonth(), 1);
  const curr = records.find(r => r.mes === thisM.getMonth()+1 && r.any === thisM.getFullYear());
  const prev = records.find(r => r.mes === prevM.getMonth()+1 && r.any === prevM.getFullYear());
  const lastYr = records.find(r => r.mes === sameLastY.getMonth()+1 && r.any === sameLastY.getFullYear());

  const vsM = curr && prev ? ((curr.exclusives_totals - prev.exclusives_totals) / (prev.exclusives_totals||1)) * 100 : null;
  const vsY = curr && lastYr ? ((curr.exclusives_totals - lastYr.exclusives_totals) / (lastYr.exclusives_totals||1)) * 100 : null;

  // Peaks analysis
  const sortedByExc = [...records].sort((a,b) => b.exclusives_totals - a.exclusives_totals);
  const top3 = sortedByExc.slice(0, 3);

  // Monthly averages per month-of-year
  const byMonth = {};
  records.forEach(r => {
    if (!byMonth[r.mes]) byMonth[r.mes] = [];
    byMonth[r.mes].push(r.exclusives_totals || 0);
  });
  const monthAvgData = Array.from({length:12},(_,i) => ({
    mes: MONTHS[i].slice(0,3),
    promig: byMonth[i+1] ? Math.round(byMonth[i+1].reduce((a,b)=>a+b,0)/byMonth[i+1].length) : 0,
  }));

  // CSV import
  const handleImport = async () => {
    if (!csvText.trim()) return;
    setImporting(true);
    const rows = parseCSV(csvText);
    let ok = 0, errors = [];
    for (const row of rows) {
      try {
        const mes = parseInt(row.mes || row.month || row.month_num);
        const any = parseInt(row.any || row.year);
        if (!mes || !any || mes < 1 || mes > 12) { errors.push(`Fila inválida: ${JSON.stringify(row)}`); continue; }
        const data = {
          mes, any,
          exclusives_totals: parseInt(row.exclusives_totals || row.exclusives || row.total_exclusivas) || 0,
          ingressos_totals: parseFloat(row.ingressos_totals || row.ingresos || row.revenue) || 0,
          dies_laborals: parseInt(row.dies_laborals || row.dias_laborales || row.working_days) || 0,
          operaris_promig: parseFloat(row.operaris_promig || row.operarios || row.workers) || 0,
          hores_totals: parseFloat(row.hores_totals || row.horas || row.hours) || 0,
          notes: row.notes || row.notas || '',
          font: 'csv',
        };
        // Try update existing first
        const existing = records.find(r => r.mes === mes && r.any === any);
        if (existing) await pb.collection('ventas_historicas').update(existing.id, data);
        else await pb.collection('ventas_historicas').create(data);
        ok++;
      } catch(e) { errors.push(e.message); }
    }
    setImportResult({ ok, errors });
    setImporting(false);
    load();
  };

  if (loading) return <div className="flex items-center justify-center h-48 text-gray-400 text-sm gap-2"><RefreshCw size={16} className="animate-spin"/>Carregant...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h2 className="text-xl font-bold text-gray-800">Historial de vendes</h2>
          <p className="text-sm text-gray-500">{records.length} mesos registrats</p>
        </div>
        <button onClick={() => { setEditRecord(null); setShowModal(true); }}
          className="flex items-center gap-2 bg-[#1e3a5f] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#2d5a8e]">
          <Plus size={16}/> Nou mes
        </button>
        <button onClick={load} className="p-2 text-gray-400 hover:text-[#1e3a5f] border border-gray-200 rounded-lg">
          <RefreshCw size={16}/>
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiMini label="Exclusives aquest mes" value={fmtN(curr?.exclusives_totals)} sub="vs mes anterior" trend={vsM}/>
        <KpiMini label="Ingressos aquest mes" value={fmt(curr?.ingressos_totals)} sub="vs any anterior" trend={vsY}/>
        <KpiMini label="Promig exclusives/mes" value={fmtN(stats.avgExc)} sub={`Màx: ${stats.maxExc} | Mín: ${stats.minExc}`}/>
        <KpiMini label="Tendència ingressos" value={fmt(stats.avgIng)} trend={stats.trendIng}/>
      </div>

      {/* Comparatives */}
      {(curr || prev || lastYr) && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Comparativa</h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            {[
              { label: 'Aquest mes', rec: curr },
              { label: 'Mes anterior', rec: prev },
              { label: 'Mateix mes any passat', rec: lastYr },
            ].map(({ label, rec }) => (
              <div key={label} className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-medium text-gray-500 mb-2">{label}</p>
                <p className="text-lg font-bold text-[#1e3a5f]">{fmtN(rec?.exclusives_totals || 0)}</p>
                <p className="text-xs text-gray-400">exclusives</p>
                <p className="text-sm font-semibold text-emerald-600 mt-1">{fmt(rec?.ingressos_totals || 0)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Evolució exclusives (últims 12 mesos)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="excGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1e3a5f" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#1e3a5f" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
              <XAxis dataKey="label" tick={{ fontSize: 10 }}/>
              <YAxis tick={{ fontSize: 10 }}/>
              <Tooltip/>
              <Area type="monotone" dataKey="Exclusives" stroke="#1e3a5f" fill="url(#excGrad)" strokeWidth={2}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Ingressos (últims 12 mesos)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="ingGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
              <XAxis dataKey="label" tick={{ fontSize: 10 }}/>
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`}/>
              <Tooltip formatter={v => fmt(v)}/>
              <Area type="monotone" dataKey="Ingressos" stroke="#f97316" fill="url(#ingGrad)" strokeWidth={2}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly averages heatmap */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-800 mb-4">Promig exclusives per mes de l'any (anàlisi de càrrega)</h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={monthAvgData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
            <XAxis dataKey="mes" tick={{ fontSize: 11 }}/>
            <YAxis tick={{ fontSize: 11 }}/>
            <Tooltip/>
            <Bar dataKey="promig" name="Promig exclusives" radius={[4,4,0,0]}>
              {monthAvgData.map((d, i) => {
                const max = Math.max(...monthAvgData.map(x => x.promig));
                const intensity = max > 0 ? d.promig / max : 0;
                const r = Math.round(30 + intensity * 100);
                const g = Math.round(58 + intensity * 30);
                const b = Math.round(95 + intensity * 50);
                return <Cell key={i} fill={`hsl(220, ${40 + intensity*40}%, ${70 - intensity*40}%)`}/>;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-3 flex flex-wrap gap-3">
          {top3.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <TrendingUp size={14} className="text-orange-500"/>
              <span>Mesos punta: </span>
              {top3.map((r,i) => (
                <span key={i} className="font-semibold text-[#1e3a5f]">{MONTHS[r.mes-1].slice(0,3)} {r.any} ({r.exclusives_totals})</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Historial complet</h3>
          <span className="text-xs text-gray-400">{records.length} registres</span>
        </div>
        <div className="overflow-x-auto max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {['Mes','Any','Exclusives','Ingressos','Dies lab.','Operaris','Hores','Font','Accions'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {records.length === 0 ? (
                <tr><td colSpan={9} className="p-8 text-center text-gray-400">Cap registre. Afegeix el primer mes.</td></tr>
              ) : records.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2.5 font-medium">{MONTHS[r.mes-1]}</td>
                  <td className="px-3 py-2.5">{r.any}</td>
                  <td className="px-3 py-2.5 font-semibold">{fmtN(r.exclusives_totals)}</td>
                  <td className="px-3 py-2.5">{fmt(r.ingressos_totals)}</td>
                  <td className="px-3 py-2.5">{r.dies_laborals || '—'}</td>
                  <td className="px-3 py-2.5">{r.operaris_promig || '—'}</td>
                  <td className="px-3 py-2.5">{r.hores_totals || '—'}</td>
                  <td className="px-3 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.font==='csv'?'bg-blue-100 text-blue-700':'bg-gray-100 text-gray-600'}`}>{r.font || 'manual'}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <button onClick={() => { setEditRecord(r); setShowModal(true); }} className="text-xs text-[#1e3a5f] underline">Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* CSV Import */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2"><Upload size={16} className="text-[#1e3a5f]"/>Importar CSV/Excel (pega el contingut)</h3>
        <p className="text-xs text-gray-500 mb-3">Columnes: <code className="bg-gray-100 px-1 rounded">mes, any, exclusives_totals, ingressos_totals, dies_laborals, operaris_promig, hores_totals</code></p>
        <textarea
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono h-28 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
          placeholder="mes,any,exclusives_totals,ingressos_totals&#10;1,2024,45,22000&#10;2,2024,52,26000"
          value={csvText}
          onChange={e => setCsvText(e.target.value)}
        />
        <div className="flex items-center gap-3 mt-3">
          <button onClick={handleImport} disabled={importing || !csvText.trim()}
            className="flex items-center gap-2 bg-[#1e3a5f] text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
            {importing ? <RefreshCw size={14} className="animate-spin"/> : <FileText size={14}/>}
            Importar
          </button>
          {importResult && (
            <div className={`text-sm font-medium ${importResult.errors.length > 0 ? 'text-orange-600' : 'text-emerald-600'}`}>
              ✓ {importResult.ok} importats{importResult.errors.length > 0 ? `, ${importResult.errors.length} errors` : ''}
            </div>
          )}
        </div>
      </div>

      {showModal && <ManualModal existing={editRecord} onClose={() => { setShowModal(false); setEditRecord(null); }} onSaved={() => { setShowModal(false); setEditRecord(null); load(); }}/>}
    </div>
  );
}

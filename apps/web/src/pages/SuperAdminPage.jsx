import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Helmet } from 'react-helmet';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/lib/auth';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart,
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, Users, Package,
  AlertTriangle, Upload, Download, Calendar, FileText,
  CheckCircle, XCircle, AlertCircle, BarChart2, LogOut,
  RefreshCw, Shield, Save, Eye,
  ChevronDown, ChevronRight, LayoutDashboard, PanelLeftClose, PanelLeftOpen,
  RefreshCcw, Settings, Wifi, Monitor, ArrowLeft, History, Menu, X,
} from 'lucide-react';
import useProduccio from '@/hooks/useProduccio';
import { SingleFileDrop } from '@/components/common/DragDropUpload';
import {
  extractNominesPdf, extractVendesPdf, validateOperaris, validateArticles,
} from '@/utils/pdfExtraction';
import Panel from '@/components/admin/Panel';
import PanelHoy from '@/components/admin/PanelHoy';
import DashboardEnViu from '@/components/admin/DashboardEnViu';
import LlistatIncidencies from '@/components/admin/LlistatIncidencies';
import MetriquesQC from '@/components/admin/MetriquesQC';
import RegistroHorario from '@/components/admin/RegistroHorario';
import Contrasenyes from '@/components/admin/Contrasenyes';
import VentasHistoricas from '@/components/admin/VentasHistoricas';
import NominesAnalisi from '@/components/admin/NominesAnalisi';
import FasesExternalizadas from '@/components/admin/FasesExternalizadas';
import PropuestasMejora from '@/components/admin/PropuestasMejora';
import RetrabajosDashboard from '@/components/admin/RetrabajosDashboard';
import ProveedoresExternalizados from '@/components/admin/ProveedoresExternalizados';
import EncargosExternos from '@/components/admin/EncargosExternos';
import GestioOperacions from '@/components/admin/GestioOperacions';
import Importar from '@/components/admin/Importar';
import CargaMasiva from '@/components/admin/CargaMasiva';

import ExclusivaDetall from '@/components/admin/ExclusivaDetall';
import AnalisiArticle from '@/components/admin/AnalisiArticle';
import RutaDetall from '@/components/admin/RutaDetall';
import Recogida from '@/components/admin/Recogida';
import ReportEntregues from '@/components/admin/ReportEntregues';
import NovaIncidencia from '@/components/admin/NovaIncidencia';
import CargaMasivaIncidencies from '@/components/admin/CargaMasivaIncidencies';
import Logo from '@/components/Logo';
import NotificationsBell from '@/components/common/NotificationsBell';
import { Exclusives, Rutes, Trazabilitat, Articles, Usuaris } from '@/components/admin/Seccions';
import ForecastRecursos from '@/components/ForecastRecursos';
import KanbanExclusives from '@/components/admin/KanbanExclusives';
import CalendariLaboral from '@/components/admin/CalendariLaboral';
import InformeTiempos from '@/components/admin/InformeTiempos';
import InformeOperari from '@/components/admin/InformeOperari';
import ProduccionPage from '@/pages/ProduccionPage';
import QualitatPage from '@/pages/QualitatPage';
import OperarioPage from '@/pages/OperarioPage';
import ExternalizacioPage from '@/pages/ExternalizacioPage';
import ChatCalidad from '@/components/common/ChatCalidad';
import { useChatCalidadNoLlegits } from '@/hooks/useChatCalidad';

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const COLORS = ['#1e3a5f','#f97316','#10b981','#6366f1','#f59e0b','#ef4444'];

// ─── Sidebar nav structure (mirrors Admin + Finances group) ───────────────────
const NAV = [
  {
    id: 'finances_group',
    label: 'Finances',
    icon: DollarSign,
    items: [
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'carga', label: 'Carga Mensual' },
      { id: 'nomines', label: 'Nòmines' },
      { id: 'vendes_analisi', label: 'Vendes' },
      { id: 'marges', label: 'Marges' },
      { id: 'operaris', label: 'Anàlisi Operaris' },
      { id: 'exclusives_costs', label: 'Exclusives Costs' },
      { id: 'incidencies_costs', label: 'Verificació NC' },
      { id: 'verificacio', label: 'Verificació Dades' },
      { id: 'ventas_historicas', label: 'Historial Vendes' },
    ],
  },
  {
    id: 'dashboard_group',
    label: 'Dashboard',
    icon: LayoutDashboard,
    items: [
      { id: 'en_viu', label: 'En vivo' },
      { id: 'kanban', label: 'Kanban' },
      { id: 'panel_admin', label: 'Panel' },
      { id: 'hoy', label: 'Hoy' },
    ],
  },
  {
    id: 'producto_group',
    label: 'Producto',
    icon: Package,
    items: [
      { id: 'exclusives_admin', label: 'Exclusivas' },
      { id: 'importar', label: 'Nueva exclusiva' },
      { id: 'carga_masiva', label: 'Carga masiva' },
      { id: 'rutes', label: 'Rutas' },
      { id: 'ruta_r82020', label: 'R82-020 UNIC' },
      { id: 'articles', label: 'Artículos' },
    ],
  },
  {
    id: 'produccio_group',
    label: 'Producción',
    icon: BarChart2,
    items: [
      { id: 'gestio_ops', label: 'Gestión operaciones' },
      { id: 'analisi_article', label: 'Análisis por artículo' },
      { id: 'trazabilitat', label: 'Trazabilidad' },
      { id: 'fases_ext', label: 'Fases externalizadas' },
      { id: 'encargos', label: 'Encargos externos' },
      { id: 'proveedores', label: 'Proveedores' },
      { id: 'forecast', label: 'Forecast recursos' },
    ],
  },
  {
    id: 'qualitat_group',
    label: 'Calidad',
    icon: Shield,
    items: [
      { id: 'recogida', label: 'Listas para recoger' },
      { id: 'entregas', label: 'Reporte entregas' },
      { id: 'metriques_qc', label: 'Métricas QC' },
      { id: 'incidencies_full', label: 'Listado incidencias' },
      { id: 'propuestas', label: 'Propuestas de mejora' },
      { id: 'retrabajos', label: 'Retrabajos' },
      { id: 'chat_calidad', label: 'Chat Calidad' },
    ],
  },
  {
    id: 'admin_group',
    label: 'Administración',
    icon: Settings,
    items: [
      { id: 'usuaris', label: 'Usuarios' },
      { id: 'contrasenyes', label: 'Contraseñas' },
      { id: 'nova_incidencia', label: 'Nueva incidencia' },
      { id: 'carga_incidencies', label: 'Carga masiva incidencias' },
      { id: 'registro_horario', label: 'Registro horario' },
      { id: 'informe_tiempos', label: 'Informe tiempos' },
      { id: 'informe_operari', label: 'Informe operario' },
      { id: 'calendari', label: 'Calendari laboral' },
    ],
  },
  {
    id: 'monitor_group',
    label: 'Monitorización',
    icon: Monitor,
    items: [
      { id: 'ver_produccio', label: 'Ver como Producción' },
      { id: 'ver_qualitat', label: 'Ver como Calidad' },
      { id: 'ver_operario', label: 'Ver como Operario' },
      { id: 'ver_externalitzacio', label: 'Ver como Externalización' },
    ],
  },
];

const ALL_TABS = NAV.flatMap(g => g.items);

// ─── View-as-role mapping (Monitorización en vivo) ────────────────────────────
const VIEW_AS = {
  ver_produccio: { label: 'Producción', Comp: ProduccionPage },
  ver_qualitat: { label: 'Calidad', Comp: QualitatPage },
  ver_operario: { label: 'Operario', Comp: OperarioPage },
  ver_externalitzacio: { label: 'Externalización', Comp: ExternalizacioPage },
};
const VIEW_AS_TABS = Object.keys(VIEW_AS);

// ─── Ruta dinàmica (R82-020 UNIC) ─────────────────────────────────────────────
function RutaDinamica({ rutaNom }) {
  const [rutaId, setRutaId] = useState(null);
  const [carregant, setCarregant] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    pb.collection('rutes').getFirstListItem(`nom="${rutaNom}"`, { requestKey: `ruta-${rutaNom}` })
      .then((r) => setRutaId(r.id))
      .catch(() => setError(`No se encontró la ruta: ${rutaNom}`))
      .finally(() => setCarregant(false));
  }, [rutaNom]);
  if (carregant) return <div className="h-32 animate-pulse rounded-lg bg-secondary" />;
  if (error) return <p className="rounded-md bg-destructive/10 px-4 py-3 text-destructive">{error}</p>;
  return <RutaDetall rutaId={rutaId} rutaNom={rutaNom} />;
}

// ─── Icon-only popup flyout (collapsed sidebar) ───────────────────────────────
function IconFlyout({ group, activeTab, onSelect, chatNoLlegits }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const Icon = group.icon;
  const hasActive = group.items.some((i) => i.id === activeTab);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        onClick={() => setOpen((v) => !v)}
        title={group.label}
        className={`relative flex h-10 w-10 items-center justify-center rounded-md transition
          ${hasActive ? 'bg-white/25 text-white' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
      >
        <Icon className="h-5 w-5" />
        {chatNoLlegits > 0 && group.items.some((i) => i.id === 'chat_calidad') && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-[hsl(var(--accent))] px-1 text-[9px] font-bold text-white">{chatNoLlegits > 9 ? '9+' : chatNoLlegits}</span>
        )}
      </button>

      {open && (
        <div
          className="absolute left-full top-0 z-50 ml-2 min-w-[180px] rounded-lg border border-white/10 bg-primary shadow-xl"
          style={{ pointerEvents: 'auto' }}
        >
          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-white/50 border-b border-white/10">
            {group.label}
          </div>
          <div className="py-1">
            {group.items.map((item) => (
              <button
                key={item.id}
                onClick={() => { onSelect(item.id); setOpen(false); }}
                className={`w-full px-3 py-2 text-left text-sm transition flex items-center justify-between gap-2
                  ${activeTab === item.id ? 'bg-white/20 text-white font-semibold' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
              >
                <span>{item.label}</span>
                {item.id === 'chat_calidad' && chatNoLlegits > 0 && (
                  <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[hsl(var(--accent))] px-1 text-[10px] font-bold text-white">{chatNoLlegits}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Full sidebar group (expanded sidebar) ────────────────────────────────────
function SidebarGroup({ group, activeTab, onSelect, expanded, onToggle, chatNoLlegits }) {
  const Icon = group.icon;
  const hasActive = group.items.some((i) => i.id === activeTab);
  return (
    <div>
      <button
        onClick={onToggle}
        className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-semibold transition
          ${hasActive ? 'bg-white/20 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
      >
        <span className="flex items-center gap-2">
          <Icon className="h-4 w-4 shrink-0" />
          {group.label}
        </span>
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      {expanded && (
        <div className="mt-0.5 ml-5 border-l border-white/20 pl-2 flex flex-col gap-0.5">
          {group.items.map((item) => (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`w-full rounded px-3 py-1.5 text-left text-sm transition flex items-center justify-between gap-2
                ${activeTab === item.id ? 'bg-white text-primary font-semibold' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
            >
              <span>{item.label}</span>
              {item.id === 'chat_calidad' && chatNoLlegits > 0 && (
                <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[hsl(var(--accent))] px-1 text-[10px] font-bold text-white">{chatNoLlegits}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function fmt(n) {
  if (n == null || isNaN(n)) return '0 €';
  return new Intl.NumberFormat('ca-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}
function fmtPct(n) {
  if (n == null || isNaN(n)) return '0%';
  return `${n.toFixed(1)}%`;
}
function monthLabel(mes, any) {
  return `${MONTHS[mes-1].slice(0,3)} ${any}`;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color = 'primary', icon: Icon }) {
  const colors = {
    primary: 'from-[#1e3a5f] to-[#2d5a8e]',
    orange: 'from-orange-500 to-orange-600',
    green: 'from-emerald-600 to-emerald-700',
    red: 'from-red-500 to-red-600',
  };
  return (
    <div className={`bg-gradient-to-br ${colors[color]} text-white rounded-xl p-5 flex items-start gap-4 shadow-md`}>
      {Icon && <div className="bg-white/15 rounded-lg p-2.5 mt-0.5"><Icon size={22} /></div>}
      <div className="min-w-0">
        <p className="text-white/70 text-xs font-medium uppercase tracking-wide">{label}</p>
        <p className="font-bold text-2xl mt-0.5 leading-none">{value}</p>
        {sub && <p className="text-white/60 text-xs mt-1">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Dashboard Tab ────────────────────────────────────────────────────────────
function DashboardTab({ costData, selectedMes, selectedAny }) {
  const current = costData.find(r => r.mes === selectedMes && r.any === selectedAny);
  const ingressos = current?.ingressos_totals || 0;
  const costos = current?.total_costos || 0;
  const marge = ingressos - costos;
  const margePct = ingressos > 0 ? (marge / ingressos) * 100 : 0;
  // Exclusives and price from stored counts
  const countPerArt = current?.exclusives_count_per_article || {};
  const totalExclusivesDashboard = Object.values(countPerArt).reduce((s, v) => s + (Number(v) || 0), 0);
  const avgPreuDashboard = totalExclusivesDashboard > 0 ? ingressos / totalExclusivesDashboard : 0;

  const chartData = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(selectedAny, selectedMes - 1 - i, 1);
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    const rec = costData.find(r => r.mes === m && r.any === y);
    chartData.push({
      label: monthLabel(m, y),
      Ingressos: rec?.ingressos_totals || 0,
      Costos: rec?.total_costos || 0,
      Marge: rec ? (rec.ingressos_totals || 0) - (rec.total_costos || 0) : 0,
    });
  }

  const pieCostos = current ? [
    { name: 'Nòmines', value: current.nomines || 0 },
    { name: 'Operacionals', value: current.costos_operacionals || 0 },
    { name: 'Altres', value: current.altres_costos || 0 },
  ].filter(p => p.value > 0) : [];

  return (
    <div className="space-y-6">
      {!current && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center gap-3 text-amber-800 text-sm">
          <AlertCircle size={18} />
          No hi ha dades per {MONTHS[selectedMes-1]} {selectedAny}. Aneu a «Carga Mensual» per introduir les dades.
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Ingressos totals" value={fmt(ingressos)} sub={monthLabel(selectedMes, selectedAny)} color="primary" icon={TrendingUp} />
        <KpiCard label="Costos totals" value={fmt(costos)} sub="Nòmines + operacionals" color="orange" icon={TrendingDown} />
        <KpiCard label="Marge brut" value={fmt(marge)} sub={fmtPct(margePct) + ' del ingrés'} color={marge >= 0 ? 'green' : 'red'} icon={DollarSign} />
        <KpiCard label="Marge %" value={fmtPct(margePct)} sub={marge >= 0 ? 'Positiu' : 'Negatiu'} color={margePct >= 20 ? 'green' : margePct >= 0 ? 'orange' : 'red'} icon={BarChart2} />
        {totalExclusivesDashboard > 0 && <KpiCard label="Nº exclusives vendes" value={totalExclusivesDashboard} sub={monthLabel(selectedMes, selectedAny)} color="primary" icon={Package} />}
        {avgPreuDashboard > 0 && <KpiCard label="Preu promig/exclusiva" value={fmt(avgPreuDashboard)} sub="Ingressos ÷ exclusives" color="orange" icon={DollarSign} />}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Evolució Ingressos vs Costos (últims 12 mesos)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="ingGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1e3a5f" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="#1e3a5f" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => fmt(v)} />
              <Legend />
              <Area type="monotone" dataKey="Ingressos" stroke="#1e3a5f" fill="url(#ingGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="Costos" stroke="#f97316" fill="url(#costGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Distribució de costos</h3>
          {pieCostos.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieCostos} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                  {pieCostos.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => fmt(v)} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Sense dades de costos</div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-800 mb-4">Marge per mes (últims 12 mesos)</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
            <Tooltip formatter={(v) => fmt(v)} />
            <Bar dataKey="Marge" radius={[4,4,0,0]}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.Marge >= 0 ? '#10b981' : '#ef4444'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── PDF Preview Modal ────────────────────────────────────────────────────────
function PdfPreviewModal({ url, title, onClose }) {
  if (!url) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80">
      <div className="flex items-center justify-between bg-[#1e3a5f] px-5 py-3 text-white">
        <div className="flex items-center gap-3">
          <FileText size={18} />
          <span className="font-semibold">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <a href={url} download target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 bg-white/15 rounded px-3 py-1.5 text-sm hover:bg-white/25">
            <Download size={14} /> Descargar
          </a>
          <button onClick={onClose} className="bg-white/15 rounded p-1.5 hover:bg-white/25 text-xl leading-none">✕</button>
        </div>
      </div>
      <iframe src={`${url}#view=FitH`} title={title} className="flex-1 w-full border-0" />
    </div>
  );
}


// ─── Carga Mensual Tab ────────────────────────────────────────────────────────
function CarregaMensualTab({ costData, selectedMes, selectedAny, onRefresh }) {
  const existing = costData.find(r => r.mes === selectedMes && r.any === selectedAny);
  const [form, setForm] = useState({
    nomines: '', costos_operacionals: '', altres_costos: '',
    notes_costos: '', ingressos_totals: '', notes_vendes: '',
    ingressos_per_article: '{}', exclusives_vendes: '[]', exclusives_count_per_article: '{}',
  });
  const [pdfNomines, setPdfNomines] = useState(null);
  const [pdfVendes, setPdfVendes] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewTitle, setPreviewTitle] = useState('');

  // PDF extraction state — vendes
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const [extractedRows, setExtractedRows] = useState([]); // [{article, exclusives, ingressos, preu_unitari}]
  const [extractedTotal, setExtractedTotal] = useState('');
  const [showExtracted, setShowExtracted] = useState(false);
  const [savingHistoric, setSavingHistoric] = useState(false);
  const [savedHistoric, setSavedHistoric] = useState(false);

  // PDF extraction state — nomines
  const [extractingNomines, setExtractingNomines] = useState(false);
  const [extractNominesError, setExtractNominesError] = useState('');
  const [extractedOperaris, setExtractedOperaris] = useState([]);
  const [extractedSalariTotal, setExtractedSalariTotal] = useState('');
  const [extractedDescTotal, setExtractedDescTotal] = useState('');
  const [extractedNetTotal, setExtractedNetTotal] = useState('');
  const [showExtractedNomines, setShowExtractedNomines] = useState(false);
  const [savingNomines, setSavingNomines] = useState(false);
  const [savedNomines, setSavedNomines] = useState(false);
  const [extractedCotEmpresaTotal, setExtractedCotEmpresaTotal] = useState('');
  const [extractedCostEmpresaTotal, setExtractedCostEmpresaTotal] = useState('');

  // Diagnostics
  const [nominesWarnings, setNominesWarnings] = useState([]);
  const [vendesWarnings, setVendesWarnings] = useState([]);
  const [nominesDebug, setNominesDebug] = useState([]);
  const [vendesDebug, setVendesDebug] = useState([]);
  const [showDebug, setShowDebug] = useState(false);

  // Vendes PDF preview
  const [vendesPdfPreviewUrl, setVendesPdfPreviewUrl] = useState(null);
  const vendesInputRef = useRef(null);
  const [savingVendes, setSavingVendes] = useState(false);
  const [savedVendes, setSavedVendes] = useState(false);

  useEffect(() => {
    if (existing) {
      setForm({
        nomines: existing.nomines || '',
        costos_operacionals: existing.costos_operacionals || '',
        altres_costos: existing.altres_costos || '',
        notes_costos: existing.notes_costos || '',
        ingressos_totals: existing.ingressos_totals || '',
        notes_vendes: existing.notes_vendes || '',
        ingressos_per_article: JSON.stringify(existing.ingressos_per_article || {}, null, 2),
        exclusives_vendes: JSON.stringify(existing.exclusives_vendes || [], null, 2),
        exclusives_count_per_article: JSON.stringify(existing.exclusives_count_per_article || {}, null, 2),
      });
    } else {
      setForm({ nomines: '', costos_operacionals: '', altres_costos: '', notes_costos: '', ingressos_totals: '', notes_vendes: '', ingressos_per_article: '{}', exclusives_vendes: '[]', exclusives_count_per_article: '{}' });
    }
    setSaved(false);
  }, [existing, selectedMes, selectedAny]);

  // Reset extraction only when the selected period changes
  useEffect(() => {
    setShowExtracted(false);
    setExtractedRows([]);
    setSavedHistoric(false);
  }, [selectedMes, selectedAny]);

  // Revoke blob URL on cleanup
  useEffect(() => () => { if (vendesPdfPreviewUrl) URL.revokeObjectURL(vendesPdfPreviewUrl); }, [vendesPdfPreviewUrl]);

  const totalCostos = (parseFloat(form.nomines)||0) + (parseFloat(form.costos_operacionals)||0) + (parseFloat(form.altres_costos)||0);

  const openExistingPdf = (fieldName) => {
    if (!existing) return;
    const fileVal = existing[fieldName];
    if (!fileVal) return;
    const url = pb.files.getURL(existing, fileVal);
    setPreviewTitle(fieldName === 'pdf_nomines' ? 'PDF Nòmines' : 'PDF Vendes');
    setPreviewUrl(url);
  };

  const handleNominesPdfChange = async (file) => {
    setPdfNomines(file);
    setShowExtractedNomines(false);
    setExtractNominesError('');
    setExtractedOperaris([]);
    setSavedNomines(false);
    if (!file) return;
    setExtractingNomines(true);
    try {
      const result = await extractNominesPdf(file);
      setNominesWarnings(result.warnings || []);
      setNominesDebug(result.debugLines || []);
      setExtractedOperaris(result.operaris.length > 0 ? result.operaris : [{ nom: '', cognom: '', salari_brut: '', cotitzacions_empresa: '', cost_empresa: '', descomptes: '', salari_net: '' }]);
      setExtractedCotEmpresaTotal(result.cotEmpresaTotal > 0 ? String(result.cotEmpresaTotal) : '');
      setExtractedCostEmpresaTotal(result.costEmpresaTotal > 0 ? String(result.costEmpresaTotal) : '');
      setExtractedSalariTotal(result.salariTotal > 0 ? String(result.salariTotal) : '');
      setExtractedDescTotal(result.descTotal > 0 ? String(result.descTotal) : '');
      setExtractedNetTotal(result.netTotal > 0 ? String(result.netTotal) : '');
      setShowExtractedNomines(true);
      // Auto-fill nòmines cost field with coste empresa (brut + cotitzacions empresa)
      const costToUse = result.costEmpresaTotal > 0 ? result.costEmpresaTotal : result.salariTotal;
      if (!form.nomines && costToUse > 0) {
        setForm(f => ({ ...f, nomines: String(costToUse) }));
      }
    } catch (e) {
      console.error(e);
      setExtractNominesError('No s\'ha pogut extreure el contingut del PDF. Introduïu les dades manualment.');
    } finally {
      setExtractingNomines(false);
    }
  };

  const saveNomines = async () => {
    const errs = validateOperaris(extractedOperaris);
    const resum = `${extractedOperaris.length} operaris · Brut ${fmt(extractedOperaris.reduce((s, o) => s + (parseFloat(o.salari_brut) || 0), 0))} · Cost empresa ${fmt(extractedOperaris.reduce((s, o) => s + (parseFloat(o.cost_empresa) || 0), 0))} · Net ${fmt(extractedOperaris.reduce((s, o) => s + (parseFloat(o.salari_net) || 0), 0))}`;
    const msg = errs.length
      ? `S'han detectat ${errs.length} avisos de validació:\n\n${errs.slice(0, 8).map(e => `· ${e.name}: ${e.errors.join('; ')}`).join('\n')}\n\nDesar igualment?\n\n${resum}`
      : `Confirmeu desar les nòmines de ${MONTHS[selectedMes - 1]} ${selectedAny}?\n\n${resum}`;
    if (!window.confirm(msg)) return;
    setSavingNomines(true);
    try {
      const computedCotEmpresa = parseFloat(extractedCotEmpresaTotal) || extractedOperaris.reduce((s, o) => s + (parseFloat(o.cotitzacions_empresa) || 0), 0);
      const computedCostEmpresa = parseFloat(extractedCostEmpresaTotal) || extractedOperaris.reduce((s, o) => s + (parseFloat(o.cost_empresa) || 0), 0);
      const data = {
        mes: selectedMes,
        any: selectedAny,
        operaris: JSON.stringify(extractedOperaris),
        salari_total: parseFloat(extractedSalariTotal) || extractedOperaris.reduce((s, o) => s + (parseFloat(o.salari_brut) || 0), 0),
        descomptes_totals: parseFloat(extractedDescTotal) || extractedOperaris.reduce((s, o) => s + (parseFloat(o.descomptes) || 0), 0),
        net_total: parseFloat(extractedNetTotal) || extractedOperaris.reduce((s, o) => s + (parseFloat(o.salari_net) || 0), 0),
        cotizaciones_empresa_total: computedCotEmpresa,
        coste_empresa_total: computedCostEmpresa,
        num_operaris: extractedOperaris.length,
        data_carga: new Date().toISOString().slice(0, 10),
      };
      const existing_nom = await pb.collection('nominas_mensuales').getFullList({
        filter: pb.filter('mes = {:m} && any = {:y}', { m: selectedMes, y: selectedAny }),
        requestKey: 'nom-check',
      });
      if (existing_nom.length > 0) {
        await pb.collection('nominas_mensuales').update(existing_nom[0].id, data);
      } else {
        await pb.collection('nominas_mensuales').create(data);
      }
      setSavedNomines(true);
    } catch (e) {
      console.error(e);
      alert('Error en desar nòmines: ' + e.message);
    } finally {
      setSavingNomines(false);
    }
  };

  const handleVendesPdfChange = async (file) => {
    setPdfVendes(file);
    setShowExtracted(false);
    setExtractError('');
    setExtractedRows([]);
    setExtractedTotal('');
    setVendesWarnings([]);
    setSavedHistoric(false);
    setSavedVendes(false);
    if (vendesPdfPreviewUrl) URL.revokeObjectURL(vendesPdfPreviewUrl);
    if (file) {
      setVendesPdfPreviewUrl(URL.createObjectURL(file));
      await runExtraction(file);
    } else {
      setVendesPdfPreviewUrl(null);
    }
  };

  const runExtraction = async (file) => {
    setExtracting(true);
    setExtractError('');
    try {
      const result = await extractVendesPdf(file);
      setVendesWarnings(result.warnings || []);
      setVendesDebug(result.debugLines || []);
      const computePreuUnitari = (ing, excl) => {
        const i = parseFloat(ing) || 0;
        const e = parseInt(excl) || 0;
        return e > 0 ? Math.round((i / e) * 100) / 100 : '';
      };
      const rows = (result.rows || []).map(r => ({
        article: r.article,
        exclusives: r.exclusives !== '' ? String(r.exclusives) : '',
        ingressos: r.ingressos !== '' ? String(r.ingressos) : '',
        preu_unitari: r.exclusives && r.ingressos ? String(computePreuUnitari(r.ingressos, r.exclusives)) : '',
      }));
      setExtractedRows(rows.length ? rows : [{ article: '', exclusives: '', ingressos: '', preu_unitari: '' }]);
      setExtractedTotal(result.maxNum > 0 ? String(result.maxNum) : '');
      setShowExtracted(true);

      // Auto-fill ingressos_totals if empty
      if (!form.ingressos_totals && result.maxNum > 0) {
        setForm(f => ({ ...f, ingressos_totals: String(result.maxNum) }));
      }
    } catch (e) {
      console.error(e);
      setExtractError('No s\'ha pogut extreure automàticament el contingut del PDF. Podeu introduir o corregir les dades a la taula.');
      setExtractedRows([{ article: '', exclusives: '', ingressos: '', preu_unitari: '' }]);
      setShowExtracted(true);
    } finally {
      setExtracting(false);
    }
  };

  const applyExtractedToForm = () => {
    const ingPerArt = {};
    const countPerArt = {};
    for (const row of extractedRows) {
      if (row.article && row.ingressos) ingPerArt[row.article] = parseFloat(row.ingressos) || 0;
      if (row.article && row.exclusives) countPerArt[row.article] = parseInt(row.exclusives) || 0;
    }
    const totalFromRows = Object.values(ingPerArt).reduce((s, v) => s + v, 0);
    const totalExFromRows = Object.values(countPerArt).reduce((s, v) => s + v, 0);
    setForm(f => ({
      ...f,
      ingressos_per_article: JSON.stringify(ingPerArt, null, 2),
      ingressos_totals: f.ingressos_totals || (totalFromRows > 0 ? String(totalFromRows) : extractedTotal),
      exclusives_count_per_article: JSON.stringify(countPerArt, null, 2),
    }));
    // Note: totalExFromRows used below in save
  };

  const saveVendes = async () => {
    const errs = validateArticles(extractedRows);
    const totEx = extractedRows.reduce((s, r) => s + (parseInt(r.exclusives) || 0), 0);
    const totIng = extractedRows.reduce((s, r) => s + (parseFloat(r.ingressos) || 0), 0);
    const resum = `${extractedRows.filter(r => r.article).length} articles · ${totEx} exclusives · ${fmt(totIng)} · promig ${totEx > 0 ? fmt(totIng / totEx) : '—'}`;
    const msg = errs.length
      ? `S'han detectat ${errs.length} avisos de validació:\n\n${errs.slice(0, 8).map(e => `· ${e.name}: ${e.errors.join('; ')}`).join('\n')}\n\nDesar igualment?\n\n${resum}`
      : `Confirmeu desar les vendes de ${MONTHS[selectedMes - 1]} ${selectedAny}?\n\n${resum}`;
    if (!window.confirm(msg)) return;
    setSavingVendes(true);
    try {
      const ingPerArt = {};
      const countPerArt = {};
      for (const row of extractedRows) {
        if (!row.article) continue;
        ingPerArt[row.article] = parseFloat(row.ingressos) || 0;
        countPerArt[row.article] = parseInt(row.exclusives) || 0;
      }
      const totalIng = Object.values(ingPerArt).reduce((s, v) => s + v, 0) || parseFloat(extractedTotal) || 0;

      const fd = new FormData();
      fd.append('mes', selectedMes);
      fd.append('any', selectedAny);
      fd.append('ingressos_totals', totalIng);
      fd.append('ingressos_per_article', JSON.stringify(ingPerArt));
      fd.append('exclusives_count_per_article', JSON.stringify(countPerArt));
      if (pdfVendes) fd.append('pdf_vendes', pdfVendes);
      if (existing) {
        await pb.collection('costes_mensuales').update(existing.id, fd);
      } else {
        await pb.collection('costes_mensuales').create(fd);
      }
      setForm(f => ({
        ...f,
        ingressos_totals: String(totalIng),
        ingressos_per_article: JSON.stringify(ingPerArt, null, 2),
        exclusives_count_per_article: JSON.stringify(countPerArt, null, 2),
      }));
      setSavedVendes(true);
      onRefresh();
    } catch (e) {
      console.error(e);
      alert('Error en desar vendes: ' + e.message);
    } finally {
      setSavingVendes(false);
    }
  };

  const saveToHistoric = async () => {
    setSavingHistoric(true);
    try {
      const ingPerArt = {};
      const countPerArt = {};
      for (const row of extractedRows) {
        if (row.article && row.ingressos) ingPerArt[row.article] = parseFloat(row.ingressos) || 0;
        if (row.article && row.exclusives) countPerArt[row.article] = parseInt(row.exclusives) || 0;
      }
      const totalEx = extractedRows.reduce((s, r) => s + (parseInt(r.exclusives) || 0), 0);
      const totalIng = parseFloat(extractedTotal) || Object.values(ingPerArt).reduce((s, v) => s + v, 0);

      const data = {
        mes: selectedMes,
        any: selectedAny,
        exclusives_totals: totalEx || null,
        exclusives_per_article: JSON.stringify(countPerArt),
        ingressos_totals: totalIng,
        ingressos_per_article: JSON.stringify(ingPerArt),
        font: 'csv',
      };

      // Check if already exists in ventas_historicas
      const existing_vh = await pb.collection('ventas_historicas').getFullList({
        filter: pb.filter('mes = {:m} && any = {:y}', { m: selectedMes, y: selectedAny }),
        requestKey: 'vh-check',
      });

      if (existing_vh.length > 0) {
        await pb.collection('ventas_historicas').update(existing_vh[0].id, data);
      } else {
        await pb.collection('ventas_historicas').create(data);
      }
      setSavedHistoric(true);
    } catch (e) {
      console.error(e);
      alert('Error en desar a historial: ' + e.message);
    } finally {
      setSavingHistoric(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('mes', selectedMes);
      fd.append('any', selectedAny);
      fd.append('nomines', parseFloat(form.nomines)||0);
      fd.append('costos_operacionals', parseFloat(form.costos_operacionals)||0);
      fd.append('altres_costos', parseFloat(form.altres_costos)||0);
      fd.append('total_costos', totalCostos);
      fd.append('notes_costos', form.notes_costos);
      fd.append('ingressos_totals', parseFloat(form.ingressos_totals)||0);
      fd.append('notes_vendes', form.notes_vendes);
      try { fd.append('ingressos_per_article', form.ingressos_per_article); } catch(_) { fd.append('ingressos_per_article', '{}'); }
      try { fd.append('exclusives_vendes', form.exclusives_vendes); } catch(_) { fd.append('exclusives_vendes', '[]'); }
      if (form.exclusives_count_per_article) {
        try { fd.append('exclusives_count_per_article', form.exclusives_count_per_article); } catch(_) {}
      }
      if (pdfNomines) fd.append('pdf_nomines', pdfNomines);
      if (pdfVendes) fd.append('pdf_vendes', pdfVendes);

      if (existing) {
        await pb.collection('costes_mensuales').update(existing.id, fd);
      } else {
        await pb.collection('costes_mensuales').create(fd);
      }
      setSaved(true);
      setPdfNomines(null);
      onRefresh();
    } catch (e) {
      console.error(e);
      alert('Error en desar: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const inp = 'border border-gray-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30';

  return (
    <div className="space-y-6 max-w-5xl">
      {previewUrl && <PdfPreviewModal url={previewUrl} title={previewTitle} onClose={() => setPreviewUrl(null)} />}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-blue-800 text-sm flex items-start gap-2">
        <FileText size={16} className="mt-0.5 shrink-0" />
        <span>Dades per <strong>{MONTHS[selectedMes-1]} {selectedAny}</strong>. Pengeu el PDF de vendes per extreure les dades automàticament o introduïu-les manualment. {existing ? '✓ Ja hi ha dades per aquest mes.' : 'Encara no hi ha dades per aquest mes.'}</span>
      </div>

      {/* PDF Upload Zone */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2"><Upload size={18} className="text-[#1e3a5f]" />Documents PDF</h3>

        {/* Nomines PDF — with extraction */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">PDF de Nòmines — Extracció automàtica</p>
          <SingleFileDrop
            file={pdfNomines}
            onFile={handleNominesPdfChange}
            onClear={() => { setPdfNomines(null); setShowExtractedNomines(false); setExtractedOperaris([]); }}
            accept="application/pdf"
            label="Arrastra el PDF de nòmines aquí"
            hint="S'extrauran automàticament: operaris, salaris bruts, descomptes i nets · Màx. 50 MB"
          />
          {!pdfNomines && existing?.pdf_nomines && (
            <button
              className="mt-2 flex items-center gap-1.5 text-xs text-[#1e3a5f] border border-[#1e3a5f]/30 rounded-lg px-3 py-1.5 hover:bg-[#1e3a5f]/5"
              onClick={() => openExistingPdf('pdf_nomines')}
            >
              <Eye size={12} /> Veure PDF actual
            </button>
          )}
          {extractingNomines && (
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3 text-blue-800 text-sm">
              <RefreshCw size={16} className="animate-spin shrink-0" />
              Extraient dades del PDF de nòmines...
            </div>
          )}
          {extractNominesError && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 mt-3 text-amber-800 text-sm">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{extractNominesError}</span>
            </div>
          )}
          {showExtractedNomines && extractedOperaris.length > 0 && (
            <div className="border border-blue-200 rounded-xl bg-blue-50/60 p-5 space-y-4 mt-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-blue-800 flex items-center gap-2">
                  <CheckCircle size={16} /> Dades extretes del PDF de nòmines
                </h4>
                <button
                  onClick={saveNomines}
                  disabled={savingNomines}
                  className="flex items-center gap-1.5 bg-[#1e3a5f] text-white text-xs px-3 py-1.5 rounded-lg hover:bg-[#2d5a8e] disabled:opacity-50 transition"
                >
                  {savingNomines ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
                  {savedNomines ? '✓ Desat a N\u00f2mines' : 'Desar a N\u00f2mines'}
                </button>
              </div>
              {/* Extraction summary */}
              <div className="bg-white/70 rounded-lg p-3 text-xs text-blue-900 flex flex-wrap gap-4">
                <span>Operaris detectats: <strong>{extractedOperaris.length}</strong></span>
                <span>Brut total: <strong>{fmt(extractedOperaris.reduce((s, o) => s + (parseFloat(o.salari_brut) || 0), 0))}</strong></span>
                <span>Cotitz. empresa: <strong>{fmt(extractedOperaris.reduce((s, o) => s + (parseFloat(o.cotitzacions_empresa) || 0), 0))}</strong></span>
                <span>Cost empresa: <strong>{fmt(extractedOperaris.reduce((s, o) => s + (parseFloat(o.cost_empresa) || 0), 0))}</strong></span>
                <span>Descomptes: <strong>{fmt(extractedOperaris.reduce((s, o) => s + (parseFloat(o.descomptes) || 0), 0))}</strong></span>
                <span>Net total: <strong>{fmt(extractedOperaris.reduce((s, o) => s + (parseFloat(o.salari_net) || 0), 0))}</strong></span>
              </div>
              {nominesWarnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-xs space-y-1">
                  <p className="font-semibold flex items-center gap-1"><AlertCircle size={12} /> Avisos d'extracció ({nominesWarnings.length}):</p>
                  {nominesWarnings.slice(0, 8).map((w, i) => <p key={i}>· {w}</p>)}
                </div>
              )}
              {/* Validation summary */}
              {extractedOperaris.length > 0 && (() => {
                const validationErrors = validateOperaris(extractedOperaris);
                if (validationErrors.length === 0) return null;
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-xs space-y-1">
                    <p className="font-semibold flex items-center gap-1"><AlertCircle size={12} /> Inconsistències detectades:</p>
                    {validationErrors.map(r => (
                      <p key={r.i}>· {r.name || `Fila ${r.i + 1}`}: {r.errors.join('; ')}</p>
                    ))}
                  </div>
                );
              })()}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-blue-200">
                      <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Nom</th>
                      <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Cognom</th>
                      <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Brut</th>
                      <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Cotitz. Empresa</th>
                      <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Cost Empresa</th>
                      <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Descomptes</th>
                      <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Net</th>
                      <th className="py-2 px-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {extractedOperaris.map((op, i) => {
                      const brut = parseFloat(op.salari_brut) || 0;
                      const cot = parseFloat(op.cotitzacions_empresa) || 0;
                      const cost = parseFloat(op.cost_empresa) || 0;
                      const desc = parseFloat(op.descomptes) || 0;
                      const net = parseFloat(op.salari_net) || 0;
                      const costOk = cost === 0 || Math.abs(cost - (brut + cot)) < 0.5;
                      const netOk = net === 0 || Math.abs(net - (brut - desc)) < 0.5;
                      const upd = (field, val) => setExtractedOperaris(ops => ops.map((o, j) => j === i ? { ...o, [field]: val } : o));
                      const inp = "border border-gray-200 rounded px-2 py-1 text-sm w-24 bg-white";
                      return (
                        <tr key={i} className={`border-b border-blue-100 last:border-0 ${!costOk || !netOk ? 'bg-amber-50/40' : ''}`}>
                          <td className="py-1.5 px-2"><input className="border border-gray-200 rounded px-2 py-1 text-sm w-20 bg-white" value={op.nom} onChange={e => upd('nom', e.target.value)} placeholder="Nom" /></td>
                          <td className="py-1.5 px-2"><input className="border border-gray-200 rounded px-2 py-1 text-sm w-28 bg-white" value={op.cognom || ''} onChange={e => upd('cognom', e.target.value)} placeholder="Cognom" /></td>
                          <td className="py-1.5 px-2"><input type="number" className={inp} value={op.salari_brut} onChange={e => { upd('salari_brut', e.target.value); }} placeholder="0.00" /></td>
                          <td className="py-1.5 px-2"><input type="number" className={inp} value={op.cotitzacions_empresa || ''} onChange={e => { upd('cotitzacions_empresa', e.target.value); }} placeholder="0.00" /></td>
                          <td className="py-1.5 px-2">
                            <input type="number" className={inp + (!costOk ? ' border-amber-400' : '')} value={op.cost_empresa || ''} onChange={e => upd('cost_empresa', e.target.value)} placeholder="0.00" />
                          </td>
                          <td className="py-1.5 px-2"><input type="number" className={inp} value={op.descomptes} onChange={e => upd('descomptes', e.target.value)} placeholder="0.00" /></td>
                          <td className="py-1.5 px-2">
                            <input type="number" className={inp + (!netOk ? ' border-amber-400' : '')} value={op.salari_net} onChange={e => upd('salari_net', e.target.value)} placeholder="0.00" />
                          </td>
                          <td className="py-1.5 px-2">
                            <button onClick={() => setExtractedOperaris(ops => ops.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 transition">
                              <XCircle size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={() => setExtractedOperaris(ops => [...ops, { nom: '', cognom: '', salari_brut: '', cotitzacions_empresa: '', cost_empresa: '', descomptes: '', salari_net: '' }])}
                  className="text-xs text-[#1e3a5f] border border-[#1e3a5f]/30 rounded px-2.5 py-1 hover:bg-[#1e3a5f]/5 transition">
                  + Afegir operari
                </button>
                <div className="flex items-center gap-2 ml-auto flex-wrap">
                  {[
                    ['Brut total', extractedSalariTotal, setExtractedSalariTotal],
                    ['Cotitz. empresa', extractedCotEmpresaTotal, setExtractedCotEmpresaTotal],
                    ['Cost empresa', extractedCostEmpresaTotal, setExtractedCostEmpresaTotal],
                    ['Descomptes', extractedDescTotal, setExtractedDescTotal],
                    ['Net total', extractedNetTotal, setExtractedNetTotal],
                  ].map(([label, val, setter]) => (
                    <div key={label} className="flex items-center gap-1">
                      <span className="text-xs text-gray-500">{label}:</span>
                      <input type="number" className="border border-gray-200 rounded px-2 py-1 text-xs w-24 bg-white"
                        value={val} onChange={e => setter(e.target.value)} placeholder="0.00" />
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={() => setShowDebug(d => !d)} className="text-xs text-gray-500 underline">
                {showDebug ? 'Ocultar' : 'Veure'} text extret del PDF (debug)
              </button>
              {showDebug && (
                <pre className="max-h-48 overflow-auto bg-gray-900 text-gray-100 text-[10px] rounded-lg p-3 whitespace-pre-wrap">{nominesDebug.join('\n')}</pre>
              )}
            </div>
          )}
        </div>

        {/* Vendes PDF */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">PDF de Vendes — Extracció automàtica</p>
          {pdfVendes && (
            <div className="flex flex-wrap items-center gap-3 mb-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-sm">
              <FileText size={16} className="text-emerald-700 shrink-0" />
              <span className="font-medium text-emerald-900 truncate max-w-[16rem]">{pdfVendes.name}</span>
              <span className="text-xs text-emerald-700">{(pdfVendes.size / 1024 / 1024).toFixed(2)} MB</span>
              <span className="text-xs px-2 py-0.5 rounded bg-white text-emerald-700 border border-emerald-200">
                {extracting ? 'Extraient…' : extractError ? 'Extracció parcial' : 'Carregat'}
              </span>
              <div className="flex gap-2 ml-auto">
                <button onClick={() => vendesInputRef.current?.click()} className="text-xs border border-emerald-300 text-emerald-800 rounded px-2.5 py-1 hover:bg-white transition">Canviar</button>
                <button onClick={() => handleVendesPdfChange(null)} className="text-xs border border-red-200 text-red-600 rounded px-2.5 py-1 hover:bg-white transition">Eliminar</button>
              </div>
              <input ref={vendesInputRef} type="file" accept="application/pdf" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleVendesPdfChange(f); }} />
            </div>
          )}
          <SingleFileDrop
            file={pdfVendes}
            onFile={handleVendesPdfChange}
            onClear={() => { setPdfVendes(null); setVendesPdfPreviewUrl(null); setShowExtracted(false); setExtractedRows([]); }}
            accept="application/pdf"
            label="Arrastra el PDF de vendes aquí"
            hint="S'extrauran automàticament: articles, exclusives i ingressos · Màx. 50 MB"
          />
          {!pdfVendes && existing?.pdf_vendes && (
            <button
              className="mt-2 flex items-center gap-1.5 text-xs text-[#1e3a5f] border border-[#1e3a5f]/30 rounded-lg px-3 py-1.5 hover:bg-[#1e3a5f]/5"
              onClick={() => openExistingPdf('pdf_vendes')}
            >
              <Eye size={12} /> Veure PDF actual
            </button>
          )}
        </div>

        {/* Extraction status */}
        {extracting && (
          <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg p-3 text-blue-800 text-sm">
            <RefreshCw size={16} className="animate-spin shrink-0" />
            Extraient dades del PDF de vendes...
          </div>
        )}
        {extractError && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-sm">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{extractError}</span>
          </div>
        )}

        {/* Extracted data preview */}
        {showExtracted && extractedRows.length > 0 && (
          <div className="border border-emerald-200 rounded-xl bg-emerald-50/60 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-emerald-800 flex items-center gap-2">
                <CheckCircle size={16} /> Dades extretes del PDF de vendes
              </h4>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={saveVendes}
                  disabled={savingVendes}
                  className="flex items-center gap-1.5 bg-emerald-700 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-emerald-800 disabled:opacity-50 transition"
                >
                  {savingVendes ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
                  {savedVendes ? '✓ Desat a Vendes' : 'Desar a Vendes'}
                </button>
                <button
                  onClick={applyExtractedToForm}
                  className="flex items-center gap-1.5 bg-[#1e3a5f] text-white text-xs px-3 py-1.5 rounded-lg hover:bg-[#2d5a8e] transition"
                >
                  <Download size={12} /> Aplicar al formulari
                </button>
                <button
                  onClick={saveToHistoric}
                  disabled={savingHistoric}
                  className="flex items-center gap-1.5 bg-emerald-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition"
                >
                  {savingHistoric ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
                  {savedHistoric ? '✓ Desat a historial' : 'Desar a Historial Vendes'}
                </button>
              </div>
            </div>

            {/* Extracted data summary */}
            {(() => {
              const totalExRows = extractedRows.reduce((s, r) => s + (parseInt(r.exclusives) || 0), 0);
              const totalIngRows = extractedRows.reduce((s, r) => s + (parseFloat(r.ingressos) || 0), 0);
              const avgPreu = totalExRows > 0 ? totalIngRows / totalExRows : 0;
              return totalExRows > 0 || totalIngRows > 0 ? (
                <div className="bg-emerald-100/70 rounded-lg p-3 text-sm text-emerald-800 flex flex-wrap gap-4">
                  <span>Articles: <strong>{extractedRows.filter(r => r.article).length}</strong></span>
                  <span>Total exclusives: <strong>{totalExRows}</strong></span>
                  <span>Total ingressos: <strong>{fmt(totalIngRows)}</strong></span>
                  {avgPreu > 0 && <span>Preu promig/exclusiva: <strong>{fmt(avgPreu)}</strong></span>}
                </div>
              ) : null;
            })()}

            {vendesWarnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-xs space-y-1">
                <p className="font-semibold flex items-center gap-1"><AlertCircle size={12} /> Avisos d'extracció ({vendesWarnings.length}):</p>
                {vendesWarnings.slice(0, 8).map((w, i) => <p key={i}>· {w}</p>)}
              </div>
            )}
            {(() => {
              const errs = validateArticles(extractedRows);
              if (!errs.length) return null;
              return (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-xs space-y-1">
                  <p className="font-semibold flex items-center gap-1"><AlertCircle size={12} /> Validació ({errs.length}):</p>
                  {errs.slice(0, 8).map(e => <p key={e.i}>· {e.name}: {e.errors.join('; ')}</p>)}
                </div>
              );
            })()}
            <div>
              <button onClick={() => setShowDebug(d => !d)} className="text-xs text-gray-500 underline">
                {showDebug ? 'Ocultar' : 'Veure'} text extret del PDF (debug)
              </button>
              {showDebug && (
                <pre className="max-h-48 overflow-auto bg-gray-900 text-gray-100 text-[10px] rounded-lg p-3 mt-2 whitespace-pre-wrap">{vendesDebug.join('\n')}</pre>
              )}
            </div>

            {/* Editable extracted table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-emerald-200">
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase">Article</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase">Nº exclusives</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase">Ingressos (€)</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase">Preu unitari (€)</th>
                    <th className="py-2 px-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {extractedRows.map((row, i) => {
                    const excl = parseInt(row.exclusives) || 0;
                    const ing = parseFloat(row.ingressos) || 0;
                    const calcPreu = excl > 0 && ing > 0 ? (ing / excl).toFixed(2) : '';
                    const preuVal = row.preu_unitari !== undefined && row.preu_unitari !== '' ? row.preu_unitari : calcPreu;
                    const manualPreu = parseFloat(row.preu_unitari) || 0;
                    const expectedIng = excl > 0 && manualPreu > 0 ? excl * manualPreu : 0;
                    const inconsistent = manualPreu > 0 && ing > 0 && excl > 0 && Math.abs(expectedIng - ing) > 0.01;
                    const updateRow = (field, value) => {
                      setExtractedRows(rows => rows.map((r, j) => {
                        if (j !== i) return r;
                        const updated = { ...r, [field]: value };
                        // Auto-recalculate preu_unitari when exclusives or ingressos change
                        if (field === 'exclusives' || field === 'ingressos') {
                          const e2 = parseInt(field === 'exclusives' ? value : r.exclusives) || 0;
                          const i2 = parseFloat(field === 'ingressos' ? value : r.ingressos) || 0;
                          updated.preu_unitari = e2 > 0 && i2 > 0 ? String((i2 / e2).toFixed(2)) : '';
                        }
                        return updated;
                      }));
                    };
                    return (
                      <tr key={i} className={`border-b border-emerald-100 last:border-0 ${inconsistent ? 'bg-amber-50/50' : ''}`}>
                        <td className="py-1.5 px-2">
                          <input
                            className="border border-gray-200 rounded px-2 py-1 text-sm w-28 bg-white"
                            value={row.article}
                            onChange={e => updateRow('article', e.target.value)}
                            placeholder="R82-020"
                          />
                        </td>
                        <td className="py-1.5 px-2">
                          <input
                            type="number"
                            className="border border-gray-200 rounded px-2 py-1 text-sm w-24 bg-white"
                            value={row.exclusives}
                            onChange={e => updateRow('exclusives', e.target.value)}
                            placeholder="0"
                            min="0"
                          />
                        </td>
                        <td className="py-1.5 px-2">
                          <input
                            type="number"
                            className="border border-gray-200 rounded px-2 py-1 text-sm w-32 bg-white"
                            value={row.ingressos}
                            onChange={e => updateRow('ingressos', e.target.value)}
                            placeholder="0.00"
                            step="0.01"
                          />
                        </td>
                        <td className="py-1.5 px-2">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              className={`border rounded px-2 py-1 text-sm w-28 bg-white ${inconsistent ? 'border-amber-400' : 'border-gray-200'}`}
                              value={preuVal}
                              onChange={e => {
                                const pu = parseFloat(e.target.value) || 0;
                                setExtractedRows(rows => rows.map((r, j) => {
                                  if (j !== i) return r;
                                  // When preu_unitari is edited, recalc ingressos
                                  const e2 = parseInt(r.exclusives) || 0;
                                  const newIng = e2 > 0 ? String((e2 * pu).toFixed(2)) : r.ingressos;
                                  return { ...r, preu_unitari: e.target.value, ingressos: e2 > 0 ? newIng : r.ingressos };
                                }));
                              }}
                              placeholder="0.00"
                              step="0.01"
                            />
                            {inconsistent && <span title="Inconsistència: preu_unitari × exclusives ≠ ingressos" className="text-amber-500 text-xs">!</span>}
                          </div>
                        </td>
                        <td className="py-1.5 px-2">
                          <button
                            onClick={() => setExtractedRows(rows => rows.filter((_, j) => j !== i))}
                            className="text-gray-400 hover:text-red-500 transition"
                          >
                            <XCircle size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-emerald-200 bg-emerald-50">
                    <td className="py-2 px-3 text-xs font-bold text-gray-600 uppercase">Totals</td>
                    <td className="py-2 px-3 text-sm font-bold">{extractedRows.reduce((s, r) => s + (parseInt(r.exclusives) || 0), 0)}</td>
                    <td className="py-2 px-3 text-sm font-bold">{fmt(extractedRows.reduce((s, r) => s + (parseFloat(r.ingressos) || 0), 0))}</td>
                    <td className="py-2 px-3 text-sm font-semibold text-gray-500">
                      {(() => {
                        const tEx = extractedRows.reduce((s, r) => s + (parseInt(r.exclusives) || 0), 0);
                        const tIng = extractedRows.reduce((s, r) => s + (parseFloat(r.ingressos) || 0), 0);
                        return tEx > 0 ? `promig: ${fmt(tIng / tEx)}` : '—';
                      })()}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setExtractedRows(rows => [...rows, { article: '', exclusives: '', ingressos: '', preu_unitari: '' }])}
                className="text-xs text-[#1e3a5f] border border-[#1e3a5f]/30 rounded px-2.5 py-1 hover:bg-[#1e3a5f]/5 transition"
              >
                + Afegir article
              </button>
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs text-gray-500">Total ingressos detectat:</span>
                <input
                  type="number"
                  className="border border-gray-200 rounded px-2 py-1 text-sm w-32 bg-white"
                  value={extractedTotal}
                  onChange={e => setExtractedTotal(e.target.value)}
                  placeholder="0.00"
                />
                <span className="text-xs text-gray-400">€</span>
              </div>
            </div>

            {/* Vendes PDF preview inline */}
            {vendesPdfPreviewUrl && (
              <div className="mt-2">
                <p className="text-xs font-medium text-gray-500 mb-1">Vista prèvia del PDF:</p>
                <iframe
                  src={`${vendesPdfPreviewUrl}#view=FitH`}
                  title="PDF Vendes"
                  className="w-full h-64 border border-emerald-200 rounded-lg"
                />
              </div>
            )}
          </div>
        )}

        {/* Vendes PDF preview when no extraction data yet (just loaded) */}
        {!showExtracted && vendesPdfPreviewUrl && !extracting && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">Vista prèvia del PDF de vendes:</p>
            <iframe
              src={`${vendesPdfPreviewUrl}#view=FitH`}
              title="PDF Vendes"
              className="w-full h-64 border border-gray-200 rounded-lg"
            />
          </div>
        )}
      </div>

      {/* Costos */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2"><TrendingDown size={18} className="text-orange-500" />Costos del mes</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          {[['nomines','Nòmines (€)'],['costos_operacionals','Costos operacionals (€)'],['altres_costos','Altres costos (€)']].map(([k,label]) => (
            <div key={k}>
              <label className="text-xs font-medium text-gray-500 mb-1 block">{label}</label>
              <input type="number" className={inp} value={form[k]} onChange={e => setForm(f => ({...f,[k]:e.target.value}))} placeholder="0.00" step="0.01" min="0" />
            </div>
          ))}
        </div>
        <div className="bg-orange-50 rounded-lg p-3 text-sm font-semibold text-orange-800">Total costos: {fmt(totalCostos)}</div>
        <div className="mt-4">
          <label className="text-xs font-medium text-gray-500 mb-1 block">Notes de costos</label>
          <textarea className={inp} rows={2} value={form.notes_costos} onChange={e => setForm(f => ({...f,notes_costos:e.target.value}))} />
        </div>
      </div>

      {/* Vendes — manual entry */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="font-semibold text-gray-800 mb-1 flex items-center gap-2"><TrendingUp size={18} className="text-emerald-600" />Vendes del mes — Entrada manual</h3>
        <p className="text-xs text-gray-400 mb-4">Podeu introduir les dades aquí directament o aplicar-les des de les dades extretes del PDF de dalt.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Ingressos totals (€)</label>
            <input type="number" className={inp} value={form.ingressos_totals} onChange={e => setForm(f => ({...f,ingressos_totals:e.target.value}))} placeholder="0.00" step="0.01" min="0" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Notes de vendes</label>
            <input type="text" className={inp} value={form.notes_vendes} onChange={e => setForm(f => ({...f,notes_vendes:e.target.value}))} />
          </div>
        </div>
        <div className="mb-4">
          <label className="text-xs font-medium text-gray-500 mb-1 block">Ingressos per article (JSON: {"{\"R82-020\": 15000}"})</label>
          <textarea className={inp + ' font-mono text-xs'} rows={3} value={form.ingressos_per_article} onChange={e => setForm(f => ({...f,ingressos_per_article:e.target.value}))} />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Còdis d'exclusives en vendes (JSON array: ["EXC-001","EXC-002"])</label>
          <textarea className={inp + ' font-mono text-xs'} rows={3} value={form.exclusives_vendes} onChange={e => setForm(f => ({...f,exclusives_vendes:e.target.value}))} />
        </div>
      </div>

      <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 bg-[#1e3a5f] text-white px-6 py-2.5 rounded-lg font-medium text-sm hover:bg-[#2d5a8e] disabled:opacity-50 transition-colors">
        {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
        {saving ? 'Desant...' : saved ? '✓ Desat!' : 'Desar dades del mes'}
      </button>
    </div>
  );
}

// ─── Operaris Tab ─────────────────────────────────────────────────────────────
function OperarisTab({ selectedMes, selectedAny, costData }) {
  const [operaris, setOperaris] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('marge');
  const [sortDir, setSortDir] = useState(-1);

  const current = costData.find(r => r.mes === selectedMes && r.any === selectedAny);
  const totalCostos = current?.total_costos || 0;
  const ingressosTotals = current?.ingressos_totals || 0;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const startDate = new Date(selectedAny, selectedMes - 1, 1).toISOString();
      const endDate = new Date(selectedAny, selectedMes, 1).toISOString();

      const [registres, users] = await Promise.all([
        pb.collection('registres').getFullList({
          filter: pb.filter('inici >= {:s} && inici < {:e} && estat = "finalitzat"', { s: startDate, e: endDate }),
          fields: 'operari,temps_real_seg,exclusiva',
          requestKey: 'op-registres',
        }),
        pb.collection('users').getFullList({ filter: 'rol = "operari"', fields: 'id,name,codi', requestKey: 'op-users' }),
      ]);

      const byOp = {};
      for (const r of registres) {
        if (!r.operari) continue;
        if (!byOp[r.operari]) byOp[r.operari] = { seg: 0, exclusives: new Set() };
        byOp[r.operari].seg += r.temps_real_seg || 0;
        if (r.exclusiva) byOp[r.operari].exclusives.add(r.exclusiva);
      }

      const totalSeg = Object.values(byOp).reduce((s, v) => s + v.seg, 0);

      const rows = users.map(u => {
        const d = byOp[u.id] || { seg: 0, exclusives: new Set() };
        const costProp = totalSeg > 0 ? (d.seg / totalSeg) * totalCostos : 0;
        const ingProp = totalSeg > 0 ? (d.seg / totalSeg) * ingressosTotals : 0;
        const marge = ingProp - costProp;
        const margePct = ingProp > 0 ? (marge / ingProp) * 100 : 0;
        return {
          id: u.id, name: u.name || u.codi || u.id,
          seg: d.seg, exclusives: d.exclusives.size,
          cost: costProp, ingressos: ingProp,
          marge, margePct,
        };
      }).filter(r => r.seg > 0);

      rows.sort((a, b) => (b[sortBy] - a[sortBy]) * sortDir);
      setOperaris(rows);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [selectedMes, selectedAny, totalCostos, ingressosTotals, sortBy, sortDir]);

  useEffect(() => { load(); }, [load]);

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => -d);
    else { setSortBy(col); setSortDir(-1); }
  };

  const th = 'px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-[#1e3a5f] select-none';
  const td = 'px-3 py-3 text-sm';

  return (
    <div className="space-y-4">
      {!current && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-sm flex items-center gap-2">
          <AlertCircle size={16}/> Sense dades de costos/ingressos per aquest mes.
        </div>
      )}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Anàlisi per operari — {MONTHS[selectedMes-1]} {selectedAny}</h3>
          <button onClick={load} className="text-gray-400 hover:text-[#1e3a5f] transition-colors"><RefreshCw size={16}/></button>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-400">Carregant...</div>
        ) : operaris.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Sense dades de registres per aquest mes.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className={th}>#</th>
                  <th className={th}>Operari</th>
                  <th className={th + (sortBy==='exclusives'?' text-[#1e3a5f]':'')} onClick={() => toggleSort('exclusives')}>Exclusives ↕</th>
                  <th className={th}>Temps</th>
                  <th className={th + (sortBy==='cost'?' text-[#1e3a5f]':'')} onClick={() => toggleSort('cost')}>Cost ↕</th>
                  <th className={th + (sortBy==='ingressos'?' text-[#1e3a5f]':'')} onClick={() => toggleSort('ingressos')}>Ingressos ↕</th>
                  <th className={th + (sortBy==='marge'?' text-[#1e3a5f]':'')} onClick={() => toggleSort('marge')}>Marge ↕</th>
                  <th className={th + (sortBy==='margePct'?' text-[#1e3a5f]':'')} onClick={() => toggleSort('margePct')}>Marge % ↕</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {operaris.map((op, i) => (
                  <tr key={op.id} className="hover:bg-gray-50">
                    <td className={td}>
                      <span className={`w-6 h-6 rounded-full inline-flex items-center justify-center text-xs font-bold ${i===0?'bg-yellow-100 text-yellow-700':i===1?'bg-gray-100 text-gray-600':i===2?'bg-orange-50 text-orange-600':'text-gray-400'}`}>{i+1}</span>
                    </td>
                    <td className={td + ' font-medium'}>{op.name}</td>
                    <td className={td}>{op.exclusives}</td>
                    <td className={td + ' text-gray-500'}>{Math.round(op.seg/3600)}h</td>
                    <td className={td}>{fmt(op.cost)}</td>
                    <td className={td}>{fmt(op.ingressos)}</td>
                    <td className={td + (op.marge>=0?' text-emerald-700 font-semibold':' text-red-600 font-semibold')}>{fmt(op.marge)}</td>
                    <td className={td}>
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${op.margePct>=30?'bg-emerald-100 text-emerald-700':op.margePct>=0?'bg-blue-50 text-blue-700':'bg-red-100 text-red-700'}`}>
                        {fmtPct(op.margePct)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {operaris.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Marge per operari</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={operaris} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
              <Tooltip formatter={(v) => fmt(v)} />
              <Bar dataKey="marge" name="Marge" radius={[0,4,4,0]}>
                {operaris.map((op, i) => <Cell key={i} fill={op.marge >= 0 ? '#10b981' : '#ef4444'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─── Exclusives Costs Tab ─────────────────────────────────────────────────────
function ExclusivesTab({ selectedMes, selectedAny, costData }) {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const current = costData.find(r => r.mes === selectedMes && r.any === selectedAny);
  const totalCostos = current?.total_costos || 0;
  const ingressosPerArticle = current?.ingressos_per_article || {};

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const startDate = new Date(selectedAny, selectedMes - 1, 1).toISOString();
      const endDate = new Date(selectedAny, selectedMes, 1).toISOString();
      const exclusives = await pb.collection('exclusives').getFullList({
        filter: pb.filter('created >= {:s} && created < {:e}', { s: startDate, e: endDate }),
        fields: 'id,exclusiva,article,estat',
        requestKey: 'ex-list',
      });

      const byArticle = {};
      for (const ex of exclusives) {
        const art = ex.article || 'Sense article';
        if (!byArticle[art]) byArticle[art] = { exclusives: 0, completades: 0 };
        byArticle[art].exclusives++;
        if (['entregada','finalitzada','lista_recollida'].includes(ex.estat)) byArticle[art].completades++;
      }

      const total = exclusives.length || 1;
      const rows = Object.entries(byArticle).map(([art, d]) => {
        const ingressos = ingressosPerArticle[art] || (d.exclusives / total) * (current?.ingressos_totals || 0);
        const cost = (d.exclusives / total) * totalCostos;
        const marge = ingressos - cost;
        return { article: art, exclusives: d.exclusives, completades: d.completades, ingressos, cost, marge, margePct: ingressos > 0 ? (marge/ingressos)*100 : 0 };
      }).sort((a,b) => b.marge - a.marge);

      setArticles(rows);
    } catch(e) { console.error(e); } finally { setLoading(false); }
  }, [selectedMes, selectedAny, totalCostos, current]);

  useEffect(() => { load(); }, [load]);

  const td = 'px-3 py-3 text-sm';

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Rentabilitat per article — {MONTHS[selectedMes-1]} {selectedAny}</h3>
        </div>
        {loading ? <div className="p-8 text-center text-gray-400">Carregant...</div> : articles.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Sense exclusives per aquest mes.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  {['Article','Exclusives','Completades','Ingressos','Costos','Marge','Marge %'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {articles.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className={td + ' font-medium'}>{row.article}</td>
                    <td className={td}>{row.exclusives}</td>
                    <td className={td}>{row.completades}</td>
                    <td className={td}>{fmt(row.ingressos)}</td>
                    <td className={td}>{fmt(row.cost)}</td>
                    <td className={td + (row.marge>=0?' text-emerald-700 font-semibold':' text-red-600 font-semibold')}>{fmt(row.marge)}</td>
                    <td className={td}>
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${row.margePct>=30?'bg-emerald-100 text-emerald-700':row.margePct>=0?'bg-blue-50 text-blue-700':'bg-red-100 text-red-700'}`}>
                        {fmtPct(row.margePct)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Incidències Costs Tab ────────────────────────────────────────────────────
function IncidenciesCostsTab() {
  const [data, setData] = useState({ exclusives: [], stats: null });
  const [loading, setLoading] = useState(true);
  const [filterEstat, setFilterEstat] = useState('all');
  const [filterNC, setFilterNC] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [exclusives, nc] = await Promise.all([
        pb.collection('exclusives').getFullList({ fields: 'id,exclusiva,article,estat', requestKey: 'inc-ex' }),
        pb.collection('no_conformitats').getFullList({ fields: 'exclusiva,gravetat,estat', requestKey: 'inc-nc' }),
      ]);

      const ncByEx = {};
      for (const n of nc) {
        if (!n.exclusiva) continue;
        if (!ncByEx[n.exclusiva]) ncByEx[n.exclusiva] = [];
        ncByEx[n.exclusiva].push(n);
      }

      const rows = exclusives.map(ex => ({
        ...ex,
        nInc: (ncByEx[ex.id] || []).length,
        ncCritica: (ncByEx[ex.id] || []).some(n => n.gravetat === 'critica'),
        ncAlta: (ncByEx[ex.id] || []).some(n => n.gravetat === 'alta'),
      }));

      const totals = rows.length;
      const completades = rows.filter(r => ['entregada','lista_recollida','finalitzada'].includes(r.estat)).length;
      const ambNC = rows.filter(r => r.nInc > 0).length;
      setData({ exclusives: rows, stats: { totals, completades, ambNC, sensNC: totals - ambNC } });
    } catch(e) { console.error(e); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = data.exclusives
    .filter(r => filterEstat === 'all' || r.estat === filterEstat)
    .filter(r => filterNC === 'all' || (filterNC === 'amb' ? r.nInc > 0 : r.nInc === 0));

  const s = data.stats;
  const td = 'px-3 py-3 text-sm';

  return (
    <div className="space-y-5">
      {s && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Total exclusives" value={s.totals} icon={Package} color="primary" />
          <KpiCard label="Completades" value={s.completades} sub={fmtPct(s.totals>0?(s.completades/s.totals)*100:0)} icon={CheckCircle} color="green" />
          <KpiCard label="Amb incidències" value={s.ambNC} sub={fmtPct(s.totals>0?(s.ambNC/s.totals)*100:0)} icon={AlertTriangle} color="orange" />
          <KpiCard label="Sense incidències" value={s.sensNC} icon={CheckCircle} color="green" />
        </div>
      )}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap gap-3 items-center">
          <h3 className="font-semibold text-gray-800 mr-auto">Exclusives amb NC</h3>
          <select value={filterEstat} onChange={e => setFilterEstat(e.target.value)} className="border border-gray-200 rounded px-2 py-1.5 text-xs">
            <option value="all">Tots els estats</option>
            {['recibida','pendent','en_curs','finalitzada','lista_recollida','entregada','retrasada','bloquejada'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterNC} onChange={e => setFilterNC(e.target.value)} className="border border-gray-200 rounded px-2 py-1.5 text-xs">
            <option value="all">Totes</option>
            <option value="amb">Amb NC</option>
            <option value="sense">Sense NC</option>
          </select>
        </div>
        {loading ? <div className="p-8 text-center text-gray-400">Carregant...</div> : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {['Codi','Article','Estat','# NC','Gravetat'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(ex => (
                  <tr key={ex.id} className={`hover:bg-gray-50 ${ex.ncCritica?'bg-red-50/30':''}`}>
                    <td className={td + ' font-mono font-medium'}>{ex.exclusiva}</td>
                    <td className={td}>{ex.article || '—'}</td>
                    <td className={td}>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${ex.estat==='entregada'?'bg-emerald-100 text-emerald-700':ex.estat==='en_curs'?'bg-blue-100 text-blue-700':ex.estat==='bloquejada'?'bg-red-100 text-red-700':'bg-gray-100 text-gray-600'}`}>
                        {ex.estat}
                      </span>
                    </td>
                    <td className={td}>
                      {ex.nInc > 0 ? <span className={`font-semibold ${ex.nInc>3?'text-red-600':ex.nInc>1?'text-orange-600':'text-gray-700'}`}>{ex.nInc}</span> : <span className="text-gray-300">0</span>}
                    </td>
                    <td className={td}>
                      {ex.ncCritica && <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-semibold mr-1">Crítica</span>}
                      {ex.ncAlta && !ex.ncCritica && <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs font-semibold">Alta</span>}
                      {!ex.ncCritica && !ex.ncAlta && ex.nInc > 0 && <span className="text-gray-400 text-xs">Baixa/Mitja</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Verificació Tab ──────────────────────────────────────────────────────────
function VerificacioTab({ costData, selectedMes, selectedAny }) {
  const [exSistema, setExSistema] = useState([]);
  const [loading, setLoading] = useState(true);

  const current = costData.find(r => r.mes === selectedMes && r.any === selectedAny);
  const exVendes = Array.isArray(current?.exclusives_vendes) ? current.exclusives_vendes : [];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await pb.collection('exclusives').getFullList({ fields: 'id,exclusiva,estat,article', requestKey: 'ver-ex' });
      setExSistema(rows);
    } catch(e) { console.error(e); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const sistemaCodis = new Set(exSistema.map(e => e.exclusiva));
  const vendesCodis = new Set(exVendes.map(String));
  const enVendesNoSistema = exVendes.filter(c => !sistemaCodis.has(c));
  const enSistemaNoVendes = exVendes.length > 0 ? exSistema.filter(e => !vendesCodis.has(e.exclusiva)) : [];
  const coincideixen = exVendes.filter(c => sistemaCodis.has(c));

  const td = 'px-3 py-2.5 text-sm';

  return (
    <div className="space-y-5">
      {!current && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-800 text-sm flex items-center gap-2">
          <AlertCircle size={16}/> Carregueu les dades del mes per poder comparar les exclusives.
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm text-center">
          <p className="text-3xl font-bold text-[#1e3a5f]">{exSistema.length}</p>
          <p className="text-xs text-gray-500 mt-1">Exclusives al sistema</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm text-center">
          <p className="text-3xl font-bold text-emerald-600">{exVendes.length}</p>
          <p className="text-xs text-gray-500 mt-1">Exclusives al PDF de vendes</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm text-center">
          <p className={`text-3xl font-bold ${enVendesNoSistema.length + enSistemaNoVendes.length > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
            {enVendesNoSistema.length + enSistemaNoVendes.length}
          </p>
          <p className="text-xs text-gray-500 mt-1">Discrepàncies</p>
        </div>
      </div>
      {enVendesNoSistema.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-red-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-red-100 bg-red-50 flex items-center gap-2">
            <XCircle size={16} className="text-red-500" />
            <h3 className="font-semibold text-red-700 text-sm">En vendes però NO al sistema ({enVendesNoSistema.length})</h3>
          </div>
          <div className="p-4 flex flex-wrap gap-2">
            {enVendesNoSistema.map((c, i) => (
              <span key={i} className="px-2 py-1 bg-red-50 text-red-700 border border-red-200 rounded text-xs font-mono">{c}</span>
            ))}
          </div>
        </div>
      )}
      {exVendes.length > 0 && enSistemaNoVendes.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-amber-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-amber-100 bg-amber-50 flex items-center gap-2">
            <AlertCircle size={16} className="text-amber-500" />
            <h3 className="font-semibold text-amber-700 text-sm">Al sistema però NO en vendes ({enSistemaNoVendes.length})</h3>
          </div>
          <div className="overflow-x-auto max-h-60 overflow-y-auto">
            <table className="w-full">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {['Codi','Article','Estat'].map(h => <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {enSistemaNoVendes.map(ex => (
                  <tr key={ex.id} className="hover:bg-gray-50">
                    <td className={td + ' font-mono font-medium'}>{ex.exclusiva}</td>
                    <td className={td}>{ex.article || '—'}</td>
                    <td className={td}><span className="text-xs text-gray-500">{ex.estat}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {exVendes.length > 0 && coincideixen.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-center gap-2 text-emerald-800 text-sm">
          <CheckCircle size={16} className="shrink-0" />
          {coincideixen.length} exclusives coincideixen entre el sistema i el PDF de vendes.
        </div>
      )}
      {exVendes.length === 0 && (
        <div className="text-center text-gray-400 text-sm py-8">
          Carregueu els codis d'exclusives del PDF de vendes a «Carga Mensual» per poder fer la comparació.
        </div>
      )}
    </div>
  );
}

// ─── Vendes Analisi Tab ───────────────────────────────────────────────────────
function VendesAnalisiTab({ costData, selectedMes, selectedAny }) {
  const current = costData.find(r => r.mes === selectedMes && r.any === selectedAny);
  const prevMonth = selectedMes === 1
    ? costData.find(r => r.mes === 12 && r.any === selectedAny - 1)
    : costData.find(r => r.mes === selectedMes - 1 && r.any === selectedAny);

  const ingPerArt = current?.ingressos_per_article || {};
  const prevIngPerArt = prevMonth?.ingressos_per_article || {};
  const countPerArt = current?.exclusives_count_per_article || {};
  const prevCountPerArt = prevMonth?.exclusives_count_per_article || {};

  // Build article distribution with preu_unitari
  const articles = Object.entries(ingPerArt)
    .map(([art, ing]) => {
      const ingNum = Number(ing) || 0;
      const count = Number(countPerArt[art]) || 0;
      const preuUnitari = count > 0 ? ingNum / count : 0;
      return { article: art, ingressos: ingNum, exclusives: count, preuUnitari };
    })
    .sort((a, b) => b.ingressos - a.ingressos);

  const totalIng = current?.ingressos_totals || 0;
  const prevTotalIng = prevMonth?.ingressos_totals || 0;
  const totalExclusives = articles.reduce((s, a) => s + a.exclusives, 0);
  const avgPreuUnitari = totalExclusives > 0 ? totalIng / totalExclusives : 0;
  const diffIng = totalIng - prevTotalIng;

  // Build 12-month evolution
  const trend = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(selectedAny, selectedMes - 1 - i, 1);
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    const rec = costData.find(r => r.mes === m && r.any === y);
    trend.push({ label: monthLabel(m, y), Ingressos: rec?.ingressos_totals || 0 });
    const artObj = rec?.ingressos_per_article || {};
    const entry = trend[trend.length - 1];
    for (const [art, val] of Object.entries(artObj)) {
      entry[art] = Number(val) || 0;
    }
  }

  const artColors = ['#1e3a5f', '#f97316', '#10b981', '#6366f1', '#f59e0b', '#ef4444'];
  const allArts = [...new Set(trend.flatMap(t => Object.keys(t).filter(k => k !== 'label' && k !== 'Ingressos')))];

  return (
    <div className="space-y-6">
      {!current && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-800 text-sm flex items-center gap-2">
          <AlertCircle size={18} /> No hi ha dades de vendes per {MONTHS[selectedMes - 1]} {selectedAny}.
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Ingressos totals" value={fmt(totalIng)} sub={monthLabel(selectedMes, selectedAny)} color="primary" icon={TrendingUp} />
        <KpiCard label="Nº exclusives" value={totalExclusives || '—'} sub={totalExclusives > 0 ? `${articles.length} articles` : 'Sense dades'} color="orange" icon={Package} />
        <KpiCard label="Preu promig/exclusiva" value={avgPreuUnitari > 0 ? fmt(avgPreuUnitari) : '—'} sub="Ingressos ÷ exclusives" color="primary" icon={DollarSign} />
        <KpiCard label="vs mes anterior" value={`${diffIng >= 0 ? '+' : ''}${fmt(diffIng)}`} sub={prevTotalIng > 0 ? `${((diffIng / prevTotalIng) * 100).toFixed(1)}%` : '—'} color={diffIng >= 0 ? 'green' : 'red'} icon={BarChart2} />
      </div>

      {articles.length > 0 && (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">Ingressos per article — {MONTHS[selectedMes - 1]} {selectedAny}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    {['Article', 'Nº exclusives', 'Ingressos', 'Preu unitari', '% del total', 'vs mes ant.'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {articles.map((row, i) => {
                    const pct = totalIng > 0 ? (row.ingressos / totalIng) * 100 : 0;
                    const prev = Number(prevIngPerArt[row.article]) || 0;
                    const prevCount = Number(prevCountPerArt[row.article]) || 0;
                    const prevPreu = prevCount > 0 ? prev / prevCount : 0;
                    const diff = row.ingressos - prev;
                    return (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-mono font-medium">{row.article}</td>
                        <td className="px-4 py-3 text-sm">{row.exclusives > 0 ? row.exclusives : <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-3 text-sm font-semibold">{fmt(row.ingressos)}</td>
                        <td className="px-4 py-3 text-sm">
                          {row.preuUnitari > 0 ? (
                            <span className="font-semibold text-[#1e3a5f]">{fmt(row.preuUnitari)}
                              {prevPreu > 0 && (
                                <span className={`ml-1 text-xs ${row.preuUnitari >= prevPreu ? 'text-emerald-600' : 'text-red-500'}`}>
                                  {row.preuUnitari >= prevPreu ? '▲' : '▼'}
                                </span>
                              )}
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-100 rounded-full h-1.5 max-w-20">
                              <div className="bg-[#1e3a5f] h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs">{pct.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {prev > 0 ? (
                            <span className={diff >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                              {diff >= 0 ? '▲' : '▼'} {fmt(Math.abs(diff))}
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-800 mb-4">Evolució ingressos per article — últims 12 mesos</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={v => fmt(v)} />
                <Legend />
                {allArts.length > 0
                  ? allArts.map((art, i) => <Bar key={art} dataKey={art} stackId="a" fill={artColors[i % artColors.length]} radius={i === allArts.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]} />)
                  : <Bar dataKey="Ingressos" fill="#1e3a5f" radius={[3, 3, 0, 0]} />
                }
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Marges Tab ───────────────────────────────────────────────────────────────
function MargesTab({ costData, selectedMes, selectedAny }) {
  const current = costData.find(r => r.mes === selectedMes && r.any === selectedAny);
  const prevMonth = selectedMes === 1
    ? costData.find(r => r.mes === 12 && r.any === selectedAny - 1)
    : costData.find(r => r.mes === selectedMes - 1 && r.any === selectedAny);

  const ing = current?.ingressos_totals || 0;
  const cost = current?.total_costos || 0;
  const marge = ing - cost;
  const margePct = ing > 0 ? (marge / ing) * 100 : 0;

  const prevIng = prevMonth?.ingressos_totals || 0;
  const prevCost = prevMonth?.total_costos || 0;
  const prevMarge = prevIng - prevCost;
  const prevMargePct = prevIng > 0 ? (prevMarge / prevIng) * 100 : 0;

  const diffMarge = marge - prevMarge;

  // 12-month data
  const trend = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(selectedAny, selectedMes - 1 - i, 1);
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    const rec = costData.find(r => r.mes === m && r.any === y);
    const rIng = rec?.ingressos_totals || 0;
    const rCost = rec?.total_costos || 0;
    trend.push({
      label: monthLabel(m, y),
      Ingressos: rIng,
      Costos: rCost,
      Marge: rIng - rCost,
      'Marge %': rIng > 0 ? Math.round(((rIng - rCost) / rIng) * 100) : 0,
    });
  }

  // Article margins
  const ingPerArt = current?.ingressos_per_article || {};
  const articles = Object.entries(ingPerArt).map(([art, artIng]) => {
    const artIngNum = Number(artIng) || 0;
    const artCost = ing > 0 ? (artIngNum / ing) * cost : 0;
    const artMarge = artIngNum - artCost;
    const artMargePct = artIngNum > 0 ? (artMarge / artIngNum) * 100 : 0;
    return { article: art, ingressos: artIngNum, cost: artCost, marge: artMarge, margePct: artMargePct };
  }).sort((a, b) => b.marge - a.marge);

  return (
    <div className="space-y-6">
      {!current && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-800 text-sm flex items-center gap-2">
          <AlertCircle size={18} /> Carregueu les dades del mes per veure els marges.
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Ingressos" value={fmt(ing)} sub={monthLabel(selectedMes, selectedAny)} color="primary" icon={TrendingUp} />
        <KpiCard label="Costos totals" value={fmt(cost)} sub="Nòmines + operacionals" color="orange" icon={TrendingDown} />
        <KpiCard label="Marge brut" value={fmt(marge)} sub={`${fmtPct(margePct)} del ingrés`} color={marge >= 0 ? 'green' : 'red'} icon={DollarSign} />
        <KpiCard label="vs mes anterior" value={`${diffMarge >= 0 ? '+' : ''}${fmt(diffMarge)}`}
          sub={prevMarge !== 0 ? `Ant: ${fmt(prevMarge)} (${fmtPct(prevMargePct)})` : 'Sense dades ant.'}
          color={diffMarge >= 0 ? 'green' : 'red'} icon={BarChart2} />
      </div>

      {/* Summary comparison */}
      {current && prevMonth && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Comparativa {MONTHS[selectedMes - 1]} {selectedAny} vs mes anterior</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            {[
              { label: 'Ingressos', curr: ing, prev: prevIng },
              { label: 'Costos', curr: cost, prev: prevCost },
              { label: 'Marge brut', curr: marge, prev: prevMarge },
              { label: 'Marge %', curr: margePct, prev: prevMargePct, isPct: true },
            ].map(({ label, curr, prev, isPct }) => {
              const diff = curr - prev;
              const pct = prev !== 0 ? (diff / Math.abs(prev)) * 100 : 0;
              const isPositive = label === 'Costos' ? diff <= 0 : diff >= 0;
              return (
                <div key={label} className="border border-gray-100 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">{label}</p>
                  <p className="font-semibold">{isPct ? fmtPct(curr) : fmt(curr)}</p>
                  <p className="text-xs text-gray-400">Ant: {isPct ? fmtPct(prev) : fmt(prev)}</p>
                  <p className={`text-xs font-semibold mt-1 ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
                    {diff >= 0 ? '▲' : '▼'} {isPct ? `${Math.abs(diff).toFixed(1)}pp` : fmt(Math.abs(diff))} ({Math.abs(pct).toFixed(1)}%)
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 12-month bar chart */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-800 mb-4">Evolució ingressos, costos i marge — últims 12 mesos</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={v => fmt(v)} />
            <Legend />
            <Bar dataKey="Ingressos" fill="#1e3a5f" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Costos" fill="#f97316" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Marge" radius={[3, 3, 0, 0]}>
              {trend.map((d, i) => <Cell key={i} fill={d.Marge >= 0 ? '#10b981' : '#ef4444'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Marge % line chart */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-800 mb-4">Evolució marge % — últims 12 mesos</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
            <Tooltip formatter={v => `${v}%`} />
            <Line type="monotone" dataKey="Marge %" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Per article margin */}
      {articles.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800">Rentabilitat per article — {MONTHS[selectedMes - 1]} {selectedAny}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  {['Article', 'Ingressos', 'Costos', 'Marge', 'Marge %'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {articles.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono font-medium">{row.article}</td>
                    <td className="px-4 py-3 text-sm">{fmt(row.ingressos)}</td>
                    <td className="px-4 py-3 text-sm">{fmt(row.cost)}</td>
                    <td className={`px-4 py-3 text-sm font-semibold ${row.marge >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{fmt(row.marge)}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${row.margePct >= 30 ? 'bg-emerald-100 text-emerald-700' : row.margePct >= 0 ? 'bg-blue-50 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                        {fmtPct(row.margePct)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Admin wrapper tabs ───────────────────────────────────────────────────────
function AdminPanelTab({ prodData }) {
  const { exclusives, monos, registres } = prodData;
  return <Panel exclusives={exclusives} monos={monos} registres={registres} />;
}

function EnViuTab({ prodData }) {
  const { monos, exclusives, opsDef, operaris, registres } = prodData;
  return <DashboardEnViu monos={monos} registres={registres} exclusives={exclusives} opsDef={opsDef || []} operaris={operaris} />;
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SuperAdminPage() {
  const { user, logout } = useAuth();
  const { noLlegits: chatNoLlegits } = useChatCalidadNoLlegits();
  const [activeTab, setActiveTab] = useState('en_viu');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [selectedMes, setSelectedMes] = useState(new Date().getMonth() + 1);
  const [selectedAny, setSelectedAny] = useState(new Date().getFullYear());
  const [costData, setCostData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Sidebar state (mirrors Admin)
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try { return localStorage.getItem('superadmin_sidebar') !== 'false'; } catch { return true; }
  });
  const [expandedGroups, setExpandedGroups] = useState(() => {
    return new Set(['finances_group', 'dashboard_group', 'producto_group']);
  });

  // Action history (Super Admin monitoring/interventions)
  const [actionLog, setActionLog] = useState(() => {
    try { return JSON.parse(localStorage.getItem('superadmin_action_log') || '[]'); } catch { return []; }
  });
  const [showActionLog, setShowActionLog] = useState(false);

  const logAction = useCallback((action) => {
    setActionLog((prev) => {
      const entry = { ts: new Date().toISOString(), action };
      const next = [entry, ...prev].slice(0, 50);
      try { localStorage.setItem('superadmin_action_log', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // Production data for embedded role views
  const { exclusives, monos, registres, rutes, operaris, opsDef, articles, carregant: prodCarregant, recarrega } = useProduccio();

  const loadCostData = useCallback(async () => {
    try {
      const records = await pb.collection('costes_mensuales').getFullList({ sort: '-any,-mes', requestKey: 'cost-all' });
      setCostData(records);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCostData(); }, [loadCostData]);

  const years = [];
  for (let y = new Date().getFullYear(); y >= 2024; y--) years.push(y);

  const prodData = { exclusives, monos, registres, rutes, operaris, opsDef, articles };

  const toggleSidebar = () => {
    setSidebarOpen((v) => {
      const next = !v;
      try { localStorage.setItem('superadmin_sidebar', String(next)); } catch {}
      return next;
    });
  };

  const toggleGroup = (groupId) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const selectTab = (id) => {
    setActiveTab(id);
    setMobileNavOpen(false);
    NAV.forEach((g) => {
      if (g.items.some((i) => i.id === id)) {
        setExpandedGroups((prev) => new Set([...prev, g.id]));
      }
    });
    if (VIEW_AS[id]) {
      logAction(`Inició monitorización: Ver como ${VIEW_AS[id].label}`);
    }
  };

  const financeTabs = ['dashboard','carga','operaris','exclusives_costs','verificacio'];
  const showMonthYear = financeTabs.includes(activeTab);

  // ── View-as-role: full-screen monitoring with banner ──
  if (VIEW_AS[activeTab]) {
    const { label, Comp } = VIEW_AS[activeTab];
    const backToSuperAdmin = () => {
      logAction('Volvió al panel de Super Admin');
      setActiveTab('dashboard');
    };
    return (
      <div className="flex min-h-[100dvh] flex-col">
        <Helmet>
          <title>Super Admin — Viendo como {label}</title>
          <meta name="description" content={`Monitorización en vivo: Super Admin viendo la pantalla de ${label} en tiempo real.`} />
        </Helmet>
        {/* Monitoring banner */}
        <div className="shrink-0 bg-primary text-primary-foreground shadow-lg">
          <div className="stripe-top h-1.5" />
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={backToSuperAdmin}
                className="flex items-center gap-1.5 rounded-md bg-white/15 px-3 py-1.5 text-sm font-semibold hover:bg-white/25 active:scale-95 transition">
                <ArrowLeft className="h-4 w-4" /> Volver a Super Admin
              </button>
              <div className="flex items-center gap-2 min-w-0">
                <Monitor className="h-5 w-5 text-[hsl(var(--accent))] shrink-0" />
                <div className="min-w-0">
                  <p className="font-display text-xl uppercase leading-none truncate">Viendo como {label}</p>
                  <p className="text-xs text-white/70 truncate">Monitorización en vivo · {user?.name || user?.email}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Quick switch between roles */}
              <select
                value={activeTab}
                onChange={e => selectTab(e.target.value)}
                className="bg-white/15 border border-white/20 text-white text-sm rounded-md px-2 py-1.5">
                {VIEW_AS_TABS.map(t => <option key={t} value={t} className="text-gray-800">Ver como {VIEW_AS[t].label}</option>)}
              </select>
              <button onClick={() => setShowActionLog(v => !v)}
                className="flex items-center gap-1.5 rounded-md bg-white/15 px-3 py-1.5 text-sm font-semibold hover:bg-white/25 active:scale-95 transition">
                <History className="h-4 w-4" /> Historial
              </button>
            </div>
          </div>
          {showActionLog && (
            <div className="border-t border-white/10 bg-primary/95 px-4 py-3 max-h-56 overflow-y-auto">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/60 mb-2">Historial de acciones — Super Admin</p>
              {actionLog.length === 0 ? (
                <p className="text-xs text-white/50">Sin acciones registradas.</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {actionLog.map((a, i) => (
                    <li key={i} className="flex items-start gap-2 text-white/80">
                      <span className="text-white/40 font-mono shrink-0">{new Date(a.ts).toLocaleString('es-ES')}</span>
                      <span>{a.action}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        {/* Embedded role page — full height, own scroll */}
        <div className="flex-1 overflow-y-auto bg-gray-50">
          {activeTab === 'ver_qualitat' ? <Comp hideUnidadesTab /> : <Comp />}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <Helmet>
        <title>Super Admin — Onatex</title>
        <meta name="description" content="Dashboard complet per a Super Admin: costos, marges, producció, qualitat i forecast de recursos." />
      </Helmet>

      {/* Top header */}
      <header className="bg-primary text-primary-foreground shrink-0">
        <div className="stripe-top h-1.5" />
        <div className="flex items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white/15 active:scale-95"
              aria-label="Abrir menú"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Logo size="sm" />
            <div className="min-w-0">
              <p className="font-display text-xl sm:text-2xl uppercase leading-none truncate">Super Admin</p>
              <p className="text-xs text-white/70 truncate">Onatex · {user?.name || user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Month/Year selector (only for finance tabs) */}
            {showMonthYear && (
              <div className="hidden sm:flex items-center gap-2">
                <select value={selectedMes} onChange={e => setSelectedMes(Number(e.target.value))}
                  className="bg-white/15 border border-white/20 text-white text-sm rounded px-2 py-1.5">
                  {MONTHS.map((m, i) => <option key={i+1} value={i+1} className="text-gray-800">{m}</option>)}
                </select>
                <select value={selectedAny} onChange={e => setSelectedAny(Number(e.target.value))}
                  className="bg-white/15 border border-white/20 text-white text-sm rounded px-2 py-1.5">
                  {years.map(y => <option key={y} value={y} className="text-gray-800">{y}</option>)}
                </select>
              </div>
            )}
            <span className="hidden sm:flex items-center gap-1 rounded-md bg-white/15 px-2 py-1 text-xs font-semibold">
              <Wifi className="h-3.5 w-3.5" /> Tiempo real
            </span>
            <NotificationsBell />
            <button onClick={recarrega} className="rounded-md bg-white/15 p-2 active:scale-95" aria-label="Actualizar">
              <RefreshCcw className="h-4 w-4" />
            </button>
            <button onClick={logout} className="rounded-md bg-white/15 p-2 active:scale-95" aria-label="Salir">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Mobile backdrop */}
        {mobileNavOpen && (
          <div
            className="lg:hidden fixed inset-0 z-40 bg-black/60"
            onClick={() => setMobileNavOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`shrink-0 overflow-y-auto bg-primary flex flex-col transition-all duration-200 ease-in-out
            ${mobileNavOpen ? 'fixed inset-y-0 left-0 z-50 w-64 lg:static' : 'hidden lg:flex'}
            ${sidebarOpen ? 'lg:w-56' : 'lg:w-14'}`}
          style={{ minWidth: sidebarOpen ? '14rem' : '3.5rem' }}
        >
          <div className={`flex shrink-0 border-b border-white/10 ${sidebarOpen ? 'lg:justify-end px-2 py-2 justify-between' : 'justify-center py-2'}`}>
            <button
              onClick={() => setMobileNavOpen(false)}
              className="lg:hidden flex h-8 w-8 items-center justify-center rounded-md text-white/60 hover:text-white hover:bg-white/10"
              aria-label="Cerrar menú"
            >
              <X className="h-4 w-4" />
            </button>
            <button
              onClick={toggleSidebar}
              title={sidebarOpen ? 'Esconder menú' : 'Mostrar menú'}
              className="hidden lg:flex h-8 w-8 items-center justify-center rounded-md text-white/60 hover:text-white hover:bg-white/10 transition"
            >
              {sidebarOpen
                ? <PanelLeftClose className="h-4 w-4" />
                : <PanelLeftOpen className="h-4 w-4" />}
            </button>
          </div>

          <nav className={`flex flex-col gap-1 p-2 pt-3 flex-1 ${sidebarOpen ? 'overflow-y-auto' : 'overflow-visible'}`}>
            {(sidebarOpen || mobileNavOpen)
              ? NAV.map((group) => (
                  <SidebarGroup
                    key={group.id}
                    group={group}
                    activeTab={activeTab}
                    onSelect={selectTab}
                    expanded={expandedGroups.has(group.id)}
                    onToggle={() => toggleGroup(group.id)}
                    chatNoLlegits={chatNoLlegits}
                  />
                ))
              : NAV.map((group) => (
                  <IconFlyout
                    key={group.id}
                    group={group}
                    activeTab={activeTab}
                    onSelect={selectTab}
                    chatNoLlegits={chatNoLlegits}
                  />
                ))
            }
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-5 md:p-6 bg-gray-50">
          {loading && ['dashboard','carga','operaris','exclusives_costs','incidencies_costs','verificacio'].includes(activeTab) ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm gap-2">
              <RefreshCw size={18} className="animate-spin" /> Carregant...
            </div>
          ) : (
            <>
              {/* Finances tabs */}
              {activeTab === 'dashboard' && <DashboardTab costData={costData} selectedMes={selectedMes} selectedAny={selectedAny} />}
              {activeTab === 'carga' && <CarregaMensualTab costData={costData} selectedMes={selectedMes} selectedAny={selectedAny} onRefresh={loadCostData} />}
              {activeTab === 'nomines' && <NominesAnalisi selectedMes={selectedMes} selectedAny={selectedAny} />}
              {activeTab === 'vendes_analisi' && <VendesAnalisiTab costData={costData} selectedMes={selectedMes} selectedAny={selectedAny} />}
              {activeTab === 'marges' && <MargesTab costData={costData} selectedMes={selectedMes} selectedAny={selectedAny} />}
              {activeTab === 'operaris' && <OperarisTab selectedMes={selectedMes} selectedAny={selectedAny} costData={costData} />}
              {activeTab === 'exclusives_costs' && <ExclusivesTab selectedMes={selectedMes} selectedAny={selectedAny} costData={costData} />}
              {activeTab === 'incidencies_costs' && <IncidenciesCostsTab />}
              {activeTab === 'verificacio' && <VerificacioTab costData={costData} selectedMes={selectedMes} selectedAny={selectedAny} />}
              {activeTab === 'ventas_historicas' && <VentasHistoricas />}

              {/* Dashboard tabs */}
              {activeTab === 'panel_admin' && <AdminPanelTab prodData={prodData} />}
              {activeTab === 'hoy' && <PanelHoy />}
              {activeTab === 'en_viu' && <EnViuTab prodData={prodData} />}

              {/* Producto tabs */}
              {activeTab === 'exclusives_admin' && (
                <Exclusives exclusives={exclusives} monos={monos} registres={registres} rutes={rutes} articles={articles} opsDef={opsDef} operaris={operaris} recarrega={recarrega} />
              )}
              {/* detalle_ex tab removed — detail now opens as panel inside exclusives_admin tab */}
              {activeTab === 'analisi_article' && <AnalisiArticle />}
              {activeTab === 'importar' && <Importar rutes={rutes} exclusives={exclusives} articles={articles} recarrega={recarrega} />}
              {activeTab === 'carga_masiva' && <CargaMasiva rutes={rutes} exclusives={exclusives} articles={articles} recarrega={recarrega} />}
              {activeTab === 'rutes' && <Rutes rutes={rutes} articles={articles} recarrega={recarrega} />}
              {activeTab === 'ruta_r82020' && <RutaDinamica rutaNom="Ruta R82-020 UNIC PLUS SUIT" />}
              {activeTab === 'articles' && <Articles articles={articles} rutes={rutes} exclusives={exclusives} recarrega={recarrega} />}

              {/* Producción tabs */}
              {activeTab === 'gestio_ops' && <GestioOperacions />}
              {activeTab === 'kanban' && <KanbanExclusives />}
              {activeTab === 'trazabilitat' && <Trazabilitat registres={registres} monos={monos} />}
              {activeTab === 'fases_ext' && <FasesExternalizadas />}
              {activeTab === 'encargos' && <EncargosExternos />}
              {activeTab === 'proveedores' && <ProveedoresExternalizados />}
              {activeTab === 'forecast' && <ForecastRecursos />}

              {/* Calidad tabs */}
              {activeTab === 'recogida' && <Recogida />}
              {activeTab === 'entregas' && <ReportEntregues />}
              {activeTab === 'metriques_qc' && <MetriquesQC />}
              {activeTab === 'incidencies_full' && <LlistatIncidencies />}
              {activeTab === 'propuestas' && <PropuestasMejora />}
              {activeTab === 'retrabajos' && <RetrabajosDashboard />}
              {activeTab === 'chat_calidad' && <ChatCalidad />}

              {/* Administración tabs */}
              {activeTab === 'usuaris' && <Usuaris operaris={operaris} recarrega={recarrega} />}
              {activeTab === 'contrasenyes' && <Contrasenyes />}
              {activeTab === 'nova_incidencia' && <NovaIncidencia />}
              {activeTab === 'carga_incidencies' && <CargaMasivaIncidencies />}
              {activeTab === 'registro_horario' && <RegistroHorario />}
              {activeTab === 'informe_tiempos' && <InformeTiempos />}
              {activeTab === 'informe_operari' && <InformeOperari />}
              {activeTab === 'calendari' && <CalendariLaboral />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

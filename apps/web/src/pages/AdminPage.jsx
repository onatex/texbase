import React, { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import {
  BarChart2, ChevronDown, ChevronLeft, ChevronRight,
  LayoutDashboard, LogOut, Menu, Package, PanelLeftClose, PanelLeftOpen,
  RefreshCcw, Settings, Shield, Users, Wifi, X,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import useProduccio from '@/hooks/useProduccio';
import Panel from '@/components/admin/Panel';
import PanelHoy from '@/components/admin/PanelHoy';
import Importar from '@/components/admin/Importar';
import CargaMasiva from '@/components/admin/CargaMasiva';
import { Exclusives, Rutes, Trazabilitat, Articles, Usuaris } from '@/components/admin/Seccions';
import RutaDetall from '@/components/admin/RutaDetall';
import DashboardEnViu from '@/components/admin/DashboardEnViu';
import Recogida from '@/components/admin/Recogida';
import ReportEntregues from '@/components/admin/ReportEntregues';
import GestioOperacions from '@/components/admin/GestioOperacions';
import MetriquesQC from '@/components/admin/MetriquesQC';
import LlistatIncidencies from '@/components/admin/LlistatIncidencies';
import RegistroHorario from '@/components/admin/RegistroHorario';
import CargaMasivaIncidencies from '@/components/admin/CargaMasivaIncidencies';
import NovaIncidencia from '@/components/admin/NovaIncidencia';
import Logo from '@/components/Logo';
import NotificationsBell from '@/components/common/NotificationsBell';
import ForecastRecursos from '@/components/ForecastRecursos';
import KanbanExclusives from '@/components/admin/KanbanExclusives';
import CalendariLaboral from '@/components/admin/CalendariLaboral';
import VentasHistoricas from '@/components/admin/VentasHistoricas';
import FasesExternalizadas from '@/components/admin/FasesExternalizadas';
import PropuestasMejora from '@/components/admin/PropuestasMejora';
import RetrabajosDashboard from '@/components/admin/RetrabajosDashboard';
import ProveedoresExternalizados from '@/components/admin/ProveedoresExternalizados';
import EncargosExternos from '@/components/admin/EncargosExternos';
import Contrasenyes from '@/components/admin/Contrasenyes';
import InformeTiempos from '@/components/admin/InformeTiempos';
import InformeOperari from '@/components/admin/InformeOperari';

import ExclusivaDetall from '@/components/admin/ExclusivaDetall';
import AnalisiArticle from '@/components/admin/AnalisiArticle';
import pb from '@/lib/pocketbaseClient';

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

// ─── Nav structure ────────────────────────────────────────────────────────────
const NAV = [
  {
    id: 'dashboard_group',
    label: 'Dashboard',
    icon: LayoutDashboard,
    items: [
      { id: 'live', label: 'En vivo' },
      { id: 'kanban', label: 'Kanban' },
      { id: 'panel', label: 'Panel' },
      { id: 'hoy', label: 'Hoy' },
      { id: 'informe_tiempos', label: 'Informe tiempos' },
      { id: 'informe_operari', label: 'Informe operario' },
    ],
  },
  {
    id: 'producto_group',
    label: 'Producto',
    icon: Package,
    items: [
      { id: 'exclusives', label: 'Exclusivas' },
      { id: 'importar', label: 'Nueva exclusiva' },
      { id: 'carga', label: 'Carga masiva' },
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
      { id: 'gestio', label: 'Gestión operaciones' },
      { id: 'analisi_article', label: 'Análisis por artículo' },
      { id: 'traza', label: 'Trazabilidad' },
      { id: 'fases_ext', label: 'Fases externalizadas' },
      { id: 'encargos', label: 'Encargos externos' },
      { id: 'proveedores', label: 'Proveedores' },
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
      { id: 'incidencies', label: 'Listado incidencias' },
      { id: 'propuestas', label: 'Propuestas de mejora' },
      { id: 'retrabajos', label: 'Retrabajos' },
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
      { id: 'forecast', label: 'Forecast recursos' },
      { id: 'calendari', label: 'Calendari laboral' },
      { id: 'ventas_historicas', label: 'Historial vendes' },
    ],
  },
];

// ─── Icon-only popup flyout ───────────────────────────────────────────────────
function IconFlyout({ group, activeTab, onSelect }) {
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
        className={`flex h-10 w-10 items-center justify-center rounded-md transition
          ${hasActive ? 'bg-white/25 text-white' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
      >
        <Icon className="h-5 w-5" />
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
                className={`w-full px-3 py-2 text-left text-sm transition
                  ${activeTab === item.id ? 'bg-white/20 text-white font-semibold' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Full sidebar group ───────────────────────────────────────────────────────
function SidebarGroup({ group, activeTab, onSelect, expanded, onToggle }) {
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
              className={`w-full rounded px-3 py-1.5 text-left text-sm transition
                ${activeTab === item.id ? 'bg-white text-primary font-semibold' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
const AdminPage = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('live');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Persist sidebar open/collapsed state
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try { return localStorage.getItem('admin_sidebar') !== 'false'; } catch { return true; }
  });
  const [expandedGroups, setExpandedGroups] = useState(() => {
    return new Set(['dashboard_group', 'producto_group', 'qualitat_group']);
  });
  const { exclusives, monos, registres, rutes, operaris, articles, controls, opsDef, carregant, error, recarrega } = useProduccio();

  const toggleSidebar = () => {
    setSidebarOpen((v) => {
      const next = !v;
      try { localStorage.setItem('admin_sidebar', String(next)); } catch {}
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
    setTab(id);
    setMobileNavOpen(false);
    NAV.forEach((g) => {
      if (g.items.some((i) => i.id === id)) {
        setExpandedGroups((prev) => new Set([...prev, g.id]));
      }
    });
  };

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <Helmet>
        <title>Administración | Control de producción de monos</title>
        <meta name="description" content="Panel de producción, calidad y dirección: planificación, cuellos de botella, trazabilidad y rutas de operaciones." />
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
              <p className="font-display text-xl sm:text-2xl uppercase leading-none truncate">Control de producción</p>
              <p className="text-xs text-white/70 truncate">Administración · {user?.name || user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:flex items-center gap-1 rounded-md bg-white/15 px-2 py-1 text-xs font-semibold">
              <Wifi className="h-3.5 w-3.5" /> Tiempo real
            </span>
            <NotificationsBell />
            <button onClick={recarrega} className="rounded-md bg-white/15 p-2 active:scale-95" aria-label="Actualizar">
              <RefreshCcw className="h-4 w-4" />
            </button>
            <button onClick={() => { logout(); navigate('/'); }} className="rounded-md bg-white/15 p-2 active:scale-95" aria-label="Salir">
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
          {/* Toggle button at top of sidebar */}
          <div className={`flex shrink-0 border-b border-white/10 ${sidebarOpen ? 'lg:justify-end px-2 py-2 justify-between' : 'justify-center py-2'}`}>
            {/* Close button — mobile only */}
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

          {/* Nav items — always expanded on mobile */}
          <nav className={`flex flex-col gap-1 p-2 pt-3 flex-1 ${sidebarOpen ? 'overflow-y-auto' : 'overflow-visible'}`}>
            {(sidebarOpen || mobileNavOpen)
              ? NAV.map((group) => (
                  <SidebarGroup
                    key={group.id}
                    group={group}
                    activeTab={tab}
                    onSelect={selectTab}
                    expanded={expandedGroups.has(group.id)}
                    onToggle={() => toggleGroup(group.id)}
                  />
                ))
              : NAV.map((group) => (
                  <IconFlyout
                    key={group.id}
                    group={group}
                    activeTab={tab}
                    onSelect={selectTab}
                  />
                ))
            }
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-5">
          {error && <p className="mb-4 rounded-md bg-destructive/10 px-4 py-3 text-destructive">{error}</p>}
          {carregant ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-lg bg-secondary" />)}
            </div>
          ) : (
            <>
              {tab === 'live' && <DashboardEnViu monos={monos} registres={registres} exclusives={exclusives} opsDef={opsDef || []} operaris={operaris} />}
              {tab === 'panel' && <Panel exclusives={exclusives} monos={monos} registres={registres} />}
              {tab === 'hoy' && <PanelHoy />}
              {tab === 'recogida' && <Recogida />}
              {tab === 'entregas' && <ReportEntregues />}
              {tab === 'gestio' && <GestioOperacions />}
              {tab === 'metriques_qc' && <MetriquesQC />}
              {tab === 'incidencies' && <LlistatIncidencies />}
              {tab === 'propuestas' && <PropuestasMejora />}
              {tab === 'retrabajos' && <RetrabajosDashboard />}
              {tab === 'importar' && <Importar rutes={rutes} exclusives={exclusives} articles={articles} recarrega={recarrega} />}
              {tab === 'carga' && <CargaMasiva rutes={rutes} exclusives={exclusives} articles={articles} recarrega={recarrega} />}
              {/* detalle_ex tab removed — detail now opens as panel inside 'exclusives' tab */}
              {tab === 'analisi_article' && <AnalisiArticle />}
              {tab === 'exclusives' && <Exclusives exclusives={exclusives} monos={monos} registres={registres} rutes={rutes} articles={articles} opsDef={opsDef} operaris={operaris} recarrega={recarrega} />}
              {tab === 'rutes' && <Rutes rutes={rutes} articles={articles} recarrega={recarrega} />}
              {tab === 'articles' && <Articles articles={articles} rutes={rutes} exclusives={exclusives} recarrega={recarrega} />}
              {tab === 'usuaris' && <Usuaris operaris={operaris} recarrega={recarrega} />}
              {tab === 'contrasenyes' && <Contrasenyes />}
              {tab === 'traza' && <Trazabilitat registres={registres} monos={monos} />}
              {tab === 'nova_incidencia' && <NovaIncidencia />}
              {tab === 'carga_incidencies' && <CargaMasivaIncidencies />}
              {tab === 'registro_horario' && <RegistroHorario />}
              {tab === 'informe_tiempos' && <InformeTiempos />}
              {tab === 'informe_operari' && <InformeOperari />}
              {tab === 'forecast' && <ForecastRecursos />}
              {tab === 'kanban' && <KanbanExclusives />}
              {tab === 'calendari' && <CalendariLaboral />}
              {tab === 'ventas_historicas' && <VentasHistoricas />}
              {tab === 'fases_ext' && <FasesExternalizadas />}
              {tab === 'encargos' && <EncargosExternos />}
              {tab === 'proveedores' && <ProveedoresExternalizados />}
              {tab === 'ruta_r82020' && <RutaDinamica rutaNom="Ruta R82-020 UNIC PLUS SUIT" />}
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default AdminPage;

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, CheckCircle2, ClipboardList, Clock, Download, Euro, Eye,
  History, Inbox, Loader2, LogOut, Package, RefreshCcw, Send, TrendingUp,
  Truck, X, Camera, MessageSquare, Check, ChevronRight,
} from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/lib/auth';
import Logo from '@/components/Logo';
import NotificationsBell from '@/components/common/NotificationsBell';
import {
  ESTADO_LABEL, ESTADO_COLOR, PROVIDER_NEXT, BANDEJA,
  metricasMensuales, euro, fmtDate, mesActualMadrid, ymMadrid,
} from '@/lib/encargosUtils';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: TrendingUp },
  { id: 'recepcion', label: 'Recepción', icon: Inbox },
  { id: 'confeccion', label: 'Confección', icon: Package },
  { id: 'listo', label: 'Listo recoger', icon: CheckCircle2 },
  { id: 'validacion', label: 'Validación', icon: Clock },
  { id: 'incidencias', label: 'Incidencias', icon: AlertTriangle },
  { id: 'historial', label: 'Historial', icon: History },
];

const MESES = ['Gener', 'Febrer', 'Març', 'Abril', 'Maig', 'Juny', 'Juliol', 'Agost', 'Setembre', 'Octubre', 'Novembre', 'Desembre'];

export default function ProviderPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('dashboard');
  const [encargos, setEncargos] = useState([]);
  const [incs, setIncs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [mesSel, setMesSel] = useState(mesActualMadrid());
  const proveedorId = user?.proveedor_id || null;
  const reload = () => setTick((t) => t + 1);

  const load = useCallback(async () => {
    if (!proveedorId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [enc, inc] = await Promise.all([
        pb.collection('encargos_externos').getFullList({
          filter: pb.filter('proveedor_id = {:pid}', { pid: proveedorId }),
          sort: '-created', expand: 'exclusiva_id,monos,encargo_origen',
          requestKey: `prov-enc-${proveedorId}-${tick}`,
        }),
        pb.collection('incidencias_externas').getFullList({
          filter: pb.filter('encargo_id.proveedor_id = {:pid}', { pid: proveedorId }),
          sort: '-created', expand: 'encargo_id,mono_id,creado_por',
          requestKey: `prov-inc-${proveedorId}-${tick}`,
        }),
      ]);
      setEncargos(enc); setIncs(inc);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [proveedorId, tick]);

  useEffect(() => { load(); }, [load]);

  // Contadores por bandeja
  const counts = useMemo(() => ({
    recepcion: encargos.filter((e) => BANDEJA.recepcion.includes(e.estado)).length,
    confeccion: encargos.filter((e) => BANDEJA.confeccion.includes(e.estado)).length,
    listo: encargos.filter((e) => BANDEJA.listo.includes(e.estado)).length,
    validacion: encargos.filter((e) => BANDEJA.validacion.includes(e.estado)).length,
    incidencias: incs.filter((i) => i.estado !== 'cerrada').length,
  }), [encargos, incs]);

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <Helmet>
        <title>Portal proveedor | Control de producción de monos</title>
        <meta name="description" content="Portal del proveedor externo: recepción, confección, validación, incidencias e historial." />
      </Helmet>

      <header className="bg-primary text-primary-foreground shrink-0">
        <div className="stripe-top h-1.5" />
        <div className="flex items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <Logo size="sm" />
            <div className="min-w-0">
              <p className="font-display text-xl sm:text-2xl uppercase leading-none truncate">Portal proveedor</p>
              <p className="text-xs text-white/70 truncate">{user?.name || user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NotificationsBell />
            <button onClick={() => { logout(); navigate('/'); }} className="rounded-md bg-white/15 p-2 active:scale-95" aria-label="Salir">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 sm:px-5">
          {TABS.map((t) => {
            const Icon = t.icon;
            const c = counts[t.id] || 0;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`relative flex items-center gap-2 whitespace-nowrap rounded-t-md px-3 sm:px-4 py-3 font-display text-base sm:text-lg uppercase transition ${tab === t.id ? 'bg-background text-foreground' : 'text-white/70 hover:text-white'}`}>
                <Icon className="h-4 w-4" /> {t.label}
                {c > 0 && <span className="rounded-full bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] px-1.5 text-xs tabular-nums">{c}</span>}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="flex-1 p-3 sm:p-5">
        {!proveedorId ? (
          <div className="rounded-lg bg-destructive/10 px-4 py-3 text-destructive">
            Tu usuario no tiene un proveedor asignado. Contacta con dirección.
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" /> Cargando...
          </div>
        ) : (
          <>
            {tab === 'dashboard' && <DashboardTab encargos={encargos} incs={incs} mesSel={mesSel} setMesSel={setMesSel} reload={reload} />}
            {tab === 'recepcion' && <BandejaTab encargos={encargos.filter((e) => BANDEJA.recepcion.includes(e.estado))} reload={reload} accion="recepcion" />}
            {tab === 'confeccion' && <BandejaTab encargos={encargos.filter((e) => BANDEJA.confeccion.includes(e.estado))} reload={reload} accion="confeccion" />}
            {tab === 'listo' && <BandejaTab encargos={encargos.filter((e) => BANDEJA.listo.includes(e.estado))} reload={reload} accion="listo" />}
            {tab === 'validacion' && <BandejaTab encargos={encargos.filter((e) => BANDEJA.validacion.includes(e.estado))} reload={reload} accion="validacion" />}
            {tab === 'incidencias' && <IncidenciasTab incs={incs} reload={reload} />}
            {tab === 'historial' && <HistorialTab encargos={encargos} />}
          </>
        )}
      </main>
    </div>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────────────
function DashboardTab({ encargos, incs, mesSel, setMesSel, reload }) {
  const [any, mes] = mesSel.split('-').map(Number);
  const m = metricasMensuales(encargos, mes, any);
  const incsAbiertas = incs.filter((i) => i.estado !== 'cerrada').length;
  const proximas = encargos.filter((e) => e.fecha_devolucion_comprometida && !['validado', 'cerrado'].includes(e.estado))
    .sort((a, b) => (a.fecha_devolucion_comprometida || '').localeCompare(b.fecha_devolucion_comprometida || ''));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl sm:text-3xl uppercase">Dashboard</h2>
        <div className="flex items-center gap-2">
          <input type="month" value={mesSel} onChange={(e) => setMesSel(e.target.value)} className="h-10 rounded-lg border border-input bg-card px-2 text-sm" />
          <button onClick={reload} className="rounded-md border border-border bg-card p-2 active:scale-95"><RefreshCcw className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Importe generado" value={euro(m.importeGenerado)} sub="Validado este mes" icon={Euro} color="text-[hsl(var(--ok))]" />
        <Kpi label="Pendiente validar" value={euro(m.pendienteValidar)} sub="Terminado sin aceptar" icon={Clock} color="text-[hsl(var(--warn))]" />
        <Kpi label="Exclusivas realizadas" value={m.exclusivasRealizadas} sub="Mes en curso" icon={CheckCircle2} color="text-[hsl(var(--ok))]" />
        <Kpi label="Unidades realizadas" value={m.unidadesRealizadas} sub="Sin duplicar" icon={Package} color="text-primary" />
        <Kpi label="Pendientes confección" value={m.exclusivasPendientes} sub={`${m.unidadesPendientes} unidades`} icon={Package} color="text-[hsl(var(--warn))]" />
        <Kpi label="Listas para recoger" value={m.unidadesListas} sub="unidades" icon={Truck} color="text-[hsl(var(--accent))]" />
        <Kpi label="Incidencias abiertas" value={incsAbiertas} sub="de tus operaciones" icon={AlertTriangle} color="text-destructive" />
        <Kpi label="Encargos retrasados" value={m.retrasos} sub="Devolución vencida" icon={AlertTriangle} color="text-destructive" />
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
        El importe generado refleja trabajo aceptado por Onatex según su fecha de validación. No es un pago ni una factura emitida.
      </div>

      {/* Próximas entregas / retrasos */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3"><h3 className="font-display text-lg uppercase">Próximas entregas y retrasos</h3></div>
        {proximas.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Sin entregas pendientes.</p> : (
          <div className="divide-y divide-border">
            {proximas.slice(0, 8).map((e) => {
              const ex = e.expand?.exclusiva_id;
              const hoy = new Date().toISOString().slice(0, 10);
              const retrasado = e.fecha_devolucion_comprometida < hoy;
              return (
                <div key={e.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{ex?.exclusiva} · {ex?.article || ex?.referencia || ''}</p>
                    <p className="text-xs text-muted-foreground">{(e.monos || []).length} uds · {fmtDate(e.fecha_devolucion_comprometida)}</p>
                  </div>
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${retrasado ? 'bg-destructive/10 text-destructive' : 'bg-secondary'}`}>{retrasado ? 'Retrasado' : ESTADO_LABEL[e.estado]}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tabla de trabajos */}
      <div className="rounded-lg border border-border bg-card overflow-auto">
        <div className="border-b border-border px-4 py-3"><h3 className="font-display text-lg uppercase">Trabajos del mes</h3></div>
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-secondary text-xs uppercase">
            <tr>{['Exclusiva', 'Artículo', 'Uds', 'Fases', 'Precio', 'Importe', 'Estado', 'Validación'].map((h) => <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-border">
            {encargos.filter((e) => {
              const f = e.fecha_validacion || e.fecha_listo || e.fecha_recepcion || e.fecha_envio_real || e.created;
              const ym = ymMadrid(f); return ym && `${ym.y}-${String(ym.m).padStart(2, '0')}` === mesSel;
            }).map((e) => {
              const ex = e.expand?.exclusiva_id;
              let fases = []; try { fases = JSON.parse(e.fases || '[]'); } catch (_) {}
              return (
                <tr key={e.id} className="hover:bg-secondary/30">
                  <td className="px-3 py-3 font-semibold">{ex?.exclusiva || '—'}</td>
                  <td className="px-3 py-3 text-muted-foreground">{ex?.article || ex?.referencia || '—'}</td>
                  <td className="px-3 py-3 tabular-nums">{(e.monos || []).length}</td>
                  <td className="px-3 py-3 text-xs">{fases.map((f) => f.fase).join(', ')}</td>
                  <td className="px-3 py-3 tabular-nums">{e.precio_unitario != null ? euro(e.precio_unitario) : '—'}</td>
                  <td className="px-3 py-3 tabular-nums font-semibold">{e.importe_validado ? euro(e.importe_validado) : euro(e.importe_encargado)}</td>
                  <td className="px-3 py-3"><span className={`rounded px-2 py-0.5 text-xs font-semibold ${ESTADO_COLOR[e.estado]}`}>{ESTADO_LABEL[e.estado]}</span></td>
                  <td className="px-3 py-3 text-xs">{fmtDate(e.fecha_validacion)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, icon: Icon, color }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase text-muted-foreground">{label}</span>
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
      <p className="mt-2 font-display text-2xl sm:text-3xl">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Bandeja genérica (recepción / confección / listo / validación) ───────────
function BandejaTab({ encargos, reload, accion }) {
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState('');
  const [recepcionModal, setRecepcionModal] = useState(null);

  const accionLabel = {
    recepcion: 'Confirmar recepción',
    confeccion: 'Marcar listo para recoger',
    listo: 'Esperando recogida por Onatex',
    validacion: 'Esperando validación Onatex',
  }[accion];

  const doAccion = async (e, tipo) => {
    setBusy(e.id);
    try {
      const hoy = new Date().toISOString().slice(0, 10);
      if (tipo === 'recibir') {
        // Abrir modal de recepción para discrepancias
        setRecepcionModal(e);
        setBusy('');
        return;
      }
      if (tipo === 'listo') {
        await pb.collection('encargos_externos').update(e.id, { estado: 'listo_recoger', fecha_listo: hoy }, { requestKey: `prov-listo-${e.id}` });
        reload();
      }
    } catch (err) { alert('Error: ' + (err?.response?.message || err?.message || '')); }
    finally { setBusy(''); }
  };

  return (
    <div className="space-y-3">
      <h2 className="font-display text-2xl sm:text-3xl uppercase">{accionLabel}</h2>
      {encargos.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-border bg-card p-12 text-center text-muted-foreground">
          <CheckCircle2 className="mx-auto h-10 w-10 text-muted-foreground/30 mb-3" /> No hay encargos en esta bandeja.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {encargos.map((e) => {
            const ex = e.expand?.exclusiva_id;
            let fases = []; try { fases = JSON.parse(e.fases || '[]'); } catch (_) {}
            const uds = (e.monos || []).length;
            return (
              <div key={e.id} className="rounded-xl border-2 border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="font-display text-2xl uppercase leading-none truncate">{ex?.exclusiva || '—'}</p>
                    <p className="text-xs text-muted-foreground truncate">{ex?.article || ex?.referencia || ''}</p>
                  </div>
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${ESTADO_COLOR[e.estado]}`}>{ESTADO_LABEL[e.estado]}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                  <div><p className="text-xs text-muted-foreground">Unidades</p><p className="font-semibold tabular-nums">{uds}</p></div>
                  <div><p className="text-xs text-muted-foreground">Fases</p><p className="font-semibold text-xs">{fases.map((f) => f.fase).join(', ')}</p></div>
                  <div><p className="text-xs text-muted-foreground">Devolución</p><p className="font-semibold">{fmtDate(e.fecha_devolucion_comprometida)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Precio</p><p className="font-semibold">{e.precio_unitario != null ? euro(e.precio_unitario) : '—'}</p></div>
                </div>
                {e.descripcion && <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{e.descripcion}</p>}
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setDetail(e)} className="flex-1 min-h-[44px] rounded-lg border border-border px-3 py-2.5 text-sm font-semibold hover:bg-secondary active:scale-95 flex items-center justify-center gap-1.5">
                    <Eye className="h-4 w-4" /> Ver
                  </button>
                  {accion === 'recepcion' && (
                    <button onClick={() => doAccion(e, 'recibir')} disabled={busy === e.id} className="flex-1 min-h-[44px] rounded-lg bg-primary px-3 py-2.5 text-sm font-bold text-primary-foreground active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5">
                      <Check className="h-4 w-4" /> Confirmar recepción
                    </button>
                  )}
                  {accion === 'confeccion' && (
                    <button onClick={() => doAccion(e, 'listo')} disabled={busy === e.id} className="flex-1 min-h-[44px] rounded-lg bg-[hsl(var(--ok))] px-3 py-2.5 text-sm font-bold text-white active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5">
                      {busy === e.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Listo para recoger
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {detail && <EncargoViewModal enc={detail} onClose={() => setDetail(null)} />}
      {recepcionModal && <RecepcionModal enc={recepcionModal} onClose={() => setRecepcionModal(null)} onSaved={() => { setRecepcionModal(null); reload(); }} />}
    </div>
  );
}

function RecepcionModal({ enc, onClose, onSaved }) {
  const { user } = useAuth();
  const [discrep, setDiscrep] = useState('');
  const [saving, setSaving] = useState(false);
  const hoy = new Date().toISOString().slice(0, 10);

  const confirmar = async () => {
    setSaving(true);
    try {
      await pb.collection('encargos_externos').update(enc.id, {
        estado: 'recibido', fecha_recepcion: hoy, discrepancias_recepcion: discrep || '',
      }, { requestKey: `prov-rec-${enc.id}` });
      await pb.collection('movimientos_encargo').create({
        encargo_id: enc.id, tipo: 'recepcion', fecha: hoy, usuario_id: user?.id, unidades: enc.monos || [], notas: discrep ? `Discrepancias: ${discrep}` : '',
      }, { requestKey: `mov-rec-${enc.id}` }).catch(() => {});
      onSaved();
    } catch (e) { alert('Error: ' + (e?.response?.message || e?.message || '')); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="modal-card w-full max-w-md rounded-xl bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-2xl uppercase mb-3">Confirmar recepción</h3>
        <p className="text-sm text-muted-foreground mb-3">Confirma que has recibido {(enc.monos || []).length} unidades. Puedes comunicar faltantes o discrepancias sin alterar las cantidades enviadas.</p>
        <textarea value={discrep} onChange={(e) => setDiscrep(e.target.value)} rows={3} placeholder="Faltantes o discrepancias (opcional)..." className="w-full rounded-lg border border-input bg-background p-3 text-sm" />
        <div className="grid grid-cols-2 gap-3 mt-4">
          <button onClick={onClose} disabled={saving} className="h-12 rounded-xl bg-secondary font-bold disabled:opacity-50">Cancelar</button>
          <button onClick={confirmar} disabled={saving} className="h-12 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

function EncargoViewModal({ enc, onClose }) {
  const ex = enc.expand?.exclusiva_id;
  let fases = []; try { fases = JSON.parse(enc.fases || '[]'); } catch (_) {}
  const uds = enc.monos || [];
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="modal-card w-full max-w-lg rounded-xl bg-card p-6 shadow-2xl overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-2xl uppercase truncate">{ex?.exclusiva || '—'}</h3>
          <button onClick={onClose} className="rounded-md border border-border p-2 hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Info label="Artículo" value={ex?.article || ex?.referencia} />
          <Info label="Unidades" value={uds.length} />
          <Info label="Fases" value={fases.map((f) => f.fase).join(', ')} />
          <Info label="Precio unit." value={enc.precio_unitario != null ? euro(enc.precio_unitario) : '—'} />
          <Info label="Importe encargado" value={euro(enc.importe_encargado)} />
          <Info label="Estado" value={ESTADO_LABEL[enc.estado]} />
          <Info label="Salida" value={fmtDate(enc.fecha_envio_real || enc.fecha_salida)} />
          <Info label="Devolución" value={fmtDate(enc.fecha_devolucion_comprometida)} />
          <Info label="Recepción" value={fmtDate(enc.fecha_recepcion)} />
          <Info label="Listo" value={fmtDate(enc.fecha_listo)} />
        </div>
        {enc.descripcion && <div className="mt-3 rounded-lg bg-secondary/40 p-3 text-sm"><span className="text-xs font-semibold uppercase text-muted-foreground">Descripción: </span>{enc.descripcion}</div>}
        {enc.discrepancias_recepcion && <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800"><span className="font-semibold">Discrepancias: </span>{enc.discrepancias_recepcion}</div>}
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Unidades</p>
          <div className="flex flex-wrap gap-1.5">
            {uds.map((id) => <span key={id} className="rounded bg-secondary px-2 py-1 text-xs font-mono">{id.slice(-6)}</span>)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Incidencias ──────────────────────────────────────────────────────────────
function IncidenciasTab({ incs, reload }) {
  const [responder, setResponder] = useState(null);
  const list = incs.sort((a, b) => (b.created || '').localeCompare(a.created || ''));

  return (
    <div className="space-y-3">
      <h2 className="font-display text-2xl sm:text-3xl uppercase">Incidencias</h2>
      {list.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-border bg-card p-12 text-center text-muted-foreground">
          <AlertTriangle className="mx-auto h-10 w-10 text-muted-foreground/30 mb-3" /> Sin incidencias.
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((i) => {
            const ex = i.expand?.encargo_id?.expand?.exclusiva_id;
            return (
              <div key={i.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{ex?.exclusiva || '—'} · {i.fase || '—'}</p>
                    <p className="text-xs text-muted-foreground">{i.expand?.mono_id?.codi || '—'} · {fmtDate(i.created)}</p>
                  </div>
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${i.estado === 'cerrada' ? 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]' : 'bg-destructive/10 text-destructive'}`}>{i.estado}</span>
                </div>
                <p className="text-sm text-muted-foreground">{i.descripcion}</p>
                {i.fotos && i.fotos.length > 0 && (
                  <div className="mt-2 flex gap-1.5 flex-wrap">
                    {i.fotos.map((fn, idx) => <img key={idx} src={pb.files.getURL(i, fn)} alt="incidencia" className="h-16 w-16 rounded object-cover" />)}
                  </div>
                )}
                {i.respuesta && <p className="mt-2 text-xs"><span className="font-semibold">Respuesta:</span> {i.respuesta}</p>}
                {i.estado !== 'cerrada' && (
                  <button onClick={() => setResponder(i)} className="mt-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground active:scale-95 flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5" /> Responder
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {responder && <ResponderModal inc={responder} onClose={() => setResponder(null)} onSaved={() => { setResponder(null); reload(); }} />}
    </div>
  );
}

function ResponderModal({ inc, onClose, onSaved }) {
  const { user } = useAuth();
  const [resp, setResp] = useState(inc.respuesta || '');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!resp.trim()) return;
    setSaving(true);
    try {
      await pb.collection('incidencias_externas').update(inc.id, {
        respuesta: resp.trim(), estado: 'respondida', fecha_respuesta: new Date().toISOString().slice(0, 10),
      }, { requestKey: `prov-resp-${inc.id}` });
      onSaved();
    } catch (e) { alert('Error: ' + (e?.response?.message || e?.message || '')); }
    finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="modal-card w-full max-w-md rounded-xl bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-2xl uppercase mb-3">Responder incidencia</h3>
        <p className="text-sm text-muted-foreground mb-2">{inc.descripcion}</p>
        <textarea value={resp} onChange={(e) => setResp(e.target.value)} rows={4} placeholder="Tu respuesta..." className="w-full rounded-lg border border-input bg-background p-3 text-sm" />
        <div className="grid grid-cols-2 gap-3 mt-4">
          <button onClick={onClose} disabled={saving} className="h-12 rounded-xl bg-secondary font-bold disabled:opacity-50">Cancelar</button>
          <button onClick={save} disabled={saving || !resp.trim()} className="h-12 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Historial ────────────────────────────────────────────────────────────────
function HistorialTab({ encargos }) {
  const list = [...encargos].sort((a, b) => (b.created || '').localeCompare(a.created || ''));
  return (
    <div className="space-y-3">
      <h2 className="font-display text-2xl sm:text-3xl uppercase">Historial</h2>
      <div className="rounded-lg border border-border bg-card overflow-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-secondary text-xs uppercase">
            <tr>{['Exclusiva', 'Artículo', 'Uds', 'Fases', 'Importe', 'Estado', 'Validación'].map((h) => <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-border">
            {list.map((e) => {
              const ex = e.expand?.exclusiva_id;
              let fases = []; try { fases = JSON.parse(e.fases || '[]'); } catch (_) {}
              return (
                <tr key={e.id} className="hover:bg-secondary/30">
                  <td className="px-3 py-3 font-semibold">{ex?.exclusiva || '—'}</td>
                  <td className="px-3 py-3 text-muted-foreground">{ex?.article || ex?.referencia || '—'}</td>
                  <td className="px-3 py-3 tabular-nums">{(e.monos || []).length}</td>
                  <td className="px-3 py-3 text-xs">{fases.map((f) => f.fase).join(', ')}</td>
                  <td className="px-3 py-3 tabular-nums font-semibold">{e.importe_validado ? euro(e.importe_validado) : euro(e.importe_encargado)}</td>
                  <td className="px-3 py-3"><span className={`rounded px-2 py-0.5 text-xs font-semibold ${ESTADO_COLOR[e.estado]}`}>{ESTADO_LABEL[e.estado]}</span></td>
                  <td className="px-3 py-3 text-xs">{fmtDate(e.fecha_validacion)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="font-medium">{value || '—'}</p>
    </div>
  );
}

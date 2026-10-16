import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, RefreshCcw, Search, X, Save, Eye, Truck, CheckCircle2, AlertTriangle,
  Package, Send, ClipboardCheck, History, FileText, Building2, Euro, Clock,
  ArrowLeft, Camera, MessageSquare, RotateCcw, Check, ChevronDown,
} from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/lib/auth';
import {
  ESTADO_LABEL, ESTADO_COLOR, INTERNAL_NEXT, ESTADOS_ACTIVOS,
  fasesDisponibles, calcularImporteEncargado, calcularImporteValidado,
  euro, fmtDate, esPendienteValidar,
} from '@/lib/encargosUtils';

const TABS = [
  { id: 'encargos', label: 'Encargos', icon: Package },
  { id: 'validar', label: 'Pendiente de validar', icon: ClipboardCheck },
  { id: 'reparacion', label: 'Reparaciones', icon: RotateCcw },
];

export default function EncargosExternos() {
  const [tab, setTab] = useState('encargos');
  const [encargos, setEncargos] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [exclusives, setExclusives] = useState([]);
  const [monos, setMonos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [creating, setCreating] = useState(false);
  const [tick, setTick] = useState(0);
  const reload = () => setTick((t) => t + 1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [enc, provs, exs, mos] = await Promise.all([
        pb.collection('encargos_externos').getFullList({ sort: '-created', expand: 'proveedor_id,exclusiva_id,monos,validado_por,created_by,encargo_origen', requestKey: `enc-all-${tick}` }),
        pb.collection('proveedores').getFullList({ sort: 'nombre', requestKey: `enc-prov-${tick}` }),
        pb.collection('exclusives').getFullList({ fields: 'id,exclusiva,article,referencia,unitats,marca', sort: '-created', requestKey: `enc-ex-${tick}` }),
        pb.collection('monos').getFullList({ fields: 'id,codi,exclusiva,numero,talla', sort: 'exclusiva,numero', requestKey: `enc-mo-${tick}` }),
      ]);
      setEncargos(enc); setProveedores(provs); setExclusives(exs); setMonos(mos);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [tick]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Building2 className="h-6 w-6 text-primary" />
          <h2 className="font-display text-2xl sm:text-3xl uppercase">Encargos externos</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCreating(true)} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground active:scale-95">
            <Plus className="h-4 w-4" /> Nuevo encargo
          </button>
          <button onClick={reload} className="rounded-md border border-border bg-card p-2 active:scale-95"><RefreshCcw className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => {
          const Icon = t.icon;
          const count = t.id === 'validar' ? encargos.filter(esPendienteValidar).length
            : t.id === 'reparacion' ? encargos.filter((e) => e.estado === 'reparacion' || e.es_reparacion).length
            : encargos.length;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 whitespace-nowrap px-4 py-2.5 font-display text-base uppercase border-b-2 transition ${tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              <Icon className="h-4 w-4" /> {t.label}
              <span className="rounded-full bg-secondary px-1.5 text-xs tabular-nums">{count}</span>
            </button>
          );
        })}
      </div>

      {tab === 'encargos' && <EncargosList encargos={encargos} proveedores={proveedores} monos={monos} loading={loading} onOpen={setDetail} />}
      {tab === 'validar' && <EncargosList encargos={encargos.filter(esPendienteValidar)} proveedores={proveedores} monos={monos} loading={loading} onOpen={setDetail} emptyText="No hay trabajo pendiente de validar." />}
      {tab === 'reparacion' && <EncargosList encargos={encargos.filter((e) => e.estado === 'reparacion' || e.es_reparacion)} proveedores={proveedores} monos={monos} loading={loading} onOpen={setDetail} emptyText="No hay reparaciones en curso." />}

      {creating && <CreateEncargoModal proveedores={proveedores} exclusives={exclusives} monos={monos} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}
      {detail && <EncargoDetail encargo={detail} monos={monos} onClose={() => { setDetail(null); reload(); }} />}
    </div>
  );
}

function EncargosList({ encargos, proveedores, monos, loading, onOpen, emptyText }) {
  const [q, setQ] = useState('');
  const [fProv, setFProv] = useState('');
  const [fEstado, setFEstado] = useState('');

  const provName = (id) => proveedores.find((p) => p.id === id)?.nombre || '—';

  const rows = useMemo(() => {
    let r = encargos;
    if (fProv) r = r.filter((e) => e.proveedor_id === fProv);
    if (fEstado) r = r.filter((e) => e.estado === fEstado);
    if (q) {
      const t = q.toLowerCase();
      r = r.filter((e) => {
        const ex = e.expand?.exclusiva_id;
        return `${ex?.exclusiva || ''} ${ex?.article || ''} ${ex?.referencia || ''} ${provName(e.proveedor_id)}`.toLowerCase().includes(t);
      });
    }
    return r;
  }, [encargos, q, fProv, fEstado]);

  if (loading) return <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground"><RefreshCcw className="h-6 w-6 animate-spin" /> Cargando...</div>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar exclusiva, artículo, proveedor..."
            className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm" />
        </div>
        <select value={fProv} onChange={(e) => setFProv(e.target.value)} className="h-10 rounded-lg border border-input bg-card px-2 text-sm">
          <option value="">Todos los proveedores</option>
          {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} className="h-10 rounded-lg border border-input bg-card px-2 text-sm">
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-border bg-card p-12 text-center text-muted-foreground">
          <Package className="mx-auto h-10 w-10 text-muted-foreground/30 mb-3" />
          {emptyText || 'No hay encargos.'}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="bg-secondary text-xs uppercase">
              <tr>
                {['Exclusiva', 'Artículo', 'Proveedor', 'Unidades', 'Fases', 'Precio', 'Importe', 'Salida', 'Devolución', 'Estado', ''].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((e) => {
                const ex = e.expand?.exclusiva_id;
                const uds = (e.monos || []).length;
                let fases = [];
                try { fases = JSON.parse(e.fases || '[]'); } catch (_) {}
                const hoy = new Date().toISOString().slice(0, 10);
                const retrasado = e.fecha_devolucion_comprometida && e.fecha_devolucion_comprometida < hoy && !['validado', 'cerrado'].includes(e.estado);
                return (
                  <tr key={e.id} className={`hover:bg-secondary/30 ${retrasado ? 'bg-destructive/5' : ''}`}>
                    <td className="px-3 py-3 font-semibold">{ex?.exclusiva || '—'}</td>
                    <td className="px-3 py-3 text-muted-foreground">{ex?.article || ex?.referencia || '—'}</td>
                    <td className="px-3 py-3">{provName(e.proveedor_id)}</td>
                    <td className="px-3 py-3 tabular-nums">{uds}</td>
                    <td className="px-3 py-3 text-xs">{fases.map((f) => f.fase || f.nombre_fase).join(', ') || '—'}</td>
                    <td className="px-3 py-3 tabular-nums">{e.precio_unitario != null ? euro(e.precio_unitario) : '—'}</td>
                    <td className="px-3 py-3 tabular-nums font-semibold">{e.importe_encargado != null ? euro(e.importe_encargado) : '—'}</td>
                    <td className="px-3 py-3">{fmtDate(e.fecha_envio_real || e.fecha_salida)}</td>
                    <td className="px-3 py-3">
                      {fmtDate(e.fecha_devolucion_comprometida)}
                      {retrasado && <span className="ml-1 text-xs font-bold text-destructive">retrasado</span>}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded px-2 py-0.5 text-xs font-semibold ${ESTADO_COLOR[e.estado] || 'bg-secondary'}`}>{ESTADO_LABEL[e.estado] || e.estado}</span>
                    </td>
                    <td className="px-3 py-3">
                      <button onClick={() => onOpen(e)} className="rounded border border-border p-1.5 hover:bg-secondary" title="Ver detalle"><Eye className="h-4 w-4" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Crear encargo ─────────────────────────────────────────────────────────────
function CreateEncargoModal({ proveedores, exclusives, monos, onClose, onSaved }) {
  const { user } = useAuth();
  const [form, setForm] = useState({
    proveedor_id: '', exclusiva_id: '', monosSel: new Set(),
    fasesSel: new Set(), tipo_precio: 'por_fase', precio_unitario: '',
    fecha_salida: new Date().toISOString().slice(0, 10), fecha_devolucion_comprometida: '',
    descripcion: '', albaran: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const ex = exclusives.find((e) => e.id === form.exclusiva_id);
  const monosEx = useMemo(() => monos.filter((m) => m.exclusiva === form.exclusiva_id), [monos, form.exclusiva_id]);
  const fasesDisp = useMemo(() => fasesDisponibles(ex, exclusives), [ex, exclusives]);

  const toggleMono = (id) => setForm((f) => { const s = new Set(f.monosSel); s.has(id) ? s.delete(id) : s.add(id); return { ...f, monosSel: s }; });
  const toggleFase = (fase) => setForm((f) => { const s = new Set(f.fasesSel); s.has(fase) ? s.delete(fase) : s.add(fase); return { ...f, fasesSel: s }; });
  const selectAllMonos = () => setForm((f) => ({ ...f, monosSel: new Set(monosEx.map((m) => m.id)) }));
  const clearMonos = () => setForm((f) => ({ ...f, monosSel: new Set() }));

  const numFases = form.fasesSel.size;
  const numUds = form.monosSel.size;
  const importe = calcularImporteEncargado(form.tipo_precio, Number(form.precio_unitario) || 0, numUds, numFases);

  const save = async () => {
    setErr('');
    if (!form.proveedor_id) { setErr('Selecciona un proveedor'); return; }
    if (!form.exclusiva_id) { setErr('Selecciona una exclusiva'); return; }
    if (numUds === 0) { setErr('Selecciona al menos una unidad'); return; }
    if (numFases === 0) { setErr('Selecciona al menos una fase'); return; }
    if (!form.precio_unitario || Number(form.precio_unitario) <= 0) { setErr('Introduce el precio acordado'); return; }
    setSaving(true);
    try {
      const fasesArr = [...form.fasesSel].map((fase) => ({ fase }));
      const data = {
        proveedor_id: form.proveedor_id,
        exclusiva_id: form.exclusiva_id,
        monos: [...form.monosSel],
        fases: JSON.stringify(fasesArr),
        tipo_precio: form.tipo_precio,
        precio_unitario: Number(form.precio_unitario),
        precio_total_acordado: importe,
        importe_encargado: importe,
        importe_validado: 0,
        descripcion: form.descripcion,
        fecha_salida: form.fecha_salida || null,
        fecha_devolucion_comprometida: form.fecha_devolucion_comprometida || null,
        albaran: form.albaran,
        estado: 'preparado',
        unidades_aceptadas: '[]',
        unidades_rechazadas: '[]',
        es_reparacion: false,
        created_by: user?.id || null,
      };
      const rec = await pb.collection('encargos_externos').create(data, { requestKey: `enc-create-${Date.now()}` });
      // Movimiento inicial: preparado
      await pb.collection('movimientos_encargo').create({
        encargo_id: rec.id, tipo: 'envio', fecha: form.fecha_salida || new Date().toISOString().slice(0, 10),
        usuario_id: user?.id || null, unidades: [...form.monosSel], notas: 'Encargo preparado',
      }, { requestKey: `mov-init-${rec.id}` }).catch(() => {});
      onSaved();
    } catch (e) {
      setErr(e?.response?.message || e?.message || 'Error al crear el encargo');
    } finally { setSaving(false); }
  };

  const inp = 'mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="modal-card w-full max-w-2xl rounded-xl bg-card p-6 shadow-2xl overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-2xl uppercase">Nuevo encargo externo</h3>
          <button onClick={onClose} className="rounded-md border border-border p-2 hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Proveedor *</label>
              <select value={form.proveedor_id} onChange={(e) => setForm({ ...form, proveedor_id: e.target.value })} className={inp}>
                <option value="">Selecciona...</option>
                {proveedores.filter((p) => p.activo !== false).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Exclusiva *</label>
              <select value={form.exclusiva_id} onChange={(e) => setForm({ ...form, exclusiva_id: e.target.value, monosSel: new Set() })} className={inp}>
                <option value="">Selecciona...</option>
                {exclusives.map((e) => <option key={e.id} value={e.id}>{e.exclusiva} · {e.article || e.referencia || ''}</option>)}
              </select>
            </div>
          </div>

          {form.exclusiva_id && (
            <>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Unidades ({numUds}/{monosEx.length}) *</label>
                  <div className="flex gap-2">
                    <button onClick={selectAllMonos} className="text-xs text-primary font-semibold">Todas</button>
                    <button onClick={clearMonos} className="text-xs text-muted-foreground font-semibold">Ninguna</button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-auto rounded-lg border border-input bg-background p-2">
                  {monosEx.length === 0 ? <span className="text-xs text-muted-foreground">Sin monos generados.</span> :
                    monosEx.map((m) => (
                      <button key={m.id} onClick={() => toggleMono(m.id)}
                        className={`rounded px-2 py-1 text-xs font-mono font-semibold border ${form.monosSel.has(m.id) ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-secondary'}`}>
                        {m.codi}{m.talla ? ` · ${m.talla}` : ''}
                      </button>
                    ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">Fases ({numFases}) *</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {fasesDisp.map((fase) => (
                    <button key={fase} onClick={() => toggleFase(fase)}
                      className={`rounded px-3 py-1.5 text-sm font-semibold border ${form.fasesSel.has(fase) ? 'bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] border-[hsl(var(--accent))]' : 'border-border hover:bg-secondary'}`}>
                      {fase}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Tipo de precio</label>
              <select value={form.tipo_precio} onChange={(e) => setForm({ ...form, tipo_precio: e.target.value })} className={inp}>
                <option value="por_fase">Por unidad y fase</option>
                <option value="paquete">Paquete (precio por unidad, todas las fases)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Precio unitario (€) *</label>
              <input type="number" step="0.01" value={form.precio_unitario} onChange={(e) => setForm({ ...form, precio_unitario: e.target.value })} className={inp} placeholder="17,50" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Fecha salida Onatex</label>
              <input type="date" value={form.fecha_salida} onChange={(e) => setForm({ ...form, fecha_salida: e.target.value })} className={inp} />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Devolución comprometida</label>
              <input type="date" value={form.fecha_devolucion_comprometida} onChange={(e) => setForm({ ...form, fecha_devolucion_comprometida: e.target.value })} className={inp} />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground">Descripción del encargo</label>
            <textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} rows={2} placeholder="Instrucciones, observaciones..." className="mt-1 w-full rounded-lg border border-input bg-background p-3 text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground">Albarán (si disponible)</label>
            <input value={form.albaran} onChange={(e) => setForm({ ...form, albaran: e.target.value })} className={inp} placeholder="Nº albarán" />
          </div>

          {numUds > 0 && numFases > 0 && (
            <div className="rounded-lg bg-primary/10 px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-primary">Importe encargado (sin IVA)</span>
              <span className="font-display text-2xl text-primary">{euro(importe)}</span>
            </div>
          )}

          {err && <p className="text-sm text-destructive">{err}</p>}
          <div className="grid grid-cols-2 gap-3">
            <button onClick={onClose} disabled={saving} className="h-12 rounded-xl bg-secondary font-bold disabled:opacity-50">Cancelar</button>
            <button onClick={save} disabled={saving} className="h-12 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Crear encargo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Detalle del encargo ──────────────────────────────────────────────────────
function EncargoDetail({ encargo, monos, onClose }) {
  const { user } = useAuth();
  const [enc, setEnc] = useState(encargo);
  const [movs, setMovs] = useState([]);
  const [incs, setIncs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [showValidate, setShowValidate] = useState(false);
  const [showInc, setShowInc] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, i, e] = await Promise.all([
        pb.collection('movimientos_encargo').getFullList({ filter: `encargo_id = "${encargo.id}"`, sort: '-fecha', expand: 'usuario_id', requestKey: `det-mov-${encargo.id}` }),
        pb.collection('incidencias_externas').getFullList({ filter: `encargo_id = "${encargo.id}"`, sort: '-created', expand: 'mono_id,creado_por', requestKey: `det-inc-${encargo.id}` }),
        pb.collection('encargos_externos').getOne(encargo.id, { expand: 'proveedor_id,exclusiva_id,monos,validado_por,created_by,encargo_origen', requestKey: `det-enc-${encargo.id}` }),
      ]);
      setMovs(m); setIncs(i); setEnc(e);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [encargo.id]);

  useEffect(() => { load(); }, [load]);

  const ex = enc.expand?.exclusiva_id;
  const prov = enc.expand?.proveedor_id;
  let fases = [];
  try { fases = JSON.parse(enc.fases || '[]'); } catch (_) {}
  const uds = enc.monos || [];
  const aceptadas = (() => { try { return JSON.parse(enc.unidades_aceptadas || '[]'); } catch (_) { return []; } })();
  const rechazadas = (() => { try { return JSON.parse(enc.unidades_rechazadas || '[]'); } catch (_) { return []; } })();
  const monoName = (id) => enc.expand?.monos?.find((m) => m.id === id)?.codi || monos.find((m) => m.id === id)?.codi || id.slice(-6);

  const cambiarEstado = async (nuevo, extra = {}) => {
    setBusy(nuevo);
    try {
      const patch = { estado: nuevo, ...extra };
      // Fechas automáticas según transición.
      const hoy = new Date().toISOString().slice(0, 10);
      if (nuevo === 'enviado' && !enc.fecha_envio_real) patch.fecha_envio_real = hoy;
      if (nuevo === 'recibido' && !enc.fecha_recepcion) patch.fecha_recepcion = hoy;
      if (nuevo === 'listo_recoger' && !enc.fecha_listo) patch.fecha_listo = hoy;
      if (nuevo === 'recogido' && !enc.fecha_recogida) patch.fecha_recogida = hoy;
      if (nuevo === 'llegada_onatex' && !enc.fecha_llegada) patch.fecha_llegada = hoy;
      await pb.collection('encargos_externos').update(enc.id, patch, { requestKey: `enc-est-${enc.id}` });
      // Movimiento
      const tipoMap = { enviado: 'envio', recibido: 'recepcion', listo_recoger: 'listo', recogido: 'recogida', llegada_onatex: 'llegada' };
      if (tipoMap[nuevo]) {
        await pb.collection('movimientos_encargo').create({
          encargo_id: enc.id, tipo: tipoMap[nuevo], fecha: hoy, usuario_id: user?.id, unidades: uds, notas: '',
        }, { requestKey: `mov-${nuevo}-${enc.id}` }).catch(() => {});
      }
      load();
    } catch (e) { alert('Error: ' + (e?.response?.message || e?.message || '')); }
    finally { setBusy(''); }
  };

  const nextStates = INTERNAL_NEXT[enc.estado] || [];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/50" onClick={onClose}>
      <div className="relative flex h-full w-full max-w-3xl flex-col overflow-y-auto bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-background px-5 py-3">
          <div className="min-w-0">
            <p className="font-display text-xl sm:text-2xl uppercase truncate">Encargo · {ex?.exclusiva || '—'}</p>
            <p className="text-xs text-muted-foreground truncate">{prov?.nombre} · {ex?.article || ex?.referencia || ''}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-2 hover:bg-secondary"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Estado + acciones */}
          <div className="flex flex-wrap items-center gap-3">
            <span className={`rounded px-3 py-1 text-sm font-semibold ${ESTADO_COLOR[enc.estado] || 'bg-secondary'}`}>{ESTADO_LABEL[enc.estado] || enc.estado}</span>
            {enc.es_reparacion && <span className="rounded bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800">Reparación</span>}
            {nextStates.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {nextStates.map((s) => (
                  <button key={s} onClick={() => cambiarEstado(s)} disabled={!!busy}
                    className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground active:scale-95 disabled:opacity-50">
                    {busy === s ? '...' : ESTADO_LABEL[s] || s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Info label="Unidades" value={uds.length} />
            <Info label="Fases" value={fases.map((f) => f.fase || f.nombre_fase).join(', ')} />
            <Info label="Precio unit." value={enc.precio_unitario != null ? euro(enc.precio_unitario) : '—'} />
            <Info label="Tipo precio" value={enc.tipo_precio === 'paquete' ? 'Paquete' : 'Por fase'} />
            <Info label="Importe encargado" value={euro(enc.importe_encargado)} />
            <Info label="Importe validado" value={euro(enc.importe_validado)} />
            <Info label="Salida" value={fmtDate(enc.fecha_envio_real || enc.fecha_salida)} />
            <Info label="Devolución comprom." value={fmtDate(enc.fecha_devolucion_comprometida)} />
            <Info label="Recepción" value={fmtDate(enc.fecha_recepcion)} />
            <Info label="Listo recoger" value={fmtDate(enc.fecha_listo)} />
            <Info label="Recogida" value={fmtDate(enc.fecha_recogida)} />
            <Info label="Llegada Onatex" value={fmtDate(enc.fecha_llegada)} />
            <Info label="Validación" value={fmtDate(enc.fecha_validacion)} />
            <Info label="Validado por" value={enc.expand?.validado_por?.name || '—'} />
          </div>

          {enc.descripcion && <div className="rounded-lg bg-secondary/40 p-3 text-sm"><span className="text-xs font-semibold uppercase text-muted-foreground">Descripción: </span>{enc.descripcion}</div>}
          {enc.discrepancias_recepcion && <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800"><span className="font-semibold">Discrepancias recepción: </span>{enc.discrepancias_recepcion}</div>}
          {enc.observaciones_validacion && <div className="rounded-lg bg-[hsl(var(--ok))]/10 p-3 text-sm"><span className="font-semibold">Observaciones validación: </span>{enc.observaciones_validacion}</div>}

          {/* Unidades y validación */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-display text-lg uppercase">Unidades</h4>
              {['recogido', 'llegada_onatex', 'parcialmente_validado', 'con_incidencias'].includes(enc.estado) && (
                <button onClick={() => setShowValidate(true)} className="flex items-center gap-1.5 rounded-lg bg-[hsl(var(--ok))] px-3 py-2 text-xs font-semibold text-white active:scale-95">
                  <CheckCircle2 className="h-4 w-4" /> Validar
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {uds.map((id) => {
                const ok = aceptadas.includes(id);
                const ko = rechazadas.includes(id);
                return (
                  <span key={id} className={`rounded px-2 py-1 text-xs font-mono font-semibold border ${ok ? 'bg-[hsl(var(--ok))]/15 border-[hsl(var(--ok))]/50 text-[hsl(var(--ok))]' : ko ? 'bg-destructive/10 border-destructive/40 text-destructive' : 'border-border'}`}>
                    {monoName(id)}{ok && ' ✓'}{ko && ' ✗'}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Incidencias */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-display text-lg uppercase">Incidencias ({incs.length})</h4>
              <button onClick={() => setShowInc(true)} className="flex items-center gap-1.5 rounded-lg border border-destructive/40 text-destructive px-3 py-2 text-xs font-semibold hover:bg-destructive/10">
                <AlertTriangle className="h-4 w-4" /> Registrar incidencia
              </button>
            </div>
            {incs.length === 0 ? <p className="text-sm text-muted-foreground">Sin incidencias.</p> : (
              <div className="space-y-2">
                {incs.map((i) => (
                  <div key={i.id} className="rounded-lg border border-border p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{i.fase || '—'} · {i.expand?.mono_id?.codi || '—'}</span>
                      <span className={`rounded px-2 py-0.5 text-xs font-semibold ${i.estado === 'cerrada' ? 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]' : 'bg-destructive/10 text-destructive'}`}>{i.estado}</span>
                    </div>
                    <p className="mt-1 text-muted-foreground">{i.descripcion}</p>
                    {i.respuesta && <p className="mt-1 text-xs"><span className="font-semibold">Respuesta:</span> {i.respuesta}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Movimientos */}
          <div>
            <h4 className="font-display text-lg uppercase mb-2">Historial de movimientos</h4>
            {loading ? <p className="text-sm text-muted-foreground">Cargando...</p> : movs.length === 0 ? <p className="text-sm text-muted-foreground">Sin movimientos.</p> : (
              <div className="space-y-1.5">
                {movs.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                    <History className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-semibold capitalize">{m.tipo}</span>
                    <span className="text-muted-foreground">{fmtDate(m.fecha)}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{m.expand?.usuario_id?.name || '—'}</span>
                    {m.notas && <span className="text-xs text-muted-foreground">· {m.notas}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showValidate && <ValidateModal enc={enc} monoName={monoName} onClose={() => setShowValidate(false)} onSaved={() => { setShowValidate(false); load(); }} />}
      {showInc && <IncidenciaModal enc={enc} onClose={() => setShowInc(false)} onSaved={() => { setShowInc(false); load(); }} />}
    </div>
  );
}

function ValidateModal({ enc, monoName, onClose, onSaved }) {
  const { user } = useAuth();
  const uds = enc.monos || [];
  const [acept, setAcept] = useState(new Set());
  const [rechaz, setRechaz] = useState(new Set());
  const [obs, setObs] = useState('');
  const [saving, setSaving] = useState(false);

  const toggle = (id, set, other, setSet, otherSet) => {
    setSet((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
    otherSet((prev) => { const s = new Set(prev); s.delete(id); return s; });
  };

  const save = async () => {
    setSaving(true);
    try {
      const hoy = new Date().toISOString().slice(0, 10);
      await pb.collection('encargos_externos').update(enc.id, {
        unidades_aceptadas: [...acept],
        unidades_rechazadas: [...rechaz],
        observaciones_validacion: obs,
        fecha_validacion: enc.fecha_validacion || hoy,
        validado_por: enc.validado_por || user?.id,
      }, { requestKey: `enc-val-${enc.id}` });
      await pb.collection('movimientos_encargo').create({
        encargo_id: enc.id, tipo: 'validacion', fecha: hoy, usuario_id: user?.id,
        unidades: [...acept], notas: `Aceptadas: ${acept.size}, rechazadas: ${rechaz.size}`,
      }, { requestKey: `mov-val-${enc.id}` }).catch(() => {});
      onSaved();
    } catch (e) { alert('Error: ' + (e?.response?.message || e?.message || '')); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="modal-card w-full max-w-lg rounded-xl bg-card p-6 shadow-2xl overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-2xl uppercase">Validar trabajo</h3>
          <button onClick={onClose} className="rounded-md border border-border p-2 hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>
        <p className="text-sm text-muted-foreground mb-3">Marca cada unidad como aceptada o rechazada. Solo las aceptadas suman importe validado y quedan completadas.</p>
        <div className="space-y-1.5 max-h-64 overflow-auto">
          {uds.map((id) => {
            const ok = acept.has(id), ko = rechaz.has(id);
            return (
              <div key={id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                <span className="font-mono text-sm font-semibold flex-1">{monoName(id)}</span>
                <button onClick={() => toggle(id, acept, rechaz, setAcept, setRechaz)} className={`rounded px-3 py-1 text-xs font-semibold ${ok ? 'bg-[hsl(var(--ok))] text-white' : 'border border-border'}`}>Aceptar</button>
                <button onClick={() => toggle(id, rechaz, acept, setRechaz, setAcept)} className={`rounded px-3 py-1 text-xs font-semibold ${ko ? 'bg-destructive text-white' : 'border border-border'}`}>Rechazar</button>
              </div>
            );
          })}
        </div>
        <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} placeholder="Observaciones de validación..." className="mt-3 w-full rounded-lg border border-input bg-background p-3 text-sm" />
        <div className="grid grid-cols-2 gap-3 mt-4">
          <button onClick={onClose} disabled={saving} className="h-12 rounded-xl bg-secondary font-bold disabled:opacity-50">Cancelar</button>
          <button onClick={save} disabled={saving} className="h-12 rounded-xl bg-[hsl(var(--ok))] text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar validación
          </button>
        </div>
      </div>
    </div>
  );
}

function IncidenciaModal({ enc, onClose, onSaved }) {
  const { user } = useAuth();
  const [fase, setFase] = useState('');
  const [monoId, setMonoId] = useState('');
  const [desc, setDesc] = useState('');
  const [fotos, setFotos] = useState([]);
  const [saving, setSaving] = useState(false);
  let fases = [];
  try { fases = JSON.parse(enc.fases || '[]'); } catch (_) {}

  const save = async () => {
    if (!desc.trim()) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('encargo_id', enc.id);
      fd.append('fase', fase);
      fd.append('mono_id', monoId || '');
      fd.append('descripcion', desc.trim());
      fd.append('estado', 'abierta');
      fd.append('creado_por', user?.id || '');
      for (const f of fotos) fd.append('fotos', f);
      await pb.collection('incidencias_externas').create(fd, { requestKey: `inc-create-${Date.now()}` });
      // Marcar encargo con incidencias si procede
      if (!['con_incidencias', 'reparacion'].includes(enc.estado)) {
        await pb.collection('encargos_externos').update(enc.id, { estado: 'con_incidencias' }, { requestKey: `enc-inc-${enc.id}` }).catch(() => {});
      }
      onSaved();
    } catch (e) { alert('Error: ' + (e?.response?.message || e?.message || '')); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="modal-card w-full max-w-lg rounded-xl bg-card p-6 shadow-2xl overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-2xl uppercase">Registrar incidencia</h3>
          <button onClick={onClose} className="rounded-md border border-border p-2 hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Fase</label>
              <select value={fase} onChange={(e) => setFase(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-2 text-sm">
                <option value="">—</option>
                {fases.map((f) => <option key={f.fase} value={f.fase}>{f.fase}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Unidad</label>
              <select value={monoId} onChange={(e) => setMonoId(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-2 text-sm">
                <option value="">—</option>
                {(enc.monos || []).map((id) => <option key={id} value={id}>{id.slice(-6)}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground">Descripción *</label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-input bg-background p-3 text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground">Fotos</label>
            <input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(e) => setFotos([...(e.target.files || [])])} className="mt-1 block w-full text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <button onClick={onClose} disabled={saving} className="h-12 rounded-xl bg-secondary font-bold disabled:opacity-50">Cancelar</button>
            <button onClick={save} disabled={saving || !desc.trim()} className="h-12 rounded-xl bg-destructive text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />} Registrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-lg bg-secondary/40 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold truncate">{value ?? '—'}</p>
    </div>
  );
}

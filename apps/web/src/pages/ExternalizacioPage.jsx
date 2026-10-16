import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDownToLine, ArrowUpFromLine, CheckCircle, Clock, History,
  Loader2, LogOut, Package, RefreshCcw, Truck, AlertTriangle, X,
  Camera, Upload, AlertCircle,
} from 'lucide-react';
import { MultiFileDrop } from '@/components/common/DragDropUpload';
import { useAuth } from '@/lib/auth';
import pb from '@/lib/pocketbaseClient';
import Logo from '@/components/Logo';

const TABS = [
  { id: 'cola', label: 'Cola de salida', icon: ArrowUpFromLine },
  { id: 'enproceso', label: 'En proceso', icon: Truck },
  { id: 'historial', label: 'Historial', icon: History },
];

function now() {
  return new Date().toISOString().slice(11, 19);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = Math.ceil((new Date(dateStr + 'T00:00:00') - new Date()) / 86400000);
  return d;
}
function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

const estatBadge = {
  enviada: 'bg-amber-100 text-amber-800',
  en_proces: 'bg-blue-100 text-blue-800',
  retornada: 'bg-emerald-100 text-emerald-800',
  amb_incidencies: 'bg-red-100 text-red-800',
};

export default function ExternalizacioPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('cola');
  const [items, setItems] = useState([]);
  const [proveidors, setProveidors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal state
  const [sortidaModal, setSortidaModal] = useState(null);
  const [entradaModal, setEntradaModal] = useState(null);
  const [saving, setSaving] = useState(false);

  // Sortida form
  const [obsSortida, setObsSortida] = useState('');

  // Entrada form
  const [estat, setEstat] = useState('conforme');
  const [obsEntrada, setObsEntrada] = useState('');
  const [incDesc, setIncDesc] = useState('');
  const [gravetat, setGravetat] = useState('media');
  const [fotos, setFotos] = useState([]);
  const fotosRef = useRef();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [fasesRes, pRes] = await Promise.all([
        pb.collection('fases_externalizadas').getFullList({
          expand: 'exclusiva,mono,proveidor',
          sort: '-created',
          requestKey: 'ext-list',
        }),
        pb.collection('proveedores_externos').getFullList({ requestKey: 'ext-provs' }),
      ]);
      setItems(fasesRes);
      setProveidors(pRes);
    } catch (e) {
      setError('Error carregant dades: ' + (e?.message || ''));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const cola = useMemo(() =>
    items.filter((i) => !i.hora_salida && (i.estat === 'enviada' || !i.estat || i.estat === 'en_proces' || i.estat === '')),
    [items],
  );
  const enProceso = useMemo(() =>
    items.filter((i) => i.hora_salida && !i.hora_entrada),
    [items],
  );
  const historial = useMemo(() =>
    items.filter((i) => i.hora_entrada),
    [items],
  );

  // ── Registrar sortida ─────────────────────────────────────────────────────
  const confirmarSortida = async () => {
    if (!sortidaModal) return;
    setSaving(true);
    try {
      await pb.collection('fases_externalizadas').update(sortidaModal.id, {
        hora_salida: now(),
        data_enviament: today(),
        observacions_salida: obsSortida,
        operari_externalitzacio: user?.id,
        estat: 'en_proces',
      });
      setSortidaModal(null);
      setObsSortida('');
      load();
    } catch (e) {
      alert('Error registrant sortida: ' + (e?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  // ── Registrar entrada ─────────────────────────────────────────────────────
  const confirmarEntrada = async () => {
    if (!entradaModal) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('hora_entrada', now());
      fd.append('data_devolucion_real', today());
      fd.append('observacions_entrada', obsEntrada);
      fd.append('operari_externalitzacio', user?.id || '');
      if (estat === 'conforme') {
        fd.append('estat', 'retornada');
      } else {
        fd.append('estat', 'amb_incidencies');
        fd.append('descripcio_incidencia', incDesc);
      }
      for (const foto of fotos) {
        fd.append('fotos', foto);
      }
      await pb.collection('fases_externalizadas').update(entradaModal.id, fd);
      setEntradaModal(null);
      setEstat('conforme');
      setObsEntrada('');
      setIncDesc('');
      setGravetat('media');
      setFotos([]);
      load();
    } catch (e) {
      alert('Error registrant entrada: ' + (e?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const provName = (item) => {
    if (item?.expand?.proveidor?.nom) return item.expand.proveidor.nom;
    const p = proveidors.find((pr) => pr.id === item.proveidor);
    return p?.nom || '—';
  };

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <Helmet>
        <title>Externalització | Control de producció de monos</title>
        <meta name="description" content="Panel de gestió de fases externalizades: registre de sortides i entrades de mercaderia." />
      </Helmet>

      {/* Header */}
      <header className="bg-primary text-primary-foreground shrink-0">
        <div className="stripe-top h-1.5" />
        <div className="flex items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-3">
            <Logo size="sm" />
            <div>
              <p className="font-display text-xl sm:text-2xl uppercase leading-none">Externalització</p>
              <p className="text-xs text-white/70">{user?.name || user?.codi}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="rounded-md bg-white/15 p-2 active:scale-95">
              <RefreshCcw className="h-4 w-4" />
            </button>
            <button onClick={() => { logout(); navigate('/'); }} className="rounded-md bg-white/15 p-2 active:scale-95">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-5">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 whitespace-nowrap rounded-t-md px-4 py-3 font-display text-lg uppercase transition ${
                  tab === t.id ? 'bg-background text-foreground' : 'text-white/70 hover:text-white'
                }`}>
                <Icon className="h-4 w-4" /> {t.label}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="flex-1 p-5">
        {error && <p className="mb-4 rounded-md bg-destructive/10 px-4 py-3 text-destructive">{error}</p>}

        {loading ? (
          <div className="flex items-center justify-center py-24 gap-3 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span>Carregant...</span>
          </div>
        ) : (
          <>
            {/* ── COLA DE SORTIDA ─────────────────────────────────────────── */}
            {tab === 'cola' && (
              <section className="rounded-lg border border-border bg-card">
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <h2 className="font-display text-2xl uppercase">Cola de sortida</h2>
                  <span className="rounded-full bg-secondary px-3 py-1 text-sm font-semibold">{cola.length} pendents</span>
                </div>
                {cola.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                    <CheckCircle className="h-10 w-10 text-[hsl(var(--ok))]" />
                    <p>No hi ha fases pendents d'enviar.</p>
                  </div>
                ) : (
                  <div className="overflow-auto">
                    <table className="w-full min-w-[700px] text-sm">
                      <thead className="bg-secondary text-xs uppercase">
                        <tr>
                          {['Exclusiva', 'Article', 'Fase', 'Proveïdor', 'Data prev. devolució', 'Acció'].map((h) => (
                            <th key={h} className="px-4 py-2 text-left font-semibold">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {cola.map((item) => (
                          <tr key={item.id} className="hover:bg-secondary/30">
                            <td className="px-4 py-3 font-semibold">{item.expand?.exclusiva?.exclusiva || '—'}</td>
                            <td className="px-4 py-3 text-muted-foreground">{item.expand?.exclusiva?.article || '—'}</td>
                            <td className="px-4 py-3">{item.fase || '—'}</td>
                            <td className="px-4 py-3">{provName(item)}</td>
                            <td className="px-4 py-3">{fmtDate(item.data_devolucion_esperada)}</td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() => { setSortidaModal(item); setObsSortida(''); }}
                                className="flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-2 text-xs font-semibold active:scale-95 transition">
                                <ArrowUpFromLine className="h-3.5 w-3.5" /> Registrar sortida
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {/* ── EN PROCESO ─────────────────────────────────────────────── */}
            {tab === 'enproceso' && (
              <section className="rounded-lg border border-border bg-card">
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <h2 className="font-display text-2xl uppercase">Externalizacions en procés</h2>
                  <span className="rounded-full bg-secondary px-3 py-1 text-sm font-semibold">{enProceso.length} actives</span>
                </div>
                {enProceso.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                    <Truck className="h-10 w-10" />
                    <p>Cap externalització en curs.</p>
                  </div>
                ) : (
                  <div className="overflow-auto">
                    <table className="w-full min-w-[800px] text-sm">
                      <thead className="bg-secondary text-xs uppercase">
                        <tr>
                          {['Exclusiva', 'Article', 'Fase', 'Proveïdor', 'Sortida', 'Devolució esperada', 'Dies restants', 'Acció'].map((h) => (
                            <th key={h} className="px-4 py-2 text-left font-semibold">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {enProceso.map((item) => {
                          const dies = daysUntil(item.data_devolucion_esperada);
                          const diesColor = dies === null ? '' : dies <= 0 ? 'text-destructive font-semibold' : dies <= 2 ? 'text-[hsl(var(--warn))] font-semibold' : 'text-[hsl(var(--ok))]';
                          return (
                            <tr key={item.id} className="hover:bg-secondary/30">
                              <td className="px-4 py-3 font-semibold">{item.expand?.exclusiva?.exclusiva || '—'}</td>
                              <td className="px-4 py-3 text-muted-foreground">{item.expand?.exclusiva?.article || '—'}</td>
                              <td className="px-4 py-3">{item.fase || '—'}</td>
                              <td className="px-4 py-3">{provName(item)}</td>
                              <td className="px-4 py-3">
                                <span className="text-xs text-muted-foreground">{fmtDate(item.data_enviament)}</span>
                                {item.hora_salida && <span className="ml-1 text-xs text-muted-foreground">{item.hora_salida}</span>}
                              </td>
                              <td className="px-4 py-3">{fmtDate(item.data_devolucion_esperada)}</td>
                              <td className={`px-4 py-3 ${diesColor}`}>
                                {dies === null ? '—' : dies <= 0 ? 'Retardat' : `${dies} dies`}
                              </td>
                              <td className="px-4 py-3">
                                <button
                                  onClick={() => {
                                    setEntradaModal(item);
                                    setEstat('conforme');
                                    setObsEntrada('');
                                    setIncDesc('');
                                    setGravetat('media');
                                    setFotos([]);
                                  }}
                                  className="flex items-center gap-2 rounded-md bg-[hsl(var(--ok))] text-white px-3 py-2 text-xs font-semibold active:scale-95 transition">
                                  <ArrowDownToLine className="h-3.5 w-3.5" /> Registrar entrada
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {/* ── HISTORIAL ────────────────────────────────────────────────── */}
            {tab === 'historial' && (
              <section className="rounded-lg border border-border bg-card">
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <h2 className="font-display text-2xl uppercase">Historial d'externalizacions</h2>
                  <span className="rounded-full bg-secondary px-3 py-1 text-sm font-semibold">{historial.length} completades</span>
                </div>
                {historial.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                    <History className="h-10 w-10" />
                    <p>Cap externalització completada.</p>
                  </div>
                ) : (
                  <div className="overflow-auto">
                    <table className="w-full min-w-[900px] text-sm">
                      <thead className="bg-secondary text-xs uppercase">
                        <tr>
                          {['Exclusiva', 'Article', 'Fase', 'Proveïdor', 'Sortida', 'Entrada', 'Durada', 'Incidències', 'Estat'].map((h) => (
                            <th key={h} className="px-4 py-2 text-left font-semibold">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {historial.map((item) => {
                          const duracioMs = item.data_enviament && item.data_devolucion_real
                            ? new Date(item.data_devolucion_real) - new Date(item.data_enviament)
                            : null;
                          const duracioD = duracioMs !== null ? Math.round(duracioMs / 86400000) : null;
                          return (
                            <tr key={item.id} className={`hover:bg-secondary/30 ${item.estat === 'amb_incidencies' ? 'bg-destructive/5' : ''}`}>
                              <td className="px-4 py-3 font-semibold">{item.expand?.exclusiva?.exclusiva || '—'}</td>
                              <td className="px-4 py-3 text-muted-foreground">{item.expand?.exclusiva?.article || '—'}</td>
                              <td className="px-4 py-3">{item.fase || '—'}</td>
                              <td className="px-4 py-3">{provName(item)}</td>
                              <td className="px-4 py-3 text-xs">{fmtDate(item.data_enviament)}</td>
                              <td className="px-4 py-3 text-xs">{fmtDate(item.data_devolucion_real)}</td>
                              <td className="px-4 py-3 text-xs">{duracioD !== null ? `${duracioD} dies` : '—'}</td>
                              <td className="px-4 py-3">
                                {item.estat === 'amb_incidencies'
                                  ? <span className="flex items-center gap-1 text-destructive text-xs font-semibold"><AlertTriangle className="h-3.5 w-3.5" /> Sí</span>
                                  : <span className="text-[hsl(var(--ok))] text-xs font-semibold">No</span>
                                }
                              </td>
                              <td className="px-4 py-3">
                                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${estatBadge[item.estat] || 'bg-secondary'}`}>
                                  {item.estat || '—'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>

      {/* ── MODAL SORTIDA ─────────────────────────────────────────────────── */}
      {sortidaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h3 className="font-display text-2xl uppercase">Registrar sortida</h3>
              <button onClick={() => setSortidaModal(null)} className="rounded-md border border-border p-2 hover:bg-secondary">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Exclusiva</label>
                  <p className="font-semibold">{sortidaModal.expand?.exclusiva?.exclusiva || '—'}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Fase</label>
                  <p>{sortidaModal.fase || '—'}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Proveïdor</label>
                  <p>{provName(sortidaModal)}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Data/hora sortida</label>
                  <p>{today()} · {now()}</p>
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Data devolució esperada</label>
                  <p>{fmtDate(sortidaModal.data_devolucion_esperada)}</p>
                </div>
              </div>
              <div>
                <label className="text-sm font-semibold mb-1 block">Observacions (opcional)</label>
                <textarea
                  value={obsSortida}
                  onChange={(e) => setObsSortida(e.target.value)}
                  rows={3}
                  placeholder="Anotacions de la sortida..."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <button
                onClick={confirmarSortida}
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground py-3 font-semibold disabled:opacity-60">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpFromLine className="h-4 w-4" />}
                Confirmar sortida
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL ENTRADA ─────────────────────────────────────────────────── */}
      {entradaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-xl bg-card shadow-2xl my-4">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h3 className="font-display text-2xl uppercase">Registrar entrada</h3>
              <button onClick={() => setEntradaModal(null)} className="rounded-md border border-border p-2 hover:bg-secondary">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Exclusiva</label>
                  <p className="font-semibold">{entradaModal.expand?.exclusiva?.exclusiva || '—'}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Proveïdor</label>
                  <p>{provName(entradaModal)}</p>
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">Data/hora entrada</label>
                  <p>{today()} · {now()}</p>
                </div>
              </div>

              {/* Estat mercaderia */}
              <div>
                <label className="text-sm font-semibold mb-2 block">Estat de la mercaderia</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'conforme', label: 'Conforme', color: 'border-[hsl(var(--ok))] bg-[hsl(var(--ok))]/10 text-[hsl(var(--ok))]' },
                    { id: 'incidencia', label: 'Amb incidències', color: 'border-destructive bg-destructive/10 text-destructive' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setEstat(opt.id)}
                      className={`rounded-md border px-3 py-3 text-sm font-semibold transition ${
                        estat === opt.id ? opt.color : 'border-border hover:bg-secondary'
                      }`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Incidència details */}
              {estat === 'incidencia' && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
                    <AlertCircle className="h-4 w-4" /> Detalls de la incidència
                  </p>
                  <div>
                    <label className="text-xs font-semibold mb-1 block">Descripció del problema</label>
                    <textarea
                      value={incDesc}
                      onChange={(e) => setIncDesc(e.target.value)}
                      rows={3}
                      placeholder="Descriure el problema detectat..."
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold mb-1 block">Gravetat</label>
                    <select
                      value={gravetat}
                      onChange={(e) => setGravetat(e.target.value)}
                      className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm">
                      <option value="leve">Lleu</option>
                      <option value="media">Mitja</option>
                      <option value="grave">Greu</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold mb-1 block">Fotos (opcional)</label>
                    <MultiFileDrop
                      files={fotos}
                      onAdd={(files) => setFotos((prev) => [...prev, ...files].slice(0, 10))}
                      onRemove={(i) => setFotos((prev) => prev.filter((_, j) => j !== i))}
                      accept="image/*"
                      maxFiles={10}
                      maxSizeMB={50}
                      label="Arrastra fotos aquí"
                      hint="JPG, PNG, WebP · Máx. 10 fotos"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="text-sm font-semibold mb-1 block">Observacions (opcional)</label>
                <textarea
                  value={obsEntrada}
                  onChange={(e) => setObsEntrada(e.target.value)}
                  rows={2}
                  placeholder="Anotacions de l'entrada..."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              <button
                onClick={confirmarEntrada}
                disabled={saving || (estat === 'incidencia' && !incDesc.trim())}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-[hsl(var(--ok))] text-white py-3 font-semibold disabled:opacity-60">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
                Confirmar entrada
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Calendar, CheckCircle2, Clock, Package, PackageCheck,
  RefreshCcw, Truck, XCircle,
} from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/lib/auth';
import { calcularSaturacion, operarisConfeccioActius, prepararMedias } from '@/lib/saturacioUtils';
import AnalisisSaturacion from '@/components/admin/AnalisisSaturacion';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Normaliza un valor de fecha (DD/MM/YYYY, YYYY-MM-DD, ISO, Date) a un Date local a medianoche. */
function normalitzaData(v) {
  if (!v) return null;
  if (v instanceof Date) {
    const d = new Date(v.getFullYear(), v.getMonth(), v.getDate());
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = String(v).trim();
  let d;
  // DD/MM/YYYY
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) {
    d = new Date(Number(m1[3]), Number(m1[2]) - 1, Number(m1[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // YYYY-MM-DD
  const m2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m2) {
    d = new Date(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  return null;
}

function dataStr(d) {
  if (!d) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function diesEntre(a, b) {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

function fmtMin(min) {
  if (!min || min <= 0) return '0 min';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h <= 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

const ESTAT_LLIURE = new Set(['entregada', 'finalitzada']);

// ─── Subcomponentes ───────────────────────────────────────────────────────────

function SectionCard({ title, icon: Icon, accent, children, right }) {
  return (
    <section className={`rounded-xl border bg-card p-5 ${accent || 'border-border'}`}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="flex items-center gap-2 font-display text-2xl uppercase leading-none">
          {Icon && <Icon className="h-5 w-5" />}
          {title}
        </h3>
        {right}
      </div>
      {children}
    </section>
  );
}

function ArticleCard({ article, exclusives, unitats, retard = false }) {
  return (
    <div className={`rounded-lg border p-4 ${retard ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-secondary/40'}`}>
      <div className="flex items-center justify-between">
        <p className="font-display text-xl uppercase">{article}</p>
        {retard && <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-bold text-destructive uppercase">Retrasado</span>}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Exclusivas</p>
          <p className="font-display text-3xl tabular-nums">{exclusives}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Unidades</p>
          <p className="font-display text-3xl tabular-nums">{unitats}</p>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ text }) {
  return <p className="text-sm text-muted-foreground py-2">{text}</p>;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function PanelHoy() {
  const { user } = useAuth();
  const [dataSel, setDataSel] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  });
  const [iniciJornada, setIniciJornada] = useState('08:00');
  const [fiJornada, setFiJornada] = useState('17:00');
  const [pctQualitat, setPctQualitat] = useState(10);

  const [exclusives, setExclusives] = useState([]);
  const [monos, setMonos] = useState([]);
  const [fasesExt, setFasesExt] = useState([]);
  const [registres, setRegistres] = useState([]);
  const [articles, setArticles] = useState([]);
  const [opsDef, setOpsDef] = useState([]);
  const [carregant, setCarregant] = useState(true);
  const [marcant, setMarcant] = useState({});
  const [ara, setAra] = useState(new Date());

  const carrega = useCallback(async (silent = false) => {
    if (!silent) setCarregant(true);
    try {
      const [ex, mo, fe, regs, arts, ops] = await Promise.all([
        pb.collection('exclusives').getFullList({ expand: 'ruta,entregada_per', requestKey: 'hoy-ex' }),
        pb.collection('monos').getFullList({ requestKey: 'hoy-mo' }),
        pb.collection('fases_externalizadas').getFullList({ requestKey: 'hoy-fe' }).catch(() => []),
        pb.collection('registres').getFullList({
          filter: 'estat = "en_curs" || estat = "pausat" || estat = "finalitzat"',
          expand: 'operari,exclusiva',
          requestKey: 'hoy-regs',
        }).catch(() => []),
        pb.collection('articles').getFullList({ requestKey: 'hoy-ar' }).catch(() => []),
        pb.collection('operacions_def').getFullList({ requestKey: 'hoy-ops' }).catch(() => []),
      ]);
      setExclusives(ex);
      setMonos(mo);
      setFasesExt(fe);
      setRegistres(regs || []);
      setArticles(arts || []);
      setOpsDef(ops || []);
    } catch (e) {
      console.error('PanelHoy load error', e);
    } finally {
      setCarregant(false);
    }
  }, []);

  useEffect(() => { carrega(); }, [carrega]);
  useEffect(() => {
    const t = setInterval(() => { carrega(true); }, 15000);
    return () => clearInterval(t);
  }, [carrega]);

  // Reloj en vivo (cada minuto) para recalcular saturación
  useEffect(() => {
    const t = setInterval(() => setAra(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  // ─── Cálculos derivados ─────────────────────────────────────────────────────

  // SECCIÓN 1 — Entregas del día
  const entregasAvui = useMemo(() => {
    return exclusives.filter((e) => {
      const d = normalitzaData(e.data_entrega);
      return d && diesEntre(d, dataSel) === 0;
    });
  }, [exclusives, dataSel]);

  const entregasPerArticle = useMemo(() => {
    const map = new Map();
    entregasAvui.forEach((e) => {
      const art = e.article || 'Sense article';
      const o = map.get(art) || { article: art, exclusives: 0, unitats: 0, retards: 0 };
      o.exclusives += 1;
      o.unitats += Number(e.unitats) || 0;
      if (!ESTAT_LLIURE.has(e.estat)) o.retards += 1;
      map.set(art, o);
    });
    return [...map.values()].sort((a, b) => b.exclusives - a.exclusives);
  }, [entregasAvui]);

  // SECCIÓN 2 — Exclusivas retrasadas (fecha < día seleccionado, no entregadas)
  const retrasades = useMemo(() => {
    return exclusives
      .filter((e) => {
        if (ESTAT_LLIURE.has(e.estat)) return false;
        const d = normalitzaData(e.data_entrega);
        return d && diesEntre(d, dataSel) < 0;
      })
      .map((e) => {
        const d = normalitzaData(e.data_entrega);
        return { ...e, _diesRetard: Math.abs(diesEntre(d, dataSel)) };
      })
      .sort((a, b) => b._diesRetard - a._diesRetard);
  }, [exclusives, dataSel]);

  const retrasadesPerArticle = useMemo(() => {
    const map = new Map();
    retrasades.forEach((e) => {
      const art = e.article || 'Sense article';
      const o = map.get(art) || { article: art, exclusives: 0, unitats: 0, maxDies: 0 };
      o.exclusives += 1;
      o.unitats += Number(e.unitats) || 0;
      o.maxDies = Math.max(o.maxDies, e._diesRetard);
      map.set(art, o);
    });
    return [...map.values()].sort((a, b) => b.maxDies - a.maxDies);
  }, [retrasades]);

  // SECCIÓN 3 — Saturación
  const saturacio = useMemo(() => {
    const opsByNom = {};
    (opsDef || []).forEach((op) => { if (op.nom) opsByNom[op.nom] = op; });
    const desde = new Date(ara.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const recientes = (registres || []).filter((r) => r.inici && r.inici >= desde);
    return calcularSaturacion({
      exclusives,
      monos,
      registresFase: registres,
      enriched: prepararMedias(recientes, opsByNom),
      articles,
      fasesExt,
      operarisActius: operarisConfeccioActius(registres),
      now: ara,
      dataSel,
      iniciJornada,
      fiJornada,
      pctQualitat,
    });
  }, [exclusives, monos, registres, articles, fasesExt, opsDef, ara, dataSel, iniciJornada, fiJornada, pctQualitat]);

  // SECCIÓN 4 — Proyección de fechas
  const projecte = useMemo(() => {
    return saturacio.perEx.map((e) => {
      const minNecessari = e.restant;
      const capPerDia = saturacio.numOperaris * saturacio.jornadaHores * 60;
      const diesNecessaris = capPerDia > 0 ? minNecessari / capPerDia : 0;
      // Si hay riesgo, fecha estimada = día seleccionado + días extra
      let novaData = null;
      let diesRetard = 0;
      let diesAdelantar = 0;
      if (saturacio.estat === 'no' || saturacio.estat === 'risc') {
        const extra = Math.max(0, diesNecessaris - 1); // ya contamos el día actual
        if (extra > 0) {
          novaData = new Date(dataSel.getTime() + Math.ceil(extra) * 86400000);
          diesRetard = Math.ceil(extra);
        }
      } else if (saturacio.estat === 'ok' && saturacio.pct < 80) {
        // holgura: cuántos días se podría adelantar este artículo
        const holguraCap = capPerDia - minNecessari;
        if (holguraCap > 0 && capPerDia > 0) {
          diesAdelantar = Math.floor(holguraCap / capPerDia);
        }
      }
      return { ...e, minNecessari, diesNecessaris, novaData, diesRetard, diesAdelantar };
    });
  }, [saturacio, dataSel]);

  // SECCIÓN 5 — Monos listos para entregar / entregados
  const listosEntregar = useMemo(() => {
    return exclusives.filter((e) => e.estat === 'lista_recollida');
  }, [exclusives]);

  const entregatsAvui = useMemo(() => {
    return exclusives.filter((e) => {
      if (e.estat !== 'entregada') return false;
      const d = normalitzaData(e.data_entrega_real);
      return d && diesEntre(d, dataSel) === 0;
    });
  }, [exclusives, dataSel]);

  const monosPerExclusiva = useCallback((exId) => monos.filter((m) => m.exclusiva === exId).length, [monos]);

  const handleEntregar = async (ex) => {
    setMarcant((p) => ({ ...p, [ex.id]: true }));
    try {
      const now = new Date().toISOString();
      await pb.collection('exclusives').update(ex.id, {
        estat: 'entregada',
        data_entrega_real: now,
        entregada_per: user?.id || undefined,
      });
      await carrega();
    } catch (e) {
      console.error(e);
    } finally {
      setMarcant((p) => ({ ...p, [ex.id]: false }));
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  const inputDateValue = (() => {
    const y = dataSel.getFullYear();
    const m = String(dataSel.getMonth() + 1).padStart(2, '0');
    const d = String(dataSel.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  })();

  return (
    <div className="grid gap-6">
      {/* Cabecera con selector de fecha */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl uppercase leading-none flex items-center gap-2">
            <Calendar className="h-7 w-7" /> Hoy
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Análisis de entregas y saturación para el día seleccionado</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Fecha</label>
            <input
              type="date"
              value={inputDateValue}
              onChange={(e) => {
                const [y, m, d] = e.target.value.split('-').map(Number);
                setDataSel(new Date(y, m - 1, d));
              }}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold"
            />
          </div>
          <div className="flex items-center gap-2">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Inicio</label>
              <input type="time" value={iniciJornada} onChange={(e) => setIniciJornada(e.target.value)}
                className="rounded-lg border border-border bg-card px-2 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Fin</label>
              <input type="time" value={fiJornada} onChange={(e) => setFiJornada(e.target.value)}
                className="rounded-lg border border-border bg-card px-2 py-2 text-sm" />
            </div>
          </div>
          <div className="w-24">
            <label className="block text-xs font-medium text-muted-foreground mb-1">% Calidad</label>
            <input type="number" min="0" max="100" value={pctQualitat}
              onChange={(e) => setPctQualitat(Number(e.target.value) || 0)}
              className="rounded-lg border border-border bg-card px-2 py-2 text-sm w-full" />
          </div>
          <button onClick={carrega} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-secondary active:scale-95 h-[38px]">
            <RefreshCcw className="h-4 w-4" /> Actualizar
          </button>
        </div>
      </div>

      {carregant ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-lg bg-secondary" />)}
        </div>
      ) : (
        <>
          {/* SECCIÓN 1 — Entregas del día */}
          <SectionCard title={`Entregas del día — ${dataStr(dataSel)}`} icon={Package}>
            {entregasPerArticle.length === 0 ? (
              <EmptyState text="No hay exclusivas con fecha de entrega para este día." />
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {entregasPerArticle.map((a) => (
                    <ArticleCard key={a.article} article={a.article} exclusives={a.exclusives} unitats={a.unitats} retard={a.retards > 0} />
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <span>Total exclusivas: <strong className="text-foreground">{entregasAvui.length}</strong></span>
                  <span>Total unidades: <strong className="text-foreground">{entregasPerArticle.reduce((s, a) => s + a.unitats, 0)}</strong></span>
                  <span>Con retraso: <strong className="text-destructive">{entregasPerArticle.reduce((s, a) => s + a.retards, 0)}</strong></span>
                </div>
              </>
            )}
          </SectionCard>

          {/* SECCIÓN 2 — Exclusivas retrasadas */}
          <SectionCard title="Exclusivas retrasadas" icon={AlertTriangle} accent={retrasades.length > 0 ? 'border-destructive/40' : 'border-border'}>
            {retrasades.length === 0 ? (
              <EmptyState text="No hay exclusivas retrasadas de días anteriores." />
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {retrasadesPerArticle.map((a) => (
                    <ArticleCard key={a.article} article={a.article} exclusives={a.exclusives} unitats={a.unitats} retard />
                  ))}
                </div>
                <div className="mt-4 overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left">Exclusiva</th>
                        <th className="px-3 py-2 text-left">Artículo</th>
                        <th className="px-3 py-2 text-right">Unidades</th>
                        <th className="px-3 py-2 text-left">Entrega prevista</th>
                        <th className="px-3 py-2 text-right">Días retraso</th>
                        <th className="px-3 py-2 text-left">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {retrasades.slice(0, 20).map((e) => (
                        <tr key={e.id} className="hover:bg-secondary/40">
                          <td className="px-3 py-2 font-mono font-semibold">{e.exclusiva}</td>
                          <td className="px-3 py-2">{e.article || '—'}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{e.unitats || '—'}</td>
                          <td className="px-3 py-2">{e.data_entrega}</td>
                          <td className="px-3 py-2 text-right">
                            <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-bold text-destructive">{e._diesRetard}d</span>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{e.estat}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </SectionCard>

          <AnalisisSaturacion saturacio={saturacio} pctQualitat={pctQualitat} />

          {/* SECCIÓN 4 — Proyección de fechas */}
          <SectionCard title="Proyección de fechas" icon={Clock}>
            {projecte.length === 0 ? (
              <EmptyState text="No hay exclusivas pendientes para proyectar." />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Exclusiva</th>
                      <th className="px-3 py-2 text-left">Artículo</th>
                      <th className="px-3 py-2 text-right">Tiempo restante</th>
                      <th className="px-3 py-2 text-right">Progreso</th>
                      <th className="px-3 py-2 text-left">Proyección</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {projecte.map((p) => (
                      <tr key={p.id} className="hover:bg-secondary/40">
                        <td className="px-3 py-2 font-mono font-semibold">{p.exclusiva}</td>
                        <td className="px-3 py-2">{p.article}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMin(p.minNecessari)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{p.prog == null ? '—' : `${Math.round(p.prog * 100)}%`}</td>
                        <td className="px-3 py-2">
                          {p.diesRetard > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-bold text-destructive">
                              <XCircle className="h-3 w-3" /> +{p.diesRetard}d → {dataStr(p.novaData)}
                            </span>
                          ) : p.diesAdelantar > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--ok))]/15 px-2 py-0.5 text-xs font-bold text-[hsl(var(--ok))]">
                              <CheckCircle2 className="h-3 w-3" /> Adelantar {p.diesAdelantar}d
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">A tiempo</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {/* SECCIÓN 5 — Monos listos / entregados */}
          <div className="grid gap-6 xl:grid-cols-2">
            <SectionCard title="Listos para entregar" icon={PackageCheck} accent={listosEntregar.length > 0 ? 'border-[hsl(var(--ok))]/40' : 'border-border'}>
              {listosEntregar.length === 0 ? (
                <EmptyState text="No hay monos completados listos para entregar." />
              ) : (
                <ul className="divide-y divide-border">
                  {listosEntregar.map((ex) => (
                    <li key={ex.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="font-mono font-semibold">{ex.exclusiva}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {ex.article || '—'} · {ex.unitats || 0} unidades · {monosPerExclusiva(ex.id)} monos
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="rounded-full bg-[hsl(var(--ok))]/15 px-2 py-0.5 text-xs font-bold text-[hsl(var(--ok))] uppercase">Listo</span>
                        <button
                          onClick={() => handleEntregar(ex)}
                          disabled={marcant[ex.id]}
                          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 active:scale-95 disabled:opacity-60"
                        >
                          <Truck className="h-3.5 w-3.5" />
                          {marcant[ex.id] ? '...' : 'Entregar'}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title={`Entregados — ${dataStr(dataSel)}`} icon={Truck}>
              {entregatsAvui.length === 0 ? (
                <EmptyState text="No se han entregado monos en este día." />
              ) : (
                <ul className="divide-y divide-border">
                  {entregatsAvui.map((ex) => {
                    const d = normalitzaData(ex.data_entrega_real);
                    return (
                      <li key={ex.id} className="flex items-center justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <p className="font-mono font-semibold">{ex.exclusiva}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {ex.article || '—'} · {ex.unitats || 0} unidades
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 text-right">
                          <div>
                            <p className="text-xs text-muted-foreground">Entregado</p>
                            <p className="text-xs font-semibold">{d ? dataStr(d) : '—'}</p>
                          </div>
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary uppercase">Entregado</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </SectionCard>
          </div>
        </>
      )}
    </div>
  );
}

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronUp, Download, Eye, EyeOff, Filter, History, X } from 'lucide-react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/lib/auth';

const GRAVETAT_COLORS = {
  baixa: { cls: 'bg-green-100 text-green-800', label: 'Baja' },
  media: { cls: 'bg-yellow-100 text-yellow-800', label: 'Media' },
  alta: { cls: 'bg-orange-100 text-orange-800', label: 'Alta' },
  critica: { cls: 'bg-red-100 text-red-800 font-bold', label: 'Crítica' },
  // fallback from prioritat
  undefined: { cls: 'bg-secondary text-secondary-foreground', label: '—' },
};

const ESTAT_COLORS = {
  oberta: 'bg-yellow-100 text-yellow-800',
  en_seguiment: 'bg-blue-100 text-blue-800',
  tancada: 'bg-green-100 text-green-800',
};

const CHART_COLORS = ['#3b82f6', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6'];

function GravetatBadge({ gravetat, prioritat }) {
  const key = gravetat || prioritat;
  const info = GRAVETAT_COLORS[key] || GRAVETAT_COLORS.undefined;
  return <span className={`rounded px-2 py-0.5 text-xs font-semibold ${info.cls}`}>{info.label || key || '—'}</span>;
}

function OrigenBadge({ origen }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${origen === 'client' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
      {origen === 'client' ? 'Cliente' : 'Onatex'}
    </span>
  );
}

function EstatBadge({ estat }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${ESTAT_COLORS[estat] || 'bg-secondary text-secondary-foreground'}`}>
      {estat === 'oberta' ? 'Abierta' : estat === 'en_seguiment' ? 'En seguimiento' : estat === 'tancada' ? 'Cerrada' : estat || '—'}
    </span>
  );
}

const OCULTA_LABELS = {
  operarios: { cls: 'bg-gray-200 text-gray-700', label: 'Oculta para operarios' },
  calidad: { cls: 'bg-purple-100 text-purple-800', label: 'Oculta para calidad' },
  todos: { cls: 'bg-red-100 text-red-800', label: 'Oculta para todos' },
};

function OcultaBadge({ ocultaPara }) {
  const info = OCULTA_LABELS[ocultaPara];
  if (!info) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold ${info.cls}`}>
      <EyeOff className="h-3 w-3" /> {info.label}
    </span>
  );
}

function FotosGallery({ fotos, collectionId, recordId }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  if (!fotos || fotos.length === 0) return <span className="text-muted-foreground text-xs">Sin fotos</span>;
  const getUrl = (f) => pb.files.getURL({ collectionId, id: recordId }, f, { thumb: '100x100' });
  const getFullUrl = (f) => pb.files.getURL({ collectionId, id: recordId }, f);
  return (
    <>
      <button onClick={() => setOpen(true)} className="flex items-center gap-1 text-xs text-primary underline">
        <Eye className="h-3 w-3" /> {fotos.length} foto{fotos.length > 1 ? 's' : ''}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-xl rounded-lg bg-card p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold">Fotos del problema</h4>
              <button onClick={() => setOpen(false)}><X className="h-5 w-5" /></button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {fotos.map((f, i) => (
                <img key={i} src={getUrl(f)} alt={`foto ${i+1}`}
                  className="h-20 w-full rounded cursor-pointer object-cover border border-border hover:opacity-80"
                  onClick={() => setSelected(getFullUrl(f))}
                />
              ))}
            </div>
          </div>
          {selected && (
            <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/90" onClick={() => setSelected(null)}>
              <img src={selected} alt="full" className="max-h-[90vh] max-w-[90vw] rounded-lg" />
            </div>
          )}
        </div>
      )}
    </>
  );
}

const AREA_LABELS = {
  estampacion: 'Estampación', confeccio: 'Confección',
  acabats: 'Acabados', oficina_tecnica: 'Oficina Técnica', logistica: 'Logística',
};

function DetalleModal({ inc, onClose, onSaved, historial = [], ocultacioActiva }) {
  const [estat, setEstat] = useState(inc.estat || 'oberta');
  const [saving, setSaving] = useState(false);
  const [fullImg, setFullImg] = useState(null);

  const handleEstat = async (newEstat) => {
    setSaving(true);
    try {
      await pb.collection('no_conformitats').update(inc.id, { estat: newEstat });
      setEstat(newEstat);
      onSaved && onSaved();
    } finally { setSaving(false); }
  };

  const fileUrl = (filename, thumb) => {
    const obj = { collectionId: inc.collectionId, id: inc.id };
    return thumb ? pb.files.getURL(obj, filename, { thumb }) : pb.files.getURL(obj, filename);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-lg bg-card overflow-y-auto max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h3 className="font-display text-2xl uppercase">{inc.codi || 'Incidencia'}</h3>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        <div className="px-6 py-4 grid gap-4">
          <div className="flex flex-wrap gap-2">
            <GravetatBadge gravetat={inc.gravetat} prioritat={inc.prioritat} />
            <OrigenBadge origen={inc.origen} />
            <EstatBadge estat={estat} />
            {ocultacioActiva && <OcultaBadge ocultaPara={ocultacioActiva.oculta_para} />}
            {inc.area && (
              <span className="rounded px-2 py-0.5 text-xs font-semibold bg-secondary text-secondary-foreground">
                {AREA_LABELS[inc.area] || inc.area}
              </span>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            <div><p className="text-xs text-muted-foreground">Exclusiva</p><p className="font-semibold">{inc.expand?.exclusiva?.exclusiva || '—'}</p></div>
            <div><p className="text-xs text-muted-foreground">Artículo</p><p>{inc.expand?.exclusiva?.article || '—'}</p></div>
            <div><p className="text-xs text-muted-foreground">Fecha detección</p><p>{inc.data_nc ? new Date(inc.data_nc).toLocaleDateString('es-ES') : '—'}</p></div>
            <div><p className="text-xs text-muted-foreground">Registrado por</p><p>{inc.expand?.operari_que_detecto?.name || inc.expand?.operari_que_detecto?.codi || '—'}</p></div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Descripción</p>
            <p className="text-sm bg-secondary/50 rounded p-3 whitespace-pre-wrap">{inc.descripcio || '—'}</p>
          </div>
          {inc.solucio_implantada && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Solución implantada</p>
              <p className="text-sm bg-secondary/50 rounded p-3 whitespace-pre-wrap">{inc.solucio_implantada}</p>
            </div>
          )}
          {inc.accio_preventiva && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Acción preventiva</p>
              <p className="text-sm bg-secondary/50 rounded p-3 whitespace-pre-wrap">{inc.accio_preventiva}</p>
            </div>
          )}
          {(inc.contacte_nom || inc.contacte_telefon || inc.contacte_email) && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Contacto cliente</p>
              <div className="text-sm grid gap-1">
                {inc.contacte_nom && <p><span className="font-medium">Nombre:</span> {inc.contacte_nom}</p>}
                {inc.contacte_telefon && <p><span className="font-medium">Tel:</span> {inc.contacte_telefon}</p>}
                {inc.contacte_email && <p><span className="font-medium">Email:</span> {inc.contacte_email}</p>}
              </div>
            </div>
          )}

          {/* Fotos */}
          {inc.fotos && inc.fotos.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Fotos ({inc.fotos.length})</p>
              <div className="flex flex-wrap gap-2">
                {inc.fotos.map((f, i) => {
                  const full = fileUrl(f);
                  return (
                    <div key={i} className="relative group">
                      <img
                        src={fileUrl(f, '200x200')}
                        alt={`foto ${i+1}`}
                        className="h-24 w-24 rounded object-cover border border-border cursor-zoom-in hover:opacity-90"
                        onClick={() => setFullImg(full)}
                      />
                      <a href={full} download target="_blank" rel="noreferrer"
                        className="absolute bottom-1 right-1 hidden group-hover:flex h-5 w-5 items-center justify-center rounded bg-black/60 text-white text-xs"
                        title="Descargar">↓</a>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Videos */}
          {inc.videos && inc.videos.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Vídeos ({inc.videos.length})</p>
              <div className="space-y-3">
                {inc.videos.map((v, i) => {
                  const url = fileUrl(v);
                  return (
                    <div key={i} className="rounded-lg border border-border overflow-hidden bg-black">
                      <video src={url} controls className="w-full max-h-64" />
                      <div className="flex items-center justify-between bg-card px-3 py-2 text-xs">
                        <span className="text-muted-foreground font-mono truncate">{v}</span>
                        <a href={url} download target="_blank" rel="noreferrer"
                          className="flex items-center gap-1 rounded px-2 py-1 bg-secondary hover:bg-muted font-semibold">
                          ↓ Descargar
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Historial de ocultaciones */}
          {historial.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <History className="h-3.5 w-3.5" /> Historial de ocultaciones ({historial.length})
              </p>
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-secondary text-left">
                    <tr>
                      {['Fecha', 'Para', 'Usuario', 'Motivo', 'Estado'].map((h) => (
                        <th key={h} className="px-2.5 py-1.5 font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {historial
                      .slice()
                      .sort((a, b) => b.created.localeCompare(a.created))
                      .map((h) => (
                        <tr key={h.id}>
                          <td className="px-2.5 py-1.5 whitespace-nowrap">
                            {h.fecha_ocultacion ? new Date(h.fecha_ocultacion).toLocaleString('es-ES') : new Date(h.created).toLocaleString('es-ES')}
                          </td>
                          <td className="px-2.5 py-1.5">{OCULTA_LABELS[h.oculta_para]?.label || h.oculta_para}</td>
                          <td className="px-2.5 py-1.5">{h.expand?.usuario_id?.name || h.expand?.usuario_id?.codi || '—'}</td>
                          <td className="px-2.5 py-1.5 max-w-[160px] truncate">{h.motivo || '—'}</td>
                          <td className="px-2.5 py-1.5">
                            <span className={`rounded px-1.5 py-0.5 font-semibold ${h.activa ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                              {h.activa ? 'Activa' : 'Revertida'}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div>
            <p className="text-xs text-muted-foreground mb-2">Cambiar estado</p>
            <div className="flex gap-2 flex-wrap">
              {['oberta', 'en_seguiment', 'tancada'].map((s) => (
                <button key={s} onClick={() => handleEstat(s)} disabled={saving || estat === s}
                  className={`rounded px-3 py-1.5 text-xs font-semibold ${estat === s ? 'ring-2 ring-primary' : 'hover:opacity-80'} ${ESTAT_COLORS[s] || 'bg-secondary'}`}>
                  {s === 'oberta' ? 'Abierta' : s === 'en_seguiment' ? 'En seguimiento' : 'Cerrada'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Full-size image lightbox */}
      {fullImg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onClick={() => setFullImg(null)}>
          <img src={fullImg} alt="full" className="max-h-[90vh] max-w-[90vw] rounded-lg" />
          <button onClick={() => setFullImg(null)} className="absolute top-4 right-4 text-white"><X className="h-6 w-6" /></button>
        </div>
      )}
    </div>
  );
}

export default function LlistatIncidencies() {
  const { user, rol } = useAuth();
  const [incidencies, setIncidencies] = useState([]);
  const [ocultacions, setOcultacions] = useState([]); // all ocultacion records (history)
  const [carregant, setCarregant] = useState(true);
  const [detall, setDetall] = useState(null);
  const [vista, setVista] = useState('taula'); // taula | grafics
  const [showOcultarModal, setShowOcultarModal] = useState(null); // incidencia record
  const [ocultaPara, setOcultaPara] = useState('operarios');
  const [motiuOcult, setMotiuOcult] = useState('');
  const [savingOcult, setSavingOcult] = useState(false);

  // Filters
  const [fExclusiva, setFExclusiva] = useState('');
  const [fArticle, setFArticle] = useState('');
  const [fGravetat, setFGravetat] = useState('');
  const [fOrigen, setFOrigen] = useState('');
  const [fEstat, setFEstat] = useState('');
  const [fDes, setFDes] = useState('');
  const [fFins, setFFins] = useState('');
  const [ordre, setOrdre] = useState('data_desc');
  // Hidden filters
  const [fMostrarOcultes, setFMostrarOcultes] = useState(true); // by default show all (admin/superadmin)
  const [fNomesOcultes, setFNomesOcultes] = useState(false);
  const [fOcultesOperaris, setFOcultesOperaris] = useState(false);
  const [fOcultesCalidad, setFOcultesCalidad] = useState(false);

  const carrega = useCallback(async () => {
    setCarregant(true);
    try {
      const [recs, ocults] = await Promise.all([
        pb.collection('no_conformitats').getFullList({
          sort: '-created',
          expand: 'exclusiva,operari_que_detecto',
          requestKey: 'llistat-inc',
        }),
        pb.collection('incidencias_ocultas').getFullList({
          sort: '-created',
          expand: 'usuario_id',
          requestKey: 'llistat-ocult',
        }).catch(() => []),
      ]);
      setIncidencies(recs);
      setOcultacions(ocults);
    } finally { setCarregant(false); }
  }, []);

  useEffect(() => { carrega(); }, [carrega]);

  // Map: incidencia_id -> active ocultacion record (latest activa=true)
  const ocultacioActiva = useMemo(() => {
    const map = new Map();
    // sort by created desc so latest wins
    const sorted = [...ocultacions].sort((a, b) => b.created.localeCompare(a.created));
    for (const o of sorted) {
      if (o.activa && !map.has(o.incidencia_id)) {
        map.set(o.incidencia_id, o);
      }
    }
    return map;
  }, [ocultacions]);

  // History per incidencia (all records, activa and inactive)
  const historialOcultacions = useMemo(() => {
    const map = new Map();
    for (const o of ocultacions) {
      const arr = map.get(o.incidencia_id) || [];
      arr.push(o);
      map.set(o.incidencia_id, arr);
    }
    return map;
  }, [ocultacions]);

  // Role-based visibility: operarios/calidad don't see hidden-for-them incidencias
  const visiblePerRol = useCallback((inc) => {
    const oc = ocultacioActiva.get(inc.id);
    if (!oc) return true;
    if (rol === 'operari' && (oc.oculta_para === 'operarios' || oc.oculta_para === 'todos')) return false;
    if (rol === 'qualitat' && (oc.oculta_para === 'calidad' || oc.oculta_para === 'todos')) return false;
    return true;
  }, [ocultacioActiva, rol]);

  const filtrats = useMemo(() => {
    let arr = [...incidencies];
    // Role-based filter first (operarios/calidad never see hidden-for-them)
    arr = arr.filter(visiblePerRol);

    if (fExclusiva.trim()) {
      const q = fExclusiva.toLowerCase();
      arr = arr.filter((i) => i.expand?.exclusiva?.exclusiva?.toLowerCase().includes(q));
    }
    if (fArticle.trim()) {
      const q = fArticle.toLowerCase();
      arr = arr.filter((i) => i.expand?.exclusiva?.article?.toLowerCase().includes(q));
    }
    if (fGravetat) arr = arr.filter((i) => (i.gravetat || i.prioritat) === fGravetat);
    if (fOrigen) arr = arr.filter((i) => i.origen === fOrigen);
    if (fEstat) arr = arr.filter((i) => i.estat === fEstat);
    if (fDes) arr = arr.filter((i) => i.data_nc && i.data_nc >= fDes);
    if (fFins) arr = arr.filter((i) => i.data_nc && i.data_nc <= fFins + 'T23:59:59');

    // Hidden filters (only relevant for admin/superadmin who see all)
    const esAdmin = rol === 'admin' || rol === 'superadmin';
    if (esAdmin) {
      if (!fMostrarOcultes) {
        arr = arr.filter((i) => !ocultacioActiva.has(i.id));
      }
      if (fNomesOcultes) {
        arr = arr.filter((i) => ocultacioActiva.has(i.id));
      }
      if (fOcultesOperaris) {
        arr = arr.filter((i) => ocultacioActiva.get(i.id)?.oculta_para === 'operarios');
      }
      if (fOcultesCalidad) {
        arr = arr.filter((i) => ocultacioActiva.get(i.id)?.oculta_para === 'calidad');
      }
    }

    if (ordre === 'data_desc') arr.sort((a, b) => b.created.localeCompare(a.created));
    else if (ordre === 'gravetat') {
      const ord = { critica: 0, alta: 1, media: 2, baixa: 3 };
      arr.sort((a, b) => (ord[a.gravetat || a.prioritat] ?? 9) - (ord[b.gravetat || b.prioritat] ?? 9));
    } else if (ordre === 'exclusiva') {
      arr.sort((a, b) => (a.expand?.exclusiva?.exclusiva || '').localeCompare(b.expand?.exclusiva?.exclusiva || ''));
    }
    return arr;
  }, [incidencies, fExclusiva, fArticle, fGravetat, fOrigen, fEstat, fDes, fFins, ordre, visiblePerRol, ocultacioActiva, fMostrarOcultes, fNomesOcultes, fOcultesOperaris, fOcultesCalidad, rol]);

  const clearFilters = () => {
    setFExclusiva(''); setFArticle(''); setFGravetat(''); setFOrigen('');
    setFEstat(''); setFDes(''); setFFins('');
    setFMostrarOcultes(true); setFNomesOcultes(false);
    setFOcultesOperaris(false); setFOcultesCalidad(false);
  };

  // ── Ocultar / Mostrar handlers ────────────────────────────────────────────
  const openOcultarModal = (inc) => {
    setShowOcultarModal(inc);
    setOcultaPara('operarios');
    setMotiuOcult('');
  };

  const confirmOcultar = async () => {
    if (!showOcultarModal) return;
    setSavingOcult(true);
    try {
      // Mark previous active ocultacion for this incidencia as inactive
      const prevActive = ocultacions.find((o) => o.incidencia_id === showOcultarModal.id && o.activa);
      if (prevActive) {
        await pb.collection('incidencias_ocultas').update(prevActive.id, { activa: false }, { requestKey: `deact-${prevActive.id}` });
      }
      await pb.collection('incidencias_ocultas').create({
        incidencia_id: showOcultarModal.id,
        oculta_para: ocultaPara,
        fecha_ocultacion: new Date().toISOString(),
        usuario_id: user?.id || '',
        motivo: motiuOcult || '',
        activa: true,
      }, { requestKey: `ocult-${showOcultarModal.id}` });
      setShowOcultarModal(null);
      await carrega();
    } catch (e) {
      console.error('Error ocultant incidencia:', e);
      alert('Error al ocultar: ' + (e?.message || e));
    } finally {
      setSavingOcult(false);
    }
  };

  const mostrarIncidencia = async (inc) => {
    if (!confirm('¿Mostrar nuevamente esta incidencia a todos?')) return;
    try {
      const prevActive = ocultacions.find((o) => o.incidencia_id === inc.id && o.activa);
      if (prevActive) {
        await pb.collection('incidencias_ocultas').update(prevActive.id, { activa: false }, { requestKey: `show-${prevActive.id}` });
      }
      await carrega();
    } catch (e) {
      console.error('Error mostrant incidencia:', e);
      alert('Error al mostrar: ' + (e?.message || e));
    }
  };

  const exportCSV = () => {
    const rows = filtrats.map((i) => [
      i.codi, i.expand?.exclusiva?.exclusiva || '', i.expand?.exclusiva?.article || '',
      i.descripcio?.replace(/,/g, ';') || '', i.gravetat || i.prioritat || '',
      i.origen || '', i.estat || '',
      i.data_nc ? new Date(i.data_nc).toLocaleDateString('es-ES') : '',
      i.contacte_nom || '', i.contacte_telefon || '', i.contacte_email || '',
      i.solucio_implantada?.replace(/,/g, ';') || '', i.accio_preventiva?.replace(/,/g, ';') || '',
    ].join(','));
    const csv = ['Código,Exclusiva,Artículo,Descripción,Gravedad,Origen,Estado,Fecha,Contacto Nombre,Teléfono,Email,Solución,Acción preventiva', ...rows].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'incidencias.csv';
    a.click();
  };

  // Chart data
  const chartOrigen = useMemo(() => {
    const counts = {};
    filtrats.forEach((i) => { const k = i.origen || 'onatex'; counts[k] = (counts[k] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name: name === 'client' ? 'Cliente' : 'Onatex', value }));
  }, [filtrats]);

  const chartGravetat = useMemo(() => {
    const order = ['critica', 'alta', 'media', 'baixa'];
    const counts = {};
    filtrats.forEach((i) => { const k = i.gravetat || i.prioritat || 'media'; counts[k] = (counts[k] || 0) + 1; });
    return order.filter((k) => counts[k]).map((k) => ({ name: k.charAt(0).toUpperCase() + k.slice(1), value: counts[k] }));
  }, [filtrats]);

  const chartEstat = useMemo(() => {
    const counts = {};
    filtrats.forEach((i) => { const k = i.estat || 'oberta'; counts[k] = (counts[k] || 0) + 1; });
    return Object.entries(counts).map(([k, v]) => ({ name: k === 'oberta' ? 'Abierta' : k === 'en_seguiment' ? 'Seguimiento' : 'Cerrada', value: v }));
  }, [filtrats]);

  const chartExclusiva = useMemo(() => {
    const counts = {};
    filtrats.forEach((i) => { const k = i.expand?.exclusiva?.exclusiva || 'Sin exclusiva'; counts[k] = (counts[k] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value]) => ({ name, value }));
  }, [filtrats]);

  const articles = useMemo(() => [...new Set(incidencies.map((i) => i.expand?.exclusiva?.article).filter(Boolean))], [incidencies]);

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl uppercase">Listado de incidencias</h2>
          <p className="text-sm text-muted-foreground">{filtrats.length} incidencias encontradas</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setVista(vista === 'taula' ? 'grafics' : 'taula')}
            className="flex items-center gap-1 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-secondary">
            {vista === 'taula' ? 'Ver gráficos' : 'Ver tabla'}
          </button>
          <button onClick={exportCSV} className="flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
            <Download className="h-4 w-4" /> Exportar CSV
          </button>
          <button onClick={carrega} className="rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-secondary">↺</button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs font-semibold block mb-1">Exclusiva</label>
            <input value={fExclusiva} onChange={(e) => setFExclusiva(e.target.value)}
              placeholder="Código exclusiva..." className="h-9 w-36 rounded-md border border-input bg-background px-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1">Artículo</label>
            <select value={fArticle} onChange={(e) => setFArticle(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm">
              <option value="">Todos</option>
              {articles.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1">Gravedad</label>
            <select value={fGravetat} onChange={(e) => setFGravetat(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm">
              <option value="">Todas</option>
              <option value="critica">Crítica</option>
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="baixa">Baja</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1">Origen</label>
            <select value={fOrigen} onChange={(e) => setFOrigen(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm">
              <option value="">Todos</option>
              <option value="onatex">Onatex</option>
              <option value="client">Cliente</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1">Estado</label>
            <select value={fEstat} onChange={(e) => setFEstat(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm">
              <option value="">Todos</option>
              <option value="oberta">Abierta</option>
              <option value="en_seguiment">En seguimiento</option>
              <option value="tancada">Cerrada</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1">Desde</label>
            <input type="date" value={fDes} onChange={(e) => setFDes(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1">Hasta</label>
            <input type="date" value={fFins} onChange={(e) => setFFins(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1">Ordenar</label>
            <select value={ordre} onChange={(e) => setOrdre(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm">
              <option value="data_desc">Fecha (más recientes)</option>
              <option value="gravetat">Gravedad (crítica primero)</option>
              <option value="exclusiva">Exclusiva (A-Z)</option>
            </select>
          </div>
          <button onClick={clearFilters} className="h-9 flex items-center gap-1 rounded-md border border-border bg-secondary px-3 text-sm hover:bg-secondary/80">
            <X className="h-3 w-3" /> Limpiar
          </button>
        </div>
        {/* Hidden filters (admin/superadmin only) */}
        {(rol === 'admin' || rol === 'superadmin') && (
          <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-center gap-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <EyeOff className="h-3.5 w-3.5" /> Incidencias ocultas:
            </p>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="checkbox" checked={fMostrarOcultes} onChange={(e) => setFMostrarOcultes(e.target.checked)} className="rounded" />
              Mostrar ocultas
            </label>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="checkbox" checked={fNomesOcultes} onChange={(e) => setFNomesOcultes(e.target.checked)} className="rounded" />
              Solo ocultas
            </label>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="checkbox" checked={fOcultesOperaris} onChange={(e) => setFOcultesOperaris(e.target.checked)} className="rounded" />
              Ocultas para operarios
            </label>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="checkbox" checked={fOcultesCalidad} onChange={(e) => setFOcultesCalidad(e.target.checked)} className="rounded" />
              Ocultas para calidad
            </label>
            <span className="ml-auto text-xs text-muted-foreground">
              {filtrats.filter((i) => ocultacioActiva.has(i.id)).length} ocultas · {filtrats.length} total
            </span>
          </div>
        )}
      </div>

      {carregant ? (
        <div className="h-48 animate-pulse rounded-lg bg-secondary" />
      ) : vista === 'grafics' ? (
        /* CHARTS */
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-4">
            <h4 className="font-semibold mb-3 text-sm uppercase tracking-wide">Por origen</h4>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={chartOrigen} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({name, value}) => `${name}: ${value}`}>
                  {chartOrigen.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <h4 className="font-semibold mb-3 text-sm uppercase tracking-wide">Por gravedad</h4>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartGravetat}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(var(--accent))">
                  {chartGravetat.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <h4 className="font-semibold mb-3 text-sm uppercase tracking-wide">Por estado</h4>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={chartEstat} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({name, value}) => `${name}: ${value}`}>
                  {chartEstat.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <h4 className="font-semibold mb-3 text-sm uppercase tracking-wide">Top 10 exclusivas con incidencias</h4>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartExclusiva} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        /* TABLE */
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="overflow-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="bg-secondary text-left text-xs uppercase">
                <tr>
                  {['Código', 'Exclusiva', 'Artículo', 'Descripción', 'Fotos', 'Gravedad', 'Origen', 'Estado', 'Visibilidad', 'Fecha', 'Contacto', 'Acciones'].map((h) => (
                    <th key={h} className="px-3 py-2 font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtrats.length === 0 ? (
                  <tr><td colSpan={12} className="p-8 text-center text-muted-foreground">Sin incidencias con los filtros actuales.</td></tr>
                ) : filtrats.map((inc) => {
                  const oc = ocultacioActiva.get(inc.id);
                  return (
                  <tr key={inc.id} className={`hover:bg-secondary/30 ${oc ? 'bg-gray-50/60' : ''}`}>
                    <td className="px-3 py-2 font-mono text-xs font-semibold">{inc.codi || '—'}</td>
                    <td className="px-3 py-2 font-semibold whitespace-nowrap">{inc.expand?.exclusiva?.exclusiva || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{inc.expand?.exclusiva?.article || '—'}</td>
                    <td className="px-3 py-2 max-w-xs">
                      <p className="line-clamp-2 text-xs">{inc.descripcio || '—'}</p>
                    </td>
                    <td className="px-3 py-2">
                      <FotosGallery fotos={inc.fotos} collectionId={inc.collectionId} recordId={inc.id} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <GravetatBadge gravetat={inc.gravetat} prioritat={inc.prioritat} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <OrigenBadge origen={inc.origen} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <EstatBadge estat={inc.estat} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {oc ? <OcultaBadge ocultaPara={oc.oculta_para} /> : <span className="text-xs text-muted-foreground">Visible</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs">
                      {inc.data_nc ? new Date(inc.data_nc).toLocaleDateString('es-ES') : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {inc.contacte_nom ? (
                        <div>
                          <p className="font-medium">{inc.contacte_nom}</p>
                          {inc.contacte_telefon && <p className="text-muted-foreground">{inc.contacte_telefon}</p>}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setDetall(inc)}
                          className="flex items-center gap-1 rounded px-2 py-1 text-xs bg-secondary hover:bg-secondary/80 font-semibold">
                          <Eye className="h-3 w-3" /> Ver
                        </button>
                        {(rol === 'admin' || rol === 'superadmin') && (
                          oc ? (
                            <button onClick={() => mostrarIncidencia(inc)}
                              className="flex items-center gap-1 rounded px-2 py-1 text-xs bg-emerald-100 text-emerald-800 hover:bg-emerald-200 font-semibold whitespace-nowrap">
                              <Eye className="h-3 w-3" /> Mostrar
                            </button>
                          ) : (
                            <button onClick={() => openOcultarModal(inc)}
                              className="flex items-center gap-1 rounded px-2 py-1 text-xs bg-gray-200 text-gray-700 hover:bg-gray-300 font-semibold whitespace-nowrap">
                              <EyeOff className="h-3 w-3" /> Ocultar
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {detall && (
        <DetalleModal
          inc={detall}
          historial={historialOcultacions.get(detall.id) || []}
          ocultacioActiva={ocultacioActiva.get(detall.id)}
          onClose={() => setDetall(null)}
          onSaved={() => { carrega(); setDetall(null); }}
        />
      )}

      {/* Ocultar confirmation modal */}
      {showOcultarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowOcultarModal(null)}>
          <div className="w-full max-w-md rounded-lg bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h3 className="font-display text-2xl uppercase">¿Ocultar esta incidencia?</h3>
              <button onClick={() => setShowOcultarModal(null)} className="rounded-md p-1.5 hover:bg-secondary"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div className="rounded-md bg-secondary/50 p-3 text-sm">
                <p className="font-mono font-semibold">{showOcultarModal.codi || 'Incidencia'}</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{showOcultarModal.descripcio || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Ocultar para</p>
                <div className="space-y-2">
                  {[
                    { v: 'operarios', label: 'Ocultar solo para operarios' },
                    { v: 'calidad', label: 'Ocultar para operarios y calidad' },
                    { v: 'todos', label: 'Ocultar para todos' },
                  ].map(({ v, label }) => (
                    <label key={v} className={`flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-sm cursor-pointer transition ${ocultaPara === v ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'border-border hover:bg-secondary/50'}`}>
                      <input type="radio" name="oculta_para" value={v} checked={ocultaPara === v} onChange={() => setOcultaPara(v)} />
                      <span className="font-medium">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 block">Motivo (opcional)</label>
                <textarea value={motiuOcult} onChange={(e) => setMotiuOcult(e.target.value)} rows={2}
                  placeholder="Motivo de la ocultación..."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex gap-2 border-t border-border px-5 py-4">
              <button onClick={() => setShowOcultarModal(null)}
                className="flex-1 rounded-md border border-border px-4 py-2.5 text-sm font-semibold hover:bg-secondary">
                Cancelar
              </button>
              <button onClick={confirmOcultar} disabled={savingOcult}
                className="flex-1 flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
                <EyeOff className="h-4 w-4" /> {savingOcult ? 'Ocultando...' : 'Ocultar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

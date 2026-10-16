import React, { useState } from 'react';
import { CheckCircle2, Image, Loader2, Plus, Trash2, Video, X } from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { MultiFileDrop } from '@/components/common/DragDropUpload';

const AREA_OPTIONS = [
  { value: 'estampacion', label: 'Estampación' },
  { value: 'confeccio', label: 'Confección' },
  { value: 'acabats', label: 'Acabados' },
  { value: 'oficina_tecnica', label: 'Oficina Técnica' },
  { value: 'logistica', label: 'Logística' },
];

const GRAVETAT_OPTIONS = [
  { value: 'baixa', label: 'Baja' },
  { value: 'media', label: 'Media' },
  { value: 'alta', label: 'Alta' },
  { value: 'critica', label: 'Crítica' },
];

const ESTAT_OPTIONS = [
  { value: 'oberta', label: 'Abierta' },
  { value: 'en_seguiment', label: 'En revisión' },
  { value: 'tancada', label: 'Cerrada' },
];

const ORIGEN_OPTIONS = [
  { value: 'onatex', label: 'Producción / Calidad (Onatex)' },
  { value: 'client', label: 'Cliente' },
];

function emptyForm() {
  return {
    exclusiva_raw: '',
    descripcio: '',
    solucio_implantada: '',
    accio_preventiva: '',
    area: '',
    origen: 'onatex',
    gravetat: 'media',
    estat: 'oberta',
    data_nc: new Date().toISOString().slice(0, 10),
    contacte_nom: '',
    contacte_telefon: '',
    contacte_email: '',
  };
}

export default function NovaIncidencia() {
  const [form, setForm] = useState(emptyForm());
  const [fotos, setFotos] = useState([]); // File[]
  const [videos, setVideos] = useState([]); // File[]
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(null);
  const [errors, setErrors] = useState({});


  const set = (k, v) => {
    setForm((prev) => ({ ...prev, [k]: v }));
    setErrors((prev) => { const n = { ...prev }; delete n[k]; return n; });
  };

  const addFotos = (files) => {
    setFotos((prev) => [...prev, ...Array.from(files)].slice(0, 10));
  };

  const addVideos = (files) => {
    setVideos((prev) => [...prev, ...Array.from(files)].slice(0, 5));
  };

  const validate = () => {
    const e = {};
    if (!form.exclusiva_raw.trim()) e.exclusiva_raw = 'Exclusiva requerida';
    if (!form.descripcio.trim()) e.descripcio = 'Descripción requerida';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const getNextCode = async () => {
    let nextNum = 1;
    try {
      const last = await pb.collection('no_conformitats').getList(1, 1, {
        sort: '-codi', filter: 'codi != ""', requestKey: 'last-inc-nova',
      });
      if (last.items.length) {
        const m = last.items[0].codi?.match(/(\d+)$/);
        if (m) nextNum = parseInt(m[1]) + 1;
      }
    } catch {}
    return `INC-${String(nextNum).padStart(3, '0')}`;
  };

  const getExclusivaId = async (code) => {
    try {
      const rec = await pb.collection('exclusives').getFirstListItem(
        pb.filter('exclusiva = {:c}', { c: code.trim() }),
        { requestKey: 'excl-nova' }
      );
      return rec.id;
    } catch {
      return null;
    }
  };

  const handleSave = async (addAnother = false) => {
    if (!validate()) return;
    setSaving(true);
    setSuccess(null);
    try {
      const codi = await getNextCode();
      const exclusivaId = await getExclusivaId(form.exclusiva_raw);
      if (!exclusivaId) {
        setErrors((prev) => ({ ...prev, exclusiva_raw: `Exclusiva "${form.exclusiva_raw}" no encontrada` }));
        setSaving(false);
        return;
      }

      const fd = new FormData();
      fd.append('codi', codi);
      fd.append('exclusiva', exclusivaId);
      fd.append('descripcio', form.descripcio);
      fd.append('solucio_implantada', form.solucio_implantada);
      fd.append('accio_preventiva', form.accio_preventiva);
      if (form.area) fd.append('area', form.area);
      fd.append('origen', form.origen);
      fd.append('gravetat', form.gravetat);
      fd.append('estat', form.estat);
      fd.append('data_nc', new Date(form.data_nc).toISOString());
      if (form.contacte_nom) fd.append('contacte_nom', form.contacte_nom);
      if (form.contacte_telefon) fd.append('contacte_telefon', form.contacte_telefon);
      if (form.contacte_email) fd.append('contacte_email', form.contacte_email);
      fd.append('operari_que_detecto', pb.authStore.record?.id || '');
      fotos.forEach((f) => fd.append('fotos', f));
      videos.forEach((v) => fd.append('videos', v));

      await pb.collection('no_conformitats').create(fd);
      setSuccess(codi);

      if (addAnother) {
        setForm(emptyForm());
        setFotos([]);
        setVideos([]);
      }
    } catch (err) {
      setErrors({ _general: err.message || 'Error al guardar' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setForm(emptyForm());
    setFotos([]);
    setVideos([]);
    setSuccess(null);
    setErrors({});
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="font-display text-2xl uppercase text-primary">Nueva incidencia</h2>
        <p className="mt-1 text-sm text-muted-foreground">Formulario detallado para registrar una incidencia con fotos y vídeos</p>
      </div>

      {success && (
        <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
          <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-green-800">Incidencia guardada con código <span className="font-mono">{success}</span></p>
          </div>
          <button onClick={handleReset} className="text-xs font-semibold text-green-700 underline">Crear otra</button>
        </div>
      )}

      {errors._general && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{errors._general}</div>
      )}

      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
        {/* Exclusiva + Área */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold mb-1.5">Exclusiva <span className="text-destructive">*</span></label>
            <input
              value={form.exclusiva_raw}
              onChange={(e) => set('exclusiva_raw', e.target.value)}
              placeholder="EXC-001"
              className={`w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring ${errors.exclusiva_raw ? 'border-destructive' : 'border-input'}`}
            />
            {errors.exclusiva_raw && <p className="mt-1 text-xs text-destructive">{errors.exclusiva_raw}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5">Área / Departamento</label>
            <select value={form.area} onChange={(e) => set('area', e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="">Sin área</option>
              {AREA_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {/* Origen + Gravedad + Estado */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-semibold mb-1.5">Origen</label>
            <select value={form.origen} onChange={(e) => set('origen', e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              {ORIGEN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5">Gravedad</label>
            <select value={form.gravetat} onChange={(e) => set('gravetat', e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              {GRAVETAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5">Estado</label>
            <select value={form.estat} onChange={(e) => set('estat', e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              {ESTAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {/* Fecha */}
        <div className="sm:w-1/3">
          <label className="block text-xs font-semibold mb-1.5">Fecha de detección</label>
          <input type="date" value={form.data_nc} onChange={(e) => set('data_nc', e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>

        {/* Descripción */}
        <div>
          <label className="block text-xs font-semibold mb-1.5">Descripción de la incidencia <span className="text-destructive">*</span></label>
          <textarea value={form.descripcio} onChange={(e) => set('descripcio', e.target.value)} rows={4}
            placeholder="Describe detalladamente el problema detectado..."
            className={`w-full rounded-md border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring ${errors.descripcio ? 'border-destructive' : 'border-input'}`}
          />
          {errors.descripcio && <p className="mt-1 text-xs text-destructive">{errors.descripcio}</p>}
        </div>

        {/* Solución */}
        <div>
          <label className="block text-xs font-semibold mb-1.5">Solución implantada</label>
          <textarea value={form.solucio_implantada} onChange={(e) => set('solucio_implantada', e.target.value)} rows={3}
            placeholder="Describe la solución aplicada..."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Acción preventiva */}
        <div>
          <label className="block text-xs font-semibold mb-1.5">Acción preventiva</label>
          <textarea value={form.accio_preventiva} onChange={(e) => set('accio_preventiva', e.target.value)} rows={3}
            placeholder="Medidas para evitar que vuelva a ocurrir..."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Contact (only for client origin) */}
        {form.origen === 'client' && (
          <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 space-y-3">
            <p className="text-xs font-semibold text-purple-800 uppercase tracking-wide">Contacto del cliente</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Nombre</label>
                <input value={form.contacte_nom} onChange={(e) => set('contacte_nom', e.target.value)}
                  className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm" placeholder="Nombre contacto" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Teléfono</label>
                <input value={form.contacte_telefon} onChange={(e) => set('contacte_telefon', e.target.value)}
                  className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm" placeholder="+34 600..." />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Email</label>
                <input type="email" value={form.contacte_email} onChange={(e) => set('contacte_email', e.target.value)}
                  className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm" placeholder="email@cliente.com" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Fotos ── */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-3">
        <div className="flex items-center gap-2">
          <Image className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Fotos ({fotos.length}/10)</h3>
        </div>
        <MultiFileDrop
          files={fotos}
          onAdd={(files) => addFotos(files)}
          onRemove={(i) => setFotos((prev) => prev.filter((_, j) => j !== i))}
          accept="image/jpeg,image/png,image/webp,image/heic,image/*"
          maxFiles={10}
          maxSizeMB={50}
          label="Arrastra fotos aquí"
          hint="JPG, PNG, WebP, HEIC · Máx. 10 fotos · 50 MB c/u"
        />
      </div>

      {/* ── Vídeos ── */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-3">
        <div className="flex items-center gap-2">
          <Video className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Vídeos ({videos.length}/5)</h3>
        </div>
        <MultiFileDrop
          files={videos}
          onAdd={(files) => addVideos(files)}
          onRemove={(i) => setVideos((prev) => prev.filter((_, j) => j !== i))}
          accept="video/mp4,video/webm,video/ogg,video/quicktime,video/x-msvideo,video/*"
          maxFiles={5}
          maxSizeMB={100}
          label="Arrastra vídeos aquí"
          hint="MP4, WebM, MOV, AVI · Máx. 5 vídeos · 100 MB c/u"
        />
      </div>

      {/* ── Actions ── */}
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={() => handleSave(false)}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition active:scale-95 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Guardar incidencia
        </button>
        <button
          onClick={() => handleSave(true)}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-semibold transition hover:bg-secondary active:scale-95 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Guardar y crear otra
        </button>
        <button onClick={handleReset} className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted transition">
          Limpiar
        </button>
      </div>
    </div>
  );
}

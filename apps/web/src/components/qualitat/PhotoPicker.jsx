import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Images, Plus, X, RefreshCcw } from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { MultiFileDrop } from '@/components/common/DragDropUpload';

/**
 * PhotoPicker — picks multiple photos from three sources:
 *   1. Existing photos of the exclusiva (album): no_conformitats.fotos + retrabajos.fotos_antes/fotos_despues
 *   2. Camera (new photo, mobile capture)
 *   3. Gallery / drag-drop (MultiFileDrop)
 *
 * Props:
 *  - files: File[]                       current selection
 *  - onAdd: (File[]) => void             add files
 *  - onRemove: (index) => void           remove by index
 *  - exclusivaId: string                 exclusiva whose album to load
 *  - maxFiles: number (default 10)
 *  - maxSizeMB: number (default 10)
 *  - label, hint, className
 */
export default function PhotoPicker({
  files = [], onAdd, onRemove,
  exclusivaId, maxFiles = 10, maxSizeMB = 10,
  label = 'Fotos', hint, className = '',
}) {
  const [album, setAlbum] = useState([]); // [{ url, name, collectionId, id, file }]
  const [loadingAlbum, setLoadingAlbum] = useState(false);
  const [showAlbum, setShowAlbum] = useState(false);
  const [busy, setBusy] = useState(false);
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);
  const remaining = maxFiles - files.length;

  // Load album (existing photos for this exclusiva)
  const carregaAlbum = useCallback(async () => {
    if (!exclusivaId) { setAlbum([]); return; }
    setLoadingAlbum(true);
    try {
      const [ncs, retrs] = await Promise.all([
        pb.collection('no_conformitats').getFullList({
          filter: `exclusiva = "${exclusivaId}"`,
          fields: 'id,codi,fotos,collectionId',
          requestKey: `album-nc-${exclusivaId}`,
        }).catch(() => []),
        pb.collection('retrabajos').getFullList({
          filter: `exclusiva = "${exclusivaId}"`,
          fields: 'id,operacion_original,fotos_antes,fotos_despues,collectionId',
          requestKey: `album-retr-${exclusivaId}`,
        }).catch(() => []),
      ]);
      const items = [];
      for (const nc of ncs) {
        const fotos = Array.isArray(nc.fotos) ? nc.fotos : (nc.fotos ? [nc.fotos] : []);
        for (const f of fotos) {
          items.push({
            url: pb.files.getURL({ collectionId: nc.collectionId, id: nc.id }, f, { thumb: '200x200' }),
            fullUrl: pb.files.getURL({ collectionId: nc.collectionId, id: nc.id }, f),
            name: `${nc.codi || 'NC'} — ${f}`,
          });
        }
      }
      for (const r of retrs) {
        for (const field of ['fotos_antes', 'fotos_despues']) {
          const fotos = Array.isArray(r[field]) ? r[field] : (r[field] ? [r[field]] : []);
          for (const f of fotos) {
            items.push({
              url: pb.files.getURL({ collectionId: r.collectionId, id: r.id }, f, { thumb: '200x200' }),
              fullUrl: pb.files.getURL({ collectionId: r.collectionId, id: r.id }, f),
              name: `Retrabajo ${r.operacion_original || ''} — ${f}`,
            });
          }
        }
      }
      setAlbum(items);
    } catch { setAlbum([]); }
    finally { setLoadingAlbum(false); }
  }, [exclusivaId]);

  useEffect(() => { carregaAlbum(); }, [carregaAlbum]);

  // Fetch a URL → File (for album selection)
  const urlToFile = async (url, name) => {
    const res = await fetch(url);
    const blob = await res.blob();
    const ext = (name.split('.').pop() || 'jpg').toLowerCase();
    const mime = blob.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    return new File([blob], name || `foto-${Date.now()}.${ext}`, { type: mime });
  };

  const addFromAlbum = async (item) => {
    if (remaining <= 0) return;
    setBusy(true);
    try {
      const file = await urlToFile(item.fullUrl, item.name);
      onAdd([file]);
    } catch { /* ignore */ }
    finally { setBusy(false); }
  };

  const handleInput = (e) => {
    const incoming = Array.from(e.target.files || []);
    if (incoming.length) onAdd(incoming.slice(0, remaining));
    e.target.value = '';
  };

  return (
    <div className={className}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase text-muted-foreground">{label}</span>
        <button type="button" onClick={() => cameraRef.current?.click()} disabled={remaining <= 0}
          className="flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:border-primary/50 active:scale-95 disabled:opacity-50">
          <Camera className="h-3.5 w-3.5" /> Cámara
        </button>
        <button type="button" onClick={() => galleryRef.current?.click()} disabled={remaining <= 0}
          className="flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:border-primary/50 active:scale-95 disabled:opacity-50">
          <Images className="h-3.5 w-3.5" /> Galería
        </button>
        <button type="button" onClick={() => { setShowAlbum(s => !s); if (!showAlbum) carregaAlbum(); }} disabled={remaining <= 0}
          className="flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:border-primary/50 active:scale-95 disabled:opacity-50">
          <Images className="h-3.5 w-3.5" /> Álbum ({album.length})
        </button>
        {files.length > 0 && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{files.length}/{maxFiles}</span>
        )}
        {/* hidden inputs */}
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleInput} />
        <input ref={galleryRef} type="file" accept="image/*,image/heic" multiple className="hidden" onChange={handleInput} />
      </div>

      {/* Album panel */}
      {showAlbum && (
        <div className="mb-3 rounded-xl border border-border bg-secondary/30 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Fotos existentes de la exclusiva</p>
            <button type="button" onClick={carregaAlbum} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              <RefreshCcw className="h-3 w-3" /> Actualizar
            </button>
          </div>
          {loadingAlbum ? (
            <p className="py-3 text-center text-xs text-muted-foreground">Cargando...</p>
          ) : album.length === 0 ? (
            <p className="py-3 text-center text-xs text-muted-foreground">No hay fotos previas para esta exclusiva.</p>
          ) : (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {album.map((it, i) => (
                <button key={i} type="button" disabled={busy || remaining <= 0} onClick={() => addFromAlbum(it)}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-border hover:border-primary active:scale-95 disabled:opacity-50">
                  <img src={it.url} alt={it.name} className="h-full w-full object-cover" loading="lazy" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">
                    <Plus className="h-5 w-5 text-white" />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Drag-drop zone */}
      <MultiFileDrop
        files={files}
        onAdd={(fs) => onAdd(fs.slice(0, remaining))}
        onRemove={onRemove}
        accept="image/*,image/heic"
        maxFiles={maxFiles}
        maxSizeMB={maxSizeMB}
        label={hint || 'Arrastra fotos aquí'}
        hint="JPG, PNG, WebP, HEIC"
      />
    </div>
  );
}

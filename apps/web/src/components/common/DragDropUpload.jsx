import React, { useCallback, useRef, useState } from 'react';
import {
  FileText, Image as ImageIcon, Video, FileSpreadsheet, File,
  Upload, X, CheckCircle2, AlertCircle, Plus, Trash2,
} from 'lucide-react';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function getFileIcon(file) {
  if (!file) return File;
  const t = file.type || '';
  const n = file.name?.toLowerCase() || '';
  if (t.startsWith('image/')) return ImageIcon;
  if (t.startsWith('video/')) return Video;
  if (t === 'application/pdf' || n.endsWith('.pdf')) return FileText;
  if (n.match(/\.(xlsx?|csv)$/)) return FileSpreadsheet;
  return File;
}

function fileMatchesAccept(file, accept) {
  if (!accept) return true;
  const accepted = accept.split(',').map((s) => s.trim().toLowerCase());
  const mime = (file.type || '').toLowerCase();
  const ext = '.' + (file.name?.split('.').pop() || '').toLowerCase();
  return accepted.some((a) => {
    if (a.startsWith('.')) return ext === a;
    if (a.endsWith('/*')) return mime.startsWith(a.replace('/*', '/'));
    return mime === a;
  });
}

// ─── Single-file drop zone ─────────────────────────────────────────────────────
/**
 * Props:
 * - file: File | null
 * - onFile: (File) => void
 * - onClear: () => void
 * - accept: string  (same syntax as <input accept>)
 * - maxSizeMB: number (default 50)
 * - label: string
 * - hint: string
 * - className: string
 */
export function SingleFileDrop({
  file, onFile, onClear, accept, maxSizeMB = 50, label, hint, className = '',
}) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const maxBytes = maxSizeMB * 1024 * 1024;

  const validate = useCallback((f) => {
    if (!fileMatchesAccept(f, accept)) {
      setError(`Tipo no permitido. Acepta: ${accept || 'cualquier archivo'}`);
      return false;
    }
    if (f.size > maxBytes) {
      setError(`Archivo demasiado grande. Máximo ${maxSizeMB} MB (este: ${formatBytes(f.size)})`);
      return false;
    }
    setError('');
    return true;
  }, [accept, maxBytes, maxSizeMB]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && validate(f)) onFile(f);
  }, [onFile, validate]);

  const handleInput = (e) => {
    const f = e.target.files?.[0];
    if (f && validate(f)) onFile(f);
    e.target.value = '';
  };

  const Icon = getFileIcon(file);
  const isImage = file?.type?.startsWith('image/');

  return (
    <div className={className}>
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onClick={() => !file && inputRef.current?.click()}
        className={`relative rounded-xl border-2 border-dashed transition-all
          ${file
            ? 'border-[hsl(var(--ok))] bg-[hsl(var(--ok))]/5 cursor-default'
            : dragging
              ? 'border-primary bg-primary/5 scale-[1.01] cursor-copy'
              : 'border-border hover:border-primary/60 hover:bg-muted/40 cursor-pointer'
          }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={handleInput}
        />

        {file ? (
          <div className="flex items-start gap-4 p-4">
            {isImage ? (
              <img
                src={URL.createObjectURL(file)}
                alt=""
                className="h-16 w-16 shrink-0 rounded-lg object-cover border border-border"
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--ok))]/15 border border-[hsl(var(--ok))]/30">
                <Icon className="h-8 w-8 text-[hsl(var(--ok))]" />
              </div>
            )}
            <div className="flex-1 min-w-0 pt-1">
              <p className="font-semibold text-sm text-foreground truncate">{file.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{formatBytes(file.size)}</p>
              <p className="text-xs text-[hsl(var(--ok))] mt-1 font-medium flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Archivo cargado
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-1.5">
              <button
                onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition"
              >
                Cambiar
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setError(''); onClear(); }}
                className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition"
              >
                Eliminar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
            <div className={`flex h-14 w-14 items-center justify-center rounded-xl border-2 border-dashed transition-colors
              ${dragging ? 'border-primary bg-primary/10' : 'border-border bg-muted/50'}`}>
              <Upload className={`h-7 w-7 transition-colors ${dragging ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                <span className="text-primary">{label || 'Arrastra un archivo aquí'}</span>{' '}
                o haz click para seleccionar
              </p>
              {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
              {maxSizeMB && (
                <p className="mt-0.5 text-xs text-muted-foreground">Máx. {maxSizeMB} MB</p>
              )}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}
    </div>
  );
}

// ─── Multi-file media drop zone (images + videos) ─────────────────────────────
/**
 * Props:
 * - files: Array<File>
 * - onAdd: (File[]) => void
 * - onRemove: (index) => void
 * - accept: string
 * - maxFiles: number
 * - maxSizeMB: number
 * - label: string
 * - hint: string
 * - className: string
 */
export function MultiFileDrop({
  files = [], onAdd, onRemove,
  accept = 'image/*', maxFiles = 10, maxSizeMB = 50,
  label, hint, className = '',
}) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const maxBytes = maxSizeMB * 1024 * 1024;
  const remaining = maxFiles - files.length;

  const validate = useCallback((f) => {
    if (!fileMatchesAccept(f, accept)) return false;
    if (f.size > maxBytes) return false;
    return true;
  }, [accept, maxBytes]);

  const addFiles = useCallback((incoming) => {
    const valid = Array.from(incoming).filter(validate);
    if (!valid.length) {
      setError('Algunos archivos no son válidos (tipo o tamaño).');
      return;
    }
    setError('');
    onAdd(valid.slice(0, remaining));
  }, [validate, onAdd, remaining]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    if (remaining <= 0) return;
    addFiles(e.dataTransfer.files);
  }, [addFiles, remaining]);

  const isImageAccept = accept.includes('image');

  return (
    <div className={`space-y-2 ${className}`}>
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); if (remaining > 0) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onClick={() => remaining > 0 && inputRef.current?.click()}
        className={`relative rounded-xl border-2 border-dashed transition-all text-center
          ${remaining <= 0
            ? 'border-border bg-muted/20 cursor-not-allowed opacity-60'
            : dragging
              ? 'border-primary bg-primary/5 scale-[1.01] cursor-copy'
              : 'border-border hover:border-primary/60 hover:bg-muted/40 cursor-pointer'
          }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
        />
        <div className="flex items-center justify-center gap-3 px-4 py-4">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors
            ${dragging ? 'border-primary bg-primary/10' : 'border-border bg-muted/50'}`}>
            {isImageAccept
              ? <ImageIcon className={`h-5 w-5 ${dragging ? 'text-primary' : 'text-muted-foreground'}`} />
              : <Video className={`h-5 w-5 ${dragging ? 'text-primary' : 'text-muted-foreground'}`} />
            }
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-foreground">
              {label || (isImageAccept ? 'Arrastra fotos aquí' : 'Arrastra archivos aquí')}
              {files.length > 0 && (
                <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                  {files.length}/{maxFiles}
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {hint || `o haz click · Máx. ${maxFiles} archivos · ${maxSizeMB} MB c/u`}
            </p>
          </div>
          {remaining > 0 && (
            <div className="ml-auto shrink-0">
              <Plus className={`h-5 w-5 ${dragging ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => {
            const isImg = f.type?.startsWith('image/');
            const isVid = f.type?.startsWith('video/');
            return (
              <div key={i} className="group relative">
                {isImg ? (
                  <div className="relative h-16 w-16 overflow-hidden rounded-lg border border-border">
                    <img src={URL.createObjectURL(f)} alt="" className="h-full w-full object-cover" />
                    <button
                      onClick={() => onRemove(i)}
                      className="absolute right-0.5 top-0.5 hidden group-hover:flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-red-600 transition"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : isVid ? (
                  <div className="relative flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 pr-8">
                    <Video className="h-4 w-4 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate max-w-[100px]">{f.name}</p>
                      <p className="text-xs text-muted-foreground">{formatBytes(f.size)}</p>
                    </div>
                    <button
                      onClick={() => onRemove(i)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded text-muted-foreground hover:text-destructive transition"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="relative flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 pr-8">
                    <File className="h-4 w-4 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate max-w-[100px]">{f.name}</p>
                      <p className="text-xs text-muted-foreground">{formatBytes(f.size)}</p>
                    </div>
                    <button
                      onClick={() => onRemove(i)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded text-muted-foreground hover:text-destructive transition"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Default export (backwards-compat alias for single file) ──────────────────
export default SingleFileDrop;

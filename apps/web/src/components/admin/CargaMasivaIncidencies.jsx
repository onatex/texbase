import React, { useCallback, useRef, useState } from 'react';
import {
  AlertCircle, CheckCircle2, ChevronRight, Download, Edit2, FileText, FileUp,
  FolderArchive, ImageIcon, Loader2, Trash2, Upload, X, ZoomIn,
} from 'lucide-react';
import pb from '@/lib/pocketbaseClient';

// ─── Constants ──────────────────────────────────────────────────────────────
const GRAVETAT_MAP = {
  baja: 'baixa', baixa: 'baixa', media: 'media', medio: 'media',
  alta: 'alta', critica: 'critica', crítica: 'critica',
};
const ORIGEN_MAP = {
  onatex: 'onatex', produccion: 'onatex', producció: 'onatex', calidad: 'onatex',
  client: 'client', cliente: 'client',
};
const ESTAT_MAP = {
  abierta: 'oberta', oberta: 'oberta', cerrada: 'tancada', tancada: 'tancada',
  'en revision': 'en_seguiment', 'en revisión': 'en_seguiment',
  en_seguiment: 'en_seguiment', 'en seguiment': 'en_seguiment',
};
const AREA_MAP = {
  estampacion: 'estampacion', estampació: 'estampacion',
  confeccio: 'confeccio', confeccion: 'confeccio', confección: 'confeccio',
  acabats: 'acabats', acabados: 'acabats',
  oficina: 'oficina_tecnica', 'oficina tecnica': 'oficina_tecnica', 'oficina tècnica': 'oficina_tecnica',
  logistica: 'logistica', logística: 'logistica',
};
const AREA_LABELS = {
  estampacion: 'Estampación', confeccio: 'Confección',
  acabats: 'Acabados', oficina_tecnica: 'Oficina Técnica', logistica: 'Logística',
};
const HEADER_MAP = {
  exclusiva: ['exclusiva', 'codi exclusiva', 'num exclusiva', 'número exclusiva'],
  descripcio: ['descripcion', 'descripció', 'description', 'descripcion del problema', 'problema'],
  proposta_millora: ['solucio', 'solución', 'solucio proposada', 'proposta millora', 'solucion propuesta'],
  accio_preventiva: ['accio preventiva', 'accion preventiva', 'acción preventiva', 'preventiva'],
  gravetat: ['gravetat', 'gravedad', 'severity'],
  origen: ['origen', 'origin'],
  estat: ['estado', 'estat', 'status'],
  area: ['area', 'àrea', 'departamento', 'departament', 'dept'],
  data_nc: ['data', 'fecha', 'date', 'data nc', 'fecha incidencia'],
};
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

// ─── Helpers ────────────────────────────────────────────────────────────────
function pickCol(headers, aliases) {
  for (const h of headers) {
    const n = norm(h);
    for (const a of aliases) {
      if (n === norm(a) || n.includes(norm(a))) return h;
    }
  }
  return null;
}

function parsePastedTable(text) {
  const lines = text.replace(/\r\n?/g, '\n').trim().split('\n').filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };
  const delim = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(delim).map((h) => h.trim().replace(/^["']|["']$/g, ''));
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(delim).map((c) => c.trim().replace(/^["']|["']$/g, ''));
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cells[i] ?? ''; });
    return obj;
  });
  return { headers, rows };
}

function parseRows(headers, rows) {
  const colMap = {};
  Object.entries(HEADER_MAP).forEach(([key, aliases]) => {
    const col = pickCol(headers, aliases);
    if (col) colMap[key] = col;
  });
  return rows.map((r, i) => {
    const get = (k) => colMap[k] ? String(r[colMap[k]] || '').trim() : '';
    return {
      _idx: i + 1,
      exclusiva_raw: get('exclusiva'),
      descripcio: get('descripcio'),
      proposta_millora: get('proposta_millora'),
      accio_preventiva: get('accio_preventiva'),
      gravetat_raw: get('gravetat'),
      origen_raw: get('origen'),
      estat_raw: get('estat'),
      area_raw: get('area'),
      data_raw: get('data_nc'),
    };
  });
}

function validateRow(r) {
  const errors = [];
  if (!r.exclusiva_raw) errors.push('Exclusiva requerida');
  if (!r.descripcio) errors.push('Descripción requerida');
  if (r.gravetat_raw && !GRAVETAT_MAP[norm(r.gravetat_raw)])
    errors.push(`Gravedad inválida: "${r.gravetat_raw}"`);
  if (r.origen_raw && !ORIGEN_MAP[norm(r.origen_raw)])
    errors.push(`Origen inválido: "${r.origen_raw}"`);
  if (r.estat_raw && !ESTAT_MAP[norm(r.estat_raw)])
    errors.push(`Estado inválido: "${r.estat_raw}"`);
  return errors;
}

// ─── PDF extraction ──────────────────────────────────────────────────────────
async function extractTableFromPDF(file) {
  // Dynamically import pdfjs-dist
  const pdfjsLib = await import('pdfjs-dist');
  // Set worker source
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
  ).toString();

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const allPageItems = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });

    // Collect items with normalized positions
    const items = content.items
      .filter((item) => item.str && item.str.trim())
      .map((item) => ({
        text: item.str.trim(),
        x: Math.round(item.transform[4]),
        // Invert y so top = small y
        y: Math.round(viewport.height - item.transform[5]),
      }));

    allPageItems.push(...items);
  }

  if (!allPageItems.length) return { headers: [], tableRows: [] };

  // Group items into rows by y-coordinate (within 5px tolerance)
  const yTolerance = 8;
  const rowGroups = [];
  for (const item of allPageItems) {
    let found = false;
    for (const group of rowGroups) {
      if (Math.abs(group.y - item.y) <= yTolerance) {
        group.items.push(item);
        group.y = Math.round((group.y + item.y) / 2);
        found = true;
        break;
      }
    }
    if (!found) rowGroups.push({ y: item.y, items: [item] });
  }

  // Sort rows by y, then items in each row by x
  rowGroups.sort((a, b) => a.y - b.y);
  rowGroups.forEach((g) => g.items.sort((a, b) => a.x - b.x));

  // Filter out single-cell rows that look like headers/page numbers outside a table
  const tableRowGroups = rowGroups.filter((g) => g.items.length >= 2);
  if (!tableRowGroups.length) {
    // Fallback: use all rows with content
    const allRows = rowGroups.filter((g) => g.items.length >= 1);
    if (!allRows.length) return { headers: [], tableRows: [] };
    const headers = allRows[0].items.map((item) => item.text);
    const tableRows = allRows.slice(1).map((g) => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = g.items[i]?.text ?? ''; });
      return obj;
    });
    return { headers, tableRows };
  }

  // Detect column boundaries from the first few rows
  const sampleRows = tableRowGroups.slice(0, Math.min(5, tableRowGroups.length));
  const allXPositions = sampleRows.flatMap((g) => g.items.map((i) => i.x));
  allXPositions.sort((a, b) => a - b);

  // Cluster x positions into columns
  const xTolerance = 20;
  const colBoundaries = [];
  for (const x of allXPositions) {
    let found = false;
    for (const col of colBoundaries) {
      if (Math.abs(col.x - x) <= xTolerance) {
        col.x = Math.round((col.x + x) / 2);
        found = true;
        break;
      }
    }
    if (!found) colBoundaries.push({ x });
  }
  colBoundaries.sort((a, b) => a.x - b.x);

  // Map each item to a column index
  const mapToCol = (item) => {
    let bestCol = 0;
    let bestDist = Infinity;
    colBoundaries.forEach((col, i) => {
      const dist = Math.abs(col.x - item.x);
      if (dist < bestDist) { bestDist = dist; bestCol = i; }
    });
    return bestCol;
  };

  // Convert groups to rows (array of cells)
  const numCols = colBoundaries.length;
  const headerRow = tableRowGroups[0];
  const headers = Array.from({ length: numCols }, () => '');
  headerRow.items.forEach((item) => {
    const col = mapToCol(item);
    headers[col] = headers[col] ? headers[col] + ' ' + item.text : item.text;
  });

  const tableRows = tableRowGroups.slice(1).map((g) => {
    const cells = Array.from({ length: numCols }, () => '');
    g.items.forEach((item) => {
      const col = mapToCol(item);
      cells[col] = cells[col] ? cells[col] + ' ' + item.text : item.text;
    });
    const obj = {};
    headers.forEach((h, i) => { obj[h || `Col${i + 1}`] = cells[i]; });
    return obj;
  });

  // Remove empty header keys
  const cleanHeaders = headers.map((h, i) => h || `Col${i + 1}`);

  return { headers: cleanHeaders, tableRows };
}

// ─── Step indicator ──────────────────────────────────────────────────────────
function Steps({ current }) {
  const steps = ['Datos', 'Validar', 'Fotos', 'Cargar'];
  return (
    <div className="flex items-center gap-0 mb-6">
      {steps.map((s, i) => (
        <React.Fragment key={i}>
          <div className="flex items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors
              ${i + 1 < current ? 'bg-green-500 text-white' : i + 1 === current ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
              {i + 1 < current ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
            </div>
            <span className={`text-sm font-medium ${i + 1 === current ? 'text-primary' : 'text-muted-foreground'}`}>{s}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`mx-3 h-px flex-1 min-w-[24px] ${i + 1 < current ? 'bg-green-400' : 'bg-border'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── PDF Drop Zone ────────────────────────────────────────────────────────────
function PDFDropZone({ onFile, pdfFile, onClear, extracting }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const file = Array.from(e.dataTransfer.files).find((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (file) onFile(file);
  }, [onFile]);

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onClick={() => !pdfFile && inputRef.current?.click()}
      className={`relative flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-all
        ${dragging ? 'border-primary bg-primary/5 scale-[1.01]' : pdfFile ? 'border-green-400 bg-green-50 cursor-default' : 'border-border hover:border-primary/60 hover:bg-muted/40'}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }}
      />
      {extracting ? (
        <>
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <div>
            <p className="font-semibold text-sm text-primary">Extrayendo tabla del PDF...</p>
            <p className="text-xs text-muted-foreground mt-1">Analizando estructura de datos</p>
          </div>
        </>
      ) : pdfFile ? (
        <>
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-green-100 border border-green-200">
            <FileText className="h-7 w-7 text-green-600" />
          </div>
          <div>
            <p className="font-semibold text-sm text-green-700">{pdfFile.name}</p>
            <p className="text-xs text-green-600 mt-0.5">{(pdfFile.size / 1024).toFixed(0)} KB — PDF cargado</p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            className="flex items-center gap-1.5 rounded-lg border border-green-300 bg-white px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50 transition"
          >
            <X className="h-3.5 w-3.5" /> Cambiar archivo
          </button>
        </>
      ) : (
        <>
          <div className={`flex h-14 w-14 items-center justify-center rounded-xl border-2 border-dashed transition-colors ${dragging ? 'border-primary bg-primary/10' : 'border-border bg-muted/50'}`}>
            <FileText className={`h-7 w-7 transition-colors ${dragging ? 'text-primary' : 'text-muted-foreground'}`} />
          </div>
          <div>
            <p className="font-semibold text-sm text-foreground">
              <span className="text-primary">Arrastra un PDF aquí</span> o haz click para seleccionar
            </p>
            <p className="text-xs text-muted-foreground mt-1">La tabla se extraerá automáticamente del PDF</p>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Editable PDF Table Preview ───────────────────────────────────────────────
function PDFTablePreview({ headers, rows, onChangeCell, onDeleteRow, onAddRow }) {
  const [editCell, setEditCell] = useState(null); // { row, col }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Vista previa — {rows.length} filas extraídas
        </p>
        <button
          onClick={onAddRow}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition"
        >
          + Añadir fila
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/60">
              <th className="px-3 py-2 text-left font-semibold text-muted-foreground w-8">#</th>
              {headers.map((h, i) => (
                <th key={i} className="px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
              ))}
              <th className="px-3 py-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className="border-b border-border last:border-0 hover:bg-muted/20">
                <td className="px-3 py-2 text-muted-foreground text-center">{ri + 1}</td>
                {headers.map((h, ci) => {
                  const isEditing = editCell?.row === ri && editCell?.col === ci;
                  return (
                    <td key={ci} className="px-2 py-1.5 min-w-[80px]">
                      {isEditing ? (
                        <input
                          autoFocus
                          className="w-full rounded border border-primary bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                          defaultValue={row[h] || ''}
                          onBlur={(e) => {
                            onChangeCell(ri, h, e.target.value);
                            setEditCell(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.target.blur(); }
                            if (e.key === 'Escape') setEditCell(null);
                          }}
                        />
                      ) : (
                        <div
                          className="group flex items-center gap-1 cursor-pointer rounded px-1 py-0.5 hover:bg-primary/5"
                          onClick={() => setEditCell({ row: ri, col: ci })}
                        >
                          <span className={`flex-1 ${row[h] ? 'text-foreground' : 'text-muted-foreground italic'}`}>
                            {row[h] || 'vacío'}
                          </span>
                          <Edit2 className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
                        </div>
                      )}
                    </td>
                  );
                })}
                <td className="px-2 py-1.5">
                  <button
                    onClick={() => onDeleteRow(ri)}
                    className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Drag-drop photo zone ────────────────────────────────────────────────────
function PhotoZone({ photos, onAdd, onRemove }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    if (files.length) onAdd(files);
  }, [onAdd]);

  const handleDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = () => setDragging(false);

  return (
    <div className="space-y-2">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-4 text-center transition-colors
          ${dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/50'}`}
      >
        <ImageIcon className={`h-6 w-6 ${dragging ? 'text-primary' : 'text-muted-foreground'}`} />
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-primary">Arrastra fotos aquí</span> o haz click
        </p>
        {photos.length > 0 && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
            {photos.length} foto{photos.length !== 1 ? 's' : ''}
          </span>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            if (files.length) onAdd(files);
            e.target.value = '';
          }}
        />
      </div>
      {photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <div key={i} className="relative group h-16 w-16 overflow-hidden rounded-lg border border-border">
              <img src={p.preview} alt="" className="h-full w-full object-cover" />
              <button
                onClick={() => onRemove(i)}
                className="absolute right-0.5 top-0.5 hidden group-hover:flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-red-600 transition"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Video zone ───────────────────────────────────────────────────────────────
function VideoZone({ videos, onAdd, onRemove }) {
  const inputRef = useRef(null);
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:border-primary/50 hover:bg-muted/50 transition"
      >
        <Upload className="h-3.5 w-3.5" />
        Añadir vídeos
        {videos.length > 0 && <span className="ml-1 font-semibold text-primary">({videos.length})</span>}
      </button>
      <input ref={inputRef} type="file" accept="video/*" multiple className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length) onAdd(files);
          e.target.value = '';
        }}
      />
      {videos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {videos.map((v, i) => (
            <span key={i} className="flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs">
              <span className="max-w-[100px] truncate">{v.file.name}</span>
              <button onClick={() => onRemove(i)} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function CargaMasivaIncidencies() {
  const [step, setStep] = useState(1);

  // Step 1 — input mode
  const [inputMode, setInputMode] = useState('pdf'); // 'pdf' | 'csv'
  const [pasteText, setPasteText] = useState('');
  const [zipFile, setZipFile] = useState(null);
  const csvRef = useRef(null);
  const zipRef = useRef(null);

  // Step 1 — PDF state
  const [pdfFile, setPdfFile] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const [pdfHeaders, setPdfHeaders] = useState([]);
  const [pdfTableRows, setPdfTableRows] = useState([]); // raw object rows (editable)

  // Step 2
  const [rows, setRows] = useState([]);
  const [validating, setValidating] = useState(false);
  const [validatedRows, setValidatedRows] = useState(null);
  const [exclusivaCache, setExclusivaCache] = useState({});

  // Step 3 — photos[rowIdx] = [{file, preview}]
  const [photos, setPhotos] = useState({});
  const [videos, setVideos] = useState({});

  // Step 4 — loading
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState(null);

  // ── PDF handling ───────────────────────────────────────────────────────────
  const handlePdfFile = async (file) => {
    setPdfFile(file);
    setPdfTableRows([]);
    setPdfHeaders([]);
    setExtractError('');
    setExtracting(true);
    try {
      const { headers, tableRows } = await extractTableFromPDF(file);
      if (!tableRows.length) {
        setExtractError('No se encontró una tabla en el PDF. Verifica que el PDF contiene datos tabulares o usa el modo CSV.');
      } else {
        setPdfHeaders(headers);
        setPdfTableRows(tableRows);
      }
    } catch (err) {
      setExtractError('Error al leer el PDF: ' + (err.message || 'Error desconocido'));
    } finally {
      setExtracting(false);
    }
  };

  const handlePdfCellChange = (rowIdx, col, value) => {
    setPdfTableRows((prev) => {
      const updated = [...prev];
      updated[rowIdx] = { ...updated[rowIdx], [col]: value };
      return updated;
    });
  };

  const handlePdfDeleteRow = (rowIdx) => {
    setPdfTableRows((prev) => prev.filter((_, i) => i !== rowIdx));
  };

  const handlePdfAddRow = () => {
    const empty = {};
    pdfHeaders.forEach((h) => { empty[h] = ''; });
    setPdfTableRows((prev) => [...prev, empty]);
  };

  // ── Step 1: Parse ──────────────────────────────────────────────────────────
  const handleParse = (text) => {
    const { headers, rows: rawRows } = parsePastedTable(text || pasteText);
    if (!rawRows.length) return;
    const parsed = parseRows(headers, rawRows);
    setRows(parsed);
    setValidatedRows(null);
    setPhotos({});
    setVideos({});
    setResult(null);
    setStep(2);
  };

  const handleParsePDF = () => {
    if (!pdfTableRows.length) return;
    const parsed = parseRows(pdfHeaders, pdfTableRows);
    setRows(parsed);
    setValidatedRows(null);
    setPhotos({});
    setVideos({});
    setResult(null);
    setStep(2);
  };

  const handleCSVFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { const t = ev.target.result; setPasteText(t); handleParse(t); };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  const handleZipFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setZipFile(file);
    e.target.value = '';
  };

  // ── Step 2: Validate ───────────────────────────────────────────────────────
  const handleValidate = async () => {
    setValidating(true);
    try {
      const codes = [...new Set(rows.map((r) => r.exclusiva_raw).filter(Boolean))];
      const cache = { ...exclusivaCache };
      await Promise.all(
        codes.filter((c) => !cache[c]).map(async (code) => {
          try {
            const rec = await pb.collection('exclusives').getFirstListItem(
              pb.filter('exclusiva = {:c}', { c: code }), { requestKey: `excl-${code}` }
            );
            cache[code] = rec.id;
          } catch { cache[code] = null; }
        })
      );
      setExclusivaCache(cache);
      const validated = rows.map((r) => {
        const errors = validateRow(r);
        if (r.exclusiva_raw && cache[r.exclusiva_raw] === null)
          errors.push(`Exclusiva no encontrada: "${r.exclusiva_raw}"`);
        return { ...r, errors, exclusiva_id: cache[r.exclusiva_raw] || null };
      });
      setValidatedRows(validated);
    } finally { setValidating(false); }
  };

  // ── Step 3: Photos ─────────────────────────────────────────────────────────
  const addPhotos = useCallback((idx, files) => {
    setPhotos((prev) => {
      const existing = prev[idx] || [];
      const newItems = files
        .filter((f) => f.type.startsWith('image/'))
        .map((f) => ({ file: f, preview: URL.createObjectURL(f) }));
      return { ...prev, [idx]: [...existing, ...newItems].slice(0, 10) };
    });
  }, []);

  const removePhoto = useCallback((idx, photoIdx) => {
    setPhotos((prev) => {
      const arr = [...(prev[idx] || [])];
      URL.revokeObjectURL(arr[photoIdx]?.preview);
      arr.splice(photoIdx, 1);
      return { ...prev, [idx]: arr };
    });
  }, []);

  const addVideos = useCallback((idx, files) => {
    setVideos((prev) => {
      const existing = prev[idx] || [];
      const newItems = files.map((f) => ({ file: f }));
      return { ...prev, [idx]: [...existing, ...newItems].slice(0, 5) };
    });
  }, []);

  const removeVideo = useCallback((idx, vIdx) => {
    setVideos((prev) => {
      const arr = [...(prev[idx] || [])];
      arr.splice(vIdx, 1);
      return { ...prev, [idx]: arr };
    });
  }, []);

  const applyZip = async () => {
    if (!zipFile) return;
    try {
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(zipFile);
      const newPhotos = {};
      for (const [path, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        const lower = path.toLowerCase();
        if (!lower.match(/\.(jpg|jpeg|png|webp|heic)$/)) continue;
        const parts = path.split('/');
        const folderName = parts.length > 1 ? parts[0] : null;
        if (!folderName) continue;
        let rowIdx = null;
        const numMatch = folderName.match(/^(\d+)$/);
        const incMatch = folderName.match(/^INC-0*(\d+)$/i);
        if (numMatch) rowIdx = parseInt(numMatch[1]) - 1;
        else if (incMatch) rowIdx = parseInt(incMatch[1]) - 1;
        if (rowIdx === null || rowIdx < 0 || rowIdx >= rows.length) continue;
        const blob = await entry.async('blob');
        const file = new File([blob], parts[parts.length - 1], { type: 'image/jpeg' });
        if (!newPhotos[rowIdx + 1]) newPhotos[rowIdx + 1] = [];
        if (newPhotos[rowIdx + 1].length < 10) {
          newPhotos[rowIdx + 1].push({ file, preview: URL.createObjectURL(blob) });
        }
      }
      if (Object.keys(newPhotos).length === 0) {
        alert('No se encontraron fotos en el ZIP. Asegúrate de que las carpetas se llamen "1", "2", "3" o "INC-001", "INC-002"...');
        return;
      }
      setPhotos((prev) => {
        const merged = { ...prev };
        for (const [idx, items] of Object.entries(newPhotos)) {
          merged[idx] = [...(merged[idx] || []), ...items].slice(0, 10);
        }
        return merged;
      });
      alert(`ZIP procesado: ${Object.values(newPhotos).reduce((a, b) => a + b.length, 0)} fotos asignadas a ${Object.keys(newPhotos).length} incidencias.`);
    } catch (err) {
      alert('Error procesando el ZIP: ' + err.message);
    }
  };

  // ── Step 4: Load ───────────────────────────────────────────────────────────
  const handleLoad = async () => {
    const toLoad = (validatedRows || []).filter((r) => r.errors.length === 0);
    if (!toLoad.length) return;
    setLoading(true);
    setProgress({ done: 0, total: toLoad.length });
    const ok = [], errors = [], duplicates = [];

    try {
      let nextNum = 1;
      try {
        const last = await pb.collection('no_conformitats').getList(1, 1, {
          sort: '-codi', filter: 'codi != ""', requestKey: 'last-inc',
        });
        if (last.items.length) {
          const m = last.items[0].codi?.match(/(\d+)$/);
          if (m) nextNum = parseInt(m[1]) + 1;
        }
      } catch {}

      const currentUser = pb.authStore.record;

      for (let i = 0; i < toLoad.length; i++) {
        const r = toLoad[i];
        try {
          const existing = await pb.collection('no_conformitats').getList(1, 1, {
            filter: pb.filter('exclusiva = {:e} && descripcio ~ {:d}', {
              e: r.exclusiva_id, d: r.descripcio.substring(0, 50),
            }),
            requestKey: `dup-${i}`,
          });
          if (existing.items.length) { duplicates.push(r); setProgress((p) => ({ ...p, done: p.done + 1 })); continue; }

          const codi = `INC-${String(nextNum).padStart(3, '0')}`;
          nextNum++;

          const fd = new FormData();
          fd.append('codi', codi);
          fd.append('exclusiva', r.exclusiva_id);
          fd.append('descripcio', r.descripcio);
          fd.append('solucio_implantada', r.proposta_millora || '');
          fd.append('accio_preventiva', r.accio_preventiva || '');
          fd.append('gravetat', GRAVETAT_MAP[norm(r.gravetat_raw)] || 'media');
          fd.append('origen', ORIGEN_MAP[norm(r.origen_raw)] || 'onatex');
          fd.append('estat', ESTAT_MAP[norm(r.estat_raw)] || 'oberta');
          if (r.area_raw && AREA_MAP[norm(r.area_raw)]) fd.append('area', AREA_MAP[norm(r.area_raw)]);
          fd.append('data_nc', r.data_raw ? new Date(r.data_raw).toISOString() : new Date().toISOString());
          if (currentUser?.id) fd.append('operari_que_detecto', currentUser.id);

          const rowPhotos = photos[r._idx] || [];
          rowPhotos.forEach((p) => fd.append('fotos', p.file));
          const rowVideos = videos[r._idx] || [];
          rowVideos.forEach((v) => fd.append('videos', v.file));

          const created = await pb.collection('no_conformitats').create(fd, { requestKey: `create-${i}` });
          ok.push({ ...r, codi, id: created.id, fotosCount: rowPhotos.length, videosCount: rowVideos.length });
        } catch (err) {
          errors.push({ ...r, reason: err.message || 'Error desconocido' });
        }
        setProgress((p) => ({ ...p, done: p.done + 1 }));
      }

      setResult({ ok, errors, duplicates });
      setStep(5);
    } finally { setLoading(false); }
  };

  const reset = () => {
    Object.values(photos).forEach((arr) => arr.forEach((p) => URL.revokeObjectURL(p.preview)));
    setPasteText(''); setZipFile(null); setRows([]); setValidatedRows(null);
    setPhotos({}); setVideos({}); setResult(null);
    setPdfFile(null); setPdfHeaders([]); setPdfTableRows([]); setExtractError('');
    setStep(1);
  };

  const exportSummary = () => {
    if (!result) return;
    const allRows = [
      ...result.ok.map((r) => ({ resultado: 'Cargada', codigo: r.codi, exclusiva: r.exclusiva_raw, descripcion: r.descripcio.substring(0, 80), fotos: r.fotosCount, videos: r.videosCount })),
      ...result.duplicates.map((r) => ({ resultado: 'Duplicado', codigo: '', exclusiva: r.exclusiva_raw, descripcion: r.descripcio.substring(0, 80), fotos: 0, videos: 0 })),
      ...result.errors.map((r) => ({ resultado: 'Error', codigo: '', exclusiva: r.exclusiva_raw, descripcion: r.reason, fotos: 0, videos: 0 })),
    ];
    const cols = ['resultado', 'codigo', 'exclusiva', 'descripcion', 'fotos', 'videos'];
    const header = cols.join(';');
    const body = allRows.map((r) => cols.map((c) => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob([`\uFEFF${header}\n${body}`], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'resumen_incidencias.csv'; a.click();
  };

  const validRows = (validatedRows || []).filter((r) => r.errors.length === 0);
  const invalidRows = (validatedRows || []).filter((r) => r.errors.length > 0);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="font-display text-2xl uppercase text-primary">Carga masiva de incidencias</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sigue los pasos para cargar incidencias con fotos y vídeos adjuntos.
        </p>
      </div>

      <Steps current={step > 4 ? 4 : step} />

      {/* ── STEP 1: Input ──────────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-5">
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h3 className="font-semibold text-sm text-primary uppercase tracking-wide">Paso 1 — Datos de incidencias</h3>

            {/* Mode tabs */}
            <div className="flex rounded-lg border border-border overflow-hidden w-fit">
              <button
                onClick={() => setInputMode('pdf')}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition
                  ${inputMode === 'pdf' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
              >
                <FileText className="h-4 w-4" /> Arrastrar PDF
              </button>
              <button
                onClick={() => setInputMode('csv')}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition border-l border-border
                  ${inputMode === 'csv' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
              >
                <FileUp className="h-4 w-4" /> CSV / Pegar tabla
              </button>
            </div>

            {/* PDF mode */}
            {inputMode === 'pdf' && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Arrastra un PDF con tabla de incidencias. La tabla se extraerá automáticamente y podrás editarla antes de continuar.
                </p>
                <PDFDropZone
                  onFile={handlePdfFile}
                  pdfFile={pdfFile}
                  onClear={() => { setPdfFile(null); setPdfHeaders([]); setPdfTableRows([]); setExtractError(''); }}
                  extracting={extracting}
                />
                {extractError && (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                    <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    <p className="text-sm text-destructive">{extractError}</p>
                  </div>
                )}
                {pdfTableRows.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3">
                      <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                      <p className="text-sm text-green-700 font-medium">
                        Tabla extraída: {pdfTableRows.length} filas, {pdfHeaders.length} columnas. Revisa y edita los datos antes de continuar.
                      </p>
                    </div>
                    <PDFTablePreview
                      headers={pdfHeaders}
                      rows={pdfTableRows}
                      onChangeCell={handlePdfCellChange}
                      onDeleteRow={handlePdfDeleteRow}
                      onAddRow={handlePdfAddRow}
                    />
                    <button
                      onClick={handleParsePDF}
                      disabled={!pdfTableRows.length}
                      className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition active:scale-95 disabled:opacity-40"
                    >
                      Continuar con estos datos <ChevronRight className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            )}

            {/* CSV / Paste mode */}
            {inputMode === 'csv' && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Pega datos de Excel/Sheets o sube un CSV. Columnas:
                  <span className="ml-1 font-mono text-xs bg-muted px-1 py-0.5 rounded">Exclusiva, Descripción, Gravedad, Origen, Área, Estado, Fecha</span>
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  <button onClick={() => csvRef.current?.click()}
                    className="flex items-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2 text-sm font-medium hover:bg-muted transition active:scale-95">
                    <FileUp className="h-4 w-4" /> Subir CSV / Excel
                  </button>
                  <input ref={csvRef} type="file" accept=".csv,.txt,.tsv,.xlsx" className="hidden" onChange={handleCSVFile} />
                </div>
                <textarea
                  className="w-full rounded-lg border border-input bg-background p-3 font-mono text-xs resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                  rows={8}
                  placeholder={"Exclusiva\tDescripción\tGravedad\tOrigen\tÁrea\nEXC-001\tCostura abierta en manga\tMedia\tProducción\tConfección\nEXC-002\tEstampación descentrada\tBaja\tCalidad\tEstampación"}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                />
                <button onClick={() => handleParse()} disabled={!pasteText.trim()}
                  className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition active:scale-95 disabled:opacity-40">
                  Siguiente <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* ZIP option */}
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <FolderArchive className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold text-sm text-foreground">Opcional: ZIP con fotos pre-organizadas</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Sube un archivo ZIP con carpetas numeradas según el número de fila (<span className="font-mono bg-muted px-1 rounded">1/</span>, <span className="font-mono bg-muted px-1 rounded">2/</span>...)
              o por código de incidencia (<span className="font-mono bg-muted px-1 rounded">INC-001/</span>, <span className="font-mono bg-muted px-1 rounded">INC-002/</span>...).
              Las fotos se asignarán automáticamente en el Paso 3.
            </p>
            <div className="flex items-center gap-3">
              <button onClick={() => zipRef.current?.click()}
                className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition active:scale-95">
                <FolderArchive className="h-4 w-4" /> Seleccionar ZIP
              </button>
              <input ref={zipRef} type="file" accept=".zip" className="hidden" onChange={handleZipFile} />
              {zipFile && (
                <span className="text-sm text-green-600 font-medium flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4" /> {zipFile.name} seleccionado
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 2: Validate ───────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h3 className="font-semibold text-sm text-primary uppercase tracking-wide">Paso 2 — Validación</h3>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <p className="text-sm">
                <span className="font-semibold">{rows.length} filas detectadas</span>
                {validatedRows && (
                  <span className="ml-3">
                    <span className="text-green-600 font-semibold">{validRows.length} válidas</span>
                    {invalidRows.length > 0 && (
                      <span className="ml-2 text-destructive font-semibold">{invalidRows.length} con errores</span>
                    )}
                  </span>
                )}
              </p>
              <div className="flex gap-2">
                <button onClick={() => setStep(1)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition">
                  Atrás
                </button>
                {!validatedRows ? (
                  <button onClick={handleValidate} disabled={validating}
                    className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground transition active:scale-95 disabled:opacity-50">
                    {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Validar filas
                  </button>
                ) : (
                  <>
                    <button onClick={handleValidate} disabled={validating}
                      className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition">
                      Re-validar
                    </button>
                    {validRows.length > 0 && (
                      <button onClick={() => setStep(3)}
                        className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition active:scale-95">
                        Siguiente <ChevronRight className="h-4 w-4" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {['#', 'Exclusiva', 'Descripción', 'Gravedad', 'Origen', 'Área', 'Estado', 'Validación'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(validatedRows || rows).map((row) => {
                  const hasErrors = validatedRows && row.errors?.length > 0;
                  return (
                    <tr key={row._idx} className={`border-b border-border last:border-0 ${hasErrors ? 'bg-destructive/5' : validatedRows ? 'bg-green-50' : ''}`}>
                      <td className="px-3 py-2 text-muted-foreground">{row._idx}</td>
                      <td className="px-3 py-2 font-mono font-semibold">{row.exclusiva_raw || <span className="text-destructive">—</span>}</td>
                      <td className="px-3 py-2 max-w-[180px] truncate" title={row.descripcio}>{row.descripcio || '—'}</td>
                      <td className="px-3 py-2 capitalize">{row.gravetat_raw || '—'}</td>
                      <td className="px-3 py-2 capitalize">{row.origen_raw || '—'}</td>
                      <td className="px-3 py-2">{row.area_raw ? (AREA_LABELS[AREA_MAP[norm(row.area_raw)]] || row.area_raw) : '—'}</td>
                      <td className="px-3 py-2 capitalize">{row.estat_raw || 'Abierta'}</td>
                      <td className="px-3 py-2">
                        {!validatedRows ? <span className="text-muted-foreground">—</span>
                          : hasErrors
                            ? <div className="flex items-start gap-1">
                                <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                                <ul>{row.errors.map((e, i) => <li key={i} className="text-destructive">{e}</li>)}</ul>
                              </div>
                            : <span className="flex items-center gap-1 text-green-600 font-semibold">
                                <CheckCircle2 className="h-3.5 w-3.5" /> OK
                              </span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── STEP 3: Photos ─────────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h3 className="font-semibold text-sm text-primary uppercase tracking-wide">Paso 3 — Fotos y vídeos por incidencia</h3>
            <p className="text-sm text-muted-foreground">
              Arrastra fotos al área de cada incidencia. Puedes añadir hasta 10 fotos y 5 vídeos por fila.
            </p>
            {zipFile && (
              <button onClick={applyZip}
                className="flex items-center gap-2 rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/5 transition active:scale-95">
                <FolderArchive className="h-4 w-4" /> Importar fotos del ZIP: {zipFile.name}
              </button>
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setStep(2)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition">
                Atrás
              </button>
              <button onClick={() => setStep(4)}
                className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition active:scale-95">
                Continuar <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {validRows.map((row) => {
              const rowPhotos = photos[row._idx] || [];
              const rowVideos = videos[row._idx] || [];
              return (
                <div key={row._idx} className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="flex items-start justify-between gap-4 bg-muted/40 px-4 py-3 border-b border-border">
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                        {row._idx}
                      </span>
                      <div>
                        <p className="font-semibold text-sm text-foreground font-mono">{row.exclusiva_raw}</p>
                        <p className="text-xs text-muted-foreground max-w-[400px] truncate">{row.descripcio}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {rowPhotos.length > 0 && (
                        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                          {rowPhotos.length} foto{rowPhotos.length !== 1 ? 's' : ''}
                        </span>
                      )}
                      {rowVideos.length > 0 && (
                        <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent-foreground">
                          {rowVideos.length} vídeo{rowVideos.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
                    <div>
                      <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fotos</p>
                      <PhotoZone
                        photos={rowPhotos}
                        onAdd={(files) => addPhotos(row._idx, files)}
                        onRemove={(i) => removePhoto(row._idx, i)}
                      />
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vídeos</p>
                      <VideoZone
                        videos={rowVideos}
                        onAdd={(files) => addVideos(row._idx, files)}
                        onRemove={(i) => removeVideo(row._idx, i)}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end">
            <button onClick={() => setStep(4)}
              className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition active:scale-95">
              Ver resumen <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Summary + Load ─────────────────────────────────────────── */}
      {step === 4 && (
        <div className="space-y-5">
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h3 className="font-semibold text-sm text-primary uppercase tracking-wide">Paso 4 — Resumen y carga</h3>
            <p className="text-sm text-muted-foreground">
              Revisa el resumen y haz click en "Cargar todo" para guardar las incidencias con sus fotos y vídeos.
            </p>

            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                <p className="text-2xl font-bold text-primary">{validRows.length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Incidencias a cargar</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                <p className="text-2xl font-bold text-primary">
                  {Object.values(photos).reduce((a, b) => a + b.length, 0)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Fotos adjuntas</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                <p className="text-2xl font-bold text-primary">
                  {Object.values(videos).reduce((a, b) => a + b.length, 0)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Vídeos adjuntos</p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    {['#', 'Exclusiva', 'Descripción', 'Gravedad', 'Área', 'Fotos', 'Vídeos'].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-semibold text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {validRows.map((row) => {
                    const rowPhotos = photos[row._idx] || [];
                    const rowVideos = videos[row._idx] || [];
                    return (
                      <tr key={row._idx} className="border-b border-border last:border-0 hover:bg-muted/30">
                        <td className="px-3 py-2 text-muted-foreground">{row._idx}</td>
                        <td className="px-3 py-2 font-mono font-semibold">{row.exclusiva_raw}</td>
                        <td className="px-3 py-2 max-w-[200px] truncate text-muted-foreground">{row.descripcio}</td>
                        <td className="px-3 py-2 capitalize">{row.gravetat_raw || 'media'}</td>
                        <td className="px-3 py-2">{row.area_raw ? (AREA_LABELS[AREA_MAP[norm(row.area_raw)]] || row.area_raw) : '—'}</td>
                        <td className="px-3 py-2">
                          {rowPhotos.length > 0
                            ? <span className="font-semibold text-primary">{rowPhotos.length}</span>
                            : <span className="text-muted-foreground">0</span>}
                        </td>
                        <td className="px-3 py-2">
                          {rowVideos.length > 0
                            ? <span className="font-semibold text-accent-foreground">{rowVideos.length}</span>
                            : <span className="text-muted-foreground">0</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {loading && (
              <div className="space-y-2">
                <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Cargando {progress.done} de {progress.total} incidencias...
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setStep(3)} disabled={loading}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition disabled:opacity-50">
                Atrás
              </button>
              <button onClick={handleLoad} disabled={loading || validRows.length === 0}
                className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition active:scale-95 disabled:opacity-50">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Cargar todo ({validRows.length} incidencias)
              </button>
            </div>
          </div>

          {invalidRows.length > 0 && (
            <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
              <p className="text-sm font-semibold text-yellow-800 mb-1">
                {invalidRows.length} fila{invalidRows.length !== 1 ? 's' : ''} con errores no se cargarán
              </p>
              <ul className="space-y-0.5">
                {invalidRows.map((r) => (
                  <li key={r._idx} className="text-xs text-yellow-700">
                    Fila {r._idx} ({r.exclusiva_raw}): {r.errors.join(', ')}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── STEP 5: Results ────────────────────────────────────────────────── */}
      {step === 5 && result && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-green-200 bg-green-50 p-5 text-center">
              <p className="text-4xl font-bold text-green-700">{result.ok.length}</p>
              <p className="mt-1 text-sm font-semibold text-green-600">Incidencias cargadas</p>
              <p className="text-xs text-green-500 mt-1">
                {result.ok.reduce((a, r) => a + (r.fotosCount || 0), 0)} fotos •{' '}
                {result.ok.reduce((a, r) => a + (r.videosCount || 0), 0)} vídeos
              </p>
            </div>
            <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-5 text-center">
              <p className="text-4xl font-bold text-yellow-700">{result.duplicates.length}</p>
              <p className="mt-1 text-sm font-semibold text-yellow-600">Duplicados omitidos</p>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-center">
              <p className="text-4xl font-bold text-red-700">{result.errors.length}</p>
              <p className="mt-1 text-sm font-semibold text-red-600">Errores</p>
            </div>
          </div>

          {result.ok.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <h3 className="font-semibold text-sm text-primary">Incidencias cargadas</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      {['Código', 'Exclusiva', 'Descripción', 'Gravedad', 'Fotos', 'Vídeos'].map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-semibold text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.ok.map((r, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 font-mono font-semibold text-primary">{r.codi}</td>
                        <td className="px-3 py-2 font-mono">{r.exclusiva_raw}</td>
                        <td className="px-3 py-2 max-w-[220px] truncate text-muted-foreground">{r.descripcio}</td>
                        <td className="px-3 py-2 capitalize">{r.gravetat_raw || 'media'}</td>
                        <td className="px-3 py-2 font-semibold text-primary">{r.fotosCount}</td>
                        <td className="px-3 py-2 font-semibold">{r.videosCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result.errors.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <h3 className="mb-2 text-sm font-semibold text-red-800">Errores</h3>
              <ul className="space-y-1">
                {result.errors.map((r, i) => (
                  <li key={i} className="text-xs text-red-700">Fila {r._idx} ({r.exclusiva_raw}): {r.reason}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-3 flex-wrap">
            <button onClick={exportSummary}
              className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition active:scale-95">
              <Download className="h-4 w-4" /> Descargar resumen CSV
            </button>
            <button onClick={reset}
              className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition active:scale-95">
              Nueva carga
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

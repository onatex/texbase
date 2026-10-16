// Robust PDF text + table extraction for nòmines (payroll) and vendes (sales).
// Uses pdfjs-dist and reconstructs visual lines from item positions so that
// columns can be detected by x coordinate.

const DEBUG = true;
const log = (...a) => { if (DEBUG) console.log('[pdfExtraction]', ...a); };

// ─── Number parsing ──────────────────────────────────────────────────────────
// Supports: 1000 · 1.000 · 1,000 · 1,00 · 1.00 · 1.000,00 · 1,000.00 · 1 000,00
export function parseNumber(raw) {
  if (raw === null || raw === undefined) return NaN;
  let s = String(raw).trim().replace(/[€$\s\u00a0]/g, '');
  const negative = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[()\-+]/g, '');
  if (!s) return NaN;
  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  if (hasDot && hasComma) {
    // last separator is the decimal one
    const dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
    const thou = dec === '.' ? ',' : '.';
    s = s.split(thou).join('');
    s = s.replace(dec, '.');
  } else if (hasComma || hasDot) {
    const sep = hasComma ? ',' : '.';
    const parts = s.split(sep);
    const last = parts[parts.length - 1];
    if (parts.length === 2 && last.length !== 3) {
      s = parts[0] + '.' + last; // decimal separator
    } else if (parts.length === 2 && last.length === 3 && sep === ',' && parts[0].length <= 3) {
      s = parts.join(''); // 1,000 → thousands
    } else {
      s = parts.join(''); // thousands separators
    }
  }
  const n = parseFloat(s);
  if (isNaN(n)) return NaN;
  return negative ? -n : n;
}

export const NUM_TOKEN_RE = /-?\(?\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})?\)?|-?\(?\d+(?:[.,]\d{1,2})?\)?/g;

function numberTokens(text) {
  const out = [];
  const re = new RegExp(NUM_TOKEN_RE.source, 'g');
  let m;
  while ((m = re.exec(text)) !== null) {
    const value = parseNumber(m[0]);
    if (!isNaN(value)) out.push({ raw: m[0], value, index: m.index });
  }
  return out;
}

// ─── PDF → positioned lines ──────────────────────────────────────────────────
export async function extractPdfLines(file) {
  const pdfjsLib = await import('pdfjs-dist');
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.mjs',
      import.meta.url,
    ).toString();
  } catch (e) {
    console.warn('[pdfExtraction] worker no disponible, mode sense worker', e);
  }
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const lines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const buckets = new Map();
    for (const it of content.items) {
      if (!it.str || !it.str.trim()) continue;
      const x = it.transform ? it.transform[4] : 0;
      const y = it.transform ? it.transform[5] : 0;
      const key = Math.round(y / 3); // 3pt tolerance
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push({ str: it.str, x, y });
    }
    const sorted = [...buckets.entries()].sort((a, b) => b[0] - a[0]);
    for (const [, items] of sorted) {
      items.sort((a, b) => a.x - b.x);
      const text = items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
      if (text) lines.push({ page: p, text, items });
    }
  }
  const fullText = lines.map(l => l.text).join('\n');
  log('pàgines:', pdf.numPages, 'línies:', lines.length);
  return { lines, fullText, pages: pdf.numPages };
}

// ─── Shared helpers ──────────────────────────────────────────────────────────
const TOTAL_WORDS = ['total', 'totals', 'totales', 'suma', 'subtotal', 'suma total', 'acumulado', 'acumulat', 'resumen', 'resum'];
const NOISE_WORDS = ['pagina', 'página', 'pàgina', 'page', 'n.i.f', 'nif', 'c.i.f', 'cif', 'empresa:', 'periodo', 'període', 'fecha', 'data ', 'domicilio', 'codigo cuenta', 'seguridad social codigo'];

const isTotalLine = (low) => TOTAL_WORDS.some(w => low.startsWith(w) || low.includes(' ' + w + ' ') || low.includes(w + ':'));
const isNoise = (low) => NOISE_WORDS.some(w => low.includes(w));

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

// ─── Header / column detection ───────────────────────────────────────────────
const COL_KEYS = {
  brut: ['bruto', 'brut', 'devengado', 'devengos', 'salario bruto', 'total devengado', 'base'],
  cot: ['cotizacion', 'cotització', 'cotitzacio', 'ss empresa', 's.s. empresa', 'seg. social empresa', 'seguridad social empresa', 'aportacion empresa', 'aportació empresa'],
  cost: ['coste empresa', 'cost empresa', 'coste total', 'cost total', 'coste'],
  desc: ['deduccion', 'deduccions', 'deducciones', 'descuento', 'descompte', 'descomptes', 'retencion', 'retención', 'irpf'],
  net: ['neto', 'net', 'liquido', 'líquido', 'liquid', 'a percibir', 'a pagar'],
};

function detectColumns(lines) {
  for (const line of lines.slice(0, 80)) {
    const low = line.text.toLowerCase();
    const found = {};
    for (const [key, kws] of Object.entries(COL_KEYS)) {
      for (const kw of kws) {
        const idx = low.indexOf(kw);
        if (idx < 0) continue;
        // find item whose text contains the keyword start
        let acc = 0, x = null;
        for (const it of line.items) {
          const seg = it.str.toLowerCase();
          if (idx >= acc && idx <= acc + seg.length) { x = it.x; break; }
          acc += seg.length + 1;
        }
        if (x !== null) { found[key] = x; break; }
      }
    }
    if (Object.keys(found).length >= 3) {
      log('capçalera de columnes detectada:', line.text, found);
      return found;
    }
  }
  return null;
}

function valuesByColumns(line, cols) {
  // Map each numeric item in the line to the nearest header column x
  const out = {};
  for (const it of line.items) {
    const toks = numberTokens(it.str);
    if (!toks.length) continue;
    const value = toks[toks.length - 1].value;
    let best = null, bestD = Infinity;
    for (const [key, x] of Object.entries(cols)) {
      const d = Math.abs(it.x - x);
      if (d < bestD) { bestD = d; best = key; }
    }
    if (best && bestD < 90 && out[best] === undefined) out[best] = value;
  }
  return out;
}

// ─── Nòmines ─────────────────────────────────────────────────────────────────
const NAME_PART = "[A-ZÁÉÍÓÚÜÑÀÈÌÒÙÇ][A-Za-záéíóúüñàèìòùç'’.-]+";
const LEADING_NAME_RE = new RegExp(`^((?:${NAME_PART})(?:\\s+(?:${NAME_PART})){1,4})`);

export async function extractNominesPdf(file) {
  const { lines, fullText } = await extractPdfLines(file);
  const warnings = [];
  const cols = detectColumns(lines);
  const operaris = [];
  const totals = { brut: 0, cot: 0, cost: 0, desc: 0, net: 0 };

  for (const line of lines) {
    const text = line.text;
    const low = text.toLowerCase();
    const toks = numberTokens(text);
    const nums = toks.map(t => t.value).filter(v => v > 0);

    // Totals rows
    if (isTotalLine(low) && nums.length) {
      const byCol = cols ? valuesByColumns(line, cols) : {};
      for (const k of ['brut', 'cot', 'cost', 'desc', 'net']) {
        if (byCol[k] > totals[k]) totals[k] = byCol[k];
      }
      if (!cols) {
        const mx = Math.max(...nums);
        if (mx > totals.cost) totals.cost = mx;
      }
      continue;
    }
    if (isNoise(low)) continue;

    const nameMatch = text.match(LEADING_NAME_RE);
    if (!nameMatch) continue;
    const money = nums.filter(v => v >= 50 && v <= 100000);
    if (money.length < 2) continue;

    const fullName = nameMatch[1].replace(/[.,]$/, '').trim();
    const parts = fullName.split(/\s+/);
    const nom = parts[0];
    const cognom = parts.slice(1).join(' ');

    let brut = 0, cot = 0, cost = 0, desc = 0, net = 0;
    const byCol = cols ? valuesByColumns(line, cols) : {};
    if (byCol.brut || byCol.net || byCol.cost) {
      brut = byCol.brut || 0; cot = byCol.cot || 0; cost = byCol.cost || 0;
      desc = byCol.desc || 0; net = byCol.net || 0;
    }

    if (!brut) {
      // Heuristic: brut is the largest plausible salary; look for cot/cost pair
      const sorted = [...money].sort((a, b) => b - a);
      // find a pair where cost ≈ brut + cot
      for (const candBrut of sorted) {
        for (const a of money) {
          for (const b of money) {
            if (a === b || b <= candBrut) continue;
            if (Math.abs(b - (candBrut + a)) < 1.5) { brut = candBrut; cot = a; cost = b; }
          }
        }
        if (brut) break;
      }
      if (!brut) brut = sorted[0];
    }
    if (!net) {
      const cands = money.filter(v => v < brut && v !== cot && v !== cost);
      if (cands.length) {
        // net is the value closest to brut - (some deduction) → pick largest remaining
        net = Math.max(...cands);
        const descCand = cands.filter(v => Math.abs(brut - v - net) < 1.5);
        if (descCand.length) desc = descCand[0];
      }
    }
    if (!desc && brut && net) desc = Math.max(0, brut - net);
    if (!cot && brut) { cot = round2(brut * 0.30); warnings.push(`Cotitzacions empresa estimades (30%) per ${fullName}`); }
    if (!cost) cost = round2(brut + cot);

    operaris.push({
      nom, cognom,
      salari_brut: round2(brut),
      cotitzacions_empresa: round2(cot),
      cost_empresa: round2(cost),
      descomptes: round2(desc),
      salari_net: round2(net || brut - desc),
    });
  }

  // Deduplicate by name (keep row with highest brut)
  const map = new Map();
  for (const o of operaris) {
    const key = `${o.nom} ${o.cognom}`.toLowerCase();
    const prev = map.get(key);
    if (!prev || o.salari_brut > prev.salari_brut) map.set(key, o);
  }
  const uniqueOps = [...map.values()];
  if (uniqueOps.length !== operaris.length) {
    warnings.push(`${operaris.length - uniqueOps.length} fila(es) duplicades eliminades`);
  }

  const sum = (k) => round2(uniqueOps.reduce((s, o) => s + (o[k] || 0), 0));
  const salariTotal = sum('salari_brut') || totals.brut;
  const cotEmpresaTotal = sum('cotitzacions_empresa') || totals.cot;
  const costEmpresaTotal = sum('cost_empresa') || totals.cost || round2(salariTotal + cotEmpresaTotal);
  const descTotal = sum('descomptes') || totals.desc;
  const netTotal = sum('salari_net') || totals.net;

  if (!uniqueOps.length) warnings.push('No s\'han detectat operaris al PDF. Introduïu les dades manualment.');
  if (totals.brut && Math.abs(totals.brut - salariTotal) > 5) {
    warnings.push(`El total brut del PDF (${totals.brut}) no coincideix amb la suma de files (${salariTotal})`);
  }
  if (totals.net && Math.abs(totals.net - netTotal) > 5) {
    warnings.push(`El net total del PDF (${totals.net}) no coincideix amb la suma de files (${netTotal})`);
  }

  log('nòmines →', { operaris: uniqueOps.length, salariTotal, cotEmpresaTotal, costEmpresaTotal, descTotal, netTotal, warnings });

  return {
    operaris: uniqueOps,
    salariTotal, descTotal, netTotal, cotEmpresaTotal, costEmpresaTotal,
    pdfTotals: totals,
    warnings,
    columnsDetected: !!cols,
    debugLines: lines.slice(0, 60).map(l => l.text),
    fullText: fullText.slice(0, 4000),
  };
}

// ─── Vendes ──────────────────────────────────────────────────────────────────
const ARTICLE_RE = /\b([A-Z]{1,4}\d{2,4}-\d{2,4}[A-Z0-9-]*)\b/g;

// Classify a list of positive numeric tokens into {count, ingressos}
// Strategy: the count is a small whole number (< 10000, no decimals OR exactly .00)
// ingressos is the largest value; if only one value it is treated as ingressos.
function classifyVendesTokens(vals) {
  // "whole" = value rounds to itself with 0 decimals, and looks like a pure integer raw token
  const isWhole = (t) => {
    const v = t.value;
    return Number.isInteger(v) || Math.abs(v - Math.round(v)) < 0.001;
  };
  const wholeToks = vals.filter(t => isWhole(t) && t.value < 10000 && t.value >= 1);
  const bigToks = vals.filter(t => t.value >= 100); // likely money

  // If we have clear small whole + large money: count=small, ingressos=max(large)
  if (wholeToks.length > 0 && bigToks.length > 0) {
    const count = Math.min(...wholeToks.map(t => t.value)); // smallest whole = quantity
    const ingressos = Math.max(...bigToks.map(t => t.value));
    if (count !== ingressos) return { count, ingressos };
  }
  // If all values are large (only revenue found), treat largest as ingressos, no count
  if (vals.length === 1) return { count: null, ingressos: vals[0].value };
  if (vals.length > 1) {
    const maxV = Math.max(...vals.map(t => t.value));
    return { count: null, ingressos: maxV };
  }
  return { count: null, ingressos: 0 };
}

export async function extractVendesPdf(file) {
  const { lines, fullText } = await extractPdfLines(file);
  const warnings = [];
  const rows = [];
  const pdfTotals = { exclusives: 0, ingressos: 0 };
  const debugExtraction = []; // per-line extraction trace

  for (const line of lines) {
    const text = line.text;
    const low = text.toLowerCase();
    const toks = numberTokens(text);

    if (isTotalLine(low) && toks.length) {
      const vals = toks.map(t => t.value).filter(v => v > 0);
      const ints = vals.filter(v => Number.isInteger(v) && v < 100000);
      const money = vals.filter(v => v >= 10);
      if (money.length) pdfTotals.ingressos = Math.max(pdfTotals.ingressos, Math.max(...money));
      if (ints.length) pdfTotals.exclusives = Math.max(pdfTotals.exclusives, ints[0]);
      continue;
    }
    if (isNoise(low)) continue;

    const arts = [...text.matchAll(new RegExp(ARTICLE_RE.source, 'g'))];
    if (!arts.length) continue;
    const article = arts[0][1];

    // Only numbers appearing AFTER the article code count as data
    const artEnd = arts[0].index + arts[0][0].length;
    const dataToks = toks.filter(t => t.index >= artEnd);
    const use = dataToks.length ? dataToks : toks;
    const vals = use.filter(t => t.value > 0);
    if (!vals.length) {
      debugExtraction.push(`[SKIP] ${text} → no numeric values after article`);
      continue;
    }

    const { count, ingressos } = classifyVendesTokens(vals);
    debugExtraction.push(
      `[ARTICLE] ${article} | raw nums: [${vals.map(t => t.raw).join(', ')}]` +
      ` → count=${count ?? 'n/a'}, ingressos=${ingressos}`
    );

    if (!ingressos && !count) continue;
    rows.push({
      article,
      exclusives: count !== null ? String(count) : '',
      ingressos: ingressos ? String(round2(ingressos)) : '',
    });
  }

  // Merge duplicates: sum counts and revenue for the same article
  const merged = new Map();
  for (const r of rows) {
    const prev = merged.get(r.article);
    if (!prev) { merged.set(r.article, { ...r }); continue; }
    warnings.push(`Article ${r.article} apareix més d'una vegada — files agregades`);
    prev.exclusives = String((parseInt(prev.exclusives) || 0) + (parseInt(r.exclusives) || 0));
    prev.ingressos = String(round2((parseFloat(prev.ingressos) || 0) + (parseFloat(r.ingressos) || 0)));
  }

  const mergedRows = [...merged.values()].map(r => {
    const e = parseInt(r.exclusives) || 0;
    const i = parseFloat(r.ingressos) || 0;
    // preu_unitari = ingressos / exclusives — this is the fundamental formula
    const preu_unitari = e > 0 && i > 0 ? String(round2(i / e)) : '';
    log(`Article ${r.article}: exclusives=${e}, ingressos=${i}, preu_unitari=${preu_unitari}`);
    return { ...r, preu_unitari };
  });

  const sumIng = round2(mergedRows.reduce((s, r) => s + (parseFloat(r.ingressos) || 0), 0));
  const sumEx = mergedRows.reduce((s, r) => s + (parseInt(r.exclusives) || 0), 0);
  const totalIngressos = sumIng || pdfTotals.ingressos;
  const avgPreuUnitari = sumEx > 0 && sumIng > 0 ? round2(sumIng / sumEx) : 0;

  if (!mergedRows.length) warnings.push('No s\'han detectat articles al PDF. Introduïu les dades manualment.');
  if (pdfTotals.ingressos && sumIng && Math.abs(pdfTotals.ingressos - sumIng) > 5) {
    warnings.push(`El total del PDF (${pdfTotals.ingressos}) no coincideix amb la suma dels articles (${sumIng})`);
  }
  for (const r of mergedRows) {
    if (!r.exclusives) warnings.push(`Article ${r.article}: no s'ha detectat el nº d'exclusives`);
    if (!r.ingressos) warnings.push(`Article ${r.article}: no s'han detectat els ingressos`);
    // Validate: ingressos = exclusives × preu_unitari (tolerance 0.01)
    const e = parseInt(r.exclusives) || 0;
    const i = parseFloat(r.ingressos) || 0;
    const pu = parseFloat(r.preu_unitari) || 0;
    if (e > 0 && pu > 0 && Math.abs(e * pu - i) > 0.01) {
      warnings.push(`Article ${r.article}: inconsistència — ${e} × ${pu} = ${round2(e * pu)} ≠ ${i}`);
    }
  }

  const excPattern = /\b([A-Z]{2,4}-\d{3,}|\d{4}-\d{3,})\b/g;
  const excMatches = [...new Set(fullText.match(excPattern) || [])];

  log('vendes →', { articles: mergedRows.length, sumEx, totalIngressos, avgPreuUnitari, pdfTotals, warnings });
  log('extracció per línia:', debugExtraction);

  // Build debug lines: first 40 PDF lines + extraction trace
  const debugLines = [
    '=== LÍNIES DEL PDF (primeres 40) ===',
    ...lines.slice(0, 40).map(l => l.text),
    '',
    '=== EXTRACCIÓ PER ARTICLE ===',
    ...debugExtraction,
    '',
    `=== TOTALS DETECTATS: exclusives=${pdfTotals.exclusives}, ingressos=${pdfTotals.ingressos} ===`,
    `=== RESULTAT: ${mergedRows.length} articles, ${sumEx} exclusives, ${sumIng}€, promig ${avgPreuUnitari}€/excl ===`,
  ];

  return {
    rows: mergedRows,
    maxNum: totalIngressos,
    totalExclusives: sumEx,
    avgPreuUnitari,
    pdfTotals,
    excMatches,
    warnings,
    debugLines,
    fullText: fullText.slice(0, 4000),
  };
}

// ─── Validation ──────────────────────────────────────────────────────────────
export function validateOperaris(operaris) {
  const errors = [];
  const seen = new Map();
  operaris.forEach((op, i) => {
    const name = `${op.nom || ''} ${op.cognom || ''}`.trim() || `Fila ${i + 1}`;
    const brut = parseFloat(op.salari_brut) || 0;
    const cot = parseFloat(op.cotitzacions_empresa) || 0;
    const cost = parseFloat(op.cost_empresa) || 0;
    const desc = parseFloat(op.descomptes) || 0;
    const net = parseFloat(op.salari_net) || 0;
    const row = [];
    if (!op.nom) row.push('falta el nom');
    if (brut <= 0) row.push('salari brut ha de ser positiu');
    if ([cot, cost, desc, net].some(v => v < 0)) row.push('valors negatius');
    if (brut > 0 && cost > 0 && Math.abs(cost - (brut + cot)) > 0.5) row.push('Cost empresa ≠ Brut + Cotitzacions');
    if (brut > 0 && net > 0 && Math.abs(net - (brut - desc)) > 0.5) row.push('Net ≠ Brut − Descomptes');
    const key = name.toLowerCase();
    if (seen.has(key)) row.push('operari duplicat');
    seen.set(key, i);
    if (row.length) errors.push({ i, name, errors: row });
  });
  return errors;
}

export function validateArticles(rows) {
  const errors = [];
  const seen = new Set();
  rows.forEach((r, i) => {
    const name = r.article || `Fila ${i + 1}`;
    const e = parseInt(r.exclusives) || 0;
    const ing = parseFloat(r.ingressos) || 0;
    const pu = parseFloat(r.preu_unitari) || 0;
    const row = [];
    if (!r.article) row.push('falta el codi d\'article');
    if (e < 0 || ing < 0 || pu < 0) row.push('valors negatius');
    if (e === 0) row.push('nº exclusives buit o zero');
    if (ing === 0) row.push('ingressos buits o zero');
    if (e > 0 && pu > 0 && Math.abs(e * pu - ing) > 0.01) row.push(`Preu unitari × exclusives (${round2(e * pu)}) ≠ ingressos (${ing})`);
    if (r.article && seen.has(r.article)) row.push('article duplicat');
    if (r.article) seen.add(r.article);
    if (row.length) errors.push({ i, name, errors: row });
  });
  return errors;
}

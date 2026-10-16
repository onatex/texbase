export function parseCSV(text) {
    const clean = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
    if (!clean) return { headers: [], rows: [] };
    const firstLine = clean.split('\n')[0];
    const delim = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';

    const rows = [];
    let field = '';
    let row = [];
    let inQuotes = false;
    for (let i = 0; i < clean.length; i += 1) {
        const c = clean[i];
        if (inQuotes) {
            if (c === '"') {
                if (clean[i + 1] === '"') { field += '"'; i += 1; } else { inQuotes = false; }
            } else field += c;
        } else if (c === '"') inQuotes = true;
        else if (c === delim) { row.push(field); field = ''; }
        else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else field += c;
    }
    row.push(field);
    rows.push(row);

    const headers = rows.shift().map((h) => h.trim());
    const objects = rows
        .filter((r) => r.some((v) => String(v).trim() !== ''))
        .map((r) => {
            const o = {};
            headers.forEach((h, idx) => { o[h] = (r[idx] ?? '').trim(); });
            return o;
        });
    return { headers, rows: objects };
}

const norm = (s) =>
    String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');

export function pick(obj, ...noms) {
    const keys = Object.keys(obj);
    for (const nom of noms) {
        const k = keys.find((key) => norm(key) === norm(nom));
        if (k) return obj[k];
    }
    return '';
}

export function toCSV(rows) {
    if (!rows.length) return '';
    const headers = Object.keys(rows[0]);
    const esc = (v) => {
        const s = v === null || v === undefined ? '' : String(v);
        return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [headers.join(';'), ...rows.map((r) => headers.map((h) => esc(r[h])).join(';'))].join('\n');
}

export function descarregaCSV(nom, rows) {
    const blob = new Blob([`\uFEFF${toCSV(rows)}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nom;
    a.click();
    URL.revokeObjectURL(url);
}

export function formatSegons(total) {
    const s = Math.max(0, Math.floor(total || 0));
    const h = String(Math.floor(s / 3600)).padStart(2, '0');
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const sec = String(s % 60).padStart(2, '0');
    return `${h}:${m}:${sec}`;
}

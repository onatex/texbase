// Exporta los registros de una base de datos de PocketBase al formato JSON de
// la API, un archivo por colección, para cargarlos en la demo.
// Uso: node --no-warnings scripts/datos-demo.mjs <pb_data/data.db> <carpeta_salida>
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import schema from '../src/lib/demo/schema.json' with { type: 'json' };

const [dbPath, outDir] = process.argv.slice(2);
const db = new DatabaseSync(dbPath, { readOnly: true });
mkdirSync(outDir, { recursive: true });
let total = 0;
for (const [name, col] of Object.entries(schema)) {
	const rows = db.prepare(`SELECT * FROM "${name}"`).all();
	if (!rows.length) continue;
	const records = rows.map((row) => {
		const rec = { id: row.id, collectionId: col.id, collectionName: name };
		for (const [k, f] of Object.entries(col.fields)) {
			let v = row[k];
			if (f.m) v = v ? JSON.parse(v) : [];
			else if (f.t === 'bool') v = !!v;
			else if (f.t === 'number') v = Number(v) || 0;
			else if (f.t === 'json') v = v === null || v === '' ? null : JSON.parse(v);
			else v = v ?? '';
			rec[k] = v;
		}
		return rec;
	});
	writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(records));
	console.log(`${name.padEnd(32)} ${records.length}`);
	total += records.length;
}
console.log(`Total: ${total} registros`);

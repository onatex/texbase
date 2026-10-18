// Genera src/lib/demo/schema.json (tipos de campo, relaciones e índices únicos)
// a partir de una base de datos de PocketBase con todas las migraciones aplicadas.
// Uso: node --no-warnings scripts/gen-demo-schema.mjs <ruta/a/pb_data/data.db>
import { writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(process.argv[2], { readOnly: true });
const cols = db.prepare('SELECT id, name, type, fields, indexes FROM _collections ORDER BY name').all();
const byId = Object.fromEntries(cols.map((c) => [c.id, c.name]));
const schema = {};
for (const c of cols) {
	if (c.name.startsWith('_') || c.type === 'view') continue;
	const fields = {};
	for (const f of JSON.parse(c.fields)) {
		if (f.name === 'id' || f.hidden) continue;
		const d = { t: f.type };
		if (f.type === 'relation') { d.c = byId[f.collectionId]; d.m = (f.maxSelect || 0) > 1; }
		if (f.type === 'select' || f.type === 'file') d.m = (f.maxSelect || 0) > 1;
		if (f.type === 'autodate') { d.oc = !!f.onCreate; d.ou = !!f.onUpdate; }
		fields[f.name] = d;
	}
	const unique = [];
	for (const idx of JSON.parse(c.indexes || '[]')) {
		const m = /CREATE UNIQUE INDEX[^(]+\(([^)]+)\)(?:\s+WHERE\s+(.+))?/i.exec(idx);
		if (!m) continue;
		const keys = m[1].split(',').map((s) => s.trim().replace(/[`"]/g, '').split(/\s+/)[0]);
		if (keys.every((k) => k in fields)) unique.push(keys);
	}
	schema[c.name] = { id: c.id, auth: c.type === 'auth', fields, unique };
}
writeFileSync(new URL('../src/lib/demo/schema.json', import.meta.url), JSON.stringify(schema));
console.log(`${Object.keys(schema).length} colecciones`);

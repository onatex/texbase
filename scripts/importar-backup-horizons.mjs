#!/usr/bin/env node
// Importa una copia de seguridad de PocketBase descargada de Hostinger Horizons
// (Panel PocketBase → Settings → Backups) al directorio de datos del nuevo servidor.
//
// Uso: node scripts/importar-backup-horizons.mjs <backup.zip> [directorio_pb_data]
//
// Horizons cifra los ajustes del servidor con una clave que no tenemos
// (PB_ENCRYPTION_KEY). Este script borra esa fila de ajustes para que PocketBase
// arranque con los valores por defecto; los datos y archivos no se tocan.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, renameSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [zip, destArg] = process.argv.slice(2);
if (!zip || !existsSync(zip)) {
	console.error('Uso: node scripts/importar-backup-horizons.mjs <backup.zip> [directorio_pb_data]');
	process.exit(1);
}
const dest = path.resolve(destArg || path.join(root, 'apps/pocketbase/pb_data'));

if (existsSync(path.join(dest, 'data.db'))) {
	const old = `${dest}.anterior-${Date.now()}`;
	renameSync(dest, old);
	console.log(`Datos existentes movidos a ${old}`);
}

const tmp = mkdtempSync(path.join(tmpdir(), 'texbase-backup-'));
execFileSync('unzip', ['-q', path.resolve(zip), '-d', tmp], { stdio: 'inherit' });
// Algunas copias traen pb_data/ dentro; otras, el contenido directamente.
const src = existsSync(path.join(tmp, 'data.db')) ? tmp : path.join(tmp, readdirSync(tmp)[0]);
if (!existsSync(path.join(src, 'data.db'))) throw new Error('La copia no contiene data.db');
cpSync(src, dest, { recursive: true });
rmSync(tmp, { recursive: true, force: true });
for (const f of ['data.db-shm', 'data.db-wal', 'auxiliary.db-shm', 'auxiliary.db-wal']) {
	rmSync(path.join(dest, f), { force: true });
}

const db = new DatabaseSync(path.join(dest, 'data.db'));
db.exec("DELETE FROM _params WHERE id = 'settings'");
const tablas = db.prepare("SELECT name FROM _collections WHERE type != 'view' AND name NOT LIKE '\\_%' ESCAPE '\\' ORDER BY name").all();
console.log('Registros importados:');
for (const { name } of tablas) {
	const { n } = db.prepare(`SELECT count(*) AS n FROM "${name}"`).get();
	if (n) console.log(`  ${name.padEnd(36)} ${n}`);
}
db.close();

console.log(`\nDatos listos en ${dest}.`);
console.log('Siguiente paso: arranca PocketBase (aplicará las migraciones nuevas) y crea tu superusuario:');
console.log('  ./pocketbase superuser upsert TU_EMAIL TU_CONTRASEÑA');

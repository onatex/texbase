// Descarga el binario de PocketBase de la versión fijada en .pocketbase-version.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = readFileSync(path.join(root, '.pocketbase-version'), 'utf8').trim();
const os = { linux: 'linux', darwin: 'darwin', win32: 'windows' }[process.platform];
const arch = { x64: 'amd64', arm64: 'arm64' }[process.arch];
if (!os || !arch) throw new Error(`Plataforma no soportada: ${process.platform}/${process.arch}`);

const bin = path.join(root, process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase');
if (existsSync(bin)) {
	const current = execFileSync(bin, ['--version'], { encoding: 'utf8' });
	if (current.includes(version)) {
		console.log(`PocketBase ${version} ya está instalado.`);
		process.exit(0);
	}
}

const url = `https://github.com/pocketbase/pocketbase/releases/download/v${version}/pocketbase_${version}_${os}_${arch}.zip`;
const zip = path.join(root, 'pocketbase.zip');
console.log(`Descargando ${url}`);
const res = await fetch(url);
if (!res.ok) throw new Error(`Error ${res.status} descargando PocketBase`);
writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
execFileSync('unzip', ['-o', zip, process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase', '-d', root], { stdio: 'inherit' });
rmSync(zip);
console.log(`PocketBase ${version} instalado en ${bin}`);

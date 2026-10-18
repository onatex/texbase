// Convierte dist-demo/index.html en la página del artefacto (sin <html>/<head>/
// <body>, que añade el visor al publicar) y lista los archivos a publicar.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const dir = new URL('../dist-demo/', import.meta.url);
const html = readFileSync(new URL('index.html', dir), 'utf8');
const tags = [...html.matchAll(/<(script|link)\b[^>]*>(?:<\/script>)?/g)]
	.map((m) => m[0])
	.filter((t) => /assets\//.test(t) || /fonts\.googleapis/.test(t));
const page = [
	'<title>TexBase</title>',
	'<style>html,body,#root{min-height:100%}body{background:hsl(0 0% 100%)}</style>',
	...tags,
	'<div id="root"></div>',
	'',
].join('\n');
writeFileSync(new URL('texbase.html', dir), page);
const assets = readdirSync(new URL('assets/', dir));
writeFileSync(new URL('files.json', dir), JSON.stringify(Object.fromEntries(assets.map((f) => [`assets/${f}`, `assets/${f}`])), null, 1));
console.log(`Página: dist-demo/texbase.html · ${assets.length} archivos en assets/`);

// Ajustes del navegador para la demo dentro de un artefacto de claude.ai:
// el visor no muestra alert()/confirm(), bloquea las descargas directas y no
// tiene servidor, así que se sustituyen por equivalentes.
import pb, { DEMO_SCHEME } from './pocketbaseDemo';
import { clienteStats } from './clienteStats';

let toastBox;
export function toast(text, tone = 'info') {
	if (typeof document === 'undefined' || !text) return;
	if (!toastBox) {
		toastBox = document.createElement('div');
		toastBox.setAttribute('role', 'status');
		toastBox.setAttribute('aria-live', 'polite');
		toastBox.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:9999;display:flex;flex-direction:column;gap:8px;width:min(92vw,480px);pointer-events:none';
		document.body.appendChild(toastBox);
	}
	const el = document.createElement('div');
	el.textContent = String(text);
	const bg = tone === 'error' ? 'hsl(var(--destructive))' : 'hsl(var(--primary))';
	el.style.cssText = `background:${bg};color:hsl(var(--primary-foreground));padding:10px 14px;border-radius:8px;font-size:14px;box-shadow:0 6px 20px rgb(0 0 0 / .2);white-space:pre-line`;
	toastBox.appendChild(el);
	setTimeout(() => el.remove(), tone === 'error' ? 7000 : 4500);
}

// alert() → aviso; confirm() → se acepta y se avisa (no hay diálogo en el visor).
window.alert = (msg) => toast(msg, /error|no se|no s'ha/i.test(String(msg)) ? 'error' : 'info');
window.confirm = (msg) => { toast(`Confirmado: ${String(msg || '').split('\n')[0]}`); return true; };
window.prompt = () => null;

// Descargas (<a download> con blob:/data:) → capacidad "downloads".
const downloadsPromise = window.claude?.use ? window.claude.use('downloads').catch(() => null) : Promise.resolve(null);
const nativeClick = HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click = function click() {
	const href = this.getAttribute('href') || '';
	if (this.hasAttribute('download') && /^(blob|data):/.test(href)) {
		const filename = this.getAttribute('download') || 'descarga';
		(async () => {
			const downloads = await downloadsPromise;
			if (!downloads) { toast('Las descargas no están disponibles en este visor.', 'error'); return; }
			try {
				const blob = await (await fetch(href)).blob();
				await downloads.save({ filename, data: blob });
			} catch (err) {
				if (err?.code !== 'declined') toast(`No se pudo descargar ${filename}.`, 'error');
			}
		})();
		return;
	}
	nativeClick.call(this);
};

// Peticiones directas a la API (fetch) que la app hace fuera del SDK.
const nativeFetch = window.fetch.bind(window);
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
window.fetch = async (input, init = {}) => {
	const url = typeof input === 'string' ? input : input?.url || '';
	if (!url.startsWith(DEMO_SCHEME)) return nativeFetch(input, init);
	const path = url.slice(DEMO_SCHEME.length);
	try {
		if (path.startsWith('/api/cliente/stats')) return json(200, await clienteStats(pb));
		const m = /^\/api\/collections\/([^/]+)\/records\/([^/?]+)/.exec(path);
		if (m && (init.method || 'GET').toUpperCase() === 'PATCH') {
			const body = typeof init.body === 'string' ? JSON.parse(init.body) : {};
			return json(200, await pb.collection(m[1]).update(m[2], body));
		}
		return json(404, { message: 'No disponible en la demo.' });
	} catch (err) {
		return json(err?.status || 500, { message: err?.message || 'Error' });
	}
};

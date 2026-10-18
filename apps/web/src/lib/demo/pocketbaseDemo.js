// Cliente de PocketBase para la versión de demostración alojada como artefacto
// de claude.ai. Imita la parte del SDK que usa la app (colecciones, filtros,
// expand, tiempo real, archivos y login), pero guarda los registros en la base
// de datos compartida del artefacto (`db`) en lugar de en un servidor.
//
// Cada colección de PocketBase es una colección `tb_<nombre>` del artefacto y
// cada registro un documento con el mismo id y el mismo formato JSON que
// devolvería la API. La lógica de servidor (hooks) está en ./hooks.js.
import schema from './schema.json';
import { compileFilter, compileSort, evaluate, filterPaths } from './filter';
import { runHooks } from './hooks';

export const DEMO_PASSWORD = 'demo1234';
const DOC_LIMIT = 1000;
const LOAD_TIMEOUT_MS = 10000;
const AUTH_KEY = 'texbase-demo-auth';

// ── Errores con la misma forma que ClientResponseError del SDK ──────────────
export class ClientResponseError extends Error {
	constructor(status, message, data = {}) {
		super(message);
		this.name = 'ClientResponseError';
		this.status = status;
		this.url = '';
		this.isAbort = false;
		this.originalError = null;
		this.response = { code: status, message, data };
		this.data = this.response;
	}
}
const notFound = () => new ClientResponseError(404, "The requested resource wasn't found.");

// ── Utilidades ───────────────────────────────────────────────────────────────
export const nowPB = (d = new Date()) => d.toISOString().replace('T', ' ');
const newId = () => {
	const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
	const bytes = crypto.getRandomValues(new Uint8Array(15));
	return Array.from(bytes, (b) => abc[b % abc.length]).join('');
};
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const isFile = (v) => typeof Blob !== 'undefined' && v instanceof Blob;

function defaultFor(f) {
	if (f.m) return [];
	switch (f.t) {
		case 'number': return 0;
		case 'bool': return false;
		case 'json': return null;
		default: return '';
	}
}

function toDate(v) {
	if (v === null || v === undefined || v === '') return '';
	const d = v instanceof Date ? v : new Date(String(v).length === 10 ? `${v}T00:00:00Z` : String(v).replace(' ', 'T'));
	return Number.isNaN(d.getTime()) ? '' : nowPB(d);
}

function coerce(f, v) {
	if (f.m) {
		if (v === null || v === undefined || v === '') return [];
		const arr = Array.isArray(v) ? v : [v];
		return arr.filter((x) => x !== '' && x !== null && x !== undefined).map(String);
	}
	switch (f.t) {
		case 'number': { const n = Number(v); return Number.isFinite(n) ? n : 0; }
		case 'bool': return v === true || v === 'true' || v === 1 || v === '1' || v === 'on';
		case 'json':
			if (typeof v === 'string') { try { return JSON.parse(v); } catch (_) { return v; } }
			return v === undefined ? null : v;
		case 'date':
		case 'autodate': return toDate(v);
		default:
			if (Array.isArray(v)) v = v[v.length - 1];
			return v === null || v === undefined ? '' : String(v);
	}
}

// ── Capacidades del artefacto ────────────────────────────────────────────────
const capacidad = (name) => (typeof window !== 'undefined' && window.claude?.use ? window.claude.use(name) : Promise.resolve(null));
const dbPromise = capacidad('db').catch(() => null);
const assetsPromise = capacidad('assets').catch(() => null);

// ── Almacén en memoria sincronizado con `db` ─────────────────────────────────
const store = new Map(); // nombre → Map(id → registro)
const loading = new Map(); // nombre → Promise
const listeners = new Map(); // nombre → Set({topic, cb})
const writeChains = new Map(); // ruta de documento → Promise (una escritura a la vez)
// Escrituras propias aún sin confirmar: mientras haya alguna, los ecos que
// llegan por onSnapshot pueden ser de una versión anterior y se ignoran.
const pendingWrites = new Map(); // ruta de documento → número de escrituras en curso
export const demoStatus = { db: 'cargando', warnings: new Set() };

function emit(name, action, record) {
	for (const l of listeners.get(name) || []) {
		if (l.topic === '*' || l.topic === record.id) {
			try { l.cb({ action, record: clone(record) }); } catch (err) { console.error(err); }
		}
	}
}

function ensure(name) {
	if (!schema[name]) return Promise.resolve();
	if (loading.has(name)) return loading.get(name);
	const p = (async () => {
		store.set(name, new Map());
		const db = await dbPromise;
		if (!db) { demoStatus.db = 'sin-acceso'; return; }
		demoStatus.db = 'ok';
		await new Promise((resolve) => {
			let first = true;
			const done = () => { if (first) { first = false; resolve(); } };
			setTimeout(done, LOAD_TIMEOUT_MS);
			db.collection(`tb_${name}`).limit(DOC_LIMIT).onSnapshot((snap) => {
				const map = store.get(name);
				if (snap.size >= DOC_LIMIT) demoStatus.warnings.add(`${name}: más de ${DOC_LIMIT} registros, se muestran ${DOC_LIMIT}`);
				for (const ch of snap.docChanges()) {
					const rec = ch.doc.data();
					const id = ch.doc.id;
					if (!first && pendingWrites.get(`tb_${name}/${id}`)) continue;
					if (ch.type === 'removed') {
						const old = map.get(id);
						if (old) { map.delete(id); if (!first) emit(name, 'delete', old); }
						continue;
					}
					const prev = map.get(id);
					if (prev && JSON.stringify(prev) === JSON.stringify(rec)) continue;
					map.set(id, clone(rec));
					if (!first) emit(name, prev ? 'update' : 'create', rec);
				}
				if (!snap.metadata.fromCache) done();
			}, (err) => {
				console.error(`[demo] ${name}:`, err);
				done();
			});
		});
	})();
	loading.set(name, p);
	return p;
}

/** Colecciones que hay que tener cargadas para resolver rutas y expand. */
function relatedCollections(name, paths) {
	const out = new Set([name]);
	for (const path of paths) {
		let col = name;
		for (const seg of path.split('.')) {
			const f = schema[col]?.fields[seg.split(':')[0]];
			if (!f || f.t !== 'relation') break;
			col = f.c;
			out.add(col);
		}
	}
	return [...out];
}

function resolver(name) {
	return (record, path) => {
		let values = [record];
		let col = name;
		let multi = false;
		const segs = path.split('.');
		for (let i = 0; i < segs.length; i++) {
			const seg = segs[i].split(':')[0];
			if (seg.startsWith('@')) return '';
			const f = schema[col]?.fields[seg];
			const raw = values.map((r) => (r ? r[seg] : undefined));
			if (i === segs.length - 1 || !f || f.t !== 'relation') {
				const flat = [];
				for (const v of raw) {
					if (Array.isArray(v)) { multi = true; flat.push(...v); } else flat.push(v ?? (f ? defaultFor(f) : ''));
				}
				return multi || flat.length !== 1 ? flat : flat[0];
			}
			if (f.m) multi = true;
			const ids = raw.flatMap((v) => (Array.isArray(v) ? v : v ? [v] : []));
			const target = store.get(f.c) || new Map();
			values = ids.map((id) => target.get(id)).filter(Boolean);
			col = f.c;
			if (!values.length) return multi ? [] : '';
		}
		return '';
	};
}

function applyExpand(name, record, expand) {
	if (!expand) return record;
	const tree = {};
	for (const path of expand.split(',').map((s) => s.trim()).filter(Boolean)) {
		let node = tree;
		for (const seg of path.split('.')) node = node[seg] ??= {};
	}
	const walk = (col, rec, node) => {
		const out = {};
		for (const [field, sub] of Object.entries(node)) {
			const f = schema[col]?.fields[field];
			if (!f || f.t !== 'relation') continue;
			const target = store.get(f.c) || new Map();
			const pick = (id) => {
				const r = target.get(id);
				if (!r) return null;
				const c = clone(r);
				const e = walk(f.c, c, sub);
				if (Object.keys(e).length) c.expand = e;
				return c;
			};
			if (f.m) {
				const list = (rec[field] || []).map(pick).filter(Boolean);
				if (list.length) out[field] = list;
			} else if (rec[field]) {
				const one = pick(rec[field]);
				if (one) out[field] = one;
			}
		}
		return out;
	};
	const e = walk(name, record, tree);
	if (Object.keys(e).length) record.expand = e;
	return record;
}

function applyFields(record, fields) {
	if (!fields) return record;
	const list = fields.split(',').map((s) => s.trim()).filter(Boolean);
	if (list.includes('*')) return record;
	const out = {};
	for (const k of list) if (k in record) out[k] = record[k];
	if (record.expand && list.some((k) => k.startsWith('expand'))) out.expand = record.expand;
	return out;
}

async function query(name, opts = {}) {
	const ast = compileFilter(opts.filter);
	const sortPaths = String(opts.sort || '').split(',').map((s) => s.trim().replace(/^[-+]/, '')).filter(Boolean);
	const expandPaths = String(opts.expand || '').split(',').map((s) => s.trim()).filter(Boolean);
	await Promise.all(relatedCollections(name, [...filterPaths(ast), ...sortPaths, ...expandPaths]).map(ensure));
	const resolve = resolver(name);
	let items = [...(store.get(name) || new Map()).values()];
	if (ast) items = items.filter((r) => evaluate(ast, r, resolve));
	const cmp = compileSort(opts.sort, resolve);
	if (cmp) items.sort(cmp);
	return items;
}

function present(name, record, opts = {}) {
	return applyFields(applyExpand(name, clone(record), opts.expand), opts.fields);
}

// ── Escrituras ───────────────────────────────────────────────────────────────
async function persist(name, record, remove = false) {
	const db = await dbPromise;
	if (!db) return;
	const path = `tb_${name}/${record.id}`;
	pendingWrites.set(path, (pendingWrites.get(path) || 0) + 1);
	const prev = writeChains.get(path) || Promise.resolve();
	const job = prev.catch(() => {}).then(() => (remove ? db.doc(path).delete() : db.doc(path).set(clone(record))));
	writeChains.set(path, job);
	try {
		await job;
		// Deja pasar el eco de esta escritura antes de volver a aceptar cambios remotos.
		setTimeout(() => pendingWrites.set(path, pendingWrites.get(path) - 1), 1500);
	} catch (err) {
		pendingWrites.set(path, pendingWrites.get(path) - 1);
		console.error(`[demo] no se pudo guardar ${path}`, err);
		if (err?.code === 'invalid_argument') demoStatus.warnings.add('Solo lectura: tu nivel de acceso a este artefacto no permite modificar datos.');
		throw new ClientResponseError(400, 'No se pudo guardar el cambio en la demo.', {});
	}
}

async function uploadFile(file) {
	const assets = await assetsPromise;
	const safe = String(file.name || 'archivo').replace(/[^A-Za-z0-9._-]/g, '_');
	if (assets) {
		try {
			const res = await assets.upload(file);
			return `${res.id}__${safe}`;
		} catch (err) {
			console.warn('[demo] no se pudo subir el archivo', err);
		}
	}
	return URL.createObjectURL(file);
}

/** Convierte un objeto o FormData en {campo: valor} aplicando modificadores +/-. */
async function readBody(name, body, current) {
	const fields = schema[name].fields;
	const raw = {};
	const add = (k, v) => {
		if (k in raw) raw[k] = [].concat(raw[k], v);
		else raw[k] = v;
	};
	if (typeof FormData !== 'undefined' && body instanceof FormData) {
		for (const [k, v] of body.entries()) add(k, v);
	} else {
		for (const [k, v] of Object.entries(body || {})) raw[k] = v;
	}

	const out = {};
	for (const [key, value] of Object.entries(raw)) {
		let field = key;
		let mod = '';
		if (key.endsWith('+') || key.endsWith('-')) { field = key.slice(0, -1); mod = key.slice(-1); }
		else if (key.startsWith('+')) { field = key.slice(1); mod = '^'; }
		const f = fields[field];
		if (!f || f.t === 'autodate') continue;
		let v = value;
		if (f.t === 'file') {
			const list = (Array.isArray(v) ? v : [v]).filter((x) => x !== null && x !== undefined && x !== '');
			const names = [];
			for (const x of list) names.push(isFile(x) ? await uploadFile(x) : String(x));
			v = f.m ? names : (names[names.length - 1] || '');
		}
		if (mod && f.t === 'number') {
			const base = Number(out[field] ?? current?.[field] ?? 0);
			out[field] = base + (mod === '-' ? -1 : 1) * Number(v || 0);
			continue;
		}
		if (mod && f.m) {
			const base = out[field] ?? current?.[field] ?? [];
			const vals = coerce(f, v);
			if (mod === '-') out[field] = base.filter((x) => !vals.includes(x));
			else if (mod === '^') out[field] = [...vals, ...base];
			else out[field] = [...base, ...vals];
			continue;
		}
		out[field] = coerce(f, v);
	}
	return out;
}

function checkUnique(name, record) {
	for (const keys of schema[name].unique || []) {
		if (keys.some((k) => record[k] === '' || record[k] === null || record[k] === undefined)) continue;
		for (const other of store.get(name)?.values() || []) {
			if (other.id !== record.id && keys.every((k) => String(other[k]).toLowerCase() === String(record[k]).toLowerCase())) {
				const data = Object.fromEntries(keys.map((k) => [k, { code: 'validation_not_unique', message: 'Value must be unique.' }]));
				throw new ClientResponseError(400, 'Failed to create record.', data);
			}
		}
	}
}

function blankRecord(name) {
	const s = schema[name];
	const rec = { collectionId: s.id, collectionName: name };
	for (const [k, f] of Object.entries(s.fields)) rec[k] = defaultFor(f);
	return rec;
}

async function createRecord(name, body, opts = {}) {
	await ensure(name);
	const data = await readBody(name, body, null);
	const rec = blankRecord(name);
	Object.assign(rec, data);
	const rawId = body instanceof FormData ? body.get('id') : body?.id;
	rec.id = rawId ? String(rawId) : newId();
	if (store.get(name).has(rec.id)) throw new ClientResponseError(400, 'Failed to create record.', { id: { code: 'validation_not_unique', message: 'Value must be unique.' } });
	const now = nowPB();
	for (const [k, f] of Object.entries(schema[name].fields)) if (f.t === 'autodate' && f.oc) rec[k] = now;
	if (schema[name].auth && !rec.email && rec.codi) rec.email = '';
	await runHooks('beforeCreate', name, rec, api);
	checkUnique(name, rec);
	store.get(name).set(rec.id, rec);
	emit(name, 'create', rec);
	await persist(name, rec);
	await runHooks('afterCreate', name, rec, api);
	return present(name, store.get(name).get(rec.id) || rec, opts);
}

async function updateRecord(name, id, body, opts = {}) {
	await ensure(name);
	const current = store.get(name).get(id);
	if (!current) throw notFound();
	const data = await readBody(name, body, current);
	const original = clone(current);
	const rec = { ...clone(current), ...data };
	for (const [k, f] of Object.entries(schema[name].fields)) if (f.t === 'autodate' && f.ou) rec[k] = nowPB();
	await runHooks('beforeUpdate', name, rec, api, original);
	checkUnique(name, rec);
	store.get(name).set(id, rec);
	emit(name, 'update', rec);
	await persist(name, rec);
	if (authStore.record && name === 'users' && authStore.record.id === id) authStore.save(authStore.token, rec);
	await runHooks('afterUpdate', name, rec, api, original);
	return present(name, store.get(name).get(id) || rec, opts);
}

async function deleteRecord(name, id) {
	await ensure(name);
	const current = store.get(name).get(id);
	if (!current) throw notFound();
	store.get(name).delete(id);
	emit(name, 'delete', current);
	await persist(name, current, true);
	return true;
}

// ── API interna para los hooks (equivalente a $app) ──────────────────────────
const api = {
	find: async (name, filter, sort) => (await query(name, { filter, sort })).map(clone),
	findById: async (name, id) => { await ensure(name); const r = store.get(name).get(id); return r ? clone(r) : null; },
	create: (name, data) => createRecord(name, data),
	update: (name, id, data) => updateRecord(name, id, data),
	error: (message) => new ClientResponseError(400, message, {}),
	nowPB,
};

// ── authStore ────────────────────────────────────────────────────────────────
const authListeners = new Set();
const authStore = {
	token: '',
	record: null,
	get model() { return this.record; },
	get isValid() { return !!this.token && !!this.record; },
	get isSuperuser() { return false; },
	save(token, record) {
		this.token = token;
		this.record = record ? clone(record) : null;
		try {
			if (token) localStorage.setItem(AUTH_KEY, JSON.stringify({ token, record: this.record }));
			else localStorage.removeItem(AUTH_KEY);
		} catch (_) { /* almacenamiento no disponible */ }
		for (const cb of authListeners) { try { cb(this.token, this.record); } catch (err) { console.error(err); } }
	},
	clear() { this.save('', null); },
	onChange(cb, fireImmediately = false) {
		authListeners.add(cb);
		if (fireImmediately) cb(this.token, this.record);
		return () => authListeners.delete(cb);
	},
};
try {
	const saved = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
	if (saved?.token && saved?.record) { authStore.token = saved.token; authStore.record = saved.record; }
} catch (_) { /* sin sesión guardada */ }

// ── Servicio de colección ────────────────────────────────────────────────────
function collection(name) {
	const known = () => { if (!schema[name]) throw new ClientResponseError(404, `Missing collection context: ${name}`); };
	return {
		async getFullList(a, b) {
			known();
			const opts = (typeof a === 'object' && a !== null ? a : b) || {};
			return (await query(name, opts)).map((r) => present(name, r, opts));
		},
		async getList(page = 1, perPage = 30, opts = {}) {
			known();
			const all = await query(name, opts);
			const start = (page - 1) * perPage;
			return {
				page, perPage,
				totalItems: opts.skipTotal ? -1 : all.length,
				totalPages: opts.skipTotal ? -1 : Math.ceil(all.length / perPage),
				items: all.slice(start, start + perPage).map((r) => present(name, r, opts)),
			};
		},
		async getOne(id, opts = {}) {
			known();
			if (!id) throw notFound();
			await Promise.all(relatedCollections(name, String(opts.expand || '').split(',').map((s) => s.trim()).filter(Boolean)).map(ensure));
			const r = store.get(name).get(id);
			if (!r) throw notFound();
			return present(name, r, opts);
		},
		async getFirstListItem(filter, opts = {}) {
			known();
			const items = await query(name, { ...opts, filter });
			if (!items.length) throw notFound();
			return present(name, items[0], opts);
		},
		create(body, opts) { known(); return createRecord(name, body, opts); },
		update(id, body, opts) { known(); return updateRecord(name, id, body, opts); },
		delete(id) { known(); return deleteRecord(name, id); },
		async subscribe(topic, cb) {
			known();
			await ensure(name);
			const entry = { topic, cb };
			if (!listeners.has(name)) listeners.set(name, new Set());
			listeners.get(name).add(entry);
			return async () => { listeners.get(name)?.delete(entry); };
		},
		async unsubscribe(topic) {
			const set = listeners.get(name);
			if (!set) return;
			for (const l of [...set]) if (!topic || l.topic === topic) set.delete(l);
		},
		async authWithPassword(identity, password) {
			await ensure('users');
			const id = String(identity || '').trim().toLowerCase();
			const user = [...store.get('users').values()].find((u) => (u.email && u.email.toLowerCase() === id) || (u.codi && u.codi.toLowerCase() === id));
			if (!user || password !== DEMO_PASSWORD) throw new ClientResponseError(400, 'Failed to authenticate.', {});
			const token = `demo.${user.id}.${Date.now()}`;
			authStore.save(token, user);
			return { token, record: clone(user) };
		},
		async authRefresh() {
			if (!authStore.isValid) throw new ClientResponseError(401, 'The request requires valid record authorization token.');
			await ensure('users');
			const u = store.get('users').get(authStore.record.id);
			if (!u) { authStore.clear(); throw notFound(); }
			authStore.save(authStore.token, u);
			return { token: authStore.token, record: clone(u) };
		},
	};
}

// ── pb.filter, pb.files, pb.buildURL ─────────────────────────────────────────
function filter(expr, params = {}) {
	return String(expr).replace(/\{:(\w+)\}/g, (_, k) => {
		let v = params[k];
		if (v === null || v === undefined) return 'null';
		if (typeof v === 'number' || typeof v === 'boolean') return String(v);
		if (v instanceof Date) v = nowPB(v);
		else if (typeof v === 'object') v = JSON.stringify(v);
		return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
	});
}

const files = {
	getURL(_record, filename) {
		if (!filename) return '';
		const f = String(filename);
		if (f.startsWith('blob:') || f.startsWith('data:') || f.startsWith('http')) return f;
		const i = f.indexOf('__');
		return i > 0 ? `/_blob/${f.slice(0, i)}` : '';
	},
	getUrl(record, filename, opts) { return this.getURL(record, filename, opts); },
	async getToken() { return ''; },
};

export const DEMO_SCHEME = 'texbase-demo:';
const pb = {
	authStore,
	files,
	filter,
	collection,
	buildURL: (path) => `${DEMO_SCHEME}${path.startsWith('/') ? '' : '/'}${path}`,
	baseURL: '/',
	autoCancellation() {},
	cancelAllRequests() {},
	cancelRequest() {},
	// Acceso interno para el panel de cliente y las peticiones "fetch" simuladas.
	_demo: { query, ensure, store, schema, updateRecord },
};

// Acceso para depurar desde la consola del navegador.
if (typeof window !== 'undefined') window.__texbase = pb;

export default pb;
export { pb as pocketbaseClient };

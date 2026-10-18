// Intérprete de la sintaxis de filtros y ordenación de PocketBase para la
// versión de demostración (los datos viven en memoria, no en SQLite).
//
// Cubre lo que usa la app: comparadores = != > >= < <= ~ !~ y sus variantes
// "?" (cualquiera de una lista), && / || con paréntesis, rutas por relación
// (encargo_id.proveedor_id), literales de texto/número/true/false/null y la
// forma `campo = ("a" || "b")` como pertenencia a una lista.

const OPS = ['?!~', '?!=', '?>=', '?<=', '!~', '!=', '>=', '<=', '?=', '?~', '?>', '?<', '=', '~', '>', '<'];

function tokenize(src) {
	const out = [];
	let i = 0;
	while (i < src.length) {
		const ch = src[i];
		if (/\s/.test(ch)) { i++; continue; }
		if (ch === '(' || ch === ')') { out.push({ t: ch }); i++; continue; }
		if (src.startsWith('&&', i)) { out.push({ t: '&&' }); i += 2; continue; }
		if (src.startsWith('||', i)) { out.push({ t: '||' }); i += 2; continue; }
		const op = OPS.find((o) => src.startsWith(o, i));
		if (op) { out.push({ t: 'op', v: op }); i += op.length; continue; }
		if (ch === '"' || ch === "'") {
			let j = i + 1;
			let s = '';
			while (j < src.length && src[j] !== ch) {
				if (src[j] === '\\' && j + 1 < src.length) { s += src[j + 1]; j += 2; continue; }
				s += src[j++];
			}
			out.push({ t: 'lit', v: s });
			i = j + 1;
			continue;
		}
		const m = /^[A-Za-z0-9_.:@\-+]+/.exec(src.slice(i));
		if (!m) throw new Error(`Filtro no válido cerca de: ${src.slice(i, i + 20)}`);
		const w = m[0];
		if (w === 'true' || w === 'false') out.push({ t: 'lit', v: w === 'true' });
		else if (w === 'null') out.push({ t: 'lit', v: null });
		else if (/^-?\d+(\.\d+)?$/.test(w)) out.push({ t: 'lit', v: Number(w) });
		else out.push({ t: 'id', v: w });
		i += w.length;
	}
	return out;
}

function parse(tokens) {
	let p = 0;
	const peek = () => tokens[p];
	const next = () => tokens[p++];
	const expect = (t) => {
		const tok = next();
		if (!tok || tok.t !== t) throw new Error(`Filtro no válido: se esperaba ${t}`);
		return tok;
	};

	function operand() {
		const tok = next();
		if (!tok) throw new Error('Filtro incompleto');
		if (tok.t === 'lit') return { k: 'lit', v: tok.v };
		if (tok.t === 'id') return { k: 'field', v: tok.v };
		if (tok.t === '(') {
			// Lista de literales: ("a" || "b")
			const items = [operand()];
			while (peek()?.t === '||') { next(); items.push(operand()); }
			expect(')');
			return { k: 'list', v: items };
		}
		throw new Error('Filtro no válido');
	}

	function comparison() {
		if (peek()?.t === '(') {
			next();
			const e = orExpr();
			expect(')');
			return e;
		}
		const left = operand();
		const op = expect('op').v;
		const right = operand();
		return { k: 'cmp', op, left, right };
	}

	function andExpr() {
		let node = comparison();
		while (peek()?.t === '&&') { next(); node = { k: 'and', a: node, b: comparison() }; }
		return node;
	}

	function orExpr() {
		let node = andExpr();
		while (peek()?.t === '||') { next(); node = { k: 'or', a: node, b: andExpr() }; }
		return node;
	}

	const ast = orExpr();
	if (p < tokens.length) throw new Error('Filtro no válido: sobran elementos');
	return ast;
}

const cache = new Map();
export function compileFilter(src) {
	if (!src || !String(src).trim()) return null;
	if (!cache.has(src)) cache.set(src, parse(tokenize(String(src))));
	return cache.get(src);
}

/** Campos (rutas) usados por un filtro, para precargar relaciones. */
export function filterPaths(ast, out = []) {
	if (!ast) return out;
	if (ast.k === 'and' || ast.k === 'or') { filterPaths(ast.a, out); filterPaths(ast.b, out); }
	if (ast.k === 'cmp') for (const s of [ast.left, ast.right]) if (s.k === 'field') out.push(s.v);
	return out;
}

function scalar(v) {
	if (v === null || v === undefined) return '';
	if (typeof v === 'object') return JSON.stringify(v);
	return v;
}

function compare(a, b, op) {
	a = scalar(a);
	b = scalar(b);
	if (typeof a === 'boolean' || typeof b === 'boolean') {
		const ab = a === true || a === 'true' || a === 1;
		const bb = b === true || b === 'true' || b === 1;
		a = ab; b = bb;
	}
	const numeric = (typeof a === 'number' || typeof b === 'number')
		&& a !== '' && b !== '' && !Number.isNaN(Number(a)) && !Number.isNaN(Number(b));
	if (numeric) { a = Number(a); b = Number(b); }
	switch (op) {
		case '=': return numeric ? a === b : String(a) === String(b);
		case '!=': return numeric ? a !== b : String(a) !== String(b);
		case '>': return a > b;
		case '>=': return a >= b;
		case '<': return a < b;
		case '<=': return a <= b;
		case '~':
		case '!~': {
			const needle = String(b).toLowerCase();
			const hay = String(a).toLowerCase();
			let hit;
			if (needle.includes('%')) {
				const re = new RegExp(`^${needle.split('%').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`, 's');
				hit = re.test(hay);
			} else {
				hit = hay.includes(needle);
			}
			return op === '~' ? hit : !hit;
		}
		default: return false;
	}
}

/**
 * Evalúa el AST contra un registro. `resolve(record, path)` devuelve el valor
 * del campo: un escalar o, si la ruta pasa por un campo múltiple, un array.
 */
export function evaluate(ast, record, resolve) {
	if (!ast) return true;
	if (ast.k === 'and') return evaluate(ast.a, record, resolve) && evaluate(ast.b, record, resolve);
	if (ast.k === 'or') return evaluate(ast.a, record, resolve) || evaluate(ast.b, record, resolve);

	const value = (side) => {
		if (side.k === 'lit') return side.v;
		if (side.k === 'list') return side.v.map(value);
		return resolve(record, side.v);
	};
	const any = ast.op.startsWith('?');
	const op = any ? ast.op.slice(1) : ast.op;
	let left = value(ast.left);
	let right = value(ast.right);

	// pb.filter() serializa arrays como texto JSON: "id ?= {:ids}".
	if (typeof right === 'string' && right.startsWith('[') && any) {
		try { const arr = JSON.parse(right); if (Array.isArray(arr)) right = arr; } catch (_) { /* texto normal */ }
	}
	if (ast.right.k === 'list' || (any && Array.isArray(right))) {
		const list = Array.isArray(right) ? right : [right];
		const lefts = Array.isArray(left) ? left : [left];
		if (op === '!=') return lefts.every((l) => list.every((r) => compare(l, r, '!=')));
		return lefts.some((l) => list.some((r) => compare(l, r, op)));
	}
	if (Array.isArray(left)) {
		if (any) return left.some((l) => compare(l, right, op));
		if (left.length === 0) return compare('', right, op);
		return left.every((l) => compare(l, right, op));
	}
	return compare(left, right, op);
}

/** Ordenación "-created,numero" sobre registros. */
export function compileSort(src, resolve) {
	const keys = String(src || '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
		if (s.startsWith('-')) return { f: s.slice(1), d: -1 };
		if (s.startsWith('+')) return { f: s.slice(1), d: 1 };
		return { f: s, d: 1 };
	}).filter((k) => !k.f.startsWith('@'));
	if (!keys.length) return null;
	return (a, b) => {
		for (const { f, d } of keys) {
			let va = scalar(resolve(a, f));
			let vb = scalar(resolve(b, f));
			if (Array.isArray(va)) va = va.join(',');
			if (Array.isArray(vb)) vb = vb.join(',');
			if (typeof va === 'boolean') va = va ? 1 : 0;
			if (typeof vb === 'boolean') vb = vb ? 1 : 0;
			if (va === vb) continue;
			if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * d;
			return (String(va) < String(vb) ? -1 : 1) * d;
		}
		return 0;
	};
}

// Lógica de servidor de PocketBase (apps/pocketbase/pb_hooks) trasladada al
// navegador para la versión de demostración. Mantiene el mismo comportamiento:
//  - encargos_proteccion: encargos solapados e importe validado.
//  - retrabajos-notifications: fecha de asignación y aviso al operario.
//  - auto-pendiente-calidad: paso de la exclusiva a "pendiente_calidad".
//  - auto-close-paused-delivered: cierre de registros pausados de exclusivas
//    entregadas (solo la parte reactiva; el barrido nocturno no aplica).

const jsonArray = (v) => {
	if (Array.isArray(v)) return v;
	if (typeof v !== 'string' || !v) return [];
	try { const p = JSON.parse(v); return Array.isArray(p) ? p : jsonArray(typeof p === 'string' ? p : null); } catch (_) { return []; }
};
const faseSet = (fases) => new Set(jsonArray(fases).map((f) => String(f?.fase || f?.nombre_fase || '').trim().toLowerCase()).filter(Boolean));
const q = (v) => `"${String(v).replace(/"/g, '\\"')}"`;

// ── encargos_externos ────────────────────────────────────────────────────────
async function encargoSolapado(rec, api) {
	if (rec.es_reparacion || !rec.proveedor_id || !rec.exclusiva_id) return;
	const fases = faseSet(rec.fases);
	const monos = new Set(rec.monos || []);
	const activos = await api.find('encargos_externos',
		`proveedor_id = ${q(rec.proveedor_id)} && exclusiva_id = ${q(rec.exclusiva_id)} && estado != 'validado' && estado != 'parcialmente_validado' && estado != 'cerrado'`);
	for (const ex of activos) {
		if (ex.es_reparacion) continue;
		const fasesEx = faseSet(ex.fases);
		if (![...fases].some((f) => fasesEx.has(f))) continue;
		if ((ex.monos || []).some((m) => monos.has(m))) {
			throw api.error('Ya existe un encargo activo para esta fase y unidad con este proveedor. Cierra o valida el encargo existente antes de crear uno nuevo, o márcalo como reparación.');
		}
	}
}

function encargoImporte(rec) {
	const precio = Number(rec.precio_unitario || 0);
	const numFases = Math.max(1, jsonArray(rec.fases).length);
	const nAceptadas = jsonArray(rec.unidades_aceptadas).length;
	const rechazadas = jsonArray(rec.unidades_rechazadas);
	const total = (rec.monos || []).length;
	const importe = (rec.tipo_precio || 'por_fase') === 'paquete' ? nAceptadas * precio : nAceptadas * numFases * precio;
	rec.importe_validado = Math.round(importe * 100) / 100;
	const hoy = new Date().toISOString().slice(0, 10);
	if (nAceptadas > 0 && rechazadas.length === 0 && nAceptadas >= total && total > 0) {
		if (rec.estado !== 'cerrado') {
			rec.estado = 'validado';
			if (!rec.fecha_validacion) rec.fecha_validacion = `${hoy} 00:00:00.000Z`;
		}
	} else if (nAceptadas > 0 && rec.estado !== 'validado' && rec.estado !== 'cerrado') {
		rec.estado = 'parcialmente_validado';
		if (!rec.fecha_validacion) rec.fecha_validacion = `${hoy} 00:00:00.000Z`;
	}
}

// ── retrabajos ───────────────────────────────────────────────────────────────
async function retrabajoCreado(rec, api) {
	await api.update('retrabajos', rec.id, { fecha_asignacion: new Date().toISOString() });
	if (!rec.operario_asignado) return;
	const intento = Number(rec.numero_intento) || 1;
	await api.create('notifications', {
		destinatari: rec.operario_asignado,
		tipus: 'retrabajo_asignado',
		titol: `Nuevo retrabajo asignado (#${intento})`,
		missatge: `Operación: ${rec.operacion_original || '—'}. Motivo: ${rec.motivo_rechazo || ''}`,
		link_id: rec.id,
		llegida: false,
	});
}

// ── auto-pendiente-calidad ───────────────────────────────────────────────────
const CONFECTION_ESTATS = ['recibida', 'pendent', 'en_curs', 'retrasada'];
const FASES_BASE = ['Fase 1', 'Fase 2', 'Fase 3'];
const FASES_CIK = ['Fase 1', 'Fase 2', 'Fase 3', 'Fase 4'];
const norm = (s) => String(s || '').trim().toUpperCase();
function canonFase(f) {
	const m = String(f || '').match(/fase\s*(\d+)/i);
	const n = m ? Number(m[1]) : null;
	return n >= 1 && n <= 4 ? `Fase ${n}` : (f || 'Sin fase');
}
function isCik(ex) {
	if (['R84-053', 'R84-054'].includes(norm(ex.referencia))) return true;
	if (norm(ex.marca).includes('CIK')) return true;
	const art = norm(ex.article);
	return art.includes('R84-053') || art.includes('R84-054');
}

async function syncExclusiva(exId, api) {
	if (!exId) return;
	const ex = await api.findById('exclusives', exId);
	if (!ex) return;
	const expected = isCik(ex) ? FASES_CIK : FASES_BASE;
	const monos = await api.find('monos', `exclusiva = ${q(exId)}`);
	let done = 0;
	for (const mono of monos) {
		if (mono.estat === 'finalitzat') { done++; continue; }
		const regs = await api.find('registres', `mono = ${q(mono.id)}`);
		const fets = {};
		for (const r of regs) {
			if (r.estat !== 'finalitzat') continue;
			const qc = r.control_qualitat;
			if (qc && qc !== 'ok' && qc !== 'aprovat' && qc !== 'pendent') continue;
			const f = canonFase(r.operacio);
			if (f.startsWith('Fase ')) fets[f] = true;
		}
		if (expected.every((f) => fets[f])) done++;
	}
	const pendents = await api.find('retrabajos', `exclusiva = ${q(exId)} && (estado = "pendiente" || estado = "en_proceso")`);
	const unitats = Number(ex.unitats) || 0;
	const allDone = monos.length > 0 && done === monos.length && (unitats <= 0 || done >= unitats) && pendents.length === 0;
	if (allDone && CONFECTION_ESTATS.includes(ex.estat)) await api.update('exclusives', exId, { estat: 'pendiente_calidad' });
	else if (!allDone && ex.estat === 'pendiente_calidad') await api.update('exclusives', exId, { estat: 'en_curs' });
}

async function exclusivaDeRegistre(r, api) {
	if (r.exclusiva) return r.exclusiva;
	if (!r.mono) return '';
	const mono = await api.findById('monos', r.mono);
	return mono?.exclusiva || '';
}

// ── auto-close-paused-delivered ──────────────────────────────────────────────
const NOTE_PREFIX = '[Cierre automático] ';
const nowNote = () => new Date().toISOString().replace('T', ' ').substring(0, 19);

async function cerrarRegistre(r, motivo, api) {
	const notes = String(r.notes || '');
	if (notes.includes(NOTE_PREFIX)) return;
	const nota = `${NOTE_PREFIX}${motivo} (${nowNote()}).`;
	await api.update('registres', r.id, {
		estat: 'finalitzat',
		fi: r.fi || new Date().toISOString(),
		notes: notes ? `${notes}\n${nota}` : nota,
	});
}

async function registrePausat(r, api) {
	if (r.estat !== 'pausat') return;
	const exId = await exclusivaDeRegistre(r, api);
	if (!exId) return;
	const ex = await api.findById('exclusives', exId);
	if (String(ex?.estat || '').toLowerCase().trim() !== 'entregada') return;
	await cerrarRegistre(r, 'Exclusiva entregada — cierre automático de operación pausada', api);
}

// ── Registro de hooks ────────────────────────────────────────────────────────
const HOOKS = {
	beforeCreate: {
		encargos_externos: (rec, api) => encargoSolapado(rec, api),
	},
	beforeUpdate: {
		encargos_externos: (rec) => encargoImporte(rec),
	},
	afterCreate: {
		retrabajos: retrabajoCreado,
		monos: (rec, api) => syncExclusiva(rec.exclusiva, api),
		registres: registrePausat,
	},
	afterUpdate: {
		monos: (rec, api) => syncExclusiva(rec.exclusiva, api),
		registres: async (rec, api) => {
			if (rec.estat === 'finalitzat') await syncExclusiva(await exclusivaDeRegistre(rec, api), api);
			await registrePausat(rec, api);
		},
		exclusives: async (rec, api, original) => {
			if (String(rec.estat || '').toLowerCase().trim() !== 'entregada' || original?.estat === rec.estat) return;
			const pausats = await api.find('registres', `exclusiva = ${q(rec.id)} && estat = "pausat"`);
			for (const r of pausats) {
				await cerrarRegistre(r, 'Exclusiva marcada como entregada — cierre automático de operaciones pausadas', api);
			}
		},
	},
};

export async function runHooks(phase, name, rec, api, original) {
	const fn = HOOKS[phase]?.[name];
	if (!fn) return;
	if (phase.startsWith('before')) {
		await fn(rec, api, original); // los errores de "before" cancelan la escritura
		return;
	}
	try {
		await fn(rec, api, original);
	} catch (err) {
		console.error(`[demo] hook ${phase} ${name}`, err);
	}
}

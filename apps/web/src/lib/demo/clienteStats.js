// Equivalente en el navegador de GET /api/cliente/stats
// (apps/pocketbase/pb_hooks/cliente-stats.pb.js) para la versión de demostración.

const day = (v) => String(v || '').slice(0, 10);

export async function clienteStats(pb) {
	const { query } = pb._demo;
	const now = new Date();
	const todayStr = now.toISOString().slice(0, 10);
	const dow = now.getDay();
	const weekStart = new Date(now);
	weekStart.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
	const weekStartStr = weekStart.toISOString().slice(0, 10);
	const monthStartStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

	const [exclusives, ncs, registres, monos, opsDef] = await Promise.all([
		query('exclusives'), query('no_conformitats'), query('registres'), query('monos'), query('operacions_def'),
	]);

	let inProcess = 0; let pending = 0; let readyToDeliver = 0;
	let completedToday = 0; let completedWeek = 0; let completedMonth = 0;
	const articlesMap = {};
	for (const ex of exclusives) {
		const upd = day(ex.updated);
		if (ex.estat === 'en_curs') inProcess++;
		if (ex.estat === 'pendent' || ex.estat === 'recibida') pending++;
		if (ex.estat === 'lista_recollida') readyToDeliver++;
		if (ex.estat === 'finalitzada' || ex.estat === 'entregada') {
			if (upd >= todayStr) completedToday++;
			if (upd >= weekStartStr) completedWeek++;
			if (upd >= monthStartStr) completedMonth++;
		}
		if (ex.estat === 'en_curs' && ex.article) articlesMap[ex.article] = (articlesMap[ex.article] || 0) + 1;
	}

	const ncClosed = ncs.filter((n) => n.estat === 'tancada').length;
	const ncOpen = ncs.length - ncClosed;

	const temps = registres.filter((r) => r.estat === 'finalitzat' && r.temps_real_seg > 0).map((r) => r.temps_real_seg);
	const avgMinutes = temps.length ? Math.round(temps.reduce((a, b) => a + b, 0) / temps.length / 60) : 0;

	const next7 = new Date(now);
	next7.setDate(now.getDate() + 7);
	const next7Str = next7.toISOString().slice(0, 10);
	const proximas = exclusives
		.filter((e) => e.data_entrega && day(e.data_entrega) >= todayStr && day(e.data_entrega) <= next7Str && !['entregada', 'finalitzada'].includes(e.estat))
		.sort((a, b) => String(a.data_entrega).localeCompare(String(b.data_entrega)))
		.slice(0, 20);

	const upcoming = proximas.map((ex) => {
		const monoIds = new Set(monos.filter((m) => m.exclusiva === ex.id).map((m) => m.id));
		const ops = ex.ruta ? opsDef.filter((o) => o.ruta === ex.ruta && o.actiu).sort((a, b) => a.ordre - b.ordre) : [];
		const totalOps = ops.length;
		const totalPhases = new Set(ops.map((o) => o.fase).filter(Boolean)).size || 1;
		const completedNoms = new Set();
		let currentOp = '';
		for (const r of registres) {
			if (!monoIds.has(r.mono)) continue;
			if (r.estat === 'finalitzat' && r.control_qualitat === 'ok') completedNoms.add(r.operacio);
			if (r.estat === 'en_curs' || r.estat === 'pausat') currentOp = r.operacio;
		}
		const completedOps = completedNoms.size;
		const pendingStdMin = ops.filter((o) => !completedNoms.has(o.nom)).reduce((s, o) => s + (Number(o.temps_std_min) || 0), 0);
		let lastPhase = '';
		for (const o of ops) if (completedNoms.has(o.nom)) lastPhase = o.fase;
		const firstPending = ops.find((o) => !completedNoms.has(o.nom));
		const currentPhase = (firstPending ? firstPending.fase || 'Fase 1' : '') || lastPhase || 'Fase 1';

		const hoursRemaining = (pendingStdMin * 1.2) / 60;
		const nowHour = now.getHours() + now.getMinutes() / 60;
		const WORK_START = 7; const WORK_END = 15.5; const CUTOFF = 14.75;
		const WORK_HOURS = WORK_END - WORK_START;
		let hoursToday = 0;
		if (nowHour < WORK_START) hoursToday = WORK_HOURS;
		else if (nowHour < CUTOFF) hoursToday = CUTOFF - nowHour;
		let status; let days = 0;
		if (totalOps > 0 && completedOps >= totalOps) status = 'ready';
		else if (hoursToday >= hoursRemaining && hoursRemaining > 0) status = 'today';
		else {
			days = Math.ceil((hoursRemaining - hoursToday) / WORK_HOURS);
			status = days <= 1 ? 'tomorrow' : days <= 3 ? 'days' : 'critical';
		}
		if (day(ex.data_entrega) < todayStr) status = 'critical';
		const phaseMatch = String(currentPhase).match(/(\d+)/);
		return {
			exclusiva: ex.exclusiva,
			article: ex.article,
			data_entrega: ex.data_entrega,
			estat: ex.estat,
			prioritat: ex.prioritat,
			currentPhase,
			phaseNum: phaseMatch ? parseInt(phaseMatch[1], 10) : 1,
			totalPhases,
			completedOps,
			totalOps,
			hoursRemaining: Math.round(hoursRemaining * 100) / 100,
			pendingMinutes: Math.round(pendingStdMin * 1.2),
			deliveryStatus: status,
			deliveryDays: days,
			currentOp,
			ncCount: ncs.filter((n) => n.exclusiva === ex.id && n.estat !== 'tancada').length,
		};
	});

	const history = [];
	for (let i = 6; i >= 0; i--) {
		const d = new Date(now);
		d.setDate(now.getDate() - i);
		const dStr = d.toISOString().slice(0, 10);
		history.push({ date: dStr, completed: exclusives.filter((e) => (e.estat === 'finalitzada' || e.estat === 'entregada') && day(e.updated) === dStr).length });
	}

	return {
		timestamp: now.toISOString(),
		totalExclusives: exclusives.length,
		inProcess, pending, readyToDeliver,
		completedToday, completedWeek, completedMonth,
		ncOpen, ncClosed, avgMinutes,
		articlesInProduction: articlesMap,
		upcomingDeliveries: upcoming,
		history,
	};
}

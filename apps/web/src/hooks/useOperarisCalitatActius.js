import { useCallback, useEffect, useRef, useState } from 'react';
import pb from '@/lib/pocketbaseClient';

const MAX = 8 * 60 * 60; // cap 8h

function fmtSeg(s) {
    s = Math.max(0, Math.floor(s || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
    return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/**
 * Hook compartido: operarios de Calidad con un control ACTIVO en este momento.
 *
 * Combina dos fuentes:
 *  1) `actividad_calidad` — sesión efímera (heartbeat) creada por
 *     CalidadSimplificada y ChecklistQC al abrir una unidad pendiente.
 *  2) `controles_qualitat` con estado_qc = en_proceso | en_retrabajo
 *     (checklist QC detallado con retrabajo abierto).
 *
 * No muestra controles pausados/finalizados/cerrados como activos. El tiempo
 * de inspección es en vivo (now - updated, cap 8h); congelado en retrabajo.
 * Una fila por operario+unidad/mono, sin duplicados. Funciona aunque falte
 * alguna relación secundaria (mono/exclusiva expand) resolviendo por id.
 */
export function useOperarisCalitatActius() {
    const [actividad, setActividad] = useState([]);
    const [controles, setControles] = useState([]);
    const [exclusives, setExclusives] = useState([]);
    const [monos, setMonos] = useState([]);
    const [confeccioIds, setConfeccioIds] = useState(() => new Set());
    const [lastUpdate, setLastUpdate] = useState(new Date());
    const tick = useRef(0);
    const [, force] = useState(0);

    // Reloj de 1s para que el tiempo en vivo avance.
    useEffect(() => {
        const id = setInterval(() => { tick.current += 1; force((n) => n + 1); }, 1000);
        return () => clearInterval(id);
    }, []);

    const carrega = useCallback(async () => {
        try {
            const [act, cq, exs, ms, regs] = await Promise.all([
                pb.collection('actividad_calidad').getFullList({
                    expand: 'operari,exclusiva,mono',
                    sort: '-updated',
                    requestKey: 'opcal-act',
                }).catch(() => []),
                pb.collection('controles_qualitat').getFullList({
                    filter: 'estado_qc = "en_proceso" || estado_qc = "en_retrabajo"',
                    expand: 'operari,exclusiva,mono,retrabajo_activo',
                    sort: '-updated',
                    requestKey: 'opcal-cq',
                }).catch(() => []),
                pb.collection('exclusives').getFullList({ requestKey: 'opcal-ex' }).catch(() => []),
                pb.collection('monos').getFullList({ requestKey: 'opcal-mo' }).catch(() => []),
                // Operarios con una operación de confección activa ahora mismo:
                // se muestran como confección, no como Calidad.
                pb.collection('registres').getFullList({
                    filter: 'estat = "en_curs" || estat = "pausat"',
                    fields: 'id,operari',
                    requestKey: 'opcal-regs',
                }).catch(() => []),
            ]);
            setActividad(act || []);
            setControles(cq || []);
            setExclusives(exs || []);
            setMonos(ms || []);
            setConfeccioIds(new Set((regs || []).map((r) => r.operari).filter(Boolean)));
            setLastUpdate(new Date());
        } catch {
            // mantener datos en caliente
        }
    }, []);

    useEffect(() => { carrega(); }, [carrega]);

    // Realtime: recarga ante cualquier cambio relevante.
    useEffect(() => {
        const cols = ['actividad_calidad', 'controles_qualitat', 'exclusives', 'monos', 'retrabajos', 'registres'];
        cols.forEach((c) => { void pb.collection(c).subscribe('*', () => carrega()).catch(() => {}); });
        return () => {
            cols.forEach((c) => { void pb.collection(c).unsubscribe('*').catch(() => {}); });
        };
    }, [carrega]);

    // Dedupe + cálculo de tiempo en vivo.
    const operaris = (() => {
        const now = Date.now();
        const map = new Map();
        const addRec = (rec) => {
            const prev = map.get(rec.key);
            if (!prev || new Date(rec.updated || 0).getTime() > new Date(prev.updated || 0).getTime()) {
                map.set(rec.key, rec);
            }
        };

        // 1) Sesiones activas (heartbeat)
        const STALE_MS = 8 * 60 * 60 * 1000; // sesión sin heartbeat >8h = huérfana
        for (const a of actividad) {
            const opId = a.expand?.operari?.id || a.operari || null;
            if (!opId) continue;
            // Operario haciendo confección ahora mismo → se muestra como
            // confección, no como Calidad.
            if (confeccioIds.has(opId)) continue;
            // Sesión huérfana: descartar.
            const aUpdated = Date.parse(a.updated || a.created || 0);
            if (Number.isFinite(aUpdated) && (now - aUpdated) > STALE_MS) continue;
            const ex = a.expand?.exclusiva || exclusives.find((e) => e.id === a.exclusiva) || null;
            const mono = a.expand?.mono || monos.find((m) => m.id === a.mono) || null;
            const enRetrabajo = String(a.estado || '') === 'en_retrabajo';
            const ref = a.updated || a.created;
            let sec = 0;
            if (!enRetrabajo && ref) {
                const refMs = new Date(ref).getTime();
                if (Number.isFinite(refMs)) sec = Math.min(Math.max(0, Math.floor((now - refMs) / 1000)), MAX);
            }
            const unidad = a.unidad_numero != null ? Number(a.unidad_numero) : null;
            addRec({
                id: a.id,
                key: `${opId}|${a.mono || ''}|${unidad != null ? `u${unidad}` : ''}`,
                operariId: opId,
                operariNom: a.expand?.operari?.name || a.expand?.operari?.codi || 'Calidad',
                exclusivaId: a.exclusiva || ex?.id || null,
                exclusivaNom: ex?.exclusiva || '—',
                article: ex?.article || '',
                referencia: ex?.referencia || '',
                monoCodi: mono?.codi || (unidad != null ? `Ud. ${unidad}` : '—'),
                monoId: a.mono || mono?.id || null,
                unidadNumero: unidad,
                enRetrabajo,
                sec,
                inici: a.created,
                updated: a.updated,
                origen: 'actividad',
            });
        }

        // 2) Respaldo: controles_qualitat en_proceso/en_retrabajo
        for (const c of controles) {
            const opId = c.expand?.operari?.id || c.operari || null;
            if (!opId) continue;
            // Operario haciendo confección ahora mismo → confección, no Calidad.
            if (confeccioIds.has(opId)) continue;
            const enRetrabajo = String(c.estado_qc || '') === 'en_retrabajo';
            const ex = c.expand?.exclusiva || exclusives.find((e) => e.id === c.exclusiva) || null;
            const mono = c.expand?.mono || monos.find((m) => m.id === c.mono) || null;
            // Tiempo congelado: QC inicial + adicional (no cuenta retrabajo)
            const base = (Number(c.tiempo_qc_inicial_seg) || 0) + (Number(c.tiempo_qc_adicional_seg) || 0);
            addRec({
                id: c.id,
                key: `${opId}|${c.mono || ''}|cq`,
                operariId: opId,
                operariNom: c.expand?.operari?.name || c.expand?.operari?.codi || 'Calidad',
                exclusivaId: c.exclusiva || ex?.id || null,
                exclusivaNom: ex?.exclusiva || '—',
                article: ex?.article || '',
                referencia: ex?.referencia || '',
                monoCodi: mono?.codi || '—',
                monoId: c.mono || mono?.id || null,
                unidadNumero: null,
                enRetrabajo,
                sec: base,
                inici: c.created,
                updated: c.updated,
                origen: 'controles',
            });
        }

        return Array.from(map.values()).sort(
            (a, b) => new Date(b.updated || 0).getTime() - new Date(a.updated || 0).getTime(),
        );
    })();

    return { operaris, lastUpdate, fmtSeg, recarrega: carrega };
}

export default useOperarisCalitatActius;

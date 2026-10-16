import React from 'react';
import { AlertTriangle, CheckCircle2, Clock, Package, Users, XCircle, Zap } from 'lucide-react';

function fmtMin(min) {
    if (!min || min <= 0) return '0 min';
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    if (h <= 0) return `${m} min`;
    if (m === 0) return `${h} h`;
    return `${h} h ${m} min`;
}

export default function AnalisisSaturacion({ saturacio, pctQualitat = 10 }) {
    if (!saturacio) return null;
    const satColor = saturacio.estat === 'ok' ? 'text-[hsl(var(--ok))]'
        : saturacio.estat === 'risc' ? 'text-[hsl(var(--warn))]' : 'text-destructive';
    const satBg = saturacio.estat === 'ok' ? 'bg-[hsl(var(--ok))]'
        : saturacio.estat === 'risc' ? 'bg-[hsl(var(--warn))]' : 'bg-destructive';
    const SatIcon = saturacio.estat === 'ok' ? CheckCircle2
        : saturacio.estat === 'risc' ? AlertTriangle : XCircle;
    const satMissatge = saturacio.numOperaris === 0 && saturacio.tempsNecessariMin > 0
        ? 'Sin operarios de confección activos'
        : saturacio.estat === 'ok' ? 'Se pueden entregar todas en fecha'
            : saturacio.estat === 'risc' ? 'Riesgo de retraso'
                : 'No se pueden entregar en fecha';
    const pctLabel = saturacio.pct == null ? '—' : `${Math.round(saturacio.pct)}%`;
    const barPct = saturacio.pct == null ? 100 : Math.min(100, saturacio.pct);

    return (
        <section className="rounded-xl border border-border bg-card p-5">
            <h3 className="flex items-center gap-2 font-display text-2xl uppercase leading-none mb-4">
                <Zap className="h-5 w-5" /> Análisis de saturación
            </h3>
            <div className={`flex items-center gap-3 rounded-lg p-4 ${saturacio.estat === 'ok' ? 'bg-[hsl(var(--ok))]/10' : saturacio.estat === 'risc' ? 'bg-[hsl(var(--warn))]/10' : 'bg-destructive/10'}`}>
                <SatIcon className={`h-8 w-8 shrink-0 ${satColor}`} />
                <div className="flex-1 min-w-0">
                    <p className={`font-display text-xl sm:text-2xl uppercase ${satColor}`}>{satMissatge}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {saturacio.esAvui
                            ? `Hoy · trabajadas ${fmtMin(saturacio.horesTreballades * 60)} · disponibles ${fmtMin(saturacio.horesDisponibles * 60)} por operario activo`
                            : `Jornada completa: ${fmtMin(saturacio.jornadaHores * 60)} por operario activo`}
                        {' · '}Medias {saturacio.periodo}
                    </p>
                </div>
                <div className="text-right shrink-0">
                    <p className={`font-display text-4xl tabular-nums ${satColor}`}>{pctLabel}</p>
                    <p className="text-xs text-muted-foreground">saturación</p>
                </div>
            </div>

            <div className="mt-4">
                <div className="flex justify-between text-xs text-muted-foreground mb-1 gap-2">
                    <span>Capacidad disponible</span>
                    <span className="tabular-nums">{fmtMin(saturacio.tempsNecessariMin)} / {fmtMin(saturacio.capacitatHores * 60)}</span>
                </div>
                <div className="h-3 w-full rounded-full bg-secondary overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${satBg}`} style={{ width: `${barPct}%` }} />
                </div>
            </div>

            <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-lg bg-secondary/50 p-3">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" /> Operarios disponibles</p>
                    <p className="font-display text-2xl tabular-nums">{saturacio.numOperaris}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">Confección en curso, sin pausados ni Calidad</p>
                </div>
                <div className="rounded-lg bg-secondary/50 p-3">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Horas disponibles</p>
                    <p className="font-display text-2xl tabular-nums">{saturacio.horesDisponibles.toFixed(1)}h</p>
                    <p className="text-[11px] text-muted-foreground mt-1">Resto de jornada por operario</p>
                </div>
                <div className="rounded-lg bg-secondary/50 p-3">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Zap className="h-3 w-3" /> Horas necesarias</p>
                    <p className="font-display text-2xl tabular-nums">{(saturacio.tempsNecessariMin / 60).toFixed(1)}h</p>
                    <p className="text-[11px] text-muted-foreground mt-1">Pendiente de hoy y retrasado</p>
                </div>
                <div className={`rounded-lg p-3 ${saturacio.operarisNecessaris > saturacio.numOperaris ? 'bg-destructive/10' : 'bg-secondary/50'}`}>
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" /> Operarios necesarios</p>
                    <p className={`font-display text-2xl tabular-nums ${saturacio.operarisNecessaris > saturacio.numOperaris ? 'text-destructive' : ''}`}>{saturacio.operarisNecessaris}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">Para el trabajo pendiente de confección</p>
                </div>
            </div>

            {/* Unidades pendientes: retrasadas vs previstas en fecha */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Unidades retrasadas</p>
                    <p className="font-display text-2xl tabular-nums text-destructive">{saturacio.unitatsPendentsRetras ?? 0}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">{saturacio.exclusivesRetras ?? 0} exclusiva(s) con entrega vencida</p>
                </div>
                <div className="rounded-lg border border-[hsl(var(--ok))]/30 bg-[hsl(var(--ok))]/5 p-3">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Unidades en fecha</p>
                    <p className="font-display text-2xl tabular-nums text-[hsl(var(--ok))]">{saturacio.unitatsPendentsAvui ?? 0}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">{saturacio.exclusivesAvui ?? 0} exclusiva(s) previstas para hoy</p>
                </div>
                <div className="rounded-lg border border-border bg-secondary/40 p-3">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Package className="h-3 w-3" /> Total unidades pendientes</p>
                    <p className="font-display text-2xl tabular-nums">{saturacio.unitatsPendentsTotal ?? 0}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">Monos sin finalizar (no se cuentan los entregados)</p>
                </div>
            </div>

            {saturacio.nomsOperaris?.length > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                    Contados ahora: <span className="font-semibold text-foreground">{saturacio.nomsOperaris.join(', ')}</span>
                </p>
            )}

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">Tiempo producción</p>
                    <p className="font-semibold">{fmtMin(saturacio.tempsProdMin)}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                        {saturacio.fasesConMedia} fases con media
                        {saturacio.fasesEstandar > 0 ? ` · ${saturacio.fasesEstandar} con estándar` : ''}
                        {saturacio.fasesSinDato > 0 ? ` · ${saturacio.fasesSinDato} sin dato (no sumadas)` : ''}
                    </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">Tiempo calidad ({pctQualitat}%, estimado)</p>
                    <p className="font-semibold">{fmtMin(saturacio.tempsQualitatMin)}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">Porcentaje sobre la producción pendiente, no es una media de Calidad</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">Tiempo externalización</p>
                    <p className="font-semibold">{saturacio.tempsExtPend} fases fuera</p>
                    <p className="text-[11px] text-muted-foreground mt-1">No suman a la capacidad interna</p>
                </div>
            </div>

            <p className="mt-3 text-[11px] text-muted-foreground">
                Medias de {saturacio.periodo}: {saturacio.registrosMedia} registros válidos (sin pausas, se excluyen los de más de 8 h). Fase 4 solo en artículos CIK. {saturacio.fasesSinDato > 0 ? 'Las fases sin media ni estándar no entran en las horas necesarias.' : 'Cada fase pendiente usa la media de su tipo de artículo cuando existe.'}
            </p>
            {saturacio.avisos?.length > 0 && (
                <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                    {saturacio.avisos.map((a) => (
                        <li key={a} className="flex gap-1.5"><AlertTriangle className="h-3 w-3 shrink-0 mt-0.5 text-[hsl(var(--warn))]" />{a}</li>
                    ))}
                </ul>
            )}
        </section>
    );
}

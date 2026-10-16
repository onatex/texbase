import React from 'react';
import { Shield, Clock, ExternalLink, RefreshCcw } from 'lucide-react';
import { useOperarisCalitatActius } from '@/hooks/useOperarisCalitatActius';

/**
 * Sección reutilizable: operarios de Calidad con un control activo ahora.
 *
 * Muestra operario, exclusiva, mono, estado del control (En control / En
 * retrabajo) y tiempo de Calidad en curso (en vivo, cap 8h; congelado en
 * retrabajo). No muestra controles pausados/finalizados/cerrados como activos.
 * Suscripción realtime incluida. Funciona aunque falte alguna relación
 * secundaria.
 */
export default function OperarisCalitatActius({ compacto = false }) {
    const { operaris, lastUpdate, fmtSeg, recarrega } = useOperarisCalitatActius();

    return (
        <div className="rounded-xl border border-blue-200 bg-blue-50/40 overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-blue-200">
                <Shield className="h-5 w-5 text-blue-600" />
                <h3 className="font-display text-2xl uppercase text-blue-700">
                    Operarios de Calidad activos ({operaris.length})
                </h3>
                <span className="ml-auto text-xs text-muted-foreground hidden sm:block">
                    Última actualización: {lastUpdate.toLocaleTimeString('es-ES')}
                </span>
                <button onClick={recarrega} className="rounded-md p-1.5 text-muted-foreground hover:bg-blue-100 active:scale-95" aria-label="Actualizar">
                    <RefreshCcw className="h-4 w-4" />
                </button>
            </div>

            {operaris.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-3">
                    <Shield className="h-10 w-10 opacity-30" />
                    <p className="text-sm">Ningún operario de Calidad realizando controles en este momento.</p>
                </div>
            ) : (
                <div className="divide-y divide-blue-100">
                    {operaris.map((op) => (
                        <a
                            key={op.id}
                            href={op.exclusivaId ? `/exclusiva/${op.exclusivaId}` : '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full text-left px-5 py-4 transition-colors hover:bg-blue-50 flex flex-wrap items-start justify-between gap-3"
                        >
                            <div className="flex items-center gap-3">
                                <div className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold uppercase ${op.enRetrabajo ? 'bg-[hsl(var(--warn))]/20 text-[hsl(var(--warn))]' : 'bg-blue-100 text-blue-700'}`}>
                                    {op.operariNom.substring(0, 2)}
                                    <span className={`absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${op.enRetrabajo ? 'bg-[hsl(var(--warn))]' : 'bg-blue-600'}`} />
                                </div>
                                <div>
                                    <p className="font-semibold text-base">{op.operariNom}
                                        {op.enRetrabajo
                                            ? <span className="ml-2 text-xs rounded bg-[hsl(var(--warn))]/20 text-[hsl(var(--warn))] px-2 py-0.5 font-normal">En retrabajo</span>
                                            : <span className="ml-2 text-xs rounded bg-blue-100 text-blue-700 px-2 py-0.5 font-normal">En control</span>}
                                    </p>
                                    <p className="text-xs text-muted-foreground">Control de calidad</p>
                                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                        <span>Exclusiva: <span className="font-semibold text-foreground">{op.exclusivaNom}</span></span>
                                        <span>Mono: <span className="font-semibold text-foreground font-mono">{op.monoCodi}</span></span>
                                        {op.referencia && <span>Ref: <span className="font-semibold text-foreground">{op.referencia}</span></span>}
                                    </div>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className={`font-display text-3xl tabular-nums ${op.enRetrabajo ? 'text-[hsl(var(--warn))]' : 'text-blue-700'}`}>{fmtSeg(op.sec)}</p>
                                <p className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                                    <Clock className="h-3 w-3" />
                                    {op.enRetrabajo ? 'Tiempo congelado' : 'Tiempo de inspección'}
                                </p>
                                {!compacto && op.exclusivaId && (
                                    <span className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 font-semibold">
                                        Ver detalle <ExternalLink className="h-3 w-3" />
                                    </span>
                                )}
                            </div>
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
}

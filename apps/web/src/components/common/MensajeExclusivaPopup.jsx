import React, { useCallback, useEffect, useState } from 'react';
import { MessageSquare, X, AlertCircle } from 'lucide-react';
import pb from '@/lib/pocketbaseClient';

export default function MensajeExclusivaPopup({ userId }) {
    const [mensaje, setMensaje] = useState(null);
    const [exclusiva, setExclusiva] = useState(null);

    const carrega = useCallback(async () => {
        if (!userId) return;
        try {
            const list = await pb.collection('mensajes_exclusiva').getFullList({
                filter: `destinatario = "${userId}" && leido = false`,
                sort: '-created',
                expand: 'exclusiva,remitente',
                requestKey: 'msg-popup',
            });
            if (list.length > 0) {
                setMensaje(list[0]);
                setExclusiva(list[0].expand?.exclusiva || null);
            }
        } catch { /* silent */ }
    }, [userId]);

    useEffect(() => { carrega(); }, [carrega]);

    useEffect(() => {
        void pb.collection('mensajes_exclusiva').subscribe('*', () => { carrega(); }).catch(() => {});
        return () => { void pb.collection('mensajes_exclusiva').unsubscribe('*').catch(() => {}); };
    }, [carrega]);

    const tancar = async () => {
        if (!mensaje) return;
        try {
            await pb.collection('mensajes_exclusiva').update(mensaje.id, { leido: true }, { requestKey: `msg-read-${mensaje.id}` });
        } catch { /* silent */ }
        setMensaje(null);
        setExclusiva(null);
    };

    if (!mensaje) return null;
    const urgent = mensaje.prioridad === 'urgente';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className={`w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl border-4 ${urgent ? 'border-destructive' : 'border-primary'}`}>
                <div className="mb-4 flex items-center gap-3">
                    <div className={`rounded-xl p-3 ${urgent ? 'bg-destructive/15' : 'bg-primary/15'}`}>
                        {urgent ? <AlertCircle className="h-7 w-7 text-destructive" /> : <MessageSquare className="h-7 w-7 text-primary" />}
                    </div>
                    <div>
                        <h3 className="font-display text-2xl uppercase leading-none">
                            {urgent ? 'Mensaje urgente' : 'Mensaje del administrador'}
                        </h3>
                        <p className="text-sm text-muted-foreground">De: {mensaje.expand?.remitente?.name || mensaje.expand?.remitente?.email || 'Administración'}</p>
                    </div>
                </div>

                {exclusiva && (
                    <div className="mb-3 rounded-xl bg-secondary/60 p-3">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">Exclusiva</p>
                        <p className="font-display text-2xl uppercase">{exclusiva.exclusiva}</p>
                        <p className="text-sm font-semibold">{exclusiva.article || '—'}</p>
                        {mensaje.operacion_ref && <p className="text-xs text-muted-foreground mt-1">Operación: {mensaje.operacion_ref}</p>}
                    </div>
                )}

                <div className="mb-5 rounded-xl bg-background p-4">
                    <p className="text-base">{mensaje.mensaje}</p>
                </div>

                <button onClick={tancar} className="h-14 w-full rounded-2xl bg-primary text-primary-foreground text-lg font-bold active:scale-[0.98] transition">
                    Entendido
                </button>
            </div>
        </div>
    );
}

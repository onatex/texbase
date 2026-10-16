import { useEffect, useState, useRef } from 'react';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/lib/auth';

// Hook compartido: cuenta mensajes no leídos del chat Calidad ↔ Super Admin.
// Solo activo para roles qualitat / superadmin. Suscripción en tiempo real.
export function useChatCalidadNoLlegits() {
    const { user, rol } = useAuth();
    const [noLlegits, setNoLlegits] = useState(0);
    const [carregant, setCarregant] = useState(true);
    const ultimLlegitRef = useRef(null);

    useEffect(() => {
        if (!user || (rol !== 'qualitat' && rol !== 'superadmin')) {
            setNoLlegits(0);
            setCarregant(false);
            return;
        }

        let cancelled = false;

        const carregar = async () => {
            try {
                // Puntero de lectura del usuario actual.
                let ultim = null;
                try {
                    const rec = await pb.collection('chat_calidad_lectura').getFirstListItem(
                        pb.filter('usuari = {:u}', { u: user.id }),
                        { requestKey: 'chat-lectura-load' },
                    );
                    ultim = rec.ultim_llegit || null;
                } catch (_) {
                    // Aún no tiene puntero → todo es no leído.
                }
                ultimLlegitRef.current = ultim;

                const missatges = await pb.collection('chat_calidad').getFullList({
                    sort: 'created',
                    expand: 'autor',
                    requestKey: 'chat-msgs-load',
                });

                if (cancelled) return;
                const count = missatges.filter((m) => {
                    if (m.autor === user.id) return false; // propios no cuentan
                    if (!ultim) return true;
                    return new Date(m.created) > new Date(ultim);
                }).length;
                setNoLlegits(count);
            } catch (err) {
                if (!cancelled) setNoLlegits(0);
            } finally {
                if (!cancelled) setCarregant(false);
            }
        };

        carregar();

        // Realtime: recalcular al cambiar mensajes o el puntero de lectura.
        const unsubMsgs = pb.collection('chat_calidad').subscribe('*', () => {
            carregar();
        });
        const unsubLect = pb.collection('chat_calidad_lectura').subscribe('*', () => {
            carregar();
        });

        return () => {
            cancelled = true;
            Promise.resolve(unsubMsgs).then((u) => u && u()).catch(() => {});
            Promise.resolve(unsubLect).then((u) => u && u()).catch(() => {});
        };
    }, [user, rol]);

    return { noLlegits, carregant };
}

export default useChatCalidadNoLlegits;

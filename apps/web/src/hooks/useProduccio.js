import { useCallback, useEffect, useRef, useState } from 'react';
import pb from '@/lib/pocketbaseClient';

export function useProduccio() {
    const [dades, setDades] = useState({
        exclusives: [], monos: [], registres: [], rutes: [], operaris: [],
        articles: [], controls: [], opsDef: [],
    });
    const [carregant, setCarregant] = useState(true);
    const [error, setError] = useState('');
    // Generación para descartar respuestas de cargas anteriores (evita que
    // refrescos en tiempo real se cancelen entre sí por auto-cancel del SDK
    // y que una respuesta obsoleta pise la más reciente).
    const genRef = useRef(0);

    const carrega = useCallback(async () => {
        const gen = ++genRef.current;
        const k = (base) => `${base}-${gen}`;
        try {
            const [exclusives, monos, registres, rutes, operaris, articles, controls, opsDef] = await Promise.all([
                pb.collection('exclusives').getFullList({ sort: 'data_entrega', expand: 'ruta', filter: "estat != 'desapareguda'", requestKey: k('ex') }),
                pb.collection('monos').getFullList({ sort: 'created', expand: 'exclusiva,operari_assignat', requestKey: k('mo') }),
                pb.collection('registres').getFullList({ sort: '-created', expand: 'operari,mono,exclusiva', requestKey: k('re') }),
                pb.collection('rutes').getFullList({ sort: 'nom', requestKey: k('ru') }),
                pb.collection('users').getFullList({ sort: 'codi', requestKey: k('us') }),
                pb.collection('articles').getFullList({ sort: '+referencia', expand: 'ruta', requestKey: k('ar') }).catch(() => []),
                pb.collection('controles_qualitat').getFullList({ expand: 'mono,exclusiva,operari', requestKey: k('cq') }).catch(() => []),
                pb.collection('operacions_def').getFullList({ sort: 'ordre', requestKey: k('od') }).catch(() => []),
            ]);
            // Si llegó una carga más nueva mientras esta corría, descartar.
            if (gen !== genRef.current) return;
            setDades({ exclusives, monos, registres, rutes, operaris, articles, controls, opsDef });
            setError('');
        } catch (err) {
            // status 0 = auto-cancel del SDK (otra carga más nueva la reemplazó).
            if (err?.status === 0) return;
            if (gen !== genRef.current) return;
            setError('No se han podido cargar los datos de producción.');
        } finally {
            if (gen === genRef.current) setCarregant(false);
        }
    }, []);

    useEffect(() => { carrega(); }, [carrega]);

    useEffect(() => {
        let timer = null;
        const refresca = () => { clearTimeout(timer); timer = setTimeout(carrega, 350); };
        // Incluye retrabajos y control_calidad para que la cola de Calidad
        // se refresque al completar/pausar/reanudar/cambiar fases o resoluciones.
        const cols = ['registres', 'monos', 'exclusives', 'rutes', 'operacions_def', 'articles', 'retrabajos', 'control_calidad'];
        cols.forEach((c) => { void pb.collection(c).subscribe('*', refresca).catch(() => {}); });
        return () => {
            clearTimeout(timer);
            cols.forEach((c) => { void pb.collection(c).unsubscribe('*').catch(() => {}); });
        };
    }, [carrega]);

    return { ...dades, carregant, error, recarrega: carrega };
}

export default useProduccio;

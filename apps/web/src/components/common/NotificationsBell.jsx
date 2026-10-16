import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, X } from 'lucide-react';
import pb from '@/lib/pocketbaseClient';

const TIPUS_LABEL = {
    retrabajo_asignado: 'Retrabajo asignado',
    retrabajo_completado: 'Retrabajo completado',
    retrabajo_rechazado: 'Retrabajo rechazado',
    retrabajo_verificado: 'Retrabajo verificado',
    desaparicion: 'Exclusiva desaparecida',
    carga_completada: 'Carga completada',
    carga_error: 'Carga con errores',
    exclusiva_rechazada: 'Exclusiva rechazada',
    exclusiva_validada: 'Exclusiva validada',
    mensaje_exclusiva: 'Mensaje de exclusiva',
};

const TIPUS_CLS = {
    retrabajo_asignado: 'bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))]',
    retrabajo_completado: 'bg-blue-100 text-blue-700',
    retrabajo_rechazado: 'bg-destructive/15 text-destructive',
    retrabajo_verificado: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]',
    desaparicion: 'bg-destructive/15 text-destructive',
    carga_completada: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]',
    carga_error: 'bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))]',
    exclusiva_rechazada: 'bg-destructive/15 text-destructive',
    exclusiva_validada: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]',
    mensaje_exclusiva: 'bg-primary/15 text-primary',
};

export default function NotificationsBell() {
    const [notifs, setNotifs] = useState([]);
    const [open, setOpen] = useState(false);
    const [carregant, setCarregant] = useState(false);
    const wrapRef = useRef(null);

    const carrega = useCallback(async () => {
        try {
            const list = await pb.collection('notifications').getFullList({
                sort: '-created',
                requestKey: 'notif-bell',
            });
            setNotifs(list);
        } catch { setNotifs([]); }
        finally { setCarregant(false); }
    }, []);

    useEffect(() => { carrega(); }, [carrega]);

    // Realtime refresh
    useEffect(() => {
        void pb.collection('notifications').subscribe('*', () => { carrega(); }).catch(() => {});
        return () => { void pb.collection('notifications').unsubscribe('*').catch(() => {}); };
    }, [carrega]);

    // Close on outside click
    useEffect(() => {
        const handler = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const noLlegides = notifs.filter(n => !n.llegida);
    const marcarLlegida = async (id) => {
        try {
            await pb.collection('notifications').update(id, { llegida: true }, { requestKey: `notif-read-${id}` });
            setNotifs(prev => prev.map(n => n.id === id ? { ...n, llegida: true } : n));
        } catch { /* silent */ }
    };
    const marcarTotes = async () => {
        const pendents = notifs.filter(n => !n.llegida);
        await Promise.all(pendents.map((n, i) =>
            pb.collection('notifications').update(n.id, { llegida: true }, { requestKey: `notif-readall-${i}` }).catch(() => {})
        ));
        setNotifs(prev => prev.map(n => ({ ...n, llegida: true })));
    };

    return (
        <div className="relative" ref={wrapRef}>
            <button onClick={() => setOpen(o => !o)} className="relative rounded-md bg-white/15 p-2 active:scale-95" aria-label="Notificaciones">
                <Bell className="h-5 w-5" />
                {noLlegides.length > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
                        {noLlegides.length > 9 ? '9+' : noLlegides.length}
                    </span>
                )}
            </button>
            {open && (
                <div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[90vw] rounded-xl border border-border bg-card shadow-xl">
                    <div className="flex items-center justify-between border-b border-border px-4 py-3">
                        <p className="font-display text-lg uppercase">Notificaciones</p>
                        <div className="flex items-center gap-1">
                            {noLlegides.length > 0 && (
                                <button onClick={marcarTotes} className="flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs font-semibold hover:bg-secondary/80 active:scale-95">
                                    <CheckCheck className="h-3.5 w-3.5" /> Marcar todas
                                </button>
                            )}
                            <button onClick={() => setOpen(false)} className="rounded-md p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
                        </div>
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                        {carregant ? (
                            <p className="p-4 text-center text-sm text-muted-foreground">Cargando...</p>
                        ) : notifs.length === 0 ? (
                            <p className="p-6 text-center text-sm text-muted-foreground">Sin notificaciones.</p>
                        ) : notifs.slice(0, 30).map(n => (
                            <button key={n.id} onClick={() => marcarLlegida(n.id)}
                                className={`flex w-full items-start gap-3 border-b border-border/60 px-4 py-3 text-left hover:bg-secondary/40 transition ${!n.llegida ? 'bg-primary/5' : ''}`}>
                                <span className={`mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${TIPUS_CLS[n.tipus] || 'bg-secondary'}`}>
                                    {TIPUS_LABEL[n.tipus] || n.tipus}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold leading-tight">{n.titol || '—'}</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{n.missatge || ''}</p>
                                    <p className="mt-0.5 text-[10px] text-muted-foreground">{n.created ? new Date(n.created).toLocaleString('es-ES') : ''}</p>
                                </div>
                                {!n.llegida && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-destructive" />}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

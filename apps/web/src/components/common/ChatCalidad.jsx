import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { Send, Shield, Stethoscope, CheckCheck } from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/lib/auth';

// Chat interno Calidad ↔ Super Admin. Hilo único compartido.
// - Calidad reporta incidencias; Super Admin responde en el mismo hilo.
// - Solo roles qualitat / superadmin pueden leer y escribir.
// - Marca mensajes como leídos al visualizarlos.
function formataHora(iso) {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        return d.toLocaleString('es-ES', {
            day: '2-digit', month: '2-digit', year: '2-digit',
            hour: '2-digit', minute: '2-digit',
        });
    } catch {
        return '';
    }
}

function esAvui(iso) {
    if (!iso) return false;
    const d = new Date(iso);
    const a = new Date();
    return d.getDate() === a.getDate() && d.getMonth() === a.getMonth() && d.getFullYear() === a.getFullYear();
}

export default function ChatCalidad({ titol = 'Chat Calidad ↔ Super Admin' }) {
    const { user, rol } = useAuth();
    const [missatges, setMissatges] = useState([]);
    const [text, setText] = useState('');
    const [enviant, setEnviant] = useState(false);
    const [carregant, setCarregant] = useState(true);
    const [error, setError] = useState('');
    const [ultimLlegit, setUltimLlegit] = useState(null);
    const scrollRef = useRef(null);
    const bottomRef = useRef(null);

    const potXatejar = rol === 'qualitat' || rol === 'superadmin';

    // Cargar mensajes + puntero de lectura.
    const carregar = useCallback(async () => {
        try {
            const [msgs, lectRes] = await Promise.allSettled([
                pb.collection('chat_calidad').getFullList({
                    sort: 'created',
                    expand: 'autor',
                    requestKey: 'chat-load',
                }),
                pb.collection('chat_calidad_lectura').getFirstListItem(
                    pb.filter('usuari = {:u}', { u: user.id }),
                    { requestKey: 'chat-lect-load' },
                ).catch(() => null),
            ]);

            if (msgs.status === 'fulfilled') {
                setMissatges(msgs.value);
            }
            const ultim = lectRes.status === 'fulfilled' && lectRes.value ? lectRes.value.ultim_llegit : null;
            setUltimLlegit(ultim);
        } catch (err) {
            setError('No se pudo cargar el chat.');
        } finally {
            setCarregant(false);
        }
    }, [user.id]);

    useEffect(() => {
        if (!potXatejar) { setCarregant(false); return; }
        carregar();
    }, [carregar, potXatejar]);

    // Realtime.
    useEffect(() => {
        if (!potXatejar) return;
        const unsub = pb.collection('chat_calidad').subscribe('*', () => {
            carregar();
        });
        return () => {
            Promise.resolve(unsub).then((u) => u && u()).catch(() => {});
        };
    }, [carregar, potXatejar]);

    // Auto-scroll al final cuando llegan mensajes.
    useEffect(() => {
        if (bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
    }, [missatges]);

    // Marcar como leído al ver el chat (actualiza el puntero del usuario).
    const marcarLlegit = useCallback(async () => {
        if (!potXatejar) return;
        const ara = new Date().toISOString();
        try {
            const existing = await pb.collection('chat_calidad_lectura').getFirstListItem(
                pb.filter('usuari = {:u}', { u: user.id }),
                { requestKey: 'chat-lect-find' },
            ).catch(() => null);
            if (existing) {
                await pb.collection('chat_calidad_lectura').update(existing.id, { ultim_llegit: ara }, { requestKey: 'chat-lect-upd' });
            } else {
                await pb.collection('chat_calidad_lectura').create({ usuari: user.id, ultim_llegit: ara }, { requestKey: 'chat-lect-create' });
            }
            setUltimLlegit(ara);
        } catch (err) {
            // No crítico.
        }
    }, [user.id, potXatejar]);

    // Marcar leído al montar y cuando llegan mensajes nuevos (si el chat está visible).
    useEffect(() => {
        if (!potXatejar || carregant) return;
        const id = setTimeout(() => { marcarLlegit(); }, 600);
        return () => clearTimeout(id);
    }, [missatges, potXatejar, carregant, marcarLlegit]);

    const enviar = async (e) => {
        e?.preventDefault();
        const contingut = text.trim();
        if (!contingut || enviant) return;
        setEnviant(true);
        setError('');
        try {
            await pb.collection('chat_calidad').create({
                autor: user.id,
                autor_rol: rol,
                missatge: contingut,
            }, { requestKey: 'chat-create' });
            setText('');
            await carregar();
            await marcarLlegit();
        } catch (err) {
            setError('No se pudo enviar el mensaje.');
        } finally {
            setEnviant(false);
        }
    };

    if (!potXatejar) {
        return (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
                No tienes acceso a este chat.
            </div>
        );
    }

    const esSuperAdmin = rol === 'superadmin';

    return (
        <div className="flex flex-col rounded-xl border border-border bg-card overflow-hidden" style={{ height: 'calc(100dvh - 220px)', minHeight: '420px' }}>
            <Helmet>
                <title>Chat Calidad · Super Admin | Control de producción</title>
                <meta name="description" content="Chat interno entre Calidad y Super Admin para reportar incidencias." />
            </Helmet>

            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b border-border bg-primary px-4 py-3 text-primary-foreground">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15">
                        {esSuperAdmin ? <Stethoscope className="h-5 w-5" /> : <Shield className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0">
                        <p className="font-display text-lg uppercase leading-none truncate">{titol}</p>
                        <p className="text-xs text-white/70 truncate">
                            {esSuperAdmin ? 'Super Admin · responde a Calidad' : 'Calidad · reporta a Super Admin'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 bg-secondary/30">
                {carregant ? (
                    <div className="space-y-3">
                        {[0, 1, 2].map((i) => <div key={i} className="h-12 w-2/3 animate-pulse rounded-lg bg-secondary" />)}
                    </div>
                ) : missatges.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
                        <Shield className="mb-2 h-10 w-10 opacity-30" />
                        <p className="text-sm">Aún no hay mensajes.</p>
                        <p className="text-xs">{esSuperAdmin ? 'Calidad escribirá aquí sus incidencias.' : 'Escribe el primer mensaje para reportar una incidencia.'}</p>
                    </div>
                ) : (
                    missatges.map((m, idx) => {
                        const propi = m.autor === user.id;
                        const nom = m.expand?.autor?.name || m.expand?.autor?.email || (m.autor_rol === 'superadmin' ? 'Super Admin' : 'Calidad');
                        const esNou = !propi && (!ultimLlegit || new Date(m.created) > new Date(ultimLlegit));
                        const prev = idx > 0 ? missatges[idx - 1] : null;
                        const mostraAutor = !prev || prev.autor !== m.autor || !esAvui(prev.created) || !esAvui(m.created);
                        return (
                            <div key={m.id} className={`flex ${propi ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] sm:max-w-[70%] ${propi ? 'items-end' : 'items-start'} flex flex-col`}>
                                    {mostraAutor && (
                                        <div className={`mb-1 flex items-center gap-1.5 text-xs font-semibold ${propi ? 'flex-row-reverse' : ''}`}>
                                            <span className={m.autor_rol === 'superadmin' ? 'text-primary' : 'text-[hsl(var(--accent))]'}>{nom}</span>
                                            <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${m.autor_rol === 'superadmin' ? 'bg-primary/10 text-primary' : 'bg-[hsl(var(--accent))]/15 text-[hsl(var(--accent))]'}`}>
                                                {m.autor_rol === 'superadmin' ? 'Super Admin' : 'Calidad'}
                                            </span>
                                            {esNou && <span className="h-2 w-2 rounded-full bg-[hsl(var(--accent))]" title="No leído" />}
                                        </div>
                                    )}
                                    <div className={`rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words shadow-sm
                                        ${propi
                                            ? 'bg-primary text-primary-foreground rounded-br-md'
                                            : m.autor_rol === 'superadmin'
                                                ? 'bg-primary/10 text-foreground rounded-bl-md border border-primary/20'
                                                : 'bg-card text-foreground rounded-bl-md border border-border'}`}>
                                        {m.missatge}
                                    </div>
                                    <div className={`mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground ${propi ? 'flex-row-reverse' : ''}`}>
                                        <span>{formataHora(m.created)}</span>
                                        {propi && <CheckCheck className="h-3 w-3" />}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={bottomRef} />
            </div>

            {/* Input */}
            <form onSubmit={enviar} className="flex items-end gap-2 border-t border-border bg-card p-3">
                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
                    }}
                    rows={1}
                    placeholder={esSuperAdmin ? 'Responder a Calidad...' : 'Escribir incidencia para Super Admin...'}
                    className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 max-h-32"
                    style={{ minHeight: '44px' }}
                />
                <button
                    type="submit"
                    disabled={!text.trim() || enviant}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] disabled:opacity-40 active:scale-95 transition"
                    aria-label="Enviar"
                >
                    <Send className="h-5 w-5" />
                </button>
            </form>

            {error && <p className="px-3 pb-2 text-xs text-destructive">{error}</p>}
        </div>
    );
}

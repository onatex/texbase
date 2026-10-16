import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { ArrowLeft, ChevronRight, ExternalLink } from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/lib/auth';
import { DetallExclusiva, DetallMono } from '@/components/admin/ExclusivaDetall';
import NotificationsBell from '@/components/common/NotificationsBell';
import { RefreshCcw, Wifi } from 'lucide-react';

const HOME_BY_ROL = {
    admin: '/admin',
    superadmin: '/superadmin',
    produccio: '/produccio',
    qualitat: '/qualitat',
    externalitzacio: '/externalitzacio',
    operari: '/operario',
};

export default function ExclusivaDetallPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user, rol } = useAuth();
    const [exclusiva, setExclusiva] = useState(null);
    const [selectedMono, setSelectedMono] = useState(null);
    const [carregant, setCarregant] = useState(true);
    const [error, setError] = useState(null);

    const carrega = async () => {
        setCarregant(true);
        setError(null);
        try {
            const rec = await pb.collection('exclusives').getOne(id, { requestKey: `exclusiva-page-${id}` });
            setExclusiva(rec);
        } catch (err) {
            setError(err.status === 404 ? 'Exclusiva no encontrada.' : 'Error al cargar la exclusiva.');
        } finally {
            setCarregant(false);
        }
    };

    useEffect(() => { carrega(); /* eslint-disable-next-line */ }, [id]);

    const tornar = () => navigate(HOME_BY_ROL[rol] || '/');

    return (
        <div className="flex min-h-[100dvh] flex-col">
            <Helmet>
                <title>{exclusiva ? `Exclusiva ${exclusiva.exclusiva} | Control de producción` : 'Detalle de exclusiva | Control de producción'}</title>
                <meta name="description" content="Detalle de exclusiva: información general, tiempos, incidencias, historial, fases externalizadas y edición." />
            </Helmet>

            {/* Top header */}
            <header className="bg-primary text-primary-foreground shrink-0">
                <div className="stripe-top h-1.5" />
                <div className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="flex items-center gap-3">
                        <button onClick={tornar} className="flex items-center gap-1.5 rounded-md bg-white/15 px-3 h-9 text-sm font-semibold active:scale-95">
                            <ArrowLeft className="h-4 w-4" /> Volver
                        </button>
                        <div className="hidden sm:block">
                            <p className="font-display text-2xl uppercase leading-none">Detalle de exclusiva</p>
                            <p className="text-xs text-white/70">{user?.name || user?.email}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="hidden sm:flex items-center gap-1 rounded-md bg-white/15 px-2 py-1 text-xs font-semibold">
                            <Wifi className="h-3.5 w-3.5" /> Tiempo real
                        </span>
                        <NotificationsBell />
                        <button onClick={carrega} className="rounded-md bg-white/15 p-2 active:scale-95" aria-label="Actualizar">
                            <RefreshCcw className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </header>

            {/* Breadcrumb */}
            <nav className="border-b border-border bg-card px-5 py-3">
                <div className="flex items-center gap-2 text-sm flex-wrap">
                    <button onClick={tornar} className="text-primary hover:underline font-semibold">Exclusivas</button>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    {selectedMono ? (
                        <button onClick={() => setSelectedMono(null)} className="text-primary hover:underline font-semibold">{exclusiva?.exclusiva || '…'}</button>
                    ) : (
                        <span className="font-semibold text-foreground">{exclusiva?.exclusiva || '…'}</span>
                    )}
                    {selectedMono && (
                        <>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            <span className="font-semibold text-foreground">{selectedMono.codi}</span>
                        </>
                    )}
                    <a
                        href={`/exclusiva/${id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto flex items-center gap-1.5 rounded-md border border-border bg-background px-3 h-8 text-xs font-semibold hover:bg-secondary"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <ExternalLink className="h-3.5 w-3.5" /> Abrir en nueva pestaña
                    </a>
                </div>
            </nav>

            {/* Content */}
            <main className="flex-1 overflow-y-auto bg-background p-5">
                {carregant ? (
                    <div className="grid gap-3 max-w-5xl mx-auto">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-secondary" />)}</div>
                ) : error ? (
                    <div className="max-w-md mx-auto mt-16 text-center">
                        <p className="font-display text-2xl uppercase text-destructive mb-2">{error}</p>
                        <button onClick={tornar} className="mt-4 rounded-md bg-primary px-5 h-10 text-sm font-semibold text-primary-foreground">Volver al panel</button>
                    </div>
                ) : exclusiva ? (
                    <div className="max-w-5xl mx-auto">
                        {selectedMono ? (
                            <DetallMono mono={selectedMono} exclusiva={exclusiva} onBack={() => setSelectedMono(null)} />
                        ) : (
                            <DetallExclusiva exclusiva={exclusiva} onBack={tornar} onSelectMono={setSelectedMono} />
                        )}
                    </div>
                ) : null}
            </main>
        </div>
    );
}

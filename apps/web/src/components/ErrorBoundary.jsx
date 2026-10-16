import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        // eslint-disable-next-line no-console
        console.error('[ErrorBoundary]', error, info?.componentStack);
    }

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;
        return (
            <div className="min-h-[100dvh] flex items-center justify-center bg-background p-6">
                <div className="w-full max-w-lg rounded-lg border border-destructive/40 bg-card p-6">
                    <h1 className="font-display text-3xl uppercase text-destructive">Error en la pantalla</h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Se ha producido un error al cargar esta sección. Puedes recargar la página o volver al inicio.
                    </p>
                    <pre className="mt-4 max-h-48 overflow-auto rounded bg-secondary p-3 text-xs text-foreground">
                        {String(error?.message || error)}
                    </pre>
                    <div className="mt-5 flex gap-2">
                        <button
                            type="button"
                            onClick={() => window.location.reload()}
                            className="h-11 flex-1 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition active:scale-[0.98]"
                        >
                            Recargar
                        </button>
                        <button
                            type="button"
                            onClick={() => { window.location.href = '/'; }}
                            className="h-11 flex-1 rounded-md border border-border bg-card px-4 text-sm font-semibold transition hover:bg-secondary active:scale-[0.98]"
                        >
                            Ir al inicio
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}

export default ErrorBoundary;

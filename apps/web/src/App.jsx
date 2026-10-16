import React from 'react';
import { Navigate, Route, Routes, BrowserRouter as Router } from 'react-router-dom';
import ScrollToTop from './components/ScrollToTop';
import ErrorBoundary from '@/components/ErrorBoundary';
import { AuthProvider, useAuth } from '@/lib/auth';
import LoginPage from '@/pages/LoginPage';
import OperarioPage from '@/pages/OperarioPage';
import AdminPage from '@/pages/AdminPage';
import ProduccionPage from '@/pages/ProduccionPage';
import QualitatPage from '@/pages/QualitatPage';
import SuperAdminPage from '@/pages/SuperAdminPage';
import ClientePage from '@/pages/ClientePage';
import ExternalizacioPage from '@/pages/ExternalizacioPage';
import ExclusivaDetallPage from '@/pages/ExclusivaDetallPage';
import ProviderPage from '@/pages/ProviderPage';

function Protegit({ children, rols }) {
    const { isAuthed, rol } = useAuth();
    if (!isAuthed) return <Navigate to="/" replace />;
    if (rols && !rols.includes(rol)) return <Navigate to="/" replace />;
    return children;
}

function Entrada() {
    const { isAuthed, rol } = useAuth();
    if (!isAuthed) return <LoginPage />;
    if (rol === 'admin') return <Navigate to="/admin" replace />;
    if (rol === 'produccio') return <Navigate to="/produccio" replace />;
    if (rol === 'qualitat') return <Navigate to="/qualitat" replace />;
    if (rol === 'superadmin') return <Navigate to="/superadmin" replace />;
    if (rol === 'externalitzacio') return <Navigate to="/externalitzacio" replace />;
    if (rol === 'proveedor') return <Navigate to="/proveedor" replace />;
    return <Navigate to="/operario" replace />;
}

function App() {
    return (
        <ErrorBoundary>
        <AuthProvider>
            <Router>
                <ScrollToTop />
                <Routes>
                    <Route path="/" element={<Entrada />} />
                    <Route path="/operario" element={<Protegit rols={['operari', 'admin', 'superadmin']}><ErrorBoundary><OperarioPage /></ErrorBoundary></Protegit>} />
                    <Route path="/admin" element={<Protegit rols={['admin']}><ErrorBoundary><AdminPage /></ErrorBoundary></Protegit>} />
                    <Route path="/produccio" element={<Protegit rols={['produccio', 'admin']}><ErrorBoundary><ProduccionPage /></ErrorBoundary></Protegit>} />
                    <Route path="/qualitat" element={<Protegit rols={['qualitat', 'admin']}><ErrorBoundary><QualitatPage /></ErrorBoundary></Protegit>} />
                    <Route path="/superadmin" element={<Protegit rols={['superadmin']}><ErrorBoundary><SuperAdminPage /></ErrorBoundary></Protegit>} />
                    <Route path="/cliente" element={<ErrorBoundary><ClientePage /></ErrorBoundary>} />
                    <Route path="/externalitzacio" element={<Protegit rols={['externalitzacio', 'admin']}><ErrorBoundary><ExternalizacioPage /></ErrorBoundary></Protegit>} />
                    <Route path="/proveedor" element={<Protegit rols={['proveedor', 'admin']}><ErrorBoundary><ProviderPage /></ErrorBoundary></Protegit>} />
                    <Route path="/exclusiva/:id" element={<Protegit rols={['admin', 'superadmin', 'produccio', 'qualitat']}><ErrorBoundary><ExclusivaDetallPage /></ErrorBoundary></Protegit>} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </Router>
        </AuthProvider>
        </ErrorBoundary>
    );
}

export default App;

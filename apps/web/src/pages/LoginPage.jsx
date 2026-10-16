import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { Loader2, ShieldCheck, User } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import Logo from '@/components/Logo';
const ROL_RUTA = {
  admin: '/admin',
  produccio: '/produccio',
  qualitat: '/qualitat',
  superadmin: '/superadmin',
  externalitzacio: '/externalitzacio',
  proveedor: '/proveedor'
};
const LoginPage = () => {
  const {
    login
  } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('operari');
  const [identitat, setIdentitat] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [carregant, setCarregant] = useState(false);
  const onSubmit = async e => {
    e.preventDefault();
    setError('');
    setCarregant(true);
    try {
      const auth = await login(identitat.trim(), password);
      const rol = auth.record?.rol;
      if (!rol) {
        setError('Tu usuario no tiene rol asignado. Contacta con dirección.');
        return;
      }
      navigate(ROL_RUTA[rol] || '/operario', {
        replace: true
      });
    } catch (err) {
      if (err?.status === 400) {
        setError(mode === 'operari' ? 'Código de operario o contraseña incorrectos.' : 'Correo o contraseña incorrectos.');
      } else if (err?.status === 403) {
        setError('Acceso bloqueado. Contacta con dirección.');
      } else {
        setError('No se ha podido conectar con el servidor. Inténtalo de nuevo.');
      }
    } finally {
      setCarregant(false);
    }
  };
  return <div className="min-h-[100dvh] grid lg:grid-cols-[1.1fr_1fr]">
            <Helmet>
                <title>Acceso | Control de producción de monos</title>
                <meta name="description" content="Acceso al sistema interno de planificación y control en tiempo real de la confección de monos de competición." />
            </Helmet>

            <div className="relative hidden lg:flex flex-col justify-between bg-primary text-primary-foreground p-12 overflow-hidden">
                <div className="stripe-top h-2 absolute top-0 left-0 right-0" />
                <div>
                    <div className="mb-8">
                        <Logo size="lg" />
                    </div>
                    <p className="font-display uppercase tracking-[0.3em] text-sm text-white/60"></p>
                    <h1 className="font-display text-6xl xl:text-7xl uppercase leading-[0.95] mt-4">Control de<br /></h1>
                    <p className="mt-6 max-w-md text-white/70 leading-relaxed">
                        Planificación por rutas de operaciones, cronometraje en taller y trazabilidad unidad a unidad,
                        sincronizada en tiempo real con dirección, producción y calidad.
                    </p>
                </div>
                <ul className="grid grid-cols-2 gap-4 text-sm text-white/70">
                    {['Importación CSV diaria', 'Rutas por artículo', 'Cronómetro en tablet', 'Control de calidad'].map(t => <li key={t} className="border-t border-white/20 pt-3 font-display uppercase tracking-wide text-base">{t}</li>)}
                </ul>
            </div>

            <div className="flex items-center justify-center p-6 sm:p-12">
                <form onSubmit={onSubmit} className="w-full max-w-sm">
                    <h2 className="font-display text-4xl uppercase">Iniciar sesión</h2>
                    <p className="text-muted-foreground text-sm mt-1">Selecciona tu tipo de acceso.</p>

                    <div className="grid grid-cols-2 gap-2 mt-6">
                        {[{
            id: 'operari',
            label: 'Operario',
            icon: User
          }, {
            id: 'gestio',
            label: 'Gestión',
            icon: ShieldCheck
          }].map(({
            id,
            label,
            icon: Icon
          }) => <button key={id} type="button" onClick={() => {
            setMode(id);
            setError('');
            setIdentitat('');
          }} className={`flex items-center justify-center gap-2 rounded-md border px-3 py-3 text-sm font-semibold transition active:scale-[0.98] ${mode === id ? 'border-[hsl(var(--accent))] bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]' : 'border-border bg-card hover:bg-secondary'}`}>
                                <Icon className="h-4 w-4" strokeWidth={2} />
                                {label}
                            </button>)}
                    </div>

                    <div className="mt-6 grid gap-2">
                        <label htmlFor="identitat" className="text-sm font-semibold">
                            {mode === 'operari' ? 'Código de operario' : 'Correo electrónico'}
                        </label>
                        <input id="identitat" value={identitat} onChange={e => setIdentitat(e.target.value)} autoComplete="username" placeholder={mode === 'operari' ? 'OP01' : 'usuario@empresa.com'} className="h-14 rounded-md border border-input bg-card px-4 text-lg outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]" required />
                    </div>

                    <div className="mt-4 grid gap-2">
                        <label htmlFor="password" className="text-sm font-semibold">Contraseña</label>
                        <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" className="h-14 rounded-md border border-input bg-card px-4 text-lg outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]" required />
                    </div>

                    {error ? <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}

                    <button type="submit" disabled={carregant} className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground text-lg font-semibold transition active:scale-[0.98] disabled:opacity-60">
                        {carregant ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                        Entrar
                    </button>

                    <p className="mt-4 text-xs text-center text-muted-foreground">
                        Gestión incluye roles: administrador, producción y calidad.
                    </p>
                </form>
            </div>
        </div>;
};
export default LoginPage;
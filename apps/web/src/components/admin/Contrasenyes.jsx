import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Eye, EyeOff, KeyRound, Lock, RefreshCw, Save, Search, ShieldCheck, X } from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/lib/auth';

const ROLS_ALL = {
    operari: 'Operario',
    produccio: 'Producción',
    qualitat: 'Calidad',
    externalitzacio: 'Externalización',
    admin: 'Admin',
    superadmin: 'Super Admin',
};
const ROL_BADGE = {
    operari: 'bg-secondary',
    produccio: 'bg-[hsl(var(--warn))]/15 text-[hsl(var(--warn))]',
    qualitat: 'bg-[hsl(var(--ok))]/15 text-[hsl(var(--ok))]',
    externalitzacio: 'bg-primary/10 text-primary',
    admin: 'bg-primary/15 text-primary',
    superadmin: 'bg-[hsl(var(--accent))]/15 text-[hsl(var(--accent))]',
};

const MIN_LEN = 8;

export default function Contrasenyes() {
    const { user, rol } = useAuth();
    const esSuperAdmin = rol === 'superadmin';

    const [usuaris, setUsuaris] = useState([]);
    const [carregant, setCarregant] = useState(true);
    const [error, setError] = useState('');
    const [q, setQ] = useState('');
    const [filtreRol, setFiltreRol] = useState('tots');

    const [seleccionat, setSeleccionat] = useState(null);
    const [pass, setPass] = useState('');
    const [confirm, setConfirm] = useState('');
    const [mostra, setMostra] = useState(false);
    const [motiu, setMotiu] = useState('');
    const [desant, setDesant] = useState(false);
    const [errMsg, setErrMsg] = useState('');
    const [okMsg, setOkMsg] = useState('');

    const [historial, setHistorial] = useState([]);
    const [carregantHist, setCarregantHist] = useState(false);

    // Refs a los inputs de contraseña: los gestores de contraseñas del navegador
    // pueden autorrellenar el campo visible SIN disparar onChange de React, por
    // lo que el estado `pass` se queda vacío y la validación siempre dice que
    // está vacío. Leemos el valor real del DOM como respaldo.
    const passRef = useRef(null);
    const confirmRef = useRef(null);

    const carrega = useCallback(async () => {
        setCarregant(true);
        setError('');
        try {
            const records = await pb.collection('users').getFullList({
                sort: 'name',
                fields: 'id,name,cognom,codi,email,rol,created',
                requestKey: 'usuaris-contrasenyes',
            });
            setUsuaris(records);
        } catch (err) {
            setError(err?.status === 403
                ? 'No tienes permisos para consultar los usuarios.'
                : 'Error al cargar los usuarios.');
        } finally {
            setCarregant(false);
        }
    }, []);

    useEffect(() => { carrega(); }, [carrega]);

    const carregaHistorial = useCallback(async (destiId) => {
        setCarregantHist(true);
        try {
            const rows = await pb.collection('historial_canvis_contrasenya').getFullList({
                filter: pb.filter('usuari_desti = {:id}', { id: destiId }),
                sort: '-created',
                expand: 'usuari_origen',
                requestKey: `hist-contrasenya-${destiId}`,
            });
            setHistorial(rows);
        } catch (err) {
            setHistorial([]);
        } finally {
            setCarregantHist(false);
        }
    }, []);

    const files = useMemo(() => {
        const text = q.trim().toLowerCase();
        return usuaris.filter((u) => {
            const coincideix = !text ||
                `${u.name || ''} ${u.cognom || ''} ${u.codi || ''} ${u.email || ''}`
                    .toLowerCase().includes(text);
            const rolOk = filtreRol === 'tots' || u.rol === filtreRol;
            return coincideix && rolOk;
        });
    }, [usuaris, q, filtreRol]);

    const obrir = (u) => {
        setSeleccionat(u);
        setPass('');
        setConfirm('');
        setMostra(false);
        setMotiu('');
        setErrMsg('');
        setOkMsg('');
        setHistorial([]);
        carregaHistorial(u.id);
    };

    const tancar = () => {
        setSeleccionat(null);
        setPass('');
        setConfirm('');
        setMostra(false);
        setMotiu('');
        setErrMsg('');
        setOkMsg('');
        setHistorial([]);
    };

    // Valor real efectivo: prioriza el estado de React (escritura manual) y,
    // si está vacío (p. ej. autorrelleno del navegador sin onChange), usa el
    // valor presente en el DOM. Así nunca se rechaza una contraseña introducida.
    const passReal = () => {
        const dom = passRef.current?.value ?? '';
        return pass || dom;
    };
    const confirmReal = () => {
        const dom = confirmRef.current?.value ?? '';
        return confirm || dom;
    };

    const valida = () => {
        const p = passReal();
        const c = confirmReal();
        if (!p) return 'Introduce una nueva contraseña.';
        if (p.length < MIN_LEN) return `La contraseña debe tener al menos ${MIN_LEN} caracteres.`;
        if (p !== c) return 'Las contraseñas no coinciden.';
        if (seleccionat && user && seleccionat.id === user.id && !esSuperAdmin) {
            return 'No puedes cambiar tu propia contraseña desde aquí.';
        }
        return '';
    };

    const desa = async () => {
        setErrMsg('');
        setOkMsg('');
        const v = valida();
        if (v) { setErrMsg(v); return; }
        const p = passReal();
        const c = confirmReal();
        // Sincroniza el estado por si el valor vino del DOM (autorrelleno)
        setPass(p);
        setConfirm(c);
        setDesant(true);
        try {
            await pb.collection('users').update(seleccionat.id, {
                password: p,
                passwordConfirm: c,
            });
            // Registrar en historial (sin guardar la contraseña)
            try {
                await pb.collection('historial_canvis_contrasenya').create({
                    usuari_desti: seleccionat.id,
                    usuari_desti_codi: seleccionat.codi || '',
                    usuari_desti_nom: `${seleccionat.name || ''}${seleccionat.cognom ? ' ' + seleccionat.cognom : ''}`.trim(),
                    usuari_origen: user?.id || '',
                    usuari_origen_nom: user?.name || user?.email || '',
                    motiu: motiu.trim() || 'Canvi de contrasenya',
                }, { requestKey: `hist-create-${seleccionat.id}-${Date.now()}` });
            } catch (histErr) {
                // El historial es best-effort: no bloquea el cambio
                console.error('No se pudo registrar el historial de contraseña:', histErr);
            }
            setOkMsg(`Contraseña actualizada correctamente para ${seleccionat.name || seleccionat.codi}.`);
            setPass('');
            setConfirm('');
            setMotiu('');
            carregaHistorial(seleccionat.id);
        } catch (err) {
            const data = err?.response?.data || {};
            const camp = Object.values(data)[0];
            const msg = camp?.message || err?.message || '';
            if (err?.status === 403) {
                setErrMsg('No tienes permisos para modificar este usuario.');
            } else if (err?.status === 400) {
                setErrMsg(`Error de validación: ${msg || 'revisa la contraseña introducida.'}`);
            } else {
                setErrMsg(`Error al actualizar la contraseña: ${msg || 'inténtalo de nuevo.'}`);
            }
        } finally {
            setDesant(false);
        }
    };

    const força = (s) => {
        let p = 0;
        if (s.length >= MIN_LEN) p++;
        if (s.length >= 12) p++;
        if (/[A-Z]/.test(s) && /[a-z]/.test(s)) p++;
        if (/\d/.test(s)) p++;
        if (/[^A-Za-z0-9]/.test(s)) p++;
        return p; // 0..5
    };
    const nivell = força(pass);
    const etiquetesForça = ['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Fuerte', 'Muy fuerte'];
    const colorsForça = ['bg-destructive', 'bg-destructive', 'bg-[hsl(var(--warn))]', 'bg-[hsl(var(--warn))]', 'bg-[hsl(var(--ok))]', 'bg-[hsl(var(--ok))]'];

    return (
        <section className="grid gap-6">
            <Helmet>
                <title>Contraseñas de usuarios | Administración</title>
                <meta name="description" content="Gestión segura de contraseñas de usuarios: establecer una nueva contraseña, con historial de cambios. Solo Admin y Super Admin." />
            </Helmet>

            {/* Llistat + cerca */}
            <div className="rounded-lg border border-border bg-card">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
                    <div className="flex items-center gap-2">
                        <KeyRound className="h-5 w-5 text-primary" />
                        <h3 className="font-display text-2xl uppercase">Contraseñas de usuarios</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, código o email"
                                className="h-10 w-64 rounded-md border border-input bg-background pl-9 pr-3 text-sm" />
                        </div>
                        <select value={filtreRol} onChange={(e) => setFiltreRol(e.target.value)}
                            className="h-10 rounded-md border border-input bg-background px-2 text-sm">
                            <option value="tots">Todos los roles</option>
                            {Object.entries(ROLS_ALL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                        <button onClick={carrega} className="flex h-10 items-center gap-2 rounded-md bg-secondary px-3 text-sm font-semibold active:scale-95">
                            <RefreshCw className="h-4 w-4" /> Actualizar
                        </button>
                    </div>
                </div>

                <div className="px-4 py-3 bg-[hsl(var(--warn))]/10 border-b border-border text-sm text-[hsl(var(--warn))] flex items-start gap-2">
                    <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                        Por seguridad, las contraseñas se almacenan cifradas y <strong>no se pueden consultar</strong>.
                        Desde aquí puedes <strong>establecer una nueva contraseña</strong> para cualquier usuario.
                        Cada cambio queda registrado en el historial (quién y cuándo), sin guardar la contraseña.
                    </span>
                </div>

                {error && <p className="m-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

                <div className="overflow-auto max-h-[55vh]">
                    <table className="w-full text-sm">
                        <thead className="bg-secondary text-left text-xs uppercase sticky top-0">
                            <tr>
                                {['Nombre', 'Código', 'Rol', 'Email', ''].map((h) => (
                                    <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {carregant ? (
                                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Cargando usuarios…</td></tr>
                            ) : files.length === 0 ? (
                                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Sin usuarios que coincidan.</td></tr>
                            ) : files.map((u) => (
                                <tr key={u.id} className={seleccionat?.id === u.id ? 'bg-primary/5' : ''}>
                                    <td className="px-3 py-2 font-semibold">{u.name || '—'}{u.cognom ? ` ${u.cognom}` : ''}</td>
                                    <td className="px-3 py-2 font-mono">{u.codi || '—'}</td>
                                    <td className="px-3 py-2">
                                        <span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${ROL_BADGE[u.rol] || 'bg-secondary'}`}>
                                            {ROLS_ALL[u.rol] || u.rol}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-muted-foreground">{u.email || '—'}</td>
                                    <td className="px-3 py-2">
                                        <button onClick={() => obrir(u)}
                                            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-secondary active:scale-95">
                                            <KeyRound className="h-3.5 w-3.5" /> Cambiar contraseña
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Panell de canvi */}
            {seleccionat && (
                <div className="rounded-lg border border-border bg-card p-5">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                                <Lock className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="font-display text-2xl uppercase leading-none">Establecer nueva contraseña</h3>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Usuario: <strong className="text-foreground">{seleccionat.name || '—'}{seleccionat.cognom ? ` ${seleccionat.cognom}` : ''}</strong>
                                    {' · '}Código <span className="font-mono">{seleccionat.codi || '—'}</span>
                                    {' · '}<span className={`rounded px-1.5 py-0.5 text-xs font-semibold uppercase ${ROL_BADGE[seleccionat.rol] || 'bg-secondary'}`}>{ROLS_ALL[seleccionat.rol] || seleccionat.rol}</span>
                                </p>
                            </div>
                        </div>
                        <button onClick={tancar} className="rounded-md border border-border p-2 text-muted-foreground hover:bg-secondary" aria-label="Cerrar">
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                        <div className="grid gap-2">
                            <label className="text-sm font-semibold">Nueva contraseña * (mín. {MIN_LEN} caracteres)</label>
                            <div className="relative">
                                <input ref={passRef} type={mostra ? 'text' : 'password'} value={pass} onChange={(e) => setPass(e.target.value)} onBlur={() => { if (!pass && passRef.current?.value) setPass(passRef.current.value); }}
                                    placeholder="Nueva contraseña" autoComplete="new-password"
                                    className="h-11 w-full rounded-md border border-input bg-background px-3 pr-11 font-mono" />
                                <button type="button" onClick={() => setMostra((v) => !v)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:bg-secondary"
                                    aria-label={mostra ? 'Ocultar' : 'Mostrar'}>
                                    {mostra ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            {pass && (
                                <div className="flex items-center gap-2">
                                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                                        <div className={`h-full transition-all ${colorsForça[nivell]}`} style={{ width: `${(nivell / 5) * 100}%` }} />
                                    </div>
                                    <span className="text-xs text-muted-foreground">{etiquetesForça[nivell]}</span>
                                </div>
                            )}
                        </div>

                        <div className="grid gap-2">
                            <label className="text-sm font-semibold">Confirmar contraseña *</label>
                            <input ref={confirmRef} type={mostra ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)} onBlur={() => { if (!confirm && confirmRef.current?.value) setConfirm(confirmRef.current.value); }}
                                placeholder="Repite la nueva contraseña" autoComplete="new-password"
                                className={`h-11 w-full rounded-md border bg-background px-3 font-mono ${confirm && confirm !== pass ? 'border-destructive' : 'border-input'}`} />
                            {confirm && confirm !== pass && (
                                <p className="text-xs text-destructive">Las contraseñas no coinciden.</p>
                            )}
                        </div>
                    </div>

                    <div className="mt-4 grid gap-2">
                        <label className="text-sm font-semibold">Motivo del cambio (opcional)</label>
                        <input value={motiu} onChange={(e) => setMotiu(e.target.value)} placeholder="p. ej. solicitud del usuario, olvido de contraseña"
                            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm" />
                        <p className="text-xs text-muted-foreground">Se guardará en el historial junto con tu usuario y la fecha. La contraseña nunca se almacena.</p>
                    </div>

                    {errMsg && <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{errMsg}</p>}
                    {okMsg && <p className="mt-4 rounded-md bg-[hsl(var(--ok))]/10 px-3 py-2 text-sm text-[hsl(var(--ok))]">{okMsg}</p>}

                    <div className="mt-5 flex flex-wrap gap-2">
                        <button onClick={desa} disabled={desant}
                            className="flex h-12 items-center justify-center gap-2 rounded-md bg-primary px-6 font-semibold text-primary-foreground disabled:opacity-60 active:scale-95">
                            {desant ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            {desant ? 'Guardando…' : 'Guardar nueva contraseña'}
                        </button>
                        <button onClick={tancar} className="h-12 rounded-md bg-secondary px-4 font-semibold">Cerrar</button>
                    </div>

                    {/* Historial de canvis */}
                    <div className="mt-6 border-t border-border pt-4">
                        <h4 className="font-display text-lg uppercase">Historial de cambios de contraseña</h4>
                        {carregantHist ? (
                            <p className="mt-2 text-sm text-muted-foreground">Cargando historial…</p>
                        ) : historial.length === 0 ? (
                            <p className="mt-2 text-sm text-muted-foreground">Sin cambios registrados para este usuario.</p>
                        ) : (
                            <div className="mt-3 overflow-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-secondary text-left text-xs uppercase">
                                        <tr>
                                            {['Fecha', 'Cambiado por', 'Motivo'].map((h) => (
                                                <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {historial.map((h) => (
                                            <tr key={h.id}>
                                                <td className="px-3 py-2 tabular-nums">{h.created ? new Date(h.created).toLocaleString('es-ES') : '—'}</td>
                                                <td className="px-3 py-2">{h.expand?.usuari_origen?.name || h.usuari_origen_nom || '—'}</td>
                                                <td className="px-3 py-2 text-muted-foreground">{h.motiu || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </section>
    );
}

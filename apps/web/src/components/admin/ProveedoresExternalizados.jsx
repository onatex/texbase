import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, X, Search, Building2, Phone, Mail, MapPin, User } from 'lucide-react';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/lib/auth';

const EMPTY = { nombre: '', contacto: '', telefono: '', email: '', direccion: '', notas: '', activo: true };

export default function ProveedoresExternalizados() {
    const { user } = useAuth();
    const [proveedores, setProveedores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState('');
    const [modal, setModal] = useState(null); // null | {mode:'create'|'edit', data}
    const [form, setForm] = useState(EMPTY);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const list = await pb.collection('proveedores').getFullList({ sort: 'nombre', requestKey: 'prov-list' });
            setProveedores(list);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const openCreate = () => { setForm(EMPTY); setErr(''); setModal({ mode: 'create' }); };
    const openEdit = (p) => { setForm({ ...p }); setErr(''); setModal({ mode: 'edit', id: p.id }); };
    const closeModal = () => setModal(null);

    const save = async () => {
        if (!form.nombre.trim()) { setErr('El nombre es obligatorio'); return; }
        setSaving(true);
        setErr('');
        try {
            if (modal.mode === 'create') {
                await pb.collection('proveedores').create({ ...form }, { requestKey: `prov-create-${Date.now()}` });
            } else {
                await pb.collection('proveedores').update(modal.id, { ...form }, { requestKey: `prov-upd-${modal.id}` });
            }
            closeModal();
            load();
        } catch (e) {
            setErr(e?.response?.message || 'Error al guardar');
        } finally { setSaving(false); }
    };

    const del = async (id) => {
        if (!confirm('¿Eliminar este proveedor? Esta acción no se puede deshacer.')) return;
        try {
            await pb.collection('proveedores').delete(id, { requestKey: `prov-del-${id}` });
            load();
        } catch (e) { alert('Error al eliminar: ' + (e?.response?.message || e.message)); }
    };

    const filtered = proveedores.filter(p => {
        const t = q.toLowerCase();
        return !t || `${p.nombre} ${p.contacto} ${p.email} ${p.telefono}`.toLowerCase().includes(t);
    });

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <Building2 className="h-6 w-6 text-primary" />
                    <h2 className="font-display text-2xl sm:text-3xl uppercase">Proveedores externalizados</h2>
                </div>
                <button onClick={openCreate}
                    className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground active:scale-95">
                    <Plus className="h-4 w-4" /> Nuevo proveedor
                </button>
            </div>

            <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar proveedor..."
                    className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm" />
            </div>

            {loading ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {[0,1,2].map(i => <div key={i} className="h-36 animate-pulse rounded-xl bg-secondary" />)}
                </div>
            ) : filtered.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-border bg-card p-12 text-center text-muted-foreground">
                    <Building2 className="mx-auto h-10 w-10 text-muted-foreground/30 mb-3" />
                    {q ? 'Sin resultados.' : 'No hay proveedores. Crea el primero.'}
                </div>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {filtered.map(p => (
                        <div key={p.id} className={`rounded-xl border-2 bg-card p-4 ${p.activo === false ? 'opacity-60 border-border' : 'border-border hover:border-primary/40'}`}>
                            <div className="flex items-start justify-between gap-2 mb-3">
                                <div>
                                    <p className="font-display text-xl uppercase leading-tight">{p.nombre}</p>
                                    {p.activo === false && <span className="text-xs text-muted-foreground">Inactivo</span>}
                                </div>
                                <div className="flex gap-1 shrink-0">
                                    <button onClick={() => openEdit(p)} className="rounded-lg border border-border p-1.5 hover:bg-secondary" title="Editar">
                                        <Pencil className="h-4 w-4" />
                                    </button>
                                    <button onClick={() => del(p.id)} className="rounded-lg border border-destructive/40 p-1.5 text-destructive hover:bg-destructive/10" title="Eliminar">
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-1.5 text-sm">
                                {p.contacto && <div className="flex items-center gap-2 text-muted-foreground"><User className="h-3.5 w-3.5" /> {p.contacto}</div>}
                                {p.telefono && <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5" /> {p.telefono}</div>}
                                {p.email && <div className="flex items-center gap-2 text-muted-foreground"><Mail className="h-3.5 w-3.5" /> {p.email}</div>}
                                {p.direccion && <div className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> <span className="truncate">{p.direccion}</span></div>}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal */}
            {modal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={closeModal}>
                    <div className="modal-card w-full max-w-lg rounded-2xl bg-card p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="font-display text-2xl uppercase">{modal.mode === 'create' ? 'Nuevo proveedor' : 'Editar proveedor'}</h3>
                            <button onClick={closeModal} className="rounded-lg border border-border p-2 hover:bg-secondary"><X className="h-4 w-4" /></button>
                        </div>
                        <div className="grid gap-4">
                            <Field label="Nombre *" value={form.nombre} onChange={v => setForm(f => ({ ...f, nombre: v }))} placeholder="Nombre del proveedor" />
                            <Field label="Contacto" value={form.contacto} onChange={v => setForm(f => ({ ...f, contacto: v }))} placeholder="Persona de contacto" />
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Teléfono" value={form.telefono} onChange={v => setForm(f => ({ ...f, telefono: v }))} placeholder="+34 000 000 000" />
                                <Field label="Email" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="email@proveedor.com" type="email" />
                            </div>
                            <Field label="Dirección" value={form.direccion} onChange={v => setForm(f => ({ ...f, direccion: v }))} placeholder="Calle, ciudad, CP..." />
                            <Field label="Notas" value={form.notas} onChange={v => setForm(f => ({ ...f, notas: v }))} placeholder="Observaciones..." textarea />
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={form.activo !== false} onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} className="h-5 w-5 rounded" />
                                <span className="text-sm font-semibold">Proveedor activo</span>
                            </label>
                            {err && <p className="text-sm text-destructive">{err}</p>}
                            <div className="grid grid-cols-2 gap-3 mt-2">
                                <button onClick={closeModal} disabled={saving} className="h-12 rounded-xl bg-secondary font-bold disabled:opacity-50">Cancelar</button>
                                <button onClick={save} disabled={saving} className="h-12 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-50">
                                    {saving ? 'Guardando...' : 'Guardar'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function Field({ label, value, onChange, placeholder, type = 'text', textarea }) {
    const cls = "mt-1 w-full rounded-lg border border-input bg-background px-3 text-sm";
    return (
        <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground">{label}</label>
            {textarea ? (
                <textarea value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={2}
                    className={cls + " py-2 resize-none"} />
            ) : (
                <input type={type} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
                    className={cls + " h-10"} />
            )}
        </div>
    );
}

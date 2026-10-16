import React, { useState, useEffect, useCallback } from 'react';
import pb from '@/lib/pocketbaseClient';
import { Plus, RefreshCw, X, Save, Package, Truck, CheckCircle, AlertTriangle, ExternalLink } from 'lucide-react';

const ESTAT_CONFIG = {
  enviada:        { label: 'Enviada',         color: 'bg-blue-100 text-blue-700' },
  en_proces:      { label: 'En procés',       color: 'bg-yellow-100 text-yellow-700' },
  retornada:      { label: 'Retornada',       color: 'bg-emerald-100 text-emerald-700' },
  amb_incidencies:{ label: 'Amb incidències', color: 'bg-red-100 text-red-700' },
};

function EstatBadge({ estat }) {
  const c = ESTAT_CONFIG[estat] || { label: estat, color: 'bg-gray-100 text-gray-600' };
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${c.color}`}>{c.label}</span>;
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">{title}</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400 hover:text-gray-600"/></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Proveïdors section ───────────────────────────────────────────────────────
function ProveidorsSection() {
  const [provs, setProvs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editProv, setEditProv] = useState(null);
  const [form, setForm] = useState({ nom:'', contacte:'', telefon:'', email:'', preu_promig:'', temps_promig_entrega_dies:'', notes:'', especialitats:'[]' });
  const [saving, setSaving] = useState(false);
  const inp = 'border border-gray-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const recs = await pb.collection('proveedores_externos').getFullList({ sort: 'nom', requestKey: 'provs' });
      setProvs(recs);
    } catch(e) { console.error(e); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditProv(null); setForm({ nom:'', contacte:'', telefon:'', email:'', preu_promig:'', temps_promig_entrega_dies:'', notes:'', especialitats:'[]' }); setShowForm(true); };
  const openEdit = (p) => { setEditProv(p); setForm({ nom:p.nom||'', contacte:p.contacte||'', telefon:p.telefon||'', email:p.email||'', preu_promig:p.preu_promig||'', temps_promig_entrega_dies:p.temps_promig_entrega_dies||'', notes:p.notes||'', especialitats:JSON.stringify(p.especialitats||[]) }); setShowForm(true); };

  const save = async () => {
    setSaving(true);
    try {
      let esp = [];
      try { esp = JSON.parse(form.especialitats); } catch(_) {}
      const data = { nom:form.nom, contacte:form.contacte, telefon:form.telefon, email:form.email, preu_promig:parseFloat(form.preu_promig)||0, temps_promig_entrega_dies:parseInt(form.temps_promig_entrega_dies)||0, notes:form.notes, especialitats:esp, actiu:true };
      if (editProv) await pb.collection('proveedores_externos').update(editProv.id, data);
      else await pb.collection('proveedores_externos').create(data);
      setShowForm(false);
      load();
    } catch(e) { alert('Error: '+e.message); } finally { setSaving(false); }
  };

  const del = async (id) => {
    if (!confirm('Eliminar proveïdor?')) return;
    await pb.collection('proveedores_externos').delete(id);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">Proveïdors externs ({provs.length})</h3>
        <button onClick={openNew} className="flex items-center gap-2 bg-[#1e3a5f] text-white px-3 py-2 rounded-lg text-sm hover:bg-[#2d5a8e]">
          <Plus size={14}/> Nou proveïdor
        </button>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? <div className="p-6 text-center text-gray-400 text-sm">Carregant...</div> : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Nom','Contacte','Telèfon','Email','Preu promig','Dies entrega','Accions'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {provs.length === 0 ? (
                <tr><td colSpan={7} className="p-6 text-center text-gray-400">Sense proveïdors. Afegeix el primer.</td></tr>
              ) : provs.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2.5 font-medium">{p.nom}</td>
                  <td className="px-3 py-2.5 text-gray-500">{p.contacte || '—'}</td>
                  <td className="px-3 py-2.5">{p.telefon || '—'}</td>
                  <td className="px-3 py-2.5">{p.email || '—'}</td>
                  <td className="px-3 py-2.5">{p.preu_promig ? `${p.preu_promig} €` : '—'}</td>
                  <td className="px-3 py-2.5">{p.temps_promig_entrega_dies ? `${p.temps_promig_entrega_dies} d.` : '—'}</td>
                  <td className="px-3 py-2.5 flex items-center gap-2">
                    <button onClick={() => openEdit(p)} className="text-xs text-[#1e3a5f] underline">Editar</button>
                    <button onClick={() => del(p.id)} className="text-xs text-red-500 underline">Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {showForm && (
        <Modal title={editProv ? 'Editar proveïdor' : 'Nou proveïdor'} onClose={() => setShowForm(false)}>
          <div className="p-6 space-y-3">
            <div><label className="text-xs font-medium text-gray-500 block mb-1">Nom *</label><input className={inp} value={form.nom} onChange={e=>setForm(f=>({...f,nom:e.target.value}))}/></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium text-gray-500 block mb-1">Contacte</label><input className={inp} value={form.contacte} onChange={e=>setForm(f=>({...f,contacte:e.target.value}))}/></div>
              <div><label className="text-xs font-medium text-gray-500 block mb-1">Telèfon</label><input className={inp} value={form.telefon} onChange={e=>setForm(f=>({...f,telefon:e.target.value}))}/></div>
              <div><label className="text-xs font-medium text-gray-500 block mb-1">Email</label><input type="email" className={inp} value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></div>
              <div><label className="text-xs font-medium text-gray-500 block mb-1">Preu promig (€)</label><input type="number" className={inp} value={form.preu_promig} onChange={e=>setForm(f=>({...f,preu_promig:e.target.value}))}/></div>
              <div><label className="text-xs font-medium text-gray-500 block mb-1">Dies entrega promig</label><input type="number" className={inp} value={form.temps_promig_entrega_dies} onChange={e=>setForm(f=>({...f,temps_promig_entrega_dies:e.target.value}))}/></div>
            </div>
            <div><label className="text-xs font-medium text-gray-500 block mb-1">Especialitats (JSON array)</label><textarea className={inp+' font-mono text-xs'} rows={2} value={form.especialitats} onChange={e=>setForm(f=>({...f,especialitats:e.target.value}))}/></div>
            <div><label className="text-xs font-medium text-gray-500 block mb-1">Notes</label><textarea className={inp} rows={2} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg">Cancel·lar</button>
            <button onClick={save} disabled={saving||!form.nom} className="flex items-center gap-2 px-4 py-2 text-sm bg-[#1e3a5f] text-white rounded-lg disabled:opacity-50">
              {saving ? <RefreshCw size={14} className="animate-spin"/> : <Save size={14}/>} Guardar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Main FasesExternalizadas ─────────────────────────────────────────────────
export default function FasesExternalizadas() {
  const [fases, setFases] = useState([]);
  const [provs, setProvs] = useState([]);
  const [exclusives, setExclusives] = useState([]);
  const [monos, setMonos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('fases');
  const [showForm, setShowForm] = useState(false);
  const [editFase, setEditFase] = useState(null);
  const [incModal, setIncModal] = useState(null);
  const [filterEstat, setFilterEstat] = useState('all');
  const [form, setForm] = useState({
    exclusiva: '', mono: '', fase: '', operacio_codi: '', proveidor: '',
    data_enviament: '', data_devolucion_esperada: '', preu_cost: '', observacions: '',
  });
  const [saving, setSaving] = useState(false);
  const [incForm, setIncForm] = useState({ descripcio: '' });
  const inp = 'border border-gray-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [f, p, ex, m] = await Promise.all([
        pb.collection('fases_externalizadas').getFullList({ sort: '-created', expand: 'exclusiva,mono,proveidor', requestKey: 'fe-all' }),
        pb.collection('proveedores_externos').getFullList({ sort: 'nom', requestKey: 'fe-provs' }),
        pb.collection('exclusives').getFullList({ fields: 'id,exclusiva,article', sort: '-created', requestKey: 'fe-ex' }),
        pb.collection('monos').getFullList({ fields: 'id,codi,exclusiva', requestKey: 'fe-monos' }),
      ]);
      setFases(f); setProvs(p); setExclusives(ex); setMonos(m);
    } catch(e) { console.error(e); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredMonos = form.exclusiva ? monos.filter(m => m.exclusiva === form.exclusiva) : monos;

  const save = async () => {
    setSaving(true);
    try {
      const data = {
        exclusiva: form.exclusiva || null,
        mono: form.mono || null,
        fase: form.fase,
        operacio_codi: form.operacio_codi,
        proveidor: form.proveidor || null,
        data_enviament: form.data_enviament,
        data_devolucion_esperada: form.data_devolucion_esperada,
        preu_cost: parseFloat(form.preu_cost) || 0,
        observacions: form.observacions,
        estat: 'enviada',
        created_by: pb.authStore.record?.id || null,
      };
      if (editFase) await pb.collection('fases_externalizadas').update(editFase.id, data);
      else await pb.collection('fases_externalizadas').create(data);
      setShowForm(false); load();
    } catch(e) { alert('Error: '+e.message); } finally { setSaving(false); }
  };

  const updateEstat = async (id, estat) => {
    await pb.collection('fases_externalizadas').update(id, { estat });
    if (estat === 'retornada') {
      const f = fases.find(x => x.id === id);
      if (f) await pb.collection('fases_externalizadas').update(id, { data_devolucion_real: new Date().toISOString().slice(0,10) });
    }
    load();
  };

  const saveIncidencia = async () => {
    if (!incModal) return;
    await pb.collection('fases_externalizadas').update(incModal.id, { estat: 'amb_incidencies', descripcio_incidencia: incForm.descripcio });
    setIncModal(null);
    load();
  };

  const filtered = fases.filter(f => filterEstat === 'all' || f.estat === filterEstat);

  const stats = {
    total: fases.length,
    enviada: fases.filter(f=>f.estat==='enviada').length,
    retornada: fases.filter(f=>f.estat==='retornada').length,
    incidencies: fases.filter(f=>f.estat==='amb_incidencies').length,
    costTotal: fases.reduce((s,f)=>s+(f.preu_cost||0),0),
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h2 className="text-xl font-bold text-gray-800">Fases externalitzades</h2>
          <p className="text-sm text-gray-500">{stats.total} fases registrades</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setTab('fases')} className={`px-3 py-1.5 text-sm rounded-lg font-medium ${tab==='fases'?'bg-[#1e3a5f] text-white':'text-gray-600 border border-gray-200'}`}>Fases</button>
          <button onClick={() => setTab('provs')} className={`px-3 py-1.5 text-sm rounded-lg font-medium ${tab==='provs'?'bg-[#1e3a5f] text-white':'text-gray-600 border border-gray-200'}`}>Proveïdors</button>
        </div>
        {tab === 'fases' && (
          <button onClick={() => { setEditFase(null); setForm({ exclusiva:'', mono:'', fase:'', operacio_codi:'', proveidor:'', data_enviament:new Date().toISOString().slice(0,10), data_devolucion_esperada:'', preu_cost:'', observacions:'' }); setShowForm(true); }}
            className="flex items-center gap-2 bg-[#1e3a5f] text-white px-3 py-2 rounded-lg text-sm hover:bg-[#2d5a8e]">
            <Plus size={14}/> Nova fase externalitzada
          </button>
        )}
        <button onClick={load} className="p-2 text-gray-400 hover:text-[#1e3a5f] border border-gray-200 rounded-lg"><RefreshCw size={16}/></button>
      </div>

      {tab === 'provs' ? <ProveidorsSection/> : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label:'Total fases', value:stats.total, icon:Package, color:'text-[#1e3a5f]' },
              { label:'Enviades / en procés', value:stats.enviada, icon:Truck, color:'text-blue-600' },
              { label:'Retornades', value:stats.retornada, icon:CheckCircle, color:'text-emerald-600' },
              { label:'Amb incidències', value:stats.incidencies, icon:AlertTriangle, color:'text-red-500' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className={`flex items-center gap-2 text-xs font-medium uppercase mb-2 ${color}`}><Icon size={14}/>{label}</div>
                <p className="text-2xl font-bold text-gray-800">{value}</p>
              </div>
            ))}
          </div>

          {/* Cost summary */}
          {stats.costTotal > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg px-5 py-3 text-orange-800 text-sm flex items-center gap-3">
              <ExternalLink size={16}/>
              <span>Cost total externalitzat: <strong>{new Intl.NumberFormat('ca-ES',{style:'currency',currency:'EUR'}).format(stats.costTotal)}</strong></span>
            </div>
          )}

          {/* Filters + table */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
              <h3 className="font-semibold text-gray-800 flex-1">Llistat de fases</h3>
              <select value={filterEstat} onChange={e=>setFilterEstat(e.target.value)} className="border border-gray-200 rounded px-2 py-1.5 text-xs">
                <option value="all">Tots els estats</option>
                {Object.entries(ESTAT_CONFIG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            {loading ? <div className="p-6 text-center text-gray-400 text-sm">Carregant...</div> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {['Exclusiva','Mono','Fase','Proveïdor','Enviada','Devolució esp.','Devolució real','Cost','Estat','Accions'].map(h=>(
                        <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtered.length === 0 ? (
                      <tr><td colSpan={10} className="p-6 text-center text-gray-400">Sense fases registrades.</td></tr>
                    ) : filtered.map(f => (
                      <tr key={f.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2.5 font-medium font-mono">{f.expand?.exclusiva?.exclusiva || '—'}</td>
                        <td className="px-3 py-2.5">{f.expand?.mono?.codi || '—'}</td>
                        <td className="px-3 py-2.5 max-w-[150px] truncate">{f.fase || '—'}</td>
                        <td className="px-3 py-2.5 font-medium">{f.expand?.proveidor?.nom || '—'}</td>
                        <td className="px-3 py-2.5">{f.data_enviament || '—'}</td>
                        <td className="px-3 py-2.5">{f.data_devolucion_esperada || '—'}</td>
                        <td className="px-3 py-2.5">{f.data_devolucion_real || '—'}</td>
                        <td className="px-3 py-2.5">{f.preu_cost ? `${f.preu_cost} €` : '—'}</td>
                        <td className="px-3 py-2.5"><EstatBadge estat={f.estat}/></td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1 flex-wrap">
                            {f.estat === 'enviada' && <button onClick={() => updateEstat(f.id,'en_proces')} className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">En procés</button>}
                            {['enviada','en_proces'].includes(f.estat) && <button onClick={() => updateEstat(f.id,'retornada')} className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">Retornada</button>}
                            <button onClick={() => { setIncModal(f); setIncForm({ descripcio: f.descripcio_incidencia||'' }); }} className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">Incidència</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* New fase modal */}
      {showForm && (
        <Modal title="Nova fase externalitzada" onClose={() => setShowForm(false)}>
          <div className="p-6 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Exclusiva</label>
                <select className={inp} value={form.exclusiva} onChange={e=>setForm(f=>({...f,exclusiva:e.target.value,mono:''}))}>
                  <option value="">Selecciona...</option>
                  {exclusives.map(e=><option key={e.id} value={e.id}>{e.exclusiva}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Mono</label>
                <select className={inp} value={form.mono} onChange={e=>setForm(f=>({...f,mono:e.target.value}))}>
                  <option value="">Selecciona...</option>
                  {filteredMonos.map(m=><option key={m.id} value={m.id}>{m.codi}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-500 block mb-1">Fase / operació</label>
                <input className={inp} value={form.fase} onChange={e=>setForm(f=>({...f,fase:e.target.value}))} placeholder="Ex: Estampació, Acabats..."/>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Proveïdor</label>
                <select className={inp} value={form.proveidor} onChange={e=>setForm(f=>({...f,proveidor:e.target.value}))}>
                  <option value="">Selecciona...</option>
                  {provs.map(p=><option key={p.id} value={p.id}>{p.nom}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Preu cost (€)</label>
                <input type="number" className={inp} value={form.preu_cost} onChange={e=>setForm(f=>({...f,preu_cost:e.target.value}))}/>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Data enviament</label>
                <input type="date" className={inp} value={form.data_enviament} onChange={e=>setForm(f=>({...f,data_enviament:e.target.value}))}/>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Devolució esperada</label>
                <input type="date" className={inp} value={form.data_devolucion_esperada} onChange={e=>setForm(f=>({...f,data_devolucion_esperada:e.target.value}))}/>
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-500 block mb-1">Observacions</label>
                <textarea className={inp} rows={2} value={form.observacions} onChange={e=>setForm(f=>({...f,observacions:e.target.value}))}/>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg">Cancel·lar</button>
            <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm bg-[#1e3a5f] text-white rounded-lg disabled:opacity-50">
              {saving ? <RefreshCw size={14} className="animate-spin"/> : <Save size={14}/>} Guardar
            </button>
          </div>
        </Modal>
      )}

      {/* Incident modal */}
      {incModal && (
        <Modal title="Registrar incidència" onClose={() => setIncModal(null)}>
          <div className="p-6 space-y-3">
            <p className="text-sm text-gray-600">Fase: <strong>{incModal.fase}</strong> — Exclusiva: <strong>{incModal.expand?.exclusiva?.exclusiva}</strong></p>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Descripció de la incidència</label>
              <textarea className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none h-28" value={incForm.descripcio} onChange={e=>setIncForm(f=>({...f,descripcio:e.target.value}))}/>
            </div>
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
            <button onClick={() => setIncModal(null)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg">Cancel·lar</button>
            <button onClick={saveIncidencia} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">Registrar incidència</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

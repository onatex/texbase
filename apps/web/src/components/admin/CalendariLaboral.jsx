import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, Plus, Trash2, RefreshCw, Edit2, X, Check, Sparkles } from 'lucide-react';
import pb from '@/lib/pocketbaseClient';

const TIPO_CONFIG = {
  festivo: { label: 'Festiu', cls: 'bg-red-100 text-red-700', dot: 'bg-red-400' },
  vacaciones: { label: 'Vacances', cls: 'bg-orange-100 text-orange-700', dot: 'bg-orange-400' },
  laboral: { label: 'Laboral', cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-400' },
};

function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// Catalan month names
const MESOS = ['Gener', 'Febrer', 'Març', 'Abril', 'Maig', 'Juny', 'Juliol', 'Agost', 'Setembre', 'Octubre', 'Novembre', 'Desembre'];

export default function CalendariLaboral() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ fecha: '', tipo: 'festivo', descripcio: '', operaris_en_vacances: '' });
  const [saving, setSaving] = useState(false);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear().toString());
  const [filterTipo, setFilterTipo] = useState('');
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [operaris, setOperaris] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ents, ops] = await Promise.all([
        pb.collection('calendario_laboral').getFullList({
          sort: 'fecha',
          requestKey: 'cal-all',
        }),
        pb.collection('users').getFullList({
          filter: 'rol = "operari"',
          fields: 'id,name,codi',
          requestKey: 'cal-ops',
        }),
      ]);
      setEntries(ents);
      setOperaris(ops);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = entries.filter(e => {
    if (filterYear && !e.fecha.startsWith(filterYear)) return false;
    if (filterTipo && e.tipo !== filterTipo) return false;
    return true;
  });

  // Group by month
  const byMonth = {};
  for (const e of filtered) {
    const month = e.fecha.slice(0, 7);
    if (!byMonth[month]) byMonth[month] = [];
    byMonth[month].push(e);
  }

  async function handleSave() {
    if (!form.fecha || !form.tipo) return;
    setSaving(true);
    try {
      const data = {
        fecha: form.fecha,
        tipo: form.tipo,
        descripcio: form.descripcio,
        operaris_en_vacances: form.operaris_en_vacances ? form.operaris_en_vacances.split(',').map(s => s.trim()).filter(Boolean) : [],
      };
      await pb.collection('calendario_laboral').create(data);
      setShowForm(false);
      setForm({ fecha: '', tipo: 'festivo', descripcio: '', operaris_en_vacances: '' });
      load();
    } catch (e) {
      console.error(e);
      alert('Error al guardar: ' + (e.message || ''));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Eliminar aquest registre?')) return;
    try {
      await pb.collection('calendario_laboral').delete(id);
      load();
    } catch (e) {
      console.error(e);
    }
  }

  async function handleEditSave(id) {
    try {
      await pb.collection('calendario_laboral').update(id, {
        tipo: editForm.tipo,
        descripcio: editForm.descripcio,
        operaris_en_vacances: editForm.operaris_en_vacances || [],
      });
      setEditId(null);
      load();
    } catch (e) {
      console.error(e);
    }
  }

  const years = [...new Set(entries.map(e => e.fecha.slice(0, 4)))].sort();
  if (!years.includes(new Date().getFullYear().toString())) years.push(new Date().getFullYear().toString());

  // Seed batch vacation week
  async function seedVacationWeek(startDate, operarisCodes) {
    const start = new Date(startDate);
    const codes = operarisCodes || [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      try {
        await pb.collection('calendario_laboral').create({
          fecha: iso,
          tipo: 'vacaciones',
          descripcio: 'Vacances d\'estiu',
          operaris_en_vacances: codes,
        }, { requestKey: null });
      } catch (_) {}
    }
    load();
  }

  // Auto-generate next year holidays
  async function generateNextYear() {
    const nextYear = new Date().getFullYear() + 1;
    if (!confirm(`Generar automàticament els festius de ${nextYear}? S'afegiran els festius que no existeixin.`)) return;
    setGenerating(true);
    setGenResult('');

    // Spanish national holidays + Catalan + Sabadell
    const easterOffset = (y) => {
      const a = y % 19, b = Math.floor(y / 100), c = y % 100;
      const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
      const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
      const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
      const m = Math.floor((a + 11 * h + 22 * l) / 451);
      const month = Math.floor((h + l - 7 * m + 114) / 31);
      const day = ((h + l - 7 * m + 114) % 31) + 1;
      return new Date(y, month - 1, day);
    };
    const easter = easterOffset(nextYear);
    const goodFriday = new Date(easter); goodFriday.setDate(easter.getDate() - 2);
    const easterMonday = new Date(easter); easterMonday.setDate(easter.getDate() + 1);

    const toISO = (d) => d.toISOString().slice(0, 10);
    const fixedHolidays = [
      { fecha: `${nextYear}-01-01`, descripcio: 'Any Nou' },
      { fecha: `${nextYear}-01-06`, descripcio: 'Reis Mags' },
      { fecha: toISO(goodFriday), descripcio: 'Divendres Sant' },
      { fecha: toISO(easterMonday), descripcio: 'Dilluns de Pasqua' },
      { fecha: `${nextYear}-05-01`, descripcio: 'Dia del Treball' },
      { fecha: `${nextYear}-06-24`, descripcio: 'Sant Joan (Cataluña)' },
      { fecha: `${nextYear}-08-15`, descripcio: 'Assumpció de la Mare de Déu' },
      { fecha: `${nextYear}-09-11`, descripcio: 'Diada Nacional de Catalunya' },
      { fecha: `${nextYear}-09-24`, descripcio: 'La Mercè (Catalunya)' },
      { fecha: `${nextYear}-10-12`, descripcio: 'Festa Nacional d\'Espanya' },
      { fecha: `${nextYear}-11-01`, descripcio: 'Tots Sants' },
      { fecha: `${nextYear}-12-06`, descripcio: 'Dia de la Constitució' },
      { fecha: `${nextYear}-12-08`, descripcio: 'Immaculada Concepció' },
      { fecha: `${nextYear}-12-25`, descripcio: 'Nadal' },
      { fecha: `${nextYear}-12-26`, descripcio: 'Sant Esteve (Catalunya)' },
      // Sabadell local
      { fecha: `${nextYear}-04-25`, descripcio: 'Festa local Sabadell' },
      { fecha: `${nextYear}-05-11`, descripcio: 'Sant Pau (Sabadell)' },
    ];

    const existing = entries.map(e => e.fecha);
    let added = 0, skipped = 0;
    for (const h of fixedHolidays) {
      if (existing.includes(h.fecha)) { skipped++; continue; }
      try {
        await pb.collection('calendario_laboral').create({
          fecha: h.fecha,
          tipo: 'festivo',
          descripcio: h.descripcio,
          operaris_en_vacances: [],
        }, { requestKey: null });
        added++;
      } catch (_) { skipped++; }
    }
    setGenResult(`✓ Calendari ${nextYear} generat: ${added} festius afegits, ${skipped} ja existents.`);
    setGenerating(false);
    load();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 gap-2">
        <RefreshCw size={18} className="animate-spin" /> Carregant calendari...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2"><Calendar size={20} />Calendari laboral — Sabadell / Barcelona</h2>
          <p className="text-sm text-gray-500 mt-0.5">Festius nacionals, catalans i locals de Sabadell. Vacances de l'equip.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={load} className="border border-gray-200 rounded-lg px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-1.5 text-gray-600">
            <RefreshCw size={14} /> Actualitzar
          </button>
          <button
            onClick={generateNextYear}
            disabled={generating}
            className="border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg px-3 py-2 text-sm flex items-center gap-1.5 transition disabled:opacity-50"
          >
            {generating ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
            Generar {new Date().getFullYear() + 1}
          </button>
          <button onClick={() => setShowForm(v => !v)} className="bg-[#1e3a5f] text-white rounded-lg px-4 py-2 text-sm hover:bg-[#1e3a5f]/90 flex items-center gap-1.5">
            <Plus size={14} /> Nou registre
          </button>
        </div>
      </div>
      {genResult && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-4 py-3 text-sm flex items-center justify-between gap-3">
          <span>{genResult}</span>
          <button onClick={() => setGenResult('')} className="text-emerald-600 hover:text-emerald-800">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h3 className="font-semibold text-gray-800">Nou registre al calendari</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Data</label>
              <input type="date" className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Tipus</label>
              <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
                <option value="festivo">Festiu</option>
                <option value="vacaciones">Vacances</option>
                <option value="laboral">Laboral especial</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Descripció</label>
              <input type="text" className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full" placeholder="Nom del festiu..." value={form.descripcio} onChange={e => setForm(f => ({ ...f, descripcio: e.target.value }))} />
            </div>
            {form.tipo === 'vacaciones' && (
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Operaris (codis, separats per coma)</label>
                <input type="text" className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full" placeholder="OP001, OP002..." value={form.operaris_en_vacances} onChange={e => setForm(f => ({ ...f, operaris_en_vacances: e.target.value }))} />
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={handleSave} disabled={saving || !form.fecha} className="bg-[#1e3a5f] text-white rounded-lg px-4 py-2 text-sm hover:bg-[#1e3a5f]/90 disabled:opacity-50">
              {saving ? 'Guardant...' : 'Guardar'}
            </button>
            <button onClick={() => setShowForm(false)} className="border border-gray-200 rounded-lg px-4 py-2 text-sm hover:bg-gray-50">Cancel·lar</button>
          </div>

          {/* Quick vacation week */}
          <div className="pt-3 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-600 mb-2">Carregar setmana de vacances ràpida</p>
            <div className="flex gap-3 items-end">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Inici de setmana</label>
                <input type="date" id="vacWeekStart" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Tots els operaris</label>
                <button
                  onClick={() => {
                    const startEl = document.getElementById('vacWeekStart');
                    if (startEl && startEl.value) seedVacationWeek(startEl.value, operaris.map(o => o.codi));
                  }}
                  className="bg-orange-500 text-white rounded-lg px-4 py-2 text-sm hover:bg-orange-600"
                >
                  Carregar setmana
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={filterYear} onChange={e => setFilterYear(e.target.value)}>
          <option value="">Tots els anys</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={filterTipo} onChange={e => setFilterTipo(e.target.value)}>
          <option value="">Tots els tipus</option>
          <option value="festivo">Festius</option>
          <option value="vacaciones">Vacances</option>
          <option value="laboral">Laborals especials</option>
        </select>
        <span className="text-sm text-gray-500">{filtered.length} registres</span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {Object.entries(TIPO_CONFIG).map(([tipo, cfg]) => {
          const count = filtered.filter(e => e.tipo === tipo).length;
          return (
            <div key={tipo} className={`rounded-xl border p-4 ${cfg.cls}`}>
              <p className="font-bold text-2xl">{count}</p>
              <p className="text-sm font-medium mt-0.5">{cfg.label}</p>
            </div>
          );
        })}
      </div>

      {/* Monthly groups */}
      {Object.keys(byMonth).length === 0 ? (
        <div className="text-center py-12 text-gray-400">Sense registres per al filtre seleccionat.</div>
      ) : (
        <div className="space-y-4">
          {Object.entries(byMonth).sort().map(([month, monthEntries]) => {
            const [y, m] = month.split('-');
            return (
              <div key={month} className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-800">{MESOS[parseInt(m) - 1]} {y}</h3>
                  <span className="text-xs text-gray-500">{monthEntries.length} dies no laborals</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {monthEntries.map(entry => {
                    const cfg = TIPO_CONFIG[entry.tipo] || TIPO_CONFIG.festivo;
                    const isEdit = editId === entry.id;
                    return (
                      <div key={entry.id} className="px-5 py-3 flex items-center gap-4 hover:bg-gray-50">
                        <div className="w-24 shrink-0">
                          <p className="font-mono font-medium text-sm text-gray-800">{fmtDate(entry.fecha)}</p>
                        </div>
                        <div className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>{cfg.label}</div>
                        {isEdit ? (
                          <>
                            <input
                              type="text"
                              className="border border-gray-200 rounded px-2 py-1 text-sm flex-1"
                              value={editForm.descripcio || ''}
                              onChange={e => setEditForm(f => ({ ...f, descripcio: e.target.value }))}
                              placeholder="Descripció..."
                            />
                            <select
                              className="border border-gray-200 rounded px-2 py-1 text-sm"
                              value={editForm.tipo || 'festivo'}
                              onChange={e => setEditForm(f => ({ ...f, tipo: e.target.value }))}
                            >
                              <option value="festivo">Festiu</option>
                              <option value="vacaciones">Vacances</option>
                              <option value="laboral">Laboral</option>
                            </select>
                            <button onClick={() => handleEditSave(entry.id)} className="text-emerald-600 hover:text-emerald-800"><Check size={16} /></button>
                            <button onClick={() => setEditId(null)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
                          </>
                        ) : (
                          <>
                            <p className="flex-1 text-sm text-gray-700">{entry.descripcio || '—'}</p>
                            {entry.operaris_en_vacances && Array.isArray(entry.operaris_en_vacances) && entry.operaris_en_vacances.length > 0 && (
                              <div className="flex gap-1 flex-wrap">
                                {entry.operaris_en_vacances.slice(0, 3).map(op => (
                                  <span key={op} className="text-xs bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded">{op}</span>
                                ))}
                                {entry.operaris_en_vacances.length > 3 && (
                                  <span className="text-xs text-gray-400">+{entry.operaris_en_vacances.length - 3}</span>
                                )}
                              </div>
                            )}
                            <div className="flex items-center gap-2 shrink-0">
                              <button onClick={() => { setEditId(entry.id); setEditForm({ tipo: entry.tipo, descripcio: entry.descripcio, operaris_en_vacances: entry.operaris_en_vacances || [] }); }} className="text-gray-400 hover:text-[#1e3a5f]"><Edit2 size={14} /></button>
                              <button onClick={() => handleDelete(entry.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

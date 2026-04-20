import React, { useState } from 'react';
import logo from '../logo.png';
import { C, fmt, fmtCOP, OPERATORS } from '../constants';
import { fetchAgentsList, fetchSpotPrice } from '../services/xm';
import { searchCECPanels, searchCECInverters } from '../services/cec';

// Modal de búsqueda en la base CEC (NREL SAM) para importar equipos con
// specs eléctricos oficiales. onImport recibe el objeto normalizado y
// debe mapearlo al schema local (agregando precio, kg, etc. faltantes).
function CECImportModal({ type, onClose, onImport, ss }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  const doSearch = async () => {
    if (!q.trim()) return;
    setLoading(true); setError(null);
    try {
      const fn = type === 'panel' ? searchCECPanels : searchCECInverters;
      const data = await fn(q, 25);
      setResults(data.results || []);
      setInfo({ total: data.total, count: data.count, cached: data.cached });
    } catch (e) {
      setError(e.message);
      setResults([]);
    }
    setLoading(false);
  };

  const onKey = e => { if (e.key === 'Enter') doSearch(); };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, width: '100%', maxWidth: 760, maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Importar desde CEC / NREL SAM</div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Base oficial de California Energy Commission · {type === 'panel' ? 'paneles' : 'inversores'} certificados</div>
          </div>
          <button style={{ ...ss.btn, background: 'transparent', border: `1px solid ${C.border}`, color: C.muted }} onClick={onClose}>×</button>
        </div>

        <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}22`, display: 'flex', gap: 8 }}>
          <input autoFocus style={{ ...ss.inp, flex: 1 }} placeholder={type === 'panel' ? 'Ej: JA Solar 545, Canadian Solar 550, Trina 610…' : 'Ej: Growatt MIN, Solis 5K, SMA Sunny Boy…'} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey} />
          <button style={ss.btn} onClick={doSearch} disabled={loading}>{loading ? 'Buscando…' : 'Buscar'}</button>
        </div>

        {error && <div style={{ padding: '10px 18px', color: C.red, fontSize: 11 }}>⚠ {error}</div>}
        {info && <div style={{ padding: '6px 18px', color: C.muted, fontSize: 10 }}>{info.count} de {fmt(info.total)} en base CEC {info.cached ? '· caché local' : ''}</div>}

        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
          {results.length === 0 && !loading && !error && (
            <div style={{ padding: '40px 18px', textAlign: 'center', color: C.muted, fontSize: 12 }}>
              {q ? 'Escribe y busca para ver resultados.' : 'Base CEC: ~22.000 paneles y ~6.000 inversores certificados. Los resultados incluyen Voc, Vmp, Isc, Imp y coeficientes de temperatura oficiales.'}
            </div>
          )}
          {results.map((r, idx) => (
            <div key={idx} style={{ padding: '10px 18px', borderBottom: `1px solid ${C.border}22`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: '#fff', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.fullName || `${r.brand} ${r.model}`}</div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>
                  {type === 'panel'
                    ? `${r.wp || '?'}Wp · Voc ${r.voc?.toFixed(1) || '?'}V · Vmp ${r.vmp?.toFixed(1) || '?'}V · Isc ${r.isc?.toFixed(2) || '?'}A · Imp ${r.imp?.toFixed(2) || '?'}A · ${r.cellCount || '?'} celdas · γ ${r.tempCoeffPmax?.toFixed(3) || '?'}%/°C`
                    : `${r.kw?.toFixed(1) || '?'}kW · ${r.phase}Φ ${r.vac}V · Vdc_max ${r.vocMax || '?'}V · MPPT ${r.mpptVmin || '?'}–${r.mpptVmax || '?'}V · Idc_max ${r.idcMax || '?'}A`
                  }
                </div>
              </div>
              <button style={{ ...ss.btn, padding: '5px 11px' }} onClick={() => onImport(r)}>+ Importar</button>
            </div>
          ))}
        </div>

        <div style={{ padding: '10px 18px', borderTop: `1px solid ${C.border}`, fontSize: 10, color: C.muted }}>
          Fuente: NREL System Advisor Model · base actualizada trimestralmente · datos curados por CEC.
        </div>
      </div>
    </div>
  );
}

function EqMgr({ title, items, upd, fields, ss }) {
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState({});
  const [adding, setAdding] = useState(false);
  const startAdd = () => { setAdding(true); setEdit(null); setForm(Object.fromEntries(fields.map(f => [f.k, '']))); };
  const startEdit = i => { setEdit(i.id); setAdding(false); setForm({ ...i }); };
  const cancel = () => { setEdit(null); setAdding(false); setForm({}); };
  const save = () => { if (adding) upd([...items, { ...form, id: 'eq_' + Date.now() }]); else upd(items.map(i => i.id === edit ? { ...form } : i)); cancel(); };
  const del = id => upd(items.filter(i => i.id !== id));
  const FR = () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, padding: '10px 0 6px' }}>
      {fields.map(f => (
        <div key={f.k}><label style={ss.lbl}>{f.l}</label>
          {f.t === 'select'
            ? <select style={{ ...ss.inp, cursor: 'pointer' }} value={form[f.k] || ''} onChange={e => setForm(p => ({ ...p, [f.k]: e.target.value }))}>{f.opts.map(o => <option key={o} value={o}>{o}</option>)}</select>
            : <input type={f.t} style={ss.inp} value={form[f.k] || ''} onChange={e => setForm(p => ({ ...p, [f.k]: f.t === 'number' ? parseFloat(e.target.value) || 0 : e.target.value }))} />}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
        <button style={ss.btn} onClick={save}>Guardar</button>
        <button style={{ ...ss.btn, background: 'transparent', border: `1px solid ${C.border}`, color: C.muted }} onClick={cancel}>×</button>
      </div>
    </div>
  );
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ ...ss.h2, margin: 0 }}>{title}</div>
        <button style={ss.btn} onClick={startAdd}>+ Agregar</button>
      </div>
      {adding && <div style={ss.card}><FR /></div>}
      <div style={ss.card}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{[...fields.map(f => f.l), ''].map(h => <th key={h} style={ss.th}>{h}</th>)}</tr></thead>
          <tbody>
            {items.map(item => edit === item.id
              ? <tr key={item.id}><td colSpan={fields.length + 1} style={{ padding: 0 }}><FR /></td></tr>
              : (<tr key={item.id}>
                {fields.map(f => <td key={f.k} style={ss.td}>{f.k === 'price' ? fmtCOP(item[f.k]) : item[f.k]}</td>)}
                <td style={ss.td}><div style={{ display: 'flex', gap: 5 }}><button style={ss.btn} onClick={() => startEdit(item)}>Editar</button><button style={ss.del} onClick={() => del(item.id)}>×</button></div></td>
              </tr>)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PriceMgr({ pricing, upd, ss }) {
  const [form, setForm] = useState(pricing);
  const [saved, setSaved] = useState(false);
  const fields = [
    { k: 'structure_per_panel', l: 'Estructura/panel (COP)' },
    { k: 'cabling_per_kwp', l: 'Cableado/kWp' },
    { k: 'protections_per_kwp', l: 'Protecciones/kWp' },
    { k: 'installation_per_kwp', l: 'Instalación/kWp' },
    { k: 'engineering', l: 'Ingeniería fija (COP)' },
    { k: 'emsa_tramites', l: 'Trámites operador (COP)' },
    { k: 'iva', l: 'IVA Sección B (%)' },
  ];
  const sv = () => { upd(form); setSaved(true); setTimeout(() => setSaved(false), 2000); };
  return (
    <div>
      <div style={ss.h2}>Configuración de precios</div>
      <div style={{ background: `${C.teal}10`, border: `1px solid ${C.teal}22`, borderRadius: 7, padding: '9px 12px', marginBottom: 13, fontSize: 11, color: C.muted }}>
        Actualiza según cotizaciones reales del mercado. Los cambios aplican inmediatamente en el cotizador.
      </div>
      <div style={ss.card}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          {fields.map(f => (
            <div key={f.k}><label style={ss.lbl}>{f.l}</label><input type="number" style={ss.inp} value={form[f.k]} onChange={e => setForm(p => ({ ...p, [f.k]: parseFloat(e.target.value) || 0 }))} /></div>
          ))}
        </div>
        <button style={{ ...ss.btn, padding: '9px 24px' }} onClick={sv}>{saved ? '✓ Guardado' : 'Guardar precios'}</button>
      </div>
    </div>
  );
}

function QuotesMgr({ quotes, ss }) {
  const [sel, setSel] = useState(null);
  if (sel) {
    const q = quotes.find(x => x.id === sel);
    if (!q) { setSel(null); return null; }
    return (
      <div>
        <button style={{ ...ss.btn, marginBottom: 12, background: 'transparent', border: `1px solid ${C.border}`, color: C.muted }} onClick={() => setSel(null)}>← Volver</button>
        <div style={ss.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <div><div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{q.name}</div><div style={{ color: C.muted, fontSize: 11 }}>{q.company && `${q.company} · `}{q.city} · {q.operator} · {q.date}</div></div>
            <span style={{ padding: '2px 9px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: `${C.teal}22`, color: C.teal }}>{q.status}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
            {[['Email', q.email], ['Teléfono', q.phone], ['Dirección', q.address || '—'], ['Tipo', q.systemType], ['Consumo', `${q.monthlyKwh} kWh/mes`], ['Operador', q.operator], ['kWp', `${q.results?.actKwp} kWp`], ['Paneles', `${q.results?.numPanels}`], ['Producción', `${fmt(q.results?.mp || 0)} kWh/mes`], ['Cobertura', `${q.results?.cov}%`], ['CO2 evitado', `${fmt(q.results?.co2 || 0)} kg/año`], ['Total inversión', q.budget ? fmtCOP(q.budget.tot) : '—'], ['Sección A', q.budget ? fmtCOP(q.budget.sA) : '—'], ['Sección B', q.budget ? fmtCOP(q.budget.sB) : '—'], ['Transporte', q.budget ? fmtCOP(q.budget.transport) : '—'], ['Ahorro anual', q.budget ? fmtCOP(q.budget.sav) : '—'], ['ROI', q.budget ? `${q.budget.roi} años` : '—']].map(([k, v]) => (
              <div key={k} style={{ padding: '5px 0', borderBottom: `1px solid ${C.border}22` }}>
                <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.3 }}>{k}</div>
                <div style={{ fontSize: 11, color: '#fff', fontWeight: 500, marginTop: 1 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div>
      <div style={ss.h2}>Cotizaciones ({quotes.length})</div>
      {quotes.length === 0 ? (
        <div style={{ ...ss.card, textAlign: 'center', padding: '44px', color: C.muted }}>Las cotizaciones del portal aparecerán aquí automáticamente.</div>
      ) : (
        <div style={ss.card}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Fecha', 'Cliente', 'Operador', 'Sistema', 'kWp', 'Inversión', ''].map(h => <th key={h} style={ss.th}>{h}</th>)}</tr></thead>
            <tbody>{quotes.map(q => (
              <tr key={q.id}>
                <td style={ss.td}>{q.date}</td><td style={ss.td}>{q.name}</td><td style={ss.td}>{q.operator || '—'}</td>
                <td style={ss.td}>{q.systemType}</td><td style={ss.td}>{q.results?.actKwp}</td>
                <td style={ss.td}>{q.budget ? fmtCOP(q.budget.tot) : '—'}</td>
                <td style={ss.td}><button style={{ ...ss.btn, padding: '3px 9px' }} onClick={() => setSel(q.id)}>Ver →</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function InstallersMgr({ installers, ss }) {
  const [sel, setSel] = useState(null);
  if (sel) {
    const inst = installers.find(x => x.id === sel);
    if (!inst) { setSel(null); return null; }
    return (
      <div>
        <button style={{ ...ss.btn, marginBottom: 12, background: 'transparent', border: `1px solid ${C.border}`, color: C.muted }} onClick={() => setSel(null)}>← Volver</button>
        <div style={ss.card}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{inst.name}</div>
          <div style={{ color: C.muted, fontSize: 11, marginBottom: 14 }}>{inst.company && `${inst.company} · `}{inst.dept} · {inst.date}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
            {[['Email', inst.email], ['Teléfono', inst.phone], ['Departamento', inst.dept], ['RETIE', inst.retie], ['Experiencia', inst.years + ' años'], ['Capacidad', inst.maxKwp + ' kWp/mes'], ['Tipos de proyecto', inst.types?.join(', ') || '—']].map(([k, v]) => (
              <div key={k} style={{ padding: '5px 0', borderBottom: `1px solid ${C.border}22` }}>
                <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase' }}>{k}</div>
                <div style={{ fontSize: 11, color: '#fff', fontWeight: 500, marginTop: 1 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div>
      <div style={ss.h2}>Instaladores ({installers.length})</div>
      {installers.length === 0 ? (
        <div style={{ ...ss.card, textAlign: 'center', padding: '44px', color: C.muted }}>Los instaladores registrados aparecerán aquí.</div>
      ) : (
        <div style={ss.card}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Fecha', 'Nombre', 'Departamento', 'RETIE', 'Estado', ''].map(h => <th key={h} style={ss.th}>{h}</th>)}</tr></thead>
            <tbody>{installers.map(i => (
              <tr key={i.id}>
                <td style={ss.td}>{i.date}</td><td style={ss.td}>{i.name}</td><td style={ss.td}>{i.dept}</td><td style={ss.td}>{i.retie}</td>
                <td style={ss.td}><span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 9, background: `${C.yellow}22`, color: C.yellow }}>{i.status}</span></td>
                <td style={ss.td}><button style={{ ...ss.btn, padding: '2px 9px' }} onClick={() => setSel(i.id)}>Ver →</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OperatorsMgr({ operators, upd, ss }) {
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState({});
  const [adding, setAdding] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const [spot, setSpot] = useState(null);

  const startAdd = () => { setAdding(true); setEdit(null); setForm({ sic: '', name: '', fullName: '', region: '', tariff: 0, psh: 4.5 }); };
  const startEdit = o => { setEdit(o.name); setAdding(false); setForm({ ...o }); };
  const cancel = () => { setEdit(null); setAdding(false); setForm({}); };
  const save = () => {
    if (adding) upd([...operators, form]);
    else upd(operators.map(o => o.name === edit ? { ...form } : o));
    cancel();
  };
  const del = name => upd(operators.filter(o => o.name !== name));
  const resetDefaults = () => upd(OPERATORS);

  const syncXM = async () => {
    setSyncStatus({ loading: true });
    try {
      const data = await fetchAgentsList();
      const total = data.operators?.length ?? 0;
      if (!total) {
        setSyncStatus({ error: 'XM devolvió 0 agentes — posible cambio de schema en el API. Reintentar más tarde.' });
        return;
      }
      const xmCodes = new Set(data.operators.map(o => o.sic).filter(Boolean));
      const matched = operators.filter(o => o.sic && xmCodes.has(o.sic)).length;
      setSyncStatus({ ok: true, total, matched, syncedAt: data.syncedAt, cached: data.cached });
    } catch (err) {
      setSyncStatus({ error: err.message });
    }
  };

  const syncSpot = async () => {
    try {
      const p = await fetchSpotPrice(30);
      setSpot(p);
    } catch (err) {
      setSpot({ error: err.message });
    }
  };

  const fields = [
    { k: 'sic', l: 'SIC' },
    { k: 'name', l: 'Nombre' },
    { k: 'fullName', l: 'Razón social' },
    { k: 'region', l: 'Departamento(s)' },
    { k: 'tariff', l: 'Tarifa COP/kWh', t: 'number' },
    { k: 'psh', l: 'PSH (h/día)', t: 'number' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ ...ss.h2, margin: 0 }}>Operadores de Red ({operators.length})</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={ss.btn} onClick={syncXM} disabled={syncStatus?.loading}>{syncStatus?.loading ? 'Sincronizando…' : '⟳ Sync XM'}</button>
          <button style={ss.btn} onClick={syncSpot}>$ Precio bolsa</button>
          <button style={{ ...ss.btn, background: 'transparent', border: `1px solid ${C.border}`, color: C.muted }} onClick={resetDefaults}>Restaurar defaults</button>
          <button style={ss.btn} onClick={startAdd}>+ Agregar</button>
        </div>
      </div>

      {syncStatus?.ok && (
        <div style={{ background: `${C.green}12`, border: `1px solid ${C.green}33`, borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 11, color: C.green }}>
          ✓ XM sync · {syncStatus.matched} / {operators.filter(o => o.sic).length} OR locales validados contra {syncStatus.total} agentes XM {syncStatus.cached ? '(caché)' : ''} · {new Date(syncStatus.syncedAt).toLocaleString('es-CO')}
        </div>
      )}
      {syncStatus?.error && (
        <div style={{ background: `${C.red}12`, border: `1px solid ${C.red}33`, borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 11, color: C.red }}>
          ⚠ Sync falló: {syncStatus.error}. Probable bloqueo CORS — usar proxy backend en producción.
        </div>
      )}
      {spot?.cop_per_kwh != null && (
        <div style={{ background: `${C.yellow}12`, border: `1px solid ${C.yellow}33`, borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 11, color: C.yellow }}>
          $ Precio bolsa XM últimos {spot.periodDays}d: <strong>{spot.cop_per_kwh} COP/kWh</strong> · referencia para excedentes AGPE {spot.cached ? '(caché)' : ''}
        </div>
      )}
      {spot?.error && (
        <div style={{ background: `${C.red}12`, border: `1px solid ${C.red}33`, borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 11, color: C.red }}>
          ⚠ Bolsa XM: {spot.error}
        </div>
      )}

      <div style={{ background: `${C.teal}10`, border: `1px solid ${C.teal}22`, borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
        Códigos SIC oficiales de XM (Sinergox). Tarifas son referencia residencial estrato 4 sin subsidio — actualizables manualmente o por scrapers de PDFs mensuales (próxima iteración). PSH usa estimación regional; PVGIS lo sobreescribe en el cálculo final.
      </div>

      {adding && (
        <div style={ss.card}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            {fields.map(fl => (
              <div key={fl.k}><label style={ss.lbl}>{fl.l}</label>
                <input type={fl.t || 'text'} style={ss.inp} value={form[fl.k] || ''} onChange={e => setForm(p => ({ ...p, [fl.k]: fl.t === 'number' ? parseFloat(e.target.value) || 0 : e.target.value }))} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
              <button style={ss.btn} onClick={save}>Guardar</button>
              <button style={{ ...ss.btn, background: 'transparent', border: `1px solid ${C.border}`, color: C.muted }} onClick={cancel}>×</button>
            </div>
          </div>
        </div>
      )}

      <div style={ss.card}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{[...fields.map(fl => fl.l), ''].map(h => <th key={h} style={ss.th}>{h}</th>)}</tr></thead>
          <tbody>
            {operators.map(op => edit === op.name
              ? (<tr key={op.name}><td colSpan={fields.length + 1} style={{ padding: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                    {fields.map(fl => (
                      <div key={fl.k}><label style={ss.lbl}>{fl.l}</label>
                        <input type={fl.t || 'text'} style={ss.inp} value={form[fl.k] ?? ''} onChange={e => setForm(p => ({ ...p, [fl.k]: fl.t === 'number' ? parseFloat(e.target.value) || 0 : e.target.value }))} />
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                      <button style={ss.btn} onClick={save}>Guardar</button>
                      <button style={{ ...ss.btn, background: 'transparent', border: `1px solid ${C.border}`, color: C.muted }} onClick={cancel}>×</button>
                    </div>
                  </div>
                </td></tr>)
              : (<tr key={op.name}>
                {fields.map(fl => <td key={fl.k} style={ss.td}>{op[fl.k] || '—'}</td>)}
                <td style={ss.td}>
                  <div style={{ display: 'flex', gap: 5 }}>
                    <button style={ss.btn} onClick={() => startEdit(op)}>Editar</button>
                    <button style={ss.del} onClick={() => del(op.name)}>×</button>
                  </div>
                </td>
              </tr>)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Wrapper que combina el EqMgr local con un botón de importación CEC.
// Al importar, mezcla los specs eléctricos oficiales con valores razonables
// de precio/kg que el admin puede ajustar antes de guardar.
function PanelsTab({ panels, uP, ss }) {
  const [showCEC, setShowCEC] = useState(false);
  const [justImported, setJustImported] = useState(null);
  const onImport = (cec) => {
    const newPanel = {
      id: 'eq_' + Date.now(),
      brand: cec.brand || '',
      model: cec.model || '',
      wp: cec.wp || 0,
      price: 290000, // admin debe ajustar precio local
      kg: cec.length_m && cec.width_m ? parseFloat((cec.length_m * cec.width_m * 12).toFixed(1)) : 25,
      voc: cec.voc, vmp: cec.vmp, isc: cec.isc, imp: cec.imp,
      tempCoeffPmax: cec.tempCoeffPmax,
      tempCoeffVoc: cec.tempCoeffVoc,
      cellCount: cec.cellCount,
      technology: cec.technology,
      source: 'CEC',
    };
    uP([...panels, newPanel]);
    setJustImported(`${newPanel.brand} ${newPanel.model}`);
    setShowCEC(false);
    setTimeout(() => setJustImported(null), 3500);
  };
  return (
    <div>
      {justImported && (
        <div style={{ background: `${C.green}15`, border: `1px solid ${C.green}33`, borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 11, color: C.green }}>
          ✓ Importado desde CEC: <strong>{justImported}</strong>. Ajusta precio local antes de usar en el cotizador.
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button style={{ ...ss.btn, background: C.yellow, color: '#050d12' }} onClick={() => setShowCEC(true)}>🔍 Importar desde CEC</button>
      </div>
      <EqMgr title="Paneles solares" items={panels} upd={uP} ss={ss} fields={[
        { k: 'brand', l: 'Marca', t: 'text' },
        { k: 'model', l: 'Modelo', t: 'text' },
        { k: 'wp', l: 'Wp', t: 'number' },
        { k: 'voc', l: 'Voc (V)', t: 'number' },
        { k: 'vmp', l: 'Vmp (V)', t: 'number' },
        { k: 'isc', l: 'Isc (A)', t: 'number' },
        { k: 'imp', l: 'Imp (A)', t: 'number' },
        { k: 'tempCoeffVoc', l: 'β Voc (%/°C)', t: 'number' },
        { k: 'price', l: 'Precio COP', t: 'number' },
      ]} />
      {showCEC && <CECImportModal type="panel" ss={ss} onClose={() => setShowCEC(false)} onImport={onImport} />}
    </div>
  );
}

function InvertersTab({ inverters, uI, ss }) {
  const [showCEC, setShowCEC] = useState(false);
  const [justImported, setJustImported] = useState(null);
  const onImport = (cec) => {
    const vac = cec.vac || 240;
    const type = vac >= 380 ? 'on-grid' : 'on-grid'; // por defecto; admin puede cambiar
    const newInv = {
      id: 'eq_' + Date.now(),
      brand: cec.brand || '',
      model: cec.model || '',
      kw: cec.kw ? parseFloat(cec.kw.toFixed(2)) : 0,
      phase: cec.phase || 1,
      vac,
      type,
      price: 2500000,
      kg: 20,
      vocMax: cec.vocMax,
      mpptVmin: cec.mpptVmin,
      mpptVmax: cec.mpptVmax,
      mpptCount: 2, // CEC no publica mpptCount; default típico
      idcMax: cec.idcMax,
      efficiency: 97.5,
      source: 'CEC',
    };
    uI([...inverters, newInv]);
    setJustImported(`${newInv.brand} ${newInv.model}`);
    setShowCEC(false);
    setTimeout(() => setJustImported(null), 3500);
  };
  return (
    <div>
      {justImported && (
        <div style={{ background: `${C.green}15`, border: `1px solid ${C.green}33`, borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 11, color: C.green }}>
          ✓ Importado desde CEC: <strong>{justImported}</strong>. Verifica tipo (on-grid/hybrid/off-grid), mpptCount y precio antes de usar.
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button style={{ ...ss.btn, background: C.yellow, color: '#050d12' }} onClick={() => setShowCEC(true)}>🔍 Importar desde CEC</button>
      </div>
      <EqMgr title="Inversores" items={inverters} upd={uI} ss={ss} fields={[
        { k: 'brand', l: 'Marca', t: 'text' },
        { k: 'model', l: 'Modelo', t: 'text' },
        { k: 'kw', l: 'kW', t: 'number' },
        { k: 'type', l: 'Tipo', t: 'select', opts: ['on-grid', 'hybrid', 'off-grid'] },
        { k: 'vocMax', l: 'Vdc_max (V)', t: 'number' },
        { k: 'mpptVmin', l: 'MPPT min (V)', t: 'number' },
        { k: 'mpptVmax', l: 'MPPT max (V)', t: 'number' },
        { k: 'idcMax', l: 'Idc_max (A)', t: 'number' },
        { k: 'mpptCount', l: '# MPPT', t: 'number' },
        { k: 'price', l: 'Precio COP', t: 'number' },
      ]} />
      {showCEC && <CECImportModal type="inverter" ss={ss} onClose={() => setShowCEC(false)} onImport={onImport} />}
    </div>
  );
}

export default function BackOffice({ tab, setTab, panels, uP, inverters, uI, batteries, uB, pricing, uPr, operators, uOp, quotes, installers }) {
  const ss = {
    wrap: { display: 'flex', minHeight: 'calc(100vh - 54px)' },
    side: { width: 185, background: '#08151e', borderRight: `1px solid ${C.border}`, padding: '12px 8px', flexShrink: 0 },
    main: { flex: 1, padding: '20px 24px', overflowY: 'auto' },
    card: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px 20px', marginBottom: 12 },
    h2: { fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 14px' },
    lbl: { display: 'block', fontSize: 10, color: C.muted, marginBottom: 3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 },
    inp: { width: '100%', background: C.dark, border: `1px solid ${C.border}`, borderRadius: 5, padding: '6px 9px', color: C.text, fontSize: 12, boxSizing: 'border-box' },
    btn: { padding: '6px 14px', background: C.teal, color: '#fff', border: 'none', borderRadius: 5, fontWeight: 600, cursor: 'pointer', fontSize: 11 },
    del: { padding: '4px 9px', background: 'transparent', color: '#f87171', border: '1px solid #f8717133', borderRadius: 4, cursor: 'pointer', fontSize: 10 },
    th: { padding: '5px 8px', textAlign: 'left', color: C.muted, borderBottom: `1px solid ${C.border}`, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 500 },
    td: { padding: '7px 8px', borderBottom: `1px solid ${C.border}22`, color: C.text, fontSize: 11 },
    stat: { background: C.dark, border: `1px solid ${C.border}`, borderRadius: 7, padding: '11px 13px' },
  };

  const NAV = [['dashboard', '◈', 'Dashboard'], ['operators', '🌐', 'Operadores Red'], ['panels', '⬛', 'Paneles'], ['inverters', '⚡', 'Inversores'], ['batteries', '◉', 'Baterías'], ['pricing', '◆', 'Precios'], ['quotes', '☰', 'Cotizaciones'], ['installers', '🔧', 'Instaladores']];

  const tot = quotes.length, nv = quotes.filter(q => q.status === 'nuevo').length;
  const kp = quotes.reduce((s, q) => s + parseFloat(q.results?.actKwp || 0), 0).toFixed(1);
  const pl = quotes.reduce((s, q) => s + (q.budget?.tot || 0), 0);

  return (
    <div style={ss.wrap}>
      <aside style={ss.side}>
        <div style={{ padding: '0 4px 10px', borderBottom: `1px solid ${C.border}`, marginBottom: 10 }}>
          <img src={logo} alt="ALEBAS" style={{ height: 28, borderRadius: 3 }} />
        </div>
        {NAV.map(([id, ic, l]) => (
          <div key={id} onClick={() => setTab(id)} style={{ padding: '7px 10px', borderRadius: 5, cursor: 'pointer', marginBottom: 2, fontSize: 11, display: 'flex', alignItems: 'center', gap: 7, background: tab === id ? `${C.teal}22` : 'transparent', color: tab === id ? C.teal : C.muted, fontWeight: tab === id ? 600 : 400, borderLeft: tab === id ? `2px solid ${C.teal}` : '2px solid transparent' }}>
            <span style={{ fontSize: 12 }}>{ic}</span>{l}
          </div>
        ))}
        <div style={{ padding: '20px 8px 0', fontSize: 9, color: C.muted, lineHeight: 2 }}>
          <div style={{ fontWeight: 600, color: C.teal, marginBottom: 1 }}>ALEBAS Ingeniería SAS</div>
          <div>NIT 901.992.450-5</div>
          <div style={{ color: C.teal }}>info@alebas.co</div>
          <div>Villavicencio, Meta</div>
        </div>
      </aside>
      <main style={ss.main}>
        {tab === 'dashboard' && (
          <div>
            <div style={ss.h2}>Dashboard</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 9, marginBottom: 16 }}>
              {[['Cotizaciones', tot, C.teal], ['Sin procesar', nv, C.yellow], ['kWp cotizados', kp, '#fff'], ['Pipeline', `$${fmt(pl / 1e6)}M`, C.teal]].map(([l, v, col]) => (
                <div key={l} style={ss.stat}><div style={{ fontSize: 9, color: C.muted, marginBottom: 4, textTransform: 'uppercase' }}>{l}</div><div style={{ fontSize: 18, fontWeight: 700, color: col }}>{v}</div></div>
              ))}
            </div>
            <div style={ss.card}>
              <div style={{ fontWeight: 600, color: '#fff', marginBottom: 11, fontSize: 13 }}>Últimas cotizaciones</div>
              {quotes.length === 0 ? <div style={{ color: C.muted, textAlign: 'center', padding: '24px', fontSize: 12 }}>El cotizador generará leads aquí automáticamente.</div> : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>{['Fecha', 'Cliente', 'Operador', 'Sistema', 'kWp', 'Inversión'].map(h => <th key={h} style={ss.th}>{h}</th>)}</tr></thead>
                  <tbody>{quotes.slice(0, 6).map(q => (
                    <tr key={q.id}><td style={ss.td}>{q.date}</td><td style={ss.td}>{q.name}</td><td style={ss.td}>{q.operator || '—'}</td><td style={ss.td}>{q.systemType}</td><td style={ss.td}>{q.results?.actKwp}</td><td style={ss.td}>{q.budget ? fmtCOP(q.budget.tot) : '—'}</td></tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          </div>
        )}
        {tab === 'panels' && <PanelsTab panels={panels} uP={uP} ss={ss} />}
        {tab === 'inverters' && <InvertersTab inverters={inverters} uI={uI} ss={ss} />}
        {tab === 'batteries' && <EqMgr title="Baterías" items={batteries} upd={uB} fields={[{ k: 'brand', l: 'Marca', t: 'text' }, { k: 'model', l: 'Modelo', t: 'text' }, { k: 'kwh', l: 'kWh', t: 'number' }, { k: 'price', l: 'Precio COP', t: 'number' }]} ss={ss} />}
        {tab === 'pricing' && <PriceMgr pricing={pricing} upd={uPr} ss={ss} />}
        {tab === 'operators' && <OperatorsMgr operators={operators} upd={uOp} ss={ss} />}
        {tab === 'quotes' && <QuotesMgr quotes={quotes} ss={ss} />}
        {tab === 'installers' && <InstallersMgr installers={installers} ss={ss} />}
      </main>
    </div>
  );
}

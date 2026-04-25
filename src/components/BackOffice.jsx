import React, { useState } from 'react';
import logo from '../logo.png';
import { C, fmt, fmtCOP } from '../constants';

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

export default function BackOffice({ tab, setTab, panels, uP, inverters, uI, batteries, uB, pricing, uPr, quotes, installers }) {
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

  const NAV = [['dashboard', '◈', 'Dashboard'], ['panels', '⬛', 'Paneles'], ['inverters', '⚡', 'Inversores'], ['batteries', '◉', 'Baterías'], ['pricing', '◆', 'Precios'], ['quotes', '☰', 'Cotizaciones'], ['installers', '🔧', 'Instaladores']];

  const tot = quotes.length, nv = quotes.filter(q => q.status === 'nuevo').length;
  const kp = quotes.reduce((s, q) => s + parseFloat(q.results?.actKwp || 0), 0).toFixed(1);
  const pl = quotes.reduce((s, q) => s + (q.budget?.tot || 0), 0);

  return (
    <div style={ss.wrap}>
      <aside style={ss.side}>
        <div style={{ padding: '0 4px 10px', borderBottom: `1px solid ${C.border}`, marginBottom: 10 }}>
          <div style={{ lineHeight: 1 }}>
            <div style={{ fontFamily: 'system-ui', fontWeight: 900, fontSize: 14, letterSpacing: '-0.5px', color: '#fff' }}>SOLAR</div>
            <div style={{ fontFamily: 'system-ui', fontWeight: 300, fontSize: 14, letterSpacing: '4px', color: '#FF8C00' }}>HUB</div>
          </div>
        </div>
        {NAV.map(([id, ic, l]) => (
          <div key={id} onClick={() => setTab(id)} style={{ padding: '7px 10px', borderRadius: 5, cursor: 'pointer', marginBottom: 2, fontSize: 11, display: 'flex', alignItems: 'center', gap: 7, background: tab === id ? `${C.teal}22` : 'transparent', color: tab === id ? C.teal : C.muted, fontWeight: tab === id ? 600 : 400, borderLeft: tab === id ? `2px solid ${C.teal}` : '2px solid transparent' }}>
            <span style={{ fontSize: 12 }}>{ic}</span>{l}
          </div>
        ))}
        <div style={{ padding: '20px 8px 0', fontSize: 9, color: C.muted, lineHeight: 2 }}>
          <div style={{ fontWeight: 600, color: '#FF8C00', marginBottom: 1 }}>SolarHub · ALEBAS Ingeniería SAS</div>
          <div>NIT 901.992.450-5</div>
          <div style={{ color: '#FF8C00' }}>info@alebas.co</div>
          <div>solar-hub.co</div>
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
        {tab === 'panels' && <EqMgr title="Paneles solares" items={panels} upd={uP} fields={[{ k: 'brand', l: 'Marca', t: 'text' }, { k: 'model', l: 'Modelo', t: 'text' }, { k: 'wp', l: 'Wp', t: 'number' }, { k: 'price', l: 'Precio COP', t: 'number' }]} ss={ss} />}
        {tab === 'inverters' && <EqMgr title="Inversores" items={inverters} upd={uI} fields={[{ k: 'brand', l: 'Marca', t: 'text' }, { k: 'model', l: 'Modelo', t: 'text' }, { k: 'kw', l: 'kW', t: 'number' }, { k: 'type', l: 'Tipo', t: 'select', opts: ['on-grid', 'hybrid', 'off-grid'] }, { k: 'price', l: 'Precio COP', t: 'number' }]} ss={ss} />}
        {tab === 'batteries' && <EqMgr title="Baterías" items={batteries} upd={uB} fields={[{ k: 'brand', l: 'Marca', t: 'text' }, { k: 'model', l: 'Modelo', t: 'text' }, { k: 'kwh', l: 'kWh', t: 'number' }, { k: 'price', l: 'Precio COP', t: 'number' }]} ss={ss} />}
        {tab === 'pricing' && <PriceMgr pricing={pricing} upd={uPr} ss={ss} />}
        {tab === 'quotes' && <QuotesMgr quotes={quotes} ss={ss} />}
        {tab === 'installers' && <InstallersMgr installers={installers} ss={ss} />}
      </main>
    </div>
  );
}

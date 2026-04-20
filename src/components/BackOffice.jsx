import React, { useState } from 'react';
import logo from '../logo.svg';
import { C, fmt, fmtCOP, OPERATORS, splitCU, excedentePriceFor } from '../constants';
import { fetchAgentsList, fetchSpotPrice } from '../services/xm';
import { searchCECPanels, searchCECInverters } from '../services/cec';
import { searchBatteries } from '../services/batteries';
import { fetchTRM } from '../services/trm';
import { fetchLoadsCatalog, DEFAULT_LOADS_CATALOG, invalidateLoadsCache } from '../services/loads';
import { n8nConfigured, n8nBaseUrl } from '../services/n8n';

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
  const [trmData, setTrmData] = useState(null);
  const [trmLoading, setTrmLoading] = useState(false);

  React.useEffect(() => {
    setTrmLoading(true);
    fetchTRM().then(d => setTrmData(d)).catch(() => {}).finally(() => setTrmLoading(false));
  }, []);

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
      {/* TRM widget */}
      <div style={{ background: `${C.teal}10`, border: `1px solid ${C.teal}33`, borderRadius: 7, padding: '9px 14px', marginBottom: 13, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>TRM (COP/USD)</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.yellow }}>
            {trmLoading ? '…' : trmData?.cop_per_usd ? `$${fmt(trmData.cop_per_usd)}` : '—'}
          </div>
        </div>
        {trmData && (
          <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.7 }}>
            <div>Vigencia: {trmData.date}</div>
            <div>Fuente: {trmData.source}</div>
            <div style={{ color: C.teal }}>Actualiza precios en USD → precio panel / TRM = precio COP</div>
          </div>
        )}
      </div>
      <div style={{ background: `${C.teal}08`, border: `1px solid ${C.border}`, borderRadius: 7, padding: '9px 12px', marginBottom: 13, fontSize: 11, color: C.muted }}>
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
  const [manualSpot, setManualSpot] = useState(() => {
    try { const v = localStorage.getItem('xm:manualSpot'); return v ? JSON.parse(v) : null; } catch { return null; }
  });
  const [editingSpot, setEditingSpot] = useState(false);
  const [spotInput, setSpotInput] = useState('');

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

  const isLocalDev = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(window.location.hostname);

  const syncXM = async () => {
    if (isLocalDev) {
      setSyncStatus({ warn: 'local-dev' });
      return;
    }
    if (!n8nConfigured()) {
      setSyncStatus({ warn: 'not-configured' });
      return;
    }
    setSyncStatus({ loading: true });
    try {
      const data = await fetchAgentsList();
      if (data?.ok === false) {
        setSyncStatus({ warn: 'error', msg: data.error || data.reason || 'no disponible', baseUrl: n8nBaseUrl() });
        return;
      }
      const total = data.operators?.length ?? 0;
      if (!total) {
        setSyncStatus({
          warn: 'zero',
          rawPreview: data.rawPreview,
          syncedAt: data.syncedAt,
        });
        return;
      }
      const xmCodes = new Set(data.operators.map(o => o.sic).filter(Boolean));
      const matched = operators.filter(o => o.sic && xmCodes.has(o.sic)).length;
      setSyncStatus({ ok: true, total, matched, syncedAt: data.syncedAt, cached: data.cached, filterWarning: !data.activityFilterWorked });
    } catch (err) {
      const isNetwork = /Failed to fetch|NetworkError|AbortError|aborted/i.test(err.message || '');
      setSyncStatus({ warn: 'error', msg: err.message, baseUrl: n8nBaseUrl(), network: isNetwork });
    }
  };

  const syncSpot = async () => {
    try {
      const p = await fetchSpotPrice(30);
      if (p?.ok === false) {
        setSpot({ error: p.error || p.reason });
        return;
      }
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
          ✓ XM sync · {syncStatus.matched}/{operators.filter(o => o.sic).length} OR locales validados · {syncStatus.total} agentes XM {syncStatus.cached ? '(caché)' : ''} · {new Date(syncStatus.syncedAt).toLocaleString('es-CO')}
          {syncStatus.filterWarning && ' · Filtro actividad no detectó OR — incluidos todos los agentes.'}
        </div>
      )}
      {syncStatus?.warn === 'local-dev' && (
        <div style={{ background: `${C.yellow}15`, border: `1px solid ${C.yellow}44`, borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 11, color: C.yellow }}>
          ℹ Proxy XM no disponible en desarrollo local — los 20 operadores de la tabla son datos estáticos. Actualiza manualmente o despliega en Vercel.
        </div>
      )}
      {syncStatus?.warn === 'zero' && (
        <div style={{ background: `${C.yellow}15`, border: `1px solid ${C.yellow}44`, borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 11, color: C.yellow }}>
          ℹ XM ListadoAgentes no devolvió agentes en esta consulta — puede ser un cambio temporal de schema. La lista local de {operators.length} operadores permanece activa sin cambios.
          {syncStatus.rawPreview && <div style={{ marginTop: 5, fontFamily: 'monospace', fontSize: 9, color: C.muted, wordBreak: 'break-all' }}>Raw preview: {syncStatus.rawPreview}</div>}
        </div>
      )}
      {syncStatus?.warn === 'not-configured' && (
        <div style={{ background: `${C.yellow}15`, border: `1px solid ${C.yellow}44`, borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 11, color: C.yellow }}>
          ℹ Sync XM no configurado. Define <code>REACT_APP_N8N_BASE_URL</code> en Vercel → Settings → Environment Variables apuntando al webhook n8n (ej. <code>https://app.alebas.co/webhook</code>). La lista local de {operators.length} operadores permanece activa.
        </div>
      )}
      {syncStatus?.warn === 'error' && (
        <div style={{ background: `${C.yellow}15`, border: `1px solid ${C.yellow}44`, borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 11, color: C.yellow }}>
          <div>ℹ Sync XM no disponible: <strong>{syncStatus.msg}</strong>. La lista local permanece activa.</div>
          {syncStatus.baseUrl && (
            <div style={{ marginTop: 5, fontSize: 10, color: C.muted, wordBreak: 'break-all' }}>
              n8n: <code style={{ fontFamily: 'monospace' }}>{syncStatus.baseUrl}/xm-agents</code>
              {syncStatus.network && (
                <div style={{ marginTop: 3 }}>
                  Revisa: (1) workflow n8n activo, (2) CORS permite <code>{window.location.origin}</code>, (3) URL correcta, (4) DNS/SSL válido.
                </div>
              )}
            </div>
          )}
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

      {/* Precio bolsa manual — activo mientras la API XM no responde */}
      <div style={{ background: `${C.yellow}10`, border: `1px solid ${C.yellow}25`, borderRadius: 6, padding: '8px 12px', marginBottom: 10 }}>
        {!editingSpot ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontSize: 11, color: C.muted }}>
              $ Precio bolsa manual:{' '}
              {manualSpot
                ? <strong style={{ color: C.yellow }}>{manualSpot.cop_per_kwh} COP/kWh</strong>
                : <span style={{ color: C.muted, fontStyle: 'italic' }}>no definido — usado por AGPE si API falla</span>}
            </div>
            <button style={{ ...ss.btn, padding: '3px 10px', fontSize: 10 }} onClick={() => { setSpotInput(manualSpot?.cop_per_kwh || ''); setEditingSpot(true); }}>
              Editar
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="number" style={{ ...ss.inp, flex: 1, padding: '5px 8px', fontSize: 12 }}
              placeholder="Ej: 285.50" value={spotInput} onChange={e => setSpotInput(e.target.value)}
              autoFocus onKeyDown={e => { if (e.key === 'Enter') saveManualSpot(); if (e.key === 'Escape') setEditingSpot(false); }}
            />
            <span style={{ fontSize: 10, color: C.muted }}>COP/kWh</span>
            <button style={ss.btn} onClick={() => {
              const v = parseFloat(spotInput);
              if (!isNaN(v) && v > 0) {
                const d = { cop_per_kwh: v, source: 'manual', syncedAt: new Date().toISOString() };
                setManualSpot(d);
                try { localStorage.setItem('xm:manualSpot', JSON.stringify(d)); } catch {}
              }
              setEditingSpot(false);
            }}>Guardar</button>
            <button style={{ ...ss.btn, background: 'transparent', border: `1px solid ${C.border}`, color: C.muted }} onClick={() => setEditingSpot(false)}>✕</button>
          </div>
        )}
      </div>

      <div style={{ background: `${C.teal}10`, border: `1px solid ${C.teal}22`, borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
        Códigos SIC oficiales de XM (Sinergox). Tarifa CU (COP/kWh) = G + T + D + Cv + PR + R (CREG 091/2007). Los componentes se infieren de la tarifa plana con fracciones típicas N1 residencial hasta integrar PDFs mensuales por OR. Excedentes AGPE Menor se remuneran a CU − G (CREG 174/2021). PSH es estimación regional; PVGIS la sobreescribe en el cálculo.
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
                {fields.map(fl => {
                  if (fl.k === 'tariff') {
                    const cu = splitCU(op);
                    const exc = excedentePriceFor(op);
                    const tip = `CREG 091 (${cu.derived ? 'inferido' : 'explícito'}): G=${cu.G} · T=${cu.T} · D=${cu.D} · Cv=${cu.Cv} · PR=${cu.PR} · R=${cu.R}`;
                    return (
                      <td key={fl.k} style={ss.td} title={tip}>
                        <div>{op.tariff || cu.total || '—'}</div>
                        <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>exc: {exc} <span style={{ opacity: 0.6 }}>(CU−G)</span></div>
                      </td>
                    );
                  }
                  return <td key={fl.k} style={ss.td}>{op[fl.k] || '—'}</td>;
                })}
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

// Importador de baterías desde el catálogo curado (/api/batteries).
// Permite buscar por marca/modelo y filtrar por arquitectura (HV-stack/LV-48V).
function BatteryImportModal({ onClose, onImport, ss }) {
  const [q, setQ] = useState('');
  const [arch, setArch] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const doSearch = async () => {
    setLoading(true); setError(null);
    try {
      const data = await searchBatteries(q, arch, 50);
      setResults(data.items || []);
    } catch (e) {
      setError(e.message);
      setResults([]);
    }
    setLoading(false);
  };

  // Auto-búsqueda al abrir y cuando cambia el filtro de arquitectura.
  React.useEffect(() => { doSearch(); /* eslint-disable-next-line */ }, [arch]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 18, width: 720, maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Importar batería del catálogo</div>
          <button style={ss.del} onClick={onClose}>Cerrar</button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input style={{ ...ss.inp, flex: 1 }} placeholder="Buscar por marca/modelo (Pylontech, BYD, Huawei, Deye, Dyness...)" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && doSearch()} />
          <select style={{ ...ss.inp, maxWidth: 150, cursor: 'pointer' }} value={arch} onChange={e => setArch(e.target.value)}>
            <option value="">Todas las arquitecturas</option>
            <option value="HV-stack">HV stack</option>
            <option value="LV-48V">LV 48 V</option>
            <option value="LV-24V">LV 24 V</option>
          </select>
          <button style={ss.btn} onClick={doSearch}>Buscar</button>
        </div>
        {loading && <div style={{ color: C.muted, fontSize: 11, padding: 8 }}>Cargando...</div>}
        {error && <div style={{ color: '#f87171', fontSize: 11, padding: 8 }}>{error}</div>}
        {!loading && !error && results.length === 0 && <div style={{ color: C.muted, fontSize: 11, padding: 8 }}>Sin resultados.</div>}
        {results.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Marca', 'Modelo', 'Quím.', 'kWh', 'V', 'Arq.', 'Ciclos', ''].map(h => <th key={h} style={ss.th}>{h}</th>)}</tr></thead>
            <tbody>{results.map(b => (
              <tr key={b.id}>
                <td style={ss.td}>{b.brand}</td>
                <td style={ss.td}>{b.model}</td>
                <td style={ss.td}>{b.chemistry}</td>
                <td style={ss.td}>{b.kwh}</td>
                <td style={ss.td}>{b.v}</td>
                <td style={ss.td}>{b.arch}</td>
                <td style={ss.td}>{b.cycles}</td>
                <td style={ss.td}><button style={ss.btn} onClick={() => onImport(b)}>Importar</button></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function BatteriesTab({ batteries, uB, ss }) {
  const [showImp, setShowImp] = useState(false);
  const [justImported, setJustImported] = useState(null);
  const onImport = (b) => {
    const newBatt = {
      id: 'eq_' + Date.now(),
      brand: b.brand,
      model: b.model,
      kwh: b.kwh,
      v: b.v,
      chemistry: b.chemistry,
      arch: b.arch,
      cycles: b.cycles,
      dod: b.dod,
      warrantyYears: b.warrantyYears,
      kg: b.kgPerModule,
      price: 5500000, // admin debe ajustar precio local
      source: 'Catalog',
    };
    uB([...batteries, newBatt]);
    setJustImported(`${newBatt.brand} ${newBatt.model}`);
    setShowImp(false);
    setTimeout(() => setJustImported(null), 3500);
  };
  return (
    <div>
      {justImported && (
        <div style={{ background: `${C.green}15`, border: `1px solid ${C.green}33`, borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 11, color: C.green }}>
          ✓ Importada: <strong>{justImported}</strong>. Ajusta precio local antes de usar en el cotizador.
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button style={{ ...ss.btn, background: C.yellow, color: '#050d12' }} onClick={() => setShowImp(true)}>🔍 Importar del catálogo</button>
      </div>
      <EqMgr title="Baterías" items={batteries} upd={uB} ss={ss} fields={[
        { k: 'brand', l: 'Marca', t: 'text' },
        { k: 'model', l: 'Modelo', t: 'text' },
        { k: 'kwh', l: 'kWh', t: 'number' },
        { k: 'v', l: 'V nom.', t: 'number' },
        { k: 'arch', l: 'Arq.', t: 'text' },
        { k: 'chemistry', l: 'Quím.', t: 'text' },
        { k: 'price', l: 'Precio COP', t: 'number' },
      ]} />
      {showImp && <BatteryImportModal ss={ss} onClose={() => setShowImp(false)} onImport={onImport} />}
    </div>
  );
}

// Gestor de envíos de proveedores. Permite revisar los PDFs enviados,
// marcar estado y descargar el archivo. El data URL se almacena en
// localStorage — ideal para un flujo manual de revisión.
function SuppliersMgr({ suppliers, uSupp, ss }) {
  const setStatus = (id, status) => {
    uSupp(suppliers.map(s => s.id === id ? { ...s, status } : s));
  };
  const remove = (id) => {
    if (!window.confirm('¿Eliminar este envío?')) return;
    uSupp(suppliers.filter(s => s.id !== id));
  };
  return (
    <div>
      <div style={ss.h2}>Envíos de proveedores</div>
      <div style={ss.card}>
        {suppliers.length === 0 ? (
          <div style={{ color: C.muted, textAlign: 'center', padding: 24, fontSize: 12 }}>
            Aún no hay listas de precios enviadas. Comparte la URL de Proveedores con tus contactos.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Fecha', 'Empresa', 'Contacto', 'Categoría', 'PDF', 'Estado', ''].map(h => <th key={h} style={ss.th}>{h}</th>)}</tr></thead>
            <tbody>{suppliers.map(s => (
              <tr key={s.id}>
                <td style={ss.td}>{s.date}</td>
                <td style={ss.td}><div style={{ fontWeight: 600 }}>{s.company}</div><div style={{ fontSize: 10, color: C.muted }}>{s.email}</div></td>
                <td style={ss.td}>{s.contact}{s.phone ? <div style={{ fontSize: 10, color: C.muted }}>{s.phone}</div> : null}</td>
                <td style={ss.td}>{s.category}</td>
                <td style={ss.td}>
                  {s.fileData ? (
                    <a href={s.fileData} download={s.fileName} style={{ color: C.teal, textDecoration: 'none', fontSize: 11 }}>⬇ {s.fileName}</a>
                  ) : '—'}
                </td>
                <td style={ss.td}>
                  <select style={{ ...ss.inp, padding: '3px 6px', fontSize: 10 }} value={s.status} onChange={e => setStatus(s.id, e.target.value)}>
                    <option value="pendiente">Pendiente</option>
                    <option value="revisado">Revisado</option>
                    <option value="integrado">Integrado</option>
                    <option value="rechazado">Rechazado</option>
                  </select>
                </td>
                <td style={ss.td}><button style={ss.del} onClick={() => remove(s.id)}>Borrar</button></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
      {suppliers.some(s => s.notes) && (
        <div style={ss.card}>
          <div style={{ fontWeight: 600, color: '#fff', marginBottom: 8, fontSize: 12 }}>Notas de proveedores</div>
          {suppliers.filter(s => s.notes).map(s => (
            <div key={s.id} style={{ padding: '6px 0', borderBottom: `1px solid ${C.border}22`, fontSize: 11 }}>
              <div style={{ color: C.teal, fontWeight: 600 }}>{s.company} — {s.date}</div>
              <div style={{ color: C.muted, marginTop: 2 }}>{s.notes}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Cuadro de cargas — catálogo de referencia de consumos típicos para sistemas
// off-grid (usuarios sin recibo). Primario: n8n /webhook/loads-catalog;
// fallback: lista local DEFAULT_LOADS_CATALOG. Cambios aquí sólo afectan la
// sesión local + caché (no persisten al backend remoto).
function LoadsTab({ catalog, source, setCatalog, setSource, ss }) {
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const uuid = () => `lc_${Math.random().toString(36).slice(2, 10)}`;

  const sync = async () => {
    setSyncing(true); setSyncMsg('');
    try {
      invalidateLoadsCache();
      const d = await fetchLoadsCatalog();
      if (Array.isArray(d?.items) && d.items.length) {
        setCatalog && setCatalog(d.items);
        setSource && setSource(d.source || 'n8n');
        setSyncMsg(`✓ ${d.items.length} cargas cargadas (${d.source || 'n8n'})`);
      } else {
        setSyncMsg('⚠ respuesta vacía — manteniendo catálogo local');
      }
    } catch (e) {
      setSyncMsg(`⚠ ${e?.message || 'error'} — usando catálogo local`);
    }
    setSyncing(false);
  };

  const items = Array.isArray(catalog) && catalog.length ? catalog : DEFAULT_LOADS_CATALOG;

  const updateItem = (idx, key, val) => {
    const next = items.map((it, i) => i === idx ? { ...it, [key]: val } : it);
    setCatalog && setCatalog(next);
    setSource && setSource('custom');
  };
  const removeItem = (idx) => {
    const next = items.filter((_, i) => i !== idx);
    setCatalog && setCatalog(next);
    setSource && setSource('custom');
  };
  const addItem = () => {
    setCatalog && setCatalog([...items, { id: uuid(), name: '', watts: 0, hours: 0, qty: 1, category: '' }]);
    setSource && setSource('custom');
  };
  const resetLocal = () => {
    setCatalog && setCatalog(DEFAULT_LOADS_CATALOG);
    setSource && setSource('local-default');
  };

  return (
    <div>
      <div style={ss.h2}>Cuadro de cargas — catálogo de referencia</div>
      <div style={ss.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
            Fuente actual: <span style={{ color: C.teal, fontWeight: 700 }}>{source}</span>
            {' · '}
            {n8nConfigured()
              ? 'n8n configurado — puedes sincronizar desde el endpoint /webhook/loads-catalog.'
              : 'n8n no configurado — usando lista por defecto. Define REACT_APP_N8N_BASE_URL para habilitar sincronización remota.'}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={sync} disabled={syncing || !n8nConfigured()} style={{ ...ss.btn, opacity: (syncing || !n8nConfigured()) ? 0.5 : 1 }}>
              {syncing ? '⏳ Sincronizando…' : '↻ Sincronizar con n8n'}
            </button>
            <button type="button" onClick={resetLocal} style={{ ...ss.btn, background: 'transparent', border: `1px solid ${C.border}`, color: '#fff' }}>
              Restablecer por defecto
            </button>
            <button type="button" onClick={addItem} style={{ ...ss.btn, background: C.yellow, color: '#000' }}>+ Agregar carga</button>
          </div>
        </div>
        {syncMsg && <div style={{ fontSize: 11, color: syncMsg.startsWith('✓') ? C.teal : C.orange, marginBottom: 8 }}>{syncMsg}</div>}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead>
              <tr>
                {['Carga', 'Categoría', 'Watts', 'Horas/día', 'Cant. típica', 'kWh/día', ''].map(h => <th key={h} style={ss.th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => {
                const kwhDay = (Number(it.watts || 0) * Number(it.hours || 0) * Number(it.qty || 0)) / 1000;
                return (
                  <tr key={it.id || idx}>
                    <td style={ss.td}><input style={ss.inp} value={it.name || ''} onChange={e => updateItem(idx, 'name', e.target.value)} /></td>
                    <td style={ss.td}><input style={ss.inp} value={it.category || ''} onChange={e => updateItem(idx, 'category', e.target.value)} /></td>
                    <td style={ss.td}><input type="number" style={ss.inp} value={it.watts || 0} onChange={e => updateItem(idx, 'watts', Number(e.target.value))} /></td>
                    <td style={ss.td}><input type="number" step="0.1" style={ss.inp} value={it.hours || 0} onChange={e => updateItem(idx, 'hours', Number(e.target.value))} /></td>
                    <td style={ss.td}><input type="number" style={ss.inp} value={it.qty || 1} onChange={e => updateItem(idx, 'qty', Number(e.target.value))} /></td>
                    <td style={{ ...ss.td, color: C.teal, fontWeight: 600 }}>{kwhDay.toFixed(2)}</td>
                    <td style={ss.td}><button type="button" onClick={() => removeItem(idx)} style={ss.del}>×</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 10, fontSize: 10, color: C.muted, lineHeight: 1.6 }}>
          Esta tabla alimenta el botón <strong style={{ color: C.teal }}>+ cargas típicas</strong> del cotizador cuando el usuario marca sistema off-grid. Los primeros 6 ítems se usan como preset inicial.
        </div>
      </div>
    </div>
  );
}

export default function BackOffice({ tab, setTab, panels, uP, inverters, uI, batteries, uB, pricing, uPr, operators, uOp, quotes, installers, suppliers = [], uSupp, loadsCatalog = [], loadsSource = 'local-default', setLoadsCatalog, setLoadsSource }) {
  const [dashTrm, setDashTrm] = React.useState(null);
  React.useEffect(() => {
    fetchTRM().then(d => setDashTrm(d)).catch(() => {});
  }, []);

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

  const NAV = [['dashboard', '◈', 'Dashboard'], ['operators', '🌐', 'Operadores Red'], ['panels', '⬛', 'Paneles'], ['inverters', '⚡', 'Inversores'], ['batteries', '◉', 'Baterías'], ['loads', '📋', 'Cuadro de cargas'], ['pricing', '◆', 'Precios'], ['quotes', '☰', 'Cotizaciones'], ['installers', '🔧', 'Instaladores'], ['suppliers', '📄', 'Proveedores']];

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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 9, marginBottom: 16 }}>
              {[['Cotizaciones', tot, C.teal], ['Sin procesar', nv, C.yellow], ['kWp cotizados', kp, '#fff'], ['Pipeline', `$${fmt(pl / 1e6)}M`, C.teal]].map(([l, v, col]) => (
                <div key={l} style={ss.stat}><div style={{ fontSize: 9, color: C.muted, marginBottom: 4, textTransform: 'uppercase' }}>{l}</div><div style={{ fontSize: 18, fontWeight: 700, color: col }}>{v}</div></div>
              ))}
              <div style={ss.stat}>
                <div style={{ fontSize: 9, color: C.muted, marginBottom: 4, textTransform: 'uppercase' }}>TRM COP/USD</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.yellow }}>{dashTrm?.cop_per_usd ? `$${fmt(dashTrm.cop_per_usd)}` : '—'}</div>
                {dashTrm?.date && <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>{dashTrm.date}</div>}
              </div>
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
        {tab === 'batteries' && <BatteriesTab batteries={batteries} uB={uB} ss={ss} />}
        {tab === 'loads' && <LoadsTab catalog={loadsCatalog} source={loadsSource} setCatalog={setLoadsCatalog} setSource={setLoadsSource} ss={ss} />}
        {tab === 'pricing' && <PriceMgr pricing={pricing} upd={uPr} ss={ss} />}
        {tab === 'operators' && <OperatorsMgr operators={operators} upd={uOp} ss={ss} />}
        {tab === 'quotes' && <QuotesMgr quotes={quotes} ss={ss} />}
        {tab === 'installers' && <InstallersMgr installers={installers} ss={ss} />}
        {tab === 'suppliers' && <SuppliersMgr suppliers={suppliers} uSupp={uSupp} ss={ss} />}
      </main>
    </div>
  );
}

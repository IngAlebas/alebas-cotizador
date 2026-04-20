import React, { useState } from 'react';
import logo from '../logo.png';
import {
  C, fmt, fmtCOP, OPERATORS, DEPTS, DESTINOS_COURIER, INTER_ZONAS,
  calcSystem, calcTransport, calcBudget, autoInverter
} from '../constants';

const Q0 = {
  systemType: 'on-grid', monthlyKwh: '', operatorId: 0,
  panelId: '', battId: '', battQty: 2,
  transportZone: 'N1', dept: 'Meta', address: '',
  availableArea: '',
  name: '', company: '', phone: '', email: '',
};

const STEPS = ['Tipo', 'Consumo', 'Transporte', 'Contacto', 'Resultado'];

export default function Quoter({ panels, inverters, batteries, pricing, addQuote }) {
  const [step, setStep] = useState(0);
  const [f, setF] = useState(Q0);
  const [res, setRes] = useState(null);
  const [bgt, setBgt] = useState(null);
  const [done, setDone] = useState(false);
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));

  const panel = panels.find(p => p.id === f.panelId) || panels[0];
  const batt = batteries.find(b => b.id === f.battId) || batteries[0];
  const operator = OPERATORS[f.operatorId] || OPERATORS[0];
  const psh = operator.psh;
  const needsB = f.systemType !== 'on-grid';

  const dest = DESTINOS_COURIER.find(d => d.dept === f.dept) || DESTINOS_COURIER[0];

  const calculate = () => {
    const kwh = parseFloat(f.monthlyKwh);
    if (!kwh) return;
    const inv = autoInverter((kwh / 30) / (psh * 0.78), f.systemType, inverters);
    const sys = calcSystem(kwh, panel, inv.kw, needsB ? batt : null, needsB ? f.battQty : 0, psh);
    const inv2 = autoInverter(sys.actKwp, f.systemType, inverters);
    const transport = calcTransport(INTER_ZONAS, dest.zona, sys.kgTotal, 0);
    const budget = calcBudget(sys, panel, inv2, needsB ? batt : null, needsB ? f.battQty : 0, pricing, transport.total);
    const annualSav = Math.round(sys.ap * operator.tariff);
    const roi = parseFloat((budget.tot / annualSav).toFixed(1));
    setRes({ ...sys, inv: inv2 });
    setBgt({ ...budget, sav: annualSav, roi, transport: transport.total });
  };

  const submit = () => {
    addQuote({
      id: Date.now(), date: new Date().toLocaleDateString('es-CO'),
      name: f.name, company: f.company, email: f.email, phone: f.phone,
      address: f.address, city: f.dept, operator: operator.name,
      systemType: f.systemType, monthlyKwh: f.monthlyKwh,
      panel, results: res, budget: bgt, status: 'nuevo',
    });
    setDone(true);
  };

  const ss = {
    wrap: { maxWidth: 680, margin: '0 auto', padding: '20px 14px' },
    card: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 22px', marginBottom: 12 },
    h2: { fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 14px' },
    lbl: { display: 'block', fontSize: 10, color: C.muted, marginBottom: 3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 },
    inp: { width: '100%', background: C.dark, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 11px', color: C.text, fontSize: 13, boxSizing: 'border-box' },
    btn: { padding: '10px 24px', background: C.teal, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 },
    ghost: { padding: '9px 18px', background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 7, cursor: 'pointer', fontSize: 12 },
    stat: { background: C.dark, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px' },
  };

  const Prog = () => (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        {STEPS.map((_, i) => <div key={i} style={{ flex: 1, height: 3, borderRadius: 3, background: i < step ? C.teal : i === step ? C.teal + '66' : C.border }} />)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        {STEPS.map((s, i) => <span key={i} style={{ fontSize: 9, color: i <= step ? C.teal : C.muted, fontWeight: i === step ? 700 : 400 }}>{s}</span>)}
      </div>
    </div>
  );

  // STEP 0: Welcome
  if (step === 0) return (
    <div style={ss.wrap}>
      <div style={{ ...ss.card, textAlign: 'center', padding: '44px 22px', borderColor: C.teal }}>
        <img src={logo} alt="ALEBAS" style={{ height: 60, borderRadius: 6, marginBottom: 14 }} />
        <div style={{ color: C.teal, fontSize: 11, letterSpacing: 3, marginBottom: 18, fontWeight: 600 }}>COTIZADOR SOLAR FOTOVOLTAICO</div>
        <div style={{ color: C.muted, fontSize: 14, maxWidth: 400, margin: '0 auto 22px', lineHeight: 1.7 }}>
          Pre-dimensionamiento profesional de tu sistema fotovoltaico. Resultado inmediato con precios reales del mercado colombiano.
        </div>
        <div style={{ display: 'flex', gap: 7, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 24 }}>
          {['✓ 17 operadores de red', '✓ RETIE + CREG 174/2021', '✓ Transporte Interrapidísimo'].map(t => (
            <span key={t} style={{ background: `${C.teal}15`, border: `1px solid ${C.teal}44`, borderRadius: 20, padding: '4px 12px', fontSize: 11, color: C.teal }}>{t}</span>
          ))}
        </div>
        <button style={{ ...ss.btn, fontSize: 14, padding: '13px 36px' }} onClick={() => setStep(1)}>Calcular mi sistema solar →</button>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        {[['☀', 'On-Grid', 'Conectado a red. Reduce factura hasta 90%.'], ['⚡', 'Híbrido', 'Baterías + red. Producción continua.'], ['🌿', 'Off-Grid', '100% autónomo. Sin red eléctrica.']].map(([ic, t, d]) => (
          <div key={t} style={{ ...ss.card, flex: 1, textAlign: 'center', padding: '16px 11px' }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>{ic}</div>
            <div style={{ fontWeight: 700, color: C.teal, fontSize: 12, marginBottom: 4 }}>{t}</div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{d}</div>
          </div>
        ))}
      </div>
    </div>
  );

  // STEP 1: System type
  if (step === 1) return (
    <div style={ss.wrap}><Prog />
      <div style={ss.card}>
        <div style={ss.h2}>Tipo de sistema</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {[['on-grid', '☀', 'On-Grid', 'Red eléctrica'], ['hybrid', '⚡', 'Híbrido', 'Con baterías'], ['off-grid', '🌿', 'Off-Grid', 'Autónomo']].map(([id, ic, t, sub]) => (
            <div key={id} onClick={() => u('systemType', id)} style={{ flex: 1, padding: '16px 10px', textAlign: 'center', borderRadius: 9, cursor: 'pointer', border: `2px solid ${f.systemType === id ? C.teal : C.border}`, background: f.systemType === id ? `${C.teal}18` : 'transparent' }}>
              <div style={{ fontSize: 22, marginBottom: 5 }}>{ic}</div>
              <div style={{ fontWeight: 700, color: f.systemType === id ? C.teal : '#fff', fontSize: 12 }}>{t}</div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{sub}</div>
            </div>
          ))}
        </div>
        {needsB && (
          <div>
            <label style={ss.lbl}>Batería</label>
            <select style={{ ...ss.inp, marginBottom: 11, cursor: 'pointer' }} value={f.battId || batteries[0]?.id} onChange={e => u('battId', e.target.value)}>
              {batteries.map(b => <option key={b.id} value={b.id}>{b.brand} {b.model} — {b.kwh} kWh — {fmtCOP(b.price)}</option>)}
            </select>
            <label style={ss.lbl}>Número de baterías</label>
            <div style={{ display: 'flex', gap: 7 }}>
              {[1, 2, 3, 4, 6, 8].map(n => (
                <button key={n} onClick={() => u('battQty', n)} style={{ width: 38, height: 38, borderRadius: 6, border: `2px solid ${f.battQty === n ? C.teal : C.border}`, background: f.battQty === n ? `${C.teal}22` : 'transparent', color: f.battQty === n ? C.teal : '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>{n}</button>
              ))}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <button style={ss.btn} onClick={() => setStep(2)}>Siguiente →</button>
        </div>
      </div>
    </div>
  );

  // STEP 2: Consumption & operator
  if (step === 2) return (
    <div style={ss.wrap}><Prog />
      <div style={ss.card}>
        <div style={ss.h2}>Consumo y operador de red</div>
        <div style={{ marginBottom: 13 }}>
          <label style={ss.lbl}>Consumo mensual (kWh) — del recibo de energía</label>
          <input type="number" style={ss.inp} placeholder="Ej: 450" value={f.monthlyKwh} onChange={e => u('monthlyKwh', e.target.value)} />
          <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>Busca "Energía activa" o "kWh consumidos" en tu factura</div>
        </div>
        <div style={{ marginBottom: 13 }}>
          <label style={ss.lbl}>Operador de red / empresa de energía</label>
          <select style={{ ...ss.inp, cursor: 'pointer' }} value={f.operatorId} onChange={e => u('operatorId', parseInt(e.target.value))}>
            {OPERATORS.map((op, i) => <option key={i} value={i}>{op.name}{op.region ? ` — ${op.region}` : ''}</option>)}
          </select>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>
            Tarifa: <span style={{ color: C.teal }}>{operator.tariff} COP/kWh</span> · PSH: <span style={{ color: C.teal }}>{operator.psh} h/día</span>
          </div>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={ss.lbl}>Panel solar</label>
          <select style={{ ...ss.inp, cursor: 'pointer' }} value={f.panelId || panels[0]?.id} onChange={e => u('panelId', e.target.value)}>
            {panels.map(p => <option key={p.id} value={p.id}>{p.brand} {p.model} — {p.wp} Wp — {fmtCOP(p.price)}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={ss.lbl}>Área disponible para paneles (m²) — opcional</label>
          <input type="number" style={ss.inp} placeholder="Ej: 60" value={f.availableArea} onChange={e => u('availableArea', e.target.value)} />
          <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>Si la conoces, validamos cuánto de tu consumo puede cubrir tu techo</div>
        </div>
        {f.monthlyKwh && (() => {
          const reqKwp = (parseFloat(f.monthlyKwh) / 30) / (psh * 0.78);
          const reqPanels = Math.ceil(reqKwp * 1000 / panel.wp);
          const reqArea = reqPanels * 2.2;
          const area = parseFloat(f.availableArea);
          const hasArea = !!area && area > 0;
          const enough = hasArea ? area >= reqArea : null;
          const maxPanels = hasArea ? Math.floor(area / 2.2) : 0;
          const maxKwp = hasArea ? (maxPanels * panel.wp / 1000) : 0;
          const maxCov = hasArea && reqPanels > 0 ? Math.min(Math.round((maxPanels / reqPanels) * 100), 100) : 0;
          const col = enough === null ? C.teal : enough ? C.green : C.orange;
          return (
            <div style={{ background: `${col}12`, border: `1px solid ${col}33`, borderRadius: 7, padding: '10px 13px', marginTop: 10, fontSize: 12 }}>
              <div>
                <span style={{ color: C.muted }}>Estimado: </span>
                <strong style={{ color: C.teal }}>{reqKwp.toFixed(2)} kWp</strong>
                <span style={{ color: C.muted }}> · {reqPanels} paneles · ~{reqArea.toFixed(0)} m² · {operator.name}</span>
              </div>
              {hasArea && (
                <div style={{ marginTop: 6, fontSize: 11, color: enough ? C.green : C.orange }}>
                  {enough
                    ? `✓ Tus ${area} m² alcanzan para cubrir el 100% del consumo`
                    : `⚠ Tus ${area} m² permiten máx. ${maxPanels} paneles (${maxKwp.toFixed(2)} kWp) — cubre ~${maxCov}% del consumo`}
                </div>
              )}
            </div>
          );
        })()}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}>
          <button style={ss.ghost} onClick={() => setStep(1)}>← Atrás</button>
          <button style={{ ...ss.btn, opacity: !f.monthlyKwh ? 0.4 : 1 }} onClick={() => { if (f.monthlyKwh) setStep(3); }}>Siguiente →</button>
        </div>
      </div>
    </div>
  );

  // STEP 3: Transport
  if (step === 3) return (
    <div style={ss.wrap}><Prog />
      <div style={ss.card}>
        <div style={ss.h2}>Departamento de instalación</div>
        <div style={{ marginBottom: 14 }}>
          <label style={ss.lbl}>Departamento destino</label>
          <select style={{ ...ss.inp, cursor: 'pointer' }} value={f.dept} onChange={e => u('dept', e.target.value)}>
            {DESTINOS_COURIER.map(d => <option key={d.dept} value={d.dept}>{d.dept} — {d.capital} ({d.tiempo})</option>)}
          </select>
        </div>
        {dest && (
          <div style={{ background: `${C.teal}12`, border: `1px solid ${C.teal}33`, borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 11, color: C.muted }}>Zona Interrapidísimo:</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.teal }}>{INTER_ZONAS[dest.zona]?.label}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 11, color: C.muted }}>Tiempo de entrega:</span>
              <span style={{ fontSize: 11, color: '#fff' }}>{dest.tiempo}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: C.muted }}>Distancia aprox. desde Bogotá:</span>
              <span style={{ fontSize: 11, color: '#fff' }}>~{dest.km} km</span>
            </div>
          </div>
        )}
        <div style={{ fontSize: 10, color: C.muted, background: C.dark, borderRadius: 6, padding: '9px 12px' }}>
          📦 El costo de transporte vía Interrapidísimo se incluye en el presupuesto Sección B. Tarifas vigentes jul 2025 – jul 2026.
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}>
          <button style={ss.ghost} onClick={() => setStep(2)}>← Atrás</button>
          <button style={ss.btn} onClick={() => setStep(4)}>Siguiente →</button>
        </div>
      </div>
    </div>
  );

  // STEP 4: Contact
  if (step === 4) return (
    <div style={ss.wrap}><Prog />
      <div style={ss.card}>
        <div style={ss.h2}>Datos de contacto</div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 11 }}>
          <div style={{ flex: 1 }}><label style={ss.lbl}>Nombre *</label><input style={ss.inp} value={f.name} onChange={e => u('name', e.target.value)} placeholder="Nombre completo" /></div>
          <div style={{ flex: 1 }}><label style={ss.lbl}>Empresa / Predio</label><input style={ss.inp} value={f.company} onChange={e => u('company', e.target.value)} placeholder="Empresa o predio" /></div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 11 }}>
          <div style={{ flex: 1 }}><label style={ss.lbl}>Teléfono / WhatsApp *</label><input style={ss.inp} value={f.phone} onChange={e => u('phone', e.target.value)} placeholder="300 000 0000" /></div>
          <div style={{ flex: 1 }}><label style={ss.lbl}>Email *</label><input style={ss.inp} value={f.email} onChange={e => u('email', e.target.value)} placeholder="tu@email.com" /></div>
        </div>
        <div style={{ marginBottom: 14 }}><label style={ss.lbl}>Dirección / Municipio</label><input style={ss.inp} value={f.address} onChange={e => u('address', e.target.value)} placeholder="Municipio o dirección exacta" /></div>
        <div style={{ background: `${C.teal}10`, borderRadius: 6, padding: '8px 12px', marginBottom: 14, fontSize: 10, color: C.muted }}>🔒 Información confidencial. Solo usada por ingenieros ALEBAS para tu propuesta técnica.</div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button style={ss.ghost} onClick={() => setStep(3)}>← Atrás</button>
          <button style={{ ...ss.btn, opacity: (!f.name || !f.phone || !f.email) ? 0.4 : 1 }} onClick={() => { if (f.name && f.phone && f.email) { calculate(); setStep(5); } }}>
            Ver mi sistema →
          </button>
        </div>
      </div>
    </div>
  );

  // STEP 5: Results
  if (step === 5 && res && bgt) {
    if (done) return (
      <div style={ss.wrap}>
        <div style={{ ...ss.card, textAlign: 'center', padding: '52px 22px' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: `${C.teal}22`, border: `2px solid ${C.teal}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 14px', color: C.teal }}>✓</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 8 }}>¡Solicitud enviada!</div>
          <div style={{ color: C.muted, fontSize: 13, maxWidth: 360, margin: '0 auto 18px', lineHeight: 1.7 }}>
            <strong style={{ color: '#fff' }}>{f.name}</strong>, un ingeniero ALEBAS te contactará al <strong style={{ color: C.teal }}>{f.phone}</strong> en menos de 24 horas.
          </div>
          <div style={{ background: C.dark, border: `1px solid ${C.border}`, borderRadius: 9, padding: '13px 20px', display: 'inline-block', marginBottom: 22, textAlign: 'left' }}>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 3, textTransform: 'uppercase' }}>Tu sistema estimado</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{res.actKwp} kWp — {res.numPanels} paneles</div>
            <div style={{ fontSize: 12, color: C.teal, marginTop: 2, fontWeight: 600 }}>Inversión aprox: {fmtCOP(bgt.tot)}</div>
          </div>
          <br />
          <button style={ss.btn} onClick={() => { setStep(0); setDone(false); setRes(null); setBgt(null); setF(Q0); }}>Nueva cotización</button>
        </div>
      </div>
    );

    return (
      <div style={ss.wrap}>
        <div style={{ ...ss.card, textAlign: 'center', padding: '22px', borderColor: C.teal }}>
          <div style={{ fontSize: 9, color: C.teal, letterSpacing: 3, fontWeight: 700, marginBottom: 5, textTransform: 'uppercase' }}>Pre-dimensionamiento</div>
          <div style={{ fontSize: 36, fontWeight: 800, color: '#fff', marginBottom: 3 }}>{res.actKwp} <span style={{ color: C.yellow }}>kWp</span></div>
          <div style={{ color: C.muted, fontSize: 12 }}>{f.systemType} · {operator.name} · PSH {psh} h/día · {f.dept}</div>
        </div>

        {(() => {
          const area = parseFloat(f.availableArea);
          if (!area || area <= 0) return null;
          const reqArea = res.roof;
          const enough = area >= reqArea;
          const maxPanels = Math.floor(area / 2.2);
          const maxKwp = parseFloat((maxPanels * panel.wp / 1000).toFixed(2));
          const maxMonthlyKwh = Math.round(maxKwp * psh * 0.78 * 30);
          const maxCov = Math.min(Math.round((maxMonthlyKwh / parseFloat(f.monthlyKwh)) * 100), 100);
          const col = enough ? C.green : C.orange;
          return (
            <div style={{ background: `${col}12`, border: `1px solid ${col}55`, borderRadius: 9, padding: '12px 16px', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: col, marginBottom: 6, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                {enough ? '✓ Área disponible suficiente' : '⚠ Área disponible limita el sistema'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: 11 }}>
                <div><div style={{ color: C.muted, fontSize: 9, textTransform: 'uppercase' }}>Disponible</div><div style={{ color: '#fff', fontWeight: 600 }}>{area} m²</div></div>
                <div><div style={{ color: C.muted, fontSize: 9, textTransform: 'uppercase' }}>Requerida (100%)</div><div style={{ color: '#fff', fontWeight: 600 }}>{reqArea} m²</div></div>
                <div><div style={{ color: C.muted, fontSize: 9, textTransform: 'uppercase' }}>Máx. por área</div><div style={{ color: col, fontWeight: 700 }}>{maxKwp} kWp · {maxCov}%</div></div>
              </div>
              {!enough && (
                <div style={{ fontSize: 10, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
                  Tu techo permite hasta <strong style={{ color: col }}>{maxPanels} paneles ({maxKwp} kWp)</strong>, que generan ~{fmt(maxMonthlyKwh)} kWh/mes — cubre el {maxCov}% de tu consumo de {f.monthlyKwh} kWh/mes. El sistema cotizado abajo asume cobertura completa; ajusta con un ingeniero ALEBAS si tu área es la limitante.
                </div>
              )}
            </div>
          );
        })()}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 9, marginBottom: 12 }}>
          {[['Paneles', res.numPanels, 'unidades'], ['Prod. mensual', fmt(res.mp), 'kWh/mes'], ['Cobertura', res.cov, '%'], ['Prod. anual', fmt(res.ap), 'kWh/año'], ['CO₂ evitado', fmt(res.co2), 'kg/año'], ['ROI', bgt.roi, 'años']].map(([l, v, u]) => (
            <div key={l} style={ss.stat}>
              <div style={{ fontSize: 9, color: C.muted, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.4 }}>{l}</div>
              <div style={{ fontSize: 19, fontWeight: 700, color: '#fff' }}>{v}</div>
              <div style={{ fontSize: 9, color: C.teal, marginTop: 1 }}>{u}</div>
            </div>
          ))}
        </div>

        <div style={ss.card}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 11 }}>▣ Preview del layout y strings</div>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 10 }}>
            Techo aprox. {res.roof} m² · {res.numPanels} paneles en {res.ns} string{res.ns > 1 ? 's' : ''} · {panel.wp} Wp c/u
          </div>
          <div style={{ background: C.dark, border: `1px dashed ${C.teal}55`, borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
            {Array.from({ length: res.ns }).map((_, sIdx) => {
              const remaining = res.numPanels - sIdx * res.ppss;
              const panelsInString = Math.min(res.ppss, remaining);
              const stringColors = [C.teal, C.yellow, '#4ade80', '#fb923c', '#a78bfa', '#f472b6'];
              const col = stringColors[sIdx % stringColors.length];
              return (
                <div key={sIdx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: sIdx < res.ns - 1 ? 7 : 0 }}>
                  <div style={{ fontSize: 9, color: col, fontWeight: 700, minWidth: 38, letterSpacing: 0.5 }}>ST{sIdx + 1}</div>
                  <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', flex: 1 }}>
                    {Array.from({ length: panelsInString }).map((_, pIdx) => (
                      <div key={pIdx} style={{ width: 16, height: 11, background: `${col}33`, border: `1px solid ${col}`, borderRadius: 2 }} />
                    ))}
                  </div>
                  <div style={{ fontSize: 9, color: C.muted, minWidth: 56, textAlign: 'right' }}>{panelsInString} paneles</div>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', flexWrap: 'wrap', padding: '4px 0 10px' }}>
            <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>DC</div>
            <div style={{ fontSize: 14, color: C.teal }}>→</div>
            <div style={{ background: `${C.teal}22`, border: `1px solid ${C.teal}`, borderRadius: 6, padding: '6px 11px', textAlign: 'center' }}>
              <div style={{ fontSize: 8, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 }}>Inversor</div>
              <div style={{ fontSize: 11, color: '#fff', fontWeight: 700, marginTop: 1 }}>{res.inv?.brand} {res.inv?.kw} kW</div>
            </div>
            <div style={{ fontSize: 14, color: C.teal }}>→</div>
            {needsB && (
              <>
                <div style={{ background: `${C.yellow}22`, border: `1px solid ${C.yellow}`, borderRadius: 6, padding: '6px 11px', textAlign: 'center' }}>
                  <div style={{ fontSize: 8, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 }}>Baterías</div>
                  <div style={{ fontSize: 11, color: '#fff', fontWeight: 700, marginTop: 1 }}>{f.battQty} × {batt.kwh} kWh</div>
                </div>
                <div style={{ fontSize: 14, color: C.teal }}>→</div>
              </>
            )}
            <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>AC · Carga</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {[
              ['Strings', `${res.ns} × ${res.ppss}`],
              ['Paneles', res.numPanels],
              ['DC/AC', res.dca],
              ['Área', `${res.roof} m²`],
            ].map(([l, v]) => (
              <div key={l} style={{ background: C.dark, borderRadius: 5, padding: '7px 8px', textAlign: 'center', border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 8, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 }}>{l}</div>
                <div style={{ fontSize: 12, color: C.teal, fontWeight: 700, marginTop: 2 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={ss.card}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 11 }}>⚡ Configuración técnica</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            {[
              ['Panel', `${panel.brand} ${panel.model}`], ['Potencia', `${panel.wp} Wp`],
              ['Inversor', `${res.inv?.brand} ${res.inv?.model}`], ['Potencia inv.', `${res.inv?.kw} kW`],
              ['Strings', `${res.ns} × ${res.ppss} paneles`], ['Ratio DC/AC', res.dca],
              ['Área techo', `${res.roof} m²`], ['Peso sistema', `${fmt(res.kgTotal)} kg`],
              ...(needsB ? [['Baterías', `${f.battQty} × ${batt.brand} ${batt.model}`], ['Cap. total', `${res.tB} kWh`], ['Autonomía', `${res.aut} h`]] : []),
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${C.border}22`, gap: 4 }}>
                <span style={{ fontSize: 10, color: C.muted }}>{k}</span>
                <span style={{ fontSize: 10, color: '#fff', fontWeight: 500, textAlign: 'right' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={ss.card}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 11 }}>◈ Presupuesto estimado</div>
          <div style={{ background: C.dark, borderRadius: 7, padding: '13px 14px', marginBottom: 11 }}>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 7, fontWeight: 600 }}>SECCIÓN A — Equipos (0% IVA, Ley 1715/2014)</div>
            {[['Paneles solares', bgt.pC], ['Inversor', bgt.iC], ...(needsB ? [['Baterías', bgt.bC]] : []), ['Subtotal A', bgt.sA]].map(([l, v], i, arr) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: i === arr.length - 1 ? 11 : 10 }}>
                <span style={{ color: i === arr.length - 1 ? '#fff' : C.muted }}>{l}</span>
                <span style={{ color: '#fff', fontWeight: i === arr.length - 1 ? 700 : 400 }}>{fmtCOP(v)}</span>
              </div>
            ))}
            <div style={{ borderTop: `1px solid ${C.teal}22`, margin: '8px 0' }} />
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 6, fontWeight: 600 }}>SECCIÓN B — Instalación y servicios (+{pricing.iva}% IVA)</div>
            {[['Estructura', bgt.st], ['Cableado', bgt.ca], ['Protecciones', bgt.pt], ['Instalación certificada', bgt.ins], ['Ingeniería y diseño', bgt.eng], ['Trámites ' + operator.name, bgt.emsa], ['Transporte Interrapidísimo', bgt.transport], ['IVA ' + pricing.iva + '%', bgt.iva], ['Subtotal B', bgt.sB]].map(([l, v], i, arr) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: i === arr.length - 1 ? 11 : 10 }}>
                <span style={{ color: i === arr.length - 1 ? '#fff' : C.muted }}>{l}</span>
                <span style={{ color: '#fff', fontWeight: i === arr.length - 1 ? 700 : 400 }}>{fmtCOP(v)}</span>
              </div>
            ))}
            <div style={{ borderTop: `1px solid ${C.teal}33`, paddingTop: 9, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <span style={{ fontWeight: 700, color: '#fff', fontSize: 14 }}>TOTAL ESTIMADO</span>
              <span style={{ color: C.yellow, fontWeight: 800, fontSize: 20 }}>{fmtCOP(bgt.tot)}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 9 }}>
            {[['Ahorro anual', fmtCOP(bgt.sav), C.teal], ['ROI', `${bgt.roi} años`, C.yellow], ['Transporte', fmtCOP(bgt.transport), C.gray]].map(([l, v, col]) => (
              <div key={l} style={{ ...ss.stat, flex: 1 }}><div style={{ fontSize: 9, color: C.muted }}>{l}</div><div style={{ fontSize: 13, fontWeight: 700, color: col, marginTop: 3 }}>{v}</div></div>
            ))}
          </div>
          <div style={{ fontSize: 9, color: C.muted, marginTop: 9, lineHeight: 1.5 }}>* Estimado sujeto a visita técnica. Incluye memorias RETIE, diagramas unifilares y trámites {operator.name}.</div>
        </div>

        <div style={{ textAlign: 'center', padding: '4px 0 28px' }}>
          <button style={{ ...ss.btn, fontSize: 14, padding: '13px 36px', marginBottom: 9 }} onClick={submit}>Solicitar propuesta detallada →</button>
          <div style={{ fontSize: 11, color: C.muted }}>Ingeniero ALEBAS te contacta en menos de 24h · info@alebas.co</div>
        </div>
      </div>
    );
  }
  return null;
}

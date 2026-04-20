import React, { useState, useEffect, useMemo } from 'react';
import logo from '../logo.png';
import {
  C, fmt, fmtCOP, DEPTS, DESTINOS_COURIER, INTER_ZONAS,
  calcSystem, calcTransport, calcBudget, selectCompatibleInverter,
  calcAGPEBenefit, MAX_KWP_AGPE, validateLayout,
  panelRoofAreaM2, DEFAULT_PACKING_FACTOR
} from '../constants';
import { fetchPVProduction } from '../services/pvgis';
import { fetchPVWatts } from '../services/pvwatts';
import { fetchNASAPower } from '../services/nasaPower';
import { fetchSpotPrice } from '../services/xm';
import { fetchTRM } from '../services/trm';
import { lookupRoof, solarConfigured } from '../services/solar';
import { aiRecommend, aiConfigured } from '../services/aiAssistant';
import { getApplicableNormativa } from '../data/normativa';

const Q0 = {
  systemType: 'on-grid', monthlyKwh: '', operatorId: 0,
  panelId: '', battId: '', battQty: 2,
  transportZone: 'N1', dept: 'Meta', address: '',
  availableArea: '', wantsExcedentes: false,
  name: '', company: '', phone: '', email: '',
  // Dimensionamiento de almacenamiento
  backupHours: 4,        // Horas de respaldo (Híbrido)
  autonomyDays: 1,       // Días sin sol (Off-grid)
  criticalPct: 50,       // % del consumo diario a respaldar (hybrid)
  busVoltage: 48,        // Tensión del bus DC de baterías
  battManual: false,     // true = usuario editó cantidad manualmente
  // Ubicación / área (Google Solar API vía n8n)
  lat: null, lon: null, roofLookupAt: null, roofLookupSource: null, roofLookupNotes: '',
  // Sombreado local derivado de Google Solar dataLayers (0-1; 1=sin sombra)
  shadeIndex: null, shadeSource: null,
};

const STEPS = ['Tipo', 'Consumo', 'Transporte', 'Contacto', 'Resultado'];

export default function Quoter({ panels, inverters, batteries, pricing, operators, addQuote }) {
  const [step, setStep] = useState(0);
  const [f, setF] = useState(Q0);
  const [res, setRes] = useState(null);
  const [bgt, setBgt] = useState(null);
  const [done, setDone] = useState(false);
  const [resultTab, setResultTab] = useState('resumen');
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));

  const panel = panels.find(p => p.id === f.panelId) || panels[0];
  const operator = operators[f.operatorId] || operators[0];
  const psh = operator.psh;
  const needsB = f.systemType !== 'on-grid';

  // Baterías compatibles con el voltaje del bus DC seleccionado.
  // Si ninguna coincide exactamente (p.ej. 51.2V LFP vs 48V nominal), caemos al catálogo completo.
  const battsForBus = batteries.filter(b => Math.round(b.voltage) === Math.round(f.busVoltage));
  const battPool = battsForBus.length ? battsForBus : batteries;
  const batt = battPool.find(b => b.id === f.battId) || battPool[0] || batteries[0];

  // kWh de respaldo requeridos por el usuario, según tipo de sistema.
  // Fórmula estándar: E = (consumo_diario × critico × horas_backup/24) / (DoD × eta_round_trip)
  // DoD 0.8 (LFP), eta 0.9 round-trip. Off-grid: horas = días × 24 y critico = 100%.
  const DoD = 0.8, eta = 0.9;
  const dailyKwh = f.monthlyKwh ? parseFloat(f.monthlyKwh) / 30 : 0;
  const hoursBackup = f.systemType === 'off-grid'
    ? (parseFloat(f.autonomyDays) || 0) * 24
    : (parseFloat(f.backupHours) || 0);
  const critPct = f.systemType === 'off-grid' ? 100 : (parseFloat(f.criticalPct) || 0);
  const criticalDailyKwh = dailyKwh * (critPct / 100);
  const backupKwh = criticalDailyKwh * (hoursBackup / 24);
  const requiredBankKwh = backupKwh > 0 ? backupKwh / (DoD * eta) : 0;
  const suggestedBattQty = (needsB && batt?.kwh > 0 && requiredBankKwh > 0)
    ? Math.max(1, Math.ceil(requiredBankKwh / batt.kwh))
    : 0;
  // Cuando el usuario no ha editado manualmente la cantidad, seguimos la sugerencia.
  useEffect(() => {
    if (!needsB) return;
    if (f.battManual) return;
    if (suggestedBattQty > 0 && suggestedBattQty !== f.battQty) {
      u('battQty', suggestedBattQty);
    }
  }, [needsB, suggestedBattQty, f.battManual]);

  const dest = DESTINOS_COURIER.find(d => d.dept === f.dept) || DESTINOS_COURIER[0];

  const [loadingPVGIS, setLoadingPVGIS] = useState(false);
  const [pvgisError, setPvgisError] = useState(null);
  const [xmError, setXmError] = useState(null);
  const [agpe, setAgpe] = useState(null);
  const [nasaData, setNasaData] = useState(null);
  const [pvwData, setPvwData] = useState(null);
  const [trm, setTrm] = useState(null);
  // Lookup de techo (Google Solar + Claude fallback vía n8n)
  const [roofQuery, setRoofQuery] = useState('');
  const [roofLoading, setRoofLoading] = useState(false);
  const [roofError, setRoofError] = useState(null);
  // Recomendación IA post-cálculo
  const [aiLoading, setAiLoading] = useState(false);
  const [aiData, setAiData] = useState(null);
  const [aiError, setAiError] = useState(null);

  const onLookupRoof = async () => {
    const q = (roofQuery || '').trim();
    if (!q) { setRoofError('Ingresa una dirección o ciudad'); return; }
    setRoofError(null); setRoofLoading(true);
    try {
      const r = await lookupRoof({ address: q });
      if (r.areaM2 != null && !Number.isNaN(r.areaM2)) u('availableArea', String(Math.round(r.areaM2)));
      if (r.lat != null) u('lat', r.lat);
      if (r.lon != null) u('lon', r.lon);
      u('roofLookupSource', r.source);
      u('roofLookupNotes', r.notes || '');
      u('roofLookupAt', new Date().toISOString());
      if (r.shadeIndex != null && !Number.isNaN(r.shadeIndex)) u('shadeIndex', r.shadeIndex);
      if (r.shadeSource) u('shadeSource', r.shadeSource);
    } catch (e) {
      setRoofError(e.message || 'Error consultando techo');
    } finally {
      setRoofLoading(false);
    }
  };

  // Sistemas off-grid están aislados de la red: no pueden entregar
  // excedentes. Los on-grid e híbridos sí (marco AGPE — CREG 174/2021).
  const gridExport = f.systemType !== 'off-grid';

  // Dimensionamiento base: por consumo (cobertura ~100%). Si el cliente
  // quiere excedentes Y tiene área disponible superior a la requerida,
  // sobredimensionamos al kWp que cabe en el techo (limitado por área).
  const consumptionKwp = f.monthlyKwh ? (parseFloat(f.monthlyKwh) / 30) / (psh * 0.78) : 0;
  const areaVal = parseFloat(f.availableArea);
  const hasArea = !!areaVal && areaVal > 0;
  // Área por panel real (huella módulo ÷ packing factor residencial/industrial)
  const m2PerPanel = panelRoofAreaM2(panel, DEFAULT_PACKING_FACTOR);
  const areaMaxPanels = hasArea ? Math.floor(areaVal / m2PerPanel) : 0;
  const areaMaxKwp = hasArea ? parseFloat((areaMaxPanels * panel.wp / 1000).toFixed(2)) : 0;
  const areaAllowsExcedentes = gridExport && hasArea && areaMaxKwp > consumptionKwp;
  // Cuando el área es la restricción activa (techo < 100% consumo), capamos al máximo
  // que cabe físicamente — no tiene sentido cotizar más paneles de los que entran.
  const areaLimitsSystem = hasArea && areaMaxKwp < consumptionKwp;
  const targetKwp = (f.wantsExcedentes && areaAllowsExcedentes) ? areaMaxKwp
                  : areaLimitsSystem ? areaMaxKwp
                  : null;

  // Off-grid no puede tener excedentes; si el usuario cambia el tipo,
  // o reduce el área, desactivar el toggle automáticamente.
  useEffect(() => {
    if (f.wantsExcedentes && (!gridExport || (hasArea && !areaAllowsExcedentes))) {
      u('wantsExcedentes', false);
    }
  }, [f.wantsExcedentes, gridExport, hasArea, areaAllowsExcedentes]);

  const calculate = async () => {
    const kwh = parseFloat(f.monthlyKwh);
    if (!kwh) return;

    // Fase 1 — sizing rápido con temperaturas default para determinar actKwp.
    const sizingKwp = targetKwp || consumptionKwp;
    const inv = selectCompatibleInverter(panel, sizingKwp, f.systemType, inverters);
    const sysBase = calcSystem(kwh, panel, inv, needsB ? batt : null, needsB ? f.battQty : 0, psh, { targetKwp });

    let pvgisAnnualKwh = null;
    let pvwattsAnnualKwh = null;
    let spot = null;
    let nasa = null;
    let trmData = null;

    if (sysBase.actKwp > 0) {
      setLoadingPVGIS(true);
      setPvgisError(null);
      setXmError(null);

      const hasCoords = !!(dest?.lat && dest?.lon);

      // Fase 2 — todas las APIs en paralelo: PVGIS, PVWatts, NASA POWER, XM, TRM.
      const [pv, pvw, nasaRes, sp, trmRes] = await Promise.all([
        hasCoords
          ? fetchPVProduction({ lat: dest.lat, lon: dest.lon, kwp: sysBase.actKwp })
              .catch(err => { setPvgisError(err.message); return null; })
          : Promise.resolve(null),
        hasCoords
          ? fetchPVWatts(dest.lat, dest.lon, sysBase.actKwp)
              .catch(() => null)
          : Promise.resolve(null),
        hasCoords
          ? fetchNASAPower(dest.lat, dest.lon)
              .catch(() => null)
          : Promise.resolve(null),
        fetchSpotPrice(30).catch(err => { setXmError(err.message); return null; }),
        fetchTRM().catch(() => null),
      ]);

      if (pv) pvgisAnnualKwh = pv.annualKwh;
      if (pvw) pvwattsAnnualKwh = pvw.annualKwh;
      nasa = nasaRes;
      spot = sp;
      trmData = trmRes;

      setNasaData(nasa);
      setPvwData(pvw);
      setTrm(trmData);
      setLoadingPVGIS(false);
    }

    // Fase 3 — recalcular con temperaturas reales (NASA POWER) y mejor estimación
    // de producción: PVWatts (pérdidas reales) > PVGIS > PSH heurístico.
    const temps = nasa
      ? { coldTempC: nasa.cellTempCold, hotTempC: nasa.cellTempHot }
      : {};
    const bestAnnualKwh = pvwattsAnnualKwh || pvgisAnnualKwh || null;
    const productionSource = pvwattsAnnualKwh ? 'PVWatts' : pvgisAnnualKwh ? 'PVGIS' : 'PSH';

    const inv2 = selectCompatibleInverter(panel, sysBase.actKwp, f.systemType, inverters, temps);
    const shadeIndex = (f.shadeIndex != null && Number(f.shadeIndex) > 0) ? Number(f.shadeIndex) : null;
    const sys = calcSystem(kwh, panel, inv2, needsB ? batt : null, needsB ? f.battQty : 0, psh,
      { pvgisAnnualKwh: bestAnnualKwh, targetKwp, shadeIndex, ...temps });

    const transport = calcTransport(INTER_ZONAS, dest.zona, sys.kgTotal, 0);
    const budget = calcBudget(sys, panel, inv2, needsB ? batt : null, needsB ? f.battQty : 0, pricing, transport.total);
    const benefit = calcAGPEBenefit(sys.ap, kwh, operator.tariff, spot?.cop_per_kwh || 0, sys.actKwp, { gridExport });
    const annualSav = benefit.totalAnual;
    const roi = annualSav > 0 ? parseFloat((budget.tot / annualSav).toFixed(1)) : 0;

    const budgetUsd = trmData?.cop_per_usd ? parseFloat((budget.tot / trmData.cop_per_usd).toFixed(0)) : null;

    const sizedFor = (f.wantsExcedentes && areaAllowsExcedentes) ? 'excedentes'
                   : areaLimitsSystem ? 'area'
                   : 'consumo';
    setRes({ ...sys, inv: inv2, sizedFor, productionSource });
    setBgt({ ...budget, sav: annualSav, roi, transport: transport.total, budgetUsd, trmDate: trmData?.date });
    setAgpe({ ...benefit, spotSource: spot, tariffCU: operator.tariff });
  };

  const submit = () => {
    const norms = agpe
      ? getApplicableNormativa({
          hasExcedentes: agpe.excedentes > 0,
          agpeCategory: agpe.agpeCategory,
          kwp: res.actKwp,
          gridExport: agpe.gridExport,
        }).map(n => n.id)
      : [];
    addQuote({
      id: Date.now(), date: new Date().toLocaleDateString('es-CO'),
      name: f.name, company: f.company, email: f.email, phone: f.phone,
      address: f.address, city: f.dept, operator: operator.name,
      systemType: f.systemType, monthlyKwh: f.monthlyKwh,
      panel, results: res, budget: bgt, agpe, regulatory: norms, status: 'nuevo',
    });
    setDone(true);
  };

  const ss = {
    wrap: { maxWidth: 860, margin: '0 auto', padding: '28px 18px' },
    card: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '26px 30px', marginBottom: 16 },
    h2: { fontSize: 19, fontWeight: 700, color: '#fff', margin: '0 0 16px' },
    lbl: { display: 'block', fontSize: 11, color: C.muted, marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 },
    inp: { width: '100%', background: C.dark, border: `1px solid ${C.border}`, borderRadius: 7, padding: '11px 14px', color: C.text, fontSize: 14, boxSizing: 'border-box' },
    btn: { padding: '12px 28px', background: C.teal, color: '#fff', border: 'none', borderRadius: 9, fontWeight: 700, cursor: 'pointer', fontSize: 14 },
    ghost: { padding: '11px 22px', background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', fontSize: 13 },
    stat: { background: C.dark, border: `1px solid ${C.border}`, borderRadius: 9, padding: '14px 16px' },
  };

  const Prog = () => (
    <div style={{ marginBottom: 22 }}>
      {/* Mini hero — coherente con el home en pasos 1-4 */}
      <div className="al-mini-hero" style={{
        background: `linear-gradient(180deg, ${C.teal}10 0%, transparent 100%)`,
        border: `1px solid ${C.teal}33`, borderRadius: 14,
        padding: '20px 24px', marginBottom: 18,
        display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
      }}>
        <img src={logo} alt="SolarHub by ALEBAS" className="al-mini-hero-logo" style={{ height: 54, width: 'auto', objectFit: 'contain', flexShrink: 0 }} />
        <div className="al-mini-hero-txt" style={{ flex: '1 1 260px', minWidth: 0 }}>
          <div style={{ fontSize: 11, letterSpacing: 2.6, fontWeight: 700, color: C.teal, marginBottom: 3 }}>SOLARHUB BY ALEBAS</div>
          <div className="al-mini-hero-title" style={{ fontSize: 19, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>
            El centro de tu <span style={{ color: C.yellow }}>energía solar</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 7 }}>
            {['Dimensiona', 'Cotiza', 'Conecta', 'Instala'].map((t, i) => (
              <span key={t} style={{ fontSize: 12, fontWeight: 700, color: i % 2 === 0 ? C.teal : C.yellow, letterSpacing: 0.4 }}>
                {t}{i < 3 ? <span style={{ color: C.muted, margin: '0 4px' }}>•</span> : ''}
              </span>
            ))}
          </div>
        </div>
        <div className="al-step-pills" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {['Ley 1715', 'CREG 174/2021', 'RETIE'].map(t => (
            <span key={t} style={{ background: `${C.teal}18`, border: `1px solid ${C.teal}55`, borderRadius: 16, padding: '5px 12px', fontSize: 11, color: C.teal, fontWeight: 600, letterSpacing: 0.3, whiteSpace: 'nowrap' }}>{t}</span>
          ))}
        </div>
      </div>

      {/* Progreso */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 7 }}>
        {STEPS.map((_, i) => <div key={i} style={{ flex: 1, height: 5, borderRadius: 3, background: i < step ? C.teal : i === step ? C.teal + '88' : C.border, transition: 'background 0.2s' }} />)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        {STEPS.map((s, i) => <span key={i} style={{ fontSize: 11, color: i <= step ? C.teal : C.muted, fontWeight: i === step ? 700 : 500, letterSpacing: 0.3 }}>{s}</span>)}
      </div>
    </div>
  );

  // STEP 0: Welcome
  if (step === 0) return (
    <div style={ss.wrap}>
      {/* Hero */}
      <div style={{ ...ss.card, textAlign: 'center', padding: '36px 20px', borderColor: C.teal }}>
        <img src={logo} alt="SolarHub by ALEBAS Ingeniería" style={{ height: 72, maxWidth: '75%', marginBottom: 12, objectFit: 'contain' }} />
        <div style={{ fontSize: 11, letterSpacing: 3, marginBottom: 4, fontWeight: 700, color: C.teal }}>SOLARHUB BY ALEBAS</div>
        <h1 style={{ margin: '0 0 6px', fontSize: 26, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>
          El centro de tu <span style={{ color: C.yellow }}>energía solar</span>
        </h1>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', margin: '10px 0 14px' }}>
          {['Dimensiona', 'Cotiza', 'Conecta', 'Instala'].map((t, i) => (
            <span key={t} style={{ fontSize: 11, fontWeight: 700, color: i % 2 === 0 ? C.teal : C.yellow, letterSpacing: 0.5 }}>
              {t}{i < 3 ? <span style={{ color: C.muted, margin: '0 4px' }}>•</span> : ''}
            </span>
          ))}
        </div>
        <div style={{ fontSize: 11, letterSpacing: 2.5, marginBottom: 10, fontWeight: 700, color: C.teal }}>COTIZADOR SOLAR FOTOVOLTAICO</div>
        <div style={{ color: C.text, fontSize: 13, maxWidth: 420, margin: '0 auto 18px', lineHeight: 1.6 }}>
          Pre-dimensionamiento profesional con precios reales del mercado colombiano. Obtén tu propuesta técnica al instante.
        </div>
        <div style={{ display: 'flex', gap: 7, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 22 }}>
          {['20 operadores de red', 'Ley 1715 · CREG 174/2021 · CREG 135/2021', 'RETIE + Código de Medida (CREG 038/2014)'].map(t => (
            <span key={t} style={{ background: `${C.teal}15`, border: `1px solid ${C.teal}44`, borderRadius: 20, padding: '4px 12px', fontSize: 11, color: C.teal }}>{t}</span>
          ))}
        </div>
        <button style={{ ...ss.btn, fontSize: 14, padding: '13px 38px' }} onClick={() => setStep(1)}>
          Calcular mi sistema solar →
        </button>
      </div>

      {/* Cards de tipos */}
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
        <div style={{ fontSize: 12, color: C.muted, marginTop: -8, marginBottom: 14, lineHeight: 1.5 }}>
          Elige la topología del sistema. Define si hay inyección a red, respaldo en baterías o autonomía total.
        </div>
        <div className="al-type-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 18 }}>
          {[
            ['on-grid', '☀', 'On-Grid', 'Red eléctrica', 'Reduce factura hasta 90%.'],
            ['hybrid', '⚡', 'Híbrido', 'Con baterías', 'Producción continua.'],
            ['off-grid', '🌿', 'Off-Grid', 'Autónomo', '100% aislado de red.'],
          ].map(([id, ic, t, sub, desc]) => {
            const active = f.systemType === id;
            return (
              <div key={id} onClick={() => u('systemType', id)} style={{
                padding: '18px 12px', textAlign: 'center', borderRadius: 10, cursor: 'pointer',
                border: `2px solid ${active ? C.teal : C.border}`,
                background: active ? `${C.teal}18` : C.dark,
                transition: 'all 0.15s ease', boxShadow: active ? `0 0 0 4px ${C.teal}18` : 'none',
              }}>
                <div style={{ fontSize: 26, marginBottom: 7 }}>{ic}</div>
                <div style={{ fontWeight: 800, color: active ? C.teal : '#fff', fontSize: 13, marginBottom: 3 }}>{t}</div>
                <div style={{ fontSize: 10, color: active ? C.teal : C.muted, marginBottom: 5, fontWeight: 600 }}>{sub}</div>
                <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.4 }}>{desc}</div>
              </div>
            );
          })}
        </div>
        {needsB && (
          <div style={{ background: `${C.teal}10`, border: `1px solid ${C.teal}33`, borderRadius: 8, padding: '10px 12px', fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
            El dimensionamiento del banco de baterías requiere conocer tu consumo. Lo configuramos en el siguiente paso con tu autonomía, tensión del bus y batería compatible.
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
            {operators.map((op, i) => <option key={i} value={i}>{op.name}{op.region ? ` — ${op.region}` : ''}</option>)}
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
          {solarConfigured() && (
            <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <input
                type="text"
                style={{ ...ss.inp, flex: '1 1 200px', minWidth: 0 }}
                placeholder="Dirección o ciudad (ej: Cra 10 #5-20, Villavicencio)"
                value={roofQuery}
                onChange={e => setRoofQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onLookupRoof(); } }}
              />
              <button
                type="button"
                onClick={onLookupRoof}
                disabled={roofLoading}
                style={{ ...ss.btn, padding: '8px 14px', fontSize: 12, opacity: roofLoading ? 0.6 : 1 }}
              >
                {roofLoading ? '⏳ Buscando…' : '📍 Estimar área'}
              </button>
            </div>
          )}
          {roofError && <div style={{ fontSize: 10, color: C.orange, marginTop: 5 }}>⚠ {roofError}</div>}
          {f.roofLookupSource && (
            <div style={{ fontSize: 10, color: C.muted, marginTop: 5, lineHeight: 1.5 }}>
              Fuente: <span style={{ color: C.teal, fontWeight: 600 }}>
                {f.roofLookupSource === 'google' ? 'Google Solar API' : f.roofLookupSource === 'claude' ? 'Claude IA (estimación)' : f.roofLookupSource}
              </span>
              {f.lat != null && f.lon != null && <> · {Number(f.lat).toFixed(4)}, {Number(f.lon).toFixed(4)}</>}
              {f.roofLookupNotes && <> · {f.roofLookupNotes}</>}
              {f.shadeIndex != null && (
                <div style={{ marginTop: 3 }}>
                  ☀ Sombra local: <span style={{ color: f.shadeIndex >= 0.9 ? C.teal : f.shadeIndex >= 0.8 ? C.yellow : C.orange, fontWeight: 700 }}>
                    {Math.round((1 - f.shadeIndex) * 100)}% pérdida
                  </span> · índice {f.shadeIndex.toFixed(2)} ({f.shadeSource === 'google-datalayers' ? 'Google dataLayers' : f.shadeSource === 'claude-estimate' ? 'estimación IA' : f.shadeSource})
                </div>
              )}
              <div style={{ marginTop: 3 }}>
                Área usada por panel: <strong style={{ color: C.teal }}>{m2PerPanel.toFixed(2)} m²</strong> (huella real + packing {Math.round(DEFAULT_PACKING_FACTOR * 100)}%)
              </div>
            </div>
          )}
          {!solarConfigured() && (
            <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>Si la conoces, validamos cuánto de tu consumo puede cubrir tu techo</div>
          )}
        </div>
        {f.monthlyKwh && (() => {
          const reqKwp = (parseFloat(f.monthlyKwh) / 30) / (psh * 0.78);
          const reqPanels = Math.ceil(reqKwp * 1000 / panel.wp);
          const reqArea = reqPanels * m2PerPanel;
          const area = parseFloat(f.availableArea);
          const hasAreaLocal = !!area && area > 0;
          const enough = hasAreaLocal ? area >= reqArea : null;
          const maxPanels = hasAreaLocal ? Math.floor(area / m2PerPanel) : 0;
          const maxKwp = hasAreaLocal ? (maxPanels * panel.wp / 1000) : 0;
          const maxCov = hasAreaLocal && reqPanels > 0 ? Math.min(Math.round((maxPanels / reqPanels) * 100), 100) : 0;
          const col = enough === null ? C.teal : enough ? C.green : C.orange;
          const excedentesPosibles = gridExport && hasAreaLocal && maxKwp > reqKwp;
          const extraKwp = excedentesPosibles ? parseFloat((maxKwp - reqKwp).toFixed(2)) : 0;
          return (
            <div style={{ background: `${col}12`, border: `1px solid ${col}33`, borderRadius: 7, padding: '10px 13px', marginTop: 10, fontSize: 12 }}>
              <div>
                <span style={{ color: C.muted }}>Estimado: </span>
                <strong style={{ color: C.teal }}>{reqKwp.toFixed(2)} kWp</strong>
                <span style={{ color: C.muted }}> · {reqPanels} paneles · ~{reqArea.toFixed(0)} m² · {operator.name}</span>
              </div>
              {hasAreaLocal && (
                <div style={{ marginTop: 6, fontSize: 11, color: enough ? C.green : C.orange }}>
                  {enough
                    ? `✓ Tus ${area} m² alcanzan para cubrir el 100% del consumo`
                    : `⚠ Tus ${area} m² permiten máx. ${maxPanels} paneles (${maxKwp.toFixed(2)} kWp) — cubre ~${maxCov}% del consumo`}
                </div>
              )}
              {excedentesPosibles && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={f.wantsExcedentes}
                      onChange={e => u('wantsExcedentes', e.target.checked)}
                      style={{ marginTop: 2, accentColor: C.teal, cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: 11, color: '#fff', lineHeight: 1.5 }}>
                      Quiero un sistema <strong style={{ color: C.teal }}>con excedentes</strong> (aprovechar el área sobrante y vender energía a la red)
                      <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>
                        Tu techo permite hasta <strong style={{ color: C.teal }}>{maxKwp.toFixed(2)} kWp</strong> — {extraKwp} kWp extra sobre tu consumo. Los excedentes se liquidan vía AGPE (CREG 174/2021).
                      </div>
                    </span>
                  </label>
                </div>
              )}
            </div>
          );
        })()}
        {needsB && f.monthlyKwh && (
          <div style={{ marginTop: 14, border: `1px solid ${C.teal}44`, borderRadius: 8, padding: '12px 13px', background: `${C.teal}08` }}>
            <div style={{ fontWeight: 700, color: C.teal, fontSize: 12, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
              🔋 Almacenamiento {f.systemType === 'off-grid' ? '(Off-grid)' : '(Híbrido)'}
            </div>
            {f.systemType === 'off-grid' ? (
              <div style={{ marginBottom: 10 }}>
                <label style={ss.lbl}>Autonomía — días sin sol que debe cubrir el banco</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[0.5, 1, 1.5, 2, 3].map(d => (
                    <button key={d} type="button" onClick={() => u('autonomyDays', d)}
                      style={{ flex: 1, padding: '8px 0', borderRadius: 6, border: `2px solid ${f.autonomyDays === d ? C.teal : C.border}`, background: f.autonomyDays === d ? `${C.teal}22` : 'transparent', color: f.autonomyDays === d ? C.teal : '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                      {d < 1 ? `${d * 24}h` : `${d}d`}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 10 }}>
                  <label style={ss.lbl}>Horas de respaldo al cortar la red</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[2, 4, 6, 8, 12].map(h => (
                      <button key={h} type="button" onClick={() => u('backupHours', h)}
                        style={{ flex: 1, padding: '8px 0', borderRadius: 6, border: `2px solid ${f.backupHours === h ? C.teal : C.border}`, background: f.backupHours === h ? `${C.teal}22` : 'transparent', color: f.backupHours === h ? C.teal : '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                        {h}h
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={ss.lbl}>% del consumo a respaldar (cargas críticas)</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[25, 40, 50, 70, 100].map(p => (
                      <button key={p} type="button" onClick={() => u('criticalPct', p)}
                        style={{ flex: 1, padding: '8px 0', borderRadius: 6, border: `2px solid ${f.criticalPct === p ? C.teal : C.border}`, background: f.criticalPct === p ? `${C.teal}22` : 'transparent', color: f.criticalPct === p ? C.teal : '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 11 }}>
                        {p}%
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
            <div style={{ marginBottom: 10 }}>
              <label style={ss.lbl}>Tensión del bus DC (según inversor)</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {[24, 48].map(v => (
                  <button key={v} type="button" onClick={() => { u('busVoltage', v); u('battId', ''); u('battManual', false); }}
                    style={{ flex: 1, padding: '8px 0', borderRadius: 6, border: `2px solid ${f.busVoltage === v ? C.teal : C.border}`, background: f.busVoltage === v ? `${C.teal}22` : 'transparent', color: f.busVoltage === v ? C.teal : '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                    {v}V
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>48V es el estándar para la mayoría de inversores híbridos/off-grid residenciales.</div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={ss.lbl}>Batería (filtradas por tensión {f.busVoltage}V)</label>
              <select style={{ ...ss.inp, cursor: 'pointer' }} value={f.battId || batt?.id || ''} onChange={e => { u('battId', e.target.value); u('battManual', false); }}>
                {battPool.map(b => <option key={b.id} value={b.id}>{b.brand} {b.model} — {b.kwh} kWh — {b.voltage}V — {fmtCOP(b.price)}</option>)}
              </select>
              {!battsForBus.length && (
                <div style={{ fontSize: 10, color: C.orange, marginTop: 4 }}>⚠ No hay baterías en {f.busVoltage}V en el catálogo — mostrando todas.</div>
              )}
            </div>
            <div style={{ background: `${C.dark}`, border: `1px solid ${C.border}`, borderRadius: 6, padding: '9px 11px', fontSize: 11, color: '#fff', marginBottom: 10 }}>
              <div>Capacidad requerida: <strong style={{ color: C.teal }}>{requiredBankKwh.toFixed(2)} kWh</strong> <span style={{ color: C.muted }}>(DoD {Math.round(DoD * 100)}% · η {Math.round(eta * 100)}%)</span></div>
              <div style={{ marginTop: 2, color: C.muted }}>
                Cobertura: {criticalDailyKwh.toFixed(2)} kWh/día × {hoursBackup}h ÷ {Math.round(DoD * eta * 100)}%
              </div>
            </div>
            <div>
              <label style={ss.lbl}>
                Número de baterías
                {suggestedBattQty > 0 && <span style={{ color: C.muted, fontWeight: 400, fontSize: 10, marginLeft: 8 }}>sugerido: {suggestedBattQty}</span>}
              </label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                {[1, 2, 3, 4, 6, 8, 10, 12].map(n => (
                  <button key={n} type="button" onClick={() => { u('battQty', n); u('battManual', true); }}
                    style={{ width: 38, height: 36, borderRadius: 6, border: `2px solid ${f.battQty === n ? C.teal : C.border}`, background: f.battQty === n ? `${C.teal}22` : 'transparent', color: f.battQty === n ? C.teal : '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                    {n}
                  </button>
                ))}
                {f.battManual && (
                  <button type="button" onClick={() => u('battManual', false)} style={{ marginLeft: 6, background: 'none', border: `1px solid ${C.muted}`, color: C.muted, borderRadius: 5, padding: '5px 9px', cursor: 'pointer', fontSize: 10 }}>
                    ↺ auto
                  </button>
                )}
              </div>
              {batt && f.battQty > 0 && (
                <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
                  Banco total: <strong style={{ color: C.teal }}>{(batt.kwh * f.battQty).toFixed(2)} kWh</strong> · {f.battQty} × {batt.kwh} kWh
                  {requiredBankKwh > 0 && (batt.kwh * f.battQty) < requiredBankKwh && (
                    <span style={{ color: C.orange, marginLeft: 6 }}>⚠ bajo lo requerido</span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
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
          <button style={{ ...ss.btn, opacity: (!f.name || !f.phone || !f.email || loadingPVGIS) ? 0.4 : 1 }} disabled={loadingPVGIS} onClick={async () => {
            if (f.name && f.phone && f.email) {
              setStep(5);
              await calculate();
            }
          }}>
            {loadingPVGIS ? 'Calculando…' : 'Ver mi sistema →'}
          </button>
        </div>
      </div>
    </div>
  );

  // STEP 5: Results — pantalla de carga dinámica con orquestación de herramientas
  if (step === 5 && (!res || !bgt)) return <LoadingSystem C={C} ss={ss} logo={logo} f={f} operator={operator} needsB={needsB} />;

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
          <button style={ss.btn} onClick={() => { setStep(0); setDone(false); setRes(null); setBgt(null); setF(Q0); setPvgisError(null); setXmError(null); setAgpe(null); }}>Nueva cotización</button>
        </div>
      </div>
    );

    const RESULT_TABS = [
      ['resumen', '📊', 'Resumen'],
      ['tecnico', '⚙', 'Técnico'],
      ['presupuesto', '◈', 'Presupuesto'],
      ['normativo', '§', 'Normativo'],
    ];
    const TAB_ORDER = ['resumen', 'tecnico', 'presupuesto', 'normativo'];
    const TAB_LABEL = { resumen: 'Resumen', tecnico: 'Técnico', presupuesto: 'Presupuesto', normativo: 'Marco normativo' };
    const showResumen = resultTab === 'resumen';
    const showTecnico = resultTab === 'tecnico';
    const showPresupuesto = resultTab === 'presupuesto';
    const showNormativo = resultTab === 'normativo';
    return (
      <div style={ss.wrap}>
        <div style={{ ...ss.card, textAlign: 'center', padding: '22px', borderColor: C.teal }}>
          <div style={{ fontSize: 9, color: C.teal, letterSpacing: 3, fontWeight: 700, marginBottom: 5, textTransform: 'uppercase' }}>Pre-dimensionamiento</div>
          <div style={{ fontSize: 36, fontWeight: 800, color: '#fff', marginBottom: 3 }}>{res.actKwp} <span style={{ color: C.yellow }}>kWp</span></div>
          <div style={{ color: C.muted, fontSize: 12 }}>{f.systemType} · {operator.name} · PSH {psh} h/día · {f.dept}</div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            {/* Fuente de producción — preferencia: PVWatts > PVGIS > PSH */}
            {res.productionSource === 'PVWatts' && (
              <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: `${C.green}22`, color: C.green, border: `1px solid ${C.green}55` }}>
                ✓ NREL PVWatts v8 · {pvwData?.solradAnnual} kWh/m²/año
              </span>
            )}
            {res.productionSource === 'PVGIS' && (
              <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: `${C.teal}22`, color: C.teal, border: `1px solid ${C.teal}55` }}>
                ✓ PVGIS · {dest.capital}
              </span>
            )}
            {res.productionSource === 'PSH' && (
              <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 20, background: `${C.gray ?? '#555'}22`, color: C.muted, border: `1px solid #55555555` }}>
                Estimación PSH regional
              </span>
            )}
            {nasaData && (
              <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: `${C.yellow}22`, color: C.yellow, border: `1px solid ${C.yellow}55` }}>
                🌡 NASA POWER · T celda {nasaData.cellTempCold}°C/{nasaData.cellTempHot}°C
              </span>
            )}
            <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 20, fontWeight: 600,
              background: res.sizedFor === 'excedentes' ? `${C.yellow}22` : res.sizedFor === 'area' ? `${C.orange}22` : `${C.teal}22`,
              color: res.sizedFor === 'excedentes' ? C.yellow : res.sizedFor === 'area' ? C.orange : C.teal,
              border: `1px solid ${(res.sizedFor === 'excedentes' ? C.yellow : res.sizedFor === 'area' ? C.orange : C.teal)}55` }}>
              {res.sizedFor === 'excedentes' ? '⚡ Dimensionado con excedentes'
               : res.sizedFor === 'area' ? '⚠ Limitado por área disponible'
               : '⌂ Dimensionado por consumo'}
            </span>
          </div>
        </div>

        {/* Tab navigation para paginar resultados */}
        <div className="al-result-tabs" style={{
          display: 'flex', gap: 6, marginBottom: 12, background: C.card, padding: 4,
          borderRadius: 10, border: `1px solid ${C.border}`,
        }}>
          {RESULT_TABS.map(([id, ic, l]) => (
            <button key={id} onClick={() => { setResultTab(id); window.scrollTo({ top: 0, behavior: 'smooth' }); }} style={{
              flex: 1, padding: '9px 8px', borderRadius: 7, border: 'none', cursor: 'pointer',
              background: resultTab === id ? C.teal : 'transparent',
              color: resultTab === id ? '#fff' : C.muted,
              fontSize: 12, fontWeight: 700, letterSpacing: 0.3, whiteSpace: 'nowrap',
            }}>{ic} {l}</button>
          ))}
        </div>

        {showResumen && res.cappedByRegulation && (
          <div style={{ background: `${C.orange}12`, border: `1px solid ${C.orange}55`, borderRadius: 9, padding: '12px 16px', marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.orange, marginBottom: 4, textTransform: 'uppercase' }}>⚠ Sistema acotado a {MAX_KWP_AGPE} kW</div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
              Tu consumo requeriría más de {MAX_KWP_AGPE} kWp. El cotizador limita a {MAX_KWP_AGPE} kWp (alcance AGPE Mayor, CREG 174/2021). Para sistemas mayores se requiere ingeniería distribuida (GD) — un ingeniero ALEBAS te cotizará por separado.
            </div>
          </div>
        )}

        {showResumen && (() => {
          const area = parseFloat(f.availableArea);
          if (!area || area <= 0) return null;
          const areaLimited = res.sizedFor === 'area';
          // Área ideal para 100% de consumo (sin cap de techo)
          const idealPanels = Math.ceil(consumptionKwp * 1000 / panel.wp);
          const idealArea = Math.ceil(idealPanels * m2PerPanel);
          const enough = !areaLimited && area >= idealArea;
          const col = (enough && !areaLimited) ? C.green : C.orange;
          return (
            <div style={{ background: `${col}12`, border: `1px solid ${col}55`, borderRadius: 9, padding: '12px 16px', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: col, marginBottom: 6, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                {enough ? '✓ Área disponible suficiente' : '⚠ Área disponible limita el sistema'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: 11 }}>
                <div>
                  <div style={{ color: C.muted, fontSize: 9, textTransform: 'uppercase' }}>Disponible</div>
                  <div style={{ color: '#fff', fontWeight: 600 }}>{area} m²</div>
                </div>
                <div>
                  <div style={{ color: C.muted, fontSize: 9, textTransform: 'uppercase' }}>Requerida (100%)</div>
                  <div style={{ color: '#fff', fontWeight: 600 }}>{idealArea} m²</div>
                </div>
                <div>
                  <div style={{ color: C.muted, fontSize: 9, textTransform: 'uppercase' }}>Máx. por área</div>
                  <div style={{ color: col, fontWeight: 700 }}>{res.actKwp} kWp · {res.cov}%</div>
                </div>
              </div>
              {areaLimited && (
                <div style={{ marginTop: 10, background: `${C.orange}18`, borderRadius: 6, padding: '10px 12px', border: `1px solid ${C.orange}44` }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.orange, marginBottom: 3 }}>
                    Cobertura real: {res.cov}% del consumo mensual
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.55 }}>
                    Tu techo de <strong style={{ color: '#fff' }}>{area} m²</strong> permite hasta <strong style={{ color: C.orange }}>{res.numPanels} paneles · {res.actKwp} kWp</strong>, que generan ~{fmt(res.mp)} kWh/mes. Para cubrir el 100% ({f.monthlyKwh} kWh/mes) se necesitan ~<strong style={{ color: '#fff' }}>{idealArea} m²</strong> ({idealPanels} paneles).
                  </div>
                  <div style={{ fontSize: 10, color: C.orange, marginTop: 6, fontWeight: 600 }}>
                    ⚠ Observación incluida en la propuesta: el sistema no cubre el 100% del consumo por restricción de área disponible.
                  </div>
                </div>
              )}
              {!areaLimited && !enough && (
                <div style={{ fontSize: 10, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
                  Tu techo permite hasta <strong style={{ color: col }}>{res.numPanels} paneles ({res.actKwp} kWp)</strong>. Para el 100% se necesitan ~{idealArea} m².
                </div>
              )}
            </div>
          );
        })()}

        {showResumen && (
        <div className="al-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 9, marginBottom: 12 }}>
          {[['Paneles', res.numPanels, 'unidades'], ['Prod. mensual', fmt(res.mp), 'kWh/mes'], ['Cobertura', res.cov, '%'], ['Prod. anual', fmt(res.ap), 'kWh/año'], ['CO₂ evitado', fmt(res.co2), 'kg/año'], ['ROI', bgt.roi, 'años']].map(([l, v, u]) => (
            <div key={l} style={ss.stat}>
              <div style={{ fontSize: 9, color: C.muted, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.4 }}>{l}</div>
              <div style={{ fontSize: 19, fontWeight: 700, color: '#fff' }}>{v}</div>
              <div style={{ fontSize: 9, color: C.teal, marginTop: 1 }}>{u}</div>
            </div>
          ))}
        </div>
        )}

        {showResumen && (() => {
          const cons = parseFloat(f.monthlyKwh) || 0;
          const gen = Number(res.mp) || 0;
          if (cons <= 0 && gen <= 0) return null;
          const delta = gen - cons;
          const surplus = delta > 0;
          const maxV = Math.max(cons, gen, 1);
          const consPct = Math.max(2, Math.round((cons / maxV) * 100));
          const genPct = Math.max(2, Math.round((gen / maxV) * 100));
          const deltaCol = surplus ? C.yellow : C.orange;
          const onGrid = f.systemType === 'on-grid' || f.systemType === 'hybrid';
          return (
            <div style={{ ...ss.card, marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>⚡ Generación vs consumo · mensual</div>
                <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  {surplus ? 'Excedente estimado' : 'Déficit estimado'}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                    <span style={{ color: C.muted }}>Consumo promedio</span>
                    <span style={{ color: '#fff', fontWeight: 700 }}>{fmt(cons)} kWh</span>
                  </div>
                  <div style={{ height: 10, background: C.dark, borderRadius: 5, overflow: 'hidden' }}>
                    <div style={{ width: `${consPct}%`, height: '100%', background: C.muted, opacity: 0.7 }} />
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                    <span style={{ color: C.muted }}>Generación estimada</span>
                    <span style={{ color: C.teal, fontWeight: 700 }}>{fmt(gen)} kWh</span>
                  </div>
                  <div style={{ height: 10, background: C.dark, borderRadius: 5, overflow: 'hidden' }}>
                    <div style={{ width: `${genPct}%`, height: '100%', background: C.teal }} />
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                <div style={{ background: C.dark, borderRadius: 7, padding: '9px 10px', border: `1px solid ${deltaCol}44` }}>
                  <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 }}>{surplus ? 'Excedente' : 'Déficit'} / mes</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: deltaCol, marginTop: 2 }}>{surplus ? '+' : ''}{fmt(Math.abs(delta))} kWh</div>
                </div>
                <div style={{ background: C.dark, borderRadius: 7, padding: '9px 10px', border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 }}>{surplus ? 'Excedente' : 'Déficit'} / año</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: deltaCol, marginTop: 2 }}>{surplus ? '+' : ''}{fmt(Math.abs(delta) * 12)} kWh</div>
                </div>
                <div style={{ background: C.dark, borderRadius: 7, padding: '9px 10px', border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 }}>Cobertura</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginTop: 2 }}>{cons > 0 ? Math.round((gen / cons) * 100) : 0}%</div>
                </div>
              </div>

              {surplus && onGrid && (
                <div style={{ marginTop: 10, fontSize: 10, color: C.muted, lineHeight: 1.5 }}>
                  Con AGPE (CREG 174/2021) los excedentes pueden venderse al operador de red ({operator.name}). El valor se descuenta en la factura o se paga si supera el consumo del periodo.
                </div>
              )}
              {surplus && f.systemType === 'off-grid' && (
                <div style={{ marginTop: 10, fontSize: 10, color: C.muted, lineHeight: 1.5 }}>
                  Excedente no inyectable a red (sistema aislado). Úsalo para cargas diferibles: bombeo, termotanque, climatización o ampliación del banco de baterías.
                </div>
              )}
              {!surplus && (
                <div style={{ marginTop: 10, fontSize: 10, color: C.muted, lineHeight: 1.5 }}>
                  La generación no cubre el consumo mensual. El déficit se tomará de {f.systemType === 'off-grid' ? 'las baterías o requerirá apoyo de planta' : 'la red eléctrica'}.
                </div>
              )}
            </div>
          );
        })()}

        {showResumen && aiConfigured() && (
          <div style={{ ...ss.card, borderColor: C.yellow + '66', background: `${C.yellow}08`, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
                <span style={{ color: C.yellow }}>✦</span> Asistente IA — Revisión técnica
              </div>
              <button
                type="button"
                disabled={aiLoading}
                onClick={async () => {
                  setAiError(null); setAiLoading(true);
                  try {
                    const out = await aiRecommend('review', {
                      systemType: f.systemType,
                      monthlyKwh: Number(f.monthlyKwh),
                      operator: operator.name, psh,
                      location: { dept: f.dept, lat: f.lat, lon: f.lon, address: f.address || roofQuery || '' },
                      panel: { brand: panel.brand, model: panel.model, wp: panel.wp },
                      inverter: res.inv ? { brand: res.inv.brand, model: res.inv.model, kw: res.inv.kw, type: res.inv.type } : null,
                      battery: needsB ? { brand: batt.brand, model: batt.model, kwh: batt.kwh, voltage: batt.voltage, qty: f.battQty, totalKwh: +(batt.kwh * f.battQty).toFixed(2) } : null,
                      storageReqKwh: +requiredBankKwh.toFixed(2),
                      backup: f.systemType === 'off-grid' ? { autonomyDays: f.autonomyDays } : { hours: f.backupHours, criticalPct: f.criticalPct },
                      result: { kwp: res.actKwp, numPanels: res.numPanels, monthlyProdKwh: res.mp, coverage: res.cov, annualProdKwh: res.ap, roofM2: res.roof, strings: res.ns, panelsPerString: res.ppss },
                      budget: { total: bgt.tot, roi: bgt.roi },
                      roof: { availableM2: f.availableArea ? Number(f.availableArea) : null, source: f.roofLookupSource || null },
                    });
                    setAiData(out);
                  } catch (e) { setAiError(e.message || 'Error IA'); }
                  finally { setAiLoading(false); }
                }}
                style={{ ...ss.btn, background: C.yellow, color: '#000', padding: '7px 13px', fontSize: 11, opacity: aiLoading ? 0.6 : 1 }}
              >
                {aiLoading ? '⏳ Analizando…' : aiData ? '↻ Volver a analizar' : '✦ Analizar con IA'}
              </button>
            </div>
            {aiError && <div style={{ fontSize: 11, color: C.orange }}>⚠ {aiError}</div>}
            {aiData && (
              <div style={{ fontSize: 12, color: '#fff', lineHeight: 1.55 }}>
                {aiData.summary && <div style={{ marginBottom: 8 }}>{aiData.summary}</div>}
                {aiData.findings?.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10, color: C.teal, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Hallazgos</div>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {aiData.findings.map((x, i) => <li key={i} style={{ marginBottom: 3 }}>{x}</li>)}
                    </ul>
                  </div>
                )}
                {aiData.warnings?.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10, color: C.orange, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Alertas</div>
                    <ul style={{ margin: 0, paddingLeft: 18, color: C.orange }}>
                      {aiData.warnings.map((x, i) => <li key={i} style={{ marginBottom: 3 }}>{x}</li>)}
                    </ul>
                  </div>
                )}
                {aiData.suggestions?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, color: C.yellow, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Sugerencias</div>
                    <ul style={{ margin: 0, paddingLeft: 18, color: C.yellow }}>
                      {aiData.suggestions.map((x, i) => <li key={i} style={{ marginBottom: 3 }}>{x}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {!aiData && !aiError && !aiLoading && (
              <div style={{ fontSize: 11, color: C.muted }}>
                Claude revisará tu sistema: voltaje del bus, cobertura de baterías, dimensionamiento vs consumo, normativa AGPE/RETIE y recomendaciones específicas.
              </div>
            )}
          </div>
        )}

        {showTecnico && (
        <div style={ss.card}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 12 }}>▣ Preview del layout y strings</div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
            Techo aprox. {res.roof} m² · {res.numPanels} paneles en {res.ns} string{res.ns > 1 ? 's' : ''} · {panel.wp} Wp c/u
          </div>
          <div style={{ background: C.dark, border: `1px dashed ${C.teal}55`, borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
            {Array.from({ length: res.ns }).map((_, sIdx) => {
              const remaining = res.numPanels - sIdx * res.ppss;
              const panelsInString = Math.min(res.ppss, remaining);
              const stringColors = [C.teal, C.yellow, '#4ade80', '#fb923c', '#a78bfa', '#f472b6'];
              const col = stringColors[sIdx % stringColors.length];
              return (
                <div key={sIdx} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: sIdx < res.ns - 1 ? 9 : 0 }}>
                  <div style={{ fontSize: 12, color: col, fontWeight: 700, minWidth: 44, letterSpacing: 0.5 }}>ST{sIdx + 1}</div>
                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', flex: 1 }}>
                    {Array.from({ length: panelsInString }).map((_, pIdx) => (
                      <div key={pIdx} style={{ width: 18, height: 13, background: `${col}33`, border: `1px solid ${col}`, borderRadius: 2 }} />
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: C.muted, minWidth: 72, textAlign: 'right' }}>{panelsInString} paneles</div>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', flexWrap: 'wrap', padding: '6px 0 14px' }}>
            <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>DC</div>
            <div style={{ fontSize: 18, color: C.teal }}>→</div>
            <div style={{ background: `${C.teal}22`, border: `1px solid ${C.teal}`, borderRadius: 7, padding: '9px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 }}>Inversor</div>
              <div style={{ fontSize: 14, color: '#fff', fontWeight: 700, marginTop: 2 }}>{res.inv?.brand} {res.inv?.kw} kW</div>
            </div>
            <div style={{ fontSize: 18, color: C.teal }}>→</div>
            {needsB && (
              <>
                <div style={{ background: `${C.yellow}22`, border: `1px solid ${C.yellow}`, borderRadius: 7, padding: '9px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 }}>Baterías</div>
                  <div style={{ fontSize: 14, color: '#fff', fontWeight: 700, marginTop: 2 }}>{f.battQty} × {batt.kwh} kWh</div>
                </div>
                <div style={{ fontSize: 18, color: C.teal }}>→</div>
              </>
            )}
            <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>AC · Carga</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {[
              ['Strings', `${res.ns} × ${res.ppss}`],
              ['Paneles', res.numPanels],
              ['DC/AC', res.dca],
              ['Área', `${res.roof} m²`],
            ].map(([l, v]) => (
              <div key={l} style={{ background: C.dark, borderRadius: 7, padding: '11px 10px', textAlign: 'center', border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 }}>{l}</div>
                <div style={{ fontSize: 16, color: C.teal, fontWeight: 700, marginTop: 4 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
        )}

        {showTecnico && (() => {
          const v = validateLayout(panel, res.inv, res.ppss, res.ns);
          const hasSpecs = panel?.voc && res.inv?.vocMax;
          if (!hasSpecs) {
            return (
              <div style={ss.card}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 6 }}>⚙ Validación de layout (pendiente)</div>
                <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.5 }}>
                  Faltan specs eléctricos (Voc, Vmp, Idc_max, rango MPPT) del panel o inversor seleccionado. Ve al BackOffice → Paneles / Inversores → <strong style={{ color: C.yellow }}>🔍 Importar desde CEC</strong> para enriquecer el catálogo con datos oficiales NREL/CEC.
                </div>
              </div>
            );
          }
          const statusBg = v.ok && v.warnings.length === 0 ? `${C.green}12` : v.ok ? `${C.yellow}10` : `${C.red}12`;
          const statusBorder = v.ok && v.warnings.length === 0 ? `${C.green}44` : v.ok ? `${C.yellow}44` : `${C.red}44`;
          const statusColor = v.ok && v.warnings.length === 0 ? C.green : v.ok ? C.yellow : C.red;
          const statusLabel = v.ok && v.warnings.length === 0 ? '✓ Layout compatible' : v.ok ? '⚠ Advertencias' : '✗ Layout inválido';
          return (
            <div style={{ ...ss.card, background: statusBg, border: `1px solid ${statusBorder}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>⚙ Validación eléctrica del layout</div>
                <span style={{ fontSize: 11, padding: '4px 11px', borderRadius: 20, background: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}55`, fontWeight: 700 }}>{statusLabel}</span>
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
                Voc en frío @10°C · Vmp en caliente @65°C · corriente por MPPT. Basado en {panel.source === 'CEC' ? 'datos CEC/NREL' : 'datasheet del fabricante'}.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: v.errors.length || v.warnings.length ? 12 : 0 }}>
                {[
                  ['Voc frío / Vdc_max', `${v.metrics.stringVocCold} / ${v.metrics.vocMax} V`],
                  ['Vmp STC', `${v.metrics.stringVmpStc} V`],
                  ['Vmp caliente / min', `${v.metrics.stringVmpHot} / ${v.metrics.mpptMin} V`],
                  ['I/MPPT', `${v.metrics.currentPerMppt} / ${v.metrics.idcMax} A`],
                ].map(([l, val]) => (
                  <div key={l} style={{ background: C.dark, borderRadius: 7, padding: '11px 10px', textAlign: 'center', border: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 }}>{l}</div>
                    <div style={{ fontSize: 14, color: '#fff', fontWeight: 700, marginTop: 4 }}>{val}</div>
                  </div>
                ))}
              </div>
              {v.errors.map((e, i) => (
                <div key={`e${i}`} style={{ fontSize: 12, color: C.red, padding: '6px 0', display: 'flex', gap: 7 }}><span>✗</span><span style={{ flex: 1 }}>{e}</span></div>
              ))}
              {v.warnings.map((w, i) => (
                <div key={`w${i}`} style={{ fontSize: 12, color: C.yellow, padding: '6px 0', display: 'flex', gap: 7 }}><span>⚠</span><span style={{ flex: 1 }}>{w}</span></div>
              ))}
            </div>
          );
        })()}

        {showPresupuesto && agpe && (
          <div style={ss.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4, flexWrap: 'wrap', gap: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
                {agpe.gridExport ? '⚖ Beneficio anual estimado (AGPE)' : '⚖ Ahorro anual (sistema aislado)'}
              </div>
              <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 20, background: `${C.teal}22`, color: C.teal, border: `1px solid ${C.teal}55`, fontWeight: 600 }}>
                {agpe.gridExport ? `AGPE ${agpe.agpeCategory} · CREG 174/2021` : 'Off-grid · ZNI · no inyecta a red'}
              </span>
            </div>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 11 }}>{agpe.rule}</div>
            {agpe.gridExport ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginBottom: 10 }}>
                <div style={{ background: C.dark, border: `1px solid ${C.teal}55`, borderRadius: 8, padding: '11px 13px' }}>
                  <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Autoconsumo</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{fmtCOP(agpe.ahorroAutoconsumo)}</div>
                  <div style={{ fontSize: 10, color: C.teal, marginTop: 2 }}>{fmt(agpe.autoConsumed)} kWh × {agpe.tariffCU} COP/kWh</div>
                  <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>Tarifa CU {operator.name}</div>
                </div>
                <div style={{ background: C.dark, border: `1px solid ${C.yellow}55`, borderRadius: 8, padding: '11px 13px' }}>
                  <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Excedentes a la red</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{fmtCOP(agpe.ingresoExcedentes)}</div>
                  <div style={{ fontSize: 10, color: C.yellow, marginTop: 2 }}>
                    {fmt(agpe.excedentes)} kWh × {agpe.priceExcedentes ? `${Math.round(agpe.priceExcedentes)} COP/kWh` : '—'}
                  </div>
                  <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>
                    {agpe.agpeCategory === 'Menor'
                      ? `Tarifa CU (netting 1:1)`
                      : agpe.spotSource
                        ? `Bolsa XM · ${agpe.spotSource.periodDays}d (${agpe.spotSource.samples} muestras)`
                        : xmError
                          ? '⚠ Bolsa XM no disponible'
                          : 'Sin datos de bolsa'}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginBottom: 10 }}>
                <div style={{ background: C.dark, border: `1px solid ${C.teal}55`, borderRadius: 8, padding: '11px 13px' }}>
                  <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Autoconsumo (baterías/carga)</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{fmtCOP(agpe.ahorroAutoconsumo)}</div>
                  <div style={{ fontSize: 10, color: C.teal, marginTop: 2 }}>{fmt(agpe.autoConsumed)} kWh × {agpe.tariffCU} COP/kWh</div>
                  <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>Costo evitado vs. generación diésel/red</div>
                </div>
                <div style={{ background: C.dark, border: `1px solid ${C.gray}55`, borderRadius: 8, padding: '11px 13px' }}>
                  <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Energía no aprovechada</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: C.muted }}>{fmt(agpe.energiaDesperdiciada)} kWh</div>
                  <div style={{ fontSize: 10, color: C.gray, marginTop: 2 }}>No hay red para inyectar</div>
                  <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>Se limita vía dump load / regulador</div>
                </div>
              </div>
            )}
            <div style={{ background: `${C.teal}12`, borderRadius: 7, padding: '10px 13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#fff', fontWeight: 600 }}>{agpe.gridExport ? 'Beneficio anual total' : 'Ahorro anual total'}</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: C.teal }}>{fmtCOP(agpe.totalAnual)}</span>
            </div>
            <div style={{ fontSize: 9, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
              {agpe.gridExport
                ? (agpe.spotSource
                    ? `Precio bolsa promedio últimos ${agpe.spotSource.periodDays}d: ${agpe.spotSource.cop_per_kwh} COP/kWh — fuente XM PrecBolsNal${agpe.spotSource.cached ? ' (caché)' : ''}. El autoconsumo asume cobertura del consumo mensual; el resto de la generación se contabiliza como excedentes inyectados a la red.`
                    : 'Cálculo de excedentes basado en tarifa CU del operador (sin acceso a bolsa XM en este momento). El autoconsumo asume cobertura del consumo mensual; el resto de la generación se contabiliza como excedentes inyectados a la red.')
                : 'Los sistemas off-grid no están conectados al SIN: la energía que excede el consumo y la capacidad de las baterías se desperdicia (dump load). Para monetizar excedentes se requiere un sistema on-grid o híbrido bajo marco AGPE (CREG 174/2021).'}
            </div>
          </div>
        )}

        {showTecnico && (
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
        )}

        {showPresupuesto && (
        <div style={ss.card}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 8 }}>◈ Presupuesto estimado</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: `${C.teal}0e`, border: `1px solid ${C.teal}28`, borderRadius: 7, padding: '8px 12px', marginBottom: 10 }}>
            <span style={{ fontSize: 16 }}>🌞</span>
            <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.4 }}>
              <span style={{ color: C.yellow, fontWeight: 700 }}>Precios mayoristas — Ingeniería y Consultoría en Eficiencia Energética SAS</span> · paneles Longi, inversores CPS. Tarifas actualizadas al mercado colombiano.
            </div>
          </div>
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
              <div>
                <div style={{ fontWeight: 700, color: '#fff', fontSize: 14 }}>TOTAL ESTIMADO</div>
                {bgt.budgetUsd && (
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>
                    ≈ USD ${fmt(bgt.budgetUsd)} · TRM {bgt.trmDate} · ${fmt(trm?.cop_per_usd)} COP/USD
                  </div>
                )}
              </div>
              <span style={{ color: C.yellow, fontWeight: 800, fontSize: 20 }}>{fmtCOP(bgt.tot)}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 9 }}>
            {[['Ahorro anual', fmtCOP(bgt.sav), C.teal], ['ROI', `${bgt.roi} años`, C.yellow], ['Transporte', fmtCOP(bgt.transport), C.muted]].map(([l, v, col]) => (
              <div key={l} style={{ ...ss.stat, flex: 1 }}><div style={{ fontSize: 9, color: C.muted }}>{l}</div><div style={{ fontSize: 13, fontWeight: 700, color: col, marginTop: 3 }}>{v}</div></div>
            ))}
          </div>
          <div style={{ fontSize: 9, color: C.muted, marginTop: 9, lineHeight: 1.5 }}>* Estimado sujeto a visita técnica. Incluye memorias RETIE, diagramas unifilares y trámites {operator.name}.</div>
        </div>
        )}

        {showNormativo && agpe && (() => {
          const hasExcedentes = agpe.excedentes > 0;
          const norms = getApplicableNormativa({ hasExcedentes, agpeCategory: agpe.agpeCategory, kwp: res.actKwp, gridExport: agpe.gridExport });
          return (
            <div style={{ ...ss.card, borderColor: `${C.teal}55`, background: `${C.teal}06` }}>
              <div style={{ textAlign: 'center', marginBottom: 14, paddingBottom: 10, borderBottom: `1px solid ${C.teal}33` }}>
                <div style={{ fontSize: 10, color: C.teal, letterSpacing: 3, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Pestaña final</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>§ Marco regulatorio aplicable</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>Colombia · MinMinas · CREG</div>
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 14, lineHeight: 1.6 }}>
                {agpe.gridExport
                  ? <>Normas colombianas vigentes que rigen tu instalación AGPE {agpe.agpeCategory}{hasExcedentes ? ' con entrega de excedentes' : ''}. Este pre-dimensionamiento se ajusta a sus requisitos técnicos y comerciales.</>
                  : <>Tu sistema es <strong style={{ color: C.teal }}>off-grid (aislado)</strong>: no está conectado al SIN, por lo que la regulación AGPE (CREG 174/2021) no aplica. El marco relevante es el de Zonas No Interconectadas (ZNI) y las normas técnicas RETIE.</>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {norms.map(n => (
                  <div key={n.id} style={{ background: C.dark, border: `1px solid ${C.border}`, borderRadius: 8, padding: '13px 15px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.teal }}>{n.title}</span>
                      {n.article && <span style={{ fontSize: 11, color: C.muted, fontStyle: 'italic' }}>{n.article}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: '#fff', fontWeight: 600, marginBottom: 5 }}>{n.fullName}</div>
                    <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{n.summary}</div>
                  </div>
                ))}
              </div>
              {res.sizedFor === 'area' && (
                <div style={{ marginTop: 12, background: `${C.orange}12`, border: `1px solid ${C.orange}44`, borderRadius: 7, padding: '11px 14px' }}>
                  <div style={{ fontSize: 12, color: C.orange, fontWeight: 700, marginBottom: 4 }}>⚠ Observación — Cobertura parcial por área disponible</div>
                  <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
                    El sistema cotizado ({res.actKwp} kWp · {res.numPanels} paneles) cubre el <strong style={{ color: C.orange }}>{res.cov}%</strong> del consumo mensual declarado ({f.monthlyKwh} kWh/mes) debido a la restricción de área disponible ({parseFloat(f.availableArea)} m²). Para alcanzar el 100% de cobertura se requerirían ~{Math.ceil(Math.ceil(consumptionKwp * 1000 / panel.wp) * m2PerPanel)} m² de techo útil. Un ingeniero ALEBAS puede evaluar alternativas como ampliación de área, paneles de mayor eficiencia o un sistema complementario.
                  </div>
                </div>
              )}
              <div style={{ fontSize: 11, color: C.muted, marginTop: 12, lineHeight: 1.6, fontStyle: 'italic' }}>
                {agpe.gridExport
                  ? 'Nota: previo a la entrega de excedentes, el cliente debe suscribir con su comercializador un acuerdo especial (anexo al Contrato de Condiciones Uniformes) según la Resolución CREG 135/2021. Este cotizador no reemplaza asesoría jurídica.'
                  : 'Nota: si deseas monetizar excedentes, evalúa un sistema on-grid o híbrido bajo AGPE. Este cotizador no reemplaza asesoría jurídica.'}
              </div>
            </div>
          );
        })()}

        {/* Navegación entre tabs + CTA final */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', padding: '8px 0 14px' }}>
          {resultTab !== TAB_ORDER[0] && (
            <button style={ss.ghost} onClick={() => { setResultTab(TAB_ORDER[TAB_ORDER.indexOf(resultTab) - 1]); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
              ← Anterior
            </button>
          )}
          {resultTab !== TAB_ORDER[TAB_ORDER.length - 1] ? (
            <button style={ss.btn} onClick={() => { setResultTab(TAB_ORDER[TAB_ORDER.indexOf(resultTab) + 1]); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
              Siguiente: {TAB_LABEL[TAB_ORDER[TAB_ORDER.indexOf(resultTab) + 1]]} →
            </button>
          ) : (
            <button style={{ ...ss.btn, fontSize: 14, padding: '13px 36px' }} onClick={submit}>
              Solicitar propuesta detallada →
            </button>
          )}
        </div>
        {showNormativo && (
          <div style={{ textAlign: 'center', padding: '0 0 20px' }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 3 }}>Un ingeniero SolarHub · ALEBAS te contacta en menos de 24 h</div>
            <div style={{ fontSize: 10, color: C.teal }}>info@alebas.co · Villavicencio, Meta</div>
          </div>
        )}
      </div>
    );
  }
  return null;
}

// Pantalla de carga animada — muestra la orquestación de herramientas en vivo.
// No bloquea: es solo visual. El cálculo real corre en paralelo en calculate().
function LoadingSystem({ C, ss, logo, f, operator, needsB }) {
  const tools = useMemo(() => [
    { icon: '☀', name: 'PVGIS', desc: 'Irradiancia satelital JRC (UE)' },
    { icon: '📊', name: 'NREL PVWatts', desc: 'Producción anual con pérdidas reales' },
    { icon: '🌡', name: 'NASA POWER', desc: 'Temperaturas de módulo (cold/hot)' },
    { icon: '💱', name: 'Banrep TRM', desc: 'Tasa USD/COP oficial' },
    { icon: '⚡', name: `XM — ${operator.name}`, desc: 'Precio spot en bolsa de energía' },
    ...(f.systemType !== 'on-grid' ? [{ icon: '🔋', name: 'Dimensionamiento de banco', desc: 'DoD 80% · η 90% · voltaje bus' }] : []),
    { icon: '🛡', name: 'Validación RETIE + AGPE', desc: 'CREG 174/2021 · Ley 1715 · Código de medida' },
    { icon: '✦', name: 'Inversor compatible', desc: 'Voc/Vmp, MPPT y rango de strings' },
  ], [operator.name, f.systemType, needsB]);

  const [cursor, setCursor] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setCursor(c => Math.min(c + 1, tools.length - 1)), 900);
    const t2 = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => { clearInterval(t); clearInterval(t2); };
  }, [tools.length]);

  return (
    <div style={{
      minHeight: 'calc(100vh - 56px - var(--footer-h, 64px))',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px 14px',
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 0.35; transform: scale(1); } 50% { opacity: 1; transform: scale(1.05); } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes dotFlash { 0%,80%,100% { opacity: 0.25; } 40% { opacity: 1; } }
      `}</style>

      <div style={{ width: '100%', maxWidth: 520 }}>
        <div style={{
          ...ss.card,
          textAlign: 'center',
          padding: '32px 24px 26px',
          borderColor: `${C.teal}55`,
          background: `linear-gradient(180deg, ${C.teal}08 0%, ${C.card} 60%)`,
        }}>
          <img src={logo} alt="SolarHub" style={{ height: 48, marginBottom: 14, objectFit: 'contain', animation: 'pulse 2s ease-in-out infinite' }} />

          <div style={{ position: 'relative', width: 70, height: 70, margin: '0 auto 14px' }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `3px solid ${C.teal}22` }} />
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '3px solid transparent', borderTopColor: C.teal, borderRightColor: C.teal, animation: 'spin 1.1s linear infinite' }} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: C.yellow }}>⚡</div>
          </div>

          <div style={{ color: '#fff', fontSize: 17, fontWeight: 800, marginBottom: 4 }}>Calculando tu sistema</div>
          <div style={{ color: C.muted, fontSize: 12, marginBottom: 4 }}>
            Orquestando <strong style={{ color: C.teal }}>{tools.length} herramientas</strong> en paralelo
            <span style={{ display: 'inline-flex', gap: 2, marginLeft: 4 }}>
              {[0, 1, 2].map(i => (
                <span key={i} style={{
                  width: 3, height: 3, borderRadius: '50%', background: C.teal,
                  animation: `dotFlash 1.4s ease-in-out ${i * 0.18}s infinite`,
                }} />
              ))}
            </span>
          </div>
          <div style={{ color: C.muted, fontSize: 10, marginBottom: 18, letterSpacing: 0.3 }}>
            {operator.name} · {f.dept} · {elapsed}s
          </div>

          <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tools.map((t, i) => {
              const state = i < cursor ? 'done' : i === cursor ? 'run' : 'pend';
              const col = state === 'done' ? C.teal : state === 'run' ? C.yellow : C.muted;
              const bg = state === 'run' ? `${C.yellow}12` : state === 'done' ? `${C.teal}08` : 'transparent';
              return (
                <div key={t.name} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 11px', borderRadius: 7,
                  background: bg,
                  border: `1px solid ${state === 'run' ? `${C.yellow}44` : state === 'done' ? `${C.teal}22` : C.border}`,
                  opacity: state === 'pend' ? 0.55 : 1,
                  animation: state !== 'pend' ? 'slideIn 0.25s ease' : 'none',
                  transition: 'all 0.2s ease',
                }}>
                  <div style={{ fontSize: 16, width: 22, textAlign: 'center' }}>{t.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: state === 'pend' ? C.muted : '#fff' }}>{t.name}</div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.desc}</div>
                  </div>
                  <div style={{ flexShrink: 0, width: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {state === 'done' && <span style={{ color: C.teal, fontSize: 14, fontWeight: 800 }}>✓</span>}
                    {state === 'run' && (
                      <div style={{ width: 12, height: 12, borderRadius: '50%', border: `2px solid ${C.yellow}33`, borderTopColor: C.yellow, animation: 'spin 0.8s linear infinite' }} />
                    )}
                    {state === 'pend' && <span style={{ color: C.muted, fontSize: 11 }}>•</span>}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 16, fontSize: 10, color: C.muted, lineHeight: 1.5 }}>
            Los datos se cruzan para entregarte una cotización confiable: producción real, precios de mercado y cumplimiento normativo.
          </div>
        </div>
      </div>
    </div>
  );
}

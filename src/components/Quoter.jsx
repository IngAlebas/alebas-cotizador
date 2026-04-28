import React, { useState, useEffect, useMemo, useRef } from 'react';
import logo from '../logo.png';
import {
  C, fmt, fmtCOP, DEPTS, DESTINOS_COURIER, INTER_ZONAS, CARRIERS, ZONA_LABEL,
  calcSystem, calcTransport, calcBudget, pickBestTransport, selectCompatibleInverter,
  calcAGPEBenefit, MAX_KWP_AGPE, validateLayout,
  tariffCU, excedentePriceFor, splitCU,
  panelRoofAreaM2, DEFAULT_PACKING_FACTOR,
  ROOF_MATERIALS,
} from '../constants';
import { fetchPVProduction } from '../services/pvgis';
import { fetchPVWatts } from '../services/pvwatts';
import { fetchNASAPower } from '../services/nasaPower';
import { fetchSpotPrice } from '../services/xm';
import { fetchTRM } from '../services/trm';
import { lookupRoof, solarConfigured } from '../services/solar';
import { autocompleteAddress, newPlacesSessionToken } from '../services/places';
import { aiRecommend, aiConfigured, APPLYABLE_FIELDS } from '../services/aiAssistant';
import { validateContactRemote, saveQuoteRemote } from '../services/quotes';
import { fetchLoadsCatalog, DEFAULT_LOADS_CATALOG } from '../services/loads';
import { getApplicableNormativa } from '../data/normativa';

const Q0 = {
  systemType: 'on-grid', monthlyKwh: '', operatorId: 0,
  panelId: '', battId: '', battQty: 2,
  destId: 'villavicencio', address: '',
  availableArea: '', wantsExcedentes: false,
  name: '', company: '', phone: '', email: '',
  // Acometida / fase de la carga — RETIE Sección 240 (clasificación usuario final):
  //   monofasico  = 1F+N, 120V (cargas muy pequeñas, poco común residencial)
  //   bifasico    = 2F+N (split-phase), 120/240V (residencial típico en Colombia)
  //   trifasico   = 3F+N, 208/220/440V (comercial/industrial o residencial grande)
  // Se auto-sugiere según el consumo/potencia estimada y gobierna el filtro
  // de inversores (phase 1 vs 3) en selectCompatibleInverter.
  acometida: 'bifasico',
  phaseManual: false,    // true = usuario forzó la acometida
  // Dimensionamiento de almacenamiento
  backupHours: 4,        // Horas de respaldo (Híbrido)
  autonomyDays: 1,       // Días sin sol (Off-grid)
  criticalPct: 50,       // % del consumo diario a respaldar (hybrid)
  busVoltage: 48,        // Tensión del bus DC de baterías
  battManual: false,     // true = usuario editó cantidad manualmente
  // Ubicación / área (Google Solar API vía n8n)
  lat: null, lon: null, roofLookupAt: null, roofLookupSource: null, roofLookupNotes: '',
  // Sombreado local derivado de Google Solar buildingInsights (0-1; 1=sin sombra)
  shadeIndex: null, shadeSource: null,
  // Google Solar — orientación, insolación, segmentos de techo e imágenes (dataLayers)
  roofTiltDeg: null, roofAzimuthDeg: null, sunshineHoursYear: null,
  googleMaxPanels: null, roofSegments: [], roofImagery: null, roofStaticMapUrl: null,
  googleAreaM2: null,    // área detectada por Google Solar (independiente del input del cliente)
  roofConfidence: null,  // 0..1 — confidence del análisis de techo
  roofImageryQuality: null, // 'HIGH' | 'MEDIUM' | 'LOW'
  roofMaterial: null,    // 'zinc' | 'eternit' | 'barro' | 'losa' | 'termoacustica' | 'lamina' | 'otro'
  roofStaticMapRoadUrl: null,    // Vista de mapa con calles para contexto
  roofLocationConfirmed: false,  // Cliente confirma que la ubicación mostrada es la de la instalación
  // Cuadro de cargas — usado en off-grid (no hay factura)
  loadItems: [],
  // Honeypot anti-bot — debe permanecer vacío en usuarios legítimos
  website: '',
};

const uuid = () => `ld_${Math.random().toString(36).slice(2, 10)}`;

// RETIE Sección 240 — selección de acometida por carga conectada.
// La franja es aproximada y válida para Colombia (STR/SDL residencial); el
// operador de red puede pedir trifásico por razones de calidad incluso en
// cargas menores.
function suggestAcometida(monthlyKwh, sysType) {
  const kwh = Number(monthlyKwh || 0);
  if (!kwh) return 'bifasico';
  // Carga máxima instantánea estimada ≈ consumo mensual / 100 (factor coincidencia).
  const estKw = kwh / 100;
  if (estKw >= 20) return 'trifasico';
  if (estKw < 3 && sysType === 'off-grid') return 'monofasico';
  return 'bifasico';
}

const ACOMETIDA_INFO = {
  monofasico: { label: 'Monofásico', volts: '120 V', hilos: '1F + N', retie: '240V ≤ 7 kW' },
  bifasico:   { label: 'Bifásico',   volts: '120/240 V', hilos: '2F + N', retie: 'Residencial típico Colombia' },
  trifasico:  { label: 'Trifásico',  volts: '208/220/440 V', hilos: '3F + N', retie: 'Comercial/industrial' },
};

// Mapeo acometida → fases del inversor (campo `phase` del catálogo).
//   phase 1 = monofásico/bifásico (split-phase 120/240V, la mayoría residencial en Colombia)
//   phase 3 = trifásico
function phasesForAcometida(acometida) {
  return acometida === 'trifasico' ? [3] : [1];
}

const STEPS = ['Tipo', 'Contacto', 'Consumo', 'Transporte', 'Resultado'];

// Pasos visuales mostrados durante la ejecución del Asistente IA.
// Son sólo cosméticos: la IA ejecuta una sola llamada, pero los pasos avanzan
// con un timer para dar feedback de progreso (similar a Vercel/Cursor).
const AI_STEPS = [
  'Empaquetando datos del sistema',
  'Consultando modelo (Groq → Gemini → Claude)',
  'Validando RETIE / CREG 174-2021 / AGPE',
  'Detectando alertas de dimensionamiento',
  'Generando recomendaciones técnicas',
  'Estructurando mejoras aplicables',
];

export default function Quoter({ panels, inverters, batteries, pricing, operators, addQuote, loadsCatalog }) {
  const [step, setStep] = useState(0);
  const [f, setF] = useState(Q0);
  const [res, setRes] = useState(null);
  const [bgt, setBgt] = useState(null);
  const [done, setDone] = useState(false);
  const [resultTab, setResultTab] = useState('resumen');
  const [loadPicker, setLoadPicker] = useState({ open: false, search: '', category: 'all' });
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));
  const loadsPresets = (Array.isArray(loadsCatalog) && loadsCatalog.length) ? loadsCatalog : DEFAULT_LOADS_CATALOG;
  const loadCategories = useMemo(() => {
    const set = new Set(loadsPresets.map(x => x.category || 'Otros'));
    return ['all', ...Array.from(set)];
  }, [loadsPresets]);
  const filteredLoadPresets = useMemo(() => {
    const q = (loadPicker.search || '').trim().toLowerCase();
    return loadsPresets.filter(x => {
      if (loadPicker.category !== 'all' && (x.category || 'Otros') !== loadPicker.category) return false;
      if (!q) return true;
      return (x.name || '').toLowerCase().includes(q) || (x.category || '').toLowerCase().includes(q);
    });
  }, [loadsPresets, loadPicker.search, loadPicker.category]);
  const addLoadFromPreset = (preset) => {
    const cur = Array.isArray(f.loadItems) ? f.loadItems : [];
    u('loadItems', [...cur, {
      id: uuid(),
      name: preset.name || '',
      watts: Number(preset.watts || 0),
      peakWatts: Number(preset.peakWatts || preset.watts || 0),
      hours: Number(preset.hours || 0),
      qty: Number(preset.qty || 1),
      category: preset.category || '',
    }]);
  };
  const addCustomLoad = () => {
    const cur = Array.isArray(f.loadItems) ? f.loadItems : [];
    u('loadItems', [...cur, { id: uuid(), name: '', watts: 0, peakWatts: 0, hours: 0, qty: 1 }]);
  };

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

  // Cuadro de cargas → consumo mensual (off-grid no tiene factura).
  const loadDailyKwh = (f.loadItems || []).reduce(
    (s, it) => s + (Number(it.watts || 0) * Number(it.hours || 0) * Number(it.qty || 0)) / 1000,
    0
  );
  const loadMonthlyKwh = +(loadDailyKwh * 30).toFixed(0);
  useEffect(() => {
    if (f.systemType !== 'off-grid') return;
    if (loadMonthlyKwh > 0 && String(loadMonthlyKwh) !== f.monthlyKwh) {
      u('monthlyKwh', String(loadMonthlyKwh));
    }
  }, [f.systemType, loadMonthlyKwh]);

  // Auto-sugerencia de acometida (RETIE 240) según el consumo. Si el usuario
  // la fija manualmente (phaseManual) no tocamos su elección.
  const suggestedAcometida = suggestAcometida(f.monthlyKwh, f.systemType);
  useEffect(() => {
    if (f.phaseManual) return;
    if (suggestedAcometida && suggestedAcometida !== f.acometida) {
      u('acometida', suggestedAcometida);
    }
  }, [suggestedAcometida, f.phaseManual]);

  // Configuración del banco de baterías (serie/paralelo).
  // Series = bus ÷ tensión batería (ceil, mín 1). Paralelos = qty ÷ series.
  const bankSeries = batt && batt.voltage > 0
    ? Math.max(1, Math.round(f.busVoltage / batt.voltage))
    : 1;
  const bankParallel = bankSeries > 0 ? Math.floor(f.battQty / bankSeries) : f.battQty;
  const bankOrphan = f.battQty - bankSeries * bankParallel;

  const dest = DESTINOS_COURIER.find(d => d.id === f.destId) || DESTINOS_COURIER[0];

  const [loadingPVGIS, setLoadingPVGIS] = useState(false);
  const [pvgisError, setPvgisError] = useState(null);
  const [xmError, setXmError] = useState(null);
  const [agpe, setAgpe] = useState(null);
  const [nasaData, setNasaData] = useState(null);
  const [pvwData, setPvwData] = useState(null);
  const [trm, setTrm] = useState(null);
  // Lookup de techo (Google Solar + IA fallback vía n8n)
  const [roofQuery, setRoofQuery] = useState('');
  const [roofLoading, setRoofLoading] = useState(false);
  const [roofError, setRoofError] = useState(null);
  // Autocomplete de direcciones (Google Places via n8n)
  const [addrSuggestions, setAddrSuggestions] = useState([]);
  const [addrSuggestOpen, setAddrSuggestOpen] = useState(false);
  const [addrLoading, setAddrLoading] = useState(false);
  const placesSessionRef = React.useRef(null);
  const addrDebounceRef = React.useRef(null);
  // Recomendación IA post-cálculo
  const [aiLoading, setAiLoading] = useState(false);
  const [aiData, setAiData] = useState(null);
  const [aiError, setAiError] = useState(null);
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const [aiApplied, setAiApplied] = useState(null); // { fields: string[], at: number }
  const [aiStep, setAiStep] = useState(0); // 0..AI_STEPS.length

  // Coerciona y valida `value` para `field` antes de aplicarlo al estado.
  // Retorna `undefined` si la action es inválida (silenciosamente descartada).
  const coerceActionValue = (field, value) => {
    if (!APPLYABLE_FIELDS.includes(field)) return undefined;
    switch (field) {
      case 'systemType':
        return ['on-grid', 'hybrid', 'off-grid'].includes(value) ? value : undefined;
      case 'acometida':
        return ['monofasico', 'bifasico', 'trifasico'].includes(value) ? value : undefined;
      case 'busVoltage': {
        const n = Number(value);
        return [12, 24, 48].includes(n) ? n : undefined;
      }
      case 'backupHours': {
        const n = Number(value);
        return Number.isFinite(n) && n > 0 && n <= 48 ? n : undefined;
      }
      case 'autonomyDays': {
        const n = Number(value);
        return [1, 2, 3].includes(n) ? n : undefined;
      }
      case 'criticalPct': {
        const n = Number(value);
        return Number.isFinite(n) && n >= 0 && n <= 100 ? n : undefined;
      }
      case 'battQty': {
        const n = Math.round(Number(value));
        return Number.isFinite(n) && n >= 1 && n <= 12 ? n : undefined;
      }
      case 'availableArea': {
        const n = Number(value);
        return Number.isFinite(n) && n > 0 ? String(n) : undefined;
      }
      case 'wantsExcedentes':
        return typeof value === 'boolean' ? value : undefined;
      default:
        return undefined;
    }
  };

  const applyAiActions = () => {
    if (!aiData?.actions?.length) return;
    const applied = [];
    const appliedDetails = []; // snapshot: [{ field, from, to, label, reason }]
    setF(prev => {
      const next = { ...prev };
      for (const a of aiData.actions) {
        const v = coerceActionValue(a.field, a.value);
        if (v === undefined) continue;
        if (next[a.field] === v) continue; // ya está aplicado
        appliedDetails.push({ field: a.field, from: next[a.field], to: v, label: a.label || '', reason: a.reason || '' });
        next[a.field] = v;
        applied.push(a.field);
        // Efectos secundarios coherentes con el resto de la UI:
        if (a.field === 'busVoltage') { next.battId = ''; next.battManual = false; }
        if (a.field === 'battQty') { next.battManual = true; }
        if (a.field === 'acometida') { next.phaseManual = true; }
      }
      return next;
    });
    setAiApplied({ fields: applied, details: appliedDetails, at: Date.now() });
  };
  // Validación de contacto (anti-abuso + dedupe). Esquema final pendiente
  // de elegir (reCAPTCHA v3 / OTP email / honeypot+rate-limit).
  const [validatingContact, setValidatingContact] = useState(false);
  const [contactError, setContactError] = useState(null);
  const validateContact = async () => {
    setContactError(null);
    if (!f.name?.trim() || !f.phone?.trim() || !f.email?.trim()) {
      setContactError('Completa nombre, teléfono y email.');
      return false;
    }
    if (f.website) {
      // Honeypot relleno — bloqueamos sin revelar el mecanismo.
      setContactError('No fue posible validar tu identidad. Intenta de nuevo.');
      return false;
    }
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim());
    if (!emailOk) {
      setContactError('Email inválido.');
      return false;
    }
    setValidatingContact(true);
    try {
      const r = await validateContactRemote({
        email: f.email.trim(),
        phone: f.phone.trim(),
        name: f.name.trim(),
        company: f.company?.trim() || '',
        website: f.website || '',
      });
      if (r?.offline) return true; // n8n sin configurar (dev local)
      if (!r?.ok) {
        const msg = r?.message || (r?.reason === 'rate_limit'
          ? 'Has solicitado muchas cotizaciones recientemente. Un ingeniero te contactará pronto.'
          : r?.reason === 'blocked'
          ? 'Contacto bloqueado. Escríbenos a info@alebas.co.'
          : 'No fue posible validar tus datos. Revisa email y teléfono.');
        setContactError(msg);
        return false;
      }
      return true;
    } catch (e) {
      // No bloqueamos por fallas de red del backend — dejamos pasar y
      // save-quote hará la persistencia definitiva si está disponible.
      return true;
    } finally {
      setValidatingContact(false);
    }
  };

  // Geolocaliza al usuario por GPS del navegador (más preciso que Geocoding por texto).
  // Solo prompea si el usuario hace clic — no es invasivo.
  const onUseMyLocation = () => {
    if (!navigator.geolocation) {
      setRoofError('Tu navegador no soporta geolocalización. Ingresa la dirección manualmente.');
      return;
    }
    setRoofError(null); setRoofLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude, lon = pos.coords.longitude;
        const accM = pos.coords.accuracy;
        try {
          const r = await lookupRoof({ lat, lon });
          applyRoofLookup(r);
          setRoofQuery(r.address || `${lat.toFixed(5)}, ${lon.toFixed(5)}`);
          if (accM > 50) {
            setRoofError(`GPS con precisión baja (±${Math.round(accM)}m). Si estás en interiores, sal a área abierta o usa la dirección.`);
          }
        } catch (e) {
          setRoofError(e?.message || 'Error consultando techo con coords GPS');
        } finally {
          setRoofLoading(false);
        }
      },
      (err) => {
        setRoofLoading(false);
        const msg = err.code === err.PERMISSION_DENIED ? 'Permiso de ubicación denegado.' :
                    err.code === err.POSITION_UNAVAILABLE ? 'Ubicación no disponible.' :
                    err.code === err.TIMEOUT ? 'Tiempo agotado obteniendo ubicación.' :
                    'No se pudo obtener tu ubicación.';
        setRoofError(msg + ' Ingresa la dirección manualmente.');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  };

  const applyRoofLookup = (r) => {
    if (r.areaM2 != null && !Number.isNaN(r.areaM2)) {
      const userArea = parseFloat(f.availableArea);
      if (!userArea || userArea <= 0) u('availableArea', String(Math.round(r.areaM2)));
      u('googleAreaM2', r.areaM2);
    }
    if (r.lat != null) u('lat', r.lat);
    if (r.lon != null) u('lon', r.lon);
    u('roofLookupSource', r.source);
    u('roofLookupNotes', r.notes || '');
    u('roofLookupAt', new Date().toISOString());
    u('roofConfidence', r.confidence || null);
    u('roofImageryQuality', r.imageryQuality || null);
    if (r.shadeIndex != null && !Number.isNaN(r.shadeIndex)) u('shadeIndex', r.shadeIndex);
    if (r.shadeSource) u('shadeSource', r.shadeSource);
    if (r.tiltDeg != null) u('roofTiltDeg', r.tiltDeg);
    if (r.azimuthDeg != null) u('roofAzimuthDeg', r.azimuthDeg);
    if (r.sunshineHoursYear != null) u('sunshineHoursYear', r.sunshineHoursYear);
    if (r.maxPanels != null) u('googleMaxPanels', r.maxPanels);
    if (r.roofSegments?.length) u('roofSegments', r.roofSegments);
    if (r.imagery) u('roofImagery', r.imagery);
    if (r.staticMapUrl) u('roofStaticMapUrl', r.staticMapUrl);
    if (r.staticMapRoadUrl) u('roofStaticMapRoadUrl', r.staticMapRoadUrl);
    // Resetear confirmación al re-buscar — el cliente debe re-confirmar la nueva ubicación.
    u('roofLocationConfirmed', false);
  };

  const onLookupRoof = async () => {
    const q = (roofQuery || '').trim();
    // Soportar input "lat, lon" directo además de dirección textual.
    const gpsMatch = q.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (gpsMatch) {
      const gpsLat = parseFloat(gpsMatch[1]), gpsLon = parseFloat(gpsMatch[2]);
      if (Math.abs(gpsLat) <= 90 && Math.abs(gpsLon) <= 180) {
        setRoofError(null); setRoofLoading(true);
        try {
          const r = await lookupRoof({ lat: gpsLat, lon: gpsLon });
          applyRoofLookup(r);
        } catch (e) {
          setRoofError(e?.message || 'Error consultando techo');
        } finally { setRoofLoading(false); }
        return;
      }
    }
    if (!q) { setRoofError('Ingresa una dirección o ciudad'); return; }
    setRoofError(null); setRoofLoading(true);
    try {
      const r = await lookupRoof({ address: q });
      applyRoofLookup(r);
    } catch (e) {
      const raw = e?.message || 'Error consultando techo';
      const friendly = /Failed to fetch|NetworkError/i.test(raw)
        ? 'No se pudo conectar al servicio. Puedes ingresar el área manualmente arriba y continuar.'
        : raw;
      setRoofError(friendly);
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

  // Re-ejecuta el cálculo cuando se aplican mejoras desde la IA en el paso de resultados.
  // setF() es asíncrono, por eso no podemos invocar calculate() directamente dentro de
  // applyAiActions; este efecto corre tras el commit con el `f` ya actualizado.
  useEffect(() => {
    if (aiApplied && step === 5) {
      calculate();
    }
  }, [aiApplied]); // eslint-disable-line

  // Avance progresivo de la lista de pasos visibles durante el análisis IA.
  // Se incrementa hasta el penúltimo paso; el último se marca como completado
  // recién cuando la respuesta llega (en el bloque .finally del onClick).
  useEffect(() => {
    if (!aiLoading) return;
    const tick = setInterval(() => {
      setAiStep(s => Math.min(s + 1, AI_STEPS.length - 1));
    }, 700);
    return () => clearInterval(tick);
  }, [aiLoading]);

  const calculate = async () => {
    const kwh = parseFloat(f.monthlyKwh);
    if (!kwh) return;

    // Fase 1 — sizing rápido con temperaturas default para determinar actKwp.
    const sizingKwp = targetKwp || consumptionKwp;
    const inv = selectCompatibleInverter(panel, sizingKwp, f.systemType, inverters, { phases: phasesForAcometida(f.acometida) });
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

    const inv2 = selectCompatibleInverter(panel, sysBase.actKwp, f.systemType, inverters, { ...temps, phases: phasesForAcometida(f.acometida) });
    const shadeIndex = (f.shadeIndex != null && Number(f.shadeIndex) > 0) ? Number(f.shadeIndex) : null;
    const sys = calcSystem(kwh, panel, inv2, needsB ? batt : null, needsB ? f.battQty : 0, psh,
      { pvgisAnnualKwh: bestAnnualKwh, targetKwp, shadeIndex, ...temps });

    const transportPick = pickBestTransport(dest.zona, sys.kgTotal, 0);
    const transport = transportPick.best || { total: 0, flete: 0, sf: 0, label: '-', carrierId: '-' };
    const budget = calcBudget(sys, panel, inv2, needsB ? batt : null, needsB ? f.battQty : 0, pricing, transport.total);
    const cuFull = tariffCU(operator);
    const cuMinusG = excedentePriceFor(operator);
    const cuSplit = splitCU(operator);
    const benefit = calcAGPEBenefit(sys.ap, kwh, cuFull, spot?.cop_per_kwh || 0, sys.actKwp,
      { gridExport, excedentePrice: cuMinusG });
    const annualSav = benefit.totalAnual;
    const roi = annualSav > 0 ? parseFloat((budget.tot / annualSav).toFixed(1)) : 0;

    const budgetUsd = trmData?.cop_per_usd ? parseFloat((budget.tot / trmData.cop_per_usd).toFixed(0)) : null;

    const sizedFor = (f.wantsExcedentes && areaAllowsExcedentes) ? 'excedentes'
                   : areaLimitsSystem ? 'area'
                   : 'consumo';
    setRes({ ...sys, inv: inv2, sizedFor, productionSource });
    setBgt({
      ...budget,
      sav: annualSav, roi,
      transport: transport.total,
      transportCarrier: transport.label,
      transportCarrierId: transport.carrierId,
      transportQuotes: transportPick.quotes,
      transportZone: dest.zona,
      budgetUsd,
      trmDate: trmData?.date,
    });
    setAgpe({ ...benefit, spotSource: spot, tariffCU: cuFull, cuSplit });
  };

  const submit = async () => {
    const norms = agpe
      ? getApplicableNormativa({
          hasExcedentes: agpe.excedentes > 0,
          agpeCategory: agpe.agpeCategory,
          kwp: res.actKwp,
          gridExport: agpe.gridExport,
        }).map(n => n.id)
      : [];
    const payload = {
      id: Date.now(), date: new Date().toLocaleDateString('es-CO'),
      name: f.name, company: f.company, email: f.email, phone: f.phone,
      address: f.address, city: dest.city, dept: dest.dept, operator: operator.name,
      systemType: f.systemType, monthlyKwh: f.monthlyKwh,
      lat: f.lat, lon: f.lon,
      shadeIndex: f.shadeIndex, shadeSource: f.shadeSource,
      panel, results: res, budget: bgt, agpe, regulatory: norms, status: 'nuevo',
    };
    addQuote(payload);
    setDone(true);
    // Persistencia remota (Postgres vía n8n) — best-effort, no bloquea la UX.
    saveQuoteRemote(payload).catch(() => {});
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

  // STEP 3: Consumption & operator
  if (step === 3) return (
    <div style={ss.wrap}><Prog />
      <div style={ss.card}>
        <div style={ss.h2}>Consumo y operador de red</div>
        {f.systemType === 'off-grid' ? (
          <div style={{ marginBottom: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
              <label style={{ ...ss.lbl, marginBottom: 0 }}>Cuadro de cargas — off-grid no tiene factura</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {(!f.loadItems || f.loadItems.length === 0) && (
                  <button type="button" onClick={() => u('loadItems', loadsPresets.slice(0, 6).map(x => ({ id: uuid(), name: x.name, watts: x.watts, peakWatts: x.peakWatts || x.watts, hours: x.hours, qty: x.qty || 1, category: x.category })))}
                    style={{ background: `${C.teal}22`, border: `1px solid ${C.teal}66`, color: C.teal, borderRadius: 5, padding: '4px 9px', cursor: 'pointer', fontSize: 10, fontWeight: 700 }}>
                    + cargas típicas
                  </button>
                )}
                <button type="button" onClick={() => setLoadPicker(s => ({ ...s, open: !s.open }))}
                  style={{ background: loadPicker.open ? `${C.teal}22` : 'transparent', border: `1px solid ${loadPicker.open ? C.teal : C.border}`, color: loadPicker.open ? C.teal : '#fff', borderRadius: 5, padding: '4px 9px', cursor: 'pointer', fontSize: 10, fontWeight: 700 }}>
                  + agregar del catálogo ▾
                </button>
                <button type="button" onClick={addCustomLoad}
                  style={{ background: 'transparent', border: `1px solid ${C.border}`, color: '#fff', borderRadius: 5, padding: '4px 9px', cursor: 'pointer', fontSize: 10 }}>
                  + personalizada
                </button>
              </div>
            </div>
            {loadPicker.open && (
              <div style={{ background: C.dark, border: `1px solid ${C.teal}55`, borderRadius: 7, padding: 10, marginBottom: 8 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    autoFocus
                    placeholder="Buscar (ej: nevera, ordeñadora, bomba 2 HP)..."
                    value={loadPicker.search}
                    onChange={e => setLoadPicker(s => ({ ...s, search: e.target.value }))}
                    style={{ ...ss.inp, padding: '6px 9px', fontSize: 11, flex: '1 1 220px' }}
                  />
                  <button type="button" onClick={() => setLoadPicker({ open: false, search: '', category: 'all' })}
                    style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, borderRadius: 5, padding: '5px 9px', cursor: 'pointer', fontSize: 10 }}>
                    cerrar
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                  {loadCategories.map(cat => (
                    <button key={cat} type="button"
                      onClick={() => setLoadPicker(s => ({ ...s, category: cat }))}
                      style={{
                        background: loadPicker.category === cat ? C.teal : 'transparent',
                        border: `1px solid ${loadPicker.category === cat ? C.teal : C.border}`,
                        color: loadPicker.category === cat ? '#001014' : C.muted,
                        borderRadius: 12, padding: '3px 9px', cursor: 'pointer', fontSize: 10, fontWeight: 600,
                      }}>
                      {cat === 'all' ? `Todas (${loadsPresets.length})` : cat}
                    </button>
                  ))}
                </div>
                <div style={{ maxHeight: 260, overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: 6 }}>
                  {filteredLoadPresets.length === 0 ? (
                    <div style={{ padding: '12px', fontSize: 11, color: C.muted, textAlign: 'center' }}>
                      No hay coincidencias. Prueba otro término o usa "+ personalizada".
                    </div>
                  ) : filteredLoadPresets.map((p, idx) => (
                    <div key={`${p.name}-${idx}`}
                      onClick={() => addLoadFromPreset(p)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1.6fr 0.7fr 0.7fr 0.5fr 60px',
                        gap: 8, alignItems: 'center',
                        padding: '7px 10px',
                        borderBottom: `1px solid ${C.border}`,
                        cursor: 'pointer', fontSize: 11,
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = `${C.teal}18`}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <div>
                        <div style={{ color: '#fff', fontWeight: 600 }}>{p.name}</div>
                        <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{p.category || 'Otros'}</div>
                      </div>
                      <div style={{ color: C.teal, fontWeight: 600 }}>{p.watts} W</div>
                      <div style={{ color: C.muted }}>{p.hours} h/día</div>
                      <div style={{ color: C.muted }}>x{p.qty || 1}</div>
                      <div style={{ textAlign: 'right' }}>
                        {p.peakWatts && p.peakWatts > p.watts ? (
                          <span style={{ fontSize: 9, color: C.orange }} title="Potencia de arranque (inductiva)">pico {p.peakWatts}W</span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 6, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                  <span>Click en una fila para agregarla al cuadro. Puedes ajustarla después.</span>
                  <span>{filteredLoadPresets.length} / {loadsPresets.length} resultados</span>
                </div>
              </div>
            )}
            {(f.loadItems || []).length === 0 ? (
              <div style={{ background: C.dark, border: `1px dashed ${C.border}`, borderRadius: 6, padding: '14px 12px', fontSize: 11, color: C.muted, textAlign: 'center' }}>
                Agrega las cargas de tu finca/vivienda (nevera, luces, TV, bomba...) o carga la plantilla típica.
              </div>
            ) : (
              <div style={{ background: C.dark, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 0.8fr 0.7fr 0.5fr 28px', gap: 6, fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, padding: '2px 0 6px' }}>
                  <span>Carga</span><span>Watts</span><span>Horas/día</span><span>Cant.</span><span></span>
                </div>
                {f.loadItems.map(it => {
                  const kwhDay = (Number(it.watts || 0) * Number(it.hours || 0) * Number(it.qty || 0)) / 1000;
                  return (
                    <div key={it.id} style={{ display: 'grid', gridTemplateColumns: '1.6fr 0.8fr 0.7fr 0.5fr 28px', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                      <input style={{ ...ss.inp, padding: '6px 8px', fontSize: 11 }} placeholder="Ej: Nevera" value={it.name}
                        onChange={e => u('loadItems', f.loadItems.map(x => x.id === it.id ? { ...x, name: e.target.value } : x))} />
                      <input type="number" style={{ ...ss.inp, padding: '6px 8px', fontSize: 11 }} placeholder="W" value={it.watts}
                        onChange={e => u('loadItems', f.loadItems.map(x => x.id === it.id ? { ...x, watts: e.target.value } : x))} />
                      <input type="number" step="0.1" style={{ ...ss.inp, padding: '6px 8px', fontSize: 11 }} placeholder="h/día" value={it.hours}
                        onChange={e => u('loadItems', f.loadItems.map(x => x.id === it.id ? { ...x, hours: e.target.value } : x))} />
                      <input type="number" style={{ ...ss.inp, padding: '6px 8px', fontSize: 11 }} value={it.qty}
                        onChange={e => u('loadItems', f.loadItems.map(x => x.id === it.id ? { ...x, qty: e.target.value } : x))} />
                      <button type="button" title={`${kwhDay.toFixed(2)} kWh/día`}
                        onClick={() => u('loadItems', f.loadItems.filter(x => x.id !== it.id))}
                        style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, borderRadius: 4, cursor: 'pointer', fontSize: 12, height: 30 }}>×</button>
                    </div>
                  );
                })}
                <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: C.muted }}>Total estimado</span>
                  <span style={{ color: C.teal, fontWeight: 700 }}>{loadDailyKwh.toFixed(2)} kWh/día · {loadMonthlyKwh} kWh/mes</span>
                </div>
              </div>
            )}
            <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>Suma aproximada. Ajusta watts y horas según tus equipos reales.</div>
          </div>
        ) : (
          <div style={{ marginBottom: 13 }}>
            <label style={ss.lbl}>Consumo mensual (kWh) — del recibo de energía</label>
            <input type="number" style={ss.inp} placeholder="Ej: 450" value={f.monthlyKwh} onChange={e => u('monthlyKwh', e.target.value)} />
            <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>Busca "Energía activa" o "kWh consumidos" en tu factura</div>
          </div>
        )}
        <div style={{ marginBottom: 13 }}>
          <label style={ss.lbl}>Operador de red / empresa de energía</label>
          <select style={{ ...ss.inp, cursor: 'pointer' }} value={f.operatorId} onChange={e => u('operatorId', parseInt(e.target.value))}>
            {operators.map((op, i) => <option key={i} value={i}>{op.name}{op.region ? ` — ${op.region}` : ''}</option>)}
          </select>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>
            Tarifa: <span style={{ color: C.teal }}>{operator.tariff} COP/kWh</span> · PSH: <span style={{ color: C.teal }}>{operator.psh} h/día</span>
          </div>
        </div>
        <div style={{ marginBottom: 13 }}>
          <label style={ss.lbl}>Acometida / fases de la carga (RETIE 240)</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['monofasico', 'bifasico', 'trifasico'].map(ph => {
              const info = ACOMETIDA_INFO[ph];
              const active = f.acometida === ph;
              return (
                <button key={ph} type="button" onClick={() => { u('acometida', ph); u('phaseManual', true); }}
                  style={{ flex: '1 1 140px', minWidth: 130, padding: '8px 10px', borderRadius: 7,
                           border: `2px solid ${active ? C.teal : C.border}`,
                           background: active ? `${C.teal}22` : 'transparent',
                           color: active ? C.teal : '#fff', cursor: 'pointer',
                           textAlign: 'left', lineHeight: 1.3 }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{info.label}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>{info.hilos} · {info.volts}</div>
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
            {f.phaseManual ? 'Selección manual.' : `Sugerido por consumo: ${ACOMETIDA_INFO[suggestedAcometida].label}.`}
            {' '}<span style={{ color: C.teal }}>{ACOMETIDA_INFO[f.acometida].retie}</span>
            {' · '}El inversor se filtra por fase: {f.acometida === 'trifasico' ? 'trifásico (3F)' : 'monofásico / bifásico (1F)'}.
            {f.phaseManual && <button type="button" onClick={() => u('phaseManual', false)} style={{ marginLeft: 8, background: 'transparent', border: 'none', color: C.teal, cursor: 'pointer', fontSize: 10, textDecoration: 'underline' }}>auto</button>}
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
            <div style={{ marginTop: 8, position: 'relative' }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <input
                  type="text"
                  style={{ ...ss.inp, flex: '1 1 200px', minWidth: 0 }}
                  placeholder="Dirección o ciudad (ej: Cra 10 #5-20, Villavicencio)"
                  value={roofQuery}
                  onChange={e => {
                    const v = e.target.value;
                    setRoofQuery(v);
                    setAddrSuggestOpen(true);
                    if (addrDebounceRef.current) clearTimeout(addrDebounceRef.current);
                    if (!placesSessionRef.current) placesSessionRef.current = newPlacesSessionToken();
                    addrDebounceRef.current = setTimeout(async () => {
                      if (v.trim().length < 3) { setAddrSuggestions([]); return; }
                      setAddrLoading(true);
                      const r = await autocompleteAddress(v.trim(), placesSessionRef.current);
                      setAddrLoading(false);
                      if (r.ok) setAddrSuggestions(r.suggestions || []);
                    }, 350);
                  }}
                  onFocus={() => setAddrSuggestOpen(true)}
                  onBlur={() => setTimeout(() => setAddrSuggestOpen(false), 200)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setAddrSuggestOpen(false); onLookupRoof(); } }}
                />
                <button
                  type="button"
                  onClick={onLookupRoof}
                  disabled={roofLoading}
                  style={{ ...ss.btn, padding: '8px 14px', fontSize: 12, opacity: roofLoading ? 0.6 : 1 }}
                >
                  {roofLoading ? '⏳ Buscando…' : '📍 Estimar área'}
                </button>
                <button
                  type="button"
                  onClick={onUseMyLocation}
                  disabled={roofLoading}
                  title="Usar la ubicación GPS de tu dispositivo (mayor precisión)"
                  style={{ background: 'transparent', border: `1px solid ${C.teal}66`, color: C.teal, padding: '8px 12px', borderRadius: 7, fontSize: 11, cursor: 'pointer', opacity: roofLoading ? 0.6 : 1, whiteSpace: 'nowrap' }}
                >
                  🛰 GPS
                </button>
              </div>
              <div style={{ fontSize: 9, color: C.muted, marginTop: 4 }}>
                Tip: también puedes pegar coordenadas directas en el formato <code style={{ color: C.teal }}>lat, lon</code> (ej: <code>4.1383, -73.6335</code>) para máxima precisión.
              </div>
              {addrSuggestOpen && addrSuggestions.length > 0 && (
                <ul style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
                  background: C.card, border: `1px solid ${C.teal}55`, borderRadius: 8,
                  listStyle: 'none', padding: 4, zIndex: 50, maxHeight: 280, overflowY: 'auto',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
                }}>
                  {addrSuggestions.map(s => (
                    <li
                      key={s.placeId}
                      onMouseDown={(e) => { e.preventDefault(); }}
                      onClick={() => {
                        setRoofQuery(s.description);
                        setAddrSuggestions([]);
                        setAddrSuggestOpen(false);
                      }}
                      style={{ padding: '8px 10px', cursor: 'pointer', borderRadius: 6, fontSize: 12, lineHeight: 1.3 }}
                      onMouseEnter={(e) => e.currentTarget.style.background = `${C.teal}18`}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ color: '#fff', fontWeight: 600 }}>{s.main}</div>
                      {s.secondary && <div style={{ color: C.muted, fontSize: 10, marginTop: 1 }}>{s.secondary}</div>}
                    </li>
                  ))}
                  {addrLoading && <li style={{ padding: '6px 10px', fontSize: 10, color: C.muted }}>Buscando…</li>}
                </ul>
              )}
            </div>
          )}
          {roofError && <div style={{ fontSize: 10, color: C.orange, marginTop: 5 }}>⚠ {roofError}</div>}
          {f.roofLookupSource && (
            <div style={{ fontSize: 10, color: C.muted, marginTop: 5, lineHeight: 1.5 }}>
              Fuente: <span style={{ color: C.teal, fontWeight: 600 }}>
                {f.roofLookupSource === 'google' ? 'Google Solar API' : f.roofLookupSource === 'claude' ? 'Estimación asistida' : f.roofLookupSource}
              </span>
              {f.lat != null && f.lon != null && <> · {Number(f.lat).toFixed(4)}, {Number(f.lon).toFixed(4)}</>}
              {f.roofLookupNotes && <> · {f.roofLookupNotes}</>}
              {f.shadeIndex != null && (
                <div style={{ marginTop: 3 }}>
                  ☀ Sombra local: <span style={{ color: f.shadeIndex >= 0.9 ? C.teal : f.shadeIndex >= 0.8 ? C.yellow : C.orange, fontWeight: 700 }}>
                    {Math.round((1 - f.shadeIndex) * 100)}% pérdida
                  </span> · índice {f.shadeIndex.toFixed(2)} ({f.shadeSource === 'google-solar-panels' || f.shadeSource === 'google-datalayers' ? 'Google Solar API' : f.shadeSource === 'claude-estimate' ? 'estimación IA' : f.shadeSource})
                </div>
              )}
              {(f.roofTiltDeg != null || f.roofAzimuthDeg != null) && (
                <div style={{ marginTop: 3 }}>
                  Orientación: <strong style={{ color: C.teal }}>
                    {f.roofTiltDeg != null ? `${Math.round(f.roofTiltDeg)}° incl.` : ''}
                    {f.roofTiltDeg != null && f.roofAzimuthDeg != null ? ' · ' : ''}
                    {f.roofAzimuthDeg != null ? `${Math.round(f.roofAzimuthDeg)}° azimut` : ''}
                  </strong>
                </div>
              )}
              {f.sunshineHoursYear != null && (
                <div style={{ marginTop: 3 }}>
                  Horas sol/año: <strong style={{ color: C.yellow }}>{Math.round(f.sunshineHoursYear).toLocaleString('es-CO')}</strong>
                  {f.googleMaxPanels != null && <> · capacidad máx. Google: <strong style={{ color: C.teal }}>{f.googleMaxPanels} paneles</strong></>}
                </div>
              )}
              {f.roofSegments?.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <div style={{ color: C.teal, marginBottom: 2 }}>Segmentos de techo ({f.roofSegments.length}):</div>
                  {f.roofSegments.map((s, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingLeft: 8, marginBottom: 1 }}>
                      <span style={{ color: C.muted }}>{i + 1}.</span>
                      {s.areaMeters2 != null && <span><strong>{s.areaMeters2.toFixed(0)} m²</strong></span>}
                      {s.azimuthDegrees != null && <span>{Math.round(s.azimuthDegrees)}° az.</span>}
                      {s.pitchDegrees != null && <span>{Math.round(s.pitchDegrees)}° incl.</span>}
                      {s.sunshineHoursPerYear != null && <span style={{ color: C.yellow }}>{Math.round(s.sunshineHoursPerYear)} h☀</span>}
                    </div>
                  ))}
                </div>
              )}
              {f.roofImagery && (
                <div style={{ marginTop: 3 }}>
                  Imágenes Google Solar:{' '}
                  {f.roofImagery.imageryDate && (
                    <span style={{ color: C.teal }}>
                      {[f.roofImagery.imageryDate.year, String(f.roofImagery.imageryDate.month || '').padStart(2, '0')].filter(Boolean).join('-')}
                    </span>
                  )}
                  {f.roofImagery.imageryQuality && <> · <span style={{ color: C.teal }}>{f.roofImagery.imageryQuality}</span></>}
                </div>
              )}
              {f.roofImagery && (f.roofImagery.rgbUrl || f.roofImagery.annualFluxUrl || f.roofImagery.dsmUrl) && (
                <div style={{ marginTop: 4, fontSize: 9, color: C.muted, lineHeight: 1.5 }}>
                  <div style={{ color: C.muted, marginBottom: 2 }}>📦 Archivos técnicos (.tif para análisis GIS — el preview visible es la imagen satelital de arriba):</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingLeft: 6 }}>
                    {f.roofImagery.rgbUrl && <a href={f.roofImagery.rgbUrl} target="_blank" rel="noreferrer" download style={{ color: C.teal, textDecoration: 'none' }}>RGB.tif ↓</a>}
                    {f.roofImagery.dsmUrl && <a href={f.roofImagery.dsmUrl} target="_blank" rel="noreferrer" download style={{ color: C.teal, textDecoration: 'none' }}>DSM.tif ↓</a>}
                    {f.roofImagery.maskUrl && <a href={f.roofImagery.maskUrl} target="_blank" rel="noreferrer" download style={{ color: C.teal, textDecoration: 'none' }}>máscara.tif ↓</a>}
                    {f.roofImagery.annualFluxUrl && <a href={f.roofImagery.annualFluxUrl} target="_blank" rel="noreferrer" download style={{ color: C.teal, textDecoration: 'none' }}>flujo anual.tif ↓</a>}
                    {f.roofImagery.monthlyFluxUrl && <a href={f.roofImagery.monthlyFluxUrl} target="_blank" rel="noreferrer" download style={{ color: C.teal, textDecoration: 'none' }}>flujo mensual.tif ↓</a>}
                    {f.roofImagery.hourlyShadeUrls?.length > 0 && <span>{f.roofImagery.hourlyShadeUrls.length} capas sombra horaria</span>}
                  </div>
                </div>
              )}
              <div style={{ marginTop: 3 }}>
                Área usada por panel: <strong style={{ color: C.teal }}>{m2PerPanel.toFixed(2)} m²</strong> (huella real + packing {Math.round(DEFAULT_PACKING_FACTOR * 100)}%)
              </div>
            </div>
          )}

          {f.roofStaticMapUrl && (() => {
            const conf = Number(f.roofConfidence || 0);
            const confPct = Math.round(conf * 100);
            const confColor = conf >= 0.9 ? C.green : conf >= 0.8 ? C.teal : conf >= 0.7 ? C.yellow : C.orange;
            return (
              <div style={{ marginTop: 10, background: C.dark, border: `1px solid ${C.teal}33`, borderRadius: 9, overflow: 'hidden' }}>
                <div style={{ padding: '8px 12px', background: `${C.teal}10`, fontSize: 10, color: C.muted, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                  <span>🛰 Vista del sitio</span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {f.roofImageryQuality && (
                      <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 10, background: f.roofImageryQuality === 'HIGH' ? `${C.green}30` : f.roofImageryQuality === 'MEDIUM' ? `${C.yellow}30` : `${C.orange}30`, color: f.roofImageryQuality === 'HIGH' ? C.green : f.roofImageryQuality === 'MEDIUM' ? C.yellow : C.orange, fontWeight: 700 }}>
                        Calidad {f.roofImageryQuality}
                      </span>
                    )}
                    {confPct > 0 && (
                      <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 10, background: `${confColor}30`, color: confColor, fontWeight: 700 }}>
                        Confiabilidad {confPct}%
                      </span>
                    )}
                    <a href={`https://www.google.com/maps/@${f.lat},${f.lon},20z`} target="_blank" rel="noreferrer" style={{ color: C.teal, fontSize: 10, textDecoration: 'none' }}>
                      Abrir Maps ↗
                    </a>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: f.roofStaticMapRoadUrl ? '1fr 1fr' : '1fr', gap: 1, background: C.border }}>
                  <div>
                    <div style={{ fontSize: 9, padding: '4px 8px', color: C.muted, background: C.dark }}>Satelital · zoom 20 (techo)</div>
                    <img src={f.roofStaticMapUrl} alt="Vista satelital del techo"
                      style={{ display: 'block', width: '100%', height: 'auto', maxHeight: 240, objectFit: 'cover' }}
                      onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  </div>
                  {f.roofStaticMapRoadUrl && (
                    <div>
                      <div style={{ fontSize: 9, padding: '4px 8px', color: C.muted, background: C.dark }}>Calles · zoom 16 (contexto)</div>
                      <img src={f.roofStaticMapRoadUrl} alt="Vista de calles"
                        style={{ display: 'block', width: '100%', height: 'auto', maxHeight: 240, objectFit: 'cover' }}
                        onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    </div>
                  )}
                </div>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: f.roofLocationConfirmed ? `${C.green}10` : `${C.yellow}08`, borderTop: `1px solid ${C.border}`, cursor: 'pointer', fontSize: 11 }}>
                  <input
                    type="checkbox"
                    checked={!!f.roofLocationConfirmed}
                    onChange={(e) => u('roofLocationConfirmed', e.target.checked)}
                    style={{ marginTop: 2, accentColor: C.teal, flexShrink: 0 }}
                  />
                  <span style={{ color: f.roofLocationConfirmed ? C.green : C.text, lineHeight: 1.5 }}>
                    {f.roofLocationConfirmed ? '✓ ' : ''}<strong>Confirmo que esta es la ubicación de la instalación.</strong>
                    <span style={{ display: 'block', color: C.muted, fontSize: 10, marginTop: 2 }}>
                      Verifica en las imágenes que el techo donde irán los paneles corresponde con esta dirección. Si no es correcta, vuelve a buscar arriba.
                    </span>
                  </span>
                </label>
              </div>
            );
          })()}

          {(f.lat != null || f.availableArea) && (
            <div style={{ marginTop: 10 }}>
              <label style={ss.lbl}>Material del techo (RETIE NTC 2050)</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {Object.entries(ROOF_MATERIALS).map(([key, m]) => {
                  const selected = f.roofMaterial === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => u('roofMaterial', selected ? null : key)}
                      style={{
                        padding: '6px 12px', borderRadius: 18, fontSize: 11, cursor: 'pointer',
                        border: `1.5px solid ${selected ? (m.structuralRisk ? C.orange : C.teal) : C.border}`,
                        background: selected ? `${m.structuralRisk ? C.orange : C.teal}20` : 'transparent',
                        color: selected ? (m.structuralRisk ? C.orange : C.teal) : C.muted,
                        fontWeight: selected ? 600 : 400,
                        display: 'flex', alignItems: 'center', gap: 5,
                      }}
                    >
                      <span style={{ fontSize: 13 }}>{m.icon}</span>
                      {m.label}
                      {m.structuralRisk && <span title="Requiere cálculo estructural">⚠</span>}
                    </button>
                  );
                })}
              </div>
              {f.roofMaterial && ROOF_MATERIALS[f.roofMaterial] && (
                <div style={{ marginTop: 6, fontSize: 10, color: C.muted, lineHeight: 1.5 }}>
                  Sistema de montaje sugerido: <strong style={{ color: C.teal }}>{ROOF_MATERIALS[f.roofMaterial].mountingType}</strong>
                  {ROOF_MATERIALS[f.roofMaterial].weightKgM2 != null && (
                    <> · Peso material existente: <strong style={{ color: '#fff' }}>{ROOF_MATERIALS[f.roofMaterial].weightKgM2} kg/m²</strong></>
                  )}
                  <div style={{ marginTop: 3 }}>{ROOF_MATERIALS[f.roofMaterial].notes}</div>
                </div>
              )}
            </div>
          )}

          {(() => {
            const userArea = parseFloat(f.availableArea);
            const googleArea = Number(f.googleAreaM2);
            if (!userArea || !googleArea || userArea <= 0 || googleArea <= 0) return null;
            const diffPct = ((userArea - googleArea) / googleArea) * 100;
            const significant = Math.abs(diffPct) >= 30;
            if (!significant) return null;
            const userBigger = diffPct > 0;
            return (
              <div style={{ marginTop: 8, padding: '10px 12px', background: `${C.yellow}10`, border: `1px solid ${C.yellow}55`, borderRadius: 8, fontSize: 11, color: C.text, lineHeight: 1.5 }}>
                <div style={{ fontWeight: 700, color: C.yellow, marginBottom: 4 }}>⚠ Discrepancia área declarada vs Google Solar</div>
                <div style={{ fontSize: 10, color: C.muted }}>
                  Tu declaración: <strong style={{ color: '#fff' }}>{userArea} m²</strong> (✏ manual) ·
                  Google detectó: <strong style={{ color: '#fff' }}>{Math.round(googleArea)} m²</strong> (🛰 satélite) ·
                  Diferencia: <strong style={{ color: userBigger ? C.orange : C.teal }}>{userBigger ? '+' : ''}{diffPct.toFixed(0)}%</strong>
                </div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
                  {userBigger
                    ? `Tu área supera lo detectado por Google. Verifica si estás incluyendo patios cubiertos, anexos no contiguos, o áreas con obstáculos (ductos AC, antenas, claraboyas) que satélite no descuenta.`
                    : `Google detecta más techo del que declaraste. Puede haber área aprovechable adicional — confirma si la limitación es voluntaria (paneles existentes, vista preservada, arrendamiento).`}
                </div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
                  El cotizador usa <strong style={{ color: '#fff' }}>tu declaración</strong> ({userArea} m²) — el cliente sabe qué porción del techo va a usar.
                </div>
              </div>
            );
          })()}
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
                <div style={{ fontSize: 11, color: C.muted, marginTop: 6, lineHeight: 1.6 }}>
                  <div>
                    Banco total: <strong style={{ color: C.teal }}>{(batt.kwh * f.battQty).toFixed(2)} kWh</strong> · {f.battQty} × {batt.kwh} kWh
                    {requiredBankKwh > 0 && (batt.kwh * f.battQty) < requiredBankKwh && (
                      <span style={{ color: C.orange, marginLeft: 6 }}>⚠ bajo lo requerido</span>
                    )}
                  </div>
                  <div>
                    Configuración: <strong style={{ color: C.teal }}>{bankSeries}S × {bankParallel}P</strong>
                    {' '}({bankSeries} en serie a {bankSeries * batt.voltage}V · {bankParallel} ramas en paralelo)
                    {bankOrphan > 0 && (
                      <span style={{ color: C.orange, marginLeft: 6 }}>
                        ⚠ {bankOrphan} batería{bankOrphan > 1 ? 's' : ''} sobrante{bankOrphan > 1 ? 's' : ''} — ajusta la cantidad a múltiplo de {bankSeries}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {!f.monthlyKwh && (
          <div style={{ marginTop: 14, padding: '10px 12px', background: `${C.yellow}12`, border: `1px solid ${C.yellow}55`, borderRadius: 7, fontSize: 11, color: C.yellow, lineHeight: 1.5 }}>
            <strong>Falta el consumo mensual (kWh)</strong> — {f.systemType === 'off-grid'
              ? 'agrega las cargas en el Cuadro de cargas de arriba (o usa el preset "+ cargas típicas"). El consumo mensual se calcula solo.'
              : 'anótalo del recibo de energía ("Energía activa" / "kWh consumidos").'}
            {' El área ('}{f.availableArea || '—'}{' m²) es opcional y ya la registramos.'}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
          <button style={ss.ghost} onClick={() => setStep(2)}>← Atrás</button>
          <button
            style={{ ...ss.btn, opacity: !f.monthlyKwh ? 0.4 : 1, cursor: !f.monthlyKwh ? 'not-allowed' : 'pointer' }}
            title={!f.monthlyKwh ? 'Ingresa el consumo mensual arriba para continuar' : ''}
            onClick={() => {
              if (f.monthlyKwh) { setStep(4); return; }
              setRoofError('Falta el consumo mensual (kWh). El área manual ya está guardada.');
            }}
          >Siguiente →</button>
        </div>
      </div>
    </div>
  );

  // STEP 4: Transport — último paso antes del cálculo (dispara APIs)
  if (step === 4) return (
    <div style={ss.wrap}><Prog />
      <div style={ss.card}>
        <div style={ss.h2}>Ciudad de instalación</div>
        <div style={{ marginBottom: 14 }}>
          <label style={ss.lbl}>Ciudad destino (incluye cabeceras y ciudades intermedias)</label>
          <select style={{ ...ss.inp, cursor: 'pointer' }} value={f.destId} onChange={e => u('destId', e.target.value)}>
            {Array.from(new Set(DESTINOS_COURIER.map(d => d.dept))).map(dp => (
              <optgroup key={dp} label={dp}>
                {DESTINOS_COURIER.filter(d => d.dept === dp).map(d => (
                  <option key={d.id} value={d.id}>{d.city} ({d.tiempo} · {ZONA_LABEL[d.zona]})</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        {dest && (
          <div style={{ background: `${C.teal}12`, border: `1px solid ${C.teal}33`, borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 11, color: C.muted }}>Destino:</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.teal }}>{dest.city}, {dest.dept}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 11, color: C.muted }}>Zona de tarifa:</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.teal }}>{ZONA_LABEL[dest.zona]}</span>
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
          📦 El cotizador evalúa {Object.keys(CARRIERS).length} transportadoras ({Object.values(CARRIERS).map(c => c.label).join(', ')}) y selecciona la más económica por destino y peso del sistema. Tarifas referenciales 2025-2026.
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}>
          <button style={ss.ghost} onClick={() => setStep(3)}>← Atrás</button>
          <button
            style={{ ...ss.btn, opacity: loadingPVGIS ? 0.4 : 1 }}
            disabled={loadingPVGIS}
            onClick={async () => {
              setResultTab('resumen');
              setStep(5);
              await calculate();
            }}
          >
            {loadingPVGIS ? 'Calculando…' : 'Ver mi sistema →'}
          </button>
        </div>
      </div>
    </div>
  );

  // STEP 2: Contact (antes de consumir APIs — previene abuso/reuso)
  if (step === 2) return (
    <div style={ss.wrap}><Prog />
      <div style={ss.card}>
        <div style={ss.h2}>Datos de contacto</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: -8, marginBottom: 14, lineHeight: 1.5 }}>
          Necesitamos identificarte antes de ejecutar el cálculo. Así evitamos consumo innecesario de APIs y podemos enviarte la propuesta técnica.
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 11, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 180px', minWidth: 0 }}><label style={ss.lbl}>Nombre *</label><input style={ss.inp} value={f.name} onChange={e => u('name', e.target.value)} placeholder="Nombre completo" autoComplete="name" /></div>
          <div style={{ flex: '1 1 180px', minWidth: 0 }}><label style={ss.lbl}>Empresa / Predio</label><input style={ss.inp} value={f.company} onChange={e => u('company', e.target.value)} placeholder="Empresa o predio" autoComplete="organization" /></div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 11, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 180px', minWidth: 0 }}><label style={ss.lbl}>Teléfono / WhatsApp *</label><input style={ss.inp} value={f.phone} onChange={e => u('phone', e.target.value)} placeholder="300 000 0000" autoComplete="tel" inputMode="tel" /></div>
          <div style={{ flex: '1 1 180px', minWidth: 0 }}><label style={ss.lbl}>Email *</label><input style={ss.inp} value={f.email} onChange={e => u('email', e.target.value)} placeholder="tu@email.com" autoComplete="email" inputMode="email" /></div>
        </div>
        <div style={{ marginBottom: 14 }}><label style={ss.lbl}>Dirección / Municipio</label><input style={ss.inp} value={f.address} onChange={e => u('address', e.target.value)} placeholder="Municipio o dirección exacta" autoComplete="street-address" /></div>
        {/* Honeypot anti-bot — invisible para humanos, los bots lo llenan */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={f.website || ''}
          onChange={e => u('website', e.target.value)}
          style={{ position: 'absolute', left: '-10000px', top: 'auto', width: 1, height: 1, overflow: 'hidden', opacity: 0 }}
          aria-hidden="true"
        />
        {contactError && (
          <div style={{ background: `${C.orange}15`, border: `1px solid ${C.orange}55`, borderRadius: 7, padding: '10px 12px', marginBottom: 12, fontSize: 11, color: C.orange, lineHeight: 1.5 }}>
            ⚠ {contactError}
          </div>
        )}
        <div style={{ background: `${C.teal}10`, borderRadius: 6, padding: '8px 12px', marginBottom: 14, fontSize: 10, color: C.muted }}>🔒 Información confidencial. Solo usada por ingenieros ALEBAS para tu propuesta técnica.</div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button style={ss.ghost} onClick={() => setStep(1)}>← Atrás</button>
          <button
            style={{ ...ss.btn, opacity: (!f.name || !f.phone || !f.email || validatingContact) ? 0.4 : 1 }}
            disabled={validatingContact}
            onClick={async () => {
              const ok = await validateContact();
              if (ok) setStep(3);
            }}
          >
            {validatingContact ? 'Validando…' : 'Siguiente →'}
          </button>
        </div>
      </div>
    </div>
  );

  // STEP 5: Results — pantalla de carga dinámica con orquestación de herramientas
  if (step === 5 && (!res || !bgt)) return <LoadingSystem C={C} ss={ss} logo={logo} f={f} operator={operator} needsB={needsB} dest={dest} />;

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
          <button style={ss.btn} onClick={() => { setStep(0); setDone(false); setRes(null); setBgt(null); setF(Q0); setPvgisError(null); setXmError(null); setAgpe(null); setResultTab('resumen'); }}>Nueva cotización</button>
        </div>
      </div>
    );

    const RESULT_TABS = [
      ['resumen', '📊', 'Resumen'],
      ['tecnico', '⚙', 'Técnico'],
      ['presupuesto', '◈', 'Presupuesto'],
      ['normativo', '§', 'Normativo'],
      ['observaciones', '✎', 'Observaciones'],
    ];
    const TAB_ORDER = ['resumen', 'tecnico', 'presupuesto', 'normativo', 'observaciones'];
    const TAB_LABEL = { resumen: 'Resumen', tecnico: 'Técnico', presupuesto: 'Presupuesto', normativo: 'Marco normativo', observaciones: 'Observaciones' };
    const showResumen = resultTab === 'resumen';
    const showTecnico = resultTab === 'tecnico';
    const showPresupuesto = resultTab === 'presupuesto';
    const showNormativo = resultTab === 'normativo';
    const showObservaciones = resultTab === 'observaciones';
    return (
      <div style={ss.wrap}>
        <div style={{ ...ss.card, textAlign: 'center', padding: '22px', borderColor: C.teal }}>
          <div style={{ fontSize: 9, color: C.teal, letterSpacing: 3, fontWeight: 700, marginBottom: 5, textTransform: 'uppercase' }}>Pre-dimensionamiento</div>
          <div style={{ fontSize: 36, fontWeight: 800, color: '#fff', marginBottom: 3 }}>{res.actKwp} <span style={{ color: C.yellow }}>kWp</span></div>
          <div style={{ color: C.muted, fontSize: 12 }}>{f.systemType} · {operator.name} · PSH {psh} h/día · {dest.city}, {dest.dept}</div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            {/* Fuente de producción — preferencia: PVWatts > PVGIS > PSH */}
            {res.productionSource === 'PVWatts' && (
              <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: `${C.green}22`, color: C.green, border: `1px solid ${C.green}55` }}>
                ✓ NREL PVWatts v8 · {pvwData?.solradAnnual} kWh/m²/año
              </span>
            )}
            {res.productionSource === 'PVGIS' && (
              <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: `${C.teal}22`, color: C.teal, border: `1px solid ${C.teal}55` }}>
                ✓ PVGIS · {dest.city}
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
                  {' '}<a href="https://app.fluxai.solutions" target="_blank" rel="noopener noreferrer" style={{ color: C.fluxGreen, fontWeight: 700, textDecoration: 'none' }}>FluxAI</a> concilia automáticamente los excedentes facturados contra la producción real medida.
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

        {showResumen && (
          <div style={{
            background: `linear-gradient(135deg, ${C.fluxBlue}10, ${C.fluxGreen}10)`,
            border: `1px solid ${C.fluxBlue}55`, borderRadius: 9, padding: '14px 16px', marginBottom: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <img src="/fluxai-logo.svg" alt="FluxAI" style={{ height: 28, display: 'block' }} />
                <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>
                  Monitoreo recomendado
                  <div style={{ fontSize: 9, color: C.muted, fontWeight: 500, marginTop: 2 }}>by ALEBAS Ingeniería</div>
                </div>
              </div>
              <a href="https://app.fluxai.solutions" target="_blank" rel="noopener noreferrer"
                 style={{ fontSize: 11, padding: '7px 16px', background: `linear-gradient(90deg, ${C.fluxGreen}, ${C.fluxBlue})`, color: '#fff', borderRadius: 7, fontWeight: 700, textDecoration: 'none' }}>
                Conocer FluxAI →
              </a>
            </div>
            <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.6 }}>
              <strong style={{ color: C.fluxGreen }}>FluxAI</strong> es la plataforma de monitoreo solar de ALEBAS Ingeniería (marca hermana de SolarHub). Te permite:
              <ul style={{ marginTop: 6, marginBottom: 0, paddingLeft: 18 }}>
                <li>Ver producción y consumo en tiempo real desde el celular.</li>
                <li>Recibir alertas si el sistema rinde por debajo de lo cotizado.</li>
                {f.systemType !== 'on-grid' && <li>Vigilar SoC del banco de baterías y autonomía real disponible.</li>}
                {f.wantsExcedentes && <li>Conciliar excedentes facturados por {operator.name} con la generación medida.</li>}
                <li>Histórico mensual y anual para validar el ROI estimado de la cotización.</li>
              </ul>
            </div>
          </div>
        )}

        {showResumen && aiConfigured() && !aiUnavailable && (
          <div style={{ ...ss.card, borderColor: C.yellow + '66', background: `${C.yellow}08`, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
                <span style={{ color: C.yellow }}>✦</span> Asistente IA — Revisión técnica
              </div>
              <button
                type="button"
                disabled={aiLoading}
                onClick={async () => {
                  setAiError(null); setAiLoading(true); setAiApplied(null); setAiStep(0);
                  try {
                    // Layout eléctrico — Voc en frío, Vmp en caliente, corriente por MPPT.
                    // Se calcula localmente para que la IA tenga métricas exactas y pueda
                    // hacer análisis técnico real, no genérico.
                    const layout = res.inv ? validateLayout(panel, res.inv, res.ppss, res.ns) : null;
                    const dcAcRatio = res.inv?.kw ? +(res.actKwp / res.inv.kw).toFixed(2) : null;
                    const out = await aiRecommend('review', {
                      systemType: f.systemType,
                      monthlyKwh: Number(f.monthlyKwh),
                      // Estado actual de campos aplicables — el sanitizer los compara con
                      // las propuestas del modelo para descartar valores iguales o inválidos.
                      acometida: f.acometida,
                      busVoltage: needsB ? f.busVoltage : null,
                      wantsExcedentes: !!f.wantsExcedentes,
                      operator: operator.name, psh,
                      location: { dept: dest.dept, city: dest.city, lat: f.lat, lon: f.lon, address: f.address || roofQuery || '' },
                      panel: {
                        brand: panel.brand, model: panel.model, wp: panel.wp,
                        voc: panel.voc, vmp: panel.vmp, imp: panel.imp,
                        tempCoeffVoc: panel.tempCoeffVoc, tempCoeffPmax: panel.tempCoeffPmax,
                        cellType: panel.cellType,
                        // eff derivado si el catálogo lo trae nulo (CEC SAM no siempre lo expone).
                        // wp / (m² × 1000) × 100. El backend AI también deriva como red de seguridad.
                        eff: panel.eff || (panel.wp && panel.length_m && panel.width_m
                          ? +((panel.wp / (panel.length_m * panel.width_m * 1000)) * 100).toFixed(2)
                          : null),
                        length_m: panel.length_m, width_m: panel.width_m,
                        technology: panel.technology,
                      },
                      inverter: res.inv ? {
                        brand: res.inv.brand, model: res.inv.model, kw: res.inv.kw,
                        type: res.inv.type, phase: res.inv.phase, offGridCapable: !!res.inv.offGridCapable,
                        vocMax: res.inv.vocMax, mpptVmin: res.inv.mpptVmin, mpptVmax: res.inv.mpptVmax,
                        mpptCount: res.inv.mpptCount, idcMax: res.inv.idcMax,
                      } : null,
                      battery: needsB ? { brand: batt.brand, model: batt.model, kwh: batt.kwh, voltage: batt.voltage, qty: f.battQty, totalKwh: +(batt.kwh * f.battQty).toFixed(2) } : null,
                      storageReqKwh: +requiredBankKwh.toFixed(2),
                      backup: f.systemType === 'off-grid' ? { autonomyDays: f.autonomyDays } : { hours: f.backupHours, criticalPct: f.criticalPct },
                      result: {
                        kwp: res.actKwp, numPanels: res.numPanels, monthlyProdKwh: res.mp,
                        coverage: res.cov, annualProdKwh: res.ap, roofM2: res.roof,
                        strings: res.ns, panelsPerString: res.ppss,
                        dcAcRatio,
                        currentLimited: !!res.currentLimited,
                        cappedByRegulation: !!res.cappedByRegulation,
                        noInverter: !!res.noInverter,
                      },
                      // Layout eléctrico calculado por validateLayout — la IA debe
                      // observar márgenes Voc/Vmp/Idc y reportar findings/warnings sin
                      // proponer cambios de catálogo (panel/inversor) que no son aplicables.
                      layout: layout ? {
                        ok: layout.ok,
                        errors: layout.errors,
                        warnings: layout.warnings,
                        stringVocCold: layout.metrics?.stringVocCold,
                        stringVmpStc: layout.metrics?.stringVmpStc,
                        stringVmpHot: layout.metrics?.stringVmpHot,
                        currentPerMppt: layout.metrics?.currentPerMppt,
                        stringsPerMppt: layout.metrics?.stringsPerMppt,
                        vocMax: layout.metrics?.vocMax,
                        mpptMin: layout.metrics?.mpptMin,
                        mpptMax: layout.metrics?.mpptMax,
                        idcMax: layout.metrics?.idcMax,
                        mpptCount: layout.metrics?.mpptCount,
                        vocMargin: layout.metrics?.vocMax ? +((1 - layout.metrics.stringVocCold / layout.metrics.vocMax) * 100).toFixed(1) : null,
                      } : null,
                      // Sombreado y orientación (Google Solar API si está disponible)
                      siteFactors: {
                        shadeIndex: f.shadeIndex,
                        shadeSource: f.shadeSource,
                        roofTiltDeg: f.roofTiltDeg,
                        roofAzimuthDeg: f.roofAzimuthDeg,
                        sunshineHoursYear: f.sunshineHoursYear,
                      },
                      budget: { total: bgt.tot, roi: bgt.roi },
                      roof: { availableM2: f.availableArea ? Number(f.availableArea) : null, source: f.roofLookupSource || null },
                      // Beneficio AGPE pre-calculado (autoconsumo + excedentes con precio bolsa XM)
                      // — habilita a la IA reforzar la decisión cuantificando ahorro/ingresos en COP
                      // en vez de re-sugerir AGPE cuando wantsExcedentes ya está marcado.
                      agpeBenefit: agpe ? {
                        gridExport: !!agpe.gridExport,
                        category: agpe.agpeCategory,
                        autoConsumedKwhYear: agpe.autoConsumed,
                        excedentesKwhYear: agpe.excedentes,
                        ahorroAutoconsumoCopYear: agpe.ahorroAutoconsumo,
                        ingresoExcedentesCopYear: agpe.ingresoExcedentes,
                        totalAnualCop: agpe.totalAnual,
                        tariffCuCopPerKwh: agpe.tariffCU,
                        priceExcedentesCopPerKwh: agpe.priceExcedentes,
                        xmSpotCopPerKwh: agpe.spotSource?.cop_per_kwh || null,
                        xmSpotPeriodDays: agpe.spotSource?.periodDays || null,
                      } : null,
                    });
                    setAiData(out);
                  } catch (e) {
                    const msg = e?.message || 'Error IA';
                    if (/Failed to fetch|NetworkError|aborted/i.test(msg)) {
                      setAiUnavailable(true);
                    } else {
                      setAiError(msg);
                    }
                  }
                  finally { setAiStep(AI_STEPS.length); setAiLoading(false); }
                }}
                style={{ ...ss.btn, background: C.yellow, color: '#000', padding: '7px 13px', fontSize: 11, opacity: aiLoading ? 0.6 : 1 }}
              >
                {aiLoading
                  ? <><span className="animate-spin" style={{ marginRight: 6 }}>◐</span>Analizando…</>
                  : aiData ? '↻ Volver a analizar' : '✦ Analizar con IA'}
              </button>
            </div>
            {aiLoading && (
              <div style={{ background: C.dark, border: `1px solid ${C.yellow}33`, borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: C.yellow, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
                  Cadena de revisión
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                  {AI_STEPS.map((label, i) => {
                    const done = i < aiStep;
                    const active = i === aiStep;
                    const pending = i > aiStep;
                    if (pending) return null; // entran progresivamente
                    return (
                      <li key={i} className="animate-slide-in" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: done ? C.muted : '#fff', marginBottom: 4 }}>
                        <span style={{ width: 16, display: 'inline-flex', justifyContent: 'center' }}>
                          {done && <span className="animate-check-pop" style={{ color: '#4ade80' }}>✓</span>}
                          {active && <span className="animate-spin" style={{ color: C.yellow }}>◐</span>}
                        </span>
                        <span style={{ textDecoration: done ? 'none' : 'none' }}>{label}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
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
                {(() => {
                  const allActions = aiData.actions || [];
                  const pending = allActions
                    .map(a => ({ ...a, coerced: coerceActionValue(a.field, a.value) }))
                    .filter(a => a.coerced !== undefined && f[a.field] !== a.coerced);
                  // Siempre rendereamos el bloque cuando hay aiData para que el usuario
                  // sepa explícitamente si la IA propuso cambios o si la config ya es
                  // coherente (caso pending=[] y aiApplied=null).
                  const headerLabel = pending.length > 0
                    ? `Mejoras automáticas (${pending.length})`
                    : aiApplied ? 'Mejoras aplicadas' : 'Mejoras automáticas';
                  return (
                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px dashed ${C.teal}44` }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                        <div style={{ fontSize: 10, color: C.teal, letterSpacing: 1, textTransform: 'uppercase' }}>
                          {headerLabel}
                        </div>
                        {pending.length > 0 && (
                          <button
                            type="button"
                            onClick={applyAiActions}
                            style={{ ...ss.btn, background: C.teal, color: '#000', padding: '7px 13px', fontSize: 11 }}
                          >
                            ✓ Aplicar mejoras y recalcular
                          </button>
                        )}
                      </div>
                      {pending.length > 0 && (
                        <ul style={{ margin: 0, paddingLeft: 18, color: '#fff' }}>
                          {pending.map((a, i) => (
                            <li key={i} style={{ marginBottom: 3 }}>
                              <strong style={{ color: C.teal }}>{a.label || a.field}</strong>
                              {a.reason ? <span style={{ color: C.muted }}> — {a.reason}</span> : null}
                              <span style={{ color: C.muted, fontSize: 10 }}> · {a.field}: {String(f[a.field])} → {String(a.coerced)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {aiApplied && pending.length === 0 && (
                        <div style={{ fontSize: 11, color: C.teal }}>
                          ✓ Cambios aplicados ({aiApplied.fields.join(', ')}). El sistema fue recalculado.
                        </div>
                      )}
                      {!aiApplied && pending.length === 0 && (() => {
                        const hasWarnings = (aiData.warnings || []).length > 0;
                        // Sistema estable: la IA revisó dimensionamiento, layout y normativa
                        // sin encontrar alertas críticas ni proponer ajustes aplicables.
                        if (allActions.length === 0 && !hasWarnings) {
                          return (
                            <div style={{ fontSize: 11, color: '#4ade80' }}>
                              ✓ Sistema estable — la IA revisó dimensionamiento, layout eléctrico y normativa sin encontrar ajustes necesarios.
                            </div>
                          );
                        }
                        // Hay warnings pero ninguna action aplicable (ej. cambios de hardware
                        // como optimizadores DC que no son campos del cotizador).
                        if (allActions.length === 0 && hasWarnings) {
                          return (
                            <div style={{ fontSize: 11, color: C.muted }}>
                              La IA detectó alertas que requieren revisión manual (ver "Alertas" arriba). No hay ajustes aplicables automáticamente a los campos del cotizador.
                            </div>
                          );
                        }
                        // El modelo propuso actions pero todas coinciden con la config actual
                        // o el coercer las descartó por dominio inválido.
                        return (
                          <div style={{ fontSize: 11, color: C.muted }}>
                            Las propuestas de la IA coinciden con la configuración actual o no aplican a los campos editables. Revisa las sugerencias arriba.
                          </div>
                        );
                      })()}
                    </div>
                  );
                })()}
                <div style={{ marginTop: 6, fontSize: 10, color: C.muted, textAlign: 'right' }}>
                  Cadena de revisión interna{aiData.provider ? ` · ${aiData.provider}` : ''}
                </div>
              </div>
            )}
            {!aiData && !aiError && !aiLoading && (
              <div style={{ fontSize: 11, color: C.muted }}>
                Revisión técnica interna del sistema: voltaje del bus, cobertura de baterías, dimensionamiento vs consumo, normativa AGPE/RETIE y recomendaciones específicas.
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
          {needsB && batt && f.battQty > 0 && (
            <>
              <div style={{ fontSize: 12, color: C.muted, margin: '4px 0 8px' }}>
                Banco de baterías: {bankSeries}S × {bankParallel}P ·
                {' '}bus DC a <span style={{ color: C.yellow }}>{bankSeries * batt.voltage} V</span> ·
                {' '}total <span style={{ color: C.yellow }}>{(batt.kwh * f.battQty).toFixed(2)} kWh</span>
                {bankOrphan > 0 && <span style={{ color: C.orange }}> · ⚠ {bankOrphan} sobrante{bankOrphan > 1 ? 's' : ''}</span>}
              </div>
              <div style={{ background: C.dark, border: `1px dashed ${C.yellow}55`, borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
                {Array.from({ length: bankParallel }).map((_, pIdx) => (
                  <div key={pIdx} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: pIdx < bankParallel - 1 ? 9 : 0 }}>
                    <div style={{ fontSize: 12, color: C.yellow, fontWeight: 700, minWidth: 44, letterSpacing: 0.5 }}>P{pIdx + 1}</div>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flex: 1, flexWrap: 'wrap' }}>
                      {Array.from({ length: bankSeries }).map((_, sIdx) => (
                        <React.Fragment key={sIdx}>
                          <div style={{ background: `${C.yellow}22`, border: `1px solid ${C.yellow}`, borderRadius: 4, padding: '4px 8px', minWidth: 62, textAlign: 'center' }}>
                            <div style={{ fontSize: 9, color: C.muted, lineHeight: 1 }}>🔋</div>
                            <div style={{ fontSize: 10, color: '#fff', fontWeight: 700 }}>{batt.voltage}V</div>
                            <div style={{ fontSize: 9, color: C.yellow }}>{batt.kwh}kWh</div>
                          </div>
                          {sIdx < bankSeries - 1 && (
                            <div style={{ fontSize: 11, color: C.yellow, fontWeight: 700 }}>—</div>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: C.muted, minWidth: 96, textAlign: 'right' }}>
                      {bankSeries} en serie · {(bankSeries * batt.kwh).toFixed(2)} kWh
                    </div>
                  </div>
                ))}
                {bankParallel > 1 && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.yellow}33`, fontSize: 10, color: C.muted, textAlign: 'center', letterSpacing: 0.5 }}>
                    ↕ {bankParallel} ramas en paralelo al bus {bankSeries * batt.voltage}V
                  </div>
                )}
              </div>
            </>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', flexWrap: 'wrap', padding: '6px 0 14px' }}>
            <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>DC</div>
            <div style={{ fontSize: 18, color: C.teal }}>→</div>
            <div style={{ background: res.inv ? `${C.teal}22` : `${C.orange}22`, border: `1px solid ${res.inv ? C.teal : C.orange}`, borderRadius: 7, padding: '9px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 }}>Inversor</div>
              {res.inv ? (
                <div style={{ fontSize: 14, color: '#fff', fontWeight: 700, marginTop: 2 }}>{res.inv.brand} {res.inv.kw} kW</div>
              ) : (
                <div style={{ fontSize: 11, color: C.orange, fontWeight: 700, marginTop: 2 }}>⚠ Consultar stock</div>
              )}
            </div>
            <div style={{ fontSize: 18, color: C.teal }}>→</div>
            {needsB && (
              <>
                <div style={{ background: `${C.yellow}22`, border: `1px solid ${C.yellow}`, borderRadius: 7, padding: '9px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 }}>Baterías</div>
                  <div style={{ fontSize: 14, color: '#fff', fontWeight: 700, marginTop: 2 }}>{f.battQty} × {batt.kwh} kWh</div>
                  <div style={{ fontSize: 10, color: C.yellow, marginTop: 3 }}>{bankSeries}S × {bankParallel}P · {bankSeries * batt.voltage}V bus</div>
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

        {showTecnico && res.inv && (() => {
          const expected = phasesForAcometida(f.acometida);
          const phaseOk = expected.includes(res.inv.phase);
          if (phaseOk) return null;
          return (
            <div style={{ ...ss.card, background: `${C.orange}12`, border: `1px solid ${C.orange}55` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.orange, marginBottom: 6 }}>⚠ Inversor de fase distinta a la acometida</div>
              <div style={{ fontSize: 11, color: C.text, lineHeight: 1.55 }}>
                Acometida configurada: <strong style={{ color: C.teal }}>{ACOMETIDA_INFO[f.acometida].label}</strong>
                {' '}({ACOMETIDA_INFO[f.acometida].hilos} · {ACOMETIDA_INFO[f.acometida].volts}).
                {' '}Inversor seleccionado: <strong>{res.inv.brand} {res.inv.model}</strong> — <strong style={{ color: C.orange }}>{res.inv.phase === 3 ? 'trifásico' : 'monofásico/bifásico'}</strong>.
                <br />
                No hay stock del tipo/fase exactos en el catálogo. Opciones: (a) cambiar la acometida arriba si el operador de red lo permite, (b) agregar un inversor compatible en BackOffice → Inversores, o (c) contactar a ALEBAS para disponibilidad especial.
              </div>
            </div>
          );
        })()}

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
              ['Inversor', `${res.inv?.brand} ${res.inv?.model}`], ['Potencia inv.', `${res.inv?.kw} kW · ${res.inv?.phase === 3 ? 'trifásico' : 'monofásico/bifásico'}`],
              ['Acometida', `${ACOMETIDA_INFO[f.acometida].label} (${ACOMETIDA_INFO[f.acometida].hilos} · ${ACOMETIDA_INFO[f.acometida].volts})`], ['Tipo sistema', f.systemType],
              ['Strings', `${res.ns} × ${res.ppss} paneles`], ['Ratio DC/AC', res.dca],
              ['Área techo', `${res.roof} m²`], ['Peso sistema', `${fmt(res.kgTotal)} kg`],
              ...(needsB ? [
                ['Baterías', `${f.battQty} × ${batt.brand} ${batt.model}`],
                ['Config. banco', `${bankSeries}S × ${bankParallel}P · ${bankSeries * batt.voltage}V bus`],
                ['Cap. total', `${res.tB} kWh`], ['Autonomía', `${res.aut} h`],
              ] : []),
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
            {[['Estructura', bgt.st], ['Cableado', bgt.ca], ['Protecciones', bgt.pt], ['Instalación certificada', bgt.ins], ['Ingeniería y diseño', bgt.eng], ['Trámites ' + operator.name, bgt.emsa], [`Transporte ${bgt.transportCarrier || '-'}`, bgt.transport, 'transport'], ['IVA ' + pricing.iva + '%', bgt.iva], ['Subtotal B', bgt.sB]].map(([l, v, kind], i, arr) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: i === arr.length - 1 ? 11 : 10 }}
                title={kind === 'transport' && Array.isArray(bgt.transportQuotes) ? bgt.transportQuotes.map(q => `${q.label}: ${fmtCOP(q.total)}`).join('\n') : ''}>
                <span style={{ color: i === arr.length - 1 ? '#fff' : C.muted }}>
                  {l}
                  {kind === 'transport' && bgt.transportQuotes && bgt.transportQuotes.length > 1 && (
                    <span style={{ color: C.teal, fontSize: 9, marginLeft: 6 }}>(mejor de {bgt.transportQuotes.length})</span>
                  )}
                </span>
                <span style={{ color: '#fff', fontWeight: i === arr.length - 1 ? 700 : 400 }}>{fmtCOP(v)}</span>
              </div>
            ))}
            {Array.isArray(bgt.transportQuotes) && bgt.transportQuotes.length > 0 && (
              <div style={{ background: `${C.teal}08`, border: `1px solid ${C.teal}22`, borderRadius: 6, padding: '8px 10px', marginTop: 4, marginBottom: 4, fontSize: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap', gap: 4 }}>
                  <span style={{ color: C.teal, fontWeight: 700 }}>✓ {bgt.transportCarrier}</span>
                  <span style={{ color: C.muted, fontSize: 9 }}>
                    Zona {ZONA_LABEL[bgt.transportZone] || bgt.transportZone} · {fmt(res.kgTotal)} kg · {dest.tiempo}
                  </span>
                </div>
                {bgt.transportQuotes[0]?.note && (
                  <div style={{ color: C.muted, fontSize: 9, marginBottom: 4, fontStyle: 'italic' }}>
                    {bgt.transportQuotes[0].note}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: C.muted }}>
                  <span>Flete: {fmtCOP(bgt.transportQuotes[0]?.flete || 0)}</span>
                  <span>Sobreflete 2%: {fmtCOP(bgt.transportQuotes[0]?.sf || 0)}</span>
                </div>
                {bgt.transportQuotes.length > 1 && (
                  <details style={{ marginTop: 6, fontSize: 9 }}>
                    <summary style={{ color: C.muted, cursor: 'pointer' }}>Comparar {bgt.transportQuotes.length} transportadoras ▾</summary>
                    <div style={{ marginTop: 6, paddingLeft: 6 }}>
                      {bgt.transportQuotes.map((q, idx) => (
                        <div key={q.carrierId} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: idx === 0 ? C.teal : C.muted, borderBottom: idx < bgt.transportQuotes.length - 1 ? `1px solid ${C.border}22` : 'none' }}>
                          <span style={{ flex: 1 }}>{idx === 0 ? '✓ ' : '  '}{q.label}</span>
                          <span style={{ marginRight: 8, fontSize: 8, color: C.muted, fontStyle: 'italic' }}>{q.note}</span>
                          <span style={{ minWidth: 80, textAlign: 'right' }}>{fmtCOP(q.total)}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
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

        {showObservaciones && (() => {
          const area = parseFloat(f.availableArea) || 0;
          const idealPanels = Math.ceil(consumptionKwp * 1000 / panel.wp);
          const idealArea = Math.ceil(idealPanels * m2PerPanel);
          const areaLimited = res.sizedFor === 'area';
          const obs = [];

          if (res.cappedByRegulation) {
            obs.push({ type: 'warn', title: `Sistema acotado a ${MAX_KWP_AGPE} kWp por normativa`, text: `Tu consumo requeriría más de ${MAX_KWP_AGPE} kWp pero el alcance AGPE Mayor (CREG 174/2021) limita el cotizador. Para sistemas mayores se requiere ingeniería distribuida (GD) — contacto con ALEBAS para propuesta separada.` });
          }
          if (areaLimited) {
            obs.push({ type: 'warn', title: `Cobertura parcial (${res.cov}%) por área disponible`, text: `El techo declarado (${area} m²) no alcanza para el 100% de tu consumo. Se requerirían ~${idealArea} m² para cubrir ${f.monthlyKwh} kWh/mes. Alternativas: ampliar área, usar paneles de mayor eficiencia o complementar con un segundo sistema.` });
          }
          if (f.systemType === 'off-grid' && res.mp > (parseFloat(f.monthlyKwh) || 0) * 1.1) {
            obs.push({ type: 'info', title: 'Excedente off-grid no monetizable', text: 'El sistema genera más que el consumo. Al no estar conectado al SIN, el excedente se desperdicia (dump load). Considera cargas diferibles: bombeo, termotanque, climatización o ampliar banco.' });
          }
          if (!res.inv) {
            const sysLabel = f.systemType === 'off-grid' ? 'aislado (off-grid)'
                           : f.systemType === 'hybrid' ? 'híbrido'
                           : 'on-grid';
            obs.push({ type: 'warn', title: 'Inversor no disponible — consultar stock', text: `No hay inversor ${sysLabel} compatible en el catálogo para ${res.actKwp} kWp · ${ACOMETIDA_INFO[f.acometida].label}. El presupuesto se muestra sin la línea de inversor; antes de la propuesta detallada un ingeniero ALEBAS confirma stock o solicita importación.` });
          }
          if (res.inv) {
            const expected = phasesForAcometida(f.acometida);
            if (!expected.includes(res.inv.phase)) {
              obs.push({ type: 'warn', title: 'Fase de inversor distinta a acometida', text: `Acometida ${ACOMETIDA_INFO[f.acometida].label} no coincide con inversor ${res.inv.brand} ${res.inv.model} (${res.inv.phase === 3 ? 'trifásico' : 'mono/bifásico'}). Requiere validación con operador de red o cambio de equipo.` });
            }
          }
          if (needsB && bankOrphan > 0) {
            obs.push({ type: 'warn', title: `${bankOrphan} batería${bankOrphan > 1 ? 's' : ''} sobrante${bankOrphan > 1 ? 's' : ''} en el banco`, text: `Con ${f.battQty} baterías y configuración ${bankSeries}S×${bankParallel}P quedan ${bankOrphan} unidades sin usar. Ajusta la cantidad para múltiplos de ${bankSeries} o replantea la tensión del bus DC.` });
          }
          if (!dest?.lat || !dest?.lon) {
            obs.push({ type: 'info', title: 'Sin coordenadas precisas del destino', text: 'La producción se estima con PSH regional. Para mayor precisión, consulta las APIs PVGIS/PVWatts/NASA — se activan con lat/lon del predio.' });
          }
          if (xmError) {
            obs.push({ type: 'info', title: 'Bolsa XM no disponible temporalmente', text: `El cálculo de excedentes usa tarifa CU del operador como fallback. ${xmError}.` });
          }
          if (pvgisError) {
            obs.push({ type: 'info', title: 'PVGIS no respondió', text: `Se usa PVWatts/PSH. ${pvgisError}.` });
          }
          if (bgt.budgetUsd) {
            obs.push({ type: 'info', title: 'Equivalencia USD referencial', text: `TRM ${bgt.trmDate} · ${fmt(trm?.cop_per_usd)} COP/USD. El valor en USD es informativo; la factura final se emite en COP.` });
          }

          return (
            <div style={{ ...ss.card, borderColor: `${C.yellow}55`, background: `${C.yellow}05` }}>
              <div style={{ textAlign: 'center', marginBottom: 14, paddingBottom: 10, borderBottom: `1px solid ${C.yellow}33` }}>
                <div style={{ fontSize: 10, color: C.yellow, letterSpacing: 3, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Notas de la cotización</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>✎ Observaciones</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>Puntos relevantes para revisar antes de la propuesta detallada</div>
              </div>

              <div style={{ background: C.dark, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: C.teal, fontWeight: 700, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>📦 Transporte seleccionado</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11 }}>
                  <div><span style={{ color: C.muted }}>Transportadora:</span> <strong style={{ color: '#fff' }}>{bgt.transportCarrier || '-'}</strong></div>
                  <div><span style={{ color: C.muted }}>Zona tarifa:</span> <strong style={{ color: '#fff' }}>{ZONA_LABEL[bgt.transportZone] || bgt.transportZone}</strong></div>
                  <div><span style={{ color: C.muted }}>Destino:</span> <strong style={{ color: '#fff' }}>{dest.city}, {dest.dept}</strong></div>
                  <div><span style={{ color: C.muted }}>Tiempo entrega:</span> <strong style={{ color: '#fff' }}>{dest.tiempo}</strong></div>
                  <div><span style={{ color: C.muted }}>Distancia:</span> <strong style={{ color: '#fff' }}>~{dest.km} km desde Bogotá</strong></div>
                  <div><span style={{ color: C.muted }}>Peso sistema:</span> <strong style={{ color: '#fff' }}>{fmt(res.kgTotal)} kg</strong></div>
                  <div><span style={{ color: C.muted }}>Flete:</span> <strong style={{ color: '#fff' }}>{fmtCOP(bgt.transportQuotes?.[0]?.flete || 0)}</strong></div>
                  <div><span style={{ color: C.muted }}>Sobreflete 2%:</span> <strong style={{ color: '#fff' }}>{fmtCOP(bgt.transportQuotes?.[0]?.sf || 0)}</strong></div>
                </div>
                {bgt.transportQuotes?.[0]?.note && (
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 8, fontStyle: 'italic' }}>ℹ {bgt.transportQuotes[0].note}</div>
                )}
                {Array.isArray(bgt.transportQuotes) && bgt.transportQuotes.length > 1 && (
                  <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${C.border}55` }}>
                    <div style={{ fontSize: 10, color: C.muted, marginBottom: 6, letterSpacing: 0.4, textTransform: 'uppercase' }}>Cotizaciones evaluadas ({bgt.transportQuotes.length})</div>
                    {bgt.transportQuotes.map((q, idx) => (
                      <div key={q.carrierId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 10, color: idx === 0 ? C.teal : C.muted, borderBottom: idx < bgt.transportQuotes.length - 1 ? `1px solid ${C.border}22` : 'none' }}>
                        <span style={{ flex: 1, fontWeight: idx === 0 ? 700 : 400 }}>{idx === 0 ? '✓ ' : '  '}{q.label}</span>
                        <span style={{ flex: 2, fontSize: 9, fontStyle: 'italic', marginLeft: 6 }}>{q.note}</span>
                        <span style={{ minWidth: 90, textAlign: 'right', fontWeight: idx === 0 ? 700 : 400 }}>{fmtCOP(q.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {(aiData || aiApplied) && (
                <div style={{ background: C.dark, border: `1px solid ${C.yellow}44`, borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: C.yellow, fontWeight: 700, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                    ✦ Asistente IA — Análisis técnico{aiData?.provider ? ` · ${aiData.provider}` : ''}
                  </div>
                  {aiData?.summary && (
                    <div style={{ fontSize: 12, color: '#fff', lineHeight: 1.55, marginBottom: 10 }}>{aiData.summary}</div>
                  )}
                  {aiData?.findings?.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: C.teal, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Hallazgos</div>
                      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: '#fff', lineHeight: 1.5 }}>
                        {aiData.findings.map((x, i) => <li key={i} style={{ marginBottom: 2 }}>{x}</li>)}
                      </ul>
                    </div>
                  )}
                  {aiData?.warnings?.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: C.orange, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Alertas</div>
                      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: C.orange, lineHeight: 1.5 }}>
                        {aiData.warnings.map((x, i) => <li key={i} style={{ marginBottom: 2 }}>{x}</li>)}
                      </ul>
                    </div>
                  )}
                  {aiData?.suggestions?.length > 0 && (
                    <div style={{ marginBottom: aiApplied?.details?.length ? 10 : 0 }}>
                      <div style={{ fontSize: 10, color: C.yellow, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Sugerencias</div>
                      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: C.yellow, lineHeight: 1.5 }}>
                        {aiData.suggestions.map((x, i) => <li key={i} style={{ marginBottom: 2 }}>{x}</li>)}
                      </ul>
                    </div>
                  )}
                  {aiApplied?.details?.length > 0 && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${C.teal}55` }}>
                      <div style={{ fontSize: 10, color: C.teal, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
                        ✓ Cambios aplicados al dimensionamiento ({aiApplied.details.length})
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: '#fff', lineHeight: 1.55 }}>
                        {aiApplied.details.map((d, i) => (
                          <li key={i} style={{ marginBottom: 4 }}>
                            <strong style={{ color: C.teal }}>{d.label || d.field}</strong>
                            <span style={{ color: C.muted, fontSize: 10 }}> · {d.field}: {String(d.from)} → {String(d.to)}</span>
                            {d.reason && <div style={{ color: C.muted, fontStyle: 'italic', marginTop: 1 }}>{d.reason}</div>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {obs.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {obs.map((o, i) => {
                    const col = o.type === 'warn' ? C.orange : C.teal;
                    const icon = o.type === 'warn' ? '⚠' : 'ℹ';
                    return (
                      <div key={i} style={{ background: `${col}10`, border: `1px solid ${col}44`, borderRadius: 7, padding: '11px 13px' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: col, marginBottom: 4, display: 'flex', gap: 6 }}>
                          <span>{icon}</span><span style={{ flex: 1 }}>{o.title}</span>
                        </div>
                        <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.55 }}>{o.text}</div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ background: `${C.green}10`, border: `1px solid ${C.green}44`, borderRadius: 7, padding: '11px 13px', fontSize: 12, color: C.green, textAlign: 'center' }}>
                  ✓ Sin observaciones críticas — el dimensionamiento se ajusta a la normativa y al área disponible.
                </div>
              )}

              <div style={{ marginTop: 14, fontSize: 11, color: C.muted, lineHeight: 1.6, fontStyle: 'italic', paddingTop: 10, borderTop: `1px solid ${C.border}33` }}>
                Los cálculos usan datos públicos (PVGIS, NASA POWER, XM, Banrep) y precios mayoristas referenciales. La propuesta final requiere visita técnica y validación RETIE.
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
        {(showNormativo || showObservaciones) && (
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
function LoadingSystem({ C, ss, logo, f, operator, needsB, dest }) {
  const tools = useMemo(() => [
    { icon: '☀', name: 'PVGIS', desc: 'Irradiancia satelital JRC (UE)' },
    { icon: '📊', name: 'NREL PVWatts', desc: 'Producción anual con pérdidas reales' },
    { icon: '🌡', name: 'NASA POWER', desc: 'Temperaturas de módulo (cold/hot)' },
    { icon: '💱', name: 'Banrep TRM', desc: 'Tasa USD/COP oficial' },
    { icon: '⚡', name: `XM — ${operator.name}`, desc: 'Precio spot en bolsa de energía' },
    ...(f.systemType !== 'on-grid' ? [{
      icon: '🔋', name: 'Dimensionamiento de banco', desc: 'DoD 80% · η 90% · voltaje bus',
      subSteps: [
        'Calculando energía diaria a respaldar',
        'Aplicando profundidad de descarga (DoD 80%)',
        'Compensando por eficiencia inversor/cableado',
        'Resolviendo serie/paralelo en bus DC',
      ],
    }] : []),
    {
      icon: '🛡', name: 'Validación RETIE + AGPE', desc: 'CREG 174/2021 · Ley 1715 · Código de medida',
      subSteps: [
        'Sección 240 — clasificación de acometida',
        'Inscripción AGPE ante operador de red',
        'Compensación de excedentes (CREG 174/2021)',
        'Código de medida y bidireccionalidad',
      ],
    },
    {
      icon: '✦', name: 'Inversor compatible', desc: 'Voc/Vmp, MPPT y rango de strings',
      subSteps: [
        'Voc en serie ≤ 1000 V DC (RETIE)',
        'Vmp dentro del rango MPPT del inversor',
        'Isc del string ≤ Idc máx por entrada',
        'Strings en paralelo dentro de capacidad',
        'Fase de salida ↔ acometida del cliente',
        'Sobredimensionado DC/AC dentro de tolerancia',
      ],
    },
  ], [operator.name, f.systemType, needsB]);

  const [cursor, setCursor] = useState(0);
  const [subCursor, setSubCursor] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setCursor(c => Math.min(c + 1, tools.length - 1)), 900);
    const t2 = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => { clearInterval(t); clearInterval(t2); };
  }, [tools.length]);

  // Sub-cursor: avanza entre los sub-pasos del tool activo. Se reinicia cada
  // vez que el cursor principal cambia para que cada herramienta tenga su
  // propia animación de validación interna.
  useEffect(() => {
    setSubCursor(0);
    const sub = tools[cursor]?.subSteps;
    if (!sub || !sub.length) return;
    const id = setInterval(() => {
      setSubCursor(s => Math.min(s + 1, sub.length));
    }, 220);
    return () => clearInterval(id);
  }, [cursor, tools]);

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
            {operator.name} · {dest.city}, {dest.dept} · {elapsed}s
          </div>

          <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tools.map((t, i) => {
              const state = i < cursor ? 'done' : i === cursor ? 'run' : 'pend';
              const col = state === 'done' ? C.teal : state === 'run' ? C.yellow : C.muted;
              const bg = state === 'run' ? `${C.yellow}12` : state === 'done' ? `${C.teal}08` : 'transparent';
              return (
                <div key={t.name} style={{
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
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
                  {state === 'run' && t.subSteps?.length > 0 && (
                    <div style={{ flexBasis: '100%', marginTop: 8, paddingLeft: 32, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {t.subSteps.map((s, j) => {
                        const sDone = j < subCursor;
                        const sActive = j === subCursor;
                        const sPend = j > subCursor;
                        if (sPend) return null;
                        return (
                          <div key={j} style={{
                            display: 'flex', alignItems: 'center', gap: 7,
                            fontSize: 10.5, color: sDone ? C.muted : '#fff',
                            animation: 'slideIn 0.2s ease',
                          }}>
                            <span style={{ width: 12, display: 'inline-flex', justifyContent: 'center' }}>
                              {sDone && <span style={{ color: '#4ade80', fontSize: 11, fontWeight: 800 }}>✓</span>}
                              {sActive && (
                                <div style={{ width: 8, height: 8, borderRadius: '50%', border: `2px solid ${C.yellow}33`, borderTopColor: C.yellow, animation: 'spin 0.7s linear infinite' }} />
                              )}
                            </span>
                            <span style={{ letterSpacing: 0.1 }}>{s}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
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

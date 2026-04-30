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
import InteractiveRoofMap from './InteractiveRoofMap';
import SunPathDiagram from './SunPathDiagram';
import { validateContactRemote, saveQuoteRemote } from '../services/quotes';
import { fetchLoadsCatalog, DEFAULT_LOADS_CATALOG } from '../services/loads';
import { getApplicableNormativa } from '../data/normativa';

const Q0 = {
  systemType: 'on-grid', monthlyKwh: '', operatorId: 0,
  panelId: '', battId: '', battQty: 2,
  destId: 'villavicencio', address: '',
  // Por defecto, la dirección de contacto del cliente es la misma del lugar
  // de instalación (caso típico residencial). En step 2 hay un toggle para
  // distinguirlas si el cliente coordina por una dirección distinta.
  addressSameAsInstall: true,
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
  // Tipo de servicio (CREG 091/015 + CREG 174/2021) — gobierna:
  //   - Tarifa CU aplicable (G+T+D+Cv+PR+R por nivel de tensión)
  //   - Subsidios/contribuciones (solo residencial: estratos 1-3 subsidio, 5-6 contribución)
  //   - Esquema AGPE Menor (≤100 kW, CU−G) vs Mayor (>100 kW, precio bolsa XM)
  //   - Aplicación CREG 174/2021 art. 7 sobre remuneración de excedentes
  serviceCategory: 'residencial',  // 'residencial' | 'comercial' | 'industrial'
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
  customSegments: [],  // Cubiertas añadidas manualmente por el usuario (no detectadas por Google)
  googleSolarEstimate: null,  // {yearlyEnergyDcKwh, specificYieldKwhPerKwpYear, bestConfigPanels, ...}
  googleAreaM2: null,    // área detectada por Google Solar (independiente del input del cliente)
  roofConfidence: null,  // 0..1 — confidence del análisis de techo
  roofImageryQuality: null, // 'HIGH' | 'MEDIUM' | 'LOW'
  roofMaterial: null,    // 'zinc' | 'eternit' | 'barro' | 'losa' | 'termoacustica' | 'lamina' | 'otro'
  roofStaticMapRoadUrl: null,    // Vista de mapa con calles para contexto
  roofStaticMapHDUrl: null,      // Variante HD para lightbox
  roofLocationConfirmed: false,  // Cliente confirma que la ubicación mostrada es la de la instalación
  roofWholeAreaM2: null,         // Área total del techo (incluye zonas no aprovechables)
  roofGroundAreaM2: null,        // Footprint del edificio (proyección al suelo)
  roofPanelsDetected: null,      // Paneles individuales detectados por Google (hint de precisión)
  roofPrecisionHint: null,       // 'high' | 'medium' | 'low'
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
  'Consultando modelo (Groq → Gemini → Mistral → Claude)',
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

  // Genera un PDF de resumen ejecutivo técnico con el diálogo nativo del navegador.
  // Renderiza una vista oculta normalmente (visible solo en @media print) — más
  // limpio que un dump de los tabs y diseñado para A4 con identidad de marca.
  const downloadQuotePDF = () => {
    const cliente = (f.name || 'cliente').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
    const fecha = new Date().toISOString().slice(0, 10);
    const prevTitle = document.title;
    document.title = `cotizacion-solar-${cliente}-${fecha}`;
    setTimeout(() => {
      window.print();
      setTimeout(() => { document.title = prevTitle; }, 300);
    }, 50);
  };
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
  // Autocomplete específico para la dirección de contacto del cliente (step 2).
  // Independiente del de step 1 para no colisionar suggestions/debounce.
  const [contactAddrSuggestions, setContactAddrSuggestions] = useState([]);
  const [contactAddrSuggestOpen, setContactAddrSuggestOpen] = useState(false);
  const [contactAddrLoading, setContactAddrLoading] = useState(false);

  // Sincroniza la dirección de contacto con la del lugar de instalación cuando
  // el cliente marca el toggle 'misma dirección' (default true). DEBE estar
  // DESPUÉS de la declaración de roofQuery para evitar ReferenceError TDZ:
  // el array de dependencias se evalúa síncrono en cada render y referencia
  // un binding aún no inicializado si el useEffect va antes del useState.
  useEffect(() => {
    if (!f.addressSameAsInstall) return;
    if (roofQuery && roofQuery !== f.address) u('address', roofQuery);
  }, [f.addressSameAsInstall, roofQuery, f.address]);
  // NOTA: la sincronización inversa (step 2 → step 1) NO se hace en cada
  // keystroke porque cambiaría el condicional de visibilidad del input mid-
  // typing y el input se ocultaría perdiendo el cursor. En su lugar se hace
  // bajo demanda en el onBlur del input de step 2 (ver más abajo).
  const contactPlacesSessionRef = React.useRef(null);
  const contactAddrDebounceRef = React.useRef(null);
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
    // El valor del honeypot (f.website) se pasa al backend en el payload
    // para que aplique su propia detección anti-bot. NO bloqueamos aquí
    // porque autofill de Android/iOS rellena campos ocultos con datos
    // del usuario y producía falsos positivos en clientes legítimos.
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
      // Siempre sobrescribimos con la última medición de Google: el usuario puede
      // arrastrar el pin varias veces antes de confirmar, y el área debe reflejar
      // la posición actual del pin (no la primera estimación). Si quiere ajustar
      // a un valor más conservador, puede editar el input después de confirmar.
      u('availableArea', String(Math.round(r.areaM2)));
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
    if (r.googleSolarEstimate) u('googleSolarEstimate', r.googleSolarEstimate);
    if (r.staticMapUrl) u('roofStaticMapUrl', r.staticMapUrl);
    if (r.staticMapRoadUrl) u('roofStaticMapRoadUrl', r.staticMapRoadUrl);
    if (r.staticMapHDUrl) u('roofStaticMapHDUrl', r.staticMapHDUrl);
    if (r.wholeRoofAreaM2 != null) u('roofWholeAreaM2', r.wholeRoofAreaM2);
    if (r.groundAreaM2 != null) u('roofGroundAreaM2', r.groundAreaM2);
    if (r.panelsDetected != null) u('roofPanelsDetected', r.panelsDetected);
    if (r.coordinatesPrecisionHint) u('roofPrecisionHint', r.coordinatesPrecisionHint);
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

  // Segmentos seleccionados por el sistema:
  // - Si el usuario quiere excedentes: usa TODOS los segmentos viables (sun ≥1300 h/año)
  //   para maximizar producción y vender lo que sobre.
  // - Si solo cubre consumo: ordena por horas-sol desc y toma cuantos necesite hasta
  //   cubrir el área requerida por res.numPanels (los más productivos primero).
  // - Si aún no hay cálculo: ninguno seleccionado todavía.
  // selectedSegmentIdx: auto-selección por defecto. Si el usuario hace tap en un
  // segmento, persistimos su override en manualSegmentSelection (Set | null).
  // null => usar auto. Set => usar exactamente ese conjunto del usuario.
  const [manualSegmentSelection, setManualSegmentSelection] = useState(null);
  const [showCustomSegmentForm, setShowCustomSegmentForm] = useState(false);
  const [customSegDraft, setCustomSegDraft] = useState({ areaMeters2: '', azimuthDegrees: '180', pitchDegrees: '15', note: '' });
  // Si cambia el set de segmentos detectados (ej. por mover el pin), reseteamos
  // las overrides manuales — los índices ya no aplican al nuevo array.
  useEffect(() => { setManualSegmentSelection(null); }, [f.roofSegments, f.customSegments]);

  // Umbral de radiación bajo el cual una cubierta NO se incluye automáticamente.
  // Para Colombia, sun anual <1100 h/año significa baja productividad (orientación
  // norte, sombreado fuerte, pendiente extrema). El usuario aún puede activarlas
  // manualmente si quiere — pero el sistema NO las selecciona por defecto, las
  // marca como 'reservadas'.
  const MIN_VIABLE_SUN = 1100;

  const autoSelectedSegmentIdx = useMemo(() => {
    const sel = new Set();
    const allSegs = [
      ...(f.roofSegments || []).map((s, idx) => ({ ...s, _idx: idx })),
      ...(f.customSegments || []).map((s, idx) => ({ ...s, _idx: (f.roofSegments?.length || 0) + idx })),
    ];
    if (allSegs.length === 0) return sel;
    // Filtrar fuera las cubiertas reservadas (sun < MIN_VIABLE_SUN). Estas NO
    // entran en la auto-selección por defecto, aunque el usuario puede toggle
    // manualmente.
    const viable = allSegs.filter(s => (s.sunshineHoursPerYear || 0) >= MIN_VIABLE_SUN);
    if (viable.length === 0) {
      // Si NINGUNA cubierta supera el umbral, al menos tomar la mejor disponible
      // (caso edge: todo el techo está mal orientado).
      const best = [...allSegs].sort((a, b) => (b.sunshineHoursPerYear || 0) - (a.sunshineHoursPerYear || 0))[0];
      if (best) sel.add(best._idx);
      return sel;
    }
    const sorted = [...viable].sort((a, b) => (b.sunshineHoursPerYear || 0) - (a.sunshineHoursPerYear || 0));
    if (f.wantsExcedentes) {
      // Excedentes: usar TODAS las viables (sin tope superior). Umbral más alto:
      // 1300 h/año para garantizar que el excedente sea rentable.
      sorted.forEach(s => {
        if ((s.sunshineHoursPerYear || 0) >= 1300) sel.add(s._idx);
      });
      if (sel.size === 0) sorted.slice(0, Math.min(3, sorted.length)).forEach(s => sel.add(s._idx));
      return sel;
    }
    // Cobertura por consumo:
    //   - Si ya tenemos res.numPanels (después de calcular): usar requiredArea exacta
    //   - Si todavía no (estamos en paso de techo, sin cálculo final): sugerir basado
    //     en consumptionKwp + 15% buffer para compensar yield real <heurístico
    let requiredArea;
    if (res?.numPanels) {
      requiredArea = res.numPanels * m2PerPanel;
    } else if (consumptionKwp > 0 && panel?.wp) {
      const requiredKwp = consumptionKwp * 1.15; // 15% buffer real-world yield
      const requiredPanels = Math.ceil(requiredKwp * 1000 / panel.wp);
      requiredArea = requiredPanels * m2PerPanel;
    } else {
      if (sorted[0]) sel.add(sorted[0]._idx);
      return sel;
    }
    let cumArea = 0;
    for (const s of sorted) {
      if (cumArea >= requiredArea) break;
      sel.add(s._idx);
      cumArea += s.areaMeters2 || 0;
    }
    return sel;
  }, [f.roofSegments, f.customSegments, f.wantsExcedentes, res?.numPanels, m2PerPanel, consumptionKwp, panel?.wp]);

  // Selección efectiva = override manual si existe, sino auto.
  const selectedSegmentIdx = manualSegmentSelection || autoSelectedSegmentIdx;

  const toggleSegment = (idx) => {
    const base = manualSegmentSelection || new Set(autoSelectedSegmentIdx);
    const next = new Set(base);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    setManualSegmentSelection(next);
  };
  const resetManualSelection = () => setManualSegmentSelection(null);

  // Sincroniza availableArea con la SUMA de cubiertas seleccionadas. Antes el
  // sistema usaba la totalidad del área Google (143 m²) para dimensionar y
  // calcular excedentes, ignorando que el usuario podía haber excluido cubiertas.
  // Ahora cada toggle/cambio recalcula el área a usar.
  useEffect(() => {
    if (!selectedSegmentIdx || selectedSegmentIdx.size === 0) return;
    const allSegs = [
      ...(f.roofSegments || []),
      ...(f.customSegments || []),
    ];
    if (allSegs.length === 0) return;
    const selectedArea = allSegs
      .filter((_, i) => selectedSegmentIdx.has(i))
      .reduce((sum, s) => sum + (s.areaMeters2 || 0), 0);
    if (selectedArea > 0) {
      const rounded = String(Math.round(selectedArea));
      // Solo actualizar si difiere — evita loops y respeta valor manual igual.
      if (rounded !== f.availableArea) u('availableArea', rounded);
    }
  }, [selectedSegmentIdx, f.roofSegments, f.customSegments]); // eslint-disable-line

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
    // de producción.
    // Cascada (mejor de todas las fuentes que respondieron, nombrando cuáles ejecutaron):
    //   Google Solar (yield real del techo, DSM + sombras hora a hora)
    //   PVWatts (pérdidas reales, modelo NREL)
    //   PVGIS (TMY satelital)
    //   PSH heurístico (último recurso)
    // Si dos o más fuentes responden, promediamos para reducir sesgo. Nombramos todas
    // las que contribuyeron en `productionSources` (array) y `productionSource` (string).
    const temps = nasa
      ? { coldTempC: nasa.cellTempCold, hotTempC: nasa.cellTempHot }
      : {};
    // Escala la energía Google al panel real del usuario (Google asume ~250W default).
    let googleAnnualKwh = null;
    const gse = f.googleSolarEstimate;
    if (gse?.specificYieldKwhPerKwpYear && sysBase.actKwp > 0) {
      googleAnnualKwh = Math.round(gse.specificYieldKwhPerKwpYear * sysBase.actKwp);
    }
    const _sources = [];
    if (googleAnnualKwh)  _sources.push({ name: 'Google Solar', kwh: googleAnnualKwh, weight: 1.0 });
    if (pvwattsAnnualKwh) _sources.push({ name: 'PVWatts',      kwh: pvwattsAnnualKwh, weight: 1.0 });
    if (pvgisAnnualKwh)   _sources.push({ name: 'PVGIS',        kwh: pvgisAnnualKwh,   weight: 1.0 });
    const bestAnnualKwh = _sources.length
      ? Math.round(_sources.reduce((a, s) => a + s.kwh * s.weight, 0) / _sources.reduce((a, s) => a + s.weight, 0))
      : null;
    const productionSource = _sources.length ? _sources.map(s => s.name).join(' + ') : 'PSH';
    const productionSources = _sources.map(s => ({ name: s.name, kwh: s.kwh }));
    // Detectar discrepancia >15% entre la fuente máx y mín — alerta para Observaciones.
    let productionDispersion = null;
    if (_sources.length >= 2) {
      const kwhs = _sources.map(s => s.kwh);
      const max = Math.max(...kwhs), min = Math.min(...kwhs);
      const pct = ((max - min) / min) * 100;
      if (pct > 15) productionDispersion = { pct: +pct.toFixed(1), max, min };
    }

    const inv2 = selectCompatibleInverter(panel, sysBase.actKwp, f.systemType, inverters, { ...temps, phases: phasesForAcometida(f.acometida) });
    const shadeIndex = (f.shadeIndex != null && Number(f.shadeIndex) > 0) ? Number(f.shadeIndex) : null;

    // Re-sizing por yield real:
    // El sysBase se dimensiona con la heurística PSH × PR (~1500 kWh/kWp/año) pero las
    // APIs reales (PVGIS/PVWatts/Google Solar) reportan yields que pueden ser 20-30%
    // menores en zonas nubladas/sombreadas. Sin compensación, el sistema queda
    // sub-dimensionado: 100% target → 80% real. Si el área del techo lo permite,
    // boosteamos los paneles para alcanzar 100% real.
    let adjustedTargetKwp = targetKwp;
    if (bestAnnualKwh && sysBase.actKwp > 0 && !f.wantsExcedentes && !areaLimitsSystem) {
      const realYield = bestAnnualKwh / sysBase.actKwp; // kWh/kWp/año real
      const realRequiredKwp = (kwh * 12) / realYield;
      if (realRequiredKwp > sysBase.actKwp * 1.05) {
        const cap = hasArea ? areaMaxKwp : MAX_KWP_AGPE;
        adjustedTargetKwp = Math.min(realRequiredKwp, cap, MAX_KWP_AGPE);
      }
    }
    // Re-seleccionar inversor compatible con el target ajustado.
    const inv3 = adjustedTargetKwp !== targetKwp
      ? selectCompatibleInverter(panel, adjustedTargetKwp, f.systemType, inverters, { ...temps, phases: phasesForAcometida(f.acometida) })
      : inv2;
    // Escalar bestAnnualKwh proporcionalmente al kWp ajustado (mismo yield, más paneles).
    const scaledAnnualKwh = bestAnnualKwh && adjustedTargetKwp !== targetKwp && sysBase.actKwp > 0
      ? Math.round(bestAnnualKwh * (adjustedTargetKwp / sysBase.actKwp))
      : bestAnnualKwh;

    const sys = calcSystem(kwh, panel, inv3, needsB ? batt : null, needsB ? f.battQty : 0, psh,
      { pvgisAnnualKwh: scaledAnnualKwh, targetKwp: adjustedTargetKwp, shadeIndex, ...temps });

    const transportPick = pickBestTransport(dest.zona, sys.kgTotal, 0);
    const transport = transportPick.best || { total: 0, flete: 0, sf: 0, label: '-', carrierId: '-' };
    const budget = calcBudget(sys, panel, inv3, needsB ? batt : null, needsB ? f.battQty : 0, pricing, transport.total);
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
    setRes({ ...sys, inv: inv3, sizedFor, productionSource, productionSources, productionDispersion, googleSolarEstimate: gse || null });
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
        <img src={logo} alt="SolarHub" className="al-mini-hero-logo" style={{ height: 54, width: 'auto', objectFit: 'contain', flexShrink: 0 }} />
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
        <img src={logo} alt="SolarHub" style={{ height: 72, maxWidth: '75%', marginBottom: 12, objectFit: 'contain' }} />
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
        <div style={ss.h2}>¿Qué tipo de sistema solar quieres?</div>
        <div style={{ fontSize: 12, color: C.text, marginTop: -8, marginBottom: 14, lineHeight: 1.5 }}>
          Cada tipo resuelve un problema diferente. Elige según lo que más te importa: <strong style={{ color: C.yellow }}>ahorrar plata</strong>, <strong style={{ color: C.teal }}>tener luz cuando se va la energía</strong>, o <strong style={{ color: '#4ade80' }}>vivir sin red eléctrica</strong>.
        </div>
        <div className="al-type-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 18 }}>
          {[
            {
              id: 'on-grid', ic: '☀', t: 'On-Grid', sub: 'Conectado a la red',
              tagline: 'Reduce hasta 90-100% tu factura',
              who: 'Tienes red eléctrica estable y quieres ahorrar plata cada mes.',
              how: 'Los paneles producen de día, alimentan tu casa primero, y lo que sobra se vende a la red (excedentes AGPE).',
              pros: ['💰 Máximo ahorro', '🏷 Inversión más baja', '🔌 Sin baterías'],
              cons: ['⚠ Si se va la luz, el sistema se apaga (norma RETIE)'],
            },
            {
              id: 'hybrid', ic: '🔋', t: 'Híbrido', sub: 'Con baterías + red',
              tagline: 'Ahorra Y respalda contra cortes',
              who: 'Tu zona tiene cortes frecuentes, picos de voltaje, o tienes equipos sensibles (clínica, oficina, server, refrigeración).',
              how: 'Funciona como On-Grid + cuando se va la luz, las baterías toman el control sin parpadeo. Cargas críticas siempre activas.',
              pros: ['🛡 Respaldo automático', '⚡ Estabilidad eléctrica', '💰 Ahorro alto'],
              cons: ['💵 Inversión mayor (baterías)'],
            },
            {
              id: 'off-grid', ic: '🌿', t: 'Off-Grid', sub: 'Aislado · sin red',
              tagline: '100% independiente · 0 facturas',
              who: 'Predio rural sin red, finca, parcela, o quieres autonomía total sin depender del operador.',
              how: 'El sistema NO se conecta a la red. Genera + almacena + entrega autónomamente. Banco de baterías mayor para cubrir noches y días nublados.',
              pros: ['🌎 Cero factura', '🔓 Independencia total', '🚫 Inmune a cortes'],
              cons: ['💵 Inversión más alta', '📊 Requiere planificar consumo'],
            },
          ].map(({ id, ic, t, sub, tagline }) => {
            const active = f.systemType === id;
            return (
              <div key={id} onClick={() => u('systemType', id)} style={{
                padding: '16px 10px 14px', textAlign: 'center', borderRadius: 10, cursor: 'pointer',
                border: `2px solid ${active ? C.teal : C.border}`,
                background: active ? `${C.teal}18` : C.dark,
                transition: 'all 0.15s ease', boxShadow: active ? `0 0 0 4px ${C.teal}18` : 'none',
              }}>
                <div style={{ fontSize: 30, marginBottom: 6 }}>{ic}</div>
                <div style={{ fontWeight: 800, color: active ? C.teal : '#fff', fontSize: 14, marginBottom: 2 }}>{t}</div>
                <div style={{ fontSize: 10, color: active ? C.teal : C.muted, marginBottom: 4, fontWeight: 600 }}>{sub}</div>
                <div style={{ fontSize: 10, color: active ? C.yellow : C.muted, lineHeight: 1.35, fontWeight: 600 }}>{tagline}</div>
              </div>
            );
          })}
        </div>

        {/* Detalle del tipo seleccionado — pedagógico */}
        {(() => {
          const detail = {
            'on-grid': {
              who: 'Tienes red eléctrica estable y quieres ahorrar plata cada mes.',
              how: 'Los paneles producen de día, alimentan tu casa primero, y lo que sobra se vende a la red (excedentes AGPE).',
              pros: ['💰 Máximo ahorro · hasta 90-100% de tu factura', '🏷 Inversión más baja (sin baterías)', '🔄 Excedentes monetizables vía AGPE/CREG 174-2021'],
              cons: ['⚠ Si se va la luz, el sistema se apaga por norma RETIE (anti-isla)'],
              color: C.yellow,
            },
            'hybrid': {
              who: 'Zona con cortes frecuentes, picos de voltaje, equipos sensibles (clínica, oficina con servidor, refrigeración industrial), o quieres tranquilidad.',
              how: 'Funciona como On-Grid + cuando se va la luz, las baterías toman el control sin parpadeo. Las cargas críticas siguen activas el tiempo de respaldo configurado (4-12 h típico).',
              pros: ['🛡 Respaldo automático sin transferencia manual', '⚡ Estabilidad eléctrica · protege equipos', '💰 Ahorro alto + monetiza excedentes', '🔋 Banco de baterías escalable'],
              cons: ['💵 Inversión 30-60% mayor por las baterías', '⏱ Vida útil baterías 8-12 años (LFP)'],
              color: C.teal,
            },
            'off-grid': {
              who: 'Predio rural sin red eléctrica, finca, parcela, sitio remoto, o filosofía de autonomía total.',
              how: 'No se conecta a la red eléctrica. Los paneles cargan baterías + alimentan cargas. Banco mayor (1-3 días de autonomía) para cubrir noches y días nublados.',
              pros: ['🌎 Cero factura · cero dependencia del operador', '🔓 Independencia total y permanente', '🚫 Inmune a cortes/picos/cobros injustos', '🛠 Sin trámites de conexión a red'],
              cons: ['💵 Inversión más alta (banco grande)', '📊 Requiere planificar consumo (gestión de cargas en horarios)', '⛅ En semanas de mucha nube se debe complementar con generador o gestión'],
              color: '#4ade80',
            },
          }[f.systemType];
          if (!detail) return null;
          return (
            <div style={{
              background: C.dark,
              border: `1.5px solid ${detail.color}55`,
              borderRadius: 9, padding: '14px 16px', marginBottom: 14,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: detail.color, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
                ✓ Has elegido: {f.systemType === 'on-grid' ? 'On-Grid' : f.systemType === 'hybrid' ? 'Híbrido' : 'Off-Grid'}
              </div>
              <div style={{ fontSize: 12, color: C.text, lineHeight: 1.55, marginBottom: 8 }}>
                <strong style={{ color: detail.color }}>¿Para quién?</strong> {detail.who}
              </div>
              <div style={{ fontSize: 11, color: C.text, lineHeight: 1.55, marginBottom: 10 }}>
                <strong style={{ color: C.teal }}>¿Cómo funciona?</strong> {detail.how}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                <div style={{ background: `${detail.color}10`, border: `1px solid ${detail.color}33`, borderRadius: 7, padding: '8px 10px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: detail.color, marginBottom: 4 }}>VENTAJAS</div>
                  {detail.pros.map((p, i) => (
                    <div key={i} style={{ fontSize: 11, color: C.text, marginBottom: 3, lineHeight: 1.4 }}>{p}</div>
                  ))}
                </div>
                <div style={{ background: `${C.muted}10`, border: `1px solid ${C.muted}33`, borderRadius: 7, padding: '8px 10px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, marginBottom: 4 }}>A TENER EN CUENTA</div>
                  {detail.cons.map((c, i) => (
                    <div key={i} style={{ fontSize: 11, color: C.text, marginBottom: 3, lineHeight: 1.4 }}>{c}</div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}
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
            <label style={{ ...ss.lbl, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span>📄 Consumo promedio mensual (kWh)</span>
              <span style={{ fontSize: 9, color: '#fff', background: C.orange, padding: '1px 7px', borderRadius: 10, fontWeight: 700, letterSpacing: 0.4 }}>OBLIGATORIO</span>
            </label>
            <input type="number" style={{ ...ss.inp, fontSize: 16, fontWeight: 700 }} placeholder="Ej: 450 kWh/mes" value={f.monthlyKwh} onChange={e => u('monthlyKwh', e.target.value)} />
            <div style={{
              fontSize: 11, lineHeight: 1.55, marginTop: 6, padding: '8px 11px',
              background: `${C.teal}10`, border: `1px solid ${C.teal}33`, borderRadius: 7, color: C.text,
            }}>
              <strong style={{ color: C.teal }}>💡 Cómo obtenerlo correctamente:</strong>{' '}
              Toma el <strong>promedio de los últimos 6 meses</strong> de tu recibo de energía (sección "Histórico de consumo" o "kWh consumidos"). Este dato es <strong>la base de TODO el cálculo</strong> — si está mal, la cotización completa estará mal.
            </div>
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
          <label style={{ ...ss.lbl, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span>Tipo de servicio (CREG 091)</span>
            <span style={{ fontSize: 9, color: C.muted, fontWeight: 400 }}>· determina tarifa CU y excedentes</span>
          </label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { id: 'residencial', label: 'Residencial', desc: 'Estratos 1-6 · vivienda', icon: '🏠' },
              { id: 'comercial',   label: 'Comercial',   desc: 'Local, oficina, negocio', icon: '🏢' },
              { id: 'industrial',  label: 'Industrial',  desc: 'Planta, fábrica, alta carga', icon: '🏭' },
            ].map(opt => {
              const active = f.serviceCategory === opt.id;
              return (
                <button key={opt.id} type="button" onClick={() => u('serviceCategory', opt.id)}
                  style={{ flex: '1 1 140px', minWidth: 130, padding: '8px 10px', borderRadius: 7,
                           border: `2px solid ${active ? C.teal : C.border}`,
                           background: active ? `${C.teal}22` : 'transparent',
                           color: active ? C.teal : '#fff', cursor: 'pointer',
                           textAlign: 'left', lineHeight: 1.3 }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{opt.icon} {opt.label}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>{opt.desc}</div>
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 11, lineHeight: 1.55, marginTop: 6, padding: '8px 11px',
                        background: `${C.teal}10`, border: `1px solid ${C.teal}33`, borderRadius: 7, color: C.text }}>
            <strong style={{ color: C.teal }}>📋 Cómo afecta tu cotización:</strong>{' '}
            {f.serviceCategory === 'residencial' && (
              <>El consumo se factura a la <strong>tarifa CU residencial</strong> de tu operador (con subsidio en estratos 1-3 o contribución en 5-6, no calculados aquí). Tus <strong>excedentes</strong> se remuneran a <strong style={{ color: C.yellow }}>CU − G</strong> (CREG 174/2021 art. 7) — incluye T+D+Cv+PR+R.</>
            )}
            {f.serviceCategory === 'comercial' && (
              <>El consumo se factura a la <strong>tarifa CU comercial</strong> (sin subsidios, posibles contribuciones según operador). Tus <strong>excedentes</strong> se remuneran a <strong style={{ color: C.yellow }}>CU − G</strong> si tu sistema es AGPE Menor (≤100 kW); si supera 100 kW, se valoran a <strong style={{ color: C.yellow }}>precio bolsa XM</strong> (CREG 174/2021).</>
            )}
            {f.serviceCategory === 'industrial' && (
              <>El consumo se factura a la <strong>tarifa CU industrial</strong> (típicamente nivel de tensión N2-N3, sin subsidios). Tus <strong>excedentes</strong> dependen del tamaño: AGPE Menor (≤100 kW) → <strong style={{ color: C.yellow }}>CU − G</strong>; AGPE Mayor (100 kW–1 MW) → <strong style={{ color: C.yellow }}>precio bolsa XM</strong>. Recomendado contrato de venta de energía con un comercializador.</>
            )}
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
          {f.phaseManual && (
            <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
              <button type="button" onClick={() => u('phaseManual', false)} style={{ background: 'transparent', border: 'none', color: C.teal, cursor: 'pointer', fontSize: 10, textDecoration: 'underline', padding: 0 }}>↺ Volver a sugerencia automática</button>
            </div>
          )}
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={ss.lbl}>Panel solar</label>
          <select style={{ ...ss.inp, cursor: 'pointer' }} value={f.panelId || panels[0]?.id} onChange={e => u('panelId', e.target.value)}>
            {panels.map(p => {
              const dim = (p.lengthMm && p.widthMm) ? `${(p.lengthMm/1000).toFixed(2)}×${(p.widthMm/1000).toFixed(2)} m` : '';
              const area = (p.lengthMm && p.widthMm) ? ((p.lengthMm * p.widthMm) / 1e6).toFixed(2) : null;
              return (
                <option key={p.id} value={p.id}>
                  {p.brand} {p.model} — {p.wp} Wp{dim ? ` — ${dim}` : ''}{area ? ` (${area} m²)` : ''}{p.kg ? ` — ${p.kg} kg` : ''}
                </option>
              );
            })}
          </select>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ ...ss.lbl, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span>🏠 Área de techo disponible (m²)</span>
            <span style={{ fontSize: 9, color: '#fff', background: C.teal, padding: '1px 7px', borderRadius: 10, fontWeight: 700, letterSpacing: 0.4 }}>CRÍTICO</span>
            {f.googleAreaM2 != null && (
              <span style={{ fontSize: 9, color: '#fff', background: C.green, padding: '1px 7px', borderRadius: 10, fontWeight: 700 }}>✓ AUTO-DETECTADO</span>
            )}
          </label>
          <input type="number" style={{ ...ss.inp, fontSize: 18, fontWeight: 800, padding: '12px 14px', borderColor: f.availableArea ? C.teal : C.orange }} placeholder="Se calcula automáticamente al ubicar el techo abajo" value={f.availableArea} onChange={e => u('availableArea', e.target.value)} />
          {/* Live coverage preview: si tenemos consumo, mostramos cuánto del consumo cubre */}
          {(() => {
            const area = parseFloat(f.availableArea) || 0;
            const monthly = parseFloat(f.monthlyKwh) || 0;
            if (area > 0 && monthly > 0 && panel?.wp) {
              const reqKwp = (monthly / 30) / (psh * 0.78);
              const reqArea = Math.ceil(reqKwp * 1000 / panel.wp) * m2PerPanel;
              const pct = Math.min(Math.round((area / reqArea) * 100), 999);
              const enough = pct >= 100;
              return (
                <div style={{
                  marginTop: 6, padding: '6px 10px',
                  background: enough ? `${C.green}15` : `${C.yellow}15`,
                  border: `1px solid ${enough ? C.green : C.yellow}55`,
                  borderRadius: 7, fontSize: 11, lineHeight: 1.5,
                  display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                }}>
                  <span style={{ color: enough ? C.green : C.yellow, fontWeight: 800, fontSize: 13 }}>
                    {enough ? '✓' : '⚠'} {pct}% del consumo cubierto
                  </span>
                  <span style={{ color: C.muted, fontSize: 10 }}>
                    necesitas ~{Math.round(reqArea)} m² para 100% · tienes <strong style={{ color: C.text }}>{Math.round(area)} m²</strong>
                  </span>
                </div>
              );
            }
            return null;
          })()}
          <div style={{ fontSize: 10, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>
            <strong style={{ color: C.yellow }}>⚡ Importante:</strong> el área es <strong>fundamental</strong> para una cotización aterrizada. Usa <strong style={{ color: C.teal }}>📍 Estimar área</strong> o <strong style={{ color: C.teal }}>🛰 Usar mi GPS</strong> abajo — el sistema identifica las cubiertas y se autocompleta.
          </div>
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
                  title="Usar la ubicación GPS de tu dispositivo (máxima precisión, recomendado)"
                  className="al-gps-btn"
                  style={{
                    background: `linear-gradient(135deg, ${C.teal}, ${C.teal}cc)`,
                    border: `2px solid ${C.teal}`,
                    color: '#fff',
                    padding: '10px 16px',
                    borderRadius: 9,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    opacity: roofLoading ? 0.6 : 1,
                    whiteSpace: 'nowrap',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    boxShadow: `0 0 0 2px ${C.teal}22, 0 4px 14px ${C.teal}55`,
                    fontFamily: 'inherit',
                    letterSpacing: 0.3,
                  }}
                >
                  <span style={{ fontSize: 16 }}>🛰</span>
                  <span>Usar mi GPS</span>
                </button>
              </div>
              <div style={{
                marginTop: 8, padding: '8px 12px',
                background: `linear-gradient(90deg, ${C.teal}15, ${C.teal}05)`,
                border: `1px solid ${C.teal}44`,
                borderRadius: 7, fontSize: 11, lineHeight: 1.5, color: C.text,
                display: 'flex', alignItems: 'flex-start', gap: 8,
              }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>💡</span>
                <span>
                  <strong style={{ color: C.teal }}>Recomendado:</strong> usa el botón <strong style={{ color: C.teal }}>🛰 Usar mi GPS</strong> si estás físicamente en el predio — es mucho más preciso que escribir la dirección. También puedes pegar coordenadas directas (<code style={{ color: C.teal }}>lat, lon</code> · ej: <code>4.1383, -73.6335</code>).
                </span>
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
              {f.lat != null && f.lon != null && <>📍 {Number(f.lat).toFixed(4)}, {Number(f.lon).toFixed(4)}</>}
              {f.roofLookupNotes && <> · {f.roofLookupNotes}</>}
              {f.shadeIndex != null && (
                <div style={{ marginTop: 3 }}>
                  ☀ Sombra local: <span style={{ color: f.shadeIndex >= 0.9 ? C.teal : f.shadeIndex >= 0.8 ? C.yellow : C.orange, fontWeight: 700 }}>
                    {Math.round((1 - f.shadeIndex) * 100)}% pérdida
                  </span> · índice {f.shadeIndex.toFixed(2)}
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
                  {f.googleMaxPanels != null && <> · capacidad máx. estimada: <strong style={{ color: C.teal }}>{f.googleMaxPanels} paneles</strong></>}
                </div>
              )}
              {(f.roofWholeAreaM2 != null || f.roofGroundAreaM2 != null) && (
                <div style={{ marginTop: 6, padding: '6px 10px', background: `${C.teal}08`, borderRadius: 6, fontSize: 9, lineHeight: 1.5 }}>
                  <div style={{ color: C.teal, fontWeight: 600, marginBottom: 2 }}>📐 Métricas del edificio analizado</div>
                  {f.roofGroundAreaM2 != null && <div>• Footprint (huella en suelo): <strong style={{ color: '#fff' }}>{Math.round(f.roofGroundAreaM2)} m²</strong></div>}
                  {f.roofWholeAreaM2 != null && <div>• Techo total (con pendiente): <strong style={{ color: '#fff' }}>{Math.round(f.roofWholeAreaM2)} m²</strong></div>}
                  {f.googleAreaM2 != null && <div>• Aprovechable para paneles: <strong style={{ color: C.yellow }}>{Math.round(f.googleAreaM2)} m²</strong> <span style={{ color: C.muted }}>(excluye obstáculos, bordes, pendientes inviables)</span></div>}
                </div>
              )}
              {f.roofPrecisionHint === 'low' && f.roofPanelsDetected != null && (
                <div style={{ marginTop: 6, padding: '8px 10px', background: `${C.orange}10`, border: `1px solid ${C.orange}55`, borderRadius: 6, fontSize: 10, lineHeight: 1.5 }}>
                  <div style={{ color: C.orange, fontWeight: 700, marginBottom: 3 }}>⚠ Precisión baja del análisis</div>
                  Solo se detectaron <strong style={{ color: '#fff' }}>{f.roofPanelsDetected} {f.roofPanelsDetected === 1 ? 'panel' : 'paneles'}</strong> en este punto. Posibles razones:
                  <ul style={{ margin: '4px 0 0 18px', padding: 0, color: C.muted }}>
                    <li>Las coordenadas cayeron en una construcción pequeña vecina (no la tuya).</li>
                    <li>El edificio tiene muchos obstáculos (claraboyas, antenas, ductos AC).</li>
                    <li>Calidad de imagen baja en esta zona.</li>
                  </ul>
                  <div style={{ marginTop: 4, color: C.text }}>
                    💡 Verifica el marker en el satélite de arriba. Si está en el edificio incorrecto, usa el botón <strong>🛰 GPS</strong> o pega coordenadas exactas (formato <code style={{ color: C.teal }}>lat, lon</code>).
                  </div>
                </div>
              )}
              {/* Segmentos del techo se muestran ahora DEBAJO de las imágenes (después
                  de la preview) para que el cliente tenga contexto visual del techo
                  antes de ver qué cubiertas usa el sistema. */}
              {f.roofImagery && (f.roofImagery.imageryDate || f.roofImagery.imageryQuality) && (
                <div style={{ marginTop: 3 }}>
                  Imagen satelital:{' '}
                  {f.roofImagery.imageryDate && (
                    <span style={{ color: C.teal }}>
                      {[f.roofImagery.imageryDate.year, String(f.roofImagery.imageryDate.month || '').padStart(2, '0')].filter(Boolean).join('-')}
                    </span>
                  )}
                  {f.roofImagery.imageryQuality && <> · <span style={{ color: C.teal }}>{f.roofImagery.imageryQuality}</span></>}
                  {f.roofImagery.hourlyShadeUrls?.length > 0 && (
                    <> · <span style={{ color: C.muted, fontSize: 10 }}>{f.roofImagery.hourlyShadeUrls.length} capas de sombra horaria analizadas</span></>
                  )}
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
                <div className="al-roof-preview-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 1, background: C.border }}>
                  <div>
                    <div style={{ fontSize: 9, padding: '4px 8px', color: C.muted, background: C.dark, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Satelital · zoom 20 · arrastra el pin</span>
                      <span style={{ color: C.teal, fontWeight: 600 }}>INTERACTIVO</span>
                    </div>
                    <InteractiveRoofMap
                      lat={f.lat} lon={f.lon}
                      areaM2={f.googleAreaM2 || (f.availableArea ? Number(f.availableArea) : null)}
                      segments={(() => {
                        // Combinar Google + custom; _idx alineado con selectedSegmentIdx
                        // para que el toggle desde el mapa actualice el set correctamente.
                        const allSegs = [
                          ...(f.roofSegments || []).map((s, i) => ({ ...s, _idx: i })),
                          ...(f.customSegments || []).map((s, i) => ({
                            ...s, _idx: (f.roofSegments?.length || 0) + i, _custom: true,
                          })),
                        ];
                        return allSegs.length > 0
                          ? allSegs.map(s => ({ ...s, selected: selectedSegmentIdx.has(s._idx) }))
                          : null;
                      })()}
                      onSegmentToggle={toggleSegment}
                      showSunPath={true}
                      busy={roofLoading}
                      onPinMove={async (newLat, newLon) => {
                        setRoofError(null); setRoofLoading(true);
                        try {
                          const r = await lookupRoof({ lat: newLat, lon: newLon });
                          applyRoofLookup(r);
                        } catch (e) {
                          // Fallback: si lookupRoof falla, al menos persistir las coords nuevas
                          // para que el usuario vea reflejado el ajuste.
                          u('lat', newLat); u('lon', newLon);
                          setRoofError(e?.message || 'No se pudo recalcular con la nueva ubicación');
                        } finally {
                          setRoofLoading(false);
                        }
                      }}
                    />
                  </div>
                  {/* Streets map MOVIDO al final del bloque de techo, después
                      de las cubiertas — para que la lista de cubiertas quede
                      pegada al mapa interactivo (mejor UX). */}
                </div>
                {/* Quick-access a cubiertas: shortcut visible para ir a la lista
                    de toggle. La lista completa está más abajo pero el cliente
                    puede saltarse el confirmation y los demás campos para
                    ajustarla rápido tras ver el mapa. */}
                {(f.roofSegments?.length > 0 || (f.customSegments?.length > 0)) && (
                  <div style={{
                    padding: '10px 12px', background: `${C.teal}08`,
                    borderTop: `1px solid ${C.border}`, fontSize: 11,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap',
                  }}>
                    <span style={{ color: C.muted }}>
                      <strong style={{ color: '#4ade80' }}>✓ {selectedSegmentIdx.size}</strong> de {(f.roofSegments?.length || 0) + (f.customSegments?.length || 0)} cubiertas activas
                      <span style={{ color: C.muted, fontStyle: 'italic' }}> · tap directo en el mapa para ajustar</span>
                    </span>
                    <button type="button"
                      onClick={() => {
                        const el = document.getElementById('cubiertas-selector-card');
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      style={{
                        padding: '5px 12px', borderRadius: 14, border: `1px solid ${C.teal}66`,
                        background: 'transparent', color: C.teal, cursor: 'pointer',
                        fontSize: 11, fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap',
                      }}>
                      Ver lista ↓
                    </button>
                  </div>
                )}
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

          {/* ═══════════════════════════════════════════════════════════════
              CUBIERTAS DEL TECHO — interactivas, debajo de las imágenes para
              que el cliente tenga contexto visual antes de elegir.
              - Tap en cualquier cubierta para incluirla/excluirla
              - Botón "Restablecer auto" para volver a la selección automática
              - Botón "+ Añadir cubierta" para registrar techos que Google no detectó
              ═══════════════════════════════════════════════════════════════ */}
          {(f.roofSegments?.length > 0 || (f.customSegments?.length > 0)) && (() => {
            const ACTIVE = '#4ade80';
            const AVAILABLE = '#7A9EAA';
            const allSegments = [
              ...(f.roofSegments || []).map((s, idx) => ({ ...s, _idx: idx, _custom: false })),
              ...(f.customSegments || []).map((s, idx) => ({
                ...s,
                _idx: (f.roofSegments?.length || 0) + idx,
                _custom: true,
              })),
            ];
            const totalActiveArea = allSegments
              .filter(s => selectedSegmentIdx.has(s._idx))
              .reduce((sum, s) => sum + (s.areaMeters2 || 0), 0);
            const maxArea = Math.max(...allSegments.map(s => s.areaMeters2 || 0));
            const isManual = manualSegmentSelection !== null;
            // Estimación pedagógica para usuarios no técnicos: cuántos m² se necesitan
            // típicamente para cubrir el consumo declarado.
            const estRequiredKwp = consumptionKwp * 1.15;
            const estRequiredPanels = panel?.wp ? Math.ceil(estRequiredKwp * 1000 / panel.wp) : 0;
            const estRequiredArea = Math.round(estRequiredPanels * m2PerPanel);
            const coveragePct = estRequiredArea > 0 ? Math.round((totalActiveArea / estRequiredArea) * 100) : 0;
            const enoughForConsumption = coveragePct >= 95;
            return (
              <div id="cubiertas-selector-card" style={{ marginTop: 12, padding: '12px 14px', background: C.dark, border: `1px solid ${C.teal}55`, borderRadius: 9, boxShadow: `0 0 0 1px ${C.teal}11`, scrollMarginTop: '70px' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: C.teal, fontWeight: 700 }}>
                    🏠 Cubiertas del techo ({allSegments.length})
                  </span>
                  <span style={{
                    fontSize: 10,
                    color: enoughForConsumption ? ACTIVE : C.yellow,
                    background: enoughForConsumption ? `${ACTIVE}22` : `${C.yellow}22`,
                    padding: '2px 9px', borderRadius: 10, fontWeight: 700,
                  }}>
                    ✓ {selectedSegmentIdx.size} activa{selectedSegmentIdx.size !== 1 ? 's' : ''} · {Math.round(totalActiveArea)} m²
                    {estRequiredArea > 0 && ` · ${coveragePct}% del consumo`}
                  </span>
                  {isManual && (
                    <button type="button" onClick={resetManualSelection} style={{
                      fontSize: 9, padding: '4px 10px', borderRadius: 12,
                      background: `${C.yellow}15`, border: `1px solid ${C.yellow}66`, color: C.yellow,
                      cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700,
                    }}>↺ Sugerencia automática</button>
                  )}
                </div>
                {/* Banner pedagógico — visible para usuario no técnico */}
                {estRequiredArea > 0 && (
                  <div style={{
                    fontSize: 11, lineHeight: 1.55, color: C.text, marginBottom: 10,
                    padding: '8px 11px',
                    background: `linear-gradient(90deg, ${C.teal}12, transparent)`,
                    border: `1px solid ${C.teal}33`, borderRadius: 7,
                  }}>
                    <strong style={{ color: C.teal }}>💡 Sugerencia automática:</strong>{' '}
                    para tu consumo de <strong>{f.monthlyKwh} kWh/mes</strong> necesitas
                    <strong style={{ color: C.yellow }}> ~{estRequiredArea} m²</strong> de techo
                    útil ({estRequiredPanels} paneles de {panel?.wp || 0}W).{' '}
                    {enoughForConsumption
                      ? <span style={{ color: ACTIVE, fontWeight: 700 }}>✓ Las cubiertas activas cubren el consumo.</span>
                      : <span style={{ color: C.yellow, fontWeight: 700 }}>Activa más cubiertas o usa el botón &laquo;Sugerencia automática&raquo;.</span>}
                  </div>
                )}
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 8, fontStyle: 'italic' }}>
                  Tap en cualquier cubierta para incluirla / excluirla. El sistema preselecciona las mejores orientadas para cubrir tu consumo. Si falta alguna cubierta (ej. parqueadero, anexo), añádela manualmente abajo.
                </div>
                {/* Lista clickable. Tres estados: activa (verde), disponible (gris),
                    reservada (naranja) — esta última son cubiertas con sun < 1100 h/año
                    que NO se incluyen automáticamente por baja productividad. */}
                <div>
                  {allSegments.map((s, listIdx) => {
                    const isActive = selectedSegmentIdx.has(s._idx);
                    const isReserved = !isActive && (s.sunshineHoursPerYear || 0) < MIN_VIABLE_SUN;
                    const col = isActive ? ACTIVE : (isReserved ? C.orange : AVAILABLE);
                    return (
                      <button
                        key={s._idx}
                        type="button"
                        onClick={() => toggleSegment(s._idx)}
                        title={isReserved ? `Cubierta reservada: solo ${Math.round(s.sunshineHoursPerYear || 0)} h sol/año (umbral mínimo ${MIN_VIABLE_SUN}). Tap si igual quieres incluirla.` : ''}
                        style={{
                          display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
                          width: '100%', textAlign: 'left',
                          padding: '8px 10px', marginBottom: 4,
                          background: isActive ? `${col}10` : isReserved ? `${col}06` : 'transparent',
                          border: `1.5px ${isActive ? 'solid' : 'dashed'} ${col}55`,
                          borderRadius: 7,
                          cursor: 'pointer', fontFamily: 'inherit',
                          opacity: isActive ? 1 : (isReserved ? 0.6 : 0.7),
                          color: C.text, fontSize: 11,
                        }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 22, height: 22, borderRadius: '50%',
                          background: isActive ? `${col}33` : 'transparent',
                          border: `1.5px ${isActive ? 'solid' : 'dashed'} ${col}`,
                          color: col, fontWeight: 800, fontSize: 11, flexShrink: 0,
                        }}>{listIdx + 1}</span>
                        {isReserved && (
                          <span style={{ fontSize: 9, color: C.orange, padding: '1px 5px', borderRadius: 4, background: `${C.orange}15`, border: `1px solid ${C.orange}55`, fontWeight: 700 }}>
                            🚫 RESERVADA
                          </span>
                        )}
                        {s._custom && <span style={{ fontSize: 9, color: C.yellow, padding: '1px 5px', borderRadius: 4, background: `${C.yellow}15`, border: `1px solid ${C.yellow}55` }}>+ MANUAL</span>}
                        {s.areaMeters2 != null && <strong>{s.areaMeters2.toFixed(0)} m²</strong>}
                        {s.azimuthDegrees != null && (() => {
                          const az = Math.round(s.azimuthDegrees);
                          // Convertir grados a punto cardinal: 0=N, 90=E, 180=S, 270=O.
                          // El Sur es ideal en Colombia (hemisferio Norte). Marcamos en
                          // verde si está bien orientado (135-225° = SE-S-SO).
                          const dirs = [
                            { name: 'Norte', sym: 'N', min: 337.5, max: 360 },
                            { name: 'Norte', sym: 'N', min: 0, max: 22.5 },
                            { name: 'Noreste', sym: 'NE', min: 22.5, max: 67.5 },
                            { name: 'Este', sym: 'E', min: 67.5, max: 112.5 },
                            { name: 'Sureste', sym: 'SE', min: 112.5, max: 157.5 },
                            { name: 'Sur', sym: 'S', min: 157.5, max: 202.5 },
                            { name: 'Suroeste', sym: 'SO', min: 202.5, max: 247.5 },
                            { name: 'Oeste', sym: 'O', min: 247.5, max: 292.5 },
                            { name: 'Noroeste', sym: 'NO', min: 292.5, max: 337.5 },
                          ];
                          const d = dirs.find(x => az >= x.min && az < x.max) || dirs[5];
                          const optimal = az >= 135 && az <= 225;
                          return (
                            <span style={{ color: optimal ? '#4ade80' : C.muted, fontWeight: optimal ? 600 : 400 }}>
                              {optimal ? '☀ ' : ''}{d.name} <span style={{ color: C.muted, opacity: 0.7, fontWeight: 400 }}>({az}°)</span>
                            </span>
                          );
                        })()}
                        {s.pitchDegrees != null && (() => {
                          const p = Math.round(s.pitchDegrees);
                          let label = 'plano', warn = false;
                          if (p < 5) label = 'plano';
                          else if (p < 15) label = 'pendiente baja';
                          else if (p < 30) label = 'pendiente media';
                          else if (p < 45) { label = 'pendiente alta'; warn = true; }
                          else { label = 'muy inclinado'; warn = true; }
                          return (
                            <span style={{ color: warn ? C.yellow : C.muted }}>
                              {label} <span style={{ color: C.muted, opacity: 0.7 }}>({p}°)</span>
                            </span>
                          );
                        })()}
                        {s.sunshineHoursPerYear != null && (() => {
                          const h = Math.round(s.sunshineHoursPerYear);
                          let cal = 'buen sol';
                          let col2 = C.yellow;
                          if (h >= 1700) cal = 'excelente sol';
                          else if (h >= 1500) cal = 'buen sol';
                          else if (h >= 1300) cal = 'sol regular';
                          else { cal = 'poco sol'; col2 = C.muted; }
                          return (
                            <span style={{ color: col2 }}>
                              ☀ {cal} <span style={{ color: C.muted, opacity: 0.7 }}>({h.toLocaleString('es-CO')} h/año)</span>
                            </span>
                          );
                        })()}
                        {s.note && <span style={{ fontSize: 10, color: C.muted, fontStyle: 'italic' }}>· {s.note}</span>}
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: col, fontWeight: 700 }}>
                          {isActive ? '✓' : (isReserved ? '🚫' : '○')}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {/* Compás visual */}
                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center', padding: '6px 0' }}>
                  <svg viewBox="-120 -120 240 240" width="180" height="180" aria-label="Compás">
                    <circle cx="0" cy="0" r="100" fill="none" stroke={`${C.teal}22`} strokeWidth="1" />
                    <circle cx="0" cy="0" r="60"  fill="none" stroke={`${C.teal}15`} strokeWidth="0.7" />
                    <text x="0" y="-105" textAnchor="middle" fill={C.muted} fontSize="11" fontWeight="700">N</text>
                    <text x="0" y="115" textAnchor="middle" fill={C.yellow} fontSize="11" fontWeight="700">S</text>
                    <text x="105" y="4" textAnchor="middle" fill={C.muted} fontSize="11" fontWeight="700">E</text>
                    <text x="-105" y="4" textAnchor="middle" fill={C.muted} fontSize="11" fontWeight="700">O</text>
                    {allSegments.map((s, listIdx) => {
                      if (s.azimuthDegrees == null || maxArea <= 0) return null;
                      const isActive = selectedSegmentIdx.has(s._idx);
                      const col = isActive ? ACTIVE : AVAILABLE;
                      const ratio = (s.areaMeters2 || 0) / maxArea;
                      const len = 35 + ratio * 65;
                      const az = (s.azimuthDegrees - 90) * Math.PI / 180;
                      const x2 = Math.cos(az) * len;
                      const y2 = Math.sin(az) * len;
                      return (
                        <g key={listIdx} opacity={isActive ? 1 : 0.5}>
                          <line x1="0" y1="0" x2={x2} y2={y2}
                            stroke={col}
                            strokeWidth={isActive ? 2.5 : 1.5}
                            strokeDasharray={isActive ? '' : '3 2'} strokeLinecap="round" />
                          <circle cx={x2} cy={y2} r="9"
                            fill={isActive ? `${col}cc` : `${col}88`}
                            stroke={col} strokeWidth="1.5" />
                          <text x={x2} y={y2 + 3.5} textAnchor="middle" fill="#fff" fontSize="10" fontWeight="800">{listIdx + 1}</text>
                        </g>
                      );
                    })}
                    <circle cx="0" cy="0" r="4" fill={C.text} />
                  </svg>
                </div>
                {/* Toggle: añadir cubierta custom */}
                <div style={{ marginTop: 8, paddingTop: 10, borderTop: `1px dashed ${C.border}` }}>
                  {!showCustomSegmentForm ? (
                    <button type="button" onClick={() => setShowCustomSegmentForm(true)} style={{
                      width: '100%', padding: '8px 12px', background: `${C.yellow}10`,
                      border: `1.5px dashed ${C.yellow}66`, borderRadius: 7,
                      color: C.yellow, fontWeight: 700, fontSize: 11,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}>+ Añadir cubierta manualmente</button>
                  ) : (
                    <div style={{ background: `${C.yellow}06`, padding: 10, borderRadius: 7, border: `1px solid ${C.yellow}33` }}>
                      <div style={{ fontSize: 11, color: C.yellow, fontWeight: 700, marginBottom: 8 }}>+ Nueva cubierta personalizada</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
                        <div>
                          <label style={{ ...ss.lbl, fontSize: 9 }}>Tamaño · m²</label>
                          <input type="number" min="1" max="2000" step="1"
                            value={customSegDraft.areaMeters2}
                            onChange={(e) => setCustomSegDraft(d => ({ ...d, areaMeters2: e.target.value }))}
                            placeholder="50" style={{ ...ss.inp, padding: '7px 10px', fontSize: 12 }} />
                        </div>
                        <div>
                          <label style={{ ...ss.lbl, fontSize: 9 }}>¿A qué lado mira?</label>
                          <select
                            value={customSegDraft.azimuthDegrees}
                            onChange={(e) => setCustomSegDraft(d => ({ ...d, azimuthDegrees: e.target.value }))}
                            style={{ ...ss.inp, padding: '7px 10px', fontSize: 12, cursor: 'pointer' }}
                          >
                            <option value="0">↑ Norte</option>
                            <option value="45">↗ Noreste</option>
                            <option value="90">→ Este</option>
                            <option value="135">↘ Sureste ☀</option>
                            <option value="180">↓ Sur ☀ (ideal)</option>
                            <option value="225">↙ Suroeste ☀</option>
                            <option value="270">← Oeste</option>
                            <option value="315">↖ Noroeste</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ ...ss.lbl, fontSize: 9 }}>¿Qué tan inclinado?</label>
                          <select
                            value={customSegDraft.pitchDegrees}
                            onChange={(e) => setCustomSegDraft(d => ({ ...d, pitchDegrees: e.target.value }))}
                            style={{ ...ss.inp, padding: '7px 10px', fontSize: 12, cursor: 'pointer' }}
                          >
                            <option value="0">Plano (0°)</option>
                            <option value="10">Pendiente baja (10°)</option>
                            <option value="15">Pendiente media (15°)</option>
                            <option value="25">Pendiente alta (25°)</option>
                            <option value="40">Muy inclinado (40°)</option>
                          </select>
                        </div>
                        <div style={{ display: 'none' }}>
                          {/* Hidden — el select de "qué tan inclinado" reemplaza este input
                              numérico para usuarios comunes. Se conserva oculto por compatibilidad. */}
                          <input type="number" min="0" max="60" step="1"
                            value={customSegDraft.pitchDegrees}
                            onChange={(e) => setCustomSegDraft(d => ({ ...d, pitchDegrees: e.target.value }))}
                            placeholder="15" style={{ ...ss.inp, padding: '7px 10px', fontSize: 12 }} />
                        </div>
                        <div>
                          <label style={{ ...ss.lbl, fontSize: 9 }}>Notas (opcional)</label>
                          <input type="text"
                            value={customSegDraft.note}
                            onChange={(e) => setCustomSegDraft(d => ({ ...d, note: e.target.value }))}
                            placeholder="parqueadero, anexo..." style={{ ...ss.inp, padding: '7px 10px', fontSize: 12 }} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <button type="button" onClick={() => {
                          const a = parseFloat(customSegDraft.areaMeters2);
                          const az = parseFloat(customSegDraft.azimuthDegrees);
                          const p = parseFloat(customSegDraft.pitchDegrees);
                          if (!a || a <= 0) return;
                          // Estimar horas-sol/año basado en orientación: óptimo Sur (180°)
                          // ≈ promedio del techo Google; resta hasta 25% para azimuts extremos.
                          const avgSun = f.sunshineHoursYear || 1500;
                          const orientFactor = az != null ? Math.max(0.75, 1 - Math.abs(180 - az) / 720) : 0.95;
                          const newSeg = {
                            areaMeters2: a,
                            azimuthDegrees: az || 180,
                            pitchDegrees: p || 15,
                            sunshineHoursPerYear: Math.round(avgSun * orientFactor),
                            note: customSegDraft.note || 'manual',
                          };
                          u('customSegments', [...(f.customSegments || []), newSeg]);
                          setCustomSegDraft({ areaMeters2: '', azimuthDegrees: '180', pitchDegrees: '15', note: '' });
                          setShowCustomSegmentForm(false);
                        }} style={{ ...ss.btn, padding: '7px 16px', fontSize: 11 }}>
                          Añadir
                        </button>
                        <button type="button" onClick={() => {
                          setShowCustomSegmentForm(false);
                          setCustomSegDraft({ areaMeters2: '', azimuthDegrees: '180', pitchDegrees: '15', note: '' });
                        }} style={{ ...ss.ghost, padding: '7px 16px', fontSize: 11 }}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                  {f.customSegments?.length > 0 && !showCustomSegmentForm && (
                    <button type="button" onClick={() => u('customSegments', [])} style={{
                      width: '100%', marginTop: 6, padding: '5px', fontSize: 9,
                      background: 'transparent', border: 'none', color: C.muted,
                      cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline',
                    }}>Borrar cubiertas custom ({f.customSegments.length})</button>
                  )}
                </div>
                <div style={{ fontSize: 9, color: C.muted, marginTop: 6, fontStyle: 'italic' }}>
                  {f.wantsExcedentes
                    ? '⚡ Excedentes activado: el sistema usa todos los segmentos viables (≥1300 h☀/año) por defecto.'
                    : 'Auto: el sistema usa los segmentos con más horas de sol hasta cubrir el consumo.'}
                </div>
              </div>
            );
          })()}

          {/* Diagrama de trayectoria solar — debajo de cubiertas para que el
              mapa interactivo quede pegado a la lista de cubiertas (mejora UX
              de tap-to-toggle). Muestra arco E→cenit→O, horas y orientación. */}
          {f.roofAzimuthDeg != null && (
            <SunPathDiagram
              azimuthDeg={f.roofAzimuthDeg}
              sunshineHoursYear={f.sunshineHoursYear}
              latitude={f.lat || 4}
            />
          )}

          {/* Mapa de UBICACIÓN (calles) — al final, contexto urbano. */}
          {f.roofStaticMapRoadUrl && (
            <div style={{ marginTop: 12, background: C.dark, border: `1px solid ${C.teal}33`, borderRadius: 9, overflow: 'hidden' }}>
              <div style={{ fontSize: 9, padding: '6px 10px', color: C.muted, background: `${C.teal}10`, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>📍</span>
                <span><strong style={{ color: C.teal }}>Ubicación · contexto urbano</strong> · calles cercanas (zoom 16)</span>
              </div>
              <img src={f.roofStaticMapRoadUrl} alt="Mapa de calles cercanas"
                style={{ display: 'block', width: '100%', height: 'auto', maxHeight: 240, objectFit: 'cover' }}
                onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            </div>
          )}

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
            // Área que el sistema realmente USARÁ — la mínima necesaria para
            // cubrir 100% del consumo, no la declarada total. Aclarar al cliente
            // que la declaración es 'área disponible' pero el sistema dimensiona
            // por consumo, NO usa todo el techo.
            const reqKwp = consumptionKwp * 1.15;  // +15% buffer real-world yield
            const reqPanels = panel?.wp ? Math.ceil(reqKwp * 1000 / panel.wp) : 0;
            const reqArea = Math.round(reqPanels * m2PerPanel);
            return (
              <div style={{ marginTop: 8, padding: '10px 12px', background: `${C.yellow}10`, border: `1px solid ${C.yellow}55`, borderRadius: 8, fontSize: 11, color: C.text, lineHeight: 1.5 }}>
                <div style={{ fontWeight: 700, color: C.yellow, marginBottom: 4 }}>ℹ Área disponible vs área que se usará</div>
                <div style={{ fontSize: 10, color: C.muted }}>
                  Disponible declarada: <strong style={{ color: '#fff' }}>{userArea} m²</strong> (✏ manual) ·
                  Detectada satélite: <strong style={{ color: '#fff' }}>{Math.round(googleArea)} m²</strong> (🛰 imagen) ·
                  Diferencia: <strong style={{ color: userBigger ? C.orange : C.teal }}>{userBigger ? '+' : ''}{diffPct.toFixed(0)}%</strong>
                </div>
                {reqArea > 0 && (
                  <div style={{ fontSize: 11, color: C.text, marginTop: 6, padding: '6px 10px', background: `${C.green}15`, border: `1px solid ${C.green}55`, borderRadius: 6 }}>
                    <strong style={{ color: '#4ade80' }}>✓ El sistema solo usará ~{reqArea} m²</strong>{' '}
                    ({reqPanels} paneles de {panel?.wp || 0} W) — la porción mínima del techo necesaria para cubrir el 100% de tu consumo. El resto del área queda libre.
                  </div>
                )}
                <div style={{ fontSize: 10, color: C.muted, marginTop: 4, fontStyle: 'italic' }}>
                  {userBigger
                    ? 'Tu declaración supera lo detectado en imagen satelital (puede incluir patios cubiertos o anexos que el satélite no ve). No afecta el cálculo: el sistema dimensiona por consumo.'
                    : 'La detección satelital reporta más techo del que declaraste. Tu área declarada es lo máximo que el sistema considerará disponible.'}
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
                {battPool.map(b => {
                  // Capacidad en Ah = kWh × 1000 / V (estándar de datasheet de batería)
                  const ah = b.voltage > 0 ? Math.round(b.kwh * 1000 / b.voltage) : null;
                  const ampInfo = b.maxDischargeA ? ` · ${b.maxDischargeA}A descarga` : '';
                  return (
                    <option key={b.id} value={b.id}>
                      {b.brand} {b.model} — {b.voltage}V{ah ? ` · ${ah}Ah` : ''} · {b.kwh} kWh{ampInfo}{b.chemistry ? ` · ${b.chemistry}` : ''}
                    </option>
                  );
                })}
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
            style={{
              ...ss.btn,
              ...(!f.monthlyKwh ? { background: '#94a3b8', color: '#fff', cursor: 'not-allowed' } : {}),
            }}
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
          Necesitamos identificarte antes del cálculo para enviarte la propuesta técnica.
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 11, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 180px', minWidth: 0 }}><label style={ss.lbl}>Nombre *</label><input style={ss.inp} value={f.name} onChange={e => u('name', e.target.value)} placeholder="Nombre completo" autoComplete="name" /></div>
          <div style={{ flex: '1 1 180px', minWidth: 0 }}><label style={ss.lbl}>Empresa / Predio</label><input style={ss.inp} value={f.company} onChange={e => u('company', e.target.value)} placeholder="Empresa o predio" autoComplete="organization" /></div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 11, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 180px', minWidth: 0 }}><label style={ss.lbl}>Teléfono / WhatsApp *</label><input style={ss.inp} value={f.phone} onChange={e => u('phone', e.target.value)} placeholder="300 000 0000" autoComplete="tel" inputMode="tel" /></div>
          <div style={{ flex: '1 1 180px', minWidth: 0 }}><label style={ss.lbl}>Email *</label><input style={ss.inp} value={f.email} onChange={e => u('email', e.target.value)} placeholder="tu@email.com" autoComplete="email" inputMode="email" /></div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={ss.lbl}>Dirección de contacto</label>
          {/* Toggle: ¿es la misma dirección del lugar de instalación? */}
          {roofQuery && (
            <label style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              padding: '10px 12px',
              background: f.addressSameAsInstall ? `${C.green}10` : `${C.teal}08`,
              border: `1px solid ${f.addressSameAsInstall ? C.green : C.teal}55`,
              borderRadius: 7, marginBottom: 8, cursor: 'pointer', fontSize: 12, lineHeight: 1.5,
            }}>
              <input
                type="checkbox"
                checked={!!f.addressSameAsInstall}
                onChange={e => u('addressSameAsInstall', e.target.checked)}
                style={{ marginTop: 2, accentColor: C.teal, flexShrink: 0 }}
              />
              <span style={{ color: f.addressSameAsInstall ? C.green : C.text }}>
                <strong>Es la misma dirección del lugar de instalación</strong>
                <span style={{ display: 'block', color: C.muted, fontSize: 10, marginTop: 3 }}>
                  📍 {roofQuery}
                </span>
              </span>
            </label>
          )}
          {/* Input autocomplete: visible si no hay roofQuery (no hizo Estimar área)
              o si el usuario desmarcó el toggle 'misma dirección'. */}
          {(!roofQuery || !f.addressSameAsInstall) && (
            <div style={{ position: 'relative' }}>
              <input
                style={ss.inp}
                value={f.address}
                onChange={e => {
                  const v = e.target.value;
                  u('address', v);
                  setContactAddrSuggestOpen(true);
                  if (contactAddrDebounceRef.current) clearTimeout(contactAddrDebounceRef.current);
                  if (!contactPlacesSessionRef.current) contactPlacesSessionRef.current = newPlacesSessionToken();
                  contactAddrDebounceRef.current = setTimeout(async () => {
                    if (v.trim().length < 3) { setContactAddrSuggestions([]); return; }
                    setContactAddrLoading(true);
                    const r = await autocompleteAddress(v.trim(), contactPlacesSessionRef.current);
                    setContactAddrLoading(false);
                    if (r.ok) setContactAddrSuggestions(r.suggestions || []);
                  }, 350);
                }}
                onFocus={() => setContactAddrSuggestOpen(true)}
                onBlur={() => {
                  setTimeout(() => setContactAddrSuggestOpen(false), 200);
                  // Sync inverso al perder foco — si el toggle 'misma del
                  // install' está activo y roofQuery está vacío, alimentar
                  // step 1 con la dirección que acaba de tipear.
                  if (f.addressSameAsInstall && f.address && f.address !== roofQuery) {
                    setRoofQuery(f.address);
                  }
                }}
                placeholder="Dirección o ciudad (ej: Cra 10 #5-20, Villavicencio)"
                autoComplete="street-address"
              />
              {contactAddrSuggestOpen && contactAddrSuggestions.length > 0 && (
                <ul style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
                  background: C.card, border: `1px solid ${C.teal}55`, borderRadius: 8,
                  listStyle: 'none', padding: 4, zIndex: 50, maxHeight: 280, overflowY: 'auto',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
                }}>
                  {contactAddrSuggestions.map(s => (
                    <li
                      key={s.placeId}
                      onMouseDown={(e) => { e.preventDefault(); }}
                      onClick={() => {
                        u('address', s.description);
                        setContactAddrSuggestions([]);
                        setContactAddrSuggestOpen(false);
                      }}
                      style={{ padding: '8px 10px', cursor: 'pointer', borderRadius: 6, fontSize: 12, lineHeight: 1.3 }}
                      onMouseEnter={(e) => e.currentTarget.style.background = `${C.teal}18`}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ color: '#fff', fontWeight: 600 }}>{s.main}</div>
                      {s.secondary && <div style={{ color: C.muted, fontSize: 10, marginTop: 1 }}>{s.secondary}</div>}
                    </li>
                  ))}
                  {contactAddrLoading && <li style={{ padding: '6px 10px', fontSize: 10, color: C.muted }}>Buscando…</li>}
                </ul>
              )}
              <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
                💡 Empieza a escribir y se sugieren direcciones reales.
              </div>
            </div>
          )}
        </div>
        {/* Honeypot anti-bot — invisible para humanos, los bots lo llenan.
            Nombre genérico (no 'website' / 'url' / 'phone') para evitar que
            autofill / password managers de Android/iOS lo rellenen y disparen
            falsos positivos en clientes legítimos. */}
        <input
          type="text"
          name="al_extra_field"
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
          {(() => {
            const disabled = !f.name || !f.phone || !f.email || validatingContact;
            return (
              <button
                style={{
                  ...ss.btn,
                  ...(disabled ? { background: '#94a3b8', color: '#fff', cursor: 'not-allowed' } : {}),
                }}
                disabled={validatingContact}
                onClick={async () => {
                  const ok = await validateContact();
                  if (ok) setStep(3);
                }}
              >
                {validatingContact ? 'Validando…' : 'Siguiente →'}
              </button>
            );
          })()}
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
            {/* Badges por fuente que ejecutó cálculo real (varias fuentes técnicas).
                Si dos o más respondieron, el bestAnnualKwh es el promedio de las fuentes. */}
            {(res.productionSources || []).map((s, idx) => {
              const colors = [C.yellow, C.green, C.teal];
              const color = colors[idx % colors.length];
              const label = `✓ Producción estimada · ${s.kwh.toLocaleString('es-CO')} kWh/año`;
              return (
                <span key={s.name} style={{ fontSize: 9, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: `${color}22`, color, border: `1px solid ${color}55` }}>
                  {label}
                </span>
              );
            })}
            {res.productionSource === 'PSH' && (
              <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 20, background: `${C.gray ?? '#555'}22`, color: C.muted, border: `1px solid #55555555` }}>
                Estimación regional (sin datos satelitales del sitio)
              </span>
            )}
            {nasaData && (
              <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: `${C.yellow}22`, color: C.yellow, border: `1px solid ${C.yellow}55` }}>
                🌡 T celda {nasaData.cellTempCold}°C / {nasaData.cellTempHot}°C
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

              <div className="al-excedente-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
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
                  <div style={{ fontSize: 9, color: C.muted, fontWeight: 500, marginTop: 2 }}>plataforma FluxAI</div>
                </div>
              </div>
              <a href="https://app.fluxai.solutions" target="_blank" rel="noopener noreferrer"
                 style={{ fontSize: 11, padding: '7px 16px', background: `linear-gradient(90deg, ${C.fluxGreen}, ${C.fluxBlue})`, color: '#fff', borderRadius: 7, fontWeight: 700, textDecoration: 'none' }}>
                Conocer FluxAI →
              </a>
            </div>
            <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.6 }}>
              <strong style={{ color: C.fluxGreen }}>FluxAI</strong> es la plataforma de monitoreo solar integrada con SolarHub. Te permite:
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
                    // No exponemos errores técnicos en el frontend — el cliente final no
                    // necesita saber 'Failed to fetch' o 'Tiempo de espera agotado'. Si la
                    // IA falla por cualquier motivo (timeout, network, 5xx, all_providers),
                    // simplemente ocultamos el bloque entero y dejamos que la cotización
                    // siga sin asistente. La consola del browser conserva el error real
                    // para diagnóstico interno.
                    if (typeof console !== 'undefined') {
                      console.warn('[ai-recommend] no disponible:', e?.message || e);
                    }
                    setAiUnavailable(true);
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
            {aiData && aiData.ok === false && (
              <div style={{ fontSize: 12, color: C.text, lineHeight: 1.55, background: `${C.orange}10`, border: `1px solid ${C.orange}55`, borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.orange, marginBottom: 6 }}>
                  ⚠ IA no disponible temporalmente
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>
                  {aiData.reason === 'all_providers_failed'
                    ? 'Los proveedores de IA están saturados o devolvieron respuestas inválidas. Esto suele resolverse en unos minutos.'
                    : aiData.reason === 'missing_env'
                      ? 'No hay claves de IA configuradas en el backend.'
                      : `Razón: ${aiData.reason || 'desconocida'}`}
                </div>
                {Array.isArray(aiData.attempts) && aiData.attempts.length > 0 && (
                  <details style={{ fontSize: 10, color: C.muted }}>
                    <summary style={{ cursor: 'pointer', color: C.teal }}>Detalle técnico de los intentos</summary>
                    <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                      {aiData.attempts.map((a, i) => (
                        <li key={i} style={{ marginBottom: 3 }}>
                          <strong style={{ color: '#fff' }}>{a.provider}</strong>: {a.error}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <div style={{ fontSize: 10, color: C.muted, marginTop: 8 }}>
                  El cotizador funciona sin IA — los cálculos eléctricos y de dimensionamiento no dependen de ella. Vuelve a intentar el análisis en unos minutos con el botón de arriba.
                </div>
              </div>
            )}
            {aiData && aiData.ok !== false && (
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

        {showTecnico && res.productionSources?.length > 0 && (
          <div style={ss.card}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 12 }}>⚡ Estimación de generación</div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>
              Energía anual calculada con {res.productionSources.length === 1 ? 'la siguiente fuente' : `${res.productionSources.length} fuentes externas`}
              {res.productionSources.length > 1 ? ' (promedio ponderado para reducir sesgo de un solo modelo).' : '.'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
              {res.productionSources.map((s, idx) => {
                const colors = [C.yellow, '#4ade80', C.teal];
                const labels = ['Modelo satelital', 'Modelo de producción', 'Modelo de irradiancia'];
                const color = colors[idx % colors.length];
                const label = labels[idx % labels.length];
                return (
                  <div key={s.name} style={{ background: C.dark, border: `1px solid ${color}44`, borderRadius: 8, padding: '12px 14px' }}>
                    <div style={{ fontSize: 9, letterSpacing: 1.2, fontWeight: 700, color, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{s.kwh.toLocaleString('es-CO')} <span style={{ fontSize: 10, color: C.muted, fontWeight: 500 }}>kWh/año</span></div>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: C.muted, padding: '10px 12px', background: C.dark, borderRadius: 7, border: `1px solid ${C.border}` }}>
              <strong style={{ color: C.text }}>Promedio aplicado al pre-dimensionamiento:</strong>{' '}
              <span style={{ color: C.yellow, fontWeight: 700 }}>{(res.productionSources.reduce((a, s) => a + s.kwh, 0) / res.productionSources.length).toLocaleString('es-CO', { maximumFractionDigits: 0 })} kWh/año</span>
              {res.productionDispersion && (
                <div style={{ color: C.orange, marginTop: 6 }}>
                  ⚠ Discrepancia entre fuentes: {res.productionDispersion.pct}% (rango {res.productionDispersion.min.toLocaleString('es-CO')}–{res.productionDispersion.max.toLocaleString('es-CO')} kWh).
                  Para diseño detallado, validar con instalador.
                </div>
              )}
            </div>
            {res.googleSolarEstimate && (
              <div style={{ marginTop: 10, fontSize: 10, color: C.muted }}>
                <strong>Configuración óptima del techo:</strong>{' '}
                {res.googleSolarEstimate.bestConfigPanels} paneles de {res.googleSolarEstimate.panelCapacityWatts} W
                ({res.googleSolarEstimate.bestConfigKwp} kWp) ·
                vida útil estimada {res.googleSolarEstimate.panelLifetimeYears} años
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
          {needsB && batt && f.battQty > 0 && (() => {
            const totalKwh = +(batt.kwh * f.battQty).toFixed(2);
            const busV = bankSeries * batt.voltage;
            const branchKwh = +(bankSeries * batt.kwh).toFixed(2);
            // Modo rack (compacto) cuando hay muchos equipos: la vista row-per-branch
            // satura el scroll. Pasamos a grid 2D — más técnico (parece rack real) y
            // más comercial (denso, escaneable, profesional).
            const compact = f.battQty >= 6 || bankParallel >= 4;
            const gridCols = Math.min(Math.max(bankParallel, 2), 6);
            return (
              <>
                {/* Header brand-aware con totales del banco */}
                <div style={{
                  display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10,
                  background: `linear-gradient(135deg, ${C.yellow}18, ${C.yellow}08)`,
                  border: `1px solid ${C.yellow}44`, borderRadius: 8,
                  padding: '10px 14px', marginBottom: 8, fontSize: 12,
                }}>
                  <span style={{ fontSize: 18 }}>🔋</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 700 }}>Banco de baterías</div>
                    <div style={{ fontSize: 14, color: '#fff', fontWeight: 700, lineHeight: 1.3 }}>
                      Bus DC <span style={{ color: C.yellow }}>{busV} V</span> ·
                      {' '}<span style={{ color: C.yellow }}>{totalKwh} kWh</span> ·
                      {' '}{f.battQty} unidades
                    </div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                      Configuración <strong style={{ color: C.text }}>{bankSeries}S × {bankParallel}P</strong>
                      {' '}· {batt.voltage}V · {batt.kwh} kWh por unidad
                      {bankOrphan > 0 && <span style={{ color: C.orange }}> · ⚠ {bankOrphan} sobrante{bankOrphan > 1 ? 's' : ''}</span>}
                    </div>
                  </div>
                </div>

                {compact ? (
                  /* Modo rack: grid 2D — máx 6 columnas, celdas densas con número y specs. */
                  <div style={{ background: C.dark, border: `1px dashed ${C.yellow}55`, borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${gridCols}, 1fr)`, gap: 6 }}>
                      {Array.from({ length: f.battQty }).map((_, idx) => {
                        const branch = Math.floor(idx / bankSeries) + 1;
                        const seriesPos = (idx % bankSeries) + 1;
                        return (
                          <div key={idx} style={{
                            background: `${C.yellow}1a`,
                            border: `1px solid ${C.yellow}88`,
                            borderRadius: 6, padding: '8px 6px', textAlign: 'center',
                          }}>
                            <div style={{ fontSize: 8, color: C.muted, fontWeight: 600, marginBottom: 2 }}>
                              #{idx + 1}{bankSeries > 1 ? ` · S${seriesPos}/P${branch}` : ''}
                            </div>
                            <div style={{ fontSize: 12, color: '#fff', fontWeight: 800, lineHeight: 1 }}>{batt.voltage}V</div>
                            <div style={{ fontSize: 10, color: C.yellow, fontWeight: 700, marginTop: 2 }}>{batt.kwh} kWh</div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${C.yellow}33`, fontSize: 10, color: C.muted, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                      <span>↕ <strong style={{ color: C.text }}>{bankParallel}</strong> ramas en paralelo al bus {busV}V</span>
                      {bankSeries > 1 && <span>⇒ <strong style={{ color: C.text }}>{bankSeries}</strong> en serie por rama · {branchKwh} kWh/rama</span>}
                    </div>
                  </div>
                ) : (
                  /* Modo row-per-branch para configuraciones pequeñas (≤5 ramas, <6 baterías). */
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
                          {bankSeries} en serie · {branchKwh} kWh
                        </div>
                      </div>
                    ))}
                    {bankParallel > 1 && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.yellow}33`, fontSize: 10, color: C.muted, textAlign: 'center', letterSpacing: 0.5 }}>
                        ↕ {bankParallel} ramas en paralelo al bus {busV}V
                      </div>
                    )}
                  </div>
                )}
              </>
            );
          })()}
          {(() => {
            // Diagrama gráfico del sistema. Se ajusta al systemType:
            //  - on-grid:  Sol → Inversor → Casa  (+ Red si hay excedentes/AGPE)
            //  - hybrid:   Sol → Inversor → Torre baterías → Casa  + Red
            //  - off-grid: Sol → Inversor → Torre baterías → Casa  (sin red)
            const showBatteryTower = needsB && batt && f.battQty > 0;
            const showGrid = f.systemType !== 'off-grid';
            const gridExports = f.systemType === 'on-grid' && !!f.wantsExcedentes;
            const arrow = (label) => (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 30 }}>
                <div style={{ fontSize: 18, color: C.teal, lineHeight: 1 }}>→</div>
                {label && <div style={{ fontSize: 8, color: C.muted, letterSpacing: 0.5 }}>{label}</div>}
              </div>
            );
            return (
              <div className="al-system-diagram" style={{ display: 'flex', alignItems: 'stretch', gap: 6, justifyContent: 'center', flexWrap: 'wrap', padding: '6px 0 14px' }}>
                {/* Paneles solares */}
                <div style={{ background: `${C.yellow}10`, border: `1px solid ${C.yellow}55`, borderRadius: 8, padding: '10px 12px', textAlign: 'center', minWidth: 92 }}>
                  <svg viewBox="0 0 48 36" width="40" height="30" aria-hidden="true" style={{ display: 'block', margin: '0 auto 4px' }}>
                    <circle cx="36" cy="6" r="4" fill={C.yellow} />
                    <g stroke={C.yellow} strokeWidth="1.2" strokeLinecap="round">
                      <line x1="36" y1="0" x2="36" y2="2" />
                      <line x1="42" y1="6" x2="44" y2="6" />
                      <line x1="32" y1="2" x2="33" y2="3" />
                      <line x1="40" y1="2" x2="39" y2="3" />
                    </g>
                    <g fill={C.teal} stroke="#0a1428" strokeWidth="0.6">
                      <rect x="2"  y="14" width="13" height="9" />
                      <rect x="17" y="14" width="13" height="9" />
                      <rect x="32" y="14" width="13" height="9" />
                      <rect x="2"  y="25" width="13" height="9" />
                      <rect x="17" y="25" width="13" height="9" />
                      <rect x="32" y="25" width="13" height="9" />
                    </g>
                  </svg>
                  <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 }}>Paneles</div>
                  <div style={{ fontSize: 12, color: '#fff', fontWeight: 700 }}>{res.numPanels} × {panel.wp}W</div>
                  <div style={{ fontSize: 9, color: C.yellow, marginTop: 2 }}>{res.actKwp} kWp DC</div>
                </div>
                {arrow('DC')}
                {/* Inversor */}
                <div style={{ background: res.inv ? `${C.teal}18` : `${C.orange}18`, border: `1px solid ${res.inv ? C.teal : C.orange}`, borderRadius: 8, padding: '10px 12px', textAlign: 'center', minWidth: 100 }}>
                  <svg viewBox="0 0 36 36" width="34" height="34" aria-hidden="true" style={{ display: 'block', margin: '0 auto 4px' }}>
                    <rect x="3" y="6" width="30" height="24" rx="3" fill={`${C.teal}30`} stroke={C.teal} strokeWidth="1.5" />
                    <path d="M10 18 L13 18 L13 14 L20 22 L17 22 L17 26 Z" fill={C.yellow} />
                    <circle cx="26" cy="13" r="1.4" fill={C.teal} />
                    <circle cx="29" cy="13" r="1.4" fill={C.teal} />
                  </svg>
                  <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 }}>Inversor</div>
                  {res.inv ? (
                    <>
                      <div style={{ fontSize: 12, color: '#fff', fontWeight: 700 }}>{res.inv.brand}</div>
                      <div style={{ fontSize: 9, color: C.teal, marginTop: 2 }}>{res.inv.kw} kW · {res.inv.phase === 3 ? 'trifásico' : res.inv.phase === 2 ? 'bifásico' : 'monofásico'}</div>
                    </>
                  ) : (
                    <div style={{ fontSize: 10, color: C.orange, fontWeight: 700, marginTop: 2 }}>⚠ Consultar stock</div>
                  )}
                </div>
                {arrow('AC')}
                {/* Torre de baterías (hybrid u off-grid) */}
                {showBatteryTower && (() => {
                  const totalKwh = +(batt.kwh * f.battQty).toFixed(2);
                  const tiers = Math.min(f.battQty, 5);
                  const cellH = 14;
                  const W = 50;
                  const totalH = tiers * (cellH + 2) + 12;
                  return (
                    <>
                      <div style={{ background: `${C.yellow}10`, border: `1px solid ${C.yellow}55`, borderRadius: 8, padding: '10px 12px', textAlign: 'center', minWidth: 96 }}>
                        <svg viewBox={`0 0 ${W} ${totalH}`} width="48" height={totalH} aria-hidden="true" style={{ display: 'block', margin: '0 auto 4px' }}>
                          {/* Tapa */}
                          <rect x={W/2 - 6} y="0" width="12" height="3" fill={C.yellow} rx="1" />
                          {/* Stack vertical: cada tier representa una "fila" del banco */}
                          {Array.from({ length: tiers }).map((_, i) => {
                            const y = 4 + i * (cellH + 2);
                            return (
                              <g key={i}>
                                <rect x="6" y={y} width={W - 12} height={cellH} rx="2"
                                  fill={`${C.yellow}33`} stroke={C.yellow} strokeWidth="1" />
                                {/* Indicador de carga: una franja interna */}
                                <rect x="9" y={y + 3} width={(W - 18) * 0.85} height={cellH - 6} rx="1" fill={`${C.yellow}90`} />
                              </g>
                            );
                          })}
                        </svg>
                        <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 }}>Banco DC</div>
                        <div style={{ fontSize: 12, color: '#fff', fontWeight: 700 }}>{totalKwh} kWh</div>
                        <div style={{ fontSize: 9, color: C.yellow, marginTop: 2 }}>{bankSeries}S × {bankParallel}P · {bankSeries * batt.voltage}V</div>
                        {f.battQty > tiers && (
                          <div style={{ fontSize: 8, color: C.muted, marginTop: 1 }}>(+{f.battQty - tiers} más)</div>
                        )}
                      </div>
                      {arrow(f.systemType === 'off-grid' ? 'AC isla' : 'AC')}
                    </>
                  );
                })()}
                {/* Casa */}
                <div style={{ background: `${C.teal}10`, border: `1px solid ${C.teal}55`, borderRadius: 8, padding: '10px 12px', textAlign: 'center', minWidth: 92 }}>
                  <svg viewBox="0 0 40 36" width="36" height="32" aria-hidden="true" style={{ display: 'block', margin: '0 auto 4px' }}>
                    <path d="M20 4 L4 18 L8 18 L8 32 L32 32 L32 18 L36 18 Z" fill={`${C.teal}40`} stroke={C.teal} strokeWidth="1.4" strokeLinejoin="round" />
                    <rect x="17" y="22" width="6" height="10" fill={C.dark} stroke={C.teal} strokeWidth="0.8" />
                    <rect x="11" y="20" width="4" height="4" fill={C.yellow} opacity="0.9" />
                    <rect x="25" y="20" width="4" height="4" fill={C.yellow} opacity="0.9" />
                  </svg>
                  <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 }}>Carga</div>
                  <div style={{ fontSize: 12, color: '#fff', fontWeight: 700 }}>{f.monthlyKwh} kWh/mes</div>
                  <div style={{ fontSize: 9, color: C.teal, marginTop: 2 }}>{f.systemType === 'off-grid' ? 'isla' : 'autoconsumo'}</div>
                </div>
                {/* Red — solo si hay conexión a operador */}
                {showGrid && (
                  <>
                    {arrow(gridExports ? 'export' : 'red')}
                    <div style={{ background: gridExports ? `${C.green}10` : `${C.muted}10`, border: `1px solid ${gridExports ? C.green : C.muted}55`, borderRadius: 8, padding: '10px 12px', textAlign: 'center', minWidth: 88 }}>
                      <svg viewBox="0 0 32 36" width="32" height="34" aria-hidden="true" style={{ display: 'block', margin: '0 auto 4px' }}>
                        <path d="M16 4 L8 14 L24 14 Z" fill="none" stroke={gridExports ? C.green : C.muted} strokeWidth="1.4" />
                        <line x1="16" y1="4" x2="16" y2="32" stroke={gridExports ? C.green : C.muted} strokeWidth="1.6" />
                        <line x1="6" y1="20" x2="26" y2="20" stroke={gridExports ? C.green : C.muted} strokeWidth="1" />
                        <line x1="8" y1="26" x2="24" y2="26" stroke={gridExports ? C.green : C.muted} strokeWidth="1" />
                      </svg>
                      <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 }}>Red</div>
                      <div style={{ fontSize: 12, color: '#fff', fontWeight: 700 }}>{operator.name?.split(' ')[0] || 'Operador'}</div>
                      <div style={{ fontSize: 9, color: gridExports ? C.green : C.muted, marginTop: 2 }}>
                        {gridExports ? '↔ AGPE' : f.systemType === 'hybrid' ? 'respaldo' : 'consumo'}
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })()}
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
          // Análisis del techo Google Solar — siempre informar al cliente cuando hay datos del techo.
          if (f.roofConfidence != null && f.googleAreaM2 != null) {
            const conf = Math.round(f.roofConfidence * 100);
            const gArea = Math.round(f.googleAreaM2);
            const orientationOk = f.roofAzimuthDeg != null && f.roofAzimuthDeg >= 120 && f.roofAzimuthDeg <= 240;
            const tiltOk = f.roofTiltDeg != null && f.roofTiltDeg >= 0 && f.roofTiltDeg <= 30;
            const orientationNote = orientationOk
              ? `Orientación favorable hacia el sur (azimuth ${f.roofAzimuthDeg}°, inclinación ${f.roofTiltDeg}°)`
              : `Orientación ${f.roofAzimuthDeg}°/${f.roofTiltDeg}° — fuera del rango óptimo (sur ±60°, 0-30°), evaluar reorientación o estructura inclinada`;
            const shadeNote = f.shadeIndex != null
              ? `sombra ${Math.round((1 - f.shadeIndex) * 100)}% calculada hora a hora sobre el modelo 3D`
              : 'sombra no disponible';
            obs.push({
              type: orientationOk && tiltOk ? 'info' : 'warn',
              title: `Análisis del techo (Google Solar) — confianza ${conf}%${f.roofImageryQuality ? `, imagery ${f.roofImageryQuality}` : ''}`,
              text: `~${gArea} m² aprovechables identificados (excluye obstáculos, bordes, pendientes >35°). ${orientationNote}. ${shadeNote}.${f.sunshineHoursYear ? ` Horas de sol/año: ${Math.round(f.sunshineHoursYear).toLocaleString('es-CO')}.` : ''}${f.roofSegments?.length > 1 ? ` ${f.roofSegments.length} segmentos detectados — el sistema selecciona los de mejor producción.` : ''}`
            });
          }
          // Override manual: si el usuario edita el área después del auto-update, alertar.
          if (f.googleAreaM2 != null && area > 0) {
            const gArea = Math.round(f.googleAreaM2);
            const diff = area - gArea;
            const pctDiff = Math.abs(diff) / gArea * 100;
            if (pctDiff > 10) {
              if (diff < 0) {
                obs.push({ type: 'info', title: `Área declarada (${area} m²) menor que el aprovechable detectado (${gArea} m²)`, text: `Limitación voluntaria detectada — paneles existentes, vista preservada, arrendamiento parcial, etc. Puedes recuperar hasta ${Math.abs(diff)} m² adicionales si la limitación es ajustable.` });
              } else {
                obs.push({ type: 'warn', title: `Área declarada (${area} m²) mayor que el aprovechable detectado (${gArea} m²)`, text: `Google Solar reporta solo ~${gArea} m² aprovechables. Validar en sitio con instalador antes del diseño detallado.` });
              }
            }
          }
          // Estimaciones Google Solar — siempre informar al cliente cuando hay datos.
          if (res.googleSolarEstimate?.specificYieldKwhPerKwpYear) {
            const gse = res.googleSolarEstimate;
            obs.push({
              type: 'info',
              title: `Estimación Google Solar — ${gse.specificYieldKwhPerKwpYear} kWh/kWp/año`,
              text: `Modelo 3D del techo (${gse.methodology}) calcula ${gse.bestConfigKwp} kWp óptimos con ${gse.bestConfigPanels} paneles de ${gse.panelCapacityWatts} W (default Google), generando ${gse.yearlyEnergyDcKwh.toLocaleString('es-CO')} kWh/año DC. Vida útil estimada: ${gse.panelLifetimeYears} años. Valor escalado al panel real elegido para el pre-dimensionamiento.`
            });
          }
          // Dispersión multi-fuente — alerta si las estimaciones de producción difieren >15%.
          if (res.productionDispersion) {
            obs.push({
              type: 'warn',
              title: `Discrepancia ${res.productionDispersion.pct}% entre fuentes de producción`,
              text: `Las fuentes consultadas (${res.productionSources?.map(s => s.name).join(', ') || 'múltiples'}) reportan rangos de ${res.productionDispersion.min.toLocaleString('es-CO')}–${res.productionDispersion.max.toLocaleString('es-CO')} kWh/año. El pre-dimensionamiento usa el promedio para reducir sesgo. Para diseño detallado, validar con instalador en sitio considerando sombras estacionales y soiling.`
            });
          } else if (res.productionSources?.length >= 2) {
            obs.push({
              type: 'info',
              title: `Producción validada por ${res.productionSources.length} fuentes`,
              text: `${res.productionSources.map(s => `${s.name}: ${s.kwh.toLocaleString('es-CO')} kWh/año`).join(' · ')}. Convergencia <15% entre fuentes — dimensionamiento robusto.`
            });
          }
          if (f.systemType === 'off-grid' && res.mp > (parseFloat(f.monthlyKwh) || 0) * 1.1) {
            obs.push({ type: 'info', title: 'Excedente off-grid no monetizable', text: 'El sistema genera más que el consumo. Al no estar conectado al SIN, el excedente se desperdicia (dump load). Considera cargas diferibles: bombeo, termotanque, climatización o ampliar banco.' });
          }
          // ════════════ PACK 1 — Validaciones eléctricas adicionales ════════════
          // Margen Voc en frío (RETIE NEC 690.7 — recomienda margen ≥5% sobre Vdc_max)
          if (res.inv?.vocMax && panel?.voc && res.ppss > 0) {
            const vocCold = panel.voc * (1 + ((panel.tempCoeffVoc ?? -0.28) / 100) * (10 - 25));
            const stringVocCold = vocCold * res.ppss;
            const margin = (1 - stringVocCold / res.inv.vocMax) * 100;
            if (margin < 5) {
              obs.push({ type: 'warn', title: `Margen Voc en frío bajo (${margin.toFixed(1)}%)`, text: `String Voc @10°C = ${stringVocCold.toFixed(1)} V vs Vdc_max ${res.inv.vocMax} V. RETIE NEC 690.7 recomienda margen ≥5% para zonas con frío extremo o variabilidad climática (Sabana de Bogotá, Boyacá, Nariño). Considera reducir 1 panel por string si es zona fría.` });
            }
          }
          // DC/AC ratio del inversor — sub-dimensionado o sobredimensionado
          if (res.inv?.kw && res.actKwp > 0) {
            const dcacRatio = res.actKwp / res.inv.kw;
            const range = f.systemType === 'on-grid' ? [1.10, 1.35]
                       : f.systemType === 'hybrid' ? [1.00, 1.25]
                       : [0.95, 1.15]; // off-grid
            if (dcacRatio < range[0]) {
              obs.push({ type: 'warn', title: `DC/AC ratio bajo (${dcacRatio.toFixed(2)})`, text: `Ratio óptimo para ${f.systemType}: ${range[0]}-${range[1]}. Tu inversor está sobredimensionado vs los paneles → desperdicio de inversión y eficiencia menor en parcial. Considera inversor más chico o ampliar paneles.` });
            } else if (dcacRatio > range[1]) {
              obs.push({ type: 'warn', title: `DC/AC ratio alto (${dcacRatio.toFixed(2)})`, text: `Ratio óptimo para ${f.systemType}: ${range[0]}-${range[1]}. Tu inversor clipea (recorta) la potencia pico al mediodía → pérdida ~3-5% de generación. Considera inversor más grande.` });
            }
          }
          // Protecciones: si ≥2 strings paralelo, requiere fusibles por string (NEC 690.9)
          if (res.ns >= 2) {
            obs.push({ type: 'info', title: `Combinador requerido: fusibles por string (${res.ns} strings paralelo)`, text: `NEC 690.9 / RETIE: con 2+ strings en paralelo se requiere combinador con fusibles dimensionados a ~1.56 × Isc panel (≈${(panel.isc * 1.56).toFixed(1)} A) por string. Está incluido en el ítem "Protecciones" del presupuesto.` });
          }
          // DPS (Dispositivos de Protección contra Sobretensiones) — Tipo II en lado DC y AC
          obs.push({ type: 'info', title: 'Protecciones DPS Tipo II incluidas', text: 'El presupuesto incluye DPS clase II en lado DC (paneles → inversor) y AC (inversor → red). RETIE Sec. 240 obliga DPS para sistemas FV en zonas con descargas atmosféricas frecuentes (toda Colombia). DPS Tipo I se evalúa adicional para predios con pararrayos.' });
          // ════════════ PACK 3 — Validaciones físicas/estructurales ════════════
          // Carga estructural por material del techo
          if (f.roofMaterial && panel?.kg && res.numPanels > 0) {
            const totalKg = panel.kg * res.numPanels;
            const m2Used = res.numPanels * m2PerPanel;
            const kgPerM2 = totalKg / Math.max(1, m2Used);
            const matWeights = { teja_barro: 'crítico', lamina: 'medio', concreto: 'bajo', shingle: 'medio', otra: 'evaluar' };
            const risk = matWeights[f.roofMaterial] || 'evaluar';
            if (risk === 'crítico') {
              obs.push({ type: 'warn', title: `Carga estructural a evaluar (${kgPerM2.toFixed(1)} kg/m² adicional sobre teja barro)`, text: `Teja de barro tiene capacidad estructural limitada (~50-80 kg/m² adicional). Tu sistema añade ${totalKg.toFixed(0)} kg distribuidos en ${m2Used.toFixed(0)} m² (${kgPerM2.toFixed(1)} kg/m²). RETIE NSR-10 obliga cálculo estructural por ingeniero civil — requiere visita técnica obligatoria.` });
            } else if (risk === 'medio') {
              obs.push({ type: 'info', title: `Carga estructural a verificar (${kgPerM2.toFixed(1)} kg/m²)`, text: `Material seleccionado tiene capacidad media. Con ${totalKg.toFixed(0)} kg en ${m2Used.toFixed(0)} m² (${kgPerM2.toFixed(1)} kg/m²), validar viga/correa por ingeniero civil. Lámina <0.7mm requiere refuerzo.` });
            }
          }
          // Pendiente óptima por latitud (Colombia 4°N → ~5-15° óptimo)
          if (f.roofTiltDeg != null && f.lat != null) {
            const lat = Math.abs(Number(f.lat));
            const optimalTilt = lat;
            const tiltDiff = Math.abs(f.roofTiltDeg - optimalTilt);
            if (tiltDiff > 15) {
              obs.push({ type: 'info', title: `Pendiente subóptima (${f.roofTiltDeg}° vs ${optimalTilt.toFixed(0)}° óptimo)`, text: `Para latitud ${lat.toFixed(1)}°N el tilt óptimo anual es ~${optimalTilt.toFixed(0)}°. Tu techo está ${tiltDiff.toFixed(0)}° fuera del óptimo → pérdida ~${(tiltDiff * 0.4).toFixed(1)}% generación. Estructura inclinada (rack) puede recuperar ese %, pero suma costo y peso.` });
            }
          }
          // ════════════ PACK 2 — Soiling, degradación, lifecycle ════════════
          obs.push({ type: 'info', title: 'Pérdidas reales no mostradas en cobertura', text: `El cálculo aplica PR (Performance Ratio) 0.78 que ya incluye pérdidas eléctricas/térmicas/inversor. PERO no incluye: SOILING (3-8% año por suciedad acumulada — limpiar 2 veces/año recupera 90%) ni DEGRADACIÓN del panel (~0.5%/año, así pierde ~12% en 25 años). Considera estos al proyectar ahorros a 25 años.` });
          if (res.inv && bgt?.tot > 0) {
            obs.push({ type: 'info', title: 'Reemplazo de inversor a los 10-12 años', text: `Vida útil típica del inversor: 10-15 años (paneles 25-30). Reservar el costo de reemplazo en el ROI a 25 años. Inversor actual ${res.inv.brand} ${res.inv.model} de ${res.inv.kw} kW — costo aproximado de reemplazo ~10-15% del valor de equipos en pesos del año 10.` });
          }
          // ════════════ PACK 4 — Comerciales: garantías + Ley 1715 + AGPE ════════════
          obs.push({ type: 'info', title: 'Garantías estándar de los equipos', text: 'PANELES: 12-15 años de producto + 25 años de producción (típicamente al 80% de output). INVERSOR: 5-10 años extensible a 15-20 con upgrade pagado. BATERÍAS LFP: 10 años o 6.000 ciclos (~80% capacidad). Verificar garantía exacta del fabricante en propuesta detallada.' });
          if (bgt?.tot > 0) {
            const ley1715Renta = bgt.tot * 0.50;  // Deducción 50% renta
            const ley1715Iva = bgt.tot * 0.19;     // Exclusión IVA 19%
            obs.push({ type: 'info', title: `Beneficios Ley 1715/2014 — hasta ~${fmtCOP(ley1715Renta + ley1715Iva)} ahorro tributario`, text: `Sistemas FV cumplen con FNCE (Fuente No Convencional de Energía). Beneficios cuantificados: (1) Deducción renta 50% del valor del proyecto durante 15 años desde año fiscal — hasta ${fmtCOP(ley1715Renta)}. (2) Exclusión IVA 19% sobre equipos importados/nacionales — hasta ${fmtCOP(ley1715Iva)}. (3) Exclusión arancel sobre importación de paneles e inversores. (4) Depreciación acelerada — hasta 20%/año vs 10% normal. Aplicar via UPME → MinHacienda con factura del proyecto.` });
          }
          if (agpe?.excedentes > 0 && agpe?.gridExport) {
            obs.push({ type: 'info', title: `Trámite AGPE con ${operator.name}`, text: `Pasos: (1) Solicitud Conexión Simple (Formato CREG 030/2018), (2) Estudio de conexión por el OR, (3) Inscripción en CGM como AGPE ${agpe.agpeCategory}, (4) Instalación de medidor bidireccional (costo asumido por el OR para AGPE Menor ≤100 kWp), (5) Registro UPME-FNCE para beneficios Ley 1715. Tiempo total: 30-90 días. ALEBAS gestiona el trámite completo.` });
          }
          // Proyección 25 años con inflación CU
          if (bgt?.sav > 0 && bgt?.tot > 0) {
            const inflRate = 0.06;  // 6% anual CU típico Colombia
            let acumulado = 0;
            let yearROI = 0;
            for (let y = 1; y <= 25; y++) {
              const savYear = bgt.sav * Math.pow(1 + inflRate, y - 1) * Math.pow(0.995, y - 1); // degradación 0.5%/año
              acumulado += savYear;
              if (yearROI === 0 && acumulado >= bgt.tot) yearROI = y;
            }
            obs.push({ type: 'info', title: `Proyección 25 años: ahorro acumulado ~${fmtCOP(acumulado)} (ROI real ${yearROI || '>25'} años)`, text: `Asumiendo inflación CU 6%/año (típica histórica Colombia) y degradación panel 0.5%/año, el ahorro acumulado en 25 años sería ~${fmtCOP(acumulado)} vs inversión ${fmtCOP(bgt.tot)}. ROI real considerando inflación: ${yearROI || 'más de 25'} años. El primer año (${fmtCOP(bgt.sav)}) crece anualmente con la tarifa.` });
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
            <>
              <button
                style={{ ...ss.ghost, fontSize: 13, padding: '12px 22px', borderColor: `${C.yellow}66`, color: C.yellow }}
                onClick={downloadQuotePDF}
                title="Genera un resumen ejecutivo técnico en PDF — guárdalo o envíalo">
                ↓ Descargar PDF
              </button>
              <button style={{ ...ss.btn, fontSize: 14, padding: '13px 36px' }} onClick={submit}>
                Solicitar propuesta detallada →
              </button>
            </>
          )}
        </div>
        {(showNormativo || showObservaciones) && (
          <div style={{ textAlign: 'center', padding: '0 0 20px' }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 3 }}>Un ingeniero SolarHub · ALEBAS te contacta en menos de 24 h</div>
            <div style={{ fontSize: 10, color: C.teal }}>info@alebas.co · Villavicencio, Meta</div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            PDF EJECUTIVO — solo visible en @media print.
            Resumen técnico-comercial estructurado para A4 con identidad SolarHub.
            ═══════════════════════════════════════════════════════════════════ */}
        <div className="al-pdf-summary">
          {/* Cabecera con marca */}
          <div className="al-pdf-header">
            <img src={logo} alt="SolarHub" />
            <div>
              <h1>Cotización Solar Fotovoltaica</h1>
              <p>El ecosistema solar de Colombia</p>
            </div>
            <div className="al-pdf-quote-id">
              <div>Cotización #{Date.now().toString().slice(-8)}</div>
              <div>{new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
            </div>
          </div>

          {/* Datos del cliente */}
          <section className="al-pdf-section">
            <h2>Cliente</h2>
            <table className="al-pdf-table">
              <tbody>
                <tr><td>Nombre</td><td>{f.name || '—'}</td></tr>
                {f.company && <tr><td>Empresa</td><td>{f.company}</td></tr>}
                <tr><td>Dirección</td><td>{f.address || '—'} · {dest.city}, {dest.dept}</td></tr>
                <tr><td>Email</td><td>{f.email || '—'}</td></tr>
                <tr><td>Teléfono</td><td>{f.phone || '—'}</td></tr>
                <tr><td>Operador de red</td><td>{operator.name}</td></tr>
              </tbody>
            </table>
          </section>

          {/* Resumen ejecutivo: numbers grandes */}
          <section className="al-pdf-section">
            <h2>Resumen ejecutivo</h2>
            <div className="al-pdf-kpi-grid">
              <div className="al-pdf-kpi"><span>Sistema</span><strong>{res.actKwp} kWp</strong><small>{f.systemType}</small></div>
              <div className="al-pdf-kpi"><span>Generación anual</span><strong>{(res.productionSources?.length ? Math.round(res.productionSources.reduce((a,s)=>a+s.kwh,0)/res.productionSources.length) : res.kwhYear || 0).toLocaleString('es-CO')} kWh</strong><small>{res.productionSource}</small></div>
              {bgt?.sav > 0 && <div className="al-pdf-kpi"><span>Ahorro anual</span><strong>{fmtCOP(bgt.sav)}</strong><small>tarifa {operator.name}</small></div>}
              {bgt?.tot > 0 && <div className="al-pdf-kpi"><span>Inversión</span><strong>{fmtCOP(bgt.tot)}</strong><small>{bgt.budgetUsd ? `≈ USD ${fmt(bgt.budgetUsd)}` : ''}</small></div>}
              {bgt?.roi > 0 && <div className="al-pdf-kpi"><span>Retorno</span><strong>{bgt.roi} años</strong><small>ROI estimado</small></div>}
              <div className="al-pdf-kpi"><span>Cobertura</span><strong>{res.cov}%</strong><small>{res.sizedFor === 'area' ? 'limitado por área' : res.sizedFor === 'excedentes' ? 'incl. excedentes AGPE' : 'cubre consumo'}</small></div>
            </div>
          </section>

          {/* Equipos */}
          <section className="al-pdf-section">
            <h2>Configuración técnica</h2>
            <table className="al-pdf-table">
              <tbody>
                <tr><td>Paneles</td><td>{panel.brand} {panel.model} · {panel.wp} Wp × <strong>{res.numPanels}</strong> ({(res.numPanels * panel.wp / 1000).toFixed(2)} kWp DC)</td></tr>
                <tr><td>Strings</td><td><strong>{res.ns}</strong> string{res.ns > 1 ? 's' : ''} · {res.ppss} paneles/string</td></tr>
                {res.inv && <tr><td>Inversor</td><td>{res.inv.brand} {res.inv.model} · {res.inv.power} kW · {res.inv.phase === 3 ? 'Trifásico' : res.inv.phase === 2 ? 'Bifásico' : 'Monofásico'}</td></tr>}
                {needsB && batt && f.battQty > 0 && <tr><td>Banco baterías</td><td>{batt.brand} {batt.model} · {batt.voltage}V · {batt.kwh} kWh × <strong>{f.battQty}</strong> ({bankSeries}S × {bankParallel}P · bus {bankSeries * batt.voltage}V · {(batt.kwh * f.battQty).toFixed(2)} kWh totales)</td></tr>}
                <tr><td>Acometida</td><td>{ACOMETIDA_INFO[f.acometida]?.label || f.acometida}</td></tr>
                <tr><td>Área del techo</td><td>{f.availableArea ? `${f.availableArea} m² declarados` : 'no especificada'}{f.googleAreaM2 ? ` · ${Math.round(f.googleAreaM2)} m² aprovechables (Google Solar)` : ''}</td></tr>
              </tbody>
            </table>
          </section>

          {/* Layout del sistema — diagrama de componentes + strings + banco */}
          <section className="al-pdf-section">
            <h2>Layout y componentes del sistema</h2>

            {/* Diagrama del flujo: paneles → inversor → (batería) → casa + (red) */}
            <div className="al-pdf-system-diagram">
              <div className="al-pdf-comp">
                <div className="al-pdf-comp-icon" style={{ color: '#FF8C00' }}>☀</div>
                <div className="al-pdf-comp-label">Paneles</div>
                <div className="al-pdf-comp-spec">{res.numPanels} × {panel.wp}W<br />{res.actKwp} kWp DC</div>
              </div>
              <div className="al-pdf-arrow">→</div>
              {res.inv && (
                <>
                  <div className="al-pdf-comp">
                    <div className="al-pdf-comp-icon" style={{ color: '#01708B' }}>⊞</div>
                    <div className="al-pdf-comp-label">Inversor</div>
                    <div className="al-pdf-comp-spec">{res.inv.power} kW<br />{res.inv.phase === 3 ? '3∼' : res.inv.phase === 2 ? '2∼' : '1∼'}</div>
                  </div>
                  <div className="al-pdf-arrow">→</div>
                </>
              )}
              {needsB && batt && f.battQty > 0 && (
                <>
                  <div className="al-pdf-comp">
                    <div className="al-pdf-comp-icon" style={{ color: '#FF8C00' }}>▤</div>
                    <div className="al-pdf-comp-label">Banco DC</div>
                    <div className="al-pdf-comp-spec">{f.battQty} × {batt.kwh} kWh<br />{(batt.kwh * f.battQty).toFixed(1)} kWh @ {bankSeries * batt.voltage}V</div>
                  </div>
                  <div className="al-pdf-arrow">→</div>
                </>
              )}
              <div className="al-pdf-comp">
                <div className="al-pdf-comp-icon" style={{ color: '#01708B' }}>⌂</div>
                <div className="al-pdf-comp-label">Carga</div>
                <div className="al-pdf-comp-spec">{f.monthlyKwh} kWh/mes<br />{operator.name}</div>
              </div>
              {f.systemType !== 'off-grid' && (
                <>
                  <div className="al-pdf-arrow">{f.wantsExcedentes ? '⇄' : '←'}</div>
                  <div className="al-pdf-comp">
                    <div className="al-pdf-comp-icon" style={{ color: f.wantsExcedentes ? '#059669' : '#7A9EAA' }}>⚡</div>
                    <div className="al-pdf-comp-label">Red</div>
                    <div className="al-pdf-comp-spec">{f.wantsExcedentes ? 'AGPE' : 'consumo'}<br />{ACOMETIDA_INFO[f.acometida]?.label || f.acometida}</div>
                  </div>
                </>
              )}
            </div>

            {/* Strings — visual rectangular */}
            <div className="al-pdf-layout-subtitle">Distribución eléctrica DC — strings de paneles</div>
            <div className="al-pdf-layout-strings">
              {Array.from({ length: res.ns }).map((_, sIdx) => {
                const remaining = res.numPanels - sIdx * res.ppss;
                const panelsInString = Math.min(res.ppss, remaining);
                const colors = ['#01708B', '#FF8C00', '#4ade80', '#fb923c', '#a78bfa', '#f472b6'];
                const col = colors[sIdx % colors.length];
                return (
                  <div key={sIdx} className="al-pdf-string-row">
                    <div className="al-pdf-string-label" style={{ color: col, borderColor: col }}>ST{sIdx + 1}</div>
                    <div className="al-pdf-string-panels">
                      {Array.from({ length: panelsInString }).map((_, pIdx) => (
                        <div key={pIdx} className="al-pdf-panel-cell" style={{ background: `${col}33`, borderColor: col }} />
                      ))}
                    </div>
                    <div className="al-pdf-string-count">{panelsInString} × {panel.wp}W = {(panelsInString * panel.wp / 1000).toFixed(2)} kWp</div>
                  </div>
                );
              })}
            </div>

            {/* Banco de baterías — rack visual */}
            {needsB && batt && f.battQty > 0 && (() => {
              const totalKwh = +(batt.kwh * f.battQty).toFixed(1);
              const busV = bankSeries * batt.voltage;
              const ah = batt.voltage > 0 ? Math.round(batt.kwh * 1000 / batt.voltage) : null;
              const gridCols = Math.min(Math.max(bankParallel, 2), 6);
              return (
                <>
                  <div className="al-pdf-layout-subtitle">Banco de baterías — rack visual</div>
                  <div className="al-pdf-batt-rack">
                    <div className="al-pdf-batt-header">
                      Banco DC {busV}V · {totalKwh} kWh totales · {bankSeries}S × {bankParallel}P
                      {ah ? ` · ${ah} Ah por unidad` : ''}
                      {batt.maxDischargeA ? ` · ${batt.maxDischargeA}A descarga máx` : ''}
                    </div>
                    <div className="al-pdf-batt-grid" style={{ gridTemplateColumns: `repeat(${gridCols}, 1fr)` }}>
                      {Array.from({ length: f.battQty }).map((_, idx) => (
                        <div key={idx} className="al-pdf-batt-cell">
                          <div className="al-pdf-batt-num">#{idx + 1}</div>
                          <div className="al-pdf-batt-spec">{batt.voltage}V</div>
                          <div className="al-pdf-batt-kwh">{batt.kwh} kWh</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              );
            })()}
          </section>

          {/* Estimación de generación */}
          {res.productionSources?.length > 0 && (
            <section className="al-pdf-section">
              <h2>Estimación de generación</h2>
              <p className="al-pdf-lead">
                Promedio aplicado al pre-dimensionamiento: <strong>{Math.round(res.productionSources.reduce((a,s)=>a+s.kwh,0)/res.productionSources.length).toLocaleString('es-CO')} kWh/año</strong>{' '}
                ({res.productionSources.length} fuente{res.productionSources.length > 1 ? 's' : ''} consultada{res.productionSources.length > 1 ? 's' : ''})
              </p>
              <table className="al-pdf-table">
                <thead><tr><th>Fuente</th><th>kWh/año</th><th>Metodología</th></tr></thead>
                <tbody>
                  {res.productionSources.map(s => (
                    <tr key={s.name}>
                      <td><strong>{s.name}</strong></td>
                      <td>{s.kwh.toLocaleString('es-CO')}</td>
                      <td>
                        {s.name === 'Google Solar' && res.googleSolarEstimate?.methodology}
                        {s.name === 'PVWatts' && 'NREL TMY3 · pérdidas reales'}
                        {s.name === 'PVGIS' && 'JRC TMY satelital'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {res.productionDispersion ? (
                <p className="al-pdf-warn">⚠ Discrepancia entre fuentes: {res.productionDispersion.pct}%. Validar con instalador para diseño detallado.</p>
              ) : res.productionSources.length >= 2 ? (
                <p className="al-pdf-info">✓ Convergencia &lt;15% entre fuentes — dimensionamiento robusto.</p>
              ) : null}
            </section>
          )}

          {/* Análisis del techo + imagen satelital */}
          {f.roofConfidence != null && (
            <section className="al-pdf-section">
              <h2>Análisis del techo (Google Solar)</h2>
              {(f.roofStaticMapHDUrl || f.roofStaticMapUrl) && (
                <div className="al-pdf-roof-image-grid">
                  {f.roofStaticMapHDUrl && (
                    <div>
                      <img src={f.roofStaticMapHDUrl} alt="Vista satelital del techo" className="al-pdf-roof-image" crossOrigin="anonymous" />
                      <div className="al-pdf-image-caption">Satelital · zoom 20 · análisis DSM</div>
                    </div>
                  )}
                  {f.roofStaticMapRoadUrl && (
                    <div>
                      <img src={f.roofStaticMapRoadUrl} alt="Mapa de calles" className="al-pdf-roof-image" crossOrigin="anonymous" />
                      <div className="al-pdf-image-caption">Calles · contexto urbano</div>
                    </div>
                  )}
                </div>
              )}
              <table className="al-pdf-table">
                <tbody>
                  <tr><td>Confianza del análisis</td><td><strong>{Math.round(f.roofConfidence * 100)}%</strong> {f.roofImageryQuality && `· imagery ${f.roofImageryQuality}`}</td></tr>
                  {f.googleAreaM2 && <tr><td>Área aprovechable</td><td>{Math.round(f.googleAreaM2)} m² (excluye bordes, obstáculos, pendientes inviables)</td></tr>}
                  {f.roofWholeAreaM2 && <tr><td>Área total del techo</td><td>{Math.round(f.roofWholeAreaM2)} m² (con pendiente)</td></tr>}
                  {f.roofTiltDeg != null && <tr><td>Orientación</td><td>{f.roofAzimuthDeg}° azimuth · {f.roofTiltDeg}° inclinación</td></tr>}
                  {f.sunshineHoursYear && <tr><td>Horas sol/año</td><td>{Math.round(f.sunshineHoursYear).toLocaleString('es-CO')} h</td></tr>}
                  {f.shadeIndex != null && <tr><td>Sombreado</td><td>{Math.round((1 - f.shadeIndex) * 100)}% (índice {f.shadeIndex.toFixed(2)})</td></tr>}
                  {res.googleSolarEstimate && <tr><td>Configuración óptima Google</td><td>{res.googleSolarEstimate.bestConfigPanels} paneles · {res.googleSolarEstimate.bestConfigKwp} kWp · vida útil {res.googleSolarEstimate.panelLifetimeYears} años</td></tr>}
                </tbody>
              </table>
              {/* Tabla de segmentos del techo + compás visual + estado activo/disponible */}
              {f.roofSegments?.length >= 2 && (() => {
                const ACTIVE = '#059669';      // verde más oscuro para print
                const AVAILABLE = '#7A9EAA';
                const maxArea = Math.max(...f.roofSegments.map(s => s.areaMeters2 || 0));
                const activeCount = selectedSegmentIdx.size;
                return (
                  <>
                    <p className="al-pdf-lead" style={{ marginTop: 8 }}>
                      <strong>{f.roofSegments.length} segmentos identificados</strong>
                      {activeCount > 0 && (
                        <> · <strong style={{ color: '#059669' }}>{activeCount} activo{activeCount > 1 ? 's' : ''}</strong> {f.wantsExcedentes ? 'maximizando excedentes' : 'cubren el consumo'}</>
                      )}
                    </p>
                    <table className="al-pdf-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Estado</th>
                          <th>Área</th>
                          <th>Azimuth</th>
                          <th>Inclinación</th>
                          <th>Horas sol/año</th>
                        </tr>
                      </thead>
                      <tbody>
                        {f.roofSegments.slice(0, 12).map((s, i) => {
                          const isActive = selectedSegmentIdx.has(i);
                          return (
                            <tr key={i} style={isActive ? { background: '#ECFDF5' } : { color: '#777' }}>
                              <td><strong>{i + 1}</strong></td>
                              <td style={{ color: isActive ? '#059669' : '#7A9EAA', fontWeight: isActive ? 700 : 500 }}>
                                {isActive ? '✓ Activo' : '○ Disponible'}
                              </td>
                              <td>{s.areaMeters2 != null ? `${Math.round(s.areaMeters2)} m²` : '—'}</td>
                              <td>{s.azimuthDegrees != null ? `${Math.round(s.azimuthDegrees)}°` : '—'}</td>
                              <td>{s.pitchDegrees != null ? `${Math.round(s.pitchDegrees)}°` : '—'}</td>
                              <td>{s.sunshineHoursPerYear != null ? `${Math.round(s.sunshineHoursPerYear).toLocaleString('es-CO')} h` : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {f.roofSegments.length > 12 && (
                      <p className="al-pdf-info">+ {f.roofSegments.length - 12} segmento{f.roofSegments.length - 12 > 1 ? 's' : ''} adicional{f.roofSegments.length - 12 > 1 ? 'es' : ''} no listado{f.roofSegments.length - 12 > 1 ? 's' : ''}.</p>
                    )}

                    {/* Compás visual de orientación + estado */}
                    <div className="al-pdf-compass-wrap">
                      <div className="al-pdf-compass-title">Compás de orientación · activos vs disponibles</div>
                      <svg viewBox="-130 -130 260 260" width="220" height="220" aria-label="Compás">
                        <circle cx="0" cy="0" r="100" fill="none" stroke="#01708B33" strokeWidth="1" />
                        <circle cx="0" cy="0" r="60"  fill="none" stroke="#01708B22" strokeWidth="0.7" />
                        <text x="0" y="-110" textAnchor="middle" fill="#555" fontSize="12" fontWeight="700">N</text>
                        <text x="0" y="120" textAnchor="middle" fill="#FF8C00" fontSize="12" fontWeight="700">S</text>
                        <text x="115" y="4" textAnchor="middle" fill="#555" fontSize="12" fontWeight="700">E</text>
                        <text x="-115" y="4" textAnchor="middle" fill="#555" fontSize="12" fontWeight="700">O</text>
                        {f.roofSegments.map((s, i) => {
                          if (s.azimuthDegrees == null || maxArea <= 0) return null;
                          const isActive = selectedSegmentIdx.has(i);
                          const col = isActive ? ACTIVE : AVAILABLE;
                          const ratio = (s.areaMeters2 || 0) / maxArea;
                          const len = 35 + ratio * 65;
                          const az = (s.azimuthDegrees - 90) * Math.PI / 180;
                          const x2 = Math.cos(az) * len;
                          const y2 = Math.sin(az) * len;
                          return (
                            <g key={i} opacity={isActive ? 1 : 0.55}>
                              <line x1="0" y1="0" x2={x2} y2={y2}
                                stroke={col}
                                strokeWidth={isActive ? 2.5 : 1.5}
                                strokeDasharray={isActive ? '' : '3 2'}
                                strokeLinecap="round" />
                              <circle cx={x2} cy={y2} r="9" fill={col} />
                              <text x={x2} y={y2 + 3.5} textAnchor="middle" fill="#fff" fontSize="10" fontWeight="800">{i + 1}</text>
                            </g>
                          );
                        })}
                        <circle cx="0" cy="0" r="4" fill="#07090F" />
                      </svg>
                      <div className="al-pdf-compass-legend">
                        <div><span className="al-pdf-legend-dot" style={{ background: ACTIVE }} /> Activo · usado por el sistema</div>
                        <div><span className="al-pdf-legend-dot al-pdf-legend-dashed" style={{ borderColor: AVAILABLE }} /> Disponible · no usado</div>
                        <div className="al-pdf-compass-note">
                          {f.wantsExcedentes
                            ? '⚡ Excedentes activado: usa todos los segmentos viables (h☀ ≥ 1300/año).'
                            : 'El sistema usa los segmentos con más horas de sol hasta cubrir el consumo. Activar excedentes amplía a más segmentos.'}
                        </div>
                      </div>
                    </div>

                    {/* Trayectoria del sol — diagrama esquemático para print */}
                    <div className="al-pdf-sunpath-wrap">
                      <div className="al-pdf-compass-title">Trayectoria del sol sobre el techo (proyección)</div>
                      <svg viewBox="0 0 360 100" width="100%" height="80" preserveAspectRatio="none">
                        <rect x="0" y="60" width="360" height="40" fill="#01708B0d" />
                        <text x="20" y="55" fontSize="9" fill="#555" fontWeight="600">E · 6 AM</text>
                        <text x="170" y="20" fontSize="9" fill="#FF8C00" fontWeight="700">CENIT · 12 PM</text>
                        <text x="305" y="55" fontSize="9" fill="#555" fontWeight="600">O · 6 PM</text>
                        <path d="M 30 60 Q 180 0 330 60" fill="none" stroke="#FFD93D" strokeWidth="2" strokeDasharray="4 3" />
                        <circle cx="30" cy="60" r="5" fill="#FFD93D" />
                        <circle cx="180" cy="20" r="7" fill="#FF8C00" />
                        <circle cx="330" cy="60" r="5" fill="#FFD93D" />
                        <line x1="0" y1="60" x2="360" y2="60" stroke="#01708B66" strokeWidth="1" />
                        <text x="180" y="85" textAnchor="middle" fontSize="8" fill="#555">Plano del techo (línea horizontal de referencia)</text>
                      </svg>
                      <div className="al-pdf-compass-note">
                        Ubicación geográfica de Colombia (lat ~4°N): el sol pasa casi por el cenit al mediodía. El arco se proyecta de Este a Oeste atravesando el techo.
                      </div>
                    </div>
                  </>
                );
              })()}
            </section>
          )}

          {/* Inversión — desglose completo */}
          {bgt?.tot > 0 && (
            <section className="al-pdf-section">
              <h2>Inversión — desglose completo</h2>
              <table className="al-pdf-table">
                <thead>
                  <tr><th>Concepto</th><th style={{ textAlign: 'right' }}>Valor (COP)</th></tr>
                </thead>
                <tbody>
                  {bgt.pC > 0 && <tr><td>Paneles solares ({res.numPanels} × {fmtCOP(panel.price)})</td><td style={{ textAlign: 'right' }}>{fmtCOP(bgt.pC)}</td></tr>}
                  {bgt.iC > 0 && <tr><td>Inversor ({res.inv?.brand} {res.inv?.model})</td><td style={{ textAlign: 'right' }}>{fmtCOP(bgt.iC)}</td></tr>}
                  {bgt.bC > 0 && <tr><td>Banco baterías ({f.battQty} × {fmtCOP(batt.price)})</td><td style={{ textAlign: 'right' }}>{fmtCOP(bgt.bC)}</td></tr>}
                  {bgt.sA > 0 && <tr style={{ background: '#FF8C0008' }}><td><strong>Subtotal A — Equipos</strong></td><td style={{ textAlign: 'right' }}><strong>{fmtCOP(bgt.sA)}</strong></td></tr>}
                  {bgt.st > 0 && <tr><td>Estructura de montaje</td><td style={{ textAlign: 'right' }}>{fmtCOP(bgt.st)}</td></tr>}
                  {bgt.ca > 0 && <tr><td>Cableado DC/AC + canalización</td><td style={{ textAlign: 'right' }}>{fmtCOP(bgt.ca)}</td></tr>}
                  {bgt.pt > 0 && <tr><td>Protecciones (DPS, fusibles, breakers)</td><td style={{ textAlign: 'right' }}>{fmtCOP(bgt.pt)}</td></tr>}
                  {bgt.ins > 0 && <tr><td>Instalación certificada (mano de obra RETIE)</td><td style={{ textAlign: 'right' }}>{fmtCOP(bgt.ins)}</td></tr>}
                  {bgt.eng > 0 && <tr><td>Ingeniería y diseño</td><td style={{ textAlign: 'right' }}>{fmtCOP(bgt.eng)}</td></tr>}
                  {bgt.emsa > 0 && <tr><td>Trámites operador de red ({operator.name})</td><td style={{ textAlign: 'right' }}>{fmtCOP(bgt.emsa)}</td></tr>}
                  {bgt.transport > 0 && <tr><td>Transporte ({bgt.transportCarrier} · {ZONA_LABEL?.[bgt.transportZone] || bgt.transportZone})</td><td style={{ textAlign: 'right' }}>{fmtCOP(bgt.transport)}</td></tr>}
                  {bgt.iva > 0 && <tr><td>IVA aplicable</td><td style={{ textAlign: 'right' }}>{fmtCOP(bgt.iva)}</td></tr>}
                  {bgt.sB > 0 && <tr style={{ background: '#01708B08' }}><td><strong>Subtotal B — Servicios + IVA</strong></td><td style={{ textAlign: 'right' }}><strong>{fmtCOP(bgt.sB)}</strong></td></tr>}
                  <tr className="al-pdf-total"><td>TOTAL INVERSIÓN</td><td style={{ textAlign: 'right' }}>{fmtCOP(bgt.tot)}</td></tr>
                  {bgt.budgetUsd && <tr><td>Equivalente referencial</td><td style={{ textAlign: 'right' }}>USD {fmt(bgt.budgetUsd)} (TRM {bgt.trmDate})</td></tr>}
                </tbody>
              </table>

              {/* Retorno de inversión */}
              {bgt.sav > 0 && bgt.roi > 0 && (
                <div className="al-pdf-roi-grid">
                  <div className="al-pdf-roi-card">
                    <span>Ahorro anual</span>
                    <strong>{fmtCOP(bgt.sav)}</strong>
                    <small>tarifa CU {operator.name}</small>
                  </div>
                  <div className="al-pdf-roi-card">
                    <span>Retorno (payback)</span>
                    <strong>{bgt.roi} años</strong>
                    <small>ROI estimado</small>
                  </div>
                  {agpe?.totalAnualCop > 0 && (
                    <div className="al-pdf-roi-card">
                      <span>Beneficio AGPE/año</span>
                      <strong>{fmtCOP(agpe.totalAnualCop)}</strong>
                      <small>autoconsumo + excedentes</small>
                    </div>
                  )}
                </div>
              )}

              <p className="al-pdf-info">El presupuesto refleja precios mayoristas vigentes. Aplicación de incentivos tributarios Ley 1715/2014 (deducción renta + exclusión IVA + arancel) se evalúan en propuesta detallada según el alcance final del proyecto.</p>
            </section>
          )}

          {/* Memoria de cálculo — resumen técnico de las ecuaciones aplicadas */}
          <section className="al-pdf-section">
            <h2>Memoria de cálculo</h2>
            <p className="al-pdf-lead">Resumen de las ecuaciones aplicadas y valores intermedios usados en el pre-dimensionamiento.</p>
            <table className="al-pdf-table">
              <tbody>
                <tr>
                  <td><strong>1. Consumo</strong></td>
                  <td>
                    Mensual declarado: <strong>{Number(f.monthlyKwh || 0).toLocaleString('es-CO')} kWh/mes</strong> · Diario: <strong>{(Number(f.monthlyKwh || 0) / 30).toFixed(1)} kWh/día</strong> · Anual: <strong>{(Number(f.monthlyKwh || 0) * 12).toLocaleString('es-CO')} kWh/año</strong>
                  </td>
                </tr>
                <tr>
                  <td><strong>2. Recurso solar</strong></td>
                  <td>
                    PSH (Peak Sun Hours) sitio: <strong>{psh} h/día</strong> · Performance Ratio (PR): <strong>0.78</strong> (pérdidas térmicas + cableado + inversor)
                    {f.googleSolarEstimate?.specificYieldKwhPerKwpYear && <> · Yield real Google: <strong>{f.googleSolarEstimate.specificYieldKwhPerKwpYear} kWh/kWp·año</strong></>}
                  </td>
                </tr>
                <tr>
                  <td><strong>3. Cálculo kWp</strong></td>
                  <td>
                    kWp = consumo_diario / (PSH × PR) = {(Number(f.monthlyKwh || 0) / 30).toFixed(1)} / ({psh} × 0.78) = <strong>{(Number(f.monthlyKwh || 0) / 30 / (psh * 0.78)).toFixed(2)} kWp</strong> teórico → ajustado a yield real: <strong>{res.actKwp} kWp</strong>
                  </td>
                </tr>
                <tr>
                  <td><strong>4. Paneles</strong></td>
                  <td>
                    N = ⌈kWp × 1000 / Wp⌉ = ⌈{res.actKwp} × 1000 / {panel.wp}⌉ = <strong>{res.numPanels} paneles</strong> de {panel.wp} W
                  </td>
                </tr>
                {res.inv && (
                  <tr>
                    <td><strong>5. Strings</strong></td>
                    <td>
                      <strong>{res.ns} string{res.ns > 1 ? 's' : ''}</strong> × <strong>{res.ppss} paneles/string</strong>
                      {panel.voc && res.inv.vocMax && (
                        <> · Voc serie ({(panel.voc * res.ppss).toFixed(1)} V) ≤ Vdc_max inversor ({res.inv.vocMax} V) ✓ RETIE NEC 690.7</>
                      )}
                    </td>
                  </tr>
                )}
                {res.productionSources?.length > 0 && (
                  <tr>
                    <td><strong>6. Producción</strong></td>
                    <td>
                      Promedio multi-fuente: <strong>{Math.round(res.productionSources.reduce((a, s) => a + s.kwh, 0) / res.productionSources.length).toLocaleString('es-CO')} kWh/año</strong>
                      {' '}(de {res.productionSources.length} fuente{res.productionSources.length > 1 ? 's' : ''}: {res.productionSources.map(s => s.name).join(', ')})
                      · Mensual estimado: <strong>{Math.round(res.mp).toLocaleString('es-CO')} kWh/mes</strong>
                    </td>
                  </tr>
                )}
                <tr>
                  <td><strong>7. Cobertura</strong></td>
                  <td>
                    cobertura = (producción / consumo) × 100 = ({Math.round(res.mp)} / {f.monthlyKwh}) × 100 = <strong>{res.cov}%</strong>
                  </td>
                </tr>
                {needsB && batt && f.battQty > 0 && (
                  <tr>
                    <td><strong>8. Banco baterías</strong></td>
                    <td>
                      <strong>{f.battQty}</strong> × {batt.kwh} kWh = <strong>{(batt.kwh * f.battQty).toFixed(1)} kWh</strong> totales · Configuración <strong>{bankSeries}S × {bankParallel}P</strong> @ bus DC <strong>{bankSeries * batt.voltage} V</strong>
                      {f.systemType === 'off-grid' && f.autonomyDays && (
                        <> · Autonomía <strong>{f.autonomyDays} día{f.autonomyDays > 1 ? 's' : ''}</strong> sin sol</>
                      )}
                    </td>
                  </tr>
                )}
                {agpe?.excedentes > 0 && (
                  <tr>
                    <td><strong>9. Excedentes AGPE</strong></td>
                    <td>
                      Categoría <strong>{agpe.agpeCategory}</strong> · Excedente anual: <strong>{Math.round(agpe.excedentes).toLocaleString('es-CO')} kWh/año</strong>
                      {agpe.priceExcedentes && <> · Tarifa: <strong>{Math.round(agpe.priceExcedentes)} COP/kWh</strong> ({agpe.agpeCategory === 'Menor' ? 'CU − G' : 'precio bolsa XM'})</>}
                      {' '}· Ingreso anual: <strong>{fmtCOP(agpe.ingresoExcedentes || 0)}</strong>
                    </td>
                  </tr>
                )}
                <tr>
                  <td><strong>{agpe?.excedentes > 0 ? '10' : (needsB ? '9' : '8')}. CO₂ evitado</strong></td>
                  <td>
                    {Math.round(res.ap).toLocaleString('es-CO')} kWh/año × 0.126 kg CO₂/kWh (factor SIN Colombia) = <strong>{Math.round(res.co2).toLocaleString('es-CO')} kg CO₂/año</strong>
                  </td>
                </tr>
                {bgt?.sav > 0 && bgt?.roi > 0 && (
                  <tr>
                    <td><strong>{agpe?.excedentes > 0 ? '11' : (needsB ? '10' : '9')}. Retorno</strong></td>
                    <td>
                      Inversión / ahorro_anual = {fmtCOP(bgt.tot)} / {fmtCOP(bgt.sav)} = <strong>{bgt.roi} años</strong> de payback
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <p className="al-pdf-info">
              Esta memoria es un resumen ejecutivo. La memoria detallada con planos
              eléctricos, cálculos térmicos por hora del día, configuración exacta de
              protecciones (DPS, fusibles, breakers) y cumplimiento RETIE punto a punto
              se entrega con la propuesta firmada del ingeniero electricista titulado.
            </p>
          </section>

          {/* Marco normativo */}
          <section className="al-pdf-section">
            <h2>Marco normativo aplicable</h2>
            <ul className="al-pdf-list">
              <li>RETIE — instalación eléctrica certificada</li>
              {agpe?.excedentes > 0 && <li>CREG 174-2021 — Régimen AGPE {agpe.agpeCategory || 'Mayor'}</li>}
              <li>Ley 1715/2014 — incentivos tributarios para FNCE (deducción renta + IVA + arancel)</li>
              {f.systemType !== 'on-grid' && <li>NTC 2050 (capítulo 6) — sistemas autónomos y de respaldo</li>}
            </ul>
          </section>

          {/* Footer */}
          <div className="al-pdf-footer">
            <div>
              <strong>SolarHub</strong><br />
              info@alebas.co · solar-hub.co<br />
              Villavicencio, Meta · Colombia
            </div>
            <div className="al-pdf-disclaimer">
              Esta cotización es una estimación basada en datos públicos (Google Solar, PVGIS, PVWatts, NASA POWER, XM)
              y modelos de pre-dimensionamiento. La propuesta detallada y firmada requiere visita técnica del
              ingeniero SolarHub. Validez: 15 días corridos desde la fecha de emisión.
            </div>
          </div>
        </div>
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
    <div className="al-loading-screen" style={{
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

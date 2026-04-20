// ==================== BRAND COLORS ====================
export const C = {
  teal: '#01708B', tD: '#015a70', tL: '#01708B22',
  yellow: '#EFDB00', yD: '#c4b400',
  gray: '#686B71',
  dark: '#050d12', card: '#08151e', card2: '#111f35',
  border: '#01708B2a', borderLight: '#01708B15',
  text: '#e8f4f7', muted: '#7a9eaa',
  green: '#4ade80', red: '#f87171', orange: '#fb923c',
};

// ==================== OPERATORS DE RED (OR) ====================
// Mapeo OR ↔ departamento basado en registros CREG/Superservicios y XM (Sinergox).
// Códigos SIC para correlacionar con el API de XM (POST /lists, MetricId: ListadoAgentes).
// Las tarifas son referencia (CU promedio residencial estrato 4 sin subsidio); se actualizan
// vía PDFs mensuales del operador o el sync con XM en src/services/xm.js (precio bolsa).
export const OPERATORS = [
  { sic: 'EMSC', name: 'EMSA',           fullName: 'Electrificadora del Meta',                    region: 'Meta', tariff: 650, psh: 4.6 },
  { sic: 'EPMC', name: 'EPM',            fullName: 'Empresas Públicas de Medellín',               region: 'Antioquia', tariff: 680, psh: 4.5 },
  { sic: 'ENDC', name: 'Enel Colombia',  fullName: 'Enel Colombia (ex Codensa)',                  region: 'Bogotá D.C., Cundinamarca', tariff: 720, psh: 4.2 },
  { sic: 'EBSC', name: 'EBSA',           fullName: 'Empresa de Energía de Boyacá',                region: 'Boyacá', tariff: 705, psh: 4.2 },
  { sic: 'CETC', name: 'Celsia Tolima',  fullName: 'Celsia Colombia (Tolima)',                    region: 'Tolima', tariff: 670, psh: 4.8 },
  { sic: 'CEVC', name: 'Celsia Valle',   fullName: 'Celsia Colombia (Valle del Cauca)',           region: 'Valle del Cauca', tariff: 660, psh: 4.6 },
  { sic: 'CDLC', name: 'Cedelca',        fullName: 'Compañía Energética del Cauca',               region: 'Cauca', tariff: 685, psh: 4.4 },
  { sic: 'AIRC', name: 'Air-e',          fullName: 'Air-e (sucesor Electricaribe)',               region: 'Atlántico, Magdalena, La Guajira', tariff: 640, psh: 5.3 },
  { sic: 'AFNC', name: 'Afinia',         fullName: 'Afinia (filial EPM, ex Electricaribe)',       region: 'Bolívar, Sucre, Córdoba, Cesar', tariff: 635, psh: 5.0 },
  { sic: 'EHUC', name: 'Electrohuila',   fullName: 'Electrificadora del Huila',                   region: 'Huila, Caquetá', tariff: 670, psh: 5.1 },
  { sic: 'CHEC', name: 'CHEC',           fullName: 'Centrales Hidroeléctricas de Caldas',         region: 'Caldas', tariff: 710, psh: 4.1 },
  { sic: 'EDEC', name: 'EDEQ',           fullName: 'Empresa de Energía del Quindío',              region: 'Quindío', tariff: 700, psh: 4.4 },
  { sic: 'EEPC', name: 'EEP',            fullName: 'Energía de Pereira',                          region: 'Risaralda', tariff: 695, psh: 4.5 },
  { sic: 'ESSC', name: 'ESSA',           fullName: 'Electrificadora de Santander',                region: 'Santander', tariff: 690, psh: 5.0 },
  { sic: 'CENC', name: 'CENS',           fullName: 'Centrales Eléctricas de Norte de Santander',  region: 'Norte de Santander', tariff: 700, psh: 4.9 },
  { sic: 'CEDC', name: 'Cedenar',        fullName: 'Centrales Eléctricas de Nariño',              region: 'Nariño, Putumayo', tariff: 680, psh: 4.4 },
  { sic: 'ENRC', name: 'ENERCA',         fullName: 'Empresa de Energía de Casanare',              region: 'Casanare', tariff: 645, psh: 4.8 },
  { sic: 'ENLC', name: 'ENELAR',         fullName: 'Empresa de Energía de Arauca',                region: 'Arauca', tariff: 655, psh: 4.7 },
  { sic: 'DSPC', name: 'Dispac',         fullName: 'Distribuidora del Pacífico',                  region: 'Chocó', tariff: 720, psh: 4.0 },
  { sic: '',     name: 'No sé / Otro',   fullName: '',                                            region: '', tariff: 670, psh: 4.5 },
];

// ==================== TRANSPORT (Interrapidísimo 2025-2026) ====================
// Zonas desde Bogotá D.C. como origen
// Cap regulatorio: AGPE Mayor (CREG 174/2021) hasta 1 MW; usamos 500 kW como
// límite operativo del cotizador para evitar dimensionamientos fuera de alcance.
export const MAX_KWP_AGPE = 500;

// CREG 174/2021: Menor ≤100 kW (excedentes valorados a tarifa CU del comercializador,
// netting 1:1 mensual); Mayor 100 kW–1 MW (excedentes valorados al precio bolsa XM).
export const AGPE_LIMIT_KW_MENOR = 100;

export const DESTINOS_COURIER = [
  { dept: 'Bogotá D.C.', capital: 'Bogotá', zona: 'L', km: 0, tiempo: '24h', lat: 4.7110, lon: -74.0721 },
  { dept: 'Cundinamarca', capital: 'Facatativá', zona: 'R', km: 80, tiempo: '24-48h', lat: 4.8136, lon: -74.3537 },
  { dept: 'Boyacá', capital: 'Tunja', zona: 'R', km: 150, tiempo: '24-48h', lat: 5.5446, lon: -73.3573 },
  { dept: 'Tolima', capital: 'Ibagué', zona: 'R', km: 210, tiempo: '24-48h', lat: 4.4389, lon: -75.2322 },
  { dept: 'Meta', capital: 'Villavicencio', zona: 'R', km: 90, tiempo: '24-48h', lat: 4.1420, lon: -73.6266 },
  { dept: 'Huila', capital: 'Neiva', zona: 'R', km: 310, tiempo: '24-48h', lat: 2.9273, lon: -75.2819 },
  { dept: 'Caldas', capital: 'Manizales', zona: 'R', km: 310, tiempo: '24-48h', lat: 5.0689, lon: -75.5174 },
  { dept: 'Risaralda', capital: 'Pereira', zona: 'R', km: 330, tiempo: '24-48h', lat: 4.8133, lon: -75.6961 },
  { dept: 'Quindío', capital: 'Armenia', zona: 'R', km: 300, tiempo: '24-48h', lat: 4.5339, lon: -75.6811 },
  { dept: 'Santander', capital: 'Bucaramanga', zona: 'N1', km: 400, tiempo: '48h', lat: 7.1193, lon: -73.1227 },
  { dept: 'Antioquia', capital: 'Medellín', zona: 'N1', km: 415, tiempo: '48h', lat: 6.2442, lon: -75.5812 },
  { dept: 'Valle del Cauca', capital: 'Cali', zona: 'N1', km: 460, tiempo: '48h', lat: 3.4516, lon: -76.5320 },
  { dept: 'Norte de Santander', capital: 'Cúcuta', zona: 'N1', km: 590, tiempo: '48-72h', lat: 7.8939, lon: -72.5078 },
  { dept: 'Cauca', capital: 'Popayán', zona: 'N1', km: 580, tiempo: '48-72h', lat: 2.4448, lon: -76.6147 },
  { dept: 'Casanare', capital: 'Yopal', zona: 'N1', km: 380, tiempo: '48h', lat: 5.3378, lon: -72.3959 },
  { dept: 'Arauca', capital: 'Arauca', zona: 'N1', km: 530, tiempo: '48-72h', lat: 7.0903, lon: -70.7617 },
  { dept: 'Nariño', capital: 'Pasto', zona: 'N2', km: 820, tiempo: '48-72h', lat: 1.2136, lon: -77.2811 },
  { dept: 'Putumayo', capital: 'Mocoa', zona: 'N2', km: 700, tiempo: '48-72h', lat: 1.1503, lon: -76.6483 },
  { dept: 'Atlántico', capital: 'Barranquilla', zona: 'N2', km: 1000, tiempo: '48-72h', lat: 10.9685, lon: -74.7813 },
  { dept: 'Bolívar', capital: 'Cartagena', zona: 'N2', km: 1050, tiempo: '48-72h', lat: 10.3910, lon: -75.4794 },
  { dept: 'Magdalena', capital: 'Santa Marta', zona: 'N2', km: 1070, tiempo: '48-72h', lat: 11.2408, lon: -74.1990 },
  { dept: 'Cesar', capital: 'Valledupar', zona: 'N2', km: 850, tiempo: '48-72h', lat: 10.4631, lon: -73.2532 },
  { dept: 'Córdoba', capital: 'Montería', zona: 'N2', km: 890, tiempo: '48-72h', lat: 8.7479, lon: -75.8814 },
  { dept: 'Sucre', capital: 'Sincelejo', zona: 'N2', km: 930, tiempo: '48-72h', lat: 9.3047, lon: -75.3978 },
  { dept: 'La Guajira', capital: 'Riohacha', zona: 'N2', km: 1150, tiempo: '48-72h', lat: 11.5444, lon: -72.9072 },
  { dept: 'Caquetá', capital: 'Florencia', zona: 'N2', km: 590, tiempo: '48-72h', lat: 1.6144, lon: -75.6062 },
  { dept: 'Vichada', capital: 'Puerto Carreño', zona: 'D', km: 840, tiempo: '72-96h', lat: 6.1888, lon: -67.4856 },
  { dept: 'Guaviare', capital: 'San José G.', zona: 'D', km: 580, tiempo: '72-96h', lat: 2.5667, lon: -72.6450 },
  { dept: 'Chocó', capital: 'Quibdó', zona: 'D', km: 650, tiempo: '72-96h', lat: 5.6919, lon: -76.6583 },
  { dept: 'Amazonas', capital: 'Leticia', zona: 'D', km: 1600, tiempo: '96h+', lat: -4.2150, lon: -69.9406 },
  { dept: 'Vaupés', capital: 'Mitú', zona: 'D', km: 1300, tiempo: '96h+', lat: 1.2536, lon: -70.2336 },
  { dept: 'Guainía', capital: 'Inírida', zona: 'D', km: 1100, tiempo: '96h+', lat: 3.8653, lon: -67.9239 },
  { dept: 'San Andrés', capital: 'San Andrés (aéreo)', zona: 'D', km: 1800, tiempo: '96h+', lat: 12.5847, lon: -81.7006 },
];

// Tarifas Interrapidísimo 2025-2026 (oficiales)
export const INTER_ZONAS = {
  L:  { label: 'Local',          base: 7900,  kgAd: 3400 },
  R:  { label: 'Regional',       base: 10100, kgAd: 4000 },
  N1: { label: 'Nacional Z1',    base: 18500, kgAd: 4400 },
  N2: { label: 'Nacional Z2',    base: 23600, kgAd: 5500 },
  D:  { label: 'Difícil acceso', base: 80000, kgAd: 12000 },
};

// Tarifas Servientrega (referencia comparable)
export const SERVI_ZONAS = {
  L:  { label: 'Local',          base: 8500,  kgAd: 3600 },
  R:  { label: 'Regional',       base: 11200, kgAd: 4300 },
  N1: { label: 'Nacional Z1',    base: 19800, kgAd: 4800 },
  N2: { label: 'Nacional Z2',    base: 25800, kgAd: 6000 },
  D:  { label: 'Difícil acceso', base: 85000, kgAd: 13000 },
};

export const SOBREFLETE = 0.02;

// ==================== EQUIPMENT DEFAULTS ====================
// Schema extendido con specs eléctricos (Voc, Vmp, Isc, Imp, coef. temp.)
// y de inversores (vocMax, mppt range, idcMax, mpptCount). Estos campos
// se pueden enriquecer desde la base CEC / NREL SAM vía BackOffice.
// Los defaults son valores típicos de datasheet — importar desde CEC
// garantiza precisión oficial para validar layouts y construir unifilares.
export const DEFAULT_PANELS = [
  { id: 'p1', brand: 'JA Solar',       model: 'JAM72S20-545MR',  wp: 545, price: 290000, kg: 24.9,
    voc: 49.75, vmp: 41.8, isc: 13.85, imp: 13.04, tempCoeffPmax: -0.35, tempCoeffVoc: -0.275, cellCount: 144 },
  { id: 'p2', brand: 'Risen Energy',   model: 'RSM144-7-550M',   wp: 550, price: 285000, kg: 25.5,
    voc: 49.8, vmp: 41.95, isc: 13.95, imp: 13.11, tempCoeffPmax: -0.35, tempCoeffVoc: -0.28, cellCount: 144 },
  { id: 'p3', brand: 'Canadian Solar', model: 'CS6W-550MS',      wp: 550, price: 280000, kg: 25.0,
    voc: 49.8, vmp: 41.7, isc: 13.95, imp: 13.19, tempCoeffPmax: -0.34, tempCoeffVoc: -0.26, cellCount: 144 },
  { id: 'p4', brand: 'Trina Solar',    model: 'TSM-550DE09',     wp: 550, price: 295000, kg: 25.5,
    voc: 49.9, vmp: 41.9, isc: 13.93, imp: 13.13, tempCoeffPmax: -0.34, tempCoeffVoc: -0.25, cellCount: 144 },
];

export const DEFAULT_INVERTERS = [
  { id: 'i1', brand: 'Growatt', model: 'MIN 3000TL-XH',      kw: 3,  phase: 1, price: 1850000, type: 'on-grid',  kg: 14,
    vocMax: 550, mpptVmin: 80,  mpptVmax: 500, mpptCount: 2, idcMax: 13.5, efficiency: 97.6, vac: 240 },
  { id: 'i2', brand: 'Growatt', model: 'MIN 5000TL-XH',      kw: 5,  phase: 1, price: 2450000, type: 'on-grid',  kg: 19,
    vocMax: 550, mpptVmin: 80,  mpptVmax: 500, mpptCount: 2, idcMax: 13.5, efficiency: 97.6, vac: 240 },
  { id: 'i3', brand: 'Growatt', model: 'MID 10KTL3-X2',      kw: 10, phase: 3, price: 4200000, type: 'on-grid',  kg: 32,
    vocMax: 1000, mpptVmin: 200, mpptVmax: 850, mpptCount: 2, idcMax: 25, efficiency: 98.4, vac: 400 },
  { id: 'i4', brand: 'Solis',   model: 'S6-GR1P5K-M',        kw: 5,  phase: 1, price: 2550000, type: 'on-grid',  kg: 20,
    vocMax: 600, mpptVmin: 90,  mpptVmax: 520, mpptCount: 2, idcMax: 16, efficiency: 97.5, vac: 240 },
  { id: 'i5', brand: 'Growatt', model: 'SPH 5000TL BL-UP',   kw: 5,  phase: 1, price: 4800000, type: 'hybrid',   kg: 22,
    vocMax: 550, mpptVmin: 120, mpptVmax: 450, mpptCount: 2, idcMax: 13.5, efficiency: 97.5, vac: 240 },
  { id: 'i6', brand: 'Growatt', model: 'SPH 10000TL3 BH-UP', kw: 10, phase: 3, price: 7200000, type: 'hybrid',   kg: 36,
    vocMax: 1000, mpptVmin: 200, mpptVmax: 800, mpptCount: 2, idcMax: 25, efficiency: 98.2, vac: 400 },
  { id: 'i7', brand: 'Growatt', model: 'OFF3000TL-HVM',       kw: 3,  phase: 1, price: 3200000, type: 'off-grid', kg: 17,
    vocMax: 500, mpptVmin: 120, mpptVmax: 430, mpptCount: 1, idcMax: 18, efficiency: 96.5, vac: 240 },
  { id: 'i8', brand: 'Victron', model: 'MultiPlus-II 5000VA', kw: 4,  phase: 1, price: 5500000, type: 'off-grid', kg: 28,
    vocMax: 250, mpptVmin: 60,  mpptVmax: 200, mpptCount: 1, idcMax: 20, efficiency: 96, vac: 230 },
];

export const DEFAULT_BATTERIES = [
  { id: 'b1', brand: 'Pylontech', model: 'US3000C',             kwh: 3.5, price: 3200000, kg: 37, voltage: 48,  chemistry: 'LFP', maxDischargeA: 74,  cycles: 6000 },
  { id: 'b2', brand: 'BYD',       model: 'Battery-Box HVS 7.7', kwh: 7.7, price: 7500000, kg: 80, voltage: 409, chemistry: 'LFP', maxDischargeA: 25,  cycles: 8000 },
  { id: 'b3', brand: 'Hubble',    model: 'AM-10',               kwh: 10,  price: 9800000, kg: 95, voltage: 51.2,chemistry: 'LFP', maxDischargeA: 150, cycles: 6000 },
];

export const DEFAULT_PRICING = {
  structure_per_panel: 180000,
  cabling_per_kwp:     350000,
  protections_per_kwp: 280000,
  installation_per_kwp:600000,
  engineering:         800000,
  emsa_tramites:       500000,
  iva:                 19,
};

export const DEPTS = [
  'Amazonas','Antioquia','Arauca','Atlántico','Bolívar','Boyacá','Caldas',
  'Caquetá','Casanare','Cauca','Cesar','Chocó','Córdoba','Cundinamarca',
  'Guainía','Guaviare','Huila','La Guajira','Magdalena','Meta','Nariño',
  'Norte de Santander','Putumayo','Quindío','Risaralda','San Andrés',
  'Santander','Sucre','Tolima','Valle del Cauca','Vaupés','Vichada'
];

// ==================== CALCULATIONS ====================
export const fmt = n => new Intl.NumberFormat('es-CO').format(Math.round(n));
export const fmtCOP = n => `$${fmt(n)}`;

// opts.pvgisAnnualKwh: si se pasa, sobreescribe la producción heurística (PSH).
// opts.targetKwp: si se pasa, dimensiona al kWp objetivo en lugar del consumo
//   (útil cuando el cliente quiere sobredimensionar para generar excedentes).
// Cap por MAX_KWP_AGPE para evitar dimensionar fuera del alcance regulatorio.
export function calcSystem(monthlyKwh, panel, invKw, bUnit, bQty, psh, opts = {}) {
  const PR = 0.78;
  const daily = monthlyKwh / 30;
  const consumptionKwp = daily / (psh * PR);
  const rawTarget = opts.targetKwp && opts.targetKwp > 0 ? opts.targetKwp : consumptionKwp;
  const kwpN = Math.min(rawTarget, MAX_KWP_AGPE);
  const cappedByRegulation = rawTarget > MAX_KWP_AGPE;
  const numPanels = Math.ceil(kwpN * 1000 / panel.wp);
  const actKwp = parseFloat(((numPanels * panel.wp) / 1000).toFixed(2));

  let dp, mp, ap;
  const usingPVGIS = opts.pvgisAnnualKwh && opts.pvgisAnnualKwh > 0;
  if (usingPVGIS) {
    ap = Math.round(opts.pvgisAnnualKwh);
    mp = Math.round(ap / 12);
    dp = parseFloat((ap / 365).toFixed(1));
  } else {
    dp = parseFloat((actKwp * psh * PR).toFixed(1));
    mp = Math.round(dp * 30);
    ap = Math.round(dp * 365);
  }

  const cov = Math.min(Math.round((mp / monthlyKwh) * 100), 120);
  const dca = parseFloat((actKwp / invKw).toFixed(2));
  const co2 = Math.round(ap * 0.126);
  const pps = Math.floor(700 / 40);
  const ns = Math.ceil(numPanels / pps);
  const ppss = Math.ceil(numPanels / ns);
  const roof = parseFloat((numPanels * 2.2).toFixed(0));
  const tB = bUnit && bQty ? parseFloat((bQty * bUnit.kwh).toFixed(1)) : 0;
  const aut = tB > 0 ? parseFloat(((tB * 0.8) / (daily / 24)).toFixed(1)) : 0;
  const kgTotal = (numPanels * (panel.kg || 25.5))
    + (numPanels * 7.5)  // estructura
    + invKw              // inversor aprox
    + (bUnit && bQty ? bQty * (bUnit.kg || 37) : 0)
    + (8 + numPanels * 0.3); // accesorios
  const dataSource = usingPVGIS ? 'PVGIS' : 'PSH';
  return { numPanels, actKwp, dp, mp, ap, cov, dca, co2, ns, ppss, roof, tB, aut, kgTotal, dataSource, cappedByRegulation };
}

export function calcTransport(zonas, zona, kgTotal, valorDec) {
  const z = zonas[zona];
  const flete = Math.round(z.base + Math.max(0, kgTotal - 1) * z.kgAd);
  const sf = Math.round(valorDec * SOBREFLETE);
  return { flete, sf, total: flete + sf };
}

export function calcBudget(sys, panel, inv, bUnit, bQty, pricing, transport) {
  const pC = sys.numPanels * panel.price;
  const iC = inv.price;
  const bC = bUnit && bQty ? bQty * bUnit.price : 0;
  const sA = pC + iC + bC;
  const st = sys.numPanels * pricing.structure_per_panel;
  const ca = sys.actKwp * pricing.cabling_per_kwp;
  const pt = sys.actKwp * pricing.protections_per_kwp;
  const ins = sys.actKwp * pricing.installation_per_kwp;
  const bBase = st + ca + pt + ins + pricing.engineering + pricing.emsa_tramites + (transport || 0);
  const iva = Math.round(bBase * (pricing.iva / 100));
  const sB = bBase + iva;
  const tot = sA + sB;
  return { pC, iC, bC, sA, st, ca, pt, ins, eng: pricing.engineering, emsa: pricing.emsa_tramites, transport: transport || 0, bBase, iva, sB, tot };
}

// Calcula el beneficio económico anual aplicando la regulación AGPE.
//   - autoConsumo (energía generada que coincide con consumo): ahorro a tarifa CU.
//   - excedentes (energía inyectada a la red): valorada según categoría AGPE.
//     · Menor (kWp ≤ 100): netting 1:1 a tarifa CU (Resolución CREG 174/2021).
//     · Mayor (100 < kWp ≤ 1000): liquidación a precio bolsa XM (PrecBolsNal).
// IMPORTANTE: los sistemas off-grid NO están conectados a la red y por
// definición no entregan excedentes — la energía sobrante se pierde
// (o se limita vía dump load). Para off-grid gridExport=false y sólo
// se contabiliza ahorro por autoconsumo.
export function calcAGPEBenefit(annualProdKwh, monthlyConsumptionKwh, tariffCU, spotPriceCOPkWh, kwp, opts = {}) {
  const gridExport = opts.gridExport !== false;
  const annualConsumption = monthlyConsumptionKwh * 12;
  const autoConsumed = Math.min(annualProdKwh, annualConsumption);
  const rawExcedentes = Math.max(0, annualProdKwh - annualConsumption);
  const excedentes = gridExport ? rawExcedentes : 0;
  const energiaDesperdiciada = gridExport ? 0 : rawExcedentes;
  const isMenor = kwp <= AGPE_LIMIT_KW_MENOR;
  const ahorroAutoconsumo = Math.round(autoConsumed * tariffCU);
  const priceExcedentes = gridExport ? (isMenor ? tariffCU : (spotPriceCOPkWh || 0)) : 0;
  const ingresoExcedentes = Math.round(excedentes * priceExcedentes);
  const totalAnual = ahorroAutoconsumo + ingresoExcedentes;
  return {
    autoConsumed: Math.round(autoConsumed),
    excedentes: Math.round(excedentes),
    energiaDesperdiciada: Math.round(energiaDesperdiciada),
    ahorroAutoconsumo,
    ingresoExcedentes,
    priceExcedentes,
    totalAnual,
    gridExport,
    agpeCategory: gridExport ? (isMenor ? 'Menor' : 'Mayor') : 'No aplica (off-grid)',
    rule: gridExport
      ? (isMenor ? 'Netting 1:1 a tarifa CU' : 'Excedentes a precio bolsa XM')
      : 'Sistema aislado — no entrega excedentes a la red',
  };
}

export function autoInverter(kwp, sysType, inverters) {
  const typed = inverters.filter(i => i.type === sysType);
  const fit = typed.filter(i => i.kw >= kwp * 0.75).sort((a, b) => a.kw - b.kw);
  return fit[0] || typed[0] || inverters[0];
}

// Valida que el layout de strings sea eléctricamente compatible con el inversor:
//  1. Voc corregido por temperatura fría × strLen ≤ Vdc_max del inversor.
//     Usa tempCoeffVoc (%/°C) y una temperatura de diseño fría (NEC 690.7
//     para Colombia: ~5°C en zonas de mayor altitud; default 10°C).
//  2. Vmp corregido × strLen dentro del rango MPPT [mpptVmin, mpptVmax]
//     (caliente reduce Vmp → puede salir por debajo del piso MPPT).
//  3. Imp (corriente por string) ≤ idcMax / mpptCount.
//  4. numStrings ≤ mpptCount × 2 (típico: 2 strings por MPPT en paralelo).
// Retorna { ok, errors: [], warnings: [], metrics: {...} } para mostrar
// en el Quoter paso 5 junto al unifilar.
export function validateLayout(panel, inverter, panelsPerString, numStrings, coldTempC = 10, hotTempC = 65) {
  const errors = [];
  const warnings = [];
  if (!panel || !inverter) return { ok: false, errors: ['Panel o inversor no definido'], warnings: [], metrics: {} };

  const voc = panel.voc || 0;
  const vmp = panel.vmp || 0;
  const imp = panel.imp || 0;
  const tcVoc = panel.tempCoeffVoc || -0.28; // %/°C
  const tcPmax = panel.tempCoeffPmax || -0.35;
  const vocMax = inverter.vocMax || 0;
  const mpptMin = inverter.mpptVmin || 0;
  const mpptMax = inverter.mpptVmax || 0;
  const mpptCount = inverter.mpptCount || 1;
  const idcMax = inverter.idcMax || 0;

  // Voc en frío (suma por string)
  const vocCold = voc * (1 + (tcVoc / 100) * (coldTempC - 25));
  const stringVocCold = vocCold * panelsPerString;
  // Vmp en caliente (coef Pmax es cercano al de Vmp en términos %)
  const vmpHot = vmp * (1 + (tcPmax / 100) * (hotTempC - 25));
  const stringVmpHot = vmpHot * panelsPerString;
  const stringVmpStc = vmp * panelsPerString;
  const stringsPerMppt = Math.ceil(numStrings / mpptCount);
  const currentPerMppt = imp * stringsPerMppt;

  if (vocMax && stringVocCold > vocMax) {
    errors.push(`Voc en frío por string (${stringVocCold.toFixed(1)}V @ ${coldTempC}°C) supera Vdc_max del inversor (${vocMax}V). Reducir paneles por string.`);
  } else if (vocMax && stringVocCold > vocMax * 0.95) {
    warnings.push(`Voc en frío (${stringVocCold.toFixed(1)}V) muy cerca del límite (${vocMax}V). Margen <5%.`);
  }
  if (mpptMax && stringVmpStc > mpptMax) {
    errors.push(`Vmp STC por string (${stringVmpStc.toFixed(1)}V) supera techo MPPT (${mpptMax}V). Inversor no podrá seguir el punto de máxima potencia.`);
  }
  if (mpptMin && stringVmpHot < mpptMin) {
    warnings.push(`Vmp en caliente (${stringVmpHot.toFixed(1)}V @ ${hotTempC}°C) cae por debajo del piso MPPT (${mpptMin}V). Pérdida de producción al mediodía.`);
  }
  if (idcMax && currentPerMppt > idcMax) {
    errors.push(`Corriente por MPPT (${currentPerMppt.toFixed(1)}A con ${stringsPerMppt} strings) supera Idc_max (${idcMax}A). Reducir strings en paralelo.`);
  }
  if (numStrings > mpptCount * 2) {
    warnings.push(`${numStrings} strings en ${mpptCount} MPPT → ${stringsPerMppt} strings por MPPT. Validar combinador/fusibles.`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    metrics: {
      stringVocCold: parseFloat(stringVocCold.toFixed(1)),
      stringVmpStc: parseFloat(stringVmpStc.toFixed(1)),
      stringVmpHot: parseFloat(stringVmpHot.toFixed(1)),
      currentPerMppt: parseFloat(currentPerMppt.toFixed(2)),
      stringsPerMppt,
      vocMax, mpptMin, mpptMax, idcMax, mpptCount,
    },
  };
}

// localStorage helpers (replaces window.storage for production)
export const storage = {
  get: (key) => {
    try {
      const val = localStorage.getItem(key);
      return val ? { value: val } : null;
    } catch { return null; }
  },
  set: (key, value) => {
    try { localStorage.setItem(key, value); } catch {}
  }
};

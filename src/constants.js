// ==================== BRAND COLORS ====================
export const C = {
  teal: '#FF8C00', tD: '#cc7000', tL: '#FF8C0022',
  yellow: '#FFD93D', yD: '#FFB800',
  gray: '#686B71',
  dark: '#07090F', card: '#0C1422', card2: '#111f35',
  border: '#FF8C002a', borderLight: '#FF8C0015',
  text: '#e8f4f7', muted: '#7a9eaa',
  green: '#4ade80', red: '#f87171', orange: '#FF8C00',
};

// ==================== OPERATORS ====================
export const OPERATORS = [
  { name: 'EMSA', region: 'Meta, Casanare, Vichada', tariff: 650, psh: 4.6 },
  { name: 'EPM', region: 'Antioquia', tariff: 680, psh: 4.5 },
  { name: 'Enel / Codensa', region: 'Bogotá D.C., Cundinamarca', tariff: 720, psh: 4.2 },
  { name: 'Celsia', region: 'Valle del Cauca, Tolima', tariff: 660, psh: 4.8 },
  { name: 'Electrocosta', region: 'Atlántico, Bolívar, Córdoba, Sucre, La Guajira', tariff: 640, psh: 5.2 },
  { name: 'Afinia', region: 'Córdoba, Sucre, Bolívar (interior)', tariff: 635, psh: 5.0 },
  { name: 'Electrohuila', region: 'Huila, Caquetá', tariff: 670, psh: 5.1 },
  { name: 'CHEC', region: 'Caldas, Risaralda (parcial)', tariff: 710, psh: 4.1 },
  { name: 'Centrales', region: 'Risaralda, Quindío', tariff: 695, psh: 4.3 },
  { name: 'ESSA', region: 'Santander', tariff: 690, psh: 5.0 },
  { name: 'CENS', region: 'Norte de Santander', tariff: 700, psh: 4.9 },
  { name: 'EEB', region: 'Boyacá, Cundinamarca (parcial)', tariff: 705, psh: 4.2 },
  { name: 'Cedenar', region: 'Nariño, Putumayo', tariff: 680, psh: 4.4 },
  { name: 'ENERCA', region: 'Arauca', tariff: 655, psh: 4.7 },
  { name: 'Llanos Energía', region: 'Casanare', tariff: 645, psh: 4.8 },
  { name: 'Dispac', region: 'Chocó', tariff: 720, psh: 4.0 },
  { name: 'No sé / Otro', region: '', tariff: 670, psh: 4.5 },
];

// ==================== TRANSPORT (Interrapidísimo 2025-2026) ====================
// Zonas desde Bogotá D.C. como origen
export const DESTINOS_COURIER = [
  { dept: 'Bogotá D.C.', capital: 'Bogotá', zona: 'L', km: 0, tiempo: '24h' },
  { dept: 'Cundinamarca', capital: 'Facatativá', zona: 'R', km: 80, tiempo: '24-48h' },
  { dept: 'Boyacá', capital: 'Tunja', zona: 'R', km: 150, tiempo: '24-48h' },
  { dept: 'Tolima', capital: 'Ibagué', zona: 'R', km: 210, tiempo: '24-48h' },
  { dept: 'Meta', capital: 'Villavicencio', zona: 'R', km: 90, tiempo: '24-48h' },
  { dept: 'Huila', capital: 'Neiva', zona: 'R', km: 310, tiempo: '24-48h' },
  { dept: 'Caldas', capital: 'Manizales', zona: 'R', km: 310, tiempo: '24-48h' },
  { dept: 'Risaralda', capital: 'Pereira', zona: 'R', km: 330, tiempo: '24-48h' },
  { dept: 'Quindío', capital: 'Armenia', zona: 'R', km: 300, tiempo: '24-48h' },
  { dept: 'Santander', capital: 'Bucaramanga', zona: 'N1', km: 400, tiempo: '48h' },
  { dept: 'Antioquia', capital: 'Medellín', zona: 'N1', km: 415, tiempo: '48h' },
  { dept: 'Valle del Cauca', capital: 'Cali', zona: 'N1', km: 460, tiempo: '48h' },
  { dept: 'Norte de Santander', capital: 'Cúcuta', zona: 'N1', km: 590, tiempo: '48-72h' },
  { dept: 'Cauca', capital: 'Popayán', zona: 'N1', km: 580, tiempo: '48-72h' },
  { dept: 'Casanare', capital: 'Yopal', zona: 'N1', km: 380, tiempo: '48h' },
  { dept: 'Arauca', capital: 'Arauca', zona: 'N1', km: 530, tiempo: '48-72h' },
  { dept: 'Nariño', capital: 'Pasto', zona: 'N2', km: 820, tiempo: '48-72h' },
  { dept: 'Putumayo', capital: 'Mocoa', zona: 'N2', km: 700, tiempo: '48-72h' },
  { dept: 'Atlántico', capital: 'Barranquilla', zona: 'N2', km: 1000, tiempo: '48-72h' },
  { dept: 'Bolívar', capital: 'Cartagena', zona: 'N2', km: 1050, tiempo: '48-72h' },
  { dept: 'Magdalena', capital: 'Santa Marta', zona: 'N2', km: 1070, tiempo: '48-72h' },
  { dept: 'Cesar', capital: 'Valledupar', zona: 'N2', km: 850, tiempo: '48-72h' },
  { dept: 'Córdoba', capital: 'Montería', zona: 'N2', km: 890, tiempo: '48-72h' },
  { dept: 'Sucre', capital: 'Sincelejo', zona: 'N2', km: 930, tiempo: '48-72h' },
  { dept: 'La Guajira', capital: 'Riohacha', zona: 'N2', km: 1150, tiempo: '48-72h' },
  { dept: 'Caquetá', capital: 'Florencia', zona: 'N2', km: 590, tiempo: '48-72h' },
  { dept: 'Vichada', capital: 'Puerto Carreño', zona: 'D', km: 840, tiempo: '72-96h' },
  { dept: 'Guaviare', capital: 'San José G.', zona: 'D', km: 580, tiempo: '72-96h' },
  { dept: 'Chocó', capital: 'Quibdó', zona: 'D', km: 650, tiempo: '72-96h' },
  { dept: 'Amazonas', capital: 'Leticia', zona: 'D', km: 1600, tiempo: '96h+' },
  { dept: 'Vaupés', capital: 'Mitú', zona: 'D', km: 1300, tiempo: '96h+' },
  { dept: 'Guainía', capital: 'Inírida', zona: 'D', km: 1100, tiempo: '96h+' },
  { dept: 'San Andrés', capital: 'San Andrés (aéreo)', zona: 'D', km: 1800, tiempo: '96h+' },
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
export const DEFAULT_PANELS = [
  { id: 'p1', brand: 'JA Solar',       model: 'JAM72S20-545MR',  wp: 545, price: 290000, kg: 24.9 },
  { id: 'p2', brand: 'Risen Energy',   model: 'RSM144-7-550M',   wp: 550, price: 285000, kg: 25.5 },
  { id: 'p3', brand: 'Canadian Solar', model: 'CS6W-550MS',      wp: 550, price: 280000, kg: 25.0 },
  { id: 'p4', brand: 'Trina Solar',    model: 'TSM-550DE09',     wp: 550, price: 295000, kg: 25.5 },
];

export const DEFAULT_INVERTERS = [
  { id: 'i1', brand: 'Growatt', model: 'MIN 3000TL-XH',      kw: 3,  phase: 1, price: 1850000, type: 'on-grid',  kg: 14 },
  { id: 'i2', brand: 'Growatt', model: 'MIN 5000TL-XH',      kw: 5,  phase: 1, price: 2450000, type: 'on-grid',  kg: 19 },
  { id: 'i3', brand: 'Growatt', model: 'MID 10KTL3-X2',      kw: 10, phase: 3, price: 4200000, type: 'on-grid',  kg: 32 },
  { id: 'i4', brand: 'Solis',   model: 'S6-GR1P5K-M',        kw: 5,  phase: 1, price: 2550000, type: 'on-grid',  kg: 20 },
  { id: 'i5', brand: 'Growatt', model: 'SPH 5000TL BL-UP',   kw: 5,  phase: 1, price: 4800000, type: 'hybrid',   kg: 22 },
  { id: 'i6', brand: 'Growatt', model: 'SPH 10000TL3 BH-UP', kw: 10, phase: 3, price: 7200000, type: 'hybrid',   kg: 36 },
  { id: 'i7', brand: 'Growatt', model: 'OFF3000TL-HVM',       kw: 3,  phase: 1, price: 3200000, type: 'off-grid', kg: 17 },
  { id: 'i8', brand: 'Victron', model: 'MultiPlus-II 5000VA', kw: 4,  phase: 1, price: 5500000, type: 'off-grid', kg: 28 },
];

export const DEFAULT_BATTERIES = [
  { id: 'b1', brand: 'Pylontech', model: 'US3000C',         kwh: 3.5, price: 3200000, kg: 37 },
  { id: 'b2', brand: 'BYD',       model: 'Battery-Box HVS 7.7', kwh: 7.7, price: 7500000, kg: 80 },
  { id: 'b3', brand: 'Hubble',    model: 'AM-10',           kwh: 10,  price: 9800000, kg: 95 },
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

export function calcSystem(monthlyKwh, panel, invKw, bUnit, bQty, psh) {
  const PR = 0.78;
  const daily = monthlyKwh / 30;
  const kwpN = daily / (psh * PR);
  const numPanels = Math.ceil(kwpN * 1000 / panel.wp);
  const actKwp = parseFloat(((numPanels * panel.wp) / 1000).toFixed(2));
  const dp = actKwp * psh * PR;
  const mp = Math.round(dp * 30);
  const ap = Math.round(dp * 365);
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
  return { numPanels, actKwp, dp: dp.toFixed(1), mp, ap, cov, dca, co2, ns, ppss, roof, tB, aut, kgTotal };
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

export function autoInverter(kwp, sysType, inverters) {
  const typed = inverters.filter(i => i.type === sysType);
  const fit = typed.filter(i => i.kw >= kwp * 0.75).sort((a, b) => a.kw - b.kw);
  return fit[0] || typed[0] || inverters[0];
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

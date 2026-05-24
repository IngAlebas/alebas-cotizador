// ==================== BRAND COLORS ====================
export const C = {
  // SolarHub brand palette
  teal:   '#01708B', tD: '#015a70', tL: '#01708B22',  // ALEBAS teal (mantiene identidad)
  yellow: '#FF8C00', yD: '#cc7000', yL: '#FF8C0022',  // Solar Orange (reemplaza amarillo)
  orange: '#FF8C00',                                   // alias
  amber:  '#FFB800',                                   // tono cálido secundario
  gold:   '#FFD93D',                                   // acento dorado
  gray:   '#686B71',
  dark:   '#07090F', card: '#0C1422', card2: '#111f35',
  border: '#01708B2a', borderLight: '#01708B15',
  oBorder: '#FF8C0030',                               // border naranja
  text:   '#e8f4f7', muted: '#7a9eaa',
  green:  '#4ade80', red: '#f87171',
  // FluxAI brand (plataforma de monitoreo integrada)
  fluxGreen: '#10B981', fluxBlue: '#3B82F6',
};

// ==================== OPERATORS DE RED (OR) ====================
// Mapeo OR ↔ departamento basado en registros CREG/Superservicios y XM (Sinergox).
// Códigos SIC para correlacionar con el API de XM (POST /lists, MetricId: ListadoAgentes).
// Las tarifas son referencia (CU promedio residencial estrato 4 sin subsidio); se actualizan
// vía PDFs mensuales del operador o el sync con XM en src/services/xm.js (precio bolsa).
//
// CU per CREG 091/2007 art. 6:  CU = G + T + D + Cv + PR + R
//   G  (Generación)      — bolsa + contratos, nacional, varía mensual (XM).
//   T  (Transmisión STN) — cargo nacional CREG (≈ publicación mensual).
//   D  (Distribución)    — por OR y nivel de tensión N1-N4; residencial = N1.
//   Cv (Comercialización)— margen variable del comercializador.
//   PR (Pérdidas reconocidas) — por OR y nivel.
//   R  (Restricciones)   — nacional, publicación mensual XM.
// Las fracciones por defecto reflejan la composición típica 2024-2025 para
// usuario residencial estrato 4 N1. Cuando el OR proporciona `components`
// explícitos, se usan esos (esperado al integrar PDFs mensuales por OR).
export const CU_FRACTIONS_N1_DEFAULT = {
  G:  0.52,  // Generación (nacional — mismo valor para todo el país)
  T:  0.08,  // Transmisión
  D:  0.22,  // Distribución N1 residencial
  Cv: 0.05,  // Comercialización variable
  PR: 0.08,  // Pérdidas reconocidas
  R:  0.05,  // Restricciones
};

// Deriva los componentes CREG 091 de un operador. Si el OR tiene
// `components: {G,T,D,Cv,PR,R}` explícitos, se usan; si no, se infieren
// por fracción sobre la tarifa plana. Retorna también `total` (CU).
export function splitCU(op, voltageLevel = 'N1') {
  if (op?.components && typeof op.components === 'object') {
    const c = op.components;
    const total = (c.G || 0) + (c.T || 0) + (c.D || 0) + (c.Cv || 0) + (c.PR || 0) + (c.R || 0);
    return { ...c, total, derived: false, voltageLevel };
  }
  const t = op?.tariff || 0;
  const f = CU_FRACTIONS_N1_DEFAULT; // TODO: tablas N2/N3/N4 cuando tengamos data
  return {
    G:  Math.round(t * f.G),
    T:  Math.round(t * f.T),
    D:  Math.round(t * f.D),
    Cv: Math.round(t * f.Cv),
    PR: Math.round(t * f.PR),
    R:  Math.round(t * f.R),
    total: t,
    derived: true,
    voltageLevel,
  };
}

// CU plena del operador (COP/kWh). Autoconsumo se valora a este precio.
export function tariffCU(op, voltageLevel = 'N1') {
  return splitCU(op, voltageLevel).total;
}

// Precio de remuneración del excedente exportado a la red bajo CREG 174/2021
// art. 23 (AGPE Tipo 1, ≤ 100 kW). Corresponde a CU − G del comercializador:
// componentes T + D + Cv + PR + R de Res. CREG 119/2007. Excluye generación.
//
// IMPORTANTE — NO escalar por estrato. El subsidio/contribución (factor ESTRATO)
// solo aplica sobre la energía IMPORTADA neta del periodo (consumo facturado),
// nunca sobre el crédito del kWh exportado:
//   - E1/E2/E3 con factor < 1: subsidiar al usuario por VENDER energía no está
//     contemplado en Ley 142/1994 art. 99.6 (subsidio cubre consumo ≤ CBS).
//   - E5/E6 con factor 1.20: cobrar contribución sobre un crédito que el
//     comercializador paga al usuario es regulatoriamente incoherente.
// Refs: CREG 174/2021 art. 23 + Concepto CREG 6730/2020 + Ley 142/1994 art. 99.6.
export function excedentePriceFor(op, voltageLevel = 'N1') {
  const c = splitCU(op, voltageLevel);
  return c.T + c.D + c.Cv + c.PR + c.R;
}
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

// ==================== TARIFA POR ESTRATO (CREG 2024) ====================
// Factores sobre la tarifa CU base del operador.
// Estratos 1-3: subsidio (pagan menos); Estratos 5-6: contribución (pagan más).
// Fuente: CREG 2024 — actualizar con resolución mensual del operador.
export const ESTRATO_FACTORS = {
  'E1':   0.50,  // Estrato 1 — subsidio 50%
  'E2':   0.60,  // Estrato 2 — subsidio 40%
  'E3':   0.85,  // Estrato 3 — subsidio 15%
  'E4':   1.00,  // Estrato 4 — tarifa plena
  'E5':   1.20,  // Estrato 5 — contribución 20%
  'E6':   1.20,  // Estrato 6 — contribución 20%
  'COM':  1.00,  // Comercial NT1 — tarifa plena sin subsidio
  'IND2': 0.90,  // Industrial NT2 — estructura diferente, aprox
  'IND3': 0.85,  // Industrial NT3 — mayor tensión, menor distribución
};

export const ESTRATO_LABELS = {
  'E1':   'Estrato 1 — Subsidio 50%',
  'E2':   'Estrato 2 — Subsidio 40%',
  'E3':   'Estrato 3 — Subsidio 15%',
  'E4':   'Estrato 4 — Tarifa plena',
  'E5':   'Estrato 5 — Contribución 20%',
  'E6':   'Estrato 6 — Contribución 20%',
  'COM':  'Comercial / NT1',
  'IND2': 'Industrial NT2',
  'IND3': 'Industrial NT3 (alta tensión)',
};

// Retorna la tarifa CU efectiva del usuario (COP/kWh) según su estrato.
export function getEffectiveTariff(operator, estrato = 'E4') {
  const base = tariffCU(operator);
  const factor = ESTRATO_FACTORS[estrato] ?? 1.0;
  return Math.round(base * factor);
}

// ==================== PR REGIONAL (Performance Ratio por zona climática) ====================
// Reemplaza el 0.78 constante nacional. Fuente: análisis PVGIS + datos IDEAM Colombia.
// Zona Andina alta (>2000 msnm): temperaturas bajas → menores pérdidas térmicas → PR alto.
// Zona Caribe/Pacífico/Orinoquía: temperaturas altas → más pérdidas térmicas → PR bajo.
export const DEPT_PR = {
  'Amazonas':            0.73,
  'Antioquia':           0.81,
  'Arauca':              0.76,
  'Atlántico':           0.75,
  'Bogotá D.C.':         0.83,
  'Bolívar':             0.75,
  'Boyacá':              0.83,
  'Caldas':              0.81,
  'Caquetá':             0.74,
  'Casanare':            0.76,
  'Cauca':               0.80,
  'Cesar':               0.76,
  'Chocó':               0.73,
  'Córdoba':             0.75,
  'Cundinamarca':        0.82,
  'Guainía':             0.73,
  'Guaviare':            0.74,
  'Huila':               0.79,
  'La Guajira':          0.74,
  'Magdalena':           0.75,
  'Meta':                0.76,
  'Nariño':              0.80,
  'Norte de Santander':  0.78,
  'Putumayo':            0.74,
  'Quindío':             0.81,
  'Risaralda':           0.81,
  'San Andrés y Providencia': 0.76,
  'Santander':           0.80,
  'Sucre':               0.75,
  'Tolima':              0.79,
  'Valle del Cauca':     0.81,
  'Vaupés':              0.73,
  'Vichada':             0.75,
};

export function getPR(dept) {
  return DEPT_PR[dept] ?? 0.78;
}

// ==================== SOILING FACTOR BY REGION ====================
// Soiling loss factor by region (% annual yield loss from dust/dirt).
// Caribe dry: 3-5%, Andes: 1-2%, Llanos/Amazonia: 1%, Pacifico: 0.5%.
// Fuente: análisis literatura PVGIS + IDEAM Colombia + IEC TR 61724-3.
export const DEPT_SOILING = {
  // Costa Caribe (dry, high dust)
  'La Guajira':          5.0,
  'Cesar':               4.5,
  'Magdalena':           4.0,
  'Atlántico':           4.0,
  'Bolívar':             3.5,
  'Sucre':               3.5,
  'Córdoba':             3.5,
  // Andina interior (moderate)
  'Cundinamarca':        2.0,
  'Bogotá D.C.':         2.0,
  'Boyacá':              1.5,
  'Santander':           2.0,
  'Norte de Santander':  2.5,
  'Antioquia':           1.5,
  'Caldas':              1.5,
  'Risaralda':           1.5,
  'Quindío':             1.5,
  'Tolima':              2.5,
  'Huila':               2.5,
  'Valle del Cauca':     2.0,
  'Cauca':               1.5,
  'Nariño':              1.5,
  // Llanos / Amazonia (heavy rain, low soiling)
  'Meta':                1.0,
  'Casanare':            1.5,
  'Arauca':              1.5,
  'Vichada':             1.5,
  'Caquetá':             1.0,
  'Putumayo':            1.0,
  'Amazonas':            1.0,
  'Guainía':             1.0,
  'Vaupés':              1.0,
  'Guaviare':            1.0,
  // Pacifico (very humid, low soiling)
  'Chocó':               0.5,
};

/** Returns soiling fraction (0–1) for a department. Default 2% (Andina interior). */
export function getSoiling(dept) {
  return (DEPT_SOILING[dept] ?? 2.0) / 100;
}

// ==================== TRANSPORT (Interrapidísimo 2025-2026) ====================
// Zonas desde Bogotá D.C. como origen
// Cap regulatorio: AGPE Mayor (CREG 174/2021) hasta 1 MW; usamos 500 kW como
// límite operativo del cotizador para evitar dimensionamientos fuera de alcance.
export const MAX_KWP_AGPE = 500;

// CREG 174/2021: Menor ≤100 kW (excedentes valorados a tarifa CU del comercializador,
// netting 1:1 mensual); Mayor 100 kW–1 MW (excedentes valorados al precio bolsa XM).
export const AGPE_LIMIT_KW_MENOR = 100;

// Destinos courier: capital + ciudades intermedias relevantes por depto.
// `id` único (slug), `zona` aplica a tarifa courier (origen Bogotá D.C.).
export const DESTINOS_COURIER = [
  // Bogotá / Cundinamarca
  { id: 'bogota',        dept: 'Bogotá D.C.',        city: 'Bogotá',           zona: 'L',  km: 0,    tiempo: '24h',    lat: 4.7110, lon: -74.0721 },
  { id: 'soacha',        dept: 'Cundinamarca',       city: 'Soacha',           zona: 'L',  km: 18,   tiempo: '24h',    lat: 4.5792, lon: -74.2170 },
  { id: 'facatativa',    dept: 'Cundinamarca',       city: 'Facatativá',       zona: 'R',  km: 40,   tiempo: '24h',    lat: 4.8136, lon: -74.3537 },
  { id: 'zipaquira',     dept: 'Cundinamarca',       city: 'Zipaquirá',        zona: 'R',  km: 50,   tiempo: '24h',    lat: 5.0222, lon: -74.0045 },
  { id: 'fusagasuga',    dept: 'Cundinamarca',       city: 'Fusagasugá',       zona: 'R',  km: 65,   tiempo: '24-48h', lat: 4.3333, lon: -74.3667 },
  { id: 'girardot',      dept: 'Cundinamarca',       city: 'Girardot',         zona: 'R',  km: 134,  tiempo: '24-48h', lat: 4.3001, lon: -74.8000 },
  { id: 'chia',          dept: 'Cundinamarca',       city: 'Chía',             zona: 'R',  km: 23,   tiempo: '24h',    lat: 4.8625, lon: -74.0525 },
  { id:'mosquera',      dept:'Cundinamarca', city:'Mosquera',      zona:'L', km:22,  tiempo:'24h',    lat:4.7062, lon:-74.2283 },
  { id:'madrid-cund',   dept:'Cundinamarca', city:'Madrid',         zona:'L', km:30,  tiempo:'24h',    lat:4.7320, lon:-74.2671 },
  { id:'cajica',        dept:'Cundinamarca', city:'Cajicá',         zona:'L', km:28,  tiempo:'24h',    lat:4.9175, lon:-74.0228 },
  { id:'la-mesa',       dept:'Cundinamarca', city:'La Mesa',        zona:'R', km:55,  tiempo:'24h',    lat:4.6333, lon:-74.4666 },
  { id:'villeta',       dept:'Cundinamarca', city:'Villeta',        zona:'R', km:95,  tiempo:'24-48h', lat:5.0156, lon:-74.4724 },
  { id:'ubate',         dept:'Cundinamarca', city:'Ubaté',          zona:'R', km:88,  tiempo:'24-48h', lat:5.3153, lon:-73.8153 },
  { id:'choconta',      dept:'Cundinamarca', city:'Chocontá',       zona:'R', km:75,  tiempo:'24-48h', lat:5.1439, lon:-73.6869 },
  { id:'pacho',         dept:'Cundinamarca', city:'Pacho',          zona:'R', km:105, tiempo:'24-48h', lat:5.1339, lon:-74.1578 },

  // Boyacá
  { id: 'tunja',         dept: 'Boyacá',             city: 'Tunja',            zona: 'R',  km: 150,  tiempo: '24-48h', lat: 5.5446, lon: -73.3573 },
  { id: 'duitama',       dept: 'Boyacá',             city: 'Duitama',          zona: 'R',  km: 205,  tiempo: '24-48h', lat: 5.8245, lon: -73.0328 },
  { id: 'sogamoso',      dept: 'Boyacá',             city: 'Sogamoso',         zona: 'R',  km: 225,  tiempo: '24-48h', lat: 5.7141, lon: -72.9318 },
  { id: 'chiquinquira',  dept: 'Boyacá',             city: 'Chiquinquirá',     zona: 'R',  km: 130,  tiempo: '24-48h', lat: 5.6136, lon: -73.8178 },
  { id:'puerto-boyaca',  dept:'Boyacá', city:'Puerto Boyacá',  zona:'R', km:225, tiempo:'24-48h', lat:5.9697, lon:-74.5881 },
  { id:'moniquira',      dept:'Boyacá', city:'Moniquirá',       zona:'R', km:175, tiempo:'24-48h', lat:5.8831, lon:-73.5742 },
  { id:'guateque',       dept:'Boyacá', city:'Guateque',        zona:'R', km:120, tiempo:'24-48h', lat:5.0125, lon:-73.4683 },
  { id:'garagoa',        dept:'Boyacá', city:'Garagoa',         zona:'R', km:142, tiempo:'24-48h', lat:5.0794, lon:-73.3628 },
  { id:'velez-boy',      dept:'Boyacá', city:'Vélez (Santander/Boyacá límite)', zona:'R', km:235, tiempo:'24-48h', lat:6.0089, lon:-73.6769 },

  // Tolima
  { id: 'ibague',        dept: 'Tolima',             city: 'Ibagué',           zona: 'R',  km: 210,  tiempo: '24-48h', lat: 4.4389, lon: -75.2322 },
  { id: 'espinal',       dept: 'Tolima',             city: 'Espinal',          zona: 'R',  km: 165,  tiempo: '24-48h', lat: 4.1497, lon: -74.8842 },
  { id: 'honda',         dept: 'Tolima',             city: 'Honda',            zona: 'R',  km: 155,  tiempo: '24-48h', lat: 5.2081, lon: -74.7417 },
  { id: 'melgar',        dept: 'Tolima',             city: 'Melgar',           zona: 'R',  km: 100,  tiempo: '24-48h', lat: 4.2050, lon: -74.6420 },
  { id:'mariquita',      dept:'Tolima', city:'Mariquita',       zona:'R', km:168, tiempo:'24-48h', lat:5.2003, lon:-74.8894 },
  { id:'lerida',         dept:'Tolima', city:'Lérida',          zona:'R', km:188, tiempo:'24-48h', lat:4.8628, lon:-74.9169 },
  { id:'chaparral',      dept:'Tolima', city:'Chaparral',       zona:'R', km:278, tiempo:'24-48h', lat:3.7264, lon:-75.4878 },
  { id:'purificacion',   dept:'Tolima', city:'Purificación',    zona:'R', km:175, tiempo:'24-48h', lat:3.8575, lon:-74.9317 },
  { id:'fresno',         dept:'Tolima', city:'Fresno',          zona:'R', km:190, tiempo:'24-48h', lat:5.1567, lon:-75.0389 },

  // Meta
  { id: 'villavicencio', dept: 'Meta',               city: 'Villavicencio',    zona: 'R',  km: 90,   tiempo: '24-48h', lat: 4.1420, lon: -73.6266 },
  { id: 'acacias',       dept: 'Meta',               city: 'Acacías',          zona: 'R',  km: 120,  tiempo: '24-48h', lat: 3.9893, lon: -73.7578 },
  { id: 'granada-meta',  dept: 'Meta',               city: 'Granada',          zona: 'R',  km: 170,  tiempo: '24-48h', lat: 3.5467, lon: -73.7050 },
  { id: 'puerto-lopez',  dept: 'Meta',               city: 'Puerto López',     zona: 'R',  km: 175,  tiempo: '24-48h', lat: 4.0886, lon: -72.9583 },
  { id:'cumaral',       dept:'Meta', city:'Cumaral',        zona:'R', km:110, tiempo:'24-48h', lat:4.2717, lon:-73.4872 },
  { id:'restrepo-meta', dept:'Meta', city:'Restrepo',       zona:'R', km:105, tiempo:'24-48h', lat:4.2500, lon:-73.5667 },
  { id:'san-martin',    dept:'Meta', city:'San Martín',     zona:'R', km:185, tiempo:'24-48h', lat:3.6956, lon:-73.6975 },

  // Huila
  { id: 'neiva',         dept: 'Huila',              city: 'Neiva',            zona: 'R',  km: 310,  tiempo: '24-48h', lat: 2.9273, lon: -75.2819 },
  { id: 'pitalito',      dept: 'Huila',              city: 'Pitalito',         zona: 'R',  km: 500,  tiempo: '48-72h', lat: 1.8589, lon: -76.0508 },
  { id: 'garzon',        dept: 'Huila',              city: 'Garzón',           zona: 'R',  km: 420,  tiempo: '48h',    lat: 2.1959, lon: -75.6278 },
  { id:'la-plata',      dept:'Huila', city:'La Plata',      zona:'R', km:395, tiempo:'48h',    lat:2.3831, lon:-75.8928 },
  { id:'campoalegre',   dept:'Huila', city:'Campoalegre',   zona:'R', km:320, tiempo:'48h',    lat:2.6894, lon:-75.3333 },
  { id:'rivera',        dept:'Huila', city:'Rivera',         zona:'R', km:315, tiempo:'48h',    lat:2.7731, lon:-75.2378 },
  { id:'palermo',       dept:'Huila', city:'Palermo',        zona:'R', km:288, tiempo:'24-48h', lat:2.8933, lon:-75.4256 },

  // Caldas
  { id: 'manizales',     dept: 'Caldas',             city: 'Manizales',        zona: 'R',  km: 310,  tiempo: '24-48h', lat: 5.0689, lon: -75.5174 },
  { id: 'la-dorada',     dept: 'Caldas',             city: 'La Dorada',        zona: 'R',  km: 205,  tiempo: '24-48h', lat: 5.4506, lon: -74.6575 },
  { id: 'chinchina',     dept: 'Caldas',             city: 'Chinchiná',        zona: 'R',  km: 320,  tiempo: '24-48h', lat: 4.9833, lon: -75.6167 },
  { id:'aguadas',       dept:'Caldas', city:'Aguadas',       zona:'N1', km:370, tiempo:'48h',    lat:5.6150, lon:-75.4578 },
  { id:'riosucio-cald', dept:'Caldas', city:'Riosucio',      zona:'N1', km:405, tiempo:'48h',    lat:5.4136, lon:-75.7111 },
  { id:'anserma',       dept:'Caldas', city:'Anserma',       zona:'N1', km:388, tiempo:'48h',    lat:5.2300, lon:-75.7833 },

  // Risaralda
  { id: 'pereira',       dept: 'Risaralda',          city: 'Pereira',          zona: 'R',  km: 330,  tiempo: '24-48h', lat: 4.8133, lon: -75.6961 },
  { id: 'dosquebradas',  dept: 'Risaralda',          city: 'Dosquebradas',     zona: 'R',  km: 335,  tiempo: '24-48h', lat: 4.8306, lon: -75.6764 },
  { id:'santa-rosa-ris',dept:'Risaralda', city:'Santa Rosa de Cabal', zona:'R', km:345, tiempo:'48h', lat:4.8700, lon:-75.6211 },
  { id:'la-virginia',   dept:'Risaralda', city:'La Virginia',   zona:'N1', km:320, tiempo:'48h',    lat:4.9011, lon:-75.8811 },

  // Quindío
  { id: 'armenia',       dept: 'Quindío',            city: 'Armenia',          zona: 'R',  km: 300,  tiempo: '24-48h', lat: 4.5339, lon: -75.6811 },
  { id: 'calarca',       dept: 'Quindío',            city: 'Calarcá',          zona: 'R',  km: 295,  tiempo: '24-48h', lat: 4.5236, lon: -75.6439 },
  { id:'montenegro',    dept:'Quindío', city:'Montenegro',    zona:'N1', km:305, tiempo:'48h',    lat:4.5653, lon:-75.7533 },
  { id:'la-tebaida',    dept:'Quindío', city:'La Tebaida',    zona:'N1', km:298, tiempo:'48h',    lat:4.4497, lon:-75.7928 },

  // Santander
  { id: 'bucaramanga',   dept: 'Santander',          city: 'Bucaramanga',      zona: 'N1', km: 400,  tiempo: '48h',    lat: 7.1193, lon: -73.1227 },
  { id: 'floridablanca', dept: 'Santander',          city: 'Floridablanca',    zona: 'N1', km: 405,  tiempo: '48h',    lat: 7.0697, lon: -73.0897 },
  { id: 'giron',         dept: 'Santander',          city: 'Girón',            zona: 'N1', km: 398,  tiempo: '48h',    lat: 7.0722, lon: -73.1686 },
  { id: 'barrancabermeja', dept: 'Santander',        city: 'Barrancabermeja',  zona: 'N1', km: 320,  tiempo: '48h',    lat: 7.0653, lon: -73.8547 },
  { id: 'san-gil',       dept: 'Santander',          city: 'San Gil',          zona: 'N1', km: 310,  tiempo: '48h',    lat: 6.5550, lon: -73.1336 },
  { id:'piedecuesta',   dept:'Santander', city:'Piedecuesta',  zona:'N1', km:406, tiempo:'48h',    lat:7.0097, lon:-73.0536 },
  { id:'socorro',       dept:'Santander', city:'Socorro',       zona:'N1', km:315, tiempo:'48h',    lat:6.5139, lon:-73.2711 },
  { id:'velez-sant',    dept:'Santander', city:'Vélez',         zona:'N1', km:290, tiempo:'48h',    lat:6.0089, lon:-73.6769 },
  { id:'lebrija',       dept:'Santander', city:'Lebrija',       zona:'N1', km:395, tiempo:'48h',    lat:7.1250, lon:-73.2211 },

  // Antioquia
  { id: 'medellin',      dept: 'Antioquia',          city: 'Medellín',         zona: 'N1', km: 415,  tiempo: '48h',    lat: 6.2442, lon: -75.5812 },
  { id: 'bello',         dept: 'Antioquia',          city: 'Bello',            zona: 'N1', km: 420,  tiempo: '48h',    lat: 6.3373, lon: -75.5567 },
  { id: 'envigado',      dept: 'Antioquia',          city: 'Envigado',         zona: 'N1', km: 420,  tiempo: '48h',    lat: 6.1702, lon: -75.5836 },
  { id: 'itagui',        dept: 'Antioquia',          city: 'Itagüí',           zona: 'N1', km: 418,  tiempo: '48h',    lat: 6.1817, lon: -75.5994 },
  { id: 'rionegro',      dept: 'Antioquia',          city: 'Rionegro',         zona: 'N1', km: 390,  tiempo: '48h',    lat: 6.1556, lon: -75.3744 },
  { id: 'apartado',      dept: 'Antioquia',          city: 'Apartadó',         zona: 'N1', km: 680,  tiempo: '72h',    lat: 7.8833, lon: -76.6333 },
  { id:'yarumal',       dept:'Antioquia', city:'Yarumal',      zona:'N1', km:475, tiempo:'48h',    lat:6.9750, lon:-75.4128 },
  { id:'santa-fe-ant',  dept:'Antioquia', city:'Santa Fe de Antioquia', zona:'N1', km:490, tiempo:'48h', lat:6.5561, lon:-75.8267 },
  { id:'la-ceja',       dept:'Antioquia', city:'La Ceja',       zona:'N1', km:400, tiempo:'48h',    lat:6.0297, lon:-75.4317 },
  { id:'sabaneta',      dept:'Antioquia', city:'Sabaneta',      zona:'N1', km:422, tiempo:'48h',    lat:6.1511, lon:-75.6161 },
  { id:'copacabana',    dept:'Antioquia', city:'Copacabana',    zona:'N1', km:415, tiempo:'48h',    lat:6.3497, lon:-75.5094 },
  { id:'marinilla',     dept:'Antioquia', city:'Marinilla',     zona:'N1', km:395, tiempo:'48h',    lat:6.1769, lon:-75.3400 },
  { id:'caucasia',      dept:'Antioquia', city:'Caucasia',      zona:'N1', km:570, tiempo:'48-72h', lat:7.9839, lon:-75.1939 },
  { id:'barbosa-ant',   dept:'Antioquia', city:'Barbosa',       zona:'N1', km:438, tiempo:'48h',    lat:6.4356, lon:-75.3319 },

  // Valle del Cauca
  { id: 'cali',          dept: 'Valle del Cauca',    city: 'Cali',             zona: 'N1', km: 460,  tiempo: '48h',    lat: 3.4516, lon: -76.5320 },
  { id: 'palmira',       dept: 'Valle del Cauca',    city: 'Palmira',          zona: 'N1', km: 475,  tiempo: '48h',    lat: 3.5395, lon: -76.3033 },
  { id: 'buga',          dept: 'Valle del Cauca',    city: 'Buga',             zona: 'N1', km: 390,  tiempo: '48h',    lat: 3.9014, lon: -76.2978 },
  { id: 'tulua',         dept: 'Valle del Cauca',    city: 'Tuluá',            zona: 'N1', km: 380,  tiempo: '48h',    lat: 4.0847, lon: -76.1953 },
  { id: 'buenaventura',  dept: 'Valle del Cauca',    city: 'Buenaventura',     zona: 'N1', km: 580,  tiempo: '48-72h', lat: 3.8831, lon: -77.0311 },
  { id:'jamundi',       dept:'Valle del Cauca', city:'Jamundí',   zona:'N1', km:465, tiempo:'48h',    lat:3.2628, lon:-76.5369 },
  { id:'cartago-valle', dept:'Valle del Cauca', city:'Cartago',   zona:'N1', km:365, tiempo:'48h',    lat:4.7489, lon:-75.9161 },
  { id:'yumbo',         dept:'Valle del Cauca', city:'Yumbo',     zona:'N1', km:460, tiempo:'48h',    lat:3.5803, lon:-76.4972 },
  { id:'roldanillo',    dept:'Valle del Cauca', city:'Roldanillo', zona:'N1', km:358, tiempo:'48h',   lat:4.4200, lon:-76.1575 },
  { id:'candelaria',    dept:'Valle del Cauca', city:'Candelaria', zona:'N1', km:470, tiempo:'48h',   lat:3.4111, lon:-76.3478 },

  // Norte de Santander
  { id: 'cucuta',        dept: 'Norte de Santander', city: 'Cúcuta',           zona: 'N1', km: 590,  tiempo: '48-72h', lat: 7.8939, lon: -72.5078 },
  { id: 'ocana',         dept: 'Norte de Santander', city: 'Ocaña',            zona: 'N1', km: 560,  tiempo: '48-72h', lat: 8.2378, lon: -73.3561 },
  { id: 'pamplona',      dept: 'Norte de Santander', city: 'Pamplona',         zona: 'N1', km: 520,  tiempo: '48-72h', lat: 7.3764, lon: -72.6514 },
  { id:'villa-rosario', dept:'Norte de Santander', city:'Villa del Rosario', zona:'N1', km:593, tiempo:'48-72h', lat:7.8347, lon:-72.4703 },
  { id:'tibu',          dept:'Norte de Santander', city:'Tibú',              zona:'N1', km:640, tiempo:'48-72h', lat:8.6525, lon:-72.7278 },

  // Cauca
  { id: 'popayan',       dept: 'Cauca',              city: 'Popayán',          zona: 'N1', km: 580,  tiempo: '48-72h', lat: 2.4448, lon: -76.6147 },
  { id: 'santander-quilichao', dept: 'Cauca',        city: 'Santander de Quilichao', zona: 'N1', km: 500, tiempo: '48h', lat: 3.0100, lon: -76.4850 },
  { id:'puerto-tejada', dept:'Cauca', city:'Puerto Tejada', zona:'N1', km:500, tiempo:'48h',    lat:3.2303, lon:-76.4153 },
  { id:'caloto',        dept:'Cauca', city:'Caloto',         zona:'N1', km:480, tiempo:'48h',    lat:3.0506, lon:-76.3803 },
  { id:'miranda-cauca', dept:'Cauca', city:'Miranda',        zona:'N1', km:475, tiempo:'48h',    lat:3.2453, lon:-76.2333 },

  // Casanare
  { id: 'yopal',         dept: 'Casanare',           city: 'Yopal',            zona: 'N1', km: 380,  tiempo: '48h',    lat: 5.3378, lon: -72.3959 },
  { id: 'aguazul',       dept: 'Casanare',           city: 'Aguazul',          zona: 'N1', km: 360,  tiempo: '48h',    lat: 5.1722, lon: -72.5475 },
  { id: 'villanueva-casanare', dept: 'Casanare',     city: 'Villanueva',       zona: 'N1', km: 280,  tiempo: '48h',    lat: 4.6119, lon: -72.9264 },

  // Arauca
  { id: 'arauca',        dept: 'Arauca',             city: 'Arauca',           zona: 'N1', km: 530,  tiempo: '48-72h', lat: 7.0903, lon: -70.7617 },
  { id: 'saravena',      dept: 'Arauca',             city: 'Saravena',         zona: 'N1', km: 600,  tiempo: '72h',    lat: 6.9586, lon: -71.8722 },

  // Nariño
  { id: 'pasto',         dept: 'Nariño',             city: 'Pasto',            zona: 'N2', km: 820,  tiempo: '48-72h', lat: 1.2136, lon: -77.2811 },
  { id: 'ipiales',       dept: 'Nariño',             city: 'Ipiales',          zona: 'N2', km: 900,  tiempo: '72h',    lat: 0.8272, lon: -77.6458 },
  { id: 'tumaco',        dept: 'Nariño',             city: 'Tumaco',           zona: 'N2', km: 1000, tiempo: '72-96h', lat: 1.7911, lon: -78.7947 },

  // Putumayo
  { id: 'mocoa',         dept: 'Putumayo',           city: 'Mocoa',            zona: 'N2', km: 700,  tiempo: '48-72h', lat: 1.1503, lon: -76.6483 },
  { id: 'puerto-asis',   dept: 'Putumayo',           city: 'Puerto Asís',      zona: 'N2', km: 820,  tiempo: '72h',    lat: 0.5058, lon: -76.4983 },

  // Atlántico
  { id: 'barranquilla',  dept: 'Atlántico',          city: 'Barranquilla',     zona: 'N2', km: 1000, tiempo: '48-72h', lat: 10.9685, lon: -74.7813 },
  { id: 'soledad',       dept: 'Atlántico',          city: 'Soledad',          zona: 'N2', km: 1003, tiempo: '48-72h', lat: 10.9167, lon: -74.7667 },
  { id: 'sabanalarga',   dept: 'Atlántico',          city: 'Sabanalarga',      zona: 'N2', km: 945,  tiempo: '48-72h', lat: 10.6311, lon: -74.9211 },

  // Bolívar
  { id: 'cartagena',     dept: 'Bolívar',            city: 'Cartagena',        zona: 'N2', km: 1050, tiempo: '48-72h', lat: 10.3910, lon: -75.4794 },
  { id: 'magangue',      dept: 'Bolívar',            city: 'Magangué',         zona: 'N2', km: 830,  tiempo: '72h',    lat: 9.2408, lon: -74.7531 },
  { id: 'turbaco',       dept: 'Bolívar',            city: 'Turbaco',          zona: 'N2', km: 1040, tiempo: '48-72h', lat: 10.3311, lon: -75.4089 },

  // Magdalena
  { id: 'santa-marta',   dept: 'Magdalena',          city: 'Santa Marta',      zona: 'N2', km: 1070, tiempo: '48-72h', lat: 11.2408, lon: -74.1990 },
  { id: 'cienaga',       dept: 'Magdalena',          city: 'Ciénaga',          zona: 'N2', km: 1040, tiempo: '48-72h', lat: 11.0006, lon: -74.2472 },
  { id: 'fundacion',     dept: 'Magdalena',          city: 'Fundación',        zona: 'N2', km: 960,  tiempo: '48-72h', lat: 10.5194, lon: -74.1856 },

  // Cesar
  { id: 'valledupar',    dept: 'Cesar',              city: 'Valledupar',       zona: 'N2', km: 850,  tiempo: '48-72h', lat: 10.4631, lon: -73.2532 },
  { id: 'aguachica',     dept: 'Cesar',              city: 'Aguachica',        zona: 'N2', km: 520,  tiempo: '48-72h', lat: 8.3092, lon: -73.6075 },

  // Córdoba
  { id: 'monteria',      dept: 'Córdoba',            city: 'Montería',         zona: 'N2', km: 890,  tiempo: '48-72h', lat: 8.7479, lon: -75.8814 },
  { id: 'sahagun',       dept: 'Córdoba',            city: 'Sahagún',          zona: 'N2', km: 820,  tiempo: '48-72h', lat: 8.9464, lon: -75.4433 },
  { id: 'lorica',        dept: 'Córdoba',            city: 'Lorica',           zona: 'N2', km: 930,  tiempo: '72h',    lat: 9.2397, lon: -75.8136 },

  // Sucre
  { id: 'sincelejo',     dept: 'Sucre',              city: 'Sincelejo',        zona: 'N2', km: 930,  tiempo: '48-72h', lat: 9.3047, lon: -75.3978 },
  { id: 'corozal',       dept: 'Sucre',              city: 'Corozal',          zona: 'N2', km: 945,  tiempo: '48-72h', lat: 9.3192, lon: -75.2933 },

  // La Guajira
  { id: 'riohacha',      dept: 'La Guajira',         city: 'Riohacha',         zona: 'N2', km: 1150, tiempo: '48-72h', lat: 11.5444, lon: -72.9072 },
  { id: 'maicao',        dept: 'La Guajira',         city: 'Maicao',           zona: 'N2', km: 1200, tiempo: '72h',    lat: 11.3775, lon: -72.2372 },

  // Caquetá
  { id: 'florencia',     dept: 'Caquetá',            city: 'Florencia',        zona: 'N2', km: 590,  tiempo: '48-72h', lat: 1.6144, lon: -75.6062 },
  { id: 'san-vicente-caguan', dept: 'Caquetá',       city: 'San Vicente del Caguán', zona: 'N2', km: 720, tiempo: '72h', lat: 2.1167, lon: -74.7703 },

  // Zonas difícil acceso
  { id: 'puerto-carreno', dept: 'Vichada',           city: 'Puerto Carreño',   zona: 'D', km: 840,  tiempo: '72-96h', lat: 6.1888, lon: -67.4856 },
  { id: 'san-jose-guaviare', dept: 'Guaviare',       city: 'San José del Guaviare', zona: 'D', km: 580, tiempo: '72-96h', lat: 2.5667, lon: -72.6450 },
  { id: 'quibdo',         dept: 'Chocó',             city: 'Quibdó',           zona: 'D', km: 650,  tiempo: '72-96h', lat: 5.6919, lon: -76.6583 },
  { id: 'leticia',        dept: 'Amazonas',          city: 'Leticia',          zona: 'D', km: 1600, tiempo: '96h+',   lat: -4.2150, lon: -69.9406 },
  { id: 'mitu',           dept: 'Vaupés',            city: 'Mitú',             zona: 'D', km: 1300, tiempo: '96h+',   lat: 1.2536, lon: -70.2336 },
  { id: 'inirida',        dept: 'Guainía',           city: 'Inírida',          zona: 'D', km: 1100, tiempo: '96h+',   lat: 3.8653, lon: -67.9239 },
  { id: 'san-andres',     dept: 'San Andrés',        city: 'San Andrés (aéreo)', zona: 'D', km: 1800, tiempo: '96h+', lat: 12.5847, lon: -81.7006 },
];

// ==================== CARRIERS (Transportadoras nacionales) ====================
// Tarifas referenciales 2025-2026 (COP). base = primer kg incluido; kgAd = kg adicional.
// Fuente: comparativos públicos + tarifarios de cotización online.
// El cotizador calcula todas y selecciona la más económica por destino/peso.
export const CARRIERS = {
  interrapidisimo: {
    label: 'Interrapidísimo',
    note: 'Líder nacional en tiempos cortos',
    zonas: {
      L:  { base: 7900,  kgAd: 3400 },
      R:  { base: 10100, kgAd: 4000 },
      N1: { base: 18500, kgAd: 4400 },
      N2: { base: 23600, kgAd: 5500 },
      D:  { base: 80000, kgAd: 12000 },
    },
  },
  servientrega: {
    label: 'Servientrega',
    note: 'Cobertura más amplia en municipios pequeños',
    zonas: {
      L:  { base: 8500,  kgAd: 3600 },
      R:  { base: 11200, kgAd: 4300 },
      N1: { base: 19800, kgAd: 4800 },
      N2: { base: 25800, kgAd: 6000 },
      D:  { base: 85000, kgAd: 13000 },
    },
  },
  envia: {
    label: 'Envía Colvanes',
    note: 'Competitivo en cargas medianas',
    zonas: {
      L:  { base: 8200,  kgAd: 3500 },
      R:  { base: 10800, kgAd: 4100 },
      N1: { base: 19200, kgAd: 4600 },
      N2: { base: 24800, kgAd: 5800 },
      D:  { base: 78000, kgAd: 11500 },
    },
  },
  coordinadora: {
    label: 'Coordinadora',
    note: 'Fuerte en paquetería pesada (>30 kg)',
    zonas: {
      L:  { base: 9500,  kgAd: 3200 },
      R:  { base: 12000, kgAd: 3800 },
      N1: { base: 20500, kgAd: 4200 },
      N2: { base: 26000, kgAd: 5200 },
      D:  { base: 90000, kgAd: 12500 },
    },
  },
  tcc: {
    label: 'TCC',
    note: 'Logística industrial, entrega puerta a puerta',
    zonas: {
      L:  { base: 8900,  kgAd: 3300 },
      R:  { base: 11500, kgAd: 3900 },
      N1: { base: 19500, kgAd: 4300 },
      N2: { base: 25000, kgAd: 5400 },
      D:  { base: 82000, kgAd: 12000 },
    },
  },
  saferbo: {
    label: 'Saferbo',
    note: 'Económico para carga seca >50 kg',
    zonas: {
      L:  { base: 9800,  kgAd: 3100 },
      R:  { base: 12500, kgAd: 3700 },
      N1: { base: 20000, kgAd: 4100 },
      N2: { base: 25500, kgAd: 5100 },
      D:  { base: 88000, kgAd: 11800 },
    },
  },
  deprisa: {
    label: 'Deprisa (Avianca)',
    note: 'Aéreo — único a San Andrés en 24-48h',
    zonas: {
      L:  { base: 10500, kgAd: 3800 },
      R:  { base: 13500, kgAd: 4500 },
      N1: { base: 22000, kgAd: 5000 },
      N2: { base: 28000, kgAd: 6300 },
      D:  { base: 95000, kgAd: 14000 },
    },
  },
};

// Alias backwards-compat (Quoter viejo usaba estas constantes directamente)
export const INTER_ZONAS = Object.fromEntries(
  Object.entries(CARRIERS.interrapidisimo.zonas).map(([k, v]) => [k, { ...v, label: { L: 'Local', R: 'Regional', N1: 'Nacional Z1', N2: 'Nacional Z2', D: 'Difícil acceso' }[k] }])
);
export const SERVI_ZONAS = Object.fromEntries(
  Object.entries(CARRIERS.servientrega.zonas).map(([k, v]) => [k, { ...v, label: INTER_ZONAS[k].label }])
);

export const SOBREFLETE = 0.02;

export const ZONA_LABEL = { L: 'Local', R: 'Regional', N1: 'Nacional Z1', N2: 'Nacional Z2', D: 'Difícil acceso' };

// Ajuste fino por distancia real dentro de la zona (±25% máximo).
// Evita saltos bruscos en el límite entre zonas.
export function getZoneKmFactor(km, zona) {
  switch (zona) {
    case 'L':  return 1.0;
    case 'R':  return 1.0 + Math.min(0.25, Math.max(0, (km - 51)  / 249) * 0.25);
    case 'N1': return 1.0 + Math.min(0.20, Math.max(0, (km - 301) / 299) * 0.20);
    case 'N2': return 1.0 + Math.min(0.18, Math.max(0, (km - 601) / 599) * 0.18);
    case 'D':  return 1.0;
    default:   return 1.0;
  }
}

// Peso volumétrico (dimensional weight) para envíos terrestres en Colombia.
// Fórmula carriers: Largo(cm) × Ancho(cm) × Alto(cm) / 5000
// Para aéreo (Deprisa): / 6000
// El carrier factura max(peso_real, peso_volumétrico).
export function calcDimensionalWeight(numPanels, panel, inv, bUnit, bQty) {
  // Panel boxes: 2 paneles por caja, doble protección
  const pLen = Math.round((panel?.lengthMm || 2280) / 10) + 4; // cm + 4cm embalaje
  const pWid = Math.round((panel?.widthMm  || 1135) / 10) + 4;
  const panelsPerBox = 2;
  const boxH = panelsPerBox * 4 + 6; // 4cm por panel + 6cm caja (tapa+base)
  const panelDimKgEach = (pLen * pWid * boxH) / 5000;
  const totalPanelDimKg = numPanels * panelDimKgEach;

  // Inversor: caja estimada por potencia (datasheets Growatt/Solis/SMA)
  const kw = inv?.kw || 5;
  let invL, invW, invH;
  if (kw <= 5)        { invL = 70;  invW = 50; invH = 45; }
  else if (kw <= 15)  { invL = 80;  invW = 60; invH = 50; }
  else if (kw <= 30)  { invL = 90;  invW = 70; invH = 60; }
  else if (kw <= 60)  { invL = 100; invW = 75; invH = 65; }
  else                { invL = 120; invW = 85; invH = 70; }
  const invDimKg = (invL * invW * invH) / 5000;

  // Baterías: LFP son densas — el peso real supera el volumétrico en casi todos los casos
  const batDimKg = 0;

  const totalDimKg = Math.round(totalPanelDimKg + invDimKg + batDimKg);
  const isAir = false; // terrestre por defecto
  return { panelDimKg: Math.round(totalPanelDimKg), invDimKg: Math.round(invDimKg), totalDimKg };
}

// Peso facturable = max(peso_real, peso_volumétrico).
export function getBillableWeight(actualKg, dimKg) {
  return Math.max(actualKg, dimKg);
}

// ==================== EQUIPMENT DEFAULTS ====================
// Schema extendido con specs eléctricos (Voc, Vmp, Isc, Imp, coef. temp.)
// y de inversores (vocMax, mppt range, idcMax, mpptCount). Estos campos
// se pueden enriquecer desde la base CEC / NREL SAM vía BackOffice.
// Los defaults son valores típicos de datasheet — importar desde CEC
// garantiza precisión oficial para validar layouts y construir unifilares.
// Stock semanal: { qty, supplier, updatedAt } — refleja el inventario
// disponible esta semana. El selector automático prioriza equipos con
// qty>0 sobre los agotados para minimizar plazos de entrega.
const STOCK_DATE = '2026-04-15';
export const DEFAULT_PANELS = [
  { id: 'p1', brand: 'JA Solar',       model: 'JAM72S20-545MR',  wp: 545, price: 290000, kg: 24.9,
    lengthMm: 2278, widthMm: 1134,
    voc: 49.75, vmp: 41.8, isc: 13.85, imp: 13.04, tempCoeffPmax: -0.35, tempCoeffVoc: -0.275, cellCount: 144,
    stock: { qty: 280, supplier: 'Solartex', updatedAt: STOCK_DATE } },
  { id: 'p2', brand: 'Risen Energy',   model: 'RSM144-7-550M',   wp: 550, price: 285000, kg: 25.5,
    lengthMm: 2279, widthMm: 1134,
    voc: 49.8, vmp: 41.95, isc: 13.95, imp: 13.11, tempCoeffPmax: -0.35, tempCoeffVoc: -0.28, cellCount: 144,
    stock: { qty: 120, supplier: 'Energreen', updatedAt: STOCK_DATE } },
  { id: 'p3', brand: 'Canadian Solar', model: 'CS6W-550MS',      wp: 550, price: 280000, kg: 25.0,
    lengthMm: 2266, widthMm: 1134,
    voc: 49.8, vmp: 41.7, isc: 13.95, imp: 13.19, tempCoeffPmax: -0.34, tempCoeffVoc: -0.26, cellCount: 144,
    stock: { qty: 60, supplier: 'Solartex', updatedAt: STOCK_DATE } },
  { id: 'p4', brand: 'Trina Solar',    model: 'TSM-550DE09',     wp: 550, price: 295000, kg: 25.5,
    lengthMm: 2279, widthMm: 1134,
    voc: 49.9, vmp: 41.9, isc: 13.93, imp: 13.13, tempCoeffPmax: -0.34, tempCoeffVoc: -0.25, cellCount: 144,
    stock: { qty: 0, supplier: 'Solartex', updatedAt: STOCK_DATE } },
];

// Factor de empacado (packing factor): fracción del techo realmente utilizable
// para paneles una vez descontados pasillos, setbacks, GCR inter-fila y áreas
// de servicio. Residencial ~0.68 (mantenimiento, claraboyas); industrial plano
// con tilt ~0.58 (GCR más exigente). Default 0.65.
export const DEFAULT_PACKING_FACTOR = 0.65;

// Área física de la huella del panel (proyección en planta) en m².
// Fallback a 2.2 m² si el panel del catálogo no trae dimensiones.
export const panelFootprintM2 = (panel) => {
  if (panel?.lengthMm && panel?.widthMm) {
    return (panel.lengthMm * panel.widthMm) / 1_000_000;
  }
  return 2.2;
};

// m² de techo requeridos por panel, incluido pasillo/GCR/setbacks.
export const panelRoofAreaM2 = (panel, packingFactor = DEFAULT_PACKING_FACTOR) => {
  return panelFootprintM2(panel) / Math.max(0.3, Math.min(0.95, packingFactor));
};

export const DEFAULT_INVERTERS = [
  // ───── On-grid monofásico (residencial) ─────
  { id: 'i1', brand: 'Growatt', model: 'MIN 3000TL-XH',      kw: 3,  phase: 1, price: 1850000, type: 'on-grid',  kg: 14,
    vocMax: 550,  mpptVmin: 80,  mpptVmax: 500, mpptCount: 2, idcMax: 13.5, efficiency: 97.6, vac: 240,
    stock: { qty: 8, supplier: 'Importaciones Alebas', updatedAt: STOCK_DATE } },
  { id: 'i2', brand: 'Growatt', model: 'MIN 5000TL-XH',      kw: 5,  phase: 1, price: 2450000, type: 'on-grid',  kg: 19,
    vocMax: 550,  mpptVmin: 80,  mpptVmax: 500, mpptCount: 2, idcMax: 13.5, efficiency: 97.6, vac: 240,
    stock: { qty: 6, supplier: 'Importaciones Alebas', updatedAt: STOCK_DATE } },
  { id: 'i4', brand: 'Solis',   model: 'S6-GR1P5K-M',        kw: 5,  phase: 1, price: 2550000, type: 'on-grid',  kg: 20,
    vocMax: 600,  mpptVmin: 90,  mpptVmax: 520, mpptCount: 2, idcMax: 16,   efficiency: 97.5, vac: 240,
    stock: { qty: 2, supplier: 'Solartex', updatedAt: STOCK_DATE } },
  // ───── On-grid trifásico (comercial / industrial) ─────
  { id: 'i3',  brand: 'Growatt', model: 'MID 10KTL3-X2',    kw: 10,  phase: 3, price: 4200000,  type: 'on-grid', kg: 32,
    vocMax: 1000, mpptVmin: 200, mpptVmax: 850, mpptCount: 2, idcMax: 25,   efficiency: 98.4, vac: 400,
    stock: { qty: 4, supplier: 'Importaciones Alebas', updatedAt: STOCK_DATE } },
  { id: 'i9',  brand: 'Growatt', model: 'MID 15KTL3-X2',    kw: 15,  phase: 3, price: 6200000,  type: 'on-grid', kg: 42,
    vocMax: 1100, mpptVmin: 200, mpptVmax: 950, mpptCount: 2, idcMax: 32,   efficiency: 98.5, vac: 400,
    stock: { qty: 3, supplier: 'Importaciones Alebas', updatedAt: STOCK_DATE } },
  { id: 'i10', brand: 'Growatt', model: 'MID 20KTL3-X2',    kw: 20,  phase: 3, price: 7900000,  type: 'on-grid', kg: 45,
    vocMax: 1100, mpptVmin: 200, mpptVmax: 950, mpptCount: 2, idcMax: 32,   efficiency: 98.5, vac: 400,
    stock: { qty: 2, supplier: 'Importaciones Alebas', updatedAt: STOCK_DATE } },
  { id: 'i11', brand: 'Growatt', model: 'MAX 30KTL3-LV',    kw: 30,  phase: 3, price: 10500000, type: 'on-grid', kg: 58,
    vocMax: 1100, mpptVmin: 200, mpptVmax: 960, mpptCount: 3, idcMax: 36,   efficiency: 98.6, vac: 400,
    stock: { qty: 1, supplier: 'Importaciones Alebas', updatedAt: STOCK_DATE } },
  { id: 'i12', brand: 'Growatt', model: 'MAX 50KTL3-LV',    kw: 50,  phase: 3, price: 15800000, type: 'on-grid', kg: 75,
    vocMax: 1100, mpptVmin: 200, mpptVmax: 960, mpptCount: 4, idcMax: 36,   efficiency: 98.6, vac: 400,
    stock: { qty: 0, supplier: 'Importaciones Alebas', updatedAt: STOCK_DATE } },
  { id: 'i13', brand: 'Growatt', model: 'MAX 100KTL3-X LV', kw: 100, phase: 3, price: 29500000, type: 'on-grid', kg: 84,
    vocMax: 1100, mpptVmin: 200, mpptVmax: 1000, mpptCount: 10, idcMax: 30, efficiency: 98.7, vac: 400,
    stock: { qty: 0, supplier: 'Importaciones Alebas', updatedAt: STOCK_DATE } },
  { id: 'i14', brand: 'Sungrow', model: 'SG125CX-P2',       kw: 125, phase: 3, price: 36000000, type: 'on-grid', kg: 95,
    vocMax: 1500, mpptVmin: 200, mpptVmax: 1300, mpptCount: 12, idcMax: 30, efficiency: 98.7, vac: 800,
    stock: { qty: 0, supplier: 'Solartex', updatedAt: STOCK_DATE } },
  // ───── Híbrido (con baterías, on-grid + backup) ─────
  { id: 'i5',  brand: 'Growatt', model: 'SPH 5000TL BL-UP',   kw: 5,  phase: 1, price: 4800000,  type: 'hybrid', kg: 22,
    vocMax: 550,  mpptVmin: 120, mpptVmax: 450, mpptCount: 2, idcMax: 13.5, efficiency: 97.5, vac: 240,
    stock: { qty: 4, supplier: 'Importaciones Alebas', updatedAt: STOCK_DATE } },
  { id: 'i6',  brand: 'Growatt', model: 'SPH 10000TL3 BH-UP', kw: 10, phase: 3, price: 7200000,  type: 'hybrid', kg: 36,
    vocMax: 1000, mpptVmin: 200, mpptVmax: 800, mpptCount: 2, idcMax: 25,   efficiency: 98.2, vac: 400,
    stock: { qty: 2, supplier: 'Importaciones Alebas', updatedAt: STOCK_DATE } },
  { id: 'i15', brand: 'Solis',   model: 'S6-EH3P15K-H',       kw: 15, phase: 3, price: 10800000, type: 'hybrid', kg: 45,
    vocMax: 1000, mpptVmin: 200, mpptVmax: 850, mpptCount: 3, idcMax: 30,   efficiency: 98.3, vac: 400,
    stock: { qty: 1, supplier: 'Solartex', updatedAt: STOCK_DATE } },
  { id: 'i16', brand: 'Solis',   model: 'S6-EH3P30K-H',       kw: 30, phase: 3, price: 18500000, type: 'hybrid', kg: 62,
    vocMax: 1100, mpptVmin: 200, mpptVmax: 950, mpptCount: 3, idcMax: 32,   efficiency: 98.4, vac: 400,
    stock: { qty: 0, supplier: 'Solartex', updatedAt: STOCK_DATE } },
  // ───── Off-grid (aislados, ZNI) ─────
  { id: 'i7', brand: 'Growatt', model: 'OFF3000TL-HVM',       kw: 3, phase: 1, price: 3200000, type: 'off-grid', kg: 17,
    vocMax: 500, mpptVmin: 120, mpptVmax: 430, mpptCount: 1, idcMax: 18, efficiency: 96.5, vac: 240,
    stock: { qty: 3, supplier: 'Importaciones Alebas', updatedAt: STOCK_DATE } },
  { id: 'i8', brand: 'Victron', model: 'MultiPlus-II 5000VA', kw: 4, phase: 1, price: 5500000, type: 'off-grid', kg: 28,
    vocMax: 250, mpptVmin: 60,  mpptVmax: 200, mpptCount: 1, idcMax: 20, efficiency: 96,   vac: 230,
    stock: { qty: 2, supplier: 'Energreen', updatedAt: STOCK_DATE } },
  { id: 'i17',brand: 'Victron', model: 'Quattro 10000VA',     kw: 8, phase: 1, price: 14500000, type: 'off-grid', kg: 45,
    vocMax: 250, mpptVmin: 60,  mpptVmax: 200, mpptCount: 1, idcMax: 30, efficiency: 96,   vac: 230,
    stock: { qty: 0, supplier: 'Energreen', updatedAt: STOCK_DATE } },
];

// Catálogo curado de baterías LFP para el mercado colombiano. Voltaje
// nominal, kWh útiles, descarga máxima y ciclos vienen de datasheets
// oficiales 2024-2026. Extensible desde /api/batteries (ver src/services/batteries.js)
// o manualmente en BackOffice → Baterías.
export const DEFAULT_BATTERIES = [
  // ───── LV 48V (residencial, la mayoría de híbridos en Colombia) ─────
  { id: 'b1',  brand: 'Pylontech', model: 'US3000C',              kwh: 3.5, price: 3200000,  kg: 37,  voltage: 48,   chemistry: 'LFP', maxDischargeA: 74,  cycles: 6000,
    stock: { qty: 12, supplier: 'Importaciones Alebas', updatedAt: STOCK_DATE } },
  { id: 'b2',  brand: 'Pylontech', model: 'US5000',               kwh: 4.8, price: 4500000,  kg: 45,  voltage: 48,   chemistry: 'LFP', maxDischargeA: 100, cycles: 6000,
    stock: { qty: 8,  supplier: 'Importaciones Alebas', updatedAt: STOCK_DATE } },
  { id: 'b3',  brand: 'Hubble',    model: 'AM-2 S-10',            kwh: 10,  price: 9800000,  kg: 95,  voltage: 51.2, chemistry: 'LFP', maxDischargeA: 150, cycles: 6000,
    stock: { qty: 3,  supplier: 'Energreen',            updatedAt: STOCK_DATE } },
  { id: 'b4',  brand: 'Dyness',    model: 'B4850',                kwh: 2.4, price: 2400000,  kg: 27,  voltage: 48,   chemistry: 'LFP', maxDischargeA: 50,  cycles: 6000,
    stock: { qty: 20, supplier: 'Solartex',             updatedAt: STOCK_DATE } },
  { id: 'b5',  brand: 'Deye',      model: 'SE-G5.1 Pro-B',        kwh: 5.12,price: 4800000,  kg: 48,  voltage: 51.2, chemistry: 'LFP', maxDischargeA: 100, cycles: 6000,
    stock: { qty: 15, supplier: 'Importaciones Alebas', updatedAt: STOCK_DATE } },
  { id: 'b6',  brand: 'GoodWe',    model: 'Lynx Home U 5.4',      kwh: 5.4, price: 5100000,  kg: 52,  voltage: 51.2, chemistry: 'LFP', maxDischargeA: 100, cycles: 6000,
    stock: { qty: 4,  supplier: 'Solartex',             updatedAt: STOCK_DATE } },
  // ───── HV stack (≥ 200V, para inversores híbridos trifásicos) ─────
  { id: 'b7',  brand: 'BYD',       model: 'Battery-Box Premium HVS 7.7', kwh: 7.7,  price: 7500000, kg: 80,  voltage: 409, chemistry: 'LFP', maxDischargeA: 25, cycles: 8000,
    stock: { qty: 2, supplier: 'Solartex', updatedAt: STOCK_DATE } },
  { id: 'b8',  brand: 'BYD',       model: 'Battery-Box Premium HVM 11', kwh: 11.04, price: 11200000, kg: 114, voltage: 307, chemistry: 'LFP', maxDischargeA: 50, cycles: 8000,
    stock: { qty: 1, supplier: 'Solartex', updatedAt: STOCK_DATE } },
  { id: 'b9',  brand: 'Huawei',    model: 'LUNA2000-5-S0',        kwh: 5,   price: 6200000,  kg: 50,  voltage: 360, chemistry: 'LFP', maxDischargeA: 14,  cycles: 6000,
    stock: { qty: 3, supplier: 'Importaciones Alebas', updatedAt: STOCK_DATE } },
  { id: 'b10', brand: 'Huawei',    model: 'LUNA2000-15-S0',       kwh: 15,  price: 17500000, kg: 150, voltage: 360, chemistry: 'LFP', maxDischargeA: 42,  cycles: 6000,
    stock: { qty: 0, supplier: 'Importaciones Alebas', updatedAt: STOCK_DATE } },
  // ───── Servo / baterías de servicio pesado (off-grid extendido) ─────
  { id: 'b11', brand: 'Victron',   model: 'LiFePO4 25.6V 200Ah',  kwh: 5.12,price: 8500000,  kg: 72,  voltage: 25.6, chemistry: 'LFP', maxDischargeA: 200, cycles: 5000,
    stock: { qty: 2, supplier: 'Energreen', updatedAt: STOCK_DATE } },
  { id: 'b12', brand: 'Pylontech', model: 'Force-H2 10.65',       kwh: 10.65, price: 11800000, kg: 138, voltage: 384, chemistry: 'LFP', maxDischargeA: 25, cycles: 6000,
    stock: { qty: 1, supplier: 'Importaciones Alebas', updatedAt: STOCK_DATE } },
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

// Materiales de cubierta — tipo de montaje recomendado, peso y notas RETIE/estructurales.
// `risk` (bajo|medio|crítico|evaluar) alimenta la advertencia NSR-10 en Quoter; `structuralRisk`
// es flag derivado para el cue visual ⚠.
export const ROOF_MATERIALS = {
  teja_eternit:  { label: 'Teja fibrocemento (Eternit)',      mountingType: 'Perfil aluminio gancho',       weightKgM2: 16,   risk: 'medio',   structuralRisk: false, icon: '▦', notes: 'Verificar estado de la teja antes de instalar. Usar tornillos autoperforantes con neopreno. Eternit frágil — no pisar.' },
  teja_zinc:     { label: 'Teja zinc / acero galvanizado',    mountingType: 'Gancho S o grapa directa',     weightKgM2: 5,    risk: 'bajo',    structuralRisk: false, icon: '⌇', notes: 'Estructura ligera. Protección anticorrosión en puntos de fijación.' },
  teja_barro:    { label: 'Teja de barro / colonial',         mountingType: 'Gancho de teja + perfil',      weightKgM2: 42,   risk: 'crítico', structuralRisk: true,  icon: '◇', notes: 'Requiere revisión estructural. Teja frágil — no pisar. Considerar refuerzo de pares. NSR-10 obliga cálculo por ingeniero civil.' },
  concreto:      { label: 'Losa de concreto (plana)',         mountingType: 'Lastrado o anclaje químico',   weightKgM2: null, risk: 'bajo',    structuralRisk: false, icon: '▭', notes: 'Impermeabilizar perforaciones si se ancla. Opción lastrado evita perforaciones.' },
  lamina_acero:  { label: 'Lámina acero / cubierta industrial', mountingType: 'Grapa trapecio o gancho',    weightKgM2: 8,    risk: 'medio',   structuralRisk: false, icon: '⌒', notes: 'Verificar perfil (trapezoidal, ondulada). Carga de viento calculada según NSR-10. Lámina <0.7 mm requiere refuerzo.' },
  madera:        { label: 'Estructura de madera',             mountingType: 'Riel aluminio + tornillo lag', weightKgM2: 12,   risk: 'medio',   structuralRisk: false, icon: '▥', notes: 'Revisar estado de vigas y correas. Tratar la madera con sellante en puntos de fijación.' },
  membrana_pvc:  { label: 'Membrana impermeabilizante (PVC/TPO)', mountingType: 'Lastrado pedestal',        weightKgM2: null, risk: 'bajo',    structuralRisk: false, icon: '─', notes: 'No perforar. Sistema de pedestales regulables con lastrado en zonas sin viento extremo.' },
  otro:          { label: 'Otro / no aplica',                 mountingType: 'Por definir',                  weightKgM2: null, risk: 'evaluar', structuralRisk: false, icon: '○', notes: 'El instalador evaluará el tipo de montaje en visita técnica.' },
};

// ==================== CALCULATIONS ====================
export const fmt = n => new Intl.NumberFormat('es-CO').format(Math.round(n));
export const fmtCOP = n => `$${fmt(n)}`;

// Calcula paneles por string (pps) y número de strings (ns) respetando los
// límites eléctricos del inversor. Si el panel o inversor no tiene specs,
// cae a la heurística antigua (700V nominal / 40V panel).
//   - pps_max_volt: limitado por Vdc_max (Voc en frío × pps ≤ vocMax × 0.95)
//   - pps_max_mppt: limitado por el techo MPPT (Vmp STC × pps ≤ mpptVmax × 0.97)
//   - pps_min: piso MPPT en caliente (Vmp caliente × pps ≥ mpptVmin × 1.05)
// Si pps_min > pps_max el par panel/inversor es INCOMPATIBLE — la función
// retorna feasible=false para que el selector de inversor pueda reintentar.
// En ese caso usa pps_max (sin violar vocMax), aunque caiga bajo MPPT.
export function sizeStrings(panel, inverter, numPanels, coldTempC = 10, hotTempC = 65) {
  const hasSpecs = panel?.voc && inverter?.vocMax && inverter?.mpptVmax;
  if (!hasSpecs) {
    const pps = Math.floor(700 / 40);
    const ns = Math.max(1, Math.ceil(numPanels / pps));
    return { pps, ns, ppss: Math.ceil(numPanels / ns), specsSource: 'heuristic', feasible: true, actualPanels: numPanels, currentLimited: false };
  }
  const tcVoc = panel.tempCoeffVoc ?? -0.28;
  const tcPmax = panel.tempCoeffPmax ?? -0.35;
  const vocCold = panel.voc * (1 + (tcVoc / 100) * (coldTempC - 25));
  const vmpHot = panel.vmp * (1 + (tcPmax / 100) * (hotTempC - 25));
  const ppsMaxVolt = Math.floor((inverter.vocMax * 0.95) / vocCold);
  const ppsMaxMppt = Math.floor((inverter.mpptVmax * 0.97) / panel.vmp);
  const ppsHardMax = Math.max(1, Math.min(ppsMaxVolt, ppsMaxMppt));
  const ppsMin = inverter.mpptVmin ? Math.ceil((inverter.mpptVmin * 1.05) / vmpHot) : 1;
  const feasible = ppsMin <= ppsHardMax;
  let pps = ppsHardMax; // Never exceed ppsHardMax → Vdc_max safe
  pps = Math.min(pps, numPanels);
  let ns = Math.max(1, Math.ceil(numPanels / pps));

  // Cap ns by Idc_max: max parallel strings per MPPT = floor(idcMax / imp).
  // If the resulting ns is smaller, the system is current-limited and
  // calcSystem will reduce actKwp to the panels that can actually be wired.
  let currentLimited = false;
  if (inverter.idcMax && panel.imp) {
    const mpptCount = Math.max(1, inverter.mpptCount || 1);
    const maxStrPerMppt = Math.max(1, Math.floor(inverter.idcMax / panel.imp));
    const maxNsCurrent = maxStrPerMppt * mpptCount;
    if (ns > maxNsCurrent) {
      ns = maxNsCurrent;
      currentLimited = true;
    }
  }

  const actualPanels = Math.min(ns * pps, numPanels);
  const ppss = Math.ceil(actualPanels / ns); // clean pps after capping
  return { pps, ns, ppss, specsSource: 'inverter-limited', feasible, ppsMin, ppsHardMax, actualPanels, currentLimited };
}

// opts.pvgisAnnualKwh: si se pasa, sobreescribe la producción heurística (PSH).
// opts.targetKwp: si se pasa, dimensiona al kWp objetivo en lugar del consumo
//   (útil cuando el cliente quiere sobredimensionar para generar excedentes).
// Cap por MAX_KWP_AGPE para evitar dimensionar fuera del alcance regulatorio.
// inv: puede ser el objeto inversor completo (preferido, para usar specs
// eléctricos reales al dimensionar strings) o un número (kW) legado.
export function calcSystem(monthlyKwh, panel, inv, bUnit, bQty, psh, opts = {}) {
  const invObj = (typeof inv === 'object' && inv !== null) ? inv : { kw: inv };
  const invKw = invObj.kw;
  const PR = opts.pr ?? 0.78;
  // Apply soiling factor for the department (additive loss on top of PR).
  // getSoiling returns e.g. 0.02 for 2% loss. effectivePR = PR × (1 − soiling).
  const effectivePR = opts.dept ? PR * (1 - getSoiling(opts.dept)) : PR;
  const daily = monthlyKwh / 30;
  const consumptionKwp = daily / (psh * effectivePR);
  const rawTarget = opts.targetKwp && opts.targetKwp > 0 ? opts.targetKwp : consumptionKwp;
  const kwpN = Math.min(rawTarget, MAX_KWP_AGPE);
  const cappedByRegulation = rawTarget > MAX_KWP_AGPE;
  const coldTempC = opts.coldTempC ?? 10;  // Temperatura mínima de celda (NASA POWER o default NEC 690.7)
  const hotTempC  = opts.hotTempC  ?? 65;  // Temperatura máxima de celda (NASA POWER + offset NOCT)
  const numPanelsIdeal = Math.ceil(kwpN * 1000 / panel.wp);
  // sizeStrings may cap ns when Idc_max would be exceeded; actualPanels reflects
  // the true number that can be wired. We use it for all energy/financial calcs.
  const { pps, ns, ppss, actualPanels, currentLimited, specsSource } = sizeStrings(panel, invObj, numPanelsIdeal, coldTempC, hotTempC);
  const numPanels = currentLimited ? actualPanels : numPanelsIdeal;
  const actKwp = parseFloat(((numPanels * panel.wp) / 1000).toFixed(2));

  let dp, mp, ap;
  const usingPVGIS = opts.pvgisAnnualKwh && opts.pvgisAnnualKwh > 0;
  if (usingPVGIS) {
    ap = Math.round(opts.pvgisAnnualKwh);
  } else {
    dp = parseFloat((actKwp * psh * effectivePR).toFixed(1));
    ap = Math.round(dp * 365);
  }
  // Factor de sombreado local de Google Solar API dataLayers (0–1).
  // 1.0 = sin sombra (factor por defecto cuando la API no reporta).
  const shade = opts.shadeIndex != null ? Math.max(0.1, Math.min(1, Number(opts.shadeIndex))) : 1;
  ap = Math.round(ap * shade);
  mp = Math.round(ap / 12);
  dp = parseFloat((ap / 365).toFixed(1));

  const cov = Math.min(Math.round((mp / monthlyKwh) * 100), 120);
  const dca = parseFloat((actKwp / invKw).toFixed(2));
  const co2 = Math.round(ap * 0.126);
  // Área real de techo ocupada, usando footprint real + packing factor
  const packing = opts.packingFactor || DEFAULT_PACKING_FACTOR;
  const roof = parseFloat((numPanels * panelRoofAreaM2(panel, packing)).toFixed(1));
  const tB = bUnit && bQty ? parseFloat((bQty * bUnit.kwh).toFixed(1)) : 0;
  const aut = tB > 0 ? parseFloat(((tB * 0.8) / (daily / 24)).toFixed(1)) : 0;
  const kgTotal = (numPanels * (panel.kg || 25.5))
    + (numPanels * 7.5)  // estructura
    + invKw              // inversor aprox
    + (bUnit && bQty ? bQty * (bUnit.kg || 37) : 0)
    + (8 + numPanels * 0.3); // accesorios
  const dataSource = usingPVGIS ? 'PVGIS' : 'PSH';
  return { numPanels, actKwp, dp, mp, ap, cov, dca, co2, ns, ppss, roof, tB, aut, kgTotal, dataSource, cappedByRegulation, currentLimited, specsSource };
}

export function calcTransport(zonas, zona, kgTotal, valorDec) {
  const z = zonas[zona];
  const flete = Math.round(z.base + Math.max(0, kgTotal - 1) * z.kgAd);
  const sf = Math.round(valorDec * SOBREFLETE);
  return { flete, sf, total: flete + sf };
}

// Cotiza en todas las transportadoras y devuelve la más económica.
// Nuevo: aplica ajuste por km dentro de la zona y usa peso facturable (volumétrico vs real).
// `eqInfo`: { numPanels, panel, inv } para calcular peso volumétrico. Opcional.
export function pickBestTransport(zona, kgTotal, valorDec = 0, carriers = CARRIERS, destKm = 0, eqInfo = null) {
  const sf = Math.round(valorDec * SOBREFLETE);
  const kmFactor = destKm > 0 ? getZoneKmFactor(destKm, zona) : 1.0;

  // Peso facturable (volumétrico vs real)
  let billableKg = kgTotal;
  let dimKg = 0;
  if (eqInfo?.numPanels && eqInfo?.panel) {
    const dimResult = calcDimensionalWeight(eqInfo.numPanels, eqInfo.panel, eqInfo.inv, null, 0);
    dimKg = dimResult.totalDimKg;
    billableKg = getBillableWeight(kgTotal, dimKg);
  }

  const quotes = Object.entries(carriers).map(([carrierId, c]) => {
    const z = c.zonas[zona];
    if (!z) return null;
    // Deprisa usa divisor 6000 para aéreo → aplicar factor 0.83 al peso volumétrico
    const airFactor = carrierId === 'deprisa' ? 0.83 : 1.0;
    const effectiveKg = carrierId === 'deprisa' ? Math.max(kgTotal, dimKg * airFactor) : billableKg;
    const baseFlete = Math.round(z.base + Math.max(0, effectiveKg - 1) * z.kgAd);
    const flete = Math.round(baseFlete * kmFactor);
    return { carrierId, label: c.label, note: c.note || '', flete, sf, total: flete + sf, billableKg: effectiveKg, dimKg, actualKg: kgTotal, kmFactor };
  }).filter(Boolean);
  quotes.sort((a, b) => a.total - b.total);
  return { best: quotes[0] || null, quotes, billableKg, dimKg, actualKg: kgTotal };
}

export function calcBudget(sys, panel, inv, bUnit, bQty, pricing, transport) {
  const pC = sys.numPanels * panel.price;
  const iC = inv ? inv.price : 0;
  const bC = bUnit && bQty ? bQty * bUnit.price : 0;
  const sA = pC + iC + bC;
  const st = sys.numPanels * pricing.structure_per_panel;
  const ca = sys.actKwp * pricing.cabling_per_kwp;
  const pt = sys.actKwp * pricing.protections_per_kwp;
  const ins = sys.actKwp * pricing.installation_per_kwp;
  // Las tarifas de las transportadoras (CARRIERS) están cotizadas BRUTAS con IVA
  // incluido — el cliente final paga el precio mostrado al transportador. No se
  // aplica IVA otra vez sobre `transport`, solo sobre los servicios propios
  // (estructura, cableado, protecciones, instalación, ingeniería, trámites).
  const ivaBaseGravable = st + ca + pt + ins + pricing.engineering + pricing.emsa_tramites;
  const iva = Math.round(ivaBaseGravable * (pricing.iva / 100));
  const bBase = ivaBaseGravable + (transport || 0);
  const sB = bBase + iva;
  const tot = sA + sB;
  return { pC, iC, bC, sA, st, ca, pt, ins, eng: pricing.engineering, emsa: pricing.emsa_tramites, transport: transport || 0, bBase, iva, sB, tot };
}

// Calcula el beneficio económico anual aplicando la regulación AGPE.
//   - autoConsumo (energía generada que coincide con consumo): ahorro a tarifa CU plena.
//   - excedentes (energía inyectada a la red): valorada según categoría AGPE.
//     · Menor (kWp ≤ 100): CREG 174/2021 art. 7 — excedentes a CU − G (sin el
//       componente de generación, porque no se paga el kWh de bolsa/contrato).
//     · Mayor (100 < kWp ≤ 1000): liquidación a precio bolsa XM (PrecBolsNal).
// Parámetros:
//   tariffCUValue         — CU plena COP/kWh (para autoconsumo; ver splitCU/tariffCU).
//   spotPriceCOPkWh       — precio bolsa horario (sólo Mayor).
//   opts.excedentePrice   — precio de excedentes Menor (COP/kWh). Si se provee,
//                           reemplaza el cálculo CU − G. Típicamente viene de
//                           excedentePriceFor(operator, voltageLevel).
// IMPORTANTE: los sistemas off-grid NO están conectados a la red y por
// definición no entregan excedentes — la energía sobrante se pierde
// (o se limita vía dump load). Para off-grid gridExport=false y sólo
// se contabiliza ahorro por autoconsumo.
export function calcAGPEBenefit(annualProdKwh, monthlyConsumptionKwh, tariffCUValue, spotPriceCOPkWh, kwp, opts = {}) {
  const gridExport = opts.gridExport !== false;
  const annualConsumption = monthlyConsumptionKwh * 12;
  const autoConsumed = Math.min(annualProdKwh, annualConsumption);
  const rawExcedentes = Math.max(0, annualProdKwh - annualConsumption);
  const excedentes = gridExport ? rawExcedentes : 0;
  const energiaDesperdiciada = gridExport ? 0 : rawExcedentes;
  const isMenor = kwp <= AGPE_LIMIT_KW_MENOR;
  const ahorroAutoconsumo = Math.round(autoConsumed * tariffCUValue);
  // Precio excedentes Menor: preferir el valor explícito (CU − G de componentes
  // reales del OR); si no, caer al default de fracción G_N1.
  const fallbackCUminusG = tariffCUValue * (1 - CU_FRACTIONS_N1_DEFAULT.G);
  const menorPrice = opts.excedentePrice != null ? opts.excedentePrice : fallbackCUminusG;
  const priceExcedentes = gridExport ? (isMenor ? menorPrice : (spotPriceCOPkWh || 0)) : 0;
  const ingresoExcedentes = Math.round(excedentes * priceExcedentes);
  const totalAnual = ahorroAutoconsumo + ingresoExcedentes;
  const pctOfCU = tariffCUValue > 0 ? Math.round((priceExcedentes / tariffCUValue) * 100) : 0;
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
      ? (isMenor ? `Excedentes a CU − G (≈${pctOfCU}% de CU, CREG 174/2021)` : 'Excedentes a precio bolsa XM')
      : 'Sistema aislado — no entrega excedentes a la red',
  };
}

// Evalúa si un panel y un inversor son eléctricamente compatibles sin
// violar Vdc_max ni el rango MPPT (los dos extremos: Voc frío y Vmp caliente).
// Retorna { feasible, ppsMaxVolt, ppsMaxMppt, ppsMin } para scoring.
export function inverterCompatibility(panel, inverter, coldTempC = 10, hotTempC = 65) {
  if (!panel?.voc || !inverter?.vocMax) return { feasible: true, ppsMaxVolt: 0, ppsMaxMppt: 0, ppsMin: 0, unknown: true };
  const tcVoc = panel.tempCoeffVoc ?? -0.28;
  const tcPmax = panel.tempCoeffPmax ?? -0.35;
  const vocCold = panel.voc * (1 + (tcVoc / 100) * (coldTempC - 25));
  const vmpHot = panel.vmp * (1 + (tcPmax / 100) * (hotTempC - 25));
  const ppsMaxVolt = Math.floor((inverter.vocMax * 0.95) / vocCold);
  const ppsMaxMppt = inverter.mpptVmax ? Math.floor((inverter.mpptVmax * 0.97) / panel.vmp) : ppsMaxVolt;
  const ppsMin = inverter.mpptVmin ? Math.ceil((inverter.mpptVmin * 1.05) / vmpHot) : 1;
  const feasible = ppsMin <= Math.min(ppsMaxVolt, ppsMaxMppt);
  return { feasible, ppsMaxVolt, ppsMaxMppt, ppsMin };
}

// Rango óptimo de DC/AC ratio por tipo de sistema.
//   on-grid: 1.10–1.35 (sobredimensionar paneles aprovecha horas de hombro sin clipping severo)
//   hybrid : 1.00–1.25 (excedente carga baterías; ratios altos empiezan a clippear)
//   off-grid: 0.95–1.15 (sin red, cualquier excedente se pierde una vez llenas las baterías)
const DCAC_RANGE = {
  'on-grid':  { min: 1.10, max: 1.35, ideal: 1.20 },
  'hybrid':   { min: 1.00, max: 1.25, ideal: 1.15 },
  'off-grid': { min: 0.95, max: 1.15, ideal: 1.05 },
};

// Familias de inversor aceptables según tipo de sistema.
//   on-grid : on-grid (principal) | hybrid (fallback, inyecta pero más caro y sobra función batería)
//   hybrid  : hybrid (único — requiere carga de baterías + inyección)
//   off-grid: off-grid (principal) | hybrid (fallback sólo si el modelo declara `offGridCapable`)
function acceptableInverterTypes(sysType) {
  if (sysType === 'on-grid')  return ['on-grid', 'hybrid'];
  if (sysType === 'hybrid')   return ['hybrid'];
  if (sysType === 'off-grid') return ['off-grid', 'hybrid'];
  return [sysType];
}

// Scoring de selección de inversor. Prioriza compatibilidad eléctrica y tipo exacto:
//   +10000 compatible con el panel (Voc frío y Vmp caliente dentro del rango)
//   +5000  corriente DC factible (Idc_max / Imp por MPPT suficiente para los strings)
//   +3000  tipo coincide exactamente con sysType (vs. familia aceptable)
//   +2000  DC/AC dentro del rango recomendado para el sysType
//   +500   stock disponible esta semana (inv.stock?.qty > 0)
//   -|DC/AC - ideal|·100   penalización por alejarse del ratio ideal del sysType
//   -0.1·|kW - kwp|        desempate por proximidad de potencia
//  Fallback: si no existe coincidencia exacta con sysType, acepta la familia
//  alternativa (hybrid sustituye a on-grid u off-grid cuando no hay stock exacto).
//  Para sistemas off-grid sólo se acepta hybrid si declara `offGridCapable: true`.
export function selectCompatibleInverter(panel, kwp, sysType, inverters, opts = {}) {
  const coldTempC = opts.coldTempC ?? 10;
  const hotTempC  = opts.hotTempC  ?? 65;
  // phases = fases aceptables (RETIE 240). [1] para monofásico/bifásico 120/240V,
  // [3] para trifásico. Si no se provee, aceptamos cualquier fase.
  const phases   = Array.isArray(opts.phases) && opts.phases.length ? opts.phases : null;
  const okTypes = acceptableInverterTypes(sysType);
  const matchPhase = (i) => !phases || phases.includes(i.phase);
  const pool = inverters.filter(i => {
    if (!okTypes.includes(i.type)) return false;
    if (sysType === 'off-grid' && i.type === 'hybrid' && !i.offGridCapable) return false;
    if (!matchPhase(i)) return false;
    return true;
  });
  if (!pool.length) {
    // Fallback: relajamos el filtro de fase primero (mejor tipo correcto que fase correcta).
    const byType = inverters.filter(i => okTypes.includes(i.type)
      && !(sysType === 'off-grid' && i.type === 'hybrid' && !i.offGridCapable));
    if (byType.length) {
      return [...byType].sort((a, b) => Math.abs((a.kw || 0) - kwp) - Math.abs((b.kw || 0) - kwp))[0];
    }
    // Último recurso — no existe nada del tipo correcto; devolver el inversor
    // más cercano en potencia para evitar crash, la UI debe advertir.
    const any = [...inverters].sort((a, b) => Math.abs((a.kw || 0) - kwp) - Math.abs((b.kw || 0) - kwp));
    return any[0] || inverters[0];
  }
  const range = DCAC_RANGE[sysType] || DCAC_RANGE['on-grid'];
  const scored = pool.map(inv => {
    const compat = inverterCompatibility(panel, inv, coldTempC, hotTempC);
    const dcAc = inv.kw ? kwp / inv.kw : 0;
    const ratioGood = dcAc >= range.min && dcAc <= range.max;
    const stock = inv.stock?.qty > 0;
    const exactType = inv.type === sysType;

    // Check Idc_max feasibility: can this inverter handle all the strings
    // required for kwp without exceeding its DC current rating?
    let currentFeasible = true;
    if (panel.wp > 0 && panel.imp && inv.idcMax && inv.mpptCount) {
      const numP = Math.ceil(kwp * 1000 / panel.wp);
      const ppsForCheck = Math.max(1, compat.ppsHardMax || Math.floor(700 / 40));
      const nsNeeded = Math.ceil(numP / ppsForCheck);
      const maxStrPerMppt = Math.max(1, Math.floor(inv.idcMax / panel.imp));
      const maxNsCurrent = maxStrPerMppt * Math.max(1, inv.mpptCount);
      currentFeasible = nsNeeded <= maxNsCurrent;
    }

    let score = 0;
    if (compat.feasible) score += 10000;
    if (currentFeasible) score += 5000;
    if (exactType) score += 3000;
    if (ratioGood) score += 2000;
    if (stock) score += 500;
    score -= Math.abs(dcAc - range.ideal) * 100;
    score -= Math.abs(inv.kw - kwp) * 0.1;
    return { inv, score, compat, dcAc };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].inv;
}

// Wrapper legado — usa selectCompatibleInverter cuando hay un panel,
// cae al scoring por kW cuando no. Mantiene compatibilidad con llamadas
// que sólo conocen kWp y tipo. Aplica la misma política de familias
// aceptables (hybrid sustituye a on-grid/off-grid cuando falta stock exacto).
export function autoInverter(kwp, sysType, inverters, panel) {
  if (panel) return selectCompatibleInverter(panel, kwp, sysType, inverters);
  const okTypes = acceptableInverterTypes(sysType);
  const pool = inverters.filter(i => {
    if (!okTypes.includes(i.type)) return false;
    if (sysType === 'off-grid' && i.type === 'hybrid' && !i.offGridCapable) return false;
    return true;
  });
  if (!pool.length) return inverters[0];
  const range = DCAC_RANGE[sysType] || DCAC_RANGE['on-grid'];
  const targetMin = kwp / range.max;
  const targetMax = kwp / range.min;
  // Prioriza tipo exacto > rango kW > cercanía en potencia.
  const exact = pool.filter(i => i.type === sysType);
  const primary = exact.length ? exact : pool;
  const inRange = primary.filter(i => i.kw >= targetMin && i.kw <= targetMax).sort((a, b) => a.kw - b.kw);
  if (inRange.length) return inRange[0];
  const above = primary.filter(i => i.kw >= targetMin).sort((a, b) => a.kw - b.kw);
  if (above.length) return above[0];
  return [...primary].sort((a, b) => b.kw - a.kw)[0];
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

// CREG 030/2018 — Cálculo mensual de net metering para AGPE Menor (≤ 100 kW).
// Los créditos de excedentes se aplican mensualmente, no anualmente.
// El precio de los excedentes (bolsa) es ≈ 80% de la tarifa CU usuario final
// (componente G del CU según CREG 174/2021 art. 7). excedentePricePct=0.8 por defecto.
//
// Parámetros:
//   monthlyProdKwh    — producción mensual estimada del sistema (kWh)
//   monthlyConsumoKwh — consumo mensual del usuario (kWh, del recibo)
//   tarifaKwh         — tarifa CU efectiva del operador (COP/kWh)
//   excedentePricePct — fracción de la tarifa que recibe el usuario por excedentes (default 0.80)
//
// Retorna un objeto con el desglose mensual completo.
export function calcMonthlyNetMetering(monthlyProdKwh, monthlyConsumoKwh, tarifaKwh, excedentePricePct = 0.8) {
  const prod = Math.max(0, Number(monthlyProdKwh) || 0);
  const cons = Math.max(0, Number(monthlyConsumoKwh) || 0);
  const tarifa = Math.max(0, Number(tarifaKwh) || 0);
  const pct = Math.max(0, Math.min(1, Number(excedentePricePct) || 0.8));

  // Energía autoconsumida directamente (desplaza compra a la red)
  const autoconsumo = Math.min(prod, cons);
  // Energía inyectada a la red (si producción > consumo)
  const excedentes = Math.max(0, prod - cons);
  // Energía que aún se compra a la red (si consumo > producción)
  const deficit = Math.max(0, cons - prod);

  // Ahorro por autoconsumo: kWh que NO se compran a la tarifa plena
  const savingsAutoconsumo = Math.round(autoconsumo * tarifa);
  // Crédito por excedentes inyectados (liquidados al precio de bolsa ≈ 80% CU)
  const creditExcedentes = Math.round(excedentes * tarifa * pct);
  // Costo de la energía que todavía se compra a la red
  const costoDeficit = Math.round(deficit * tarifa);

  // Factura neta = lo que aún se paga a la red menos el crédito de excedentes.
  // La diferencia puede ser cero si el crédito supera el déficit (saldo a favor al siguiente mes).
  const facturaNeta = Math.max(0, costoDeficit - creditExcedentes);

  // Ahorro total vs. no tener solar: factura sin solar - factura con solar
  const facturaSinSolar = Math.round(cons * tarifa);
  const ahorro = facturaSinSolar - facturaNeta;

  return {
    autoconsumo: Math.round(autoconsumo),
    excedentes: Math.round(excedentes),
    deficit: Math.round(deficit),
    savingsAutoconsumo,
    creditExcedentes,
    costoDeficit,
    facturaNeta,
    facturaSinSolar,
    ahorro,
    excedentePricePct: pct,
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

// src/services/memoriaGenerator.js
// Genera Memoria Técnica Eléctrica conforme RETIE / NTC 2050 / CREG 174/2021 / CNO 1862/2024
// Documento de referencia: "Memoria Técnica DR Asosantana Rev.A" — Energy Falcon S.A.S.
// Módulo puro JS — sin dependencias externas, sin React.

// ---------------------------------------------------------------------------
// Tablas de norma y catálogo de clima por departamento
// ---------------------------------------------------------------------------

const DEPT_CLIMATE = {
  'Bogotá D.C.':          { zone: 'Andina',            tempMax: 20, tempMin: 5,  altMsnm: 2600 },
  'Antioquia':            { zone: 'Andina-Caribe',      tempMax: 28, tempMin: 12, altMsnm: 1495 },
  'Atlántico':            { zone: 'Caribe',             tempMax: 34, tempMin: 23, altMsnm: 100  },
  'Bolívar':              { zone: 'Caribe',             tempMax: 34, tempMin: 22, altMsnm: 30   },
  'Boyacá':               { zone: 'Andina',             tempMax: 18, tempMin: 4,  altMsnm: 2539 },
  'Caldas':               { zone: 'Andina',             tempMax: 22, tempMin: 14, altMsnm: 2153 },
  'Caquetá':              { zone: 'Amazónica',          tempMax: 30, tempMin: 20, altMsnm: 270  },
  'Casanare':             { zone: 'Orinoquía',          tempMax: 35, tempMin: 20, altMsnm: 200  },
  'Cauca':                { zone: 'Andina-Pacífico',    tempMax: 24, tempMin: 10, altMsnm: 1737 },
  'Cesar':                { zone: 'Caribe',             tempMax: 36, tempMin: 24, altMsnm: 172  },
  'Chocó':                { zone: 'Pacífico',           tempMax: 32, tempMin: 22, altMsnm: 43   },
  'Córdoba':              { zone: 'Caribe',             tempMax: 35, tempMin: 22, altMsnm: 30   },
  'Cundinamarca':         { zone: 'Andina',             tempMax: 22, tempMin: 8,  altMsnm: 2230 },
  'Huila':                { zone: 'Andina',             tempMax: 28, tempMin: 14, altMsnm: 580  },
  'La Guajira':           { zone: 'Caribe',             tempMax: 38, tempMin: 24, altMsnm: 10   },
  'Magdalena':            { zone: 'Caribe',             tempMax: 33, tempMin: 22, altMsnm: 30   },
  'Meta':                 { zone: 'Orinoquía',          tempMax: 32, tempMin: 18, altMsnm: 467  },
  'Nariño':               { zone: 'Andina-Pacífico',    tempMax: 18, tempMin: 6,  altMsnm: 2527 },
  'Norte de Santander':   { zone: 'Andina',             tempMax: 30, tempMin: 14, altMsnm: 380  },
  'Putumayo':             { zone: 'Amazónica',          tempMax: 28, tempMin: 16, altMsnm: 430  },
  'Quindío':              { zone: 'Andina',             tempMax: 22, tempMin: 16, altMsnm: 1539 },
  'Risaralda':            { zone: 'Andina',             tempMax: 21, tempMin: 15, altMsnm: 1411 },
  'Santander':            { zone: 'Andina',             tempMax: 28, tempMin: 16, altMsnm: 959  },
  'Sucre':                { zone: 'Caribe',             tempMax: 35, tempMin: 23, altMsnm: 20   },
  'Tolima':               { zone: 'Andina',             tempMax: 30, tempMin: 16, altMsnm: 510  },
  'Valle del Cauca':      { zone: 'Andina-Pacífico',    tempMax: 24, tempMin: 16, altMsnm: 995  },
};
const DEPT_CLIMATE_DEFAULT = { zone: 'Andina', tempMax: 28, tempMin: 12, altMsnm: 500 };

// Tabla 250.122 NTC 2050 — calibre de tierra según protección máxima del OCPD
const GROUND_TABLE_250_122 = [
  { maxOCPD: 15,   awg: '14' },
  { maxOCPD: 20,   awg: '12' },
  { maxOCPD: 60,   awg: '10' },
  { maxOCPD: 100,  awg: '8'  },
  { maxOCPD: 200,  awg: '6'  },
  { maxOCPD: 300,  awg: '4'  },
  { maxOCPD: 400,  awg: '3'  },
  { maxOCPD: 500,  awg: '2'  },
  { maxOCPD: 600,  awg: '1'  },
  { maxOCPD: 800,  awg: '1/0'},
  { maxOCPD: 1000, awg: '2/0'},
  { maxOCPD: 1200, awg: '3/0'},
  { maxOCPD: 1600, awg: '4/0'},
];

// Tabla 310.15(B)(16) NTC 2050 — ampacidad conductores Cu THWN-2 90°C, 30°C ambiente
const NTC2050_TABLE = [
  { awg: '14',  kcmil: null, ampacity: 25  },
  { awg: '12',  kcmil: null, ampacity: 30  },
  { awg: '10',  kcmil: null, ampacity: 40  },
  { awg: '8',   kcmil: null, ampacity: 55  },
  { awg: '6',   kcmil: null, ampacity: 75  },
  { awg: '4',   kcmil: null, ampacity: 95  },
  { awg: '3',   kcmil: null, ampacity: 110 },
  { awg: '2',   kcmil: null, ampacity: 130 },
  { awg: '1',   kcmil: null, ampacity: 150 },
  { awg: '1/0', kcmil: null, ampacity: 175 },
  { awg: '2/0', kcmil: null, ampacity: 200 },
  { awg: '3/0', kcmil: null, ampacity: 230 },
  { awg: '4/0', kcmil: null, ampacity: 260 },
  { awg: null,  kcmil: 250,  ampacity: 290 },
  { awg: null,  kcmil: 300,  ampacity: 320 },
  { awg: null,  kcmil: 350,  ampacity: 350 },
  { awg: null,  kcmil: 400,  ampacity: 380 },
  { awg: null,  kcmil: 500,  ampacity: 430 },
];

// Factores de producción mensual relativos para Colombia (estación seca/lluviosa)
const MONTHLY_FACTORS = [0.85, 0.88, 0.92, 0.97, 1.05, 1.08, 1.12, 1.10, 1.03, 0.97, 0.90, 0.83];
const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// Tamaños estándar de breakers (A)
const BREAKER_SIZES = [15, 20, 25, 30, 35, 40, 50, 60, 70, 80, 100, 110, 125, 150, 175, 200, 225, 250, 300, 350, 400, 450, 500, 600, 700, 800, 1000, 1200, 1600];

// ---------------------------------------------------------------------------
// Funciones auxiliares de cálculo
// ---------------------------------------------------------------------------

function selectDCCable(idc) {
  if (!idc) return { section: '6 mm²', awg: 'N/A', note: 'Usar ficha técnica de panel' };
  if (idc <= 30) return { section: '4 mm²',  awg: '12 AWG', ampacity: 30 };
  if (idc <= 40) return { section: '6 mm²',  awg: '10 AWG', ampacity: 40 };
  if (idc <= 57) return { section: '10 mm²', awg: '8 AWG',  ampacity: 57 };
  return             { section: '16 mm²', awg: '6 AWG',  ampacity: 76 };
}

function selectACCable(iDesign) {
  const entry = NTC2050_TABLE.find(e => e.ampacity >= iDesign);
  return entry || NTC2050_TABLE[NTC2050_TABLE.length - 1];
}

function calcACurrent(kw, voltage, phases, fp = 0.9) {
  if (phases === 1) return (kw * 1000) / (voltage * fp);
  return (kw * 1000) / (Math.sqrt(3) * voltage * fp);
}

function selectGroundConductor(protAmps) {
  const entry = GROUND_TABLE_250_122.find(e => e.maxOCPD >= protAmps);
  return entry ? entry.awg + ' AWG Cu' : '4/0 AWG Cu';
}

function roundUpBreaker(a) {
  return BREAKER_SIZES.find(b => b >= a) || BREAKER_SIZES[BREAKER_SIZES.length - 1];
}

function fmtN(n, dec = 2) {
  if (n == null || isNaN(n)) return 'N/D';
  return Number(n).toLocaleString('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtCOP(n) {
  if (n == null || isNaN(n)) return 'N/D';
  return '$ ' + Math.round(n).toLocaleString('es-CO');
}

function formatDate(d) {
  if (!d) return new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
  return new Date(d).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatDateShort(d) {
  if (!d) return new Date().toLocaleDateString('es-CO');
  return new Date(d).toLocaleDateString('es-CO');
}

function yesNo(val) {
  return val ? '✓ Cumple' : '✗ No cumple';
}

function checkMark(pass) {
  return pass ? '<span style="color:#1a7f3c">✅ CUMPLE</span>' : '<span style="color:#c0392b">⚠ VERIFICAR</span>';
}

// ---------------------------------------------------------------------------
// Generador de tabla HTML reutilizable
// ---------------------------------------------------------------------------

function tbl(rows, headers) {
  let h = '';
  if (headers) {
    h = `<thead><tr>${headers.map(c => `<th>${c}</th>`).join('')}</tr></thead>`;
  }
  const body = rows.map((r, ri) =>
    `<tr class="${ri % 2 === 1 ? 'alt' : ''}">${r.map(c => `<td>${c}</td>`).join('')}</tr>`
  ).join('');
  return `<table><colgroup><col style="width:55%"><col style="width:45%"></colgroup>${h}<tbody>${body}</tbody></table>`;
}

function tbl2(rows, headers) {
  let h = '';
  if (headers) {
    h = `<thead><tr>${headers.map((c, i) => `<th style="${i===0?'width:40%':''}">${c}</th>`).join('')}</tr></thead>`;
  }
  const body = rows.map((r, ri) =>
    `<tr class="${ri % 2 === 1 ? 'alt' : ''}">${r.map(c => `<td>${c}</td>`).join('')}</tr>`
  ).join('');
  return `<table>${h}<tbody>${body}</tbody></table>`;
}

// ---------------------------------------------------------------------------
// Función principal que construye el HTML completo
// ---------------------------------------------------------------------------

function buildHtml(data) {
  const {
    client = {},
    location = {},
    date,
    revision = 'A',
    preparedBy = 'ALEBAS Ingeniería SAS',
    systemType = 'on-grid',
    actKwp,
    numPanels,
    ns,
    ppss,
    panel = {},
    inverter = {},
    gridVoltage = 220,
    coldTempC = 10,
    hotTempC = 70,
    nasaGHI,
    results = {},
    budget = {},
    monthlyKwh = 0,
    unifilarSvgDC,
  } = data;

  const dept = location.dept || client.dept || '';
  const city = location.city || client.city || '';
  const climate = DEPT_CLIMATE[dept] || DEPT_CLIMATE_DEFAULT;
  const dateStr  = formatDate(date);
  const dateShort = formatDateShort(date);

  // — Número de inversores
  const invKw    = inverter.kw || 1;
  const numInv   = Math.ceil(actKwp / invKw);
  const invKwTotal = invKw * numInv;

  // — Corriente AC
  const phases   = inverter.phases || 1;
  const iac      = calcACurrent(invKwTotal, gridVoltage, phases, 0.9);
  const iacDesign = iac * 1.25;
  const acCable  = selectACCable(iacDesign);
  const acCableLabel = acCable.awg ? `${acCable.awg} AWG` : `${acCable.kcmil} kcmil`;

  // — Corriente DC
  const iDesignDC = panel.isc ? 1.56 * panel.isc : null;
  const dcCable   = selectDCCable(iDesignDC);

  // — Protección AC
  const protAmps  = roundUpBreaker(iacDesign * 1.25);
  const groundAWG = selectGroundConductor(protAmps);

  // — Tierra del alimentador principal (tabla 250.102)
  const feedGround = selectGroundConductor(roundUpBreaker(iacDesign));

  // — Temperatura corregida por coefficients
  const tcVocPct  = panel.tcVoc  || -0.29;  // %/°C monocristalino N-type típico
  const tcPmaxPct = panel.tcPmax || -0.38;

  // Voc por string en la temperatura mínima (peor caso voltaje máximo)
  const Voc_string_cold = panel.voc
    ? panel.voc * ppss * (1 + (tcVocPct / 100) * (coldTempC - 25))
    : null;

  // Vmp por string en la temperatura máxima (peor caso MPPT mínimo)
  const Vmp_string_hot = panel.vmp
    ? panel.vmp * ppss * (1 + (tcPmaxPct / 100) * (hotTempC - 25))
    : null;

  const Vmp_string_stc = panel.vmp ? panel.vmp * ppss : null;

  const mppt_count  = inverter.mppt_count || 1;
  const ns_per_mppt = Math.ceil(ns / mppt_count);
  const vdc_max     = inverter.vdc_max || 1000;
  const vdc_min     = inverter.vdc_min || 200;

  const maxPpssAllowed = panel.voc ? Math.floor(vdc_max / panel.voc) : 'N/D';

  // — Validaciones de string
  const vocColdOk  = Voc_string_cold != null ? Voc_string_cold <= vdc_max : null;
  const vmpHotOk   = Vmp_string_hot  != null ? Vmp_string_hot  >= vdc_min : null;
  const vmpStcOk   = Vmp_string_stc  != null ? Vmp_string_stc  >= vdc_min && Vmp_string_stc <= vdc_max : null;

  // — Cobertura
  const cov    = results.cov || 0;
  const mp     = results.mp  || 0;
  const pr     = results.pr  || 0.78;
  const avgPsh = actKwp > 0 ? (mp / (actKwp * 30)).toFixed(2) : 'N/D';

  // — Producción mensual estimada con factores estacionales
  const monthlyProd = MONTHLY_FACTORS.map(f => Math.round(mp * f));
  const monthlyCons = Math.round(monthlyKwh);
  const annualProd  = monthlyProd.reduce((a, b) => a + b, 0);

  // — Tipo de medición CREG 038/2014
  let measurementPoint;
  if (invKwTotal < 5)        measurementPoint = 1;
  else if (invKwTotal < 100) measurementPoint = 2;
  else                       measurementPoint = 3;
  const isIndirectMeasure = invKwTotal > 25;

  // — Estudio de conexión CREG 174 Art. 12
  const requiresConnectionStudy = actKwp >= 100;

  // — Interruptor principal AC
  const mainBreaker = roundUpBreaker(iacDesign);

  // — DC/AC ratio
  const dcAcRatio = invKwTotal > 0 ? (actKwp / invKwTotal).toFixed(2) : 'N/D';

  // — Panel dimensions
  const panelDim = panel.length_m && panel.width_m
    ? `${(panel.length_m * 1000).toFixed(0)} × ${(panel.width_m * 1000).toFixed(0)} mm`
    : 'Según ficha técnica';
  const panelWeight = panel.length_m && panel.width_m
    ? Math.ceil(panel.length_m * panel.width_m * 12)
    : 25;

  // — Sistema trifásico o bifásico
  const gridType = gridVoltage >= 380 ? 'media' : 'baja';
  const phasesLabel = phases === 1 ? 'Monofásico' : 'Trifásico';

  // — Barraje del tablero
  const busbarAmps = Math.ceil(iac * 1.25 * 1.2);

  // — Corriente por MPPT
  const iscPerMppt = panel.isc
    ? (panel.isc * ns_per_mppt).toFixed(1)
    : 'Según diseño';

  // — Strings por inversor
  const stringsPerInv = Math.ceil(ns / numInv);

  // — GHI display
  const ghiDisplay = nasaGHI
    ? `${fmtN(nasaGHI, 0)} kWh/m²/año (NASA POWER)`
    : 'Ver mapa Solargis / PVGIS';

  // — systemType display
  const systemTypeLabel = systemType === 'on-grid' ? 'Conectado a la red (on-grid)'
    : systemType === 'hybrid'   ? 'Híbrido (con almacenamiento + red)'
    : 'Aislado (off-grid)';

  // — Fecha y pie del documento
  const docYear = new Date(date || Date.now()).getFullYear();

  // =========================================================================
  // CSS del documento
  // =========================================================================
  const css = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11pt;
      color: #111;
      background: #fff;
      line-height: 1.55;
    }
    /* ---- Header fijo por sección ---- */
    .doc-header {
      display: flex;
      align-items: stretch;
      border: 2px solid #01708B;
      margin-bottom: 18px;
      page-break-inside: avoid;
    }
    .doc-header .logo-cell {
      width: 120px;
      min-width: 120px;
      background: #01708B;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 10px;
      flex-direction: column;
      gap: 4px;
    }
    .doc-header .logo-cell .brand {
      color: #fff;
      font-size: 13pt;
      font-weight: 900;
      letter-spacing: 1px;
    }
    .doc-header .logo-cell .brand-sub {
      color: #FFD93D;
      font-size: 7pt;
      text-align: center;
      line-height: 1.3;
    }
    .doc-header .meta-cell {
      flex: 1;
      border-left: 2px solid #01708B;
      display: flex;
      flex-direction: column;
    }
    .doc-header .meta-row {
      display: flex;
      border-bottom: 1px solid #01708B;
    }
    .doc-header .meta-row:last-child { border-bottom: none; }
    .doc-header .meta-label {
      width: 130px;
      min-width: 130px;
      padding: 4px 8px;
      font-size: 8pt;
      font-weight: 700;
      color: #555;
      border-right: 1px solid #01708B;
      background: #f0f7fa;
      display: flex;
      align-items: center;
    }
    .doc-header .meta-value {
      flex: 1;
      padding: 4px 8px;
      font-size: 8.5pt;
      display: flex;
      align-items: center;
    }
    .doc-header .meta-value.bold { font-weight: 700; color: #01708B; }
    /* ---- Secciones ---- */
    .section { page-break-before: always; padding: 0; }
    .section:first-of-type { page-break-before: auto; }
    h1.doc-title {
      font-size: 20pt;
      font-weight: 900;
      color: #01708B;
      margin-bottom: 4px;
    }
    h2.section-title {
      font-size: 14pt;
      font-weight: 800;
      color: #FF8C00;
      border-left: 5px solid #FF8C00;
      padding-left: 12px;
      margin: 18px 0 10px;
      page-break-after: avoid;
    }
    h3.subsection-title {
      font-size: 11pt;
      font-weight: 700;
      color: #01708B;
      margin: 14px 0 7px;
      border-bottom: 1px solid #01708B44;
      padding-bottom: 3px;
      page-break-after: avoid;
    }
    h4.sub2-title {
      font-size: 10pt;
      font-weight: 700;
      color: #333;
      margin: 10px 0 5px;
      page-break-after: avoid;
    }
    /* ---- Tablas ---- */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0 14px;
      font-size: 9.5pt;
      page-break-inside: avoid;
    }
    th {
      background: #01708B;
      color: #fff;
      padding: 6px 9px;
      text-align: left;
      font-size: 9pt;
      font-weight: 700;
    }
    td {
      padding: 5px 9px;
      border-bottom: 1px solid #d0dde3;
      vertical-align: top;
    }
    tr.alt td { background: #f3f8fa; }
    td:first-child { font-weight: 600; color: #333; }
    /* ---- Portada ---- */
    .cover-page {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      padding: 60px 40px;
      page-break-after: always;
    }
    .cover-badge {
      background: #FF8C00;
      color: #fff;
      font-size: 8pt;
      font-weight: 700;
      letter-spacing: 2px;
      padding: 4px 14px;
      border-radius: 20px;
      text-transform: uppercase;
      margin-bottom: 16px;
    }
    .cover-title {
      font-size: 28pt;
      font-weight: 900;
      color: #01708B;
      margin-bottom: 6px;
      line-height: 1.15;
    }
    .cover-subtitle {
      font-size: 16pt;
      color: #FF8C00;
      font-weight: 700;
      margin-bottom: 30px;
    }
    .cover-meta {
      background: #f3f8fa;
      border: 2px solid #01708B;
      border-radius: 6px;
      padding: 20px 30px;
      text-align: left;
      min-width: 420px;
      max-width: 600px;
      margin-bottom: 24px;
    }
    .cover-meta table { margin: 0; }
    .cover-meta td { border: none; padding: 4px 8px; }
    .cover-meta td:first-child { color: #666; font-weight: 400; }
    .cover-rev-table {
      width: 100%;
      border: 1px solid #01708B;
      margin-top: 20px;
      font-size: 9pt;
    }
    .cover-rev-table th { background: #01708B; color: #fff; padding: 5px 8px; }
    .cover-rev-table td { padding: 5px 8px; border: 1px solid #ccc; }
    .cover-footer {
      margin-top: 20px;
      color: #666;
      font-size: 9pt;
      line-height: 1.8;
    }
    /* ---- Marca de agua / logo en portada ---- */
    .cover-logo-block {
      width: 90px;
      height: 90px;
      background: #01708B;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
    }
    .cover-logo-block span {
      font-size: 28pt;
      color: #FFD93D;
      font-weight: 900;
    }
    /* ---- Info boxes ---- */
    .infobox {
      background: #f0f7fa;
      border-left: 4px solid #01708B;
      padding: 10px 14px;
      margin: 10px 0 14px;
      font-size: 10pt;
      line-height: 1.6;
    }
    .warnbox {
      background: #fff8e1;
      border-left: 4px solid #FF8C00;
      padding: 10px 14px;
      margin: 10px 0 14px;
      font-size: 10pt;
      line-height: 1.6;
    }
    /* ---- Párrafos ---- */
    p { margin-bottom: 9px; font-size: 10.5pt; line-height: 1.65; text-align: justify; }
    ul, ol { margin: 6px 0 10px 22px; font-size: 10.5pt; line-height: 1.65; }
    li { margin-bottom: 4px; }
    /* ---- Firma ---- */
    .firma-block {
      display: flex;
      gap: 24px;
      justify-content: center;
      flex-wrap: wrap;
      margin-top: 40px;
      page-break-inside: avoid;
    }
    .firma-card {
      border: 1px solid #ccc;
      border-radius: 6px;
      padding: 18px 24px;
      min-width: 200px;
      text-align: center;
      background: #fafafa;
    }
    .firma-line {
      border-bottom: 1px solid #444;
      margin: 36px 12px 6px;
    }
    .firma-name  { font-weight: 700; font-size: 10pt; }
    .firma-role  { font-size: 9pt; color: #666; }
    /* ---- SVG del diagrama unifilar ---- */
    .unifilar-container {
      width: 100%;
      overflow-x: auto;
      margin: 10px 0 16px;
      border: 1px solid #ccc;
      padding: 8px;
      background: #fff;
    }
    .unifilar-container svg {
      max-width: 100%;
      height: auto;
    }
    /* ---- Producción mensual ---- */
    .bar-chart {
      display: flex;
      align-items: flex-end;
      gap: 6px;
      height: 120px;
      margin: 12px 0;
      border-bottom: 2px solid #ccc;
    }
    .bar-col {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
      gap: 3px;
    }
    .bar-col .bar-fill {
      width: 100%;
      background: linear-gradient(to top, #01708B, #4ecdc4);
      border-radius: 3px 3px 0 0;
    }
    .bar-col .bar-label {
      font-size: 7pt;
      color: #555;
      text-align: center;
      white-space: nowrap;
    }
    .bar-col .bar-val {
      font-size: 7pt;
      font-weight: 700;
      color: #01708B;
    }
    /* ---- Impresión ---- */
    @media print {
      body { font-size: 10pt; }
      .section { page-break-before: always; }
      .section:first-of-type { page-break-before: auto; }
      .cover-page { min-height: auto; }
      h2.section-title { page-break-after: avoid; }
      h3.subsection-title { page-break-after: avoid; }
      table { page-break-inside: avoid; }
      .firma-block { page-break-inside: avoid; }
    }
    @page {
      size: A4;
      margin: 18mm 15mm 18mm 20mm;
    }
  `;

  // =========================================================================
  // Header del documento (repetido en cada sección)
  // =========================================================================
  function header(titulo) {
    return `
    <div class="doc-header">
      <div class="logo-cell">
        <span class="brand">ALEBAS</span>
        <span class="brand-sub">Ingeniería SAS<br>NIT 901.992.450-5</span>
      </div>
      <div class="meta-cell">
        <div class="meta-row">
          <div class="meta-label">Documento</div>
          <div class="meta-value bold">MEMORIA TÉCNICA ELÉCTRICA</div>
        </div>
        <div class="meta-row">
          <div class="meta-label">Proyecto</div>
          <div class="meta-value">${client.company || client.name || 'Sistema Fotovoltaico'}</div>
        </div>
        <div class="meta-row">
          <div class="meta-label">Sección</div>
          <div class="meta-value">${titulo || ''}</div>
        </div>
        <div class="meta-row">
          <div class="meta-label">Revisión / Fecha</div>
          <div class="meta-value">Rev. ${revision} &nbsp;|&nbsp; ${dateShort} &nbsp;|&nbsp; ${city}, ${dept}</div>
        </div>
      </div>
    </div>`;
  }

  // =========================================================================
  // Sección 0 — Portada
  // =========================================================================
  const sPortada = `
  <div class="cover-page">
    <div class="cover-logo-block"><span>☀</span></div>
    <div class="cover-badge">AGPE · CREG 174/2021 · RETIE</div>
    <div class="cover-title">MEMORIA TÉCNICA</div>
    <div class="cover-subtitle">Diseño de Sistema Fotovoltaico</div>
    <div class="cover-meta">
      <table>
        <tr><td>Proyecto:</td><td><strong>${client.company || client.name || '—'}</strong></td></tr>
        <tr><td>Cliente:</td><td>${client.name || '—'}</td></tr>
        <tr><td>Ubicación:</td><td>${city}, ${dept}, Colombia</td></tr>
        <tr><td>Capacidad:</td><td><strong>${actKwp} kWp · ${numPanels} módulos</strong></td></tr>
        <tr><td>Tipo de sistema:</td><td>${systemTypeLabel}</td></tr>
      </table>
      <table class="cover-rev-table" style="margin-top:16px">
        <thead><tr><th>REV</th><th>Fecha</th><th>Descripción</th><th>Elaboró</th><th>Revisó</th><th>Aprobó</th></tr></thead>
        <tbody>
          <tr>
            <td style="text-align:center">${revision}</td>
            <td>${dateShort}</td>
            <td>Emisión Original</td>
            <td>ALEBAS</td>
            <td>ALEBAS</td>
            <td>ALEBAS</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="cover-footer">
      <strong>ALEBAS Ingeniería SAS</strong> — NIT 901.992.450-5<br>
      solar-hub.co &nbsp;·&nbsp; ing@alebas.co<br>
      Villavicencio, Meta, Colombia
    </div>
  </div>`;

  // =========================================================================
  // Tabla de Contenido
  // =========================================================================
  const sToc = `
  <div class="section">
    ${header('Tabla de Contenido')}
    <h2 class="section-title">Tabla de Contenido</h2>
    <table>
      <thead><tr><th>#</th><th>Sección</th><th style="width:80px;text-align:right">Pág.</th></tr></thead>
      <tbody>
        <tr><td>1</td><td>Resumen Ejecutivo</td><td style="text-align:right">3</td></tr>
        <tr class="alt"><td>2</td><td>Introducción</td><td style="text-align:right">4</td></tr>
        <tr><td>3</td><td>Localización del Proyecto</td><td style="text-align:right">5</td></tr>
        <tr class="alt"><td>4</td><td>Especificaciones Técnicas de Equipos y Materiales</td><td style="text-align:right">6</td></tr>
        <tr><td></td><td>&nbsp;&nbsp;4.1 Inversor(es)</td><td style="text-align:right">6</td></tr>
        <tr class="alt"><td></td><td>&nbsp;&nbsp;4.2 Módulos Fotovoltaicos</td><td style="text-align:right">9</td></tr>
        <tr><td></td><td>&nbsp;&nbsp;4.3 Conductor Solar DC</td><td style="text-align:right">12</td></tr>
        <tr class="alt"><td></td><td>&nbsp;&nbsp;4.4 Conductor AC (salida inversor)</td><td style="text-align:right">13</td></tr>
        <tr><td></td><td>&nbsp;&nbsp;4.5 Tableros de Baja Tensión</td><td style="text-align:right">14</td></tr>
        <tr class="alt"><td>5</td><td>Dimensionamiento del Cableado y Canalizaciones</td><td style="text-align:right">15</td></tr>
        <tr><td>6</td><td>Requisitos para el Sistema de Puesta a Tierra</td><td style="text-align:right">17</td></tr>
        <tr class="alt"><td>7</td><td>Requisitos CREG 174/2021 para Conexión AGPE</td><td style="text-align:right">19</td></tr>
        <tr><td></td><td>&nbsp;&nbsp;7.1 Estudio de Conexión Simplificado</td><td style="text-align:right">19</td></tr>
        <tr class="alt"><td></td><td>&nbsp;&nbsp;7.2 Acuerdo de Protecciones (CNO 1862/2024)</td><td style="text-align:right">20</td></tr>
        <tr><td></td><td>&nbsp;&nbsp;7.3 Sistema de Medida (CREG 038/2014)</td><td style="text-align:right">22</td></tr>
        <tr class="alt"><td>8</td><td>Dimensionamiento del Sistema Fotovoltaico</td><td style="text-align:right">23</td></tr>
        <tr><td></td><td>&nbsp;&nbsp;8.1 Consumo base del proyecto</td><td style="text-align:right">23</td></tr>
        <tr class="alt"><td></td><td>&nbsp;&nbsp;8.2 Dimensionamiento del sistema</td><td style="text-align:right">24</td></tr>
        <tr><td></td><td>&nbsp;&nbsp;8.3 Validación del string (Tabla de verificación)</td><td style="text-align:right">25</td></tr>
        <tr class="alt"><td></td><td>&nbsp;&nbsp;8.4 Producción energética estimada</td><td style="text-align:right">26</td></tr>
        <tr><td></td><td>&nbsp;&nbsp;8.5 Ajustes de protección recomendados</td><td style="text-align:right">27</td></tr>
        <tr class="alt"><td>9</td><td>Declaración y Firma</td><td style="text-align:right">28</td></tr>
      </tbody>
    </table>
  </div>`;

  // =========================================================================
  // Sección 1 — Resumen Ejecutivo
  // =========================================================================
  const sResumen = `
  <div class="section">
    ${header('1. Resumen Ejecutivo')}
    <h2 class="section-title">1. Resumen Ejecutivo</h2>
    <p>
      El presente documento constituye la Memoria Técnica Eléctrica del sistema fotovoltaico
      del proyecto <strong>${client.company || client.name || 'indicado'}</strong>, ubicado en
      ${city}, ${dept}, Colombia. El sistema ha sido diseñado conforme a los requisitos técnicos
      del RETIE, NTC 2050, CREG 174/2021 y el Acuerdo CNO 1862/2024.
    </p>
    <h3 class="subsection-title">Parámetros principales del sistema</h3>
    ${tbl([
      ['Capacidad instalada DC', `<strong>${actKwp} kWp</strong>`],
      ['Potencia AC total', `${invKwTotal.toFixed(1)} kW`],
      ['Tecnología de módulo', 'Silicio monocristalino N-type (Bifacial)'],
      ['Tipo de sistema', `AGPE — ${systemTypeLabel}`],
      ['Cantidad de módulos FV', `${numPanels} ud.`],
      ['Módulo FV seleccionado', `${panel.brand || 'N/D'} ${panel.model || ''} (${panel.wp || 'N/D'} Wp)`],
      ['Cantidad de inversores', `${numInv} ud.`],
      ['Inversor seleccionado', `${inverter.brand || 'N/D'} ${inverter.model || ''} (${invKw} kW)`],
      ['Configuración de strings', `${ns} string(s) × ${ppss} módulos/string`],
      ['Producción mensual estimada', `${mp.toLocaleString('es-CO')} kWh/mes`],
      ['Producción anual estimada', `${annualProd.toLocaleString('es-CO')} kWh/año`],
      ['Cobertura del consumo declarado', `${cov}%`],
      ['Irradiación GHI del sitio', ghiDisplay],
      ['Performance Ratio (PR)', `${(pr * 100).toFixed(0)}%`],
    ])}
    <div class="infobox">
      El sistema ${systemType !== 'off-grid' ? 'se conectará a la red de distribución de ' + gridType + ' tensión existente y contará con medición bidireccional conforme a CREG 038/2014' : 'opera en modo aislado (off-grid), sin conexión al SIN'}. La instalación deberá ser ejecutada por un profesional habilitado ante el COPNIA y firmada con la correspondiente matrícula profesional.
    </div>
  </div>`;

  // =========================================================================
  // Sección 2 — Introducción
  // =========================================================================
  const sIntro = `
  <div class="section">
    ${header('2. Introducción')}
    <h2 class="section-title">2. Introducción</h2>
    <p>
      Las presentes especificaciones técnicas comprenden los lineamientos principales y características
      técnicas, constructivas, eléctricas y funcionales que se deben cumplir en el diseño, fabricación
      y ensayos de los materiales correspondientes al sistema solar fotovoltaico para el proyecto objeto
      de este documento, ubicado en el municipio de <strong>${city}</strong>, en el departamento de
      <strong>${dept}</strong>, Colombia.
    </p>
    <p>
      La instalación fotovoltaica será del tipo <strong>AGPE (Autogeneración a Pequeña Escala)</strong>.
      Se conectará a la red de <strong>${gridType} tensión</strong> existente del Operador de Red (OR)
      competente en la zona, operando bajo el marco regulatorio de la Resolución CREG 174 de 2021.
    </p>
    <p>
      El objetivo del sistema es suplir parcial o totalmente el consumo eléctrico del proyecto,
      reduciendo la demanda de energía proveniente de la red, con la posibilidad de
      ${systemType !== 'off-grid' ? 'inyectar excedentes a la red conforme al Contrato de Condiciones Uniformes (CCU) y la Resolución CREG 135/2021' : 'operar de forma completamente autónoma sin inyección a la red'}.
    </p>
    <h3 class="subsection-title">Marco normativo de referencia</h3>
    ${tbl2([
      ['RETIE', 'Reglamento Técnico de Instalaciones Eléctricas — Resolución MinMinas 90708/2013'],
      ['NTC 2050', 'Código Eléctrico Colombiano — Sección 690 (Sistemas Solares Fotovoltaicos)'],
      ['CREG 174/2021', 'Autogeneración a Pequeña Escala y Generación Distribuida en el SIN'],
      ['CREG 135/2021', 'Contrato de condiciones uniformes — Entrega de excedentes AGPE'],
      ['CREG 038/2014', 'Código de Medida del SIN'],
      ['CNO 1862/2024', 'Protecciones para recursos de generación distribuida conectados al SDL'],
      ['IEC 61215', 'Módulos FV — Cualificación de diseño y homologación'],
      ['IEC 61730', 'Módulos FV — Cualificación de seguridad'],
      ['IEC 62109-1/2', 'Seguridad de convertidores FV'],
      ['IEC 62116', 'Prueba de modo anti-isla para inversores FV'],
      ['IEEE 1547', 'Standard for Interconnection of Distributed Energy Resources'],
      ['UL 1741', 'Standard for Inverters, Converters, Controllers'],
      ['Ley 1715/2014', 'Régimen para la integración de energías renovables no convencionales'],
    ], ['Norma', 'Descripción'])}
  </div>`;

  // =========================================================================
  // Sección 3 — Localización
  // =========================================================================
  const sLoc = `
  <div class="section">
    ${header('3. Localización del Proyecto')}
    <h2 class="section-title">3. Localización del Proyecto</h2>
    ${tbl([
      ['País', 'Colombia'],
      ['Departamento', dept || 'N/D'],
      ['Municipio', city || 'N/D'],
      ['Dirección', client.address || location.address || 'A confirmar en visita técnica'],
      ['Latitud', location.lat != null ? `${location.lat}°` : 'N/D'],
      ['Longitud', location.lon != null ? `${location.lon}°` : 'N/D'],
      ['Zona climática IDEAM', climate.zone],
      ['Altitud estimada', `${climate.altMsnm.toLocaleString('es-CO')} m.s.n.m.`],
      ['Temperatura máxima de diseño', `${climate.tempMax}°C`],
      ['Temperatura mínima de diseño', `${climate.tempMin}°C`],
      ['Temperatura máxima de celda (diseño)', `${hotTempC}°C (condiciones NOCT + irradiancia máxima)`],
      ['Temperatura mínima de celda (diseño)', `${coldTempC}°C (amanecer / madrugada invierno)`],
      ['Irradiación GHI del sitio', ghiDisplay],
    ])}
    <p>
      Según la zonificación climática del IDEAM, el municipio de <strong>${city}</strong>
      corresponde a la zona <strong>${climate.zone}</strong>. Las temperaturas de diseño de la celda
      fotovoltaica (${coldTempC}°C mínima / ${hotTempC}°C máxima) han sido derivadas de datos
      ${nasaGHI ? 'NASA POWER para la ubicación del proyecto' : 'históricos IDEAM para la zona climática'}.
      Estas temperaturas son determinantes para la validación del rango de tensión de operación del string
      (ver Sección 8.3).
    </p>
    <div class="infobox">
      <strong>Nota RETIE Art. 6:</strong> Toda instalación fotovoltaica en Colombia debe clasificarse
      según la zona climática para la selección correcta de conductores, protecciones y equipos. La
      zona ${climate.zone} corresponde a temperaturas ambiente de diseño de ${climate.tempMin}°C a ${climate.tempMax}°C.
    </div>
  </div>`;

  // =========================================================================
  // Sección 4 — Especificaciones técnicas
  // =========================================================================

  // 4.1 Inversor
  const s41 = `
    ${header('4.1 Especificación Técnica — Inversor')}
    <h2 class="section-title">4. Especificaciones Técnicas de Equipos y Materiales</h2>
    <h3 class="subsection-title">4.1 Especificación técnica — Inversor(es)</h3>
    <p>
      El inversor (o microinversor / inversor de string) es el corazón del sistema AGPE. Convierte
      la corriente continua (DC) generada por los módulos fotovoltaicos en corriente alterna (AC)
      sincronizada con la red de distribución. Para este proyecto se especifican
      <strong>${numInv} inversor${numInv > 1 ? 'es' : ''} de ${invKw} kW</strong> (potencia AC total: ${invKwTotal.toFixed(1)} kW).
    </p>
    <h4 class="sub2-title">Normativa aplicable</h4>
    ${tbl2([
      ['RETIE', 'Reglamento Técnico de Instalaciones Eléctricas — Resolución 90708 de 2013'],
      ['NTC 2050', 'Código Eléctrico Colombiano Sección 690'],
      ['CREG 174/2021', 'Autogeneración a pequeña escala y GD en el SIN'],
      ['IEC/EN 62109-1', 'Seguridad de convertidores FV — Parte 1: Requisitos generales'],
      ['IEC/EN 62109-2', 'Seguridad de convertidores FV — Parte 2: Inversores'],
      ['IEC 62116', 'Prueba de modo anti-isla para inversores FV en la red'],
      ['IEEE 1547', 'Standard for Interconnection and Interoperability of DER'],
      ['UL 1741', 'Standard for Inverters, Converters, Controllers and Interconnection System Equipment'],
    ], ['Norma', 'Título'])}
    <h4 class="sub2-title">Características DC de entrada (requisitos mínimos)</h4>
    ${tbl2([
      ['Voltaje máximo de entrada (Vmax)', `≥ ${Voc_string_cold ? Voc_string_cold.toFixed(1) : (vdc_max)} V`],
      ['Rango de voltaje MPPT', `${vdc_min} – ${vdc_max} V`],
      ['Cantidad de entradas MPPT', `≥ ${Math.ceil(ns / 2)}`],
      ['Corriente máxima de entrada por MPPT', `≥ ${iscPerMppt} A`],
      ['Corriente de cortocircuito máxima (Isc)', panel.isc ? `≥ ${(panel.isc * 1.25).toFixed(1)} A por MPPT` : 'Según diseño de string'],
      ['Protección de polaridad inversa', 'Incorporada'],
      ['Tipo de aislamiento DC/AC', 'Transformador o topología sans-transformador con aislamiento galvánico'],
    ], ['Característica', 'Valor requerido'])}
    <h4 class="sub2-title">Protecciones mínimas — CNO 1862/2024</h4>
    <ul>
      <li><strong>Sobretensión (ANSI 59)</strong> — ajustable. Disparo si V &gt; 1.1 pu (2.0 s) o V &gt; 1.2 pu (0.16 s instantáneo).</li>
      <li><strong>Subtensión (ANSI 27)</strong> — ajustable. Disparo si V &lt; 0.88 pu en 2.0 s.</li>
      <li><strong>Sobrepotencia adelante (ANSI 32)</strong> — control de excedentes a la red.</li>
      <li><strong>Sobrecorriente (ANSI 50/51)</strong> — protección de cortocircuito, coordinar con OR.</li>
      <li><strong>Modo anti-isla (IEC 62116)</strong> — activo o pasivo (ROCOF/ROCOV). Tiempo máximo 2.0 s.</li>
      <li><strong>Sobrefrecuencia (ANSI 81O)</strong> — disparo si f &gt; 60.5 Hz en 0.5 s.</li>
      <li><strong>Subfrecuencia (ANSI 81U)</strong> — disparo si f &lt; 59.3 Hz en 0.5 s.</li>
      <li><strong>Verificación de sincronismo (ANSI 25)</strong> — reconexión automática tras restauración de red.</li>
    </ul>
    <h4 class="sub2-title">Características AC de salida</h4>
    ${tbl2([
      ['Potencia nominal AC', `${invKw} kW`],
      ['Potencia total AC (${numInv} inversores)', `${invKwTotal.toFixed(1)} kW`],
      ['Tensión nominal de salida', `${gridVoltage} V`],
      ['Fases', phasesLabel],
      ['Frecuencia nominal', '60 Hz'],
      ['THD (Distorsión Harmónica Total)', '&lt; 3%'],
      ['Factor de potencia', '0.8 inductivo – 0.8 capacitivo'],
      ['Eficiencia máxima', '≥ 97%'],
      ['Eficiencia CEC / EURO', '≥ 96.5%'],
    ], ['Característica', 'Valor'])}
    <h4 class="sub2-title">Certificaciones mínimas requeridas</h4>
    <p>IEC 62109-1, IEC 62109-2, IEC 62116, IEEE 1547, UL 1741. Para conexión al SDL colombiano
    se requiere certificado de conformidad según RETIE Art. 6 y certificación ante el OR.</p>
    <div class="infobox">
      <strong>Nota CNO 1862/2024:</strong> Para sistemas basados en inversores con certificación UL 1741 SA
      o IEC 62109, las funciones de protección del punto 7.2 pueden estar integradas en el propio inversor,
      siempre que se cuente con el certificado de conformidad debidamente expedido.
    </div>`;

  // 4.2 Módulos FV
  const s42 = `
    <h3 class="subsection-title">4.2 Especificación técnica — Módulos Fotovoltaicos</h3>
    <p>
      Los módulos fotovoltaicos seleccionados para este proyecto son
      <strong>${panel.brand || 'N/D'} ${panel.model || ''} de ${panel.wp || 'N/D'} Wp</strong>.
      A continuación se presentan las características mínimas requeridas para garantizar la
      compatibilidad con el inversor y el cumplimiento del RETIE y la NTC 2050.
    </p>
    <h4 class="sub2-title">Normativa aplicable</h4>
    ${tbl2([
      ['RETIE', 'Resolución MinMinas 90708 de 2013'],
      ['NTC 2050', 'Código Eléctrico Colombiano §690'],
      ['IEC 61215', 'Módulos FV — cualificación de diseño y homologación'],
      ['IEC 61730-1/2', 'Módulos FV — cualificación de seguridad'],
      ['IEC 61853', 'Módulos FV — medición de rendimiento (caracterización de matrices)'],
      ['IEC 60068', 'Pruebas de ambiente (thermal cycling, damp heat, humidity-freeze)'],
    ], ['Norma', 'Descripción'])}
    <h4 class="sub2-title">Tabla de requisitos técnicos del módulo FV</h4>
    ${tbl2([
      ['PARÁMETROS MECÁNICOS', ''],
      ['Tecnología de celda', 'Monocristalino N-type (recomendado bifacial)'],
      ['Calibre conductor de salida', '4 mm² (cable FV certificado IEC 62930)'],
      ['Tipo de conector', 'MC4 o compatible, IP67, UL 6703 / IEC 62852'],
      ['Vidrio frontal', 'Vidrio templado antireflectivo ≥ 3.2 mm'],
      ['Marco', 'Aleación de aluminio anodizado, resistente a la corrosión'],
      ['Peso máximo', `≤ ${panelWeight} kg`],
      ['Dimensiones aproximadas', panelDim],
      ['CARACTERÍSTICAS ELÉCTRICAS (CEM/STC: 1000 W/m², 25°C, AM 1.5)', ''],
      ['Potencia mínima (Pmax)', `≥ ${panel.wp || 'N/D'} Wp`],
      ['Voltaje circuito abierto (Voc)', `${panel.voc != null ? panel.voc + ' V' : 'Según datasheet'}`],
      ['Corriente cortocircuito (Isc)', `${panel.isc != null ? panel.isc + ' A' : 'Según datasheet'}`],
      ['Voltaje máxima potencia (Vmp)', `${panel.vmp != null ? panel.vmp + ' V' : 'Según datasheet'}`],
      ['Eficiencia del módulo', '≥ 20%'],
      ['Coeficiente temperatura Voc', `${tcVocPct} %/°C`],
      ['Coeficiente temperatura Pmax', `${tcPmaxPct} %/°C`],
      ['PARÁMETROS OPERACIONALES', ''],
      ['Temperatura de operación normal (NOCT)', '±45°C'],
      ['Rango de temperatura de operación', '-40°C a 85°C'],
      ['Tolerancia de potencia', '0 a +3% (positiva)'],
      ['Máxima tensión del sistema', `≥ ${vdc_max} V`],
      ['Degradación máxima anual', '≤ 0.5%/año (IEC 61215)'],
      ['CARGAS MECÁNICAS', ''],
      ['Carga frontal máxima (viento/nieve)', '≥ 5.400 Pa'],
      ['Carga trasera máxima', '≥ 2.400 Pa'],
      ['Prueba de granizo', '25 mm a 23 m/s (IEC 61215 MQT 17)'],
      ['GARANTÍAS MÍNIMAS', ''],
      ['Garantía de producto (fabricación)', '≥ 12 años'],
      ['Garantía de potencia año 1', '≤ 2.5% de pérdida'],
      ['Garantía lineal de potencia', '≤ 0.5%/año, mínimo 80.7% en año 25'],
    ], ['Característica', 'Valor aceptado'])}`;

  // 4.3 Conductor DC
  const s43 = `
    <h3 class="subsection-title">4.3 Especificación técnica — Conductor Solar DC</h3>
    <p>
      Los conductores del campo fotovoltaico (DC) estarán expuestos permanentemente a la
      radiación solar UV, temperatura extrema y humedad. Se debe utilizar cable fotovoltaico
      certificado específicamente para aplicaciones FV (IEC 62930 / TÜV 2PfG 1169).
    </p>
    <h4 class="sub2-title">Normativa: RETIE, NTC 2050 §690, IEC 60228, IEC 62930</h4>
    ${tbl2([
      ['Tipo', 'Cable fotovoltaico (FV) bipolar, aislamiento solar reforzado'],
      ['Tensión de servicio', `≤ ${vdc_max} V DC`],
      ['Temperatura máxima de operación del conductor', '90°C conductor; 120°C pico'],
      ['Temperatura máxima de la cubierta', '105°C'],
      ['Protección UV', 'Sí (cubierta XLPE o equivalente resistente a UV)'],
      ['Resistencia a la intemperie', 'Sí (clase IP67 para conectores MC4)'],
      ['Cumplimiento', 'IEC 62930:2017 / EN 50618 / TÜV 2PfG 1169/08.2007'],
    ], ['Característica', 'Valor'])}
    <h4 class="sub2-title">Cálculo de corriente de diseño DC (NTC 2050 §690.8)</h4>
    ${tbl2([
      ['Corriente de cortocircuito del módulo (Isc)', `${panel.isc != null ? panel.isc + ' A' : 'N/D'}`],
      ['Factor de diseño NTC 2050 §690.8(A) (corriente continua)', '1.25'],
      ['Factor de terminales §690.8(A) (ambiente ≥ 33°C en cables en contacto)', '1.25'],
      ['Corriente de diseño DC: I_d = 1.25 × 1.25 × Isc', iDesignDC != null ? `${iDesignDC.toFixed(2)} A` : 'N/D (requiere datasheet panel)'],
      ['Sección de cable seleccionada (cable FV)', dcCable.section],
      ['Equivalente AWG aproximado', dcCable.awg],
      ['Ampacidad del cable seleccionado', dcCable.ampacity ? `${dcCable.ampacity} A` : dcCable.note || 'Ver fabricante'],
    ], ['Parámetro', 'Valor'])}
    <div class="${iDesignDC && iDesignDC <= (dcCable.ampacity || 999) ? 'infobox' : 'warnbox'}">
      ${iDesignDC
        ? `La corriente de diseño DC de <strong>${iDesignDC.toFixed(2)} A</strong> es ${iDesignDC <= (dcCable.ampacity || 999) ? 'menor' : 'mayor'} que la ampacidad del cable ${dcCable.section} seleccionado (${dcCable.ampacity || '?'} A). ${iDesignDC <= (dcCable.ampacity || 999) ? 'El conductor es adecuado.' : 'Se debe seleccionar una sección mayor.'}`
        : 'La Isc del módulo no está disponible en el catálogo. Se debe verificar la sección del conductor con el datasheet oficial del fabricante.'
      }
    </div>`;

  // 4.4 Conductor AC
  const s44 = `
    <h3 class="subsection-title">4.4 Especificación técnica — Conductor AC (Salida Inversor)</h3>
    <p>
      El conductor AC conecta la salida del inversor al tablero de distribución / punto de conexión
      con la red. Debe dimensionarse según la corriente nominal de la instalación con el factor de
      diseño requerido por NEC 210.19 para cargas continuas.
    </p>
    <h4 class="sub2-title">Normativa: RETIE, NTC 2050, IEC 60228, NTC 1099</h4>
    <h4 class="sub2-title">Cálculo de corriente de diseño AC</h4>
    ${tbl2([
      ['Potencia AC total de inversores', `${invKwTotal.toFixed(1)} kW`],
      ['Tensión nominal de salida', `${gridVoltage} V`],
      ['Tipo de conexión', phasesLabel],
      ['Factor de potencia asumido', '0.9'],
      ['Corriente de plena carga AC (Iplc)', `${iac.toFixed(2)} A`],
      ['Factor de diseño NEC 210.19 (cargas continuas)', '1.25'],
      ['Corriente de diseño AC: I_d = 1.25 × Iplc', `${iacDesign.toFixed(2)} A`],
      ['Calibre seleccionado (NTC 2050 Tabla 310.15(B)(16))', `${acCableLabel} Cu`],
      ['Ampacidad del calibre seleccionado', `${acCable.ampacity} A`],
      ['Tipo de aislamiento requerido', 'THWN-2 (600 V, 90°C, RETIE certificado)'],
      ['Número de conductores', phases === 1 ? '2 + tierra (1F + N + T)' : '3 + neutro + tierra (3F + N + T)'],
    ], ['Parámetro', 'Valor'])}
    <div class="${iacDesign <= acCable.ampacity ? 'infobox' : 'warnbox'}">
      La corriente de diseño AC de <strong>${iacDesign.toFixed(2)} A</strong> es
      ${iacDesign <= acCable.ampacity ? 'menor o igual' : 'mayor'} que la ampacidad del calibre
      ${acCableLabel} (${acCable.ampacity} A). ${iacDesign <= acCable.ampacity
        ? 'El conductor es adecuado conforme NTC 2050.'
        : 'Se debe seleccionar un calibre de mayor sección.'}
    </div>`;

  // 4.5 Tableros BT
  const s45 = `
    <h3 class="subsection-title">4.5 Especificación técnica — Tableros de Baja Tensión</h3>
    <p>
      Se requiere un tablero de protecciones AC en el punto de conexión del sistema fotovoltaico
      con la instalación existente. Conforme a RETIE y NTC 2050, este tablero debe cumplir los
      siguientes requisitos mínimos.
    </p>
    <h4 class="sub2-title">Normativa: RETIE, NTC 2050, IEC 61439-1</h4>
    ${tbl2([
      ['Tensión de operación', `${gridVoltage} V`],
      ['Tensión de aislamiento', '0.6 kV'],
      ['Corriente nominal de barrajes', `≥ ${busbarAmps} A`],
      ['Grado de protección (interior)', 'IP20 mínimo (IEC 60529)'],
      ['Grado de protección (exterior / intemperie)', 'IP66 mínimo (IEC 60529)'],
      ['Certificación requerida', 'RETIE — certificado de conformidad de producto'],
      ['Material de la carcasa', 'Acero galvanizado o resina termoplástica (NEMA 4X)'],
      ['Interruptor principal de corte AC', `${mainBreaker} A — ${phasesLabel}`],
      ['Protección diferencial (RCD)', '30 mA tipo A o tipo B según IEC 62423'],
    ], ['Característica', 'Valor'])}
    <div class="infobox">
      <strong>Nota RETIE Art. 6.9:</strong> El tablero de conexión del sistema fotovoltaico debe incluir
      un medio de desconexión AC de acción rápida, accesible para el operador de red, ubicado en el
      punto de conexión o lo más cercano posible a este.
    </div>`;

  const sEspec = `
  <div class="section">
    ${s41}
    ${s42}
    ${s43}
    ${s44}
    ${s45}
  </div>`;

  // =========================================================================
  // Sección 5 — Cableado y canalizaciones
  // =========================================================================
  const sCableado = `
  <div class="section">
    ${header('5. Dimensionamiento del Cableado y Canalizaciones')}
    <h2 class="section-title">5. Dimensionamiento del Cableado y Canalizaciones</h2>
    <h3 class="subsection-title">5.1 Criterios de selección del conductor eléctrico</h3>
    <p>La selección del conductor eléctrico debe atender los siguientes criterios en orden de prioridad:</p>
    <ol>
      <li><strong>Capacidad de corriente (ampacidad)</strong> — el conductor debe tener una ampacidad igual o mayor
          a la corriente de diseño (NTC 2050 §310.15). Para el sistema FV se aplican los factores de la Sección 4.3 y 4.4.</li>
      <li><strong>Caída de tensión máxima admisible</strong> — máximo 1% en cada rama DC (string),
          máximo 2% en el tramo AC inversor–tablero (RETIE Art. 6.4.1).</li>
      <li><strong>Temperatura máxima de aislamiento</strong> — verificar compatibilidad con la temperatura
          de operación de los módulos y el ambiente de instalación.</li>
    </ol>
    <h4 class="sub2-title">Factores de corrección de ampacidad (NTC 2050 §310.15(B))</h4>
    ${tbl2([
      ['Por temperatura ambiente (> 30°C)', 'Factor 0.91 para aislamiento THWN-2 90°C'],
      ['Por agrupación (> 3 conductores en conduit)', 'Factor 0.70 para 4-6; 0.50 para 7-9 conductores'],
      ['Por resistividad del terreno (si enterrado)', 'Ver NTC 2050 §310.15(B)(3)(c)'],
    ], ['Factor', 'Valor'])}
    <h4 class="sub2-title">Tabla de ampacidad de referencia (NTC 2050 §310.15(B)(16)) — Cu THWN-2 90°C, 30°C ambiente</h4>
    ${tbl2([
      ['#14 AWG', '25 A'], ['#12 AWG', '30 A'], ['#10 AWG', '40 A'],
      ['#8 AWG', '55 A'],  ['#6 AWG', '75 A'],  ['#4 AWG', '95 A'],
      ['#3 AWG', '110 A'], ['#2 AWG', '130 A'], ['#1 AWG', '150 A'],
      ['#1/0 AWG', '175 A'], ['#2/0 AWG', '200 A'], ['#3/0 AWG', '230 A'],
      ['#4/0 AWG', '260 A'], ['250 kcmil', '290 A'], ['300 kcmil', '320 A'],
      ['350 kcmil', '350 A'], ['400 kcmil', '380 A'], ['500 kcmil', '430 A'],
    ], ['Calibre', 'Ampacidad'])}
    <h3 class="subsection-title">5.2 Criterios para conduit / canalización</h3>
    <p>Las canalizaciones eléctricas deben cumplir los límites de ocupación de la NTC 2050 Apéndice C:</p>
    ${tbl2([
      ['1 conductor en conduit', '53% de la sección interna'],
      ['2 conductores en conduit', '31% de la sección interna'],
      ['3 o más conductores en conduit', '40% de la sección interna'],
    ], ['Condición', 'Ocupación máxima'])}
    <p>
      Para la instalación fotovoltaica se recomienda conduit EMT o PVC schedule 40 en interiores,
      y conduit PVC schedule 80 o conduit rígido metálico galvanizado (IMC/RMC) en exteriores a la
      intemperie. Los cables DC en exteriores deben ir canalizados para protección mecánica
      (NTC 2050 §690.31).
    </p>
    <div class="infobox">
      <strong>NTC 2050 §690.31(B):</strong> En instalaciones fotovoltaicas, el cable de campo (string)
      puede instalarse al aire libre sin canalización si el cable es tipo FV (IEC 62930) con resistencia
      UV certificada. En casos de tránsito mecánico o partes accesibles a personas, se requiere protección
      mediante conduit o bandeja portacables.
    </div>
  </div>`;

  // =========================================================================
  // Sección 6 — Puesta a tierra
  // =========================================================================
  const sPAT = `
  <div class="section">
    ${header('6. Sistema de Puesta a Tierra')}
    <h2 class="section-title">6. Requisitos para el Sistema de Puesta a Tierra</h2>
    <p>
      Todo sistema de generación fotovoltaico debe contar con un adecuado sistema de puesta a tierra
      conforme a los Artículos 15 y 16 del RETIE y la Sección 250 de la NTC 2050. La puesta a tierra
      es fundamental para garantizar la seguridad de las personas, proteger los equipos y asegurar el
      funcionamiento correcto de las protecciones eléctricas.
    </p>
    <h3 class="subsection-title">6.1 Conductor de puesta a tierra del equipo (inversor)</h3>
    <p>El calibre del conductor de tierra del equipo se selecciona según la Tabla 250.122 de la NTC 2050,
    en función de la protección máxima del circuito de alimentación:</p>
    ${tbl2([
      ['Corriente de protección del inversor (breaker AC)', `${protAmps} A`],
      ['Calibre tierra de equipo (inversor) — Tabla 250.122 NTC 2050', groundAWG],
      ['Calibre tierra estructuras metálicas (soporte de paneles)', groundAWG],
      ['Calibre tierra del alimentador principal', feedGround],
    ], ['Parámetro', 'Valor'])}
    <h3 class="subsection-title">6.2 Sistema de electrodos de puesta a tierra</h3>
    <p>
      Se requiere instalar un sistema de electrodos de puesta a tierra conforme a la NTC 2050 §250.53.
      El sistema preferido es una varilla de puesta a tierra tipo copperweld (acero recubierto en cobre)
      de <strong>5/8" × 2.4 m mínimo</strong>, hincada verticalmente en el suelo.
    </p>
    ${tbl2([
      ['Tipo de electrodo preferido', 'Varilla copperweld 5/8" × 2.4 m (NTC 2050 §250.52(A)(5))'],
      ['Resistencia máxima admisible', '≤ 25 Ω (NTC 2050 §250.53(A)(2))'],
      ['Resistencia requerida en zonas con alta exposición a rayos', '≤ 5 Ω (RETIE Art. 15)'],
      ['Conductor de unión a electrodo', 'Cu desnudo o con aislamiento verde, calibre según §250.66'],
      ['Método de conexión', 'Conector de compresión exotérmica (Cadweld) o mecánico listado'],
    ], ['Parámetro', 'Especificación'])}
    <p>
      Si la resistencia de puesta a tierra medida supera los 25 Ω, se instalarán electrodos adicionales
      (varillas en paralelo, separadas mínimo 2.4 m entre sí) o se mejorará el suelo con tratamiento
      químico (bentonita, sales conductoras) conforme a NTC 2050 §250.53(A)(3).
    </p>
    <h3 class="subsection-title">6.3 Puesta a tierra del campo FV (NTC 2050 §690.47)</h3>
    <p>
      Las estructuras metálicas de soporte de los módulos fotovoltaicos deben estar eléctricamente
      unidas y conectadas al sistema de puesta a tierra del equipo. Se requiere:
    </p>
    <ul>
      <li>Unión de cada segmento de estructura con conductor de tierra (${groundAWG}).</li>
      <li>Conexión a tierra del lado negativo del sistema DC si es requerido por diseño (§690.41).</li>
      <li>Verificación de continuidad del circuito de tierra mediante medición de resistencia
          con mili-ohmímetro antes de la puesta en marcha.</li>
    </ul>
    <div class="infobox">
      <strong>RETIE Art. 16.3:</strong> Toda instalación eléctrica expuesta a la intemperie debe tener
      protección contra rayos conforme a NTC 4552. Para sistemas fotovoltaicos en zonas de alta
      ceraúnica (isoceráunica &gt; 60 días/año), se debe realizar un análisis de riesgo de rayos
      conforme a IEC 62305-2.
    </div>
  </div>`;

  // =========================================================================
  // Sección 7 — Requisitos CREG 174/2021
  // =========================================================================
  const sCREG = `
  <div class="section">
    ${header('7. Requisitos CREG 174/2021 — Conexión AGPE')}
    <h2 class="section-title">7. Requisitos CREG 174/2021 para Conexión AGPE</h2>
    <h3 class="subsection-title">7.1 Estudio de conexión simplificado</h3>
    ${requiresConnectionStudy
      ? `<div class="warnbox">
          <strong>Estudio de conexión REQUERIDO.</strong><br>
          Conforme al Artículo 12 de la Resolución CREG 174 de 2021, el estudio de conexión simplificado
          es <strong>requerido</strong> dado que la capacidad instalada es de <strong>${actKwp} kWp
          (≥ 100 kW)</strong>. El estudio debe ser presentado al OR de ${dept} antes del inicio de obras.
         </div>
         <p>El estudio de conexión simplificado debe contener, como mínimo:</p>
         <ul>
           <li>Resumen ejecutivo del proyecto</li>
           <li>Descripción y ubicación del proyecto fotovoltaico</li>
           <li>Parámetros eléctricos de los equipos (diagramas unifilares DC y AC)</li>
           <li>Modelación de la zona de influencia (suministrada por el OR)</li>
           <li>Horizonte de análisis: año de entrada t y año t+x</li>
           <li>Demanda horaria (curvas de carga) del proyecto</li>
           <li>Escenario de máxima generación y mínima demanda</li>
           <li>Escenario de máxima generación y máxima demanda</li>
           <li>Perfiles de tensión y nivel de carga en líneas y transformadores</li>
           <li>Contribución a corriente de cortocircuito</li>
           <li>Análisis de pérdidas técnicas</li>
         </ul>`
      : `<div class="infobox">
          <strong>Estudio de conexión NO requerido.</strong><br>
          Conforme al Artículo 12 de la Resolución CREG 174 de 2021, el proyecto
          <strong>no requiere</strong> estudio de conexión simplificado dado que la capacidad instalada
          es de <strong>${actKwp} kWp (&lt; 100 kW)</strong>. Se debe tramitar la solicitud de
          conexión directamente ante el OR del departamento de ${dept}.
         </div>`
    }
    <h3 class="subsection-title">7.2 Acuerdo de protecciones (CNO 1862/2024)</h3>
    <p>
      El proyecto deberá cumplir el Acuerdo CNO 1862 de 2024 (o aquel que lo modifique o reemplace)
      relativo a las protecciones mínimas para recursos de generación distribuida conectados al SDL.
    </p>
    <h4 class="sub2-title">Funciones de protección mínimas requeridas — Capacidad &lt; 0.25 MW (250 kWp)</h4>
    ${tbl2([
      ['Sobretensión (ANSI 59)',     'V &gt; 1.1 pu', 'Trip en 2.0 s; V &gt; 1.2 pu: 0.16 s'],
      ['Subtensión (ANSI 27)',       'V &lt; 0.88 pu', 'Trip en 2.0 s; V &lt; 0.5 pu: 0.16 s'],
      ['Sobrepotencia adelante (ANSI 32)', 'Control excedentes a red', 'Según declaración al OR'],
      ['Sobrecorriente (ANSI 50/51)', 'Protección cortocircuito AC', 'Coordinar con OR'],
      ['Anti-isla (IEC 62116)',      'ROCOF / activo', 'Tiempo máximo: 2.0 s'],
      ['Sobrefrecuencia (ANSI 81O)', 'f &gt; 60.5 Hz', '0.5 s'],
      ['Subfrecuencia (ANSI 81U)',   'f &lt; 59.3 Hz', '0.5 s'],
      ['Verificación sincronismo (ANSI 25)', 'Reconexión post-falla', 'Automático (inversor)'],
    ], ['Función', 'Condición de disparo', 'Tiempo de operación'])}
    <h4 class="sub2-title">Equipo de corte principal</h4>
    <p>
      Para un sistema de <strong>${actKwp} kWp</strong> con potencia AC de <strong>${invKwTotal.toFixed(1)} kW</strong>,
      el equipo de corte principal debe ser un interruptor automático de
      <strong>${mainBreaker} A mínimo</strong> (${phasesLabel}), ubicado en el punto de conexión (PC)
      o lo más cercano posible a este, accesible para el personal del OR.
    </p>
    <h3 class="subsection-title">7.3 Sistema de medida (CREG 038/2014)</h3>
    <p>
      Se deberá cumplir con los requisitos establecidos en el Código de Medida CREG 038 de 2014.
      La CREG 174 de 2021 exime de instalar medidor de respaldo a los AGPE.
      ${systemType === 'on-grid' || systemType === 'hybrid'
        ? 'El medidor debe ser <strong>bidireccional</strong> para registrar tanto la energía importada (consumida de la red) como la energía exportada (excedentes inyectados al SIN).'
        : ''}
    </p>
    ${tbl2([
      ['Tipo de punto de medición', `Tipo ${measurementPoint} (CREG 038/2014)`],
      ['Potencia total AC', `${invKwTotal.toFixed(1)} kW`],
      ['Tipo de medidor', 'Bidireccional (importación + exportación de energía activa)'],
      ['Exactitud energía activa', `Clase ${measurementPoint <= 2 ? '1.0 (Tipo 1)' : '0.5S (Tipo 2)'}`],
      ['Exactitud energía reactiva', 'Clase 2'],
      ['Tipo de conexión', isIndirectMeasure ? `Indirecta (con TC ${Math.ceil(iac/5)*5}/5A y TP si aplica)` : 'Directa'],
      ['Comunicación / lectura remota', 'Requerida para Tipo 2 y 3 (protocolo DLMS/COSEM)'],
    ], ['Característica', 'Especificación'])}
    ${isIndirectMeasure
      ? `<h4 class="sub2-title">Transformadores de corriente (TC) — requeridos para medición indirecta</h4>
         ${tbl2([
           ['Relación de transformación', `${Math.ceil(iac/5)*5}/5 A`],
           ['Clase de exactitud', '0.5 (IEC 61869-2)'],
           ['Carga nominal (burden)', '≤ 5 VA'],
           ['Norma de referencia', 'IEC 61869-2 / NTC 4532'],
         ], ['Parámetro TC', 'Especificación'])}`
      : ''}
    <div class="infobox">
      <strong>Trámite ante el OR:</strong> El cliente debe radicar la solicitud de conexión ante el OR
      (${dept}) aportando: (1) Memoria técnica eléctrica firmada por ingeniero habilitado COPNIA,
      (2) Diagrama unifilar DC y AC, (3) Certificado de conformidad del inversor,
      (4) Certificado de conformidad de los módulos FV,
      ${requiresConnectionStudy ? '(5) Estudio de conexión simplificado,' : ''}
      y demás documentos indicados en el Artículo 9 de la CREG 174/2021.
    </div>
  </div>`;

  // =========================================================================
  // Sección 8 — Dimensionamiento del sistema FV
  // =========================================================================

  // Tabla de producción mensual
  const maxProd = Math.max(...monthlyProd);
  const monthlyRows = MONTH_NAMES.map((mes, i) => {
    const prod = monthlyProd[i];
    const balance = prod - monthlyCons;
    const balanceStr = balance >= 0
      ? `<span style="color:#1a7f3c">+${balance.toLocaleString('es-CO')}</span>`
      : `<span style="color:#c0392b">${balance.toLocaleString('es-CO')}</span>`;
    return [mes, prod.toLocaleString('es-CO') + ' kWh', monthlyCons.toLocaleString('es-CO') + ' kWh', balanceStr];
  });

  const sDim = `
  <div class="section">
    ${header('8. Dimensionamiento del Sistema Fotovoltaico')}
    <h2 class="section-title">8. Dimensionamiento del Sistema Fotovoltaico</h2>
    <h3 class="subsection-title">8.1 Consumo base del proyecto</h3>
    <p>
      El sistema ha sido dimensionado para cubrir un consumo mensual de
      <strong>${monthlyKwh.toLocaleString('es-CO')} kWh/mes</strong>
      (${(monthlyKwh * 12).toLocaleString('es-CO')} kWh/año).
    </p>
    ${tbl([
      ['Consumo mensual base declarado', `${monthlyKwh.toLocaleString('es-CO')} kWh/mes`],
      ['Consumo diario promedio', `${(monthlyKwh / 30).toFixed(1)} kWh/día`],
      ['Potencia promedio continua', `${((monthlyKwh / 30) / 24).toFixed(2)} kW`],
      ['Consumo anual proyectado', `${(monthlyKwh * 12).toLocaleString('es-CO')} kWh/año`],
    ])}
    <h3 class="subsection-title">8.2 Dimensionamiento del sistema</h3>
    ${tbl([
      ['Capacidad instalada DC', `${actKwp} kWp`],
      ['Potencia AC total (${numInv} inversores)', `${invKwTotal.toFixed(1)} kW`],
      ['Relación DC/AC (sobredimensionamiento)', dcAcRatio],
      ['Cantidad de módulos FV', `${numPanels} módulos`],
      ['Módulos por string', `${ppss}`],
      ['Número de strings totales', `${ns}`],
      ['Número de inversores', `${numInv}`],
      ['Strings por inversor', `${stringsPerInv}`],
      ['Entradas MPPT por inversor', `${mppt_count}`],
      ['Strings por entrada MPPT', `${ns_per_mppt}`],
      ['Performance Ratio (PR) regional', `${(pr * 100).toFixed(0)}% — zona climática ${climate.zone}`],
      ['PSH promedio estimada', `${avgPsh} h/día`],
      ['Producción mensual estimada', `${mp.toLocaleString('es-CO')} kWh/mes`],
      ['Producción anual estimada', `${annualProd.toLocaleString('es-CO')} kWh/año`],
      ['Cobertura del consumo mensual', `${cov}%`],
    ])}
    <h3 class="subsection-title">8.3 Validación del string (NTC 2050 §690.7)</h3>
    <p>
      La validación del string verifica que la configuración serie de módulos cumple con los
      límites de voltaje del inversor para el rango de temperaturas de operación del sitio.
      Esta tabla es equivalente a la "Tabla 15" del documento modelo Energy Falcon S.A.S.
    </p>
    ${tbl2([
      ['Módulos en serie por string (ppss)', `${ppss}`, maxPpssAllowed !== 'N/D' ? `≤ ${maxPpssAllowed} (calc. Vdc_max/Voc)` : '≤ según Vdc_max', ppss <= maxPpssAllowed ? checkMark(true) : checkMark(false)],
      ['Tensión Voc en frío (${coldTempC}°C)', Voc_string_cold != null ? `${Voc_string_cold.toFixed(1)} V` : 'N/D', `≤ ${vdc_max} V`, Voc_string_cold != null ? checkMark(vocColdOk) : '<span style="color:#888">N/D</span>'],
      ['Tensión Vmp en caliente (${hotTempC}°C)', Vmp_string_hot != null ? `${Vmp_string_hot.toFixed(1)} V` : 'N/D', `≥ ${vdc_min} V`, Vmp_string_hot != null ? checkMark(vmpHotOk) : '<span style="color:#888">N/D</span>'],
      ['Tensión Vmp en condiciones STC (25°C)', Vmp_string_stc != null ? `${Vmp_string_stc.toFixed(1)} V` : 'N/D', `${vdc_min} – ${vdc_max} V`, Vmp_string_stc != null ? checkMark(vmpStcOk) : '<span style="color:#888">N/D</span>'],
      ['Corriente Isc por string', panel.isc != null ? `${panel.isc.toFixed(2)} A` : 'N/D', `≤ límite MPPT inversor`, panel.isc != null ? checkMark(true) : '<span style="color:#888">N/D</span>'],
    ], ['Parámetro', 'Calculado', 'Límite inversor', '¿Cumple?'])}
    <div class="${vocColdOk !== false && vmpHotOk !== false ? 'infobox' : 'warnbox'}">
      <strong>Referencia:</strong> NTC 2050 §690.7, IEC 62109-2.
      Inversor de referencia: ${inverter.brand || 'N/D'} ${inverter.model || ''} (${inverter.kw || 'N/D'} kW).
      ${(vocColdOk === false || vmpHotOk === false)
        ? '<br><strong style="color:#c0392b">⚠ Se detectaron parámetros fuera de rango. Revisar la configuración de strings antes de la instalación.</strong>'
        : '<br>Todos los parámetros eléctricos del string están dentro de los límites del inversor especificado.'}
    </div>
    ${unifilarSvgDC
      ? `<h4 class="sub2-title">Diagrama unifilar DC</h4>
         <div class="unifilar-container">${unifilarSvgDC}</div>`
      : `<div class="infobox">El diagrama unifilar DC se adjuntará según diseño de ingeniería de detalle.</div>`
    }
    <h3 class="subsection-title">8.4 Producción energética estimada</h3>
    <p>
      La producción mensual se estima aplicando factores estacionales para Colombia (temporada seca:
      diciembre–febrero y julio–agosto / temporada de lluvia: abril–junio y septiembre–noviembre),
      sobre la producción mensual promedio de <strong>${mp.toLocaleString('es-CO')} kWh/mes</strong>.
    </p>
    ${tbl2(monthlyRows, ['Mes', 'Producción estimada', 'Consumo base', 'Balance (kWh)'])}
    <p style="font-size:9pt;color:#555;margin-top:-8px">
      * Balance positivo = excedente potencialmente inyectable a la red. Balance negativo = complemento requerido de la red.
      Producción total anual estimada: <strong>${annualProd.toLocaleString('es-CO')} kWh/año</strong>.
    </p>
    <h3 class="subsection-title">8.5 Ajustes de protección recomendados (CNO 1862/2024 — Figura 14)</h3>
    ${tbl2([
      ['ANSI 27 — Subtensión etapa 1', 'V &lt; 0.88 pu', '2.0 s'],
      ['ANSI 27 — Subtensión etapa 2', 'V &lt; 0.50 pu', '0.16 s (instantáneo)'],
      ['ANSI 59 — Sobretensión etapa 1', 'V &gt; 1.10 pu', '2.0 s'],
      ['ANSI 59 — Sobretensión etapa 2', 'V &gt; 1.20 pu', '0.16 s (instantáneo)'],
      ['ANSI 81O — Sobrefrecuencia', 'f &gt; 60.5 Hz', '0.5 s'],
      ['ANSI 81U — Subfrecuencia', 'f &lt; 59.3 Hz', '0.5 s'],
      ['Anti-isla (IEC 62116)', 'Activación de protección anti-isla', '≤ 2.0 s'],
      ['ANSI 25 — Sincronismo reconexión', 'Restauración de red', 'Automático (inversor)'],
    ], ['Función de protección', 'Condición de ajuste', 'Tiempo de operación'])}
    <div class="infobox">
      Estos ajustes son referenciales y deben ser validados y coordinados con el OR de ${dept}
      durante el proceso de autorización de conexión AGPE, conforme al Artículo 17 de la CREG 174/2021.
    </div>
  </div>`;

  // =========================================================================
  // Sección 9 — Declaración y firma
  // =========================================================================
  const sFirma = `
  <div class="section">
    ${header('9. Declaración y Firma')}
    <h2 class="section-title">9. Declaración y Firma</h2>
    <p>
      El presente documento constituye la Memoria Técnica Eléctrica del sistema fotovoltaico
      descrito, elaborada conforme a la normativa técnica colombiana vigente (RETIE, NTC 2050,
      CREG 174/2021, CNO 1862/2024 y demás normas aplicables). Los cálculos presentados son de
      carácter estimativo y de pre-dimensionamiento; deben ser validados y firmados por un profesional
      de la ingeniería eléctrica habilitado ante el COPNIA para la presentación de planos definitivos
      ante el Operador de Red.
    </p>
    <div class="warnbox">
      <strong>Importante:</strong> Este documento de pre-dimensionamiento no reemplaza los planos
      eléctricos definitivos firmados por ingeniero matriculado COPNIA, ni la inspección y certificación
      RETIE previa a la energización. Tampoco reemplaza asesoría jurídica en materia de contratos de
      condiciones uniformes o litigios regulatorios.
    </div>
    ${tbl2([
      ['Proyecto', client.company || client.name || '—'],
      ['Cliente', client.name || '—'],
      ['Ubicación', `${city}, ${dept}, Colombia`],
      ['Capacidad del sistema', `${actKwp} kWp · ${numPanels} módulos`],
      ['Fecha de elaboración', dateStr],
      ['Revisión del documento', revision],
      ['Vigencia del documento', '6 meses desde la fecha de elaboración'],
      ['Elaboró', preparedBy],
      ['NIT', '901.992.450-5'],
      ['Contacto', 'ing@alebas.co · solar-hub.co'],
    ], ['Campo', 'Información'])}
    <div class="firma-block">
      <div class="firma-card">
        <div class="firma-line"></div>
        <div class="firma-name">Elaboró: ${preparedBy}</div>
        <div class="firma-role">Representante técnico</div>
        <div class="firma-role" style="margin-top:4px">Matrícula COPNIA: _____________</div>
      </div>
      <div class="firma-card">
        <div class="firma-line"></div>
        <div class="firma-name">Revisó: Ing. ALEBAS</div>
        <div class="firma-role">Director de Ingeniería</div>
        <div class="firma-role" style="margin-top:4px">Matrícula COPNIA: _____________</div>
      </div>
      <div class="firma-card">
        <div class="firma-line"></div>
        <div class="firma-name">Aprobó: Ing. ALEBAS</div>
        <div class="firma-role">Representante Legal</div>
        <div class="firma-role" style="margin-top:4px">ALEBAS Ingeniería SAS</div>
      </div>
    </div>
    <p style="text-align:center;margin-top:30px;color:#888;font-size:9pt">
      ALEBAS Ingeniería SAS — NIT 901.992.450-5 — solar-hub.co — ing@alebas.co<br>
      Villavicencio, Meta, Colombia — © ${docYear}
    </p>
  </div>`;

  // =========================================================================
  // Ensamblaje del HTML completo
  // =========================================================================
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Memoria Técnica — ${client.company || client.name || 'Sistema FV'} — ALEBAS Ingeniería SAS</title>
  <style>${css}</style>
</head>
<body>
  ${sPortada}
  ${sToc}
  ${sResumen}
  ${sIntro}
  ${sLoc}
  ${sEspec}
  ${sCableado}
  ${sPAT}
  ${sCREG}
  ${sDim}
  ${sFirma}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// API pública del módulo
// ---------------------------------------------------------------------------

/**
 * generateMemoriaTecnica
 * Genera el HTML de la Memoria Técnica Eléctrica y lo abre en una nueva ventana
 * para impresión o descarga. Si el navegador bloquea el popup, descarga el archivo
 * directamente como .html.
 *
 * @param {Object} data - Datos del sistema. Ver documentación en la cabecera del archivo.
 */
export function generateMemoriaTecnica(data) {
  const html = buildHtml(data);

  // Intentar abrir en nueva ventana (puede ser bloqueado por pop-up blockers)
  const w = window.open('', '_blank', 'width=1100,height=800');
  if (w) {
    w.document.write(html);
    w.document.close();
    w.focus();
    // Pequeño delay para que el navegador renderice antes de imprimir
    setTimeout(() => {
      try { w.print(); } catch (e) { /* ignorar si el usuario cerró la ventana */ }
    }, 900);
  } else {
    // Fallback: descarga como archivo HTML
    _downloadHtml(html, data);
  }
}

/**
 * generateMemoriaTecnicaHtml
 * Retorna el HTML de la Memoria Técnica como string.
 * Útil para previsualización embebida o integración con generadores de PDF server-side.
 *
 * @param {Object} data - Datos del sistema.
 * @returns {string} HTML completo del documento.
 */
export function generateMemoriaTecnicaHtml(data) {
  return buildHtml(data);
}

/**
 * downloadMemoriaTecnica
 * Descarga la Memoria Técnica directamente como archivo .html sin abrir ventana.
 *
 * @param {Object} data - Datos del sistema.
 */
export function downloadMemoriaTecnica(data) {
  const html = buildHtml(data);
  _downloadHtml(html, data);
}

function _downloadHtml(html, data) {
  const fecha = new Date(data.date || Date.now()).toISOString().split('T')[0];
  const proyecto = (data.client?.company || data.client?.name || 'Sistema_FV')
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .slice(0, 40);
  const filename = `MemoriaTecnica_${proyecto}_Rev${data.revision || 'A'}_${fecha}.html`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

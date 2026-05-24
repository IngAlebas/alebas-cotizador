/**
 * pdfGenerator.js — Generador de PDF profesional para SolarHub / ALEBAS Ingeniería SAS
 *
 * Mecanismo: construye un documento HTML completo y lo imprime via window.print()
 * abriendo una ventana emergente con estilos @media print optimizados. No requiere
 * librerías externas (sin html2pdf, sin jsPDF). Funciona en Chrome, Edge y Safari.
 *
 * Firma principal:
 *   export async function generatePDF(data)
 *
 * Campos esperados en `data` (todos opcionales tienen fallback):
 *
 *   // Datos del cliente / cotización
 *   data.id              — ID de cotización (string o number)
 *   data.date            — Fecha formateada (string)
 *   data.name            — Nombre del cliente
 *   data.company         — Empresa (opcional)
 *   data.email           — Email del cliente
 *   data.phone           — Teléfono
 *   data.address         — Dirección
 *   data.city            — Ciudad
 *   data.dept            — Departamento
 *   data.operator        — Nombre del operador de red
 *   data.systemType      — 'on-grid' | 'hybrid' | 'off-grid'
 *   data.monthlyKwh      — Consumo mensual kWh
 *
 *   // Equipos
 *   data.panel           — Objeto panel { brand, model, wp, voc, vmp, isc, imp,
 *                          lengthMm, widthMm, kg, tempCoeffPmax }
 *   data.results         — { actKwp, numPanels, mp, ap, cov, ns, ppss, dca, co2,
 *                            roof, tB, aut, inv, specsSource }
 *   data.results.inv     — Objeto inversor { brand, model, kw, phase, vocMax,
 *                          mpptVmin, mpptVmax, mpptCount, idcMax, efficiency, vac }
 *
 *   // Presupuesto
 *   data.budget          — { pC, iC, bC, sA, sB, tot, transport, iva,
 *                            sav, roi, roiWithDegradation,
 *                            ivaAhorrado, deduccionRenta50, depAcelerada, totalBeneficioFiscal,
 *                            prod25yKwh, saving25yCOP, budgetUsd }
 *
 *   // AGPE
 *   data.agpe            — { totalAnual, autoConsumed, excedentes, ahorroAutoconsumo,
 *                            ingresoExcedentes, agpeCategory, rule, tariffCU }
 *
 *   // Extras opcionales
 *   data.unifilarSvg     — SVG string del diagrama unifilar (opcional)
 *   data.arancelAhorrado — COP estimado en exención arancelaria (opcional)
 *   data.pr              — Performance Ratio decimal, ej: 0.78 (opcional)
 */

// ── Brand colors ──────────────────────────────────────────────────────────────
const ORANGE = '#FF8C00';
const TEAL   = '#01708B';
const DARK   = '#07090F';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Formatea un número en estilo colombiano: 1.234.567
 */
function fmtN(n) {
  if (n == null || isNaN(Number(n))) return '—';
  return Number(Math.round(n)).toLocaleString('es-CO');
}

/**
 * Formatea como moneda colombiana: $1.234.567
 */
function fmtCOP(n) {
  if (n == null || isNaN(Number(n))) return '—';
  return '$' + fmtN(n);
}

/**
 * Nombre del mes en español (1-indexed).
 */
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

/**
 * Fecha larga en español: "24 de mayo de 2026"
 */
function fechaLarga(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  // Evitar desfase de zona horaria al parsear "YYYY-MM-DD"
  const parts = String(dateStr || '').split('/');
  if (parts.length === 3) {
    // Formato dd/mm/yyyy (es-CO)
    return `${parts[0]} de ${MESES[parseInt(parts[1], 10) - 1] || ''} de ${parts[2]}`;
  }
  const now = new Date();
  return `${now.getDate()} de ${MESES[now.getMonth()]} de ${now.getFullYear()}`;
}

/**
 * Etiqueta del tipo de sistema.
 */
function labelSystemType(st) {
  return st === 'on-grid' ? 'On-Grid (Conectado a Red)'
       : st === 'hybrid'  ? 'Híbrido (Con Baterías)'
       : st === 'off-grid'? 'Off-Grid (Autónomo)'
       : st || '—';
}

/**
 * Calcula el ID de cotización a partir del ID (número) o fecha.
 */
function quoteRef(id, date) {
  if (id) {
    const s = String(id);
    // Si es un timestamp largo, tomar los últimos 6 dígitos
    if (s.length > 8) return 'SH-' + s.slice(-6).toUpperCase();
    return 'SH-' + s.toUpperCase();
  }
  const now = new Date();
  return `SH-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
}

/**
 * Genera el SVG de barras para la proyección 25 años.
 * Retorna un string SVG completo.
 *
 * @param {object} opts
 * @param {number} opts.mp        — Producción mensual en kWh
 * @param {number} opts.degradation — Tasa de degradación anual (default 0.005 = 0.5%)
 * @param {number} opts.roi       — Año de retorno de inversión
 * @param {number} opts.prod25y   — Producción total acumulada 25 años en kWh
 * @returns {string} SVG string
 */
function generate25YearChartSvg({ mp = 0, degradation = 0.005, roi = 0, prod25y = 0 }) {
  const W = 700, H = 280;
  const PAD = { t: 40, r: 30, b: 55, l: 75 };
  const chartW = W - PAD.l - PAD.r;
  const chartH = H - PAD.t - PAD.b;

  const years = Array.from({ length: 25 }, (_, i) => i + 1);
  const annualProd = years.map(y => Math.round(mp * 12 * Math.pow(1 - degradation, y - 1)));
  const flatProd = Math.round(mp * 12); // sin degradación
  const maxProd = flatProd > 0 ? flatProd : 1;

  const barW = Math.floor(chartW / 25) - 2;
  const barGap = Math.floor(chartW / 25);

  const toY = (v) => chartH - Math.round((v / maxProd) * chartH * 0.92);
  const toX = (i) => PAD.l + i * barGap + Math.floor((barGap - barW) / 2);

  // Y-axis tick values
  const yTicks = 5;
  const yTickStep = Math.ceil(maxProd / yTicks / 1000) * 1000;

  // ROI vertical line position
  const roiYear = roi > 0 ? Math.min(25, Math.ceil(roi)) : 0;

  let bars = '';
  for (let i = 0; i < 25; i++) {
    const val = annualProd[i];
    const x = toX(i);
    const barH = Math.max(2, Math.round((val / maxProd) * chartH * 0.92));
    const y = PAD.t + (chartH - barH);
    bars += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${TEAL}" rx="2" opacity="0.85"/>`;
  }

  // Flat reference line (no degradation)
  const flatY = PAD.t + toY(flatProd);
  const lineX1 = PAD.l;
  const lineX2 = PAD.l + chartW;
  const flatLineY = PAD.t + (chartH - Math.round((flatProd / maxProd) * chartH * 0.92));

  // ROI line
  let roiLine = '';
  if (roiYear > 0 && roiYear <= 25) {
    const rx = PAD.l + (roiYear - 1) * barGap + barGap / 2;
    roiLine = `
      <line x1="${rx}" y1="${PAD.t}" x2="${rx}" y2="${PAD.t + chartH}" stroke="${ORANGE}" stroke-width="2" stroke-dasharray="4,3"/>
      <rect x="${rx - 20}" y="${PAD.t - 24}" width="42" height="18" rx="4" fill="${ORANGE}"/>
      <text x="${rx + 1}" y="${PAD.t - 11}" font-family="Arial,sans-serif" font-size="11" font-weight="700" fill="#fff" text-anchor="middle">ROI</text>
    `;
  }

  // Y-axis labels
  let yLabels = '';
  for (let t = 0; t <= yTicks; t++) {
    const val = t * yTickStep;
    if (val > maxProd * 1.05) break;
    const y = PAD.t + (chartH - Math.round((val / maxProd) * chartH * 0.92));
    const label = val >= 1000 ? `${(val/1000).toFixed(1)}k` : String(val);
    yLabels += `
      <line x1="${PAD.l - 4}" y1="${y}" x2="${PAD.l + chartW}" y2="${y}" stroke="#e0e0e0" stroke-width="0.5" opacity="0.5"/>
      <text x="${PAD.l - 7}" y="${y + 4}" font-family="Arial,sans-serif" font-size="10" fill="#555" text-anchor="end">${label}</text>
    `;
  }

  // X-axis labels: years 1, 5, 10, 15, 20, 25
  const xLabels = [1, 5, 10, 15, 20, 25].map(yr => {
    const x = PAD.l + (yr - 1) * barGap + barGap / 2;
    return `<text x="${x}" y="${PAD.t + chartH + 18}" font-family="Arial,sans-serif" font-size="11" fill="#555" text-anchor="middle">Año ${yr}</text>`;
  }).join('');

  // Legend
  const legY = H - 12;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="max-width:100%;display:block;">
    <!-- Background -->
    <rect width="${W}" height="${H}" fill="#fff" rx="6"/>
    <!-- Title -->
    <text x="${W/2}" y="22" font-family="Arial,sans-serif" font-size="12" font-weight="700" fill="#111" text-anchor="middle">Producción total 25 años: ${fmtN(prod25y)} kWh</text>
    <!-- Y axis -->
    <line x1="${PAD.l}" y1="${PAD.t}" x2="${PAD.l}" y2="${PAD.t + chartH}" stroke="#ccc" stroke-width="1"/>
    <!-- X axis -->
    <line x1="${PAD.l}" y1="${PAD.t + chartH}" x2="${PAD.l + chartW}" y2="${PAD.t + chartH}" stroke="#ccc" stroke-width="1"/>
    <!-- Y axis label -->
    <text x="12" y="${PAD.t + chartH/2}" font-family="Arial,sans-serif" font-size="10" fill="#777" text-anchor="middle" transform="rotate(-90,12,${PAD.t + chartH/2})">kWh/año</text>
    <!-- Grid + Y labels -->
    ${yLabels}
    <!-- Bars -->
    ${bars}
    <!-- Flat reference line -->
    <line x1="${lineX1}" y1="${flatLineY}" x2="${lineX2}" y2="${flatLineY}" stroke="#aaa" stroke-width="1.5" stroke-dasharray="6,4"/>
    <!-- ROI line -->
    ${roiLine}
    <!-- X labels -->
    ${xLabels}
    <!-- Legend -->
    <rect x="${PAD.l}" y="${legY - 10}" width="12" height="10" fill="${TEAL}" rx="2"/>
    <text x="${PAD.l + 16}" y="${legY}" font-family="Arial,sans-serif" font-size="10" fill="#555">Con degradación 0.5%/año</text>
    <line x1="${PAD.l + 180}" y1="${legY - 5}" x2="${PAD.l + 198}" y2="${legY - 5}" stroke="#aaa" stroke-width="1.5" stroke-dasharray="5,3"/>
    <text x="${PAD.l + 202}" y="${legY}" font-family="Arial,sans-serif" font-size="10" fill="#555">Sin degradación (referencia)</text>
  </svg>`;
}

// ── Estilos CSS de impresión ──────────────────────────────────────────────────

function getStyles() {
  return `
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif;
      font-size: 10pt;
      color: #111;
      background: #fff;
      line-height: 1.5;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* ── Page setup ── */
    @page {
      size: A4 portrait;
      margin: 15mm 14mm 18mm 14mm;
    }

    @page :first { margin-top: 0; }

    /* ── Page breaks ── */
    .page-break { page-break-before: always; break-before: page; }
    .avoid-break { page-break-inside: avoid; break-inside: avoid; }

    /* ── Layout ── */
    .page    { width: 100%; max-width: 180mm; margin: 0 auto; }
    .section { padding: 18pt 0 10pt; }

    /* ── Cover page ── */
    .cover {
      display: flex; flex-direction: column;
      min-height: 270mm;
      padding: 0;
    }
    .cover-header {
      background: ${DARK};
      color: #fff;
      padding: 32pt 28pt 26pt;
      display: flex; align-items: center; gap: 20pt;
    }
    .cover-solar-icon {
      width: 68pt; height: 68pt; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
    }
    .cover-brand { flex: 1; }
    .cover-brand-name {
      font-size: 26pt; font-weight: 800; color: ${ORANGE}; letter-spacing: -0.5pt;
      line-height: 1;
    }
    .cover-brand-sub {
      font-size: 9pt; color: #9ab; letter-spacing: 1pt; text-transform: uppercase;
      margin-top: 4pt;
    }
    .cover-body {
      flex: 1; padding: 28pt 28pt 20pt;
    }
    .cover-title {
      font-size: 22pt; font-weight: 800; color: ${DARK};
      text-transform: uppercase; letter-spacing: 0.5pt;
      margin-bottom: 4pt; line-height: 1.2;
    }
    .cover-subtitle {
      font-size: 14pt; font-weight: 500; color: ${TEAL};
      margin-bottom: 24pt;
    }
    .cover-divider {
      width: 48pt; height: 4pt; background: ${ORANGE};
      border-radius: 2pt; margin-bottom: 22pt;
    }
    .cover-client-box {
      border: 1.5pt solid ${TEAL}44;
      border-left: 4pt solid ${TEAL};
      border-radius: 6pt;
      padding: 14pt 16pt;
      margin-bottom: 18pt;
      background: #f5fbfc;
    }
    .cover-client-label {
      font-size: 7.5pt; font-weight: 700; color: ${TEAL};
      text-transform: uppercase; letter-spacing: 0.8pt;
      margin-bottom: 6pt;
    }
    .cover-client-name {
      font-size: 15pt; font-weight: 700; color: #111;
      margin-bottom: 3pt;
    }
    .cover-client-detail {
      font-size: 9pt; color: #555; line-height: 1.6;
    }
    .cover-specs-grid {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 10pt;
      margin-bottom: 22pt;
    }
    .cover-spec-card {
      border: 1pt solid #e0e0e0;
      border-radius: 6pt; padding: 10pt 10pt 8pt;
      background: #fff;
      text-align: center;
    }
    .cover-spec-label {
      font-size: 7pt; color: #888; text-transform: uppercase;
      letter-spacing: 0.5pt; margin-bottom: 4pt;
    }
    .cover-spec-value {
      font-size: 13pt; font-weight: 700; color: ${DARK};
    }
    .cover-spec-unit {
      font-size: 8pt; color: #888; margin-top: 1pt;
    }
    .cover-ref-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 8pt 0; border-top: 1pt solid #e8e8e8;
      font-size: 8.5pt; color: #666;
    }
    .cover-ref-id {
      font-weight: 700; color: ${ORANGE}; font-size: 10pt;
    }
    .cover-footer {
      background: #f5f5f5;
      padding: 10pt 28pt;
      font-size: 8pt; color: #777;
      display: flex; justify-content: space-between; align-items: center;
      border-top: 1pt solid #e0e0e0;
    }
    .cover-footer-brand { font-weight: 700; color: ${DARK}; }

    /* ── Section headers ── */
    .section-header {
      display: flex; align-items: center; gap: 10pt;
      border-bottom: 2pt solid ${ORANGE};
      padding-bottom: 6pt; margin-bottom: 14pt;
    }
    .section-number {
      background: ${ORANGE}; color: #fff;
      font-size: 9pt; font-weight: 800;
      width: 20pt; height: 20pt; border-radius: 50%;
      display: inline-flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .section-title {
      font-size: 13pt; font-weight: 800; color: ${DARK};
      text-transform: uppercase; letter-spacing: 0.3pt;
    }

    /* ── Executive summary cards ── */
    .summary-grid {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 10pt;
      margin-bottom: 16pt;
    }
    .metric-card {
      border: 1pt solid #e8e8e8; border-radius: 8pt;
      padding: 12pt 10pt; text-align: center;
      background: #fafafa;
    }
    .metric-label {
      font-size: 7.5pt; color: #888; text-transform: uppercase;
      letter-spacing: 0.4pt; margin-bottom: 6pt; line-height: 1.3;
    }
    .metric-value {
      font-size: 16pt; font-weight: 800; color: ${ORANGE};
      line-height: 1; margin-bottom: 2pt;
    }
    .metric-unit {
      font-size: 8pt; color: #999; font-weight: 500;
    }
    .narrative-box {
      border-left: 3pt solid ${TEAL};
      padding: 10pt 14pt;
      background: #f5fbfc;
      border-radius: 0 6pt 6pt 0;
      font-size: 9.5pt; color: #333; line-height: 1.6;
    }

    /* ── Tables ── */
    table {
      width: 100%; border-collapse: collapse;
      font-size: 9pt; margin-bottom: 14pt;
    }
    thead th {
      background: ${TEAL}; color: #fff;
      padding: 6pt 8pt; text-align: left;
      font-weight: 700; font-size: 8.5pt;
      text-transform: uppercase; letter-spacing: 0.3pt;
    }
    tbody tr:nth-child(even) { background: #f7f9fa; }
    tbody tr:nth-child(odd)  { background: #fff; }
    tbody td {
      padding: 5.5pt 8pt;
      border-bottom: 0.5pt solid #e8e8e8;
      vertical-align: top;
    }
    tbody td.label-cell {
      color: #555; font-weight: 500; width: 44%;
    }
    tbody td.value-cell {
      font-weight: 600; color: #111;
    }
    .table-section-header td {
      background: ${DARK} !important; color: #fff !important;
      font-weight: 800 !important; font-size: 9pt !important;
      padding: 5pt 8pt !important;
    }
    tfoot td {
      background: ${DARK} !important; color: #fff !important;
      font-weight: 800 !important; padding: 6pt 8pt !important;
    }
    .total-row td {
      background: ${ORANGE}18 !important;
      font-weight: 800 !important;
      color: ${DARK} !important;
      border-top: 1.5pt solid ${ORANGE} !important;
    }

    /* ── Diagrama unifilar ── */
    .unifilar-box {
      border: 1.5pt solid ${TEAL}66;
      border-radius: 6pt; padding: 16pt;
      text-align: center; background: #fafeff;
      min-height: 200pt;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
    }
    .unifilar-placeholder {
      border: 2pt dashed ${TEAL}55;
      border-radius: 6pt; padding: 36pt 20pt;
      color: ${TEAL}; font-size: 12pt; font-weight: 600;
      background: #f5fbfc;
    }
    .unifilar-note {
      font-size: 8pt; color: #777; margin-top: 10pt;
      font-style: italic;
    }

    /* ── 25 Year chart ── */
    .chart-wrapper {
      border: 1pt solid #e0e0e0; border-radius: 6pt;
      padding: 10pt; background: #fff; margin-bottom: 14pt;
    }

    /* ── Normativa badge ── */
    .norm-badge {
      display: inline-block;
      background: ${TEAL}15;
      border: 0.5pt solid ${TEAL}55;
      border-radius: 3pt;
      padding: 1pt 5pt;
      font-size: 7.5pt; color: ${TEAL};
      font-weight: 700;
    }

    /* ── Firma / cierre ── */
    .closing-steps {
      counter-reset: steps;
    }
    .closing-step {
      counter-increment: steps;
      display: flex; gap: 10pt; margin-bottom: 8pt; align-items: flex-start;
    }
    .closing-step-num {
      background: ${ORANGE}; color: #fff;
      font-size: 9pt; font-weight: 800;
      min-width: 18pt; height: 18pt; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; margin-top: 1pt;
    }
    .closing-step-text {
      font-size: 9.5pt; color: #333; line-height: 1.5; padding-top: 1pt;
    }
    .signature-box {
      border: 1pt solid #e0e0e0; border-radius: 6pt;
      padding: 14pt 16pt; margin-top: 16pt;
      display: flex; justify-content: space-between; gap: 16pt;
    }
    .signature-block { flex: 1; }
    .signature-label {
      font-size: 7.5pt; color: #888; text-transform: uppercase;
      letter-spacing: 0.5pt; margin-bottom: 24pt;
    }
    .signature-line {
      border-top: 1pt solid #ccc; padding-top: 4pt;
      font-size: 8.5pt; color: #444; font-weight: 600;
    }
    .qr-placeholder {
      width: 72pt; height: 72pt;
      border: 2pt solid #ccc; border-radius: 4pt;
      display: flex; align-items: center; justify-content: center;
      flex-direction: column; gap: 4pt;
      flex-shrink: 0;
    }
    .qr-grid {
      display: grid; grid-template-columns: repeat(7,1fr); gap: 1pt;
      width: 50pt; height: 50pt;
    }
    .qr-cell { background: #ddd; border-radius: 1pt; }
    .qr-cell.dark { background: ${DARK}; }
    .validity-box {
      background: ${ORANGE}15; border: 1pt solid ${ORANGE}44;
      border-radius: 6pt; padding: 10pt 14pt; margin-top: 14pt;
      font-size: 9pt; color: ${DARK};
      display: flex; align-items: center; gap: 8pt;
    }
    .validity-icon { font-size: 14pt; }

    /* ── Utility ── */
    .disclaimer {
      font-size: 7.5pt; color: #888; font-style: italic;
      border-top: 0.5pt solid #e0e0e0; padding-top: 6pt; margin-top: 8pt;
      line-height: 1.5;
    }
    .ref-block {
      font-size: 7.5pt; color: #999; margin-top: 8pt; line-height: 1.6;
    }
    .row2col { display: grid; grid-template-columns: 1fr 1fr; gap: 10pt; }
    .highlight-td { color: ${ORANGE} !important; font-weight: 800 !important; }

    /* Screen-only: button to trigger print */
    @media screen {
      body { background: #f0f0f0; padding: 20px 0; }
      .page { background: #fff; box-shadow: 0 2px 12px rgba(0,0,0,0.18); padding: 14mm; }
      .print-btn {
        position: fixed; top: 14px; right: 14px;
        background: ${ORANGE}; color: #fff; border: none;
        padding: 10px 20px; border-radius: 6px;
        font-size: 14px; font-weight: 700; cursor: pointer;
        z-index: 9999; box-shadow: 0 2px 8px rgba(0,0,0,0.25);
      }
    }
    @media print {
      .print-btn { display: none !important; }
      body { background: #fff; padding: 0; }
      .page { box-shadow: none; padding: 0; }
    }
  `;
}

// ── Logo SVG inline (sol con rayos — brand SolarHub) ─────────────────────────

function logoSvg(size = 56) {
  const c = size / 2;
  const r = size * 0.28;
  const rayLen = size * 0.16;
  const rays = Array.from({ length: 8 }, (_, i) => {
    const angle = (i * 45 * Math.PI) / 180;
    const x1 = c + Math.cos(angle) * (r + 3);
    const y1 = c + Math.sin(angle) * (r + 3);
    const x2 = c + Math.cos(angle) * (r + rayLen);
    const y2 = c + Math.sin(angle) * (r + rayLen);
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${ORANGE}" stroke-width="${size*0.05}" stroke-linecap="round"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <circle cx="${c}" cy="${c}" r="${r}" fill="${ORANGE}"/>
    <circle cx="${c}" cy="${c}" r="${r*0.62}" fill="#fff7ee"/>
    ${rays}
  </svg>`;
}

// ── Page 1: Portada ───────────────────────────────────────────────────────────

function renderCover(data) {
  const r = data.results || {};
  const b = data.budget || {};
  const ref = quoteRef(data.id, data.date);
  const sysLabel = labelSystemType(data.systemType);
  const kwp = r.actKwp || '—';
  const numPanels = r.numPanels || '—';
  const fecha = fechaLarga(data.date);
  const city = [data.city, data.dept].filter(Boolean).join(', ') || '—';

  return `
  <!-- ═══════════════════════════ PORTADA ═══════════════════════════ -->
  <div class="cover">
    <!-- Header oscuro con logo y marca -->
    <div class="cover-header">
      <div class="cover-solar-icon">
        ${logoSvg(60)}
      </div>
      <div class="cover-brand">
        <div class="cover-brand-name">SolarHub</div>
        <div class="cover-brand-sub">by ALEBAS Ingeniería SAS</div>
      </div>
      <div style="text-align:right;font-size:8pt;color:#9ab;line-height:1.7;">
        NIT 901.992.450-5<br>
        solar-hub.co<br>
        ing@alebas.co
      </div>
    </div>

    <!-- Cuerpo de la portada -->
    <div class="cover-body">
      <div class="cover-title">Propuesta<br>Técnico-Comercial</div>
      <div class="cover-subtitle">Sistema Solar Fotovoltaico</div>
      <div class="cover-divider"></div>

      <!-- Datos del cliente -->
      <div class="cover-client-box">
        <div class="cover-client-label">Preparado para</div>
        <div class="cover-client-name">${data.name || '—'}</div>
        <div class="cover-client-detail">
          ${data.company ? `<strong>${data.company}</strong><br>` : ''}
          ${data.address ? `${data.address}<br>` : ''}
          ${city}
          ${data.operator ? `<br>Operador de red: <strong>${data.operator}</strong>` : ''}
        </div>
      </div>

      <!-- Specs del sistema -->
      <div class="cover-specs-grid">
        <div class="cover-spec-card">
          <div class="cover-spec-label">Tipo de sistema</div>
          <div class="cover-spec-value" style="font-size:10pt;">${sysLabel}</div>
        </div>
        <div class="cover-spec-card">
          <div class="cover-spec-label">Capacidad instalada</div>
          <div class="cover-spec-value">${kwp}</div>
          <div class="cover-spec-unit">kWp</div>
        </div>
        <div class="cover-spec-card">
          <div class="cover-spec-label">Módulos FV</div>
          <div class="cover-spec-value">${numPanels}</div>
          <div class="cover-spec-unit">paneles</div>
        </div>
      </div>

      <!-- Referencia y fecha -->
      <div class="cover-ref-row">
        <div>
          <span style="font-size:8pt;color:#888;">Cotización </span>
          <span class="cover-ref-id">${ref}</span>
        </div>
        <div style="font-size:8.5pt;color:#555;">${fecha}</div>
        <div style="font-size:8pt;color:#888;">Válida por <strong>30 días</strong></div>
      </div>
    </div>

    <!-- Footer de portada -->
    <div class="cover-footer">
      <span><span class="cover-footer-brand">ALEBAS Ingeniería SAS</span> · NIT 901.992.450-5 · solar-hub.co</span>
      <span>Calle 12 # 34-56, Villavicencio, Meta · (+57) 310 000 0000</span>
    </div>
  </div>`;
}

// ── Page 2: Resumen Ejecutivo ─────────────────────────────────────────────────

function renderSummary(data) {
  const r = data.results || {};
  const b = data.budget || {};
  const agpe = data.agpe || {};
  const kwp = r.actKwp != null ? r.actKwp : '—';
  const mp = r.mp != null ? fmtN(r.mp) : '—';
  const cov = r.cov != null ? r.cov : '—';
  const tot = b.tot != null ? fmtCOP(b.tot) : '—';
  const savAnual = agpe.totalAnual != null ? fmtCOP(agpe.totalAnual) : (b.sav != null ? fmtCOP(b.sav) : '—');
  const roi = b.roiWithDegradation != null ? b.roiWithDegradation : (b.roi != null ? b.roi : '—');
  const sysLabel = labelSystemType(data.systemType);
  const co2 = r.co2 != null ? fmtN(r.co2) : '—';
  const prod25y = b.prod25yKwh != null ? fmtN(b.prod25yKwh) : '—';

  const narrative = `
El sistema fotovoltaico propuesto para ${data.name || 'el cliente'} tiene una capacidad instalada de
<strong>${kwp} kWp</strong> (${r.numPanels || '?'} módulos FV), con producción mensual estimada de
<strong>${mp} kWh/mes</strong>, cubriendo aproximadamente el <strong>${cov}%</strong> del consumo eléctrico actual
de ${data.monthlyKwh || '?'} kWh/mes. La inversión total asciende a <strong>${tot}</strong>, con un
retorno estimado en <strong>${roi} años</strong> considerando la degradación natural de los paneles
(0.5%/año, IEC 61215). Durante 25 años, el sistema generará un total de <strong>${prod25y} kWh</strong>,
evitando la emisión de aproximadamente <strong>${co2} kg de CO₂ al año</strong>.
  `.trim();

  return `
  <!-- ══════════════════════ RESUMEN EJECUTIVO ══════════════════════ -->
  <div class="page-break"></div>
  <section class="section">
    <div class="section-header">
      <span class="section-number">1</span>
      <span class="section-title">Resumen Ejecutivo</span>
    </div>

    <div class="summary-grid avoid-break">
      <div class="metric-card">
        <div class="metric-label">Capacidad instalada</div>
        <div class="metric-value">${kwp}</div>
        <div class="metric-unit">kWp</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Producción mensual estimada</div>
        <div class="metric-value">${mp}</div>
        <div class="metric-unit">kWh/mes</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Cobertura del consumo</div>
        <div class="metric-value">${cov}</div>
        <div class="metric-unit">%</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Inversión total</div>
        <div class="metric-value" style="font-size:12pt;">${tot}</div>
        <div class="metric-unit">COP</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Ahorro anual estimado</div>
        <div class="metric-value" style="font-size:12pt;">${savAnual}</div>
        <div class="metric-unit">COP/año</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Retorno de inversión</div>
        <div class="metric-value">${roi}</div>
        <div class="metric-unit">años</div>
      </div>
    </div>

    <div class="narrative-box avoid-break">
      <p>${narrative}</p>
    </div>

    <div style="margin-top:14pt;">
      <table class="avoid-break">
        <thead><tr>
          <th>Parámetro</th><th>Valor</th><th>Parámetro</th><th>Valor</th>
        </tr></thead>
        <tbody>
          <tr>
            <td class="label-cell">Tipo de sistema</td>
            <td class="value-cell">${sysLabel}</td>
            <td class="label-cell">Operador de red</td>
            <td class="value-cell">${data.operator || '—'}</td>
          </tr>
          <tr>
            <td class="label-cell">Consumo mensual</td>
            <td class="value-cell">${data.monthlyKwh || '—'} kWh/mes</td>
            <td class="label-cell">CO₂ evitado anual</td>
            <td class="value-cell">${co2} kg/año</td>
          </tr>
          <tr>
            <td class="label-cell">Producción anual estimada</td>
            <td class="value-cell">${r.ap != null ? fmtN(r.ap) : '—'} kWh/año</td>
            <td class="label-cell">Producción 25 años</td>
            <td class="value-cell">${prod25y} kWh</td>
          </tr>
          <tr>
            <td class="label-cell">Ahorro 25 años estimado</td>
            <td class="value-cell">${b.saving25yCOP != null ? fmtCOP(b.saving25yCOP) : '—'}</td>
            <td class="label-cell">Módulos fotovoltaicos</td>
            <td class="value-cell">${r.numPanels || '—'} unidades</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>`;
}

// ── Page 3: Especificaciones Técnicas ─────────────────────────────────────────

function renderSpecs(data) {
  const r = data.results || {};
  const p = data.panel || {};
  const inv = r.inv || {};
  const b = data.budget || {};
  const batt = data.batt || null;
  const battQty = data.battQty || 0;

  const panelArea = (p.lengthMm && p.widthMm && r.numPanels)
    ? ((p.lengthMm * p.widthMm) / 1e6 * r.numPanels).toFixed(1)
    : '—';

  const prPct = data.pr != null ? Math.round(data.pr * 100) : 78;
  const lossePct = 100 - prPct;
  const dest = data.city || data.dept || '—';
  const ns = r.ns != null ? r.ns : '—';
  const ppss = r.ppss != null ? r.ppss : '—';

  const invPhaseLabel = inv.phase === 3 ? 'Trifásico' : inv.phase === 1 ? 'Monofásico' : '—';

  const hasBatt = data.systemType !== 'on-grid' && batt;

  return `
  <!-- ════════════════════ ESPECIFICACIONES TÉCNICAS ════════════════════ -->
  <div class="page-break"></div>
  <section class="section">
    <div class="section-header">
      <span class="section-number">2</span>
      <span class="section-title">Especificaciones Técnicas</span>
    </div>

    <table class="avoid-break">
      <thead><tr><th colspan="2">Módulo Fotovoltaico (Panel FV)</th></tr></thead>
      <tbody>
        <tr><td class="label-cell">Fabricante / Modelo</td><td class="value-cell">${p.brand || '—'} ${p.model || ''}</td></tr>
        <tr><td class="label-cell">Potencia pico (Pmax STC)</td><td class="value-cell">${p.wp || '—'} Wp</td></tr>
        <tr><td class="label-cell">Tensión circuito abierto (Voc)</td><td class="value-cell">${p.voc != null ? p.voc.toFixed(2) : 'N/D'} V</td></tr>
        <tr><td class="label-cell">Tensión máx. potencia (Vmp)</td><td class="value-cell">${p.vmp != null ? p.vmp.toFixed(2) : 'N/D'} V</td></tr>
        <tr><td class="label-cell">Corriente cortocircuito (Isc)</td><td class="value-cell">${p.isc != null ? p.isc.toFixed(2) : 'N/D'} A</td></tr>
        <tr><td class="label-cell">Corriente máx. potencia (Imp)</td><td class="value-cell">${p.imp != null ? p.imp.toFixed(2) : 'N/D'} A</td></tr>
        <tr><td class="label-cell">Coef. temperatura Pmax (γ)</td><td class="value-cell">${p.tempCoeffPmax != null ? p.tempCoeffPmax.toFixed(3) : 'N/D'} %/°C</td></tr>
        <tr><td class="label-cell">Dimensiones (L × A)</td><td class="value-cell">${p.lengthMm && p.widthMm ? `${p.lengthMm} × ${p.widthMm} mm` : 'N/D'}</td></tr>
        <tr><td class="label-cell">Peso del módulo</td><td class="value-cell">${p.kg != null ? p.kg + ' kg' : 'N/D'}</td></tr>
        <tr><td class="label-cell">Cantidad de módulos</td><td class="value-cell highlight-td">${r.numPanels || '—'} unidades</td></tr>
        <tr><td class="label-cell">Área total instalada</td><td class="value-cell">${panelArea} m²</td></tr>
        <tr><td class="label-cell">Área de techo requerida</td><td class="value-cell">${r.roof != null ? r.roof + ' m²' : '—'}</td></tr>
      </tbody>
    </table>

    <table class="avoid-break">
      <thead><tr><th colspan="2">Inversor / Controlador</th></tr></thead>
      <tbody>
        <tr><td class="label-cell">Fabricante / Modelo</td><td class="value-cell">${inv.brand || '—'} ${inv.model || ''}</td></tr>
        <tr><td class="label-cell">Potencia nominal AC</td><td class="value-cell">${inv.kw != null ? inv.kw + ' kW' : '—'}</td></tr>
        <tr><td class="label-cell">Tipo / Fase</td><td class="value-cell">${labelSystemType(data.systemType).split(' ')[0]} · ${invPhaseLabel}</td></tr>
        <tr><td class="label-cell">Tensión AC</td><td class="value-cell">${inv.vac != null ? inv.vac + ' V' : 'N/D'}</td></tr>
        <tr><td class="label-cell">Vdc máx.</td><td class="value-cell">${inv.vocMax != null ? inv.vocMax + ' V' : 'N/D'}</td></tr>
        <tr><td class="label-cell">Rango MPPT (Vmin – Vmax)</td><td class="value-cell">${inv.mpptVmin != null && inv.mpptVmax != null ? `${inv.mpptVmin} – ${inv.mpptVmax} V` : 'N/D'}</td></tr>
        <tr><td class="label-cell">Número de MPPT</td><td class="value-cell">${inv.mpptCount != null ? inv.mpptCount : 'N/D'}</td></tr>
        <tr><td class="label-cell">Corriente DC máx. (Idc_max)</td><td class="value-cell">${inv.idcMax != null ? inv.idcMax + ' A' : 'N/D'}</td></tr>
        <tr><td class="label-cell">Eficiencia máxima</td><td class="value-cell">${inv.efficiency != null ? inv.efficiency + '%' : 'N/D'}</td></tr>
        <tr><td class="label-cell">DC/AC ratio</td><td class="value-cell">${r.dca != null ? r.dca : '—'}</td></tr>
      </tbody>
    </table>

    <table class="avoid-break">
      <thead><tr><th colspan="2">Parámetros del Sistema</th></tr></thead>
      <tbody>
        <tr><td class="label-cell">Tipo de sistema</td><td class="value-cell">${labelSystemType(data.systemType)}</td></tr>
        <tr><td class="label-cell">Capacidad pico instalada</td><td class="value-cell highlight-td">${r.actKwp != null ? r.actKwp + ' kWp' : '—'}</td></tr>
        <tr><td class="label-cell">Configuración de strings</td><td class="value-cell">${ns} string(s) × ${ppss} paneles/string</td></tr>
        <tr><td class="label-cell">Tensión DC bus</td><td class="value-cell">${data.busVoltage != null ? data.busVoltage + ' V' : '48 V'}</td></tr>
        <tr><td class="label-cell">PR regional (Performance Ratio)</td><td class="value-cell">${prPct}% — Fuente: PVGIS + IDEAM zona ${dest}</td></tr>
        <tr><td class="label-cell">Pérdidas estimadas del sistema</td><td class="value-cell">${lossePct}% (cableado, suciedad, temp., sombreado)</td></tr>
        <tr><td class="label-cell">Fuente de producción</td><td class="value-cell">${r.dataSource || (r.specsSource || 'PSH heurístico')}</td></tr>
        <tr><td class="label-cell">Peso total estimado (estructura)</td><td class="value-cell">${r.kgTotal != null ? fmtN(r.kgTotal) + ' kg' : '—'}</td></tr>
      </tbody>
    </table>

    ${hasBatt ? `
    <table class="avoid-break">
      <thead><tr><th colspan="2">Sistema de Almacenamiento (Baterías)</th></tr></thead>
      <tbody>
        <tr><td class="label-cell">Fabricante / Modelo</td><td class="value-cell">${batt.brand || '—'} ${batt.model || ''}</td></tr>
        <tr><td class="label-cell">Tecnología</td><td class="value-cell">${batt.chemistry || 'LFP'}</td></tr>
        <tr><td class="label-cell">Capacidad por módulo</td><td class="value-cell">${batt.kwh != null ? batt.kwh + ' kWh' : '—'}</td></tr>
        <tr><td class="label-cell">Tensión nominal</td><td class="value-cell">${batt.voltage != null ? batt.voltage + ' V' : '—'}</td></tr>
        <tr><td class="label-cell">Cantidad de módulos</td><td class="value-cell">${battQty} unidades</td></tr>
        <tr><td class="label-cell">Capacidad total del banco</td><td class="value-cell highlight-td">${r.tB != null ? r.tB + ' kWh' : '—'}</td></tr>
        <tr><td class="label-cell">Autonomía estimada</td><td class="value-cell">${r.aut != null ? r.aut + ' horas' : '—'}</td></tr>
        <tr><td class="label-cell">Ciclos de vida</td><td class="value-cell">${batt.cycles != null ? fmtN(batt.cycles) + ' ciclos' : 'N/D'}</td></tr>
      </tbody>
    </table>` : ''}
  </section>`;
}

// ── Page 4: Diagrama Unifilar ─────────────────────────────────────────────────

function renderUnifilar(data) {
  const unifilarSvg = data.unifilarSvg || null;
  let imgContent;
  if (unifilarSvg) {
    const encoded = btoa(unescape(encodeURIComponent(unifilarSvg)));
    imgContent = `<img src="data:image/svg+xml;base64,${encoded}"
      alt="Diagrama Unifilar" style="max-width:100%;max-height:200mm;object-fit:contain;"/>`;
  } else {
    imgContent = `
      <div class="unifilar-placeholder">
        <div style="font-size:22pt;margin-bottom:8pt;color:${TEAL}88;">⚡</div>
        <div>Ver diagrama unifilar adjunto</div>
        <div style="font-size:9pt;color:#aaa;margin-top:6pt;font-weight:400;">
          El diagrama unifilar definitivo se entrega con el diseño de ingeniería
        </div>
      </div>`;
  }

  return `
  <!-- ═══════════════════════ DIAGRAMA UNIFILAR ═══════════════════════ -->
  <div class="page-break"></div>
  <section class="section">
    <div class="section-header">
      <span class="section-number">3</span>
      <span class="section-title">Diagrama Unifilar Eléctrico</span>
    </div>
    <div style="font-size:8.5pt;color:#666;margin-bottom:10pt;">
      Referencia: <strong>RETIE 2013</strong> · <strong>NEC 690</strong> · <strong>IEC 60617</strong> · <strong>NTC 1340</strong>
    </div>
    <div class="unifilar-box avoid-break">
      ${imgContent}
    </div>
    <div class="unifilar-note">
      Diagrama de referencia. La instalación debe ser ejecutada por un profesional RETIE certificado.<br>
      El diseño definitivo incluye etiquetado completo, cálculos de cortocircuito y coordinación de protecciones.
    </div>
  </section>`;
}

// ── Page 5: Análisis Financiero mes a mes ─────────────────────────────────────

function renderMonthlyAnalysis(data) {
  const r = data.results || {};
  const b = data.budget || {};
  const agpe = data.agpe || {};
  const mp = r.mp || 0;
  const tariff = agpe.tariffCU || 650; // COP/kWh

  // Factores de producción mensual (distribución típica Colombia — zona norte más sol en verano)
  // Normalizado para que la suma = 12 × mp (producción anual)
  const MONTHLY_FACTORS = [0.94, 0.91, 0.95, 0.96, 1.00, 1.03, 1.06, 1.05, 1.02, 0.99, 0.95, 0.92];
  const factorSum = MONTHLY_FACTORS.reduce((s, f) => s + f, 0);

  let acum = 0;
  const rows = MESES.map((mes, i) => {
    const factor = MONTHLY_FACTORS[i] / (factorSum / 12);
    const prod = Math.round(mp * factor);
    const ahorro = Math.round(prod * tariff);
    acum += ahorro;
    return `<tr>
      <td class="value-cell">${mes}</td>
      <td style="text-align:right;">${fmtN(prod)}</td>
      <td style="text-align:right;">${fmtN(tariff)}</td>
      <td style="text-align:right;">${fmtCOP(ahorro)}</td>
      <td style="text-align:right;font-weight:600;">${fmtCOP(acum)}</td>
    </tr>`;
  }).join('');

  const totalProdYear = Math.round(mp * 12);
  const totalSavYear = Math.round(totalProdYear * tariff);

  return `
  <!-- ═══════════════════════ ANÁLISIS FINANCIERO ══════════════════════ -->
  <div class="page-break"></div>
  <section class="section">
    <div class="section-header">
      <span class="section-number">4</span>
      <span class="section-title">Análisis Financiero — Año 1 (Mes a Mes)</span>
    </div>

    <table>
      <thead><tr>
        <th>Mes</th>
        <th style="text-align:right;">Prod. (kWh)</th>
        <th style="text-align:right;">Tarifa CU (COP/kWh)</th>
        <th style="text-align:right;">Ahorro factura (COP)</th>
        <th style="text-align:right;">Ahorro acumulado (COP)</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr>
        <td><strong>TOTAL AÑO 1</strong></td>
        <td style="text-align:right;"><strong>${fmtN(totalProdYear)} kWh</strong></td>
        <td style="text-align:right;">—</td>
        <td style="text-align:right;"><strong>${fmtCOP(totalSavYear)}</strong></td>
        <td style="text-align:right;"><strong>${fmtCOP(totalSavYear)}</strong></td>
      </tr></tfoot>
    </table>

    <div class="disclaimer">
      * Producción mensual estimada según factores de irradiación regional. Los ahorros incluyen autoconsumo valorado a tarifa CU del operador.
      Los excedentes inyectados a la red se remunera según CREG 174/2021 (AGPE Menor: CU − G).
      Tarifa CU: ${fmtN(tariff)} COP/kWh (${data.operator || 'operador seleccionado'}).
    </div>
  </section>`;
}

// ── Page 6: Proyección 25 años ────────────────────────────────────────────────

function render25YearProjection(data) {
  const r = data.results || {};
  const b = data.budget || {};
  const agpe = data.agpe || {};
  const mp = r.mp || 0;
  const DEGRADACION = 0.005;
  const tariff = agpe.tariffCU || 650;
  const investment = b.tot || 0;
  const annualSav = agpe.totalAnual || b.sav || 0;
  const roi = b.roiWithDegradation || b.roi || 0;
  const prod25y = b.prod25yKwh || 0;

  const chartSvg = generate25YearChartSvg({ mp, degradation: DEGRADACION, roi, prod25y });

  // Tabla resumen por hitos (años 1, 5, 10, 15, 20, 25)
  const hitos = [1, 5, 10, 15, 20, 25];
  let cumulativeCashFlow = -investment;
  let cashFlowByYear = [-investment];

  for (let y = 1; y <= 25; y++) {
    const degFactor = Math.pow(1 - DEGRADACION, y - 1);
    const savY = Math.round(annualSav * degFactor);
    cumulativeCashFlow += savY;
    cashFlowByYear.push(cumulativeCashFlow);
  }

  const hitoRows = hitos.map(yr => {
    const degFactor = Math.pow(1 - DEGRADACION, yr - 1);
    const prodAnual = Math.round(mp * 12 * degFactor);
    const savAnual = Math.round(annualSav * degFactor);
    const cf = cashFlowByYear[yr];
    const payback = cf >= 0 ? `✓ Recuperado` : '–';
    return `<tr>
      <td class="value-cell" style="text-align:center;">${yr}</td>
      <td style="text-align:right;">${fmtN(prodAnual)}</td>
      <td style="text-align:right;">${fmtCOP(savAnual)}</td>
      <td style="text-align:right;${cf >= 0 ? 'color:#16a34a;font-weight:700;' : 'color:#dc2626;'}">${fmtCOP(cf)}</td>
      <td style="text-align:center;">${payback}</td>
    </tr>`;
  }).join('');

  return `
  <!-- ════════════════════════ PROYECCIÓN 25 AÑOS ════════════════════════ -->
  <div class="page-break"></div>
  <section class="section">
    <div class="section-header">
      <span class="section-number">5</span>
      <span class="section-title">Proyección a 25 Años con Degradación</span>
    </div>

    <div style="font-size:8.5pt;color:#555;margin-bottom:10pt;">
      Modelo de degradación: <strong>0.5%/año</strong> (LFP + módulos cristalinos, norma IEC 61215).
      La línea naranja vertical indica el año de recuperación de la inversión (ROI).
    </div>

    <div class="chart-wrapper avoid-break">
      ${chartSvg}
    </div>

    <table class="avoid-break">
      <thead><tr>
        <th style="text-align:center;">Año</th>
        <th style="text-align:right;">Prod. anual (kWh)</th>
        <th style="text-align:right;">Ahorro anual (COP)</th>
        <th style="text-align:right;">Flujo caja acum. (COP)</th>
        <th style="text-align:center;">Payback</th>
      </tr></thead>
      <tbody>${hitoRows}</tbody>
      <tfoot><tr>
        <td colspan="2"><strong>Producción total 25 años</strong></td>
        <td style="text-align:right;"><strong>${fmtCOP(b.saving25yCOP || 0)}</strong></td>
        <td colspan="2" style="text-align:center;"><strong>ROI: ~${roi} años</strong></td>
      </tr></tfoot>
    </table>

    <div class="disclaimer">
      Flujo de caja acumulado inicia en −${fmtCOP(investment)} (inversión total). Ahorro calculado a tarifa CU constante
      actual. La tarifa real puede variar con la inflación energética (+3–6%/año histórico en Colombia), lo que
      mejoraría el retorno efectivo. Degradación lineal de producción: 0.5%/año (IEC 61215, LFP).
    </div>
  </section>`;
}

// ── Page 7: Beneficio Fiscal Ley 1715 ────────────────────────────────────────

function renderFiscal(data) {
  const b = data.budget || {};
  const ivaAhorrado = b.ivaAhorrado || 0;
  const deduccionRenta50 = b.deduccionRenta50 || 0;
  const depAcelerada = b.depAcelerada || 0;
  const arancelAhorrado = data.arancelAhorrado || 0;
  const totalBeneficioFiscalConArancel = data.totalBeneficioFiscalConArancel
    || (ivaAhorrado + deduccionRenta50 + (arancelAhorrado || 0));
  const sA = b.sA || 0;

  return `
  <!-- ════════════════════ BENEFICIO FISCAL LEY 1715 ════════════════════ -->
  <div class="page-break"></div>
  <section class="section">
    <div class="section-header">
      <span class="section-number">6</span>
      <span class="section-title">Beneficio Fiscal — Ley 1715/2014</span>
    </div>

    <div style="font-size:8.5pt;color:#555;margin-bottom:12pt;line-height:1.6;">
      La Ley 1715 de 2014 otorga incentivos tributarios a los proyectos de Fuentes No Convencionales
      de Energía Renovable (FNCER). Los beneficios se suman y pueden reducir significativamente
      la inversión neta efectiva del proyecto.
    </div>

    <table class="avoid-break">
      <thead><tr>
        <th>Beneficio</th>
        <th>Base de cálculo</th>
        <th style="text-align:right;">Monto estimado (COP)</th>
      </tr></thead>
      <tbody>
        <tr>
          <td class="value-cell">IVA excluido (Art. 12 Ley 1715)</td>
          <td>19% sobre Sección A — equipos FNCER</td>
          <td style="text-align:right;">${fmtCOP(ivaAhorrado)}</td>
        </tr>
        <tr>
          <td class="value-cell">Deducción renta 50% (Art. 11)</td>
          <td>50% inversión total × tasa efectiva renta 35%</td>
          <td style="text-align:right;">${fmtCOP(deduccionRenta50)}</td>
        </tr>
        <tr>
          <td class="value-cell">Depreciación acelerada (Decreto 829/2020)</td>
          <td>15%/año × 5 años × tasa renta 35%</td>
          <td style="text-align:right;">${fmtCOP(depAcelerada)}</td>
        </tr>
        ${arancelAhorrado ? `<tr>
          <td class="value-cell">Exención arancelaria (Art. 13)</td>
          <td>≈5% sobre equipos importados</td>
          <td style="text-align:right;">${fmtCOP(arancelAhorrado)}</td>
        </tr>` : ''}
      </tbody>
      <tfoot>
        <tr class="total-row">
          <td colspan="2"><strong>TOTAL BENEFICIO FISCAL ESTIMADO</strong></td>
          <td style="text-align:right;font-size:12pt;color:${ORANGE};"><strong>${fmtCOP(totalBeneficioFiscalConArancel)}</strong></td>
        </tr>
      </tfoot>
    </table>

    <div style="margin-top:14pt;margin-bottom:10pt;">
      <table class="avoid-break">
        <thead><tr><th colspan="2">Impacto en la Inversión Neta</th></tr></thead>
        <tbody>
          <tr><td class="label-cell">Inversión bruta total</td><td class="value-cell">${fmtCOP(b.tot || 0)}</td></tr>
          <tr><td class="label-cell">Sección A — equipos (excluye IVA)</td><td class="value-cell">${fmtCOP(sA)}</td></tr>
          <tr><td class="label-cell">Sección B — instalación y servicios</td><td class="value-cell">${fmtCOP(b.sB || 0)}</td></tr>
          <tr><td class="label-cell">IVA Sección B (19%)</td><td class="value-cell">${fmtCOP(b.iva || 0)}</td></tr>
          <tr class="total-row"><td><strong>Inversión neta efectiva estimada</strong></td><td><strong>${fmtCOP((b.tot || 0) - totalBeneficioFiscalConArancel)}</strong></td></tr>
        </tbody>
      </table>
    </div>

    <div class="disclaimer">
      <strong>Aviso legal importante:</strong> Estos valores son estimaciones con fines informativos.
      El beneficio fiscal real depende de la situación tributaria específica del titular del proyecto,
      su naturaleza jurídica (persona natural o jurídica), el régimen fiscal aplicable y la correcta
      acreditación de los equipos ante la UPME. Consultar con contador o asesor tributario especializado
      en Ley 1715 antes de tomar decisiones de inversión basadas en estos valores.
    </div>

    <div class="ref-block">
      Referencias normativas: Ley 1715/2014 · Decreto 2143/2015 · Decreto 829/2020 ·
      Resolución UPME 045/2016 · CREG 174/2021 · Circular DIAN 000145/2020.
    </div>
  </section>`;
}

// ── Page 8: Normativa Aplicable ───────────────────────────────────────────────

function renderNormativa(data) {
  const sysType = data.systemType || 'on-grid';
  const hasExcedentes = (data.agpe?.excedentes || 0) > 0;

  const norms = [
    {
      norm: 'Ley 1715/2014',
      desc: 'Marco general FNCER — Fuentes No Convencionales de Energía Renovable. Incentivos tributarios (Arts. 11-13) y conexión a la red.',
      aplic: 'Aplica — obligatoria para todos los sistemas FV conectados a red.',
    },
    {
      norm: 'CREG 174/2021',
      desc: 'Regulación AGPE (Autogeneración a Pequeña Escala). Define categorías Menor (≤100 kWp) y Mayor (100–1000 kWp), tarifas de excedentes y procedimiento de conexión.',
      aplic: hasExcedentes
        ? `Aplica — sistema inyecta excedentes (AGPE ${data.agpe?.agpeCategory || 'Menor'}).`
        : sysType === 'off-grid' ? 'No aplica — sistema off-grid no conectado a red.' : 'Aplica — referencia para tarifas de autoconsumo.',
    },
    {
      norm: 'RETIE 2013',
      desc: 'Reglamento Técnico de Instalaciones Eléctricas. Requisitos de seguridad para instalaciones FV: protecciones DC/AC, puesta a tierra, calibre de conductores, señalización.',
      aplic: 'Aplica — obligatorio. Instalación debe ser ejecutada y avalada por profesional RETIE.',
    },
    {
      norm: 'CREG 038/2014',
      desc: 'Código de Medida. Requisitos para medidores bidireccionales en puntos de conexión AGPE. Aplica cuando hay inyección de excedentes.',
      aplic: hasExcedentes ? 'Aplica — medidor bidireccional requerido.' : 'Referencia — aplica si hay excedentes futuros.',
    },
    {
      norm: 'NTC 1340',
      desc: 'Norma Técnica Colombiana de Simbología Eléctrica. Símbolos y convenciones para planos eléctricos y diagrama unifilar.',
      aplic: 'Aplica — requerida en planos de ingeniería.',
    },
    {
      norm: 'IEC 61215 / IEC 61730',
      desc: 'Normas internacionales de calificación de diseño y seguridad para módulos fotovoltaicos cristalinos. Exigidas para certificación de equipos.',
      aplic: 'Aplica — módulos deben presentar certificación vigente.',
    },
    {
      norm: 'IEC 62109-1/2',
      desc: 'Seguridad de convertidores de potencia para uso en sistemas de energía fotovoltaica. Aplica al inversor.',
      aplic: 'Aplica — inversor debe presentar certificación vigente.',
    },
    {
      norm: 'NEC 690 (ref.)',
      desc: 'National Electrical Code — Solar Photovoltaic Systems. Referencia de diseño para cálculo de Vdc máximo en condiciones de temperatura mínima (NEC 690.7).',
      aplic: 'Referencia — complementa RETIE para diseño de strings.',
    },
    {
      norm: 'Decreto 829/2020',
      desc: 'Reglamenta la depreciación acelerada de activos de FNCER: 5 años en lugar de 20 (amortización 15%/año).',
      aplic: 'Aplica — personas jurídicas con proyectos FNCER.',
    },
    {
      norm: 'Decreto 2143/2015',
      desc: 'Reglamento de la Ley 1715. Define procedimientos para acceder a los beneficios tributarios ante la UPME y el MADS.',
      aplic: 'Aplica — requerido para trámite de beneficios tributarios ante UPME.',
    },
  ];

  const rows = norms.map((n, i) => `<tr>
    <td><span class="norm-badge">${n.norm}</span></td>
    <td style="font-size:8.5pt;color:#333;">${n.desc}</td>
    <td style="font-size:8.5pt;color:#444;">${n.aplic}</td>
  </tr>`).join('');

  return `
  <!-- ══════════════════════ NORMATIVA APLICABLE ══════════════════════ -->
  <div class="page-break"></div>
  <section class="section">
    <div class="section-header">
      <span class="section-number">7</span>
      <span class="section-title">Normativa Aplicable</span>
    </div>

    <table>
      <thead><tr>
        <th style="width:18%;">Norma</th>
        <th style="width:52%;">Descripción</th>
        <th style="width:30%;">Aplicabilidad</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="ref-block">
      Para información sobre conexión al OR: <strong>${data.operator || 'Operador de Red'}</strong> ·
      UPME: <a href="https://www1.upme.gov.co" style="color:${TEAL};">upme.gov.co</a> ·
      CREG: <a href="http://www.creg.gov.co" style="color:${TEAL};">creg.gov.co</a>
    </div>
  </section>`;
}

// ── Last page: Cierre y Próximos Pasos ────────────────────────────────────────

function renderClosing(data) {
  const ref = quoteRef(data.id, data.date);
  const fecha = fechaLarga(data.date);

  const steps = [
    'Visita técnica y levantamiento arquitectónico del techo (incluye orientación, estructura, sombreado real).',
    'Levantamiento eléctrico del tablero de distribución y punto de medida (para medidor bidireccional).',
    'Diseño definitivo del sistema con diagrama unifilar certificado RETIE y memoria de cálculo.',
    'Firma del contrato de instalación y financiamiento (si aplica). Anticipo para importación de equipos.',
    'Instalación y puesta en marcha por técnico RETIE certificado. Pruebas de funcionamiento y comisionado.',
    'Trámite de conexión ante el Operador de Red (OR) y activación del medidor bidireccional (AGPE).',
    'Asesoría para acceso a beneficios tributarios Ley 1715 ante la UPME (si aplica).',
  ];

  return `
  <!-- ════════════════════════ CIERRE Y FIRMA ════════════════════════ -->
  <div class="page-break"></div>
  <section class="section">
    <div class="section-header">
      <span class="section-number">8</span>
      <span class="section-title">Próximos Pasos</span>
    </div>

    <div class="closing-steps">
      ${steps.map((s, i) => `
      <div class="closing-step">
        <div class="closing-step-num">${i + 1}</div>
        <div class="closing-step-text">${s}</div>
      </div>`).join('')}
    </div>

    <div class="validity-box avoid-break">
      <span class="validity-icon">⏳</span>
      <div>
        <strong>Cotización ${ref}</strong> — Válida por <strong>30 días</strong> a partir del ${fecha}.<br>
        <span style="font-size:8pt;color:#666;">Los precios están sujetos a variación cambiaria (TRM) y disponibilidad de equipos.</span>
      </div>
    </div>

    <div class="signature-box avoid-break">
      <div class="signature-block">
        <div class="signature-label">Preparado por</div>
        <div class="signature-line">
          ALEBAS Ingeniería SAS<br>
          <span style="font-weight:400;font-size:8pt;color:#666;">
            NIT 901.992.450-5 · solar-hub.co · ing@alebas.co
          </span>
        </div>
      </div>

      <div class="signature-block">
        <div class="signature-label">Aceptado por</div>
        <div class="signature-line">
          ${data.name || '______________________________'}<br>
          <span style="font-weight:400;font-size:8pt;color:#666;">
            ${data.company ? data.company + ' · ' : ''}${data.email || ''}<br>
            Fecha: ______________________________
          </span>
        </div>
      </div>

      <div>
        <div class="qr-placeholder">
          <div style="font-size:7pt;color:#999;text-align:center;padding:4pt;">
            ${logoSvg(36)}
            <div style="margin-top:4pt;">QR<br>seguimiento</div>
          </div>
        </div>
      </div>
    </div>

    <div style="margin-top:20pt;padding-top:12pt;border-top:1pt solid #e0e0e0;
                display:flex;justify-content:space-between;align-items:center;">
      <div style="font-size:7.5pt;color:#888;">
        Documento generado el ${fecha} · SolarHub by ALEBAS Ingeniería SAS<br>
        solar-hub.co · (+57) 310 000 0000 · ing@alebas.co
      </div>
      <div style="font-size:7.5pt;color:#bbb;">
        ${ref}
      </div>
    </div>
  </section>`;
}

// ── Presupuesto detallado ─────────────────────────────────────────────────────

function renderBudget(data) {
  const b = data.budget || {};

  return `
  <!-- ═════════════════════ PRESUPUESTO DETALLADO ═════════════════════ -->
  <div class="page-break"></div>
  <section class="section">
    <div class="section-header">
      <span class="section-number">9</span>
      <span class="section-title">Presupuesto Detallado</span>
    </div>

    <table class="avoid-break">
      <thead><tr><th colspan="2">Sección A — Equipos Principales (excluye IVA, Ley 1715 Art. 12)</th></tr></thead>
      <tbody>
        <tr><td class="label-cell">Módulos fotovoltaicos</td><td class="value-cell" style="text-align:right;">${fmtCOP(b.pC || 0)}</td></tr>
        <tr><td class="label-cell">Inversor / controlador</td><td class="value-cell" style="text-align:right;">${fmtCOP(b.iC || 0)}</td></tr>
        ${b.bC ? `<tr><td class="label-cell">Sistema de baterías</td><td class="value-cell" style="text-align:right;">${fmtCOP(b.bC)}</td></tr>` : ''}
        <tr class="total-row"><td><strong>Subtotal Sección A</strong></td><td style="text-align:right;"><strong>${fmtCOP(b.sA || 0)}</strong></td></tr>
      </tbody>
    </table>

    <table class="avoid-break">
      <thead><tr><th colspan="2">Sección B — Instalación y Servicios (incluye IVA 19%)</th></tr></thead>
      <tbody>
        <tr><td class="label-cell">Estructura de montaje</td><td class="value-cell" style="text-align:right;">${fmtCOP(b.st || 0)}</td></tr>
        <tr><td class="label-cell">Cableado DC/AC</td><td class="value-cell" style="text-align:right;">${fmtCOP(b.ca || 0)}</td></tr>
        <tr><td class="label-cell">Protecciones eléctricas</td><td class="value-cell" style="text-align:right;">${fmtCOP(b.pt || 0)}</td></tr>
        <tr><td class="label-cell">Mano de obra instalación</td><td class="value-cell" style="text-align:right;">${fmtCOP(b.ins || 0)}</td></tr>
        <tr><td class="label-cell">Ingeniería y diseño</td><td class="value-cell" style="text-align:right;">${fmtCOP(b.eng || 0)}</td></tr>
        <tr><td class="label-cell">Trámites y conexión OR</td><td class="value-cell" style="text-align:right;">${fmtCOP(b.emsa || 0)}</td></tr>
        <tr><td class="label-cell">Transporte de equipos</td><td class="value-cell" style="text-align:right;">${fmtCOP(b.transport || 0)}</td></tr>
        <tr><td class="label-cell">IVA Sección B (19%)</td><td class="value-cell" style="text-align:right;">${fmtCOP(b.iva || 0)}</td></tr>
        <tr class="total-row"><td><strong>Subtotal Sección B (con IVA)</strong></td><td style="text-align:right;"><strong>${fmtCOP(b.sB || 0)}</strong></td></tr>
      </tbody>
    </table>

    <table class="avoid-break">
      <thead><tr><th colspan="2">Resumen Inversión Total</th></tr></thead>
      <tbody>
        <tr><td class="label-cell">Sección A (equipos, sin IVA)</td><td class="value-cell" style="text-align:right;">${fmtCOP(b.sA || 0)}</td></tr>
        <tr><td class="label-cell">Sección B (instalación + IVA)</td><td class="value-cell" style="text-align:right;">${fmtCOP(b.sB || 0)}</td></tr>
        <tr class="total-row"><td><strong>INVERSIÓN TOTAL</strong></td><td style="text-align:right;font-size:13pt;color:${ORANGE};"><strong>${fmtCOP(b.tot || 0)}</strong></td></tr>
        ${b.budgetUsd ? `<tr><td class="label-cell" style="font-size:8pt;color:#888;">Equivalente USD (referencia TRM)</td><td style="text-align:right;font-size:8pt;color:#888;">≈ USD ${fmtN(b.budgetUsd)}</td></tr>` : ''}
      </tbody>
    </table>

    <div class="disclaimer">
      Los precios de Sección A están en COP y están exentos de IVA según Art. 12 Ley 1715/2014.
      Sección B incluye IVA 19%. El transporte estimado corresponde a la tarifa de
      ${data.budget?.transportCarrier || 'transportadora seleccionada'}.
      Precios válidos con TRM del ${data.budget?.trmDate || 'fecha de cotización'}.
    </div>
  </section>`;
}

// ── Ensamblar el documento HTML completo ──────────────────────────────────────

function buildDocument(data) {
  const ref = quoteRef(data.id, data.date);
  const title = `Propuesta Solar — ${data.name || 'Cliente'} — ${ref}`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>${getStyles()}</style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">⬇ Descargar / Imprimir PDF</button>

  <div class="page">
    ${renderCover(data)}
    ${renderSummary(data)}
    ${renderSpecs(data)}
    ${renderUnifilar(data)}
    ${renderMonthlyAnalysis(data)}
    ${render25YearProjection(data)}
    ${renderFiscal(data)}
    ${renderNormativa(data)}
    ${renderBudget(data)}
    ${renderClosing(data)}
  </div>

  <script>
    // Auto-trigger print dialog after a short delay to allow rendering
    // Remove or comment out if you prefer manual trigger only
    // window.addEventListener('load', () => { setTimeout(() => window.print(), 800); });
  </script>
</body>
</html>`;
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Genera y abre el PDF en una nueva ventana del navegador.
 *
 * @param {object} data - Datos de la cotización (ver JSDoc del módulo)
 * @returns {Promise<void>}
 *
 * Campos adicionales opcionales respecto a la versión anterior:
 *   data.unifilarSvg                   — SVG string del diagrama unifilar
 *   data.arancelAhorrado               — COP ahorro exención arancelaria
 *   data.totalBeneficioFiscalConArancel — COP total beneficio fiscal incluyendo arancel
 *   data.pr                            — Performance Ratio decimal (ej: 0.78)
 *   data.batt                          — Objeto batería (si es hybrid/off-grid)
 *   data.battQty                       — Cantidad de baterías
 */
export async function generatePDF(data) {
  const html = buildDocument(data || {});

  // Abrir en ventana nueva para impresión / "Guardar como PDF" desde el navegador.
  // Esto no requiere ninguna librería externa y produce un PDF de alta calidad con
  // los estilos @media print, paginas A4 y saltos de página controlados.
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) {
    // Si el navegador bloquea popups, fallback a data URL en la pestaña actual
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SolarHub-Cotizacion-${quoteRef(data?.id, data?.date)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return;
  }

  win.document.open();
  win.document.write(html);
  win.document.close();
}

/**
 * Retorna el HTML del documento sin abrir ventana.
 * Útil para email (enviar como adjunto), tests o previsualización en iframe.
 *
 * @param {object} data - Datos de la cotización
 * @returns {string} HTML completo del documento
 */
export function generatePDFHtml(data) {
  return buildDocument(data || {});
}

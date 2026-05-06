// PDF generator para cotizaciones — usado tanto en BackOffice (reenvío admin)
// como en envíos automáticos. Genera un resumen ejecutivo sin requerir el DOM
// completo del Quoter (jsPDF puro, no html2canvas), por lo que puede correr
// desde cualquier vista que tenga acceso al objeto quote.

import { jsPDF } from 'jspdf';

const TEAL = [1, 112, 139];
const ORANGE = [255, 140, 0];
const GRAY = [122, 158, 170];
const DARK = [12, 20, 34];

const fmtCOP = (n) => {
  if (n == null || isNaN(n)) return '—';
  return '$' + Math.round(Number(n)).toLocaleString('es-CO');
};
const fmt = (n) => {
  if (n == null || isNaN(n)) return '—';
  return Math.round(Number(n)).toLocaleString('es-CO');
};

export function generateQuotePdf(quote, opts = {}) {
  const { trackingUrl } = opts;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  let y = 14;

  // Header banner
  doc.setFillColor(...TEAL);
  doc.rect(0, 0, W, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('SolarHub', 14, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Cotización solar fotovoltaica', 14, 18.5);
  doc.setFontSize(8);
  doc.text('solar-hub.co  ·  info@solar-hub.co', W - 14, 13, { align: 'right' });
  if (quote.id != null) {
    doc.text(`Cotización #${String(quote.id).replace(/^r_/, '')}`, W - 14, 18.5, { align: 'right' });
  }

  y = 32;

  // Cliente
  doc.setTextColor(...DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(quote.name || 'Cliente', 14, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  const subline = [quote.company, quote.city, quote.dept, quote.date].filter(Boolean).join(' · ');
  if (subline) { y += 5; doc.text(subline, 14, y); }
  if (quote.email) { y += 4.5; doc.text(quote.email, 14, y); }
  if (quote.phone) { y += 4.5; doc.text(quote.phone, 14, y); }

  y += 9;
  doc.setDrawColor(...TEAL);
  doc.setLineWidth(0.4);
  doc.line(14, y, W - 14, y);
  y += 6;

  // Sistema
  doc.setTextColor(...DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Sistema propuesto', 14, y);
  y += 6;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');

  const r = quote.results || {};
  const b = quote.budget || {};
  const rows1 = [
    ['Tipo', quote.systemType || '—'],
    ['Operador', quote.operator || '—'],
    ['Capacidad', `${r.actKwp || 0} kWp`],
    ['Paneles', `${r.numPanels || 0}`],
    ['Producción', `${fmt(r.mp)} kWh/mes`],
    ['Cobertura', `${r.cov || 0}%`],
    ['Consumo del cliente', `${quote.monthlyKwh || 0} kWh/mes`],
    ['CO₂ evitado', `${fmt(r.co2)} kg/año`],
  ];
  drawKvTable(doc, rows1, 14, y, W - 28);
  y += rows1.length * 5.5 + 6;

  if (quote.panel) {
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(...GRAY);
    doc.setFontSize(8.5);
    const panelLine = `Panel: ${quote.panel.brand || ''} ${quote.panel.model || ''} · ${quote.panel.wp || '—'} Wp`.trim();
    doc.text(panelLine, 14, y);
    y += 6;
  }

  // Inversión y retorno
  doc.setDrawColor(...TEAL);
  doc.line(14, y, W - 14, y);
  y += 6;
  doc.setTextColor(...DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Inversión y retorno', 14, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  const rows2 = [
    ['Sección A (equipos)', fmtCOP(b.sA)],
    ['Sección B (instalación)', fmtCOP(b.sB)],
    ['Transporte', fmtCOP(b.transport)],
    ['Total inversión', fmtCOP(b.tot)],
    ['Ahorro anual estimado', fmtCOP(b.sav)],
    ['Retorno (ROI)', b.roi ? `${b.roi} años` : '—'],
  ];
  drawKvTable(doc, rows2, 14, y, W - 28, { highlightLast: true });
  y += rows2.length * 5.5 + 8;

  // Tracking URL
  if (trackingUrl) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setDrawColor(...ORANGE);
    doc.setFillColor(255, 248, 230);
    doc.rect(14, y - 4, W - 28, 22, 'FD');
    doc.setTextColor(...DARK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Seguimiento de tu cotización', 18, y + 2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text('Sigue el estado de tu solicitud en tiempo real:', 18, y + 7);
    doc.setTextColor(...TEAL);
    doc.setFontSize(8.5);
    doc.textWithLink(trackingUrl, 18, y + 13, { url: trackingUrl });
    y += 26;
  }

  // Footer
  const ph = doc.internal.pageSize.getHeight();
  doc.setDrawColor(220, 220, 220);
  doc.line(14, ph - 16, W - 14, ph - 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY);
  doc.text('SolarHub by ALEBAS Ingeniería · NIT 901.992.450-5 · Villavicencio, Meta', 14, ph - 11);
  doc.text('Esta cotización es válida por 30 días. Precios sujetos a TRM y disponibilidad.', 14, ph - 7);

  return doc;
}

function drawKvTable(doc, rows, x, y, width, opts = {}) {
  const rowH = 5.5;
  const keyW = width * 0.55;
  rows.forEach((row, i) => {
    const yy = y + i * rowH;
    if (i % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(x, yy - 3.5, width, rowH, 'F');
    }
    const isHL = opts.highlightLast && i === rows.length - 1;
    doc.setFont('helvetica', isHL ? 'bold' : 'normal');
    doc.setTextColor(isHL ? 1 : 90, isHL ? 112 : 90, isHL ? 139 : 90);
    doc.setFontSize(9);
    doc.text(String(row[0]), x + 2, yy);
    doc.setTextColor(...DARK);
    doc.text(String(row[1]), x + width - 2, yy, { align: 'right' });
  });
}

export function quotePdfAsBase64(quote, opts) {
  const doc = generateQuotePdf(quote, opts);
  // jsPDF datauristring: "data:application/pdf;base64,...", strip prefix
  const dataUri = doc.output('datauristring');
  return dataUri.split(',')[1] || dataUri;
}

export function downloadQuotePdf(quote, opts) {
  const doc = generateQuotePdf(quote, opts);
  const filename = `cotizacion-solarhub-${String(quote.id || Date.now()).replace(/^r_/, '')}.pdf`;
  doc.save(filename);
}

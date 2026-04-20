// Vercel serverless function: catálogo curado de baterías de litio
// disponibles en el mercado colombiano. No existe un equivalente CEC/NREL
// para baterías, así que servimos una base verificada con specs de
// fabricante (Pylontech, BYD, Huawei, Deye, Dyness, Hubble, Victron,
// GoodWe). Filtrada por tecnología y ventana de voltaje. Cache edge 7 días.

const CATALOG = [
  // --- Stack HV (alto voltaje) — ideales para inversores híbridos 5-12 kW ---
  { id: 'pylontech-force-h2', brand: 'Pylontech', model: 'Force H2 (módulo 3.55 kWh)', chemistry: 'LFP', kwh: 3.55, v: 102.4, arch: 'HV-stack', cycles: 6000, dod: 0.95, warrantyYears: 10, kgPerModule: 38 },
  { id: 'byd-hvs-7.7', brand: 'BYD', model: 'Battery-Box Premium HVS 7.7', chemistry: 'LFP', kwh: 7.68, v: 204, arch: 'HV-stack', cycles: 6000, dod: 0.96, warrantyYears: 10, kgPerModule: 91 },
  { id: 'byd-hvm-11', brand: 'BYD', model: 'Battery-Box Premium HVM 11.0', chemistry: 'LFP', kwh: 11.04, v: 307, arch: 'HV-stack', cycles: 6000, dod: 0.96, warrantyYears: 10, kgPerModule: 128 },
  { id: 'huawei-luna-5', brand: 'Huawei', model: 'LUNA2000-5-S0', chemistry: 'LFP', kwh: 5, v: 360, arch: 'HV-stack', cycles: 6000, dod: 1.0, warrantyYears: 10, kgPerModule: 50 },
  { id: 'huawei-luna-15', brand: 'Huawei', model: 'LUNA2000-15-S0', chemistry: 'LFP', kwh: 15, v: 360, arch: 'HV-stack', cycles: 6000, dod: 1.0, warrantyYears: 10, kgPerModule: 148 },
  { id: 'goodwe-lynx-h', brand: 'GoodWe', model: 'Lynx Home F G2 (10 kWh)', chemistry: 'LFP', kwh: 10.24, v: 204, arch: 'HV-stack', cycles: 6000, dod: 0.95, warrantyYears: 10, kgPerModule: 112 },

  // --- LV 48 V — compatibles con casi cualquier inversor off-grid/híbrido ---
  { id: 'pylontech-us3000c', brand: 'Pylontech', model: 'US3000C', chemistry: 'LFP', kwh: 3.55, v: 48, arch: 'LV-48V', cycles: 6000, dod: 0.95, warrantyYears: 10, kgPerModule: 32 },
  { id: 'pylontech-us5000', brand: 'Pylontech', model: 'US5000', chemistry: 'LFP', kwh: 4.8, v: 48, arch: 'LV-48V', cycles: 6000, dod: 0.95, warrantyYears: 10, kgPerModule: 40 },
  { id: 'hubble-am2', brand: 'Hubble', model: 'AM-2', chemistry: 'LFP', kwh: 5.5, v: 51.2, arch: 'LV-48V', cycles: 6000, dod: 0.95, warrantyYears: 10, kgPerModule: 52 },
  { id: 'dyness-b4850', brand: 'Dyness', model: 'B4850', chemistry: 'LFP', kwh: 2.4, v: 48, arch: 'LV-48V', cycles: 6000, dod: 0.9, warrantyYears: 10, kgPerModule: 27 },
  { id: 'deye-seg51', brand: 'Deye', model: 'SE-G5.1 Pro-B', chemistry: 'LFP', kwh: 5.12, v: 51.2, arch: 'LV-48V', cycles: 6000, dod: 0.9, warrantyYears: 10, kgPerModule: 51 },
  { id: 'victron-lifepo4-200', brand: 'Victron', model: 'LiFePO4 25.6V/200Ah Smart', chemistry: 'LFP', kwh: 5.12, v: 25.6, arch: 'LV-24V', cycles: 5000, dod: 0.8, warrantyYears: 5, kgPerModule: 49 },
];

function filterCatalog(q = '', arch = '') {
  const needle = q.trim().toLowerCase();
  return CATALOG.filter(b => {
    if (arch && b.arch !== arch) return false;
    if (!needle) return true;
    return (b.brand + ' ' + b.model + ' ' + b.chemistry + ' ' + b.arch).toLowerCase().includes(needle);
  });
}

export default function handler(req, res) {
  const { q = '', arch = '', limit = '50' } = req.query;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=604800, stale-while-revalidate=86400');
  try {
    const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const items = filterCatalog(q, arch).slice(0, lim);
    return res.status(200).json({
      items,
      total: items.length,
      source: 'Curated Colombian market catalog',
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ error: `batteries fetch failed: ${err.message}` });
  }
}

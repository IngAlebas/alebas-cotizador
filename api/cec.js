// Vercel serverless function: proxy a la base de datos CEC (California Energy
// Commission) de paneles e inversores solares, mantenida por NREL en el repo
// SAM (System Advisor Model). Datos curados oficialmente — esenciales para
// validar layouts y construir unifilares precisos.
//
// GET /api/cec?type=panel&q=JA+Solar+545&limit=10
// GET /api/cec?type=inverter&q=Growatt+MIN
//
// La base cambia trimestralmente → edge cache 7 días. Parseo en memoria
// con caché de módulo para evitar refetch en cold starts calientes.

const CEC_MODULES_URL =
  'https://raw.githubusercontent.com/NREL/SAM/develop/deploy/libraries/CEC%20Modules.csv';
const CEC_INVERTERS_URL =
  'https://raw.githubusercontent.com/NREL/SAM/develop/deploy/libraries/CEC%20Inverters.csv';

// Caché en memoria del container (persiste entre requests hot).
let cache = { panels: null, inverters: null, fetchedAt: 0 };
const MEMORY_TTL_MS = 24 * 60 * 60 * 1000;

// Parser CSV minimalista tolerante a comillas y comas dentro de campos.
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 3) return [];
  // Los CSV del SAM tienen 2-3 headers: fila 0 = nombres, fila 1 = unidades, fila 2 = tipos.
  const headers = splitCSVLine(lines[0]);
  const dataStart = isNaN(parseFloat(splitCSVLine(lines[1])[1])) ? 3 : 1;
  const rows = [];
  for (let i = dataStart; i < lines.length; i++) {
    const cells = splitCSVLine(lines[i]);
    if (cells.length !== headers.length) continue;
    const row = {};
    headers.forEach((h, idx) => { row[h] = cells[idx]; });
    rows.push(row);
  }
  return rows;
}

function splitCSVLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ',' && !inQ) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

async function loadCSV(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'alebas-cotizador/1.0' } });
  if (!r.ok) throw new Error(`CEC HTTP ${r.status}`);
  return parseCSV(await r.text());
}

async function ensureLoaded() {
  const fresh = Date.now() - cache.fetchedAt < MEMORY_TTL_MS;
  if (fresh && cache.panels && cache.inverters) return;
  const [panels, inverters] = await Promise.all([
    loadCSV(CEC_MODULES_URL),
    loadCSV(CEC_INVERTERS_URL),
  ]);
  cache = { panels, inverters, fetchedAt: Date.now() };
}

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

// Normaliza fila CEC de panel al schema interno del cotizador.
// Nombres CEC (oficiales, estables): Name, Manufacturer, Technology, STC,
// PTC, A_c, N_s, I_sc_ref, V_oc_ref, I_mp_ref, V_mp_ref, alpha_sc, beta_oc,
// gamma_r, Length, Width.
function normalizePanel(row) {
  const name = row.Name || row['Name '] || '';
  const parts = name.split(' ');
  const brand = row.Manufacturer || parts[0] || '';
  const model = name.replace(brand, '').trim() || name;
  return {
    brand,
    model,
    fullName: name,
    wp: num(row.STC) ?? num(row.P_mp_ref),
    voc: num(row.V_oc_ref),
    vmp: num(row.V_mp_ref),
    isc: num(row.I_sc_ref),
    imp: num(row.I_mp_ref),
    tempCoeffPmax: num(row.gamma_r),     // %/°C sobre Pmax
    tempCoeffVoc: num(row.beta_oc),      // V/°C sobre Voc (convertido a %/°C abajo)
    length_m: num(row.Length),
    width_m: num(row.Width),
    cellCount: num(row.N_s),
    technology: row.Technology || 'Mono-c-Si',
    source: 'CEC',
  };
}

// Normaliza fila CEC de inversor. Nombres: Name, Vac, Pso, Paco, Pdco, Vdco,
// C0..C3, Pnt, Vdcmax, Idcmax, Mppt_low, Mppt_high, CEC_Date.
function normalizeInverter(row) {
  const name = row.Name || row['Name '] || '';
  const parts = name.split(':');
  const brand = parts[0]?.trim() || '';
  const model = parts.slice(1).join(':').trim() || name;
  const vac = num(row.Vac) || 208;
  const phase = vac >= 380 ? 3 : 1;
  return {
    brand,
    model,
    fullName: name,
    kw: num(row.Paco) ? num(row.Paco) / 1000 : null,
    acMaxContinuousW: num(row.Paco),
    vac,
    phase,
    vocMax: num(row.Vdcmax),
    mpptVmin: num(row.Mppt_low),
    mpptVmax: num(row.Mppt_high),
    idcMax: num(row.Idcmax),
    vdcNominal: num(row.Vdco),
    source: 'CEC',
  };
}

function matches(text, q) {
  if (!q) return true;
  const T = (text || '').toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every(tok => T.includes(tok));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { type, q = '', limit = '20' } = req.query;
  const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

  if (type !== 'panel' && type !== 'inverter') {
    return res.status(400).json({ error: "type debe ser 'panel' o 'inverter'" });
  }
  try {
    await ensureLoaded();
    const rows = type === 'panel' ? cache.panels : cache.inverters;
    const normalize = type === 'panel' ? normalizePanel : normalizeInverter;
    const filtered = [];
    for (const row of rows) {
      const name = row.Name || '';
      if (!matches(name, q)) continue;
      filtered.push(normalize(row));
      if (filtered.length >= lim) break;
    }
    res.setHeader('Cache-Control', 's-maxage=604800, stale-while-revalidate=86400');
    return res.status(200).json({
      type,
      count: filtered.length,
      total: rows.length,
      results: filtered,
      source: 'NREL SAM / CEC',
    });
  } catch (err) {
    return res.status(502).json({ error: `CEC fetch failed: ${err.message}` });
  }
}

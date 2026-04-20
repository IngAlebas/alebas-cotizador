// PVGIS API service — European Commission's free PV simulation tool
// Docs: https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis_en
// Returns more accurate annual production than static PSH heuristics
// because it uses location-specific irradiation and meteorological data.

const PVGIS_URL = 'https://re.jrc.ec.europa.eu/api/v5_2/PVcalc';
const CACHE_PREFIX = 'pvgis:';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

const k = (lat, lon, kwp, tilt, az) =>
  `${CACHE_PREFIX}${lat.toFixed(2)}:${lon.toFixed(2)}:${kwp}:${tilt}:${az}`;

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.t > CACHE_TTL_MS) return null;
    return parsed.d;
  } catch { return null; }
}

function writeCache(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), d: data })); } catch {}
}

// Defaults óptimos para Colombia (latitudes 0–12°N): inclinación baja, azimut sur.
export async function fetchPVProduction({ lat, lon, kwp, losses = 14, tilt = 10, azimuth = 0 }) {
  if (!lat || !lon || !kwp) throw new Error('PVGIS: faltan lat/lon/kwp');
  const key = k(lat, lon, kwp, tilt, azimuth);
  const cached = readCache(key);
  if (cached) return { ...cached, cached: true };

  const url = `${PVGIS_URL}?lat=${lat}&lon=${lon}&peakpower=${kwp}&loss=${losses}&angle=${tilt}&aspect=${azimuth}&outputformat=json&pvtechchoice=crystSi&mountingplace=building`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`PVGIS HTTP ${r.status}`);
  const j = await r.json();
  const fixed = j?.outputs?.totals?.fixed;
  const monthly = j?.outputs?.monthly?.fixed;
  if (!fixed?.E_y) throw new Error('PVGIS: respuesta sin datos');

  const data = {
    annualKwh: Math.round(fixed.E_y),
    monthlyKwh: monthly?.map(m => ({ month: m.month, kwh: Math.round(m.E_m) })) || [],
    irradiationAnnual: parseFloat(fixed['H(i)_y']?.toFixed(0)),
    psh: parseFloat((fixed['H(i)_y'] / 365).toFixed(2)),
    source: 'PVGIS',
    cached: false,
  };
  writeCache(key, data);
  return data;
}

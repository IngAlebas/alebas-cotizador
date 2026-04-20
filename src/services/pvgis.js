// PVGIS client — consume el proxy Vercel (/api/pvgis) para evitar CORS.
// El proxy a su vez consulta re.jrc.ec.europa.eu/api/v5_2/PVcalc y
// cachea en edge 7 días. Mantenemos caché local adicional para evitar
// fetchs repetidos durante la misma sesión.

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

  const params = new URLSearchParams({ lat, lon, kwp, tilt, azimuth, losses });
  const r = await fetch(`/api/pvgis?${params}`);
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || `PVGIS proxy HTTP ${r.status}`);
  }
  const data = { ...(await r.json()), cached: false };
  writeCache(key, data);
  return data;
}

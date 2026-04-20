// Cliente PVGIS — POST al webhook n8n que proxy a re.jrc.ec.europa.eu.
// Mantiene caché localStorage 30 días por combinación de coordenadas.

import { n8nPost, n8nConfigured } from './n8n';

const CACHE_PREFIX = 'pvgis:';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const cacheKey = (lat, lon, kwp, tilt, az) =>
  `${CACHE_PREFIX}${(+lat).toFixed(2)}:${(+lon).toFixed(2)}:${kwp}:${tilt}:${az}`;

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (Date.now() - p.t > CACHE_TTL_MS) return null;
    return p.d;
  } catch { return null; }
}

function writeCache(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), d: data })); } catch {}
}

export async function fetchPVProduction({ lat, lon, kwp, losses = 14, tilt = 10, azimuth = 0 }) {
  if (!lat || !lon || !kwp) throw new Error('PVGIS: faltan lat/lon/kwp');
  const key = cacheKey(lat, lon, kwp, tilt, azimuth);
  const cached = readCache(key);
  if (cached) return { ...cached, cached: true };

  const data = await n8nPost('pvgis', { lat, lon, kwp, tilt, azimuth, losses });
  if (data?.annualKwh) writeCache(key, data);
  return { ...data, cached: false };
}

// Cliente NREL PVWatts v8 — n8n primario, fallback directo si REACT_APP_NREL_API_KEY existe.
// Caché localStorage 24h por coordenadas + kWp.

import { n8nPost, n8nConfigured } from './n8n';

const CACHE_PREFIX = 'pvw:';
const TTL_MS = 24 * 60 * 60 * 1000;
const NREL_KEY = process.env.REACT_APP_NREL_API_KEY || '';

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (Date.now() - p.t > TTL_MS) return null;
    return p.d;
  } catch { return null; }
}

function writeCache(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), d: data })); } catch {}
}

async function fetchDirect(lat, lon, kwp, tilt, azimuth) {
  if (!NREL_KEY) throw new Error('PVWatts: falta REACT_APP_NREL_API_KEY');
  const qs = new URLSearchParams({
    api_key: NREL_KEY,
    lat, lon,
    system_capacity: kwp,
    azimuth,
    tilt,
    array_type: 1,
    module_type: 0,
    losses: 14,
    timeframe: 'monthly',
  });
  const res = await fetch(`https://developer.nrel.gov/api/pvwatts/v8.json?${qs}`);
  if (!res.ok) throw new Error(`PVWatts HTTP ${res.status}`);
  const data = await res.json();
  const out = data.outputs || {};
  return {
    ok: true,
    annualKwh: out.ac_annual != null ? Math.round(out.ac_annual) : null,
    monthlyKwh: Array.isArray(out.ac_monthly) ? out.ac_monthly.map(v => Math.round(v)) : [],
    capacityFactor: out.capacity_factor != null ? +out.capacity_factor.toFixed(2) : null,
    source: 'pvwatts-direct',
  };
}

export async function fetchPVWatts(lat, lon, kwp, tilt = 10, azimuth = 180) {
  const key = `${CACHE_PREFIX}${(+lat).toFixed(2)}:${(+lon).toFixed(2)}:${kwp}:${tilt}:${azimuth}`;
  const cached = readCache(key);
  if (cached?.annualKwh) return { ...cached, cached: true };

  // n8n primario → si falla y hay REACT_APP_NREL_API_KEY, cae al endpoint directo NREL.
  // Sin NREL key no hay fallback: devuelve null y la UI cae a PVGIS (que no requiere key).
  let data = null;
  if (n8nConfigured()) {
    try {
      data = await n8nPost('pvwatts', { lat, lon, kwp, tilt, azimuth });
      if (!data?.annualKwh) throw new Error('Modelo de producción no disponible.');
    } catch (e) {
      if (NREL_KEY) {
        data = await fetchDirect(lat, lon, kwp, tilt, azimuth);
      } else {
        return null;
      }
    }
  } else if (NREL_KEY) {
    data = await fetchDirect(lat, lon, kwp, tilt, azimuth);
  } else {
    return null;
  }

  if (data?.annualKwh) writeCache(key, data);
  return data;
}

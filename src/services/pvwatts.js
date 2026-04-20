// Cliente NREL PVWatts v8 — POST al webhook n8n.
// Caché localStorage 24 h por coordenadas + kWp.

import { n8nPost, n8nConfigured } from './n8n';

const CACHE_PREFIX = 'pvw:';
const TTL_MS = 24 * 60 * 60 * 1000;

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

export async function fetchPVWatts(lat, lon, kwp, tilt = 10, azimuth = 180) {
  const key = `${CACHE_PREFIX}${(+lat).toFixed(2)}:${(+lon).toFixed(2)}:${kwp}:${tilt}:${azimuth}`;
  const cached = readCache(key);
  if (cached?.annualKwh) return { ...cached, cached: true };

  let data;
  if (n8nConfigured()) {
    data = await n8nPost('pvwatts', { lat, lon, kwp, tilt, azimuth });
  } else {
    const params = new URLSearchParams({ lat, lon, kwp, tilt, azimuth });
    const r = await fetch(`/api/pvwatts?${params}`);
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || `PVWatts HTTP ${r.status}`); }
    data = await r.json();
  }
  if (data?.annualKwh) writeCache(key, data);
  return data;
}

// Cliente PVGIS — n8n primario, fallback directo a re.jrc.ec.europa.eu (sin clave).
// Caché localStorage 30 días.

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

async function fetchDirect({ lat, lon, kwp, losses = 14, tilt = 10, azimuth = 0 }) {
  // PVGIS convention: aspect 0=south, 90=west, -90=east, ±180=north
  const aspect = azimuth - 180;
  const qs = new URLSearchParams({
    lat, lon, peakpower: kwp, loss: losses,
    angle: tilt, aspect,
    outputformat: 'json', mountingplace: 'building',
  });
  const res = await fetch(`https://re.jrc.ec.europa.eu/api/v5_2/PVcalc?${qs}`);
  if (!res.ok) throw new Error(`PVGIS HTTP ${res.status}`);
  const data = await res.json();
  const totals = data.outputs?.totals?.fixed;
  const monthly = data.outputs?.monthly?.fixed || [];
  const annualKwh = totals?.E_y != null ? Number(totals.E_y) : null;
  const monthlyKwh = monthly.map(m => Number(m.E_m || 0));
  const irradiationAnnual = totals?.H_i_y != null ? Number(totals.H_i_y) : null;
  const psh = irradiationAnnual ? +(irradiationAnnual / 365).toFixed(2) : null;
  return { ok: true, annualKwh, monthlyKwh, irradiationAnnual, psh, source: 'pvgis-direct' };
}

export async function fetchPVProduction({ lat, lon, kwp, losses = 14, tilt = 10, azimuth = 0 }) {
  if (!lat || !lon || !kwp) throw new Error('PVGIS: faltan lat/lon/kwp');
  const key = cacheKey(lat, lon, kwp, tilt, azimuth);
  const cached = readCache(key);
  if (cached) return { ...cached, cached: true };

  // n8n primario → si falla, cae al endpoint público PVGIS (CORS habilitado).
  let data;
  if (n8nConfigured()) {
    try {
      data = await n8nPost('pvgis', { lat, lon, kwp, tilt, azimuth, losses });
      if (!data?.annualKwh) throw new Error('Modelo de irradiancia no disponible.');
    } catch (e) {
      data = await fetchDirect({ lat, lon, kwp, losses, tilt, azimuth });
    }
  } else {
    data = await fetchDirect({ lat, lon, kwp, losses, tilt, azimuth });
  }

  if (data?.annualKwh) writeCache(key, data);
  return { ...data, cached: false };
}

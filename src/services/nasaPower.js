// Cliente NASA POWER — n8n primario, fallback directo a power.larc.nasa.gov (sin clave).
// Caché localStorage 7 días (climatología muy estable).

import { n8nPost, n8nConfigured } from './n8n';

const CACHE_PREFIX = 'nasa:';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

async function fetchDirect(lat, lon) {
  const qs = new URLSearchParams({
    parameters: 'ALLSKY_SFC_SW_DWN,T2M,T2M_MAX,T2M_MIN',
    community: 'RE',
    longitude: lon,
    latitude: lat,
    start: '2015',
    end: '2022',
    format: 'JSON',
  });
  const res = await fetch(`https://power.larc.nasa.gov/api/temporal/monthly/point?${qs}`);
  if (!res.ok) throw new Error(`NASA POWER HTTP ${res.status}`);
  const data = await res.json();
  const p = data.properties?.parameter;
  if (!p) throw new Error('NASA POWER: respuesta inesperada');

  const byMonth = {};
  for (let m = 1; m <= 12; m++) byMonth[m] = { sw: [], t2m: [], hi: [], lo: [] };

  for (const [k, v] of Object.entries(p.ALLSKY_SFC_SW_DWN || {})) {
    const m = parseInt(k.slice(4), 10);
    if (m >= 1 && m <= 12 && v > 0) byMonth[m].sw.push(v);
  }
  for (const [k, v] of Object.entries(p.T2M || {})) {
    const m = parseInt(k.slice(4), 10);
    if (m >= 1 && m <= 12 && v > -900) byMonth[m].t2m.push(v);
  }
  for (const [k, v] of Object.entries(p.T2M_MAX || {})) {
    const m = parseInt(k.slice(4), 10);
    if (m >= 1 && m <= 12 && v > -900) byMonth[m].hi.push(v);
  }
  for (const [k, v] of Object.entries(p.T2M_MIN || {})) {
    const m = parseInt(k.slice(4), 10);
    if (m >= 1 && m <= 12 && v > -900) byMonth[m].lo.push(v);
  }

  const avg = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;

  const monthly = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    return {
      month: m,
      psh: +avg(byMonth[m].sw).toFixed(2),
      t2m: +avg(byMonth[m].t2m).toFixed(1),
      t2mMax: +avg(byMonth[m].hi).toFixed(1),
      t2mMin: +avg(byMonth[m].lo).toFixed(1),
    };
  });

  const annualPsh = +(monthly.reduce((s, m) => s + m.psh, 0) / 12).toFixed(2);
  const maxAvgT = Math.max(...monthly.map(m => m.t2m));
  const minMinT = Math.min(...monthly.map(m => m.t2mMin));

  return {
    ok: true,
    monthly,
    annualPsh,
    cellTempCold: Math.round(minMinT + 3),
    cellTempHot: Math.round(maxAvgT + 25),
    source: 'nasa-direct',
  };
}

export async function fetchNASAPower(lat, lon) {
  const key = `${CACHE_PREFIX}${(+lat).toFixed(2)}:${(+lon).toFixed(2)}`;
  const cached = readCache(key);
  if (cached?.annualPsh) return { ...cached, cached: true };

  // n8n primario → si falla, cae al endpoint público NASA POWER (CORS habilitado).
  let data;
  if (n8nConfigured()) {
    try {
      data = await n8nPost('nasa-power', { lat, lon });
      if (!data?.annualPsh) throw new Error('Modelo de temperatura no disponible.');
    } catch (e) {
      data = await fetchDirect(lat, lon);
    }
  } else {
    data = await fetchDirect(lat, lon);
  }

  if (data?.annualPsh) writeCache(key, data);
  return data;
}

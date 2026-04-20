// Cliente NASA POWER. Consume /api/nasa-power (proxy Vercel).
// Retorna irradiancia mensual (PSH) y temperaturas ambiente para
// corrección precisa de Voc/Vmp en sizeStrings.
// Caché local 7 días — datos climatológicos anuales muy estables.

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

export async function fetchNASAPower(lat, lon) {
  const key = `${CACHE_PREFIX}${(+lat).toFixed(2)}:${(+lon).toFixed(2)}`;
  const cached = readCache(key);
  if (cached?.annualPsh) return { ...cached, cached: true };

  const r = await fetch(`/api/nasa-power?lat=${lat}&lon=${lon}`);
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error || `NASA POWER HTTP ${r.status}`);
  }
  const data = await r.json();
  if (data.annualPsh) writeCache(key, data);
  return data;
}

// Cliente del catálogo curado de baterías. Proxy /api/batteries + caché
// local 7 días. Devuelve items listos para mapear al shape de
// DEFAULT_BATTERIES en constants.js (brand, model, kwh, v, chemistry, arch).

const CACHE_PREFIX = 'batt:';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

export async function searchBatteries(q = '', arch = '', limit = 50) {
  const key = `${CACHE_PREFIX}${q}:${arch}:${limit}`;
  const cached = readCache(key);
  if (cached?.items?.length) return { ...cached, cached: true };
  const params = new URLSearchParams({ q, arch, limit: String(limit) });
  const r = await fetch(`/api/batteries?${params}`);
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || `batteries proxy HTTP ${r.status}`);
  }
  const data = { ...(await r.json()), cached: false };
  if (data.items?.length) writeCache(key, data);
  return data;
}

// Cliente de la base CEC (NREL SAM). Consume /api/cec (proxy Vercel) para
// buscar paneles e inversores con specs eléctricos oficiales. Los resultados
// alimentan el BackOffice: el administrador puede importar un equipo con
// un click y enriquecer el catálogo local para que el cotizador valide
// layouts y construya el unifilar correctamente.

const CACHE_PREFIX = 'cec:';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

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

async function searchCEC(type, query, limit = 20) {
  const key = `${CACHE_PREFIX}${type}:${query}:${limit}`;
  const cached = readCache(key);
  if (cached) return { ...cached, cached: true };

  const params = new URLSearchParams({ type, q: query || '', limit: String(limit) });
  const r = await fetch(`/api/cec?${params}`);
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || `CEC proxy HTTP ${r.status}`);
  }
  const data = { ...(await r.json()), cached: false };
  writeCache(key, data);
  return data;
}

export const searchCECPanels = (q, limit) => searchCEC('panel', q, limit);
export const searchCECInverters = (q, limit) => searchCEC('inverter', q, limit);

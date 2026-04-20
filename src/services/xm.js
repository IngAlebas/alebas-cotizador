// XM API client — consume el proxy Vercel (/api/xm) para evitar el
// bloqueo CORS de servapibi.xm.com.co. El proxy cachea en edge:
//   - agents: 7 días (cambian raramente).
//   - spot:   6 horas (precio bolsa cambia a diario).
// Mantenemos caché local adicional para respuesta instantánea entre
// navegaciones del cliente.

const CACHE_PREFIX = 'xm:';
const TTL_AGENTS_MS = 7 * 24 * 60 * 60 * 1000;  // 7 días
const TTL_PRICE_MS  = 24 * 60 * 60 * 1000;       // 24 horas

function readCache(key, ttl) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.t > ttl) return null;
    return parsed.d;
  } catch { return null; }
}

function writeCache(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), d: data })); } catch {}
}

async function fetchProxy(params) {
  const r = await fetch(`/api/xm?${new URLSearchParams(params)}`);
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || `XM proxy HTTP ${r.status}`);
  }
  return r.json();
}

// Lista oficial de agentes registrados en el MEM, filtrados a OR (Distribuidores).
export async function fetchAgentsList() {
  const key = `${CACHE_PREFIX}agents`;
  const cached = readCache(key, TTL_AGENTS_MS);
  if (cached) return { ...cached, cached: true };
  const data = await fetchProxy({ metric: 'agents' });
  writeCache(key, data);
  return data;
}

// Precio promedio de bolsa últimos N días (COP/kWh).
export async function fetchSpotPrice(daysBack = 30) {
  const key = `${CACHE_PREFIX}spot`;
  const cached = readCache(key, TTL_PRICE_MS);
  if (cached) return { ...cached, cached: true };
  const data = await fetchProxy({ metric: 'spot', days: String(daysBack) });
  writeCache(key, data);
  return data;
}

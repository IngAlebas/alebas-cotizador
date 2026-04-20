// Cliente TRM (Tasa Representativa del Mercado COP/USD).
// Consume /api/trm (proxy Vercel). Se usa para mostrar precios de
// equipos importados en USD y mantener el presupuesto actualizado
// cuando el peso colombiano fluctúa.
// Caché local 4 h — la TRM cambia una vez al día (6 pm Colombia).

const CACHE_KEY = 'trm:v1';
const TTL_MS = 4 * 60 * 60 * 1000;

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (Date.now() - p.t > TTL_MS) return null;
    return p.d;
  } catch { return null; }
}

function writeCache(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), d: data })); } catch {}
}

export async function fetchTRM() {
  const cached = readCache();
  if (cached?.cop_per_usd) return { ...cached, cached: true };

  const r = await fetch('/api/trm');
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error || `TRM HTTP ${r.status}`);
  }
  const data = await r.json();
  if (data.cop_per_usd) writeCache(data);
  return data;
}

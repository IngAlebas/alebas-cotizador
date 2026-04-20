// Catálogo de cargas típicas (cuadro de cargas off-grid).
// Primario: n8n /webhook/loads-catalog → tabla editable desde BackOffice.
// Fallback: lista local por defecto. Cacheado en localStorage 7 días.

import { n8nPost, n8nConfigured } from './n8n';

const CACHE_KEY = 'loads:catalog';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const DEFAULT_LOADS_CATALOG = [
  { name: 'Nevera', watts: 150, hours: 8, qty: 1, category: 'Cocina' },
  { name: 'Iluminación LED', watts: 10, hours: 5, qty: 8, category: 'Iluminación' },
  { name: 'TV LED 43"', watts: 80, hours: 4, qty: 1, category: 'Entretenimiento' },
  { name: 'Ventilador', watts: 60, hours: 6, qty: 2, category: 'Climatización' },
  { name: 'Cargadores / electrónicos', watts: 100, hours: 3, qty: 1, category: 'Electrónicos' },
  { name: 'Bomba de agua 1 HP', watts: 750, hours: 1, qty: 1, category: 'Bombeo' },
  { name: 'Microondas', watts: 1100, hours: 0.25, qty: 1, category: 'Cocina' },
  { name: 'Licuadora', watts: 400, hours: 0.1, qty: 1, category: 'Cocina' },
  { name: 'Plancha', watts: 1000, hours: 0.5, qty: 1, category: 'Hogar' },
  { name: 'Lavadora', watts: 500, hours: 1, qty: 1, category: 'Hogar' },
  { name: 'Aire acondicionado 12 000 BTU', watts: 1100, hours: 6, qty: 1, category: 'Climatización' },
  { name: 'Ducha eléctrica', watts: 3500, hours: 0.25, qty: 1, category: 'Hogar' },
  { name: 'Computador portátil', watts: 65, hours: 5, qty: 1, category: 'Electrónicos' },
  { name: 'Router Wi-Fi', watts: 10, hours: 24, qty: 1, category: 'Electrónicos' },
];

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

export async function fetchLoadsCatalog() {
  const cached = readCache();
  if (cached?.items?.length) return { ...cached, cached: true };
  if (!n8nConfigured()) {
    return { ok: true, items: DEFAULT_LOADS_CATALOG, source: 'local-default' };
  }
  try {
    const data = await n8nPost('loads-catalog', {});
    if (Array.isArray(data?.items) && data.items.length) {
      writeCache(data);
      return data;
    }
    return { ok: true, items: DEFAULT_LOADS_CATALOG, source: 'local-default', notes: data?.error || 'catálogo remoto vacío' };
  } catch (e) {
    return { ok: true, items: DEFAULT_LOADS_CATALOG, source: 'local-default', notes: e?.message || 'sin conexión' };
  }
}

export function invalidateLoadsCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch {}
}

// Cliente CEC — POST al webhook n8n. Caché local 24h.

import { n8nPost, n8nConfigured } from './n8n';

const CACHE_PREFIX = 'cec:';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

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

async function searchCEC(type, query, limit = 20) {
  const key = `${CACHE_PREFIX}${type}:${query}:${limit}`;
  const cached = readCache(key);
  if (cached) return { ...cached, cached: true };

  const data = await n8nPost('cec', { type, q: query || '', limit });
  writeCache(key, { ...data, cached: false });
  return data;
}

export const searchCECPanels    = (q, limit) => searchCEC('panel',    q, limit);
export const searchCECInverters = (q, limit) => searchCEC('inverter', q, limit);

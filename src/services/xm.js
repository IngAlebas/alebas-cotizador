// Cliente XM — POST a webhooks n8n xm-agents y xm-spot.
// Caché localStorage: agentes 7d, precio bolsa 24h.

import { n8nPost, n8nConfigured } from './n8n';

const CACHE_PREFIX = 'xm:';
const TTL_AGENTS_MS = 7 * 24 * 60 * 60 * 1000;
const TTL_PRICE_MS  = 24 * 60 * 60 * 1000;

function readCache(key, ttl) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (Date.now() - p.t > ttl) return null;
    return p.d;
  } catch { return null; }
}

function writeCache(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), d: data })); } catch {}
}

export async function fetchAgentsList() {
  const key = `${CACHE_PREFIX}agents`;
  const cached = readCache(key, TTL_AGENTS_MS);
  if (cached?.operators?.length) return { ...cached, cached: true };

  const data = await n8nPost('xm-agents', {});
  if (data?.operators?.length) writeCache(key, data);
  return data;
}

export async function fetchSpotPrice(daysBack = 30) {
  const key = `${CACHE_PREFIX}spot`;
  const cached = readCache(key, TTL_PRICE_MS);
  if (cached?.cop_per_kwh) return { ...cached, cached: true };

  const data = await n8nPost('xm-spot', { days: daysBack });
  if (data?.cop_per_kwh) writeCache(key, data);
  return data;
}

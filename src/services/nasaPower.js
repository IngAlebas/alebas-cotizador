// Cliente NASA POWER — POST al webhook n8n.
// Caché localStorage 7 días (climatología anual, muy estable).

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

export async function fetchNASAPower(lat, lon) {
  const key = `${CACHE_PREFIX}${(+lat).toFixed(2)}:${(+lon).toFixed(2)}`;
  const cached = readCache(key);
  if (cached?.annualPsh) return { ...cached, cached: true };

  const data = await n8nPost('nasa-power', { lat, lon });
  if (data?.annualPsh) writeCache(key, data);
  return data;
}

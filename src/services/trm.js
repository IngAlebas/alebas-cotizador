// Cliente TRM — POST al webhook n8n. Caché local 4h.

import { n8nPost, n8nConfigured } from './n8n';

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

  const data = await n8nPost('trm', {});
  if (data?.cop_per_usd) writeCache(data);
  return data;
}

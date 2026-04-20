// Cliente baterías — POST al webhook n8n. Caché local 7 días.

import { n8nPost, n8nConfigured } from './n8n';

const CACHE_PREFIX = 'batt:';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

export async function searchBatteries(q = '', arch = '', limit = 50) {
  const key = `${CACHE_PREFIX}${q}:${arch}:${limit}`;
  const cached = readCache(key);
  if (cached?.items?.length) return { ...cached, cached: true };

  let data;
  if (n8nConfigured()) {
    data = await n8nPost('batteries', { q, arch, limit });
  } else {
    const params = new URLSearchParams({ q, arch, limit: String(limit) });
    const r = await fetch(`/api/batteries?${params}`);
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || `batteries HTTP ${r.status}`); }
    data = await r.json();
  }
  if (data?.items?.length) writeCache(key, { ...data, cached: false });
  return data;
}

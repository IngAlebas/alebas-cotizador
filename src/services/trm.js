// Cliente TRM — n8n primario, fallback directo a Datos Abiertos CO (CORS abierto).
// Caché local 4h.

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

async function fetchDirect() {
  // SuperFinanciera / Datos Abiertos Colombia — TRM vigente
  const url = 'https://www.datos.gov.co/resource/32sa-8pi3.json?$order=vigenciadesde%20DESC&$limit=1';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TRM HTTP ${res.status}`);
  const rows = await res.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.valor) throw new Error('TRM: respuesta vacía');
  return {
    ok: true,
    cop_per_usd: +Number(row.valor).toFixed(2),
    date: (row.vigenciadesde || '').slice(0, 10),
    source: 'datos.gov.co',
  };
}

export async function fetchTRM() {
  const cached = readCache();
  if (cached?.cop_per_usd) return { ...cached, cached: true };

  // n8n primario → si falla, cae al endpoint público Datos Abiertos CO.
  let data;
  if (n8nConfigured()) {
    try {
      data = await n8nPost('trm', {});
      if (!data?.cop_per_usd) throw new Error('TRM n8n: respuesta sin cop_per_usd');
    } catch (e) {
      data = await fetchDirect();
    }
  } else {
    data = await fetchDirect();
  }

  if (data?.cop_per_usd) writeCache(data);
  return { ...data, cached: false };
}

// XM API service — Mercado de Energía Mayorista de Colombia
// Endpoint público, sin auth. Docs: github.com/EquipoAnaliticaXM/API_XM
//
// Usos en el cotizador:
//   1. fetchAgentsList() — sincronizar lista de Operadores de Red (OR) y comercializadores
//      con los códigos SIC oficiales de XM (ListadoAgentes).
//   2. fetchSpotPrice() — precio promedio de bolsa para valorar excedentes AGPE
//      (CREG 174/2021 — cuando los excedentes superan el consumo se pagan a precio bolsa).
//
// Nota CORS: XM no expone CORS para origenes browser. En producción se recomienda
// proxy backend (Vercel Edge Function) para evitar bloqueos. Este módulo intenta
// la llamada directa; si falla por CORS, el caller debe usar el fallback estático.

const XM_BASE = 'https://servapibi.xm.com.co';
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

async function postLists(body) {
  const r = await fetch(`${XM_BASE}/lists`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`XM HTTP ${r.status}`);
  return r.json();
}

// Devuelve la lista oficial de agentes registrados en el MEM, con su código SIC,
// nombre comercial y tipo de actividad (G=Generador, C=Comercializador, T=Transmisor,
// D=Distribuidor/OR). Filtramos a OR para alimentar el selector del cotizador.
export async function fetchAgentsList() {
  const key = `${CACHE_PREFIX}agents`;
  const cached = readCache(key, TTL_AGENTS_MS);
  if (cached) return { ...cached, cached: true };

  const j = await postLists({ MetricId: 'ListadoAgentes' });
  const items = (j?.Items || j?.items || []).map(a => ({
    sic: a.Codigo || a.codigo || a.Id,
    name: a.Nombre || a.nombre,
    activities: a.Actividades || a.actividades || '',
  }));
  const operators = items.filter(a => /D|OR/i.test(a.activities));
  const data = { items, operators, syncedAt: new Date().toISOString(), source: 'XM ListadoAgentes' };
  writeCache(key, data);
  return data;
}

// Precio promedio ponderado de bolsa (PrecBolsNal) para una fecha. Se usa
// como referencia para valorar excedentes AGPE entregados a la red.
// Devuelve COP/kWh.
export async function fetchSpotPrice(daysBack = 30) {
  const key = `${CACHE_PREFIX}spot`;
  const cached = readCache(key, TTL_PRICE_MS);
  if (cached) return { ...cached, cached: true };

  const end = new Date();
  const start = new Date(end.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const fmt = d => d.toISOString().slice(0, 10);
  const j = await postLists({
    MetricId: 'PrecBolsNal',
    StartDate: fmt(start),
    EndDate: fmt(end),
  });
  const records = j?.Items || j?.items || [];
  const values = records.flatMap(r => Object.entries(r).filter(([k]) => /^Hora\d+$|^Value/i.test(k)).map(([, v]) => Number(v)).filter(Number.isFinite));
  if (!values.length) throw new Error('XM: respuesta sin datos de bolsa');
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  // PrecBolsNal viene en COP/MWh — convertimos a COP/kWh
  const cop_per_kwh = parseFloat((avg / 1000).toFixed(2));
  const data = { cop_per_kwh, samples: values.length, periodDays: daysBack, syncedAt: new Date().toISOString(), source: 'XM PrecBolsNal' };
  writeCache(key, data);
  return data;
}

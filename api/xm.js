// Vercel serverless function: proxy a XM (Mercado de Energía Mayorista).
// XM no expone CORS para navegadores; este endpoint resuelve ese bloqueo
// y agrega caché edge compartida entre todos los clientes.
//
// GET /api/xm?metric=agents            → lista de agentes (ListadoAgentes)
// GET /api/xm?metric=spot&days=30      → precio promedio de bolsa últimos N días

const XM_BASE = 'https://servapibi.xm.com.co/lists';

async function postLists(body) {
  const r = await fetch(XM_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'alebas-cotizador/1.0' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`XM HTTP ${r.status}`);
  return r.json();
}

async function getAgents() {
  const j = await postLists({ MetricId: 'ListadoAgentes' });
  const items = (j?.Items || j?.items || []).map(a => ({
    sic: a.Codigo || a.codigo || a.Id,
    name: a.Nombre || a.nombre,
    activities: a.Actividades || a.actividades || '',
  }));
  const operators = items.filter(a => /D|OR/i.test(a.activities));
  return { items, operators, syncedAt: new Date().toISOString(), source: 'XM ListadoAgentes' };
}

async function getSpot(daysBack) {
  const end = new Date();
  const start = new Date(end.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const fmt = d => d.toISOString().slice(0, 10);
  const j = await postLists({
    MetricId: 'PrecBolsNal',
    StartDate: fmt(start),
    EndDate: fmt(end),
  });
  const records = j?.Items || j?.items || [];
  const values = records.flatMap(r =>
    Object.entries(r)
      .filter(([k]) => /^Hora\d+$|^Value/i.test(k))
      .map(([, v]) => Number(v))
      .filter(Number.isFinite)
  );
  if (!values.length) throw new Error('XM: respuesta sin datos de bolsa');
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  // PrecBolsNal viene en COP/MWh — convertimos a COP/kWh
  const cop_per_kwh = Number((avg / 1000).toFixed(2));
  return {
    cop_per_kwh,
    samples: values.length,
    periodDays: daysBack,
    syncedAt: new Date().toISOString(),
    source: 'XM PrecBolsNal',
  };
}

export default async function handler(req, res) {
  const { metric = 'spot', days = '30' } = req.query;
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    if (metric === 'agents') {
      const data = await getAgents();
      // Agentes cambian raramente: 7 días de edge cache.
      res.setHeader('Cache-Control', 's-maxage=604800, stale-while-revalidate=86400');
      return res.status(200).json(data);
    }
    if (metric === 'spot') {
      const daysBack = Math.min(Math.max(parseInt(days, 10) || 30, 1), 90);
      const data = await getSpot(daysBack);
      // Precio bolsa cambia diariamente: 6 h de edge cache.
      res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=3600');
      return res.status(200).json(data);
    }
    return res.status(400).json({ error: "metric debe ser 'agents' o 'spot'" });
  } catch (err) {
    return res.status(502).json({ error: `XM fetch failed: ${err.message}` });
  }
}

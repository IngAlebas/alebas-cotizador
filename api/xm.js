// Vercel serverless function: proxy a XM (Mercado de Energía Mayorista).
// XM no expone CORS para navegadores; este endpoint resuelve ese bloqueo
// y agrega caché edge compartida entre todos los clientes.
//
// GET /api/xm?metric=agents            → lista de agentes (ListadoAgentes)
// GET /api/xm?metric=spot&days=30      → precio promedio de bolsa últimos N días
//
// La API de XM (servapibi.xm.com.co) usa endpoints distintos por tipo de
// métrica: /lists para catálogos estáticos y /hourly para series temporales
// horarias como PrecBolsNal. El body siempre es { MetricId, Entity,
// StartDate, EndDate } y las respuestas vienen anidadas en Items[].

const XM_BASE = 'https://servapibi.xm.com.co';

async function postXM(path, body) {
  const r = await fetch(`${XM_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'alebas-cotizador/1.0',
    },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  let parsed;
  try { parsed = JSON.parse(txt); } catch { parsed = null; }
  if (!r.ok) {
    const msg = parsed?.message || parsed?.Message || txt.slice(0, 140) || `HTTP ${r.status}`;
    throw new Error(`XM ${path} ${r.status}: ${msg}`);
  }
  return parsed ?? {};
}

function isoDate(d) { return d.toISOString().slice(0, 10); }

// Lista oficial de agentes del mercado (comercializadores y OR) de XM.
// Respuesta típica: { Items: [{ Values: { Id, Nombre, Actividad, ... } }] }
// o variantes — usamos un parser tolerante que busca los campos por nombre.
async function getAgents() {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  const j = await postXM('/lists', {
    MetricId: 'ListadoAgentes',
    Entity: 'Sistema',
    StartDate: isoDate(start),
    EndDate: isoDate(end),
  });
  const rawItems = j?.Items || j?.items || [];
  const items = rawItems.map(it => {
    const v = it?.Values || it?.values || it;
    return {
      sic: v?.Id || v?.Codigo || v?.codigo || v?.Code || v?.SIC || it?.Id || '',
      name: v?.Nombre || v?.nombre || v?.Name || it?.Name || '',
      activities: v?.Actividad || v?.Actividades || v?.actividades || v?.Activity || '',
    };
  });
  // OR = Operador de Red = actividad 'D' (distribución) o comercialización.
  // Fallback: si el filtro de actividad no devuelve nada (schema cambiado en XM),
  // incluir todos los agentes con nombre — mejor tener la lista completa que vacía.
  const filtered = items.filter(a => /D|OR|distribuid|comercial/i.test(a.activities || ''));
  const operators = filtered.length ? filtered : items.filter(a => a.name || a.sic);
  const activityFilterWorked = filtered.length > 0;
  return {
    items,
    operators,
    total: items.length,
    activityFilterWorked,
    syncedAt: new Date().toISOString(),
    source: 'XM ListadoAgentes',
  };
}

// Precio promedio de bolsa nacional (PrecBolsNal) — horario, COP/MWh.
// Respuesta típica: Items[].HourlyEntities[].Values.{Hour01..Hour24} (COP/MWh).
// Hacemos un extractor robusto: recorre recursivamente y recolecta valores
// numéricos en claves Hour## / Hora## / Value##, tolerando cambios de shape.
async function getSpot(daysBack) {
  // XM publica con delay T+1 — apuntar a ayer como EndDate evita huecos.
  const end = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const start = new Date(end.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const j = await postXM('/hourly', {
    MetricId: 'PrecBolsNal',
    Entity: 'Sistema',
    StartDate: isoDate(start),
    EndDate: isoDate(end),
  });
  const values = [];
  const walk = (node) => {
    if (node == null) return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        if (/^(Hour|Hora|Value)\d{1,2}$/i.test(k) && Number.isFinite(Number(v))) {
          values.push(Number(v));
        } else if (typeof v === 'object') {
          walk(v);
        }
      }
    }
  };
  walk(j);
  if (!values.length) throw new Error('XM: respuesta sin datos horarios de bolsa');
  const avgMwh = values.reduce((s, v) => s + v, 0) / values.length;
  const cop_per_kwh = Number((avgMwh / 1000).toFixed(2));
  return {
    cop_per_kwh,
    avg_cop_per_mwh: Number(avgMwh.toFixed(2)),
    samples: values.length,
    periodDays: daysBack,
    startDate: isoDate(start),
    endDate: isoDate(end),
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
      res.setHeader('Cache-Control', 's-maxage=604800, stale-while-revalidate=86400');
      return res.status(200).json(data);
    }
    if (metric === 'spot') {
      const daysBack = Math.min(Math.max(parseInt(days, 10) || 30, 1), 90);
      const data = await getSpot(daysBack);
      res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=3600');
      return res.status(200).json(data);
    }
    return res.status(400).json({ error: "metric debe ser 'agents' o 'spot'" });
  } catch (err) {
    return res.status(502).json({ error: `XM fetch failed: ${err.message}` });
  }
}

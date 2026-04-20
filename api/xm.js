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

// Extrae recursivamente todos los objetos candidatos a "agente" de una
// respuesta JSON de cualquier shape. Busca nodos que contengan al menos
// un campo de ID (sic/código) o nombre. Tolerante a cambios de schema.
function walkAgents(node, collected = []) {
  if (node == null) return collected;
  if (Array.isArray(node)) { node.forEach(n => walkAgents(n, collected)); return collected; }
  if (typeof node !== 'object') return collected;

  // Candidato: nodo con algún campo identificador de agente
  const SIC_KEYS  = ['Id','id','Codigo','codigo','Code','code','SIC','sic','CodigoSIC','codigoSIC'];
  const NAME_KEYS = ['Nombre','nombre','Name','name','RazonSocial','razonSocial'];
  const ACT_KEYS  = ['Actividad','actividad','Actividades','actividades','Activity','activity','TipoAgente','tipoAgente'];

  const sic  = SIC_KEYS.find(k => node[k]);
  const name = NAME_KEYS.find(k => node[k]);
  const act  = ACT_KEYS.find(k => node[k]);

  if (sic || name) {
    collected.push({
      sic:        node[sic]  || '',
      name:       node[name] || '',
      activities: node[act]  || '',
    });
  }

  // Seguir recursión sólo en sub-objetos (no en los campos primitivos)
  for (const v of Object.values(node)) {
    if (v && typeof v === 'object') walkAgents(v, collected);
  }
  return collected;
}

// Lista oficial de agentes del mercado. El schema de XM cambia con frecuencia;
// usamos walkAgents para extraer datos independientemente de la estructura.
// Si la respuesta sigue sin tener agentes, devolvemos items=[] y operators=[]
// para que el BackOffice lo maneje como advertencia (no error fatal).
async function getAgents() {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 días — rango más amplio
  let j;
  try {
    j = await postXM('/lists', {
      MetricId: 'ListadoAgentes',
      Entity: 'Sistema',
      StartDate: isoDate(start),
      EndDate: isoDate(end),
    });
  } catch (err) {
    // Intentar sin Entity como fallback (algunas versiones del API lo ignoran)
    j = await postXM('/lists', {
      MetricId: 'ListadoAgentes',
      StartDate: isoDate(start),
      EndDate: isoDate(end),
    });
  }

  // Intentar el path estándar; manejar el schema actual de XM donde cada Items[n]
  // contiene un campo ListEntities[m].Values.{Code,Name,Activity} (estructura 2025+).
  const rawItems = j?.Items || j?.items || j?.data || j?.Data || j?.result || j?.Result || [];
  let items = [];
  if (rawItems.length) {
    const flat = [];
    for (const it of rawItems) {
      // Schema 2025+: Items[n].ListEntities[m].Values
      const listEnt = it?.ListEntities || it?.listEntities || it?.Entities || it?.entities;
      if (Array.isArray(listEnt) && listEnt.length) {
        for (const le of listEnt) {
          const v = le?.Values || le?.values || le;
          flat.push({
            sic:        v?.Code || v?.Id || v?.Codigo || v?.SIC || '',
            name:       v?.Name || v?.Nombre || v?.nombre || '',
            activities: v?.Activity || v?.Actividad || v?.Actividades || v?.actividades || '',
          });
        }
      } else {
        // Schema anterior: Items[n].Values
        const v = it?.Values || it?.values || it;
        flat.push({
          sic:        v?.Id || v?.Codigo || v?.codigo || v?.Code || v?.SIC || it?.Id || '',
          name:       v?.Nombre || v?.nombre || v?.Name || it?.Name || '',
          activities: v?.Actividad || v?.Actividades || v?.actividades || v?.Activity || '',
        });
      }
    }
    items = flat;
  }

  // Si el mapeo estructurado no produjo resultados útiles, usar el walker recursivo
  if (!items.some(a => a.sic || a.name)) {
    items = walkAgents(j);
  }

  // Deduplicar por SIC
  const seen = new Set();
  items = items.filter(a => {
    const key = a.sic || a.name;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const filtered = items.filter(a => /D|OR|distribuid|comercial/i.test(a.activities || ''));
  const operators = filtered.length ? filtered : items.filter(a => a.name || a.sic);
  const activityFilterWorked = filtered.length > 0;

  // Incluir preview del raw para diagnóstico cuando no hay datos
  const rawPreview = !items.length ? JSON.stringify(j).slice(0, 300) : undefined;

  return {
    items,
    operators,
    total: items.length,
    activityFilterWorked,
    rawPreview,
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
  // El MetricId y endpoint para precio de bolsa han cambiado en varias versiones del API.
  // Probamos combinaciones de path + MetricId + Entity hasta obtener respuesta válida.
  const SPOT_CANDIDATES = [
    // Variantes /hourly con distintos MetricId y Entity
    { path: '/hourly', MetricId: 'Preciobols',            Entity: 'Sistema' },
    { path: '/hourly', MetricId: 'PrecBolsNal',           Entity: 'Sistema' },
    { path: '/hourly', MetricId: 'PrecBols',              Entity: 'Sistema' },
    { path: '/hourly', MetricId: 'PreciosBolsa',          Entity: 'Sistema' },
    { path: '/hourly', MetricId: 'PrecioBolsaNal',        Entity: 'Sistema' },
    { path: '/hourly', MetricId: 'Bolsa',                 Entity: 'Sistema' },
    { path: '/hourly', MetricId: 'BolsaNacional',         Entity: 'Sistema' },
    { path: '/hourly', MetricId: 'PrecBolsa',             Entity: 'Sistema' },
    { path: '/hourly', MetricId: 'PreciosBolsaNal',       Entity: 'Sistema' },
    { path: '/hourly', MetricId: 'PRECIOBOLS',            Entity: 'Sistema' },
    // Sin Entity
    { path: '/hourly', MetricId: 'Preciobols' },
    { path: '/hourly', MetricId: 'PrecBolsNal' },
    { path: '/hourly', MetricId: 'Bolsa' },
    { path: '/hourly', MetricId: 'BolsaNacional' },
    // Entidad SIN
    { path: '/hourly', MetricId: 'Preciobols',            Entity: 'SIN' },
    { path: '/hourly', MetricId: 'PrecBolsNal',           Entity: 'SIN' },
    { path: '/hourly', MetricId: 'Bolsa',                 Entity: 'SIN' },
    // /daily
    { path: '/daily',  MetricId: 'Preciobols',            Entity: 'Sistema' },
    { path: '/daily',  MetricId: 'PrecBolsNal',           Entity: 'Sistema' },
    { path: '/daily',  MetricId: 'Bolsa',                 Entity: 'Sistema' },
    { path: '/daily',  MetricId: 'Preciobols' },
    { path: '/daily',  MetricId: 'PrecBolsNal' },
    // /monthly como último recurso
    { path: '/monthly', MetricId: 'Preciobols',           Entity: 'Sistema' },
    { path: '/monthly', MetricId: 'PrecBolsNal',          Entity: 'Sistema' },
  ];
  let j = null;
  let usedMetric = '';
  const tried = [];
  for (const c of SPOT_CANDIDATES) {
    const body = { MetricId: c.MetricId, StartDate: isoDate(start), EndDate: isoDate(end) };
    if (c.Entity) body.Entity = c.Entity;
    const label = `${c.path}/${c.MetricId}${c.Entity ? '/'+c.Entity : ''}`;
    tried.push(label);
    try {
      j = await postXM(c.path, body);
      usedMetric = label;
      break;
    } catch (err) {
      if (err.message.includes('400') || err.message.includes('404')) continue;
      throw err; // error de red o 5xx → propagar
    }
  }
  if (!j) throw new Error(`XM: ningún candidato de bolsa respondió (probados: ${tried.join(', ')})`);
  const values = [];
  const walk = (node) => {
    if (node == null) return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        // Captura Hour01-Hour24 (horario), Value (diario), Precio/Price, Total
        if (/^(Hour|Hora|Value|Precio|Price|Total)\d{0,2}$/i.test(k) && Number.isFinite(Number(v)) && Number(v) > 0) {
          values.push(Number(v));
        } else if (typeof v === 'object') {
          walk(v);
        }
      }
    }
  };
  walk(j);
  if (!values.length) throw new Error(`XM: respuesta sin datos de bolsa (métrica: ${usedMetric}) — raw: ${JSON.stringify(j).slice(0,200)}`);
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
    source: `XM ${usedMetric}`,
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

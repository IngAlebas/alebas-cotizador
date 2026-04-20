// Vercel serverless: proxy NREL PVWatts v8.
// PVWatts modela la producción AC real de un sistema FV incluyendo pérdidas
// por suciedad, sombreado, temperatura, cableado y eficiencia del inversor.
// Más preciso que PVGIS para Colombia: usa NASA MERRA-2 como base de
// irradiancia con resolución global de ~50 km.
// API gratuita con DEMO_KEY (1000 req/día); registrar clave propia en
// developer.nrel.gov para producción sin límite.
// Cache edge: 24 h.

const NREL_BASE = 'https://developer.nrel.gov/api/pvwatts/v8.json';
// DEMO_KEY es suficiente para demo; para producción registrar en developer.nrel.gov.
const API_KEY = process.env.NREL_API_KEY || 'DEMO_KEY';

export default async function handler(req, res) {
  const {
    lat, lon,
    kwp     = '10',
    tilt    = '10',   // Colombia ~0-12°N → tilt bajo es óptimo
    azimuth = '180',  // 180° = sur geográfico (hemisferio norte)
    losses  = '14',   // 14% Colombia: menos polvo que zonas áridas
  } = req.query;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');

  if (!lat || !lon) return res.status(400).json({ error: 'lat y lon requeridos' });

  try {
    const params = new URLSearchParams({
      api_key: API_KEY,
      lat, lon,
      system_capacity: kwp,
      module_type: 0,       // 0 = Standard (mono/poli cristalino)
      losses,
      array_type: 1,        // 1 = Fixed roof mount
      tilt,
      azimuth,
      timeframe: 'monthly',
    });

    const r = await fetch(`${NREL_BASE}?${params}`, {
      headers: { 'User-Agent': 'alebas-cotizador/1.0', Accept: 'application/json' },
    });

    const j = await r.json();
    if (!r.ok || (j.errors?.length && !j.outputs)) {
      return res.status(502).json({
        error: `PVWatts: ${(j.errors || []).join('; ') || `HTTP ${r.status}`}`,
      });
    }

    const out = j.outputs || {};
    const monthlyKwh = (out.ac_monthly || []).map(v => +v.toFixed(0));
    const annualKwh  = +(out.ac_annual  || monthlyKwh.reduce((s, v) => s + v, 0)).toFixed(0);
    const capacityFactor = +(out.capacity_factor || 0).toFixed(2);
    const solradAnnual   = +(out.solrad_annual   || 0).toFixed(2);

    return res.status(200).json({
      lat: +parseFloat(lat).toFixed(4),
      lon: +parseFloat(lon).toFixed(4),
      kwp: +parseFloat(kwp),
      tilt: +tilt,
      azimuth: +azimuth,
      losses: +losses,
      annualKwh,
      monthlyKwh,
      capacityFactor,
      solradAnnual,
      source: 'NREL PVWatts v8',
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(502).json({ error: `PVWatts fetch failed: ${err.message}` });
  }
}

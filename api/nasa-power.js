// Vercel serverless: proxy NASA POWER (power.larc.nasa.gov).
// Retorna irradiancia mensual (kWh/m²/día ≈ PSH) y temperaturas
// ambiente mín/máx por coordenadas. Datos gratuitos, sin API key.
// Se usa para:
//   1. Temperatura de celda fría → corrección Voc en sizeStrings.
//   2. Temperatura de celda caliente → corrección Vmp/rendimiento.
//   3. PSH local como referencia independiente a PVGIS.
// Cache edge: 7 días (datos climatológicos anuales estables).

const BASE = 'https://power.larc.nasa.gov/api';

export default async function handler(req, res) {
  const { lat, lon } = req.query;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=604800, stale-while-revalidate=86400');

  if (!lat || !lon) return res.status(400).json({ error: 'lat y lon requeridos' });

  // Promedios del año anterior (T-1) — siempre completo en NASA POWER.
  const year = new Date().getFullYear() - 1;
  const start = `${year}0101`;
  const end   = `${year}1231`;

  try {
    const params = new URLSearchParams({
      parameters: 'ALLSKY_SFC_SW_DWN,T2M,T2M_MAX,T2M_MIN',
      community: 'RE',
      longitude: lon,
      latitude: lat,
      start,
      end,
      format: 'JSON',
    });

    const r = await fetch(`${BASE}/temporal/monthly/point?${params}`, {
      headers: { 'User-Agent': 'alebas-cotizador/1.0', Accept: 'application/json' },
    });

    if (!r.ok) {
      const txt = await r.text();
      return res.status(502).json({ error: `NASA POWER ${r.status}: ${txt.slice(0, 200)}` });
    }

    const j = await r.json();
    const props = j?.properties?.parameter;
    if (!props) return res.status(502).json({ error: 'NASA POWER: respuesta sin properties.parameter' });

    const irr    = props.ALLSKY_SFC_SW_DWN || {};
    const t2m    = props.T2M    || {};
    const t2mMax = props.T2M_MAX || {};
    const t2mMin = props.T2M_MIN || {};

    // Claves mensuales: "YYYYMM" (ej. "202301")
    const months = Array.from({ length: 12 }, (_, i) =>
      `${year}${String(i + 1).padStart(2, '0')}`
    );

    const monthly = months.map(k => ({
      month: k.slice(4), // "01".."12"
      psh:    +((irr[k]    ?? 0).toFixed(2)),
      t2m:    +((t2m[k]    ?? 0).toFixed(1)),
      t2mMax: +((t2mMax[k] ?? 0).toFixed(1)),
      t2mMin: +((t2mMin[k] ?? 0).toFixed(1)),
    }));

    const annualPsh = +(monthly.reduce((s, m) => s + m.psh, 0) / 12).toFixed(2);
    const tAmbMin   = Math.min(...monthly.map(m => m.t2mMin));
    const tAmbMax   = Math.max(...monthly.map(m => m.t2mMax));

    // Temperatura de celda para sizing de strings:
    //   Frío: temperatura ambiente mínima del año (Voc máximo).
    //   Caliente: max ambiente + 25 °C offset NOCT (reducción de Vmp).
    const cellTempCold = +(tAmbMin.toFixed(1));
    const cellTempHot  = +(( tAmbMax + 25).toFixed(1));

    return res.status(200).json({
      lat: +parseFloat(lat).toFixed(4),
      lon: +parseFloat(lon).toFixed(4),
      year,
      monthly,
      annualPsh,
      tAmbMin,
      tAmbMax,
      cellTempCold,
      cellTempHot,
      source: 'NASA POWER RE Community',
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(502).json({ error: `NASA POWER fetch failed: ${err.message}` });
  }
}

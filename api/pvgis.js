// Vercel serverless function: proxy a PVGIS (JRC / European Commission).
// Evita CORS en el browser y permite caché compartida server-side.
// GET /api/pvgis?lat=..&lon=..&kwp=..&tilt=10&azimuth=0&losses=14

const PVGIS_URL = 'https://re.jrc.ec.europa.eu/api/v5_2/PVcalc';

export default async function handler(req, res) {
  const { lat, lon, kwp, tilt = 10, azimuth = 0, losses = 14 } = req.query;
  if (!lat || !lon || !kwp) {
    return res.status(400).json({ error: 'Faltan parámetros: lat, lon, kwp' });
  }
  const url = `${PVGIS_URL}?lat=${lat}&lon=${lon}&peakpower=${kwp}&loss=${losses}&angle=${tilt}&aspect=${azimuth}&outputformat=json&pvtechchoice=crystSi&mountingplace=building`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'alebas-cotizador/1.0' } });
    if (!r.ok) {
      return res.status(r.status).json({ error: `PVGIS HTTP ${r.status}` });
    }
    const j = await r.json();
    const fixed = j?.outputs?.totals?.fixed;
    const monthly = j?.outputs?.monthly?.fixed;
    if (!fixed?.E_y) {
      return res.status(502).json({ error: 'PVGIS: respuesta sin datos' });
    }
    const data = {
      annualKwh: Math.round(fixed.E_y),
      monthlyKwh: monthly?.map(m => ({ month: m.month, kwh: Math.round(m.E_m) })) || [],
      irradiationAnnual: Number(fixed['H(i)_y']?.toFixed(0)),
      psh: Number((fixed['H(i)_y'] / 365).toFixed(2)),
      source: 'PVGIS',
    };
    // Edge cache: 7 días (inmutable por coordenadas + capacidad).
    res.setHeader('Cache-Control', 's-maxage=604800, stale-while-revalidate=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json(data);
  } catch (err) {
    return res.status(502).json({ error: `PVGIS fetch failed: ${err.message}` });
  }
}

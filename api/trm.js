// Vercel serverless: Tasa Representativa del Mercado (TRM) COP/USD.
// Fuente primaria: datos.gov.co (serie Superfinanciera, dataset 32sa-8pi3).
// Fuente secundaria: ExchangeRate-API (sin key, tier gratuito).
// La TRM se usa en el cotizador para mostrar precios de equipos en USD
// (paneles e inversores se importan y cotizan en USD) y actualizar
// automáticamente el presupuesto cuando el peso fluctúa.
// Cache edge: 4 h (TRM se publica a las 6 pm hora Colombia).

async function fetchFromDatosGov() {
  const r = await fetch(
    'https://www.datos.gov.co/resource/32sa-8pi3.json?$limit=1&$order=vigenciadesde+DESC',
    { headers: { 'User-Agent': 'alebas-cotizador/1.0', Accept: 'application/json' } }
  );
  if (!r.ok) throw new Error(`datos.gov.co HTTP ${r.status}`);
  const rows = await r.json();
  if (!rows?.length) throw new Error('datos.gov.co: sin registros');
  const v = parseFloat(rows[0].valor);
  if (!v || v < 1000 || v > 20000) throw new Error(`TRM fuera de rango: ${v}`);
  return { cop_per_usd: v, date: (rows[0].vigenciadesde || '').slice(0, 10), source: 'datos.gov.co (Superfinanciera)' };
}

async function fetchFromExchangeRateApi() {
  const r = await fetch('https://open.er-api.com/v6/latest/USD', {
    headers: { 'User-Agent': 'alebas-cotizador/1.0' },
  });
  if (!r.ok) throw new Error(`ExchangeRate-API HTTP ${r.status}`);
  const j = await r.json();
  const cop = j?.rates?.COP;
  if (!cop || cop < 1000) throw new Error(`COP rate inválida: ${cop}`);
  return { cop_per_usd: +cop.toFixed(2), date: new Date().toISOString().slice(0, 10), source: 'open.er-api.com' };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=14400, stale-while-revalidate=3600');

  try {
    // Intentar fuente primaria; caer a secundaria si falla.
    let data;
    try {
      data = await fetchFromDatosGov();
    } catch (e1) {
      data = await fetchFromExchangeRateApi();
    }
    return res.status(200).json({ ...data, syncedAt: new Date().toISOString() });
  } catch (err) {
    return res.status(502).json({ error: `TRM fetch failed: ${err.message}` });
  }
}

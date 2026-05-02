import { n8nPost } from './n8n';

// Rango de colores para flujo solar anual (kWh/m²/año).
// Escala perceptualmente uniforme: azul (bajo) → cian → verde → amarillo → rojo (alto).
const FLUX_RAMP = [
  [0,    [  0,  0, 255]],   // azul — muy bajo
  [0.2,  [  0,128, 255]],   // azul claro
  [0.4,  [  0,220, 180]],   // cian-verde
  [0.6,  [  0,220,  60]],   // verde
  [0.75, [200,230,  10]],   // amarillo-verde
  [0.88, [255,180,   0]],   // naranja
  [1.0,  [255,  0,   0]],   // rojo — muy alto
];

function interpolateColor(t) {
  t = Math.max(0, Math.min(1, t));
  let i = 0;
  while (i < FLUX_RAMP.length - 2 && t > FLUX_RAMP[i + 1][0]) i++;
  const [t0, c0] = FLUX_RAMP[i];
  const [t1, c1] = FLUX_RAMP[i + 1];
  const f = (t - t0) / (t1 - t0);
  return [
    Math.round(c0[0] + (c1[0] - c0[0]) * f),
    Math.round(c0[1] + (c1[1] - c0[1]) * f),
    Math.round(c0[2] + (c1[2] - c0[2]) * f),
  ];
}

// Llama a n8n para obtener las URLs firmadas de dataLayers + bounds.
export async function fetchDataLayerUrls({ lat, lon, radiusMeters = 50 }) {
  let data;
  try {
    data = await n8nPost('solar-datalayers', { lat, lon, radiusMeters });
  } catch (e) {
    const msg = String(e?.message || e || '');
    // n8n devuelve "Error fetching data" cuando el webhook no está registrado
    // (workflow no importado/activado en producción).
    if (/Error fetching data|404|not.?registered|webhook.*not/i.test(msg)) {
      throw new Error('Servicio de irradiancia aún no disponible. Avisa al admin para activar el workflow en n8n.');
    }
    throw e;
  }
  if (!data || data.ok === false) {
    throw new Error(data?.detail || 'solar-datalayers: error desconocido');
  }
  return data; // { annualFluxUrl, bounds, imageryDate, ... }
}

// Descarga un GeoTIFF desde una URL firmada de Google Solar,
// parsea con geotiff.js, y devuelve un PNG data-URL + bounds.
// bounds se puede omitir — si falta se deriva del propio GeoTIFF.
export async function geotiffToPngDataUrl(signedUrl, apiBounds) {
  const { fromUrl } = await import('geotiff');
  const tiff = await fromUrl(signedUrl);
  const image = await tiff.getImage();
  const [raster] = await image.readRasters({ interleave: false });

  const width = image.getWidth();
  const height = image.getHeight();

  // Extraer bounds del GeoTIFF si el API no los entregó.
  // image.getBoundingBox() → [west, south, east, north] en WGS84.
  let bounds = apiBounds;
  if (!bounds) {
    try {
      const [west, south, east, north] = image.getBoundingBox();
      bounds = { sw: { lat: south, lng: west }, ne: { lat: north, lng: east } };
    } catch (_) { /* sin georef — overlay no se posicionará */ }
  }

  // Calcular min/max para normalizar (ignorar nodata = 0 o NaN).
  let minVal = Infinity, maxVal = -Infinity;
  for (let i = 0; i < raster.length; i++) {
    const v = raster[i];
    if (v > 0 && Number.isFinite(v)) {
      if (v < minVal) minVal = v;
      if (v > maxVal) maxVal = v;
    }
  }
  const range = maxVal - minVal || 1;

  // Renderizar en canvas offscreen.
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(width, height);

  for (let i = 0; i < raster.length; i++) {
    const v = raster[i];
    const t = v > 0 ? (v - minVal) / range : -1;
    const px = i * 4;
    if (t < 0) {
      // nodata → transparente
      img.data[px] = 0; img.data[px+1] = 0; img.data[px+2] = 0; img.data[px+3] = 0;
    } else {
      const [r, g, b] = interpolateColor(t);
      img.data[px] = r; img.data[px+1] = g; img.data[px+2] = b;
      img.data[px+3] = 180; // semi-transparente para ver satellite debajo
    }
  }
  ctx.putImageData(img, 0, 0);
  return { dataUrl: canvas.toDataURL('image/png'), width, height, minVal, maxVal, bounds };
}

// Procesa los 12 GeoTIFFs mensuales de Google Solar y devuelve
// array[12] con la producción estimada en kWh/mes para cada mes.
// areaM2: área instalable del sistema (para escalar el flujo → kWh).
// systemEfficiency: rendimiento total del sistema (default 0.75).
export async function fetchMonthlyProduction(monthlyFluxUrls, areaM2, systemEfficiency = 0.75) {
  if (!Array.isArray(monthlyFluxUrls) || monthlyFluxUrls.length !== 12) {
    throw new Error('Se necesitan exactamente 12 URLs mensuales');
  }
  const { fromUrl } = await import('geotiff');
  const results = [];
  for (const url of monthlyFluxUrls) {
    const tiff = await fromUrl(url);
    const image = await tiff.getImage();
    const [raster] = await image.readRasters({ interleave: false });
    // Cada píxel = kWh/m²/mes. Calcular media de píxeles válidos (>0).
    let sum = 0, count = 0;
    for (let i = 0; i < raster.length; i++) {
      const v = raster[i];
      if (v > 0 && Number.isFinite(v)) { sum += v; count++; }
    }
    const meanFlux = count > 0 ? sum / count : 0;
    // Producción mensual estimada del sistema: flujo medio × área × eficiencia
    results.push(Math.round(meanFlux * (areaM2 || 30) * systemEfficiency));
  }
  return results;
}

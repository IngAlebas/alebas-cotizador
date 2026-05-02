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
  const data = await n8nPost('solar-datalayers', { lat, lon, radiusMeters });
  if (!data || data.ok === false) {
    throw new Error(data?.detail || 'solar-datalayers: error desconocido');
  }
  return data; // { annualFluxUrl, bounds, imageryDate, ... }
}

// Descarga un GeoTIFF desde una URL firmada de Google Solar,
// parsea con geotiff.js, y devuelve un PNG data-URL + bounds.
export async function geotiffToPngDataUrl(signedUrl, bounds) {
  const { fromUrl } = await import('geotiff');
  const tiff = await fromUrl(signedUrl);
  const image = await tiff.getImage();
  const [raster] = await image.readRasters({ interleave: false });

  const width = image.getWidth();
  const height = image.getHeight();

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
  return { dataUrl: canvas.toDataURL('image/png'), width, height, minVal, maxVal };
}

// Roof-area lookup: Google Solar API primary, Claude fallback — all via n8n.
// Expected n8n workflow at /webhook/solar-roof:
//   Input:  { address?: string, lat?: number, lon?: number }
//   Flow:   1) geocode address if coords missing (Google Geocoding)
//           2) buildingInsights:findClosest (area, panels, shade)
//           3) dataLayers:get (imagery URLs, annualFlux, hourlyShade)
//           4) if Solar API returns no data -> ask Claude to estimate
//   Output: {
//     lat, lon,
//     areaM2, maxPanels?, tiltDeg?, azimuthDeg?, sunshineHoursYear?,
//     shadeIndex?, shadeSource?,
//     roofSegments?: [{ azimuthDegrees, pitchDegrees, areaMeters2, sunshineHoursPerYear }],
//     imagery?: { dsmUrl, rgbUrl, maskUrl, annualFluxUrl, monthlyFluxUrl,
//                 hourlyShadeUrls[], imageryDate, imageryQuality },
//     source, confidence, notes?
//   }

import { n8nPost, n8nConfigured } from './n8n';

const CACHE = new Map();
const key = ({ address, lat, lon }) =>
  `${(address || '').toLowerCase().trim()}|${lat?.toFixed?.(4) ?? ''}|${lon?.toFixed?.(4) ?? ''}`;

export function solarConfigured() { return n8nConfigured(); }

export async function lookupRoof({ address, lat, lon } = {}) {
  if (!address && (lat == null || lon == null)) {
    throw new Error('Se requiere dirección o coordenadas');
  }
  const k = key({ address, lat, lon });
  if (CACHE.has(k)) return CACHE.get(k);

  const data = await n8nPost('solar-roof', { address, lat, lon });
  if (!data || typeof data !== 'object') throw new Error('Respuesta inválida de n8n (solar-roof)');

  const norm = {
    lat: Number(data.lat),
    lon: Number(data.lon),
    areaM2: data.areaM2 != null ? Number(data.areaM2) : null,
    maxPanels: data.maxPanels != null ? Math.floor(Number(data.maxPanels)) : null,
    tiltDeg: data.tiltDeg != null ? Number(data.tiltDeg) : null,
    azimuthDeg: data.azimuthDeg != null ? Number(data.azimuthDeg) : null,
    sunshineHoursYear: data.sunshineHoursYear != null ? Number(data.sunshineHoursYear) : null,
    shadeIndex: data.shadeIndex != null ? Number(data.shadeIndex) : null,
    shadeSource: data.shadeSource || null,
    roofSegments: Array.isArray(data.roofSegments) ? data.roofSegments : [],
    imagery: data.imagery || null,
    source: data.source || 'unknown',
    confidence: data.confidence != null ? Number(data.confidence) : null,
    notes: data.notes || '',
  };
  CACHE.set(k, norm);
  return norm;
}

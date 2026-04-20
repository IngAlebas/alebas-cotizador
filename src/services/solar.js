// Roof-area lookup: n8n primario; fallback directo a Google Geocoding + Solar API
// si REACT_APP_GOOGLE_API_KEY está configurada (requiere key restringida a referrer).
// Sin n8n ni key, devuelve error claro — el usuario puede seguir con área manual.

import { n8nPost, n8nConfigured } from './n8n';

const GOOGLE_KEY = process.env.REACT_APP_GOOGLE_API_KEY || '';
const CACHE = new Map();
const key = ({ address, lat, lon }) =>
  `${(address || '').toLowerCase().trim()}|${lat?.toFixed?.(4) ?? ''}|${lon?.toFixed?.(4) ?? ''}`;

export function solarConfigured() {
  return n8nConfigured() || !!GOOGLE_KEY;
}

async function geocode(address) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding HTTP ${res.status}`);
  const data = await res.json();
  const loc = data.results?.[0]?.geometry?.location;
  if (!loc) throw new Error('Dirección no encontrada');
  return { lat: loc.lat, lon: loc.lng, formatted: data.results[0].formatted_address };
}

async function fetchDirectGoogle({ address, lat, lon }) {
  if (!GOOGLE_KEY) throw new Error('Google Solar API requiere REACT_APP_GOOGLE_API_KEY');
  let _lat = lat, _lon = lon;
  if ((_lat == null || _lon == null) && address) {
    const g = await geocode(address);
    _lat = g.lat; _lon = g.lon;
  }
  if (_lat == null || _lon == null) throw new Error('Faltan coordenadas');

  const url = `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${_lat}&location.longitude=${_lon}&requiredQuality=HIGH&key=${GOOGLE_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    const msg = res.status === 404 ? 'Google Solar API no tiene datos para esta ubicación' : `Solar API HTTP ${res.status}`;
    throw new Error(msg);
  }
  const data = await res.json();
  const sp = data.solarPotential || {};
  const wholeRoof = sp.wholeRoofStats || {};
  const roofSegs = Array.isArray(sp.roofSegmentStats) ? sp.roofSegmentStats : [];
  const maxCfg = Array.isArray(sp.solarPanelConfigs) ? sp.solarPanelConfigs[sp.solarPanelConfigs.length - 1] : null;
  const primary = roofSegs[0] || {};

  return {
    lat: _lat,
    lon: _lon,
    areaM2: wholeRoof.areaMeters2 != null ? Number(wholeRoof.areaMeters2) : null,
    maxPanels: maxCfg?.panelsCount != null ? Math.floor(maxCfg.panelsCount) : sp.maxArrayPanelsCount,
    tiltDeg: primary.pitchDegrees != null ? Number(primary.pitchDegrees) : null,
    azimuthDeg: primary.azimuthDegrees != null ? Number(primary.azimuthDegrees) : null,
    sunshineHoursYear: wholeRoof.sunshineQuantiles ? wholeRoof.sunshineQuantiles[5] : null,
    shadeIndex: null,
    shadeSource: null,
    roofSegments: roofSegs.map(s => ({
      azimuthDegrees: s.azimuthDegrees,
      pitchDegrees: s.pitchDegrees,
      areaMeters2: s.stats?.areaMeters2,
      sunshineHoursPerYear: s.stats?.sunshineQuantiles ? s.stats.sunshineQuantiles[5] : null,
    })),
    imagery: data.imageryDate ? { imageryDate: data.imageryDate, imageryQuality: data.imageryQuality } : null,
    source: 'google-direct',
    confidence: 0.9,
    notes: '',
  };
}

export async function lookupRoof({ address, lat, lon } = {}) {
  if (!address && (lat == null || lon == null)) {
    throw new Error('Se requiere dirección o coordenadas');
  }
  const k = key({ address, lat, lon });
  if (CACHE.has(k)) return CACHE.get(k);

  let norm;
  if (n8nConfigured()) {
    try {
      const data = await n8nPost('solar-roof', { address, lat, lon });
      if (!data || typeof data !== 'object') throw new Error('Respuesta inválida de n8n (solar-roof)');
      norm = {
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
    } catch (e) {
      if (GOOGLE_KEY) norm = await fetchDirectGoogle({ address, lat, lon });
      else throw e;
    }
  } else {
    norm = await fetchDirectGoogle({ address, lat, lon });
  }

  CACHE.set(k, norm);
  return norm;
}

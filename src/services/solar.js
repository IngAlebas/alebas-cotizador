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

// Intenta buildingInsights:findClosest con quality fallback HIGH → MEDIUM → LOW.
// Colombia rural suele fallar en HIGH pero responde en MEDIUM/LOW. Reporta el
// nivel efectivo en `imagery.quality` para que el usuario sepa la precisión.
async function fetchInsights(lat, lon) {
  const qualities = ['HIGH', 'MEDIUM', 'LOW'];
  let lastErr = null;
  for (const q of qualities) {
    const url = `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${lat}&location.longitude=${lon}&requiredQuality=${q}&key=${GOOGLE_KEY}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      return { data, effectiveQuality: q };
    }
    lastErr = res.status;
    if (res.status !== 404) break;
  }
  const msg = lastErr === 404
    ? 'Google Solar API no tiene datos para esta ubicación (sin cobertura en LOW/MEDIUM/HIGH)'
    : `Solar API HTTP ${lastErr}`;
  throw new Error(msg);
}

async function fetchDirectGoogle({ address, lat, lon }) {
  if (!GOOGLE_KEY) throw new Error('Google Solar API requiere REACT_APP_GOOGLE_API_KEY');
  let _lat = lat, _lon = lon;
  if ((_lat == null || _lon == null) && address) {
    const g = await geocode(address);
    _lat = g.lat; _lon = g.lon;
  }
  if (_lat == null || _lon == null) throw new Error('Faltan coordenadas');

  const { data, effectiveQuality } = await fetchInsights(_lat, _lon);
  const sp = data.solarPotential || {};
  const wholeRoof = sp.wholeRoofStats || {};
  const roofSegs = Array.isArray(sp.roofSegmentStats) ? sp.roofSegmentStats : [];
  const configs = Array.isArray(sp.solarPanelConfigs) ? sp.solarPanelConfigs : [];
  // El último config es el que maximiza panelsCount, no el de mejor yield.
  // Usamos el de mayor yearlyEnergyDcKwh para el cross-check con PVWatts.
  const bestCfg = configs.reduce((a, b) => (b.yearlyEnergyDcKwh || 0) > (a?.yearlyEnergyDcKwh || 0) ? b : a, null);
  const maxCfg = configs[configs.length - 1] || null;
  const primary = roofSegs[0] || {};
  const quantile = (arr, i) => (Array.isArray(arr) && arr[i] != null) ? Number(arr[i]) : null;

  return {
    lat: _lat,
    lon: _lon,
    areaM2: wholeRoof.areaMeters2 != null ? Number(wholeRoof.areaMeters2) : null,
    installableAreaM2: sp.maxArrayAreaMeters2 != null ? Number(sp.maxArrayAreaMeters2) : null,
    maxPanels: maxCfg?.panelsCount != null ? Math.floor(maxCfg.panelsCount) : sp.maxArrayPanelsCount,
    tiltDeg: primary.pitchDegrees != null ? Number(primary.pitchDegrees) : null,
    azimuthDeg: primary.azimuthDegrees != null ? Number(primary.azimuthDegrees) : null,
    sunshineHoursYear: quantile(wholeRoof.sunshineQuantiles, 5),
    peakSunshineHoursYear: sp.maxSunshineHoursPerYear != null ? Number(sp.maxSunshineHoursPerYear) : quantile(wholeRoof.sunshineQuantiles, 10),
    yearlyEnergyDcKwh: bestCfg?.yearlyEnergyDcKwh != null ? Number(bestCfg.yearlyEnergyDcKwh) : null,
    panelCapacityWatts: sp.panelCapacityWatts != null ? Number(sp.panelCapacityWatts) : null,
    carbonOffsetFactorKgPerMwh: sp.carbonOffsetFactorKgPerMwh != null ? Number(sp.carbonOffsetFactorKgPerMwh) : null,
    shadeIndex: null,
    shadeSource: null,
    roofSegments: roofSegs.map(s => ({
      azimuthDegrees: s.azimuthDegrees,
      pitchDegrees: s.pitchDegrees,
      areaMeters2: s.stats?.areaMeters2,
      sunshineHoursPerYear: quantile(s.stats?.sunshineQuantiles, 5),
      // CRITICAL: Google Solar API devuelve center y boundingBox con
      // shape {latitude, longitude}. La app espera {lat, lng}.
      // Transformar acá para que InteractiveRoofMap renderice los
      // polígonos correctamente. Sin esto, segmentos sin coords →
      // ningún polígono visible en el mapa (page sin cubiertas).
      center: s.center ? { lat: Number(s.center.latitude), lng: Number(s.center.longitude) } : null,
      boundingBox: s.boundingBox && s.boundingBox.sw && s.boundingBox.ne ? {
        sw: { lat: Number(s.boundingBox.sw.latitude), lng: Number(s.boundingBox.sw.longitude) },
        ne: { lat: Number(s.boundingBox.ne.latitude), lng: Number(s.boundingBox.ne.longitude) },
      } : null,
    })),
    imagery: data.imageryDate ? {
      imageryDate: data.imageryDate,
      imageryQuality: data.imageryQuality,
      quality: effectiveQuality,
    } : { quality: effectiveQuality },
    source: 'google-direct',
    confidence: effectiveQuality === 'HIGH' ? 0.9 : effectiveQuality === 'MEDIUM' ? 0.75 : 0.6,
    notes: effectiveQuality !== 'HIGH' ? `Datos Google Solar a calidad ${effectiveQuality} (HIGH no disponible en esta ubicación).` : '',
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
      const data = await n8nPost('solar-roof-cached', { address, lat, lon });
      if (!data || typeof data !== 'object') throw new Error('Servicio de análisis de techo no disponible. Intenta de nuevo en unos minutos.');
      // El workflow puede devolver {ok:false, reason, detail} cuando geocoding falla,
      // input es inválido, o falta GOOGLE_API_KEY. Sin este check los Number(undefined)
      // de abajo producen NaN silenciosos que rompen el render aguas abajo.
      if (data.ok === false) {
        const detail = data.detail || `solar-roof: ${data.reason || 'error desconocido'}`;
        throw new Error(detail);
      }
      norm = {
        lat: Number(data.lat),
        lon: Number(data.lon),
        areaM2: data.areaM2 != null ? Number(data.areaM2) : null,
        installableAreaM2: data.installableAreaM2 != null ? Number(data.installableAreaM2) : null,
        maxPanels: data.maxPanels != null ? Math.floor(Number(data.maxPanels)) : null,
        tiltDeg: data.tiltDeg != null ? Number(data.tiltDeg) : null,
        azimuthDeg: data.azimuthDeg != null ? Number(data.azimuthDeg) : null,
        sunshineHoursYear: data.sunshineHoursYear != null ? Number(data.sunshineHoursYear) : null,
        peakSunshineHoursYear: data.peakSunshineHoursYear != null ? Number(data.peakSunshineHoursYear) : null,
        yearlyEnergyDcKwh: data.yearlyEnergyDcKwh != null ? Number(data.yearlyEnergyDcKwh) : null,
        panelCapacityWatts: data.panelCapacityWatts != null ? Number(data.panelCapacityWatts) : null,
        carbonOffsetFactorKgPerMwh: data.carbonOffsetFactorKgPerMwh != null ? Number(data.carbonOffsetFactorKgPerMwh) : null,
        shadeIndex: data.shadeIndex != null ? Number(data.shadeIndex) : null,
        shadeSource: data.shadeSource || null,
        roofSegments: Array.isArray(data.roofSegments) ? data.roofSegments : [],
        imagery: data.imagery || null,
        staticMapUrl: data.staticMapUrl || null,
        staticMapRoadUrl: data.staticMapRoadUrl || null,
        staticMapHDUrl: data.staticMapHDUrl || null,
        imageryQuality: data.imageryQuality || null,
        wholeRoofAreaM2: data.wholeRoofAreaM2 != null ? Number(data.wholeRoofAreaM2) : null,
        groundAreaM2: data.groundAreaM2 != null ? Number(data.groundAreaM2) : null,
        panelsDetected: data.panelsDetected != null ? Number(data.panelsDetected) : null,
        coordinatesPrecisionHint: data.coordinatesPrecisionHint || null,
        source: data.source || 'unknown',
        confidence: data.confidence != null ? Number(data.confidence) : null,
        notes: data.notes || '',
      };
    } catch (e) {
      // n8n es la fuente de verdad — el workflow ya tiene su propio fallback Claude.
      // El antiguo fallback fetchDirectGoogle usaba REACT_APP_GOOGLE_API_KEY desde el
      // navegador, pero esa key DEBE tener restricción por referrer (seguridad), y
      // Google Solar API NO acepta keys con restricciones de referrer → producía el
      // confuso error "API keys with referer restrictions cannot be used with this API".
      // Ahora propagamos el error real de n8n para que el usuario sepa qué pasó.
      throw e;
    }
  } else {
    norm = await fetchDirectGoogle({ address, lat, lon });
  }

  CACHE.set(k, norm);
  return norm;
}

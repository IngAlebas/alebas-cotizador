// Helper para añadir polígonos de cubiertas detectadas a URLs de Google
// Static Maps existentes. La URL ya viene firmada con la API key desde n8n
// (solar-roof.json buildStaticMapUrls); aquí solo agregamos &path=... por
// cada segmento.
//
// Google Static Maps soporta paths con relleno: el primer y último punto
// deben coincidir para cerrar el polígono.

// Construye un string de path con los corners del bounding box.
// Color hex sin '#': ej '4ade80'. fillAlpha en hex de 2 chars: '33' = ~20%.
function bboxPath(sw, ne, color, fillAlpha = '33', weight = 2) {
  const f = (n) => Number(n).toFixed(6);
  const corners = [
    `${f(sw.lat)},${f(sw.lng)}`,
    `${f(sw.lat)},${f(ne.lng)}`,
    `${f(ne.lat)},${f(ne.lng)}`,
    `${f(ne.lat)},${f(sw.lng)}`,
    `${f(sw.lat)},${f(sw.lng)}`,
  ];
  return `color:0x${color}FF|fillcolor:0x${color}${fillAlpha}|weight:${weight}|${corners.join('|')}`;
}

// Acepta sw/ne en formato lat/lng o latitude/longitude (n8n a veces pasa raw).
function pickLatLng(p) {
  if (!p) return null;
  const lat = p.lat ?? p.latitude;
  const lng = p.lng ?? p.longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat: Number(lat), lng: Number(lng) };
}

// Devuelve la URL de Static Maps con los segmentos dibujados como bbox.
// Cubiertas activas en verde; inactivas (selected===false) en naranja.
// Si la URL final supera 8000 chars, hace fallback a la URL original.
export function addRoofSegmentsToStaticUrl(url, segments) {
  if (!url || !Array.isArray(segments) || segments.length === 0) return url;
  const paths = [];
  for (const s of segments) {
    const sw = pickLatLng(s.boundingBox?.sw);
    const ne = pickLatLng(s.boundingBox?.ne);
    if (!sw || !ne) continue;
    const isActive = s.selected !== false;
    const color = isActive ? '4ade80' : 'fb923c';
    paths.push(bboxPath(sw, ne, color, isActive ? '44' : '22', isActive ? 3 : 2));
  }
  if (paths.length === 0) return url;
  const sep = url.includes('?') ? '&' : '?';
  const extra = paths.map(p => `path=${encodeURIComponent(p)}`).join('&');
  const finalUrl = url + sep + extra;
  // Static Maps URL hard limit ~8192 chars; deja margen de 200 para seguridad.
  if (finalUrl.length > 8000) return url;
  return finalUrl;
}

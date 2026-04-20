// Catálogo de cargas típicas (cuadro de cargas off-grid).
// Primario: n8n /webhook/loads-catalog → tabla editable desde BackOffice.
// Fallback: lista local por defecto. Cacheado en localStorage 7 días.

import { n8nPost, n8nConfigured } from './n8n';

const CACHE_KEY = 'loads:catalog';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Catálogo detallado. `peakWatts` = arranque inductivo (útil para dimensionar inversor off-grid).
export const DEFAULT_LOADS_CATALOG = [
  // Cocina
  { name: 'Nevera 11 pies', watts: 120, peakWatts: 600, hours: 8, qty: 1, category: 'Cocina' },
  { name: 'Nevera 14 pies (no-frost)', watts: 180, peakWatts: 900, hours: 8, qty: 1, category: 'Cocina' },
  { name: 'Congelador horizontal 200 L', watts: 250, peakWatts: 1200, hours: 10, qty: 1, category: 'Cocina' },
  { name: 'Microondas 1100 W', watts: 1100, peakWatts: 1300, hours: 0.25, qty: 1, category: 'Cocina' },
  { name: 'Horno eléctrico', watts: 1500, peakWatts: 1800, hours: 0.5, qty: 1, category: 'Cocina' },
  { name: 'Licuadora', watts: 400, peakWatts: 800, hours: 0.1, qty: 1, category: 'Cocina' },
  { name: 'Cafetera', watts: 900, peakWatts: 1000, hours: 0.3, qty: 1, category: 'Cocina' },
  { name: 'Olla arrocera', watts: 700, peakWatts: 800, hours: 0.5, qty: 1, category: 'Cocina' },
  { name: 'Campana extractora', watts: 80, peakWatts: 150, hours: 1, qty: 1, category: 'Cocina' },

  // Iluminación
  { name: 'Bombillo LED 10 W', watts: 10, peakWatts: 10, hours: 5, qty: 8, category: 'Iluminación' },
  { name: 'Bombillo LED 18 W', watts: 18, peakWatts: 18, hours: 5, qty: 4, category: 'Iluminación' },
  { name: 'Panel LED 24 W (oficina)', watts: 24, peakWatts: 24, hours: 8, qty: 2, category: 'Iluminación' },
  { name: 'Reflector LED 50 W (exterior)', watts: 50, peakWatts: 55, hours: 10, qty: 2, category: 'Iluminación' },

  // Entretenimiento
  { name: 'TV LED 32"', watts: 45, peakWatts: 60, hours: 4, qty: 1, category: 'Entretenimiento' },
  { name: 'TV LED 43"', watts: 80, peakWatts: 120, hours: 4, qty: 1, category: 'Entretenimiento' },
  { name: 'TV LED 55"', watts: 120, peakWatts: 160, hours: 4, qty: 1, category: 'Entretenimiento' },
  { name: 'Consola de videojuegos', watts: 180, peakWatts: 250, hours: 2, qty: 1, category: 'Entretenimiento' },
  { name: 'Equipo de sonido', watts: 100, peakWatts: 200, hours: 2, qty: 1, category: 'Entretenimiento' },

  // Climatización
  { name: 'Ventilador techo', watts: 60, peakWatts: 120, hours: 6, qty: 2, category: 'Climatización' },
  { name: 'Ventilador piso', watts: 75, peakWatts: 150, hours: 6, qty: 1, category: 'Climatización' },
  { name: 'Aire acondicionado 9 000 BTU', watts: 850, peakWatts: 2500, hours: 6, qty: 1, category: 'Climatización' },
  { name: 'Aire acondicionado 12 000 BTU', watts: 1100, peakWatts: 3300, hours: 6, qty: 1, category: 'Climatización' },
  { name: 'Aire acondicionado 18 000 BTU', watts: 1650, peakWatts: 4500, hours: 6, qty: 1, category: 'Climatización' },
  { name: 'Aire acondicionado 24 000 BTU', watts: 2200, peakWatts: 6000, hours: 6, qty: 1, category: 'Climatización' },
  { name: 'Calentador de paso eléctrico', watts: 5500, peakWatts: 6000, hours: 0.2, qty: 1, category: 'Climatización' },

  // Hogar
  { name: 'Lavadora carga superior 9 kg', watts: 500, peakWatts: 1500, hours: 1, qty: 1, category: 'Hogar' },
  { name: 'Lavadora carga frontal 12 kg', watts: 800, peakWatts: 2000, hours: 1.2, qty: 1, category: 'Hogar' },
  { name: 'Secadora eléctrica', watts: 2500, peakWatts: 3000, hours: 0.8, qty: 1, category: 'Hogar' },
  { name: 'Plancha', watts: 1000, peakWatts: 1100, hours: 0.5, qty: 1, category: 'Hogar' },
  { name: 'Aspiradora', watts: 800, peakWatts: 1200, hours: 0.3, qty: 1, category: 'Hogar' },
  { name: 'Ducha eléctrica (paso bajo)', watts: 3500, peakWatts: 3700, hours: 0.25, qty: 1, category: 'Hogar' },
  { name: 'Ducha eléctrica (paso alto)', watts: 5500, peakWatts: 5800, hours: 0.25, qty: 1, category: 'Hogar' },

  // Electrónicos
  { name: 'Computador portátil', watts: 65, peakWatts: 90, hours: 5, qty: 1, category: 'Electrónicos' },
  { name: 'Computador de escritorio + monitor', watts: 250, peakWatts: 400, hours: 5, qty: 1, category: 'Electrónicos' },
  { name: 'Impresora láser', watts: 350, peakWatts: 900, hours: 0.3, qty: 1, category: 'Electrónicos' },
  { name: 'Router Wi-Fi', watts: 10, peakWatts: 15, hours: 24, qty: 1, category: 'Electrónicos' },
  { name: 'Modem fibra óptica', watts: 12, peakWatts: 18, hours: 24, qty: 1, category: 'Electrónicos' },
  { name: 'Cargadores de celular', watts: 25, peakWatts: 25, hours: 3, qty: 3, category: 'Electrónicos' },
  { name: 'Cámara de seguridad IP', watts: 6, peakWatts: 8, hours: 24, qty: 4, category: 'Electrónicos' },
  { name: 'DVR/NVR videovigilancia', watts: 25, peakWatts: 35, hours: 24, qty: 1, category: 'Electrónicos' },

  // Bombeo y agua
  { name: 'Bomba de agua 0.5 HP', watts: 370, peakWatts: 1100, hours: 1, qty: 1, category: 'Bombeo' },
  { name: 'Bomba de agua 1 HP', watts: 750, peakWatts: 2250, hours: 1, qty: 1, category: 'Bombeo' },
  { name: 'Bomba de agua 2 HP (pozo profundo)', watts: 1500, peakWatts: 4500, hours: 2, qty: 1, category: 'Bombeo' },
  { name: 'Bomba piscina 1 HP', watts: 750, peakWatts: 2250, hours: 4, qty: 1, category: 'Bombeo' },
  { name: 'Filtro/Oxigenador estanque', watts: 80, peakWatts: 150, hours: 24, qty: 1, category: 'Bombeo' },

  // Agropecuario / industrial ligero
  { name: 'Ordeñadora eléctrica', watts: 1500, peakWatts: 4500, hours: 2, qty: 1, category: 'Agropecuario' },
  { name: 'Tanque frío de leche', watts: 2200, peakWatts: 4000, hours: 8, qty: 1, category: 'Agropecuario' },
  { name: 'Incubadora avícola', watts: 180, peakWatts: 250, hours: 24, qty: 1, category: 'Agropecuario' },
  { name: 'Cerca eléctrica (energizador)', watts: 15, peakWatts: 30, hours: 24, qty: 1, category: 'Agropecuario' },
  { name: 'Motor trifásico 3 HP', watts: 2200, peakWatts: 6600, hours: 3, qty: 1, category: 'Agropecuario' },
  { name: 'Picadora de pasto', watts: 1500, peakWatts: 4500, hours: 1, qty: 1, category: 'Agropecuario' },

  // Bienestar
  { name: 'Secador de cabello', watts: 1800, peakWatts: 2000, hours: 0.15, qty: 1, category: 'Bienestar' },
  { name: 'Plancha para cabello', watts: 150, peakWatts: 200, hours: 0.2, qty: 1, category: 'Bienestar' },
  { name: 'Máquina de coser', watts: 100, peakWatts: 150, hours: 1, qty: 1, category: 'Bienestar' },
];

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (Date.now() - p.t > TTL_MS) return null;
    return p.d;
  } catch { return null; }
}

function writeCache(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), d: data })); } catch {}
}

export async function fetchLoadsCatalog() {
  const cached = readCache();
  if (cached?.items?.length) return { ...cached, cached: true };
  if (!n8nConfigured()) {
    return { ok: true, items: DEFAULT_LOADS_CATALOG, source: 'local-default' };
  }
  try {
    const data = await n8nPost('loads-catalog', {});
    if (Array.isArray(data?.items) && data.items.length) {
      writeCache(data);
      return data;
    }
    return { ok: true, items: DEFAULT_LOADS_CATALOG, source: 'local-default', notes: data?.error || 'catálogo remoto vacío' };
  } catch (e) {
    return { ok: true, items: DEFAULT_LOADS_CATALOG, source: 'local-default', notes: e?.message || 'sin conexión' };
  }
}

export function invalidateLoadsCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch {}
}

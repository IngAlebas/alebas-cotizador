// Cliente para /webhook/places-autocomplete (sugerencias de direcciones).
// Debounce server-side recomendado en el componente que llama.

import { n8nPost, n8nConfigured } from './n8n';

export const placesConfigured = () => n8nConfigured();

// Genera un sessionToken para agrupar autocompletes con el detalle final
// (si en algún momento añadimos un endpoint /place-details, los billa Google
// como una sola sesión a tarifa reducida).
export function newPlacesSessionToken() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'sess_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function autocompleteAddress(input, sessionToken) {
  if (!input || input.length < 3) return { ok: true, suggestions: [] };
  try {
    const data = await n8nPost('places-autocomplete', { input, sessionToken });
    if (!data || data.ok === false) {
      return { ok: false, suggestions: [], reason: data?.reason, detail: data?.detail };
    }
    return { ok: true, suggestions: data.suggestions || [] };
  } catch (e) {
    return { ok: false, suggestions: [], detail: e?.message || 'error' };
  }
}

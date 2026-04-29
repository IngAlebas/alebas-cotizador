// Singleton loader del SDK Google Maps JS. Inyecta el <script> una sola vez,
// devuelve siempre la misma promesa. Cualquier componente que necesite el SDK
// importa loadGoogleMaps() y espera el resultado.
//
// Requiere REACT_APP_GOOGLE_API_KEY en el entorno (Vercel) con las APIs
// "Maps JavaScript API" y "Maps Static API" habilitadas y restricción por
// HTTP referer al dominio de producción.

let loadPromise = null;

export function loadGoogleMaps() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Google Maps no disponible en SSR'));
  if (window.google && window.google.maps) return Promise.resolve(window.google.maps);
  if (loadPromise) return loadPromise;

  const key = process.env.REACT_APP_GOOGLE_API_KEY;
  if (!key) return Promise.reject(new Error('REACT_APP_GOOGLE_API_KEY no configurada'));

  loadPromise = new Promise((resolve, reject) => {
    const cbName = '__alebasGmapsReady_' + Date.now();
    let timeoutId;
    const cleanup = () => {
      try { delete window[cbName]; } catch (_) {}
      try { delete window.gm_authFailure; } catch (_) {}
      if (timeoutId) clearTimeout(timeoutId);
    };
    // Google Maps llama a window.gm_authFailure (global) cuando la API key tiene
    // problema de auth: RefererNotAllowedMapError, ApiNotActivatedMapError,
    // BillingNotEnabledMapError, etc. Capturamos para mostrar mensaje concreto.
    window.gm_authFailure = () => {
      loadPromise = null;
      cleanup();
      reject(new Error('Google Maps rechazó la API key. Causas típicas: (1) el dominio actual no está en HTTP referrers de la key, (2) "Maps JavaScript API" no habilitada, (3) billing desactivado en Google Cloud, (4) cuota agotada. Abre F12 → Console para ver el código de error exacto.'));
    };
    window[cbName] = () => {
      cleanup();
      if (window.google && window.google.maps) resolve(window.google.maps);
      else reject(new Error('Google Maps cargó sin namespace google.maps'));
    };
    // Timeout 15s
    timeoutId = setTimeout(() => {
      loadPromise = null;
      cleanup();
      reject(new Error('Google Maps tardó >15s sin responder. Posibles causas: API key sin cuota, billing desactivado, o restricciones HTTP referrer mal configuradas.'));
    }, 15000);
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=${cbName}&loading=async&v=quarterly`;
    s.async = true;
    s.defer = true;
    s.onerror = () => {
      loadPromise = null;
      cleanup();
      reject(new Error('No se pudo cargar el SDK Google Maps (network error). Verifica conexión y dominio en HTTP referrers de la API key.'));
    };
    document.head.appendChild(s);
  });

  return loadPromise;
}

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
    window[cbName] = () => {
      try { delete window[cbName]; } catch (_) {}
      if (window.google && window.google.maps) resolve(window.google.maps);
      else reject(new Error('Google Maps cargó sin namespace google.maps'));
    };
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=${cbName}&loading=async&v=quarterly`;
    s.async = true;
    s.defer = true;
    s.onerror = () => {
      loadPromise = null;
      try { delete window[cbName]; } catch (_) {}
      reject(new Error('No se pudo cargar el SDK Google Maps'));
    };
    document.head.appendChild(s);
  });

  return loadPromise;
}

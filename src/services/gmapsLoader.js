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
      if (timeoutId) clearTimeout(timeoutId);
    };
    window[cbName] = () => {
      cleanup();
      if (window.google && window.google.maps) resolve(window.google.maps);
      else reject(new Error('Google Maps cargó sin namespace google.maps'));
    };
    // Timeout 15s — sin esto, si la key tiene problema (sin cuota, billing,
    // referrer mal configurado) el script queda colgado y el usuario ve
    // 'Cargando mapa...' indefinidamente.
    timeoutId = setTimeout(() => {
      loadPromise = null;
      cleanup();
      reject(new Error('Google Maps tardó >15s. Verifica REACT_APP_GOOGLE_API_KEY en Vercel: cuota disponible, billing activo, dominio en HTTP referrers.'));
    }, 15000);
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=${cbName}&loading=async&v=quarterly`;
    s.async = true;
    s.defer = true;
    s.onerror = () => {
      loadPromise = null;
      cleanup();
      reject(new Error('No se pudo cargar SDK Google Maps. Verifica conexión y que el dominio esté en la whitelist de la API key.'));
    };
    document.head.appendChild(s);
  });

  return loadPromise;
}

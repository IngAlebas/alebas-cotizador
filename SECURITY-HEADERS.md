# Security headers — política y rationale

> **Cierra el bloqueante #3 de `REVIEW.md`** (CSP, HSTS, X-Frame-Options ausentes).
> Este documento explica qué se aplicó, por qué los `'unsafe-inline'` están todavía,
> y cómo apretar más adelante.

## Resumen

| Header | Valor | Aplicado en |
|---|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Vercel + Helmet |
| `X-Content-Type-Options` | `nosniff` | Vercel + Helmet |
| `X-Frame-Options` | `SAMEORIGIN` | Vercel + Helmet |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Vercel + Helmet |
| `Permissions-Policy` | `geolocation=(self), camera=(), microphone=(), payment=(), interest-cohort=()` | Vercel |
| `Content-Security-Policy` | (ver abajo) | Vercel + Helmet |
| `Cross-Origin-Opener-Policy` | `same-origin` (helmet default) | Helmet |
| `Cross-Origin-Resource-Policy` | `same-origin` (helmet default) | Helmet |

Cookies admin futuras (cuando se migre el JWT a `Set-Cookie`) deben usar
`HttpOnly; Secure; SameSite=Lax; Path=/`. La auth de hoy guarda el JWT en
`localStorage` — depende de esta CSP para mitigar XSS.

## CORS

- Antes: `Access-Control-Allow-Origin: *` en `server.js`.
- Ahora: lista blanca configurable por env var `ALLOWED_ORIGINS` (default
  `solar-hub.co`, `www.solar-hub.co`, `cotiza.alebas.co`). El header se setea
  solo si el `Origin` viene en la lista — requests de orígenes desconocidos
  ahora reciben CORS en blanco (browser bloquea credenciales).

Si abrís un nuevo dominio (ej. `staging.solar-hub.co`), agregalo al env var
`ALLOWED_ORIGINS` en Railway → Variables.

## Content Security Policy

Una sola línea, equivalente en Vercel y Helmet:

```
default-src 'self';
script-src 'self' 'unsafe-inline' https://maps.googleapis.com https://maps.gstatic.com;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com data:;
img-src 'self' data: blob: https://maps.googleapis.com https://maps.gstatic.com https://*.googleusercontent.com https://lh3.googleusercontent.com;
connect-src 'self' https://api.solar-hub.co https://maps.googleapis.com https://solar.googleapis.com;
frame-src 'none';
worker-src 'self' blob:;
manifest-src 'self';
form-action 'self';
base-uri 'self';
object-src 'none';
upgrade-insecure-requests
```

### Por qué cada directiva

- **`script-src 'self' 'unsafe-inline' ...maps...`** — la app tiene 2 scripts
  inline en `public/index.html` (splash + service worker registration). Para
  apretar a `'self'` puro hay que moverlos a archivos externos (ver "Próximos
  pasos"). El allowlist de `maps.googleapis.com` lo necesita
  `services/gmapsLoader.js` que inyecta el JS de Google Maps dinámicamente.

- **`style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`** — React
  usa estilos inline (`<div style={{}}>`) extensivamente, lo cual requiere
  `'unsafe-inline'` para `style-src`. Sacarlo implica refactor a CSS
  modules / styled-components / tailwind. Fuera de alcance de seguridad.
  `fonts.googleapis.com` es para Outfit (ver `src/index.css:1`).

- **`font-src 'self' https://fonts.gstatic.com data:`** — Outfit los descarga
  Google Fonts desde `gstatic.com`. `data:` permite fonts inline (CRA puede
  inlinearlas en build).

- **`img-src 'self' data: blob: ...maps... ...googleusercontent...`** — paneles
  Google Solar API a veces vuelven con redirect a `*.googleusercontent.com`;
  los tiles de Google Maps vienen de `gstatic.com`.

- **`connect-src 'self' https://api.solar-hub.co https://*.googleapis.com`** —
  fetches a n8n y a Google Solar/Maps Geocode (los hace `services/solar.js`
  directo desde el browser).

- **`frame-src 'none'`** — no embebemos iframes externos.

- **`worker-src 'self' blob:`** — el SW se registra desde `/sw.js`. `blob:`
  por si CRA emite chunks que el SW carga como blob (típico).

- **`form-action 'self'`** — los `<form>` de la app no postean a otro origen.
  (En realidad la app no usa `<form>` para post — todo va por `fetch`.)

- **`object-src 'none'`** — nunca usamos `<object>`/`<embed>`. Bloquea
  vectores de XSS via Flash/PDF embebidos.

- **`base-uri 'self'`** — bloquea inyección de `<base href="evil.com">`.

- **`upgrade-insecure-requests`** — fuerza HTTPS para subresources si por
  error queda algún `http://` literal en el código.

### Lo que la CSP NO bloquea hoy (deuda)

- `script-src 'unsafe-inline'` — XSS via stored data renderizada como `<script>`
  inline TODAVÍA pasaría. React mitiga esto en JSX (escape automático), pero
  un futuro `dangerouslySetInnerHTML` que muestre data del servidor sería
  vulnerable. Hoy no hay `dangerouslySetInnerHTML` en el código (verificado).

- `style-src 'unsafe-inline'` — un atacante que pueda inyectar HTML podría
  mostrar overlays clickjacking-style. Combinado con `frame-src 'none'` y
  X-Frame-Options, el riesgo real es bajo.

## Cómo apretar (próxima iteración)

### A. Mover los inline scripts de `public/index.html` a archivos externos

1. Mover el splash JS a `public/splash.js`, cargarlo con `<script src="/splash.js" defer></script>`.
2. Mover el SW registration a `public/register-sw.js`, cargarlo igual.
3. Quitar `'unsafe-inline'` de `script-src`.
4. Si CRA inyecta runtime inline (default), agregar nonces o usar el plugin
   `craco` para forzar runtime externo.

### B. Eliminar inline styles de React

Refactor a CSS modules o tailwind. Una vez que ningún componente use
`style={{}}`, quitar `'unsafe-inline'` de `style-src`. Trabajo grande,
no urgente (el riesgo real es bajo con `frame-src 'none'`).

### C. Reportar violaciones a un endpoint

Agregar `report-uri` y/o `report-to` al CSP para recibir reportes de
intentos bloqueados. Útil para descubrir qué scripts/styles inesperados
intenta cargar la app antes de apretar más.

```
... ; report-uri https://api.solar-hub.co/webhook/csp-report
```

Workflow n8n nuevo `csp-report.json` que persista en una tabla.

### D. Eliminar la carpeta `api/` (DEPRECATED)

El `api/DEPRECATED.md` dice que se podía eliminar después de 2026-05-04.
Hoy ya pasó. Próximo paso:

1. Verificar logs Railway de `/api/*` calls en las últimas 2 semanas.
2. Si hay 0 hits: `rm -rf api/` + remover el bloque de carga dinámica en
   `server.js` (líneas 75-99 aprox).
3. Reduce la superficie de ataque y elimina otra rama de complejidad.

## Rollback

Si la CSP rompe algo en producción:

1. **Switch a Report-Only**: en `vercel.json` cambiá la key del CSP de
   `Content-Security-Policy` a `Content-Security-Policy-Report-Only`.
   Browser ya no bloquea, solo reporta. Re-deploy.
2. **Borrá la directiva problemática** del valor del header. Re-deploy.
3. **Revertir todo el header**: borrá la entrada `Content-Security-Policy`
   de `vercel.json` y comentá la sección `contentSecurityPolicy` de
   helmet en `server.js`. Re-deploy.

Recordá que las CSP también las cachea el browser (sí, vía cache-control
del HTML). Hard-reload en testing (Ctrl+Shift+R) y `?cb=1` para forzar.

## Smoke test

```bash
# Verificar headers en producción
curl -sI https://solar-hub.co | grep -iE 'content-security|strict-transport|x-frame|referrer-policy'
curl -sI https://solar-hub.co | grep -i permissions-policy

# Si Railway sigue activo (mismo dominio o otro):
curl -sI https://<railway-domain>/healthz | grep -iE 'content-security|x-content'
```

En el browser:
1. Abrir DevTools → Console al cargar `/`.
2. No debe haber errores tipo "Refused to load the script ... because it
   violates the following Content Security Policy directive". Si los hay,
   identificar el dominio + ajustar la directiva correspondiente.
3. Network tab → seleccionar el HTML principal → Headers → confirmar la
   CSP y el resto de headers en la respuesta.

## Referencias

- [Helmet docs](https://helmetjs.github.io/) — defaults razonables, opt-out de los que rompan.
- [CSP MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP).
- [Mozilla Observatory](https://observatory.mozilla.org/) — pegar `solar-hub.co` post-deploy
  para grade A+ esperado.
- [securityheaders.com](https://securityheaders.com/) — alternativa.

# REVIEW — alebas-cotizador / SolarHub

> **Commit revisado:** `0cdaf18` (rama `main`)
> **Fecha del review:** 2026-05-07
> **Alcance:** App.jsx, constants.js, services/*, components clave (InstallerReg, SupplierPortal), workflows n8n principales (save-quote, validate-contact, list-quotes, quote-public, solar-cache), server.js, public/index.html, public/sw.js, vercel.json. Quoter.jsx no se leyó completo; solo se cruzó contra los helpers de constants.js.
>
> Auditoría estratégica complementaria: ver `AUDIT.md`.

---

## Bloqueantes (resolver antes de escalar tráfico)

- **Contraseña de admin embebida en el bundle JS.** `src/App.jsx:15` define `ADMIN_HASH = 'sh_' + btoa('hoJSDU2!kaiv337c')`. `btoa` es Base64, no un hash — la contraseña sale en claro en cualquier inspector. El check `'sh_' + btoa(pwd) === ADMIN_HASH` es client-side, nadie lo aplica del lado servidor. Combinado con que el back office maneja datos de contacto (Habeas Data, Ley 1581/2012), esto es responsabilidad civil. **Fix:** mover la autenticación al backend — n8n con sesiones cookie firmadas (HttpOnly + Secure + SameSite=Lax) o un endpoint `/admin-login` que devuelva un JWT corto y un refresh token, validados en cada `list-quotes` / `update-quote`. Sin esto, todo `list-quotes` debería rechazarse con 401.

- **`REACT_APP_N8N_TOKEN` expuesto en el bundle.** `src/services/n8n.js:6` lee `process.env.REACT_APP_N8N_TOKEN` y lo manda como header `x-alebas-token`. CRA inyecta literal todas las `REACT_APP_*` en el JS público. Cualquier scraper lo lee. Si los workflows confían en ese token como única auth, no son privados. **Fix:** los webhooks que solo deba consumir el frontend público (save-quote, validate-contact) no necesitan token y deberían validar por origen + rate-limit; los webhooks de admin (list-quotes, update-quote) requieren la sesión de admin del punto anterior, no un secreto compartido en el cliente.

- **CORS abierto a `*` en el servidor.** `server.js:22-27`. Si `api/` está realmente deprecated, eliminar el directorio (el server lo monta dinámicamente) y borrar el bloque CORS. Si todavía se usa, restringir a `https://solar-hub.co` y `https://cotiza.alebas.co`.

- **Falta de cabeceras de seguridad.** Ni `vercel.json` ni `server.js` setean CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy ni HSTS. Mínimo viable: agregar `helmet()` en Express y la sección `headers` en `vercel.json`. La PWA carga scripts inline (splash, SW kill-switch) — la CSP necesita `'unsafe-inline'` para los `<script>` actuales o nonce + ajuste.

---

## Bugs de cálculo (siguen sin corregir desde abril)

- **`kgTotal` suma kW del inversor como kg.** `src/constants.js:638-642`:
  ```
  + (noInverter ? 0 : invKw)  // inversor aprox (0 si no hay disponible)
  ```
  `invKw` es la potencia nominal en kW (3, 5, 10…), pero se suma al peso total en kg. Para un inversor real son ~14-36 kg según modelo (los DEFAULT_INVERTERS ya traen `kg`). Resultado: el `kgTotal` que entra a `calcTransport` está sub-contado por ~10-30 kg, y la cotización de courier baja artificialmente. **Fix:** reemplazar `invKw` por `invObj.kg ?? 20`.

- **IVA aplicado dos veces sobre el transporte.** `src/constants.js:687-688`:
  ```
  const bBase = st + ca + pt + ins + pricing.engineering + pricing.emsa_tramites + (transport || 0);
  const iva = Math.round(bBase * (pricing.iva / 100));
  ```
  El flete que devuelve `pickBestTransport` viene de tarifas Interrapidísimo/Servientrega 2025-2026, que ya están con IVA incluido. Aplicarle `+19%` encima sobreestima el presupuesto Sección B. **Fix:** excluir `transport` de la base imponible: `bBase = st + ca + pt + ins + eng + tramites; iva = bBase * 0.19; sB = bBase + iva + transport;`.

- **Heurística `pps = floor(700/40)` como trampa silenciosa.** `src/constants.js:545`. La función `sizeStrings` cae a 17 paneles/string si falta cualquier spec eléctrica (`voc`, `vocMax`, `mpptVmax`). Hoy DEFAULT_INVERTERS y DEFAULT_PANELS sí traen specs, pero si el admin agrega un panel desde el back office sin llenar `voc`, `vmp`, `imp`, los cálculos pasan a la heurística sin ningún warning. **Fix:** marcar `specsSource: 'heuristic'` en la respuesta y bloquear el render del unifilar / agregar warning en la UI si aparece.

- **Cobertura > 100% mostrada como dato real, sin contexto AGPE.** `src/constants.js:630` quitó el cap del 120%. Eso es correcto técnicamente, pero ahora un cliente residencial puede ver "Cobertura 263%" y no entender por qué eso no se traduce 1:1 en ahorro. La info de qué pasa con los excedentes está en `calcAGPEBenefit` pero la UI debe explicarlo junto al `cov`. **Fix:** cuando `cov > 100`, mostrar al lado "(autoconsumo X% + excedentes Y%)" usando el desglose del benefit.

- **`Bogotá D.C.` no está en `DEPTS`.** `src/constants.js:521-527`. `InstallerReg.jsx:73` usa `DEPTS` en el select de depto principal — un instalador de Bogotá no tiene opción de elegir su depto. **Fix:** anteponer `'Bogotá D.C.'` al array.

---

## Seguridad / Habeas Data

- **`gMerge` re-inyecta defaults eliminados.** `src/App.jsx:91-100`. El union-merge entre saved (localStorage) y DEFAULT_* significa que si el admin borra un panel default desde el BackOffice, al siguiente reload vuelve. No es un bug de seguridad pero sí frustra al admin y rompe el modelo mental. **Fix:** mantener un `al:panels:tombstones` con IDs eliminados y filtrar los defaults contra ese set antes del merge.

- **Token de tracking sin TTL ni rotación.** `n8n/quote-public.json:48` compara `payload.trackingToken === input.token` en strict equality (no constant-time). Si una URL `?view=seguimiento&id=X&t=Y` se filtra (Slack, captura de pantalla, log), permanece válida hasta que alguien re-genere el token. **Fix:** agregar `tokenIssuedAt` y rechazar si `now - issued > 90d`. Idealmente regenerar el token al cambiar el estado de la cotización a "ganada"/"perdida" (ahí ya no debería seguir consultándose).

- **Rate-limit por email pero no por IP.** `n8n/validate-contact.json` cuenta cotizaciones recientes por `email`. Un bot puede usar emails distintos por intento. La IP llega en `Normalize` (`src.headers['x-forwarded-for']`) pero no se usa para rate-limit. **Fix:** sumar otra subquery `WHERE ip = $X AND created_at > NOW() - INTERVAL '1 hour'` y bloquear sobre N=20.

- **Honeypot único campo `website`.** `n8n/validate-contact.json:31` rechaza si `website` está lleno. Útil pero los bots modernos lo saltan. Considerar agregar (a) Cloudflare Turnstile en el frontend para los formularios públicos (Quoter, InstallerReg, SupplierPortal), (b) timestamp de "página cargada" en el payload con check de `submitTime - pageLoadTime > 3s`.

- **Logout deja `sh:admin = '0'` en localStorage.** `src/App.jsx:151`. El check es `r?.value === '1'`, así que '0' funciona como logout solo por coincidencia. Usar `localStorage.removeItem('sh:admin')` para no dejar rastro y para que el GC funcione bien.

- **SupplierPortal mete PDFs base64 a localStorage.** `src/components/SupplierPortal.jsx:36-41`. Un PDF de 4 MB se vuelve ~5.4 MB en data URL (Base64 +33%). La quota de localStorage es 5-10 MB total — un solo proveedor puede romper la app. Además los PDFs quedan en el dispositivo del cliente que los subió, no en el del admin. **Fix:** subir el PDF a un endpoint n8n con Postgres bytea o (mejor) a un bucket S3/R2 firmado por backend.

---

## Integraciones n8n

- **`save-quote` sin idempotencia.** `n8n/save-quote.json` hace `INSERT INTO quotes` sin chequear duplicados. Si el frontend reintenta por timeout (45 s default en `n8nPost`) o el usuario hace doble-click, se crean 2+ rows. `users` sí tiene `ON CONFLICT (email)` correcto, `quotes` no. **Fix:** índice único `(user_id, (payload->>'dateISO'))` o agregar `dedupe_key` calculado en frontend (uuid v4 al iniciar el wizard, mismo en cada retry) y `ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`.

- **`solar-cache.json` depende de un default DB que no se ve en el workflow.** `n8n/solar-cache.json:151-160`: el INSERT no pasa `expires_at`, asume que el schema tiene `DEFAULT NOW() + INTERVAL '90 days'`. Si el `n8n/schema.sql` no lo declara así, todos los rows quedan con `expires_at = NULL`, y el lookup `WHERE expires_at > NOW()` nunca matchea → cache 0% hit. **Fix:** auditar `n8n/schema.sql` (no leído en este review). Si falta, o pasar `NOW() + INTERVAL '90 days'` explícito en el INSERT.

- **Manejo de fallas del cache es defensivo pero el continueOnFail enmascara errores reales.** `n8n/solar-cache.json:90-105`. `Lookup cache` tiene `continueOnFail: true`; cualquier fallo de Postgres se trata como MISS. Eso protege la disponibilidad pero hace invisible una conexión rota a la DB — el sistema golpea Google Solar API sin descanso (~$0.04/llamada). Agregar logging/alerta cuando un MISS coincide con error de Postgres.

- **`list-quotes` query con concatenación implícita.** `n8n/list-quotes.json:42` formatea `queryReplacement` como `"={{ $json.status }},{{ $json.search }},{{ $json.limit }}"` separado por comas. n8n parsea eso como un array de 3 strings — funciona pero es frágil. Si algún campo contiene una coma, se rompe el split. **Fix:** usar la sintaxis array-style `={{ [$json.status, $json.search, $json.limit] }}` (igual que en save-quote.json:96).

- **`save-quote.json` envía `solar_panels` con hasta 500 paneles.** `n8n/save-quote.json:36`. Para un techo grande comercial son ~200 paneles serializados con coords; el JSONB queda en ~50-80 KB por quote. Saca cuentas con 1000 quotes/mes = 80 MB JSONB. No es bloqueante pero documentar la decisión y considerar mover a una tabla `quote_panels` separada cuando crezca.

- **`ai-recommend` whitelist de fields existe en frontend pero hay que verificarla en backend.** `src/services/aiAssistant.js:32-39` filtra a `APPLYABLE_FIELDS`. El frontend NO debe ser la única defensa — el workflow `n8n/ai-recommend.json` (no auditado en detalle aquí) debe tener la misma whitelist server-side, sino una IA jailbreak puede inyectar `actions` con campos arbitrarios y un atacante MITM puede fabricar la respuesta. Confirmar antes de deploy.

---

## Robustez UI / UX

- **Race en hidratación de localStorage.** `src/App.jsx:73-115`. El primer render usa los DEFAULT_*; el `useEffect` los reemplaza después con lo guardado. Si el usuario interactúa antes (típico con bundle cacheado), su acción se aplica sobre defaults y al hidratar se pierde. **Fix:** flag `hydrated` que bloquea inputs hasta que el effect termine, o (mejor) leer localStorage en el initializer de `useState` con `() => …`.

- **`fetchLoadsCatalog` puede sobrescribir trabajo del admin.** `src/App.jsx:113-116`. Si la respuesta n8n llega después de que el admin empezó a editar el catálogo de cargas, sobrescribe sus cambios. **Fix:** flag `loadsTouched` o cancelar la fetch si el admin entró al tab de cargas.

- **`loadRemoteQuotes` no se re-dispara en re-login.** `src/App.jsx:142`. `useEffect(() => { if (adminAuth) loadRemoteQuotes(); }, [adminAuth, loadRemoteQuotes])`. `loadRemoteQuotes` es estable (useCallback con `[]`). Si el admin hace logout (`adminAuth → false`) y vuelve a entrar (`→ true`), el effect sí corre — verificado. OK.

- **`InstallerReg.submit` y `SupplierPortal.submit` fallan silenciosamente.** `InstallerReg.jsx:13` y `SupplierPortal.jsx:35` hacen `if (!f.x || !f.y) return;` sin tocar el state. El botón solo cambia opacity al 0.4 — un usuario impaciente lo presiona y nada pasa, sin mensaje. **Fix:** mostrar lista de campos faltantes en rojo bajo el botón.

- **Validación de email/teléfono solo en backend.** El frontend acepta cualquier string no vacío en `Quoter`, `InstallerReg`, `SupplierPortal`. La validación regex está en `validate-contact.json` (que sí está bien). Pero el cliente nunca llama validate-contact desde InstallerReg / SupplierPortal — solo desde Quoter. **Fix:** validar formato en frontend con un helper compartido, y disparar validate-contact desde InstallerReg/SupplierPortal antes del submit.

- **Inputs numéricos sin `min`/`max`.** `InstallerReg.jsx:91` (maxKwp), Quoter (consumo, sin auditar). HTML `min="0"` es trivial.

---

## PWA / Deploy

- **Splash lee la key de tema equivocada.** `public/index.html:114` hace `localStorage.getItem('al:sh:theme')` y `JSON.parse(stored).value`. Pero `App.jsx:128-131` escribe con `storage.set('sh:theme', theme)`, donde `storage.set` (constants.js:954) hace `localStorage.setItem(key, value)` directo (no JSON, sin prefijo). Resultado: dos bugs encadenados — la key está en `sh:theme` (no `al:sh:theme`) y el valor es el string raw `"dark"` (no `{"value":"dark"}`). El splash siempre cae al default y los usuarios light-mode ven flash oscuro al cargar. **Fix:** usar `localStorage.getItem('sh:theme')` directamente sin JSON.parse, con fallback a `prefers-color-scheme`.

- **`sw.js:90` referencia `clients` sin `self.clients`.** En workers `clients` está en el global scope, así que técnicamente funciona en Chromium/Firefox. Pero el linter típico marcaría error. Cambiar a `self.clients.openWindow(...)` por consistencia con el resto del archivo.

- **Cache-first para assets sin hash en `/public/`.** `sw.js:51-65`. Archivos como `/manifest.json`, `/logo.svg`, `/fluxai-logo.svg` no tienen hash en el nombre, y son cache-first. Si cambia el contenido (ej. nuevo logo) sin bump de `CACHE_NAME`, los usuarios con SW activo no lo ven hasta que se invalide. Hoy se mitiga con el SW_VERSION kill-switch en `index.html:202`, pero eso depende de bumpear esa constante en cada release. **Fix:** marcar manifest/logos como network-first o agregar query string `?v=` en `index.html`.

- **`server.js` sin rate-limit.** Usar `express-rate-limit` con bucket por IP en `/api/*`. 60 req/min es un buen punto de partida.

- **`server.js` carga dinámicamente `api/*.js` aunque CLAUDE.md diga DEPRECATED.** `server.js:30-49`. Si el directorio sigue existiendo con archivos, son rutas vivas. Confirmar contenido de `api/` y eliminarlo si está realmente fuera de uso.

- **`package.json` sin `engines.node`.** Sin restricción, Railway/Vercel pueden cambiar la versión de Node entre deploys y romper. Agregar `"engines": { "node": ">=18.17 <21" }` (CRA 5 + jspdf 4 corren bien en 18-20).

---

## Menores

- **`solar.js:37` — `bestCfg` siempre es igual a `maxCfg`.** El reduce busca `max(yearlyEnergyDcKwh)`, pero `configs` está ordenado por panelsCount creciente y `yearlyEnergyDcKwh` sube monótonamente con #paneles. El comentario "el último config es el que maximiza panelsCount, no el de mejor yield" es engañoso — sí es el de mejor yield total. Eliminar el reduce o usar yield-por-panel si esa era la intención.

- **`nasaPower.js:64` — `cellTempCold = minMinT + 3` es arbitrario.** Para diseño NEC 690.7 se usa la temperatura mínima histórica del sitio, no la promedio mensual mínima + 3°C. Documentar el origen del +3°C o reemplazar por `minMinT` directo y dejar margen en el cálculo de `vocCold` con `coldTempC = minMinT - 5` para no subdimensionar el inversor.

- **Constants.js tarifas hardcodeadas.** `OPERATORS` (línea 98) trae `tariff` y `psh` literal. La realidad CREG cambia mensualmente (componente CU). Hay un `tarifas-sync.json` workflow no auditado en este review — confirmar que se ejecuta en cron y que sobrescribe estos defaults antes de mostrarlos al cliente.

- **Logo duplicado** en `src/logo.png`/`src/logo.svg` y `public/logo.png`/`public/logo.svg` (mismo SHA en ambos). Bundle pesa de más; mantener solo `public/`.

- **Sin tests.** `package.json:13` declara `test` pero el repo no tiene archivos `*.test.*`. Mínimo: tests de los helpers numéricos en `constants.js` (`calcSystem`, `calcBudget`, `calcAGPEBenefit`) — son la lógica con mayor impacto monetario directo.

---

## Orden sugerido

1. **Auth de admin server-side.** Sin esto, los datos personales están expuestos por una contraseña en claro en el bundle.
2. **Doble IVA del transporte + `kgTotal`.** Bugs de cálculo que afectan cada cotización generada.
3. **Cabeceras de seguridad** (`helmet` + `vercel.json` headers).
4. **Idempotencia en `save-quote`** (índice único o dedupe_key).
5. **`Bogotá D.C.` en DEPTS** (1 línea).
6. **Splash theme key mismatch** (1 línea).
7. **Validar `solar_cache.expires_at` default** en `n8n/schema.sql`.
8. **Resto:** rate-limit, validaciones de formato, tombstones de catálogo, tests.

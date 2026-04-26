# Despliegue ALEBAS SolarHub — plan paso a paso

Estado del proyecto Railway `spectacular-integrity` al momento de escribir este doc:

- ✅ Servicio **Postgres** online (con `postgres-volume`)
- ✅ Servicio **n8n** online en `api.solar-hub.co` (con `n8n-volume`)
- ⏳ Falta: vincular DB → n8n → credencial → schema → workflows → frontend

Sigue los pasos en orden. Cada `[ ]` es un checkpoint.

---

## Paso 1 — Vincular Postgres con n8n (Railway)

- [ ] 1.1 Railway → proyecto `spectacular-integrity` → click en card **n8n**
- [ ] 1.2 Tab **Variables** → botón **+ New Variable**
- [ ] 1.3 En el campo Value, click en el ícono 🔗 (Reference Variable)
- [ ] 1.4 Source: **Postgres** · Variable: **DATABASE_URL**
- [ ] 1.5 Key (arriba): `DATABASE_URL` → **Add**
- [ ] 1.6 Confirma que existen también estas variables en n8n (agrégalas si faltan):
  ```
  GOOGLE_API_KEY      = <key de Google Cloud, con Geocoding + Solar API habilitadas>
  ANTHROPIC_API_KEY   = sk-ant-...
  N8N_HOST            = api.solar-hub.co
  WEBHOOK_URL         = https://api.solar-hub.co/
  GENERIC_TIMEZONE    = America/Bogota
  ```
- [ ] 1.7 Espera a que el servicio n8n termine el redeploy (badge verde **Online**)

---

## Paso 2 — Crear credencial Postgres dentro de n8n

- [ ] 2.1 Abre `https://api.solar-hub.co` → login en n8n
- [ ] 2.2 Menú lateral → **Credentials** → **+ Add Credential** → busca **Postgres**
- [ ] 2.3 Completa con los valores de Railway → Postgres → tab Variables:

  | Campo n8n | Valor Railway |
  |---|---|
  | Host | `PGHOST` |
  | Database | `PGDATABASE` |
  | User | `PGUSER` |
  | Password | `PGPASSWORD` |
  | Port | `PGPORT` |
  | SSL | `require` |

- [ ] 2.4 **Renombra la credencial** a exactamente `ALEBAS Postgres` (los JSONs la buscan por ese nombre)
- [ ] 2.5 Click **Save** → verifica que el botón **Test** dé verde

---

## Paso 3 — Crear tablas (correr `schema.sql` una sola vez)

- [ ] 3.1 n8n → **Workflows** → **+ New workflow** (canvas vacío)
- [ ] 3.2 Click en el canvas → agrega nodo **Postgres**
- [ ] 3.3 Configura:
  - Credential: `ALEBAS Postgres`
  - Operation: `Execute Query`
  - Query: pega el contenido completo de [`n8n/schema.sql`](./n8n/schema.sql)
- [ ] 3.4 Click **Execute Node** (play ▶ arriba del nodo)
- [ ] 3.5 Output debe mostrar `[]` / `success: true` — sin errores
- [ ] 3.6 Verificación: agrega otro nodo Postgres con query:
  ```sql
  SELECT table_name FROM information_schema.tables WHERE table_schema='public';
  ```
  Debe listar `users` y `quotes`.
- [ ] 3.7 Puedes descartar el workflow (no guardes) o nombrarlo `DB init` para reutilizar

---

## Paso 4 — Importar los 5 workflows

Para cada archivo de la carpeta `n8n/` repite:
1. n8n → **Workflows** → botón **⋮** arriba → **Import from File** → selecciona el JSON
2. Los nodos Postgres muestran ⚠ "credential not found" → click en cada uno → campo **Credential** → elige `ALEBAS Postgres`
3. Botón **Save** (esquina superior)
4. Toggle **Active** arriba a la derecha → pasa a verde

Checkpoints:

- [ ] 4.1 `n8n/solar-roof.json` → `POST /webhook/solar-roof` · **Active**
- [ ] 4.2 `n8n/ai-recommend.json` → `POST /webhook/ai-recommend` · **Active**
- [ ] 4.3 `n8n/validate-contact.json` → `POST /webhook/validate-contact` · **Active**
- [ ] 4.4 `n8n/save-quote.json` → `POST /webhook/save-quote` · **Active**
- [ ] 4.5 `n8n/list-quotes.json` → `POST /webhook/list-quotes` · **Active**

> Los únicos que tocan Postgres son **validate-contact**, **save-quote** y **list-quotes**. Si las credenciales de Postgres fallan, los otros dos (solar-roof, ai-recommend) siguen funcionando.

---

## Paso 5 — Probar con curl

```bash
BASE=https://api.solar-hub.co/webhook

# 5.1 validate-contact (ok)
curl -sS -X POST $BASE/validate-contact \
  -H 'content-type: application/json' \
  -d '{"email":"test1@alebas.co","phone":"3163085286","name":"Test"}' | jq

# 5.2 save-quote (deja registro en Postgres)
curl -sS -X POST $BASE/save-quote \
  -H 'content-type: application/json' \
  -d '{"email":"test1@alebas.co","phone":"3163085286","name":"Test","systemType":"on-grid","monthlyKwh":450,"operator":"EMSA","city":"Meta","results":{"actKwp":4.36,"numPanels":8,"mp":550,"cov":100},"budget":{"tot":19524287,"sav":2800000,"roi":7.2}}' | jq

# 5.3 list-quotes
curl -sS -X POST $BASE/list-quotes \
  -H 'content-type: application/json' \
  -d '{"limit":10}' | jq

# 5.4 rate-limit (>=5 en 7 días → bloquea a partir de la 6ª)
for i in 1 2 3 4 5 6; do
  curl -sS -X POST $BASE/validate-contact \
    -H 'content-type: application/json' \
    -d '{"email":"spam@test.com","phone":"3000000000","name":"Spam"}'
  echo
done

# 5.5 smoke test solar-roof (Google Solar API + fallback Claude)
curl -sS -X POST $BASE/solar-roof \
  -H 'content-type: application/json' \
  -d '{"address":"Cra 30 # 15-50, Villavicencio, Meta"}' | jq
```

Checkpoints esperados:

- [ ] 5.1 Respuesta `{ ok: true, userId: N, isReturning: false, priorQuotes: 0 }`
- [ ] 5.2 Respuesta `{ ok: true, quoteId: N, userId: N, ... }`
- [ ] 5.3 Array `quotes` con la que acabas de insertar
- [ ] 5.4 A partir de la 6ª iteración: `{ ok: false, reason: "rate_limit" }`
- [ ] 5.5 Respuesta con `areaM2`, `source: "google"` (o `"claude"` si Solar API no cubre la zona)

---

## Paso 6 — Desplegar el frontend en Railway

- [ ] 6.1 Railway → proyecto `spectacular-integrity` → **+ New** → **Deploy from GitHub repo**
- [ ] 6.2 Selecciona `IngAlebas/alebas-cotizador` · branch `main` (o la que publiques)
- [ ] 6.3 Settings del nuevo servicio:
  - Build Command: `npm run build`
  - Start Command: `npx serve -s build -l $PORT`
- [ ] 6.4 Variables:
  ```
  REACT_APP_N8N_BASE_URL = https://api.solar-hub.co/webhook
  REACT_APP_N8N_TOKEN    = <opcional, si usas x-alebas-token>
  ```
- [ ] 6.5 Settings → **Domains** → **+ Custom Domain** → `cotizador.alebas.co`
- [ ] 6.6 DNS (tu proveedor) → CNAME `cotizador` → el host que te dé Railway
- [ ] 6.7 Espera SSL (~1-5 min) → abre `https://cotizador.alebas.co` y valida

---

## Paso 7 — Smoke test end-to-end

- [ ] 7.1 Abre `https://cotizador.alebas.co`
- [ ] 7.2 Recorre el wizard: Tipo → Contacto → Consumo → Transporte → Resultado
- [ ] 7.3 En la tab **Normativo** click **Solicitar propuesta detallada →**
- [ ] 7.4 Verifica que la cotización aparece en Postgres:
  ```bash
  curl -sS -X POST $BASE/list-quotes \
    -H 'content-type: application/json' -d '{"limit":5}' | jq '.quotes[0]'
  ```
- [ ] 7.5 Re-intenta el wizard con el mismo email: debe reconocer `isReturning: true`

---

## Paso 8 — Seguridad antes de abrir al público

- [ ] 8.1 **Rotar `GOOGLE_API_KEY`** (fue pegada en chat) → Google Cloud Console → APIs & Services → Credentials → Regenerate
- [ ] 8.2 Restringir la nueva key:
  - Application restrictions: HTTP referrers → `https://cotizador.alebas.co/*`, `https://api.solar-hub.co/*`
  - API restrictions: sólo **Geocoding API** + **Solar API**
- [ ] 8.3 (Opcional) Basic auth en n8n panel admin:
  ```
  N8N_BASIC_AUTH_ACTIVE   = true
  N8N_BASIC_AUTH_USER     = admin
  N8N_BASIC_AUTH_PASSWORD = <password fuerte>
  ```
- [ ] 8.4 (Opcional) Token compartido webhook:
  - n8n: `ALEBAS_WEBHOOK_TOKEN = <string aleatorio>`
  - Frontend: `REACT_APP_N8N_TOKEN = <mismo string>`
  - Agregar nodo IF al inicio de cada workflow: `{{ $request.headers['x-alebas-token'] }} === {{ $env.ALEBAS_WEBHOOK_TOKEN }}`

---

## Paso 9 — Conectar el back office a Postgres (pendiente de código)

El `BackOffice.jsx` actual aún lee de `localStorage`. Cuando todo lo anterior esté OK:

- [ ] 9.1 Migrar `QuotesMgr` para consumir `listQuotesRemote()` (ya existe en `src/services/quotes.js`)
- [ ] 9.2 Permitir cambiar `status` en vivo (nuevo workflow n8n `update-quote-status`)
- [ ] 9.3 Agregar filtro por `status` y búsqueda por email/nombre

Esto es un commit posterior — no bloquea el deploy del cotizador público.

---

## Paso 10 — Migrar el resto de APIs externas a workflows n8n ⚠️ **CRÍTICO**

Los servicios del frontend hoy hacen `fetch('/api/...')` apuntando a **funciones edge de Vercel** que no existen en Railway. Si desplegamos en Railway sin migrarlos, **el cotizador se romperá** (no habrá PVGIS, PVWatts, NASA, XM, TRM, CEC ni baterías). Cada servicio necesita su workflow n8n + actualización del cliente para usar `n8nPost()` en vez de `fetch('/api/*')`.

### Inventario

| # | Servicio frontend | Endpoint actual | API externa real | Workflow n8n a crear | Caché local |
|---|---|---|---|---|---|
| 10.1 | `src/services/pvgis.js` | `GET /api/pvgis?lat&lon&kwp&tilt&az` | `re.jrc.ec.europa.eu/api/v5_2/PVcalc` | `n8n/pvgis.json` → `POST /webhook/pvgis` | 30 días |
| 10.2 | `src/services/pvwatts.js` | `GET /api/pvwatts?...` | NREL PVWatts v8 (requiere API key) | `n8n/pvwatts.json` → `POST /webhook/pvwatts` | 24 h |
| 10.3 | `src/services/nasaPower.js` | `GET /api/nasa-power?lat&lon` | NASA POWER API | `n8n/nasa-power.json` → `POST /webhook/nasa-power` | 7 días |
| 10.4 | `src/services/xm.js` | `GET /api/xm?endpoint=agents|spot&days=N` | XM Sinergox (`servapibi.xm.com.co`) | `n8n/xm-agents.json` + `n8n/xm-spot.json` | 7d / 24h |
| 10.5 | `src/services/trm.js` | `GET /api/trm` | `https://www.datos.gov.co/resource/...` | `n8n/trm.json` → `POST /webhook/trm` | 4 h |
| 10.6 | `src/services/cec.js` | `GET /api/cec?type=panel|inverter&q=X` | Dataset NREL SAM/CEC local (JSON bundled en función edge) | `n8n/cec.json` → `POST /webhook/cec` | 24 h |
| 10.7 | `src/services/batteries.js` | `GET /api/batteries?q&arch` | Dataset curado JSON | `n8n/batteries.json` → `POST /webhook/batteries` | 7 días |

### Plan por workflow

**10.1 — PVGIS** (`/webhook/pvgis`)
- [ ] Input: `{ lat, lon, kwp, tilt?, azimuth? }`
- [ ] Nodo HTTP Request GET `https://re.jrc.ec.europa.eu/api/v5_2/PVcalc`
  - qs: `lat, lon, peakpower=kwp, loss=14, angle=tilt||10, aspect=azimuth||0, outputformat=json, pvtechchoice=crystSi`
- [ ] Normalizar a `{ annualKwh, monthly: [{month, kwh}], source: 'PVGIS' }`
- [ ] Actualizar `src/services/pvgis.js` para llamar `n8nPost('pvgis', {...})`

**10.2 — PVWatts** (`/webhook/pvwatts`)
- [ ] Requiere `NREL_API_KEY` en Railway → n8n vars (gratis en https://developer.nrel.gov/signup/)
- [ ] Input: `{ lat, lon, kwp, tilt?, azimuth?, losses? }`
- [ ] Nodo HTTP GET `https://developer.nrel.gov/api/pvwatts/v8.json?api_key={{$env.NREL_API_KEY}}&...`
- [ ] Normalizar a `{ solradAnnual, acAnnualKwh, monthly, productionSource: 'PVWatts' }`
- [ ] Actualizar `src/services/pvwatts.js`

**10.3 — NASA POWER** (`/webhook/nasa-power`)
- [ ] Input: `{ lat, lon }`
- [ ] Nodo HTTP GET `https://power.larc.nasa.gov/api/temporal/climatology/point`
  - qs: `parameters=ALLSKY_SFC_SW_DWN,T2M,T2M_MAX,T2M_MIN, community=RE, latitude, longitude, format=JSON`
- [ ] Normalizar a `{ monthlyPSH: [...], monthlyTemp: [...], monthlyTempMax: [...], source: 'NASA POWER' }`
- [ ] Actualizar `src/services/nasaPower.js`

**10.4 — XM** (dividir en 2 workflows)
- [ ] `xm-agents` → `POST /webhook/xm-agents` · GET `https://servapibi.xm.com.co/hourly/ListadoAgentes` → devuelve lista de operadores; incluir `activityFilterWorked` flag
- [ ] `xm-spot` → `POST /webhook/xm-spot` · input `{ days: 30 }` → GET `https://servapibi.xm.com.co/hourly/PrecioBolsaNal?startdate=...&enddate=...` → promediar últimos N días → `{ cop_per_kwh, periodDays, cached: false }`
- [ ] Actualizar `src/services/xm.js`: reemplazar `fetchAgentsList()` y `fetchSpotPrice(N)` por llamadas a n8n

**10.5 — TRM** (`/webhook/trm`)
- [ ] Input: `{}`
- [ ] Nodo HTTP GET `https://www.datos.gov.co/resource/mcec-87by.json?$order=vigenciadesde%20DESC&$limit=1`
- [ ] Normalizar a `{ cop_per_usd, date, source: 'datos.gov.co' }`
- [ ] Actualizar `src/services/trm.js`

**10.6 — CEC** (`/webhook/cec`)
- [ ] El dataset NREL SAM (~22k paneles + ~6k inversores) hoy vive como JSON en la función edge
- [ ] Opción A — cargar el dataset como archivo estático desde una URL pública (S3 / GitHub raw) y filtrar en el nodo Code (mismo algoritmo de `/api/cec`)
- [ ] Opción B — importar dataset a Postgres (tablas `cec_panels`, `cec_inverters`) y consultar por SQL — más rápido, mejor para búsquedas fuzzy
- [ ] Recomendado: **Opción B** · migración incluye nuevo SQL + script de carga inicial
- [ ] Actualizar `src/services/cec.js`

**10.7 — Batteries** (`/webhook/batteries`)
- [ ] Dataset más pequeño (~50-100 modelos curados). Mismo patrón que CEC.
- [ ] Recomendado: tabla `batteries` en Postgres, workflow filtra por `q` y `arch`
- [ ] Actualizar `src/services/batteries.js`

### Variables extra a configurar en n8n (Railway)

```
NREL_API_KEY   = <gratis en developer.nrel.gov/signup>
DATOS_GOV_TOKEN = <opcional, sin token hay rate limit>
```

### Orden sugerido de implementación

1. **Primero**: 10.1 (PVGIS), 10.3 (NASA), 10.5 (TRM) — APIs públicas sin key, implementación directa (~1 h)
2. **Segundo**: 10.2 (PVWatts) — pedir API key NREL, luego implementar (~30 min)
3. **Tercero**: 10.4 (XM agents + spot) — XM tiene schema variable, más testing (~1 h)
4. **Cuarto**: 10.6 (CEC) + 10.7 (Batteries) — requieren migrar datasets a Postgres (~2-3 h)
5. **Quinto**: refactor de cada `src/services/*.js` para usar `n8nPost()` en vez de `fetch('/api/*')`
6. **Último**: eliminar carpeta `api/` del repo (funciones Vercel obsoletas)

### Alternativa temporal (si urge desplegar antes)

Mantener Vercel para las funciones `/api/*` y Railway sólo para n8n + frontend:
- Frontend en Railway apunta a `api.solar-hub.co/webhook` para los workflows nuevos
- Frontend sigue llamando `/api/*` que Vercel resolverá si el dominio apunta allá

**No recomendado** — añade complejidad (dos proveedores, dos dominios). Mejor migrar todo a n8n de una vez.

---

## Troubleshooting rápido

| Síntoma | Causa común |
|---|---|
| `n8n ... : HTTP 404` | Workflow no activado (toggle Active) |
| `credential not found` al ejecutar workflow | Renombrar credencial a **exactamente** `ALEBAS Postgres` |
| `relation "users" does not exist` | Faltó correr `schema.sql` (paso 3) |
| `connection refused` de Postgres | `DATABASE_URL` no está como Reference Variable |
| CORS bloqueado desde el frontend | Verifica `N8N_CORS_ORIGIN` — n8n por defecto permite `*` |
| SSL no emite en `cotizador.alebas.co` | CNAME mal apuntado — confirma con `dig cotizador.alebas.co` |
| `save-quote` devuelve error `null value in column "user_id"` | `Upsert user` no devolvió id → revisar query `RETURNING id` del nodo |

---

## Dónde quedó cada pieza

| Componente | Ruta | Estado |
|---|---|---|
| Wizard con Contacto en paso 2 | `src/components/Quoter.jsx` | ✅ commit `1fe94fb` |
| Panel footprint + shade index | `src/constants.js`, `src/components/Quoter.jsx` | ✅ commit `059e5d7` |
| Servicio n8n solar-roof con shadeIndex | `n8n/solar-roof.json`, `src/services/solar.js` | ✅ commit `059e5d7` |
| Postgres schema + workflows | `n8n/schema.sql`, `n8n/{validate-contact,save-quote,list-quotes}.json` | ✅ commit `fd780e5` |
| Servicio frontend para quotes remoto | `src/services/quotes.js` | ✅ commit `fd780e5` |
| `validateContact()` + `submit()` cablea Postgres | `src/components/Quoter.jsx` | ✅ commit `fd780e5` |
| Back office leyendo de Postgres | `src/components/BackOffice.jsx` | ⏳ pendiente (paso 9) |
| n8n desplegado en `api.solar-hub.co` | Railway | ✅ |
| Postgres plugin en Railway | Railway | ✅ |
| `DATABASE_URL` referenciado en n8n | Railway | ⏳ paso 1 |
| Credencial `ALEBAS Postgres` en n8n | n8n UI | ⏳ paso 2 |
| Tablas creadas | Postgres | ⏳ paso 3 |
| Workflows importados y activos | n8n UI | ⏳ paso 4 |
| Frontend en `cotizador.alebas.co` | Railway | ⏳ paso 6 |
| Google API key rotada + restringida | Google Cloud | ⏳ paso 8 |

---

**Branch actual de trabajo:** `claude/remove-logo-backgrounds-WlLGf`
**Último commit pusheado:** `fd780e5` Persist leads to Postgres via n8n (validate + save + list)

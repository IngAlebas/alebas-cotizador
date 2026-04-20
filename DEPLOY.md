# Despliegue ALEBAS SolarHub — plan paso a paso

Estado del proyecto Railway `spectacular-integrity` al momento de escribir este doc:

- ✅ Servicio **Postgres** online (con `postgres-volume`)
- ✅ Servicio **n8n** online en `app.alebas.co` (con `n8n-volume`)
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
  N8N_HOST            = app.alebas.co
  WEBHOOK_URL         = https://app.alebas.co/
  GENERIC_TIMEZONE    = America/Bogota
  ```
- [ ] 1.7 Espera a que el servicio n8n termine el redeploy (badge verde **Online**)

---

## Paso 2 — Crear credencial Postgres dentro de n8n

- [ ] 2.1 Abre `https://app.alebas.co` → login en n8n
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
BASE=https://app.alebas.co/webhook

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
  REACT_APP_N8N_BASE_URL = https://app.alebas.co/webhook
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
  - Application restrictions: HTTP referrers → `https://cotizador.alebas.co/*`, `https://app.alebas.co/*`
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
| n8n desplegado en `app.alebas.co` | Railway | ✅ |
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

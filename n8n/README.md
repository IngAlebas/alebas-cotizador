# n8n workflows — ALEBAS Cotizador

Webhooks que el frontend (`src/services/`) consume vía `REACT_APP_N8N_BASE_URL`.

## Import

En la UI de n8n: **Workflows → Import from File** y carga cada JSON.

- `solar-roof.json` → `POST /webhook/solar-roof`
- `solar-cache.json` → `POST /webhook/solar-roof-cached` *(Fase 6 — wrapper con cache 90 días)*
- `ai-recommend.json` → `POST /webhook/ai-recommend`
- `validate-contact.json` → `POST /webhook/validate-contact`
- `save-quote.json` → `POST /webhook/save-quote`
- `list-quotes.json` → `POST /webhook/list-quotes`

Activa cada workflow (toggle **Active** arriba a la derecha).

## Postgres (registro de usuarios y cotizaciones)

1. En Railway añade el plugin **Postgres** al mismo proyecto de n8n. Expone `DATABASE_URL` al servicio n8n.
2. En n8n crea credencial **Postgres** con id `ALEBAS_POSTGRES` (name `ALEBAS Postgres`) apuntando a `DATABASE_URL`.
3. Corre una sola vez el DDL de `schema.sql` (nodo manual Postgres → Execute Query) — crea tablas `users` y `quotes` con índices.

   **Fase 6 (re-importación):** el `schema.sql` añade columnas idempotentes a `quotes` (`solar_panels JSONB`, `panel_height_meters`, `panel_width_meters`, `area_m2`, `whole_roof_area_m2`, `imagery_quality`, `google_yearly_kwh`, `ai_provider`) y crea la tabla `solar_cache`. El DDL es idempotente (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`) — re-ejecutarlo es seguro sobre instalaciones previas.

Política de anti-abuso codificada en `validate-contact`:
- Honeypot (`website`) → rechazo silencioso.
- Email/teléfono con formato válido obligatorios.
- `users.blocked = true` → bloquea con mensaje.
- ≥ 5 cotizaciones en los últimos 7 días → rate-limit.

## Variables de entorno (Railway → servicio n8n)

```
GOOGLE_API_KEY=...        # Geocoding API + Solar API habilitadas
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=...          # inyectado por plugin Postgres de Railway
N8N_INTERNAL_BASE_URL=    # opcional, default http://localhost:5678
                          # solar-cache lo usa para llamar internamente a /webhook/solar-roof
```

Google Cloud Console → habilitar:
- Geocoding API
- Solar API (requiere allowlist; ver https://developers.google.com/maps/documentation/solar)

Restringe la key por HTTP referrer/IP en producción.

## Frontend `.env.local`

```
REACT_APP_N8N_BASE_URL=https://<tu-n8n>.up.railway.app/webhook
REACT_APP_N8N_TOKEN=           # opcional, si validas x-alebas-token en n8n
```

## Contratos

### `/webhook/solar-roof`
**Request:** `{ address?: string, lat?: number, lon?: number }` (al menos uno).

**Response:**
```json
{
  "lat": 4.14, "lon": -73.62, "address": "Villavicencio, Meta",
  "areaM2": 68, "maxPanels": 24,
  "tiltDeg": 10, "azimuthDeg": 180,
  "sunshineHoursYear": 1950,
  "source": "google" | "claude" | "none",
  "confidence": 0.85,
  "notes": ""
}
```

Flujo: Geocoding (si falta coords) → Google Solar API `buildingInsights:findClosest` → si devuelve sin `solarPotential`, fallback a Claude con prompt de estimación conservadora.

### `/webhook/solar-roof-cached` *(Fase 6)*
**Request:** idéntico a `solar-roof` (`{ address?, lat?, lon? }`).

**Response:** misma forma que `solar-roof` + metadata de cache:
```json
{
  "...": "(todos los campos de solar-roof)",
  "cacheHit": true,
  "cacheAgeSec": 86400,
  "cacheExpiresAt": "2026-07-30T...",
  "cacheHitCount": 3
}
```

Flujo:
1. Calcula `cache_key` por lat/lon redondeado a 5 decimales (≈ 1 m) o por dirección normalizada.
2. Si hay registro en `solar_cache` no expirado → devuelve inmediato (latencia <50 ms, cero costo Google).
3. Si miss → llama internamente a `/webhook/solar-roof`, guarda la respuesta (TTL 90 días) y la devuelve.

Respuestas con `ok:false` (geocode_no_results, missing_env) **no se cachean** — el siguiente intento las re-procesa por si el problema fue transitorio.

**Switching frontend:** cambia `n8nPost('solar-roof', ...)` → `n8nPost('solar-roof-cached', ...)` en `src/services/solar.js` para activarlo. Cae automáticamente al solar-roof original si el cache no encuentra el registro.

### `/webhook/ai-recommend`
**Request:** `{ context: "review" | "sizing" | "explain", payload: {...} }`

**Response:**
```json
{
  "summary": "...",
  "findings": ["..."],
  "warnings": ["..."],
  "suggestions": ["..."],
  "tokens": { "in": 0, "out": 0 }
}
```

Llama a Anthropic Messages API (`claude-sonnet-4-6`) con prompt de ingeniero solar FV Colombia (RETIE, CREG 038/2014, 174/2021, Ley 1715) y fuerza salida JSON.

### `/webhook/validate-contact`
**Request:** `{ email, phone, name, company?, website? }`

**Response (ok):** `{ ok: true, userId, isReturning, priorQuotes, contact: {...} }`

**Response (bloqueo):** `{ ok: false, reason: 'invalid_email'|'invalid_phone'|'missing_name'|'validation_failed'|'blocked'|'rate_limit', message? }`

Se llama en el paso 2 del wizard (Contacto), **antes** de orquestar APIs pesadas (PVGIS, PVWatts, NASA, XM, Google Solar, Claude).

### `/webhook/save-quote`
**Request:** payload completo de la cotización (incluye `results`, `budget`, `agpe`, `regulatory`, `lat/lon`, `shadeIndex`, etc.).

**Response:** `{ ok: true, quoteId, userId, createdAt, contact, totals, solar }`

Hace `UPSERT users` por email + `INSERT quotes` con todas las métricas planas y el payload completo en `payload JSONB` para auditoría.

**Fase 6:** persiste columnas adicionales si el frontend las envía: `solar_panels JSONB` (lista de paneles individuales con `center`, `orientation`, `segmentIndex`, `yearlyEnergyDcKwh`), `panel_height_meters`, `panel_width_meters`, `area_m2`, `whole_roof_area_m2`, `imagery_quality`, `google_yearly_kwh`, `ai_provider`. El bloque `solar` de la respuesta indica cuántos paneles se persistieron — útil para verificar que el frontend está enviando el dato correcto.

### `/webhook/list-quotes`
**Request:** `{ status?: string, search?: string, limit?: number }`

**Response:** `{ ok: true, count, quotes: [...] }` — join de `quotes` con `users`, orden `created_at DESC`.

Usado por el back office para leer cotizaciones en lugar de `localStorage`.

## Opcional — autenticación

Para validar que solo tu frontend pueda invocar los webhooks, añade un nodo **IF** al inicio de cada workflow:

```
{{ $request.headers['x-alebas-token'] }} === {{ $env.ALEBAS_WEBHOOK_TOKEN }}
```

Y define `REACT_APP_N8N_TOKEN` en el frontend con el mismo valor.

## Probar rápido

```bash
curl -X POST $BASE/solar-roof \
  -H 'content-type: application/json' \
  -d '{"address":"Calle 10 # 5-20, Villavicencio"}'

curl -X POST $BASE/ai-recommend \
  -H 'content-type: application/json' \
  -d '{"context":"review","payload":{"kwp":5.4,"monthlyKwh":450,"systemType":"hybrid"}}'

curl -X POST $BASE/validate-contact \
  -H 'content-type: application/json' \
  -d '{"email":"test@alebas.co","phone":"3163085286","name":"Test"}'

curl -X POST $BASE/list-quotes \
  -H 'content-type: application/json' \
  -d '{"limit":10}'

# Fase 6 — verificar cache (1ª llamada miss + insert, 2ª hit)
curl -X POST $BASE/solar-roof-cached \
  -H 'content-type: application/json' \
  -d '{"address":"Cra 36 # 24A-44, Villavicencio, Meta, Colombia"}'
# Respuesta esperada: ... "cacheHit": false, "cacheStored": true
curl -X POST $BASE/solar-roof-cached \
  -H 'content-type: application/json' \
  -d '{"address":"Cra 36 # 24A-44, Villavicencio, Meta, Colombia"}'
# Respuesta esperada: ... "cacheHit": true, "cacheAgeSec": <seg>, "cacheHitCount": 1
```

# n8n workflows — ALEBAS Cotizador

Dos webhooks que el frontend (`src/services/`) consume vía `REACT_APP_N8N_BASE_URL`.

## Import

En la UI de n8n: **Workflows → Import from File** y carga cada JSON.

- `solar-roof.json` → `POST /webhook/solar-roof`
- `ai-recommend.json` → `POST /webhook/ai-recommend`

Activa cada workflow (toggle **Active** arriba a la derecha).

## Variables de entorno (Railway → servicio n8n)

```
GOOGLE_API_KEY=...        # Geocoding API + Solar API habilitadas
ANTHROPIC_API_KEY=sk-ant-...
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
```

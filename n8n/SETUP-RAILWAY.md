# Guía rápida — Desplegar n8n en Railway (sin código)

> ⚠️ **Histórica.** El stack actual usa `api.solar-hub.co` como host de n8n (no Railway).
> Esta guía se mantiene como referencia si alguna vez se levanta una instancia nueva en Railway.
> Para la operación día a día, ver `DEPLOY.md` y `CLAUDE.md`.

Esta guía te lleva desde cero hasta tener `REACT_APP_N8N_BASE_URL` apuntando a un n8n real, con los workflows del cotizador importados.

Tiempo estimado: **25-35 min**.

## 1. Crear proyecto Railway

1. Entra a https://railway.app → **New Project** → **Deploy from Template** → busca **n8n**.
2. Railway provisiona un servicio `n8n` y te da una URL pública (ej. `https://n8n-production-xxxx.up.railway.app`).
3. Espera a que el servicio quede en estado **ACTIVE** (1-2 min).
4. Abre la URL en el navegador → crea usuario admin (owner) en n8n.

## 2. Añadir Postgres (para guardar cotizaciones y usuarios)

1. Dentro del mismo proyecto Railway: **+ New** → **Database** → **Add PostgreSQL**.
2. Abre el servicio Postgres → pestaña **Variables** → copia el valor de `DATABASE_URL`.
3. Vuelve al servicio n8n → **Variables** → **+ New Variable**:
   - `DATABASE_URL` = (pega el valor del paso 2).
4. En n8n (la UI web): **Credentials** → **+ New** → **Postgres**.
   - Name: `ALEBAS Postgres`.
   - Connection: **Connection String** → pega `DATABASE_URL`.
   - **Save**. Anota el ID de la credencial (aparece en la URL al abrirla).

## 3. Ejecutar el schema SQL (crea tablas users + quotes)

1. En n8n: **Workflows → + New Workflow**.
2. Añade nodo **Postgres** → operación **Execute Query**.
3. Selecciona credencial `ALEBAS Postgres`.
4. Pega el contenido de `n8n/schema.sql` en Query.
5. **Execute Node**. Debe ejecutarse sin error.
6. Borra este workflow (ya no se necesita).

## 4. Importar los 15 workflows

En n8n → **Workflows → Import from File**. Importa uno a uno:

| Archivo | Webhook |
|---|---|
| `solar-roof.json` | POST /webhook/solar-roof |
| `ai-recommend.json` | POST /webhook/ai-recommend |
| `validate-contact.json` | POST /webhook/validate-contact |
| `save-quote.json` | POST /webhook/save-quote |
| `list-quotes.json` | POST /webhook/list-quotes |
| `xm-agents.json` | POST /webhook/xm-agents |
| `xm-spot.json` | POST /webhook/xm-spot |
| `pvgis.json` | POST /webhook/pvgis |
| `pvwatts.json` | POST /webhook/pvwatts |
| `nasa-power.json` | POST /webhook/nasa-power |
| `trm.json` | POST /webhook/trm |
| `batteries.json` | POST /webhook/batteries |
| `cec.json` | POST /webhook/cec |
| `tarifas-sync.json` | POST /webhook/tarifas-sync |

Tras cada import: **toggle Active** (switch arriba a la derecha) y **Save**.

## 5. Variables de entorno en el servicio n8n (Railway)

En Railway → servicio n8n → **Variables** → añade las que uses:

```
GOOGLE_API_KEY=               # Geocoding + Solar API (ver paso 6)
ANTHROPIC_API_KEY=sk-ant-...  # Claude (ai-recommend + solar-roof fallback)
NREL_API_KEY=DEMO_KEY         # PVWatts (DEMO_KEY: 1000 req/día)

# IA cascade (gratuitos — opcional, el workflow usa el primero disponible)
GROQ_API_KEY=                 # https://console.groq.com  (14,400 req/día)
GOOGLE_AI_KEY=                # https://aistudio.google.com  (1,500 req/día)
MISTRAL_API_KEY=              # https://console.mistral.ai

# Token compartido con el frontend (opcional pero recomendado)
ALEBAS_WEBHOOK_TOKEN=<genera uno largo y aleatorio>
```

Railway reinicia el servicio automáticamente.

## 6. Habilitar Google APIs (solo si usas solar-roof)

https://console.cloud.google.com → Create Project → APIs & Services → Library:
- **Geocoding API** → Enable.
- **Solar API** → Enable (requiere allowlist; solicitar acceso en https://developers.google.com/maps/documentation/solar).

Credentials → **+ Create Credentials → API Key**. Copia la key en `GOOGLE_API_KEY` de Railway.

En producción, restringe la key por HTTP referrer: `https://alebas-cotizador.vercel.app/*` + `https://*.up.railway.app/*`.

## 7. Configurar CORS en n8n (crítico)

Por defecto n8n solo permite su propio dominio. Debes permitir tu dominio de Vercel.

Railway → servicio n8n → **Variables**:

```
N8N_CORS_ALLOW_ORIGIN=https://alebas-cotizador.vercel.app,https://*.vercel.app
```

Reinicia el servicio.

## 8. Conectar el frontend

Vercel → proyecto `alebas-cotizador` → **Settings → Environment Variables**:

```
REACT_APP_N8N_BASE_URL=https://n8n-production-xxxx.up.railway.app/webhook
REACT_APP_N8N_TOKEN=<mismo valor que ALEBAS_WEBHOOK_TOKEN>
```

- Scope: **Production** (y opcionalmente **Preview**).
- **Redeploy** el último commit (Deployments → … → Redeploy).

## 9. Verificar

En la app:
- BackOffice → **Sync XM** debe devolver OK (o un error distinto a `Failed to fetch`).
- Cotizar desde una dirección real → PVGIS/NASA responden → resultados con `✓ PVGIS` en lugar de `PSH regional`.

## Troubleshooting

| Error | Causa | Fix |
|---|---|---|
| `Failed to fetch` | DNS no resuelve / URL errónea | Verifica `REACT_APP_N8N_BASE_URL` en Vercel |
| `CORS blocked` | n8n no permite el origen | `N8N_CORS_ALLOW_ORIGIN` en Railway |
| `401 Unauthorized` | Token no coincide | `REACT_APP_N8N_TOKEN` == `ALEBAS_WEBHOOK_TOKEN` |
| `workflow not found` | Webhook no activo | Toggle **Active** + **Save** en n8n |
| `timeout 25s` | Credenciales externas mal configuradas | Revisa logs en Railway del servicio n8n |

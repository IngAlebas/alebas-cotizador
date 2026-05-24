# SOLARHUB — Handoff Claude Chat → Claude Code

> **Estado verificado:** 24 mayo 2026 (PRs #159, #161, #163 mergeados; branch `apply-ai-recommendations-qc5TD` pendiente de merge)
> **Repo:** `github.com/IngAlebas/alebas-cotizador` · rama `main`
> **Versión:** v1.0.0 (tag)
> **Deploy:** `solar-hub.co` via Vercel (auto-deploy en push a main)
> **PR abierto pendiente:** [#162](https://github.com/IngAlebas/alebas-cotizador/pull/162) — admin auth server-side (bloqueado por infra n8n).

---

## Documentos de referencia (todos en root)

| Doc | Cuándo leerlo |
|---|---|
| [`CLAUDE.md`](./CLAUDE.md) (este) | Onboarding rápido, estado general |
| [`AUDIT.md`](./AUDIT.md) | Auditoría estratégica del producto (compliance, marketplace, madurez) |
| [`REVIEW.md`](./REVIEW.md) | Bugs y deuda línea-a-línea contra `main@0cdaf18` |
| [`ROADMAP-FLUXAI.md`](./ROADMAP-FLUXAI.md) | Integración SolarHub ↔ FluxAI (5 capas con criterios de aceptación) |
| [`SECURITY-HEADERS.md`](./SECURITY-HEADERS.md) | Política CSP/HSTS/etc., rationale, deuda y rollback |
| [`DEPLOY.md`](./DEPLOY.md) | Setup Postgres + n8n en Railway |
| [`DEPLOY-ADMIN-AUTH.md`](./DEPLOY-ADMIN-AUTH.md) | (en branch `claude/admin-auth-server-side`, vendrá al merge de #162) Bootstrap del admin con bcrypt + JWT |

**Tracking issues:** [#160](https://github.com/IngAlebas/alebas-cotizador/issues/160) — checklist de las 5 capas FluxAI.

---

## ¿Qué es esto?

**SolarHub** es una PWA de cotización solar fotovoltaica para Colombia.
Marketplace de energía solar de ALEBAS Ingeniería SAS — conecta proveedores,
clientes, instaladores, ingenieros y financiadores.

---

## Stack verificado

```
Frontend  React 18 (CRA)  →  Vercel  →  solar-hub.co
Backend   n8n en Railway  →  api.solar-hub.co
DB        PostgreSQL       →  Railway (mismo proyecto que n8n)
```

---

## Estructura real del repo (~100 archivos en main)

```
alebas-cotizador/
├── CLAUDE.md              ← este archivo
├── DEPLOY.md              ← guía paso a paso para conectar n8n + Postgres
├── AUDIT.md               ← auditoría estratégica del producto
├── REVIEW.md              ← bugs y deuda línea-a-línea
├── ROADMAP-FLUXAI.md      ← integración FluxAI 5 capas
├── SECURITY-HEADERS.md    ← política CSP/HSTS/etc.
├── README.md
├── .env.example           ← variables necesarias (copiar a .env.local)
├── .gitignore / .vercelignore
├── package.json           ← React 18 + express + helmet
├── server.js              ← servidor Express (producción Railway) + helmet + CORS allowlist
├── railway.json           ← config Railway
├── Procfile               ← comando de arranque
├── vercel.json            ← build + SPA rewrite + CSP/HSTS headers
│
├── public/
│   ├── index.html         ← PWA meta tags (iOS/Android/SEO/OG)
│   ├── manifest.json      ← PWA: nombre, colores, shortcuts, iconos
│   ├── sw.js              ← Service Worker: cache offline + push notifications
│   ├── logo.png / logo.svg
│   └── icons/             ← 12 tamaños: 16,32,72,96,128,144,152,167,180,192,256,512
│
├── src/
│   ├── App.jsx            ← Shell: navbar + bottom-nav mobile + admin login + footer
│   ├── constants.js       ← Colores, operadores OR Colombia, equipos, tarifas; selectCompatibleInverter
│   ├── index.css          ← Design system (tokens CSS, Outfit font, responsive, keyframes IA)
│   ├── index.js           ← Entry point
│   ├── logo.png / logo.svg
│   ├── components/
│   │   ├── Quoter.jsx           ← Cotizador multi-paso (módulo principal) — v1.6 IA cascade
│   │   ├── BackOffice.jsx       ← Panel admin: sync Postgres, editor estados, timeline, email PDF
│   │   ├── InstallPrompt.jsx    ← Banner PWA install (iOS/Android)
│   │   ├── InstallerReg.jsx     ← Registro instaladores RETIE
│   │   ├── InteractiveRoofMap.jsx ← Mapa Google: cubiertas, paneles reales/sintéticos, heatmap, sun path
│   │   ├── MonthlyProductionChart.jsx ← Gráfico barras producción mensual Google Solar
│   │   ├── QuoteTracking.jsx    ← URL pública seguimiento cotización con token
│   │   ├── SunPathDiagram.jsx   ← Trayectoria del sol SVG
│   │   └── SupplierPortal.jsx   ← Portal proveedores
│   ├── services/          ← Todos llaman a n8n (REACT_APP_N8N_BASE_URL)
│   │   ├── aiAssistant.js ← AI cascade Groq → Gemini → Claude; APPLYABLE_FIELDS whitelist
│   │   ├── batteries.js   ← Catálogo baterías
│   │   ├── cec.js         ← CEC paneles/inversores → n8n → /webhook/cec
│   │   ├── gmapsLoader.js ← Carga dinámica Google Maps JS API (singleton)
│   │   ├── loads.js       ← Cargas eléctricas (electrodomésticos)
│   │   ├── n8n.js         ← Cliente base n8n (fetch + auth token + timeout)
│   │   ├── nasaPower.js   ← NASA POWER → n8n → /webhook/nasa-power
│   │   ├── pdfGenerator.js ← Genera PDF cotización (html2pdf / jsPDF)
│   │   ├── places.js      ← Google Places Autocomplete → n8n → /webhook/places-autocomplete
│   │   ├── pvgis.js       ← PVGIS → n8n → /webhook/pvgis
│   │   ├── pvwatts.js     ← PVWatts → n8n → /webhook/pvwatts
│   │   ├── quotes.js      ← Guardar/listar/actualizar cotizaciones → n8n
│   │   ├── solar.js       ← Google Solar API (usa solar-roof-cached con TTL 90d)
│   │   ├── solarLayers.js ← URLs firmadas GeoTIFF irradiancia → n8n → /webhook/solar-datalayers
│   │   ├── staticMapOverlays.js ← Overlay cubiertas validadas sobre mapa estático PDF
│   │   ├── trm.js         ← TRM Banco República → n8n → /webhook/trm
│   │   └── xm.js          ← XM Colombia bolsa energía → n8n
│   └── data/
│       └── normativa.js   ← RETIE, CREG 174/2021, CREG 135/2021, Ley 1715
│
├── api/                   ← ⚠️ DEPRECATED — reemplazado por n8n/
│   └── DEPRECATED.md      ← Mapa de equivalencias api/ → n8n workflows
│
└── n8n/                   ← Workflows JSON — importar en api.solar-hub.co
    ├── README.md          ← Instrucciones de import y activación
    ├── SETUP-RAILWAY.md   ← Guía vincular Postgres con n8n
    ├── schema.sql         ← Esquema de tablas (quotes, contacts, solar_cache, etc.)
    ├── ai-recommend.json  ← POST /webhook/ai-recommend (cascade Groq→Gemini→Claude, RD-1..RD-8)
    ├── batteries.json     ← catálogo baterías
    ├── cec.json           ← POST /webhook/cec
    ├── list-quotes.json   ← POST /webhook/list-quotes
    ├── nasa-power.json    ← POST /webhook/nasa-power
    ├── places-autocomplete.json ← POST /webhook/places-autocomplete (Google Places)
    ├── pvgis.json         ← POST /webhook/pvgis
    ├── pvwatts.json       ← POST /webhook/pvwatts
    ├── quote-public.json  ← GET /webhook/quote-public?token=… (seguimiento público)
    ├── save-quote.json    ← POST /webhook/save-quote v2 (+ solar_panels JSONB)
    ├── send-quote-email.json ← POST /webhook/send-quote-email (Gmail SMTP + PDF + tracking link)
    ├── solar-cache.json   ← POST /webhook/solar-roof-cached (wrapper Postgres TTL 90d)
    ├── solar-datalayers.json ← POST /webhook/solar-datalayers (URLs firmadas GeoTIFF irradiancia)
    ├── solar-geotiff-proxy.json ← POST /webhook/solar-geotiff-proxy (proxy GeoTIFF sin CORS)
    ├── solar-roof.json    ← POST /webhook/solar-roof
    ├── tarifas-sync.json  ← sync tarifas operadores
    ├── trm.json           ← POST /webhook/trm
    ├── update-quote.json  ← POST /webhook/update-quote (admin: estado, notas, historial)
    ├── validate-contact.json ← POST /webhook/validate-contact
    ├── xm-agents.json     ← XM agentes
    ├── xm-spot.json       ← XM spot price
    └── seed/
        ├── README.md
        └── load-cec.js    ← poblar DB con paneles CEC
```

---

## Variables de entorno

Copiar `.env.example` a `.env.local` y completar:

```env
REACT_APP_N8N_BASE_URL=https://api.solar-hub.co/webhook
REACT_APP_N8N_TOKEN=          # token compartido opcional
# Google Solar API → configurar en n8n, NO en frontend
```

En Vercel → Settings → Environment Variables agregar `REACT_APP_N8N_BASE_URL`.

### Variables de entorno en Railway (servicio n8n)

```env
# AI cascade (todos requeridos para activar el cascade completo)
GROQ_API_KEY=gsk_…            # llama-3.3-70b (gratuito, primer proveedor)
GOOGLE_AI_KEY=AIza…           # Gemini 2.0 Flash (gratuito, segundo proveedor)
ANTHROPIC_API_KEY=sk-ant-…    # Claude Haiku 4.5 (pago, fallback final)

# Runners — para que Code nodes accedan a las env vars anteriores:
N8N_RUNNERS_TASK_RUNNER_ALLOWED_ENV=GROQ_API_KEY,GOOGLE_AI_KEY,ANTHROPIC_API_KEY

# Email (para send-quote-email workflow)
GMAIL_USER=…@gmail.com
GMAIL_APP_PASSWORD=…          # contraseña de aplicación Gmail
```

---

## Brand & Design

### Paleta (en `src/constants.js → export const C`)
```js
C.yellow  = '#FF8C00'   // Solar Orange — primario (C.yellow por compatibilidad histórica)
C.orange  = '#FF8C00'   // alias
C.amber   = '#FFB800'   // secundario
C.gold    = '#FFD93D'   // acento
C.teal    = '#01708B'   // ALEBAS teal corporativo
C.dark    = '#07090F'
C.card    = '#0C1422'
C.text    = '#E8F0F7'
C.muted   = '#7A9EAA'
```

### Fuente
`Outfit` (Google Fonts) · 300/400/500/600/700/800/900

### Logo
SVG inline en `App.jsx` (sol + 6 rayos + 6 nodos).
PNG transparente en `src/logo.png` y `public/logo.png`.

---

## Admin Panel

> ⚠️ **En migración** — hoy todavía usa `'sh_' + btoa(...)` en `App.jsx:15` (legacy). PR [#162](https://github.com/IngAlebas/alebas-cotizador/pull/162) reemplaza esto por **bcrypt + JWT firmado server-side en n8n**. El PR está abierto y bloqueado por prep de infraestructura — ver [`DEPLOY-ADMIN-AUTH.md`](https://github.com/IngAlebas/alebas-cotizador/blob/claude/admin-auth-server-side/DEPLOY-ADMIN-AUTH.md) en el branch.

**Estado legacy (vigente hasta merge de #162):**
```js
const ADMIN_HASH = 'sh_' + btoa('hoJSDU2!kaiv337c');
```

Sesión en `localStorage` via `storage.set('sh:admin', '1')`.
La pwd está en el bundle público — riesgo Habeas Data hasta que se mergee #162.

**Pasos antes de mergear #162** (ver `DEPLOY-ADMIN-AUTH.md` para detalle):
1. Crear tablas `admin_users` + `admin_audit` en Postgres Railway.
2. Generar hash bcrypt con pwd nueva (NO la legacy) e insertar fila en `admin_users`.
3. En Railway → servicio n8n → env vars: `JWT_SECRET` (≥32 chars) y `NODE_FUNCTION_ALLOW_EXTERNAL=bcryptjs,jsonwebtoken`.
4. Importar `n8n/admin-login.json` y `n8n/admin-verify.json` en la UI de n8n.
5. Smoke test con curl al `/webhook/admin-login`.
6. **Recién entonces mergear** #162. Vercel redeploya y el panel pide la pwd nueva contra n8n.

---

## IA — Cascade de revisión

El asistente IA usa **cascada de proveedores** en orden: gratuitos primero, pago como último recurso.

```
Groq (llama-3.3-70b, free)  →  Gemini 2.0 Flash (free)  →  Claude Haiku 4.5 (paid)
```

### Arquitectura

- **Frontend** (`src/services/aiAssistant.js`): llama a `POST /webhook/ai-recommend` con `context` + `payload` enriquecido (layout eléctrico, métricas MPPT, irradiancia, etc.). Timeout 120s.
- **n8n** (`n8n/ai-recommend.json`): orquesta la cascada, aplica `sanitizeAction()` server-side con reglas RD-1..RD-8, devuelve JSON estructurado.
- **Quoter** (`src/components/Quoter.jsx`): botón "Analizar con IA" muestra animación de 6 pasos. Botón "Aplicar mejoras y recalcular" aplica las `actions[]` validadas al estado y recalcula.

### Campos aplicables desde IA (`APPLYABLE_FIELDS`)

```js
['systemType', 'battQty', 'busVoltage', 'backupHours', 'autonomyDays',
 'criticalPct', 'acometida', 'availableArea', 'wantsExcedentes']
// monthlyKwh excluido intencionalmente (RD-8: viene de factura del usuario)
```

### Reglas del sanitizador server-side (RD-1..RD-8)

| Regla | Descripción |
|---|---|
| RD-1 | Nunca cambiar `systemType` si es `off-grid`; nunca pasar de `on-grid` a `hybrid` si no hay excedentes |
| RD-2 | `wantsExcedentes=true` solo si hay excedente real (producción > consumo) y no es off-grid |
| RD-3 | No reducir `availableArea` por debajo del valor actual |
| RD-4 | `busVoltage` solo puede subir, nunca bajar |
| RD-5 | No proponer valores idénticos al estado actual |
| RD-6 | `backupHours` solo si storageReqKwh > totalKwh (no inflar autonomía innecesariamente) |
| RD-7 | Valores numéricos deben estar en rangos físicamente válidos |
| RD-8 | `monthlyKwh` no está en `allowedFields` — ignorado si el modelo lo propone |

### Payload enriquecido al servidor

El cotizador envía al workflow IA:
- Especificaciones eléctricas completas del panel e inversor (Voc, Vmp, Isc, MPPT, etc.)
- Métricas de layout: `validateLayout()` (string/parallel config, Voc/Vmp totales, corriente)
- Datos del techo: `availableArea`, `wholeRoofAreaM2`, `googleMaxPanels`, irradiancia real
- `siteFactors`: latitud, altitud, sombreado
- `dcAcRatio`, `noInverter` flag, `monthlyProdKwh` estimado

---

## Responsive / Mobile

```css
@media (max-width: 768px)  /* tablet: oculta nav labels */
@media (max-width: 600px)  /* mobile: bottom nav, oculta top nav buttons */
@media (max-width: 375px)  /* extra small */
```

Clases clave:
- `.al-bottomnav` → visible solo en mobile (position: fixed, bottom: 0)
- `.al-topnav-btns` → oculto en mobile
- `.al-tagline-desktop` → oculto en ≤768px
- `.al-content` → padding-bottom para bottom nav en mobile

---

## PWA

| Feature | Estado |
|---|---|
| Manifest (nombre, íconos, shortcuts) | ✅ `public/manifest.json` |
| Service Worker (cache, offline) | ✅ `public/sw.js` |
| iOS meta tags (apple-touch-icon, etc.) | ✅ `public/index.html` |
| Bottom nav nativa mobile | ✅ `App.jsx` + `index.css` |
| Instala desde Safari/Chrome | ✅ sin App Store |
| Banner de instalación | ✅ `InstallPrompt.jsx` |
| Push notifications | 🔲 handler listo en `sw.js`, falta backend |

Shortcuts configurados:
- `/?view=quoter` → "Cotizar sistema solar"
- `/?view=instalador` → "Ser instalador"

---

## Infraestructura y dominios

| Dominio | Servicio | DNS |
|---|---|---|
| `solar-hub.co` | Vercel | Hostinger |
| `www.solar-hub.co` | Vercel | Hostinger |
| `cotiza.alebas.co` | Vercel (mismo proyecto) | Latinoamérica Hosting |
| `api.solar-hub.co` | Railway n8n | Hostinger |

**Railway:** proyecto `spectacular-integrity`
- Servicio n8n: `api.solar-hub.co` ✅
- PostgreSQL: online con `postgres-volume` ✅

---

## Estado de integraciones

| Integración | Archivo frontend | Workflow n8n | Estado |
|---|---|---|---|
| Google Solar API | `services/solar.js` | `solar-roof.json` | ✅ |
| Google Solar (cache 90d) | `services/solar.js` → `solar-roof-cached` | `solar-cache.json` | ✅ activo (TTL 90d) |
| Google Solar Platform (mapa interactivo) | `InteractiveRoofMap`, `MonthlyProductionChart`, `solarLayers.js` | `solar-datalayers.json`, `solar-geotiff-proxy.json` | ✅ paneles reales + heatmap + slider + gráfico mensual |
| Google Places Autocomplete | `services/places.js` | `places-autocomplete.json` | ✅ |
| PVGIS | `services/pvgis.js` | `pvgis.json` | ✅ |
| PVWatts | `services/pvwatts.js` | `pvwatts.json` | ✅ |
| NASA POWER | `services/nasaPower.js` | `nasa-power.json` | ✅ |
| XM Colombia | `services/xm.js` | `xm-agents.json` | ✅ |
| TRM | `services/trm.js` | `trm.json` | ✅ |
| CEC Database | `services/cec.js` | `cec.json` | ✅ |
| Save/List/Update quotes | `services/quotes.js` | `save-quote.json` v2 + `list-quotes.json` + `update-quote.json` | ✅ activo |
| Seguimiento público cotización | `QuoteTracking.jsx` | `quote-public.json` | ✅ URL con token |
| Email PDF al cliente | `BackOffice.jsx` | `send-quote-email.json` | ✅ Gmail SMTP |
| AI cascade (Groq/Gemini/Claude) | `services/aiAssistant.js` | `ai-recommend.json` (RD-1..RD-8) | ✅ cascade implementado (🔲 agregar keys en Railway) |
| PDF cotización | `services/pdfGenerator.js` | — | ✅ generado en cliente |
| Push notifications | `public/sw.js` | — | 🔲 falta backend |

---

## Deploy workflow

```
git push origin main
  → Vercel detecta commit
  → npm run build (~90s)
  → Deploy en solar-hub.co
```

No hay CI/CD adicional. Todo en `main` va directo a producción.

---

## Ramas activas de Claude Code

```
claude/apply-ai-recommendations-qc5TD  ← rama actual (pendiente merge)
claude/ai-layout-analysis
claude/ai-no-agpe-without-surplus
claude/ai-prompt-stronger-actions
claude/ai-respect-user-systemtype
claude/ai-summary-in-observations
claude/inverter-stock-check
claude/n8n-google-ai-key-alias
```

Revisar con `git log --oneline origin/<rama>` antes de mergear.

---

## Próximos pasos (estado al 2026-05-24)

### 🔴 Bloqueado por infra — PR #162 abierto
1. **Auth admin server-side** ([#162](https://github.com/IngAlebas/alebas-cotizador/pull/162)). Pasos en `DEPLOY-ADMIN-AUTH.md` (en branch). Hasta que se haga, la pwd admin sigue pública en el bundle.

### 🟡 Pendiente de acción — operacional
2. **Agregar API keys IA en Railway** (ver sección Variables de entorno): `GROQ_API_KEY`, `GOOGLE_AI_KEY`, `ANTHROPIC_API_KEY` + `N8N_RUNNERS_TASK_RUNNER_ALLOWED_ENV`. Sin esto el cascade IA falla en producción.
3. **Reimportar `ai-recommend.json`** en n8n (versión con cascade Groq→Gemini→Claude + RD-1..RD-8). El JSON actual en el repo es la versión definitiva.
4. **Idempotencia `save-quote`** (REVIEW.md bloqueante #4). Doble-click duplica leads. Schema migration (`dedupe_key UNIQUE`) + `ON CONFLICT DO NOTHING` en workflow.
5. **JWT enforcement en `list-quotes` y `update-quote`** (cierra hilo de #162). Hoy aceptan `x-alebas-token` público.
6. **Eliminar carpeta `api/`** (DEPRECATED desde 2026-04-20). Auditar logs Railway, luego `rm -rf api/` + remover bloque dinámico de `server.js`.

### 🟢 Estratégico — `AUDIT.md` y `ROADMAP-FLUXAI.md`
7. **Carril A — Compliance + Seguridad** (mes 1): política Habeas Data publicada, registro SIC, log de auditoría n8n. Detalle en `AUDIT.md`.
8. **Carril B — Rigor de ingeniería** (mes 1-2): tarifa CREG real por estrato, PR calibrado por región/tilt vía PVGIS, motor fiscal Ley 1715 (deducción renta 50% + depreciación acelerada), degradación anual.
9. **Carril C — Marketplace real** (mes 2-4): matching instalador↔lead, reviews, contratos digitales, escrow.
10. **Integración FluxAI** (`ROADMAP-FLUXAI.md` + issue [#160](https://github.com/IngAlebas/alebas-cotizador/issues/160)): 5 capas, hoy en estado "logo + branding compartido" — sin flujo de datos.

---

## Histórico (no requiere acción)

### Sesión 2026-05-24 — IA aplicable + cascade + inversor null-safety (branch `apply-ai-recommendations-qc5TD`)
- **feat(ai)**: Botón "Aplicar mejoras y recalcular" — `applyAiActions()` + `coerceActionValue()` en Quoter. Las acciones IA se aplican al estado y recalculan el sistema.
- **feat(cascade)**: Groq llama-3.3-70b → Gemini 2.0 Flash → Claude Haiku 4.5 con `attempts[]` logging y `GOOGLE_AI_KEY` como alias de `GEMINI_API_KEY`.
- **feat(ui)**: Animación 6 pasos durante análisis IA (`AI_STEPS`, `aiStep` state, `@keyframes spin/slideIn/checkPop`). Validación de inversor con sub-pasos animados.
- **feat(layout)**: `validateLayout()` en payload IA — configuración string/paralelo, Voc/Vmp totales, corriente de cortocircuito, compatibilidad MPPT.
- **fix(inversor)**: `selectCompatibleInverter` retorna null si no hay tipo compatible (no fallback tipo incorrecto). `calcBudget` con null-safety `inv?.price || 0`. Badge "⚠ Consultar stock" naranja en Quoter.
- **feat(sanitizer)**: Server-side `sanitizeAction()` con RD-1..RD-8 como defensa en profundidad. `APPLYABLE_FIELDS` excluye `monthlyKwh` (RD-8). Tab Observaciones muestra análisis IA + lista de cambios aplicados.

### Sesión 2026-05-07 (PRs #159, #161, #163) ✅
- **#159** docs: AUDIT, REVIEW, ROADMAP-FLUXAI, issue #160 abierto.
- **#161** fixes: Bogotá D.C. en DEPTS, kgTotal usa `inv.kg` (no kW), IVA solo sobre lo gravable (transporte ya viene con IVA), splash lee `sh:theme` raw.
- **#163** seguridad: CSP + HSTS + X-Frame-Options + Permissions-Policy en `vercel.json`, `helmet()` en `server.js`, CORS de `*` a allowlist, `Cache-Control` para `/static/*` y `/sw.js`. Doc completo en `SECURITY-HEADERS.md`.

### BackOffice 4 fases (PRs #155-#158) ✅
- **#155** Phase 1: sync quotes desde n8n/Postgres al admin login.
- **#156** Phase 2: editor de cotizaciones con estados, notas, historial timeline.
- **#157** Phase 3: URL pública de seguimiento con token (`QuoteTracking.jsx`, workflow `quote-public.json`).
- **#158** Phase 4: admin envía PDF + link de tracking al cliente vía Gmail SMTP (`send-quote-email.json`).

### Mapa interactivo — estabilización (PRs #137-#154) ✅
Serie de 18+ fixes de alta frecuencia sobre la Google Solar Platform:
- GeoTIFF proxy n8n sin CORS (`solar-geotiff-proxy.json`), heatmap irradiancia, slider de paneles sin saltos.
- Cubiertas validadas dibujadas sobre mapa estático en PDF.
- Toggle tipo de mapa (hybrid/satellite/roadmap), control de trayectoria solar.
- Mobile: root cause `body * max-width:100%` rompía Google Maps overlays.
- IA usa `wholeAreaM2` y `googleMaxPanels` para análisis del techo.
- BackOffice 4 phases integradas y estabilizadas.

### Google Solar Platform Fases 2-5 (PR #120) ✅
- `InteractiveRoofMap.jsx`, `MonthlyProductionChart.jsx`, `SunPathDiagram.jsx`.
- Paneles reales de Google Solar, heatmap irradiancia GeoTIFF, slider de cantidad de paneles, gráfico mensual de producción.
- Workflow `solar-datalayers.json` → `POST /webhook/solar-datalayers`.

### Fase 6 (PR #118 — mergeado 2026-05-02) ✅
- `schema.sql` ejecutado: `solar_panels JSONB`, `panel_height/width_meters`, `area_m2`, `whole_roof_area_m2`, `imagery_quality`, `google_yearly_kwh`, `ai_provider` en `quotes`; tabla `solar_cache`.
- `solar-cache.json` → `POST /webhook/solar-roof-cached` (TTL 90d, ~$0.04/hit ahorrado).
- `save-quote.json` v2 — persiste `solarPanels[]`.
- `ai-recommend.json` v22 — `buildPanelLayoutStats()` + bloque [T-4b].

---

## Arranque local

```bash
git clone https://github.com/IngAlebas/alebas-cotizador
cd alebas-cotizador
cp .env.example .env.local
# editar .env.local con REACT_APP_N8N_BASE_URL
npm install
npm start
```

---

## Herramientas de desarrollo

| Herramienta | Descripción | Estado |
|---|---|---|
| `claude-mem` v12.4.9 | Memoria persistente entre sesiones de Claude Code (SQLite + Chroma, puerto 37700) | ✅ instalado — `npx claude-mem start` |

---

*Claude Chat (claude.ai) — construcción inicial PWA, branding SolarHub, responsive mobile*
*Claude Code — workflows n8n, API integrations, DEPLOY.md, arquitectura backend, IA cascade*
*Última actualización: 24 mayo 2026 — IA cascade (Groq→Gemini→Claude) + acciones aplicables + inversor null-safety (branch apply-ai-recommendations-qc5TD). PRs #155-#163 mergeados (BackOffice 4 fases + mapa estabilizado + docs + security). PR #162 (admin auth bcrypt+JWT) abierto a la espera de prep de infra n8n.*

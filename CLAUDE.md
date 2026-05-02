# SOLARHUB — Handoff Claude Chat → Claude Code

> **Estado verificado:** 05 mayo 2026  
> **Repo:** `github.com/IngAlebas/alebas-cotizador` · rama `main`  
> **Versión:** v1.0.0 (tag)  
> **Deploy:** `solar-hub.co` via Vercel (auto-deploy en push a main)

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

## Estructura real del repo (80 archivos en main)

```
alebas-cotizador/
├── CLAUDE.md              ← este archivo
├── DEPLOY.md              ← guía paso a paso para conectar n8n + Postgres
├── README.md
├── .env.example           ← variables necesarias (copiar a .env.local)
├── .gitignore / .vercelignore
├── package.json           ← React 18 + express
├── server.js              ← servidor Express (producción Railway)
├── railway.json           ← config Railway
├── Procfile               ← comando de arranque
├── vercel.json            ← build + SPA rewrite
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
│   ├── constants.js       ← Colores, operadores OR Colombia, equipos, tarifas Interrapidísimo
│   ├── index.css          ← Design system (tokens CSS, Outfit font, responsive)
│   ├── index.js           ← Entry point
│   ├── logo.png / logo.svg
│   ├── components/
│   │   ├── Quoter.jsx           ← Cotizador multi-paso (módulo principal)
│   │   ├── BackOffice.jsx       ← Panel admin protegido con contraseña
│   │   ├── InstallerReg.jsx     ← Registro instaladores RETIE
│   │   └── SupplierPortal.jsx   ← Portal proveedores
│   ├── services/          ← Todos llaman a n8n (REACT_APP_N8N_BASE_URL)
│   │   ├── solar.js       ← Google Solar API (área techo desde dirección)
│   │   ├── pvgis.js       ← PVGIS → n8n → /webhook/pvgis
│   │   ├── pvwatts.js     ← PVWatts → n8n → /webhook/pvwatts
│   │   ├── nasaPower.js   ← NASA POWER → n8n → /webhook/nasa-power
│   │   ├── xm.js          ← XM Colombia bolsa energía → n8n
│   │   ├── trm.js         ← TRM Banco República → n8n → /webhook/trm
│   │   ├── cec.js         ← CEC paneles/inversores → n8n → /webhook/cec
│   │   ├── batteries.js   ← Catálogo baterías
│   │   ├── loads.js       ← Cargas eléctricas (electrodomésticos)
│   │   ├── quotes.js      ← Guardar/listar cotizaciones → n8n
│   │   ├── n8n.js         ← Cliente base n8n (fetch + auth token)
│   │   └── aiAssistant.js ← AI cascade: Groq → Gemini → Claude (pendiente)
│   └── data/
│       └── normativa.js   ← RETIE, CREG 174/2021, CREG 135/2021, Ley 1715
│
├── api/                   ← ⚠️ DEPRECATED — reemplazado por n8n/
│   └── DEPRECATED.md      ← Mapa de equivalencias api/ → n8n workflows
│
└── n8n/                   ← Workflows JSON — importar en api.solar-hub.co
    ├── README.md          ← Instrucciones de import y activación
    ├── SETUP-RAILWAY.md   ← Guía vincular Postgres con n8n
    ├── schema.sql         ← Esquema de tablas (quotes, contacts, etc.)
    ├── pvgis.json         ← POST /webhook/pvgis
    ├── pvwatts.json       ← POST /webhook/pvwatts
    ├── nasa-power.json    ← POST /webhook/nasa-power
    ├── trm.json           ← POST /webhook/trm
    ├── xm-agents.json     ← XM agentes
    ├── xm-spot.json       ← XM spot price
    ├── cec.json           ← POST /webhook/cec
    ├── solar-roof.json    ← POST /webhook/solar-roof
    ├── solar-cache.json   ← POST /webhook/solar-roof-cached (Fase 6 — wrapper Postgres TTL 90d)
    ├── ai-recommend.json  ← POST /webhook/ai-recommend
    ├── validate-contact.json ← POST /webhook/validate-contact
    ├── save-quote.json    ← POST /webhook/save-quote
    ├── list-quotes.json   ← POST /webhook/list-quotes
    ├── batteries.json     ← catálogo baterías
    ├── tarifas-sync.json  ← sync tarifas operadores
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

Protegido por contraseña hardcodeada en `App.jsx`:

```js
const ADMIN_HASH = 'sh_' + btoa('hoJSDU2!kaiv337c');
```

Sesión en `localStorage` via `storage.set('sh:admin', '1')`.
**Para cambiar:** editar el string dentro de `btoa()`.

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
- Pendiente: vincular DB → n8n (ver `DEPLOY.md`)

---

## Estado de integraciones

| Integración | Archivo frontend | Workflow n8n | Estado |
|---|---|---|---|
| Google Solar API | `services/solar.js` | `solar-roof.json` | ✅ |
| Google Solar (cache 90d) | `services/solar.js` → `solar-roof-cached` | `solar-cache.json` → `/webhook/solar-roof-cached` | ✅ Fase 6 — activo (TTL 90d, ~$0.04 USD/hit ahorrado) |
| PVGIS | `services/pvgis.js` | `pvgis.json` | ✅ |
| PVWatts | `services/pvwatts.js` | `pvwatts.json` | ✅ |
| NASA POWER | `services/nasaPower.js` | `nasa-power.json` | ✅ |
| XM Colombia | `services/xm.js` | `xm-agents.json` | ✅ |
| TRM | `services/trm.js` | `trm.json` | ✅ |
| CEC Database | `services/cec.js` | `cec.json` | ✅ |
| Save/List quotes | `services/quotes.js` | `save-quote.json` v2 (+ `solar_panels JSONB`) + `list-quotes.json` | ✅ Fase 6 — activo |
| AI cascade (Groq/Gemini/Claude) | `services/aiAssistant.js` | `ai-recommend.json` v22 (+ `panelLayout` stats) | ✅ Fase 6 — activo (🔲 pendiente keys Groq/Gemini) |
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
claude/battery-layout-visual
claude/check-pending-changes-d8LZx
claude/fix-loading-dest-crash
claude/n8n-placeholder-detection
claude/quoter-tab-order-observations
claude/remove-logo-backgrounds-WlLGf
claude/solar-api-improvements
claude/syncxm-diagnostic-error
feat/n8n-migration
```

Revisar con `git log --oneline origin/<rama>` antes de mergear.

---

## Próximos pasos verificados (de DEPLOY.md)

1. **Vincular PostgreSQL con n8n** en Railway (ver `DEPLOY.md`)
2. **Importar y activar** los 15 workflows en `n8n/` → `api.solar-hub.co`
3. **Configurar** `REACT_APP_N8N_BASE_URL` en Vercel → Environment Variables
4. **Poblar DB** con catálogo CEC: `node n8n/seed/load-cec.js`
5. **Agregar keys** en n8n: Google Maps, Google Solar, Groq, Gemini
6. **Activar** `save-quote` + `list-quotes` → persistencia de cotizaciones
7. **Push notifications** → backend suscripciones

### Fase 6 (PR #118 — mergeado a main 2026-05-02) ✅ COMPLETADA 2026-05-05

Todo activado en `api.solar-hub.co`:

- ✅ `schema.sql` ejecutado — `solar_panels JSONB`, `panel_height/width_meters`, `area_m2`, `whole_roof_area_m2`, `imagery_quality`, `google_yearly_kwh`, `ai_provider` en `quotes`; tabla `solar_cache` creada.
- ✅ `solar-cache.json` v1 importado y activo → `POST /webhook/solar-roof-cached`
- ✅ `save-quote.json` v2 importado y activo — persiste `solarPanels[]`
- ✅ `ai-recommend.json` v22 importado y activo — `buildPanelLayoutStats()` + bloque [T-4b]
- ✅ `src/services/solar.js` → usa `solar-roof-cached` (PR #119)

Pendiente: agregar keys Groq/Gemini en n8n para activar el cascade de IA.

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
*Claude Code — workflows n8n, API integrations, DEPLOY.md, arquitectura backend*  
*Última actualización: 05 mayo 2026 — Fase 6 completada (schema.sql, solar-cache, save-quote v2, ai-recommend v22, solar-roof-cached activo); claude-mem instalado*

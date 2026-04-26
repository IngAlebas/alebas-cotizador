# SOLARHUB — Handoff desde Claude Chat → Claude Code

> **Documento de transferencia de contexto**  
> Creado por: Claude (claude.ai chat) → para: Claude Code  
> Repo: `github.com/IngAlebas/alebas-cotizador`  
> Versión: `v1.0.0` (tag en main)  
> Fecha: 25 abril 2026  

---

## 🎯 Qué es este proyecto

**SolarHub** (`solar-hub.co`) es una PWA (Progressive Web App) de cotización solar fotovoltaica para Colombia. Es el marketplace de energía solar de ALEBAS Ingeniería SAS — conecta proveedores, clientes, instaladores, ingenieros y financiadores.

**Stack:** React 18 (Create React App) → GitHub → Vercel (auto-deploy) → DNS en Hostinger

---

## 🏗 Arquitectura del sistema

```
solar-hub.co (Vercel)          app.alebas.co (Railway n8n)
     │                                   │
     ├── React SPA                       ├── n8n workflows
     ├── Service Worker (PWA)            ├── PostgreSQL
     ├── PVGIS API                       ├── Gmail automation
     ├── NASA Power API                  └── Claude API (planned)
     ├── Google Solar API
     └── XM Colombia / TRM API
```

---

## 📁 Estructura del repo

```
alebas-cotizador/
├── public/
│   ├── index.html          ← PWA meta tags (iOS/Android/SEO)
│   ├── manifest.json       ← PWA manifest (nombre, iconos, shortcuts)
│   ├── sw.js               ← Service Worker (cache, offline)
│   └── icons/              ← 12 tamaños (16→512px)
│       └── icon-{16,32,72,96,128,144,152,167,180,192,256,512}.png
├── src/
│   ├── App.jsx             ← Shell principal + admin login + nav
│   ├── constants.js        ← Colores, operadores OR, equipos, cálculos
│   ├── index.css           ← Design system completo (tokens CSS)
│   ├── index.js            ← Entry point
│   ├── logo.png            ← Logo SolarHub (sol + 6 rayos + nodos)
│   ├── components/
│   │   ├── Quoter.jsx      ← Cotizador multi-paso (el módulo principal)
│   │   ├── BackOffice.jsx  ← Panel admin (equipos, cotizaciones, instaladores)
│   │   ├── InstallerReg.jsx ← Registro de instaladores
│   │   └── SupplierPortal.jsx ← Portal de proveedores
│   ├── services/
│   │   ├── pvgis.js        ← PVGIS Europa API (PSH real por coordenadas)
│   │   ├── pvwatts.js      ← NREL PVWatts API
│   │   ├── nasaPower.js    ← NASA POWER API (irradiación)
│   │   ├── solar.js        ← Google Solar API (área de techo)
│   │   ├── xm.js           ← XM Colombia (precios bolsa energía)
│   │   ├── trm.js          ← TRM Banco de la República
│   │   ├── n8n.js          ← Webhooks hacia app.alebas.co
│   │   ├── cec.js          ← CEC database paneles/inversores
│   │   ├── batteries.js    ← Catálogo baterías
│   │   ├── loads.js        ← Cargas eléctricas (electrodomésticos)
│   │   ├── quotes.js       ← Gestión de cotizaciones
│   │   └── aiAssistant.js  ← Claude API integration (planned)
│   └── data/
│       └── normativa.js    ← RETIE, CREG 174/2021, CREG 135/2021, Ley 1715
├── package.json
└── vercel.json             ← Build config + SPA rewrites
```

---

## 🎨 Brand & Design System

### Colores (en `src/constants.js` → `export const C`)
```js
C.yellow  = '#FF8C00'   // Solar Orange — color primario SolarHub
C.orange  = '#FF8C00'   // alias
C.amber   = '#FFB800'   // secundario
C.gold    = '#FFD93D'   // acento
C.teal    = '#01708B'   // ALEBAS teal (mantiene identidad corporativa)
C.dark    = '#07090F'   // background
C.card    = '#0C1422'   // cards
C.border  = 'rgba(1,112,139,0.18)'
C.oBorder = 'rgba(255,140,0,0.22)'
C.text    = '#E8F0F7'
C.muted   = '#7A9EAA'
```

### Fuente
`Outfit` (Google Fonts) — 300, 400, 500, 600, 700, 800, 900

### Logo
Sol con 6 rayos + 6 nodos en las puntas.  
SVG inline en `App.jsx` (no depende de archivo externo en navbar).  
PNG transparente en `src/logo.png` y `public/logo.png`.

---

## 🔐 Admin

El panel de administración (`/` → botón ⚙ Admin) está protegido con contraseña.

```js
// En App.jsx
const ADMIN_HASH = 'sh_' + btoa('hoJSDU2!kaiv337c');
```

La sesión se guarda en `localStorage` via `storage.set('sh:admin', '1')`.

**Para cambiar la contraseña:** modificar el string `'hoJSDU2!kaiv337c'` en `App.jsx`.

---

## 📱 PWA — Lo que se implementó

| Feature | Archivo | Estado |
|---|---|---|
| Web App Manifest | `public/manifest.json` | ✅ |
| Service Worker | `public/sw.js` | ✅ |
| iOS meta tags | `public/index.html` | ✅ |
| Android icons | `public/icons/` | ✅ |
| Bottom nav mobile | `App.jsx` + `index.css` | ✅ |
| Offline cache | `sw.js` (stale-while-revalidate) | ✅ |
| Push notifications | `sw.js` (handler listo) | 🔲 pending backend |
| Install prompt | automático vía browser | ✅ |

### Shortcuts PWA (en manifest.json)
- "Cotizar sistema solar" → `/?view=quoter`
- "Ser instalador" → `/?view=instalador`

---

## 📐 Responsive Breakpoints

```css
/* Tablet: oculta labels nav, mantiene íconos */
@media (max-width: 768px) { ... }

/* Mobile: bottom nav, oculta top nav buttons */
@media (max-width: 600px) { ... }

/* Extra small */
@media (max-width: 375px) { ... }
```

**Clases CSS clave:**
- `.al-topnav` → navbar superior
- `.al-bottomnav` → nav inferior mobile (display:none en desktop, block en mobile)
- `.al-tagline-desktop` → tagline central (oculto en mobile)
- `.al-nav-label` → texto de botones nav (oculto en tablet/mobile)
- `.al-content` → área de contenido (padding-bottom en mobile para bottom nav)

---

## 🔌 Integraciones activas / pendientes

| Servicio | Archivo | Estado | Nota |
|---|---|---|---|
| PVGIS (irradiación) | `services/pvgis.js` | ✅ | Coordenadas → kWh/kWp |
| NASA POWER | `services/nasaPower.js` | ✅ | Backup de PVGIS |
| Google Solar API | `services/solar.js` | ✅ | Área de techo desde dirección |
| XM Colombia | `services/xm.js` | ✅ | Precio bolsa energía |
| TRM | `services/trm.js` | ✅ | Banco República |
| n8n (app.alebas.co) | `services/n8n.js` | 🔲 | DNS propagando |
| CEC Database | `services/cec.js` | ✅ | Paneles certificados |
| Claude API | `services/aiAssistant.js` | 🔲 | Estructura lista |

---

## 🚀 Deploy workflow

```
Cambio en código
    ↓
git push a main (o via GitHub API)
    ↓
Vercel detecta push automáticamente
    ↓
Build npm run build (~90 segundos)
    ↓
Deploy en solar-hub.co + www.solar-hub.co
```

**Vercel config (`vercel.json`):**
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "build",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

---

## 🌐 Dominios

| Dominio | Apunta a | DNS en |
|---|---|---|
| `solar-hub.co` | Vercel (A → 76.76.21.21) | Hostinger |
| `www.solar-hub.co` | Vercel (CNAME → cname.vercel-dns.com) | Hostinger |
| `cotiza.alebas.co` | Vercel (CNAME → ad0c23c1e0879134.vercel-dns-017.com) | Latinoamérica Hosting |
| `app.alebas.co` | Railway n8n (CNAME → 0q9uj7ig.up.railway.app) | Latinoamérica Hosting |

---

## 🗺 Roadmap — Lo que sigue (Fase 2+)

```
Fase 2: n8n automation
  └── Cotización → webhook → n8n → Gmail automático a cliente + info@alebas.co

Fase 3: Claude API
  └── services/aiAssistant.js está preparado
  └── Parse recibos EMSA, análisis técnico, recomendaciones

Fase 4: FastAPI (api.alebas.co)
  └── PVLib + PVGIS para cálculos de ingeniería precisos
  └── Memorias de cálculo eléctrico (RETIE)

Fase 5: Marketplace
  └── Catálogo dinámico de proveedores (SupplierPortal.jsx ya existe)
  └── Sistema de cotizaciones entre instaladores y clientes
  └── Pagos / comisiones

Fase 6: Push Notifications
  └── sw.js ya tiene el handler
  └── Falta: backend para suscripciones + servidor de push
```

---

## ⚠️ Notas importantes para Claude Code

1. **No tocar `src/services/`** sin entender las APIs — tienen keys/configs específicos de Colombia
2. **El admin login** usa `btoa()` simple — no es criptografía real. Para producción seria, migrar a JWT
3. **localStorage** se usa para persistir cotizaciones, equipos y sesión admin. En producción migrar a backend
4. **El service worker** cachea assets — después de cambios, el usuario necesita cerrar/reabrir la PWA
5. **`C.yellow` = `#FF8C00`** — renombrado para mantener compatibilidad con código existente que usa `C.yellow`
6. **El repo es público** — no subir tokens, API keys ni contraseñas

---

## 🔑 Credenciales de referencia (no subir al repo)

```
Admin Panel:  hoJSDU2!kaiv337c
n8n:          app.alebas.co (login pendiente)
Railway:      proyecto 605e82e7-14a0-4602-bd77-203bb200c4ef
Vercel:       ingalebas-projects / alebas-cotizador
GitHub:       github.com/IngAlebas
```

---

*Generado por Claude Chat (claude.ai) — Sesión de trabajo: 20-25 abril 2026*  
*Para continuar desarrollo, clonar el repo y ejecutar `npm install && npm start`*

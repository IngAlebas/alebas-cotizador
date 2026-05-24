# PLAN MAESTRO — SolarHub / ALEBAS Ingeniería SAS

> **Versión:** 1.5 · **Fecha:** 24 mayo 2026  
> **Autor del plan:** Claude Code (Opus 4.7) — consolida AUDIT.md + REVIEW.md + ROADMAP-FLUXAI.md + análisis competitivo + sesiones de desarrollo  
> **Repo:** `github.com/IngAlebas/alebas-cotizador` · rama `main`  
> **Deploy:** `solar-hub.co` via Vercel · Backend: `api.solar-hub.co` via Railway n8n

> **Cómo usar este documento:**  
> `[ ]` pendiente · `[x]` completado · referencia `[RV-X]` = REVIEW.md · `[AU-X]` = AUDIT.md · `[FL-X]` = ROADMAP-FLUXAI.md  
> Actualizar la sección "Registro de cambios" cada vez que se marque un bloque completo.

---

## Benchmark competitivo

> **Objetivo a 6 meses:** igualar **OpenSolar** (estándar global gratuito, principal competidor en LATAM)  
> **Objetivo a 12 meses:** superar OpenSolar en Colombia con diferenciadores locales únicos

| Software | Mercado | Precio | Posición vs SolarHub |
|---|---|---|---|
| **Aurora Solar** | USA | $800–2.000/mes | Referencia premium — funciones alcanzables, precio no |
| **OpenSolar** | Global / LATAM | Gratis | **Benchmark principal** — igualar en 6 meses |
| **PVsyst** | Global (ingenieros) | €1.500/año | Estándar de simulación — igualar en precisión de cálculo (Fase 1) |
| **Helioscope** | USA / LATAM | ~$150/mes | Referencia para proyectos comerciales y string design |
| **SAM (NREL)** | Global | Gratis | Referencia técnica — nuestros números deben alinearse |
| **Excel del instalador** | Colombia | Gratis | 70% del mercado colombiano — SolarHub ya gana aquí |

### Ventajas diferenciales de SolarHub (ningún competidor las tiene para Colombia)
1. **Compliance CREG 174/2021 + Ley 1715 nativo** — ningún software extranjero lo modela
2. **Motor fiscal colombiano** — deducción renta 50%, depreciación acelerada, aranceles 0%
3. **Integración FluxAI** — monitoreo post-venta enlazado con la cotización original
4. **Tarifas OR reales** por operador + estrato (XM + CREG, sync mensual)
5. **Marketplace RETIE** — instaladores certificados en Colombia

### Brechas para igualar OpenSolar (Fase 6)
- Plano unifilar eléctrico generado automáticamente (permit-ready RETIE)
- Análisis de sombreado hora por hora (hoy es factor genérico)
- Propuesta PDF de nivel profesional (~15–20 páginas con análisis financiero completo)
- CRM con pipeline de ventas (lead → propuesta → aprobada → instalada → monitoreada)
- String design con validación MPPT + temperatura de sitio

---

## Estado global del producto

| Área | Madurez actual | Meta |
|---|---|---|
| Cotización rápida (lead-gen) | 80% | 95% |
| Visualización solar (mapa, heatmap) | 90% | 95% |
| Persistencia y CRM | 60% | 80% |
| IA recomendadora (cascade) | 70% | 90% |
| Compliance regulatorio CREG / Ley 1715 | 20% | 80% |
| Seguridad / Habeas Data | 30% | 90% |
| Marketplace real | 10% | 60% |
| Testing / observabilidad | 5% | 70% |
| Integración FluxAI | 5% | 80% |

---

## FASE 0 — Crítico: seguridad y datos limpios
> **Plazo objetivo:** semana 1 · Sin esto no se puede escalar tráfico ni captar leads en serio

### 0.1 Auth admin server-side `[RV-1]` `[AU-SEC-1]`
- [ ] Crear tablas `admin_users` + `admin_audit` en Postgres Railway (ver `DEPLOY-ADMIN-AUTH.md`)
- [ ] Generar hash bcrypt con contraseña nueva (NO la legacy `hoJSDU2!kaiv337c`)
- [ ] Agregar env vars Railway: `JWT_SECRET` (≥32 chars), `NODE_FUNCTION_ALLOW_EXTERNAL=bcryptjs,jsonwebtoken`
- [ ] Importar `n8n/admin-login.json` y `n8n/admin-verify.json` en n8n
- [ ] Smoke test con curl: `POST /webhook/admin-login` devuelve JWT
- [ ] Mergear PR [#162](https://github.com/IngAlebas/alebas-cotizador/pull/162) → Vercel redeploya
- [ ] Eliminar `ADMIN_HASH = 'sh_' + btoa(...)` de `App.jsx`

### 0.2 JWT enforcement en endpoints admin `[RV-2]`
- [ ] `list-quotes`: validación JWT (`x-admin-token`), rechazar 401 sin token válido
- [ ] `update-quote`: ídem
- [ ] Sacar `REACT_APP_N8N_TOKEN` del bundle (dejar solo para webhooks públicos)
- [ ] Webhooks públicos (save-quote, validate-contact): validar por origen + rate-limit, sin token compartido

### 0.3 Idempotencia `save-quote` `[RV-3]`
- [x] Generar `dedupe_key UUID` en frontend al iniciar el wizard, mantenerlo en cada retry
- [x] Schema migration: `ALTER TABLE quotes ADD COLUMN dedupe_key UUID UNIQUE`
- [x] `save-quote.json`: `INSERT ... ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`
- [ ] Test: doble-click en "Solicitar cotización" no genera dos filas en DB

### 0.4 Activar IA cascade en producción
- [ ] Railway → servicio n8n → Variables: `GROQ_API_KEY=gsk_…`
- [ ] Railway → servicio n8n → Variables: `GOOGLE_AI_KEY=AIza…`
- [ ] Railway → servicio n8n → Variables: `ANTHROPIC_API_KEY=sk-ant-…`
- [ ] Railway → servicio n8n → Variables: `N8N_RUNNERS_TASK_RUNNER_ALLOWED_ENV=GROQ_API_KEY,GOOGLE_AI_KEY,ANTHROPIC_API_KEY`
- [ ] Reimportar `n8n/ai-recommend.json` (versión con cascade RD-1..RD-8)
- [ ] Mergear PR [#164](https://github.com/IngAlebas/alebas-cotizador/pull/164) → deploy a producción
- [ ] Verificar cascade: desactivar Groq → cae a Gemini; desactivar ambos → cae a Claude

### 0.5 Limpiar deuda técnica inmediata
- [x] Eliminar carpeta `api/` (DEPRECATED desde 2026-04-20): auditar logs Railway → `rm -rf api/` → remover bloque dinámico de `server.js` `[RV-4]`
- [ ] `solar-cache.json`: verificar que `schema.sql` tiene `expires_at DEFAULT NOW() + INTERVAL '90 days'`; si no, pasar valor explícito en INSERT `[RV-5]`
- [ ] `solar-cache.json`: agregar logging cuando `continueOnFail` oculta un error real de Postgres (hoy un MISS por error de DB es indistinguible de un MISS normal → golpea Google Solar sin control) `[RV-6]`
- [x] Fix logout: `localStorage.removeItem('sh:admin')` en lugar de `storage.set('sh:admin', '0')` `[RV-7]`
- [x] `sw.js:90`: cambiar `clients` a `self.clients.openWindow(...)` `[RV-8]`
- [x] `sw.js`: marcar `/manifest.json`, `/logo.svg`, `/logo.png` como network-first (hoy son cache-first sin hash → cambios de logo no llegan si no se bumpa SW_VERSION) `[RV-9]`
- [x] `list-quotes.json`: cambiar `queryReplacement` a sintaxis array `={{ [$json.status, $json.search, $json.limit] }}` `[RV-10]`
- [ ] Limpiar ramas `claude/*` obsoletas (hay 25+ activas): revisar con `git log --oneline origin/<rama>` y borrar las que ya están mergeadas o abandonadas

### ~~0.6 Bugs de cálculo~~ ✅ Resueltos en PR #161
- [x] **kgTotal**: `invObj.kg ?? 20` en lugar de `invKw` (potencia≠peso) `[RV-BUG-1]`
- [x] **IVA doble sobre transporte**: `transport` excluido de base imponible `[RV-BUG-2]`
- [x] **Bogotá D.C.**: agregado a `DEPTS` en `constants.js` `[RV-BUG-3]`
- [x] **Splash tema**: usa `localStorage.getItem('sh:theme')` directo sin JSON.parse `[RV-BUG-4]`

### ~~0.7 Seguridad básica~~ ✅ Resuelta en PR #163
- [x] CSP + HSTS + X-Frame-Options + Permissions-Policy en `vercel.json`
- [x] `helmet()` en `server.js`
- [x] CORS de `*` a allowlist (`solar-hub.co`, `cotiza.alebas.co`)
- [x] `Cache-Control` para `/static/*` y `/sw.js`

---

## FASE 1 — Alta prioridad: rigor de ingeniería solar
> **Plazo objetivo:** mes 1 · Define si el cotizador es confiable técnicamente o solo visual

### 1.1 Tarifa CREG real por estrato y operador `[AU-ING-1]`
- [ ] Activar workflow `tarifas-sync.json` en n8n con cron mensual (fuente: CREG / XM)
- [ ] Poblar DB con componentes reales G+T+D+C+P+R por operador
- [x] UI Quoter: selector de estrato — "Estrato 1–6 / Comercial NT1 / Industrial NT2 / Industrial NT3" con factores CREG 2024
- [x] `getEffectiveTariff(operator, estrato)`: tarifa CU real por estrato — subsidio E1-E3, plena E4, contribución E5-E6
- [ ] `calcBudget`: consumir tarifa real desde DB en lugar del promedio hardcoded
- [ ] Mostrar tarifa usada + fuente + fecha de actualización junto al ROI

### 1.2 Performance Ratio calibrado por región `[AU-ING-2]`
- [x] Eliminar `PR = 0.78` constante en `calcSystem` — ahora usa `opts.pr ?? 0.78`
- [x] `DEPT_PR`: tabla 33 departamentos colombianos (PR 0.73–0.83 según zona climática IDEAM)
- [x] `getPR(dept)`: función lookup con fallback 0.78 — usado en `consumptionKwp` y `calcSystem`
- [x] Tab Técnico: badge "PR regional: X%" con fuente PVGIS/IDEAM
- [ ] `yield_calibration` en Postgres: calibración con datos reales de instalaciones (largo plazo)
- [ ] UI: badge "PR calibrado por datos reales: 0.81 (N instalaciones)"

### 1.3 Motor fiscal Ley 1715/2014 + Decreto 829/2020 `[AU-ING-3]`
- [x] Deducción renta 50% sobre valor de la inversión (mostrada en resultados)
- [x] Depreciación acelerada (hasta 5 años, no 20) — estimación mostrada en resultados
- [x] Exclusión IVA equipos calificados — IVA ahorrado (19% × sección A) mostrado
- [x] Exención arancelaria (arancel 0%) para equipos importados bajo Ley 1715 — `arancelAhorrado ≈ 5% × sA` con nota "*si aplica"
- [x] Mostrar en cotización: "Beneficio fiscal total estimado: $X COP" desglosado por rubro
- [ ] Advertencia: para industrial/comercial el beneficio fiscal puede superar el ahorro tarifario en los primeros 5 años

### 1.4 Degradación anual de paneles `[AU-ING-4]`
- [x] Agregar `panelDegradation: 0.005` (0.5%/año típico) al modelo de proyección
- [x] Recalcular producción acumulada a 25 años con curva de degradación — mostrado en resultados
- [x] UI: gráfico SVG de producción anual decreciente en PDF (barras con línea de referencia plana + marca ROI)
- [x] ROI ajustado con degradación incluida (`roiWithDegradation`)

### 1.5 Compliance CREG 174/2021 + 175/2021 `[AU-CREG]`
- [x] Diferenciación clara AGPE (≤100 kW) vs AGGE (>100 kW) en resultados — badge AGPE Menor/Mayor con Art.22/23 CREG 174/2021
- [x] Informar trámite con OR según tipo (AGPE: ~30 días hábiles, AGGE: proceso más largo)
- [x] CREG 030/2018: modelar net metering / créditos de energía con resolución mensual — `calcMonthlyNetMetering()` en constants.js + UI Quoter
- [ ] Indicar cuándo aplica registro UPME según capacidad
- [ ] Advertir sobre requisitos RETIE 2013 + RETILAP en el diseño entregado

### 1.6 Fixes de cálculo pendientes
- [x] **Cobertura >100%**: mostrar "100+ % autoconsumo + excedentes kWh/mes" en stat card `[RV-BUG-5]`
- [x] **`specsSource: 'heuristic'`**: banner naranja en tab Técnico cuando se usa la heurística `pps = floor(700/40)` por falta de specs eléctricas del panel `[RV-BUG-6]`
- [ ] **`solar_panels` JSONB tamaño**: documentar decisión — para techos grandes son ~80 KB/quote; planificar migración a tabla separada `quote_panels` cuando se superen 1.000 quotes/mes `[RV-N-1]`

---

## FASE 2 — Mes 1–2: compliance legal y operacional

### 2.1 Habeas Data Ley 1581/2012 `[AU-SEC-2]`
- [ ] Redactar y publicar política de tratamiento de datos en `solar-hub.co/privacidad`
- [ ] Registrar bases de datos ante SIC (Registro Nacional de Bases de Datos — RNBD)
- [x] Formulario Quoter paso "Contacto": checkbox **no preseleccionado** de autorización de tratamiento (Ley 1581/2012)
- [x] `save-quote.json`: grabar campo `data_consent: {accepted, timestamp, version}` en DB
- [ ] Log de auditoría n8n: registrar quién accedió a qué cotización, cuándo y desde qué IP
- [ ] Política de retención: TTL para datos de leads (ej. 2 años) con proceso de borrado bajo solicitud

### 2.2 Rate-limiting y anti-bot `[RV-SEC]`
- [x] `validate-contact.json`: rate-limit por IP (N=20/hora) — Postgres COUNT últimas cotizaciones
- [x] `save-quote.json`: límite N=5 cotizaciones/hora por IP — Postgres COUNT + 429
- [ ] Considerar Cloudflare Turnstile en formularios públicos (Quoter, InstallerReg, SupplierPortal)
- [ ] Timestamp de carga de página en payload: validar `submitTime - pageLoadTime > 3s` como señal anti-bot

### 2.3 Token de seguimiento público `[RV-SEC-2]`
- [ ] `quote-public.json`: agregar `tokenIssuedAt` y rechazar si `now - issued > 90d`
- [ ] Regenerar token cuando la cotización pasa a `ganada` o `perdida`
- [ ] Comparación de token en constant-time (evitar timing attacks)

### 2.4 Formularios con validación client-side `[RV-UX]`
- [x] Helper compartido de validación email/teléfono para InstallerReg + SupplierPortal — `src/services/validation.js` (validatePhone/Email/NIT/formatPhoneCO/validateContactForm)
- [x] Disparar `validate-contact` desde InstallerReg — inline errors en rojo antes del submit
- [ ] Mostrar lista de campos faltantes en rojo en SupplierPortal (hoy falla silenciosamente)
- [ ] Inputs numéricos: `min="0"` y `max` relevante en todos los formularios

### 2.5 SupplierPortal: PDFs a storage externo `[RV-SEC-3]`
- [ ] Mover upload de PDFs de `localStorage` a endpoint n8n → Postgres bytea o bucket S3/R2 firmado
- [ ] Un solo PDF de 4 MB → 5.4 MB en base64 puede saturar la quota de localStorage (5–10 MB total)

### 2.6 Hidratación y race conditions UI `[RV-RACE]`
- [x] Flag `hydrated` en App.jsx: bloquear backoffice hasta que `useEffect` de localStorage termine
- [ ] Flag `loadsTouched`: cancelar fetch remoto de cargas si el admin ya empezó a editar el catálogo
- [x] `gMerge` anti-tombstone: `al:panels:tombstones` en localStorage para que panels borrados no reaparezcan al re-hidratarse con `DEFAULT_PANELS`

---

## FASE 3 — Mes 2: madurez técnica y observabilidad

### 3.1 CI/CD real `[AU-OPS-1]`
- [x] GitHub Actions workflow: lint + build en cada PR — `.github/workflows/ci.yml` Node 20
- [x] Tests unitarios de funciones de cálculo (`calcSystem`, `calcBudget`, `selectCompatibleInverter`) — 95 tests en `src/__tests__/constants.test.js`
- [ ] Ambiente de staging: rama `staging` → deploy Vercel preview fijo con datos de prueba
- [ ] Estrategia de rollback: tags de release + revert documentado, o feature flags para cambios de riesgo

### 3.2 Testing `[AU-OPS-2]`
- [ ] Suite de tests para lógica solar crítica — cobertura ≥ 80% de `constants.js`
- [ ] Tests de integración n8n: mock de Postgres, validar que flows devuelven schema correcto
- [ ] Tests E2E básicos (Playwright): happy path cotizador completo + submit + email confirmación

### 3.3 Observabilidad `[AU-OPS-3]`
- [x] Integrar Sentry para errores frontend en producción — init en `src/index.js`, activar con `REACT_APP_SENTRY_DSN` en Vercel
- [ ] n8n: tabla `n8n_executions_log` — workflow + duración + estado + error
- [ ] Alertas: notificación si cascade IA falla los 3 proveedores, si cache hit-rate < 30%, si save-quote falla >5% de intentos
- [ ] Dashboard métricas: cotizaciones/día, tasa conversión lead→ganada, usuarios activos, departamentos con más demanda

### 3.4 Backups Postgres `[AU-OPS-5]`
- [ ] Configurar backups automáticos diarios en Railway Postgres
- [ ] Retención: 30 días de backups
- [ ] Probar restore: documentar procedimiento paso a paso

### 3.5 Migración CRA → Vite `[AU-OPS-4]`
- [ ] CRA está en maintenance mode desde 2023 — evaluar impacto y planificar migración
- [ ] Validar compatibilidad de todos los imports (CSS modules, SVG inline, env vars `REACT_APP_*`)
- [ ] Ejecutar la migración con CI/CD activo (Fase 3.1 primero) para que el build sea el árbitro

---

## FASE 4 — Mes 2–4: marketplace real

### 4.1 Matching instalador ↔ lead `[AU-MKT-1]`
- [x] Algoritmo de matching: score = rating×50% + disponibilidad×40% + experiencia×10% — `n8n/matching-installer.json`
- [x] Tabla `installer_matches` en Postgres + columnas `rating_avg`, `rating_count`, `coverage_depts`, `max_kwp_month`, `active_jobs` en `technicians`
- [x] BackOffice: botón "Sugerir instaladores" → top-3 candidatos con score + "Asignar"
- [ ] `InstallerReg`: agregar campos de cobertura geográfica, capacidad máxima (kWp/mes), tipos de sistema (pendiente)
- [ ] Notificación email al instalador cuando hay lead nuevo en su zona (workflow n8n — pendiente)

### 4.1b Validación credenciales RETIE `[nuevo]`
- [x] `InstallerReg.jsx`: selector tipo instalador (Técnico/Ingeniero) con campos condicionales
- [x] Técnico: upload certificado CONTE vigente + hoja de vida
- [x] Ingeniero: upload diploma + hoja de vida + tarjeta profesional COPNIA
- [x] Tabla `installer_documents` + columnas `installer_type`, `copnia_number`, `conte_number`, `credential_status`, `verified_at` en `technicians`
- [x] Workflow `n8n/installer-credentials.json` — SUBMIT/GET/REVIEW
- [x] BackOffice: `CredReviewPanel` con visor docs inline, Aprobar/Rechazar + badge estado

### 4.2 Reviews y reputación `[AU-MKT-2]`
- [x] Tabla `installer_reviews` con UNIQUE (quote_id, installer_id) + recomputo automático rating_avg/count
- [x] `QuoteTracking.jsx`: formulario de calificación con estrellas — visible cuando `status=ganada && technician_id`
- [x] Workflow `n8n/installer-review.json` — GET (con distribución 1-5) + POST (actualiza rating en technicians)
- [ ] Perfil público del instalador: página dedicada con historial de reviews (pendiente)
- [ ] Solo mostrar review form si instalación confirmada hace >7 días (pendiente)

### 4.3 Contratos digitales `[AU-MKT-3]`
- [ ] Integrar firma electrónica certificada (Certicámara Colombia / Firma Virtual / DocuSign)
- [ ] Template de contrato de instalación con todos los campos del cotizador
- [ ] Workflow n8n: generar contrato PDF firmable cuando cotización → `aprobada`
- [ ] Guardar contrato firmado en storage + link permanente en la cotización

### 4.4 Pagos / Escrow `[AU-MKT-4]`
- [ ] Definir modelo de negocio: ¿comisión por lead? ¿porcentaje de la instalación? ¿suscripción instalador?
- [ ] Integrar PSP colombiano (PayU / ePayco) para pagos en COP
- [ ] Flujo de escrow: 50% al firmar contrato, 50% al completar instalación con foto + firma del cliente

### 4.5 Portal Proveedor B2B (Marketplace on-demand) `[nuevo]` ✅
- [x] `src/components/SupplierPortal.jsx` — portal standalone full-page (~55KB): login email/token, 5 tabs
- [x] Tab Dashboard: métricas en tiempo real, alertas stock crítico (qty<5), últimos 5 pedidos
- [x] Tab Inventario: CRUD equipos inline, filas críticas ámbar, formulario agregar con campo condicional Wp/kW/kWh
- [x] Tab Pedidos: timeline 7 estados, desglose financiero (bruto→-10% SH→neto), botones contextuales, código guía
- [x] Tab Comisiones: historial por PO con pill pendiente/pagada
- [x] Tab Empresa: perfil, cuenta bancaria, token de acceso copiable
- [x] `src/services/supplier.js` — PLATFORM_FEE_EQUIPMENT_PCT=10, TECH_EARNINGS_PCT=80, SH_INSTALL_FEE_PCT=20
- [x] `n8n/supplier-auth.json` — JWT 7d (bcryptjs + jsonwebtoken), email/pass o token URL
- [x] `n8n/supplier-stock.json` — CRUD inventario (GET/POST/PATCH) con JWT
- [x] `n8n/supplier-po.json` — GET/POST_CREATE/PATCH_STATUS; comisiones calculadas server-side
- [x] `n8n/supplier-analytics.json` — 3 queries paralelas: métricas, comisiones, stock crítico
- [x] Schema: `suppliers`, `supplier_stock`, `purchase_orders` (po_seq PO-2026-XXXX), `po_items`, `commissions`
- [x] BackOffice: sección "Crear Orden de Compra" + panel "Comisiones SolarHub estimadas"
- [ ] Setup requerido: ejecutar schema.sql, importar 4 workflows, agregar JWT_SECRET en Railway

---

## FASE 5 — Mes 3–6: integración FluxAI

### 5.1 Capa 1 — Datos compartidos `[FL-1]`
- [ ] Migración SolarHub Postgres: `quotes.flux_client_id UUID NULL`, `quotes.flux_installation_id UUID NULL`, `quotes.handoff_at TIMESTAMPTZ NULL`
- [ ] Migración FluxAI Postgres: `clients.solarhub_quote_id UUID UNIQUE`, `installations.solarhub_quote_snapshot JSONB`
- [ ] Workflow `n8n/provision-monitoring.json`: trigger en `update-quote` cuando status → `ganada`
- [ ] Endpoint FluxAI: `POST /api/v1/integrations/solarhub/handoff` con payload firmado (JWT servicio)
- [ ] n8n actualiza `quotes` con `flux_client_id` + `flux_installation_id` recibidos
- [ ] Test E2E: cotización → ganada → instalación existe en FluxAI con snapshot correcto
- [ ] **Prerequisito:** Fase 0.1 (auth admin real antes de firmar requests cross-app)

### 5.2 Capa 2 — Provisionamiento de equipos `[FL-2]`
- [ ] Tabla FluxAI `equipment_catalog`: `(brand, model, sku, data_frame, mqtt_topic_template, mppt_count, max_string_voltage, kg)` — poblar desde catálogo CEC de SolarHub
- [ ] Mapeo verificado: 8 inversores de `DEFAULT_INVERTERS` ↔ data-frames FluxAI
- [ ] Endpoint FluxAI: `POST /api/v1/installations/{id}/provision` → devuelve credenciales MQTT por-equipo
- [ ] Workflow `n8n/provision-device.json`: valida certificado RETIE del instalador antes de entregar credenciales
- [ ] Credenciales MQTT almacenadas en `installations.mqtt_credentials_encrypted`, nunca en localStorage
- [ ] **Prerequisito:** Capa 1 activa

### 5.3 Capa 3 — Telemetría calibra el cotizador `[FL-3]`
- [ ] Tabla SolarHub `yield_calibration`: `(region, dept, inverter_brand, panel_brand, quarter, expected_kwh_per_kwp, actual_kwh_per_kwp, sample_size, last_updated)`
- [ ] Endpoint FluxAI: `GET /api/v1/integrations/solarhub/yield-aggregates?region=…&from=…` con auth de servicio
- [ ] Workflow `n8n/sync-yield.json`: cron semanal → agrega datos reales FluxAI → escribe `yield_calibration`
- [ ] `getCalibratedPR(dept, brand)`: usa tabla si N ≥ 10 instalaciones, fallback 0.78
- [ ] UI Quoter: badge "PR calibrado por datos reales: 0.81 (47 instalaciones similares)"
- [ ] **Prerequisito:** Capas 1+2 activas + mínimo 10 instalaciones monitoreadas

### 5.4 Capa 4 — SSO cross-app `[FL-4]`
- [ ] Endpoint FluxAI: `POST /api/v1/integrations/solarhub/sso-link` → URL con JWT TTL ≤ 60s
- [ ] `SolarHubSsoController` en FluxAI: valida JWT, crea sesión Jetstream, redirige al dashboard del cliente
- [ ] BackOffice: botón "Ver monitoreo en FluxAI →" en cotizaciones ganadas
- [ ] Log auditoría en ambos sistemas: quién solicitó SSO, cuándo, para qué cliente
- [ ] **Prerequisito:** Fase 0.1 (auth real) + Capa 1

### 5.5 Capa 5 — Habeas Data en handoff `[FL-5]`
- [ ] Checkbox consentimiento en Quoter: "Autorizo transferir mis datos a FluxAI para monitoreo de mi sistema"
- [ ] `save-quote.json`: grabar `flux_consent: {accepted, timestamp, version}`
- [ ] Política de privacidad actualizada: FluxAI listado como receptor de datos personales
- [ ] Workflow handoff (Capa 1): transferir datos solo si `flux_consent.accepted = true`
- [ ] **Prerequisito:** Fase 2.1 (Habeas Data base) + Capa 1

---

## FASE 6 — Mes 3–4: igualar OpenSolar — outputs de nivel profesional

### 6.1 Plano unifilar eléctrico automático
- [x] `UnifileGenerator.jsx` (830 líneas): unifilar SVG puro RETIE/IEC 60617 (`mode='technical'`) — fusibles, combinadora, interruptores DC/AC, SPD DC/AC, inversor/cargador, BMS, baterías, medidor bidireccional, tablero, acometida OR
- [x] Layout simplificado cliente (`mode='client'`) — bloques íconos ☀⚡🔋🏠🔌 con flujo energético
- [x] `onExportSVG` callback + captura via XMLSerializer para embeber en PDF
- [x] Integrado en `TechnicianPortal.jsx` (vista técnica) y `QuoteTracking.jsx` (vista cliente)
- [ ] Validar simbología con ingeniero eléctrico certificado RETIE antes de usar en trámites OR
- [ ] Especificaciones por componente: calibre de cable AWG, rating exacto de breakers (depende de Isc real)

### 6.2 Análisis de sombreado hora por hora
- [ ] Usar `SunPathDiagram.jsx` (ya existe) + obstáculos del techo identificados en Google Solar
- [ ] Calcular factor de sombreado mensual por posición real de cada panel (no factor genérico)
- [ ] Integrar con `validateLayout()` para corregir la producción estimada
- [ ] Mostrar "pérdidas estimadas por sombreado: X% (Y kWh/año)"

### 6.3 Propuesta comercial PDF de nivel profesional
- [x] `pdfGenerator.js`: PDF ~15 páginas con portada, resumen ejecutivo, specs técnicas, unifilar RETIE embebido, análisis financiero mes a mes, proyección 25 años con gráfico SVG de degradación, beneficio fiscal Ley 1715 desglosado, normativa, próximos pasos
- [ ] Layout del techo con paneles reales (imagen Google Solar) — integración pendiente
- [ ] Versión ejecutiva de 2 páginas para financiadores

### 6.4 CRM con pipeline de ventas
- [x] BackOffice: vista kanban 5 columnas (Nuevo / Asignado / En revisión / Aprobado / Ganado) + toggle lista/kanban
- [x] BackOffice: "↓ Exportar CSV" con 15 columnas — compatible Excel con BOM UTF-8
- [x] Pipeline técnico: `assign-technician.json` → `tech-review.json` → aprobación → `doc_status` tracking
- [ ] Automatización: recordatorio por email si lead lleva >7 días sin actividad
- [ ] Métricas: tasa conversión por etapa, tiempo promedio ciclo de venta

### 6.5 String design con validación MPPT + temperatura
- [x] Voc-frío y Vmp-caliente corregidos por temperatura (NASA POWER o defaults NEC 690.7)
- [x] Verificación ventana MPPT del inversor — card color-coded verde/naranja en tab Técnico
- [x] Banner heurístico cuando panel no tiene specs eléctricas CEC
- [ ] Extender para múltiples strings con distintas orientaciones (orientación mixta E/O)
- [ ] Vmp validado dentro del rango MPPT en temperatura máxima
- [ ] Advertencia explícita si cualquier string queda fuera de la ventana MPPT del inversor
- [ ] Output claro: "String 1: 10 paneles · Voc=420 V · Vmp=352 V ✅ dentro de MPPT 200–480 V"

---

## FASE 7 — WhatsApp: OTP, notificaciones y chatbot
> **Plazo objetivo:** mes 1–3 · Transversal: refuerza Fase 0 (anti-fraude/Habeas Data), Fase 2 (validación), Fase 4 (CRM), Fase 6 (pipeline)  
> **Provider recomendado:** Meta WhatsApp Cloud API (oficial, sin BSP intermedio, free tier 1.000 conversaciones/mes)  
> **Alternativa local:** Yalo (BSP colombiano) o Twilio si se prefiere abstracción

### 7.0 Setup infraestructura WhatsApp
- [ ] Crear Meta Business Account verificado (NIT 901.992.450-5)
- [ ] Crear WhatsApp Business Account (WABA) asociado a ALEBAS Ingeniería SAS
- [ ] Verificar número de teléfono comercial (sugerido: `+57 1 XXX XXXX` corporativo, no celular personal)
- [ ] Generar `WHATSAPP_PHONE_NUMBER_ID` + `WHATSAPP_ACCESS_TOKEN` (system user permanente, no temporal de 24h)
- [ ] Configurar webhook de inbound: `https://api.solar-hub.co/webhook/wa-inbound` con `WHATSAPP_VERIFY_TOKEN`
- [ ] Railway env vars: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` (para validar firma de Meta)
- [ ] Documentar costos: free tier + ~$0.005-0.01 USD por business-initiated conversation en Colombia

### 7.1 Plantillas WhatsApp (Meta debe aprobarlas, 24-48h)
- [ ] `solar_otp` — categoría AUTHENTICATION — "Tu código SolarHub es {{1}}. Válido por 5 minutos. No lo compartas con nadie."
- [ ] `quote_received` — categoría UTILITY — "Hola {{1}}, recibimos tu solicitud de cotización solar. Te contactamos en máximo 2 horas hábiles. Sigue tu cotización aquí: {{2}}"
- [ ] `quote_ready` — UTILITY — "{{1}}, tu cotización solar está lista. Sistema de {{2}} kWp, ahorro estimado ${{3}} COP/mes. Ver propuesta: {{4}}"
- [ ] `quote_approved` — UTILITY — "Excelente {{1}}, recibimos la aprobación de tu cotización. Tu instalador {{2}} te contactará en 48h para coordinar visita técnica."
- [ ] `installation_scheduled` — UTILITY — "{{1}}, tu instalación solar está agendada para el {{2}}. Instalador: {{3}}. Cualquier cambio responde a este mensaje."
- [ ] `installation_completed` — UTILITY — "¡Felicidades {{1}}! Tu sistema solar está instalado y produciendo. Monitorea tu energía aquí: {{2}}"
- [ ] `post_install_review` — MARKETING — "{{1}}, han pasado 30 días con tu sistema solar. ¿Cómo ha sido tu experiencia? Califica a tu instalador: {{2}}"

### 7.2 OTP por WhatsApp en validación de cliente `[Crítico]`
- [ ] Schema migration: tabla `otp_codes (id, phone, code_hash, expires_at, attempts, ip, consumed_at)` + índice en `(phone, expires_at)`
- [ ] Workflow `n8n/wa-send-otp.json`:
  - Recibe `{phone, ip}` → valida formato E.164 colombiano (`+57XXXXXXXXXX`)
  - Rate-limit: máximo 3 OTPs por teléfono/hora, 5 por IP/hora
  - Genera código 6 dígitos numérico, hash con bcrypt
  - Inserta en `otp_codes` con `expires_at = NOW() + INTERVAL '5 minutes'`
  - Llama Meta API: `POST /v18.0/{PHONE_ID}/messages` con plantilla `solar_otp`
  - Devuelve `{ok: true, expiresAt}` o `{ok: false, reason: 'rate_limit'|'invalid_phone'}`
- [ ] Workflow `n8n/wa-verify-otp.json`:
  - Recibe `{phone, code}` → busca `otp_codes` no consumido, no expirado
  - Incrementa `attempts`; bloquea después de 3 intentos fallidos
  - Si match: marca `consumed_at = NOW()`, marca el lead/contacto como `phone_verified = true`
  - Devuelve JWT corto (TTL 30 min) firmado para que el frontend continúe el wizard
- [ ] Frontend `Quoter.jsx`: nuevo paso "Verificación" después de "Contacto"
  - Input teléfono con máscara `+57 XXX XXX XXXX` y país preseleccionado Colombia
  - Botón "Enviar código por WhatsApp" → llama `wa-send-otp`
  - Input 6 dígitos con auto-focus y validación visual (verde si correcto, rojo si error)
  - Botón "Reenviar código" deshabilitado por 60s (cooldown)
  - Aceptar cualquier desviación: "¿No te llegó? Intenta de nuevo o contáctanos al +57 1 XXX XXXX"
- [ ] Schema: agregar `phone_verified BOOLEAN DEFAULT FALSE` y `phone_verified_at TIMESTAMPTZ` a tabla `quotes`
- [ ] `save-quote.json`: solo aceptar cotizaciones con `phone_verified = true` (validar JWT del OTP)
- [ ] Consentimiento Habeas Data: aclarar en el paso "Verificación" que el número se usa para OTP + notificaciones de la cotización
- [ ] Bypass admin: el back office puede crear cotizaciones sin OTP (para leads que entran por llamada/email)

### 7.3 Notificaciones automáticas en cambios de estado
- [ ] Workflow `n8n/wa-notify-quote.json`: trigger en `update-quote` cuando cambia `status`
  - `nueva` → `quote_received` (al cliente)
  - `propuesta_enviada` → `quote_ready` (al cliente, con link de tracking)
  - `aprobada` → `quote_approved` (al cliente + notificación interna al instalador asignado)
  - `en_instalación` → `installation_scheduled` (al cliente con fecha)
  - `ganada` → `installation_completed` + 30 días después → `post_install_review`
- [ ] Tabla `wa_messages (id, phone, quote_id, template, direction, content, status, sent_at, read_at)` para auditoría
- [ ] Manejo de fallas: si Meta API devuelve error, reintentar 3 veces con backoff exponencial, registrar en log
- [ ] Si el cliente bloqueó/eliminó el chat: marcar `wa_messages.status = 'failed'` y fallback a email (workflow `send-quote-email.json` ya existe)
- [ ] BackOffice: pestaña "Mensajes WhatsApp" mostrando historial por cotización (enviados + recibidos + leídos)

### 7.4 Chatbot conversacional con IA
- [ ] Workflow `n8n/wa-inbound.json`: webhook que Meta llama cuando un cliente envía mensaje
  - Verifica firma con `WHATSAPP_APP_SECRET` (HMAC-SHA256)
  - Identifica al cliente por `phone` → busca cotización activa en `quotes`
  - Si no hay cotización: oferta "¿Quieres iniciar una cotización solar? Responde *SI*"
  - Si hay cotización: contexto cargado para la IA
- [ ] Tabla `wa_conversations (phone, state, context_json, last_message_at)` — máquina de estados:
  - `initial` → respondiendo saludo
  - `qualifying` → preguntando consumo / dirección
  - `quote_in_progress` → guiando wizard via WhatsApp (alternativa al cotizador web)
  - `quote_sent` → esperando aprobación
  - `installation_coordinated` → ya pasó a instalador
  - `escalated_human` → un agente humano tomó el control
- [ ] Integración con cascade IA existente (`ai-recommend.json`):
  - Reutilizar Groq llama-3.3-70b para responder en lenguaje natural
  - Prompt system: "Eres asesor solar de SolarHub Colombia. Solo respondes preguntas sobre energía solar, cotizaciones, normativa CREG, financiamiento, instalación. Si preguntan otra cosa, redirige al tema. Si la pregunta requiere acción humana, di '[ESCALAR]'."
  - Respuestas máximo 3 frases (WhatsApp no es para párrafos largos)
- [ ] Intents detectados con keywords (fallback rápido sin llamar IA):
  - "precio", "cuánto cuesta" → resumen económico + link a cotizador
  - "tiempo", "demora", "cuánto se demora" → tiempos típicos por capacidad
  - "garantía" → garantías de panel/inversor/instalación
  - "financiación", "crédito" → opciones de financiamiento
  - "hablar con asesor", "humano" → marca `state = escalated_human`, notifica admin
- [ ] Botones interactivos de WhatsApp (cuando aplica): "Ver cotización", "Hablar con asesor", "Agendar visita"
- [ ] Horario: respuestas automáticas siempre; escalaciones a humano solo L-V 8am-6pm Colombia (fuera de horario: "Te respondemos el próximo día hábil")

### 7.5 Notificaciones al instalador y admin (canal interno)
- [ ] Crear segundo número WhatsApp Business para canal interno (o usar Slack/Telegram)
- [ ] Workflow `n8n/wa-notify-internal.json`:
  - Nueva cotización con consumo >500 kWh/mes → notifica admin (lead caliente)
  - Cotización ganada → notifica instalador asignado
  - Cliente respondió chatbot con `[ESCALAR]` → notifica admin con link al historial
  - Cliente no respondió en 48h tras `propuesta_enviada` → notifica admin para seguimiento

### 7.6 Cumplimiento legal y operacional
- [ ] Política de privacidad actualizada: WhatsApp como canal de comunicación + Meta como sub-procesador
- [ ] Opt-out: comando "BAJA" o "STOP" en cualquier mensaje → marca `wa_opt_out = true`, no se envían más mensajes
- [ ] Ventana de 24h Meta: solo enviar plantillas pre-aprobadas fuera de la ventana de 24h tras último mensaje del cliente
- [ ] Métricas de salud: tasa de entrega, tasa de lectura, tasa de respuesta, tasa de opt-out (alerta si opt-out > 5%)
- [ ] Auditoría: logs `wa_messages` con TTL 2 años (Habeas Data + soporte de disputas)

### 7.7 KPIs esperados (referencia mercado Colombia)
- Tasa de conversión lead → cotización con OTP vs sin OTP: +30-50% (filtra falsos)
- Tasa de apertura plantillas utilitarias: 85-95%
- Tasa de respuesta del chatbot: 60-70% de leads completan calificación inicial
- Ahorro en costos de SMS: $0 (WhatsApp gratis vs SMS ~$50 COP/mensaje en Colombia)

---

## Backlog / ideas futuras (sin fecha)

- **Soiling regional**: factor de suciedad estacional (Caribe seco vs Andes lluvioso vs Llanos)
- **Seguimiento post-venta**: encuesta de satisfacción a 30 / 90 / 365 días post-instalación
- **API pública para integradores**: instaladores y desarrolladores consultan el motor de cálculo
- **Multi-idioma**: inglés para proyectos con inversión extranjera
- **Financiamiento solar**: leasing / crédito solar (Bancóldex, banca verde, bonos verdes)
- **App móvil nativa**: React Native reutilizando lógica de `constants.js`
- **LIDAR del techo**: reemplazar Google Solar con LIDAR propio para mayor precisión en sombreado (largo plazo, alto costo)
- **Simulación horaria completa**: energía hora a hora para proyectos industriales con tarifas horarias (bolsa XM)
- **Certificados de energía renovable (I-REC)**: para proyectos corporativos con metas ESG

---

## Registro de cambios del plan

| Fecha | Versión | Qué cambió |
|---|---|---|
| 2026-05-24 | v1.0 | Creación del plan maestro (consolida AUDIT.md + REVIEW.md + ROADMAP-FLUXAI.md + sesiones de desarrollo) |
| 2026-05-24 | v1.1 | Agrega benchmark competitivo vs Aurora Solar / OpenSolar / PVsyst. Agrega Fase 6 (outputs nivel profesional) |
| 2026-05-24 | v1.2 | Integra todas las recomendaciones pendientes: marca ítems completados en PRs #161 y #163; agrega items faltantes de REVIEW.md (sw.js network-first, solar-cache continueOnFail, solar_panels JSONB monitoring, ramas obsoletas); reorganiza Fase 2 con hidratación UI; agrega Fase 6 completa con string design MPPT por temperatura |
| 2026-05-24 | v1.3 | Agrega Fase 7 completa — WhatsApp: setup Meta Cloud API, 7 plantillas, OTP por WhatsApp en validación de cliente, notificaciones automáticas por cambio de estado, chatbot conversacional con IA cascade, canal interno para admin/instalador, compliance Habeas Data + opt-out, KPIs esperados |
| 2026-05-24 | v1.4 | Marca implementados: sw.js (self.clients + network-first manifest/logo), logout fix, dedupe_key idempotencia save-quote, motor fiscal Ley 1715 (IVA ahorrado + deducción renta 50% + depreciación acelerada), degradación 0.5%/año 25 años, cobertura >100% fix, Habeas Data checkbox (Ley 1581/2012) |
| 2026-05-24 | v1.5 | Fase 6 avanzada: DEPT_PR 33 departamentos + getPR() reemplaza 0.78 constante; aranceles Ley 1715 (5% estimado); UnifileGenerator.jsx RETIE/IEC + layout cliente; TechnicianPortal.jsx + BackOffice asignación técnico + kanban pipeline + CSV export; QuoteTracking layout cliente lazy-load; pdfGenerator.js 15 páginas completo con unifilar, gráfico 25 años, motor fiscal, normativa; string design Voc-frío/Vmp-caliente NEC 690.7; n8n assign-technician + tech-review; schema technicians |
| 2026-05-24 | v1.6 | Sesión marketplace + calidad + seguridad: (1) Portal proveedor B2B completo (SupplierPortal.jsx reescritura ~55KB, supplier.js, App.jsx full-page, 4 workflows n8n supplier-*); (2) +75 ciudades transporte, peso volumétrico, factor km zona, badge AGPE; (3) Memoria Técnica Eléctrica RETIE/CREG automática (memoriaGenerator.js ~1541 líneas, 10 secciones); (4) 95 tests unitarios constants.js; (5) Matching instalador-lead (algoritmo score + tabla installer_matches + BackOffice); (6) Reviews instaladores (installer_reviews, QuoteTracking stars, rating_avg); (7) Validación credenciales RETIE: InstallerReg.jsx selector Ingeniero(diploma+COPNIA)/Técnico(CONTE), upload docs, BackOffice review panel; (8) GitHub Actions CI; (9) Sentry init; (10) api/ deprecated eliminada; (11) Net metering CREG 030/2018 mensual (calcMonthlyNetMetering); (12) DEPT_SOILING 32 deptos + getSoiling() en calcSystem; (13) Rate-limit Postgres save-quote(5/h) + validate-contact(20/h); (14) JWT guard list-quotes; (15) src/services/validation.js compartido; (16) Schema: installer_documents, installer_matches, installer_reviews, suppliers, supplier_stock, purchase_orders, po_items, commissions |

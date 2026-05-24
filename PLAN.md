# PLAN MAESTRO — SolarHub / ALEBAS Ingeniería SAS

> **Versión:** 1.2 · **Fecha:** 24 mayo 2026  
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
- [ ] Generar `dedupe_key UUID` en frontend al iniciar el wizard, mantenerlo en cada retry
- [ ] Schema migration: `ALTER TABLE quotes ADD COLUMN dedupe_key UUID UNIQUE`
- [ ] `save-quote.json`: `INSERT ... ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`
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
- [ ] Eliminar carpeta `api/` (DEPRECATED desde 2026-04-20): auditar logs Railway → `rm -rf api/` → remover bloque dinámico de `server.js` `[RV-4]`
- [ ] `solar-cache.json`: verificar que `schema.sql` tiene `expires_at DEFAULT NOW() + INTERVAL '90 days'`; si no, pasar valor explícito en INSERT `[RV-5]`
- [ ] `solar-cache.json`: agregar logging cuando `continueOnFail` oculta un error real de Postgres (hoy un MISS por error de DB es indistinguible de un MISS normal → golpea Google Solar sin control) `[RV-6]`
- [ ] Fix logout: `localStorage.removeItem('sh:admin')` en lugar de `storage.set('sh:admin', '0')` `[RV-7]`
- [ ] `sw.js:90`: cambiar `clients` a `self.clients.openWindow(...)` `[RV-8]`
- [ ] `sw.js`: marcar `/manifest.json`, `/logo.svg`, `/fluxai-logo.svg` como network-first (hoy son cache-first sin hash → cambios de logo no llegan si no se bumpa SW_VERSION) `[RV-9]`
- [ ] `list-quotes.json`: cambiar `queryReplacement` a sintaxis array `={{ [$json.status, $json.search, $json.limit] }}` `[RV-10]`
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
- [ ] UI Quoter: selector de tipo de usuario — "Estrato 1–6 / Comercial NT1 / Industrial NT2 / Industrial NT3"
- [ ] `calcBudget`: consumir tarifa real desde DB en lugar del promedio hardcoded `720 COP/kWh`
- [ ] Mostrar tarifa usada + fuente + fecha de actualización junto al ROI
- [ ] Impacto en ROI/payback: re-validar (puede variar ±15–30% vs promedio)

### 1.2 Performance Ratio calibrado por región `[AU-ING-2]`
- [ ] Eliminar `PR = 0.78` constante en `calcSystem`
- [ ] Consumir PR estimado de PVGIS/PVWatts por región, tilt, azimuth, temp coefficient
- [ ] Tabla `yield_calibration` en Postgres: `(region, dept, inverter_brand, panel_brand, quarter, expected_kwh_per_kwp, actual_kwh_per_kwp, sample_size, last_updated)`
- [ ] Función `getCalibratedPR(dept, brand)`: usa tabla si N ≥ 10, fallback 0.78
- [ ] UI: badge "PR ajustado por datos reales: 0.81 (47 instalaciones similares)"

### 1.3 Motor fiscal Ley 1715/2014 + Decreto 829/2020 `[AU-ING-3]`
- [ ] Deducción renta 50% sobre valor de la inversión
- [ ] Depreciación acelerada (hasta 5 años, no 20)
- [ ] Exclusión IVA equipos calificados (verificar que ya aplica completa, no solo parcial)
- [ ] Exención arancelaria (arancel 0%) para equipos importados bajo Ley 1715
- [ ] Mostrar en cotización: "Beneficio fiscal total estimado: $X COP" desglosado por rubro
- [ ] Advertencia: para industrial/comercial el beneficio fiscal puede superar el ahorro tarifario en los primeros 5 años

### 1.4 Degradación anual de paneles `[AU-ING-4]`
- [ ] Agregar `panelDegradation: 0.005` (0.5%/año típico) al modelo de proyección
- [ ] Recalcular producción acumulada a 25 años con curva de degradación
- [ ] UI: gráfico de producción anual decreciente vs la línea constante actual
- [ ] Ajustar payback y VPN con degradación incluida

### 1.5 Compliance CREG 174/2021 + 175/2021 `[AU-CREG]`
- [ ] Diferenciación clara AGPE (≤100 kW) vs AGGE (>100 kW) en resultados
- [ ] Informar trámite con OR según tipo (AGPE: ~30 días hábiles, AGGE: proceso más largo)
- [ ] CREG 030/2018: modelar net metering / créditos de energía con resolución mensual
- [ ] Indicar cuándo aplica registro UPME según capacidad
- [ ] Advertir sobre requisitos RETIE 2013 + RETILAP en el diseño entregado

### 1.6 Fixes de cálculo pendientes
- [ ] **Cobertura >100%**: mostrar "(autoconsumo X% + excedentes Y%)" junto al `cov` para que el cliente entienda qué pasa con los excedentes `[RV-BUG-5]`
- [ ] **`specsSource: 'heuristic'`**: marcar y mostrar warning en UI cuando se usa la heurística `pps = floor(700/40)` por falta de specs eléctricas del panel `[RV-BUG-6]`
- [ ] **`solar_panels` JSONB tamaño**: documentar decisión — para techos grandes son ~80 KB/quote; planificar migración a tabla separada `quote_panels` cuando se superen 1.000 quotes/mes `[RV-N-1]`

---

## FASE 2 — Mes 1–2: compliance legal y operacional

### 2.1 Habeas Data Ley 1581/2012 `[AU-SEC-2]`
- [ ] Redactar y publicar política de tratamiento de datos en `solar-hub.co/privacidad`
- [ ] Registrar bases de datos ante SIC (Registro Nacional de Bases de Datos — RNBD)
- [ ] Formulario Quoter paso "Contacto": checkbox **no preseleccionado** de autorización de tratamiento
- [ ] `save-quote.json`: grabar campo `data_consent: {accepted, timestamp, version, ip}` en DB
- [ ] Log de auditoría n8n: registrar quién accedió a qué cotización, cuándo y desde qué IP
- [ ] Política de retención: TTL para datos de leads (ej. 2 años) con proceso de borrado bajo solicitud

### 2.2 Rate-limiting y anti-bot `[RV-SEC]`
- [ ] `validate-contact.json`: rate-limit por IP (N=20/hora)
- [ ] `save-quote.json`: límite N=5 cotizaciones/hora por IP
- [ ] Considerar Cloudflare Turnstile en formularios públicos (Quoter, InstallerReg, SupplierPortal)
- [ ] Timestamp de carga de página en payload: validar `submitTime - pageLoadTime > 3s` como señal anti-bot

### 2.3 Token de seguimiento público `[RV-SEC-2]`
- [ ] `quote-public.json`: agregar `tokenIssuedAt` y rechazar si `now - issued > 90d`
- [ ] Regenerar token cuando la cotización pasa a `ganada` o `perdida`
- [ ] Comparación de token en constant-time (evitar timing attacks)

### 2.4 Formularios con validación client-side `[RV-UX]`
- [ ] Helper compartido de validación email/teléfono para InstallerReg + SupplierPortal
- [ ] Disparar `validate-contact` desde InstallerReg y SupplierPortal antes del submit final
- [ ] Mostrar lista de campos faltantes en rojo (hoy fallan silenciosamente con opacity 0.4)
- [ ] Inputs numéricos: `min="0"` y `max` relevante en todos los formularios

### 2.5 SupplierPortal: PDFs a storage externo `[RV-SEC-3]`
- [ ] Mover upload de PDFs de `localStorage` a endpoint n8n → Postgres bytea o bucket S3/R2 firmado
- [ ] Un solo PDF de 4 MB → 5.4 MB en base64 puede saturar la quota de localStorage (5–10 MB total)

### 2.6 Hidratación y race conditions UI `[RV-RACE]`
- [ ] Flag `hydrated` en App.jsx: bloquear inputs hasta que `useEffect` de localStorage termine
- [ ] Flag `loadsTouched`: cancelar fetch remoto de cargas si el admin ya empezó a editar el catálogo
- [ ] `gMerge` anti-tombstone: `al:panels:tombstones` en localStorage para que panels borrados no reaparezcan al re-hidratarse con `DEFAULT_PANELS`

---

## FASE 3 — Mes 2: madurez técnica y observabilidad

### 3.1 CI/CD real `[AU-OPS-1]`
- [ ] GitHub Actions workflow: lint + build en cada PR (actualmente 0 checks automáticos)
- [ ] Tests unitarios de funciones de cálculo (`calcSystem`, `calcBudget`, `selectCompatibleInverter`)
- [ ] Ambiente de staging: rama `staging` → deploy Vercel preview fijo con datos de prueba
- [ ] Estrategia de rollback: tags de release + revert documentado, o feature flags para cambios de riesgo

### 3.2 Testing `[AU-OPS-2]`
- [ ] Suite de tests para lógica solar crítica — cobertura ≥ 80% de `constants.js`
- [ ] Tests de integración n8n: mock de Postgres, validar que flows devuelven schema correcto
- [ ] Tests E2E básicos (Playwright): happy path cotizador completo + submit + email confirmación

### 3.3 Observabilidad `[AU-OPS-3]`
- [ ] Integrar Sentry (o Logtail) para errores frontend en producción
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
- [ ] Algoritmo de matching: departamento + capacidad certificada (kWp/mes) + RETIE vigente + rating
- [ ] `InstallerReg`: agregar campos de cobertura geográfica, capacidad máxima (kWp/mes), tipos de sistema que instala
- [ ] Tabla `installer_matches` en Postgres: `(quote_id, installer_id, score, status, assigned_at)`
- [ ] Notificación email al instalador cuando hay lead nuevo en su zona (workflow n8n)
- [ ] BackOffice: vista de asignación + seguimiento de leads por instalador

### 4.2 Reviews y reputación `[AU-MKT-2]`
- [ ] Tabla `installer_reviews`: `(installer_id, quote_id, rating 1–5, comment, verified, created_at)`
- [ ] Solo clientes con cotización en estado `ganada` + instalación confirmada pueden dejar review
- [ ] `QuoteTracking.jsx`: formulario de review post-instalación (aparece 30 días después de `ganada`)
- [ ] Perfil público del instalador: rating promedio, número de instalaciones, departamentos cubiertos

### 4.3 Contratos digitales `[AU-MKT-3]`
- [ ] Integrar firma electrónica certificada (Certicámara Colombia / Firma Virtual / DocuSign)
- [ ] Template de contrato de instalación con todos los campos del cotizador
- [ ] Workflow n8n: generar contrato PDF firmable cuando cotización → `aprobada`
- [ ] Guardar contrato firmado en storage + link permanente en la cotización

### 4.4 Pagos / Escrow `[AU-MKT-4]`
- [ ] Definir modelo de negocio: ¿comisión por lead? ¿porcentaje de la instalación? ¿suscripción instalador?
- [ ] Integrar PSP colombiano (PayU / ePayco) para pagos en COP
- [ ] Flujo de escrow: 50% al firmar contrato, 50% al completar instalación con foto + firma del cliente

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
- [ ] Generar diagrama unifilar (SVG) a partir de la configuración: paneles → string boxes → inversor → protecciones → medidor → red
- [ ] Especificaciones por componente: capacidad de fusibles, calibre de cable, rating de breakers
- [ ] Simbología RETIE Colombia (NTC 1340) — validado con ingeniero eléctrico
- [ ] Para AGPE: incluir punto de conexión a la red del OR y medidor bidireccional
- [ ] Vista previa en el cotizador y exportado dentro del PDF

### 6.2 Análisis de sombreado hora por hora
- [ ] Usar `SunPathDiagram.jsx` (ya existe) + obstáculos del techo identificados en Google Solar
- [ ] Calcular factor de sombreado mensual por posición real de cada panel (no factor genérico)
- [ ] Integrar con `validateLayout()` para corregir la producción estimada
- [ ] Mostrar "pérdidas estimadas por sombreado: X% (Y kWh/año)"

### 6.3 Propuesta comercial PDF de nivel profesional
- [ ] Rediseñar PDF: de ~5 páginas actuales a ~15–20 páginas (estilo Aurora Solar / OpenSolar)
- [ ] Secciones: resumen ejecutivo · especificaciones técnicas · layout del techo con paneles reales · plano unifilar · análisis financiero 25 años con degradación · beneficio fiscal Ley 1715 · normativa aplicable (CREG, RETIE) · perfil del instalador asignado
- [ ] Tabla mes a mes: producción esperada, ahorro en factura, flujo de caja acumulado
- [ ] Gráfico comparativo: factura con sistema vs sin sistema mes a mes durante 25 años
- [ ] Versión ejecutiva de 2 páginas para presentar a financiadores o juntas directivas

### 6.4 CRM con pipeline de ventas
- [ ] Pipeline: `nueva` → `en_contacto` → `propuesta_enviada` → `en_negociación` → `aprobada` → `en_instalación` → `ganada` → `perdida`
- [ ] BackOffice: vista kanban o tabla con filtros por estado, instalador, departamento, potencia (kWp)
- [ ] Automatización: recordatorio por email si un lead lleva >7 días sin actividad
- [ ] Métricas: tasa conversión por etapa, tiempo promedio de ciclo de venta, valor promedio por departamento y tipo de proyecto

### 6.5 String design con validación MPPT + temperatura
- [ ] Extender `validateLayout()` para múltiples strings en paralelo con distintas orientaciones
- [ ] Voc corregido por temperatura mínima del sitio (datos NASA POWER ya disponibles en n8n)
- [ ] Vmp validado dentro del rango MPPT en temperatura máxima
- [ ] Advertencia explícita si cualquier string queda fuera de la ventana MPPT del inversor
- [ ] Output claro: "String 1: 10 paneles · Voc=420 V · Vmp=352 V ✅ dentro de MPPT 200–480 V"

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

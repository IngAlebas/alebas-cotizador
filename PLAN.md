# PLAN MAESTRO — SolarHub / ALEBAS Ingeniería SAS

> **Versión:** 1.0 · **Fecha:** 24 mayo 2026  
> **Autor del plan:** Claude Code (Opus 4.7) — consolida AUDIT.md + REVIEW.md + ROADMAP-FLUXAI.md + sesiones de desarrollo  
> **Repo:** `github.com/IngAlebas/alebas-cotizador` · rama `main`  
> **Deploy:** `solar-hub.co` via Vercel · Backend: `api.solar-hub.co` via Railway n8n  

> **Cómo usar este documento:**  
> Cada ítem tiene checkbox `[ ]` → marcar `[x]` cuando se complete.  
> El número entre corchetes `[RV-X]` referencia el item original en REVIEW.md.  
> El número `[AU-X]` referencia AUDIT.md. `[FL-X]` referencia ROADMAP-FLUXAI.md.

---

## Benchmark competitivo

> **Objetivo a 6 meses:** igualar **OpenSolar** (estándar global gratuito, principal competidor en LATAM)  
> **Objetivo a 12 meses:** superar OpenSolar en Colombia con diferenciadores locales únicos

| Software | Mercado | Precio | Posición vs SolarHub |
|---|---|---|---|
| **Aurora Solar** | USA | $800-2.000/mes | Referencia premium; inalcanzable en precio, alcanzable en funciones clave |
| **OpenSolar** | Global / LATAM | Gratis | **Benchmark principal** — igualar en 6 meses |
| **PVsyst** | Global (ingenieros) | €1.500/año | Estándar de simulación — igualar en precisión de cálculo (Fase 1) |
| **Helioscope** | USA / LATAM | ~$150/mes | Referencia para proyectos comerciales y string design |
| **SAM (NREL)** | Global | Gratis | Referencia técnica — nuestros números deben alinearse con los suyos |
| **Excel del instalador** | Colombia | Gratis | Hoy el 70% usa Excel — SolarHub ya gana aquí |

### Ventajas diferenciales de SolarHub (que ningún competidor tiene para Colombia)
1. **Compliance CREG 174/2021 + Ley 1715 nativo** — ningún software extranjero lo modela
2. **Motor fiscal colombiano** (deducción renta 50%, depreciación acelerada, aranceles 0%)
3. **Integración FluxAI** — monitoreo post-venta enlazado con la cotización original
4. **Tarifas OR reales** por operador + estrato (XM + CREG)
5. **Marketplace RETIE** — instaladores certificados en Colombia

### Brechas críticas para igualar OpenSolar
- Plano unifilar eléctrico generado automáticamente (permit-ready)
- Análisis de sombreado hora por hora (hoy es factor genérico)
- Propuesta comercial PDF de nivel profesional (~15-20 páginas con análisis financiero completo)
- CRM con pipeline de ventas (lead → propuesta → aprobada → instalada → monitoreada)
- String design con validación MPPT detallada

---

## Estado global del producto

| Área | Madurez actual | Meta |
|---|---|---|
| Cotización rápida (lead-gen) | 80% | 95% |
| Visualización solar (mapa, heatmap) | 90% | 95% |
| Persistencia y CRM | 60% | 80% |
| IA recomendadora (cascade) | 70% | 90% |
| Compliance regulatorio CREG/Ley 1715 | 20% | 80% |
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
- [ ] `list-quotes`: agregar validación JWT (`x-admin-token`), rechazar 401 sin token válido
- [ ] `update-quote`: ídem
- [ ] Sacar `REACT_APP_N8N_TOKEN` del bundle (dejar solo para webhooks públicos)
- [ ] Webhooks públicos (save-quote, validate-contact): validar por origen + rate-limit, no por token

### 0.3 Idempotencia `save-quote` `[RV-3]`
- [ ] Agregar `dedupe_key UUID` al frontend: generar al iniciar el wizard, mantener en retries
- [ ] Schema migration: `ALTER TABLE quotes ADD COLUMN dedupe_key UUID UNIQUE`
- [ ] `save-quote.json`: `INSERT ... ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`
- [ ] Test: doble-click en "Solicitar cotización" no genera dos rows

### 0.4 Activar IA cascade en producción
- [ ] Railway → servicio n8n → Variables: `GROQ_API_KEY=gsk_…`
- [ ] Railway → servicio n8n → Variables: `GOOGLE_AI_KEY=AIza…`
- [ ] Railway → servicio n8n → Variables: `ANTHROPIC_API_KEY=sk-ant-…`
- [ ] Railway → servicio n8n → Variables: `N8N_RUNNERS_TASK_RUNNER_ALLOWED_ENV=GROQ_API_KEY,GOOGLE_AI_KEY,ANTHROPIC_API_KEY`
- [ ] Reimportar `n8n/ai-recommend.json` (versión con cascade RD-1..RD-8)
- [ ] Mergear PR [#164](https://github.com/IngAlebas/alebas-cotizador/pull/164) → deploy a producción
- [ ] Verificar cascade: desactivar Groq → debe caer a Gemini; desactivar ambos → Claude

### 0.5 Limpiar deuda técnica inmediata `[RV-4]`
- [ ] Eliminar carpeta `api/` (DEPRECATED desde 2026-04-20): auditar logs Railway → `rm -rf api/` → remover bloque dinámico de `server.js`
- [ ] `solar-cache.json`: verificar que `schema.sql` tiene `expires_at DEFAULT NOW() + INTERVAL '90 days'`; si falta, pasar valor explícito en INSERT
- [ ] Fix logout: `localStorage.removeItem('sh:admin')` en lugar de `storage.set('sh:admin', '0')`
- [ ] `sw.js:90`: cambiar `clients` a `self.clients.openWindow(...)` por consistencia
- [ ] `list-quotes.json`: cambiar `queryReplacement` a sintaxis array `={{ [$json.status, $json.search, $json.limit] }}`

---

## FASE 1 — Alta prioridad: rigor de ingeniería solar
> **Plazo objetivo:** mes 1 · Define si el cotizador es confiable o solo visual

### 1.1 Tarifa CREG real por estrato y operador `[AU-ING-1]`
- [ ] Activar workflow `tarifas-sync.json` en n8n con cron mensual
- [ ] Poblar DB con componentes reales G+T+D+C+P+R por operador (fuente: CREG / XM)
- [ ] UI Quoter: selector "Estrato residencial 1-6 / Comercial NT1 / Industrial NT2 / Industrial NT3"
- [ ] `calcBudget`: consumir tarifa real desde DB en lugar del promedio hardcoded `720 COP/kWh`
- [ ] Mostrar al cliente la tarifa usada y su fuente + fecha de actualización
- [ ] Impacto en ROI/payback: re-validar con tarifas reales (puede variar ±15-30%)

### 1.2 Performance Ratio calibrado por región `[AU-ING-2]`
- [ ] Eliminar `PR = 0.78` constante en `calcSystem`
- [ ] Integrar PVGIS/PVWatts para obtener PR estimado por región, tilt, azimuth, temp coefficient
- [ ] Tabla `yield_calibration` en Postgres: `(region, dept, inverter_brand, panel_brand, quarter, expected_kwh_per_kwp, actual_kwh_per_kwp, sample_size)`
- [ ] Función `getCalibratedPR(dept, brand)`: usa tabla si N ≥ 10, cae a 0.78 si no hay datos
- [ ] UI: mostrar "PR ajustado por datos reales: 0.81 (47 instalaciones similares)" cuando exista calibración

### 1.3 Motor fiscal Ley 1715/2014 `[AU-ING-3]`
- [ ] Implementar cálculo de deducción renta 50% (Decreto 829/2020)
- [ ] Depreciación acelerada (hasta 5 años, no 20)
- [ ] Exclusión IVA equipos calificados (ya existe parcialmente — verificar)
- [ ] Exención arancelaria (arancel 0%) para equipos importados
- [ ] Mostrar en cotización: "Beneficio fiscal total estimado: $X COP" desglosado
- [ ] Nota: para industrial/comercial el beneficio fiscal puede superar el ahorro tarifario

### 1.4 Degradación anual de paneles `[AU-ING-4]`
- [ ] Agregar `panelDegradation: 0.005` (0.5%/año típico) al modelo de proyección
- [ ] Recalcular producción acumulada a 25 años con curva de degradación real
- [ ] UI: gráfico de producción anual decreciente vs producción constante actual
- [ ] Ajustar payback y VPN con degradación incluida

### 1.5 Fixes de cálculo existentes `[RV-BUG]`
- [ ] **kgTotal**: reemplazar `invKw` por `invObj.kg ?? 20` en `constants.js:638-642` `[RV-BUG-1]`
- [ ] **IVA doble transporte**: excluir `transport` de base imponible `[RV-BUG-2]`
- [ ] **Cobertura >100%**: mostrar "(autoconsumo X% + excedentes Y%)" junto al `cov` cuando supere 100% `[RV-BUG-3]`
- [ ] **`specsSource: 'heuristic'`**: marcar y mostrar warning en UI cuando se usa heurística de pps `[RV-BUG-4]`

### 1.6 Compliance CREG 174/2021 + 175/2021 `[AU-CREG]`
- [ ] Diferenciación AGPE (≤100 kW) vs AGGE (>100 kW) en resultados
- [ ] Informar trámite con OR según tipo (AGPE: 30d hábiles, AGGE: proceso más largo)
- [ ] CREG 030/2018: modelar net metering / créditos de energía con resolución mensual
- [ ] Indicar cuándo aplica registro UPME

---

## FASE 2 — Mes 1-2: compliance legal y operacional

### 2.1 Habeas Data Ley 1581/2012 `[AU-SEC-2]`
- [ ] Redactar y publicar política de tratamiento de datos en `solar-hub.co/privacidad`
- [ ] Registrar bases de datos ante SIC (RNBD)
- [ ] Formulario Quoter "Contacto": checkbox **no preseleccionado** de autorización de tratamiento
- [ ] `save-quote.json`: grabar campo `data_consent: {accepted, timestamp, version}` en DB
- [ ] Log de auditoría n8n: registrar quién accedió a qué cotización y cuándo
- [ ] Política de retención: definir TTL para datos de leads (ej. 2 años)

### 2.2 Rate-limiting y anti-bot `[RV-SEC]`
- [ ] `validate-contact.json`: agregar rate-limit por IP (N=20/hora desde misma IP)
- [ ] `save-quote.json`: límite de cotizaciones por IP (N=5/hora)
- [ ] Considerar Cloudflare Turnstile en formularios públicos (Quoter, InstallerReg, SupplierPortal)
- [ ] Honeypot: agregar campo de timestamp de carga de página + validar `submitTime - pageLoadTime > 3s`

### 2.3 Token de seguimiento público `[RV-SEC-2]`
- [ ] `quote-public.json`: agregar `tokenIssuedAt` y rechazar si `now - issued > 90d`
- [ ] Regenerar token cuando la cotización pasa a estado `ganada` o `perdida`
- [ ] Cambiar comparación de token a constant-time (evitar timing attacks)

### 2.4 Formularios con validación client-side `[RV-UX]`
- [ ] Helper compartido de validación email/teléfono para InstallerReg + SupplierPortal
- [ ] Disparar `validate-contact` desde InstallerReg y SupplierPortal antes del submit
- [ ] Mostrar lista de campos faltantes en rojo (no silencio silencioso) `[RV-UX-1]`
- [ ] Inputs numéricos: agregar `min="0"` / `max` relevante

### 2.5 SupplierPortal: PDF a storage externo `[RV-SEC-3]`
- [ ] Mover upload de PDFs de `localStorage` a endpoint n8n → Postgres bytea o bucket S3/R2
- [ ] Límite: hoy un solo PDF (4 MB → 5.4 MB base64) puede saturar la quota de localStorage

---

## FASE 3 — Mes 2: madurez técnica y observabilidad

### 3.1 CI/CD real `[AU-OPS-1]`
- [ ] GitHub Actions workflow: lint + build en cada PR
- [ ] Tests unitarios de funciones de cálculo (`calcSystem`, `calcBudget`, `selectCompatibleInverter`)
- [ ] Ambiente de staging (rama `staging` → deploy Vercel preview fijo)
- [ ] Estrategia de rollback documentada (feature flags o tag + revert)

### 3.2 Testing `[AU-OPS-2]`
- [ ] Suite de tests para lógica solar crítica (PR = cobertura ≥ 80% de `constants.js`)
- [ ] Tests de integración n8n (mock de Postgres, validar flows)
- [ ] Tests E2E básicos (Playwright): happy path cotizador + submit

### 3.3 Observabilidad `[AU-OPS-3]`
- [ ] Integrar Sentry (o Logtail) para errores frontend
- [ ] n8n: logging de ejecuciones a tabla `n8n_executions_log` (workflow + duración + error)
- [ ] Alertas: notificación si cascade IA falla todos los proveedores, si cache hit-rate < 30%
- [ ] Dashboard métricas: cotizaciones/día, tasa de conversión lead→ganada, usuarios activos

### 3.4 Hidratación y race conditions UI `[RV-RACE]`
- [ ] Flag `hydrated` en App.jsx: bloquear inputs hasta que localStorage termine de cargarse
- [ ] Flag `loadsTouched`: cancelar fetch de cargas si el admin ya editó el catálogo
- [ ] `gMerge` anti-tombstone: `al:panels:tombstones` para que panels borrados no reaparezcan

### 3.5 Migración CRA → Vite `[AU-OPS-4]`
- [ ] CRA está en maintenance mode desde 2023 — planificar migración a Vite
- [ ] Validar compatibilidad de todos los imports (CSS modules, SVG, etc.)
- [ ] Migrar cuando CI/CD esté activo (para validar que build no rompe)

### 3.6 Backups Postgres `[AU-OPS-5]`
- [ ] Configurar backups automáticos diarios en Railway Postgres
- [ ] Política de retención: 30 días de backups
- [ ] Probar restore: documentar procedimiento

---

## FASE 4 — Mes 2-4: marketplace real

### 4.1 Matching instalador ↔ lead `[AU-MKT-1]`
- [ ] Algoritmo de matching: región (depto) + capacidad del instalador (kWp certificados) + RETIE vigente + rating
- [ ] `InstallerReg`: agregar campos de cobertura geográfica, capacidad máxima (kWp/mes), tipo de sistema
- [ ] Tabla `installer_matches` en Postgres: (quote_id, installer_id, score, status, assigned_at)
- [ ] Notificación al instalador cuando hay un lead en su zona (email via n8n)
- [ ] BackOffice: vista de asignación y seguimiento de leads por instalador

### 4.2 Reviews y reputación `[AU-MKT-2]`
- [ ] Tabla `installer_reviews`: (installer_id, quote_id, rating 1-5, comment, verified)
- [ ] Solo clientes con cotización `ganada` pueden dejar review
- [ ] `QuoteTracking.jsx`: formulario de review post-instalación
- [ ] Mostrar rating en perfil público de instalador

### 4.3 Contratos digitales `[AU-MKT-3]`
- [ ] Integrar firma electrónica certificada (DocuSign / Firma Virtual / Certicámara Colombia)
- [ ] Template de contrato de instalación solar con todos los campos del cotizador
- [ ] Workflow n8n: generar contrato PDF firmable cuando cotización → `aprobada`
- [ ] Guardar contrato firmado en storage + link en cotización

### 4.4 Pagos / Escrow `[AU-MKT-4]`
- [ ] Definir modelo: ¿comisión por lead? ¿escrow por instalación?
- [ ] Integrar PSP colombiano (PayU / ePayco) para pagos en COP
- [ ] Workflow de release de fondos por hitos (50% firma contrato, 50% instalación completada)

---

## FASE 5 — Mes 3-6: integración FluxAI

### 5.1 Capa 1 — Datos compartidos `[FL-1]`
- [ ] Migración SolarHub Postgres: `quotes.flux_client_id UUID NULL`, `quotes.flux_installation_id UUID NULL`, `quotes.handoff_at TIMESTAMPTZ NULL`
- [ ] Migración FluxAI Postgres: `clients.solarhub_quote_id UUID UNIQUE`, `installations.solarhub_quote_snapshot JSONB`
- [ ] Workflow `n8n/provision-monitoring.json`: trigger en `update-quote` cuando status → `ganada`
- [ ] Endpoint FluxAI: `POST /api/v1/integrations/solarhub/handoff` con payload firmado
- [ ] n8n actualiza `quotes` con `flux_client_id` + `flux_installation_id` recibidos
- [ ] Test E2E: cotización → ganada → existe en FluxAI con snapshot correcto
- [ ] **Prerequisito:** Fase 0.1 (auth admin real antes de firmar requests cross-app)

### 5.2 Capa 2 — Provisionamiento de equipos `[FL-2]`
- [ ] Tabla FluxAI `equipment_catalog`: `(brand, model, sku, data_frame, mqtt_topic_template, mppt_count, max_string_voltage, kg)` poblada desde CEC de SolarHub
- [ ] Mapeo de los 8 inversores `DEFAULT_INVERTERS` con sus data-frames FluxAI
- [ ] Endpoint FluxAI: `POST /api/v1/installations/{id}/provision` → devuelve credenciales MQTT por-equipo
- [ ] Workflow `n8n/provision-device.json`: valida RETIE del instalador antes de devolver credenciales MQTT
- [ ] Credenciales MQTT: almacenadas en `installations.mqtt_credentials_encrypted`, nunca en localStorage
- [ ] **Prerequisito:** Capa 1 activa

### 5.3 Capa 3 — Telemetría calibra cotizador `[FL-3]`
- [ ] Tabla SolarHub `yield_calibration`: `(region, dept, inverter_brand, panel_brand, quarter, expected_kwh_per_kwp, actual_kwh_per_kwp, sample_size, last_updated)`
- [ ] Endpoint FluxAI: `GET /api/v1/integrations/solarhub/yield-aggregates` con auth de servicio
- [ ] Workflow `n8n/sync-yield.json`: cron semanal → agrega datos FluxAI → escribe `yield_calibration`
- [ ] `getCalibratedPR(dept, brand)`: usa tabla si N ≥ 10 instalaciones; fallback 0.78
- [ ] UI Quoter: badge "PR calibrado por datos reales: 0.81 (47 instalaciones)"
- [ ] **Prerequisito:** Capas 1+2 activas + mínimo 10 instalaciones monitoreadas

### 5.4 Capa 4 — SSO cross-app `[FL-4]`
- [ ] Endpoint FluxAI: `POST /api/v1/integrations/solarhub/sso-link` → URL corta con JWT TTL ≤ 60s
- [ ] `SolarHubSsoController` en FluxAI: valida JWT, crea sesión Jetstream, redirige al dashboard
- [ ] BackOffice: botón "Ver monitoreo en FluxAI →" en cotizaciones ganadas
- [ ] Log auditoría en ambos sistemas: quién solicitó SSO, cuándo, para qué cliente
- [ ] **Prerequisito:** Fase 0.1 (auth real) + Capa 1

### 5.5 Capa 5 — Habeas Data en handoff `[FL-5]`
- [ ] Checkbox consentimiento en Quoter: "Autorizo transferir mis datos a FluxAI para monitoreo"
- [ ] `save-quote`: grabar `flux_consent: {accepted, timestamp, version}`
- [ ] Política de privacidad actualizada: menciona FluxAI como receptor de datos
- [ ] Workflow handoff Capa 1: solo transferir datos si `flux_consent.accepted = true`
- [ ] **Prerequisito:** Fase 2.1 (Habeas Data base) + Capa 1

---

## FASE 6 — Igualar OpenSolar: outputs de nivel profesional
> **Plazo objetivo:** mes 3-4 · Esto eleva SolarHub de "cotizador" a "software solar profesional"

### 6.1 Plano unifilar eléctrico automático
- [ ] Generar diagrama unifilar (SVG o canvas) basado en la configuración del sistema: paneles → string boxes → inversor → protecciones → medidor → red
- [ ] Mostrar en el cotizador como vista previa y exportar en el PDF
- [ ] Incluir especificaciones de cada componente (fusibles, breakers, calibre de cable)
- [ ] Cumplir simbología RETIE Colombia (NTC 1340)
- [ ] Para AGPE: mostrar punto de conexión a la red del OR

### 6.2 Análisis de sombreado hora por hora
- [ ] Usar `SunPathDiagram.jsx` (ya existe) + datos de obstáculos del techo de Google Solar
- [ ] Calcular factor de sombreado mensual (no genérico) por posición de cada panel
- [ ] Integrar con `calculateLayout()` para ajustar producción estimada por sombreado real
- [ ] Mostrar "pérdidas por sombreado estimadas: X% (Y kWh/año)"

### 6.3 Propuesta comercial PDF de nivel profesional
- [ ] Rediseñar PDF de ~5 páginas actuales a ~15-20 páginas estilo Aurora Solar / OpenSolar
- [ ] Incluir: resumen ejecutivo, especificaciones técnicas, análisis financiero 25 años, plano unifilar, renders del techo con paneles, normativa aplicable, perfil del instalador
- [ ] Tabla de producción anual con degradación mes a mes
- [ ] Gráfico comparativo "con sistema / sin sistema" en factura
- [ ] Motor fiscal Ley 1715: sección dedicada con cifras (deducción renta + depreciación + IVA)
- [ ] Versión ejecutiva (2 páginas) para presentar a financiadores

### 6.4 CRM con pipeline de ventas
- [ ] Estados del pipeline: `nueva` → `en_contacto` → `propuesta_enviada` → `en_negociación` → `aprobada` → `en_instalación` → `ganada` → `perdida`
- [ ] BackOffice: vista kanban o tabla con filtros por estado, instalador, departamento, potencia
- [ ] Automatización: recordatorio si lead lleva >7 días sin actividad
- [ ] Métricas: tasa de conversión por etapa, tiempo promedio de ciclo de venta, valor promedio por departamento

### 6.5 String design con validación MPPT completa
- [ ] Extender `validateLayout()` para calcular múltiples strings en paralelo con diferentes orientaciones
- [ ] Validar temperatura: Voc corregido por temp mínima de sitio (datos NASA POWER ya disponibles)
- [ ] Validar Vmp en temperatura máxima dentro del rango MPPT
- [ ] Mostrar advertencia si string está fuera de ventana MPPT del inversor seleccionado
- [ ] Output: "String 1: 10 paneles · Voc=420V · Vmp=352V ✅ dentro de MPPT 200-480V"

---

## Backlog / ideas futuras (sin fecha)

- **Soiling regional**: factor de suciedad por estación (Caribe seco vs Andes lluvioso)
- **Seguimiento post-venta**: encuesta de satisfacción a 30/90/365 días
- **API pública para integradores**: instaladores consultan el motor de cálculo desde sus propias apps
- **Multi-idioma**: inglés para proyectos industriales con inversión extranjera
- **Financiamiento solar**: integrar PSP + opciones leasing/crédito solar (Bancóldex, banca verde)
- **App móvil nativa**: React Native reutilizando lógica de `constants.js`
- **Migración CRA → Vite** (ver Fase 3.5)
- **LIDAR del techo**: reemplazar Google Solar con LIDAR propio para mayor precisión en sombreado (largo plazo)

---

## Registro de cambios del plan

| Fecha | Versión | Qué cambió |
|---|---|---|
| 2026-05-24 | v1.0 | Creación del plan maestro unificado (consolida AUDIT.md + REVIEW.md + ROADMAP-FLUXAI.md + sesiones de desarrollo) |
| 2026-05-24 | v1.1 | Agrega benchmark competitivo vs Aurora Solar / OpenSolar / PVsyst. Agrega Fase 6 (outputs nivel profesional): unifilar automático, sombreado hora a hora, PDF premium, CRM pipeline, string design MPPT |

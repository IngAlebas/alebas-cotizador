# Roadmap — Integración SolarHub ↔ FluxAI

> **Estado actual (2026-05-07):** la integración **no está implementada en código**. Solo existe co-branding (`public/fluxai-logo.svg`). Despliegue paralelo en Railway no es integración funcional.
>
> **Objetivo:** convertir SolarHub (lead-gen / cotización) y FluxAI (`app.fluxai.solutions`, monitoreo IoT con Laravel + MQTT) en un flujo continuo: cotización → instalación → monitoreo → calibración del cotizador.
>
> Este documento define las **5 capas** de la integración como criterios de aceptación. Hasta que las 5 estén verdes, la integración no está hecha — independiente de lo que diga el branding.

---

## Capa 1 — Datos compartidos (link entre dominios)

**Criterio de aceptación:** una cotización en SolarHub que pase a estado `ganada` queda enlazada con un cliente y una instalación en FluxAI, y ambos lados pueden recuperarse vía ID estable.

**Deliverables:**
- [ ] Migración en SolarHub Postgres: agregar `quotes.flux_client_id UUID NULL`, `quotes.flux_installation_id UUID NULL`, `quotes.handoff_at TIMESTAMPTZ NULL`.
- [ ] Migración en FluxAI Postgres: agregar `clients.solarhub_quote_id UUID NULL UNIQUE`, `installations.solarhub_quote_snapshot JSONB NULL` (con kWp, panel SKU, inverter SKU, baterías, depto).
- [ ] Workflow nuevo `n8n/provision-monitoring.json`: trigger en `update-quote` cuando `status` cambia a `ganada` → POST a FluxAI `/api/v1/integrations/solarhub/handoff` con payload firmado.
- [ ] Endpoint en FluxAI Laravel: `POST /api/v1/integrations/solarhub/handoff` que crea/actualiza `client` y `installation`, devuelve `flux_client_id` + `flux_installation_id`.
- [ ] n8n recibe la respuesta y actualiza `quotes` en SolarHub Postgres con los IDs.
- [ ] Test E2E: crear cotización → marcarla ganada → verificar que existe en FluxAI con el snapshot correcto.

**Bloqueado por:** `update-quote.json` ya existe y maneja cambios de estado. Falta el hook al cambio `→ ganada`. Schema migrations en ambos repos.

---

## Capa 2 — Provisionamiento de equipos (catálogo cruzado)

**Criterio de aceptación:** cuando un instalador despliega físicamente el inversor / medidor en sitio, FluxAI sabe **automáticamente** qué data-frame Modbus/SunSpec aplicar, sin re-configurar el equipo en dos sistemas.

**Deliverables:**
- [ ] Tabla en FluxAI Postgres: `equipment_catalog` con `(brand, model, sku, data_frame, mqtt_topic_template, mppt_count, max_string_voltage, kg)`. Poblada desde el catálogo CEC de SolarHub (extender el seed `n8n/seed/load-cec.js`).
- [ ] Mapeo verificado de los 8 inversores de `DEFAULT_INVERTERS` en `src/constants.js` con sus data-frames en `/config/data-frame-*.php` de FluxAI.
- [ ] Endpoint FluxAI: `POST /api/v1/installations/{id}/provision` que recibe `{inverter_serial, meter_serial, mqtt_credentials_request: true}` y devuelve credenciales MQTT (usuario/password) generadas para el broker Mosquitto.
- [ ] Workflow n8n `provision-device.json` que SolarHub dispara cuando el instalador confirma instalación, con validación RETIE del cert del instalador antes de devolver credenciales.
- [ ] Rotación: las credenciales MQTT son por-equipo (no globales) y el workflow las graba en `installations.mqtt_credentials_encrypted` (no en localStorage del frontend).
- [ ] Test: instalar Growatt MIN 5000TL-XH → FluxAI recibe MQTT en `v1/mc/data/{installation_id}` con frame correctamente parseado.

**Bloqueado por:** Capa 1 + decisión de qué inversor/medidor físico es la línea base (Growatt ShineLink? Solis CloudPro? MQTT directo?).

**Riesgo crítico:** sin esto, cada instalación es un dolor manual y los datos no llegan al monitoreo — el cliente paga FluxAI y no ve nada.

---

## Capa 3 — Telemetría retroalimentando al cotizador (calibración)

**Criterio de aceptación:** SolarHub aprende del rendimiento real. El `Performance Ratio = 0.78` constante (que es un guess) se reemplaza por valor calibrado por región, marca de inversor y trimestre, basado en datos reales de FluxAI.

**Deliverables:**
- [ ] Tabla en SolarHub Postgres: `yield_calibration` con `(region, dept, inverter_brand, panel_brand, quarter, expected_kwh_per_kwp, actual_kwh_per_kwp, sample_size_installations, last_updated)`.
- [ ] Workflow n8n `sync-yield.json`: trigger semanal/mensual, lee de FluxAI `monthly_consumption` (la tabla que el comando `average:monthly-consumption` mantiene), agrega por región + inverter brand, escribe en `yield_calibration`.
- [ ] Endpoint FluxAI: `GET /api/v1/integrations/solarhub/yield-aggregates?region=Meta&inverter_brand=Growatt&from=2026-Q1` con auth de servicio.
- [ ] `src/constants.js` función `getCalibratedPR(dept, brand)` que consulta `yield_calibration` (vía workflow `n8n/get-calibration.json`) y cae al 0.78 si no hay datos suficientes (N < 10 instalaciones).
- [ ] UI: en el resultado del cotizador, mostrar "PR ajustado por datos reales: 0.81 (basado en 47 instalaciones similares)" cuando exista calibración. Aumenta confianza del cliente.

**Bloqueado por:** Capa 1 + 2 funcionando con al menos 10-20 instalaciones de muestra. Sin volumen, esta capa no aporta — pero hay que diseñarla desde el día 1 para acumular el dataset.

---

## Capa 4 — Sesión compartida (UX cross-app)

**Criterio de aceptación:** el cliente final accede a su monitoreo en FluxAI desde el back office de SolarHub con un solo click, sin re-loguear, y la sesión es trazable.

**Deliverables:**
- [ ] Endpoint FluxAI: `POST /api/v1/integrations/solarhub/sso-link` recibe `flux_client_id` + un JWT firmado por SolarHub (clave compartida vía secret manager, **no en bundle**), devuelve URL `https://app.fluxai.solutions/auth/sh-sso?token=<short-lived-jwt>` con TTL ≤ 60s.
- [ ] Servicio FluxAI Laravel `SolarHubSsoController` que valida el JWT, mete al cliente en sesión Jetstream y redirige a su dashboard.
- [ ] Botón en `BackOffice.jsx` (vista de cotización ganada): "Ver monitoreo en FluxAI →" que llama al endpoint y abre la URL en nueva pestaña.
- [ ] Log de auditoría en ambos lados: SolarHub registra "admin X solicitó SSO de cliente Y a las T", FluxAI registra "sesión SSO recibida de SolarHub para cliente Y a las T". Tabla `sso_audit` en ambos.
- [ ] Acceso con login propio del cliente en `app.fluxai.solutions` también debe funcionar (el SSO es shortcut admin, no la única vía).

**Bloqueado por:** Capa 1. Y por **el bloqueante #1 del REVIEW.md**: el admin de SolarHub debe tener auth real (no `btoa`) antes de que pueda firmar JWTs cross-app, sino el SSO es seguridad teatral.

---

## Capa 5 — Compliance Habeas Data en handoff

**Criterio de aceptación:** la transferencia de datos personales de SolarHub a FluxAI cumple Ley 1581/2012 + Decreto 1377/2013, con consentimiento explícito y registro auditable.

**Deliverables:**
- [ ] Cláusula de consentimiento en el formulario de cotización (`Quoter.jsx` paso "Contacto"): checkbox **no preseleccionado** "Autorizo a ALEBAS Ingeniería SAS a transferir mis datos personales a FluxAI (`app.fluxai.solutions`) para el monitoreo de mi sistema solar, conforme a la política de tratamiento publicada en `solar-hub.co/privacidad`."
- [ ] Política de tratamiento publicada en `solar-hub.co/privacidad` y `app.fluxai.solutions/privacidad` con: finalidades, datos transferidos, encargado (FluxAI), derechos ARCO, contacto del oficial de protección de datos de ALEBAS.
- [ ] Registro de tratamiento ante SIC (Superintendencia de Industria y Comercio) presentado y aprobado.
- [ ] Tabla `data_transfers_log` en SolarHub Postgres: `(quote_id, transferred_at, fields_transferred, consent_at, consent_ip, target_app)`. Se llena en cada handoff.
- [ ] Botón "Ejercer derechos ARCO" en ambos sitios + workflow para procesar solicitudes de eliminación, rectificación, etc., con SLA documentado (15 días hábiles legales).
- [ ] Cláusula en el contrato de servicio FluxAI ↔ ALEBAS reconociendo a FluxAI como Encargado del Tratamiento (no Responsable) y obligaciones de confidencialidad / borrado al fin del contrato.

**Bloqueado por:** asesor legal (NO software). Pero la implementación técnica (checkbox, log, política HTML) puede empezar en paralelo con el legal review.

**Riesgo si se ignora:** sanción SIC hasta 2.000 SMLMV (~3.000M COP a 2026). Una sola queja de cliente activa la investigación.

---

## Orden de ejecución sugerido

```
Mes 1: Capa 1 + arranque Capa 5 (legal en paralelo).
Mes 2: Capa 2 con instalación piloto (1-2 sistemas reales).
Mes 3: Capa 4 (SSO). Capa 3 empieza a acumular dataset.
Mes 4-6: Capa 3 madura cuando hay >20 instalaciones.
```

Capa 5 (compliance) **empieza día 1** y debe estar completa antes del primer handoff real de datos en producción. El registro SIC toma 30-60 días — no se puede dejar al final.

---

## Métricas de éxito

| Métrica | Objetivo Mes 3 | Objetivo Mes 12 |
|---|---|---|
| Cotizaciones con `flux_client_id` poblado | 80% de las ganadas | 100% |
| Tiempo de provisión (cotización ganada → datos MQTT fluyendo) | < 7 días | < 24 h |
| % instalaciones con data-frame correcto auto | 60% | 95% |
| Brecha PR teórico (0.78) vs PR calibrado real | medida | < 5% |
| SSO admin → FluxAI: tasa de éxito | n/a | > 99% |
| Quejas SIC recibidas | 0 | 0 |

---

## Dependencias previas (deuda que cobra ahora)

Para que esta integración no nazca rota, antes hay que cerrar (de `REVIEW.md`):

1. **Auth de admin server-side** — bloquea Capa 4 (SSO con btoa es teatro).
2. **Secret management real** — bloquea Capas 2 y 4 (no compartir secretos vía `REACT_APP_*`).
3. **Idempotencia en `save-quote`** — bloquea Capa 1 (handoff con duplicados rompe integridad referencial).
4. **Cabeceras de seguridad + CSP** — bloquea Capa 5 (sin esto la política Habeas Data no es defendible).

---

## Anti-patrones a evitar

- **Workflows n8n live no versionados** — los workflows de integración deben vivir en `n8n/*.json` del repo. Cualquier cosa importada manualmente al `api.solar-hub.co` que no esté en código es deuda invisible.
- **Token compartido en `REACT_APP_*`** — todo secreto cross-app vive en backend (n8n credentials, Laravel `.env`), nunca en bundle CRA.
- **MQTT credentials globales** — un set de credentials por equipo, nunca uno común para todas las instalaciones.
- **Logo == integración** — co-branding en UI sin flujo de datos es marketing, no producto. Ya estamos en ese estado; la idea es salir.

---

*Complementa `AUDIT.md` (estratégico) y `REVIEW.md` (táctico). Issue de tracking: ver issues abiertos del repo con label `integration:fluxai`.*

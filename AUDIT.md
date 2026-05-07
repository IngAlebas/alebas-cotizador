# Auditoría estratégica — alebas-cotizador / SolarHub

> **Alcance:** revisión a nivel de plan, arquitectura, compliance y madurez de producto.
> Los bugs línea-a-línea están en `REVIEW.md` (documento separado).
>
> **Auditor:** Claude (Opus 4.7) actuando como auditor de app solar.
> **Fecha:** 2026-05-07.

---

## Resumen ejecutivo

El plan operativo en `CLAUDE.md` ("Próximos pasos verificados") está bien para **terminar la fase de despliegue**, pero como hoja de ruta de producto es incompleto. Resuelve "cómo llegamos a producción" y deja sin tocar tres frentes que importan para un cotizador solar serio en Colombia:

1. **Rigor de cálculo conforme a normativa CREG / Ley 1715**.
2. **Seguridad de datos personales** (Habeas Data Ley 1581/2012).
3. **Mecánica real de marketplace** (matching, contratos, pagos).

La implementación va más adelantada en lo visual (Google Solar Platform Fases 2-5, PR #120) que en lo regulatorio. Hay riesgo legal activo por el manejo del admin auth.

---

## Diagnóstico del plan actual

El plan documentado en `CLAUDE.md` es deploy ops, no producto. Lo que falta:

### Ingeniería solar
- `PR = 0.78` constante para todo el país. Sin temp coefficient, sin soiling regional (Caribe ≠ Andes ≠ Llanos), sin pérdidas por sombreado, sin variación por tilt/azimuth.
- PVGIS, PVWatts y NASA POWER están integrados como webhooks n8n, pero el dimensionamiento de `Quoter` parece seguir consumiendo PSH hardcoded por operador. Hay que asegurar que esos servicios reemplacen (o corrijan) el `psh` del catálogo `OPERATORS`.
- Sin curva de degradación anual (típicamente 0.5-0.7%/año), entonces el cálculo de ahorro a 25 años es optimista.

### Normativa Colombia
- **CREG 174/2021 + 175/2021**: AGPE (≤100 kW) vs AGGE (>100 kW) tienen trámites distintos con el OR. El cotizador no diferencia ni informa al cliente.
- **Ley 1715/2014 + Decreto 829/2020**: deducción renta 50%, depreciación acelerada, exclusión IVA equipos. El cotizador solo aplica la exclusión IVA Sección A; **el beneficio fiscal completo puede valer más que el ahorro tarifario** y no se cuantifica.
- **CREG 030/2018**: net metering / créditos de energía. No se modela.
- **Registro UPME** para proyectos en ciertos rangos de potencia. Ausente.
- **RETIE 2013 + RETILAP**: el flujo dice "incluye memorias RETIE" pero no hay nada que valide que el dimensionamiento entregado cumpla los requisitos.

### Tarifa CREG real
- `tariff: 720 COP/kWh` por operador es promedio plano. La tarifa real (Resolución CREG 119/2007 + 015/2018) tiene componentes **G+T+D+C+P+R**, varía por **estrato y nivel de tensión**, y se actualiza mensualmente.
- ROI/payback con tarifa promedio se puede desviar 15-30% en cualquier dirección. Para un comercial/industrial (NT2/NT3) la diferencia es enorme.
- Recomendación: workflow `tarifas-sync.json` ya existe — usarlo y exponer al cliente la opción "estrato residencial" o "tipo industrial NT2".

### Marketplace
- La promesa de marca dice: "conectamos proveedores, clientes, instaladores, ingenieros y financiadores". El código actual es **lead-gen**: cotización → `save-quote`. No hay:
  - Algoritmo de matching cliente↔instalador por región + capacidad + RETIE válido.
  - Escrow / pagos por hitos.
  - Sistema de reviews / reputación.
  - Contratos digitales / firma electrónica.
- La promesa de marca corre adelante del producto entregado.

### Seguridad
- `ADMIN_HASH = 'sh_' + btoa('hoJSDU2!kaiv337c')` en `App.jsx` es **base64, no hash**. Está en el bundle público de Vercel. Cualquier cliente con DevTools (F12 → Sources) ve la contraseña admin.
- Eso expone datos personales de clientes e instaladores → responsabilidad de ALEBAS Ingeniería SAS (NIT 901.992.450-5) bajo Ley 1581/2012.
- Una sola queja a la SIC con captura de pantalla del bundle pone el caso a investigación. Sanción: hasta 2.000 SMLMV (~3.000M COP a 2026).

### Calidad / operación
- Sin tests automatizados (script declarado en `package.json` pero sin `*.test.*`).
- Sin staging — push a `main` = deploy directo a prod.
- Observabilidad: n8n no destaca para esto. Sin agregador (Datadog, Sentry, Logtail).
- Sin estrategia de rollback documentada.
- CRA está en maintenance mode desde 2023 — migración a Vite es deuda técnica creciente.
- 30+ ramas `claude/*` activas → indicador de queue de PRs sin mergear (ruido o backlog).

---

## Estado de implementación (lo que sí está bien)

- ✅ **Arquitectura** (React + n8n + Postgres + Railway/Vercel) razonable para MVP. n8n da iteración rápida.
- ✅ **PWA** con service worker + manifest + bottom nav: bien para uso en celular en campo.
- ✅ **Google Solar API con cache 90d** (`solar-cache.json`) — buena decisión costo (~$0.04/hit ahorrado).
- ✅ **Multi-source de irradiancia** (PVGIS, PVWatts, NASA POWER) — robusto **si** efectivamente se usan en cascada para corregir.
- ✅ **Catálogo CEC** de paneles/inversores — nivel profesional.
- ✅ **Branding y UX coherente** (tokens CSS, Outfit, paleta solar).
- ✅ **Documentación** (`CLAUDE.md`, `DEPLOY.md`) significativamente mejor que la mediana de repos a este tamaño.

---

## Madurez por área

| Área | Madurez | Comentario |
|---|---|---|
| Cotización rápida (lead-gen) | **80%** | Funciona; falta rigor de cálculo |
| Visualización solar (mapa, heatmap) | **90%** | PR #120 cierra Fases 2-5 |
| Persistencia y CRM | **60%** | save-quote/list-quotes activos, sin pipeline |
| IA recomendadora | **50%** | Workflow listo, faltan keys Groq/Gemini |
| Compliance regulatorio | **20%** | Solo exclusión IVA; resto ausente |
| Seguridad / Habeas Data | **15%** | Admin auth simulada, sin auditoría, sin política |
| Marketplace real | **10%** | Solo lead-gen, falta matching/escrow/contratos |
| Testing / observabilidad | **5%** | Script declarado, sin tests |

---

## Riesgos priorizados

| # | Riesgo | Severidad | Probabilidad |
|---|---|---|---|
| 1 | Bundle expone admin password (base64) → datos personales accesibles | **Alta** | **Alta** |
| 2 | Sin política de tratamiento de datos publicada / sin registro SIC | **Alta** | **Media** |
| 3 | Cálculo de payback con tarifa promedio → cliente decide con dato erróneo | Media | **Alta** |
| 4 | Sin staging → bug en `main` rompe `solar-hub.co` para todos | Media | Media |
| 5 | n8n single point of failure (Railway) sin DR documentado | Media | Baja |
| 6 | Promesa de marketplace sin producto que la respalde → reputación | Media | Media |
| 7 | CRA EOL → migración eventualmente forzada | Baja | Alta |

---

## Re-priorización recomendada (3 carriles paralelos)

### Carril A — Compliance + Seguridad (urgente)
1. **Esta semana**: mover `ADMIN_HASH` a auth real. Endpoint n8n que valida contra hash **bcrypt en Postgres**. JWT corto en cookie httpOnly. Quitar el password del bundle.
2. **Mes 1**: política Habeas Data publicada en `solar-hub.co/privacidad`. Registro de tratamiento ante SIC. Cláusula consentimiento en formularios. Botón "ejercer derechos ARCO".
3. **Mes 1**: log de auditoría en n8n (quién accedió a qué cotización, cuándo).

### Carril B — Rigor de ingeniería (alto valor)
1. **Mes 1**: tarifa CREG real por estrato/nivel de tensión, con sync mensual desde resoluciones publicadas (workflow `tarifas-sync.json` ya existe — activarlo).
2. **Mes 1-2**: corregir PR por región/tilt/azimuth usando PVGIS como fuente primaria, NASA POWER como fallback. PSH hardcoded en `OPERATORS` debe ser solo dato de display.
3. **Mes 2**: módulo de **beneficios fiscales Ley 1715** con cálculo real de deducción renta 50% y depreciación acelerada — esto puede duplicar el atractivo de la propuesta.
4. **Mes 2**: degradación anual + escenarios de inflación tarifaria en payback.

### Carril C — Producto / marketplace (estratégico)
1. **Mes 2**: matching instalador↔lead por departamento + capacidad + RETIE válido (ya tienes `InstallerReg` y `installers` en DB).
2. **Mes 3**: reviews y portfolio del instalador.
3. **Mes 3-4**: contratos digitales (firma electrónica vía proveedor local — ej. Andes SCD).
4. **Mes 4+**: escrow / hitos de pago. Esto es lo más complejo; valorar partnership con fintech antes de construir.

### Calidad transversal (todo el tiempo)
- Tests E2E con Playwright sobre el flujo crítico (cotizar → guardar → listar).
- Staging environment en Vercel preview branches.
- Sentry para errores frontend; logs estructurados en n8n.
- Plan de migración CRA → Vite para Q3-Q4.

---

## Veredicto

**¿El plan actual es OK?** Para cerrar la Fase 6 actual, sí. Como roadmap del producto SolarHub que promete la marca: **no**.

Le falta una columna de "compliance + ingeniería" en paralelo a "features". Si llegan 100 cotizaciones reales con el estado actual, el riesgo legal y el margen de error técnico se vuelven dolorosos.

La buena noticia es que **el 70-80% de la base está bien**. La arquitectura no necesita rediseño; necesita capas adicionales (auth real, datos CREG dinámicos, motor fiscal Ley 1715, motor de matching). El equipo claramente sabe lo que hace en frontend y branding; el déficit es en la ortogonalidad regulatoria y de seguridad.

---

*Auditoría complementaria a `REVIEW.md` (bugs línea-a-línea).*

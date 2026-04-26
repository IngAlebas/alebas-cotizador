# ALEBAS Cotizador Solar

Cotizador solar fotovoltaico profesional para ALEBAS Ingeniería SAS.

## Funcionalidades
- Cotizador interactivo on-grid / híbrido / off-grid
- 17 operadores de red colombianos con tarifas reales
- Cálculo de transporte Interrapidísimo 2025-2026 a 33 departamentos
- Pre-dimensionamiento con PVLib (PSH real por ciudad)
- Presupuesto Sección A (0% IVA) + Sección B (19% IVA)
- Registro de instaladores por departamento
- Back office con catálogo de equipos y cotizaciones

## Deploy en Vercel (recomendado)

1. Sube este proyecto a GitHub
2. Ve a vercel.com → New Project
3. Importa el repositorio
4. Framework: Create React App (auto-detectado)
5. Deploy

## Dominio custom (solar-hub.co)

En Vercel → Project → Settings → Domains:
- `www.solar-hub.co` → canónico (sirve contenido)
- `solar-hub.co` → redirect 307 a `www.solar-hub.co`
- DNS configurado en Hostinger

## Desarrollo local

```bash
npm install
npm start
```

## Build para producción

```bash
npm run build
```

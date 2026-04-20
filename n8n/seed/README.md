# n8n/seed — Carga inicial de datos

## Prerequisitos

- Node.js ≥ 18
- `pg` instalado (`npm install pg` desde la raíz del proyecto, ya está en dependencies)
- `DATABASE_URL` apuntando al Postgres de Railway (encontrarlo en Railway → Postgres → Connect → Connection String)
- Schema aplicado: `psql $DATABASE_URL -f n8n/schema.sql`

## Carga completa (paneles CEC + inversores CEC + baterías)

```bash
DATABASE_URL=postgres://usuario:clave@host:5432/railway node n8n/seed/load-cec.js
```

## Cargas individuales

```bash
# Solo paneles (~13 000 filas del CSV SAM)
DATABASE_URL=... node n8n/seed/load-cec.js --panels

# Solo inversores (~4 500 filas)
DATABASE_URL=... node n8n/seed/load-cec.js --inverters

# Solo baterías (catálogo curado, ~12 modelos mercado colombiano)
DATABASE_URL=... node n8n/seed/load-cec.js --batteries
```

## Fuentes

| Tabla | Origen | Frecuencia de actualización |
|---|---|---|
| `cec_panels` | NREL SAM — `CEC Modules.csv` (GitHub) | Trimestral |
| `cec_inverters` | NREL SAM — `CEC Inverters.csv` (GitHub) | Trimestral |
| `batteries` | Catálogo curado ALEBAS (mercado CO) | Manual |

## Re-ejecución

El script usa `ON CONFLICT (manufacturer, model) DO NOTHING`, por lo que es
idempotente. Córrelo de nuevo cuando SAM actualice sus CSVs para agregar modelos nuevos.

## Notas

- El SSL está deshabilitado para Railway (`rejectUnauthorized: false`). En producción
  usa el certificado de Railway descargándolo desde el dashboard si quieres máxima seguridad.
- Si `psql` no está disponible, aplica el schema desde n8n UI: crea un nodo Postgres
  con `operation: Execute Query` y pega el contenido de `n8n/schema.sql`.

# ⚠️ Carpeta obsoleta

Estas funciones edge (originalmente Vercel) fueron reemplazadas por workflows n8n en `/n8n/`.
Se conservan temporalmente como respaldo hasta validar producción en Railway.

| Archivo | Workflow n8n reemplazante |
|---|---|
| `pvgis.js` | `n8n/pvgis.json` → `POST /webhook/pvgis` |
| `pvwatts.js` | `n8n/pvwatts.json` → `POST /webhook/pvwatts` |
| `nasa-power.js` | `n8n/nasa-power.json` → `POST /webhook/nasa-power` |
| `trm.js` | `n8n/trm.json` → `POST /webhook/trm` |
| `xm.js` | `n8n/xm-agents.json` + `n8n/xm-spot.json` |
| `cec.js` | `n8n/cec.json` → `POST /webhook/cec` |
| `batteries.js` | `n8n/batteries.json` → `POST /webhook/batteries` |

**Fecha de deprecación**: 2026-04-20
**Eliminar después de**: 2 semanas sin issues en producción (aprox. 2026-05-04)

Para eliminar: `rm -rf api/` y remover `server.js` la sección de dynamic imports.

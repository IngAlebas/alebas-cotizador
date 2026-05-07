# Deploy: Auth admin server-side

> **Cierra el bloqueante #1 de `REVIEW.md`.** Reemplaza el `'sh_' + btoa('hoJSDU2!kaiv337c')`
> que vivía en el bundle JS público (cualquiera con DevTools veía la contraseña admin)
> por bcrypt + JWT firmado server-side en n8n.
>
> **Antes de mergear el PR**: este deploy NO es atómico. Hay que hacer 4 pasos en orden.
> Si el frontend deploya pero el backend no está listo, el panel admin queda inaccesible
> (degrada a sólo el fallback `REACT_APP_ADMIN_LEGACY_HASH` si está seteado).

---

## Orden de deploy (≈30 min)

### 1. Postgres — aplicar schema (5 min)

Conectarse al Postgres de Railway y ejecutar las 2 tablas nuevas:

```bash
psql "$DATABASE_URL" -f n8n/schema.sql
```

O sólo las nuevas:

```sql
CREATE TABLE IF NOT EXISTS admin_users (...);
CREATE TABLE IF NOT EXISTS admin_audit (...);
-- ver schema.sql para el SQL completo
```

Verifica:

```sql
\d admin_users
\d admin_audit
```

### 2. Generar el primer admin (5 min)

**NO** committear hashes al repo. Generarlos localmente con un one-liner:

```bash
# En cualquier máquina con node:
node -e 'console.log(require("bcryptjs").hashSync(process.argv[1], 12))' "TU-CONTRASEÑA-NUEVA-AQUI"
```

(Si no tienes `bcryptjs` local: `npm install -g bcryptjs` o usar el contenedor n8n: `docker exec n8n node -e ...`.)

Eso imprime algo como:
```
$2b$12$3ZxqW7Y5K9hFp...
```

Insertar en Postgres:

```sql
INSERT INTO admin_users (username, password_hash, role)
VALUES ('admin', '$2b$12$3ZxqW7Y5K9hFp...', 'admin');
```

(Cambia `admin` por el username que prefieras.)

### 3. n8n — variables de entorno + workflows (10 min)

#### a. JWT_SECRET en Railway

En el servicio n8n de Railway → Variables → New Variable:

```
JWT_SECRET = <generar con: openssl rand -base64 48>
```

**Crítico**: el secret debe tener ≥32 chars. Si rotás este secret, todas las sesiones admin se invalidan inmediatamente (efecto "kill all sessions").

#### b. Permitir módulos externos en n8n

Los workflows usan `bcryptjs` y `jsonwebtoken` via `require()` en el Code node. n8n necesita autorización:

En Railway → Variables del servicio n8n:

```
NODE_FUNCTION_ALLOW_EXTERNAL = bcryptjs,jsonwebtoken
```

Reiniciar el servicio n8n para que tome los cambios.

#### c. Importar workflows

En `api.solar-hub.co` (n8n UI):

1. **Settings → Import from File** → seleccionar `n8n/admin-login.json` → Import → Activar.
2. Ídem para `n8n/admin-verify.json`.
3. Verificar que las credentials Postgres están bien (id `ALEBAS_POSTGRES`). Si tienen otro id en tu instancia, editarlas en cada nodo Postgres después de importar.

### 4. Frontend — variables de entorno + deploy (5 min)

En Vercel → Settings → Environment Variables:

- `REACT_APP_N8N_BASE_URL` ya debería estar set a `https://api.solar-hub.co/webhook`.
- (Opcional, sólo desarrollo) `REACT_APP_ADMIN_LEGACY_HASH` = `'sh_' + btoa('TU_PWD_DEV')` para fallback offline. **No setear en producción.**

Mergear PR → Vercel deploya automáticamente → admin panel ya pide credenciales contra n8n.

---

## Smoke test (5 min)

```bash
# 1. login con credencial correcta
curl -sS -X POST https://api.solar-hub.co/webhook/admin-login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"TU-PWD"}'
# → { "ok": true, "token": "eyJ...", "expiresAt": 1746...123, "role": "admin" }

# 2. verify con token válido
TOKEN="eyJ..."
curl -sS -X POST https://api.solar-hub.co/webhook/admin-verify \
  -H "Authorization: Bearer $TOKEN" \
  -d '{}'
# → { "valid": true, "sub": 1, "username": "admin", "role": "admin", "exp": 1746... }

# 3. login con password mala
curl -sS -X POST https://api.solar-hub.co/webhook/admin-login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"wrong"}'
# → { "ok": false, "reason": "invalid_credentials", "message": "..." }

# 4. en SQL: confirmar audit
psql "$DATABASE_URL" -c "SELECT username, action, success, created_at FROM admin_audit ORDER BY created_at DESC LIMIT 5;"
```

En la UI:
- Abrí `solar-hub.co/?view=backoffice` → debe pedir password.
- Ingresá la pwd correcta → entra al panel, JWT en `localStorage.sh:admin:jwt`.
- Cerrá sesión → JWT desaparece.
- Refrescá → vuelve a pedir password.

---

## Rollback rápido

Si algo se rompe en producción:

1. **Frontend**: Vercel → Deployments → revertir al deploy previo (1 click).
2. **n8n**: Desactivar `admin-login` workflow → el frontend no podrá loguear,
   pero el panel queda inaccesible (no es peor que el estado anterior).
3. **Postgres**: las tablas nuevas no afectan otros workflows; seguros de dejar.

Si querés mantener el panel accesible durante rollback, setear `REACT_APP_ADMIN_LEGACY_HASH`
en Vercel con un hash temporal y re-deployar el frontend. Quitar inmediatamente después.

---

## Riesgos y limitaciones conocidas

- **JWT en localStorage**: vulnerable a XSS. Mitigación: cerrar el bloqueante #3 (CSP) lo antes posible. Migración futura a cookie HttpOnly + SameSite es trivial — solo cambia `services/adminAuth.js`, no rompe la API contractual.
- **`list-quotes` y `update-quote` siguen aceptando `x-alebas-token` legacy**. Ese header está en el bundle público. Bloqueante remanente que se resuelve en un PR siguiente: agregar verificación JWT a esos workflows también.
- **Sin rotación automática de JWT_SECRET**: rotación manual cuando se sospeche compromiso. Considerar agregar `kid` (key ID) al header del JWT y soportar 2 secrets en paralelo durante la transición.
- **No hay 2FA**: la cuenta admin es single-factor. Para mejor seguridad agregar TOTP en una iteración futura (`speakeasy` lib + tabla `admin_totp_secrets`).
- **Sin password reset**: si el admin pierde la pwd, hay que generar un hash nuevo y hacer `UPDATE admin_users SET password_hash = '...'`. Self-service password reset requiere flujo de email + token, fuera de alcance.
- **Lockout 5 intentos / 15 min** es por cuenta, no por IP. Bot que rote usernames evita lockout. Mitigación complementaria: rate-limit por IP (similar al de `validate-contact.json`).

---

## Migración de sesiones existentes

Cualquier usuario con `localStorage.sh:admin === '1'` queda **deslogueado** inmediatamente
después del deploy del frontend. Eso es intencional — esas sesiones nunca pasaron por
verificación de password real. Avisar al equipo admin antes del deploy para que tengan
la pwd nueva a mano.

`adminLogout()` limpia tanto las keys nuevas (`sh:admin:jwt`, `sh:admin:exp`, `sh:admin:role`)
como la legacy (`sh:admin`).

// Auth de administrador server-side. Reemplaza el legacy `'sh_' + btoa(pwd)`
// que vivía en el bundle público (App.jsx:15).
//
// Flujo:
//   1. login(password)   → POST /webhook/admin-login (n8n)
//                          n8n hace bcrypt.compare contra admin_users.password_hash,
//                          firma JWT con JWT_SECRET (env var n8n, NUNCA en bundle),
//                          devuelve { token, expiresAt, role }.
//   2. verify()          → opcional: POST /webhook/admin-verify para revocar/refrescar.
//                          Útil cuando rotamos JWT_SECRET o invalidamos sesiones.
//   3. logout()          → borra estado local (no requiere round-trip).
//
// JWT vive en localStorage por simplicidad. XSS sigue siendo un riesgo — mitigarlo
// con CSP es trabajo del bloqueante #3 del REVIEW. Cuando se mueva a cookie
// HttpOnly+Secure+SameSite=Lax, este servicio cambia el storage pero el contrato
// con App.jsx queda igual.

import { n8nPost, n8nConfigured } from './n8n';

const TOKEN_KEY = 'sh:admin:jwt';
const EXP_KEY = 'sh:admin:exp';
const ROLE_KEY = 'sh:admin:role';

// Para desarrollo offline (sin n8n) seguimos aceptando una credencial de
// emergencia, cuyo hash se setea via env var (NO la vieja btoa). Si la env
// var no está, no hay fallback — el admin requiere n8n configurado.
const LEGACY_FALLBACK = (process.env.REACT_APP_ADMIN_LEGACY_HASH || '').trim();

export async function adminLogin(password) {
  if (!password) return { ok: false, reason: 'missing_password' };

  // Fallback de desarrollo: si REACT_APP_ADMIN_LEGACY_HASH está set y matchea
  // sh_<base64(pwd)>, autoriza sin token (modo offline). En producción esta
  // env var no debe existir. NUNCA hardcodear hashes en el código.
  if (LEGACY_FALLBACK && `sh_${btoa(password)}` === LEGACY_FALLBACK) {
    const fakeToken = 'legacy-' + Date.now();
    const exp = Date.now() + 8 * 60 * 60 * 1000;
    persistSession(fakeToken, exp, 'admin-legacy');
    return { ok: true, role: 'admin-legacy', degraded: true };
  }

  if (!n8nConfigured()) {
    return { ok: false, reason: 'backend_offline', message: 'Servicio backend no configurado.' };
  }

  try {
    const res = await n8nPost('admin-login', { password }, { skipAuth: true });
    if (!res?.ok || !res?.token) {
      return { ok: false, reason: res?.reason || 'invalid_credentials', message: res?.message || 'Credenciales inválidas.' };
    }
    persistSession(res.token, Number(res.expiresAt) || (Date.now() + 8 * 60 * 60 * 1000), res.role || 'admin');
    return { ok: true, role: res.role || 'admin' };
  } catch (e) {
    return { ok: false, reason: 'network_error', message: e?.message || 'No se pudo contactar el servidor.' };
  }
}

export function adminLogout() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXP_KEY);
    localStorage.removeItem(ROLE_KEY);
    // Limpia también la key legacy `sh:admin` para que no queden rastros del
    // formato anterior — un usuario con sesión vieja queda deslogueado.
    localStorage.removeItem('sh:admin');
  } catch {}
}

export function getAdminToken() {
  try { return localStorage.getItem(TOKEN_KEY) || null; } catch { return null; }
}

export function getAdminRole() {
  try { return localStorage.getItem(ROLE_KEY) || null; } catch { return null; }
}

// Sesión válida si hay token y no ha expirado en local.
// `verify()` (servidor) es independiente — un token con expiración local
// vigente puede haber sido revocado, así que llamamos verify() en mount.
export function isAdminAuthenticated() {
  const token = getAdminToken();
  if (!token) return false;
  const exp = readExp();
  return !exp || Date.now() < exp;
}

// Verifica con el servidor que el token sigue válido (firma + expiración).
// Útil al montar la app o antes de operaciones sensibles.
// Devuelve true/false; si falla la red, asume válido para no kickear admins
// con conexión intermitente — el siguiente call al backend lo expulsará si
// el token está roto realmente.
export async function adminVerify() {
  const token = getAdminToken();
  if (!token) return false;

  // Sesión legacy fallback: confiamos en el TTL local, no llamamos al backend.
  if (token.startsWith('legacy-')) return isAdminAuthenticated();

  if (!n8nConfigured()) return isAdminAuthenticated();

  try {
    const res = await n8nPost('admin-verify', {}, { authToken: token });
    if (res?.valid !== true) {
      adminLogout();
      return false;
    }
    return true;
  } catch {
    // Network error → confiamos en TTL local. No deslogueamos al admin.
    return isAdminAuthenticated();
  }
}

// ===== internals =====

function persistSession(token, expiresAt, role) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(EXP_KEY, String(expiresAt));
    localStorage.setItem(ROLE_KEY, role);
    localStorage.removeItem('sh:admin');
  } catch {}
}

function readExp() {
  try { return Number(localStorage.getItem(EXP_KEY) || 0); } catch { return 0; }
}

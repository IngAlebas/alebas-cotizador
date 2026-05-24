// =====================================================================
// supplier.js — SolarHub B2B Supplier Portal service layer
// All calls go to REACT_APP_N8N_BASE_URL (n8n webhooks)
// =====================================================================

// ---------- Commission model constants ----------
export const PLATFORM_FEE_EQUIPMENT_PCT = 10; // SolarHub takes 10% from equipment sales
export const TECH_EARNINGS_PCT = 80;           // Technician gets 80% of installation labor
export const SH_INSTALL_FEE_PCT = 20;          // SolarHub gets 20% of installation labor

// ---------- Session storage ----------
export const SESSION_KEY = 'sh:supplier';

export function getSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.jwt || !parsed?.supplier) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(jwt, supplier) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ jwt, supplier }));
  } catch {}
}

export function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {}
}

// ---------- Base URL helper ----------
function base() {
  return (process.env.REACT_APP_N8N_BASE_URL || '').replace(/\/$/, '');
}

async function handleResponse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || data.error || `HTTP ${res.status}`);
  }
  return data;
}

// ---------- Auth ----------
/**
 * Authenticate supplier.
 * credentials: { email, password } OR { token } (deep-link UUID)
 * On success saves session and returns { jwt, supplier }
 */
export async function supplierAuth(credentials) {
  const res = await fetch(`${base()}/supplier-auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  const data = await handleResponse(res);
  saveSession(data.jwt, data.supplier);
  return data;
}

// ---------- Stock ----------
export async function getStock(supplierId, jwt) {
  const res = await fetch(
    `${base()}/supplier-stock?supplier_id=${encodeURIComponent(supplierId)}&token=${encodeURIComponent(jwt)}`,
  );
  return handleResponse(res);
}

export async function createStockItem(item, jwt) {
  const res = await fetch(`${base()}/supplier-stock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...item, token: jwt }),
  });
  return handleResponse(res);
}

export async function updateStockItem(patch, jwt) {
  const res = await fetch(`${base()}/supplier-stock`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...patch, token: jwt }),
  });
  return handleResponse(res);
}

// ---------- Purchase Orders ----------
export async function getOrders(supplierId, jwt, status = '') {
  const url = new URL(`${base()}/supplier-po`);
  url.searchParams.set('supplier_id', supplierId);
  url.searchParams.set('token', jwt);
  if (status && status !== 'all') url.searchParams.set('status', status);
  const res = await fetch(url.toString());
  return handleResponse(res);
}

/**
 * Update PO status.
 * extra: { tracking_code?, notes? }
 */
export async function updateOrderStatus(poId, status, extra = {}, jwt) {
  const res = await fetch(`${base()}/supplier-po`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ po_id: poId, status, ...extra, token: jwt }),
  });
  return handleResponse(res);
}

// ---------- Analytics ----------
export async function getAnalytics(supplierId, jwt) {
  const res = await fetch(
    `${base()}/supplier-analytics?supplier_id=${encodeURIComponent(supplierId)}&token=${encodeURIComponent(jwt)}`,
  );
  return handleResponse(res);
}

// ---------- Profile ----------
export async function updateProfile(profile, jwt) {
  const res = await fetch(`${base()}/supplier-profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...profile, token: jwt }),
  });
  return handleResponse(res);
}

// ---------- Commission calculator ----------
/**
 * Calculate commission breakdown.
 * @param {number} subtotalEquipment  - Total equipment value (COP)
 * @param {number} installationTotal  - Total installation labor (COP)
 * @param {number} feePct             - Equipment fee % (default PLATFORM_FEE_EQUIPMENT_PCT)
 * @returns {{ supplierNet, platformFeeEquip, techEarnings, shInstallFee, totalPlatform }}
 */
export function calcCommission(
  subtotalEquipment,
  installationTotal,
  feePct = PLATFORM_FEE_EQUIPMENT_PCT,
) {
  const platformFeeEquip = Math.round(subtotalEquipment * (feePct / 100));
  const supplierNet = subtotalEquipment - platformFeeEquip;
  const techEarnings = Math.round(installationTotal * (TECH_EARNINGS_PCT / 100));
  const shInstallFee = Math.round(installationTotal * (SH_INSTALL_FEE_PCT / 100));
  const totalPlatform = platformFeeEquip + shInstallFee;
  return { supplierNet, platformFeeEquip, techEarnings, shInstallFee, totalPlatform };
}

// Thin wrapper to call n8n webhooks.
// Base URL is configured via REACT_APP_N8N_BASE_URL (e.g. https://n8n-xxx.up.railway.app/webhook).
// Optional shared secret via REACT_APP_N8N_TOKEN is sent as x-alebas-token header — n8n validates.

const RAW_BASE = (process.env.REACT_APP_N8N_BASE_URL || '').replace(/\/+$/, '');
const TOKEN = process.env.REACT_APP_N8N_TOKEN || '';

// Patrones de placeholders comunes en docs/ejemplos. Si la env var apunta a uno
// de estos se trata como "no configurado" — evita DNS fallando en producción.
const PLACEHOLDER_PATTERNS = [
  /\btu-n8n\b/i,
  /\byour-n8n\b/i,
  /\bxxxx+\b/i,
  /example\.com/i,
  /<[^>]+>/,
];
const isPlaceholder = RAW_BASE.length > 0 && PLACEHOLDER_PATTERNS.some(re => re.test(RAW_BASE));
const BASE = isPlaceholder ? '' : RAW_BASE;

export const n8nConfigured = () => BASE.length > 0;
export const n8nBaseUrl = () => BASE;
export const n8nPlaceholderDetected = () => isPlaceholder ? RAW_BASE : '';

export async function n8nPost(path, body, { timeoutMs = 25000 } = {}) {
  if (!BASE) throw new Error('n8n no configurado (REACT_APP_N8N_BASE_URL vacío)');
  const url = `${BASE}/${String(path).replace(/^\/+/, '')}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(TOKEN ? { 'x-alebas-token': TOKEN } : {}),
      },
      body: JSON.stringify(body || {}),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!res.ok) {
      const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`;
      throw new Error(`n8n ${path}: ${msg}`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

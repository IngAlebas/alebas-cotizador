// Registry de usuarios/cotizaciones en Postgres vía n8n.
// Workflows esperados:
//   POST /webhook/validate-contact { email, phone, name, company?, website? }
//     -> { ok, userId?, isReturning?, priorQuotes?, reason? }
//   POST /webhook/save-quote { ...quotePayload }
//     -> { ok, quoteId, userId, createdAt, contact, totals }
//   POST /webhook/list-quotes { status?, search?, limit? }
//     -> { ok, count, quotes: [...] }
//   POST /webhook/update-quote { id, status?, notes?, historyEntry? }
//     -> { ok, quoteId, status, payload, history, trackingToken }
//   POST /webhook/quote-public { id, token }
//     -> { ok, quote: {...sanitized...} }

import { n8nPost, n8nConfigured } from './n8n';

export const quotesConfigured = () => n8nConfigured();

export async function validateContactRemote({ email, phone, name, company, website } = {}) {
  if (!n8nConfigured()) return { ok: true, offline: true };
  return n8nPost('validate-contact', { email, phone, name, company, website });
}

export async function saveQuoteRemote(payload) {
  if (!n8nConfigured()) return { ok: false, offline: true };
  return n8nPost('save-quote', payload);
}

export async function listQuotesRemote({ status, search, limit } = {}) {
  if (!n8nConfigured()) return { ok: false, offline: true, quotes: [] };
  return n8nPost('list-quotes', { status, search, limit });
}

export async function updateQuoteRemote({ id, status, notes, historyEntry } = {}) {
  if (!n8nConfigured()) return { ok: false, offline: true };
  return n8nPost('update-quote', { id, status, notes, historyEntry });
}

// Estados permitidos en el ciclo de vida de la cotización (sincronizado con n8n update-quote).
export const QUOTE_STATUSES = ['nuevo', 'contactado', 'propuesta', 'negociacion', 'ganada', 'perdida', 'archivada'];

// Vista pública para el cliente (validada con token).
export async function getPublicQuote({ id, token } = {}) {
  if (!n8nConfigured()) return { ok: false, offline: true };
  return n8nPost('quote-public', { id, token });
}

// Construye URL de seguimiento absoluta (la que se le envía al cliente por email).
export function buildTrackingUrl({ id, token, origin } = {}) {
  const base = origin || (typeof window !== 'undefined' ? window.location.origin : 'https://solar-hub.co');
  const remoteId = String(id || '').replace(/^r_/, '');
  return `${base}/?view=seguimiento&id=${remoteId}&t=${encodeURIComponent(token)}`;
}

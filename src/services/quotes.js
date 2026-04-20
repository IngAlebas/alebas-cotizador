// Registry de usuarios/cotizaciones en Postgres vía n8n.
// Workflows esperados:
//   POST /webhook/validate-contact { email, phone, name, company?, website? }
//     -> { ok, userId?, isReturning?, priorQuotes?, reason? }
//   POST /webhook/save-quote { ...quotePayload }
//     -> { ok, quoteId, userId, createdAt, contact, totals }
//   POST /webhook/list-quotes { status?, search?, limit? }
//     -> { ok, count, quotes: [...] }

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

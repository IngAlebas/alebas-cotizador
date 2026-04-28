// Asistente IA vía n8n — cadena de revisión interna con cascada Groq → Gemini → Claude.
// Expected n8n workflow at /webhook/ai-recommend:
//   Input: {
//     context: 'sizing' | 'review' | 'explain',
//     payload: { ...anything the tool wants to send... }
//   }
//   Server orquesta el modelo (configurable) y devuelve JSON estricto.
//   Output: {
//     summary: string,         // 1–2 frases
//     findings: string[],      // observaciones clave
//     warnings: string[],      // alertas técnicas/normativas
//     suggestions: string[],   // acciones recomendadas (texto libre)
//     actions: [{ field, value, label, reason }],  // cambios programáticos al estado
//     provider?: string,
//     tokens?: { in, out }
//   }

import { n8nPost, n8nConfigured } from './n8n';

// Campos del estado del cotizador que pueden mutarse desde una `action` IA.
// Mantener sincronizado con la whitelist del workflow `n8n/ai-recommend.json`.
// monthlyKwh queda fuera intencionalmente: el consumo viene de la factura del
// usuario, RD-8 del prompt prohíbe proponerlo y el sanitizer del servidor lo
// descarta. Mantenerlo aquí solo añadía capacidad muerta al filtro cliente.
export const APPLYABLE_FIELDS = [
  'systemType', 'battQty', 'busVoltage',
  'backupHours', 'autonomyDays', 'criticalPct',
  'acometida', 'availableArea', 'wantsExcedentes',
];

export function aiConfigured() { return n8nConfigured(); }

export async function aiRecommend(context, payload) {
  const data = await n8nPost('ai-recommend', { context, payload });
  if (!data || typeof data !== 'object') throw new Error('Respuesta inválida de n8n (ai-recommend)');
  const allowed = new Set(APPLYABLE_FIELDS);
  const rawActions = Array.isArray(data.actions) ? data.actions : [];
  const actions = rawActions
    .filter(a => a && typeof a === 'object' && allowed.has(a.field))
    .map(a => ({
      field: String(a.field),
      value: a.value,
      label: typeof a.label === 'string' ? a.label : '',
      reason: typeof a.reason === 'string' ? a.reason : '',
    }));
  return {
    summary: data.summary || '',
    findings: Array.isArray(data.findings) ? data.findings : [],
    warnings: Array.isArray(data.warnings) ? data.warnings : [],
    suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
    actions,
    provider: data.provider || null,
    tokens: data.tokens || null,
  };
}

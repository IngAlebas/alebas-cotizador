// Claude-powered assistant via n8n.
// Expected n8n workflow at /webhook/ai-recommend:
//   Input: {
//     context: 'sizing' | 'review' | 'explain',
//     payload: { ...anything the tool wants to send... }
//   }
//   Server prompts Claude (claude-sonnet-4-6 recommended) with strict JSON output.
//   Output: {
//     summary: string,         // 1–2 frases
//     findings: string[],      // observaciones clave
//     warnings: string[],      // alertas técnicas/normativas
//     suggestions: string[],   // acciones recomendadas
//     tokens?: { in, out }
//   }

import { n8nPost, n8nConfigured } from './n8n';

export function aiConfigured() { return n8nConfigured(); }

export async function aiRecommend(context, payload) {
  const data = await n8nPost('ai-recommend', { context, payload });
  if (!data || typeof data !== 'object') throw new Error('Respuesta inválida de n8n (ai-recommend)');
  return {
    summary: data.summary || '',
    findings: Array.isArray(data.findings) ? data.findings : [],
    warnings: Array.isArray(data.warnings) ? data.warnings : [],
    suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
    provider: data.provider || null,
    tokens: data.tokens || null,
  };
}

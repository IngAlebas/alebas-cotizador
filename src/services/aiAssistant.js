// Asistente IA vía n8n — cadena de revisión interna (modelo abstraído en el backend).
// Expected n8n workflow at /webhook/ai-recommend:
//   Input: {
//     context: 'sizing' | 'review' | 'explain',
//     payload: { ...anything the tool wants to send... }
//   }
//   Server orquesta el modelo (cascada Gemini → Groq → Mistral → Claude).
//   Output: {
//     summary: string,         // 1–2 frases
//     findings: string[],      // observaciones clave
//     warnings: string[],      // alertas técnicas/normativas
//     suggestions: string[],   // acciones recomendadas
//     provider?: string,
//     tokens?: { in, out }
//   }
//
// Fallback: si n8n no está configurado o falla, se intenta llamada directa
// a Gemini (REACT_APP_GOOGLE_AI_KEY). Útil para demos y desarrollo local.

import { n8nPost, n8nConfigured } from './n8n';
import { geminiRecommend, geminiConfigured } from './gemini';

export function aiConfigured() { return n8nConfigured() || geminiConfigured(); }

function normalize(data) {
  if (!data || typeof data !== 'object') throw new Error('Respuesta inválida de asistente IA');
  return {
    summary: data.summary || '',
    findings: Array.isArray(data.findings) ? data.findings : [],
    warnings: Array.isArray(data.warnings) ? data.warnings : [],
    suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
    provider: data.provider || null,
    tokens: data.tokens || null,
  };
}

export async function aiRecommend(context, payload) {
  if (n8nConfigured()) {
    try {
      const data = await n8nPost('ai-recommend', { context, payload });
      return normalize(data);
    } catch (e) {
      if (geminiConfigured()) return normalize(await geminiRecommend(context, payload));
      throw e;
    }
  }
  if (geminiConfigured()) return normalize(await geminiRecommend(context, payload));
  throw new Error('Asistente IA no configurado (falta n8n o REACT_APP_GOOGLE_AI_KEY)');
}

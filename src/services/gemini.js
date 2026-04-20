// Fallback directo a Gemini (Google AI Studio) cuando n8n no responde.
// Se activa con REACT_APP_GOOGLE_AI_KEY. Tier gratuito: 1,500 req/día.
//
// Seguridad: la key viaja al navegador — DEBE restringirse en Google AI Studio
// por HTTP referrer (producción: https://alebas-cotizador.vercel.app/*).
// Es la misma superficie de riesgo que REACT_APP_GOOGLE_API_KEY para Solar API.

const KEY = process.env.REACT_APP_GOOGLE_AI_KEY || '';
const MODEL = 'gemini-2.0-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export const geminiConfigured = () => !!KEY;

const SYSTEM = 'Eres un ingeniero eléctrico especializado en sistemas solares fotovoltaicos en Colombia. Conoces RETIE, CREG 038/2014, CREG 174/2021 (AGPE), Ley 1715, estándares NEC/IEC. Analiza el dimensionamiento que te envía el cotizador y devuelve observaciones concretas, accionables y técnicas. Usa español neutro.';

function buildPrompt(context, payload) {
  return `Contexto: ${context}\n\nSistema a revisar (JSON):\n${JSON.stringify(payload, null, 2)}\n\nDevuelve SOLO JSON válido con esta forma exacta (sin markdown):\n{\n  "summary": string,\n  "findings": string[],\n  "warnings": string[],\n  "suggestions": string[]\n}\n\nReglas:\n- summary: 1-2 frases, lenguaje ejecutivo.\n- findings: 2-5 observaciones técnicas clave.\n- warnings: alertas críticas. Vacío si no hay.\n- suggestions: 2-4 acciones recomendadas específicas.\n- NO inventes valores. Trabaja solo con los datos del payload.`;
}

function extractJson(text) {
  const m = (text || '').match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Gemini no devolvió JSON parseable');
  return JSON.parse(m[0]);
}

export async function geminiRecommend(context, payload) {
  if (!KEY) throw new Error('Gemini requiere REACT_APP_GOOGLE_AI_KEY');
  const url = `${ENDPOINT}?key=${KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: buildPrompt(context, payload) }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
      },
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Gemini HTTP ${res.status}${t ? `: ${t.slice(0, 120)}` : ''}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
  const parsed = extractJson(text);
  const u = data.usageMetadata || {};
  return {
    summary: parsed.summary || '',
    findings: Array.isArray(parsed.findings) ? parsed.findings : [],
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
    provider: 'gemini-2.0-flash (directo)',
    tokens: { in: u.promptTokenCount || 0, out: u.candidatesTokenCount || 0 },
  };
}

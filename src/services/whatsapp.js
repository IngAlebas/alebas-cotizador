import { n8nPost, n8nConfigured } from './n8n';

// True cuando hay un n8n base configurado — si es false, la verificación OTP
// no se puede ejecutar y el flujo cae a modo dev-bypass de forma explícita
// (no silenciosa por cualquier excepción).
export const whatsappConfigured = () => n8nConfigured();

// Normaliza número colombiano a formato de display +57 XXX XXX XXXX
export function formatColombianPhone(raw) {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+57${digits}`;
  if (digits.startsWith('57') && digits.length === 12) return `+${digits}`;
  return raw;
}

// Valida que sea un móvil colombiano válido (+57 seguido de 10 dígitos, empieza en 3xx)
export function isValidColombianPhone(raw) {
  const e164 = formatColombianPhone(raw);
  return /^\+573\d{9}$/.test(e164);
}

// Envía OTP por WhatsApp. Devuelve {ok, expiresAt, message} o {ok:false, reason, message}
export async function sendWhatsAppOTP(phone) {
  const e164 = formatColombianPhone(phone);
  const data = await n8nPost('wa-send-otp', { phone: e164 }, { timeoutMs: 15000 });
  if (!data || typeof data !== 'object') throw new Error('Sin respuesta del servidor de verificación');
  return data;
}

// Verifica el código OTP. Devuelve {ok, token, message} o {ok:false, reason, message}
export async function verifyWhatsAppOTP(phone, code) {
  const e164 = formatColombianPhone(phone);
  const clean = String(code).replace(/\D/g, '').slice(0, 6);
  const data = await n8nPost('wa-verify-otp', { phone: e164, code: clean }, { timeoutMs: 10000 });
  if (!data || typeof data !== 'object') throw new Error('Sin respuesta del servidor de verificación');
  return data;
}

// Envía notificación WhatsApp cuando cambia el estado de una cotización
export async function notifyQuoteStatus({ quoteId, phone, name, status, kwp, totalCop, trackingToken, installerName }) {
  return n8nPost('wa-notify-quote', {
    quoteId, phone: formatColombianPhone(phone), name, status, kwp, totalCop, trackingToken, installerName,
  }, { timeoutMs: 15000 });
}

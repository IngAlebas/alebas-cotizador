// ==================== SHARED FORM VALIDATION HELPERS ====================
// Used across Quoter, InstallerReg, and SupplierPortal.

/**
 * Validates a Colombian mobile phone number.
 * Accepts: +57 followed by 10 digits, or just 10 digits starting with 3.
 */
export function validatePhone(phone) {
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');
  return /^(\+57)?3\d{9}$/.test(cleaned);
}

/**
 * Standard email validation.
 */
export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Validates a Colombian NIT (simplified check).
 * Accepts: 9–10 digits optionally followed by a hyphen and check digit.
 */
export function validateNIT(nit) {
  const cleaned = nit.replace(/[\s\-\.]/g, '');
  return /^\d{9,10}(-\d)?$/.test(cleaned);
}

/**
 * Formats a Colombian phone number for display: +57 300 123 4567
 */
export function formatPhoneCO(phone) {
  const cleaned = phone.replace(/\D/g, '').replace(/^57/, '');
  if (cleaned.length === 10) {
    return `+57 ${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`;
  }
  return phone;
}

/**
 * Validates a full contact form: name, email, and phone.
 * Returns { valid: boolean, errors: { name?, email?, phone? } }.
 */
export function validateContactForm({ name, email, phone }) {
  const errors = {};
  if (!name || name.trim().length < 2) {
    errors.name = 'Nombre requerido (mín. 2 caracteres)';
  }
  if (!email || !validateEmail(email)) {
    errors.email = 'Email inválido';
  }
  if (!phone || !validatePhone(phone)) {
    errors.phone = 'Teléfono colombiano inválido (ej: 300 123 4567)';
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

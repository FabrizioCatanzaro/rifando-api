// Validación de datos de transferencia (Argentina).
// Mantener sincronizado con rifando-frontend/src/lib/transfer.ts.

const ALIAS_REGEX = /^[A-Za-z0-9.\-]{6,20}$/;

/** Quita espacios y guiones de un CBU/CVU o CUIT. */
export function onlyDigits(value: string): string {
  return value.replace(/[\s-]/g, '');
}

/** Devuelve un mensaje de error o null si el alias o CBU/CVU es válido. */
export function validateAliasOrCbu(raw: string): string | null {
  const value = raw.trim();
  const digits = onlyDigits(value);

  if (/^\d+$/.test(digits)) {
    return digits.length === 22 ? null : 'Un CBU/CVU tiene exactamente 22 dígitos';
  }
  if (!ALIAS_REGEX.test(value)) {
    return 'El alias tiene 6 a 20 caracteres: letras (sin Ñ), números, puntos y guiones';
  }
  return null;
}

/** Normaliza: CBU/CVU sin separadores; alias sin cambios. */
export function normalizeAliasOrCbu(raw: string): string {
  const value = raw.trim();
  const digits = onlyDigits(value);
  return /^\d{22}$/.test(digits) ? digits : value;
}

/** Devuelve un mensaje de error o null si el CUIT/CUIL tiene formato válido. */
export function validateCuit(raw: string): string | null {
  return /^\d{11}$/.test(onlyDigits(raw.trim())) ? null : 'El CUIT/CUIL tiene 11 dígitos';
}

/** Formatea un CUIT/CUIL como XX-XXXXXXXX-X. */
export function formatCuit(raw: string): string {
  const d = onlyDigits(raw.trim());
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}

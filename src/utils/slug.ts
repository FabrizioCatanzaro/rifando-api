import crypto from 'crypto';
import slugify from 'slugify';

const SUFFIX_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

function randomString(length: number): string {
  return Array.from({ length }, () => SUFFIX_ALPHABET[crypto.randomInt(SUFFIX_ALPHABET.length)]).join('');
}

/** Slug aleatorio de 8 caracteres. Se usa en rifas privadas: no revela el título. */
export function generateSlug(): string {
  return randomString(8);
}

/**
 * Slug legible para rifas públicas: "sorteo-ps5-edicion-limitada-k3x9".
 * El sufijo evita choques entre rifas del mismo usuario con el mismo título.
 */
export function generateReadableSlug(title: string): string {
  const base = slugify(title, { lower: true, strict: true, locale: 'es', trim: true })
    .slice(0, 60)
    .replace(/-+$/g, '');
  return base ? `${base}-${randomString(4)}` : generateSlug();
}

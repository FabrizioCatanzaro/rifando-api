import slugify from 'slugify';
import { nanoid } from 'nanoid';

export function generateSlug(title: string): string {
  const base = slugify(title, { lower: true, strict: true, locale: 'es' });
  const suffix = nanoid(5).toLowerCase();
  return `${base}-${suffix}`;
}

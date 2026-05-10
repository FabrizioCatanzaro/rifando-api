import { nanoid } from 'nanoid';

export function generateSlug(): string {
  return nanoid(8).toLowerCase();
}

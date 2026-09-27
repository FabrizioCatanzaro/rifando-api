/** "Juan Pérez García" → "Juan P." — para mostrar compradores en páginas públicas. */
export function maskBuyerName(name: string | null): string | null {
  if (!name) return null;
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1].charAt(0).toUpperCase()}.`;
}

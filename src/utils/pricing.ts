import type { Promotion } from '../types/db';

type PromotionLike = Pick<
  Promotion,
  'type' | 'label' | 'quantity' | 'price' | 'discount_percentage' | 'free_numbers' | 'active'
>;

// Misma lógica que rifando-frontend/src/lib/whatsapp.ts → calculatePrice.
// Cambiá ambas juntas: el total que ve el comprador debe coincidir con el que se guarda.
export function calculatePrice(
  count: number,
  pricePerNumber: number,
  promotions: PromotionLike[]
): { total: number; promotionLabel?: string } {
  const price = Number(pricePerNumber);
  const active = promotions.filter((p) => p.active);

  for (const promo of active) {
    if (count >= promo.quantity) {
      if (promo.type === 'pack' && promo.price !== null) {
        const packs = Math.floor(count / promo.quantity);
        const remaining = count % promo.quantity;
        const total = packs * Number(promo.price) + remaining * price;
        return { total, promotionLabel: promo.label };
      }
      if (promo.type === 'percentage' && promo.discount_percentage !== null) {
        const total = count * price * (1 - promo.discount_percentage / 100);
        return { total, promotionLabel: promo.label };
      }
      if (promo.type === 'bundle' && promo.free_numbers !== null) {
        const sets = Math.floor(count / promo.quantity);
        const free = sets * promo.free_numbers;
        const paid = count - free;
        return { total: paid * price, promotionLabel: promo.label };
      }
    }
  }

  return { total: count * price };
}

/** Redondea a 2 decimales (centavos). */
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Reparte el total de una compra entre sus números.
 * El último número absorbe la diferencia de redondeo para que la suma sea exacta.
 */
export function splitAmount(total: number, count: number): number[] {
  const unit = Math.floor((total / count) * 100) / 100;
  const amounts = Array.from({ length: count }, () => unit);
  amounts[count - 1] = roundMoney(total - unit * (count - 1));
  return amounts;
}

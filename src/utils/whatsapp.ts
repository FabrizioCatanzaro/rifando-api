interface WhatsAppMessageParams {
  numbers: number[];
  raffleName: string;
  buyerName: string;
  totalPrice: number;
  promotionLabel?: string;
  whatsappNumber: string;
}

export function buildWhatsAppUrl(params: WhatsAppMessageParams): string {
  const nums = params.numbers.sort((a, b) => a - b).join(' - ');
  const priceStr = params.totalPrice.toLocaleString('es-AR');

  let msg = `Hola! Quiero comprar números en Rifando:\n
            -------------------------\n
            RIFA: *${params.raffleName}* \n
            NÚMEROS: *${nums}* \n\n
            -------------------------\n
            Mi nombre es: ${params.buyerName}\n
            Total: $${priceStr}\n
            `;

  if (params.promotionLabel) {
    msg += `
    -------------------------\n
    Promoción aplicada: ${params.promotionLabel}`;
  }

  const phone = params.whatsappNumber.replace(/\D/g, '');
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}

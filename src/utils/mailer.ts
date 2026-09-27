import { Resend } from 'resend';
import { env } from '../config/env';
import { escapeHtml } from './html';

let resend: Resend | null = null;

function getClient(): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  if (!resend) resend = new Resend(env.RESEND_API_KEY);
  return resend;
}

export interface ReservationEmailData {
  raffleId: string;
  raffleTitle: string;
  buyerName: string;
  numbers: number[];
  total: number;
  promotionLabel: string | null;
  comprobanteUrl: string | null;
}

const priceFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
});

export async function notifyReservationEmail(ownerEmail: string, data: ReservationEmailData) {
  const client = getClient();
  if (!client) return;

  const from = env.RESEND_FROM ?? 'Rifando <notificaciones@rifando.com>';
  const plural = data.numbers.length > 1 ? 'los números' : 'el número';
  const title = escapeHtml(data.raffleTitle);
  const promo = data.promotionLabel ? ` (${escapeHtml(data.promotionLabel)})` : '';
  const comprobante = data.comprobanteUrl
    ? `<p><a href="${escapeHtml(data.comprobanteUrl)}">Ver comprobante adjunto</a>. La reserva no vence hasta que la confirmes o rechaces.</p>`
    : `<p style="color:#555">La reserva vence en 30 minutos si no la confirmás.</p>`;

  await client.emails.send({
    from,
    to: ownerEmail,
    subject: `Nueva reserva en "${data.raffleTitle}"`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#1a1a1a">Nueva reserva 🎟️</h2>
        <p><strong>${escapeHtml(data.buyerName)}</strong> reservó ${plural} <strong>${data.numbers.join(', ')}</strong> en tu rifa <strong>${title}</strong>.</p>
        <p>Total: <strong>${priceFormatter.format(data.total)}</strong>${promo}</p>
        ${comprobante}
        <p style="margin-top:24px">
          <a href="${env.FRONTEND_URL}/dashboard/raffles/${data.raffleId}" style="background:#6366f1;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">
            Revisar la reserva
          </a>
        </p>
        <p style="color:#aaa;font-size:12px;margin-top:32px">Rifando — no respondas este email.</p>
      </div>
    `,
  });
}

export interface MercadoPagoPaymentNotice {
  /**
   * approved: compra confirmada. late: la reserva ya no estaba vigente o la rifa no está activa.
   * mismatch: monto menor al total. duplicate: la compra ya estaba confirmada.
   * refunded: Mercado Pago devolvió o contracargó un pago que había confirmado la compra.
   */
  kind: 'approved' | 'late' | 'mismatch' | 'duplicate' | 'refunded';
  raffleId: string;
  raffleTitle: string;
  buyerName: string;
  numbers: number[];
  amount: number;
  netAmount: number | null;
  paymentId: number;
}

export async function notifyMercadoPagoPaymentEmail(ownerEmail: string, data: MercadoPagoPaymentNotice) {
  const client = getClient();
  if (!client) return;

  const from = env.RESEND_FROM ?? 'Rifando <notificaciones@rifando.com>';
  const title = escapeHtml(data.raffleTitle);
  const buyer = escapeHtml(data.buyerName);
  const amount = priceFormatter.format(data.amount);
  const net = data.netAmount !== null ? ` (neto recibido: ${priceFormatter.format(data.netAmount)})` : '';

  const subject =
    data.kind === 'approved'
      ? `Pago recibido en "${data.raffleTitle}"`
      : `Revisá un pago de Mercado Pago en "${data.raffleTitle}"`;

  const body =
    data.kind === 'approved'
      ? `<p><strong>${buyer}</strong> pagó <strong>${amount}</strong>${net} con Mercado Pago en tu rifa <strong>${title}</strong>.</p>
         <p>Números vendidos: <strong>${data.numbers.join(', ')}</strong>. Ya figuran como vendidos.</p>`
      : data.kind === 'late'
        ? `<p><strong>${buyer}</strong> pagó <strong>${amount}</strong>${net} con Mercado Pago en tu rifa <strong>${title}</strong>, pero su reserva ya había vencido, se había cancelado o la rifa ya no está activa.</p>
           <p>Asignale números a mano o devolvé el dinero desde Mercado Pago (pago N° ${data.paymentId}).</p>`
        : data.kind === 'mismatch'
          ? `<p><strong>${buyer}</strong> pagó <strong>${amount}</strong> con Mercado Pago en tu rifa <strong>${title}</strong>, pero el monto no cubre el total de la compra.</p>
             <p>La compra sigue pendiente. Revisá el pago N° ${data.paymentId} en Mercado Pago.</p>`
          : data.kind === 'duplicate'
            ? `<p><strong>${buyer}</strong> pagó <strong>${amount}</strong> con Mercado Pago en tu rifa <strong>${title}</strong>, pero esa compra ya estaba confirmada.</p>
               <p>Es un pago doble. Devolvé el dinero desde Mercado Pago (pago N° ${data.paymentId}).</p>`
            : `<p>Mercado Pago devolvió o contracargó el pago de <strong>${buyer}</strong> (${amount}) en tu rifa <strong>${title}</strong>.</p>
               <p>Los números <strong>${data.numbers.join(', ')}</strong> siguen vendidos. Liberalos si corresponde (pago N° ${data.paymentId}).</p>`;

  await client.emails.send({
    from,
    to: ownerEmail,
    subject,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#1a1a1a">${data.kind === 'approved' ? 'Pago recibido 💸' : 'Pago para revisar ⚠️'}</h2>
        ${body}
        <p style="margin-top:24px">
          <a href="${env.FRONTEND_URL}/dashboard/raffles/${data.raffleId}" style="background:#6366f1;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">
            Ver la rifa
          </a>
        </p>
        <p style="color:#aaa;font-size:12px;margin-top:32px">Rifando — no respondas este email.</p>
      </div>
    `,
  });
}

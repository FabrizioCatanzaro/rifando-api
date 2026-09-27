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

import { Resend } from 'resend';
import { env } from '../config/env';

let resend: Resend | null = null;

function getClient(): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  if (!resend) resend = new Resend(env.RESEND_API_KEY);
  return resend;
}

export async function notifyReservationEmail(
  raffleTitle: string,
  ownerEmail: string,
  reserved: number[],
  buyerName: string
) {
  const client = getClient();
  if (!client) return;

  const from = env.RESEND_FROM ?? 'Rifando <notificaciones@rifando.com>';
  const plural = reserved.length > 1 ? 'números' : 'número';

  await client.emails.send({
    from,
    to: ownerEmail,
    subject: `Nueva reserva en "${raffleTitle}"`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#1a1a1a">Nueva reserva 🎟️</h2>
        <p><strong>${buyerName}</strong> reservó el ${plural} <strong>${reserved.join(', ')}</strong> en tu rifa <strong>${raffleTitle}</strong>.</p>
        <p style="color:#555">Revisá el dashboard para confirmar el pago y marcar el número como vendido.</p>
        <p style="margin-top:24px">
          <a href="${env.FRONTEND_URL}/dashboard" style="background:#6366f1;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">
            Ir al dashboard
          </a>
        </p>
        <p style="color:#aaa;font-size:12px;margin-top:32px">Rifando — no respondas este email.</p>
      </div>
    `,
  });
}

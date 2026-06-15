import 'dotenv/config';

/**
 * Registra (o borra) el webhook del bot en Telegram.
 *
 *   npm run telegram:webhook                -> registra el webhook
 *   npm run telegram:webhook -- --delete    -> lo elimina
 *
 * Requiere en el .env:
 *   TELEGRAM_BOT_TOKEN
 *   TELEGRAM_WEBHOOK_SECRET
 *   API_PUBLIC_URL  (ej: https://rifando-api.onrender.com)
 */
async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const apiUrl = process.env.API_PUBLIC_URL;

  if (!token) throw new Error('Falta TELEGRAM_BOT_TOKEN');

  const remove = process.argv.includes('--delete');

  if (remove) {
    const res = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
      method: 'POST',
    });
    console.log('deleteWebhook:', await res.json());
    return;
  }

  if (!secret) throw new Error('Falta TELEGRAM_WEBHOOK_SECRET');
  if (!apiUrl) throw new Error('Falta API_PUBLIC_URL');

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: `${apiUrl.replace(/\/$/, '')}/api/telegram/webhook`,
      secret_token: secret,
      allowed_updates: ['message'],
    }),
  });

  console.log('setWebhook:', await res.json());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { handleUpdate, type TelegramUpdate } from './telegram.service';

const TELEGRAM_API = 'https://api.telegram.org';

let running = false;

interface GetUpdatesResponse {
  ok: boolean;
  result?: TelegramUpdate[];
}

/**
 * Long polling con getUpdates para desarrollo local, donde no hay una URL
 * HTTPS pública a la que Telegram pueda mandar el webhook. En producción se
 * usa el webhook (ver setup-telegram-webhook.ts); no llamar a esto ahí.
 */
export async function startTelegramPolling() {
  if (!env.TELEGRAM_BOT_TOKEN) {
    logger.warn('Telegram polling deshabilitado: falta TELEGRAM_BOT_TOKEN');
    return;
  }
  if (running) return;
  running = true;

  const base = `${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}`;

  // Un bot no puede tener webhook y getUpdates a la vez (getUpdates daría 409).
  // Borramos cualquier webhook previo antes de empezar a pollear.
  await fetch(`${base}/deleteWebhook`, { method: 'POST' }).catch(() => {});

  logger.info('Telegram polling iniciado (modo desarrollo)');

  let offset = 0;
  const allowed = encodeURIComponent('["message"]');

  while (running) {
    try {
      const res = await fetch(
        `${base}/getUpdates?timeout=30&offset=${offset}&allowed_updates=${allowed}`
      );
      const data = (await res.json()) as GetUpdatesResponse;

      if (!data.ok || !data.result) continue;

      for (const update of data.result) {
        if (update.update_id !== undefined) offset = update.update_id + 1;
        try {
          await handleUpdate(update);
        } catch (err) {
          logger.error({ err }, 'Error procesando update de Telegram');
        }
      }
    } catch (err) {
      logger.error({ err }, 'Error en polling de Telegram');
      // Espera breve para no martillar la API ante un error de red.
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

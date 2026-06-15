import app from './app';
import { env } from './config/env';
import { logger } from './utils/logger';
import { startTelegramPolling } from './modules/telegram/telegram.poller';

app.listen(env.PORT, () => {
  logger.info(`rifando-api running on port ${env.PORT} [${env.NODE_ENV}]`);

  // En desarrollo no hay URL pública para el webhook de Telegram,
  // así que recibimos los mensajes por long polling.
  if (env.NODE_ENV === 'development') {
    void startTelegramPolling();
  }
});

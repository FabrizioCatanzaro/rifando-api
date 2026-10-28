import app from './app';
import { env } from './config/env';
import { logger } from './utils/logger';
import { startTelegramPolling } from './modules/telegram/telegram.poller';

const server = app.listen(env.PORT, () => {
  logger.info(`rifando-api running on port ${env.PORT} [${env.NODE_ENV}] pid=${process.pid}`);
  logger.info(`Mercado Pago client_id: ${env.MERCADOPAGO_CLIENT_ID ?? '(no configurado)'}`);

  // En desarrollo no hay URL pública para el webhook de Telegram,
  // así que recibimos los mensajes por long polling.
  if (env.NODE_ENV === 'development') {
    void startTelegramPolling();
  }
});

// Sin este manejo, un puerto ocupado falla en silencio y sigue respondiendo el proceso viejo.
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`El puerto ${env.PORT} está ocupado por otro proceso. Cerralo y volvé a iniciar la API.`);
  } else {
    logger.error(err, 'No se pudo iniciar el servidor');
  }
  process.exit(1);
});

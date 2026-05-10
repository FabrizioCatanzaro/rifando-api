import app from './app';
import { env } from './config/env';
import { logger } from './utils/logger';

app.listen(env.PORT, () => {
  logger.info(`rifando-api running on port ${env.PORT} [${env.NODE_ENV}]`);
});

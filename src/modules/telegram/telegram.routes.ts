import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import * as controller from './telegram.controller';

const router = Router();

router.get('/status', requireAuth, controller.getStatus);
router.post('/link', requireAuth, controller.createLink);
router.post('/unlink', requireAuth, controller.unlink);

// Público: lo llama Telegram. Se valida con el header secreto.
router.post('/webhook', controller.webhook);

export default router;

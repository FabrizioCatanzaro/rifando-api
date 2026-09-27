import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import * as controller from './payments.controller';

// Montado en /api/payments
const router = Router();

router.get('/mp/status', requireAuth, controller.getStatus);
router.post('/mp/link', requireAuth, controller.createLink);
router.post('/mp/unlink', requireAuth, controller.unlink);
router.get('/mp/payments', requireAuth, controller.listPayments);

// Público: redirect de OAuth. Identifica al rifante por el state.
router.get('/mp/callback', controller.oauthCallback);

// El webhook se monta aparte en app.ts, antes del rate limiter general.

export default router;

// Montado en /api/raffles/:raffleId/purchases/:purchaseId/mercadopago (público, comprador)
export const checkoutRouter = Router({ mergeParams: true });
checkoutRouter.post('/', controller.createCheckout);
checkoutRouter.get('/', controller.getCheckoutStatus);

import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import * as controller from './fees.controller';

/** GET /api/fees: porcentajes vigentes para la calculadora de precio. */
export const feesConfigRouter = Router();
feesConfigRouter.get('/', controller.getConfig);

/** /api/raffles/:raffleId/fee-payment: comisión de ventas manuales. */
const router = Router({ mergeParams: true });
router.get('/fee-payment', requireAuth, controller.getFeePayment);
router.post('/fee-payment', requireAuth, controller.submitFeePayment);

export default router;

import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from './admin.middleware';
import * as controller from './admin.controller';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/draw-payments', controller.listDrawPayments);
router.patch('/draw-payments/:paymentId/approve', controller.approveDrawPayment);
router.patch('/draw-payments/:paymentId/reject', controller.rejectDrawPayment);

export default router;

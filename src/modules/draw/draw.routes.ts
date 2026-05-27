import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import * as controller from './draw.controller';

const router = Router({ mergeParams: true });

router.get('/draw-payment', requireAuth, controller.getDrawPayment);
router.post('/draw-payment', requireAuth, controller.submitDrawPayment);
router.post('/draw', requireAuth, controller.executeDraw);

export default router;

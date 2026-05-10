import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import * as controller from './promotions.controller';

const router = Router({ mergeParams: true });

router.get('/', controller.getPromotions);
router.post('/', requireAuth, controller.createPromotion);
router.patch('/:promotionId', requireAuth, controller.updatePromotion);
router.delete('/:promotionId', requireAuth, controller.deletePromotion);

export default router;

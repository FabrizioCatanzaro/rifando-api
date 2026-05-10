import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import * as controller from './prizes.controller';

const router = Router({ mergeParams: true });

router.get('/', controller.getPrizes);
router.post('/', requireAuth, controller.createPrize);
router.patch('/:prizeId', requireAuth, controller.updatePrize);
router.delete('/:prizeId', requireAuth, controller.deletePrize);

export default router;

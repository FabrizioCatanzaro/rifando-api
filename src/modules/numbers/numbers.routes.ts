import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import * as controller from './numbers.controller';

const router = Router({ mergeParams: true });

router.get('/', controller.getNumbers);
router.post('/reserve', controller.reserveNumbers);
router.delete('/reserve', controller.releaseReservation);
router.get('/buyers', requireAuth, controller.getBuyers);
router.post('/bulk-sell', requireAuth, controller.bulkSell);
router.post('/bulk-release', requireAuth, controller.bulkRelease);
router.patch('/:number/sell', requireAuth, controller.sellNumber);
router.patch('/:number/release', requireAuth, controller.releaseNumber);
router.patch('/:number/buyer', requireAuth, controller.updateBuyer);

export default router;

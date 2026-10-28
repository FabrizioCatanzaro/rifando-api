import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { reserveLimiter } from '../../middleware/rateLimiter';
import * as controller from './numbers.controller';

const router = Router({ mergeParams: true });

// Públicas (comprador)
router.get('/', controller.getNumbers);
router.post('/reserve', reserveLimiter, controller.reserveNumbers);
router.delete('/reserve', controller.releaseReservation);

// Dueño de la rifa
router.get('/purchases', requireAuth, controller.getPendingPurchases);
router.post('/purchases/:purchaseId/confirm', requireAuth, controller.confirmPurchase);
router.post('/purchases/:purchaseId/reject', requireAuth, controller.rejectPurchase);
router.get('/buyers', requireAuth, controller.getBuyers);
router.post('/bulk-sell', requireAuth, controller.bulkSell);
router.post('/bulk-release', requireAuth, controller.bulkRelease);
router.patch('/:number/sell', requireAuth, controller.sellNumber);
router.patch('/:number/release', requireAuth, controller.releaseNumber);
router.patch('/:number/buyer', requireAuth, controller.updateBuyer);

export default router;

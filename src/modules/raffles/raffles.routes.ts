import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import * as controller from './raffles.controller';

const router = Router();

// My raffles (authenticated)
router.get('/', requireAuth, controller.getMyRaffles);
router.post('/', requireAuth, controller.createRaffle);
router.patch('/:raffleId', requireAuth, controller.updateRaffle);
router.delete('/:raffleId', requireAuth, controller.deleteRaffle);
router.post('/:raffleId/finish', requireAuth, controller.finishRaffle);

export default router;

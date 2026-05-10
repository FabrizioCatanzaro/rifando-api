import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import * as controller from './users.controller';

const router = Router();

router.get('/:username', controller.getPublicProfile);
router.get('/:username/raffles', controller.getPublicRaffles);
router.patch('/profile', requireAuth, controller.updateProfile);

export default router;

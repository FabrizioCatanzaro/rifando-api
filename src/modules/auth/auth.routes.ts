import { Router } from 'express';
import { authLimiter } from '../../middleware/rateLimiter';
import { requireAuth } from '../../middleware/auth';
import * as controller from './auth.controller';

const router = Router();

router.post('/register', authLimiter, controller.register);
router.post('/login', authLimiter, controller.login);
router.post('/logout', controller.logout);
router.post('/refresh', controller.refresh);
router.get('/me', requireAuth, controller.me);

export default router;

import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { uploadComprobanteLimiter } from '../../middleware/rateLimiter';
import { uploadImage, uploadComprobante } from './upload.controller';

const router = Router();

router.post('/image', requireAuth, uploadImage);
router.post('/comprobante', uploadComprobanteLimiter, uploadComprobante);

export default router;

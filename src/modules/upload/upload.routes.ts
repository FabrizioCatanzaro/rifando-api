import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { uploadImage, uploadComprobante } from './upload.controller';

const router = Router();

router.post('/image', requireAuth, uploadImage);
router.post('/comprobante', uploadComprobante);

export default router;

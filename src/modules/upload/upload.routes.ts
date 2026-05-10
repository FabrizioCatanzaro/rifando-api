import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { uploadImage } from './upload.controller';

const router = Router();

router.post('/image', requireAuth, uploadImage);

export default router;

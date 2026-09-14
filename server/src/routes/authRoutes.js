import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { getCurrentAccount } from '../controllers/authController.js';

const router = Router();

router.get('/me', requireAuth, getCurrentAccount);

export default router;
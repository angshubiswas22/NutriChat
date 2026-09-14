import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  getMyProfile,
  syncMyProfile,
} from '../controllers/userController.js';

const router = Router();

router.use(requireAuth);

router.get('/me', getMyProfile);
router.put('/me', syncMyProfile);

export default router;
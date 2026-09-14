import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { recoveryLimit } from '../middleware/recoveryLimit.js';
import {
  generateRecoveryCodes,
  redeemRecoveryCode,
} from '../controllers/recoveryController.js';

const router = Router();

router.post(
  '/codes',
  requireAuth,
  recoveryLimit('issue', 5),
  generateRecoveryCodes
);

router.post(
  '/redeem',
  recoveryLimit('redeem', 20),
  redeemRecoveryCode
);

export default router;
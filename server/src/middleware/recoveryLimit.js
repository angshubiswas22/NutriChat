import { createHash } from 'node:crypto';
import RecoveryAttempt from '../models/RecoveryAttempt.js';

export function recoveryLimit(scope, limit) {
  return async (req, res, next) => {
    res.set('Cache-Control', 'no-store');

    const windowMs = 15 * 60 * 1000;
    const bucket = Math.floor(Date.now() / windowMs);
    const identity = scope === 'issue' ? req.user.uid : req.ip;
    const digest = createHash('sha256')
      .update(String(identity))
      .digest('hex');
    const _id = `${scope}:${bucket}:${digest}`;

    try {
      const update = {
        $inc: { count: 1 },
        $setOnInsert: {
          expiresAt: new Date((bucket + 2) * windowMs),
        },
      };

      let record;

      try {
        record = await RecoveryAttempt.findOneAndUpdate(
          { _id },
          update,
          { upsert: true, returnDocument: 'after' }
        ).lean();
      } catch (error) {
        if (error.code !== 11000) throw error;

        record = await RecoveryAttempt.findOneAndUpdate(
          { _id },
          { $inc: { count: 1 } },
          { returnDocument: 'after' }
        ).lean();
      }

      if (!record || record.count > limit) {
        res.set(
          'Retry-After',
          String(Math.ceil(
            ((bucket + 1) * windowMs - Date.now()) / 1000
          ))
        );

        return res.status(429).json({
          message: 'Too many recovery requests. Try again in 15 minutes.',
        });
      }

      return next();
    } catch {
      return res.status(503).json({
        message: 'Recovery is temporarily unavailable.',
      });
    }
  };
}
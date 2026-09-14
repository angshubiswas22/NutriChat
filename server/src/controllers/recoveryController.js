import { createHash, randomBytes } from 'node:crypto';
import { firebaseAuth } from '../config/firebaseAdmin.js';
import RecoverySet from '../models/RecoverySet.js';

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fingerprint(user) {
  const factors = (user.multiFactor?.enrolledFactors || [])
    .map((factor) => `${factor.factorId}:${factor.uid}`)
    .sort();

  return hash(JSON.stringify([user.email, factors]));
}

export async function generateRecoveryCodes(req, res) {
  res.set('Cache-Control', 'no-store');

  const age = Date.now() / 1000 - req.auth?.auth_time;
  const factorId = req.auth?.firebase?.second_factor_identifier;

  if (
    !Number.isFinite(age) ||
    age < -30 ||
    age > 300 ||
    req.auth?.firebase?.sign_in_second_factor !== 'totp' ||
    !factorId
  ) {
    return res.status(403).json({
      message:
        'Sign out and sign in with your authenticator, then generate codes within five minutes.',
    });
  }

  try {
    const user = await firebaseAuth.getUser(req.user.uid);
    const factors = user.multiFactor?.enrolledFactors || [];

    if (
      user.disabled ||
      !user.emailVerified ||
      !factors.some((factor) => factor.uid === factorId) ||
      factors.some((factor) => factor.factorId !== 'totp')
    ) {
      return res.status(403).json({
        message: 'Sign in again with your currently enrolled authenticator.',
      });
    }

    const raw = Array.from(
      { length: 8 },
      () => randomBytes(16).toString('hex').toUpperCase()
    );

    await RecoverySet.findOneAndUpdate(
      { _id: user.uid, state: { $ne: 'processing' } },
      {
        $set: {
          hashes: raw.map(hash),
          fingerprint: fingerprint(user),
          state: 'ready',
        },
      },
      {
        upsert: true,
        runValidators: true,
        returnDocument: 'after',
      }
    );

    return res.json({
      codes: raw.map((code) => code.match(/.{8}/g).join('-')),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message:
          'A recovery is already in progress. Do not generate another set yet.',
      });
    }

    console.error(
      'Recovery code generation failed:',
      error.code || error.name
    );

    return res.status(503).json({
      message: 'Could not generate recovery codes. Try again later.',
    });
  }
}

export async function redeemRecoveryCode(req, res) {
  res.set('Cache-Control', 'no-store');

  const input = req.body?.code;
  const code = typeof input === 'string' && input.length <= 128
    ? input.replace(/[\s-]/g, '').toUpperCase()
    : '';

  const invalid = () => res.status(400).json({
    message: 'This recovery code is invalid or no longer usable.',
  });

  if (!/^[A-F0-9]{32}$/.test(code)) return invalid();

  let claimed;

  try {
    // Only one request can claim a set.
    // Claiming invalidates every code in it.
    claimed = await RecoverySet.findOneAndUpdate(
      { state: 'ready', hashes: hash(code) },
      { $set: { state: 'processing', hashes: [] } },
      { returnDocument: 'after' }
    ).lean();

    if (!claimed) return invalid();

    const user = await firebaseAuth.getUser(claimed._id);

    if (
      user.disabled ||
      !user.emailVerified ||
      !user.multiFactor?.enrolledFactors?.length ||
      fingerprint(user) !== claimed.fingerprint
    ) {
      await RecoverySet.updateOne(
        { _id: claimed._id, state: 'processing' },
        { $set: { state: 'blocked' } }
      );

      return invalid();
    }

    await firebaseAuth.revokeRefreshTokens(user.uid);

    await firebaseAuth.updateUser(user.uid, {
      multiFactor: { enrolledFactors: [] },
    });

    await firebaseAuth.revokeRefreshTokens(user.uid);

    await RecoverySet.updateOne(
      { _id: user.uid, state: 'processing' },
      { $set: { state: 'used' } }
    );

    return res.json({
      message:
        'Authenticator reset. Sign in with your password or Google account, set up 2FA again, and generate new recovery codes.',
    });
  } catch (error) {
    console.error('Account recovery failed:', error.code || error.name);

    // Never replay an uncertain Firebase reset:
    // it could erase a newly enrolled factor.
    if (claimed) {
      try {
        await RecoverySet.updateOne(
          { _id: claimed._id, state: 'processing' },
          { $set: { state: 'blocked' } }
        );
      } catch {
        // Retain the processing lock if the database is unavailable.
      }
    }

    return res.status(503).json({
      message: claimed
        ? 'Recovery could not finish. This code set has been retired. Try normal sign-in; if still blocked, contact the NutriChat owner.'
        : 'Recovery is temporarily unavailable. Please try again later.',
    });
  }
}
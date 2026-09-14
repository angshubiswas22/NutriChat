import { firebaseAuth } from '../config/firebaseAdmin.js';

const invalidTokenCodes = new Set([
  'auth/argument-error',
  'auth/invalid-id-token',
  'auth/id-token-expired',
  'auth/id-token-revoked',
  'auth/user-disabled',
  'auth/user-not-found',
]);

export async function requireAuth(req, res, next) {
  res.set('Cache-Control', 'no-store');

  const match = /^Bearer ([^\s]+)$/i.exec(
    req.get('Authorization') || ''
  );

  if (!match) {
    return res.status(401).json({
      message: 'Sign in to access this resource.',
    });
  }

  let token;

    try {
        token = await firebaseAuth.verifyIdToken(match[1], true);
    } catch (error) {
        if (invalidTokenCodes.has(error.code)) {
        return res.status(401).json({
            message: 'Your sign-in is invalid or expired. Please sign in again.',
        });
        }

        const detail = String(error.message || '')
    .replace(
        /-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g,
        '[private key hidden]'
    )
    .replace(
        /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
        '[token hidden]'
    )
    .replace(
        /\bya29\.[A-Za-z0-9._~-]+/g,
        '[access token hidden]'
    );

    console.error('Firebase verification failed:', error.code || 'unknown');
    console.error('Firebase details:', detail);

    return res.status(503).json({
      message: 'Account verification is temporarily unavailable. Try again later.',
    });
  }

  if (token.email_verified !== true) {
    return res.status(403).json({
      message: 'Verify your email before accessing your account data.',
    });
  }
req.auth = token;
  req.user = {
  
    uid: token.uid,
    email: token.email,
  };

  return next();
}
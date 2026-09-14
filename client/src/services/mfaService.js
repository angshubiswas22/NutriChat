import {
  EmailAuthProvider,
  GoogleAuthProvider,
  getMultiFactorResolver,
  multiFactor,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  reload,
  TotpMultiFactorGenerator,
  signOut,
} from 'firebase/auth';
import { auth } from '../config/firebase.js';
import { authErrorMessage } from './authService.js';

function fail(message) {
  const error = new Error(message);
  error.code = 'nutrichat/mfa';
  throw error;
}

function currentAccount(uid) {
  const user = auth.currentUser;
  if (!user || user.uid !== uid) fail('Your account changed. Sign in again.');
  if (!user.emailVerified) fail('Verify your email before setting up 2FA.');
  return user;
}

function factors(user) {
  return multiFactor(user).enrolledFactors;
}

function validateCode(code) {
  if (!/^\d{6}$/.test(code)) fail('Enter the six-digit authenticator code.');
}

export async function getSecurityStatus(uid) {
  const user = currentAccount(uid);
  await reload(user);
  currentAccount(uid);
  return {
    enabled: factors(user).some(
      (factor) => factor.factorId === TotpMultiFactorGenerator.FACTOR_ID
    ),
    methods: user.providerData.map((provider) => provider.providerId)
      .filter((id) => id === 'password' || id === 'google.com'),
  };
}

export async function startTotpSetup(uid, method, password) {
  const user = currentAccount(uid);
  if (factors(user).length) fail('A second factor is already registered. Reload this page.');

  if (method === 'password') {
    const credential = EmailAuthProvider.credential(user.email, password);
    await reauthenticateWithCredential(user, credential);
  } else if (method === 'google.com') {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await reauthenticateWithPopup(user, provider);
  } else {
    fail('This sign-in method does not support our setup screen yet.');
  }

  currentAccount(uid);
  // Refresh factors in case another tab enrolled one during reauthentication.
  await reload(user);
  currentAccount(uid);
  if (factors(user).length) fail('A second factor is already registered. Reload this page.');
  const session = await multiFactor(user).getSession();
  currentAccount(uid);
  const secret = await TotpMultiFactorGenerator.generateSecret(session);
  currentAccount(uid);
  return { uid, secret };
}

export async function finishTotpSetup(setup, code) {
  validateCode(code);
  const user = currentAccount(setup.uid);
  const assertion = TotpMultiFactorGenerator.assertionForEnrollment(setup.secret, code);
  await multiFactor(user).enroll(assertion, 'Authenticator app');
}

export function getTotpChallenge(error) {
  const resolver = getMultiFactorResolver(auth, error);
  const choices = resolver.hints.filter(
    (hint) => hint.factorId === TotpMultiFactorGenerator.FACTOR_ID
  );
  if (!choices.length) fail('This account needs a second-factor method this app does not support yet.');
  return { resolver, choices };
}

export async function finishTotpSignIn(challenge, factorUid, code) {
  validateCode(code);
  if (!challenge.choices.some((factor) => factor.uid === factorUid)) {
    fail('Choose an authenticator from the list.');
  }
  const assertion = TotpMultiFactorGenerator.assertionForSignIn(factorUid, code);
  await challenge.resolver.resolveSignIn(assertion);
  return 'Signed in with two-factor authentication.';
}

export function mfaErrorMessage(error) {
  if (error.code === 'nutrichat/mfa') return error.message;
  const messages = {
    'auth/invalid-verification-code': 'Incorrect or expired code. Enter the current code from your authenticator.',
    'auth/missing-verification-code': 'Enter your authenticator code.',
    'auth/code-expired': 'This attempt expired. Cancel and start again.',
    'auth/invalid-multi-factor-session': 'This attempt expired. Cancel and start again.',
    'auth/missing-multi-factor-session': 'Cancel and start again.',
    'auth/multi-factor-info-not-found': 'This authenticator is no longer available. Cancel and sign in again.',
    'auth/requires-recent-login': 'Sign out, sign in again, and retry setup.',
    'auth/user-token-expired': 'Your session expired. Sign out and sign in again.',
    'auth/user-mismatch': 'Choose the Google account you are currently signed in with.',
    'auth/unverified-email': 'Verify your email before setting up 2FA.',
    'auth/second-factor-already-in-use': 'This authenticator is already registered. Reload the page.',
    'auth/maximum-second-factor-count-exceeded': 'This account already has the maximum number of second factors.',
    'auth/multi-factor-auth-required': 'Your account already has 2FA. Sign out and sign in again.',
  };
  return messages[error.code] || authErrorMessage(error);
}
export async function beginTotpRemoval(uid, method, password) {
  const user = currentAccount(uid);

  try {
    if (method === 'password') {
      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);
    } else if (method === 'google.com') {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await reauthenticateWithPopup(user, provider);
    } else {
      fail('Choose a supported verification method.');
    }
  } catch (error) {
    currentAccount(uid);
    if (error.code !== 'auth/multi-factor-auth-required') throw error;
    return { ...getTotpChallenge(error), uid };
  }

  fail('Firebase did not request a second factor. Sign out, sign in again, and check your 2FA status.');
}

export async function finishTotpRemoval(operation, factorUid, code) {
  validateCode(code);
  currentAccount(operation.uid);

  if (!operation.choices.some((factor) => factor.uid === factorUid)) {
    fail('Choose an authenticator from the list.');
  }

  const assertion = TotpMultiFactorGenerator.assertionForSignIn(factorUid, code);
  await operation.resolver.resolveSignIn(assertion);

  const user = currentAccount(operation.uid);
  if (!factors(user).some((factor) => factor.uid === factorUid)) {
    fail('This authenticator is no longer registered. Reload the page.');
  }

  try {
    await multiFactor(user).unenroll(factorUid);
  } catch (error) {
    // Firebase can end the session when an enrolled factor is removed.
    // Sign in again to confirm the resulting account state.
    if (error.code !== 'auth/user-token-expired') throw error;
  }

  if (auth.currentUser?.uid === operation.uid) {
    await signOut(auth);
  }
}
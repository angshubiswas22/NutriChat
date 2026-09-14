import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  onAuthStateChanged,
  reload,
  signOut,
} from 'firebase/auth';
import { auth } from '../config/firebase.js';

function profile(user) {
  return user
    ? { uid: user.uid, email: user.email, emailVerified: user.emailVerified }
    : null;
}

export function observeUser(callback, onError) {
  return onAuthStateChanged(auth, (user) => callback(profile(user)), onError);
}

export async function register(email, password) {
  const result = await createUserWithEmailAndPassword(auth, email, password);

  try {
    await sendEmailVerification(result.user);
    return 'Account created. Check your inbox and spam folder for verification.';
  } catch {
    return 'Account created, but the verification email could not be sent. Use the resend button below.';
  }
}

export async function login(email, password) {
  await signInWithEmailAndPassword(auth, email, password);
  return 'Signed in.';
}

export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(auth, provider);
  return 'Signed in with Google.';
}

export async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
  }

  return 'If this email has a password account, you will receive a reset link. Check your spam folder too.';
}

export async function resendVerification() {
  if (!auth.currentUser) throw new Error('No signed-in user');

  await sendEmailVerification(auth.currentUser);
  return 'Verification email sent. Check your inbox and spam folder.';
}

export async function refreshUser() {
  if (!auth.currentUser) throw new Error('No signed-in user');

  await reload(auth.currentUser);
  await auth.currentUser.getIdToken(true);
  return profile(auth.currentUser);
}

export async function logout() {
  await signOut(auth);
  return 'Signed out.';
}

export function authErrorMessage(error) {
  const messages = {
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/wrong-password': 'Email or password is incorrect.',
    'auth/user-not-found': 'Email or password is incorrect.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/email-already-in-use':
      'Unable to create this account. Try signing in or resetting your password.',
    'auth/weak-password': 'Choose a stronger password.',
    'auth/password-does-not-meet-requirements':
      'Your password does not meet the account password requirements.',
    'auth/too-many-requests':
      'Too many attempts. Please wait before trying again.',
    'auth/network-request-failed':
      'Connection failed. Check your internet connection.',
    'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
    'auth/cancelled-popup-request':
      'Please finish the existing sign-in window.',
    'auth/popup-blocked':
      'Allow popups for this site, then try Google sign-in again.',
    'auth/unauthorized-domain':
      'This website address is not authorized in Firebase.',
    'auth/operation-not-allowed':
      'Enable this sign-in method in Firebase Authentication.',
    'auth/account-exists-with-different-credential':
      'Sign in using the method you originally used for this account.',
    'auth/user-disabled': 'This account is disabled.',
  };

  return messages[error.code] || 'The request failed. Please try again.';
}
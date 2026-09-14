const API_BASE_URL = (
  import.meta.env.VITE_API_URL || 'http://localhost:5000'
).replace(/\/$/, '');

import { auth } from '../config/firebase.js';

export async function getHealth(signal) {
  const response = await fetch(`${API_BASE_URL}/api/health`, { signal });

  if (!response.ok) {
    throw new Error(`Backend returned HTTP ${response.status}`);
  }

  const data = await response.json();

  if (data.status !== 'ok' || typeof data.message !== 'string') {
    throw new Error('Unexpected health response');
  }

  return data;
}

export async function getCurrentAccount() {
  const user = auth.currentUser;

  if (!user) {
    throw new Error('Please sign in first.');
  }

  const token = await user.getIdToken();

  const response = await fetch(API_BASE_URL + '/api/auth/me', {
    headers: {
      Authorization: 'Bearer ' + token,
    },
    signal: AbortSignal.timeout(15000),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Could not check account access.');
  }

  return data.user;
}
async function requestMyProfile(method, signal) {
  const user = auth.currentUser;

  if (!user) {
    throw new Error('Please sign in first.');
  }

  const token = await user.getIdToken();
  signal?.throwIfAborted();

  const timeout = AbortSignal.timeout(15000);
  const requestSignal = signal
    ? AbortSignal.any([signal, timeout])
    : timeout;

  const response = await fetch(API_BASE_URL + '/api/users/me', {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
    },
    signal: requestSignal,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Could not access your profile.');
  }

  return data.profile;
}

export function syncMyProfile(signal) {
  return requestMyProfile('PUT', signal);
}

export function getMyProfile(signal) {
  return requestMyProfile('GET', signal);
}
async function recoveryRequest(path, body, uid) {
  const headers = { 'Content-Type': 'application/json' };

  if (uid) {
    const user = auth.currentUser;

    if (user?.uid !== uid) {
      throw new Error('Sign in again before generating recovery codes.');
    }

    headers.Authorization = 'Bearer ' + await user.getIdToken(true);

    if (auth.currentUser?.uid !== uid) {
      throw new Error('Your account changed. Try again.');
    }
  }

  const response = await fetch(
    API_BASE_URL + '/api/recovery/' + path,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    }
  );

  const data = await response.json();

  if (uid && auth.currentUser?.uid !== uid) {
    throw new Error('Your account changed. Try again.');
  }

  if (!response.ok) {
    throw new Error(data.message || 'Recovery request failed.');
  }

  return data;
}

export function generateRecoveryCodes(uid) {
  return recoveryRequest('codes', {}, uid);
}

export function redeemRecoveryCode(code) {
  return recoveryRequest('redeem', { code });
}
export async function sendChatMessage(uid, message, history, signal) {
  const user = auth.currentUser;

  if (user?.uid !== uid) {
    throw new Error('Please sign in again.');
  }

  const token = await user.getIdToken();
  signal?.throwIfAborted();

  if (auth.currentUser?.uid !== uid) {
    throw new Error('Your account changed. Please try again.');
  }

  const timeout = AbortSignal.timeout(130000);

  const response = await fetch(
    API_BASE_URL + '/api/chat/messages',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
      },
      body: JSON.stringify({ message, history }),
      signal: signal
        ? AbortSignal.any([signal, timeout])
        : timeout,
    }
  );

  const data = await response.json();

  if (auth.currentUser?.uid !== uid) {
    throw new Error('Your account changed. Please try again.');
  }

  if (!response.ok) {
    throw new Error(data.message || 'Could not get a reply.');
  }

  if (typeof data.reply !== 'string' || !data.reply.trim()) {
    throw new Error('NutriChat returned an empty reply.');
  }

  return data;
}
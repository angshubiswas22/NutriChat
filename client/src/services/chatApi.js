import { auth } from '../config/firebase.js';

const base = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '') + '/api/chat';

async function request(uid, path, { method = 'GET', body, signal, binary = false } = {}) {
  const user = auth.currentUser;
  if (user?.uid !== uid) throw new Error('Please sign in again.');
  const token = await user.getIdToken();
  signal?.throwIfAborted();
  if (auth.currentUser?.uid !== uid) throw new Error('Your account changed. Please sign in again.');
  const timeout = AbortSignal.timeout(path.endsWith('/messages') ? 200000 : path.endsWith('/prepare') ? 140000 : 20000);
  let response;
  try {
    response = await fetch(base + path, {
      method, cache: 'no-store',
      headers: { Authorization: 'Bearer ' + token, ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw Object.assign(new Error(timeout.aborted
      ? 'The request timed out. Reload the chat to check whether your reply was saved.'
      : 'Could not reach NutriChat. Check that the backend is running, then reload the chat.'), { code: 'NETWORK_ERROR' });
  }
  if (auth.currentUser?.uid !== uid) throw new Error('Your account changed. Please sign in again.');
  if (response.status === 204) return null;
  if (binary && response.ok) {
    const blob = await response.blob();
    signal?.throwIfAborted();
    if (auth.currentUser?.uid !== uid) throw new Error('Your account changed.');
    if (blob.type !== 'image/jpeg') throw new Error('Unexpected image response.');
    return blob;
  }
  let data;
  try { data = await response.json(); }
  catch { throw Object.assign(new Error('Unexpected server response. Reload the chat before retrying.'), { code: 'NETWORK_ERROR' }); }
  if (!response.ok) throw Object.assign(new Error(data.message || 'Chat request failed.'), {
    status: response.status, code: data.code,
  });
  signal?.throwIfAborted();
  if (auth.currentUser?.uid !== uid) throw new Error('Your account changed. Please sign in again.');
  return data;
}

export const listChats = (uid, cursor, signal) => request(uid, '/conversations' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''), { signal });
export const createChat = (uid, conversationId, signal) => request(uid, '/conversations', { method: 'POST', body: { conversationId }, signal });
export const readChat = (uid, id, before, signal) => request(uid, '/conversations/' + encodeURIComponent(id)
  + (before ? '?before=' + before : ''), { signal });
export const deleteChat = (uid, id, revision, signal) => request(uid, '/conversations/' + encodeURIComponent(id), {
  method: 'DELETE', body: { revision }, signal,
});
export function sendMessage(uid, id, payload, signal) {
  const { file, ...fields } = payload;
  let body = fields;
  if (file) {
    body = new FormData();
    for (const [key, value] of Object.entries(fields)) if (value !== undefined) body.append(key, String(value));
    body.append('image', file);
  }
  return request(uid, '/conversations/' + encodeURIComponent(id) + '/messages', { method: 'POST', body, signal });
}
export const fetchChatImage = (uid, id, requestId, signal) => request(uid,
  '/conversations/' + encodeURIComponent(id) + '/images/' + encodeURIComponent(requestId), { signal, binary: true });

export const listMemories = (uid, before, signal) => request(uid, '/memory' + (before ? '?before=' + before : ''), { signal });
export const forgetMemory = (uid, id, signal) => request(uid, '/memory/' + encodeURIComponent(id), { method: 'DELETE', signal });
export const forgetAllMemory = (uid, signal) => request(uid, '/memory', { method: 'DELETE', signal });
export async function prepareMemories(uid, signal, onProgress) {
  let count = 0;
  for (;;) {
    signal?.throwIfAborted();
    const data = await request(uid, '/memory/prepare', { method: 'POST', body: {}, signal });
    count += data.processed;
    onProgress?.(count, data.remaining);
    if (data.remaining === 0) return;
  }
}

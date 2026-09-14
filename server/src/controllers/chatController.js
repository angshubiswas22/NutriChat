import {
  UUID, problem, createConversation, listConversations, getConversation,
  deleteConversation, sendSavedMessage,
} from '../services/conversationService.js';

function id(req) {
  if (!UUID.test(req.params.id || '')) throw problem(400, 'Invalid chat ID.');
  return req.params.id;
}
function revision(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw problem(400, 'Invalid chat version. Reload the chat.');
  return value;
}

export async function listChats(req, res) {
  if (req.query.cursor !== undefined && (typeof req.query.cursor !== 'string' || req.query.cursor.length > 100)) {
    throw problem(400, 'Invalid chat list cursor.');
  }
  res.json(await listConversations(req.user.uid, req.query.cursor));
}
export async function createChat(req, res) {
  const value = req.body?.conversationId;
  if (typeof value !== 'string' || !UUID.test(value)) throw problem(400, 'Invalid new chat ID.');
  res.status(201).json({ conversation: await createConversation(req.user.uid, value) });
}
export async function readChat(req, res) {
  let before;
  if (req.query.before !== undefined) {
    if (typeof req.query.before !== 'string' || !/^[1-9]\d{0,9}$/.test(req.query.before)) {
      throw problem(400, 'Invalid message cursor.');
    }
    before = Number(req.query.before);
  }
  res.json(await getConversation(req.user.uid, id(req), before));
}
export async function removeChat(req, res) {
  await deleteConversation(req.user.uid, id(req), revision(req.body?.revision));
  res.status(204).end();
}
export async function sendMessage(req, res) {
  const imageRef = req.body?.imageRef;
  if (imageRef !== undefined && (typeof imageRef !== 'string' || !UUID.test(imageRef))) throw problem(400, 'Invalid saved photo.');
  if (req.file && imageRef) throw problem(400, 'Choose one new or saved photo.');
  let version = req.body?.revision;
  if (req.is('multipart/form-data') && typeof version === 'string' && /^(0|[1-9]\d*)$/.test(version)) version = Number(version);
  const text = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  const message = text || (req.file || imageRef ? 'Help me understand this photo for nutrition or fitness.' : '');
  if (!message || message.length > 1000 || Buffer.byteLength(message) > 4000) {
    throw problem(400, 'Enter a message of up to 1,000 characters.');
  }
  const requestId = req.body?.requestId;
  if (typeof requestId !== 'string' || !UUID.test(requestId)) throw problem(400, 'Invalid message request ID.');
  if (req.body.history !== undefined) throw problem(400, 'Chat history is loaded from your saved conversation.');
  const result = await sendSavedMessage(req.user.uid, id(req), {
    message, requestId, revision: revision(version), file: req.file, imageRef,
  });
  if (!res.destroyed) res.json(result);
}

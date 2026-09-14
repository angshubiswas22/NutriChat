import { normalizeImage, savedImage, MAX_CHAT_IMAGE_BYTES } from './imageService.js';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import Conversation from '../models/Conversation.js';
import ChatTurn from '../models/ChatTurn.js';
import MemoryRecord from '../models/MemoryRecord.js';
import { ensureMemoryStorage, pendingMemory, retrieveMemories } from './memoryService.js';
import { generateChatReply } from './aiService.js';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 20;
const transactionOptions = {
  readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' },
  maxCommitTimeMS: 10000,
};
let storageReady;
async function ensureStorage() {
  // Wait for both collections and their indexes before the first transaction.
  storageReady ||= ensureMemoryStorage().catch(error => {
    storageReady = null;
    throw error;
  });
  await storageReady;
}

export function problem(status, message, code = 'CHAT_ERROR') {
  return Object.assign(new Error(message), { status, code });
}

export function publicConversation(doc) {
  return {
    id: doc._id, title: doc.title, revision: doc.revision,
    createdAt: doc.createdAt, updatedAt: doc.updatedAt,
    generating: Boolean(doc.leaseUntil && new Date(doc.leaseUntil) > new Date()),
  };
}

function publicTurn(doc) {
  return {
    imageMeta: doc.imageMeta || null,
    requestId: doc.requestId, ordinal: doc.ordinal, user: doc.user,
    assistant: doc.assistant, truncated: doc.truncated, createdAt: doc.createdAt,
  };
}

async function owned(uid, id) {
  await ensureStorage();
  const doc = await Conversation.findOne({ _id: id, ownerUid: uid }).lean();
  if (!doc) throw problem(404, 'Chat not found.', 'CHAT_NOT_FOUND');
  return doc;
}

export async function createConversation(uid, id) {
  await ensureStorage();
  try {
    const doc = await Conversation.findOneAndUpdate(
      { _id: id, ownerUid: uid },
      { $setOnInsert: { title: 'New chat', revision: 0, createdAt: new Date(), updatedAt: new Date() } },
      { upsert: true, returnDocument: 'after', runValidators: true, timestamps: false,
        writeConcern: { w: 'majority' } },
    ).lean();
    return publicConversation(doc);
  } catch (error) {
    if (error.code === 11000) throw problem(409, 'Please start a new chat again.');
    throw error;
  }
}

export async function listConversations(uid, cursor) {
  await ensureStorage();
  const filter = { ownerUid: uid };
  if (cursor) {
    const [dateText, id, extra] = cursor.split('|');
    const date = new Date(dateText);
    if (extra !== undefined || !UUID.test(id || '') || !Number.isFinite(date.getTime())
        || date.toISOString() !== dateText) throw problem(400, 'Invalid chat list cursor.');
    filter.$or = [{ createdAt: { $lt: date } }, { createdAt: date, _id: { $lt: id } }];
  }
  const docs = await Conversation.find(filter).sort({ createdAt: -1, _id: -1 })
    .limit(PAGE_SIZE + 1).lean();
  const page = docs.slice(0, PAGE_SIZE);
  const last = page.at(-1);
  return {
    conversations: page.map(publicConversation),
    nextCursor: docs.length > PAGE_SIZE ? last.createdAt.toISOString() + '|' + last._id : null,
  };
}

export async function getConversation(uid, id, before) {
  const doc = await owned(uid, id);
  const upper = before ? Math.min(before - 1, doc.revision) : doc.revision;
  const docs = await ChatTurn.find({ ownerUid: uid, conversationId: id, ordinal: { $lte: upper } })
    .sort({ ordinal: -1 }).limit(PAGE_SIZE + 1).lean();
  const page = docs.slice(0, PAGE_SIZE).reverse();
  return {
    conversation: publicConversation(doc), turns: page.map(publicTurn),
    nextBefore: docs.length > PAGE_SIZE ? page[0].ordinal : null,
  };
}

export async function deleteConversation(uid, id, revision) {
  await ensureStorage();
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const doc = await Conversation.findOne({ _id: id, ownerUid: uid }).session(session).lean();
      if (!doc) throw problem(404, 'Chat not found.', 'CHAT_NOT_FOUND');
      if (doc.revision !== revision) throw problem(409, 'This chat changed. Reload it before deleting.', 'CHAT_CHANGED');
      await Conversation.deleteOne({ _id: id, ownerUid: uid }, { session });
      await ChatTurn.deleteMany({ conversationId: id, ownerUid: uid }, { session });
      await MemoryRecord.deleteMany({ conversationId: id, ownerUid: uid }, { session });
    }, transactionOptions);
  } finally { await session.endSession(); }
}

async function previousResult(uid, id, requestId, message, imageHash) {
  const turn = await ChatTurn.findOne({ ownerUid: uid, conversationId: id, requestId }).select('+imageHash').lean();
  if (!turn) return null;
  if (turn.user !== message || (turn.imageHash || null) !== (imageHash || null)) throw problem(409, 'This request was already used for another message.');
  return { conversation: publicConversation(await owned(uid, id)), turn: publicTurn(turn), replayed: true };
}

export async function sendSavedMessage(uid, id, { requestId, message, revision, file, imageRef }) {
  await owned(uid, id);
  const photo = file ? await normalizeImage(file) : imageRef ? await savedImage(uid, id, imageRef) : null;
  const addedBytes = photo && !photo.source ? photo.data.length : 0;
  const replay = await previousResult(uid, id, requestId, message, photo?.hash);
  if (replay) return replay;
  if (await pendingMemory(uid)) throw problem(428, 'Saved memory needs updating before this reply. Please retry your message.', 'MEMORY_PENDING');

  const token = randomUUID();
  const now = new Date();
  const doc = await Conversation.findOneAndUpdate({
    _id: id, ownerUid: uid, revision,
    $or: [{ leaseUntil: null }, { leaseUntil: { $lte: now } }],
  }, { $set: { leaseToken: token, leaseUntil: new Date(now.getTime() + 240000) } },
  { returnDocument: 'after', timestamps: false, writeConcern: { w: 'majority' } }).lean();

  if (!doc) {
    const finished = await previousResult(uid, id, requestId, message, photo?.hash);
    if (finished) return finished;
    const current = await owned(uid, id);
    if (current.revision !== revision) throw problem(409, 'This chat changed in another tab. Reload it before sending.', 'CHAT_CHANGED');
    throw problem(409, 'A reply is already being prepared for this chat. Wait a moment, then reload it.', 'CHAT_BUSY');
  }

  try {
    if ((doc.imageBytes || 0) + addedBytes > MAX_CHAT_IMAGE_BYTES) {
      throw problem(400, 'This chat has reached its 20 MB photo limit. Start a new chat or reuse an existing photo.', 'IMAGE_LIMIT');
    }
    // Only the authenticated owner's database history is used, never client-supplied history.
    // The existing AI service trims this further to fit the model's context budget.
    const turns = await ChatTurn.find({ ownerUid: uid, conversationId: id, ordinal: { $lte: revision } })
      .sort({ ordinal: -1 }).limit(20).lean();
    const history = turns.reverse().flatMap(turn => [
      { role: 'user', content: turn.user + (turn.imageMeta ? '\n[A photo accompanied this message; its pixels are not included in this earlier-message excerpt.]' : '') }, { role: 'assistant', content: turn.assistant },
    ]);
    // Finish and save a submitted request even if the browser closes during generation.
    // The provider enforces a timeout; the database lease outlasts generation.
    const memories = await retrieveMemories(uid, id, message);
    const reply = await generateChatReply(message, history, undefined, memories, photo?.data);
    if (typeof reply?.text !== 'string' || !reply.text.trim() || reply.text.length > 12000) {
      throw Object.assign(new Error(), { code: 'AI_FAILED' });
    }

    const session = await mongoose.startSession();
    let saved;
    try {
      await session.withTransaction(async () => {
        const updated = await Conversation.findOneAndUpdate({
          _id: id, ownerUid: uid, revision, leaseToken: token, leaseUntil: { $gt: new Date() },
        }, {
          $inc: { revision: 1, imageBytes: addedBytes },
          $set: { leaseToken: null, leaseUntil: null,
            ...(revision === 0 ? { title: message.replace(/\s+/g, ' ').slice(0, 80) } : {}) },
        }, { session, returnDocument: 'after', runValidators: true }).lean();
        if (!updated) throw problem(409, 'The chat changed or was deleted. Reload your chats.', 'CHAT_CHANGED');
        const [turn] = await ChatTurn.create([{
          ownerUid: uid, conversationId: id, requestId, ordinal: revision + 1,
          ...(photo ? { imageMeta: photo.meta, imageHash: photo.hash,
            ...(photo.source ? { imageSourceRequestId: photo.source } : { imageData: photo.data }) } : {}),
          user: message, assistant: reply.text, truncated: Boolean(reply.truncated),
        }], { session });
        saved = { conversation: publicConversation(updated), turn: publicTurn(turn), replayed: false };
      }, transactionOptions);
    } finally { await session.endSession(); }
    return saved;
  } finally {
    // A stale request cannot clear a newer request's lease.
    try {
      await Conversation.updateOne({ _id: id, ownerUid: uid, leaseToken: token },
        { $set: { leaseToken: null, leaseUntil: null } }, { timestamps: false });
    } catch { console.error('Chat lease cleanup deferred until expiry.'); }
  }
}

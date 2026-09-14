import multer from 'multer';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import ChatTurn from '../models/ChatTurn.js';
import Conversation from '../models/Conversation.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = (status, message) => Object.assign(new Error(message), { status, code: 'IMAGE_ERROR' });
export const MAX_CHAT_IMAGE_BYTES = 20 * 1024 * 1024;
export const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 4, parts: 5, fieldSize: 5000 },
}).single('image');

export async function normalizeImage(file) {
  const input = file.buffer;
  const jpeg = input.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
  const png = input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = input.toString('ascii', 0, 4) === 'RIFF' && input.toString('ascii', 8, 12) === 'WEBP';
  if (!jpeg && !png && !webp) throw fail(400, 'Choose a JPEG, PNG, or WebP photo.');
  try {
    const image = sharp(input, { limitInputPixels: 20000000, failOn: 'warning' });
    const meta = await image.metadata();
    if ((meta.pages || 1) !== 1) throw new Error('Animated image');
    const { data, info } = await image.rotate().resize({ width: 1280, height: 1280,
      fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' })
      .jpeg({ quality: 85 }).toBuffer({ resolveWithObject: true });
    if (data.length > 1024 * 1024) throw new Error('Normalized image too large');
    return { data, hash: createHash('sha256').update(data).digest('hex'), source: null,
      meta: { mimeType: 'image/jpeg', width: info.width, height: info.height, sizeBytes: data.length } };
  } catch {
    throw fail(400, 'This photo could not be processed. Try a smaller, non-animated JPEG, PNG, or WebP image (up to 20 megapixels).');
  }
}

function bytes(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value?.value === 'function') return Buffer.from(value.value());
  throw fail(404, 'Photo not found.');
}

export async function savedImage(uid, conversationId, requestId) {
  if (!uuid.test(conversationId || '') || !uuid.test(requestId || '')) throw fail(400, 'Invalid photo reference.');
  if (!await Conversation.findOne({ _id: conversationId, ownerUid: uid }).lean()) throw fail(404, 'Photo not found.');
  let turn = await ChatTurn.findOne({ ownerUid: uid, conversationId, requestId })
    .select('+imageData +imageHash').lean();
  if (!turn?.imageMeta) throw fail(404, 'Photo not found.');
  const source = turn.imageSourceRequestId || requestId;
  if (turn.imageSourceRequestId) {
    turn = await ChatTurn.findOne({ ownerUid: uid, conversationId, requestId: source })
      .select('+imageData +imageHash').lean();
  }
  if (!turn?.imageData || turn.imageSourceRequestId) throw fail(404, 'Photo not found.');
  return { data: bytes(turn.imageData), hash: turn.imageHash, meta: turn.imageMeta, source };
}

export async function readImage(req, res) {
  const photo = await savedImage(req.user.uid, req.params.id, req.params.requestId);
  res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline; filename="nutrichat-photo.jpg"' });
  res.send(photo.data);
}

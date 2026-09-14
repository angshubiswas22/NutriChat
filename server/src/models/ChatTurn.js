import mongoose from 'mongoose';

// A complete exchange is saved together. Each conversation can grow without
// accumulating all its messages in a single MongoDB document.
const schema = new mongoose.Schema({
  conversationId: { type: String, required: true },
  ownerUid: { type: String, required: true, maxlength: 128 },
  requestId: { type: String, required: true },
  ordinal: { type: Number, required: true, min: 1 },
  user: { type: String, required: true, maxlength: 1000 },
  assistant: { type: String, required: true, maxlength: 12000 },
  truncated: { type: Boolean, default: false },
  imageMeta: { type: new mongoose.Schema({
    mimeType: { type: String, enum: ['image/jpeg'], required: true },
    width: { type: Number, required: true }, height: { type: Number, required: true },
    sizeBytes: { type: Number, required: true },
  }, { _id: false }), default: undefined },
  imageData: { type: Buffer, select: false },
  imageHash: { type: String, select: false },
  imageSourceRequestId: { type: String, default: null },
  memoryVersion: { type: Number, default: 0 },
  memoryLeaseToken: { type: String, default: null },
  memoryLeaseUntil: { type: Date, default: null },
}, { collection: 'chat_turns', timestamps: true, versionKey: false, strict: 'throw' });

schema.index({ conversationId: 1, requestId: 1 }, { unique: true });
schema.index({ conversationId: 1, ordinal: 1 }, { unique: true });
schema.index({ ownerUid: 1, conversationId: 1, ordinal: -1 });
schema.index({ ownerUid: 1, memoryVersion: 1, _id: 1 });
export default mongoose.model('ChatTurn', schema);

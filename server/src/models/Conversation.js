import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  _id: { type: String, required: true },
  ownerUid: { type: String, required: true, maxlength: 128 },
  title: { type: String, default: 'New chat', maxlength: 80 },
  revision: { type: Number, default: 0, min: 0 },
  imageBytes: { type: Number, default: 0, min: 0 },
  memoryEpoch: { type: Number, default: 0 },
  leaseToken: { type: String, default: null },
  leaseUntil: { type: Date, default: null },
}, { collection: 'conversations', timestamps: true, versionKey: false, strict: 'throw' });

schema.index({ ownerUid: 1, createdAt: -1, _id: -1 });
export default mongoose.model('Conversation', schema);

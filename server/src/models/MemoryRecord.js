import mongoose from 'mongoose';

export const MEMORY_CATEGORIES = ['weight', 'height', 'age', 'goal', 'diet', 'allergy', 'condition', 'activity'];
const factSchema = new mongoose.Schema({
  category: { type: String, enum: MEMORY_CATEGORIES, required: true },
  quote: { type: String, required: true, maxlength: 200 },
}, { _id: false, strict: 'throw' });

const schema = new mongoose.Schema({
  _id: { type: String, required: true },
  ownerUid: { type: String, required: true },
  conversationId: { type: String, required: true },
  ordinal: { type: Number, required: true },
  sourceCreatedAt: { type: Date, required: true },
  sourceUserText: { type: String, required: true, maxlength: 1000 },
  questionContext: { type: String, default: '', maxlength: 1000 },
  userNotes: { type: [String], default: [] },
  assistantNotes: { type: [String], default: [] },
  facts: { type: [factSchema], default: [] },
  searchText: { type: String, required: true },
}, { collection: 'chat_memories', timestamps: true, versionKey: false, strict: 'throw' });

schema.index({ ownerUid: 1, _id: -1 });
schema.index({ ownerUid: 1, conversationId: 1, ordinal: -1 });
schema.index({ ownerUid: 1, 'facts.category': 1, sourceCreatedAt: -1, _id: -1 });
schema.index({ ownerUid: 1, searchText: 'text' }, { default_language: 'none' });
export default mongoose.model('MemoryRecord', schema);

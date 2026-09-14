import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  _id: { type: String, required: true },
  hashes: { type: [String], default: [] },
  fingerprint: { type: String, required: true },
  state: {
    type: String,
    enum: ['ready', 'processing', 'used', 'blocked'],
    default: 'ready',
  },
}, {
  timestamps: true,
  versionKey: false,
  writeConcern: { w: 'majority' },
});

schema.index({ hashes: 1 });

export default mongoose.model('RecoverySet', schema);
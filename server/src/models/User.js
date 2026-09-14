import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    // The verified Firebase UID is this profile's unique MongoDB ID.
    _id: {
      type: String,
      required: true,
      maxlength: 128,
    },
    email: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    collection: 'users',
    timestamps: true,
    versionKey: false,
    strict: 'throw',
  }
);

export default mongoose.model('User', userSchema);
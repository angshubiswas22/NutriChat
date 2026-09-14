import User from '../models/User.js';

function publicProfile(user) {
  return {
    uid: user._id,
    email: user.email,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function profileError(res, error) {
  console.error('User profile operation failed:', error.name);

  return res.status(500).json({
    message: 'Your profile could not be loaded or saved. Please try again.',
  });
}

export async function syncMyProfile(req, res) {
  // Identity comes from requireAuth, never from the request body or URL.
  const filter = { _id: req.user.uid };
  const update = { $set: { email: req.user.email } };
  const options = {
    returnDocument: 'after',
    runValidators: true,
  };

  try {
    let user;

    try {
      user = await User.findOneAndUpdate(
        filter,
        update,
        { ...options, upsert: true }
      ).lean();
    } catch (error) {
      // Another simultaneous request may have created this profile.
      if (error.code !== 11000) throw error;

      user = await User.findOneAndUpdate(
        filter,
        update,
        options
      ).lean();
    }

    if (!user) throw new Error('Profile unavailable');

    return res.status(200).json({
      profile: publicProfile(user),
    });
  } catch (error) {
    return profileError(res, error);
  }
}

export async function getMyProfile(req, res) {
  try {
    const user = await User.findById(req.user.uid).lean();

    if (!user) {
      return res.status(404).json({
        message: 'Your profile has not been created yet.',
      });
    }

    return res.status(200).json({
      profile: publicProfile(user),
    });
  } catch (error) {
    return profileError(res, error);
  }
}
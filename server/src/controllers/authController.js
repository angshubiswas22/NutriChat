export function getCurrentAccount(req, res) {
  res.status(200).json({
    user: {
      uid: req.user.uid,
      email: req.user.email,
    },
  });
}
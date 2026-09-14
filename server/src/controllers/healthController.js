export function getHealth(req, res) {
  res.status(200).json({
    status: 'ok',
    service: 'NutriChat API',
    message: 'Backend is running.',
  });
}
import multer from 'multer';
import { uploadImage, readImage } from '../services/imageService.js';
import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { listChats, createChat, readChat, removeChat, sendMessage } from '../controllers/chatController.js';
import * as memory from '../controllers/memoryController.js';

const router = Router();
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.use(requireAuth);
const handle = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

router.get('/memory', handle(memory.list));
router.post('/memory/prepare', handle(memory.prepare));
router.delete('/memory', handle(memory.clear));
router.delete('/memory/:memoryId', handle(memory.remove));

router.get('/conversations', handle(listChats));
router.post('/conversations', handle(createChat));
router.get('/conversations/:id', handle(readChat));
router.delete('/conversations/:id', handle(removeChat));
router.get('/conversations/:id/images/:requestId', handle(readImage));
router.post('/conversations/:id/messages', uploadImage, handle(sendMessage));
// A stale frontend must not silently keep using the old, unsaved endpoint.
router.post('/messages', (req, res) => res.status(410).json({
  message: 'Please refresh NutriChat to use saved conversations.',
}));

const aiErrors = {
  AI_OFFLINE: [503, 'NutriChat’s AI is temporarily offline. Your saved chats are still available.'],
  AI_MODEL_MISSING: [503, 'NutriChat’s model is unavailable. Please try again later.'],
  AI_BUSY: [429, 'NutriChat is answering another message. Please try again shortly.'],
  AI_TIMEOUT: [504, 'The reply took too long. Try a shorter message.'],
  AI_CONFIG: [503, 'NutriChat’s AI configuration needs attention. Please try again later.'],
  AI_FAILED: [502, 'NutriChat could not finish the reply. Please try again.'],
  AI_CONTEXT_LIMIT: [400, 'This message leaves too little room for context. Please shorten it.'],
  MEMORY_FAILED: [502, 'NutriChat could not prepare a valid memory summary. Please try again.'],
};
router.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (res.destroyed) return;
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ code: 'IMAGE_UPLOAD_ERROR', message: error.code === 'LIMIT_FILE_SIZE'
      ? 'Choose a photo smaller than 5 MB.' : 'Upload one photo with a message of up to 1,000 characters.' });
  }
  const known = aiErrors[error.code];
  const expected = Number.isInteger(error.status) && error.status >= 400 && error.status < 500;
  const status = known?.[0] || (expected ? error.status : 503);
  const message = known?.[1] || (expected ? error.message : 'Saved chats are temporarily unavailable. Please reload before retrying.');
  if (!expected) console.error('Saved chat request failed:', known ? error.code : 'CHAT_STORAGE_ERROR');
  res.status(status).json({ message, code: known ? error.code : (expected ? error.code : 'CHAT_STORAGE_ERROR') });
});
export default router;

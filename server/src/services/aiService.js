import { generateWithOllama } from './providers/ollamaProvider.js';
import { buildChatMessages } from './contextService.js';

const providers = { ollama: generateWithOllama };
let occupied = false;

export async function generateCompletion(messages, signal, settings) {
  const provider = providers[process.env.AI_PROVIDER || 'ollama'];
  if (!provider) throw Object.assign(new Error(), { code: 'AI_CONFIG' });
  if (occupied) throw Object.assign(new Error(), { code: 'AI_BUSY' });
  signal?.throwIfAborted();
  occupied = true;
  try { return await provider(messages, signal, settings); }
  finally { occupied = false; }
}

export function generateChatReply(message, history, signal, memories = [], image) {
  const messages = buildChatMessages(message, history, memories, Boolean(image));
  if (image) messages.at(-1).images = [image.toString('base64')];
  return generateCompletion(messages, signal, { contextSize: image ? 16384 : 8192, timeoutMs: 180000 });
}

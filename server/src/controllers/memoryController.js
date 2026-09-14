import { prepareNextMemory, listMemory, removeMemory, clearMemory } from '../services/memoryService.js';

export async function prepare(req, res) {
  const data = await prepareNextMemory(req.user.uid);
  if (!res.destroyed) res.json(data);
}
export async function list(req, res) {
  const before = req.query.before;
  if (before !== undefined && (typeof before !== 'string' || before.length !== 24)) {
    return res.status(400).json({ message: 'Invalid memory cursor.' });
  }
  res.json(await listMemory(req.user.uid, before));
}
export async function remove(req, res) { await removeMemory(req.user.uid, req.params.memoryId); res.status(204).end(); }
export async function clear(req, res) { await clearMemory(req.user.uid); res.status(204).end(); }

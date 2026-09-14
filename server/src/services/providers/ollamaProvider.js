function failure(code) {
  return Object.assign(new Error(code), { code });
}

export async function generateWithOllama(messages, signal, settings = {}) {
  const base = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const timeout = AbortSignal.timeout(settings.timeoutMs ?? 120000);
  let response;

  try {
    response = await fetch(base + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL || 'qwen3.5:9b',
        messages,
        stream: false,
        think: false,
        keep_alive: '10m',
        ...(settings.format ? { format: settings.format } : {}),
        options: { num_ctx: settings.contextSize ?? 8192, num_predict: settings.maxTokens ?? 2048, temperature: settings.temperature ?? 0.6 },
      }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw failure(timeout.aborted ? 'AI_TIMEOUT' : 'AI_OFFLINE');
  }

  if (response.status === 404) throw failure('AI_MODEL_MISSING');
  if (!response.ok) throw failure('AI_FAILED');

  let data;
  try {
    data = await response.json();
  } catch (error) {
    if (signal?.aborted) throw error;
    throw failure(timeout.aborted ? 'AI_TIMEOUT' : 'AI_FAILED');
  }
  const text = typeof data?.message?.content === 'string' ? data.message.content.trim() : '';
  if (!text || text.length > 12000 || data.done !== true) throw failure('AI_FAILED');
  return { text, truncated: data.done_reason === 'length' };
}

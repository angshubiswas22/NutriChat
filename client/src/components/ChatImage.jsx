import { useEffect, useState } from 'react';
import { fetchChatImage } from '../services/chatApi.js';

export default function ChatImage({ uid, conversationId, requestId, file }) {
  const [state, setState] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let url;
    const load = file ? Promise.resolve(file) : fetchChatImage(uid, conversationId, requestId, controller.signal);
    load.then(blob => {
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob);
      setState({ uid, conversationId, requestId, file, url });
    }).catch(error => {
      if (!controller.signal.aborted) setState({ uid, conversationId, requestId, file, error: error.message });
    });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [uid, conversationId, requestId, file, attempt]);
  const current = state?.uid === uid && state?.conversationId === conversationId
    && state?.requestId === requestId && state?.file === file ? state : null;
  return <div className="chat-photo">
    {current?.url ? <img src={current.url} alt={file ? 'Selected photo preview' : 'Photo attached to this message'} />
      : current?.error ? <div><p role="alert">{current.error}</p><button type="button"
        onClick={() => setAttempt(value => value + 1)}>Retry loading photo</button></div>
        : <p role="status">Loading photo…</p>}
  </div>;
}

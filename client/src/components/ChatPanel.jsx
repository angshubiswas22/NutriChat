import { useCallback, useEffect, useRef, useState } from 'react';
import { createChat, deleteChat, listChats, readChat, sendMessage, prepareMemories } from '../services/chatApi.js';
import ChatImage from './ChatImage.jsx';
import './ChatPanel.css';

function mergeById(current, incoming) {
  const items = new Map(current.map(item => [item.id, item]));
  incoming.forEach(item => items.set(item.id, item));
  return [...items.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

export default function ChatPanel({ uid }) {
  const [chats, setChats] = useState([]);
  const [selected, setSelected] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [chatBusy, setChatBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const action = useRef(null);
  const pendingCreateId = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    action.current = controller;
    listChats(uid, null, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      setChats(data.conversations); setCursor(data.nextCursor);
      setSelected(data.conversations[0]?.id || null); setError('');
    }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); })
      .finally(() => {
        if (action.current === controller) action.current = null;
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => { controller.abort(); action.current?.abort(); };
  }, [uid]);

  const updateChat = useCallback(chat => setChats(current => mergeById(current, [chat])), []);
  const busy = loading || chatBusy;
  const selectedChat = chats.find(chat => chat.id === selected);
  const discardDraft = () => !dirty || window.confirm('Discard the message you have not sent?');

  async function act(work) {
    if (action.current || chatBusy) return;
    const controller = new AbortController();
    action.current = controller; setLoading(true); setError('');
    try { await work(controller.signal); }
    catch (failure) { if (!controller.signal.aborted) setError(failure.message); }
    finally {
      if (action.current === controller) action.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  function newChat() {
    if (busy || !discardDraft()) return;
    pendingCreateId.current ||= crypto.randomUUID();
    act(async signal => {
      const data = await createChat(uid, pendingCreateId.current, signal);
      if (signal.aborted) return;
      pendingCreateId.current = null;
      updateChat(data.conversation); setSelected(data.conversation.id); setDirty(false);
    });
  }

  function refreshList(more = false) {
    act(async signal => {
      const data = await listChats(uid, more ? cursor : null, signal);
      if (signal.aborted) return;
      setChats(current => more ? mergeById(current, data.conversations) : data.conversations);
      setCursor(data.nextCursor);
      // Keep an open chat when refreshing the first page, including one on an older page.
      if (!more && selectedChat && !data.conversations.some(chat => chat.id === selected)) {
        try {
          const open = await readChat(uid, selected, null, signal);
          if (!signal.aborted) updateChat(open.conversation);
        } catch (failure) {
          if (signal.aborted) return;
          if (failure.status === 404) { setSelected(null); setDirty(false); }
          else throw failure;
        }
      }
      if (!selected && data.conversations.length) setSelected(data.conversations[0].id);
    });
  }

  function removeSelected() {
    if (busy || !selectedChat) return;
    if (!window.confirm('Permanently delete this chat and its saved messages, photos, and memories?')) return;
    act(async signal => {
      await deleteChat(uid, selected, selectedChat.revision, signal);
      if (signal.aborted) return;
      setChats(current => current.filter(chat => chat.id !== selected));
      setSelected(null); setDirty(false);
    });
  }

  return (
    <section className="chat-panel" aria-labelledby="chat-title">
      <h2 id="chat-title">Your NutriChat conversations</h2>
      <p className="chat-note">Completed messages are saved to your account. You can return to them after signing out.</p>
      {error && <p role="alert" className="notice error">{error}</p>}
      <div className="chat-layout">
        <aside className="chat-sidebar" aria-label="Saved chats">
          <button type="button" disabled={busy} onClick={newChat}>+ New chat</button>
          <button type="button" className="chat-secondary" disabled={busy} onClick={() => refreshList()}>Refresh list</button>
          {loading && <p role="status">Loading chats…</p>}
          {!chats.length && !loading && <p>No saved chats yet.</p>}
          <ul>
            {chats.map(chat => <li key={chat.id}>
              <button type="button" className={'chat-list-item' + (selected === chat.id ? ' is-selected' : '')}
                aria-current={selected === chat.id ? 'true' : undefined} disabled={busy}
                onClick={() => {
                  if (chat.id !== selected && discardDraft()) { setSelected(chat.id); setDirty(false); setError(''); }
                }}>
                <span>{chat.title}</span>
                <small>{new Date(chat.createdAt).toLocaleDateString()}</small>
              </button>
            </li>)}
          </ul>
          {cursor && <button type="button" className="chat-secondary" disabled={busy} onClick={() => refreshList(true)}>More chats</button>}
        </aside>
        <div className="chat-main">
          {selected ? <SavedConversation key={uid + ':' + selected} uid={uid} id={selected}
            onUpdate={updateChat} onBusy={setChatBusy} onDirty={setDirty} panelBusy={loading} />
            : <p>Select a saved chat or start a new one to discuss meals, calories, macros, or fitness.</p>}
          {selected && <button type="button" className="chat-danger" disabled={busy} onClick={removeSelected}>Delete this chat</button>}
        </div>
      </div>
    </section>
  );
}

function SavedConversation({ uid, id, onUpdate, onBusy, onDirty, panelBusy }) {
  const [conversation, setConversation] = useState(null);
  const [turns, setTurns] = useState([]);
  const [before, setBefore] = useState(null);
  const [draft, setDraft] = useState('');
  const [photo, setPhoto] = useState(null);
  const [pendingText, setPendingText] = useState('');
  const [memoryProgress, setMemoryProgress] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [needsReload, setNeedsReload] = useState(false);
  const request = useRef(null);
  const retry = useRef(null);
  const transcript = useRef(null);
  const scrollBottom = useRef(true);

  const acceptPage = useCallback((data, older = false) => {
    if (older) {
      setTurns(current => {
        const merged = new Map([...data.turns, ...current].map(turn => [turn.requestId, turn]));
        return [...merged.values()].sort((a, b) => a.ordinal - b.ordinal);
      });
    } else {
      setTurns(data.turns); setConversation(data.conversation); onUpdate(data.conversation);
      setNeedsReload(false);
      if (retry.current && data.turns.some(turn => turn.requestId === retry.current.requestId)) {
        retry.current = null; setDraft(''); setPhoto(null); onDirty(false);
      } else if (retry.current && retry.current.revision !== data.conversation.revision) {
        retry.current = null;
      }
    }
    setBefore(data.nextBefore);
  }, [onUpdate, onDirty]);

  useEffect(() => {
    const controller = new AbortController();
    request.current = controller; onBusy(true);
    readChat(uid, id, null, controller.signal).then(data => {
      if (!controller.signal.aborted) acceptPage(data);
    }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); })
      .finally(() => {
        if (request.current === controller) request.current = null;
        if (!controller.signal.aborted) { setBusy(false); onBusy(false); }
      });
    return () => { controller.abort(); request.current?.abort(); onBusy(false); };
  }, [uid, id, onBusy, acceptPage]);

  useEffect(() => {
    const box = transcript.current;
    if (box && scrollBottom.current) box.scrollTop = box.scrollHeight;
  }, [turns, pendingText]);

  async function load(older = false) {
    if (request.current || panelBusy) return;
    const controller = new AbortController();
    request.current = controller; setBusy(true); onBusy(true); setError('');
    scrollBottom.current = !older;
    const box = transcript.current;
    const oldHeight = box?.scrollHeight || 0;
    const oldTop = box?.scrollTop || 0;
    try {
      const data = await readChat(uid, id, older ? before : null, controller.signal);
      if (controller.signal.aborted) return;
      acceptPage(data, older);
      if (older) requestAnimationFrame(() => {
        if (!controller.signal.aborted && box) box.scrollTop = oldTop + box.scrollHeight - oldHeight;
      });
    } catch (failure) { if (!controller.signal.aborted) setError(failure.message); }
    finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) { setBusy(false); onBusy(false); }
    }
  }

  async function submit(event) {
    event.preventDefault();
    const message = draft.trim() || (photo ? 'Help me understand this photo for nutrition or fitness.' : '');
    if (!message || request.current || !conversation || panelBusy || needsReload || conversation.generating) return;
    const controller = new AbortController();
    request.current = controller; setBusy(true); onBusy(true); setError('');
    scrollBottom.current = true; setPendingText(message);
    if (!retry.current || retry.current.message !== message) {
      retry.current = { requestId: crypto.randomUUID(), message, revision: conversation.revision,
        ...(photo?.file ? { file: photo.file } : photo ? { imageRef: photo.requestId } : {}) };
    }
    try {
      setMemoryProgress('Checking saved memory…');
      await prepareMemories(uid, controller.signal, (count, remaining) => {
        if (!controller.signal.aborted) setMemoryProgress(remaining ? `Preparing saved memory: ${remaining} exchanges remaining…` : '');
      });
      controller.signal.throwIfAborted();
      setMemoryProgress('');
      const data = await sendMessage(uid, id, retry.current, controller.signal);
      if (controller.signal.aborted) return;
      setTurns(current => current.some(turn => turn.requestId === data.turn.requestId)
        ? current : [...current, data.turn].sort((a, b) => a.ordinal - b.ordinal));
      setConversation(data.conversation); onUpdate(data.conversation);
      setNeedsReload(data.conversation.revision !== data.turn.ordinal);
      retry.current = null; setDraft(''); setPhoto(null); onDirty(false);
    } catch (failure) {
      if (controller.signal.aborted) return;
      setError(failure.message);
      if (['CHAT_CHANGED', 'CHAT_BUSY', 'CHAT_STORAGE_ERROR', 'NETWORK_ERROR', 'CHAT_NOT_FOUND'].includes(failure.code)) {
        setNeedsReload(true);
      }
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) { setMemoryProgress(''); setPendingText(''); setBusy(false); onBusy(false); }
    }
  }

  function selectPhoto(value) {
    setPhoto(value); retry.current = null; onDirty(Boolean(draft.trim() || value)); setError('');
  }
  function chooseFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Choose a JPEG, PNG, or WebP photo.'); return;
    }
    if (file.size > 5 * 1024 * 1024) { setError('Choose a photo smaller than 5 MB.'); return; }
    selectPhoto({ file });
  }
  const disabled = busy || panelBusy;
  return (
    <div>
      <div className="chat-toolbar">
        <h3>{conversation?.title || 'Loading conversation'}</h3>
        <button type="button" className="chat-secondary" disabled={disabled} onClick={() => load()}>Reload chat</button>
      </div>
      <div className="chat-transcript" ref={transcript} role="log" aria-label="Conversation">
        {before && <button type="button" className="chat-secondary" disabled={disabled} onClick={() => load(true)}>Load older messages</button>}
        {!turns.length && conversation && <p>What would you like help with today?</p>}
        {turns.map(turn => <div key={turn.requestId}>
          <div className="chat-message user"><strong>You</strong><p>{turn.user}</p>
            {turn.imageMeta && <>
              <ChatImage uid={uid} conversationId={id} requestId={turn.requestId} />
              <button type="button" className="chat-secondary" disabled={disabled || needsReload || conversation?.generating}
                onClick={() => { selectPhoto({ requestId: turn.requestId }); document.getElementById('chat-message')?.focus(); }}>
                Ask about this photo
              </button>
            </>}
          </div>
          <div className="chat-message assistant"><strong>NutriChat</strong><p>{turn.assistant}</p>
            {turn.truncated && <small>Reply reached its length limit. Ask me to continue.</small>}
          </div>
        </div>)}
        {pendingText && <div className="chat-message user"><strong>You · sending</strong><p>{pendingText}</p></div>}
      </div>
      {busy && <p role="status">{memoryProgress || (pendingText ? 'NutriChat is preparing and saving your reply…' : 'Loading messages…')}</p>}
      {memoryProgress && <button type="button" className="chat-secondary" onClick={() => {
        request.current?.abort(); request.current = null; setMemoryProgress(''); setPendingText('');
        setBusy(false); onBusy(false); setError('Stopped preparing memory. Your unsent draft is still here.');
      }}>Stop preparing memory</button>}
      {conversation?.generating && !busy && <p role="status">A reply is being prepared. Click Reload chat shortly to see it. If the backend restarted, allow up to four minutes before retrying.</p>}
      {error && <p className="notice error" role="alert">{error}</p>}
      {needsReload && <p>Reload this chat before sending another message. Your draft is still in the box.</p>}
      <form onSubmit={submit}>
        <label htmlFor="chat-message">Your message</label>
        <textarea id="chat-message" required={!photo} rows={3} maxLength={1000} disabled={disabled}
          placeholder="Ask about meals, calories, macros, or fitness" value={draft}
          onChange={event => { setDraft(event.target.value); onDirty(Boolean(event.target.value || photo)); retry.current = null; }} />
        <div className="chat-attachments">
          <label className="chat-photo-picker" htmlFor="chat-photo">Attach a photo</label>
          <input id="chat-photo" type="file" accept="image/jpeg,image/png,image/webp"
            disabled={disabled || needsReload || conversation?.generating} onChange={chooseFile} />
          <small>One JPEG, PNG, or WebP, up to 5 MB. Photos are resized before saving.</small>
          {photo && <div className="chat-selected-photo">
            <p>{photo.file ? 'Photo ready to send' : 'Saved photo selected for your next question'}</p>
            <ChatImage key={photo.file ? 'local' : photo.requestId} uid={uid} conversationId={id}
              requestId={photo.requestId} file={photo.file} />
            <button type="button" className="chat-secondary" disabled={disabled} onClick={() => selectPhoto(null)}>Remove selected photo</button>
          </div>}
        </div>
        <button type="submit" disabled={disabled || !conversation || (!draft.trim() && !photo) || needsReload || conversation.generating}>
          {pendingText ? 'Replying…' : 'Send message'}
        </button>
      </form>
      <p className="chat-note">Completed chats, photos, and relevant details are saved automatically. Unsent drafts and photos are not saved. To ask about an earlier photo, select “Ask about this photo”.</p>
    </div>
  );
}

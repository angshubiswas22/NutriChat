import { useEffect, useRef, useState } from 'react';
import { listMemories, prepareMemories, forgetMemory, forgetAllMemory } from '../services/chatApi.js';

export default function MemoryPanel({ uid, disabled, onBusy, onOpenChat }) {
  const [open, setOpen] = useState(false);
  const [records, setRecords] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const request = useRef(null);
  useEffect(() => () => { request.current?.abort(); onBusy(false); }, [onBusy]);

  async function act(work) {
    if (disabled || request.current) return;
    const controller = new AbortController(); request.current = controller;
    setBusy(true); onBusy(true); setError('');
    try { await work(controller.signal); }
    catch (failure) { if (!controller.signal.aborted) setError(failure.message); }
    finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) { setBusy(false); onBusy(false); setProgress(''); }
    }
  }
  async function load(signal, more = false) {
    const data = await listMemories(uid, more ? cursor : null, signal);
    if (signal.aborted) return;
    setRecords(current => more ? [...new Map([...current, ...data.records].map(item => [item.id, item])).values()] : data.records);
    setCursor(data.nextBefore); setPending(data.pending);
  }
  function toggle() {
    if (open) setOpen(false);
    else { setOpen(true); act(signal => load(signal)); }
  }
  function prepare() {
    act(async signal => {
      setProgress('Preparing saved memory…');
      await prepareMemories(uid, signal, (count, remaining) => {
        if (!signal.aborted) setProgress(`Prepared ${count} exchanges; ${remaining} remaining…`);
      });
      await load(signal);
    });
  }
  function cancel() {
    request.current?.abort(); request.current = null;
    setBusy(false); onBusy(false); setProgress('');
    setError('Stopped waiting. Any memory already prepared is saved; an in-progress exchange may still finish.');
  }
  return (
    <div className="memory-panel">
      <button type="button" className="chat-secondary" disabled={disabled || busy} onClick={toggle} aria-expanded={open}>
        {open ? 'Hide saved memory' : 'Review saved memory'}
      </button>
      {open && <div>
        <h3>Saved memory</h3>
        <p className="chat-note">NutriChat uses selected information from your saved chats, including across different chats. Quotes keep the original wording and date. Automatic selection can make mistakes; review entries here.</p>
        <div className="chat-toolbar">
          <button type="button" disabled={disabled || busy} onClick={prepare}>Update memory from saved chats</button>
          <button type="button" className="chat-secondary" disabled={disabled || busy} onClick={() => act(signal => load(signal))}>Refresh memory list</button>
          <button type="button" className="chat-danger" disabled={disabled || busy || (!records.length && !pending)} onClick={() => {
            if (!window.confirm('Forget all saved memory? Your chat transcripts will remain, and new messages can create new memory.')) return;
            act(async signal => { await forgetAllMemory(uid, signal); await load(signal); });
          }}>Forget all saved memory</button>
        </div>
        {pending > 0 && <p>{pending} saved exchanges are waiting to be processed. This also happens automatically before your next message.</p>}
        {busy && <p role="status">{progress || 'Loading memory…'}</p>}
        {busy && <button type="button" className="chat-secondary" onClick={cancel}>Stop waiting</button>}
        {error && <p role="alert" className="notice error">{error}</p>}
        {!records.length && !busy && <p>No saved memory entries yet.</p>}
        <div className="memory-list">
          {records.map(record => <article key={record.id} className="memory-entry">
            <p><strong>{new Date(record.date).toLocaleString()}</strong> · Chat message {record.ordinal}</p>
            <p><strong>Your original message</strong></p><blockquote>{record.sourceUserText}</blockquote>
            {record.questionContext && <details><summary>Previous question or reply for context</summary><blockquote>{record.questionContext}</blockquote></details>}
            {!!record.facts.length && <div><strong>Selected personal details</strong><ul>
              {record.facts.map((fact, index) => <li key={index}>{fact.category}: {fact.quote}</li>)}
            </ul></div>}
            {!!record.assistantNotes.length && <details><summary>Earlier NutriChat suggestions</summary>
              {record.assistantNotes.map((note, index) => <blockquote key={index}>{note}</blockquote>)}
            </details>}
            <div className="chat-toolbar">
              <button type="button" className="chat-secondary" disabled={disabled || busy} onClick={() => onOpenChat(record.conversationId)}>Open source chat</button>
              <button type="button" className="chat-danger" disabled={disabled || busy} onClick={() => {
                if (!window.confirm('Forget the saved memory from this exchange? The original chat message will remain.')) return;
                act(async signal => {
                  await forgetMemory(uid, record.id, signal);
                  if (!signal.aborted) setRecords(current => current.filter(item => item.id !== record.id));
                });
              }}>Forget this entry</button>
            </div>
          </article>)}
        </div>
        {cursor && <button type="button" className="chat-secondary" disabled={disabled || busy} onClick={() => act(signal => load(signal, true))}>More memory entries</button>}
        <p className="chat-note">Forgetting an entry removes that saved memory, not its chat transcript. The same detail can still appear in recent messages or another memory entry. Delete the source chat to remove its transcript and all memory derived from it.</p>
      </div>}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { redeemRecoveryCode } from '../services/api.js';

export default function RecoverAccount({ onBack }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const lifetime = useRef(null);

  useEffect(() => {
    const life = { active: true, busy: false };
    lifetime.current = life;
    return () => { life.active = false; };
  }, []);

  async function submit(event) {
    event.preventDefault();

    const life = lifetime.current;
    if (!life?.active || life.busy) return;

    life.busy = true;
    setBusy(true);
    setError('');

    try {
      const data = await redeemRecoveryCode(code);
      if (life.active) setMessage(data.message);
    } catch (failure) {
      if (life.active) {
        setError(failure.name === 'TimeoutError'
          ? 'The request timed out. Try normal sign-in first; the reset may have completed.'
          : failure.message);
      }
    } finally {
      life.busy = false;
      if (life.active) {
        setBusy(false);
        setCode('');
      }
    }
  }

  return (
    <section className="auth-card" aria-labelledby="recover-title">
      <h2 id="recover-title">Lost your authenticator?</h2>

      <p>
        Use a saved recovery code to reset 2FA.
        This invalidates your entire code set.
        You must still sign in with your password or Google account afterward.
      </p>

      {error && <p className="notice error" role="alert">{error}</p>}

      {message ? (
        <p role="status">{message}</p>
      ) : (
        <form onSubmit={submit}>
          <fieldset disabled={busy}>
            <label htmlFor="recovery-code">Saved recovery code</label>

            <input
              id="recovery-code"
              type="text"
              required
              maxLength={128}
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="characters"
              placeholder="Paste any 1 of your 8 recovery codes"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />

            <button type="submit">
              {busy ? 'Recovering...' : 'Use recovery code and reset 2FA'}
            </button>
          </fieldset>
        </form>
      )}

      <button type="button" disabled={busy} onClick={onBack}>
        Back to sign in
      </button>
    </section>
  );
}
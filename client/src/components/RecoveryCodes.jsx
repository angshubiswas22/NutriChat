import { useEffect, useRef, useState } from 'react';
import { generateRecoveryCodes } from '../services/api.js';

export default function RecoveryCodes({ uid }) {
  const [codes, setCodes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lifetime = useRef(null);

  useEffect(() => {
    const life = { active: true, busy: false };
    lifetime.current = life;
    return () => { life.active = false; };
  }, [uid]);

  async function generate() {
    const life = lifetime.current;
    if (!life?.active || life.busy) return;

    life.busy = true;
    setBusy(true);
    setError('');

    try {
      const data = await generateRecoveryCodes(uid);
      if (life.active) setCodes(data.codes);
    } catch (failure) {
      if (life.active) {
        setError(failure.name === 'TimeoutError'
          ? 'The request timed out. Generate a fresh set before relying on any previous codes.'
          : failure.message);
      }
    } finally {
      life.busy = false;
      if (life.active) setBusy(false);
    }
  }

  function download() {
    const text =
      'NutriChat recovery codes\n' +
      'Keep these private. Using one invalidates this entire set.\n\n' +
      codes.join('\n');

    const url = URL.createObjectURL(
      new Blob([text], { type: 'text/plain' })
    );

    const link = document.createElement('a');
    link.href = url;
    link.download = 'NutriChat-recovery-codes.txt';
    link.click();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section aria-labelledby="recovery-codes-title">
      <h3 id="recovery-codes-title">Recovery codes</h3>

      <p>
        Save these privately in case you lose your authenticator.
        Generating a new set invalidates every previous code.
      </p>
      <p>
        Sign in using 2FA within the last five minutes to generate codes.
        Generate a new set after changing your authenticator.
      </p>

      {error && <p className="notice error" role="alert">{error}</p>}

      {codes.length ? (
        <>
          <label htmlFor="saved-recovery-codes">
            Save these now — they cannot be displayed again.
          </label>

          <textarea
            id="saved-recovery-codes"
            readOnly
            rows={8}
            value={codes.join('\n')}
            style={{ width: '100%', boxSizing: 'border-box' }}
          />

          <p>
            Using one code resets 2FA and invalidates this entire set.
            You still need your password or Google account to sign in.
          </p>

          <div className="auth-actions">
            <button type="button" onClick={download}>
              Download codes
            </button>
            <button type="button" onClick={() => setCodes([])}>
              I saved my codes — hide them
            </button>
          </div>
        </>
      ) : (
        <button type="button" disabled={busy} onClick={generate}>
          {busy ? 'Generating...' : 'Generate new recovery codes'}
        </button>
      )}
    </section>
  );
}
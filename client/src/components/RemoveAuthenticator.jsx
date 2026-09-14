import { useEffect, useRef, useState } from 'react';
import TotpCodeInput from './TotpCodeInput.jsx';
import {
  beginTotpRemoval,
  finishTotpRemoval,
  mfaErrorMessage,
} from '../services/mfaService.js';

export default function RemoveAuthenticator({ uid, methods }) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState(methods[0] || '');
  const [password, setPassword] = useState('');
  const [operation, setOperation] = useState(null);
  const [factorUid, setFactorUid] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lifetime = useRef(null);

  useEffect(() => {
    const life = { active: true, busy: false };
    lifetime.current = life;
    return () => { life.active = false; };
  }, [uid]);

  async function perform(action, onSuccess = () => {}) {
    const life = lifetime.current;
    if (!life?.active || life.busy) return;

    life.busy = true;
    setBusy(true);
    setError('');

    try {
      const result = await action();
      if (life.active) onSuccess(result);
    } catch (failure) {
      if (life.active) setError(mfaErrorMessage(failure));
    } finally {
      life.busy = false;
      if (life.active) {
        setBusy(false);
        setPassword('');
        setCode('');
      }
    }
  }

  function submit(event) {
    event.preventDefault();

    if (operation) {
      void perform(() => finishTotpRemoval(operation, factorUid, code));
    } else {
      void perform(
        () => beginTotpRemoval(uid, method, password),
        (result) => {
          setOperation(result);
          setFactorUid(result.choices[0].uid);
        }
      );
    }
  }

  function cancel() {
    setOpen(false);
    setOperation(null);
    setPassword('');
    setCode('');
    setFactorUid('');
    setError('');
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}>
        Remove authenticator
      </button>
    );
  }

  return (
    <form onSubmit={submit}>
      <h4>Remove authenticator</h4>

      <p>
        Removing your only authenticator turns off 2FA. You will be signed out.
        To replace it, sign back in and set up your new authenticator.
      </p>

      {error && <p className="notice error" role="alert">{error}</p>}

      <fieldset disabled={busy}>
        {operation ? (
          <>
            <label htmlFor="remove-factor">Authenticator to remove</label>
            <select
              id="remove-factor"
              value={factorUid}
              onChange={(event) => {
                setFactorUid(event.target.value);
                setCode('');
              }}
            >
              {operation.choices.map((factor, index) => (
                <option key={factor.uid} value={factor.uid}>
                  {factor.displayName || `Authenticator ${index + 1}`}
                </option>
              ))}
            </select>

            <label htmlFor="remove-code">
              Current code from this authenticator
            </label>
            <TotpCodeInput
              id="remove-code"
              value={code}
              onChange={setCode}
            />
          </>
        ) : (
          <>
            <label htmlFor="remove-method">
              Confirm your identity using
            </label>
            <select
              id="remove-method"
              value={method}
              onChange={(event) => {
                setMethod(event.target.value);
                setPassword('');
              }}
            >
              {methods.map((id) => (
                <option key={id} value={id}>
                  {id === 'password' ? 'Password' : 'Google'}
                </option>
              ))}
            </select>

            {method === 'password' && (
              <>
                <label htmlFor="remove-password">Current password</label>
                <input
                  id="remove-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </>
            )}
          </>
        )}

        <button type="submit" disabled={!method}>
          {busy
            ? 'Please wait...'
            : operation
              ? 'Remove authenticator and sign out'
              : 'Continue'}
        </button>

        <button type="button" onClick={cancel}>
          Cancel
        </button>
      </fieldset>
    </form>
  );
}
import { useEffect, useRef, useState } from 'react';
import {
  getSecurityStatus,
  startTotpSetup,
  finishTotpSetup,
  mfaErrorMessage,
} from '../services/mfaService.js';
import TotpCodeInput from './TotpCodeInput.jsx';
import RemoveAuthenticator from './RemoveAuthenticator.jsx';
import RecoveryCodes from './RecoveryCodes.jsx';
export default function TwoFactorSetup({ uid, email }) {
  const [status, setStatus] = useState(null);
  const [method, setMethod] = useState('');
  const [password, setPassword] = useState('');
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const lifetime = useRef(null);

  useEffect(() => {
    const life = { active: true };
    lifetime.current = life;
    getSecurityStatus(uid).then((result) => {
      if (!life.active) return;
      setStatus(result);
      setMethod(result.methods[0] || '');
    }).catch((failure) => {
      if (life.active) setError(mfaErrorMessage(failure));
    }).finally(() => {
      if (life.active) setBusy(false);
    });
    return () => { life.active = false; };
  }, [uid]);

  async function perform(action, onSuccess) {
    const life = lifetime.current;
    if (busy || !life?.active) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await action();
      if (life.active) onSuccess(result);
    } catch (failure) {
      if (life.active) setError(mfaErrorMessage(failure));
    } finally {
      if (life.active) {
        setBusy(false);
        setPassword('');
        setCode('');
      }
    }
  }

  function begin(event) {
    event.preventDefault();
    void perform(() => startTotpSetup(uid, method, password), setSetup);
  }

  function confirm(event) {
    event.preventDefault();
    void perform(() => finishTotpSetup(setup, code), () => {
      setSetup(null);
      setStatus((previous) => ({ ...previous, enabled: true }));
      setMessage('2FA enabled. Keep this entry in your authenticator for future sign-ins.');
    });
  }

  return (
    <section aria-labelledby="two-factor-title">
      <h3 id="two-factor-title">Two-factor authentication</h3>
      {error && <p className="notice error" role="alert">{error}</p>}
      {message && <p className="notice" role="status">{message}</p>}
      {!status ? (
        <p>{busy ? 'Loading security settings...' : 'Reload the page to retry.'}</p>
            ) : status.enabled ? (
        <>
          <p>Authenticator-app 2FA is enabled.</p>
          <RemoveAuthenticator uid={uid} methods={status.methods} />
          <RecoveryCodes uid={uid} />
        </>
      ) : setup ? (
        <form onSubmit={confirm}>
          <p>In your authenticator, add an account using <strong>Enter setup key</strong>.</p>
          <p>Account name: NutriChat ({email})<br />Key type: Time based</p>
          <label htmlFor="totp-secret">Setup key — keep this private</label>
          <input id="totp-secret" value={setup.secret.secretKey} readOnly
            autoComplete="off" spellCheck={false} onFocus={(event) => event.target.select()} />
          <fieldset disabled={busy}>
            <label htmlFor="setup-code">Six-digit code from your authenticator</label>
            <TotpCodeInput
                        id="setup-code"
                        value={code}
                        onChange={setCode}
                        />
            <button type="submit">{busy ? 'Confirming...' : 'Confirm and enable 2FA'}</button>
            <button type="button" onClick={() => {
              setSetup(null); setCode(''); setError('');
            }}>Cancel setup</button>
          </fieldset>
        </form>
      ) : (
        <form onSubmit={begin}>
          <p>Add an authenticator to protect future sign-ins. First, confirm your identity.</p>
          <fieldset disabled={busy || !method}>
            <label htmlFor="reauth-method">Confirm using</label>
            <select id="reauth-method" value={method}
              onChange={(event) => { setMethod(event.target.value); setPassword(''); }}>
              {status.methods.map((id) => (
                <option key={id} value={id}>{id === 'password' ? 'Password' : 'Google'}</option>
              ))}
            </select>
            {method === 'password' && <>
              <label htmlFor="reauth-password">Current password</label>
              <input id="reauth-password" type="password" autoComplete="current-password"
                required value={password} onChange={(event) => setPassword(event.target.value)} />
            </>}
            <button type="submit">{busy ? 'Please wait...' : 'Set up authenticator'}</button>
          </fieldset>
          {!method && <p>This account has no supported setup method.</p>}
        </form>
      )}
    </section>
  );
}
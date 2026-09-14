import { useState } from 'react';
import TotpCodeInput from './TotpCodeInput.jsx';

export default function TwoFactorChallenge({ challenge, busy, onConfirm, onCancel }) {
  const [code, setCode] = useState('');
  const [factorUid, setFactorUid] = useState(challenge.choices[0].uid);

  async function submit(event) {
    event.preventDefault();
    await onConfirm(factorUid, code);
    setCode('');
  }

  return (
    <section className="auth-card" aria-labelledby="mfa-title">
      <h2 id="mfa-title">Enter your authenticator code</h2>
      <p>Open your authenticator and enter the current code for NutriChat.</p>
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          {challenge.choices.length > 1 && <>
            <label htmlFor="mfa-factor">Authenticator</label>
            <select id="mfa-factor" value={factorUid}
              onChange={(event) => { setFactorUid(event.target.value); setCode(''); }}>
              {challenge.choices.map((factor, index) => (
                <option key={factor.uid} value={factor.uid}>
                  {factor.displayName || `Authenticator ${index + 1}`}
                </option>
              ))}
            </select>
          </>}
          <label htmlFor="signin-code">Six-digit code</label>
          <TotpCodeInput
                    id="signin-code"
                    value={code}
                    onChange={setCode}
                    />
          <button type="submit">{busy ? 'Verifying...' : 'Verify and sign in'}</button>
          <button type="button" onClick={onCancel}>Cancel sign-in</button>
        </fieldset>
      </form>
    </section>
  );
}
import { useState } from 'react';
import { getCurrentAccount } from '../services/api.js';

export default function AccountAccessCheck() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function checkAccess() {
    setBusy(true);
    setMessage('');

    try {
      const account = await getCurrentAccount();
      setMessage('Account access confirmed for ' + account.email);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-actions">
      <button disabled={busy} onClick={checkAccess}>
        {busy ? 'Checking...' : 'Check account access'}
      </button>

      {message && <p role="status">{message}</p>}
    </div>
  );
}
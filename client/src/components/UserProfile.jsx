import { useEffect, useRef, useState } from 'react';
import {
  getMyProfile,
  syncMyProfile,
} from '../services/api.js';

export default function UserProfile() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const activeRequest = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    activeRequest.current = controller;

    syncMyProfile(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setProfile(data);
        }
      })
      .catch((problem) => {
        if (!controller.signal.aborted) {
          setError(problem.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setBusy(false);
        }
      });

    return () => activeRequest.current?.abort();
  }, []);

  async function loadProfile() {
    activeRequest.current?.abort();

    const controller = new AbortController();
    activeRequest.current = controller;

    setBusy(true);
    setError('');

    try {
      const operation = profile ? getMyProfile : syncMyProfile;
      const data = await operation(controller.signal);

      if (!controller.signal.aborted) {
        setProfile(data);
      }
    } catch (problem) {
      if (!controller.signal.aborted) {
        setError(problem.message);
      }
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false);
      }
    }
  }

  return (
    <section aria-label="Saved profile">
      <h3>Your profile</h3>

      {busy && (
        <p role="status">Loading your profile...</p>
      )}

      {error && (
        <p role="alert">{error}</p>
      )}

      {!busy && !error && profile && (
        <p role="status">
          Profile ready for {profile.email}
        </p>
      )}

      <div className="auth-actions">
        <button disabled={busy} onClick={loadProfile}>
          {profile ? 'Reload saved profile' : 'Retry profile setup'}
        </button>
      </div>
    </section>
  );
}
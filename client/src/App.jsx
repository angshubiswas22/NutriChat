import { useEffect, useState } from 'react';
import AccountAccessCheck from './components/AccountAccessCheck.jsx';
import {
  observeUser,
  register,
  login,
  loginWithGoogle,
  resetPassword,
  resendVerification,
  refreshUser,
  logout,
  authErrorMessage,
} from './services/authService.js';
import './App.css';
import UserProfile from './components/UserProfile.jsx';
import TwoFactorSetup from './components/TwoFactorSetup.jsx';
import TwoFactorChallenge from './components/TwoFactorChallenge.jsx';
import {
  getTotpChallenge,
  finishTotpSignIn,
  mfaErrorMessage,
} from './services/mfaService.js';
import RecoverAccount from './components/RecoverAccount.jsx';
import ChatPanel from './components/ChatPanel.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [recovering, setRecovering] = useState(false);
  const [challenge, setChallenge] = useState(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState({ text: '', error: false });

  useEffect(() => observeUser(
    (account) => {
      setUser(account);
      if (account) {
      setChallenge(null);
      setRecovering(false);
    }
      setReady(true);
    },
    () => {
      setNotice({
        text: 'Unable to restore your session. Refresh this page.',
        error: true,
      });
      setReady(true);
    }
  ), []);

  async function runAction(action) {
  if (busy) return;

  setBusy(true);
  setNotice({ text: '', error: false });

  try {
    const text = await action();
    setChallenge(null);
    setNotice({ text, error: false });
  } catch (error) {
    if (error.code === 'auth/multi-factor-auth-required') {
      try {
        setChallenge(getTotpChallenge(error));
      } catch (failure) {
        setNotice({ text: mfaErrorMessage(failure), error: true });
      }
    } else {
      setNotice({ text: mfaErrorMessage(error), error: true });
    }
  } finally {
    setPassword('');
    setBusy(false);
  }
}

  function changeMode(nextMode) {
    setMode(nextMode);
    setPassword('');
    setNotice({ text: '', error: false });
  }

  function handleSubmit(event) {
    event.preventDefault();
    const address = email.trim();

    if (mode === 'signup') {
      void runAction(() => register(address, password));
    } else if (mode === 'reset') {
      void runAction(() => resetPassword(address));
    } else {
      void runAction(() => login(address, password));
    }
  }

  async function checkVerification() {
    const account = await refreshUser();
    setUser(account);

    return account?.emailVerified
      ? 'Email verified successfully.'
      : 'Email is not verified yet. Open the link in your verification email first.';
  }

  const title = mode === 'signup'
    ? 'Create account'
    : mode === 'reset' ? 'Reset password' : 'Sign in';

  return (
    <main className="auth-page">
      <h1>NutriChat</h1>
      <p>Your health, nutrition, and fitness chat companion.</p>

      {notice.text && (
        <p
          className={notice.error ? 'notice error' : 'notice'}
          role={notice.error ? 'alert' : 'status'}
        >
          {notice.text}
        </p>
      )}

      {!ready ? (
        <p role="status">Checking your session...</p>
      ) : user ? (
        <section className="auth-card" aria-label="Your account">
          <h2>Your account</h2>
          <p>Signed in as <strong>{user.email}</strong></p>
          {user.emailVerified && (
            <ChatPanel
              key={'chat-' + user.uid}
              uid={user.uid}
            />
          )}
          <AccountAccessCheck key={'access-' + user.uid} />
            {user.emailVerified && <UserProfile key={'profile-' + user.uid} />}
            {user.emailVerified && (
              <TwoFactorSetup
                key={'mfa-' + user.uid}
                uid={user.uid}
                email={user.email}
              />
            )}
          <p>
            {user.emailVerified
              ? 'Email verified.'
              : 'Please verify your email.'}
          </p>

          <div className="auth-actions">
            {!user.emailVerified && (
              <>
                <button
                  disabled={busy}
                  onClick={() => runAction(resendVerification)}
                >
                  Resend verification email
                </button>

                <button
                  disabled={busy}
                  onClick={() => runAction(checkVerification)}
                >
                  I've verified my email
                </button>
              </>
            )}

            <button disabled={busy} onClick={() => runAction(logout)}>
              Sign out
            </button>
          </div>
        </section>
        ) : recovering ? (
        <RecoverAccount onBack={() => {
          setRecovering(false);
          setMode('login');
          setNotice({ text: '', error: false });
        }} />
      ) : challenge ? (
        <TwoFactorChallenge
          challenge={challenge}
          busy={busy}
          onConfirm={(factorUid, code) =>
            runAction(() => finishTotpSignIn(challenge, factorUid, code))
          }
          onCancel={() => {
            setChallenge(null);
            setPassword('');
            setNotice({ text: '', error: false });
          }}
        />
      ) : (
        <section className="auth-card" aria-labelledby="auth-title">
          <h2 id="auth-title">{title}</h2>

          <form onSubmit={handleSubmit}>
            <fieldset disabled={busy}>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />

              {mode !== 'reset' && (
                <>
                  <label htmlFor="password">Password</label>
                  <input
                    id="password"
                    type="password"
                    required
                    minLength={mode === 'signup' ? 12 : 1}
                    autoComplete={
                      mode === 'signup' ? 'new-password' : 'current-password'
                    }
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />

                  {mode === 'signup' && (
                    <small>Use at least 12 characters.</small>
                  )}
                </>
              )}

              <button type="submit">
                {busy
                  ? 'Please wait...'
                  : mode === 'reset' ? 'Send reset email' : title}
              </button>
            </fieldset>
          </form>

          <div className="auth-actions">
            {mode !== 'reset' && (
              <button
                disabled={busy}
                onClick={() => runAction(loginWithGoogle)}
              >
                Continue with Google
              </button>
            )}

            <button
              disabled={busy}
              onClick={() => changeMode(mode === 'login' ? 'signup' : 'login')}
            >
              {mode === 'login' ? 'Create an account' : 'Back to sign in'}
            </button>

            {mode === 'login' && (
              <button
                disabled={busy}
                onClick={() => changeMode('reset')}
              >
                Forgot password?
              </button>
            )}
          </div>
        </section>
      )}
          {ready && !user && !recovering && (
        <button
         className="recovery-button"
          type="button"
          disabled={busy}
          onClick={() => {
            setRecovering(true);
            setChallenge(null);
            setPassword('');
            setNotice({ text: '', error: false });
          }}
        > 
          Lost access to your authenticator?
        </button>
      )}
    </main>
  );
}
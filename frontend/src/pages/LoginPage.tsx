import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { useAppConfig } from '../state/appConfig';

export function LoginPage() {
  const { user, login, register } = useAuth();
  const { mediaMode } = useAppConfig();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('alice@acme.local');
  const [password, setPassword] = useState('poc');
  const [displayName, setDisplayName] = useState('');
  const [orgMode, setOrgMode] = useState<'create' | 'join'>('join');
  const [organizationName, setOrganizationName] = useState('Acme Security');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register({
          email,
          password,
          displayName: displayName || email.split('@')[0],
          ...(orgMode === 'create'
            ? { organizationName }
            : { joinOrganizationName: organizationName }),
        });
      }
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auth failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <header className="hero-block">
          <p className="brand">Concept Pro Connect</p>
          <h1>Sign in</h1>
          <p className="muted">
            Dual-mode POC · current media path:{' '}
            <span className="mode-chip">
              {mediaMode === 'dm' ? 'DM Mediaserver' : 'P2P'}
            </span>
          </p>
        </header>

        <div className="tabs">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => setMode('login')}
          >
            Login
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            onClick={() => setMode('register')}
          >
            Register
          </button>
        </div>

        <form className="stack" onSubmit={onSubmit}>
          <label>
            Email
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
            />
          </label>
          <label>
            Password
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
            />
          </label>

          {mode === 'register' && (
            <>
              <label>
                Display name
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Alice"
                />
              </label>
              <div className="tabs compact">
                <button
                  type="button"
                  className={orgMode === 'join' ? 'active' : ''}
                  onClick={() => setOrgMode('join')}
                >
                  Join org
                </button>
                <button
                  type="button"
                  className={orgMode === 'create' ? 'active' : ''}
                  onClick={() => setOrgMode('create')}
                >
                  Create org
                </button>
              </div>
              <label>
                Organization name
                <input
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  required
                />
              </label>
            </>
          )}

          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={busy}>
            {busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="muted hint">
          Seeded: alice@acme.local / bob@acme.local / carol@beta.local —{' '}
          <code>poc</code>
        </p>
      </div>
    </div>
  );
}

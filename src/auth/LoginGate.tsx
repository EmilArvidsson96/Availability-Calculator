import { useState, type FormEvent, type ReactNode } from 'react';
import { AUTH_ENABLED, useAuthStore } from './useAuthStore';

export function LoginGate({ children }: { children: ReactNode }) {
  const isAuthed = useAuthStore((s) => s.isAuthed);
  const checking = useAuthStore((s) => s.checking);
  const error = useAuthStore((s) => s.error);
  const login = useAuthStore((s) => s.login);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  if (!AUTH_ENABLED || isAuthed) return <>{children}</>;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login(username, password);
  };

  return (
    <div className="login">
      <form className="login__card" onSubmit={submit}>
        <span className="login__logo">🔋</span>
        <h1>BESS Availability Calculator</h1>
        <p className="muted small">Sign in to continue.</p>
        <div className="field">
          <label className="field__label">Username</label>
          <input
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
        </div>
        <div className="field">
          <label className="field__label">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        {error && <div className="alert alert--error">{error}</div>}
        <button className="btn btn--primary" type="submit" disabled={checking}>
          {checking ? 'Checking…' : 'Sign in'}
        </button>
        <p className="login__note small muted">
          This is a basic access screen, not a security boundary — the app is a public static
          site, so treat this as a deterrent for casual visitors, not a guarantee against a
          determined one.
        </p>
      </form>
    </div>
  );
}

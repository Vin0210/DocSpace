import { useAuth } from '../auth/AuthContext';

export default function LoginPage() {
  const { users, loadingUsers, login } = useAuth();

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="brand">
          <span className="brand-mark">D</span>
          <span className="brand-name">DocSpace</span>
        </div>
        <h1>Welcome back</h1>
        <p className="muted">Choose an account to continue. No password needed for this demo.</p>
        {loadingUsers ? (
          <p className="muted">Loading accounts…</p>
        ) : users.length === 0 ? (
          <p className="error">Could not load accounts. Make sure the API server is running.</p>
        ) : (
          <div className="account-list">
            {users.map((u) => (
              <button key={u.id} className="account-btn" onClick={() => login(u)}>
                <span className="avatar">{u.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}</span>
                <span className="account-meta">
                  <strong>{u.name}</strong>
                  <span className="muted">{u.email}</span>
                </span>
                <span className="continue">Continue →</span>
              </button>
            ))}
          </div>
        )}
        <p className="fine-print">Mock authentication for assessment purposes — accounts are seeded in SQLite.</p>
      </div>
    </div>
  );
}

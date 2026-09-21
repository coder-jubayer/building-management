import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useAuthStore } from '../stores/auth.store';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, isAuthenticated, isLoading, isHydrated } = useAuthStore();
  const [identifier, setIdentifier] = useState('admin@bm.com');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isHydrated && isAuthenticated) navigate('/', { replace: true });
  }, [isHydrated, isAuthenticated, navigate]);

  if (isHydrated && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setError(null);
    try {
      await login(identifier.trim(), password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  return (
    <div className="login-page">
      <section className="login-hero">
        <div>
          <img src="/logo.png" alt="" width={72} height={72} style={{ objectFit: 'contain' }} />
          <h1>Platform console for Barighorr</h1>
          <p>
            Manage buildings, users, free-trial access, and support WhatsApp from a desktop admin
            panel connected to the same API as the resident app.
          </p>
        </div>
        <div className="faint" style={{ color: 'rgba(255,255,255,0.55)' }}>
          App admin access only
        </div>
      </section>

      <section className="login-panel">
        <form className="login-card stack" onSubmit={(e) => void handleSubmit(e)}>
          <div>
            <h2>Sign in</h2>
            <p className="lead">Use your app admin credentials.</p>
          </div>

          <Input
            label="Email"
            type="email"
            autoComplete="username"
            value={identifier}
            onChange={(e) => {
              setIdentifier(e.target.value);
              setError(null);
            }}
            placeholder="admin@bm.com"
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            placeholder="Enter password"
          />

          {error ? <div className="error-text">{error}</div> : null}

          <Button type="submit" loading={isLoading} style={{ width: '100%', minHeight: 46 }}>
            Sign in
          </Button>

          <div className="hint-box">
            Default local credentials: admin@bm.com / admin123
          </div>
        </form>
      </section>
    </div>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { config } from '../config/env';
import { useAuthStore } from '../stores/auth.store';
import { ROLE_LABELS } from '../types';

export function ProfilePage() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [logoutOpen, setLogoutOpen] = useState(false);

  const handleLogout = () => {
    logout();
    setLogoutOpen(false);
    navigate('/login', { replace: true });
  };

  return (
    <>
      <header className="topbar">
        <div>
          <h1>Profile</h1>
          <p>Account details for your Barighorr admin session.</p>
        </div>
        <Button variant="danger" onClick={() => setLogoutOpen(true)}>
          <LogOut size={16} strokeWidth={2} />
          Log out
        </Button>
      </header>

      <div className="content">
        <div className="panel">
          <div className="panel-head">
            <h2>Account</h2>
          </div>
          <div className="table-wrap">
            <table className="data">
              <tbody>
                <tr>
                  <th style={{ width: '28%' }}>Name</th>
                  <td>{user?.name ?? 'App Admin'}</td>
                </tr>
                <tr>
                  <th>Email</th>
                  <td>{user?.email || '—'}</td>
                </tr>
                <tr>
                  <th>Role</th>
                  <td>{ROLE_LABELS[user?.role ?? 'app_admin']}</td>
                </tr>
                <tr>
                  <th>API</th>
                  <td className="muted">{config.apiUrl}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Modal
        open={logoutOpen}
        title="Log out?"
        onClose={() => setLogoutOpen(false)}
        actions={
          <>
            <Button variant="outline" onClick={() => setLogoutOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleLogout}>
              Log out
            </Button>
          </>
        }
      >
        You will need to sign in again to manage the platform.
      </Modal>
    </>
  );
}

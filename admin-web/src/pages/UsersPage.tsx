import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { fetchUsers, setUserActive } from '../services/users.service';
import { useAuthStore } from '../stores/auth.store';
import { ROLE_LABELS, type User } from '../types';

export function UsersPage() {
  const me = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<User[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<User | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2400);
  };

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setError(null);
    try {
      const data = await fetchUsers();
      setUsers(data.users);
      setError(null);
    } catch (err) {
      if (!opts?.silent) setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useAutoRefresh(() => load({ silent: true }), 8000);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      `${u.name} ${u.email ?? ''} ${u.phone ?? ''} ${u.buildingName ?? ''} ${u.unitNumber ?? ''} ${u.role}`
        .toLowerCase()
        .includes(q),
    );
  }, [query, users]);

  const handleToggle = async () => {
    if (!confirm) return;
    const next = !(confirm.isActive ?? true);
    setBusyId(confirm.id);
    try {
      await setUserActive(confirm.id, next);
      setConfirm(null);
      await load();
      showToast(next ? 'User activated' : 'User deactivated');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <header className="topbar">
        <div>
          <h1>Users</h1>
          <p>Search across the platform and activate or deactivate accounts.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}>
          Refresh
        </Button>
      </header>

      <div className="content">
        <div className="toolbar">
          <div className="grow">
            <Input
              placeholder="Search name, email, phone, building"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {error ? <div className="error-text">{error}</div> : null}

        <div className="panel">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Building</th>
                  <th>Contact</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading && !filtered.length ? (
                  <tr>
                    <td colSpan={6} className="empty">
                      Loading users…
                    </td>
                  </tr>
                ) : null}
                {!loading && filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="empty">
                      No users found
                    </td>
                  </tr>
                ) : null}
                {filtered.map((user) => {
                  const active = user.isActive ?? true;
                  const isSelf = user.id === me?.id;
                  return (
                    <tr key={user.id}>
                      <td style={{ fontWeight: 700 }}>{user.name}</td>
                      <td>{ROLE_LABELS[user.role] ?? user.role}</td>
                      <td className="muted">
                        {user.buildingName || '—'}
                        {user.unitNumber ? ` · Unit ${user.unitNumber}` : ''}
                      </td>
                      <td className="muted">
                        {user.email || '—'}
                        <br />
                        {user.phone || '—'}
                      </td>
                      <td>
                        <span className={`badge ${active ? 'badge-on' : 'badge-off'}`}>
                          {active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        {isSelf ? (
                          <span className="faint">This is your account</span>
                        ) : (
                          <button
                            type="button"
                            className={`btn btn-sm ${active ? 'btn-danger' : 'btn-primary'}`}
                            disabled={busyId === user.id}
                            onClick={() => setConfirm(user)}
                          >
                            {active ? 'Deactivate' : 'Activate'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Modal
        open={Boolean(confirm)}
        title={(confirm?.isActive ?? true) ? 'Deactivate user?' : 'Activate user?'}
        onClose={() => setConfirm(null)}
        actions={
          <>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant={(confirm?.isActive ?? true) ? 'danger' : 'primary'}
              loading={Boolean(busyId)}
              onClick={() => void handleToggle()}
            >
              {(confirm?.isActive ?? true) ? 'Deactivate' : 'Activate'}
            </Button>
          </>
        }
      >
        {(confirm?.isActive ?? true)
          ? `${confirm?.name} will not be able to sign in until activated again.`
          : `${confirm?.name} will be able to sign in again.`}
      </Modal>

      {toast ? <div className="toast">{toast}</div> : null}
    </>
  );
}

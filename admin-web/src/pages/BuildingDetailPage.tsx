import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  Hash,
  KeyRound,
  Lock,
  RefreshCw,
  Search,
  Shield,
  Unlock,
  Users,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { fetchBuildingDetail } from '../services/buildings.service';
import { setBuildingAccess } from '../services/platform.service';
import {
  ACCESS_LABELS,
  ROLE_LABELS,
  type Building,
  type BuildingAccessStatus,
  type User,
  type UserRole,
} from '../types';

type PeopleFilter = 'all' | 'building_admin' | 'committee' | 'guard' | 'resident';

const PEOPLE_FILTERS: Array<{ value: PeopleFilter; label: string }> = [
  { value: 'all', label: 'All people' },
  { value: 'building_admin', label: 'Admins' },
  { value: 'committee', label: 'Committee' },
  { value: 'guard', label: 'Guards' },
  { value: 'resident', label: 'Residents' },
];

function accessClass(status?: BuildingAccessStatus) {
  if (status === 'active') return 'badge-on';
  if (status === 'trial') return 'badge-trial';
  if (status === 'expired') return 'badge-warn';
  return 'badge-off';
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function accessSummary(building: Building, status: BuildingAccessStatus) {
  if (status === 'trial' && building.trialDaysGranted) {
    return `Free trial · ${building.trialDaysGranted} days granted${
      building.trialEndsAt ? ` · ends ${new Date(building.trialEndsAt).toLocaleDateString()}` : ''
    }. Changing platform trial length will not shorten this clock.`;
  }
  if (status === 'active') {
    return building.expiresAt
      ? `Activated until ${new Date(building.expiresAt).toLocaleDateString()}`
      : 'Fully activated with no expiry date set.';
  }
  if (status === 'expired') {
    return 'Trial or subscription ended. The resident app is locked for everyone in this building.';
  }
  return 'Locked. The building admin can claim a free trial (if enabled) or contact support.';
}

export function BuildingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [building, setBuilding] = useState<Building | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [admins, setAdmins] = useState<User[]>([]);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<PeopleFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessBusy, setAccessBusy] = useState(false);
  const [accessMsg, setAccessMsg] = useState<string | null>(null);
  const [activateDays, setActivateDays] = useState('365');

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!id) {
        setError('Building not found');
        setLoading(false);
        return;
      }
      if (!opts?.silent) setError(null);
      try {
        const data = await fetchBuildingDetail(id);
        setBuilding(data.building);
        setUsers(data.users);
        setAdmins(data.admins);
        setError(null);
      } catch (err) {
        if (!opts?.silent) {
          setError(err instanceof Error ? err.message : 'Failed to load building');
        }
      } finally {
        setLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useAutoRefresh(() => load({ silent: true }), 8000);

  const adminList = useMemo(() => {
    if (admins.length > 0) return admins;
    return users.filter((u) => u.role === 'building_admin' || u.role === 'app_admin');
  }, [admins, users]);

  const roleCounts = useMemo(() => {
    const counts: Record<PeopleFilter, number> = {
      all: users.length,
      building_admin: adminList.length,
      committee: users.filter((u) => u.role === 'committee').length,
      guard: users.filter((u) => u.role === 'guard').length,
      resident: users.filter((u) => u.role === 'resident').length,
    };
    return counts;
  }, [users, adminList]);

  const filteredPeople = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list =
      roleFilter === 'all'
        ? users
        : roleFilter === 'building_admin'
          ? adminList
          : users.filter((u) => u.role === roleFilter);

    if (q) {
      list = list.filter((u) =>
        `${u.name} ${u.email ?? ''} ${u.phone ?? ''} ${u.role} ${u.unitNumber ?? ''}`
          .toLowerCase()
          .includes(q),
      );
    }
    return list;
  }, [users, adminList, query, roleFilter]);

  const active = building?.isActive ?? true;
  const accessStatus = (building?.accessStatus || 'locked') as BuildingAccessStatus;

  const updateAccess = async (payload: {
    accessStatus: 'locked' | 'active' | 'expired';
    days?: number;
  }) => {
    if (!id) return;
    setAccessBusy(true);
    setAccessMsg(null);
    try {
      const result = await setBuildingAccess(id, payload);
      setBuilding(result.building);
      setAccessMsg(
        payload.accessStatus === 'active'
          ? 'Building activated for the resident app'
          : payload.accessStatus === 'locked'
            ? 'Building locked'
            : 'Building marked expired',
      );
    } catch (err) {
      setAccessMsg(err instanceof Error ? err.message : 'Could not update access');
    } finally {
      setAccessBusy(false);
    }
  };

  return (
    <>
      <header className="topbar building-topbar">
        <div>
          <Link to="/buildings" className="back-link">
            <ArrowLeft size={16} strokeWidth={2} />
            Buildings
          </Link>
          <div className="building-title-row">
            <h1>{building?.name ?? 'Building'}</h1>
            {building ? (
              <div className="building-title-badges">
                <span className={`badge ${active ? 'badge-on' : 'badge-off'}`}>
                  {active ? 'Listed' : 'Inactive'}
                </span>
                <span className={`badge ${accessClass(accessStatus)}`}>
                  {ACCESS_LABELS[accessStatus]}
                </span>
              </div>
            ) : null}
          </div>
          <p>Manage listing status, app access, and everyone registered under this building.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}>
          <RefreshCw size={16} strokeWidth={2} />
          Refresh
        </Button>
      </header>

      <div className="content">
        {error ? <div className="error-text">{error}</div> : null}
        {loading && !building ? <div className="empty">Loading building…</div> : null}

        {building ? (
          <>
            <section className="building-hero panel">
              <div className="building-hero-main">
                <div className="building-hero-icon">
                  <Building2 size={28} strokeWidth={1.75} />
                </div>
                <div>
                  <div className="building-code-pill">
                    <Hash size={14} strokeWidth={2} />
                    Join code · <strong>{building.code}</strong>
                  </div>
                  <p className="building-hero-copy">
                    Primary admin contact and resident-app access for this community.
                  </p>
                </div>
              </div>

              <div className="building-stat-grid">
                <div className="building-stat">
                  <span className="building-stat-label">
                    <Users size={14} /> Total users
                  </span>
                  <strong>{building.userCount ?? users.length}</strong>
                </div>
                <div className="building-stat">
                  <span className="building-stat-label">
                    <Shield size={14} /> Active users
                  </span>
                  <strong>{building.activeUserCount ?? 0}</strong>
                </div>
                <div className="building-stat">
                  <span className="building-stat-label">
                    <KeyRound size={14} /> Admins
                  </span>
                  <strong>{adminList.length}</strong>
                </div>
                <div className="building-stat">
                  <span className="building-stat-label">
                    <CalendarClock size={14} /> Access
                  </span>
                  <strong>{ACCESS_LABELS[accessStatus]}</strong>
                </div>
              </div>
            </section>

            <section className="building-access panel panel-pad">
              <div className="building-access-head">
                <div>
                  <div className="building-access-kicker">Resident app</div>
                  <h2>Access control</h2>
                  <p className="muted">{accessSummary(building, accessStatus)}</p>
                  {accessStatus === 'trial' ? (
                    <p className="building-access-note">
                      Trial claimed — remaining days are frozen for this building.
                    </p>
                  ) : null}
                </div>
                <span className={`badge ${accessClass(accessStatus)}`}>
                  {ACCESS_LABELS[accessStatus]}
                </span>
              </div>

              <div className="building-access-actions">
                {accessStatus !== 'active' ? (
                  <div className="building-access-activate">
                    <Input
                      label="Activation days (optional)"
                      value={activateDays}
                      onChange={(e) => setActivateDays(e.target.value)}
                      placeholder="365 — leave blank for open-ended"
                    />
                    <Button
                      loading={accessBusy}
                      onClick={() => {
                        const days = Number(activateDays);
                        void updateAccess({
                          accessStatus: 'active',
                          ...(Number.isFinite(days) && days > 0 ? { days } : {}),
                        });
                      }}
                    >
                      <Unlock size={16} strokeWidth={2} />
                      Activate building
                    </Button>
                  </div>
                ) : null}

                <div className="building-access-secondary">
                  {accessStatus !== 'locked' ? (
                    <Button
                      variant="outline"
                      loading={accessBusy}
                      onClick={() => void updateAccess({ accessStatus: 'locked' })}
                    >
                      <Lock size={16} strokeWidth={2} />
                      Lock building
                    </Button>
                  ) : null}
                  {accessStatus === 'active' || accessStatus === 'trial' ? (
                    <button
                      type="button"
                      className="linkish"
                      disabled={accessBusy}
                      onClick={() => void updateAccess({ accessStatus: 'expired' })}
                    >
                      Mark as expired
                    </button>
                  ) : null}
                </div>
              </div>

              {accessMsg ? <div className="building-access-msg">{accessMsg}</div> : null}
            </section>
          </>
        ) : null}

        {!loading && !error ? (
          <section className="panel building-people">
            <div className="panel-head building-people-head">
              <div>
                <h2>People</h2>
                <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                  {filteredPeople.length} shown · {users.length} total in this building
                </p>
              </div>
              <div className="building-search">
                <Search size={16} className="building-search-icon" />
                <input
                  className="input building-search-input"
                  placeholder="Search name, email, phone, unit"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="building-role-tabs">
              {PEOPLE_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  className={`building-role-tab ${roleFilter === filter.value ? 'active' : ''}`}
                  onClick={() => setRoleFilter(filter.value)}
                >
                  {filter.label}
                  <span>{roleCounts[filter.value]}</span>
                </button>
              ))}
            </div>

            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Role</th>
                    <th>Unit</th>
                    <th>Contact</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPeople.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="empty">
                        No people match this filter
                      </td>
                    </tr>
                  ) : (
                    filteredPeople.map((user) => {
                      const userActive = user.isActive ?? true;
                      const isAdmin =
                        user.role === 'building_admin' || user.role === 'app_admin';
                      return (
                        <tr key={user.id} className={isAdmin ? 'row-admin' : undefined}>
                          <td>
                            <div className="person-cell">
                              <span className={`person-avatar ${isAdmin ? 'admin' : ''}`}>
                                {initials(user.name)}
                              </span>
                              <div>
                                <div className="person-name">{user.name}</div>
                                {isAdmin ? (
                                  <div className="person-sub">Primary building contact</div>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td>{ROLE_LABELS[user.role as UserRole] ?? user.role}</td>
                          <td className="muted">{user.unitNumber || '—'}</td>
                          <td>
                            <div className="contact-cell">
                              <span>{user.email || '—'}</span>
                              <span className="muted">{user.phone || '—'}</span>
                            </div>
                          </td>
                          <td>
                            <span className={`badge ${userActive ? 'badge-on' : 'badge-off'}`}>
                              {userActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}

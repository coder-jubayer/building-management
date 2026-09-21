import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import {
  downloadBuildingsReport,
  fetchBuildings,
  setBuildingActive,
  type BuildingReportRole,
} from '../services/buildings.service';
import { ACCESS_LABELS, type Building, type BuildingAccessStatus } from '../types';

const REPORT_ROLE_OPTIONS: Array<{ value: BuildingReportRole; label: string }> = [
  { value: 'building_admin', label: 'Building admins' },
  { value: 'committee', label: 'Committee' },
  { value: 'resident', label: 'Residents' },
  { value: 'guard', label: 'Security guards' },
];

function accessClass(status?: BuildingAccessStatus) {
  if (status === 'active') return 'badge-on';
  if (status === 'trial') return 'badge-trial';
  if (status === 'expired') return 'badge-warn';
  return 'badge-off';
}

export function BuildingsPage() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Building | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportRoles, setReportRoles] = useState<BuildingReportRole[]>([
    'building_admin',
    'committee',
    'resident',
    'guard',
  ]);
  const [reportBuildingId, setReportBuildingId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2400);
  };

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setError(null);
    try {
      setBuildings(await fetchBuildings());
      setError(null);
    } catch (err) {
      if (!opts?.silent) setError(err instanceof Error ? err.message : 'Failed to load buildings');
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
    if (!q) return buildings;
    return buildings.filter((b) => `${b.name} ${b.code}`.toLowerCase().includes(q));
  }, [buildings, query]);

  const handleToggle = async () => {
    if (!confirm) return;
    const next = !(confirm.isActive ?? true);
    setBusyId(confirm.id);
    try {
      await setBuildingActive(confirm.id, next);
      setConfirm(null);
      await load();
      showToast(
        next ? 'Building activated' : 'Building deactivated — all its users were deactivated',
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  const openReport = (buildingId?: string) => {
    setReportBuildingId(buildingId ?? null);
    setReportError(null);
    setReportOpen(true);
  };

  const handleDownloadReport = async () => {
    if (!reportRoles.length) {
      setReportError('Select at least one role.');
      return;
    }
    setDownloading(true);
    setReportError(null);
    try {
      await downloadBuildingsReport({
        roles: reportRoles,
        buildingId: reportBuildingId || undefined,
      });
      setReportOpen(false);
      showToast('Report opened in browser');
    } catch (err) {
      setReportError(err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
      setDownloading(false);
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      showToast(`Copied ${code}`);
    } catch {
      showToast('Could not copy code');
    }
  };

  return (
    <>
      <header className="topbar">
        <div>
          <h1>Buildings</h1>
          <p>Search, activate/deactivate, download reports, and manage app access.</p>
        </div>
        <Button variant="secondary" onClick={() => openReport()}>
          Download report
        </Button>
      </header>

      <div className="content">
        <div className="toolbar">
          <div className="grow">
            <Input
              placeholder="Search by name or code"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Button variant="outline" onClick={() => void load()}>
            Refresh
          </Button>
        </div>

        {error ? <div className="error-text">{error}</div> : null}

        <div className="panel">
          <div className="table-wrap">
            <table className="data buildings-table">
              <thead>
                <tr>
                  <th>Building</th>
                  <th>Code</th>
                  <th>Users</th>
                  <th>Listing</th>
                  <th>App access</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading && !filtered.length ? (
                  <tr>
                    <td colSpan={6} className="empty">
                      Loading buildings…
                    </td>
                  </tr>
                ) : null}
                {!loading && filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="empty">
                      No buildings found
                    </td>
                  </tr>
                ) : null}
                {filtered.map((building) => {
                  const active = building.isActive ?? true;
                  const access = (building.accessStatus || 'locked') as BuildingAccessStatus;
                  return (
                    <tr key={building.id}>
                      <td>
                        <Link to={`/buildings/${building.id}`} style={{ fontWeight: 700 }}>
                          {building.name}
                        </Link>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="code-copy"
                          title="Copy building code"
                          onClick={() => void copyCode(building.code)}
                        >
                          {building.code}
                        </button>
                      </td>
                      <td>
                        <div className="user-count-cards">
                          <div className="user-count-card">
                            <strong>{building.userCount ?? 0}</strong>
                            <span>Total</span>
                          </div>
                          <div className="user-count-card active-users">
                            <strong>{building.activeUserCount ?? 0}</strong>
                            <span>Active</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${active ? 'badge-on' : 'badge-off'}`}>
                          {active ? 'Listed' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${accessClass(access)}`}>
                          {ACCESS_LABELS[access]}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <Link className="btn btn-outline btn-sm" to={`/buildings/${building.id}`}>
                            Open
                          </Link>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => openReport(building.id)}
                          >
                            Report
                          </button>
                          <button
                            type="button"
                            className={`btn btn-sm ${active ? 'btn-danger' : 'btn-primary'}`}
                            disabled={busyId === building.id}
                            onClick={() => setConfirm(building)}
                          >
                            {active ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
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
        title={(confirm?.isActive ?? true) ? 'Deactivate building?' : 'Activate building?'}
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
          ? `${confirm?.name} will be deactivated and all of its users will be deactivated.`
          : `${confirm?.name} will be listed as active again.`}
      </Modal>

      <Modal
        open={reportOpen}
        title={reportBuildingId ? 'Building report' : 'All buildings report'}
        onClose={() => setReportOpen(false)}
        actions={
          <>
            <Button variant="outline" onClick={() => setReportOpen(false)}>
              Cancel
            </Button>
            <Button loading={downloading} onClick={() => void handleDownloadReport()}>
              Open PDF
            </Button>
          </>
        }
      >
        <p>Choose which roles to include in the PDF.</p>
        <div className="chips report-roles" style={{ marginBottom: 12 }}>
          {REPORT_ROLE_OPTIONS.map((opt) => {
            const selected = reportRoles.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                className={`chip ${selected ? 'active' : ''}`}
                onClick={() =>
                  setReportRoles((current) =>
                    selected
                      ? current.filter((item) => item !== opt.value)
                      : [...current, opt.value],
                  )
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        {reportError ? <div className="error-text">{reportError}</div> : null}
      </Modal>

      {toast ? <div className="toast">{toast}</div> : null}
    </>
  );
}

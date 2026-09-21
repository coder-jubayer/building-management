import { useCallback, useEffect, useMemo, useState } from 'react';
import { TrendLineChart } from '../components/charts/TrendLineChart';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { fetchOverview } from '../services/buildings.service';
import type { OverviewStats } from '../types';
import {
  buildActivationTimeline,
  buildEarningsTrend,
  type ChartRange,
} from '../utils/overviewCharts';

function formatBdt(amount: number) {
  return `${Math.round(amount).toLocaleString('en-BD')} TK`;
}

export function OverviewPage() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<ChartRange>(30);
  const [includeTrial, setIncludeTrial] = useState(false);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setError(null);
    try {
      setStats(await fetchOverview());
      setError(null);
    } catch (err) {
      if (!opts?.silent) setError(err instanceof Error ? err.message : 'Failed to load overview');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useAutoRefresh(() => load({ silent: true }), 8000);

  const activationPeriods = stats?.timeline?.activationPeriods ?? [];
  const runningPeriods = stats?.timeline?.runningPeriods ?? [];
  const charge = stats?.earnings?.chargePerBuildingBdt ?? 0;

  const usageTrend = useMemo(
    () =>
      buildActivationTimeline(
        includeTrial ? runningPeriods : activationPeriods,
        range,
      ),
    [includeTrial, runningPeriods, activationPeriods, range],
  );

  const earningsTrend = useMemo(
    () => buildEarningsTrend(activationPeriods, range, charge),
    [activationPeriods, range, charge],
  );

  const usageLatest =
    usageTrend[usageTrend.length - 1]?.value ??
    (includeTrial
      ? runningPeriods.filter((p) => !p.end).length
      : activationPeriods.filter((p) => !p.end).length);

  const earningsLatest =
    earningsTrend[earningsTrend.length - 1]?.value ??
    stats?.earnings?.estimatedEarningsBdt ??
    0;

  const rangeLabel =
    range === 'all' ? 'Last 12 months' : range === 7 ? 'Last 7 days' : 'Last 30 days';

  return (
    <>
      <header className="topbar">
        <div>
          <h1>Overview</h1>
          <p>Platform health, building activation timeline, and BDT earnings.</p>
        </div>
        <div className="toolbar">
          <div className="range-toggle">
            <button
              type="button"
              className={range === 7 ? 'active' : ''}
              onClick={() => setRange(7)}
            >
              7 days
            </button>
            <button
              type="button"
              className={range === 30 ? 'active' : ''}
              onClick={() => setRange(30)}
            >
              30 days
            </button>
            <button
              type="button"
              className={range === 'all' ? 'active' : ''}
              onClick={() => setRange('all')}
            >
              All time
            </button>
          </div>
          <button className="btn btn-outline" type="button" onClick={() => void load()}>
            Refresh
          </button>
        </div>
      </header>

      <div className="content">
        {error ? <div className="error-text">{error}</div> : null}

        {stats ? (
          <>
            {stats.access ? (
              <div className="stats overview-access-stats">
                <div className="panel stat-card compact">
                  <div className="stat-label">Buildings</div>
                  <div className="stat-value">{stats.buildings.total}</div>
                  <div className="stat-meta">
                    {stats.buildings.active} listed · {stats.buildings.inactive} inactive
                  </div>
                </div>
                <div className="panel stat-card compact">
                  <div className="stat-label">Users</div>
                  <div className="stat-value">{stats.users.total}</div>
                  <div className="stat-meta">
                    {stats.users.active} active · {stats.users.inactive} inactive
                  </div>
                </div>
                <div className="panel stat-card compact">
                  <div className="stat-label">On trial</div>
                  <div className="stat-value">{stats.access.trial}</div>
                  <div className="stat-meta">Buildings on free trial now</div>
                </div>
                <div className="panel stat-card compact">
                  <div className="stat-label">Est. earnings</div>
                  <div className="stat-value">
                    {formatBdt(stats.earnings?.estimatedEarningsBdt ?? 0)}
                  </div>
                  <div className="stat-meta">Activated buildings × charge</div>
                </div>
              </div>
            ) : null}

            <div className="overview-charts">
              <article className="panel chart-card">
                <div className="chart-card-head">
                  <div>
                    <div className="chart-kicker">Usage · {rangeLabel}</div>
                    <h2>Running buildings</h2>
                    <label className="chart-check">
                      <input
                        type="checkbox"
                        checked={includeTrial}
                        onChange={(e) => setIncludeTrial(e.target.checked)}
                      />
                      <span>Include free trial</span>
                    </label>
                  </div>
                  <div className="chart-kpi">
                    <strong>{usageLatest}</strong>
                  </div>
                </div>
                <TrendLineChart data={usageTrend} accent="teal" />
              </article>

              <article className="panel chart-card">
                <div className="chart-card-head">
                  <div>
                    <div className="chart-kicker">Earnings · {rangeLabel}</div>
                    <h2>Estimated earnings (BDT)</h2>
                  </div>
                  <div className="chart-kpi">
                    <strong style={{ fontSize: 22 }}>{formatBdt(earningsLatest)}</strong>
                  </div>
                </div>
                <TrendLineChart
                  data={earningsTrend}
                  accent="gold"
                  valueFormatter={(v) =>
                    v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k TK` : `${v} TK`
                  }
                />
              </article>
            </div>

            <div className="panel">
              <div className="panel-head">
                <h2>Users by role</h2>
              </div>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Role</th>
                      <th>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.byRole.map((item) => (
                      <tr key={item.role}>
                        <td>{item.label}</td>
                        <td>
                          <strong>{item.count}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : loading ? (
          <div className="empty">Loading overview…</div>
        ) : null}
      </div>
    </>
  );
}

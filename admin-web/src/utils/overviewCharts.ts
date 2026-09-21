export type ChartRange = 7 | 30 | 'all';

export interface TrendPoint {
  label: string;
  value: number;
}

export interface ActivationPeriod {
  /** ISO date when the building became activated / started running. */
  start: string;
  /** ISO date when activation ended, or null if still active. */
  end: string | null;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function formatDayLabel(d: Date) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function formatMonthLabel(d: Date) {
  return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}

function parsePeriod(period: ActivationPeriod): { start: Date; end: Date | null } | null {
  const start = new Date(period.start);
  if (Number.isNaN(start.getTime())) return null;
  const end = period.end ? new Date(period.end) : null;
  if (end && Number.isNaN(end.getTime())) return { start, end: null };
  return { start, end };
}

function isActiveOnDay(
  period: { start: Date; end: Date | null },
  dayStart: Date,
  dayEnd: Date,
) {
  if (period.start.getTime() > dayEnd.getTime()) return false;
  if (period.end && period.end.getTime() < dayStart.getTime()) return false;
  return true;
}

function countActiveOnDay(periods: Array<{ start: Date; end: Date | null }>, day: Date) {
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);
  let count = 0;
  for (const period of periods) {
    if (isActiveOnDay(period, dayStart, dayEnd)) count += 1;
  }
  return count;
}

/**
 * Activation timeline for 7 days, 30 days, or last 12 months (all time).
 * Buildings activated earlier still count on each day/month they remained active.
 */
export function buildActivationTimeline(
  periodsIso: ActivationPeriod[],
  range: ChartRange,
  valueScale = 1,
): TrendPoint[] {
  const periods = periodsIso
    .map(parsePeriod)
    .filter((p): p is { start: Date; end: Date | null } => Boolean(p));

  const today = startOfDay(new Date());
  const points: TrendPoint[] = [];

  if (range === 'all') {
    // 12 calendar months ending with the current month.
    for (let i = 11; i >= 0; i -= 1) {
      const monthStart = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthEnd =
        i === 0
          ? endOfDay(today)
          : new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59, 999);
      points.push({
        label: formatMonthLabel(monthStart),
        value: countActiveOnDay(periods, monthEnd) * valueScale,
      });
    }
    return points;
  }

  for (let i = range - 1; i >= 0; i -= 1) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    points.push({
      label: formatDayLabel(day),
      value: countActiveOnDay(periods, day) * valueScale,
    });
  }

  return points;
}

/**
 * Earnings over the same ranges as usage (7 / 30 / 12 months).
 * Value = activated buildings that day/month × charge.
 */
export function buildEarningsTrend(
  periodsIso: ActivationPeriod[],
  range: ChartRange,
  chargePerBuilding: number,
): TrendPoint[] {
  return buildActivationTimeline(periodsIso, range, Math.max(0, chargePerBuilding));
}

export function thisMonthLabel() {
  return new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

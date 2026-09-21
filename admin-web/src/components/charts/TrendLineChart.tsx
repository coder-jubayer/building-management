import { useId, useMemo, useState } from 'react';

export interface TrendPoint {
  label: string;
  value: number;
}

interface TrendLineChartProps {
  data: TrendPoint[];
  accent?: 'teal' | 'gold';
  valueFormatter?: (value: number) => string;
}

function buildSmoothPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const current = points[i];
    const next = points[i + 1];
    const cx = (current.x + next.x) / 2;
    path += ` C ${cx} ${current.y}, ${cx} ${next.y}, ${next.x} ${next.y}`;
  }
  return path;
}

/** Evenly spaced axis labels including first & last — never adjacent. */
function axisLabelIndices(total: number): Set<number> {
  if (total <= 0) return new Set();
  if (total <= 7) return new Set(Array.from({ length: total }, (_, i) => i));

  const maxLabels = total <= 14 ? 6 : 5;
  const indices = new Set<number>();
  for (let i = 0; i < maxLabels; i += 1) {
    indices.add(Math.round((i * (total - 1)) / (maxLabels - 1)));
  }
  return indices;
}

export function TrendLineChart({
  data,
  accent = 'teal',
  valueFormatter = (v) => String(v),
}: TrendLineChartProps) {
  const reactId = useId().replace(/:/g, '');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const width = 560;
  const height = 252;
  const padding = { top: 28, right: 28, bottom: 44, left: 48 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const { points, linePath, areaPath, maxValue, gridYs, labelIndices } = useMemo(() => {
    const values = data.map((d) => d.value);
    const max = Math.max(4, ...values);
    const computed = data.map((d, i) => {
      const x =
        padding.left + (data.length <= 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
      const y = padding.top + plotH - (d.value / max) * plotH;
      return { x, y, ...d };
    });
    const line = buildSmoothPath(computed);
    const area =
      computed.length === 0
        ? ''
        : `${line} L ${computed[computed.length - 1].x} ${padding.top + plotH} L ${computed[0].x} ${padding.top + plotH} Z`;
    const grids = [0.25, 0.5, 0.75, 1].map((t) => padding.top + plotH * (1 - t));
    return {
      points: computed,
      linePath: line,
      areaPath: area,
      maxValue: max,
      gridYs: grids,
      labelIndices: axisLabelIndices(computed.length),
    };
  }, [data, padding.left, padding.top, plotH, plotW]);

  const stroke = accent === 'gold' ? '#c7922a' : '#0f766e';
  const glow = accent === 'gold' ? 'rgba(199, 146, 42, 0.28)' : 'rgba(15, 118, 110, 0.28)';
  const fillId = `fill-${reactId}-${accent}`;
  const glowId = `glow-${reactId}-${accent}`;
  const dense = data.length > 10;
  const hitWidth = dense ? Math.max(10, plotW / Math.max(data.length - 1, 1)) : 24;

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <div className="trend-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Trend chart">
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
          <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {gridYs.map((y) => (
          <line
            key={y}
            x1={padding.left}
            x2={width - padding.right}
            y1={y}
            y2={y}
            className="trend-grid"
          />
        ))}

        {areaPath ? <path d={areaPath} fill={`url(#${fillId})`} /> : null}

        {linePath ? (
          <path
            d={linePath}
            fill="none"
            stroke={glow}
            strokeWidth="6"
            strokeLinecap="round"
            opacity="0.7"
            filter={`url(#${glowId})`}
          />
        ) : null}

        {linePath ? (
          <path
            d={linePath}
            fill="none"
            stroke={stroke}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {points.map((point, index) => (
          <rect
            key={`hit-${index}`}
            x={point.x - hitWidth / 2}
            y={padding.top}
            width={hitWidth}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHoverIndex(index)}
            onMouseLeave={() => setHoverIndex(null)}
          />
        ))}

        {points.map((point, index) => {
          const showLabel = labelIndices.has(index);
          const showDot = !dense || showLabel || hoverIndex === index;
          const isEdge = index === 0 || index === points.length - 1;
          return (
            <g key={`${point.label}-${index}`}>
              {showDot ? (
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={hoverIndex === index ? 5.5 : dense ? 2.4 : 3.2}
                  fill="#ffffff"
                  stroke={stroke}
                  strokeWidth={hoverIndex === index ? 2.4 : 1.6}
                  className="trend-point"
                  pointerEvents="none"
                />
              ) : null}
              {showLabel ? (
                <text
                  x={point.x}
                  y={height - 14}
                  textAnchor={isEdge ? (index === 0 ? 'start' : 'end') : 'middle'}
                  className="trend-axis"
                >
                  {point.label}
                </text>
              ) : null}
            </g>
          );
        })}

        <text x={padding.left - 10} y={padding.top + 4} textAnchor="end" className="trend-axis">
          {valueFormatter(maxValue)}
        </text>
        <text
          x={padding.left - 10}
          y={padding.top + plotH}
          textAnchor="end"
          className="trend-axis"
        >
          0
        </text>

        {hovered ? (
          <g className="trend-tooltip" pointerEvents="none">
            <rect
              x={Math.min(Math.max(hovered.x - 42, 8), width - 92)}
              y={Math.max(8, hovered.y - 46)}
              width="84"
              height="36"
              rx="8"
              fill="#ffffff"
              stroke="#e4eaef"
            />
            <text
              x={Math.min(Math.max(hovered.x, 50), width - 50)}
              y={Math.max(22, hovered.y - 32)}
              textAnchor="middle"
              className="trend-tooltip-label"
            >
              {hovered.label}
            </text>
            <text
              x={Math.min(Math.max(hovered.x, 50), width - 50)}
              y={Math.max(37, hovered.y - 17)}
              textAnchor="middle"
              className="trend-tooltip-text"
            >
              {valueFormatter(hovered.value)}
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  );
}

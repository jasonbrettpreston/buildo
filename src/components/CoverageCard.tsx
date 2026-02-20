'use client';

interface CoverageCardProps {
  title: string;
  matched: number;
  total: number;
  percentage: number;
  avgConfidence?: number | null;
  trend?: number[];
  details?: { label: string; value: string | number }[];
  subBars?: { label: string; value: number; total: number }[];
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 120;
  const h = 32;
  const step = w / (data.length - 1);
  const points = data
    .map((v, i) => `${i * step},${h - ((v - min) / range) * (h - 4) - 2}`)
    .join(' ');

  return (
    <svg width={w} height={h} className="mt-2">
      <polyline
        points={points}
        fill="none"
        stroke="#3B82F6"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function getBarColor(pct: number): string {
  if (pct >= 80) return 'bg-green-500';
  if (pct >= 60) return 'bg-yellow-500';
  if (pct >= 40) return 'bg-orange-500';
  return 'bg-red-500';
}

export function CoverageCard({
  title,
  matched,
  total,
  percentage,
  avgConfidence,
  trend,
  details,
  subBars,
}: CoverageCardProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        {title}
      </h3>

      {/* Progress bar + percentage */}
      <div className="mt-3 flex items-center gap-3">
        <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${getBarColor(percentage)}`}
            style={{ width: `${Math.min(100, percentage)}%` }}
          />
        </div>
        <span className="text-lg font-bold text-gray-900 tabular-nums w-16 text-right">
          {percentage.toFixed(1)}%
        </span>
      </div>

      {/* Matched count */}
      <p className="text-sm text-gray-600 mt-2">
        <span className="font-medium">{formatCount(matched)}</span>
        {' / '}
        {formatCount(total)}
      </p>

      {/* Average confidence */}
      {avgConfidence != null && (
        <p className="text-xs text-gray-500 mt-1">
          Avg Confidence: <span className="font-medium">{avgConfidence.toFixed(3)}</span>
        </p>
      )}

      {/* Detail rows */}
      {details && details.length > 0 && (
        <div className="mt-3 space-y-1">
          {details.map((d) => (
            <div key={d.label} className="flex justify-between text-xs text-gray-500">
              <span>{d.label}</span>
              <span className="font-medium text-gray-700">{d.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Sub-bars for enrichment breakdown */}
      {subBars && subBars.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {subBars.map((sb) => {
            const pct = sb.total > 0 ? (sb.value / sb.total) * 100 : 0;
            return (
              <div key={sb.label}>
                <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                  <span>{sb.label}</span>
                  <span>{Math.round(pct)}%</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-400 rounded-full"
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Sparkline */}
      {trend && trend.length >= 2 && <Sparkline data={trend} />}
    </div>
  );
}

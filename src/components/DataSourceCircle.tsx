'use client';

export interface DataSourceCircleProps {
  name: string;
  slug: string;
  accuracy: number;
  count: number;
  total: number;
  lastUpdated: string | null;
  nextScheduled: string;
  tiers?: { label: string; value: string | number }[];
  avgConfidence?: number | null;
  onUpdate: () => void;
  updating?: boolean;
  hero?: boolean;
  /** Relationship label shown above the card (e.g. "links to permits") */
  relationship?: string;
  /** Field names this data source populates on permit detail */
  fields?: string[];
  /** Trend delta: positive = up, negative = down, null = no data */
  trend?: number | null;
  /** ISO date string of the newest record in this source */
  newestRecord?: string | null;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const ms = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getHealthColor(pct: number): { stroke: string; text: string } {
  if (pct >= 80) return { stroke: '#22c55e', text: 'text-green-600' };
  if (pct >= 60) return { stroke: '#eab308', text: 'text-yellow-600' };
  return { stroke: '#ef4444', text: 'text-red-600' };
}

function ProgressRing({ pct, size, strokeWidth, color }: { pct: number; size: number; strokeWidth: number; color: string }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(pct, 100) / 100) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2} cy={size / 2} r={radius} fill="none"
        stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round" className="transition-all duration-700 ease-out"
      />
    </svg>
  );
}

export function DataSourceCircle({
  name,
  accuracy,
  count,
  total,
  lastUpdated,
  nextScheduled,
  tiers,
  avgConfidence,
  onUpdate,
  updating = false,
  hero = false,
  relationship,
  fields,
  trend,
  newestRecord,
}: DataSourceCircleProps) {
  const health = getHealthColor(accuracy);
  const ringSize = hero ? 140 : 96;
  const strokeW = hero ? 8 : 6;

  return (
    <div className="flex flex-col items-center">
      {/* Relationship label + connector line */}
      {relationship && (
        <div className="flex flex-col items-center mb-1">
          <div className="w-px h-6 bg-gray-300" />
          <span className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">{relationship}</span>
        </div>
      )}

      <div className={`bg-white rounded-xl border border-gray-200 flex flex-col items-center w-full ${hero ? 'p-5' : 'p-3'}`}>
        {/* Ring + accuracy */}
        <div className="relative flex items-center justify-center" style={{ width: ringSize, height: ringSize }}>
          <ProgressRing pct={accuracy} size={ringSize} strokeWidth={strokeW} color={health.stroke} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`font-bold tabular-nums ${hero ? 'text-2xl' : 'text-lg'} ${health.text}`}>
              {accuracy.toFixed(1)}%
            </span>
            {trend != null && (
              <span className={`text-[10px] font-medium tabular-nums ${
                trend > 0 ? 'text-green-600' : trend < 0 ? 'text-red-500' : 'text-gray-400'
              }`}>
                {trend > 0 ? '▲' : trend < 0 ? '▼' : '—'}{' '}
                {trend > 0 ? '+' : ''}{trend === 0 ? '0.0' : trend.toFixed(1)} vs 30d
              </span>
            )}
          </div>
        </div>

        {/* Name + count */}
        <h3 className={`font-semibold text-gray-800 mt-2 text-center leading-tight ${hero ? 'text-sm' : 'text-xs'}`}>{name}</h3>
        <p className="text-[11px] text-gray-500 tabular-nums mt-0.5">
          {formatCount(count)}<span className="text-gray-400"> / {formatCount(total)}</span>
        </p>

        {/* Field annotations */}
        {fields && fields.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1 justify-center">
            {fields.map((f) => (
              <span key={f} className="text-[8px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                {f}
              </span>
            ))}
          </div>
        )}

        {/* Avg confidence */}
        {avgConfidence != null && (
          <p className="text-[10px] text-gray-400 mt-0.5">
            conf <span className="font-medium text-gray-600">{Number(avgConfidence).toFixed(3)}</span>
          </p>
        )}

        {/* Tier breakdown */}
        {tiers && tiers.length > 0 && (
          <div className="w-full mt-2 pt-2 border-t border-gray-100 space-y-0.5">
            {tiers.map((t) => (
              <div key={t.label} className="flex justify-between text-[10px] text-gray-500 leading-tight">
                <span>{t.label}</span>
                <span className="font-medium text-gray-700 tabular-nums">{t.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Timestamps */}
        <div className="w-full mt-2 pt-2 border-t border-gray-100 space-y-0.5 text-[10px] text-gray-400">
          <div className="flex justify-between">
            <span>Updated</span>
            <span className="text-gray-600" title={lastUpdated ? formatDate(lastUpdated) : undefined}>
              {formatRelativeTime(lastUpdated)}
            </span>
          </div>
          {newestRecord && (
            <div className="flex justify-between">
              <span>Latest Record</span>
              <span className="text-gray-600">
                {formatShortDate(newestRecord)}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Next</span>
            <span className="text-gray-600">{nextScheduled}</span>
          </div>
        </div>

        {/* Update Now */}
        <button
          onClick={(e) => { e.stopPropagation(); onUpdate(); }}
          disabled={updating}
          className={`mt-2 w-full text-[11px] py-1.5 rounded-lg border font-medium transition-colors ${
            updating
              ? 'bg-blue-50 border-blue-200 text-blue-400 cursor-not-allowed animate-pulse'
              : 'border-gray-300 text-gray-600 hover:bg-gray-50 hover:border-gray-400 hover:text-gray-800'
          }`}
        >
          {updating ? 'Running...' : 'Update Now'}
        </button>
      </div>
    </div>
  );
}

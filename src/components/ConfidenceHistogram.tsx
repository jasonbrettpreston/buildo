'use client';

interface ConfidenceHistogramProps {
  title: string;
  buckets: { label: string; count: number }[];
}

export function ConfidenceHistogram({ title, buckets }: ConfidenceHistogramProps) {
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        {title}
      </h3>
      <div className="mt-4 flex items-end gap-2 h-32">
        {buckets.map((bucket) => {
          const heightPct = (bucket.count / maxCount) * 100;
          return (
            <div
              key={bucket.label}
              className="flex-1 flex flex-col items-center gap-1"
            >
              <span className="text-xs text-gray-500 tabular-nums">
                {bucket.count.toLocaleString()}
              </span>
              <div className="w-full flex items-end" style={{ height: '80px' }}>
                <div
                  className="w-full bg-blue-500 rounded-t transition-all"
                  style={{ height: `${Math.max(2, heightPct)}%` }}
                />
              </div>
              <span className="text-xs text-gray-400">{bucket.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

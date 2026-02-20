'use client';

interface ScoreBadgeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
}

function getScoreColor(score: number): string {
  if (score >= 80) return '#16A34A'; // green
  if (score >= 60) return '#CA8A04'; // yellow
  if (score >= 40) return '#EA580C'; // orange
  return '#DC2626'; // red
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'Hot';
  if (score >= 60) return 'Warm';
  if (score >= 40) return 'Cool';
  return 'Cold';
}

const SIZE_MAP = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
};

export function ScoreBadge({ score, size = 'md' }: ScoreBadgeProps) {
  const color = getScoreColor(score);

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div
        className={`${SIZE_MAP[size]} rounded-full flex items-center justify-center font-bold text-white`}
        style={{ backgroundColor: color }}
        title={`Lead Score: ${score}/100 (${getScoreLabel(score)})`}
      >
        {score}
      </div>
      {size !== 'sm' && (
        <span className="text-[10px] font-medium uppercase" style={{ color }}>
          {getScoreLabel(score)}
        </span>
      )}
    </div>
  );
}

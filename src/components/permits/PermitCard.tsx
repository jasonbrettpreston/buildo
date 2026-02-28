'use client';

import { Badge } from '@/components/ui/Badge';
import { ScoreBadge } from '@/components/ui/ScoreBadge';
import { PROJECT_TYPE_CONFIG, formatScopeTag, getScopeTagColor } from '@/lib/classification/scope';
import type { ProjectType } from '@/lib/classification/scope';

interface PermitCardProps {
  permit: {
    permit_num: string;
    revision_num: string;
    permit_type: string;
    work: string;
    street_num: string;
    street_name: string;
    street_type: string;
    city: string;
    ward: string;
    status: string;
    description: string;
    est_const_cost: number | null;
    issued_date: string | null;
    builder_name: string;
    project_type?: string | null;
    scope_tags?: string[] | null;
    storeys?: number | null;
  };
  trades?: {
    trade_slug: string;
    trade_name: string;
    color: string;
    lead_score: number;
    confidence: number;
    phase: string;
  }[];
  topScore?: number;
  onSave?: () => void;
  onView?: () => void;
  saved?: boolean;
}

function formatCost(cost: number | null): string {
  if (cost == null) return 'N/A';
  if (cost >= 1_000_000) return `$${(cost / 1_000_000).toFixed(1)}M`;
  if (cost >= 1_000) return `$${(cost / 1_000).toFixed(0)}K`;
  return `$${cost.toLocaleString()}`;
}

function formatAddress(p: PermitCardProps['permit']): string {
  return [p.street_num, p.street_name, p.street_type, p.city]
    .filter(Boolean)
    .join(' ');
}

function daysSince(dateStr: string | null): string {
  if (!dateStr) return '';
  const days = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

const STATUS_COLORS: Record<string, string> = {
  'Permit Issued': '#16A34A',
  'Revision Issued': '#16A34A',
  'Inspection': '#2563EB',
  'Under Review': '#CA8A04',
  'Issuance Pending': '#CA8A04',
  'Application On Hold': '#9333EA',
  'Application Received': '#9333EA',
  'Pre-Permit (Upcoming)': '#7C3AED',
  'Work Not Started': '#6B7280',
  'Revocation Pending': '#DC2626',
  'Pending Cancellation': '#DC2626',
  'Abandoned': '#6B7280',
};

export function PermitCard({
  permit,
  trades = [],
  topScore,
  onSave,
  onView,
  saved = false,
}: PermitCardProps) {
  const score = topScore ?? trades[0]?.lead_score ?? 0;

  return (
    <div
      className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
      onClick={onView}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Address */}
          <h3 className="font-semibold text-gray-900 truncate">
            {formatAddress(permit)}
          </h3>

          {/* Permit number + status */}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-500 font-mono">
              {permit.permit_num}
            </span>
            <Badge
              label={permit.status}
              color={STATUS_COLORS[permit.status] || '#6B7280'}
              size="sm"
            />
          </div>

          {/* Description */}
          <p className="text-sm text-gray-600 mt-2 line-clamp-2">
            {permit.description || 'No description available'}
          </p>

          {/* Meta row */}
          <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
            <span>{permit.permit_type}</span>
            <span>{formatCost(permit.est_const_cost)}</span>
            {permit.issued_date && (
              <span>{daysSince(permit.issued_date)}</span>
            )}
            {permit.ward && <span>Ward {permit.ward}</span>}
            {permit.project_type && (
              <span>{PROJECT_TYPE_CONFIG[permit.project_type as ProjectType]?.label || permit.project_type}</span>
            )}
          </div>

          {/* Builder */}
          {permit.builder_name && (
            <div className="mt-2 text-xs text-gray-500">
              Builder:{' '}
              <a
                href={`/builders?search=${encodeURIComponent(permit.builder_name)}`}
                onClick={(e) => e.stopPropagation()}
                className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
              >
                {permit.builder_name}
              </a>
            </div>
          )}

          {/* Trade badges */}
          {trades.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {trades.map((t) => (
                <Badge
                  key={t.trade_slug}
                  label={t.trade_name}
                  color={t.color}
                  size="sm"
                />
              ))}
            </div>
          )}

          {/* Scope tags */}
          {permit.scope_tags && permit.scope_tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {permit.scope_tags.slice(0, 5).map((tag) => (
                <Badge
                  key={tag}
                  label={formatScopeTag(tag, permit.storeys ?? undefined)}
                  color={getScopeTagColor(tag)}
                  variant="outline"
                  size="sm"
                />
              ))}
              {permit.scope_tags.length > 5 && (
                <span className="text-xs text-gray-400 self-center">
                  +{permit.scope_tags.length - 5} more
                </span>
              )}
            </div>
          )}
        </div>

        {/* Score + Save */}
        <div className="flex flex-col items-center gap-2 shrink-0">
          <ScoreBadge score={score} />
          {onSave && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSave();
              }}
              className={`text-xs px-2 py-1 rounded border transition-colors ${
                saved
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'border-gray-300 text-gray-500 hover:border-blue-300 hover:text-blue-600'
              }`}
            >
              {saved ? 'Saved' : 'Save'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

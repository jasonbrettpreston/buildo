// Admin dashboard pure helpers — extracted from admin/page.tsx for testability
// SPEC LINK: docs/specs/26_admin.md
import type { AdminStats, HealthStatus } from './types';

// ---------------------------------------------------------------------------
// Pipeline schedules
// ---------------------------------------------------------------------------

export const PIPELINE_SCHEDULES: Record<string, { label: string; intervalDays: number; scheduleNote: string }> = {
  permits: { label: 'Daily', intervalDays: 1, scheduleNote: 'Daily at 2:00 AM EST' },
  coa: { label: 'Daily', intervalDays: 1, scheduleNote: 'Daily at 3:00 AM EST' },
  builders: { label: 'Daily', intervalDays: 1, scheduleNote: 'Daily at 4:00 AM EST (after permits)' },
  address_points: { label: 'Quarterly', intervalDays: 90, scheduleNote: 'Quarterly (Jan, Apr, Jul, Oct)' },
  parcels: { label: 'Quarterly', intervalDays: 90, scheduleNote: 'Quarterly (Jan, Apr, Jul, Oct)' },
  massing: { label: 'Quarterly', intervalDays: 90, scheduleNote: 'Quarterly (Jan, Apr, Jul, Oct)' },
  neighbourhoods: { label: 'Annual', intervalDays: 365, scheduleNote: 'Annual (January)' },
};

export const STATUS_DOT: Record<HealthStatus, string> = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  red: 'bg-red-500',
};

export const POLL_INTERVAL_MS = 5000;

// ---------------------------------------------------------------------------
// Health status computation
// ---------------------------------------------------------------------------

export function getPipelineHealth(count: number, lastSyncAt: string | null): HealthStatus {
  if (count === 0 || !lastSyncAt) return 'red';
  const hours = (Date.now() - new Date(lastSyncAt).getTime()) / (1000 * 60 * 60);
  if (hours <= 36) return 'green';
  if (hours <= 72) return 'yellow';
  return 'red';
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function calcPct(num: number, denom: number): number {
  if (denom === 0) return 0;
  return Math.round((num / denom) * 1000) / 10;
}

export function formatRelativeTime(dateStr: string | null): string {
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

/**
 * Compute the next scheduled run date from fixed schedule rules.
 * Daily pipelines: next occurrence of scheduled hour (EST).
 * Quarterly: next of Jan 1, Apr 1, Jul 1, Oct 1.
 * Annual: next Jan 1.
 */
export function getNextScheduledDate(slug: string): string {
  const now = new Date();
  const schedule = PIPELINE_SCHEDULES[slug];
  if (!schedule) return 'Unknown';

  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  if (schedule.label === 'Daily') {
    const estHours: Record<string, number> = { permits: 7, coa: 8, builders: 9 };
    const hour = estHours[slug] ?? 7;
    const next = new Date(now);
    next.setUTCHours(hour, 0, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    return fmt(next);
  }

  if (schedule.label === 'Quarterly') {
    const quarterMonths = [0, 3, 6, 9];
    const year = now.getFullYear();
    for (const month of quarterMonths) {
      const d = new Date(year, month, 1);
      if (d > now) return fmt(d);
    }
    return fmt(new Date(year + 1, 0, 1));
  }

  if (schedule.label === 'Annual') {
    const thisYear = new Date(now.getFullYear(), 0, 1);
    if (thisYear > now) return fmt(thisYear);
    return fmt(new Date(now.getFullYear() + 1, 0, 1));
  }

  return 'Unknown';
}

export function getLastRunAt(stats: AdminStats, slug: string): string | null {
  return stats.pipeline_last_run?.[slug]?.last_run_at ?? null;
}

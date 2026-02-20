import type { Neighbourhood } from './types';

/**
 * Classify neighbourhood income level based on average household income.
 */
export function classifyIncome(avg: number | null): string {
  if (avg == null) return 'unknown-income';
  if (avg >= 100000) return 'high-income';
  if (avg >= 60000) return 'middle-income';
  return 'lower-income';
}

/**
 * Classify tenure pattern based on owner percentage.
 */
export function classifyTenure(ownerPct: number | null): string {
  if (ownerPct == null) return 'unknown-tenure';
  if (ownerPct >= 60) return 'owner-occupied';
  if (ownerPct <= 40) return 'renter-majority';
  return 'mixed-tenure';
}

/**
 * Generate a one-line summary sentence from neighbourhood data.
 */
export function generateSummary(n: Neighbourhood): string {
  const parts: string[] = [];

  const income = classifyIncome(n.avg_household_income);
  if (income !== 'unknown-income') {
    parts.push(income.charAt(0).toUpperCase() + income.slice(1));
  }

  const tenure = classifyTenure(n.tenure_owner_pct);
  if (tenure !== 'unknown-tenure') {
    parts.push(tenure);
  }

  if (n.period_of_construction) {
    parts.push(`built ${n.period_of_construction}`);
  }

  return parts.join(', ');
}

/**
 * Format a dollar amount for display.
 */
export function formatIncome(v: number | null): string {
  if (v == null) return 'N/A';
  return `$${v.toLocaleString()}`;
}

/**
 * Format a percentage value for display.
 */
export function formatPct(v: number | null): string {
  if (v == null) return 'N/A';
  return `${v}%`;
}

/**
 * Format a construction period for display.
 */
export function formatPeriod(v: string | null): string {
  if (!v) return 'N/A';
  return `Built ${v}`;
}

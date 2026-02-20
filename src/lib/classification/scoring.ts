import { differenceInDays } from 'date-fns';
import type { Permit, TradeMatch } from '@/lib/permits/types';
import { isTradeActiveInPhase } from '@/lib/classification/phases';

// ---------------------------------------------------------------------------
// Score component helpers
// ---------------------------------------------------------------------------

/** Base score derived from the permit status. */
function statusBaseScore(status: string | undefined): number {
  switch ((status ?? '').toLowerCase().trim()) {
    case 'issued':
      return 50;
    case 'under inspection':
      return 40;
    case 'application':
      return 30;
    case 'not issued':
      return 20;
    case 'completed':
      return 15;
    case 'closed':
      return 10;
    default:
      return 25;
  }
}

/** 0-15 boost based on estimated construction cost. */
function costBoost(cost: number | null | undefined): number {
  if (cost == null || cost <= 0) return 0;
  if (cost >= 10_000_000) return 15;
  if (cost >= 5_000_000) return 12;
  if (cost >= 1_000_000) return 10;
  if (cost >= 500_000) return 8;
  if (cost >= 100_000) return 5;
  if (cost >= 50_000) return 3;
  return 1;
}

/** 0-20 boost based on how recent the issued_date is. */
function freshnessBoost(issuedDate: Date | null | undefined): number {
  if (!issuedDate) return 0;
  const daysAgo = differenceInDays(new Date(), issuedDate);
  if (daysAgo < 0) return 20; // future date = very fresh
  if (daysAgo <= 30) return 20;
  if (daysAgo <= 90) return 15;
  if (daysAgo <= 180) return 10;
  if (daysAgo <= 365) return 5;
  return 0;
}

/** 0-15 bonus if the trade is active in the current phase. */
function phaseMatchBoost(tradeSlug: string | undefined, phase: string): number {
  if (!tradeSlug) return 0;
  return isTradeActiveInPhase(tradeSlug, phase) ? 15 : 0;
}

/** 0-10 boost based on classification confidence. */
function confidenceBoost(confidence: number | undefined): number {
  if (confidence == null) return 0;
  return Math.round(confidence * 10);
}

/** 0-20 penalty for permits more than 2 years old. */
function stalenessPenalty(issuedDate: Date | null | undefined): number {
  if (!issuedDate) return 10; // no date = mildly stale
  const daysAgo = differenceInDays(new Date(), issuedDate);
  if (daysAgo <= 730) return 0; // within 2 years
  if (daysAgo <= 1095) return 10; // 2-3 years
  return 20; // > 3 years
}

/** 0-30 penalty for revoked or cancelled permits. */
function revocationPenalty(status: string | undefined): number {
  const s = (status ?? '').toLowerCase().trim();
  if (s === 'revoked' || s === 'cancelled' || s === 'canceled') return 30;
  if (s === 'suspended') return 20;
  return 0;
}

// ---------------------------------------------------------------------------
// Main scoring function
// ---------------------------------------------------------------------------

/**
 * Calculate a lead score from 0-100 for a permit/trade combination.
 *
 * Components (additive):
 *   base_score        (0-50)  from permit status
 *   cost_boost        (0-15)  from estimated construction cost
 *   freshness_boost   (0-20)  from issued date recency
 *   phase_match       (0-15)  if trade is relevant in current phase
 *   confidence_boost  (0-10)  from classification confidence
 *
 * Penalties (subtractive):
 *   staleness_penalty  (0-20) for old permits
 *   revocation_penalty (0-30) for revoked/cancelled status
 *
 * The result is clamped to the 0-100 range.
 */
export function calculateLeadScore(
  permit: Partial<Permit>,
  tradeMatch: Partial<TradeMatch>,
  phase: string
): number {
  const base = statusBaseScore(permit.status);
  const cost = costBoost(permit.est_const_cost);
  const freshness = freshnessBoost(permit.issued_date);
  const phaseMatch = phaseMatchBoost(tradeMatch.trade_slug, phase);
  const confidence = confidenceBoost(tradeMatch.confidence);

  const staleness = stalenessPenalty(permit.issued_date);
  const revocation = revocationPenalty(permit.status);

  const raw = base + cost + freshness + phaseMatch + confidence - staleness - revocation;

  return Math.max(0, Math.min(100, raw));
}

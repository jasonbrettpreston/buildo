'use client';
// 🔗 SPEC LINK: docs/specs/03-mobile/75_lead_feed_implementation_guide.md §4.6
// 🔗 DESIGN: docs/specs/03-mobile/74_lead_feed_design.md §Timing
//
// TimingBadge — displays the timing engine's output for a lead:
//   - `display` — human-readable string like "Need now" or "2-4 weeks"
//     (from spec 71 timing engine Tier 1/2/3 output)
//   - `score` — 0-30 timing pillar score (spec 70 §4 Behavioral Contract)
//   - `confidence` — 'high' | 'medium' | 'low' from the timing engine
//
// Layout: full-width pill with a clock icon, the display string, an
// optional "est." tag when confidence !== 'high', plus a Tremor
// ProgressCircle showing the score. The pill's color tone comes from
// a score-band function matching spec 74's timing color scale.
//
// Score boundaries (spec 74 §Timing). 5 tones:
//   < 0   → Past (red) — trade window has passed, negative score sentinel
//   >= 25 → NOW (amber)
//   >= 20 → Soon (green)
//   >= 10 → Upcoming (blue)
//   0..9  → Distant (gray) — renamed from "Future" to match spec 74
//
// NOTE: The timing pillar maxes at 30 per spec 70 §4, so the top band
// starts at 25 (leaving headroom at the very top). The UI-side score
// band boundaries are internal to this component and do NOT need to
// match the server-side scoring pillars exactly. They are documented
// inline and locked by tests.
//
// The Past tone is an explicit lower sentinel: consumers pass a
// negative score when the trade window has passed (spec 71 Tier 1
// stale fallback). Without this branch, past leads would render as
// "distant" gray — a cross-phase Sonnet review finding.

import { ClockIcon } from '@heroicons/react/24/outline';
import { ProgressCircle } from '@tremor/react';
import { cn } from '@/lib/utils';

export type TimingConfidence = 'high' | 'medium' | 'low';

export interface TimingBadgeProps {
  display: string;
  score: number;
  confidence: TimingConfidence;
  /** Optional className override — merged via `cn()` so consumers can tweak spacing in 3-iii cards without losing the tone classes. */
  className?: string;
}

interface Tone {
  bg: string;
  text: string;
  tremorColor: 'amber' | 'emerald' | 'blue' | 'gray' | 'red';
  label: 'NOW' | 'Soon' | 'Upcoming' | 'Distant' | 'Past';
}

/**
 * Map a timing score to a color tone per spec 74 §Timing bands.
 * Exported for test assertions.
 *
 * Defensive: non-finite or negative scores fall through to the Future
 * tone so a malformed API response doesn't crash the card. Scores
 * above 30 clamp to the NOW band (the first `>= 25` branch).
 */
export function getTimingTone(score: number): Tone {
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return {
      bg: 'bg-neutral-700',
      text: 'text-neutral-100',
      tremorColor: 'gray',
      label: 'Distant',
    };
  }
  if (score < 0) {
    // Past: trade window has passed. Spec 74 uses a red tone to draw
    // immediate attention — distinct from Distant (gray) which is
    // "far in the future but still upcoming."
    return {
      bg: 'bg-timing-past',
      text: 'text-neutral-100',
      tremorColor: 'red',
      label: 'Past',
    };
  }
  if (score >= 25) {
    return {
      bg: 'bg-amber-hardhat',
      text: 'text-neutral-900',
      tremorColor: 'amber',
      label: 'NOW',
    };
  }
  if (score >= 20) {
    return {
      bg: 'bg-green-safety',
      text: 'text-neutral-900',
      tremorColor: 'emerald',
      label: 'Soon',
    };
  }
  if (score >= 10) {
    return {
      bg: 'bg-blue-blueprint',
      text: 'text-neutral-100',
      tremorColor: 'blue',
      label: 'Upcoming',
    };
  }
  return {
    bg: 'bg-neutral-700',
    text: 'text-neutral-100',
    tremorColor: 'gray',
    label: 'Distant',
  };
}

export function TimingBadge({
  display,
  score,
  confidence,
  className,
}: TimingBadgeProps) {
  const tone = getTimingTone(score);
  const showEstimate = confidence !== 'high';

  return (
    // role=img with aria-label is the WAI-ARIA idiom for a composite
    // visual indicator (pill + progress circle) that should announce
    // as a single accessible unit. `role="group"` would be correct but
    // Biome's a11y rule flags it as preferring a semantic `<fieldset>`,
    // which doesn't fit the visual pattern. `role="img"` is the spec-
    // sanctioned fallback for visual composites.
    <div
      className={cn('flex items-center justify-between gap-2', className)}
      role="img"
      aria-label={`Timing ${tone.label}: ${display}, confidence ${confidence}, score ${score}`}
    >
      <div
        className={cn(
          'flex min-h-11 flex-1 items-center gap-2 rounded-md px-3 py-2',
          tone.bg,
          tone.text,
        )}
      >
        <ClockIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="font-display text-sm font-semibold leading-tight truncate">
          {display}
        </span>
        {showEstimate && (
          <span
            className="ml-auto text-[10px] opacity-75"
            title="estimated"
          >
            est.
          </span>
        )}
      </div>
      {/* Tremor ProgressCircle accepts a 0-100 value. Our timing pillar
          score is 0-30 per spec 70 §4, so we scale for the visual arc
          but display the raw score in the center label. The negative
          sentinel for the Past tone (spec-71 staleness fallback) must
          be clamped to 0 before scaling — a negative ProgressCircle
          value renders an inverted/broken arc. DeepSeek holistic
          2026-04-09 review. */}
      <ProgressCircle
        value={Math.min(100, Math.max(0, Math.round((score / 30) * 100)))}
        size="md"
        color={tone.tremorColor}
        radius={24}
        strokeWidth={4}
        className="shrink-0"
      >
        <span className="text-sm font-bold text-text-primary">{score}</span>
      </ProgressCircle>
    </div>
  );
}

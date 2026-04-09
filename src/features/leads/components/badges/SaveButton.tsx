'use client';
// 🔗 SPEC LINK: docs/specs/product/future/75_lead_feed_implementation_guide.md §4.7
//
// SaveButton — the heart toggle that persists a lead to the user's
// saved leads list. Wires the `useLeadView` mutation from Phase 3-i
// with an optimistic `saved` state, rollback on error, double-click
// guard, vibration haptic, and `captureEvent` telemetry.
//
// Error feedback is delivered via the `onError` callback so the
// consumer can choose between Sonner toast (3-iii cards), inline
// text (onboarding flow), or silent rollback (3-ii tests). The
// button itself does not render any feedback surface — keeping it
// atomic.
//
// Accessibility:
//   - aria-label reflects the CURRENT saved state (not the stale prop)
//   - `aria-pressed` exposes the toggle state to screen readers
//   - min-h-11 (44px) touch target via Shadcn Button size="default"
//   - Disabled while mutation is in-flight → keyboard focus stays
//     without allowing double-activation

import { HeartIcon as HeartOutline } from '@heroicons/react/24/outline';
import { HeartIcon as HeartSolid } from '@heroicons/react/24/solid';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { LeadApiClientError } from '@/features/leads/api/types';
import { useLeadView } from '@/features/leads/api/useLeadView';
import { captureEvent } from '@/lib/observability/capture';

// Module scope — NOT inside SaveButton's function body. Creating a
// Motion component inside render creates a brand-new component type
// every render, which React treats as a different element and
// unmounts/remounts on every tick. Hoisted per Gemini Phase 3-ii
// adversarial review (HIGH).
const MotionButton = motion.create(Button);

export interface SaveButtonProps {
  leadId: string;
  leadType: 'permit' | 'builder';
  tradeSlug: string;
  /** Permit lead composite key (required when leadType === 'permit') */
  permitNum?: string;
  /** Permit revision number (required when leadType === 'permit') */
  revisionNum?: string;
  /** Builder entity_id (required when leadType === 'builder') */
  entityId?: number;
  /** Initial saved state — consumer passes the persisted value from Phase 3-iv feed data */
  initialSaved?: boolean;
  /** Error callback (3-iii consumers will wire a Sonner toast here) */
  onError?: (err: LeadApiClientError) => void;
  /** Success callback fires AFTER the mutation resolves */
  onSaveChange?: (saved: boolean) => void;
}

/**
 * Feature-detect the Vibration API. Safari (iOS) doesn't implement it;
 * the call must be guarded so it doesn't throw.
 */
function vibrate(ms: number): void {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as Navigator & { vibrate?: (pattern: number | number[]) => boolean };
  if (typeof nav.vibrate === 'function') {
    try {
      nav.vibrate(ms);
    } catch {
      // Silent — vibration is a nice-to-have, not a contract.
    }
  }
}

export function SaveButton({
  leadId,
  leadType,
  tradeSlug,
  permitNum,
  revisionNum,
  entityId,
  initialSaved = false,
  onError,
  onSaveChange,
}: SaveButtonProps) {
  const [saved, setSaved] = useState(initialSaved);
  // Sync local state with the parent prop. Without this, parent
  // refetches that change `initialSaved` (e.g., refreshing the feed
  // after a mutation elsewhere) would leave SaveButton with stale
  // state — a controlled/uncontrolled anti-pattern flagged by Gemini
  // Phase 3-ii adversarial review (CRITICAL).
  useEffect(() => {
    setSaved(initialSaved);
  }, [initialSaved]);

  // Gate the Motion animation on USER interaction only. Without this,
  // a parent refetch that flips `initialSaved` would trigger the
  // pulse animation as if the user had clicked — caught by DeepSeek
  // Phase 3-ii adversarial review (MED).
  const userInteractedRef = useRef(false);
  const mutation = useLeadView();

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    // Double-click guard — if the mutation is in-flight, ignore the
    // second click. The server's save/unsave is idempotent but
    // rapidly toggling would still fire 2 mutations and return
    // 2 stale competition counts.
    if (mutation.isPending) return;

    const nextSaved = !saved;

    // Validate input BEFORE any state mutation or telemetry so an
    // invalid-input fallthrough doesn't log phantom events. Gemini
    // Phase 3-ii review (MED) caught that telemetry fired on the
    // INVALID_INPUT rollback path.
    if (leadType === 'permit') {
      if (!permitNum || !revisionNum) {
        onError?.(
          new LeadApiClientError(
            'INVALID_INPUT',
            'SaveButton: permit lead requires permitNum + revisionNum',
          ),
        );
        return;
      }
    } else if (typeof entityId !== 'number') {
      onError?.(
        new LeadApiClientError(
          'INVALID_INPUT',
          'SaveButton: builder lead requires entityId',
        ),
      );
      return;
    }

    // Passed validation — now commit the optimistic UI update,
    // telemetry, and mutation.
    userInteractedRef.current = true;
    setSaved(nextSaved);
    vibrate(10);

    captureEvent(nextSaved ? 'lead_feed.lead_saved' : 'lead_feed.lead_unsaved', {
      lead_type: leadType,
      lead_id: leadId,
      trade_slug: tradeSlug,
    });

    const action: 'save' | 'unsave' = nextSaved ? 'save' : 'unsave';
    // The validation branches above guarantee the required fields
    // are defined here, but TypeScript narrowing doesn't propagate
    // across the validation early-returns back to this point. We
    // re-narrow with local consts (NOT `!` non-null assertions,
    // which Biome bans).
    let payload:
      | {
          action: 'save' | 'unsave';
          lead_type: 'permit';
          trade_slug: string;
          permit_num: string;
          revision_num: string;
        }
      | {
          action: 'save' | 'unsave';
          lead_type: 'builder';
          trade_slug: string;
          entity_id: number;
        };
    if (leadType === 'permit') {
      // Re-validated: permitNum + revisionNum are truthy strings here
      // because the early return above handled the undefined case.
      const pn = permitNum;
      const rn = revisionNum;
      if (!pn || !rn) return; // unreachable; satisfies the compiler
      payload = {
        action,
        lead_type: 'permit',
        trade_slug: tradeSlug,
        permit_num: pn,
        revision_num: rn,
      };
    } else {
      const eid = entityId;
      if (typeof eid !== 'number') return; // unreachable
      payload = {
        action,
        lead_type: 'builder',
        trade_slug: tradeSlug,
        entity_id: eid,
      };
    }

    mutation.mutate(payload, {
      onError: (err) => {
        setSaved(!nextSaved); // rollback
        onError?.(err);
      },
      onSuccess: () => {
        onSaveChange?.(nextSaved);
      },
    });
  };

  return (
    <MotionButton
      type="button"
      variant="ghost"
      size="default"
      onClick={handleClick}
      disabled={mutation.isPending}
      className="flex-1"
      animate={userInteractedRef.current && saved ? { scale: [1, 1.3, 1] } : { scale: 1 }}
      whileTap={{ scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20, mass: 1 }}
      aria-label={saved ? 'Remove from saved' : 'Save lead'}
      aria-pressed={saved}
    >
      {saved ? (
        <HeartSolid className="mr-2 h-5 w-5 text-amber-hardhat" aria-hidden="true" />
      ) : (
        <HeartOutline className="mr-2 h-5 w-5" aria-hidden="true" />
      )}
      <span className={saved ? 'text-amber-hardhat' : ''}>
        {saved ? 'Saved' : 'Save'}
      </span>
    </MotionButton>
  );
}

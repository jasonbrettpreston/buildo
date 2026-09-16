/** @jest-environment node */
// SPEC LINK: docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §4 (screens)
//            docs/specs/02-web-admin/126_maxbld_surface_standard.md §3.1 (LIST archetype)
//            Surface S-072 `mobile_tracked_lots` · contract C-039 `contract_parcels_tracked`
//
// Node-env pure-helper tests, per the mobile convention (`useParcelLookup.test.ts` states it:
// "Exercises the exported pure helpers … without a React renderer"). `@testing-library/react-native`
// is not installed, so the screen's logic lives in `mobile/src/lib/trackedLots.ts` precisely so it
// can be locked here: pluralisation, manage-mode toggle, delete-then-undo, navigation target, count.

import {
  coaRulingIsPositive,
  coaRulingLabel,
  commitRemoval,
  formatGfa,
  initialView,
  removalToastLabel,
  removeLot,
  setManageMode,
  trackedCountLabel,
  trackedLotRoute,
  undoRemoval,
  type TrackedLot,
} from '@/lib/trackedLots';
import { TrackedLotsResultSchema } from '@/hooks/useTrackedLots';

const lot = (parcelId: string, address: string, over: Partial<TrackedLot> = {}): TrackedLot => ({
  parcelId,
  address,
  maxBuildGfaSqm: 400,
  maxCoaBuildGfaSqm: 600,
  newNearbyCoaRuling: false,
  jurisdiction: 'TORONTO, ON',
  trackedAt: '2026-09-14T00:00:00.000Z',
  ...over,
});

const three = () => [lot('A', '1 Alpha St'), lot('B', '2 Bravo Ave'), lot('C', '3 Charlie Rd')];

describe('pluralisation — the header count', () => {
  it.each([
    [0, 'No Tracked Lots'],
    [1, '1 Tracked Lot'],
    [2, '2 Tracked Lots'],
    [12, '12 Tracked Lots'],
  ])('%i → "%s"', (n, expected) => {
    expect(trackedCountLabel(n)).toBe(expected);
  });

  it('a negative count cannot render a nonsense label', () => {
    expect(trackedCountLabel(-1)).toBe('No Tracked Lots');
  });
});

describe('the three display fields render what we actually know', () => {
  it('formats a real GFA figure with a thousands separator', () => {
    expect(formatGfa(1240)).toBe('1,240 m² GFA');
    expect(formatGfa(412)).toBe('412 m² GFA');
    expect(formatGfa(412.6)).toBe('413 m² GFA');
  });

  it('an absent GFA is an em dash, NEVER a zero', () => {
    // 0 m² is a claim about someone's lot; "—" is the absence of one.
    expect(formatGfa(null)).toBe('—');
    expect(formatGfa(undefined)).toBe('—');
    expect(formatGfa(Number.NaN)).toBe('—');
    expect(formatGfa(0)).toBe('0 m² GFA'); // a measured zero still renders as a measurement
  });

  it('the CoA ruling is YES / NO / "—" and null is NEVER shown as NO', () => {
    // THE LOCK: `newNearbyCoaRuling` has no backing column — nothing computes it yet. Rendering
    // "NO" for an uncomputed field would be inventing a fact about the user's lot.
    expect(coaRulingLabel(true)).toBe('YES');
    expect(coaRulingLabel(false)).toBe('NO');
    expect(coaRulingLabel(null)).toBe('—');
    expect(coaRulingLabel(undefined)).toBe('—');
  });

  it('only a definite YES earns the tertiary-green highlight', () => {
    expect(coaRulingIsPositive(true)).toBe(true);
    expect(coaRulingIsPositive(false)).toBe(false);
    expect(coaRulingIsPositive(null)).toBe(false);
  });
});

describe('navigation target', () => {
  it('taps through to the lot report in this stack, by PATH segment', () => {
    // `[parcelId].tsx` reads a path param via useLocalSearchParams — this must not become a
    // query-param href like the root [lead] / [flight-job] routes.
    expect(trackedLotRoute('PIN-777')).toBe('/(app)/parcel-tool/PIN-777');
  });

  it('encodes a URL-hostile parcel id', () => {
    expect(trackedLotRoute('A/B 1')).toBe('/(app)/parcel-tool/A%2FB%201');
  });
});

describe('delete then undo', () => {
  it('removing a lot drops it from the list immediately, so the count updates', () => {
    const v0 = initialView(three());
    expect(trackedCountLabel(v0.lots.length)).toBe('3 Tracked Lots');

    const v1 = removeLot(v0, 'B');
    expect(v1.lots.map((l) => l.parcelId)).toEqual(['A', 'C']);
    expect(trackedCountLabel(v1.lots.length)).toBe('2 Tracked Lots');
    expect(v1.pending?.lot.parcelId).toBe('B');
  });

  it('undo puts the lot back AT ITS ORIGINAL INDEX, not at the end', () => {
    const v1 = removeLot(initialView(three()), 'B');
    const v2 = undoRemoval(v1);
    expect(v2.lots.map((l) => l.parcelId)).toEqual(['A', 'B', 'C']);
    expect(v2.pending).toBeNull();
    expect(trackedCountLabel(v2.lots.length)).toBe('3 Tracked Lots');
  });

  it('undo restores the first and the last correctly too', () => {
    expect(undoRemoval(removeLot(initialView(three()), 'A')).lots.map((l) => l.parcelId))
      .toEqual(['A', 'B', 'C']);
    expect(undoRemoval(removeLot(initialView(three()), 'C')).lots.map((l) => l.parcelId))
      .toEqual(['A', 'B', 'C']);
  });

  it('committing makes the removal final and clears the undo affordance', () => {
    const v = commitRemoval(removeLot(initialView(three()), 'B'));
    expect(v.pending).toBeNull();
    expect(v.lots.map((l) => l.parcelId)).toEqual(['A', 'C']);
    // Undo after commit is a no-op — nothing to restore.
    expect(undoRemoval(v).lots.map((l) => l.parcelId)).toEqual(['A', 'C']);
  });

  it('a second removal commits the first — one toast, one undoable action', () => {
    const v1 = removeLot(initialView(three()), 'A');
    const v2 = removeLot(v1, 'C');
    expect(v2.lots.map((l) => l.parcelId)).toEqual(['B']);
    expect(v2.pending?.lot.parcelId).toBe('C');
    // Undoing now restores only C; A is gone for good, which is why the screen fires its DELETE
    // at exactly this moment.
    expect(undoRemoval(v2).lots.map((l) => l.parcelId)).toEqual(['B', 'C']);
  });

  it('removing an id that is not in the list changes nothing', () => {
    const v0 = initialView(three());
    expect(removeLot(v0, 'NOPE')).toBe(v0);
  });

  it('the toast names the address that was removed', () => {
    expect(removalToastLabel(lot('B', '2 Bravo Ave'))).toBe('Removed 2 Bravo Ave');
  });
});

describe('manage mode', () => {
  it('entering manage mode leaves the data alone', () => {
    const v1 = removeLot(initialView(three()), 'B');
    const r = setManageMode(v1, true);
    expect(r.manageMode).toBe(true);
    expect(r.view.pending?.lot.parcelId).toBe('B');
  });

  it('"Done" means done — leaving manage mode commits a pending removal', () => {
    const v1 = removeLot(initialView(three()), 'B');
    const r = setManageMode(v1, false);
    expect(r.manageMode).toBe(false);
    expect(r.view.pending).toBeNull();
    expect(r.view.lots.map((l) => l.parcelId)).toEqual(['A', 'C']);
  });

  it('toggling with nothing pending is inert', () => {
    const v0 = initialView(three());
    expect(setManageMode(v0, false).view).toBe(v0);
  });
});

describe('the contract boundary', () => {
  it('the declared projection accepts a null ruling and a null GFA', () => {
    const parsed = TrackedLotsResultSchema.safeParse({
      lots: [
        {
          parcelId: 'P1',
          address: '1 Alpha St',
          maxBuildGfaSqm: null,
          maxCoaBuildGfaSqm: null,
          newNearbyCoaRuling: null,
          jurisdiction: 'TORONTO, ON',
          trackedAt: '2026-09-14T00:00:00.000Z',
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it('is strict — an unlisted key is a break, not an extension', () => {
    const parsed = TrackedLotsResultSchema.safeParse({
      lots: [{ ...lot('P1', '1 Alpha St'), sneaky: true }],
    });
    expect(parsed.success).toBe(false);
  });
});

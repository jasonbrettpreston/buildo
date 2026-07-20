// SPEC LINK: docs/specs/02-web-admin/89_parcel_cost_model_tool.md §2 (Behavioral Contract)
//
// Drift guard: ParcelCostTool's LINE_LABELS keys MUST equal the engine's
// PARCEL_COST_LINES ids — the JSONB menu keys the engine writes are the UI's
// lookup contract. Shipped broken from the tool's first commit (4b1712ff):
// full_build/basement_reno/addition_storey never matched the engine's
// max_build/basement/addition, rendering those 3 lines "n/a — not computable"
// on 100% of 486K parcels while the data sat in the menu under the real keys
// (RC investigation 2026-07-20). The UI test suite stayed green because its
// fixture was authored against the WRONG keys — this test ties both sides to
// one source of truth so a rename on either side fails CI instead of shipping
// silently (mirrors the T3_GROUPS/information_schema drift-lock pattern in
// src/lib/admin/parcel-lookup.ts).
import { describe, it, expect } from 'vitest';
import { LINE_LABELS } from '@/components/admin/ParcelCostTool';

// CommonJS engine module — require() is intentional (same pattern as
// cost-model-shared.logic.test.ts; a TS import would need a .d.ts shim).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PARCEL_COST_LINES } = require('../../scripts/lib/parcel-cost.js') as {
  PARCEL_COST_LINES: Array<{ id: string }>;
};

describe('ParcelCostTool LINE_LABELS ↔ engine PARCEL_COST_LINES drift guard', () => {
  it('every engine line id has a display label (no silently-unlabeled menu line)', () => {
    const engineIds = PARCEL_COST_LINES.map((l) => l.id).sort();
    const labelKeys = Object.keys(LINE_LABELS).sort();
    expect(labelKeys).toEqual(engineIds);
  });

  it('the three historically-broken lines resolve to their engine keys', () => {
    // The exact regression: these labels must hang off the ENGINE's ids.
    expect(LINE_LABELS['max_build']).toBe('Max build (as-of-right)');
    expect(LINE_LABELS['basement']).toBe('Basement (reno)');
    expect(LINE_LABELS['addition']).toBe('Addition + storey');
    expect(LINE_LABELS['full_build']).toBeUndefined();
    expect(LINE_LABELS['basement_reno']).toBeUndefined();
    expect(LINE_LABELS['addition_storey']).toBeUndefined();
  });
});

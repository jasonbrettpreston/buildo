# Active Task: WF3 — BLD/CMB permits wrongly classified as orphan when no sibling BLD revision exists
**Status:** Implementation (authorized 2026-05-07 — explicit y/n given on plan-lock)
**Workflow:** WF3 — Bug Fix
**Domain Mode:** Backend/Pipeline (`scripts/classify-lifecycle-phase.js` + Spec 84)
**Rollback Anchor:** `52a0c86` (current HEAD — last WF3 commit)

## Bug

Per Spec 84 §7 Orphan Logic:
> | O1 | Orphan Active  | **Standalone trade permit** (e.g., a furnace swap) with active inspections. |
> | O2 | Orphan Done    | Standalone trade permit finalized. |
> | O3 | Orphan Stalled | Standalone trade permit > stall threshold with no activity. |

The spec scopes O-phases to **standalone trade permits** (HVA, PLB, DRN, etc. — not BLD or CMB). But `scripts/classify-lifecycle-phase.js:798-814` computes `is_orphan = true` for any permit whose `permit_num` prefix (year + serial) has no OTHER BLD/CMB sibling in the `bldCmbByPrefix` map:

```js
let is_orphan = true;
if (parts.length >= 3) {
  const prefix = `${parts[0]} ${parts[1]}`;
  const siblings = bldCmbByPrefix.get(prefix);
  if (siblings) {
    for (const pn of siblings) {
      if (pn !== row.permit_num) {
        is_orphan = false;
        break;
      }
    }
  }
}
```

For a BLD permit whose prefix has no OTHER BLD revisions (the common case — most BLDs are single-revision), `siblings = {self}` → loop never sets `is_orphan = false` → BLD permit wrongly classified into O1/O2/O3 despite being a parent permit, not a standalone trade permit.

**Verified observed instance** (24 Northbridge — `25 122754 BLD`): issued 2025-06-17, status "Inspection", has 2 active sub-permits at P18 (`25 122754 HVA Rev 00`, `25 122754 PLB Rev 00`). Currently `lifecycle_phase = O3`. Per spec, this BLD should be `P18` (BLD-led inspection pipeline). Surfaced through user's manual Flight Center verification.

**Downstream impact:**
- `compute-trade-forecasts.js` doesn't compute predictions for orphan-classified permits → 12 correctly-tagged trades on this BLD (concrete, electrical, plumbing, hvac, framing, drywall, etc.) all get NULL `predicted_start`
- Flight Center shows "No prediction yet" on every saved permit caught in this misclassification
- Likely affects a meaningful fraction of single-revision BLD permits (Toronto's small-residential-projects category — most are single-revision)

## State Verification (WF3 step 2)

**`bldCmbByPrefix` map construction** (verified at `scripts/classify-lifecycle-phase.js:740-770`): keys are `"YY NNNNNN"` prefixes, values are Sets of permit_nums where the suffix is BLD or CMB. Sub-permits with non-BLD/CMB suffixes (HVA, PLB, DRN, ELE, MTL, TPS, etc.) are NOT in this map's values.

**The check's INTENDED semantics** per the inline comment at line 805 ("Orphan iff no OTHER permit_num in the set"): meant to distinguish a sub-permit with a parent BLD (non-orphan) from a sub-permit without one (orphan). Works correctly for sub-permits. **Breaks for BLD/CMB themselves** because they are in their own map (sibling = self) but the loop only counts non-self entries.

**Spec 84 §7 categorical rule:** O-phases apply ONLY to standalone trade permits. BLD and CMB are NEVER trade permits (they are parent permits or combined-permit folders). Therefore `is_orphan = true` for a BLD or CMB permit is a categorical spec violation.

## Spec Review (WF3 step 3)

**Spec 84 §7** (above) — orphans are standalone trade permits. BLD/CMB cannot be orphans by definition.

**Spec 84 §3.4** (decision tree ordering): orphan branch fires before BLD-led branches. So once `is_orphan = true`, the BLD-led status checks are bypassed. Fixing `is_orphan` to be `false` for BLD/CMB lets the BLD-led branches handle them correctly.

**Spec 47** (pipeline protocol): the fix lives inside `pipeline.run` → `streamQuery` loop. No Spec 47 contract changes; the fix is a 5-line inline patch.

## Reproduction (WF3 step 4)

Two reproduction tests:

1. **Logic test** — extract `computeIsOrphan(permitNum, bldCmbByPrefix)` into a pure helper in `scripts/lib/orphan-detection.js`, write a vitest asserting:
   - BLD permit with no sibling BLD → `is_orphan = false` (NEW — fails today)
   - CMB permit with no sibling CMB → `is_orphan = false` (NEW — fails today)
   - HVA/PLB/DRN/ELE etc. sub-permit with no parent BLD/CMB at the prefix → `is_orphan = true` (preserves existing behavior)
   - HVA/PLB/DRN sub-permit with parent BLD → `is_orphan = false` (preserves existing)
2. **Live-DB integration test** (manual, post-deploy): re-run `classify-lifecycle-phase.js` on the dev DB; verify `25 122754 BLD` flips from O3 → P18. Documented in deployment runbook.

## Fix (WF3 step 5)

**Strategy:** add a BLD/CMB short-circuit before the sibling-search loop. If the permit_num ends with `' BLD'` or `' CMB'`, `is_orphan = false` per Spec 84 §7. Otherwise the existing sub-permit-with-parent-BLD logic applies unchanged.

**Files:**

1. **NEW** `scripts/lib/orphan-detection.js` — pure helper extracting the orphan-detection logic. Exported as `computeIsOrphan(permitNum, bldCmbByPrefix)`. Uses `endsWith(' BLD')` / `endsWith(' CMB')` short-circuit + the existing sibling-loop.
2. **MODIFIED** `scripts/classify-lifecycle-phase.js` — replace the inline orphan-detection block (lines 798-814) with a call to the new helper. The `bldCmbByPrefix` map construction stays unchanged.
3. **NEW** `src/tests/orphan-detection.logic.test.ts` — vitest covering the four cases above + edge cases (malformed permit_num, missing prefix, empty bldCmbByPrefix Map).
4. **NO** `lifecycle-phase.ts` changes — the TS classifier accepts `is_orphan` as input; the fix is upstream of the classifier in the JS script that computes the input.

**No `compute-trade-forecasts.js` changes needed** — once `is_orphan` is correctly `false` for the affected BLDs, the forecast pipeline will pick them up on its next run (no orphan exclusion to bypass).

## Idempotency Check (Backend/Pipeline mandate)

`classify-lifecycle-phase.js` already follows Spec 47 §R1-R12 (advisory lock + `pipeline.run` + UPSERT pattern via `INSERT ... ON CONFLICT (permit_num, revision_num) DO UPDATE`). The fix doesn't change write behavior — it changes one input value (`is_orphan`) which feeds the same classifier. Re-running the script after the fix is idempotent: it'll UPDATE `lifecycle_phase` for affected BLDs from O1/O2/O3 → P-codes, then no-op on subsequent runs (since `lifecycle_classified_at > last_seen_at`).

## Pre-Review Self-Checklist (3-5 sibling bug classes)

1. **Other parent-permit suffixes treated as orphan?** Toronto's permit data uses BLD + CMB as parent suffixes. Are there other parent-equivalent suffixes (e.g., revision-only suffixes like ALT, REV, etc.) that should also short-circuit `is_orphan = false`? Need to confirm Toronto's permit-suffix taxonomy. If unsure, document the BLD/CMB-only allowlist as the exact spec-mandated fix (per Spec 84 §7 referencing only BLD/CMB), and mark broader suffixes as a separate followup.
2. **`bldCmbByPrefix` map can be empty for a permit's prefix entirely.** Currently `if (siblings)` guards against undefined. The new helper preserves this guard. Verified.
3. **Permit_num malformed** — fewer than 3 space-separated parts. Currently `if (parts.length >= 3)` guards. The new helper preserves this guard for sub-permits but the BLD/CMB short-circuit fires regardless of parts count (because `endsWith(' BLD')` already implies a permit_num like "25 122754 BLD" with at least 3 parts).
4. **Future ELE permits.** If Toronto starts issuing electrical permits via the city, they'd be sub-permits like "25 122754 ELE". The existing logic (after the fix) would correctly classify them: orphan if no parent BLD, non-orphan if a parent BLD exists at the prefix. No special handling needed.
5. **Stalled-modifier interaction.** `lifecycle_stalled` is computed independently of `is_orphan` (separate `computeStalled()` function in lifecycle-phase.ts). Not affected by this fix. Verified.

## Independent Review (WF3 protocol — single worktree code-reviewer agent)

Per WF3 protocol (no adversarial agents unless requested). One worktree code-reviewer agent at the end with: spec path, modified files list, one-sentence summary. Adversarial review skipped.

## Execution Plan

- [ ] **R1** — Rollback anchor: `52a0c86`. Confirmed.
- [ ] **R2** — Reproduction (red light): write `src/tests/orphan-detection.logic.test.ts`. Without the fix, the BLD-no-sibling case asserts `is_orphan === false` and fails (current behavior returns `true`).
- [ ] **F1** — Create `scripts/lib/orphan-detection.js` with `computeIsOrphan(permitNum, bldCmbByPrefix)` exported.
- [ ] **F2** — Refactor `scripts/classify-lifecycle-phase.js` to import + call the helper, replacing the inline block.
- [ ] **G1** — Run targeted tests → green.
- [ ] **G2** — Run typecheck + lint.
- [ ] **G3** — Full vitest suite for regressions.
- [ ] **G4** — Independent review (worktree code-reviewer agent).
- [ ] **G5** — Triage findings.
- [ ] **G6** — Commit + push.

## Standards Compliance

* **Try-Catch Boundary:** N/A — pure function, no I/O.
* **Unhappy Path Tests:** orphan-detection logic test covers malformed permit_num, empty map, missing prefix.
* **logError Mandate:** N/A — pure function. The calling script logs errors via `pipeline.log` already.
* **UI Layout:** N/A — backend fix.

## Deployment Runbook (post-merge)

1. Run `node scripts/classify-lifecycle-phase.js` against production DB to refresh classifications for affected BLDs (orphan → P-codes).
2. Run `node scripts/compute-trade-forecasts.js` (or whatever the prediction pipeline is named in this codebase) to generate forecasts for the newly-non-orphan BLDs.
3. Verify: `SELECT COUNT(*) FROM permits WHERE permit_num LIKE '% BLD' AND lifecycle_phase IN ('O1','O2','O3')` should drop to ~0 (only edge cases like literal-string-collision should remain).

## Out of Scope (queued)

- `compute-trade-forecasts.js` orphan-skip logic itself — Spec 84 §7 says O-phase permits ARE legitimately orphan trade permits without enough timeline to anchor predictions. Skipping them in forecast generation is correct per spec. Don't change.
- Flight Center UX gaps (no trade-context indicator, no "out-of-scope" hint on null-prediction cards) — file separately as small UX WFs after this WF3 lands.
- Spec 84 ambiguity about which permit_num suffixes count as parent vs trade — if Toronto has parent-suffixes besides BLD/CMB, file a Spec 84 amendment.

> Status: Implementation. Proceeding without further authorization gate per user's explicit "proceed".

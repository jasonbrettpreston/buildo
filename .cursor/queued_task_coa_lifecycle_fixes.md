# Queued Task: CoA Lifecycle Fixes — Fix A (classifier coverage) then Fix B (cross-identity timeline) + Spec amendments

**Status:** Planning — queued behind WF2 #review-templates (committed 2026-05-11)
**Origin:** User-directed investigation 2026-05-11 — "investigate why we excluded P1/P2 from permits lifecycle"
**Discovery date:** 2026-05-11

---

## Background (from the 2026-05-11 investigation)

Live-DB audit of CoA classification revealed two distinct broken-state issues plus four documented-state issues that need spec amendments BEFORE the code fixes land. See `docs/reports/coa_lifecycle_investigation_2026-05-11.md` (TBD — to be authored as part of this WF).

**Key live-DB findings (2026-05-11):**

| Metric | Value | Notes |
|---|---|---|
| Total CoA applications | 33,052 | |
| CoAs with `lifecycle_phase = NULL` | 32,865 | **99.4%** — classifier is functionally not tagging CoAs |
| CoAs with `lifecycle_phase = P1` | 40 | |
| CoAs with `lifecycle_phase = P2` | 147 | |
| CoAs in-flight (no decision, last 12mo) | 1,690 | Of which only 187 have phase tag → **89% of in-flight CoAs invisible to lifecycle classifier** |
| Total permits | 247,028 | |
| Permits with a linked CoA | 16,285 | 6.6% of permits had a CoA antecedent |
| Pattern 1 (sequential: CoA decided → permit filed) | 32,207 | 77.8% of 41,424 linked pairs |
| Pattern 2 (concurrent: permit filed → CoA decided) | 9,180 | 22.2% — permit currently "blocked" on CoA |
| Permits stuck waiting on CoA decision | 171 | Pattern 2 cases with `issued_date IS NULL AND ca.decision IS NULL` |
| Median CoA-decision → permit-filing lag | 1,078 days | p25=291, p75=2,140 |
| Median CoA hearing → decision lag | 23 days | Mean 90 days |

## Phase 1 (this queued WF) — Spec amendments

Per the 2026-05-11 user direction: **document the pattern accurately in specs BEFORE the code fix**, so the post-fix contract is clear and the classifier has something to validate against.

Specs to amend:

- **Spec 50 (`50_source_permits.md`)** — clarify that the CKAN feed includes pre-issuance permits (Application Received / Under Review / Examiner's Notice Sent etc.), not just issued permits. Today reads as if it's "issued permits" feed but actually it's full application-through-completion lifecycle. Add a "Pre-issuance permits" sub-section listing the ~6.5% (16,142) pre-issuance status distribution.

- **Spec 51 (`51_source_coa.md`)** — add cardinality + temporal patterns to §3. Document:
  - 33,052 CoAs, 99.4% with `linked_permit_num` set
  - 82.4% approved, 8.5% refused, 5.1% pending, 3.6% withdrawn/deferred
  - 1,690 in-flight CoAs (no decision, last 12mo)
  - Median 23-day hearing→decision; intake→hearing time unknown (no `submission_date` column)

- **Spec 60 (`60_shared_steps.md`)** — fix the WRONG description of `create-pre-permits.js`. Current spec says "Read-only reporting step — queries and logs, does not mutate data." Actual script INSERTs `PRE-${application_number}` placeholder rows into `permits` table + expires aging Pre-Permits >18 months. Also verify whether Tier 3 FTS in `link-coa.js` is actually implemented (spec says "not yet implemented" but the script source has the path).

- **Spec 84 (`84_lifecycle_phase_engine.md`)** — three additions:
  1. **Add §6 bug entry 84-W12** — "CoA Classifier Silent No-Op": 99.4% of CoA records have NULL `lifecycle_phase` despite the classifier code path existing. Document the symptom + the resolution (Fix A below).
  2. **Add §5 cross-stream commentary** — Pattern 1 (78% sequential) vs Pattern 2 (22% concurrent); the 171 permits currently blocked on CoA decisions; the median 1,078-day lag from CoA approval to permit filing (homeowner-side delay, not municipal).
  3. **Add §3 inline note** that `permit_phase_transitions` ledger is keyed on `(permit_num, revision_num)` — therefore the WF1 #B / WF1 #C `lifecycle.timeline[]` panel structurally cannot render CoA-only leads. Cross-reference Fix B below.

## Phase 2 — Fix A (CoA classifier coverage)

**Goal:** Get `coa_applications.lifecycle_phase` populated for the 1,690 in-flight CoAs (and the long-tail historical CoAs that haven't been re-classified).

**Investigation needed (R2 of Fix A WF):**
- Read `scripts/classify-lifecycle-phase.js` lines 855–906 (the `coa_applications` UPDATE branch I saw at audit) — find why it's leaving 99.4% NULL.
- Likely causes: incremental watermark stuck, filter predicate too narrow (e.g., only updates when `lifecycle_phase` is already set), or the JS `classifyLifecyclePhase()` returning null for CoA inputs that should yield P1/P2.

**Expected outcome:** After Fix A, the distribution should approximately be:
- ~1,690 CoAs at P1 or P2 (currently in-flight)
- ~31,000 CoAs at P3 or P4 (historically decided — though see open question below: do decided CoAs get P3/P4 or do they exit the CoA lifecycle entirely?)

**Spec 84 §3.1 contract refinement (also in Fix A WF):** today the spec says P3 = "CoA Approved" and P4 = "CoA Final" but doesn't clarify whether `coa_applications.lifecycle_phase` should remain at P3/P4 forever post-decision OR transition to a terminal state. Likely the spec needs P3-final and a new TERMINAL-COA-DONE phase or similar. Defer to Fix A plan-lock.

**Re-band exercise:** after Fix A ships, the `logic_variables.lifecycle_band_coa_p1_min/max` and `_coa_p2_min/max` thresholds (Spec 84 §3.8) are currently tuned around 40 / 147 rows — must be re-banded against the post-fix reality (~1,000–2,000 each) or `assert-lifecycle-phase-distribution.js` will WARN/FAIL.

**Multi-agent review:** WF3 standard cadence (worktree only) + optional Gemini if the classifier change touches the shared `lifecycle-phase.js` pure function.

## Phase 3 — Fix B (cross-identity timeline)

**Goal:** When inspecting a permit lead that has a linked CoA antecedent (6.6% of permits — 16,285 today), prepend the CoA's P1→P2→P3→P4 history to the permit's `lifecycle.timeline[]` so the inspector shows the full project trajectory, not just the post-permit-filing portion.

**Data-layer change:** `src/lib/leads/lead-inspect-query.ts` — add a LEFT JOIN against `coa_applications ON linked_permit_num = permit_num`. When present, prepend up to 4 completed entries (P1 CoA Intake → P2 CoA Review → P3 CoA Approved → P4 CoA Final) to the timeline. Carry `linked_confidence` so the UI can de-emphasize low-trust links (e.g. 0.30 FTS-only matches).

**UI change:** `LifecycleTimelinePanel.tsx` — render the prepended CoA entries with a distinct visual treatment (e.g., dashed left border or a "Pre-permit" section header) so operators can tell where the permit-side history begins.

**Pattern 2 special handling:** for the 171 permits blocked on an in-flight CoA, the panel should show the CoA as a *current* phase running CONCURRENTLY with the permit's P6 "Permit Applied" phase, not as a precursor. This is the genuinely hard sub-case — design at Fix B plan-lock.

**Inverse case (CoA-only leads):** when inspecting a `COA-${application_number}` lead (no permit yet filed), the current Lifecycle Timeline panel renders empty because `permit_phase_transitions` has no entries for an application_number. Fix B includes building a synthesized timeline directly from `coa_applications.lifecycle_phase` + the CoA's decision timeline.

**Multi-agent review:** WF1 standard cadence — Gemini + DeepSeek (using the new templates from WF2 #review-templates) + worktree code-reviewer.

## Out of scope (for this queued WF)

- **CoA approval-odds cohort calibration** (the "what's the probability THIS variance gets approved" predictor). Mentioned in the original investigation as a future surface but it's a separate WF — likely a new `compute-coa-approval-cohort.js` script that computes per-(permit_type, ward, scope_tag) approval rates from historical data. File separately.

- **Stale-realtor-row cleanup** (Observation #6 from WF3 #realtor-backfill review_followups). Different domain, unrelated to CoA lifecycle.

- **Predict-needs-CoA classifier** (the "this permit LOOKS like it should need a CoA but has none linked" badge). Discussed as Need B in the investigation — a separate binary classifier WF.

## Suggested order

1. **WF2 — Spec amendments** (Spec 50, 51, 60, 84 — doc-only, no code). Use the new R0 template review cadence to validate spec text. **STATUS: SHIPPED 2026-05-11** (commit forthcoming this turn).
2. **WF3 — Fix A: CoA classifier coverage** (`scripts/classify-lifecycle-phase.js` CoA branch). Next in queue.
3. **WF1 — Fix B: cross-identity timeline** (data-layer extension + UI panel update).
4. **Re-band exercise** post Fix A: update `logic_variables.lifecycle_band_coa_p1_min/max` etc.

Total estimated scope: ~3-5 days across all three WFs.

---

## Phase 3 (Fix B) — design considerations carried forward from WF2 R0 review

From the WF2 #coa-spec-amendments R0 DeepSeek LOW deferral (2026-05-11):

- **Pattern 0 (same-day) edge case — 37 of 41,424 linked pairs.** The `permit.application_date` and `coa_applications.decision_date` fall on the same day. Falls into neither Pattern 1 (sequential, prepend completed CoA history) nor Pattern 2 (concurrent, render concurrent CoA in-progress). Could be:
  - A homeowner who filed both same-day (rare but possible)
  - A late-bound CoA decision happening on the same day the permit application enters CKAN
  - A data artifact (CKAN's date-rounding for older records)

  Fix B design must decide: treat same-day as Pattern 1 (prepend completed history)? Pattern 2 (concurrent)? Or its own visual treatment? Default recommendation: same as Pattern 1 since the CoA decision IS already final on that day — just a tighter timeline. But verify against a couple of actual same-day cases first.

- **PRE-${application_number} synthetic permits in the inspector.** When `create-pre-permits.js` has run (Spec 60 step), the `permits` table contains synthetic `PRE-` rows for approved-but-unlinked CoAs. The admin Lead Detail Inspector accepts a `permit_num` and would render these as regular permits with no real progression history. Fix B should add a render-time check: if `permit_num.startsWith('PRE-')`, render a CoA-style timeline (P1→P4 from the linked CoA), NOT a permit timeline (which would be empty).

- **`linked_confidence` rendering.** Fix B's prepended CoA history should carry the link's `linked_confidence` score (0.30–0.95). Low-confidence links (Tier 3 FTS-only matches at 0.30) should render with a visual de-emphasis or warning tooltip so operators don't trust them as ground truth. The data is there; the UI just needs to expose it.

# Active Task: WF1 #coa-pipeline-parity-phase-d-R5.6 — Lead-identity continuity (Part A only) + Phase D close-out

**Status:** Implementation (4-reviewer plan-review complete; 14 folds applied to Part A; Part B deferred to Spec 48 final phase; user authorized 2026-05-14)
**Workflow:** WF1 (New Feature — extends `scripts/link-coa.js` with permit→CoA data inheritance; spec amendments for Phase D close-out)
**Domain Mode:** Backend/Pipeline (`scripts/`, `docs/specs/`)
**Rollback Anchor:** `fdbb669` (R5.5 compute-coa-cost-estimates shipped)
**Parent WF:** WF1 #coa-pipeline-parity-phase-d (R5.1 ✅ → R5.2 ✅ → R5.3 ✅ → R5.4 ✅ → R5.5 ✅ → **R5.6 + Phase D close-out**)
**Predecessor:** R5.5 (commit `fdbb669`)
**Adversarial review:** USER-REQUESTED — 4 reviewers (Gemini + DeepSeek + independent worktree + observability worktree using Spec 48 lens) at BOTH plan stage AND diff stage.

## Scope decision (post 4-reviewer plan-review, 2026-05-14)

The original two-part plan (Part A = CoA enrichment from linked permit; Part B = `permits.coa_anticipated` flag) received 28 reviewer findings. Part B drew 3 CRITICALs + 5 HIGHs across all 4 reviewers — pattern indicated structurally weaker design (semantic conflict between name + behavior, redundancy with PRE-permit retiring in Phase G, no operational wiring into link-coa.js, regex placeholder needing R0 audit gate). Per user decision: **Part B deferred to Spec 48 implementation as a new final phase**, capturing the operator-visibility intent in its proper observability context (cross-pipeline anticipation tracking). R5.6 now ships only Part A + Phase D close-out spec amendments.

## Why this scope (the actual problem)

A property can enter the pipeline via either side (permit OR CoA). When `link-coa.js` fuzzy-matches them, both records retain their own independently-derived data — CoA gets parcel-centroid lat/long (~10-50m, R5.2); permit got `address_points` lat/long (~5-10m, geocode-permits.js via GEO_ID). A user who saw the lead via the permit feed may later see the linked CoA as a *different* lead with slightly-different attributes, defeating lead-identity continuity.

**R5.6 Part A** closes that gap: when link-coa.js writes `linked_permit_num` with high confidence, inherit the permit's authoritative lat/long + ward into `coa_applications`. The bigger win is *data consistency*, not absolute lat/long accuracy.

**Plus Phase D close-out**: spec amendments to §6.6.D (writer attribution correction), §6.9 (link-coa.js row), §6.11 Phase D (delivery note), and a new §6.X section documenting the lead-identity continuity architecture.

## Context
* **Goal:** Lead-identity continuity for permit↔CoA matched records + Phase D close-out.
* **Target Spec:**
  - `docs/specs/01-pipeline/42_chain_coa.md` §6.6.D + §6.9 + §6.11 Phase D + NEW §6.X
  - `docs/specs/01-pipeline/47_pipeline_script_protocol.md` §R1-R12
  - `docs/specs/01-pipeline/48_pipeline_observability.md` (downstream observer consumer + future-phase note for Part B)

## Technical Implementation — Part A only

### `scripts/link-coa.js` — permit→CoA enrichment pass (post link-coa.js's existing tier writes)

The enrichment runs as a single `withTransaction` AFTER all tier write passes (Tier 1a/1b/1c/2a/2b/3), AFTER the per-permit `last_seen_at` bump, AFTER the existing back-ref write to `permits.linked_coa_application_number`. It is idempotent via IS DISTINCT FROM guards — safe to re-run on every chain invocation.

**Critical fold (Independent C1):** `coa_applications.linked_permit_num` stores only `permit_num`, not `(permit_num, revision_num)`. The permits table has multiple revisions per permit_num, each potentially with different lat/long. JOIN must disambiguate via DISTINCT ON + ORDER BY (mirroring the existing Tier 1a logic at lines 232-247 of link-coa.js):

```sql
-- Subquery picks the "best" revision per linked_permit_num — same convention
-- link-coa.js Tier 1a uses (most recent issue/application date, then highest revision).
WITH best_permit AS (
  SELECT DISTINCT ON (p.permit_num)
         p.permit_num, p.latitude, p.longitude, p.ward
    FROM permits p
   WHERE p.latitude IS NOT NULL
     AND p.longitude IS NOT NULL
   ORDER BY p.permit_num,
            COALESCE(p.issued_date, p.application_date) DESC NULLS LAST,
            p.revision_num DESC
)
UPDATE coa_applications ca
   SET latitude  = bp.latitude,
       longitude = bp.longitude,
       ward      = COALESCE(ca.ward, bp.ward)   -- CoA ward authoritative when set
  FROM best_permit bp
 WHERE ca.linked_permit_num = bp.permit_num
   AND ca.linked_confidence >= $1::numeric
   -- IS DISTINCT FROM guard: idempotent + dead-tuple-bloat prevention
   AND (
        ca.latitude  IS DISTINCT FROM bp.latitude
     OR ca.longitude IS DISTINCT FROM bp.longitude
     OR (ca.ward IS NULL AND bp.ward IS NOT NULL)
   );
```

**Fold-driven design notes:**
- **Independent C1 (CRITICAL):** revision_num disambiguation via DISTINCT ON subquery. Mirrors existing Tier 1a pattern.
- **Gemini HIGH + Obs L3-3 + DeepSeek HIGH:** confidence floor raised from 0.50 → **0.60** to exclude Tier 2b (0.50, name-only) and Tier 3 (caps at 0.50). Only Tier 1a (0.95) + 1b (0.85) + 2a (0.60) qualify for inheritance. Name-only matches on dense streets ("KING ST W") are too risky.
- **Gemini HIGH:** WHERE now includes both `p.latitude IS NOT NULL AND p.longitude IS NOT NULL` (atomic pair guard) — verified PASS by Independent re-check.
- **Gemini HIGH:** re-enrichment safety. Because the UPDATE is idempotent (IS DISTINCT FROM guard) and runs every chain, it WILL re-apply when permit's lat/long changes. No explicit `last_enriched_at` column needed.
- **Indep H3 (HIGH):** Wraps in its own `withTransaction` (single-pass, AFTER tier transactions complete). Documented explicitly; not "inside existing withTransaction" (link-coa.js has per-tier transactions, not one outer).
- **Obs L2-1 (CRITICAL → resolved as doc note):** lat/long overwrite happens AFTER classifiers (R5.3-R5.5) ran for this chain. Verified: R5.3/R5.4/R5.5 consume `lead_parcels.parcel_id` (spatial), NOT `coa_applications.latitude/longitude` directly. No re-trigger needed. Documented in spec amendment + locked by infra test.
- **Indep H1 (REJECT):** §R3.5 deferral note removed — `getDbTimestamp` at top of `withAdvisoryLock` callback IS Spec 47 §15 compliant. No spurious WF3 needed.

### DeepSeek CRITICAL — stale back-ref fix (existing link-coa.js bug)

The pre-pass cross-ward cleanup (link-coa.js lines ~90-110) UNLINKS CoAs from permits when ward conflicts but does NOT clear `permits.linked_coa_application_number` for the affected permits. R5.6 folds the fix:

```sql
-- Pre-pass extension: clear stale back-refs for permits whose CoA link was just removed
UPDATE permits p
   SET linked_coa_application_number = NULL,
       last_seen_at = $1::timestamptz
  FROM (SELECT permit_num FROM <cross-ward unlinked CoAs this pass>) cleared
 WHERE p.permit_num = cleared.permit_num
   AND p.linked_coa_application_number IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM coa_applications other
      WHERE other.linked_permit_num = p.permit_num
        AND other.application_number IS DISTINCT FROM <cleared CoA>
   );
```

### Audit metrics (extends existing link-coa.js `audit_table`)

**Plan-review fold-driven additions:**

- `coa_inherited_from_permit_count` (INFO) — total CoAs that received at least one upgraded column (lat OR long OR ward) — Obs L3-4 fold: count by DISTINCT CoA, not by SQL rowCount
- `coa_lat_lng_upgraded_from_permit_count` (INFO) — subset where lat/long specifically changed — separate query for accurate split
- `coa_ward_filled_from_permit_count` (INFO) — subset where ward changed NULL→non-NULL (was `coa_ward_upgraded`; renamed to reflect that ward only fills, never overwrites)
- `coa_ward_mismatch_with_permit_count` (INFO) — Obs L3-4 fold: data-quality signal — CoAs where both ca.ward and p.ward are non-null but differ; surfaces typos in either dataset
- `coa_below_confidence_floor_count` (INFO, NEW per Obs L1-1) — count of CoAs with `linked_permit_num IS NOT NULL` but `linked_confidence < coa_inherit_from_permit_min_confidence` — gate-misconfig detection
- `lead_identity_lat_lng_mismatch_count` (NEW per Obs L1-3, threshold `== 0` FAIL) — post-inheritance consistency check; non-zero indicates either inheritance bug or permit lat/long changed between runs without re-enrichment firing
- `stale_back_refs_cleared_count` (INFO) — DeepSeek CRITICAL fold — count of permits whose `linked_coa_application_number` was NULLed because their CoA was unlinked in this run's cross-ward cleanup
- `inherited_confidence_floor` (INFO) — the logic_var value used for the gate

### New logic_variable

`coa_inherit_from_permit_min_confidence` — default **0.60** (raised from initial 0.50 per Gemini + DeepSeek + Obs L3-3 fold). Covers Tier 1a (0.95) + 1b (0.85) + 2a (0.60). Excludes Tier 2b (0.50) + Tier 3 (≤0.50).

## Phase D close-out + Spec 42 lead-identity continuity section

Spec 42 amendments (broken into 4 distinct edits):

**Amendment 1 — §6.6.D writer attribution correction (Indep M1 fold)**

The current spec says `load-coa.js (geocode at ingest)` writes `latitude` and `longitude`. The actual implementation has NEVER been load-coa.js (CKAN's CoA dataset has no GEO_ID, verified live from API; load-coa can't twin the permit pipeline's geocode-by-FK pattern).

Fix the table row (full replacement text):

| `latitude` | DECIMAL(10,7) | **primary:** `link-coa-to-parcels.js` (parcel centroid via address-text match, R5.2). **secondary upgrade:** `link-coa.js` (inherits from linked permit when confidence ≥ `coa_inherit_from_permit_min_confidence`, R5.6 Part A) | YES |
| `longitude` | DECIMAL(10,7) | (same writers as above) | YES |
| `ward` | TEXT | **primary:** `load-coa.js` (CKAN WARD/WARD_NUMBER). **fallback fill-only:** `link-coa.js` (when CoA's ward is NULL, R5.6 Part A) | YES |

Plus a downstream-consumer note appended to §6.6.D: "Consumers reading `coa_applications.latitude/longitude` should note: for CoAs with `linked_permit_num IS NOT NULL AND linked_confidence ≥ 0.60`, value is permit-derived (~5-10m accuracy); for other CoAs with parcel match, value is parcel-centroid (~10-50m); for unmatched CoAs, value is NULL."

**Amendment 2 — §6.9 link-coa.js row extension**

Current spec describes link-coa.js as: writes `coa_applications.linked_permit_num` + `linked_confidence` + `permits.linked_coa_application_number` back-ref. R5.6 adds:
- Permit→CoA enrichment of `latitude`/`longitude`/`ward` (gated on confidence ≥ logic_var)
- Pre-pass stale back-ref cleanup (DeepSeek CRITICAL fix — clears `permits.linked_coa_application_number` when CoA gets unlinked due to ward conflict)
- 6 new audit_table rows (see Audit Metrics above)

**Amendment 3 — NEW subsection §6.X: "Lead-Identity Continuity for Permit-CoA Matched Records"**

> ### 6.X Lead-Identity Continuity for Permit-CoA Matched Records
>
> A real-world property can enter the pipeline via either side. Toronto's CKAN datasets treat both flows identically — there is no source field that distinguishes them — so the pipeline must reconcile them downstream.
>
> **Flow A — CoA-first** (most CoAs): applicant files variance hearing → if approved, *later* files building permit. The permit may not exist at the time of CoA ingest.
>
> **Flow B — Permit-first via Examiner's Notice**: applicant files building permit → examiner identifies need for variance → applicant files CoA in response to Examiner's Notice. The permit exists *before* the CoA at time of ingest.
>
> **Why this matters**: a user who already saw the lead via the permit feed may later see the linked CoA. Without continuity, both records hold independently-derived data (CoA gets parcel-centroid lat/long ≈ 10-50m; permit got `address_points` lat/long ≈ 5-10m), and the user sees the same physical property as two visually-different leads.
>
> **Resolution strategy** (implemented in R5.6 Part A):
>
> 1. **Linkage detection** — `link-coa.js` runs at end of CoA chain. Tier 1a (address + ward, conf 0.95), Tier 1b (address + permit-ward-NULL, conf 0.85), Tier 2a (name-only + ward, conf 0.60) reach the inheritance floor.
> 2. **Data inheritance** — when linkage confidence ≥ `coa_inherit_from_permit_min_confidence` (logic_variable, default 0.60), inherit `latitude`/`longitude`/`ward` from permit into CoA. Inheritance uses a DISTINCT ON subquery to disambiguate revision_num within a permit_num. Inheritance is one-directional (permit → CoA); CoA's classification fields (scope_tags, project_type, decision, hearing_date, applicant) are NEVER overwritten.
> 3. **Two-lead-id model is intentional** (Obs L2-4 fold) — `coa_applications.lead_id = 'coa:...'` and `permits.lead_id = 'permit:...'` remain distinct after matching. Cross-property queries use `coa.linked_permit_num` and `permits.linked_coa_application_number` for the join. This is by design per §6.6.B; UI display unification is Phase F work.
>
> **What this does NOT do** (deferred):
> - Unified `lead_id` across permit + CoA records — Phase F-level work.
> - Pre-emptive `permits.coa_anticipated` flag for Examiner's Notice permits — **deferred to Spec 48 implementation as a new final phase** (cross-pipeline observability tracking). The flag was originally scoped for R5.6 Part B but 4-reviewer plan-review identified design tensions (semantic conflict between flag name and behavior, redundancy with PRE-permit retirement in Phase G, no operational wiring) that warrant its own dedicated WF1.
> - Bidirectional propagation — changes to the permit's lat/long DO refresh the linked CoA's inherited fields on the next chain run (because the enrichment UPDATE is idempotent via IS DISTINCT FROM guard), but this requires the CoA chain to run after the permit chain. Cross-chain triggering is Phase H work.

**Amendment 4 — §6.11 Phase D close-out**

Append delivery note:

> **Phase D — DELIVERED 2026-05-14.** Commit chain:
> - `f5062f8` — R5.2 link-coa-to-parcels.js (CoA address-text → parcel centroid; bundled neighbourhood lookup + lat/lng back-fill)
> - `c74619b` + `61d80d1` — R5.3 classify-coa-scope.js (description-keyword classifier; observability fixes follow-up)
> - `d474208` — R5.4 classify-coa-trades.js (TAG_TRADE_MATRIX consumer + realtor gate)
> - `fdbb669` — R5.5 compute-coa-cost-estimates.js (geometric-only cost path)
> - `<R5.6 sha>` — R5.6 lead-identity continuity (Part A: link-coa.js permit→CoA enrichment) + Phase D close-out spec amendments
>
> §6.3 coverage gates measurable post-staging-run. Multi-agent reviewers (Gemini + DeepSeek + independent worktree + observability worktree using Spec 48 lens) ran at both plan and diff stages for every R5.x deliverable.
>
> **Deferred to follow-up WF**: `permits.coa_anticipated` flag — moved into Spec 48 implementation as a new final phase (cross-pipeline observability tracking). Tracked in `docs/reports/review_followups.md`.

## Standards Compliance

* **Try-Catch Boundary:** N/A — extension to existing script; SDK handles errors via withTransaction rollback.
* **Unhappy Path Tests:**
  - (1) CoA links to permit with confidence 0.10 (Tier 1c ward-conflict) → NOT inherited
  - (2) CoA links to permit with confidence 0.55 → NOT inherited (below 0.60 floor)
  - (3) CoA links to permit with confidence 0.60 (Tier 2a) → inherited
  - (4) CoA links to permit with NULL lat/long → no overwrite (guard)
  - (5) Permit has multiple revisions with different lat/long → DISTINCT ON picks most-recent
  - (6) Re-run idempotency: 0 records_updated on second pass (no source changes)
  - (7) Pre-pass cross-ward cleanup unlinks a CoA → permit's back-ref also cleared (DeepSeek fold)
  - (8) `lead_parcels.parcel_id` unchanged after enrichment (no side effect on R5.2 outputs) — Obs L2-1 + Indep H5 test
  - (9) Post-enrichment: `lead_identity_lat_lng_mismatch_count` == 0 for all linked CoAs

* **logError Mandate:** N/A — no new catch blocks.
* **UI Layout:** N/A (backend).

## Spec 47 §R1-R12 Compliance

* §R1 — link-coa.js already imports pipeline SDK ✓
* §R2 — `ADVISORY_LOCK_ID = 12` unchanged
* §R3.5 — `getDbTimestamp` at top of `withAdvisoryLock` callback IS compliant per Spec 47 §15 (Indep H1 REJECT — earlier deferral note removed)
* §R4 — Zod: NEW logic_var `coa_inherit_from_permit_min_confidence` added as explicit field to `LOGIC_VARS_SCHEMA` (NOT relying on `.passthrough()` per Indep M2 fold)
* §R6 — `pipeline.withAdvisoryLock(pool, ADVISORY_LOCK_ID, ...)` — unchanged
* §R7 — extend existing batched SELECT pattern
* §R9 — enrichment runs in its OWN `withTransaction` (post-tier; per Indep H3 fold — link-coa.js has per-tier transactions, not single outer)
* §R10 — extend existing `emitSummary` `audit_table.rows` with 8 new metrics (see Audit Metrics)
* §R11 — `emitMeta`: reads add `permits.latitude/longitude/ward/permit_num/revision_num/issued_date/application_date`; writes add `coa_applications.latitude/longitude/ward` + the existing `permits.linked_coa_application_number` already declared (Indep M4 + Obs L3-7 fold — explicit test assertion)
* §R12 — `lockResult.acquired` SKIP guard — unchanged

## Pre-Review Self-Checklist (15 items)

- (a) Confidence floor 0.60 covers only Tier 1a + 1b + 2a (excludes 2b name-only + 3 FTS)
- (b) DISTINCT ON subquery disambiguates revision_num within a permit_num (Indep C1 critical fold)
- (c) Atomic pair guard: `p.latitude IS NOT NULL AND p.longitude IS NOT NULL` (Gemini HIGH fold)
- (d) IS DISTINCT FROM guards on lat/long + ward — idempotent, no dead-tuple bloat
- (e) Ward COALESCE direction: CoA ward authoritative when non-null; permit ward used to fill NULL only (Indep M5 clarity fold)
- (f) Enrichment in its own `withTransaction` post-tier-writes (Indep H3 fold)
- (g) Pre-pass extension: stale `permits.linked_coa_application_number` cleared when CoA unlinked (DeepSeek CRITICAL fold)
- (h) 8 new audit_table rows including `coa_below_confidence_floor_count` (Obs L1-1) + `lead_identity_lat_lng_mismatch_count == 0 FAIL` (Obs L1-3) + `coa_ward_mismatch_with_permit_count` (Obs L3-4)
- (i) Audit row split between lat/long upgrade vs ward fill — separate queries for accurate counts (Obs L3-4 + DeepSeek LOW fold)
- (j) New Zod field `coa_inherit_from_permit_min_confidence` is explicit (NOT relying on passthrough) — Indep M2 fold
- (k) emitMeta extended for new column reads + writes — Indep M4 + Obs L3-7 fold
- (l) Test: `lead_parcels.parcel_id` unchanged after enrichment (no side effect on R5.2 outputs) — Indep H5 + Obs L2-1 fold
- (m) Test: re-run idempotency (0 records_updated on second pass with no source changes)
- (n) Test: DISTINCT ON correctness — multiple permit revisions with different lat/long
- (o) Spec amendments: §6.6.D writer correction + §6.9 row + new §6.X + §6.11 Phase D close-out all included

## Execution Plan (per WF1 in `.claude/workflows.md`)

- [ ] **Contract Definition:** N/A — extending existing script.
- [ ] **Spec & Registry Sync:** Apply Amendments 1-4 to `docs/specs/01-pipeline/42_chain_coa.md`. Run `npm run system-map`.
- [ ] **Schema Evolution:** N/A — no new tables or columns (Part B's migration is deferred).
- [ ] **Test Scaffolding:** Add `src/tests/link-coa-enrichment.infra.test.ts` (~15 assertions covering: SPEC LINK header, DISTINCT ON subquery presence, atomic lat/long pair guard, confidence floor 0.60 gate, IS DISTINCT FROM guards, ward COALESCE direction, 8 new audit rows, stale back-ref cleanup pre-pass, lead_parcels safety, Zod explicit field, emitMeta reads + writes).
- [ ] **Red Light:** New tests fail before implementation.
- [ ] **Implementation:**
  - Extend link-coa.js (~50 lines) — enrichment UPDATE in own withTransaction; stale back-ref cleanup in pre-pass; new Zod field; 8 new audit rows.
  - Update `scripts/seeds/logic_variables.json` — add `coa_inherit_from_permit_min_confidence` default 0.60.
  - Update `src/tests/control-panel.logic.test.ts` — new logic_var key in EXPECTED_LOGIC_VAR_KEYS.
- [ ] **Auth Boundary & Secrets:** N/A.
- [ ] **Pre-Review Self-Checklist (15 items above):** Walk each item against actual diff. PASS/FAIL per item.
- [ ] **Multi-Agent Review (4 reviewers parallel — diff stage):**
  - Gemini: `npm run review:gemini -- review scripts/link-coa.js --context docs/specs/01-pipeline/42_chain_coa.md`
  - DeepSeek: `npm run review:deepseek -- review scripts/link-coa.js --context scripts/link-coa-to-parcels.js`
  - Independent code-reviewer (worktree)
  - Observability worktree (Spec 48 lens)
- [ ] **Green Light:** `npm run test && npm run lint -- --fix` + `npm run typecheck`. Pre-commit footgun + typecheck + full test pass.
- [ ] **WF6 commit:** Single commit covering Part A + Phase D close-out spec amendments. Commit message: `feat(42_chain_coa): WF1 R5.6 — Lead-identity continuity (Part A: permit→CoA enrichment) + Phase D close-out`.
- [ ] **Followups append:** add `permits.coa_anticipated` flag (former Part B) to `docs/reports/review_followups.md` under a new section "Spec 48 Implementation — Cross-Pipeline Anticipation Tracking" with the 28-finding triage summary preserved for the future WF1.

## Plan-Review Triage Summary — APPLIED INLINE

| # | Sev | Source | Finding | Decision |
|---|---|---|---|---|
| 1 | CRIT | Indep C1 | UPDATE joins on `permit_num` only — nondeterministic across revisions | **FOLDED** — DISTINCT ON subquery |
| 2 | CRIT | Indep C2 + Gemini | `coa_anticipated` semantic conflict | **DEFERRED to Spec 48 final phase** |
| 3 | CRIT | Obs L2-1 | Part A overwrites lat/long after classifiers consumed parcel-centroid | **FOLDED** — verified classifiers don't consume coa.lat/long directly; documented + tested |
| 4 | CRIT | Obs L3-2 + Indep H2 | No IS DISTINCT FROM on `coa_anticipated` UPDATE | **N/A** — Part B deferred |
| 5 | CRIT | Obs L1-1 | No `coa_below_confidence_floor_count` audit metric | **FOLDED** — added to audit_table |
| 6 | CRIT | DeepSeek | Stale `permits.linked_coa_application_number` after CoA pre-pass cross-ward unlink | **FOLDED** — pre-pass extension |
| 7 | HIGH | DeepSeek + Obs L3-3 | Threshold 0.50 risky | **FOLDED** — raised to 0.60 |
| 8 | HIGH | Gemini | Re-enrichment cursor | **FOLDED** — IS DISTINCT FROM guard makes UPDATE idempotent; re-applies on chain re-run |
| 9 | HIGH | Gemini | Ward COALESCE redundant | **FOLDED** — clarity in plan + comment |
| 10 | HIGH | Indep H3 | `withTransaction` ambiguity | **FOLDED** — enrichment in own transaction |
| 11 | HIGH | Indep H4 | R0 audit ordering | **N/A** — R0 audit was Part B's; deferred |
| 12 | HIGH | Indep H5 | No lead_parcels safety test | **FOLDED** — explicit test assertion |
| 13 | HIGH | Obs L1-2 | `coa_anticipated_count` decay-detection | **N/A** — Part B deferred |
| 14 | HIGH | Obs L1-3 | No `lead_identity_lat_lng_mismatch_count` consistency check | **FOLDED** — added (`== 0 FAIL`) |
| 15 | HIGH | Obs L2-2 | `coa_anticipated` no operational effect | **N/A** — Part B deferred |
| 16 | HIGH | Obs L2-3 | `coa_anticipated` redundant with PRE-permit | **N/A** — Part B deferred |
| 17 | HIGH | Obs L3-4 | `coa_ward_upgraded` near-zero metric | **FOLDED** — renamed `coa_ward_filled_from_permit_count` + added `coa_ward_mismatch_with_permit_count` |
| 18 | MED | Obs L1-4 | Regex precision | **N/A** — Part B deferred |
| 19 | MED | Obs L1-5 + Indep H4 | R0 audit as hard gate | **N/A** — Part B deferred |
| 20 | MED | Obs L3-7 + Indep M4 | emitMeta declaration completeness | **FOLDED** — explicit test assertion |
| 21 | MED | Indep M1 | §6.6.D `Populated by this WF?` column | **FOLDED** — full table replacement text in Amendment 1 |
| 22 | MED | Indep M2 | Zod explicit field | **FOLDED** — explicit z.coerce.number() field |
| 23 | MED | Indep M3 | Migration 147 numbering | **N/A** — Part B's migration deferred |
| 24 | MED | Indep M5 | Ward COALESCE comment | **FOLDED** — checklist (e) + comment in SQL |
| 25 | REJECT | Indep H1 | §R3.5 false positive | **REJECTED** — pattern matches Spec 47 §15 "at top of withAdvisoryLock callback" |
| 26 | LOW | Obs L1, L2, L3 | Tier 3 ambiguity, early-exit emitMeta, Spec 76/91 grep | **FOLDED inline** (raised threshold to 0.60 resolves Tier 3; early-exit emitMeta updated; Spec 76/91 grep already verified by Independent reviewer) |
| 27 | PASS | Gemini (longitude guard) | Independent verified guard present | PASS |
| 28 | DEFERRED | Independent + Observability misc | Stale-detection mechanisms, dirty-mark verification, etc. | Captured in followups |

---

> **PLAN LOCKED — 4-reviewer plan-review complete; 14 folds applied to Part A; Part B deferred to Spec 48 final phase implementation.**
>
> Do you authorize this WF1 plan (Part A only + Phase D close-out)? (y/n)
> DO NOT generate code. DO NOT modify scripts. TERMINATE RESPONSE until authorization.

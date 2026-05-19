# Active Task: WF3 #lpad-revision-num-collision — system-wide LPAD policy collides with distinct revision_num='0' vs '00' permits

**Status:** COMPLETE 2026-05-14 — Green Light verified end-to-end. Mig 138_a + mig 138 both applied. cost_estimates.lead_id is NOT NULL with 245,785 rows + UNIQUE index. R8 code-review found 5 additional FIX-FIRST items (worktree LEFT JOIN, Gemini admin-filter on trade_forecasts/tracked_projects, DeepSeek post-conditions for downstream tables, cost_source='none' safety); all folded inline. Mig 139 fails on the EXPECTED separate composite-UNIQUE bug → next WF3 #mig-139-composite-unique.
**Workflow:** WF3 (Bug Fix)
**Domain Mode:** Backend/Pipeline (`scripts/`, `migrations/`, `src/lib/leads/`, `docs/specs/`) — read `scripts/CLAUDE.md` ✓ + `docs/specs/00_engineering_standards.md` §2/§3/§6/§7/§9 ✓ + `docs/specs/01-pipeline/47_pipeline_script_protocol.md` §R1–§R12 ✓ + Spec 42 §6.6.A.1 + Spec 84 §7 (TS↔JS dual-path) ✓.
**Rollback Anchor:** `47a7b10` (HEAD on main — WF3 lead_type-drift fix landed)
**Parent epic:** Unblocks Phase C migration chain (138-145), then R5.2 link-coa-to-parcels (queued at `.cursor/queued_task_cycle1_R5.2_link_coa_to_parcels.md`).
**Adversarial review:** USER-REQUESTED on this WF3 plan (exception to the default "WF3 no adversarial" rule in `feedback_review_protocol.md`).

---

## Context

### Bug
Phase C migration 138 (`promote_cost_estimates_lead_id_not_null`) aborts in its Stage-2 duplicate pre-check:

```
RAISE EXCEPTION 'Phase C migration 138 aborted: cost_estimates has 136
duplicate lead_id values — investigate before retrying'
```

The 136 duplicates are deterministic and reproducible: `migrate-to-lead-id.js` (Phase C R5.2) and the Phase B triggers on `permits` produce identical `lead_id` values for two genuinely distinct permit rows whenever a single permit_num has both a `revision_num='0'` row AND a `revision_num='00'` row, because the canonical Phase B derivation is:

```
lead_id := 'permit:' || permit_num || ':' || LPAD(revision_num, 2, '0')
```

`LPAD('0', 2, '0')` = `'00'`, and `LPAD('00', 2, '0')` = `'00'`. The two distinct permits collapse to the same lead_id.

### Reproduction
Discovered 2026-05-14 during the WF3 #migrate-to-lead-id-lead-type-drift Green Light run, after `scripts/migrate-to-lead-id.js` succeeded (901,209 rows backfilled in 25.3s) but `npm run migrate` aborted on the next migration.

```sql
-- Confirms the collision is by-design from the LPAD policy, not random data corruption:
SELECT lead_id, COUNT(*) FROM cost_estimates
WHERE lead_id IS NOT NULL GROUP BY lead_id HAVING COUNT(*) > 1;
-- → 136 rows, all dup_count = 2
```

### Root Cause Investigation (live DB queries, 2026-05-14)

| # | Finding | Evidence |
|---|---------|----------|
| 1 | `permits.revision_num` has TWO distinct value classes for the canonical "first revision": `'00'` (221,597 rows) and `'0'` (517 rows) | `SELECT revision_num, COUNT(*) FROM permits GROUP BY revision_num` |
| 2 | `cost_estimates.revision_num` mirrors `permits` exactly: `'00'` 221,597 + `'0'` 517 (1:1 join) | Identical distribution to permits |
| 3 | `trade_forecasts.revision_num` has NO `'0'` rows (only `'00'..'09'` two-char values) | Verified via the same GROUP BY |
| 4 | Of the 517 permits with `revision_num='0'`: **381 are solo** (no `'00'` counterpart for the same permit_num) and **136 are paired** (both `'0'` and `'00'` exist for the same permit_num — these are the 136 collisions) | Compound `EXISTS` query |
| 5 | The paired `'0'` rows are NOT duplicates of their `'00'` counterparts — they are semantically distinct **"DCs DeferredFees"** administrative sub-records: `permit_type='DCs DeferredFees'`, `status='Open'`, `issued_date IS NULL`, `work IS NULL`, with the corresponding `'00'` row being the main building permit (`permit_type='New Houses'` etc., `issued_date` populated) | `SELECT * FROM permits WHERE permit_num IN ('20 202524 BLD','21 137452 BLD','22 100294 BLD')` |
| 6 | The 381 solo `'0'` rows are also `permit_type='DCs DeferredFees'` (sampled — to be confirmed in R0 audit) | Sample confirms the pattern |
| 7 | **`permits.lead_id` is already populated** for all 247,030 rows by a Phase B trigger using the same LPAD logic — and ALREADY contains the collisions. `permit:20 202524 BLD:00` appears as lead_id on BOTH the `'0'` and `'00'` rows in `permits` itself | `SELECT lead_id, revision_num FROM permits WHERE permit_num='20 202524 BLD'` |
| 8 | LPAD policy is hardcoded in **5 places**: `scripts/lib/leads/lead-id.js` (deriveLeadId JS), `src/lib/leads/lead-id.ts` (TS twin), `migrations/143` (permit_trades→lead_trades mirror trigger), `migrations/144` (permit_parcels→lead_parcels mirror trigger), `scripts/migrate-to-lead-id.js` (inline SQL backfill). All produce the same `LPAD(revision_num, 2, '0')` derivation. | grep + file reads |
| 9 | Phase B trigger on `permits` (the one that populated all 247,030 lead_ids) is not in any of the 143/144 migration files we just read. It must have been installed in mig 132 (`extend_permits_lead_id`) — needs verification | Inferred |

**Conclusion:** The LPAD policy is intentional system-wide design (explicitly documented in `scripts/lib/leads/lead-id.js:14`: *"Permit: 'permit:' + permit_num + ':' + LPAD(revision_num, 2, '0')"*). But the policy **conflicts with the data**: `'0'` and `'00'` are genuinely distinct permits at the `(permit_num, revision_num)` PK level. The policy was authored assuming all revisions would normalize to a 2-char form. The 517 DC-fee records violate that assumption.

### Why this matters now
Migration 138's pre-check enforces `UNIQUE(lead_id)` on cost_estimates before promoting NOT NULL. The collision is a real correctness signal — promoting NOT NULL + UNIQUE on a column with deterministic collisions would corrupt the lead_id-keyed architecture downstream.

### Out-of-scope but adjacent
- **mig 139 separate bug**: trade_forecasts pre-check finds 91,724 duplicate lead_ids — but this is a **different bug**: mig 139 promotes plain `UNIQUE(lead_id)` instead of composite `UNIQUE(lead_id, trade_slug)` per Spec 42 §6.6.C intent (`PK becomes (lead_id, trade_slug) after backfill`). Will be a separate WF3 (`#mig-139-composite-unique`) after this one ships.

### Target Specs
- `docs/specs/01-pipeline/42_chain_coa.md` §6.6.A.1 — amend the canonical lead_id format documentation to handle the DC-fee discriminator (depending on fix option chosen)
- `docs/specs/01-pipeline/84_lifecycle_phase_engine.md` §7 — TS↔JS dual-path test invariant updated if lead_id format changes
- `tasks/lessons.md` — add a Pipeline lesson on data-vs-policy mismatch in canonicalization functions

### Key Files (depending on Fix Option chosen below)
- `scripts/lib/leads/lead-id.js` — `deriveLeadId` shared lib (LPAD on line 75)
- `src/lib/leads/lead-id.ts` — TS twin (must mirror byte-for-byte)
- `src/tests/lead-id-deriver.logic.test.ts` — TS↔JS parity test
- `scripts/migrate-to-lead-id.js` — inline SQL backfill (LPAD on lines 100/112/126)
- `migrations/143_mirror_permit_trades_to_lead_trades.sql` — trigger function (LPAD inside `mirror_permit_trades_to_lead_trades()`)
- `migrations/144_mirror_permit_parcels_to_lead_parcels.sql` — trigger function (LPAD inside `mirror_permit_parcels_to_lead_parcels()`)
- `migrations/132_extend_permits_lead_id.sql` — Phase B trigger on `permits` that populated `permits.lead_id` (needs verification)
- `migrations/NNN_<fix>.sql` — NEW migration covering the chosen fix (option-dependent)

---

## Fix Options (analysis pending R0 Audit + plan-review)

This WF3 includes a real **architectural decision**, not just a code patch. The right destination depends on whether `'0'` revision_num rows should be treated as:
- **(a) administrative non-lead records** that don't deserve a lead_id at all (filter them out everywhere); or
- **(b) distinct leads** that need distinct lead_ids (preserve raw rev_num, change the LPAD policy); or
- **(c) duplicates of the main permit** that should be deleted from `permits` (one-shot data cleanup).

Each carries different blast radius:

### Option A — Drop the LPAD truncation; preserve raw revision_num

**Mechanism:** Change canonical lead_id derivation from `permit:<num>:LPAD(rev,2,'0')` to `permit:<num>:<rev>`. The 517 `'0'`-revision rows produce `permit:<num>:0` (raw). The 246,513 normal rows with `'00'..'09'` are unchanged. Distinct rev_nums always produce distinct lead_ids.

**Touch points:**
- `scripts/lib/leads/lead-id.js` — remove LPAD logic from `deriveLeadId`
- `src/lib/leads/lead-id.ts` — mirror change
- `src/tests/lead-id-deriver.logic.test.ts` — update parity tests
- `migrations/146_fix_lpad_lead_id_derivation.sql` (NEW) — drop & recreate the two trigger functions (`mirror_permit_trades_to_lead_trades`, `mirror_permit_parcels_to_lead_parcels`) without LPAD; recompute `permits.lead_id` for the 517 rows with `revision_num='0'` (was `permit:X:00`, becomes `permit:X:0`); same for `cost_estimates`, `trade_forecasts`, `lead_analytics`, `lead_trades`, `lead_parcels`, `lifecycle_transitions`, `lifecycle_status_history`, `tracked_projects` (empty), `lead_views` (uses `lead_key` legacy format — check)
- `scripts/migrate-to-lead-id.js` — drop LPAD from inline SQL
- Probable consumer audits: any TS/JS code that constructed lead_ids inline without using `deriveLeadId` (grep for `LPAD\|':0`)
- Documentation: Spec 42 §6.6.A.1 + Spec 84 §7

**Pros:** Logically consistent (canonical form preserves source-of-truth fidelity); enables distinct lead_ids for DC-fee rows; clean policy.
**Cons:** Largest blast radius. Touches 5 code locations + 1 new migration with 8+ table updates. Existing lead_id values in any downstream cache, analytics export, BI tool, or external integration referencing the LPAD'd form break silently. ~517 lead_id values change.

### Option B — Treat DC-fee rows as non-leads; filter them out everywhere

**Mechanism:** Recognize that `permit_type='DCs DeferredFees'` rows are administrative sub-records, not real construction permits. Filter them out at every lead_id write site so they never get a lead_id. Then the LPAD policy collision disappears (no rows ever produce a colliding lead_id).

**Touch points:**
- Phase B trigger on permits (mig 132) — gate the lead_id write with `WHERE NEW.permit_type != 'DCs DeferredFees'`
- Backfill migration: `UPDATE permits SET lead_id = NULL WHERE permit_type = 'DCs DeferredFees'` (517 rows)
- Same NULL UPDATE on `cost_estimates`, `trade_forecasts`, `lead_analytics` for those permit_nums
- Mig 138/139/140/141 NOT NULL promotions must change: become **partial** NOT NULL on `WHERE permit_type != 'DCs DeferredFees'` OR mig 138 changes pre-check to ignore DC-fee permits
- `scripts/migrate-to-lead-id.js` — add `AND permit_type != 'DCs DeferredFees'` filter (read from a JOIN to permits)
- `deriveLeadId` — does not need a change; just don't call it for DC-fee rows
- Mirror triggers (143, 144) — same filter

**Pros:** Smaller code surface (mostly migration-level); preserves the LPAD invariant; semantically arguable (DC-fee records aren't really "leads"); no existing lead_id values change (517 become NULL).
**Cons:** Loses the ability to refer to DC-fee rows by lead_id (acceptable?); requires a NOT NULL → partial NOT NULL change in 4 migrations (138/139/140/141 — already scoped to mig 138 alone, but extending to others enlarges scope); business question: do we ever want DC-fee leads in CRM/analytics?

### Option C — Hybrid: one-shot dedupe of paired permits; keep policy intact

**Mechanism:** Treat the 136 paired permits as data anomalies: delete the `'0'` row when a `'00'` row exists for the same permit_num (cascade to cost_estimates, trade_forecasts, lead_trades, lead_parcels via existing FKs). Leave the 381 solo `'0'` rows alone — they don't collide. Then UPDATE the 381 solo `'0'` rows to `'00'` so they normalize cleanly.

**Touch points:**
- Migration: DELETE FROM permits WHERE revision_num='0' AND EXISTS (...'00' counterpart) → 136 rows + FK cascades
- Migration: UPDATE permits SET revision_num='00' WHERE revision_num='0' (the remaining 381 solo rows after delete)
- No code changes
- Mig 132 Phase B trigger — should add a CHECK constraint or VALIDATION to prevent future `'0'` writes (otherwise the next ingestion re-introduces the problem)

**Pros:** Single migration; minimal code change; LPAD invariant preserved.
**Cons:** **Loses 136 DC-fee permit records permanently** (irreversible without restoring from the snapshot). Business may need those records for fee-reconciliation history. The 381 solo `'0'` rows being "normalized" to `'00'` masks the DC-fee status (you can't tell from the data that they were DC-fee deferrals).

### Recommendation
**Option B** is the pragmatic fit: DC-fee rows are administrative records, not leads. The cost_estimates / trade_forecasts / opportunity_scores / CRM panels that consume `lead_id` don't need DC-fee records as separate entries — they're tracking the main permit's construction lifecycle, not the fee-deferral paperwork. Setting their lead_id to NULL excludes them from the lead pipeline while preserving the rows for any DC-fee-specific reporting. This is the smallest defensible change.

Final option choice deferred to PLAN LOCK time, ideally informed by reviewer findings.

---

## Standards Compliance (Option-B framing — adjust if user picks A or C)

* **Try-Catch Boundary (§2.2):** N/A — migration + trigger updates only.
* **Unhappy Path Tests (§2.1):** Tests for: (a) Phase B trigger on permits no longer writes lead_id when permit_type='DCs DeferredFees'; (b) re-running migrate-to-lead-id.js post-fix produces zero new writes; (c) mig 138 pre-check passes; (d) `permits.lead_id IS NULL` is consistent across permits + cost_estimates + trade_forecasts (no orphan non-NULL on consumer when permits.lead_id is NULL).
* **logError Mandate (§6.1):** N/A — no new catch blocks.
* **Pipeline Safety §9.1 Transaction Boundaries:** Backfill UPDATEs in the new migration wrapped in a single transaction.
* **§9.3 Idempotency:** Re-running the script post-fix must be safely no-op (lead_id IS NULL is the new state for DC-fee rows; subsequent runs match zero rows).
* **§7 Dual Code Path:** `deriveLeadId` JS/TS twins unchanged in Option B. In Option A both need parallel updates + parity test re-validation.
* **Spec 47 §R1–R12:** unchanged — script changes minimal under Option B.

---

## WF3 Execution Plan (verbatim from `.claude/workflows.md`)

- [ ] **Rollback Anchor:** `47a7b10` recorded above.
- [ ] **R0 Audit (deep — replaces standard State Verification given the architectural scope):**
  - Confirm Finding #6: are ALL 381 solo `'0'` permits `permit_type='DCs DeferredFees'`? Or only some? Determines whether Option B's filter is sufficient or needs another discriminator.
  - Confirm Finding #9: identify which migration installs the Phase B trigger on `permits` (likely mig 132); read its body; confirm LPAD logic.
  - Check for OTHER lead_id writers / readers not in the 5-file list: `git grep -l "lead_id" scripts/ src/lib/ src/app/api/` and `git grep -l "LPAD" .`.
  - Quantify downstream impact of changing 517 lead_id values: count rows in `lead_trades`, `lead_parcels`, `lifecycle_transitions`, `lifecycle_status_history`, `lead_analytics`, `lead_views` that hold one of those 517 `permit:X:00` values that would change under Option A (or become NULL under Option B).
  - Check: are there any external integrations (admin UI feed, mobile feed, exports) that serialize lead_id for end-user display? Grep `lead_id` across frontend.
  - Document results in the active task's R0 Audit Results section.
- [ ] **Spec Review:** Read Spec 42 §6.6.A.1 (canonical lead_id format), Spec 84 §7 (dual-path invariant), Spec 47 §R1–R12.
- [ ] **Reproduction:** Add failing test asserting cost_estimates has zero duplicate lead_ids post-backfill. The test should hit the live DB OR (better) construct a fixture with `'0'` + `'00'` permit pair and exercise `deriveLeadId` to confirm collision.
- [ ] **Red Light:** Run the new test — must fail on current state.
- [ ] **Fix:** Apply chosen option (A/B/C — pending PLAN LOCK decision):
  - Option B path: NEW `migrations/146_exclude_dc_fees_from_lead_id.sql` — set `permits.lead_id = NULL` + `cost_estimates.lead_id = NULL` for 517 DC-fee rows; add `WHERE permit_type != 'DCs DeferredFees'` filter to the Phase B trigger; change migrations 138/139/140/141 NOT NULL promotions to partial OR add a NULL pre-check exemption.
  - Apply the corresponding code changes to `scripts/migrate-to-lead-id.js` (add the filter).
  - Update specs.
- [ ] **Idempotency Check (Backend/Pipeline §9.3):** Re-runnable. Test by running script twice; second run produces zero new writes.
- [ ] **Pre-Review Self-Checklist:** 5 sibling-class checks:
  1. Are there OTHER permit_type values that should also be excluded from leads? (e.g. 'Test' permits, voided records)
  2. Does the Phase B trigger on `permits` correctly handle UPDATE/DELETE in addition to INSERT?
  3. Does the partial NOT NULL constraint break any existing query that assumes `cost_estimates.lead_id IS NOT NULL`?
  4. Are mobile / admin feed queries that filter by `lead_id` going to break on DC-fee NULL rows?
  5. Does `compute-cost-estimates.js` write to cost_estimates rows with NULL lead_id? If so, the lead_id-keyed rewrite must handle that.
- [ ] **Independent Review (default WF3):** Spawn feature-dev:code-reviewer with `isolation: "worktree"`. Provide: spec path + modified files list + one-sentence summary.
- [ ] **Adversarial Review (USER-REQUESTED override):** ONE parallel message:
  - `npm run review:gemini -- review scripts/migrate-to-lead-id.js --context docs/specs/01-pipeline/42_chain_coa.md`
  - `npm run review:deepseek -- review scripts/migrate-to-lead-id.js --context docs/specs/01-pipeline/42_chain_coa.md`
  - Triage: BUG → fix before Green Light. DEFER → `docs/reports/review_followups.md`.
- [ ] **Green Light:**
  1. `npm run test && npm run lint -- --fix && npm run typecheck`.
  2. End-to-end:
     - `node scripts/migrate-to-lead-id.js` — must succeed clean.
     - `npm run migrate` — runs migrations 138 → 145 to completion (note: mig 139 will still fail on the separate composite-UNIQUE bug — that's a follow-up WF3).
     - Verify `\d coa_applications` shows `parcel_linked_at` post-mig-145 (if mig 139 fix is in this WF3) OR confirm mig 138 specifically passes (if not).
- [ ] **WF6 Commit:** `fix(42_chain_coa): WF3 #lpad-revision-num-collision — <chosen-option-summary>`
  - Spec 05 §5 footer:
    - Spec: 42 + 84
    - Severity: HIGH (blocked Phase C migration chain mig 138)
    - Reviewers: code-reviewer worktree + Gemini + DeepSeek (adversarial user-requested)
    - Tests: lead-id-deriver.logic.test.ts + migration-138 + ...
    - Deferred: (any DEFER)
    - Lesson-routing: lessons.md + spec amendments

---

## Plan-Review (3-reviewer adversarial, USER-REQUESTED — completed 2026-05-14)

Three reviewers run in parallel; all converge on **Option B** with refinements.

### Spec 42 alignment confirmation (user-requested gate)

**This WF3 does not deviate from the Spec 42 implementation plan.** Spec 42 §6.6 picks "Option C — lead_id-keyed Unified Tables" as the architecture. The lead_id ecosystem is for *leads* (construction permits + CoA applications). DC-fee administrative records are already excluded from `permit_trades` by `classify-permits.js` (gates on `permit_type_class='construction'`), and they already produce `cost_source='none'` placeholder rows in `cost_estimates` per `compute-cost-estimates.js:77`. Filtering them out of lead_id at write time **completes an in-flight pattern** rather than introducing new architecture. Phase C remains the next milestone; Phases D-H are unaffected by this fix.

### Triage Table (14 findings)

| # | Sev | Conf | Source | Finding | Decision |
|---|---|---|---|---|---|
| 1 | **HIGH** | 95 | Worktree | `migrate-to-lead-id.js` has NO `permit_type_class` filter on the cost_estimates UPDATE (lines 96-102) — applies LPAD to administrative rows unconditionally, producing the 136 colliding lead_ids | **BUG → fold (Option B core)**: add JOIN to `permits` + `permit_type_classifications`; exclude `class='administrative'` rows from the backfill. |
| 2 | **HIGH** | 88 | Worktree | Mig 138 NOT NULL promotion line 49 must either delete admin rows from cost_estimates BEFORE promotion OR change to partial NOT NULL (which PG doesn't natively support — use partial UNIQUE instead). Setting lead_id NULL on admin rows AFTER NOT NULL promotion is impossible. | **BUG → fold**: New `migrations/146_exclude_administrative_cost_estimates.sql` runs BEFORE the existing mig 138; deletes ~517 admin rows from cost_estimates (they have `cost_source='none'` and zero signal per compute-cost-estimates.js:308). Then mig 138 runs as-is with no NULL or duplicate rows. |
| 3 | **HIGH** | 85 | Worktree | Phase B trigger on `permits` (likely in mig 132) also writes lead_id for admin rows — needs the same filter to prevent future ingestion from re-introducing collisions | **BUG → fold**: In mig 146, also amend the Phase B trigger function on `permits` to gate on `NEW.permit_type NOT IN (admin classes)` OR JOIN to `permit_type_classifications` at trigger time. Verify by reading mig 132 first. |
| 4 | **HIGH** | 82 | Worktree | Plan claims 4 migrations need change (138/139/140/141) — but mig 139 (trade_forecasts) likely doesn't have the LPAD collision because `classify-permits.js` gates on `class='construction'` upstream → admin permits produce zero `permit_trades` → zero `trade_forecasts`. Mig 139's 91K dup count is from the SEPARATE composite-UNIQUE bug. | **BUG → fold (scope reduction)**: This WF3 covers ONLY mig 138 + cost_estimates + Phase B trigger. Mig 139 composite-UNIQUE fix is the next WF3 (already documented as `#mig-139-composite-unique`). |
| 5 | MED  | 80 | Worktree | Preflight in `migrate-to-lead-id.js` should detect LPAD-collision pairs explicitly, not just over-width revs | **BUG → fold**: Add a preflight query that COUNTs `(permit_num, LPAD(revision_num,2,'0'))` HAVING COUNT > 1 across `permits`; if non-zero AND any of those collision pairs would land in non-administrative rows, throw. (After mig 146, admin rows are excluded so this would catch only future drift.) |
| 6 | **HIGH** | 88 | DeepSeek | Spec §6.6.A.1 documents "Over-width revisions pass through unmodified" but `deriveLeadId` actually TRUNCATES via `rev.slice(0, 2)` (lead-id.js:75). This contradicts the explicit spec contract. | **BUG → fold (spec-only)**: Amend Spec 42 §6.6.A.1 to reflect actual truncation semantics. The deriver is correct (matches Phase B trigger LPAD); the spec text is wrong. Single-line edit. |
| 7 | **CRIT** | 90 | Gemini | LPAD truncation is a "fundamental design flaw" in the lead_id format itself | **PARTIAL-RESOLVE**: Gemini's framing assumes any over-width or differently-padded rev produces collisions. Under Option B (admin rows excluded), the only remaining concern is **future** non-canonical writes (e.g. ingesting a permit with revision_num='100'). Mitigation: the existing preflight on `LENGTH(revision_num) > 2` catches over-wide values; the new collision preflight (#5) catches new `'0'`-shape drift. Documented invariant: pipeline ingestion must produce 2-char zero-padded revs. **Not a blocker; documented for follow-up Spec 42 §6.6.A hardening WF.** |
| 8 | HIGH | 78 | Gemini | The tracked_projects-empty preflight from the prior WF3 is "overly restrictive — remove it" | **REJECT**: That preflight was added by the prior WF3 (`#migrate-to-lead-id-lead-type-drift`, commit 47a7b10) as the Worktree C3 fix. It is intentional one-shot enforcement after the R5.3 trigger-based dual-write pivot. Removing it would reintroduce the corruption risk for future Phase D CoA rows. Action: append to `review_followups.md` with this rejection rationale so it isn't re-raised. |
| 9 | MED  | 75 | Gemini | tracked_projects post-backfill null-count check is asymmetric (should ALSO detect rows that SHOULD have been backfilled but weren't) | **DEFER**: Pre-existing observability gap, not introduced by this WF3. Append to `review_followups.md`. |
| 10 | LOW  | 60 | Gemini | LPAD takes implicit cast on `revision_num`; add `::text` for robustness | **DEFER**: Schema confirms `revision_num VARCHAR(10)`; implicit cast is safe. Style improvement. Append to `review_followups.md`. |
| 11 | NIT  | 50 | Gemini | Combine COUNT preflight queries into one round-trip | **DEFER**: Micro-optimization for a one-shot script. Append to `review_followups.md`. |
| 12 | MED  | 75 | DeepSeek | `deriveLeadId` doesn't trim whitespace on `permit_num`/`application_number` — silent corruption risk | **DEFER**: Pre-existing data-hygiene concern. No evidence of whitespace in production data. Append to `review_followups.md`. |
| 13 | MED  | 70 | DeepSeek | `typeof input === 'object'` allows arrays — defensive guard recommendation | **DEFER**: Style. Pre-existing. Append to `review_followups.md`. |
| 14 | NIT  | 50 | DeepSeek | JSDoc missing `@throws`; consider enriching error messages with the bad value | **DEFER**: Pre-existing docstring polish. Append to `review_followups.md`. |

### BUG-fix application summary (folded into Fix step below)

1. **Filter administrative rows in `migrate-to-lead-id.js`** — add JOIN + WHERE class filter to the cost_estimates UPDATE.
2. **New migration 146**: BEFORE mig 138 runs, DELETE administrative-class cost_estimates rows (~517) + amend Phase B trigger on `permits` to skip lead_id write for administrative permits + NULL out existing `permits.lead_id` on admin rows (~517).
3. **Add LPAD-collision preflight** to `migrate-to-lead-id.js` — detects future drift even after admin exclusion.
4. **Amend Spec 42 §6.6.A.1** truncation documentation to match `deriveLeadId` actual behavior.
5. **Scope reduction**: This WF3 covers only mig 138 chain. Mig 139 (composite-UNIQUE) becomes a separate WF3 `#mig-139-composite-unique`.

8 DEFER findings appended to `docs/reports/review_followups.md` under new heading `## migrate-to-lead-id.js + deriveLeadId — LPAD-collision WF3 follow-ups (2026-05-14)`.

---

## Fix Step (Option B locked — revised after plan-review)

1. **`migrations/146_exclude_administrative_from_lead_id.sql`** (NEW — runs before existing mig 138 because of filename ordering):
   ```sql
   -- UP
   BEGIN;
     -- Pre-check: confirm classification table is current
     DO $$ ... ASSERT classify_permits has run, permit_type_classifications has data ... $$;

     -- Delete administrative-class cost_estimates rows (no signal — cost_source='none')
     DELETE FROM cost_estimates ce
      WHERE EXISTS (
        SELECT 1 FROM permits p
          JOIN permit_type_classifications ptc ON ptc.permit_type = p.permit_type
         WHERE p.permit_num = ce.permit_num
           AND p.revision_num = ce.revision_num
           AND ptc.class = 'administrative'
      );
     -- ~517 rows deleted

     -- NULL out permits.lead_id on administrative rows (preserves the row,
     -- removes from lead ecosystem)
     UPDATE permits p
        SET lead_id = NULL
       FROM permit_type_classifications ptc
      WHERE ptc.permit_type = p.permit_type
        AND ptc.class = 'administrative';

     -- Amend Phase B trigger function on permits to skip lead_id write for admin
     -- (CREATE OR REPLACE FUNCTION ... — body depends on mig 132 inspection)

   COMMIT;
   -- DOWN: manual rollback only (per Rule 6 / commit 8b1c10b convention).
   ```
2. **`scripts/migrate-to-lead-id.js`** — UPDATE statement at lines 96-102 gains:
   ```sql
   UPDATE cost_estimates ce
      SET lead_id = 'permit:' || ce.permit_num || ':' || LPAD(ce.revision_num, 2, '0')
     WHERE ce.lead_id IS NULL
       AND ce.permit_num IS NOT NULL
       AND ce.revision_num IS NOT NULL
       AND NOT EXISTS (  -- NEW: exclude administrative permits
         SELECT 1 FROM permits p
           JOIN permit_type_classifications ptc ON ptc.permit_type = p.permit_type
          WHERE p.permit_num = ce.permit_num
            AND p.revision_num = ce.revision_num
            AND ptc.class = 'administrative'
       )
   ```
   Same NOT EXISTS filter applied to trade_forecasts UPDATE (defensive — should already be empty for admin permits per the classify-permits gate, but cheap insurance).
3. **Add LPAD-collision preflight** to `migrate-to-lead-id.js`:
   ```sql
   SELECT COUNT(*) AS collision_count
     FROM (
       SELECT permit_num, LPAD(revision_num, 2, '0') AS canonical_rev
         FROM permits p
         JOIN permit_type_classifications ptc ON ptc.permit_type = p.permit_type
        WHERE ptc.class != 'administrative'
        GROUP BY permit_num, LPAD(revision_num, 2, '0')
       HAVING COUNT(*) > 1
     ) c;
   ```
   Abort if non-zero (catches future drift in non-admin rows).
4. **`docs/specs/01-pipeline/42_chain_coa.md` §6.6.A.1** — fix the over-width-rev claim to match `deriveLeadId` actual truncation behavior.
5. **`src/tests/migrate-to-lead-id.infra.test.ts`** — add 2 assertions: (a) SQL contains NOT EXISTS administrative-class filter, (b) collision preflight present.
6. **`src/tests/lead-id-deriver.logic.test.ts`** — already exists; verify it covers the `'0'` vs `'00'` parity (since both produce `'00'` via LPAD, that IS the existing contract — Option B preserves it).
7. **`tasks/lessons.md`** — append under Pipeline:
   > "Lead-keyed canonicalization functions (`deriveLeadId` and friends) collide when source data has equivalent-but-distinct values (e.g. `revision_num='0'` and `'00'`). Mitigation: exclude administrative records via `permit_type_class` filter at write sites; gate ingestion to canonical form; LPAD-collision preflight in one-shot backfills."
8. **`docs/reports/review_followups.md`** — append 8 DEFER findings under new section.

---

## WF3 Execution Plan — UPDATED with Option B locked

- [ ] **Rollback Anchor:** `47a7b10` ✓
- [ ] **R0 Audit:**
  - Confirm all 517 `'0'`-rev permits classify as `class='administrative'` (mig 120 seed shows `'DCs DeferredFees' → 'administrative'`).
  - Read mig 132 to find the Phase B trigger body on `permits`; verify the trigger function name to update in mig 146.
  - Verify `compute-cost-estimates.js:308` writes `cost_source='none'` for admin permits → confirms deleting those cost_estimates rows is safe.
  - Verify `trade_forecasts` count for admin permits = 0 (`classify-permits.js` gate working).
- [ ] **Spec Review:** Read Spec 42 §6.6.A.1, §6.6.C, Spec 47 §R1-R12.
- [ ] **Reproduction:** Test asserts (a) script includes admin filter, (b) mig 146 deletes admin cost_estimates rows, (c) post-mig-146 the LPAD collision count = 0.
- [ ] **Red Light:** Run tests — must fail on current state.
- [ ] **Fix:** Apply edits from Fix Step above.
- [ ] **Idempotency Check (§9.3):** mig 146 is one-shot but safely re-runnable (DELETE...WHERE EXISTS is idempotent; UPDATE with permit_type_class filter is idempotent).
- [ ] **Pre-Review Self-Checklist:** 5 sibling-class checks:
  1. Any OTHER permit_type values in `permit_type_classifications` that should be excluded? (Currently only `administrative` class.)
  2. Does Phase B trigger handle UPDATE/DELETE in addition to INSERT for admin rows?
  3. Does the partial admin exclusion break any existing query that JOINs cost_estimates by lead_id?
  4. Mobile/admin feed queries — do they ever surface admin permits as leads? (Should not — filtered upstream.)
  5. Does mig 146's trigger amendment affect any test that depends on Phase B trigger writing lead_id for ALL permits?
- [ ] **Independent Review:** worktree feature-dev:code-reviewer (already done as part of plan review above — re-run on the actual diff after Fix step).
- [ ] **Adversarial Review (USER-REQUESTED):** Gemini + DeepSeek in parallel on the actual diff.
- [ ] **Green Light:**
  1. `npm run test && npm run lint -- --fix && npm run typecheck` clean.
  2. End-to-end: `node scripts/migrate-to-lead-id.js` succeeds. `npm run migrate` runs mig 146 → mig 138 → ... Stop at the expected mig 139 failure (separate WF3).
  3. Paste evidence.
- [ ] **WF6 Commit:** `fix(42_chain_coa): WF3 #lpad-revision-num-collision — exclude administrative permits from lead_id ecosystem (mig 146 + script + Phase B trigger gate)`

---

> **PLAN LOCKED — 3-reviewer adversarial plan review complete. Option B pinned.**
> Reviewers converged: Worktree NO-GO/FIX-FIRST → 5 fixes folded; Gemini CRIT/HIGH → resolved by Option B (admin exclusion); DeepSeek HIGH → spec amendment folded.
>
> 14 findings: 6 BUGs folded into plan, 8 DEFERs queued, 1 finding rejected (the tracked_projects preflight should stay).
>
> Files to be modified (after authorization):
> - NEW `migrations/146_exclude_administrative_from_lead_id.sql` (delete + trigger amendment)
> - `scripts/migrate-to-lead-id.js` (administrative filter + LPAD-collision preflight)
> - `docs/specs/01-pipeline/42_chain_coa.md` §6.6.A.1 (truncation semantics correction)
> - `src/tests/migrate-to-lead-id.infra.test.ts` (+2 assertions)
> - `tasks/lessons.md` (canonicalization-collision lesson)
> - `docs/reports/review_followups.md` (8 DEFER items + 1 rejected)
>
> Spec 42 alignment: **on plan**. Phase C unblocks → Phase D R5.2 link-coa-to-parcels (queued) → Phases E-H per spec.
>
> **Do you authorize this WF3 plan with Option B? (y/n)**
> DO NOT generate code. DO NOT run pipeline scripts. TERMINATE RESPONSE until authorization.

# Active Task: WF1 #coa-pipeline-parity-phase-d-R5.4 — classify-coa-trades.js (TAG_TRADE_MATRIX consumer producing lead_trades rows with realtor gate)

**Status:** Implementation (4-reviewer plan review complete; 10 R8 folds applied; user authorized 2026-05-14)
**Workflow:** WF1 (New Feature — NEW consumer script for the R5.1 substrate stub at `scripts/lib/coa-trade-classifier.js`; reads scope_tags populated by R5.3)
**Domain Mode:** Backend/Pipeline (`scripts/`, `src/lib/classification/`, `docs/specs/`)
**Rollback Anchor:** `61d80d1` (R5.3 + observability fixes shipped)
**Parent WF:** WF1 #coa-pipeline-parity-phase-d (R5.1 ✅ → R5.2 ✅ → R5.3 ✅ → **R5.4** → R5.5 compute-coa-cost-estimates → R5.6 manifest registration)
**Predecessor:** R5.3 (commit `c74619b` + `61d80d1`)
**Adversarial review:** USER-REQUESTED — 4 reviewers: independent worktree + Gemini + DeepSeek + an ADDITIONAL adversarial focused on observability + integration + logic.

---

## Context

* **Goal:** Add `scripts/classify-coa-trades.js` (advisory lock 4203). Reads each CoA's `scope_tags`, looks up trade matches via `scripts/lib/coa-trade-classifier.js`'s `lookupTradesForTags()`, and INSERTs `lead_trades` rows keyed on `lead_id` (one row per matched trade). Realtor trade conditionally appended for `coa_type_class='residential'` CoAs (per Spec 80 §5 + Spec 42 §6.5 step 25 gate).

* **R0 audit (live DB, 2026-05-14):**
  - 31,159 unprocessed CoAs (`scope_tags IS NOT NULL AND (trade_classified_at IS NULL OR trade_classified_at < scope_classified_at)`) — exact match to R5.3's scope_classified count.
  - `lead_trades` table: 0 rows (first run); composite UNIQUE (`lead_id`, `trade_id`) per mig 124.
  - `trades` table: 38 rows total; realtor = id 33; common construction trades indexed by slug.
  - R5.1 stub at `scripts/lib/coa-trade-classifier.js` is COMPLETE + spec-conformant (49-trade TAG_TRADE_MATRIX verbatim from `classify-permits.js:193`, `lookupTradesForTags`, `isTradeActiveInPhase` with null-phase pass-through guard, `shouldAppendRealtor` gated on `coa_type_class='residential'`).
  - **R5.1 stub gap:** no TS twin exists at `src/lib/classification/coa-trade-classifier.ts`. R5.4 must create the TS mirror per Spec 84 §7 dual-path.

* **Target Spec:** `docs/specs/01-pipeline/42_chain_coa.md` §6.5 step 25 (compute_trade_forecasts) + §6.8 row 667 (classify-coa-trades catalog) + §6.6.D (output columns).

* **Twin:** `scripts/classify-permits.js` (lock 88) — but this WF1 reuses the already-extracted matrix lib; the consumer script's read/write shape is different (CoA reads `coa_applications`, writes `lead_trades` keyed on `lead_id`; twin reads `permits`, writes `permit_trades`). R5.4 is closer to a NEW script using the lib than a twin extraction.

* **Standards referenced:** Spec 47 §R1-R12, Spec 00 §2/§3/§6/§9, Spec 80 §5 (realtor gate), Spec 84 §7 (TS↔JS dual-path).

---

## Technical Design

### Classifier outputs (Spec 42 §6.8 row 667)

Per CoA → 0..N `lead_trades` rows. Each row:
- `lead_id` = `ca.lead_id` (already `'coa:<application_number>'`)
- `trade_id` = looked up from `trades` table via slug (loaded once at script start; SLUG_TO_ID map)
- `tier` = 3 (description-keyword-based; same as twin's TAG matrix tier)
- `confidence` = from TAG_TRADE_MATRIX (per slug; range 0.55-0.85)
- `is_active` = `true`
- `phase` = NULL (Phase E lifecycle engine handles CoA phases separately; `determineCoaPhase()` returns null)
- `lead_score` = computed per CoA (re-uses `calculateLeadScore` from twin, or simple confidence×100 for v1)
- `classified_at` = `RUN_AT`

### Architecture decisions

- **Pure-function lib already exists** (`scripts/lib/coa-trade-classifier.js`). R5.4 just consumes it.
- **TS twin REQUIRED** per Spec 84 §7. Mirror at `src/lib/classification/coa-trade-classifier.ts` with parity test on a 25-row fixture matrix.
- **Streaming**: `for await` over `pipeline.streamQuery` on `coa_applications`.
- **Batched INSERT**: 8 columns × N rows. Per Spec 47 §R3: `BATCH_SIZE = Math.floor(65535 / 8) = 8191`. Cap at 1000 for memory consistency with R5.3.
- **Idempotency**: `ON CONFLICT (lead_id, trade_id) DO UPDATE SET ...` (preserves twin's pattern); `WHERE` clauses prevent dead-tuple bloat. Source-side cursor `(trade_classified_at IS NULL OR trade_classified_at < scope_classified_at)`.
- **Realtor inclusion**: `shouldAppendRealtor(coaRow)` returns true iff `coa_type_class === 'residential'`. Append the realtor TradeMatch (slug='realtor', trade_id=33) to the matches array post-classification.
- **`trade_classified_at` cursor advancement**: After processing all trades for a CoA, UPDATE `coa_applications.trade_classified_at = RUN_AT`. This is a SEPARATE write per CoA (or batched) — must advance unconditionally per WF3 #r5-3-observability-fixes BUG-5 lesson (no IS DISTINCT FROM filter on the timestamp).

### Audit metrics (Spec 42 §6.8 row 667)

Per the spec catalog: `coa_trades_per_lead`, `default_fallback_pct` (≤ 20%), `unmapped_coa_count` (== 0 FAIL), `realtor_inclusion_pct`. Plus standard observability.

**WF3 #r5-3-observability-fixes lesson-routing applied:**
- `records_updated` = sum of `result.rowCount` from each batched INSERT (NOT a JS-side counter)
- BATCH_SIZE = `Math.floor(65535 / COL_COUNT)` formula, not hardcoded magic number
- Audit row value/threshold units must match (e.g. percentage value with percentage threshold)
- NO IS DISTINCT FROM filter on `trade_classified_at` cursor advancement (avoids the infinite-re-processing bug from R5.3 v1)

### Database Impact: NO — all schema in place (lead_trades since mig 124; coa_applications.trade_classified_at since mig 145).

### Day-1 expectations

Based on R5.3 distribution (73% residential / 96.1% scope_classified) + twin's typical 5-8 trades per construction permit:
- ~32K CoAs × ~4 trades each (CoAs have fewer scope_tags than permits) = ~128K lead_trades rows
- Plus ~23K realtor rows (residential gate) = ~151K total lead_trades inserts
- Runtime estimate: 60-90s (twin's classify-permits processes 230K permits in ~3min)

---

## Standards Compliance

* **Spec 47 §R3 BATCH_SIZE:** `Math.min(1000, Math.floor(65535 / 8))` = 1000.
* **§R10 audit_table:** all metrics required by §6.8 row 667 present; `records_updated` = real rowCount sum per §8.1.
* **§R9 Atomicity:** all trades for a single CoA batched into one `withTransaction`; per-row SAVEPOINT NOT needed (no coupled state mutations like R5.2 had — lead_trades INSERT + coa_applications.trade_classified_at UPDATE are the only writes, and the latter is an UPDATE not an INSERT-then-UPDATE pair).
* **§7 Dual-path (Spec 84 §7):** JS lib (already exists) + NEW TS twin + parity test.
* **§9.3 Idempotency:** `ON CONFLICT DO UPDATE SET` on lead_trades; `trade_classified_at` advances unconditionally (no IS DISTINCT FROM trap).

---

## Key Files

- **NEW** `scripts/classify-coa-trades.js` (~250 lines)
- **NEW** `src/lib/classification/coa-trade-classifier.ts` (TS twin; ~210 lines)
- **NEW** `src/tests/coa-trade-classifier.logic.test.ts` (TAG_TRADE_MATRIX lookup + JS/TS parity, ~25 assertions)
- **NEW** `src/tests/classify-coa-trades.infra.test.ts` (Spec 47 §R1-R12 + R8 observability lessons regression-lock)
- **MODIFY** `scripts/manifest.json` — register `classify_coa_trades` after `classify_coa_scope` and before `link_coa`
- **MODIFY** `scripts/seeds/logic_variables.json` — +1 key: `coa_trades_default_fallback_threshold_pct` default 20
- **MODIFY** `src/components/FreshnessTimeline.tsx` — PIPELINE_REGISTRY + PIPELINE_CHAINS coa array
- **MODIFY** `src/lib/admin/funnel.ts` — STEP_DESCRIPTIONS
- **MODIFY** `src/tests/pipeline-advisory-lock.infra.test.ts` — lock 4203
- **MODIFY** `src/tests/chain.logic.test.ts` + `src/tests/quality.logic.test.ts` + `src/tests/assert-global-coverage.infra.test.ts` — chain length 14→15; registry 49→50; classify group 12→13
- **MODIFY** `src/tests/control-panel.logic.test.ts` — LOGIC_VAR_DEFAULTS +1 key

---

## WF1 Execution Plan

- [ ] **Contract Definition:** TS interface `ClassifyCoaTradesInput / Output` in `src/lib/classification/coa-trade-classifier.ts` BEFORE implementation.
- [ ] **Spec & Registry Sync:** Spec 42 §6.5 step 25 + §6.8 row 667 + §6.6.D already cover the design. `npm run system-map` after implementation.
- [ ] **Schema Evolution:** N/A — lead_trades + trade_classified_at exist.
- [ ] **Test Scaffolding:** logic test (TAG_TRADE_MATRIX coverage + JS/TS parity) + infra test (Spec 47 §R1-R12 + WF3 lessons regression-lock).
- [ ] **Red Light:** `npx vitest run src/tests/coa-trade-classifier.logic.test.ts src/tests/classify-coa-trades.infra.test.ts` — all must fail.
- [ ] **Implementation:**
  1. `src/lib/classification/coa-trade-classifier.ts` — TS twin of the existing JS lib (byte-for-byte parity).
  2. `scripts/classify-coa-trades.js` — Spec 47 §R1-R12 skeleton + streamQuery + batched INSERT + realtor gate.
  3. `scripts/manifest.json` — register step.
  4. `scripts/seeds/logic_variables.json` — add `coa_trades_default_fallback_threshold_pct`.
  5. Collateral test/component updates (5 files).
- [ ] **Auth Boundary & Secrets:** N/A.
- [ ] **Pre-Review Self-Checklist:** 12 items derived per WF1 protocol from Spec 42 §6.5/§6.8 + Spec 47 §R1-R12 + Spec 84 §7 + WF3 #r5-3-observability-fixes lessons:
  - **(a) §6.8 lock 4203:** ADVISORY_LOCK_ID = 4203?
  - **(b) §6.8 idempotency cursor:** `trade_classified_at IS NULL OR trade_classified_at < scope_classified_at`?
  - **(c) §6.8 audit metrics:** all 4 required metrics present (`coa_trades_per_lead`, `default_fallback_pct`, `unmapped_coa_count`, `realtor_inclusion_pct`)?
  - **(d) Spec 80 §5 realtor gate:** `shouldAppendRealtor()` consulted; only `coa_type_class='residential'` gets realtor appended?
  - **(e) §6.8 ON CONFLICT semantic:** `ON CONFLICT (lead_id, trade_id) DO UPDATE SET ...` matches twin permit_trades pattern?
  - **(f) Spec 47 §R3 BATCH_SIZE:** computed via `Math.floor(65535 / N)`?
  - **(g) Spec 47 §R7 streamQuery:** used for source SELECT?
  - **(h) Spec 47 §R9 atomicity:** withTransaction wraps batched INSERT + UPDATE?
  - **(i) Spec 47 §R10 + §8.1 records_updated:** sums `result.rowCount`, not JS counts (WF3 BUG-1 lesson)?
  - **(j) WF3 BUG-5 lesson:** `trade_classified_at` cursor advances unconditionally (no IS DISTINCT FROM trap)?
  - **(k) Spec 84 §7 dual-path:** JS↔TS parity test passes?
  - **(l) Cross-script dependency:** R5.3's scope_classified_at must be set on input rows; verify SELECT JOINs / filters require non-null scope_tags?

- [ ] **Multi-Agent Review (4 reviewers parallel — USER-REQUESTED + ADDITIONAL):**
  1. **Independent code-reviewer (worktree #1):** general checklist from Spec 42 + Spec 47.
  2. **Adversarial Gemini:** spec-vs-code gaps, missing edge cases, silent swallowed errors.
  3. **Adversarial DeepSeek:** logic errors, wrong assumptions, downstream consumers.
  4. **Additional adversarial (worktree #2):** SPECIFICALLY focused on observability (audit_table completeness, structured logging coverage, metric accuracy per WF3 lessons) + integration (downstream consumers of lead_trades: compute-trade-forecasts, compute-opportunity-scores, mobile feed; manifest position validation; chain run sequencing) + logic (TAG_TRADE_MATRIX coverage on R5.3's actual scope_tag distribution; confidence floor / fallback semantics; realtor gate correctness against Spec 80 §5).

- [ ] **Green Light:** `npm run test && npm run lint -- --fix && npm run typecheck`. Live run against dev DB (~31K CoAs, expected ~150K lead_trades inserts).
- [ ] **WF6 Commit:** `feat(42_chain_coa): WF1 #coa-pipeline-parity-phase-d-R5.4 — classify-coa-trades.js (TAG_TRADE_MATRIX consumer + realtor gate + JS/TS dual-path)`

---

## Plan-Review (4-reviewer plan review — USER-REQUESTED + ADDITIONAL — completed 2026-05-14)

### Triage Table (24 findings)

| # | Sev | Conf | Source | Finding | Decision |
|---|---|---|---|---|---|
| 1 | **CRIT** | 91 | Worktree#2 + DeepSeek | `unmapped_coa_count == 0 FAIL` threshold is impractical — many R5.3 tags (dwelling, severance, setback, change-of-use, minor-variance, residential meta-tags) have no TAG_TRADE_MATRIX entries. Permanent FAIL on first run. | **BUG → fold**: relax to `≤ coa_trades_unmapped_threshold_pct%` (logic_var, default 20%). Variance-only CoAs producing zero trades is correct behavior; threshold must accommodate. |
| 2 | **CRIT** | 90 | Worktree#2 | `lead_score` formula ambiguous in plan. Schema default 0 would silently break mobile lead-ranking. | **BUG → fold (committed)**: `lead_score = Math.round(confidence * 100)` for v1. Documented as TAG_TRADE_MATRIX-derived (structural, not operator-tunable). Future Phase F can adopt full `calculateCoaLeadScore` once CoA decision/hearing_date signals are wired. |
| 3 | **CRIT** | 95 | DeepSeek | Realtor availability startup guard missing — twin uses `checkRealtorAvailable(pool)` to handle case where mig 118 didn't apply | **BUG → fold**: add `realtorAvailable` boolean from `SELECT 1 FROM trades WHERE id = 33 AND slug = 'realtor'` at script start. Skip realtor append if false. |
| 4 | **HIGH** | 87 | Worktree#2 | Many R5.3-emitted tags miss TAG_TRADE_MATRIX coverage: `dwelling`, `new-construction`, `renovation`, `severance`, `change-of-use`, `setback`, `parking`, `lot-coverage`, `minor-variance`, `mixed-use`, `residential`, `commercial`, `institutional` | **BUG → fold (partial)**: add TAG_ALIASES `dwelling → build-sfd`, `renovation → interior` (the high-frequency construction-intent tags). Variance-only tags (`severance`, `setback`, `parking`, etc.) correctly produce zero trades; intentional — covered by threshold relaxation (#1). Meta-tags (`residential`, `commercial`, `institutional`) are downstream signals (class gate), not matrix inputs. |
| 5 | **HIGH** | 95 | DeepSeek | `classified_at` missing from `ON CONFLICT UPDATE SET` — re-runs won't refresh timestamp | **BUG → fold**: include `classified_at = EXCLUDED.classified_at` in the DO UPDATE SET clause (matches twin permit_trades pattern at line 543). |
| 6 | **HIGH** | 100 | Gemini CRIT | `normalizeTag` case-sensitive — `'Roofing'` / `'KITCHEN'` won't match | **BUG → fold (defensive)**: `let base = tag.toLowerCase().replace(...)`. Apply to JS lib + TS twin. R5.3's `tagSet.add(tag)` happens to emit lowercase today, but defensive fix prevents future regression. |
| 7 | **HIGH** | 95 | Gemini HIGH | `lookupTradesForTags` non-string element crashes script | **BUG → fold (defensive)**: `if (typeof tag !== 'string' || tag === '') continue;` guard. JS + TS. |
| 8 | **HIGH** | 90 | DeepSeek | Per-CoA `trade_classified_at` UPDATE risks N+1 — must be batched via UNNEST | **BUG → fold (implementation note)**: single batched UPDATE per flush via `UPDATE coa_applications SET trade_classified_at = $RUN_AT WHERE id = ANY($ids::bigint[])`. |
| 9 | MED | 92 | Worktree#2 | No `slug_resolution_miss_count` audit metric — catches matrix↔trades drift | **BUG → fold**: add metric. Increments when `SLUG_TO_ID.get(slug)` returns undefined. Threshold == 0 FAIL (real schema-drift catch). |
| 10 | MED | 88 | Worktree#2 | `records_new` vs `records_updated` ambiguous for ON CONFLICT UPSERT — both INSERT and UPDATE counted as rowCount | **BUG → fold**: use `RETURNING (xmax = 0) AS is_insert` to distinguish. `records_new` = COUNT(is_insert), `records_updated` = COUNT(NOT is_insert). |
| 11 | MED | 95 | Worktree#2 + Worktree#1 | compute-trade-forecasts.js reads permit_trades, not lead_trades. CoA rows in lead_trades won't surface in forecasts until Phase H. | **DOCUMENT → fold (gap acknowledgment)**: explicit plan note: "lead_trades CoA rows are written correctly; trade_forecasts CoA coverage = 0% until Phase H rekey." Operator-facing expectation. |
| 12 | MED | 80 | Worktree#1 | 3 self-checklist items missing: (m) manifest position validation, (n) RUN_AT before lock, (o) Zod covers new logic_var key | **fold**: add items (m), (n), (o), (p) to Pre-Review Self-Checklist. |
| 13 | MED | 88 | DeepSeek + Worktree#1 | `lead_score` was hedge in plan; commits at code-write time | **RESOLVED by #2** above. |
| 14 | MED | 88 | DeepSeek | realtor gate is 1-axis (`coa_type_class === 'residential'`); twin permits-side is 3-axis | **DEFER with note**: CoA has no `permit_type` analogue. 2-axis (`class + scope_tags`) is the most we can do. R5.1 stub's 1-axis is the pragmatic minimum; Spec 80 §5 CoA-side guidance is sparse. File follow-up if first-run reveals over-inclusion. |
| 15 | LOW | 65 | DeepSeek | streamQuery vs keyset pagination | **DEFER**: Worktree#2 confirms streamQuery is fine for 32K rows. Twin's keyset is for 230K permits where cursor overhead matters. |
| 16 | LOW | 60 | DeepSeek | "byte-for-byte parity" wording is unachievable | **fold (cosmetic)**: rephrase to "functional parity". |
| 17 | LOW | 80 | DeepSeek | `realtor_inclusion_pct` guard when residential_count=0 | **fold**: emit N/A status when residential_count=0 to avoid false WARN. |
| 18 | LOW | 60 | Gemini MED | houseplex regex brittle on plural forms | **DEFER**: `houseplex` is not in R5.3's current tag output; not actionable now. |
| 19 | LOW | 50 | Gemini LOW | Code duplication between classify-permits.js TAG_TRADE_MATRIX and the new lib | **DEFER**: architectural refactor, separate WF2. R5.1 stub deliberately twin-extracted; reconciliation is future work. |
| 20 | LOW | 50 | Gemini LOW | TAG_TRADE_MATRIX hardcoded; should be in JSON/YAML config | **DEFER**: architectural. |
| 21 | NIT | 50 | DeepSeek | Idempotency "WHERE clauses prevent dead-tuple bloat" phrasing ambiguous | **fold (clarity)**: rewrite paragraph. |
| 22 | NIT | 60 | DeepSeek | BATCH_SIZE chosen for memory not param limit — clarify | **fold (clarity)**: add comment per WF3 #r5-3-observability-fixes pattern. |
| 23 | NIT | 55 | Worktree#2 | `progress()` omission acceptable for this volume | **PASS** — bounded-time script. |
| 24 | PASS | 90 | Worktree#2 | Unique constraint partitioning by lead_id prefix correct (no permit↔CoA collision possible) | **PASS** — keep design as planned. |

### BUG-fix application summary (10 BUGs folded inline below)

1. **Threshold relaxation** (#1): replace `== 0 FAIL` with `≤ coa_trades_unmapped_threshold_pct% WARN`. New logic_var seed.
2. **lead_score commit** (#2): formula = `Math.round(confidence * 100)` in v1; documented inline.
3. **Realtor availability guard** (#3): `checkRealtorAvailable(pool)` at startup, propagated to insert loop.
4. **TAG_ALIASES expansion** (#4): `dwelling → build-sfd`, `renovation → interior`. JS + TS twin.
5. **ON CONFLICT classified_at** (#5): `classified_at = EXCLUDED.classified_at` added to SET clause.
6. **normalizeTag toLowerCase** (#6): defensive case-insensitivity. JS + TS twin.
7. **Non-string element guard** (#7): `typeof tag !== 'string'` skip. JS + TS twin.
8. **Batched UPDATE** (#8): single `WHERE id = ANY($ids::bigint[])` UPDATE per flush, not per-CoA.
9. **slug_resolution_miss_count** (#9): new audit metric with `== 0 FAIL` threshold.
10. **xmax distinguishability** (#10): `RETURNING (xmax = 0) AS is_insert` for accurate records_new vs records_updated split.

Plus 4 plan refinements: Phase H gap documented (#11), 4 new self-checklist items (m–p) (#12), realtor_inclusion_pct N/A guard (#17), wording cleanups (#16, #21, #22).

11 DEFER findings appended to `docs/reports/review_followups.md` under `## R5.4 classify-coa-trades — plan-review deferrals (2026-05-14)`.

---

## Revised Technical Design (post-R8 plan-review)

### Classifier outputs (per CoA → 0..N lead_trades rows)

Each row:
- `lead_id` = `ca.lead_id`
- `trade_id` = looked up from `SLUG_TO_ID` map (loaded at script start from `trades` table); on miss → increment `slug_resolution_miss_count` + skip
- `tier` = 3 (TAG_TRADE_MATRIX-derived; same tier as twin)
- `confidence` = from TAG_TRADE_MATRIX (range 0.55-0.85)
- `is_active` = true
- `phase` = NULL (CoA-side; Phase E lifecycle engine handles separately)
- `lead_score` = `Math.round(confidence * 100)` — v1 formula committed per R8 fold #2
- `classified_at` = `RUN_AT`

### Audit metrics (REVISED post-fold)

- `coa_processed` — INFO
- `coa_with_trades` — INFO (count of CoAs that produced ≥1 lead_trades row)
- `coa_zero_trades` — INFO (count of CoAs with non-NULL scope_tags but zero matrix hits)
- `unmapped_scope_pct` — value=pct, threshold=`≤ coa_trades_unmapped_threshold_pct%` WARN (per #1)
- `realtor_inclusion_pct` — value=pct of residentials with realtor appended (N/A when no residentials)
- `slug_resolution_miss_count` — value=count, threshold=`== 0` FAIL (catches matrix↔trades drift; #9)
- `total_lead_trades_written` — INFO (from `result.rowCount` sum)
- `records_new_via_xmax` — count of true INSERTs (from `(xmax = 0)`; #10)
- `records_updated_via_xmax` — count of ON CONFLICT updates (from `(xmax != 0)`; #10)
- `trade_slug_distribution` — INFO records_meta blob (top-N trade slug counts)
- `coa_trades_per_lead` — INFO records_meta blob (histogram)
- Standard sys_velocity / sys_duration_ms

### SQL shape (REVISED)

```sql
-- Source SELECT (streamQuery)
SELECT id, lead_id, scope_tags, coa_type_class
  FROM coa_applications
 WHERE scope_tags IS NOT NULL
   AND (trade_classified_at IS NULL OR trade_classified_at < scope_classified_at)
 ORDER BY id ASC;

-- Per-batch INSERT (UNNEST)
INSERT INTO lead_trades (lead_id, trade_id, tier, confidence, is_active, phase, lead_score, classified_at)
VALUES <unrolled $N batch>
ON CONFLICT (lead_id, trade_id) DO UPDATE SET
  tier          = EXCLUDED.tier,
  confidence    = EXCLUDED.confidence,
  is_active     = EXCLUDED.is_active,
  phase         = EXCLUDED.phase,
  lead_score    = EXCLUDED.lead_score,
  classified_at = EXCLUDED.classified_at  -- R8 fold #5
RETURNING (xmax = 0) AS is_insert;   -- R8 fold #10

-- Per-batch coa_applications trade_classified_at UPDATE (batched, R8 fold #8)
UPDATE coa_applications
   SET trade_classified_at = $RUN_AT::timestamptz
 WHERE id = ANY($ids::bigint[]);
```

### Pre-Review Self-Checklist (REVISED with items m–p)

- (a) §6.8 lock 4203
- (b) §6.8 idempotency cursor `trade_classified_at IS NULL OR trade_classified_at < scope_classified_at`
- (c) §6.8 audit metrics all present (including revised threshold per #1 and new slug_resolution_miss_count per #9)
- (d) Realtor gate `coa_type_class='residential'` (1-axis CoA-side; #14 defer)
- (e) ON CONFLICT (lead_id, trade_id) DO UPDATE SET includes `classified_at` per R8 fold #5
- (f) Spec 47 §R3 BATCH_SIZE formula
- (g) Spec 47 §R7 streamQuery
- (h) Spec 47 §R9 withTransaction wraps INSERT + trade_classified_at UPDATE
- (i) Spec 47 §R10 + §8.1 `records_new`/`records_updated` from `RETURNING (xmax = 0)` per R8 fold #10
- (j) WF3 BUG-5 lesson: trade_classified_at advances unconditionally (no IS DISTINCT FROM trap)
- (k) Spec 84 §7 dual-path: JS↔TS functional parity (not byte-for-byte per #16)
- (l) Cross-script dependency: SELECT requires `scope_tags IS NOT NULL`
- **(m) [NEW]** Full CoA chain order in manifest matches Spec 42 §6.11 Phase D sequence after `classify_coa_trades` insertion
- **(n) [NEW]** RUN_AT captured BEFORE `withAdvisoryLock` per Spec 47 §R3.5
- **(o) [NEW]** Zod ConfigSchema covers `coa_trades_unmapped_threshold_pct`; audit row references config, not literal
- **(p) [NEW]** lead_score = `Math.round(confidence * 100)` is in the actual SQL/JS, not the schema default 0

### Phase H integration gap (R8 fold #11 — explicit operator-facing note)

R5.4 writes CoA rows to `lead_trades`. `compute-trade-forecasts.js`, `compute-opportunity-scores.js`, `update-tracked-projects.js` currently read `permit_trades`, NOT `lead_trades`. The Phase H rekey (Spec 42 §6.11 Phase H) is when those scripts will switch to `lead_trades` UNION source. **Until Phase H ships:** CoA trade rows exist in `lead_trades` but produce zero `trade_forecasts` / `opportunity_scores` for CoA leads. Mobile feed will surface CoAs without forecasts. Operator-facing expectation documented here; not a bug — by design per Phase H deferral plan.

---

> **PLAN LOCKED — 4-reviewer plan review complete; 10 BUGs folded, 11 DEFERs queued, design committed.**
>
> Spec 42 alignment: **on plan** with one accepted spec correction (#1 `unmapped_coa_count == 0 FAIL` → `≤ %`; spec-text update deferred to a follow-up §6.8 amendment, but the design conforms to intent).
>
> Files to modify (after authorization):
> - NEW `scripts/classify-coa-trades.js` (~280 lines after fold)
> - MODIFY `scripts/lib/coa-trade-classifier.js` (4 fold-driven fixes: toLowerCase, type guard, TAG_ALIASES, ALIAS comment)
> - NEW `src/lib/classification/coa-trade-classifier.ts` (TS twin with same fixes)
> - NEW `src/tests/coa-trade-classifier.logic.test.ts` (lookup + parity + new dwelling/renovation alias coverage)
> - NEW `src/tests/classify-coa-trades.infra.test.ts` (Spec 47 §R1-R12 + R8 lessons + xmax + classified_at)
> - MODIFY 6 collateral files (manifest, seeds, FreshnessTimeline, funnel, 4 test files)
>
> **Do you authorize this WF1 plan with all 10 R8 folds? (y/n)**
> DO NOT generate code. DO NOT run pipeline scripts. TERMINATE RESPONSE until authorization.
>
> Spec 42 alignment: **on plan**. R5.4 implements §6.5 step 25 + §6.8 row 667. Phase D Wave 6 — unblocks R5.5 (compute-coa-cost-estimates reads lead_trades).
>
> Estimated scope:
> - 1 NEW pipeline script (~250 lines)
> - 1 NEW TS twin (~210 lines, mirrors existing R5.1 JS substrate)
> - 2 NEW test files (~50 assertions)
> - 9 collateral updates
> - 0 migrations
>
> DO NOT generate code. DO NOT run pipeline scripts. TERMINATE RESPONSE until 4-reviewer plan review complete + authorization.

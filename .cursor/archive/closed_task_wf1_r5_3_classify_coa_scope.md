# Active Task: WF1 #coa-pipeline-parity-phase-d-R5.3 — classify-coa-scope.js (description-keyword classifier producing coa_type_class + project_type + scope_tags)

**Status:** COMPLETE 2026-05-14 — Green Light verified end-to-end. 32,419 CoAs processed in 3.2s (10,024 rows/s). Audit verdict PASS: 96.1% scope_classified, 1,260 unmapped (3.9%, under 10% threshold). 14 files modified; 49 R5.3 tests + full 5,609 suite pass.
**Workflow:** WF1 (New Feature — NEW pipeline script implementing a CoA-specific scope classifier; not extracted from a twin because the permit-side `classify-scope.js` reads fields CoA doesn't have)
**Domain Mode:** Backend/Pipeline (`scripts/`, `scripts/seeds/`, `docs/specs/`) — read `scripts/CLAUDE.md` ✓ + `docs/specs/00_engineering_standards.md` §2/§3/§6/§9 ✓ + `docs/specs/01-pipeline/47_pipeline_script_protocol.md` §R1–R12 ✓ + `docs/specs/01-pipeline/42_chain_coa.md` §6.5 step 5 + §6.6.D + §6.8 ✓.
**Rollback Anchor:** `f5062f8` (current HEAD on main — R5.2 link-coa-to-parcels shipped)
**Parent WF:** WF1 #coa-pipeline-parity-phase-d (R5.1 ✅ → R5.2 ✅ → **R5.3** → R5.4 classify-coa-trades → R5.5 compute-coa-cost-estimates → R5.6 manifest registration)
**Predecessor:** WF2 #coa-pipeline-parity-phase-d-R5.2 (commit `f5062f8`, 2026-05-14)
**Adversarial review:** USER-REQUESTED on this WF1 plan (matches the cadence established by prior 3 WF3s + R5.2).

---

## Context

* **Goal:** Add a new pipeline script `scripts/classify-coa-scope.js` (advisory lock 4202) that runs a description-keyword classifier across all unprocessed CoAs and writes five derived columns: `coa_type_class`, `project_type`, `scope_tags`, `scope_classified_at`, `scope_source='description'`.

* **Why a new script** (not extracted from twin): The permit-side `classify-scope.js` (lock 87, 690 lines) reads `permit_type`, `structure_type`, `work`, `current_use`, `proposed_use`, `storeys`, `housing_units` — most of which CoA doesn't have. CoA classification operates on ONE field: `coa_applications.description`. Spec 42 §6.5 step 5 explicitly mandates a new script.

* **Why now:** R5.2 (link-coa-to-parcels) shipped today; CoAs now have `parcel_linked_at` populated. R5.3 unblocks R5.4 (classify-coa-trades — which reads `scope_tags`) and R5.5 (compute-coa-cost-estimates — which reads `scope_tags` + `coa_type_class`).

* **R0 Audit (live DB, 2026-05-14):**
  - Total CoAs: 33,052
  - With description: 32,419 (98.1% — high coverage; the 633 NULL-description rows are unmatchable and will increment a `no_description` audit metric)
  - Unprocessed (`scope_classified_at IS NULL`): 33,052 (all need first pass)
  - Schema confirmed: `coa_type_class VARCHAR(30)`, `project_type VARCHAR(50)`, `scope_tags TEXT[]`, `scope_classified_at TIMESTAMPTZ`, `scope_source VARCHAR(30)` — all nullable.

* **Sample descriptions** (live DB pulled at R0):
  - *"To alter the existing two-storey detached dwelling by constructing a rear two-storey addition, a complete third storey addition, and to construct a secondary suite (within the basement) with a walkout"* → residential / Addition / [dwelling, two-storey, third-storey, rear-addition, secondary-suite, basement, walkout]
  - *"To construct a new dwelling."* → residential / NewConstruction / [dwelling]
  - *"To adjust the parking standards for the proposed buildings."* → other / VarianceOnly / [parking]
  - *"To permit the use of a personal service shop (esthetician)…"* → commercial / ChangeOfUse / [service-shop]
  - *"To construct an addition to the rear of the existing dwelling and a third storey addition…"* → residential / Addition / [dwelling, rear-addition, third-storey]

* **Target Spec:** `docs/specs/01-pipeline/42_chain_coa.md` §6.5 step 5 + §6.6.D (output column definitions) + §6.8 (script catalog row).

* **Twin (read-only reference, NOT extracted):** `scripts/classify-scope.js` (lock 87). Adapts the `TAG_PATTERNS` array pattern + regex-matching architecture; drops all permit-side fields; drops the "Small Residential" 30-tag system (over-fitted to permit-side data shapes).

* **Standards referenced:**
  - `docs/specs/01-pipeline/47_pipeline_script_protocol.md` §R1-R12 (mandatory skeleton)
  - `docs/specs/01-pipeline/47_pipeline_script_protocol.md` §12 Self-Review Checklist (walked at Pre-Review)
  - `docs/specs/00_engineering_standards.md` §2 (errors), §3 (DB — IS DISTINCT FROM, DECIMAL), §6 (logging)

---

## Technical Design

### Classifier outputs (Spec 42 §6.6.D — STRICT enum conformance, R8 plan-review fix)

| Column | Type | Allowed values | Notes |
|---|---|---|---|
| `coa_type_class` | VARCHAR(30) | `'residential'` / `'commercial'` / `'institutional'` / `'mixed'` (per Spec 42 §6.6.D line 548) | **NULL** when no class-keyword fires (Worktree R8 FAIL-1 fix — prior plan's `'other'` was outside the spec enum). The 5% NULL allowance per coverage gate (≥ 95% NOT NULL target, Spec 42 §3 line 182) accommodates these. |
| `project_type` | VARCHAR(50) | `'NewConstruction'` / `'Addition'` / `'Alteration'` / `'Demolition'` / `'Severance'` / `'Mixed'` (per Spec 42 §6.6.D line 549) | **No `VarianceOnly` or `ChangeOfUse`** (Worktree R8 FAIL-1 fix — prior plan added both, neither in spec enum). Variance-only CoAs map to `'Alteration'` with `scope_tags` entry `'minor-variance'` preserving signal. Change-of-use maps to `'Alteration'`. NULL allowed when no verb fires. |
| `scope_tags` | TEXT[] | Reduced tag set (~30 tags) — see below | Sorted alphabetically for deterministic comparison. **NULL when no keywords match** (Worktree R8 FAIL-2 fix — prior plan's `'{}'` is NOT NULL in PG, would falsely satisfy `assert-global-coverage`'s `scope_tags IS NOT NULL ≥ 80%` gate). |
| `scope_classified_at` | TIMESTAMPTZ | `RUN_AT` | Set on every classification attempt (whether or not tags found). Drives idempotency: re-runs skip already-classified rows unless `load_at > scope_classified_at` (description re-ingested). |
| `scope_source` | VARCHAR(30) | `'description'` (constant per Spec 42 §6.6.D line 552) | Hard-coded; future ML-based classifier would require spec amendment + new enum value. |

### Reduced tag taxonomy (~25 tags)

Adapted from `classify-scope.js` TAG_PATTERNS, reduced to tags that fire reliably on CoA descriptions (which are 1-3 sentences, much shorter than permit `description+work+proposed_use` combined). Each tag is a regex-matched keyword pattern; first match wins per category. Set-based (no duplicates), sorted output.

**Type-class indicators (drive `coa_type_class` — strict spec enum, no `'other'`):**
- `dwelling`, `house`, `duplex`, `triplex`, `townhouse`, `apartment`, `condo` → `coa_type_class='residential'`
- `office`, `retail`, `restaurant`, `warehouse`, `service-shop`, `commercial` → `coa_type_class='commercial'`
- `school`, `hospital`, `church`, `institutional`, `place-of-worship` → `coa_type_class='institutional'`
- Both residential + commercial keywords fire → `coa_type_class='mixed'` (precedence: mixed > single-class, matches twin pattern at classify-scope.js:361)
- No type-indicator → NULL (R8 fix — prior plan's `'other'` is not in Spec 42 §6.6.D enum; coverage gate ≥ 95% NOT NULL accommodates the residual)

**Project-type verbs (drive `project_type` — strict spec enum, no `VarianceOnly` / `ChangeOfUse`):**
- `\\b(construct|new|build)\\b` (no `addition` nearby) → `NewConstruction`
- `\\b(addition|extend|extension)\\b` → `Addition`
- `\\b(alter|alteration|renovation|renovate|interior)\\b` → `Alteration`
- `\\b(demolish|demolition|remove|tear[\\s-]?down)\\b` → `Demolition`
- `\\bsever(ance)?\\b`, `\\b(consent|sever|split lot)\\b` → `Severance`
- `\\b(change of use|convert|convert(ed|ing) to)\\b` → `Alteration` (with `scope_tags` entry `'change-of-use'` — R8 fix: ChangeOfUse not in spec enum)
- Variance keywords only (`setback`, `parking standard`, `lot coverage`, `height adjust`, `density`, `minor variance`) with no construction verb → `Alteration` (with `scope_tags` entry `'minor-variance'` — R8 fix: VarianceOnly not in spec enum)
- 2+ DISTINCT construction verbs fire → `Mixed`
- No verb fires AND no variance keywords → NULL (defensible — coverage gate ≥ 90% accommodates a few %)

**Scope tags (~30, includes Toronto CoA-specific terms per R8 Worktree design note):**
`accessory-structure`, `addition`, `apartment`, `basement`, `change-of-use`, `commercial`, `condo`, `demolition`, `dwelling`, `fence`, `garage`, `institutional`, `lot-coverage`, `mixed-use`, `minor-variance`, `new-construction`, `office`, `parking`, `rear-addition`, `renovation`, `residential`, `retail`, `school`, `secondary-suite`, `service-shop`, `setback`, `severance`, `third-storey`, `townhouse`, `two-storey`, `walkout`

### Architecture decisions

- **Pure-function classifier** in `scripts/lib/coa-scope-classifier.js` (NEW shared lib). Inputs: `{ description, status, decision }`. Outputs: `{ coa_type_class, project_type, scope_tags }`. Same input → same output, no DB access. Spec 84 §7 dual-path: TS twin at `src/lib/classification/coa-scope-classifier.ts` (parity-tested via `coa-scope-classifier.logic.test.ts`).
- **Streaming**: `streamQuery` for the unprocessed-CoA SELECT (per Spec 47 §R7 — coa_applications is in the streamQuery mandate list).
- **Batched UPDATE**: 1000-row UNNEST batches inside a single `withTransaction`. IS DISTINCT FROM guards on every column to prevent dead-tuple bloat on re-runs (Spec 47 §9.3).
- **Array parameter safety (R8 Gemini CRIT)**: `scope_tags` array passed via pg's native array param binding (`$N::TEXT[]` with the JS array as the value), NOT via string interpolation `{${tags.join(',')}}`. The twin classify-scope.js:530 uses the unsafe string-literal pattern; this script must use the safe native path. Test asserts no `'{' || ... || '}'` string concatenation present in SQL.
- **Idempotency**: `WHERE scope_classified_at IS NULL OR scope_classified_at < load_at`. Re-runs match zero rows unless a CoA was re-ingested. **R8 DeepSeek HIGH note**: re-classification on CKAN description change depends on `load-coa.js` bumping `load_at` whenever the description column changes via `IS DISTINCT FROM`-guarded UPSERT. Pre-Review Self-Checklist verifies this contract holds (item added below); if load-coa.js does NOT bump load_at on description-only changes, file a follow-up WF3 to add the comparison.
- **No `failed_sample`** — classification has no per-row failure mode (every row gets at minimum `coa_type_class='other'`/`project_type='VarianceOnly'`). If a CoA has NULL description, it's pre-filtered out of the SELECT and counted in the `no_description` audit metric.

### Audit metrics (Spec 42 §6.8 row 666)

Per the spec catalog: `scope_classified_pct`, `unmapped_scope_count`, `project_type_distribution`. Plus three R0-derived metrics:
- `coa_processed` — total rows seen this run
- `scope_classified_pct` — `scope_tags IS NOT NULL` count / processed. Threshold `>= 95%` PASS, else WARN.
- `unmapped_scope_count` — rows where `scope_tags = []` (no keyword matched). Threshold `<= 5%` PASS.
- `no_description` — rows where description IS NULL (skipped by SELECT). Pure INFO.
- `coa_type_class_distribution` — JSON-typed metric: `{residential: N, commercial: N, ...}`. INFO.
- `project_type_distribution` — JSON-typed metric: `{NewConstruction: N, Addition: N, ...}`. INFO.
- `sys_velocity_rows_sec`, `sys_duration_ms` — standard observability.

### Database Impact: NO

All five output columns exist (added by Phase D R5.1 mig 145 + Phase B). No new migration required.

### Day-1 expectations

Based on the 5-sample R0 descriptions + Toronto CoA archetypes, expect:
- `coa_type_class` distribution: ~75% residential / ~10% commercial / ~3% institutional / ~5% mixed / ~7% other
- `project_type` distribution: ~50% Addition / ~15% NewConstruction / ~10% Alteration / ~20% VarianceOnly / ~5% other types
- `unmapped_scope_count`: ≤ 5% (rare descriptions like "To adjust parking standards" may not match any scope tag but still get project_type='VarianceOnly' + coa_type_class='other')

---

## Standards Compliance

* **Try-Catch Boundary (§2.2):** N/A — no API routes; script-level try-catch via `pipeline.run` envelope.
* **Unhappy Path Tests (§2.1):** logic tests cover: (a) empty description → returns `('other', 'VarianceOnly', [])`; (b) typo-only description (no keywords) → same; (c) both residential AND commercial keywords → `coa_type_class='mixed'`; (d) multiple verbs (construct + addition) → `project_type='Mixed'`; (e) idempotency: re-running same input produces same output.
* **logError Mandate (§6.1):** N/A — no new catch blocks introducing logged failures. Per-row classifier errors (impossible by construction) would fall through to the `pipeline.run` envelope and abort the batch.
* **Pipeline Safety §9.1 Transaction Boundaries:** Batched UPDATE inside `withTransaction` envelope; one transaction per 1000-row batch.
* **§9.2 Param limit:** 5 columns × 1000 rows = 5000 params per batch (well under 65535 PG limit; uses UNNEST array pattern matching link-parcels.js).
* **§9.3 Idempotency:** IS DISTINCT FROM on every UPDATE column; SELECT filter `scope_classified_at IS NULL OR scope_classified_at < load_at` is the canonical Spec 47 §9.3 incremental pattern.
* **§7 Dual Code Path:** JS classifier lib at `scripts/lib/coa-scope-classifier.js`; TS mirror at `src/lib/classification/coa-scope-classifier.ts`. Parity test asserts byte-for-byte output equality on a 50-row fixture matrix.
* **Spec 47 §R1-R12:** advisory lock 4202, getDbTimestamp(pool), Zod logic_vars validation, withTransaction per batch, streamQuery for source, audit_table emit, emitMeta, idempotency.

---

## Key Files

- **NEW** `scripts/classify-coa-scope.js` (~350 lines — smaller than the link-coa-to-parcels.js R5.2 because no spatial/atomicity complexity, just classify + batched UPDATE)
- **NEW** `scripts/lib/coa-scope-classifier.js` (~150 lines pure classifier)
- **NEW** `src/lib/classification/coa-scope-classifier.ts` (TS mirror per Spec 84 §7)
- **NEW** `src/tests/coa-scope-classifier.logic.test.ts` (parity test — JS/TS byte-equality on 50-row fixture matrix; 25 unit tests covering each tag pattern, edge cases)
- **NEW** `src/tests/classify-coa-scope.infra.test.ts` (Spec 47 §R1-R12 regression-lock; advisory lock 4202; SQL structure)
- **MODIFY** `scripts/manifest.json` (register `classify_coa_scope` step in coa chain AFTER `link_coa_to_parcels` (lock 4201) and BEFORE `link_coa` — matches Spec 42 §6.8 lock-ID ordering. R8 fix: prior plan said "after link_coa" — that was a typo for `link_coa_to_parcels`. Downstream `classify_coa_trades` (R5.4, lock 4203) gates on `scope_classified_at` so scope must come first.)
- **MODIFY** `scripts/seeds/logic_variables.json` (+1 key: `coa_scope_unmapped_threshold_pct` default 5)
- **MODIFY** `src/components/FreshnessTimeline.tsx` (PIPELINE_REGISTRY + PIPELINE_CHAINS coa array)
- **MODIFY** `src/lib/admin/funnel.ts` (STEP_DESCRIPTIONS)
- **MODIFY** `src/tests/pipeline-advisory-lock.infra.test.ts` (lock 4202)
- **MODIFY** `src/tests/chain.logic.test.ts` + `src/tests/assert-global-coverage.infra.test.ts` + `src/tests/quality.logic.test.ts` (chain length 13 → 14 + registry 48 → 49 + link group 15 → 16)

---

## WF1 Execution Plan (verbatim from `.claude/workflows.md`)

- [ ] **Contract Definition:** Classifier input/output TypeScript interface in `src/lib/classification/coa-scope-classifier.ts` BEFORE implementation. Same interface mirrored in the JS lib via JSDoc.
- [ ] **Spec & Registry Sync:** Spec 42 §6.5 step 5 + §6.6.D + §6.8 row 666 already cover the design with the strict enums this plan now conforms to (R8 plan-review fold removed the prior `VarianceOnly` / `ChangeOfUse` / `'other'` drift). No spec amendment required. Run `npm run system-map` after implementation to register the new pipeline step in the generated registry.
- [ ] **Schema Evolution:** N/A — all 5 output columns exist post-R5.1.
- [ ] **Test Scaffolding:** Create the 2 test files. Logic test asserts the 25-pattern fixture matrix + edge cases. Infra test asserts Spec 47 §R1-R12 compliance.
- [ ] **Red Light:** `npx vitest run src/tests/coa-scope-classifier.logic.test.ts src/tests/classify-coa-scope.infra.test.ts` — all must fail.
- [ ] **Implementation:**
  1. `scripts/lib/coa-scope-classifier.js` — TAG_PATTERNS + `classifyDescription({ description, status, decision })` pure function.
  2. `src/lib/classification/coa-scope-classifier.ts` — TS twin (byte-for-byte parity).
  3. `scripts/classify-coa-scope.js` — Spec 47 skeleton + streamQuery + batched UPDATE.
  4. `scripts/manifest.json` — register step.
  5. `scripts/seeds/logic_variables.json` — add `coa_scope_unmapped_threshold_pct`.
  6. Collateral test/component updates (FreshnessTimeline + funnel + 4 test files).
- [ ] **Auth Boundary & Secrets:** N/A — no API route, no secrets.
- [ ] **Pre-Review Self-Checklist:** Generated per WF1 protocol from the target spec's behavioral surface — Spec 42 §6.5 step 5 (Behavioral Contract), §6.6.D (Output column definitions / enum constraints), §6.8 row 666 (audit metric thresholds + idempotency filter), plus Spec 47 §R1–R12 (script protocol). Each item is a verifiable yes/no question walked against the ACTUAL diff:
  - **(a) §6.6.D enum strict — `coa_type_class`:** does every emitted value lie in `{residential, commercial, institutional, mixed, NULL}`? No `'other'` / no stray strings?
  - **(b) §6.6.D enum strict — `project_type`:** does every emitted value lie in `{NewConstruction, Addition, Alteration, Demolition, Severance, Mixed, NULL}`? No `VarianceOnly` / `ChangeOfUse`?
  - **(c) §6.6.D scope_tags NULL sentinel:** does the diff emit `scope_tags = NULL` (not `'{}'`) when no keywords match? Does `assert-global-coverage`'s `IS NOT NULL` gate now reflect classifier accuracy?
  - **(d) §6.5 step 5 — edge case handling:** does the classifier handle CoAs whose `status` is `'Withdrawn'`/`'Closed'` correctly? (Should still classify based on description; lifecycle phase is a separate column owned by `classify-lifecycle-phase.js`.)
  - **(e) §6.8 idempotency filter:** does the SELECT use `scope_classified_at IS NULL OR scope_classified_at < load_at`? Re-runs must match zero rows unless `load_at` was bumped by a re-ingestion.
  - **(f) §6.8 audit metric:** is `unmapped_scope_count` computed POST-classification on rows with `scope_tags = NULL`, not on rows with `scope_tags = '{}'` (which the diff should never produce per (c))?
  - **(g) Spec 47 §R2/§R6 advisory lock:** is `ADVISORY_LOCK_ID = 4202`? Wrapped in `withAdvisoryLock(pool, ADVISORY_LOCK_ID, ...)` with `lockResult.acquired` guard?
  - **(h) Spec 47 §R7 streamQuery:** does the source SELECT use `pipeline.streamQuery` (33K rows > 10K mandate threshold)?
  - **(i) Spec 47 §R9 atomicity:** is the batched UPDATE wrapped in `withTransaction`? IS DISTINCT FROM guards on every column?
  - **(j) Spec 84 §7 dual-path:** does `src/lib/classification/coa-scope-classifier.ts` produce byte-for-byte identical output to `scripts/lib/coa-scope-classifier.js` on the 50-row fixture matrix?
  - **(k) Gemini CRIT (array safety):** does the UPDATE pass `scope_tags` as a pg-native array param (`$N::TEXT[]` with the JS array as the value), with NO `'{' || ... || '}'` string-literal construction anywhere in the SQL?
  - **(l) DeepSeek HIGH verification — cross-script dependency:** does `load-coa.js` bump `load_at` whenever `description` changes (`IS DISTINCT FROM` guard in its UPSERT)? Read `scripts/load-coa.js` to verify. If NO, file follow-up WF3 (classifier re-runs would silently miss CKAN description amendments).
- [ ] **Multi-Agent Review (3 reviewers, parallel — USER-REQUESTED):** Gemini + DeepSeek + worktree code-reviewer.
- [ ] **Green Light:** `npm run test && npm run lint -- --fix && npm run typecheck`. Live verify: `node scripts/classify-coa-scope.js` against dev DB — must classify ~32,419 description-bearing CoAs in <30s; emit `scope_classified_pct >= 95%`. → WF6.
- [ ] **WF6 Commit:** `feat(42_chain_coa): WF1 #coa-pipeline-parity-phase-d-R5.3 — classify-coa-scope.js (description-keyword classifier + JS/TS dual-path)`

---

## Plan-Review (3-reviewer adversarial, USER-REQUESTED — completed 2026-05-14)

### Triage Table (14 findings — 6 BUGs folded, 7 DEFER, 1 already-fixed)

| # | Sev | Conf | Source | Finding | Decision |
|---|---|---|---|---|---|
| 1 | **FAIL** | 92 | Worktree | `VarianceOnly` not in Spec 42 §6.6.D project_type enum (allowed: NewConstruction / Addition / Alteration / Demolition / Severance / Mixed only) | **BUG → folded**: removed VarianceOnly; map variance-only CoAs to `Alteration` + scope_tags `'minor-variance'`. Same fold applied for `ChangeOfUse` (also not in spec). |
| 2 | **FAIL** | 88 | Worktree | `scope_tags = '{}'` (empty array) is NOT NULL in PG — falsely satisfies `assert-global-coverage`'s `scope_tags IS NOT NULL ≥ 80%` gate | **BUG → folded**: write NULL (not empty array) when no keywords match. |
| 3 | **FAIL** | 82 | Worktree | Predecessor named `link_coa` — should be `link_coa_to_parcels` (lock 4201) per §6.8 lock-ID ordering | **BUG → folded**: manifest position section corrected. |
| 4 | MED | 75 | Worktree | `coa_type_class='other'` not in Spec 42 §6.6.D enum (allowed: residential / commercial / institutional / mixed only) | **BUG → folded**: NULL when no class-keyword fires. 5% NULL allowance per coverage gate. |
| 5 | MED | 70 | Worktree | Tag taxonomy gaps for Toronto CoA frequent terms (`setback`, `parking`, `minor-variance`, `accessory-structure`, `fence`) | **BUG → folded**: added 5 tags to taxonomy (~30 total). |
| 6 | **CRIT** | 95 | Gemini (on twin) | SQL injection via tag-array string concat `{${tags.join(',')}}` (twin classify-scope.js:530) | **BUG → folded as implementation guidance**: my plan uses pg's native `$N::TEXT[]` array binding, not string interpolation. Test asserts no `'{' || ... || '}'` SQL string concat present. |
| 7 | HIGH | 80 | DeepSeek | Classifier idempotency depends on `load-coa.js` bumping `load_at` on description re-ingestion | **DEFER with verification**: Pre-Review checklist verifies the contract. If load-coa.js fails to bump load_at on description-only changes, file follow-up WF3. |
| 8 | CRIT | 95 | DeepSeek | lead_id LPAD truncation collision risk | **ALREADY FIXED**: WF3 #lpad-revision-num-collision (commit `4b9ff32`). Spec §6.6.A.1 amended; mig 138_a excludes admin permits. DeepSeek didn't have visibility into recent commits. |
| 9 | CRIT | 85 | DeepSeek | lifecycle_status_history natural key `date_trunc('second')` allows silent drops | **DEFER**: out of R5.3 scope (separate spec section, separate script). File as follow-up to Spec 84 hardening WF. |
| 10 | HIGH | 75 | DeepSeek | `assert_coa_freshness` WARN-only — won't halt chain on prolonged CKAN outage | **DEFER**: operational concern, out of R5.3 scope. |
| 11 | HIGH | 75 | DeepSeek | `permits.linked_coa_application_number` single-value column loses data on multi-CoA-to-permit | **DEFER**: out of R5.3 scope (link_coa.js concern). |
| 12 | MED | 60 | DeepSeek | Phase distribution gate edge case on Seq with row_count=1 | **DEFER**: out of R5.3 scope (assert-lifecycle-phase-distribution.js concern). |
| 13 | MED/LOW | 50-60 | DeepSeek | lead_id format CHECK regex tightness; advisory lock deadlock potential | **DEFER**: operational/already-mitigated concerns. |
| 14 | LOW | 50 | DeepSeek | Mobile API should expose `lead_type` field derived from prefix | **DEFER**: out of R5.3 scope (Spec 91 mobile concern). |

### BUG-fix application summary (6 fixes folded inline above)

1. `project_type` enum strict: removed `VarianceOnly` + `ChangeOfUse`; map to `Alteration` + scope_tags signals.
2. `coa_type_class` enum strict: removed `'other'`; use NULL for unclassifiable.
3. `scope_tags = NULL` (not `'{}'`) when no keywords match.
4. Manifest predecessor corrected to `link_coa_to_parcels`.
5. Tag taxonomy expanded with Toronto CoA frequent terms (~30 tags).
6. Array parameter safety: pg native binding only, no string interpolation. Test asserts.

Plus 2 plan-level notes folded:
- DeepSeek HIGH (load_at semantics): added Pre-Review Self-Checklist item verifying load-coa.js bumps load_at on description IS DISTINCT FROM changes.
- Worktree design note: explicit data dependency scope → trades → cost documented in §6.8 reference.

7 DEFER findings will be appended to `docs/reports/review_followups.md` under heading `## classify-coa-scope.js R5.3 — plan-review deferrals (2026-05-14)`.

---

> **PLAN LOCK — 3-reviewer adversarial plan review complete; 6 BUGs folded, 7 DEFERs queued, 1 finding already-fixed by prior WF3.**
>
> Spec 42 alignment: **on plan**. R5.3 implements §6.5 step 5 + §6.8 row verbatim. Phase D Wave 5 — unblocks R5.4 classify-coa-trades + R5.5 compute-coa-cost-estimates which both consume `scope_tags`.
>
> Estimated scope:
> - 1 NEW pipeline script (~350 lines)
> - 1 NEW shared JS lib (~150 lines) + TS twin
> - 2 NEW test files (~50 assertions total)
> - 9 collateral updates (manifest, seeds, registry, 4 tests, 2 components)
> - 0 migrations
>
> **Do you authorize this WF1 plan? (y/n)**
> DO NOT generate code. DO NOT run pipeline scripts. TERMINATE RESPONSE until 3-reviewer review complete + authorization.

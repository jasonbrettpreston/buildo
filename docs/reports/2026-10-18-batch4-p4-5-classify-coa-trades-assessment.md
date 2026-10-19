# Phase 4 wave 4 — `classify_coa_trades` (scripts/classify-coa-trades.js) conversion assessment, commit ①

**Target standard:** McDonald's Airtight V3 (Spec 124 R-DF). That means zero purity findings with no ledger allowance (R-BZ), every gate hard from ① (R-BA), the seven admission questions including EXTERNALIZED, and admin visibility (R-DL).
**Archetype:** MATERIALIZER (ARCH-CENSUS wave-4 row, operator y 2026-10-18, wave-4 plan Q8). It derives per-lead rows into `lead_trades` and `lead_products` from `coa_applications.scope_tags` and advances the `trade_classified_at` watermark.
**Commit form: compressed (R-PACE-1)**. Commit ① is this report plus the red suite. Commit ② adds the descriptor, compute, notes, shell and the seeds migration (274). Commit ③ is the cutover. The MATERIALIZER archetype has more than two full-form members in flight (link_parcel_addresses converted; compute_cost_estimates and compute_trade_forecasts in wave 3; compute_coa_cost_estimates in this wave), so compressed is the default (#24).
**Commit ② waits on a library form.** The MATERIALIZER runner today runs only a compute-authored `INSERT … SELECT` (`scripts/lib/step/index.js:2818-2847`). The runner-built row form is drafted in `.cursor/v3-materializer-form-ruling-2026-10-18.md` (Q-MZ, operator y owed; one RE-FREEZE).
**Frozen legacy oracle:** `src/tests/steps/classify_coa_trades/fixtures/legacy-classify-coa-trades.js.txt`, byte-identical to `scripts/classify-coa-trades.js` (sha256 `bb241cb58299d228…`, last changed by `638d2b76`).
**Owner specs:** 42 (`42_chain_coa.md` §6.5 step 5, §6.8 row 667, §6.11 Phase D R5.4) and 80 (`80_taxonomies.md` §5), per the SPEC LINK header at `classify-coa-trades.js:32-35`. 47 and 84 are governing (protocol; dual-path classifier). **Target spec:** 42 (`identity.spec` "42", a census owner spec, R-DE (ii)).
**Chain:** `coa`, position 7 of 16 (`manifest.json:98`): after classify_coa_scope (writes `scope_tags`), before compute_coa_cost_estimates (reads `lead_trades`).

---

## 1. PH-0 — Boundary freeze (G0)

### 1.1 Write class and transactions
- **Source:** one `pipeline.streamQuery` over `coa_applications`, `WHERE scope_tags IS NOT NULL AND scope_classified_at IS NOT NULL AND (trade_classified_at IS NULL OR trade_classified_at < scope_classified_at) ORDER BY id ASC` (`:267-276`, pinned L4).
- **Flush:** one `pipeline.withTransaction` per flush. A flush fires when trade rows, CoA ids or product rows reach 1000 (`:401-405`; `INSERT_BATCH_SIZE = Math.min(1000, floor(65535/9))` `:85`, `PRODUCT_BATCH_SIZE` `:89`; pinned L15). The statement order inside the transaction is pinned L12:
  1. **`lead_trades`:** a 9-column VALUES upsert, `ON CONFLICT (lead_id, trade_id) DO UPDATE SET` all 7 non-key columns including `classified_at = EXCLUDED.classified_at`. **No guard** and no WHERE. It returns `RETURNING (xmax = 0)` (`:202-216`, pinned L6).
  2. **`lead_products`:** `DELETE … WHERE lead_id = ANY($1)` for **every** processed lead (`:227-229`), then a 4-column VALUES INSERT `ON CONFLICT (lead_id, product_id) DO NOTHING` (`:230-246`).
  3. **Watermark:** `UPDATE coa_applications SET trade_classified_at = $2 WHERE id = ANY($1::bigint[])` for every processed CoA, zero-trade CoAs included (`:251-256`, pinned L14).
- **Retraction:** none on `lead_trades` (CCT-D1, pinned L10). Per-lead replace on `lead_products`.

### 1.2 Columns written
- `lead_trades`: lead_id, trade_id, tier (always 3), confidence, is_active (always true), phase (always null), lead_score (`Math.round(confidence*100)`), attachment_basis, classified_at (RUN_AT) (`:302-318`; realtor `:328-337`).
- `lead_products`: lead_id, product_id, confidence, classified_at (RUN_AT).
- `coa_applications`: trade_classified_at (RUN_AT).

### 1.3 Audit rows, verdict and `records_meta`
- **Audit table:** phase 42, "CoA Trade Classification", 22 rows in a pinned order (L17, `:457-553`).
- **FAIL rows:** `slug_resolution_miss_count == 0` and `product_slug_miss_count == 0` (L13, L19).
- **WARN rows:** `coa_eligible > 0` (L16); `unmapped_scope_pct <= coa_trades_unmapped_threshold_pct` (L18); `avg_active_trades_per_lead <= coa_active_trades_warn_max` (L19).
- **Verdict:** FAIL > WARN > PASS over the rows (`:555-559`). `emitSummary` adds the `cov_` vocab row from `manifest.scripts.classify_coa_trades.telemetry_vocab_cols` (`:563-577`, pinned L20).
- **`records_new` / `records_updated`:** from RETURNING. With no guard, every conflict counts as updated (L11).

### 1.4 Reference reads
In order (L3):
1. `SELECT id, slug FROM trades WHERE id = $1 AND slug = $2` with `[33, 'realtor']`, the realtor probe (`scripts/lib/pipeline-realtor-availability.js:31-44`, which catches → false);
2. `SELECT id, slug FROM trades`;
3. `SELECT id, slug FROM product_groups`.

### 1.5 Live table facts (A.F-DB)
These come from the wave-4 plan's read-only SELECTs (`v3-wave4-coa-and-dispatch-2026-10-18.md` §B.2, DB at `69c1a1ef`). This lane ran no DB query.
- RLS: `relrowsecurity = true` on `lead_trades`, `lead_products` and `coa_applications`. So each write needs `rls_bypass_or_policy` (R-CT).
- `lead_trades`: 1,784,196 `permit:` rows vs 940,769 `coa:` rows.
- Unique keys: `lead_products` UNIQUE `(lead_id, product_id)` and `lead_id ~ '^(permit|coa):.+$'` CHECK (`migrations/184_create_lead_products.sql`); `lead_trades` ON CONFLICT target `(lead_id, trade_id)` (`migrations/124_create_lead_trades.sql`).

### 1.6 Consumers and co-writers (effective ledger, read-only, `scripts/lib/ledger.js:210`)
- `lead_trades`: readers are assert_global_coverage, compute_coa_cost_estimates and compute_trade_forecasts. The declared writer is this step alone. **Undercount:** the live trigger `trg_mirror_permit_trades_to_lead_trades` on `permit_trades` (`migrations/143_*.sql:90`) also writes it (CCT-D3). Declared at ② (wave-4 Q14).
- `lead_products`: reader assert_global_coverage; writer this step.
- `coa_applications.trade_classified_at`: readers are assert_global_coverage, this step (self-read) and compute_coa_cost_estimates (its cursor).

### 1.7 Admin visibility (R-DL)
- `PIPELINE_REGISTRY` ✓ (`src/components/FreshnessTimeline.tsx:60`).
- `STEP_DESCRIPTIONS` ✓ (`src/lib/admin/funnel.ts:686`).
- **`PIPELINE_TABLE_MAP` has no entry** (`funnel.ts:953-985`). It is owed at ②: `classify_coa_trades: 'lead_trades'` (CCT-D9). Under R-DV this descriptor-derived arm is carved out until the descriptor exists.
- `manifest.telemetry_tables` = lead_trades, lead_products, coa_applications ⊇ the declared writes ✓.

## 2. Behaviour ledger (what the conversion must reproduce)
The legacy pins L1–L20 in `src/tests/steps/classify_coa_trades/violations.test.ts` (GREEN at ①; §10). Each executes the frozen text.

## 3. Registry target review
| Field | Target |
|---|---|
| archetype / shape | MATERIALIZER / `materialize`, `materialize_form: "rows"` (drafted form) |
| lock | 4203 (kept textually; `LOCK_ID_REGISTRY`) |
| writes (declared order) | e1 `lead_trades` A guarded_upsert `guard:"none"` (CCT-D2), `retract:"none"` (CCT-D1); e2 `lead_products` F `replace_keys`; e3 `lead_products` A `guard:"none"`; e4 `coa_applications` G keyed update `trade_classified_at` (run_at) |
| key_prefix | `{lead_id, "coa:"}` on e1–e3 (trigger co-writer, CCT-D3) |
| lookups | `trades(id, slug)` unique_on slug; `product_groups(id, slug)` unique_on slug |
| staleness | pending cursor `trade_classified_at IS NULL OR < scope_classified_at`; invalidator claim #54 = `coa_applications.scope_classified_at` (producer classify_coa_scope) |
| recovery.reset | NULL `trade_classified_at` for `lead_id LIKE 'coa:%'` |

## 4. PH-3 — Intent ledger
1. **Classify:** each CoA becomes 0..N trade rows from the tag matrix plus the gated inference complement (`classifyCoaTrades`, `scripts/lib/coa-trade-classifier.js:305-336`). There is a realtor append for residential CoAs (`:322-341`).
2. **Products:** a full per-lead resync, so a CoA dropping to zero products is cleared (`:370-389`).
3. **Watermark last:** products must be durable before the cursor stops re-fetching the lead (`:223-226`).
4. **Telemetry:** provenance split (evidence/inference), dual-scope fan-out, a vocab coverage row.

## 5. PH-5 — Seam map
| Legacy site | Converted owner |
|---|---|
| `getDbTimestamp` (`:94`), `Date.now` (`:95`, `:421`) | runner RUN_AT / runner duration |
| `loadMarketplaceConfigs` + zod (`:97-107`) | descriptor `config.logic_variables` (R-CV), runner `failed_config_out_of_bounds` |
| `withAdvisoryLock(4203)` (`:109`) | runner lock |
| realtor probe + `trades` / `product_groups` reads (`:112-129`) | runner lookups (`role:"lookup"`), compute resolves slug → id (CCT-D7) |
| `streamQuery` source (`:267-276`) | `buildSourceSql` → runner keyset pages over `coa_applications.id` |
| per-row classification (`:278-414`) | pure `materializeRows` |
| `flushBatch` writes (`:182-263`) | runner ROWS arm, one txn per batch, declared order |
| audit statuses (`:457-559`) | declared checks (`limit_from_config` / `viol == 0`); compute emits measured values only (G7) |
| `manifest.json` + `computeVocabCoverage` (`:49`, `:563-564`) | declared vocab_coverage check over the runner READ ONLY snapshot (R-CH) (CCT-D6) |
| `emitMeta` (`:601-631`) | derived from the descriptor (`deriveMeta`) |

**Parity notes:**
- The keyset re-query vs legacy's one cursor is equivalent. The ORDER BY id is the same, and the only writer of `trade_classified_at` is this step, which advances it per flush. `scope_classified_at` is written upstream in chain order.
- The realtor id is resolved by slug: legacy writes the constant 33 only when `(33, 'realtor')` exists. That is identical on the live vocab, and the pin is dataset equality.

### 5.1 Risk class
**MEDIUM:**
- three targets on three tables, one shared with a trigger co-writer;
- a destructive per-lead replace;
- a library form that does not exist yet.

The domain logic (the classifier) is unchanged and already dual-path pinned (`src/tests/coa-trade-classifier.logic.test.ts`).

## 6. PH-6 — Classification and defect ledger (rows CCT-D1…CCT-D9 in `docs/reports/defect-ledger.md`; prefix CCT, the initials default, unique across all manifest slugs, so no override is needed — fast invariant #42)

The rows are defined once, in `docs/reports/defect-ledger.md` (status and closing commit live there); this list is the assessment-side summary.

- **CCT-D1**: stale `lead_trades` never retracted (legacy parity defect) — **declared deviation** (operator y, wave-4 Q12); follow-up fix with its own capture
- **CCT-D2**: unguarded upsert rewrites unchanged rows (parity) — `guard:"none"` + `guard_why`
- **CCT-D3**: mirror trigger is an undeclared co-writer (ledger truth) — declared at ② (Q14)
- **CCT-D4**: 7 tunable literals (EXTERNALIZED) — migration 274
- **CCT-D5**: literal fallbacks; an unconsumed, unseeded-in-JSON variable (EXTERNALIZED) — deleted at ②
- **CCT-D6**: the compute reads the manifest and runs a vocab coverage query (R-BZ G2 / R-CH) — declared check
- **CCT-D7**: realtor probe swallow and hard-coded id 33 (R-BZ G13 (closure) / Rule 3) — lookup plus declared WARN check
- **CCT-D8**: variable names not `<slug>_<name>` (R-DE (v)) — re-seeded; shared names → Q-C3
- **CCT-D9**: dead `supports_full`; no PIPELINE_TABLE_MAP entry (registry / R-DL) — ②

## 7. PH-6 — Literal ledger (Rule 3, R-DF EXTERNALIZED)
| Literal | Site | Converted |
|---|---|---|
| `Math.min(1000, …)` batch | `:85`, `:89` | `classify_coa_trades_batch_size` = 1000 (`batch_size_from_config`, R-DE (i)); 65535 is the R-CU protocol limit |
| `SLUG_MISS_CAP = 50` | `:172` | `classify_coa_trades_max_detail_keys` = 50 (the `*_max_detail_keys` precedent, migration 263) |
| tier `3` | `:308`, `:331` | `classify_coa_trades_tier` = 3, pinned min = max (R-CV: a definitional constant; `migrations/124:13` "always 3 for CoA-side") |
| `* 100` lead_score | `:316`, `:335` | `classify_coa_trades_lead_score_scale` = 100, pinned min = max (R-CV unit constant) |
| realtor confidence `0.7` | `:327` | `classify_coa_trades_realtor_confidence` = 0.7 |
| progress `5000` | `:407` | retired with the shell (log only; no decision) |
| `?? 18`, `.default(18)`, `.default(0)`, `.default(0.55)` | `:105`, `:70`, `:72`, `:63` | deleted (no literal fallback) |
| `coa_trades_unmapped_threshold_pct` (20), `coa_active_trades_warn_max` (18) | seeds | re-seeded as `classify_coa_trades_unmapped_threshold_pct`, `classify_coa_trades_active_trades_warn_max` (R-DE (v)); the old names retire at ③ (legacy reads them until then) |
| `vocab_coverage_{pass,warn}_pct`, `p16_inference_layer_enabled` | shared with classify_permits / assert_global_coverage / compute_trade_forecasts | **Q-C3** (unruled; drafted: a closed shared-model list in `closed-bounds.mjs`, each consumer named) |
| closure constants: `TAG_TRADE_MATRIX` confidences, `INFERENCE_TIER_CONFIDENCE 0.50`, `PRODUCT_TAG_CONFIDENCE 0.75`, `PRODUCT_BUNDLE_CONFIDENCE 0.45` (`coa-trade-classifier.js:47-54`, `:119-184`) | the dual-path taxonomy substrate (Spec 84 §7; TS twin `src/lib/classification/coa-trade-classifier.ts`) | outside gate E's ast-grep scope (compute files only, `compute-literals.mjs:152`). **Q-C4** (unruled; drafted PIN EXT-CLOSURE, owner the taxonomy / cost-model owners, shared with wave 3) |

## 8. Purity estimate (gate E codes G0–G13, 122a §A26), against the converted compute
- **G1, G3, G4, G5, G6, G8, G10, G11, G12:** 0 expected. The compute holds no ledger SQL, catalog, transaction, DML, clock, contract hook, URL or dynamic require.
- **G2:** the source `*_sql` reads coa_applications only (a declared read).
- **G7:** 0 once the five statuses move to declared checks.
- **G9:** 0 once the literals above are config.
- **G13:** 0. The realtor catch lives in `scripts/lib/pipeline-realtor-availability.js`, which the converted compute does not require.
- **G0 closure:** `coa-trade-classifier.js` → `archetypes.js`, `tag-product-matrix.js`, `src/features/leads/lib/archetype-cost-map.js`. That is pure data plus functions with no SQL (to be measured by `compute-purity.mjs --list` at ②; the uncommitted draft compute is the input).

## 9. PRE goldens and forced-change proof — NOT YET CAPTURED
- PRE: night P3 (wave-4 plan Q13), on the legacy script, in chain order after classify_coa_scope.
- POST and #38: night P4. The bracket NULLs `trade_classified_at` on a `coa:` cohort (cascade order: scope → trades → cost).
- R-DP restore: on `lead_products`, the cohort's rows are deleted and reinserted.
- Downstream replay: compute_coa_cost_estimates, compute_trade_forecasts, assert_global_coverage. No DB write was made at ①.

## 10. Red suite (PH-7) — `src/tests/steps/classify_coa_trades/violations.test.ts`
- **29 tests:** L1–L20 (GREEN, executing the frozen oracle through `fixtures/legacy-harness.ts`) and D1–D9 (`it.fails`).
- **Gate-K red evidence:** `docs/reports/red-evidence/classify_coa_trades/pre2-artifacts-missing.json`, with the 9 D claims flipped to `it`: 20 pass, 9 fail.
  - D1–D7 fail as ENOENT on the named missing descriptor and compute.
  - D8 fails because this report lacks the generated scorecard.
  - D9 fails because `converted[]` lacks the file.

## 11. Registry at ① (landed in this commit) and what is owed later
- **At ①:**
  - `converted.json` pending at stage `red_suite`;
  - census row UNDECLARED/C6 → MATERIALIZER/pending, owner_specs 42 + 80 (plus the two census fixtures);
  - roadmap regenerated; `conversion-roadmap.infra.test.ts` re-pinned (pendingBatch 3 → 4, C6 34 → 33);
  - ADOPTION `legacy_oracle_excluded` (counts 19/7/7);
  - CCT-D1…D9.
- **R-DU:** no descriptor file exists, so the pending row is selected but non-blocking.
- **At ②:** descriptor, compute, shell, notes, migration 274 plus seeds JSON, PIPELINE_TABLE_MAP, and the STEP_DESCRIPTIONS refresh. All of it waits on Q-MZ.
- **At ③:** cutover. It is blocked by EP-PIN-D17 under R-EA (wave-4 plan §B.4).

## 12. Operator decisions
**RULED 2026-10-18 (wave-4 plan, all 15 y):**
- Q8 MATERIALIZER;
- Q11 lead_products' per-key replace under MATERIALIZER (reusing `link_full_retraction`);
- Q12 CCT-D1 as a declared deviation;
- Q13 PRE on P3, POST on P4;
- Q14 the mirror trigger declared as a co-writer.

**UNRULED, drafted (the lane continued on the recommendation):**
- **Q-MZ:** the MATERIALIZER ROWS form (`.cursor/v3-materializer-form-ruling-2026-10-18.md`). **Recommend y.**
- **Q-C2:** keep lead_trades unguarded at conversion (parity, CCT-D2), with the guard as a follow-up. **Recommend y.**
- **Q-C3:** an R-DE (v) shared-model arm: a variable read by ≥ 2 steps' compute keeps its name and is listed once in a closed `SHARED_MODEL_VARIABLES` map with every consumer named (`vocab_coverage_*`, `p16_inference_layer_enabled`; the cost-model family for compute_coa_cost_estimates). **Recommend y.**
- **Q-C4:** PIN EXT-CLOSURE (dated 2026-10-18): closure-module tunables (classifier and Brain constants) are registered by the module owners in one landing with the TS twins, not inside a step conversion. **Recommend y.**

## 13. Compliance table (seven questions, R-DF)
| Question | Answer at ① |
|---|---|
| STANDARDIZED | MATERIALIZER, the precedent link_parcel_addresses (`5ee14f5b` → `1ad007f8`); the ROWS arm keeps the MATERIALIZER phase order |
| OBSERVABLE | `violations.test.ts` L1–L20 / D1–D9; `step-validate classify_coa_trades` (red at red_suite, non-blocking per R-DU) |
| RECORDED | converted.json pending, census row, CCT-D1…D9, this report |
| SCALABLE | the ROWS form serves 4 members (§0 of the ruling) |
| ACCURATE | file:line throughout; the legacy pins execute the frozen text; red evidence committed |
| SIMPLE | the domain classifier is reused unchanged; only the I/O moves |
| EXTERNALIZED | §7: 5 new variables, 2 re-seeded names, fallbacks deleted; shared names Q-C3, closure Q-C4 |

## 14. V3 package (Spec 124 `:275`, six parts) — state at ①
| Part | State | Evidence |
|---|---|---|
| (1) STANDARDIZED GATES | **OWED** (②) | No descriptor yet, so gates A–K cannot run. R-DU keeps ① non-blocking (`124:266`). Gate K evidence MET: `docs/reports/red-evidence/classify_coa_trades/pre2-artifacts-missing.json` |
| (2) REGISTRY | **PARTIAL**: converted.json pending ✓ (`scripts/steps/_schema/converted.json` new entry); census ✓; R-DL slug-keyed arms ✓ (`FreshnessTimeline.tsx:60`, `funnel.ts:686`); PIPELINE_TABLE_MAP **OWED** (CCT-D9) | — |
| (3) CROSS-STEP TRUTH | **OWED**: the trigger co-writer declaration (CCT-D3), and #44 after ② captures | `migrations/143_*.sql:90` |
| (4) COMPUTE PURITY | **OWED** (②): the draft compute is uncommitted (§8 estimate 0 findings) | `scripts/lib/compute/classify-coa-trades.js` (draft) |
| (5) EXTERNALIZED | **OWED** (②): migration 274 drafted (5 new + 2 re-seeded); Q-C3/Q-C4 open | `migrations/274_classify_coa_trades_logic_variables.sql` (draft) |
| (6) REPRODUCIBLE CAPTURES | **OWED**: P3 PRE / P4 POST + #38 bracket | §9 |

## R. Reflection (G9)
### LOW-CONFIDENCE
- **The keyset vs single-cursor equivalence** (§5). It holds because nothing else writes `trade_classified_at` mid-run. A concurrent classify_coa_scope run is excluded by chain order, not by a lock.
- **DO NOTHING vs generated DO UPDATE on lead_products** (ruling §6): equal only while `classifyCoaProducts` stays one-row-per-slug.

### RECURRING / STANDARD-SHAPING
- **The shared-variable naming gap** (Q-C3) will recur for every cost/classify step in waves 2–3.
- **Closure constants are outside gate E** (Q-C4). EXTERNALIZED for a dual-path model needs one owner, not a per-step answer.

## A. Measurement log (2026-10-18)
- `shasum -a 256 scripts/classify-coa-trades.js` → `bb241cb58299d228c1a31046c3421fa99a0f473cc1cadfc773e3d6ebf997b013`; `git log -1 -- scripts/classify-coa-trades.js` → `638d2b76`.
- `defectPrefixFor` over all `manifest.scripts` slugs: CCT → [classify_coa_trades] only.
- effective ledger (`effectiveLedger().inchain`): readers and writers as in §1.6.
- `npx vitest run src/tests/steps/classify_coa_trades/violations.test.ts` → 29 passed; red-evidence run → 20 passed, 9 failed.

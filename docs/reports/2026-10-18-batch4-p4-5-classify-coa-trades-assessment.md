# Phase 4 wave 4 — `classify_coa_trades` (scripts/classify-coa-trades.js) conversion assessment, commit ①

**Target standard:** McDonald's Airtight V3 (Spec 124 R-DF). That means zero purity findings with no ledger allowance (R-BZ), every gate hard from ① (R-BA), the seven admission questions including EXTERNALIZED, and admin visibility (R-DL).
**Archetype:** MATERIALIZER (ARCH-CENSUS wave-4 row, operator y 2026-10-18, wave-4 plan Q8). It derives per-lead rows into `lead_trades` and `lead_products` from `coa_applications.scope_tags` and advances the `trade_classified_at` watermark.
**Commit form: full (Spec 123 §7, nine commits).** **Full form reason:** R-PACE-1 (Spec 124a:145) allows the compressed form only once two members of the archetype have landed in the full form and are in `converted.json`; MATERIALIZER has one (link_parcel_addresses), so fast invariant #23 COMPRESSED-FORM-ELIGIBLE refuses the compressed form, and R-AH (124a:149) leaves the full form as the only legal plan (operator Q5 y, 2026-10-19). An earlier version of this line claimed compressed eligibility from members still in flight; #23 counts converted members only. Rows 1–6 (PH-0, PH-3, PH-5, PH-6, the golden master, PH-7) are evidenced by commit ① (this report and the red suite) and the replay-night-N1 PRE (dedb7e90). Row 7 (descriptor + compute) lands at stage compute_ported (W4A-R6, Spec 124 R-EF) with the seeds migration (274); the legacy shell stays live. The row-8 peels' green differentials and row 9 (cutover, frozen shell, registration) need the POST, so they ride night P4 and ③.
**Library form landed.** The MATERIALIZER runner-built row form is Spec 124 R-EH (`execution.materialize_form: "rows"`, RE-FREEZE #37, operator y 2026-10-18 on Q-MZ); classify_coa_trades is one of its named members.
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

Each intent traced to the commit that introduced it (`git log -S … -- scripts/classify-coa-trades.js`, measured 2026-10-19 at full-form row 7). The disposition column is the agent's proposal; the operator adjudicated the open ones as Q-C2..Q-C4 (2026-10-18) and Q-W4G-1 (2026-10-19) (Spec 121 §12.5).

| Intent | Source (introducing commit) | Disposition at row 7 |
|---|---|---|
| Tag-matrix classification per CoA | `95d77b2c` (WF1 R5.4); archetype bundle parity `c99fd8ed` | preserved-in-compute (`materializeRows` over the unchanged dual-path classifier); why in notes.json read_this_way |
| Residential realtor append | `95d77b2c` | preserved-in-compute; realtor id resolved from the `trades` lookup (CCT-D7); why in notes.json read_this_way |
| Per-lead lead_products replace | `44e16ca5` (lead_products) | preserved-in-runner (R-EH F `replace_keys` + A re-insert, one batch transaction; Q-W4G-1) |
| Watermark last (trade_classified_at) | `95d77b2c` | preserved-in-runner (R-EH G, run_at stamped; Q-W4G-1) |
| Unguarded lead_trades upsert | `95d77b2c` | encoded-as-descriptor-field (`guard: "none"` + guard_why, grandfathered; Q-C2) |
| Advisory lock 4203 | `95d77b2c` | preserved-in-runner (`identity.lock`) |
| Slug-miss detail cap | `95d77b2c` | encoded-as-descriptor-field (`classify_coa_trades_max_detail_keys`, migration 274) |
| Unmapped-scope WARN ceiling | `95d77b2c` | encoded-as-descriptor-field (`classify_coa_trades_unmapped_threshold_pct`, copied) |
| Active fan-out WARN ceiling | `9883656d` (WF2 P6.6) | encoded-as-descriptor-field (`classify_coa_trades_active_trades_warn_max`, copied) |
| attachment_basis column | `638d2b76` (P16-16D) | preserved-in-compute; why in notes.json read_this_way |
| Vocabulary coverage row | `1b6e7512` | encoded-as-descriptor-field (declared vocab_coverage checks, CCT-D6), read once after the loop by `buildPostSql` (R-EH (e)); parity in `post-read-parity.logic` |

## 5. PH-5 — Seam map
| Seam | Legacy site | Converted owner |
|---|---|---|
| clock seam | `getDbTimestamp` (`:94`), `Date.now` (`:95`, `:421`) | runner RUN_AT / runner duration |
| db seam | `loadMarketplaceConfigs` + zod (`:97-107`) | descriptor `config.logic_variables` (R-CV), runner `failed_config_out_of_bounds` |
| db seam | `withAdvisoryLock(4203)` (`:109`) | runner lock |
| db seam | realtor probe + `trades` / `product_groups` reads (`:112-129`) | runner lookups (`role:"lookup"`), compute resolves slug → id (CCT-D7) |
| db seam | `streamQuery` source (`:267-276`) | `buildSourceSql` → runner keyset pages over `coa_applications.id` |
| compute | per-row classification (`:278-414`) | pure `materializeRows` |
| db seam | `flushBatch` writes (`:182-263`) | runner ROWS arm, one txn per batch, declared order |
| verdict | audit statuses (`:457-559`) | declared checks (`limit_from_config` / `viol == 0`); compute emits measured values only (G7) |
| db seam | `manifest.json` + `computeVocabCoverage` (`:49`, `:563-564`) | declared vocab_coverage check over the runner READ ONLY snapshot (R-CH) (CCT-D6) |
| telemetry | `emitMeta` (`:601-631`) | derived from the descriptor (`deriveMeta`) |
| network seam | none (no outside call) | — |
| argv/env seam | none read (the manifest passes no argv; `supports_full` is dead, CCT-D9) | — |

**Parity notes:**
- The keyset re-query vs legacy's one cursor is equivalent. The ORDER BY id is the same, and the only writer of `trade_classified_at` is this step, which advances it per flush. `scope_classified_at` is written upstream in chain order.
- The realtor id is resolved by slug: legacy writes the constant 33 only when `(33, 'realtor')` exists. That is identical on the live vocab, and the pin is dataset equality.

### 5.1 Risk class
**MEDIUM.**

| Risk class | Chance | Impact | Mitigation |
|---|---|---|---|
| A write touches permit: rows of lead_trades (trigger co-writer, CCT-D3) | low | high — permit leads lose trades | `key_prefix {lead_id, coa:}` refuses an out-of-family row or key before the batch transaction (R-EH (d)) |
| The per-lead replace deletes products it does not re-insert | low | medium — products missing until the next run | DELETE and re-INSERT in one batch transaction, rolled back whole on any write failure (R-EH (f)) |
| Keyset paging differs from the legacy single cursor | low | medium — a CoA skipped or repeated in one run | same ORDER BY id; the runner refuses a batch whose last key does not advance; parity at the night-P4 POST |

The domain logic (the classifier) is unchanged and already dual-path pinned (`src/tests/coa-trade-classifier.logic.test.ts`).

PH-2 (churn × complexity): ASSESSMENT-INCOMPLETE because the generated batch artifact `docs/reports/generated/122-churn-complexity.md` covers only the sources chain and `classify_coa_trades` is outside its scope; no hand-plotted quadrant is substituted.

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
- **CCT-D10** (row 7): data present over an empty vocabulary reads FAIL (unevaluable at the declared severity, Spec 122a:639) where the legacy cov_ row read WARN — declared deviation, pinned in `post-read-parity.logic`

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
| (1) STANDARDIZED GATES | **MET at row 7** (compute_ported) | The descriptor landed, so gates A–K run; the capture-derived gates (G8, #30, #38, #40) are stage-gated until the night-P4 POST (Spec 124 R-EF). Gate K evidence is the artifact cited in the red-suite section above. |
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

---

## Validation scorecard (generated)

> Generated by `node scripts/analysis/step-validate.mjs --step=classify_coa_trades --write` — Spec 123 §6, ruling R-R (2026-08-29).
> Regenerate with the same command; a stale block is a conformance-lock finding (`step-conformance.infra.test.ts`).

**Score: 17/17** · G9 Reflection: PASS · G4d fence-lock coverage: PASS · G-shape: PASS · **Hard stop: no**

### Five-word verdict (Spec 124 §5 R-BA — "McDonald's Airtight")

| Word | Status | Detail |
|---|---|---|
| STANDARDIZED | PASS | PASS |
| OBSERVABLE | PASS | PASS |
| SCALABLE | PASS | PASS |
| UNDERSTANDABLE | PASS | PASS |
| ACCURATE | PASS | PASS |

| Gate | Score | Max | Detail |
|---|---:|---:|---|
| G0 | 1 | 1 | boundary-section=true spec-line=true |
| G1 | 1 | 1 | PH-3 section found=true sha-count=12 |
| G2 | 1 | 1 | no generated churn×complexity row; no PH-2 section; ASSESSMENT-INCOMPLETE claimed instead; why-stated=true |
| G3 | 2 | 2 | ledger rows=11 vocab-hit rows=11; evidence rows=0 (not scored) |
| G4 | 2 | 2 | risk-class row with chance+impact found=true |
| G5 | 1 | 1 | db=true clock=true network=true argv/env=true |
| G6 | 3 | 3 | 10 ledger row(s), 0 without CLOSED/PIN () |
| G7 | 3 | 3 | file=true fences=1 it-count=32 red-evidence-claims=1 red-evidence-pass=true ledger-deferred=false |
| G8 | 3 | 3 | missing-invocations=0 missing-pre-invocations=0 stale-fingerprints=0 unexplained-diffs=0 |
| G9 (binary) | PASS | — | heading=true low-confidence-table=true recurring-table=true |
| G4d (fence<=lock) | PASS | — | fences=1 lock-it-count=32 |
| G-shape | PASS | — | file-clean=null compute-clean=true |

### Fast invariants (always run — the fast descriptor gate)

| # | Scope | Pass | Detail |
|---|---|---|---|
| 1 | classify_coa_trades | PASS | min_migration=216 <= migrations count=282 |
| 2 | classify_coa_trades | PASS | 11 declared, missing from seeds: none |
| 3 | classify_coa_trades | PASS | retired=0 overlap-with-declared=none |
| 7 | classify_coa_trades | PASS | SPEC LINK header present=true |
| 8 | classify_coa_trades | PASS | G-4: 11 declared, 4 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover |
| 20 | classify_coa_trades | PASS | HB-1: execution.shape="materialize" — HB-1 applies_when execution.shape=="enrich" only (RS-D-STA); not applicable, never a pass-by-omission |
| 21 | classify_coa_trades | PASS | CEIL-1: execution.shape="materialize" — CEIL-1 applies_when execution.shape=="enrich" only (RS-D-STA); not applicable, never a pass-by-omission |
| 4 | (registry) | PASS | overlap: none |
| 5 | (registry) | PASS | clean (0 it.fails( call sites outside a declared pending slug) |
| 9 | (registry) | PASS | clean (0 converted slugs blocked by an unmet cutover_prereq item; blocks batching: 0) |
| 22 | (registry) | PASS | GOLD-PRE-FRESH: 83 PRE capture(s) across 27 converted step(s) all tracked + clean (git can restore every reference); net-new (R-DK): load_bylaw_map_areas, link_parcel_abutments |
| 23 | (registry) | PASS | COMPRESSED-FORM-ELIGIBLE: 9 compressed-form declaration(s), all eligible (proven archetype, >=2 converted members) |
| 24 | (registry) | PASS | COMPRESSED-FORM-DEFAULT: 9 eligible pending slug(s), all either compressed or carry a stated full-form reason |
| 25 | (registry) | PASS | ARCHETYPE-PARITY: 29 converted slug(s) — 29 compared against a retained census row (all agree), 0 with no retained row (census arm n/a, pre-R-AO cutovers); every archetype has a declared freeze profile |
| 26 | (registry) | PASS | COUNTER-ROOT: 74 declared counter source(s) across 25 descriptor(s) all root in their own shape's counterScope (+ records_meta) |
| 27 | (registry) | PASS | ROW-ERROR-GATE: 11 skip/quarantine declaration(s), all cite a real FAIL-severity, bound-carrying check in their own descriptor |
| 28 | (registry) | PASS | CLOSED-BOUNDS (gate A): 0 bound(s) checked, all closed (0 ledger-allowed, 0 from config/viol==0) |
| 29 | (registry) | PASS | ON-INVALID-CLOSED (gate B): 0 on_invalid(s) checked, all closed (0 ledger-allowed, 0 from fail/named-deviation) |
| 30 | (registry) | PASS | EMITS-EQUIV (gate C): 0 emits drift(s) checked, all closed (0 ledger-allowed, 0 from declared==emitted) |
| 31 | (registry) | PASS | CONSUMER-REGISTRY (gate D): 0 contract(s) checked, all closed (0 ledger-allowed, 0 present+typed/excluded); 42 unproduced src read(s) (hard until the FLEET-2 landing commit (.cursor/wf2_registry_truth_active_task.md, Fold 14 P1-C6)) [unproduced:src/app/api/admin/builders/route.ts:entities.google_place_id; unproduced:src/app/api/admin/stats/route.ts:notifications.is_sent; unproduced:src/app/api/admin/stats/route.ts:permits.first_seen_at; unproduced:src/app/api/leads/flight-board/detail/[id]/route.ts:permits.updated_at; unproduced:src/app/api/leads/flight-board/route.ts:permits.updated_at; unproduced:src/app/api/notifications/route.ts:notifications.id; unproduced:src/app/api/notifications/route.ts:notifications.is_read; unproduced:src/app/api/permits/[id]/route.ts:permit_inspections.created_at; unproduced:src/features/leads/lib/get-lead-feed.ts:entities.id; unproduced:src/features/leads/lib/get-lead-feed.ts:entities.photo_url; unproduced:src/features/leads/lib/get-lead-feed.ts:permits.location; unproduced:src/lib/admin/supplier-leads.ts:trade_forecasts.target_window; unproduced:src/lib/analytics/queries.ts:entities.id; unproduced:src/lib/builders/enrichment.ts:entities.first_seen_at; unproduced:src/lib/builders/enrichment.ts:entities.google_place_id; unproduced:src/lib/builders/enrichment.ts:entities.google_rating; unproduced:src/lib/builders/enrichment.ts:entities.google_review_count; unproduced:src/lib/builders/enrichment.ts:entities.id; unproduced:src/lib/builders/enrichment.ts:entities.linkedin_url; unproduced:src/lib/builders/enrichment.ts:entities.photo_url; unproduced:src/lib/builders/enrichment.ts:entities.photo_validated_at; unproduced:src/lib/builders/enrichment.ts:entities.trade_name; unproduced:src/lib/leads/lead-detail-query.ts:permits.updated_at; unproduced:src/lib/leads/lead-detail-query.ts:trade_forecasts.target_window; unproduced:src/lib/leads/lead-inspect-query.ts:coa_applications.lead_id; unproduced:src/lib/leads/lead-inspect-query.ts:lifecycle_status_history.id; unproduced:src/lib/leads/lead-inspect-query.ts:permits.first_seen_at; unproduced:src/lib/leads/lead-inspect-query.ts:permits.updated_at; unproduced:src/lib/leads/lead-inspect-query.ts:trade_forecasts.target_window; unproduced:src/lib/quality/metrics.ts:entities.google_place_id; unproduced:src/lib/quality/metrics.ts:permits.first_seen_at; unproduced:src/lib/sync/process.ts:permits.bid_value; unproduced:src/lib/sync/process.ts:permits.first_seen_at; unproduced:src/lib/sync/process.ts:permits.lead_id; unproduced:src/lib/sync/process.ts:permits.lifecycle_block; unproduced:src/lib/sync/process.ts:permits.lifecycle_group; unproduced:src/lib/sync/process.ts:permits.lifecycle_seq; unproduced:src/lib/sync/process.ts:permits.lifecycle_stage; unproduced:src/lib/sync/process.ts:permits.location; unproduced:src/lib/sync/process.ts:permits.photo_url; unproduced:src/lib/sync/process.ts:permits.trade_classified_at; unproduced:src/lib/sync/process.ts:permits.updated_at]; UNPRODUCED-UNWITNESSED: 42 (report-only until the table's inserter and its last unconverted writer convert, R-EE) [UNPRODUCED-UNWITNESSED:src/app/api/admin/builders/route.ts:entities.google_place_id; UNPRODUCED-UNWITNESSED:src/app/api/admin/stats/route.ts:notifications.is_sent; UNPRODUCED-UNWITNESSED:src/app/api/admin/stats/route.ts:permits.first_seen_at; UNPRODUCED-UNWITNESSED:src/app/api/leads/flight-board/detail/[id]/route.ts:permits.updated_at; UNPRODUCED-UNWITNESSED:src/app/api/leads/flight-board/route.ts:permits.updated_at; UNPRODUCED-UNWITNESSED:src/app/api/notifications/route.ts:notifications.id; UNPRODUCED-UNWITNESSED:src/app/api/notifications/route.ts:notifications.is_read; UNPRODUCED-UNWITNESSED:src/app/api/permits/[id]/route.ts:permit_inspections.created_at; UNPRODUCED-UNWITNESSED:src/features/leads/lib/get-lead-feed.ts:entities.id; UNPRODUCED-UNWITNESSED:src/features/leads/lib/get-lead-feed.ts:entities.photo_url; UNPRODUCED-UNWITNESSED:src/features/leads/lib/get-lead-feed.ts:permits.location; UNPRODUCED-UNWITNESSED:src/lib/admin/supplier-leads.ts:trade_forecasts.target_window; UNPRODUCED-UNWITNESSED:src/lib/analytics/queries.ts:entities.id; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.first_seen_at; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.google_place_id; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.google_rating; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.google_review_count; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.id; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.linkedin_url; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.photo_url; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.photo_validated_at; UNPRODUCED-UNWITNESSED:src/lib/builders/enrichment.ts:entities.trade_name; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-detail-query.ts:permits.updated_at; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-detail-query.ts:trade_forecasts.target_window; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-inspect-query.ts:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-inspect-query.ts:lifecycle_status_history.id; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-inspect-query.ts:permits.first_seen_at; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-inspect-query.ts:permits.updated_at; UNPRODUCED-UNWITNESSED:src/lib/leads/lead-inspect-query.ts:trade_forecasts.target_window; UNPRODUCED-UNWITNESSED:src/lib/quality/metrics.ts:entities.google_place_id; UNPRODUCED-UNWITNESSED:src/lib/quality/metrics.ts:permits.first_seen_at; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.bid_value; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.first_seen_at; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.lead_id; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.lifecycle_block; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.lifecycle_group; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.lifecycle_seq; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.lifecycle_stage; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.location; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.photo_url; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.trade_classified_at; UNPRODUCED-UNWITNESSED:src/lib/sync/process.ts:permits.updated_at]; LDG-10 step readers: 0 hard, 25 UNPRODUCED-UNWITNESSED (unconverted inserter) [UNPRODUCED-UNWITNESSED:step:assert_lifecycle_phase_distribution:permits.lifecycle_seq; UNPRODUCED-UNWITNESSED:step:classify_coa_scope:coa_applications.id; UNPRODUCED-UNWITNESSED:step:classify_coa_trades:coa_applications.id; UNPRODUCED-UNWITNESSED:step:classify_coa_trades:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:classify_lifecycle_phase:coa_applications.id; UNPRODUCED-UNWITNESSED:step:classify_lifecycle_phase:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:classify_lifecycle_phase:coa_applications.permit_type; UNPRODUCED-UNWITNESSED:step:classify_lifecycle_phase:permits.lifecycle_seq; UNPRODUCED-UNWITNESSED:step:compute_coa_cost_estimates:coa_applications.id; UNPRODUCED-UNWITNESSED:step:compute_coa_cost_estimates:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:compute_cost_estimates:permit_trades.trade_slug; UNPRODUCED-UNWITNESSED:step:compute_opportunity_scores:trade_forecasts.target_window; UNPRODUCED-UNWITNESSED:step:compute_phase_calibration:lifecycle_transitions.id; UNPRODUCED-UNWITNESSED:step:compute_phase_calibration:permit_phase_transitions.id; UNPRODUCED-UNWITNESSED:step:compute_trade_forecasts:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:enrich_coa_zoning:coa_applications.id; UNPRODUCED-UNWITNESSED:step:enrich_coa_zoning:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:enrich_named_builders:entities.id; UNPRODUCED-UNWITNESSED:step:enrich_wsib_builders:entities.id; UNPRODUCED-UNWITNESSED:step:link_coa:coa_applications.id; UNPRODUCED-UNWITNESSED:step:link_coa_to_parcels:coa_applications.id; UNPRODUCED-UNWITNESSED:step:link_coa_to_parcels:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:update_tracked_projects:coa_applications.lead_id; UNPRODUCED-UNWITNESSED:step:update_tracked_projects:permits.lead_id; UNPRODUCED-UNWITNESSED:step:update_tracked_projects:tracked_projects.id]; 6 unconverted-producer read(s) listed (O3, red once the producer converts) [unconverted_producer:scripts/analysis/gates/captures.mjs:value; unconverted_producer:scripts/analysis/gates/witness.mjs:x; unconverted_producer:scripts/classify-lifecycle-phase.js:permit_classifier_extended; unconverted_producer:scripts/quality/assert-lifecycle-phase-distribution.js:seq_violations; unconverted_producer:scripts/quality/assert-lifecycle-phase-distribution.js:seq_violations_truncated_count; unconverted_producer:scripts/quality/assert-network-health.js:scraper_telemetry] |
| 37 | (registry) | PASS | LF-ONLY (gate F): 0 path(s) checked, all LF (0 ledger-allowed) |
| 33 | (registry) | PASS | BANNED-COVERAGE (gate I): all 2 x-banned-for-new path(s) enforced |
| 34 | (registry) | PASS | STALENESS-DISPOSITION (gate I): 35 declared fingerprint_inputs entries, all adjudicated (registry present=true) |
| 35 | (registry) | PASS | CENSUS-PARITY (gate I): every converted slug has a census row, an exemption, or a ledger-allowed gap |
| 36 | (registry) | PASS | DEFECT-ID-UNIQUENESS (gate I): 639 definition row(s) checked, 134 legal mirror(s), 0 disagreements |
| 38 | (registry) | PASS | CAPTURE-NONZERO (gate G): every declared write target is closed (0 ledger-allowed, 4 outputs:"none" vacuous) |
| 39 | (registry) | PASS | CAPTURE-FRESHNESS (gate G): 89 post capture(s) checked against scripts/lib/step/**, all fresh or ledger-allowed |
| 40 | (registry) | PASS | CAPTURE-EXPLAINED (gate G): 29 step(s) checked — every diff-explanation channel accounted for |
| 32 | (registry) | PASS | COMPUTE-LITERALS (gate E): 1 finding(s), all ledger-allowed (1); ESTATE-LITERALS (gate E estate arm, R-EB): 0 finding(s) in scripts/analysis/gates, scripts/lib/step; tooling ratchet (PIN EXT-2) 128 finding(s) over 6 files, at or below the marks |
| 41 | (registry) | PASS | RED-EVIDENCE (gate K): 0 step(s) without a committed red-evidence artifact; 0 orphan ledger row(s) |
| 42 | (registry) | PASS | DEFECT-PREFIX-UNIQUE: 48 slug(s), every defect prefix unique |
| 45 | (registry) | PASS | NOTES-CAP: 22 declaring notes file(s), every one <= 12 prose entries |
| 46 | (registry) | PASS | report-only (adoption); enforced by #44 (a)/(c) (R-DB; fold 9 C7-1/C7-2): checks[].reads declared by 3/29 step(s); write_inventory.by_mode declared by 0/29 |
| 52 | (registry) | PASS | PRECOMMIT-BUDGET (R-EC): docs-only 20.41 s <= 25.3 s; registry-input 25.91 s <= 27.5 s; measured 2026-10-21T21:10:54.484Z on Bretts-Mac-Mini.local (darwin arm64, 12 cpu), hook sha matches |
| 47 | (registry) | PASS | MODE-EMITS-TYPE (P2-C5): 29 step(s) mode_select per archetype; 538 emits.type check(s), 0 mismatches |
| 48 | (registry) | PASS | LOGIC-VERSION (P2-C3): 29 step(s) logic_version <=> code_version trigger; 35 fingerprint_inputs entr(y/ies) examined, 0 violations |
| 49 | (registry) | PASS | TERMINALS-RECORDS-META (#75): 29 step(s); 344 declared-key check(s), 0 violations; 170 terminal(s) unwitnessed (no capture) |
| 51 | (registry) | PASS | ADMIN-REGISTRATION (R-DL/R-DW): 48 converted/pending step(s) admin-verifiable (7 without a descriptor: slug arms only, R-DV); no hand-written range on a converted step |
| 53 | (registry) | PASS | VARIABLE-EFFECT (R-EO): 209 take effect at cutover, 19 not read; admin badges current |
| 54 | (registry) | PASS | SWAP-ORDER (R-EQ): every swapped pending step's declared upstreams are converted or swapped (R-EQ) |

### Captures (item iv)
- missing invocations (POST): none
- missing invocations (PRE, GOLD-PRE): none
- stale fingerprints: none
- compare ran: true · diffs found: 197 · unexplained: 0

### Test suite (item iii)
- 3459/3459 passed (suite success=true)
- harvested: 138 file(s) from 3 FLEET-WIDE targets (src/tests/step-conformance.infra.test.ts, src/tests/golden-fingerprint.infra.test.ts, src/tests/steps/) — one spawn per run, so every step's report carries this same number, by design
- excluded (R-AG live-DB tier, owned by `npm run test:db`, derived from package.json `scripts.test`): 1 — **/*.db.test.ts
- skipped (declared but not run): 0
- failing: none

### Policy coverage matrix (item vi) — Spec 124 Rules 1-13

| Rule | Name | Status | Note |
|---|---|---|---|
| 1 | Nothing hidden | enforced-green | G-1 schema-baseline: schema-baseline clean |
| 2 | Compute is just compute | enforced-green |  |
| 3 | Tunables externalized | enforced-green | G-4: 11 declared, 4 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover · P4/LW-D10/R-A not scoped to this step |
| 4 | Compute rule declared | enforced-green | G-2: 3 preserved-in-compute row(s), 0 with no why/notes.json/checks[] grounding |
| 5 | checks >= 1 | enforced-green |  |
| 6 | Omission fails (20 categories) | enforced-green |  |
| 7 | Archetype gates categories | enforced-green |  |
| 8 | Per-target write discipline | enforced-green |  |
| 9 | Banned write needs ledger (+ V7 no_retraction) | enforced-green |  |
| 10 | Verdict row-derived | enforced-green | (a) OK — 11 corpus file(s) scanned, 0 unsanctioned second derivations, 2 sanctioned hit(s) matched SANCTIONED_VERDICT_SITES · (b) OK — SELF_SKIPPED audit table folds to verdict=WARN (!= PASS), row-derived off 1 non-INFO row(s) — VRD-SKIP closed |
| 11 | Phase-order re-derive (declared half, checkOrderGuaranteesCited) | vacuous | no when:"pre_write" checks — vacuously nothing to cite — G-3 completeness half stays open |
| 12 | Truthful crash posture (R-B reachability, static + R-M before-image) | enforced-green | R-B (checkInterruptedPostureTruthful): recovery.interrupted="none" — no reachability claim to verify · R-M: prose-only (R-M/LG-17 describe not scoped to this step (no before-image target)) |
| 13 | A step validates itself | enforced-green | this run of step:validate IS the mechanism |
| P3 | I/O cost adjudication (measured, not gated) | prose-only | descriptor=31148B notes=2182B checks=8 rows records_meta=2819B (newest post/ capture) |

**Enforced-green: 12/14** · not-run: 0 · vacuous: 1


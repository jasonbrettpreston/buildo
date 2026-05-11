# Active Review Follow-ups (Consolidated)
_Generated following the Pipeline Clean-up Mandate. Trimmed 2026-05-05 — full prose history of resolved batches recoverable via `git log -p docs/reports/review_followups.md`._

---

## WF3 #realtor-backfill (2026-05-11) — Multi-Agent Review deferrals
_Source: Gemini + DeepSeek + worktree code-reviewer of `scripts/backfill-realtor-permit-trades.js` and 11 supporting files. Three reviewers caught 5 issues fixed in-loop; remaining items are catalogued here._

**Applied in this commit (R9 in-loop fixes):**
- ✅ **Worktree BUG 1** — `emitMeta` writes list dropped `phase` + `lead_score` (Finding 1 omits them from the INSERT so the schema defaults propagate; claiming we write them was inaccurate data lineage)
- ✅ **Worktree BUG 2** — `emitMeta` reads list now includes `permit_type_classifications` + extended `permits` columns (`permit_type`, `scope_tags`) to reflect Finding 4's JOIN
- ✅ **Gemini CRITICAL** — Spec 47 §R5 startup guards added on `ACTIVE_STATUSES` and `REALTOR_RELEVANT_TYPES` (empty array in `ANY()` predicate would silently match nothing and produce a 0-row backfill reporting "success")
- ✅ **Worktree Nit 2** — file-level header docstring lock-id updated from "91" to "114" (Finding 3 alignment)
- ✅ **Gemini LOW** — `realtorRelevantTypes = Array.from(...)` hoisted out of the while loop body (recomputed every iteration was sloppy)

**Rejected:**
- **Gemini HIGH "permit_products table"** — false positive. There is no `permit_products` table in the schema; the reviewer hallucinated a table from the related `permit_trades` name. The script's INSERT into `permit_trades` is the complete contract per Spec 91 §3.5 item 4.

**Deferred — Spec 47 conformance:**

| Severity | Item | Rationale |
|---|---|---|
| MED (worktree + Gemini agree) | §R3.5 RUN_AT captured AFTER `withAdvisoryLock` rather than before, contrary to the §6.1 skeleton. | Functional impact: nil. The callback only runs on lock-acquired; the RUN_AT-after-acquired pattern is semantically equivalent to RUN_AT-on-invocation for this script's use (the only DB write tagged with RUN_AT is the per-batch `classified_at`, which represents work-actually-done timestamp anyway). The literal-spec violation is a positional concern, not a correctness one. Defer to next-touch cleanup. |
| LOW (Gemini) | Lock ID 114 deviates from Spec §5.2's "lock = owning spec number" (owning spec is 91). | Already documented in script comment + WF1 #B precedent (compute-phase-calibration took 93 instead of owning-spec 84). The deviation points to a systemic spec-gap that should be addressed by clarifying §5.2 to acknowledge "free-ID assignment when owning-spec slot taken by another script." Defer to a Spec 47 amendment WF2. |
| NIT (Gemini) | NOT EXISTS + ON CONFLICT both present; reviewer notes potential reader confusion. | Both serve different purposes — NOT EXISTS makes batching efficient (the LIMIT only fetches uninserted rows), ON CONFLICT is a race-condition safety net between batches. Comment in the code already explains this. Defer. |

**Deferred — DeepSeek drift concerns:**

| Severity | Item | Rationale |
|---|---|---|
| HIGH | `ACTIVE_STATUSES` hardcoded literal not imported from `src/lib/quality/metrics.ts:473` (canonical source). | Real drift risk. The R9 §R5 startup guard catches the empty-array case but not the "wrong-values" case. Fix: extract `ACTIVE_STATUSES` to `scripts/lib/active-statuses.js` JS mirror with a parity test against the TS source. Defer to a follow-up WF3 that touches the canonical filter — bundling here would expand scope into the TS dual-path. |
| HIGH | `REALTOR_RELEVANT_TYPES` imported from JS mirror; drift between JS and TS sets unchecked at runtime. | Already regression-locked by `src/tests/permit-type-class.logic.test.ts` — drift between JS and TS sets fails CI. The reviewer's concern was that this lock isn't visible from the backfill script; the comment now points at the mirror file but the test coverage is real. Defer. |
| MED | `totalActivePermits` snapshot at startup races against concurrent classify-permits writes. | False-WARN/false-PASS risk on coverage comparison is real but small (the window is the few seconds between the count query and the final emitSummary, and the discrepancy at scale would be tens of rows out of ~95K — invisible at the verdict threshold). Defer; not worth the SQL complexity of a re-count. |
| MED | Hardcoded `tier=1, confidence=1.0` not documented + not compared against classify-permits' realtor write. | Realtor rows have no signal-derived tier or confidence (every eligible permit gets the row regardless of permit content); 1.0 is the canonical "no signal" / "tier-1 default" value. Defer adding a comment to next-touch. |
| LOW | No cleanup of stale realtor rows when a permit transitions out of the eligible set. | Already filed as Observation #6 below. |

**Deferred — Observations from R6 live verify (not from review):**

| # | Item | Rationale |
|---|---|---|
| #5 | Script's `emitSummary` uses `records_meta.backfill` shape instead of Spec 47 §R10's mandated `records_meta.audit_table`. Admin UI tile renders UNKNOWN verdict for this step. | Non-blocking telemetry. The script ran successfully and produced correct data; only the admin observability tile is cosmetically wrong. WF candidate for cleanup. |
| #6 | ~150K realtor rows exist for permits no longer in the 3-axis-eligible set (219K total - 68K eligible). These accumulated from the classify-permits live path over weeks where the gate was looser (pre-WF3 `779ec88`) + permits that transitioned from active to closed. | Design question — does Spec 91 §3.5 item 4 require pruning, or is "every CURRENT-eligible permit has a row, plus some historical residue" acceptable? Stale rows don't break the realtor feed (the feed query joins on `permits.status = ANY(ACTIVE_STATUSES)` so closed permits are filtered out at read time). File as a Spec 91 §3.5 amendment WF that explicitly resolves the question. |

---

## WF1 #B (2026-05-09) — Multi-Agent Review deferrals from lifecycle timeline data layer
_Source: Gemini review of `compute-phase-calibration.js` + DeepSeek review of `build-lifecycle-timeline.ts` + worktree code-reviewer of full diff. Three reviewers; four BUGs applied this commit, several DEFERrals catalogued below._

**Applied this commit:**
- ✅ §R3.5 RUN_AT capture via `pipeline.getDbTimestamp` + parameter-bound `computed_at` (Gemini CRIT + worktree BUG 1) — eliminates inconsistent timestamps across recompute runs spanning a midnight boundary
- ✅ `ROUND(PERCENTILE_CONT)` before `::INTEGER` cast on all three percentiles (Gemini CRIT) — eliminates systematic downward truncation bias on every cohort metric (e.g. true median 10.9d was being stored as 10d)
- ✅ `records_total = SUM(sample_size)` (source rows evaluated) instead of `inserted` (164 buckets written) (Gemini HIGH) — `sys_velocity_rows_sec` now reports a meaningful 119k rows/sec instead of nonsensical 178 buckets/sec
- ✅ `audit_table.phase = 84` (was `21.5`) — integer convention to match other audit_table entries
- ✅ `Math.max(0, …)` clamp on `daysBetween` to prevent negative "days in phase" from clock skew or future-dated `phaseStartedAt` (DeepSeek MED)

**Rejected:**
- Worktree BUG 2 + Gemini HIGH "Lock 93 should be lock 84 per Spec 47 §5.2 (lock = owning spec)." Both reviewers missed the project's stricter Bundle G global-uniqueness invariant in `pipeline-advisory-lock.infra.test.ts:147–164`. Lock 84 is owned by `classify-lifecycle-phase.js` (the ledger writer this script consumes); the registry assigned 93 as the free ID. Updated the script docstring to explain this.
- Gemini LOW "Replace `.passthrough()` with `.strict()` on the logicVars Zod schema." `loadMarketplaceConfigs` returns the entire shared 107-key marketplace bag; `.strict()` would reject every key this script doesn't consume. `.passthrough()` is the project's established pattern for shared-config scripts. The "silent typo" risk Gemini cites is real but mitigated by the per-key required-field semantics in the schema.

**`compute-phase-calibration.js` — Gemini deferrals (3 remaining findings):**

| Severity | Item | Rationale |
|---|---|---|
| MEDIUM | N+1 `INSERT` inside a `for` loop (164 round-trips) — Spec 47 §7.6 prefers single multi-row INSERT. | The table is bounded at ~165 rows total; each run is a full DELETE+INSERT inside one transaction (~50ms). A multi-row INSERT would be 1ms faster. Not blocking; defer if/when the bucket count grows >1000. |
| MEDIUM | `audit_table` is missing `Calibration`-script-type metrics like `phase_pairs_computed`, `pairs_above_threshold`, `negative_gap_count` per Spec 47 §8.2. | Inspect Spec 47 §8.2 — those metrics are documented for transition-pair calibration scripts (compute-timing-calibration-v2.js semantic), not phase-stay calibration. The four metrics emitted (`total_buckets`, `permit_types_calibrated`, `phases_calibrated`, `unreliable_buckets`) cover the calibration-health questions an operator actually asks of this script. Defer permanently — different audit shape for a different calibration archetype. |
| LOW | `phase_stay_calibration.computed_at` has `DEFAULT NOW()` column default; combined with §R3.5 RUN_AT the default is now redundant + a foot-gun if a future maintainer omits the column from an INSERT. | Cosmetic + future-proofing. WF2 candidate to drop the default in a follow-up migration. Defer. |

**`build-lifecycle-timeline.ts` — DeepSeek deferrals (4 remaining findings):**

| Severity | Item | Rationale |
|---|---|---|
| HIGH | A completed entry can have `exited_at: null` when the last transition's `to_phase` is not the current phase (i.e., the transition list and `currentPhase` are inconsistent). | Defensive guard against an upstream invariant violation that should never happen — the ledger always writes the entry-into-current-phase transition at step 21. If it ever did happen, the panel would render a "completed" entry with no exit timestamp, which is confusing but not corrupting. WF3 candidate to add an explicit invariant assertion + WARN log. Defer. |
| HIGH | No validation that the transition list ends with a transition into `currentPhase`. Same root cause as above. | Same defer rationale. |
| MEDIUM | `remainingPhases` may misbehave for a `currentPhase` not in the canonical path. | Already returns `[]` for unknown / off-path phases — the failure mode is a missing upcoming list, not a crash. Cosmetic. Defer. |
| LOW | DST sensitivity from `MS_PER_DAY = 86_400_000` — spring-forward / fall-back days are 23h / 25h. | At most 1-day error per phase transition; cohort medians smooth this out. Defer permanently. |

**Worktree code-reviewer — inherited limitations (catalogued, not fixed):**

| Severity | Item | Rationale |
|---|---|---|
| INHERITED-BUG | Spec 84 bug 84-W11 — `classify-lifecycle-phase.js` writes unprefixed `P3/P4/P5` for permit intake instead of the spec'd `INTAKE_P3/P4/P5`. The new `STANDARD_PHASE_PATH_BY_PERMIT_TYPE` and the new live-DB test assertion `phase_name === 'CoA Approved'` for a building permit at phase `P3` both reflect this — building permits never go through CoA, so showing "CoA Approved" as a completed phase in the inspector is technically a UX bug. | The data layer cannot fix the labeling without first fixing the ledger writer (out of scope for WF1 #B). The new code documents the limitation in `phase-progression.ts` lines 8–14. WF3 candidate against bug 84-W11 — must be done before any user-visible release of the inspector lifecycle panel. |
| DEFER | Spec 86 §4 chain-step table not updated with the new `compute_phase_calibration` row. | The script's `SPEC LINK` header and migration comment both reference `chain step 21.5`, but Spec 86 §4 was not amended this commit (separate spec-amendment WF). Will be picked up by the next Spec 86 housekeeping pass. Defer. |

**Spec amendment followup (carry-forward):**
- Cycle 7 (Spec 91 §3.5 CoA wire-up) — file as next WF after this ships, per user direction in plan-lock

---

## WF2 #C (2026-05-09) — Multi-Agent Review deferrals from massing area backfill commit
_Source: Gemini review of `load-massing.js` + DeepSeek review of `mig 122` + worktree code-reviewer of full diff. Worktree found 1 real CRITICAL fix (applied this commit). Gemini + DeepSeek findings are mostly pre-existing structural concerns + a few legitimate enhancements; bundling them in this WF2 #C would explode the blast radius._

**Applied this commit (worktree BUG-2, conf 92 — real concurrency window):**
- ✅ Removed `footprint_area_sqm = EXCLUDED.footprint_area_sqm` and `footprint_area_sqft = EXCLUDED.footprint_area_sqft` from the `INSERT ... ON CONFLICT DO UPDATE SET` clause in `load-massing.js`. Also removed `footprint_area_sqm IS DISTINCT FROM EXCLUDED.footprint_area_sqm` from the WHERE guard. Without this fix, every quarterly re-load would NULL-overwrite the entire 427K-row column and create a window for `compute-cost-estimates.js` (lock 83, independent of lock 56) to read NULLs and silently fall back to lot-size GFA. The post-INSERT UPDATE pass is now sole authority for the area columns. Regression-locked by 2 new assertions in `load-massing.infra.test.ts`.

**Rejected:**
- Worktree BUG-1 (conf 100) "Migration 122 + 3 test files do not exist on disk." Misinformed — the worktree agent runs against the `779ec88` snapshot in an isolated git checkout; my new files exist in the main worktree (uncommitted) and were verified by 5106 vitest tests passing + the live mig 122 application + 218,996-row cost_estimates rewrite. The pre-commit Husky gate proves files exist.

**`scripts/load-massing.js` — Gemini deferrals (11 findings, mostly pre-existing):**

| Severity | Item | Rationale |
|---|---|---|
| CRITICAL | Unconditional `ST_SetSRID(... 3857)` assumption — if a future shapefile arrives in WGS84, area will be wildly wrong. | Pre-WF2 #C the data was always nulled; post-WF2 #C the pipeline always assumes 3857 (verified empirically — current 427K rows are EPSG:3857). Filename `3dmassingshapefile_2025_wgs84.zip` is misleading; the actual content is Web Mercator. WF candidate: read the `.prj` sidecar file at load-time to detect projection AND parameterize the SQL accordingly. Defer. |
| CRITICAL | "Peek-and-delete" stale-row pattern reads only the first feature to decide ID format for entire dataset; could wipe production. | Pre-existing across all source-loader scripts. Architectural change requiring staging-table strategy. WF1/WF2 candidate. Defer. |
| HIGH | `extractRing` only handles first polygon of MultiPolygon — silent data loss for building complexes. | Pre-existing. WF3 candidate to iterate all polygons + create compound source_id. Defer. |
| HIGH | Hash-based `source_id` uses non-canonical `JSON.stringify` — could produce different hashes on identical geometries. | Pre-existing. Replace with `canonical-json` lib. Defer. |
| HIGH | `.shp` finder only looks one level deep + uses `find` (first match wins). | Pre-existing. Use `glob` for recursive search + multi-match error. Defer. |
| MEDIUM | `computeCentroid` is arithmetic mean of vertices, not true centroid; can fall outside polygon. | Pre-existing. Move to PostGIS `ST_Centroid` in the post-INSERT pass. Defer. |
| MEDIUM | `execSync('unzip', 'powershell')` — non-portable. | Pre-existing. Use `yauzl`/`unzipper` lib. Defer. |
| MEDIUM | `downloadFile` redirect handling has no depth limit. | Pre-existing. Add depth counter. Defer. |
| MEDIUM | `processed < 400000` is hardcoded magic threshold. | Pre-existing. Make dynamic (95% of last run). Defer. |
| LOW | `shoelaceArea` is now dead code. | Introduced as dead by WF2 #C. Cleanup follow-up. Defer. |
| LOW | `SQM_TO_SQFT` constant unused. | Same — dead post-WF2-#C. Cleanup follow-up. Defer. |
| LOW | MD5 hash truncated to 12 chars (48-bit collision risk). | Pre-existing. Use full digest. Defer. |
| NIT | Progress reporting brittle on chunk boundaries. | Pre-existing. Defer. |

**`migrations/122_*.sql` — DeepSeek deferrals (5 findings):**

| Severity | Item | Rationale |
|---|---|---|
| CRITICAL | Invalid GeoJSON would abort the migration (no try/catch around `ST_GeomFromGeoJSON`). | All 427K rows verified `Polygon` type at WF2 #C planning; live mig 122 application succeeded in 114.9s. Defensive PL/pgSQL wrapping is a future hardening — not blocking. WF candidate. |
| HIGH | Hardcoded EPSG:3857 with no verification (same as Gemini CRITICAL). | Same defer rationale. |
| HIGH | "Destructive DOWN with no safety net." | By design per Rule 6 (commit 8b1c10b precedent — mig 119 + 121 use the same convention). The DOWN comment explicitly warns the operator. Defer permanently. |
| MEDIUM | Duplicated SQL between mig 122 and load-massing.js post-INSERT UPDATE — DRY violation. | Fair point. Extract to a `CREATE FUNCTION compute_footprint_area_sqm(geom JSONB)` shared SQL helper. WF candidate. |
| LOW | `::geography` cast after `ST_Transform(... 4326)` is redundant — could use `geom::geography` directly. | Functional equivalence; current form is more explicit about the projection chain. Defer. |
| NIT | Doc reference `Spec 56 §2` doesn't match actual heading (the spec uses `## 2.` not `§2`). | Cosmetic. Defer. |

**Worktree deferred nits:**
| Severity | Item | Rationale |
|---|---|---|
| DEFER (worktree, conf 88) | `isProjected` variable is declared but never used after WF2 #C — true dead code. | Cleanup follow-up. Defer. |
| DEFER (worktree, conf 88) | `shoelaceArea` function is now unused. | Same as Gemini LOW. Defer. |
| DEFER (worktree, conf 85) | `SQM_TO_SQFT` constant unused. | Same as Gemini LOW. Defer. |
| DEFER (worktree, conf 82) | Double `ST_Area` call in mig 122 + post-INSERT UPDATE — no CSE. CTE-based version would compute once. | Perf nit; 114.9s for 427K rows means current form is acceptable. Defer. |

---

## WF3 (2026-05-09) — Multi-Agent Review deferrals from realtor sub-gating commit
_Source: Gemini review of `classify-permits.js` + DeepSeek review of `classifier.ts` + worktree code-reviewer of full diff. Worktree review found 1 important fix (applied this commit). Gemini + DeepSeek findings are ALL pre-existing structural issues unrelated to the realtor sub-gating fix — bundling them in this WF3 would explode the blast radius. Each is a separate WF candidate._

**Applied this commit (worktree IMPORTANT #1, conf 82):**
- ✅ Spec 80 §5 corrected — replaced "DELETE+INSERT pattern" with "UPSERT + ghost-DELETE pattern" (the actual `classify-permits.js` mechanism: `INSERT ... ON CONFLICT DO UPDATE` followed by a targeted ghost-DELETE in a separate `withTransaction`).

**Worktree deferred nits:**
| Severity | Item | Rationale |
|---|---|---|
| NIT (worktree, conf 50) | DB test fixture doesn't cover "Non-Residential Building Permit" — covered by logic test only. | Logic test covers it; DB fixture covers the 4 primary audit-identified categories (PLB, MS, DM, commercial-scope). Defer. |
| NIT (worktree, conf 40) | TS uses `scopeTags?.includes()` (optional chaining); JS uses `Array.isArray() && .includes()`. Cosmetic divergence. | Parity test regression-locks behavioral equivalence. Defer. |
| NIT (worktree, conf 45) | `realtor-gating.db.test.ts` `afterAll` calls `pool.end()` — pre-existing pattern across all 3 db.test.ts files. | Not introduced by WF3; check `setup-testcontainer.ts` semantics if pattern surfaces flaky tests. |

**`scripts/classify-permits.js` — Gemini deferrals (9 findings, ALL pre-existing):**
| Severity | Item | Rationale |
|---|---|---|
| CRITICAL | `classifyPermit` only processes Tier 1 rules — Tier 2/3 DB rules silently discarded. The tag-trade matrix is hardcoded; DB-driven Tier 2/3 rules never run. | Pre-existing architectural choice. Tier 2 = hardcoded matrix in code; Tier 3 = dead code. Treat as a major refactor WF (move tag matrix to DB OR remove dead Tier 3 path). Not bundled here. |
| HIGH | Phase determination uses `* 30` for month math — drifts at 3/9/18-month boundaries. | Pre-existing. Use `date-fns differenceInMonths` or day-based thresholds. WF3 candidate. |
| HIGH | Ghost-trade cleanup uses multiple `unnest`-in-`IN`/`NOT EXISTS` clauses — Postgres planner anti-pattern. | Pre-existing. Replace with `DELETE WHERE (permit_num, revision_num) IN (...)` + `INSERT ON CONFLICT`. WF3 candidate. |
| HIGH | `extractPermitCode` regex requires preceding space — fails on `24-12345-BLD` format. | Pre-existing. Loosen regex to `[-\s]` delimiter. WF3 candidate. |
| MEDIUM | `statusBaseScore` uses `s.includes()` — "Application for Revocation" matches `'application'` (20) instead of `'revocation'` (5). | Pre-existing. Order checks most-specific first OR use `\b` word boundaries. WF3 candidate. |
| MEDIUM | Work-field fallback assigned `tier: 1` — same precedence as direct rule match. | Pre-existing. Should be tier 3+. Defer. |
| MEDIUM | Hardcoded `TRADES`/`TAG_TRADE_MATRIX`/`WORK_TRADE_FALLBACK` (line 42 admits "to avoid module resolution issues") — TS↔JS divergence risk. | Pre-existing architectural debt. WF1/WF2 candidate to centralize as JSON or shared lib. |
| LOW | `try/catch` in Tier 3 regex match fails silently — invalid DB regex falls back to `includes()` without warning. | Pre-existing. Add `pipeline.log.warn` on regex compile failure. Defer. |
| NIT × 2 | Tier precedence in merge logic; duplicated `days` calc in `calculateLeadScore`. | Pre-existing. Defer. |

**`src/lib/classification/classifier.ts` — DeepSeek deferrals (7 findings; 1 misinformed; 6 pre-existing):**
| Severity | Item | Rationale |
|---|---|---|
| (rejected as misinformed) | DeepSeek CRITICAL "`permitClass` defaults to `UNCLASSIFIED` silently empties output" | This is the **intended safe-skip default per Spec 80 §5** (WF2 #2 design). Defaulting to `'construction'` would silently over-classify unknown permits. Documented in JSDoc + Spec 80 §5. Defer permanently. |
| HIGH | Dead `tier === 3` branch in `fieldMatches` executes user-supplied pattern as regex — ReDoS risk if a malicious admin pattern is inserted. | Pre-existing dead code (Tier 3 rules never reach this surface per Gemini's pre-existing finding above). Remove the dead branch. WF3 candidate. |
| MEDIUM | `WORK_SCOPE_EXCLUSIONS` undocumented in spec — silent filter for `Fire Alarm`/`Sprinklers`/`Interior Alterations`. | Pre-existing. Document in Spec 80 OR remove. Defer. |
| MEDIUM | `REALTOR_TRADE_ID = 33` hardcoded — risk if mig 118 row is ever renumbered. | Pre-existing. The constant matches mig 118's seed; renumbering is a breaking change requiring its own migration. Defer (matches the `REALTOR_TRADE_ID_JS` constant on the JS side). |
| LOW × 2 | Redundant `'i'` flag on already-lowercased `fieldValue`; `getFieldValue` indexed-property prototype-pollution risk. | Pre-existing micro-issues. Defer. |
| NIT × 2 | `applyClassGating` could be reordered for filter symmetry; `TradeMatch` factory duplication. | Pre-existing. Defer. |

---

## WF3 (2026-05-09) — Realtor sub-gating: Option B deferred (DB-driven `realtor_eligible` column)

| Severity | Source | Item | Why deferred |
|---|---|---|---|
| LOW (future enhancement) | WF3 realtor sub-gating commit `<pending>` | **Make `REALTOR_RELEVANT_TYPES` operator-tunable via `permit_type_classifications.realtor_eligible BOOLEAN`.** Today the residential-types list is a code constant mirrored TS↔JS. If the residential type list churns (e.g., a new permit_type emerges or the policy contract changes), the change requires a code deploy. Per Spec 86 §1 the project pattern for taxonomies-with-policy is a DB column + admin Control Panel surface. Migration adds the column with a backfill of `TRUE` for the 5 currently-relevant types and `FALSE` for the rest; classifier loads via `loadPermitTypeClassMap` (already loaded once at startup); admin UI reuses the existing GlobalConfigCard pattern. | Future WF — not blocked by anything. Raise priority only when a 6th residential type emerges or operator-side experimentation is needed. |

---

## WF3 (2026-05-08) — Multi-Agent Review deferrals from neighbourhoods FK-join repair commit
_Source: Gemini review of `compute-cost-estimates.js` + DeepSeek review of `get-lead-feed.ts` + worktree code-reviewer of full diff. ALL findings below are pre-existing structural issues unrelated to the wrong-join fix; bundling into the WF3 would have exploded blast radius beyond the surgical correction. Each is a meaningful separate WF._

**Applied this commit (worktree review FAILs in the new Layer 2 test):**
- ✅ Item 8 (worktree, conf 82) — replaced misleading `expect(aSerialId).not.toBe(bSerialId)` with a meaningful `SELECT neighbourhood_id WHERE id = bSerialId` re-query that catches a future regression where the seed's overlap construction breaks. Test description corrected to `B.neighbourhood_id (city PK) equals A.id (SERIAL)`.
- ✅ Item 14 (worktree, conf 88) — removed dead `B_CITY_ID = 999802` constant.

### `scripts/compute-cost-estimates.js` — Gemini review deferrals (8 findings, ALL pre-existing)

| Severity | Item | Why deferred |
|---|---|---|
| CRITICAL | **Spec 83 §8 mandates "pinned client" advisory lock pattern, not the SDK helper.** Project-wide convention is `pipeline.withAdvisoryLock` (matches every other pipeline script). The spec-vs-code gap is the spec, not the code. | Spec 83 §8 amendment to allow the SDK helper (or the project chooses to revert to per-script pinned client). Gemini doesn't have spec-evolution context. |
| HIGH | **`trade_contract_values::text IS DISTINCT FROM` perf** at IS DISTINCT FROM WAL guard. Forces JSONB serialization per row; defeats GIN. | WF3 — switch to JSONB containment (`@>`/`<@`) once we have a perf benchmark on the bulk UPSERT. |
| HIGH | **LATERAL parcel `ORDER BY parcel_id ASC LIMIT 1`** is non-deterministic on a permit that spans multiple parcels — picks the lowest-id parcel which may be a sliver. | WF3 — define the canonical primary-parcel choice (likely `lot_size_sqm DESC` or `is_primary` flag); pre-existing across `compute-cost-estimates.js` AND `lead-inspect-query.ts` AND `lead-detail-query.ts`. Bundle. |
| HIGH | **`scopeMatrix` key built without `.trim()`** — Spec 83 §3 explicitly requires `.toLowerCase().trim()`; trailing whitespace in DB rows would silently fall through to matrix-miss → full-GFA fallback (the very inflation pattern WF2 #3 just gated). | WF3 — one-line `.trim()` add at scopeMatrix build. |
| MEDIUM | **`data_quality_snapshots` UPDATE assumes the row exists** (created later in the chain by `refresh-snapshot.js`). Brittle if chain order changes. | WF3 — switch to `INSERT ... ON CONFLICT (snapshot_date) DO UPDATE`. |
| MEDIUM | **SOURCE_SQL complexity** (9 tables × multiple LATERAL subqueries) — performance liability as data grows. | Defer indefinitely; pre-materialize aggregations only after `EXPLAIN ANALYZE` shows real degradation. |
| LOW | **`BULK_COLUMN_COUNT = 15` manually maintained** — adding a column to the INSERT without updating the constant breaks `BATCH_SIZE`. | WF3 — derive from a column-list array. |
| NIT | **`batch.length = 0` micro-optimization** — readability tradeoff; `batch = []` is more idiomatic. | DEFER permanently — style preference. |

### `src/features/leads/lib/get-lead-feed.ts` — DeepSeek review deferrals (9 findings, ALL pre-existing)

| Severity | Item | Why deferred |
|---|---|---|
| HIGH | **`clampedLimit = NaN` when `input.limit` undefined** — `Math.max(1, undefined) → NaN`; `LIMIT $5::int` then errors at PG. Breaks the entire feed for any request without explicit `limit`. | WF3 — add `?? DEFAULT_FEED_LIMIT` before clamp. Check whether route-handler validation already prevents undefined from reaching this code. |
| HIGH | **`clampedKm = NaN` when `input.radius_km` undefined** — `ST_DWithin` with NaN meters silently returns false → empty feed. | WF3 — bundle with the limit fix. |
| HIGH | **`builder_candidates` `LEFT JOIN wsib_per_entity` filtered by `WHERE w.business_size IS NOT NULL`** acts as INNER JOIN — silently drops 30-50% of builder leads (new contractors, GTA-condition failures). Pre-existing performance optimization that introduced a regression. | WF3 — remove the WHERE; UI handles NULL business_size. Verify against Spec 91 §4.3 builder-display contract. |
| MEDIUM | **Cursor pagination NULL CASE** — malformed cursor with NULL lead_id → empty page → client thinks feed is exhausted. | WF3 — COALESCE the CASE or validate cursor in route handler. |
| MEDIUM | **`competition_count` not trade-scoped** — counts saves across all trades; same user counted multiple times if they saved the same permit for different trades. | WF3 — add `AND lv2.trade_slug = $1` to the subquery. Verify Spec 91 expectation. |
| MEDIUM | **`proximity_score` CASE re-evaluates `geography <->` 8× per row** — wasteful for 30-row feed; expensive for builder CTE aggregate. | WF3 — compute distance once in subquery, reference column in CASE. |
| LOW | **lead_views LEFT JOIN redundant decomposed-column predicates** — claim is index-selectivity but actual index is `(user_id, lead_key)` only. | DEFER — verify against `EXPLAIN ANALYZE`; remove predicates if no `(user_id, permit_num, revision_num)` index exists. |
| LOW | **`avg_project_cost` / `value_score` repeat the same `AVG(COALESCE(...))` expression three times** — DB doesn't cross-aggregate-position-optimize CSE. | DEFER — perf optimization; only matters at high load. |
| NIT | Cursor `$6::int IS NULL` and `$8` cast — defensive coding around malformed cursors. | DEFER permanently. |

---

## WF2 (2026-05-08) — Resolved: live-DB harness already existed; lead-inspect adopted it
_Resolution commit: `<pending>` (test added at `src/tests/db/lead-inspect-query.db.test.ts`)._

The original WF3 commit `73f3ae6` deferral said "no live-DB infra test exists" — that was wrong. The harness exists at `src/tests/db/setup-testcontainer.ts` (`getTestPool()` + `dbAvailable()` helpers + `*.db.test.ts` convention with 5 prior adopters). The actual gap was that WF2 #4 didn't add an inspector adopter. Fixed in this WF2.

**Surfaced during the test work — files for follow-up:**

| Severity | Source | Item | Planned Home |
|---|---|---|---|
| ✅ RESOLVED | WF3 commit `<pending>` | **4 production code paths join `neighbourhoods` against the wrong column** — fixed in this WF3. All 4 sites (`get-lead-feed.ts`, `compute-cost-estimates.js`, `market-metrics/queries.ts ×2`) now use the FK-correct `n.id = p.neighbourhood_id` per migration 109. Spec 57 §2 amended to clarify `id SERIAL` is the PK and `neighbourhood_id INTEGER UNIQUE` is the natural city key. Regression-locked by `neighbourhoods-fk-join.infra.test.ts` (Layer 1) + `neighbourhoods-fk-join.db.test.ts` (Layer 2 live-DB). Multi-Agent Review run. **Operator runbook step (post-merge):** re-run `node scripts/compute-cost-estimates.js` to rewrite `cost_estimates` rows whose `premium_factor` / `estimated_cost` change under the corrected join (~237K rows; the `IS DISTINCT FROM` UPSERT guard limits WAL writes to actually-changed rows). |
| MEDIUM | WF2 live-DB test (this commit) | **Other admin read-path endpoints have no live-DB regression-lock.** Now that `lead-inspect-query.db.test.ts` proves the pattern, other admin SQL surfaces (lead-feed health, flight-board detail, market-metrics) should follow. Each new live-DB test averages ~120 LoC of fixture seeding + a handful of assertions. | WF1/WF2 (separate) — incremental; not all need to ship at once. Highest-priority next adopters: `compute-cost-estimates.db.test.ts` (would catch the HIGH above), then admin lead-feed health endpoint. |

---

## WF2 #3 (2026-05-08) — Multi-Agent Review deferrals
_Source: Gemini + DeepSeek + worktree code-reviewer review of `cost-model-shared.js` + `compute-cost-estimates.js` for the `permit_type_class` cost-model gating commit._

**Applied this commit:** Gemini MEDIUM (Brain line 548) — short-circuit now computes `premium_factor` via `computePremiumFactor(...)` for telemetry consistency with `complexity_score`.

| Severity | Source | Item | Planned Home |
|---|---|---|---|
| HIGH | Gemini WF2 #3 review | **Falsy-`0` in `computeGfa` `(row.storeys || 1)`** at `src/features/leads/lib/cost-model-shared.js:188`. A permit correctly listing 0 storeys (e.g., foundation-only) gets defaulted to 1 — inflates GFA. Pre-existing, not introduced by WF2 #3. **Fix:** swap `||` → `??`. | WF3 — same change in `(row.estimated_stories ?? row.storeys ?? 1)`. Bundle with the next two HIGHs (all share the same falsy-`0` root cause). |
| HIGH | Gemini WF2 #3 review | **Falsy-`0` in `computeEffectiveArea` `pct > 0` gate** at `src/features/leads/lib/cost-model-shared.js:227`. A `gfa_allocation_percentage = 0` row in `scope_intensity_matrix` (valid configuration meaning "no construction area") falls through to the matrix-miss branch and defaults to 1.0 (full GFA). Same pattern as the storeys bug — could grossly inflate cost for a minor permit on a large structure. Pre-existing. **Fix:** change to `if (pct !== undefined)` so `pct === 0` short-circuits correctly. | WF3 — bundle with the storeys fix; both share the same root cause. |
| MEDIUM | Gemini WF2 #3 review | **Falsy-`0` in `computeTradeValue` `complexity_factor \|\| 1.0`** at `src/features/leads/lib/cost-model-shared.js:286`. Operator-set `0` is silently overridden to 1.0. Pre-existing. **Fix:** `??` instead of `\|\|`. | WF3 — bundle with the two HIGHs above (one commit covers all three falsy-`0` cases). |
| LOW | Gemini WF2 #3 review | **Proportional slicing rounding error** at `src/features/leads/lib/cost-model-shared.js:393`. Sum of `Math.round(weight * reportedCost)` per trade may not equal `reportedCost` (off-by-pennies for many trades). Pre-existing. **Fix:** remainder distribution OR document in JSDoc. | WF3 — low priority; document in JSDoc as the simpler fix. |
| LOW | Gemini WF2 #3 review | **Brittle `includes()` keyword detection** at `isShellPermit` / `isCommercial` (`cost-model-shared.js:151–164`). False positives on substrings (e.g., "nutshell-shaped roof", "Commercial Electric Inc."). Pre-existing. **Fix:** word-boundary regex `\bshell\b` / `\bcommercial\b`. | WF3 — low priority; needs a regression-test fixture to confirm no false negatives on tokenized permit types. |
| NIT | Gemini WF2 #3 review | **Magic numbers in `computeComplexityScore`** at `cost-model-shared.js:421–425` (`stories > 6`, `units > 4`, `footprint > 300`, `income > 150000`). Pre-existing. **Fix:** module-level named constants (`HIGH_RISE_STORY_THRESHOLD = 6` etc.). | WF3 — nit; pair with the Spec 81 score-distribution work if/when those thresholds become operator-tunable. |
| DEFER | Worktree code-reviewer (conf 35) | **Shape asymmetry: `_permitTypeClassSkipped` not on normal-path return.** Construction return object has 14 fields; non-construction has 16 (`_permitTypeClassSkipped: true` + the always-present `_liarsGateOverride/_zeroTotalBypass/_usedFallback`). Muscle truthiness check handles the asymmetry, but a future destructuring consumer would see `undefined`. **Fix:** add `_permitTypeClassSkipped: false` to the normal return + document the four `_` flags in the `CostEstimate` JSDoc. | WF3 — housekeeping. |
| DEFER | Worktree code-reviewer (conf 40) | **`modelCoveragePct` denominator includes `permit_type_class_skipped` permits.** Skipped permits emit `estimated_cost: null` so they're counted as `nullEstimates`, dragging coverage. Live `--limit=2000` showed verdict=WARN with 68.8% coverage (3.85% skipped — but the 2K sample over-represented stale non-construction permits). After full run, structural floor is ~95.5% (the construction tail per Spec 80 §5). **Fix:** either (a) lower `cost_model_coverage_warn_pct` from 80 to ~90, OR (b) compute a separate `construction_model_coverage_pct` that excludes skipped permits from the denominator. Option (b) is cleaner; the existing metric is meaningful only for construction-class permits anyway. | WF3 — observability calibration. |

**Reviews rejected as misinformed:**
- DeepSeek HIGH "`xmax=0` cannot distinguish insert/update" — actually works (existing pattern; live run reported 62 updates correctly).
- DeepSeek MEDIUM "loadMarketplaceConfigs outside lock" — review missed that the calls ARE inside the `withAdvisoryLock` callback (compute-cost-estimates.js:202–227).
- DeepSeek MEDIUM "pipeline.run + withAdvisoryLock nesting risk" — canonical SDK pattern; `pipeline.run` doesn't acquire its own lock.
- DeepSeek NIT "Brain default to construction on missing field" — inverted concern; current code defaults to safe-skip (more conservative than the proposed fix).

---

## 🔴 Maestro-First — Frontend Candidates (pull only on observed symptoms)

**Pivot 2026-05-05:** session-end decision was to abandon speculative pre-Maestro patches (the FC1+FC2+FC3 batch I attempted at commit `3709025`, reverted via `2ccb8c0`). The right signal is running Maestro against the current architecture and fixing only what genuinely manifests. The candidates below remain open, scoped, and ready to pull from when matching symptoms appear in Maestro logs — but DO NOT pre-emptively patch.

**FC1 was reframed and closed** as a spec amendment, not a code change: §9.24 was originally a doc-only rule that mandated re-read-before-rollback in `usePatchProfile.ts:onError`, creating an immediate spec-vs-code drift (the M1+M2+M3 batch was specifically designed to close drifts; we created a 4th the same session). Spec rewritten 2026-05-05 to demote re-read to "recommended for high-contention fields" — naive rollback is the canonical pattern for low-contention fields. No code change needed; spec-vs-code drift closed in the smaller direction.

| # | Item | Source | Symptom | Pull-when |
|---|---|---|---|---|
| **FC2** | **B5 paywall reset ordering during sign-out** | DeepSeek M1+M2+M3 batch (MEDIUM) | `usePaywallStore.reset()` runs in §9.19's `finally` block AFTER `await auth().signOut()` resolves; microtask interleave with React effects could briefly flash the paywall during sign-out animation | Maestro sign-out flow shows visible paywall flash between tap-Sign-Out and the redirect to `/(auth)/sign-in` |
| **FC3** | **§3.3 onboarding completion race** | Gemini M1+M2+M3 batch (LOW) | `mobile/app/(onboarding)/complete.tsx` calls `setStep('next')` before the `onboarding_complete` PATCH resolves. PATCH failure leaves user with mismatched state on relaunch (server says incomplete; local says done) → resumed back into onboarding | Maestro flaky-network onboarding test produces "user re-enters onboarding flow on second launch" symptom |

**Symptom-driven escalation only.** If Maestro doesn't surface FC2/FC3, they stay deferred. The architecture itself is sound; the races are observable only under specific user-behavior + network-failure intersections that may not actually occur in practice.

---

## Active Open Items

### Code-fix WF3 candidates (non-frontend-critical)

| Severity | Source | Item | Planned Home |
|---|---|---|---|
| HIGH | Gemini WF2 M1+M2+M3 batch | **§4 B6 concurrent 401 thundering herd needs a mutex.** Currently noted as "low risk known limitation" in `apiClient.ts:69-71` + the new B6 spec rules. Gemini argues a single in-flight refresh promise that subsequent 401s `await` is structurally correct. Real concern under burst-401 scenarios (deploy-induced 401 storm; post-network-restoration retries). | WF3 — implement promise-mutex in `mobile/src/lib/apiClient.ts`; amend §4 B6 spec rules to require it. **Promote to Architectural Reinforcement section.** |
| HIGH | Gemini WF2 M1+M2+M3 batch | **§4 B3 version-counter design discussion** — spec defaults to naive rollback (post-2026-05-05 revision); re-read-before-rollback is recommended for high-contention fields. Gemini argues version-counter is structurally correct vs. either. Decision can wait until a high-contention field surfaces a real issue. | Open design discussion — no action until a real bug surfaces. |

### Spec-amendment WF2 candidates

| Severity | Source | Item | Planned Home |
|---|---|---|---|
| HIGH | Spec 96 WF5 2026-04-30 | **Subscription funnel has near-zero PostHog events.** Only `subscription_expired_to_active` is wired (WF3 H3, commit `d032621`). The original Spec 96 audit flagged that the full funnel — `paywall_shown`, `subscribe_button_clicked`, `checkout_initiated`, `checkout_completed`, `subscribe_failed` etc. — has no instrumentation. Affects revenue/conversion analytics, not Maestro testing. | WF3 — wire the missing PostHog events at PaywallScreen + checkout flow sites; add to Spec 99 §7.3 production-event enumeration if any are routing-relevant. |
| MEDIUM | Gemini WF2 M1+M2+M3 batch | **§4 B2 server-payload coupling.** `hydrateFilter(query.data)` and `hydrateUserProfile(query.data)` pass entire server response into both stores. Future API field additions expose both to changes only one cares about. Recommend bridge-level mapping: `hydrateFilter({tradeSlug: query.data.trade_slug, ...})`. | WF2 — amend §4 B2 spec rules + refactor `useUserProfile.ts` hydration call sites. |
| MEDIUM | Gemini WF2 M1+M2+M3 batch | **§4 B4 `lastKnownUid` module-let is fragile.** Disputes the spec's HMR-caveat justification. Recommends moving to Zustand state with `partialize` exclusion + read in `onRehydrateStorage`. | WF2 — design discussion; current pattern was reviewed and accepted at §9.6 amendment time. Re-open only if HMR remains a friction point. |
| MEDIUM | DeepSeek M1+M2+M3 batch | **§B4 cache invalidation race after `setAuth`.** New component renders may start a query with the old bearer token before `invalidateQueries` fires. Already partially mitigated by `useUserProfile` idToken gate (commit `ffd9851`). At minimum: document inefficiency in spec + add Sentry breadcrumb. | WF2 — spec doc clarification + optional breadcrumb wire. |
| MEDIUM | M1+M2+M3 #10 (DeepSeek) | **`getDiagnosticsSnapshot()` returns empty in production builds — CI tests in production mode pass vacuously.** §8.4's `expect(maxRendersPerSecond).toBeLessThan(20)` would mask render-storm regressions if CI runs with `__DEV__=false`. | WF2 — gate the assertion to dev-mode tests OR provide a production-safe diagnostic fallback. |

### WF1 candidates (new tooling)

| Severity | Source | Item | Planned Home |
|---|---|---|---|
| MEDIUM | M1+M2+M3 #9 (Gemini) | **MMKV ban lacks automated enforcement.** §2.1 hard rule banning direct `createMMKV().getString()` outside `mobile/src/lib/persistence/` is verified manually only. | WF1 — add ESLint rule banning `react-native-mmkv` imports outside the allowed module list. |

### WF3 (telemetry baseline) deferrals (2026-05-06)

**Pre-existing concerns surfaced by Multi-Agent Review of unchanged code.** None of these are regressions introduced by the WF3 telemetry batch (commits `1b5d996`/`eb95f57`/`4a96c3f`); reviewers correctly identified pre-existing issues in surrounding code (authStore.ts signOut path, PaywallScreen handlePrimary). Filing here so they're not silently dropped.

| Severity | Source | Item | Planned Home |
|---|---|---|---|
| HIGH | Gemini | **`signOut` race condition with `onAuthStateChanged`**: between `await auth().signOut()` and `clearLocalSessionState` running in `finally`, a new authStateChanged fire could land. Speculative — practical race window is milliseconds and a new sign-in takes seconds; never observed. Mitigation would be an `isSigningOut` flag in authStore + listener guard. | Cross-cutting auth-flow hardening WF; gated on observed Sentry events from real users. |
| HIGH | Gemini | **`clearLocalSessionState` no per-step try/catch**: a thrown error in any step halts the fan-out — partial cleanup = partial PIPEDA. Mitigation: wrap each `.reset()`/`clear()` call in `try { ... } catch { Sentry.captureException }`. ~50 LoC. | Defensive cross-store hardening WF. |
| HIGH | DeepSeek | **`PaywallScreen.handlePrimary` unhandled rejection**: `await openCheckout()` has no try/catch; throwing leaves checkout in indeterminate state with no error feedback. Pre-existing pattern, not introduced by Phase 3. | WF3 spec 96 PaywallScreen hardening cycle. |
| HIGH | DeepSeek | **`PaywallScreen` `successNotification()` haptic on `openCheckout=true` is premature**: `true` only confirms the WebBrowser opened, not that payment succeeded. Spec 91 §4.4 reserves success haptic for genuine state mutations. Should fire on `subscription_status='expired'→'active'` transition (currently fires at button-tap time). | Same WF3 PaywallScreen cycle. |
| HIGH | DeepSeek | **`PaywallScreen` accessibilityLabel mismatch with `CTA_NEUTRAL` flag**: when env flag flips to neutral copy ("Learn more →"), the accessibilityLabel still reads "Continue subscription at buildo.com". Screen-reader users see contradictory state. | Same WF3 PaywallScreen cycle. |
| MEDIUM | Gemini | **Unconditional `clearLocalSessionState` on cold boot for logged-out users**: pre-existing crash-recovery pattern; imposes I/O cost on every cold start. Mitigation: clean-shutdown flag in MMKV. | Performance-WF gated on cold-start telemetry. |
| MEDIUM | DeepSeek | **`PaywallScreen.handleRefresh` missing error catch**: `queryClient.invalidateQueries` throwing leaves `isRefreshing` stuck. Pre-existing pattern. | Same WF3 PaywallScreen cycle. |
| LOW (cross-store) | Gemini | **mmkvStorage adapter silent failures across stores** (already in WF1-C deferrals). Multi-store concern; reviewer surfaced again on authStore. | Cross-store observability hardening (existing defer). |

### WF3 (audit items 7-9) deferrals (2026-05-06)

| Severity | Source | Item | Planned Home |
|---|---|---|---|
| MEDIUM | Gemini | **`fetchWithAuth` startup-race robustness** — when `idToken` is `null` at app start (uid hydrated from MMKV but onAuthStateChanged hasn't fired), an API call sends `Authorization: Bearer null` and depends on the server returning 401 (not 400) to trigger the §B6 refresh path. Spec 99 §B4's idToken gate is the architectural mitigation, but cross-hook hardening could pre-empt-refresh in `fetchWithAuthInternal` when `idToken` is falsy. | Cross-hook architecture WF; tag `[BRIDGES]`. Spec 99 §B6 amendment. |
| LOW | Gemini | **§B6 stale `user` object on refresh** — apiClient reuses local store user when calling `setAuth(user, newToken)`. If Firebase-side displayName/email changed, local UI shows stale data until next `onAuthStateChanged` event. Mitigation would source user from `auth().currentUser` at refresh time. | Spec 99 §B6 amendment + apiClient.ts:74-77 patch. |
| MEDIUM | DeepSeek | **Missing integration test for nonce-handoff sequence in `sign-in.tsx`** — `prepareAppleNonce` test (this WF3) locks the SHA-256 relationship at the helper boundary; `useAuth.test.ts:570-583` locks `AppleAuthProvider.credential(_, rawNonce)` mock invocation. The CALLER linkage in `sign-in.tsx:262-285` (does it actually pass `hashedNonce` to signInAsync AND `rawNonce` to credential?) isn't unit-tested because the sign-in screen requires component render. | Future Maestro flow `auth-apple-signin.yaml` covers this end-to-end; defer until the Maestro batch (audit items 11-13) lands. |

### WF1-A deferrals (2026-05-06)

| Severity | Source | Item | Planned Home |
|---|---|---|---|
| LOW | Gemini (NIT) | **Sentry Zod-parse `parsed.error.flatten()` for stable issue grouping** — currently passes the raw `ZodError` which has unstable fingerprints across slightly-different validation failures. Affects every `*SchemaError` site (`useLeadDetail`, `useFlightJobDetail`, `useFlightBoard`, etc.) — cross-hook concern, not WF1-A specific. | Future cross-hook observability hardening WF; tag `[OBSERVABILITY]`. |
| LOW | Gemini (MEDIUM, de-rated) | **Retry guard 401/403 exclusion** — neither `useLeadDetail` nor `useFlightJobDetail` excludes 401 (auth refresh exhausted) or 403 (non-AccountDeleted) from the retry guard. Spec 91 §4.3.1 enumerates 401 as a known status. Project convention currently relies on `apiClient` §B6 token-refresh interceptor + `AccountDeletedError` handling. | Cross-hook hardening WF — add 401/403 to the retry exclusion across the detail-hook family in one pass. |
| LOW | DeepSeek (LOW) | **`useLocalSearchParams` `id` could be `undefined`** — TypeScript types it as `string \| string[] \| undefined`; if a malformed deep-link reaches `[lead].tsx` without an id, the screen renders nothing (TanStack v5 with `enabled:false` returns `isLoading:false`, so all three render branches evaluate false). Realistic only with a malformed deep-link. | Defer — gated on real telemetry showing this case in production (Sentry). |
| NIT | DeepSeek | **Sticky CTA `paddingBottom: 120` magic number** — existing pre-WF1-A pattern preserved verbatim. If CTA content grows on small screens, text could clip. | Defer — UI polish across all sticky CTAs; gated on visual regression report. |

### WF1-C deferrals (2026-05-06)

| Severity | Source | Item | Planned Home |
|---|---|---|---|
| LOW | Gemini + DeepSeek (convergent, MEDIUM each) | **MMKV adapter silent error swallowing across ALL stores.** Every Zustand+MMKV store in `mobile/src/store/*.ts` (filterStore, userProfileStore, onboardingStore, authStore, flightBoardSeenStore) uses an identical `try { ... } catch { /* best-effort */ }` adapter pattern. Gemini and DeepSeek both flagged this on the new flightBoardSeenStore but the issue is project-wide. Adding Sentry only to one store creates asymmetric observability. | Future WF — cross-store hardening pass adding `Sentry.captureException(err, { extra: { context: 'mmkvAdapter.<op>', storeId } })` to every adapter's catch block. Tag `[OBSERVABILITY]`. Spec 99 §1.2 + §7.1 alignment. |
| LOW | DeepSeek (HIGH but de-rated after verification) | **`flightBoardSeenStore.seenMap` unbounded growth.** No TTL or max-size cap. At realistic scale (~1000 permits a user might have ever opened over years × 40 bytes each = 40 KB) this is well within MMKV's tolerance. Worth revisiting if active-user scale 100x. | Future WF — gated on real telemetry showing rehydrate latency >50ms or MMKV blob size >1 MB. Add LRU eviction policy at that point. |

### WF1-B deferrals (2026-05-06)

| Severity | Source | Item | Planned Home |
|---|---|---|---|
| LOW | Independent (worktree) #4 | **No `testID` on `[flight-job].tsx` cold-boot loading skeleton or "Job not found" view.** Spec 98 requires Maestro-assertable testIDs on distinct screen states. Loading skeleton at `[flight-job].tsx:181` and not-found view at line 190 lack them. | When the Maestro flow for push-notification deep-link is authored, add `testID="flight-job-loading-skeleton"` + `testID="flight-job-not-found"`. |
| LOW | Independent (worktree) #5 | **`FlightBoardDetailSchema.updated_at` uses bare `z.string()`** — accepts empty/non-ISO strings; `formatDateLong` returns `'—'` so no immediate display corruption, but Sentry won't see a server-side data integrity issue. Consistent with existing `FlightBoardItemSchema.predicted_start` convention. | Future date-validation hardening pass — promote all date fields to `z.string().regex(/^\d{4}-\d{2}-\d{2}/)` or `z.string().datetime()`. |

### Test/spec polish (LOW + NIT)

| Severity | Source | Item | Planned Home |
|---|---|---|---|
| LOW | DeepSeek M1+M2+M3 batch | **§8.5 store-enumeration test regex fragility.** `create<…>(` regex misses `createStore` factory pattern; a future store created via factory bypasses enumeration silently. | WF3 — replace regex with explicit allow-list or import-based discovery. |
| LOW | §7.2 code-reviewer | **§9.21 lint check comment overstates enforcement.** `mobile/__tests__/spec99.mandates.lint.test.ts:149-155` comment claims "at least 2 hits in src/" but actual condition uses boolean `searchTree`. Helper file matches the regex, so `srcCallerFound` is permanently `true`. Guard inert via `src/` path. | Future doc-only WF — correct the comment OR implement a `countMatches` variant. |
| LOW | §9.21 code-reviewer | **§7.4 Strict Mode suppression-marker vocabulary is static.** Check tests `strictModeSuppress\|suppressDoubleFire`. A future contributor suppressing via different token (`dedupRender`, `strictModeNoop`) would evade. | Future hardening — expand regex if `stateDebug` ever gains a config arg. |
| LOW | §9.21 code-reviewer | **§8.3 lint regex matches against regex-literal syntax in source.** Could lose coverage if gate-stability test is refactored to use `.toContain('Permitted carve-outs')` instead of regex literal. | Future hardening — re-anchor to `it()` test title string (more stable). |
| LOW | D1 H5 code-reviewer | **`feedback_wf3_granularity.md` SHA chain in `**Why:**` paragraph fragile after rebase.** SHAs are illustrative not load-bearing; if commits get squashed/force-pushed the chain becomes unverifiable. | Future cleanup — replace SHA chain with count-only ("9 separate plan-lock commits across 8 findings + 1 class fix"). |
| LOW | D1 H5 code-reviewer | **`feedback_wf3_granularity.md` recursive deferred-item case not explicitly stated.** Implicit by composition with `feedback_always_use_workflow.md` ceremony rule. | Future memory edit if confusion surfaces. |
| NIT | Gemini WF2 M1+M2+M3 batch | **§6.6 composite-field rule weak.** "MUST justify the deep-equal cost in the spec PR" is subjective. Recommend stricter "MUST flatten unless server-side equivalent absent". | WF2 — strengthen §6.6 rule prescriptively. |

---

## 📱 Pre-Spec-99 Mobile Findings — Still Valid Post-Architecture

Surfaced 2026-05-05 verification pass against the BEFORE state of this file (commit `bb4bdc9~1`). These are mobile findings from 2026-04-23 batches (Mobile Ph4-7, Phase 8.0, Design-audit) that the prior cleanup dropped under the "dormant >1 week" rule. **Spec 99's architectural change did NOT obsolete them** — Spec 99 restructured state management; these are UI/screen/schema gaps orthogonal to that. Each row verified against current HEAD before promotion.

### 🔴 Maestro-blocking (verify Maestro flow scope before going to E2E)

| Severity | Item | Verification | Maestro flow at risk |
|---|---|---|---|
| ✅ HIGH | ~~**`[flight-job].tsx` cold-boot from notification → "Job not found"**~~ — **RESOLVED 2026-05-06 by WF1-B** (commits `4e2df49` Phase 1 + `3d5b47f` Phase 2). Hook `mobile/src/hooks/useFlightJobDetail.ts` + `[flight-job].tsx` cold-boot fallback wired. | — | — |
| ✅ HIGH | ~~**`[lead].tsx` schema gap — sq_footage / predicted_start / income_tier / neighborhood profile absent**~~ — **RESOLVED 2026-05-06 by WF1-A** (commits `657faf8` Phase 1 backend `is_saved` + `be9fcff` Phase 2 `useLeadDetail` + `98ad3df` Phase 3 `[lead].tsx` rewrite + Phase 4 testID fix). All 4 §4.3 sections rendered (Cost Estimate / Square Footage / Target Start Date / Neighborhood Profile) with testIDs per Spec 98 §3.2. | — | — |
| HIGH | **`[flight-job].tsx` contextual data thin** — relies on `FlightBoardItemSchema` which only has `permit_num`, `revision_num`, `address`, `lifecycle_phase`, `lifecycle_stalled`, `predicted_start`, `p25_days`, `p75_days`, `temporal_group`. No cost / sq_footage / neighborhood. Now ALSO includes `updated_at` per WF1-B `FlightBoardDetailSchema`, but the cost/sq_footage/neighborhood gap remains unaddressed. | Partial: WF1-B added `updated_at`. Cost/sq_footage/neighborhood require a Spec 77 §3.3 schema expansion + corresponding backend amendment. | Flight-job-detail E2E asserting on contextual data fails |
| ✅ HIGH | ~~**Amber "newly updated" flash is dead code**~~ — **RESOLVED 2026-05-06 by WF1-C** (commits `6416262` Phase 1 + `0beaaf4` Phase 2). New `flightBoardSeenStore` (Spec 99 §3.4c) + `FlightBoardItem.updated_at` + `flight-board.tsx` renderItem wiring + `[flight-job].tsx` mark-on-detail-open + Spec 77/92/99 amendments aligning the trigger rule. | — | — |

### 🟡 Maestro-MAYBE (visible bugs that could affect specific assertions)

| Severity | Item | Verification | Test surface |
|---|---|---|---|
| LOW | **`FlightCard` urgency badge can show negative day count** (`⚡ -2 DAYS` for overdue predicted_start) — `Math.ceil(daysUntilStart!)` with no `Math.max(0, ...)` floor at line 202. | Verified at `mobile/src/components/feed/FlightCard.tsx:202`. | E2E asserting on badge text format would fail for stalled/overdue permits |
| LOW | **`[flight-job].tsx` percentage string cast (`'${rangeLeft.value * 100}%' as unknown as number`)** in `useAnimatedStyle` worklet — works on iOS, inconsistent on Android Reanimated v3. | Source-pre-Spec-99 finding — needs in-context re-verification, but Reanimated v3 quirks are platform-stable. | Android-specific Maestro flows on the flight-job-detail screen |
| LOW | **Push token not re-registered on cold boot for already-authenticated users** — `AuthGate` only calls `registerPushToken()` on auth-group → app-group transition (`sideEffect: 'registerPushToken'` in §5.3 Branch 5b). Returning authenticated users skip this branch. If the Expo Push Token rotates (OS upgrade, reinstall), the server never learns. MMKV dedup makes a cold-boot call safe. | Spec 99 §5.3 codifies this branch shape — finding survives. Fix: call `registerPushToken()` unconditionally when `user && _hasHydrated`. | Push notification E2E on returning users with rotated tokens |

### 🟢 Maestro-NO but real (kept for completeness; deferred)

These ARE real bugs but won't surface in Maestro testing — they're either UI polish (visual deviations from spec) or backend/server-side. Listed here so they're not silently lost again, but not blocking E2E:

- LOW Mobile UI polish (~6 items): `LeadCard` Reanimated spring, `LeadCardSkeleton` pulse pattern, `FilterTriggerRow` styling, `NotificationToast` safe-area, `EmptyBoardState` gradient, hitSlop on Empty CTAs, typography nits in `[flight-job]`/`FlightCard`/`ScoreRow`, `SearchPermitsSheet` snap points
- LOW Backend: `dispatchPhaseChangePushes` SQL no NULL push_token filter; `LeadMapPane` super-cluster not implemented (Phase 2 map WF)
- LOW Schema: `.nullable() without .optional()` on `PermitLeadFeedItemSchema` fields

Plus historical resolved (verified already-fixed in this triage):
- ✅ `@react-native-community/slider` was missing from `package.json`; verified present 2026-05-05.
- ✅ `[lead].tsx` 13-line stub; built out to 360 lines with `OpportunityRing`. Schema gaps remain (separate row above), but the screen is no longer a stub.
- ✅ Phase 8.0 401 token refresh retry; resolved by `apiClient.ts:65-84` + B6 spec amendment commit `aed9918`.
- ✅ Spec 90 §12 FlashList v2 estimatedItemSize; resolved by H4 commit `21520d9` typed wrapper.
- ✅ `NotificationPermissionModal` UI migration to `@gorhom/bottom-sheet`; pre-existing resolution flagged in original BEFORE state line 884.

---

## 🟢 Architectural Reinforcement — close spec-vs-code gaps (high-leverage)

These are NOT race patches. They are gaps where the spec promises something the implementation does not actually guarantee, OR places where a bridge has a "known limitation" footnote that violates the architecture's "safe by construction" principle. Closing these reinforces the architecture rather than patching around it. Each is small + high-leverage.

| Item | Gap shape | Why it reinforces |
|---|---|---|
| **§9.21 lint check `app/`-only enforcement** (LOW) | The `searchTree` boolean check has TWO paths (src/ and app/). The `src/` path is permanently `true` because the helper file at `mobile/src/lib/queryTelemetry.ts` matches the `logQueryInvalidate(` regex itself. So the §7.2 mandate's enforcement runs through `app/` ONLY. A future change that orphans all `app/` callers would silently pass. | Replace `searchTree` boolean with `countMatches` returning a number; require count ≥ 2 (helper + ≥1 caller). Makes the §7.2 lint actually enforce what its comment claims. |
| **§8.5 store-enum import-based discovery** (LOW) | Currently regex-discovers `create<...>(` patterns in `mobile/src/store/*.ts`. A factory pattern (`createStore(...)`) silently bypasses; new store added via factory → no `.reset()` enforcement → stale data leaks across users on shared device (a §B5 PIPEDA-class bug). | Replace regex with maintained allow-list OR import-graph parsing of `useXxxStore` exports across the directory. Makes §B5 store-reset coverage robust to future Zustand idiom changes. |
| **§4 B2 server-payload coupling** (MEDIUM) | `hydrateFilter(query.data)` and `hydrateUserProfile(query.data)` pass the FULL TanStack response into both stores. §3.1 mandates "exactly ONE store owns each field" — but each bridge call exposes both stores to fields neither owns. | Refactor `useUserProfile.ts` hydration calls to pass per-store sub-objects: `hydrateFilter({tradeSlug, radiusKm, ...})`. Tightens single-ownership at the bridge boundary. ~10 lines of code change. |
| **§4 B6 thundering-herd mutex** (HIGH) | Spec says "exactly-once retry per call chain" but admits N parallel `getIdToken(true)` calls under burst-401. The asterisk itself violates Spec 99's "bridges are safe by construction" principle. | Implement single-flight promise in `apiClient.ts`: first 401 starts the refresh, subsequent 401s `await` the same promise. Removes the "known limitation" footnote. ~15 lines. |
| **§B4 idToken-gate documentation** (MEDIUM) | Commit `ffd9851` added the idToken gate to `useUserProfile` that mitigates the §B4 cache invalidation race — but the mitigation isn't called out in §B4's spec text. Future contributor reading §B4 wouldn't know the gate exists or why removing it would re-open a race. | Add a one-paragraph "Implementation note" under §B4 documenting the `useUserProfile.ts:enabled` gate as the canonical mitigation. ~5 lines of spec edit. Closes implicit knowledge. |

**Why these matter more than FC2/FC3:** the FC items are races that may or may not manifest in practice. The reinforcement items are concrete gaps where someone reading the architecture today gets the wrong impression (lint claims to enforce something it doesn't; spec promises ownership the bridge dilutes; B6 admits the limitation it shouldn't have). Closing these makes the architecture trustworthy by self-description — the spec describes what the code does, the code does what the spec says.

**Suggested ordering** (not a workflow plan — just relative leverage):
1. §9.21 lint (cheapest; removes a false-confidence trap)
2. §B4 idToken-gate doc (cheapest spec edit; closes implicit knowledge)
3. §4 B2 coupling (tightens bridge contract structurally)
4. §8.5 import-based discovery (eliminates a §B5 PIPEDA-coverage hole)
5. §4 B6 mutex (largest effort; promotes "known limitation" to "safe by construction")

---

## Adversarial Pattern Notes

Across the H1-H5 + M1-M3 + §7.2 + §9.21 + M1+M2+M3 WF3/WF2 batches this session, the 3-agent Multi-Agent Review pattern produced these false-positive rates on Spec 99 doc-only and code amendments:

| Reviewer | Substantive findings | False-positive findings (already-resolved at scan time) | False-positive rate |
|---|---|---|---|
| `feature-dev:code-reviewer` (Sonnet, worktree-isolated) | many — all triaged + applied inline where applicable | 1 (`save-heart-filled` testID — flagged as Maestro-blocking BUG against this trim, but actual code at `LeadCard.tsx:117` uses `${index}` not `${leadId}` — already-fixed) | ~5% on spec-sync/doc-amendment WFs |
| Gemini Pro | 5-7 substantive | 4-5 (`userProfileStore` PII partialize, §7.3 telemetry, §8.3 gate tests) | ~40% on spec-sync/doc-amendment WFs |
| DeepSeek-R1 | 4-5 substantive | 3-4 (§7.3 telemetry, §8.3 gate tests, §B4 cache race) | ~40% on spec-sync/doc-amendment WFs |

**Pattern:** All 3 reviewers can fall prey to "trust historical doc text without verifying current code". Gemini and DeepSeek do this systematically (~40% on spec-sync WFs); code-reviewer was thought to be exempt but EXHIBITED IT ONCE in this session — flagged the `save-heart-filled` testID mismatch as a Maestro-blocking BUG against the file trim, citing a stale historical entry. Verifying against `LeadCard.tsx:117` showed the bug was already fixed (uses `${index}`, not `${leadId}`). The lesson generalises: **always verify findings against current HEAD before treating them as actionable, regardless of which reviewer surfaced them.**

**Recommendations going forward:**
1. **Pre-verify each adversarial finding** against current HEAD before treating it as actionable. ~40% of Gemini/DeepSeek output during this session was already-resolved noise.
2. **Use code-reviewer as the primary signal** (low false-positive rate, full code-context awareness).
3. **Treat adversarial output as a "did we miss anything" sanity check**, not a primary review pass.
4. **Default-skip adversarial on doc-only WFs** unless explicitly requested. The bug-finding payoff is low (Gemini/DeepSeek review code, not text drift) and the noise is high. User pattern across this session has consistently been "skip adversarial" for doc-only batches.
5. **Keep adversarial mandatory for WF1/WF2 code changes** per `feedback_review_protocol.md` — the false-positive rate is acceptable when the review surface is real code. Noise reduction is ~40% pre-verification: budget that into review-amendment time.

**Verification protocol for adversarial findings:** before treating any adversarial-surfaced finding as actionable, perform this 3-step check:
1. **Read the finding's claimed file:line citation in current HEAD.** Does the code there match the finding's description?
2. **`git log --oneline -- <cited-file>` since the audit's date.** Has the file been touched? If yes, re-verify the finding against the post-touch state.
3. **If the finding is a "missing implementation" claim** (e.g., "no `track('route_decision', ...)` calls anywhere"), grep for the pattern in current HEAD across the relevant scope. Don't trust the audit's claim if the pattern was added since.

If any of (1)/(2)/(3) reveals already-resolved state, document as "false positive (verified <date>)" in this file, NOT silently dropped. Adds to the adversarial-pattern data set.

---

## Hygiene Practices (forward-going)

These practices keep `review_followups.md` from drifting back to the 1246-line state.

1. **Auto-prune at WF6 close-out.** Every WF6 close-out commit that records a RESOLVED batch should ALSO trim the prior PENDING entries that the batch closed. Bodies move to the historical index as 1-line summaries with commit hash. Don't accumulate full-prose RESOLVED bodies in the active sections.

2. **Time-based archival for `Future hardening`.** Items tagged `Future hardening` or `Reactive` that sit dormant >2 weeks without escalation get archived (collapsed to a 1-line note in the historical index OR removed entirely if not load-bearing). The current rule "items dormant >1 week without escalation are deemed not actively tracked" stands; tighten to 2 weeks with explicit archival rather than silent retention.

3. **Severity decay.** A HIGH item dormant >2 weeks without progress is either actively prioritized (commits referencing it) or demoted to MEDIUM. Forces escalation or removal, prevents indefinite HIGH-tagged items.

4. **Adversarial pre-verification (above).** Before logging any adversarial finding here, run the 3-step verification protocol. False positives are documented as "false positive (verified <date>)" rather than silently dropped — this builds the adversarial-pattern data set so we can refine the false-positive-rate estimate.

5. **Spec-vs-code drift gets a special tag.** Items where the spec text and code state disagree are tagged `[DRIFT]` and surfaced higher than other LOW items. The M1+M2+M3 batch demonstrated drift is a recurring gap; tagging it explicitly prevents it from hiding among LOW polish items.

6. **Maestro-relevance tag on every active item.** YES (Maestro-blocking) / MAYBE (could surface under specific conditions) / NO (test infra, design, backend telemetry). When new findings are filed, they get this tag immediately; surfaces frontend-critical items automatically without a manual review pass.

7. **Update `feedback_review_protocol.md`** to reflect the Adversarial Pattern Notes recommendation: WF2 default for spec-sync / doc-amendment changes can be single-reviewer (currently mandates 3-agent for all WF2). Match the pattern user has been picking ("skip adversarial") — make the memory describe actual practice.

---

## Resolved (Historical Index)

One-line per resolved batch with commit hash + date. Full prose recoverable via `git log -p docs/reports/review_followups.md`.

### 2026-05-06

- `657faf8` / `be9fcff` / `98ad3df` / `0498027` — **WF1-A `[lead].tsx` build-out + Spec 91 §4.3 sections + Cross-Domain Scenario B `is_saved`** — Phase 1: backend `LeadDetail.is_saved` field via `lv_self` LATERAL EXISTS on `$4::text` (3-way Multi-Agent plan review caught a `$2` vs `$4` bug pre-implementation; verified fixed in code) + 4-case real-DB regression test (`lead-detail-saved-state.db.test.ts`) + 3 mapper-boundary tests + Spec 91 §4.3.1 amendment. Phase 2: `useLeadDetail` hook (Spec 99 §B1 canonical) + `LeadDetailSchema` + 12 unit tests including deploy-skew protection. Phase 3: `[lead].tsx` full rewrite (replaces pre-Spec-99 `queryCache.subscribe` walk with `useLeadDetail`; renders 4 missing §4.3 sections with testIDs; `useSaveLead` extended to mirror optimistic state across both `['lead-feed']` AND `['lead-detail', id]` cache keys per BUG-2 fix; `leadDetailFormat` helper module + 19 unit tests; `SQM_TO_SQFT = 10.7639` single source). Phase 4 Multi-Agent post-implementation review surfaced 1 inline fix (Independent worktree BUG-1: SaveButton testID `lead-detail-save-button` did not match the `.replace('save-button-', ...)` convention → silent state-collision; renamed to `save-button-detail`). 5 false positives dismissed (queryKey user-leakage already mitigated by §B5 `queryClient.clear()`; retry off-by-one — TanStack v5 is 1-indexed; leadType detail.lead_type — CoA is 404; hasNeighbourhood undefined — Zod boundary forbids; non-null `id!` — `enabled` gate). 4 deferrals logged. Closes Pre-Spec-99 Mobile Findings #2.
- `6416262` / `0beaaf4` — **WF1-C amber update flash wiring** — Phase 1: `flightBoardSeenStore` (Zustand + MMKV persist) + `FlightBoardItem.updated_at` schema field + `clearLocalSessionState` §B5 fan-out + 6 unit tests. Phase 2: `flight-board.tsx` renderItem `hasUpdate` computation + `[flight-job].tsx` `markSeen` on detail-open + FlightCard `testID="flight-card-update-flash"` + Spec 77/92/99 amendments (Spec 99 §3.4c new subsection + Spec 92 §4.4 trigger-rule supersedure + Spec 77 §3.2 store-path cross-link). Multi-Agent review applied 2 inline fixes (persist `name` aligned to spec literal `'flight-board-last-seen'`; Spec 99 subsection renumbered §3.4b → §3.4c to preserve §3.4a ordering) + 2 deferrals (cross-store MMKV silent-swallow Sentry add; seen-map unbounded-growth LRU). Closes Pre-Spec-99 Mobile Findings #4 (dead-coded amber flash).
- `4e2df49` / `3d5b47f` — **WF1-B mobile cold-boot fallback for `[flight-job].tsx`** — Phase 1: `useFlightJobDetail` hook + `FlightBoardDetailSchema` + 11 unit tests. Phase 2: `[flight-job].tsx` cold-boot wiring (cache-first, then single-permit fetch, then "Job not found" only when both fail). Multi-Agent review applied 2 inline fixes (RateLimitError retry exclusion; `encodeURIComponent` test no-longer-false-green) + 2 deferrals (testID gaps; `updated_at` Zod hardening). Closes Pre-Spec-99 Mobile Findings #1 (push deep-link Maestro blocker).

### 2026-05-05 (last session)

- `dd638c2` — **WF3 H1 Spec 99 §6.5 amendment** — permitted narrow `isFetching` carve-out for stable status fields; AppLayout `expired`-refetch enumerated as the canonical exception.
- `e41d6a5` — **WF3 H2 §8.3 gate-stability tests** — 4 source-grep regression tests in `subscriptionGate.test.ts` covering all §6.5 render gates.
- `d032621` — **WF3 H3 §7.3 router decision telemetry** — DEV `route_decision` event at 2 router.replace sites + 3 production events (`reactivation_modal_shown`, `cancelled_pending_deletion_signout`, `subscription_expired_to_active`).
- `47a1b24` / `19de789` / `21520d9` / `11eb10a` — **WF3 H4 mobile typecheck cleanup** (4 phases) — bridges.test.ts QueryObserver readonly + helper variance; `@tanstack/query-sync-storage-persister` dev-dep; `AnimatedFlashList` typed wrapper; `_layout.tsx` `NotificationBehavior` fields. 15 → 0 errors.
- `c3cf253` — **WF3 H5 MEMORY.md auto-memory cleanup** — 94 → 22 lines per "index, not memory" rule. Memory-side only.
- `fa563bf` — **WF2 M1+M2+M3 doc-only spec sync** — §B5+§9.10, §5.2 falsy-uid, §9.17-§9.20 catalog rows.
- `e655417` — **WF1 §9.21 mandates-lint test** (Pattern A class fix) — `spec99.mandates.lint.test.ts` enforces every §7+§8 mandate has implementation evidence. Surfaced §7.2 gap.
- `fe03abe` — **WF3 D1 from H5: `feedback_wf3_granularity.md`** — auto-memory addition for per-finding cadence rule.
- `ec4d1bd` — **WF3 §7.2 cache invalidation telemetry** — `logQueryInvalidate` helper at 10 non-trivial sites; closes §9.21 lint's `it.skip`.
- `ffd9851` / `6ee943b` / `5e3f9b4` / `2a7a9c9` — **WF3 M1+M2+M3 batch** (3 phases + close-out) — #4 idToken gate; #5 unconditional crash-recovery cleanup; #12 stale-profile loading guard.
- `aed9918` / `cddc3d0` / `d0e581f` — **WF2 M1+M2+M3 batch** (2 phases + close-out) — #6 B6 bridge spec; #7 B3 rollback race amendment; 5 inline reviewer fixes.

### 2026-05-04 and earlier

- `656e985` — **WF2 §9.14 Phase D adversarial trio review** — Gemini + DeepSeek + code-reviewer on `notification_prefs` JSONB-flatten WF; 7 fixes inline + 23 deferrals (most since resolved by H1-H4 + M1+M2+M3).
- **WF3 Top-6 deferred bug sweep** — 9 CRITICAL + 8 HIGH closed; 7 commits (`d609b9b` auth hardening, `08ff833` user-profile route, `6b518ae` push dispatch, `857bf51` PII strip, `fefc2a3` LPAD cursor, `0fa1314` Phase 7 amendments).
- `3fa96a1` — Cursor backward-compat (server-side LPAD bare-int support).
- `671aa87` + `202a9aa` — PII MMKV strip (§9.18 — `persistFilter.ts` NEW + buster bump).
- `381a0c9` + `f2f7147` — Forced-signout cleanup unification (§9.19 — `clearLocalSessionState` helper extraction).
- `7bcb681` — Dead-code sweep (§9.20 — server `CLIENT_SAFE_COLUMNS` removal).
- Multi-week earlier batches (Spec 93/94/95/96 follow-ups, WF5 prod backend audits, mobile Ph4-7, Phase 8.0 pre-test gauntlet, validate-migration hardening, audit-fk-orphans, Stripe webhook, etc.) — all resolved or stale; commits in `git log` 2026-04-08 → 2026-05-04 range. Items dormant >1 week without escalation are deemed not actively tracked.

### Operational Safety (dormant but live)

- **`scripts/backup-db.js` has never run in production** per WF5 prod backend 2026-04-25 audit. Script exists; operational state unverified. File a backup-runbook WF before next migration that touches a >100K-row table.

---

_If you need a specific historical entry's full prose, use `git log -p docs/reports/review_followups.md` and grep for the commit hash above._

---

## Spec 30 Cycle 2 Phase 4 — Multi-Agent Review Deferred Items (2026-05-06)

Source: Gemini + DeepSeek + worktree code-reviewer adversarial review of commits `5b1a327` through `fdfbda8`. Fix-now items (CSRF Origin gate, minute-boundary TTL, promise-deduplication, useState-scoped QueryClient, `affected_users` distinct-count, `useAppHealth` hook extraction, Zod parse on Sentry/PostHog responses, timing-safe admin key compare) were applied in commit `<TBD>`. Items below are deferred — not blocking, but worth picking up in a future maintenance pass.

- **`__resetAppHealthCacheForTests` export footgun (Gemini MEDIUM).** The `__`-prefix is a convention, not a security boundary. A developer could accidentally import the reset in production code. Mitigation: lift cache state into a separate `src/app/api/admin/app-health/cache.ts` module and use `vi.mock` for test isolation — eliminates the production-side export entirely. Low priority; current pattern is widely used in the codebase.

- **`settle()` reason erasure (Gemini MEDIUM).** Aggregator `settle()` wrapper catches unexpected throws and returns the canonical `{reason: 'aggregator_threw'}` — discards `err.message` which would help operator triage. Trade-off: including `err.message` could leak internals into the API response. Compromise: include the exception class name (e.g., `aggregator_threw:TypeError`) — not the full message. Defer until an operator hits an opaque `aggregator_threw` they can't debug.

- **Failed admin-key attempts not logged (DeepSeek MEDIUM).** When `X-Admin-Key` is present but does NOT match `ADMIN_API_KEY`, the helper falls through silently to the session path. By contrast, the session path `logWarn`s on a non-allowlisted authenticated user. Adding a `logWarn` for the wrong-key case would surface CI misconfiguration + brute-force probing. Defer; not security-critical given timing-safe compare + short-circuit on length mismatch.

- **Successful admin-key authentication not logged (DeepSeek LOW).** No audit trail for `authMethod === 'admin_key'` admin auth events. Downstream route handlers emit `admin_action` breadcrumbs, but the auth layer itself is silent. Adding `logInfo` would let operators trace which automation used the key. Defer until first incident requires the audit trail.

- **Dev bypass without hostname check (DeepSeek HIGH, demoted).** `isDevMode()` already enforces `NODE_ENV !== 'production'` AND `DEV_MODE === 'true'` (route-guard.ts:32-34) — two independent flags must misconfigure simultaneously. Adding a `request.nextUrl.hostname === 'localhost'` check is defense-in-depth-3, not a missing security boundary. Defer.

- **Long inline comment block in verify-admin.ts (DeepSeek NIT).** The 32-line spec-paraphrase comment block at the top of the file may rot if Spec 33 amends without updating the file. Defer; spec links + brief summary is the project pattern, but rewriting now adds review burden without correctness gain.

- **Zod 500 error includes no detail in dev (Gemini LOW).** When the response envelope fails Zod validation, the 500 returns a generic message. In dev mode, including `parsed.error.issues` in the body would speed local diagnosis. Defer — the issue is logged via `logError` already, which is the canonical operator-debug path.


---

## Spec 76 WF2 Cycle 4 P5 — Deferred Items (2026-05-06)

Source: 3-agent Multi-Agent Review of `POST /api/leads/save` + the lead_id-format alignment across web admin + mobile (commit `<TBD>`). Fix-now items applied: canonical `parseLeadId` reuse, `--`-uniqueness guard, `.trim()` on Zod schema, defensive cache spread on optimistic write. Items below are deferred — non-blocking but worth picking up:

- **PostHog `track('admin_action_performed')` event on save/unsave (DeepSeek HIGH).** Spec 35 §7.1 mandates Sentry breadcrumb + PostHog event for every admin mutation. Sentry breadcrumb shipped in P5; PostHog event deferred because the web admin has no client-side `track()` shim yet (Cycle 2 Phase 0 wired SERVER-side analytics only via `src/lib/admin/analytics.ts`). Followup: build a `useAdminAnalytics` hook that calls a thin `/api/admin/analytics/track` endpoint with the same PII allowlist; then wire into all admin mutations.

- **Toast feedback on save/unsave success/error (DeepSeek HIGH).** No `sonner` (or equivalent) toast library is wired in the web admin. Add when a project-wide toast UX choice is made.

- **Concurrent mutation race in optimistic save (DeepSeek MEDIUM).** Two near-simultaneous `useSavePermit` calls each snapshot the cache pre-optimistic-write; the second snapshot may already include the first's optimistic item. The `onSettled` invalidation reconciles eventually, but a brief inconsistent state is possible. Rare for save flow (single-tap claims); revisit if observed in production. Spec 99 §B3 "Rollback race acknowledgement" 2026-05-05 documents the per-field decision matrix; per the matrix, save_permit is low-contention so the naive rollback IS the canonical default.

- **Pre-leadId-construction input validation in `useSavePermit` (DeepSeek MEDIUM).** If `permit_num` or `revision_num` were ever empty strings, the constructed `leadId` would be malformed and the server returns 400 with no UI feedback. Today the only callsite (SearchPermitsModal) only sends valid values from search hits. If future callers can pass empty values, add a precondition + UI feedback.

- **API design: `lead_type`+`lead_id` redundancy (Gemini LOW).** A client could send `lead_type:'permit'` with `lead_id:'builder-123'`; the server correctly rejects but the contract is loose. Long-term refactor: drop `lead_type` from the body and infer from the `lead_id` shape server-side. Out of scope for P5; defer until a Spec 76 v2 amendment.

- **Content-Type validation uses `.includes` not `.startsWith` (Gemini NIT).** `'text/plain; comment="application/json"'` would technically pass `.includes('application/json')`. Mirrors the existing `/api/leads/view` pattern (consistency); change both at once or neither. Defer to a sweep PR.

- **Pre-existing broader bug: SQL `lead_id` separator mismatch.** `get-lead-feed.ts:100` builds `lead_id` as `permit_num || ':' || revision_num` (colon), but `parseLeadId` and the new `/api/leads/save` route expect `--`. Mobile's feed→detail flow (`router.push(`/(app)/[lead]?id=${item.lead_id}`)`) passes the colon-separated id into the URL where `parseLeadId` fails — separate WF3 needed. NOT introduced by P5; surfaced during P5 review.


---

## Spec 91 + Spec 95 — Cycle 6 Multi-Agent Review Deferred Items (2026-05-06)

Source: 3-agent Multi-Agent Review of Cycle 6 spec amendments (Spec 91 §1.1-1.3 + §3.5; Spec 95 §2.5.1; Spec 76 §3.7 closure). Fix-now items applied: phantom Spec 94 §3.5 → §4 reference (3 places); Spec 91 §3.5 item 4 algorithmic-invariant tightening (mandated option (a), rejected option (b)).

**Spec 91 — pre-existing gaps surfaced by Gemini (NOT introduced by Cycle 6):**

- **State migration strategy for MMKV-persisted `filterStore`** (Gemini §2). When the Zustand state shape changes across app versions, today the implicit behavior is JSON.parse failure → cache wipe → user loses filters. Need a versioned state + migration plan.

- **Location permission lifecycle** (Gemini §2 `useLocation.ts`). Spec doesn't cover (a) permission denied at OS prompt, (b) permission revoked mid-session. `EmptyFeedState.tsx` needs a `location_denied` state.

- **Map cluster tap behavior** (Gemini §4.2). Spec mentions tapping a marker but omits cluster-tap UX (standard expectation: zoom to de-cluster).

- **Optimistic-save UI failure messaging** (Gemini §4.4). `useSaveLead` rolls back the cache on error but the user-facing UX (toast copy + heart re-animation) is undefined.

- **Infinite-scroll page failure** (Gemini §2 `useLeadFeed`). What happens when page 4 fails after pages 1-3 loaded? `EmptyFeedState` is for initial-fetch failures only.

- **TanStack Query cache memory pressure** (Gemini §2). FlashList recycles views but the query cache holds all loaded items in RAM. Mid-range Android risk after 1000+ scroll. Need a page-trim or gcTime strategy.

- **`competition_count` view criteria** (Gemini §3). What counts as a "view"? 500ms render? Explicit endpoint hit? Spec 91 §3 doesn't define the trigger; gaming risk if cards-on-screen-during-scroll counts.

- **`OpportunityRing` simultaneous animation jank** (Gemini §4.1). 350ms gauge animation on every card mount; FlashList renders many cards rapidly during scroll → frame drops on mid-range Android.

- **Brittle `SaveButton` testID derivation** (Gemini §4.4). String-replace on parent button testID creates implicit naming-convention contract that breaks E2E tests when violated.

- **`permit_trades` row-count scalability** (Gemini §3.5). Cycle 6 mandates option (a) — every-active-permit `'realtor'` row. At 50M permits this doubles a critical JOIN table. Cycle 7 must benchmark + decide whether to amend §1.2 or accept the cost.

**Spec 95 — pre-existing contradictions surfaced by DeepSeek (NOT introduced by Cycle 6):**

- **§2.4 vs §9 Step 6 contradiction: notification preferences shape.** §2.4 documents the migration to 5 flat columns; §9 Step 6 still describes `notificationPrefs` as a JSONB object. Pick one and update both.

- **§5 Settings table stale JSONB note.** Same root cause as the §9 Step 6 inconsistency (Worktree code-reviewer also flagged this).

- **§9 Step 3 PATCH vs §2.5 manufacturer onboarding precondition.** PATCH requires `trade_slug IS NOT NULL` for `onboarding_complete=true`, but manufacturers permanently have `trade_slug=NULL`. Manufacturers can never finalize onboarding via this endpoint.

- **§9 Step 3 idempotency exception misplaced.** The `account_deleted_at` idempotency check is in PATCH but PATCH strips that field — should be in the dedicated delete endpoint.

- **§4 Partial onboarding on new device.** GET 404 → "new user" redirect forces redoing immutable trade selection. No partial-state resume defined.

- **Concurrent delete + reactivate race.** No row-level locking; reactivation could undo a deletion without revoking tokens.

- **`lead_view_events` + `subscribe_nonces` table growth.** No expiry/archival strategy documented.

- **Manufacturer trade selection assumption.** Onboarding flow doesn't have a manufacturer path; assumes `trade_slugs_override` pre-populated out-of-band.

- **Stripe webhook idempotency table.** PK constraint alone doesn't guarantee single-processing — handler must catch insert errors.

All items above are PRE-EXISTING and out of Cycle 6 scope. They warrant a separate Spec 95 hardening WF or staged WF3s. Cycle 6 deliberately did not touch any of these because the cycle was scoped to 3 narrow amendments (§2.5.1 addition only).


---

## Spec 91 — WF2 Cycle 7 Multi-Agent Review Deferred Items (2026-05-06)

Source: 3-agent Multi-Agent Review of Cycle 7 backend wire-up. Fix-now applied: dual-code-path parity (JS classifyPermit now appends realtor INSIDE the function, mirroring TS), explicit RAISE EXCEPTION DOWN block, ON CONFLICT DO NOTHING for trade_configurations to preserve operator hotfixes, removed MAX_ITERATIONS cap, added active-status filter on backfill SELECT, computed verdict from completion.

**Deferred (out of Cycle 7 scope, real concerns flagged for future cycles):**

- **Architectural re-litigation of option (a) — Gemini CRITICAL.** Gemini reviewer challenged the §3.5 item 4 option (a) MANDATE on scalability grounds (`permit_trades` row-count doubling). Spec 91 §3.5 already documents this as accepted cost. Cycle 6 explicitly closed this debate (§1.2 algorithmic invariant + persona-agnostic algorithm); Cycle 7 implements the closed decision. **If row-count doubling proves operationally infeasible** (benchmark Cycle 7's permit_trades growth on a real DB after backfill), the spec's own escape clause permits amending §1.2 — but that requires a deliberate WF, not a silent algorithm branch in `getLeadFeed`.

- **trades ON CONFLICT (id) DO NOTHING vs trade_configurations DO NOTHING asymmetry — Worktree code-reviewer MEDIUM.** The trades INSERT uses DO NOTHING; trade_configurations now also DO NOTHING (changed in Cycle 7 fix per Gemini MEDIUM). Trades row attribute updates (icon, color) via re-running this migration would silently no-op. Operationally acceptable for now (trades attributes are stable). If realtor's icon/color need updates later, file a small WF amending the trades row directly.

- **Advisory lock 91 held for the full backfill duration — DeepSeek MEDIUM.** At 50M+ permits × 10K batch = potentially hours-long lock. Currently the backfill is the only consumer of lock 91; no other process competes. **Followup if observed:** refactor to release+reacquire lock between batches (allows concurrent classify-permits to interleave; minor complexity cost).

- **tier=1, confidence=1.0 hardcoded for realtor permit_trades rows — DeepSeek MEDIUM.** Acknowledged in Cycle 7 plan-lock as placeholder; the calibration pipeline (compute-timing.js) computes the real lead_score downstream. If realtor scoring needs different tier/confidence semantics from construction trades, file a Spec 91 amendment.

- **emitMeta read-column list inaccurate (now updated to include status) — DeepSeek LOW.** Fixed in Cycle 7.

- **setval('trades_id_seq', MAX(id)) race condition — Gemini HIGH.** Migration-time race: a concurrent INSERT into trades after the migration's INSERT but before setval could let the sequence reset below the actual MAX(id). Migrations are typically serialized in production deployments (single migration runner, no concurrent application writes during migration window), so this race is theoretical. **Defer:** if Buildo ever moves to online migrations with concurrent writes, revisit this with row-level locking.

- **Pre-existing classify-permits.js `new Date()` lint warnings on lines 79, 122, 139 — pre-existing.** Not introduced by Cycle 7. Spec 47 mandates pipeline.getDbTimestamp(pool); this is a separate cleanup.


---

## Spec 30 — WF3 Sibling Concerns Surfaced 2026-05-06

Source: WF3 worktree code-reviewer flagged this while reviewing the App Health route extraction fix.

- **`src/app/api/admin/pipelines/history/route.ts` exports TS interfaces (`PipelineHistoryRun`, `PipelineHistoryResponse`) directly from the route file (lines 15, 26).** Same class of violation that prompted the WF3 — non-handler named exports from a route file. Currently does NOT break `next build` because TypeScript interfaces are erased at compile time (the route validator only sees runtime exports). **Defer**: a future Next.js version could tighten the validator to also reject type-only exports. Move both interfaces to `src/app/api/admin/pipelines/history/types.ts` if/when this ever surfaces, or proactively if a sweep of route-file hygiene is filed.

---

## Spec 47/84/86 — WF2 Lifecycle Bands Multi-Agent Review Deferred Items (2026-05-07)

Source: Multi-Agent Review (Gemini + DeepSeek + worktree code-reviewer) of the WF2 that externalized `EXPECTED_BANDS` + 3 cross-status thresholds into `logic_variables` (migration 119).

| Severity | Source | Item | Why deferred |
|---|---|---|---|
| HIGH (design) | Gemini | **P9-P17 aggregate band masks per-phase health.** A failure in P11 (Framing) could be silently absorbed by other phases inside the aggregate. Spec 84 §3.3/§3.4 detail distinct construction stages that deserve individual `[min, max]` bands. | Pre-existing design decision (low scraper coverage ~5.5% justified the aggregate). Expanding to per-phase bands is a separate WF1 epic and requires a coverage uplift first to avoid noisy WARN spam. |
| HIGH (defensive) | DeepSeek | **Unknown-phase gate missing.** The audit loop iterates only over `EXPECTED_BANDS`; if the classifier emits a typo phase like `'P-3'` or a future `'P21'` it lands in `allCounts` but is never failed against. Indirect mitigation: the *expected* phase would then have count 0 → band check fails on it. | Defensive gap, real but not introduced by this WF2. Future WF1: add an "audit_table.cross_check_unknown_phase" that compares `Object.keys(allCounts)` against `Object.keys(PHASE_TO_LOGIC_VAR_SUFFIX)`. |
| HIGH (consistency) | DeepSeek | **`crossStalled` query does not handle `lifecycle_stalled IS NULL`.** The query `lifecycle_stalled = false` excludes NULL rows; cross-checks 2/3 already adopted `OR lifecycle_phase IS NULL`. | Pre-existing query (Bug #9 Strangler Fig downgrade comment). Fold into a future WF3 that revisits NULL-handling consistency across all three cross-checks. |
| MEDIUM | Gemini | **`ON CONFLICT DO NOTHING` blocks description corrections.** A typo in a description requires a new migration with `UPDATE`. | Intentional — same convention as migration 118 (operator-hotfix preservation). Description fixes via separate UPDATE migration is the established discipline. |
| MEDIUM | DeepSeek | **`enriched_status='Stalled'` comparison is case-sensitive.** Mixed-case data (`'stalled'`, `'STALLED'`) would silently miss rows. | Pre-existing query. Wrap into the same future WF3 as the NULL-handling item. |
| MEDIUM | DeepSeek | **Skip-path `emitSummary` lacks an `audit_table` row.** When the classifier holds the lock and this script skips, admin UI may show green for a no-op run. | Pre-existing `skipEmit: false` pattern. Pipeline-wide convention question — defer until the admin UI surfacing is built. |
| LOW | Gemini | **`p9_p17_agg_min = 0` is functionally useless** — counts can't be negative. Set to `1` for at-least-one-row guard or remove until coverage justifies a meaningful floor. | Pre-existing band shape (kept identical to old hardcoded `EXPECTED_BANDS`). Will be revisited when the per-phase expansion above lands. |
| LOW | Gemini | **Add a DB `CHECK` constraint on `lifecycle_band_*` values** to reject non-numeric operator edits at the DB layer (currently only Zod at runtime). | Hardening; not a WF2 regression. Open if the admin UI ever permits free-text edits. |
| BLOCKED | Gemini | **Rename `lifecycle_band_p3_*` → `lifecycle_band_intake_p3_*`** to match Spec 84 §3.2's `INTAKE_P3` prefixed naming for permit intake phases. | Blocked on Spec 84 §6 W11 ("ID Collision: P3/P4/P5 mean different things in CoA vs Permits — Pending Refactor"). When the classifier switches to writing `INTAKE_P3` to `permits.lifecycle_phase`, rename these `logic_variables` keys and the `PHASE_TO_LOGIC_VAR_SUFFIX` map in lockstep. Today's keys correctly mirror today's DB values. |

**False positive (worktree code-reviewer):** "migration file missing on disk" — caused by worktree isolation not picking up untracked files. Confirmed present + applied to dev DB (`INSERT 0 39`); assert script ran end-to-end with all 18 bands PASS.

---

## Spec 47/84/85 — WF3 Cross-Check Hygiene Review Deferred Items (2026-05-08)

Source: WF3 worktree code-reviewer of the cross-check #1 NULL + case-hygiene fix (also extended `LOWER()` to cross-checks #2 and #3).

| Severity | Source | Item | Why deferred |
|---|---|---|---|
| MEDIUM | worktree code-reviewer (Spec 47 §10.2) | **Inline `LOWER('stalled')` / `'active inspection'` / `'permit issued'` literals across three SQL strings — should be promoted to shared constants in `scripts/lib/lifecycle-phase.js`.** That module already exports `DEAD_STATUS_ARRAY`, `NORMALIZED_DEAD_DECISIONS_ARRAY`, etc. — designated single-source-of-truth for status vocabulary. If canonical casing of `enriched_status` ever changes, all three cross-checks silently stop matching. | Plan-lock pre-decided this as out of scope. The cleanest shape is a `STATUS_*` constant set used by both writer (`scripts/classify-inspection-status.js`) and readers (this assert script); writer-side changes plus their test surface exceed WF3 scope. **Promote to a future WF2** if either the writer's canonical casing changes OR if a third reader of `enriched_status` appears in the codebase. |

**False positive (worktree code-reviewer):** "test file is missing the 2 new `it()` blocks" — caused by worktree isolation not picking up uncommitted working-tree changes. Confirmed locally: 2 new `it()` blocks present (`grep -c "WF3 2026-05-08" → 2`); `npx vitest run` reports 8/8 passing including both new blocks.

---

## Spec 86/91/95/99 — WF3 Mig 118+119 Apply Deferred Items (2026-05-08)

Source: Worktree code-reviewer of the WF3 that brought dev DB in sync with on-disk migrations 118 (realtor wire-up) + 119 (lifecycle bands tracking).

| Severity | Source | Item | Why deferred |
|---|---|---|---|
| MEDIUM (confidence 82) | worktree code-reviewer | **Realtor row missing from `trade_sqft_rates` (mig 096 seeded 32 trades; realtor not added).** `src/lib/admin/control-panel.ts:250-253` LEFT JOINs `trade_sqft_rates` and falls back to `base_rate_sqft = 0` / `structure_complexity_factor = 1.0` for missing rows. Once `scripts/backfill-realtor-permit-trades.js` runs and produces realtor `permit_trades` rows, the cost model (`src/features/leads/lib/cost-model.ts`) will silently produce $0 cost estimates for realtor permits. Real silent-data-gap, not a crash. | Realtor has no `permit_trades` rows until the backfill script runs (Cycle 7 separate task). The silent-$0 path cannot trigger today. **Promote to a WF2** that adds a migration 120 (or extends mig 118 in a new mig) to seed `trade_sqft_rates` for realtor — should land before or with the backfill script. Spec 47 §10.3 ("Verify downstream handling before shipping a new value") was partially observed (the trade row exists, but a downstream-required join target was missed). |
| LOW | session observation | **14 prior migrations have checksum drift warnings.** The migrate.js runner emitted WARN lines for migs 089, 091, 092, 096, 099, 100, 101, 102, 103, 106, 108, 111, 112, 117. Drift is from prior commits `1da51e4` + `68643b3` that comment-only edited applied DOWN sections. The runner correctly refused to re-run them (no risk of destructive replay), but the schema_migrations row's checksum no longer matches the on-disk file. | Comment-only edits are functionally identical post-apply (the runner already executed every line including the now-commented DOWN). **Resolve via** either (a) bulk `--force` re-run after audit, (b) update the tracking row's checksum to match without re-running (`UPDATE schema_migrations SET checksum = $new WHERE filename = $f`), or (c) accept as cosmetic. Recommend (b) as a one-shot WF3 with explicit operator confirmation per file. |

**Sidebar — running permits chain at the time of WF3:** completed 21 of 28 steps before failing at step 22 (`assert_lifecycle_phase_distribution`) on the pre-existing Strangler Fig drift (`cross_check_active_inspection = 580 ≥ 500`). NOT a regression — same value yesterday was 579, threshold 500. WF2 commit `91051e0` made this threshold operator-tunable via the admin Control Panel; user will tune 500→800 via UI to flip step 22 verdict from FAIL to WARN, then re-run the chain.

---

## Spec 76/47/83 — WF2 #4 Multi-Agent Review Deferred Items (2026-05-08)

Source: Multi-Agent Review (Gemini + DeepSeek + worktree code-reviewer) of WF2 #4 admin Lead Detail Inspector diagnostic field expansion (Spec 76 §3.5 Cycle 7 amendment).

| Severity | Source | Item | Why deferred |
|---|---|---|---|
| HIGH (perf) | worktree (conf 88) + Gemini (medium) | **`lead_views` performance index missing.** Both `lv_count` LATERAL and `saved_by_admin` EXISTS subquery filter on `lead_key + saved + (user_id?)`. No matching composite index exists. The diagnostic endpoint will get progressively slower as `lead_views` grows. | Migration required — separate WF3. Add `CREATE INDEX CONCURRENTLY idx_lead_views_lead_key_saved ON lead_views (lead_key) INCLUDE (user_id) WHERE saved = true`. Not blocking — single-permit admin diagnostic, not on hot path. |
| HIGH (correctness) | worktree (conf 82) | **Liar's Gate ≤$1,000 sub-path inference.** `classifyLiarGatePath()` maps `cost_source='permit'` → `proportional_slicing` always, but Spec 83 §3D bullet 2 ("Default: Reported ≤ $1,000 use Surgical Total exclusively") may also write `cost_source='permit'`. The inference would then mislabel that path. | Needs investigation of `compute-cost-estimates.js` to see what it actually writes. If ambiguous, either heuristic + `est_const_cost` check, or persist `path` as a column on `cost_estimates` (cleanest). Filed as separate WF3. |
| MEDIUM (design) | Gemini | **`is_default_fallback` magic range 0.5..0.6 in lead-inspect-query.ts:268.** Couples the consumer query to the pipeline's default `0.55` confidence value. If the constant moves, the flag silently misfires. | Cleanest fix: add `is_default_fallback` boolean column to `permit_trades` so the producer (classifier) sets it at write time. Separate WF2. Short-term mitigation: import `DEFAULT_TRADE_CONFIDENCE` from a shared constants module (currently doesn't exist as TS export). |
| MEDIUM (deferred input) | Gemini (CRITICAL→partial) | **`structure_complexity_factor` not in cost.inputs panel.** Lives in `trade_sqft_rates` per-trade_slug, not per-permit. Surfacing it in the Cost panel (which is single-permit) would require picking a representative trade. | Better placement: add as a per-trade column in the Forecast panel. Filed as a small WF2 follow-up — schema already exists, just needs the join + UI. |
| MEDIUM (UX) | DeepSeek | **No `isFetching` indicator for background TanStack refetches.** Users see stale data flash to fresh data without a "Refreshing…" hint. | UX polish; not breaking. Add a subtle indicator if/when the inspector is used heavily and the lack-of-feedback becomes a friction point. |
| LOW (a11y) | DeepSeek | **`ErrorPanel` lacks `role="alert"` / `aria-live`.** Screen-reader users may miss new error states. | A11y enhancement. Add when the broader admin a11y sweep happens. |

**False positives (worktree code-reviewer):** none this round — all three reviews surfaced real findings.

**Resolved in commit (8 fixes folded in):**
1. ✅ Worktree #3: VALID_LEAD_INSPECT schema-drift guard test added
2. ✅ Gemini #1: `permit_type_allocation_pct` matrix lookup wired (scope_intensity_matrix LEFT JOIN); `neighbourhood_premium_tier` JS-side bracket lookup against `logic_variables.income_premium_tiers`
3. ✅ Gemini #2: Entities join refactored — JS-side `normalizeBuilderName` mirror of `scripts/extract-builders.js:34`, separate query against `entities.name_normalized`
4. ✅ Gemini #6: `lead_id` revision_num padded to 2 digits matching `LPAD(revision_num, 2, '0')` SQL convention
5. ✅ DeepSeek #1: Removed dead `'PARSE_ERROR'` from `LeadInspectErrorCode` (Zod parse errors flow through the separate `ZodError` branch)
6. ✅ DeepSeek #2: Generic-Error fallback panel branch added (renders network-error UI for non-LeadInspectError, non-ZodError throws)
7. ✅ DeepSeek #3: `useEffect` syncs `initialId` → `activeId` when parent re-passes (deep-link reactivity)
8. ✅ DeepSeek #4 + #5: `costs` prop removed from `ForecastPanel` (was unused); empty/whitespace `initialId` normalized to null via `normalizeId()` helper

---

## Spec 80 — WF2 #1 Multi-Agent Review Deferred Items (2026-05-08)

Source: Multi-Agent Review (Gemini + DeepSeek + worktree code-reviewer) of WF2 #1 `permit_type_class` foundation (mig 120 + dual-path TS/JS mirrors).

| Severity | Source | Item | Why deferred |
|---|---|---|---|
| CRITICAL (per Gemini, MEDIUM in context) | Gemini | **`ON CONFLICT (permit_type) DO NOTHING` vs `DO UPDATE SET ...`** — the `DO NOTHING` clause means a partial-apply or operator experiment leaves the prior class in place; re-running mig 120 doesn't converge. | Established codebase convention (mig 117/118/119 all use the same pattern). The intent is to preserve operator hotfixes against silent revert by re-running the migration — Spec 86 §1 admin tunability principle. Convergence-vs-preservation is a real tradeoff; the codebase has chosen preservation. Document the rationale more loudly in the migration header next time this comes up. |
| HIGH | Gemini | **`Temporary Structures` classified as `unclassified` contradicts the comment** ("minimal trades: site, electrical, sometimes plumbing"). Either reclassify as `construction` (over-includes painting/drywall) or add a `narrow_trade`/`limited_construction` enum value. | User-authorized current plan. The 4 unclassified types (Designated Structures, Partial Permit, Conditional Permit, Temporary Structures) all need WF3 description-level subtype detection to handle correctly. Adding a new enum value now would inflate scope; the right place is the WF3 that solves the broader class problem. |
| MEDIUM | Gemini | **`permit_type TEXT PRIMARY KEY` is case-sensitive + unbounded.** Inputs from CKAN may drift in capitalization or whitespace, missing the join. Suggested fix: `CHECK (permit_type = trim(permit_type))` + case-insensitive collation. | Theoretical — 247K dev-DB permits surveyed all use canonical casing. Worth adding when/if a mismatch surfaces; not blocking. |
| MEDIUM | Gemini | **DOWN procedure incomplete — operator restart of consumer apps not documented.** When the table is dropped, in-memory caches in pipeline scripts that loaded the map at startup will become stale. | Runbook concern, not code. Add to the runbook when the next operational doc sweep happens. |
| MEDIUM | worktree (conf 83) | **Parity test reads migration file text, not live DB.** A future `ALTER TYPE permit_type_class ADD VALUE 'narrow_trade'` migration would drift the live DB without breaking the parity test. | Not a regression today (no such migration exists). Documented in test header so a future engineer knows to add a `*.infra.test.ts` companion that queries `pg_enum` when the first ALTER TYPE migration lands. |
| LOW | Gemini | **`signage` reserved-but-unimplemented enum value.** Behavior is already documented in Spec 80 §5 ("only electrical+structural-steel"), but no rows or consumer logic exists yet. | Forward-compat. Will be implemented in the WF3 that adds description-level subtype detection inside `Designated Structures`. Documented as RESERVED in mig 120 + Spec 80 §5. |

**Resolved in commit (6 fixes folded in):**
1. ✅ Gemini HIGH: `updated_at` auto-update trigger added so operator UPDATE via admin UI bumps the timestamp without app-layer responsibility
2. ✅ DeepSeek HIGH (null guard): `row.class ?? UNCLASSIFIED` defensive fallback in `loadPermitTypeClassMap`
3. ✅ DeepSeek HIGH (drift detection): rows with non-canonical class values are skipped + logged via `console.warn`; the map stays canonical so consumer `=== CONSTRUCTION` checks remain correct
4. ✅ DeepSeek MEDIUM (silent catch): REMOVED the silent `try/catch` swallowing all DB errors — startup failures now propagate to the caller (Spec 47 §R5 startup-guard pattern; same lesson as commit `0f2b3d7`'s `fetchNeighbourhoodPremiumTier` fix)
5. ✅ DeepSeek MEDIUM (Map guard): `classifyPermitType()` validates `classMap instanceof Map` before calling `.get()` — non-Map input returns `UNCLASSIFIED` (safe-skip) instead of crashing the pipeline mid-run
6. ✅ Worktree MEDIUM (doc note): Added explicit note to `permit-type-class.logic.test.ts` that the parity test reads the migration file text and DOES NOT catch live-DB drift via `ALTER TYPE`. Future migration that adds an enum value MUST add a companion `*.infra.test.ts` querying `pg_enum`.

---

## Spec 41/80/91 — WF2 #2 Multi-Agent Review Deferred Items (2026-05-08)

Source: Multi-Agent Review (Gemini + DeepSeek + worktree code-reviewer) of WF2 #2 classifier gating on `permit_type_class`.

| Severity | Source | Item | Why deferred |
|---|---|---|---|
| CRITICAL (per worktree, conf 90) | worktree #1+#2 | **`runAt` parameter parity drift between JS↔TS classifiers.** JS `applyClassGating` accepts `runAt` and threads it to `appendRealtorMatch` → `calculateLeadScore(permit, partial, phase, runAt)`. TS `applyClassGating` doesn't have `runAt` because TS `calculateLeadScore(permit, partial, phase)` uses `new Date()` internally for freshness/staleness. → Realtor `lead_score` differs between JS and TS paths for the same permit. Spec 47 §R3.5 Midnight Cross + Spec 7 §7.1 dual-path violations. | **Pre-existing** — TS `calculateLeadScore` in `src/lib/classification/scoring.ts:102` already used `new Date()` before this WF. WF2 #2 mirrors the existing pattern in each surface, doesn't introduce the drift. Fixing requires expanding `calculateLeadScore` signature across 10 call sites + `scoring.ts` rewrite. **Promote to a separate WF3** for explicit Midnight Cross hardening of TS classifier. |
| MEDIUM | DeepSeek #6 | **`classifyPermit` defaults `permitClass = UNCLASSIFIED` — silent zero matches for callers that forget to thread the option.** | **Intentional safe-skip per plan-lock.** The default IS the conservative behavior for unknown call sites — over-classifying with the full matrix is the WORSE outcome. Documented at the parameter's JSDoc + Spec 80 §5. A runtime warn would be too noisy. Defer permanently. |
| HIGH (Gemini) | Gemini all | **classify-permits.js architectural concerns** — multi-transaction race, hardcoded business logic duplicated TS↔JS, ghost-trade `unnest` query fragility, 30-day month math, non-deterministic work fallback iteration. | **Pre-existing** structural concerns that long predate WF2 #2. Each is a worthy separate WF; none introduced by this change. Architectural rewrite of classify-permits.js belongs in a dedicated initiative. |
| HIGH (DeepSeek) | DeepSeek #1-3 | **TS classifier pre-existing concerns** — `extractPermitCode` regex misses start-of-string, `applyScopeLimit` only applies first matching pattern, `NARROW_SCOPE_CODES` hardcoded slugs. | **Pre-existing.** Same architectural origin as Gemini's findings. Defer. |
| MEDIUM (DeepSeek) | DeepSeek #4-7 | TS non-null asserts, regex injection in tier 3 fieldMatches, hardcoded `REALTOR_TRADE_ID = 33`, `classifyProducts` `product_id ?? 0` | Pre-existing. Defer. |

**Resolved in commit (4 fixes folded in):**
1. ✅ Worktree IMPORTANT #3: Added 6 integration tests in `classification.logic.test.ts` for non-construction classes through full `classifyPermit` chain (administrative/unclassified empty; safety_upgrade narrow; signage narrow; realtor gated to construction)
2. ✅ Worktree IMPORTANT #4: Per-class breakdown rows added to `audit_table` in `classify-permits.js` (`class.construction`, `class.signage`, `class.administrative`, `class.safety_upgrade`, `class.unclassified`) so operators can confirm zero-trade emission for non-construction permits
3. ✅ Test coverage: 30+ existing call sites in `classification.logic.test.ts` updated with `{ permitClass: 'construction' }` to preserve the asserted matrix behavior under the new contract
4. ✅ Spec amendments: Spec 41 step 13 (replaced WF2 #1 forward-ref with implemented behavior table), Spec 80 §5 (Consumer behaviors subsection), Spec 91 §3.5 (realtor gating note), Spec 47 §10.2 (per-class behavior policies subsection)

**Followup WF3 candidate (carved out):** **Orphan cleanup of pre-existing wrong rows.** WF3 investigation 2026-05-08 found 14,090 wrong Fire/Security Upgrade trade rows + 12,026 Designated Structures trade rows + 3,657 DCs DeferredFees trade rows + ~10,141 wrong realtor rows on non-construction permits. WF2 #2's gating prevents NEW wrong rows from being written, but the existing rows persist until either (a) `classify-permits.js --full` re-runs (mass UPSERT path) or (b) an explicit DELETE pass scoped per non-construction permit_type. Filed as a small WF3 to run after WF2 #2 + #3 stabilize.


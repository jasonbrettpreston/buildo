# Active Review Follow-ups (Consolidated)
_Generated following the Pipeline Clean-up Mandate. Trimmed 2026-05-05 — full prose history of resolved batches recoverable via `git log -p docs/reports/review_followups.md`._

---

## classify-coa-scope.js R5.3 — plan-review + Pre-Review deferrals (2026-05-14)

Source: 3-reviewer adversarial plan review (Gemini + DeepSeek + worktree feature-dev:code-reviewer) on the WF1 R5.3 plan, plus Pre-Review Self-Checklist item (l) verification against the live script.

**Plan-review DEFERs (7 items, mostly out-of-scope spec concerns):**

| Severity | Source | Item | Why deferred |
|---|---|---|---|
| CRIT | DeepSeek | lead_id LPAD truncation collision risk | **ALREADY FIXED**: WF3 #lpad-revision-num-collision (commit `4b9ff32`) corrected Spec 42 §6.6.A.1 + added mig 138_a admin-exclusion. DeepSeek didn't have visibility into the most recent commits. |
| CRIT | DeepSeek | lifecycle_status_history natural key `date_trunc('second')` allows silent drops within same second | Out of R5.3 scope (separate spec section + separate script `classify-lifecycle-phase.js`). File as follow-up to Spec 84 hardening WF. |
| HIGH | DeepSeek | `assert_coa_freshness` WARN-only — won't halt chain on prolonged CKAN outage | Operational concern, out of R5.3 scope. |
| HIGH | DeepSeek | `permits.linked_coa_application_number` single-value column loses data on multi-CoA-to-permit linkage | Out of R5.3 scope (link_coa.js concern). |
| MED | DeepSeek | Phase distribution gate edge case on Seq with row_count=1 | Out of R5.3 scope (assert-lifecycle-phase-distribution.js). |
| MED/LOW | DeepSeek | lead_id format CHECK regex tightness; advisory lock deadlock potential | Operational concerns; one already mitigated. |
| LOW | DeepSeek | Mobile API should expose `lead_type` field derived from prefix | Out of R5.3 scope (Spec 91 mobile concern). |

**Pre-Review Self-Checklist (l) — RESOLVED during Green Light (not a defer):**

The initial verdict on item (l) was based on a search for `load_at` updates in `load-coa.js`. During Green Light live-run, discovered that **`load_at` does NOT EXIST** as a column on `coa_applications` — Spec 42 §6.8 row 666 names the idempotency anchor `load_at` but the actual column is `last_seen_at`. `load-coa.js:282` bumps `last_seen_at` ONLY when `data_hash IS DISTINCT FROM EXCLUDED.data_hash` (i.e., source content changed). That's exactly the contract the classifier needs: `scope_classified_at < last_seen_at` correctly fires re-classification after CKAN amendments. The script's filter was updated to use `last_seen_at` (spec-drift correction documented inline). **NO follow-up WF3 needed.**

---

## mig 139 — Phase C composite-UNIQUE WF3 follow-ups (2026-05-14)

Source: 3-reviewer reviews across two passes (plan + diff). Plan-review findings already triaged in the active task. Diff-review (post-Fix) findings appended below:

**Diff-review (post-Fix) triage (Gemini + DeepSeek + worktree, 2026-05-14):**

Worktree verdict: **GO** with no issues found (all 8 checklist items PASS).

| Severity | Source | Item | Why deferred |
|---|---|---|---|
| **CRIT** | Gemini diff | Race condition: CREATE UNIQUE INDEX CONCURRENTLY runs in its own implicit transaction; a concurrent insert between Stage-2 pre-check and index validation could introduce a dup pair, failing the build mid-stream | **DEFER (already covered in plan-review)**: deploys run quiet; chain orchestrator advisory locks prevent concurrent pipeline writes. The composite Stage-2 check now matches the index shape exactly, so any racy insert that *could* land a dup would also have to bypass the existing PK `(permit_num, revision_num, trade_slug)` which is impossible by construction. |
| **HIGH** | Gemini diff | `ALTER TABLE ... SET NOT NULL` acquires ACCESS EXCLUSIVE and full-scans 654K rows → service outage on a live system. Suggested pattern: `ADD CONSTRAINT ... CHECK (col IS NOT NULL) NOT VALID` → `VALIDATE CONSTRAINT` → `SET NOT NULL` (now metadata-only) → `DROP CONSTRAINT` | **DEFER project-wide**: sibling mig 138 (already shipped at commit `4b9ff32`) uses the same direct `SET NOT NULL` pattern; changing only mig 139 to the zero-downtime pattern is inconsistent. File a project-wide hardening WF that retrofits all Phase B/C NOT NULL promotions (mig 138/139/140/141) to the NOT VALID + VALIDATE pattern in one atomic change. |
| MED | Gemini diff | Stage-2 dup pre-check executes the same `GROUP BY (lead_id, trade_slug) HAVING COUNT > 1` twice (count + sample lookup) — wasteful on 654K-row scans in the abort path | **DEFER**: the dup-sample path only runs on Stage-2 FAILURE (the rare error case). The healthy path runs the GROUP BY once. A CTE/MATERIALIZED rewrite would have to be carefully shaped because CTE scope ends at statement boundary — Gemini's suggested form `WITH duplicates AS (...) SELECT COUNT(*) FROM duplicates; IF ... SELECT ... FROM duplicates` is invalid SQL (the CTE doesn't persist across the IF boundary). |
| MED | Gemini diff | Order: ALTER SET NOT NULL before CREATE UNIQUE INDEX CONCURRENTLY — if the index build fails (which is the most likely step), the table is left half-migrated | **BUG → folded**: reordered to run CREATE INDEX before ALTER SET NOT NULL. If CREATE fails, table stays nullable for easier rollback. |
| MED | DeepSeek diff | `SET LOCAL statement_timeout` "persists for the remainder of the database connection" | **REJECTED — incorrect**: `SET LOCAL` is scoped to the current transaction and reverts on commit/rollback per PostgreSQL semantics. DeepSeek conflated with `SET` (session-level). The migration runner's connection-reuse behavior is irrelevant. |
| MED | DeepSeek diff | `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS` could leave an "INVALID" index after racy insert | **DEFER**: same as Gemini CRIT — race-condition concern at deploy time. Project's existing deploy contract (quiet maintenance window + advisory lock orchestration) covers this. |
| LOW | DeepSeek diff | `DROP INDEX CONCURRENTLY` could block on a conflicting lock | **DEFER**: operational concern; `IF EXISTS` already handles missing-index case. |
| LOW | DeepSeek diff | DOWN block irreversible (comment-only) | **DEFER**: project convention per Rule 6 / commit 8b1c10b — all migrations use comment-only DOWN. Consistent with mig 132, 138, 140, 142, 145. |
| HIGH | DeepSeek diff | Composite UNIQUE not yet promoted to PRIMARY KEY → Phase H gap | **DEFER**: Spec 42 §6.6 explicitly plans the PK swap in Phase H. This migration is the prerequisite that creates the index in the correct shape; the PK swap will use `ALTER TABLE ... ADD PRIMARY KEY USING INDEX uniq_trade_forecasts_lead_id_trade` in Phase H. Working as designed. |
| LOW | Gemini diff | Redundant `WHERE lead_id IS NOT NULL` in Stage 2 pre-check (Stage 1 already guarantees no NULLs) | **DEFER**: belt-and-suspenders defensive coding — Stage 1 aborts if NULLs present, but the explicit WHERE in Stage 2 makes the query stand alone if it's ever copied to another context. Style preference. |
| NIT | DeepSeek diff | Colon separator `lead_id || ':' || trade_slug` in dup sample is ambiguous if either contains a colon | **DEFER**: trade_slug values are slugified (no colons). Cosmetic. |
| NIT | DeepSeek diff | `IF NOT EXISTS` on `CREATE INDEX CONCURRENTLY` not standard SQL | **DEFER**: PostgreSQL extension, supported on all targeted versions. Style. |

**Plan-review triage (carried over):**
12 findings — 4 BUGs folded inline, 2 REJECTED (see below), 6 DEFER (5 below + 1 documented in #7).

| Severity | Source | Item | Why deferred |
|---|---|---|---|
| HIGH | DeepSeek | `SET LOCAL statement_timeout` doesn't apply because the file runs non-transactionally (per `scripts/migrate.js:195`, CONCURRENTLY-containing files split into individual statements, each in its own implicit transaction; `SET LOCAL` scope is the current transaction only) | **DEFER**: technically correct but no real impact in practice — sibling mig 138 has the same structure and applied in 1366ms. Project-wide cleanup opportunity: either (a) move `SET LOCAL` into each DO block that needs it, or (b) drop the SET LOCAL and rely on database default. Either way is bigger than this WF3. |
| NIT | DeepSeek | 5min timeout estimate is stale; production table may have grown | **DEFER**: 654K rows builds in <60s on dev hardware; 5min is generous. Re-evaluate before any prod-equivalent deploy. |
| NIT | DeepSeek | SET LOCAL placement before the DO blocks is logically inconsistent | **DEFER**: subsumed by HIGH SET LOCAL no-op finding. |
| MED | Gemini | Race condition between pre-checks and DDL (concurrent inserts could land between Stage-2 check passing and CREATE UNIQUE INDEX building) | **DEFER**: deploys run against quiet systems with chain orchestrator advisory locks preventing concurrent pipeline writes. The CONCURRENTLY index build itself is concurrent-safe; if a writer slips in a duplicate during the build window, the CONCURRENTLY operation marks the index invalid and the migration runner surfaces the error rather than committing a corrupt index. |
| LOW | Gemini | DOWN block restores the partial index but original may have been a full index | **DEFER**: original index was the Phase B partial `WHERE lead_id IS NOT NULL` (verified via mig 134 line 69 — not a full index). DOWN is correct. |
| CRIT/HIGH/MED/LOW | Gemini | Spec §6.6.A LPAD truncation / dual-ledger / DEFAULT NOW() / Phase H big-bang / lifecycle_status_history idempotency | **OUT OF SCOPE**: these are Spec 42 §6.6.B + Spec 84 + Spec 85 architectural concerns; mig 139 doesn't touch them. Spec §6.6.A LPAD finding was already addressed in prior WF3 commit `4b9ff32` (Spec 42 §6.6.A.1 amended to document actual truncation semantics). |

**REJECTED findings (2):**
- **DeepSeek CRIT** *"`CREATE UNIQUE INDEX CONCURRENTLY` cannot run inside a transaction block — the migration will fail"*: **INCORRECT**. `scripts/migrate.js:195` explicitly detects `CONCURRENTLY` keyword and routes the file non-transactionally (splits top-level statements; each runs in its own implicit transaction). Same pattern as mig 132 + mig 138 which both applied cleanly. DeepSeek assumed a generic migration runner that wraps everything in BEGIN/COMMIT.
- **DeepSeek MED** *"`DROP INDEX CONCURRENTLY` same transaction concern"*: REJECTED for the same reason as above — derivative of the (rejected) CRIT finding.

---

## migrate-to-lead-id.js + deriveLeadId — LPAD-collision WF3 follow-ups (2026-05-14)

Source: 3-reviewer adversarial plan review on WF3 #lpad-revision-num-collision (Gemini + DeepSeek + worktree feature-dev:code-reviewer, user-requested adversarial). 14 findings total — 6 BUGs folded into the WF3 commit (administrative-exclusion + LPAD-collision preflight + Spec 42 §6.6.A.1 truncation correction + 4 plan refinements), 1 REJECTED (see below), 8 DEFER below.

| Severity | Source | Item | Why deferred |
|---|---|---|---|
| HIGH | Gemini | tracked_projects-empty preflight (from prior WF3 #migrate-to-lead-id-lead-type-drift) is "overly restrictive — remove it; per-UPDATE `WHERE` clauses are sufficient" | **REJECTED**: the preflight was added by the prior WF3 as the Worktree C3 fix to enforce one-shot semantics after the R5.3 trigger-based dual-write pivot. Removing it would re-introduce the corruption risk for future Phase D CoA rows that have valid permit_num/revision_num (schema NOT NULL) but should not be backfilled with `'permit:...'` lead_ids. The per-UPDATE guards alone are insufficient because the schema permits valid permit_num/revision_num on CoA rows. Documented here so the finding isn't re-raised. |
| MED | Gemini | tracked_projects post-backfill null-count check is asymmetric — should also detect rows that SHOULD have been backfilled but weren't | Observability gap, not introduced by this WF3. Add a positive assertion (`COUNT(*) WHERE lead_id IS NULL AND permit_num IS NOT NULL AND revision_num IS NOT NULL = 0`) when next-touched. |
| LOW | Gemini | `LPAD(revision_num, 2, '0')` takes implicit cast on a text column — explicit `::text` cast would be more robust | Schema confirms `revision_num VARCHAR(10)`; implicit cast is safe. Style improvement to apply when next-touched. |
| NIT | Gemini | Multiple separate COUNT preflight queries — combine into a single round-trip with UNION/CASE | Micro-optimization for a one-shot script that runs in seconds. |
| MED | DeepSeek | `deriveLeadId` does not `.trim()` `permit_num` / `application_number` — silent corruption risk on whitespace-bearing values | Pre-existing data-hygiene concern. No evidence of whitespace in production data; CHECK constraints on lead_id format would catch most cases. |
| MED | DeepSeek | `typeof input === 'object'` allows arrays (`typeof [] === 'object'`). Defensive guard recommended | Style. Array inputs are not produced by any caller in the current codebase. |
| LOW | DeepSeek | Mixed use of `String(...)` wrapping — consistency suggests applying it to all three input fields | Style; both forms work for the validated-truthy inputs. |
| NIT | DeepSeek | JSDoc on `deriveLeadId` missing `@throws`; consider enriching error messages with the bad value | Documentation polish. |

**Documented invariant (carried forward to future LPAD-policy hardening WFs):**
The canonical `permit:<num>:LPAD(rev,2,'0')` form requires `LENGTH(revision_num) ≤ 2` AND `revision_num` to be a 2-char zero-padded string for the "first revision" (`'00'` not `'0'`). Production ingestion must produce values in this canonical form. The migrate-to-lead-id.js script enforces both invariants at preflight. Future ingestion scripts that write to `permits.revision_num` (e.g. `scripts/load-permits.js`) should normalize to the 2-char zero-padded form upstream — this work was DEFERRED to a future Phase C/H hardening WF.

---

## migrate-to-lead-id.js — Phase C hardening followups (WF3 2026-05-14)

Source: 3-reviewer adversarial plan review on the lead_type-drift WF3 (Gemini + DeepSeek + worktree code-reviewer, user-requested adversarial). 14 findings total — 5 BUGs folded into WF3 commit, 1 INCORRECT (DeepSeek CRIT advisory-lock claim, see below), 8 DEFER below. All DEFER items are pre-existing weaknesses in `scripts/migrate-to-lead-id.js` not introduced by the WF3 fix — appropriate destination is a future Phase C hardening WF or `tasks/lessons.md` if a pattern emerges.

| Severity | Source | Item | Why deferred |
|---|---|---|---|
| HIGH | Gemini | `lead_analytics` backfill blindly trusts `lead_key` format — should regex-check `lead_key ~ '^(permit|coa):.+$'` before copying | Pre-existing. `lead_analytics` is empty per R0.7 audit so no immediate exposure. The `chk_lead_analytics_lead_id_format` CHECK constraint (mig 134) would catch malformed values at write time even without the regex pre-filter, but the failure would be opaque (constraint violation instead of pre-filter skip). Worth hardening when `lead_analytics` starts getting populated in Phase D. |
| HIGH | DeepSeek | Preflight only validates `permits.revision_num` length, not consumer tables — silent LPAD truncation if consumer tables have wider values | Transitively enforced: `cost_estimates.revision_num` and `trade_forecasts.revision_num` come from `permits` via FK + INSERT...SELECT, so their values mirror `permits`. Worth adding the explicit cross-table assertion if Phase E/F changes any of those write paths. |
| MEDIUM | Gemini | Empty-string guards missing on `permit_num`/`revision_num` — could produce `'permit::01'` malformed lead_ids | Pre-existing. `chk_*_lead_id_format` CHECK (`~ '^(permit|coa):.+$'`) requires non-empty content after the colon so an empty `permit_num` would surface as a CHECK violation rather than silent corruption. Cleaner pre-filter is `AND permit_num <> ''` but not blocking. |
| MEDIUM | Gemini | Preflight full table scan on `permits.LENGTH(revision_num) > 2` will degrade as table grows | 247K rows scans in ms today. Operational concern that emerges at 10M+ rows. |
| MEDIUM | Gemini | `deriveLeadId` JS twin imported but not used in script (inline SQL LPAD instead) — TS/JS dual-path drift risk | Partially mitigated by the existing typeof import check at startup. Full drift-test belongs to a Spec 84 §7 follow-up that exercises the JS twin and a database wrapper function against the same input matrix. |
| MEDIUM | DeepSeek | Post-backfill null-count check exempts `tracked_projects` without log/comment explaining why | Documentation-only — the exemption is correct (Phase D CoA rows expected to land with NULL `lead_id` until classification) but a future operator troubleshooting may misread the omission. |
| NIT | Gemini | Spec §6.6.A LPAD truncation description contradicts implementation behavior | Spec-text edit, low blast radius. Schedule with the Phase E spec hardening pass. |
| NIT | Gemini | Template literal `${table}` interpolation in post-backfill loop — safe here (hardcoded array) but normalizes a risky pattern | Add `// SAFETY:` comment when next-touched, or refactor to use `pg-format` `%I` identifier quoting. |

**Rejected from this WF3 (DeepSeek CRITICAL — incorrect finding):**
DeepSeek flagged the advisory-lock-vs-transaction client mismatch as a CRITICAL concurrency bug. This is incorrect: `pg_try_advisory_lock` is session-level on the lock-holding client. Any concurrent invocation of the script tries `pg_try_advisory_lock` on its own client, fails because the lock is held by another session, and exits via the §R12 SKIP path (`acquired=false`). The callback's queries running on different pool clients does not break serialization — only the database-level lock matters for cross-process serialization. Standard Spec 47 pattern shipped on 50+ scripts. No action.

---

## WF1 #coa-pipeline-parity-phase-a R2.v2 Multi-Agent Review Deferred Items (2026-05-13)

Source: R2.v2 re-review on `.cursor/active_task.md` + `docs/specs/01-pipeline/42_chain_coa.md` (Gemini + DeepSeek + worktree code-reviewer, after Round 1 BUG fixes + granular-first reframing + `lifecycle_status_history` unified table). 11 BUGs documented as known issues in the active task itself (under "Known Issues — Documented for Implementation"). Items below are accepted-and-deferred per user direction "B — authorize as-is with documented known issues."

| Severity | Source | Item | Why deferred |
|---|---|---|---|
| MED | DeepSeek DEFER MED | R5 cross-ref consistency between sequential spec edits (e.g., Spec 84 → Spec 42 edits drift on table names) | Mitigated by R8 multi-agent review covering the final post-edit state. |
| MED | DeepSeek DEFER MED | CoA "Deferred"/"Postponed" status explicit handling in §A.1.3 | Already covered by the catchall rule + `unmapped_status` audit metric documented in §A.1.3. Verified during triage. |
| LOW | DeepSeek DEFER LOW | P18/P19/P20 phase-label drift in Spec 84 §3 (`INSPECTION_PIPELINE_P18_SET` vs spec text "Project Closed", etc.) | Pre-existing per bug 84-W1 family; documented in §6.5 step 22 disposition. Defer to Phase H cleanup. |
| LOW | Gemini DEFER LOW | §A.6 "NO CHANGE" header rename to "Adherence Note" | Cosmetic; address opportunistically during R5.6. |
| NIT | Gemini DEFER NIT | `coa-handoff.infra.test.ts` JOIN through `lifecycle_status_history` requires Phase C `lead_id` backfill | Confirmed working post-Phase C. Test runs in Phase F regardless. |
| UNVERIFIED | DeepSeek | `npm run system-map` regeneration risk on frontmatter edits | Add dry-run check before final regeneration in R5.15. |
| UNVERIFIED | DeepSeek | R0.5 doesn't profile overall data inventory (counts / null rates / status distribution) | Accept — spec values come from the locked 2026-05-12 snapshot. Profiling is operational hardening, not plan-blocking. |

**HIGH/CRIT BUGs absorbed inline (documented in active task §Known Issues, not deferred to follow-up WF):** 11 items covering writer enumeration, step numbering, SKIP_PHASES correction, Phase A scope clarification, schema duplication removal, R5 plan completeness (Spec 86), seed-validation test naming, CSV regeneration validation, column-name mapping, schema doc inclusion, and R0.5 query #3 replacement. All addressed during R5 execution of WF1 #coa-pipeline-parity-phase-a.

---

## Spec 42 §6 — WF2 #coa-pipeline-parity R0 Multi-Agent Review Deferred Items (2026-05-13)

Source: R0 plan review on `docs/specs/01-pipeline/42_chain_coa.md` §6 (Gemini + DeepSeek adversarial + worktree code-reviewer). Items below are accepted-and-deferred — either pre-existing pipeline concerns, operational hardening that fits a later WF, or specificity that resolves at WF1 plan-lock.

| Severity | Source | Item | Why deferred |
|---|---|---|---|
| MEDIUM | Gemini #4 | **CKAN source schema-change resilience** — what if the CKAN provider fixes the `C_OF_A_DESCISION` typo or renames `WARD_NUMBER`/`WARD`? `assert_schema` (step 1) only validates metadata existence, not column-name stability. | Pre-existing concern across the pipeline; belongs in a global CKAN schema-drift hardening pass. |
| MEDIUM | Gemini #6, DeepSeek #6 | **Geocoding failure behavior in `load-coa.js`** — ungeocoded CoAs silently skip parcel linking. No fallback (address-point-only) or retry strategy. | Skipped rows surface in `assert-global-coverage.js` as a parcel-coverage gap. Operational tuning during Phase D. |
| MEDIUM | Gemini #7 | **Brittle keyword classifier — no operational playbook.** New `classify-coa-scope.js` + `classify-coa-trades.js` use heuristics with no dead-letter queue, no manual-review process, no post-launch monitoring/tuning plan. | Captured as Open Decision #1 in §6.13. Playbook lives in Phase D handoff doc, not the spec. |
| LOW | Gemini #8, DeepSeek #5 | **Advisory lock timeout / deadlock recovery** — what if a script crashes holding 4201/4202? What lock-ordering prevents cross-chain deadlock between 84 and 4201? | Spec 47 §R6 already governs lock lifecycle for all scripts. Not unique to this WF. |
| LOW | Gemini #9 | **Transactional integrity** — atomic-write boundary unclear for new scripts on bad-row failure. | Spec 47 §R9 (`withTransaction`) mandates full rollback. Not unique to this WF. |
| HIGH | Gemini #10 | **Universal applicability of permit `trade_mapping_rules` to CoA descriptions** — assumes the Tier-3 rule set works for CoA prose as for permit prose. Vocabulary may diverge. | Testable during Phase D against fixtures. If accuracy < 80%, fall through to LLM v2 per Open Decision #1. |
| MEDIUM | Gemini #11 | **Legacy column deprecation dependency audit** — Phase H drops `permit_num`/`revision_num` from hot-path tables without auditing external BI tools, analyst queries, downstream systems. | Add to Phase H gate as a precondition; tracked here as operational follow-up. |
| MEDIUM | Gemini #13 | **Synchronous geocoding at ingest** couples primary ingestion with external API latency. | Open Decision #2 in §6.13 (recommendation: bundle; revisit if step 2 latency > 60s p95). |
| HIGH | Gemini #14 | **`lead_id` backfill performance** — Phase C's `migrate-to-lead-id.js` updates millions of rows. No batched-update strategy documented. Naive `UPDATE` could lock tables for hours. | Add batched-update detail to Phase C deliverable at WF1 plan-lock (BATCH_SIZE, off-peak window, lock-acquisition timing). |
| LOW | Gemini #15 | **Band recalibration heuristic (median ± 30%)** is arbitrary. | Tune iteratively per Phase E gate; final values committed to `scripts/seeds/logic_variables.json`. |
| LOW | Gemini #16 | **"Sane" as a Phase C gate metric** — not quantitatively measurable. | Tighten gate to specific threshold (e.g., `opportunity_score` p50 within ±10% of pre-migration baseline) at WF1 plan-lock. |
| MEDIUM | Gemini #5, partial | **PRE-permit cutover race** — what if a CoA gets a real permit linked during the Phase G one-time DELETE pass? | Add to Phase G operational runbook: run DELETE inside `withTransaction` after `link-coa.js` quiesces; or gate on advisory lock 4205. |
| MEDIUM | DeepSeek #12 | **Downstream-consumer verification before PRE-permit retirement** — Phase G assumes the score engine, mobile feed, and CRM all handle `lead_type='coa'`. Not gated explicitly. | Add Phase G gate criterion: "every consumer integration test verified to read `lead_id` and dispatch correctly on `lead_type`." |
| LOW | DeepSeek #4 | **`street_name_normalized` NULL handling** in `link-coa.js`. | Already handled: tier cascade falls through to Description FTS (Tier 3, 0.10–0.50 confidence). |
| LOW | DeepSeek #7 | **CKAN API downtime / retry / backoff.** | Pre-existing global pipeline concern; covered by Spec 40 SDK retry semantics. |
| LOW | DeepSeek #8 | **`effective_match_rate_pct` false-positive PASS** — gate passes when `potential_matches = 0`, even though unlinked CoAs may exist without matching permits yet. | Existing behavior; not introduced by this WF. |
| LOW | DeepSeek #9 | **Phase-distribution skip accumulation** — `assert_lifecycle_phase_distribution` can skip multiple days on persistent lock conflict. | Existing behavior. Alerting on skipped-N-days-in-a-row is a separate observability WF. |
| LOW | DeepSeek #10 | **Address-normalization version parity** — assumes `normalizeStreetName` returns identical output for CoA + permit. No contract test. | Add `address-normalization-parity.logic.test.ts` to Phase B test list. |
| LOW | DeepSeek #13 | **CKAN SQL endpoint throttling** at full-load scale. | Pre-existing. |
| LOW | DeepSeek #14 | **`link-coa.js` join complexity** — joins on `street_name_normalized + street_num` without explicit indexes. | Existing behavior; index audit in Phase B migration. |
| LOW | DeepSeek #15 | **Advisory lock ID collision risk** between 4201–4205 (Spec 42 + suffix) and future scripts. | Mitigated by Spec 47 §R2 "lock ID = spec number" convention. |
| LOW | Worktree DEFER1 | §6.12 item 3 wording on QUESTIONABLE sequencing review contradicts Phase A scope. | Minor wordsmithing in next spec amendment. |
| LOW | Worktree DEFER2 | `lead_analytics.lead_key` alias view not tracked in any migration phase. | Add to Phase B migration concretization at WF1 plan-lock. |
| LOW | Worktree DEFER3 | Spec 80 amendment description lacks decision-tree specificity (keyword count, regex-vs-ILIKE). | Resolves at WF1 plan-lock when classifier rules are enumerated. |
| LOW | Worktree DEFER4 | **Spec 49 missing from §6.10 cross-spec changes** despite being a `lifecycle_phase IS NOT NULL ≥ 95%` audit gate consumer per Spec 84 §8.2. | Add Spec 49 row to §6.10 in next spec amendment pass. |

**BUGs identified — recommend fixing in spec text before plan-lock (8 items):**
1. §2 step-count framing — current 12 vs target 22; §3 Behavioral Contract still references pre-permit generation as core logic.
2. `coa_parcels` / `coa_trades` stragglers in §6.5 lines 237/239/248 and Spec 84 §8.9 lines 1557/1559/1577 → rename to `lead_parcels` / `lead_trades`.
3. `link-coa-neighbourhoods.js` shares advisory lock 4201 with `link-coa-to-parcels.js` (Spec 47 §R2 violation) → assign 4202 or formally bundle.
4. `lifecycle_transitions.from_seq/to_seq` comment in §6.6.B says "nullable schema prep — populated by future lifecycle-engine WF" but §6.7 says this WF populates them. Comment fix.
5. §6.5 step 12 `link_similar` row says "YES — NEW `link-coa-similar.js`" but §6.12 defers. Align to "DEFER — v2".
6. `LPAD(revision_num::text, 2, '0')` cast missing in §6.4 test description and §6.9 lib description (inconsistent with §6.6.A canonical form). Standardize.
7. 84-W11 P3/P4 namespace collision not in §6.10 Spec 84 amendment deliverable list. Add resolution to Phase A.
8. CKAN `coa_applications.status` enumeration exhaustiveness — §6.7 lists specific status values; future CKAN additions would silently NULL `lifecycle_phase`. Add catchall fallback rule.

## WF1 #C (2026-05-11) — Multi-Agent Review deferrals from admin Lifecycle Timeline panel
_Source: pre-implementation R0 Gemini review of the plan itself (7 findings, 5 folded into plan) + post-implementation R8 multi-agent review of the component code (Gemini + DeepSeek + worktree code-reviewer). 8 BUGs fixed in-loop; remaining items catalogued below._

**Applied in this commit (R9 in-loop fixes):**
- ✅ **Worktree BUG 1** — `LifecycleTimelinePanel` was mounted inside `Section`'s `<dl className="grid md:grid-cols-2">` wrapper, which crammed the full-width chevron timeline into a half-width grid cell at md+ breakpoints (admin's primary target). Now rendered directly in `LeadDetailInspector` with its own card styling, NOT wrapped in `<Section>`.
- ✅ **Worktree BUG 2** — `UnreliableMarker` now has `tabIndex={0}` + focus ring so keyboard users can Tab to it and the `title` tooltip fires on focus (was reachable only by mouse hover, violating Spec 33 §9 keyboard-nav mandate).
- ✅ **Gemini CRITICAL** — `TERMINAL_PHASES = new Set(...)` hoisted from inside the render function to module scope (was being recreated on every render, GC pressure).
- ✅ **Gemini HIGH (loading state)** — early-return `if (loading) return <LoadingSkeleton />` regardless of timeline shape (was guarded by `(timeline == null || length === 0)` which skipped the skeleton when stale data was present, producing content-pop on re-fetch resolution).
- ✅ **Gemini MED** — magic number `30` extracted to `COHORT_MINIMUM_RELIABLE_SAMPLE_SIZE` named constant.
- ✅ **Gemini LOW** — `CohortPill` `aria-label` now uses the user-facing label ("on track" / "trending slow" / "stalled" / "no cohort data") instead of internal band keys ("on-track" / "amber") so screen-reader output matches visible text.
- ✅ **DeepSeek MED (84-W11 reference wrong)** — off-path tooltip now references "Spec 84 §3 canonical phase paths" instead of bug 84-W11 (which is about P3/P4/P5 ID collisions in CoA vs Permits, NOT off-path detection). Also dropped the visible "(84-W11)" suffix from the marker text.
- ✅ **DeepSeek LOW (missing chevron edge case)** — chevron between completed and upcoming regions now renders when `(currentEntry || completed.length > 0)` (was only `currentEntry`, leaving a gap when timeline had completed + upcoming but no current).

**Rejected:**
- **Worktree BUG 3** — fixture files and Maestro flow "missing from repository": **false positive**. The worktree agent ran against `main` `1967733` which doesn't include WF1 #C's uncommitted new files. All 4 files (`src/tests/fixtures/lifecycle-timeline-{terminal,mid-pipeline,off-path}.fixture.json` + `mobile/maestro/realtor-end-to-end.yaml`) exist in this commit.
- **Gemini HIGH (`title` attribute inaccessibility)** — fair principle in general but `title` is the de facto V1 standard without a tooltip library dependency. `lucide-react` + Radix Tooltip together belong in a future Spec-33-conformance WF that introduces the shared admin icon + tooltip primitives. The current implementation pairs `title` with `aria-label` + `tabIndex` so screen-reader users get the message via the aria channel even if `title` is announced inconsistently.
- **DeepSeek HIGH (`h-11 w-11` too large)** — directly conflicts with Spec 33 §9 ("Touch targets ≥44px on tooltip triggers"). The 44×44 wrapper is the touchable area; the visible SVG is 14×14 centered inside it. Standard a11y pattern.
- **DeepSeek MED (`classifyCohortBand` crashes on nulls)** — false positive; null inputs return `'no-data'` via the early-return at line 37. Regression-locked by 5 logic tests including explicit null-input cases.

**Deferred — Gemini medium/low items not folded:**

| Severity | Item | Rationale |
|---|---|---|
| MED | Three filter passes over `timeline` to split by status (`completed`/`current`/`upcoming`). | Timeline arrays are bounded at ~23 entries (Spec 84 §3 phase count) — micro-optimization with no measurable impact. Defer. |
| MED | Multiple `status: 'current'` entries silently ignored (`current[0]` pick). | Spec 84 §5 invariant: at most one current entry per timeline. If the upstream data layer ever emits two, that's a data-quality bug worth surfacing, not a render-time concern. Defer; add a dev-mode assertion if it ever happens in practice. |
| MED | `statusBg` mixes `opacity-70` with `bg-slate-50/50` (alpha-channel bg). | Cosmetic redundancy; visual outcome is the intended faded state. Defer. |
| LOW | Array index in keys (`completed-${entry.phase}-${i}`). | Phase prefix already disambiguates; timeline is server-emitted in stable order, so React reconciliation is correct. Defer. |
| LOW | Duplicate `aria-label` + `title` on `UnreliableMarker`. | Intentional — `aria-label` is the canonical signal for screen readers; `title` is the visible tooltip on focus/hover. Some screen readers announce both, which is mildly redundant but not broken. Defer. |
| NIT | `Chevron` is a one-line abstraction over `ChevronRightIcon`. | Kept for naming consistency with the resolved-content shape (`<Chevron />` reads as "render a chevron" at every use site without distinguishing the underlying SVG). Defer. |

**Deferred — DeepSeek minor items:**

| Severity | Item | Rationale |
|---|---|---|
| NIT | Skeleton placeholders aren't chevron-shaped (just rounded rectangles). | V2 visual fidelity. The skeleton conveys "timeline is loading" correctly; chevron-shaped placeholders are aesthetic polish. Defer. |

**Future Spec-33-conformance WF (carry-forward):**
- Install `lucide-react` and replace the two inline-SVG icons (`ChevronRightIcon`, `InfoIcon`) with `<ChevronRight />` and `<Info />` from the library. Spec 33 §4 mandates `lucide-react` as the admin icon library; the inline SVGs in this WF are documented technical debt.
- Add an accessible tooltip primitive (Radix Tooltip via shadcn/ui) and replace native `title` attributes on `UnreliableMarker` and the off-path marker. Spec 33 §9 keyboard-nav mandate is satisfied by the current `tabIndex` + `aria-label` pairing, but a real tooltip would improve UX for non-screen-reader keyboard users.

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



---

## WF1 #coa-pipeline-parity-phase-b — R5.1 review deferrals (2026-05-13)

Adversarial findings from Multi-Agent Review of migrations 124–127 (`lead_trades`, `lead_parcels`, `lifecycle_transitions`, `lifecycle_status_history`). All findings triaged DEFER (logged here) or REJECT (design choice). None blocking R5.1 commit.

| # | Severity | Source | File:line | Finding | Decision rationale |
|---|---|---|---|---|---|
| 1 | HIGH | Gemini+DeepSeek (multi) | All 4 migrations, `lead_id` CHECK | Regex `'^(permit\|coa):.+$'` too permissive — allows `'permit:foo'` with no rev, `'coa:'` near-empty | Spec 42 §6.6.A.1 R2.v3 chose `.+` deliberately. Strict regex (`'permit:[^:]+:[0-9]{2,}'`) would couple every CHECK in 8+ tables to permit-revision format details. App-layer `deriveLeadId()` is the canonical source. Revisit only if app-layer drift produces malformed lead_ids in production. |
| 2 | HIGH | Gemini 126 | `lifecycle_transitions` | No UNIQUE constraint for idempotency (unlike `lifecycle_status_history`) | Single advisory-locked writer (`classify-lifecycle-phase.js` with lock 84) per Spec 42 §6.7 #3. App-layer `IS DISTINCT FROM` guards prevent dupes. Add UNIQUE in Phase E if observed; would constrain spec design. |
| 3 | MED | Gemini 124 | `lead_trades:39` | `idx_lead_trades_active` on low-cardinality boolean is anti-pattern | Matches Spec 42 §6.6.B canonical DDL. Re-evaluate after query patterns observed in Phase D. |
| 4 | MED | Gemini 124, DeepSeek 125 | `lead_trades:40`, `lead_parcels:29` | `idx_*_lead` redundant — UNIQUE/PK on `(lead_id, ...)` already covers lead_id-prefix queries | Matches spec canonical DDL. Drop if EXPLAIN ANALYZE in Phase D confirms primary-key-index satisfies the query. |
| 5 | MED | Gemini 124 | `lead_trades:33` | `trade_id` FK missing explicit ON DELETE clause | Codebase convention; PG default NO ACTION = RESTRICT is the intended behavior. Make explicit project-wide later. |
| 6 | MED | Gemini 125 | `lead_parcels:25` | `parcel_id` FK missing explicit ON DELETE clause | Same as #5. |
| 7 | MED | Gemini 127 | `lifecycle_status_history:42` | `neighbourhood_id BIGINT` missing FK to `neighbourhoods(id)` | Existing codebase convention (`tracked_projects.neighbourhood_id` etc. also lack FK). Project-wide later. |
| 8 | MED | DeepSeek 127 | `lifecycle_status_history:42` | `detected_by` CHECK hardcodes `.js` extensions; renaming a writer needs migration | Spec 42 §6.6.B intentionally enumerates 3 named writers. Adding a 4th is rare; explicit list catches accidental writer drift. |
| 9 | MED | Gemini 126 | `lifecycle_transitions:34-37` | Denormalized cohort dims (`permit_type`, `project_type`, `coa_type_class`) become stale if source row reclassified | Accepted trade-off — Phase E recalibration handles drift. Document explicitly if drift observed. |
| 10 | LOW | DeepSeek 124 | `lead_trades:24` | `confidence DECIMAL(3,2)` silently rounds 3-decimal values to 2 | Spec 42 §6.6.B uses (3,2). Phase D tier-3 FTS scoring already constrained to 2-decimal precision. |
| 11 | LOW | DeepSeek 124 | `lead_trades:28` | `phase VARCHAR(20)` unvalidated free text | Legacy column kept for backward compat; phased out in Phase H. Not worth tightening. |
| 12 | LOW | DeepSeek 124 | `lead_trades:23` | No length limit on `lead_id TEXT` (max 128 char CHECK suggested) | Defensive limit. Add project-wide CHECK in a future hardening WF. |
| 13 | LOW | DeepSeek 127 | `lifecycle_status_history:30` | `from_status`/`to_status`/`decision` as VARCHAR(60) — "stringly-typed" | Source data (CKAN) is free-text strings; lookup tables would force taxonomy work outside this WF's scope. |
| 14 | NIT | DeepSeek 127 | `lifecycle_status_history:54` | Missing composite index on `(lead_id, transitioned_at)` for chronological lead lookups | Performance tuning; add when query pattern observed. |
| 15 | NIT | Gemini 126 | `lifecycle_transitions:38` | Missing index on `to_seq` alone (partial covers only `from_seq IS NOT NULL`) | Cohort calibration queries (Phase E) will reveal whether this is needed. |

**Rejected (not added to followups):**
- DOWN block manual/non-transactional — project Rule 6 (commit 8b1c10b); every existing migration follows this
- `tier` should be NOT NULL — mirrors existing `permit_trades.tier` (migration 006)
- `to_seq` should be NOT NULL — populated in Phase E; `to_phase` carries the through-Phase-D contract
- `date_trunc` IMMUTABILITY hazard — 2-arg form IS IMMUTABLE in PG12+ (only 3-arg form is STABLE)
- Idempotency key drops same-second events — explicitly accepted in R8 Gemini #11 design; same-second distinct events not expected from CKAN ingest


---

## WF1 #coa-pipeline-parity-phase-b — R5.2 review deferrals (2026-05-13)

Adversarial findings from Multi-Agent Review of migrations 128–131 (Universal Stream catalog + signals seeds). All findings triaged DEFER (logged) or REJECT (false positive / design choice / convention). None blocking R5.2 commit.

| # | Severity | Source | File:area | Finding | Decision rationale |
|---|---|---|---|---|---|
| 16 | CRIT (REJECT) | Gemini 131 | Migration 131 | "Incomplete seed — max seq=90, missing 91-110" | **FALSE POSITIVE.** Seq 91-110 are BP7 closure/dead/revocation/cancellation states. No trade bids or works at these stages by v10 CSV design. Same pattern for seq 9 (Deferred), 13 (Refused), 16-22 (Appeals/CoA closure), 34-40 (Permit Notice & Response). The absence of a `(seq, trade, signal)` row IS the correct routing signal (forecast engine returns no recommendation at closure). 74 of 110 seqs have ≥1 signal — coverage validated against v10 CSV ground truth. Migration header documents this explicitly. |
| 17 | CRIT (REJECT) | DeepSeek 131 | Migration 131 | "Missing seq 9, missing seq 34-40, 1,180 manual count vs 1,422 claim" | **FALSE POSITIVES.** Manual count was wrong (actual = 1,422 emitted, confirmed). Missing seqs are closure/pause/notice states (see #16). |
| 18 | HIGH (REJECT) | DeepSeek 131 | Spec 42 §6.6.B | "1,295 bid signals vs spec's 1,710 — 415 missing" | **FALSE POSITIVE.** Spec quoted v9 CSV counts; v10 (locked source after Phase A R0.6 BUG fixes) has 1,144 raw ✓ bid marks per direct count, generator emits 1,295 after dual-path classifier. Spec text outdated — flagged for inline correction in the migration 131 header. |
| 19 | CRIT (DEFER) | Gemini 128 | Migration 128, color/icon columns | `VARCHAR(8)` insufficient for complex ZWJ emojis (e.g., 👨‍👩‍👧‍👦 = 25+ bytes) | All v10 CSV emojis are single code points or 2-char with variation selectors (📨, ⚖️, 🏗️, etc.) — VARCHAR(8) accommodates them. Defensive widening to TEXT would be cheap; revisit if future CSV adds ZWJ emojis. |
| 20 | HIGH (DEFER) | Gemini 128 | Migration 128, (source, status) | No UNIQUE constraint on `(source, status)` — classifier ambiguity risk | Verified naturally unique in v10 catalog (110/110 distinct pairs). Add `UNIQUE (source, status)` as defensive constraint in a future hardening migration. |
| 21 | HIGH (DEFER) | DeepSeek 129 | Migration 129, seq 35 + 77-87 | `phase = 'UNMAPPED→null'` / `'UNMAPPED→P17 fallback'` — literal documentation strings in phase column | Authoring decision in v10 CSV (Spec 84 §2.5.h.2) to encode the unmapped-phase taxonomy directly in the column. The Phase E classifier explicitly handles these as the "unmapped catchall → P1 + audit signal" path. Worth a follow-up Spec 84 amendment to replace with `NULL` + dedicated `unmapped_notes` column. |
| 22 | MED (DEFER) | DeepSeek 129 | Migration 129, seq 47 + 50 | Compound `phase` strings like `'P9-P17 (via stages 100-134) or P18'` | Same as #21 — v10 CSV encodes multi-phase routing here as documentation. Phase E classifier reads granular `lifecycle_seq` instead of this string. Worth a Spec 84 cleanup. |
| 23 | LOW (DEFER) | DeepSeek 129 | Migration 129, loop_marker | `'—'` (em dash) used instead of `NULL` for "no loop" — semantic redundancy | v10 CSV uses `'—'` as the visible "no loop" marker. Consumers can `(loop_marker IS NULL OR loop_marker = '—')` or normalize at read time. Worth cleanup in a future generator pass. |
| 24 | DEFER | worktree | `_tmp_phase_b_seed_signals.mjs` | Two-pass prefix classification is fragile (first pass mis-classifies `Bid: Last Minute: ...` as `bid`, re-scan corrects) | The emitted SQL artifact is correct (verified). Refactor: sort `SIGNAL_PREFIXES` by `csv.length` descending so the first pass is correct (eliminates the need for re-scan). One-shot utility, not production — low urgency. |
| 25 | MED (DEFER) | Gemini 130 | Migration 130, trade_slug FK | Missing `ON UPDATE CASCADE` — slug rename in `trades` breaks rows | Codebase convention: `trades.slug` treated as stable identifier. Add `ON UPDATE CASCADE` project-wide in a future hardening pass. |
| 26 | MED (DEFER) | Gemini 130 | Migration 130, indexes | `idx_trade` `(trade_slug, signal_type)` is redundant with PK `(seq, trade_slug, signal_type)` for some queries | Spec 42 §6.6.B canonical DDL. Performance tune after observing Phase F query patterns. |

**Rejected (not added to followups):**
- DOWN block manual — Rule 6 convention (commit 8b1c10b); every existing migration follows this
- "Multiple INSERT statements aren't atomic" — `scripts/migrate.js` lines 210-227 wrap non-CONCURRENTLY files in single `BEGIN..COMMIT`; all 3 INSERTs are atomic
- "Use COPY FROM CSV instead of embedded INSERT" — project convention is embedded INSERT (see migration 092 precedent); preserves single-file commit + diff review
- "Sacrificing lead_id referential integrity is a time bomb" — already explicitly accepted in Spec 42 §6.6.A.1 R2.v3 with compensating CHECK constraints + orphan-audit view (B.13)


---

## WF1 #coa-pipeline-parity-phase-b — R5.3 review deferrals (2026-05-13)

Adversarial findings from Multi-Agent Review of migrations 132-135 (HIGH RISK hot-table ALTERs). 2 real BUGs fixed inline (B1 CHECK regex over-strict, B2 missing bid_value range CHECK). All other findings DEFER or REJECT.

| # | Severity | Source | File:area | Finding | Decision rationale |
|---|---|---|---|---|---|
| 27 | CRIT (FIXED) | Worktree + Gemini-132 | Migration 132 CHECK regex | Over-strict `'^permit:.+:[0-9A-Za-z]+$'` rejects revision_num with hyphens/underscores | **FIXED inline**: aligned to Spec 42 §6.6.A.1 universal prefix-only `'^permit:.+$'`. |
| 28 | HIGH (FIXED) | Gemini-132 + DeepSeek-133 | Migration 132/133 bid_value | DECIMAL(3,2) declaration alone allows -9.99..9.99 | **FIXED inline**: added `CHECK (bid_value IS NULL OR (bid_value >= 0 AND bid_value <= 1))` on both permits + coa_applications. universal_stream_catalog already had this CHECK; hot tables now match. |
| 29 | HIGH (DEFER) | Gemini-132 + DeepSeek-133 | Migration 132 backfill | Unbatched UPDATE on 247K-row hot table; long ACCESS EXCLUSIVE locks + WAL churn | Correctness is OK; performance concern only. If staging run exceeds 5min Phase B estimate, refactor to batched UPDATE in DO loop. Cheap optimization deferred until needed. |
| 30 | MED (DEFER) | Gemini-134 + Gemini-132 | Migration 132/134 CHECK | regex `.+` matches whitespace/control chars (e.g., `'permit:\n'` passes) | Spec 42 §6.6.A.1 chose universal `.+` pattern across all 8 lead_id-bearing tables. Tightening would break consistency. App-layer `deriveLeadId()` guards format. Revisit if production CKAN data introduces whitespace. |
| 31 | MED (DEFER) | DeepSeek-133 | Migration 133 index | `idx_coa_lead_id` should be UNIQUE since application_number is UNIQUE | Promotion to UNIQUE happens after Phase C backfill confirms all rows have lead_id NOT NULL — deferred to Phase C follow-up migration per Spec 42 §6.6 migration strategy. |
| 32 | HIGH (DEFER) | Gemini-135 | Spec 42 §6.4 | `revision_num` is VARCHAR(10); LPAD on non-numeric strings is brittle | Existing schema (migration 001). Preflight test asserts `MAX(LENGTH(revision_num)) <= 2`. Project-wide normalization to INTEGER would require broader migration; deferred. |
| 33 | LOW (DEFER) | DeepSeek-133 | Migration 133 ADD CONSTRAINT | DO/EXCEPTION pattern could be replaced with NOT VALID + VALIDATE for lower-lock approach | Current pattern is consistent across all 4 hot-table migrations. Tightening to NOT VALID is a project-wide hardening pass — out of Phase B scope. |
| 34 | NIT (DEFER) | Gemini-135 | Phase H | Plan to DROP legacy `permit_num`/`revision_num` columns | Out of Phase B scope; Phase H gate already requires consumer audit + 30-day soak per Spec 42 §6.11 + §6.13. |

**Rejected (false positives or codebase convention):**
- DeepSeek-134: "`CREATE INDEX CONCURRENTLY IF NOT EXISTS` is invalid PostgreSQL syntax" — **FALSE**. Valid since PG9.5; migration 119 in this repo uses the exact same pattern. Reviewer-side knowledge gap.
- DeepSeek-133: "`lead_id` nullable deviates from spec" — Phase B nullable + Phase C backfill + Phase C promotion to NOT NULL is the documented strategy in Spec 42 §6.6.A.
- DeepSeek-133: "DO/EXCEPTION swallows non-duplicate-object errors" — **FALSE**. The handler explicitly specifies `WHEN duplicate_object`; other exceptions propagate.
- Gemini-134: "Entire migration non-transactional + manual DOWN" — Rule 6 / commit 8b1c10b convention; every existing migration follows this.
- Gemini-135: "`UPDATE permits SET lead_id = NULL` is a clever-but-dangerous trigger-fire backfill" — **FALSE READING**. Our backfill is direct compute (`SET lead_id = 'permit:' || ...`), NOT trigger-fire. R2.v3 worktree CRIT was specifically about avoiding the trigger-fire pattern; the implementation correctly does so.


---

## WF1 #coa-pipeline-parity-phase-c — R5.1 review deferrals (2026-05-13)

R5.1.f Multi-Agent Review on `scripts/lib/leads/lead-id.js` + `src/lib/leads/lead-id.ts` + parity test. 3 BUGs fixed inline (LPAD trigger-parity drift on empty + over-width; missing numeric-0 fixture). Other findings logged here.

| # | Severity | Source | Finding | Decision rationale |
|---|---|---|---|---|
| 35 | MED (DEFER) | Gemini-js + DeepSeek-ts | Whitespace-only `permit_num='   '` produces `'permit:   :00'` | **REJECT trim**: Phase B trigger does NOT trim either (`NEW.lead_id := 'permit:' \|\| NEW.permit_num \|\| ...`). Deriver must match trigger byte-for-byte; trimming would create new drift. Defensive trimming belongs in the ingest layer (load-permits.js), not the deriver. |
| 36 | MED (DEFER) | DeepSeek-ts, Gemini-ts | `LeadInput` type union is verbose: `(PermitLeadInput & Partial<CoaLeadInput>) \| ...` | Simpler `Partial<PermitLeadInput & CoaLeadInput>` would lose some compile-time hints. Cosmetic; revisit if a future caller trips on the type. |
| 37 | MED (DEFER) | Gemini-js MED | Boolean/array input not rejected by `typeof !== 'object'` (typeof [] is 'object'; subsequent property access produces undefined → throws at the end) | Practical risk near-zero — pg types preclude boolean/array values reaching this function. Add `Array.isArray()` guard in a future hardening pass. |
| 38 | LOW (DEFER) | DeepSeek-ts | `String(input.application_number)` is redundant when already string | Cosmetic. |
| 39 | REJECT | DeepSeek-ts HIGH | "Dual-path TS↔JS is a maintenance time bomb" | Explicit Spec 84 §7 design. Parity test catches drift; existing codebase precedent in `scripts/lib/lifecycle-phase.js` ↔ `src/lib/classification/lifecycle-phase.ts`. |


---

## WF1 #coa-pipeline-parity-phase-c — R5.2 review deferrals (2026-05-13)

R5.2.f Multi-Agent Review on `scripts/migrate-to-lead-id.js` + migrations 138–142. 3 BUGs fixed inline (emitSummary outside lock callback → double-emit; LPAD-truncation preflight missing; permit_num/revision_num NOT NULL guards on the cost_estimates + trade_forecasts UPDATEs). Other findings logged.

| # | Severity | Source | Finding | Decision rationale |
|---|---|---|---|---|
| 40 | LOW (DEFER) | Worktree | Migration 140 DOWN block missing trailing semicolon on the final `CREATE INDEX` line | In a comment block — operators copying-pasting may notice the missing `;`. Cosmetic; track in a future spec cleanup. |
| 41 | DEFER (Phase F) | Worktree | `src/tests/db/109_fk_hardening.db.test.ts` lines 184/196/209 INSERT into `tracked_projects` without `lead_id`. Safe today (NOT NULL deferred to Phase F per C.3); will break when Phase F promotes NOT NULL. | Phase F migration must include fixture updates as part of its plan. |
| 42 | HIGH (DEFER) | Gemini-js | Phase B added nullable `lead_id` to consumer tables without BEFORE INSERT triggers. Gap between Phase C backfill + NOT NULL promotion lets new INSERTs land with NULL lead_id. | Operational mitigation: run migrate-to-lead-id.js then immediately apply migrations 138-141 with no production writes in between. Spec 42 §6.11 Phase C gate covers this implicitly. Adding triggers would be a Phase B addendum; defer unless production cadence shows the gap. |
| 43 | MED (REJECT) | Gemini-js | `FROM ${table}` template-string interpolation in post-condition check is "SQL injection vulnerability" | **REJECT** — hardcoded array of literal table names; not user-controlled. Risk profile zero. |
| 44 | MED (DEFER) | DeepSeek-js | The `deriveLeadId` import is dead code (only used in startup `typeof` check) | The import IS the dual-path sanity check — confirms the JS twin exists. Removing would lose the check; expanding to actual fixture comparison would slow startup. Current trade-off is reasonable. |
| 45 | MED (DEFER) | DeepSeek-js | `lead_analytics` UPDATE doesn't validate `lead_key` format before copying to `lead_id` | R0.7 audit confirmed lead_analytics is empty; the CHECK constraint on `lead_id` (Phase B migration 134) would reject malformed values. Defensive validation worth adding when Phase D classifiers populate the table. |
| 46 | NIT (DEFER) | DeepSeek-js | `pipeline.emitMeta` emits `lead_id` in BOTH the inputs and outputs maps | Cosmetic. Consistent with the Spec 47 §R11 convention used elsewhere (e.g., `classify-permits.js`). |
| 47 | MED (DEFER) | DeepSeek-views | Migration 142 view body references `permit_num` + `revision_num` (in `source_row_id` concatenation) — these columns drop in Phase H | Real concern. The view body needs updating in the Phase H migration that drops those columns. Track. |
| 48 | LOW (DEFER) | DeepSeek-views | Reused alias `lt` in migration 142 UNION branches (`lead_trades lt` + `lifecycle_transitions lt`) | Aliases are scoped per-branch in UNION ALL; no actual conflict. Cosmetic readability issue. |
| 49 | HIGH (DEFER) | DeepSeek-views | UNION branches lack `AND <table>.lead_id IS NOT NULL` filter | Defensive — once migrations 138-141 promote NOT NULL, the columns can't be NULL so the filter is redundant. `tracked_projects` branch correctly has it (dual-key window). Other 7 branches don't need it post-promotion. |


---

## WF1 #coa-pipeline-parity-phase-c — R5.3 review deferrals (2026-05-13)

R5.3 design pivot from app-layer dual-write (6 scripts) to trigger-based mirroring (2 migrations) was approved by user. R5.3.f Multi-Agent Review on migrations 143/144 + db.test.ts surfaced 1 BUG (UPDATE branch silent miss + key-change orphan, fixed inline via INSERT ON CONFLICT + EXCEPTION guard). Other findings logged below.

| # | Severity | Source | Finding | Decision rationale |
|---|---|---|---|---|
| 50 | DEFER | Worktree | UPDATE branch write amplification (2x writes per source UPDATE) at 250K rows/run | Acceptable cost — classify-permits.js is scheduled (not hot-path). Phase H drops legacy tables eliminating the write multiplier. |
| 51 | DEFER | Worktree | Bulk DELETE fan-out (1000 source DELETEs → 1000 trigger fires on lead_trades) | Per-row trigger design is correct for the use case. Statement-level triggers can't access OLD row data. Worth Phase H performance review. |
| 52 | REJECT | DeepSeek-144 | match_type VARCHAR(30→20) truncation risk | Audited — MAX(LENGTH(match_type))=15 in production, all fit VARCHAR(20). |
| 53 | REJECT | DeepSeek-144 | linked_at NULL → matched_at NOT NULL violation | migration 012 declares `linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` |
| 54 | REJECT | DeepSeek-144 | DELETE cascade concerns | No FK references lead_parcels; no cascading DELETE paths |
| 55 | NIT (DEFER) | DeepSeek-144 | Comment hardcodes "MAX=15" production invariant in migration | Re-grep on future ingestion change; CHECK constraint on permit_parcels.match_type if data grows |

---

## WF2 Spec 93 RNFirebase migration — Round 2 review (commit: TBD, 2026-04-30)

### WF3 candidates — FILED 2026-05-15

| WF3 | Item | Planning note |
|---|---|---|
| WF3-A | Backup-email persistence bridge missing | `.cursor/deferred_task_spec93_backup_email_persistence.md` |
| WF3-B | Auth-state reset placement leaks data on forced sign-out | `.cursor/deferred_task_spec93_authstate_reset_placement.md` |
| WF3-C | @sentry/react-native v7→v8 upgrade for RN 0.81 + New Architecture | `.cursor/deferred_task_spec93_sentry_v8_upgrade.md` |

_Filed by scheduled remote agent 2026-05-15; commit SHA: TBD (this commit). Original CRITICAL details preserved in the planning notes; pick up via `WF3` in a future session._

---

## WF1 R5.4 classify-coa-trades — diff-review deferrals (2026-05-14)

R5.4 4-reviewer diff-review (Gemini + DeepSeek + Worktree-independent + Worktree-observability) surfaced 1 CRITICAL bug (batch threshold), 5 functional coverage gaps (TAG_ALIASES), and 4 observability improvements — all folded inline. DEFERs below.

| # | Severity | Source | Finding | Decision rationale |
|---|---|---|---|---|
| 56 | DEFER | Worktree#2 CRIT-1 + IMP-4 | `classify-coa-scope.js` unconditionally bumps `scope_classified_at` even when classifier output is unchanged → on next R5.4 run, every CoA re-enters cursor → `records_updated` inflated daily | Real concern. Cross-script fix needed in `classify-coa-scope.js`: use `scope_classified_at = CASE WHEN scope_tags IS DISTINCT FROM v.scope_tags THEN $runAt ELSE scope_classified_at END`. Preserves the all-NULL infinite-re-fetch fix while breaking the daily full-re-classify cycle. Open as separate WF3 on classify-coa-scope.js. |
| 57 | DEFER | Worktree#2 IMP-5 + Indep H-1/M-1 | Spec 42 §6.8 row 667 literal `unmapped_coa_count (== 0 FAIL)` + `default_fallback_pct (≤ 20%)` slugs absent | R8 fold #1 deliberately replaced with `unmapped_scope_pct <= coa_trades_unmapped_threshold_pct%` to avoid permanent FAIL on variance-only CoAs. Spec text needs amendment to reflect this. Open a §6.8 amendment commit. |
| 58 | DEFER | Worktree#2 IMP-7 | `dwelling → build-sfd` alias fires on variance/change-of-use CoAs ("permit use of dwelling for commercial") producing spurious excavation+concrete trades at 0.80 confidence | Architectural: requires multi-tag context (cross-reference `project_type` or co-occurring tags like `severance`/`setback`) which the lib's lookupTradesForTags doesn't have. Fix would require: (a) two-stage classification (lib produces matches, script filters by project_type), or (b) tag-context guard in TAG_ALIASES. Defer until first production audit reveals scale. |
| 59 | DEFER | Worktree#2 IMP-2 + Indep | `emitSummary` cross-granularity — `records_total: processed` (CoA count) but `records_new/_updated: recordsNew/recordsUpdated` (lead_trades row counts) — dashboard misleads | Spec 47 §8.1 mandates these fields. Re-design would need a parallel `child_records_*` field set. Track. |
| 60 | DEFER | Gemini MED | `realtorConfidence = 0.7` hardcoded — could be `coa_realtor_confidence` logic_variable | Consistent with permit-side `backfill-realtor-permit-trades.js` which also hardcodes. Spec 47 §4.1 test ("could operator tune?") suggests structural, not business-logic. Fold cross-spec to logic_variables if/when permit-side adopts. |
| 61 | DEFER | Gemini MED | Zod `LOGIC_VARS_SCHEMA.passthrough()` instead of `.strict()` | Site-wide pattern across all classify-* scripts. Strict mode would require auditing every script. Open as separate WF2 refactor. |
| 62 | DEFER | Gemini LOW | Hardcoded `'realtor'` string in `tradeSlugDist` (line 235) — should derive from `tradesResult` row matching `REALTOR_TRADE_ID` | Cosmetic; trades.id=33↔slug='realtor' is enforced by `checkRealtorAvailable` startup guard. |
| 63 | DEFER | Indep L-2 | Realtor `tradeId` bypasses `SLUG_TO_ID` validation that all matrix trades go through | Defensive at startup via `checkRealtorAvailable` which queries `trades WHERE id = 33 AND slug = 'realtor'`. FK enforces. |
| 64 | REJECT | Indep H-3 | `IS DISTINCT FROM` guard absent on `trade_classified_at` UPDATE → dead-tuple bloat on re-runs | Theoretical. Within a single run, each CoA appears at most once. Across runs, `$2 = RUN_AT` changes, so IS DISTINCT FROM never short-circuits. Zero practical benefit. |
| 65 | DEFER | DeepSeek #2-#9 | 8 findings targeting `scripts/classify-permits.js` twin (date-parsing, ghost-cleanup atomicity, SELECT/WHERE column dependencies, hardcoded REALTOR_TRADE_ID, classCounters fixed keys, lookupTradesForTags dedup semantics, scope_tags JSON parsing concerns, emitMeta key inconsistency) | Out of R5.4 scope (twin reference only). File a separate WF3 epic for classify-permits.js hardening once R5.4 ships. |



---

## WF1 R5.5 compute-coa-cost-estimates — diff-review deferrals (2026-05-14)

R5.5 4-reviewer diff-review (Gemini + DeepSeek + Worktree-independent + Worktree-observability-w/spec-48) surfaced 3 CRITICAL + 3 HIGH + 7 MED-level findings — all folded inline. DEFERs below.

| # | Severity | Source | Finding | Decision rationale |
|---|---|---|---|---|
| 66 | DEFER | W#1 H1 + W#2 L1-4 + DeepSeek M2 | Spec 42 §6.8 row 668 still lists null_cost_reasons as `(no_parcel/no_building/no_scope_tags/no_rate)` — code emits `(no_parcel/no_scope_tags/no_active_trades/no_matching_rate)` per fold #6. | Spec text amendment scheduled as separate doc-only commit. Code is correct; spec is lagging. |
| 67 | DEFER | W#2 L1-5 | `records_total` reflects all CoAs processed; `records_new + records_updated` reflect cost_estimates UPSERT only — cross-granularity mismatch in observer's step-verdict rollup. | Operator can read `records_meta.coa_with_cost` for the explanation. Semantic redesign would need a parallel `child_records_*` field set in Spec 47 §8.1. |
| 68 | DEFER | Gemini HIGH | Cross-script deadlock risk on coa_applications (R5.3 + R5.4 + R5.5 all update same table). | CoA chain runs sequentially with distinct advisory locks (4202, 4203, 4204) — no concurrent UPDATEs possible within the chain. Cross-chain risk nil (only CoA chain writes to coa_applications). |
| 69 | DEFER | Gemini LOW | Unbounded `trade_sqft_rates` + `scope_intensity_matrix` queries. | Both tables have ~25 + ~10 rows respectively in production; OOM risk theoretical. Defensive LIMIT cap can be added if tables grow unexpectedly. |
| 70 | DEFER | Gemini LOW + W#2 L1-5 | `coa_eligible` metric name + records_total context. | Operator context surfaces via `records_meta.row_limit` (when --limit flag used). Name change would require dashboard updates. |
| 71 | DEFER | Gemini NIT | Zod `.passthrough()` vs `.strict()` for logic_var schema. | Site-wide pattern across all classify-*/compute-* scripts. Refactor would require auditing every script. Open as separate WF2 once spec 48 observability surfaces a real misconfiguration incident. |
| 72 | DEFER | DeepSeek MED-1 | percentile query uses `lead_id LIKE 'coa:%'` — hardcoded prefix assumption. | Spec 42 §6.6.A.1 mandates the `coa:` / `permit:` prefix convention. Migration 124's CHECK constraint enforces it. Stable convention; many other places break first if format changes. |
| 73 | DEFER | DeepSeek MED-2 | `::text` cast inconsistency between R5.5 (drops cast) and permit twin (keeps cast). | Separate WF2 to remove ::text casts from `compute-cost-estimates.js` permit twin. Twin pattern is the suboptimal one; R5.5 sets the new direction. |
| 74 | DEFER | DeepSeek LOW-3 | Stream error propagation may bypass `emitSummary`. | pipeline.run SDK handles top-level errors; audit_table emission on partial-batch failure is a Spec 47 §R12 concern. Track in observability spec. |
| 75 | REJECT | DeepSeek HIGH-1 | dry-run mode skips counter increments. | False positive — reviewer conflated with permit twin pattern. R5.5 dry-run only short-circuits inside `flushBatch`; counters increment normally in the loop. |
| 76 | REJECT | DeepSeek HIGH-2 | Cursor predicate misses CoAs with `trade_classified_at IS NULL`. | Proposed fix (`OR trade_classified_at IS NULL`) would cause infinite re-fetch on legitimately tradeless CoAs (variance-only). Edge case handled by chain order (R5.4 → R5.5 always sequential). |
| 77 | REJECT | DeepSeek LOW-2 | `coa_applications.cost_source` CHECK constraint might not allow 'none'. | Verified mig 133: column has no CHECK constraint (just `VARCHAR(20)`). |
| 78 | REJECT | W#1 L1 | audit_table `phase: 42` vs Spec 47 §8.2 chain-step-number convention. | Spec 42 §6.8 footer explicitly mandates `phase: 42` for all CoA Phase D scripts (grouping in FreshnessTimeline UI). Spec 47 template is overridden here per spec 42. |



---

## WF1 R5.6 link-coa.js enrichment — diff-review deferrals + Phase D close-out (2026-05-14)

R5.6 4-reviewer diff-review (Gemini fetch-failed; DeepSeek + Independent + Observability worktree using Spec 48 lens) surfaced 1 cross-reviewer CRITICAL (`wardFillRes` CTE filter inconsistency, 3-way concur), 2 HIGHs, 5 MEDs — all critical/high folds applied inline. DEFERs below.

| # | Severity | Source | Finding | Decision |
|---|---|---|---|---|
| 79 | DEFER | Obs L2 | `inherited_confidence_floor` is config-constant noise in 7-day baseline | Acceptable — INFO status produces no FAIL/WARN signal; baseline-stable framing is documented in §6.6.X audit metric list. Future Spec 48 observer can baseline-exclude. |
| 80 | DEFER | Obs L5 | Chain-order race documentation (step 4 parcel-centroid → step 6 cost-estimate → step 8 permit-geocode overwrite) — cost-estimate uses pre-enrichment coordinates | Documented in §6.6.X; cost model uses `lead_parcels.parcel_id` (not lat/long), so coordinate precision change doesn't affect cost output. Recompute trigger after enrichment is Phase H work. |
| 81 | DEFER | Obs L6 | No `lat_lng_source` column on `coa_applications` — `SELECT *` consumers can't distinguish parcel-centroid from permit-geocoded coordinates | Phase F work — UI display unification. Today no consumer makes precision-sensitive decisions. |
| 82 | DEFER | Indep M1 | Obs L2-1 fold "documented + tested that classifiers don't consume coa.lat/long directly" — test only asserts no lead_parcels writes, classifier read-path not asserted | Classifier read-path verified in plan-review against R5.3/R5.4/R5.5 source code; spec amendment §6.6.X documents the dependency. Adding explicit test assertion deferred (would require parsing 3 separate script sources). |
| 83 | DEFER | Indep L1 | Pre-count sums can exceed UPDATE rowCount due to rows satisfying both lat/lng-differs AND ward-is-NULL conditions (double-counting) | Documentation only — metrics labeled INFO so operator can interpret independently. |
| 84 | DEFER | Indep L2 | `IS DISTINCT FROM cleared.an` redundant in Step 3 since Step 2 already nulled `linked_permit_num` | Cosmetic — preserves defensive style. |
| 85 | DEFER | Obs L9 | Pre-pass return pattern uses outer-scope variable assignment for `staleBackRefsCleared` | Cosmetic — works correctly, defensible style. |
| 86 | DEFER | Obs L13 | `coa_below_confidence_floor_count` counts all historical below-floor links, not current-run | Documented behavior in §6.6.X as "gate-misconfig detector" — sudden spike vs baseline is the signal. |
| 87 | DEFER | DeepSeek LOW | Deduplicate unlinking.rows arrays before `unnest` | Cosmetic — PostgreSQL handles duplicates correctly. |
| 88 | DEFER | DeepSeek LOW | `LOGIC_VARS_SCHEMA .passthrough()` allows typos in unknown keys | Site-wide pattern — separate WF2 site-wide audit. |
| 89 | DEFER | DeepSeek NIT | `actualCandidates` variable name + dry-run log message wording | Cosmetic. |
| 90 | OUT-OF-SCOPE | DeepSeek (link-coa-to-parcels.js CRITICAL pre-pass design + HIGH SAVEPOINT scope + MED neighbourhood lookup) | All findings target R5.2's `link-coa-to-parcels.js` | Not touched by R5.6. File as separate WF3 against R5.2 if operationally validated. |
| 91 | DEFER | Independent L3 | Phase D close-out grep step for `load-coa.js` / `geocod` references in other specs | Independent verified Spec 76 + 91 don't reference the abandoned attribution. No grep step needed. |
| 92 | FAILED | Gemini | API fetch failed during diff-review | Re-run on Gemini availability; non-blocking for commit. |

### Diff-review folds applied inline (5):
1. **3-way concur CRITICAL**: `wardFillRes` CTE adds `AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL` filter to match main UPDATE's `best_permit`
2. **Indep H1 + Obs L1 + L11**: `lead_identity_lat_lng_mismatch_count` demoted from FAIL→WARN, race-condition documented
3. **Obs L3**: `enrichment_eligible_count` INFO audit row added (first-run distinguishability)
4. **Obs L7**: Tier 1c + high-confidence transient back-ref state documented in pre-pass Step 3 comment
5. **Indep M2**: SPEC LINK references corrected `§6.X` → `§6.6.X` in script + test

### Plus Part B fully deferred to Spec 48 implementation as new final phase
The original R5.6 plan had two parts. Part B (`permits.coa_anticipated` flag for Examiner's Notice detection) was deferred during plan-review (28-finding triage, 13 Part-B-specific findings across all 4 reviewers including semantic conflict between flag name and "stays TRUE forever" behavior, regex placeholder pending R0 audit, redundancy with PRE-permit retirement in Phase G, no operational wiring into link-coa.js's tiebreaker). Part B should be picked up as a "Cross-Pipeline Anticipation Tracking" phase of Spec 48 implementation.

### Phase D close-out
Phase D DELIVERED 2026-05-14. R5.1 → R5.5 → R5.6 commit chain captured in Spec 42 §6.11 Phase D delivery note. All §6.3 coverage gates measurable post-staging-run.

---

## Phase E.1 diff-stage 4-reviewer findings (2026-05-14)

Phase E.1 (#lifecycle-phase-engine-migration-E.1) commit covers bug 84-W12 substrate fix + `mapToUniversalStream` + TS twin extension + 14 spec amendments. 4-reviewer diff-stage review surfaced these PRE-EXISTING bugs (NOT introduced by E.1) — filed as future WF3 candidates rather than blocking commit.

| # | Triage | Source | Issue | Reason for DEFER |
|---|---|---|---|---|
| 93 | DEFER | DeepSeek diff HIGH | `classifyOrphan` uses `issued_date` for `'Inspection'` / `'Revision Issued'` / `'Revised'` statuses; if `issued_date` is null, `daysBetween(null, ...)` produces NaN-like behavior. Orphan branch untouched by E.1. | Pre-existing; orphan stall logic predates Phase D. Separate WF3 candidate. |
| 94 | DEFER | DeepSeek diff HIGH | Permit-side status sets are case-sensitive (`DEAD_STATUS_SET`, `TERMINAL_P20_SET`, etc.). If CKAN feed lowercase-drifts, 40% of permits could become unclassified. | Pre-existing design; affects 84-W14-class drift hardening. Separate WF3 candidate. |
| 95 | DEFER | DeepSeek diff MEDIUM | `'Cancelled'` (1 row) + `'Revoked'` (2 rows) currently map to `null` via `DEAD_STATUS_SET`; spec §2.5.a argues they should map to P19/P20. | Spec drift, 3 rows; separate WF3 hardening candidate. |
| 96 | DEFER | DeepSeek diff MEDIUM | `mapInspectionStageToPhase` first-match `.includes()` ordering may misroute compound stage names. | No current data triggers; defensive hardening candidate. |
| 97 | DEFER | Gemini diff HIGH | `PHASE_ORDINAL` assigns all P7 sub-phases (P7a/b/c/d) the same ordinal `-2`. Downstream progression detection collapsed. | Pre-existing; affects forecast routing — separate WF3 to redesign ordinal map. |
| 98 | DEFER | Gemini diff HIGH | `PHASE_ORDINAL['P18'] = 3.5` floating-point ordinal. Existing comment justifies (magnitude comparisons only). | Pre-existing; works for current consumers. Hardening candidate. |
| 99 | DEFER | Gemini diff MEDIUM | Hardcoded fallback values in `classifyOrphan` / `classifyBldLed` (`?? 180` / `?? 30` / `?? 90`) mask missing config. | Pre-existing; pipeline always passes DB-loaded value. Defensive hardening candidate. |
| 100 | DEFER | Gemini diff MEDIUM | `classifyBldLed` precedence (REVIEW_P4 → HOLD_P5 → READY_P6 → INTAKE_P3) is unintuitive. | Pre-existing; documented behavior — add explanatory comment in a follow-up. |
| 101 | DEFER | Gemini diff LOW | `SKIP_PHASES_SQL` hardcoded string is error-prone for future phase additions. | Pre-existing; generate programmatically in a follow-up. |
| 102 | DEFER | Gemini diff LOW | `NORMALIZED_DEAD_DECISIONS_ARRAY` exported alongside the deprecated legacy union encourages continued use. | Pre-existing; remove in Phase F when all consumers migrate to split sets. |
| 103 | DEFER | DeepSeek diff MEDIUM | `unmappedDecision` flag in rule 9 catchall uses `!isDeferredDecisionVariant` instead of `!inAnyDecisionSet` — narrower than necessary but works due to precedence guarantees. | Functional; tightening would be defensive — separate hardening candidate. |
| 104 | FOLDED | Observability diff HIGH | `mapToUniversalStream.phase` field is descriptive (multi-value / sentinel / NULL possible); E.2 must use `classifyCoaPhase().phase` as write target, never the catalog `.phase`. | **FOLDED** into `.cursor/queued_task_phase_e2_consumer_wiring.md` "Critical write-target invariant" addition. |
| 105 | FOLDED | Observability diff MEDIUM | E.2 `stalled_count` audit metric ambiguous between permit-side and CoA-side. | **FOLDED** into `.cursor/queued_task_phase_e2_consumer_wiring.md` — split into `stalled_count` (permit) + `coa_stalled_count` (CoA-side). |
| 106 | FOLDED | Gemini diff NIT | Dead variables `statusMatched` / `decisionMatched` declared but never read in `classifyCoaPhase`. | **FOLDED** — removed in diff cleanup pass. |
| 107 | FOLDED | Gemini diff LOW | `STANDARD_LIFECYCLE_PHASES` duplicates existing `VALID_PHASES` set. | **FOLDED** — `STANDARD_LIFECYCLE_PHASES` removed; `mapToUniversalStream` uses `VALID_PHASES`. |
| 108 | FOLDED | Independent diff HIGH | Test file SPEC LINK header pointed to non-existent `docs/reports/lifecycle_phase_implementation.md`. | **FOLDED** — corrected to `docs/specs/01-pipeline/84_lifecycle_phase_engine.md §3` + Spec 42 §6.7. |
| 109 | N/A | Independent diff | Worktree did not see uncommitted E.1 changes (worktree isolation defaults to last-commit HEAD `cea6d47` Phase D close-out). Independent reviewer's "missing implementation" findings are non-actionable. | Procedural artifact of `isolation: "worktree"` — not a real finding. |

### Phase E.2 close-out

Phase E.2 DELIVERED 2026-05-14. Commit: `[E.2-COMMIT — fills upon push]`. Trajectory: 4 plan-review rounds (v1=21 findings → v2=16 → v3=12 → v4 = all folded; user authorized direct PLAN LOCK at v4 with no v4 reviewer round). Diff-stage 4-reviewer round (Gemini + DeepSeek + Independent worktree + Observability worktree) surfaced 2 real HIGH bugs fixed inline (linked_permit_num filter; table_schema='public'; insertResult.rowCount) + 3 spec-deviation/Phase-F items deferred.

| # | Triage | Source | Issue | Reason for DEFER |
|---|---|---|---|---|
| 110 | DEFER to Phase F | Gemini diff CRIT 1 | `classify-lifecycle-phase.js` does not write to `lifecycle_status_history` table per Spec 42 §6.7 (status-level ledger). Phase E.2 queued task scope did NOT include this; my v4 plan covered `lifecycle_transitions` only. Real spec deviation. | Queued task scope was the locked authority. Phase F or a dedicated WF needs to add status-level history writes for both permit-side (CKAN status changes via `load-permits.js`) AND CoA-side (via `load-coa.js` + this script). |
| 111 | DEFER per Spec 42 §6.11 Phase H | Gemini diff CRIT 2 | Permit transitions write `permit_phase_transitions` (legacy); CoA transitions write `lifecycle_transitions` (new). Inconsistent. | Intentional transition strategy per Spec 42 §6.11 Phase H. Permit-side rekey is a Phase H WF. |
| 112 | FOLDED — fixed in commit | DeepSeek diff HIGH 2 | `unclassified_count` CoA query filtered `AND linked_permit_num IS NULL` — obsolete after Rule 0 removal in E.1. Linked CoAs that remain NULL would be undercounted. | **FIXED** — filter removed in E.2 commit. |
| 113 | FALSE POSITIVE | DeepSeek diff HIGH 1 | `catalog_invalid_phase_count` claimed to never increment. | False positive — `mapToUniversalStream` returns null for poisoned-phase rows (E.1 v4 fold #5 post-lookup validation), so `rawCatalogRow != null && catalogRow == null` correctly fires. Verified. |
| 114 | DEFER hardening | DeepSeek diff MEDIUM 1 | `OR ca.matched_rule IS NULL` backfill predicate relies on classifier never returning null `matchedRule`. No runtime assertion. | Substrate `classifyCoaPhase` always sets `matchedRule` 0-9; risk is defensive hardening. Defer. |
| 115 | FOLDED — fixed in commit | Independent diff HIGH 1 | Migration-existence guard missing `table_schema = 'public'` filter (project convention deviation; multi-schema portability bug). | **FIXED** — filter added in E.2 commit. |
| 116 | FOLDED — fixed in commit | Independent diff HIGH 2 | `coaPhaseTransitionsCount` overcounts on ON CONFLICT DO NOTHING hits (used `phaseChangedBatch.length` instead of `insertResult.rowCount`). Permit-side uses the correct pattern. | **FIXED** — uses `insertResult.rowCount` in E.2 commit. |
| 117 | DEFER to Phase F handoff | Observability diff F2 | `records_total` at `emitSummary` excludes `dirtyCoAsCount` (permits-only). Observer baseline comparison sees flat records_total + slower duration → false-positive CRITICAL on first E.2 run. | Spec 47 §R10 permits this (records_total = primary write target = permits). First-run pre-ack should note this discrepancy. Phase F plan to revisit. |
| 118 | DEFER to Phase F | Observability diff Phase F naming | `compute-trade-forecasts.js` guard checks `row.lead_id`; `update-tracked-projects.js` guard checks `row.permit_lead_id`. Naming divergence; Phase F UNION source SQL must standardize before activating guards. | Document for Phase F engineer. |

### Phase E.1 close-out
Phase E.1 DELIVERED 2026-05-14. Substrate-only commit per Spec 42 §6.11. Same-Sprint Mitigation Option 2 active: `scripts/classify-lifecycle-phase.js` consumer uses `classifyCoaPhaseLegacy` adapter until E.2 ships. v4 plan-lock authorized after 4 rounds of plan-review (v1/v2/v3/v4) + 4-reviewer diff-stage round; 0 new CRITICALs introduced; 4 diff-stage findings folded inline; 17 pre-existing bugs deferred (filed above). E.2 plan-lock follows (queued at `.cursor/queued_task_phase_e2_consumer_wiring.md` — locks user-authorized v4 scope expansion: `coa_applications` columns migration + downstream `lead_id` guards in `compute-trade-forecasts.js` + `update-tracked-projects.js`).

---

## Phase E.3 diff-stage 4-reviewer findings (2026-05-15)

Phase E.3 (#lifecycle-phase-engine-migration-E.3) commit covers CoA-side granular cohort calibration extension (`scripts/compute-phase-calibration.js` rewrite + migration 147 + manifest CoA-chain add + 4 spec amendments). Plan trajectory: v1=18 → v2=14 → v3=15 → v4=13 (5 rounds plan-review; user authorized direct PLAN LOCK at v5). Diff-stage 4-reviewer round (Gemini + DeepSeek + Independent + Observability) — 0 CRITs, 5 real findings folded inline (v6), 2 verified false positives, 6 deferrals.

| # | Triage | Source | Issue | Reason |
|---|---|---|---|---|
| 119 | FOLDED inline (v6) | Convergent: Independent Issue 4 + Observability Issue 1 (conf 80+83) | `unknownCohortCount` classification loop only checked `coa_type_class != null` — buckets with `project_type` set but `coa_type_class` NULL routed to "unknown" instead of CoA cohort count. Caused `coa_cohort_count` to undercount and spurious WARN on partial Phase D state. | **FIXED** — changed to `else if (b.coa_type_class != null || b.project_type != null)`. |
| 120 | FOLDED inline (v6) | Independent Issue 1 (conf 82) | `buildBulkInsertSQL(rowCount=0)` produced syntactically-invalid SQL `INSERT INTO t (a) VALUES ` (no tuples). Production guard at line 375 protected, but exported function contract was latent-broken. | **FIXED** — defensive throw added at function entry; logic test updated to assert throw. |
| 121 | FOLDED inline (v6) | DeepSeek HIGH #2 | No EXISTS guard for `phase_stay_calibration` target table — staging-table CREATE LIKE would crash with relation-not-exist if mig 123/135/147 not applied. Lock cleanup via try/finally protected, but error message unhelpful. | **FIXED** — `information_schema.tables` EXISTS check added with clear migration hint (mig 123, 135, 147). |
| 122 | FOLDED inline (v6) | Observability Issue 2 (conf 80) | `coa_cohort_presence` threshold descriptor `'>= 1 post-E.2 first-run'` was misleading — WARN fires for multiple legitimate Phase D-incomplete causes, not only "E.2 hasn't run." | **FIXED** — descriptor expanded to enumerate the 3 WARN causes (E.2 not run / Phase D fully incomplete / seq-range excludes all CoA transitions). |
| 123 | FOLDED inline (v6) | Gemini NIT | Comment "Defense-in-depth: both conditions must hold" was ambiguous about the AND/OR conjunction structure (outer AND between `lead_id LIKE` and the seq-range OR-expression). | **FIXED** — comment rewritten to explicitly enumerate the two predicates and clarify the outer AND prevents the inner OR from broadening to non-CoA rows. |
| 124 | FALSE POSITIVE | Gemini diff CRIT | "LAG attribution off-by-one — phase durations attributed to the next cohort." | Recurring false positive — same hypothesis from plan-stage v2-G-1 (verified false-positive via timeline trace). Re-verified via the existing live-DB test pattern at `src/tests/db/phase-calibration.db.test.ts` which seeds `(NULL→P7c, P7c→P18)` transitions and asserts cohort 'P7c' median ≈ 255 days. Ledger semantics: `from_phase` is the phase being EXITED; LAG(transitioned_at) over (transitioned_at, id) ASC yields the duration of that exited phase. Grouping by `from_phase` correctly attributes the duration to the cohort. Gemini's mental model assumes `from_phase` is the destination phase (wrong). DEFERRED — model gap, not code bug. |
| 125 | FALSE POSITIVE | Gemini diff HIGH | "Negative phase durations not filtered — could poison percentile data." | Structurally impossible. `LAG ... OVER (PARTITION BY ... ORDER BY transitioned_at, id)` returns the previous row in ascending (transitioned_at, id) order, so `transitioned_at - LAG(transitioned_at) >= 0` by construction. Zero-duration only if same (transitioned_at, id) which is impossible because `id` is unique. The first row of every partition has LAG = NULL → filtered out by `phase_duration IS NOT NULL`. DEFERRED — no real bug. |
| 126 | DEFER (doc clarification) | DeepSeek HIGH #1 | `coa_transition_count` query doesn't apply `phase_duration IS NOT NULL` filter; ratio against `coa_type_class_null_transition_count` uses a slightly larger denominator than the aggregate-eligible population. | Interpretive disagreement — `coa_transition_count` is documented as raw source count for triage (distinguishes "E.2 not run" from "E.2 ran but cohorts sparse"). The filter would defeat that triage purpose. Phase F or follow-up: clarify the documented intent in the audit row threshold descriptor. |
| 127 | DEFER (Phase F) | DeepSeek MED | Bucket-count safety cap at 5000 throws Error instead of partial write. | Plan-mandated behavior — sub-batching is explicitly deferred to Phase F per the active_task.md v5 fold v4-M3. Hard failure is preferred over silent param-limit truncation. |
| 128 | DEFER | Gemini MED | `MIN(from_phase)` in CoA aggregate yields lexicographically-first phase label when multiple distinct values exist for the same 5-tuple cohort. | Plan v2-G-LOW already deferred this as defensive observability. Add a `coa_cohorts_with_multiple_phases` audit metric in a future hardening pass. |
| 129 | DEFER (legacy parity) | Gemini MED | `EXTRACT(EPOCH FROM phase_duration) / 86400.0` is DST-sensitive (a day can be 23/25 hours). | Permit-side legacy pattern (shipped for months). Sub-day precision irrelevant at the percentile-aggregate level. Migrate both sides to `::date - ::date` arithmetic in a Phase H consolidation pass if business semantics shift to "calendar days." |
| 130 | DEFER | Gemini LOW | The 10% lag threshold between `coa_applications.project_type` and `lifecycle_transitions.project_type` coverage is hardcoded. | Spec 47 §R4 mandates `logic_variables` for operator-tunable values. Add `calibration_coverage_lag_warn_pct` to `LOGIC_VARS_SCHEMA` in a follow-up hardening pass. |
| 131 | DEFER (Phase F design gap) | Observability worktree note | Phase F (`compute-trade-forecasts.js` UNION extension) must implement an explicit audit-verdict gate against the prior `compute_phase_calibration` `pipeline_runs` row before executing the CoA UNION — otherwise incomplete Phase D state silently propagates to forecasts. | Phase F is not yet written; this is a forward design constraint, not a v5 defect. Phase F active task must add the audit-verdict gate. |

### Phase E.3 close-out

Phase E.3 DELIVERED 2026-05-15. Commit covers:
- `migrations/147_phase_stay_calibration_drop_legacy_pk.sql` (NEW) — drops legacy PK on (permit_type, phase), makes permit_type + phase nullable, adds partial unique index `phase_stay_calibration_permit_legacy_unique` for permit-side 2-tuple uniqueness (CoA rows excluded by partial filter), adds partial composite LAG-support index `lifecycle_transitions_coa_lag_idx` on `lifecycle_transitions` (lead_id, transitioned_at, id) WHERE `lead_id LIKE 'coa:%'`.
- `scripts/compute-phase-calibration.js` — rewritten from 173 to ~395 lines. CoA-side granular cohort aggregate reading `lifecycle_transitions`; permit-side preserved (with `, id` tiebreaker added to LAG for determinism); atomic temp-table swap (CREATE TEMP TABLE + TRUNCATE + INSERT FROM staging) replaces DELETE+INSERT (empty-state visibility window = zero per ACCESS EXCLUSIVE semantics); bucket-count safety cap at 5000; 15-row audit_table with 6 thresholded gates; verdict derived per Spec 47 §R10 (fixes pre-existing hardcoded-counter bug at legacy script line 155).
- `scripts/manifest.json` + `src/components/FreshnessTimeline.tsx` — `compute_phase_calibration` added to CoA chain (16 → 17 steps; runs after `assert_lifecycle_phase_distribution`).
- `src/tests/compute-phase-calibration.{infra,logic}.test.ts` + `src/tests/migration-147-phase-stay-calibration-drop-legacy-pk.infra.test.ts` (NEW) + `src/tests/chain.logic.test.ts` (3 tests updated for CoA chain tail shift) — 249 tests pass (`npm run verify` clean: typecheck + lint + test all green).

Plan trajectory: 5 rounds plan-review (v1=18 → v2=14 → v3=15 → v4=13 → v5 folded all 13 + PLAN LOCKed per user authorization). Diff-stage 4-reviewer round surfaced 5 real findings (1 convergent at 2/4 reviewers), 2 verified false positives, 6 deferrals. All 5 real findings folded inline (v6) before commit.

E.4 (per-seq band tuning + `assert-lifecycle-phase-distribution.js` extension) and E.5 (band recalibration operational gate) follow next. Phase F (`compute-trade-forecasts.js` UNION extension + Phase F audit-verdict gate per follow-up #131) is the downstream consumer pickup.


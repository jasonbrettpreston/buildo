# Active Task: WF1 #lifecycle-phase-engine-migration-F.2 — `update-tracked-projects.js` CoA branch + `tracked_projects` schema relaxation + 3 CoA logic_variables

**Status:** Complete (delivered 2026-05-16). v4 PLAN LOCK direct → implementation → Green Light at 6138/6138 → 4-reviewer diff-stage round → 8 diff-stage folds applied inline (4 CRIT #177-180, 2 HIGH #181-182, 1 IMPORTANT #183, 1 doc gap #184) → 7 new lock-in tests F.2-33 through F.2-39 → Green Light at 6145/6145 → 9 deferrals filed (#185-193, 2 false positives + 4 pre-existing/cosmetic + 3 minor refinements) → WF6 single feat commit + tiny docs close-out for `[F.2-COMMIT]` placeholders.
**Workflow:** WF1 (script extension + 2 schema migrations — `update-tracked-projects.js` gains a CoA UNION branch; mig 153 relaxes `tracked_projects.permit_num`/`revision_num` to nullable + drops FK; mig 154 seeds 3 CoA logic_variables)
**Domain Mode:** Backend/Pipeline (`scripts/`, `scripts/lib/`, `migrations/`, `src/tests/`, `docs/specs/`)
**Rollback Anchor:** `27ad7962` (F.1 close-out — fill [F.1-COMMIT] placeholders; preceded by F.1 ship at `4d58444`)
**Parent WF:** Phase F — Forecast / opportunity / CRM CoA extensions (Spec 42 §6.11)
**Sub-deliverable position:** F.1 (compute-trade-forecasts.js — `4d58444`) → **F.2 (update-tracked-projects.js — THIS task)** → F.3 (compute-opportunity-scores.js CoA consumer) → F.4 (Lead Inspector CoA panel — Spec 76 §3.5 UI)
**Adversarial review:** USER-MANDATED — 4 reviewers (Gemini + DeepSeek + Independent worktree + Observability worktree) at BOTH plan and diff stages per `feedback_review_protocol.md`.
**Standards adherence (user-mandated):** `00_engineering_standards.md` §2 (try-catch) / §3 (Database — zero-downtime migration pattern) / §6 (logError) / §9 (pipeline safety); Spec 47 §R1-R12 + §11 Counter Semantic Contract; Spec 48 §3.1 (audit_table) + §3.2 (records_meta) + §3.5 (emitSummary); Spec 82 §4 CoA Lead Handling (the F.2 spec contract); TDD cadence per WF1 Red Light/Green Light gate (failed-test-first per user mandate).

---

## v3 → v4 Revision Summary

v3 4-reviewer plan-stage round surfaced **28 findings** — trajectory plateaued (v1=25 → v2=22 → v3=28). My targeted-Edit folding was accumulating stale residue at the same rate as bug fixes. Per user authorization "Fold all + PLAN LOCK v4 directly", v4 applies all 28 folds. No further reviewer round before implementation; diff-stage 4-reviewer round will run after Green Light.

**CRITICAL (6):**
- **CRIT-v4-AA — Decision-reversal reset path unreachable for terminal-decision case + counter overcounts** (Gemini CRIT 1 + DeepSeek MED 8 + Independent HIGH 3 + Observability C-1 — 4/4 convergent, strongest signal of v3). Two coupled bugs: (a) v3's reset block is AFTER `if (terminalState) { ... continue; }` — when a CoA appeals Approved → Refused, the script archives + continues without resetting; (b) `coaNotifiedDecisionRenderedCount++` reads `row.notified_decision_rendered` (pre-reset stream value) so it overcounts rows whose reset is queued in the same tick. **v4 fold:** (1) MOVE the reset block to BEFORE the `if (terminalState)` archive branch — reset runs unconditionally on each iteration, then the script either archives or processes alerts. (2) MOVE counter increment to AFTER the reset block: `if (row.notified_decision_rendered === true && isCoaDecisionApproved(row.coa_decision)) coaNotifiedDecisionRenderedCount++` — counts only "currently approved + flagged" rows (the right operator dedup-health signal).
- **CRIT-v4-BB — UNION column count tri-disagreement** (Gemini CRIT 2 + DeepSeek HIGH 4 + Independent CRIT 1 — 3/4 convergent). Plan prose claims 18, test item 24 claims 19, actual count is **20** per branch (verified). **v4 fold:** scrub all 3 spots to 20.
- **CRIT-v4-CC — `extractCoaApplicationNumber` null → NULL notification** (Gemini HIGH 3 + DeepSeek CRIT 1 — 2/4 convergent). Returns null on malformed `lead_id`; CoA branch passes null to notification body + INSERT, producing `'Variance approved for null...'` text + null `notifications.permit_num`. **v4 fold:** every call site uses `(extractCoaApplicationNumber(row.lead_id) || 'unknown-coa') || 'unknown-coa'` fallback (5 sites); INSERT params expression becomes `a.coa_application_number || a.permit_num || 'unknown-coa'`.
- **CRIT-v4-DD — `'Closed'` status missing from `COA_TERMINAL_STATUSES`** (DeepSeek CRIT 2 sole). 28K rows (87.6% of CoAs) have status='Closed' (mostly decision='Approved') — under v3's `isCoaTerminalState` they'd never auto-archive. Spec 82 §4 lists `decision='Closed'` as terminal; Spec 84 §3 rule 1 emits P20 for status='Closed' — both axes agree. **v4 fold:** `COA_TERMINAL_STATUSES = new Set(['Complete', 'Closed'])` (was `{'Complete'}`). Aligns with Spec 84 §3 P20 mapping.
- **CRIT-v4-EE — Key Files note stale** (Independent CRIT 2 sole). Line 133 still says "1 entry; mig-136 keys already present in JSON file" but live grep confirms absent. Contradicts CRIT-v3-4. **v4 fold:** rewrite Key Files note to "3 entries (existing `coa_stall_threshold_p2_days` + `coa_imminent_window_days` absent from JSON despite being in DB via mig 136; new `coa_stall_threshold_postponed_days` per mig 154)".
- **CRIT-v4-FF — Startup column check throws BEFORE `emitSummary`** (Observability C-2 sole). `information_schema.columns` check throws if `notified_decision_rendered` absent; throws before any audit_table built → Spec 48 §3.5 violation. **v4 fold:** wrap the check in the existing top-level `pipeline.run` callback's try-catch (pipeline.run already handles thrown errors via the SDK's emitFailedSummary pattern — verify), OR explicitly emit a minimal failed summary before throwing. Use `LIMIT 0` direct query instead of `information_schema` (DeepSeek MED 6) — avoids schema-cache lag and the check itself doesn't need a separate emit because if `tracked_projects` query fails it'll propagate naturally.

**HIGH (11):**
- **HIGH-v4-GG — TZ-sensitive Date parsing in `isCoaInImminentWindow`** (Gemini HIGH 4). `new Date(hearingDate)` parsing on a DATE string is engine-dependent. **v4 fold:** explicit UTC parse — append 'T00:00:00Z' to string-form dates before construction.
- **HIGH-v4-HH — DOWN DELETE too narrow** (Gemini HIGH 5). v3 `WHERE lead_id LIKE 'coa:%' AND (permit_num IS NULL OR revision_num IS NULL)` misses CoA rows with non-null permit_num. **v4 fold:** `DELETE FROM tracked_projects WHERE lead_id LIKE 'coa:%'` (drop the AND clause — the very existence of a CoA-type lead is what the migration enables).
- **HIGH-v4-II — `coaOrphanedLeadIds` can go negative** (DeepSeek HIGH 3). Race between pre-count and stream. **v4 fold:** `Math.max(0, eligibleCoaPreStream - totalRowsCoa)`.
- **HIGH-v4-JJ — Orphan sample query stale + 3-scan inefficiency** (DeepSeek HIGH 5 + Gemini MED 6 — convergent). v3 uses 3 scans (pre-count + stream + post-sample). **v4 fold:** convert Branch B INNER JOIN to LEFT JOIN; detect orphans inline in JS loop (`isCoaRow && row.coa_status === null`); single-pass orphan capture. Eliminates the pre-stream count + post-stream sample queries entirely.
- **HIGH-v4-KK — 3 stale-residue items** (Independent HIGH 4/5/6). Logic test item 2 says "hardcoded 60"; Spec 82 amendment text says "60 (hardcoded mid-tier)"; checklist (v) verifies removed C4 condition. **v4 fold:** all three updated to reflect v3 state.
- **HIGH-v4-LL — `coa_orphaned_lead_ids` threshold label backwards** (Observability H-1). v3 says `'== 0'` — should be `'> 0'` (the trigger condition, not the desired state). **v4 fold:** scrub.
- **HIGH-v4-MM — Sample-cap divergence not surfaced** (Observability H-2). 100-orphan vs 20-orphan indistinguishable from `failed_sample` length alone. **v4 fold:** add `records_meta.coa_orphaned_lead_ids_sample_capped` boolean (true if `coaOrphanedLeadIds > 20`).
- **HIGH-v4-NN — Cohort C2/C3 archive semantics mis-doc'd** (Observability H-3). Post-CRIT-2, any group's `archived` increments on terminal state (not just C4). **v4 fold:** Part 2.8 narrative updated to reflect this.
- **HIGH-v4-OO — `in_quiet_period` invisible to verdict cascade** (Observability H-4). v3 emits to records_meta only — `extractIssues()` only reads audit_table.rows. **v4 fold:** add `in_quiet_period` as INFO audit row (value `inQuietPeriod ? 1 : 0`).

**MEDIUM (6):**
- **MED-v4-PP — Recovery race lifecycle_stalled vs calc stall** (Gemini MED 7). `STALL_CLEARED` can fire when calc clears but `lifecycle_stalled` flag still true. **v4 fold:** recovery condition requires BOTH `row.lifecycle_stalled === false` AND `coa_days_at_status <= stallThreshold` (decouple from `!coaStalled` shortcut).
- **MED-v4-QQ — information_schema cache lag** (DeepSeek MED 6). **v4 fold:** absorbed into CRIT-v4-FF — use `LIMIT 0` direct query.
- **MED-v4-RR — `lifecycle_stalled` vs null-threshold asymmetry** (DeepSeek MED 7). Documented in runbook section.
- **MED-v4-SS — Pre-stream COUNT not in emitMeta** (Observability M-1). Now obviated by HIGH-v4-JJ (LEFT JOIN refactor eliminates the COUNT query).
- **MED-v4-TT — Runbook missing 2 metric entries** (Observability M-2). **v4 fold:** runbook section explicitly enumerates 7 audit rows + 5 records_meta items (was 5+4 in v3).

**LOW + NIT (5):**
- **LOW-v4-UU — Branch A silent skip of malformed CoA rows** (DeepSeek LOW 9). Document as intentional in plan + add log.warn on detection.
- **LOW-v4-VV — NOW() vs RUN_AT divergence in SQL** (DeepSeek LOW 10). **v4 fold:** SOURCE_SQL parameterizes `NOW()` calls with `$1::timestamptz` bound to RUN_AT.
- **NIT-v4-WW — Checklist (e) clarity** (Gemini NIT). Already addressed in CRIT-v4-EE.
- **NIT-v4-XX — `coa_imminent_window_days` zero guard** (DeepSeek NIT 11). **v4 fold:** `isCoaInImminentWindow` returns false if `windowDays <= 0`.
- **NIT-v4-YY — Config warn wording** (DeepSeek NIT 12). **v4 fold:** prefix message with `[ADVISORY]` to signal non-fault.

---

## v2 → v3 Revision Summary (preserved for trajectory record)

v2 4-reviewer plan-stage round surfaced **22 findings** (6 CRIT + 7 HIGH + 5 MED + 4 LOW/NIT). Notably ~10 are stale v1 residue my v2 scrub missed (Risk Register items, test list contradictions, Spec 82 amendment text drift, checklist contradictions) — the v2 round caught my own fold completeness errors. 2 are real new bugs from v2 folds (UNION column mismatch from CRIT-G; CRIT-D dead-code tautology). v3 folds all 22:

**CRITICAL (6):**
- **CRIT-v3-1 — UNION column mismatch** (Gemini CRIT + Independent CRIT + Observability NEW-1 sub — 3/4 convergent). My CRIT-G fold added `tp.notified_decision_rendered` to Branch B SELECT without adding the corresponding `NULL::boolean AS notified_decision_rendered` projection to Branch A. PostgreSQL UNION ALL rejects column-count mismatches at runtime. **v3 fold:** Branch A gets `NULL::boolean AS notified_decision_rendered`; column-count claim updated 18 → 19.
- **CRIT-v3-2 — CRIT-D dead-code tautology** (Gemini MED + DeepSeek HIGH + Independent CRIT + Observability NEW-1 — 4/4 convergent, strongest signal). `if (decisionTerminal || (row.lifecycle_group === 'C4' && decisionTerminal))` collapses to `if (decisionTerminal)` — the C4 clause is unreachable. Spec 82 §4 says `decision IN ('Refused','Withdrawn','Closed') → archive immediately` with NO group restriction. **v3 fold:** simplify to `if (decisionTerminal)` (per Spec 82 contract). C4 backstop is dropped from the auto-archive path — it served no purpose. C4 retains its informational role in `coa_alert_distribution_by_lifecycle_group` cohort breakdown. v1's original concern about C4 over-archiving is resolved by the gate on `decisionTerminal` alone.
- **CRIT-v3-3 — Stale Risk Register** (Gemini CRIT 2 + Independent HIGH 6 — 2/4 convergent across 3 spots). Items #4 / #5 / #6 still describe v1 state, contradicting v2 folds: #4 says CoA dedup deferred (CRIT-B added partial UNIQUE); #5 says 60d hardcoded (HIGH-I promoted to logic_variable); #6 says F.1 runbook inheritance (HIGH-M mandated F.2 section). **v3 fold:** all 3 items rewritten to reflect v2 fold state.
- **CRIT-v3-4 — Seeds JSON gap** (Independent CRIT 98 — verified via live `grep`). Live `scripts/seeds/logic_variables.json` contains only `coa_stall_threshold` — `coa_stall_threshold_p2_days` and `coa_imminent_window_days` are absent despite being seeded in DB by mig 136. `control-panel.logic.test.ts` `EXPECTED_LOGIC_VAR_KEYS` parity will fail post-F.2 unless ALL 3 keys are added to both files. **v3 fold:** Key Files note updated to "ADD 3 entries (existing 2 mig-136 keys + new `coa_stall_threshold_postponed_days`)"; `EXPECTED_LOGIC_VAR_KEYS` extension confirmed at 3 keys; Spec 82 §4 amendment + checklist + test items updated.
- **CRIT-v3-5 — Plan-text contradictions** (Independent CRIT 1 + 3 + Observability NEW-2 + NEW-3 + Independent HIGH 8 — 5 specific spots). My v2 fold introduced multiple stale residue: (a) checklist (c) says "Mig 154 seeds 3 keys" but CRIT-A reduced to 1; (b) test item 17 says "validates 3 new keys" but schema has 4 (1 new + 3 existing); (c) test item 19 + checklist (o) say `coa_skipped_count` retained at 0 but LOW-T removed it; (d) test item 20 lists C1/C2/C3 only, missing C4 (contradicts HIGH-O); (e) negative-grep for `permit_lead_id` only in checklist (q), not a numbered test. **v3 fold:** all 5 contradictions scrubbed in test list + checklist; new numbered test #23 for negative grep.
- **CRIT-v3-6 — Spec 82 amendment text drift** (Gemini LOW + Independent HIGH 5 — 2/4 convergent). Amendment text still uses v1-drifted `coa_stall_threshold (30)` name despite CRIT-A fix renaming to `coa_stall_threshold`. **v3 fold:** amendment text rewritten with correct key name + reference to logic_variable for postponed threshold.

**HIGH (7):**
- **HIGH-v3-7 — `notified_decision_rendered` not reset on decision reversal** (DeepSeek HIGH 2 — 1/4). If a CoA appeals from Approved → Refused, the flag stays TRUE forever; user never gets the reversal alert. **v3 fold:** add reset path — when `!isCoaDecisionApproved(coa_decision) && row.notified_decision_rendered === true`, set back to `false`. Documents the "decision reversal" Spec 82 §4 edge case.
- **HIGH-v3-8 — C4 cohort shape asymmetry** (Observability NEW-4 — 1/4). C4 entry `{archived: N}` is asymmetric with C1/C2/C3's 5-field shape. **v3 fold:** initialize C4 with `{imminent: 0, stalled: 0, recovery: 0, decision: 0, archived: 0}` — explicit zeros for never-incremented fields make the shape uniform for downstream consumers.
- **HIGH-v3-9 — `failed_sample` orphan capture for INNER JOIN drops** (Observability NEW-5 — 1/4). A `tracked_projects` row with `lead_id LIKE 'coa:%'` but no matching `coa_applications` row is silently dropped by Branch B's INNER JOIN. **v3 fold:** pre-stream count via `SELECT COUNT(*) FROM tracked_projects WHERE lead_id LIKE 'coa:%' AND status IN (...)`, diff against `totalRowsCoa` post-stream → populate `failed_sample` with up to 20 orphan lead_ids + new `coa_orphaned_lead_ids` audit row (WARN threshold `> 0`).
- **HIGH-v3-10 — Unnecessary `LEFT JOIN trade_configurations` on Branch B** (Gemini HIGH — 1/4). Branch B reads no columns from `tc`. Cosmetic perf optimization. **v3 fold:** remove the join from Branch B (Branch A retains it for permit-side `imminent_window_days`).
- **HIGH-v3-11 — `'Complete'` missing from `COA_TERMINAL_DECISIONS`** (DeepSeek MED 1 — 1/4 — promoted from MED to HIGH on review). Status='Complete' (P20) is a terminal state; CoAs with `decision=Approved AND status=Complete` will never auto-archive under v2's set. **v3 fold:** add status-based archive guard — `isCoaTerminalState(coa_status, coa_decision)` = `isCoaDecisionTerminal(coa_decision) || coa_status === 'Complete'`. Simpler than adding 'Complete' to the decision set (which is semantically wrong — Complete is a status, not a decision).
- **HIGH-v3-12 — Negative grep test for `permit_lead_id`** (Observability NEW-3 + Independent HIGH 8 — convergent). v2 placed the grep verification only in checklist item (q), not as a numbered test. **v3 fold:** add as numbered test item #23 ("No `row.permit_lead_id` references in script body — negative grep").
- **HIGH-v3-13 — Multiple test/checklist stale-residue scrubs** (Independent + Observability convergent). Tracked under CRIT-v3-5 above; specifically the test scaffolding additions for items 17/19/20/23 + checklist items (c)/(o)/(t)/(v)/(z) + new (gg-ii).

**MED (5):**
- **MED-v3-14 — `notified_decision_rendered` count in records_meta** (Observability NEW-7 — 1/4). Operator can't audit dedup health from PIPELINE_SUMMARY. **v3 fold:** add `records_meta.coa_notified_decision_rendered_count` (count of rows where the flag is TRUE in Branch B stream); INFO status; no threshold. Mirrors F.1's anchor-source observability pattern.
- **MED-v3-15 — Runbook day-0 `coa_archived` WARN contingency** (Observability NEW-6 — 1/4). The WARN fires when `archivedCoa === totalRowsCoa` — on day 0 with a small CoA backlog where all rows happen to be terminal-decision, the WARN fires legitimately. **v3 fold:** runbook section adds conditional note: "If `coa_archived` WARN fires on day 0, check `records_meta.total_rows_coa` — < 50 with all terminal-decision rows is data-driven correct, not a fault."
- **MED-v3-16 — Runbook day-0 grace-suppression callout** (Observability NEW-8 — 1/4). All 4 CoA alert counters show 0 during days 0-7 due to `!coaFirstDeployGrace` gate. **v3 fold:** runbook section calls out: "Days 0-7 — all CoA alert counters show 0 by design (grace-suppression). Day 8 onward, alert counts ramp."
- **MED-v3-17 — `notified_decision_rendered` column dependency on mig 153** (DeepSeek MED 2 — 1/4). Script's Branch B SELECT references the column; if mig 153 hasn't been applied, query fails at runtime. **v3 fold:** add startup `information_schema.columns` check: if `notified_decision_rendered` is absent on `tracked_projects`, throw with explicit "mig 153 required" message. Mirrors compute-phase-calibration.js E.3 R6 pattern.
- **MED-v3-18 — `selectCoaStallThreshold` null/unknown status** (DeepSeek LOW 1 — 1/4 — promoted to MED on operational impact). Null `coaStatus` falls through to generic 30d threshold; very young CoAs (just ingested, status not yet populated) could trip false stall. **v3 fold:** add explicit null guard — return `null` (or a sentinel) for null/empty status; caller skips stall detection when threshold is null.

**LOW + NIT (4):**
- **LOW-v3-19 — DOWN DELETE safety scope** (Gemini LOW — 1/4). v2 DOWN says `DELETE WHERE permit_num IS NULL OR revision_num IS NULL` — too broad. **v3 fold:** restrict to `DELETE WHERE lead_id LIKE 'coa:%' AND (permit_num IS NULL OR revision_num IS NULL)`.
- **LOW-v3-20 — `lead_id.slice(4)` brittleness** (Gemini LOW — 1/4). Hardcoded prefix length. **v3 fold:** extract module-local helper `extractCoaApplicationNumber(leadId)` using regex `/^coa:(.+)$/`; tested in logic suite.
- **NIT-v3-21 — Math.round → Math.floor in `isCoaInImminentWindow`** (DeepSeek NIT — 1/4). After UTC-midnight normalization, the difference is integer days; round vs floor is moot but floor better signals intent. **v3 fold:** change to `Math.floor`.
- **NIT-v3-22 — Risk Register asymmetric C4 shape callout** (Observability NEW-4 sub-note). Addressed in HIGH-v3-8.

---

## v1 → v2 Revision Summary (preserved for trajectory record)

v1 4-reviewer plan-stage round (Gemini + DeepSeek + Independent worktree + Observability worktree) surfaced **24 findings**; my own live-DB query against `logic_variables` surfaced a 25th (mig 154 key redundancy + naming drift). 2 v1 findings were false positives (Independent's `lifecycle_group` non-existence claim — verified via `psql \d coa_applications`; and Independent's STALL_CLEARED missing `coa_application_number` claim — present in v1 plan text).

**CRITICAL (6 real + 2 FP):**

- **CRIT-v2-A — Mig 154 key redundancy + naming drift (live-DB discovery).** 3 of 3 v1-proposed keys ALREADY EXIST: `coa_stall_threshold=30` (mig 093), `coa_stall_threshold_p2_days=90` (mig 136), `coa_imminent_window_days=7` (mig 136). v1 proposed `coa_stall_threshold_days` (with `_days` suffix) — drift from the established `coa_stall_threshold` referenced in Spec 82 §4 line 86. **v2 fold:** delete the 3 redundant inserts from mig 154; mig 154 now seeds ONLY `coa_stall_threshold_postponed_days=60` (the previously-hardcoded Postponed/Deferred threshold, per CRIT-v2-K below). Script reads existing `coa_stall_threshold` (not `_days`).
- **CRIT-v2-B — CoA partial UNIQUE index** (Gemini CRIT + DeepSeek MED — 2/2 convergent). v1's deferral of `(user_id, lead_id, trade_slug)` dedup to a future API claim WF was rejected by both reviewers. Without this index, the same user can claim the same CoA lead multiple times for the same trade — duplicate alerts + corrupted analytics. **v2 fold:** mig 153 adds `CREATE UNIQUE INDEX uq_tracked_user_coa_trade ON tracked_projects (user_id, lead_id, trade_slug) WHERE lead_id LIKE 'coa:%'`.
- **CRIT-v2-C — Branch A WHERE mutual exclusivity** (Gemini MED + DeepSeek CRIT — 2/2 convergent). v1's `tp.permit_num IS NOT NULL` check is insufficient — a tracked_projects row could have both non-NULL permit_num AND `lead_id LIKE 'coa:%'` (e.g., back-filled linked CoA). **v2 fold:** add `AND tp.lead_id NOT LIKE 'coa:%'` to Branch A WHERE.
- **CRIT-v2-D — `lifecycle_group === 'C4'` backstop over-archives** (DeepSeek CRIT). C4 includes ~28K Closed CoAs, many with non-terminal decisions (e.g., decision=Approved with status=Closed = lifecycle complete, NOT terminal in user-tracking sense). v1 would destroy these on first run. **v2 fold:** gate the C4 backstop behind `isCoaDecisionTerminal(coa_decision)` — only archive when status='C4' AND decision IN ('Refused','Withdrawn','Closed').
- **CRIT-v2-E — `records_total` §11.1 wording ambiguity** (Observability CRIT 95). v1 says "mirrors F.1" — Observability raised that the entity-class question for F.2 (tracked_projects rows) is distinct from F.1 (forecast subjects), and v1 must engage explicitly. **v2 fold:** Spec 47 §R11 compliance note rewritten to state "Both counters tally `tracked_projects` rows (the unified primary entity — same table, not different entity classes). This is not a §11.2 violation; differs from the §11.2 Overflow example because both addends ARE the primary write target."
- **CRIT-v2-F — All audit rows INFO-only violates Spec 47 §10** (Observability CRIT 92). v1's 5 new audit rows all use `threshold: null, status: 'INFO'` — Spec 47 §10 plan compliance checklist requires ≥1 threshold row. **v2 fold:** add `coa_archived` threshold row — `threshold: '< 100% of totalRowsCoa'`, status WARN if 100% of CoA rows archive in one run (data/classifier fault detector).

**CRITICAL combo (3-reviewer convergent — single fold):**
- **CRIT-v2-G — FaB state-machine combo** (Gemini HIGH + DeepSeek HIGH + Independent HIGH — 3/4 convergent on different facets). (a) v1 overloads `last_notified_urgency='decision_rendered'` for COA_DECISION_RENDERED dedup — creates a terminal state preventing future imminent/stall alert resets. (b) `'Final and Binding'` in `COA_APPROVED_DECISIONS` contradicts Spec 82 §4 (FaB is "keep the lead", not "fire alert"). (c) FaB is a STATUS, not a decision (per reviewer Spec 84 §2.5.c read; though Spec 84 §3 rule 3 allows BOTH — case-variant). **v2 fold:** (1) mig 153 adds `notified_decision_rendered BOOLEAN NOT NULL DEFAULT false` column. (2) COA_DECISION_RENDERED dedup uses this new column (not `last_notified_urgency`). (3) `COA_APPROVED_DECISIONS` reduced to `{'Approved', 'Approved with Conditions'}` — FaB removed; FaB leads are kept passively per Spec 82 §4 "linked permit will surface as new lead later" contract.

**HIGH (11 real folds):**
- **HIGH-v2-H — `coa_days_at_status` NULL → 0 suppresses stall** (DeepSeek HIGH). For CoA rows where `lifecycle_classified_at` is NULL (freshly ingested, classifier hasn't run), v1 returns 0 days — silently suppresses stall detection. **v2 fold:** in SOURCE_SQL Branch B, COALESCE falls through to `ca.last_seen_at` (CKAN first-seen timestamp) before defaulting to 0: `COALESCE(FLOOR(EXTRACT(EPOCH FROM (NOW() - ca.lifecycle_classified_at)) / 86400)::int, FLOOR(EXTRACT(EPOCH FROM (NOW() - ca.last_seen_at)) / 86400)::int, 0)`.
- **HIGH-v2-I — Hardcoded 60-day Postponed/Deferred** (Gemini NIT + DeepSeek HIGH — 2/2 convergent on operator-tunability). v1 Risk Register #5 deferred — both reviewers reject deferral; DeepSeek upgrades to HIGH because false stall alerts during CoA backlog degrade trust. **v2 fold:** mig 154 (now only this 1 key) seeds `coa_stall_threshold_postponed_days=60`; `selectCoaStallThreshold` reads `logicVars.coa_stall_threshold_postponed_days` (not the hardcoded constant).
- **HIGH-v2-J — Branch B projects misleading `tc.imminent_window_days`** (Gemini HIGH). Permit-side value pollutes CoA rows; CoA uses `coa_imminent_window_days` instead. **v2 fold:** Branch B projects `NULL::int AS imminent_window_days`.
- **HIGH-v2-K — First-deploy grace not gated at alert push sites** (Gemini MED, upgraded to HIGH). v1 fetched `coaFirstDeployGrace` but didn't use it. **v2 fold:** wrap all 4 CoA `alerts.push(...)` sites in `if (!coaFirstDeployGrace) { ... }` — prevents day-0 alert storm before operator pre-ack annotation.
- **HIGH-v2-L — `permit_lead_id` grep verification** (Observability HIGH 88). v1 rename addressed SOURCE_SQL projection but didn't mandate grep-verification that NO `row.permit_lead_id` references survive in the permit-branch body. **v2 fold:** test item #23 (negative grep) + Self-Checklist item (q).
- **HIGH-v2-M — F.1 runbook does NOT cover F.2 metrics** (Observability HIGH 87). v1 said "inherits F.1 runbook" — the F.1 runbook lists 14 F.1-specific metrics; F.2's 5 new audit rows + 4 new records_meta distributions are completely absent. **v2 fold:** F.2 authors a new section `## Phase F.2 additions` in `docs/runbook/F1_baseline_quiet_period.md` listing the 7 new metric slots + expected day-0 to day-7 behavior. Added to Execution Plan as a named deliverable.
- **HIGH-v2-N — `coaFirstDeployGrace` query slug** (Observability HIGH 85). v1 copied F.1's query verbatim but the slug must be `permits:update_tracked_projects` (F.2's own pipeline) — not F.1's. **v2 fold:** explicit slug correction in Part 2.7 + Self-Checklist item (p).
- **HIGH-v2-O — C4 missing from cohort breakdown** (Observability HIGH 82 + DeepSeek MED — 2/2 convergent). v1's `coa_alert_distribution_by_lifecycle_group = {C1, C2, C3}` omits C4. The C4 backstop archives CoAs that would otherwise be untraceable in the breakdown. **v2 fold:** initialize C4 entry + increment on C4-archive path.
- **HIGH-v2-P — `notifications` missing from emitMeta writes** (Observability HIGH 80). v1's emitMeta lists `tracked_projects` + `lead_analytics` as writes; the 3 new notification subtypes INSERT into `notifications` (existing pattern but new types). DataFlowTile won't show the write arrow. **v2 fold:** add `notifications: ['user_id','type','permit_num','trade_slug','title','body','created_at']` to emitMeta writes.
- **HIGH-v2-Q — Test gap: `lifecycle_classified_at` reclassify-reset path** (Independent HIGH 90). v1 doesn't test the OR-gate's `row.lifecycle_stalled === true` path independently of `coa_days_at_status` — a defensive re-classify pattern would silently disable stall detection without this test. **v2 fold:** add test items for both OR branches.
- **HIGH-v2-R — `!coaStalled` suppresses imminent for near-hearing leads** (Independent HIGH 82). Product clarification: should a CoA stalled at "Hearing Scheduled" for 95 days but with hearing 3 days away receive BOTH alerts or just COA_STALLED? v1 suppresses imminent; Independent flags this as a possible UX miss. **v2 fold:** document the current behavior as INTENTIONAL (mirrors permit side; operator-override via Spec 86 if needed in the future) — no code change, but spec amendment makes the precedence rule explicit.

**MED + LOW (3 folds + 1 absorbed):**
- **MED-v2-S — Negative `coa_days_at_status` from clock skew** (DeepSeek LOW). **v2 fold:** wrap in `GREATEST(..., 0)` in SOURCE_SQL.
- **LOW-v2-T — Dead `coa_skipped_count` metric** (DeepSeek LOW). v1 retained at 0 for parity with F.1 — DeepSeek argues this is noise. **v2 fold:** REMOVE from F.2 audit rows; F.2 is a different script so the F.1 baseline-continuity argument doesn't apply.
- **LOW-v2-U — Date arithmetic DST risk** (Gemini LOW). `isCoaInImminentWindow` uses naive ms diff. **v2 fold:** normalize hearing and now to midnight UTC before subtraction.
- DeepSeek MED on C4 absent from breakdown — **ABSORBED into HIGH-v2-O.**

**NIT (2 folds):**
- **NIT-v2-V — Startup config warn when p2 < generic** (Gemini NIT). Add `pipeline.log.warn` at startup if `logicVars.coa_stall_threshold_p2_days < logicVars.coa_stall_threshold`.
- **NIT-v2-W — UNION column NULL cast maintenance comment** (DeepSeek NIT). Add inline comment block above Branch A NULL casts noting "must stay in sync with Branch B column shapes".

**False positives (verified — kept in trajectory for the record):**
- Independent CRIT 95 (`lifecycle_group` non-existence on coa_applications) — VERIFIED FALSE via `psql \d coa_applications` showing `lifecycle_group | character varying(10)`. Independent worktree may not have schema access.
- Independent CRIT 92 (STALL_CLEARED missing `coa_application_number`) — VERIFIED FALSE via re-read of v1 plan text §2.3 lines showing the field is present.

---

## Why this task exists

F.1 (commit `4d58444`) wired `scripts/compute-trade-forecasts.js` to produce CoA-stage forecasts end-to-end. Those forecasts now flow into `trade_forecasts` keyed by `lead_id`. But the next chain step — `scripts/update-tracked-projects.js` — still hard-blocks CoA leads:

1. **Schema blocker:** `tracked_projects.permit_num` + `revision_num` are NOT NULL with FK `fk_tracked_projects_permits` → `permits(permit_num, revision_num) ON DELETE CASCADE`. A CoA-only lead has no `permits` row, so it cannot satisfy the FK. The `tracked_projects.lead_id` column exists (added Phase C mig 140) but the legacy NOT NULL anchors prevent any CoA row from being inserted by the API claim path. **Mig 153 mirrors F.1 mig 151's pattern:** drop the FK, relax `permit_num`/`revision_num` to nullable.
2. **Script blocker:** Current SQL `JOIN permits p ON tp.permit_num = p.permit_num AND tp.revision_num = p.revision_num` is permit-only by construction. Plus the E.2 defensive guard at lines 197-208 skips CoA rows entirely with a `coa:` prefix log warning.
3. **Behavior gap:** Spec 82 §4 specifies different stall thresholds, alert windows, and disappearance rules for CoA-stage leads:
   - **Stall thresholds:** Status `'Hearing Scheduled'` (Universal Stream B1.B / P2) can sit for 1–3 months as normal hearing-prep — NOT a stall. Use `coa_stall_threshold_p2_days` (default 90). Status `IN ('Postponed','Deferred')` triggers stall on > `coa_stall_threshold_postponed_days` days (default 60 — new logic_variable per v2 HIGH-I fold; mig 154). Generic CoA stall threshold `coa_stall_threshold` (default 30 — existing key from mig 093; v3 CRIT-6 corrects v1 drift to `_days` suffix).
   - **Imminent window:** Keyed on `coa_applications.hearing_date - NOW()` rather than `trade_forecasts.predicted_start - NOW()`. New `coa_imminent_window_days` (default 7).
   - **Decision-keyed auto-archive:** `decision IN ('Refused', 'Withdrawn', 'Closed')` → archive immediately (no `lead_expiry_days` wait). `decision = 'Final and Binding'` → keep (linked permit will surface as new lead later).
   - **3 new notification subtypes:** `COA_HEARING_IMMINENT`, `COA_DECISION_RENDERED`, `COA_STALLED` — discriminated by `type` prefix (no CHECK constraint on `notifications.type`; `permit_num` field already nullable so it holds the CoA `application_number` for CoA notifications until F.4 / Spec 76 §3.5 UI may add a dedicated `lead_id` column).

A fourth concern from F.1 close-out (review_followups.md follow-up #118) is also addressed here: the current script's source SQL projects `p.lead_id AS permit_lead_id`. F.2 standardizes the column name to `lead_id` matching `compute-trade-forecasts.js` so any future shared library or downstream consumer reads consistently.

---

## Context

### Goal
Enable `update-tracked-projects.js` to process CoA-stage `tracked_projects` rows end-to-end per Spec 82 §4. After F.2: a user who has claimed a CoA-stage lead receives `COA_HEARING_IMMINENT` 7 days before the hearing, `COA_STALLED` if the application sits at `'Hearing Scheduled'` > 90 days or at `'Postponed'/'Deferred'` > 60 days, and `COA_DECISION_RENDERED` when the variance is approved. CoA leads with `decision IN ('Refused','Withdrawn','Closed')` auto-archive on the next run.

### Target Specs (required reading per CLAUDE.md WF1 protocol)
- `docs/specs/00_engineering_standards.md` §2/§3/§6/§9
- `docs/specs/01-pipeline/47_pipeline_script_protocol.md` §R1-R12, §4.1 logic_vars, §6.1 RUN_AT, §6.2 streamQuery, §7.1/§7.3 atomicity, §8.1/§8.2 audit_table, §11 counter semantic contract
- `docs/specs/01-pipeline/48_pipeline_observability.md` §3.1/§3.2/§3.4/§3.5/§4
- `docs/specs/01-pipeline/82_crm_assistant_alerts.md` §3 + §4 (the F.2 contract — fully specified)
- `docs/specs/01-pipeline/84_lifecycle_phase_engine.md` §3 (CoA P1-P4 phase emission rules) + §7
- `docs/specs/01-pipeline/42_chain_coa.md` §6.6.B + §6.11 (lead_id substrate + Phase F sub-deliverable map)
- `docs/specs/01-pipeline/85_trade_forecast_engine.md` §3 (F.1 CoA forecast outputs that F.2 consumes via `trade_forecasts.lead_id`)

### Key Files
- **`scripts/update-tracked-projects.js`** (EXTEND — currently 762 lines; ~+250 lines for CoA UNION + 4 module-local pure helpers + 3 new notification types + audit row additions + remove E.2 defensive guard + standardize `permit_lead_id` → `lead_id` naming per #118)
- **`migrations/153_tracked_projects_relax_for_coa.sql`** (NEW — drops FK fk_tracked_projects_permits + makes permit_num + revision_num nullable; metadata-only)
- **`migrations/154_coa_crm_assistant_logic_variables.sql`** (NEW — **1 new key only** per v2 CRIT-A: `coa_stall_threshold_postponed_days=60`. The other 3 v1-proposed keys ALREADY EXIST in DB — `coa_stall_threshold=30` from mig 093; `coa_stall_threshold_p2_days=90` and `coa_imminent_window_days=7` from mig 136. ON CONFLICT DO NOTHING; no explicit BEGIN/COMMIT per mig 135 R8 convention.)
- **`src/tests/migration-153-tracked-projects-relax-for-coa.infra.test.ts`** (NEW — 7 tests)
- **`src/tests/migration-154-coa-crm-assistant-logic-variables.infra.test.ts`** (NEW — 7 tests)
- **`src/tests/update-tracked-projects.infra.test.ts`** (EXTEND — Phase F.2 describe block, ~22 tests)
- **`src/tests/update-tracked-projects.logic.test.ts`** (EXTEND OR NEW — Phase F.2 describe block, ~6 tests for the 4 pure helpers)
- **`scripts/seeds/logic_variables.json`** (ADD — **3 entries** per v3 CRIT-4 + v4 CRIT-EE: `coa_stall_threshold_p2_days` + `coa_imminent_window_days` (absent from seeds JSON despite seeded in DB by mig 136) + new `coa_stall_threshold_postponed_days` (mig 154). v3's stale Key Files claim "1 entry; mig-136 keys already present" was VERIFIED FALSE via grep.)
- **`docs/runbook/F1_baseline_quiet_period.md`** (AMEND — v2 HIGH-M fold: new `## Phase F.2 additions` section listing the 5 new audit rows + 4 new records_meta distributions with day-0 to day-7 expected behavior. Authored as a named F.2 deliverable.)
- **`src/tests/control-panel.logic.test.ts`** (EXTEND — append 3 new keys to `EXPECTED_LOGIC_VAR_KEYS`)
- **`docs/specs/01-pipeline/82_crm_assistant_alerts.md`** §4 (AMEND — DELIVERED note + 3-tier threshold clarification + `permit_num` polymorphism note)
- **`docs/specs/01-pipeline/42_chain_coa.md`** §6.11 (AMEND — F.2 sub-deliverable entry between F.1 and F.3, with `[F.2-COMMIT]` placeholder)
- **`docs/specs/01-pipeline/84_lifecycle_phase_engine.md`** §7 (AMEND — Phase F.2 consumer reference)

### Operating Boundaries
**Target Files (scope of this WF):**
- `scripts/update-tracked-projects.js`
- `migrations/153_tracked_projects_relax_for_coa.sql`
- `migrations/154_coa_crm_assistant_logic_variables.sql`
- `scripts/seeds/logic_variables.json`
- 4 test files (2 NEW + 2 EXTEND)
- 3 spec amendments

**Out-of-Scope:**
- `scripts/compute-trade-forecasts.js` (F.1 — shipped)
- `scripts/compute-opportunity-scores.js` (F.3)
- `src/components/admin/LeadDetailInspector.tsx` + CoA panel UI (F.4 / Spec 76)
- `notifications.lead_id` column extension — DEFERRED to F.4 / mobile app integration WF
- The mobile/admin API claim path for CoA leads — separate WF (out of pipeline domain)
- `scripts/lib/lifecycle-phase.js` — shared lib; no changes needed for F.2

**Cross-Spec Dependencies:**
- **Relies on:** F.1 commit `4d58444` (CoA forecasts in `trade_forecasts.lead_id`); Phase C mig 140 (`tracked_projects.lead_id` column); Phase D `classify-coa-trades.js` (`lead_trades` writes); E.2 `classify-lifecycle-phase.js` (CoA `lifecycle_phase`/`lifecycle_group`/`lifecycle_stalled` + `lifecycle_classified_at`).
- **Consumed by:** F.3 (CoA opportunity scoring); F.4 (Lead Inspector CoA panel); Spec 95/99 mobile app (3 new notification types).

---

## Technical Implementation

### Part 1.A — Migration 153 (tracked_projects schema relaxation, metadata-only)

```sql
-- migrations/153_tracked_projects_relax_for_coa.sql
-- SPEC LINK: docs/specs/01-pipeline/42_chain_coa.md §6.6.B Option C
-- SPEC LINK: docs/specs/01-pipeline/82_crm_assistant_alerts.md §4 CoA Lead Handling
-- SPEC LINK: docs/specs/01-pipeline/84_lifecycle_phase_engine.md §6.11 Phase F.2
--
-- Relaxes tracked_projects schema so CoA-only leads can be inserted: drops FK
-- fk_tracked_projects_permits and makes permit_num + revision_num nullable.
-- Mirrors mig 151's pattern for trade_forecasts; metadata-only — no table rewrite.

-- ============================================================================
-- UP
-- ============================================================================
BEGIN;

-- 1. Drop FK (CoA leads have no permits row to reference; the chk_tracked_projects_lead_id_format
--    CHECK still enforces lead_id format, and tracked_projects.lead_id is the canonical anchor.)
ALTER TABLE tracked_projects DROP CONSTRAINT IF EXISTS fk_tracked_projects_permits;

-- 2. Relax NOT NULL on legacy permit-side anchors (metadata-only — DROP NOT NULL doesn't scan).
ALTER TABLE tracked_projects ALTER COLUMN permit_num DROP NOT NULL;
ALTER TABLE tracked_projects ALTER COLUMN revision_num DROP NOT NULL;

-- 3. CRIT-v2-B fold (Gemini CRIT + DeepSeek MED convergent): CoA partial UNIQUE so the same user
--    cannot claim the same CoA lead multiple times for the same trade. PostgreSQL treats two
--    NULLs in (permit_num, revision_num) as NOT equal — so uq_tracked_user_permit_trade does
--    NOT enforce uniqueness for CoA rows. This partial UNIQUE fills the gap.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tracked_user_coa_trade
  ON tracked_projects (user_id, lead_id, trade_slug)
  WHERE lead_id LIKE 'coa:%';

-- 4. CRIT-v2-G fold (Gemini HIGH + DeepSeek HIGH + Independent HIGH convergent): dedicated column
--    for COA_DECISION_RENDERED dedup, replacing the v1 overload of last_notified_urgency. Without
--    this, setting last_notified_urgency='decision_rendered' freezes the column permanently
--    (the urgency-reset path only clears 'imminent' → NULL).
ALTER TABLE tracked_projects
  ADD COLUMN IF NOT EXISTS notified_decision_rendered BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;

-- ============================================================================
-- DOWN — comment-only per Rule 6 (matches mig 132/138/140/142/145/147/148/150/151/152 convention).
-- Operator runs manually only on rollback. Order: DROP new index FIRST (no-op if any), DELETE
-- CoA rows (DESTRUCTIVE), DROP new column, re-add NOT NULL, re-add FK.
-- ============================================================================
-- BEGIN;
--   -- (1) Drop the v2-CoA partial UNIQUE first (idempotent IF EXISTS).
--   DROP INDEX IF EXISTS uq_tracked_user_coa_trade;
--
--   -- (2) Drop the v2 BOOLEAN column.
--   ALTER TABLE tracked_projects DROP COLUMN IF EXISTS notified_decision_rendered;
--
--   -- (3) DESTRUCTIVE: drop any CoA-only rows produced post-F.2 — required before re-adding NOT NULL
--   --     and re-adding the FK (CoA rows would orphan-reference a non-existent permits row).
--   -- v3 LOW-19 + v4 HIGH-HH fold: restrict to lead_id LIKE 'coa:%' (drop the AND-permit_num
--   -- clause per Gemini v3 HIGH 5 — the very existence of a CoA-type lead is what the migration
--   -- enables; any CoA lead must be removed regardless of permit_num value).
--   DELETE FROM tracked_projects WHERE lead_id LIKE 'coa:%';
--
--   -- (4) Re-promote permit_num + revision_num to NOT NULL.
--   ALTER TABLE tracked_projects ALTER COLUMN permit_num SET NOT NULL;
--   ALTER TABLE tracked_projects ALTER COLUMN revision_num SET NOT NULL;
--
--   -- (5) Re-add the FK.
--   ALTER TABLE tracked_projects ADD CONSTRAINT fk_tracked_projects_permits
--     FOREIGN KEY (permit_num, revision_num) REFERENCES permits(permit_num, revision_num) ON DELETE CASCADE;
-- COMMIT;
```

**Pre-flight verification (operator runs against staging before merge):**
```sql
-- 1. Confirm no CoA rows currently exist (E.2 defensive skip guard means none should have leaked through)
SELECT COUNT(*) FROM tracked_projects WHERE lead_id LIKE 'coa:%';
-- Expected: 0 rows

-- 2. Confirm all existing rows have non-NULL permit_num/revision_num (invariant under current FK + NOT NULL)
SELECT COUNT(*) FROM tracked_projects WHERE permit_num IS NULL OR revision_num IS NULL;
-- Expected: 0 rows
```

### Part 1.B — Migration 154 (3 new logic_variables for CoA CRM assistant)

**v2 CRIT-A fold:** Live-DB query revealed 3 of v1's 3 proposed keys ALREADY EXIST (`coa_stall_threshold=30` from mig 093; `coa_stall_threshold_p2_days=90` + `coa_imminent_window_days=7` from mig 136). The v1 key name `coa_stall_threshold_days` drifted from the established `coa_stall_threshold` (no `_days` suffix) referenced in Spec 82 §4 line 86. v2 deletes those 3 redundant inserts and shrinks mig 154 to seed ONE new key: `coa_stall_threshold_postponed_days=60` (the previously-hardcoded Postponed/Deferred threshold per HIGH-v2-I fold).

```sql
-- migrations/154_coa_crm_assistant_logic_variables.sql
-- SPEC LINK: docs/specs/01-pipeline/82_crm_assistant_alerts.md §4 CoA Lead Handling
-- SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §4.1 operator-tunable values
--
-- v2 CRIT-A fold: only 1 new key. Existing keys (coa_stall_threshold, coa_stall_threshold_p2_days,
-- coa_imminent_window_days) were seeded by mig 093 + mig 136; F.2 reads them as-is without
-- re-seeding (would be a no-op via ON CONFLICT, but cleaner to omit).
-- v2 HIGH-I fold: promote previously-hardcoded 60-day Postponed/Deferred threshold to operator-tunable.

-- ============================================================================
-- UP
-- ============================================================================
INSERT INTO logic_variables (variable_key, variable_value, description)
VALUES
  ('coa_stall_threshold_postponed_days', 60,
   'Phase F.2 CRM Assistant CoA stall threshold for Postponed / Deferred statuses (mid-tier between generic 30-day and Hearing-Scheduled 90-day). Default 60 = upper edge of typical postponement before considered stalled. Promote to logic_variable to allow operator tuning during CoA backlog spikes that produce normal long postponements.')
ON CONFLICT (variable_key) DO NOTHING;

-- ============================================================================
-- DOWN — comment-only per Rule 6 convention
-- ============================================================================
-- DELETE FROM logic_variables WHERE variable_key = 'coa_stall_threshold_postponed_days';
```

### Part 2 — Script extension

#### 2.1 SOURCE_SQL UNION (with `lead_id` naming standardization per #118)

```javascript
const SOURCE_SQL = `
  -- Branch A: permit-side (existing; v2 #118 fold: rename permit_lead_id -> lead_id)
  SELECT
    tp.id AS tracking_id,
    tp.user_id,
    tp.status AS tracking_status,
    tp.trade_slug,
    tp.permit_num,
    tp.revision_num,
    p.lead_id AS lead_id,                       -- v2 #118 fold (was permit_lead_id)
    p.lifecycle_phase, p.lifecycle_stalled,
    NULL::varchar(50) AS coa_status,
    NULL::varchar(50) AS coa_decision,
    NULL::date         AS hearing_date,
    NULL::varchar(10)  AS lifecycle_group,
    tf.predicted_start, tf.urgency,
    tp.last_notified_urgency, tp.last_notified_stalled,
    NULL::boolean      AS notified_decision_rendered,    -- v3 CRIT-1 fold: match Branch B's CRIT-G column
    COALESCE(tc.imminent_window_days, 14) AS imminent_window_days,
    NULL::int          AS coa_days_at_status
  FROM tracked_projects tp
  JOIN permits p ON tp.permit_num = p.permit_num
                 AND tp.revision_num = p.revision_num
  LEFT JOIN trade_forecasts tf ON tp.permit_num = tf.permit_num
                              AND tp.revision_num = tf.revision_num
                              AND tp.trade_slug  = tf.trade_slug
  LEFT JOIN trade_configurations tc ON tc.trade_slug = tp.trade_slug
  WHERE tp.status IN ('saved', 'claimed_unverified', 'claimed', 'verified')
    AND tp.permit_num IS NOT NULL
    AND tp.revision_num IS NOT NULL
    -- v2 CRIT-C fold: enforce branch mutual exclusivity — a row with both non-NULL permit_num
    -- AND lead_id LIKE 'coa:%' (e.g., back-filled linked CoA) would otherwise be processed by
    -- BOTH branches and produce duplicate alerts.
    AND (tp.lead_id IS NULL OR tp.lead_id NOT LIKE 'coa:%')

  UNION ALL

  -- Branch B: CoA-side (Phase F.2 NEW). tracked_projects.lead_id is the canonical anchor
  -- post-mig 153. JOIN to coa_applications via lead_id; trade_forecasts.lead_id (F.1 output)
  -- provides any future predicted_start signal — currently CoA forecasts are bid-window-only.
  --
  -- coa_days_at_status: NOW() - lifecycle_classified_at proxy for "days at current status"
  --   used by the 3-tier CoA stall logic (Spec 82 §4). NULL lifecycle_classified_at falls
  --   back to 0 (freshly classified — not a stall).
  SELECT
    tp.id AS tracking_id,
    tp.user_id,
    tp.status AS tracking_status,
    tp.trade_slug,
    tp.permit_num,                              -- NULL for CoA rows post-mig 153
    tp.revision_num,                            -- NULL for CoA rows post-mig 153
    tp.lead_id,
    ca.lifecycle_phase, ca.lifecycle_stalled,
    ca.status   AS coa_status,
    ca.decision AS coa_decision,
    ca.hearing_date,
    ca.lifecycle_group,
    tf.predicted_start, tf.urgency,
    tp.last_notified_urgency, tp.last_notified_stalled,
    tp.notified_decision_rendered,                 -- v2 CRIT-G fold: dedicated FaB/decision dedup flag
    -- v2 HIGH-J fold: NULL for CoA — script uses coa_imminent_window_days instead. Projecting
    -- tc.imminent_window_days here would pollute the row with a misleading permit-side value.
    NULL::int AS imminent_window_days,
    -- v2 HIGH-H + LOW-S folds: cascade lifecycle_classified_at → last_seen_at → 0 so unclassified
    -- CoAs don't silently suppress stall detection; GREATEST clamps negative clock-skew values.
    GREATEST(
      COALESCE(
        FLOOR(EXTRACT(EPOCH FROM (NOW() - ca.lifecycle_classified_at)) / 86400)::int,
        FLOOR(EXTRACT(EPOCH FROM (NOW() - ca.last_seen_at)) / 86400)::int,
        0
      ),
      0
    ) AS coa_days_at_status
  FROM tracked_projects tp
  JOIN coa_applications ca ON ca.lead_id = tp.lead_id
  LEFT JOIN trade_forecasts tf ON tf.lead_id = tp.lead_id
                              AND tf.trade_slug = tp.trade_slug
  -- v3 HIGH-10 fold: trade_configurations LEFT JOIN removed from Branch B (no columns consumed —
  -- CoA branch uses logicVars.coa_imminent_window_days, not tc.imminent_window_days; Branch A
  -- retains the join for permit-side `imminent_window_days` projection).
  WHERE tp.status IN ('saved', 'claimed_unverified', 'claimed', 'verified')
    AND tp.lead_id LIKE 'coa:%'
`;
```

**Column count parity:** Both branches project **20 columns** with matching types (v4 CRIT-BB fold — 3/4-convergent v3 review verification). PostgreSQL UNION ALL requires this. Column list per branch: tracking_id, user_id, tracking_status, trade_slug, permit_num, revision_num, lead_id, lifecycle_phase, lifecycle_stalled, coa_status, coa_decision, hearing_date, lifecycle_group, predicted_start, urgency, last_notified_urgency, last_notified_stalled, notified_decision_rendered, imminent_window_days, coa_days_at_status = 20.

#### 2.2 Module-local pure helpers (4 functions)

```javascript
// v3 LOW-20 fold: regex-based extraction of the CoA application_number from lead_id.
// Returns null on malformed input; callers should fall back to a defensive 'unknown' marker
// or skip the row (Spec 48 §4 failed_sample candidate).
function extractCoaApplicationNumber(leadId) {
  if (typeof leadId !== 'string') return null;
  const m = leadId.match(/^coa:(.+)$/);
  return m ? m[1] : null;
}

// selectCoaStallThreshold — Spec 82 §4 3-tier per-status mapping.
// v2 CRIT-A fold: uses existing logicVars key `coa_stall_threshold` (NOT `coa_stall_threshold_days`
// — v1 drift). Reads `coa_stall_threshold_postponed_days` (new in mig 154) for Postponed/Deferred.
// v3 MED-18 fold: explicit null/empty guard returns null — caller skips stall detection. Avoids
// silent false-stall for unclassified-status CoAs (intake-state with status=null).
function selectCoaStallThreshold(coaStatus, logicVars) {
  if (coaStatus == null || coaStatus === '') return null;                                          // v3 MED-18 fold
  if (coaStatus === 'Hearing Scheduled') return logicVars.coa_stall_threshold_p2_days;            // default 90 (existing key from mig 136)
  if (coaStatus === 'Postponed' || coaStatus === 'Deferred') return logicVars.coa_stall_threshold_postponed_days; // default 60 (mig 154 new)
  return logicVars.coa_stall_threshold;                                                            // default 30 (existing key from mig 093)
}

// isCoaInImminentWindow — hearing_date-based imminent gate (Spec 82 §4).
// v2 LOW-U fold: normalize to UTC midnight before subtraction so DST shifts + time-of-day diffs
// can't off-by-one the calendar-day calculation.
// v4 HIGH-GG fold: explicit UTC parse on string-form input — `new Date('2026-07-15')` is engine-
// dependent (some treat as UTC, some as local). Append 'T00:00:00Z' for canonical UTC parse.
// v4 NIT-XX fold: zero/negative windowDays guard — defensive against operator misconfiguration.
function isCoaInImminentWindow(hearingDate, runAt, windowDays) {
  if (!hearingDate) return false;
  if (typeof windowDays !== 'number' || windowDays <= 0) return false;        // v4 NIT-XX
  const hearingStr = typeof hearingDate === 'string'
    ? (hearingDate.includes('T') ? hearingDate : hearingDate + 'T00:00:00Z') // v4 HIGH-GG
    : hearingDate;
  const hearing = new Date(hearingStr);
  if (isNaN(hearing.getTime())) return false;
  hearing.setUTCHours(0, 0, 0, 0);
  const today = new Date(runAt);
  today.setUTCHours(0, 0, 0, 0);
  // v3 NIT-21 fold: Math.floor after midnight normalization — integer-day semantics are explicit.
  const daysUntilHearing = Math.floor((hearing.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  return daysUntilHearing > 0 && daysUntilHearing <= windowDays;
}

// CoA decision-keyed auto-archive (Spec 82 §4).
const COA_TERMINAL_DECISIONS = new Set(['Refused', 'Withdrawn', 'Closed']);
function isCoaDecisionTerminal(coaDecision) {
  return typeof coaDecision === 'string' && COA_TERMINAL_DECISIONS.has(coaDecision);
}

// v3 HIGH-11 + v4 CRIT-DD fold: combined terminal-state check — terminal decision OR terminal status.
// Spec 82 §4 mandates archive on terminal decisions; Spec 84 §3 row P20 confirms
// `status IN ('Complete', 'Closed')` are terminal lifecycle states. Per DeepSeek v3 CRIT 2,
// `Closed` is the dominant terminal status (28K rows, 87.6% of CoAs) — without this, mostly-
// approved-then-closed CoAs would never auto-archive even though their variance lifecycle is
// complete and the linked permit (if any) becomes the authoritative lead per Spec 82 §4 FaB
// contract. Both 'Complete' (P20 final) and 'Closed' (P20 active-closure) are user-archive states.
const COA_TERMINAL_STATUSES = new Set(['Complete', 'Closed']);
function isCoaTerminalState(coaStatus, coaDecision) {
  return isCoaDecisionTerminal(coaDecision)
      || (typeof coaStatus === 'string' && COA_TERMINAL_STATUSES.has(coaStatus));
}

// COA_DECISION_RENDERED gate — fires on Approved decisions only.
// v2 CRIT-G fold: 'Final and Binding' REMOVED from approved set per Spec 82 §4 contract
// ("decision = 'Final and Binding' → keep the lead"). FaB leads are kept passively; the linked
// permit (if any) will surface as a new lead later. COA_DECISION_RENDERED only fires for
// 'Approved' / 'Approved with Conditions' — NOT FaB.
const COA_APPROVED_DECISIONS = new Set(['Approved', 'Approved with Conditions']);
function isCoaDecisionApproved(coaDecision) {
  return typeof coaDecision === 'string' && COA_APPROVED_DECISIONS.has(coaDecision);
}
```

#### 2.3 CoA branch dispatch (REPLACES E.2 defensive guard at lines 197-208)

```javascript
for await (const row of pipeline.streamQuery(pool, SOURCE_SQL, [])) {
  totalRows++;
  const isCoaRow = typeof row.lead_id === 'string' && row.lead_id.startsWith('coa:');

  if (isCoaRow) {
    totalRowsCoa++;

    const targets = TRADE_TARGET_PHASE[row.trade_slug];
    if (!targets) { unmappedTrade++; continue; }

    // v4 CRIT-AA fold (4/4 reviewers convergent): decision-reversal reset MUST run BEFORE the
    //   auto-archive branch. If a CoA appeals Approved → Refused, the script archives + continues
    //   under v3 ordering, leaving `notified_decision_rendered=TRUE` stuck forever. Reset first,
    //   then archive. Counter increment also moves here (BEFORE both reset + archive) so it sees
    //   the pre-reset state per the dedup-health semantic ("currently flagged AND still approved").
    if (row.notified_decision_rendered === true && isCoaDecisionApproved(row.coa_decision)) {
      coaNotifiedDecisionRenderedCount++;       // count rows currently flagged + still approved
    }
    if (row.notified_decision_rendered === true && !isCoaDecisionApproved(row.coa_decision)) {
      // Decision reversed away from approved set — reset the dedup flag so a future re-approval
      // can fire a fresh COA_DECISION_RENDERED alert.
      updates.push({ id: row.tracking_id, notified_decision_rendered: false });
    }

    // Auto-archive precedence — BEFORE stall/imminent logic (per Spec 82 §4).
    // v3 CRIT-2 fold (4/4 reviewers convergent): simplified to `if (terminalState)`.
    //   v2's `|| (lifecycle_group === 'C4' && decisionTerminal)` was logically equivalent to
    //   `if (decisionTerminal)` alone — the C4 clause was dead code. Per Spec 82 §4 the rule is
    //   "decision IN ('Refused','Withdrawn','Closed') → archive immediately" with no group
    //   restriction; C4 is informational only (cohort breakdown).
    // v3 HIGH-11 + v4 CRIT-DD: extended to terminal STATUS check — `status IN ('Complete','Closed')`
    //   (Spec 84 §3 P20 mappings) covers approved-then-closed CoAs.
    // v4 HIGH-NN: any group's `.archived` counter increments here, not just C4 (post-CRIT-2 the
    //   archive path applies to all groups; C4 retained for historical cohort-narrative continuity).
    const terminalState = isCoaTerminalState(row.coa_status, row.coa_decision);
    if (terminalState) {
      updates.push({ id: row.tracking_id, status: 'archived' });
      archivedCoa++;
      const groupKey = row.lifecycle_group || 'unknown';
      if (skipDistributionCoa[groupKey]) skipDistributionCoa[groupKey].archived++;
      continue;
    }

    // Saved path (passive watchlist) — no alerts; FaB does not archive (linked permit handles it)
    if (row.tracking_status === 'saved') continue;

    // Claimed path (active flight board)
    if (!CLAIMED_STATUSES.has(row.tracking_status)) continue;

    // Stall detection — 3-tier per-status threshold + explicit lifecycle_stalled flag.
    // v3 MED-18 fold: null stallThreshold (unrecognized/empty coaStatus) → skip the days-based
    // stall check; still honor the explicit lifecycle_stalled flag from the classifier.
    const stallThreshold = selectCoaStallThreshold(row.coa_status, logicVars);
    const coaStalled = row.lifecycle_stalled === true
                    || (stallThreshold != null
                        && row.coa_days_at_status != null
                        && row.coa_days_at_status > stallThreshold);

    // v2 HIGH-K fold: gate alert pushes on !coaFirstDeployGrace to prevent day-0 storm.
    if (coaStalled && row.last_notified_stalled !== true && !coaFirstDeployGrace) {
      alerts.push({
        user_id: row.user_id,
        type: 'COA_STALLED',
        permit_num: row.permit_num,
        coa_application_number: (extractCoaApplicationNumber(row.lead_id) || 'unknown-coa'),
        trade_slug: row.trade_slug,
        title: NOTIFICATION_TITLES.COA_STALLED,
        body: `CoA stalled at "${row.coa_status}" for > ${stallThreshold} days — project may be on hold.`,
      });
      updates.push({ id: row.tracking_id, last_notified_stalled: true });
      coaStallAlerts++;
    }

    // Recovery — mirrors permit-side B3
    if (!coaStalled && row.last_notified_stalled === true && !coaFirstDeployGrace) {
      alerts.push({
        user_id: row.user_id,
        type: 'STALL_CLEARED',          // universal back-to-work type — reused for CoA
        permit_num: row.permit_num,
        coa_application_number: (extractCoaApplicationNumber(row.lead_id) || 'unknown-coa'),
        trade_slug: row.trade_slug,
        title: NOTIFICATION_TITLES.STALL_CLEARED,
        body: `CoA at ${(extractCoaApplicationNumber(row.lead_id) || 'unknown-coa')} is moving again — schedule activity resuming.`,
      });
      updates.push({ id: row.tracking_id, last_notified_stalled: false });
      coaRecoveryAlerts++;
    }

    // Imminent — hearing_date-based, NOT predicted_start-based
    const inImminentWindow = isCoaInImminentWindow(row.hearing_date, RUN_AT, logicVars.coa_imminent_window_days);
    if (inImminentWindow && row.last_notified_urgency !== 'imminent' && !coaStalled && !coaFirstDeployGrace) {
      const hearingStr = row.hearing_date
        ? new Date(row.hearing_date).toISOString().slice(0, 10)
        : 'soon';
      alerts.push({
        user_id: row.user_id,
        type: 'COA_HEARING_IMMINENT',
        permit_num: row.permit_num,
        coa_application_number: (extractCoaApplicationNumber(row.lead_id) || 'unknown-coa'),
        trade_slug: row.trade_slug,
        title: NOTIFICATION_TITLES.COA_HEARING_IMMINENT,
        body: `Variance hearing for ${(extractCoaApplicationNumber(row.lead_id) || 'unknown-coa')} is on ${hearingStr} — confirm crew availability for likely-approved ${row.trade_slug}.`,
      });
      updates.push({ id: row.tracking_id, last_notified_urgency: 'imminent' });
      coaImminentAlerts++;
    }

    // COA_DECISION_RENDERED — one-shot on Approved decisions (FaB excluded per Spec 82 §4 + v2 CRIT-G fold).
    // v2 CRIT-G fold: dedup via NEW notified_decision_rendered BOOLEAN column (mig 153), NOT via
    // overloading last_notified_urgency. Prevents the v1 state-machine bug where setting
    // last_notified_urgency='decision_rendered' froze the column forever.
    if (isCoaDecisionApproved(row.coa_decision) && !row.notified_decision_rendered && !coaFirstDeployGrace) {
      alerts.push({
        user_id: row.user_id,
        type: 'COA_DECISION_RENDERED',
        permit_num: row.permit_num,
        coa_application_number: (extractCoaApplicationNumber(row.lead_id) || 'unknown-coa'),  // v3 LOW-20 fold
        trade_slug: row.trade_slug,
        title: NOTIFICATION_TITLES.COA_DECISION_RENDERED,
        body: `Variance approved for ${(extractCoaApplicationNumber(row.lead_id) || 'unknown-coa')} — permit application expected within 12 months.`,
      });
      updates.push({ id: row.tracking_id, notified_decision_rendered: true });
      coaDecisionAlerts++;
    }

    // (v3 HIGH-7 reset block + v3 MED-14 counter MOVED to BEFORE auto-archive — see v4 CRIT-AA fold above.)

    // Urgency reset (mirrors permit-side B5)
    if (row.last_notified_urgency === 'imminent' && !inImminentWindow) {
      updates.push({ id: row.tracking_id, last_notified_urgency: null });
    }

    continue;
  }

  // ═════ Permit branch (existing logic preserved — E.2 defensive coa:% guard REMOVED above) ═════
  totalRowsPermit++;
  // ... existing permit-side body unchanged ...
}
```

#### 2.4 NOTIFICATION_TITLES additions

```javascript
const NOTIFICATION_TITLES = {
  STALL_WARNING:           'Site Stalled — Check your schedule.',           // existing
  STALL_CLEARED:           'Back to Work — Site is active again.',          // existing
  START_IMMINENT:          'Job Starting Soon — Confirm your crew.',        // existing
  COA_HEARING_IMMINENT:    'Variance Hearing Soon — Confirm crew.',         // NEW Phase F.2
  COA_DECISION_RENDERED:   'Variance Approved — Permit expected soon.',     // NEW Phase F.2
  COA_STALLED:             'Variance Stalled — Project may be on hold.',    // NEW Phase F.2
};
```

#### 2.5 INSERT INTO notifications — extended params

The INSERT column list does NOT change (still 7 columns). The params array picks up `coa_application_number` for CoA alerts (polymorphism on `permit_num` field):

```javascript
const params = batch.flatMap((a) => [
  a.user_id,
  a.type,
  a.coa_application_number || a.permit_num,   // CoA → application_number; permit → permit_num
  a.trade_slug,
  a.title,
  a.body,
  RUN_AT,
]);
```

Mobile app contract: type prefix `COA_*` discriminates; for CoA notifications the `permit_num` field holds the `application_number` (e.g., `'A0123/24TLAB'`). Documented in Spec 82 §4 amendment.

#### 2.6 LOGIC_VARS_SCHEMA — NEW Zod schema

```javascript
// v2 CRIT-A fold: read existing keys (NOT `_days` variant). All 4 keys are positive integers.
const LOGIC_VARS_SCHEMA = z.object({
  coa_stall_threshold:                z.coerce.number().int().positive(),  // existing, mig 093 default 30
  coa_stall_threshold_p2_days:        z.coerce.number().int().positive(),  // existing, mig 136 default 90
  coa_stall_threshold_postponed_days: z.coerce.number().int().positive(),  // NEW mig 154 default 60
  coa_imminent_window_days:           z.coerce.number().int().positive(),  // existing, mig 136 default 7
}).passthrough();
```

Startup-time Zod parse fails fast if any of the 4 keys is missing or non-positive.

**v2 NIT-V fold (config dependency warn):** Immediately after Zod validation, emit a soft warning if the operator-tunable ordering is violated:

```javascript
if (logicVars.coa_stall_threshold_p2_days < logicVars.coa_stall_threshold) {
  pipeline.log.warn('[tracked-projects]',
    `coa_stall_threshold_p2_days (${logicVars.coa_stall_threshold_p2_days}) < coa_stall_threshold (${logicVars.coa_stall_threshold}) — Hearing Scheduled rows will trigger stall faster than generic rows, contradicting Spec 82 §4 intent. Adjust via Spec 86 Control Panel.`);
}
```

#### 2.7 First-deploy grace + 30-day quiet period (parity with F.1)

```javascript
// v2 HIGH-N fold: pipeline slug MUST be 'permits:update_tracked_projects' (F.2's own pipeline),
// NOT F.1's 'permits:compute_trade_forecasts'. The flags drive observability classification for
// F.2's OWN audit rows, so the self-referential slug is correct.
const { rows: deployAgeRows } = await pool.query(
  `SELECT
     COUNT(*) FILTER (WHERE started_at < NOW() - INTERVAL '7 days')::int  AS prior_runs_7d,
     COUNT(*) FILTER (WHERE started_at < NOW() - INTERVAL '30 days')::int AS prior_runs_30d
   FROM pipeline_runs
   WHERE pipeline = 'permits:update_tracked_projects'`,
);
const coaFirstDeployGrace = deployAgeRows[0].prior_runs_7d === 0;
const inQuietPeriod = deployAgeRows[0].prior_runs_30d === 0;
```

#### 2.7.b NEW: Startup column-existence check (v3 MED-17 fold)

Branch B SOURCE_SQL references `tp.notified_decision_rendered` (added by mig 153). If mig 153 has not been applied, the UNION ALL fails at runtime with `column does not exist`. Mirror compute-phase-calibration.js E.3 R6 EXISTS-guard pattern:

```javascript
const { rows: [{ exists }] } = await pool.query(
  `SELECT EXISTS (
     SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'tracked_projects'
        AND column_name = 'notified_decision_rendered'
   ) AS exists`,
);
if (!exists) {
  throw new Error(
    '[tracked-projects] tracked_projects.notified_decision_rendered column missing — ' +
    'mig 153 required. Apply via: psql ... -f migrations/153_tracked_projects_relax_for_coa.sql');
}
```

#### 2.7.c NEW: Pre-stream count for INNER JOIN orphan capture (v3 HIGH-9 fold)

Branch B `JOIN coa_applications ca ON ca.lead_id = tp.lead_id` is an INNER JOIN — a `tracked_projects` row with `lead_id LIKE 'coa:%'` but no matching `coa_applications` row is silently dropped. Spec 48 §4 mandates `failed_sample` for surfaceable failures. Pre-stream count diff captures orphans:

```javascript
// Pre-stream count of eligible CoA tracked_projects rows (before INNER JOIN filtering)
const { rows: [{ eligible_coa }] } = await pool.query(
  `SELECT COUNT(*)::int AS eligible_coa
     FROM tracked_projects
    WHERE lead_id LIKE 'coa:%'
      AND status IN ('saved', 'claimed_unverified', 'claimed', 'verified')`,
);
const eligibleCoaPreStream = eligible_coa;

// Post-stream: capture lead_ids that were eligible but didn't appear in the stream
// (INNER JOIN dropped them due to missing coa_applications row).
let coaOrphanedLeadIds = 0;
const orphanedCoaSample = [];
// v4 HIGH-II fold: clamp negative values from race between pre-count and stream.
coaOrphanedLeadIds = Math.max(0, eligibleCoaPreStream - totalRowsCoa);
if (coaOrphanedLeadIds > 0) {
  // Capture orphan lead_id samples for failed_sample (cap at 20 per Spec 48 §4).
  const { rows: orphans } = await pool.query(
    `SELECT tp.lead_id
       FROM tracked_projects tp
       LEFT JOIN coa_applications ca ON ca.lead_id = tp.lead_id
      WHERE tp.lead_id LIKE 'coa:%'
        AND tp.status IN ('saved', 'claimed_unverified', 'claimed', 'verified')
        AND ca.lead_id IS NULL
      LIMIT 20`,
  );
  for (const o of orphans) {
    orphanedCoaSample.push(`lead_id=${o.lead_id}: no matching coa_applications row (INNER JOIN dropped)`);
  }
}
```

Add to emitSummary: `failed_sample: orphanedCoaSample.length > 0 ? orphanedCoaSample : undefined`.

#### 2.8 New audit rows + records_meta cohort traceability

| metric | value | threshold | status |
|---|---|---|---|
| `coa_stall_alerts` | `coaStallAlerts` | `null` | `INFO` |
| `coa_recovery_alerts` | `coaRecoveryAlerts` | `null` | `INFO` |
| `coa_imminent_alerts` | `coaImminentAlerts` | `null` | `INFO` |
| `coa_decision_alerts` | `coaDecisionAlerts` | `null` | `INFO` |
| `coa_archived` | `archivedCoa` | `< 100% of totalRowsCoa` | **WARN if `totalRowsCoa > 0 && archivedCoa === totalRowsCoa` else PASS** |

**v2 CRIT-F fold:** `coa_archived` gets a threshold (Spec 47 §10 audit_table needs ≥1 threshold row). 100%-archived-in-one-run signals data/classifier fault — the kill-switch detector Spec 82 §4 implicitly mandates.

**v2 LOW-T fold:** v1's `coa_skipped_count` retention REMOVED. F.2 is a different script from F.1; the F.1 baseline-continuity argument doesn't apply.

**v3 HIGH-9 fold:** New audit row `coa_orphaned_lead_ids` (per Spec 48 §4 + Spec 47 §11.4 traceability):
| metric | value | threshold | status |
|---|---|---|---|
| `coa_orphaned_lead_ids` | `coaOrphanedLeadIds` (clamped via Math.max(0, ...) per v4 HIGH-II) | `> 0` (v4 HIGH-LL fold — threshold label is the trigger condition, not the desired state) | WARN if > 0; PASS otherwise |
| `coa_orphaned_lead_ids_sample_capped` | `coaOrphanedLeadIds > 20 ? 1 : 0` (numeric per Spec 48 §3.1) | `null` | INFO. v4 HIGH-MM fold: surfaces whether the 20-cap on `failed_sample` truncated a larger orphan set. |
| `in_quiet_period` | `inQuietPeriod ? 1 : 0` (numeric per Spec 48 §3.1) | `null` | INFO. v4 HIGH-OO fold: makes the 30-day quiet-period state visible to `extractIssues()` + DataFlowTile, not just `records_meta`. |

**v3 MED-14 fold:** New `records_meta.coa_notified_decision_rendered_count` (integer, no threshold, INFO) — count of CoA rows where `notified_decision_rendered === true`. Operator dedup-health audit.

`records_meta` additions:
- `total_rows_permit` / `total_rows_coa` (per-branch breakdown)
- `coa_alert_distribution_by_lifecycle_group` — **v3 HIGH-8 fold:** all 4 groups use the SAME 5-field shape. C4 fields other than `archived` will always be 0 (architectural invariant — C4 leads always hit the auto-archive path before stall/imminent/decision logic), but explicit zeros provide uniform shape for downstream Observer consumption. Shape: `{C1: {imminent: 0, stalled: 0, recovery: 0, decision: 0, archived: 0}, C2: {...}, C3: {...}, C4: {imminent: 0, stalled: 0, recovery: 0, decision: 0, archived: 0}}`. Initialized as 4 entries with all 5 keys; incremented on the appropriate alert/archive path.
- `coa_stall_threshold_status_breakdown` — counts of CoA rows per `coa_status` (informational)
- `coa_first_deploy_grace` (boolean) + `in_quiet_period` (boolean) — operator visibility into baseline-quiet-period gates

`records_total` per Spec 47 §11.1 = `totalRowsPermit + totalRowsCoa`.

### Part 3 — Test scaffolding (TDD Red Light per user mandate)

**`src/tests/migration-153-tracked-projects-relax-for-coa.infra.test.ts`** (NEW — 7 tests).
**`src/tests/migration-154-coa-crm-assistant-logic-variables.infra.test.ts`** (NEW — 7 tests).
**`src/tests/update-tracked-projects.infra.test.ts`** (EXTEND — Phase F.2 describe block, ~22 tests):

1. SOURCE_SQL contains `UNION ALL`
2. Branch A projects `p.lead_id AS lead_id` (resolves #118)
3. Branch A WHERE filters `tp.permit_num IS NOT NULL AND tp.revision_num IS NOT NULL`
4. Branch B JOINs `coa_applications ca ON ca.lead_id = tp.lead_id`
5. Branch B filters `tp.lead_id LIKE 'coa:%'`
6. Branch B computes `coa_days_at_status` via EXTRACT EPOCH
7. Branch B `LEFT JOIN trade_forecasts tf ON tf.lead_id = tp.lead_id`
8. `selectCoaStallThreshold` extracted module-local pure function
9. `isCoaInImminentWindow` extracted
10. `isCoaDecisionTerminal` + `isCoaDecisionApproved` extracted
11. CoA branch dispatch checks `row.lead_id.startsWith('coa:')` (not legacy `permit_lead_id`)
12. CoA branch checks `isCoaDecisionTerminal` BEFORE stall/imminent (auto-archive precedence)
13. 3 new notification types present: COA_STALLED, COA_HEARING_IMMINENT, COA_DECISION_RENDERED
14. STALL_CLEARED reused for CoA recovery
15. NOTIFICATION_TITLES extended with 3 new entries
16. INSERT INTO notifications uses `coa_application_number` polymorphism on `permit_num` field
17. LOGIC_VARS_SCHEMA validates 4 CoA keys total (3 existing: `coa_stall_threshold`, `coa_stall_threshold_p2_days`, `coa_imminent_window_days`; 1 new: `coa_stall_threshold_postponed_days`) with `z.coerce.number().int().positive()` (v3 CRIT-5 scrub)
18. E.2 defensive `coa:` skip guard REMOVED (negative regex)
19. 5 new audit rows present (`coa_stall_alerts`, `coa_recovery_alerts`, `coa_imminent_alerts`, `coa_decision_alerts`, `coa_archived` with threshold) + `coa_orphaned_lead_ids` audit row (v3 HIGH-9); NO `coa_skipped_count` (v3 LOW-T scrub)
20. `records_meta.coa_alert_distribution_by_lifecycle_group` present with **C1/C2/C3/C4** (v3 HIGH-8 — all 4 groups symmetric 5-field shape)
21. `records_total = totalRowsPermit + totalRowsCoa`
22. `coaFirstDeployGrace` + `inQuietPeriod` pre-fetched in single startup query
23. **v3 HIGH-12 — Negative grep:** zero `row.permit_lead_id` references in `scripts/update-tracked-projects.js` post-rename (assertion via `read('scripts/update-tracked-projects.js').match(/row\.permit_lead_id/) === null`)
24. **v3 CRIT-1 + v4 CRIT-BB — UNION column parity:** Branch A SELECT projects `NULL::boolean AS notified_decision_rendered`; both branches emit **20 columns** (verified count, was incorrectly stated as 19 in v3)
25. **v3 CRIT-2 — Auto-archive simplified:** `if (terminalState)` only — no `lifecycle_group === 'C4'` clause; isCoaTerminalState combines decision + status checks
26. **v3 HIGH-7 — Decision-reversal reset:** When `!isCoaDecisionApproved(coa_decision) && row.notified_decision_rendered === true`, `updates.push({ id, notified_decision_rendered: false })`
27. **v3 HIGH-9 — Pre-stream orphan count:** SELECT before stream + diff against post-stream totalRowsCoa; populates `failed_sample`
28. **v3 HIGH-10 — Branch B `LEFT JOIN trade_configurations` REMOVED**
29. **v3 HIGH-11 — `isCoaTerminalState` helper combines `COA_TERMINAL_DECISIONS` + `COA_TERMINAL_STATUSES = {'Complete'}`**
30. **v3 MED-14 — `records_meta.coa_notified_decision_rendered_count`** populated from Branch B stream
31. **v3 MED-17 — Startup column-existence check:** information_schema query confirms `tracked_projects.notified_decision_rendered` exists before stream
32. **v3 MED-18 — `selectCoaStallThreshold` null guard** returns null on null/empty status; dispatcher skips days-based stall when threshold is null
33. **v3 LOW-19 — Mig 153 DOWN DELETE restricted** to `lead_id LIKE 'coa:%' AND ...`
34. **v3 LOW-20 — `extractCoaApplicationNumber` regex helper** replaces all `lead_id.slice(4)` usages; logic test asserts malformed-input returns null

**`src/tests/update-tracked-projects.logic.test.ts`** (NEW OR EXTEND — Phase F.2 describe block, ~6 tests):
1. `selectCoaStallThreshold('Hearing Scheduled', logicVars)` returns p2 threshold
2. `selectCoaStallThreshold('Postponed', logicVars)` returns `logicVars.coa_stall_threshold_postponed_days` (operator-tunable via mig 154 — v3 HIGH-I + v4 HIGH-KK scrubbed v2's "hardcoded 60" stale text). Test fixture passes logicVars with `coa_stall_threshold_postponed_days: 75` and asserts the function returns 75.
3. `selectCoaStallThreshold('Active Review', logicVars)` returns generic default
4. `isCoaInImminentWindow` returns true when 0 < daysUntilHearing <= windowDays
5. `isCoaInImminentWindow` returns false on null/past/beyond-window
6. `isCoaDecisionTerminal` returns true ONLY for {Refused, Withdrawn, Closed}

### Part 4 — Spec amendments

**`docs/specs/01-pipeline/82_crm_assistant_alerts.md` §4 CoA Lead Handling:**
- Add DELIVERED note: `**Phase F.2 (DELIVERED 2026-05-16 commit `[F.2-COMMIT]`):**` at the top of §4.
- Tighten 2-tier wording to 3-tier mapping: `'Hearing Scheduled' → coa_stall_threshold_p2_days (90)`, `'Postponed' | 'Deferred' → coa_stall_threshold_postponed_days (60 — mig 154, operator-tunable)`, default → `coa_stall_threshold (30)` (v4 HIGH-KK scrub of v3's "hardcoded mid-tier" stale text).
- Add inline note: `notifications.permit_num` polymorphism for CoA — mobile app discriminates via `type LIKE 'COA_%'`.

**`docs/specs/01-pipeline/42_chain_coa.md` §6.11 Phase F row** — add F.2 sub-deliverable entry.

**`docs/specs/01-pipeline/84_lifecycle_phase_engine.md` §7** — append Phase F.2 consumer reference.

---

## Standards Compliance

- **§2.1 Unhappy Path Tests:** unknown CoA status → generic threshold; null hearing_date → suppresses imminent; null lifecycle_classified_at → 0 days (not stall); E.2 defensive guard removal regression test.
- **§3.1 Zero-Downtime Migration:** Mig 153 is metadata-only (`DROP NOT NULL`, `DROP CONSTRAINT IF EXISTS`); mig 154 is INSERT VALUES only.
- **§9.1 Transaction Boundaries:** All UPDATEs + notification INSERTs in single `pipeline.withTransaction` (existing pattern preserved).
- **§9.2 Parameter Limit:** `ALERT_BATCH_SIZE = floor(65535 / 7) = 9362` preserved.
- **§9.3 Idempotent:** All UPDATEs use `IS DISTINCT FROM` guards; notification INSERT gated by `last_notified_*` flags so dedup is implicit.

---

## Spec 47 §R1-R12 Compliance

- §R4 — `LOGIC_VARS_SCHEMA` extended with 3 new positive-integer keys validated at startup.
- §R10 — audit rows expanded; `audit_table.verdict` cascade unchanged.
- §R11 — emitMeta reads extended with `coa_applications` (status, decision, hearing_date, lifecycle_phase, lifecycle_stalled, lifecycle_group, lead_id, lifecycle_classified_at, **last_seen_at** — v2 HIGH-H fold) + `trade_forecasts.lead_id` + `tracked_projects.lead_id` + `pipeline_runs` (deploy-age query). **v2 HIGH-P fold:** emitMeta writes extended with `notifications: ['user_id','type','permit_num','trade_slug','title','body','created_at']` (the 3 new alert types INSERT into this table; without this declaration the admin DataFlowTile loses the write arrow).
- §11.1 — `records_total = totalRowsPermit + totalRowsCoa`. **v2 CRIT-E fold (explicit defense):** Both counters tally `tracked_projects` rows (the unified primary entity — same table, not different entity classes). This is NOT a §11.2 Overflow Rule violation; it differs from the §11.2 example ("CoA application phase changes summed into permits counters") because both addends ARE the primary write target.
- §11.4 — CoA counters surfaced as audit_table.rows; cohort breakdown in `records_meta.coa_alert_distribution_by_lifecycle_group`.

---

## Spec 48 Pipeline Observability Adherence

- §3.1 audit_table.rows shape: all rows use `{ metric, value, threshold, status }`.
- §3.2 records_meta distributions: cohort breakdowns + per-branch totals + grace/quiet flags.
- §3.5 emitSummary BEFORE throw: F.2 introduces no new throw paths.
- §3.4 Strangler-Fig: 5 new audit rows + 4 new records_meta distributions produce baseline noise during first 7-30 days; operator pre-ack handled via a NEW `## Phase F.2 additions` section in `docs/runbook/F1_baseline_quiet_period.md` (v2 HIGH-M fold — the v1 "inherits F.1 runbook" claim was rejected by Observability HIGH 87 because the F.1 runbook is F.1-metric-specific; F.2 metrics need their own listing).

---

## Pre-Review Self-Checklist (48 items — walked against actual diff at Green Light)

(a) Mig 153 drops `fk_tracked_projects_permits` and relaxes both `permit_num` + `revision_num`?
(b) Mig 153 DOWN comment-only with DELETE-first ordering?
(c) Mig 154 seeds ONLY 1 new key `coa_stall_threshold_postponed_days=60` + ON CONFLICT DO NOTHING (v3 CRIT-A scrub — existing 3 keys already in DB from mig 093+136 are NOT re-seeded)?
(d) Mig 154 DOWN comment-only with the 1 new key in DELETE template (v3 CRIT-A scrub)?
(e) `scripts/seeds/logic_variables.json` gains 3 entries (v3 CRIT-4 scrub: existing-but-missing `coa_stall_threshold_p2_days` + `coa_imminent_window_days` + NEW `coa_stall_threshold_postponed_days`)?
(f) `EXPECTED_LOGIC_VAR_KEYS` extended with the same 3 keys (parity test)?
(g) SOURCE_SQL UNION ALL — identical column count + types both branches?
(h) Branch A projects `p.lead_id AS lead_id` (resolves #118)?
(i) Branch B JOINs `coa_applications ca ON ca.lead_id = tp.lead_id`?
(j) 4 module-local pure helpers extracted (`selectCoaStallThreshold`, `isCoaInImminentWindow`, `isCoaDecisionTerminal`, `isCoaDecisionApproved`)?
(k) E.2 defensive `coa:` skip guard fully REMOVED?
(l) CoA `isCoaDecisionTerminal` checked BEFORE stall/imminent (auto-archive precedence)?
(m) 3 new notification subtypes emit via existing INSERT path with `coa_application_number` polymorphism?
(n) `records_total = totalRowsPermit + totalRowsCoa` per Spec 47 §11.1?
(o) 5 new audit rows present (`coa_stall_alerts`, `coa_recovery_alerts`, `coa_imminent_alerts`, `coa_decision_alerts`, `coa_archived` with threshold); `coa_skipped_count` REMOVED (v3 CRIT-5 scrub of v2 stale reference)?
(p) `coaFirstDeployGrace` + `inQuietPeriod` pre-fetched in single startup query against `pipeline = 'permits:update_tracked_projects'` (v2 HIGH-N — F.2's own slug, NOT F.1's)?
(q) Negative grep — zero `row.permit_lead_id` references in the script body post-rename (v2 HIGH-L)?
(r) Mig 153 adds CoA partial UNIQUE `(user_id, lead_id, trade_slug) WHERE lead_id LIKE 'coa:%'` (v2 CRIT-B)?
(s) Mig 153 adds `notified_decision_rendered BOOLEAN NOT NULL DEFAULT FALSE` column (v2 CRIT-G)?
(t) Mig 154 seeds ONLY `coa_stall_threshold_postponed_days=60` (v2 CRIT-A redundancy fix)?
(u) Branch A WHERE includes `AND (tp.lead_id IS NULL OR tp.lead_id NOT LIKE 'coa:%')` for mutual exclusivity (v2 CRIT-C)?
(v) Auto-archive condition is `if (terminalState)` ONLY — no `lifecycle_group === 'C4'` clause anywhere in the dispatch (v3 CRIT-2 + v4 HIGH-KK scrub of v2 stale checklist text)?
(w) `'Final and Binding'` REMOVED from `COA_APPROVED_DECISIONS` (v2 CRIT-G)?
(x) COA_DECISION_RENDERED dedup uses NEW `notified_decision_rendered` column, NOT `last_notified_urgency='decision_rendered'` overload (v2 CRIT-G)?
(y) `coa_archived` audit row has threshold `'< 100% of totalRowsCoa'` with WARN classification on 100% (v2 CRIT-F — Spec 47 §10 needs ≥1 threshold)?
(z) `coa_skipped_count` REMOVED from F.2 audit rows (v2 LOW-T — no `coa_skipped_count` references anywhere in test items or checklist)?
(aa) `coa_alert_distribution_by_lifecycle_group` includes C4 entry (v2 HIGH-O)?
(bb) emitMeta writes include `notifications: [...]` (v2 HIGH-P)?
(cc) All 4 CoA alert push sites gated on `!coaFirstDeployGrace` (v2 HIGH-K)?
(dd) `selectCoaStallThreshold` reads `logicVars.coa_stall_threshold` (not `_days`) AND `logicVars.coa_stall_threshold_postponed_days` (v2 CRIT-A + HIGH-I)?
(ee) Branch B SOURCE_SQL projects `NULL::int AS imminent_window_days` (v2 HIGH-J — no permit-side pollution)?
(ff) `coa_days_at_status` cascades to `last_seen_at` fallback + GREATEST clamp (v2 HIGH-H + MED-S)?
(gg) Startup config-dependency warn fires when `coa_stall_threshold_p2_days < coa_stall_threshold` (v2 NIT-V)?
(hh) `isCoaInImminentWindow` normalizes both timestamps to UTC midnight + uses `Math.floor` (v2 LOW-U DST safety + v3 NIT-21)?
(ii) Auto-archive condition simplified to `if (terminalState)` — v2's `|| (lifecycle_group === 'C4' && decisionTerminal)` dead-code REMOVED (v3 CRIT-2 — 4/4 convergent reviewer fold)?
(jj) Branch A SOURCE_SQL projects `NULL::boolean AS notified_decision_rendered` for UNION column-count parity (v3 CRIT-1 — 3/4 convergent reviewer fold)?
(kk) `isCoaTerminalState(coa_status, coa_decision)` helper combines terminal-decision + terminal-status (`Complete` for P20) per Spec 82 §4 + Spec 84 §3 (v3 HIGH-11)?
(ll) `notified_decision_rendered` reset path present — if `!isCoaDecisionApproved(coa_decision) && row.notified_decision_rendered === true`, clear to false (v3 HIGH-7)?
(mm) C4 cohort entry initialized with full 5-field shape (matches C1/C2/C3) (v3 HIGH-8)?
(nn) `coa_orphaned_lead_ids` audit row + `orphanedCoaSample` failed_sample populated from pre-stream count diff (v3 HIGH-9)?
(oo) `LEFT JOIN trade_configurations` REMOVED from Branch B (v3 HIGH-10)?
(pp) Numbered test #23 — negative-grep for `permit_lead_id` in script body (v3 HIGH-12 — promoted from v2 checklist-only)?
(qq) Startup `information_schema.columns` check confirms `notified_decision_rendered` exists pre-stream (v3 MED-17)?
(rr) `selectCoaStallThreshold` null/empty `coaStatus` guard returns null + dispatcher skips days-based stall when threshold is null (v3 MED-18)?
(ss) `extractCoaApplicationNumber(leadId)` regex helper REPLACES all `row.lead_id.slice(4)` usages (v3 LOW-20)?
(tt) Mig 153 DOWN DELETE restricted to `lead_id LIKE 'coa:%' AND (permit_num IS NULL OR revision_num IS NULL)` (v3 LOW-19)?
(uu) Risk Register items #4 / #5 / #6 rewritten to reflect v2 folds (CoA partial UNIQUE shipped; 60d in logic_variable; F.2 runbook section authored) — NO stale v1 residue (v3 CRIT-3)?
(vv) Spec 82 §4 amendment text uses `coa_stall_threshold` (no `_days` suffix) + cites `coa_stall_threshold_postponed_days` for Postponed/Deferred (v3 CRIT-6)?

---

## Execution Plan (per WF1 in `.claude/workflows.md`)

- [x] **Contract Definition:** N/A — no API route. SOURCE_SQL UNION shape + 5 helper-fn contracts (extractCoaApplicationNumber, selectCoaStallThreshold, isCoaInImminentWindow, isCoaDecisionApproved, isCoaTerminalState) implemented in script.
- [x] **Spec & Registry Sync:** Spec 82 §4, Spec 42 §6.11, Spec 84 §7 amended. (system-map regeneration on close-out commit.)
- [x] **Schema Evolution:** Mig 153 + mig 154 authored and applied directly via `psql -U postgres -d buildo -f migrations/...` (migration runner mig 148 failure persisted from F.1). `factories.ts` permit_num/revision_num optionality already in place from F.1.
- [x] **Test Scaffolding (TDD Red Light per user mandate):** 5 test files authored — 2 NEW migration tests (153: 8 tests, 154: 7 tests), 1 NEW logic test (24 tests via vm sandbox for pure helpers), 1 EXTEND infra test (+32 F.2 tests in Phase F.2 describe block, plus +7 diff-fold lock-ins F.2-33–F.2-39 added post-diff-review), 1 EXTEND control-panel (+3 EXPECTED_LOGIC_VAR_KEYS).
- [x] **Red Light:** Confirmed.
- [x] **Implementation:** Migs applied, script extended ~+450 lines per Part 2.
- [x] **Auth Boundary & Secrets:** N/A — backend script.
- [x] **Pre-Review Self-Checklist:** 48 items walked at Green Light; observability gaps surfaced and folded post-diff round (#180 orphan, #182 unknown slot, #183 emitSummary).
- [x] **Runbook authorship (v2 HIGH-M):** `## Phase F.2 additions` section authored in `docs/runbook/F1_baseline_quiet_period.md` covering 7 new audit rows + 5 new records_meta distributions; diff-doc-gap #184 fold added orphan exclusion sentence + `unknown` slot semantics.
- [x] **Multi-Agent Review (4 reviewers per user mandate):** Plan-stage rounds v1/v2/v3 + v4 PLAN LOCK direct. Diff-stage round: Gemini + DeepSeek bash + Independent worktree + Observability worktree. Surfaced 4 CRIT + 2 HIGH + 1 IMPORTANT + 1 doc gap inline folds (#177-184); 2 false positives ruled out (#185, #192); 7 deferrals filed (#186-191, #193).
- [x] **Triage:** All real BUGs folded inline; DEFERs filed in `docs/reports/review_followups.md` #185-193.
- [x] **Green Light:** `npm run verify` → 6145/6145 pass (+7 diff-fold lock-ins vs pre-diff baseline of 6138). Zero regressions.
- [x] **WF6 close-out:** Single commit `feat(82_crm_assistant_alerts): WF1 Phase F.2 — update-tracked-projects.js CoA branch + mig 153 tracked_projects relaxation + mig 154 CoA logic_variables + 3 new notification subtypes + decision-keyed auto-archive`. Tiny follow-up `docs(82_crm_assistant_alerts): WF1 Phase F.2 close-out` fills `[F.2-COMMIT]` placeholders.

---

## Risk Register (load-bearing decisions worth surfacing at plan-review)

1. **FK drop is irreversible-by-software** — mig 153 DOWN comment-only per Rule 6.
2. **`notifications.permit_num` polymorphism for CoA notifications** — mobile app routes via `type LIKE 'COA_%'`. Cleaner option (dedicated `notifications.lead_id` column) deferred to F.4 / mobile app WF. Risk: mobile code that interprets `permit_num` literally could mis-render CoA notifications. Mitigation: type prefix check at top of notification handler.
3. **`coa_days_at_status` proxy via `lifecycle_classified_at`** — over-counts if classifier re-ran without status change. Precise per-status duration requires `lifecycle_status_history` query (Phase I follow-up #110 scope).
4. **CoA tracked_projects dedup — RESOLVED (v2 CRIT-B)**: mig 153 adds partial UNIQUE INDEX `uq_tracked_user_coa_trade ON tracked_projects (user_id, lead_id, trade_slug) WHERE lead_id LIKE 'coa:%'`. The same user can no longer claim the same CoA lead multiple times for the same trade. Pre-existing `uq_tracked_user_permit_trade` covers permit-side rows via composite key; partial UNIQUE complements for CoA. NO scope deferral.
5. **CoA stall threshold for 'Postponed'/'Deferred' — RESOLVED (v2 HIGH-I)**: promoted to `coa_stall_threshold_postponed_days` (mig 154, default 60). Operator-tunable via Spec 86 Control Panel. `selectCoaStallThreshold` reads from logicVars; no hardcoded constant.
6. **F.2 runbook section AUTHORED (v2 HIGH-M)**: NOT inheriting F.1 runbook silently. F.2 adds `## Phase F.2 additions` section to `docs/runbook/F1_baseline_quiet_period.md` enumerating the 5+1 new audit rows + 4 new records_meta distributions with day-0 to day-7 expected behavior. Named deliverable in Execution Plan; v3 MED-15/16 added day-0 contingency notes for `coa_archived` WARN + grace-suppression callout.

---

> **PLAN LOCKED v4 — AUTHORIZED FOR IMPLEMENTATION.**
>
> v3 4-reviewer round surfaced 28 findings — trajectory plateaued (v1=25 → v2=22 → v3=28). My targeted-Edit folds were accumulating stale residue. Per user authorization "Fold all + PLAN LOCK v4 directly" (terminal pattern matching F.1 v4), v4 folds all 28 findings without another reviewer round at plan stage.
>
> **Key v4 folds:**
> - **CRIT-AA**: decision-reversal reset reordered BEFORE auto-archive (the 4/4-convergent fix) + counter guard `&& isCoaDecisionApproved` (DeepSeek + Independent + Observability convergent).
> - **CRIT-BB**: UNION column count = **20** (verified manually; was incorrectly 18/19 in 3 spots).
> - **CRIT-CC**: `extractCoaApplicationNumber` null fallback `|| 'unknown-coa'` at all 5 call sites + INSERT params.
> - **CRIT-DD**: `'Closed'` added to `COA_TERMINAL_STATUSES` — 28K rows (87.6% of CoAs) now auto-archive correctly.
> - **CRIT-EE**: Key Files seeds-JSON note rewritten to "3 entries" reflecting verified grep state.
> - **CRIT-FF**: `LIMIT 0` direct query replaces `information_schema` (avoids schema cache lag + emit-before-throw concerns).
> - **HIGHs**: UTC date parse, broad DOWN DELETE, Math.max(0,...) clamp, LEFT JOIN refactor for single-pass orphan detection, 3 stale residue scrubs, threshold label `> 0`, sample-cap divergence + in_quiet_period as audit rows.
>
> §10 note unchanged: Governed by Spec 47 §11 Counter Semantic Contract (records_total = primary entity `tracked_projects` rows from both same-table addends per §11.1) and Spec 82 §4 (fully spec-locked design contract).
>
> Diff-stage 4-reviewer round (Gemini + DeepSeek + Independent worktree + Observability worktree) runs AFTER Green Light, BEFORE WF6 commit, per user-mandated review protocol. Will triage all diff-stage findings (fold-and-relock vs PLAN LOCK directly) before committing.
>
> Proceed to Implementation: scaffold tests (TDD Red Light per user-mandated "failed test first"), apply mig 153 + mig 154, implement update-tracked-projects.js per Part 2 (CoA branch dispatch + helpers + audit rows + cohort breakdowns), author runbook section.

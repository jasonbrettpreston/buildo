# Batch 1 I3 Assessment — `assert_engine_health` (compressed 3-commit form)

**Commit form: compressed (R-PACE-1)**

**Plan:** `.cursor/batch1_i3_assert_engine_health_active_task.md` (AUTHORIZED 2026-09-13) — mirrors `.cursor/c4_batching_entry_active_task.md` §3.2 order 3, Execution Plan row **I3**. Fold 0 (orchestrator) confirmed the R-PACE-1 register row + `step-validate.mjs` invariant #23 + the Spec 123 §7 paragraph were ALL landed before this commit could open (`62c35b65`, verified this session — HEAD `2d28a3ce` is two commits past it); the Fold-0 precondition ("land R-PACE-1 before any compressed-form commit") is therefore already satisfied and is not this commit's own obligation.
**Governing procedure:** Spec 124 R-PACE-1 (`docs/specs/01-pipeline/124_step_standard_policy.md:211`) instantiating Spec 123 §7's nine-commit content into 3 commits. This deliverable is **commit ① only** — PH-0 boundary freeze, PH-3 intent ledger, PH-5 seam map, PH-6 classification, plus the PH-7 red-first suite (folded into commit ① per the plan's §2 ledger, row 1). Commits ②/③ (golden captures, descriptor/compute, cutover) are out of scope.
**Domain Mode:** Cross-Domain (no admin file edited this session; `src/lib/admin/funnel.ts` is a real downstream reader of `engine_health_snapshots`, confirmed unmodified — handoff note owed at commit ③ per I2 precedent).

---

## 1. PH-0 — Boundary freeze (G0)

### 1.0 Target Spec, re-measured this session

`grep -n "assert-engine-health\|assert_engine_health" docs/specs/00-architecture/00_system_map.md` — the generator now lists **every** target file per spec (G0 made real 2d28a3ce, no `+N more` cap) — **zero hits**: no owner row exists, same gap I1/I2 hit. The file's own three `SPEC LINK` headers (`:17-19`) govern: **Spec 41** (`:67` step-table row 23, `:178-183` the *"Engine health (assert_engine_health)"* threshold table — read in full, see §1.1 finding 9 below), **Spec 42** (`:39` step-table row 9, `:264` Phase-G retirement note "no change"), **Spec 43** (`:58` step-table row 27, `:138-150` the chain-tail VACUUM-owner prose already read by Fold 1). **Spec 44** (`:37` step-table row 6, deep_scrapes-only — *"Dead tuple ratio + auto-vacuum (maintenance — runs before quality gates)"*) is a 4th invocation with no SPEC LINK header in the file itself, the same drift the plan's §0 Target Spec line already named.

Position-number drift in Specs 42/43's tables (row 9 vs measured 12/16; row 27 vs measured 28/28) is the **same already-filed HIGH `review_followups.md` item** batch1 I2 commit 9 opened for `assert_data_bounds`'s own stale row (Spec 42/43 tables are uniformly off by the CoA chain's 5 omitted steps and the sources chain's leading `reconcile` step respectively) — not a new finding, cited here rather than re-filed. Spec 41's row 23 is NOT stale (23/33 matches exactly, §1.1 claim 3).

Architecture specs read per the brief: Spec 122 §1.10 (archetype profiles, evidence table `:635-645`, hybrid footnote `:647`), §5/§8 (checks[] shape, ASSERT class-L retirement precedent `:1112-1118`); Spec 123 §6 (gates)/§7 (nine-commit table, R-PACE-1 `:356`); Spec 124 Rules 1-13, R-C, R-K/R-K.1 (`converted.json.pending` vocabulary), R-AB/R-AC/R-AD, R-PACE-1 (`:211`).

### 1.1 Core facts, independently re-measured this session (every command run live, none copied from the plan)

| # | Claim | Command | Measured value |
|---|---|---|---|
| 1 | Line count | `wc -l scripts/quality/assert-engine-health.js` | **347** — confirmed, matches plan row 1. |
| 2 | Advisory lock | `grep -n "^| \*\*104\*\* " docs/specs/01-pipeline/47_pipeline_script_protocol.md` | **104**, category "6 — Quality", writes-DB column reads **"NO — snapshot recording"** (the registry's own pre-existing framing, not authored this session) — confirmed, matches plan row 2. |
| 3 | Chains + position | `node -e` over live `manifest.json.chains` | **permits** 23/33 (last=`backup_db`) · **coa** 12/16 (last=`assert_global_coverage`) · **sources** 28/28 (**last step in the chain**) · **deep_scrapes** 6/7 (last=`assert_staleness`) — confirmed exactly against plan row 3. 4 chains ⇒ **5 capture pairs** at commit ②, not built this commit. |
| 4 | DML enumeration | full-file read (not grep alone) | `pipeline_runs` INSERT `:50-54` (guarded `!CHAIN_ID`, `:48`) · UPDATE `:297-307` (guarded `if (runId)`, `:297`) · `engine_health_snapshots` INSERT…ON CONFLICT DO UPDATE `:160-180`, guarded by **6** `IS DISTINCT FROM` column comparisons (`n_live_tup, n_dead_tup, dead_ratio, seq_scan, idx_scan, seq_ratio` — `:172-177`) · `VACUUM ANALYZE <dynamic table>` `:149`, inside a loop over `vacuumTargets` derived at runtime from the same `pg_stat_user_tables` scan (`:72-79`: *"Discover all public-schema tables dynamically — no hardcoded list"*), each iteration independently try/caught (`:147-153`). All confirmed, matches plan row 4 exactly. |
| 5 | The 4 threshold literals | `:30-33` | `DEAD_TUPLE_RATIO = 0.10`, `SEQ_SCAN_RATIO = 0.80`, `SEQ_SCAN_MIN_ROWS = 10000`, `PING_PONG_RATIO = 10` (comment cites `review_followups.md`). Confirmed against Rule 3 — none is a registered `logic_variables` entry (`grep -c "dead_tuple_ratio\|seq_scan_ratio\|ping_pong" scripts/seeds/logic_variables.json` → 0). |
| 6 | Sibling literals, **NOT** verdict-affecting the same way | `:222-223`, `:255` | The inspection-only audit table (Phase 6, deep_scrapes) independently hardcodes `dead_tuple_pct` FAIL at `>= 10` and `update_insert_ratio` FAIL at `>= 5` — **two MORE undeclared literals, not counted in the plan's "4"**, and the `5` disagrees with the top-level `PING_PONG_RATIO=10` for the conceptually same metric (see §1.4 finding). The CoA-only table (`:255`) uses the SAME `dead_tuple_pct >= 10` bound but a **different severity** (`WARN`, not `FAIL`) for the identical predicate. Genuine new finding this session, not in the plan — filed §4.4 AEH-D3. |
| 7 | `execution.maintenance` schema fit | `step.schema.json:1370-1387` (I2's own citation, re-read this session) | Same tension I2 already named for its own file's dead-var: this step's VACUUM target set (`vacuumTargets`, `:143`) is **discovered at runtime**, not enumerable at descriptor-authoring time — does not fit the closed per-named-table array as declared. Ask 2 / Fold 1's ruling (deviations[], not schema-widening) applies here too, and is the SAME mechanism EP-D17 already adjudicated for this exact file (2026-09-10 DEFER, §1.3 below). |
| 8 | Existing tests, source-text hit count | `grep -c` | `quality.logic.test.ts` **19**, `quality.infra.test.ts` **12**, `db/quality-ledger-strand.db.test.ts` **2**, `quality-ledger-window.logic.test.ts` **2**, `pipeline-advisory-lock.infra.test.ts` **1**, `conversion-roadmap.infra.test.ts` **1** — confirmed exactly against plan row 7. All repoint to `computeAndFieldsSource()` at commit ③ per the I2 precedent; not touched this commit. |
| 9 | Spec 41's declared severities vs live code | `docs/specs/01-pipeline/41_chain_permits.md:178-183` (read in full this session, was NOT quoted in the plan) | Spec table: dead tuple ratio `>10%` → **FAIL**; seq scan `>80% on 10K+` → WARN; ping-pong `>2x` → WARN. **Live code disagrees on the FIRST row**: the generic per-table dead-tuple-ratio check (`:118-124`) only ever `warnings.push(...)` — it can **never** reach `errors[]`/`hasErrors`/the `:327` throw. The declared-FAIL severity is honoured **only** inside the narrow Phase-6 `inspAuditTable` (deep_scrapes chain only, `:222`), whose `status:'FAIL'` never propagates to the step-level halt either (see §1.4/§2 — Ask 1 evidence). Ping-pong's `>2x`→`>10x` divergence is the ALREADY-documented IL-1 fence (§2.1), not new. **New finding, not in the plan or the census row**: Spec 41's declared FAIL severity for dead-tuple ratio is not honoured by the code in any path that halts anything — filed §4.4 AEH-D4. |
| 10 | `identity.gate_exempt` | `isInfraStep`, `scripts/run-chain.js` (post-I3a `9a667a06`) | `assert_*` prefix ⇒ **true** under the live `isInfraStep` fallback, unchanged by I3a (which only corrected `compute_centroids`/`refresh_snapshot`). Declared at commit ②, not built here. |
| 11 | Downstream consumer | `grep -rln engine_health_snapshots src/ --include=*.ts \| grep -v tests` | `src/lib/admin/funnel.ts`, `src/lib/db/generated/schema.ts` (generated) — one real Cross-Domain reader, unmodified. Confirmed, matches plan row 9. |
| 12 | Ledger writes reconciled | full-file read | Same reconciliation shape as I2 §1.7: **2 literal statements** (INSERT `:50-54`, UPDATE `:297-307`) reachable through **3 runtime paths** (normal completion; chain-invoked skip-own-ledger, `!CHAIN_ID` false ⇒ 0 of 2 run; `finalizeStrandedRun`'s window-close backstop, `scripts/lib/ledger-window.js`, a 3rd library-owned path) — not 6 separate statements. All retire to the shared library regardless of the Ask 1 outcome (§2 below): `refresh-snapshot.descriptor.json` (RECORDER) shows the SAME retirement — a RECORDER descriptor carries no hand-rolled `pipeline_runs` INSERT/UPDATE either. |

### 1.2 Verdict derivation / exit paths — measured, not assumed

Four independent code paths can set a `status` field, none of them a shared cascade function:
1. **Generic per-table loop** (`:96-140`): pushes to `warnings[]` only (dead-tuple, seq-scan, ping-pong) — **never `errors[]`**.
2. **`inspAuditTable`** (Phase 6, deep_scrapes only, `:200-233`): 2 of 5 rows carry a genuine `status:'FAIL'`/`'PASS'` ternary (`:222`, `:223`), `verdict = hasFails ? 'FAIL' : 'PASS'` (`:226-230`) — a parallel-boolean cascade, same class as `AS-D1`/`AGC-D6`/`ADB-D1`.
3. **`coaAuditTable`** (Phase 9, coa only, `:235-266`): same shape, `WARN`-only (`:255`), `coaHasFails` always false by construction (no row can reach `'FAIL'`) — a dead branch (`:259` `coaHasFails` computed, `:263` `verdict: coaHasFails ? 'FAIL' : 'PASS'` — unreachable FAIL, always PASS).
4. **Permits/sources/standalone fallback** (`:281-293`): `permitsEngineHasWarns ? 'WARN' : 'PASS'` — WARN-only, no FAIL possible.

**The ONLY thing that ever halts the run** (`hasErrors`, `:196`, feeding the `:327 throw`) is the OUTER try/catch (`:190-193`) — a genuine exception (DB connectivity, a malformed query), never a threshold breach. **No threshold anywhere in this file, including the two that render `'FAIL'` text, ever reaches the throw.** This is the single most load-bearing measured fact for the Ask 1 ruling below (§2).

### 1.4 The VACUUM-tail mechanism (EP-D17, already adjudicated — not re-litigated)

`review_followups.md:3480` (WF3 EP-D17, 2026-09-10, HIGH, cited verbatim by the plan's Fold 1 item 2): *"do NOT hoist the vacuum decision into the chain head, do NOT touch `assert-engine-health.js` or `run-chain.js` beyond the telemetry fold in C2"*. Spec 43 (`:142`) independently names this file as *"chain-tail VACUUM owner"* and `:150` as the deliberate, still-OPEN design (hoisting would change the very tension EP-D17 measured — vacuuming `parcels` AFTER the run that bloated it). This ruling is **binding and unchanged by this commit** — the loop (`:142-155`) is preserved verbatim; the only change this conversion makes is externalizing the 4 threshold literals (Rule 3) and, if Ask 2's `deviations[]` route is confirmed at commit ②, declaring the tension rather than leaving it silent. `EP-D18` (`review_followups.md`, the sibling HIGH row) is a separate, already-filed OPEN finding about `enrich_parcels`' own maintenance-vs-lock-xmin timing — not this file's concern, cited only because it shares the "maintenance timing" family.

### G0 verdict

All boundary claims independently re-measured this session; two genuine NEW findings surfaced beyond the plan's own §0 (§1.1 rows 6 and 9 — an undeclared severity mismatch between two per-chain audit tables, and a Spec 41 vs. live-code FAIL-severity drift that never actually halts anything), both filed to the defect ledger (§4.4) rather than silently folded into the plan's existing claims. **G0: PASS.**

---

## 2. Archetype ruling — ASSERT vs. RECORDER (Ask 1) — **OPERATOR RULING REQUESTED, NOT DECIDED HERE**

Per the executor brief and Fold 1 (binding): PH-0 must **measure**, then **propose**, then **STOP**. This section is the measurement + proposal; it does **not** resolve the question. Commit ② may not begin until the operator rules.

### 2.1 What the specs say, exactly

- Spec 122 §1.10's master classification table (`:635-645`, "port, don't re-derive" is the DEFAULT rule) lists `assert_engine_health` as one of the 5 `ASSERT` steps (row 27) — this is the port default.
- The SAME section, one line later (`:647`): *"⚠️ Step 27 `assert_engine_health` is an AST+REC hybrid and gets ASSERT runtime treatment only because `run-chain.js:544-550` dispatches on name prefix. A declared archetype makes the hybrid explicit and retires the prefix dispatch."* — Spec 122 itself names the hybrid and defers its resolution to "declaring the archetype," without picking a value.
- `scripts/steps/_schema/step-archetype-census.json`'s own row for this slug (re-read this session, unchanged): `"archetype": "ASSERT"`, `"reason": "...a genuine domain write (engine_health_snapshots) inside the ASSERT x-profile (outputs:\"none\" forced); PH-0 must re-derive this, not trust the port"` — the census's OWN text orders re-derivation; it is not a ruling.
- No spec text anywhere picks RECORDER. The evidence for RECORDER is entirely structural (below), never a citation.

### 2.2 Structural evidence, measured this session, both directions

**For ASSERT (the port default):**
1. Chain position and naming are identical to the 4 true ASSERT siblings — tail-of-chain, `assert_*` prefix, same 3 owning specs (41/42/43) as `assert_data_bounds`/`assert_global_coverage`.
2. It has genuine `checks`-shaped threshold logic (4 numeric bounds gating WARN/PASS per table) — structurally the ASSERT `checks[]` contract (`step.schema.json:1736-1737`, `x-profile: "ASSERT — 3 categories collapse to none"`), not RECORDER's info-only counters model.
3. `run-chain.js:544-550` dispatches this step's LIVE runtime behavior on the `assert_*` name prefix today (Spec 122 `:647`'s own citation) — its actual current treatment in the chain IS ASSERT treatment.

**For RECORDER:**
1. **The `engine_health_snapshots` write is schema-illegal under ASSERT.** ASSERT's x-profile forces `outputs: const "none"` (`step.schema.json:1718`, WD-1-verified, `122_pipeline_step_optimization.md:1112`) — a real, `IS DISTINCT FROM`-guarded 6-column upsert to a domain table (§1.1 claim 4) has **no legal home** under ASSERT's schema today. This is not the ledger-write shape (Class L `verdict_only`, which is *also* forced-none but is the SDK's OWN write, already retired identically for every ASSERT sibling) — `engine_health_snapshots` is a step-authored domain write.
2. **The write shape matches RECORDER's own exemplar structurally, and exceeds it in discipline.** `refresh-snapshot.descriptor.json` (`identity.archetype: "RECORDER"`, `template-freeze.json` `proven: true`) declares exactly one `outputs.writes[]` entry, `write_discipline.class: "guarded_upsert"` — the SAME class this file's write already is. `refresh_snapshot`'s own guard is declared `"none"` (a deliberate design choice, `:126` `guard_why`, because a 68-column dashboard snapshot is EXPECTED to differ every run); `assert_engine_health`'s guarded upsert is MORE disciplined — it carries 6 real `IS DISTINCT FROM` column guards (§1.1 claim 4), closer to a textbook `guarded_upsert` than the RECORDER exemplar itself.
3. **Nothing in this file ever halts on a threshold breach** (§1.2, measured exhaustively — 4 independent verdict paths, zero of them reach the `:327` throw via a threshold). Spec 122 `:1112` characterizes RECORDER's steady state as *"verdict is always PASS"* (`refresh-snapshot.descriptor.json` terminal `recorded`/`recorded_with_warnings`, never a FAIL terminal driven by its own checks) — this matches `assert_engine_health`'s measured behavior far more closely than ASSERT's canonical "checks gate the traffic light" contract. The two `'FAIL'`-labeled rows that DO exist (`inspAuditTable`) are **display-only verdict text inside `records_meta.audit_table`**, never wired to the halt — the exact shape a RECORDER's own `checks[].severity` (INFO/WARN, never blocking) produces, not an ASSERT's.
4. Spec 47 §A.5's registry (`:1948`, pre-existing, not authored by this conversion) already classifies lock 104's write column as **"NO — snapshot recording"** — the registry's own author, at a point in time predating this WF, already read this step's write as recording rather than asserting.
5. Spec 30 §5.4.1's halt-classification lesson (`tasks/lessons.md:110`, cited by CLAUDE.md's own review roster) states a gate must distinguish *"the data is wrong"* (halt-worthy) from *"I could not check"* — this file's actual design (never halting on any threshold, only on a genuine exception) is **already** the correct posture that lesson demands, which is unusual for something classified ASSERT (whose siblings — `assert_schema`, `assert_data_bounds` — DO halt on `fatalErrors`/exception-class failures only, matching this file, but also on some genuine per-check FAIL escalations that this file's design structurally avoids).

**Neutral / does not discriminate:**
- The 4 WARN-only thresholds (dead tuple, seq scan, ping-pong) could live under either archetype's `checks[]` — RECORDER's own exemplar (`refresh-snapshot.descriptor.json:213-274`) has 10 declared `checks[]`, all `severity: INFO/WARN`, `blocking: false` — an exact structural match for what this file's checks would look like whichever way the ruling goes.

### 2.3 What this commit does NOT do

Per Ask 1's own recommendation (plan §Asks row 1) and Fold 1 item 1: **no schema widening is proposed.** This commit does not add an `outputs.telemetry_writes[]` affordance, does not pre-author a descriptor under either archetype, and does not touch `step.schema.json`. It states the evidence and stops.

### **RULING REQUESTED — operator, before commit ② opens:**

> Does `assert_engine_health` re-derive to **RECORDER** (structural fit for its genuine guarded-upsert write and its never-halts-on-threshold behavior; `engine_health_snapshots` becomes a declared `outputs.writes[]` entry; the 4+2 thresholds become RECORDER-shaped `checks[]`, all non-blocking) — **or** does it stay **ASSERT-with-a-declared-exception** (matches Spec 122's port default and the chain-position/naming continuity with its 3 true-ASSERT siblings; requires either a widened schema affordance for the write, which Ask 1 recommends against building unilaterally, or a `deviations[]` entry explaining why a forced-`"none"`-outputs step nonetheless writes a domain table)?
>
> **Consequence for R-PACE-1 eligibility, measured this session:** `template-freeze.json.archetype_profiles` shows **both** `ASSERT` and `RECORDER` as `proven: true`. `converted.json.converted[]` currently holds **3** ASSERT members (`assert_schema`, `assert_global_coverage`, `assert_data_bounds`) and **1** RECORDER member (`refresh_snapshot`). Per `checkCompressedFormEligible` (`scripts/analysis/step-validate.mjs:482-503`), the compressed form is eligible for ASSERT (`archetypeConvertedCount: 3 >= 2`) but **would be ineligible for RECORDER today** (`archetypeConvertedCount: 1 < 2`) — if the operator rules RECORDER, this step's own commit ② cannot declare the compressed form until a second RECORDER conversion lands, and this commit's own `**Commit form: compressed (R-PACE-1)**` marker above would need to be withdrawn (falling back to the full nine-commit form) rather than silently kept. This consequence is stated, not resolved, here.

---

## 3. PH-3 — Intent Ledger

Per Spec 123 §7.1: **a human adjudicates; the agent discovers and cites evidence only.** Every row below is `PROPOSED (adjudication pending)`. Closed vocabulary: `preserved-in-runner` / `preserved-in-compute` / `encoded-as-descriptor-field` / `encoded-as-deviation` / `knowingly-retired`.

### 3.1 Fences found via `git log -S` / `git blame`, this session

| # | Fence | Blame commit | Subject | Evidence in the current file | Disposition — PROPOSED |
|---|---|---|---|---|---|
| AEH-IL-1 | `PING_PONG_RATIO` raised 2 → 10 | `8c9e64d7` (2026-03-21, "Raise PING_PONG_RATIO from 2 to 10 — dimensional tables naturally..."), comment reworded `bdcbb58a` (2026-04-17) | Operational baseline for healthy pipeline tables runs 5-6x; spec's `>2x` produced chronic false-positive WARNs. Explicitly named as a spec-vs-operational conflict, tracked in `review_followups.md` (which today is `:3480`'s HIGH DEFER row, §1.4). | Live: `PING_PONG_RATIO = 10` (`:33`), Spec 41 still declares `>2x` (§1.1 claim 9) — the divergence is DOCUMENTED, not silent. | **ACCEPT: encoded-as-descriptor-field** — becomes `logic_variables` entry `engine_health_ping_pong_ratio_warn_max` (default 10), `why` cites `8c9e64d7` + the review_followups HIGH row verbatim; Spec 41's table gets a spec-diff note at commit ③ (its own `>2x` text is stale, not this file). |
| AEH-IL-2 | `vacuumTargets` scope-crash fix | `9d9acf7a` (2026-03-12, "fix vacuumTargets scope crash, false verdict banner, and cross-chain status bleed") | `vacuumTargets` was declared `const` inside the try block but referenced outside it — hoisted to `let` before the try. | Live: `let vacuumTargets = [];` at `:68`, BEFORE the `try` at `:71` — the fix is the current shape. | **ACCEPT: preserved-in-compute** — the runtime array becomes an ordinary compute-scoped local; no descriptor field encodes "where a variable is declared." `why` cites `9d9acf7a` so a future refactor does not re-introduce the scope bug by moving the declaration back inside a block. |
| AEH-IL-3 | Ledger-strand window finalize (P3) | `f32b1485` (2026-08-24, "P3 - strand-window finalize, skip_reason x3, measured envelope ceilings") | Introduces the `finalizeStrandedRun` window (`:41-59`, `:329-343`) and the explicit load-bearing-ordering comment (`:324-326`: *"fires AFTER the finalize UPDATE... do not move the throw up"*). | Live: the whole ledger-open/try/catch/finally shape (`:41-343`) is this commit's structure, unmodified since. | **ACCEPT: preserved-in-runner** — the entire ledger-open/window/finalize mechanism is Class L (`verdict_only`), retiring to the shared `scripts/lib/step/ledger.js`/`scripts/lib/step/index.js` path exactly as it did for `assert_schema`/`assert_global_coverage`/`assert_data_bounds` (§1.1 claim 12) — this holds regardless of the Ask 1 outcome, since `refresh-snapshot.descriptor.json` shows RECORDER retires its own ledger the same way. |
| AEH-IL-4 | Chain-aware, per-chain audit_table dispatch | `ab3dc8a1` (2026-03-21, "add permits-chain audit_tables to 3 CQA scripts") + later phase-number additions (`:291`'s `phaseMap`) | Introduces distinct named audit tables per chain (`inspAuditTable` Phase 6 for deep_scrapes, `coaAuditTable` Phase 9 for coa, a generic engine-summary row for permits/sources/standalone with a `phaseMap` lookup). | Live: `:200-295`, the `meta` builder's IIFE selecting exactly one audit_table by `CHAIN_ID` — confirmed matches plan §2 commit-2 scope note. | **ACCEPT: preserved-in-compute**, ONE `checks[].chains`-scoped group per audit family (mirrors the WSIB dual-injection shape `assert_data_bounds`'s own IL-4 already used, `step.schema.json` multi-chain array) — NOT 3 independent hand-rolled cascades; `deriveVerdict(rows)` replaces all 4 ternaries named in §1.2. |

### 3.2 Non-obvious constants found this session, not named by the executor brief

| # | Construct | Blame commit | Disposition — PROPOSED |
|---|---|---|---|
| AEH-IL-5 | `inspAuditTable`'s own separately-hardcoded `dead_tuple_pct >= 10` (FAIL) and `update_insert_ratio >= 5` (FAIL) (§1.1 claim 6) | Introduced alongside `ab3dc8a1`'s per-chain audit-table work; not independently blamed to a single later commit (measured: the two literals `10`/`5` are present since the Phase 6 table's creation) | **CHANGE-TO 2 logic vars**: `engine_health_insp_dead_tuple_fail_pct` (default 10) and `engine_health_insp_update_insert_fail_ratio` (default 5) — `why` must name the inconsistency with the top-level `PING_PONG_RATIO=10`/generic `DEAD_TUPLE_RATIO=0.10` this commit measured (§1.1 claim 6/9), not merely port the literal. Whether the FAIL severity itself survives conversion is downstream of the Ask 1 ruling (§2) — a RECORDER's checks are non-blocking by profile; an ASSERT's may not be. |
| AEH-IL-6 | `coaAuditTable`'s `dead_tuple_pct >= 10` uses **WARN**, not FAIL, for the identical predicate `inspAuditTable` scores FAIL (§1.1 claim 6) | Same origin as AEH-IL-5 | **CHANGE-TO the SAME logic var** as the generic `DEAD_TUPLE_RATIO`/AEH-IL-5's dead-tuple var, with its OWN severity (`WARN`) declared explicitly rather than silently inherited — the two per-chain tables must not silently drift further apart than they already have. Flagged, not resolved, here (adjudication is the operator's, per §7.1). |

---

## 4. PH-5 — Seam map (non-determinism inventory, G5)

**Risk class:** top-right churn×complexity quadrant (Fold A, `.cursor/c4_batching_entry_active_task.md` §3.2) — the chance of a latent defect if this step's Ask 1 archetype question is mis-resolved is HIGH (a genuinely hybrid write shape, no prior fleet precedent), the impact if wrong is MEDIUM (one Cross-Domain consumer, `src/lib/admin/funnel.ts`, no user-facing surface, telemetry-only table).

| Seam | Source | Notes |
|---|---|---|
| DB seam | `pool.query` ×N (pg_stat_user_tables scan, per-table stats, VACUUM ANALYZE loop, `engine_health_snapshots` upsert, `pipeline_runs` ledger) | Table SET is runtime-discovered (`:72-79`) — the golden-capture non-determinism inventory (commit ②'s own obligation) must declare that `tables_checked`/the `engine_health` array's row COUNT varies with the live catalog, not just row values. |
| Clock seam | `NOW()` (SQL, `pipeline_runs` INSERT), `CURRENT_DATE` (SQL, `engine_health_snapshots` key) | **Compliant** — no `new Date()` written to DB anywhere in the file (`grep -n "new Date("` → 0 hits); `Date.now()` used only for elapsed-ms (`:39`, `:195`), the CLAUDE.md-permitted use. |
| Network seam | none | No HTTP/external service in this file. |
| argv/env seam | `process.env.PIPELINE_CHAIN` (`CHAIN_ID`, `:27`) | The sole external input; controls which of the 4 branches (§1.2 items 2-4) is selected for `records_meta.audit_table` (`:278-293`) and whether the own-ledger INSERT fires (`:48`). |

---

## 5. PH-6 — Classification

### 4.1 CONTRACT (preserve as-is, structurally)
- The 4-check threshold engine (dead tuple / seq scan / ping-pong / min-rows floor) — the step's actual purpose.
- The dynamic table-discovery query (`:72-79`) — explicitly designed to need no hardcoded list; preserving this is itself AEH-IL's own subject for the VACUUM loop (§1.4/§4.2).
- The chain-aware audit-table dispatch (AEH-IL-4).
- The never-halts-on-threshold halt posture (§1.2) — already the CORRECT posture per the Spec 30 §5.4.1 lesson; preserving it is a feature, not a gap, regardless of the Ask 1 outcome.
- The `engine_health_snapshots` guarded upsert's 6-column `IS DISTINCT FROM` guard — genuinely well-formed, more disciplined than the RECORDER exemplar (§2.2 item 2).
- The per-table VACUUM ANALYZE try/catch isolation (`:147-153`) — one table's failure never aborts the others.
- The `engine_health_snapshots` write's own non-fatal catch (`:185-188`) — table-may-not-exist-yet tolerance, matches the deploy-ordering guard pattern `assert_data_bounds` uses for ravines/heritage/centreline (IL-10).

### 4.2 INCIDENTAL / DEFER (not this conversion's decision)
- The VACUUM-tail timing itself (§1.4, EP-D17 2026-09-10 DEFER) — stays exactly as-is, `deviations[]`-declared at commit ②, never hoisted or touched beyond the threshold-literal externalization.
- `execution.maintenance`'s schema fit (§1.1 claim 7) — same Ask-2-class deferral I2 already established for its own file's parallel gap.

### 4.3 DEFECT — new AEH-D ledger rows filed to `docs/reports/defect-ledger.md` at commit ③ (not written to that file this commit — it is generator-owned from Pilot 5 onward per its own header, and this step has no generator entry until conversion)

| ID | Anchor | One-line | Status | Closes at |
|---|---|---|---|---|
| AEH-D1 | `:346` `if (!lockResult.acquired) return;` | Lock contention → bare `return`, no step-level emit / `audit_table` — same class as `AS-D9`/`LR-D6`/(closed)/`ADB`'s own standalone-mode gap | OPEN · PIN | commit ② (library SKIP emit + `self_skipped` terminal, declared diff — same mechanism every converted sibling already received) |
| AEH-D2 | `:30-33` | 4 verdict-affecting threshold literals against Rule 3, none registered in `logic_variables` (§1.1 claim 5) — the HIGH `review_followups.md:3480` unblock this conversion IS the fix for | OPEN · PIN | commit ② (4 new `logic_variables` entries) |
| AEH-D3 | `:222-223`, `:255` | 2 MORE undeclared literals inside the per-chain audit tables (`dead_tuple_pct`/`update_insert_ratio` bounds), one of which (`update_insert_ratio >= 5`) silently disagrees with the top-level `PING_PONG_RATIO=10` for the same underlying metric, and one of which (`dead_tuple_pct`) carries **inconsistent severity** (FAIL in `inspAuditTable`, WARN in `coaAuditTable`) for the identical predicate — genuinely new this session, not in the plan | OPEN · PIN | commit ② (AEH-IL-5/6 adjudication — value AND severity, not just externalization) |
| AEH-D4 | `:118-124` vs. `docs/specs/01-pipeline/41_chain_permits.md:181` | Spec 41 declares dead-tuple-ratio breach as **FAIL**; the live generic check only ever `warnings.push(...)` — can never reach `errors[]`/the halt. Spec-vs-code severity drift, genuinely new this session | OPEN · PIN | commit ③ spec-diff (either the spec's FAIL claim is corrected to WARN, or the code is changed to match — an operator call, not silently resolved here) |
| AEH-D5 | `checks_passed: allMessages.length === 0 ? 'all' : undefined` (`:269`) | Never a count — same `AS-D7`/`ADB`-class gap every other pre-conversion CQA script in this fleet carries | OPEN · PIN | commit ② (declared diff, library counter shape) |

### 4.4 PH-3 tunables adjudication table (proposed, for commit ②)

| Constant | Current value | Proposed logic var | Default | Group |
|---|---|---|---|---|
| `DEAD_TUPLE_RATIO` | `0.10` | `engine_health_dead_tuple_ratio_warn_max` | 0.10 | Data Quality Thresholds |
| `SEQ_SCAN_RATIO` | `0.80` | `engine_health_seq_scan_ratio_warn_max` | 0.80 | Data Quality Thresholds |
| `SEQ_SCAN_MIN_ROWS` | `10000` | `engine_health_seq_scan_min_rows` | 10000 | Data Quality Thresholds |
| `PING_PONG_RATIO` | `10` | `engine_health_ping_pong_ratio_warn_max` | 10 | Data Quality Thresholds |
| (new, AEH-IL-5) `inspAuditTable` dead-tuple FAIL bound | `10` (%) | `engine_health_insp_dead_tuple_fail_pct` | 10 | Data Quality Thresholds |
| (new, AEH-IL-5) `inspAuditTable` update/insert FAIL bound | `5` (×) | `engine_health_insp_update_insert_fail_ratio` | 5 | Data Quality Thresholds |

Six vars total (the plan's "4" plus the 2 newly-measured per-audit-table literals, AEH-IL-5/AEH-D3) — a correction against the plan, recorded rather than silently absorbed.

---

## 6. Ask 2 — `execution.maintenance` shape (RE-CONFIRMED, not re-litigated)

Fold 1 item 2 (binding) already ruled: **keep the chain-tail VACUUM loop verbatim; mechanism = `deviations[]`**, citing Spec 43's "chain-tail VACUUM owner... remains OPEN — deliberately deferred" (`:142,150`) and the 2026-09-10 DEFER (`review_followups.md:3480`, §1.4 above). `grandfathered.json` is confirmed this session to be **write-discipline-only by charter** (`grandfathered.json:1-14`, "THE ENFORCER FOR `x-banned-for-new`") — it is not a home for a schema-fit deviation, matching Fold 1's own framing. **This commit makes no schema change and no `deviations[]` entry** (that is a descriptor field, commit ②'s artifact) — it re-confirms the ruling is still current against the live tree (nothing in Specs 30/40/41/43/47/48/49/79 has changed since 2026-09-10 to supersede it).

---

## 7. Citation drift (already filed, re-confirmed clean)

The plan's own §7 filed the "Spec 124 R-AA" mislabel as a MED followup; **this session confirms it is now CLOSED** — `122_pipeline_step_optimization.md:1177` reads *"Spec 124 R-PACE-1, corrected 2026-09-13"* (landed `62c35b65`, re-read this session), not R-AA. No new citation drift found for this file specifically.

---

## 8. Validator surface (declared, not yet scored — commit ② builds the descriptor invariant #23 scores against)

`step-validate --step=assert_engine_health` will score G0-G9 once the descriptor lands. Expected floor **≥14/17, G6-G8 full, hard-stop=false** (Spec 123 §6.2), same as every prior ASSERT/RECORDER conversion — contingent on the Ask 1 ruling landing first (the descriptor's `identity.archetype` value is not yet knowable).

---

## §R. Reflection (written this commit — `converted.json.pending[0].stage` = `red_suite`; commits ②/③ append their own addenda)

Every `it.fails()` claim in `src/tests/steps/assert_engine_health/violations.test.ts` is genuinely RED today, for the reason named in its own `// flips at: commit 2` comment — a full run of that file (plain `it` + fence locks + `it.fails`) is the proof, per the file's own header discipline (mirrors `assert_data_bounds`'s own I2 commit-6 precedent, §7.4 there).

**LOW-CONFIDENCE** — findings this commit could not fully resolve, carried forward with their own disposition rather than silently dropped:

| # | Finding | Why LOW-CONFIDENCE | Disposition |
|---|---|---|---|
| 1 | Whether Spec 41's declared FAIL severity for dead-tuple ratio (§1.1 claim 9, AEH-D4) should correct the SPEC or the CODE at commit ③ | This is a genuine product/operator call (does a dead-tuple breach deserve to halt the chain, or was the spec always aspirational text nobody wired?) — not a fact this session's measurement alone can settle | **Carried to commit ③'s spec-diff** — flagged, not resolved, here. |
| 2 | Whether the 2 newly-measured per-audit-table literals (AEH-IL-5/6, AEH-D3) should be UNIFIED into the same logic var as their top-level siblings, or stay genuinely distinct (the two audit tables may legitimately want different sensitivity for the same physical metric, given they scope different chains) | No spec text or prior fence settles this; it is a PH-3 adjudication (Spec 123 §7.1), not a discoverer's call | **Left PROPOSED in §3.2** — the operator's Spec 123 §7.1 adjudication decides at commit ②. |

**RECURRING/STANDARD-SHAPING** — findings this commit believes are likely to recur in a FUTURE step, feeding Spec 124 §4.6's promotion criterion:

| # | Finding | Where it is likely to recur | Disposition |
|---|---|---|---|
| 1 | **A step's own per-chain audit-table branches can carry undeclared literals that DIVERGE from the file's own top-level named constants for the conceptually same metric** (AEH-D3: `inspAuditTable`'s `update_insert_ratio >= 5` vs. the top-level `PING_PONG_RATIO = 10`) — the plan's own §0 measurement (row 5) named only the 4 top-level constants and missed these 2, because they are not declared at module scope | Any future ASSERT/RECORDER conversion whose file builds MULTIPLE per-chain audit tables with their own inline literal bounds (the same shape `assert_data_bounds` itself has across 4 tables) | Recommend PH-0's own boundary-freeze step explicitly grep for repeated-metric-name literal bounds ACROSS every audit-table builder in the file, not just the top-level `const` declarations, before declaring the threshold-literal count complete. |
| 2 | **A step whose master-classification archetype (Spec 122 §1.10's evidence-base table) is flagged as a hybrid in the spec's own prose (the `:647` footnote) genuinely cannot be resolved by "port, don't re-derive" alone** — this is the FIRST conversion in the fleet to hit that footnote directly | Any future step Spec 122 itself flags with a similar hybrid caveat (a full re-read of `:629-663` found none currently, but the pattern — a spec naming its own classification's limit — is durable) | Recommend the operator's ruling on THIS step's Ask 1 be written up as a named precedent in Spec 124's register (a new `R-` row) once it lands, so a future hybrid does not re-litigate the same evidence-gathering method from zero. |

---

## G0/G3/G5/G6 verdict, this commit

All boundary claims independently re-measured; two genuine NEW findings surfaced (§1.1 rows 6/9, filed AEH-D3/AEH-D4) that neither the plan nor the census anticipated. The archetype question is **measured and proposed, not resolved** — per the executor brief's own instruction, this is by design, not an omission. **G0/G3/G5/G6: PASS** for the boundary/ledger/seam/classification work this commit actually claims to do; the archetype ruling and the descriptor-dependent gates (G1′/G2′/G7/G8/G9) are explicitly OUT of this commit's scope, pending the operator.

---

## Validation scorecard (generated)

> Generated by `node scripts/analysis/step-validate.mjs --step=assert_engine_health --write` — Spec 123 §6, ruling R-R (2026-08-29).
> Regenerate with the same command; a stale block is a conformance-lock finding (`step-conformance.infra.test.ts`).

**Score: 13/17** · G9 Reflection: PASS · G4d fence-lock coverage: PASS · G-shape: PASS · **Hard stop: YES (G8, Rule 1 (unpinned enforced-red), Rule 5 (unpinned enforced-red), Rule 6 (unpinned enforced-red), Rule 7 (unpinned enforced-red), Rule 8 (unpinned enforced-red), Rule 9 (unpinned enforced-red), Rule 13 (unpinned enforced-red))**

| Gate | Score | Max | Detail |
|---|---:|---:|---|
| G0 | 1 | 1 | boundary-section=true spec-line=true |
| G1 | 1 | 1 | PH-3 section found=true sha-count=8 |
| G2 | 1 | 1 | 122-churn-complexity.md quadrant=top-right window=39313d9 |
| G3 | 1 | 2 | table rows=8 vocab-hit rows=4 |
| G4 | 2 | 2 | risk-class row with chance+impact found=true |
| G5 | 1 | 1 | db=true clock=true network=true argv/env=true |
| G6 | 3 | 3 | 5 ledger row(s), 0 without CLOSED/PIN () |
| G7 | 3 | 3 | file=true fences=0 it-count=29 RED-evidence=true |
| G8 | 0 | 3 | missing-invocations=5 missing-pre-invocations=5 stale-fingerprints=0 unexplained-diffs=0 |
| G9 (binary) | PASS | — | heading=true low-confidence-table=true recurring-table=true |
| G4d (fence<=lock) | PASS | — | fences=0 lock-it-count=29 |
| G-shape | PASS | — | file-clean=null compute-clean=null |

### Fast invariants (always run — the fast descriptor gate)

| # | Scope | Pass | Detail |
|---|---|---|---|
| 4 | (registry) | PASS | overlap: none |
| 5 | (registry) | PASS | clean (0 it.fails( call sites outside a declared pending slug) |
| 9 | (registry) | PASS | clean (0 converted slugs blocked by an unmet cutover_prereq item; blocks batching: 0) |
| 22 | (registry) | PASS | GOLD-PRE-FRESH: 47 PRE capture(s) across 11 converted step(s) all tracked + clean (git can restore every reference) |
| 23 | (registry) | PASS | COMPRESSED-FORM-ELIGIBLE: not applicable (0 pending slugs declare the compressed form) |

### Captures (item iv)
- missing invocations (POST): permits::, coa::, sources::, deep_scrapes::, none::
- missing invocations (PRE, GOLD-PRE): permits::, coa::, sources::, deep_scrapes::, none::
- stale fingerprints: none
- compare ran: false · diffs found: 0 · unexplained: 0

### Test suite (item iii)
- 999/1016 passed (suite success=false)

### Policy coverage matrix (item vi) — Spec 124 Rules 1-13

| Rule | Name | Status | Note |
|---|---|---|---|
| 1 | Nothing hidden | enforced-red | G-1 schema-baseline: schema-baseline clean |
| 2 | Compute is just compute | enforced-green |  |
| 3 | Tunables externalized | enforced-green | G-4: no descriptor |
| 4 | Compute rule declared | enforced-green | G-2: 2 preserved-in-compute row(s), 0 with no why/notes.json/checks[] grounding |
| 5 | checks >= 1 | enforced-red |  |
| 6 | Omission fails (20 categories) | enforced-red |  |
| 7 | Archetype gates categories | enforced-red |  |
| 8 | Per-target write discipline | enforced-red |  |
| 9 | Banned write needs ledger (+ V7 no_retraction) | enforced-red |  |
| 10 | Verdict row-derived | enforced-green | (a) OK — 11 corpus file(s) scanned, 0 unsanctioned second derivations, 2 sanctioned hit(s) matched SANCTIONED_VERDICT_SITES · (b) OK — SELF_SKIPPED audit table folds to verdict=WARN (!= PASS), row-derived off 1 non-INFO row(s) — VRD-SKIP closed |
| 11 | Phase-order re-derive (declared half, checkOrderGuaranteesCited) | enforced-green | no descriptor — G-3 completeness half stays open |
| 12 | Truthful crash posture (R-B reachability, static + R-M before-image) | enforced-green | R-B (checkInterruptedPostureTruthful): no descriptor · R-M: prose-only (R-M/LG-17 describe not scoped to this step (vitest not run, or no before-image target)) |
| 13 | A step validates itself | enforced-red | this run of step:validate IS the mechanism |
| P3 | I/O cost adjudication (measured, not gated) | measured | descriptor=0B notes=0B checks=0 rows records_meta=(no capture) |

**Enforced-green: 6/14**


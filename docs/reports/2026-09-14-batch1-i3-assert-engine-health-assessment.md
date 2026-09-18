# Batch 1 I3 Assessment — `assert_engine_health`

**Commit form: full nine-commit (R-PACE-1 ineligible — RECORDER has 1 converted member)**

**OPERATOR RULING 2026-09-14 (Ask 1, resolved): archetype = RECORDER.** Grounds, all measured this session (§2 below), cited not re-argued: the `engine_health_snapshots` guarded IS-DISTINCT-FROM upsert is a real write with no legal home under ASSERT (`step.schema.json:1718` forces `outputs: "none"`); no threshold breach in the file ever reaches the halt (§1.2); Spec 122 §1.10:647 already called it an AST+REC hybrid; the admin panel does NOT read `engine_health_snapshots` — it queries `pg_stat_user_tables` live in `src/app/api/quality/route.ts:109-162` with its own `detectEngineHealthIssues`, and the table's only readers are `assert_global_coverage`'s 25h heartbeat rows (Spec 49 :127/:158) and `src/lib/admin/funnel.ts:813-817`'s observability model. **Consequence:** `checkCompressedFormEligible` (`scripts/analysis/step-validate.mjs:482-503`) requires `archetypeConvertedCount >= 2` for the declared archetype; RECORDER has exactly **1** converted member (`refresh_snapshot`) — the compressed form is therefore INELIGIBLE for this step. This conversion reverts to the full Spec 123 §7 nine-commit form. Commit ① (this document + the red suite + `converted.json.pending` registration) stands unchanged as commits 1–4 + 6 of that nine-commit ledger (§2's table below is rewritten to the nine-commit shape); remaining work is commit 5 (PRE captures), commit 7 (descriptor + compute + frozen shell + POST captures), commit 8 (peels), commit 9 (cutover + spec diff).

**Plan:** `.cursor/batch1_i3_assert_engine_health_active_task.md` (AUTHORIZED 2026-09-13) — mirrors `.cursor/c4_batching_entry_active_task.md` §3.2 order 3, Execution Plan row **I3**. Fold 0 (orchestrator) confirmed the R-PACE-1 register row + `step-validate.mjs` invariant #23 + the Spec 123 §7 paragraph were ALL landed before this commit could open (`62c35b65`, verified this session — HEAD `2d28a3ce` is two commits past it); the Fold-0 precondition ("land R-PACE-1 before any compressed-form commit") is therefore already satisfied. That precondition is moot for THIS step now that Ask 1 has resolved to RECORDER (R-PACE-1 requires ≥2 converted members of the DECLARED archetype, and RECORDER has 1) — R-PACE-1 remains correctly landed and governs future RECORDER conversions once a second member exists.
**Governing procedure:** Spec 123 §7's full nine-commit form (R-PACE-1, `docs/specs/01-pipeline/124_step_standard_policy.md:211`, is INELIGIBLE for this step's ruled archetype — see the ruling banner above). This deliverable (commit ①, landed `6bf28e88`) maps onto nine-commit positions **1–4 + 6**: PH-0 boundary freeze, PH-3 intent ledger, PH-5 seam map, PH-6 classification (positions 1–4), plus the PH-7 red-first suite with `converted.json.pending` registration (position 6). Position 5 (golden PRE captures) is this session's Package B (below); positions 7–9 (descriptor+compute+frozen shell+POST captures, peels, cutover+spec-diff) remain open.
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

## 2. Archetype ruling — ASSERT vs. RECORDER (Ask 1) — **RESOLVED: RECORDER (operator ruling 2026-09-14)**

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

### **RULING — operator, 2026-09-14: RECORDER**

> `assert_engine_health` re-derives to **RECORDER** (structural fit for its genuine guarded-upsert write and its never-halts-on-threshold behavior; `engine_health_snapshots` becomes a declared `outputs.writes[]` entry; the 4+2 thresholds become RECORDER-shaped `checks[]`, all non-blocking) — **not** ASSERT-with-a-declared-exception. Grounds beyond §2.2's structural evidence, added by the ruling itself: the admin panel (`src/app/api/quality/route.ts:109-162`) computes engine health independently from `pg_stat_user_tables` with its own `detectEngineHealthIssues` and does NOT read `engine_health_snapshots` at all — the table has no dashboard consumer, only two observability-model readers (`assert_global_coverage`'s 25h heartbeat rows, Spec 49 :127/:158, and `src/lib/admin/funnel.ts:813-817`). This confirms the write is recording-shaped, not assertion-shaped: nothing downstream treats it as a live gate.
>
> **Consequence for R-PACE-1 eligibility, measured this session:** `template-freeze.json.archetype_profiles` shows **both** `ASSERT` and `RECORDER` as `proven: true`. `converted.json.converted[]` currently holds **3** ASSERT members (`assert_schema`, `assert_global_coverage`, `assert_data_bounds`) and **1** RECORDER member (`refresh_snapshot`). Per `checkCompressedFormEligible` (`scripts/analysis/step-validate.mjs:482-503`), the compressed form is eligible for ASSERT (`archetypeConvertedCount: 3 >= 2`) but **is ineligible for RECORDER today** (`archetypeConvertedCount: 1 < 2`). **Actioned this session**: the compressed-form marker is withdrawn (see the banner at the top of this document); this step's remaining commits (5/7/8/9) proceed under the full Spec 123 §7 nine-commit form.

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

All boundary claims independently re-measured; two genuine NEW findings surfaced (§1.1 rows 6/9, filed AEH-D3/AEH-D4) that neither the plan nor the census anticipated. The archetype question, measured and proposed at commit ①, is now **RESOLVED: RECORDER** (operator ruling 2026-09-14, §2 above) — R-PACE-1's compressed form is ineligible as a consequence (1 converted RECORDER member, floor is 2); this step proceeds under the full nine-commit form. **G0/G3/G5/G6: PASS** for the boundary/ledger/seam/classification work commit ① claims to do; the descriptor-dependent gates (G2′/G7/G8/G9) remain open for commits 7–9. Commit 5 (golden PRE captures, position 5 of the nine-commit form) is this session's Package B, below.

---

## 9. Commit 7 — descriptor + compute + frozen shell + POST differential (this session)

### 9.1 Archetype-vs-runtime finding, newly measured this commit (not anticipated by commits 1-6)

`identity.archetype: "RECORDER"` stands (operator ruling, §2 above) — but `execution.shape: "recorder"` (the runtime dispatch to `runRecorderPhase`, `scripts/lib/step/index.js:1971-2082`) does **not** fit this step. Measured this commit: `runRecorderPhase` executes exactly ONE write statement per run (`specs[0]`, one `compute.buildRow()`, one `compute.buildWriteSql()`, one `write.executeRecorderUpsert()` call with a single `RETURNING` row) — the shape `refresh_snapshot` (the exemplar) was built for. `assert_engine_health`'s real write is N rows (one per table `pg_stat_user_tables` discovers at runtime — measured 90 tables this session) plus a separate VACUUM ANALYZE maintenance loop over that same dynamic set — a shape `runRecorderPhase` cannot express without a runtime-library change (a RE-FREEZE decision: `step.schema.json` is frozen per Operating Boundaries, and Ask 1/Ask 2 already named schema-widening as out of this commit's authority).

**Resolution, disclosed rather than silently worked around:** `execution.shape` is left undeclared — the SAME pattern the three live ASSERT descriptors already use (`assert-data-bounds`/`assert-schema`/`assert-global-coverage`, all `execution.shape` absent, confirmed by direct inspection this session: `node -e "require(...).execution.shape"` → `undefined` for all three). `isIngestStep`/`isLinkStep`/…/`isRecorderStep`/`isEnrichStep` (`scripts/lib/step/index.js:242-402`) all require `execution.shape === '<name>'` verbatim; only `isIngestStep` keeps a legacy structural inference (gated on an external URL read this step has none of). An undeclared shape therefore matches none of them, and the runtime falls through to calling `runnable.compute(stepCtx)` directly — `stepCtx.pool`/`.report`/`.checks`/`.config` are constructed identically regardless of branch (`index.js:3182-3233`), confirmed by this session's own live runs (all 5 invocations, exit 0). `identity.archetype` (a classification fact) and `execution.shape` (a runtime-execution fact) are different schema axes; neither the red suite (§ "archetype is one of the two Ask-1 candidates") nor R-PACE-1's `archetypeConvertedCount` reads `execution.shape`. Declared as TWO `deviations[]` entries in the descriptor (the VACUUM-loop deviation already anticipated by Ask 2, plus this newly-measured shape deviation) — filed, not ratified as a general pattern; a future RECORDER with the same N-row shape will hit the identical wall and should cite this commit.

### 9.2 Severity resolution — AEH-D3 RESOLVED (not merely preserved)

The pre-conversion `inspAuditTable`'s `status:'FAIL'` text (dead_tuple_pct, update_insert_ratio) was measured in commit 1 (report §1.2) to be cosmetic only — no threshold in the file, including those two, ever reached the halt. Declaring a literal `severity:"FAIL"` on a `checks[]` entry is not cosmetic under the step standard: a FAIL verdict with no `accept_until` entry drives `RUN_STATUS.FAILED` (`index.js`'s terminal-selection `verdict === 'FAIL' && unaccepted.length > 0` branch) — a genuine halt this step has never had, verified this session by re-reading that branch. Porting the old label as a declared `severity:"FAIL"` would therefore be an undisclosed regression, not a verbatim port. All 8 declared checks are `severity:"WARN"`, `blocking:false` — this **resolves** AEH-D3 (both `insp_dead_tuple_pct` and `coa_dead_tuple_pct` now agree at WARN) rather than preserving the inconsistency, a deliberate call made this commit and reported as such (not deferred, since leaving the FAIL label as a literal `severity:"FAIL"` was not a safe option to defer). AEH-D3/AEH-D4's spec-vs-code severity questions (Spec 41's own declared FAIL text) remain carried to commit 9's spec-diff, per commit 1's own disposition.

### 9.3 Live verification — all 5 invocations, exit 0

`node --env-file=.env scripts/analysis/capture-step-golden.js --step=scripts/quality/assert-engine-health.js --chain=<permits|coa|sources|deep_scrapes|none>` — every invocation ran the CONVERTED descriptor+compute+shell end-to-end against the live local Docker DB and exited 0: `permits` verdict=WARN, `coa` verdict=WARN, `sources` verdict=WARN, `deep_scrapes` verdict=WARN, `standalone` verdict=WARN — all 5 WARN from the SAME genuine condition (`update_ping_pong_high`: `data_quality_snapshots` measured 15 updates / 1 insert = 15.0x, exceeding `engine_health_ping_pong_ratio_warn_max`=10). `engine_health_snapshots` table_state: 1269 rows captured every invocation (90 tables × up to 14 days of history in the local DB), `duplicate_snapshot_key_count` invariant = 0 in all 5.

### 9.4 AEH-D6 (NEW, this commit) — the permits/sources/standalone chain's own audit_table verdict never counted ping-pong pre-conversion; deep_scrapes/coa's per-chain tables never checked it either

Every one of the 5 `--compare` runs (pre/post) shows `audit_table.verdict`: `PASS` → `WARN`, for the SAME underlying condition (`data_quality_snapshots` 15.0x ping-pong) that the PRE capture's own `stdout_lines`/`summary.records_meta.warnings` ALREADY detected and displayed (`"WARN: data_quality_snapshots — update ping-pong 15.0x"` is present in the PRE capture's `stdout_lines` for every chain). Root cause, re-derived this session: the pre-conversion file's per-chain audit-table builders (`permitsEngineRows`/`inspAuditTable`/`coaAuditTable`) never included the ping-pong predicate at all — only the generic top-level `warnings[]` array (feeding `records_meta.warnings`, NOT `audit_table.verdict`) ever saw it. A human reading only `records_meta.audit_table.verdict` (the row-derived, canonical verdict signal per Rule 10) would therefore have read PASS for a chain that was, in fact, warning — a genuine pre-existing Nothing-Hidden gap, not a defect introduced by this conversion. The new unified `checks[]` design (Rule 10: one row-derived verdict from ALL declared checks, no per-chain parallel booleans) necessarily surfaces it. Filed AEH-D6: OPEN · PIN, disposition CLOSED-BY-CONVERSION (the new design structurally cannot reproduce the old gap — every declared check, `update_ping_pong_high` included, feeds the same verdict lattice for every chain).

| ID | Anchor | One-line | Status | Closes at |
|---|---|---|---|---|
| AEH-D6 | pre-conversion `:281-293` (`permitsEngineRows`), `:200-233`/`:235-266` (`inspAuditTable`/`coaAuditTable`) | The 3 per-chain audit-table builders never included the ping-pong predicate in their own verdict — only the generic `warnings[]`/console output saw it, so `audit_table.verdict` under-reported for every chain. Measured live: PRE capture stdout already shows the WARN text; PRE `audit_table.verdict`=PASS regardless. | CLOSED-BY-CONVERSION | commit 7 (this commit) — the new unified `checks[]`/row-derived verdict structurally includes it for every chain |

### 9.5 Full diff-category explanation (163 differences in the largest capture, deep_scrapes; every leaf/bucket-word below covers ALL 5 captures — G8 "every diff named")

| Category (deepest field / bucket word) | PRE | POST | Why (explained, not silently absorbed) |
|---|---|---|---|
| `invariants` (structural, `invariants[0]`) | absent | `{"name":"duplicate_snapshot_key_count","value":"0"}` | New declared `invariants[]` entry (§ descriptor) — 1 difference, purely additive. |
| `meta.reads.coa_applications` / `meta.reads.permit_inspections` | absent | `[]` | `inputs.reads.tables[]` now declares these two tables (Nothing Hidden — the pre-conversion `emitMeta` never declared them even though the file read them for its own audit tables). |
| `meta.reads.pg_stat_user_tables` (gains `last_autovacuum`) | 7 columns | 8 columns | `last_autovacuum` is read by `fetchInsUpdVac` (insp/coa follow-ups) — now declared, previously implicit. |
| `meta.writes.engine_health_snapshots` (reordered, drops `table_name`) | `[table_name, n_live_tup, ..., seq_ratio]` | `[n_live_tup, ..., seq_ratio]` | `table_name` is the write target's KEY (declared under `outputs.writes[0].key`, not `columns[]`) — same convention `refresh_snapshot`'s own `snapshot_date` key exclusion uses. |
| `stdout_lines` (structural, ~90-100 differences per capture) | per-table `console.log` dump (`"  OK: <table> — dead tuple ratio X%"` × ~90 lines) | structured `{"level":"INFO",...}` JSON log lines | Rule 2 (`compute-no-console` ast-grep rule) — narration moves to `ctx.log`, never a bare `console.*`. This single bucket accounts for the majority of each capture's raw difference count (permits 161 total, of which ~100 are `stdout_lines` rows alone). |
| `summary.records_meta.audit_table.name` | `"Engine Health"` / `"CoA Engine Health"` | `"Engine Health & Volume Volatility"` | `identity.display_name`, declared once, same for every chain (was per-chain-hardcoded text before). |
| `summary.records_meta.audit_table.phase` (standalone only) | `16` (the old `phaseMap[CHAIN_ID] \|\| 16` fallback) | `0` | `sharing.varies_by_chain.phase` declares no "standalone" key (matches `refresh_snapshot`'s own identical omission) — the generic library defaults an undeclared chain's phase to 0. An accepted, disclosed convention shared with the RECORDER exemplar, not a new gap. |
| `summary.records_meta.audit_table.rows[N].metric/source/status/threshold/value` | old ad-hoc names (`tables_checked`, `tables_vacuumed`, `high_dead_ratio_tables`, `high_seq_scan_tables`, `live_rows`, `dead_rows`, `dead_tuple_pct`, `update_insert_ratio`, `last_autovacuum`) | new declared check ids (`dead_tuple_ratio_high`, `seq_scan_ratio_high`, `update_ping_pong_high`, `engine_health_write_failed`, `engine_health_vacuum_failed`, `coa_dead_tuple_pct`, `insp_dead_tuple_pct`, `insp_update_insert_ratio`) + `duplicate_snapshot_key_count` (invariant) | One-to-one remapping to the Rule-10-compliant declared `checks[]`/`invariants[]` ids; `source:"check"`/`"invariant"` is new library-stamped provenance (Nothing Hidden). |
| `summary.records_meta.audit_table.verdict` | `PASS` | `WARN` | AEH-D6 above — a genuine pre-existing under-reporting gap, now closed by the row-derived design, not a regression. |
| `summary.records_meta.config` | absent | the 6 resolved `engine_health_*` values | Rule 3 — every threshold this run actually used is now visible in `records_meta.config` (Nothing Hidden), previously invisible module-scope constants. |
| `summary.records_meta.engine_health[N].{dead_ratio,idx_scan,n_dead_tup,n_live_tup,seq_scan,seq_ratio}` | one live snapshot | a later live snapshot | `pg_stat_user_tables` counters are cumulative/monotonic (`write_discipline.idempotent_rerun_why` in the descriptor) — PRE and POST were captured at genuinely different points in time on the SAME live local DB, so real drift on `seq_scan`/`idx_scan`/`n_live_tup`/`n_dead_tup` (and their derived ratios) between the two captures is expected, not a defect. Confirmed: every row that drifted is a table this session's own repeated invocations (5 POST runs plus the PRE run) themselves queried or wrote, which is exactly what a monotonic scan/tuple counter is expected to do. |
| `summary.records_meta.ledger_row` / `pool_errors` / `terminal` | absent | `"chain_owned"`/`"owned"`, `0`, `"recorded_with_warnings"` | Generic library fields (AEH-IL-3: the ledger mechanism retires to the shared library, matching every other converted step's identical addition). |
| `summary.records_meta.vacuumed_tables` | absent | `[]` (all 5 captures — no table exceeded the dead-tuple threshold in this capture session) | Commit 8 peel (R2): new declared field, table names actually vacuumed this run, alongside the pre-existing `tables_vacuumed` count. Empty in every capture because 0 tables crossed threshold — not a defect, just this session's live data; the array's shape is proven by the new `violations.test.ts` "landed at commit 8" tests (source-text assertion, since no live table crossed threshold to exercise a non-empty array). |
| `summary.records_meta.records_updated` (nested) | absent | `7`/`8` (varies by chain/time of capture) | New `records_meta` field feeding the declared `counters.records_updated` source path (§ descriptor `counters`). |
| `summary.records_meta.warnings[0]` (rendering format) | hand-formatted string (`"data_quality_snapshots: update/insert ratio 15.0x (15 upd vs 1 ins)"`) | `"<check_id>: <JSON detail>"` (`renderValue`, `scripts/lib/step/verdict.js`) | Generic library message rendering (LM-D16 precedent) — same information, machine-parseable shape, not a content loss. |
| `summary.records_updated` (top-level) | `2`/`5`/`6` (varies) | `7`/`8` (varies) | Same monotonic-drift reasoning as `engine_health[N]` above, plus the genuine fix below (`pipeline_runs.records_total`/`records_updated`). |
| `table_state` (structural, `table_state[0]`) | absent | `engine_health_snapshots` row-count + content hash | New capability: the descriptor's declared `outputs.writes[]` lets `capture-step-golden.js` hash the write target — impossible before the descriptor existed. Not comparable to a PRE baseline that never had one. |
| `pipeline_runs[0].error_message` (standalone only — the only chain with its own ledger row) | `"WARN: ..."` (the old code conflated a WARN message into the ERROR column) | `null` | Genuine fix: `error_message` now reserved for real errors; warnings live in `records_meta.warnings`/`audit_table` rows only (Nothing Hidden — the two concepts were previously conflated in one column). |
| `pipeline_runs[0].records_total/records_new/records_updated` (standalone only) | `0`/`0`/`0` (the old ledger UPDATE never set these columns at all) | `90`/`null`/`7` | Genuine fix: the old file's own `UPDATE pipeline_runs SET completed_at=..., status=..., duration_ms=..., error_message=..., records_meta=...` never touched `records_total`/`records_new`/`records_updated` — the generic library's `deriveCounters` (sourced from `records_meta.tables_checked`/`records_meta.records_updated`, per the descriptor's declared `counters`) now stamps real values. |
| `pipeline_runs[0].status` (standalone only) | `"completed"` | `"completed_with_warnings"` | Genuine fix, same root cause as AEH-D6 — the old binary `failed`/`completed` status vocabulary (report §1.2) never expressed a WARN-only run; the generic library's Spec 120 §3.2b-conformant status vocabulary does. |

**Structural (array-shaped, no field name of their own) diff-count breakdown, all 5 captures:** the deep_scrapes capture's own 163 differences break down as roughly 97 differences in `stdout_lines` (the per-table console.log-to-structured-JSON-log rendering change, §9.5 above), 1 difference in `invariants` (the new `duplicate_snapshot_key_count` entry), 1 difference in `table_state` (the new write-target hash, impossible before the descriptor existed), and 3 differences in `rows` (new `audit_table.rows[]` entries for the 2 new declared checks plus 1 new invariant row) — the permits/coa/sources/standalone captures show the identical 4 structural buckets at slightly different counts (fewer per-chain checks means fewer `rows` differences on permits/sources/standalone; standalone additionally shows its own `pipeline_runs[0].*` differences, §9.5's dedicated rows above). Every one of these 4 structural buckets, and every named-field diff in the §9.5 table above, is explained.

**Compare summary (5/5):** exit 0 all invocations; verdict WARN all 5 (same genuine `update_ping_pong_high` condition, pre-existing, now correctly surfaced per AEH-D6); `engine_health_snapshots` row count 1269 stable across all 5 (same live table, captured within the same session); 0 diffs left unexplained by the table above.

---

## 9.6 Commit 8 — output-panel peel (R1/R2/R3)

Output panel on commit 7: Guardian PASS ×5; Code Reviewer 2 FAIL (R1, R2); Observability 2 findings (R3 + the fleet `on_check_error` item, filed not built).

**R1 (Spec 124 Rule 3, bare literal):** `scripts/lib/compute/assert-engine-health.js:140`'s `live >= 1000` dead-tuple-check floor was a bare literal — externalized as a 7th logic variable, `engine_health_dead_tuple_min_rows` (default 1000, byte-identical; min 0/max 100000000, matching the sibling `engine_health_seq_scan_min_rows` bound shape; `on_invalid:"fail"`). Registered in the descriptor's `config.logic_variables`, seeded in `scripts/seeds/logic_variables.json`, applied locally (`node --env-file=.env scripts/seeds/apply-logic-variables.js` — 1/496 inserted, 495 already existed, values preserved), `scripts/generate-logic-variable-groups.mjs` GROUP_ORDER updated (the generator throws on an un-pinned group label — genuinely caught a missing-pin defect, not cosmetic) and regenerated (29 groups, 497 keys), `docs/reference/logic-variables-registry.md` regenerated (515 vars). Fleet tests bumped: `control-panel.logic.test.ts` `EXPECTED_LOGIC_VAR_KEYS` (+1), `violations.test.ts` (both the "6 tunables" seed-default test and the commit-7 `config.logic_variables` test, +1 each). `write-class-disposition.infra.test.ts` does not count logic vars (only descriptor `self_skip` declarations) — unaffected, confirmed by re-grep.

**Remaining numeric literals in the compute, swept exhaustively this commit:** `Math.round(x * 10000) / 10000` (`:132,:135`) and `Math.round(x * 10000) / 100` / `Math.round(x * 100) / 100` (`:361,:378` pre-peel line numbers) are display-precision/percentage unit conversions, not verdict thresholds — not tunables. `parseInt(v, 10)` radices — not tunables. `t.n_live_tup > 0` (VACUUM-target filter) and `ins > 0` (ping-pong guard) are div-by-zero/empty-table guards, not verdict bounds — not tunables. No other bare numeric literal affects a verdict or a write.

**R2 (Spec 48 §3.6, lost telemetry):** the pre-conversion file logged `VACUUM ANALYZE <table> — done (was X% dead)` per successful vacuum (`git show 9abbdcc3^:scripts/quality/assert-engine-health.js:150`); the port dropped it. Restored: `ctx.log.info(TAG, ...)` with the identical message shape per successful vacuum, plus a new `records_meta.vacuumed_tables: string[]` (table names actually vacuumed this run) alongside the existing `tables_vacuumed` count. The descriptor's `terminals[].records_meta` shapes are loose type-only stubs (`"object"`/`"string"`), not an exhaustive key enumeration — no schema-contract update needed; `limitations[]`/`emits` unaffected.

**R3 (Observability F5, `deviations[]` visibility):** no fleet tooling built (out of this peel's scope per the executor brief). Instead: the undeclared-`execution.shape` fact is now ALSO stated in the descriptor's `limitations[]` (previously `deviations[]`-only), matching where the registry/`step-validate --write` already render it. MED followup filed (`review_followups.md`, "Batch 1 I3 assert_engine_health, commit 8" section): step-validate's scorecard should print every `deviations[]` id per converted slug, fleet-wide, own WF2.

**Also filed (not fixed here):** HIGH fleet-wide — `execution.on_check_error:"fail_step"` is caught by the step's own try/catch and downgraded to the check's declared severity by `verdict.js`'s `checkRow`, so the enum value currently means nothing operationally (own WF3). LOW — `engine_health_snapshots.captured_at` not refreshed for an unchanged row (by design; noted for a future freshness consumer). LOW — `funnel.ts:816` mutation bounds `[10,15]` stale against ~90 tables (pre-existing).

**R-C recapture (source_fingerprint changed by the compute edit):** all 5 POST goldens re-captured against the local Docker DB, `--compare` against the committed PRE captures, `step-validate --step=assert_engine_health --write`, `step-validate --all --fast`, `npm run typecheck`, `npm run lint`, and the named vitest suites — results below.

---

## Validation scorecard (generated)

> Generated by `node scripts/analysis/step-validate.mjs --step=assert_engine_health --write` — Spec 123 §6, ruling R-R (2026-08-29).
> Regenerate with the same command; a stale block is a conformance-lock finding (`step-conformance.infra.test.ts`).

**Score: 16/17** · G9 Reflection: PASS · G4d fence-lock coverage: PASS · G-shape: PASS · **Hard stop: no**

| Gate | Score | Max | Detail |
|---|---:|---:|---|
| G0 | 1 | 1 | boundary-section=true spec-line=true |
| G1 | 1 | 1 | PH-3 section found=true sha-count=8 |
| G2 | 1 | 1 | 122-churn-complexity.md quadrant=top-right window=39313d9 |
| G3 | 1 | 2 | table rows=8 vocab-hit rows=4 |
| G4 | 2 | 2 | risk-class row with chance+impact found=true |
| G5 | 1 | 1 | db=true clock=true network=true argv/env=true |
| G6 | 3 | 3 | 6 ledger row(s), 0 without CLOSED/PIN () |
| G7 | 3 | 3 | file=true fences=0 it-count=33 RED-evidence=true |
| G8 | 3 | 3 | missing-invocations=0 missing-pre-invocations=0 stale-fingerprints=0 unexplained-diffs=0 |
| G9 (binary) | PASS | — | heading=true low-confidence-table=true recurring-table=true |
| G4d (fence<=lock) | PASS | — | fences=0 lock-it-count=33 |
| G-shape | PASS | — | file-clean=true compute-clean=true |

### Fast invariants (always run — the fast descriptor gate)

| # | Scope | Pass | Detail |
|---|---|---|---|
| 1 | assert_engine_health | PASS | min_migration=48 <= migrations count=244 |
| 2 | assert_engine_health | PASS | 7 declared, missing from seeds: none |
| 3 | assert_engine_health | PASS | retired=0 overlap-with-declared=none |
| 7 | assert_engine_health | PASS | SPEC LINK header present=true |
| 8 | assert_engine_health | PASS | G-4: 7 declared, 2 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover |
| 20 | assert_engine_health | PASS | HB-1: execution.shape=null — HB-1 applies_when execution.shape=="enrich" only (RS-D-STA); not applicable, never a pass-by-omission |
| 21 | assert_engine_health | PASS | CEIL-1: execution.shape=null — CEIL-1 applies_when execution.shape=="enrich" only (RS-D-STA); not applicable, never a pass-by-omission |
| 4 | (registry) | PASS | overlap: none |
| 5 | (registry) | PASS | clean (0 it.fails( call sites outside a declared pending slug) |
| 9 | (registry) | PASS | clean (0 converted slugs blocked by an unmet cutover_prereq item; blocks batching: 0) |
| 22 | (registry) | PASS | GOLD-PRE-FRESH: 58 PRE capture(s) across 14 converted step(s) all tracked + clean (git can restore every reference) |
| 23 | (registry) | PASS | COMPRESSED-FORM-ELIGIBLE: not applicable (0 pending slugs declare the compressed form) |
| 24 | (registry) | PASS | COMPRESSED-FORM-DEFAULT: not applicable (0 pending slugs whose archetype is eligible) |
| 25 | (registry) | PASS | ARCHETYPE-PARITY: 14 converted slug(s) — 6 compared against a retained census row (all agree), 8 with no retained row (census arm n/a, pre-R-AO cutovers); every archetype has a declared freeze profile |
| 26 | (registry) | PASS | COUNTER-ROOT: 32 declared counter source(s) across 11 descriptor(s) all root in their own shape's counterScope (+ records_meta) |

### Captures (item iv)
- missing invocations (POST): none
- missing invocations (PRE, GOLD-PRE): none
- stale fingerprints: none
- compare ran: true · diffs found: 874 · unexplained: 0

### Test suite (item iii)
- 1158/1164 passed (suite success=false)
- harvested: 19 file(s) from 3 FLEET-WIDE targets (src/tests/step-conformance.infra.test.ts, src/tests/golden-fingerprint.infra.test.ts, src/tests/steps/) — one spawn per run, so every step's report carries this same number, by design
- excluded (R-AG live-DB tier, owned by `npm run test:db`, derived from package.json `scripts.test`): 5 — src/tests/steps/link_massing/metamorphic.test.ts, src/tests/steps/link_massing/nearest-determinism.test.ts, src/tests/steps/link_massing/rung1-inline-wkt.test.ts, src/tests/steps/link_parcel_addresses/metamorphic.test.ts, src/tests/steps/link_parcel_addresses/rung1-inline-wkt.test.ts
- skipped (declared but not run): 0
- failing (6):
  - src/tests/golden-fingerprint.infra.test.ts > golden-fingerprint — the golden capture is a LOCKFILE (ruling R-C, 2026-08-28) > scripts/refresh-snapshot.js (slug "refresh_snapshot") > every post/ capture carries source_fingerprint === the CURRENT fingerprint over (step, descriptor, notes, compute)
  - src/tests/step-conformance.infra.test.ts > §1.2a P4 — every tunable is externalized (declared ≡ registry ≡ GROUPS ≡ ctx.config) > scripts/refresh-snapshot.js — declared ⊆ registry, declared ⊆ GROUPS, consumed ≡ declared
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/link-parcel-addresses.js (slug "link_parcel_addresses") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/step-conformance.infra.test.ts > R-R / Rule 13 — the generated scorecard block is not stale (vitest-independent sections) > scripts/refresh-snapshot.js (slug "refresh_snapshot") > the committed block's vitest-independent sections equal a fresh `step:validate --fast` run
  - src/tests/steps/assert_schema/violations.test.ts > RULING R-D — declared_logic_variables_present (cloud parity, chain-start assertion) > checks[].expect ≡ config.probe_presence ≡ the LIVE fleet derivation — none of the three may drift from the others
  - src/tests/steps/assert_schema/violations.test.ts > R-D generator — scripts/generate-assert-schema-probe-lists.js (Ask A1) > real file — applyToText(committed text, LIVE names) is a byte-for-byte no-op (the descriptor is clean, not stale)

### Policy coverage matrix (item vi) — Spec 124 Rules 1-13

| Rule | Name | Status | Note |
|---|---|---|---|
| 1 | Nothing hidden | enforced-green | G-1 schema-baseline: schema-baseline clean |
| 2 | Compute is just compute | enforced-green |  |
| 3 | Tunables externalized | enforced-green | G-4: 7 declared, 2 verdict-affecting, 0 violate on_invalid:fail with no deviations[] cover |
| 4 | Compute rule declared | enforced-green | G-2: 2 preserved-in-compute row(s), 0 with no why/notes.json/checks[] grounding |
| 5 | checks >= 1 | enforced-green |  |
| 6 | Omission fails (20 categories) | enforced-green |  |
| 7 | Archetype gates categories | enforced-green |  |
| 8 | Per-target write discipline | enforced-green |  |
| 9 | Banned write needs ledger (+ V7 no_retraction) | enforced-green |  |
| 10 | Verdict row-derived | enforced-green | (a) OK — 11 corpus file(s) scanned, 0 unsanctioned second derivations, 2 sanctioned hit(s) matched SANCTIONED_VERDICT_SITES · (b) OK — SELF_SKIPPED audit table folds to verdict=WARN (!= PASS), row-derived off 1 non-INFO row(s) — VRD-SKIP closed |
| 11 | Phase-order re-derive (declared half, checkOrderGuaranteesCited) | enforced-green | no when:"pre_write" checks — vacuously nothing to cite — G-3 completeness half stays open |
| 12 | Truthful crash posture (R-B reachability, static + R-M before-image) | enforced-green | R-B (checkInterruptedPostureTruthful): recovery.interrupted="none" — no reachability claim to verify · R-M: prose-only (R-M/LG-17 describe not scoped to this step (vitest not run, or no before-image target)) |
| 13 | A step validates itself | enforced-green | this run of step:validate IS the mechanism |
| P3 | I/O cost adjudication (measured, not gated) | measured | descriptor=26614B notes=0B checks=8 rows records_meta=13206B (newest post/ capture) |

**Enforced-green: 13/14**


# C6-2 — `classify_permit_phase` (scripts/classify-permit-phase.js) conversion assessment, commit ① (W2 of the V3-CoA path)

**Target standard:** McDonald's Airtight V3 (Spec 124 R-DF): zero purity findings with no ledger allowance (`Spec 132 §core.9 (R-BZ)`), every gate hard from ① (`Spec 132 §x-v3.1 (R-BA)`), the seven admission questions including EXTERNALIZED (`Spec 132 §core.8 (R-CV)`), and admin visibility (`Spec 132 §core.16 (R-DL)`).
**Archetype:** ENRICHER (census row, re-derived at PH-0 per `Spec 132 §core.4 (R-AO)`, §1.7). One guarded set-based UPDATE derives `permits.enriched_status = 'Examination'` on rows the permits loader owns; in the same UPDATE it bumps `permits.last_seen_at` (census finding F1).
**Commit form: compressed (R-PACE-1)** (`Spec 132 §x-tooling.2 (R-PACE-1)`). Commit ① is this report plus the red suite. Commit ② adds the descriptor, compute, notes and the seeds migration. Commit ③ is the cutover. ENRICHER has six converted members (compute_parcel_cost_estimates, enrich_centreline, enrich_heritage, enrich_ravines, geocode_permits, enrich_parcels; measured from the census and `converted.json`), so compressed is the default (#24).
**Frozen legacy oracle:** `src/tests/steps/classify_permit_phase/fixtures/legacy-classify-permit-phase.js.txt`, byte-identical to `scripts/classify-permit-phase.js` (120 lines, sha256 `f952f0cb47a905e1…`), last changed by `50837ef4` (2026-08-13, a header comment).
**Owner specs:** 41 (`41_chain_permits.md`, the target: SPEC LINK header `:25`, system-map row 48) and 80 (`80_taxonomies.md`, system-map row 79). Spec 42 (`:305`) mentions the step only as a comparison.
**Target spec:** Spec 41 (`identity.spec` "41"). **Governing specs:** 122 (step library), 124 / 124a (policy register), read through the generated handbook Spec 132.
**Chain:** `permits` position 4 of 32 (after close_stale_permits, before classify_scope) — `scripts/manifest.json` chains, measured 2026-10-23. It is in no other chain.
**Plan:** `~/Buildo-scratch/v3coa/PERMITS-MAP.md` §4 wave W2 (verified by `PERMITS-MAP-VERIFY.md`); `.cursor/v3-c6-plan-2026-10-19.md` wave C6-2; rulings CHAT-97.CLP-Q2-B2 (B′) and CHAT-98.P-Q1 (the close_stale_permits fold at the permits ② / swap), on `wf1/rulings-rec3` (b733b0e0, 5a120cca), not yet on this base.
**Provenance.** Everything below was read from the tree at `d6dc90d2` by this lane unless marked *documented* (copied from a cited source, not re-measured) or *inferred*. This lane had **no database access**; every live-table number is a capture need (§9).

---

## 1. PH-0 — Boundary freeze (G0)

### 1.1 Write class and transactions
- **Advisory lock 89 first** (`:30`, `:33`; Spec 47 §A.5 registry row 89, `47_pipeline_script_protocol.md:1937`, "Writes Timestamps? YES — `last_seen_at`"), then `getDbTimestamp` RUN_AT (`:34`) (pinned L1).
- **Eligible count on the pool** (`:42-48`): `status = 'Inspection' AND revision_num = '00' AND (issued_date IS NULL OR issued_date < '1970-01-02')`.
- **One transaction, one statement** (`:52-65`): `UPDATE permits SET enriched_status = 'Examination', last_seen_at = $1 (RUN_AT) WHERE <the eligible scope> AND enriched_status IS DISTINCT FROM 'Examination' RETURNING permit_num` (pinned L2). The guard is `enriched_status` alone, so `last_seen_at` moves only on rows whose `enriched_status` changes, and a rerun writes zero rows (pinned L4 at the statement level; the live proof is the rerun capture).
- **Cumulative stats on the pool** (`:70-77`), after the COMMIT, with a different scope: every base-revision 'Inspection' permit, with no issued_date clause (pinned L3).
- **No reverse arm.** Nothing in the step clears 'Examination' (pinned L5). The other half of the contract lives in the four `permits.status` writers, which clear `enriched_status` when the status moves off 'Inspection' (C7; `load-permits.js:357-363`, `close-stale-permits.js:129`, `:148`, `src/lib/sync/process.ts`; header `:10-18`).

### 1.2 Columns written
- **`permits`:** `enriched_status` ('Examination' only) and `last_seen_at` (RUN_AT), on the same rows.

### 1.3 Audit rows, verdict and `records_meta`
- **One audit table "Permit Phase Classification", phase 4, four INFO rows** in a fixed order: `examination_classified`, `total_examination`, `total_inspection`, `examination_rate` (a string such as `'25.0%'`) (`:90-95`, pinned L7). The verdict is the literal `'PASS'` (`:109`, pinned L8).
- **Summary:** `records_total` = the eligible pool, `records_new` = 0, `records_updated` = the RETURNING row count (`:97-100`, pinned L6). The intent of the pool-sized total is recorded in f2724308 ("records_total now reflects eligible pool").
- **emitMeta** (`:114-117`): reads `permits.{status, revision_num, issued_date, enriched_status, last_seen_at}`, writes `permits.{enriched_status, last_seen_at}` (pinned L11; gaps in CPP-D4).
- **Exit lanes:** a contended lock returns with no SQL, summary or meta (`:119`, pinned L12); an unparseable count throws before any write; a stats failure throws after the UPDATE committed (pinned L10).

### 1.4 Live table facts — NOT MEASURED by this lane (no DB access)
- *Documented (header `:5-7`, c6bf9f1d):* about 13,764 permits were 'Inspection' with no issued_date when the step was written (2026-03-28).
- *Documented (`migrations/227_rls_class_b_default_deny.sql:75`):* RLS is enabled on `permits`.
- Every other number (current eligible pool, Examination count, rows changed per run, how many bumps the loader had not already made) is a capture need (§9, M1–M3).

### 1.5 Consumers (code, read at `d6dc90d2`; same-chain readers from the lineage snapshot via `scripts/lib/ledger.js` `effectiveLedger()`, script `~/Buildo-scratch/cpp1/ups.cjs`)
- **`permits.enriched_status`:** classify_lifecycle_phase (reads it only for `'Stalled'`, `scripts/lib/lifecycle-phase.js:398`, so 'Examination' never changes a phase), assert_lifecycle_phase_distribution (cross-checks only 'stalled' / 'active inspection' / 'permit issued', `scripts/quality/assert-lifecycle-phase-distribution.js:665-717`), assert_global_coverage (`p_step4_enriched_status`, `scripts/lib/assert-global-coverage-fields.js:280`), the admin lead inspector (`src/lib/leads/lead-inspect-query.ts:118`) and the sync tool (`src/lib/sync/process.ts`).
- **`permits.last_seen_at`** (as written by this step): close_stale_permits, classify_scope, classify_permits, classify_lifecycle_phase, refresh_snapshot (CONVERTED; its descriptor already lists `classify_permit_phase` in `inputs.reads.steps`), assert_data_bounds, assert_entity_tracing, assert_global_coverage, the admin inspector.
- *Note (raw status, not this column):* `refresh-snapshot.js` and `src/lib/quality/metrics.ts` count `status = 'Examination'` as active (c6bf9f1d); they read `status`, which this step never writes.

### 1.6 Admin visibility (R-DL)
- **Registered today:** `PIPELINE_REGISTRY` (`src/components/FreshnessTimeline.tsx:33`), `STEP_DESCRIPTIONS` (`src/lib/admin/funnel.ts:656`, accurate).
- **Gap (CPP-D8):** no `PIPELINE_TABLE_MAP` entry (`funnel.ts:872` block). Under R-DV the descriptor-derived arms wait; D9 flips at ③.

### 1.7 Archetype re-derivation (R-AO)
The census row (ENRICHER, 2026-10-19) holds: the step derives a column on rows another step (the permits loader) produces, in one scoped, guarded set-based pass. The runner precedent is **geocode_permits** (ENRICHER on `permits`, `set_based_join_update`, `guard: is_distinct_from` with an explicit `guard_columns` list that leaves its `source:"run_at"` stamp out of the guard, `rls_bypass_or_policy` on permits; `scripts/geocode-permits.descriptor.json`). No new runner arm is needed (§14).

---

## 2. Behaviour ledger (what the conversion must reproduce)
The red suite pins these as L1–L13 (§10). Each one executes the frozen text. Defects are pinned in their **legacy** form, so ② changes them knowingly and the differential names them.

## 3. Registry target review
- **(a) Files:** `scripts/classify-permit-phase.js` becomes the frozen shell. Added at ②: `scripts/classify-permit-phase.descriptor.json`, `scripts/classify-permit-phase.notes.json`, `scripts/lib/compute/classify-permit-phase.js`, and the seeds migration for the `classify_permit_phase_*` variable(s).
- **(b) Tables:** reads and writes `permits` only.
- **(c) Consumers:** §1.5.
- **(d) Tests:** `src/tests/steps/classify_permit_phase/violations.test.ts` (this commit). Existing tests that name the script, swept at ②: `src/tests/inspections.logic.test.ts:1070-1100` (source-text SQL assertions), `src/tests/pipeline-advisory-lock.infra.test.ts:123` (lock 89 registry), `src/tests/db/enriched-status-invalidation.db.test.ts` (the C7 fence, live DB).

## 4. PH-3 — Intent ledger
Each intent is traced to the commit that introduced it (`git log --follow` and `git log -S` over the script, run 2026-10-23).

| Intent | Source | Disposition at ② |
|---|---|---|
| 'Inspection' permits with no issued_date are in examination, not construction inspection | `:3-8`, `:50-51` (`c6bf9f1d`) | preserved-in-compute (the scope predicate; why in notes.json) |
| Write `enriched_status`, never the raw loader-owned `status`, so the loader upsert does not thrash | `:10-18` (`f2724308`, C7 `50837ef4`) | encoded-as-descriptor-field (the only derived column is `enriched_status`; the C7 half stays in the status writers) |
| IS DISTINCT FROM guard: skip already-classified permits | `:60` (`f2724308`) | encoded-as-descriptor-field (`guard: is_distinct_from`, `guard_columns: ["enriched_status"]`) |
| Base revision only: sub-revisions inherit lifecycle state | `:20-21`, `:45`, `:58` (`3a074eea`) | preserved-in-compute (scope; why in notes.json) |
| Epoch default dates (1970-01-01) from bad municipal ETL count as "no issued date" | `:41`, `:46`, `:59` (`3a074eea`) | preserved-in-compute (why in notes.json), the cutoff a pinned variable (CPP-D3) |
| Stats denominator scoped to base-revision 'Inspection' to avoid dilution | `:68-77` (`3a074eea`) | encoded-as-descriptor-field (the check's declared reads) |
| `records_total` = the eligible pool, not only changed rows | `:37-40`, `:98` (`f2724308`) | encoded-as-descriptor-field (a declared INFO check carries the pool; runner counters carry the writes) |
| `last_seen_at` bump "for CDC consistency" | `:56` (`3a074eea`; `NOW()` → RUN_AT in `c87bbbaf`) | **card CPP-Q1**: encoded-as-deviation (the CHAT-93.Q-H1 form), or knowingly-retired after the N-A measurement |
| One run at a time; lock 89 (Spec 47 §A.5 registry) | `:30` (`c87bbbaf`) | encoded-as-descriptor-field (`identity.lock` 89, unique — measured) |
| The mutation runs inside a transaction (Spec 47 R9) | `:52` (`c9105b87`) | encoded-as-descriptor-field (runner step transaction) |
| safe-math count parsing | `:48`, `:78-79` (`90e3d0f8`) | knowingly-retired (the mechanism is gone: runner-owned counters, no driver string parsing in compute) |

## 5. PH-5 — Seam map
| Seam | Legacy effect | `file:line` | V3 seam |
|---|---|---|---|
| clock seam | `getDbTimestamp` RUN_AT | `:34` | runner run clock |
| clock seam | `Date.now()` for `duration_ms` | `:35`, `:82` | runner timing |
| db seam | advisory lock 89 | `:33` | `identity.lock` 89 |
| db seam | `withTransaction` around the UPDATE | `:52` | runner step transaction |
| db seam | the guarded UPDATE | `:53-63` | runner write seam (`set_based_join_update` precedent); compute authors the statement only |
| db seam | eligible count and stats on the pool | `:42-47`, `:70-77` | declared `checks[].reads` |
| argv/env seam | none (pinned L12) | — | `override.dry_run: "none"` (agrees with the manifest, `supports_dry_run: false`) |
| network seam | none | — | none |

### 5.1 Risk class
| Risk | Chance | Impact | Mitigation |
|---|---|---|---|
| The `last_seen_at` bump makes a classification time read as "seen in the feed" | certain on every changed row (pinned L2) | low today: close_stale_permits compares with this run's load start, so a previous run's bump never rescues a row in sequential runs (`PERMITS-MAP-VERIFY.md` claim 3, inferred); after the fold, R-EN condition (2) stops the closer reading `last_seen_at` at all | CPP-Q1; measure M3 first |
| Swap order: the swap needs permits (with the fold) at `runner_wired` | certain under #44 (e) + #54 strict (Q-R-EQ-1) | blocks W2 until W1 | W2 follows W1, or shares its commit with both POSTs present (`PERMITS-MAP.md` §4) |
| Retiring the bump moves a converted step's fingerprint | certain if retired | medium: refresh_snapshot's `inputs.reads.steps` lists this step (#44 (e) `e:extra` once the edge goes) | retirement rides a RE-FREEZE / recapture night (`Spec 132 §x-v3.2 (R-II)`); the declared-deviation reading avoids it |
| Stale 'Examination' after issuance while the feed status stays 'Inspection' | unknown (inferred, CPP-D6) | low: no lifecycle reader acts on 'Examination' (§1.5) | M2 before any change; pinned L5 |

## 6. PH-6 — Classification and defect ledger (rows CPP-D1…CPP-D9 in `docs/reports/defect-ledger.md`; prefix CPP, the default initials, unique across every manifest slug — measured with `defectPrefixFor`)

PH-2 (churn × complexity): ASSESSMENT-INCOMPLETE because `docs/reports/generated/122-churn-complexity.md` covers only the sources chain; no hand-plotted quadrant is substituted.

The rows are defined once, in `docs/reports/defect-ledger.md`; this is the assessment-side summary.
- **CPP-D1** (`:54-56`, `:115-116`): the `last_seen_at` bump (F1); the step writes the loader's seen column — CPP-Q1.
- **CPP-D2** (`:90-111`): four unbounded INFO rows and a literal 'PASS' verdict; no run can WARN or FAIL — ② declared checks, runner verdict.
- **CPP-D3** (`:30`, `:45-46`, `:58-59`, `:76`): the epoch cutoff, the base revision, the status words and the lock are literals — ② one pinned variable, vocabulary in notes, `identity.lock`.
- **CPP-D4** (`:114-117`): declared reads list `last_seen_at` (never read) and omit `permit_num` (RETURNING) — ② `inputs.reads` traced by #44.
- **CPP-D5** (`:35`, `:42-82`): three statements, three snapshots; a stats failure after COMMIT; the process clock — ② runner transaction, counters and clock.
- **CPP-D6** (`:54-60`; `load-permits.js:357-363`): no reverse arm, so 'Examination' can outlive a real issued date while the status stays 'Inspection' (inferred) — preserved at ②; a correction needs its own R-HQ entry after M2.
- **CPP-D7** (`:80`, `:94`): `examination_rate` is a string — ② a numeric check value.
- **CPP-D8** (`funnel.ts:872`): no PIPELINE_TABLE_MAP entry — ③ derived.
- **CPP-D9** (Spec 41 `:53`, Spec 42 `:305`, Spec 80 `:62-64`, `:552`): the owner specs describe an early / structural / finishing / landscaping construction-phase classifier that this script has never been — ② spec diff.

## 7. PH-6 — Literal ledger (Rule 3, R-DF EXTERNALIZED)
| Literal | `file:line` | Disposition (names drafted, seeded at ②) |
|---|---|---|
| epoch cutoff `'1970-01-02'` | `:46`, `:59` | `classify_permit_phase_issued_date_floor` (a definitional constant, pinned min = max; `Spec 132 §core.8`) |
| base revision `'00'` | `:45`, `:58`, `:76` | vocabulary constant, declared in notes (the base-revision key, not a tunable) |
| `'Inspection'`, `'Examination'` | `:44`, `:55`, `:57`, `:60`, `:72`, `:75` | vocabulary constants (the CKAN status word and the derived value), declared in notes |
| percent formatting `toFixed(1) + '%'` | `:94` | retired (a numeric ratio check value, CPP-D7) |
| 89 (lock) | `:30` | `identity.lock` |

## 8. Purity estimate (gate E codes G0–G13)
This is an estimate. The legacy file is not scanned by gate E, so each code is mapped from the inventory above.

| Code | Legacy sites | Disposition at ② |
|---|---|---|
| G2 undeclared relation / column | `permit_num` (RETURNING); the declared-but-unread `last_seen_at` (CPP-D4) | declared reads |
| G4 DDL/txn | `withTransaction` `:52`, advisory lock `:33` | runner |
| G5 direct write | the UPDATE `:53-63` | runner write seam |
| G6 clock | `Date.now()` `:35`, `:82` | runner clock |
| G7 compute decides | the literal `verdict: 'PASS'` `:109` | declared checks, runner verdict |
| G9 module const | `ADVISORY_LOCK_ID` `:30` | `identity.lock` |

**Expected after ②:** 0 findings, with no ledger allowance (R-BZ, R-DF).

## 9. PRE goldens, forced-change proof and capture needs — NOT YET CAPTURED (no DB in this lane)
- **Read-only measurements owed before ② (M1–M3), one READ ONLY transaction, any time (they fit night N-A next to CHAT-98.P-Q4's link_coa count):**
  - M1 the eligible pool, the Examination count and the base-revision 'Inspection' total today, and the latest `records_updated` of `permits:classify-permit-phase` runs (`pipeline_runs`);
  - M2 `SELECT COUNT(*) FROM permits WHERE enriched_status = 'Examination' AND issued_date >= '1970-01-02'` (CPP-D6), split by `status`;
  - M3 the bump's redundancy (CPP-Q1): over the last N permits runs, how many rows this step changed whose `last_seen_at` the loader had not already touched in the same run. A row the loader touched carries the load's RUN_AT, so the measure is the changed rows whose pre-step `last_seen_at` was older than that run's `permits` start (from `pipeline_runs`); equivalently, the Examination rows not in the latest feed.
- **PRE capture** on the legacy code before any compute change (trap 7), under the DB lock: the two invocations step-validate lists as missing (`permits::`, `none::`). The capture commits real writes on `permits` (the step is not dry-run capable), which is the normal ENRICHER case.
- **Nonzero POST evidence (#38):** a bracket that sets a deterministic cohort of eligible permits back to `enriched_status = NULL`, so the step re-derives 'Examination' (and, under CPP-Q1 option A, bumps their `last_seen_at`); the restore needs no row deletion. The existing R-ET form covers one table, which is enough here.
- **Rerun-zero proof:** a second run writes zero rows (the guard). If CPP-Q1 keeps the bump, it still writes zero rows on a rerun, because `last_seen_at` is set only on rows the guard lets through.

## 10. Red suite (PH-7) — `src/tests/steps/classify_permit_phase/violations.test.ts`
- **Size:** 24 tests. L1–L13 are GREEN today (the legacy oracle). D1–D11 are `it.fails`, RED as named missing artifacts or registry / spec states.
- **Red evidence:** `docs/reports/red-evidence/classify_permit_phase/pre2-artifacts-missing.json`, a vitest JSON run with D1–D11 as plain it(): 13 pass and 11 fail. D1–D7 fail as an ENOENT on the named descriptor or compute file; D8 fails on the Spec 41 step-table text; D9 fails because PIPELINE_TABLE_MAP has no entry; D10 fails because the report did not exist at the red run (after this commit it fails on the missing generated scorecard); D11 fails because converted[] does not hold the file. No failure is a TS or import error.
- **Locks proven in the other direction:** with the frozen text mutated (the bump renamed, the lock changed), L1, L2, L10, L12 and L13 go red; restored, sha256 matches again.
- **Oracle harness:** `src/tests/steps/classify_permit_phase/fixtures/legacy-harness.ts` fakes `./lib/pipeline`, the pool and client (a scripted SQL router: it returns scripted counts and does not evaluate the WHERE clauses, which are pinned as text) and `Date`; `./lib/safe-math` is the real module.

| Pins | Behaviour |
|---|---|
| L1–L5 | lock, RUN_AT and order; the one guarded UPDATE with the `last_seen_at` bump; the three scopes; the rerun at statement level; no reverse arm |
| L6–L13 | summary counts and the process clock; the four INFO rows and the string rate; the literal PASS verdict; the division guard; the failure lanes; emitMeta gaps; the contended lock, no argv/env and the manifest flags; oracle = shipped script |
| D1–D11 | descriptor and shell; write discipline, guard columns and RLS; the bump never silent (CPP-Q1, ruling-neutral); reads = witnessed; EXTERNALIZED; purity; verdict from checks; owner specs corrected; admin (③); scorecard; registry (③) |

## 11. Registry at ① (landed in this commit) and what is owed later
- **Landed at ①:** `converted.json` `pending[]` holds `scripts/classify-permit-phase.js` at stage `red_suite` (`Spec 132 §x-stages.1 (R-DU)`); the census row is `ENRICHER / pending` with owner specs 41 and 80 (and the two census fixtures); CPP-D1…D9 in the defect ledger; `_witness-guard.ts` ADOPTION adds `classify_permit_phase: legacy_oracle_excluded` (19/7/18); the roadmap is regenerated and `conversion-roadmap.infra` re-pinned (pendingBatch 14 → 15, C6 22 → 21, measured on the base). No prefix override: CPP is unique.
- **R-DU:** with no descriptor, the row does not block whole-registry selection; the red scorecard is non-gating.
- **Owed at ②:** the descriptor, compute, notes, the seeds migration, the spec diff (D8) and the scorecard (D10); CPP-Q1 decides D3's branch. No runner arm is needed.
- **Owed at the swap (W2):** permits at `runner_wired` with the close_stale_permits fold (W1, CHAT-98.P-Q1), the PRE and POST captures, and the rerun proof (`Spec 132 §x-stages.2 (R-EQ)`).
- **Owed at ③:** after the cloud halves (LDG-10, EP-PIN-D17; `Spec 132 §x-v3.1 (R-EY)` condition 8).

## 12. Swap order (W2) — measured
- Derived upstreams of this step (the `stepUpstreams` rule with the #44 G3 self-write filter, lineage snapshot at `d6dc90d2`): **permits** (`status`, `revision_num`, `issued_date`) and **close_stale_permits** (`status`). `enriched_status` and `last_seen_at` are self-written and drop out.
- After the fold (R-EN, timed by CHAT-98.P-Q1 to the permits ② / swap) the set is **{permits}**. permits is at `red_suite` today, so this step can reach `runner_wired` only when permits does (#54), in the same commit (both POSTs present) or after it. That is the map's W2.
- Neither CPP-Q1 option changes this step's own upstreams. The bump only changes who lists this step as an upstream (eight in-chain step readers of `permits.last_seen_at`, §1.5; the admin inspector also reads it but is not a ledger node). Retiring the bump would drop six of those edges: classify_lifecycle_phase and assert_global_coverage keep this step as an upstream either way, through `enriched_status` (measured, `effectiveLedger()`, `~/Buildo-scratch/cpp1/ups.cjs`).

## 13. Operator questions (drafted rulings — not decided here; ① is ruling-neutral, ② waits on CPP-Q1)

**CPP-Q1. classify_permit_phase's `permits.last_seen_at` bump (census finding F1).**
- **Question:** at ②, does the step keep bumping `permits.last_seen_at` on the rows it reclassifies, as a declared deviation (the form CHAT-93.Q-H1 gave link_coa), or does the bump retire?
- **Evidence:**
  - the bump: `scripts/classify-permit-phase.js:56` (added by 3a074eea "last_seen_at bump for CDC consistency"); Spec 47 registry `:1937` lists it;
  - `permits.last_seen_at` is the loader's seen column: R-DZ (124a:806; Spec 132 §ingestor.5) names "permits `last_seen_at`" as the INGESTOR's `written:"seen"` column, and R-FF (124a:598; Spec 132 §core.14) says "R-DZ `seen` stays INGESTOR-only"; R-JM applied the same reading to `coa_applications.last_seen_at` (124a:979);
  - the loader touches every fed row on every run (`load-permits.js:398-409`), and this step runs right after it in the same chain, so for fed rows the bump only moves the stamp a few minutes later (inferred);
  - no CDC reader's output depends on the change: classify_lifecycle_phase reads `enriched_status` only for 'Stalled' (`lifecycle-phase.js:398`), and classify_scope (`:404`) and classify_permits (`:772`) do not read `enriched_status` at all;
  - the cost of the bump is a classification time reading as "seen in the feed" (F1) for the freshness readers and the admin inspector, and eight in-chain reader edges on `permits.last_seen_at` (assert_data_bounds, assert_global_coverage, classify_lifecycle_phase, refresh_snapshot, assert_entity_tracing, classify_permits, classify_scope, close_stale_permits; measured, `effectiveLedger()`). Retiring the bump removes six step-level upstream edges, because classify_lifecycle_phase and assert_global_coverage still list this step through `enriched_status`.
- **Recommendation: A now, B decided after measurement** (the CHAT-98.P-Q4 pattern):
  - **A (recommended for ②):** keep the bump as a declared deviation citing this ruling, R-JM and `Spec 132 §core.14 (R-FF)`, written as a `source:"run_at"` column outside the guard (never `written:"seen"`). It is the legacy behaviour (Spec 123 §3.1, pin at conversion), it needs no new column, and it moves no converted step's fingerprint.
  - **B (decide after M3 on night N-A):** if M3 shows zero non-redundant bumps, retire the bump at a later commit as a knowingly-retired intent with the zero-reader and zero-effect evidence. That commit edits refresh_snapshot's `inputs.reads.steps` (a converted descriptor), so it rides a RE-FREEZE / recapture night (`Spec 132 §x-v3.2 (R-II)`).
  - Not taken: a new step-owned stamp column (the Q-H1 option B shape), which is scope growth.
- **Proposed register text (124a, a dated note on R-JM, the CHAT-93.Q-H1 precedent):** "classify_permit_phase keeps its bump of `permits.last_seen_at` (`scripts/classify-permit-phase.js:56`, rows whose `enriched_status` changes, RUN_AT) at ② as a declared deviation citing R-JM and Spec 132 §core.14 (R-FF), written as a `source:"run_at"` column outside the guard; whether it retires is decided after the night N-A redundancy count (M3)."
- **Five words:** standardized (the Q-H1 form, one rule for both permit bumps in the CoA path); observable (the deviation entry and the M3 count); accurate (legacy behaviour kept until measured, no silent change); scalable (no new column; the same reading fits classify_inspection_status at its own ①); understandable (one deviation, one measurement).
- **Conflict check** (searched 124a for R-DZ, R-FF, R-JM, R-EN, R-HQ, R-HR and the decision logs for Q-H1, P-Q4, F1, classify_permit_phase):
  - R-DZ / R-FF: no conflict. They govern the `written:"seen"` form, which A does not use; A writes a `run_at` column and declares the overlap.
  - R-JM: no conflict. It removed link_coa's `coa_applications` stamp by ruling; it does not cover `permits`, and CHAT-93.Q-H1 kept link_coa's `permits` bump under it as a deviation. A follows Q-H1 exactly.
  - R-EN condition (2) (as amended by CHAT-98.P-Q1): no conflict, and it is what makes A low-risk. The folded retract never reads `permits.last_seen_at`, so the bump cannot hide a disappearance after the fold.
  - R-HQ: not engaged by A (no legacy defect is corrected). B would be a knowingly-retired intent with evidence. If the operator reads B as a defect correction instead, it needs its own R-HQ entry.
  - R-HR: not engaged. It covers audit rows, records_meta keys, constant rows and log-only queries, not a write column.
  - CHAT-98.P-Q4: consistent. The same measure-then-decide shape, for the other permit bump.
- **Scope:** inside the permits map (W2). No new table, column, variable or runner arm.

**Informational, no ruling now:**
- **CPP-D6 (stale 'Examination' after issuance).** Pinned in legacy form. Decide only after M2; any correction is an R-HQ entry at that time.
- **CPP-D9 (spec drift).** A spec-text correction in the ② spec diff (the geocode_permits precedent, "the correction rides commit 9's spec diff"). No ruling needed; it is listed so the reviewer sees the four places.
- **Cross-lane, for the merge lane:** this ① edits the same registry spots as H (eba64196) and I (9b81c27c): the converted.json insertion point, the census fixtures, `_witness-guard.ts` ADOPTION, the roadmap and the two re-pinned counts. Each of the three adds one from the same base (G d9f216e4 adds none), so after the merge the counts should read pendingBatch 17, C6 19 and legacy_oracle_excluded 20; re-measure after the merge.

## 14. ② plan — the pure-compute boundary and the descriptor draft
- **Compute (pure, `scripts/lib/compute/classify-permit-phase.js`):** returns the one guarded UPDATE's write plan in the geocode_permits form (the scope predicate with the pinned `classify_permit_phase_issued_date_floor`, the base revision and the status words from notes) and reports the four check values through `ctx.report`. No clock, no `.query(`, no env, no catch, no verdict.
- **Descriptor:**
  - `identity {name: classify_permit_phase, archetype: ENRICHER, lock: 89, spec: "41"}`;
  - one `outputs.writes[]` target on `permits`, key `(permit_num, revision_num)`, `set_based_join_update`, `guard: is_distinct_from`, `guard_columns: ["enriched_status"]` (a `run_at` column in the guard would rewrite every row: the geocode_permits LG-9 fence), `idempotent_rerun: "zero_writes"`;
  - `last_seen_at` per CPP-Q1 (A: a `source:"run_at"` column plus a deviation entry);
  - checks: the four legacy metrics (`examination_classified`, `total_examination`, `total_inspection`, `examination_rate`), INFO and descriptive (`Spec 132 §core.6`), the rate numeric;
  - `inputs.reads.steps`: permits and close_stale_permits until the fold, then permits (#44 (e) decides);
  - `guards.requires`: `rls_bypass_or_policy` on permits;
  - `override.dry_run: "none"`, agreeing with the manifest.
- **Order:**
  1. M1–M3 (read-only, night N-A);
  2. the PRE capture on the legacy shell;
  3. ② at `compute_ported` (legacy shell live);
  4. the swap with or after permits ② + the fold (W1), POST and rerun proof;
  5. ③ after the cloud halves.

## R. Reflection (G9)
### LOW-CONFIDENCE
- **The bump's redundancy (CPP-Q1, B)** is inferred from the statement order and the loader's touch; M3 measures it.
- **Stale 'Examination' (CPP-D6)** follows from the code; its live count is M2.
- **The upstream set (§12)** comes from the committed lineage snapshot (declared legacy reads), not a traced run; ② re-derives it through #44 (e).
### RECURRING / STANDARD-SHAPING
- Two non-loaders bump the permits loader's seen column for "CDC" (this step, and classify_inspection_status in the deep_scrapes chain, `classify-inspection-status.js:83`, `:109`), as link_coa does. Under R-FF the V3 re-run trigger is the watermark pin, so these bumps are legacy CDC plumbing. One reading (CPP-Q1 A, the Q-H1 form) keeps them uniform until each is measured.

## A. Measurement log (2026-10-23)
- **A.F-CODE:**
  - `scripts/classify-permit-phase.js` @ `50837ef4`, sha256 `f952f0cb47a905e1…`, 120 lines;
  - `scripts/load-permits.js:357-363`, `:398-409`; `scripts/close-stale-permits.js:75`, `:87`, `:129`, `:132`, `:148`; `scripts/classify-inspection-status.js:83`, `:109`;
  - `scripts/lib/lifecycle-phase.js:398`; `scripts/classify-lifecycle-phase.js:998`, `:1019-1021`; `scripts/classify-scope.js:404`; `scripts/classify-permits.js:772`;
  - `scripts/geocode-permits.descriptor.json` (identity, outputs, guards, override); `scripts/refresh-snapshot.descriptor.json` `inputs.reads.steps`;
  - `scripts/lib/ledger.js` `effectiveLedger()` via `~/Buildo-scratch/cpp1/ups.cjs`; `scripts/analysis/step-validate.mjs:939-967` (`defectPrefixFor`) via `~/Buildo-scratch/cpp1/prefix.mjs`;
  - `migrations/227_rls_class_b_default_deny.sql:75`; `src/lib/admin/funnel.ts:656`, `:872`; `src/components/FreshnessTimeline.tsx:33`; `docs/specs/01-pipeline/47_pipeline_script_protocol.md:1937`; `scripts/manifest.json` chains and scripts;
  - `git log --follow` / `-S` intents (§4).
- **A.F-DB:** none (no DB access in this lane; §9 M1–M3).
- **A.F-ORACLE:** `npx vitest run src/tests/steps/classify_permit_phase/violations.test.ts`: 24 / 24. The red-evidence run gave 13 pass / 11 fail.

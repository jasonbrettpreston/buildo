# C6-1 — `assert_lifecycle_phase_distribution` (scripts/quality/assert-lifecycle-phase-distribution.js) conversion assessment, commit ①

**Target standard:** McDonald's Airtight V3 (Spec 124 R-DF). That is the whole six-part package (R-DT):
- zero purity findings, with no ledger allowance (R-BZ);
- every gate hard from ① (R-BA);
- the seven admission questions, including EXTERNALIZED;
- step-owned variable names (R-DE (v));
- admin visibility (R-DL).

**Archetype:** ASSERT. The step runs fifteen SELECTs over permits, coa_applications and universal_stream_catalog. It checks:
- the per-seq distribution against per-seq bands, under three operator posture flags;
- an unclassified hard limit;
- three cross-status checks.

It halts only on the two C1 halting classes (`67663a81`) and writes nothing.

**Commit form: compressed (R-PACE-1)**.
- Commit ① is this report plus the red suite.
- Commit ② adds the descriptor, compute, notes, frozen shell, the seeds migration and the admin-map entry.
- Commit ③ is the cutover.
- ASSERT has five converted members, so compressed is the default (#24).

**Frozen legacy oracle:** `src/tests/steps/assert_lifecycle_phase_distribution/fixtures/legacy-assert-lifecycle-phase-distribution.js.txt`. It is byte-identical to `scripts/quality/assert-lifecycle-phase-distribution.js` (sha256 `e52d686e32fe212a…`), last changed by `67663a81`.

**Owner spec:** 84 (`84_lifecycle_phase_engine.md` §3.4, which defines the bands and the posture flags).
- The step runs in TWO chains: permits (position 21 of 32) and coa (position 11 of 16). So the domain spec is the owner, as with enrich_permits (66, wave 4).
- The header's SPEC LINK to 43 (sources) is stale, because the step is in no sources chain (ALPD-D9).

**Target spec:** Spec 84 (`identity.spec` "84"). **Governing specs:**
- 122: the step library and the conversion process.
- 124: the policy register — R-BA, R-BZ, R-DE, R-DF, R-DL, R-DT, R-DU, R-ED.
- 30 §5.4.1: the per-site halt gate that C1 applied.

**Governing plan:** `.cursor/v3-c6-plan-2026-10-19.md`, wave C6-1.

---

## 1. PH-0 — Boundary freeze (G0)

### 1.1 Reads, writes and transactions
**Fifteen reads on the pool, in order:**
1. The catalog-exists probe (information_schema) (`:203-206`).
2. The catalog, only if it exists (`:217-222`).
3. Permits by phase (`:312-316`).
4. CoA by phase (`:322-326`).
5. The per-seq UNION ALL (`:346-355`).
6. Seq-unclassified for permits (`:503-510`).
7. Seq-unclassified for CoA (`:514-522`).
8. Phase-unclassified for permits (`:526-534`).
9. Phase-unclassified for CoA, which KEEPS `linked_permit_num IS NULL` (`:543-553`, pinned L4).
10. Live-status-null (`:571-579`).
11. Never-classified (`:580-582`).
12. bid_value coverage (`:645-651`).
13. The stalled cross check (`:663-666`).
14. The active-inspection cross check (`:681-688`).
15. The permit-issued cross check (`:702-708`).

**Writes:** none. `emitMeta` writes `{}` (`:879-886`).

**Transactions:** none. Advisory lock 109 wraps the body (`:32`, `:149`).

**Config:** `loadMarketplaceConfigs`, then a Zod schema (`:65-93`):
- nine scalars;
- 36 phase-band keys, with a min ≤ max refine;
- `.passthrough()` for the per-seq keys.

The per-seq keys are validated at run time against the catalog. An orphan key throws before any distribution read (`:261-292`, pinned L14).

**Module scope:**
- The body runs only as a CLI (`require.main === module`, `:147`).
- The module exports `classifyHaltDecision` (`:142`, pinned L1–L2).
- It throws at import if either dead-status array is empty (`:106-111`, ALPD-D7).

### 1.2 The checks
- **Per-seq bands** (`:382-436`):
  - There is one audit row per banded catalog seq, zero-padded `lifecycle_seq_NN_count`.
  - A catalog rows_count of 0 gives an INFO row; in band gives PASS; out of band gives WARN.
  - With `…_promote_to_fail_band_violation = 1`, out of band gives FAIL and the step HALTS (pinned L5–L7).
- **Two more directions** (`:438-495`):
  - no_band_configured (data without a band);
  - expected_data_missing (a band with min > 0 and no data, exempting catalog-null seqs).
  - A banded seq with no data is counted twice: once as band_violation and once as expected_data_missing (ALPD-D5, pinned L8).
- **unclassified_count:** permits plus unlinked CoA. Inclusive at the max gives PASS; above the max gives FAIL and HALT (`:592-602`, pinned L10).
- **Drain-lag breakouts:** live_status_null_count and never_classified_count, WARN above a shared threshold (`:609-635`).
- **bid_value coverage:** an INFO row (`:655-660`).
- **Three cross checks:**
  - Each one: 0 is PASS, below the threshold is WARN, at or above is FAIL.
  - A FAIL is verdict FAIL but NOT a halt (C1, `:663-718`, pinned L11).
- **Six seq-band summary rows and three posture-flag rows** (`:723-804`).
  - A **missing** catalog reads seq_bands_total PASS; an **empty** one reads WARN (ALPD-D4, pinned L9).

### 1.3 Audit rows, verdict, `records_meta` and exit lanes
- **Audit table:** phase 22, "Assert Lifecycle Phase Distribution".
- **Verdict:** comes from the `failures`/`warnings` arrays (`:846`), not the rows. A cross_check_permit_issued WARN row, or an armed posture-flag WARN row, alone leaves the verdict PASS (ALPD-D3, pinned L12).
- **`records_meta`:** `{phase_distribution, unclassified_count, seq_distribution, seq_violations (capped at 50), seq_violations_truncated_count, audit_table}`.
  - `records_total` sums every phase key except the synthetic P9-P17 aggregate (`:855-877`, pinned L13).
- **Halt:** `classifyHaltDecision` decides; the message lists the halting failures (`:898-908`).
- **Lock not acquired:** an info log and a skipped summary `{reason classifier_running}` (`:911-928`).
  - Lock 109 is this step's own lock (`:31`), not the classifier's, so the reason text mislabels the lane (ALPD-D8).

### 1.4 Live facts (A.F-DB, read-only, 2026-10-19)
- **universal_stream_catalog:** 110 rows, 33 with rows_count NULL or 0.
- **logic_variables:**
  - 220 per-seq band keys (110 × 2);
  - 36 phase-band keys;
  - the nine scalars at their seeds: unclassified max 100, live-status-null WARN 50, seq-unclassified max 5000, cross thresholds 1000 / 500 / 500, all three posture flags 0.
- **Table sizes:** `permits` 254,082 rows; `coa_applications` 33,949 rows, 549 of them with lifecycle_seq NULL.
- **Latest runs:**
  - 1585 (`permits:…`, 2026-07-17): WARN, 128 rows, records_total 287,482.
  - 1557 (`coa:…`, 2026-07-17): WARN, 128 rows.
- **RLS:** enabled on all three read tables. The step only reads them.

### 1.5 Consumers
- No step reads this step's output.
- The audit row is read by the admin surface and check-chain-verdict.
- `scripts/run-chain.js:1393` cites this script's §R1 CLI guard as the precedent for its own (comment only).

### 1.6 Admin visibility (R-DL)
- **Registered today:** `PIPELINE_REGISTRY` (`src/components/FreshnessTimeline.tsx:101`) and `STEP_DESCRIPTIONS` (`src/lib/admin/funnel.ts:722`). Neither copies a number.
- **Gap (ALPD-D6):** `PIPELINE_TABLE_MAP` (`funnel.ts:878`) has no entry; ② adds it (pinned D5).
- **Control-panel note:** the control panel (`GlobalConfigCard.tsx`, `src/lib/admin/control-panel.ts`) addresses the band keys by their `lifecycle_*` patterns. The ② rename must move those patterns with the keys.

---

## 2. Behaviour ledger (what the conversion must reproduce)
The red suite pins these as L1–L15 (§10). Each one executes the frozen text.

## 3. Registry target review
- **(a) Files:**
  - `scripts/quality/assert-lifecycle-phase-distribution.js` becomes the frozen shell. The ② shell keeps the `classifyHaltDecision` export, or `src/tests/assert-lifecycle-phase-distribution.logic.test.ts` moves to the compute module.
  - Added at ②: `scripts/quality/assert-lifecycle-phase-distribution.descriptor.json`, `scripts/quality/assert-lifecycle-phase-distribution.notes.json`, `scripts/lib/compute/assert-lifecycle-phase-distribution.js`, and a seeds migration.
- **(b) Tables:**
  - **Reads:** `permits(lifecycle_phase, lifecycle_seq, lifecycle_stalled, enriched_status, status, matched_rule, lifecycle_classified_at, bid_value)`, `coa_applications(lifecycle_phase, lifecycle_seq, linked_permit_num, decision, bid_value)`, `universal_stream_catalog(seq, rows_count)`.
  - The legacy emitMeta omits both `bid_value` columns (Rule 1, ALPD-D10).
  - **Writes:** none.
- **(c) Consumers:** none (§1.5).
- **(d) Tests:**
  - `src/tests/steps/assert_lifecycle_phase_distribution/violations.test.ts` lands in this commit.
  - For the ② sweep:
    - `src/tests/assert-lifecycle-phase-distribution.logic.test.ts` (the four-quadrant halt lock);
    - `src/tests/assert-lifecycle-phase-distribution.infra.test.ts`;
    - `src/tests/db/assert-lifecycle-phase-distribution-halt.db.test.ts`;
    - `src/tests/migration-119-lifecycle-bands.infra.test.ts`, `src/tests/migration-149-lifecycle-seq-indices.infra.test.ts`, `src/tests/migration-150-lifecycle-seq-band-posture.infra.test.ts` (they pin the old names);
    - `src/tests/control-panel.logic.test.ts`, `src/tests/quality.infra.test.ts`, `src/tests/chain.logic.test.ts`.

## 4. PH-3 — Intent ledger
Each intent is traced to the commit that introduced it (`git log -S … -- scripts/quality/assert-lifecycle-phase-distribution.js`).

| Intent | Source (introducing commit) | Disposition at ② |
|---|---|---|
| Cross-status checks between the legacy and lifecycle columns | `:662-718` (`6f450129`) | encoded-as-descriptor-field: three non-blocking bounds with a WARN tier, thresholds from config |
| Sum, never overwrite, shared phase keys | `:331-335` (`c57c7b43`, WF3 Bug #6) | preserved-in-compute (why in notes.json) |
| Advisory lock; wired into the permits and coa chains | `:31-32` (`03fcb569`) | preserved-in-runner: `identity.lock` 109 |
| Externalized phase bands | `:34-60` (`91051e0a`) | knowingly-retired candidate: the 36 keys are validated but never read since Pass-2 (pinned L15, Q-ALPD-1) |
| Per-seq bands from the catalog; orphan-key refusal | `:202-309` (`6908c5d4`, E.4) | encoded-as-descriptor-field: per-seq bounds from config; the orphan refusal preserved-in-validator |
| Posture flags promote a kind to FAIL | `:162-191` (`4ec25485`, E.5) | encoded-as-descriptor-field: the flag selects the check's severity (a declared config-selected severity; named in notes.json) |
| One audit row per seq | `:392-408` (`14c8269e`, Pass-2) | encoded-as-descriptor-field: per-seq checks rendered from the catalog |
| Drain-lag breakouts | `:556-635` (`be7d39e3`) | encoded-as-descriptor-field: WARN bounds from config |
| Halt only on band FAIL or the unclassified hard limit | `:113-140, :898-908` (`67663a81`, C1) | encoded-as-descriptor-field: `blocking: true` only on those checks |

## 5. PH-5 — Seam map
| Seam | Legacy effect | `file:line` | V3 seam |
|---|---|---|---|
| db seam | advisory lock 109 | `:32, :149` | `identity.lock` 109; the lock-held lane becomes the runner terminal `lock_held_elsewhere` (R-DE (iii)) |
| db seam | `loadMarketplaceConfigs` + Zod + run-time per-seq validation | `:151-153, :261-309` | `config.logic_variables[]` resolved by the runner; the per-seq keys declared from the catalog |
| db seam | fifteen pool SELECTs | §1.1 | `ctx.pool` reads, declared in `inputs.reads` |
| clock seam | none (no clock is read) | — | — |
| network seam | none | — | — |
| argv/env seam | `require.main === module` CLI guard | `:147` | the frozen shell's `pipeline.step()` entry (no guard needed) |

### 5.1 Risk class
| Risk class | Chance | Impact | Mitigation |
|---|---|---|---|
| Renaming about 265 variables (ALPD-D1) | certain at ② | high: a missed key refuses the config, and the step halts two chains | one migration generated from the seeds; a fake-ctx test proves the renamed set equals the old set one-for-one; the PRE runs before it is applied |
| Verdict becomes row-derived (ALPD-D3) | certain at ② | medium: a lone WARN row now makes the verdict WARN | declared deviation at ②, named in notes.json |
| Two-chain PREs (permits and coa) | medium | medium: the coa-chain PRE depends on the wave-4 coa steps being stable | the coa-chain PRE rides after the wave-4 POSTs (night P4) (§9) |

## 6. PH-6 — Classification and defect ledger (rows ALPD-D1…ALPD-D10 in `docs/reports/defect-ledger.md`; prefix ALPD, unique — `defectPrefixFor` measured, no override)

PH-2 (churn × complexity) is ASSESSMENT-INCOMPLETE because the generated batch artifact `docs/reports/generated/122-churn-complexity.md` covers only the sources chain, and this step is outside its scope. No hand-plotted quadrant is substituted.

- **ALPD-D1** (`:65-93`, `:244-254`): about 265 variables are named `lifecycle_*`, outside the R-DE (v) `<slug>_<name>` form. That is 9 scalars, 36 phase bands and 220 per-seq bands. This step is their only step consumer → ② renames them by migration (pinned D2).
- **ALPD-D2** (`:193-200`): the 36 phase-band variables are validated but never read (pinned L15) → ② operator question Q-ALPD-1.
- **ALPD-D3** (`:846`): the verdict comes from the failures/warnings arrays. A WARN row with no array push leaves the verdict PASS (pinned L12, Rule 10) → ② the library derives the verdict from the rows, a declared deviation.
- **ALPD-D4** (`:723-728`): a MISSING catalog reads seq_bands_total PASS, while an EMPTY one reads WARN (pinned L9) → ② a missing catalog is a `failed_missing_precondition` terminal (R-DE (iii)).
- **ALPD-D5** (`:382-495`): a banded seq with no data is counted twice, as band_violation and as expected_data_missing (pinned L8) → ② one violation per seq, a declared deviation.
- **ALPD-D6** (`funnel.ts:878`): `PIPELINE_TABLE_MAP` has no entry (R-DL) → ② adds it (pinned D5).
- **ALPD-D7** (`:106-111`): an empty dead-status array throws at import, as a module side effect → ② a runner precondition (`failed_missing_precondition`) (pinned D4).
- **ALPD-D8** (`:911-928`): the lock-held lane emits its own summary with reason `classifier_running`, but lock 109 is this step's own lock (pinned L14) → ② the runner terminal `lock_held_elsewhere`.
- **ALPD-D9** (`:14-19`): the SPEC LINK to 43 (sources) is stale → ② the shell header cites 84.
- **ALPD-D10** (`:645-660`, `:879-886`): the bid_value coverage row reads `permits.bid_value` and `coa_applications.bid_value`, which emitMeta omits (Rule 1). Its threshold text copies a measured count ("30/53") → ② `inputs.reads` lists them, and the text names no count.

## 7. PH-6 — Literal ledger (Rule 3, R-DF EXTERNALIZED)
| Literal | `file:line` | Disposition |
|---|---|---|
| nine scalar thresholds | seeds `lifecycle_*` | `assert_lifecycle_phase_distribution_*` variables, values copied |
| 220 per-seq band keys | seeds `lifecycle_seq_band_<n>_{min,max}` | renamed under the step prefix, values copied |
| 36 phase-band keys | seeds `lifecycle_band_*` | Q-ALPD-1 (retire, recommend y) |
| `SEQ_VIOLATIONS_CAP = 50` | `:98` | a step-owned variable, or notes.json `constants` with its why (a payload cap); decided at ② |
| active-phase sets `P9`…`P18`, `O1`–`O3`, `P7a`…`P8` | `:101-103, :684-686, :705-706` | notes.json `constants` citing Spec 84 |
| 109 | `:32` | `identity.lock` (not a tunable) |
| `phase: 22`, "Assert Lifecycle Phase Distribution" | `:871-872` | `execution` / `identity.display_name` declaration |
| "30/53" | `:658` | removed (ALPD-D10) |

## 8. Purity estimate (gate E codes G0–G13, 122a §A26)
| Code | Legacy sites | Disposition at ② |
|---|---|---|
| G1 ledger SQL | config via `loadMarketplaceConfigs` `:151` | runner config |
| G4 txn/lock | advisory lock `:149` | runner |
| G5 direct write | none | — |
| G7 compute decides | band, tier and posture comparisons; the verdict `:846`; the halt `:898-908` | declared check bounds and `blocking` (the library compares, derives and halts) |
| G9 literal | `SEQ_VIOLATIONS_CAP`, the phase sets | config or notes.json constants |
| G11 import side effect | the module-level throw `:106-111` | a runner precondition |

**Expected after ②:** 0 findings, no ledger allowance (R-BZ, R-DF).

## 9. PRE goldens and forced-change proof — NOT YET CAPTURED
**PRE:** taken on the legacy code at the ① tree, before any compute change (trap 7), under the DB lock. There are three modes:
- **`permits`-chain mode:** can ride any capture night.
- **`coa`-chain mode:** must ride after the wave-4 POSTs (night P4), so the coa chain around it is stable.
- **Standalone.**

Every PRE runs BEFORE the ② rename migration, because the legacy code reads the old names.

**Expected verdict:** today's live verdict is WARN (§1.4), so a PRE does not halt. A forced halt is not needed for an ASSERT: the check rows are the evidence.

**POST:** at ②, in all three modes.

## 10. Red suite (PH-7) — `src/tests/steps/assert_lifecycle_phase_distribution/violations.test.ts`
- **Size:** 22 tests.
  - L1–L15 are GREEN today (the legacy oracle).
  - D1–D5 and D7 are `it.fails`, RED as named missing artifacts.
  - D6 is a plain `it` (R-R / Rule 13).
- Red evidence: docs/reports/red-evidence/assert_lifecycle_phase_distribution/pre2-artifacts-missing.json (vitest JSON reporter output, D1–D7 run as plain it calls): 16 pass / 6 fail.
  - D1–D4 fail as ENOENT on the named descriptor or compute.
  - D5 fails on the missing admin-map entry.
  - D7 fails because converted[] does not hold the file.
  - No TS or import error.
- **Oracle harness:** `fixtures/legacy-harness.ts` fakes `./../lib/pipeline` and `./../lib/config-loader`. `zod` and `./../lib/lifecycle-phase` are the real modules. Its `asCli` option sets the shim's `require.main`.

| Pins | Behaviour |
|---|---|
| L1–L4 | the CLI guard and export; the pure halt rule; the fifteen SELECTs; the CoA baseline fence |
| L5–L9 | per-seq rows; posture 0 vs 1 and the halt; the other two directions and the double count; missing vs empty catalog |
| L10–L15 | the unclassified hard limit; cross checks that never halt; the array-derived verdict; summary and emitMeta; orphan keys, inverted bands and the lock lane; the unread phase bands |
| D1–D7 | descriptor and shell; step-owned variables; declared checks; compute purity; admin map; scorecard; registry (③) |

## 11. Registry at ① (this commit) and what is owed later
- **Landed:**
  - `converted.json` `pending[]` at stage `red_suite`;
  - the census row moves from C6 to pending, archetype ASSERT, owner spec 84 (plus the two census fixtures);
  - ALPD-D1…D10;
  - ADOPTION `legacy_oracle_excluded`;
  - the roadmap regenerated.
- **Owed at ②:** descriptor, compute, notes, shell, the rename migration and its control-panel patterns, logic-variable groups, the admin map, and a scorecard refresh.
- **Owed at ③:** registration. It is blocked by EP-PIN-D17 under R-ED until the end-of-sources cloud acceptance.

## 12. Operator decisions
- **RULED 2026-10-19:**
  - The C6 census is ASSERT (`.cursor/v3-c6-plan-2026-10-19.md`).
  - C6-1 opens before wave 4 ③ (coordinator: there is no wave-4 twin and no write; the coa-chain PRE waits for night P4, §9).
- **Draft question, decided at ②, not now:**
  - **Q-ALPD-1:** should the 36 `lifecycle_band_*` phase-band variables be retired?
    - They have been validated but unread since the Pass-2 fold of 2026-05-19 (pinned L15).
    - **Recommend y.** They would be recorded `knowingly-retired`. The alternative renames 36 keys that tune nothing.
    - The phase distribution itself stays in `records_meta.phase_distribution`.

## 13. Compliance table (seven questions, R-DF)
| Planned change | Rule | Std | Obs | Rec | Scal | Acc | Simple | Ext |
|---|---|---|---|---|---|---|---|---|
| ASSERT descriptor + frozen shell (D1) | Spec 122 §5.1; R-BA | assert_parcel_sanity (halting ASSERT) form | step-validate gates A–K | this report | archetype | red-first D1 | precedent | — |
| Step-owned variables (D2) | R-DE (v) | `<slug>_*` | `r-de-vocabulary.logic`, gate A | ALPD-D1 | every new step | measured keys | one migration | **yes** |
| Declared checks, halting only C1 classes (D3) | R-BA; Spec 30 §5.4.1 | assert_parcel_sanity checks[] | verdict.js | ALPD-D3, ALPD-D5 | all checks | L5–L12 pinned | one check per row | bounds from config |
| Compute purity (D4) | R-BZ | G-codes | gate E #32 | ALPD-D7 | fleet | red-first | seams only | — |
| Admin map (D5) | R-DL | every ASSERT → pipeline_runs | D5 lock | ALPD-D6 | every step | measured | one entry | — |

## R. Reflection (G9)
### LOW-CONFIDENCE
- **Posture flags as a config-selected severity.** Whether the check schema can express "severity chosen by a logic variable" is checked at ②. If it cannot, that becomes a schema question for the operator, not a workaround.
- **The ② rename touches the control panel** (`GlobalConfigCard.tsx`, `control-panel.ts`), which addresses the band keys by pattern. It is scoped at ②.

### RECURRING / STANDARD-SHAPING
- **Validated-but-unread variables** have now been found in two C6-1 steps: here (36 keys) and in assert_staleness (1 key). A gate that refuses a declared variable no check reads would catch both. Candidate for a ruling after C6-1.

## A. Measurement log (2026-10-19)
- **A.F-DB** (read-only, one `BEGIN READ ONLY` transaction):
  - catalog rows, and the NULL/0 rows_count count;
  - band-key counts;
  - the nine scalar values;
  - table sizes, and CoA lifecycle_seq NULL;
  - the latest three runs;
  - RLS flags.
- **A.F-CODE:** `scripts/quality/assert-lifecycle-phase-distribution.js` @ `67663a81`, 930 lines, sha256 `e52d686e32fe212a…`.
- **A.F-ORACLE:** `npx vitest run src/tests/steps/assert_lifecycle_phase_distribution/` — 15 pins green, 6 claims red as expected, and D6 green once the scorecard is written.

---

## Validation scorecard (generated)

> Generated by `node scripts/analysis/step-validate.mjs --step=assert_lifecycle_phase_distribution --write` — Spec 123 §6, ruling R-R (2026-08-29).
> Regenerate with the same command; a stale block is a conformance-lock finding (`step-conformance.infra.test.ts`).

**Score: 14/17** · G9 Reflection: PASS · G4d fence-lock coverage: PASS · G-shape: PASS · **Hard stop: YES (G8, Rule 1 (unpinned enforced-red), Rule 5 (unpinned enforced-red), Rule 6 (unpinned enforced-red), Rule 7 (unpinned enforced-red), Rule 8 (unpinned enforced-red), Rule 9 (unpinned enforced-red), Rule 13 (unpinned enforced-red))**

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
| G1 | 1 | 1 | PH-3 section found=true sha-count=9 |
| G2 | 1 | 1 | no generated churn×complexity row; no PH-2 section; ASSESSMENT-INCOMPLETE claimed instead; why-stated=true |
| G3 | 2 | 2 | ledger rows=9 vocab-hit rows=9; evidence rows=0 (not scored) |
| G4 | 2 | 2 | risk-class row with chance+impact found=true |
| G5 | 1 | 1 | db=true clock=true network=true argv/env=true |
| G6 | 3 | 3 | 10 ledger row(s), 0 without CLOSED/PIN () |
| G7 | 3 | 3 | file=true fences=0 it-count=24 red-evidence-claims=1 red-evidence-pass=true ledger-deferred=false |
| G8 | 0 | 3 | missing-invocations=3 missing-pre-invocations=3 stale-fingerprints=0 unexplained-diffs=0 |
| G9 (binary) | PASS | — | heading=true low-confidence-table=true recurring-table=true |
| G4d (fence<=lock) | PASS | — | fences=0 lock-it-count=24 |
| G-shape | PASS | — | file-clean=null compute-clean=null |

### Fast invariants (always run — the fast descriptor gate)

| # | Scope | Pass | Detail |
|---|---|---|---|
| 4 | (registry) | PASS | overlap: none |
| 5 | (registry) | PASS | clean (0 it.fails( call sites outside a declared pending slug) |
| 9 | (registry) | PASS | clean (0 converted slugs blocked by an unmet cutover_prereq item; blocks batching: 0) |
| 22 | (registry) | PASS | GOLD-PRE-FRESH: 83 PRE capture(s) across 27 converted step(s) all tracked + clean (git can restore every reference); net-new (R-DK): load_bylaw_map_areas, link_parcel_abutments |
| 23 | (registry) | PASS | COMPRESSED-FORM-ELIGIBLE: 7 compressed-form declaration(s), all eligible (proven archetype, >=2 converted members) |
| 24 | (registry) | PASS | COMPRESSED-FORM-DEFAULT: 7 eligible pending slug(s), all either compressed or carry a stated full-form reason |
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
| 36 | (registry) | PASS | DEFECT-ID-UNIQUENESS (gate I): 578 definition row(s) checked, 134 legal mirror(s), 0 disagreements |
| 38 | (registry) | PASS | CAPTURE-NONZERO (gate G): every declared write target is closed (0 ledger-allowed, 4 outputs:"none" vacuous) |
| 39 | (registry) | PASS | CAPTURE-FRESHNESS (gate G): 89 post capture(s) checked against scripts/lib/step/**, all fresh or ledger-allowed |
| 40 | (registry) | PASS | CAPTURE-EXPLAINED (gate G): 29 step(s) checked — every diff-explanation channel accounted for |
| 32 | (registry) | PASS | COMPUTE-LITERALS (gate E): 1 finding(s), all ledger-allowed (1); ESTATE-LITERALS (gate E estate arm, R-EB): 0 finding(s) in scripts/analysis/gates, scripts/lib/step; tooling ratchet (PIN EXT-2) 128 finding(s) over 6 files, at or below the marks |
| 41 | (registry) | PASS | RED-EVIDENCE (gate K): 0 step(s) without a committed red-evidence artifact; 0 orphan ledger row(s) |
| 42 | (registry) | PASS | DEFECT-PREFIX-UNIQUE: 43 slug(s), every defect prefix unique |
| 45 | (registry) | PASS | NOTES-CAP: 22 declaring notes file(s), every one <= 12 prose entries |
| 46 | (registry) | PASS | report-only (adoption); enforced by #44 (a)/(c) (R-DB; fold 9 C7-1/C7-2): checks[].reads declared by 3/29 step(s); write_inventory.by_mode declared by 0/29 |
| 52 | (registry) | PASS | PRECOMMIT-BUDGET (R-EC): docs-only 20.41 s <= 25.3 s; registry-input 25.91 s <= 27.5 s; measured 2026-10-21T21:10:54.484Z on Bretts-Mac-Mini.local (darwin arm64, 12 cpu), hook sha matches |
| 47 | (registry) | PASS | MODE-EMITS-TYPE (P2-C5): 29 step(s) mode_select per archetype; 538 emits.type check(s), 0 mismatches |
| 48 | (registry) | PASS | LOGIC-VERSION (P2-C3): 29 step(s) logic_version <=> code_version trigger; 35 fingerprint_inputs entr(y/ies) examined, 0 violations |
| 49 | (registry) | PASS | TERMINALS-RECORDS-META (#75): 29 step(s); 344 declared-key check(s), 0 violations; 170 terminal(s) unwitnessed (no capture) |
| 51 | (registry) | PASS | ADMIN-REGISTRATION (R-DL/R-DW): 43 converted/pending step(s) admin-verifiable (5 without a descriptor: slug arms only, R-DV); no hand-written range on a converted step |
| 53 | (registry) | PASS | VARIABLE-EFFECT (R-EO): 5 take effect at cutover, 19 not read; admin badges current |
| 54 | (registry) | PASS | SWAP-ORDER (R-EQ): every swapped pending step's declared upstreams are converted or swapped (R-EQ) |

### Captures (item iv)
- missing invocations (POST): permits::, coa::, none::
- missing invocations (PRE, GOLD-PRE): permits::, coa::, none::
- stale fingerprints: none
- compare ran: false · diffs found: 0 · unexplained: 0

### Test suite (item iii)
- 3066/3072 passed (suite success=false)
- harvested: 118 file(s) from 3 FLEET-WIDE targets (src/tests/step-conformance.infra.test.ts, src/tests/golden-fingerprint.infra.test.ts, src/tests/steps/) — one spawn per run, so every step's report carries this same number, by design
- excluded (R-AG live-DB tier, owned by `npm run test:db`, derived from package.json `scripts.test`): 1 — **/*.db.test.ts
- skipped (declared but not run): 0
- failing (6):
  - src/tests/steps/assert_parcel_sanity/violations.test.ts > assert_parcel_sanity — descriptor generator drift lock (both directions) > regenerating in memory against the REAL fields module byte-matches the committed descriptor.json (clean — no drift)
  - src/tests/steps/assert_parcel_sanity/violations.test.ts > assert_parcel_sanity — descriptor generator drift lock (both directions) > the CLI --check mode itself reports clean against the current committed descriptor (exit 0)
  - src/tests/steps/assert_parcel_sanity/violations.test.ts > assert_parcel_sanity — descriptor generator drift lock (both directions) > the CLI --check mode is itself not vacuous: fires (exit non-zero) against a deliberately corrupted TEMP COPY, never the real committed file
  - src/tests/steps/load_ravines/violations.test.ts > the three files, one slug (Spec 122 §4.1 / §5.1 / §5.2) + the Fold B library growth > acquire.js — the ONE home for the content-hash gate (Fold B item 3) and the acquisition seam (A-2)
  - src/tests/steps/load_ravines/violations.test.ts > G4d fence locks > F2 0b230472 — present in the converted step (acquire.js + descriptor): tier-2 content-hash gate — contentHashDecision over the streamed hash-through-to-disk (never Buffer.from(await res.arrayBuffer()), never readFileSync), tier2.skip re-emits the prior meta via buildSkipReEmitMeta
  - src/tests/steps/load_ravines/violations.test.ts > G4d fence locks > F2 0b230472 — reversion is detectable: the patch applied to the current subject makes the lock fire (arrayBuffer()/readFileSync)

### Policy coverage matrix (item vi) — Spec 124 Rules 1-13

| Rule | Name | Status | Note |
|---|---|---|---|
| 1 | Nothing hidden | enforced-red | G-1 schema-baseline: schema-baseline clean |
| 2 | Compute is just compute | enforced-green |  |
| 3 | Tunables externalized | enforced-green | G-4: no descriptor · P4/LW-D10/R-A not scoped to this step |
| 4 | Compute rule declared | enforced-green | G-2: 1 preserved-in-compute row(s), 0 with no why/notes.json/checks[] grounding |
| 5 | checks >= 1 | enforced-red |  |
| 6 | Omission fails (20 categories) | enforced-red |  |
| 7 | Archetype gates categories | enforced-red |  |
| 8 | Per-target write discipline | enforced-red |  |
| 9 | Banned write needs ledger (+ V7 no_retraction) | enforced-red |  |
| 10 | Verdict row-derived | enforced-green | (a) OK — 11 corpus file(s) scanned, 0 unsanctioned second derivations, 2 sanctioned hit(s) matched SANCTIONED_VERDICT_SITES · (b) OK — SELF_SKIPPED audit table folds to verdict=WARN (!= PASS), row-derived off 1 non-INFO row(s) — VRD-SKIP closed |
| 11 | Phase-order re-derive (declared half, checkOrderGuaranteesCited) | vacuous | no descriptor — G-3 completeness half stays open |
| 12 | Truthful crash posture (R-B reachability, static + R-M before-image) | enforced-green | R-B (checkInterruptedPostureTruthful): no descriptor · R-M: prose-only (R-M/LG-17 describe not scoped to this step (no before-image target)) |
| 13 | A step validates itself | enforced-red | this run of step:validate IS the mechanism |
| P3 | I/O cost adjudication (measured, not gated) | prose-only | descriptor=0B notes=0B checks=0 rows records_meta=(no capture) |

**Enforced-green: 5/14** · not-run: 0 · vacuous: 1


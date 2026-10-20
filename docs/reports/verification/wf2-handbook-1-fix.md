# Verification: wf2/handbook-1 handbook-fix @ a864e66c

- **Lane:** verify-12b. Independent and read-only (R-EZ, operator y 2026-10-20). I did not write this work.
- **Branch:** wf2/handbook-1 @ a864e66c (worktree ~/Buildo-wt-hb1).
- **Commits checked,** on top of b36b7ccb:
  - 34de023b: enforcement honesty (N1), isV3Final (N5)
  - 3409cf5c: status reasons (N2), Q-B1 (E13)
  - a864e66c: §1 rewrite, E1–E27, generated tables and fact locks (N3), glossary and aliases, INTEGRATION.md (N6)
- **Evidence,** all in scratchpad/verify-12/:
  - suite-a864e66c.log, tsc-a864e66c.log
  - sv-all-fast-a864e66c.log, sv-linkwsib.log
  - classify.mjs and classify.tsv (my own dispatch classifier)
  - enf.mjs and enf.tsv (my own enforcement recount)
  - handbook-errata-2.md
- **Worktrees:** two throwaway detached worktrees (v12-old @ b36b7ccb, v12-mut @ a864e66c) were used and removed with `git worktree remove`. hb1 has no tracked changes; only its pre-existing untracked `mobile/node_modules`.

## Checks

### 1. The 27 round-1 errata: 26 fixed, E4 partly fixed

Details are in handbook-errata-2.md §A.

- **Run order.** §1's 11-step run order matches `runWithPool` (index.js:6897-7770) step by step: database target and run row, config hoisted above or inside the lock, the xact advisory lock and its self-skip, ctx, the input-guard and pin halt, shape dispatch, the phase, then `compute(ctx)` once (skipped on a halt), `runWritePlan`, `buildAuditTable`, and `checks_failed = errors.length`.
- **Dispatch tables.** I did more than the 10-step spot check that was asked for. My own classifier calls the runner's exported predicates in `runWithPool` order on **every** tracked descriptor. All 38 pipeline steps match tables 1a and 1b: phase, shape, multi-primary split, and legacy-shell flag.
- **E1.** The lane said my round-1 slug→file rule was wrong. **Confirmed.** Examples: `parcels` → `scripts/load-parcels.js`, `massing` → `scripts/load-massing.js`, `coa` → `scripts/load-coa.js`. Paths from the manifest are the right source.
- **E4 is only partly fixed.** The `ctx.report` contract is now correct. But the new generated hook column in table 1a claims to list "every `compute.<name>` the phase uses", and it omits the 7 hooks reached through helper functions (E28). Among them is `compute.materializeRows`, the very example E4 gave.

### 2. Forty-four more lines sampled: 39 hold, 5 flagged

Details are in handbook-errata-2.md §B and §C.
- E28 MUST: table 1a hook column is incomplete.
- E29 SHOULD: link.4 attributes R-CR's closure condition to Q-B1.
- E30 MINOR: before-image home is write.js, not reset.js.
- E31 MINOR: Gate A…K location, and gate V.
- E32 NOTE: the header overstates what the fact lock checks.

The 25 §5 symptom rows I sampled all hold, including the generated Defect Ledger line numbers (6 spot-checked) and the OWED and `rowBlocks` rows.

### 3. Enforcement honesty: PASS, no gaming found

**Counts reproduce independently (enf.mjs):**

| Measure | Result | Claimed |
|---|---|---|
| Raw kinds | lock 180, lock-db 1, check 37, hook 1, none 44 (total 263) | yes |
| Partial pulled out | 151 lock, 1 lock-db, 37 check, 0 hook, 30 partial, 44 none | fully locked 151, yes |
| unenforced[] | 67 entries: 47 in force (17 none, 30 partial) + 20 retired | yes |
| `UNENFORCED_CEILING` | 67 | yes |
| `step-validate --all --fast` line | "47 in-force … (17 none, 30 partial) … 20 retired" | yes |

**Every lock entry now names a test that mentions the rule id or a declared alias.** There are two exceptions, both pending integration and exempt by design:
- R-EW's ref does not exist on this branch.
- R-EX's ref does not mention it.

On b348e360 both tests do mention their ids (R-EW ×3, R-EX ×5).

The six refs I flagged in round 1 are all re-pointed to tests that assert the rule:
- R-AT → step-library M1e (the double-count lock)
- R-CZ → capture-replay
- R-BA → gate-five-words
- R-AQ.1 → programme-backlog
- R-AG → hooks-composition
- R-L → step-library (now mentions it)

R-BS is now `lock-db`.

**58 lock entries rest only on a new `// rule-map: <ID>` comment.** I sampled 17 of the 38 annotated files, reading each comment together with the assertions that follow it:

| Rule | Test | What it asserts | Genuine? |
|---|---|---|---|
| R-CO | before-image-test-isolation | nothing lands on the real disk | yes |
| R-BQ | capture-ledger L1 | `status` `captured` | yes |
| R-BO | chain-order-derived U1–U4 | unconverted → unwitnessed, else hard | yes |
| R-AJ | execution-budget-disposition | every duration key dispositioned | yes |
| R-BM | fleet2-full-rescan F1–F3 | declared scope plus witness | yes |
| R-BR | gate-captures T7 | cohort `count_path` | yes |
| R-BH | gate-mode-emits-type M1–M3 | both directions | yes |
| Q-S1-a | ledger-reader O-6 | bare `<> 'completed'`, so cww → RUN | yes |
| V2 | pipeline-advisory-lock | lock ids unique, including one-time and backfill | yes |
| R-CW | step-producer | `not_failed` evaluates run status | yes |
| R-P | step-conformance LPA-D4 | skip-gated step declares a `pre` check | yes |
| A1 | step-conformance | `conformanceFindings`: sibling descriptor, no strays | yes |
| Rule-12 | step-conformance | `checkInterruptedPostureTruthful` self-test | yes |
| GAP-G-1 | step-conformance | schema-baseline x-ruling ratchet | yes |
| STD-VERSIONS | step-validate-standard-label | nine-condition V3 label | yes, but weak: it locks the R-EY label, not the V1/V2/V3 version definitions (NOTE) |
| Rule-3-addendum-R-AU | spec124-register-rulings | R-AU closure | yes, the same lock as its parent |
| R-Y | template-freeze | 20 categories equal schema `required` | yes |

None is false, so there is no BLOCKING finding here. The partial-class annotations (R-CI, R-CF, R-AQ, V6, R-AW and others) state their gaps honestly in both the comment and the `unenforced[]` reason.

### 4. New locks: red-first and mutation tests PASS

**Red on b36b7ccb.** a864e66c's handbook-rule-map test run against the b36b7ccb tree: **10 of 10 new tests fail** (6 N1 + 4 N3). The 14 existing tests pass.
- Most of the reds are by construction: missing exports such as `mentionsRule` and `factFindings`.
- So I also ran the new gate (rule-map.mjs) over the **old** map. The 3 RED-arm tests now fail genuinely ("expected false to be true").
- The "every lock names its rule" test lists the bad parent ids (Rule-1, A1, GAP-G-1, R-Y, V2, V3, V4, …).

**isV3Final (N5).** Putting the old one-line `isV3Final` back into a864e66c's test file turns the N5 case red (1 failed). Restoring it gives 9 of 9 green.

**Green at a864e66c.** The full suite and these locks pass.

**Mutation tests of the N3 locks,** run in the throwaway worktree:

| Mutation | `--check` | vitest N3 block |
|---|---|---|
| M2: rename `measureProducerPins` | exit 1: "§1 run order drifted: step 6: producer pins" | 3 fail |
| M1: rename `runBackfillPhase` → `runFillPhase` | exit 1: "handbook … is stale" | — |
| M1': rename to `runBackfillStage` | exit 1: "dispatch branch isBackfillStep calls no phase" | 1 fails |
| M3: rename flag `--replay-all` | exit 1: "flag --replay-all does not occur in capture-step-golden.js" | 1 fails |
| M6: rename `seamOwned` (a §5 symbol) | exit 1, named | — |

Two mutations were **not** caught. Both are limits of the lock, recorded as E32:
- **M4:** dropping `assertRequirements` from `runLinkPhase` makes §1 step 8 false, but the check stays green, because behaviour is not locked.
- **M5:** renaming the bare `--replay` stays green, because the flag test is a substring test and `--replay-all` still matches.

### 5. Reproduction: PASS

| Claim | Result |
|---|---|
| Suite | 800 files passed / 1 skipped. **17,895 passed, 0 failed, 4 skipped.** Exit 0 (110 s). Matches the claim. |
| tsc (`--noEmit -p .`) | Exit 0 |
| `step-validate --all --fast` | Exit 0 |
| `generate-step-handbook.mjs --check` | Exit 0, "up to date" |

### 6. Header: generated vs hand-written statement — mostly accurate

- **Accurate:** the three-way split (generated from code / generated from data / hand-written and locked) matches the generator.
- **Overstated in two places:**
  - E28: "what it reads off the compute module" is incomplete.
  - E32: "every code symbol … is checked". Only camelCase and snake_case identifiers are checked, any occurrence counts (comments included), flags are matched by substring, and behaviour is not checked.
- "Its exported predicates run on every real descriptor" is close enough. The unexported `isLinkColumnStep` is replaced by a verified plain-shape test.

### 7. Readability: much improved, now nearly sufficient

- §1 now gives a correct, ordered account of a run. Tables 1a and 1b let a diagnoser go from slug to files to phase to mode decider in one hop.
- The glossary covers every jargon item I flagged in round 1.
- With E28 fixed, a new engineer could build and diagnose a step from the handbook, the runner and table 1a.
- Still undefined (MINOR): Intent Ledger, §R Reflection, seam, G-2, the sources chain, and P0–P3.

## Findings

### BLOCKING

**B1 (E28): table 1a's generated hook column is false as captioned. Round-1 E4 is not fully closed.**
- The caption says it lists "every `compute.<name>` the phase uses". But `readDispatch` reads only the phase function's own body.
- Missing:
  - MATERIALIZER: `materializeRows`, `buildSourceSql`, `finalizeMatched`, `buildPostSql` (via `materializeRowsArm`)
  - BACKFILL: `buildPreSql`, `buildPostSql` (via `runBackfillFullRecompute`)
  - LINK: `primaryMatchBinds` (via the helper of the same name)
  - Runner-level, outside any phase: `DISTRIBUTION_SCOPE`
- **Fix (generator only, then `--write`):** follow calls from each phase into other index.js top-level functions that are passed `compute`, transitively; add a runner-level row; add a lock that `materializeRows` appears in the materialize row. The minimum alternative is to reword the caption.

### NOTE

- N1 (E29, SHOULD): link.4 attributes R-CR's "closes when a keyed-delete arm lands" to Q-B1.
- N2 (E30 and E31, MINOR): the before-image home is write.js; Gates H, K and V live in step-validate.mjs.
- N3 (E32): the fact lock checks only that names exist. Two mutations (a semantic drop, and a flag-substring rename) pass `--check`. Narrow the header claim and match flags on a token boundary.
- N4: STD-VERSIONS' lock is the R-EY label test. That is real but weak, since it does not lock the version definitions.
- N5: Most new red-first evidence for N1 and N3 is red by construction (missing exports). The new gate run over the old map shows the RED arms discriminate genuinely.
- N6: INTEGRATION.md is accurate and complete for rulings-7, backfill-9 and new register rows. It correctly expects R-EW/R-EX mentions that b348e360 already has. Defect Ledger line numbers regenerate on `--write`.
- Process: Python use cannot be observed from the commits; skipped as instructed.

## Verdict: **BLOCK** (narrow)

- Everything the BLOCK on b36b7ccb asked for is done. All 8 MUST errata and all 19 SHOULD/MINOR errata are applied.
- The enforcement-honesty rework is real and not gamed: 17 sampled annotations, all genuine.
- Counts, the suite (17,895/0/4), tsc, step-validate and `--check` all reproduce. The new locks are red on the parent and catch rename drift.
- The one blocker is new: table 1a's generated hook column claims completeness and is incomplete (E28). That is a MUST under the round-1 severity rule, in the section built for diagnosis.
- **One generator commit fixing E28 (ideally with E29–E31) flips this to PASS-WITH-NOTES.** No re-run of the enforcement audit is needed.

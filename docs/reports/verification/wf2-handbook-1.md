# Verification: wf2/handbook-1 @ b36b7ccb

- Lane: verify-12a. Independent and read-only (R-EZ, operator y 2026-10-20). I did not write this work.
- Branch: wf2/handbook-1 @ b36b7ccb, worktree ~/Buildo-wt-hb1. Parent: 1d16f155 (wf2/rulings-8).
- Commits: ee1e05a7 map-1 · a6e68254 handbook-1 · b36b7ccb observe-1.
- Evidence files, all in scratchpad/verify-12/:
  - suite-b36b7ccb.log
  - sv-all.log, sv-all-full.log
  - sub-symptom-table.md
  - sub-redfirst-hooks.md
  - sub-rulemap.md
  - gf-check.mjs
  - locks-nomention.txt
  - handbook-errata.md
- Worktree state: hb1 has no tracked changes; only its pre-existing untracked `mobile/node_modules`. Both throwaway worktrees (wt-parent, wt-a6) were removed.

## Checks

### 1. Handbook content accuracy (main job): FAIL, 8 MUST errata

I checked 84 lines: §1 12 (including the 8-row reads/writes table), §2 14, §3 11, §4 9, §5 27 (every row of both tables), §6 9, §7 2. I compared each one with the register row it cites and with the code.

- 57 lines are accurate.
- 27 lines are flagged: 8 MUST, 11 SHOULD, 8 MINOR. Each one, with its correction, is in handbook-errata.md.

The MUST set clusters in §1, "How a step is read and written", which is the part the operator cares most about:

- **E2: §1 says the runner "dispatches on the archetype".** It actually dispatches on `execution.shape` (index.js:400-470).
  - A step with no shape is either inferred to be an INGESTOR or takes a no-phase ASSERT path. In that path runWithPool calls compute once (index.js:7341) and then runs `runWritePlan`.
  - Measured: MATCHER link_wsib is shape `cascade`. The two LINKs link_parcels and link_neighbourhoods are `link_keyed` and `link_column`. RECORDER assert_engine_health has no shape, so it takes the ASSERT path plus a write plan, not runRecorderPhase.
  - Anyone diagnosing a step from §1 would open the wrong phase.
- **E3: §1 says runWithPool "selects the mode".** Mode is selected per phase. §1 also omits the advisory lock on `identity.lock` and the input/pin halt that runs before any phase.
- **E4: §1 says compute "returns … check values".** Values go only through `ctx.report(id, value)`; a returned `observations` key is ignored (index.js:7336-7340). §1 also never mentions the named compute hooks each phase calls (`buildMatchSql`, `shapeRecord`, …).
- **E1: §1 and core.1 give file paths as `scripts/<slug>.*`.** File names are hyphenated (`link-wsib`) while the slug is `link_wsib`, and the quality ASSERT/RECORDER steps live in `scripts/quality/`.
- **E5: link.2 says "runLinkPhase serves each LINK family".** R-EG says "a second" family. Only the 3 steps with shape `link` use it.
- **E6: recorder.1 says "`outputs.publish` is direct or pointer".** That field was deleted at the Phase 3 RE-FREEZE (step.schema.json:5960). The line copies a stale cell from Spec 124 §3 (124:173).
- **E7: the §5 `#38` row says "retake with --replay-all".** `--replay-all` only prints retakes from existing recapture.json entries, so it cannot fix a missing entry.
- **E8: the §5 LPA-D6 row presents a fixed bug as the live cause.**

What holds up:
- The other 25 §5 rows: every Defect Ledger id exists and matches its symptom. COA-D13 and COA-D14 are present on b348e360 at defect-ledger lines 337 and 338. Every cited rule covers its row, and the cited symbols exist where stated.
- The 8-row reads/writes table matches step.schema.json.
- The x-v3.1 nine conditions match R-EY exactly.
- The ship bar matches Spec 123:313.
- x-verify.1 matches `.husky/commit-msg` → `check-integrate-verification.mjs`.

Also, the header says the handbook is "generated from rule-map.json". That is only partly true: the §1 prose and both §5 tables are hard-coded constants in `scripts/generate-step-handbook.mjs` (READ_WRITE, SYMPTOMS, MESSAGES). Nothing checks that prose against the code. That is how E1 to E8 got through the lock.

### 2. Readability (Spec 120 success test): PARTIAL

No, a new engineer could not build or diagnose a step from this handbook alone, mainly because of E2 and E4: the dispatch key and the compute contract are wrong or missing. Other gaps:

- Jargon used without definition: PH-0, the ①②③ commits, RE-FREEZE, LDG-10, "five words", the numbered fast invariants (#22, #25, #44, #47, #51–#54), "bracket", "class-A", "OWED", R-AS cohort, EP-PIN-D17, W4A.
- Two G-code families collide (E18): purity G0–G13 and scorecard G0–G9. "Purity G7" (§5) and "G7 test adequacy" (x-validate.2) are different things.
- Rule id `V3` collides with the standard named "V3" (E19).
- §2–§4 are good one-paragraph summaries with a stated why. For most lines you still need the register for the mechanics. That is acceptable for a reading surface, but §1 and §5 have to be right on their own.

### 3. rule-map.json: counts PASS; enforcement column has NOTE-level errors

- All counts reproduce at b36b7ccb:
  - 263 rules.
  - Status: active 126, amended-by 52, process 34, one-off 11, superseded 10, historical 30.
  - Enforcement: lock 188, check 37, hook 1, none 37.
  - unenforced list: 47 entries, of which 27 are in force (16 none, 11 partial) and 20 are retired.
- `extractRegisterRulingIds` returns 158 ids, and every one has a map entry. The only register-sourced entries that don't resolve are R-EW and R-EX, which are pending integration by design.
- Merges alias rather than renumber: MERGE-1 to MERGE-10 name only existing ids, and `by` points to the successor.
- Statuses compared with the consolidate-1 inventory: 57 ids differ.
  - 45 are the same status written differently.
  - **12 are real changes with no stated reason**: W4A-R1/R2/R4 and Q-B1 go from UNCERTAIN to active; R-EV, R-CR and R-D go from active to one-off; and the inventory's "historical-one-off" ids are split between one-off and historical with no rule given. Only R-K.2 and Q-R-EQ-1 carry a note.
- Enforcement spot-check of 34 entries:
  - 16 lock refs assert their rule.
  - 3 test the behaviour without naming the id.
  - 2 are weak.
  - **6 lock refs name the wrong test**:

    | Rule | Ref given | Where it is actually tested |
    |---|---|---|
    | R-AT | step-library.logic | purity-s3-exec-seam.logic |
    | R-CZ | chain.logic | capture-replay.logic / gate-captures.infra |
    | R-L | permits.logic | step-library.logic |
    | R-AQ.1 | massing.logic | programme-backlog.infra |
    | R-AG | link_massing/metamorphic.db.test.ts (a DB test `npm test` never runs) | hooks-composition.infra |
    | R-BA | massing.logic | gate-ledger.infra / gate-five-words.infra |

  - R-AB is understated as "none" (E12).
- Across all lock refs, **84 of 188 name a test file in which the rule id never appears**. 40 of those are just the first file the register row names.
- Arm (e) of the gate checks only that the lock file exists, and it never re-checks partial-class unenforced entries. So "enforcement: lock" in the map means "a file named in the row exists", not "this test asserts this rule".

### 4. Reproduction: PASS

| Claim | Result |
|---|---|
| map-1 red-first | On 1d16f155 with ee1e05a7's test, gate and schema but no map: 13/13 fail. With the map: 13/13 pass. The red only proves the map is absent (all 13 fail on ENOENT). A mutation (checkRuleMap → `[]`) turns every RED arm (a)–(e) red: 8 fail, 5 pass. |
| observe-1 red-first | At a6e68254 with b36b7ccb's register lock: 8/8 pass. With both grandfather lists emptied: 2 fail (101 unlabelled and 15 lockless arms), as claimed. The print test is red at the parent by construction (no `unenforcedReportLine` export); not executed. |
| Grandfather lists | Independently recomputed (gf-check.mjs). 101 unlabelled and 15 lockless, each equal to its list in content and order. Neither list holds a V3-final row. Exact equality makes them shrink-only. The widened lock is strictly stronger than the parent's R-CX-onward regex. |
| Suite at b36b7ccb | 800 files passed / 1 skipped. **17,884 tests passed, 0 failed, 4 skipped.** Exit 0 (8 forks, 124 s). |
| step-validate | `--all --fast` exit 0, and `--all` exit 0. Both print the rule-map line "27 in-force … (16 none, 11 partial) … 20 retired". |
| Generator | `generate-step-handbook.mjs --check` exit 0. In a throwaway worktree, a hand edit makes it exit 1. File-only (fs and path; no DB, network or env). |

### 5. Pre-commit wiring and budget: PASS

- The pre-commit diff is exactly one added line: `generate-step-handbook.mjs --check`, placed after generate-surface-registry and before spec-split-check.
- hooks-composition.infra only adds that command and goes from 12 to 13 arms; nothing was relaxed. It passes 41/41.
- Budget evidence:
  - `hook_sha256` matches the new hook.
  - Stages go from 29 to 30.
  - docs_only goes 24.65 → 20.26 s (cap 25.3); registry goes 24.41 → 20.26 s (cap 27.5).
  - `precommit-budget.mjs --check` exits 0.
- The drop comes from the same per-stage method, mostly generate-bylaw-provisions (7.95 → 5.34 s) and typecheck. That is consistent with load variation, so I accept it as legitimate.
- Oddity: the empty-staged and `--all` step-validate stages both read exactly 4.67 s, which makes docs_only equal registry. I did not re-time because the host load average was about 32.

### 6. Integration hazards: clear, with one addition

`meta.pending_integration` holds R-EW and R-EX, and COA-D13 and COA-D14. When wf2/rulings-7 b348e360 lands, arm (d) goes red by design. **In that same commit the integrator must:**
1. Empty `meta.pending_integration.rules` and `.defects`.
2. Drop `source.pending_integration` from R-EW and R-EX.
3. Confirm their lock refs now exist (`src/tests/steps/coa/dispatch.logic.test.ts`, `capture-rerun-proof.logic`).
4. Revisit their "rul7 branch only" reasons in `unenforced[]`.
5. Run `node scripts/generate-step-handbook.mjs --write` so the † marks are dropped; otherwise the pre-commit `--check` fails.

The map's own note says only "the integrator empties this list", so it understates steps 2 to 5.

Other lanes:
- Any new register row from backfill-9 (W4A rows) or rulings-7 (or another lane) makes arm (a) red until that same commit adds a rule-map entry with a `handbook_line`.
- `meta.register_rows_owed` says how to alias W4A ids.
- The precedence register row (decision 2) is also owed to "the later ruling lane" (§7). Nothing tracks it.

## Findings

### BLOCKING
- **B1: §1 and two archetype lines are wrong about how a step runs (E1–E6).** This is the section built for "how everything is built and read… simple to diagnose", and it states the wrong dispatch key, omits the no-phase path and the `ctx.report` contract, gives the wrong file paths, and documents a deleted field. Two §5 rows (E7, E8) point a diagnoser at the wrong fix.
  - Fix: edit the `READ_WRITE`/`MESSAGES`/`SYMPTOMS` constants in the generator and the `lines[]` text for link.2, matcher and recorder.1 in rule-map.json, then `--write`.
  - These are text edits only; the lock, map and hooks need no change.

### NOTE
- N1: 6 lock refs name the wrong test, and 84 of 188 lock refs name a file that never mentions the rule. The gate checks only that the file exists. Either fix the 6, or describe the enforcement column as "file named in the row".
- N2: 12 status changes from the consolidate-1 inventory carry no stated reason. Q-B1 is misplaced on core.14 (E13).
- N3: The §1 and §5 prose is hard-coded in the generator, not stored in rule-map.json, and nothing locks it to the code. The handbook header overstates this as "generated from rule-map.json".
- N4: The map-1 red is an ENOENT red only. A mutation shows the arms do discriminate.
- N5: `isV3Final` in spec124-register-locks only recognises two-letter ids. A future `R-xx.1` after R-CX would be treated as pre-R-CX.
- N6: The pending-integration note understates the integrator's steps (see check 6).
- N7: Process: the lane reported running `python3 --version` once, against the standing never-Python rule. It was a version probe only; no Python code ran. Recorded as a process NOTE.

## Verdict: **BLOCK**

The block is narrow and covers handbook content only. The machinery passes:
- every count reproduces;
- the red-first claims hold;
- the grandfather lists are exact;
- suite 17,884/0/4 and step-validate exit 0;
- the hook and budget are legitimate.

Change to PASS-WITH-NOTES once the 8 MUST errata (E1–E8 in handbook-errata.md) are applied and regenerated. That can land as one follow-up commit on this branch before integrate.

## Re-verification of a864e66c

Lane verify-12b, 2026-10-20, independent and read-only. The full report is wf2-handbook-1-fix.md; the errata are in handbook-errata-2.md.

- **Round-1 errata:** 26 of the 27 are fully fixed. E4 is partly fixed (see the open blocker below).
- **Dispatch:** §1's run order matches runWithPool. Tables 1a and 1b match the runner's own predicates for all 38 steps. E1's manifest-path approach is confirmed correct; my round-1 slug→file rule was wrong.
- **N1, enforcement honesty: PASS.**
  - Counts reproduce: raw lock 180 / lock-db 1 / check 37 / hook 1 / none 44. Fully locked: 151. unenforced[]: 67, of which 47 in force (17 none, 30 partial). Ceiling: 67.
  - Every lock names a test that mentions its id or alias, except R-EW and R-EX, which are pending and exempt.
  - 17 of the 38 newly annotated test files were sampled, and every one genuinely asserts its rule. No gaming.
- **N2:** done; status reasons are present.
- **N3:** the locks are real.
  - They are red on b36b7ccb.
  - Renaming a run-order symbol, a phase, a flag or a §5 symbol is caught.
  - A semantic change and a flag-substring rename are not caught (NOTE).
- **N5:** red/green confirmed.
- **N6:** INTEGRATION.md is accurate.
- **Reproduction:** suite 17,895 passed / 0 failed / 4 skipped; tsc, `step-validate --all --fast` and `--check` all exit 0.
- **Open blocker, B1 (E28, MUST):** the generated table 1a column "Reads off the compute module" claims to list every hook. It omits 7 hooks reached through phase helpers, among them `materializeRows`, which was E4's own example, and the runner-level `DISTRIBUTION_SCOPE`.
- **Other new errata:** E29 SHOULD (link.4 attributes R-CR's closure condition to Q-B1); E30 and E31 MINOR; E32 NOTE.

### Updated branch verdict: **BLOCK** (narrow)

One generator commit that fixes E28 flips this branch to **PASS-WITH-NOTES**. That commit should follow helper calls in `readDispatch`, add a runner-level row and lock `materializeRows`; the fallback is to reword the caption. E29–E31 should go in the same commit.

## Re-verification of 316c8f38 (verify-12d, 2026-10-20)

Full report: wf2-handbook-1-fix2.md.

- **E28 (the narrow BLOCK) is fixed.** My acorn-AST scanner (fix2/hooks.mjs) follows every call site that passes `compute`. It reproduces table 1a exactly, including the runner row.
  - `DISTRIBUTION_SCOPE` is read directly in runWithPool (index.js:7454), not via makePreWriteGate. The table is still truthful under its caption.
- **E29–E31 are true** against 124a and the code.
- **E32: the stricter lock works.**
  - A symbol left only in comments now fails `--check`.
  - A renamed bare `--replay` now fails in `factFindings`. The parent generator was green on both.
  - The header still overstates snake_case coverage: 23 lowercase ids are skipped silently.
- **Glossary:** accurate, except two MINOR points:
  - the Intent Ledger disposition examples do not match `DISPOSITION_VOCAB`;
  - "P0" is ambiguous in history.1.
- **Upstream note (SHOULD):** link.4 and 124a R-CR say averaging is "not_evaluated until Q-B1". Spec 130:93 and LC-58 (2026-10-19) superseded that.
- **Reproduction:**
  - Suite: 17,897 passed / 0 failed / 4 skipped.
  - tsc, `step-validate --all --fast` and `--check`: all exit 0.
- **Diff scope:** clean.

**Overall branch verdict (wf2/handbook-1 @ 316c8f38): PASS-WITH-NOTES.** No blocking findings remain.

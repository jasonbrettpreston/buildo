# REPORT.md: BL-PROOF, task-68 (PROOF.TOOL), stage 1 (2026-11-19)

## Six plain lines for the operator
1. What proof slice S needs: the search pages (search, candidates, lot map, semi question, loading screen, load failure) ending at the report, shown to work; task-268 lists five proofs (a photo of the page for 25 lots, every element a number or "Not yet evaluated", numbers equal to the answer key, storage kept and refreshed, a compliance table).
2. What already exists: the search, lot map and semi pages are checked by committed truth files and three small checkers that all pass today (measured 2026-11-19), plus the routing and no-maths tests that the push station already runs on every push.
3. What cannot run today: anything on a real lot (the report read returns null until task-123), the storage proofs (no record table named, no database in a lane), the loading screen and load-failure page (tasks 266, 267, 317 not built), anything needing a browser or device, and design fit (not built by your ruling).
4. The minimum tool: one runner for slice S that calls the existing checks and prints one table (pass, fail, not built, gap, with an evidence file per row); about 300 lines in 3 files, 1 day (GUESS).
5. Left for later: screenshot per lot, element check, answer-key compare, storage probes, design fit; each is a stage with a named unblocker (123, 265, the table migration, 345 then 67) and none is built now.
6. Decisions owed: one draft for the orchestrator (D1: at PROOF.S close, accept the four report-page proofs as GAP for Increment 1·B); nothing else.

## The needs table
Full table with file:line and measured output: docs/reports/lanes/2026-11-19/BL-PROOF/PLAN.md section 2. Summary:
| Proof | Exists already | Runs today | In the minimum tool |
|---|---|---|---|
| Declared pages and goldens (surface-validate arms) | scripts/surfaces/surface-validate.mjs:38-43, screen-checks.mjs:409 | yes (0.45 s) | yes |
| Search, lot map, semi goldens equal the binding output | the three golden capture scripts with --check, no caller | yes ("search goldens ok (10)", "lotmap goldens ok (11)", "semi-question goldens ok (8)") | yes |
| Pages behave (jest, 7 files) | mobile/__tests__ | UNVERIFIED (not run, rule 18) | yes, flagged, opt-in if over 120 s |
| Address routing, parser, no-maths MF-16 | src/tests/search-routing.logic.test.ts and others | in the suite at the station | no (suite row reads the pass file) |
| Hooks plus full suite on the tip | push station pass file | operator or station | yes, read-only |
| CHK.3, CHK.5 | scripts/analysis/policy-checks.mjs --all | yes; CHK.5 prints WAITS | yes (CHK.5 as NOT BUILT) |
| Design fit | none (task-345, task-67 LATER) | no | NOT BUILT row |
| 1.6 harness | no code (task-206 merged into draft-15) | no | no |
| Loading screen from the pick, load-failure page, report opens | tasks 266, 267, 317, 123 not built | no | NOT BUILT rows |
| (a) screenshots, (b) element check, (c) key compare, (d) storage probes | admin preview shows 12 synthetic goldens only; nothing for (c); CHK.5 WAITS | no (DB, browser, 123, 265) | no: later stages 3-5 |

## The minimum tool and its size
scripts/surfaces/proof-slice.mjs plus scripts/surfaces/proof-slices.json plus src/tests/surfaces/proof-slice.logic.test.ts: about 110 + 70 + 120 lines (GUESS), 1 day (GUESS). Measured: the node rows run in under 2 s together. Exit codes 0 all pass, 1 fail, 2 usage or bad data, 3 not built or gap present. Not built now (and why): screenshots, element extraction, key compare, storage probes (read returns null; need test stack), browser driver (new library), design fit (RR-0306), any DB code, a re-run of the suite's tests.

## Review round
r1-plan.txt (deepseek-reasoner, plan template, one round): 38 findings; triage in TRIAGE.md: KEPT or folded 23 (argv rows with no shell, exit 3 on not built, required --out, per-row timeout, id regex, anchored WAITS match, blockedBy array, suite row lists covered files, jest row measured first, ids check at step 0, conditional Spec 127 note), REJECTED 14, NOTED 1 (the rejected are mostly findings about the generated context wrapper, not the plan). The review's answer to the question asked: nothing in the minimum tool is unneeded except the unmeasured jest row (made conditional); nothing slice S needs is missing for the search pages.

## Operator drafts (also PLAN.md section 6)
D1 (priority and timeframe), plain two sentences: With the minimum tool, slice S's search pages, their states and the address routing can be proven now, but the four proofs on the report itself cannot run until the report read (task-123) and stored lots (task-265) exist. When PROOF.S closes, do you accept those four as GAP for Increment 1·B, or hold slice S open until they can run?
Grounded: task-268 text "GAP not accepted by the operator means not DONE"; src/lib/parcels/report-page.ts:23-26 returns null; tasks 123 and 265 are LATER.
Recommendation: accept them as GAP for 1·B and run stages 3 to 5 once 123 and 265 land (review r1 did not contradict it; the wording was not reviewed).

## Records
Task-68: description Files line, plan, dated note, references, status WAITS ("stage 1 plan done; stage 2 build waits on the orchestrator"). One docs commit with trailer Task: task-68, hook tail in commit.out. No code change, no push, no DB, no suite run, no id claimed (the ledger needs none: no MB/MF/FE/migration/round/M id is introduced).

## UNVERIFIED
- Mobile jest duration and whether the jest rows pass (not run).
- Which pushes trigger .github/workflows/mobile-ci.yml.
- draft-15 content (1.6 merge target).
- Whether the new files move the consumer registry or Target Files blocks, and whether check-spec-diff asks for a Spec 127 note (hooks run at stage 2).
- Location of the McProof key for the 25 lots' report numbers.
- gate.mjs result: see the PASS line in the final message.

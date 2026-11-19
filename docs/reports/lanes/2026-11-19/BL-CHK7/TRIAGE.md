# TRIAGE r1 (plan round) · lane BL-CHK7 · task-4
Source: r1-plan.txt (deepseek-reasoner, review mode, plan template). 31 findings; only those that touch the CHK.7 build are adjudicated one by one, the rest are grouped. Each opened against the file named.

KEPT (folded into the build)
- K1 [HIGH] undefined failure handling (missing queue file, no Next free id line, no HEAD copy, throw in a hook). Opened scripts/analysis/mcbylaws/mcbylaws-queue-check.mjs:197-246 (queueCheck wraps everything in try/catch and returns CANNOT). Fold: the new function never throws; a queue path absent at the index is skipped (no row introduced); absent at HEAD = empty base; a queue with an added heading but no readable "Next free id" is FAIL:Q:cannot-decide.
- K2 [HIGH] no test that the hook wiring calls the new function. Opened src/tests/mcbylaws-gate.logic.test.ts (gate tests run main on a temp repo). Fold: add one wiring case: gate.mjs main(['--staged']) on a fixture repo with a staged duplicate row fails.
- K3 [HIGH] test case "a migration number already in the tree fails" contradicts the standing duplicate 315 (ls migrations: 315 appears twice, checked). Fold: rename the case "a newly ADDED migration whose number another file holds fails"; the old 315 pair is not judged (not introduced).
- K4 [MEDIUM] prose, dated notes and fenced blocks as false-positive class must be encoded, not left to a human lens. Opened mcbylaws-queue-check.mjs:44-50 (headingBody reads only lines that start with **MB-nn). Fold: introduced ids are HEADINGS only (prose and Dated note lines are never read); lines inside a fenced block are skipped; cases added for an id in prose, in a dated note and in a fence.
- K5 [LOW] output grammar undefined. Fold: one line per id, `FAIL:Q:id-<duplicate|unclaimed|no-row>:<ID>:<file>`, same family as the existing FAIL:Q lines (mcbylaws-queue-check.mjs:67), exit contract is the gate's (any FAIL line = GATE FAIL).

REJECTED (reason, file:line)
- R1 [CRIT] fail-open, ledger half not read: the brief's design limit says the check reads queue rows and repo ledger files only when the only ledger is scratch (BRIEF.md:8); Spec 137:46 shows the ledger is LOCAL. The header and REPORT say so. No repo ledger exists (grep ledger in scripts/analysis/mcbylaws and docs/reports/policy found only policy-ledger.json, the unrelated policy-check escape).
- R2 [CRIT] pre-commit only, add a CI call site: the brief fixes "runs on the staged diff like the rest of the script (same flag)" (BRIEF.md:9); a push/CI call is scope beyond the Scope now line. Noted as a follow-up in the report.
- R3 [CRIT] RR-0195/RR-0196 contradiction, [MED] register row types, duplicate INC5 rows: generated context pack, not this task's content; the orchestrator owns brief.mjs.
- R4 [CRIT] AC1 "committed alone" vs step 1 "with the work": the brief fixes the commit contents (context file in the work commit, BRIEF.md:12). AC1 stays unchecked with a note.
- R5 [HIGH] AC7 vs last docs commit: BRIEF.md rule 19 and :12 fix the topology (last docs commit).
- R6 [HIGH] count heuristic unsound: the key is the heading NUMBER with a count per number (index vs HEAD); a swap of the same number is no new id; two new headings of one number are caught as duplicate. The FAIL line names the id. Design kept, tested (add one, add two, replace).
- R7 [HIGH] cross-tree test placement: precedent src/tests/mcbylaws-queue.logic.test.ts:14 imports the same .mjs.
- R8 [HIGH] red must be a test run: RR-0225 and BRIEF.md:10 fix red = refused commit attempt; no runner call is allowed.
- R9 [HIGH] estimate, 12-hex digests, truncated quotes, out-of-repo citations, document budget, ENOENT labels, fragment grammar, lane naming, glossary, cap total: all properties of the generated context pack or the Backlog loader, not of this build.
- R10 [HIGH] AC4/AC5 lens and grounder steps: this lane runs the one plan round the brief allows (BRIEF.md:11) and grounds each finding here against the opened file; no extra round.
- R11 [HIGH] write_scope names a scratch dir: BRIEF.md:23-25 names it; lane state only, repo writes stay in ~/Buildo-wt-chk7.
- R12 [HIGH] R9 note not reproduced: it is in task-4 Implementation Notes (viewed, backlog task view task-4 --plain) and BRIEF.md:1.
- R13 [MED] namespace undefined / separate counters: per-prefix, per-queue, stated in the header (Spec 137:51 names one counter per queue).
- R14 [MED] dependencies on gate.mjs staged(): no sibling CHK lane in my write scope; merge order is the push station's.
- R15 [LOW] gate.mjs line citations rot: accepted, report cites symbols.

# TRIAGE r2 (output review, one lens: false positives on ids in prose and dated notes) · r2-output.txt
KEPT (fixed in the fix commit)
- K6 [HIGH] migration renamed onto a fresh number bypasses the check (opened mcbylaws-queue-check.mjs idLedgerErrors, the `added` filter took status A only). Fixed: R/C onto a different number is judged like a new file; test added (rename keeping its number passes, rename to 340 fails id-no-row).
- K7 [NIT] slow path dropped idLines on the listTracked null guard (opened gate.mjs staged()). Fixed: the guard returns cannot-decide plus idLines.
REJECTED
- R16 [HIGH] note lines starting `**MB-nn**` count as headings: headingBody is the one reader Q2-Q5 already use (mcbylaws-queue-check.mjs:44-50), so such a line is already a Q2 status-words failure today; no new class. Real queue: no dated note line starts with the bold id (grep, both queues).
- R17 [HIGH] Next free id regex unanchored/first match: first match in both real queues is the live line (MCBYLAWS-QUEUE.md:26, MCFRONTEND-QUEUE.md:5); a missing or reformatted line fails closed as cannot-decide, which is the stated design. Fences in real queues: 0 (grep).
- R18 [HIGH] readAt '' may read the worktree: opened git-util.mjs readAt doc, '' = `git show :path` (the index); listTracked '' = ls-files (index). A D+A move never self-duplicates because the index no longer holds the deleted path.
- R19 [MED] row regex permissive: errs toward pass, documented in the block comment as "a queue line names it"; no tighter reading is ruled.
- R20 [MED] bump must land in the same diff: that is the queue convention (heading and Next free id move in one commit, queue head note); a split bump is the failure the check exists to catch.
- R21 [MED] fence run length / ~~~ : both real queues have zero fences; not built (no scope creep).
- R22 [MED] headingBody not in scope: it is defined in the same module (line 44) and 11 tests pass in commit.out.
- R23 [LOW] CRLF: both queues have 0 CR (grep). [LOW] rename entry shape: parseNameStatusZ puts the NEW path in .path (name-status.mjs:20-24). [NIT] message detail: not requested.

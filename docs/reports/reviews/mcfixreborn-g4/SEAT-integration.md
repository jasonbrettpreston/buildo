Seat: Cairn-Integration-G4

1. WHAT I READ (read-only; no file written, no hook or test run, no database)
- Brief, GROUNDER-A to D, SEAT-close-check, STATUS.md G4 section. I did not repeat S1-S5, S9, T1-T12 or D1-D5.
- Whole: scripts/analysis/backlog-lane.mjs, backlog-brief.mjs, proof-slice.mjs, proof-slices.json. Most of scripts/hooks/check-lane-close.mjs (:36-140, :146-336, :339-460, :462-700, :720-892) and scripts/analysis/rule-lists.mjs (:98-260, :296-400, :457-470, :533-876).
- Also scripts/lib/review-template.js (:95-150), scripts/deepseek-review.js (:100-420), the lens templates (placeholders, finding and VERDICT lines), .husky/commit-msg, pre-commit, pre-push-checks.sh, scripts/hooks/check-task-files.mjs (:1-60), gates/generated-docs.mjs, policy-checks.mjs and chk3/chk5, migration 334 against the seed, rule-lists.json (exempt, protected_paths, base_ref), the git log of the generated rule-lists page against its input docs.

2. FINDINGS (most serious first)

1. MED, NEW. The self-edit rule does not cover the code the close check runs on.
- Close-check side: check-lane-close.mjs:44 imports `parseFM` and `asList` from scripts/analysis/backlog-lib.mjs. :46 imports `matchesAny` from scripts/analysis/mcbylaws/paths.mjs (:105). :48 loads scripts/lib/review-template.js (`extractSections`).
- Rule side: rule-lists.json:22 `protected_paths` names five paths: check-lane-close.mjs, rule-lists.mjs, rule-lists.json, deepseek-review.js and `.husky/*`. check-lane-close.mjs:35 and :752 apply it only to the commit that closes the task. The comment at :35 says "the helper", but only rule-lists.mjs is listed.
- Why it matters: the hook runs from the lane's own tree. A lane whose Files line declares backlog-lib.mjs or paths.mjs can change those in an earlier commit. `parseFM` decides the status, assignee and type the check reads (:760, :790). `matchesAny` decides what counts as protected and exempt. So the check can be made to read what the lane wants. Only review-template.js has a guard (H3, :812-813), and it is waived when the launch Files line names the file.
- Cost: this needs a task that declares those files, so it is a design gap and not an accident.
- Fix: add the two helper paths to `protected_paths` (the file is protected, so it needs a lane).
- Not checked: whether scripts/analysis/mcbylaws/gate.mjs (the commit-msg hook's gate after check-lane-close) protects these paths in its own policy.

2. MED, NEW. The proof table reports PASS for CHK.3 although CHK.3 checks nothing in that mode.
- proof-slices.json:9 (row `chk3-nothing-new`, "over the tree") runs `policy-checks.mjs --all`. In that mode policy-checks.mjs:70 passes `changes: staged ? changes : []`, pkgBefore '' and pkgAfter ''.
- chk3-nothing-new.mjs:20-26 only flags an added component file, a changed binding-sources file or a new dependency, all taken from `changes` and the package diff. With those empty it finds nothing. It also returns `waits: []`, so the row's `waits: "WAITS CHK.3"` can never fire.
- Result: the row prints `PASS` whenever the run ends in "POLICY CHECKS OK". The only live part in --all mode is the stale-row sweep (`goneRows`, :37).
- Row :10 (CHK.5) runs the same command. It shows NOT BUILT only because chk5 prints its own WAITS line (chk5-mcstorage.mjs:16, :22).
- What a person sees: a green proof row for a check that was not exercised, on a tool whose purpose is "positive proof of a run" (proof-slice.mjs:94).
- Fix: change row 9 to `notbuilt` with a reason, or reword its `proof` to "orphan ledger rows only".

3. LOW, NEW. The launcher uses "lane dir" for two places, and the close check reads only one.
- backlog-lane.mjs:186 tells the lane to write `--out <lane dir>/in-out-compliance-L` and `> out-compliance-L[-pN].txt`. In the launcher, laneDir (:39) is the scratch folder ~/Buildo-scratch/lanes-<date>/<lane>, which holds G1, BRIEF.md and REPORT.md (:208).
- check-lane-close.mjs:816 and :501 read only the repo folder docs/reports/lanes/<date>/<lane>/, at path depth 6. The brief's layout sentence (:188) and the grounder sentence (:189, "lane report dir") name the repo folder, but only after the ambiguous wording.
- REPORT.md: the launcher puts it in scratch (:208). The close needs a task reference to `<repo lane folder>/REPORT.md` (check-lane-close.mjs:510-512). Nothing in the brief says to copy REPORT.md into the repo folder. The grounder sentence mentions only out-*.txt and FINDINGS.md. The close prints the exact `--add-ref` command, but nothing checks that the file exists, so a task can carry a reference to a file that is not there.
- Cost: wasted DeepSeek calls, or a refusal at close, if a lane follows "<lane dir>" literally. The close fails closed.
- Fix: replace "<lane dir>" with "docs/reports/lanes/<date>/<lane>" in :186, and add REPORT.md to the copy list in :189.

3 findings. Everything else I followed between the tools agreed on both sides (section 3).

3. CHECKED AND SOUND
- Hook wiring: .husky/commit-msg calls check-task-files :6 then check-lane-close :7, both with "$1". Pre-commit calls `rule-lists.mjs page --check` :44 and gates/generated-docs.mjs. core.hooksPath is .husky. All nine commit-msg targets exist. proof-slice has no hook caller, and its header says so (:11). rule-lists `validate` and `check-tasks` have no hook or CI caller. They run by hand only. Not a fault, but nothing keeps the table checked between lanes.
- Rule table, page and registry: the generated-docs registry (:53) lists rule-lists-by-kind.md with `has_check: true`. The page commit b2591b815 is the same commit as the newest list-doc change (137_mcqueue and 08_agents), and no other list file is newer. By git dates the page is not stale. I did not run `--check`.
- Launcher output against the close check: the repo folder docs/reports/lanes/<date>/<lane>/ is depth 6 (:816). File names `plan-` and `out-<lens>[-<id>][-pN].txt`, `in-` beside them and `TASK` match listProof (:384-395), and the TASK check is at :500-506.
- Lens-input output against the close check: `lens-input --out <stem>` writes `<stem>[-pN].txt` (rule-lists.mjs:~838) and clears only that stem's own files with an anchored regex. listProof's `-pN` regex is anchored (:384). Ids like inc-1 and inc-1-2 cannot collide.
- Seats: the launcher uses `seatOf` (:183-184) and writes `lens-engineering.md` for engineering lists. The close check applies the split only when the range base holds lens-engineering.md (:517-519). That file exists on this branch (README :101 matches). The plan gate always splits (:648-651).
- REVIEW header: deepseek-review.js:161 writes `template=<basename>`, model, `at`, file_sha256 over the input and prompt_sha256 over JSON [system, user]. reviewErrors (:62-80) and lensPromptHash (rule-lists.mjs:373) recompute the same, with `specs` as the context cut by `--section` and the placeholder `dataContext` string. A dotenv banner is covered by the first-15-lines rule. Lens templates carry `{{PLAN}}` and `{{SPECS}}`, and plan-review-deepseek adds `{{DATA_CONTEXT}}`. The `review` command parses `--context`, repeated `--section` and `--template` (:364-368).
- Context sections: backlog-brief writes `## Task`, `## Description`, `## Acceptance criteria`, `## Implementation Plan`, `## Implementation Notes` and `## Decisions naming this task`. CONTEXT_SECTIONS and PLAN_SECTIONS (review-template.js:115-116) find each. Notes is always present, so the `hasNotes` branch in lensContexts (:323) is never needed.
- Context round number: launcher :186-187 and brief :84-86 call the same `contextRound`, on the board and on the lane tree. Plan-prep commits the board folder before launch, so both counts agree.
- Plan-prep to launch gate: the file names `plan-<seat>-<id>[-pN]`, `in-plan-...` and `plan-<lens>` (rule-lists.mjs:645-676) agree with complianceSetErrors (:442-456) and, for a fix task, the template map at check-lane-close.mjs:657. The material check (`p.material === c.cut`) uses the same `extractSections`. `post` and `commit` use exported functions that exist (seatLines, PLAN_SEATS, parseVerdicts, outcomeErrors, lensKindOf).
- Imports: backlog-lane imports `planGateErrors` from the close check, and the close check's CLI guard (:892) prevents a side effect. rule-lists imports the close check only dynamically, so there is no cycle problem.
- Finding ids and severities: templates print `BUG|DEFER severity=` and FINDING_LINE, lensKindOf and findingsIn read it. `ruledLine` and `findingsReport` produce the `Ruled:` line the grounder copies. An unknown severity defaults to CRITICAL (fail closed).
- Base ref: the launcher builds `refs/heads/<base_ref>` (:187) from rule-lists.json base_ref "wf2/board". The close check's BOARD_REFS (:129) lists refs/heads/wf2/board first. The launch commit is found the same way on both sides (`-S@lane-<lane>` on the task file).
- Lens set: `lensSet` is the single function used by the launcher (:179) and the close check (:529); plan-prep (:645) also uses it.
- Proof tool: every script named in proof-slices.json exists (surface-validate.mjs, three golden-capture scripts, policy-checks.mjs). The four suite test files exist. The expected output strings ("search goldens ok" etc.) match what the scripts print (golden-capture.ts :57, :74, :75). `tooling_spawn_max_buffer_mb` is in the seed. I could not read the push-station pass-file writer (outside the repo, see 6).
- Migration 334 against the seed: description text identical; default, min and max 33.2, type number, the same as registry_s 33.19 in precommit-budget.json. No other migration claims 334, and 331-333 are free (a gap, no clash).
- Exempt and protected paths: exempt covers docs/reports/lanes/** and reviews/** (rule-lists.json). check-task-files "always allowed" covers the same two folders, so a lane's records never trip Files.

4. QUESTIONS FOR THE OPERATOR
- Finding 1: do you want backlog-lib.mjs and mcbylaws/paths.mjs added to protected_paths (needs a lane)?
- Finding 2: should the CHK.3 proof row show NOT BUILT, or stay PASS with a reworded proof line?

5. UNVERIFIED
- panel-tools/brief.mjs (outside the repo): that it merges the spec's `extra` unchanged (the lens line stays in the BRIEF) is read from the launcher only (Grounder A made the same note).
- The push station that writes the pass file `proof-slice` reads (fields `sha:` and `RESULT:`, proof-slice.mjs:128-130): no writer in the repo, so field names are unproved.
- Pre-push: `.husky/pre-push` runs gate and suite only. I did not follow whether the G4 tests (src/tests/backlog) are in its path beyond the full-suite step.
- `rule-lists.mjs page --check` and the page's sizes were not run (git dates only).
- I did not confirm that the McBylaws gate does not itself protect the two helper files named in finding 1.
- Dotenv version and its banner text: assumed from the "first 15 lines" comment.

### Critical Files for Implementation
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/analysis/rule-lists.json
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/analysis/proof-slices.json
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/analysis/backlog-lane.mjs
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/hooks/check-lane-close.mjs
- /Users/brettpreston_macmini/Buildo-wt-board/scripts/analysis/policy-checks.mjs

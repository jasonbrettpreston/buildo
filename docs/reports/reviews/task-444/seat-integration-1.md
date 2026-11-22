# Seat: integration: task-444 plan
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

### ig#1 LOW: the plan says a lane answers "y" at the push prompt, and a lane cannot
- Plan sentence: "Answer 'y' at the push prompt."
- Evidence: `gate.mjs:568-583`. `push()` calls `askTty()` for any change on a protected path, and it reads /dev/tty (`FAIL:S:no-tty` when there is none). Both queue files are protected (`mcbylaws/protected-paths.json:57` and `:70`).
- RR-0385 item 4(iii), at MORNING-DECISIONS.md:1917 onward, says every push needs "his own y, with a short summary".
- What goes wrong: a lane reading "answer y" may treat the prompt as its own to answer.
- Smallest correction: write "the operator answers the push prompt (RR-0385 item 4 iii)".

### ig#2 LOW: nothing at commit time asks for a trailer, prereg or panel record on these two files (checked, and the plan is right)
- Evidence: `gate.mjs:255-282`, `staged()`. Its fast path returns `[]` unless a staged path is layer23, literalScope, DB or frontend.
- Neither queue file is on `layer23` or `frontend`. They are only on `protected` (`protected-paths.json:57` and `:70`).
- The test file `src/tests/spec-notes-1b.logic.test.ts` matches none of `src/tests/**/bylaw*`, `src/tests/mcbylaws-*` or any frontend glob.
- The `.husky/commit-msg` chain does not mention `.cursor` at all.
- Only a `Task: task-444` trailer is needed, and `check-task-files.mjs` is satisfied (see ig#3).

### ig#3 NIT: the Files line is complete, and the rule-lists claim is true
- `rule-lists.mjs resolve --files "<the Files line>" --type build --letter S` returns queue-137, agents-s7-s11, eng-all, five-words, plan-protocol, inc-S and ms-S, with `unmatched: []`.
- The two queue files alone resolve to everything above except eng-all. The `queue-records` row matches `.cursor/*QUEUE*` (`rule-lists.json:150-154`). The test file alone adds eng-all.
- `check-task-files.mjs:10` always allows the task file, `docs/reports/reviews/<task>/` and `docs/reports/lanes/`.
- The check is active because the test file is under `src/` (line 55).
- The two queue files and the test file are all on the Files line, so nothing staged falls outside it.

### ig#4 LOW: the plan does not mention arm R, but nothing there is touched
- Evidence: `promise-sources.mjs:10` reads `.cursor/MCBYLAWS-QUEUE.md` as the root of arm R. It finds only `mcbylaws/sources/*.md`, `docs/specs/*.md`, `CARD-*.answered.md` and `HANDBOOK-AMENDMENTS.md` paths.
- `promise-ids.mjs:28-34` reads MB ids only.
- The notes carry none of these. The scratch path `~/Buildo-scratch/queues-.../MORNING-DECISIONS.md` matches no pattern.
- The existing 436 note already cites the same path.
- Arm Q reads only `**MB-nn` and `**MF-nn` headings. The id check is in `mcbylaws-queue-check.mjs:289-330`. A note line starting `- Dated note ...` is never a heading, and the notes contain "task-444", "RR-" and "M-246" but no MB or MF id.
- No vocabulary or banned-word hook reads `.cursor`. Of the hooks I read, `lint-staged` covers only `src/features/leads`, `src/lib/observability` and `src/app/api`, and the only "banned" hit is a lock rule in `ast-grep-leads.sh`.

### ig#5 NIT: generated files, confirmed none change
- `rule-lists.mjs page --check` prints "is current" now. The page sizes only the list documents (`renderPage`, `rule-lists.mjs:532-557`). Neither queue file, nor the test file, is a list document, and `08_agents.md`, `137_mcqueue.md` and `00_engineering_standards.md` are untouched.
- `scripts/generate-system-map.mjs:14-30` reads only `docs/specs` and `docs/reference`. Its Tests column is built from backtick-quoted test paths inside spec text, and no spec is edited.
- No generator reads either queue file. Only these files name them: `mcbylaws-queue-check.mjs`, `promise-sources.mjs`, `plan-to-backlog.mjs`, `mctest/lib.cjs`, prereg JSONs, and tests.
- `docs/reports/generated/127-surface-registry.md:1135` mentions MF-52 only as prose.

### ig#6 LOW: other tests read the queue files, and the plan names only two of them
- Plan sentence: "The tests that read these files pin only the MF header text ... and the increments table."
- Evidence: about 20 test files name these two queue files.
  - `mcfrontend-status.infra.test.ts:59-60` uses `queue.split('\n## ')[0]` and only calls `includes` for "Phase 1 is open". Nothing is asserted as absent.
  - `mcfrontend-queue.infra.test.ts:19-36` reads only `**MF-nn` headings.
  - `web-landing.logic.test.ts:156-160` reads `| X |` rows in `## Increments`, which is lines 82-99.
  - `mcbylaws-queue*.logic.test.ts` use fixtures.
- None breaks on an added bullet line. The plan's conclusion is right, but its list is incomplete. This is a wording point only.

### ig#7 LOW: the insert at new line 248 is clean, but a line insert shifts every later citation by one
- Evidence: `.cursor/MCBYLAWS-QUEUE.md:247` is the old sentence, `:248` is blank, and `:250` is `### Lanes`. `.cursor/MCFRONTEND-QUEUE.md:13` is the old sentence, `:14` blank, notes at `:15`, `:17` and `:18`, `:19` blank, and `:20` is `## Phase 0`.
- Both inserts keep :247 and :13 fixed, as the plan says.
- Lines after them move by 1. About 30 citations to later lines exist in tasks, specs, the pack copies and prereg JSONs. Examples are `:256` in the DoD of tasks 29, 143, 145, 234 and 275, where the quoted text is already at `:257` today.
- This is tolerated. `card-cite-check.mjs:3` and `:19` say "line is a hint, content decides", and the window is plus or minus 10 lines.
- The repo's own convention at `69a_mcbylaw_register.md:141` is that an in-cell note "inserts no line, so no later line citation moves". The plan's choice to insert a line is acceptable. One sentence in the plan acknowledging the one-line shift would be enough.

### ig#8 NIT: the plan's opening text matches the landed 436 note
- Evidence: `08_agents.md:360`. The prose after the colon is word for word the same as N1 and N2: "the seat that writes a task's plan and the lane that builds it run on Opus; the reality-check, integration and regression seats and every grounder run on Sonnet; the review lenses are DeepSeek."
- The bracket differs only by adding task-444, RR-0389 and decision-174, and by adding the :1910 and :1954 quotes. The quotes at :1909, :1910 and :1954 match MORNING-DECISIONS.md verbatim.
- The 436 note cites `.cursor/MCBYLAWS-QUEUE.md:247`, and that line is unmoved by the plan.

### ig#9 NIT: extending the test file fits its form
- The file in `src/tests/spec-notes-1b.logic.test.ts` is a root text-reading lock. It uses one `MARK` constant, a `noteIn()` helper at describe level, and `expect(..).toContain` on dated notes. It already carries the line "Each case pins one confirmed stale line to the dated note".
- A new describe block with its own mark constant fits.
- Its header comment (lines 1-7) names only task-376. Add one line naming task-444 and RR-0389, so the SPEC LINK comment stays honest.
- It must call `fs.readFileSync` only on repo files.
- The pre-commit hook runs only `vitest related` for staged `src` files, so only this test file runs at commit.

What I checked and found true: the hook chain reading (`.husky/pre-commit`, `commit-msg`); the protected-paths lines; arm Q and the id ledger; the Files line and `rule-lists resolve`; `page --check` is current; no generator reads the queue files; the insert positions against the files as they are now; and the opening text against 08_agents.md:360.

# Seat: regression: task-444 plan
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

### rg#1 LOW: "DeepSeek handles breadth and execution" at line 247 and "DeepSeek exec" at MF:13 are left unaddressed
- Plan sentence: N1 says only "Opus only for hard design adjudication" is superseded and "Seats run on Sonnet by default" stands.
- Evidence: `.cursor/MCBYLAWS-QUEUE.md:247` also says "DeepSeek handles breadth and execution". `MCFRONTEND-QUEUE.md:13` says "DeepSeek exec and lenses". The new rule makes the building lane Opus.
- Spec 08 rule 9 already says the DeepSeek "execution half is PLANNED ... until it ships, execution is Claude" (`08_agents.md:358`).
- What goes wrong: a reader may take the DeepSeek sentence as contradicting the new note. 436's note has the same silence.
- Smallest correction: no edit needed. If wording changes, add "DeepSeek breadth stands (Spec 08 rule 9; execution is Claude until it ships)" to the note, nothing more.

### rg#2 NIT: the note form differs slightly from Spec 137 rule 4 and rule 10
- Spec 137 Rule 4 gives the form `Dated note <date> (M-246, prior text kept; <row> · <queue> · lane X; operator, verbatim: "<words>")` (`137_mcqueue.md:118-119`). Rule 10 says "with the date, the row id and the queue" (`:125`).
- The plan's bracket names "task-444 FINAL.1b, McFix Final" and no queue name or lane. 436's landed note and the most recent notes in these files (for example `MCFRONTEND-QUEUE.md:18`) already vary, and 436 has the same shape.
- Smallest correction: optional. Add "McBylaws queue" or "McFrontend queue" to each bracket if the form matters. It does not break any check.

### rg#3 LOW: queue-edit authority and process have a precedent, and the plan should say so
- Evidence: the lane table at `MCBYLAWS-QUEUE.md:126` gives lane R (rulings, register rows, cards) to "orchestrator only". 137 Rule 4 says the orchestrator writes rulings into the row.
- Precedent: commit 4b32de544 (task-422) changed `.cursor/MCBYLAWS-QUEUE.md` with a `Task:` trailer, in a task commit. The McFrontend queue was edited by task lanes too (`b5d77c14b`, `8f32f24ea` and others).
- RR-0389 is the operator's own order to update the documents, and decision-174 records it.
- The memory rule "mcbylaws-queue-process-first" says to name the queue task, lane and stage before any queue edit, and to run the queue checker before and after (arm Q, `queueCheck({cwd, rev:"HEAD"})`, or `gate.mjs --ci`).
- Smallest correction: add one line to LANDING saying the edit rides the task-444 card under RR-0389 and decision-174, and that arm Q is run before and after as the memory rule asks. It adds no new gate.

### rg#4 NIT: "prior text kept" and the first sentences that stand hold
- Both inserts add a line and delete none. The old sentences are untouched.
- Test (a) pins the old sentences, "Opus only for hard design adjudication, with the reason logged." and "Opus sparingly". N1 says "Seats run on Sonnet by default" stands, and N2 says "Sonnet seats" stands. That matches RR-0385 item 1 (seats and grounders stay on Sonnet).
- Spec 137 Rule 10 and M-246 are satisfied. Nothing in the plan removes a ruling.

### rg#5 NIT: no test breaks by an added line
- Tests that pin the queues are `mcfrontend-status.infra.test.ts:59-60` (header `includes`), `web-landing.logic.test.ts:156` (increments table rows), `mcfrontend-queue.infra.test.ts` (MF headings) and `mcbylaws-queue*.logic.test.ts` (fixtures). A bullet inside `## Phase 0`'s header region or under a paragraph adds no heading, no table row and no MB or MF id.
- The ID-ledger test says "dated notes ... are never read as introduced ids" (`mcbylaws-id-ledger.logic.test.ts:70-73`).

### rg#6 LOW: the lock's two-direction proof is satisfied, but the test pins the shape, not the substance
- `08_agents.md:486`: "Every lock is proven in BOTH directions". Test (b) fails today (no note, so red at the designed assertion) and passes once the note sits under the old sentence and before the next `#` heading. That is a real lock.
- The test cannot tell a correct supersession from a wrong one. It checks the strings "run on Opus", "every grounder run on Sonnet" and the :1954 words. That is enough for a spec-notes lock, and it matches the form of the existing cases. Do not grow it.
- One edge: the (b) search uses "the first line after it that starts with `- Dated note 2026-11-22 (M-246, prior text kept; task-444`". If a future note on the same date for task-444 is added above it, the test would read that line. Not a risk now.

### rg#7 NIT: RR-0385 "no new gate work"
- Adding a describe block to an existing test file is a test, not a gate, and DoD #2 requires tests first. This does not break "gates already built stay, no new gate work". No new hook, field or tool is added.

What I checked and found true: that nothing is deleted; that the first sentences keep their meaning beside the notes; the existing tests that read the queue files; the lock proof at 08_agents.md:486; the queue-edit precedent (4b32de544 and earlier McFrontend queue commits); and the note form against Spec 137 rules 4 and 10 and the dated notes already in both files.

## What I could not verify
- I did not run the pre-commit, commit-msg or pre-push chain, the new test, or `vitest related`. Hook behaviour is from reading source.
- I did not run arm Q (`queueCheck`) or arm R (promises), so I cannot confirm they stay green with the added lines. I read their source only.
- I did not read the /dev/tty prompt path beyond `askTty()` at `gate.mjs:555-565`, and I cannot confirm what a lane's push does without a tty.
- Whether the `spec-split-check` byte budget for 69a has room. It is moot unless the operator wants the optional 69a note in rc#3.
- Whether the operator reads RR-0389 as covering the 69a register. That is his word to give.
- Memory files and `~/Buildo-scratch` content were read; I could not check anything outside this repo and the scratch folder, including the lane guard that 436's note says is outside the repo.

### Critical Files for Implementation
- /Users/brettpreston_macmini/Buildo-wt-board/.cursor/MCBYLAWS-QUEUE.md
- /Users/brettpreston_macmini/Buildo-wt-board/.cursor/MCFRONTEND-QUEUE.md
- /Users/brettpreston_macmini/Buildo-wt-board/src/tests/spec-notes-1b.logic.test.ts
- /Users/brettpreston_macmini/Buildo-wt-board/docs/specs/00-architecture/08_agents.md
- /Users/brettpreston_macmini/Buildo-wt-board/docs/specs/01-pipeline/69a_mcbylaw_register.md

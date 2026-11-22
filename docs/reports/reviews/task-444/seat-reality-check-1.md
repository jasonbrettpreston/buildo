# Seat: reality-check: task-444 plan
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

### rc#1 HIGH: the FACTS header is stale, and every 08_agents.md line number after 360 is now off by one
- Plan sentences: "FACTS (board head 693ef2a8a; task-436 has not landed: 08_agents.md has no AGENT-MODEL line)" and "After task-436 lands".
- Evidence:
  - `git log` shows 836b5722b is the fold of task-436, and the head is 3c84de845.
  - `08_agents.md:360` carries the note. `backlog-lane.mjs:11`, `:175` and `:232` carry the AGENT-MODEL line and the `MODEL_LINE`.
  - 436 added one line, so the cites after it moved. The plan's `:485` is now `:486` (the "BOTH directions" line). `:529` (the tool-seat rule, "run on the PLAN only, as Claude Sonnet agents") is now `:530`. `:526` ("(Sonnet seats, lane agents, ...)") is now `:527`.
  - `:359` (E2), `:35`, `:344` and `:344` as the §7 start are still right.
  - The task's own DoD cites are stale too: `:462` for "BOTH directions" is `:486`, `:490` for "Red tests first" is `:514`, and `:505` for "Every reply ends with one line" is `:531`.
- What goes wrong: a reviewer or the cite checker finds quotes off their cited line. Arm D tolerates plus or minus 10, so this is a drift, not a block. The plan also says its ORDER step is waiting on 436, which is already done.
- Smallest correction: change the header to "board head 3c84de845; task-436 landed 836b5722b, note confirmed at 08_agents.md:360". Update the cites above. Say the DoD cites are generated and stale, or leave them.

### rc#2 MED: the claim "no 69a row is dated 2026-11-2x (grep count 0)" is false
- Plan sentence: "no 69a row is dated 2026-11-2x (grep count 0). So decision-170 and decision-174 are the record, and the register gets no new row or note."
- Evidence: `grep -c "2026-11-2[0-9]" docs/specs/01-pipeline/69a_mcbylaw_register.md` gives 5, at lines 671 and 696-699 (the task-90 ST.N1 McStorage dated notes, 2026-11-20). `git log` on 69a shows three commits on 2026-11-20 (bc48872bf, d5b7ca8f4, b44c739d7). So 69a still receives M-246 dated notes after the move to `backlog/decisions`.
- What goes wrong: the premise for leaving 69a alone is wrong. The reason survives only on other grounds (see rc#3), and a reviewer who runs the grep will say the plan misread the repo.
- Smallest correction: delete the grep-count sentence and the "operator rulings go to backlog/decisions" argument. Keep the other reasons in rc#3.

### rc#3 MED: the 69a register gets no note, and the evidence for and against
- Plan sentence: "the register gets no new row or note"; M-506 holds "a multi-step build goes to the owning lane, on Sonnet".
- Facts at head:
  - `69a:654` (M-506) states the 2026-11-06 ruling as live "Rule text" ("a multi-step build goes to the owning lane, on Sonnet"), outside any quotation. Its "Text home" is "Spec 08 §7 rule 9 (dated note)", and its conflict check says "no conflict, the note is dated and the rule text stands".
  - `69a:653`, `:655` and `:656` hold "opus" only inside quoted chat text. The plan's sort is right.
  - `08_agents.md:359` is the E2 note that M-506 mirrors, and `:360` now says it is superseded for the building lane.
- For leaving it (the plan):
  - 69a "carries no rule of its own beyond the rows" (`69a:3-4`), and its live text home already has the note.
  - The pinned sentence at `chat-rulings-register.logic.test.ts:1731-1735` stays.
  - Editing 69a adds a fourth file on a 1.26 MB protected spec, adds a gate review, and adds to the Files line (the operator wants small, with no scope creep).
  - 436 ruled the same way for the E2 note by adding one note in the home and not in the register row.
- For adding a note:
  - RR-0389 says "updating the key specs and docs", and 69a is a spec.
  - 137_mcqueue.md Rule 4 says the ruling is written "into the row's status line the same day" in M-246 form, and Rule 10 says "A ruling enters a row as a verbatim dated note". M-506 is the row whose rule text now differs.
  - `69a:141` explicitly provides an in-cell dated note that "inserts no line", so no cite moves.
  - A reader who lands on M-506 sees "on Sonnet" for a multi-step build with no pointer.
- What goes wrong if left: a reader of the register alone is misled about the build seat. The risk is modest, because the register's own header tells the reader the status column is authoritative and 08_agents.md:360 names the supersession.
- Smallest correction: keep the plan's decision (no 69a note), but state the real reasons and mark it as an operator-visible choice. Offer one in-cell note on M-506 only as the alternative if the operator reads RR-0389 as covering the register. Do not add it silently. Do not touch the pinned "Rule text" substring, and append after the existing status text.

### rc#4 NIT: the quotes of the operator match MORNING-DECISIONS.md
- :1909 "Teh seat that writes the plan is opus and the seat that build is Opus" ✓.
- :1910 "Change this to Opus - approved by operator." ✓ (it is part of "3. Change this to Opus - approved by operator.").
- :1912 "keep the current split with opus and sonnet" ✓.
- :1917 holds RR-0385 item 1 ✓.
- :1954 "resolve this conflict by updating the key specs and docs" ✓, and :1955 says the rest is the orchestrator's pasted text ✓.
- decision-170 cites :1915 and decision-174 cites :1954 ✓.

### rc#5 LOW: "no tool reads packs/spec08.md" is slightly too strong
- Plan sentence: "No --check and no tool reads it".
- Evidence: `.claude/review-templates/README.md:136-146` documents `deepseek-review.js review <part> --context .claude/review-templates/packs/<pack>.md` as the way to give a compliance lens a pack. Lane lenses build from live specs (`rule-lists.json:45`, `agents-s7-s11`), so lane reviews are not affected.
- `packs/spec08.md` is already stale: its header says `:330-346`, and line 19 carries the E2 note (old) with no 436 note.
- Smallest correction: say "not read by the lane tools; only a manual README command reads it, and it is already behind (436 left it too)". Out of scope stays.

### rc#6 NIT: the AGREES and NOT A RULE sorts are all true
- Re-ran `grep -rniIE "sonnet|opus"` over `docs/specs`, `.cursor`, `.claude`, `CLAUDE.md`, `scripts` and `mcbylaws`.
- `137_mcqueue.md:152` and `packs/queue.md:110` ("A Sonnet lane is named for the check") agree: a read-only check lane is a seat.
- `.claude/agents/*.md:9-10` carry `model: sonnet`, and these are tool seats.
- `check-lane-close.mjs:583` is a comment.
- `08_agents.md:28` and `:35` hold the closed enum.
- `.cursor/MCBYLAWS-QUEUE.md:128`, `:492` and `:1000` (and `08_agents.md:530` and `:534`, `69a:653-656`) hold quoted operator words ("Another opus ?", "one Sonnet grounder"), not a rule. The plan did not list 128, 492 and 1000 by line, but they are in the same class, so no conflict was missed.
- `.cursor/active_task.md:43` and `wf1_spec08_deepseek_execution_active_task.md:23-24, :50, :104` are quotes and old evidence.
- No hit in `CLAUDE.md`, `.claude/workflows.md`, `scripts/CLAUDE.md` (the file does not exist), the review-template README files, the skills, `tasks/` or `backlog/docs` beyond a quote in doc-17:163.
- The new `backlog-lane.mjs` lines 11, 175 and 232 state the new rule.
- The phrase "hard design adjudication" appears only in the queue file, 08_agents.md, task-436, task-444 and decision-174.

What I checked and found true: each file:line cite in the plan against head (apart from the shifted ones), all operator quotes, `mcfrontend-status.infra.test.ts:59-60`, `gate.mjs:568-583`, `protected-paths.json:57 and :70`, `check-task-files.mjs:10`, `rule-lists.json:45`, the system-map input range, the Files-line resolve, and the grep sorts.

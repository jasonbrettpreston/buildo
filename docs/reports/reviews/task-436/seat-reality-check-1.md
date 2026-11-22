# Seat: reality-check: task-436 plan
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

### rc#1 MED: F2 is wrong, and the "control" it names does not pin Spec 08
- Plan sentence: "F2. A test pins the :359 text word for word: src/tests/chat-rulings-register.logic.test.ts:1733." and "The pin at chat-rulings-register.logic.test.ts:1733 is the control that the :359 text was kept."
- Evidence: chat-rulings-register.logic.test.ts:15 sets `const M = read('docs/specs/01-pipeline/69a_mcbylaw_register.md')`. The M-506 test at :1731-1735 asserts `toContain` on M. The sentence "a multi-step build goes to the owning lane, on Sonnet ..." also appears there, but that is the register copy.
  - grep for "multi-step build" finds only 08_agents.md, 69a_mcbylaw_register.md, the test and .claude/review-templates/packs/spec08.md. No test reads 08_agents.md:359.
- What would go wrong: no test guards "prior text kept" for the Spec 08 note. The plan's control is vacuous, though the dated-note edit is still safe because it only adds a line.
- Smallest correction: change F2 to say "the :1733 pin reads the register 69a, not Spec 08, so a note in 08_agents.md cannot affect it; nothing pins :359". Drop the "control" sentence, or keep only "text kept" as a review check.

### rc#2 MED: F7 is wrong that `.cursor/MCBYLAWS-QUEUE.md:247` does not conflict
- Plan sentence: "`.cursor/MCBYLAWS-QUEUE.md:247` ("Seats run on Sonnet by default") ... do not conflict." and "MCBYLAWS-QUEUE.md:247 and Spec 137:152 get no note (F7)."
- Evidence: MCBYLAWS-QUEUE.md:247 reads "Seats run on Sonnet by default. Opus only for hard design adjudication, with the reason logged. DeepSeek handles breadth and execution (08 §7 rule 9 ...)". The first sentence is about seats and fine. The second sentence says Opus only for hard design adjudication, which contradicts RR-0385's "the seat that writes a plan and the seat that builds run on Opus". 137_mcqueue.md:152 ("A Sonnet lane is named for the check ... read-only") is fine.
- What would go wrong: the operator-binding queue doc still tells a reader Opus is only for adjudication.
- Smallest correction: either add one sentence to the Spec 08 note ("this also supersedes the Opus-only-for-adjudication sentence at MCBYLAWS-QUEUE.md:247"), or one dated note at MCBYLAWS-QUEUE.md:247. The first adds no file.

### rc#3 NIT: two wrong line cites in BASIS
- Plan sentences: "The orchestrator's reading, :1925" and "Model notes: docs/specs/00_engineering_standards.md:308 and 08_agents.md:150."
- Evidence: MORNING-DECISIONS.md:1925 is item 9, "9. LABEL". The orchestrator-readings line is :1926. 00_engineering_standards.md:308 is a note about RR-0382 / task-435 (React libraries). 08_agents.md:150 is the TKT note of 2026-11-06. Neither is a model note.
- What would go wrong: a reader chasing the cites finds other text.
- Smallest correction: write :1926; drop the "Model notes" cite.

Verified true: F1 (:359 text, :526 phrase, :35 closed set `sonnet | opus | haiku | fable`; no other Sonnet or Opus statement in 08_agents.md except :28/:35/:359/:526/:529/:533). F3 (grep "sonnet|opus" in backlog-lane.mjs finds nothing; :11, :231 and :232 are as cited). F4 (test :117 anchors with `$`, :176 asserts last line; lane-guard.mjs:56 regex as quoted). F5 (brief.mjs prints `s.extra`; :208 and :220-224 as cited). F6 (lane-guard.mjs:11 and :50-51). F7 seat files: .claude/agents/*.md all `model: sonnet`. rule-lists.json:22 lists protected_paths and does not include backlog-lane.mjs. decision-170 exists. Operator quotes at :1909 (a), :1910 (b), :1912 (d), :1917 and :1522 are exact. The DoD drift note is right (:485 and :513). Plan-writing seat: no model enforceable or printed anywhere; the plan says so. Launch paths: backlog-lane.mjs :231 and :232 are the only two print sites for BRIEF-FILE, and refusals exit before them. The note's claims are true: it supersedes "on Sonnet" for the building lane and keeps the prior text; A1 allows sonnet or opus on any non-fork call; "Not enforced" is accurate.

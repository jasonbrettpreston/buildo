# Seat: reality-check: task-437 plan
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

### rc#1 MED: the note says the fold check sits "at the plan" and a "round-2 GROUNDER.md" at the output, and the code does not match
- Plan sentence: "After round 2 the separate grounder validates the fold (FOLD-CHECK.md at the plan, its round-2 GROUNDER.md at the output)".
- Evidence:
  - `FOLD-CHECK.md` is required at every launch, after any round: `check-lane-close.mjs:679-698` needs "Checked by:", "Verdict: PASS" and the last "Plan:" hash. It is not tied to round 2.
  - The output side reads exactly one `GROUNDER.md` (`check-lane-close.mjs:566-568`). I found no "round-2 GROUNDER.md" file name. The files named `GROUNDER-2.md`, `GROUNDER-FIXCHECK.md` and `GROUNDER-PANEL2.md` under `docs/reports` are one-off names the gate never reads.
  - In Spec 08 "round-2" already means the grounder pass (`08_agents.md:225` "5.3 Round-2 adjudication"; :348 "Round-2 always"). RR-0385's "round 2" is the second review round, so the note puts two meanings of the same word side by side.
  - GROUNDED-CAPS.md item 9 says "The fold check is not a review round ... the cap text must say so". The note does not.
- What would go wrong: a lane or grounder looks for a round-2 grounder file the gate does not read. A reader counts the fold check as a third round.
- Smallest correction: write "(plan: FOLD-CHECK.md, which the launch gate requires after the fold; output: the separate grounder's GROUNDER.md for the fix round; neither is a review round)". Write "second review round" where RR-0385's round 2 is meant.

### rc#2 MED: the "Not enforced" sentence understates what the check accepts
- Plan sentence: "`scripts/hooks/check-lane-close.mjs` counts "Review round N" lines without a bound and accepts any recorded ruling id for a MED."
- Evidence:
  - I drove `outcomeErrors` in memory. `ruling:RR-0385` with `decisionExists` true passes for MED, HIGH and CRITICAL, in close and plan mode (see ig#4).
  - Task-430's launch gate did pass. `docs/reports/reviews/task-430/TRIAGE-PLAN.md` holds 7 `ruling:RR-0385` lines. The grounder file marks all 7 MED. The task page says "Plan review round 1: 134 folded, 0 task, 7 ruling, 0 wontfix, 10 pile" (line 316). So the 7 are round-1 MEDs, not round 2 as the briefing said. RR-0385 item 3 says round 1 fixes MEDs, so the hole is already used against the ruling.
- What would go wrong: the note says the form is for round 2 and implies the check enforces that. It does not.
- Smallest correction: the one sentence in ig#4, plus "task-430 recorded seven round-1 MEDs this way".

### rc#3 LOW: F5 is wrong about three tasks
- Plan sentence: "task-375, task-418 and task-423 hold "Plan review round 2"."
- Evidence: a grep of the three task files finds "Plan review round 1:" five times and no "Plan review round 2:" line. Only task-423 line 308 mentions "Plan review round 2" in prose ("Plan review round 2 of this task (a re-run of two lists ...)"). Tasks 375 and 418 hold no such text. The rest of F5 is true: `rule-lists.mjs:640` and `:737` do refuse a second round.
- What would go wrong: nothing in the build. The fact is false as written.
- Smallest correction: "task-423 records a plan round 2 as a prose note (line 308); no task holds a second round line".

### rc#4 NIT: small line-number slips
- `decisionExists` is defined at `check-lane-close.mjs:302` and called at :257, not ":305".
- The reading "the new rounds apply from the landing" is at MORNING-DECISIONS.md:1926, not ":1925" (:1925 is item 9).
- "Build with existing components" (:1522) is not a quote at that line. :1522 reads "you are probaley rebuilding stuff that already exists". Remove the quotation marks or quote the real words.
- The M-246 model file is `docs/specs/00_engineering_standards.md:308`, not under `00-architecture/`.

Checked and true:
- **Facts:**
  - F1: `FORM_WORDS` at :148, `allowed` at :194, and the refusal for MED at :205 (the refusal text names pile and wontfix).
  - F3: LOW and NIT with `pile` pass in plan mode (driven).
  - F4: `n = 1 + ...` at :272 and the plan rounds at :662 have no bound.
  - F6: `max_fix_rounds: 2` at `backlog-brief.mjs:174`, and the "r2, r3, ..." text at `backlog-lane.mjs:185`.
  - F7: the lane's grounder text is at :186. I could not check that the orchestrator writes the grounder brief outside the repo.
  - F8: no RR-0369 or RR-0371 text in `08_agents.md`, and the forms are stated at :354-355.
- **Driven results:** MED with `ruling:RR-0385` passes (control). It is refused when `decisionExists` is false. MED with pile is refused in both modes. LOW with pile passes in both modes. NIT with wontfix passes in both modes. So "today's code refuses none of the ruled behaviour" is true.
- **Quotes:** I compared the quotes at :1909, :1910, :1912 and :1919 against the file programmatically and they are exact. The :1920 text is a faithful paraphrase. RR-0369 (:1782) and its reading (3) (:1783) are as cited. RR-0371 (:1798-1807) matches too.
- **Decision file:** `decision-170` exists, and its basename contains "RR-0385".

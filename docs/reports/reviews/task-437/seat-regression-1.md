# Seat: regression: task-437 plan
Saved by: the orchestrator, from the seat's hand-back message, verbatim. The seat ran as a read-only agent and would not write files; no word of the findings below is the orchestrator's.

### rg#1 MED: the brief and note drop the RR-0369 trigger for round 2
- Plan sentence: "round 2 resolves CRITICAL and HIGH only; two rounds at most" and "keeps RR-0369".
- Evidence: MORNING-DECISIONS.md:1783 gives the orchestrator's readings of RR-0369: "(2) a second review round happens only when round 1 confirmed a critical or high (RR-0363); when round 1 confirmed only mediums, they are fixed and the grounder verifies the fixes, with no second review". RR-0385 item 3 does not repeat reading (2), and neither the note nor the brief does. GROUNDED-CAPS.md item 6 records why: round 3 of task-375 ruled 435 findings, none above LOW.
- What would go wrong: the brief now says "round 2" without its trigger. Lanes run a second review after every round 1, which is the churn RR-0369 (2) stopped. The note says "keeps RR-0369" while omitting part of it.
- Smallest correction: add to both texts "a round 2 happens only when round 1 confirmed a CRITICAL or HIGH; otherwise the fixes are verified by the grounder, as RR-0369 reading (2)". If that reading is not meant to carry over, say so in the note.

### rg#2 MED: the class ruling `ruling:RR-0385` loses the reason and the tracking RR-0369 asked for
- Plan sentence: "A MED confirmed in round 2 is recorded with the outcome line `<id> ruling:RR-0385`".
- Evidence:
  - RR-0369 reading (3) (:1783) says round-2 MEDs "are recorded with a reason, not fixed".
  - The operator ordered later-round MEDs tracked and judged for significance (MORNING-DECISIONS.md:1792). The table for that is `retro/MEDIUM-LATER-ROUNDS.md`.
  - The `ruling` form takes no reason (`check-lane-close.mjs:252-258`). The `pile` form takes a 30+ character reason, but pile is refused for MED (:205).
  - The refusal for MED comes from rule 6 ("a BUG is fixed before Green Light") as the 2026-11-20 task-399 note at `08_agents.md:354` explains. It does not come from the operator's :1580 words, which cover LOW only. Pile for LOW rests on :1580.
- What would go wrong: each round-2 MED is closed with a line that gives no reason, so reading (3) is dropped without being named. The note does not say where the significance record goes.
- Smallest correction: the note says "the reason goes in the grounder's verdict line for that id (the reason field), and the orchestrator adds the row to MEDIUM-LATER-ROUNDS.md". State that this narrows reading (3) to the form the code accepts. Name option B (pile for MED in round 2) as the alternative that keeps a reason in the form.

### rg#3 LOW: the note replaces RR-0371's caps but does not say what stays
- Plan sentence: "This supersedes the round caps of RR-0371 (two plan rounds then the operator; three output rounds)".
- Evidence:
  - Reading (3) of RR-0371 (:1806) keeps what each output round fixes as RR-0369 sets it.
  - GROUNDED-CAPS.md item 9 says the fold check is not a review round.
  - GROUNDED-CAPS.md item 13(a) says that at the cap the task goes to the operator. The note keeps that as (i).
  - `decision-154` and `decision-156` are not marked superseded, and `decision-156` says its dated note is on task-414. Task-414 is LATER and still carries RR-0371's caps in a dated note.
  - `decision-170` names only task-427.
- What would go wrong: a reader of task-414 or decision-156 finds the old caps with no pointer to RR-0385.
- Smallest correction: one sentence in the note, "task-414's note of RR-0371 is superseded by this note". Add a "supersedes the caps of decision-156" line in the closing records if that is the usual practice.

### rg#4 LOW: T2 is "green on today's code by design" and needs wording, and it partly repeats existing tests
- Plan sentence: "Proven in both directions (08_agents.md:485). T2 is green on today's code by design".
- Evidence:
  - `08_agents.md:485`: "Every lock is proven in BOTH directions (fails on the old shape, passes on the new) before red is claimed — a lock that was never red against the defect it names is not a lock ... Survive-the-fix locks (green-both) are stated as such per case."
  - So a lock green from the start is allowed, but only if it is stated as a survive-the-fix (green-both) lock per case.
  - "Planted defect" is the wrong term. Refusing a MED pile is current behaviour, not a defect.
  - Existing tests already cover most of it in close mode: `check-lane-close.logic.test.ts:699` (ruling:RR-9999 has no decision record) and :702-707 (pile refused on HIGH, passes on LOW). The new parts are the MED severity, plan mode, and the RR-0385 control.
- What would go wrong: a reviewer applies :485, finds a lock that was never red, and refuses it. Or the lane writes a duplicate test.
- Smallest correction: reword T2 as "survive-the-fix (green-both) lock, stated as such per :485; both directions are inside the test (control passes, the refused form is refused)". Keep only the MED, plan-mode and RR-0385 cases that :699 and :702-707 do not cover.

### rg#5 NIT: round 2 at the plan is hand work and the note says only "two rounds at most"
- Evidence: `rule-lists.mjs:640` allows one review round per prep run and :737 refuses a second round line. A plan round 2 needs hand entry, as the plan's own F5 says.
- Smallest correction: add one clause to the "Not enforced" sentence, "plan-prep and post support one round; a second plan round line is entered by hand".

I could not verify these:
- who writes `TRIAGE.md` and the grounder brief (the orchestrator's text lives outside the repo);
- whether any running lane has an `agents-s7-s11` input newer than the head (the 436 note had not landed when I read);
- the effect of the edit on the page, which I inferred from the size column and commit f5ca453ff because I could not write;
- whether any test compares the review-template Spec 08 pack with `08_agents.md`.

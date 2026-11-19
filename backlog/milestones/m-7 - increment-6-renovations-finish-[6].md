---
id: m-7
title: "Increment 6: renovations finish [6]"
---

## Description

Increment 6: renovations finish

## Problems
- 80,682 addon_cand rows stored, never shown (~/Buildo-scratch/plan-gen/out/finalplan.json:16846) "80,682 addon_cand rows stored, never shown"

## Project objectives
- Objective: finish a completed project, a database that works and is ready (operator 2026-11-17) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:652) "our objective is to finish a completed project ie a database that works and is ready"
- The database exists to service the designed report, details and search page (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:635) "the database is created to service the existing report and details as clairfied in the McFrontend. This includes the search page"
- A task that serves neither a designed element nor a supporting function is most likely not relevant (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:635) "If the ultimate numbers are not servicing this... or a supporting function the task most likely is not relevant or feeds old code"
- Five principles, keep it simple, no scope creep (~/Buildo-scratch/panel-tools/PLAN-PROTOCOL.md:3) "standardization, observability, scalability, accuracy, understandability; keep it simple; no scope creep"
- One plan only (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:652) "we need one plan - we can only execute one plan"

## Increment objectives
- Increment 6 adds renovations (addition, interior, basement) (origin:.cursor/MCBYLAWS-QUEUE.md:92) "Renovations (addition, interior, basement)"
- What the customer sees: renovation cards RA, RE, RI, RB, RF with no CoA block (~/Buildo-scratch/lanes-20261117/req-elements/elements-by-inc.json:2489) "Renovations RA, RE, RI, RB, RF (future cards; no CoA block by design)"
- Renovation ids: RA, RE, RI, RB, RF, UB (~/Buildo-scratch/lanes-20261117/replan/SCENARIO-SLICES.md:18) "renovations (RA, RE, RI, RB, RF, UB)"
- Renovation rows are computed on demand when the owner enters the house (ST-4) (~/Buildo-scratch/mcbylaws/McSTORAGE-RULINGS.md:112) "When the owner enters the house, the rows are computed on demand by the same pure core"

## Deliverable
- Done means the scenario works for a customer on a real lot on the real page (~/Buildo-scratch/panel-tools/PLAN-PROTOCOL.md:11) "An increment is done only when, on a real lot on the real page"
- The nine parts: engine rows, storage as ruled, page section and binding, display text, public route, cost line, CoA per option, search hand-off, measured check (~/Buildo-scratch/panel-tools/PLAN-PROTOCOL.md:11) "(1) engine rows right (answer key); (2) stored as ruled"
- Measured population: the designed element is populated, counted on the admin/tester page (~/Buildo-scratch/lanes-20261117/replan/SCENARIO-SLICES.md:44) "P12 Measured population"
- Measurable check: 6.42: Part B full suite on the tip (about 11 min) (~/Buildo-scratch/plan-gen/out/finalplan.json:16751) "Part B full suite on the tip (about 11 min)"
- Measurable check: 6.43: Push 6: the Part B commit, operator tty (~/Buildo-scratch/plan-gen/out/finalplan.json:16767) "Push 6: the Part B commit, operator tty"
- Problem closed at the end of this group: 80,682 addon_cand rows stored, never shown (~/Buildo-scratch/plan-gen/out/finalplan.json:16846) "80,682 addon_cand rows stored, never shown"

## Specs
- Spec 08 agents (11.8 McIncrement recipe, 11.9 ticket header): origin:docs/specs/00-architecture/08_agents.md (process every increment follows)
- Spec 137 McQueue (status line, rules 1-12): origin:docs/specs/00-architecture/137_mcqueue.md (where each task lives and how its status is kept)
- Spec 122 pipeline step optimization: origin:docs/specs/01-pipeline/122_pipeline_step_optimization.md (step standard (Airtight V3))
- Spec 124 step standard policy and 124a appendix (Airtight V3 register rows): origin:docs/specs/01-pipeline/124_step_standard_policy.md (register rules every step change meets)
- Spec 132 step standard handbook: origin:docs/specs/01-pipeline/132_step_standard_handbook.md (the Airtight V3 handbook)
- Spec 133 by-law handbook: origin:docs/specs/01-pipeline/133_bylaw_handbook.md (by-law step rules)
- PROTOCOL.md research and build protocol: ~/Buildo-scratch/panel-tools/PROTOCOL.md (lenses 1-9, design fit, operating rules)
- PLAN-PROTOCOL.md scenario slices (done-definition, the 9 parts): ~/Buildo-scratch/panel-tools/PLAN-PROTOCOL.md (what done means for an increment)
- McSTORAGE-RULINGS.md (ST-1..ST-8): ~/Buildo-scratch/mcbylaws/McSTORAGE-RULINGS.md (storage rulings)
- SCENARIO-SLICES.md (section 0a re-cut, 0c checklist): ~/Buildo-scratch/lanes-20261117/replan/SCENARIO-SLICES.md (the nine slice parts per scenario)
- MORNING-DECISIONS.md: ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md (operator rulings, newest at the bottom)
- ONE-SITTING.md (open questions, numbered): ~/Buildo-scratch/lanes-20261117/inc-plan/integrate/ONE-SITTING.md (every open ruling)
- Spec 131 lot configuration policy (LC rules): origin:docs/specs/01-pipeline/131_lot_configuration_policy.md (CoA and renovation status rules)
- Spec 78 optimal lot configuration: origin:docs/specs/01-pipeline/78_optimal_lot_configuration.md (building-type rules and report fields)
- Spec 88 parcel cost model: origin:docs/specs/01-pipeline/88_parcel_cost_model.md (cost lines)
- req-rulings/CHANGES.md (report element rulings after the brief): ~/Buildo-scratch/lanes-20261117/req-rulings/CHANGES.md (later rulings win over the brief)
- elements-by-inc.json (per-scenario report element list): ~/Buildo-scratch/lanes-20261117/req-elements/elements-by-inc.json (what the customer must see)
- Report Theme B · Daylight model (latest drawn mock; local report-themes/pub/B.html): https://claude.ai/artifact/LRAd9sbNHxyoDWhBcyZpyJ (latest drawn report; the current report = this mock + later rulings, base confirmed by the operator 2026-11-18)
- inc-plan/6 (review, sitting, push contents): ~/Buildo-scratch/lanes-20261117/inc-plan/6/SITTING.md (the increment plan reviewed under the protocol)
- mcbylaws inc6 DECISIONS-v2: ~/Buildo-scratch/mcbylaws/inc6/DECISIONS-v2.md (increment 6 decisions)
- optimize-6 DECISIONS-6.md: ~/Buildo-scratch/lanes-20261117/optimize-6/DECISIONS-6.md (increment 6 sitting)

## Rulings
- Increment order is 7 semi, 8 sixplex, 9 merged measure, 10 McProof (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:342) "7 is semit detached 8 is sixplex and 9 merger and 10 is McProof"
- Launch means users on the live customer report, not tester preview (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:568) "LAUNCH = users on the live report"
- McStorage ST-1..ST-8 approved as ruled (headline record per lot and option; detail on demand) (~/Buildo-scratch/mcbylaws/McSTORAGE-RULINGS.md:5) "ST- all y"
- Colour ruling D-1 (2026-11-14): the built report must look like the Daylight B mock; this is a colour ruling, not a whole-layout approval (~/Buildo-scratch/mcfrontend/MF-83/plan.md:219) "the built report must look like the Daylight B mock"
- Earlier approval: dark mock v21 (2026-11-10); superseded for colour, summary, gallery, lot views and See details sheets by the later theme and rulings (~/Buildo-scratch/mcfrontend/phase1/open-questions.md:866) "2026-11-10 mock v21: APPROVED (operator, verbatim)"
- Theme ruled: Daylight B (light) with the summary at the top (~/Buildo-scratch/mcfrontend/phase1/open-questions.md:1094) "RULING: report theme = B Daylight model (with the options-at-a-glance summary)"
- Report base confirmed by the operator: the published Report Theme B · Daylight model + the later rulings (CHANGES.md); identity of the published page vs pub/B.html being checked (REPORT-DELTA) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:665) "I have the artifact Report Theme b - Daylight  model"
- All 59 increment 6 recommendations approved (2026-11-17) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:623) "APPROVED: all 59 increment 6 recommendations as resolved"
- The D7 recapture runs once, on the test stack; no dev run (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:602) "INC6-RECAP (D7) runs once, on the test stack"
- Renovation card carries the lawfully existing owner question (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:469) "owner question reuses lawfully_existing_status on the renovation card"
- No per-card Improve accuracy button on renovation cards (~/Buildo-scratch/mcfrontend/phase1/open-questions.md:805) "Add lot size and every option is recalculated"
- Open question 15 (ONE-SITTING.md): Renovation (gap Q6, inc 6 R2, R3): add the two dated notes naming RE and RF on the increments table row 6 and on LC-16, (~/Buildo-scratch/lanes-20261117/inc-plan/integrate/ONE-SITTING.md:25) "Renovation (gap Q6, inc 6 R2, R3): add the two dated notes naming RE and RF on the increments table row 6 and on LC-16,"
- Open question 22 (ONE-SITTING.md): Renovation cost line (inc 6 R1, R6-COST; also the semi page 7.25): (a) priced inside the on-demand one-lot path; (b) pri (~/Buildo-scratch/lanes-20261117/inc-plan/integrate/ONE-SITTING.md:37) "Renovation cost line (inc 6 R1, R6-COST; also the semi page 7.25): (a) priced inside the on-demand one-lot path; (b) pri"
- Open question 3 (ONE-SITTING.md): Storage (ST-4, ST-5, ST-6): keep as ruled and record the three corrected-fact notes after push 6? y / change. (~/Buildo-scratch/lanes-20261117/inc-plan/integrate/ONE-SITTING.md:13) "Storage (ST-4, ST-5, ST-6): keep as ruled and record the three corrected-fact notes after push 6? y / change."

## Storage set-up
- McStorage policy v2: a lot's numbers (main page and See details) are computed on first open from the search page (behind the 35 s loading screen), on track, or on owner input; stored with the stamp (Layer 2 table_version, evaluator_version, settings sha); a stale record is never served and is recomputed; no record for unopened lots; no all-lot fill (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:704; ~/Buildo-scratch/lanes-20261117/storage-policy/McSTORAGE-POLICY-v2.md) "undefined"
- Renovation rows exist only where the owner has entered the house (ST-4); on entry they are computed and stored with the stamp for that lot; no screen covers it, the card shows "updating" (~/Buildo-scratch/mcbylaws/McSTORAGE-RULINGS.md:112) "undefined"
- ST-4 AMENDED (owner input is the third trigger, stored with stamp) (~/Buildo-scratch/mcbylaws/McSTORAGE-RULINGS.md:105) "undefined"
- ST-5 AMENDED 2026-11-18 (store on first open; prior text kept, superseded where it conflicts) (~/Buildo-scratch/mcbylaws/McSTORAGE-RULINGS.md:126) "undefined"

## Register rulings of this group (operator words)
- RR-0012 2026-11-15: Increment order is 7 semi, 8 sixplex, 9 merged measure, 10 McProof (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:342) "7 is semit detached 8 is sixplex and 9 merger and 10 is McProof"
- RR-0014 undated: McStorage ST-1..ST-8 approved as ruled (headline record per lot and option; detail on demand) (~/Buildo-scratch/mcbylaws/McSTORAGE-RULINGS.md:5) "ST- all y"
- RR-0137 2026-11-18: For increments 1b-10: all tasks present to fulfil each increment's objectives and deliverables (rulings most relevant, McStorage policy, compliance, project objectives; ensure relevancy); tasks optimised holistically, then within each increment, updated in the plan (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:729) "ensure all tasks are present to fufill the increments objectives and deliverables"
- RR-0143 2026-11-18: Concept photo lot-size bands: six bands, under 1000 sq ft, 1000-2000, 2000-3000, 3000-4000, 4000-5000, 5000+ (operator answer IMG-1 b; replaces the three-band rule) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "IMG-1 b, note: "Under 1000 sq ft 1000-2000,2000-3000,3000-4000, 4000-5000, 5000+""
- RR-0144 2026-11-18: Stored lot records are purged after 90 days unopened (operator answer PRG-1 a); tracked lots are never purged while tracked (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "PRG-1 a (purge after 90 days unopened)"
- RR-0145 2026-11-18: Tracked lots are refreshed in the background when the stamp moves (operator answer TRK-1 a) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "TRK-1 a (background refresh of tracked lots when the stamp moves)"
- RR-0154 2026-11-18: When a task completes the next ready task starts at once; a task blocked on an operator question goes to the answer page and work moves to the next unblocked task; nothing waits idle. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:754) "it should pull the next task as something completes or move to the next task if a question remains"
- RR-0156 2026-11-18: Push 6 C5: the rewritten INC-6 C2a literal test (the exception expired as planned by the 2026-11-16 note) stands. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:760) "Confirm (Recommended)"
- RR-0157 2026-11-18: Push 6: the R-MD rule-map entry and lock file are decided by a panel. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:758) "Panel decides"
- RR-0159 2026-11-18: Push 6: the plain-recapture question (R-CZ #38) goes to the R-MD panel. Increment 1·A panel scope: only tasks that change shape; tasks that only move get a home check, no content re-review. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:764) "y - what a mess - why is the panel revisting every task"
- RR-0169 2026-11-18: Renovation cost line: priced only for owner-entered lots (owner rows exist only on input, ST-4) (ONE-22 b) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-22 b"
- RR-0174 2026-11-18: Loading screen: the animation always runs its full set length (report_check_min_ms = 35,000 ms, default and maximum); the button to open the report shows when the lot's numbers are ready, at any time after the animation completes. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:779) "the animation still needs to be complete.. the button shows when its ready - anytime after the animation completes"
- RR-0176 2026-11-18: Loading screen: the animation keeps its own length (23 s today, may change later) and always runs to completion; the button to open the report shows only when the report AND See details are loaded, however long that takes (no 35 s cap); the 35,000 ms setting change (LOAD.3) is not needed now. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:785) "yes that is correct"
- RR-0186 2026-11-18: Increment-6 protection rules 1, 3, 7 and 9 are closed (D7 done); suites and pushes only through the push station and the operator; DB jobs only on the operator typed GO; rules 2, 4, 5, 6, 8, 10, 11 stay until push 6 lands. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:805) "y and your not following the McQueue rules"
- RR-0188 2026-11-18: Push 6: the renovation step golden is re-captured on the test stack with a nonzero recipe (env, or bracket if env is impossible) so R-DK #38 passes with no rule change; rehearsed with the real hooks; R-MD fixed in C6 like sibling R-LR. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:809) "a"
- RR-0190 2026-11-18: Lane launches need an authorized plan for any repo worktree they write; every register row is marked operator words or orchestrator reading and only operator words feed reviews as rulings; orchestrator replies that recommend or name a ruling must cite file:line, an RR id or UNVERIFIED (enforced by hooks). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:813) "close the gap.  fix teh register"
- RR-0192 2026-11-18: Questions come to the operator only on database structure, the frontend, the user experience and storage; everything else is decided under the six-criteria rule, reviewed and logged as a McRecommendation card for audit. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:819) "I dont provide oversight on questions beyond the databse strcuture, the frontend the user experience and storage"
- RR-0193 2026-11-18: McRecommendations: every recommendation is a card in the repo decision log with customer / UX / space / DB-logic framing, options, rulings (operator words only), sources, research kept separate from the recommendation status (judgment only, reviewed, proven), five principles, what it serves, computed confidence and outcome. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:817) "the recommendation should be framed with an explanation that speaks to what I know"
- RR-0195 2026-11-18: Push the ready Increment 1·A commits (CHK.5, CHK.3) through the push station now, overriding inc6-guard rule 2 for them; push 6 rebases on top later. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:823) "Push them.  We need to make some progress"
- RR-0196 2026-11-18: CHK.5 and CHK.3 are not pushed before push 6; inc6-guard rule 2 stands (origin moves only by push 6); the CHK commits go right after push 6. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:825) "dont do itl... if its going to make another mess"
- RR-0198 2026-11-18: Push 6: R-DK #38 accepts a rewrite-in-place capture recorded plain when its POST carries rerun_proof PASS and a recorded count of rows rewritten above zero (net-new.mjs change + dated rule note); the R-MD row becomes a dated note. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:829) "y"
- RR-0202 2026-11-18: The increment plan moves into the repo queue rows (Spec 137); the Backlog board generated from them is the working board, showing per task its increment, decisions and research (review/run) IDs. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:837) "I need to be able to see the board and the categories and the decisions and the research ids for each"
- RR-0203 2026-11-18: The move of the increment plan into the repo queues is done by a committed generator with --check, from a committed raw snapshot; nothing hand-copied. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:839) "use a generator"
- RR-0205 2026-11-18: The increment plan lives in Backlog.md in the repo (milestones = increments, assignees = lanes, priority/ordinal, dependencies, decision and research refs per task); the operator organises on the board; queue rows stay and are linked by id; loaded once by an import script. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:843) "yes of course"
- RR-0207 2026-11-19: Backlog: every feature is used; each increment's objectives, rulings, citations and storage objectives move over; the existing process (handbooks, Spec 08) is carried over; process documents are updated; the move is structured so the system is actually used. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:847) "Make sure opus actually uses the system"
- RR-0208 2026-11-19: The board data exists in the artifact and the procedures in Spec 08; the failure is scratch work, made-up responses and wrong reviewer context; hence the gates and full Backlog use. Each new gate is assessed as necessary or not, with how to do it right. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:848) "determine if the new gates etc are necessary and how to do this right"
- RR-0210 2026-11-19: The lane policy is named McLane in the Spec 08 and Spec 137 dated notes of the Backlog-home plan; McDecision is not adopted. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:852) "Let's stick with McLane for a name."
- RR-0212 2026-11-19: The Backlog-home plan is the loader plus the three enforcement pieces, with Backlog's own browser as the board; the v7 board job, mirror synchroniser, import verifier and structural gate are dropped (simple, no scope creep). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:867) "we needd the loader and the three gates"
- RR-0217 2026-11-19: Concept photo gallery: three concept photos per scenario, each a different idea; options 1 and 2 add the 1,500 / 3,000 / 5,000 sq ft sizes. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:861) "we need three each"
- RR-0219 2026-11-19: Backlog-home plan v8 is authorized (PLAN LOCKED): loader + three gates + Backlog's browser; D1-D5, D7-D10 as recommended; every relevant spec note lands; every imported task carries all available information; the 1·A tasks are updated or removed against the plan through the panel. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:871) "approved. ensure that all the relevant specs are updated and all the increment tasks with all the new information that can be given to the tasks"

## Compliance codes in use
- PAN: Panel lenses on every plan item: compliance, grounding, reality, options, regression, integration, surrounding work, then final check (~/Buildo-scratch/panel-tools/PROTOCOL.md:9)
- FIVE: Five principles: standardization, observability, scalability, accuracy, understandability; keep it simple; no scope creep (~/Buildo-scratch/panel-tools/PLAN-PROTOCOL.md:3)
- SC: Simplicity guard: a task is added only if it fills one of the nine slice parts or one supporting function, with a source (~/Buildo-scratch/panel-tools/PLAN-PROTOCOL.md:25)
- STAT: One status line per row, replaced in the same commit as the work (Spec 137 rules 1 and 3) (origin:docs/specs/00-architecture/137_mcqueue.md:45)
- DN: A ruling enters its row as a verbatim dated note, prior text kept (M-246; Spec 137 rule 10) (origin:docs/specs/00-architecture/137_mcqueue.md:109)
- REN: Relay check: a claim that nothing covers it is checked by a grep of the full record and the search is quoted (~/Buildo-scratch/panel-tools/PROTOCOL.md:48)
- FIT: Design-fit gate: every stored or built value maps to a designed McFrontend element or a named supporting function; every designed number bound, served, populated (~/Buildo-scratch/panel-tools/PROTOCOL.md:25)
- AV3: McDonald's Airtight V3: the step standard (Spec 122/124/132 path); no exception paths; calcs as data, switches, tests first (origin:docs/specs/01-pipeline/124_step_standard_policy.md:250)
- BLD: Build on the tip: red tests first, then code, through the real hooks (MCINC-4) (origin:docs/specs/00-architecture/08_agents.md:490)
- BYL: McBylaws process: by-law step conversion; queue row first; no code names a zone, scenario or regulation id (M-61) (origin:.cursor/MCBYLAWS-QUEUE.md:100)
- STO: McStorage rulings ST-1..ST-8: headline record per (parcel, option); detail on demand; long form for bounded cohorts only (~/Buildo-scratch/mcbylaws/McSTORAGE-RULINGS.md:130)
- HS: Hooks plus the full suite on the current origin tip before anything is called ready (MCINC-4) (origin:docs/specs/00-architecture/08_agents.md:490)
- RH: Rehearse every DB job on the local test stack, with the real hooks, before the go (MCINC-7; Spec 137 rule 9) (origin:docs/specs/00-architecture/08_agents.md:495)
- GO: Operator-typed GO on dev, one DB job at a time (~/Buildo-scratch/lanes-20261117/inc-plan/integrate/ONE-SITTING.md:84)
- ID: Claim every MF, FE, MB, migration, prereg round, D and M number in the ID ledger before use (MCINC-8) (origin:docs/specs/00-architecture/08_agents.md:496)
- MCP: McProof: scope and answer key first, hand-derived from the by-law text; disputed items walked one at a time (Spec 08 11.8 MCINC-1) (origin:docs/specs/00-architecture/08_agents.md:486)
- DDV: Data-driven validation: test readings against permits, CoA and past research before asking the operator (operator 2026-10-31) (~/.claude/projects/-Users-brettpreston-macmini/memory/data-driven-bylaw-validation.md:3)
- RDG: Every reading we made ourselves carries a confidence and an evidence pointer (M-481) (origin:docs/specs/01-pipeline/69a_mcbylaw_register.md:624)
- PUSH: Pushes are the operator only: own terminal y, one y and one suite per push; one push per landing set (~/Buildo-scratch/lanes-20261117/inc-plan/integrate/ONE-SITTING.md:83)
- MAP: McIncrement impact map measured on the current origin tip (MCINC-2) and one decision list (MCINC-3) (origin:docs/specs/00-architecture/08_agents.md:487)

## Documents
- Requirements: backlog/docs/increments/doc-8 - Increment-6-requirements.md
- McFrontend elements: the Elements section of that doc (backlog/docs/increments/doc-8 - Increment-6-requirements.md#L20) and docs/reports/plan-import/raw/2026-11-19/elements-by-inc.json#6
- McStorage policy for this increment: backlog/docs/doc-16 - McStorage-policy-v2.md#L113-L113 and docs/reports/plan-import/raw/2026-11-19/storage-by-group.json#6

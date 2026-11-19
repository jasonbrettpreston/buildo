---
id: m-8
title: "Increment 6c: owner inputs [6c]"
---

## Description

Increment 6c: owner inputs

## Problems
- All-lot headline fill not built (MB-38); the 1,921 lots are the test cohort by design (~/Buildo-scratch/plan-gen/out/finalplan.json:20736) "All-lot headline fill not built (MB-38); the 1,921 lots are the test cohort by design"
- Display-text registry empty, so the renderer throws (~/Buildo-scratch/plan-gen/out/finalplan.json:20743) "Display-text registry empty, so the renderer throws"
- 80,682 addon_cand rows stored, never shown (~/Buildo-scratch/plan-gen/out/finalplan.json:20749) "80,682 addon_cand rows stored, never shown"
- CoA: no owner, no catalogue rows (~/Buildo-scratch/plan-gen/out/finalplan.json:20755) "CoA: no owner, no catalogue rows"
- Cost lines exist for only 5 scenarios (~/Buildo-scratch/plan-gen/out/finalplan.json:20761) "Cost lines exist for only 5 scenarios"

## Project objectives
- Objective: finish a completed project, a database that works and is ready (operator 2026-11-17) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:652) "our objective is to finish a completed project ie a database that works and is ready"
- The database exists to service the designed report, details and search page (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:635) "the database is created to service the existing report and details as clairfied in the McFrontend. This includes the search page"
- A task that serves neither a designed element nor a supporting function is most likely not relevant (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:635) "If the ultimate numbers are not servicing this... or a supporting function the task most likely is not relevant or feeds old code"
- Five principles, keep it simple, no scope creep (~/Buildo-scratch/panel-tools/PLAN-PROTOCOL.md:3) "standardization, observability, scalability, accuracy, understandability; keep it simple; no scope creep"
- One plan only (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:652) "we need one plan - we can only execute one plan"

## Increment objectives
- Owner-input one-lot re-evaluation is the 6c work (MB-89, MB-42, MB-96) (~/Buildo-scratch/lanes-20261117/replan/SCENARIO-SLICES.md:27) "Owner-input one-lot re-evaluation (renovation, semi): MB-89 / INC-6c"
- ST-4: rows computed on demand when the owner enters the house; none stored for a lot without that input (~/Buildo-scratch/mcbylaws/McSTORAGE-RULINGS.md:112) "When the owner enters the house, the rows are computed on demand by the same pure core"
- The owner enters the existing house on the renovation cards, not on new-build cards (~/Buildo-scratch/mcfrontend/phase1/open-questions.md:726) "the existing-house input belo"

## Deliverable
- Done means the scenario works for a customer on a real lot on the real page (~/Buildo-scratch/panel-tools/PLAN-PROTOCOL.md:11) "An increment is done only when, on a real lot on the real page"
- The nine parts: engine rows, storage as ruled, page section and binding, display text, public route, cost line, CoA per option, search hand-off, measured check (~/Buildo-scratch/panel-tools/PLAN-PROTOCOL.md:11) "(1) engine rows right (answer key); (2) stored as ruled"
- Measured population: the designed element is populated, counted on the admin/tester page (~/Buildo-scratch/lanes-20261117/replan/SCENARIO-SLICES.md:44) "P12 Measured population"
- Measurable check: R6-CHECK: One measured page check for renovation: card bound, served, populated when an owner entry exists (ex (~/Buildo-scratch/plan-gen/out/finalplan.json:20709) "One measured page check for renovation: card bound, served, populated when an owner entry exists (ex"
- Problem closed at the end of this group: All-lot headline fill not built (MB-38); the 1,921 lots are the test cohort by design (~/Buildo-scratch/plan-gen/out/finalplan.json:20736) "All-lot headline fill not built (MB-38); the 1,921 lots are the test cohort by design"
- Problem closed at the end of this group: Display-text registry empty, so the renderer throws (~/Buildo-scratch/plan-gen/out/finalplan.json:20743) "Display-text registry empty, so the renderer throws"
- Problem closed at the end of this group: 80,682 addon_cand rows stored, never shown (~/Buildo-scratch/plan-gen/out/finalplan.json:20749) "80,682 addon_cand rows stored, never shown"
- Problem closed at the end of this group: CoA: no owner, no catalogue rows (~/Buildo-scratch/plan-gen/out/finalplan.json:20755) "CoA: no owner, no catalogue rows"
- Problem closed at the end of this group: Cost lines exist for only 5 scenarios (~/Buildo-scratch/plan-gen/out/finalplan.json:20761) "Cost lines exist for only 5 scenarios"

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
- Spec 88 parcel cost model: origin:docs/specs/01-pipeline/88_parcel_cost_model.md (cost lines)
- optimize-6c DECISIONS-6c.md: ~/Buildo-scratch/lanes-20261117/optimize-6c/DECISIONS-6c.md (6c sitting)
- owner-inputs REPORT.md: ~/Buildo-scratch/lanes-20261117/owner-inputs/REPORT.md (owner input design)
- req-rulings/CHANGES.md (report element rulings after the brief): ~/Buildo-scratch/lanes-20261117/req-rulings/CHANGES.md (later rulings win over the brief)
- Semi Lot Check: https://claude.ai/artifact/Qkv5RrKC9yCPHD2oWa1ZKV (semi question page)

## Rulings
- Increment order is 7 semi, 8 sixplex, 9 merged measure, 10 McProof (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:342) "7 is semit detached 8 is sixplex and 9 merger and 10 is McProof"
- Launch means users on the live customer report, not tester preview (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:568) "LAUNCH = users on the live report"
- McStorage ST-1..ST-8 approved as ruled (headline record per lot and option; detail on demand) (~/Buildo-scratch/mcbylaws/McSTORAGE-RULINGS.md:5) "ST- all y"
- Colour ruling D-1 (2026-11-14): the built report must look like the Daylight B mock; this is a colour ruling, not a whole-layout approval (~/Buildo-scratch/mcfrontend/MF-83/plan.md:219) "the built report must look like the Daylight B mock"
- Earlier approval: dark mock v21 (2026-11-10); superseded for colour, summary, gallery, lot views and See details sheets by the later theme and rulings (~/Buildo-scratch/mcfrontend/phase1/open-questions.md:866) "2026-11-10 mock v21: APPROVED (operator, verbatim)"
- Theme ruled: Daylight B (light) with the summary at the top (~/Buildo-scratch/mcfrontend/phase1/open-questions.md:1094) "RULING: report theme = B Daylight model (with the options-at-a-glance summary)"
- Report base confirmed by the operator: the published Report Theme B · Daylight model + the later rulings (CHANGES.md); identity of the published page vs pub/B.html being checked (REPORT-DELTA) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:665) "I have the artifact Report Theme b - Daylight  model"
- Increment 6 list approved, 6c items included (2026-11-17) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:623) "APPROVED: all 59 increment 6 recommendations as resolved"
- MB-90 cost-rate sub-points R-1..R-4 are not in the plan now (2026-11-17) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:637) "LATER, no sitting now"
- Open question 9 (ONE-SITTING.md): Increment 6c groups 1-7 and call-out A: approve all seven group lines, with the 6c notes joining the push-6 records comm (~/Buildo-scratch/lanes-20261117/inc-plan/integrate/ONE-SITTING.md:19) "Increment 6c groups 1-7 and call-out A: approve all seven group lines, with the 6c notes joining the push-6 records comm"
- Open question 10 (ONE-SITTING.md): O-15 (e) (6c.4): is the keyed Drive set a candidate pool for the proof draw? (i) yes, with the three held map commits' l (~/Buildo-scratch/lanes-20261117/inc-plan/integrate/ONE-SITTING.md:20) "O-15 (e) (6c.4): is the keyed Drive set a candidate pool for the proof draw? (i) yes, with the three held map commits' l"
- Open question 11 (ONE-SITTING.md): Refresh lines (6c.23, 6c.24, 6c.26): six rows get status wording (MF-86, MF-66, MB-109, MF-87, MF-69, MB-74 read LATER w (~/Buildo-scratch/lanes-20261117/inc-plan/integrate/ONE-SITTING.md:21) "Refresh lines (6c.23, 6c.24, 6c.26): six rows get status wording (MF-86, MF-66, MB-109, MF-87, MF-69, MB-74 read LATER w"
- Open question 1 (ONE-SITTING.md): AL.9 (new, integration pass): fix the one rehearsal-script defect (~/Buildo-scratch/lanes-20261117/inc-plan/integrate/ONE-SITTING.md:11) "AL.9 (new, integration pass): fix the one rehearsal-script defect"

## Storage set-up
- McStorage policy v2: a lot's numbers (main page and See details) are computed on first open from the search page (behind the 35 s loading screen), on track, or on owner input; stored with the stamp (Layer 2 table_version, evaluator_version, settings sha); a stale record is never served and is recomputed; no record for unopened lots; no all-lot fill (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:704; ~/Buildo-scratch/lanes-20261117/storage-policy/McSTORAGE-POLICY-v2.md) "undefined"
- Renovation rows exist only where the owner has entered the house (ST-4); on entry they are computed and stored with the stamp for that lot; no screen covers it, the card shows "updating" (~/Buildo-scratch/mcbylaws/McSTORAGE-RULINGS.md:112) "undefined"
- ST-4 AMENDED (owner input is the third trigger, stored with stamp) (~/Buildo-scratch/mcbylaws/McSTORAGE-RULINGS.md:105) "undefined"
- ST-5 AMENDED 2026-11-18 (store on first open; prior text kept, superseded where it conflicts) (~/Buildo-scratch/mcbylaws/McSTORAGE-RULINGS.md:126) "undefined"

## Register rulings of this group (operator words)
- RR-0012 2026-11-15: Increment order is 7 semi, 8 sixplex, 9 merged measure, 10 McProof (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:342) "7 is semit detached 8 is sixplex and 9 merger and 10 is McProof"
- RR-0014 undated: McStorage ST-1..ST-8 approved as ruled (headline record per lot and option; detail on demand) (~/Buildo-scratch/mcbylaws/McSTORAGE-RULINGS.md:5) "ST- all y"
- RR-0137 2026-11-18: For increments 1b-10: all tasks present to fulfil each increment's objectives and deliverables (rulings most relevant, McStorage policy, compliance, project objectives; ensure relevancy); tasks optimised holistically, then within each increment, updated in the plan (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:729) "ensure all tasks are present to fufill the increments objectives and deliverables"
- RR-0144 2026-11-18: Stored lot records are purged after 90 days unopened (operator answer PRG-1 a); tracked lots are never purged while tracked (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "PRG-1 a (purge after 90 days unopened)"
- RR-0145 2026-11-18: Tracked lots are refreshed in the background when the stamp moves (operator answer TRK-1 a) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "TRK-1 a (background refresh of tracked lots when the stamp moves)"
- RR-0154 2026-11-18: When a task completes the next ready task starts at once; a task blocked on an operator question goes to the answer page and work moves to the next unblocked task; nothing waits idle. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:754) "it should pull the next task as something completes or move to the next task if a question remains"
- RR-0162 2026-11-18: AL.9 (rehearsal-script fix) moves from After-launch into 6c, right after push 6 and before the first rehearsal (6c.9) (ONE-1 y) (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:738) "ONE-1 "y""
- RR-0174 2026-11-18: Loading screen: the animation always runs its full set length (report_check_min_ms = 35,000 ms, default and maximum); the button to open the report shows when the lot's numbers are ready, at any time after the animation completes. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:779) "the animation still needs to be complete.. the button shows when its ready - anytime after the animation completes"
- RR-0176 2026-11-18: Loading screen: the animation keeps its own length (23 s today, may change later) and always runs to completion; the button to open the report shows only when the report AND See details are loaded, however long that takes (no 35 s cap); the 35,000 ms setting change (LOAD.3) is not needed now. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:785) "yes that is correct"
- RR-0190 2026-11-18: Lane launches need an authorized plan for any repo worktree they write; every register row is marked operator words or orchestrator reading and only operator words feed reviews as rulings; orchestrator replies that recommend or name a ruling must cite file:line, an RR id or UNVERIFIED (enforced by hooks). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:813) "close the gap.  fix teh register"
- RR-0192 2026-11-18: Questions come to the operator only on database structure, the frontend, the user experience and storage; everything else is decided under the six-criteria rule, reviewed and logged as a McRecommendation card for audit. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:819) "I dont provide oversight on questions beyond the databse strcuture, the frontend the user experience and storage"
- RR-0193 2026-11-18: McRecommendations: every recommendation is a card in the repo decision log with customer / UX / space / DB-logic framing, options, rulings (operator words only), sources, research kept separate from the recommendation status (judgment only, reviewed, proven), five principles, what it serves, computed confidence and outcome. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:817) "the recommendation should be framed with an explanation that speaks to what I know"
- RR-0202 2026-11-18: The increment plan moves into the repo queue rows (Spec 137); the Backlog board generated from them is the working board, showing per task its increment, decisions and research (review/run) IDs. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:837) "I need to be able to see the board and the categories and the decisions and the research ids for each"
- RR-0203 2026-11-18: The move of the increment plan into the repo queues is done by a committed generator with --check, from a committed raw snapshot; nothing hand-copied. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:839) "use a generator"
- RR-0205 2026-11-18: The increment plan lives in Backlog.md in the repo (milestones = increments, assignees = lanes, priority/ordinal, dependencies, decision and research refs per task); the operator organises on the board; queue rows stay and are linked by id; loaded once by an import script. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:843) "yes of course"
- RR-0207 2026-11-19: Backlog: every feature is used; each increment's objectives, rulings, citations and storage objectives move over; the existing process (handbooks, Spec 08) is carried over; process documents are updated; the move is structured so the system is actually used. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:847) "Make sure opus actually uses the system"
- RR-0208 2026-11-19: The board data exists in the artifact and the procedures in Spec 08; the failure is scratch work, made-up responses and wrong reviewer context; hence the gates and full Backlog use. Each new gate is assessed as necessary or not, with how to do it right. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:848) "determine if the new gates etc are necessary and how to do this right"
- RR-0210 2026-11-19: The lane policy is named McLane in the Spec 08 and Spec 137 dated notes of the Backlog-home plan; McDecision is not adopted. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:852) "Let's stick with McLane for a name."
- RR-0212 2026-11-19: The Backlog-home plan is the loader plus the three enforcement pieces, with Backlog's own browser as the board; the v7 board job, mirror synchroniser, import verifier and structural gate are dropped (simple, no scope creep). (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:867) "we needd the loader and the three gates"
- RR-0219 2026-11-19: Backlog-home plan v8 is authorized (PLAN LOCKED): loader + three gates + Backlog's browser; D1-D5, D7-D10 as recommended; every relevant spec note lands; every imported task carries all available information; the 1·A tasks are updated or removed against the plan through the panel. (~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:871) "approved. ensure that all the relevant specs are updated and all the increment tasks with all the new information that can be given to the tasks"

## Compliance codes in use
- PAN: Panel lenses on every plan item: compliance, grounding, reality, options, regression, integration, surrounding work, then final check (~/Buildo-scratch/panel-tools/PROTOCOL.md:9)
- FIVE: Five principles: standardization, observability, scalability, accuracy, understandability; keep it simple; no scope creep (~/Buildo-scratch/panel-tools/PLAN-PROTOCOL.md:3)
- SC: Simplicity guard: a task is added only if it fills one of the nine slice parts or one supporting function, with a source (~/Buildo-scratch/panel-tools/PLAN-PROTOCOL.md:25)
- STAT: One status line per row, replaced in the same commit as the work (Spec 137 rules 1 and 3) (origin:docs/specs/00-architecture/137_mcqueue.md:45)
- DN: A ruling enters its row as a verbatim dated note, prior text kept (M-246; Spec 137 rule 10) (origin:docs/specs/00-architecture/137_mcqueue.md:109)
- REN: Relay check: a claim that nothing covers it is checked by a grep of the full record and the search is quoted (~/Buildo-scratch/panel-tools/PROTOCOL.md:48)
- MCP: McProof: scope and answer key first, hand-derived from the by-law text; disputed items walked one at a time (Spec 08 11.8 MCINC-1) (origin:docs/specs/00-architecture/08_agents.md:486)
- DDV: Data-driven validation: test readings against permits, CoA and past research before asking the operator (operator 2026-10-31) (~/.claude/projects/-Users-brettpreston-macmini/memory/data-driven-bylaw-validation.md:3)
- FIT: Design-fit gate: every stored or built value maps to a designed McFrontend element or a named supporting function; every designed number bound, served, populated (~/Buildo-scratch/panel-tools/PROTOCOL.md:25)
- STO: McStorage rulings ST-1..ST-8: headline record per (parcel, option); detail on demand; long form for bounded cohorts only (~/Buildo-scratch/mcbylaws/McSTORAGE-RULINGS.md:130)
- BYL: McBylaws process: by-law step conversion; queue row first; no code names a zone, scenario or regulation id (M-61) (origin:.cursor/MCBYLAWS-QUEUE.md:100)
- BLD: Build on the tip: red tests first, then code, through the real hooks (MCINC-4) (origin:docs/specs/00-architecture/08_agents.md:490)
- HS: Hooks plus the full suite on the current origin tip before anything is called ready (MCINC-4) (origin:docs/specs/00-architecture/08_agents.md:490)
- RH: Rehearse every DB job on the local test stack, with the real hooks, before the go (MCINC-7; Spec 137 rule 9) (origin:docs/specs/00-architecture/08_agents.md:495)
- GO: Operator-typed GO on dev, one DB job at a time (~/Buildo-scratch/lanes-20261117/inc-plan/integrate/ONE-SITTING.md:84)
- ID: Claim every MF, FE, MB, migration, prereg round, D and M number in the ID ledger before use (MCINC-8) (origin:docs/specs/00-architecture/08_agents.md:496)
- AV3: McDonald's Airtight V3: the step standard (Spec 122/124/132 path); no exception paths; calcs as data, switches, tests first (origin:docs/specs/01-pipeline/124_step_standard_policy.md:250)
- RDG: Every reading we made ourselves carries a confidence and an evidence pointer (M-481) (origin:docs/specs/01-pipeline/69a_mcbylaw_register.md:624)
- PUSH: Pushes are the operator only: own terminal y, one y and one suite per push; one push per landing set (~/Buildo-scratch/lanes-20261117/inc-plan/integrate/ONE-SITTING.md:83)
- MAP: McIncrement impact map measured on the current origin tip (MCINC-2) and one decision list (MCINC-3) (origin:docs/specs/00-architecture/08_agents.md:487)

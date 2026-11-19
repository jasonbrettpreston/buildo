---
id: DRAFT-32
title: Decisions section on every milestone file (the m-1 form)
status: Draft
assignee: []
created_date: '2026-11-19T14:57:00Z'
labels:
  - gap
  - plan:MS.DECISIONS
milestone: m-0
dependencies: []
references:
  - backlog/milestones/m-1 - increment-1·b-search-[s].md
  - backlog/decisions/decision-43 - RR-0176-Loading-screen.md
priority: low
type: record
project: McIncrement
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Grounded: lane BL-R10 (task-316, AC6) added a Decisions section to the m-1 milestone file: one line per backlog/decisions file whose 'Groups:' line names group S or whose 'Tasks named:' line names an m-1 plan id, written as '- decision-N: <title>' (28 lines for m-1). The later milestone files carry Register rulings (operator words) but no list of the decision files that name their tasks or group (checked on backlog/milestones/m-10: sections Description, Problems, Project objectives, Increment objectives, Deliverable, Specs, Rulings, Storage set-up, Register rulings, Compliance codes in use, Documents; no Decisions). RR-0207 'every feature is used; each increment's objectives, rulings, citations and storage objectives move over'. Recommendation (UNVERIFIED: not covered by the r1 review of task-316): propose the section FORM for all milestones, populated by a script from the decision files' Groups and Tasks named lines, not by hand (RR-0203 'use a generator'); only m-1 is populated by task-316. Decisions: one line per file; same match rule on every milestone.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Decisions section form agreed (one line per decision file, match on Groups and Tasks named)
- [ ] #2 Section generated for every milestone file by a committed script with --check; m-1 output equals the hand-made m-1 section
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 The rule the task rests on is quoted with file:line in the task, or the task is a card for the missing rule — "Quote the rule first" (.cursor/MCBYLAWS-QUEUE.md:107)
- [ ] #2 The tests were written first and proven red, then green — "Every lock is proven in BOTH directions" (docs/specs/00-architecture/08_agents.md:462)
- [ ] #3 The work is committed through the real hooks, none bypassed — "Red tests first, then the code, through the real hooks." (docs/specs/00-architecture/08_agents.md:490)
- [ ] #4 The named test is green before the task is called done — "Never declare a task done until" (CLAUDE.md:32)
- [ ] #5 Any operator ruling the task needed is recorded verbatim as a dated note or a decision-log row — "A ruling enters a row as a verbatim dated note." (docs/specs/00-architecture/137_mcqueue.md:109)
- [ ] #6 The task file and its queue row are updated in the same commit as the work — "The status line changes in the same commit as the work." (docs/specs/00-architecture/137_mcqueue.md:84)
- [ ] #7 DONE carries its evidence (commit sha, test, hook result) — "The work landed and the evidence exists" (docs/specs/00-architecture/137_mcqueue.md:63)
- [ ] #8 Nothing was added that the card or ruling did not name — "no change adds a tool, field or rule its card or ruling did not name" (docs/specs/01-pipeline/124a_step_standard_policy_appendix.md:988)
- [ ] #9 The principles the task serves are named — "Each task names the ones it serves." (.cursor/MCBYLAWS-QUEUE.md:104)
- [ ] #10 The close-out reply ends with one STATUS line and at most one question — "Every reply ends with one line" (docs/specs/00-architecture/08_agents.md:505)
<!-- DOD:END -->

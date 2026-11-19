# TRIAGE BL-INFRA6 round r1 (r1-plan.txt, review mode, plan template)
Most findings concern the generated context file (generator output, duplicate rows, truncated quotes, missing front matter); that file is not the deliverable, only the review carrier. REJECT as off-target unless listed KEEP.

KEEP
- CRIT "context file contains no such question" (and the "regenerated" CRIT): opened docs/reports/reviews/task-11/context-2026-11-19.md; it carries Milestone Objectives and Decisions in force, not a lens question. The draft's claim was wrong as worded. Fixed: the lens "lives as a question put to that review over its context file (which carries the milestone objectives and decisions in force)". No claim that the file holds the question.
- MED "one pass at WF6 uncited": opened 08_agents.md:251 (Substrate line, "one pass at WF6"). Cite added to the note.
- LOW "role proliferation :380 vs :379": opened 08_agents.md:380 = the Role proliferation bullet (the task reference #L379 is one line early; 376 is the section 9 heading). Cite :380 kept in the note.
- Quote cite: the operator words are at MORNING-DECISIONS.md:710 (opened); note carries :710.

REJECT
- CRIT template disclaims compliance: template line 3 axes are failure/data/sibling; true, and the task asks for no template change (design limit: no new template). The round reviews the note text; not a defect of the note.
- HIGH/MED generator, front matter (AC 3), recursive headings, hashes, duplicate docs, duplicate decision rows, unmarked rows, truncated quotes: generator output of backlog-brief.mjs, outside this lane's scope (one note only; wider scope is a new task, TKT-1).
- HIGH "scratch tooling only / no repo change" in plan text, three lane names: stale plan text in the task description superseded by MD:744 (build in repo); not this lane's edit; lane name is BL-INFRA6.
- HIGH RR-0195 vs RR-0196, RR-0140: register hygiene, not the note.
- HIGH "Dependencies (none)" vs landing after push 6: the task description names landingPush; commit is on the lane branch only, no push (brief).
- HIGH one round vs AC 4/5: the brief fixes one review round (max_fix_rounds 1) and the AC about panel lens sets and red/green do not apply to a docs note (to be recorded on the task).
- HIGH no AC for the un-draft: scope; the task says DRAFT, not applied; an un-draft commit is a separate later task. Not added (no scope creep).
- MED AC 6/8 boilerplate, estimate, status evidence, M-246 undefined (M-246 form is used by the dated notes at 08_agents.md:150, :340, :343; opened), :944 unverifiable (opened: line 944 holds the review route correction), prior reviews, injection surface, path conventions, [sic] nits, "The text above stands" nit (note now ends "This paragraph is the whole note."), push 5 quote: off-target or generator.
- LOW insertion point :253: opened, :253 is the KFM paragraph line, not a list item.

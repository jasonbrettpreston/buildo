# REPORT: BL-R16, task-347 (R16, Increment 1·B, record-only)
Status line (Spec 137 rule 3): BL-R16 lane, task-347, record-only, no code change, no push, no database. Review round r1 (r1-review.txt) triaged in TRIAGE.md; the round could not read doc-2, doc-4 or doc-16 (pack ENOENT), so no recommendation is called verified.

Test used to split open from ruled: a decision is open when no register row decides what the person sees or the mechanism that gives it. Result: D1 and D3 are open (OPERATOR tasks task-348 and task-349); D2 and D4 are already ruled (notes on task-123, 266, 267, 343; no task). AC#1 of task-347 reads "four OPERATOR tasks": the brief's own Goal orders "already ruled: no task", so two were created; the operator may overrule.

## D1 who sees real report numbers before launch: OPERATOR task-348
- Question: before launch, should a phone tester see real numbers, or only "No report for this lot yet."?
- What each answer means: A (keep): after 1.3 W lands, a tester on the phone picks any address and sees "No report for this lot yet." for every lot, the 25 test lots too; nobody sees a number before launch. B (bring part f forward): a phone tester sees real numbers for the 25 + cohort lots with a Preview banner, no charge.
- Grounded: yes. Plan claim "W returns nothing for the app as well as the web" checked and found NOT true of today's code: MAXBLD_WEB_LIVE (src/lib/surfaces/maxbld-web.ts:19, false) is read only by src/app/(maxbld)/parcel-tool/SearchPageClient.tsx:17 and [parcelId]/page.tsx:18; the lookup route and mobile do not import it (git grep "surfaces/maxbld-web" over src mobile scripts). The app gets nothing today because the reader is an empty slot (src/lib/parcels/report-page.ts:23-26); the gate on the app becomes true only when W adds the switch as its first statement. Miss text: scripts/surfaces/_schema/seed-report-v2.mjs:619.
- Recommendation: A (keep the one switch, part f stays). Costs: 1·B's deliverable lands on the miss page until launch; the flip shows numbers to app and web together so it must follow MB-38; LOAD.1 compute must sit behind the same gate. Status: UNVERIFIED (r1 raised the app-wide coupling and the effect on W, folded; it did not test the part f order or size, and could not read doc-2/4/16).
- Effect on the running W build: none under A; under B the first statement of W must admit the tester path too (GUESS 1 to 2 files) plus part f itself (size not measured).

## D2 what a lot with no current stored result shows: ALREADY RULED, no task
- Question in plain words: a miss while the app computes at the pick, or a "Not yet evaluated" page?
- Meaning: miss: the phone shows the loading screen while LOAD.1 computes; "Not yet evaluated" page: a lot nobody opened would show an empty-looking report with no number and no compute.
- Ruled: MORNING-DECISIONS.md:704-705 (operator: "yes. we need to run a panel on the tasks this impacts ...", ruling: a record with another stamp is "never served and is recomputed; no record for lots nobody opened; no all-lot headline fill"), :789-790, :1057 and :1061 "2. y" (Option B, a stub to the miss text, rejected), task-123's own title "returns a miss when no current record exists". The two pulls quoted: Spec 126:809 R-2 ("... until MB-38 fills all lots") against doc-16 section 1 line 5 ("Nothing is saved for a lot nobody opened or tracked. There is no all-lot fill"); the premise of R-2 was removed by :704-705.
- Grounded: yes (all cites opened). Recommendation: none needed; the R-2 dated note is a loose end on task-343, tied to task-123 stage 2. Status: ruled (the round could not read doc-16; the chain does not need it).
- Effect on the W build: none (stage 2 is already written for the miss).

## D3 web report render now or at launch: OPERATOR task-349
- Question: build the web report page now, or leave it for launch under L.7?
- Meaning: A: nothing changes for anyone before launch; B: about a day more work now for a page nobody can see before launch; with no real page, flipping the website switch would show an error on every web report.
- Grounded: yes: src/app/(maxbld)/parcel-tool/[parcelId]/page.tsx:18-20 (not found, then a deliberate throw); component exists (doc-4:17); the web mount has no owner in any task text (doc-2:82 lists LS.12, 1.3, MB-44; none builds it); LS.12 depends on 1.3, L.7, MB-44, L.13, PROOF.L (task-287 planNote).
- Recommendation: A, with L.7 (task-285) named as owner by a dated note; the work moves (about 6 files, 1 day, plan GUESS) and does not vanish. Status: UNVERIFIED (r1 could not read doc-2/4; size is a GUESS; whether L.7's estimate absorbs it not checked).
- Effect on the W build: none under A; under B +6 files and +1 day (GUESS) plus a McFrontend row claim.

## D4 the What-we-checked lines (gap Q9, D04): ALREADY RULED, no task
- Question in plain words: should the lookup carry the per-lot checking lines for the loading screen?
- Meaning: yes: the loading screen can show the lot's findings as checks resolve; no: those lines are never served.
- Ruled: operator verbatim "x-1 a of course, x-2 a x-3 a x-4 a - build this into McFront-end specs and rulings and handbook" (2026-11-11), X-4 (a): wire readWhatWeChecked into GET /api/parcels/lookup (.cursor/MCFRONTEND-QUEUE.md:363); MF-48 Stage B left it to Stage B2 (:368). ONE-5 "y" (MORNING-DECISIONS.md:738) covered the bundle naming gap Q9: a reading, not a separate word. Searches: MORNING-DECISIONS.md, gap-register/, rulings-register.json (:555), backlog/decisions, MCFRONTEND-QUEUE.md (:363, :368, :474-477). The plan lane searched for Q9 and D04 only.
- Grounded: yes. Recommendation: none; the carrier (task-123 by its title, or task-267 as the plan proposes) is a dated note for the orchestrator (loose end on task-343). Status: ruled; RR-0190 (cited by the round) not opened: UNVERIFIED.
- Effect on the W build: if W carries it: a response field in the lookup contract, mobile schema and goldens (not sized by the plan: UNVERIFIED); if LOAD.2 carries it: none for W.

## Records
- New tasks: task-348 (D1), task-349 (D3), both OPERATOR, m-1, type decision.
- Notes (--append-notes, no status change): task-123, task-266, task-267, task-343 (five loose-end lines).
- backlog doctor: "No duplicate IDs, self-referential dependencies, or dependency cycles found."
- Commit: see the commit line below. Gate: see the gate line below.

## UNVERIFIED
1. Part f (MB-94) order and size; whether a tester view can reuse W. 2. The 6 files and 1 day for the web render (plan GUESS) and whether L.7 absorbs it. 3. RR-0190 text. 4. doc-2, doc-4, doc-16 were read by the lane, not by the review round. 5. The size of the What-we-checked wiring. 6. Live data (no database).

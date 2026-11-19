# TRIAGE of r1-plan.txt (one round; the review read the whole plan v8.1, so most findings are outside R6)
Folded: none (no KEPT defect changes the R6 deliverable).
- CRIT board commits never reach origin/wf1/mb-rulings: REJECT for R6. Stated and accepted in plan section 4 (active_task.md:55: "While the checkout holds your unpushed board commits the fast-forward is refused; the job writes a WARN line ... your commits go out at the next push window"); the push path is the push station, not an R6 job. Test (c) locks the WARN behaviour.
- HIGH G3 intermediate commits: REJECT (R5 scope, already built and merged; not R6).
- HIGH auto_commit true vs false: REJECT (brief line 7: auto_commit stays false; section 4 :54 governs).
- HIGH lane branches re-cut / milestone validation: REJECT (R5/R1 scope).
- MED stagger 600 vs 617 / flock: REJECT (brief fixes StartInterval 600 for both; both scripts already skip on index.lock; no locks beyond git's, active_task.md:55).
- MED commit outcome to BOARD-STATUS and lock deletion: REJECT (brief: WARN to the job log; deleting locks is a new action, PLAN-PROTOCOL.md:3 no scope creep).
- MED restart browser after ff touched backlog/: REJECT for now (scope creep); noted in REPORT as a risk.
- MED/LOW/NIT items on loader, due dates, refs, since, pilot banner, raw formatter, rollback wording: REJECT (other steps R1-R5, Phase 2).

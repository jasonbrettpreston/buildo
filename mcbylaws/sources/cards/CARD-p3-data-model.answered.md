# CARD P3-DATA-MODEL: Phase 3 as tables, not code. ANSWERED 2026-10-30
Question (chat 2026-10-30): "Do you want the formulas fully as data, as I recommend, before I fold it in?"
Operator words (verbatim): "yes. we also dont want to import the old code - we also want to gear the phase 3 to testing and validating loop. We want to eliminate code almost entirely if possible and we want to be able to iterate easily and adapt - flexibility"
Prior operator words (verbatim, same day): "What is the plan - to standardize the calculations, not use random script, observable - easy and understandable to change - best in class - not dependent on code. all varaibles must be externalized as per spe 122."
Rulings to record (with the handbook amendments, via decision-log, after a compliance table):
1. O-2 answered: formulas are DATA. They are declared expressions in a formula catalogue with named inputs, clause, worked examples and a switch. Code is limited to one generic runner plus a short CLOSED list of generic, individually tested helpers. No zone, scenario, clause or by-law number lives in code.
2. No import of old code. Layer 3 is built fresh. Nothing from the restored engine (wf1/p3-engine), the p3plan attempt, renovation-shared.js or max-build.js is imported. They are used as reference only and then retired. This NARROWS CARD-l3-rebuild ("option a"): reuse after the conformance check is withdrawn.
3. Phase 3 is organised as a test-and-validate loop: worked examples + oracle (MB-62 hand values) + invariants + floors exist first. Change a row → loop runs → results compared → accept or revert. Iterating is editing tables, not code.
4. Every non-law setting is externalized as a logic variable per Spec 122 / Spec 124 Rule 3. Law numbers come only from the Phase 2 table.
5. Flexibility: building types, formulas, settings and switches are all table rows, so they can be added, changed or switched off without code changes.

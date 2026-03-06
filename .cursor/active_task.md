# Active Task: Reduce Atomic Commit Confirmation Friction
**Status:** Planning

## Context
* **Goal:** Once the user authorizes the plan ("PLAN LOCKED → yes"), the AI should commit automatically at each Green Light without re-asking. The plan authorization IS the commit authorization. Reduce confirmation gates from 4 (plan + 3 workflow commit prompts) to 1 (plan only).
* **Target Spec:** `CLAUDE.md` (Git Commit Strategy + WF1/WF2/WF3 Atomic Commit steps)
* **Key Files:** `CLAUDE.md`

## Technical Implementation
* **WF1/WF2/WF3 Atomic Commit steps:** Change "Prompt user to commit" → "Commit immediately" since plan authorization covers it.
* **Git Commit Strategy section:** Change rule #1 from "prompt the user to commit" → "commit immediately" after Green Light. Add clarification that plan authorization grants commit authority.
* **Database Impact:** NO

## Standards Compliance
* N/A — docs-only change.

## Execution Plan
- [ ] Edit CLAUDE.md — WF1 Atomic Commit step
- [ ] Edit CLAUDE.md — WF2 Atomic Commit step
- [ ] Edit CLAUDE.md — WF3 Atomic Commit step
- [ ] Edit CLAUDE.md — Git Commit Strategy rule #1
- [ ] Verify tests pass
- [ ] Commit

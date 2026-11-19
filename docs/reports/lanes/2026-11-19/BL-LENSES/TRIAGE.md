# TRIAGE: BL-LENSES plan review (task-358), round 1, one generic pass
Command: review docs/reports/reviews/task-358/context-2026-11-19.md --context .claude/review-templates/plan-review-deepseek.md --fast (deepseek-chat, 22 s, 14629 tokens). This is the single generic round: the lens set did not exist yet. Output: r1-plan.txt. Grounder: this lane (opened each cited line in the worktree).

KEEP
1. [LOW] severity guide says "plan-lock" (plan-review-deepseek.md, Severity guide, CRIT/HIGH lines): true, plan-only wording. Fold: each lens states the severity gate for plan ("before plan-lock") and output ("before merge").
2. [MEDIUM] anti-patterns are plan-specific (plan-review-deepseek.md Anti-patterns): true. Fold: each lens carries its own anti-pattern list.
3. [MEDIUM] em-dash delimiter with no rule for em-dashes inside a field (plan-review-deepseek.md Output format): true. Fold: each lens says "no em-dash inside a field; use a comma".

REJECT
- CRITICAL "undefined" quotes / ENOENT documents / no decisions naming the task / truncated quotes / no generator stamp (context-2026-11-19.md Storage set-up, Documents, Decisions): defects of backlog-brief.mjs output, already named in the context's own Problems section as a draft task; outside task-358 scope (task: "Wider scope is a new task"); no effect on the five templates.
- HIGH Files line under-specified (lens-run/, docs/reports/lanes): lens-run is in the lane dir (write scope), lanes dir is brief rule 19; src/tests/ covers the test.
- HIGH step 1 self-exemption: the brief (Inputs, REVIEW of your own plan) orders one generic round with the existing template and says to state it plainly; stated in REPORT.md.
- MEDIUM footer premises are not findings (VERIFY type): scope creep (PLAN-PROTOCOL.md:3); the lenses have no data-premise footer.
- MEDIUM cap summary footer, Increment label inconsistency, RR-0174/0176 superseded tag, emoji, unsourced "Why DeepSeek" examples, zero prior reviews: generator or existing-template matters, not this task; the new templates drop the "Why DeepSeek" section and the emoji.

# Queue tracking (WAIT-P67-2), 2026-11-01
Rules: R-KW (124a): ".cursor/MCBYLAWS-QUEUE.md is a tracked file on wf1/mb-rulings (it is untracked today), committed by the orchestrator before the queue check is wired; each DONE entry is written MB-nn@sha and never rewritten". R-KK (124a:1019): "every DONE line's commit exists on its branch".
Q1 (public repo). Operator first: "Why does it need to be public?" Then, verbatim: "track in the repo which is public"
Q2 (six DONE with no commit: MB-02, MB-07, MB-49, MB-52, MB-62, MB-64). Operator, verbatim: "approved recommendation as lon as it compliant - you should be posting the rulings you are referencing". Recommendation: copy each task's evidence into mcbylaws/sources/, commit it, stamp the DONE line with that commit.
Q3 (which copy). Operator (selected): "Tracked copy only (Recommended)": the tracked file is the queue; every edit is a commit; ~/Buildo/.cursor copy replaced by a one-line pointer.
Effect: the queue's old footer ("never pushed to a public remote") is replaced by a line citing R-KW and this card.

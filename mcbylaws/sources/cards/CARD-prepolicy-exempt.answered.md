# CARD — commits made before the McBylaws policy existed (answered 2026-10-31)

Problem: gate arm H judges each commit against the policy file in its parent. Commits before the policy bootstrap commit 17c95d00 have no policy to be judged by. The branch push range has about 20 such commits, and the landing to main has 690. The six-sha landing exception (CARD-gates-recheck item 1) covers only MB-67 itself.

Options put to the operator:
- A (recommended): a commit that is an ancestor of the bootstrap commit 17c95d00 (a frozen constant) is exempt from the per-commit arms H, C and P. Nothing is listed, and the set cannot grow. Every commit from 17c95d00 on is checked in full.
- B: rewrite the unpushed history so the policy comes first.
- C: undo the MB-67 merge.

Operator answer, verbatim: "option a"

Not answered: whether LC-46 should be citable. It stays read as OWED, which errs closed.
Follow-up (not a ruling): M-312 is missing from the Spec 133 §3 generated OWED table.
Record in the next decision batch (124a row, plus a dated note on R-LS / CARD-gates-recheck item 1).

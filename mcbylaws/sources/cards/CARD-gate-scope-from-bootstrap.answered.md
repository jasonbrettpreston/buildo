# CARD — the gate's scope starts at the policy bootstrap, for every arm (answered 2026-10-31)

Problem: arm L and the loop arm judge the range diff from the push base. When that base is older than the policy bootstrap, they judge work done before the gate existed. The branch push fails on arm L (the rule map changed in 84027ca2, before the bootstrap) and on the loop arm. The landing to main fails on about 12k arm-L hits and on loop failures. CARD-prepolicy-exempt covered only arms H, C and P.

Options put to the operator:
- A (recommended): when the base is an ancestor of the frozen bootstrap c500c249…, every range-diff arm (L, the loop, and any other arm that diffs base..tip) uses the bootstrap as its effective base. Nothing before the bootstrap is judged. Everything from the bootstrap on is judged in full. The rule-map exemption stays for future batches.
- B: rewrite the MB-67 branch's ~35 policy versions to carry the exemption.
- C: a one-time exception for this push.

Operator answer, verbatim: "we are wastring alot of time on this... option A for the last time"
Note: the operator wants this closed in one pass. No further rounds of options on the gate landing unless a genuinely new blocker appears.

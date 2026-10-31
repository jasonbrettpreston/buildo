# CARD — rebuild the policy bootstrap with the rule-map exemption (answered 2026-10-31)

Problem: O67-03 takes `literal_exempt` as the intersection over every policy in force across a range. The bootstrap `17c95d00` lacks the rule-map entry (CARD-rulemap-literal-exempt), so the exemption cannot take effect for this push.

Options put to the operator:
- A (recommended): rebuild the four new local, unpushed commits. The bootstrap is re-made with the rule-map exemption in it, followed by the MB-67 merge and the two gate changes. Only their shas change. The frozen bootstrap constant (CARD-prepolicy-exempt) is updated to the new sha, recorded as a dated note. No gate rule changes.
- B: change O67-03 to ignore the first policy version.
- C: a one-time exception for this push.

Operator answer, verbatim: "option a"

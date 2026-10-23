# Verification index — wf2/p4-integrate-26

R-EZ says: *"Findings block the integration until fixed or ruled. The verification report is saved under
`docs/reports/verification/<branch>.md` and the integrate commit cites it."*

Independent verifiers read the branches only: verify-45 (`~/Buildo-scratch/verify-45.md`) for p3plan @ 3765edd5, abs73 @ c748b78f and the
trial merge (item C); verify-45b (`~/Buildo-scratch/verify-45b.md`) for p3plan @ 91c12d81 (the verify-45 A3 BLOCK fix, PASS-WITH-NOTES).

- **Integrate base:** `9fd4ca4f` (= origin `wf2/deep-scrapes-restore-l0`, integrate-25)

## Merged branches (in order)

| # | Branch @ tip | Verdict |
|---|---|---|
| 1 | `wf1/rulings-rec3` @ `d4d96b79` (contains rulings-rec2 `4a271c0b`; CHAT-88/89 rows, CHAT-90 R-JG note) | register/decision-log rows; regenerate-checks below |
| 2 | `wf1/excr5c` @ `4611d881` (CHAT-87.NAMED-1c + twin sweep) | trial-merged by verify-45 C |
| 3 | `wf1/p3plan` @ `91c12d81` | verify-45 BLOCK (A3) fixed; verify-45b PASS-WITH-NOTES |
| 4 | `wf1/abs73` @ `c748b78f` | verify-45 PASS (B1-B4) |

Not merged: `wf2/fleet-night-2210`, `wf2/coa-cost-emits`, the V3-COA lanes, anything staged in ~/Buildo-wt-rulrec2.

## Conflicts and resolution

(filled in as each merge lands)

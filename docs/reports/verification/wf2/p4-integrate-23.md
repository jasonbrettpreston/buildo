# Verification index — wf2/p4-integrate-23

R-EZ says: *"Findings block the integration until fixed or ruled. The verification report is saved under
`docs/reports/verification/<branch>.md` and the integrate commit cites it."*

One verifier (verify-33) that did not write the work read both branches only. Its report is `cmp`-identical to its source
`~/Buildo-scratch/verify-33/verify-33.md` and is saved under both branch names (the same text covers both branches).

- **Integrate base:** `f0435fe3` (= `wf2/p4-integrate-22`, pushed; `origin/wf2/deep-scrapes-restore-l0`)

## Merged branches (in order)

| # | Branch @ tip | Verdict | Report |
|---|---|---|---|
| 1 | `wf2/chain-tooling-flip` @ `f634e527` (CHAT-55; CHAIN-TOOLING NOT_STARTED to BUILT; R-JU; LDG-10 evidence refresh) | PASS-WITH-NOTES | [chain-tooling-flip.md](chain-tooling-flip.md) |
| 2 | `wf1/chat50-apply` @ `8e5bd056` (CHAT-50 application: 13 superseding adjudication records; M-315 OWED to APPLIED) | PASS | [chat50-apply.md](chat50-apply.md) |

Both reports are the one verify-33 file. Predicted and observed: no textual conflicts.

## Dispositions of the notes

| Note | Disposition |
|---|---|
| N1: LDG-10 evidence text lists per-class #50 results; verifier did not re-derive them | Evidence NOT re-derived here. LDG-10 stays PARTIAL; the refresh was authorised by CHAT-55 only. |
| N2: R-JU row is long; enforcement is only `decision-log.logic.test.ts` | R-JU is locked only by the decision-log (one-off lock). Accepted under the rule-map schema. |
| N3: R-JU is a "provisional id" by its own text | R-JU stays provisional; the final id is the operator's/integrator's. COA-LOCAL-1 must not take JU. |

## Carried forward

- From integrate-22: item 1 (CHAIN-TOOLING flip and LDG-10 evidence refresh) is now DONE by `wf2/chain-tooling-flip`. Still open: EP-PIN-D17 cloud acceptance (operator-run) then the LDG-10 flip; these two hold R-EY condition 8 (step-validate `--all` now names only LDG-10 and EP-PIN-D17). Items 2 (OWED-NIGHT neighbourhoods citation move), 3 (assert_* at commit 1 only; CoA steps and Night A plan) and 4 (everything in p4-integrate-21 / -20) remain open.
- From integrate-21: the CHAT-50 application and the stamp TODO are RESOLVED by M-315 (the 13 superseding records are appended by `wf1/chat50-apply`: 6 ratified, 7 relabelled `orchestrator-p1-mechanical`).

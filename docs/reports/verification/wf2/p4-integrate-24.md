# Verification index — wf2/p4-integrate-24

R-EZ says: *"Findings block the integration until fixed or ruled. The verification report is saved under
`docs/reports/verification/<branch>.md` and the integrate commit cites it."*

Two verifiers that did not write the work read the branches only. Each report is `cmp`-identical to its source
(`~/Buildo-scratch/verify-34/verify-34.md`, `~/Buildo-scratch/verify-35/verify-35.md`).

- **Integrate base:** `0d7edba9` (= `wf2/p4-integrate-23`, `origin/wf2/deep-scrapes-restore-l0`)

## Merged branches (in order)

| # | Branch @ tip | Verdict | Report |
|---|---|---|---|
| 1 | `wf2/coa-local-1` @ `43cc6c65` (CoA Night A: ward fix, migration 281, load_coa_notices nonzero capture) | PASS-WITH-NOTES | [coa-local-1.md](coa-local-1.md) |
| 2 | `wf2/linkcoa-b` @ `9a73771e` (link_coa B-plus, R-JM, COA-D18) | PASS-WITH-NOTES | [linkcoa-b.md](linkcoa-b.md) |

Observed: exactly the two predicted textual conflicts (decision-log test pin; generated Spec 132 handbook), resolved as noted below.

## Dispositions of the notes

| Note | Disposition |
|---|---|
| verify-34 N1: migration 281 header says STAGED, NOT APPLIED | FIXED in a follow-up commit: header marks it applied 2026-10-22 (Night A). Comment only; the test locks the UPDATE text. |
| verify-34 N2: coa explained-diff clause lacks migrations count 268 to 269 and VACUUM dead_ratio 0.17 to 0.9996 | FIXED: both added to the coa explained-diff clause in the existing dated-clause form. |
| verify-34 N3: DB counts 7 above verify-time | Accepted: CKAN drift already explained. |
| verify-34 leftovers: coa_ward_bak_20261022, *_cohort_bak_* tables | Carried forward (operator cleanup). |
| verify-35 Note A: COA-D18 row at defect-ledger.md line 2, outside the table | FIXED: moved next to COA-D16/D17; handbook regenerated so "ledger l.N" citations are right. |
| decision-log pin | Set to what `decision-log --check` prints after the merge; both sides' assertions kept. |
| V3 ratchet 28 vs 29 (load_coa_notices passes #38 after Night A) | See the V3 ratchet note in the integrate-24 commit log and ~/Buildo-scratch/int24/ratchet-note.md. |

## Carried forward

- Swap night (A-swap): parked patches `~/Buildo-scratch/coa1/swap-four-steps.patch` and `~/Buildo-scratch/linkcoa/rjm-descriptors.patch`; swap night also needs migrations 271/274/275. Both were `git apply --check`ed onto the int24 tip.
- Leftover tables `coa_ward_bak_20261022` and the `*_cohort_bak_*` tables: operator cleanup (drop ward_bak after the next --full reconcile is checked).
- VACUUM on `coa_applications` at the next DB night (dead_ratio 0.9996 after the ward UPDATE).
- EP-PIN-D17: deferred by CHAT-54.
- Everything open in p4-integrate-23 and earlier remains open.

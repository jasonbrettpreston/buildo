# HANDBOOK RULE LIST (verbatim copy; nothing trimmed): McStorage policy v2 (backlog doc-16, whole)
Source: backlog/docs/doc-16 - McStorage-policy-v2.md:1-141
Generator: hand-written (DRAFT for the operator), not generated; no rule map
Rules in the whole list: 12 (counted by pattern /^\| P\d+ \|/) · this is part 2 of 2

## 6. Rulings this supersedes (prior text kept, marked)
1. ST-5 "For all lots (MB-38), Layer 3 persists one headline record per (parcel, option)" (~/Buildo-scratch/mcbylaws/McSTORAGE-RULINGS.md:130) and "computed on demand" (:131): superseded by P1 to P7 / A-ST5.
2. ST-6 "every field that a citywide reader queries: an MB-38 derived-store recapture, lead filters, MB-76 bounds" (~/Buildo-scratch/mcbylaws/McSTORAGE-RULINGS.md:158): superseded by A-ST6.
3. ST-3 "Layer 3 write nights ... 500 lots of the night's population" for an all-lot night (:90): superseded by A-ST3.
4. FE-39 "one stored headline per lot and option" and "The detail is computed on demand." (Spec 135:61): superseded by A-FE39.
5. MB-38 queue note 2026-11-12 "all-lot Layer 3 persists the headline record per (parcel, option) only" and "recapture derived stores" (origin:.cursor/MCBYLAWS-QUEUE.md:731 and :735): superseded by A-MB38.
6. MB-75 note "reads the headline records only" (queue :366): superseded by A-MB75. MB-76 note "reads the headline records citywide" (~/Buildo-scratch/mcbylaws/McSTORAGE-RULINGS.md:145; ALIGNMENT Q6): superseded by A-MB76.
7. Spec 88 / M-67 "Spec 88 prices the STORED Layer 3 scenario areas" (origin:scripts/lib/parcel-cost.js:385): amended by A-S88 for the opened lot.
8. Spec 78 O-6 note "persisted for all lots": amended to "opened lots".
9. ALIGNMENT Q4, Q6, Q8, the L3b sweep row (:143) and the S-DETAIL-LATENCY "proposed" wording (:146): superseded.
10. The 2026-11-17 ST-5 note and the 2026-11-18 "ST-5 stands" note and prepared option-3 text (storage-outcome/OUTCOME.md section 7; storage-ondemand/REPORT.md section 6): superseded by A-ST5 (never landed).
11. MF-62 fixed timer (followup-1111/plan.md:69): amended by A-MF62.
12. ~/Buildo-scratch/mcbylaws/McSTORAGE-ALIGNMENT.md:145 (S-STORAGE), :157 (bind to the stored per-option headline), :162 (lead and map surfaces), ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:694 (client timer reading) and MF-51 plan.v2 line 58: amended or superseded as in section 3.
13. Replan and outcome wording: ~/Buildo-scratch/lanes-20261117/replan/SCENARIO-SLICES.md:27 ("the all-lot headline table" built with MB-38 at the Launch gate), the finalplan problem line "All-lot headline fill not built (MB-38)" (finalplan.json:2315, already re-planned 2026-11-18), and ~/Buildo-scratch/lanes-20261117/storage-outcome/OUTCOME.md:56 and :57 (face = one stored headline per lot and option; See details on tap): superseded by P1 to P7 (See details loads with the main page, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:700).
14. Plan facts: task 5.11 "before the MB-38 headline fill" and task L.5b "fill and recapture" (sequence.json): see seq-patch.

## 7. Open points for the operator (only what the record cannot answer; see SITTING.md)
1. Ceiling and purge. The stored size of one record is UNMEASURED (the 500-record write at L.5a measures it). The read payload is 99 to 240 KB of JSON a lot before compression, and the headroom under 1,650 MiB is about 217 to 218 MiB, so about 900 to 2,300 lots if records are not compressed (ESTIMATE). Name the ceiling (lots or MiB) and approve purging untracked, un-owned records not opened for N days (a purged record is just recomputed on next open), or raise the room line.
2. Waits with no screen: confirm that p95 <= 1 s also applies to an owner-input recompute once 5.11 is measured ("updating" until then), and that tracked lots recompute lazily on next open (no re-warm job).
3. Cost: confirm cost is computed at each open from the record's size (not stored), because M-67 keeps price out of Layer 3 and rates move without a Layer 2 stamp. (Your ruling says report numbers are stored; cost is arithmetic on a stored size.)
4. Confirm A-ST5b, the bounded addition to ST-5's cohort clause: until MB-38, a tester's owner-entered rows are kept in the 309 form for that lot (about 304 KiB a lot, ESTIMATE).


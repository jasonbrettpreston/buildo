# Import report 2026-11-19 (plan-to-backlog.mjs, Backlog-home plan v8.1 step R3)

Snapshot docs/reports/plan-import/raw/2026-11-19/ (SHA256SUMS verified). backlog doctor: No duplicate IDs, self-referential dependencies, or dependency cycles found. 304 task files, 16 drafts, 15 milestones, 68 decisions, 17 docs, 25 dated notes (the M-246 note on a task a ruling names).

## Status census (column = Backlog status)
| column | tasks |
|---|---|
| WAITS | 134 |
| LATER | 125 |
| MERGED | 17 |
| DONE | 17 |
| draft | 16 |
| RUNNING | 7 |
| BUILT | 2 |
| DROPPED | 1 |
| OPERATOR | 1 |

## Status words typed in the plan (first word)
| first word | items |
|---|---|
| WAITING | 114 |
| READY | 50 |
| PLANNED | 28 |
| DONE | 17 |
| FOLDED | 17 |
| NOT | 12 |
| NEW | 10 |
| BLOCKED | 9 |
| WAITS | 7 |
| DRAFTED | 7 |
| HELD | 6 |
| DROPPED | 4 |
| RULED | 4 |
| CONDITIONAL | 4 |
| queue | 3 |
| DROP | 2 |
| LATER | 2 |
| + | 2 |
| CONFIRMED-WITH-CHANGE | 2 |
| CONFIRMED | 2 |
| (empty) | 2 |
| RUNNING | 1 |
| MERGE | 1 |
| DEFERRED | 1 |
| operator | 1 |
| OPEN | 1 |
| storage | 1 |
| proposed | 1 |
| R1 | 1 |
| read-only | 1 |
| R-D | 1 |
| WRITING | 1 |
| ruling | 1 |
| process | 1 |
| RE-DATE | 1 |
| OPERATOR | 1 |
| SERIES | 1 |

## Per column by milestone
| milestone | tasks | drafts |
|---|---|---|
| F | 16 | 1 |
| S | 8 | 5 |
| 1-2 | 11 | 0 |
| 1 | 18 | 1 |
| 3 | 5 | 0 |
| 4 | 5 | 0 |
| 5 | 12 | 0 |
| 6 | 52 | 0 |
| 6c | 41 | 5 |
| 7 | 27 | 4 |
| 8 | 42 | 0 |
| 9 | 16 | 0 |
| 10 | 16 | 0 |
| L | 23 | 0 |
| AL | 12 | 0 |

## Per priority
| priority | items |
|---|---|
| Low | 212 |
| High | 78 |
| Medium | 30 |

## Per type
| type | items |
|---|---|
| build | 163 |
| record | 79 |
| decision | 22 |
| db-rehearsal | 14 |
| db-go | 12 |
| check | 11 |
| push | 9 |
| fix | 6 |
| night | 3 |
| db-run | 1 |

## Per project
| project | items |
|---|---|
| McIncrement | 288 |
| McBylaws | 32 |

## Per assignee
| assignee | items |
|---|---|
| @lane | 247 |
| @operator | 41 |
| @runner | 23 |
| @lane-E | 7 |
| @lane-R | 2 |

## Source resolution
resolved 926 (quote differs at the line: 38); plan source tags kept as text 203; unresolved 8 (listed in MISSING-REFS.md, label missing-ref on 8 items).

## Dependencies: folded, re-pointed, removed, dropped
re-pointed onto the merge target (8): PROOF.1 1.6 -> 7.26; 3.3 1.6 -> 7.26; 4.3 1.6 -> 7.26; 5.7 1.6 -> 7.26; R6-CHECK 1.6 -> 7.26; 7.26 1.6 -> 7.26; X:push9 1.6 -> 7.26; 8.37 1.6 -> 7.26
removed, target DROPPED, label dep-dropped (1): LOAD.2 -> LOAD.3
dropped, not a plan task, label dep-dropped (5): LS.11 -> MF-53; LS.5 -> MF-49; LS.9 -> MF-78; LS.9 -> MF-74; 3.2 -> GAP-Q5
re-pointed edge dropped because it would close a cycle (1): R6-CHECK -> 7.26
self-fold or unresolved merge target, imported LATER + unverified (1): CO.2 (FOLDED into CO.2 (coa: the lock is part of the mechanism bui)

## Held-unruled (WAITS + label + open comment; no ruling text invented) (11)
- INFRA.2 guard.mjs: command-line guard refusing any command line (argv, stdin or file) th: plan text "DROP guard.mjs proposed: the lane-guard PreToolUse hook does the job; the hook moves into scripts/ho"
- CHK.4 Automatic check: no maths in the client (no * / % ** , Math.* or toFixed on a de: plan text "DROP proposed: duplicate of src/tests/surfaces/report-no-maths.logic.test.ts (MF-16, FE-05 lock); in"
- 3.2 Hold B9.8 Roof, B9.9, B9.10 out of v1 (payload_only on units_flat, units_pitched: plan text "HELD for ruling"
- J5 Rehearse J5: MB-95 storeys loader fix and 264,600-row backfill: plan text "DROPPED (holistic-r1: approved Q-H2 a: J5 (permits.storeys loader fix and 264,600-row backfill): rel"
- X:J5-go Operator types GO on dev: J5 MB-95 backfill: plan text "DROPPED (holistic-r1: approved Q-H2 a: J5 (permits.storeys loader fix and 264,600-row backfill): rel"
- NOWB-LANE Rule line36: Spec line for MB-95 data job: "permits.storeys is: plan text "DROPPED (holistic-r1: approved Q-H2 a: J5 (permits.storeys loader fix and 264,600-row backfill): rel"
- INFRA-hooks-citation-gate unchanged list (hooks citation gate, prepush suitelock, suitelock per target, ga: plan text "HELD to freeze lift"
- MB-76 + ; a streamed pass or a sample, findings only (A-MB76): plan text "HELD to freeze lift"
- MB-74 MB-74 Rule map out of the Layer 2 version: plan text "HELD under the infra freeze"
- MB-79 MB-79 Gate follow-ups: plan text "HELD to freeze lift"
- MB-91 MB-91 Pre-existing test failures (D-39): plan text "HELD to freeze lift"

## Queue-row items (32); plan word differed from the row word (14)
- MB-96 plan "WAITING" -> row MB-96 LATER
- MB-95 plan "WAITING" -> row MB-95 LATER
- MB-104 plan "WAITING" -> row MB-104 LATER
- MB-18 plan "WAITING" -> row MB-18 RUNNING
- MB-88 plan "WAITING" -> row MB-88 LATER
- MB-101 plan "WAITING" -> row MB-101 LATER
- MB-31 plan "WAITING" -> row MB-31 RUNNING
- MB-86 plan "WAITING" -> row MB-86 RUNNING
- MB-94 plan "WAITING" -> row MB-94 RUNNING
- MB-27 plan "WAITING" -> row MB-27 RUNNING
- MB-111 plan "BLOCKED" -> row MB-111 LATER
- MB-100 plan "WAITING" -> row MB-100 LATER
- MB-44 plan "" -> row MB-44 WAITS
- MB-57 plan "OPERATOR" -> row MB-57 WAITS

## Decisions (68; operator rulings of the register; readings (98) and entries (53) are in the readings doc)
- decision-1 RR-0005 (2026-11-18) names 0 task(s)
- decision-2 RR-0012 (2026-11-15) names 0 task(s)
- decision-3 RR-0014 (undated) names 0 task(s)
- decision-4 RR-0028 (undated) names 0 task(s)
- decision-5 RR-0044 (2026-11-18) names 0 task(s)
- decision-6 RR-0060 (2026-11-15) names 1 task(s)
- decision-7 RR-0080 (2026-11-15) names 0 task(s)
- decision-8 RR-0081 (2026-11-15) names 0 task(s)
- decision-9 RR-0086 (2026-11-15) names 0 task(s)
- decision-10 RR-0087 (2026-11-15) names 0 task(s)
- decision-11 RR-0088 (2026-11-15) names 0 task(s)
- decision-12 RR-0092 (2026-11-15) names 1 task(s)
- decision-13 RR-0099 (2026-11-15) names 0 task(s)
- decision-14 RR-0136 (2026-11-18) names 0 task(s)
- decision-15 RR-0137 (2026-11-18) names 0 task(s)
- decision-16 RR-0139 (2026-11-18) names 0 task(s)
- decision-17 RR-0140 (2026-11-18) names 0 task(s)
- decision-18 RR-0141 (2026-11-18) names 0 task(s)
- decision-19 RR-0143 (2026-11-18) names 0 task(s)
- decision-20 RR-0144 (2026-11-18) names 0 task(s)
- decision-21 RR-0145 (2026-11-18) names 0 task(s)
- decision-22 RR-0146 (2026-11-18) names 0 task(s)
- decision-23 RR-0147 (2026-11-18) names 0 task(s)
- decision-24 RR-0149 (2026-11-18) names 0 task(s)
- decision-25 RR-0150 (2026-11-18) names 0 task(s)
- decision-26 RR-0152 (2026-11-18) names 5 task(s)
- decision-27 RR-0154 (2026-11-18) names 0 task(s)
- decision-28 RR-0156 (2026-11-18) names 0 task(s)
- decision-29 RR-0157 (2026-11-18) names 0 task(s)
- decision-30 RR-0159 (2026-11-18) names 0 task(s)
- decision-31 RR-0161 (2026-11-18) names 0 task(s)
- decision-32 RR-0162 (2026-11-18) names 2 task(s)
- decision-33 RR-0163 (2026-11-18) names 2 task(s)
- decision-34 RR-0164 (2026-11-18) names 1 task(s)
- decision-35 RR-0165 (2026-11-18) names 2 task(s)
- decision-36 RR-0166 (2026-11-18) names 1 task(s)
- decision-37 RR-0167 (2026-11-18) names 1 task(s)
- decision-38 RR-0168 (2026-11-18) names 0 task(s)
- decision-39 RR-0169 (2026-11-18) names 0 task(s)
- decision-40 RR-0170 (2026-11-18) names 0 task(s)
- decision-41 RR-0172 (2026-11-18) names 0 task(s)
- decision-42 RR-0174 (2026-11-18) names 0 task(s)
- decision-43 RR-0176 (2026-11-18) names 1 task(s)
- decision-44 RR-0178 (2026-11-18) names 3 task(s)
- decision-45 RR-0179 (2026-11-18) names 0 task(s)
- decision-46 RR-0180 (2026-11-18) names 0 task(s)
- decision-47 RR-0182 (2026-11-18) names 1 task(s)
- decision-48 RR-0184 (2026-11-18) names 1 task(s)
- decision-49 RR-0186 (2026-11-18) names 0 task(s)
- decision-50 RR-0188 (2026-11-18) names 0 task(s)
- decision-51 RR-0190 (2026-11-18) names 0 task(s)
- decision-52 RR-0192 (2026-11-18) names 0 task(s)
- decision-53 RR-0193 (2026-11-18) names 0 task(s)
- decision-54 RR-0195 (2026-11-18) names 2 task(s)
- decision-55 RR-0196 (2026-11-18) names 2 task(s)
- decision-56 RR-0198 (2026-11-18) names 0 task(s)
- decision-57 RR-0200 (2026-11-18) names 0 task(s)
- decision-58 RR-0202 (2026-11-18) names 0 task(s)
- decision-59 RR-0203 (2026-11-18) names 0 task(s)
- decision-60 RR-0205 (2026-11-18) names 0 task(s)
- decision-61 RR-0207 (2026-11-19) names 0 task(s)
- decision-62 RR-0208 (2026-11-19) names 0 task(s)
- decision-63 RR-0210 (2026-11-19) names 0 task(s)
- decision-64 RR-0212 (2026-11-19) names 0 task(s)
- decision-65 RR-0214 (2026-11-19) names 0 task(s)
- decision-66 RR-0215 (2026-11-19) names 0 task(s)
- decision-67 RR-0217 (2026-11-19) names 0 task(s)
- decision-68 RR-0219 (2026-11-19) names 0 task(s)

## Docs (17)
- doc-1 Increment F requirements (270 bytes)
- doc-2 Increment S requirements (20725 bytes)
- doc-3 Increment 1-2 requirements (883 bytes)
- doc-4 Increment 1 requirements (12690 bytes)
- doc-5 Increment 3 requirements (5406 bytes)
- doc-6 Increment 4 requirements (3137 bytes)
- doc-7 Increment 5 requirements (3154 bytes)
- doc-8 Increment 6 requirements (2775 bytes)
- doc-9 Increment 6c requirements (1003 bytes)
- doc-10 Increment 7 requirements (1765 bytes)
- doc-11 Increment 8 requirements (1320 bytes)
- doc-12 Increment 9 requirements (516 bytes)
- doc-13 Increment 10 requirements (506 bytes)
- doc-14 Increment L requirements (270 bytes)
- doc-15 Increment AL requirements (271 bytes)
- doc-16 McStorage policy v2 (34573 bytes)
- doc-17 Orchestrator readings (not rulings) (31414 bytes)

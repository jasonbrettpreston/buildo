---
id: decision-79
title: "RR-0271 LOAD.1 drives the report now, ST.P1 split"
date: 2026-11-19
status: accepted
source: operator
kind: ruling
---
## Context

task-325 (LOAD.1 vs ST.P1), Option A: ST.P1 (task-265) is split at the record write; LOAD.1 (task-266) carries the compute half for the app search page now (no write, no read-first; numbers inside the tester and admin gate until MB-38 shadow passes); ST.P1 keeps the record write, read-before-compute and the stamp at push 12; task-266 depends on task-123 only, task-265 on task-82, task-259, task-266. The operator's answer to item 2 (MORNING-DECISIONS.md:1061); register row RR-0271.

Tasks named: task-325, task-266, task-265, task-123

## Decision

Operator, verbatim, 2026-11-19: "2. y"

Cite: ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1061

## Consequences

The ruling is in force from 2026-11-19; the dated note (M-246) is on each task it names.

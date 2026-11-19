---
id: decision-81
title: "RR-0278 Report meter counts on report production only"
date: 2026-11-19
status: accepted
source: operator
kind: ruling
---
## Context

task-329 (report meter): the meter counts only when a report is produced, after the address and lot are found; build task SRCH.METER in m-1. task-329 and SRCH.METER were created on the board worktree after this lane's cut and are not in this worktree, so no dated note could be appended by G2 here (no --tasks); the lane that holds them appends it. Register row RR-0278.

## Decision

Operator, verbatim, 2026-11-19: "I should only be charged a report if I find the address and lot I'm looking for and a report is produced"

Cite: ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1082

## Consequences

The ruling is in force from 2026-11-19; the dated note (M-246) is on each task it names.

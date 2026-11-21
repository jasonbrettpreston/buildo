---
id: decision-143
title: "RR-0358 The scorecard rehearsal is waived if it gives no benefit"
date: 2026-11-21
status: accepted
source: operator
kind: ruling
---
## Context

Orchestrator's answer: no real benefit for this read-only run (read-only session; the same command ran on dev three times before; only generated files change and are checked; test-stack data cannot predict the dev side effect). On that answer the rehearsal of task-420 is waived for this one run; the rehearsal rule stands for every other database job; the dev run is still started by the operator at the script's GO prompt.

Tasks named: task-420, task-421

## Decision

Operator, verbatim, 2026-11-21: "does the rehearsal provide a benefit here - if not move on"

Cite: /Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1681

## Consequences

The ruling is in force from 2026-11-21; the dated note (M-246) is on each task it names.

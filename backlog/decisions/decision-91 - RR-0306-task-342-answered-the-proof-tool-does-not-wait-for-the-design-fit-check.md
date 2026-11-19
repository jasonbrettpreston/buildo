---
id: decision-91
title: "RR-0306 task-342 answered: the proof tool does not wait for the design-fit check"
date: 2026-11-19
status: accepted
source: operator
kind: ruling
---
## Context

Operator 2026-11-19 (task-342): the page-proof tool PROOF.TOOL (task-68) does not wait for the design-fit check CHK.6 (task-67) or its elements file (task-345); a missing field is seen on the page (if the search does not return results, we know there is a problem). Task-68 dependency on task-67 is dropped; task-67 and task-345 stay LATER (RR-0305, MORNING-DECISIONS.md:1174: the operator calls the elements file a large build). Task-268 (PROOF.S) is named because it depends on task-68.

Tasks named: task-342, task-68, task-67, task-345, task-268

## Decision

Operator, verbatim, 2026-11-19: "I would agree"

Cite: /Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1178

## Consequences

The ruling is in force from 2026-11-19; the dated note (M-246) is on each task it names.

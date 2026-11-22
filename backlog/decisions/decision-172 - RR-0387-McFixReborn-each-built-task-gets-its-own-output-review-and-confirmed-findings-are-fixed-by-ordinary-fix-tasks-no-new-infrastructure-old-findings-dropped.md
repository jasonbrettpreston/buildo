---
id: decision-172
title: "RR-0387 McFixReborn: each built task gets its own output review and confirmed findings are fixed by ordinary fix tasks; no new infrastructure; old findings dropped"
date: 2026-11-22
status: accepted
source: operator
kind: ruling
---
## Context

Per built Increment 1·B task: compliance, engineering and code-review lenses on the task's files as they stand today; the code reviewer, integration and reality-check seats; a separate grounder rules every finding; the result is saved in the task's review folder with a dated note, status untouched; confirmed CRITICAL, HIGH and MED go into one ordinary fix task per batch through the normal six steps (round 2 is that task's own output review). Nothing is rebuilt. The 771 old unruled findings are set aside. The orchestrator runs the existing review commands; no new infrastructure. First batch of three after task-438 lands, task numbers brought to the operator first. Supersedes OUTPUT-REVIEW-PLAN-v1 and v2.

Tasks named: task-386

## Decision

Operator, verbatim, 2026-11-22: "Approved. You run it.  Let's call this the McFixReborn"

Cite: /Users/brettpreston_macmini/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1941

## Consequences

The ruling is in force from 2026-11-22; the dated note (M-246) is on each task it names.

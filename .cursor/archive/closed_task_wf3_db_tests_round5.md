# Active Task: WF3 — round 5 lead_analytics type-cast + T2 sync
**Status:** Implementation
**Workflow:** WF3 — CI unblock continuation
**Domain Mode:** Backend/Pipeline

## Context
Round 4 (commit 317cce6) updated T1's lead_analytics INSERT but `replace_all` only matched once because T1 was already edited from earlier session — so T2 remained on the old shape. Also surfaced PG type-inference error: `42P08 inconsistent types deduced for parameter $1` — character varying (lead_key) vs text (lead_id) on a shared $1.

## Fix
- T1 line 116: change `VALUES ($1, $1, ...)` → `VALUES ($1, $2, ...)` with `[leadId, leadId]` to satisfy PG type-inference.
- T2 line 176: update to the same shape (lead_id supplied).

## Execution Plan
- [ ] T1 INSERT: split into $1/$2 params
- [ ] T2 INSERT: add lead_id, same $1/$2 shape
- [ ] Commit + push

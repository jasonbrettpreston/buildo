# Active Task: WF3 — `buildWritePlan` refuses the sanctioned class-C whole-table replace
**Status:** Implementation — AUTHORIZED by operator 2026-09-24 ("option A, if compliant with Spec 124/122: standardization, observability, accuracy, scalability, simple")
**Domain Mode:** Backend/Pipeline (`scripts/lib/step/write.js`)
**Execution Provider:** deepseek (brief `.cursor/engine-briefs/wf3-class-c-retract-all-guard.md`); Guardian = claude

## Context
* **Goal:** `load_centreline` (first class-C `staging_full_replace` step) declares `retract:"all"` + `scope:"none"` — the shape `step.schema.json`'s class-C x-rule sanctions ("full_replace must be declared, never silent", Spec 62 L26). `buildWritePlan` throws on it: `[READ write.js:752-756]` `if (retract === 'all' && !scope) throw … would DELETE THE WHOLE TABLE`. That guard predates class C (0h, RE-FREEZE #20) and has no class exemption. The class-C executor `executeStagingReplace` `[READ write.js ~1815-1925]` never reads `plan.delete_sql`; it issues its own `DELETE FROM <table>` inside one txn behind an empty-set guard.
* **Target Spec:** Spec 122 §1.4 + RE-FREEZE #20 (class C); Spec 124 Rules 1, 8, 9, 12.

## Fix (smallest, declared-class keyed)
Exempt ONLY `write_discipline.class === STAGING_FULL_REPLACE_CLASS` from the retract-all/no-scope throw. For that class, `plan.delete_sql` = the unconditional `DELETE FROM <table>` — a truthful description of what the executor does (consumed by `reset.js`'s generated reset), never executed by the ingest path. Every other class keeps the throw unchanged.

## Compliance (Spec 124 / 122) — PASS
* **Standardization:** keyed on the declared `write_discipline.class`, never a step name — one rule for every future class-C step (Rule 8; no per-step hatch, Spec 122 §5.1).
* **Accuracy / nothing hidden:** the declaration stays truthful (`retract:"all"` names the destructive wipe); options B (`retract:"none"`) and C (fake scope) were rejected as false declarations. Rule 9: `grandfathered.json` `load_centreline` entry records the adjudication. Rule 12: `recovery.interrupted` stays keyed on the declared destructive retraction.
* **Observability:** class-C executor already emits its empty-set guard WARN + counters; no new silent path — the executor, not `delete_sql`, performs the wipe, inside one txn.
* **Scalability / simple:** a one-condition change + one delete_sql branch, locked both directions.

## Tests (`src/tests/wf3-class-c-retract-all.logic.test.ts`, SPEC LINK header) — RED first on the current tip
- T1 class C + retract all + scope none → `buildWritePlan` succeeds; `plan.delete_sql === 'DELETE FROM <table>'` (RED today: throws).
- T2 `guarded_upsert` + retract all + scope none → still throws the WHOLE TABLE error (green both sides — the guard is intact).
- T3 one more non-C class (e.g. `upsert_scoped_departure_delete` or a set-based class that accepts retract all) + no scope → still throws.
- T4 `runIngestPhase` on a class-C descriptor dispatches to `executeStagingReplace` and never executes `plan.delete_sql` (spy on the client/pool query texts).

## Execution Plan
- [ ] Engine brief → commit on the programme branch (engine-lands; `write.js` is not a golden fingerprint input, freeze unaffected — verify `generate-template-freeze.mjs --check`).
- [ ] Regression Guardian on the diff.
- [ ] Rebase `wf2/load-centreline` (autostash its uncommitted ②) → re-run the c2d suite (expect 36/36).

## Commit 2 — anti-bypass hardening (operator 2026-09-24: "make sure this will not be used by LLMs to get around the rules")
Measured holes: (1) `scripts/steps/_schema/grandfathered.json` — the Rule 9 adjudication ledger — is NOT in `exec-policy.json` `registry_reserved`, so an engine brief that listed it could self-grandfather; (2) `exec-policy.json` itself is not reserved, so the engine's own fences are editable in principle; (3) `assertGrandfathered` only enforces `write_discipline.guard` [READ validate.js:168] — declaring `class:"staging_full_replace"` (which after commit 1 skips the whole-table guard) needs NO adjudication.
Fix (orchestrator-lands — schema byte + reserved files):
* A. `exec-policy.json` `registry_reserved` += `scripts/steps/_schema/grandfathered.json`, `scripts/lib/exec-policy.json` (the engine can never self-adjudicate or loosen its own fences; only a Claude orchestrator seat under operator ruling edits them).
* B. `step.schema.json` `x-banned-for-new.values` += `"outputs.writes[].write_discipline.class": ["staging_full_replace"]`; `assertGrandfathered` refuses a descriptor declaring class C unless its `grandfathered.json` entry names that exact path+value (same Rule 9 mechanism as guard:"none"). Refused at `pipeline.step()` construction, before any pool opens.
* C. `grandfathered.json` `load_centreline.paths` += the class path (the operator-authorized adjudication, 2026-09-24).
* D. Locks both directions: class-C descriptor WITHOUT the entry → construction throws; WITH it → constructs; `exec-policy.json` lists both reserved paths; engine write to a reserved path → refused (existing fence test pattern in `deepseek-exec-fences.infra.test.ts`).
* Followup (filed, not fixed): `x-banned-for-new.values` also lists `replay:append_unsafe` and `execution.criticality:best_effort`, but the enforcer reads only the guard path — measure which descriptors carry them before generalizing.
Compliance: Spec 124 Rule 9 (banned shape ships only with a dated, SHA-anchored, named adjudication) + Rule 1 (the rule lives in data + a named check, not prose); Spec 08 §C registry_reserved contract.

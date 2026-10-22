# VERIFY-33 (read-only, R-EZ)

Targets: A = wf1/chat50-apply @ 8e5bd056 (base 88124990); B = wf2/chain-tooling-flip @ f634e527 (base f0435fe3).

## Verdicts
- A: PASS
- B: PASS-WITH-NOTES

## A findings
1. scripts/seeds/bylaw/adjudications.json: git diff 88124990..8e5bd056 has 0 deleted lines, 165 added; the added lines are byte-identical (sorted compare) to chat50/chat50-append.patch. Array is 6066 long; last 13 = 6 adjudicator "operator" (all 900.3.10(528)#(528)[SSP] (A)/(B), 3 fields each) + 7 "orchestrator-p1-mechanical" (literals_not_expressed x5, not_an_override x2). Each cites 2026-10-21-batch-p#CHAT-50 and supersedes the prior record.
2. Re-pin: expected-172.json and expected-4d.json diff = only "commit" (6effeffd -> 88124990) and "table_version" (e70902... -> 22a82d...). Totals untouched, so 368/29/76/83 and the 172 set are identical to the previous pin. coa-scorecard.logic test passes.
3. M-315 (69a_mcbylaw_register.md) OWED -> APPLIED text matches CHAT-50 (6 ratified, 7 relabelled mechanical; verbatim quote "pushing - 1y 3. yV3"). Rule map status owed -> active; 133 handbook OWED count 39 -> 38 and section 3 row removed, consistent.
4. Checks on tip all clean: spec-split-check, decision-log (141 decisions), bylaw-handbook, step-handbook, layer2-input (table_version 22a82d53cb09).
5. Vitest (decision-log, handbook-rule-map, programme-backlog.infra, gate-chain-status.infra, coa-scorecard, bylaw-layer2-vocab): 6 files, 243 tests pass. (No separate layer2-input test file exists on this tip.)

## B findings
1. CHAIN-TOOLING NOT_STARTED -> BUILT (programme-items.json). Justified: R-DJ (1)-(4) at 124a:472 and R-EC at 124a:805; evidence paths all resolve (hooks-composition.infra.test.ts, gates/chain-status.mjs, cloud-pre-dispatch.mjs, precommit-budget.json, verification/wf2/p4-integrate-22.md). `precommit-budget.mjs --check`: docs-only 20.41 s <= 25.3, registry 25.91 s <= 27.5, hook sha matches. ai-env-check prints "tooling BUILT".
2. R-JU (124a:960) matches CHAT-55 (flip, supersession record, LDG-10 evidence refresh). It adds only citations/seven-question text. No R-JU anywhere else; R-JM..R-JT are not present on any branch or worktree yet (coa-local-1 has only R-JB/JK/JL), so no collision today; R-JU sits above the reserved block, so COA-LOCAL-1 must not take JU.
3. Spec-split: 124a:213 (M24 hash-locked) byte-untouched; R-JU is the dated note; Spec 122:1036 carries an in-place SUPERSEDED note. spec-split-check clean (8342 citations, 0 dangling).
4. step-validate --all (output in ~/Buildo-scratch/verify-33-sv-b.txt): hard stop no; condition 8 fails read only "LDG-10, EP-PIN-D17" on all 13 hits; E1 ratchet PASS (28 listed); 29/43 V3.
5. Checks clean on tip: decision-log (145 decisions), both handbooks, layer2-input. Vitest same six files: 246 tests pass.
Notes:
- N1. LDG-10 evidence text now lists per-class #50 results (class 1-5 PASS, link_parcel_abutments converted). I did not re-derive each; CHAT-55 only authorised a "refresh". Status correctly stays PARTIAL.
- N2. R-JU row runs long and its enforcement is only decision-log.logic.test.ts (one-off lock); acceptable under the rule-map schema.
- N3. R-JU is a "provisional id" per its own text; the final id is for the operator/integrator.

## Merge prediction (git merge-tree + archived merged tree checks)
- A + B: no textual conflicts (tree fbe14bce). A onto f0435fe3: no conflicts (9dbfd4d4). B onto f0435fe3 is the base.
- Decision-log pin: A adds no log, so no 144/145 collision; merged tree decision-log --check clean at 145 decisions.
- 69a (A only), 133 handbook (A only), 132 handbook (B only), bylaw-rule-map (A) vs steps rule-map (B): disjoint files.
- On the merged tree all five generator checks are clean (layer2-input table_version 22a82d53cb09 from A).
- Caution: A's layer2/table_version re-pin was made at base 88124990; anything else landing on adjudications.json before merge changes the pin.

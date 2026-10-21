# VERIFY-31 report: wf2/v3-restart-1 @ ae81879c (diff 88124990...ae81879c)

Verdict: PASS-WITH-NOTES. Read-only; no edits, no DB, no full suite. Throwaway worktree removed without --force.

## Findings

1. R-JK is faithful to CHAT-52 and does not stretch R-AR.1. PASS.
   - Operator record batch-q.json CHAT-52: "retire ... insert arm ... under a new register row"; the log is imported verbatim and `decision-log --check` re-derives it clean.
   - Evidence all exists: defect-ledger.md:226 (N-D1 row, 158/158 on 2026-02-20, geom NULL 0/158, no trigger); descriptor scripts/load-neighbourhoods.descriptor.json:530 (deviations[0], liveness check boundary_rows_inserted); 124a:787 says "R-AR.1 covers a run-ledger gate, not an insert arm", which R-JK repeats. R-JK borrows only the two-part form (row + deviations[]) from R-AR.1 (124a:183) and the sibling R-FY (124a:613). Test ledger-status-form locks the row contains all the evidence strings.
   - Note A (stale text): 124a:787 (tail of the R-GT row) still says "N-D1, back to OPEN ... RULING-OWED ... A ruling is owed." It is now superseded by R-JK. Harmless history but contradicts current state; suggest a "closed by R-JK" suffix in a later pass.
   - Note B (small tension): the descriptor's adjudicated_by still cites "R-AR.1", and that token is what satisfies condition 9 today, while R-JK says R-AR.1 does not cover the arm. The real authority is R-JK; R-JK states the descriptor citation moves at the next recapture night. Acceptable, but the debt is real and should be tracked on that night's list.

2. R-JL: legitimate but optional; recommend KEEP (low-cost), with a caveat. PASS-WITH-NOTES.
   - decision-log.mjs: `decision_vocab` is per log and maps a raw value to one meaning (scripts/analysis/decision-log.mjs:350-367, laneFields keeps one vocab map). CHAT-52 and CHAT-53 share raw value "approve" in one raw file, so both are approve (needing a row) or both no_ruling. Confirmed: the mixing limit is real.
   - Alternative: make CHAT-53 a separate log with no_ruling resting on R-ED/R-EY (as CHAT-51 was). That would need splitting the operator's raw batch-q record, which breaks "verbatim record". So the row is the cleaner path. R-JL is marked one-off in the rule map, so it does not inflate the in-force counts. It is the unrequested row: the lane disclosed it.
   - Caveat: R-JL is a record of a read-only note, not a rule that changes behaviour; its enforcement ref is only the decision-log test. Acceptable as a register entry for an approved decision; if the operator dislikes clutter, the no_ruling split is the only alternative.

3. Neighbourhoods reads V3 legitimately. PASS.
   - `step-validate --all --fast --v3-json` and `--all --v3-json`: 28/43 read V3, E1 ratchet PASS (28 listed). Plain `--all --fast` and `--staged`: 29/43. The JSON lists exactly the 28 ratchet slugs (no extras, none missing), sorted, includes neighbourhoods. So 28 strict / 29 plain is correct; the 29th is load_coa_notices, V3 in plain view and V2 as-converted (fast #38 CAPTURE-NONZERO coa_notice_variances), matching the test comment "plain --all does not".
   - Caution: the task text said the --v3-json run gives 29. It gives 28. The 29 appears in plain --all and --staged. R-JK's "29 steps read V3 under `--all`" is true only for the plain view; reword to "plain view" at some point (cosmetic).
   - Ratchet JSON is generator shape (comment, recorded_at, v3 sorted, baseline). Diff is one added line "neighbourhoods". Test asserts length 28.
   - Condition 9: `exceptionsSignal('neighbourhoods', d).fails == []` (test passes). adjudicated_by is unchanged ("Fold CF-4 ... R-AR.1"), so source_fingerprint is not moved and condition 9 is not broken. See Note B.

4. Test counts match reality. PASS. decision-log --check prints 31 logs, 144 decisions, 124 register rows, 4 no_ruling (test: 144, 4). Ratchet length 28 (test: 28). Handbook count line "367 mapped ids: 251 lock" is up to date (`generate-step-handbook --check` clean), consistent with +2 rule-map rows (R-JK active/lock, R-JL one-off/lock).

5. Checks run, all green:
   - spec-split-check --check: clean (8340 citations, 0 dangling).
   - decision-log --check: clean.
   - step-validate --all (full, 69 s) and --all --fast and --staged: R-EY E1 PASS, E2 PASS. Failing fast invariants #30/#31/#38/#40 are the pre-existing CoA/permits conversion items (identical on 07936122 pre-diff; load_coa_notices V2 reproduces there too).
   - generate-step-handbook --check and generate-bylaw-handbook --check (339 rules): up to date.
   - vitest: ledger-status-form (13), v3-label-enforcement (73), decision-log (44), handbook-rule-map (26): 156 passed. step-conformance.infra + hooks-composition.infra (fast invariants, incl. #52): 755 passed.

6. Gates measurement (v3r1/v3-gates-measure.md). Central claim holds; PASS-WITH-NOTES.
   - CHAIN-TOOLING: programme-items.json status NOT_STARTED, "promised" parts (1)-(4). Part 1: R-DJ (1) and hooks-composition.infra pass. Part 2: R-EC (124a:805) registers budgets, fast #52 PASS (docs-only 20.41 <= 25.3, registry 25.91 <= 27.5, hook sha matches). Part 3: chain-status.mjs prints "tooling NOT_STARTED" line for sources (confirmed live). Part 4: cloud-pre-dispatch.mjs covers all logic_variables keys (R-DJ (4), cloud-pre-dispatch.logic). So functionally built; only the status field is stale, and it is read by chain-status.mjs. Evidence text still says "measured gap today" (pre-R-DJ).
   - Note C: R-BC (e)(2) (124a:213 and Spec 122:1036) still reads "within +10% vs the chain-start baseline". R-DJ (2) / R-EC replaced it with absolute pinned budgets and say "Amends R-BC (e)". No chain-start baseline measurement is cited. The operator's flip decision should state that the absolute budget supersedes the +10% wording. Also R-BC (e) says "checked ONCE at chain end"; flipping early is a sequencing choice the note correctly leaves to the operator.
   - LDG-10: status PARTIAL; fast #50 prints "pending: EP-PIN-D17 cloud proof (PARTIAL; operator-run)" with classes 1, 2, 4, 5, plus converted set, all PASS. The item's evidence text still lists #44 (i), h:undeclared and link_parcel_abutments as pending; those are closed per #50, so the note's "only pending item is EP-PIN-D17" is TRUE, and the note correctly says to refresh the text.
   - EP-PIN-D17: "WHAT FLIPS THIS TO BUILT" = pre-dispatch dead_ratio reading + one green pinned chain-sources cloud run; matches the note. blocks lists 36 slugs on each item (verified).
   - Not independently verified: the note's per-step projections after the three flips (coa, link_coa_to_parcels, enrich_coa_zoning go V3; 28 to 31; 32 under plain --all) and the day estimates (labelled estimates). I did not rebuild those.

## Recommendation
Integrate. Keep R-JL. Optional follow-ups: Note A (stale 124a:787 tail), Note B (descriptor citation of R-JK on the next recapture night), Note C (state that R-EC budgets supersede the +10% clause when the operator flips CHAIN-TOOLING).

# Verification index — wf2/p4-integrate-22

R-EZ says: *"Findings block the integration until fixed or ruled. The verification report is saved under
`docs/reports/verification/<branch>.md` and the integrate commit cites it."*

One lane was verified by a verifier that did not write the work and read it only. The report is copied verbatim from the
orchestrator's scratchpad and is `cmp`-identical to its source.

- **Integrate base:** `88124990` (= `wf2/p4-integrate-21`, pushed; `origin/wf2/deep-scrapes-restore-l0`)

## Merged branch

| # | Branch @ tip | Verdict | Report |
|---|---|---|---|
| 1 | `wf2/v3-restart-1` @ `13d308b5` (CHAT-51/52/53; R-JK N-D1 retirement, R-JL gate measurement; neighbourhoods reads V3) | PASS-WITH-NOTES | [v3-restart-1.md](v3-restart-1.md) (= `~/Buildo-scratch/verify-31/verify-31.md`) |

Merged merge-only. verify-31 reviewed `ae81879c`; `13d308b5` adds only the note fixes below (one 124a text edit, no code, no data).

## Notes and how each was resolved

| Note (report) | Resolution | Where |
|---|---|---|
| A: 124a:787 still says N-D1 "A ruling is owed" | The paragraph now ends "RULED 2026-10-21: R-JK (operator CHAT-52) ... kept as history". | 124a:787 |
| B: the descriptor's `adjudicated_by` still cites R-AR.1 | Explicit owed item OWED-NIGHT on the next recapture night: move `scripts/load-neighbourhoods.descriptor.json` deviations[0] `adjudicated_by` from R-AR.1 to R-JK. Kept out of the `bundled-night` citations file because its count (143) is locked. | R-JK (124a:958); `~/Buildo-scratch/v3r1/coa-cutover-night-plan.md` |
| Cosmetic: "29 steps read V3 under `--all`" | R-JK now says the ratchet 28 is also the strict `--v3-json` count and plain `--all` reads 29 because it also counts load_coa_notices (V2 as-converted). | R-JK |
| C: R-BC (e)(2) / Spec 122:1036 still says "+10% vs the chain-start baseline" | Not changed (programme-items.json is the operator's). The exact flip edit and the supersession wording (R-DJ (2) / R-EC absolute budgets supersede it) are drafted. | `~/Buildo-scratch/v3r1/chain-tooling-flip-draft.md` |
| D: LDG-10 evidence text lists closed pieces as pending | Refreshed text drafted in the same file; status stays PARTIAL. | same |
| R-JL (unrequested row) | KEPT (verify-31 finding 2): the decision-log vocabulary is per log, so CHAT-53 needs a row; marked one-off in the rule map. | R-JL, `rule-map.json` |

## Results at this tip

- V3: strict ratchet 28 listed (generator-written), plain `--all` 29 read V3; neighbourhoods reads V3, admin-visible (#51 PASS).
- Checks: see the integrate commit's run; the full suite, tsc, step-validate `--all`/`--staged`, spec-split-check, decision-log, both handbook checks and system-map were re-run on this merged tree.

## Carried forward (open at this tip)

1. CHAIN-TOOLING flip (operator's yes) and the LDG-10 evidence refresh, per the draft; EP-PIN-D17 cloud acceptance (operator-run) then the LDG-10 flip. These three hold R-EY condition 8 for 13 pending steps (`v3-gates-measure.md`).
2. OWED-NIGHT: the neighbourhoods citation move (Note B).
3. The four assert_* steps are at commit ① only; the CoA ② steps and Night A plan are in `coa-cutover-night-plan.md`.
4. Everything carried forward in `p4-integrate-21.md` and `p4-integrate-20.md` is still open.

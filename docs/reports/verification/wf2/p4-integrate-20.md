# Verification index — wf2/p4-integrate-20

R-EZ says: *"Findings block the integration until fixed or ruled. The verification report is saved under
`docs/reports/verification/<branch>.md` and the integrate commit cites it."*

The branch merged by `wf2/p4-integrate-20` was verified in one round by verify-26. The verifier did not write the work
and read it only. The report is copied verbatim from the orchestrator's scratchpad
(`~/Buildo-scratch/verify-26/verify-26.md`) to [`spec-133.md`](spec-133.md). The copy is `cmp`-identical to its source.

- **Integrate base:** `edd18529` (= `wf2/deep-scrapes-restore-l0`, pushed)

## Merged branch

| # | Branch @ tip | Range verified | Verdict | Report |
|---|---|---|---|---|
| 1 | `wf2/spec-133` @ `3ea9bf52` (Spec 133 By-law Handbook: generator, register reader, generated rule map, arms (iii-b) and (iv-b) keyed by spec id, size cap, M-260, R-IY, CHAT-43) | verify-26 read `0e46fe68`; `3ea9bf52` is the follow-up that fixes its notes | PASS-WITH-NOTES | [spec-133.md](spec-133.md) |

## verify-26 notes and how each was resolved

| Note | Resolution | Commit |
|---|---|---|
| 3: six family parse misses (M-88, M-90, M-170 write the old `5.10.x` form; M-218, M-221 write the zone shorthand `x.<g1>.<g2>`; M-100) | `familyOf` now matches `5.10.<g1>.<g2>` (its own family, like 10.5) and `x.<g1>.<g2>` (the same family as 10.<zone>.<g1>.<g2>). Red first: `docs/reports/red-evidence/spec133/bylaw-handbook-verify26-red.json`. General fell from 185 to 180 in-force rows; 36 groups. **M-100 stays general:** it cites `40.10.20.10`, a use-list article, which is neither form (carried forward below). | `3ea9bf52` |
| A (cosmetic): m.150 headline ends at "e.g." | The headline sentence split skips `e.g.`, `i.e.`, `etc.`, `vs.`, `cf.`, `approx.`, `incl.`, `no.`; no headline ends at an abbreviation (locked). | `3ea9bf52` |
| 5: `124a §B36` collides with the Layer 2 section | This branch's section is renamed §B37 in its three places (heading, the R-IY row, the M-260 row). | merge |
| 5: `124:288` next free | Reads `R-IZ`; R-IY is named as allocated. | merge |
| 7: `precommit-budget.json` conflicts, count 18 | Not hand-merged: re-measured with `precommit-budget.mjs --measure` on the merged hook. Chain-era count is 18 in `hooks-composition.infra`. | merge |
| (d): regenerate | `generate-bylaw-handbook --write`, `generate-step-handbook --write`, `generate-bylaw-layer2-input --write` (the M-260 row changed a Layer 1 input hash), `npm run system-map`. | merge |

## Merge conflict resolutions

- `124a`: both sides kept. R-IY follows R-IX in the register table; Layer 2's §B36 stays; this branch's section is appended as §B37.
- `scripts/steps/_schema/rule-map.json`: R-IL..R-IX and R-IY both kept; `132` regenerated.
- `decision-log.logic.test.ts`: 98 decisions (97 on the base plus CHAT-43).

## Carried forward (open at this tip)

1. **M-100 cites `40.10.20.10`**, an old-numbering use-list article that matches no family form; it sits in General. A
   ruling or a reader change is needed to place it; it was not guessed.
2. **Headlines are a clipped first sentence** (verify-26 note A, cosmetic): m.176's headline drops the operative height
   rule. The register governs, as the page says.
3. **44 M-rows cite clauses from more than one family** and sit under only the first (declared in the generator and in 124a §B37).
4. Everything carried forward in `p4-integrate-19.md` is still open.

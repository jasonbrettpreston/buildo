# Verification — wf2/refresh-snapshot-v3

- Branch: `wf2/refresh-snapshot-v3` @ `7bf77076`. Parent is `6d63db74`.
- Lane: verify-11. This lane is independent and did not author the work (Spec 124 R-EZ). It ran read-only.
- Commit: one commit touching 3 files: `programme-items.json` STA-2/STA-3, the generated `122-programme-backlog.md`, and the refresh_snapshot scorecard block in `2026-08-31-pilot8-refresh-snapshot-assessment.md`.

## Checks run

| # | Check | Result |
|---|---|---|
| 1 | Read the full diff | STA-2/STA-3 `gate.blocks` changed from `["refresh_snapshot"]` to `[]`. `applies_when` is kept. `last_reviewed` is now 2026-10-20 and the evidence text was appended. Nothing else changed. |
| 2 | `programme-items.schema.json:101` quoted at 7bf77076 | Resolves. The `$comment` says: "A FORWARD-DECLARED cutover_prereq … may declare blocks:[] instead, on the condition that applies_when is present: the item is armed the moment a future descriptor's blocks[] entry is added". The schema permits the change. |
| 3 | refresh_snapshot never matches `applies_when` | Confirmed. `scripts/refresh-snapshot.descriptor.json` `recovery.reset` is prose ("No TRUNCATE/rebuild mechanism exists — …"), not `"generated"`. |
| 4 | `checkCutoverPrereqs` skips refresh_snapshot | Confirmed at `scripts/analysis/step-validate.mjs:888-909`. Line 893 skips any slug not in `blocks`. Lines 900-901 skip a slug whose descriptor does not match `applies_when`. STA-2/STA-3 are `BUILT`, so line 903 (`status !== 'BUILT'`) would never produce a violation either way. |
| 5 | Spec 124a R-T and RS-D-STA citations | Both resolve. `124a_step_standard_policy_appendix.md:133` R-T contains the RS-D-STA ruling: `gate.applies_when` scopes a `cutover_prereq` and names STA-2/STA-3 and `checkCutoverPrereqs`. The doc comment at `step-validate.mjs:873-887` agrees. |
| 6 | Other readers of `gate.blocks` | `blockingItemsFor` (`step-validate.mjs:597`, used at :6289) only prints. `blocksBatchingCount` (:581) and `generate-programme-backlog.mjs:88` look only at `'batching'`. `generate-programme-backlog.mjs:109` renders `—`, which matches the committed md. `generate-conversion-roadmap.mjs:360` ignores BUILT items. No gate or cutover outcome changes. |
| 7 | Tests asserting these `blocks` values | None assert STA-2/STA-3 `blocks`. `programme-backlog.infra.test.ts` §7 uses fixture items, and the real-data mirror at :545-565 expects `[]` either way. |
| 8 | Targeted tests at the tip | `npx vitest run src/tests/programme-backlog.infra.test.ts src/tests/template-freeze.infra.test.ts`: 2 files, 169/169 passed. `npx vitest run src/tests/step-conformance.infra.test.ts -t refresh_snapshot`: 5 passed / 708 skipped, including the stale-block lock for refresh_snapshot. |
| 9 | Generated backlog drift | `node scripts/violations/generate-programme-backlog.mjs --check`: clean, exit 0. |
| 10 | Other citations: `refresh-snapshot.js:250`, D-P1, permits assessment §6.2 | All resolve. `scripts/lib/compute/refresh-snapshot.js:250` is the `sync_runs` read. D-P1 is at permits assessment :125 and :144. The commit message shortens the path to `refresh-snapshot.js:250`, but the 39-line `scripts/refresh-snapshot.js` is a different file. |
| 11 | Precedent "STA-1 / HB-1 / CEIL-1 form" | HB-1 and CEIL-1 match: `cutover_prereq`, `blocks:[]`, with `applies_when`. STA-1 does not match today: it is now `nice_to_have`, SUPERSEDED, with no `applies_when` (pinned at `programme-backlog.infra.test.ts:665-674`). |
| 12 | Full suite and `step-validate --all --fast` at the tip | Reproduced: suite 17,825 passed / 0 failed (4 skipped, 794 files) — matches claim; `step-validate --all --fast` exit 0 |

## Findings

| # | Severity | Finding | Evidence |
|---|---|---|---|
| F1 | NOTE | The commit says "applies_when is kept, so both items stay armed for any future 'generated' declarer". That overstates what the code does. With `blocks:[]`, `checkCutoverPrereqs` never consults `applies_when`, because line 893 `continue`s first. A future step that declares `recovery.reset:"generated"` would not be blocked unless someone adds it to `blocks`. That is the schema's own definition of "armed" (schema:101). The practical effect is nil because both items are BUILT. | `step-validate.mjs:893`, schema:101 |
| F2 | NOTE | The cited STA-1 precedent no longer has the cited form: it is now `nice_to_have`, SUPERSEDED, with no `applies_when`. HB-1 and CEIL-1 are valid precedents. | `programme-items.json` STA-1; `programme-backlog.infra.test.ts:665-674` |
| F3 | NOTE | The regenerated scorecard block records a failing suite: "2809/2810 passed (suite success=false)". The one failure is refresh_snapshot's own stale-block lock, which fired during the `--write` run while the old block was still stale. That test passes at the tip (check 8). No other assessment report in `docs/reports/*.md` carries `suite success=false`. The committed text is accurate as a record of that run, but it reads as a red suite. Regenerating with `--fast`, the fleet convention, would avoid this. | `2026-08-31-pilot8-refresh-snapshot-assessment.md` "Test suite (item iii)" |
| F4 | NOTE | `refresh-snapshot.js:250` is shorthand. The real path is `scripts/lib/compute/refresh-snapshot.js:250`. | check 10 |
| F5 | NOTE (collision) | v3-label-strict (0935a5cb) also regenerates the same refresh_snapshot scorecard block. It changes lines ~757-791 (Score 17/17, G3 2/2, migrations count 273). This branch changes lines ~836-865 (item iii, Rules 2/3/12, Enforced-green 12/14). The two hunks may merge textually, but the result would splice two different runs. Integrate-11 must re-run `step-validate --step=refresh_snapshot --write` after both land, under dblock if it is non-fast. `programme-items.json` edits do not collide: v3-label changes only ADMIN-1 evidence, around :1520. | both diffs |
| F6 | NOTE (interaction) | The two branches do not contradict each other or handle refresh_snapshot twice. This branch removes STA-2/STA-3's display-only blocking (programme ③ cutover-prereq). v3-label's E3 `HARD_GATE_EXCEPTIONS` (`gates/v3-label.mjs:48-54`) is a separate V3-label exemption for the D-P1 `sync_runs` purity read, expiring at permits ③. v3-label's condition (8) calls `checkCutoverPrereqs`, which returns no violation for refresh_snapshot on either branch because STA-2/STA-3 are BUILT. Both commit messages agree refresh_snapshot stays V2 until permits ③. | `v3-label.mjs:48-54,180-191` |

No BLOCKING findings.

## Verdict

**PASS-WITH-NOTES**. Full suite 17,825/0 and `step-validate --all --fast` exit 0 reproduced at 7bf77076.

# verify-12f: wf2/v3-backfill-9 fix @ b0ce5ba4

Lane: verify-12f (R-EZ independent verification, operator y 2026-10-20). Read-only. I did not write this work.
Branch: `wf2/v3-backfill-9` @ `b0ce5ba4` (worktree `~/Buildo-wt-bf9`), parent `a906623f` (verify-12c: BLOCK, `scratchpad/verify-12/wf2-v3-backfill-9.md`).
Commit: `b0ce5ba4` fix(124_step_standard_policy): verify-12c corrections. 6 files: citations JSON, defect-ledger.md, 122_split_manifest.json, Spec 124, 124a, grandfathered.json.

## Verdict: PASS-WITH-NOTES

B1 is fixed and so are N1–N4 and N7. Counts, M34 and the gates reproduce. The notes below are minor and none blocks integrate-12.

## Checks (verify-12c finding → state at b0ce5ba4)

| verify-12c item | Result | Evidence |
|---|---|---|
| B1 g1-21: R-FL citation removed | FIXED | `grandfathered.json` link_parcels `why`: the only change is that ` [register: Spec 124 R-FL; V3 condition-9 backfill 2026-10-20]` is gone (word-diff). Citations JSON g1-21 went from b/R-FL/now to **c**/null/none, and `searched` names pilot 7 (Planning), the 08-30 assessment, git log and O4 rows. The only file still citing R-FL is grandfathered.json:46 (link_massing E1, g1-8). |
| B1 R-FL trimmed to pilot 3 | FIXED | 124a R-FL now says "the E1 clear-then-reassign UPDATE ... and the pre-conversion full-gate prior-run read and phase ternary are retired as declared". It states explicitly that it does not cover link_massing's keyed DELETE (O4 row 5, `2026-10-03-plan-wf2-registry-truth.md`:720; checked, it reads "Operator: YES — a removed link also flags the parcel") or link_parcels' DELETE. R-FL is used by g1-8 (E1 grandfathered), g1-11 (S11/D-21 gate read, pilot3 :157/:223) and g1-12 (S12 ternary, :158). All three are within the trimmed text. |
| N1 R-GF limited to the 2026-09-29 y | FIXED | The row now covers the O-1 scope cut only (0x plan :364 "operator APPROVED 2026-09-29 ("y")" and :403, both checked) and says no entry cites it. g4-28 (LH-D8) → c, with searched/note. g4-31 → R-GB (heritage plan :86 row 6 "skipEmit per primary", checked; :104 is the parity row, checked). JSON: 0 entries cite R-GF. |
| N2 five confirmed rows | FIXED | R-FZ, R-GA, R-GB, R-GC and R-GL headers read "source record dated <date>; operator confirmed 2026-10-20". Each body cites `docs/reports/2026-10-20-operator-queue-snapshot.md`:1639. That line reads "weak rows R-FZ/R-GA/R-GB/R-GC/R-GL confirmed" (checked). |
| N4 g4-35 → (b) via R-GG | RIGHT | The descriptor deviation[7] says it is "Intentionally NOT declared in inputs.reads.tables". R-GG :413 reads "an intentional omission is an explicit deviation" (checked). Now b/R-GG/bundled-night. |
| N(R-GI) :546 | FIXED | The row cites :546. The 0y plan :546 reads "Operator D2/D3 (authorization 2026-10-02): redirect cap declared deviation ..." (checked). |
| M-D11 / N-D8 re-cites | CORRECT | defect-ledger M-D11 → R-FX and N-D8 → R-FY. The massing plan :91 "M-D11 \| deviation \| per-1000-batch txn → `txn_scope:"step"`" and the neighbourhoods plan :51 "`txn_scope:"step"` → **NB-D8**" were both checked, and both plans are operator-authorized (R-FX, R-FY). The descriptor entries g3-17 and g3-33 were re-cited the same way (bundled-night). R-FT now says it covers address_points only. |
| N3 weak (b) re-checks | SOUND | g3-4 and g3-10 → c: D-8 decides only the blocking:false half, and R-FJ now says so. g3-8 → c: the parcels txn widening was orchestrator-ruled, and R-FT says so. Keeping g2-21 (R-FS EH-D2) and g1-1 (R-FI) is defensible, as verify-12c said. |
| N7 R-FY NB-D vs N-D | FIXED | The row maps NB-D1…NB-D16 to N-D1…N-D20. |
| R-FF note | ADDED | The row says its text is the trace's later disposition, ratified by consolidation decision 3. |
| M34 re-performed | BYTE-IDENTICAL | Recomputed independently. The 39-line block at 124a:527 (R-FC…R-GO) hashes to the manifest `content_sha256` `19c880f9…`. The Spec 124 stub at :268 equals `buildStub(M34, 2026-10-20)` line for line (4 lines). The 124a bridging line equals `"Moved from Spec 124 — " + evidence`, with the `---`/anchor/blank framing. Manifest `commit` = a906623f (HEAD at refresh). Across 124a, only the 12 corrected rows changed (R-FF, FJ, FL, FT, FY, FZ, GA, GB, GC, GF, GI, GL), plus the bridging line, §B17 (5) and §B21. |
| Counts | MATCH | Citations JSON (199 entries): a 16 + 19 R-BH = **35**, b **143**, c **40**, bundled-night **102**, now **57** (+19 R-BH). All 57 `now` append_texts are present in their files (mechanical: 0 missing). Applied-tag count in files = 57. Diff vs parent: exactly the 11 entries named in the commit changed (g1-21, g3-4, g3-8, g3-10, g4-28 → c; g4-35 → b; g3-17, g3-27 → R-FX; g3-33, g3-52 → R-FY; g4-31 → R-GB). §B17 (5) and §B21 say 102 / 143 / 40 / 57+19. |
| V3 labels | UNCHANGED | `step-validate --all --fast --v3-json` → V3 = {geocode_permits, link_parcel_abutments} = high-water mark; 30 "no rule id" lines (same as verify-12c measured at a906623f). |
| Suite | 17,867 pass / 0 fail (4 skip) | `npx vitest run --exclude "**/*.db.test.ts"` at b0ce5ba4, exit 0 (`f/bf9-suite.log`); same total as verify-12c measured at a906623f |
| `step-validate --all --fast` | exit 0 | `scratchpad/verify-12/f/bf9-sv.log` |
| `spec-split-check --check` | clean | 39 moves, 7,122 citations, 0 dangling, budgets held, totality holds. |

## Findings

**BLOCKING:** none.

**NOTE**

- N1. g4-35 is (b) with an empty `evidence` array; its cite is only in `note`. Every other (b) entry carries `evidence[]`. Add the :411/:413 quotes for uniformity.
- N2. g3-27 and g3-52 keep `decision_date` 2026-09-23 (the address_points date) after being re-cited to R-FX (2026-09-24) and R-FY (2026-09-25); g3-17 and g3-33 likewise. This is cosmetic.
- N3. R-GF is now a register row that no entry cites. That is honest and stated in the row and §B21. Integrate-12 may keep it as a historical record.
- N4. verify-12c's integration notes still stand: the 124a §B20/§B21 renumber against integrate-11, R-GP as the next id, and the handbook-1 rule-map entries for R-FC…R-GO. The fix does not touch them.

## Reproduction

- `node scripts/analysis/step-validate.mjs --all --fast --v3-json=…` → exit 0 (DATABASE_URL unset; no DB touched).
- `node scripts/analysis/spec-split-check.mjs --check` → clean.
- `node scratchpad/verify-12/f/cit.mjs` (parent vs tip entry diff + counts), `f/m34.mjs` (stub/bridging identity), plus an inline block-hash check.

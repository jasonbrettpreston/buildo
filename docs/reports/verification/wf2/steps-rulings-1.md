# verify-17: wf2/steps-rulings-1 @ 0e0c9f4b (base 885c2ad2)

**Verdict: PASS-WITH-NOTES.** No blocking findings. Every claim I was asked to check holds. There are four notes and one PIN for the integrator.

Lane: verify-17 (R-EZ), independent and read-only, 2026-10-20. Target: commits 028c9b28 and 0e0c9f4b. I made no writes in the repo; scratch files are under `scratchpad/verify-17/`. Both of my throwaway worktrees were removed with plain `git worktree remove`, and both removals were accepted.

## Checks

| # | Check | Command / method | Result |
|---|---|---|---|
| 1a | Each "Approved:" text in R-HN…R-IF is verbatim from its source | Script `verify-17/rows.mjs`. It takes each row's `` `<log>#<ref>` ``, looks up the expected text, and requires the row to contain `Approved: <text>` (expected text is the page `recommendation`, the page `note` for a "change", or the chat `recommendation`). For CHAT-22 rows it also requires the family recommendation to appear in quotes. | **19/19 verbatim.** Sources: `proposed-rulings.json`, `page-v3-rulings.json`, `batch-c.json`. All 8 CHAT-22 family quotes match. |
| 1b | R-HR carries the change note | Same script, plus a read of the row and of the Spec 123 §3.1 note | The note is verbatim ("Approve with the evidence condition: …listed only; no recommendation."). The rule clause states the evidence condition. Spec 123 gets an appended "AMENDED 2026-10-20" note and §3.1 itself is left as it was. |
| 1c | R-HQ and R-HU are per entry | Compared the row text with `proposals[].covers.entries` | R-HQ: "ratified per entry, never as a general rule". It lists 8 entries, the same 8 the proposal names; coa COA-D3 is listed only and is ruled by R-IE. R-HU lists 6 entries, the same as the proposal. Each row says a new entry needs its own ruling. |
| 1d | R-IF zero readers | `git grep -n -E 'avg_latency_ms\|api_errors\|api_health' -- src scripts mobile migrations supabase docs` | 174 hits in 58 files. **No reader of coa's values.** `mobile/`, `migrations/` and `supabase/` have no hits. In `src/` the only hits are tests: the coa, permits and assert_network_health legacy oracles, plus `quality.infra.test.ts:1248-1252`, which is a different name (`parcels_api_errors`). Producers that are not coa: `scripts/load-permits.js`, and `scripts/quality/assert-network-health.js:118-121` (its own p50 row). Everything else is golden captures, reports and records. This matches the row and the patch-set §Ruling 6. |
| 1e | Decision logs import cleanly | `node scripts/analysis/decision-log.mjs --check` | clean: 7 logs, 38 decisions, 46 register rows, 73 citations, every log matches its raw record |
| 1f | Raw records are byte-faithful | `cmp` against the scratchpad sources; re-ran `split-page.mjs` on scratch copies, then `diff -r` and `cmp` on the output | `proposed-rulings.json` and `page-v3-rulings.json` are byte-identical. `split-page.mjs` reproduces `answers/` (5 files) and `entries.json` exactly. The batch-c record differs from its source only by the declared split: CHAT-14 and CHAT-21 removed, `operator_quote_2` promoted to `operator_quote`, `split_from` and `source_operator_quote_1` added. CHAT-15…20 and CHAT-22 are unchanged. |
| 2 | No converted descriptor fingerprint moved | `step-validate --all --fast`; inspected the 028c9b28 diff and the `golden-fingerprint.infra.test.ts` scope | `stale-fingerprints=0`, "stale fingerprints: none". Five entries are cited now, in 4 files. The fingerprint covers (step, descriptor, notes, compute) and is locked only by `golden/<slug>/post/`. `assert_coa_freshness` and `compute_coa_cost_estimates` have only `pre/` captures. `grandfathered.json` and `defect-ledger.md` are not fingerprint inputs. Nothing locked moved. |
| 3 | Apply list holds 141 entries | Script `verify-17/cit.mjs`: JSON parse, a tokenising duplicate-key scan, and a diff against the 885c2ad2 version | Well-formed. 0 duplicate keys, 0 duplicate refs. 203 entries; bundled-night = **141 = 102 (base) + 35 (c→d) + 4 (new s1-1…s1-4)**. 40 entries went c→d; the only class-c entry left is g3-45 (neighbourhoods N-D1). No non-c entry changed. Every bundled entry has `append_text` containing its `rule_id` and a `deviation_index`. |
| 4a | Patch applies cleanly | `git apply --check` in a detached worktree at 0e0c9f4b | OK |
| 4b | Red tests: 5 red / 1 green before, 6 green after | Applied the test file only (`--include='src/tests/*'`), then the rest | Before: **5 failed, 1 passed** (T1–T5 red, T6 green). After: **6/6 green**. `src/tests/steps/link_coa_to_parcels/`: 3 files, 38 passed. Name filter `link_coa_to_parcels link-coa-to-parcels`: 5 files, 90 passed. Patched `step-validate --step=link_coa_to_parcels --fast`: `hard-stop=true (G8)`, `stale-fingerprints=3`, as the patch set says. I reversed the patch with `git apply -R` and removed the worktree. |
| 4c | Leftover `scratchpad/stepsrul/patch-wt` (inspected read-only) | `git -C … diff` and `cmp` against my patched worktree | Registered worktree, detached at 028c9b28, dirty: 3 modified files plus the untracked test. Its tracked diff and test file are byte-identical to the committed patch. **Not removed** (NOTE N4). |
| 5a | Spec 124 untouched | `wc -l`; `git diff 885c2ad2 0e0c9f4b --stat -- 124_…md` | 378 lines, no diff |
| 5b | Spec split check | `spec-split-check --check` | clean: 41 moves, 7656 citations, 0 dangling, budgets held |
| 5c | Next-free-id counter | read 124:288 | still says "next free id `R-HN`" (PIN below) |
| 6 | Full checks in a detached worktree at 0e0c9f4b (node_modules and mobile/node_modules symlinked by literal path) | `step-validate --all --fast` | R-EY **4/43**; E1 PASS, E2 PASS, E3 OFF |
| | | `spec-split-check --check` | clean |
| | | `generate-step-handbook.mjs --check` | up to date |
| | | `decision-log --check` | clean (as in 1e) |
| | | `report-schema --check` | current; RS-0…RS-11 PASS, RS-5 WARN (54) |
| | | `tsc --noEmit` | exit 0 |
| | | `vitest run --exclude '**/*.db.test.ts'` | 815 files passed, 1 skipped; 19388 tests passed, 4 skipped, 936 todo; exit 0 |
| 7 | Projection spot-check | Script `verify-17/proj.mjs`: applies each step's bundled-night `append_text` in memory and recomputes with the gate's own `exceptionsSignal` (`scripts/analysis/gates/v3-label.mjs`) | **load_wsib:** uncited 11/17 now, 0/17 after. **link_parcels:** 4/9 now, 0/9 after. **load_heritage:** 11/12 now, 0/12 after. For all three, `step-validate --step` lists condition (9) as the only failing condition (`fails: 9 deviations[] …`). The projected flips to V3 are plausible. |

## Findings

No BLOCKING findings.

- **N1 (NOTE): one test-count figure in the patch-set does not reproduce.** The patch-set says the existing link_coa_to_parcels suites are "4 files, 53 tests". With the patch applied I measured 3 files / 38 tests in `src/tests/steps/link_coa_to_parcels/`, and 5 files / 90 tests under the name filter. Every suite I ran was green. Only the count's scope is unclear; the red/green claim holds.
- **N2 (NOTE): batch-c raw record has a leftover quote name.** Its decisions keep `quote_ref: "operator_quote_2"`, but the split record promotes that quote to `operator_quote`. The mapping is declared in `split_from`, and `decision-log --check` accepts the record. This is cosmetic.
- **N3 (NOTE): "four cited now" is four files holding five entries.** The entries are g1-21 and g1-26 (`grandfathered.json`, R-HX), g5-15 (CCT-D10, R-HY), g5-6 (`assert_coa_freshness`, R-HS) and g5-17 (`compute_coa_cost_estimates`, R-HR). None moves a locked fingerprint (check 2).
- **N4 (NOTE): leftover `scratchpad/stepsrul/patch-wt` needs an owner's decision.** It is still a registered worktree at 028c9b28 with the patch applied and uncommitted changes, so plain `git worktree remove` will refuse it. Its contents match the committed patch exactly, so nothing would be lost. Whoever removes it must not use `--force` (forbidden by the constraints). The changes have to be undone first, for example with `git apply -R` and by deleting the untracked test and the symlink.
- **PIN ID-COUNTER-124-288 (for the integrator, not a finding against this lane).** Spec 124:288 still says "next free id `R-HN`". R-HN…R-IF are now used (provisional), so the counter should move to R-IG at integration.

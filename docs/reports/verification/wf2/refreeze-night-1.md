# verify-22: independent verification of `wf2/refreeze-night-1` (ee5ed572..8accd2b5)

**Verdict: PASS-WITH-NOTES.** I found no blocking problems, and the branch can be merged onto `ac78d5dd`. There is one expected conflict, in the test pin file `src/tests/decision-log.logic.test.ts`; its resolution is below.

Verifier: lane verify-22 (R-EZ), read-only. Every run used throwaway detached worktrees under `<scratchpad>/verify-22/`, with `node_modules` and `mobile/node_modules` symlinked by literal path. Afterwards I removed the symlinks by literal path and each worktree with a plain `git worktree remove`. There was no DB access, no Python and no `.env` read. `~/Buildo-wt-night1` is unchanged: HEAD is still 8accd2b5 and the only untracked entries are the `data` and `mobile/node_modules` symlinks.

## Check table

| # | Check | Result | Evidence |
|---|---|---|---|
| 1a | Raw records byte-identical | PASS | `cmp` on `chat-decisions/2026-10-21-batch-{e,f,i}.json` against `docs/reports/decisions/raw/2026-10-21-chat-batch-{e,f,i}/…`: all three identical. |
| 1b | `decision-log --check` | PASS | At 8accd2b5: clean, 15 logs, 61 decisions, 62 register rows, 100 citations, 0 owed, 3 no_ruling. |
| 1c | Routing and verbatim "Approved" text | PASS | CHAT-27 routes to 124a R-II (line 940) and CHAT-35 to R-IJ (line 941). CHAT-28 routes to 124a with no row, as a dated note on R-II and on the line-457 bundled-night line. `grep -cF "Approved: <recommendation>"` returns exactly 1 for each of CHAT-27, CHAT-28 and CHAT-35. |
| 1d | Spec 124 | PASS | 378 lines. The range diff is a single hunk, `@@ -288 +288 @@` (next free id is now R-IK). |
| 2a | Item (2) not applied | PASS | No `sync_runs` or `pipeline_runs` line changes in any `.js`, `.mjs`, `.ts` or `.sql` file in the range. `scripts/refresh-snapshot.descriptor.json` changes only its `last_measured` (item 7). The only library code changes are `scripts/lib/step/index.js` (R-IG `extra_counters`), `scripts/lib/compute/link-coa-to-parcels.js` (R-ID), `scripts/lib/assert-global-coverage-fields.js` (AGC-D8 guard), and a line re-cite in `witness-runner-set.mjs`. |
| 2b | Cutover ③ unchanged (EP-PIN-D17) | PASS | I compared the per-step lines of `step-validate --all --fast` at the base and at the tip. Every step keeps its stage (converted or pending). `EP-PIN-D17` still appears on `coa`, `link_coa_to_parcels`, `enrich_permits` and the other pending steps. E2 cutover: PASS. |
| 3 | 143 citations | PASS | Script `verify-22/scripts/cite.mjs` reads the citations JSON at 8accd2b5: 143 `bundled-night` entries with 143 distinct refs. Each `deviations[i].from === key`, `append_text` occurs exactly once and as a suffix, and the count was 0 at ee5ed572. s1-4 is not doubled; it ends `…phase index [register: Spec 124 R-ID; V3 condition-9 rulings 2026-10-20]`. |
| 4 | Red first | PASS | Each lock was run with the 491685bd test file on the parent e2c8e108, and green at 491685bd (6 files, 131/131). The red results at the parent are listed after this table. |
| 5a | POST goldens carry the night's fingerprint | PASS | All 102 POST goldens: `lib_fingerprint` 93b059a9…, `git_head` e2c8e108 (see NOTE-2). All 102 post traces also carry `git_head` e2c8e108. I recomputed `computeLibFingerprint`: 93b059a9 at the tip, fef97e27 at the base. |
| 5b | stale = 0, G8 has 0 unexplained | PASS | `step-validate --all --fast` at 8accd2b5: all 43 G8 rows read `stale-fingerprints=0 unexplained-diffs=0`. R-EY: 28/43 steps read V3; E1 ratchet PASS (28 listed). |
| 5c | Explained-diffs spot-check (5 cases) | PASS | Results are listed after this table. |
| 5d | No descriptor or notes text in captures or traces | PASS | `git grep` over the golden pre and post captures and `docs/reports/witness/` found 0 files for each of: `[register: Spec 124`, `V3 condition-9`, `U+2019`, `a building-less lot is outside`, `section_anchor_prefixes`, `adjudicated_by`, `read_this_way`, `Spec 124 R-GT`, `"why"`, `deviations`. `has_bldg` and `"guard"` occur 0 times at both the base and the tip. |
| 6 | R-IJ deletion | PASS | Script `subset.mjs` with `git show 491685bd^:…/cohort-entities.trace.json`: the orphan has 39 statements and 39 distinct fingerprints. `sources-full-forced-5.trace.json` at 491685bd^, 491685bd and 8accd2b5 also has 39/39, with no missing and no extra fingerprints, so the sets are equal. The orphan premise holds: there is no `golden/link_wsib/post/cohort-entities.json`, and `cohort-entities` occurs 0 times in any `recapture.json`. `golden/link_wsib/cohort.json` targets only forced-4 and forced-5. The merged tree has no orphan trace. |
| 7 | Ratchet | PASS | In a worktree at 491685bd (4 V3 steps), I ran `step-validate --all --fast --v3-json=…` and then `v3-label.mjs --write …`. Result: v3[] = 28, and `cmp` against 8accd2b5's `v3-label-high-water-mark.json` is byte-identical. The gate's 28 V3 steps equal the ratchet list. |
| 8 | Full checks at 8accd2b5 | PASS (see NOTE-1) | `vitest run --exclude **/*.db.test.ts`: 819 files passed and 1 failed. The failure is a flake (NOTE-1); that file passes alone, 121 passed, 2 skipped. `tsc --noEmit`: exit 0. `step-validate --all --fast`: exit 0. `spec-split-check --check`: clean, 8262 citations, 0 dangling. `generate-step-handbook --check`: up to date. `decision-log --check`: clean. `report-schema --check`: current; the RS-5 WARN (54) is the same as at the base. `generate-last-measured --check`: 0 changed and a 0-entry stale baseline. Assert-descriptor generators `--check` (global-coverage, data-bounds, parcel-sanity): no drift. The DB suite was skipped as instructed. |
| 9 | Hygiene | PASS | No `data/`, `node_modules/`, `mobile/node_modules/` or `.env` paths in the 8accd2b5 tree or the range diff. The added-line scan found no `postgres://` credentials, `DATABASE_URL`, `DEEPSEEK_API_KEY`, `sk-…` keys or `password=`. All 292 DB targets in captures and traces are masked as `postgres:***@127.0.0.1:54322`. The file list matches the item set; the full mapping is in the scope section below. |
| 10 | Merge preview onto `ac78d5dd` | 1 expected conflict | Details in the merge preview section. |

**Red-first results at the parent e2c8e108:**
- `type-counters.logic`: 5 of 6 tests red. One error is "descriptor declares check tier_1a_type_confirmed with no function". The other assertions fail on the counters and `extra_counters` being undefined.
- `notes-vocabulary.logic`: 2 of 2 red. It expects `U+2019` and `section_anchor_prefixes`.
- `has-bldg-guard.logic`: 4 of 4 red. `HAS_BLDG_GUARD` is undefined and the guard is missing from the descriptor.
- v3-label append-once lock: 2 of 2 red. For example, "g1-1 … expected +0 to be 1", and s1-4 still names the counters.
- `ledger-status-form` night-1 re-cite: 3 of 3 red. The rows still cite R-AZ.
- R-IJ trace lock: red with exactly `["docs/reports/witness/link_wsib/post/cohort-entities.trace.json"]`.

**Explained-diffs spot-check (5c):**
- **address_points (drift):** in `post/standalone.json`, records_updated goes 5→21, unchanged 525366→525350, and content_hash 3d1b48fe→6868f868. This matches the why.
- **load_centreline (drift):** raw 64392→64394, filtered 47330→47331, non-street 17062→17063, last_modified 16 Oct→20 Oct, version 9ea3bb53→a6a54602, and the row count 47330→47331. This matches.
- **coa (drift):** coa_applications 33966→33975 and lifecycle_status_history 381698→381730. This matches the stated "33966 -> 33975" and "381698 -> 381730".
- **link_coa_to_parcels (code):** all three POSTs read `tier_1a_type_confirmed` 30906 and `tier_1a_type_tolerant` 692, up from null at the base, and coa_corpus_total 33966→33975. This matches (see NOTE-4).
- **link_massing (run-clock):** parcel_buildings is still be97a014 with 535039 rows, and the parcels hash goes d1fdafb5→2aeee545 in sources-full and standalone. This matches.

## Findings

**BLOCKING:** none.

**NOTE-1: the unit suite has one flaky failure that the night did not cause.** `src/tests/deepseek-exec-fences.infra.test.ts`, test "directory junction … PATH_OUTSIDE_REPO", failed with `ENOENT … deepseek-exec-test-*/.git/objects` at `fs.cpSync` (`deepseek-exec-harness.ts:95`). That points to a tmpdir race. Re-run alone at 8accd2b5 it passes (121 passed, 2 skipped). The range does not touch this file or its helper, and the lane's `suite-final.txt` shows 820/820.

**NOTE-2: the captures' `git_head` is e2c8e108, not 491685bd.** The night captured on the working tree at e2c8e108 and then committed as 491685bd, which is the usual capture-then-commit form. All 102 POST goldens and 102 post traces agree, and their freshness is proven by stale=0.

**NOTE-3: the explained-diffs count is 371, not 382.** I count 207 new keys and 164 existing keys with a night-1 sentence appended, which makes 371 entries. There are 0 duplicate keys and 0 removed keys. This equals the lane's own `night1c/run/explain-report.json` (appended 164 + added 207). The commit message makes no 382 claim, so the 382 in the brief looks wrong. G8 shows 0 unexplained either way.

**NOTE-4: one explanation in link_coa_to_parcels still says the counters are not carried.** In `docs/reports/golden/link_coa_to_parcels/explained-diffs.json`, the `tier_1a_type_*` entries (summary and pipeline_runs) still open with the pre-restore text: "deviations[] 4: the two bridge type counters are not carried at ② … the legacy per-run counter retires." The appended night-1 CODE sentence then says the counters are restored. The why is correct as a whole, but the opening clause now contradicts the R-ID restore. A text-only cleanup can be queued; it does not affect G8.

**NOTE-5: 491685bd on its own was not green.** The 8accd2b5 message says the full suite failed 2 tests at 491685bd: step-conformance found stale R-DK net-new scorecards for load_bylaw_map_areas and link_parcel_abutments. 8accd2b5 fixes this, but 491685bd is red if bisected alone. PIN NETNEW-SCORECARD-HEAD is open for this.

**NOTE-6: "104 of 106" is consistent.** 102 POSTs and 2 load_centreline PREs were retaken. The 2 enrich_permits PREs were not (PIN EP-PRE-REPLAY).

**NOTE-7: cosmetic `last_measured` format.** In `scripts/refresh-snapshot.descriptor.json` (and likely other descriptors), `last_measured` is now written as one-line JSON by the item (7) resync. `generate-last-measured --check` is clean; this is formatting only.

**NOTE-8: report-fields `--check` shows report-only gate failures that are not new.** It is current but shows `gates FAIL (report-only): RF-2, RF-5, RF-6, RF-8, RF-10`. The same line appears at the base ee5ed572, at the tip and in the merged tree.

## Scope (file list against items)

| Commit | Files changed | Item |
|---|---|---|
| c6b7574a | batch-E log and raw record, Spec 124:288, 124a (R-II and §B33), Spec 132 (regenerated), rule-map, decision-log test | CHAT-27 |
| e2c8e108 | batch-F log and raw record, 124a note, decision-log test | CHAT-28 |
| 491685bd | `scripts/lib/step/index.js`, `scripts/lib/compute/link-coa-to-parcels.js`, `type-counters.logic` (new) | Items (1) and (8) |
| 491685bd | `load-neighbourhoods.notes.json`, `notes-vocabulary.logic` (new) | Items (3) and (5) |
| 491685bd | `assert-global-coverage-fields.js`, its generator, its descriptor, `has-bldg-guard.logic` (new) | Item (4) |
| 491685bd | About 35 descriptors and 3 assert generators (citations), `v3-label-enforcement` test | Item (6) |
| 491685bd | `last-measured-stale-baseline.json` (84 → 0), `p2c4-last-measured` and `link_neighbourhoods/violations` tests (LN-D6 10486 → 13499, PIN LN-D6-REMEASURE), `ledger-status-form` R-GT re-cites | Item (7) |
| 491685bd | 156 golden files, 105 witness files (including `_catalog.json` and 2 load_centreline PRE traces), 7 regenerated scorecards, maxbld inventory trace hashes, specs 00/49/57 (new test paths in generated blocks), defect-ledger rows AGC-D8, N-D21, N-D22 and LCTP-D11 marked "Applied", 9 red-evidence JSONs | Recapture and records |
| 491685bd | batch-I log and raw record, R-IJ and §B34, rule-map, `step-registry` comment, the orphan trace deletion | R-IJ |
| 491685bd | `step-schema.logic` KNOWN_CHANGED (load-bylaw-map-areas descriptor), `witness-runner-set.mjs` line re-cite (index.js:6605 → :6632) | Follow-ons |
| b4f6d82d | ratchet file | Ratchet |
| 8accd2b5 | 2 scorecards | Scorecards |

Nothing outside the stated scope changed.

## Merge preview onto `ac78d5dd` (`wf2/p4-integrate-17`)

`git merge-tree --write-tree --name-only ac78d5dd 8accd2b5` gives tree `ba14ea84`. It exits 1 with one conflicted file. The merge base is ee5ed572.

- **Overlapping files (3):**
  - `docs/reference/maxbld-report-field-inventory.{md,json}` auto-merge on disjoint lines. int17 changes the bylaw `vocab.json` hash; the night changes the trace hashes. `report-fields.mjs --check` on the merged tree reports "current".
  - `src/tests/decision-log.logic.test.ts` conflicts.
- **Conflict hunk 1, the decision-count pin:** int17 has `toBe(76)` and the night has `toBe(61)`. Both come from a base of 58 (int17 +18, night +3), so the resolution is `expect(r.decisions).toBe(79)`.
- **Conflict hunk 2:** both sides append tests after the GREEN test.
  - Keep int17's "chat batch G" and "chat batch H" tests first.
  - Close H with `  });` and a blank line.
  - Then keep the night's "chat batch I", "R-IJ lock", "chat batch F" and "chat batch E" tests. E is closed by the shared `  });` that follows.
- **Simulated resolution:** applied only in a `git archive` export of `ba14ea84` under `<scratchpad>/verify-22/merged/`, not in the repo.
  - `decision-log --check`: clean, 17 logs, 79 decisions, 75 register rows, 120 citations, 0 owed, 3 no_ruling.
  - `spec-split-check --check`: clean, 8266 citations, 0 dangling.
  - `generate-step-handbook --check`: up to date.
  - `report-schema --check`: current, RS-5 WARN (54) as at the base.
  - `computeLibFingerprint`: 93b059a9, unchanged. int17 touches nothing under `scripts/lib/step/`, no step descriptors and no goldens or witnesses, so the night's captures stay fresh after the merge.
  - Orphan-trace check on the merged tree: none.
  - `decision-log.logic` in the export: 39 of 40 pass. The R-IJ lock fails only because the export is not a git repo (`git ls-files` exits 128). Re-run it in the real integrate worktree after resolving.
- **Integrator's post-merge checks:** the full suite, `decision-log --check` (expect 79 decisions and 75 register rows), and `step-validate --all --fast` (expect G8 stale=0 and unexplained=0, and 28 steps on V3).

Scratch files are in `<scratchpad>/verify-22/`: the scripts `cite.mjs`, `caps.mjs`, `subset.mjs` and `pick.mjs`; the outputs `suite.txt`, `tsc.txt`, `sv.txt`, `sv-base.txt`, `sv-night.txt` and `v3.json`; `mt.txt`, `merged-dl.ts`; and the merged export `merged/`.

# Verification: wf2/p4-rulings-7

- Branch: `wf2/p4-rulings-7` @ `b348e360` (commits `f40a3f29` fix(51_source_coa) COA-D12/D13/D14, `b348e360` docs(124) R-EW/R-EX + §B17 + M33)
- Base: `6d63db74` (origin/wf2/p4-rulings-6)
- Lane: verify-11 (Spec 124 R-EZ independent verification; this lane did not write the work). Read-only; 2026-10-20.

## Checks run

| # | Check | Result |
|---|---|---|
| 1 | Both commit diffs read in full (11 + 6 files) | Done |
| 2 | New register rows R-EW (124:272), R-EX (124:273): text matches the commit claims; lock files exist and pass | PASS |
| 3 | M33 move: R-DG…R-DM removed from Spec 124 §5, added under 124a §B18; the 7 rows at the parent vs the 7 §B18 rows at the tip compared byte-for-byte (`cmp`) | IDENTICAL. None lost or duplicated (0 R-DG…R-DM rows left in 124). Manifest M33 `line_count` 7, `commit` 6d63db74 (same convention as M32, which records its base cd7a649e) |
| 4 | Citations in §B17 conflict and V3 tables resolve at b348e360 (31 checked) | 30 resolve with the quoted text. 1 has a wrong line number (F1) |
| 5 | Conflict table covers the 20 claimed rulings (R-DX, R-DY, R-DZ, R-DN, R-DP, R-ET, R-EU, R-EV, R-EQ, R-ES, R-BZ, R-CZ, R-DA, R-DK, B6/0x, G/G8, #38, template freeze/RE-FREEZE, 122 §1.0, 123 G8) | All 20 present. No conflict found on reading the code |
| 6 | Red-first at parent 6d63db74 (throwaway detached worktree with the tip's 3 test files copied in) | Red confirmed. Counts differ from the committed artifacts (F2) |
| 7 | Same test files at the tip (coa dir, dispatch, capture-rerun-proof, spec124-register-locks, spec-split.infra) | 6 files, 112/112 pass |
| 8 | COA-D12/D13/D14 code does what the commit claims | Yes (details below) |
| 9 | No `scripts/lib/step/**` or `scripts/steps/_schema/**` change (the "no RE-FREEZE" claim) | `git diff --stat 6d63db74 b348e360 -- scripts/lib/step scripts/steps/_schema` is empty: PASS |
| 10 | "Three multi-primary INGESTORs; coa the only seen-column descriptor" (measured claim) | Reproduced: only coa, heritage and zoning use `externals[].target`; only load-coa has `"written": "seen"` |
| 11 | Full suite, `step-validate --all --fast`, test:db | Reproduced: suite 17,842 passed / 0 failed (4 skipped, 795 files); `step-validate --all --fast` exit 0; test:db 888 passed / 0 failed (17 skipped) |

### Citations verified (file:line at b348e360 → the quoted text is present)
- `scripts/lib/step/index.js`:920 B6 refuse text ✓; :1052 "R-DX (iii): a union group keeps one prior sub-block PER MEMBER" ✓; :1144 `byTarget[r.target] = o.written` ✓; :1159 `by_target: byTarget` ✓
- `scripts/steps/_schema/template-freeze.json`:312 "Library internals … only the phase ORDER per shape and the shape enum are frozen" ✓; `scripts/analysis/gates/captures.mjs`:332 lib_fingerprint text ✓
- Spec 123:310 G8 "zero unexplained diffs … source_fingerprint matches the current step" ✓; Spec 122:137 "zero_writes is asserted, not asserted-to" ✓; 122:379 ✓; 122a:651 RE-FREEZE #29 ✓
- `step.schema.json`:750 `"declared_drift": {` ✓, :766-775 the idempotent_rerun enum ✓; `gates/net-new.mjs`:20 `rerun_proof.answer === "PASS"` ✓
- `load-heritage.js`:240-242 and `load-zoning.js`:361-362 read `acquired.primaries` and `written.by_target` ✓ (the "already read the 0x shape" claim holds)
- Spec 124 at the tip: :238 R-DN "the same int emit #38 reads, never a second count source" ✓; :240 R-DP ✓; :247 R-DX "each member keeps its own truth" / `acquired.primaries[id]` / `{selected:false, reason:"mode"}` ✓; :248 R-DY `written.e<i>.{inserted, updated, errors}` ✓; :249 R-DZ "Counter `written.touched`", `IS DISTINCT FROM $1`, "goldens project it out or explain it (R-DA)" ✓; :266 R-EQ ✓; :268 R-ES ✓; :269 R-ET `lifecycle_status_history_written` / `ledgerWritten` ✓; :270 R-EU ✓; :271 R-EV "(b) the re-upsert changes no status" ✓
- 124a:251 R-BZ "Compute purity is a closed answer" ✓; :391 R-CZ "A capture is reproducible from committed data alone" ✓; :392 R-DA ✓; **:409 R-DK ✗ (F1)**

### Red-first detail
- At the pure parent, with the tip's tests: `dispatch.logic` 10/11 RED (B6 refuses before any I/O); `capture-rerun-proof.logic` 12/38 RED; `compute.logic` (tip version) 10/10 green.
- At the parent with only the D12 skeleton (`coa_active:{}`, `coa_closed:{}`) applied in the throwaway worktree: `dispatch.logic` 6/11 RED. Every failure is a real zero read: `records_fetched: 0` vs 6, skip_rate 0 vs 16.67, e1.errors 0 vs 1, max_days_stale 0 vs 78, touched undefined vs 3. This is the D13 defect as described.
- At the tip, all green.

### Code review of the fixes
- **D12:** `emits[0].skeleton` now has top-level `coa_active: {}` and `coa_closed: {}`, which is the key `index.js`:909 reads (`emit.skeleton[e.id]`). Correct.
- **D13:** `runView(ctx)` reads `acquired.primaries[id]` (selected members only) and `written.by_target.coa_applications` in the final pass, and the flat block plus `members` in the pre_write pass. It is pure.
  - The dispatch test drives the real `ingestPrimaries` and `makePreWriteGate`.
  - It reproduces runWithPool's hand-off `{acquired: ingest.acquired, written: ingest.written}` (index.js:7560) rather than calling runWithPool itself.
- **D14:**
  - The `coa_applications` target declares `declared_drift`, with why and liveness set to check `records_touched`. The new INFO check reports `written.touched`.
  - `capture-rerun-proof.js` adds mode `seen_drift`, which returns `seen_touch_only` only when three things hold: rewritten == touched, row delta 0, and an unchanged projected md5. Anything else gives `rewrote`/FAIL; a missing hash or touched value throws.
  - `seen_zero_writes` gives FAIL, and a seen drift with no check liveness throws.
  - At the tip, `rerunTables(coa descriptor)` returns `coa_applications: seen_drift (last_seen_at, key application_number, records_touched)` and `lifecycle_status_history: strict`.
  - The seen column is validated by `quoteIdent` before it is interpolated into the SQL.

## Findings

| ID | Class | Finding | Evidence |
|---|---|---|---|
| F1 | NOTE (fix at integration) | The §B17 R-EX conflict row cites R-DK as `124a:409 "a rerun-zero proof on every POST"`. At b348e360, 124a:409 is §B17's own R-DX row. R-DK sits at **124a:471** (§B18, moved by this same commit). At the parent, R-DK was at 124:238, so `124a:409` never resolved. The quote and verdict are correct; only the line number is wrong. | `sed -n 409p`; `grep -n 'a rerun-zero proof on every POST' 124a` → 427 (the citation itself), 471 (the row) |
| F2 | NOTE | The committed red artifacts record an earlier version of the tests: red-d12 5/6, red-d13 3/6, red-d14 10/38. The committed tests are larger: dispatch.logic has 11 tests, and capture-rerun-proof is 12/38 red at the parent rather than 10/38. §B17 already says the red-d14 `touchedFromRecordsMeta` test was later renamed. Red-first is genuine for every new test (all red at the parent, all green at the tip), but the stated counts cannot be reproduced against the final test files. | Runs above |
| F3 | NOTE | Stale citations caused by this branch: R-ET (124:269) and 124a §B15:343 cite `load-coa.js`:262 `ledgerWritten`, :301 and :383. Those were correct at 6d63db74. At the tip they are **:315, :361, :443**, because runView added about 60 lines. The R-ET conflict row says "the one source is kept", which is true, but the line numbers were not updated. | `git show 6d63db74:…load-coa.js \| sed -n '262p;301p;383p'` vs `grep -n` at the tip |
| F4 | NOTE | PIN R-EW-LOCKS calls the older hand-built compute locks "a closed list" but never lists them. It exists only as prose: 124a:459, the R-EW row and the ledger. No programme item or file names the slugs, so the list is closed in name only. | `git grep R-EW-LOCKS` → 3 prose hits |
| F5 | NOTE | Besides fixing D13, the compute changes two emitted values:<br>• `records_deduplicated` and `zoning_designation_null`'s row base change from `feature_count` to `rows_shaped - duplicate_key_count`.<br>• `fetched` drops its `?? rows_parsed` fallback.<br>The commit body explains this ("the runner's own kept.length"), and coa has no POST capture yet, so G8 is unaffected. The first capture should confirm legacy parity for `records_deduplicated`. | load-coa.js diff |
| F6 | NOTE | Of the six removed hand-built `compute.logic` tests, all are re-covered in dispatch.logic except the `zero_records` violation==1 (empty-feed) case. Only `zero_records.violations==0` is asserted now. | `grep zero_records src/tests/steps/coa/*.ts` |

No BLOCKING findings.

## Cross-branch collisions (for integrate-11)

| Item | rulings-7 (b348e360) | v3-label (0935a5cb) | Action |
|---|---|---|---|
| 124a §B17 | "Conflict checks and V3 admission tables for R-EW, R-EX" (124a:401) | "V3 admission tables for R-EY, R-EZ, R-FA, the conflict check, and the bundled RE-FREEZE night" (124a:398) | Same section number. Renumber one (e.g. v3-label → §B19/§B20) and update every "§B17" reference in the R-EY/R-EZ/R-FA rows |
| M33 / §B18 | M33 moves **R-DG…R-DM** (7 rows) → §B18. The text says "R-DF stays, it is the V3 admission rule" | M33 moves **R-DF…R-DT** (15 rows) → §B18 | The two moves overlap on R-DG…R-DM, and disagree on R-DF. Both add a manifest entry `M33` with different anchor, `line_count` and `content_sha256`. Keep one move (v3-label's is the superset), or rebuild it as M33 + M34 via `spec-split-check --refresh` after merging. Then reconcile the R-DF statement in rulings-7's §B18 preamble, the `spec124-register-locks.logic` M33 test case and the `spec-split.infra` list |
| Rule-id allocation line (Spec 124 §5) | "Allocated through `R-EX` … next free id `R-EY`" (strikes the R-EV sentence) | "Allocated through `R-FA` … next free id `R-FB`" | No duplicate ids: v3-label skipped R-EW/R-EX. It is a textual conflict on the same sentence: merge as "through R-FA, next R-FB", keeping both histories |
| Migrations | none | adds `279_gate_v3_hard_gate_switch.sql` | No collision from rulings-7 |
| `00_system_map.md` | regenerated (124/124a test lists) | likely regenerated as well | Regenerate after merging, with the generator |
| Spec 124 byte budget | 378 lines / 120,180 B after M33 | different | Re-measure after merging |

## Reproduced counts
Reproduced by verify-11 at b348e360: full suite `npx vitest run --exclude "**/*.db.test.ts"` 17,842 passed / 0 failed / 4 skipped (matches claim 17,842/0); `step-validate --all --fast` exit 0 (matches); test:db (`BUILDO_TEST_DB=1 vitest run .db.test.ts --no-file-parallelism`, DB lock held) 888 passed / 0 failed / 17 skipped (matches 888/0).

## Verdict
**PASS-WITH-NOTES** (suite 17,842/0, step-validate --all --fast exit 0, test:db 888/0 all reproduced). F1 and F3 are citation fixes the integrate lane should apply. The §B17 and M33 collisions with v3-label must be resolved at integration.

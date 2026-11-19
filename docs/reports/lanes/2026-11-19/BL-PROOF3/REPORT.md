# REPORT BL-PROOF3 (task-363)
1. Before: a typo like "suite": null crashed the proof runner with a TypeError, a bad timeoutMs was ignored, and an --out folder that could not be made died with exit 1 (the FAIL code). Now the first two print one "proof-slice:" problem and exit 2, and a failed mkdir prints one line and exits 2.
2. The report-opens row said it waits for task-123 (built); it now says task-287 (the live switch). design-fit untouched (RR-0306).
3. Not built: an --out folder that exists but is read-only still dies later at writeFile with exit 1 (ruled out of scope at plan round; header wording says "an --out that cannot be created", not "unwritable"; leftover for task-343). No operator item.
4. Lenses (DeepSeek, grounded by this lane): plan stage compliance, code-review, error-paths; output stage the same three. They changed: Number.isInteger check, err.code in the line, the narrowed header wording. Detail in TRIAGE.md.
5. Unproven: mobile jest not touched; gate.mjs line below; task-123 pin grep showed only a synthetic fixture row in test T4 (:115), the data file is not pinned.

## AC table
| AC | evidence |
|---|---|
| 1 | test T9 "suite: null": red.out failed, commit.out proof-slice.logic.test.ts 40 passed; checkSpec :47 |
| 2 | T9 timeoutMs "5", -1, 0, 1.5; proof-slice.mjs:49 |
| 3 | T9 throwing mkdir: exit 2, one line `^proof-slice: .*EACCES`; proof-slice.mjs:148 |
| 4 | proof-slices.json:15 ["task-287"]; T9 asserts it and design-fit unchanged; no pin on data file (git grep) |
| 5 | header :11 updated (worded "cannot be created", see item 3: partly met); real run slice-table.txt: PASS 5 · FAIL 0 · NOT BUILT 10 · GAP 1 · exit 3 |

Lenses: r1-compliance/code-review/error-paths (plan), r2-compliance/code-review/error-paths (output). Checks: checks.out (BEFORE and AFTER all exit 0; the stray "node ...consumer-registry.json --check" line is a harness artifact). Typecheck clean. Hook tail: commit.out "Tests 40 passed, GATE OK, POLICY CHECKS OK".
Commits: 6f7bed541 (fix + tests + task file); red attempt refused (red.out: 4 failed); report commit follows.
UNVERIFIED: AC5 "unwritable" literally (read-only existing dir exits 1).

---
write_scope:
- scripts/analysis/ingestor-forced-cohort.js
allow_commit: false
---
# L17 casualty — restore the fake DB-URL fixture literals in ingestor-forced-cohort.js — STOP BEFORE COMMIT
**Provider:** deepseek. `edit_file` only, on `scripts/analysis/ingestor-forced-cohort.js`. NEVER git add / commit / stash / reset.

Context: an earlier engine bug showed the model a secret mask instead of the real file text, and the mask text was copied into this file's `assertLocalTarget` self-test fixtures (around lines 1494-1500, the block commented "assertLocalTarget (F1): loopback only"). Those fixtures are FAKE connection strings for a pure host-classification test; the password value is irrelevant to the assertion.

Task: read that block, then in every connection-string fixture there, replace the bracketed mask token that sits between `postgresql://postgres:` and `@` with the plain fake password `fakepw`. There are 4 occurrences on 3 lines (the 127.0.0.1:54322 line has it twice — the argument and the expected return value). Change nothing else.

**Verify:** `node scripts/analysis/ingestor-forced-cohort.js --self-test` prints `self-test PASSED`, and `git grep -n "postgres:fakepw@" -- scripts/analysis/ingestor-forced-cohort.js` shows 3 lines.

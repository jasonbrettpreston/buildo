# Active Task: WF3 — enrich_parcels pass-5 stream/write deadlock
**Status:** Implementation (operator queue, 2026-09-07)

## Context
* **Goal:** Diagnose and fix the pass-5 (optimal_config, post_commit) stall observed while
  attempting the pilot-9 commit-7 POST golden capture.
* **Target Spec:** Spec 122 §5.5 (injected I/O seams); Spec 78 §P3A.1 (post-commit phase).
* **Key files:** `scripts/lib/step/index.js` (`runEnrichPhase`, `streamOverClient`),
  `scripts/lib/compute/enrich-parcels.js` (`runPass5`), `scripts/lib/pipeline.js` (`streamQuery`).

## H1 — premise
`runEnrichPhase`'s post-commit phase streamed `ctx.stream` on the SAME pinned client
(`postClient`) that `runPass5` also writes on. Hypothesis: a write issued mid-stream queues
behind the open `pg-query-stream` cursor and hangs forever (deadlock).

**PROVEN, live against the local DB** (5-row scratch table, 10s timeout):
- Client A: open cursor, then `clientA.query('UPDATE...')` on the SAME client → **hangs
  (10000ms timeout)**.
- Client A streams, `clientB.query('UPDATE...')` on a **different** client → completes
  immediately.

**Legacy blame** (`git log -S"streamQuery" -- scripts/lib/pipeline.js` → `55ad5670`):
`pipeline.streamQuery(pool, ...)` always opened its **own** dedicated client via
`pool.connect()` internally; legacy `enrichOptimalConfig` (`7e75c50e^:scripts/enrich-parcels.js`
~:1644-1760) wrote via `flushOptConfigBatch(pool, ...)` — through the **pool**, never the
stream's own client. The two connections never shared a slot. The current `streamOverClient`
was deliberately pinned to one client (Fold B2) so `SET LOCAL statement_timeout` — bound once,
at BEGIN — would provably cover the cursor too; that guarantee is exactly what introduced the
deadlock once a write was later issued mid-stream on that same pinned client.

## Fix
`runEnrichPhase`'s post-commit loop now opens a **second, dedicated** `pool.connect()`'d
client (`streamClient`) used only for `ctx.stream`; `postClient` (BEGIN/SET LOCAL/COMMIT) is
reserved for writes — mirroring the legacy split exactly. `streamClient` carries no
`SET LOCAL statement_timeout` of its own (same as the legacy stream, which was never bounded
either); the write client's bound timeout, and its `SHOW`-provable assertion, is untouched.
Both clients released in `finally`.

## Regression lock
`src/tests/steps/enrich_parcels/violations.test.ts` — a fake-pool test tagging every
`connect()`-ed client and asserting the client that carried the stream's cursor is never the
client that ran the write. **Proven both directions**: REDs against the pre-fix (single-client)
wiring (`expected 1 not to be 1`), GREENs against the fix.

## §11 compliance
* **Unhappy Path Tests:** the regression lock above; existing SET LOCAL/SHOW isolation tests
  (Fold B2, RE-FREEZE #3) re-verified green, unaffected by the split.
* **DB Impact:** none — connection lifecycle only, no schema/data change.

## Not in scope
* Adding `SET LOCAL statement_timeout` protection to the new `streamClient` — the legacy
  stream was never bounded either; extending protection there is a separate ask, not filed
  here (would need its own txn wrapper + leak analysis).

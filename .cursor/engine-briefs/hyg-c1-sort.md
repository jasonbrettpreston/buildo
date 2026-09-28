---
write_scope:
- src/tests/api.infra.test.ts
---
# WF2 hygiene H5/C1 — api.infra.test.ts route order is filesystem-dependent — STOP BEFORE COMMIT

## Goal
CI (Linux ext4) reds `every mutating /api/admin/** export refuses the shared non-session sentinels`: `expect(offenders).toEqual(SESSION_GATE_GAPS_FILED)` fails on ORDER only (`users/[uid]/route.ts PATCH` vs `users/route.ts POST`). Root cause: `function findRouteFiles(dir)` at the bottom of `src/tests/api.infra.test.ts` returns raw `fs.readdirSync` order — NTFS returns sorted, ext4 does not. The sibling `AUDIT_GAPS_FILED` comparison has the same latent dependency.

## Fix (test-only, edit_file only — the file is large)
In `findRouteFiles`, make the returned list deterministic: iterate `fs.readdirSync(dir, { withFileTypes: true })` sorted by `entry.name` (use `.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))` — a plain code-unit comparison, NOT localeCompare, so Windows and Linux agree). Add a 2-line comment above the function: readdir order is filesystem-defined (NTFS sorted, ext4 hash order); the `toEqual(..._GAPS_FILED)` locks compare ordered arrays, so the walk is sorted by code unit. Do NOT change any `*_GAPS_FILED` list or any assertion. If after sorting the existing `SESSION_GATE_GAPS_FILED`/`AUDIT_GAPS_FILED` order no longer matches, reorder NOTHING — report the mismatch and stop.

## Gate answers
No declared descriptor field, logic variable, check limit, emits key or counters source is set by this brief — no Spec 124 §5 R-BA gate reads it (test-only edit).

## Green
`npx vitest run src/tests/api.infra.test.ts` — all pass. `npx eslint src/tests/api.infra.test.ts`.

## Stop
Leave the change UNCOMMITTED. Do not call git_commit. Report the diff.

## Round 2 (orchestrator, after review of run 20260928T012224Z-0aebfacd)
The sorted walk is KEPT (already in the working tree). Measured: with it, `users/[uid]/route.ts PATCH` sorts before `users/route.ts POST` (code unit `[` < `r`), while NTFS's own order put `users/route.ts` first — so the lock is order-dependent on BOTH filesystems. Make the two locks order-insensitive while keeping exact membership: change `expect(offenders).toEqual(AUDIT_GAPS_FILED);` to `expect([...offenders].sort()).toEqual([...AUDIT_GAPS_FILED].sort());` and the same for `SESSION_GATE_GAPS_FILED`, with a one-line comment above each: membership is the lock, order is filesystem noise. Do not edit either list. Then run the Green command; it must pass.

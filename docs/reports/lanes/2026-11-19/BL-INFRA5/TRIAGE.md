# TRIAGE r1 (plan review, r1-plan.txt) lane BL-INFRA5, task-8
Opened lines: scratch lanes.mjs (whole), lt-lib.mjs:12-31 and :52-56, ~/.claude/hooks/lane-guard.mjs:111-128 (read only).

KEEP (folded into the build)
- K1 stale lock recovery (CRITICAL 1): port lt-lib.mjs:12-26 (lock holds pid; dead pid reclaimed; pid file missing and older than 10 s reclaimed). Test: a lock dir with a dead pid does not block a claim.
- K2 two-process proof (CRITICAL 2): test with 6 concurrent CLI children claiming the same path; exactly one exits 0, the rest exit 1 naming the holder.
- K3 corrupt registry fails closed (CRITICAL 3): lt-lib.mjs:30 throws "unparsable"; the CLI maps it to exit 3 and never treats it as empty. Test: truncated JSON -> exit 3, file untouched.
- K4 segment containment (HIGH): tests docs/foo vs docs/foobar no clash; enclosing and enclosed clash in both directions (lt-lib.mjs:56 rule).
- K5 stored paths re-resolved at compare time (HIGH TOCTOU, the cheap part): claims compare through realpath each time, so a symlink made after the claim still matches. Test for it.
- K6 same-lane re-claim semantics and CLI contract (MEDIUM/LOW): re-claim extends the lane's paths and renews expiry; exit codes 0 ok, 1 refused (claim and check), 2 usage, 3 unreadable registry; the refusal names the holder lane. Pinned in the test and the module header.
- K7 header states: advisory lock, single host, cooperative (HIGH "single-host", "no hook edit"): one comment line in the module and one line in the report.

REJECT
- R1 front matter / brief self-refuting, ENOENT and truncation notices, duplicate RR titles, RR-0195 vs 0196, empty Dependencies, unpinned quotes: defects of the generated context pack, not of this plan (scope: task-8 only; TKT-1).
- R2 plan text contradicts RR-0149/0150: the R9 note (Implementation Notes) already names the repo as home and drops the scratch text; no plan step builds in scratch.
- R3 default registry path in ~/Buildo-scratch: the brief and R9 note require it so the existing hook keeps reading it; LANES_FILE is the one override.
- R4 --no-verify for red: forbidden by the standing rules (RR-0225); red is the refused commit attempt as the brief says.
- R5 pre-registration alone, grounder, computed status, lens-set naming, AC N-A marking: orchestrator/gate procedures outside this lane's plan; the lane follows the brief's Order of work (one output lens named in the brief).
- R6 case-folding for APFS, shorter TTL/heartbeat, --break-lock verb, 0600 mode check, LANES_FILE validation: scope creep (PLAN-PROTOCOL.md:3); the ported 12 h TTL and --ttl-h are the existing behaviour. Follow-ups, not built.
- R7 hook wiring: forbidden by the brief (no hook edit; the orchestrator switches the hook after the push).
- R8 test file location/name and estimate: src/tests/backlog/*.logic.test.ts is the repo convention (backlog-lane.logic.test.ts spawns the real CLI, so the real fs is exercised); the file name is fixed by the brief.

# TRIAGE r2 (output review, one lens, r2-output.txt)
KEEP (fixed in the fix commit, with 2 new tests): real() left .. in a not-yet-existing suffix (now path.resolve first; lane-claims.mjs norm); parent dir of the registry not created (mkdirSync recursive); ttl Infinity (Number.isFinite); lock deadline bypassed by continue (check hoisted to loop top); pid-write ENOENT retry; empty path refused (norm throws, exit 3); process.exit truncation (exitCode).
REJECT: lock reclaim check-then-act and ownership-blind release (ported behaviour, needs a crashed holder AND two simultaneous reclaimers; advisory single-host lock; follow-up); FILE symlink canonicalisation, fsync/.bak/quarantine, pid reuse token, distinct lock-timeout exit code, canonical-at-claim identity (contradicts the GD-1 rule that compares at check time, K5), case folding, O(n^2) norm, temp-file cleanup, mode preservation, plain-file lock name: scope creep for an advisory 5-verb port (PLAN-PROTOCOL.md:3); follow-ups, not built.

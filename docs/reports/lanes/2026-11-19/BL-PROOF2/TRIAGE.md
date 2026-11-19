# TRIAGE.md: BL-PROOF2 task-68 stage 2, output review r2 (r2-output.txt, deepseek-reasoner, one lens: PASS without a run; missing check printed as NOT BUILT or GAP)

Method: one round; each finding opened against scripts/analysis/proof-slice.mjs (line numbers of the committed file e641ff7be) or the data file; KEPT = fixed in the fix commit; REJECTED = reason.

| # | Finding (short) | Verdict | Reason and evidence |
|---|---|---|---|
| 1 | CRITICAL: exit 0 is PASS; nothing proves the check ran (vacuous pass, e.g. zero goldens) | KEPT in reduced form | Opened commandRow (the exit-0 return). Fold: optional `expect` string per argv row; a clean exit without a line containing it is GAP, never PASS (test T8). Data rows for surface-validate, the three golden checks and both policy rows now name their line. REJECTED: a new machine-readable "CHECK RAN" line in every check (changes other scripts: scope creep, PL TRIAGE #20) |
| 2 | HIGH: suite_files is decorative, any pass file at HEAD is green | REJECTED | The station runs the WHOLE suite (station.sh:44 `npm run test`), so a PASS at HEAD covers those files; suite_files is the printed coverage note per PLAN section 2 row 8 |
| 3 | HIGH: first-match regex over a multi-run pass file | REJECTED | station.sh:49 writes the file with one printf, overwriting (`> "$ST/pass/$sha.pass"`); one block per sha |
| 4 | HIGH: waits is checked after exit status, so a non-zero stub is FAIL not NOT BUILT | REJECTED | By plan: T3 "a failing exit with the marker present is FAIL"; non-zero is loud, never a PASS, which is the lens |
| 5 | MED: waits ignored on a non-argv row | KEPT | checkSpec now refuses waits and expect on any row without argv (T8) |
| 6 | MED: unknown keys never rejected (a typo reads as PASS-or-FAIL only) | KEPT | checkSpec KEYS whitelist, one problem per unknown key (T8) |
| 7 | MED: golden rows carry counts in prose only | KEPT (via #1) | the expect line "search goldens ok" etc. is required in the data (T8 last test); the count stays in the check's own output and evidence file |
| 8 | MED: exit 0 structurally unreachable for S | REJECTED | By plan: rows 14-20 are NOT BUILT until their tasks land; exit 3 is the plan's honest answer (PLAN section 4) |
| 9 | MED: notbuilt null crashes checkSpec | KEPT | now a stated problem, exit 2 (T8) |
| 10 | LOW: failed `git rev-parse HEAD` swallowed | KEPT | main exits 2 on an empty HEAD before any row runs (T8) |
| 11 | LOW: same command spawned twice for the CHK.3 and CHK.5 rows | REJECTED | PLAN row 11 measured 0.11 s; one row per verdict keeps the data simple |
| 12 | LOW: evidence file omits res.error | KEPT | the file now carries `error: <code> <message>` (T8); ENOBUFS wording left (no row can reach it with 16 MB cap) |
| 13 | LOW: a missing check script is FAIL not GAP (node exits 1) | REJECTED | never a PASS; the MODULE_NOT_FOUND text is in the evidence file; a path pre-flight is more code than the 110-line minimum |
| 14 | NITs: empty out dir on unknown slice, repeated flags, pipe in a markdown cell | REJECTED | cosmetic; none can print PASS |
| 15 | Out of lens HIGH: any binary in the data file runs | REJECTED | PLAN TRIAGE #1 (data file committed and reviewed like the script; argv, no shell) |
| 16 | Out of lens MED: pass file forgeable by a hand-written file | REJECTED | PLAN TRIAGE #6 (station is the ruled route; the tool never runs the suite) |

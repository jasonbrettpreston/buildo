# REPORT: BL-COMPLY, task-365 COMPLY.1 (handbook compliance pass on the unpushed 1.B change)

Six plain lines for the operator

1. Packed whole (rule lists copied verbatim, nothing trimmed, split by heading only for size): McFrontend Spec 136 (44 rules), step standard Spec 132 (65 handbook lines, 444 rule ids), by-law Spec 133 section 2 (543 rules), McStorage doc-16 (12 rules P1-P12, a DRAFT), McQueue Spec 137 (14 rules), McIncrement/McProof/agents Spec 08 sections 7 and 11, McDonald's Airtight V1/V2/V3 (register rows, 122 section 5.5 and 6.6.1, 122a A26 and A27), the mobile specs 90, 98, 99, 100, 96 and .claude/domain-admin.md, and docs/specs/00_engineering_standards.md. 24 pack files in .claude/review-templates/packs/. Evidence for the copy: a check read every non-blank line of the 24 pack files (3630 lines) and found each one verbatim in its source file (0 not found); sha256 of every pack is in packs.sha256 (fe.md 86fd3afd8441eafa5793faeea4b5f54dd74ede6329830f1aeb74ebfd87f66c86).
2. Machine checks: where the source says so, 35 of 44 McFrontend rules name a lock (8 are OWED); 363 of 427 step rule ids on the sent lines have a check (64 have none; 80 of 444 overall); 426 of 543 by-law lines name an enforcer (117 OWED); McStorage 3 of 12; McQueue 2 of 14. The other lists (Spec 08, Airtight, mobile, engineering standards) have no per-rule enforcement field, so none was invented.
3. Findings (BUG plus DEFER lines as returned, untriaged), 491 in 104 runs, 101 of them severity CRIT or HIGH: McFrontend 42, step 45, by-law 66, McStorage 37, McQueue 4, Spec 08 5, Airtight 36, mobile-core 28, Spec 99 42, Spec 100 52, Spec 96 29, engineering standards 105.
4. Three that look most serious (quoted, not judged): see "Three most serious-looking" below.
5. Could not be reviewed: goldens and fixtures (160 files), the two generated registries, and every test file outside mobile (size bound); the Spec 135 register rows in full and Spec 126/128 text (not in a pack); 8-finding cap per lens run; the lens saw only the part of the diff in each run (38000 characters); no gate was run, only read.
6. Unverified: the finding claims themselves (each needs a grounder); whether report-compute.ts is reachable from a scanned compute module; whether the by-law pack should bind a route that is not a step; the mechanical "Opened:" check treats a quote with an elision as not found.

## What was done (acceptance criteria)

- AC1 (packs): per the coordinator's correction the packs are the handbooks' own rule lists copied verbatim, each with a header naming source file:line range, generator, rule count and part number. Pack sha256 list: packs.sha256 beside this report.
- AC2 (one lens output per handbook): 104 pass files, `pass-<pack part>-<diff part>.txt` (3 runs failed once with a transient API error "terminated" and one with the unneutralised placeholder prompt; all four were rerun and now have a verdict line).
- AC3: FINDINGS.md lists every finding untriaged with the clause quote and the diff line, an "Opened:" line each, the coverage table, the run table, the grounder question about Airtight gate scope (stated, not answered) and the answer on what maps files to rules.
- AC4: no file under src, mobile or scripts changed (git status shown in commit.out).

## Table: handbook, clauses packed, with a mechanical check, with none, findings

| Handbook | Rules packed (whole list) | With a machine check | With none | Findings (BUG + DEFER) | Runs |
|---|---|---|---|---|---|
| fe (Spec 136) | 44 | 35 | 8 OWED + 1 other | 42 | 9 |
| step (Spec 132) | 65 lines / 427 ids on them | 363 ids | 64 ids | 45 | 10 |
| bylaw (Spec 133 s2) | 543 | 426 | 117 OWED | 66 | 16 |
| storage (doc-16) | 12 | 3 | 9 | 37 | 8 |
| queue (Spec 137) | 14 | 2 | 12 | 4 | 1 |
| spec08 (s7, s11) | 34 by pattern | not tabulated | not tabulated | 5 | 1 |
| airtight | 6 register rows plus spec text | the pack is the gate text | n/a | 36 | 10 |
| mobile-core (90, 98, domain) | 29 headings | not tabulated | not tabulated | 28 | 5 |
| mobile-99 | 10 sections | not tabulated | not tabulated | 42 | 9 |
| mobile-100 | 7 sections | not tabulated | not tabulated | 52 | 9 |
| mobile-96 | 11 sections | not tabulated | not tabulated | 29 | 6 |
| eng (Spec 00) | 14 sections | not tabulated | not tabulated | 105 | 20 |

## Three most serious-looking (CRIT lines, quoted as returned)

1. F-463 (storage, route-1): `BUG severity=CRIT — P4 "if the compute fails it shows the closed not_evaluated:<reason> (lifecycle `error`); never blank, 0 or the old number." — src/lib/parcels/report-compute.ts:14 "A thrown query or a core error propagates (the route's error boundary makes it a 500 with no page and no meter); it is never read as a miss."` (Opened: the quoted code is not there as one line; the grounder opens report-compute.ts.)
2. F-470 (storage, route-2): `BUG severity=CRIT — P3 "Stamp: every stored record carries Layer 2 table_version, evaluator_version and the settings sha" and A-ST5 "A stored record whose stamp differs from the current stamp is never served; it is recomputed" — src/lib/report-projection/project.ts "if (rows.some((r) => r.layer2_table_version !== stamp.table_version)) moved.push('layer2'); if (rows.some((r) => r.catalogue_sha !== current.catalogue_sha)) moved.push('catalogue');" ... the stamp comparison never checks evaluator_version or the settings sha`
3. F-459 (storage, load1-2): `BUG severity=CRIT — NONE — NONE` (returned by the lens with no clause and no code; listed because it is the third CRIT line, not because it is serious). The next most serious by content is F-001 (airtight, load1-1): `BUG severity=HIGH — R-BF "every step-registry and cross-step-ledger row generated or witnessed, never hand-kept; declared == observed" — src/lib/parcels/report-compute.ts:35 "const UNITS_SQL = 'SELECT unit_key, unit_id FROM bylaw_resolution_units';"`.

## The Airtight scan-scope question and the file-to-rule mapping

Stated for the grounder and tabled in FINDINGS.md (top). Short facts read in this lane: no file under scripts/lib changed in 9f04d9074..3a36e8b26; the compute gates' scope globs (compute-shape.yml:22-24, check-step-shape.mjs:61, compute-literals.mjs:34, compute-closure.mjs:50) name scripts/lib/compute only, so by path they do not match src/lib/parcels/report-compute.ts; silent-catch-fallback (ast-grep-leads.sh:47,59) and src-sql-ledger.mjs (:111) do scan it. No rule map selects rules from a diff: surface-rule-map.json, rule-map.json and bylaw-rule-map.json map rule to handbook line to register row (and rule-map.json to a lock file), with no path or glob field; Target Files sections list a spec's own files.

## Tool defects found (for the grounder; nothing changed under scripts)

- scripts/lib/review-template.js substitutePlaceholders: String.replace with the text as replacement expands `$` sequences and re-substitutes placeholder tokens found inside a diff.
- .claude/review-templates/lens-compliance.md carries {{PLAN}} twice, so the file under review is sent twice; the 120000 bound applies to the doubled prompt. The brief's single-file form (pack first, then diff) could not run; pack went in --context.

## Not examined (UNVERIFIED)

Whether each BUG or DEFER is real; the claims about gates beyond the globs read; any gate not named; the lens's MET and REJECT lines (in the pass files, not triaged); that a pack equals its source after the source moves.

STATUS: ready

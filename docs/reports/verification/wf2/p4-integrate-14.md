# Verification index — wf2/p4-integrate-14

R-EZ (124a_step_standard_policy_appendix.md:913, operator y 2026-10-20: "Findings block the integration until fixed or
ruled. The verification report is saved under `docs/reports/verification/<branch>.md` and the integrate commit cites
it."). The branch merged by `wf2/p4-integrate-14` was verified by a lane that did not write it (verify-13), read-only.
The report is copied verbatim from the verify-13 scratchpad into this directory's parent (`docs/reports/verification/`).

- **Integrate base:** `70ec6aed` (= `wf2/p4-integrate-13` tip)
- **Merge notes:** verify-13's trial-merge notes for night-c (written against int12 `208e8a82`),
  [`../night-p4c-merge-notes.md`](../night-p4c-merge-notes.md). Every point was re-checked against `70ec6aed`
  (see "Integration actions" below).

## Merged branches (in merge order)

| # | Branch @ tip | Verdict | Reports |
|---|---|---|---|
| 1 | `wf2/p4-night-c` @ `51874abd` (base int11 `5f1cc5ba`; coa, link_coa_to_parcels, enrich_coa_zoning R-EQ swaps; R-GZ, R-HA, RE-FREEZE #38) | **PASS-WITH-NOTES** (integration blocker: the coa-chain POST captures go STALE after int12's condition-9 backfill, merge notes §3) | [`../wf2-p4-night-c.md`](../wf2-p4-night-c.md), [`../night-p4c-merge-notes.md`](../night-p4c-merge-notes.md) |

## Commit order note

The night-c verification report was scanned with `spec-split-check.mjs`'s own extractors (`collectCitations`,
`checkHandbookCitations`) before copying: 0 citations in `wf2-p4-night-c.md`, so it lands in this first commit. The
merge notes cite the register row R-HA in Spec 124 (their line 32), which arm (iii) reports DANGLING at the base (R-HA arrives with the
merge), so the merge notes land verbatim in the merge commit, where the id resolves. No report text was changed.

## Integration actions taken on the verify findings

(Filled in by the merge and integration commits; see below.)

- **Merge commit (night-c @ `51874abd`), Spec 124 / 124a conflicts.** Spec 124: integrate-13's side kept whole (the
  M35/M36 pointers and rows R-GP…R-HM); night-c's R-GZ and R-HA rows inserted between R-GY and R-HB (id order,
  merge notes §2). Spec 124a: both sides kept; night-c's two sections renumbered §B21 → **§B29** and §B22 → **§B30**,
  the next free numbers after integrate-13's §B28 (each section's own text: "the row and this section may be
  renumbered at integration with no change of content"); the rows' pointers read "124a §B29" / "124a §B30".
- **R-ET suffix (merge notes §2).** night-c appended "*(fitted to a bounded column's width, R-GZ, 2026-10-20)*" to R-ET
  in Spec 124, but integrate-13's M36 moved R-ET into 124a §B26. 124a §B-AM: "Moved blocks stay byte-identical
  (spec-split-check arm i), so an amendment to a row inside one is recorded here." The suffix is therefore recorded
  as a §B-AM bullet (R-ET amended by R-GZ), not written into the moved row, and §B26 stays byte-identical (arm (i)
  passes with no move-hash change). One of §B-AM's two consecutive blank lines was dropped so that every 124a line
  after §B-AM keeps its number (no existing `124a:<line>` citation moves).
- **Stale line citations (merge notes §2), re-checked at `70ec6aed`.** In §B29/§B30: R-ET 124:261 → 124a:907,
  R-EV 124:263 → 124a:909, R-EX 124:265 → 124a:911, R-DY 124:240 → 124a:801 (the notes' layer2-spec numbers were
  one line off for R-ET/R-EV/R-EX: 907/909/911 at integrate-13, quotes checked). R-CZ 124a:391, R-DN 124a:476,
  R-DP 124a:478 still resolve.
- **RE-FREEZE #38** stays #38 (integrate-13 tops out at #37). The "provisional number" wording in Spec 122 and the
  `step.schema.json` `x-ruling` is left as is: the schema text is a template-freeze input (`schema_sha256`), and no
  renumbering happened.
- **Rule map + Spec 132 (merge notes §4/§5).** `rule-map.json` gains R-GZ (`x-captures.2`, lock
  `cohort-fit-width.logic`, MERGE-4) and R-HA (`core.14`, lock `witness-derived-target.logic`, MERGE-3). Per the
  rows' Amends columns ("Amends R-CZ (append_text), R-ET (derived_status)"; "Amends #44 (b)/(c) (R-BK, R-DB)") and
  the map's own rule ("Status lives here, not in byte-frozen register prose"; status `amended-by` = "in force; read
  with the rows in by"), R-CZ/R-ET gain `by` R-GZ and R-BK/R-DB gain `by` R-HA. `generate-step-handbook.mjs
  --write`: Table 1 now shows coa, enrich_coa_zoning and link_coa_to_parcels as `runner_wired`; the defect-ledger
  line citations move +2 (CCS-D3 l.353, CCCE-D2 l.394); 326 mapped ids.
- **POST recapture (merge notes §3).** int12's condition-9 backfill re-cited `deviations[].adjudicated_by` in the three
  descriptors, a `computeSourceFingerprint` input, so all ten POST captures were STALE (#44). Retaken under the
  dblock on the local DB (127.0.0.1:54322) in R-EQ order (coa → link_coa_to_parcels → enrich_coa_zoning; plain chain,
  plain standalone, then the brackets, R-DQ), each from its own `capture-step-golden.js --replay=<capture>` recipe
  (R-CZ). New source fingerprints (every trace, git_head `017538a2`): coa `695367ed3f8677a1…`, link_coa_to_parcels `4fdbcb3fe6f9a097…`, enrich_coa_zoning `acf7521ae65e5ca2…`. Results and DB state: see the merge commit
  message. enrich_coa_zoning's plain POSTs now read 33966/005c56aa (PRE a140d3ef): the Night P4 R-CZ bracket's heal
  re-stamped `zoning_enriched_at` on its 50 rows (R-DQ, 124a:479), explained in its `explained-diffs.json` (R-DA);
  link_coa_to_parcels' `table_state[].content_hash` why extended the same way (33966/e879292a).
- **R-GZ / R-HA chat approvals imported (verify-13 N3; R-HK).** The operator's "y" to the two night-p4-c drafts
  (both rows: "operator y 2026-10-20, to the night-p4-c draft"; 124a §B29/§B30 name the drafts) is committed as the
  raw chat record `docs/reports/decisions/raw/2026-10-20-chat-night-p4c/2026-10-20-night-p4c.json` (each
  recommendation is the draft as put to the operator in `.cursor/QUEUE.md`, verbatim) and imported with
  `decision-log.mjs --import --chat … --out docs/reports/decisions/2026-10-20-chat-night-p4c.json`. Routing (the
  lane-added field): FIT-WIDTH → R-GZ, DERIVED-WITNESS → R-HA; both rows now cite
  `2026-10-20-chat-night-p4c#FIT-WIDTH` / `#DERIVED-WITNESS`. `decision-log --check`: clean, 5 logs, 26 decisions,
  27 register rows, 52 citations, 0 owed. The real-tree lock in `decision-log.logic` counts 26 decisions and pins the
  new log's routing.
- **VAR-EFFECT-SHARED-TEMPLATE closed (verify-13 N1).** R-EO (124a:817): "A declared logic variable the live step
  does not read carries an admin badge with its reason: (a) **"Takes effect at cutover"**: a pending step in its copy
  window … declares it, and the live legacy script reads `<legacy name>`". `enrich_permits_centreline_coverage_min` had
  lost that badge because the now-live shared `scripts/lib/enrich-lead-zoning.js` reads
  `${cfgFor(target).slug}_centreline_coverage_min`, whose slug is the running step's (enrich_coa_zoning), while
  enrich_permits still runs `scripts/enrich-permits.js`, which reads `centreline_propagation_coverage_min`. The
  derivation (`scripts/analysis/gates/variable-effect.mjs`) no longer counts a slug-leading template outside a
  copy-window step's own legacy shell as a read of that step's own `<slug>_<name>` key; whole-word, live-descriptor
  and other template reads still count. Red first: `docs/reports/red-evidence/var-effect-shared-template/red.json`
  (2 of 20 failing: the shared-template fixture and the real-tree enrich_permits row), `green.json` (20/20).
  `generate-logic-variable-effect.mjs` (it has no explicit write flag: a bare run writes, `--check` checks) adds
  exactly one entry, the enrich_permits badge with legacy name `centreline_propagation_coverage_min`; `--check`
  clean. The test comment's PIN is gone; nothing else changed in the badge file (25 cutover, 12 not read).

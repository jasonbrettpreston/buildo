# VERIFY-26 — wf2/spec-133 tip 0e46fe68 (base ee874371)

Verdict: PASS-WITH-NOTES. Read-only; no repo edits, no DB, no worktree created, no full suite.

1. Generated, not hand-written: PASS. `generate-bylaw-handbook.mjs --check` exits 0 (307 rules); Spec 132 `--check` exits 0.
   The hook runs it unconditionally in the `&&` chain (.husky/pre-commit:37). `--check` re-reads both registers live and string-compares
   the fresh map and handbook to disk (generate-bylaw-handbook.mjs `main`, check branch), so a register edit without `--write` gives
   exit 1 "stale". `mapFindings` also fails on a vanished anchor. Locked by hooks-composition (17 chain-era checks) and spec133 test.
2. Fidelity: PASS. Raw register id rows = 307 (245 M + 62 LC); reader returns 307, 0 duplicate ids; handbook has 307 lines.
   History = 3 (M-19, M-23 struck/retired; LC-46 FOLDED), shown only in section 4. Lines carry only headline, Status, Enforced by,
   Rules id and "+N dated notes" (renderLine). Spot-checked 9 lines against their rows (handbook line : register line):
   m.176 :94 / 69a:284; m.38 :722 / 69a:87; m.19 :1419 / 69a:57; lc.46 :1427 / 131:94; m.260 :142 / 69a:408; lc.1 :1170 / 131:39;
   m.100 :910 / 69a:181; m.218 :1126 / 69a:358; m.150 :1062 / 69a:244. All match (status keyword and date, Enforced-by cell). No invented rulings.
   Note A (cosmetic): headlines are a clipped first sentence, so a few read oddly. m.150 ends mid-sentence "...mechanical M-75 sweep over every agreed unit, e.g." and
   m.176's headline drops the ruling's operative height rule. The register still governs and the page says so. No fix needed.
3. Family derivation: PASS-WITH-NOTES. `familyOf` (bylaw-register.mjs CLAUSE_RE): 10.10/10.20/10.40/10.60/10.80.40.10 all give "40.10" (verified by call);
   10.5.40.10 stays "10.5.40.10"; 150.10, 800.5, 900.3 give 150/800/900; "12310.20.40.10" is rejected by the lookbehind. Multi-clause rows use the
   FIRST clause in the rule cell (regex earliest match). 44 M-rows cite clauses from more than one family (e.g. M-66, M-81 cite 150, 10.5.x, 60.70) and so
   sit under only their first. This is documented in the generator text, and the handbook says line ids do not depend on grouping.
   General = 187 (185 in force + 2 history), so your 185 is the in-force figure. Honest mostly, but there are 12 rows with a clause-like citation in "general". Of these:
   - 6 genuine parse misses: M-88, M-90, M-170 cite the old short form "5.10.175.1 / 5.10.40.70 / 5.10.40.40" (should be 10.5 families); M-100 "40.10.20.10(1)(A)",
     M-218 "x.40.10(2)", M-221 "x.30.40(1)(D)" (zone shorthand, should be 40.10 / 30.40).
   - 6 out-of-scope chapters, correct as general: M-38, M-39, M-172 (600.60.40), M-85, M-108 (970.10.15.5), M-93 (200.25.x).
   So 6 of 185 (3.2%) land in General through parsing, 179 cite no recognised clause. Only the rule cell is scanned, not the evidence column (not checked for more).
   Optional follow-up, not a blocker: widen CLAUSE_RE for `5.10.` and `x.` forms; it would regenerate the handbook and the cap has room.
4. Spec 132 unchanged in behaviour: PASS. `checkHandbookCitations` accepts a bare map (treated as 132) or `{132,133}`; the citation regex defaults a missing specId to '132'.
   spec-split-check --check clean: 8292 citations, 0 dangling, 30 "Spec 132 §" citations still in tree. Vitest: handbook-rule-map 26, spec132-handbook-roles 18,
   spec-split 14, all pass. The only 132 changes are generated: R-IY added to the 132 rule map (x-rulings.3) and its handbook count 350 to 351.
5. Id collisions vs edd18529:
   - 124a §B36: COLLIDES. edd has `## Appendix §B36 — ... R-IL…R-IX` at 124a:1348; this branch adds a §B36 at 124a:1334. Rename ours to §B37 (no §B37 exists on edd;
     the only other "B36" in this branch's docs/src/scripts are in 124a:943 (R-IY row) and 69a:408 (M-260 row), plus golden before-image data to ignore). Edit those 3 places in the same merge.
   - R-IY: free on edd (only mention is 124:288 "next free id `R-IY`"). KEEP R-IY. At merge also set 124:288 to "next free id R-IZ" and add "Allocated through R-IY"
     (this branch does not touch 124:288, so that is an integrator edit). Expect a trivial text conflict at 124a:943 (edd adds R-IL..R-IX there, ours adds R-IY).
   - M-260: free on edd (69a ends at M-259, line 407). Keep. CHAT-43: no batch-m file on edd; ours adds chat-batch-m-43 and raw/. No collision.
   - Possible merge conflicts: scripts/steps/_schema/rule-map.json and 132 handbook (edd adds R-IL..R-IX to the 132 map?) resolve by merging the map then `generate-step-handbook --write`.
6. Checks run in ~/Buildo-wt-s133: spec-split-check --check clean; decision-log --check clean (19 logs, 81 decisions, 77 register rows); bylaw and step handbook --check exit 0;
   vitest on spec133-bylaw-handbook (19), handbook-rule-map, spec-split.infra, hooks-composition.infra, spec132-handbook-roles, decision-log.logic: 6 files, 160 tests, all pass.
7. Pre-commit budget: SUPPORTED, with a near-certain conflict. precommit-budget.json: docs_only_s 20.88 = sum of the 34 stage timings (computed); registry_s 26.61 = 20.88 - 0.38
   (step-validate --staged) + 6.11 (registry stage); both under the pins 25.3 / 27.5 (hooks-composition.infra.test.ts:383). hook_sha256 ce82424f... equals the sha256 of .husky/pre-commit at the tip.
   The list includes the new bylaw-handbook stage (0.17 s). edd18529 ALSO changed this file (hook_sha 53e7a6ca..., 23.44 / 23.37) and .husky/pre-commit (adds generate-bylaw-layer2-input) and the
   hooks-composition chain-era count (16 to 17). So merge conflicts on precommit-budget.json, .husky/pre-commit and hooks-composition.infra.test.ts are certain; merged count must be 18 (not 17), the file must NOT be hand-merged — re-measure
   after merge. 26.61 s measured here is not valid for the merged hook.
Other: 122_split_manifest.json generated_size_caps["133"] = 2000 lines / 117000 B (actual 1438 lines, ~79.7 KB, 1.5x seeding) matches the exempt-from-line-budget, size-check-kept ruling.
Merge recommendations: (a) §B36 to §B37 (3 edits); (b) keep R-IY, bump 124:288 to R-IZ; (c) re-measure precommit-budget after merge, expect count 18; (d) re-run `generate-bylaw-handbook --write` and `generate-step-handbook --write` after merge.

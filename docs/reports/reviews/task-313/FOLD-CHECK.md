# Fold check: task-313 plan (PLAN-313-v1 as folded, round 1, with FOLD-313.json, the RR-0505 replacements, FOLD-313c.json and one round-block line)

Checked by: Cairn-Ground-P313

On the board working tree (~/Buildo-wt-board, head a910a9c7c), the task-313 card as it will stand after the 38 pairs of FOLD-313.json (applied), the two RR-0505 replacements (FP28 and FP31), the 9 pairs of FOLD-313c.json (RR-0506, applied) and the one-line fix `rg#7 MED folded an existing leaf mod` appended after `rg#6 MED folded a manufacturer accou`. GROUNDER-PLAN.md, TRIAGE-PLAN.md, QUESTIONS-RULED.md, the three seat files and the lens inputs and outputs in docs/reports/reviews/task-313/ were read in the working tree.

(1) PASS. Every folded quote of TRIAGE-PLAN.md is present in the card text (the gate checks each one). TRIAGE-PLAN.md has 90 outcome lines: 80 folded and 10 pile. GROUNDER-PLAN.md holds 129 verdict lines, 90 of them CONFIRMED (0 CRITICAL, 8 HIGH, 60 MED, 21 LOW, 1 NIT) and 39 REJECTED, no CONFLICT. The 90 CONFIRMED equal the 90 outcome lines.

(2) PASS. Each pair of FOLD-313.json is present once in the card: 34 plain pairs by their new text, 2 pairs (FP15 and FP33b) superseded by pairs of FOLD-313c.json whose new text is present once, and FP28 and FP31 by their RR-0505 text (present once). The 9 pairs of FOLD-313c.json are each present once. The old texts they replaced are gone (the Daylight splash sentence, "The app icon is still the Expo grid"). The old text "unless Q1 is B)" remains in the card's cut line, because pair FP33a was dropped in the smaller fold. It is harmless: Q1 is ruled A by RR-0503 and RR-0504.

(3) PASS. The cited facts hold at this head.
- The nav lock lines 313-318 and :347 are as cited. Spec 117 section 5 holds "do not introduce a different splash color" at :195.
- mobile/.gitignore:45-46 ignores /ios and /android.
- node_modules/sharp is 0.34.5 and node_modules/next/package.json:134 lists it. sharp rendered a test SVG in memory; the House Mark itself was not rendered, as the card's UNVERIFIED list says.
- The three template PNGs have the SHA-256s that T10 names.
- decision-289 (RR-0507) is untracked and is not yet in the card (see the note above).

(4) FAIL FIXED. The card holds one round line, "Plan review round 1: 80 folded, 0 task, 0 ruling, 0 wontfix, 10 pile; grounder docs/reports/reviews/task-313/GROUNDER-PLAN.md; triage docs/reports/reviews/task-313/TRIAGE-PLAN.md". It is equal to TRIAGE-PLAN.md, with 90 outcome lines (80 folded, 10 pile). The plan field had 67 of the 68 required outcome lines, because my ROUND-BLOCK.txt omitted `rg#7 MED folded an existing leaf mod` (a transcription slip). The fix pair above adds it, so 68 CRITICAL, HIGH and MED lines are present.

(5) PASS. `filesText` reads the card's first `Files:` line, which is the plan's line (the Description has none; acceptable for a build card). `filesEntries` returns 63 entries.
- 49 are tracked paths.
- 14 are new files the build creates and match nothing yet: MaxbldAppGate.tsx, OpeningBinding.tsx, the two Opening descriptors, the generated slice, opening-golden-capture.ts, the goldens, the situations file, the fixture directory, and four test files plus mobile/__tests__/appIcon.test.ts. The gate accepts these.
- The Files line attaches 9 lists, and the compliance outputs are in the folder:
  - surface-136 (in-plan-compliance-surface-136)
  - mobile-90
  - mobile-98
  - mobile-99 (p1 and p2)
  - eng-all (plan-engineering-eng-all)
  - step-132
  - plan-protocol
  - inc-1-2
  - ms-1-2

  Each has its plan output and in- input, with prompt hashes matching context-r1.md, and no gap is named. Neither step-132 nor any other list has a missing output.

(6) PASS. `planGateErrors` for lane BL-MCAPP313 on the card as it will stand, with the working-tree folder, this file and the Plan line below added in memory, resolves 9 lists, rules 129 findings and returns 0 errors.

Verdict: PASS

Plan: task-313 sha256:9b04500143c4

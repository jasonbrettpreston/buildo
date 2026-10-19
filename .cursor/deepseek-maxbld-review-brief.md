---
write_scope:
- .cursor/deepseek-maxbld-review.md
allow_commit: false
---
# Independent review: max-build scenarios design vs. the verbatim by-law text (Spec 08 second-model review)

You are an independent reviewer. A different model wrote this design; your job is to find where it is WRONG, AMBIGUOUS or INCOMPLETE against the actual by-law text. Do not trust the design's own citations; check the words. READ-ONLY: the only file you may write is `.cursor/deepseek-maxbld-review.md`. Do not edit anything else. Do not commit.

## Material
1. `docs/specs/01-pipeline/78_optimal_lot_configuration.md` — section "§Phase-5" (lines ~673–1230), sub-sections P5.0–P5.13. The field table is **P5.10** (lines ~1000–1075). P5.2 (main building per class), P5.4 (houseplex units), P5.5 (rear suite), P5.6 (renovation) explain the computations.
2. `docs/specs/01-pipeline/131_lot_configuration_policy.md` — policy rows LC-n.
3. `docs/specs/01-pipeline/69a_mcbylaw_register.md` — rows M-180 .. M-198 (lines ~280–301).
4. `docs/reference/bylaw-provisions.json` — the verbatim Toronto Zoning By-law 569-2013 text. 14 MB, ONE provision per line, so `read_file` cannot open it whole. Use `grep_files` with `path: "docs/reference/bylaw-provisions.json"` and a pattern on the article id, e.g. `"article":"10\.20\.40\.10"` or `"article":"150\.7\.60\.20"`. Each matching line is a JSON object; the deciding words are in its `"verbatim"` field. You may also grep a phrase inside the verbatim text (e.g. `main walls`, `houseplex`, `45 percent`).

## Chapter numbering (residential zones)
R = 10.10, RD = 10.20, RS = 10.40, RT = 10.60, RM = 10.80; general residential rules 10.5; definitions 800.50; garden suites 150.7; laneway suites 150.8; secondary suites 150.10; Chapter 600 (600.60 houseplex areas); Chapter 900 exceptions. Section suffixes mirror each other across the zone chapters (x.30.40 lot coverage, x.40.10 height, x.40.40 floor area/FSI, x.40.70 setbacks, x.40.30 building depth, x.30.10/x.30.20 lot area/frontage, x.40.1 general/units, x.5.x...), but clause letters can differ by chapter. Check each zone; do not assume RD wording holds in RS/RT/RM/R.

## Tasks
(a) **Per-field verification.** For EVERY field in the P5.10 table that cites or depends on a by-law clause, find the clause(s) in bylaw-provisions.json, QUOTE the deciding words (short exact quote), and give a verdict: CORRECT / WRONG / AMBIGUOUS, per zone where it differs (R, RD, RS, RT, RM). Explain WRONG/AMBIGUOUS in one or two sentences. Fields that are pure metadata (`parcel_id`, `computed_at`, versions) may be listed as N/A in one line.

(b) **Missing fields/rules.** List fields or rules a correct max-build answer needs that the P5.10 table lacks or that P5.2 does not apply. At minimum check: main-building front / side / rear setbacks (x.40.70, 10.5.40.70); building depth (x.40.30); lot frontage and lot area minimums per building type (x.30.10, x.30.20); angular planes; landscaping / soft landscaping (x.5.50, 10.5.50); parking (Chapter 200); established grade (definition, 10.5.40.10); heritage, ravine (Chapter 658 / natural feature) and Chapter 900 exceptions; minimum dwelling-unit sizes; decks / platforms (10.5.40.50, x.40.50). For each: cite the clause with a quote and say whether the design covers it anywhere (cite the line) or not.

(c) **Missing scenarios.** List any max-build scenario a property owner would reasonably expect that P5.1's closed set omits (e.g. semi-detached house, townhouse, duplex/triplex/fourplex as separate forms, multiplex in RM, laneway vs garden suite as separate rows, demolish-and-rebuild vs addition), with the by-law clause that permits it in each zone.

(d) **Number support.** List EVERY numeric value the design uses (metres, percentages, m², unit counts, storeys, e.g. 10.0 m, 7.0 m, 2.5 m, 1.4 m, 2.0 m, 10.0 m², 40 %, 45 %, 60/50/40 %, 4.0/6.3 m, 4.0/7.5/5.0 m, 45.0 m, 12.2 m, 4 or 6 units, 70 %), and for each say whether bylaw-provisions.json supports it EXACTLY (quote + article id), PARTIALLY (supported with conditions the design drops), or NOT FOUND.

## Output
Write ONE markdown file `.cursor/deepseek-maxbld-review.md` with four sections: (a) a table `| Field | Clause(s) | Quote | Verdict | Note |`; (b) missing-fields list; (c) missing-scenarios list; (d) a table `| Number | Where design uses it | Article | Quote | Support |`. End with a "Top problems" list (most serious first). Be concrete; every claim must carry an article id and a quote. Say "UNVERIFIED" when you could not find the text rather than guessing. Write the file before you run out of iterations — write an early draft by about iteration 25 and refine it after.

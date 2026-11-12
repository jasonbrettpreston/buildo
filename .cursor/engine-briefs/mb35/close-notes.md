---
write_scope:
- .cursor/MCBYLAWS-QUEUE.md
- docs/reports/panels/MB-31.json
---
# Brief: MB-35 close note (queue) and the MB-31 panel note — two text insertions, nothing else

You make exactly two edits. Do not change any other byte of either file. Do not reformat, re-wrap or re-indent anything. Do not commit.

## Edit 1 — `.cursor/MCBYLAWS-QUEUE.md`
Find the ONE line that starts with:
`- Dated note 2026-11-11 (M-246, prior text kept; MB-35 · McBylaws queue; operator, verbatim: "D-1 b and D-2 to D-8 a"`
Insert the following as a NEW line directly after that line (one single line, starting with `- `, no line breaks inside it):

- Dated note 2026-11-12 (M-246, prior text kept; MB-35 · McBylaws queue · close): the DB part of MB-35 is done. The MB35-COHORT night (attempt 5, 2026-11-12 10:45-10:52) applied 276, 292, 294, 296, 310, 309, 311, 313 and loaded 293,913 rows on 1,921 lots (golden 25 + Fenside-Parkwoods), loaded = computed, golden 25 = the McProof key; its capture could not be committed (#44 could not witness the logic_variables lookup), so decision D-54 moved the zone list to a declared shared config entry and the capture rerun MB35-RECAP (rehearsed on the test stack first; operator "recap a" and "S2") retook the POST capture on dev at 008e95c60 (16:51-16:55): values equal on every row, rerun zero, VACUUM FULL to 384.63 MiB. Landed: the POST capture, witness trace, recapture.json, explained-diffs.json and the census legacy "none" (R-DK); step-validate scores compute_maxbld_scenarios 17/17 with #44 PASS. Not met: `standard=V3` is not printed while the step is pending and the fleet programme item EP-PIN-D17 is PARTIAL; the stored Layer 2 stamps (4e7ea5d17e90) predate the repo table_version (d312906ff10e), so Layer 3 rows carry phase2_disclosures_not_current until the Layer 2 re-stamp night. Record: `docs/reports/nights/MB35-COHORT.md`.

## Edit 2 — `docs/reports/panels/MB-31.json`
The file is JSON. It has a top-level string field `"output"`. Append the text below to the END of that string's value (inside the quotes, after its current last character, starting with one space). Keep the file valid JSON; escape nothing except what JSON requires (the text has no double quotes or backslashes).

 MB-35 capture (2026-11-12): the capture rerun job MB35-RECAP retook the POST capture after D-54 (rehearsed end to end on the test stack with the real hooks, then the dev run at 008e95c60): 293,913 rows, values equal on every row, 73,158 detached rows carry the stale-disclosure word while the Layer 2 stamps predate the repo table_version, rerun zero, golden 25 150/150, VACUUM FULL (operator S2) to 384.63 MiB. The capture commit lands the POST capture, the witness trace, the recapture recipe, an empty explained-diffs list and the census legacy none; step-validate 17/17, #44 PASS; open: the fleet item EP-PIN-D17. No seat re-run: job amendments only, each rehearsed; the row check and the hooks are the evidence.

## Check before you stop
- `git diff --stat` shows exactly 2 files changed, 1 line added to the queue, 1 line changed in MB-31.json.
- `node -e 'JSON.parse(require("fs").readFileSync("docs/reports/panels/MB-31.json","utf8"))'` exits 0.

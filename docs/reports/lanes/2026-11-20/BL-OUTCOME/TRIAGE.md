out-code-review#1 pile:"the seat id class [a-z0-9]+ is the plan 4.3 grammar but narrower than the TRIAGE id class, so in a mixed seat file a hyphenated id line is skipped ..."
out-code-review#2 pile:"selfTask is read by outcomeErrors but missing from the JSDoc param type (grep: only the signature and the call sites name it). Doc comment only."
out-code-review#3 pile:"the line field written to each kinds entry is never read (only kind and sev are); dead data. Same as round 1 out-code-review#4."
out-code-review#4 pile:"the rd helper returns null for every read error, so EACCES or EISDIR is reported as a missing file; wrong cause named, still a refusal."
out-code-review#5 pile:"an unreadable lens output (a directory named out-x.txt, a broken symlink) throws out of the --outcomes CLI as a stack trace instead of a refusal ..."
out-code-review#6 pile:"task:task-0399 keeps its zero in the lookup regex and is refused as having no task file (a false refusal, not a bypass: the same unresolved ref ..."
out-code-review#7 pile:"the added triage callbacks read sha, path and base only; the ids and d fields of the context are unused. Test-only."
out-compliance-agents-s7-s11#7 pile:"a TRIAGE line written <id>: fixed:... (colon after the id) does not match the line parser and is dropped, so an earlier line of that id governs; ..."
out-compliance-eng-all#2 pile:"the 30 and 20 character floors and the 12-hex seat sha are new literals with no _contracts.json key or contracts test row; registering gate ..."
out-compliance-eng-all#4 pile:"non-null assertion in a test with no inline justification (Eng 2.3); one-line comment. Same as round 1 eng-all#2."
out-compliance-inc-S#2 pile:"the RR branch matches the id as a substring of the file name or title line (RR-0001 inside RR-00012); no 5-digit decision exists and every RR file ..."
out-compliance-policy-124-s2-s5-p1#3 pile:"doc gap: the 08_agents.md notes do not say where the severity that picks the allowed forms comes from (the grounder reason, first 40 characters, ..."
out-compliance-policy-124-s2-s5-p1#4 pile:"doc gap: the dated notes do not list the seat refusals (file under the lane directory, sha unchanged, at least one finding line); they are in ..."
out-compliance-policy-124-s2-s5-p2#1 pile:"R-HK says operator decisions go through decision-log.mjs --import into docs/reports/decisions and register rows; the notes quote MORNING-DECISIONS ..."
out-error-paths#1 pile:"substring match of the RR id (RR-0333 inside a longer slug or RR-03330); a decision file always exists for the id that passes today, so no false ..."
out-error-paths#2 pile:"the close only needs the new block to be present, so a round-2 close that replaces the Final Summary drops round 1 from the page (history only; no ..."
out-error-paths#3 pile:"a doubly appended block is accepted and the next round counts both copies; the one-command form replaces then appends so a repeat leaves one block ..."
out-error-paths#4 pile:"same defect as out-code-review#5, an unguarded read in the --outcomes CLI. Pile."
out-error-paths#5 pile:"the pickaxe -S@lane-<name> is a substring match, so a lane whose name prefixes another on the same card could take the earlier launch; the close ..."
g399#1 fixed:032525629 docs/reports/lanes/2026-11-20/BL-OUTCOME/out-compliance-policy-124-s2-s5-p1.txt
g399#2 fixed:032525629 docs/reports/lanes/2026-11-20/BL-OUTCOME/plan-compliance-399-airtight-v3-122.txt
g399#3 fixed:bf773dd docs/specs/00-architecture/08_agents.md
g399#4 pile:"task: and ruling: read the lane own index, so a card or decision opened on the board after the last merge is refused as having no task file; the ..."
g399#5 fixed:bf773dd scripts/hooks/check-lane-close.mjs
g399#6 pile:"a later REJECTED line of the same id hides an earlier CONFIRMED (grounder-authored forgery route; known limit; tasks 401 and 402 own it). Pile."
rg#2 fixed:bf773dd scripts/analysis/backlog-brief.mjs
rg#4 fixed:bf773dd scripts/hooks/check-lane-close.mjs

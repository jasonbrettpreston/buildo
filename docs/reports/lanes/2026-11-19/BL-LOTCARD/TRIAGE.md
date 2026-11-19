# TRIAGE r1 plan review (task-336, lane BL-LOTCARD); output r1-plan.txt
Opened: context-2026-11-19.md plan section; src/lib/parcels/lot-map.ts; src/tests/consumer-parcel-lookup.infra.test.ts:208-216; schema.ts:2611.
| finding | verdict | why / fold |
|---|---|---|
| CRITICAL doc-2/doc-16 ENOENT (generator) | REJECT | generator/milestone docs are outside this task; the AC, ruling and v8 page (choose-lot.html:306) are read directly |
| CRITICAL C.5 fill tier is not a footprint drawing | KEEP as report item | brief: geometry needs a new payload shape (second outline per lot), outside the two ruled fields, so presence is drawn and geometry recorded as a follow-up; the report says plainly C.5 is presence only and asks the operator; no claim of "footprint drawn" |
| CRITICAL AC1 outsourced, no threshold | REJECT | brief splits AC1 (script by lane, run by orchestrator, standing rule 2 no DB); go/no-go is the operator's |
| HIGH parcel_buildings unverified premise | KEEP in part | read: schema.ts:2611 parcel_buildings(parcel_id int FK parcels.id, is_primary, structure_type) and the same join at src/app/api/permits/[id]/route.ts:226; data-check script also counts lots with a PRIMARY building so the orchestrator sees the difference |
| HIGH "has the house" overreach (garage) | REJECT in code, KEEP as report UNVERIFIED | the ruling and brief say footprint presence; is_primary/structure_type filter would be a reading beyond the ruling; data check counts both |
| HIGH empty-string street | KEEP | normalise '' to null in assembleLotMap (TS, keeps the column list plain) with a test case |
| HIGH script accepts any URL / argv credentials | KEEP in part | refuse any host:port other than 127.0.0.1:55322 (rehearsal stack), session BEGIN READ ONLY, never print the URL; URL on the command line is the brief's rule |
| HIGH lock breaks on EXISTS commas | REJECT | the splitter in the lock (`,(?![^(]*\))`) is paren-aware; the EXISTS has no inner comma; proven red then green; one mapping line added |
| HIGH RR-0190 cites per step | REJECT | plan cites RR-0284; commit and report cite it |
| HIGH RR-0172 vs RR-0284 | KEEP as note | RR-0172 governs the road labels (unchanged); the dated MF-53 note says so |
| MEDIUM 14 to 16, planted red scope | KEEP | the whitelist test states 14 -> 16; planted red lives in the test only |
| MEDIUM relevancy | REJECT | task-336 is the task RR-0284 ruled |
| LOW verbatim words, path forms, a11y color-only | REJECT | decision-84 carries the verbatim words; map is hidden from readers and the card line is the accessible equivalent (LotMapBinding importantForAccessibility) |
| LOW EXISTS per address N small | KEEP | one comment line in lot-map.ts |
| NITs on generator | REJECT | out of scope |
| rollback/other MEDIUM-LOW items | REJECT | change is additive; rollback is a revert of the one commit |

# TRIAGE r2 output review (one lens: wrong-lot attribution and missing-data rendering); output r2-output.txt
| finding | verdict | why / fold |
|---|---|---|
| HIGH fill reads s.map.lots[i] not s.lots[i] | REJECT | lotMap.ts builds s.lots by mapping map.lots in order (lotMap.ts:97-103), same index as the cards and the existing area/frontage reads; same source |
| HIGH has_footprint any row, not "the house" | REJECT | superseded by RR-0289 (MORNING-DECISIONS.md:1117): "a house or structure ... reliable to say something is there"; presence only |
| HIGH guard parses URL twice | KEEP | fixed: protocol check, query/fragment refused, client built from validated parts; test added |
| MEDIUM client frontageStreet blank | KEEP | fixed: typeof string and trim() !== '' in the binding |
| MEDIUM btrim vs JS trim | KEEP | fixed: ~ '[^[:space:]]' |
| MEDIUM declared-but-unconsumed contract paths | REJECT | the card reads lot.* like area/frontage/zoning do; goldens carry the contract refs |
| MEDIUM required keys on strict server schema | REJECT | tests and fixtures updated, typecheck clean; mobile stays optional for cached payloads |
| MEDIUM CONSUMER_MAP_COLS has_footprint not a column | REJECT | the lock compares the constant with the SELECT; comment names has_footprint as the massing join |
| MEDIUM other LotRow producers | REJECT | grep: resolveLotMap is the only producer |
| MEDIUM pg dependency | REJECT | pg ^8.13.1 is a root dependency (package.json:113) |
| MEDIUM primary footprint unused in summary | REJECT | RR-0289; has_primary_footprint still printed per lot |
| MEDIUM no test for refuse / main guard | KEEP | refuse test added; main guard uses pathToFileURL |
| LOW connect outside try | KEEP | connect moved into the try |

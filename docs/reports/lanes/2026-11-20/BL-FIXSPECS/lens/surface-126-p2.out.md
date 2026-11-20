◇ injected env (0) from .env // tip: ⌘ multiple files { path: ['.env.local', '.env'] }
REVIEW template=lens-compliance.md model=deepseek-reasoner at=2026-11-20T15:23:37.905Z file_sha256=c5311b1050587443d9f7dc03bf973372cbe49e1717cd02eb9f5b220ba1ecdb5b prompt_sha256=57e2453c69460c5e7fc435b51eaf2ea08a48182e3e97cd1a1f796fc23e4cfe32
🔍 Lens review of /Users/brettpreston_macmini/Buildo-scratch/lanes-20261119/inc1b/fixspecs/lens/surface-126-p2.txt (model: deepseek-reasoner)

[deepseek-review] deepseek-reasoner working… reasoning 11117 chars, answer 0 chars, 15s
[deepseek-review] deepseek-reasoner working… reasoning 22588 chars, answer 0 chars, 30s
[deepseek-review] deepseek-reasoner working… reasoning 33112 chars, answer 0 chars, 45s
[deepseek-review] deepseek-reasoner working… reasoning 44452 chars, answer 0 chars, 60s
BUG severity=HIGH — 126 §11 "Budget, stated up front (the P3 discipline)." — docs/specs/02-web-admin/126_maxbld_surface_standard.md:877 "### 11a.8 Performance budget (REPORT only; other archetypes on conversion)" shown REMOVED on the same line the note is ADDED — the change deletes the REPORT performance-budget section and puts the meter note in its place, and none of the cited rulings (RR-0178, RR-0271, RR-0278) names that deletion — restore the 11a.8 heading and place the dated note inside 11a.7, after the Stage B note it amends

BUG severity=HIGH — 126 §5.6 "Spec 100 has no sub-section literally numbered §2.6", "cited by item, not by a section number that does not exist" — scripts/surfaces/parcel_product/F02/contracts/contract_parcels_entitlement.descriptor.json:54 "docs/specs/03-mobile/100_mobile_parcel_cost_tool.md §2.6 (the shape drives the client state machine)" — the citation the standard declares invalid survives in a file this change edits precisely for stale-citation defects — change it to "§2 item 6" and pin it in the new test

BUG severity=HIGH — 126 §5.0 "The rule: nothing in that fan-out is hand-written, and nothing in it is a second declaration." — src/tests/spec-notes-1b.logic.test.ts "the hand-kept census mirror stays equal to both descriptors" and "expect(entry).toEqual(d)" — the census entry is kept as a full hand-maintained duplicate of the descriptor and locked by an equality test instead of being emitted from the descriptor — generate the scripts/surfaces/_schema/census/contracts.json entry from the descriptors behind a --check, or drop the copy

BUG severity=HIGH — 126 §5.0a "a RED canary proving the check itself fires" — src/tests/spec-notes-1b.logic.test.ts "const sec = s.slice(s.indexOf('### 11a.7 Golden render states'), s.indexOf('### 11a.8 Performance budget'));" — the 11a.8 heading is deleted by this same commit, so indexOf returns -1 and slice(start, -1) widens sec to the whole rest of the file, leaving "the note sits inside 11a.7" unproven — assert both boundary indices .toBeGreaterThan(-1) before slicing, or keep the heading

BUG severity=MED — 126 §5.0 "A type that disagrees with the schema is not a disagreement to reconcile, the type is regenerated." and "A validator in a test that re-implements the rules is banned; the test imports the same module the engine does." — src/tests/spec-notes-1b.logic.test.ts "const sent = [...rt('src/app/api/parcels/entitlement/types.ts').matchAll(/^\s{4}(\w+): z\./gm)].map((m) => m[1]);" then "expect(d.inputs.field_whitelist).toEqual(sent)" — the test makes the hand-written Zod file the authority and regex-scrapes it to lock the descriptor whitelist, inverting the one-source direction — assert from the descriptor outward (or import the generated types) and treat types.ts as the emitted side

DEFER severity=MED — 126 §5.0a "Copy the BUILDO_LOGIC_VARS_SEED_PATH test-only override too, it is the difference between a canary that can be written and one that cannot." — src/tests/spec-notes-1b.logic.test.ts "const ENT = 'scripts/surfaces/parcel_product/F02/contracts/contract_parcels_entitlement.descriptor.json';" — every path is a hard-coded constant with no env override, so no tampered-file RED canary can be pointed at a fixture — add BUILDO_SPEC_NOTES_*_PATH overrides on the same pattern

DEFER severity=LOW — 126 §5.7 "§2's numbered behavioural contract and §3.2's field lists become descriptor data and are deleted from prose" — docs/specs/03-mobile/100_mobile_parcel_cost_tool.md:125 "the meter is logged semi_pending and counts nothing" — the note restates a meter rule already carried by contract_parcels_lookup.descriptor.json data_story and by the new test, a third copy of one rule — bounded risk, justified because the note records a ruling, but name the descriptor as the value's home and point at it

MET — 126 §5.2 field_whitelist parity — scripts/surfaces/parcel_product/F02/contracts/contract_parcels_entitlement.descriptor.json:7,77-84 — the whitelist names seven fields including resetsOnDisplay and the prose now reads "whitelist of seven fields"

MET — 126 §5.6 "cited by item" — docs/specs/02-web-admin/126_maxbld_surface_standard.md:877 — the new note cites "Spec 100 section 3.2 dated note 2026-11-20", a section that exists, rather than §2.6

MET — 126 §7 "the counter stays derived, COUNT(*) over the window, never a column" — docs/specs/03-mobile/100_mobile_parcel_cost_tool.md:125 — the count is a usage_events row via openReport ("counts one report", "only when ... its page is produced"), no stored counter column

REJECT — 126 §7.1 "usage_events carries exactly one insert policy for anon" — accused of not building the anon offer_impression policy — not a real issue: the pasted MF-45 dated note says that policy lands with MF-61, section 7.1

REJECT — 126 §5.3 the five named client-side exceptions — accused of adding client logic in the semi question — not a real issue: the server sends page null and the client only shows the declared loading state and sends semi=answered

VERDICT: FAIL on compliance with the pasted clauses
Clauses checked: 13   Unmet: 5

---
⏱  67258ms (67.3s)
📊 Tokens — total: 42640, input: 28846, output: 13794, reasoning: 12402

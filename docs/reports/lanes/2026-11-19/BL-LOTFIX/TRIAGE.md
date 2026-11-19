# TRIAGE r1 plan review (BL-LOTFIX, task-338)
Opened: scripts/surfaces/parcel_product/F02/contracts/contract_parcels_lookup.descriptor.json:107-170 (field_whitelist), scripts/surfaces/screen-checks.mjs:335-357, ~/Buildo-scratch/queues-20261113/MORNING-DECISIONS.md:1118-1122.
- CRITICAL hand-edit vs AC3 "no golden edited by hand": REJECT. AC3 forbids goldens; the descriptor is the declaration source (generated files are the registry and census-derived outputs); the census contracts.json is checked below for an owner and listed in the report. Whether a generator owns it is verified in the build (KEEP as a check, not a plan change).
- CRITICAL documents ENOENT in the context pack: REJECT for this lane (brief-generation tooling, outside scope; the fix does not depend on those documents).
- HIGH no lockstep test types.ts vs whitelist: REJECT (new test = scope creep; brief: declarations and regenerated files only). Noted as a follow-up for the orchestrator in REPORT.
- HIGH whitelist holds response names: REJECT. contract_parcels_lookup.descriptor.json:107-170 whitelist already lists response fields (match, candidates, lots, area, outline, page ...); screen-checks.mjs:335 documents it as "the response projection (inputs.field_whitelist)".
- HIGH five failing suites not in AC: REJECT (rule 18 forbids the runner; each case's generator/gate command is run instead and pasted).
- HIGH RR-0289 absent: REJECT (MORNING-DECISIONS.md:1118 exists: massing footprint presence; named in the brief).
- HIGH RR-0172 conflict: REJECT (declaration only; no read added by this lane).
- HIGH two commits: REJECT (the brief orders one fix commit).
- HIGH AC1 rename risk: REJECT (task-336 is BUILT on the board head, names fixed in types.ts:111-112).
- HIGH regeneration bounded: KEEP. Every generator --check is captured on the head before the edit and the diff after is classified.
- MEDIUM tautological --write/--check: KEEP. Mechanical check added: registry rows 980 to 982 and git diff --numstat on the registry.
- MEDIUM hasFootprint scope: REJECT (brief orders declaring both, reason in REPORT: same lots[] object in types.ts:112).
- MEDIUM remaining items (brief tooling, truncated titles, superseded rulings, trailer, manifests, relevance filter): REJECT, not this task's scope; MF-53 trailer is given in the brief.

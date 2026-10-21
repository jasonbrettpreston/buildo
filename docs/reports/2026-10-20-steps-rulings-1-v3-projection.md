# V3 projection after the bundled RE-FREEZE night, and the R-EY-9-WHY-TEXT draft (steps-rulings-1, 2026-10-20)

**Measured at `028c9b28`.** `step-validate --all --fast` reads **R-EY 4/43** (compute_centroids, assert_engine_health,
geocode_permits, link_parcel_abutments), the same as at base `885c2ad2`. Rows R-HN…R-IF (124a §B26, §B31) gave 40 of
the 41 class-c entries a rule id. Five are cited now, so condition (9) already clears for refresh_snapshot's grandfathered
entry, link_parcels' grandfathered entry, assert_coa_freshness, classify_coa_trades (CCT-D10) and
compute_coa_cost_estimates; none of them reads V3 yet, because each still fails another condition.

**Method.** For each step, the script applies every `apply: "bundled-night"` entry of
`docs/reports/2026-10-20-v3-condition9-backfill-citations.json` (141 entries: backfill-9's 102 and this lane's 39) in
memory by appending `append_text` to `deviations[i].adjudicated_by`. It removes the one `stale.action: "retire"`
entry (assert_data_bounds ADB-D7, R-HZ) and recomputes condition (9) with the gate's own
`exceptionEntries` / `exceptionCitationFailures` (`scripts/analysis/gates/v3-label.mjs`) against the register ids
on this tree. "Other conditions" are the step's current `step-validate` fail list without its condition (9) part.
The projection assumes the night's one recapture succeeds, which clears the G8 `source_fingerprint` and gate G
`lib_fingerprint` stops the night itself causes. "Strict" is the same count if condition (9) read only
`adjudicated_by` for a deviation (see the draft below).

**Result: 28 of 43 evaluated steps would read V3** (from 4): 23 converted steps flip (every converted V2 step except
refresh_snapshot, which still fails purity (1) and SCALABLE (7) and holds the E3 exception D-P1, and
neighbourhoods, which keeps N-D1 uncited because N-D1 is RULING-OWED), plus the pending load_coa_notices. Every other
pending step still fails condition (8) (LDG-10, CHAIN-TOOLING, EP-PIN-D17), most of them also (3) and (5)/(6).

| Step | Stage | Now | Uncited after both lists land | Strict (adjudicated_by only) | Other conditions still failing | Projected |
|---|---|---|---|---|---|---|
| assert_schema | converted | V2 | 0 | 0 | none | V3 |
| load_ravines | converted | V2 | 0 | 0 | none | V3 |
| link_massing | converted | V2 | 0 | 1 | none | V3 |
| link_wsib | converted | V2 | 0 | 0 | none | V3 |
| link_parcel_addresses | converted | V2 | 0 | 0 | none | V3 |
| compute_centroids | converted | V3 | 0 | 0 | none | V3 |
| link_parcels | converted | V2 | 0 | 2 | none | V3 |
| refresh_snapshot | converted | V2 | 0 | 0 | 1 purity 1 row(s); 7 SCALABLE 1 deferred | V2 |
| enrich_parcels | converted | V2 | 0 | 0 | none | V3 |
| assert_global_coverage | converted | V2 | 0 | 0 | none | V3 |
| assert_data_bounds | converted | V2 | 0 | 0 | none | V3 |
| assert_engine_health | converted | V3 | 0 | 1 | none | V3 |
| link_neighbourhoods | converted | V2 | 0 | 1 | none | V3 |
| geocode_permits | converted | V3 | 0 | 0 | none | V3 |
| assert_parcel_sanity | converted | V2 | 0 | 0 | none | V3 |
| enrich_ravines | converted | V2 | 0 | 0 | none | V3 |
| enrich_heritage | converted | V2 | 0 | 0 | none | V3 |
| compute_parcel_cost_estimates | converted | V2 | 0 | 2 | none | V3 |
| address_points | converted | V2 | 0 | 0 | none | V3 |
| parcels | converted | V2 | 0 | 0 | none | V3 |
| load_centreline | converted | V2 | 0 | 0 | none | V3 |
| massing | converted | V2 | 0 | 0 | none | V3 |
| neighbourhoods | converted | V2 | 1 (ledger N-D1) | 1 | none | V2 |
| load_wsib | converted | V2 | 0 | 2 | none | V3 |
| load_heritage | converted | V2 | 0 | 0 | none | V3 |
| enrich_centreline | converted | V2 | 0 | 0 | none | V3 |
| load_zoning | converted | V2 | 0 | 0 | none | V3 |
| load_bylaw_map_areas | converted | V2 | 0 | 0 | none | V3 |
| link_parcel_abutments | converted | V3 | 0 | 0 | none | V3 |
| load_coa_notices | pending | V2 | 0 | 0 | none | V3 |
| permits | pending | V2 | 0 | 0 | 3 #44 not evaluated; 6 G0 0/1, G1 0/1, G2 0/1, G3 1/2, G4 0/2, G5 0/1, G8 0/3, G9, Rule 1, Rule 5, Rule 6, Rule 7, Rule 8, Rule 9, Rule 13; 8 LDG-10, CHAIN-TOOLING, EP-PIN-D17 | V2 |
| coa | pending | V2 | 0 | 0 | 8 LDG-10, CHAIN-TOOLING, EP-PIN-D17 | V2 |
| assert_coa_freshness | pending | V2 | 0 | 2 | 3 #44 UNWITNESSED; 5 G8; 6 G8 0/3; 8 LDG-10, CHAIN-TOOLING, EP-PIN-D17 | V2 |
| classify_coa_scope | pending | V2 | 0 | 0 | 3 #44 UNWITNESSED; 5 G8; 6 G8 0/3; 8 LDG-10, CHAIN-TOOLING, EP-PIN-D17 | V2 |
| link_coa_to_parcels | pending | V2 | 0 | 0 | 8 LDG-10, CHAIN-TOOLING, EP-PIN-D17 | V2 |
| enrich_permits | pending | V2 | 0 | 2 | 3 #44 UNWITNESSED; 5 G8; 6 G8 0/3; 8 LDG-10, CHAIN-TOOLING, EP-PIN-D17 | V2 |
| enrich_coa_zoning | pending | V2 | 0 | 0 | 8 LDG-10, CHAIN-TOOLING, EP-PIN-D17 | V2 |
| classify_coa_trades | pending | V2 | 0 | 1 | 3 #44 UNWITNESSED; 5 G8; 6 G8 0/3; 8 LDG-10, CHAIN-TOOLING, EP-PIN-D17 | V2 |
| compute_coa_cost_estimates | pending | V2 | 0 | 1 | 3 #44 UNWITNESSED; 5 G8; 6 G3 1/2, G8 0/3; 8 LDG-10, CHAIN-TOOLING, EP-PIN-D17 | V2 |
| assert_entity_tracing | pending | V2 | 0 | 0 | 3 #44 not evaluated; 6 G8 0/3, Rule 1, Rule 5, Rule 6, Rule 7, Rule 8, Rule 9, Rule 13; 8 LDG-10, CHAIN-TOOLING, EP-PIN-D17 | V2 |
| assert_network_health | pending | V2 | 0 | 0 | 3 #44 not evaluated; 6 G8 0/3, Rule 1, Rule 5, Rule 6, Rule 7, Rule 8, Rule 9, Rule 13; 8 LDG-10, CHAIN-TOOLING, EP-PIN-D17 | V2 |
| assert_staleness | pending | V2 | 0 | 0 | 3 #44 not evaluated; 6 G8 0/3, Rule 1, Rule 5, Rule 6, Rule 7, Rule 8, Rule 9, Rule 13; 8 LDG-10, CHAIN-TOOLING, EP-PIN-D17 | V2 |
| assert_lifecycle_phase_distribution | pending | V2 | 0 | 0 | 3 #44 not evaluated; 6 G8 0/3, Rule 1, Rule 5, Rule 6, Rule 7, Rule 8, Rule 9, Rule 13; 8 LDG-10, CHAIN-TOOLING, EP-PIN-D17 | V2 |

V3 projected: 28 of 43

## PIN R-EY-9-WHY-TEXT — draft ruling for the operator (the gate is unchanged)

**Question.** R-EY condition (9) asks that every exception entry naming a step "cites a register rule id". For a
`deviations[]` entry the gate reads `adjudicated_by` and `why` together
(`scripts/analysis/gates/v3-label.mjs` `exceptionEntries`: ``text: `${textOf(d?.adjudicated_by)} ${textOf(d?.why)}` ``).
A rule id in `why` is often a rule the deviation only *mentions*, such as "the catalog reads leave compute (R-BZ G3)".
That is not the ruling that authorized the deviation. Should condition (9) read the authorizing citation from
`adjudicated_by` only, for `deviations[]` entries?

**Recommendation: yes, in three stages, so no step that reads V3 drops (E1 ratchet).**
1. `step-validate` prints an advisory line per step naming each deviation whose only resolving id is in `why`.
   The verdict does not change.
2. Each such entry gets its ruling cited in `adjudicated_by`, or goes to the operator if no ruling covers it. At
   this projection there are 15 entries in 10 steps (N-D1, owed, is the 16th):
   - link_massing: `override.force_full / recovery.force LINK_MASSING_FORCE_FULL …`;
   - link_parcels: the JS (non-PostGIS) fallback path; `override.force_full / recovery.force LINK_PARCELS_FORCE_FULL`;
   - assert_engine_health: `execution.shape — left undeclared rather than "recorder"` (a step that reads V3 today);
   - link_neighbourhoods: `Spec 123 §3.1 — a second algorithm is pinned verbatim at conversion`;
   - compute_parcel_cost_estimates: the Phase-B-B3 run-ledger gate (F8/F9); the D#3 atomic co-read;
   - load_wsib: the argv `--file <csv>` input seam …; the legacy no-name skip rate as a WARN;
   - assert_coa_freshness: the Zod refine config refusal; `R-CE: a calendar date derives from ctx.clock …`;
   - enrich_permits: the 16 `information_schema` probes; the `pipeline_runs` recency read. These are the twins of
     enrich_coa_zoning's deviations that R-IB and R-IC ruled; the operator's CHAT-16/CHAT-17 named
     enrich_coa_zoning only, so whether they extend to enrich_permits is a question for the operator;
   - classify_coa_trades: legacy audit values are display strings;
   - compute_coa_cost_estimates: legacy `--limit=N`.
3. Then the gate reads `adjudicated_by` only for a deviation: one line in `exceptionEntries`, with a red-first lock (a
   fixture whose only id is in `why` reads uncited). Grandfathered entries keep whole-entry text, because backfill-9
   and this lane placed their citations in `why` by design; ledger rows keep the R-GR status form.

If stage 3 were switched on today, the projection above would fall from 28 to 22 (link_massing, link_parcels,
link_neighbourhoods, compute_parcel_cost_estimates and load_wsib would not flip). assert_engine_health would drop
from V3, which the E1 ratchet turns RED. That is why the switch is staged.

**Conflict check.** R-EY (9) (Spec 124 §5, 124a §B26) names the populations and "cites a register rule id" but not the
field; this draft narrows the field for one population and amends R-EY (9) explicitly. R-GR (ledger status forms)
is unchanged. E1 (ratchet): satisfied only by stage 2 before stage 3, as above. REFREEZE-BUNDLE-1: independent (no
descriptor byte moves at stages 1 or 3; stage 2 citations on converted descriptors ride a night like any other).

| Question | Answer |
|---|---|
| STANDARDIZED | One field carries a deviation's authorization: `adjudicated_by` (the field every backfill and ruling lane already appends to). |
| OBSERVABLE | Stage 1: an advisory `R-EY (9) why-only` line per step in `step-validate`; stage 3: the existing `deviations[] k/n no rule id` detail. |
| RECORDED | A register row from the operator's decision (decision log + generator, R-HK); this draft is its text. |
| SCALABLE | Every step's `deviations[]`, by field, no slug list. |
| ACCURATE | Measured above: 15 why-only entries in 10 steps after both apply lists land (`project-strict`, the gate's own functions); red-first lock at stage 3. |
| SIMPLE | One line in `exceptionEntries`; the staging exists only to keep E1 green. |
| EXTERNALIZED | No threshold: exact zero. |

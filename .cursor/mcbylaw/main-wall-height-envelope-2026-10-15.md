# Main-wall height in the max-build envelope — design (M-176 (2), (3))

Status: DRAFT, 2026-10-15 (orchestrator, operator at dinner). Ruling M-176 says main-wall height is an envelope limit, not
a disclosure. This note states what the law says, what the code does, the measured effect, a proposed model, and the
choices that need an operator answer before code changes. Nothing below is built yet.

## 1. The law (Phase 1 table, agreed units)

| Zone | Unit | Keyed expression | Applies to |
|---|---|---|---|
| R | 10.10.40.10(2)(A)/(B) | `main_wall_height_m = max(7.0 m; height_m − 2.5 m)` | residential building other than an apartment |
| RD | 10.20.40.10(2)(A)/(B) | same | permitted residential building |
| RD | 10.20.40.10(4)(A) | `max(7.2 m; height_m − 2.5 m)` | flat / shallow roof (slope < 1:10 on > 50 % of roof area) |
| RS | 10.40.40.10(2) | same as R | permitted residential building |
| RM | 10.80.40.10(2) | same as R | detached / semi-detached house |
| RT | — | no main-wall unit found in the review set | check in the table before building |

- The limit binds **one pair** of main walls, at the builder's choice: (A) the front and rear main walls, or (B) the side
  main walls ("for either (A) or (B)"). The other pair may rise to the height limit.
- Dormers (10.x.40.10(5)/(7)): on a building of two or more storeys, dormer walls are NOT main walls if the dormer faces
  total no more than **40 %** of the width of the main walls below them (M-174 (3): a design choice, disclosed).
- Lawfully existing main walls (10.5.40.11(4)) keep their height (M-158 default: not assumed).

## 2. What the code does today

`scripts/lib/compute/enrich-parcels.js` max-build pass:
- `height_implied = round(bylaw_max_height_m / storey_height_m)` (line 654; `storey_height_m` = 3.0, logic variable);
- `stories_calc` from by-law storeys, else the pocket p50, else `height_implied` (line 687);
- `max_buildable_gfa_sqm = LEAST(footprint_calc × stories_calc, fsi_cap)` (lines 692, 765).
`main_wall_height_m` is never read, although Spec 78's field inventory (row 3) lists it as an input to `max_build_stories`.

## 3. Measured effect (dev DB, 2026-10-15, read-only)

| Parcels with a max build | No FSI cap (box binds) | Box binds with FSI cap | FSI binds | 3+ storeys and box binds |
|---|---|---|---|---|
| 449,674 | 432,098 | 13,008 | 4,567 | 82,401 |

Most parcels have no `bylaw_max_fsi`, so footprint × storeys IS the answer. Example: RD, height 10.0 m → main walls
max(7.0, 7.5) = 7.5 m → two full 3.0 m storeys (6.0 m) fit under the wall limit; today the model counts round(10/3) = 3
full storeys. The third storey is partly in the roof, so today's GFA overstates it.

Separate finding: `bylaw_max_fsi` is NULL on 432,098 parcels. Check whether that is "no 'd' on the label" (law) or a
missing input (data) before trusting any GFA; this note does not decide it.

## 4. Proposed model (for review)

1. `wall_storeys = floor(main_wall_height_m / storey_height_m)`: storeys whose full height sits under the wall limit.
2. `roof_storeys = stories_calc − wall_storeys` (≥ 0): storeys that rise above the wall limit inside the roof.
3. A roof storey counts `roof_share × footprint`, where `roof_share = max(dormer_share, slope_share)`:
   - `dormer_share` = 0.40 (the 10.x.40.10(5)(B) maximum; M-176 build-more → the dormers are taken at 40 %);
   - `slope_share` = the part of the roof-storey floor under a roof that rises from the wall limit to the height limit
     across half the limited pair's span (geometry from the lot's buildable width or depth).
4. The builder picks the limited pair (A) or (B) that gives the larger GFA (M-172 / M-176: design choice → build more),
   and the answer discloses it: "Maximum main-wall height {Hm} m applies to the {front and rear | side} walls; the top
   storey sits in the roof, with dormers up to 40 % of the wall width."
5. `max_buildable_gfa_sqm = LEAST(footprint × (wall_storeys + roof_storeys × roof_share), fsi_cap)`.

## 5. Questions for the operator (blocking the build)

- **Q-MW1** How does a roof storey's floor count toward GFA? 800.50(320) counts "the total area of each floor level …
  measured from the exterior of the main wall of each floor level". If the full floor plate counts, main-wall height
  changes the building's shape but not its GFA, and only the massing and the disclosure change. If only the area
  under adequate headroom counts (a building-code test, not the by-law), the share in step 3 applies. **Recommendation:**
  take an expert or City reading before building; until then disclose and leave GFA unchanged.
- **Q-MW2** Is 0.40 the right dormer share for the maximum, or should dormers be disclosed only (M-174 (3) left them
  as a design choice)?
- **Q-MW3** RT has no main-wall unit in the review set: confirm against the table (keying gap or no rule).

## 6. Correction plan (once Q-MW1 is answered)

1. Spec 78 amendment: field-inventory row 3 states the main-wall model; a new row for the roof-storey disclosure.
2. `enrich-parcels.js` max-build pass: read `main_wall_height_m` (Layer 2 / the evaluator's answer), compute
   `wall_storeys`, `roof_storeys`, `roof_share` (logic variables, not literals: R-BZ purity), emit the disclosure.
3. Red-first tests: the RD 10 m example (2 wall storeys + 1 roof storey), a flat-roof RD lot (7.2 m), an RM
   semi-detached lot.
4. DB lane: `enrich_parcels` full recapture + G8 explanation; the 82,401 3+-storey box-bound parcels are the expected
   movers.

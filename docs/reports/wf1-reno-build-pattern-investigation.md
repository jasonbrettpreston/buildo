# WF1 — Reno-Build Pattern Investigation

**Date:** 2026-05-24
**Hypothesis:** A non-trivial fraction of permits classified as `Small Residential Projects` or `Building Additions/Alterations` are economically new builds — builders retain a wall or two (or the foundation) to avoid full demolition permit classification and to preserve grandfathered FSI/setbacks. The matrix allocation of 0.25 under-estimates these by 3-4x.

**Detection signals tested:** declared cost magnitude, description text keywords, trade count, dwelling_units_created.

## Part 1 — Prevalence by detection signal

For SFD-Detached permits classified as Small Residential Projects or Building Additions/Alterations, count permits matching each detection signal.

| permit_type | structure_type | total | cost > $500K | cost > $1M | keyword: demolish/rebuild/etc | major addition keywords | likely reno-build (both signals) |
|---|---|---|---|---|---|---|---|
| Small Residential Projects | SFD - Detached | 33356 | 857 (3%) | 148 (0%) | 1335 (4%) | 5175 (16%) | 41 (0%) |
| Small Residential Projects | SFD - Semi-Detached | 9503 | 92 (1%) | 15 (0%) | 454 (5%) | 736 (8%) | 3 (0%) |
| Small Residential Projects | 2 Unit - Detached | 3004 | 134 (4%) | 18 (1%) | 74 (2%) | 459 (15%) | 4 (0%) |
| Small Residential Projects | SFD - Townhouse | 2223 | 25 (1%) | 3 (0%) | 62 (3%) | 146 (7%) | 0 (0%) |
| Small Residential Projects | 2 Unit - Semi-detached | 1118 | 26 (2%) | 4 (0%) | 37 (3%) | 147 (13%) | 1 (0%) |
| Small Residential Projects | 3+ Unit - Detached | 877 | 82 (9%) | 14 (2%) | 26 (3%) | 151 (17%) | 4 (0%) |
| Building Additions/Alteratio | SFD - Detached | 4 | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) | 0 (0%) |

## Part 3 — Description keyword frequency in addition/small-reno permits

Specific phrases that often signal reno-build scope hidden inside an "addition" classification.

| keyword pattern | n (any cost) | n (cost > $500K) |
|---|---|---|
| rear addition | 5068 | 285 |
| second storey addition | 2205 | 127 |
| second floor addition | 1664 | 85 |
| demolish (any form) | 1158 | 34 |
| rebuild | 743 | 8 |
| third storey addition | 345 | 32 |
| raise roof | 24 | 0 |
| new construction | 21 | 3 |
| main floor renovation | 19 | 2 |
| complete renovat | 5 | 1 |
| three wall / 3 wall | 5 | 0 |
| tear down / tear-down | 1 | 0 |
| down to studs | 0 | 0 |
| substantial(ly) renovat | 0 | 0 |
| gut renovation | 0 | 0 |

## Part 4 — Trade count fingerprint for likely reno-builds

Permits classified as small reno but with FULL trade composition (foundation/framing/structural-steel + plumbing + electrical + hvac + drywall + roofing) almost certainly are new-build-scope work. Typical small addition would have 2-4 trades; full reno-builds have 8-12+.

| permit_type | structure_type | trade band | n permits | median declared $ |
|---|---|---|---|---|
| Building Additions/Alteratio | SFD - Detached | 0-2 (typical reno) | 1 | $5.0K |
| Building Additions/Alteratio | SFD - Detached | 6-8 (major reno) | 2 | N/A |
| Building Additions/Alteratio | SFD - Detached | 9+ (reno-build pattern) | 1 | $1.5K |
| Small Residential Projects | SFD - Detached | 0-2 (typical reno) | 1877 | $20.0K |
| Small Residential Projects | SFD - Detached | 3-5 (medium reno) | 7151 | $15.0K |
| Small Residential Projects | SFD - Detached | 6-8 (major reno) | 11749 | $25.0K |
| Small Residential Projects | SFD - Detached | 9+ (reno-build pattern) | 12579 | $55.0K |
| Small Residential Projects | SFD - Semi-Detached | 0-2 (typical reno) | 531 | $15.0K |
| Small Residential Projects | SFD - Semi-Detached | 3-5 (medium reno) | 2247 | $15.0K |
| Small Residential Projects | SFD - Semi-Detached | 6-8 (major reno) | 3830 | $10.0K |
| Small Residential Projects | SFD - Semi-Detached | 9+ (reno-build pattern) | 2895 | $35.0K |

## Part 5 — Cost-model impact estimate of correcting reno-build allocation

IF reno-build permits should have allocation 1.0 instead of 0.25 (current matrix value for `Small Residential Projects × SFD - Detached`), how many permits are affected and what is the cost-estimate delta?

| permit_type | structure_type | n likely reno-build | median declared | current median modeled | total declared | total currently modeled | from permit / model |
|---|---|---|---|---|---|---|---|
| Small Residential Projects | SFD - Detached | 42 | $937.5K | $937.5K | $41.92M | $41.92M | 42 / 0 |
| Small Residential Projects | SFD - Semi-Detached | 3 | $600.0K | $600.0K | $1.87M | $1.87M | 3 / 0 |

## Part 2 — Sample of likely reno-build permits

SFD permits classified as Small Resid Proj / Building Add/Alt with declared cost > $1M (rare for a "small residential project"). Includes description excerpts to verify the pattern.

| permit | type / struct | declared $ | model $ | model GFA | description (first 240 chars) |
|---|---|---|---|---|---|
| 23 113407 BLD:00 | Small Re / SFD - Detach | $5.00M | $5.00M | 200 m² | Proposal for multiple projects to an existing 1 storey SFD-detached dwelling. Scope of work includes demolition of existing detached garage, rear/side addition, new 2nd floor addition, interior alterations, rear deck and alter the front por |
| 24 142286 BLD:00 | Small Re / SFD - Detach | $4.00M | $4.00M | 2084 m² | Proposed interior alterations to existing 2 1/2 storey single family dwelling, additional finished basement to existing un excavated area and a new north porch. |
| 24 122048 BLD:00 | Small Re / SFD - Detach | $4.00M | $4.00M | 298 m² | Proposed To alter the existing one-storey detached dwelling by constructing a partial rear one-storey addition with a rear deck and a complete second storey addition. |
| 23 144997 BLD:00 | Small Re / SFD - Detach | $4.00M | $4.00M | 712 m² | Proposed second storey addition and ground floor interior alteration |
| 21 156624 BLD:00 | Small Re / SFD - Detach | $3.60M | $3.60M | 542 m² | Proposal for multiple projects to a existing mixed use building to convert to an SFD-detached dwelling. Scope of work inlcudes a 2 storey rear addition, new 3rd and 4th floor additions, interior alterations and 3rd and 4th floor decks. See  |
| 15 206773 BLD:00 | Small Re / SFD - Detach | $3.50M | $3.50M | 1524 m² | Proposal for a rear 2 storey addition and interior alterations to existing detached single family dwelling. |
| 21 112799 BLD:00 | Small Re / SFD - Detach | $3.50M | $3.50M | 547 m² | Interior alterations to all floors, canopy, platform, bay window, second floor roof modification, and dormer at 3rd floor to existing single family dwelling. |
| 19 260539 BLD:00 | Small Re / SFD - Detach | $3.00M | $3.00M | 3831 m² | Alterations, additions to a three storey dwelling |
| 22 218716 BLD:00 | Small Re / SFD - Detach | $3.00M | $3.00M | 469 m² | Proposal for 3 storey rear and side addition, interior alterations |
| 19 175222 BLD:00 | Small Re / SFD - Townho | $3.00M | $3.00M | 1001 m² | Construct a new second floor rear addition and interior alterations to existing dwelling |
| 23 190222 BLD:00 | Small Re / SFD - Detach | $3.00M | $3.00M | 1476 m² | Construct two and a half storey addition  with attached garage to existing 3 storey Single Family Dwelling Detached House.  Work also includes interior alterations throughout, new basement walkout, underpinning and basement finishing, side  |
| 24 114425 BLD:00 | Small Re / SFD - Detach | $3.00M | $3.00M | 1398 m² | Proposal for a 2 storey rear addition, 3rd floor dormer addition, interior alterations and a new front porch to an existing SFD-detached dwelling. See also 23 202141 ZAP, 23 215515 MV and Final and Binding A0908/23TEY. |
| 24 115377 BLD:00 | Small Re / SFD - Detach | $3.00M | $3.00M | 1505 m² | Proposal for a 3 storey west side addition, reconstruct the existing 1 storey attached garage, interior alterations, second storey rear terrace, and a lower level rear patio to an existing 3 storey SFD-detached dwelling. See also 23 126546  |
| 12 269279 BLD:00 | Small Re / SFD - Semi-D | $2.50M | $2.50M | 262 m² | Proposal to underpin basement and finished basement.Existing single family dwelling.  |
| 24 128068 BLD:00 | Small Re / SFD - Detach | $2.50M | $2.50M | 516 m² | Proposed interior alterations to the existing dwelling, 1 storey addition, and 3 porches. |
| 03 190802 BLD:00 | Small Re / SFD - Semi-D | $2.50M | $2.50M | 388 m² |  Make interior alterations to existing semi-detached house. |
| 18 244201 BLD:00 | Small Re / SFD - Detach | $2.50M | $2.50M | 323 m² | CONSTRUCT 2ND FLOOR ADDITION, REAR ADDITION, INTERIOR ALTERATIONS TO ALL FLOORS, FRONT & REAR PORCH |
| 25 141394 BLD:00 | Small Re / SFD - Detach | $2.46M | $2.46M | 1978 m² | Proposal for addition to an existing SFD-Detached with attached garage. |
| 25 157135 BLD:00 | Small Re / SFD - Semi-D | $2.32M | $2.32M | 506 m² | Proposal to install solar panels a top roof. |
| 23 179947 BLD:00 | Small Re / SFD - Detach | $2.30M | $2.30M | 887 m² | Interior alterations to existing dwelling including basement underpinning |

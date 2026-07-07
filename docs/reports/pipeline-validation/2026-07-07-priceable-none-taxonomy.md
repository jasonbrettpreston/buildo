# WF2 P5 — Priceable-but-none rejection taxonomy (permits + CoA)

_Generated 2026-07-07T03:13:01.692Z by `scripts/analysis/wf2-priceable-none-taxonomy.js`. Read-only re-run of the live mapper + ladder._

> **PRE-P6.6 baseline.** These counts precede WF2 Phase 6.6 (the CoA fan-out fix that flips bundle-only lead_trades to `is_active=false`). Coverage impact of P6.6 on these numbers is expected ≈ 0 (archetype ladder runs before any trade path), but the figures are validated post-P6.6 in P7.

## Permits — residential-lowrise, project_type ∈ {addition,new_build,renovation}, cost_source=none

| bucket | count | pct |
|---|---:|---:|
| `mapped_no_scalar` | 4766 | 67.4% |
| `fit_blocked` | 2046 | 28.9% |
| `ladder_rejected:t2_bound` | 214 | 3.0% |
| `class_gate` | 33 | 0.5% |
| `now_priced:archetype_declared_area` | 9 | 0.1% |
| `now_priced:archetype_parcel` | 3 | 0.0% |
| `now_priced:archetype_rate` | 2 | 0.0% |
| **TOTAL** | **7073** | 100% |

### Top-bucket tag patterns + spot samples (permits)

**`mapped_no_scalar`** — top tag signatures:
  - 467× `new:build-sfd,residential`
  - 412× `new:townhouse,residential`
  - 340× `alter:interior-alterations,residential`
  - 241× `new:build-sfd,new:garage,residential`
  - 180× `new:stacked-townhouse,residential`
  - 156× `new:build-sfd,new:finished-basement,new:garage,residential`
  - 154× `alter:interior-alterations,new:addition,residential`
  - 145× `residential,townhouse`

Spot samples (≥10):
  - permit:02 152635 PLB:00 | pt=new_build st=SFD - Townhouse | lines=max_build (clean) | tags=[condo,residential,townhouse]
  - permit:21 230106 DRN:00 | pt=new_build st=SFD - Detached | lines=max_build (dominant) | tags=[new:build-sfd,new:deck,new:finished-basement,new:garage,new:porch,new:walkout]
  - permit:15 265713 PLB:00 | pt=renovation st=SFD - Townhouse | lines=gut (clean) | tags=[alter:interior-alterations,residential]
  - permit:15 265735 HVA:00 | pt=addition st=SFD - Semi-Detached | lines=gut+addition (additive) | tags=[new:addition,new:open-concept,residential]
  - permit:15 265735 PLB:00 | pt=addition st=SFD - Semi-Detached | lines=gut+addition (additive) | tags=[new:addition,new:open-concept,residential]
  - permit:15 269714 DRN:00 | pt=renovation st=SFD - Townhouse | lines=gut (dominant) | tags=[alter:interior-alterations,new:underpinning,residential]
  - permit:20 176156 PLB:00 | pt=new_build st=SFD - Detached | lines=max_build (dominant) | tags=[new:build-sfd,new:finished-basement,new:garage,residential]
  - permit:16 100252 HVA:00 | pt=renovation st=SFD - Semi-Detached | lines=gut (dominant) | tags=[new:canopy,new:deck,new:porch,new:second-suite,new:underpinning,residential]
  - permit:16 100732 HVA:00 | pt=renovation st=SFD - Townhouse | lines=gut (dominant) | tags=[alter:interior-alterations,new:bathroom,residential]
  - permit:16 102956 DRN:00 | pt=renovation st=SFD - Semi-Detached | lines=gut (dominant) | tags=[alter:interior-alterations,new:underpinning,residential]

**`fit_blocked`** — top tag signatures:
  - 1406× `new:garage,residential`
  - 184× `alter:garage,residential`
  - 60× `new:addition,new:garage,new:laneway-suite,residential`
  - 54× `new:garage,new:roofing,residential`
  - 48× `alter:unit-conversion,new:addition,new:garage,new:laneway-suite,residential`
  - 33× `new:laneway-suite,residential`
  - 21× `alter:interior-alterations,alter:unit-conversion,new:garage,new:laneway-suite,residential`
  - 19× `new:carport,new:garage,residential`

Spot samples (≥10):
  - permit:15 266464 BLD:00 | pt=addition st=SFD - Detached | lines=garage (clean) | tags=[new:garage,residential]
  - permit:15 270181 BLD:00 | pt=addition st=SFD - Detached | lines=garage (clean) | tags=[new:garage,residential]
  - permit:01 200238 BLD:00 | pt=addition st=SFD - Semi-Detached | lines=garage (clean) | tags=[new:garage,residential]
  - permit:16 110307 BLD:00 | pt=addition st=SFD - Semi-Detached | lines=garage (clean) | tags=[new:garage,residential]
  - permit:16 110583 BLD:00 | pt=addition st=SFD - Detached | lines=garage (clean) | tags=[new:garage,residential]
  - permit:16 117569 BLD:00 | pt=addition st=SFD - Detached | lines=garage (clean) | tags=[alter:garage,residential]
  - permit:16 117977 BLD:00 | pt=addition st=SFD - Detached | lines=garage (clean) | tags=[new:garage,residential]
  - permit:16 119078 BLD:00 | pt=addition st=SFD - Detached | lines=garage (clean) | tags=[new:garage,residential]
  - permit:06 140974 BLD:00 | pt=addition st=SFD - Semi-Detached | lines=garage (clean) | tags=[new:garage,residential]
  - permit:16 131790 BLD:00 | pt=addition st=SFD - Detached | lines=garage (clean) | tags=[new:garage,residential]

**`ladder_rejected:t2_bound`** — top tag signatures:
  - 79× `new:build-sfd,residential`
  - 24× `new:houseplex-3-unit,residential`
  - 22× `new:build-sfd,new:garage,residential`
  - 13× `new:build-sfd,new:finished-basement,new:garage,residential`
  - 11× `alter:interior-alterations,new:basement,residential`
  - 5× `new:deck,new:finished-basement,new:semi-detached,residential`
  - 4× `new:build-sfd,new:garage,new:walkout,residential`
  - 4× `new:garage,new:semi-detached,residential`

Spot samples (≥10):
  - permit:16 112186 HVA:00 | pt=new_build st=SFD - Detached | lines=max_build (dominant) | tags=[new:build-sfd,new:finished-basement,new:garage,residential]
  - permit:16 112186 HVA:02 | pt=new_build st=SFD - Detached | lines=max_build (dominant) | tags=[new:build-sfd,new:finished-basement,new:garage,residential]
  - permit:16 112186 PLB:00 | pt=new_build st=SFD - Detached | lines=max_build (dominant) | tags=[new:build-sfd,new:finished-basement,new:garage,residential]
  - permit:16 143433 PLB:00 | pt=new_build st=SFD - Detached | lines=max_build (clean) | tags=[new:build-sfd,residential]
  - permit:16 249045 HVA:00 | pt=new_build st=SFD - Detached | lines=max_build (dominant) | tags=[new:build-sfd,new:finished-basement,new:garage,new:walkout,residential]
  - permit:17 232997 DRN:00 | pt=new_build st=SFD - Detached | lines=max_build (dominant) | tags=[new:build-sfd,new:deck,new:walkout,residential]
  - permit:17 232997 HVA:00 | pt=new_build st=SFD - Detached | lines=max_build (dominant) | tags=[new:build-sfd,new:deck,new:walkout,residential]
  - permit:17 232997 PLB:00 | pt=new_build st=SFD - Detached | lines=max_build (dominant) | tags=[new:build-sfd,new:deck,new:walkout,residential]
  - permit:17 274523 PLB:00 | pt=renovation st=SFD - Townhouse | lines=gut (dominant) | tags=[alter:interior-alterations,new:basement,residential]
  - permit:18 188163 DRN:00 | pt=new_build st=SFD - Detached | lines=max_build (clean) | tags=[new:build-sfd,residential]

**`class_gate`** — top tag signatures:
  - 8× `residential,townhouse`
  - 2× `commercial,plumbing`
  - 2× `2nd-floor,3rd-floor,commercial,rear-addition,retail`
  - 2× `commercial`
  - 2× `new:build-sfd,residential`
  - 2× `residential,roofing,townhouse`
  - 2× `new:finished-basement,new:semi-detached,residential`
  - 1× `commercial,sprinkler,storage`

Spot samples (≥10):
  - permit:25 184325 ALT:00 | pt=addition st=∅ | lines=∅  | tags=[commercial,sprinkler,storage]
  - permit:20 133290 ALT:00 | pt=addition st=∅ | lines=∅  | tags=[commercial,plumbing]
  - permit:10 297154 B03:00 | pt=new_build st=SFD - Townhouse | lines=∅  | tags=[residential,townhouse]
  - permit:25 152137 FSU:00 | pt=new_build st=3+ Unit - Detached | lines=∅  | tags=[new:balcony,new:deck,new:houseplex-3-unit,new:porch,new:walkout,residential]
  - permit:25 153177 FSU:00 | pt=addition st=3+ Unit - Townhouse | lines=∅  | tags=[new:addition,new:garage,new:roofing,residential]
  - permit:25 239977 ALT:00 | pt=addition st=∅ | lines=∅  | tags=[2nd-floor,commercial,fire-alarm,garage,roofing,sprinkler]
  - permit:25 243898 000:00 | pt=addition st=∅ | lines=∅  | tags=[2nd-floor,3rd-floor,commercial,rear-addition,retail]
  - permit:26 130051 ALT:00 | pt=addition st=∅ | lines=∅  | tags=[commercial]
  - permit:10 297154 B05:00 | pt=new_build st=SFD - Townhouse | lines=∅  | tags=[residential,townhouse]
  - permit:22 161024 ALT:00 | pt=new_build st=∅ | lines=∅  | tags=[commercial]

**`now_priced:archetype_declared_area`** — top tag signatures:
  - 2× `new:houseplex-3-unit,residential`
  - 2× `new:build-sfd,residential`
  - 1× `new:garage,new:houseplex-3-unit,residential`
  - 1× `new:semi-detached,residential`
  - 1× `new:balcony,new:houseplex-3-unit,new:porch,new:walkout,residential`
  - 1× `new:houseplex-3-unit,new:laneway-suite,new:porch,new:walkout,residential`
  - 1× `new:build-sfd,new:garage,residential`

Spot samples (≥10):
  - permit:20 202524 BLD:00 | pt=new_build st=3+ Unit - Detached | lines=∅  | tags=[new:garage,new:houseplex-3-unit,residential]
  - permit:25 102989 BLD:00 | pt=new_build st=SFD - Semi-Detached | lines=∅  | tags=[new:semi-detached,residential]
  - permit:25 107987 BLD:00 | pt=new_build st=3+ Unit - Detached | lines=∅  | tags=[new:balcony,new:houseplex-3-unit,new:porch,new:walkout,residential]
  - permit:26 113752 BLD:00 | pt=new_build st=3+ Unit - Detached | lines=∅  | tags=[new:houseplex-3-unit,new:laneway-suite,new:porch,new:walkout,residential]
  - permit:26 130609 BLD:00 | pt=new_build st=3+ Unit - Detached | lines=∅  | tags=[new:houseplex-3-unit,residential]
  - permit:26 138075 BLD:00 | pt=new_build st=2 Unit - Detached | lines=∅  | tags=[new:build-sfd,residential]
  - permit:25 144104 BLD:00 | pt=new_build st=SFD - Detached | lines=∅  | tags=[new:build-sfd,new:garage,residential]
  - permit:25 111914 BLD:00 | pt=new_build st=3+ Unit - Detached | lines=∅  | tags=[new:houseplex-3-unit,residential]
  - permit:26 106559 BLD:00 | pt=new_build st=2 Unit - Detached | lines=∅  | tags=[new:build-sfd,residential]

**`now_priced:archetype_parcel`** — top tag signatures:
  - 1× `new:build-sfd,residential`
  - 1× `new:build-sfd,new:deck,new:garage,new:porch,residential`
  - 1× `new:deck,new:second-suite,residential`

Spot samples (≥10):
  - permit:26 135392 BLD:00 | pt=new_build st=SFD - Detached | lines=∅  | tags=[new:build-sfd,residential]
  - permit:26 150338 BLD:00 | pt=new_build st=SFD - Detached | lines=∅  | tags=[new:build-sfd,new:deck,new:garage,new:porch,residential]
  - permit:26 181999 BLD:00 | pt=renovation st=2 Unit - Semi-detached | lines=∅  | tags=[new:deck,new:second-suite,residential]

## CoA — cost_source=none (corpus)

| bucket | count | pct |
|---|---:|---:|
| `mapper_null:t4` | 5670 | 41.0% |
| `mapped_no_scalar` | 4665 | 33.7% |
| `not_lowrise` | 2628 | 19.0% |
| `fit_blocked` | 690 | 5.0% |
| `ladder_rejected:t2_bound` | 178 | 1.3% |
| **TOTAL** | **13831** | 100% |

## CoA — cost_source=none (OPEN subset: geocoded + non-terminal)

| bucket | count | pct |
|---|---:|---:|
| `mapper_null:t4` | 988 | 61.2% |
| `not_lowrise` | 301 | 18.6% |
| `mapped_no_scalar` | 228 | 14.1% |
| `fit_blocked` | 87 | 5.4% |
| `ladder_rejected:t2_bound` | 11 | 0.7% |
| **TOTAL** | **1615** | 100% |

### Top-bucket tag patterns + spot samples (CoA corpus)

**`mapper_null:t4`** — top tag signatures:
  - 1868× `(none)`
  - 1120× `residential,severance`
  - 735× `severance`
  - 433× `dwelling,residential`
  - 358× `dwelling,residential,two-storey`
  - 184× `dwelling,residential,third-storey`
  - 85× `parking`
  - 82× `residential`

Spot samples (≥10):
  - coa:A0168/23EYK | pt=null st=∅ | lines=∅  | tags=[dwelling,residential]
  - coa:A1284/22TEY | pt=Alteration st=SFD - Detached | lines=∅  | tags=[dwelling,parking,residential]
  - coa:B0031/22SC | pt=Severance st=∅ | lines=∅  | tags=[minor-variance,residential,severance]
  - coa:B0086/22TEY | pt=Severance st=∅ | lines=∅  | tags=[residential,severance]
  - coa:A0031/23SC | pt=null st=SFD - Detached | lines=∅  | tags=[dwelling,residential,two-storey]
  - coa:B0046/22EYK | pt=Severance st=∅ | lines=∅  | tags=[residential,severance]
  - coa:B0046/21EYK | pt=Severance st=∅ | lines=∅  | tags=[residential,severance]
  - coa:B0015/23SC | pt=Severance st=SFD - Detached | lines=∅  | tags=[dwelling,minor-variance,residential,severance,two-storey]
  - coa:B0084/22TEY | pt=Severance st=∅ | lines=∅  | tags=[residential,severance]
  - coa:A0002/23TEY | pt=Alteration st=SFD - Detached | lines=∅  | tags=[dwelling,residential,third-storey]

**`mapped_no_scalar`** — top tag signatures:
  - 610× `dwelling,garage,new-construction,residential`
  - 431× `dwelling,new-construction,residential`
  - 216× `dwelling,new-construction,residential,two-storey`
  - 199× `new-construction`
  - 128× `dwelling,garage,new-construction,residential,two-storey`
  - 123× `dwelling,garage,new-construction,residential,third-storey`
  - 123× `dwelling,minor-variance,new-construction,residential,two-storey`
  - 102× `addition,dwelling,rear-addition,residential,two-storey`

Spot samples (≥10):
  - coa:A0521/22EYK | pt=NewConstruction st=SFD - Detached | lines=coa_build (clean) | tags=[dwelling,garage,new-construction,residential]
  - coa:A0863/22TEY | pt=Addition st=∅ | lines=coa_build (dominant) | tags=[addition,basement,new-construction,rear-addition,two-storey,walkout]
  - coa:A0744/22TEY | pt=Mixed st=SFD - Detached | lines=addition (dominant) | tags=[addition,basement,dwelling,parking,residential,walkout]
  - coa:A0164/23TEY | pt=Mixed st=SFD - Semi-Detached | lines=addition (clean) | tags=[addition,dwelling,rear-addition,residential,third-storey]
  - coa:A0878/22TEY | pt=Mixed st=SFD - Townhouse | lines=addition (clean) | tags=[addition,dwelling,rear-addition,residential,third-storey,townhouse]
  - coa:A0593/22EYK | pt=NewConstruction st=SFD - Semi-Detached | lines=coa_build (clean) | tags=[dwelling,garage,new-construction,residential]
  - coa:A0466/22EYK | pt=NewConstruction st=SFD - Detached | lines=coa_build (clean) | tags=[dwelling,garage,new-construction,residential,setback]
  - coa:A0941/22TEY | pt=Mixed st=SFD - Semi-Detached | lines=addition (clean) | tags=[addition,dwelling,rear-addition,residential,two-storey]
  - coa:A0695/22TEY | pt=Addition st=Converted House | lines=addition (dominant) | tags=[addition,dwelling,rear-addition,residential,third-storey,walkout]
  - coa:A0372/22TEY | pt=Mixed st=SFD - Townhouse | lines=addition (clean) | tags=[addition,dwelling,rear-addition,residential,third-storey,townhouse]

**`not_lowrise`** — top tag signatures:
  - 86× `commercial`
  - 83× `commercial,office`
  - 65× `commercial,retail`
  - 57× `mixed-use`
  - 52× `(none)`
  - 45× `mixed-use,new-construction`
  - 36× `apartment,new-construction,residential`
  - 35× `apartment,residential`

Spot samples (≥10):
  - coa:A0439/21TEY | pt=Mixed st=Apartment Building | lines=∅  | tags=[addition,apartment,dwelling,residential,third-storey]
  - coa:A0264/23TEY | pt=null st=Mixed Use/Res w Non Res | lines=∅  | tags=[commercial,office,residential]
  - coa:A0255/23NY | pt=null st=Office | lines=∅  | tags=[commercial,office]
  - coa:A1054/22TEY | pt=Mixed st=Mixed Use/Res w Non Res | lines=∅  | tags=[addition,basement,dwelling,mixed-use,rear-addition,residential]
  - coa:A1087/22TEY | pt=Mixed st=Mixed Use/Res w Non Res | lines=∅  | tags=[addition,minor-variance,mixed-use]
  - coa:A0492/22TEY | pt=Mixed st=Place of Worship | lines=∅  | tags=[addition,institutional,residential]
  - coa:A0383/22EYK | pt=Addition st=Retail Store | lines=∅  | tags=[addition,commercial,new-construction,retail]
  - coa:A0186/22SC | pt=null st=Retail Store | lines=∅  | tags=[commercial,service-shop]
  - coa:A0018/23TEY | pt=Mixed st=Mixed Use/Res w Non Res | lines=∅  | tags=[addition,basement,commercial,dwelling,mixed-use,residential]
  - coa:A0698/22TEY | pt=null st=Office | lines=∅  | tags=[basement,commercial,office,residential]

**`fit_blocked`** — top tag signatures:
  - 129× `garage`
  - 56× `dwelling,garage,residential,two-storey`
  - 53× `dwelling,garage,residential`
  - 23× `accessory-structure`
  - 18× `demolition,dwelling,garage,new-construction,residential,two-storey`
  - 16× `addition,dwelling,garage,residential`
  - 13× `dwelling,garage,residential,third-storey`
  - 13× `(none)`

Spot samples (≥10):
  - coa:A0157/23TEY | pt=null st=Laneway / Rear Yard Suite | lines=laneway_suite (clean) | tags=[basement,dwelling,residential,third-storey,two-storey]
  - coa:A1272/22TEY | pt=Mixed st=Laneway / Rear Yard Suite | lines=laneway_suite (clean) | tags=[addition]
  - coa:A0027/23TEY | pt=null st=SFD - Detached | lines=garage (clean) | tags=[dwelling,garage,residential,third-storey]
  - coa:A1032/22TEY | pt=Addition st=Laneway / Rear Yard Suite | lines=laneway_suite (clean) | tags=[accessory-structure,addition,new-construction,parking,two-storey]
  - coa:A0101/23EYK | pt=null st=∅ | lines=garage (clean) | tags=[garage]
  - coa:A0010/23SC | pt=Addition st=Laneway / Rear Yard Suite | lines=laneway_suite (clean) | tags=[addition,change-of-use,garage,new-construction]
  - coa:A0043/23EYK | pt=null st=Laneway / Rear Yard Suite | lines=laneway_suite (clean) | tags=[garage]
  - coa:A0009/23TEY | pt=Mixed st=Laneway / Rear Yard Suite | lines=laneway_suite (clean) | tags=[addition,change-of-use,garage]
  - coa:A1176/22TEY | pt=null st=Laneway / Rear Yard Suite | lines=laneway_suite (clean) | tags=[garage,residential,two-storey]
  - coa:A0055/23TEY | pt=Alteration st=SFD - Detached | lines=garage (clean) | tags=[accessory-structure,change-of-use,dwelling,garage,residential,two-storey]

**`ladder_rejected:t2_bound`** — top tag signatures:
  - 22× `dwelling,garage,new-construction,residential`
  - 18× `dwelling,new-construction,residential`
  - 12× `addition,dwelling,new-construction,residential`
  - 11× `dwelling,new-construction,residential,two-storey`
  - 6× `addition,new-construction,rear-addition,two-storey`
  - 6× `new-construction`
  - 6× `dwelling,new-construction,residential,third-storey`
  - 6× `dwelling,garage,new-construction,residential,two-storey`

Spot samples (≥10):
  - coa:A0901/22TEY | pt=NewConstruction st=∅ | lines=coa_build (clean) | tags=[garage,new-construction]
  - coa:A0150/23NY | pt=NewConstruction st=∅ | lines=coa_build (clean) | tags=[dwelling,new-construction,residential]
  - coa:A0082/23EYK | pt=NewConstruction st=SFD - Detached | lines=coa_build (clean) | tags=[dwelling,garage,new-construction,residential]
  - coa:A0514/22EYK | pt=Addition st=∅ | lines=coa_build (dominant) | tags=[addition,dwelling,new-construction,residential]
  - coa:A0552/22EYK | pt=NewConstruction st=SFD - Detached | lines=coa_build (clean) | tags=[dwelling,garage,new-construction,residential]
  - coa:A0140/23EYK | pt=Addition st=∅ | lines=coa_build (dominant) | tags=[addition,new-construction,rear-addition,two-storey]
  - coa:A0252/26TEY | pt=NewConstruction st=SFD - Detached | lines=coa_build (clean) | tags=[dwelling,new-construction,parking,residential,third-storey]
  - coa:A0122/26EYK | pt=NewConstruction st=SFD - Detached | lines=coa_build (clean) | tags=[dwelling,garage,lot-coverage,new-construction,residential]
  - coa:A1127/15NY | pt=Addition st=∅ | lines=coa_build (dominant) | tags=[addition,dwelling,new-construction,residential,third-storey,two-storey]
  - coa:A0513/15NY | pt=NewConstruction st=SFD - Detached | lines=coa_build (clean) | tags=[dwelling,garage,new-construction,residential,third-storey]

## Findings & verdicts (WF2 P5)

**No cost-model code bug found.** Every bucket is a CORRECT `'none'` for a documented reason (spot-verified ≥10/bucket against the live DB):

- `mapped_no_scalar` (largest) — scope maps to a line but the parcel carries NO propagated §4D cost scalar (≈50% have no `permit_parcels` link; the rest link a parcel whose cost-menu was never computed). **A propagation-COVERAGE gap, not a mapper/ladder defect.** Highest-leverage follow-up.
- `fit_blocked` — fit-gated accessory line (garage/laneway/garden) with `NULL` scalar = `fits:false` (Spec 88 §2.4). Verified genuine: 99.6% link a parcel + 99.3% carry `NULL max_*_gfa_sqm` (the accessory-fit model returned no envelope). Correct by design; the fit-model conservatism (declining garages on permits that ARE for garages) is a Spec 65 follow-up.
- `ladder_rejected:t2_bound` — propagated total outside the T2 plausibility bounds; the data-poison guard firing as designed.
- `class_gate` — verified administrative/safety/modifier permit_types (Spec 80 §5). Correct.
- `not_lowrise` / `mapper_null:t4` (CoA) — commercial/apartment or severance/tagless/descriptor-only; out of low-rise archetype scope / no scope to price. Correct.
- `now_priced:*` — the current code WOULD price these (stale rows not re-processed since the ladder shipped). Not a bug; resolves on the P7 in-chain re-run.

**CoA acceptance re-derivation:** corpus 19,449/33,280 = **58.4%** priced (inflated by closed C4 CoAs); feed-relevant OPEN subset (geo + non-terminal C1–C3) 1,585/3,200 = **49.5%** priced. Replaces the stale "≥80%" (which assumed a geometric path that priced 0.0%). See Spec 83 §Geometric-Only Path (SUPERSEDED) + §3-ARCHETYPE acceptance.

**Follow-ups (not this WF's code):** (1) expand §4D parcel cost-menu propagation coverage — the `mapped_no_scalar` lever; (2) revisit accessory-fit-model conservatism (Spec 65 §7) — the `fit_blocked` lever.


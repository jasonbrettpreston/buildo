# 08c - Description Keyword to Trade & Product Mapping

**Status:** Active
**Last Updated:** 2026-02-14
**Depends On:** `08_trade_classification.md`, `08b_classification_assumptions.md`

> This document defines the exact keywords scanned in permit descriptions and the trades and products they imply. Used by the Tier 3 classification engine. Keywords are matched case-insensitively using regex patterns.

---

## 1. Plumbing

**Trade slug:** `plumbing` | **Confidence:** 0.55-0.65

| Keyword/Pattern | Products/Services Implied | Frequency |
|----------------|--------------------------|-----------|
| `plumbing`, `plumber` | General plumbing work | 46,682 |
| `drain`, `drainage` | Drain installation/repair | 14,127 |
| `sewer` | Sewer line work | 222 |
| `bathroom`, `washroom`, `lavatory` | Bathroom plumbing fixtures (toilet, sink, shower) | 4,964 |
| `water heater`, `water tank`, `water line` | Hot water system, water supply lines | ~600 |
| `sink`, `toilet`, `shower`, `tub`, `faucet` | Individual fixture installation | ~1,000 |
| `backflow` | Backflow prevention device | ~3,200 |
| `grease trap` | Commercial kitchen grease interceptor | ~100 |
| `septic` | Septic system (rare in Toronto) | ~8 |

**Scope note:** When found in narrow-scope permits (PLB/DRN), confirms the primary trade. When found in broad-scope permits (BLD), adds plumbing as a secondary trade.

---

## 2. HVAC / Mechanical

**Trade slug:** `hvac` | **Confidence:** 0.55-0.65

| Keyword/Pattern | Products/Services Implied | Frequency |
|----------------|--------------------------|-----------|
| `hvac` | General HVAC work | 41,990 |
| `furnace` | Furnace installation/replacement | 496 |
| `air condition`, `a/c`, `ac unit` | Air conditioning system | ~500 |
| `duct`, `ductwork` | Duct installation/modification | 1,193 |
| `ventilation`, `ventilat` | Ventilation system | 354 |
| `exhaust`, `exhaust fan` | Exhaust ventilation (kitchen/bathroom) | 1,624 |
| `heating`, `heat pump` | Heating system | ~800 |
| `boiler` | Boiler system (commercial/multi-res) | 433 |
| `makeup air` | Makeup air unit | ~50 |
| `hrv`, `erv` | Heat/energy recovery ventilator | ~30 |
| `rooftop unit`, `rtu` | Commercial rooftop HVAC | ~100 |

---

## 3. Electrical

**Trade slug:** `electrical` | **Confidence:** 0.55-0.65

| Keyword/Pattern | Products/Services Implied | Frequency |
|----------------|--------------------------|-----------|
| `electrical`, `electric` | General electrical work | 2,159 |
| `wiring`, `rewir` | Electrical wiring/rewiring | 43 |
| `panel upgrade` | Electrical panel upgrade | ~100 |
| `transformer` | Transformer installation | ~50 |
| `lighting` | Lighting installation | ~300 |
| `generator` | Backup generator | ~80 |
| `solar`, `photovoltaic` | Solar panel installation | ~50 |
| `ev charger`, `charging station` | EV charging infrastructure | ~20 |

---

## 4. Fire Protection

**Trade slug:** `fire-protection` | **Confidence:** 0.55-0.65

| Keyword/Pattern | Products/Services Implied | Frequency |
|----------------|--------------------------|-----------|
| `fire alarm` | Fire alarm system | 2,568 |
| `sprinkler` | Fire sprinkler system | 3,485 |
| `fire protect`, `fire suppress` | Fire suppression systems | ~200 |
| `standpipe` | Standpipe system | ~52 |
| `fire door` | Fire-rated door installation | ~10 |
| `emergency lighting` | Emergency/exit lighting | ~34 |
| `electromagnetic lock` | EM lock for fire safety | ~1,500 |

---

## 5. Roofing

**Trade slug:** `roofing` | **Confidence:** 0.55-0.65

| Keyword/Pattern | Products/Services Implied | Frequency |
|----------------|--------------------------|-----------|
| `roof`, `roofing` | Roof installation/repair | 8,518 |
| `shingle` | Shingle roofing (residential) | 4 |
| `eaves`, `eavestrough`, `gutter` | Eaves/gutter system | ~100 |
| `flashing` | Roof flashing | ~50 |
| `membrane` (roof context) | Flat roof membrane | 105 |
| `cladding`, `re-cladding` | Exterior cladding (often paired with roofing) | ~300 |

**Scope note:** `roof` in "roof drain" (plumbing context) should NOT trigger roofing trade. The keyword is only valid when NOT preceded by drain-related words.

---

## 6. Concrete / Foundation

**Trade slug:** `concrete` | **Confidence:** 0.55-0.60

| Keyword/Pattern | Products/Services Implied | Frequency |
|----------------|--------------------------|-----------|
| `concrete` | Concrete work | 3,427 |
| `foundation` | Foundation construction/repair | 2,726 |
| `footing` | Footing construction | 470 |
| `slab` | Concrete slab | 1,670 |
| `formwork` | Concrete formwork | ~50 |
| `icf` | Insulated concrete forms | ~30 |
| `pour` (concrete context) | Concrete pouring | ~100 |

---

## 7. Framing / Carpentry

**Trade slug:** `framing` | **Confidence:** 0.50-0.55

| Keyword/Pattern | Products/Services Implied | Frequency |
|----------------|--------------------------|-----------|
| `framing`, `frame` | Wood/steel framing | ~800 |
| `storey`, `story` | Multi-storey construction implies framing | 23,000+ |
| `stair`, `staircase` | Stair construction (carpentry) | ~1,000 |
| `cabinet`, `millwork` | Kitchen/custom cabinetry | ~500 |
| `carpentry` | General carpentry | ~30 |
| `joist`, `rafter`, `lintel` | Structural wood members | ~50 |
| `deck` | Deck construction (wood framing) | 13,113 |
| `porch` | Porch construction | 7,963 |
| `garage` | Garage framing | 21,387 |

---

## 8. Shoring / Underpinning

**Trade slug:** `shoring` | **Confidence:** 0.60-0.85

| Keyword/Pattern | Products/Services Implied | Frequency |
|----------------|--------------------------|-----------|
| `shoring` | Shoring system | ~200 |
| `underpinning`, `underpin` | Basement underpinning | 7,290 |
| `retaining wall` | Retaining wall construction | ~100 |

**Scope note:** Underpinning implies shoring + concrete + excavation + waterproofing. It does NOT imply roofing, glazing, or landscaping. The description scope should be limited to below-grade trades.

---

## 9. Excavation

**Trade slug:** `excavation` | **Confidence:** 0.50-0.60

| Keyword/Pattern | Products/Services Implied | Frequency |
|----------------|--------------------------|-----------|
| `excavation`, `excavat` | Site excavation | 357 |
| `dig`, `digging`, `trench` | Trenching work | ~50 |
| `grading` | Site grading | 91 |
| `site prep` | Site preparation | ~30 |
| `backfill` | Backfilling | ~20 |
| `walk-out` (basement context) | Walk-out basement excavation | ~500 |

---

## 10. Masonry

**Trade slug:** `masonry` | **Confidence:** 0.55-0.60

| Keyword/Pattern | Products/Services Implied | Frequency |
|----------------|--------------------------|-----------|
| `masonry`, `mason` | General masonry | 461 |
| `brick`, `brickwork` | Brick installation/repair | 941 |
| `stone veneer` | Stone veneer cladding | ~50 |
| `stucco` | Stucco application | 167 |
| `parging` | Parging (foundation coating) | ~30 |
| `block wall`, `cmu` | Concrete block construction | ~100 |

---

## 11. Insulation

**Trade slug:** `insulation` | **Confidence:** 0.55-0.60

| Keyword/Pattern | Products/Services Implied | Frequency |
|----------------|--------------------------|-----------|
| `insulation`, `insulat` | General insulation | 395 |
| `vapour barrier`, `vapor barrier` | Vapour barrier installation | ~30 |
| `spray foam` | Spray foam insulation | ~20 |
| `batt` (insulation context) | Batt insulation | ~10 |
| `thermal` | Thermal insulation/upgrade | ~50 |

---

## 12. Drywall

**Trade slug:** `drywall` | **Confidence:** 0.55-0.60

| Keyword/Pattern | Products/Services Implied | Frequency |
|----------------|--------------------------|-----------|
| `drywall` | Drywall installation | 225 |
| `gypsum` | Gypsum board | 74 |
| `partition wall` | Interior partition construction | ~100 |
| `taping` | Drywall taping/finishing | ~20 |

---

## 13. Painting

**Trade slug:** `painting` | **Confidence:** 0.50-0.55

| Keyword/Pattern | Products/Services Implied | Frequency |
|----------------|--------------------------|-----------|
| `paint`, `painting` | Interior/exterior painting | 268 |
| `finishing` (interior context) | Interior finishing (painting implied) | ~500 |
| `coating` | Protective/decorative coating | ~30 |

**Scope note:** Painting is implied in almost all interior renovation work. When `Interior Alterations` is the work type, painting is included at low confidence (0.40).

---

## 14. Flooring

**Trade slug:** `flooring` | **Confidence:** 0.55-0.60

| Keyword/Pattern | Products/Services Implied | Frequency |
|----------------|--------------------------|-----------|
| `flooring`, `floor` (installation context) | General flooring | 108 |
| `tile`, `tiling`, `ceramic` | Tile flooring/walls | 147 |
| `hardwood` | Hardwood flooring | 14 |
| `laminate` | Laminate flooring | ~5 |
| `carpet` | Carpet installation | 23 |
| `vinyl` | Vinyl flooring | ~10 |

---

## 15. Glazing

**Trade slug:** `glazing` | **Confidence:** 0.55-0.60

| Keyword/Pattern | Products/Services Implied | Frequency |
|----------------|--------------------------|-----------|
| `glazing`, `glaze` | General glazing work | ~100 |
| `window`, `windows` | Window installation/replacement | 5,081 |
| `curtain wall` | Curtain wall system (commercial) | ~100 |
| `storefront` | Storefront glass system | ~50 |
| `door`, `doors` (glass context) | Glass door installation | 4,131 |
| `skylight` | Skylight installation | ~30 |

---

## 16. Elevator

**Trade slug:** `elevator` | **Confidence:** 0.60-0.65

| Keyword/Pattern | Products/Services Implied | Frequency |
|----------------|--------------------------|-----------|
| `elevator` | Elevator installation/modification | 1,438 |
| `escalator` | Escalator (rare) | ~5 |
| `lift` (building context) | Platform lift/accessibility | ~50 |
| `dumbwaiter` | Dumbwaiter installation | ~10 |

---

## 17. Demolition

**Trade slug:** `demolition` | **Confidence:** 0.60-0.65

| Keyword/Pattern | Products/Services Implied | Frequency |
|----------------|--------------------------|-----------|
| `demolition`, `demolish` | Building demolition | 9,242 |
| `tear down` | Structure removal | ~20 |
| `strip out` | Interior strip-out | ~10 |

---

## 18. Structural Steel

**Trade slug:** `structural-steel` | **Confidence:** 0.55-0.65

| Keyword/Pattern | Products/Services Implied | Frequency |
|----------------|--------------------------|-----------|
| `structural steel` | Structural steel erection | ~200 |
| `steel beam`, `steel column` | Steel beam/column installation | ~100 |
| `steel frame` | Steel framing | ~50 |
| `steel joist` | Open web steel joists | ~20 |

---

## 19. Landscaping

**Trade slug:** `landscaping` | **Confidence:** 0.50-0.60

| Keyword/Pattern | Products/Services Implied | Frequency |
|----------------|--------------------------|-----------|
| `landscaping`, `landscape` | General landscaping | 333 |
| `garden` | Garden installation | ~100 |
| `patio` | Patio construction | ~200 |
| `deck` (also framing) | Deck construction | 13,113 |
| `fence`, `fencing` | Fence installation | 198 |
| `interlock`, `interlocking` | Interlocking pavement | 15 |
| `paving` | Paving work | 27 |
| `sod` | Sod installation | 7 |
| `retaining wall` (also shoring) | Landscape retaining wall | ~100 |
| `pool`, `swimming` | Pool installation/modification | 1,397 |

---

## 20. Waterproofing

**Trade slug:** `waterproofing` | **Confidence:** 0.55-0.65

| Keyword/Pattern | Products/Services Implied | Frequency |
|----------------|--------------------------|-----------|
| `waterproof`, `waterproofing` | Waterproofing membrane/system | 40 |
| `damp proof`, `dampproof` | Dampproofing | ~5 |
| `membrane` (foundation context) | Foundation waterproofing membrane | 105 |
| `weeping tile` | Weeping tile system | ~20 |

---

## 21. Context-Dependent Keywords

These keywords change meaning based on surrounding context:

| Keyword | Context A | Trade A | Context B | Trade B |
|---------|----------|---------|----------|---------|
| `roof drain` | Plumbing | plumbing | - | NOT roofing |
| `membrane` | Foundation | waterproofing | Roof | roofing |
| `deck` | Exterior | framing + landscaping | Interior floor | flooring |
| `door` | Glass/entrance | glazing | Fire-rated | fire-protection |
| `wall` | Partition | drywall | Retaining | shoring |
| `pool` | Swimming | landscaping | - | plumbing (secondary) |
| `basement` | Renovation | drywall, painting, flooring, plumbing | Underpinning | shoring, concrete, excavation |

---

## 22. Description-Based Scope Limiting

When specific description keywords are present, they limit the scope of inferred trades:

| Description Context | Allowed Trades | Blocked Trades |
|--------------------|---------------|----------------|
| "basement renovation" (no underpinning) | drywall, painting, flooring, plumbing, hvac, electrical, framing | roofing, cladding, landscaping, excavation |
| "underpinning" | shoring, concrete, excavation, waterproofing, plumbing (drain) | roofing, glazing, landscaping, elevator, painting |
| "kitchen renovation" | plumbing, electrical, framing (cabinets), flooring, painting, drywall, hvac (exhaust) | roofing, excavation, shoring, landscaping |
| "bathroom renovation" | plumbing, electrical, flooring (tile), drywall, painting | roofing, excavation, shoring, landscaping |
| "roof replacement" | roofing | excavation, shoring, elevator, landscaping |
| "window replacement" | glazing | excavation, shoring, concrete, elevator |
| "new swimming pool" | landscaping, plumbing, concrete, excavation, electrical, fencing | roofing, elevator, drywall |

---

## 23. Revision History

| Date | Change | Reason |
|------|--------|--------|
| 2026-02-14 | Initial version | Document all classification assumptions for transparency and future refinement |

# 08b - Trade Classification Assumptions

**Status:** Active
**Last Updated:** 2026-02-14
**Depends On:** `08_trade_classification.md`

> Trade classifications are **inferred** from permit metadata in the absence of actual building plans. These are estimates. This document defines all assumptions and can be updated as classification rules are refined.

---

## 1. Permit Code Scope Limiting (Primary Gate)

The permit number suffix (e.g., `XX XXXXXX **PLB** 00`) is the **definitive** indicator of what trades are in scope. This overrides all other classification tiers.

### Narrow-Scope Codes (Single Trade)

These permit codes restrict classification to specific trades only. No structure_type or description-based broadening is applied.

| Code(s) | Permit Type | Allowed Trades | Rationale |
|---------|-------------|---------------|-----------|
| `PLB`, `PSA` | Plumbing(PS) | plumbing | Standalone plumbing permit. PSA = plumbing standalone amendment. |
| `HVA`, `MSA` | Mechanical(MS) | hvac | Standalone HVAC/mechanical permit. MSA = mechanical standalone amendment. |
| `DRN`, `STS` | Drain and Site Service | plumbing | Drain work is plumbing-scope. STS = site service drains. |
| `FSU` | Fire/Security Upgrade | fire-protection | Fire alarm, sprinklers, electromagnetic locks. |
| `DEM` | Demolition Folder (DM) | demolition | Demolition-only permit. |

### Broad-Scope Codes (Multiple Trades)

These permit codes allow full 3-tier classification with structure_type and description inference.

| Code(s) | Permit Type | Scope | Notes |
|---------|-------------|-------|-------|
| `BLD` | Small Residential, Additions/Alterations, New Houses, New Building | All 20 trades | The primary building permit. Work, description, and structure_type all apply. |
| `CMB` | Residential/Non-Residential Building Permit | All 20 trades | Combined permit covering multiple scopes. |
| `COM` | Residential Building Permit | All 20 trades | Commercial combination permit. |
| `ALT` | AS Alternative Solution | All 20 trades | Alternative code compliance. |
| `SHO` | Partial Permit (Shoring) | excavation, shoring, concrete, waterproofing | Shoring partial permits are early-phase only. |
| `FND` | Partial Permit (Foundation) | excavation, concrete, waterproofing, shoring | Foundation partial permits are early-phase only. |
| `DST` | Designated Structures | All 20 trades | Large/complex designated structures. |
| `TPS` | Temporary Structures | framing, electrical | Temporary structures have limited trade scope. |
| `PCL` | Portable Classrooms | electrical, plumbing, hvac | Prefab units with limited site trades. |

### Unknown/Missing Codes

If the permit number has no recognizable suffix code, classification falls back to permit_type-based scope determination.

---

## 2. Work Field Assumptions

The `work` field provides secondary scope information within broad-scope permits.

### Scope-Narrowing Work Types

When a broad-scope permit (BLD) has one of these work types, the trade scope is narrowed:

| Work Value | Implied Trades | Excluded Trades |
|-----------|---------------|-----------------|
| `Interior Alterations` | drywall, painting, flooring, framing, plumbing, hvac, electrical, glazing | excavation, shoring, roofing, landscaping, waterproofing, concrete (foundation) |
| `Underpinning` | shoring, concrete, excavation, waterproofing | roofing, glazing, landscaping, elevator |
| `Re-Roofing/Re-Cladding` | roofing, masonry | excavation, shoring, concrete, elevator, landscaping |
| `Deck` | framing, landscaping | elevator, shoring, concrete (high-rise) |
| `Porch` | framing, masonry | elevator, shoring |
| `Garage` | framing, concrete, roofing, electrical | elevator, landscaping (interior) |
| `Garage Repair/Reconstruction` | framing, concrete, masonry | elevator, landscaping |
| `Fire Alarm` | fire-protection | all others |
| `Sprinklers` | fire-protection, plumbing | all others except plumbing |
| `Electromagnetic Locks` | fire-protection, electrical | all others |
| `Elevator` | elevator, electrical | excavation, landscaping |
| `Demolition` | demolition | all others |

### Scope-Expanding Work Types

| Work Value | Implied Trades |
|-----------|---------------|
| `New Building` | All early + structural + finishing trades (full construction lifecycle) |
| `Multiple Projects` | Full scope - use description keywords and structure_type to narrow |
| `Addition(s)` | Structural + finishing trades (concrete, framing, roofing, insulation, drywall, electrical, plumbing, hvac) |
| `New Laneway / Rear Yard Suite` | Full scope for small building (excavation, concrete, framing, roofing, plumbing, hvac, electrical, insulation, drywall, painting, flooring, glazing) |

---

## 3. Structure Type Assumptions

Structure type inference only applies to **broad-scope** permits (BLD, CMB, COM). It is never applied to narrow-scope permits.

| Structure Type | Boosted Trades | Not Applicable Trades |
|---------------|---------------|----------------------|
| SFD - Detached/Semi/Townhouse | framing (wood), roofing, plumbing, hvac, electrical, insulation, drywall, painting, flooring | elevator (rare), structural-steel (usually commercial) |
| Apartment Building | concrete, elevator, fire-protection, glazing, structural-steel | landscaping (minimal for high-rise) |
| Industrial | structural-steel, electrical, concrete | elevator (usually freight-specific), painting (limited) |
| Office | fire-protection, glazing, hvac, electrical | excavation (usually existing building), masonry |
| Retail Store | glazing (storefront), fire-protection, hvac | elevator, masonry |
| Restaurant | hvac (kitchen exhaust), plumbing (grease traps), fire-protection | elevator, masonry, roofing |
| Laneway / Rear Yard Suite | framing, concrete, excavation, plumbing, electrical | elevator, structural-steel |
| Stacked Townhouses | concrete, fire-protection, framing | elevator (low-rise) |
| Mixed Use | All trades possible | None excluded |

---

## 4. Confidence Levels by Source

| Classification Source | Confidence Range | Rationale |
|----------------------|-----------------|-----------|
| Permit code (narrow-scope) | 0.95 | Permit type explicitly identifies the trade |
| Tier 1: Permit type field | 0.90-0.95 | Direct match on permit_type code |
| Tier 2: Work field | 0.70-0.85 | Strong implication from work description |
| Tier 2: Structure type | 0.40-0.65 | Inferred, not confirmed. Lower confidence. |
| Tier 3: Description keywords | 0.50-0.70 | Ambiguous text scanning. Context-dependent. |

---

## 5. Key Limitations

1. **No building plans available.** All trade classification is metadata-based inference.
2. **Description quality varies.** Some descriptions are detailed ("install new plumbing fixtures, water heater, bathroom renovation"); others are minimal ("interior alterations").
3. **95% of permits have no builder_name.** Builder trade specialization cannot be used for classification.
4. **Multi-trade permits are common.** A single BLD permit may legitimately need 10+ trades.
5. **Classification rules are updatable.** As the system learns from user feedback and data patterns, rules and confidence levels should be refined.
6. **Narrow-scope permits may have related BLD permits.** A PLB permit often has a companion BLD permit for the same address. The BLD permit covers the broader trades.

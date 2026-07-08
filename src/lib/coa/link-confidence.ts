// CoA↔permit link-confidence tiers (Spec 60 §Link-CoA, Spec 76).
//
// link-coa.js assigns `coa_applications.linked_confidence` by match tier:
//   1a street_num+street_name+ward  → 0.95  (IDENTITY, high)
//   1b street_num+street_name       → 0.85  (IDENTITY, permit ward NULL)
//   1c ward conflict                → 0.10  (flagged geo-only fence — preserved)
//   2a geo (ward match)             → 0.60  (GEO inheritance)
//   2b+ geo                         → <0.60
//
// IDENTITY reads — where linked_permit_num represents "this is the SAME
// property's permit" (surfacing a specific permit to the user, or excluding a
// CoA from pre-permit surfacing because it is already permitted) — require the
// identity floor (≥0.85). A sub-0.85 link is a same-street / wrong-house or
// cross-ward geo association: surfacing it as the identity permit shows the WRONG
// property. The 0.60 geo tier is a deliberate geo-inheritance fence for lat/long
// enrichment (link-coa.js), NOT an identity assertion — never cleared.
export const COA_IDENTITY_LINK_MIN_CONFIDENCE = 0.85;

# Trade Classification & Product Linking Strategy

## 1. Overview
The classification engine previously relied on a 3-tier rules engine evaluating the Permit Type Code, the `work` field, and running Regex over the raw `description` text.

Now that we have successfully structured the raw `description` data and generated specific, standardized **work tags** for permits (defined in `src/lib/classification/scope.ts`), evaluating the raw description again is redundant and error-prone. 

The new objective is to link our highly specific work tags directly to both **Trades** (services) and **Product Groups** (materials) using a clean, structured mapping layer.

---

## 2. The Solution: Tag-to-Trade & Product Mapping Matrix

This approach replaces the old Tier 2 and Tier 3 logic with a direct, many-to-many lookup table linking our generated work tags to specifically named trades and products.

### How it works:
1. **Tier 1 Remains (Permit Type):** We retain the highest-level exact match on the Permit Type Code (e.g., PLB -> Plumbing, HVA -> HVAC).
2. **The New Matrix:** We build a static TypeScript configuration that explicitly links each standardized tag to one or more trades and products.
3. **Classification Execution:** During ingestion, the classifier reads the permit's `scope_tags` array and performs an instantaneous lookup against the matrix.

---

## 3. Gap Analysis & Improved Naming Conventions

The existing list of 20 base trades is too broad and heavily skewed toward structural and rough-in work. It fails to leverage the highly specific architectural tags we are now extracting (e.g., `new:kitchen`, `new:bathroom`, `new:pool`).

### Recommended Trade Nomenclature Updates (Services):
We must update our trade list to make the terminology more natural for the industry and cover all exterior/finishing phases:

1. **Carpentry & Woodwork**
   - *Improved Naming:* **Framing**, **Trim Work**, **Millwork & Cabinetry**
2. **Finishes & Wet Rooms**
   - *Improved Naming:* **Tiling**, **Stone & Countertops**, **Masonry & Brickwork**, **Drywall & Taping**
3. **Site Preparations & Exterior**
   - *Improved Naming:* **Landscaping & Hardscaping**, **Temporary Fencing**, **Caulking & Weatherproofing**, **Decking & Fences**
4. **Exterior Water Management (Gutters/Eavestroughs)**
   - *Addition:* We must add **Eavestrough & Siding** (or *Aluminum & Siding*) as a distinct trade. Roofers handle shingles, but aluminum trades handle gutters, soffit, fascia, and downspouts.
   - *Trigger Tags:* `new:roofing`, `new:sfd`, `new:addition`
5. **Specialty Systems**
   - *Improved Naming:* **Pool Installation**, **Solar Integration**, **Security & Access Control**, **HVAC & Sheet Metal**

---

## 4. Expanding to Product Classifications (Materials)

A tradesperson (e.g., a Framer) cares about service leads, but a **Supplier** (e.g., a lumber yard or lighting showroom) cares about product volume. We must establish a **Large Product Classification** layer that links to the same tags, running parallel to the Trade Classification.

### Recommended Product Categories
By linking these products directly to tags, we create a highly valuable parallel lead list specifically for material suppliers:

- **Tag `[new:kitchen]` triggers:**
  - `Kitchen Cabinets`
  - `Appliances`
  - `Countertops`
  - `Tiling (Backsplash)`
- **Tag `[new:bathroom]` triggers:**
  - `Plumbing Fixtures (Tubs, Toilets, Vanities)`
  - `Tiling (Showers, Floors)`
  - `Mirrors & Glass`
- **Tag `[new:stair]` triggers:**
  - `Staircases & Railings`
- **Tag `[new:window] / [new:door]` triggers:**
  - `Windows`
  - `Doors (Interior & Exterior)`
  - `Garage Doors`
- **Tag `[new:sfd] / [alter:interior-alterations]` triggers:**
  - `Flooring (Hardwood, LVP, Carpet)`
  - `Paint & Coatings`
  - `Lighting Fixtures`
  - `Lumber & Drywall` 
- **Tag `[new:roofing]` triggers:**
  - `Roofing Materials (Shingles, Metal)`
  - `Eavestroughs & Gutters (Aluminum)`

### Recommendation: The Dual-Matrix Approach
By defining two separate JSON mappings in `src/lib/classification/tag_matrix.ts`:
1. `TagToTradeMatrix` (For service contractors)
2. `TagToProductMatrix` (For material suppliers)

We ensure that a single tag (like `new:kitchen`) automatically routes the opportunity to both the **Trim Carpenter** (Trade) and the **Cabinet Supplier** (Product), maximizing the value of our lead generation platform for both audiences.

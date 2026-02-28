# Building Footprint Estimation Strategy

**Objective:** Estimate the existing square footage and physical footprint of a house on a specific lot to understand the scope of a renovation or demolition/rebuild project, leveraging available data and Street View imagery.

---

## 🏗️ Approach 1: Deterministic Open Data (The "Golden Record")

Before relying on predictive computer vision, the most accurate method to determine an existing house's size is to query the municipality's structural records. 

### The Data Sources: Parcels vs. Building Polygons
It is a common misconception that property lines and building outlines are the same thing. In the City of Toronto's Open Data Architecture, they are maintained as two completely separate datasets:

1. **Property Boundaries (Parcels):** This is the dataset we currently have loaded in the Buildo database (~500k rows). It defines the legal, mathematical property lines owned by the resident (the lot). It tells us where a house *can* be built, but knows nothing about the physical structures *currently* sitting on that lot.
2. **3D Massing (Building Polygons):** This is a separate dataset maintained by the city, often updated alongside LiDAR scans and building permits. This dataset maps the precise polygonal footprint of every physical building structure in the city. A single parcel might contain multiple building polygons (e.g., a main house and a detached garage).

#### 3D Massing Characteristics & Update Frequency
* **Update Frequency:** According to the Toronto Open Data portal, the 3D Massing dataset is refreshed **Annually**. This means newly built homes or demolitions might have a 1-to-12 month lag before appearing in the dataset.
* **Accessory Structures (Garages/Sheds):** Because this dataset maps *physical objects* rather than legal boundaries, a single residential parcel will often return multiple intersecting polygons. The primary polygon (usually the largest) is the main house, while smaller separate polygons are detached garages or large sheds.
* **Pools:** The 3D Massing dataset *does not* typically map below-ground structures or flat surfaces like residential swimming pools. However, Toronto does maintain a separate "Building Permits - Pool Enclosures" dataset if pool verification is needed.
* **Derived Data:** Beyond just the 2D footprint polygon, the massing dataset includes crucial Z-axis verticality data. 
  * `MAX_HEIGHT`: Useful for calculating total building volume.
  * `MIN_HEIGHT`: Useful for determining if a structure is elevated or sits on a podium.
  * `ELEVZ`: Base elevation above sea level.
  * **Note:** It does *not* explicitly list the number of stories; that must be mathematically derived by dividing `MAX_HEIGHT` by a standard floor height (e.g., 3 meters / 10 feet per story).

### Implementation Strategy
To extract the exact footprint of a house:
1. **Spatial Join:** Take the centroid (or the LIR - Largest Interior Rectangle) of the target Property Parcel from our database.
2. **Intersection Query:** Query the `building_polygons` table (from the 3D massing dataset) to find the building geometry that intersects with that point.
3. **Calculate Area:** The area of that specific building polygon represents the true ground-floor square footage of the structure (the *footprint*).
4. **Calculate Volume/Stories (Optional):** Because the 3D Massing dataset includes elevation data, we can extract the `MAX_HEIGHT` or `EST_STORIES` attribute to multiply the footprint by the number of floors, yielding the total livable square footage.

**Pros:** 
* 100% mathematically accurate to city records.
* Computationally cheap (just a PostGIS spatial query).
* Ignores trees, shadows, and camera distortion.

**Cons:** 
* Data can be 1-3 years out of date depending on the city's latest aerial survey.
* Does not visually confirm the "current condition" of the home.

---

## 🤖 Approach 2: Street View + AI Vision (The "Heuristic Estimate")

Since we have access to Google Street View imagery of the target house, we can use a multimodal Large Language Model (like GPT-4o or Claude 3.5 Sonnet) or a dedicated visual depth-estimation model to estimate the scale of the structure relative to the lot.

### The Methodology: Proportional Ratios (Camera to Pixel)

Because a single 2D image lacks inherent scale, the AI cannot guess "this house is 40 feet wide" from pixels alone without a reference point. However, because we already *know* the lot dimensions from the parcel database, we can use the lot as our reference anchor.

### Implementation Strategy
1. **Pass Data to Vision Model:** Send the Street View image to the AI, along with the *known* Lot Frontage (e.g., 50 ft) from our database.
2. **Prompt for Proportionality:** 
   * *"This image shows a house sitting on a lot that is exactly 50 feet wide. Based on the visible property lines (driveways, fences, side yards), what percentage of the total lot width does the house structure occupy?"*
3. **Calculate Estimated Frontage:** If the AI determines the house takes up roughly 60% of the lot's visual width, we calculate `50ft * 0.60 = 30ft` building width.
4. **Prompt for Height/Depth:**
   * *"Count the number of visible stories (including basement windows).*
   * *"Estimate the depth of the house relative to its width (e.g., is it twice as deep as it is wide?)"*
5. **Compute Final Estimate:** `Estimated Width * Estimated Depth * Number of Stories = Total Livable SqFt`.

**Pros:** 
* Highly resilient to outdated city data (Street View is updated frequently).
* Verifies the *actual* real-world conditions (e.g., if a massive addition was built illegally without a permit, the AI will see it, whereas the city data won't).
* Can assess the *quality* and *style* of the house simultaneously (e.g., brick vs. siding, indicating the complexity of a demolition).

**Cons:** 
* Vulnerable to visual obstructions (large trees blocking the facade).
* Depth estimation from a front-facing 2D photo is inherently a guess (the house might be an L-shape in the back).
* Perspective distortion (fisheye lenses on Google cars) can skew proportional width calculations.

---

## 🏆 Recommendation: The Hybrid Pipeline

The most robust architectural analysis system doesn't choose between these approaches; it stacks them.

1. **Base Truth:** Query the Toronto Building Polygon dataset to get the official footprint and size (e.g., 1,200 sqft footprint).
2. **Vision Validation:** Send the Street View image to the Vision AI. Ask it *only* to extract structural features: "How many stories?" and "Is there an attached garage?" (e.g., 2 stories).
3. **Synthesis:** `1,200 sqft footprint * 2 stories = 2,400 sqft total size`. 

By letting the deterministic City Data handle the horizontal X/Y dimensions (which it is perfect at), and letting the AI Vision model handle the vertical Z dimensions and qualitative assessment (which it is perfect at), we achieve the highest possible confidence score for renovation and rebuild estimations.

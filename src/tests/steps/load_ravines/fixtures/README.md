# `load_ravines` shapefile fixtures (Spec 120 §15.4 rung 1 · claim #180)

Three minimal, **real** shapefiles — generated, not downloaded, so they are bytes a
reviewer can reason about rather than a 7 MB opaque archive. Each is a directory
shaped exactly like an extracted CKAN zip, which is what
`scripts/lib/step/acquire.js` `locateShapefile()` is handed.

Each carries one square polygon near Toronto (`-79.40,43.70` → `-79.39,43.71`) and
one attribute row with `OBJECTID = 9914257` — the low end of the live `source_id`
range, so a fixture id can never collide with a real one.

| Directory | What it is | What it proves |
|---|---|---|
| `missing-prj/` | `.shp` + `.shx` + `.dbf`, **no `.prj`** | The `.prj` is optional. `locateShapefile()` requires the companion `.dbf` and nothing else; demanding a `.prj` would reject a healthy CKAN archive, since the resource is published WGS84 by contract and carries no projection file. |
| `corrupt/` | a valid 100-byte header followed by a **truncated record** | The parse must THROW, not yield a partial feature set. A silently short parse is the dangerous failure: it looks like a shrunken source, so the count-drift bound would fire and the operator would go hunting upstream for a publisher change that never happened. |
| `non-utf8/` | valid geometry, **Latin-1 (CP1252)** bytes in the `.dbf` character field (`Rivière Noire`, `0xE8`) | Attribute encoding must not decide whether a polygon loads. The key is numeric (`OBJECTID`) and the geometry is binary; a mis-decoded name must never become a dropped feature. |

**Measured against the real seam, 2026-08-25** (`locateShapefile` + `parseShapefile`
from `scripts/lib/step/acquire.js`, `coerceKey` from
`scripts/lib/compute/load-ravines.js`):

```
missing-prj -> { features: 1, badKey: 0, nullGeometry: 0, source_id: 9914257 }
non-utf8    -> { features: 1, badKey: 0, nullGeometry: 0, source_id: 9914257 }
corrupt     -> THROWS (Offset is outside the bounds of the DataView)
```

Regenerate with the script recorded in the pilot-2 assessment report; the bytes are
committed because a fixture that has to be built before it can be read is a fixture
nobody runs.

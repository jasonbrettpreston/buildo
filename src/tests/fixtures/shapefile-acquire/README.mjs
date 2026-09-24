// The .shp/.dbf this directory was meant to carry are NOT committed and NOT read by
// any lock: the `shapefile` package (0.6.6) ships a READER only (`open/openShp/openDbf`
// /`read`) — there is no writer — and this worktree's tooling cannot execute an ad-hoc
// generator to produce one. `generate.mjs` in this directory is the faithful generator
// for a future session with a writable toolchain; it is not run in CI.
//
// So the WF2 batch-2 row 3.1 prerequisite 0f locks (step-library.logic.test.ts, the
// "INGESTOR shapefile acquisition" describe) read an EXISTING fixture the repo already
// ships:
//
//   src/tests/steps/load_ravines/fixtures/missing-prj/ravines.shp + ravines.dbf
//
// a real 1-polygon shapefile whose .dbf carries TWO attributes — `OBJECTID`
// (N, len 10) = 9914257 and `NAME` (C, len 16) = "Ravine North" — which is exactly what
// T1 needs (a named DBF attribute surviving onto `record` beside the key and `geojson`).
// T2 mocks `acquireExternal` (the "INGESTOR CSV acquisition" T5 precedent), so its
// 3-feature / one-refused-record arithmetic is driven by the mock, not by the fixture's
// feature count.
export {};

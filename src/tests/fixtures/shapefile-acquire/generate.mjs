// Generate a tiny real shapefile pair for the WF2 batch-2 row 3.1 prerequisite 0f
// locks (step-library.logic.test.ts). The `shapefile` package (0.6.6) ships a READER
// only (`open/openShp/openDbf/read`) — there is no writer — so the .shp/.dbf bytes
// are written here by hand from the documented ESRI format. Re-run with:
//   node src/tests/fixtures/shapefile-acquire/generate.mjs
// The bytes are committed because a fixture that has to be built before it can be
// read is a fixture nobody runs (load_ravines fixtures README, same rule).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Three clockwise 4-vertex polygon rings near Toronto (the shp parser classifies a
// ring as an outer polygon when ringClockwise() is true, i.e. signed area >= 0).
const RINGS = [
  [[-79.40, 43.70], [-79.39, 43.70], [-79.39, 43.71], [-79.40, 43.71], [-79.40, 43.70]],
  [[-79.38, 43.70], [-79.37, 43.70], [-79.37, 43.71], [-79.38, 43.71], [-79.38, 43.70]],
  [[-79.36, 43.70], [-79.35, 43.70], [-79.35, 43.71], [-79.36, 43.71], [-79.36, 43.70]],
];
// (source_id, OBJECTID numeric N(9,0), NAME character C(16)) — two DBF attributes.
const ATTRS = [
  { source_id: 9914257, name: 'Ravine A' },
  { source_id: 9914258, name: 'Ravine B' },
  { source_id: 9914259, name: 'Ravine C' },
];

// ── .shp ─────────────────────────────────────────────────────────────────────
function shpRecord(index, ring) {
  const xs = ring.map((p) => p[0]); const ys = ring.map((p) => p[1]);
  const body = Buffer.alloc(4 + 32 + 4 + 4 + ring.length * 16);
  body.writeInt32LE(5, 0); // shape type Polygon
  body.writeDoubleLE(Math.min(...xs), 4);
  body.writeDoubleLE(Math.min(...ys), 12);
  body.writeDoubleLE(Math.max(...xs), 20);
  body.writeDoubleLE(Math.max(...ys), 28);
  body.writeInt32LE(1, 36); // numParts
  body.writeInt32LE(ring.length, 40); // numPoints
  body.writeInt32LE(0, 44); // part 0 starts at point 0
  ring.forEach((p, i) => {
    body.writeDoubleLE(p[0], 48 + i * 16);
    body.writeDoubleLE(p[1], 48 + i * 16 + 8);
  });
  const header = Buffer.alloc(8);
  header.writeInt32BE(index, 0); // record number, 1-based
  header.writeInt32BE(body.length / 2, 4); // content length in 16-bit words
  return Buffer.concat([header, body]);
}

const allX = RINGS.flat().map((p) => p[0]); const allY = RINGS.flat().map((p) => p[1]);
const shpBody = Buffer.concat(RINGS.map((r, i) => shpRecord(i + 1, r)));
const shpHeader = Buffer.alloc(100);
shpHeader.writeInt32BE(9994, 0); // file code
shpHeader.writeInt32BE(shpBody.length / 2, 24); // file length in 16-bit words
shpHeader.writeInt32LE(1000, 28); // version
shpHeader.writeInt32LE(5, 32); // shape type Polygon
shpHeader.writeDoubleLE(Math.min(...allX), 36);
shpHeader.writeDoubleLE(Math.min(...allY), 44);
shpHeader.writeDoubleLE(Math.max(...allX), 52);
shpHeader.writeDoubleLE(Math.max(...allY), 60);
writeFileSync(join(import.meta.dirname, 'three-polys.shp'), Buffer.concat([shpHeader, shpBody]));

// ── .dbf ─────────────────────────────────────────────────────────────────────
const FIELDS = [
  { name: 'OBJECTID', type: 'N', length: 9 },
  { name: 'NAME', type: 'C', length: 16 },
];
const recordLength = 1 + FIELDS.reduce((n, f) => n + f.length, 0);
const headerLen = 32 + FIELDS.length * 32 + 1;
const dbfHeader = Buffer.alloc(32);
dbfHeader.writeUInt8(0x03, 0); // dBASE III
dbfHeader.writeUInt16LE(headerLen, 8);
dbfHeader.writeUInt16LE(recordLength, 10);
dbfHeader.writeUInt32LE(ATTRS.length, 4);
const fieldDescs = FIELDS.map((f) => {
  const d = Buffer.alloc(32);
  d.write(f.name, 0, 'latin1');
  d.write(f.type, 11, 'latin1');
  d.writeUInt8(f.length, 16);
  return d;
});
const records = ATTRS.map((a) => {
  const r = Buffer.alloc(recordLength, 0x20);
  r.writeUInt8(0x20, 0); // not deleted
  let off = 1;
  r.write(String(a.source_id).padStart(FIELDS[0].length, ' '), off, 'latin1'); off += FIELDS[0].length;
  r.write(a.name.padEnd(FIELDS[1].length, ' '), off, 'latin1');
  return r;
});
writeFileSync(join(import.meta.dirname, 'three-polys.dbf'),
  Buffer.concat([dbfHeader, ...fieldDescs, Buffer.from([0x0d]), ...records, Buffer.from([0x1a])]));

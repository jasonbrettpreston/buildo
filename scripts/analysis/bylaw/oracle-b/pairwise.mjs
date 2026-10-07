// Oracle B harness — a seeded, deterministic greedy pairwise (2-way) covering-array builder (Phase 2 plan §V-1b).
// Pure: the same (dims, seed) always yields the same rows. Coverage is computed, never asserted.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function seedOf(str) {
  let h = 2166136261;
  for (const ch of String(str)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * dims: [{name, values: [...]}]. Returns {rows: [[valueIndex,...]], pairs_total, pairs_covered}.
 * Greedy: each new row is the best of `tries` candidates, each built dimension by dimension choosing the value that
 * covers the most still-uncovered pairs with the values already chosen (ties broken by the seeded PRNG).
 */
export function pairwise(dims, seed = 1, tries = 24) {
  const rnd = mulberry32(seed);
  const n = dims.length;
  const key = (i, vi, j, vj) => (i < j ? `${i}:${vi}|${j}:${vj}` : `${j}:${vj}|${i}:${vi}`);
  const uncovered = new Set();
  for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) for (let a = 0; a < dims[i].values.length; a += 1) for (let b = 0; b < dims[j].values.length; b += 1) uncovered.add(key(i, a, j, b));
  const total = uncovered.size;
  const rows = [];
  while (uncovered.size) {
    let best = null; let bestGain = -1;
    for (let t = 0; t < tries; t += 1) {
      const order = [...Array(n).keys()].sort(() => rnd() - 0.5);
      // seed the row with one uncovered pair so every row makes progress
      const first = [...uncovered][Math.floor(rnd() * uncovered.size)];
      const [[pi, pa], [pj, pb]] = first.split('|').map((x) => x.split(':').map(Number));
      const row = new Array(n).fill(-1); row[pi] = pa; row[pj] = pb;
      for (const d of order) {
        if (row[d] !== -1) continue;
        let bv = 0; let bg = -1;
        for (let v = 0; v < dims[d].values.length; v += 1) {
          let g = 0;
          for (let o = 0; o < n; o += 1) if (row[o] !== -1 && uncovered.has(key(d, v, o, row[o]))) g += 1;
          if (g > bg || (g === bg && rnd() < 0.5)) { bg = g; bv = v; }
        }
        row[d] = bv;
      }
      let gain = 0;
      for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) if (uncovered.has(key(i, row[i], j, row[j]))) gain += 1;
      if (gain > bestGain) { bestGain = gain; best = row; }
    }
    for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) uncovered.delete(key(i, best[i], j, best[j]));
    rows.push(best);
  }
  // coverage recomputed from the rows (computed, not asserted)
  const seen = new Set();
  for (const r of rows) for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) seen.add(key(i, r[i], j, r[j]));
  return { rows, pairs_total: total, pairs_covered: seen.size };
}

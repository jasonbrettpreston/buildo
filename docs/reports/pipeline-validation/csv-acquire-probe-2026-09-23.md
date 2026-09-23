# CSV acquisition memory probe — address_points, 2026-09-23

SPEC LINK: `docs/specs/01-pipeline/122_pipeline_step_optimization.md` §5.1
SPEC LINK: `.cursor/wf2_ingest_csv_acquire_active_task.md` D4

Measured (not assumed) the memory footprint of the INGESTOR runner's CSV acquisition
path — `scripts/lib/step/acquire.js`'s `downloadArchive` + `parseCsv`, the exact
functions `acquireExternal`'s `format: "csv"` branch calls — against the real
address_points CSV (`scripts/load-address-points.js`'s `CSV_URL`, key column
`ADDRESS_POINT_ID`, `csv_options: {bom: false, relax_quotes: true}`). Read-only, no DB.

Tool: `scripts/analysis/probe-csv-acquire.mjs` (committed, reusable for parcels and
`load_wsib`'s CSVs).

```
node scripts/analysis/probe-csv-acquire.mjs --url=<CSV_URL> --key=ADDRESS_POINT_ID --relax-quotes
node --max-old-space-size=2048 scripts/analysis/probe-csv-acquire.mjs --url=<CSV_URL> --key=ADDRESS_POINT_ID --relax-quotes
```

## Results

| Run | Rows | Bad key | Peak RSS (MB) | Peak heapUsed (MB) | Heap limit (MB) | Download (s) | Parse (s) | Completed |
|---|---|---|---|---|---|---|---|---|
| Default heap | 525,436 | 0 | 1531.40 | 1336.62 | 4288 | 15.84 | 23.56 | yes |
| `--max-old-space-size=2048` | 525,436 | 0 | 1531.83 | 1352.05 | 2240 | 15.64 | 27.50 | yes |

Source file: 183,503,831 bytes (~175 MiB) downloaded, md5 `87637531…`.

## Reading

- Both runs parsed the full 525,436-row CSV to completion; `bad_key_count` is 0 (every
  row's `ADDRESS_POINT_ID` coerces).
- Peak RSS is essentially identical (~1.53 GB) across both runs, independent of the heap
  cap — the runner's whole-array hand-off (`parseCsv` accumulates every `{[keyColumn]:
  key, record}` in one JS array before returning it to `runIngestPhase`) drives RSS, not
  the V8 heap limit; RSS includes the array of parsed record objects plus the streamed
  parser's own buffers.
- Under the tightened 2048 MB `--max-old-space-size`, `heap_size_limit` (V8's actual
  usable old-space ceiling, read via `v8.getHeapStatistics()`) came back as 2240 MB —
  slightly above the requested 2048 because V8 rounds the limit up from other space
  reservations — and peak heapUsed (1352 MB) stayed comfortably under it (~888 MB of
  headroom). No breach.
- On the default (untuned) heap, `heap_size_limit` was 4288 MB against a 1337 MB peak —
  over 2x headroom.
- Wall time is dominated by parse (23–28s) over download (~16s) for this file size; the
  gap between the two parse times (23.56s vs 27.50s) is noise-level, consistent with GC
  pressure being negligible at both heap sizes for this row count.

## Verdict

No breach of the default heap, and no breach even under a deliberately tightened 2 GB
`--max-old-space-size`. Per plan D4, Ask O3 (the streaming seam) is **not** triggered for
address_points at its current size (~525K rows / ~175 MiB). The whole-array model is
measured-safe for this dataset; a future dataset an order of magnitude larger (parcels is
the next reusable target) should be re-probed with this same tool before assuming the
same headroom.

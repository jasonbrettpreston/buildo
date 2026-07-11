/**
 * Pipeline Advisory Lock Compliance — Regression Tests
 *
 * Ensures every JS pipeline script registered in manifest.json has the mandatory
 * §47 advisory-lock scaffolding:
 *   - ADVISORY_LOCK_ID constant declared
 *   - pipeline.withAdvisoryLock() called in the pipeline.run body
 *   - All ADVISORY_LOCK_IDs are unique across scripts
 *   - Each script's ID matches the Bundle G lock ID registry (§A.5)
 *
 * Python scripts (aic-orchestrator.py) and coming_soon entries (file: null)
 * are excluded — they are out of scope for JS advisory locks.
 *
 * SPEC LINK: docs/specs/01-pipeline/47_pipeline_script_protocol.md §R2
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Bundle G lock ID registry (§A.5)
// Keys are relative paths from the repo root (same as manifest.json `file` values).
// ---------------------------------------------------------------------------
const LOCK_ID_REGISTRY: Record<string, number> = {
  // Wave 4 — Load / Ingest
  'scripts/load-permits.js':         2,
  'scripts/geocode-permits.js':      5,
  'scripts/extract-builders.js':     11,
  'scripts/load-parcels.js':         55,
  'scripts/load-massing.js':         56,
  'scripts/load-neighbourhoods.js':  57,
  'scripts/load-zoning.js':          58,
  // Spec 59 (load-ravines §8c): lock = spec number (§R2/L4). Ravine & Natural
  // Feature Protection source ingest; chain step after parcels in chain_sources.
  'scripts/load-ravines.js':         59,
  // Spec 61 (load-heritage §8c): lock = spec number (DEC-A; spec L4=62 was a stale
  // pre-implementation guess). Heritage Register + HCD source ingest after load_ravines.
  'scripts/load-heritage.js':        61,
  // Spec 62 (load-centreline §8c): §5.2 exception — natural ID 62 + sibling 63 both intended
  // for Spec 62, but 62 is taken by enrich-heritage. Spec L4=65 is stale (collides with
  // enrich-parcels=65). Next-free-gap: load=63, enrich=64 (§8d). Toronto Centreline ingest
  // after load_heritage in chain_sources.
  'scripts/load-centreline.js':      63,
  // Spec 62 §8d (enrich-centreline): lock 64 (sibling of load-centreline=63; spec L4b=66 stale —
  // 66 is enrich-permits). Parcel corner/through/frontage enrichment after enrich_heritage.
  'scripts/enrich-centreline.js':    64,
  // Spec 65 (enrich-parcels WF2): lock = spec number (§R2). Enrich step after
  // load_zoning in chain_sources; writes the zoning by-law feed onto parcels.
  // Spec 59 §8d (enrich-ravines): lock 60 (L4b). Sibling of load-ravines (59);
  // set-based parcels ravine enrichment after link_parcels in chain_sources.
  'scripts/enrich-ravines.js':       60,
  // Spec 61 §8d (enrich-heritage): lock 62 (sibling of load-heritage=61; spec L4b=63 stale).
  // Set-based parcels heritage enrichment after enrich_ravines in chain_sources.
  'scripts/enrich-heritage.js':      62,
  'scripts/enrich-parcels.js':       65,
  // Spec 66 (enrich-permits WF3): lock = spec number. ONE file, two manifest entries
  // (enrich_permits / enrich_coa_zoning via ENRICH_TARGET) → one shared lock (the
  // chains run 1h apart + are chain-locked, so no harmful serialisation).
  'scripts/enrich-permits.js':       66,
  'scripts/load-coa.js':             95,
  'scripts/load-address-points.js':  96,
  'scripts/load-wsib.js':            97,
  // Wave 5 — Compute / Maintenance
  'scripts/close-stale-permits.js':  98,
  'scripts/compute-centroids.js':    99,
  // Phase G (Spec 42 §6.11): 'scripts/create-pre-permits.js' (lock 100) retired.
  'scripts/purge-lead-views.js':     101,
  'scripts/refresh-snapshot.js':     40,
  // Wave 3 — Enrich
  'scripts/enrich-web-search.js':    45,
  'scripts/enrich-wsib.js':          46,
  // Wave 2 — Link
  'scripts/link-similar.js':         30,
  'scripts/link-parcels.js':         90,
  'scripts/link-massing.js':         91,
  'scripts/link-neighbourhoods.js':  92,
  'scripts/link-coa.js':             12,
  'scripts/link-wsib.js':            94,
  // WF1 #parcel-address-bridge Phase 2c — Wave 2 spatial bridge populator.
  // Lock 115 assigned from free range; owning spec is 54 (Source: Address
  // Points) but spec ID is taken by load-address-points historically.
  'scripts/link-parcel-addresses.js': 115,
  // One-time backfills (scripts/one-time/) — NOT in scripts/manifest.json, so the
  // manifest-coverage assertion does not enforce them; they ARE covered by the
  // one-time/backfill uniqueness scan + the registry-vs-code agreement test below.
  // 121 was reassigned from 117 (WF2 P10-4) — 117 belongs to compute-parcel-cost-
  // estimates.js (Spec 88); the collision was invisible while the uniqueness test
  // scanned manifest scripts only.
  'scripts/one-time/backfill-address-points-geom.js':         116,
  'scripts/one-time/backfill-coa-street-name-normalized.js':  118,
  'scripts/one-time/backfill-coa-structure-type.js':          119,
  'scripts/one-time/backfill-coa-products.js':                120,
  'scripts/one-time/backfill-building-footprints-geom.js':    121,
  // §A.5 record — scripts/one-time/backfill-parcels-zoning-index.js (Spec 65) +
  //   scripts/one-time/backfill-permits-coa-zoning-index.js (Spec 66):
  //   NO advisory lock (idempotent CREATE INDEX CONCURRENTLY IF NOT EXISTS,
  //   autocommit DDL; not in manifest). Listed here for registry completeness.
  // Wave 1 — Classify
  'scripts/classify-inspection-status.js': 53,
  'scripts/classify-scope.js':       87,
  'scripts/classify-permits.js':     88,
  'scripts/classify-permit-phase.js': 89,
  'scripts/reclassify-all.js':       80,
  // Bundle A — Compute (already compliant pre-Bundle G)
  'scripts/compute-opportunity-scores.js':   81,
  'scripts/update-tracked-projects.js':      82,
  // Spec 101 (dispatch-notifications, P25): owning-spec lock 101 collides with
  // purge-lead-views.js and 122 with a one-time backfill; per the
  // compute-phase-calibration precedent (free-ID when the slot is taken), 123 is
  // assigned from the free range.
  'scripts/dispatch-notifications.js':       123,
  'scripts/compute-cost-estimates.js':       83,
  'scripts/compute-storey-norms.js':         195,
  'scripts/compute-build-norms.js':          78,
  'scripts/classify-lifecycle-phase.js':     84,
  'scripts/compute-trade-forecasts.js':      85,
  'scripts/compute-timing-calibration-v2.js': 86,
  'scripts/compute-phase-calibration.js':    93,
  // WF3 #realtor-backfill (2026-05-09) — owning Spec 91 lock collides with
  // link-massing.js's Wave-2 sequential 91; per WF1 #B compute-phase-calibration
  // precedent (free-ID assignment when owning-spec slot taken), 114 is
  // assigned from the post-Wave-7 free range.
  'scripts/backfill-realtor-permit-trades.js': 114,
  // Spec 88 (compute-parcel-cost-estimates): owning-spec lock 88 collides with
  // classify-permits.js (which predates the spec-number convention). Per the
  // compute-phase-calibration precedent (free-ID when the slot is taken), 117 is
  // assigned from the post-Wave-7 free range (113 observe-chain, 114 backfill-realtor,
  // 115 link-parcel-addresses, 116 reserved one-time → 117 next-free).
  'scripts/compute-parcel-cost-estimates.js':  117,
  // Phase D Wave 4 — CoA classifiers (Spec 42 §6.8 allocation 4201-4205)
  'scripts/link-coa-to-parcels.js':            4201,
  'scripts/classify-coa-scope.js':             4202,
  'scripts/classify-coa-trades.js':            4203,
  'scripts/compute-coa-cost-estimates.js':     4204,
  // 'scripts/migrate-to-lead-id.js' = 4205 is one-shot (not a chain step; not in manifest)
  // Wave 6 — Quality / Assert
  'scripts/quality/assert-schema.js':           102,
  'scripts/quality/assert-data-bounds.js':      103,
  'scripts/quality/assert-engine-health.js':    104,
  'scripts/quality/assert-network-health.js':   105,
  'scripts/quality/assert-staleness.js':        106,
  // Phase G: 'scripts/quality/assert-pre-permit-aging.js' (lock 107) retired.
  'scripts/quality/assert-coa-freshness.js':    108,
  'scripts/quality/assert-lifecycle-phase-distribution.js': 109,
  'scripts/quality/assert-entity-tracing.js':   110,
  'scripts/quality/assert-global-coverage.js':  111,
  'scripts/quality/assert-parcel-sanity.js':    107, // WF2 (reuses the slot retired from assert-pre-permit-aging, Phase G)
  // Wave 7 — Maintenance / Backup
  'scripts/backup-db.js':                       112,
  'scripts/observe-chain.js':                   113,
};

// ---------------------------------------------------------------------------
// Load manifest and build the list of JS scripts under test
// ---------------------------------------------------------------------------
const REPO_ROOT = path.resolve(__dirname, '../../');
const MANIFEST_PATH = path.join(REPO_ROOT, 'scripts/manifest.json');

interface ManifestEntry {
  file: string | null;
  coming_soon?: boolean;
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) as {
  scripts: Record<string, ManifestEntry>;
};

// Collect unique JS files (exclude Python, null/coming_soon entries)
const uniqueJsFiles = Array.from(
  new Set(
    Object.values(manifest.scripts)
      .filter((e): e is ManifestEntry & { file: string } =>
        e.file !== null && !e.file.endsWith('.py'),
      )
      .map((e) => e.file),
  ),
);

// One-time / backfill scripts are NOT in the manifest, but they DO acquire
// advisory locks (§A.5) — so their IDs must be unique against the manifest set.
// A live 117 collision (compute-parcel-cost-estimates vs backfill-building-
// footprints-geom) hid here until WF2 P10-4 extended the scan to these dirs.
const EXTRA_LOCK_DIRS = ['scripts/one-time', 'scripts/backfill'];
function collectExtraLockedScripts(): string[] {
  const out: string[] = [];
  for (const dir of EXTRA_LOCK_DIRS) {
    const abs = path.join(REPO_ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs)) {
      if (f.endsWith('.js')) out.push(`${dir}/${f}`);
    }
  }
  return out;
}
// The full set of lock-bearing JS files: manifest chain steps + one-time/backfill.
const allLockedJsFiles = Array.from(new Set([...uniqueJsFiles, ...collectExtraLockedScripts()]));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function readScript(relPath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
}

function extractLockId(source: string): number | null {
  const m = source.match(/const ADVISORY_LOCK_ID\s*=\s*(\d+)/);
  return m ? parseInt(m[1]!, 10) : null;
}

// Parse the §A.5 Bundle-G registry table out of Spec 47 → { script → id }.
// Rows flagged RETIRED (deleted scripts kept for history) are skipped. This is
// the spec-table half of the "spec ↔ constant" agreement check; §5.2's
// canonical table and the LOCK_ID_REGISTRY constant must not diverge.
const SPEC_47_PATH = path.join(REPO_ROOT, 'docs/specs/01-pipeline/47_pipeline_script_protocol.md');
function parseSpecA5Table(): Record<string, number> {
  const md = fs.readFileSync(SPEC_47_PATH, 'utf8');
  const start = md.indexOf('### A.5');
  const body = start >= 0 ? md.slice(start) : md;
  const out: Record<string, number> = {};
  for (const line of body.split('\n')) {
    if (/retired/i.test(line)) continue;
    // | **117** | `scripts/compute-parcel-cost-estimates.js` | ... |
    const m = line.match(/^\|\s*\*{0,2}(\d+)\*{0,2}\s*\|\s*`(scripts\/[^`]+\.js)`/);
    if (m) out[m[2]!] = parseInt(m[1]!, 10);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Pipeline Advisory Lock Compliance (§47 §R2)', () => {
  describe('ADVISORY_LOCK_ID is declared in every JS script', () => {
    for (const file of uniqueJsFiles) {
      it(`${path.basename(file)} (${file})`, () => {
        const source = readScript(file);
        expect(
          source,
          `${file} must declare const ADVISORY_LOCK_ID = <number>`,
        ).toMatch(/const ADVISORY_LOCK_ID\s*=\s*\d+/);
      });
    }
  });

  describe('pipeline.withAdvisoryLock() is called in every JS script', () => {
    for (const file of uniqueJsFiles) {
      it(`${path.basename(file)} (${file})`, () => {
        const source = readScript(file);
        expect(
          source,
          `${file} must call pipeline.withAdvisoryLock(...)`,
        ).toContain('withAdvisoryLock');
      });
    }
  });

  it('all ADVISORY_LOCK_IDs are unique across all JS scripts (incl. one-time/backfill)', () => {
    const seen = new Map<number, string>();
    const duplicates: string[] = [];

    for (const file of allLockedJsFiles) {
      const source = readScript(file);
      const id = extractLockId(source);
      if (id === null) continue; // no lock (e.g. backfill/ DDL scripts) — skip

      if (seen.has(id)) {
        duplicates.push(`ID ${id} used by both "${seen.get(id)}" and "${file}"`);
      } else {
        seen.set(id, file);
      }
    }

    expect(duplicates).toEqual([]);
  });

  describe('each script\'s ADVISORY_LOCK_ID matches the Bundle G registry (§A.5)', () => {
    for (const [registryFile, expectedId] of Object.entries(LOCK_ID_REGISTRY)) {
      it(`${path.basename(registryFile)} has ID ${expectedId}`, () => {
        const source = readScript(registryFile);
        const actualId = extractLockId(source);
        expect(
          actualId,
          `${registryFile} declares ADVISORY_LOCK_ID = ${actualId} but registry expects ${expectedId}`,
        ).toBe(expectedId);
      });
    }
  });

  it('registry covers every JS script in the manifest (no unregistered scripts)', () => {
    const unregistered = uniqueJsFiles.filter((f) => !(f in LOCK_ID_REGISTRY));
    expect(
      unregistered,
      'All manifest JS scripts must appear in LOCK_ID_REGISTRY',
    ).toEqual([]);
  });

  // WF2 P10-4: the SECOND agreement axis. The existing "registry ↔ code" block
  // pins constant-vs-source; this pins the constant against Spec 47 §A.5's
  // markdown table (previously prose-only at 47:1813) so the human-readable
  // registry can't silently diverge from the machine-checked one.
  it('LOCK_ID_REGISTRY constant agrees with the Spec 47 §A.5 markdown table', () => {
    const table = parseSpecA5Table();
    const mismatches: string[] = [];

    // Every §A.5 (non-retired) row must match the constant.
    for (const [file, id] of Object.entries(table)) {
      if (!(file in LOCK_ID_REGISTRY)) {
        mismatches.push(`§A.5 lists ${file} = ${id} but it is absent from LOCK_ID_REGISTRY`);
      } else if (LOCK_ID_REGISTRY[file] !== id) {
        mismatches.push(`§A.5 lists ${file} = ${id} but LOCK_ID_REGISTRY has ${LOCK_ID_REGISTRY[file]}`);
      }
    }
    // Every constant entry must appear in the §A.5 table.
    for (const [file, id] of Object.entries(LOCK_ID_REGISTRY)) {
      if (!(file in table)) {
        mismatches.push(`LOCK_ID_REGISTRY has ${file} = ${id} but §A.5 table omits it`);
      }
    }

    expect(mismatches, 'Spec 47 §A.5 table and LOCK_ID_REGISTRY must agree').toEqual([]);
  });
});

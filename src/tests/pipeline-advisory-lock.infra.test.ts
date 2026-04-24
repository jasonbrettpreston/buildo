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
  'scripts/load-coa.js':             95,
  'scripts/load-address-points.js':  96,
  'scripts/load-wsib.js':            97,
  // Wave 5 — Compute / Maintenance
  'scripts/close-stale-permits.js':  98,
  'scripts/compute-centroids.js':    99,
  'scripts/create-pre-permits.js':   100,
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
  // Wave 1 — Classify
  'scripts/classify-inspection-status.js': 53,
  'scripts/classify-scope.js':       87,
  'scripts/classify-permits.js':     88,
  'scripts/classify-permit-phase.js': 89,
  // Bundle A — Compute (already compliant pre-Bundle G)
  'scripts/compute-opportunity-scores.js':   81,
  'scripts/update-tracked-projects.js':      82,
  'scripts/compute-cost-estimates.js':       83,
  'scripts/classify-lifecycle-phase.js':     84,
  'scripts/compute-trade-forecasts.js':      85,
  'scripts/compute-timing-calibration-v2.js': 86,
  // Wave 6 — Quality / Assert
  'scripts/quality/assert-schema.js':           102,
  'scripts/quality/assert-data-bounds.js':      103,
  'scripts/quality/assert-engine-health.js':    104,
  'scripts/quality/assert-network-health.js':   105,
  'scripts/quality/assert-staleness.js':        106,
  'scripts/quality/assert-pre-permit-aging.js': 107,
  'scripts/quality/assert-coa-freshness.js':    108,
  'scripts/quality/assert-lifecycle-phase-distribution.js': 109,
  'scripts/quality/assert-entity-tracing.js':   110,
  'scripts/quality/assert-global-coverage.js':  111,
  // Wave 7 — Maintenance / Backup
  'scripts/backup-db.js':                       112,
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

  it('all ADVISORY_LOCK_IDs are unique across all JS scripts', () => {
    const seen = new Map<number, string>();
    const duplicates: string[] = [];

    for (const file of uniqueJsFiles) {
      const source = readScript(file);
      const id = extractLockId(source);
      if (id === null) continue; // already caught by the per-script test above

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
});

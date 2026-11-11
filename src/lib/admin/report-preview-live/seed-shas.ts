// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-384 (Phase 3 is tables: each stored row carries the hashes of the seeds that made it);
//            docs/specs/01-pipeline/78_optimal_lot_configuration.md (compute_maxbld_scenarios step identity).
//
// MB-93 · the CURRENT catalogue and switchboard hashes, for the preview's freshness verdict (plan ~/Buildo-scratch/mcfrontend/PREVIEW/plan.md 3.5,
// operator D-7 a). The twin of scripts/lib/compute/maxbld/catalogue.js canonicalJson + sha256 + seedShas over the same committed seed files
// (the scope.ts / storey-extract.js twin pattern): src/tests/admin-report-preview-live.logic.test.ts asserts both give the same hex.
import crypto from 'node:crypto';
import catalogue from '../../../../scripts/seeds/bylaw/layer3-catalogue.json';
import switchboard from '../../../../scripts/seeds/bylaw/switchboard.json';

/** Deterministic JSON: object keys sorted recursively, arrays keep their order, undefined is null (catalogue.js canonicalJson). */
export function canonicalJson(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(canonicalJson).join(',')}]`;
  if (x !== null && typeof x === 'object') {
    const o = x as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(x === undefined ? null : x);
}

const sha256 = (x: unknown): string => crypto.createHash('sha256').update(canonicalJson(x), 'utf8').digest('hex');

export interface SeedShas { catalogue_sha: string; switchboard_sha: string }

/** The hashes a step run on this tree would stamp on its rows. */
export const CURRENT_SEED_SHAS: SeedShas = Object.freeze({ catalogue_sha: sha256(catalogue), switchboard_sha: sha256(switchboard) });

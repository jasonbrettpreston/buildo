// SPEC LINK: MB-73 plan sections 2 to 9; R-KQ, R-KU, R-KK. One temp repo that holds a whole promise (a queue row, a
//            declared artifact, a red and a green) so the check can be run for real against a committed state.
import { bindRecord } from '../../../../scripts/analysis/mcbylaws-loop/loop-record.mjs';
import { buildRegister, identityHash } from '../../../../scripts/analysis/mcbylaws-promises/promise-register.mjs';
import { git, readAt } from '../../../../scripts/analysis/mcbylaws/git-util.mjs';
import { makeRepo } from '../mcbylaws-gate/repo-helper';

const QUEUE = '# Q\n- R-ZZ: a promise\n';
const INCREMENTS = '{"schema":"increments-v1","ids":["1","2"]}\n';
const ARTIFACTS = '{"R-ZZ":{"artifact":"src/tests/z.test.ts","test_name":"z holds"}}\n';
const ZTEST = "import { expect, it } from 'vitest';\nimport { z } from '../lib/z.mjs';\nit('z holds', () => { expect(z).toBe(1); });\n";
const ZLIB = 'export const z = 1;\n';
const SCAN = '{"scan_roots":["src/"],"forbidden":["zz-forbidden-name"],"layer_paths":[],"allow_imports":[]}\n';
const POLICY = '{"pending_globs":[],"layer23":[],"protected":[],"literal_scope":[],"literal_exempt":[],"held_dirs":[],"held_limit":12,"worktrees":[],"boot1":{"tasks":[],"exempt_ids":[]},"external_arms":[]}\n';
const ALLOW = '{"numbers":[],"status_words":[],"field_names":[],"baseline":{}}\n';
const ID = 'R-ZZ';
const ARTIFACT = 'src/tests/z.test.ts';
const TEST_NAME = 'z holds';

/** The blob of one path at `rev`. */
const blob = (r: { git(args: string[]): string }, rev: string, path: string) => r.git(['rev-parse', `${rev}:${path}`]);

/**
 * A temp repo holding one promise: committed sources, then the red and green records that bind them.
 * @param {{green?: boolean, red?: boolean, queueTracked?: boolean, scanConfig?: boolean}} [opts]
 * @returns {{r: object, id: string, row: object, entry: object, run: Function, rev: string, base: string,
 *            commit: (msg?: string) => string}} `base` is the first commit: the scan config and the sources.
 */
export function makePromisesRepo(opts: Record<string, boolean> = {}) {
  const { green = true, red = true, queueTracked = true, scanConfig = true } = opts;
  const r = makeRepo();
  if (queueTracked) r.write('.cursor/MCBYLAWS-QUEUE.md', QUEUE);
  r.write('scripts/analysis/mcbylaws-loop/data/increments.json', INCREMENTS);
  r.write('mcbylaws/promises/artifacts.json', ARTIFACTS);
  r.write(ARTIFACT, ZTEST);
  r.write('src/lib/z.mjs', ZLIB);
  if (scanConfig) r.write('mcbylaws/promises/scan-roots.json', SCAN);
  // The base policy and the literal allow list live in the FIRST commit: the CLI reads them at the base ref.
  r.write('mcbylaws/protected-paths.json', POLICY);
  r.write('mcbylaws/literal-allow.json', ALLOW);
  const first = r.commit('promise sources');

  const entry = { artifact: ARTIFACT, test_name: TEST_NAME };
  const built = buildRegister({ cwd: r.dir, rev: first, incIds: ['1', '2'] });
  const rows = built.rows as Array<{ id: string }>;
  const row = rows.find((x) => x.id === ID) ?? { id: ID, file: '.cursor/MCBYLAWS-QUEUE.md', quoted_line: `- ${ID}: a promise` };
  const artifactBlob = blob(r, first, ARTIFACT);
  const zero = '0'.repeat(40);
  if (red) {
    r.write(`mcbylaws/promises/red/${ID}.json`, `${JSON.stringify(bindRecord({
      schema: 'promise-red-v1', id: ID, artifact: ARTIFACT, test_name: TEST_NAME, artifact_blob: artifactBlob,
      commit: zero, run: { passed: 0, failed: 1, skipped: 0, total: 1 },
    }), null, 2)}\n`);
  }
  if (green && red) {
    r.write(`mcbylaws/promises/green/${ID}.json`, `${JSON.stringify(bindRecord({
      schema: 'promise-green-v1', id: ID, artifact: ARTIFACT, test_name: TEST_NAME, artifact_blob: artifactBlob,
      red_of: artifactBlob, identity_sha: identityHash(row, entry),
      inputs: { [ARTIFACT]: artifactBlob, 'src/lib/z.mjs': blob(r, first, 'src/lib/z.mjs') },
      commit: zero, run: { passed: 1, failed: 0, skipped: 0, total: 1 },
    }), null, 2)}\n`);
  }
  // Always something to commit, so `records` returns a real sha even when neither record was written.
  r.write('records.txt', 'records\n');
  const rev = r.commit('promise records');
  const run = () => ({
    ok: true,
    json: { testResults: [{ name: `/x/${ARTIFACT}`, assertionResults: [{ fullName: TEST_NAME, status: 'passed' }] }] },
  });
  return { r, id: ID, row, entry, run, rev, base: first, commit: (msg = 'edit') => r.commit(msg) };
}

export { git, readAt };

// SPEC LINK: docs/specs/01-pipeline/124a_step_standard_policy_appendix.md (R-M — before-image files under
//            docs/reports/golden/<slug>/before-image/); docs/reports/review_followups.md ("Tests write
//            before-image *.jsonl into the real golden tree")
//
// WF3 before-image test leak — the lock. Every vitest file runs src/tests/setup.ts, which installs the
// before-image sandbox (src/tests/helpers/before-image-sandbox.ts). So a test that drives the R-M writer,
// directly or through a runner, against a REAL slug must leave nothing under the repo's before-image
// dirs, while the library's returned repo-relative path still reads back the rows it wrote.
// `fs.lstatSync` is deliberately NOT mapped by the sandbox: it is the probe for the real disk here.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const REPO_ROOT = process.cwd();
// eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS library
const writeLib = require(path.join(REPO_ROOT, 'scripts/lib/step/write.js'));

// A real slug: the one whose before-image files leaked most (142 in the main tree, 2026-10-14).
const SLUG = 'compute_parcel_cost_estimates';
const RUN_AT = new Date('1999-01-01T00:00:00.000Z');

function onRealDisk(rel: string): boolean {
  try {
    fs.lstatSync(path.join(REPO_ROOT, rel));
    return true;
  } catch {
    return false; // ENOENT: the file is not in the working tree
  }
}

const written: string[] = [];
afterEach(() => {
  // A red run writes into the working tree; remove exactly what this file wrote so the lock never leaks itself.
  for (const rel of written.splice(0)) fs.rmSync(path.join(REPO_ROOT, rel), { force: true });
});

describe('WF3 before-image test leak — tests never write into docs/reports/golden/*/before-image', () => {
  it('persistBeforeImageRows on a real slug: nothing on the real disk; the returned path reads back the rows', () => {
    const rows = [{ id: 1, cost_fb_total: 12.5 }, { id: 2, cost_fb_total: null }];
    const result = writeLib.persistBeforeImageRows(rows, 'parcels', SLUG, RUN_AT);
    written.push(result.path);

    expect(result.path, 'the R-M path contract is unchanged').toBe(
      `docs/reports/golden/${SLUG}/before-image/1999-01-01T00-00-00.000Z-parcels.jsonl`,
    );
    expect(onRealDisk(result.path), 'the before-image must not land in the working tree').toBe(false);
    const lines = fs.readFileSync(path.join(REPO_ROOT, result.path), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(lines).toEqual(rows);
  });

  it('writeBeforeImage (the retraction path the runners use) on a real slug: nothing on the real disk', async () => {
    const client = { query: async () => ({ rows: [{ id: 7, cost_fb_total: 1 }] }) };
    const plan = { table: 'parcels', keys: ['id'], step_columns: ['cost_fb_total'], scope: "zoning_class NOT LIKE 'R%'" };
    const result = await writeLib.writeBeforeImage(client, plan, [], SLUG, new Date('1999-01-01T00:00:01.000Z'));
    written.push(result.path);

    expect(result.written).toBe(true);
    expect(onRealDisk(result.path), 'the before-image must not land in the working tree').toBe(false);
    expect(fs.existsSync(path.join(REPO_ROOT, result.path)), 'the returned path still reads back').toBe(true);
  });

  it('the sandbox lives under os.tmpdir() and is not the repo', async () => {
    const { beforeImageSandboxRoot } = await import('./helpers/before-image-sandbox');
    const root = beforeImageSandboxRoot();
    expect(root, 'src/tests/setup.ts installs the sandbox for every test file').not.toBeNull();
    expect(path.resolve(root as string).startsWith(path.resolve(os.tmpdir()))).toBe(true);
  });
});

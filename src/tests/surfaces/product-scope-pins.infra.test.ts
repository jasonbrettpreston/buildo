// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.3 (the MaxBLD pages; spec review R-1 product table,
//            ~/Buildo-scratch/mcfrontend/PROGRAMME/SPEC-REVIEW-mobile-web.md), registry cards S-005 `web_landing` and S-036 `mobile_settings`
//            (docs/reports/generated/127-surface-review-queue.md); .cursor/MCFRONTEND-QUEUE.md MF-43 (the spec review's first unverified lock).
//
// MF-43 · McFrontend queue · lane T. Spec-review lock 1, no FE row (plan D-5). surface-registry.infra.test.ts checks that a descriptor sits under the scope
// the census names, so flipping a scope in the census passes there; this lock pins the two product scopes the spec review named. Descriptors are found by
// a walk of the tracked files (git ls-files), not by the census loader, which lives inline in surface-registry.infra.test.ts (one home, R-27). For each
// pinned id: exactly one descriptor, and its directory segment, its `programme.scope` and the pin agree.
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DESCRIPTOR_ROOT = 'scripts/surfaces';
const SUFFIX = '.descriptor.json';
// Closed: a new pin is a one-line addition with its why.
const PINS: Readonly<Record<string, string>> = {
  web_landing: 'parcel_product', // S-005: the MaxBLD web front door (business requirement 5; spec review R-1).
  mobile_settings: 'platform_shared', // S-036: settings write shared user_profiles columns read by both products (spec review R-1).
};

type DescriptorFile = { path: string; text: string };

function scopePinProblems(files: readonly DescriptorFile[]): string[] {
  const problems: string[] = [];
  if (files.length === 0) return ['no descriptor file found (dead-man: an empty walk never passes)'];
  for (const [id, pin] of Object.entries(PINS)) {
    const hits = files.filter((f) => path.posix.basename(f.path) === `${id}${SUFFIX}`);
    const hit = hits[0];
    if (hits.length !== 1 || !hit) {
      problems.push(`${id}: expected exactly one descriptor, found ${hits.length}`);
      continue;
    }
    const dir = hit.path.split('/')[2];
    if (dir !== pin) problems.push(`${id}: descriptor sits under scope directory "${dir}", pinned "${pin}"`);
    let scope: unknown;
    try {
      scope = (JSON.parse(hit.text) as { programme?: { scope?: unknown } }).programme?.scope;
    } catch {
      problems.push(`${id}: descriptor is not valid JSON`);
      continue;
    }
    if (scope !== pin) problems.push(`${id}: programme.scope is "${String(scope)}", pinned "${pin}"`);
  }
  return problems;
}

function realFiles(): DescriptorFile[] {
  const r = spawnSync('git', ['ls-files', DESCRIPTOR_ROOT], { cwd: ROOT, encoding: 'utf8' });
  expect(r.status).toBe(0);
  return r.stdout
    .split('\n')
    .filter((p) => p.endsWith(SUFFIX))
    .map((p) => ({ path: p, text: fs.readFileSync(path.join(ROOT, p), 'utf8') }));
}

const REAL = realFiles();
const byId = (id: string) => REAL.find((f) => f.path.endsWith(`/${id}${SUFFIX}`))!;

describe('spec-review lock 1: web_landing is parcel_product and mobile_settings is platform_shared', () => {
  it('the real descriptors have no problem', () => {
    expect(scopePinProblems(REAL)).toEqual([]);
  });

  it('examined the descriptor walk (dead-man)', () => {
    expect(REAL.length).toBeGreaterThan(100);
    for (const id of Object.keys(PINS)) expect(byId(id)).toBeTruthy();
  });

  it('planted: web_landing scope flipped to estate_other (a mutated copy of the real text)', () => {
    const real = byId('web_landing');
    const text = real.text.replace('"scope": "parcel_product"', '"scope": "estate_other"');
    expect(text).not.toBe(real.text);
    const files = REAL.map((f) => (f === real ? { ...f, text } : f));
    expect(scopePinProblems(files).join('\n')).toMatch(/web_landing: programme\.scope is "estate_other", pinned "parcel_product"/);
  });

  it('planted: mobile_settings moved under another scope directory', () => {
    const real = byId('mobile_settings');
    const files = REAL.map((f) => (f === real ? { ...f, path: f.path.replace('/platform_shared/', '/parcel_product/') } : f));
    expect(scopePinProblems(files).join('\n')).toMatch(/mobile_settings: descriptor sits under scope directory "parcel_product"/);
  });

  it('planted: a duplicate, a missing id, and an empty walk', () => {
    const real = byId('web_landing');
    const dup = [...REAL, { path: real.path.replace('/parcel_product/', '/estate_other/'), text: real.text }];
    expect(scopePinProblems(dup).join('\n')).toMatch(/web_landing: expected exactly one descriptor, found 2/);
    const missing = REAL.filter((f) => f !== byId('mobile_settings'));
    expect(scopePinProblems(missing).join('\n')).toMatch(/mobile_settings: expected exactly one descriptor, found 0/);
    expect(scopePinProblems([]).join('\n')).toMatch(/no descriptor file found/);
  });

  it('fold: a pinned descriptor that is not valid JSON', () => {
    const real = byId('web_landing');
    const files = REAL.map((f) => (f === real ? { ...f, text: '{' } : f));
    expect(scopePinProblems(files).join('\n')).toMatch(/web_landing: descriptor is not valid JSON/);
  });
});

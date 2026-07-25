/**
 * SPEC LINK: docs/specs/00-architecture/115_scheduling.md §3, §8
 *            docs/specs/00-architecture/113_supabase_infrastructure.md §8
 *
 * WF2 route rewrite (2026-07-25): the admin pipeline route no longer spawns
 * run-chain.js inside the Vercel function — it dispatches a GitHub Actions
 * workflow via src/lib/admin/github-dispatch.ts and the chains run on the runner.
 *
 * These are source-reading + unit tests. They MUST NOT hit a real DB or the real
 * GitHub API — the network-facing tests mock `global.fetch` and manipulate
 * `process.env`, restoring both afterwards.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { dispatchWorkflow, GithubDispatchError } from '@/lib/admin/github-dispatch';

const routePath = path.resolve(
  __dirname,
  '../app/api/admin/pipelines/[slug]/route.ts',
);
const workflowsDir = path.resolve(__dirname, '../../.github/workflows');

/**
 * Extract the route's chain→workflow map (CHAIN_WORKFLOWS) from source, without
 * importing route.ts (which pulls in next/server). Returns [slug, file] pairs.
 */
function extractChainWorkflowMap(): Array<[string, string]> {
  const source = fs.readFileSync(routePath, 'utf-8');
  const blockMatch = source.match(
    /const CHAIN_WORKFLOWS[^=]*=\s*\{([\s\S]*?)\};/,
  );
  expect(blockMatch, 'CHAIN_WORKFLOWS object literal not found in route.ts').toBeTruthy();
  const body = blockMatch![1] ?? '';
  const pairs: Array<[string, string]> = [];
  const entryRe = /(\w+):\s*'([^']+\.yml)'/g;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(body)) !== null) {
    pairs.push([m[1]!, m[2]!]);
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// F8: mapping-existence — every mapped workflow file must actually exist
// ---------------------------------------------------------------------------
describe('Admin pipeline dispatch — chain→workflow mapping', () => {
  it('extracts a non-empty CHAIN_WORKFLOWS map from the route', () => {
    const pairs = extractChainWorkflowMap();
    expect(pairs.length).toBeGreaterThan(0);
  });

  it('F8: every mapped workflow value is a real file in .github/workflows/', () => {
    const pairs = extractChainWorkflowMap();
    for (const [slug, file] of pairs) {
      const wfPath = path.join(workflowsDir, file);
      expect(
        fs.existsSync(wfPath),
        `${slug} → ${file} does not exist in .github/workflows/`,
      ).toBe(true);
    }
  });

  it('every dispatchable slug is chain_* and maps to a .yml workflow', () => {
    const pairs = extractChainWorkflowMap();
    for (const [slug, file] of pairs) {
      expect(slug.startsWith('chain_'), `${slug} is not a chain_* slug`).toBe(true);
      expect(file.endsWith('.yml'), `${slug} → ${file} is not a .yml file`).toBe(true);
    }
  });

  it('exposes the DISPATCHABLE_WORKFLOWS export for downstream tooling', () => {
    const source = fs.readFileSync(routePath, 'utf-8');
    expect(source).toContain('export const DISPATCHABLE_WORKFLOWS');
  });
});

// ---------------------------------------------------------------------------
// github-dispatch.ts config() guards + status→code mapping
// ---------------------------------------------------------------------------
describe('github-dispatch — config() env guards', () => {
  const ENV_KEYS = ['GITHUB_DISPATCH_TOKEN', 'GITHUB_REPO', 'GITHUB_DISPATCH_REF'] as const;
  const saved: Record<string, string | undefined> = {};

  afterEach(() => {
    // Restore env + fetch after every case.
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function snapshotEnv() {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
  }

  it('throws NO_TOKEN when GITHUB_DISPATCH_TOKEN is unset', async () => {
    snapshotEnv();
    delete process.env.GITHUB_DISPATCH_TOKEN;
    process.env.GITHUB_REPO = 'owner/repo';
    // fetch should never be reached — config() throws first.
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(dispatchWorkflow('chain-sources.yml')).rejects.toMatchObject({
      code: 'NO_TOKEN',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws NO_REPO when GITHUB_REPO is malformed', async () => {
    snapshotEnv();
    process.env.GITHUB_DISPATCH_TOKEN = 'ghp_test_token';
    process.env.GITHUB_REPO = 'not-a-valid-repo'; // missing owner/repo slash
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(dispatchWorkflow('chain-sources.yml')).rejects.toMatchObject({
      code: 'NO_REPO',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('github-dispatch — dispatchWorkflow status mapping', () => {
  const ENV_KEYS = ['GITHUB_DISPATCH_TOKEN', 'GITHUB_REPO', 'GITHUB_DISPATCH_REF'] as const;
  const saved: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function withValidConfig() {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    process.env.GITHUB_DISPATCH_TOKEN = 'ghp_test_token';
    process.env.GITHUB_REPO = 'owner/repo';
    process.env.GITHUB_DISPATCH_REF = 'main';
  }

  function mockFetchStatus(status: number) {
    const fetchMock = vi.fn(async () => ({ status }) as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('resolves on 204 (successful dispatch)', async () => {
    withValidConfig();
    mockFetchStatus(204);
    await expect(dispatchWorkflow('chain-sources.yml')).resolves.toBeUndefined();
  });

  it('maps 404 → NOT_FOUND', async () => {
    withValidConfig();
    mockFetchStatus(404);
    await expect(dispatchWorkflow('chain-sources.yml')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
  });

  it('maps 401 → AUTH', async () => {
    withValidConfig();
    mockFetchStatus(401);
    await expect(dispatchWorkflow('chain-sources.yml')).rejects.toMatchObject({
      code: 'AUTH',
      status: 401,
    });
  });

  it('maps 403 → AUTH', async () => {
    withValidConfig();
    mockFetchStatus(403);
    await expect(dispatchWorkflow('chain-sources.yml')).rejects.toMatchObject({
      code: 'AUTH',
      status: 403,
    });
  });

  it('maps other non-204 statuses → DISPATCH_FAILED', async () => {
    withValidConfig();
    mockFetchStatus(500);
    await expect(dispatchWorkflow('chain-sources.yml')).rejects.toMatchObject({
      code: 'DISPATCH_FAILED',
      status: 500,
    });
  });

  it('a thrown error is a GithubDispatchError instance', async () => {
    withValidConfig();
    mockFetchStatus(404);
    const err = await dispatchWorkflow('chain-sources.yml').catch((e) => e);
    expect(err).toBeInstanceOf(GithubDispatchError);
  });
});

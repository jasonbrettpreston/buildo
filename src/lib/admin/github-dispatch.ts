// Bridge from the admin "Run"/"Cancel" controls to GitHub Actions.
//
// SPEC LINK: docs/specs/00-architecture/115_scheduling.md §3, §8
//            docs/specs/00-architecture/113_supabase_infrastructure.md §8
//
// The pipeline chains run on the GitHub Actions runner (Spec 113 §8 / D8) — a
// Vercel serverless function cannot host a 90-min chain (the sandbox is killed
// when the HTTP response returns, which is why the old `spawn` model left
// pipeline_runs rows stuck at 'running'). This module dispatches a workflow and
// cancels its in-flight run via the GitHub REST API. The token is read
// server-side only and is never returned to the client or logged.

const GITHUB_API = 'https://api.github.com';

/** Typed error so the route can map codes to sanitized, actionable messages. */
export class GithubDispatchError extends Error {
  constructor(
    message: string,
    readonly code: 'NO_TOKEN' | 'NO_REPO' | 'NETWORK' | 'AUTH' | 'NOT_FOUND' | 'DISPATCH_FAILED',
    readonly status?: number,
  ) {
    super(message);
    this.name = 'GithubDispatchError';
  }
}

function config(): { token: string; repo: string; ref: string } {
  const token = process.env.GITHUB_DISPATCH_TOKEN?.trim();
  const repo = process.env.GITHUB_REPO?.trim();
  const ref = process.env.GITHUB_DISPATCH_REF?.trim() || 'main';
  if (!token) {
    throw new GithubDispatchError('GITHUB_DISPATCH_TOKEN is not configured', 'NO_TOKEN');
  }
  if (!repo || !/^[^/\s]+\/[^/\s]+$/.test(repo)) {
    throw new GithubDispatchError('GITHUB_REPO is not configured (expected "owner/repo")', 'NO_REPO');
  }
  return { token, repo, ref };
}

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/**
 * Fire a workflow_dispatch. Resolves on 204; throws GithubDispatchError otherwise.
 * The GitHub error body is NOT surfaced (it can echo request detail) — codes are
 * mapped to fixed, sanitized messages.
 */
export async function dispatchWorkflow(workflowFile: string): Promise<void> {
  const { token, repo, ref } = config();
  let res: Response;
  try {
    res = await fetch(
      `${GITHUB_API}/repos/${repo}/actions/workflows/${encodeURIComponent(workflowFile)}/dispatches`,
      {
        method: 'POST',
        headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref }),
      },
    );
  } catch {
    throw new GithubDispatchError('Could not reach GitHub to dispatch the workflow', 'NETWORK');
  }
  if (res.status === 204) return;
  if (res.status === 404) {
    throw new GithubDispatchError(
      `Workflow ${workflowFile} not found on "${ref}" — is it on the default branch?`,
      'NOT_FOUND',
      404,
    );
  }
  if (res.status === 401 || res.status === 403) {
    throw new GithubDispatchError(
      'GitHub rejected the dispatch token (check GITHUB_DISPATCH_TOKEN — needs actions:write)',
      'AUTH',
      res.status,
    );
  }
  throw new GithubDispatchError(
    res.status === 422
      ? `GitHub could not process the dispatch (bad ref "${ref}"?)`
      : `GitHub dispatch failed (HTTP ${res.status})`,
    'DISPATCH_FAILED',
    res.status,
  );
}

/**
 * Best-effort cancel of the workflow's most recent in-progress OR queued run.
 * For the combined coa→permits workflow this cancels the WHOLE run (both chains)
 * — a DB-row-only cancel would leave permits to run after coa is cancelled.
 * Requires the token to also hold actions:read (to list runs).
 */
export async function cancelWorkflowRun(
  workflowFile: string,
): Promise<{ cancelled: boolean; runId?: number }> {
  const { token, repo } = config();
  // GitHub's runs endpoint has no combined status filter — query queued and
  // in_progress separately, then cancel the newest.
  const runs: { id: number; created_at: string }[] = [];
  // 'waiting' covers a run paused on an environment protection rule (approval).
  for (const status of ['in_progress', 'queued', 'waiting']) {
    let res: Response;
    try {
      res = await fetch(
        `${GITHUB_API}/repos/${repo}/actions/workflows/${encodeURIComponent(workflowFile)}/runs?status=${status}&per_page=10`,
        { headers: ghHeaders(token) },
      );
    } catch {
      throw new GithubDispatchError('Could not reach GitHub to list workflow runs', 'NETWORK');
    }
    if (res.status === 401 || res.status === 403) {
      throw new GithubDispatchError(
        'GitHub rejected the token (cancel needs actions:read + actions:write)',
        'AUTH',
        res.status,
      );
    }
    if (!res.ok) continue;
    const body = (await res.json()) as { workflow_runs?: { id: number; created_at: string }[] };
    runs.push(...(body.workflow_runs ?? []));
  }
  if (runs.length === 0) return { cancelled: false };
  // ISO timestamps sort lexicographically; newest first.
  runs.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const runId = runs[0]!.id;
  let res: Response;
  try {
    res = await fetch(`${GITHUB_API}/repos/${repo}/actions/runs/${runId}/cancel`, {
      method: 'POST',
      headers: ghHeaders(token),
    });
  } catch {
    throw new GithubDispatchError('Could not reach GitHub to cancel the run', 'NETWORK');
  }
  if (res.status === 401 || res.status === 403) {
    // Surface a real permission failure rather than silently reporting "not cancelled"
    // (symmetry with the run-listing call above).
    throw new GithubDispatchError(
      'GitHub rejected the token when cancelling (needs actions:read + actions:write)',
      'AUTH',
      res.status,
    );
  }
  // 202 Accepted on success; 409 = already finishing (treat as cancelled).
  return { cancelled: res.status === 202 || res.status === 409, runId };
}

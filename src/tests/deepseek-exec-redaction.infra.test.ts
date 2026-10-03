// SPEC LINK: docs/specs/00-architecture/08_agents.md §C.1.5
// WF3 engine-redaction (L17, 2026-10-03).
//
// MEASURED defect (2026-10-03, twice): the engine wrote the literal text
// `[REDACTED]` into source files — the L11 test-DB-guard seat's password
// literals (`s3cretpw`, `buildo:buildo`, `postgres:x`) and the PostGIS-pin
// seat's `postgres:[REDACTED]@` / `const TEST_DB_PASSWORD = '[REDACTED]'`.
// Cause: every model-facing string (system prompt incl. the brief, every
// tool result, the model's own re-fed tool-call args) went through the
// LEDGER's shape-based redact() — `postgres://u:<pw>@` and
// `password=<8+ chars>` were masked whether or not the value was a real
// secret, so the model saw `[REDACTED]` and copied the mask into its edits.
//
// Locks:
//   R1  password-LOOKING literals that are not the value of a real secret
//       reach the model verbatim (read_file, run-bash output, the brief).
//   R2  REAL secrets stay masked in the model view: a sensitive env var's
//       value, a DB URL's password component, a .env-file secret value, and
//       the vendor token shapes (sk-/AIza/gh*_); .env stays unreadable.
//   R3  backstop — write_file/edit_file whose result would contain MORE
//       `[REDACTED]` than the file already had is refused (REDACTION_LEAK).
//   R4  the ledger (never shown to the model) keeps its shape-based redaction.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  makeRepo, REPO_ROOT, runEngine, toolTurn, stopTurn, writeBrief, ledgerRecords, cleanupTempDir, type Turn,
} from './helpers/deepseek-exec-harness';

function capturingClient(turns: Turn[]) {
  const seen: unknown[][] = [];
  let i = 0;
  return {
    seen,
    client: {
      async next(messages: unknown[]) {
        seen.push(JSON.parse(JSON.stringify(messages)));
        const t = turns[i];
        i += 1;
        return t ?? stopTurn();
      },
    },
  };
}

type Msg = { role?: string; content?: string | null };
function toolMessages(history: unknown[]): string[] {
  return (history as Msg[]).filter((m) => m.role === 'tool').map((m) => String(m.content));
}
function decodedToolContent(history: unknown[]): string {
  // tool messages are JSON.stringify(toolResult); parse so string escapes
  // (quotes inside file content) compare as the model reads them.
  return toolMessages(history).map((c) => JSON.stringify(JSON.parse(c))).join('\n')
    + '\n' + toolMessages(history).map((c) => {
      const parsed = JSON.parse(c) as { content?: string; stdout?: string };
      return `${parsed.content ?? ''}\n${parsed.stdout ?? ''}`;
    }).join('\n');
}

const SAVED_ENV: Record<string, string | undefined> = {};
const ENV_KEYS = ['DEEPSEEK_API_KEY', 'DATABASE_URL', 'SUPABASE_DATABASE_URL', 'ACME_SERVICE_TOKEN'];

describe('L17 engine redaction — model view masks real secrets only, never password-looking literals', () => {
  let repo = '';
  let ledgerDir = '';

  beforeEach(() => {
    for (const k of ENV_KEYS) { SAVED_ENV[k] = process.env[k]; delete process.env[k]; }
    repo = makeRepo();
    ledgerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepseek-exec-redaction-ledger-'));
  });
  afterEach(() => {
    for (const k of ENV_KEYS) { if (SAVED_ENV[k] === undefined) delete process.env[k]; else process.env[k] = SAVED_ENV[k]; }
    cleanupTempDir(repo);
    cleanupTempDir(ledgerDir);
  });

  const FIXTURE = [
    "const URL = 'postgres://u:testpw@127.0.0.1:5432/db';",
    "const P = 'hunter2';",
    "const password = 's3cretpw';",
    "const LEGACY = 'postgresql://buildo:buildo@localhost:5432/buildo';",
    "const X = 'postgres://postgres:x@localhost/db';",
    '',
  ].join('\n');

  it('R1: read_file of a fixture with fake credentials shows every literal verbatim (no [REDACTED])', async () => {
    fs.writeFileSync(path.join(repo, 'fixture.ts'), FIXTURE);
    const { seen, client } = capturingClient([toolTurn('c1', 'read_file', { path: 'fixture.ts', reason: 'r' }), stopTurn()]);
    await runEngine({ repoRoot: repo, briefPath: writeBrief(repo), provider: 'deepseek', ledgerDir, modelClient: client });
    const shown = decodedToolContent(seen[1] ?? []);
    expect(shown).toContain('postgres://u:testpw@127.0.0.1:5432/db');
    expect(shown).toContain("const P = 'hunter2';");
    expect(shown).toContain("const password = 's3cretpw';");
    expect(shown).toContain('postgresql://buildo:buildo@localhost:5432/buildo');
    expect(shown).toContain('postgres://postgres:x@localhost/db');
    expect(shown).not.toContain('[REDACTED]');
  });

  it('R1: a brief carrying a fake DB URL reaches the model verbatim in the system prompt', async () => {
    const briefPath = writeBrief(repo);
    fs.appendFileSync(briefPath, 'Use TEST_URL=postgres://postgres:x@127.0.0.1:55432/test and password: devpass123 in the fixture.\n');
    const { seen, client } = capturingClient([stopTurn()]);
    await runEngine({ repoRoot: repo, briefPath, provider: 'deepseek', ledgerDir, modelClient: client });
    const system = (seen[0] as Msg[]).find((m) => m.role === 'system');
    expect(system?.content).toContain('postgres://postgres:x@127.0.0.1:55432/test');
    expect(system?.content).toContain('password: devpass123');
  });

  it('R1: the model\'s own re-fed tool-call args keep a fake literal verbatim (no mask to copy from history)', async () => {
    const { seen, client } = capturingClient([
      toolTurn('c1', 'write_file', { path: 'fx.ts', content: "const password = 's3cretpw';\n", reason: 'r' }),
      stopTurn(),
    ]);
    await runEngine({ repoRoot: repo, briefPath: writeBrief(repo), provider: 'deepseek', ledgerDir, modelClient: client });
    const assistant = JSON.stringify((seen[1] as Msg[]).filter((m) => m.role === 'assistant'));
    expect(assistant).toContain('s3cretpw');
    expect(assistant).not.toContain('[REDACTED]');
  });

  it('R2 control: a REAL secret (sensitive env var value, DB URL password, DEEPSEEK_API_KEY) is still masked in the model view', async () => {
    process.env.SUPABASE_DATABASE_URL = 'postgresql://svc.ref:R3alPoolerPassw0rd@pooler.example:6543/postgres';
    process.env.ACME_SERVICE_TOKEN = 'acme_tok_ZZZZ1111YYYY2222';
    process.env.DEEPSEEK_API_KEY = 'dskey-livekeylivekey123';
    fs.writeFileSync(path.join(repo, 'leaky.txt'), [
      'pooler=postgresql://svc.ref:R3alPoolerPassw0rd@pooler.example:6543/postgres',
      'bare=R3alPoolerPassw0rd',
      'tok=acme_tok_ZZZZ1111YYYY2222',
      'ds=dskey-livekeylivekey123',
      'vendor=sk-abcdefghijklmnopqrstuvwx',
      'fake=postgres://u:testpw@127.0.0.1:5432/db',
      '',
    ].join('\n'));
    const { seen, client } = capturingClient([toolTurn('c1', 'read_file', { path: 'leaky.txt', reason: 'r' }), stopTurn()]);
    await runEngine({ repoRoot: repo, briefPath: writeBrief(repo), provider: 'deepseek', ledgerDir, modelClient: client });
    const shown = decodedToolContent(seen[1] ?? []);
    expect(shown).not.toContain('R3alPoolerPassw0rd');
    expect(shown).not.toContain('acme_tok_ZZZZ1111YYYY2222');
    expect(shown).not.toContain('livekeylivekey');
    expect(shown).not.toContain('sk-abcdefghijklmnopqrstuvwx');
    expect(shown).toContain('[REDACTED]');
    // the fake literal in the same file is untouched
    expect(shown).toContain('postgres://u:testpw@127.0.0.1:5432/db');
  });

  it('R2 control: a secret value defined only in the repo .env is masked in the model view, and .env itself stays SECRET_DENIED', async () => {
    fs.writeFileSync(path.join(repo, '.env'), 'PG_HOST=localhost\nBACKUP_S3_SECRET_ACCESS_KEY=envOnlySecretValue987\n');
    fs.writeFileSync(path.join(repo, 'echo.txt'), 'leaked envOnlySecretValue987 here; host localhost\n');
    const { seen, client } = capturingClient([
      toolTurn('c1', 'read_file', { path: 'echo.txt', reason: 'r' }),
      toolTurn('c2', 'read_file', { path: '.env', reason: 'r' }),
      stopTurn(),
    ]);
    await runEngine({ repoRoot: repo, briefPath: writeBrief(repo), provider: 'deepseek', ledgerDir, modelClient: client });
    const shown = decodedToolContent(seen[2] ?? []);
    expect(shown).not.toContain('envOnlySecretValue987');
    expect(shown).toContain('host localhost'); // a non-sensitive .env value is not a mask target
    expect(shown).toContain('SECRET_DENIED');
  });

  it('R4 control: the LEDGER (never model-facing) still shape-redacts a password-looking literal', async () => {
    const res = await runEngine({
      repoRoot: repo, briefPath: writeBrief(repo), provider: 'deepseek', ledgerDir,
      transcriptTurns: [
        { message: { role: 'assistant', content: 'url postgres://u:testpw@127.0.0.1:5432/db', tool_calls: [] }, usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }, finish_reason: 'stop' },
      ],
    });
    const raw = JSON.stringify(ledgerRecords(ledgerDir, res.run_id));
    expect(raw).not.toContain('testpw');
    expect(raw).toContain('[REDACTED]');
  });
});

describe('L17 backstop — a write that introduces [REDACTED] is refused (REDACTION_LEAK)', () => {
  let repo = '';
  let ledgerDir = '';
  beforeEach(() => {
    repo = makeRepo();
    ledgerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepseek-exec-redaction-bs-'));
  });
  afterEach(() => {
    cleanupTempDir(repo);
    cleanupTempDir(ledgerDir);
  });

  function tools() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercising the real CJS tool layer directly
    const { createTools } = require(path.join(REPO_ROOT, 'scripts/lib/exec-tools.js'));
    const policy = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/lib/exec-policy.json'), 'utf8'));
    const fakeLedger = { path: path.join(ledgerDir, 'bs.jsonl'), append: () => {}, close: () => {} };
    return createTools({ repoRoot: repo, policy, ledger: fakeLedger, runState: { readState: {} }, writeScope: ['**'] });
  }

  it('write_file creating a file whose content contains [REDACTED] is refused and nothing lands', async () => {
    const t = tools();
    const out = await t.dispatch('write_file', { path: 'new.ts', content: "const TEST_DB_PASSWORD = '[REDACTED]';\n", reason: 'r' });
    expect(out.toolResult).toMatchObject({ ok: false, error: { code: 'REDACTION_LEAK' } });
    expect(fs.existsSync(path.join(repo, 'new.ts'))).toBe(false);
  });

  it('edit_file whose new_string introduces [REDACTED] is refused and the file is unchanged', async () => {
    const t = tools();
    fs.writeFileSync(path.join(repo, 'a.ts'), "const URL = 'postgres://postgres:x@localhost/db';\n");
    await t.dispatch('read_file', { path: 'a.ts', reason: 'r' });
    const out = await t.dispatch('edit_file', { path: 'a.ts', old_string: 'postgres:x@', new_string: 'postgres:[REDACTED]@', reason: 'r' });
    expect(out.toolResult).toMatchObject({ ok: false, error: { code: 'REDACTION_LEAK' } });
    expect(fs.readFileSync(path.join(repo, 'a.ts'), 'utf8')).toContain('postgres:x@');
  });

  it('control: an edit to a file that ALREADY contains [REDACTED] (count not increased) is allowed', async () => {
    const t = tools();
    fs.writeFileSync(path.join(repo, 'b.ts'), "expect(out).toBe('[REDACTED]');\nconst n = 1;\n");
    await t.dispatch('read_file', { path: 'b.ts', reason: 'r' });
    const out = await t.dispatch('edit_file', { path: 'b.ts', old_string: 'const n = 1;', new_string: 'const n = 2;', reason: 'r' });
    expect(out.toolResult.ok).toBe(true);
  });

  it('control: an ordinary write with a fake password literal lands verbatim', async () => {
    const t = tools();
    const out = await t.dispatch('write_file', { path: 'ok.ts', content: "const password = 's3cretpw';\n", reason: 'r' });
    expect(out.toolResult.ok).toBe(true);
    expect(fs.readFileSync(path.join(repo, 'ok.ts'), 'utf8')).toContain('s3cretpw');
  });
});

// ---------------------------------------------------------------------------
// L17 round 2 (Regression Guardian follow-ups, 2026-10-03).
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS redactors
const ledgerLib = require(path.join(REPO_ROOT, 'scripts/lib/exec-ledger.js')) as {
  redact: (s: string) => string;
  redactForModel: (s: string) => string;
  registerSecretsFromEnvFiles: (dirs: string[]) => string[];
};
// eslint-disable-next-line @typescript-eslint/no-require-imports -- the real CJS engine
const engineLib = require(path.join(REPO_ROOT, 'scripts/deepseek-exec.js')) as {
  worktreeDirsFromPorcelain?: (text: string) => string[];
  secretEnvDirs?: (repoRoot: string) => string[];
};

describe('L17 round 2 — redactor unit pins', () => {
  const KEYS = ['PG_USER', 'PG_PASSWORD', 'ALT_DATABASE_URL', 'LONG_SECRET', 'MIXED_TOKEN'];
  const saved: Record<string, string | undefined> = {};
  let tmp = '';
  beforeEach(() => {
    for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'deepseek-exec-redaction-r2-'));
  });
  afterEach(() => {
    for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    cleanupTempDir(tmp);
  });

  it('item 1: the LEDGER does not value-mask a dev user==password word; its PATTERN masking stays', () => {
    process.env.PG_USER = 'postgres';
    process.env.PG_PASSWORD = 'postgres';
    expect(ledgerLib.redact('psql -U postgres')).toBe('psql -U postgres');
    expect(ledgerLib.redact('psql -U postgres -d postgres_db host=postgres')).toBe('psql -U postgres -d postgres_db host=postgres');
    expect(ledgerLib.redact('postgres://postgres:postgres@127.0.0.1/x')).toBe('postgres://postgres:[REDACTED]@127.0.0.1/x');
  });

  it('3a: two-way pin — a fake URL password is shown to the model but masked in the ledger', () => {
    expect(ledgerLib.redactForModel('postgres://u:fakepw@h/d')).toBe('postgres://u:fakepw@h/d');
    expect(ledgerLib.redact('postgres://u:fakepw@h/d')).toBe('postgres://u:[REDACTED]@h/d');
  });

  it('3b: a real URL from env and from a temp .env (percent-encoded password): whole URL and :pw@ position both masked', () => {
    process.env.ALT_DATABASE_URL = 'postgresql://svc:Env0nlyPw123@db.example:5432/d';
    expect(ledgerLib.redactForModel('x postgresql://svc:Env0nlyPw123@db.example:5432/d y')).toBe('x [REDACTED] y');
    expect(ledgerLib.redactForModel('postgresql://other:Env0nlyPw123@elsewhere/z')).toBe('postgresql://other:[REDACTED]@elsewhere/z');

    const cloud = 'postgresql://postgres.abcref:p%40ssW0rd%2FXyz@aws-0-ca.pooler.supabase.com:6543/postgres';
    fs.writeFileSync(path.join(tmp, '.env'), `SUPABASE_DATABASE_URL="${cloud}"\n`);
    expect(ledgerLib.registerSecretsFromEnvFiles([tmp]).length).toBe(1);
    expect(ledgerLib.redactForModel(`url=${cloud}`)).toBe('url=[REDACTED]');
    expect(ledgerLib.redactForModel('postgresql://u2:p%40ssW0rd%2FXyz@h/d')).toBe('postgresql://u2:[REDACTED]@h/d');
    expect(ledgerLib.redactForModel('decoded p@ssW0rd/Xyz here')).not.toContain('p@ssW0rd/Xyz');
  });

  it('3c: exceptions pinned — a dev user==password word is shown; a >=16-char lowercase or mixed-case secret is still masked', () => {
    process.env.PG_USER = 'postgres';
    process.env.PG_PASSWORD = 'postgres';
    process.env.LONG_SECRET = 'abcdefghijklmnopq';
    process.env.MIXED_TOKEN = 'Postgres';
    expect(ledgerLib.redactForModel('postgres')).toBe('postgres');
    expect(ledgerLib.redactForModel('v=abcdefghijklmnopq')).toBe('v=[REDACTED]');
    expect(ledgerLib.redactForModel('v=Postgres')).toBe('v=[REDACTED]');
  });
});

describe('L17 round 2 — item 2: .env files of EVERY git worktree are registered', () => {
  it('worktreeDirsFromPorcelain parses every `worktree <path>` line (bare entries included as dirs)', () => {
    expect(typeof engineLib.worktreeDirsFromPorcelain).toBe('function');
    const porcelain = [
      'worktree C:/Users/User/Buildo', 'HEAD abc', 'branch refs/heads/main', '',
      'worktree C:/Users/User/Buildo-wt-one', 'HEAD def', 'branch refs/heads/x', '',
      'worktree C:/Users/User/Buildo-wt-two', 'HEAD 123', 'detached', '',
    ].join('\n');
    expect(engineLib.worktreeDirsFromPorcelain!(porcelain)).toEqual([
      'C:/Users/User/Buildo', 'C:/Users/User/Buildo-wt-one', 'C:/Users/User/Buildo-wt-two',
    ]);
    expect(engineLib.worktreeDirsFromPorcelain!('')).toEqual([]);
  });

  it('secretEnvDirs(repo) includes the repo itself (de-duplicated) on a plain throwaway repo', () => {
    expect(typeof engineLib.secretEnvDirs).toBe('function');
    const repo = makeRepo();
    try {
      const dirs = engineLib.secretEnvDirs!(repo).map((d) => fs.realpathSync.native(d).toLowerCase());
      const self = fs.realpathSync.native(repo).toLowerCase();
      expect(dirs.filter((d) => d === self).length).toBe(1);
    } finally {
      cleanupTempDir(repo);
    }
  });
});

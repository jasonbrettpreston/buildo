/**
 * SPEC LINK: docs/specs/00-architecture/08_agents.md §A, §B, §3
 *
 * Locks Spec 08's Substrate Reality Mapping (§A), Substrate Toggle Contract (§B),
 * and the roster's Substrate / Tools-required / Seat-id vocabulary (§3) against
 * drift. Each arm (T1-T8) is proven RED against a tampered tmp fixture written to
 * disk AND re-read via fs (mirrors src/tests/spec-split.infra.test.ts's pattern of
 * never trusting only in-process exports) AND GREEN against the real committed
 * tree.
 *
 * Honest limitations: T6 is a static source guard, not a runtime sandbox. T7
 * locks the documented CONTRACT TEXT AND RUNTIME (SUB-ENG-1 commit 12 — the
 * engine now exists, Phases 1-3 landed; the honest upgrade this docblock
 * used to promise as future work is delivered here): the contract-text arm
 * still checks §B's prose, and a new runtime arm spawns the REAL
 * `scripts/deepseek-exec.js` CLI and asserts the fallback actually fires —
 * an unrecognised/absent provider resolves to `claude`, never a throw-and-
 * halt, exactly as §B promises.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { execFileSync, spawnSync } from 'child_process';
import {
  makeRepo, scrubbedChildEnv, writeBrief,
} from './helpers/deepseek-exec-harness';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SPEC_PATH = path.join(REPO_ROOT, 'docs/specs/00-architecture/08_agents.md');
const PART_B_PLAN_PATH = path.join(REPO_ROOT, '.cursor/wf1_deepseek_execution_engine_active_task.md');
const DEEPSEEK_CLI_PATH = path.join(REPO_ROOT, 'scripts/deepseek-review.js');
const GEMINI_CLI_PATH = path.join(REPO_ROOT, 'scripts/gemini-review.js');
const AGENTS_DIR = path.join(REPO_ROOT, '.claude/agents');

const HARNESS_SEATS = new Set(['general-purpose', 'frontend-design', '/security-review', 'Workflow']);
const SUBSTRATE_VALUES = new Set(['Gemini CLI', 'DeepSeek CLI', 'DeepSeek CLI + Claude grounder', 'Claude']);
const TOOLS_VALUES = new Set(['no', 'yes (tree)', 'yes (tree+DB)', 'yes (tree+git)']);

const PINNED_DIGESTS = {
  s4: 'b19452949121b4de0bb8917a96ab79e9c2f2fdd694cb7a6e6f81985069a9c116',
  s52: '8def49b07a6e528fc08d0f64f8534f63a09f3c798c1c8ba16bbbf34672d47137',
  s7b: '6750358561952fa0fd033bde7fc60d8695e903cf41e073e32b4d67a7b6eed55c',
};

function mkTmpFile(name: string, content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-roster-fixture-'));
  const p = path.join(dir, name);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

function readTmp(p: string): string {
  return fs.readFileSync(p, 'utf8');
}

// ---------------------------------------------------------------------------
// §3 roster table parsing
// ---------------------------------------------------------------------------
interface RosterRow {
  id: string;
  substrate: string | null;
  tools: string | null;
  seatIds: string[];
}

function extractSection(text: string, startHeading: string, endsAt: (line: string) => boolean): string {
  const lines = text.split('\n');
  const startIdx = lines.findIndex((l) => l.trim() === startHeading);
  if (startIdx === -1) throw new Error(`heading not found: ${startHeading}`);
  const out: string[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (i > startIdx && endsAt(line)) break;
    out.push(line);
  }
  return out.join('\n');
}

function parseRosterTable(text: string): RosterRow[] {
  const rosterSection = extractSection(
    text,
    '## 3. The roster',
    (l) => l.trim().startsWith('## 4. The doctrine layer'),
  );
  const rows: RosterRow[] = [];
  for (const line of rosterSection.split('\n')) {
    const m = /^\|\s*(A\d+)\s*\|(.*)\|\s*$/.exec(line.trim());
    if (!m) continue;
    const cells = (m[2] ?? '').split('|').map((c) => c.trim());
    if (cells.length < 4) continue;
    const substrateCell = cells[2] ?? '';
    const toolsCell = cells[3] ?? '';
    const seatCell = cells[4] ?? '';
    const substrateMatch = /`([^`]+)`/.exec(substrateCell);
    const seatIds = [...seatCell.matchAll(/`([^`]+)`/g)].map((mm) => mm[1] ?? '');
    rows.push({ id: m[1] ?? '', substrate: substrateMatch ? (substrateMatch[1] ?? null) : null, tools: toolsCell || null, seatIds });
  }
  return rows;
}

function checkT1(rows: RosterRow[]): string[] {
  const errors: string[] = [];
  const ids = new Set(rows.map((r) => r.id));
  for (let i = 1; i <= 14; i++) {
    if (!ids.has(`A${i}`)) errors.push(`missing row A${i}`);
  }
  for (const r of rows) {
    if (!r.substrate || !SUBSTRATE_VALUES.has(r.substrate)) errors.push(`${r.id}: substrate not closed-vocab: ${JSON.stringify(r.substrate)}`);
    if (!r.tools || !TOOLS_VALUES.has(r.tools)) errors.push(`${r.id}: tools-required not closed-vocab: ${JSON.stringify(r.tools)}`);
  }
  return errors;
}

function checkT2(rows: RosterRow[]): string[] {
  const errors: string[] = [];
  for (const r of rows) {
    if (r.tools && r.tools.startsWith('yes') && (r.substrate === 'Gemini CLI' || r.substrate === 'DeepSeek CLI')) {
      errors.push(`${r.id}: tool-required (${r.tools}) routed to tool-less substrate ${r.substrate}`);
    }
  }
  return errors;
}

function loadProjectSeats(agentsDir: string): Map<string, { hasModel: boolean; hasBash: boolean }> {
  const map = new Map<string, { hasModel: boolean; hasBash: boolean }>();
  if (!fs.existsSync(agentsDir)) return map;
  for (const f of fs.readdirSync(agentsDir)) {
    if (!f.endsWith('.md')) continue;
    const seatId = f.replace(/\.md$/, '');
    const content = fs.readFileSync(path.join(agentsDir, f), 'utf8');
    const hasModel = /^model:\s*\S+/m.test(content);
    const toolsLine = /^tools:\s*(.+)$/m.exec(content);
    const hasBash = !!toolsLine && /\bBash\b/.test(toolsLine[1] ?? '');
    map.set(seatId, { hasModel, hasBash });
  }
  return map;
}

function checkT4(rows: RosterRow[], projectSeats: Map<string, { hasModel: boolean; hasBash: boolean }>): string[] {
  const errors: string[] = [];
  for (const r of rows) {
    if (r.seatIds.length === 0) {
      if (r.tools !== 'no') errors.push(`${r.id}: no seat id but tools-required=${r.tools}`);
      continue;
    }
    for (const seat of r.seatIds) {
      if (HARNESS_SEATS.has(seat)) continue;
      if (projectSeats.has(seat)) {
        const info = projectSeats.get(seat)!;
        if (!info.hasModel) errors.push(`${r.id}: seat ${seat} missing model: frontmatter`);
        if (!info.hasBash) errors.push(`${r.id}: seat ${seat} tools: missing Bash`);
        continue;
      }
      errors.push(`${r.id}: seat id "${seat}" in neither PROJECT_SEATS nor HARNESS_SEATS`);
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// §A STATUS table parsing (T3)
// ---------------------------------------------------------------------------
interface StatusRow {
  name: string;
  status: 'live' | 'PLANNED' | 'OTHER';
  trackedId: string | null;
}

function parseStatusTable(text: string): StatusRow[] {
  const section = extractSection(
    text,
    '## A. Substrate Reality Mapping',
    (l) => l.trim().startsWith('## B. Substrate Toggle Contract'),
  );
  const rows: StatusRow[] = [];
  for (const line of section.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('| **')) continue;
    const cells = t.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 2) continue;
    const nameCell = cells[0] ?? '';
    const statusCell = cells[cells.length - 1] ?? '';
    let status: StatusRow['status'] = 'OTHER';
    if (/`live`/.test(statusCell)) status = 'live';
    else if (/PLANNED/.test(statusCell)) status = 'PLANNED';
    const idMatch = /\b(SUB-ENG-\d+)\b/.exec(statusCell);
    rows.push({ name: nameCell, status, trackedId: idMatch ? (idMatch[1] ?? null) : null });
  }
  return rows;
}

function checkT3(statusRows: StatusRow[], partBPlanText: string): string[] {
  const errors: string[] = [];
  if (statusRows.length === 0) errors.push('§A STATUS table: no rows parsed');
  for (const r of statusRows) {
    if (r.status === 'OTHER') errors.push(`${r.name}: STATUS not in {live, PLANNED}`);
    if (r.status === 'PLANNED') {
      if (!r.trackedId) errors.push(`${r.name}: PLANNED row with no tracked id`);
      else if (!partBPlanText.includes(r.trackedId)) errors.push(`${r.name}: tracked id ${r.trackedId} not found in Part-B plan`);
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// T5 — verbatim preservation
// ---------------------------------------------------------------------------
function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function checkT5(text: string): { errors: string[]; digests: { s4: string; s52: string; s7b: string } } {
  const errors: string[] = [];
  const s4 = extractSection(
    text,
    '## 4. The doctrine layer — the Operating Manual (mandatory; summarized here)',
    (l) => l.trim() === '---',
  );
  const s52 = extractSection(
    text,
    '### 5.2 Ground-truth (reality → spec)',
    (l) => l.trim().startsWith('### 5.3'),
  );
  const s7b = extractSection(
    text,
    '## 7b. Effectiveness scoreboard — MAINTAINED BY THE ROSTER MANAGER (A14, §5.9)',
    (l) => l.trim() === '---',
  );
  // sha256sum-over-a-file semantics: the pinned digests were computed via
  // `sed -n '<range>p' file | sha256sum`, which includes a trailing newline
  // after the last captured line — replicate that exactly.
  const digests = { s4: sha256(`${s4}\n`), s52: sha256(`${s52}\n`), s7b: sha256(`${s7b}\n`) };
  if (digests.s4 !== PINNED_DIGESTS.s4) errors.push('§4 Operating Manual block digest mismatch');
  if (digests.s52 !== PINNED_DIGESTS.s52) errors.push('§5.2 Ground-truth block digest mismatch');
  if (digests.s7b !== PINNED_DIGESTS.s7b) errors.push('§7b scoreboard block digest mismatch');
  return { errors, digests };
}

// ---------------------------------------------------------------------------
// T6 — CLIs stay read-only
// ---------------------------------------------------------------------------
// SUB-ENG-1 commit 12 (review_followups 2026-09-22): the previous pattern's
// bare `exec\(` alternative false-positived on `regex.exec(line)` / a
// `.exec(str)` call — a plain RegExp match, not a write. Tightened to the
// actual write-capable surfaces: `fs.write*`/`fs.promises.write*` and the
// sibling mutating fs.* methods, `child_process` as a whole word (the module
// name, not a substring), `execSync(` and `spawn(`/`spawnSync(` specifically
// — never a bare `exec(`.
const WRITE_PATTERN = /\bfs\.(promises\.)?(write|append|rm|unlink|mkdir|rename|truncate)\w*\s*\(|\bchild_process\b|\bexecSync\s*\(|\bspawn(Sync)?\s*\(/;
function checkT6(cliSource: string): string[] {
  return WRITE_PATTERN.test(cliSource) ? ['write-capable pattern found in CLI source'] : [];
}

// ---------------------------------------------------------------------------
// T7 — §B fallback doctrine (contract text)
// ---------------------------------------------------------------------------
function checkT7(text: string): string[] {
  const errors: string[] = [];
  const bText = extractSection(text, '## B. Substrate Toggle Contract', (l) => l.trim().startsWith('## 3. The roster'));
  const enumMatch = /EXECUTION_PROVIDER=([a-z|]+)/.exec(bText);
  if (!enumMatch || enumMatch[1] !== 'deepseek|claude') errors.push('enum not exactly deepseek|claude');
  if (!/the default is \*\*`claude`\*\*/.test(bText)) errors.push('default-claude clause missing');
  if (!/resolves to `claude` and logs the downgrade/.test(bText)) errors.push('fallback-resolves-and-logs clause missing');
  if (!/`deepseek` is \*\*inert until SUB-ENG-1 ships\*\*/.test(bText)) errors.push('deepseek-inert-with-tracked-id clause missing');
  return errors;
}

// ---------------------------------------------------------------------------
// T8 — stale tool-less agent types, scoped
// ---------------------------------------------------------------------------
const STALE_PATTERN = /feature-dev:(code-reviewer|code-explorer|code-architect)/;
function walkMd(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkMd(p));
    else if (entry.name.endsWith('.md')) out.push(p);
  }
  return out;
}

function liveProtocolFiles(repoRoot: string): string[] {
  return [
    path.join(repoRoot, 'CLAUDE.md'),
    path.join(repoRoot, 'scripts/CLAUDE.md'),
    path.join(repoRoot, '.claude/workflows.md'),
    ...walkMd(path.join(repoRoot, 'docs/specs')),
  ];
}

function checkT8(files: { path: string; content: string }[]): string[] {
  const errors: string[] = [];
  for (const f of files) {
    if (STALE_PATTERN.test(f.content)) errors.push(`stale feature-dev ref in ${f.path}`);
  }
  return errors;
}

// ---------------------------------------------------------------------------
// T9 — workflow-seat drift (SUB-ENG-1 commit 12, review_followups 2026-09-22)
// ---------------------------------------------------------------------------
const SUBAGENT_TYPE_RE = /subagent_type:\s*["'`]([^"'`]+)["'`]/g;
function extractSubagentTypes(content: string): string[] {
  return [...content.matchAll(SUBAGENT_TYPE_RE)].map((m) => m[1] ?? '');
}

function checkT9(files: { path: string; content: string }[], projectSeats: Map<string, { hasModel: boolean; hasBash: boolean }>): string[] {
  const errors: string[] = [];
  for (const f of files) {
    for (const seat of extractSubagentTypes(f.content)) {
      if (HARNESS_SEATS.has(seat) || projectSeats.has(seat)) continue;
      errors.push(`${f.path}: subagent_type "${seat}" in neither PROJECT_SEATS nor HARNESS_SEATS`);
    }
  }
  return errors;
}

const lf = (s: string): string => s.replace(/\r\n/g, '\n');

// ===========================================================================
describe('agent-roster.infra.test.ts — Spec 08 §A/§B/§3 substrate locks', () => {
  // LF-normalized (the repo's spec files are CRLF; pinned T5 digests were computed
  // LF-normalized, mirroring src/tests/spec-split.infra.test.ts's own convention).
  const specText = lf(fs.readFileSync(SPEC_PATH, 'utf8'));

  describe('T1 — roster vocabulary is closed', () => {
    it('GREEN: every A1-A14 row has a closed substrate + tools-required value', () => {
      expect(checkT1(parseRosterTable(specText))).toEqual([]);
    });
    it('RED: A11 substrate blanked', () => {
      const mutated = specText.replace(
        '| A11 | **User-Advocate (UX)** | "Does this serve the human on the other end?" (journey, states, a11y, honest copy) | `Claude` | no | `general-purpose` / `frontend-design` |',
        '| A11 | **User-Advocate (UX)** | "Does this serve the human on the other end?" (journey, states, a11y, honest copy) |  | no | `general-purpose` / `frontend-design` |',
      );
      const p = mkTmpFile('t1-a.md', mutated);
      const errs = checkT1(parseRosterTable(readTmp(p)));
      expect(errs.some((e) => e.includes('A11'))).toBe(true);
    });
    it('RED: A10 set to free text', () => {
      const mutated = specText.replace(
        '| A10 | **Compliance** | "Does the code SATISFY every clause of the spec\'s Behavioral Contract + Auth Matrix?" | `DeepSeek CLI + Claude grounder` | no | `general-purpose` (the grounder half) |',
        '| A10 | **Compliance** | "Does the code SATISFY every clause of the spec\'s Behavioral Contract + Auth Matrix?" | `DeepSeek, or Claude sometimes` | no | `general-purpose` (the grounder half) |',
      );
      const p = mkTmpFile('t1-b.md', mutated);
      const errs = checkT1(parseRosterTable(readTmp(p)));
      expect(errs.some((e) => e.includes('A10'))).toBe(true);
    });
    it('RED: a fifth value Llama CLI', () => {
      const mutated = specText.replace(
        '| A1 | **Gemini (adversarial)** | "What would a hostile expert of a different model lineage catch?" | `Gemini CLI` | no | — |',
        '| A1 | **Gemini (adversarial)** | "What would a hostile expert of a different model lineage catch?" | `Llama CLI` | no | — |',
      );
      const p = mkTmpFile('t1-c.md', mutated);
      const errs = checkT1(parseRosterTable(readTmp(p)));
      expect(errs.some((e) => e.includes('A1'))).toBe(true);
    });
  });

  describe('T2 — tool-bearing invariant, keyed on the marker column', () => {
    it('GREEN: no tool-required row routed to a tool-less substrate', () => {
      expect(checkT2(parseRosterTable(specText))).toEqual([]);
    });
    it('RED: A5 flipped to DeepSeek CLI', () => {
      const mutated = specText.replace(
        '| A5 | **Integration** | "Does this match the REAL codebase — SDK signatures, wiring, seams, migration mechanics — not the spec\'s idealized version?" | `Claude` | yes (tree) | `general-purpose` |',
        '| A5 | **Integration** | "Does this match the REAL codebase — SDK signatures, wiring, seams, migration mechanics — not the spec\'s idealized version?" | `DeepSeek CLI` | yes (tree) | `general-purpose` |',
      );
      const p = mkTmpFile('t2-a.md', mutated);
      const errs = checkT2(parseRosterTable(readTmp(p)));
      expect(errs.some((e) => e.includes('A5'))).toBe(true);
    });
    it('RED: A9 flipped to Gemini CLI', () => {
      const mutated = specText.replace(
        '| A9 | **Ground-truth** | "Is the SPEC still TRUE against live code/DB/behavior?" (gates Compliance) | `Claude` | yes (tree+DB) | `general-purpose` |',
        '| A9 | **Ground-truth** | "Is the SPEC still TRUE against live code/DB/behavior?" (gates Compliance) | `Gemini CLI` | yes (tree+DB) | `general-purpose` |',
      );
      const p = mkTmpFile('t2-b.md', mutated);
      const errs = checkT2(parseRosterTable(readTmp(p)));
      expect(errs.some((e) => e.includes('A9'))).toBe(true);
    });
    it('RED: a net-new A15 row, tool-required, DeepSeek CLI — caught with no hardcoded row list', () => {
      const mutated = specText.replace(
        '## 4. The doctrine layer',
        '| A15 | **Hypothetical** | "test" | `DeepSeek CLI` | yes (tree) | — |\n\n## 4. The doctrine layer',
      );
      const p = mkTmpFile('t2-c.md', mutated);
      const errs = checkT2(parseRosterTable(readTmp(p)));
      expect(errs.some((e) => e.includes('A15'))).toBe(true);
    });
  });

  describe('T3 — STATUS honesty', () => {
    const partBText = fs.existsSync(PART_B_PLAN_PATH) ? fs.readFileSync(PART_B_PLAN_PATH, 'utf8') : '';
    it('GREEN: every §A row has STATUS live|PLANNED, and every PLANNED row resolves its id in the Part-B plan', () => {
      expect(fs.existsSync(PART_B_PLAN_PATH)).toBe(true);
      expect(checkT3(parseStatusTable(specText), partBText)).toEqual([]);
    });
    it('RED: PLANNED with no tracked id', () => {
      const mutated = specText.replace(
        '**`PLANNED` — not built; tracked as SUB-ENG-1** (`.cursor/wf1_deepseek_execution_engine_active_task.md`)',
        '**`PLANNED`**',
      );
      const p = mkTmpFile('t3-a.md', mutated);
      const errs = checkT3(parseStatusTable(readTmp(p)), partBText);
      expect(errs.some((e) => e.includes('no tracked id'))).toBe(true);
    });
    it('RED: tracked id absent from the Part-B plan', () => {
      const mutated = specText.replace(
        '**`PLANNED` — not built; tracked as SUB-ENG-1** (`.cursor/wf1_deepseek_execution_engine_active_task.md`)',
        '**`PLANNED` — not built; tracked as SUB-ENG-999** (`.cursor/wf1_deepseek_execution_engine_active_task.md`)',
      );
      const p = mkTmpFile('t3-b.md', mutated);
      const errs = checkT3(parseStatusTable(readTmp(p)), partBText);
      expect(errs.some((e) => e.includes('SUB-ENG-999') && e.includes('not found'))).toBe(true);
    });
  });

  describe('T4 — seat-id partition', () => {
    const seats = loadProjectSeats(AGENTS_DIR);
    it('GREEN: every seat id resolves to PROJECT_SEATS or HARNESS_SEATS', () => {
      expect(checkT4(parseRosterTable(specText), seats)).toEqual([]);
    });
    it('RED: seat id in neither set', () => {
      const mutated = specText.replace(
        '| A3 | **Code Reviewer** | "Is the code correct, typed, telemetered, free of dead code?" | `DeepSeek CLI + Claude grounder` | no | `code-reviewer-grounded` (the grounder half) |',
        '| A3 | **Code Reviewer** | "Is the code correct, typed, telemetered, free of dead code?" | `DeepSeek CLI + Claude grounder` | no | `code-reviewer-ungrounded` (the grounder half) |',
      );
      const p = mkTmpFile('t4-a.md', mutated);
      const errs = checkT4(parseRosterTable(readTmp(p)), seats);
      expect(errs.some((e) => e.includes('neither PROJECT_SEATS nor HARNESS_SEATS'))).toBe(true);
    });
    it('RED: a project seat file whose tools: drops Bash', () => {
      const fakeSeatsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-roster-seats-'));
      fs.writeFileSync(
        path.join(fakeSeatsDir, 'code-reviewer-grounded.md'),
        '---\nname: code-reviewer-grounded\ntools: Read, Grep, Glob\nmodel: sonnet\n---\n',
      );
      const badSeats = loadProjectSeats(fakeSeatsDir);
      const errs = checkT4(parseRosterTable(specText), badSeats);
      expect(errs.some((e) => e.includes('missing Bash'))).toBe(true);
    });
    it('PASS with no file lookup: general-purpose is a harness seat', () => {
      expect(HARNESS_SEATS.has('general-purpose')).toBe(true);
    });
  });

  describe('T5 — verbatim preservation (Spec 124 §4.7 (R-I) line-set diff)', () => {
    it('GREEN: §4, §5.2, §7b digests match the pinned pre-edit hashes', () => {
      const { errors } = checkT5(specText);
      expect(errors).toEqual([]);
    });
    it('RED: one byte mutated in each of the three blocks independently', () => {
      const m4 = specText.replace('decision framework every agent and orchestrator inhabits', 'decision framework every agent and orchestratr inhabits');
      const p4 = mkTmpFile('t5-s4.md', m4);
      expect(checkT5(readTmp(p4)).errors).toContain('§4 Operating Manual block digest mismatch');

      const m52 = specText.replace('Absorbs "spec-freshness enforcement"', 'Absorbs "spec-freshnes enforcement"');
      const p52 = mkTmpFile('t5-s52.md', m52);
      expect(checkT5(readTmp(p52)).errors).toContain('§5.2 Ground-truth block digest mismatch');

      const m7b = specText.replace('Spend on grounders at BOTH altitudes', 'Spend on grounders at BOTH altitude');
      const p7b = mkTmpFile('t5-s7b.md', m7b);
      expect(checkT5(readTmp(p7b)).errors).toContain('§7b scoreboard block digest mismatch');
    });
  });

  describe('T6 — CLIs stay read-only (static source guard)', () => {
    it('GREEN: neither review CLI contains a write/exec/mkdir/unlink pattern', () => {
      expect(checkT6(fs.readFileSync(DEEPSEEK_CLI_PATH, 'utf8'))).toEqual([]);
      expect(checkT6(fs.readFileSync(GEMINI_CLI_PATH, 'utf8'))).toEqual([]);
    });
    it('RED: fixture copy with one fs.writeFileSync( injected', () => {
      const real = fs.readFileSync(DEEPSEEK_CLI_PATH, 'utf8');
      const mutated = `${real}\nfs.writeFileSync('x', 'y');\n`;
      const p = mkTmpFile('t6.js', mutated);
      expect(checkT6(readTmp(p))).not.toEqual([]);
    });
    it('RED: fixture copy with one fs.promises.writeFile( injected (SUB-ENG-1 commit 12 — the `promises.` form is now caught too)', () => {
      const real = fs.readFileSync(DEEPSEEK_CLI_PATH, 'utf8');
      const mutated = `${real}\nfs.promises.writeFile('x', 'y');\n`;
      const p = mkTmpFile('t6-promises.js', mutated);
      expect(checkT6(readTmp(p))).not.toEqual([]);
    });
    it('GREEN: a fixture containing only pattern.exec(line) is NOT flagged (a regex .exec() call is not a write — the old pattern\'s false positive, SUB-ENG-1 commit 12)', () => {
      const content = "const pattern = /x/; const m = pattern.exec(line);\nconst n = /y/.exec(str);\n";
      expect(checkT6(content)).toEqual([]);
    });
  });

  describe('T7 — §B fallback doctrine (contract text AND runtime)', () => {
    it('GREEN: §B carries the literal fallback contract', () => {
      expect(checkT7(specText)).toEqual([]);
    });
    it('RED: fallback sentence deleted', () => {
      const mutated = specText.replace(
        'An unset, unrecognised, or engine-unavailable provider **resolves to `claude` and logs the downgrade with its reason** — never a throw-and-halt, never a half-executed run.',
        '',
      );
      const p = mkTmpFile('t7-a.md', mutated);
      expect(checkT7(readTmp(p)).length).toBeGreaterThan(0);
    });
    it('RED: enum widened to include fable', () => {
      const mutated = specText.replace('EXECUTION_PROVIDER=deepseek|claude`, CLI equivalent `--provider=deepseek|claude`', 'EXECUTION_PROVIDER=deepseek|claude|fable`, CLI equivalent `--provider=deepseek|claude|fable`');
      const p = mkTmpFile('t7-b.md', mutated);
      expect(checkT7(readTmp(p))).toContain('enum not exactly deepseek|claude');
    });
    it('RED: deepseek marked live without the tracked id', () => {
      const mutated = specText.replace('`deepseek` is **inert until SUB-ENG-1 ships**', '`deepseek` is **live**');
      const p = mkTmpFile('t7-c.md', mutated);
      expect(checkT7(readTmp(p))).toContain('deepseek-inert-with-tracked-id clause missing');
    });

    // -------------------------------------------------------------------
    // T7 runtime (SUB-ENG-1 commit 12) — the REAL CLI, not the doc text.
    // Scrubbed env per the harness (no GIT_*, no DEEPSEEK_*, no
    // EXECUTION_PROVIDER); a throwaway repo per src/tests/helpers/deepseek-
    // exec-harness.ts (never the real tree).
    // -------------------------------------------------------------------
    describe('T7 runtime — the real scripts/deepseek-exec.js CLI resolves an unrecognised/absent provider to claude, never a throw-and-halt', () => {
      let repo = '';
      beforeEach(() => { repo = makeRepo(); });
      afterEach(() => { if (repo) fs.rmSync(repo, { recursive: true, force: true }); });

      it('--provider=bogus + a transcript ⇒ exit 0, run_start.provider==="claude", provider_source matches /^fallback:/', () => {
        const briefPath = writeBrief(repo);
        const transcriptPath = path.join(repo, 'empty-transcript.json');
        fs.writeFileSync(transcriptPath, JSON.stringify([]));
        const ledgerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-roster-t7-ledger-'));
        const cliPath = path.join(REPO_ROOT, 'scripts', 'deepseek-exec.js');
        try {
          const stdout = execFileSync(process.execPath, [
            cliPath, '--brief', briefPath, '--provider=bogus', '--transcript', transcriptPath, '--ledger-dir', ledgerDir,
          ], { cwd: repo, env: scrubbedChildEnv(), encoding: 'utf8' });
          const summary = JSON.parse(stdout.trim().split('\n').pop()!) as { run_id: string; status: string };
          expect(summary.status).toBe('delegated_to_claude');
          const raw = fs.readFileSync(path.join(ledgerDir, `${summary.run_id}.jsonl`), 'utf8');
          const records = raw.trim().split('\n').map((l) => JSON.parse(l) as { kind: string; provider?: string; provider_source?: string });
          const runStart = records.find((r) => r.kind === 'run_start')!;
          expect(runStart.provider).toBe('claude');
          expect(runStart.provider_source).toMatch(/^fallback:/);
        } finally {
          fs.rmSync(ledgerDir, { recursive: true, force: true });
        }
      });

      it('no --provider given (and no EXECUTION_PROVIDER in the scrubbed env) ⇒ provider_source === "default"', () => {
        const briefPath = writeBrief(repo);
        const ledgerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-roster-t7-ledger2-'));
        const cliPath = path.join(REPO_ROOT, 'scripts', 'deepseek-exec.js');
        try {
          const stdout = execFileSync(process.execPath, [
            cliPath, '--brief', briefPath, '--ledger-dir', ledgerDir,
          ], { cwd: repo, env: scrubbedChildEnv(), encoding: 'utf8' });
          const summary = JSON.parse(stdout.trim().split('\n').pop()!) as { run_id: string; status: string };
          expect(summary.status).toBe('delegated_to_claude');
          const raw = fs.readFileSync(path.join(ledgerDir, `${summary.run_id}.jsonl`), 'utf8');
          const runStart = JSON.parse(raw.trim().split('\n')[0]!) as { provider?: string; provider_source?: string };
          expect(runStart.provider).toBe('claude');
          expect(runStart.provider_source).toBe('default');
        } finally {
          fs.rmSync(ledgerDir, { recursive: true, force: true });
        }
      });

      it('the CLI process NEVER throws/crashes (exit 0) on a bogus provider — a real subprocess-level proof of "never a throw-and-halt"', () => {
        const briefPath = writeBrief(repo);
        const ledgerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-roster-t7-ledger3-'));
        const cliPath = path.join(REPO_ROOT, 'scripts', 'deepseek-exec.js');
        try {
          const result = spawnSync(process.execPath, [
            cliPath, '--brief', briefPath, '--provider=not-a-real-provider', '--ledger-dir', ledgerDir,
          ], { cwd: repo, env: scrubbedChildEnv(), encoding: 'utf8' });
          expect(result.status).toBe(0);
        } finally {
          fs.rmSync(ledgerDir, { recursive: true, force: true });
        }
      });
    });
  });

  describe('T8 — stale tool-less agent types, scoped to live protocol surfaces', () => {
    it('GREEN: zero occurrences of feature-dev:(code-reviewer|code-explorer|code-architect) across CLAUDE.md, scripts/CLAUDE.md, .claude/workflows.md, docs/specs/**', () => {
      const files = liveProtocolFiles(REPO_ROOT).map((p) => ({ path: p, content: fs.readFileSync(p, 'utf8') }));
      expect(checkT8(files)).toEqual([]);
    });
    it('RED: fixture reintroducing feature-dev:code-reviewer into a workflows.md copy', () => {
      const real = fs.readFileSync(path.join(REPO_ROOT, '.claude/workflows.md'), 'utf8');
      const mutated = `${real}\n<!-- subagent_type: "feature-dev:code-reviewer" -->\n`;
      const p = mkTmpFile('t8.md', mutated);
      const files = [{ path: p, content: readTmp(p) }];
      expect(checkT8(files)).not.toEqual([]);
    });
    it('scope exclusions are asserted, not silently dropped: .cursor/**, review_followups.md, .claude/worktrees/**, node_modules/** are history and are NOT scanned by this lock', () => {
      const scanned = liveProtocolFiles(REPO_ROOT);
      expect(scanned.every((p) => !p.includes(`${path.sep}.cursor${path.sep}`))).toBe(true);
      expect(scanned.every((p) => !p.includes('review_followups.md'))).toBe(true);
      expect(scanned.every((p) => !p.includes(`${path.sep}worktrees${path.sep}`))).toBe(true);
    });
  });

  describe('T9 — workflow-seat drift (SUB-ENG-1 commit 12)', () => {
    const seats = loadProjectSeats(AGENTS_DIR);
    const liveFiles = [
      path.join(REPO_ROOT, '.claude/workflows.md'),
      path.join(REPO_ROOT, 'CLAUDE.md'),
    ].map((p) => ({ path: p, content: fs.readFileSync(p, 'utf8') }));

    it('GREEN: every subagent_type in .claude/workflows.md and CLAUDE.md resolves to PROJECT_SEATS ∪ HARNESS_SEATS', () => {
      expect(checkT9(liveFiles, seats)).toEqual([]);
    });
    it('RED: a copy of workflows.md with subagent_type: "observability-reviewer-v2"', () => {
      const real = fs.readFileSync(path.join(REPO_ROOT, '.claude/workflows.md'), 'utf8');
      const mutated = `${real}\n<!-- subagent_type: "observability-reviewer-v2" -->\n`;
      const p = mkTmpFile('t9.md', mutated);
      const files = [{ path: p, content: readTmp(p) }];
      expect(checkT9(files, seats)).not.toEqual([]);
    });
    it('GREEN control: every real seat used today (code-reviewer-grounded, observability-reviewer, general-purpose, regression-guardian) resolves cleanly', () => {
      const workflowsContent = fs.readFileSync(path.join(REPO_ROOT, '.claude/workflows.md'), 'utf8');
      const found = new Set(extractSubagentTypes(workflowsContent));
      expect(found.size).toBeGreaterThan(0);
      for (const seat of found) {
        expect(HARNESS_SEATS.has(seat) || seats.has(seat)).toBe(true);
      }
    });
  });
});

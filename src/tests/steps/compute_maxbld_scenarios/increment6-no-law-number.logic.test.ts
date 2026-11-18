// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md R3-02 (law numbers live in Layer 2 or in a clause-cited setting, never in Layer 3 code)
// MB-27 increment 6 Part B · lane INC6-BUILD: 12.2 and 0.45 appear in no Layer 3 source outside comments, and in no increment-6 catalogue expression. Moved here from bylaw-inc6-layer2 (an oracle-class file, committed with the Layer 2 part).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped seed surface
const ROOT = process.cwd();
const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('increment 6: no law number in Layer 3 (R3-02)', () => {
  it('12.2 and 0.45 appear in no Layer 3 source outside comments', () => {
    const dir = path.join(ROOT, 'scripts/lib/compute/maxbld');
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
      const code = stripComments(fs.readFileSync(path.join(dir, f), 'utf8'));
      expect(code, f).not.toMatch(/(?<![\d.])12\.2(?![\d])/);
      expect(code, f).not.toMatch(/(?<![\d.])0\.45(?![\d])/);
    }
    const cat = fs.readFileSync(path.join(ROOT, 'scripts/seeds/bylaw/layer3-catalogue.json'), 'utf8');
    const exprs = (JSON.parse(cat).rows as Json[]).filter((r) => r.increment === '6').map((r) => String(r.expression ?? ''));
    expect(exprs.length).toBeGreaterThan(0);
    for (const e of exprs) expect(e).not.toMatch(/(?<![\d.])(12\.2|0\.45)(?![\d])/);
  });
});

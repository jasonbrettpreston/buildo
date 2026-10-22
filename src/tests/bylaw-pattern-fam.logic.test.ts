// SPEC LINK: docs/specs/01-pipeline/69a_mcbylaw_register.md M-132 (phrasing-variant licence patterns), M-179(1) (ancillary coverage is never the lot's overall coverage);
//            operator CHAT-81.FAM-ALL (2026-10-23-batch-b): FAM-ANCCOV and FAM-SEP wordings
// Red first: before the wordings exist "lot coverage for ancillary buildings" and "from a residential building" license no target.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const VOCAB = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scripts/seeds/bylaw/vocab.json'), 'utf8'));
const lic = (target: string, t: string): boolean => (VOCAB.dsl_target[target].patterns as string[]).some((x) => t.toLowerCase().includes(x));

describe('CHAT-81.FAM-ALL wordings', () => {
  it('"lot coverage for ancillary buildings" licenses ancillary_coverage_pct and nothing wider', () => {
    expect(lic('ancillary_coverage_pct', 'The maximum lot coverage for ancillary buildings is 5%; and')).toBe(true);
    expect(lic('ancillary_coverage_pct', 'The maximum lot coverage is 35%')).toBe(false);
    expect(lic('ancillary_coverage_pct', 'lot coverage for principal buildings')).toBe(false);
  });
  it('"from a residential building" licenses separation_m and nothing wider', () => {
    expect(lic('separation_m', 'set back a minimum of 3.0 metres from a residential building on the lot')).toBe(true);
    expect(lic('separation_m', 'set back a minimum of 3.0 metres from a rear lot line')).toBe(false);
    expect(lic('separation_m', 'a residential building on the lot')).toBe(false);
  });
});

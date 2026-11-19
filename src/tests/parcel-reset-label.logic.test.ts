// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md §11b.7 rules 5-6 (dated note 2026-11-11; the server computes every value, FE-05),
//            docs/specs/02-web-admin/135_mcfrontend_decisions_register.md FE-05, FE-32 (a displayed value binds to a served contract field).
//
// SRCH.A6 reset label (task-351; operator RR-0310, MORNING-DECISIONS.md:1207, "your recommendation is approved"): GET /api/parcels/entitlement serves
// `resetsOnDisplay`, the billing-month end written as the Toronto calendar date in the v8 shape "9 Dec 2026". Cases:
//   (a) the evening edge: an instant between 19:00 and 24:00 Toronto standard time is the Toronto day; one in daylight time likewise;
//   (b) the month and year edges, and all twelve months in the v8 shape (September is Sep, never Sept);
//   (c) the winter/summer day flip of an anchor in [04:00, 05:00) UTC (accepted by design: the label is the Toronto day of the real instant);
//   (d) the label does not depend on the machine zone (child processes under TZ=UTC and TZ=Pacific/Auckland);
//   (e) the existing formatDateDmy keeps its output byte for byte (the lot-size page and What we checked);
//   (f) the served read carrying the label is pinned in parcel-tool-meter.logic.test.ts and parcels-entitlement.infra.test.ts.
// Root test: pure module, no DB, no network.
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { formatDateDmy, formatDateDmyFixed } from '@/lib/parcels/lot-size-entry';

const at = (iso: string): string => formatDateDmyFixed(new Date(iso));

describe('(a) the evening edge: the label is the Toronto day of the instant', () => {
  it('2026-12-09T02:00:00Z (21:00 on 8 Dec, standard time) is 8 Dec 2026; 05:00:00Z (00:00 on 9 Dec) is 9 Dec 2026', () => {
    expect(at('2026-12-09T02:00:00Z')).toBe('8 Dec 2026');
    expect(at('2026-12-09T04:59:59Z')).toBe('8 Dec 2026');
    expect(at('2026-12-09T05:00:00Z')).toBe('9 Dec 2026');
  });
  it('daylight time: 2026-07-10T03:30:00Z (23:30 on 9 Jul) is 9 Jul 2026; 04:00:00Z (00:00 on 10 Jul) is 10 Jul 2026', () => {
    expect(at('2026-07-10T03:30:00Z')).toBe('9 Jul 2026');
    expect(at('2026-07-10T04:00:00Z')).toBe('10 Jul 2026');
  });
});

describe('(b) month and year edges; all twelve months in the v8 shape', () => {
  it('the zone crossing the new year and a month end reads the Toronto date', () => {
    expect(at('2026-01-01T03:00:00Z')).toBe('31 Dec 2025');
    expect(at('2026-12-01T02:00:00Z')).toBe('30 Nov 2026');
    expect(at('2028-03-01T04:30:00Z')).toBe('29 Feb 2028');
  });
  it('twelve mid-month instants give Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec', () => {
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    names.forEach((n, i) => expect(at(`2026-${String(i + 1).padStart(2, '0')}-15T12:00:00Z`), n).toBe(`15 ${n} 2026`));
    expect(at('2026-09-10T12:00:00Z')).toBe('10 Sep 2026');
  });
});

describe('(c) an anchor in [04:00, 05:00) UTC: the label follows the Toronto day, so it differs between winter and summer cycles (by design)', () => {
  it('04:30Z in January is the previous Toronto day (23:30); 04:30Z in July is the same Toronto day (00:30)', () => {
    expect(at('2026-01-10T04:30:00Z')).toBe('9 Jan 2026');
    expect(at('2026-07-10T04:30:00Z')).toBe('10 Jul 2026');
  });
});

describe('(d) the label does not depend on the machine zone', () => {
  const ENTRY = path.join(process.cwd(), 'src/lib/parcels/lot-size-entry.ts');
  const SCRIPT = [
    `import { formatDateDmyFixed as f } from ${JSON.stringify(ENTRY)};`,
    "const out = ['2026-12-09T02:00:00Z', '2026-12-09T05:00:00Z', '2026-07-10T03:30:00Z', '2026-09-10T12:00:00Z', '2026-01-01T03:00:00Z'].map((s) => f(new Date(s)));",
    'process.stdout.write(JSON.stringify(out));',
  ].join('\n');
  for (const tz of ['UTC', 'Pacific/Auckland']) {
    it(`TZ=${tz} prints the same five labels`, () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reset-label-'));
      const probe = path.join(dir, 'probe.ts');
      fs.writeFileSync(probe, SCRIPT);
      const r = spawnSync(process.execPath, [path.join(process.cwd(), 'node_modules/.bin/tsx'), '--tsconfig', path.join(process.cwd(), 'tsconfig.json'), probe], {
        cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, TZ: tz }, timeout: 60_000,
      });
      fs.rmSync(dir, { recursive: true, force: true });
      expect(r.stderr).toBe('');
      expect(JSON.parse(r.stdout)).toEqual(['8 Dec 2026', '9 Dec 2026', '9 Jul 2026', '10 Sep 2026', '31 Dec 2025']);
    });
  }
});

describe('(e) formatDateDmy is untouched: the lot-size page and What we checked keep their output', () => {
  it('prints the en-GB short month, "Sept" included', () => {
    expect(formatDateDmy(new Date('2026-09-10T12:00:00Z'))).toBe('10 Sept 2026');
    expect(formatDateDmy(new Date('2026-11-10T17:00:00Z'))).toBe('10 Nov 2026');
    expect(formatDateDmy(new Date('2026-12-09T02:00:00Z'))).toBe('8 Dec 2026');
  });
});

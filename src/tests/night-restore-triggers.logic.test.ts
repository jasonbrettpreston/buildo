// 🔗 SPEC LINK: task MB-30 stage 7, rule M-368: the night restore disables user
// triggers inside the restore transaction and re-enables them before COMMIT.
//
// Pure-function tests for scripts/lib/night-restore-triggers.js (T1-T10).
// The module is deliberately absent for this brief: these tests are written red first.

import { describe, expect, it } from 'vitest';
import {
  buildDisableSql,
  buildEnableSql,
  buildStateCheckSql,
  buildOwnerCheckSql,
  disabledEcho,
  reenabledEcho,
  wrapRestoreScript,
} from '../../scripts/lib/night-restore-triggers';

const SAMPLE = [
  '\\set ON_ERROR_STOP on',
  'BEGIN;',
  'SET LOCAL statement_timeout = 0;',
  "SET LOCAL lock_timeout = '120s';",
  'CREATE TEMP TABLE "r_a" (LIKE public."a") ON COMMIT DROP;',
  "\\copy \"r_a\" FROM PROGRAM '/usr/bin/gzip -dc /x/a.bin.gz' WITH (FORMAT binary)",
  'DELETE FROM public."a" x WHERE NOT EXISTS (SELECT 1 FROM "r_a" b WHERE b."id" = x."id");',
  'UPDATE public."a" x SET ("id") = ROW(b."id") FROM "r_a" b WHERE b."id" = x."id" AND x::text IS DISTINCT FROM b::text;',
  "SELECT 'a' AS restored_table, 1/(CASE WHEN 1=1 THEN 1 ELSE 0 END) AS equal;",
  'COMMIT;',
].join('\n');

const lines = (s: string): string[] => s.split('\n');
const OWNER = "pg_has_role(current_user, relowner, 'USAGE')";
const DIS_ECHO = '\\echo night-restore: triggers DISABLED';
const RE_ECHO = '\\echo night-restore: triggers RE-ENABLED';
const ALREADY = /DISABLE TRIGGER|ENABLE TRIGGER|session_replication_role/;

function mustThrow(fn: () => unknown, re: RegExp): void {
  let err: unknown;
  try {
    fn();
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(Error);
  expect(String((err as Error).message)).toMatch(re);
}

const ALL_BUILDERS = [
  (t: string[]) => buildDisableSql(t),
  (t: string[]) => buildEnableSql(t),
  (t: string[]) => buildStateCheckSql(t, 'all_default'),
  (t: string[]) => buildOwnerCheckSql(t),
  (t: string[]) => disabledEcho(t),
];

describe('night-restore-triggers T1/T2: disable and enable SQL', () => {
  it('T1 buildDisableSql emits one DISABLE TRIGGER USER line per table', () => {
    const sql = buildDisableSql(['a', 'b']);
    expect(sql).toBe(
      'ALTER TABLE public."a" DISABLE TRIGGER USER;\nALTER TABLE public."b" DISABLE TRIGGER USER;',
    );
    expect(sql).not.toContain('ALL');
  });

  it('T2 buildEnableSql emits one ENABLE TRIGGER USER line per table', () => {
    const sql = buildEnableSql(['a', 'b']);
    expect(sql).toBe(
      'ALTER TABLE public."a" ENABLE TRIGGER USER;\nALTER TABLE public."b" ENABLE TRIGGER USER;',
    );
    expect(sql).not.toContain('ALL');
  });
});

describe('night-restore-triggers T3: table list rules', () => {
  it('dedupes keeping first-seen order', () => {
    const out = lines(buildDisableSql(['b', 'a', 'b']));
    expect(out).toHaveLength(2);
    expect(out[0]).toBe('ALTER TABLE public."b" DISABLE TRIGGER USER;');
    expect(out[1]).toBe('ALTER TABLE public."a" DISABLE TRIGGER USER;');
  });

  it('rejects an empty or non-array list in every builder', () => {
    for (const build of ALL_BUILDERS) {
      mustThrow(() => build([]), /no tables/);
      mustThrow(() => build('a' as unknown as string[]), /no tables/);
    }
  });

  it('rejects unsafe identifiers in every builder', () => {
    for (const bad of ['a"b', 'a;b', 'a b', 'A', 'public.a']) {
      for (const build of ALL_BUILDERS) {
        mustThrow(() => build([bad]), /identifier/);
      }
    }
  });
});

describe('night-restore-triggers T4/T5: state check and owner check SQL', () => {
  const tables = ['a', 'b'];
  const shape = (sql: string): void => {
    expect(sql).toContain('RAISE EXCEPTION');
    expect(sql.startsWith('DO')).toBe(true);
    expect(sql.trimEnd().endsWith('$$;')).toBe(true);
  };

  it.each([
    ['all_default', "tgenabled <> 'O'", "tgenabled <> 'D'"],
    ['all_disabled', "tgenabled <> 'D'", "tgenabled <> 'O'"],
  ])('%s uses only its own predicate', (mode, want, other) => {
    const sql = buildStateCheckSql(tables, mode);
    expect(sql).toContain('NOT tgisinternal');
    expect(sql).toContain(want);
    expect(sql).not.toContain(other);
    shape(sql);
  });

  it('rejects an unknown mode', () => {
    mustThrow(() => buildStateCheckSql(tables, 'none_disabled'), /mode/);
  });

  it('T5 owner check raises unless every table is owned via pg_has_role', () => {
    const sql = buildOwnerCheckSql(['a', 'b']);
    expect(sql).toContain(OWNER);
    shape(sql);
  });
});

describe('night-restore-triggers T6/T8: wrapped script layout', () => {
  const L = lines(wrapRestoreScript(SAMPLE, ['a']));
  const all = (pred: (l: string) => boolean): number[] =>
    L.map((l, i) => (pred(l) ? i : -1)).filter((i) => i >= 0);
  const owner = L.findIndex((l) => l.includes(OWNER));
  const def = all((l) => l.includes("tgenabled <> 'O'"));
  const dis = all((l) => l.includes('DISABLE TRIGGER USER'));
  const disCheck = L.findIndex((l) => l.includes("tgenabled <> 'D'"));
  const disEcho = L.findIndex((l) => l.startsWith(DIS_ECHO));
  const del = L.findIndex((l) => l.startsWith('DELETE FROM '));
  const ena = all((l) => l.includes('ENABLE TRIGGER USER'));
  const reEcho = L.findIndex((l) => l.startsWith(RE_ECHO));
  const commit = L.findIndex((l) => l === 'COMMIT;');

  it('orders the guard block, the body and the re-enable block', () => {
    const def1 = def[0];
    const def2 = def[def.length - 1];
    const order = [owner, def1, dis[0], disCheck, disEcho, del, ena[0], def2, reEcho, commit];
    const names = ['owner', 'all_default#1', 'disable', 'all_disabled', 'DISABLED echo', 'DELETE', 'enable', 'all_default#2', 'RE-ENABLED echo', 'COMMIT'];
    expect(def.length).toBeGreaterThanOrEqual(2);
    expect(order[0]).toBeGreaterThan(-1);
    for (let i = 1; i < order.length; i++) {
      expect(`${names[i]}=${(order[i] ?? -1) > (order[i - 1] ?? -1)}`).toBe(`${names[i]}=true`);
    }
  });

  it('keeps the preamble before the guard, COMMIT last once, and the anchors tight', () => {
    const lock = L.findIndex((l) => l.startsWith('SET LOCAL lock_timeout'));
    expect(L.findIndex((l) => l.startsWith('\\copy '))).toBeLessThan(owner);
    expect(L.findIndex((l) => l.startsWith('CREATE TEMP TABLE'))).toBeLessThan(owner);
    expect(lock).toBeGreaterThan(-1);
    expect(lock).toBeLessThan(owner);
    expect(L[L.length - 1]).toBe('COMMIT;');
    expect(L.filter((l) => l === 'COMMIT;')).toHaveLength(1);
    expect((L[disEcho + 1] ?? '').startsWith('DELETE FROM ')).toBe(true);
    expect(L[reEcho + 1]).toBe('COMMIT;');
  });

  it('T8 no output line ends with |1', () => {
    for (const l of L) expect(l.endsWith('|1')).toBe(false);
  });
});

describe('night-restore-triggers T7: refusals', () => {
  const tables = ['a'];
  const without = (re: RegExp): string => lines(SAMPLE).filter((l) => !re.test(l)).join('\n');
  const withTail = (extra: string): string => SAMPLE.replace('COMMIT;', `${extra}\nCOMMIT;`);

  const cases: Array<[string, () => string, RegExp]> = [
    ['no BEGIN;', () => without(/^BEGIN;$/), /BEGIN/],
    ['two BEGIN; lines', () => SAMPLE.replace(/^BEGIN;$/m, 'BEGIN;\nBEGIN;'), /BEGIN/],
    ['no final COMMIT', () => without(/^COMMIT;$/), /COMMIT/],
    ['two COMMIT; lines', () => `${SAMPLE}\nCOMMIT;`, /COMMIT/],
    ['ON COMMIT DROP only', () => without(/^COMMIT;$/), /no final COMMIT/],
    ['ROLLBACK', () => withTail('ROLLBACK;'), /ROLLBACK|ABORT/],
    ['ABORT', () => withTail('ABORT;'), /ROLLBACK|ABORT/],
    ['READ ONLY', () => withTail('SET TRANSACTION READ ONLY;'), /READ ONLY|transaction_read_only/i],
    ['transaction_read_only', () => withTail('SET transaction_read_only = on;'), /read_only|READ ONLY/i],
    ['DISABLE TRIGGER present', () => withTail('ALTER TABLE public."a" DISABLE TRIGGER USER;'), ALREADY],
    ['ENABLE TRIGGER present', () => withTail('ALTER TABLE public."a" ENABLE TRIGGER USER;'), ALREADY],
    ['session_replication_role', () => withTail("SET LOCAL session_replication_role = 'replica';"), /session_replication_role/],
    ['no lock_timeout', () => without(/^SET LOCAL lock_timeout/), /lock_timeout/],
    ['no DELETE FROM', () => without(/^DELETE FROM /), /DELETE FROM/],
    [
      'lock_timeout after DELETE',
      () => {
        const rest = lines(SAMPLE).filter((l) => !l.startsWith('SET LOCAL lock_timeout'));
        rest.splice(rest.findIndex((l) => l.startsWith('DELETE FROM ')) + 1, 0, "SET LOCAL lock_timeout = '120s';");
        return rest.join('\n');
      },
      /lock_timeout|before/,
    ],
    [
      'DELETE after COMMIT',
      () => [...lines(SAMPLE).filter((l) => !l.startsWith('DELETE FROM ')), 'DELETE FROM public."a";'].join('\n'),
      /DELETE FROM|before/,
    ],
    ['text after COMMIT', () => `${SAMPLE}\nSELECT 2;`, /after.*COMMIT/],
    ['already wrapped', () => wrapRestoreScript(SAMPLE, tables), ALREADY],
  ];

  it('refuses an empty or invalid table list', () => {
    mustThrow(() => wrapRestoreScript(SAMPLE, []), /tables|no tables/);
    mustThrow(() => wrapRestoreScript(SAMPLE, ['public.a']), /identifier/);
  });

  it.each(cases)('refuses %s', (_name, make, re) => {
    const script = make();
    if (_name === 'ON COMMIT DROP only') expect(script).toContain('ON COMMIT DROP');
    mustThrow(() => wrapRestoreScript(script, tables), re);
  });
});
describe('night-restore-triggers T9-T10: echo lines and purity', () => {
  const tables = ['a', 'b', 'a'];

  it('T9 emits the exact echoes with the deduped count, once each in the output', () => {
    expect(disabledEcho(tables)).toBe('\\echo night-restore: triggers DISABLED (USER) on 2 table(s)');
    expect(reenabledEcho(tables)).toBe('\\echo night-restore: triggers RE-ENABLED (USER) on 2 table(s) before COMMIT');
    const L = lines(wrapRestoreScript(SAMPLE, tables));
    expect(L.filter((l) => l.startsWith(DIS_ECHO))).toEqual([disabledEcho(tables)]);
    expect(L.filter((l) => l.startsWith(RE_ECHO))).toEqual([reenabledEcho(tables)]);
  });

  it('T10 is pure: same input gives identical output and the input is unchanged', () => {
    const input = String(SAMPLE);
    const first = wrapRestoreScript(input, ['a']);
    expect(wrapRestoreScript(input, ['a'])).toBe(first);
    expect(input).toBe(SAMPLE);
  });
});

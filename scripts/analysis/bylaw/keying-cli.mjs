#!/usr/bin/env node
// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §10 stages 5–6, §9 G-AGREE / G-PROV keyer arm;
//            docs/specs/01-pipeline/69_mcbylaw_policy.md M-17, M-45; docs/reports/mcbylaw-phase1-plan.md A1..A7
//
// The double-keying harness CLI (interim: proposed as `--key <cmd>` modes of scripts/generate-bylaw-provisions.mjs).
// Run from the AUTHORING worktree root (where keyer A's drafts are written). Working files live in
// .cursor/mcbylaw/keying/<batch>/ (never committed); drafts + provenance in scripts/seeds/bylaw/authored/.
//
//   plan    --batch A1 [--max-units 40] [--exclude-pages <p,p> | --phase1]   shards of the batch → plan.json
//           --batch E5 (phase2-plan-v2 §K.1 E-5): the top-30 exceptions of scripts/seeds/bylaw/k7-exceptions.json
//           --exclude-pages drops those pages; --phase1 drops every Phase 2 row BY CONTENT (Ch.900 pages + enacting
//           amendments of a Ch.900 residential exception 900.2–900.6, Spec 69a M-78 dated note 2026-10-08) and reports the row count
//   briefs  --batch A1 [--shard <key>]                    the two blind briefs per shard → briefs/<slug>.{a,b}.md + briefs.json
//           --shard rewrites ONLY that plan shard's two brief files and replaces only its briefs.json entry (every other
//           entry and brief file is left untouched) — used to (re)brief one row-chunk shard without re-emitting the batch
//   seal    --batch A1 [--shard <key>] [--reseal]        A-SEAL every A draft without a .b (seals.json; monotonic id)
//   run-b   --batch A1 [--shard <key>] [--parallel 4] [--b-root <dir>] [--engine <deepseek-exec.js>] [--dotenv <.env>]
//           keyer B for every sealed shard without a .b → .b.json + .prov.json in this tree
//   queue   --batch A1                                   G-AGREE over the batch → adjudication-queue-A1.{md,json}
//   apply   --batch A1 --answers <md|json> --adjudicator operator   answers → scripts/seeds/bylaw/adjudications.json
//   correct --corrections <file> --adjudicator operator  M-75 corrections (may carry `supersedes:"<COR id>"`) → scripts/seeds/bylaw/adjudications.json
//   rekey   --batch A1 --shard <key> [--units <id,id>]     Spec 69a M-80: plan + brief a re-key generation <key>~r<n> that supersedes the old drafts
//   status  --batch A1                                   per-shard state + the paths ready to commit together
//
// Exit codes: 0 ok · 1 a shard / answer was refused (details printed) · 2 usage or structural error.

import fs from 'node:fs';
import path from 'node:path';
import { loadAuthored, shardGeneration } from './authored.mjs';
import { checkAgree } from './agree.mjs';
import { nowIso } from './clock.mjs';
import { KEYER_IDS, KeyingError, OVERLAY_BATCHES, applyAnswers, buildBriefs, buildProv, buildQueue, draftSha, parseAnswers, planBatch, rekeyShard, renderQueueMd, sealDraft, shardPaths, shardSlug } from './keying.mjs';
import { engineEnv, ensureKeyerBWorktree, readEnvKey, runKeyerB, spawnEngine } from './keyer-b.mjs';
import { loadSnapshotPages, sliceSnapshot } from './slice.mjs';
import { stableStringify } from './snapshot.mjs';
import { parseRulings, scopeRows, universeInputs } from './universe.mjs';

const SPEC68 = 'docs/specs/01-pipeline/68_mcbylaw_standard.md';
const ADJ_REL = 'scripts/seeds/bylaw/adjudications.json';

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      out._.push(a);
      continue;
    }
    const eq = a.indexOf('=');
    const k = (eq > 0 ? a.slice(2, eq) : a.slice(2)).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (eq > 0) out[k] = a.slice(eq + 1);
    else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) out[k] = argv[++i];
    else out[k] = true;
  }
  return out;
}

const writeLf = (file, text) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text.replace(/\r\n/g, '\n'));
};
const readJson = (file, dflt) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : dflt);
const isStrVal = (v) => typeof v === 'string' && v.trim().length > 0;

function context(root) {
  const seeds = path.join(root, 'scripts', 'seeds', 'bylaw');
  const snap = loadSnapshotPages(seeds);
  const slice = sliceSnapshot({ pages: snap.pages, enacting: snap.enacting, scope: snap.scope });
  const inp = universeInputs({ root, slice, pages: snap.pages, adoptionId: snap.adoption_id });
  const sc = scopeRows({ rows: slice.rows, universe: inp.universe, vocab: inp.vocab, rulings: parseRulings(inp.spec69Text), pageSet: inp.pageSet });
  if (sc.violations.length) throw new KeyingError('scope_invalid', `universe scoping has ${sc.violations.length} violations (run --check first): ${sc.violations.slice(0, 3).join('; ')}`);
  return { slice, vocab: inp.vocab, inScope: new Set(sc.rows.filter((r) => r.scope === 'in_scope').map((r) => r.regulation_id)) };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  const root = path.resolve(args.root || process.cwd());
  const batch = args.batch;
  if (!cmd || !batch || typeof batch !== 'string') {
    console.error('usage: keying-cli.mjs <plan|briefs|seal|run-b|queue|apply|correct|rekey|status> --batch A1 [options]');
    console.error('  plan options: [--max-units <n>] [--exclude-pages <p,p> | --phase1] (--phase1 drops Phase 2 rows by content, M-78)   batch E5 reads scripts/seeds/bylaw/k7-exceptions.json');
    return 2;
  }
  const dir = path.join(root, '.cursor', 'mcbylaw', 'keying', batch);
  const sealsFile = path.join(root, '.cursor', 'mcbylaw', 'keying', 'seals.json');
  const planFile = path.join(dir, 'plan.json');
  const briefsFile = path.join(dir, 'briefs.json');
  const loadPlan = () => {
    if (!fs.existsSync(planFile)) throw new KeyingError('plan_missing', `run: keying-cli.mjs plan --batch ${batch}`);
    return JSON.parse(fs.readFileSync(planFile, 'utf8'));
  };
  const onDisk = () => new Map(loadAuthored(root).map((s) => [s.key, s]));

  if (cmd === 'plan') {
    const ctx = context(root);
    // E5 (phase2-plan-v2 §K.1 E-5): the overlay's members are the top-30 exceptions k7.mjs ranked (explicit ids, never batchOf)
    let regulationIds = null;
    if (batch === 'E5') {
      const exc = readJson(path.join(root, 'scripts', 'seeds', 'bylaw', 'k7-exceptions.json'), null);
      const ids = exc && Array.isArray(exc.exceptions) ? exc.exceptions.map((e) => e.regulation_id) : null;
      if (!ids || !ids.length) throw new KeyingError('batch_members_missing', 'scripts/seeds/bylaw/k7-exceptions.json has no exceptions[] (run k7.mjs --write)');
      if (exc.exceptions.length !== exc.top_n) throw new KeyingError('batch_members_missing', `k7-exceptions.json holds ${exc.exceptions.length} exceptions, not top_n ${exc.top_n} (re-run k7.mjs --write)`);
      regulationIds = ids;
    }
    const excludePages = typeof args.excludePages === 'string' ? args.excludePages.split(',').map((x) => x.trim()).filter(Boolean) : null;
    const phase1 = args.phase1 === true || args.phase1 === 'true'; // Spec 69a M-78 by content
    const hasDrafts = (key) => fs.existsSync(path.join(root, shardPaths(key).a)); // M2: never re-chunk a keyed shard
    const plan = planBatch({ slice: ctx.slice, inScopeIds: ctx.inScope, batch, maxUnits: args.maxUnits ? Number(args.maxUnits) : undefined, regulationIds, excludePages, phase1, hasDrafts });
    writeLf(planFile, stableStringify(plan));
    console.log(`${batch} ${plan.label}: ${plan.shards.length} shards, ${plan.shards.reduce((n, s) => n + s.regulation_ids.length, 0)} rows, ${plan.shards.reduce((n, s) => n + s.units.length, 0)} units${plan.phase1 ? `, ${plan.excluded_rows} rows excluded (Phase 2 by content, M-78)` : plan.excluded_pages ? `, ${plan.excluded_rows} rows excluded (${plan.excluded_pages.join(', ')})` : ''} → ${path.relative(root, planFile)}`);
    return 0;
  }
  if (cmd === 'briefs') {
    const plan = loadPlan();
    const ctx = context(root);
    const specText = fs.readFileSync(path.join(root, SPEC68), 'utf8');
    const wanted = plan.shards.filter((s) => !args.shard || s.key === args.shard);
    if (args.shard && !wanted.length) throw new KeyingError('shard_unplanned', `${args.shard} is not in the ${batch} plan`);
    // --shard: keep every other briefs.json entry (read back and re-merged, so they stay byte-identical); without it the
    // index is rebuilt from scratch (the batch-wide behaviour).
    const index = args.shard ? readJson(briefsFile, {}) : {};
    for (const shard of wanted) {
      const b = buildBriefs({ shard, slice: ctx.slice, vocab: ctx.vocab, specText, batch });
      const slug = shardSlug(shard.key);
      writeLf(path.join(dir, 'briefs', `${slug}.a.md`), b.a.text);
      writeLf(path.join(dir, 'briefs', `${slug}.b.md`), b.b.text);
      index[shard.key] = { a: b.a.sha256, b: b.b.sha256, core: b.core_sha256, brief_a: `.cursor/mcbylaw/keying/${batch}/briefs/${slug}.a.md`, unit_shas: b.unit_shas };
    }
    writeLf(briefsFile, stableStringify(index));
    console.log(`${wanted.length} brief pair${wanted.length === 1 ? '' : 's'} → ${path.relative(root, path.join(dir, 'briefs'))}`);
    return 0;
  }
  if (cmd === 'seal') {
    const plan = loadPlan();
    const seals = readJson(sealsFile, { seals: [] });
    const disk = onDisk();
    const used = [...seals.seals.map((s) => s.seal_id), ...[...disk.values()].map((s) => s.prov && s.prov.a_seal && s.prov.a_seal.seal_id)];
    let n = 0;
    let bad = 0;
    for (const shard of plan.shards.filter((s) => !args.shard || s.key === args.shard)) {
      const p = shardPaths(shard.key);
      const aAbs = path.join(root, p.a);
      if (!fs.existsSync(aAbs)) continue;
      if (fs.existsSync(path.join(root, p.b))) continue; // sealed and keyed already
      const prior = seals.seals.find((s) => s.shard === shard.key);
      const bytes = fs.readFileSync(aAbs);
      if (prior && prior.sha256 === draftSha(bytes)) continue;
      if (prior && !args.reseal) {
        console.error(`REFUSED ${shard.key}: the A draft changed since seal ${prior.seal_id}; pass --reseal (allowed only before B runs)`);
        bad++;
        continue;
      }
      try {
        const s = sealDraft({ aBytes: bytes, shardKey: shard.key, usedSealIds: used, shard });
        seals.seals = seals.seals.filter((x) => x.shard !== shard.key);
        seals.seals.push({ shard: shard.key, sha256: s.sha256, seal_id: s.seal_id });
        used.push(s.seal_id);
        n++;
        console.log(`sealed ${shard.key} #${s.seal_id} ${s.sha256.slice(0, 12)}…`);
      } catch (err) {
        if (!(err instanceof KeyingError)) throw err;
        console.error(`REFUSED ${shard.key}: ${err.message}`);
        bad++;
      }
    }
    seals.seals.sort((x, y) => x.seal_id - y.seal_id);
    writeLf(sealsFile, stableStringify(seals));
    console.log(`${n} sealed${bad ? `, ${bad} refused` : ''}`);
    return bad ? 1 : 0;
  }
  if (cmd === 'run-b') {
    const plan = loadPlan();
    const briefs = readJson(briefsFile, null);
    if (!briefs) throw new KeyingError('briefs_missing', `run: keying-cli.mjs briefs --batch ${batch}`);
    const seals = readJson(sealsFile, { seals: [] });
    const bRoot = path.resolve(args.bRoot || path.join(path.dirname(root), 'Buildo-wt-keyer-b'));
    const engine = path.resolve(args.engine || path.join(root, 'scripts', 'deepseek-exec.js'));
    const key = process.env.DEEPSEEK_API_KEY || readEnvKey(path.resolve(args.dotenv || 'C:/Users/User/Buildo/.env'), 'DEEPSEEK_API_KEY');
    if (!key) throw new KeyingError('engine_unavailable', 'no DEEPSEEK_API_KEY (env or --dotenv); keyer B never downgrades to claude');
    const commit = ensureKeyerBWorktree({ mainRoot: root, bRoot });
    const runEngine = spawnEngine({ engine, env: engineEnv(process.env, key) });
    const aPaths = plan.shards.map((s) => shardPaths(s.key).a);
    const todo = plan.shards.filter((s) => (!args.shard || s.key === args.shard) && seals.seals.some((x) => x.shard === s.key) && !fs.existsSync(path.join(root, shardPaths(s.key).b)));
    console.log(`keyer B: ${todo.length} sealed shards, worktree ${bRoot} @ ${commit.slice(0, 12)}, parallel ${Number(args.parallel) || 4}`);
    let bad = 0;
    const one = async (shard) => {
      const p = shardPaths(shard.key);
      const seal = seals.seals.find((x) => x.shard === shard.key);
      const aSha = draftSha(fs.readFileSync(path.join(root, p.a)));
      const bText = fs.readFileSync(path.join(dir, 'briefs', `${shardSlug(shard.key)}.b.md`), 'utf8');
      try {
        const r = await runKeyerB({ mainRoot: root, bRoot, shard, briefB: { text: bText, sha256: briefs[shard.key].b }, seal, aSha, aPaths, runEngine });
        // the seal is re-checked after B: an A draft edited while B ran is refused, never sealed retroactively
        if (draftSha(fs.readFileSync(path.join(root, p.a))) !== seal.sha256) throw new KeyingError('seal_mismatch', `${shard.key}: A's draft changed while B ran`);
        writeLf(path.join(root, p.b), r.b_bytes);
        const prov = buildProv({ shardKey: shard.key, briefs: briefs[shard.key], seal, bRun: r.b_run, unitShas: briefs[shard.key].unit_shas, batch, supersedes: shard.supersedes || null });
        writeLf(path.join(root, p.prov), stableStringify(prov));
        console.log(`B ok ${shard.key} run ${r.b_run.run_id}`);
      } catch (err) {
        if (!(err instanceof KeyingError)) throw err;
        bad++;
        console.error(`B REFUSED ${err.message}`);
      }
    };
    const queue = [...todo];
    const workers = Array.from({ length: Math.max(1, Number(args.parallel) || 4) }, async () => {
      while (queue.length) await one(queue.shift());
    });
    await Promise.all(workers);
    return bad ? 1 : 0;
  }
  if (cmd === 'queue') {
    const plan = loadPlan();
    const ctx = context(root);
    const keys = new Set(plan.shards.map((s) => s.key));
    const shards = [...onDisk().values()].filter((s) => keys.has(s.key));
    const adjudications = readJson(path.join(root, ADJ_REL), { adjudications: [] });
    const agree = checkAgree({ shards, adjudications, vocab: ctx.vocab });
    const q = buildQueue({ batch, agree, slice: ctx.slice, shards, adjudications });
    writeLf(path.join(dir, `adjudication-queue-${batch}.json`), stableStringify(q));
    writeLf(path.join(dir, `adjudication-queue-${batch}.md`), renderQueueMd(q));
    const c = agree.counts;
    console.log(`G-AGREE ${agree.status}: units agreed ${c.units_agreed} · adjudicated ${c.units_adjudicated} · pending ${c.units_pending}; agreement_rate ${agree.agreement_rate === null ? 'n/a' : agree.agreement_rate.toFixed(3)} ${agree.agreement_label}`);
    for (const v of agree.violations) console.error(`  ${v.code}: ${v.id} ${v.detail}`);
    console.log(`queue: ${q.items.length} open disagreements → ${path.relative(root, path.join(dir, `adjudication-queue-${batch}.md`))}`);
    return agree.status === 'fail' ? 1 : 0;
  }
  if (cmd === 'apply') {
    if (!args.answers || !args.adjudicator) throw new KeyingError('usage', 'apply needs --answers <file> and --adjudicator <id>');
    if (Object.values(KEYER_IDS).includes(args.adjudicator)) throw new KeyingError('adjudicator_is_keyer', `${args.adjudicator} is a keyer`);
    const q = readJson(path.join(dir, `adjudication-queue-${batch}.json`), null);
    if (!q) throw new KeyingError('queue_missing', `run: keying-cli.mjs queue --batch ${batch}`);
    const parsed = parseAnswers(fs.readFileSync(path.resolve(args.answers), 'utf8'));
    const adjFile = path.join(root, ADJ_REL);
    const existing = readJson(adjFile, { adjudications: [] });
    const r = applyAnswers({ queue: q, answers: parsed.answers, adjudicator: args.adjudicator, on: nowIso().slice(0, 10), existing });
    for (const e of [...parsed.errors, ...r.errors]) console.error(`REFUSED ${e}`);
    if (r.entries.length) {
      existing.adjudications = [...existing.adjudications, ...r.entries];
      writeLf(adjFile, stableStringify(existing));
    }
    console.log(`${r.entries.length} adjudications appended to ${ADJ_REL}; ${parsed.errors.length + r.errors.length} refused`);
    return parsed.errors.length + r.errors.length ? 1 : 0;
  }
  if (cmd === 'correct') {
    if (!args.corrections || !args.adjudicator) throw new KeyingError('usage', 'correct needs --corrections <file> and --adjudicator <id>');
    if (Object.values(KEYER_IDS).includes(args.adjudicator)) throw new KeyingError('adjudicator_is_keyer', `${args.adjudicator} is a keyer`);
    const parsed = readJson(path.resolve(args.corrections), null);
    if (!parsed || !Array.isArray(parsed.corrections)) throw new KeyingError('usage', `correct: ${args.corrections} is not {corrections: [...]}`);
    const adjFile = path.join(root, ADJ_REL);
    const existing = readJson(adjFile, { adjudications: [] });
    const have = new Set(existing.adjudications.map((e) => e.id));
    const byCorId = new Map(); // every `kind: correction` record id → record (Spec 69a M-75 note: supersede target)
    for (const e of existing.adjudications) if (e && typeof e === 'object' && e.kind === 'correction' && isStrVal(e.id)) byCorId.set(e.id, e);
    const alreadySuperseded = new Set(); // a correction id another record already supersedes
    for (const e of existing.adjudications) if (e && typeof e === 'object' && e.kind === 'correction' && isStrVal(e.supersedes)) alreadySuperseded.add(e.supersedes);
    const on = nowIso().slice(0, 10);
    const refused = [];
    for (const c of parsed.corrections) {
      const { unit, field } = c || {};
      if (!isStrVal(unit) || !isStrVal(field) || !isStrVal(c.rule) || !Object.hasOwn(c, 'value')) {
        refused.push(`${unit ?? '?'}/${field ?? '?'}: needs unit, field, rule and a value`);
        continue;
      }
      if (Object.hasOwn(c, 'supersedes')) {
        // Spec 69a M-75 note 2026-10-08: the new record replaces an earlier correction of the same (unit, field)
        const t = isStrVal(c.supersedes) ? byCorId.get(c.supersedes) : null;
        if (!t || t.unit !== unit || t.field !== field) {
          refused.push(`${unit}/${field}: supersedes ${c.supersedes ?? '?'}, which is not a correction of the same unit and field`);
          continue;
        }
        if (alreadySuperseded.has(c.supersedes)) {
          refused.push(`${unit}/${field}: ${c.supersedes} is already superseded`);
          continue;
        }
        const m = /~s(\d+)$/.exec(c.supersedes); // deterministic new id: <id>~s1, <id>~s<n+1>
        const id = m ? `${c.supersedes.slice(0, m.index)}~s${Number(m[1]) + 1}` : `${c.supersedes}~s1`;
        if (have.has(id)) {
          refused.push(`${id}: already in ${ADJ_REL}`);
          continue;
        }
        existing.adjudications.push({ id, kind: 'correction', unit, field, value: c.value, reason: c.reason, rule: c.rule, adjudicator: args.adjudicator, adjudicated_on: on, supersedes: c.supersedes });
        have.add(id);
        byCorId.set(id, existing.adjudications[existing.adjudications.length - 1]);
        alreadySuperseded.add(c.supersedes);
        continue;
      }
      const id = `COR-${unit}/${field}`;
      if (have.has(id)) {
        refused.push(`${id}: already in ${ADJ_REL} (pass supersedes:"<COR id>" to replace it)`);
        continue;
      }
      existing.adjudications.push({ id, kind: 'correction', unit, field, value: c.value, reason: c.reason, rule: c.rule, adjudicator: args.adjudicator, adjudicated_on: on });
      have.add(id);
      byCorId.set(id, existing.adjudications[existing.adjudications.length - 1]);
    }
    for (const e of refused) console.error(`REFUSED ${e}`);
    const appended = parsed.corrections.length - refused.length;
    if (appended) writeLf(adjFile, stableStringify(existing));
    console.log(`${appended} corrections appended to ${ADJ_REL}; ${refused.length} refused`);
    return refused.length ? 1 : 0;
  }
  if (cmd === 'rekey') {
    if (!args.shard || typeof args.shard !== 'string') throw new KeyingError('usage', 'rekey needs --shard <key> [--units <id,id>]');
    const plan = loadPlan();
    const base = shardGeneration(args.shard).base;
    const gens = plan.shards.filter((s) => shardGeneration(s.key).base === base).sort((x, y) => shardGeneration(x.key).gen - shardGeneration(y.key).gen);
    if (!gens.length) throw new KeyingError('rekey_unplanned', `${base} is not in the ${batch} plan`);
    const pred = gens[gens.length - 1].key;
    const pp = shardPaths(pred);
    for (const f of [pp.a, pp.b, pp.prov]) if (!fs.existsSync(path.join(root, f))) throw new KeyingError('rekey_predecessor_incomplete', `${pred}: ${f} is missing (only a fully keyed shard is re-keyed)`);
    const supersedes = { a_sha: draftSha(fs.readFileSync(path.join(root, pp.a))), b_sha: draftSha(fs.readFileSync(path.join(root, pp.b))), prov_sha: draftSha(fs.readFileSync(path.join(root, pp.prov))) };
    const ctx = context(root);
    const fresh = planBatch({ slice: ctx.slice, inScopeIds: ctx.inScope, batch, maxUnits: plan.max_units }).shards.find((s) => s.key === base);
    if (!fresh) throw new KeyingError('rekey_unplanned', `${base} does not re-plan from the current slice`);
    const unitIds = typeof args.units === 'string' ? args.units.split(',').map((x) => x.trim()).filter(Boolean) : null;
    const nu = rekeyShard({ shard: fresh, existingKeys: plan.shards.map((s) => s.key), unitIds, supersedes });
    plan.shards.push(nu);
    writeLf(planFile, stableStringify(plan));
    const specText = fs.readFileSync(path.join(root, SPEC68), 'utf8');
    const b = buildBriefs({ shard: nu, slice: ctx.slice, vocab: ctx.vocab, specText, batch });
    const slug = shardSlug(nu.key);
    writeLf(path.join(dir, 'briefs', `${slug}.a.md`), b.a.text);
    writeLf(path.join(dir, 'briefs', `${slug}.b.md`), b.b.text);
    const index = readJson(briefsFile, {});
    index[nu.key] = { a: b.a.sha256, b: b.b.sha256, core: b.core_sha256, brief_a: `.cursor/mcbylaw/keying/${batch}/briefs/${slug}.a.md`, unit_shas: b.unit_shas };
    writeLf(briefsFile, stableStringify(index));
    console.log(`rekey ${nu.key} supersedes ${pred} (${nu.units.length} units): brief A .cursor/mcbylaw/keying/${batch}/briefs/${slug}.a.md → keyer A writes ${shardPaths(nu.key).a}; then seal --shard ${nu.key} and run-b --shard ${nu.key}`);
    return 0;
  }
  if (cmd === 'status') {
    const plan = loadPlan();
    const seals = readJson(sealsFile, { seals: [] });
    const disk = onDisk();
    const ready = [];
    const counts = { no_a: 0, sealed_waiting_b: 0, unsealed: 0, ready: 0 };
    for (const s of plan.shards) {
      const d = disk.get(s.key);
      const sealed = seals.seals.find((x) => x.shard === s.key);
      if (!d || !d.a) counts.no_a++;
      else if (d.b && d.prov) {
        counts.ready++;
        ready.push(...Object.values(shardPaths(s.key)));
      } else if (sealed) counts.sealed_waiting_b++;
      else counts.unsealed++;
    }
    console.log(`${batch}: ${plan.shards.length} shards · no A ${counts.no_a} · A unsealed ${counts.unsealed} · sealed, waiting B ${counts.sealed_waiting_b} · a+b+prov ready ${counts.ready}`);
    if (ready.length) console.log(`commit together:\n  git add ${ready.join(' ')}`);
    return 0;
  }
  console.error(`unknown command ${cmd}`);
  return 2;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.error(err instanceof KeyingError ? err.message : err && err.stack ? err.stack : String(err));
    process.exitCode = 2;
  },
);


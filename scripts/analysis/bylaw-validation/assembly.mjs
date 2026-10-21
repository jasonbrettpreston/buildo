// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §7.5, §7.6 (the evaluator and its unit set)
//
// The real-lot unit assembly, shared by eval-lots.mjs and the golden-lot test helper (src/tests/helpers/bylaw-golden-lots.ts)
// so the two cannot drift. Unchanged from eval-lots.mjs (2026-10-19): the agreed units (agree.mjs, adjudications applied),
// their generated fields (authored.mjs), the displacement links (xref.mjs displacesOf, as validate.mjs G-EVAL), and
// makeContext(evaluatorVocab, enactments, absences, exception authoring state per ruling (d)). Reads the tree only.
import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';

export async function loadRealLotAssembly(root) {
  const mod = (rel) => import(pathToFileURL(path.join(root, rel)).href);
  const V = await mod('scripts/analysis/bylaw/validate.mjs'); const AU = await mod('scripts/analysis/bylaw/authored.mjs');
  const AG = await mod('scripts/analysis/bylaw/agree.mjs'); const VO = await mod('scripts/analysis/bylaw/vocab.mjs');
  const E = await mod('scripts/analysis/bylaw/evaluate.mjs'); const X = await mod('scripts/analysis/bylaw/xref.mjs');
  const I = V.loadInputs({ root });
  const external = JSON.parse(fs.readFileSync(path.join(root, 'scripts/seeds/bylaw/external.json'), 'utf8'));
  const ag = AG.checkAgree({ shards: AU.loadAuthored(root), adjudications: I.adjudications, vocab: I.vocab });
  const index = AU.buildIndex(I.slice);
  const base = [...AG.agreedUnits(ag).values()].map(AU.withGeneratedFields);
  // include_ref (Spec 68 §6 G): the generated link of an INCLUDE unit, set only when it names a Ch.900 exception row, which is
  // what the loader (evaluate.mjs loadCandidates) and the lot gate (ruling (d)) expand; a section / article / base-row
  // INCLUDE has no exception units to expand and is left unlinked.
  const includeLink = (u) => {
    if (u.archetype !== 'INCLUDE') return {};
    let r = null; try { r = X.includeOf(index, u.unit_id, external); } catch { /* unresolved: no link */ }
    return r && r.resolved && r.resolved.ok && r.resolved.kind === 'row' && /^900\.[2-6]\.10\(\d+\)$/.test(r.resolved.id) ? { include_ref: r.resolved.id } : {};
  };
  const units = base.map((u) => { let d = { targets: [], optional_variation: false }; try { d = X.displacesOf(index, u.unit_id, I.vocab, external); } catch { /* unresolved: no links */ } return { ...u, displaces: d.targets.map((t) => t.id), displaces_optional: d.optional_variation === true, ...includeLink(u) }; });
  const enactments = {}; for (const p of I.snap.pages || []) Object.assign(enactments, E.enactedDatesFromText(p.normalized || ''));
  // exception authoring state (ruling (d)), as the review builder: authored when every unit of the exception is agreed / adjudicated
  const isExcReg = (r) => /^900\.\d+\.10\(/.test(r);
  const excState = new Map();
  for (const [id, rec] of ag.units) {
    const reg = AU.splitUnitId(id).reg.replace(/~.*$/, ''); if (!isExcReg(reg)) continue;
    const s = excState.get(reg) || { agreed: new Set(), pending: new Set(), pendingN: 0 };
    const tg = [].concat((rec.unit && rec.unit.target) || []).filter((t) => t && t !== 'none');
    if (rec.state === 'agreed' || rec.state === 'adjudicated') tg.forEach((t) => s.agreed.add(t)); else { s.pendingN++; tg.forEach((t) => s.pending.add(t)); }
    excState.set(reg, s);
  }
  const authored = {}; for (const [reg, s] of excState) authored[reg] = s.pendingN === 0 ? 'authored' : { status: 'partial', targets: [...s.agreed].filter((t) => !s.pending.has(t)).sort() };
  const C = E.makeContext(VO.evaluatorVocab(I.vocab), { enactments, absences: I.absences, authored });
  return { I, E, units, C };
}

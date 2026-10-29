// SPEC LINK: docs/specs/01-pipeline/68_mcbylaw_standard.md §7.5, §7.6 (evaluator + unit assembly it reads);
//            docs/specs/01-pipeline/69a_mcbylaw_register.md M-125, M-127 (CoA oracle C comparison), M-236 dated note 2026-10-20 (City examiner figures)
// DRAFT RULING (operator to ratify; see coa-data/ruling-draft-coa-scorecard-tools.md): CoA notice reader + scorecard tools live here, read-only, values only.
/* CoA notice reader: turns a pasted Toronto Committee of Adjustment notice
   (public hearing notice or notice of decision) into values only.
   Agent and owner names are read so they can be removed, and are never returned. */
(function (root) {
  'use strict';
  var PARSER_VERSION = 'coa-parse/1';
  var MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  var NAME_STOP = { THE: 1, AND: 1, INC: 1, LTD: 1, CORP: 1, LIMITED: 1, OF: 1, FOR: 1, TRUSTEE: 1, ESTATE: 1, PROJECT: 1 }; // MB-03b: "project" is a verb in the variance text ("eaves may project"), never a name

  function clean(text) {
    return String(text || '')
      .replace(/\r\n?/g, '\n')
      .replace(/[￼ ]/g, ' ')
      .split('\n')
      .map(function (l) { return l.replace(/\s+$/, ''); })
      .filter(function (l) {
        if (/^\s*[A-Z]\d{4}\/\d{2}[A-Z]{2,4}\s+\d+\s*$/.test(l)) return false; // page footer "A0383/26TEY 2"
        if (/^\s*Pub Hearing Notice.*Page \d+\s*$/i.test(l)) return false;
        if (/^\s*Page \d+ of \d+\s*$/i.test(l)) return false;
        if (/^\s*Decision Notice - MV\.doc(\s+Page \d+)?\s*$/i.test(l)) return false; // Etobicoke York footer
        if (/^\s*Page \d+\s*$/i.test(l)) return false;
        if (/^\s*[A-Z]\d{4}\/\d{2}[A-Z]{2,4}\s*$/.test(l)) return false; // bare file number running header
        return true;
      });
  }

  var HEADER_LABELS = /\s+(?=(?:File Number|Property Address|Legal Description|Agent|Owner\(s\)|Zoning|Ward|Community|Heritage):?(?:\s|$))/g;
  function splitHeader(lines) {
    var out = [], inHeader = true;
    lines.forEach(function (l) {
      if (/PURPOSE OF THE APPLICATION/i.test(l)) inHeader = false;
      if (!inHeader) { out.push(l); return; }
      l.split(HEADER_LABELS).forEach(function (p) { out.push(p.trim()); });
    });
    return out;
  }

  function flat(lines) { return lines.join(' ').replace(/\s+/g, ' ').trim(); }

  function field(lines, label) {
    // Colon optional ("Zoning RM & R2" on 2017 notices); a bare "Community:" reads as empty.
    var esc = label.replace(/[()]/g, '\\$&');
    var re = new RegExp('^\\s*' + esc + '\\s*:?\\s+(.*)$|^\\s*' + esc + '\\s*:\\s*()$', 'i');
    for (var i = 0; i < lines.length; i++) { var m = lines[i].match(re); if (m) return (m[1] || m[2] || '').trim(); }
    return '';
  }

  // Agent and Owner(s) lines plus their continuation lines, up to the next "Label:" line.
  function nameLines(lines) {
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/^\s*(Agent|Owner\(s\)|Owners?|Applicant)\s*:\s*(.*)$/i);
      if (!m) continue;
      out.push(m[2]);
      for (var j = i + 1; j < lines.length; j++) {
        if (/^\s*[A-Z][A-Za-z()' ]{1,30}:\s/.test(lines[j]) || !lines[j].trim()) break;
        out.push(lines[j]);
      }
    }
    return out;
  }

  function nameTokens(lines) {
    var toks = {};
    nameLines(lines).join(' ').split(/[^A-Za-z'-]+/).forEach(function (w) {
      var u = w.toUpperCase();
      if (u.length >= 3 && !NAME_STOP[u]) toks[u] = 1;
    });
    return Object.keys(toks);
  }

  function scrub(s, toks) {
    if (!s) return s;
    s = s.replace(/\b(?:Mr|Ms|Mrs|Miss|Dr)\.?\s+[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+)?/g, '[name removed]')
         .replace(/\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}\b/g, '[phone removed]')
         .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email removed]');
    toks.forEach(function (t) {
      s = s.replace(new RegExp('\\b' + t.replace(/[-']/g, '\\$&') + '\\b', 'gi'), '[name removed]');
    });
    return s;
  }

  function isoDate(s) {
    var m = String(s || '').match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
    if (!m) return '';
    var mi = MONTHS.indexOf(m[1].toLowerCase());
    if (mi < 0) return '';
    return m[3] + '-' + String(mi + 1).padStart(2, '0') + '-' + String(m[2]).padStart(2, '0');
  }

  function parseZoning(label) {
    var z = { label: label, zone: '', f: null, a: null, d: null, u: null, exceptions: [] };
    if (!label) return z;
    var zm = label.match(/^\s*([A-Z]{1,4})\b/); if (zm) z.zone = zm[1];
    var f = label.match(/\bf\s*(\d+(?:\.\d+)?)/i); if (f) z.f = Number(f[1]);
    var a = label.match(/\ba\s*(\d+(?:\.\d+)?)/i); if (a) z.a = Number(a[1]);
    var d = label.match(/\bd\s*(\d+(?:\.\d+)?)/i); if (d) z.d = Number(d[1]);
    var u = label.match(/\bu\s*(\d+)/); if (u) z.u = Number(u[1]); // RM unit cap, e.g. "RM (f12,u4,d 0.8)"
    var xr = /\(x(\d+)\)/gi, xm; while ((xm = xr.exec(label))) z.exceptions.push('x' + xm[1]);
    return z;
  }

  var UNIT_RE = /(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(m²|m2|sq\.?\s?m\b|m\b|%|times the (?:area of the lot|lot area)|storeys?\b|parking spaces?\b|dwelling units?\b)/gi;
  function unitName(u) {
    u = u.toLowerCase();
    if (u === 'm²' || u === 'm2' || /^sq/.test(u)) return 'm²';
    if (u === 'm') return 'm';
    if (u === '%') return '%';
    if (/^times/.test(u)) return '× lot area';
    if (/^storey/.test(u)) return 'storeys';
    if (/^parking/.test(u)) return 'parking spaces';
    if (/^dwelling/.test(u)) return 'dwelling units';
    return u;
  }
  function numberWords(s) {
    // "a maximum height of one storey" / "two storeys"
    return String(s || '').replace(/number of storeys is (\d+)/gi, '$1 storeys').replace(/\b(one|two|three|four)\s+(storeys?)\b/gi, function (_, w, u) { return { one: 1, two: 2, three: 3, four: 4 }[w.toLowerCase()] + ' ' + u; });
  }
  function measuresAt(s) {
    var out = [], m; UNIT_RE.lastIndex = 0;
    while ((m = UNIT_RE.exec(s))) out.push({ value: Number(m[1].replace(/,/g, '')), unit: unitName(m[2]), at: m.index, end: m.index + m[0].length });
    return out;
  }
  function measures(s) {
    return measuresAt(numberWords(s)).map(function (m) { return { value: m.value, unit: m.unit }; });
  }

  // MB-03 (69a CHAT-136.B10-PARSER "a qualifying phrase's first number read as the requirement"; Spec 129:93(b): a figure after a conditional marker is a
  // CONDITION, used only when the main clause holds none; a figure that restates where the rule applies is context). The requirement figure is the one
  // the limit word governs. Phrases below carry a number that says WHERE or WHEN the rule applies, never the limit.
  var N_ = '\\d+(?:\\.\\d+)?\\s*m\\b';
  var QUALIFIERS = [
    // "attached to or within 0.3 m of a building", "less than 7.5 m from the residential building" (not "no less than 7.5 m from ...", which is the limit)
    new RegExp('(?:attached to or\\s+|located\\s+)?(?<!\\bno\\s)(?<!\\bnot\\s)\\b(?:within|less than|(?:more|greater) than)\\s+' + N_ + '\\s+(?:of|from)\\s*:?\\s*(?:\\([A-Za-z]\\)\\s*)?(?:a|an|the)\\s+(?:\\w+\\s+){0,2}?(?:building|main wall)\\b', 'gi'),
    new RegExp('\\bbeginning from a height of\\s+' + N_ + ',?', 'gi'),
    new RegExp('\\bat a height (?:greater|higher|more) than\\s+' + N_ + '(?:\\s+above (?:established )?grade)?', 'gi'),
    new RegExp(',?\\s*which (?:are|is) (?:greater|higher|more) than\\s+' + N_ + '[^,]*,', 'gi'),
    // "on a lot with a lot frontage of less than 9 m", "with a minimum required lot frontage of 18.0 m or less", "for lots with a lot frontage of 6.0 m to 23.0 m inclusive"
    new RegExp('\\b(?:for\\s+)?(?:on\\s+a\\s+)?lots?\\s+with\\s+(?:a\\s+)?(?:lot\\s+)?frontage\\s+of\\s+(?:(?:less|more|greater) than\\s+|at least\\s+)?' + N_ + '(?:\\s+to\\s+' + N_ + '(?:\\s+inclusive)?|\\s+or\\s+(?:less|more))?,?', 'gi'),
    new RegExp('\\bwith\\s+a\\s+(?:minimum\\s+required\\s+)?lot\\s+frontage\\s+of\\s+' + N_ + '(?:\\s+or\\s+(?:less|more))?,?', 'gi'),
    new RegExp('\\bon a lot with a lot frontage of (?:less|more|greater) than\\s+' + N_, 'gi'),
    // "accessed by a one-way or two-way drive aisle having a width of 6.0 m or more,"
    /,?\s*accessed by\b[^,]*,/gi,
    new RegExp('\\bor\\s+a\\s+townhouse\\s+dwelling\\s+unit\\s+at\\s+least\\s+' + N_ + '\\s+wide,?', 'gi')
  ];
  var CONDITION_RE = /\b(?:if|provided(?:\s+that)?|except(?:\s+where)?|unless|including\s+(?:a|the)\s+total)\b/i;
  var LIMIT_WORD_RE = /\b(?:maximum|minimum|required|permitted|no\s+(?:less|more|greater)\s+than)\b/i;

  // The figures of the requirement sentence that can be the limit, in reading order, with a flag for the ones a limit word introduces.
  function requirementFigures(requirement) {
    var s = numberWords(requirement);
    QUALIFIERS.forEach(function (re) { s = s.replace(re, ' '); });
    var c = s.search(CONDITION_RE), main = c > 0 ? s.slice(0, c) : s;
    var ms = measuresAt(main);
    if (!ms.length) { main = s; ms = measuresAt(s); }
    return {
      figures: ms.map(function (m) { return { value: m.value, unit: m.unit }; }),
      anchored: ms.map(function (m, i) { return LIMIT_WORD_RE.test(main.slice(i ? ms[i - 1].end : 0, m.at)); })
    };
  }
  // One figure among those in `unit` (all units when null): the only one a limit word introduces, else the first. ambiguous = another value competes.
  function pickFigure(rf, unit) {
    var idx = [];
    rf.figures.forEach(function (m, i) { if (!unit || m.unit === unit) idx.push(i); });
    if (!idx.length) return { figure: null, ambiguous: false };
    var anch = idx.filter(function (i) { return rf.anchored[i]; });
    var at = anch.length === 1 ? anch[0] : idx[0];
    var f = rf.figures[at];
    return { figure: f, ambiguous: idx.some(function (i) { return rf.figures[i].value !== f.value; }) };
  }


  // MB-03b (MB03-Q2, recorded fc117484): a requirement sentence yields one check per stated limit. Every figure is a limit, a condition (says when the rule applies),
  // a definition ("attached to or within 0.3 m of a building": decides whether the rule applies, disclosed when relied on) or proposal text that spilled into the sentence.
  var DEF_RE = new RegExp('(?:attached to or\\s+(?:located\\s+)?)?(?<!\\bno\\s)(?<!\\bnot\\s)\\b(?:within|less than)\\s+' + N_ + '\\s+(?:of|from)\\s*:?\\s*(?:\\([A-Za-z]\\)\\s*)?(?:a|an|the)\\s+(?:\\w+\\s+){0,2}?(?:building|main wall)\\b', 'gi');
  function spansOf(s, res) {
    var out = [];
    res.forEach(function (re) { re.lastIndex = 0; var m; while ((m = re.exec(s))) { out.push({ at: m.index, end: m.index + m[0].length, text: m[0] }); if (m[0].length === 0) re.lastIndex++; } });
    return out;
  }
  function lineWord(t) {
    var m = /\b(front|rear|side|north|south|east|west)\b/i.exec(t || ''); if (!m) return null;
    return /^(north|south|east|west)$/i.test(m[1]) ? 'side' : m[1].toLowerCase();
  }
  function requirementLimits(requirement) {
    var s = numberWords(requirement), ms = measuresAt(s), out = [];
    var defSpans = spansOf(s, [DEF_RE]);
    var condSpans = spansOf(s, QUALIFIERS.slice(1));
    var pm = /(?:^|[.;]\s+)(?:and\s+)?with the addition\b/i.exec(s) || /\bThe proposed\b/.exec(s), proposalAt = pm ? pm.index : -1;
    ms.forEach(function (m, i) {
      var prev = i ? ms[i - 1].end : 0, L = s.slice(prev, m.at), R = s.slice(m.end, i + 1 < ms.length ? ms[i + 1].at : s.length);
      var kind = 'limit', role = null;
      var inDef = defSpans.some(function (d) { return m.at >= d.at && m.end <= d.end; });
      var defSp = defSpans.filter(function (d) { return m.at >= d.at && m.end <= d.end; })[0];
      if (proposalAt >= 0 && m.at >= proposalAt) kind = 'proposal';
      else if (/\b(?:with the addition|proposed)\b[^.;]*$/i.test(L) && /\bproposed\b/i.test(L)) kind = 'proposal';
      else if (inDef && (/^attached to or/i.test(defSp.text) || m.value <= 0.3)) kind = 'definition';
      else if (inDef || condSpans.some(function (d) { return m.at >= d.at && m.end <= d.end; })) kind = 'condition';
      else if (/\b(?:height|frontage|width|depth)\b[^.;]*\b(?:greater|higher|more|taller|less|lower|smaller)\s+than\s*$/i.test(L)) kind = 'condition';
      else if (/\blocated\s+(?:less|more)\s+than\s*$/i.test(L)) kind = 'condition';
      else if (/\bif\b[^.;:]*\bno\s+higher\s+than\s*$/i.test(L) && /^\s*above\b/i.test(R)) kind = 'condition';
      else if (/\bif\b[^.;:]*\b(?:within|located)\s*$/i.test(L)) kind = 'condition';
      else if (/^\s*(?:m\s+)?or\s+(?:less|more)\b/i.test(R)) kind = 'condition';
      else if (/\bfor every\s*$/i.test(L)) kind = 'condition';
      else if (/\(\s*$/.test(L) && /^\s*\)/.test(R)) kind = 'derived'; // "10 % of the lot frontage, to a maximum of 3 m (1.68 m)": the bracketed figure is the worked result of the limit
      if (kind === 'limit') {
        var L2 = L.slice(-60), R1 = R.split(/[.;]/)[0].slice(0, 45);
        if (/\bcloser\b/i.test(L)) role = 'clearance';
        else if (/vertical clearance/i.test(R1) || /vertical clearance[^.]*$/i.test(L2)) role = 'vertical_clearance';
        else if (/^\s*(?:m\s*)?(?:wide|in width)\b/i.test(R1) || /\bwidth\s+of\s*$/i.test(L2) || /^\s*in width/i.test(R1)) role = 'width';
        else if (/^\s*(?:m\s*)?(?:long|in length)\b/i.test(R1) || /\b(?:building |minimum )?length\s+(?:of|is)\s*$/i.test(L2)) role = 'length';
        else if (/(project|encroach)/i.test(L)) role = 'encroachment';
        else {
          var lw = /^\s*(?:from|on)\b/i.test(R1) ? lineWord(R1) : (lineWord(L.slice(-50)) || lineWord(R1));
          if (lw && m.unit === 'm') role = 'setback:' + lw;
        }
        if (!role && /\b(?:length|depth)\b/i.test(L2) && !/setback/i.test(L2)) role = 'length';
      }
      out.push({ value: m.value, unit: m.unit, kind: kind, role: role });
    });
    return out;
  }

  // CHAT-198.NN-Q1 (operator 2026-10-29): "where the notice prints the other building's figure, that figure is the comparator." A requirement that prints no figure and
  // compares the building with the residential (main) building ("must be less than the gross floor area of the residential building on a lot") takes the figure the
  // proposal prints in brackets for that other building ("... than the gross floor area of the residential building on the lot (86.02 m²)"). Null when it does not apply.
  function referentFigure(requirement, proposal) {
    var rq = String(requirement || ''), pr = String(proposal || '');
    if (!rq || measures(rq).length) return null;
    if (!/\b(?:less|smaller|greater|larger|more|fewer)\s+than\s+the\b[^.]*\b(?:residential|main|principal)\s+(?:building|dwelling|house)\b/i.test(rq)) return null;
    var m = /\b(?:residential|main|principal)\s+(?:building|dwelling|house)\b[^()]*\(\s*([^()]*?)\s*\)/i.exec(pr);
    var got = m ? measures(m[1]) : [];
    return got.length === 1 ? got[0] : null;
  }

  // Whichever limit word comes first governs ("A minimum of 85% ... a walkway which may have a maximum width" is a minimum).
  function limitKind(req) {
    var mx = req.search(/\bmaximum\b|may not exceed|not exceed|no more than/i);
    var mn = req.search(/\bminimum\b|must comply|at least|no closer/i);
    if (mx < 0 && mn < 0) return 'other';
    if (mn < 0) return 'max';
    if (mx < 0) return 'min';
    return mx < mn ? 'max' : 'min';
  }

  // Proposed-side sentences: "will ...", "In this case ...", or a present-tense fact for legalizations ("is located", "has", "encroaches").
  function isProposal(sent) {
    if (/^In this case,?\s+(?!\d)|\bwill\b|^The proposed\b|^A total of\b/i.test(sent)) return true;
    return /\b(has|have|is located|are located|encroaches|covers|is set back)\b/i.test(sent) && !/\b(maximum|minimum|may|must|permitted|required)\b/i.test(sent.replace(/required (front|rear|side) yard|required (building )?setback/gi, ''));
  }

  var HEADER_RE = /^\s*(\*)?\s*(?:(\d+)\.\s*)?((?:Chapter|Section|Exception)\s+.+?),\s*(By-?law\s+[\w-]+.*)$/i;
  function normClause(c) {
    var s = c.replace(/^\s*(?:Chapter|Section)\s+/i, '').replace(/^10\s+(?=10\.)/, '').replace(/(\d)[.\s]+(?=\()/g, '$1').replace(/\.\s*$/, '').trim();
    return s;
  }


  // The requirement and proposed figures of one variance, from its two sentences. Also the re-parse entry point for stored notices.
  function readFigures(requirement, proposal) {
    var rq = measures(requirement), pr = measures(proposal);
    var rf = requirementFigures(requirement);
    if (!rf.figures.length) rf = { figures: rq, anchored: rq.map(function () { return false; }) };
    var req = pickFigure(rf, null).figure || rq[0] || null, check = false;
    // The proposed figure is the first one in a unit the requirement also uses ("6 parking spaces with a width of 2.6 m" -> 2.6 m).
    var prp = pr.filter(function (m) { return rq.some(function (r) { return r.unit === m.unit; }); })[0] || pr[0] || null;
    if (prp) {
      var pk = pickFigure(rf, prp.unit);
      // "must comply with the required minimum building setbacks for the zone (0.9 m)": the bracketed figure governs
      var paren = measures((requirement.match(/(?:\(\s*|;\s*|\bzone,?\s*(?:which is\s*)?)(\d+(?:\.\d+)?\s*(?:m²|m2|m|%))\s*\)?\s*\.?\s*$/) || ['', ''])[1]).filter(function (m) { return m.unit === prp.unit; });
      if (paren.length) req = paren[0];
      else if (pk.figure) req = pk.figure;
      // MB-03b (MB03-Q2): several stated limits are several checks, so a second figure of the unit no longer waits for the operator; only the proposed side can still be ambiguous
      if (pr.filter(function (m) { return m.unit === prp.unit; }).length > 1) check = true;
    }
    // MB-03b (MB03-Q2 addendum): a sentence whose only figure is the definition ("attached to or within 0.3 m of a building") states no limit; the definition is never the requirement
    var lims = requirementLimits(requirement);
    if (lims.length && lims.some(function (l) { return l.kind === 'definition'; }) && !lims.some(function (l) { return l.kind === 'limit' || l.kind === 'derived'; })) req = null;
    if (!req) { var rfg = referentFigure(requirement, proposal); if (rfg) req = rfg; }
    if (!req || !prp) check = true;
    return { required: req, required_all: rq, proposed: prp, proposed_all: pr, check: check };
  }

  function variances(lines) {
    var start = -1, end = lines.length;
    for (var i = 0; i < lines.length; i++) if (/REQUESTED VARIANCE/i.test(lines[i])) { start = i + 1; break; }
    if (start < 0) return [];
    for (var k = start; k < lines.length; k++) {
      if (/^\s*(The Committee of Adjustment considered|THE COMMITTEE OF ADJUSTMENT AND MINOR|IT WAS THE DECISION|MAKING YOUR VIEWS|The Minor Variance Application is)/i.test(lines[k])) { end = k; break; }
    }
    var list = [], cur = null;
    for (var j = start; j < end; j++) {
      var h = lines[j].match(HEADER_RE);
      if (h) {
        cur = { n: h[2] ? Number(h[2]) : list.length + 1, amended: !!h[1], clause: normClause(h[3]), bylaw: h[4].replace(/^By-?law\s+(?:No\.?\s*)?/i, '').trim(), body: [] };
        list.push(cur);
      } else if (/^\s*[A-Z][a-z]+(?: [A-Z][a-z]+)?\s*$/.test(lines[j]) || /^\s*[A-Z]{3,}(?: [A-Z]{2,}){0,2}\s*$/.test(lines[j])) {
        // group sub-heading such as "Fourplex" or "Garden Suite"; not part of a variance
      } else if (cur && lines[j].trim()) {
        cur.body.push(lines[j].trim());
      }
    }
    return list.map(function (v) {
      // Join wrapped lines: "top-of-" + "bank" closes up; a line with no closing period before "The ..."/"In this case" ends a sentence.
      var text = v.body.reduce(function (acc, l) {
        if (!acc) return l;
        if (/[A-Za-z]-$/.test(acc)) return acc + l;
        if (!/[.,;:(]$/.test(acc) && /^(The|In this case)\b/.test(l)) return acc + '. ' + l;
        return acc + ' ' + l;
      }, '').replace(/\s+/g, ' ').trim();
      var sents = text.split(/(?<=\.)\s+(?=[A-Z])/);
      var p = -1;
      for (var s = 0; s < sents.length; s++) if (isProposal(sents[s])) { p = s; break; }
      if (p < 0 && sents.length > 1) p = sents.length - 1;
      var requirement = (p < 0 ? sents : sents.slice(0, p)).join(' ');
      var proposal = p < 0 ? '' : sents.slice(p).join(' ');
      var f = readFigures(requirement, proposal);
      return {
        n: v.n, amended: v.amended, clause: v.clause, bylaw: v.bylaw,
        limit: limitKind(requirement),
        requirement: requirement, proposal: proposal,
        required: f.required, required_all: f.required_all, check: f.check,
        proposed: f.proposed, proposed_all: f.proposed_all,
        result: '', approved: null
      };
    });
  }

  function parse(text) {
    var lines = splitHeader(clean(text));
    var all = flat(lines);
    var toks = nameTokens(lines);
    var warnings = [];

    var fileNumber = (field(lines, 'File Number').match(/[A-Z]\d{4}\/\d{2}[A-Z]{2,4}/) || [''])[0];
    if (!fileNumber) warnings.push('No file number found. Paste the whole notice, including the "File Number:" line.');

    var hearingNotice = /PUBLIC HEARING NOTICE|MEETING DATE AND TIME|THE COMMITTEE OF ADJUSTMENT AND MINOR VARIANCES|MAKING YOUR VIEWS KNOWN/i.test(all);
    var om = all.match(/Application is\s+(Approved on Condition|Approved with Conditions?|Approved in Part|Partially Approved|Approved|Refused|Deferred|Withdrawn|Closed)/i);
    var kind = om ? 'decision' : (hearingNotice ? 'hearing' : 'decision');
    var outcome = om ? om[1].replace(/\b\w/g, function (c) { return c.toUpperCase(); }).replace(/\bOn\b/, 'on').replace(/\bWith\b/, 'with').replace(/\bIn\b/, 'in') : (hearingNotice ? 'Pending' : '');
    if (!outcome) warnings.push('No decision found. Expected a line like "The Minor Variance Application is Approved".');

    var dm = all.match(/(?:hearing was held on|MEETING DATE AND TIME:)\s*(?:[A-Za-z]+day,\s*)?([A-Z][a-z]+\s+\d{1,2},\s*\d{4})/i);
    var purpose = (all.match(/PURPOSE OF THE APPLICATION:\s*(.*?)\s*REQUESTED VARIANCE/i) || ['', ''])[1];
    var cm = all.match(/subject to the following condition\(s\):\s*(.*)$/i);
    var conditions = cm ? cm[1].slice(0, 1500) : '';

    var vs = variances(lines);
    if (!vs.length) warnings.push('No variances found. Expected lines starting "Chapter 10.x.x.x, By-law 569-2013".');
    // Split decisions list the approved and refused variance numbers separately.
    var split = {}, mode = null, seenDecision = false;
    lines.forEach(function (l) {
      if (/IT WAS THE DECISION/i.test(l)) seenDecision = true;
      if (!seenDecision) return;
      if (/to APPROVE the following variance/i.test(l)) { mode = 'as_requested'; return; }
      if (/to REFUSE the following variance/i.test(l)) { mode = 'refused'; return; }
      var h = mode && l.match(HEADER_RE);
      if (h && h[2]) split[Number(h[2])] = mode;
    });
    var isSplit = Object.keys(split).length > 0;
    if (isSplit) {
      var nRef = Object.keys(split).filter(function (k) { return split[k] === 'refused'; }).length;
      if (nRef) outcome = outcome + ' (in part: ' + nRef + ' refused)';
    }
    vs.forEach(function (v) {
      if (!v.required || !v.proposed) warnings.push('Variance ' + v.n + ' (' + v.clause + '): could not read both a required and a proposed number. Enter them below.');
      else if (v.check) warnings.push('Variance ' + v.n + ' (' + v.clause + '): the text has more than one figure. Confirm which numbers apply.');
      if (isSplit && split[v.n]) v.result = split[v.n];
      else if (kind === 'decision' && /^Approved/.test(outcome) && !/in Part|Partially/i.test(outcome)) v.result = 'as_requested';
      else if (/^Refused/.test(outcome)) v.result = 'refused';
      else v.result = 'pending';
    });

    var zoningLabel = field(lines, 'Zoning').replace(/\s*[([](?:ZAP|ZZC|ZPR|BLD|ZR|WAV|waiver)[)\]]\s*$/i, '').trim();
    var zoningStatus = (field(lines, 'Zoning').match(/[([](ZAP|ZZC|ZPR|BLD|ZR|WAV|waiver)[)\]]\s*$/i) || ['', ''])[1];

    return {
      record: {
        file_number: fileNumber,
        kind: kind,
        outcome: outcome,
        address: field(lines, 'Property Address'),
        legal_description: field(lines, 'Legal Description'),
        zoning: parseZoning(zoningLabel),
        zoning_review_status: zoningStatus,
        ward: field(lines, 'Ward'),
        community: field(lines, 'Community'),
        heritage: field(lines, 'Heritage'),
        hearing_date: dm ? isoDate(dm[1]) : '',
        purpose: scrub(purpose, toks),
        conditions: scrub(conditions, toks),
        variances: vs.map(function (v) { v.requirement = scrub(v.requirement, toks); v.proposal = scrub(v.proposal, toks); return v; }),
        parser_version: PARSER_VERSION
      },
      names_removed: nameLines(lines).length,
      warnings: warnings
    };
  }

  function docId(fileNumber) { return String(fileNumber || '').replace(/\//g, '-'); }

  var api = { parse: parse, docId: docId, measures: measures, referentFigure: referentFigure, readFigures: readFigures, requirementFigures: requirementFigures, requirementLimits: requirementLimits, PARSER_VERSION: PARSER_VERSION };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CoaParse = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

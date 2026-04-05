#!/usr/bin/env node
/**
 * Enrich WSIB registry entries directly with contact data via Serper web search.
 *
 * Targets wsib_registry table (not entities). Contacts flow to entities
 * via link-wsib.js COALESCE copy on match.
 *
 * Prioritizes: Large Business > Medium Business > Small Business.
 * Requires trade_name for search quality. Applies shouldSkipEntity() filters.
 *
 * Requires SERPER_API_KEY environment variable (serper.dev).
 *
 * Usage:
 *   node scripts/enrich-wsib.js [--limit N] [--dry-run]
 *
 * Environment:
 *   SERPER_API_KEY   — API key from serper.dev (required)
 *   ENRICH_LIMIT     — Max entries to process (default 50, overridden by --limit)
 *   PIPELINE_CHAIN   — Set by run-chain.js when running as part of a chain
 *
 * SPEC LINK: docs/specs/pipeline/46_wsib_enrichment.md
 */
const pipeline = require('./lib/pipeline');

const SERPER_API_KEY = process.env.SERPER_API_KEY || '';
const SERPER_URL = 'https://google.serper.dev/search';
const SLUG = 'enrich_wsib_registry';
const CHAIN_ID = process.env.PIPELINE_CHAIN || null;
const RATE_LIMIT_MS = parseInt(process.env.ENRICH_RATE_MS || '200', 10);

// ---------------------------------------------------------------------------
// Contact extraction (shared with enrich-web-search.js)
// ---------------------------------------------------------------------------

const PHONE_PATTERN = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
const PHONE_AREA_CODES = [
  '416', '647', '437', '905', '289', '365',
  '519', '226', '548', '613', '343', '683',
  '705', '249', '807',
];

function extractPhones(snippets) {
  const phones = [];
  for (const text of snippets) {
    const matches = text.match(PHONE_PATTERN) || [];
    for (const m of matches) {
      const digits = m.replace(/\D/g, '');
      if (digits.length < 10 || digits.length > 11) continue;
      const ac = digits.length === 11 ? digits.slice(1, 4) : digits.slice(0, 3);
      if (PHONE_AREA_CODES.includes(ac)) {
        const d = digits.length === 11 ? digits.slice(1) : digits;
        const fmt = `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
        if (!phones.includes(fmt)) phones.push(fmt);
      }
    }
  }
  return phones;
}

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const EMAIL_REJECT = [
  // Auto-generated / template
  'noreply@', 'no-reply@', 'donotreply@', 'example@', 'example.com', 'yourdomain.com',
  'test.com', 'email.com', 'sentry.io', 'wixpress.com', 'sampleemail.com',
  // Image filenames parsed as emails (Serper snippet artifacts)
  '.png', '.jpg', '.gif', '.svg', '.webp', '@2x.', '@3x.',
  // Government domains (wrong match for businesses)
  '.gov.', 'toronto.ca', 'ontario.ca', 'canada.ca', '.gov.uk', '.gov.ca',
  // Generic directory/platform emails
  'accessibility@', 'webmaster@', 'customerservice@', 'support@construction.com',
  'info@osmca.org',
  // Wrong-company domains from batch 4
  'bellnet.ca', 'markham.ca', 'crunchbase.com', 'hpacmag.com',
  'brandingcentres.com', 'b-safe.ca',
  // Template/fake patterns
  'user@domain.com', '@domain.com',
  // Trade association emails (not the company)
  'roofingcanada.com', 'agmca.ca', 'cisc-icca.ca',
  // Script/code artifacts parsed as emails
  'jquery@', '.min.js',
  // Website builder / hosting / font / test domains
  'webador.com', 'micahrich.com', 'latofonts.com', 'godaddy.com',
  // Web design / font foundry emails scraped from "designed by" footers
  'mysite.com', 'eyebytes.com', 'sansoxygen.com', 'astigmatic.com',
  'pixelspread.com', 'indiantypefoundry.com', 'ndiscovered.com',
  'typemade.mx',
  // Data broker / legal research (not the company)
  'lexisnexis.com',
  // Popular contractor sites falsely matched to other companies
  'mail.com', 'mystore.com',
  // Contractor emails scraped from wrong websites (matched to 5+ other companies)
  'torontocarpentryco.ca', 'thefinishcarpenter.ca', 'precisionlandscaping.ca',
  'delgrandehomes.com', 'primetiling.ca', 'tileshoppes.com', 'arenovation.ca',
  'caulkingprofessionals.ca', 'orielrenovations.com', 'jdavispainting.com',
  'sg-carpentry.com', 'rfuenzalida.com', 'pauldavis.ca', 'pcarpentry.ca',
  'csflooring.ca', 'm2tilestone.com', 'proroofing.ca', 'masonsmasonry.com',
  'gmrpainting.com', 'sstileandstone.ca',
];
// Personal email providers — blocked for Medium+ but allowed for Small Business
// (sole proprietor plumbers/electricians legitimately use gmail as business email)
const PERSONAL_EMAIL_REJECT = ['gmail.com', 'hotmail.com', 'yahoo.com', 'outlook.com', 'live.com', 'live.ca', 'aol.com'];

function extractEmails(snippets) {
  const emails = [];
  for (const text of snippets) {
    const matches = text.match(EMAIL_PATTERN) || [];
    for (const m of matches) {
      const lower = m.toLowerCase();
      if (EMAIL_REJECT.some((r) => lower.includes(r))) continue;
      if (!emails.includes(lower)) emails.push(lower);
    }
  }
  return emails;
}

const MAILTO_PATTERN = /href="mailto:([^"?]+)/gi;

function stripHtmlNoise(html) {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function extractEmailsFromHtml(html) {
  const emails = [];
  const mailtoMatches = html.matchAll(MAILTO_PATTERN);
  for (const m of mailtoMatches) {
    const lower = m[1].toLowerCase();
    if (EMAIL_REJECT.some((r) => lower.includes(r))) continue;
    EMAIL_PATTERN.lastIndex = 0;
    if (EMAIL_PATTERN.test(lower)) {
      if (!emails.includes(lower)) emails.push(lower);
    }
  }
  EMAIL_PATTERN.lastIndex = 0;
  const textMatches = html.match(EMAIL_PATTERN) || [];
  for (const m of textMatches) {
    const lower = m.toLowerCase();
    if (EMAIL_REJECT.some((r) => lower.includes(r))) continue;
    if (!emails.includes(lower)) emails.push(lower);
  }
  return emails;
}

const DIRECTORY_DOMAINS = [
  'instagram.com', 'facebook.com', 'linkedin.com', 'twitter.com', 'x.com',
  'houzz.com', 'yellowpages.ca', 'yellowpages.com', 'yelp.com', 'yelp.ca',
  'indeed.com', 'indeed.ca', 'glassdoor.com', 'glassdoor.ca',
  'mapquest.com', 'google.com', 'google.ca',
  'zoominfo.com', 'datanyze.com', 'dnb.com',
  'bidsandtenders.ca', 'merx.com', 'wsib.ca', 'wsib.on.ca',
  'canada411.ca', 'canada.com', 'trustpilot.com', 'bbb.org',
  'cylex.ca', 'cybo.com', 'kompass.com', 'wikipedia.org', 'reddit.com',
  'homestars.com', 'homeadvisor.com', 'thumbtack.com', 'angi.com',
  'ontario.ca', 'canada.ca', 'gov.on.ca',
  'pagesjaunes.ca', 'nextdoor.com', 'bark.com',
  // Construction directories / project listing sites
  'procore.com', 'constructconnect.com', 'canada.constructconnect.com',
  'projects.constructconnect.com', 'dcnonl.com', 'buildingconnected.com',
  'yorkmaps.ca', 'ww4.yorkmaps.ca', '31safer.ca',
  'constructionassociation.ca', 'ogca.ca', 'rescon.com',
  'construction.com', 'sweets.construction.com',
  'trustedpros.ca', 'canpages.ca',
  // Government / municipal sites (toronto.ca, ontario.ca, canada.ca already in main list above)
  'escribemeetings.com', 'investburlington.ca',
  'citywindsor.ca', 'skicanada.org', 'beachmetro.com',
  // Data brokers / scrapers
  'rocketreach.co', 'datanyze.com', 'apollo.io',
  // News / media / magazines
  'insauga.com', 'ourtimes.ca',
  // Cloud storage / CDN (not company websites)
  's3.amazonaws.com', 'cc-production-uploads-bucket.s3',
  // Website builders / platforms (not company websites)
  'bold.pro', 'ca.bold.pro',
  // Job boards
  'ziprecruiter.com', 'monster.com',
  // Other non-company sites
  'scribd.com', 'prd.tecprd.ethicsefile.com',
  'darien.il.us', 'cfcanada.fticonsulting.com', 'cmcsa.com',
  'legacyclassic.com', 'epa.gov',
  'hub.datanorthyorkshire.org', 'files.cityofportsmouth.com',
  'northyorks.gov.uk', 'cityofportsmouth.com',
  'pub-markham.escribemeetings.com',
  // Batch 3 additions
  'sec.gov', 'scc-csc.ca', 'q4cdn.com', 'jooble.org', 'ca.jooble.org',
  'bynder.cloud', 'flydenver.com', 'wapa.gov', 'petvalu.ca',
  'jobs.siemens-energy.com', 'whatsapp.com', 'web.whatsapp.com',
  'sentry10.bynder.cloud', 'assets.cadillacfairview.com',
  'liftsuperstore.com', 'orka.ca',
  'eartotheground-digital.com', 'levelbyoxford.com',
  'apps.dot.illinois.gov', 'team-global-m-s-m-group-job-agency.wh',
  'scaffolding.ca',
  // Batch 4 additions
  'slideshare.net', 'hpacmag.com', 'd7leadfinder.com', 'ic.gc.ca',
  'silo.tips', 'yumpu.com', 'workopolis.com', 'leasidelife.com',
  'torontojobs.ca', 'frpo.org', 'crunchbase.com', 'fmcsa.dot.gov',
  'li-public.fmcsa.dot.gov', 'firstgas.co.nz', 'conservationhamilton.ca',
  'mcahamiltonniagara.org', 'citt.org', 'mover.net', 'wheree.com',
  'b-safeelectric.ca', 'b-safe.ca',
  // Batch 5 additions
  'ca.trabajo.org', 'trabajo.org', 'phcppros.com', 'contractorlistshq.com',
  'signalhire.com', 'thebuildingsshow.com', 'infobel.ca', 'local.infobel.ca',
  'edsc-esdc.gc.ca', 'vaughan.ca', 'gocontinental.com', 'ksvadvisory.com',
  'icc.illinois.gov', 'agmca.ca', 'listshq.network',
  // Batch 6 additions
  'jobbank.gc.ca', 'usmodernist.org', 'canadianbusinessphonebook.ca',
  'edmca.com', 'members.edmca.com', 'collingwoodinquiry.ca',
  'opendata.usac.org', 'omniapartners.com', 'truecondos.com',
  'mnp.ca', 'ohiolink.edu', 'etd.ohiolink.edu',
  'securitysystemsnews.com', 'issuu.com', 'bldup.com',
  'rtr-engineering.ca', 'theglobeandmail.com', 'markham.ca',
  'worldmaterial.com', 'albertgelman.com',
  // Batch 7 additions
  'rfca.ca', 'tssa.org', 'stoakley.com', 'akademiya2063.org',
  'salmonarm.ca', 'pacermonitor.com', 'contractorimages.com',
  'listingsca.com', 'pickering.ca', 'corporate.pickering.ca',
  // Batch 8 additions
  'birdeye.com', 'reviews.birdeye.com', 'emcorgroup.com', 'robojob-usa.com',
  'broward.org', 'loopnet.com', 'inmetrotoronto.com', 'dolcemag.com',
  'thestar.com', 'hub.chba.ca', 'chba.ca', 'pitchbook.com', 'trane.com',
  'blob.core.windows.net', 'crewcmsblob.blob.core.windows.net',
  'cdn2.creativecirclemedia.com', 'roofingcanada.com',
  // Batch 10 additions
  'shopoakville.com', 'evergreen.ca', 'york1.com', 'thebigredguide.com',
  'youtube.com', 'starofservice.ca', 'contactbook.ca', 'maptons.com',
  'lobbycanada.gc.ca', 'zolo.ca', 'ctfassets.net', 'assets.ctfassets.net',
  'actionsxchangerepository.fidelity', 'whiteshark.ca',
  // Batch 11 additions
  'canadianlawyermag.com', 'staffinghub.com', 'reviews.staffinghub.com',
  'mycondovendor.com', 'ontariobusinessdir.com', 'canadacompanyregistry.com',
  '411s.ca', 'preconrealestate.ca', 'northernontariolocal.ca',
  'canada.chamberofcommerce.com', 'ontarioconstructionnews.com',
  'controlfiresystems.biass.ca',
  // Batch 1800 additions (high-frequency garbage from scaled run)
  'napc.pro', 'ca.polomap.com', 'polomap.com', '411.ca',
  'toronto.cdncompanies.com', 'cdncompanies.com', 'waze.com',
  'renoquotes.com', 'shopmississauga.com', 'niagarastandsout.ca',
  'members.mcatoronto.org', 'mcatoronto.org',
  'canadianbusinessphonebook.com', 'manta.com', 'simplyhired.ca',
  'proudlycan.com', 'members.mcac.ca', 'mcac.ca', 'cwbgroup.org',
  'environmentalbids.link', 'emeryvillagebia.ca',
  'pcn.procoretech-qa.com', 'procoretech-qa.com',
  'fixone.ca', 'dki.ca', 'limengroup.com', 'astroenvironmental.ca',
  // Mega run additions (high-frequency garbage from 44K run)
  'tiktok.com', 'alignable.com', 'b2bhint.com', 'tripadvisor.ca', 'tripadvisor.com',
  'realtor.ca', 'huddlemarkets.ca', 'threads.com', 'certapro.com',
  'kijiji.ca', 'linktr.ee', 'urbantoronto.ca', 'renovationfind.com',
  'newmarkettoday.ca', 'soumissionrenovation.ca', 'marketlister.ca',
  'moovitapp.com', 'decks.ca', 'master.ca', 'inthegta.com',
  // Mega run round 2 — directories, news, retail, government, education
  'toronto.ca', 'infobel.com', 'profilecanada.com', 'ctvnews.ca', 'cbc.ca',
  'about.me', 'blogto.com', 'torontolife.com', 'humber.ca', 'torontomu.ca',
  'archive.org', 'etsy.com', 'homedepot.ca', 'stores.homedepot.ca',
  'canadiantire.ca', 'ca.pinterest.com', 'pinterest.com', 'amazon.ca',
  'livabl.com', 'publications.gc.ca', 'cp24.com', 'n49.com',
  'urbantasker.com', 'taskrabbit.ca', 'frasersdirectory.com',
  'localtorontobusiness.ca', 'wanderboat.ai', 'ago.ca',
  'findacontractor.esasafe.com', 'guildquality.com', 'toaf.ca',
  'cylex-canada.ca', 'daniels.utoronto.ca', 'owtlibrary.on.ca',
  'pmc.ncbi.nlm.nih.gov', 'condos.ca', 'puroclean.ca',
  'torontoconstructionnetwork.com',
  // Mega run round 3 — popular contractors falsely matched to 5+ other companies
  'ontariolists.ca', 'enterprise.ca', 'enercare.ca', 'renoquotes.com',
  'eandm.contractors',
  // Mega run round 4 — news, municipal, directories, popular contractors (5+ false matches)
  'globalnews.ca', 'toronto.citynews.ca', 'citynews.ca', 'designlinesmagazine.com',
  'waterfrontoronto.ca', 'blueguia.com', 'shopto.ca', 'plumbing.ca', 'condos.ca',
  // Mega run round 5 — news, franchise/national chains, directories
  'nowtoronto.com', 'reliancehomecomfort.com', 'pauldavis.ca', 'puroclean.ca',
];

/**
 * Check if a website domain plausibly belongs to the company.
 * Prevents scraping trade associations, news sites, etc. that appear in search results.
 * Matches if ANY word (4+ chars) from the company name appears in the domain.
 */
function websiteMatchesCompany(websiteUrl, companyName) {
  if (!websiteUrl || !companyName) return false;
  try {
    const host = new URL(websiteUrl).hostname.replace(/^www\./, '').replace(/\.(com|ca|net|org|co)$/,'').toLowerCase();
    // Split company name into searchable words (4+ chars, skip common words)
    const SKIP_WORDS = new Set(['the','and','inc','ltd','corp','company','group','services','service','systems','construction','contracting','contractor','limited','canada','ontario','toronto','division']);
    const words = companyName.toLowerCase()
      .split(/[\s&,.'()\-/]+/)
      .filter(w => w.length >= 4 && !SKIP_WORDS.has(w));
    return words.some(w => host.includes(w));
  } catch { return false; }
}

function extractWebsite(results) {
  for (const r of results) {
    try {
      const url = new URL(r.link);
      const host = url.hostname.replace(/^www\./, '').toLowerCase();
      if (DIRECTORY_DOMAINS.some((d) => host === d || host.endsWith('.' + d))) continue;
      return `https://${url.hostname}`;
    } catch { continue; }
  }
  return null;
}

// NOTE: extractContacts (snippet-based) removed in Method B migration.
// Phone/email now extracted website-first in the main enrichment loop.

// ---------------------------------------------------------------------------
// Search query construction
// ---------------------------------------------------------------------------

function extractCity(address) {
  if (!address) return null;
  const parts = address.split(',').map((p) => p.trim());
  if (parts.length < 3) return null;

  const NON_CITY = /^(PO\s+Box|P\.?O\.?\s*Box|Suite|Ste\.?|Unit|Apt\.?|#|\d{1,5}\s|RR\s?\d)/i;
  const POSTAL_CODE = /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i;
  const PROVINCE = /^(ON|AB|BC|SK|MB|QC|NB|NS|PE|NL|NT|YT|NU)$/i;

  for (let i = 1; i < Math.min(parts.length, 4); i++) {
    const candidate = parts[i];
    if (!candidate) continue;
    if (NON_CITY.test(candidate)) continue;
    if (POSTAL_CODE.test(candidate)) continue;
    if (PROVINCE.test(candidate)) continue;
    return candidate;
  }
  return null;
}

// NAICS code → human-readable search terms (what people actually Google)
const NAICS_SEARCH_TERMS = {
  // Building Equipment (G4)
  '238210': 'electrician electrical contractor',
  '238220': 'plumber plumbing HVAC heating cooling contractor',
  '238299': 'building equipment contractor',
  '238291': 'building systems contractor',
  // Specialty Trades (G5)
  '238320': 'painter painting wall covering contractor',
  '238350': 'finish carpentry cabinetry trim contractor',
  '238310': 'drywall insulation contractor',
  '238330': 'flooring contractor',
  '238340': 'tile tiling terrazzo contractor',
  '238990': 'specialty trades contractor',
  '238910': 'excavation site preparation contractor',
  '238390': 'specialty trades contractor',
  // Foundation, Structure & Exterior (G3)
  '238130': 'framing carpenter contractor',
  '238170': 'siding exterior contractor',
  '238160': 'roofing roofer contractor',
  '238140': 'masonry bricklayer contractor',
  '238190': 'exterior construction contractor',
  '238110': 'concrete foundation contractor',
  '238150': 'glass glazing window contractor',
  '238120': 'structural steel contractor',
  // Residential (G1)
  '236110': 'home builder residential contractor',
  // Non-Residential (G6)
  '236220': 'commercial building general contractor',
  '236210': 'industrial building contractor',
  // Professional
  '541370': 'surveying contractor',
  '541340': 'drafting design services',
  '541514': 'computer systems design',
};
const NAICS_FALLBACK = 'contractor';

function buildSearchQuery(entry) {
  const name = entry.trade_name || entry.legal_name;
  // Simple, human-like query — no quotes, no trade terms, no "phone email".
  // All GTA businesses serve the Toronto area. Quoted exact match and trade
  // terms push Serper toward procurement PDFs and WSIB CSV files instead
  // of the company's own website.
  return `${name} Toronto`;
}

// ---------------------------------------------------------------------------
// Pre-flight skip filters (mirrors src/lib/builders/extract-contacts.ts)
// ---------------------------------------------------------------------------

const GENERIC_TRADE_NAMES = new Set([
  'CONTRACTING', 'GENERAL CONTRACTING', 'CONSTRUCTION', 'DESIGN CO',
  'HOLDINGS CO', 'CUSTOM HOME', 'CUSTOM HOME LTD', 'HOLDINGS',
  'BUILDING', 'RENOVATIONS', 'GENERAL CONTRACTOR', 'DRYWALL',
  'PAINTING', 'FLOORING', 'ROOFING', 'PLUMBING', 'ELECTRICAL',
]);

function shouldSkipWsibEntry(entry) {
  const searchName = (entry.trade_name || entry.legal_name || '').trim();
  const lower = searchName.toLowerCase();

  // 1. No usable search name (empty, whitespace, punctuation-only, too short)
  const cleaned = searchName.replace(/[^a-zA-Z0-9]/g, '');
  if (!cleaned || cleaned.length < 3) {
    return { skip: true, reason: 'no_search_name' };
  }

  // 2. Generic trade names (single-word trades like "ROOFING", "DRYWALL")
  const normalized = searchName.toUpperCase().replace(/[.,;'"]/g, '').replace(/\s+/g, ' ');
  if (GENERIC_TRADE_NAMES.has(normalized)) {
    return { skip: true, reason: 'generic_trade_name' };
  }

  // 3. Corporate accounting entries (never real company names)
  if (/\baccount\b|\bacct\b|\bhead office\b|\bmain office\b|\btarget account\b|\bparent account\b/i.test(lower)) {
    return { skip: true, reason: 'corporate_account' };
  }

  // 4. Staffing/temp agencies (WSIB-registered but not construction companies)
  if (/\bstaffing\b|\bpersonnel\b|\bmanpower\b|\bemployment service\b|\btemporary\b|\bworkforce\b|\btemp service\b|\brecruitment\b|\bcareer1\b|\bprostaff\b|\bprotemps\b|\bplacement\b|\bhuman resources\b|\bdriver service\b|\bpeople link\b|\barmor people\b/i.test(lower)) {
    return { skip: true, reason: 'staffing_agency' };
  }

  // 5. Division/subsidiary/region markers (internal names, not indexed online)
  if (/\bdivision\b|\bdivsion\b|\bdiv\b|\bregion\s|\bdistrict\s/i.test(lower)) {
    return { skip: true, reason: 'division_name' };
  }

  // 6. Non-construction despite NAICS classification
  if (/\bfood service\b|\bcatering\b|\bcamp\s|\benvironmental service\b/i.test(lower)) {
    return { skip: true, reason: 'non_construction' };
  }

  // 7. Unsearchable abbreviations (very short, no vowels, or parenthetical codes)
  if (searchName.length <= 5 && !searchName.includes(' ')) {
    return { skip: true, reason: 'abbreviation' };
  }
  if (/\(N\.?A\.?\)|\(Canada\)|\(East\)|\(West\)/i.test(searchName)) {
    return { skip: true, reason: 'abbreviation' };
  }

  return { skip: false, reason: null };
}

// ---------------------------------------------------------------------------
// Serper API
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function searchSerper(query) {
  const res = await fetch(SERPER_URL, {
    method: 'POST',
    headers: {
      'X-API-KEY': SERPER_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ q: query, gl: 'ca', location: 'Ontario, Canada', num: 10 }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Serper API ${res.status}: ${text}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

pipeline.run('enrich-wsib', async (pool) => {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 && args[limitIdx + 1]
    ? parseInt(args[limitIdx + 1], 10)
    : parseInt(process.env.ENRICH_LIMIT || '50', 10);

  if (!SERPER_API_KEY) {
    pipeline.log.info('[enrich-wsib]', 'SERPER_API_KEY not set — skipping WSIB enrichment');
    return;
  }

  pipeline.log.info('[enrich-wsib]', '=== WSIB Registry Direct Enrichment ===');
  if (dryRun) pipeline.log.info('[enrich-wsib]', 'DRY RUN — no database writes');
  pipeline.log.info('[enrich-wsib]', `Limit: ${limit} | Rate: ${RATE_LIMIT_MS}ms`);

  const startMs = Date.now();
  let runId = null;

  if (!CHAIN_ID) {
    try {
      const res = await pool.query(
        `INSERT INTO pipeline_runs (pipeline, started_at, status)
         VALUES ($1, NOW(), 'running') RETURNING id`,
        [SLUG]
      );
      runId = res.rows[0].id;
    } catch (err) {
      pipeline.log.warn('[enrich-wsib]', `Could not insert pipeline_runs row: ${err.message}`);
    }
  }

  // Queue: unenriched WSIB entries, prioritized by business size.
  // Uses streamQuery to avoid materializing the full result set upfront (B4).
  // Pre-count for progress logging since streamQuery doesn't know total rows.
  // NAICS whitelist: building construction trades only (excludes infrastructure + non-construction).
  // Rows with NULL naics_description are intentionally excluded (non-standard entries).
  const NAICS_WHITELIST = [
    'Specialty trades construction',
    'Residential building construction',
    'Building equipment construction',
    'Foundation, structure and building exterior construction',
    'Non-residential building construction',
    'Professional, scientific and technical',
  ];
  const naicsFilter = `AND naics_description IN (${NAICS_WHITELIST.map((_, i) => `$${i + 1}`).join(', ')})`;

  // Filter to GTA + building trades + exclude Large Business conglomerates
  const countResult = await pool.query(`
    SELECT COUNT(*) AS cnt FROM wsib_registry
    WHERE last_enriched_at IS NULL
      AND is_gta = true
      AND business_size IS DISTINCT FROM 'Large Business'
      AND (trade_name IS NOT NULL OR legal_name IS NOT NULL)
      ${naicsFilter}
  `, NAICS_WHITELIST);
  const totalEntries = Math.min(parseInt(countResult.rows[0].cnt, 10), limit);

  pipeline.log.info('[enrich-wsib]', `Found ${totalEntries} unenriched WSIB entries`);
  if (totalEntries === 0) {
    pipeline.log.info('[enrich-wsib]', 'Nothing to enrich.');
    await finalize(pool, runId, startMs, 0, 0, 0, { processed: 0, matched: 0, failed: 0, skipped: {} });
    return;
  }

  let enriched = 0;
  let contactsFound = 0;
  let failed = 0;
  const fieldCounts = { phone: 0, email: 0, website: 0 };
  let websitesScraped = 0;
  const skipped = { no_search_name: 0, generic_trade_name: 0, corporate_account: 0, staffing_agency: 0, division_name: 0, non_construction: 0, abbreviation: 0 };
  const sizeBreakdown = { large: 0, medium: 0, small: 0 };
  let i = 0;

  const streamParams = [...NAICS_WHITELIST, limit];
  const limitParam = `$${streamParams.length}`;

  for await (const entry of pipeline.streamQuery(pool, `
    SELECT
      id,
      legal_name,
      trade_name,
      mailing_address,
      naics_code,
      naics_description,
      business_size,
      primary_phone,
      primary_email,
      website
    FROM wsib_registry
    WHERE last_enriched_at IS NULL
      AND is_gta = true
      AND business_size IS DISTINCT FROM 'Large Business'
      AND (trade_name IS NOT NULL OR legal_name IS NOT NULL)
      ${naicsFilter}
    ORDER BY
      CASE business_size
        WHEN 'Large Business' THEN 0
        WHEN 'Medium Business' THEN 1
        WHEN 'Small Business' THEN 2
        ELSE 3
      END,
      trade_name IS NOT NULL DESC,
      legal_name
    LIMIT ${limitParam}
  `, streamParams)) {
    i++;

    // Track size breakdown as we stream
    if (entry.business_size === 'Large Business') sizeBreakdown.large++;
    else if (entry.business_size === 'Medium Business') sizeBreakdown.medium++;
    else if (entry.business_size === 'Small Business') sizeBreakdown.small++;

    // Pre-flight filter
    const skipResult = shouldSkipWsibEntry(entry);
    if (skipResult.skip) {
      skipped[skipResult.reason]++;
      pipeline.log.info('[enrich-wsib]', `  [${i}/${totalEntries}] SKIP (${skipResult.reason}): ${entry.trade_name || entry.legal_name}`);
      if (!dryRun) {
        await pool.query(
          'UPDATE wsib_registry SET last_enriched_at = NOW() WHERE id = $1',
          [entry.id]
        ).catch((err) => { pipeline.log.error('[enrich-wsib]', `Failed to mark skipped: ${err.message}`); });
      }
      continue;
    }

    const query = buildSearchQuery(entry);

    try {
      if (dryRun) {
        pipeline.log.info('[enrich-wsib]', `  [${i}/${totalEntries}] ${entry.trade_name || entry.legal_name} → query: ${query}`);
        enriched++;
        continue;
      }

      const response = await searchSerper(query);

      // Website-first extraction (Method B):
      // 1. Find company website from search results
      // 2. Scrape company website for phone + email (trusted source)
      // 3. Fall back to Knowledge Graph for phone
      // 4. Fall back to search snippets for phone ONLY (never email — too noisy)
      const results = response.organic || [];
      const knowledgeGraph = response.knowledgeGraph;
      const websiteFromKG = knowledgeGraph?.website || null;
      const websiteFromResults = extractWebsite(results);
      const contacts = {
        phone: null,
        email: null,
        website: websiteFromKG || websiteFromResults,
      };

      // Step 1: Scrape company website for contacts (primary, trusted source)
      // Only scrape if the domain plausibly matches the company name — prevents
      // extracting contacts from trade associations, news sites, directories, etc.
      const companyName = entry.trade_name || entry.legal_name;
      let websiteUrl = contacts.website || entry.website;
      if (websiteUrl && !websiteUrl.startsWith('http')) {
        websiteUrl = `https://${websiteUrl}`;
      }
      const websiteTrusted = websiteUrl && websiteMatchesCompany(websiteUrl, companyName);
      if (websiteUrl && websiteTrusted) {
        try {
          const pageRes = await fetch(websiteUrl, {
            signal: AbortSignal.timeout(2000),
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Buildo/1.0)' },
          });
          if (pageRes.ok) {
            websitesScraped++;
            const rawHtml = await pageRes.text();
            const scrapedEmails = extractEmailsFromHtml(rawHtml);
            if (scrapedEmails.length > 0) contacts.email = scrapedEmails[0];
            const cleanText = stripHtmlNoise(rawHtml);
            const scrapedPhones = extractPhones([cleanText]);
            if (scrapedPhones.length > 0) contacts.phone = scrapedPhones[0];
          }
        } catch { /* timeout or fetch error — skip silently */ }
      }

      // Step 2: Knowledge Graph phone (Google's structured data — reliable)
      if (!contacts.phone && knowledgeGraph?.phone) {
        const kgPhones = extractPhones([knowledgeGraph.phone]);
        if (kgPhones.length > 0) contacts.phone = kgPhones[0];
      }

      // Step 3: Snippet phone fallback (last resort — only phone, never email)
      if (!contacts.phone) {
        const snippets = results.map((r) => r.snippet || '');
        const snippetPhones = extractPhones(snippets);
        if (snippetPhones.length > 0) contacts.phone = snippetPhones[0];
      }

      // Block personal email providers for Medium+ businesses
      if (contacts.email && entry.business_size !== 'Small Business') {
        const emailLower = contacts.email.toLowerCase();
        if (PERSONAL_EMAIL_REJECT.some((r) => emailLower.includes(r))) {
          contacts.email = null;
        }
      }

      // Update wsib_registry (COALESCE preserves existing data)
      const updates = [];
      const params = [];
      let paramIdx = 1;
      const pendingFields = { phone: false, email: false, website: false };

      if (contacts.phone && !entry.primary_phone) {
        updates.push(`primary_phone = COALESCE(NULLIF(primary_phone, ''), $${paramIdx})`);
        params.push(contacts.phone);
        paramIdx++;
        pendingFields.phone = true;
      }
      if (contacts.email && !entry.primary_email) {
        updates.push(`primary_email = COALESCE(NULLIF(primary_email, ''), $${paramIdx})`);
        params.push(contacts.email);
        paramIdx++;
        pendingFields.email = true;
      }
      if (contacts.website && !entry.website) {
        updates.push(`website = COALESCE(NULLIF(website, ''), $${paramIdx})`);
        params.push(contacts.website);
        paramIdx++;
        pendingFields.website = true;
      }

      updates.push('last_enriched_at = NOW()');
      params.push(entry.id);

      await pool.query(
        `UPDATE wsib_registry SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
        params
      );

      let newFields = 0;
      if (pendingFields.phone) { newFields++; fieldCounts.phone++; }
      if (pendingFields.email) { newFields++; fieldCounts.email++; }
      if (pendingFields.website) { newFields++; fieldCounts.website++; }

      if (newFields > 0) contactsFound++;
      enriched++;

      const summary = [
        contacts.phone ? '📞' : '',
        contacts.email ? '✉️' : '',
        contacts.website ? '🌐' : '',
      ].filter(Boolean).join(' ') || 'no contacts';

      pipeline.log.info('[enrich-wsib]', `  [${i}/${totalEntries}] ${entry.trade_name || entry.legal_name} (${entry.business_size || 'unknown'}) → ${summary}`);

    } catch (err) {
      pipeline.log.error('[enrich-wsib]', err, { wsib_id: entry.id, name: entry.trade_name || entry.legal_name });
      failed++;

      await pool.query(
        'UPDATE wsib_registry SET last_enriched_at = NOW() WHERE id = $1',
        [entry.id]
      ).catch((dbErr) => { pipeline.log.error('[enrich-wsib]', `Failed to mark enriched: ${dbErr.message}`); });
    }

    // Rate limiting
    if (i < totalEntries) await sleep(RATE_LIMIT_MS);
  }

  pipeline.log.info('[enrich-wsib]', `  Large: ${sizeBreakdown.large} | Medium: ${sizeBreakdown.medium} | Small: ${sizeBreakdown.small}`);

  const totalSkipped = Object.values(skipped).reduce((a, b) => a + b, 0);
  pipeline.log.info('[enrich-wsib]', `Skipped ${totalSkipped} entries`, skipped);

  const meta = {
    processed: enriched + failed,
    matched: enriched,
    failed,
    skipped,
    skipped_total: totalSkipped,
    websites_found: websitesScraped,
    extracted_fields: fieldCounts,
    size_breakdown: sizeBreakdown,
  };

  await finalize(pool, runId, startMs, enriched, contactsFound, failed, meta);
});

async function finalize(pool, runId, startMs, enriched, contactsFound, failed, meta) {
  const durationMs = Date.now() - startMs;

  pipeline.log.info('[enrich-wsib]', 'Enrichment complete', {
    processed: enriched + failed, contacts_found: contactsFound,
    no_contacts: enriched - contactsFound, failed,
    duration: `${(durationMs / 1000).toFixed(1)}s`,
  });

  // WSIB enrichment stats
  const stats = await pool.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE last_enriched_at IS NOT NULL) AS enriched,
      COUNT(*) FILTER (WHERE primary_phone IS NOT NULL) AS with_phone,
      COUNT(*) FILTER (WHERE primary_email IS NOT NULL) AS with_email,
      COUNT(*) FILTER (WHERE website IS NOT NULL) AS with_website
    FROM wsib_registry
  `);
  const s = stats.rows[0];
  pipeline.log.info('[enrich-wsib]', `DB stats: ${s.total} total | ${s.enriched} enriched | ${s.with_phone} phone | ${s.with_email} email | ${s.with_website} website`);

  // Auto-cleanup: scrub newly enriched rows for known garbage patterns
  let cleanedCount = 0;
  try {
    // Clean emails matching reject patterns
    const emailPatterns = EMAIL_REJECT.map(r => `%${r}%`);
    const emailClean = await pool.query(
      `UPDATE wsib_registry SET primary_email = NULL
       WHERE last_enriched_at > NOW() - INTERVAL '1 hour'
         AND primary_email IS NOT NULL
         AND primary_email ILIKE ANY($1)
       RETURNING id`,
      [emailPatterns]
    );
    cleanedCount += emailClean.rows.length;

    // Clean websites matching blocked domains
    const domainPatterns = DIRECTORY_DOMAINS.flatMap(d => [`%://${d}/%`, `%://${d}`, `%://www.${d}/%`, `%://www.${d}`]);
    const websiteClean = await pool.query(
      `UPDATE wsib_registry SET website = NULL
       WHERE last_enriched_at > NOW() - INTERVAL '1 hour'
         AND website IS NOT NULL
         AND website ILIKE ANY($1)
       RETURNING id`,
      [domainPatterns]
    );
    cleanedCount += websiteClean.rows.length;
  } catch (err) {
    pipeline.log.warn('[enrich-wsib]', `Auto-cleanup failed (non-fatal): ${err.message}`);
  }
  if (cleanedCount > 0) {
    pipeline.log.info('[enrich-wsib]', `Auto-cleanup: scrubbed ${cleanedCount} garbage entries`);
  }

  if (runId) {
    await pool.query(
      `UPDATE pipeline_runs
       SET completed_at = NOW(), status = 'completed', duration_ms = $1,
           records_total = $2, records_new = $3, records_meta = $4
       WHERE id = $5`,
      [durationMs, enriched + failed, contactsFound, JSON.stringify(meta), runId]
    ).catch((dbErr) => { pipeline.log.error('[enrich-wsib]', `Failed to update pipeline_runs: ${dbErr.message}`); });
  }

  pipeline.emitSummary({
    records_total: enriched + failed,
    records_new: contactsFound,
    records_updated: enriched - contactsFound,
    records_meta: {
      duration_ms: durationMs,
      ...meta,
    },
  });
  pipeline.emitMeta(
    { "wsib_registry": ["id", "legal_name", "trade_name", "mailing_address", "business_size", "primary_phone", "primary_email", "website"] },
    { "wsib_registry": ["primary_phone", "primary_email", "website", "last_enriched_at"] }
  );
}

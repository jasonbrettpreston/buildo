// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11a.7 (golden = fixture + rendered tree), 127 4.3.
//
// MF-14 · lane E-MF14. The twelve committed synthetic golden states for the preview page, imported (not read from disk) so they bundle with the server build.
// The four target files of a state carry the same tree (S-parity), so the web file stands for the state.
import permitted from '../../../tests/fixtures/surfaces/report/permitted.web.json';
import not_permitted from '../../../tests/fixtures/surfaces/report/not_permitted.web.json';
import not_evaluated from '../../../tests/fixtures/surfaces/report/not_evaluated.web.json';
import variant_flat from '../../../tests/fixtures/surfaces/report/variant_flat.web.json';
import variant_pitched_a from '../../../tests/fixtures/surfaces/report/variant_pitched_a.web.json';
import variant_pitched_b from '../../../tests/fixtures/surfaces/report/variant_pitched_b.web.json';
import at_least from '../../../tests/fixtures/surfaces/report/at_least.web.json';
import loading from '../../../tests/fixtures/surfaces/report/loading.web.json';
import miss from '../../../tests/fixtures/surfaces/report/miss.web.json';
import error from '../../../tests/fixtures/surfaces/report/error.web.json';
import ad_slot_present from '../../../tests/fixtures/surfaces/report/ad_slot_present.web.json';
import ad_slot_absent from '../../../tests/fixtures/surfaces/report/ad_slot_absent.web.json';

export const GOLDENS: Record<string, unknown> = { permitted, not_permitted, not_evaluated, variant_flat, variant_pitched_a, variant_pitched_b, at_least, loading, miss, error, ad_slot_present, ad_slot_absent };
export const STATES: string[] = Object.keys(GOLDENS);

// MF-57: the four v21 page goldens (src/tests/fixtures/report-page), keyed by target; the four carry the same tree (S-parity).
import page_mobile from '../../../tests/fixtures/report-page/v21.mobile.json';
import page_web from '../../../tests/fixtures/report-page/v21.web.json';
import page_admin from '../../../tests/fixtures/report-page/v21.admin.json';
import page_pdf from '../../../tests/fixtures/report-page/v21.pdf.json';

export const PAGE_GOLDENS: Record<string, unknown> = { mobile: page_mobile, web: page_web, admin: page_admin, pdf: page_pdf };

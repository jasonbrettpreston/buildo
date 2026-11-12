// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b.3 dated note 2026-11-11 (MF-46 item 1: every other path on maxbld.ca is a
//            404, never a redirect); plan ~/Buildo-scratch/mcfrontend/MF-46/plan.v1.md fold 4 (a refused page path shows MaxBLD text).
//
// MF-46 · the internal target the middleware rewrites a refused maxbld.ca PAGE path to: it calls notFound(), so the visitor gets a 404 with
// the (static) group's MaxBLD not-found text (web_maxbld_error, state miss). It reads nothing and renders nothing itself.
import { notFound } from 'next/navigation';

export default function MaxbldRefused(): never {
  notFound();
}

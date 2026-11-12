'use client';
// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b.3 (dated note 2026-11-12, MF-46: the mailto role), 11b.7 (dated note
//            2026-11-11 item 3); ~/Buildo-scratch/mcfrontend/MF-46/plan.v1.md fold 8 (the prefill travels in the URL fragment, read on the client).
//
// MF-46 follow-up · the Help & Support prefill island. The prefill (topic, q, parcel) is in the URL FRAGMENT, so it reaches no server log (Spec 100
// §2.8: `q` never logged). On mount it adds the cleaned, encoded values as the mail body of the one mail link whose data-topic is the fragment's
// topic (general when none). Each value has CR, LF and every control character turned into a space and is capped, then URI-encoded, so no mail
// header (cc, bcc) can be injected; nothing is ever written as HTML. It renders nothing.
import { useEffect } from 'react';

/** The longest prefill value kept (characters). */
export const PREFILL_MAX = 200;

/** One prefill value made safe for a mail body: control characters become spaces, then squeezed, trimmed and capped. */
export function cleanValue(raw: string | null): string {
  let out = '';
  for (const ch of raw ?? '') {
    const c = ch.codePointAt(0) ?? 0;
    out += c <= 0x1f || (c >= 0x7f && c <= 0x9f) ? ' ' : ch;
  }
  return out.replace(/\s+/g, ' ').trim().slice(0, PREFILL_MAX);
}

/** The topic and the mail body a fragment asks for (`#topic=...&q=...&parcel=...`); the body is the cleaned values, one per line. */
export function prefillOf(hash: string): { topic: string; body: string } {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  return { topic: p.get('topic') ?? 'general', body: [p.get('q'), p.get('parcel')].map(cleanValue).filter(Boolean).join('\n') };
}

export function HelpPrefill(): null {
  useEffect(() => {
    const { topic, body } = prefillOf(window.location.hash);
    if (!body) return;
    for (const a of document.querySelectorAll<HTMLAnchorElement>('a[data-topic]')) {
      if (a.dataset.topic === topic) a.href = `${a.href.split('&body=')[0]}&body=${encodeURIComponent(body)}`; // idempotent (a re-run effect)
    }
  }, []);
  return null;
}

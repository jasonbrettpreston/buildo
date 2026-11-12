'use client';
// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b.3 (terms), 0b item 11 (router.push after an action);
//            ~/Buildo-scratch/mcfrontend/MF-46/DECISIONS-v1.md D-2 (b).
//
// MF-46 · the one checkbox (CASL: the terms box carries no marketing consent and is never pre-ticked). Every string from content.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { maxbldAcceptTermsAction } from '@/lib/supabase/maxbld-actions';
import { AUTH_TEXT as t } from '@/lib/surfaces/maxbld-auth';

export function TermsAcceptClient({ target }: { target: string }) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const quiet = 'underline underline-offset-4 text-zinc-100';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await maxbldAcceptTermsAction(agreed, target);
      if (r.code === 'done' && r.next) router.push(r.next);
      else if (r.code === 'required') setError(t['terms.required']);
      else if (r.code === 'expired') router.push(`/login?redirect=${encodeURIComponent(target)}`);
      else setError(t['terms.error']);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-[400px] mx-auto px-4 py-12 text-zinc-100">
      <h1 className="text-[28px]/[34px] font-bold tracking-tight">{t['terms.title']}</h1>
      <p className="mt-2 text-zinc-300">{t['terms.lead']}</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label htmlFor="mx-terms" className="flex min-h-[44px] items-start gap-3 text-zinc-200">
          <input id="mx-terms" type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 h-5 w-5 accent-amber-500" />
          <span>
            {t['terms.agree.before']} <Link className={quiet} href="/terms">{t['terms.agree.terms']}</Link> {t['terms.agree.and']}{' '}
            <Link className={quiet} href="/privacy">{t['terms.agree.privacy']}</Link>
          </span>
        </label>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={busy} className="w-full min-h-[48px] rounded-xl bg-amber-500 text-zinc-950 font-bold hover:bg-amber-400 disabled:opacity-60">
          {t['terms.submit']}
        </button>
      </form>
    </div>
  );
}

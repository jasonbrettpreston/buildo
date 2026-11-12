'use client';
// SPEC LINK: docs/specs/02-web-admin/126_maxbld_surface_standard.md 11b.3 (`web_login`, shared and declared), 11b.7 W2, 0b item 11
//            (navigation is a route: a completed sign-in moves by router.push after the action).
//
// MF-46 · the client mount of the MaxBLD sign-in routes: the shared LoginForm with its MaxBLD variant (content from maxbld-auth.ts).
import { useRouter } from 'next/navigation';
import { LoginForm, type LoginVariant } from '@/components/auth/LoginForm';
import { AUTH_TEXT } from '@/lib/surfaces/maxbld-auth';

export function MaxbldAuthClient({ mode, afterSignIn }: { mode: LoginVariant['mode']; afterSignIn: string }) {
  const router = useRouter();
  return <LoginForm variant={{ mode, text: AUTH_TEXT, afterSignIn }} onSuccess={() => router.push(afterSignIn)} />;
}

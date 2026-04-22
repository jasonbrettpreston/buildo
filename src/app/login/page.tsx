'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LoginForm } from '@/components/auth/LoginForm';

const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === 'true';

export default function LoginPage() {
  const router = useRouter();

  function handleDevBypass() {
    // In dev mode, the middleware auto-injects the session cookie.
    // Just navigate to the target page and middleware handles the rest.
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get('redirect') || '/dashboard';
    router.push(redirect);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="mb-8 text-center">
        <Link href="/" className="text-3xl font-bold text-gray-900">
          Buildo
        </Link>
        <p className="text-sm text-gray-500 mt-1">
          Lead Generation for Toronto Trades
        </p>
      </div>
      {isDevMode && (
        <div className="mb-4 w-full max-w-sm">
          <button
            onClick={handleDevBypass}
            className="w-full py-3 px-4 rounded-lg font-medium text-white bg-amber-600 hover:bg-amber-700 transition-colors"
          >
            Continue as Dev
          </button>
          <p className="text-xs text-amber-600 text-center mt-2">
            Dev mode enabled — no sign-in required
          </p>
        </div>
      )}
      <LoginForm onSuccess={() => router.push('/dashboard')} />
    </div>
  );
}

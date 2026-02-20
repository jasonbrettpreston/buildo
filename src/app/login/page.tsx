'use client';

import { useRouter } from 'next/navigation';
import { LoginForm } from '@/components/auth/LoginForm';

export default function LoginPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="mb-8 text-center">
        <a href="/" className="text-3xl font-bold text-gray-900">
          Buildo
        </a>
        <p className="text-sm text-gray-500 mt-1">
          Lead Generation for Toronto Trades
        </p>
      </div>
      <LoginForm onSuccess={() => router.push('/dashboard')} />
    </div>
  );
}

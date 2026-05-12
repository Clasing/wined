'use client';
import { Suspense, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

type LoginResponse = { access_token?: string; error?: string };

function SignInForm(): JSX.Element {
  const router = useRouter();
  const sp = useSearchParams();
  const redirectTo = sp.get('redirect') ?? '/dashboard';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent): void {
    e.preventDefault();
    setErr('');
    start(async () => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json().catch(() => ({}))) as LoginResponse;
      if (!res.ok) {
        setErr(data.error ?? 'Error de inicio de sesión');
        return;
      }
      if (data.access_token) localStorage.setItem('wined_access', data.access_token);
      router.push(redirectTo);
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-4 rounded-lg border bg-white p-8 shadow"
      >
        <h1 className="text-2xl font-bold text-distributor-700">Wined</h1>
        <p className="text-gray-600 text-sm">Inicia sesión</p>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="correo@dominio.com"
          className="w-full border rounded-md px-3 py-2"
        />
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña"
          className="w-full border rounded-md px-3 py-2"
        />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button
          disabled={pending}
          type="submit"
          className="w-full rounded-md bg-distributor-500 px-4 py-2 text-white hover:bg-distributor-700 disabled:opacity-50"
        >
          {pending ? 'Entrando…' : 'Entrar'}
        </button>
        <p className="text-xs text-gray-500 text-center">
          ¿No tienes cuenta?{' '}
          <Link href="/sign-up" className="text-distributor-700 underline">
            Crear cuenta
          </Link>
        </p>
      </form>
    </main>
  );
}

export default function SignInPage(): JSX.Element {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center p-8">Cargando…</main>
      }
    >
      <SignInForm />
    </Suspense>
  );
}

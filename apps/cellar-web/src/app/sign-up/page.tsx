'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type RegisterResponse = { access_token?: string; error?: string };

export default function SignUpPage(): JSX.Element {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [organizationName, setOrgName] = useState('');
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent): void {
    e.preventDefault();
    setErr('');
    start(async () => {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email,
          password,
          fullName,
          organizationName,
          product: 'cellar',
        }),
      });
      const data = (await res.json().catch(() => ({}))) as RegisterResponse;
      if (!res.ok) {
        setErr(data.error ?? 'Error de registro');
        return;
      }
      if (data.access_token) localStorage.setItem('wined_access', data.access_token);
      router.push('/onboarding');
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-4 rounded-lg border bg-white p-8 shadow"
      >
        <h1 className="text-2xl font-bold text-cellar-700">Wined</h1>
        <p className="text-gray-600 text-sm">Crea tu cuenta</p>
        <input
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Nombre completo"
          className="w-full border rounded-md px-3 py-2"
        />
        <input
          required
          value={organizationName}
          onChange={(e) => setOrgName(e.target.value)}
          placeholder="Nombre de la bodega"
          className="w-full border rounded-md px-3 py-2"
        />
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
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña (mín. 8)"
          className="w-full border rounded-md px-3 py-2"
        />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button
          disabled={pending}
          type="submit"
          className="w-full rounded-md bg-cellar-500 px-4 py-2 text-white hover:bg-cellar-700 disabled:opacity-50"
        >
          {pending ? 'Creando…' : 'Crear cuenta'}
        </button>
        <p className="text-xs text-gray-500 text-center">
          ¿Ya tienes?{' '}
          <Link href="/sign-in" className="text-cellar-700 underline">
            Entrar
          </Link>
        </p>
      </form>
    </main>
  );
}

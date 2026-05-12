import Link from 'next/link';
export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-5xl font-bold text-wined-700">Wined</h1>
      <p className="mt-4 text-lg text-gray-600">El copiloto del vino — sala</p>
      <Link href="/dashboard" className="mt-8 rounded-md bg-wined-500 px-6 py-3 text-white hover:bg-wined-700">
        Entrar
      </Link>
    </main>
  );
}

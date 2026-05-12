import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 bg-cellar-50">
      <h1 className="text-4xl font-bold text-cellar-700 mb-4">
        El copiloto del vino — bodega
      </h1>
      <p className="text-lg text-gray-700 max-w-xl text-center mb-8">
        Gestiona lotes, vendimias, laboratorio y compliance con la inteligencia
        del enólogo siempre a tu lado.
      </p>
      <div className="flex gap-4">
        <Link
          href="/sign-in"
          className="px-6 py-3 rounded-md bg-cellar-700 text-white font-medium hover:bg-cellar-500"
        >
          Entrar
        </Link>
        <Link
          href="/sign-up"
          className="px-6 py-3 rounded-md border border-cellar-700 text-cellar-700 font-medium hover:bg-cellar-50"
        >
          Crear cuenta
        </Link>
      </div>
    </main>
  );
}

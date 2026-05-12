import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { ReactNode } from 'react';

export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}): Promise<JSX.Element> {
  const cookieStore = await cookies();
  if (!cookieStore.has('wined_refresh')) redirect('/sign-in');

  return (
    <div className="grid min-h-screen grid-cols-[240px_1fr]">
      <aside className="flex flex-col border-r bg-gray-50 p-4">
        <div className="mb-6 text-2xl font-bold text-wined-700">Wined</div>
        <nav className="flex flex-col gap-2 text-sm">
          <Link href="/dashboard" className="hover:text-wined-700">
            Dashboard
          </Link>
          <Link href="/chat" className="hover:text-wined-700">
            Chat
          </Link>
          <Link href="/library" className="hover:text-wined-700">
            Cartas
          </Link>
          <Link href="/inventory" className="hover:text-wined-700">
            Inventario
          </Link>
          <Link href="/guests" className="hover:text-wined-700">
            Clientes
          </Link>
          <Link href="/menus" className="hover:text-wined-700">
            Menús
          </Link>
        </nav>
        <form action="/api/auth/logout" method="POST" className="mt-auto pt-6">
          <button className="text-xs text-gray-500 hover:text-gray-700" type="submit">
            Cerrar sesión
          </button>
        </form>
      </aside>
      <main className="p-6">{children}</main>
    </div>
  );
}

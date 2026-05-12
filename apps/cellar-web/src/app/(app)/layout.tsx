import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { ReactNode } from 'react';

const nav = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/chat', label: 'Chat' },
  { href: '/lots', label: 'Lotes' },
  { href: '/intakes', label: 'Vendimia' },
  { href: '/lab', label: 'Laboratorio' },
  { href: '/journal', label: 'Diario' },
  { href: '/calendar', label: 'Calendario' },
  { href: '/compliance', label: 'Compliance' },
];

export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}): Promise<JSX.Element> {
  const cookieStore = await cookies();
  if (!cookieStore.has('wined_refresh')) redirect('/sign-in');

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 bg-cellar-700 text-white flex flex-col">
        <div className="px-6 py-5 text-xl font-bold border-b border-cellar-500">Wined · Bodega</div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-3 py-2 rounded hover:bg-cellar-500 text-sm"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <form
          action="/api/auth/logout"
          method="POST"
          className="px-4 py-4 border-t border-cellar-500"
        >
          <button className="text-xs text-cellar-50 hover:text-white" type="submit">
            Cerrar sesión
          </button>
        </form>
      </aside>
      <main className="flex-1 p-8 bg-gray-50">{children}</main>
    </div>
  );
}

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { ReactNode } from 'react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/chat', label: 'Chat' },
  { href: '/catalog', label: 'Catálogo' },
  { href: '/clients', label: 'Clientes HoReCa' },
  { href: '/sheets', label: 'Fichas comerciales' },
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
      <aside className="w-64 bg-neutral-50 border-r border-neutral-200 p-6 flex flex-col">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-distributor-700">Wined</h1>
          <p className="text-xs text-neutral-500">Distribuidor</p>
        </div>
        <nav className="flex flex-col gap-2">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="px-3 py-2 rounded text-sm text-neutral-700 hover:bg-distributor-50 hover:text-distributor-700"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <form action="/api/auth/logout" method="POST" className="mt-auto pt-6">
          <button className="text-xs text-neutral-500 hover:text-neutral-700" type="submit">
            Cerrar sesión
          </button>
        </form>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}

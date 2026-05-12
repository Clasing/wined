import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { ReactNode } from 'react';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  return (
    <div className="grid min-h-screen grid-cols-[240px_1fr]">
      <aside className="border-r bg-gray-50 p-4">
        <div className="mb-6 text-2xl font-bold text-wined-700">Wined</div>
        <nav className="flex flex-col gap-2 text-sm">
          <Link href="/dashboard" className="hover:text-wined-700">Dashboard</Link>
          <Link href="/chat" className="hover:text-wined-700">Chat</Link>
          <Link href="/library" className="hover:text-wined-700">Cartas</Link>
          <Link href="/inventory" className="hover:text-wined-700">Inventario</Link>
          <Link href="/guests" className="hover:text-wined-700">Clientes</Link>
          <Link href="/menus" className="hover:text-wined-700">Menús</Link>
        </nav>
      </aside>
      <main className="p-6">{children}</main>
    </div>
  );
}

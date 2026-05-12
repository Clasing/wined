import Link from "next/link";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/chat", label: "Chat" },
  { href: "/catalog", label: "Catálogo" },
  { href: "/clients", label: "Clientes HoReCa" },
  { href: "/sheets", label: "Fichas comerciales" },
];

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-neutral-50 border-r border-neutral-200 p-6">
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
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}

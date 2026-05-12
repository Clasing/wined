import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Wined — Sommelier',
  description: 'El copiloto agéntico del vino — sala',
};

export default function RootLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <html lang="es">
      <body className="min-h-screen bg-white text-gray-900">{children}</body>
    </html>
  );
}

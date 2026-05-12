import './globals.css';
import { ClerkProvider } from '@clerk/nextjs';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Wined — Sommelier',
  description: 'El copiloto agéntico del vino para sumilleres',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="es">
        <body className="min-h-screen bg-white text-gray-900">{children}</body>
      </html>
    </ClerkProvider>
  );
}

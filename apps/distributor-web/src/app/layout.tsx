import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wined — Distribuidor",
  description: "El copiloto del vino — distribución",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="es">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ML SEO Analyzer",
  description: "Auditor inteligente de anúncios do Mercado Livre"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

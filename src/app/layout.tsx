import type { Metadata } from "next";
import { Fraunces, Public_Sans, IBM_Plex_Mono } from "next/font/google";

import "./globals.css";

const sans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "CRM Raone",
    template: "%s · CRM Raone",
  },
  description: "CRM comercial para exportação de rochas naturais.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${sans.variable} ${mono.variable} ${display.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}

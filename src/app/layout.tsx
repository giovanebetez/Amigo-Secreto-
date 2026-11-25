import type { Metadata } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["500", "700"],
});

export const metadata: Metadata = {
  title: "Amigo Secreto — Sorteio Automático",
  description:
    "Cadastre seu nome, guarde sua chave secreta e descubra quem você tirou assim que as 15 pessoas entrarem!",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${plusJakarta.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen font-sans antialiased text-stone-900 bg-[#fff9f5] selection:bg-rose-200 selection:text-rose-950">
        {children}
      </body>
    </html>
  );
}

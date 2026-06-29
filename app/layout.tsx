import type { Metadata, Viewport } from "next";
import { Fira_Sans } from "next/font/google";
import "./globals.css";

const firaSans = Fira_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Uçuş Saati Studio — Otomatik Video Kurgu",
  description:
    "Ham klipleri saniyeler içinde sosyal medyaya hazır videoya dönüştüren otomatik kurgu stüdyosu: sessizlik kesimi, Türkçe altyazı, logo ve müzik.",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={firaSans.variable}>
      <body className="bg-ink-950 text-slate-200 antialiased">{children}</body>
    </html>
  );
}

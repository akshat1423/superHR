import type { Metadata } from "next";
import { Inter_Tight, JetBrains_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/shell/Header";
import { Toaster } from "@/components/shell/Toaster";

const interTight = Inter_Tight({ variable: "--font-inter-tight", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });
const instrument = Instrument_Serif({ variable: "--font-instrument", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: "superjoin — onboarding workflows",
  description: "Design persona-based onboarding workflows, bulk-ingest from your ATS, and track every new joiner visually.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${interTight.variable} ${jetbrains.variable} ${instrument.variable} h-full antialiased`}>
      <body className="flex h-full flex-col">
        <Header />
        <main className="relative min-h-0 flex-1">{children}</main>
        <Toaster />
      </body>
    </html>
  );
}

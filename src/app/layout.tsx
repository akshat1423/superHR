import { Suspense } from "react";
import type { Metadata } from "next";
import { Inter_Tight, JetBrains_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { SessionShell } from "@/components/shell/SessionShell";
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
        {/* The session is dynamic; the Suspense boundary keeps the rest of the shell prerenderable. */}
        <Suspense fallback={<div className="grid flex-1 place-items-center font-mono text-xs text-mute">Loading…</div>}>
          <SessionShell>{children}</SessionShell>
        </Suspense>
        <Toaster />
      </body>
    </html>
  );
}

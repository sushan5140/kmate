import type { Metadata } from "next";
import { Manrope, Instrument_Serif } from "next/font/google";
import AppShell from "@/components/layout/app-shell";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  variable: "--font-instrument-serif",
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://kmate.vercel.app"),
  title: "KMate | GKS application tools & applicant community",
  description:
    "Prepare your GKS application with cycle-labelled official rules, document readiness, university checks, interview practice and applicant connections.",
  openGraph: {
    type: "website",
    siteName: "KMate",
    url: "https://kmate.vercel.app",
    title: "KMate | Prepare your GKS application",
    description:
      "Check GKS requirements, plan documents, practice interviews and connect with applicants. Explore the tools in read-only guest mode.",
  },
  twitter: {
    card: "summary",
    title: "KMate | Prepare your GKS application",
    description:
      "Official-source GKS guidance, application readiness, interview practice and applicant connections.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${manrope.variable} ${instrumentSerif.variable} h-full`}>
      <body className="flex min-h-full flex-col bg-canvas text-ink antialiased">
        <div className="grain-overlay" />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

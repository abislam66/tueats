import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import "./globals.css";

import { RecoveryRedirect } from "@/components/auth/recovery-redirect";

// Display: wordmark, venue names, times, headings. Body: UI text.
const bricolage = Bricolage_Grotesque({
  weight: ["500", "600", "700", "800"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-bricolage",
});

const figtree = Figtree({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-figtree",
});

const SITE_DESCRIPTION =
  "An unofficial guide to food trucks and other off-meal-plan food near Temple University.";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "TuEats",
    template: "%s · TuEats",
  },
  description: SITE_DESCRIPTION,
  // Relative paths here resolve against metadataBase (NEXT_PUBLIC_SITE_URL)
  // — https://tueats.co in production, localhost in dev — so the canonical
  // tag is always correct for whichever environment actually rendered it,
  // rather than a hardcoded production URL leaking into local/preview builds.
  alternates: { canonical: "/" },
  openGraph: {
    title: "TuEats",
    description: SITE_DESCRIPTION,
    url: "/",
    siteName: "TuEats",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TuEats",
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      className={`${bricolage.variable} ${figtree.variable}`}
      lang="en"
    >
      <body>
        <RecoveryRedirect />
        {children}
        <Analytics />
      </body>
    </html>
  );
}

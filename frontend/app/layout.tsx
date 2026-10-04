import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Devanagari } from "next/font/google";
import "./globals.css";
import { ScanProvider } from "@/lib/scan-store";
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

/**
 * Devanagari is loaded alongside Inter rather than swapped in when the user
 * picks Hindi: the language toggle itself is labelled "हिं", so the glyphs have
 * to be there before anyone can choose them.
 */
const devanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  display: "swap",
  variable: "--font-devanagari",
});

export const metadata: Metadata = {
  title: "VerifyIT — Is this product really from the company on the label?",
  description:
    "Photograph an Indian product label. VerifyIT reads the licence numbers and checks the company against official records, then shows you exactly what could and could not be confirmed.",
  applicationName: "VerifyIT",
  authors: [{ name: "VerifyIT" }],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#0F766E",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${devanagari.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh font-sans antialiased">
        <ScanProvider>
          {children}
          <Toaster />
        </ScanProvider>
      </body>
    </html>
  );
}

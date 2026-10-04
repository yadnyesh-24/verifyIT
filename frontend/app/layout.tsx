import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Devanagari } from "next/font/google";
import "./globals.css";
import { ScanProvider } from "@/lib/scan-store";
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const notoDevanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
  variable: "--font-hindi",
});

export const metadata: Metadata = {
  title: "VerifyIT — Scan a packet. Know if it is real.",
  description:
    "VerifyIT reads an Indian product label and checks the company, the licences and the label rules against public records. Get a Trust Score in seconds.",
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
      className={`${inter.variable} ${notoDevanagari.variable}`}
      suppressHydrationWarning
    >
      <body className="bg-canvas text-ink antialiased">
        <ScanProvider>
          {children}
          <Toaster />
        </ScanProvider>
      </body>
    </html>
  );
}
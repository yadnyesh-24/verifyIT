import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ScanProvider } from "@/lib/scan-store";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "VerifyIT — Scan a packet. Know if it is real.",
  description:
    "VerifyIT reads an Indian product label and checks the company and licences against public records. Get a verdict in seconds.",
  applicationName: "VerifyIT",
  authors: [{ name: "VerifyIT" }],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#0b1220",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ScanProvider>
          {children}
          <Toaster />
        </ScanProvider>
      </body>
    </html>
  );
}
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://zapdispatch.com"),
  title: "ZAP Dispatch TMS | Dispatch, Tracking & HOS",
  description: "A focused TMS for independent dispatchers and small carriers. Manage loads, drivers, tracking, HOS, documents, invoices, and revenue in one place.",
  icons: { icon: "/zap-icon.svg", shortcut: "/zap-icon.svg" },
  openGraph: {
    title: "ZAP Dispatch TMS",
    description: "Run dispatch. Track every load. Stay in control.",
    type: "website",
    images: [{ url: "/og.png", width: 1536, height: 864, alt: "ZAP Dispatch TMS fleet operations dashboard" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ZAP Dispatch TMS",
    description: "Run dispatch. Track every load. Stay in control.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}

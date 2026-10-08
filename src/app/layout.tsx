import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "PopLens — Nigeria population & health data",
    template: "%s · PopLens",
  },
  description:
    "Location-based insight into Nigeria's population and health indicators, from national level down to states, LGAs and wards. Every number with its source.",
};

/**
 * Root layout: document shell only. The site chrome (banner/header/footer)
 * lives in SiteChrome, applied by the route-group layouts — /embed/** and
 * API-ish routes render without it.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-background font-sans text-foreground antialiased`}
      >
        {children}
      </body>
    </html>
  );
}

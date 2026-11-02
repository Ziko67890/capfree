import type { Metadata } from "next";
import React from "react";
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
  title: "CapFree — Free Video Editor",
  description: "A free, browser-based video editor. No account, no payment, no limits.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Poppins:wght@400;600&family=Montserrat:wght@400;600&family=Playfair+Display&family=Oswald&family=Raleway&family=Bebas+Neue&family=Pacifico&family=Dancing+Script:wght@400;700&family=Lobster&family=Roboto+Mono&family=Space+Grotesk&family=Anton&family=Righteous&family=Permanent+Marker&family=Fredoka:wght@400;600&family=Nunito&family=Josefin+Sans&family=Cinzel&family=Exo+2&family=Quicksand&family=Comfortaa&family=Orbitron&family=Press+Start+2P&family=Abril+Fatface&family=Shadows+Into+Light&family=Great+Vibes&family=Baloo+2&family=Zilla+Slab&family=Lato&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="h-full bg-[#0d0d0f] text-white overflow-hidden">{children}</body>
    </html>
  );
}

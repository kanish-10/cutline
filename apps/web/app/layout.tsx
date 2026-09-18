import { APP } from "@cutline/shared";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ThemeProviderWrapper } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: `${APP.name} — Make room for your next idea`,
  description:
    "A calm production board for videos, podcasts, and writing. Capture an idea and take it all the way to published.",
  openGraph: {
    title: `${APP.name} — Make room for your next idea`,
    description:
      "A calm production board for videos, podcasts, and writing. Capture an idea and take it all the way to published.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ThemeProviderWrapper>{children}</ThemeProviderWrapper>
      </body>
    </html>
  );
}

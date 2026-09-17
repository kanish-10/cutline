import { APP } from "@cutline/shared";
import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { WEB_THEME } from "../constants";
import "./globals.css";

export const metadata: Metadata = {
  title: `${APP.name} — Make room for your next idea`,
  description:
    "A calm production board for videos, podcasts, and writing. Capture an idea and take it all the way to published.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const theme = Object.fromEntries(
    Object.entries(WEB_THEME).map(([key, value]) => [`--${key}`, value]),
  ) as CSSProperties;
  return (
    <html lang="en" style={theme}>
      <body>{children}</body>
    </html>
  );
}

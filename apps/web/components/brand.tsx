import type { ReactNode } from "react";

const paths = {
  board: "M3 3h7v18H3zM14 3h7v11h-7zM14 18h7v3h-7z",
  archive: "M3 4h18v4H3zM5 8v12h14V8M9 12h6",
  search: "m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  plus: "M12 5v14M5 12h14",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  logout: "M9 4H4v16h5M10 12h11m-5-5 5 5-5 5",
  check: "m5 12 4 4L19 6",
  link: "m10 13 4-4M8 15l-2 2a3 3 0 0 1-4-4l5-5a3 3 0 0 1 4 0m2 1 2-2a3 3 0 0 1 4 4l-5 5a3 3 0 0 1-4 0",
} as const;

export function Icon({ name }: { name: keyof typeof paths }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}

export function Brand({ children }: { children: ReactNode }) {
  return (
    <span className="brand">
      <span className="brand-symbol" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      {children}
    </span>
  );
}

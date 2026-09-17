import { COLORS, type CreatorType } from "@cutline/shared";

export const THEME = {
  ...COLORS,
  paper: "#f7f6f2",
  soft: "#eeeee6",
  accentSoft: "#eaf0ff",
  dangerSoft: "#fceeea",
} as const;

export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  hero: 32,
} as const;
export const RADIUS = { small: 8, control: 12, card: 18, pill: 999 } as const;
export const TYPE = {
  caption: 12,
  small: 14,
  body: 16,
  title: 22,
  hero: 36,
} as const;
export const LAYOUT = {
  touch: 48,
  column: 340,
  form: 560,
  notes: 120,
  tagPreview: 2,
} as const;
export const CREATOR_OPTIONS: Record<
  CreatorType,
  { label: string; description: string }
> = {
  video: {
    label: "Video",
    description: "From the first spark to the final cut.",
  },
  podcast: {
    label: "Podcast",
    description: "Make room for your next great conversation.",
  },
  written: {
    label: "Written",
    description: "A little structure for your next great sentence.",
  },
};

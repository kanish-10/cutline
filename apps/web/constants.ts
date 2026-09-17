import { COLORS, type CreatorType } from "@cutline/shared";

export const WEB_THEME = {
  ...COLORS,
  ink: "#292b25",
  paper: "#f7f6f2",
  surface: "#ffffff",
  accent: "#475a3c",
  muted: "#6a6b60",
  line: "#ddded4",
  danger: "#a7352a",
  success: "#3f603e",
  sidebar: "#eeeee6",
  soft: "#f0f1ea",
  "accent-soft": "#e5ebdd",
  "on-accent": "#ffffff",
  "story-ink": "#f2efe3",
  "story-muted": "#c4cbb8",
} as const;

export const AUTH_STEPS = [
  {
    title: "Capture the spark",
    description: "Start with a title. Build on it when you’re ready.",
  },
  {
    title: "Shape the work",
    description: "Keep notes, resources, and next steps together.",
  },
  {
    title: "Move it forward",
    description: "Follow your own process, from idea to published.",
  },
] as const;

export const DEFAULT_API_URL = "http://localhost:3001";
export const UI = {
  emailMax: 254,
  cardTagPreview: 2,
  queryRetries: 1,
  dragMime: "application/x-cutline-card",
  tagSeparator: ",",
  dateLocale: "en",
  discardMessage: "Discard your unsaved changes?",
  conflictMessage:
    "This card changed elsewhere. Your edits are safe. Review the latest saved card below before merging your edits or loading the saved copy.",
} as const;
export const CREATOR_OPTIONS: Record<
  CreatorType,
  { label: string; description: string; mark: string }
> = {
  video: {
    label: "Video",
    description:
      "From a first take to the final cut. YouTube, short-form, and everything between.",
    mark: "01",
  },
  podcast: {
    label: "Podcast",
    description:
      "Give every conversation a home. Solo episodes, interviews, and audio stories.",
    mark: "02",
  },
  written: {
    label: "Written",
    description:
      "Make room for your next great sentence. Newsletters, articles, and blogs.",
    mark: "03",
  },
};
export const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
};

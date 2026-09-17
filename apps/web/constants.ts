import type { CreatorType } from "@cutline/shared";

export const DEFAULT_API_URL = "http://localhost:3001";
export const UI = {
  emailMax: 254,
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

import { z } from "zod";

export const APP = {
  name: "Cutline",
  scheme: "cutline",
  apiPrefix: "/api",
  authPath: "/api/auth",
} as const;
export const LIMITS = {
  title: 240,
  stageName: 40,
  notes: 10000,
  tag: 32,
  tags: 12,
  links: 8,
  url: 2048,
  checklist: 60,
  checklistText: 240,
  stages: 12,
  cards: 1000,
  passwordMin: 12,
  passwordMax: 128,
  name: 80,
  bodyBytes: 32768,
} as const;
export const TIMING = {
  undoMs: 5000,
  staleMs: 15000,
  pollMs: 30000,
  requestMs: 15000,
} as const;
export const COLORS = {
  ink: "#1a1b20",
  paper: "#f5f5f4",
  surface: "#ffffff",
  accent: "#2563eb",
  muted: "#57534e",
  line: "#d6d3d1",
  danger: "#b91c1c",
  success: "#166534",
} as const;
export const STAGE_COLORS = [
  "#948C79",
  "#7C6BAE",
  "#B4512E",
  "#C99A2E",
  "#3B7D6E",
  "#4A7FBF",
  "#C25B8E",
  "#5E9E4A",
] as const;
export const CREATOR_TYPES = ["video", "podcast", "written"] as const;
export type CreatorType = (typeof CREATOR_TYPES)[number];
export const TEMPLATES: Record<CreatorType, readonly string[]> = {
  video: ["Backlog", "Script", "Film", "Edit", "Published"],
  podcast: ["Backlog", "Outline", "Record", "Edit", "Published"],
  written: ["Backlog", "Draft", "Edit", "Design", "Published"],
};
export const CHECKLISTS: Record<string, readonly string[]> = {
  Backlog: ["Flesh out the idea"],
  Script: ["Outline the beats", "Write the hook", "Draft full script"],
  Outline: ["List talking points", "Write intro line"],
  Draft: ["Write first pass", "Note open questions"],
  Film: ["Set up gear", "Record A-roll", "Record B-roll"],
  Record: ["Check audio levels", "Record full take", "Record pickups"],
  Edit: ["Rough cut", "Captions", "Thumbnail"],
  Design: ["Cover image", "Format for email"],
  Published: ["Write caption", "Publish post"],
};
export const idSchema = z.string().uuid();
const titleSchema = z.string().trim().min(1).max(LIMITS.title);
export const safeUrlSchema = z
  .string()
  .trim()
  .max(LIMITS.url)
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  }, "Use an http or https URL without credentials");
export const checklistItemSchema = z
  .object({
    id: idSchema,
    text: z.string().trim().min(1).max(LIMITS.checklistText),
    done: z.boolean(),
  })
  .strict();
export const createBoardSchema = z
  .object({ creatorType: z.enum(CREATOR_TYPES) })
  .strict();
export const createCardSchema = z.object({ title: titleSchema }).strict();
export const updateCardSchema = z
  .object({
    version: z.number().int().nonnegative(),
    title: titleSchema.optional(),
    stageId: idSchema.optional(),
    notes: z.string().max(LIMITS.notes).optional(),
    checklist: z.array(checklistItemSchema).max(LIMITS.checklist).optional(),
    tags: z
      .array(z.string().trim().min(1).max(LIMITS.tag))
      .max(LIMITS.tags)
      .optional(),
    links: z.array(safeUrlSchema).max(LIMITS.links).optional(),
    archived: z.boolean().optional(),
  })
  .strict();
export const createStageSchema = z
  .object({
    name: z.string().trim().min(1).max(LIMITS.stageName),
    color: z.enum(STAGE_COLORS),
  })
  .strict();
export const updateStageSchema = createStageSchema
  .partial()
  .extend({ direction: z.enum(["left", "right"]).optional() })
  .strict();
export const credentialsSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(LIMITS.passwordMin).max(LIMITS.passwordMax),
});
export const signupSchema = credentialsSchema.extend({
  name: z.string().trim().min(1).max(LIMITS.name),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;
export type CreateBoard = z.infer<typeof createBoardSchema>;
export type CreateStage = z.infer<typeof createStageSchema>;
export type UpdateStage = z.infer<typeof updateStageSchema>;
export type UpdateCard = z.infer<typeof updateCardSchema>;
export interface Stage {
  id: string;
  boardId: string;
  name: string;
  color: string;
  position: number;
}
export interface Card {
  id: string;
  boardId: string;
  stageId: string;
  title: string;
  notes: string;
  checklist: ChecklistItem[];
  tags: string[];
  links: string[];
  archived: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}
export interface Board {
  id: string;
  creatorType: CreatorType;
  stages: Stage[];
  cards: Card[];
}
export interface SessionUser {
  id: string;
  name: string;
  email: string;
}
export interface Session {
  user: SessionUser;
}
export interface ApiErrorBody {
  error: string;
}
export const QUERY_KEYS = {
  board: ["board"] as const,
  session: ["session"] as const,
};
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export function createApiClient(
  baseUrl: string,
  getHeaders: () => Record<string, string> = () => ({}),
) {
  const base = baseUrl.replace(/\/$/, "");
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${base}${APP.apiPrefix}${path}`, {
      ...init,
      credentials: "include",
      signal: AbortSignal.timeout(TIMING.requestMs),
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...getHeaders(),
        ...init?.headers,
      },
    });
    if (!response.ok) {
      const data: unknown = await response.json().catch(() => null);
      const message =
        data &&
        typeof data === "object" &&
        "error" in data &&
        typeof data.error === "string"
          ? data.error
          : "Request failed. Please try again.";
      throw new ApiError(response.status, message);
    }
    return response.json() as Promise<T>;
  }
  return {
    getBoard: () => request<Board | null>("/board"),
    createBoard: (input: CreateBoard) =>
      request<Board>("/board", { method: "POST", body: JSON.stringify(input) }),
    createCard: (title: string) =>
      request<Card>("/cards", {
        method: "POST",
        body: JSON.stringify({ title }),
      }),
    updateCard: (id: string, input: UpdateCard) =>
      request<Card>(`/cards/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    createStage: (input: CreateStage) =>
      request<Stage>("/stages", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    updateStage: (id: string, input: UpdateStage) =>
      request<Stage>(`/stages/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    deleteStage: (id: string) =>
      request<{ ok: true }>(`/stages/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
  };
}

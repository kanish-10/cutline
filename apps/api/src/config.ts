import { z } from "zod";

export const SERVER = {
  defaultPort: 3001,
  sessionDays: 7,
  rateWindowSeconds: 60,
  authRequests: 30,
  apiRequests: 120,
  busyTimeoutMs: 5000,
} as const;
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(SERVER.defaultPort),
  DATABASE_URL: z.string().min(1).default("./cutline.db"),
  BETTER_AUTH_SECRET: z.string().min(32),
  API_URL: z.url().default("http://localhost:3001"),
  WEB_ORIGIN: z.url().default("http://localhost:3000"),
  EXPO_ORIGIN: z.url().default("exp://localhost:8081"),
});
export function loadConfig(env: NodeJS.ProcessEnv) {
  const config = envSchema.parse(env);
  if (
    config.NODE_ENV === "production" &&
    (!config.API_URL.startsWith("https://") ||
      !config.WEB_ORIGIN.startsWith("https://"))
  )
    throw new Error("Production origins require HTTPS");
  return config;
}
export type Config = ReturnType<typeof loadConfig>;

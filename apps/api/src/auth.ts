import { expo } from "@better-auth/expo";
import { APP, LIMITS } from "@cutline/shared";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Config } from "./config.js";
import { SERVER } from "./config.js";
import type { AppDatabase } from "./database.js";
import * as schema from "./schema.js";

export function createAuth(db: AppDatabase, config: Config) {
  return betterAuth({
    appName: APP.name,
    baseURL: config.API_URL,
    basePath: APP.authPath,
    secret: config.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    trustedOrigins: [config.WEB_ORIGIN, `${APP.scheme}://`],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: LIMITS.passwordMin,
      maxPasswordLength: LIMITS.passwordMax,
    },
    session: { expiresIn: SERVER.sessionDays * 24 * 60 * 60 },
    rateLimit: {
      enabled: true,
      window: SERVER.rateWindowSeconds,
      max: SERVER.authRequests,
    },
    advanced: { useSecureCookies: config.NODE_ENV === "production" },
    plugins: [expo()],
  });
}
export type Auth = ReturnType<typeof createAuth>;

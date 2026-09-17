import { APP, type Board } from "@cutline/shared";
import type { createApp } from "./app.js";
import { createAuth } from "./auth.js";
import { loadConfig } from "./config.js";
import { migrate, openDatabase } from "./database.js";

const config = loadConfig({
  NODE_ENV: "test",
  DATABASE_URL: ":memory:",
  BETTER_AUTH_SECRET: "test-secret-32-characters-minimum!!",
});
type App = ReturnType<typeof createApp>;
export async function createTestEnv() {
  const { db, sqlite } = openDatabase(":memory:");
  migrate(sqlite);
  const auth = createAuth(db, config);
  const { createApp } = await import("./app.js");
  const app = createApp(db, auth, config);
  return { app, db, sqlite };
}
export function cleanupDatabase() {}
export async function signUp(
  app: App,
  email: string,
  password: string,
  name: string,
): Promise<Response> {
  return app.request(`${APP.authPath}/sign-up/email`, {
    method: "POST",
    body: JSON.stringify({ email, password, name }),
    headers: { "content-type": "application/json" },
  });
}
export async function signIn(
  app: App,
  email: string,
  password: string,
): Promise<Response> {
  return app.request(`${APP.authPath}/sign-in/email`, {
    method: "POST",
    body: JSON.stringify({ email, password }),
    headers: { "content-type": "application/json" },
  });
}
export function parseBody<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}
export type { Board };

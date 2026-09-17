import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { createAuth } from "./auth.js";
import { loadConfig } from "./config.js";
import { migrate, openDatabase } from "./database.js";

const config = loadConfig(process.env);
const { db, sqlite } = openDatabase(config.DATABASE_URL);
migrate(sqlite);
const app = createApp(db, createAuth(db, config), config);
const server = serve({ fetch: app.fetch, port: config.PORT });
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () =>
    server.close(() => {
      sqlite.close();
      process.exit(0);
    }),
  );

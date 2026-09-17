import { loadConfig } from "./config.js";
import { migrate, openDatabase } from "./database.js";

const config = loadConfig(process.env);
const { sqlite } = openDatabase(config.DATABASE_URL);
try {
  migrate(sqlite);
} finally {
  sqlite.close();
}

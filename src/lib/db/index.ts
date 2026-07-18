import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";

let _db: ReturnType<typeof drizzle> | null = null;
let _client: ReturnType<typeof postgres> | null = null;

export function getDb() {
  if (_db) return _db;

  const url = process.env.DATABASE_URL;
  if (!url) {
    // Return a mock/throw-friendly proxy when no DB is available
    throw new Error(
      "DATABASE_URL is not set. Connect a PostgreSQL database to enable data operations.",
    );
  }

  _client = postgres(url, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  _db = drizzle(_client, { schema });
  return _db;
}

export function closeDb() {
  if (_client) {
    _client.end();
    _client = null;
    _db = null;
  }
}

export type { InferInsertModel, InferSelectModel } from "drizzle-orm";

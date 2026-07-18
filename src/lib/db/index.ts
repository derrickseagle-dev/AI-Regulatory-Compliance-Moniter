import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Create a Drizzle client with the given DATABASE_URL.
 * Uses postgres.js under the hood for connection pooling.
 */
export function createDb(databaseUrl: string) {
  const client = postgres(databaseUrl, { max: 10 });
  return drizzle(client, { schema });
}

/**
 * Lazy singleton — returns the same db instance for the process lifetime.
 * Throws if DATABASE_URL is not set.
 */
let _db: ReturnType<typeof createDb> | null = null;

export function getDb() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set — connect a database (Neon) before running queries. " +
        "The owner should connect the database card, which injects DATABASE_URL into the sandbox.",
    );
  }
  _db = createDb(url);
  return _db;
}

export * from "./schema";

import fs from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { config } from "@/lib/config";
import * as schema from "./schema";

let client: Client | null = null;
let db: LibSQLDatabase<typeof schema> | null = null;

function resolveUrl(url: string): string {
  if (url.startsWith("file:")) {
    const raw = url.slice("file:".length);
    const filePath = path.isAbsolute(raw)
      ? raw
      : path.resolve(/* turbopackIgnore: true */ process.cwd(), raw);
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    // libsql expects forward slashes in file URLs on Windows
    const normalized = filePath.replace(/\\/g, "/");
    return `file:${normalized}`;
  }
  return url;
}

export function getClient(): Client {
  if (client) return client;
  const url = resolveUrl(config.db.url);
  client = createClient({
    url,
    authToken: config.db.authToken,
  });
  return client;
}

export function getDb(): LibSQLDatabase<typeof schema> {
  if (db) return db;
  db = drizzle(getClient(), { schema });
  return db;
}

/** Reset singleton (tests). */
export function resetDbSingletons(): void {
  try {
    client?.close();
  } catch {
    // ignore
  }
  client = null;
  db = null;
}

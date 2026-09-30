import { createClient } from "@libsql/client/web";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

export function getDb() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error("TURSO_DATABASE_URL is not configured");
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!authToken && !url.startsWith("file:"))
    throw new Error("TURSO_AUTH_TOKEN is not configured");
  return drizzle(createClient({ url, authToken }), { schema });
}

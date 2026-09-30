// Apply the committed journal to an empty disposable database using the real CLI.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createClient } from "@libsql/client";

const dir = mkdtempSync(join(tmpdir(), "yori-migrations-"));
const path = join(dir, "fresh.db");
let db;
try {
  execFileSync("npm", ["run", "db:migrate"], {
    env: {
      ...process.env,
      TURSO_DATABASE_URL: `file:${path}`,
      TURSO_AUTH_TOKEN: "local-disposable-only",
    },
    stdio: "inherit",
  });
  db = createClient({ url: `file:${path}` });
  const tables = (
    await db.execute("select name from sqlite_master where type = 'table'")
  ).rows.map((r) => r.name);
  for (const name of [
    "users",
    "roles",
    "auth_identities",
    "categories",
    "threads",
    "posts",
    "post_edits",
    "reactions",
    "bookmarks",
    "reports",
    "moderation_records",
    "notifications",
    "rate_limits",
    "sessions",
    "__drizzle_migrations",
  ])
    if (!tables.includes(name))
      throw new Error(`Missing migrated table: ${name}`);
  if ((await db.execute("pragma integrity_check")).rows[0][0] !== "ok")
    throw new Error("Fresh database failed integrity_check");
  if ((await db.execute("pragma foreign_key_check")).rows.length)
    throw new Error("Fresh database failed foreign_key_check");
  console.log(
    "Fresh migration: 14 app tables, journal, integrity and foreign keys OK",
  );
} finally {
  db?.close();
  rmSync(dir, { recursive: true, force: true });
}

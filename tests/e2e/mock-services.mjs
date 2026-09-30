// Local-only HTTP doubles for Turso Hrana v2 and Supabase Auth. Never imported by the app.
import { createServer } from "node:http";
import { readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
const path = join(tmpdir(), `yori-playwright-${process.pid}.db`);
const db = createClient({ url: `file:${path}` });
const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
for (const entry of journal.entries) {
  const statements = readFileSync(`drizzle/${entry.tag}.sql`, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const statement of statements) await db.execute(statement);
}
const people = {
  alice: ["11111111-1111-4111-8111-111111111111", "alice", "user"],
  bob: ["22222222-2222-4222-8222-222222222222", "bob", "user"],
  mod: ["33333333-3333-4333-8333-333333333333", "mod", "moderator"],
  admin: ["44444444-4444-4444-8444-444444444444", "admin", "admin"],
};
for (const role of ["moderator", "admin"])
  await db.execute({
    sql: "INSERT INTO roles (id,name) VALUES (?,?)",
    args: [role, role],
  });
for (const [name, [id, handle, role]] of Object.entries(people)) {
  await db.execute({
    sql: "INSERT INTO users (id,handle,display_name,role_id) VALUES (?,?,?,?)",
    args: [id, handle, handle, role === "user" ? null : role],
  });
  await db.execute({
    sql: "INSERT INTO auth_identities (id,user_id,provider,provider_user_id) VALUES (?,?,?,?)",
    args: [`identity-${name}`, id, "supabase", id],
  });
}
await db.execute({
  sql: "INSERT INTO categories (id,slug,name,description) VALUES (?,?,?,?)",
  args: ["cat-general", "general", "General", "Community conversations"],
});
await db.execute({
  sql: "INSERT INTO threads (id,category_id,author_id,slug,title) VALUES (?,?,?,?,?)",
  args: [
    "thread-seeded",
    "cat-general",
    people.bob[0],
    "welcome",
    "Welcome to Yori",
  ],
});
await db.execute({
  sql: "INSERT INTO posts (id,thread_id,author_id,body) VALUES (?,?,?,?)",
  args: [
    "post-seeded",
    "thread-seeded",
    people.bob[0],
    "Introduce yourself here.",
  ],
});
function user(name) {
  const [id] = people[name];
  return {
    id,
    aud: "authenticated",
    role: "authenticated",
    email: `${name}@example.test`,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: "2026-01-01T00:00:00Z",
  };
}
function value(v) {
  switch (v?.type) {
    case "integer":
      return BigInt(v.value);
    case "float":
      return v.value;
    case "text":
      return v.value;
    case "blob":
      return Buffer.from(v.base64, "base64");
    default:
      return null;
  }
}
function encoded(v) {
  if (v == null) return { type: "null" };
  if (typeof v === "bigint" || (typeof v === "number" && Number.isInteger(v)))
    return { type: "integer", value: String(v) };
  if (typeof v === "number") return { type: "float", value: v };
  if (v instanceof Uint8Array)
    return { type: "blob", base64: Buffer.from(v).toString("base64") };
  return { type: "text", value: String(v) };
}
const sessions = new Map();
let failDatabase = false;
function statementResult(data) {
  return {
    cols: data.columns.map((name) => ({ name })),
    rows: data.rows.map((row) => Array.from(row, encoded)),
    affected_row_count: data.rowsAffected,
    last_insert_rowid: data.lastInsertRowid?.toString(),
  };
}
const emptyResult = { cols: [], rows: [], affected_row_count: 0 };
async function pipeline(body) {
  let baton = body.baton ?? crypto.randomUUID();
  let state = sessions.get(baton) ?? { tx: undefined, sqls: new Map() };
  sessions.set(baton, state);
  async function execute(stmt) {
    const sql = stmt.sql ?? state.sqls.get(stmt.sql_id);
    if (!sql) throw Error("unknown SQL identifier");
    if (/^\s*BEGIN\b/i.test(sql)) {
      state.tx = await db.transaction("write");
      return emptyResult;
    }
    if (/^\s*COMMIT\b/i.test(sql)) {
      if (state.tx) await state.tx.commit();
      state.tx = undefined;
      return emptyResult;
    }
    if (/^\s*ROLLBACK\b/i.test(sql)) {
      if (state.tx) await state.tx.rollback();
      state.tx = undefined;
      return emptyResult;
    }
    const args = stmt.named_args?.length
      ? Object.fromEntries(stmt.named_args.map((a) => [a.name, value(a.value)]))
      : (stmt.args ?? []).map(value);
    return statementResult(await (state.tx ?? db).execute({ sql, args }));
  }
  const results = [];
  for (const request of body.requests) {
    try {
      if (request.type === "close") {
        if (state.tx) await state.tx.rollback().catch(() => {});
        sessions.delete(baton);
        baton = undefined;
        results.push({ type: "ok", response: { type: "close" } });
        continue;
      }
      if (request.type === "store_sql") {
        state.sqls.set(request.sql_id, request.sql);
        results.push({ type: "ok", response: { type: "store_sql" } });
        continue;
      }
      if (request.type === "close_sql") {
        state.sqls.delete(request.sql_id);
        results.push({ type: "ok", response: { type: "close_sql" } });
        continue;
      }
      if (request.type === "get_autocommit") {
        results.push({
          type: "ok",
          response: { type: "get_autocommit", is_autocommit: !state.tx },
        });
        continue;
      }
      if (request.type === "execute") {
        results.push({
          type: "ok",
          response: { type: "execute", result: await execute(request.stmt) },
        });
        continue;
      }
      if (request.type === "batch") {
        const step_results = [],
          step_errors = [];
        for (const step of request.batch.steps) {
          const condition = step.condition;
          if (condition?.type === "ok" && !step_results[condition.step]) {
            step_results.push(null);
            step_errors.push(null);
            continue;
          }
          try {
            step_results.push(await execute(step.stmt));
            step_errors.push(null);
          } catch (e) {
            step_results.push(null);
            step_errors.push({ message: e.message, code: "SQLITE_ERROR" });
          }
        }
        results.push({
          type: "ok",
          response: { type: "batch", result: { step_results, step_errors } },
        });
        continue;
      }
      throw Error(`unsupported request ${request.type}`);
    } catch (e) {
      console.error(
        "mock query failed",
        request.stmt?.sql?.slice(0, 120),
        e.message,
      );
      results.push({
        type: "error",
        error: { message: e.message, code: "SQLITE_ERROR" },
      });
    }
  }
  return { results, ...(baton ? { baton } : {}) };
}
async function requestBody(req) {
  let text = "";
  for await (const chunk of req) text += chunk.toString();
  return JSON.parse(text);
}
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:54387");
  const send = (status, json) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(json));
  };
  try {
    if (url.pathname === "/__ready") return send(200, { ready: true });
    if (url.pathname === "/__fixture") {
      const body = await requestBody(req);
      if (body.action === "database-offline") {
        failDatabase = true;
        return send(200, { ok: true });
      }
      if (body.action === "database-online") {
        failDatabase = false;
        return send(200, { ok: true });
      }
      if (body.action === "count") {
        const data = await db.execute({ sql: body.sql, args: body.args ?? [] });
        return send(200, { rows: data.rows });
      }
      return send(404, {});
    }
    if (url.pathname === "/auth/v1/user") {
      const name = req.headers.authorization?.replace("Bearer token-", "");
      return people[name]
        ? send(200, user(name))
        : send(401, { message: "invalid token" });
    }
    if (url.pathname === "/auth/v1/logout") return send(200, {});
    if (url.pathname === "/auth/v1/otp") {
      await requestBody(req);
      return send(200, {});
    }
    if (url.pathname === "/auth/v1/token") {
      const body = await requestBody(req);
      const name = (body.auth_code ?? body.code ?? "").replace("code-", "");
      return people[name]
        ? send(200, {
            access_token: `token-${name}`,
            refresh_token: `refresh-${name}`,
            expires_in: 3600,
            token_type: "bearer",
            user: user(name),
          })
        : send(400, { message: "invalid code" });
    }
    if (url.pathname === "/v2/pipeline") {
      if (failDatabase) return send(503, { error: "offline" });
      return send(200, await pipeline(await requestBody(req)));
    }
    return send(404, { error: "not found", path: url.pathname });
  } catch (e) {
    console.error("mock service failure", e);
    send(500, { error: "test service failure" });
  }
});
server.listen(54387, "127.0.0.1", () =>
  console.log("Mock services ready at 54387"),
);
process.on("SIGTERM", () => {
  server.close();
  db.close();
  try {
    unlinkSync(path);
  } catch {}
  process.exit(0);
});

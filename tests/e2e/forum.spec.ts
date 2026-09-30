import { expect, test, type Browser, type Page } from "@playwright/test";

async function signIn(page: Page, name: "alice" | "bob" | "mod" | "admin") {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(`${name}@example.test`);
  await page.getByRole("button", { name: /send magic link/i }).click();
  await expect(page.getByRole("status")).toContainText("a link is on its way", {
    timeout: 15000,
  });
  // The local Supabase double models the emailed PKCE callback. No production email is sent.
  await page.goto(`/auth/callback?code=code-${name}`);
  await expect(page).toHaveURL(/\/community/, { timeout: 15000 });
}
async function signedPage(
  browser: Browser,
  name: "alice" | "bob" | "mod" | "admin",
) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, name);
  return { context, page };
}

test("public navigation, health headers, protected routes and magic-link session", async ({
  page,
}) => {
  const home = await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /conversation continues here/i }),
  ).toBeVisible();
  expect(home?.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  expect(home?.headers()["x-content-type-options"]).toBe("nosniff");
  const health = await page.request.get("/api/health");
  const unauthorizedUpload = await page.request.delete("/api/avatar", {
    headers: { origin: "http://127.0.0.1:3100" },
  });
  expect(unauthorizedUpload.status()).toBe(401);
  const crossOriginView = await page.request.post("/api/views/thread-seeded", {
    headers: { origin: "https://evil.example" },
  });
  expect(crossOriginView.status()).toBe(403);
  expect(await health.json()).toEqual({ status: "ok", database: "ok" });
  await page.goto("/community");
  await expect(
    page.getByRole("link", { name: /General.*Community conversations/ }),
  ).toBeVisible();
  await page.goto("/categories/general");
  await expect(
    page.getByRole("heading", { name: "General", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Welcome to Yori/ }),
  ).toBeVisible();
  await page.goto("/threads/thread-seeded");
  await expect(page.getByText("Introduce yourself here.")).toBeVisible();
  await page.goto("/u/bob");
  await expect(page.getByRole("heading", { name: "bob" })).toBeVisible();
  for (const path of [
    "/profile",
    "/bookmarks",
    "/notifications",
    "/moderation",
    "/admin",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
  await signIn(page, "alice");
  const authCookies = (await page.context().cookies()).filter(
    (c) => c.name.startsWith("sb-") && !!c.value,
  );
  expect(authCookies.length).toBeGreaterThan(0);
  expect(authCookies.every((c) => c.httpOnly && c.sameSite === "Lax")).toBe(
    true,
  );
  await page.goto("/profile");
  await expect(
    page.getByRole("heading", { name: "Your profile" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/bookmarks");
  await expect(page).toHaveURL(/\/login/);
});

test("forum, notifications, moderation and admin permissions across four users", async ({
  browser,
  request,
}) => {
  const alice = await signedPage(browser, "alice");
  try {
    const a = alice.page;
    await a.goto("/categories/general");
    await a
      .getByPlaceholder("What’s on your mind?")
      .fill("Resilient community discussion");
    await a
      .getByPlaceholder("Give your conversation a thoughtful start…")
      .fill("Hello @bob, this is our new topic.");
    await a.getByRole("button", { name: "Start a discussion" }).click();
    await expect(a).toHaveURL(/\/threads\//);
    const newThread = new URL(a.url()).pathname;
    await expect(
      a.getByRole("heading", { name: "Resilient community discussion" }),
    ).toBeVisible();
    await a.goto("/threads/thread-seeded");
    await a
      .getByPlaceholder("Add to the conversation…")
      .fill("Hello Bob! This is my reply.");
    await a.getByRole("button", { name: "Post a reply" }).click();
    await expect(
      a.locator("article p").getByText("Hello Bob! This is my reply."),
    ).toBeVisible();
    const ownPost = a
      .locator("article")
      .filter({ hasText: "Hello Bob! This is my reply." });
    await ownPost.getByText("Edit post").click();
    await ownPost
      .locator('textarea[name="body"]')
      .fill("Hello Bob! This is my edited reply.");
    await ownPost.getByRole("button", { name: "Save edit" }).click();
    await expect(
      a.locator("article p").getByText("Hello Bob! This is my edited reply."),
    ).toBeVisible();
    await a
      .locator("article")
      .filter({ hasText: "Introduce yourself here." })
      .getByRole("button", { name: /like 0/i })
      .click();
    await expect(
      a
        .locator("article")
        .filter({ hasText: "Introduce yourself here." })
        .getByRole("button", { name: /like 1/i }),
    ).toBeVisible();
    await a.getByRole("button", { name: /Save thread/ }).click();
    await expect(a.getByRole("button", { name: /Saved/ })).toBeVisible();
    await a.getByRole("button", { name: /Saved/ }).click();
    await expect(a.getByRole("button", { name: /Save thread/ })).toBeVisible();
    await a.getByRole("button", { name: /Save thread/ }).click();
    await a.goto("/bookmarks");
    await expect(a.getByText("Welcome to Yori")).toBeVisible();
    await a.goto("/search?q=Resilient");
    await expect(a.getByText("Resilient community discussion")).toBeVisible();
    await a.goto("/u/alice");
    await expect(a.getByRole("heading", { name: "alice" })).toBeVisible();

    const bob = await signedPage(browser, "bob");
    try {
      const b = bob.page;
      await b.goto("/bookmarks");
      await expect(b.getByText("No saved conversations yet.")).toBeVisible();
      await b.goto("/notifications");
      await expect(
        b.getByText(/Someone replied to your conversation/),
      ).toBeVisible();
      await b.getByRole("button", { name: "Mark read" }).first().click();
      await expect(
        b
          .locator("article")
          .filter({ hasText: "Someone replied to your conversation" })
          .getByRole("button", { name: "Mark read" }),
      ).toHaveCount(0);
      await b.goto(newThread);
      await expect(
        b
          .locator("article")
          .filter({ hasText: "Hello @bob" })
          .getByText("Edit post"),
      ).toHaveCount(0);
      await b
        .getByPlaceholder("Add to the conversation…")
        .fill("A friendly answer for @alice.");
      await b.getByRole("button", { name: "Post a reply" }).click();
      await expect(
        b.locator("article p").getByText("A friendly answer for @alice."),
      ).toBeVisible();
      const report = b
        .locator("details")
        .filter({ has: b.getByText("Report thread") });
      await report.getByText("Report thread").click();
      await report
        .getByPlaceholder(/Tell moderators what happened/)
        .fill("Please review this discussion for moderation.");
      await report.getByRole("button", { name: "Submit report" }).click();
      await expect(report.getByRole("status")).toContainText("Saved.");
      await b.goto("/moderation");
      expect(b.url()).toMatch(/\/(login|moderation)/);
      await expect(
        b.getByText("Please review this discussion for moderation."),
      ).toHaveCount(0);
      await b.goto("/admin");
      await expect(b.getByText("Shape the spaces")).toHaveCount(0);
      // Direct forged POST without a valid server-action reference must not change state.
      await b.request.post("/admin", {
        form: { name: "Illegal", slug: "illegal" },
      });
      const illegal = await request.post("http://127.0.0.1:54387/__fixture", {
        data: {
          action: "count",
          sql: "select count(*) as count from categories where slug='illegal'",
        },
      });
      expect((await illegal.json()).rows[0].count).toBe(0);

      await a.goto("/notifications");
      await expect(
        a.getByText("Someone replied to your conversation"),
      ).toBeVisible();
      await a.getByRole("button", { name: "Mark all read" }).click();
      await expect(a.getByRole("button", { name: "Mark read" })).toHaveCount(0);

      const moderator = await signedPage(browser, "mod");
      try {
        const m = moderator.page;
        await m.goto("/moderation");
        await expect(
          m.getByText("Please review this discussion for moderation."),
        ).toBeVisible();
        await m.getByRole("button", { name: "Apply decision" }).first().click();
        await expect(m.getByText("RESOLVED")).toBeVisible();
        await m.goto("/admin");
        await expect(m.getByText("Shape the spaces")).toHaveCount(0);
        await m.goto(newThread);
        await m.getByRole("button", { name: "lock", exact: true }).click();
        await a.goto(newThread);
        await a.reload();
        await expect(a.getByText("This discussion is locked.")).toBeVisible();
        await m.goto(newThread);
        await m.getByRole("button", { name: "unlock", exact: true }).click();
        await m.getByRole("button", { name: "Archive thread" }).click();
        await a.goto(newThread);
        await a.reload();
        await expect(
          a.getByRole("heading", { name: "Resilient community discussion" }),
        ).toHaveCount(0);
        await m.goto("/moderation");
        await m.getByRole("button", { name: "Restore thread" }).first().click();
        await a.goto(newThread);
        await a.reload();
        await expect(
          a.getByRole("heading", { name: "Resilient community discussion" }),
        ).toBeVisible();
      } finally {
        await moderator.context.close();
      }

      const admin = await signedPage(browser, "admin");
      try {
        const d = admin.page;
        await d.goto("/admin");
        await expect(
          d.getByRole("heading", { name: "Shape the spaces" }),
        ).toBeVisible();
        const addCategory = d
          .locator("form")
          .filter({ has: d.getByRole("heading", { name: "Add category" }) });
        await addCategory.getByPlaceholder("Name").fill("Announcements");
        await addCategory.getByPlaceholder("url-slug").fill("announcements");
        await addCategory.getByRole("button", { name: "Add category" }).click();
        await expect(addCategory.getByRole("status")).toContainText("Saved.");
        await d.goto("/community");
        await expect(
          d.getByRole("link", { name: /Announcements/ }),
        ).toBeVisible();
        await d.goto("/admin");
        const editCategory = d
          .locator("form")
          .filter({ has: d.getByRole("heading", { name: "Update category" }) })
          .filter({ has: d.locator('input[value="Announcements"]') });
        await editCategory.getByLabel(/Archived/).check();
        await editCategory
          .getByRole("button", { name: "Update category" })
          .click();
        await expect(editCategory.getByRole("status")).toContainText("Saved.");
        await d.goto("/community");
        await expect(
          d.getByRole("link", { name: /Announcements/ }),
        ).toHaveCount(0);
      } finally {
        await admin.context.close();
      }
    } finally {
      await bob.context.close();
    }
  } finally {
    await alice.context.close();
  }
});

test("health degrades safely when Turso is unavailable", async ({
  request,
}) => {
  const base = "http://127.0.0.1:54387/__fixture";
  await request.post(base, { data: { action: "database-offline" } });
  try {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(503);
    expect(response.headers()["retry-after"]).toBe("30");
    expect(await response.json()).toEqual({
      status: "degraded",
      database: "unavailable",
    });
    expect(response.headers()["cache-control"]).toContain("no-store");
  } finally {
    await request.post(base, { data: { action: "database-online" } });
  }
});

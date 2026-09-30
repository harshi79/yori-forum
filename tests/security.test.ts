import { afterEach, describe, expect, it, vi } from "vitest";
import { isSameOrigin } from "../src/lib/forum/origin";
import { authCookieOptions } from "../src/lib/auth/cookie-options";

afterEach(() => vi.unstubAllEnvs());

describe("browser origin and session cookies", () => {
  it("rejects missing, malformed and cross-host origins", () => {
    vi.stubEnv("APP_ORIGIN", "http://127.0.0.1:3100");
    expect(isSameOrigin(null, "127.0.0.1:3100")).toBe(false);
    expect(isSameOrigin("https://evil.example", "127.0.0.1:3100")).toBe(false);
    expect(isSameOrigin("javascript:alert(1)", "127.0.0.1:3100")).toBe(false);
    expect(isSameOrigin("http://127.0.0.1:3100", "127.0.0.1:3100")).toBe(true);
  });
  it("rejects an HTTP origin on the configured HTTPS production host", () => {
    vi.stubEnv("APP_ORIGIN", "https://forum.example.com");
    expect(isSameOrigin("http://forum.example.com", "forum.example.com")).toBe(
      false,
    );
    expect(isSameOrigin("https://forum.example.com", "forum.example.com")).toBe(
      true,
    );
    expect(authCookieOptions()).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
    });
  });
});

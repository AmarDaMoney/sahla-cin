import { afterEach, describe, expect, it, vi } from "vitest";
import { appUrl, configChecks } from "@/server/config";

afterEach(() => vi.unstubAllEnvs());

describe("appUrl", () => {
  it("tolerates a trailing slash and a missing https://", () => {
    vi.stubEnv("BETTER_AUTH_URL", " https://bookcine.up.railway.app/ ");
    expect(appUrl()).toBe("https://bookcine.up.railway.app");
    vi.stubEnv("BETTER_AUTH_URL", "bookcine.up.railway.app");
    expect(appUrl()).toBe("https://bookcine.up.railway.app");
  });

  it("falls back to Railway's public domain", () => {
    vi.stubEnv("BETTER_AUTH_URL", "");
    vi.stubEnv("RAILWAY_PUBLIC_DOMAIN", "sahla.up.railway.app");
    expect(appUrl()).toBe("https://sahla.up.railway.app");
  });
});

describe("configChecks", () => {
  it("flags a short secret and never returns values", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "trop-court");
    const checks = configChecks();
    expect(checks.find((c) => c.name === "BETTER_AUTH_SECRET")?.ok).toBe(false);
    expect(JSON.stringify(checks)).not.toContain("trop-court");
  });
});

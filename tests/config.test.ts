import { afterEach, describe, expect, it, vi } from "vitest";
import { adminEmails, appUrl, authSecret, configChecks, envValue } from "@/server/config";

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

describe("example values from .env.example", () => {
  it("ignores a localhost address when running on Railway", () => {
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:8080");
    vi.stubEnv("RAILWAY_PUBLIC_DOMAIN", "sahla.up.railway.app");
    expect(appUrl()).toBe("https://sahla.up.railway.app");
    expect(configChecks().find((c) => c.name === "BETTER_AUTH_URL")?.ok).toBe(true);
  });

  it("rejects the example secret even though it is long enough", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "changez-moi-avec-openssl-rand-base64-32");
    expect(authSecret()).toBeUndefined();
    vi.stubEnv("BETTER_AUTH_SECRET", "x".repeat(40));
    expect(authSecret()).toBe("x".repeat(40));
  });

  it("flags example sender and non-Resend keys", () => {
    vi.stubEnv("RESEND_API_KEY", "ma-cle");
    vi.stubEnv("EMAIL_FROM", "BookCinéDZ <billets@votre-domaine.dz>");
    const checks = configChecks();
    expect(checks.find((c) => c.name === "RESEND_API_KEY")?.ok).toBe(false);
    expect(checks.find((c) => c.name === "EMAIL_FROM")?.ok).toBe(false);
  });
});

describe("adminEmails", () => {
  it("tolerates quotes, spaces, separators, case and 'Name <email>'", () => {
    vi.stubEnv("ADMIN_EMAILS", ' "Boss@Example.com" ; Other <second@example.dz>, ');
    expect(adminEmails()).toEqual(["boss@example.com", "second@example.dz"]);
    vi.stubEnv("ADMIN_EMAILS", "vous@exemple.com");
    expect(adminEmails()).toEqual([]);
  });

  it("strips quotes from any setting", () => {
    vi.stubEnv("PAYMENT_MODE", '"simulation"');
    expect(envValue("PAYMENT_MODE")).toBe("simulation");
  });
});

describe("email diagnostics", () => {
  it("uses EMAIL_FROM's domain, or Resend's test sender", async () => {
    const { senderDomain, usesTestSender } = await import("@/server/email");
    vi.stubEnv("EMAIL_FROM", "");
    expect(usesTestSender()).toBe(true);
    vi.stubEnv("EMAIL_FROM", '"BookCinéDZ <billets@Sahla.dz>"');
    expect(usesTestSender()).toBe(false);
    expect(senderDomain()).toBe("sahla.dz");
  });

  it("never shows an e-mail address in the reported error", async () => {
    const { redactEmails } = await import("@/server/email");
    expect(
      redactEmails(
        '403 {"message":"You can only send testing emails to your own email address (owner@gmail.com)."}',
      ),
    ).toBe('403 {"message":"You can only send testing emails to your own email address (…@…)."}');
  });

  it("remembers the last Resend refusal", async () => {
    const { lastEmailResult, sendEmail } = await import("@/server/email");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("EMAIL_FROM", "billets@sahla.dz");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response('{"message":"The sahla.dz domain is not verified"}', { status: 403 }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    await sendEmail({ to: "a@b.dz", subject: "s", html: "h", text: "t" });
    expect(lastEmailResult()).toMatchObject({ ok: false });
    expect(lastEmailResult()!.detail).toContain("domain is not verified");
    vi.restoreAllMocks();
  });
});

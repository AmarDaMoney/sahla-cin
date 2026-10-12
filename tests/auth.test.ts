import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createAuth } from "@/server/auth";
import type { Db } from "@/server/db/client";
import { user, user_roles } from "@/server/db/schema";
import { getViewer } from "@/server/viewer";
import { createTestDb } from "./helpers";

vi.stubEnv("BETTER_AUTH_URL", "http://localhost:8080");
vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret-123");
vi.stubEnv("ADMIN_EMAILS", "boss@example.com");

let db: Db;
let auth: ReturnType<typeof createAuth>;

beforeEach(async () => {
  db = await createTestDb();
  auth = createAuth(db);
  vi.spyOn(console, "info").mockImplementation(() => {});
});

async function signUpAndSignIn(email: string, verify: boolean) {
  await auth.api.signUpEmail({ body: { email, password: "motdepasse-solide", name: "Test" } });
  // Better Auth enregistre les adresses en minuscules.
  if (verify) {
    await db.update(user).set({ emailVerified: true }).where(eq(user.email, email.toLowerCase()));
  }
  return signIn(email);
}

async function signIn(email: string) {
  const { headers } = await auth.api.signInEmail({
    body: { email, password: "motdepasse-solide" },
    returnHeaders: true,
  });
  const cookie = headers.get("set-cookie")!.split(";")[0]!;
  return new Headers({ cookie });
}

describe("auth", () => {
  it("refuses to sign in before the email address is verified", async () => {
    await expect(signUpAndSignIn("someone@example.com", false)).rejects.toMatchObject({
      status: "FORBIDDEN",
    });
  });

  it("rejects short passwords", async () => {
    await expect(
      auth.api.signUpEmail({ body: { email: "a@example.com", password: "court", name: "A" } }),
    ).rejects.toBeTruthy();
  });

  it("gives every account the client role, and admin only via ADMIN_EMAILS", async () => {
    const client = await getViewer(db, auth, await signUpAndSignIn("someone@example.com", true));
    expect(client?.roles).toEqual(["client"]);

    const boss = await getViewer(db, auth, await signUpAndSignIn("Boss@Example.com", true));
    expect(boss?.roles).toContain("admin");

    await db.insert(user_roles).values({ user_id: client!.id, role: "agent_guichet" });
    const agent = await getViewer(db, auth, await signIn("someone@example.com"));
    expect(agent?.roles).toEqual(["client", "agent_guichet"]);
  });

  it("returns no viewer without a valid session", async () => {
    expect(await getViewer(db, auth, new Headers())).toBeNull();
    expect(
      await getViewer(db, auth, new Headers({ cookie: "better-auth.session_token=forged" })),
    ).toBeNull();
  });
});

describe("email links", () => {
  const lastLink = () => {
    const calls = vi.mocked(console.info).mock.calls.map((c) => String(c[0]));
    const match = calls.at(-1)?.match(/https?:\/\/\S+/);
    return match![0];
  };

  it("verifies the address through the emailed link", async () => {
    await auth.api.signUpEmail({
      body: { email: "new@example.com", password: "motdepasse-solide", name: "New" },
    });
    const res = await auth.handler(new Request(lastLink()));
    expect(res.status).toBeLessThan(400);
    const [u] = await db.select().from(user).where(eq(user.email, "new@example.com"));
    expect(u!.emailVerified).toBe(true);
  });

  it("resets the password through the emailed link", async () => {
    await auth.api.signUpEmail({
      body: { email: "forgot@example.com", password: "ancien-mot-de-passe", name: "F" },
    });
    await db.update(user).set({ emailVerified: true }).where(eq(user.email, "forgot@example.com"));
    await auth.api.requestPasswordReset({
      body: { email: "forgot@example.com", redirectTo: "/reinitialiser" },
    });
    // Le lien redirige vers /reinitialiser?token=… ; on rejoue cette étape.
    const res = await auth.handler(new Request(lastLink()));
    const token = new URL(res.headers.get("location")!, "http://x").searchParams.get("token")!;
    await auth.api.resetPassword({ body: { newPassword: "nouveau-mot-de-passe", token } });
    await expect(
      auth.api.signInEmail({
        body: { email: "forgot@example.com", password: "nouveau-mot-de-passe" },
      }),
    ).resolves.toBeTruthy();
    await expect(
      auth.api.signInEmail({
        body: { email: "forgot@example.com", password: "ancien-mot-de-passe" },
      }),
    ).rejects.toBeTruthy();
  });
});

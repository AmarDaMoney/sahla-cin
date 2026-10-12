import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Db } from "./db/client";
import { getDb } from "./db/client";
import * as schema from "./db/schema";
import { actionEmail, sendEmail } from "./email";

// Authentification : e-mail + mot de passe (adresse vérifiée obligatoire),
// réinitialisation du mot de passe, Google (si configuré). Les sessions sont
// stockées en base, dans un cookie httpOnly.
export function createAuth(db: Db) {
  const baseURL = process.env["BETTER_AUTH_URL"];
  const googleId = process.env["GOOGLE_CLIENT_ID"];
  const googleSecret = process.env["GOOGLE_CLIENT_SECRET"];

  return betterAuth({
    baseURL,
    secret: process.env["BETTER_AUTH_SECRET"],
    trustedOrigins: baseURL ? [baseURL] : [],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        rateLimit: schema.rateLimit,
      },
    }),
    advanced: {
      database: { generateId: "uuid" },
      // En-tête contenant l'IP réelle du visiteur, posé par le proxy de
      // l'hébergeur (sert à limiter les tentatives de connexion par IP).
      // Railway : X-Real-IP. À vérifier/adapter via CLIENT_IP_HEADER.
      ipAddress: {
        ipAddressHeaders: [(process.env["CLIENT_IP_HEADER"] ?? "x-real-ip").toLowerCase()],
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail(
          actionEmail({
            to: user.email,
            subject: "Réinitialisation de votre mot de passe",
            intro: "Vous avez demandé à changer le mot de passe de votre compte BookCinéDZ.",
            action: "Choisir un nouveau mot de passe",
            url,
          }),
        );
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail(
          actionEmail({
            to: user.email,
            subject: "Confirmez votre adresse e-mail",
            intro: `Bienvenue ${user.name} ! Confirmez votre adresse pour activer votre compte BookCinéDZ.`,
            action: "Confirmer mon adresse",
            url,
          }),
        );
      },
    },
    socialProviders:
      googleId && googleSecret
        ? { google: { clientId: googleId, clientSecret: googleSecret } }
        : {},
    rateLimit: {
      enabled: process.env["NODE_ENV"] !== "test",
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 3600, max: 5 },
        "/request-password-reset": { window: 3600, max: 3 },
        "/send-verification-email": { window: 3600, max: 3 },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

let auth: Auth | undefined;

export function getAuth(): Auth {
  auth ??= createAuth(getDb());
  return auth;
}

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Db } from "./db/client";
import { getDb } from "./db/client";
import * as schema from "./db/schema";
import { AppError } from "@/lib/errors";
import { appUrl, authSecret, clientIpHeaders, envValue } from "./config";
import { DEFAULT_LANG, langFromHeaders } from "@/lib/i18n/lang";
import { actionEmail, sendEmail } from "./email";
import { EMAIL_TEXTS } from "./email-texts";

// Authentification : e-mail + mot de passe (adresse vérifiée obligatoire),
// réinitialisation du mot de passe, Google (si configuré). Les sessions sont
// stockées en base, dans un cookie httpOnly.
export function createAuth(db: Db) {
  const baseURL = appUrl();
  const googleId = envValue("GOOGLE_CLIENT_ID");
  const googleSecret = envValue("GOOGLE_CLIENT_SECRET");

  return betterAuth({
    baseURL,
    secret: authSecret(),
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
      // l'hébergeur (limite les tentatives de connexion par visiteur).
      // /api/health indique si cet en-tête est bien reçu.
      ipAddress: { ipAddressHeaders: clientIpHeaders() },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }, request) => {
        const lang = request ? langFromHeaders(request.headers) : DEFAULT_LANG;
        const t = EMAIL_TEXTS[lang].reset;
        await sendEmail(
          actionEmail({
            to: user.email,
            subject: t.subject,
            intro: t.intro,
            action: t.action,
            url,
            lang,
          }),
        );
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }, request) => {
        const lang = request ? langFromHeaders(request.headers) : DEFAULT_LANG;
        const t = EMAIL_TEXTS[lang].verify;
        await sendEmail(
          actionEmail({
            to: user.email,
            subject: t.subject,
            intro: t.intro(user.name),
            action: t.action,
            url,
            lang,
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
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 3600, max: 5 },
        "/request-password-reset": { window: 3600, max: 3 },
        "/send-verification-email": { window: 3600, max: 3 },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

// Sans secret solide, Better Auth utiliserait un secret par défaut connu de
// tous (sessions falsifiables) : on refuse alors toute connexion.
export function authConfigured(): boolean {
  return !!authSecret() && !!appUrl();
}

let auth: Auth | undefined;

export function getAuth(): Auth {
  if (!authConfigured()) {
    throw new AppError(
      "AUTH_NOT_CONFIGURED",
      "Connexion indisponible : configuration incomplète (voir /api/health).",
    );
  }
  auth ??= createAuth(getDb());
  return auth;
}

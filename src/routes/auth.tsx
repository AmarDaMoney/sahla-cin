import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ME_QUERY_KEY } from "@/hooks/useAuth";
import { fetchAuthOptions } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { useI18n } from "@/lib/i18n";
import { pageHead } from "@/lib/i18n/meta";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search["redirect"] === "string" ? (search["redirect"] as string) : "/",
  }),
  head: pageHead("auth", { noindex: true }),
  component: AuthPage,
});

// N'autorise que les chemins internes (pas de redirection vers un autre site).
function safePath(path: string) {
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") ? path : "/";
}

type Mode = "login" | "signup" | "forgot";

function AuthPage() {
  const { redirect } = Route.useSearch();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const options = useQuery({ queryKey: ["auth-options"], queryFn: () => fetchAuthOptions() });
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [unverified, setUnverified] = useState(false);

  const target = safePath(redirect);
  const callbackURL = target;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setUnverified(false);
    try {
      if (mode === "signup") {
        const { error } = await authClient.signUp.email({ email, password, name, callbackURL });
        if (error) return void toast.error(authErrorMessage(error, lang));
        toast.success(t.auth.checkInbox, { duration: 10_000 });
        setMode("login");
        setPassword("");
      } else if (mode === "forgot") {
        const { error } = await authClient.requestPasswordReset({
          email,
          redirectTo: "/reinitialiser",
        });
        if (error && error.status === 429) return void toast.error(authErrorMessage(error, lang));
        // Même message que le compte existe ou non (pas de fuite d'information).
        toast.success(t.auth.linkSent, { duration: 10_000 });
        setMode("login");
      } else {
        const { error } = await authClient.signIn.email({ email, password });
        if (error) {
          if (error.code === "EMAIL_NOT_VERIFIED") setUnverified(true);
          return void toast.error(authErrorMessage(error, lang));
        }
        await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
        navigate({ to: target });
      }
    } finally {
      setBusy(false);
    }
  }

  async function resendVerification() {
    const { error } = await authClient.sendVerificationEmail({ email, callbackURL });
    if (error) toast.error(authErrorMessage(error, lang));
    else toast.success(t.auth.resent);
  }

  async function google() {
    const { error } = await authClient.signIn.social({ provider: "google", callbackURL });
    if (error) toast.error(authErrorMessage(error, lang));
  }

  const title = mode === "forgot" ? t.auth.forgotTitle : t.auth.title;

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-md px-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "forgot" ? t.auth.forgotHint : t.auth.subtitle}
        </p>

        <form
          onSubmit={submit}
          className="mt-6 space-y-4 rounded-2xl border border-border bg-card p-5"
        >
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="name">{t.auth.name}</Label>
              <Input
                id="name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                required
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">{t.auth.email}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          {mode !== "forgot" && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t.auth.password}</Label>
                {mode === "login" && (
                  <button
                    type="button"
                    className="text-xs text-primary underline-offset-4 hover:underline"
                    onClick={() => setMode("forgot")}
                  >
                    {t.auth.forgot}
                  </button>
                )}
              </div>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                maxLength={128}
                required
              />
              {mode === "signup" && (
                <p className="text-xs text-muted-foreground">{t.auth.passwordHint}</p>
              )}
            </div>
          )}

          {unverified && (
            <div className="rounded-xl border border-primary/40 bg-primary/10 p-3 text-sm">
              <p>{t.auth.notVerified}</p>
              <button
                type="button"
                className="mt-1 text-primary underline-offset-4 hover:underline"
                onClick={() => void resendVerification()}
              >
                {t.auth.resend}
              </button>
            </div>
          )}

          <Button type="submit" className="w-full rounded-xl" disabled={busy}>
            {mode === "login" ? t.auth.login : mode === "signup" ? t.auth.signup : t.auth.sendLink}
          </Button>

          {mode !== "forgot" && options.data?.google && (
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-xl"
              onClick={() => void google()}
            >
              {t.auth.google}
            </Button>
          )}

          <button
            type="button"
            className="w-full text-center text-sm text-primary underline-offset-4 hover:underline"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
          >
            {mode === "login"
              ? t.auth.noAccount
              : mode === "signup"
                ? t.auth.haveAccount
                : t.auth.backToLogin}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          <Link to="/compte" className="underline-offset-4 hover:underline">
            {t.nav.account}
          </Link>
        </p>
      </main>
    </div>
  );
}

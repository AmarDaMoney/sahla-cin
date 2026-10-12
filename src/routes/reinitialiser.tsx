import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/PasswordInput";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { useI18n } from "@/lib/i18n";
import { pageHead } from "@/lib/i18n/meta";

// Page ouverte depuis le lien « mot de passe oublié » reçu par e-mail.
export const Route = createFileRoute("/reinitialiser")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search["token"] === "string" ? (search["token"] as string) : "",
    error: typeof search["error"] === "string" ? (search["error"] as string) : "",
  }),
  head: pageHead("reset", { noindex: true }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token, error } = Route.useSearch();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await authClient.resetPassword({ newPassword: password, token });
      if (res.error) return void toast.error(authErrorMessage(res.error, lang));
      toast.success(t.auth.resetDone);
      navigate({ to: "/auth", search: { redirect: "/" } });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-md px-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight">{t.auth.resetTitle}</h1>
        {!token || error ? (
          <p className="mt-4 text-sm text-muted-foreground">{t.auth.resetInvalid}</p>
        ) : (
          <form
            onSubmit={submit}
            className="mt-6 space-y-4 rounded-2xl border border-border bg-card p-5"
          >
            <div className="space-y-1.5">
              <Label htmlFor="password">{t.auth.newPassword}</Label>
              <PasswordInput
                id="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                maxLength={128}
                required
              />
              <p className="text-xs text-muted-foreground">{t.auth.passwordHint}</p>
            </div>
            <Button type="submit" className="w-full rounded-xl" disabled={busy}>
              {t.common.save}
            </Button>
          </form>
        )}
      </main>
    </div>
  );
}

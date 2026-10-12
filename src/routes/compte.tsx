import { createFileRoute, Link } from "@tanstack/react-router";
import {
  LogIn,
  LogOut,
  MessageCircle,
  ScanLine,
  ShieldCheck,
  ClipboardList,
  Info,
  FileText,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { pageHead } from "@/lib/i18n/meta";

export const Route = createFileRoute("/compte")({
  head: pageHead("account"),
  component: Account,
});

// Numéro WhatsApp du support, format international sans « + » (ex. 213555123456).
const whatsapp = import.meta.env["VITE_WHATSAPP_NUMBER"] as string | undefined;

function Account() {
  const { user, roles, isAdmin, isContributor, isAgent, signOut } = useAuth();
  const { t } = useI18n();

  return (
    <div className="min-h-screen pb-24">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="text-2xl font-bold tracking-tight">{t.nav.account}</h1>

        <div className="mt-4 rounded-2xl border border-border bg-card p-4">
          {user ? (
            <>
              <p className="text-sm font-medium">{user.email}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {roles.map((r) => (
                  <Badge key={r} variant="secondary" className="rounded-full">
                    {t.roles[r]}
                  </Badge>
                ))}
              </div>
              <Button
                variant="outline"
                className="mt-4 w-full rounded-xl"
                onClick={() => signOut()}
              >
                <LogOut className="size-4" />
                {t.common.signOut}
              </Button>
            </>
          ) : (
            <Button asChild className="w-full rounded-xl">
              <Link to="/auth" search={{ redirect: "/compte" }}>
                <LogIn className="size-4" />
                {t.common.signIn}
              </Link>
            </Button>
          )}
        </div>

        {(isContributor || isAdmin || isAgent) && (
          <div className="mt-4 space-y-2">
            {isContributor && (
              <Button asChild variant="outline" className="w-full justify-start rounded-xl">
                <Link to="/contributeur">
                  <ClipboardList className="size-4 text-primary" />
                  {t.contributor.title}
                </Link>
              </Button>
            )}
            {isAdmin && (
              <Button asChild variant="outline" className="w-full justify-start rounded-xl">
                <Link to="/admin">
                  <ShieldCheck className="size-4 text-primary" />
                  {t.admin.title}
                </Link>
              </Button>
            )}
            {isAgent && (
              <Button asChild variant="outline" className="w-full justify-start rounded-xl">
                <Link to="/scan">
                  <ScanLine className="size-4 text-primary" />
                  {t.scan.title}
                </Link>
              </Button>
            )}
          </div>
        )}

        {whatsapp && (
          <div className="mt-4">
            <Button asChild variant="outline" className="w-full justify-start rounded-xl">
              <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="size-4 text-primary" />
                {t.account.contact}
              </a>
            </Button>
          </div>
        )}

        <Accordion
          type="single"
          collapsible
          className="mt-6 rounded-2xl border border-border bg-card px-4"
        >
          <AccordionItem value="about">
            <AccordionTrigger className="text-sm">
              <span className="flex items-center gap-2">
                <Info className="size-4 text-primary" /> {t.account.about}
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground">
              {t.account.aboutText}
              <span className="mt-2 block text-xs">{t.account.tmdbNotice}</span>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="legal" className="border-b-0">
            <AccordionTrigger className="text-sm">
              <span className="flex items-center gap-2">
                <FileText className="size-4 text-primary" /> {t.account.legal}
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground">
              {t.account.legalText}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </main>
      <BottomNav />
    </div>
  );
}

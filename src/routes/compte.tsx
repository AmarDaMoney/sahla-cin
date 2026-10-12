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
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/compte")({
  head: () => ({
    meta: [
      { title: "Mon compte — BookCinéDZ" },
      {
        name: "description",
        content:
          "Gérez votre compte BookCinéDZ, accédez aux espaces contributeur, administrateur et au contrôle des billets.",
      },
      { property: "og:title", content: "Mon compte — BookCinéDZ" },
      { property: "og:description", content: "Compte, rôles et informations légales." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Account,
});

function Account() {
  const { user, roles, isAdmin, isContributor, isAgent, signOut } = useAuth();

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
              <Button variant="outline" className="mt-4 w-full rounded-xl" onClick={() => signOut()}>
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

        <div className="mt-4">
          <Button asChild variant="outline" className="w-full justify-start rounded-xl">
            <a href="https://wa.me/213000000000" target="_blank" rel="noopener noreferrer">
              <MessageCircle className="size-4 text-primary" />
              Signaler une erreur sur WhatsApp
            </a>
          </Button>
        </div>

        <Accordion type="single" collapsible className="mt-6 rounded-2xl border border-border bg-card px-4">
          <AccordionItem value="about">
            <AccordionTrigger className="text-sm">
              <span className="flex items-center gap-2">
                <Info className="size-4 text-primary" /> À propos
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground">
              BookCinéDZ centralise le programme des salles de cinéma algériennes et la réservation
              de billets. Les programmes sont saisis par les cinémas partenaires puis validés par
              notre équipe avant publication.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="legal" className="border-b-0">
            <AccordionTrigger className="text-sm">
              <span className="flex items-center gap-2">
                <FileText className="size-4 text-primary" /> Mentions légales
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground">
              Les billets réservés sont nominatifs et valables uniquement pour la séance indiquée.
              Un billet déjà scanné ne peut plus être réutilisé. Les données personnelles sont
              utilisées uniquement pour la gestion des réservations.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </main>
      <BottomNav />
    </div>
  );
}

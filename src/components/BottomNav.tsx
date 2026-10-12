import { Link } from "@tanstack/react-router";
import { Clapperboard, Building2, Ticket, User } from "lucide-react";
import { t } from "@/lib/i18n";

const tabs = [
  { to: "/", label: t.nav.movies, Icon: Clapperboard },
  { to: "/cinemas", label: t.nav.cinemas, Icon: Building2 },
  { to: "/tickets", label: t.nav.tickets, Icon: Ticket },
  { to: "/compte", label: t.nav.account, Icon: User },
] as const;

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="mx-auto flex max-w-3xl items-stretch">
        {tabs.map(({ to, label, Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: to === "/" }}
            className="flex flex-1 flex-col items-center gap-1 py-3 text-xs text-muted-foreground transition-colors hover:text-foreground"
            activeProps={{ className: "!text-primary" }}
          >
            <Icon className="size-5" />
            {label}
          </Link>
        ))}
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}

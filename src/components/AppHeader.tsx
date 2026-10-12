import { Link } from "@tanstack/react-router";
import { Clapperboard } from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export function AppHeader({ right }: { right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3">
        <Link to="/" className="flex min-w-0 items-center gap-2" dir="ltr">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary shadow-[var(--shadow-glow)]">
            <Clapperboard className="size-5 text-primary-foreground" />
          </span>
          <span className="truncate text-lg font-bold tracking-tight max-[360px]:hidden">
            Book<span className="text-primary">Ciné</span>DZ
          </span>
        </Link>
        <div className="flex min-w-0 items-center gap-2">
          {right}
          <LanguageSwitcher />
        </div>
      </div>
    </header>
  );
}

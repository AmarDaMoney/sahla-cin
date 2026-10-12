import { Link } from "@tanstack/react-router";
import { Clapperboard } from "lucide-react";

export function AppHeader({ right }: { right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary shadow-[var(--shadow-glow)]">
            <Clapperboard className="size-5 text-primary-foreground" />
          </span>
          <span className="text-lg font-bold tracking-tight">
            Book<span className="text-primary">Ciné</span>DZ
          </span>
        </Link>
        {right}
      </div>
    </header>
  );
}

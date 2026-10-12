import { Languages } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { changeLang, isLang, LANG_NAMES, LANGS, useI18n } from "@/lib/i18n";

export function LanguageSwitcher() {
  const { lang, t } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t.language}
        className="flex h-9 shrink-0 items-center gap-1 rounded-full border border-border bg-card px-2 text-xs font-semibold uppercase text-muted-foreground transition-colors hover:text-foreground"
      >
        <Languages className="size-4 text-primary" />
        <span className="hidden sm:inline">{lang}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={lang}
          onValueChange={(v) => isLang(v) && v !== lang && changeLang(v)}
        >
          {LANGS.map((l) => (
            <DropdownMenuRadioItem key={l} value={l} lang={l} dir={l === "ar" ? "rtl" : "ltr"}>
              {LANG_NAMES[l]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

import { useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";

// Champ mot de passe avec bouton afficher / masquer.
export function PasswordInput({ className = "", ...props }: ComponentProps<typeof Input>) {
  const [visible, setVisible] = useState(false);
  const { t } = useI18n();
  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        dir="ltr"
        className={`pe-10 ${className}`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t.auth.hidePassword : t.auth.showPassword}
        aria-pressed={visible}
        className="absolute inset-y-0 end-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

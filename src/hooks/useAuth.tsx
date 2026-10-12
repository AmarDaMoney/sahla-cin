import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/api";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadRoles = async (user: User | null) => {
      if (!user) {
        if (active) setRoles([]);
        return;
      }
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      if (active) setRoles((data ?? []).map((r) => r.role));
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!active) return;
      setSession(s);
      setLoading(false);
      void loadRoles(s?.user ?? null);
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
      void loadRoles(data.session?.user ?? null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const has = (role: AppRole) => roles.includes(role);

  return {
    session,
    user: session?.user ?? null,
    roles,
    loading,
    has,
    isAdmin: has("admin"),
    isContributor: has("contributeur") || has("admin"),
    isAgent: has("agent_guichet") || has("admin"),
    signOut: () => supabase.auth.signOut(),
  };
}
